-- A26 — primes annuelles attribuées depuis le portail
-- Attribution RH/manager, versement sur un cycle ouvert, inclusion au brut
-- (ITS/IUTS du mois de paiement). Ne remplace pas les variables mensuelles.

CREATE TABLE IF NOT EXISTS public.employee_bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  year integer NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  kind text NOT NULL DEFAULT 'performance'
    CHECK (kind IN ('performance', '13e_mois', 'autre')),
  label text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'scheduled', 'paid', 'cancelled')),
  period_id uuid REFERENCES public.payroll_periods(id) ON DELETE SET NULL,
  reason text,
  awarded_by uuid,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_bonuses_org_year_idx
  ON public.employee_bonuses (org_id, year, status);
CREATE INDEX IF NOT EXISTS employee_bonuses_employee_idx
  ON public.employee_bonuses (employee_id, year);
CREATE INDEX IF NOT EXISTS employee_bonuses_period_idx
  ON public.employee_bonuses (period_id)
  WHERE period_id IS NOT NULL;

ALTER TABLE public.employee_bonuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS a26_bonuses_select ON public.employee_bonuses;
CREATE POLICY a26_bonuses_select ON public.employee_bonuses
FOR SELECT TO authenticated
USING (
  private.has_org_role(org_id, ARRAY['admin_rh','manager','preparateur','approveur_paie','auditeur','cabinet']::text[])
  OR private.employee_owned(org_id, employee_id)
);

-- Écritures uniquement via RPC (SECURITY DEFINER).
REVOKE INSERT, UPDATE, DELETE ON public.employee_bonuses FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.employee_bonuses TO authenticated;

