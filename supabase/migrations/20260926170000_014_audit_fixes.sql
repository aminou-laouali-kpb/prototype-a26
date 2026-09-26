-- A26 — correctifs de l'audit du 26/09/2026
-- 1. Fonctions SECURITY DEFINER rouvertes par 011/012 : droits et search_path.
-- 2. Abonnement : plus d'écriture client, demande de plan via RPC (jamais « actif »).
-- 3. Rôle cabinet : lecture seule alignée sur l'auditeur.
-- 4. Lots de paiement : montant = net du bulletin, cycle calculé au minimum.
-- 5. Cycle : passage « calculé » réservé au calcul, réouverture d'un cycle calculé.
-- 6. Primes : une prime dont le cycle disparaît redevient « validée ».
-- 7. Journal d'audit : le salarié ne journalise que la soumission de ses feuilles.

-- ---------------------------------------------------------------------------
-- 1. Fonctions DEFINER
-- ---------------------------------------------------------------------------

-- Appelées uniquement depuis d'autres fonctions DEFINER (create_org_*, apply_country_pack,
-- create_demo_org) : aucun appel direct du client.
REVOKE ALL ON FUNCTION public.ensure_org_defaults(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.join_org(uuid, text) FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.ensure_org_defaults(uuid) SET search_path = '';
ALTER FUNCTION public.join_org(uuid, text) SET search_path = '';
ALTER FUNCTION private.seed_country_rules(uuid, text) SET search_path = '';
ALTER FUNCTION public.apply_country_pack(uuid, text) SET search_path = '';
ALTER FUNCTION public.create_org_with_defaults(text, text, text) SET search_path = '';
ALTER FUNCTION public.create_org_with_defaults(text, text, text, text) SET search_path = '';
ALTER FUNCTION public.enqueue_notification(uuid, text, text, text, jsonb) SET search_path = '';

-- ---------------------------------------------------------------------------
-- 2. Abonnement
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS a26_subs_admin ON public.org_subscriptions;
REVOKE INSERT, UPDATE, DELETE ON public.org_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.org_subscriptions TO authenticated;

-- Tarifs identiques à src/lib/billing.ts (PLAN_CATALOG).
CREATE OR REPLACE FUNCTION public.request_subscription_plan(p_org uuid, p_plan text)
RETURNS public.org_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_sub public.org_subscriptions;
  v_found boolean;
  v_unit numeric;
  v_floor numeric;
  v_seats integer;
  v_count integer;
  v_amount numeric;
  v_status text;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL OR NOT private.has_org_role(p_org, ARRAY['admin_rh','cabinet']::text[]) THEN
    RAISE EXCEPTION 'Seul l''administrateur RH ou le cabinet peut gérer l''abonnement';
  END IF;

  SELECT * INTO v_sub FROM public.org_subscriptions AS s WHERE s.org_id = p_org FOR UPDATE;
  v_found := FOUND;

  IF p_plan = 'trial' THEN
    IF v_found THEN
      RAISE EXCEPTION 'L''essai gratuit a déjà été utilisé pour cette organisation';
    END IF;
    INSERT INTO public.org_subscriptions
      (org_id, plan, status, trial_ends_at, seats, amount_xof, notes, updated_at)
    VALUES
      (p_org, 'trial', 'trialing', pg_catalog.now() + interval '30 days', 25, 0, 'Essai 30 jours', pg_catalog.now())
    RETURNING * INTO v_sub;
  ELSE
    CASE p_plan
      WHEN 'pme' THEN v_unit := 2500; v_floor := 75000; v_seats := 50;
      WHEN 'groupe' THEN v_unit := 2000; v_floor := 200000; v_seats := 200;
      WHEN 'cabinet' THEN v_unit := 1800; v_floor := 350000; v_seats := 500;
      ELSE RAISE EXCEPTION 'Plan inconnu : %', p_plan;
    END CASE;

    SELECT count(*) INTO v_count
    FROM public.employees AS e
    WHERE e.org_id = p_org AND e.status = 'active';
    v_amount := GREATEST(v_floor, LEAST(v_count, v_seats) * v_unit);

    -- Un plan payant n'est jamais activé ici : l'activation suit la réception du paiement.
    v_status := CASE
      WHEN v_found AND v_sub.status = 'active' THEN 'active'
      WHEN v_found AND v_sub.trial_ends_at > pg_catalog.now() THEN 'trialing'
      ELSE 'past_due'
    END;

    INSERT INTO public.org_subscriptions
      (org_id, plan, status, trial_ends_at, seats, amount_xof, notes, updated_at)
    VALUES
      (p_org, p_plan, v_status, NULL, v_seats, v_amount,
       'Plan demandé depuis le portail — activation après paiement Mobile Money / virement XOF.',
       pg_catalog.now())
    ON CONFLICT (org_id) DO UPDATE
      SET plan = EXCLUDED.plan,
          status = EXCLUDED.status,
          seats = EXCLUDED.seats,
          amount_xof = EXCLUDED.amount_xof,
          notes = EXCLUDED.notes,
          updated_at = EXCLUDED.updated_at
    RETURNING * INTO v_sub;
  END IF;

  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (
    p_org, v_uid, 'request_plan', 'org_subscriptions', p_org::text,
    pg_catalog.jsonb_build_object('plan', p_plan, 'status', v_sub.status, 'amount_xof', v_sub.amount_xof, 'employees', v_count)
  );
  RETURN v_sub;
END;
$$;

REVOKE ALL ON FUNCTION public.request_subscription_plan(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_subscription_plan(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Cabinet : mêmes lectures que l'auditeur
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.schemaname, p.tablename, p.policyname, p.qual
    FROM pg_catalog.pg_policies AS p
    WHERE p.schemaname = 'public'
      AND p.cmd = 'SELECT'
      AND p.qual LIKE '%''auditeur''::text%'
      AND p.qual NOT LIKE '%''cabinet''%'
  LOOP
    EXECUTE pg_catalog.format(
      'ALTER POLICY %I ON %I.%I USING (%s)',
      r.policyname, r.schemaname, r.tablename,
      pg_catalog.replace(r.qual, '''auditeur''::text', '''auditeur''::text, ''cabinet''::text')
    );
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Lots de paiement
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.guard_payment_batch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org uuid;
  v_status text;
BEGIN
  IF private.is_demo_reset() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.org_id IS DISTINCT FROM OLD.org_id OR NEW.period_id IS DISTINCT FROM OLD.period_id THEN
      RAISE EXCEPTION 'Le cycle d''un lot de paiement est immuable';
    END IF;
    RETURN NEW;
  END IF;
  SELECT pp.org_id, pp.status INTO v_org, v_status
  FROM public.payroll_periods AS pp
  WHERE pp.id = NEW.period_id;
  IF v_org IS DISTINCT FROM NEW.org_id OR v_status NOT IN ('prepared', 'approved', 'locked') THEN
    RAISE EXCEPTION 'Un lot de paiement exige un cycle calculé de la même organisation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a26_guard_payment_batch ON public.payment_batches;
CREATE TRIGGER a26_guard_payment_batch
BEFORE INSERT OR UPDATE ON public.payment_batches
FOR EACH ROW EXECUTE FUNCTION private.guard_payment_batch();

CREATE OR REPLACE FUNCTION private.guard_payment_batch_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch_org uuid;
  v_batch_period uuid;
  v_net numeric;
  v_employee uuid;
  v_line_period uuid;
BEGIN
  IF private.is_demo_reset() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.payroll_line_id IS DISTINCT FROM OLD.payroll_line_id
       OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
       OR NEW.batch_id IS DISTINCT FROM OLD.batch_id
       OR NEW.org_id IS DISTINCT FROM OLD.org_id THEN
      RAISE EXCEPTION 'Le montant et le bénéficiaire d''une ligne de paiement sont immuables';
    END IF;
    RETURN NEW;
  END IF;

  SELECT b.org_id, b.period_id INTO v_batch_org, v_batch_period
  FROM public.payment_batches AS b
  WHERE b.id = NEW.batch_id;
  SELECT l.net, l.employee_id, l.period_id INTO v_net, v_employee, v_line_period
  FROM public.payroll_lines AS l
  WHERE l.id = NEW.payroll_line_id AND l.org_id = NEW.org_id;

  IF v_batch_org IS DISTINCT FROM NEW.org_id
     OR v_net IS NULL
     OR v_line_period IS DISTINCT FROM v_batch_period
     OR v_employee IS DISTINCT FROM NEW.employee_id THEN
    RAISE EXCEPTION 'La ligne de paiement doit correspondre à un bulletin du cycle du lot';
  END IF;
  NEW.amount := v_net;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a26_guard_payment_batch_line ON public.payment_batch_lines;
CREATE TRIGGER a26_guard_payment_batch_line
BEFORE INSERT OR UPDATE ON public.payment_batch_lines
FOR EACH ROW EXECUTE FUNCTION private.guard_payment_batch_line();

-- ---------------------------------------------------------------------------
-- 5. Cycle de paie : transitions réservées aux RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.guard_payroll_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_rpc text;
BEGIN
  v_uid := (SELECT auth.uid());
  v_rpc := COALESCE(pg_catalog.current_setting('app.a26_rpc', true), '');

  IF TG_OP = 'INSERT' THEN
    IF v_uid IS NULL
       OR NOT private.has_org_role(NEW.org_id, ARRAY['admin_rh','preparateur']::text[])
       OR NEW.status <> 'open'
       OR NEW.prepared_by IS NOT NULL
       OR NEW.prepared_at IS NOT NULL
       OR NEW.approved_by IS NOT NULL
       OR NEW.approved_at IS NOT NULL THEN
      RAISE EXCEPTION 'Un cycle doit être créé ouvert par la paie ou l''administration RH';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF private.is_demo_reset() THEN
      RETURN OLD;
    END IF;
    IF OLD.status <> 'open'
       OR v_uid IS NULL
       OR NOT private.has_org_role(OLD.org_id, ARRAY['admin_rh']::text[]) THEN
      RAISE EXCEPTION 'Seul un cycle ouvert peut être supprimé';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.period_year IS DISTINCT FROM OLD.period_year
     OR NEW.period_month IS DISTINCT FROM OLD.period_month
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Les clés et la date de création d''un cycle sont immuables';
  END IF;

  IF private.is_demo_reset() THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'locked' THEN
    RAISE EXCEPTION 'Un cycle verrouillé est immuable';
  END IF;

  IF OLD.status = 'open' AND NEW.status = 'open' THEN
    IF v_uid IS NULL OR NOT private.has_org_role(OLD.org_id, ARRAY['admin_rh','preparateur']::text[]) THEN
      RAISE EXCEPTION 'Droit insuffisant pour modifier un cycle ouvert';
    END IF;
    IF NEW.prepared_by IS DISTINCT FROM OLD.prepared_by
       OR NEW.prepared_at IS DISTINCT FROM OLD.prepared_at
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
      RAISE EXCEPTION 'Les acteurs de validation ne peuvent pas être saisis avant la transition';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'open' AND NEW.status = 'prepared' THEN
    IF v_rpc <> 'prepare' THEN
      RAISE EXCEPTION 'Un cycle ne passe « calculé » que par le calcul de pré-paie';
    END IF;
    IF v_uid IS NULL
       OR NOT private.has_org_role(OLD.org_id, ARRAY['admin_rh','preparateur']::text[])
       OR NEW.prepared_by IS DISTINCT FROM v_uid
       OR NEW.prepared_at IS NULL
       OR NEW.approved_by IS NOT NULL
       OR NEW.approved_at IS NOT NULL THEN
      RAISE EXCEPTION 'La préparation doit être atomique et portée par son auteur';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'prepared' AND NEW.status = 'open' THEN
    IF v_rpc <> 'reopen'
       OR v_uid IS NULL
       OR NOT private.has_org_role(OLD.org_id, ARRAY['admin_rh','preparateur']::text[])
       OR NEW.prepared_by IS NOT NULL
       OR NEW.prepared_at IS NOT NULL
       OR NEW.approved_by IS NOT NULL
       OR NEW.approved_at IS NOT NULL THEN
      RAISE EXCEPTION 'Un cycle calculé ne se rouvre que par la réouverture dédiée';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'prepared' AND NEW.status = 'approved' THEN
    IF v_uid IS NULL
       OR NOT private.has_org_role(OLD.org_id, ARRAY['admin_rh','approveur_paie']::text[])
       OR OLD.prepared_by IS NULL
       OR OLD.prepared_by = v_uid
       OR NEW.approved_by IS DISTINCT FROM v_uid
       OR NEW.approved_at IS NULL
       OR NEW.prepared_by IS DISTINCT FROM OLD.prepared_by
       OR NEW.prepared_at IS DISTINCT FROM OLD.prepared_at THEN
      RAISE EXCEPTION 'L''approbation exige un approbateur distinct du préparateur';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'approved' AND NEW.status = 'locked' THEN
    IF v_uid IS NULL
       OR NOT private.has_org_role(OLD.org_id, ARRAY['admin_rh']::text[])
       OR NEW.prepared_by IS DISTINCT FROM OLD.prepared_by
       OR NEW.prepared_at IS DISTINCT FROM OLD.prepared_at
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
      RAISE EXCEPTION 'Seul l''administration RH peut verrouiller une paie approuvée';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Transition de cycle de paie interdite';
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_payroll_period(p_period_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_org uuid;
  v_status text;
  v_lines integer;
BEGIN
  v_uid := (SELECT auth.uid());
  SELECT pp.org_id, pp.status INTO v_org, v_status
  FROM public.payroll_periods AS pp
  WHERE pp.id = p_period_id
  FOR UPDATE;
  IF v_uid IS NULL OR v_org IS NULL
     OR NOT private.has_org_role(v_org, ARRAY['admin_rh','preparateur']::text[]) THEN
    RAISE EXCEPTION 'Cycle introuvable ou accès refusé';
  END IF;
  IF v_status <> 'prepared' THEN
    RAISE EXCEPTION 'Seul un cycle calculé, pas encore approuvé, peut être rouvert';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.payment_batches AS b
    WHERE b.period_id = p_period_id AND b.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Des lots de paiement existent pour ce cycle : impossible de le rouvrir';
  END IF;

  PERFORM pg_catalog.set_config('app.a26_rpc', 'reopen', true);
  UPDATE public.payroll_periods AS pp
  SET status = 'open', prepared_by = NULL, prepared_at = NULL
  WHERE pp.id = p_period_id;
  PERFORM pg_catalog.set_config('app.a26_rpc', '', true);

  DELETE FROM public.payroll_details AS pd
  WHERE pd.org_id = v_org
    AND pd.line_id IN (SELECT pl.id FROM public.payroll_lines AS pl WHERE pl.period_id = p_period_id);
  DELETE FROM public.payroll_lines AS pl
  WHERE pl.org_id = v_org AND pl.period_id = p_period_id;
  GET DIAGNOSTICS v_lines = ROW_COUNT;

  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (
    v_org, v_uid, 'reopen_payroll', 'payroll_periods', p_period_id::text,
    pg_catalog.jsonb_build_object('bulletins_supprimes', v_lines)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_payroll_period(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_payroll_period(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Primes : cycle supprimé → prime de nouveau « validée »
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.release_orphan_bonus()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.period_id IS NULL AND NEW.status = 'scheduled' THEN
    NEW.status := 'approved';
    NEW.updated_at := pg_catalog.now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a26_release_orphan_bonus ON public.employee_bonuses;
CREATE TRIGGER a26_release_orphan_bonus
BEFORE UPDATE OF period_id ON public.employee_bonuses
FOR EACH ROW EXECUTE FUNCTION private.release_orphan_bonus();

UPDATE public.employee_bonuses
SET status = 'approved', updated_at = now()
WHERE status = 'scheduled' AND period_id IS NULL;

-- ---------------------------------------------------------------------------
-- 7. Journal d'audit
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS a26_audit_insert_member ON public.audit_log;
CREATE POLICY a26_audit_insert_member ON public.audit_log
FOR INSERT TO authenticated
WITH CHECK (
  private.has_org_role(org_id, ARRAY['admin_rh','manager','preparateur','approveur_paie','auditeur','cabinet']::text[])
  OR (
    private.org_member(org_id)
    AND action = 'submit_monthly_sheet'
    AND entity = 'timesheet_entries'
  )
);

-- ---------------------------------------------------------------------------
-- Pré-paie (013) + marqueur de transition
-- ---------------------------------------------------------------------------

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

  PERFORM pg_catalog.set_config('app.a26_rpc', 'prepare', true);
  UPDATE public.payroll_periods AS pp
  SET status = 'prepared', prepared_by = v_uid, prepared_at = pg_catalog.clock_timestamp()
  WHERE pp.id = p_period_id;
  PERFORM pg_catalog.set_config('app.a26_rpc', '', true);

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
