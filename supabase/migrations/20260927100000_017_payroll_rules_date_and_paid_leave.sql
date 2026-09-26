/*
# A26 — deux corrections du moteur de pré-paie

## 1. Barèmes datés du jour de création de l'organisation
`private.seed_country_rules` créait les règles avec `effective_from = CURRENT_DATE`.
Une organisation créée le 5 octobre ne pouvait donc pas calculer la paie de
septembre (« Règle de paie manquante »). Les barèmes pays étant ceux de 2026,
ils démarrent désormais au 01/01/2026. Les règles déjà créées et jamais
modifiées (une seule version par code) sont recalées sur cette date.

## 2. Congés payés retenus sur le salaire
Quand un salarié pointe, les heures travaillées viennent des pointages. Les
jours de congé payé approuvés n'ayant pas de pointage, ils étaient retirés du
salaire (« Proratisation du temps »). Ils comptent maintenant comme du temps
travaillé : jours de congé payé dans la période × horaire journalier du
contrat (horaire mensuel × 12 / 52 / 5, soit 8 h pour 173,33 h). Le congé sans
solde (SOL) reste retenu comme avant.

## 3. Mois courts ou longs proratisés à tort
Les heures pointées étaient comparées à l'horaire mensuel moyen (173,33 h).
Un salarié présent tous les jours ouvrés à 8 h (168 h sur un mois de 21 jours)
perdait donc du salaire. Les heures pointées (+ congés payés) sont maintenant
rapportées aux heures attendues du mois réel (jours ouvrés du lundi au
vendredi × horaire journalier), puis ramenées à l'horaire mensuel du contrat.
Les jours fériés ne sont pas encore déduits des jours ouvrés.

## Sécurité
Aucune modification de schéma ni de RLS. Fonctions remplacées avec les mêmes
droits. Les bulletins déjà calculés ne changent pas ; seul un nouveau calcul
applique ces règles.
*/

