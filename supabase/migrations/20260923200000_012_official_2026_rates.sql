/*
# A26 — taux officiels 2026 (Niger + Côte d'Ivoire)

Remplace les simulations 011 par les barèmes sourcés (sept. 2026) :
- NE : CNSS décret 2023-449, ANPE 1 %, plafond 500 000, SMIG 42 000,
  IUTS CGI art. 150 / LF 2026, FAFPA 3 %, AMO = 0.
- CI : CNPS CLEISS 2025, ITS CGI art. 119 bis sur le brut, CMU 500 F,
  plafonds 3 375 000 / 70 000, FDFP 1,2 % + 0,4 %.
- Moteur : forfait CMU si taux >= 100, plafond_prestations, its_on_gross.
- Espaces démo créés en pack Niger.
*/

-- ---------------------------------------------------------------------------
-- Moteur : forfait CMU, double plafond, assiette ITS
-- ---------------------------------------------------------------------------

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
  v_prest jsonb;
  v_taxable_prest numeric;
  v_cnps_employee numeric;
  v_cmu_rate numeric;
  v_cmu_employee numeric;
  v_net_before numeric;
  v_its_elem jsonb;
  v_its_base numeric;
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
  v_cmu_emp_rate numeric;
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
    'category', 'gain', 'label', 'Salaire de base',
    'calc_base', pg_catalog.round(p_base_salary, 2), 'rate', NULL,
    'amount', pg_catalog.round(p_base_salary, 2),
    'rule_code', NULL, 'rule_version', NULL, 'rule_source', NULL, 'position', v_pos
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
      'calc_base', pg_catalog.round(p_base_salary, 2), 'rate', NULL, 'amount', v_absence,
      'rule_code', NULL, 'rule_version', NULL, 'rule_source', NULL, 'position', v_pos
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
      'category', 'gain', 'label', 'Primes et indemnités',
      'calc_base', NULL, 'rate', NULL, 'amount', pg_catalog.round(p_bonuses, 2),
      'rule_code', NULL, 'rule_version', NULL, 'rule_source', NULL, 'position', v_pos
    ));
    v_pos := v_pos + 1;
  END IF;

  v_gross := pg_catalog.round(v_base_prorated + v_overtime_amount + p_bonuses, 2);

  v_plafond := private.rule_numeric(p_rules, 'plafond_mensuel');
  v_taxable := LEAST(v_gross, v_plafond);
  v_prest := private.rule_elem(p_rules, 'plafond_prestations');
  IF v_prest IS NULL THEN
    v_taxable_prest := v_gross;
  ELSE
    v_taxable_prest := LEAST(v_gross, (v_prest->>'value')::numeric);
  END IF;

  v_cnps_employee := pg_catalog.round(v_taxable * (private.rule_numeric(p_rules, 'cnps_pension_tx_salarie') / 100), 2);
  v_details := v_details || private.payslip_rule_line(
    p_rules, v_pos, 'retenue_salarie',
    'Cotisation sociale pension (plafonnée)', v_taxable, 'cnps_pension_tx_salarie', v_cnps_employee
  );
  v_pos := v_pos + 1;

  v_cmu_rate := private.rule_numeric(p_rules, 'cmu_tx_salarie');
  IF v_cmu_rate >= 100 THEN
    v_cmu_employee := pg_catalog.round(v_cmu_rate, 2);
  ELSE
    v_cmu_employee := pg_catalog.round(v_gross * (v_cmu_rate / 100), 2);
  END IF;
  v_details := v_details || private.payslip_rule_line(
    p_rules, v_pos, 'retenue_salarie',
    'Couverture maladie — part salariale',
    CASE WHEN v_cmu_rate >= 100 THEN NULL ELSE v_gross END,
    'cmu_tx_salarie', v_cmu_employee
  );
  v_pos := v_pos + 1;

  v_net_before := pg_catalog.round(v_gross - v_cnps_employee - v_cmu_employee, 2);
  v_its_elem := private.rule_elem(p_rules, 'its_on_gross');
  IF v_its_elem IS NOT NULL AND COALESCE((v_its_elem->>'value')::numeric, 0) >= 1 THEN
    v_its_base := v_gross;
  ELSE
    v_its_base := v_net_before;
  END IF;

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
      LEAST(GREATEST(0, v_its_base), COALESCE(v_to, v_its_base)) - v_from
    );
    v_amount := pg_catalog.round(v_slice * (v_rate / 100), 2);
    IF v_to IS NOT NULL THEN
      v_previous_to := v_to;
    END IF;
    IF v_slice > 0 THEN
      v_details := v_details || jsonb_build_array(jsonb_build_object(
        'category', 'impot',
        'label', v_bracket->>'label',
        'calc_base', v_its_base,
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
    'calc_base', v_its_base, 'rate', NULL, 'amount', v_its,
    'rule_code', NULL, 'rule_version', NULL, 'rule_source', NULL, 'position', v_pos
  ));
  v_pos := v_pos + 1;

  v_net := pg_catalog.round(v_net_before - v_its, 2);

  v_pension_emp := pg_catalog.round(v_taxable * (private.rule_numeric(p_rules, 'cnps_pension_tx_employeur') / 100), 2);
  v_details := v_details || private.payslip_rule_line(
    p_rules, v_pos, 'charge_employeur',
    'Cotisation sociale pension — employeur', v_taxable, 'cnps_pension_tx_employeur', v_pension_emp
  );
  v_pos := v_pos + 1;

  v_pf := pg_catalog.round(v_taxable_prest * (private.rule_numeric(p_rules, 'cnps_pf_tx_employeur') / 100), 2);
  v_details := v_details || private.payslip_rule_line(
    p_rules, v_pos, 'charge_employeur',
    'Prestations familiales — employeur', v_taxable_prest, 'cnps_pf_tx_employeur', v_pf
  );
  v_pos := v_pos + 1;

  v_at := pg_catalog.round(v_taxable_prest * (private.rule_numeric(p_rules, 'cnps_at_tx_employeur') / 100), 2);
  v_details := v_details || private.payslip_rule_line(
    p_rules, v_pos, 'charge_employeur',
    'Accidents du travail — employeur', v_taxable_prest, 'cnps_at_tx_employeur', v_at
  );
  v_pos := v_pos + 1;

  v_rp := pg_catalog.round(v_taxable_prest * (private.rule_numeric(p_rules, 'cnps_rp_tx_employeur') / 100), 2);
  v_details := v_details || private.payslip_rule_line(
    p_rules, v_pos, 'charge_employeur',
    'Cotisation employeur complémentaire', v_taxable_prest, 'cnps_rp_tx_employeur', v_rp
  );
  v_pos := v_pos + 1;

  v_cmu_emp_rate := private.rule_numeric(p_rules, 'cmu_tx_employeur');
  IF v_cmu_emp_rate >= 100 THEN
    v_cmu_emp := pg_catalog.round(v_cmu_emp_rate, 2);
  ELSE
    v_cmu_emp := pg_catalog.round(v_gross * (v_cmu_emp_rate / 100), 2);
  END IF;
  v_details := v_details || private.payslip_rule_line(
    p_rules, v_pos, 'charge_employeur',
    'Couverture maladie — employeur',
    CASE WHEN v_cmu_emp_rate >= 100 THEN NULL ELSE v_gross END,
    'cmu_tx_employeur', v_cmu_emp
  );
  v_pos := v_pos + 1;

  v_fdfp := pg_catalog.round(v_gross * (private.rule_numeric(p_rules, 'fdfp_tx_employeur') / 100), 2);
  v_details := v_details || private.payslip_rule_line(
    p_rules, v_pos, 'charge_employeur',
    'Formation professionnelle — employeur', v_gross, 'fdfp_tx_employeur', v_fdfp
  );
  v_pos := v_pos + 1;

  v_fdfp_plan := pg_catalog.round(v_gross * (private.rule_numeric(p_rules, 'fdfp_tx_plan') / 100), 2);
  v_details := v_details || private.payslip_rule_line(
    p_rules, v_pos, 'charge_employeur',
    'Plan de formation — employeur', v_gross, 'fdfp_tx_plan', v_fdfp_plan
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

REVOKE ALL ON FUNCTION private.compute_payslip(numeric, numeric, numeric, numeric, numeric, integer, numeric, jsonb) FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- Semis des règles 2026
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.seed_country_rules(p_org uuid, p_country text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_country = 'NE' THEN
    INSERT INTO public.payroll_rules (org_id, code, label, category, value, bracket_from, bracket_to, effective_from, source)
    SELECT p_org, r.rcode, r.rlabel, r.rcat, r.rval, r.rfrom, r.rto, CURRENT_DATE,
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
    SELECT p_org, r.rcode, r.rlabel, r.rcat, r.rval, r.rfrom, r.rto, CURRENT_DATE,
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

CREATE OR REPLACE FUNCTION public.ensure_org_defaults(p_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_country text;
BEGIN
  SELECT country_code INTO v_country FROM public.orgs WHERE id = p_org;
  IF v_country IS NULL THEN
    v_country := 'NE';
  END IF;

  INSERT INTO public.departments (org_id, name, code)
  SELECT p_org, d.dname, d.dcode
  FROM (VALUES
    ('Direction', 'DIR'),
    ('Ressources humaines', 'RH'),
    ('Comptabilité', 'CMP'),
    ('Opérations', 'OPS')
  ) AS d(dname, dcode)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.departments dp WHERE dp.org_id = p_org AND dp.code = d.dcode
  );

  IF v_country = 'NE' THEN
    INSERT INTO public.leave_types (org_id, code, name, paid, annual_days)
    SELECT p_org, t.tcode, t.tname, t.tpaid, t.tdays
    FROM (VALUES
      ('CAP', 'Congé annuel payé', true, 30.0),
      ('MAL', 'Congé maladie', true, 0.0),
      ('MAT', 'Congé maternité (14 semaines indicatives)', true, 98.0),
      ('PAT', 'Congé paternité', true, 3.0),
      ('EXC', 'Autorisation exceptionnelle', true, 0.0),
      ('SOL', 'Congé sans solde', false, 0.0)
    ) AS t(tcode, tname, tpaid, tdays)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.leave_types lt WHERE lt.org_id = p_org AND lt.code = t.tcode
    );
  ELSE
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
      SELECT 1 FROM public.leave_types lt WHERE lt.org_id = p_org AND lt.code = t.tcode
    );
  END IF;

  PERFORM private.seed_country_rules(p_org, v_country);

  INSERT INTO public.org_subscriptions (org_id, plan, status, trial_ends_at, seats, amount_xof)
  VALUES (p_org, 'trial', 'trialing', now() + interval '30 days', 25, 0)
  ON CONFLICT (org_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_org_defaults(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ensure_org_defaults(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_country_pack(p_org uuid, p_country text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_country NOT IN ('CI', 'NE') THEN
    RAISE EXCEPTION 'Pack pays inconnu : %', p_country;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = p_org AND m.user_id = auth.uid() AND m.role IN ('admin_rh', 'cabinet')
  ) THEN
    RAISE EXCEPTION 'Droits insuffisants pour changer le pack pays';
  END IF;

  UPDATE public.orgs SET country_code = p_country WHERE id = p_org;

  UPDATE public.payroll_rules
  SET active = false
  WHERE org_id = p_org AND active = true;

  PERFORM private.seed_country_rules(p_org, p_country);
  PERFORM public.ensure_org_defaults(p_org);

  INSERT INTO public.audit_log (org_id, actor, actor_email, action, entity, details)
  VALUES (
    p_org,
    auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    'apply_country_pack',
    'orgs',
    jsonb_build_object('country_code', p_country, 'rates', '2026')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_country_pack(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.apply_country_pack(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_demo_org(p_kind text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_org uuid;
  v_name text;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL OR p_kind NOT IN ('pme','ong','groupe') THEN
    RAISE EXCEPTION 'Type de démonstration inconnu ou utilisateur non authentifié';
  END IF;
  v_name := CASE p_kind
    WHEN 'pme' THEN 'Distribution Sahel SARL'
    WHEN 'ong' THEN 'ONG Horizon Santé Niger'
    ELSE 'Groupe SAHEL Holding'
  END;

  INSERT INTO public.orgs (name, legal_name, ncc, is_demo, demo_kind, country_code)
  VALUES (
    v_name, v_name,
    'SIMU-' || pg_catalog.upper(pg_catalog.left(pg_catalog.md5(pg_catalog.random()::text), 8)),
    true, p_kind, 'NE'
  )
  RETURNING id INTO v_org;
  INSERT INTO public.memberships (org_id, user_id, role)
  VALUES (v_org, v_uid, 'admin_rh');
  PERFORM public.ensure_org_defaults(v_org);
  PERFORM public.seed_demo_data(v_org, p_kind);
  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (v_org, v_uid, 'create_demo_org', 'orgs', v_org::text,
          pg_catalog.jsonb_build_object('kind', p_kind, 'country_code', 'NE'));
  RETURN v_org;
END;
$$;

REVOKE ALL ON FUNCTION public.create_demo_org(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_demo_org(text) TO authenticated;

-- Réapplique les taux 2026 : démo → Niger, autres orgs gardent leur country_code.
UPDATE public.payroll_rules SET active = false WHERE active = true;
UPDATE public.orgs SET country_code = 'NE' WHERE COALESCE(is_demo, false) = true;
UPDATE public.orgs SET country_code = 'NE' WHERE country_code IS NULL;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id, country_code FROM public.orgs LOOP
    PERFORM public.ensure_org_defaults(r.id);
  END LOOP;
END $$;
