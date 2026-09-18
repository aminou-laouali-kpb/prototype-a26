/*
# Correction de la fonction de jeu de démonstration (seed_demo_data)

## Résumé
La fonction qui remplit une organisation de démonstration échouait avec
« VALUES lists must all be the same length ». Plusieurs lignes d'insertion
de salariés n'avaient pas le bon nombre de valeurs, le bloc « groupe »
utilisait une variable inexistante (v_ops), certains matricules étaient en
double, et l'insertion des variables de paie omettait la colonne org_id.

## Changements
1. Toutes les lignes de salariés (PME, ONG, Groupe) ont désormais exactement
   le même nombre de valeurs que de colonnes.
2. Le bloc Groupe utilise une sous-requête pour le département OPS au lieu de
   la variable v_ops qui n'était jamais déclarée.
3. Les matricules en double sont renumérotés pour être uniques.
4. L'insertion dans payroll_variables inclut à nouveau org_id.

## Sécurité
Aucune modification de schéma, de RLS ou de politique. Remplacement du corps
d'une fonction SECURITY DEFINER existante uniquement.
*/

CREATE OR REPLACE FUNCTION public.seed_demo_data(p_org uuid, p_kind text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count int;
BEGIN
  IF p_kind NOT IN ('pme','ong','groupe') THEN
    RAISE EXCEPTION 'Type de démonstration inconnu';
  END IF;

  SELECT count(*) INTO v_count FROM public.employees WHERE org_id = p_org;
  IF v_count > 0 THEN RETURN; END IF;

  IF p_kind = 'ong' AND NOT EXISTS (SELECT 1 FROM public.departments WHERE org_id = p_org AND code='PRG') THEN
    INSERT INTO public.departments (org_id, name, code) VALUES (p_org, 'Programmes', 'PRG');
  END IF;

  -- ===== PME — 10 salariés =====
  IF p_kind = 'pme' THEN
    INSERT INTO public.employees (org_id, employee_number, first_name, last_name, gender, phone, department_id, job_title, hire_date, payment_method, mobile_operator, payment_account, email)
    VALUES
      (p_org, 'PME-001', 'Awa', 'KONÉ', 'F', '+225 07 01 10 20 30', (SELECT id FROM public.departments WHERE org_id=p_org AND code='DIR'), 'Directrice générale', now() - interval '4 years', 'bank', NULL, 'CI93 CI15 0123 4567 8901 2345', NULL),
      (p_org, 'PME-002', 'Yao', 'KOFFI', 'M', '+225 05 12 20 30 40', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Responsable logistique', now() - interval '3 years', 'mobile_money', 'Orange Money', '+225 07 41 22 33 44', NULL),
      (p_org, 'PME-003', 'Fatoumata', 'DIABATÉ', 'F', '+225 05 12 34 56 78', (SELECT id FROM public.departments WHERE org_id=p_org AND code='CMP'), 'Comptable', now() - interval '2 years', 'bank', NULL, 'CI93 CI15 0123 4567 8901 2345', NULL),
      (p_org, 'PME-004', 'Ibrahim', 'TRAORÉ', 'M', '+225 05 11 22 33 44', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Chauffeur-livreur', now() - interval '18 months', 'mobile_money', 'Wave', '+225 07 55 66 77 88', NULL),
      (p_org, 'PME-005', 'Adjoua', 'NGUESSAN', 'F', '+225 01 44 55 66 77', (SELECT id FROM public.departments WHERE org_id=p_org AND code='RH'), 'Assistante RH', now() - interval '2 years', 'mobile_money', 'Wave', '+225 01 23 45 67 89', NULL),
      (p_org, 'PME-006', 'Moussa', 'DIABATÉ', 'M', '+225 07 78 12 34 56', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Magasinier', now() - interval '1 year', 'mobile_money', 'MTN MoMo', '+225 07 11 22 33 44', NULL),
      (p_org, 'PME-007', 'Mariam', 'BAKAYOKO', 'F', '+225 05 22 33 44 55', (SELECT id FROM public.departments WHERE org_id=p_org AND code='CMP'), 'Aide-comptable', now() - interval '8 months', 'mobile_money', 'Orange Money', '+225 07 65 43 21 09', NULL),
      (p_org, 'PME-008', 'Serge', 'GNAMIEN', 'M', '+225 05 32 10 98 76', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Commercial', now() - interval '8 months', 'mobile_money', 'Wave', '+225 05 88 77 66 55', NULL),
      (p_org, 'PME-009', 'Léa', 'TANOH', 'F', '+225 01 55 44 33 22', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Assistante commerciale', now() - interval '6 months', 'mobile_money', 'Orange Money', '+225 01 12 34 56 78', NULL),
      (p_org, 'PME-010', 'Aboubacar', 'SYLLA', 'M', '+225 07 22 33 44 55', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Magasinier', now() - interval '3 months', 'cash', NULL, NULL, NULL);
  END IF;

  -- ===== ONG — 12 salariés, 3 projets bailleurs =====
  IF p_kind = 'ong' THEN
    INSERT INTO public.projects (org_id, code, name, funder, active) VALUES
      (p_org, 'P-SANTE', 'Programme santé communautaire', 'Fonds régional santé', true),
      (p_org, 'P-EDU', 'Accès à l''éducation des filles', 'Coopération internationale', true),
      (p_org, 'P-EAU', 'Accès à l''eau potable — Nord', 'Agence de l''eau', true);

    INSERT INTO public.employees (org_id, employee_number, first_name, last_name, gender, phone, department_id, job_title, hire_date, payment_method, mobile_operator, payment_account, email)
    VALUES
      (p_org, 'ONG-001', 'Awa', 'KONÉ', 'F', '+225 07 01 02 03 04', (SELECT id FROM public.departments WHERE org_id=p_org AND code='DIR'), 'Directrice pays', now() - interval '5 years', 'bank', NULL, 'CI93 CI00 1234 5678 9012 3456', 'ong1.demo@tempos.ci'),
      (p_org, 'ONG-002', 'Jean-Marc', 'ZADI', 'M', '+225 05 02 03 04 05', (SELECT id FROM public.departments WHERE org_id=p_org AND code='PRG'), 'Coordinateur programmes', now() - interval '4 years', 'mobile_money', 'Orange Money', '+225 07 88 77 66 55', NULL),
      (p_org, 'ONG-003', 'Salimata', 'OUEDRAOGO', 'F', '+225 01 03 04 05 06', (SELECT id FROM public.departments WHERE org_id=p_org AND code='PRG'), 'Responsable santé', now() - interval '3 years', 'mobile_money', 'Wave', '+225 07 12 34 56 78', NULL),
      (p_org, 'ONG-004', 'Paul', 'AGBÉKO', 'M', '+225 07 03 04 05 06', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Logisticien', now() - interval '4 years', 'mobile_money', 'MTN MoMo', '+225 05 43 21 67 89', NULL),
      (p_org, 'ONG-005', 'Christine', 'AMANI', 'F', '+225 05 04 05 06 07', (SELECT id FROM public.departments WHERE org_id=p_org AND code='CMP'), 'Comptable bailleurs', now() - interval '3 years', 'bank', NULL, 'CI93 CI00 9876 5432 1098 7654', NULL),
      (p_org, 'ONG-006', 'Ousmane', 'CAMARA', 'M', '+225 07 04 05 06 07', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Chauffeur', now() - interval '2 years', 'mobile_money', 'Wave', '+225 01 98 76 54 32', NULL),
      (p_org, 'ONG-007', 'Nadège', 'GOSSIO', 'F', '+225 05 05 06 07 08', (SELECT id FROM public.departments WHERE org_id=p_org AND code='RH'), 'Chargée RH', now() - interval '2 years', 'mobile_money', 'Orange Money', '+225 07 56 47 38 29', NULL),
      (p_org, 'ONG-008', 'Bakary', 'COULIBALY', 'M', '+225 05 06 07 08 09', (SELECT id FROM public.departments WHERE org_id=p_org AND code='PRG'), 'Coordinateur éducation', now() - interval '2 years', 'mobile_money', 'Moov Money', '+225 01 23 45 67 90', NULL),
      (p_org, 'ONG-009', 'Estelle', 'KOUAMÉ', 'F', '+225 01 07 08 09 10', (SELECT id FROM public.departments WHERE org_id=p_org AND code='PRG'), 'Infirmière mobile', now() - interval '1 year', 'mobile_money', 'Wave', '+225 07 11 22 33 44', NULL),
      (p_org, 'ONG-010', 'Modibo', 'SANOGO', 'M', '+225 07 08 09 10 11', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Conducteur', now() - interval '10 months', 'cash', NULL, NULL, NULL),
      (p_org, 'ONG-011', 'Rachelle', 'BÉDIÉ', 'F', '+225 05 08 09 10 11', (SELECT id FROM public.departments WHERE org_id=p_org AND code='PRG'), 'Assistante administrative', now() - interval '9 months', 'mobile_money', 'Orange Money', '+225 07 55 44 33 22', NULL),
      (p_org, 'ONG-012', 'Karim', 'DIARRA', 'M', '+225 07 09 10 11 12', (SELECT id FROM public.departments WHERE org_id=p_org AND code='PRG'), 'Enquêteur terrain', now() - interval '7 months', 'mobile_money', 'MTN MoMo', '+225 05 66 77 88 99', NULL);
  END IF;

  -- ===== Groupe — 18 salariés =====
  IF p_kind = 'groupe' THEN
    INSERT INTO public.employees (org_id, employee_number, first_name, last_name, gender, phone, department_id, job_title, hire_date, payment_method, mobile_operator, payment_account)
    VALUES
      (p_org, 'GRP-001', 'Daniel', 'AKÉ', 'M', '+225 07 10 00 01 02', (SELECT id FROM public.departments WHERE org_id=p_org AND code='DIR'), 'Directeur général', now() - interval '8 years', 'bank', NULL, 'CI93 CI11 1111 2222 3333'),
      (p_org, 'GRP-002', 'Sylvie', 'ANOH', 'F', '+225 05 10 02 03 04', (SELECT id FROM public.departments WHERE org_id=p_org AND code='RH'), 'Directrice des ressources humaines', now() - interval '7 years', 'bank', NULL, 'CI93 CI00 2222 3333 4444'),
      (p_org, 'GRP-003', 'Kwame', 'MENSAH', 'M', '+225 05 11 00 02 03', (SELECT id FROM public.departments WHERE org_id=p_org AND code='DIR'), 'Directeur financier', now() - interval '7 years', 'bank', NULL, 'CI93 CI00 3333 4444 5555 6666'),
      (p_org, 'GRP-004', 'Chantal', 'YAPI', 'F', '+225 01 11 22 33 44', (SELECT id FROM public.departments WHERE org_id=p_org AND code='CMP'), 'Chef comptable', now() - interval '6 years', 'bank', NULL, 'CI93 CI00 4444 5555 6666 7777'),
      (p_org, 'GRP-005', 'Franck', 'ASSAMOI', 'M', '+225 07 12 34 56 78', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Chef d''atelier', now() - interval '6 years', 'mobile_money', 'Orange Money', '+225 07 11 22 33 45'),
      (p_org, 'GRP-006', 'Aminata', 'TOURÉ', 'F', '+225 05 12 34 56 78', (SELECT id FROM public.departments WHERE org_id=p_org AND code='RH'), 'Responsable paie', now() - interval '5 years', 'mobile_money', 'Orange Money', '+225 07 22 33 44 55'),
      (p_org, 'GRP-007', 'Pascal', 'DIBY', 'M', '+225 07 33 44 55 66', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Superviseur production', now() - interval '5 years', 'mobile_money', 'MTN MoMo', '+225 05 33 22 11 00'),
      (p_org, 'GRP-008', 'Bernadette', 'YAO', 'F', '+225 05 44 55 66 77', (SELECT id FROM public.departments WHERE org_id=p_org AND code='CMP'), 'Comptable fournisseurs', now() - interval '5 years', 'bank', NULL, 'CI93 CI00 4444 3333 2222'),
      (p_org, 'GRP-009', 'Ismaël', 'FANTA', 'M', '+225 01 55 66 77 88', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Technicien maintenance', now() - interval '5 years', 'mobile_money', 'Orange Money', '+225 01 66 77 88 99'),
      (p_org, 'GRP-010', 'Céline', 'GBAGUIDI', 'F', '+225 07 66 77 88 99', (SELECT id FROM public.departments WHERE org_id=p_org AND code='CMP'), 'Assistante facturation', now() - interval '4 years', 'mobile_money', 'Wave', '+225 07 33 22 11 00'),
      (p_org, 'GRP-011', 'Paulin', 'SÉRY', 'M', '+225 07 66 77 88 90', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Magasinier principal', now() - interval '4 years', 'mobile_money', 'Orange Money', '+225 07 44 33 22 11'),
      (p_org, 'GRP-012', 'Hadja', 'CAMARA', 'F', '+225 01 77 88 99 00', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Contrôleuse de gestion', now() - interval '4 years', 'bank', NULL, 'CI93 CI00 7777 8888 9999'),
      (p_org, 'GRP-013', 'Émile', 'LOUKOU', 'M', '+225 05 77 88 99 00', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Cariste', now() - interval '3 years', 'mobile_money', 'Orange Money', '+225 07 88 99 00 11'),
      (p_org, 'GRP-014', 'Bintou', 'CISSÉ', 'F', '+225 01 88 99 00 11', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Agent de sécurité', now() - interval '3 years', 'cash', NULL, NULL),
      (p_org, 'GRP-015', 'Roland', 'BILOA', 'M', '+225 05 99 00 11 22', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Chauffeur poids lourd', now() - interval '2 years', 'mobile_money', 'Orange Money', '+225 07 55 66 77 88'),
      (p_org, 'GRP-016', 'Christine', 'ASSI', 'F', '+225 07 99 00 11 22', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Standardiste', now() - interval '18 months', 'mobile_money', 'Wave', '+225 01 10 20 30 40'),
      (p_org, 'GRP-017', 'Souleymane', 'KANTÉ', 'M', '+225 05 00 11 22 33', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Manœuvre', now() - interval '14 months', 'mobile_money', 'MTN MoMo', '+225 05 10 20 30 40'),
      (p_org, 'GRP-018', 'Céline', 'KOFFI', 'F', '+225 01 10 11 22 33', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Hôtesse d''accueil', now() - interval '10 months', 'mobile_money', 'Orange Money', '+225 01 10 11 22 33');
  END IF;

  -- Contrat actuel pour chaque salarié
  INSERT INTO public.contracts (org_id, employee_id, contract_type, start_date, base_salary, monthly_hours, is_current)
  SELECT p_org, e.id,
    CASE WHEN e.hire_date > now() - interval '12 months' AND e.job_title LIKE 'Commercial%' THEN 'CDD' ELSE 'CDI' END,
    COALESCE(e.hire_date, CURRENT_DATE),
    CASE
      WHEN e.job_title LIKE 'Direct%' THEN 1200000::numeric
      WHEN e.job_title LIKE 'Chef%' THEN 550000::numeric
      WHEN e.job_title LIKE 'Responsable%' THEN 480000::numeric
      WHEN e.job_title LIKE 'Coordinateur%' OR e.job_title LIKE 'Chargée%' THEN 420000::numeric
      WHEN e.job_title LIKE 'Comptable%' OR e.job_title LIKE 'Technicien%' THEN 260000::numeric
      WHEN e.job_title LIKE 'Infirmi%' OR e.job_title LIKE 'Enquêteur%' THEN 240000::numeric
      WHEN e.job_title LIKE 'Assistante%' THEN 165000::numeric
      WHEN e.job_title LIKE 'Commercial%' THEN 180000::numeric
      WHEN e.job_title LIKE 'Superviseur%' OR e.job_title LIKE 'Logisticien%' THEN 240000::numeric
      WHEN e.job_title LIKE 'Chauffeur%' OR e.job_title LIKE 'Conducteur%' THEN 130000::numeric
      WHEN e.job_title LIKE 'Magasinier%' OR e.job_title LIKE 'Cariste%' THEN 120000::numeric
      ELSE 95000::numeric
    END,
    173.33, true
  FROM public.employees e
  WHERE e.org_id = p_org
    AND NOT EXISTS (SELECT 1 FROM public.contracts c WHERE c.employee_id = e.id AND c.is_current);

  -- Pointages : 3 dernières semaines
  INSERT INTO public.clock_entries (org_id, employee_id, work_date, clock_in, clock_out, source)
  SELECT p_org, e.id, d.wd,
    d.wd + time '08' + (random() * interval '25 minutes'),
    d.wd + time '17' + (random() * interval '45 minutes'),
    'web'
  FROM public.employees e
  CROSS JOIN LATERAL (
    SELECT (CURRENT_DATE - gs.i)::date AS wd
    FROM generate_series(0, 16) AS gs(i)
    WHERE EXTRACT(ISODOW FROM (CURRENT_DATE - gs.i)) BETWEEN 1 AND 5
  ) d
  WHERE e.org_id = p_org AND e.status = 'active'
    AND NOT EXISTS (SELECT 1 FROM public.clock_entries c WHERE c.employee_id = e.id AND c.work_date = d.wd)
    AND random() < 0.75;

  -- Pointages du jour non clôturés
  INSERT INTO public.clock_entries (org_id, employee_id, work_date, clock_in, source)
  SELECT p_org, e.id, CURRENT_DATE, CURRENT_DATE + time '08:15', 'web'
  FROM public.employees e
  WHERE e.org_id = p_org AND e.status = 'active'
    AND EXTRACT(ISODOW FROM CURRENT_DATE) BETWEEN 1 AND 5
    AND NOT EXISTS (SELECT 1 FROM public.clock_entries c WHERE c.employee_id = e.id AND c.work_date = CURRENT_DATE)
  LIMIT 4;

  -- Feuilles de temps (ONG uniquement)
  IF p_kind = 'ong' THEN
    INSERT INTO public.timesheet_entries (org_id, employee_id, project_id, work_date, hours, activity, status)
    SELECT p_org, e.id, pr.id, d.wd,
      round((3.5 + random() * 4)::numeric, 1),
      'Activité terrain',
      CASE WHEN d.wd < CURRENT_DATE - 7 THEN 'approved' ELSE 'submitted' END
    FROM public.employees e
    CROSS JOIN public.projects pr
    CROSS JOIN LATERAL (
      SELECT (CURRENT_DATE - gs.i)::date AS wd
      FROM generate_series(2, 20) AS gs(i)
      WHERE EXTRACT(ISODOW FROM (CURRENT_DATE - gs.i)) BETWEEN 1 AND 5
    ) d
    WHERE e.org_id = p_org AND e.status = 'active'
      AND pr.org_id = p_org
      AND e.department_id IN (SELECT id FROM public.departments WHERE org_id = p_org AND code IN ('PRG'))
      AND random() < 0.4
    ON CONFLICT DO NOTHING;
  END IF;

  -- Congés
  INSERT INTO public.leave_requests (org_id, employee_id, leave_type_id, start_date, end_date, days, reason, status)
  SELECT p_org, e.id, (SELECT id FROM public.leave_types WHERE org_id = p_org AND code='CAP' LIMIT 1),
         CURRENT_DATE + 10, CURRENT_DATE + 14, 5, 'Congé annuel programmé', 'pending'
  FROM (SELECT id FROM public.employees WHERE org_id = p_org AND status='active' ORDER BY employee_number LIMIT 1) e;

  INSERT INTO public.leave_requests (org_id, employee_id, leave_type_id, start_date, end_date, days, reason, status)
  SELECT p_org, e.id, (SELECT id FROM public.leave_types WHERE org_id = p_org AND code='MAL' LIMIT 1),
         CURRENT_DATE - 2, CURRENT_DATE - 1, 2, 'Certificat médical fourni', 'approved'
  FROM (SELECT id FROM public.employees WHERE org_id = p_org AND status='active' ORDER BY employee_number OFFSET 1 LIMIT 1) e;

  INSERT INTO public.leave_requests (org_id, employee_id, leave_type_id, start_date, end_date, days, reason, status)
  SELECT p_org, e.id, (SELECT id FROM public.leave_types WHERE org_id = p_org AND code='SOL' LIMIT 1),
         CURRENT_DATE + 10, CURRENT_DATE + 17, 6, 'Projet personnel', 'pending'
  FROM (SELECT id FROM public.employees WHERE org_id = p_org AND status='active' ORDER BY employee_number DESC LIMIT 1) e;

  INSERT INTO public.leave_requests (org_id, employee_id, leave_type_id, start_date, end_date, days, reason, status)
  SELECT p_org, e.id, (SELECT id FROM public.leave_types WHERE org_id = p_org AND code='CAP' LIMIT 1),
         CURRENT_DATE - 40, CURRENT_DATE - 31, 9, NULL, 'approved'
  FROM (SELECT id FROM public.employees WHERE org_id = p_org AND status='active' ORDER BY employee_number OFFSET 2 LIMIT 1) e;

  -- Cycle de paie du mois courant
  INSERT INTO public.payroll_periods (org_id, period_year, period_month, status, notes)
  VALUES (p_org, EXTRACT(YEAR FROM now())::int, EXTRACT(MONTH FROM now())::int, 'open',
          'Cycle de démonstration — calculer, puis faire valider par un Approbateur paie.')
  ON CONFLICT (org_id, period_year, period_month) DO NOTHING;

  -- Variables de paie d'exemple
  INSERT INTO public.payroll_variables (org_id, period_id, employee_id, overtime_hours, bonuses, bonus_label, unpaid_absence_days, notes, updated_by)
  SELECT p_org, pp.id, e.id, 8, 50000, 'Prime de rendement', 0, 'Exemple de variable de démonstration', auth.uid()
  FROM public.payroll_periods pp
  JOIN (SELECT id FROM public.employees WHERE org_id = p_org AND status='active' ORDER BY employee_number LIMIT 3) e ON true
  WHERE pp.org_id = p_org AND pp.period_year = EXTRACT(YEAR FROM now())::int AND pp.period_month = EXTRACT(MONTH FROM now())::int
  ON CONFLICT (period_id, employee_id) DO NOTHING;

  -- Traces d'audit
  INSERT INTO public.audit_log (org_id, actor, actor_email, action, entity, details)
  VALUES (p_org, auth.uid(), (SELECT email FROM auth.users WHERE id = auth.uid()),
          'seed_demo', 'employees', jsonb_build_object('kind', p_kind));
END;
$function$;