CREATE OR REPLACE FUNCTION private.seed_country_rules(p_org uuid, p_country text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_country = 'NE' THEN
    INSERT INTO public.payroll_rules (org_id, code, label, category, value, bracket_from, bracket_to, effective_from, source)
    SELECT p_org, r.rcode, r.rlabel, r.rcat, r.rval, r.rfrom, r.rto, DATE '2026-01-01',
           'Barème 2026 — décret 2023-449, ANPE 2024, SMIG 2025-607, CGI art. 150 / LF 2026, FAFPA'
    FROM (VALUES
      ('cnps_pension_tx_salarie', 'CNSS pension vieillesse — part salariale', 'cotisation_salarie', 5.25::numeric, NULL::numeric, NULL::numeric),
      ('cnps_pension_tx_employeur', 'CNSS pension vieillesse — part employeur', 'cotisation_employeur', 9.75::numeric, NULL::numeric, NULL::numeric),
      ('cnps_pf_tx_employeur', 'CNSS prestations familiales — part employeur', 'cotisation_employeur', 4.9::numeric, NULL::numeric, NULL::numeric),
      ('cnps_at_tx_employeur', 'CNSS accidents du travail — part employeur', 'cotisation_employeur', 1.75::numeric, NULL::numeric, NULL::numeric),
      ('cnps_rp_tx_employeur', 'ANPE — cotisation employeur', 'cotisation_employeur', 1.0::numeric, NULL::numeric, NULL::numeric),
      ('fdfp_tx_employeur', 'FAFPA taxe d’apprentissage (entreprises nationales)', 'cotisation_employeur', 3.0::numeric, NULL::numeric, NULL::numeric),
      ('fdfp_tx_plan', 'Formation complémentaire — non instituée', 'abarissement', 0::numeric, NULL::numeric, NULL::numeric),
      ('cmu_tx_salarie', 'AMO / RAMU — non prélevée sur la paie privée', 'cotisation_salarie', 0::numeric, NULL::numeric, NULL::numeric),
      ('cmu_tx_employeur', 'AMO / RAMU — non prélevée sur la paie privée', 'cotisation_employeur', 0::numeric, NULL::numeric, NULL::numeric),
      ('plafond_mensuel', 'Plafond mensuel de cotisation CNSS', 'plafond', 500000::numeric, NULL::numeric, NULL::numeric),
      ('plafond_prestations', 'Plafond CNSS PF / AT / ANPE', 'plafond', 500000::numeric, NULL::numeric, NULL::numeric),
      ('smig_mensuel', 'SMIG mensuel nigérien (01/2026)', 'plafond', 42000::numeric, NULL::numeric, NULL::numeric),
      ('taux_heures_supp', 'Majoration heures supplémentaires (%)', 'autre', 125::numeric, NULL::numeric, NULL::numeric),
      ('its_on_gross', 'IUTS assiette = brut (1) ou net social (0)', 'autre', 0::numeric, NULL::numeric, NULL::numeric),
      ('its_t1_tx', 'IUTS / ITS tranche 1 (0 à 25 000) — taux', 'impot', 1::numeric, 0::numeric, 25000::numeric),
      ('its_t2_tx', 'IUTS / ITS tranche 2 (25 001 à 50 000) — taux', 'impot', 2::numeric, 25000::numeric, 50000::numeric),
      ('its_t3_tx', 'IUTS / ITS tranche 3 (50 001 à 100 000) — taux', 'impot', 6::numeric, 50000::numeric, 100000::numeric),
      ('its_t4_tx', 'IUTS / ITS tranche 4 (100 001 à 150 000) — taux', 'impot', 13::numeric, 100000::numeric, 150000::numeric),
      ('its_t5_tx', 'IUTS / ITS tranche 5 (150 001 à 300 000) — taux', 'impot', 25::numeric, 150000::numeric, 300000::numeric),
      ('its_t6_tx', 'IUTS / ITS tranche 6 (300 001 à 400 000) — taux', 'impot', 30::numeric, 300000::numeric, 400000::numeric),
      ('its_t7_tx', 'IUTS / ITS tranche 7 (400 001 à 700 000) — taux', 'impot', 32::numeric, 400000::numeric, 700000::numeric),
      ('its_t8_tx', 'IUTS / ITS tranche 8 (700 001 à 1 000 000) — taux', 'impot', 34::numeric, 700000::numeric, 1000000::numeric),
      ('its_t9_tx', 'IUTS / ITS tranche 9 (au-delà de 1 000 000) — taux', 'impot', 35::numeric, 1000000::numeric, NULL::numeric)
    ) AS r(rcode, rlabel, rcat, rval, rfrom, rto)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.payroll_rules pr
      WHERE pr.org_id = p_org AND pr.code = r.rcode AND pr.active
    );
  ELSE
    INSERT INTO public.payroll_rules (org_id, code, label, category, value, bracket_from, bracket_to, effective_from, source)
    SELECT p_org, r.rcode, r.rlabel, r.rcat, r.rval, r.rfrom, r.rto, DATE '2026-01-01',
           'Barème 2026 — CLEISS CNPS, CGI art. 119 bis, FDFP, décret 2022-986'
    FROM (VALUES
      ('cnps_pension_tx_salarie', 'CNPS pension vieillesse — part salariale', 'cotisation_salarie', 6.3::numeric, NULL::numeric, NULL::numeric),
      ('cnps_pension_tx_employeur', 'CNPS pension vieillesse — part employeur', 'cotisation_employeur', 7.7::numeric, NULL::numeric, NULL::numeric),
      ('cnps_pf_tx_employeur', 'CNPS prestations familiales — part employeur', 'cotisation_employeur', 5.0::numeric, NULL::numeric, NULL::numeric),
      ('cnps_at_tx_employeur', 'CNPS accidents du travail — part employeur (secteur tertiaire)', 'cotisation_employeur', 2.0::numeric, NULL::numeric, NULL::numeric),
      ('cnps_rp_tx_employeur', 'CNPS assurance maternité — part employeur', 'cotisation_employeur', 0.75::numeric, NULL::numeric, NULL::numeric),
      ('fdfp_tx_employeur', 'FDFP taxe additionnelle formation continue', 'cotisation_employeur', 1.2::numeric, NULL::numeric, NULL::numeric),
      ('fdfp_tx_plan', 'FDFP taxe d’apprentissage', 'abarissement', 0.4::numeric, NULL::numeric, NULL::numeric),
      ('cmu_tx_salarie', 'CMU — forfait salarial (XOF / personne)', 'cotisation_salarie', 500::numeric, NULL::numeric, NULL::numeric),
      ('cmu_tx_employeur', 'CMU — forfait employeur (XOF / personne)', 'cotisation_employeur', 500::numeric, NULL::numeric, NULL::numeric),
      ('plafond_mensuel', 'Plafond mensuel CNPS retraite (45 × SMIG)', 'plafond', 3375000::numeric, NULL::numeric, NULL::numeric),
      ('plafond_prestations', 'Plafond CNPS PF / maternité / AT', 'plafond', 70000::numeric, NULL::numeric, NULL::numeric),
      ('smig_mensuel', 'SMIG mensuel ivoirien', 'plafond', 75000::numeric, NULL::numeric, NULL::numeric),
      ('taux_heures_supp', 'Majoration heures supplémentaires (%)', 'autre', 125::numeric, NULL::numeric, NULL::numeric),
      ('its_on_gross', 'ITS assiette = brut (1) ou net social (0)', 'autre', 1::numeric, NULL::numeric, NULL::numeric),
      ('its_t1_tx', 'ITS tranche 1 (0 à 75 000) — taux', 'impot', 0::numeric, 0::numeric, 75000::numeric),
      ('its_t2_tx', 'ITS tranche 2 (75 001 à 240 000) — taux', 'impot', 16::numeric, 75000::numeric, 240000::numeric),
      ('its_t3_tx', 'ITS tranche 3 (240 001 à 800 000) — taux', 'impot', 21::numeric, 240000::numeric, 800000::numeric),
      ('its_t4_tx', 'ITS tranche 4 (800 001 à 2 400 000) — taux', 'impot', 24::numeric, 800000::numeric, 2400000::numeric),
      ('its_t5_tx', 'ITS tranche 5 (2 400 001 à 8 000 000) — taux', 'impot', 28::numeric, 2400000::numeric, 8000000::numeric),
      ('its_t6_tx', 'ITS tranche 6 (au-delà de 8 000 000) — taux', 'impot', 32::numeric, 8000000::numeric, NULL::numeric)
    ) AS r(rcode, rlabel, rcat, rval, rfrom, rto)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.payroll_rules pr
      WHERE pr.org_id = p_org AND pr.code = r.rcode AND pr.active
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.seed_country_rules(uuid, text) FROM PUBLIC, anon;

