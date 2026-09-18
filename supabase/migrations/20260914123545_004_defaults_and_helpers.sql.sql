/*
# Semis des données de démonstration (SIMULATION) et règles de paie Côte d'Ivoire

1. Résumé en français
   - Sème, à la création/rejoindre d'une organisation via l'application, les données
     par défaut : la fonction `ensure_org_defaults(org_id)` crée automatiquement les
     services initiaux, les types de congés ivoiriens standards (congé annuel payé
     30 jours, maladie, maternité, paternité, exceptionnel, sans solde) et le jeu de
     règles de pré-paie (SIMULATION).
   - Règles semées : CNPS pension 6,3 % salarié / 7,7 % employeur, prestations
     familiales 5,75 %, accidents du travail 2 %, risques professionnels 1 %,
     FDFP 1,4 % + 0,4 %, CMU 5 % (1 % salarié / 4 % employeur), plafond mensuel
     70 000 FCFA, SMIG 75 000 FCFA, barème ITS mensuel 0/10/15/25 % — TOUTES les
     valeurs sont des SIMULATIONS de démonstration, mention « à valider par un
     expert local » gravée sur chaque règle, modifiables dans les Paramètres.
   - `join_org` : rejoindre une organisation qui n'a encore AUCUN membre
     (initialisation/démo), avec le rôle demandé.
   - `create_org_with_defaults` : créer une organisation et en devenir admin RH.
   - `claim_employee` : l'utilisateur connecté se rattache à sa fiche salarié via
     son matricule (si non encore revendiquée par quelqu'un).

2. Sécurité
   - Fonctions SECURITY DEFINER, search_path verrouillé, EXECUTE retiré à public/anon
     et accordé uniquement à authenticated.
   - Traçabilité : la création d'organisation écrit dans le journal d'audit.
*/

CREATE OR REPLACE FUNCTION public.ensure_org_defaults(p_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Services par défaut
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

  -- Types de congés (valeurs indicatives ivoiriennes, ajustables par l'organisation)
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

  -- Règles de paie de SIMULATION (Côte d'Ivoire) — modifiables dans l'application
  INSERT INTO public.payroll_rules (org_id, code, label, category, value, bracket_from, bracket_to, effective_from, source)
  SELECT p_org, r.rcode, r.rlabel, r.rcat, r.rval, r.rfrom, r.rto, CURRENT_DATE, 'SIMULATION — à valider par un expert local'
  FROM (VALUES
    ('cnps_pension_tx_salarie',   'CNPS pension vieillesse — part salariale',        'cotisation_salarie',   6.3::numeric, NULL::numeric, NULL::numeric),
    ('cnps_pension_tx_employeur', 'CNPS pension vieillesse — part employeur',        'cotisation_employeur', 7.7::numeric, NULL::numeric, NULL::numeric),
    ('cnps_pf_tx_employeur',      'CNPS prestations familiales — part employeur',    'cotisation_employeur', 5.75::numeric, NULL::numeric, NULL::numeric),
    ('cnps_at_tx_employeur',      'CNPS accidents du travail — part employeur',      'cotisation_employeur', 2.0::numeric, NULL::numeric, NULL::numeric),
    ('cnps_rp_tx_employeur',      'CNPS risques professionnels — part employeur',    'cotisation_employeur', 1.0::numeric, NULL::numeric, NULL::numeric),
    ('fdfp_tx_employeur',         'FDFP formation professionnelle — part employeur', 'cotisation_employeur', 1.4::numeric, NULL::numeric, NULL::numeric),
    ('fdfp_tx_plan',              'FDFP plan de développement — part employeur',     'abarissement',         0.4::numeric, NULL::numeric, NULL::numeric),
    ('cmu_tx_salarie',            'CMU — part salariale',                            'cotisation_salarie',   1.0::numeric, NULL::numeric, NULL::numeric),
    ('cmu_tx_employeur',          'CMU — part employeur',                            'cotisation_employeur', 4.0::numeric, NULL::numeric, NULL::numeric),
    ('plafond_mensuel',           'Plafond mensuel de cotisation CNPS (SIMULATION)', 'plafond',              70000::numeric, NULL::numeric, NULL::numeric),
    ('smig_mensuel',              'SMIG mensuel ivoirien (SIMULATION)',              'plafond',              75000::numeric, NULL::numeric, NULL::numeric),
    ('its_t1_tx',                 'ITS tranche 1 (0 à 50 000) — taux',               'impot',                0.0::numeric, 0::numeric,     50000::numeric),
    ('its_t2_tx',                 'ITS tranche 2 (50 001 à 290 000) — taux',         'impot',                10.0::numeric, 50000::numeric, 290000::numeric),
    ('its_t3_tx',                 'ITS tranche 3 (290 001 à 530 000) — taux',        'impot',                15.0::numeric, 290000::numeric, 530000::numeric),
    ('its_t4_tx',                 'ITS tranche 4 (au-delà de 530 000) — taux',       'impot',                25.0::numeric, 530000::numeric, NULL::numeric)
  ) AS r(rcode, rlabel, rcat, rval, rfrom, rto)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.payroll_rules pr WHERE pr.org_id = p_org AND pr.code = r.rcode
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_org_defaults(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ensure_org_defaults(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.join_org(p_org uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count int;
BEGIN
  IF p_role NOT IN ('admin_rh','manager','preparateur','approveur_paie','employee','auditeur') THEN
    RAISE EXCEPTION 'Rôle inconnu';
  END IF;

  SELECT count(*) INTO v_count FROM public.memberships WHERE org_id = p_org;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Cette organisation a déjà des membres : rejoignez-la via une invitation.';
  END IF;

  INSERT INTO public.memberships (org_id, user_id, role)
  VALUES (p_org, auth.uid(), p_role)
  ON CONFLICT (org_id, user_id) DO NOTHING;

  PERFORM public.ensure_org_defaults(p_org);
END;
$$;

REVOKE ALL ON FUNCTION public.join_org(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.join_org(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_org_with_defaults(p_name text, p_legal_name text, p_ncc text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid;
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) < 2 THEN
    RAISE EXCEPTION 'Nom d''organisation trop court';
  END IF;

  INSERT INTO public.orgs (name, legal_name, ncc)
  VALUES (trim(p_name), NULLIF(trim(coalesce(p_legal_name,'')),''), NULLIF(trim(coalesce(p_ncc,'')),''))
  RETURNING id INTO v_org;

  INSERT INTO public.memberships (org_id, user_id, role)
  VALUES (v_org, auth.uid(), 'admin_rh');

  PERFORM public.ensure_org_defaults(v_org);

  INSERT INTO public.audit_log (org_id, actor, actor_email, action, entity, details)
  VALUES (v_org, auth.uid(), (SELECT email FROM auth.users WHERE id = auth.uid()), 'create_org', 'orgs',
          jsonb_build_object('name', p_name));

  RETURN v_org;
END;
$$;

REVOKE ALL ON FUNCTION public.create_org_with_defaults(text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_org_with_defaults(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_employee(p_org uuid, p_employee_number text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_emp uuid;
BEGIN
  SELECT e.id INTO v_emp
  FROM public.employees e
  WHERE e.org_id = p_org AND e.employee_number = p_employee_number
  LIMIT 1;

  IF v_emp IS NULL THEN
    RAISE EXCEPTION 'Salarié introuvable dans cette organisation';
  END IF;

  UPDATE public.employees e
  SET user_id = auth.uid(), updated_at = now()
  WHERE e.id = v_emp AND e.user_id IS NULL;

  RETURN v_emp;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_employee(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_employee(uuid, text) TO authenticated;
