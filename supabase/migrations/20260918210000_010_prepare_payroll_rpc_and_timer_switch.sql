/*
# A26 — calcul de paie atomique et bascule de chronomètre

Le client ne peut plus écrire les montants d'un bulletin : `prepare_payroll_period`
reproduit le moteur de pré-paie (simulation CI) et fige le cycle en `prepared`
dans la même transaction.

`switch_project_timer` enregistre le segment en cours puis démarre un autre
projet sans passer par une mise à jour interdite de `started_at`.
*/

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Helpers du moteur de bulletin (équivalent de src/lib/payroll.ts).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.prorate_leave_days(
  p_days numeric,
  p_leave_start date,
  p_leave_end date,
  p_period_start date,
  p_period_end date
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_total integer;
  v_overlap integer;
  v_overlap_start date;
  v_overlap_end date;
BEGIN
  IF p_leave_end < p_leave_start OR p_days IS NULL OR p_days <= 0 THEN
    RETURN 0;
  END IF;
  v_total := (p_leave_end - p_leave_start) + 1;
  IF v_total <= 0 THEN
    RETURN 0;
  END IF;
  v_overlap_start := GREATEST(p_leave_start, p_period_start);
  v_overlap_end := LEAST(p_leave_end, p_period_end);
  IF v_overlap_end < v_overlap_start THEN
    RETURN 0;
  END IF;
  v_overlap := (v_overlap_end - v_overlap_start) + 1;
  RETURN pg_catalog.round(p_days * v_overlap / v_total, 2);
END;
$$;

CREATE OR REPLACE FUNCTION private.rule_elem(p_rules jsonb, p_code text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT elem
  FROM jsonb_array_elements(COALESCE(p_rules, '[]'::jsonb)) AS elem
  WHERE elem->>'code' = p_code
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.rule_numeric(p_rules jsonb, p_code text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_elem jsonb;
  v_value numeric;
BEGIN
  v_elem := private.rule_elem(p_rules, p_code);
  IF v_elem IS NULL THEN
    RAISE EXCEPTION 'Règle de paie manquante : %. Ajoutez-la dans les Paramètres.', p_code;
  END IF;
  v_value := (v_elem->>'value')::numeric;
  IF v_value IS NULL THEN
    RAISE EXCEPTION 'Règle de paie manquante : %. Ajoutez-la dans les Paramètres.', p_code;
  END IF;
  RETURN v_value;
END;
$$;

CREATE OR REPLACE FUNCTION private.payslip_rule_line(
  p_rules jsonb,
  p_pos integer,
  p_category text,
  p_label text,
  p_base numeric,
  p_code text,
  p_amount numeric
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_array(jsonb_build_object(
    'category', p_category,
    'label', p_label,
    'calc_base', pg_catalog.round(p_base, 2),
    'rate', pg_catalog.round(private.rule_numeric(p_rules, p_code), 4),
    'amount', p_amount,
    'rule_code', p_code,
    'rule_version', (private.rule_elem(p_rules, p_code)->>'version')::int,
    'rule_source', private.rule_elem(p_rules, p_code)->>'source',
    'position', p_pos
  ));
$$;

CREATE OR REPLACE FUNCTION private.compute_payslip(
  p_base_salary numeric,
  p_monthly_hours numeric,
  p_worked_hours numeric,
  p_overtime_hours numeric,
  p_unpaid_absence_days numeric,
  p_monthly_calendar_days integer,
  p_bonuses numeric,
  p_rules jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_details jsonb := '[]'::jsonb;
  v_pos integer := 0;
  v_missing numeric;
  v_leave_hours numeric;
  v_deducted numeric;
  v_absence numeric;
  v_base_prorated numeric;
  v_overtime_rate numeric := 125;
  v_ot jsonb;
  v_hourly numeric;
  v_overtime_amount numeric := 0;
  v_gross numeric;
  v_plafond numeric;
  v_taxable numeric;
  v_cnps_employee numeric;
  v_cmu_employee numeric;
  v_net_before numeric;
  v_its numeric := 0;
  v_brackets jsonb;
  v_bracket jsonb;
  v_from numeric;
  v_to numeric;
  v_rate numeric;
  v_slice numeric;
  v_amount numeric;
  v_previous_to numeric := 0;
  v_index integer := 0;
  v_bracket_count integer;
  v_net numeric;
  v_pension_emp numeric;
  v_pf numeric;
  v_at numeric;
  v_rp numeric;
  v_cmu_emp numeric;
  v_fdfp numeric;
  v_fdfp_plan numeric;
  v_employer_cnps numeric;
  v_employer_cmu numeric;
  v_employer_fdfp numeric;
  v_employer_total numeric;
BEGIN
  IF p_base_salary IS NULL OR p_base_salary < 0 THEN
    RAISE EXCEPTION 'Salaire de base invalide.';
  END IF;
  IF p_monthly_hours IS NULL OR p_monthly_hours <= 0 THEN
    RAISE EXCEPTION 'Heures mensuelles invalides.';
  END IF;
  IF p_monthly_calendar_days IS NULL OR p_monthly_calendar_days <= 0 THEN
    RAISE EXCEPTION 'Nombre de jours calendaires invalide.';
  END IF;
  IF p_overtime_hours IS NULL OR p_overtime_hours < 0 THEN
    RAISE EXCEPTION 'Heures supplémentaires invalides.';
  END IF;
  IF p_unpaid_absence_days IS NULL OR p_unpaid_absence_days < 0
     OR p_unpaid_absence_days > p_monthly_calendar_days THEN
    RAISE EXCEPTION 'Nombre de jours d’absence non payée invalide.';
  END IF;
  IF p_bonuses IS NULL OR p_bonuses < 0 THEN
    RAISE EXCEPTION 'Montant des primes invalide.';
  END IF;
  IF p_worked_hours IS NULL OR p_worked_hours < 0 THEN
    RAISE EXCEPTION 'Nombre d’heures travaillées invalide.';
  END IF;

  v_missing := GREATEST(0, p_monthly_hours - p_worked_hours);
  v_leave_hours := p_monthly_hours * p_unpaid_absence_days / p_monthly_calendar_days;
  v_deducted := LEAST(p_monthly_hours, GREATEST(v_missing, v_leave_hours));
  v_absence := pg_catalog.round(p_base_salary * v_deducted / p_monthly_hours, 2);
  v_base_prorated := pg_catalog.round(p_base_salary - v_absence, 2);

  v_details := v_details || jsonb_build_array(jsonb_build_object(
    'category', 'gain',
    'label', 'Salaire de base',
    'calc_base', pg_catalog.round(p_base_salary, 2),
    'rate', NULL,
    'amount', pg_catalog.round(p_base_salary, 2),
    'rule_code', NULL,
    'rule_version', NULL,
    'rule_source', NULL,
    'position', v_pos
  ));
  v_pos := v_pos + 1;

  IF v_absence > 0 THEN
    v_details := v_details || jsonb_build_array(jsonb_build_object(
      'category', 'retenue_salarie',
      'label', CASE
        WHEN v_missing > v_leave_hours THEN
          'Proratisation du temps (' || pg_catalog.round(p_worked_hours, 2)::text
          || ' h / ' || pg_catalog.round(p_monthly_hours, 2)::text || ' h)'
        ELSE
          'Absence non payée (' || p_unpaid_absence_days::text || ' j)'
      END,
      'calc_base', pg_catalog.round(p_base_salary, 2),
      'rate', NULL,
      'amount', v_absence,
      'rule_code', NULL,
      'rule_version', NULL,
      'rule_source', NULL,
      'position', v_pos
    ));
    v_pos := v_pos + 1;
  END IF;

  v_ot := private.rule_elem(p_rules, 'taux_heures_supp');
  IF v_ot IS NOT NULL THEN
    v_overtime_rate := (v_ot->>'value')::numeric;
  END IF;
  v_hourly := p_base_salary / p_monthly_hours;
  v_overtime_amount := pg_catalog.round(v_hourly * p_overtime_hours * (v_overtime_rate / 100), 2);
  IF v_overtime_amount > 0 THEN
    v_details := v_details || jsonb_build_array(jsonb_build_object(
      'category', 'gain',
      'label', 'Heures supplémentaires (' || p_overtime_hours::text || ' h à ' || v_overtime_rate::text || ' %)',
      'calc_base', pg_catalog.round(p_base_salary, 2),
      'rate', pg_catalog.round(v_overtime_rate, 4),
      'amount', v_overtime_amount,
      'rule_code', 'taux_heures_supp',
      'rule_version', CASE WHEN v_ot IS NULL THEN NULL ELSE (v_ot->>'version')::int END,
      'rule_source', CASE WHEN v_ot IS NULL THEN NULL ELSE v_ot->>'source' END,
      'position', v_pos
    ));
    v_pos := v_pos + 1;
  END IF;

  IF p_bonuses > 0 THEN
    v_details := v_details || jsonb_build_array(jsonb_build_object(
      'category', 'gain',
      'label', 'Primes et indemnités',
      'calc_base', NULL,
      'rate', NULL,
      'amount', pg_catalog.round(p_bonuses, 2),
      'rule_code', NULL,
      'rule_version', NULL,
      'rule_source', NULL,
      'position', v_pos
    ));
    v_pos := v_pos + 1;
  END IF;

  v_gross := pg_catalog.round(v_base_prorated + v_overtime_amount + p_bonuses, 2);

  v_plafond := private.rule_numeric(p_rules, 'plafond_mensuel');
  v_taxable := LEAST(v_gross, v_plafond);
  v_cnps_employee := pg_catalog.round(v_taxable * (private.rule_numeric(p_rules, 'cnps_pension_tx_salarie') / 100), 2);
  v_details := v_details || private.payslip_rule_line(
    p_rules, v_pos, 'retenue_salarie',
    'CNPS pension vieillesse (plafonnée)', v_taxable, 'cnps_pension_tx_salarie', v_cnps_employee
  );
  v_pos := v_pos + 1;

  v_cmu_employee := pg_catalog.round(v_gross * (private.rule_numeric(p_rules, 'cmu_tx_salarie') / 100), 2);
  v_details := v_details || private.payslip_rule_line(
    p_rules, v_pos, 'retenue_salarie',
    'CMU (Couverture Maladie Universelle)', v_gross, 'cmu_tx_salarie', v_cmu_employee
  );
  v_pos := v_pos + 1;

  v_net_before := pg_catalog.round(v_gross - v_cnps_employee - v_cmu_employee, 2);

  SELECT COALESCE(jsonb_agg(elem ORDER BY COALESCE((elem->>'bracket_from')::numeric, 0)), '[]'::jsonb)
    INTO v_brackets
  FROM jsonb_array_elements(COALESCE(p_rules, '[]'::jsonb)) AS elem
  WHERE elem->>'category' = 'impot'
    AND elem->>'code' ~ '^its_t[0-9]+_tx$';

  v_bracket_count := jsonb_array_length(v_brackets);
  WHILE v_index < v_bracket_count LOOP
    v_bracket := v_brackets -> v_index;
    v_from := COALESCE((v_bracket->>'bracket_from')::numeric, 0);
    IF v_bracket->>'bracket_to' IS NULL OR btrim(v_bracket->>'bracket_to') IN ('', 'null') THEN
      v_to := NULL;
    ELSE
      v_to := (v_bracket->>'bracket_to')::numeric;
    END IF;
    v_rate := (v_bracket->>'value')::numeric;
    IF v_from < 0 OR v_from < v_previous_to OR v_rate IS NULL OR v_rate < 0
       OR (v_to IS NOT NULL AND v_to <= v_from)
       OR (v_to IS NULL AND v_index <> v_bracket_count - 1) THEN
      RAISE EXCEPTION 'Tranche ITS invalide : %.', v_bracket->>'code';
    END IF;
    v_slice := GREATEST(
      0,
      LEAST(GREATEST(0, v_net_before), COALESCE(v_to, v_net_before)) - v_from
    );
    v_amount := pg_catalog.round(v_slice * (v_rate / 100), 2);
    IF v_to IS NOT NULL THEN
      v_previous_to := v_to;
    END IF;
    IF v_slice > 0 THEN
      v_details := v_details || jsonb_build_array(jsonb_build_object(
        'category', 'impot',
        'label', v_bracket->>'label',
        'calc_base', v_net_before,
        'rate', pg_catalog.round(v_rate, 4),
        'amount', v_amount,
        'rule_code', v_bracket->>'code',
        'rule_version', (v_bracket->>'version')::int,
        'rule_source', v_bracket->>'source',
        'position', v_pos
      ));
      v_pos := v_pos + 1;
    END IF;
    v_its := v_its + v_amount;
    v_index := v_index + 1;
  END LOOP;
  v_its := pg_catalog.round(v_its, 2);
  v_details := v_details || jsonb_build_array(jsonb_build_object(
    'category', 'impot',
    'label', 'Total impôt sur traitements et salaires',
    'calc_base', v_net_before,
    'rate', NULL,
    'amount', v_its,
    'rule_code', NULL,
    'rule_version', NULL,
    'rule_source', NULL,
    'position', v_pos
  ));
  v_pos := v_pos + 1;

  v_net := pg_catalog.round(v_net_before - v_its, 2);

  v_pension_emp := pg_catalog.round(v_taxable * (private.rule_numeric(p_rules, 'cnps_pension_tx_employeur') / 100), 2);
  v_details := v_details || private.payslip_rule_line(
    p_rules, v_pos, 'charge_employeur',
    'CNPS pension vieillesse (plafonnée)', v_taxable, 'cnps_pension_tx_employeur', v_pension_emp
  );
  v_pos := v_pos + 1;

  v_pf := pg_catalog.round(v_gross * (private.rule_numeric(p_rules, 'cnps_pf_tx_employeur') / 100), 2);
  v_details := v_details || private.payslip_rule_line(
    p_rules, v_pos, 'charge_employeur',
    'CNPS prestations familiales', v_gross, 'cnps_pf_tx_employeur', v_pf
  );
  v_pos := v_pos + 1;

  v_at := pg_catalog.round(v_gross * (private.rule_numeric(p_rules, 'cnps_at_tx_employeur') / 100), 2);
  v_details := v_details || private.payslip_rule_line(
    p_rules, v_pos, 'charge_employeur',
    'CNPS accidents du travail', v_gross, 'cnps_at_tx_employeur', v_at
  );
  v_pos := v_pos + 1;

  v_rp := pg_catalog.round(v_gross * (private.rule_numeric(p_rules, 'cnps_rp_tx_employeur') / 100), 2);
  v_details := v_details || private.payslip_rule_line(
    p_rules, v_pos, 'charge_employeur',
    'CNPS risques professionnels', v_gross, 'cnps_rp_tx_employeur', v_rp
  );
  v_pos := v_pos + 1;

  v_cmu_emp := pg_catalog.round(v_gross * (private.rule_numeric(p_rules, 'cmu_tx_employeur') / 100), 2);
  v_details := v_details || private.payslip_rule_line(
    p_rules, v_pos, 'charge_employeur',
    'CMU — part employeur', v_gross, 'cmu_tx_employeur', v_cmu_emp
  );
  v_pos := v_pos + 1;

  v_fdfp := pg_catalog.round(v_gross * (private.rule_numeric(p_rules, 'fdfp_tx_employeur') / 100), 2);
  v_details := v_details || private.payslip_rule_line(
    p_rules, v_pos, 'charge_employeur',
    'FDFP formation professionnelle', v_gross, 'fdfp_tx_employeur', v_fdfp
  );
  v_pos := v_pos + 1;

  v_fdfp_plan := pg_catalog.round(v_gross * (private.rule_numeric(p_rules, 'fdfp_tx_plan') / 100), 2);
  v_details := v_details || private.payslip_rule_line(
    p_rules, v_pos, 'charge_employeur',
    'FDFP plan de développement', v_gross, 'fdfp_tx_plan', v_fdfp_plan
  );

  v_employer_cnps := pg_catalog.round(v_pension_emp + v_pf + v_at + v_rp, 2);
  v_employer_cmu := v_cmu_emp;
  v_employer_fdfp := pg_catalog.round(v_fdfp + v_fdfp_plan, 2);
  v_employer_total := pg_catalog.round(v_employer_cnps + v_employer_cmu + v_employer_fdfp, 2);

  RETURN jsonb_build_object(
    'gross', v_gross,
    'cnpsEmployee', v_cnps_employee,
    'cmuEmployee', v_cmu_employee,
    'its', v_its,
    'net', v_net,
    'employerCnps', v_employer_cnps,
    'employerCmu', v_employer_cmu,
    'employerFdfp', v_employer_fdfp,
    'employerTotal', v_employer_total,
    'details', v_details
  );
END;
$$;

REVOKE ALL ON FUNCTION private.prorate_leave_days(numeric, date, date, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.rule_elem(jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.rule_numeric(jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.payslip_rule_line(jsonb, integer, text, text, numeric, text, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.compute_payslip(numeric, numeric, numeric, numeric, numeric, integer, numeric, jsonb) FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- Préparation atomique d'un cycle (calcul + statut prepared).
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

-- Les montants de bulletin ne sont plus saisissables depuis le client.
DROP POLICY IF EXISTS a26_lines_insert_open ON public.payroll_lines;
DROP POLICY IF EXISTS a26_lines_delete_open ON public.payroll_lines;
DROP POLICY IF EXISTS a26_details_insert_open ON public.payroll_details;
DROP POLICY IF EXISTS a26_details_delete_open ON public.payroll_details;

DROP POLICY IF EXISTS a26_lines_update_transition ON public.payroll_lines;
CREATE POLICY a26_lines_update_transition ON public.payroll_lines
FOR UPDATE TO authenticated
USING (
  private.has_org_role(org_id, ARRAY['admin_rh','approveur_paie']::text[])
  AND status = 'calculated'
  AND private.payroll_period_has_status(org_id, period_id, ARRAY['approved']::text[])
)
WITH CHECK (
  private.has_org_role(org_id, ARRAY['admin_rh','approveur_paie']::text[])
  AND status = 'approved'
  AND private.payroll_period_has_status(org_id, period_id, ARRAY['approved']::text[])
);

-- ---------------------------------------------------------------------------
-- Chronomètre : enregistrement atomique puis bascule de projet.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.record_project_timer_hours(
  p_org uuid,
  p_employee uuid,
  p_project uuid,
  p_note text,
  p_started timestamptz,
  p_finished timestamptz,
  p_timezone text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_timezone text;
  v_cursor timestamptz;
  v_segment_end timestamptz;
  v_work_date date;
  v_seconds numeric;
  v_hours numeric;
  v_entry uuid;
  v_existing_hours numeric;
BEGIN
  v_timezone := COALESCE(NULLIF(p_timezone, ''), 'UTC');
  v_cursor := p_started;
  WHILE v_cursor < p_finished LOOP
    v_work_date := (v_cursor AT TIME ZONE v_timezone)::date;
    v_segment_end := LEAST(
      p_finished,
      ((v_work_date + 1)::timestamp AT TIME ZONE v_timezone)
    );
    v_seconds := GREATEST(0, EXTRACT(EPOCH FROM (v_segment_end - v_cursor)));
    v_hours := pg_catalog.round(v_seconds / 3600, 2);
    IF v_seconds > 0 AND v_hours = 0 THEN
      v_hours := 0.01;
    END IF;

    IF v_hours > 0 THEN
      v_entry := NULL;
      v_existing_hours := NULL;
      SELECT te.id, te.hours INTO v_entry, v_existing_hours
      FROM public.timesheet_entries AS te
      WHERE te.org_id = p_org
        AND te.employee_id = p_employee
        AND te.project_id = p_project
        AND te.work_date = v_work_date
        AND te.status IN ('draft','rejected')
      ORDER BY te.created_at
      LIMIT 1
      FOR UPDATE;

      IF v_entry IS NOT NULL THEN
        IF COALESCE(v_existing_hours, 0) + v_hours > 24 THEN
          RAISE EXCEPTION 'La journée de travail ne peut pas dépasser 24 heures';
        END IF;
        UPDATE public.timesheet_entries AS te
        SET hours = pg_catalog.round(te.hours + v_hours, 2), status = 'draft'
        WHERE te.id = v_entry;
      ELSE
        INSERT INTO public.timesheet_entries
          (org_id, employee_id, project_id, work_date, hours, activity, status)
        VALUES (p_org, p_employee, p_project, v_work_date, v_hours, p_note, 'draft');
      END IF;
    END IF;
    v_cursor := v_segment_end;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_project_timer(p_timer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_org uuid;
  v_employee uuid;
  v_project uuid;
  v_note text;
  v_timezone text;
  v_started timestamptz;
  v_finished timestamptz;
BEGIN
  v_uid := (SELECT auth.uid());
  SELECT pt.org_id, pt.employee_id, pt.project_id, pt.started_at, pt.note, o.timezone
    INTO v_org, v_employee, v_project, v_started, v_note, v_timezone
  FROM public.project_timers AS pt
  JOIN public.orgs AS o ON o.id = pt.org_id
  WHERE pt.id = p_timer_id
  FOR UPDATE OF pt;
  IF v_uid IS NULL OR v_org IS NULL
     OR NOT (private.employee_owned(v_org, v_employee)
       OR private.has_org_role(v_org, ARRAY['admin_rh','manager']::text[])) THEN
    RAISE EXCEPTION 'Chronomètre introuvable ou droit insuffisant';
  END IF;

  v_finished := pg_catalog.clock_timestamp();
  PERFORM private.record_project_timer_hours(
    v_org, v_employee, v_project, v_note, v_started, v_finished, v_timezone
  );
  DELETE FROM public.project_timers AS pt WHERE pt.id = p_timer_id;
  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (v_org, v_uid, 'finalize_project_timer', 'project_timers', p_timer_id::text,
          pg_catalog.jsonb_build_object('finished_at', v_finished));
END;
$$;

CREATE OR REPLACE FUNCTION public.switch_project_timer(p_timer_id uuid, p_project_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_org uuid;
  v_employee uuid;
  v_project uuid;
  v_note text;
  v_timezone text;
  v_started timestamptz;
  v_finished timestamptz;
  v_next uuid;
BEGIN
  v_uid := (SELECT auth.uid());
  SELECT pt.org_id, pt.employee_id, pt.project_id, pt.started_at, pt.note, o.timezone
    INTO v_org, v_employee, v_project, v_started, v_note, v_timezone
  FROM public.project_timers AS pt
  JOIN public.orgs AS o ON o.id = pt.org_id
  WHERE pt.id = p_timer_id
  FOR UPDATE OF pt;
  IF v_uid IS NULL OR v_org IS NULL
     OR NOT (private.employee_owned(v_org, v_employee)
       OR private.has_org_role(v_org, ARRAY['admin_rh','manager']::text[])) THEN
    RAISE EXCEPTION 'Chronomètre introuvable ou droit insuffisant';
  END IF;
  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'Projet manquant';
  END IF;
  IF p_project_id = v_project THEN
    RETURN p_timer_id;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.projects AS p
    WHERE p.id = p_project_id AND p.org_id = v_org AND p.active
  ) THEN
    RAISE EXCEPTION 'Projet introuvable ou inactif';
  END IF;

  v_finished := pg_catalog.clock_timestamp();
  PERFORM private.record_project_timer_hours(
    v_org, v_employee, v_project, v_note, v_started, v_finished, v_timezone
  );
  DELETE FROM public.project_timers AS pt WHERE pt.id = p_timer_id;
  INSERT INTO public.project_timers (org_id, employee_id, project_id, started_at)
  VALUES (v_org, v_employee, p_project_id, v_finished)
  RETURNING id INTO v_next;
  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (
    v_org, v_uid, 'switch_project_timer', 'project_timers', v_next::text,
    pg_catalog.jsonb_build_object('from_project', v_project, 'to_project', p_project_id)
  );
  RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION private.record_project_timer_hours(uuid, uuid, uuid, text, timestamptz, timestamptz, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_project_timer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_project_timer(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.switch_project_timer(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.switch_project_timer(uuid, uuid) TO authenticated;

-- Taux d'heures supplémentaires par défaut (125 %), aligné sur le moteur TS.
INSERT INTO public.payroll_rules
  (org_id, code, label, category, value, bracket_from, bracket_to, effective_from, source)
SELECT o.id, 'taux_heures_supp', 'Taux des heures supplémentaires (SIMULATION)', 'autre',
       125::numeric, NULL::numeric, NULL::numeric, CURRENT_DATE,
       'SIMULATION — à valider par un expert local'
FROM public.orgs AS o
WHERE NOT EXISTS (
  SELECT 1 FROM public.payroll_rules AS pr
  WHERE pr.org_id = o.id AND pr.code = 'taux_heures_supp'
);

CREATE OR REPLACE FUNCTION public.ensure_org_defaults(p_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR NOT private.has_org_role(p_org, ARRAY['admin_rh']::text[])
     OR NOT EXISTS (SELECT 1 FROM public.orgs AS o WHERE o.id = p_org) THEN
    RAISE EXCEPTION 'Droit insuffisant pour initialiser cette organisation';
  END IF;

  INSERT INTO public.departments (org_id, name, code)
  SELECT p_org, d.dname, d.dcode
  FROM (VALUES
    ('Direction', 'DIR'), ('Ressources humaines', 'RH'),
    ('Comptabilité', 'CMP'), ('Opérations', 'OPS')
  ) AS d(dname, dcode)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.departments AS dp
    WHERE dp.org_id = p_org AND dp.code = d.dcode
  );

  INSERT INTO public.leave_types (org_id, code, name, paid, annual_days)
  SELECT p_org, t.tcode, t.tname, t.tpaid, t.tdays
  FROM (VALUES
    ('CAP', 'Congé annuel payé', true, 30.0),
    ('MAL', 'Congé maladie', true, 0.0),
    ('MAT', 'Congé maternité', true, 0.0),
    ('PAT', 'Congé paternité', true, 5.0),
    ('EXC', 'Autorisation exceptionnelle', true, 0.0),
    ('SOL', 'Congé sans solde', false, 0.0)
  ) AS t(tcode, tname, tpaid, tdays)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leave_types AS lt
    WHERE lt.org_id = p_org AND lt.code = t.tcode
  );

  INSERT INTO public.payroll_rules
    (org_id, code, label, category, value, bracket_from, bracket_to, effective_from, source)
  SELECT p_org, r.rcode, r.rlabel, r.rcat, r.rval, r.rfrom, r.rto,
         CURRENT_DATE, 'SIMULATION — à valider par un expert local'
  FROM (VALUES
    ('cnps_pension_tx_salarie', 'CNPS pension vieillesse — part salariale', 'cotisation_salarie', 6.3::numeric, NULL::numeric, NULL::numeric),
    ('cnps_pension_tx_employeur', 'CNPS pension vieillesse — part employeur', 'cotisation_employeur', 7.7::numeric, NULL::numeric, NULL::numeric),
    ('cnps_pf_tx_employeur', 'CNPS prestations familiales — part employeur', 'cotisation_employeur', 5.75::numeric, NULL::numeric, NULL::numeric),
    ('cnps_at_tx_employeur', 'CNPS accidents du travail — part employeur', 'cotisation_employeur', 2.0::numeric, NULL::numeric, NULL::numeric),
    ('cnps_rp_tx_employeur', 'CNPS risques professionnels — part employeur', 'cotisation_employeur', 1.0::numeric, NULL::numeric, NULL::numeric),
    ('fdfp_tx_employeur', 'FDFP formation professionnelle — part employeur', 'cotisation_employeur', 1.4::numeric, NULL::numeric, NULL::numeric),
    ('fdfp_tx_plan', 'FDFP plan de développement — part employeur', 'abarissement', 0.4::numeric, NULL::numeric, NULL::numeric),
    ('cmu_tx_salarie', 'CMU — part salariale', 'cotisation_salarie', 1.0::numeric, NULL::numeric, NULL::numeric),
    ('cmu_tx_employeur', 'CMU — part employeur', 'cotisation_employeur', 4.0::numeric, NULL::numeric, NULL::numeric),
    ('plafond_mensuel', 'Plafond mensuel de cotisation CNPS (SIMULATION)', 'plafond', 70000::numeric, NULL::numeric, NULL::numeric),
    ('smig_mensuel', 'SMIG mensuel ivoirien (SIMULATION)', 'plafond', 75000::numeric, NULL::numeric, NULL::numeric),
    ('taux_heures_supp', 'Taux des heures supplémentaires (SIMULATION)', 'autre', 125::numeric, NULL::numeric, NULL::numeric),
    ('its_t1_tx', 'ITS tranche 1 (0 à 50 000) — taux', 'impot', 0.0::numeric, 0::numeric, 50000::numeric),
    ('its_t2_tx', 'ITS tranche 2 (50 001 à 290 000) — taux', 'impot', 10.0::numeric, 50000::numeric, 290000::numeric),
    ('its_t3_tx', 'ITS tranche 3 (290 001 à 530 000) — taux', 'impot', 15.0::numeric, 290000::numeric, 530000::numeric),
    ('its_t4_tx', 'ITS tranche 4 (au-delà de 530 000) — taux', 'impot', 25.0::numeric, 530000::numeric, NULL::numeric)
  ) AS r(rcode, rlabel, rcat, rval, rfrom, rto)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.payroll_rules AS pr
    WHERE pr.org_id = p_org AND pr.code = r.rcode
  );
END;
$$;