ALTER FUNCTION private.seed_country_rules(uuid, text) SET search_path = '';

-- Recale les barèmes pays jamais modifiés sur le 01/01/2026.
UPDATE public.payroll_rules AS pr
SET effective_from = DATE '2026-01-01'
WHERE pr.effective_from > DATE '2026-01-01'
  AND pr.source LIKE 'Barème 2026%'
  AND NOT EXISTS (
    SELECT 1 FROM public.payroll_rules AS other
    WHERE other.org_id = pr.org_id AND other.code = pr.code AND other.id <> pr.id
  );

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
  v_paid_leave numeric;
  v_daily numeric;
  v_workdays integer;
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
  SELECT pg_catalog.count(*)::integer INTO v_workdays
  FROM pg_catalog.generate_series(v_start, v_end, INTERVAL '1 day') AS d
  WHERE EXTRACT(ISODOW FROM d) BETWEEN 1 AND 5;

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
      -- Les jours de congé payé approuvés comptent comme du temps travaillé
      -- (sinon l'absence de pointage ces jours-là est retenue sur le salaire).
      SELECT COALESCE(SUM(private.prorate_leave_days(lr.days, lr.start_date, lr.end_date, v_start, v_end)), 0)
        INTO v_paid_leave
      FROM public.leave_requests AS lr
      JOIN public.leave_types AS lt
        ON lt.id = lr.leave_type_id AND lt.org_id = lr.org_id
      WHERE lr.org_id = v_org
        AND lr.employee_id = v_emp.id
        AND lr.status = 'approved'
        AND lr.start_date <= v_end
        AND lr.end_date >= v_start
        AND lt.paid = true
        AND lt.code <> 'SOL';
      -- Heures attendues du mois réel (jours ouvrés lun.–ven. × horaire
      -- journalier) ramenées à l'horaire mensuel du contrat : un mois de
      -- 21 jours pointés à 8 h n'est plus proratisé face aux 173,33 h.
      v_daily := v_contract.monthly_hours * 12 / 52 / 5;
      v_worked := pg_catalog.round(
        (GREATEST(0, v_worked) + COALESCE(v_paid_leave, 0) * v_daily)
          * v_contract.monthly_hours / NULLIF(v_workdays * v_daily, 0),
        2
      );
      v_worked := COALESCE(v_worked, v_contract.monthly_hours);
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
