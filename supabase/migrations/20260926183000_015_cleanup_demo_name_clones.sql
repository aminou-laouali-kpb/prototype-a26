-- A26 — ménage des fiches de démo en double (même nom, matricules différents)
-- et deux salariés locaux Niger stables pour ne plus les recréer au reseed.

CREATE OR REPLACE FUNCTION public.cleanup_demo_name_clones(p_org uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_demo boolean;
  v_removed integer := 0;
  v_kept text[] := ARRAY[]::text[];
  v_dropped text[] := ARRAY[]::text[];
  v_group record;
  v_keep uuid;
  v_clone record;
BEGIN
  v_uid := (SELECT auth.uid());
  SELECT o.is_demo INTO v_demo FROM public.orgs AS o WHERE o.id = p_org;
  IF v_uid IS NULL OR v_demo IS DISTINCT FROM true
     OR NOT private.has_org_role(p_org, ARRAY['admin_rh']::text[]) THEN
    RAISE EXCEPTION 'Le ménage des doublons est réservé à l''administrateur d''un espace de démonstration';
  END IF;

  PERFORM pg_catalog.set_config('app.a26_demo_reset', 'on', true);

  FOR v_group IN
    SELECT e.last_name, e.first_name
    FROM public.employees AS e
    WHERE e.org_id = p_org
    GROUP BY e.last_name, e.first_name
    HAVING pg_catalog.count(*) > 1
  LOOP
    SELECT e.id INTO v_keep
    FROM public.employees AS e
    WHERE e.org_id = p_org
      AND e.last_name = v_group.last_name
      AND e.first_name = v_group.first_name
    ORDER BY
      (e.user_id IS NOT NULL) DESC,
      (SELECT pg_catalog.count(*) FROM public.payroll_lines AS pl WHERE pl.employee_id = e.id) DESC,
      (SELECT pg_catalog.count(*) FROM public.employee_bonuses AS b WHERE b.employee_id = e.id) DESC,
      (e.employee_number NOT ILIKE '%TEST%') DESC,
      e.created_at ASC,
      e.employee_number ASC
    LIMIT 1;

    v_kept := v_kept || (
      v_group.last_name || ' ' || v_group.first_name || ' (' ||
      (SELECT em.employee_number FROM public.employees AS em WHERE em.id = v_keep) || ')'
    );

    FOR v_clone IN
      SELECT e.id, e.employee_number
      FROM public.employees AS e
      WHERE e.org_id = p_org
        AND e.last_name = v_group.last_name
        AND e.first_name = v_group.first_name
        AND e.id <> v_keep
    LOOP
      DELETE FROM public.payment_batch_lines AS pbl
      WHERE pbl.org_id = p_org AND pbl.employee_id = v_clone.id;
      DELETE FROM public.payroll_details AS pd
      WHERE pd.org_id = p_org
        AND pd.line_id IN (SELECT pl.id FROM public.payroll_lines AS pl WHERE pl.employee_id = v_clone.id);
      DELETE FROM public.payroll_lines AS pl
      WHERE pl.org_id = p_org AND pl.employee_id = v_clone.id;
      DELETE FROM public.payroll_variables AS pv
      WHERE pv.org_id = p_org AND pv.employee_id = v_clone.id;
      DELETE FROM public.employees AS e
      WHERE e.org_id = p_org AND e.id = v_clone.id;
      v_removed := v_removed + 1;
      v_dropped := v_dropped || v_clone.employee_number;
    END LOOP;
  END LOOP;

  UPDATE public.employees AS e
  SET job_title = CASE
    WHEN e.last_name = 'AMADOU' AND e.first_name = 'Aïcha' THEN 'Responsable commerciale'
    WHEN e.last_name = 'SAIDOU' AND e.first_name = 'Ibrahim' THEN 'Magasinier'
    ELSE 'Salarié de démonstration'
  END
  WHERE e.org_id = p_org
    AND e.status = 'active'
    AND (e.job_title IS NULL OR e.job_title = '');

  PERFORM pg_catalog.set_config('app.a26_demo_reset', 'off', true);

  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (
    p_org, v_uid, 'cleanup_demo_clones', 'employees', p_org::text,
    pg_catalog.jsonb_build_object('removed', v_removed, 'kept', v_kept, 'dropped', v_dropped)
  );

  RETURN pg_catalog.jsonb_build_object(
    'removed', v_removed,
    'kept', to_jsonb(v_kept),
    'dropped', to_jsonb(v_dropped)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_demo_name_clones(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_demo_name_clones(uuid) TO authenticated;

-- Deux fiches Niger stables (matricules NE-04781 / NE-04782) après un seed PME.
CREATE OR REPLACE FUNCTION private.seed_niger_local_employees(p_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_country text;
  v_ops uuid;
BEGIN
  SELECT o.country_code INTO v_country FROM public.orgs AS o WHERE o.id = p_org;
  IF v_country IS DISTINCT FROM 'NE' THEN
    RETURN;
  END IF;

  SELECT d.id INTO v_ops
  FROM public.departments AS d
  WHERE d.org_id = p_org AND d.code = 'OPS'
  LIMIT 1;

  INSERT INTO public.employees (
    org_id, employee_number, first_name, last_name, gender, phone, department_id,
    job_title, hire_date, payment_method, mobile_operator, payment_account, status
  )
  VALUES
    (p_org, 'NE-04782', 'Aïcha', 'AMADOU', 'F', '+227 90 12 34 56', v_ops,
     'Responsable commerciale', pg_catalog.now() - interval '2 years',
     'mobile_money', 'Airtel Money', '+227 90 12 34 56', 'active'),
    (p_org, 'NE-04781', 'Ibrahim', 'SAIDOU', 'M', '+227 96 55 44 33', v_ops,
     'Magasinier', pg_catalog.now() - interval '18 months',
     'mobile_money', 'Airtel Money', '+227 96 55 44 33', 'active')
  ON CONFLICT (org_id, employee_number) DO NOTHING;

  INSERT INTO public.contracts (org_id, employee_id, contract_type, start_date, base_salary, monthly_hours, is_current)
  SELECT p_org, e.id, 'CDI', COALESCE(e.hire_date, CURRENT_DATE),
    CASE WHEN e.employee_number = 'NE-04782' THEN 180000 ELSE 120000 END,
    173.33, true
  FROM public.employees AS e
  WHERE e.org_id = p_org
    AND e.employee_number IN ('NE-04781', 'NE-04782')
    AND NOT EXISTS (
      SELECT 1 FROM public.contracts AS c
      WHERE c.employee_id = e.id AND c.is_current
    );
END;
$$;

REVOKE ALL ON FUNCTION private.seed_niger_local_employees(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reseed_demo_data(p_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_kind text;
BEGIN
  v_uid := (SELECT auth.uid());
  SELECT o.demo_kind INTO v_kind
  FROM public.orgs AS o
  WHERE o.id = p_org AND o.is_demo = true;
  IF v_uid IS NULL OR v_kind IS NULL
     OR NOT private.has_org_role(p_org, ARRAY['admin_rh']::text[]) THEN
    RAISE EXCEPTION 'Réinitialisation réservée à un administrateur de cet espace de démonstration';
  END IF;
  PERFORM public.reset_demo_data(p_org);
  PERFORM public.seed_demo_data(p_org, v_kind);
  PERFORM private.seed_niger_local_employees(p_org);
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
  PERFORM private.seed_niger_local_employees(v_org);
  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (v_org, v_uid, 'create_demo_org', 'orgs', v_org::text,
          pg_catalog.jsonb_build_object('kind', p_kind, 'country_code', 'NE'));
  RETURN v_org;
END;
$$;

REVOKE ALL ON FUNCTION public.create_demo_org(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_demo_org(text) TO authenticated;
