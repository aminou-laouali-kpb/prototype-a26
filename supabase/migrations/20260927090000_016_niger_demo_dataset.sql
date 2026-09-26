/*
# A26 — jeu de démonstration Niger prêt pour la vidéo

## Problèmes corrigés
1. La démo PME (et Groupe) ne créait aucun projet : le chronomètre par projet
   affichait « Aucun projet actif ».
2. Le cycle de paie de démonstration portait sur le mois en cours, avec trois
   semaines de pointages à 75 % de présence : la pré-paie proratisait tout le
   monde (−30 à −65 % du salaire de base).
3. Les espaces sont créés en pack Niger mais les salariés avaient des noms,
   téléphones (+225) et IBAN ivoiriens, plus deux fiches « locales » ajoutées
   après coup (12 fiches pour « 10 salariés » annoncés).
4. La démo ONG imputait jusqu'à ~20 h par jour et par personne.
5. Les barèmes démarrant le jour de création de l'espace, le mois précédent ne
   pouvait pas être calculé (« Règle de paie manquante »).
6. La remise à zéro laissait les projets (doublons au rechargement) et
   détachait les comptes manager / salarié de leur fiche.

## Changements
- `seed_demo_data` : salariés nigériens (+227, Airtel / Moov / Zamani, IBAN NE),
  3 projets par type d'espace, cycle de paie sur le **mois précédent**, pointé
  intégralement (hors congés), une journée sans solde approuvée pour montrer une
  retenue explicable, feuilles de temps plafonnées à 8 h / jour et adossées aux
  pointages.
- `reset_demo_data` : supprime aussi les projets.
- `reseed_demo_data` : conserve les rattachements compte ↔ fiche (par matricule).
- `create_demo_org` / `reseed_demo_data` : n'appellent plus
  `seed_niger_local_employees` (les fiches sont désormais toutes nigériennes).

## Sécurité
Aucun changement de schéma ni de politique RLS. Fonctions SECURITY DEFINER
existantes remplacées avec les mêmes droits d'exécution.
*/