-- ---------------------------------------------------------------------------
-- Attribuer
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.grant_employee_bonus(
  p_employee uuid,
  p_year integer,
  p_kind text,
  p_label text,
  p_amount numeric,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_org uuid;
  v_status text;
  v_id uuid;
  v_kind text;
  v_label text;
BEGIN
  v_uid := (SELECT auth.uid());
  SELECT e.org_id INTO v_org FROM public.employees AS e WHERE e.id = p_employee;
  IF v_uid IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION 'Salarié introuvable ou accès refusé';
  END IF;
  IF NOT private.has_org_role(v_org, ARRAY['admin_rh','manager','cabinet']::text[]) THEN
    RAISE EXCEPTION 'Seuls le RH, le manager ou le cabinet peuvent attribuer une prime';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Le montant de la prime doit être supérieur à zéro';
  END IF;
  IF p_year IS NULL OR p_year < 2020 OR p_year > 2100 THEN
    RAISE EXCEPTION 'Année de prime invalide';
  END IF;
  v_kind := COALESCE(NULLIF(p_kind, ''), 'performance');
  IF v_kind NOT IN ('performance', '13e_mois', 'autre') THEN
    RAISE EXCEPTION 'Type de prime inconnu';
  END IF;
  v_label := NULLIF(btrim(p_label), '');
  IF v_label IS NULL THEN
    v_label := CASE v_kind
      WHEN '13e_mois' THEN '13e mois'
      WHEN 'autre' THEN 'Prime annuelle'
      ELSE 'Prime annuelle de performance'
    END;
  END IF;
  v_status := CASE
    WHEN private.has_org_role(v_org, ARRAY['admin_rh']::text[]) THEN 'approved'
    ELSE 'draft'
  END;

  INSERT INTO public.employee_bonuses (
    org_id, employee_id, year, kind, label, amount, status, reason, awarded_by, approved_by
  ) VALUES (
    v_org, p_employee, p_year, v_kind, v_label, pg_catalog.round(p_amount, 2), v_status,
    NULLIF(btrim(COALESCE(p_reason, '')), ''),
    v_uid,
    CASE WHEN v_status = 'approved' THEN v_uid ELSE NULL END
  )
  RETURNING id INTO v_id;

  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (
    v_org, v_uid, 'grant_bonus', 'employee_bonuses', v_id::text,
    jsonb_build_object('employee_id', p_employee, 'year', p_year, 'amount', p_amount, 'status', v_status)
  );
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_employee_bonus(p_bonus_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_org uuid;
  v_status text;
BEGIN
  v_uid := (SELECT auth.uid());
  SELECT b.org_id, b.status INTO v_org, v_status
  FROM public.employee_bonuses AS b
  WHERE b.id = p_bonus_id
  FOR UPDATE;
  IF v_uid IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION 'Prime introuvable ou accès refusé';
  END IF;
  IF NOT private.has_org_role(v_org, ARRAY['admin_rh']::text[]) THEN
    RAISE EXCEPTION 'Seul l’administrateur RH peut valider une prime';
  END IF;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Seule une proposition en brouillon peut être validée';
  END IF;
  UPDATE public.employee_bonuses
  SET status = 'approved', approved_by = v_uid, updated_at = now()
  WHERE id = p_bonus_id;
  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (v_org, v_uid, 'approve_bonus', 'employee_bonuses', p_bonus_id::text, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.schedule_employee_bonus(p_bonus_id uuid, p_period_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_org uuid;
  v_status text;
  v_p_org uuid;
  v_p_status text;
BEGIN
  v_uid := (SELECT auth.uid());
  SELECT b.org_id, b.status INTO v_org, v_status
  FROM public.employee_bonuses AS b
  WHERE b.id = p_bonus_id
  FOR UPDATE;
  SELECT pp.org_id, pp.status INTO v_p_org, v_p_status
  FROM public.payroll_periods AS pp
  WHERE pp.id = p_period_id;
  IF v_uid IS NULL OR v_org IS NULL OR v_p_org IS NULL OR v_org <> v_p_org THEN
    RAISE EXCEPTION 'Prime ou cycle introuvable';
  END IF;
  IF NOT private.has_org_role(v_org, ARRAY['admin_rh','preparateur']::text[]) THEN
    RAISE EXCEPTION 'Seuls le RH ou le préparateur peuvent verser une prime sur un cycle';
  END IF;
  IF v_status NOT IN ('approved', 'scheduled') THEN
    RAISE EXCEPTION 'La prime doit être validée avant d’être versée';
  END IF;
  IF v_p_status <> 'open' THEN
    RAISE EXCEPTION 'Le cycle doit être ouvert pour y rattacher une prime';
  END IF;
  UPDATE public.employee_bonuses
  SET period_id = p_period_id, status = 'scheduled', updated_at = now()
  WHERE id = p_bonus_id;
  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (
    v_org, v_uid, 'schedule_bonus', 'employee_bonuses', p_bonus_id::text,
    jsonb_build_object('period_id', p_period_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_employee_bonus(p_bonus_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_org uuid;
  v_status text;
  v_period uuid;
  v_p_status text;
BEGIN
  v_uid := (SELECT auth.uid());
  SELECT b.org_id, b.status, b.period_id INTO v_org, v_status, v_period
  FROM public.employee_bonuses AS b
  WHERE b.id = p_bonus_id
  FOR UPDATE;
  IF v_uid IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION 'Prime introuvable ou accès refusé';
  END IF;
  IF NOT private.has_org_role(v_org, ARRAY['admin_rh']::text[]) THEN
    RAISE EXCEPTION 'Seul l’administrateur RH peut annuler une prime';
  END IF;
  IF v_status = 'paid' THEN
    RAISE EXCEPTION 'Une prime déjà versée ne peut pas être annulée';
  END IF;
  IF v_period IS NOT NULL THEN
    SELECT pp.status INTO v_p_status FROM public.payroll_periods AS pp WHERE pp.id = v_period;
    IF v_p_status IS NOT NULL AND v_p_status <> 'open' THEN
      RAISE EXCEPTION 'Impossible d’annuler : le cycle de versement n’est plus ouvert';
    END IF;
  END IF;
  UPDATE public.employee_bonuses
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_bonus_id;
  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (v_org, v_uid, 'cancel_bonus', 'employee_bonuses', p_bonus_id::text, NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.grant_employee_bonus(uuid, integer, text, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_employee_bonus(uuid, integer, text, text, numeric, text) TO authenticated;
REVOKE ALL ON FUNCTION public.approve_employee_bonus(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_employee_bonus(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.schedule_employee_bonus(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_employee_bonus(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.cancel_employee_bonus(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_employee_bonus(uuid) TO authenticated;

-- DEFINER : employee_bonuses n’autorise aucune écriture directe (REVOKE UPDATE).
CREATE OR REPLACE FUNCTION public.lock_payroll_period(p_period_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_org uuid;
  v_status text;
BEGIN
  v_uid := (SELECT auth.uid());
  SELECT pp.org_id, pp.status INTO v_org, v_status
  FROM public.payroll_periods AS pp
  WHERE pp.id = p_period_id
  FOR UPDATE;
  IF v_uid IS NULL OR v_org IS NULL OR v_status <> 'approved'
     OR NOT private.has_org_role(v_org, ARRAY['admin_rh']::text[]) THEN
    RAISE EXCEPTION 'Seul un administrateur peut verrouiller un cycle approuvé';
  END IF;
  UPDATE public.payroll_periods AS pp
  SET status = 'locked'
  WHERE pp.id = p_period_id;
  UPDATE public.employee_bonuses AS eb
  SET status = 'paid', updated_at = now()
  WHERE eb.org_id = v_org
    AND eb.period_id = p_period_id
    AND eb.status = 'scheduled';
  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (v_org, v_uid, 'lock_payroll', 'payroll_periods', p_period_id::text, NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.lock_payroll_period(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lock_payroll_period(uuid) TO authenticated;

-- Pré-paie : ajouter les primes annuelles planifiées au brut du cycle
CREATE OR REPLACE FUNCTION public.prepare_payroll_period(p_period_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_org uuid;
  v_status text;
  v_year integer;
  v_month integer;
  v_start date;
  v_end date;
  v_days integer;
  v_basis text;
  v_rules jsonb;
  v_emp record;
  v_contract record;
  v_missing text[] := ARRAY[]::text[];
  v_worked numeric;
  v_overtime numeric;
  v_bonuses numeric;
  v_annual numeric;
  v_unpaid numeric;
  v_leave numeric;
  v_result jsonb;
  v_line uuid;
  v_detail jsonb;
  v_fingerprint text;
  v_count integer := 0;
  v_payload jsonb;
BEGIN
  v_uid := (SELECT auth.uid());
  SELECT pp.org_id, pp.status, pp.period_year, pp.period_month
    INTO v_org, v_status, v_year, v_month
  FROM public.payroll_periods AS pp
  WHERE pp.id = p_period_id
  FOR UPDATE;
  IF v_uid IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION 'Cycle introuvable ou accès refusé';
  END IF;
  IF v_status <> 'open'
     OR NOT private.has_org_role(v_org, ARRAY['admin_rh','preparateur']::text[]) THEN
    RAISE EXCEPTION 'Ce cycle est déjà préparé. Il faut l’approuver ou le laisser ouvert avant un nouveau calcul.';
  END IF;

  v_start := make_date(v_year, v_month, 1);
  v_end := (v_start + INTERVAL '1 month - 1 day')::date;
  v_days := EXTRACT(DAY FROM v_end)::integer;

  SELECT COALESCE(os.payroll_time_basis, 'gross') INTO v_basis
  FROM public.org_settings AS os
  WHERE os.org_id = v_org;
  v_basis := COALESCE(v_basis, 'gross');

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'code', r.code,
      'label', r.label,
      'category', r.category,
      'value', r.value,
      'bracket_from', r.bracket_from,
      'bracket_to', r.bracket_to,
      'effective_from', r.effective_from,
      'version', r.version,
      'source', r.source
    )
    ORDER BY r.code
  ), '[]'::jsonb)
    INTO v_rules
  FROM (
    SELECT DISTINCT ON (pr.code)
      pr.code, pr.label, pr.category, pr.value, pr.bracket_from, pr.bracket_to,
      pr.effective_from, pr.version, pr.source
    FROM public.payroll_rules AS pr
    WHERE pr.org_id = v_org
      AND pr.active
      AND pr.effective_from <= v_end
    ORDER BY pr.code, pr.effective_from DESC, pr.version DESC
  ) AS r;

  FOR v_emp IN
    SELECT e.id, e.first_name, e.last_name, e.employee_number
    FROM public.employees AS e
    WHERE e.org_id = v_org AND e.status = 'active'
    ORDER BY e.last_name, e.first_name
  LOOP
    SELECT c.* INTO v_contract
    FROM public.contracts AS c
    WHERE c.org_id = v_org
      AND c.employee_id = v_emp.id
      AND c.start_date <= v_end
      AND (c.end_date IS NULL OR c.end_date >= v_start)
    ORDER BY c.start_date DESC, c.is_current DESC
    LIMIT 1;
    IF NOT FOUND THEN
      v_missing := v_missing || (v_emp.last_name || ' ' || v_emp.first_name || ' (' || v_emp.employee_number || ')');
    END IF;
  END LOOP;
  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'Contrat applicable manquant pour : %.', array_to_string(v_missing, ', ');
  END IF;

  DELETE FROM public.payroll_details AS pd
  WHERE pd.org_id = v_org
    AND pd.line_id IN (SELECT pl.id FROM public.payroll_lines AS pl WHERE pl.period_id = p_period_id);
  DELETE FROM public.payroll_lines AS pl
  WHERE pl.org_id = v_org AND pl.period_id = p_period_id;

  FOR v_emp IN
    SELECT e.id, e.employee_number
    FROM public.employees AS e
    WHERE e.org_id = v_org AND e.status = 'active'
    ORDER BY e.last_name, e.first_name
  LOOP
    SELECT c.* INTO v_contract
    FROM public.contracts AS c
    WHERE c.org_id = v_org
      AND c.employee_id = v_emp.id
      AND c.start_date <= v_end
      AND (c.end_date IS NULL OR c.end_date >= v_start)
    ORDER BY c.start_date DESC, c.is_current DESC
    LIMIT 1;

    SELECT pg_catalog.round(SUM(hours_raw)::numeric, 2) INTO v_worked
    FROM (
      SELECT
        CASE
          WHEN v_basis = 'active' THEN GREATEST(0, COALESCE(ce.active_seconds, 0))::numeric / 3600
          WHEN ce.clock_out IS NOT NULL
               AND ce.clock_out > ce.clock_in
            THEN EXTRACT(EPOCH FROM (ce.clock_out - ce.clock_in))::numeric / 3600
          ELSE 0
        END AS hours_raw
      FROM public.clock_entries AS ce
      WHERE ce.org_id = v_org
        AND ce.employee_id = v_emp.id
        AND ce.work_date BETWEEN v_start AND v_end
    ) AS clocked;
    IF v_worked IS NULL THEN
      v_worked := v_contract.monthly_hours;
    ELSE
      v_worked := GREATEST(0, v_worked);
    END IF;

    SELECT COALESCE(pv.overtime_hours, 0), COALESCE(pv.bonuses, 0), COALESCE(pv.unpaid_absence_days, 0)
      INTO v_overtime, v_bonuses, v_unpaid
    FROM public.payroll_variables AS pv
    WHERE pv.org_id = v_org AND pv.period_id = p_period_id AND pv.employee_id = v_emp.id;
    v_overtime := COALESCE(v_overtime, 0);
    v_bonuses := COALESCE(v_bonuses, 0);
    v_unpaid := COALESCE(v_unpaid, 0);

    SELECT COALESCE(SUM(eb.amount), 0) INTO v_annual
    FROM public.employee_bonuses AS eb
    WHERE eb.org_id = v_org
      AND eb.employee_id = v_emp.id
      AND eb.period_id = p_period_id
      AND eb.status = 'scheduled';
    v_bonuses := pg_catalog.round(v_bonuses + COALESCE(v_annual, 0), 2);

    SELECT COALESCE(SUM(private.prorate_leave_days(lr.days, lr.start_date, lr.end_date, v_start, v_end)), 0)
      INTO v_leave
    FROM public.leave_requests AS lr
    JOIN public.leave_types AS lt
      ON lt.id = lr.leave_type_id AND lt.org_id = lr.org_id
    WHERE lr.org_id = v_org
      AND lr.employee_id = v_emp.id
      AND lr.status = 'approved'
      AND lr.start_date <= v_end
      AND lr.end_date >= v_start
      AND (lt.paid = false OR lt.code = 'SOL');
    v_unpaid := pg_catalog.round((COALESCE(v_leave, 0) + v_unpaid) * 10, 0) / 10;

    v_result := private.compute_payslip(
      v_contract.base_salary,
      v_contract.monthly_hours,
      v_worked,
      v_overtime,
      v_unpaid,
      v_days,
      v_bonuses,
      v_rules
    );

    v_payload := jsonb_build_object(
      'employee_id', v_emp.id,
      'period_id', p_period_id,
      'contract_id', v_contract.id,
      'base_salary', v_contract.base_salary,
      'monthly_hours', v_contract.monthly_hours,
      'worked_hours', v_worked,
      'time_basis', v_basis,
      'overtime_hours', v_overtime,
      'unpaid_absence_days', v_unpaid,
      'bonuses', v_bonuses,
      'result', v_result - 'details'
    );
    v_fingerprint := encode(extensions.digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex');

    INSERT INTO public.payroll_lines (
      org_id, period_id, employee_id, base_salary, worked_hours, overtime_hours,
      unpaid_absence_days, bonuses, gross, cnps_employee, cmu_employee, its, net,
      employer_cnps, employer_cmu, employer_fdfp, employer_total, status, fingerprint
    )
    VALUES (
      v_org, p_period_id, v_emp.id, v_contract.base_salary, v_worked, v_overtime,
      v_unpaid, v_bonuses,
      (v_result->>'gross')::numeric,
      (v_result->>'cnpsEmployee')::numeric,
      (v_result->>'cmuEmployee')::numeric,
      (v_result->>'its')::numeric,
      (v_result->>'net')::numeric,
      (v_result->>'employerCnps')::numeric,
      (v_result->>'employerCmu')::numeric,
      (v_result->>'employerFdfp')::numeric,
      (v_result->>'employerTotal')::numeric,
      'calculated',
      v_fingerprint
    )
    RETURNING id INTO v_line;

    FOR v_detail IN SELECT value FROM jsonb_array_elements(v_result->'details')
    LOOP
      INSERT INTO public.payroll_details (
        org_id, line_id, category, label, calc_base, rate, amount,
        rule_code, rule_version, rule_source, position
      )
      VALUES (
        v_org,
        v_line,
        v_detail->>'category',
        v_detail->>'label',
        NULLIF(v_detail->>'calc_base', '')::numeric,
        NULLIF(v_detail->>'rate', '')::numeric,
        (v_detail->>'amount')::numeric,
        NULLIF(v_detail->>'rule_code', ''),
        NULLIF(v_detail->>'rule_version', '')::int,
        NULLIF(v_detail->>'rule_source', ''),
        COALESCE((v_detail->>'position')::int, 0)
      );
    END LOOP;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.payroll_periods AS pp
  SET status = 'prepared', prepared_by = v_uid, prepared_at = pg_catalog.clock_timestamp()
  WHERE pp.id = p_period_id;

  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (
    v_org, v_uid, 'compute_payroll', 'payroll_periods', p_period_id::text,
    jsonb_build_object('bulletins', v_count, 'period_year', v_year, 'period_month', v_month)
  );

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_payroll_period(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prepare_payroll_period(uuid) TO authenticated;
