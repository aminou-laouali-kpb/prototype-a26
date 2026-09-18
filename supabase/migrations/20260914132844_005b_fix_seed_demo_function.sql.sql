/*
# Étape 5 bis : fonction de démonstration vérifiée contre le schéma réel + remise à zéro.

1. Matricules uniques garantis (index employees_org_number_unique).
2. Codes de services conformes à ensure_org_defaults : DIR, RH, CMP, OPS.
3. Types de congés attendus : CAP, MAL, MAT, PAT, EXC, SOL.
4. reset_demo_org : efface les données générées d'un espace de démonstration
   (paiement, temps, congés, projets) puis relance le jeu de données.
*/

-- Décommissionner la version fautive puis la recréer proprement
DROP FUNCTION IF EXISTS public.seed_demo_data(uuid, text);

CREATE OR REPLACE FUNCTION public.seed_demo_data(p_org uuid, p_kind text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dir uuid; v_rh uuid; v_cmp uuid; v_ops uuid; v_prog uuid;
  v_emp uuid; v_count int;
BEGIN
  IF p_kind NOT IN ('pme','ong','groupe') THEN
    RAISE EXCEPTION 'Type de démonstration inconnu';
  END IF;

  -- Ne jamais doubler les données
  SELECT count(*) INTO v_count FROM public.employees WHERE org_id = p_org;
  IF v_count > 0 THEN RETURN; END IF;

  SELECT id INTO v_dir FROM public.departments WHERE org_id = p_org AND code = 'DIR';
  SELECT id INTO v_rh FROM public.departments WHERE org_id = p_org AND code = 'RH';
  SELECT id INTO v_cmp FROM public.departments WHERE org_id = p_org AND code = 'CMP';
  SELECT id INTO v_ops FROM public.departments WHERE org_id = p_org AND code = 'OPS';
  IF v_ops IS NULL THEN
    INSERT INTO public.departments (org_id, name, code) VALUES (p_org, 'Opérations', 'OPS');
    SELECT id INTO v_ops FROM public.departments WHERE org_id = p_org AND code = 'OPS';
  END IF;
  IF p_kind = 'ong' THEN
    INSERT INTO public.departments (org_id, name, code) VALUES (p_org, 'Programmes', 'PRG')
    ON CONFLICT DO NOTHING;
    SELECT id INTO v_prog FROM public.departments WHERE org_id = p_org AND code = 'PRG';
  END IF;

  -- ============ PME — 10 salariés ============
  IF p_kind = 'pme' THEN
    INSERT INTO public.employees (org_id, employee_number, first_name, last_name, gender, phone, department_id, job_title, hire_date, payment_method, mobile_operator, payment_account)
    VALUES
      (p_org, 'PME-001', 'Awa', 'KONÉ', 'F', '+225 07 01 10 20 30', v_dir, 'Directrice générale', now() - interval '4 years', 'bank', NULL, 'CI93 CI15 0102 0304 0506 0708'),
      (p_org, 'PME-002', 'Yao', 'KOFFI', 'M', '+225 05 12 20 30 40', v_ops, 'Responsable logistique', now() - interval '3 years', 'mobile_money', 'Orange Money', '+225 07 55 66 77 88'),
      (p_org, 'PME-003', 'Fatoumata', 'DIABATÉ', 'F', '+225 05 12 34 56 78', v_cmp, 'Comptable', now() - interval '2 years', 'bank', NULL, 'CI93 CI15 0123 4567 8901 2345'),
      (p_org, 'PME-004', 'Ibrahim', 'TRAORÉ', 'M', '+225 05 11 22 33 44', v_ops, 'Chauffeur-livreur', now() - interval '18 months', 'mobile_money', 'Wave', '+225 07 55 66 77 89'),
      (p_org, 'PME-005', 'Adjoua', 'NGUESSAN', 'F', '+225 01 44 55 66 77', v_rh, 'Assistante RH', now() - interval '2 years', 'mobile_money', 'Wave', '+225 01 23 45 67 90'),
      (p_org, 'PME-006', 'Moussa', 'DIABATÉ', 'M', '+225 07 78 12 34 56', v_ops, 'Magasinier', now() - interval '1 year', 'mobile_money', 'MTN MoMo', '+225 05 99 88 77 66'),
      (p_org, 'PME-007', 'Mariam', 'BAKAYOKO', 'F', '+225 05 22 33 44 55', v_cmp, 'Aide-comptable', now() - interval '8 months', 'mobile_money', 'Orange Money', '+225 07 65 43 21 09'),
      (p_org, 'PME-008', 'Serge', 'GNAMIEN', 'M', '+225 05 32 10 98 76', v_ops, 'Commercial', now() - interval '8 months', 'mobile_money', 'MTN MoMo', '+225 05 88 77 66 55'),
      (p_org, 'PME-009', 'Léa', 'TANOH', 'F', '+225 01 55 44 33 22', v_ops, 'Assistante commerciale', now() - interval '6 months', 'mobile_money', 'Orange Money', '+225 01 12 34 56 78'),
      (p_org, 'PME-009', 'Aboubacar', 'SYLLA', 'M', '+225 07 22 33 44 55', v_ops, 'Magasinier', now() - interval '3 months', 'cash', NULL, NULL);
  END IF;

  -- ============ ONG — 12 salariés, 3 projets bailleurs ============
  IF p_kind = 'ong' THEN
    INSERT INTO public.projects (org_id, code, name, funder, active) VALUES
      (p_org, 'P-SANTE', 'Programme santé communautaire', 'Fonds régional santé', true),
      (p_org, 'P-EDU',   'Accès à l''éducation des filles', 'Coopération internationale', true),
      (p_org, 'P-EAU',   'Accès à l''eau potable — Nord', 'Agence de l''eau', true);

    INSERT INTO public.employees (org_id, employee_number, first_name, last_name, gender, phone, department_id, job_title, hire_date, payment_method, mobile_operator, payment_account)
    VALUES
      (p_org, 'ONG-001', 'Awa', 'KONÉ', 'F', '+225 07 01 02 03 04', v_dir, 'Directrice pays', now() - interval '5 years', 'bank', NULL, 'CI93 CI00 1234 5678 9012 3456'),
      (p_org, 'ONG-002', 'Jean-Marc', 'ZADI', 'M', '+225 05 02 03 04 05', v_prog, 'Coordinateur programmes', now() - interval '4 years', 'mobile_money', 'Orange Money', '+225 07 88 77 66 55'),
      (p_org, 'ONG-003', 'Salimata', 'OUEDRAOGO', 'F', '+225 01 03 04 05 06', v_prog, 'Responsable santé', now() - interval '3 years', 'mobile_money', 'Wave', '+225 07 12 34 56 78'),
      (p_org, 'ONG-004', 'Paul', 'AGBEKO', 'M', '+225 07 03 04 05 06', v_ops, 'Logisticien', now() - interval '4 years', 'mobile_money', 'MTN MoMo', '+225 05 43 21 67 89'),
      (p_org, 'ONG-005', 'Christine', 'AMANI', 'F', '+225 05 04 05 06 07', v_cmp, 'Comptable bailleurs', now() - interval '3 years', 'bank', NULL, 'CI93 CI00 9876 5432 1098 7654'),
      (p_org, 'ONG-006', 'Ousmane', 'CAMARA', 'M', '+225 07 04 05 06 07', v_ops, 'Chauffeur', now() - interval '2 years', 'mobile_money', 'Wave', '+225 01 98 76 54 32'),
      (p_org, 'ONG-007', 'Nadège', 'GOSSIO', 'F', '+225 05 05 06 07 08', v_rh, 'Chargée RH', now() - interval '2 years', 'mobile_money', 'Orange Money', '+225 07 56 47 38 29'),
      (p_org, 'ONG-008', 'Bakary', 'COULIBALY', 'M', '+225 05 06 07 08 09', v_prog, 'Coordinateur éducation', now() - interval '2 years', 'mobile_money', 'Moov Money', '+225 01 23 45 67 90'),
      (p_org, 'ONG-009', 'Estelle', 'KOUAME', 'F', '+225 01 07 08 09 10', v_prog, 'Infirmière mobile', now() - interval '1 year', 'mobile_money', 'Wave', '+225 07 11 22 33 44'),
      (p_org, 'ONG-009', 'Modibo', 'SANOGO', 'M', '+225 07 08 09 10 11', v_ops, 'Conducteur', now() - interval '10 months', 'cash', NULL, NULL),
      (p_org, 'ONG-010', 'Rachelle', 'BEDIE', 'F', '+225 05 08 09 10 11', v_prog, 'Assistante administrative', now() - interval '9 months', 'mobile_money', 'Orange Money', '+225 07 55 44 33 22'),
      (p_org, 'ONG-011', 'Karim', 'DIARRA', 'M', '+225 07 09 10 11 12', v_prog, 'Enquêteur terrain', now() - interval '7 months', 'mobile_money', 'MTN MoMo', '+225 05 66 77 88 99');
  END IF;

  -- ============ Groupe — 18 salariés ============
  IF p_kind = 'groupe' THEN
    INSERT INTO public.employees (org_id, employee_number, first_name, last_name, gender, phone, department_id, job_title, hire_date, payment_method, mobile_operator, payment_account)
    VALUES
      (p_org, 'GRP-001', 'Daniel', 'AKE', 'M', '+225 07 10 00 01 02', v_dir, 'Directeur général', now() - interval '8 years', 'bank', NULL, 'CI93 CI11 1111 2222 3333 4444'),
      (p_org, 'GRP-002', 'Sylvie', 'ANOH', 'F', '+225 05 10 02 03 04', v_rh, 'Directrice des ressources humaines', now() - interval '7 years', 'bank', NULL, 'CI93 CI00 2222 3333 4444 5555'),
      (p_org, 'GRP-003', 'Kwame', 'MENSAH', 'M', '+225 05 11 00 02 03', v_dir, 'Directeur financier', now() - interval '7 years', 'bank', NULL, 'CI93 CI00 3333 4444 5555 6666'),
      (p_org, 'GRP-004', 'Chantal', 'YAPI', 'F', '+225 01 11 22 33 44', v_cmp, 'Chef comptable', now() - interval '6 years', 'bank', NULL, 'CI93 CI00 4444 5555 6666 7777'),
      (p_org, 'GRP-005', 'Franck', 'ASSAMOI', 'M', '+225 07 12 34 56 78', v_ops, 'Chef d''atelier', now() - interval '6 years', 'mobile_money', 'Orange Money', '+225 07 11 22 33 45'),
      (p_org, 'GRP-006', 'Aminata', 'TOURE', 'F', '+225 05 12 34 56 79', v_rh, 'Responsable paie', now() - interval '5 years', 'mobile_money', 'Orange Money', '+225 07 22 33 44 55'),
      (p_org, 'GRP-007', 'Pascal', 'DIBY', 'M', '+225 07 33 44 55 66', v_ops, 'Superviseur production', now() - interval '5 years', 'mobile_money', 'MTN MoMo', '+225 05 33 22 11 00'),
      (p_org, 'GRP-008', 'Bernadette', 'YAO', 'F', '+225 05 44 55 66 77', v_cmp, 'Comptable fournisseurs', now() - interval '5 years', 'bank', NULL, 'CI93 CI00 4444 3333 2222 1111'),
      (p_org, 'GRP-009', 'Ismael', 'FANTA', 'M', '+225 01 55 66 77 88', v_ops, 'Technicien maintenance', now() - interval '5 years', 'mobile_money', 'Orange Money', '+225 01 66 77 88 99'),
      (p_org, 'GRP-010', 'Celine', 'GBAGUIDI', 'F', '+225 07 66 77 88 99', v_cmp, 'Assistante facturation', now() - interval '4 years', 'mobile_money', 'Wave', '+225 07 33 22 11 00'),
      (p_org, 'GRP-011', 'Paulin', 'SERY', 'M', '+225 07 66 77 88 90', v_ops, 'Magasinier principal', now() - interval '4 years', 'mobile_money', 'Orange Money', '+225 07 44 33 22 11'),
      (p_org, 'GRP-012', 'Hadja', 'CAMARA', 'F', '+225 01 77 88 99 00', v_ops, 'Contrôleuse de gestion', now() - interval '4 years', 'bank', NULL, 'CI93 CI00 7777 8888 9999 0000'),
      (p_org, 'GRP-013', 'Emile', 'LOUKOU', 'M', '+225 05 77 88 99 00', v_ops, 'Cariste', now() - interval '3 years', 'mobile_money', 'Orange Money', '+225 07 88 99 00 11'),
      (p_org, 'GRP-014', 'Bintou', 'CISSE', 'F', '+225 01 88 99 00 11', v_ops, 'Agent de sécurité', now() - interval '2 years', 'cash', NULL, NULL),
      (p_org, 'GRP-015', 'Roland', 'BILOA', 'M', '+225 05 99 00 11 22', v_ops, 'Chauffeur poids lourd', now() - interval '2 years', 'mobile_money', 'Orange Money', '+225 07 55 66 77 88'),
      (p_org, 'GRP-016', 'Christine', 'ASSI', 'F', '+225 07 99 00 11 22', v_ops, 'Standardiste', now() - interval '18 months', 'mobile_money', 'Wave', '+225 01 10 20 30 40'),
      (p_org, 'GRP-017', 'Souleymane', 'KANTE', 'M', '+225 05 00 11 22 33', v_ops, 'Manoeuvre', now() - interval '14 months', 'mobile_money', 'MTN MoMo', '+225 05 10 20 30 40'),
      (p_org, 'GRP-017', 'Céline', 'KOFFI', 'F', '+225 01 10 11 22 33', v_ops, 'Standardiste', now() - interval '10 months', 'mobile_money', 'Orange Money', '+225 01 10 11 22 33');
  END IF;

  -- Contrat actuel pour chaque salarié, salaire selon le poste
  INSERT INTO public.contracts (org_id, employee_id, contract_type, start_date, base_salary, monthly_hours, is_current)
  SELECT p_org, e.id,
    CASE
      WHEN e.hire_date > now() - interval '12 months' AND e.job_title LIKE 'Commercial%' THEN 'CDD'
      ELSE 'CDI'
    END,
    COALESCE(e.hire_date, CURRENT_DATE),
    CASE
      WHEN e.job_title LIKE 'Direct%' THEN 1200000::numeric
      WHEN e.job_title LIKE 'Chef%' THEN 550000::numeric
      WHEN e.job_title LIKE 'Responsable%' OR e.job_title LIKE 'Directrice%' THEN 480000::numeric
      WHEN e.job_title LIKE 'Coordinateur%' OR e.job_title LIKE 'Chargée%' THEN 420000::numeric
      WHEN e.job_title LIKE 'Comptable%' OR e.job_title LIKE 'Technicien%' OR e.job_title LIKE 'Contrôleuse%' THEN 260000::numeric
      WHEN e.job_title LIKE 'Infirmi%' OR e.job_title LIKE 'Enquêteur%' THEN 250000::numeric
      WHEN e.job_title LIKE 'Assistante%' THEN 165000::numeric
      WHEN e.job_title LIKE 'Commercial%' THEN 180000::numeric
      WHEN e.job_title LIKE 'Superviseur%' OR e.job_title LIKE 'Logisticien%' THEN 240000::numeric
      WHEN e.job_title LIKE 'Chauffeur%' OR e.job_title LIKE 'Conducteur%' THEN 130000::numeric
      WHEN e.job_title LIKE 'Cariste%' OR e.job_title LIKE 'Magasinier%' THEN 120000::numeric
      WHEN e.job_title LIKE 'Agent%' THEN 95000::numeric
      ELSE 85000::numeric
    END,
    173.33, true
  FROM public.employees e
  WHERE e.org_id = p_org
    AND NOT EXISTS (SELECT 1 FROM public.contracts c WHERE c.employee_id = e.id AND c.is_current);

  -- Pointages des 10 derniers jours ouvrés (aléatoires pour réalisme)
  INSERT INTO public.clock_entries (org_id, employee_id, work_date, clock_in, clock_out, source)
  SELECT p_org, e.id, d.wd,
    d.wd + time '08' + (random() * interval '25 minutes'),
    d.wd + time '17' + (random() * interval '45 minutes'),
    'web'
  FROM public.employees e
  CROSS JOIN LATERAL (
    SELECT (CURRENT_DATE - gs.i)::date AS wd
    FROM generate_series(0, 13) AS gs(i)
    WHERE EXTRACT(ISODOW FROM (CURRENT_DATE - gs.i)) BETWEEN 1 AND 5
  ) d
  WHERE e.org_id = p_org AND e.status = 'active'
    AND NOT EXISTS (SELECT 1 FROM public.clock_entries c WHERE c.employee_id = e.id AND c.work_date = d.wd)
    AND random() < 0.8;

  -- Feuilles de temps sur projets (ONG) : heures réparties sur les 4 dernières semaines
  IF p_kind = 'ong' THEN
    INSERT INTO public.timesheet_entries (org_id, employee_id, project_id, work_date, hours, activity, status)
    SELECT p_org, e.id, pr.id, d.wd,
      4.0 + random() * 3.0,
      'Activité de terrain',
      CASE WHEN d.wd < CURRENT_DATE - 7 THEN 'approved' ELSE 'submitted' END
    FROM public.employees e
    CROSS JOIN public.projects pr
    CROSS JOIN LATERAL (
      SELECT (CURRENT_DATE - gs.i)::date AS wd
      FROM generate_series(1, 21) AS gs(i)
      WHERE EXTRACT(ISODOW FROM (CURRENT_DATE - gs.i)) BETWEEN 1 AND 5
    ) d
    WHERE e.org_id = p_org AND e.status = 'active'
      AND pr.org_id = p_org AND pr.code IN ('P-SANTE','P-EDU','P-EAU')
      AND random() < 0.15
    ON CONFLICT DO NOTHING;
  END IF;

  -- Demandes de congés à différents stades
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
         CURRENT_DATE - 40, CURRENT_DATE - 31, 10, NULL, 'approved'
  FROM (SELECT id FROM public.employees WHERE org_id = p_org AND status='active' ORDER BY employee_number OFFSET 2 LIMIT 1) e;

  -- Cycle de paie du mois courant, prêt à calculer
  INSERT INTO public.payroll_periods (org_id, period_year, period_month, status, notes)
  VALUES (p_org, EXTRACT(YEAR FROM now())::int, EXTRACT(MONTH FROM now())::int, 'open',
          'Cycle de démonstration — calculer, puis faire valider par un Approbateur paie.')
  ON CONFLICT (org_id, period_year, period_month) DO NOTHING;

  -- Traces d'audit de mise en place
  INSERT INTO public.audit_log (org_id, actor, actor_email, action, entity, details)
  VALUES (p_org, auth.uid(), (SELECT email FROM auth.users WHERE id = auth.uid()),
          'seed_demo', 'employees', jsonb_build_object('kind', p_kind));
END;
$$;

-- ===== Remise à zéro d'un espace de démonstration =====
CREATE OR REPLACE FUNCTION public.reset_demo_data(p_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_demo boolean;
BEGIN
  SELECT o.is_demo INTO v_is_demo FROM public.orgs o WHERE o.id = p_org;
  IF NOT v_is_demo THEN
    RAISE EXCEPTION 'Réinitialisation réservée aux espaces de démonstration';
  END IF;

  DELETE FROM public.payroll_details WHERE org_id = p_org;
  DELETE FROM public.payroll_lines    WHERE org_id = p_org;
  DELETE FROM public.payroll_variables WHERE org_id = p_org;
  DELETE FROM public.payroll_periods  WHERE org_id = p_org;
  DELETE FROM public.timesheet_entries WHERE org_id = p_org;
  DELETE FROM public.leave_requests   WHERE org_id = p_org;
  DELETE FROM public.clock_entries    WHERE org_id = p_org;
  DELETE FROM public.contracts        WHERE org_id = p_org;
  DELETE FROM public.employees        WHERE org_id = p_org;

  INSERT INTO public.audit_log (org_id, actor, actor_email, action, entity, details)
  VALUES (p_org, auth.uid(), (SELECT email FROM auth.users WHERE id = auth.uid()),
          'reset_demo', 'orgs', jsonb_build_object('org', p_org));
END;
$$;

REVOKE ALL ON FUNCTION public.seed_demo_data(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.seed_demo_data(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.reset_demo_data(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reset_demo_data(uuid) TO authenticated;

-- ===== Création d'une organisation de démonstration avec ses données =====
CREATE OR REPLACE FUNCTION public.create_demo_org(p_kind text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid;
  v_name text;
  v_legal text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  CASE p_kind
    WHEN 'pme' THEN v_org := NULL; v_name := 'Distribution Ivoire SARL'; v_org := NULL;
    ELSE
      IF p_kind = 'ong' THEN
        v_name := 'ONG Horizon Santé CI';
      ELSIF p_kind = 'groupe' THEN
        v_name := 'Groupe ATLANTIQUE CI';
      ELSE
        v_name := 'Distribution Ivoire SARL';
      END IF;
  END CASE;

  INSERT INTO public.orgs (name, legal_name, ncc, is_demo)
  VALUES (v_name, v_name, 'SIMU-' || upper(substring(md5(random()::text) from 1 for 8)), true)
  RETURNING id INTO v_org;

  INSERT INTO public.memberships (org_id, user_id, role)
  VALUES (v_org, auth.uid(), 'admin_rh');

  PERFORM public.ensure_org_defaults(v_org);
  PERFORM public.seed_demo_data(v_org, p_kind);

  INSERT INTO public.audit_log (org_id, actor, actor_email, action, entity, details)
  VALUES (v_org, auth.uid(), (SELECT email FROM auth.users WHERE id = auth.uid()),
          'create_demo_org', 'orgs', jsonb_build_object('kind', p_kind));

  RETURN v_org;
END;
$$;

REVOKE ALL ON FUNCTION public.create_demo_org(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_demo_org(text) TO authenticated;