CREATE OR REPLACE FUNCTION public.seed_demo_data(p_org uuid, p_kind text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count int;
  v_month_start date := date_trunc('month', CURRENT_DATE)::date;
  v_prev_start date := (date_trunc('month', CURRENT_DATE) - interval '1 month')::date;
  v_prev_end date := (date_trunc('month', CURRENT_DATE) - interval '1 day')::date;
  v_sol_day date;
  v_sol_emp uuid;
  v_projects uuid[];
  v_period uuid;
  v_ts_depts text[];
BEGIN
  IF p_kind NOT IN ('pme','ong','groupe') THEN
    RAISE EXCEPTION 'Type de démonstration inconnu';
  END IF;

  SELECT count(*) INTO v_count FROM public.employees WHERE org_id = p_org;
  IF v_count > 0 THEN RETURN; END IF;

  IF p_kind = 'ong' AND NOT EXISTS (SELECT 1 FROM public.departments WHERE org_id = p_org AND code='PRG') THEN
    INSERT INTO public.departments (org_id, name, code) VALUES (p_org, 'Programmes', 'PRG');
  END IF;

  -- ===== PME — Distribution Sahel SARL (Niamey), 12 salariés =====
  IF p_kind = 'pme' THEN
    INSERT INTO public.employees (org_id, employee_number, first_name, last_name, gender, phone, department_id, job_title, hire_date, payment_method, mobile_operator, payment_account, email)
    VALUES
      (p_org, 'PME-001', 'Mariama', 'HAMANI', 'F', '+227 90 11 20 30', (SELECT id FROM public.departments WHERE org_id=p_org AND code='DIR'), 'Directrice générale', now() - interval '4 years', 'bank', NULL, 'NE58 NE01 2000 1000 0000 1234 56', NULL),
      (p_org, 'PME-002', 'Abdoulaye', 'MOUSSA', 'M', '+227 96 12 20 30', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Responsable logistique', now() - interval '3 years', 'mobile_money', 'Airtel Money', '+227 96 12 20 30', NULL),
      (p_org, 'PME-003', 'Fati', 'ABDOU', 'F', '+227 90 12 34 56', (SELECT id FROM public.departments WHERE org_id=p_org AND code='CMP'), 'Comptable', now() - interval '2 years', 'bank', NULL, 'NE58 NE01 2000 1000 0000 2345 67', NULL),
      (p_org, 'PME-004', 'Issaka', 'GARBA', 'M', '+227 89 11 22 33', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Chauffeur-livreur', now() - interval '18 months', 'mobile_money', 'Moov Money', '+227 89 11 22 33', NULL),
      (p_org, 'PME-005', 'Haoua', 'SOUMANA', 'F', '+227 97 44 55 66', (SELECT id FROM public.departments WHERE org_id=p_org AND code='RH'), 'Assistante RH', now() - interval '2 years', 'mobile_money', 'Airtel Money', '+227 97 44 55 66', NULL),
      (p_org, 'PME-006', 'Oumarou', 'IDRISSA', 'M', '+227 80 78 12 34', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Magasinier', now() - interval '1 year', 'mobile_money', 'Zamani', '+227 80 78 12 34', NULL),
      (p_org, 'PME-007', 'Rakia', 'BOUBACAR', 'F', '+227 96 22 33 44', (SELECT id FROM public.departments WHERE org_id=p_org AND code='CMP'), 'Aide-comptable', now() - interval '8 months', 'mobile_money', 'Airtel Money', '+227 96 22 33 44', NULL),
      (p_org, 'PME-008', 'Salissou', 'MAHAMADOU', 'M', '+227 88 32 10 98', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Commercial', now() - interval '8 months', 'mobile_money', 'Moov Money', '+227 88 32 10 98', NULL),
      (p_org, 'PME-009', 'Zeinabou', 'ALI', 'F', '+227 91 55 44 33', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Assistante commerciale', now() - interval '6 months', 'mobile_money', 'Airtel Money', '+227 91 55 44 33', NULL),
      (p_org, 'PME-010', 'Hamidou', 'YACOUBA', 'M', '+227 99 22 33 44', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Magasinier', now() - interval '3 months', 'cash', NULL, NULL, NULL),
      (p_org, 'PME-011', 'Aïcha', 'AMADOU', 'F', '+227 90 45 67 89', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Responsable commerciale', now() - interval '2 years', 'mobile_money', 'Airtel Money', '+227 90 45 67 89', NULL),
      (p_org, 'PME-012', 'Ibrahim', 'SAIDOU', 'M', '+227 96 55 44 33', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Cariste', now() - interval '18 months', 'mobile_money', 'Airtel Money', '+227 96 55 44 33', NULL);

    INSERT INTO public.projects (org_id, code, name, funder, active) VALUES
      (p_org, 'LIV-NIA', 'Tournées de livraison — Niamey', 'Clientèle grossistes', true),
      (p_org, 'ENT-MAR', 'Entrepôt de Maradi', NULL, true),
      (p_org, 'CTR-MIN', 'Contrat d''approvisionnement — site minier', 'Client grand compte', true);
  END IF;

  -- ===== ONG — ONG Horizon Santé Niger, 12 salariés, 3 projets bailleurs =====
  IF p_kind = 'ong' THEN
    INSERT INTO public.projects (org_id, code, name, funder, active) VALUES
      (p_org, 'P-SANTE', 'Programme santé communautaire — Tillabéri', 'Fonds régional santé', true),
      (p_org, 'P-EDU', 'Accès à l''éducation des filles — Zinder', 'Coopération internationale', true),
      (p_org, 'P-EAU', 'Accès à l''eau potable — Agadez', 'Agence de l''eau', true);

    INSERT INTO public.employees (org_id, employee_number, first_name, last_name, gender, phone, department_id, job_title, hire_date, payment_method, mobile_operator, payment_account, email)
    VALUES
      (p_org, 'ONG-001', 'Hadiza', 'ISSA', 'F', '+227 90 01 02 03', (SELECT id FROM public.departments WHERE org_id=p_org AND code='DIR'), 'Directrice pays', now() - interval '5 years', 'bank', NULL, 'NE58 NE02 3000 2000 0000 1111 22', NULL),
      (p_org, 'ONG-002', 'Moussa', 'DJIBO', 'M', '+227 96 02 03 04', (SELECT id FROM public.departments WHERE org_id=p_org AND code='PRG'), 'Coordinateur programmes', now() - interval '4 years', 'mobile_money', 'Airtel Money', '+227 96 02 03 04', NULL),
      (p_org, 'ONG-003', 'Safiatou', 'HAROUNA', 'F', '+227 97 03 04 05', (SELECT id FROM public.departments WHERE org_id=p_org AND code='PRG'), 'Responsable santé', now() - interval '3 years', 'mobile_money', 'Airtel Money', '+227 97 03 04 05', NULL),
      (p_org, 'ONG-004', 'Adamou', 'SEYNI', 'M', '+227 89 03 04 05', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Logisticien', now() - interval '4 years', 'mobile_money', 'Moov Money', '+227 89 03 04 05', NULL),
      (p_org, 'ONG-005', 'Balkissa', 'OUSMANE', 'F', '+227 90 04 05 06', (SELECT id FROM public.departments WHERE org_id=p_org AND code='CMP'), 'Comptable bailleurs', now() - interval '3 years', 'bank', NULL, 'NE58 NE02 3000 2000 0000 3333 44', NULL),
      (p_org, 'ONG-006', 'Alhassane', 'ABDOU', 'M', '+227 80 04 05 06', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Chauffeur', now() - interval '2 years', 'mobile_money', 'Zamani', '+227 80 04 05 06', NULL),
      (p_org, 'ONG-007', 'Nafissa', 'ILLIASSOU', 'F', '+227 96 05 06 07', (SELECT id FROM public.departments WHERE org_id=p_org AND code='RH'), 'Chargée RH', now() - interval '2 years', 'mobile_money', 'Airtel Money', '+227 96 05 06 07', NULL),
      (p_org, 'ONG-008', 'Boubacar', 'HASSANE', 'M', '+227 88 06 07 08', (SELECT id FROM public.departments WHERE org_id=p_org AND code='PRG'), 'Coordinateur éducation', now() - interval '2 years', 'mobile_money', 'Moov Money', '+227 88 06 07 08', NULL),
      (p_org, 'ONG-009', 'Ramatou', 'KADRI', 'F', '+227 91 07 08 09', (SELECT id FROM public.departments WHERE org_id=p_org AND code='PRG'), 'Infirmière mobile', now() - interval '1 year', 'mobile_money', 'Airtel Money', '+227 91 07 08 09', NULL),
      (p_org, 'ONG-010', 'Souley', 'MAMANE', 'M', '+227 99 08 09 10', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Conducteur', now() - interval '10 months', 'cash', NULL, NULL, NULL),
      (p_org, 'ONG-011', 'Aminatou', 'TAHIROU', 'F', '+227 97 08 09 10', (SELECT id FROM public.departments WHERE org_id=p_org AND code='PRG'), 'Assistante administrative', now() - interval '9 months', 'mobile_money', 'Airtel Money', '+227 97 08 09 10', NULL),
      (p_org, 'ONG-012', 'Ibrahim', 'ADAMOU', 'M', '+227 89 09 10 11', (SELECT id FROM public.departments WHERE org_id=p_org AND code='PRG'), 'Enquêteur terrain', now() - interval '7 months', 'mobile_money', 'Moov Money', '+227 89 09 10 11', NULL);
  END IF;

  -- ===== Groupe — Groupe SAHEL Holding, 18 salariés =====
  IF p_kind = 'groupe' THEN
    INSERT INTO public.employees (org_id, employee_number, first_name, last_name, gender, phone, department_id, job_title, hire_date, payment_method, mobile_operator, payment_account)
    VALUES
      (p_org, 'GRP-001', 'Ali', 'ZAKARI', 'M', '+227 90 10 00 01', (SELECT id FROM public.departments WHERE org_id=p_org AND code='DIR'), 'Directeur général', now() - interval '8 years', 'bank', NULL, 'NE58 NE03 4000 3000 0000 1111 11'),
      (p_org, 'GRP-002', 'Hamsatou', 'SANI', 'F', '+227 90 10 02 03', (SELECT id FROM public.departments WHERE org_id=p_org AND code='RH'), 'Directrice des ressources humaines', now() - interval '7 years', 'bank', NULL, 'NE58 NE03 4000 3000 0000 2222 22'),
      (p_org, 'GRP-003', 'Mahamane', 'LAWALI', 'M', '+227 90 11 00 02', (SELECT id FROM public.departments WHERE org_id=p_org AND code='DIR'), 'Directeur financier', now() - interval '7 years', 'bank', NULL, 'NE58 NE03 4000 3000 0000 3333 33'),
      (p_org, 'GRP-004', 'Fatchima', 'MOUNKAILA', 'F', '+227 90 11 22 33', (SELECT id FROM public.departments WHERE org_id=p_org AND code='CMP'), 'Chef comptable', now() - interval '6 years', 'bank', NULL, 'NE58 NE03 4000 3000 0000 4444 44'),
      (p_org, 'GRP-005', 'Harouna', 'BOUREIMA', 'M', '+227 96 12 34 56', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Chef d''atelier', now() - interval '6 years', 'mobile_money', 'Airtel Money', '+227 96 12 34 56'),
      (p_org, 'GRP-006', 'Kadidiatou', 'HAMIDOU', 'F', '+227 97 12 34 57', (SELECT id FROM public.departments WHERE org_id=p_org AND code='RH'), 'Responsable paie', now() - interval '5 years', 'mobile_money', 'Airtel Money', '+227 97 12 34 57'),
      (p_org, 'GRP-007', 'Yacouba', 'SALEY', 'M', '+227 89 33 44 55', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Superviseur production', now() - interval '5 years', 'mobile_money', 'Moov Money', '+227 89 33 44 55'),
      (p_org, 'GRP-008', 'Habsatou', 'MAÏGA', 'F', '+227 90 44 55 66', (SELECT id FROM public.departments WHERE org_id=p_org AND code='CMP'), 'Comptable fournisseurs', now() - interval '5 years', 'bank', NULL, 'NE58 NE03 4000 3000 0000 5555 55'),
      (p_org, 'GRP-009', 'Nouhou', 'ARZIKA', 'M', '+227 96 55 66 77', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Technicien maintenance', now() - interval '5 years', 'mobile_money', 'Airtel Money', '+227 96 55 66 77'),
      (p_org, 'GRP-010', 'Rahila', 'GAZIBO', 'F', '+227 80 66 77 88', (SELECT id FROM public.departments WHERE org_id=p_org AND code='CMP'), 'Assistante facturation', now() - interval '4 years', 'mobile_money', 'Zamani', '+227 80 66 77 88'),
      (p_org, 'GRP-011', 'Abdourahamane', 'SIDI', 'M', '+227 96 66 77 89', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Magasinier principal', now() - interval '4 years', 'mobile_money', 'Airtel Money', '+227 96 66 77 89'),
      (p_org, 'GRP-012', 'Mariama', 'SEYDOU', 'F', '+227 90 77 88 99', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Contrôleuse de gestion', now() - interval '4 years', 'bank', NULL, 'NE58 NE03 4000 3000 0000 6666 66'),
      (p_org, 'GRP-013', 'Amadou', 'HALIDOU', 'M', '+227 97 77 88 90', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Cariste', now() - interval '3 years', 'mobile_money', 'Airtel Money', '+227 97 77 88 90'),
      (p_org, 'GRP-014', 'Salamatou', 'GOUROUZA', 'F', '+227 99 88 99 00', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Agent de sécurité', now() - interval '3 years', 'cash', NULL, NULL),
      (p_org, 'GRP-015', 'Idrissa', 'ALZOUMA', 'M', '+227 96 99 00 11', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Chauffeur poids lourd', now() - interval '2 years', 'mobile_money', 'Airtel Money', '+227 96 99 00 11'),
      (p_org, 'GRP-016', 'Rabi', 'ABDOULAYE', 'F', '+227 88 99 00 12', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Standardiste', now() - interval '18 months', 'mobile_money', 'Moov Money', '+227 88 99 00 12'),
      (p_org, 'GRP-017', 'Sani', 'ISSAKA', 'M', '+227 89 00 11 22', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Manœuvre', now() - interval '14 months', 'mobile_money', 'Moov Money', '+227 89 00 11 22'),
      (p_org, 'GRP-018', 'Zalika', 'HAMADOU', 'F', '+227 91 10 11 22', (SELECT id FROM public.departments WHERE org_id=p_org AND code='OPS'), 'Hôtesse d''accueil', now() - interval '10 months', 'mobile_money', 'Airtel Money', '+227 91 10 11 22');

    INSERT INTO public.projects (org_id, code, name, funder, active) VALUES
      (p_org, 'ATL-PRD', 'Atelier de production — Niamey', NULL, true),
      (p_org, 'MNT-IND', 'Maintenance industrielle', NULL, true),
      (p_org, 'PRJ-SOL', 'Chantier centrale solaire', 'Client institutionnel', true);
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
      WHEN e.job_title LIKE 'Coordinateur%' OR e.job_title LIKE 'Chargée%' OR e.job_title LIKE 'Contrôleuse%' THEN 420000::numeric
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

  -- Congés (avant les pointages : aucun pointage n'est généré un jour de congé approuvé)
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

  -- Congé annuel déjà pris, avant le mois de paie de démonstration
  INSERT INTO public.leave_requests (org_id, employee_id, leave_type_id, start_date, end_date, days, reason, status)
  SELECT p_org, e.id, (SELECT id FROM public.leave_types WHERE org_id = p_org AND code='CAP' LIMIT 1),
         v_prev_start - 25, v_prev_start - 16, 10, NULL, 'approved'
  FROM (SELECT id FROM public.employees WHERE org_id = p_org AND status='active' ORDER BY employee_number OFFSET 2 LIMIT 1) e;

  -- Une journée sans solde approuvée dans le mois de paie : retenue visible et explicable
  v_sol_day := v_prev_start + 9;
  WHILE EXTRACT(ISODOW FROM v_sol_day) > 5 LOOP
    v_sol_day := v_sol_day + 1;
  END LOOP;
  SELECT id INTO v_sol_emp FROM public.employees
  WHERE org_id = p_org AND status = 'active' AND payment_method = 'cash'
  ORDER BY employee_number LIMIT 1;
  IF v_sol_emp IS NOT NULL THEN
    INSERT INTO public.leave_requests (org_id, employee_id, leave_type_id, start_date, end_date, days, reason, status)
    VALUES (p_org, v_sol_emp, (SELECT id FROM public.leave_types WHERE org_id = p_org AND code='SOL' LIMIT 1),
            v_sol_day, v_sol_day, 1, 'Démarches personnelles', 'approved');
  END IF;

  -- Pointages du mois de paie (mois précédent) : chaque jour ouvré, hors congés approuvés
  INSERT INTO public.clock_entries (org_id, employee_id, work_date, clock_in, clock_out, active_seconds, source)
  SELECT p_org, x.employee_id, x.wd, x.cin, x.cout,
         GREATEST(0, round(EXTRACT(EPOCH FROM (x.cout - x.cin))))::int, 'web'
  FROM (
    SELECT e.id AS employee_id, d.wd,
      d.wd + time '07:45' + (random() * interval '25 minutes') AS cin,
      d.wd + time '17:00' + (random() * interval '40 minutes') AS cout
    FROM public.employees e
    CROSS JOIN LATERAL (
      SELECT gs::date AS wd FROM generate_series(v_prev_start, v_prev_end, interval '1 day') AS gs
      WHERE EXTRACT(ISODOW FROM gs) BETWEEN 1 AND 5
    ) d
    WHERE e.org_id = p_org AND e.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM public.leave_requests lr
        WHERE lr.employee_id = e.id AND lr.status = 'approved'
          AND d.wd BETWEEN lr.start_date AND lr.end_date
      )
  ) x;

  -- Pointages du mois en cours, jusqu'à hier (présence réaliste, hors congés)
  INSERT INTO public.clock_entries (org_id, employee_id, work_date, clock_in, clock_out, active_seconds, source)
  SELECT p_org, x.employee_id, x.wd, x.cin, x.cout,
         GREATEST(0, round(EXTRACT(EPOCH FROM (x.cout - x.cin))))::int, 'web'
  FROM (
    SELECT e.id AS employee_id, d.wd,
      d.wd + time '07:45' + (random() * interval '25 minutes') AS cin,
      d.wd + time '17:00' + (random() * interval '40 minutes') AS cout
    FROM public.employees e
    CROSS JOIN LATERAL (
      SELECT gs::date AS wd FROM generate_series(v_month_start, CURRENT_DATE - 1, interval '1 day') AS gs
      WHERE EXTRACT(ISODOW FROM gs) BETWEEN 1 AND 5
    ) d
    WHERE e.org_id = p_org AND e.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM public.leave_requests lr
        WHERE lr.employee_id = e.id AND lr.status = 'approved'
          AND d.wd BETWEEN lr.start_date AND lr.end_date
      )
      AND random() < 0.92
  ) x;

  -- Pointages du jour non clôturés
  INSERT INTO public.clock_entries (org_id, employee_id, work_date, clock_in, source)
  SELECT p_org, e.id, CURRENT_DATE, CURRENT_DATE + time '08:05', 'web'
  FROM public.employees e
  WHERE e.org_id = p_org AND e.status = 'active'
    AND EXTRACT(ISODOW FROM CURRENT_DATE) BETWEEN 1 AND 5
    AND NOT EXISTS (SELECT 1 FROM public.clock_entries c WHERE c.employee_id = e.id AND c.work_date = CURRENT_DATE)
    AND NOT EXISTS (
      SELECT 1 FROM public.leave_requests lr
      WHERE lr.employee_id = e.id AND lr.status = 'approved'
        AND CURRENT_DATE BETWEEN lr.start_date AND lr.end_date
    )
  LIMIT 8;

  -- Feuilles de temps : un projet par jour pointé, 8 h maximum, pour les équipes terrain
  v_projects := ARRAY(SELECT id FROM public.projects WHERE org_id = p_org AND active ORDER BY code);
  v_ts_depts := CASE WHEN p_kind = 'ong' THEN ARRAY['PRG'] ELSE ARRAY['OPS'] END;
  IF array_length(v_projects, 1) IS NOT NULL THEN
    INSERT INTO public.timesheet_entries (org_id, employee_id, project_id, work_date, hours, activity, status)
    SELECT p_org, ce.employee_id,
      v_projects[1 + ((EXTRACT(DOY FROM ce.work_date)::int + emp.rk) % array_length(v_projects, 1))],
      ce.work_date,
      LEAST(8, round((EXTRACT(EPOCH FROM (ce.clock_out - ce.clock_in)) / 3600 - 1)::numeric * 2) / 2),
      CASE WHEN p_kind = 'ong' THEN 'Activité terrain' ELSE 'Opérations' END,
      CASE WHEN ce.work_date < CURRENT_DATE - 7 THEN 'approved' ELSE 'submitted' END
    FROM public.clock_entries ce
    JOIN (
      SELECT e.id, row_number() OVER (ORDER BY e.employee_number)::int AS rk
      FROM public.employees e
      WHERE e.org_id = p_org AND e.status = 'active'
        AND e.department_id IN (SELECT id FROM public.departments WHERE org_id = p_org AND code = ANY (v_ts_depts))
    ) emp ON emp.id = ce.employee_id
    WHERE ce.org_id = p_org AND ce.clock_out IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;

  -- Les barèmes sont créés « à partir d'aujourd'hui » : on les fait démarrer au
  -- mois de paie de démonstration (règles jamais modifiées uniquement).
  UPDATE public.payroll_rules AS pr
  SET effective_from = v_prev_start
  WHERE pr.org_id = p_org
    AND pr.effective_from > v_prev_start
    AND NOT EXISTS (
      SELECT 1 FROM public.payroll_rules AS other
      WHERE other.org_id = p_org AND other.code = pr.code AND other.id <> pr.id
    );

  -- Cycle de paie de démonstration : mois précédent, entièrement pointé
  INSERT INTO public.payroll_periods (org_id, period_year, period_month, status, notes)
  VALUES (p_org, EXTRACT(YEAR FROM v_prev_start)::int, EXTRACT(MONTH FROM v_prev_start)::int, 'open',
          'Cycle de démonstration — calculer, puis faire valider par un Approbateur paie.')
  ON CONFLICT (org_id, period_year, period_month) DO NOTHING;

  SELECT id INTO v_period FROM public.payroll_periods
  WHERE org_id = p_org
    AND period_year = EXTRACT(YEAR FROM v_prev_start)::int
    AND period_month = EXTRACT(MONTH FROM v_prev_start)::int;

  -- Variables de paie d'exemple
  INSERT INTO public.payroll_variables (org_id, period_id, employee_id, overtime_hours, bonuses, bonus_label, unpaid_absence_days, notes, updated_by)
  SELECT p_org, v_period, e.id, v.overtime, v.bonus, v.label, 0, 'Exemple de variable de démonstration', auth.uid()
  FROM (
    SELECT id, row_number() OVER (ORDER BY employee_number) AS rk
    FROM public.employees WHERE org_id = p_org AND status = 'active'
  ) e
  JOIN (VALUES
    (2, 8::numeric, 0::numeric, NULL::text),
    (4, 0::numeric, 25000::numeric, 'Prime de rendement'),
    (8, 4::numeric, 50000::numeric, 'Prime d''objectifs')
  ) AS v(rk, overtime, bonus, label) ON v.rk = e.rk
  WHERE v_period IS NOT NULL
  ON CONFLICT (period_id, employee_id) DO NOTHING;

  -- Traces d'audit
  INSERT INTO public.audit_log (org_id, actor, actor_email, action, entity, details)
  VALUES (p_org, auth.uid(), (SELECT email FROM auth.users WHERE id = auth.uid()),
          'seed_demo', 'employees', jsonb_build_object('kind', p_kind));
END;
$function$;

REVOKE ALL ON FUNCTION public.seed_demo_data(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reset_demo_data(p_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_demo boolean;
BEGIN
  v_uid := (SELECT auth.uid());
  SELECT o.is_demo INTO v_demo FROM public.orgs AS o WHERE o.id = p_org;
  IF v_uid IS NULL OR v_demo IS DISTINCT FROM true
     OR NOT private.has_org_role(p_org, ARRAY['admin_rh']::text[]) THEN
    RAISE EXCEPTION 'Réinitialisation réservée à un administrateur d''un espace de démonstration';
  END IF;

  PERFORM pg_catalog.set_config('app.a26_demo_reset', 'on', true);
  DELETE FROM public.project_timers WHERE org_id = p_org;
  DELETE FROM public.payroll_details WHERE org_id = p_org;
  DELETE FROM public.payroll_lines WHERE org_id = p_org;
  DELETE FROM public.payroll_variables WHERE org_id = p_org;
  DELETE FROM public.payroll_periods WHERE org_id = p_org;
  DELETE FROM public.timesheet_entries WHERE org_id = p_org;
  DELETE FROM public.projects WHERE org_id = p_org;
  DELETE FROM public.leave_requests WHERE org_id = p_org;
  DELETE FROM public.clock_entries WHERE org_id = p_org;
  DELETE FROM public.contracts WHERE org_id = p_org;
  DELETE FROM public.employees WHERE org_id = p_org;
  PERFORM pg_catalog.set_config('app.a26_demo_reset', 'off', true);

  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id)
  VALUES (p_org, v_uid, 'reset_demo', 'orgs', p_org::text);
END;
$$;

REVOKE ALL ON FUNCTION public.reset_demo_data(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reseed_demo_data(p_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_kind text;
  v_links jsonb;
BEGIN
  v_uid := (SELECT auth.uid());
  SELECT o.demo_kind INTO v_kind
  FROM public.orgs AS o
  WHERE o.id = p_org AND o.is_demo = true;
  IF v_uid IS NULL OR v_kind IS NULL
     OR NOT private.has_org_role(p_org, ARRAY['admin_rh']::text[]) THEN
    RAISE EXCEPTION 'Réinitialisation réservée à un administrateur de cet espace de démonstration';
  END IF;

  -- Les comptes manager / salarié restent rattachés à la fiche de même matricule.
  SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'number', e.employee_number, 'user_id', e.user_id, 'email', e.email))
    INTO v_links
  FROM public.employees AS e
  WHERE e.org_id = p_org AND e.user_id IS NOT NULL;

  PERFORM public.reset_demo_data(p_org);
  PERFORM public.seed_demo_data(p_org, v_kind);

  IF v_links IS NOT NULL THEN
    UPDATE public.employees AS e
    SET user_id = (l.value->>'user_id')::uuid,
        email = COALESCE(l.value->>'email', e.email)
    FROM pg_catalog.jsonb_array_elements(v_links) AS l
    WHERE e.org_id = p_org AND e.employee_number = l.value->>'number';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reseed_demo_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reseed_demo_data(uuid) TO authenticated;

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
