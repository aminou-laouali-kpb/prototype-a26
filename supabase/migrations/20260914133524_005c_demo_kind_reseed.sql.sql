/*
# Étape 5 ter : type de démonstration mémorisé + remise à zéro complète.

- `orgs.demo_kind` : retient le type du jeu de démonstration (pme / ong / groupe)
  pour permettre la réinitialisation sans re-choix.
- `reseed_demo_data(p_org)` : efface puis régénère les données de démonstration.
- `create_demo_org` met à jour demo_kind (réutilisé à chaque création).
*/

ALTER TABLE public.orgs ADD COLUMN IF NOT EXISTS demo_kind text;

CREATE OR REPLACE FUNCTION public.create_demo_org(p_kind text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid;
  v_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF p_kind NOT IN ('pme','ong','groupe') THEN
    RAISE EXCEPTION 'Type de démonstration inconnu';
  END IF;

  v_name := CASE p_kind
    WHEN 'pme' THEN 'Distribution Ivoire SARL'
    WHEN 'ong' THEN 'ONG Horizon Santé CI'
    ELSE 'Groupe ATLANTIQUE CI'
  END;

  INSERT INTO public.orgs (name, legal_name, ncc, is_demo, demo_kind)
  VALUES (v_name, v_name, 'SIMU-' || upper(substring(md5(random()::text) from 1 for 8)), true, p_kind)
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

CREATE OR REPLACE FUNCTION public.reseed_demo_data(p_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_kind text;
BEGIN
  SELECT o.demo_kind INTO v_kind FROM public.orgs o WHERE o.id = p_org AND o.is_demo;
  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'Réinitialisation réservée aux espaces de démonstration';
  END IF;

  PERFORM public.reset_demo_data(p_org);
  PERFORM public.seed_demo_data(p_org, v_kind);
END;
$$;

REVOKE ALL ON FUNCTION public.create_demo_org(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_demo_org(text) TO authenticated;
REVOKE ALL ON FUNCTION public.reseed_demo_data(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reseed_demo_data(uuid) TO authenticated;
