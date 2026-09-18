/*
# A26 — durcissement RLS, identité et transitions atomiques

Cette migration corrige les politiques et fonctions livrées par les migrations
précédentes. Elle ne remplace pas les écrans clients : les opérations sensibles
doivent progressivement utiliser les RPC atomiques ajoutées ici.

Principes :
  - chaque décision d'autorisation porte sur l'organisation et sur le rôle dans
    cette organisation, avec des colonnes externes explicitement qualifiées ;
  - les employés ne lisent que leur propre dossier et les bulletins publiés ;
  - les écritures de paie, congés et feuilles de temps suivent une machine d'état
    contrôlée par des triggers serveur ;
  - les fonctions SECURITY DEFINER sont authentifiées, leur search_path est vide,
    et les helpers internes résident dans le schéma non exposé `private` ;
  - les références enfant/parent portent aussi l'organisation afin d'empêcher les
    rattachements inter-entreprises.

La validation des contraintes sur les données existantes est volontairement
effectuée pendant la migration. Une incohérence historique fera échouer la
migration dans sa transaction au lieu de laisser une base partiellement durcie.
*/

-- ---------------------------------------------------------------------------
-- Helpers internes : le schéma n'est pas destiné à être exposé par PostgREST.
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.org_member(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_org IS NOT NULL
     AND (SELECT auth.uid()) IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.memberships AS m
       WHERE m.org_id = p_org
         AND m.user_id = (SELECT auth.uid())
     );
$$;

CREATE OR REPLACE FUNCTION private.has_org_role(p_org uuid, p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_org IS NOT NULL
     AND p_roles IS NOT NULL
     AND (SELECT auth.uid()) IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.memberships AS m
       WHERE m.org_id = p_org
         AND m.user_id = (SELECT auth.uid())
         AND m.role = ANY (p_roles)
     );
$$;

CREATE OR REPLACE FUNCTION private.employee_owned(p_org uuid, p_employee uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_org IS NOT NULL
     AND p_employee IS NOT NULL
     AND (SELECT auth.uid()) IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.employees AS e
       WHERE e.id = p_employee
         AND e.org_id = p_org
         AND e.user_id = (SELECT auth.uid())
     );
$$;

CREATE OR REPLACE FUNCTION private.employee_in_org(p_org uuid, p_employee uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_org IS NOT NULL
     AND p_employee IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.employees AS e
       WHERE e.id = p_employee
         AND e.org_id = p_org
     );
$$;

CREATE OR REPLACE FUNCTION private.payroll_period_has_status(
  p_org uuid,
  p_period uuid,
  p_statuses text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_org IS NOT NULL
     AND p_period IS NOT NULL
     AND p_statuses IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.payroll_periods AS pp
       WHERE pp.id = p_period
         AND pp.org_id = p_org
         AND pp.status = ANY (p_statuses)
     );
$$;

CREATE OR REPLACE FUNCTION private.is_demo_org(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orgs AS o
    WHERE o.id = p_org
      AND o.is_demo = true
  );
$$;

CREATE OR REPLACE FUNCTION private.is_demo_reset()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pg_catalog.current_setting('app.a26_demo_reset', true) = 'on';
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_org_role(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION private.employee_owned(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.employee_in_org(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.payroll_period_has_status(uuid, uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_demo_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_demo_reset() TO authenticated;

-- Réécriture des deux helpers publics existants avec search_path vide.
CREATE OR REPLACE FUNCTION public.is_member(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.org_member(p_org);
$$;

CREATE OR REPLACE FUNCTION public.my_role(p_org uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT m.role
  FROM public.memberships AS m
  WHERE m.org_id = p_org
    AND m.user_id = (SELECT auth.uid())
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.is_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_member(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.my_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_role(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Intégrité inter-organisations et invitation à usage unique.
-- ---------------------------------------------------------------------------

ALTER TABLE public.org_invites
  ADD COLUMN IF NOT EXISTS redeemed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.org_invites
  ADD COLUMN IF NOT EXISTS redeemed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS a26_employees_org_id_uq
  ON public.employees (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS a26_departments_org_id_uq
  ON public.departments (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS a26_leave_types_org_id_uq
  ON public.leave_types (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS a26_projects_org_id_uq
  ON public.projects (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS a26_periods_org_id_uq
  ON public.payroll_periods (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS a26_lines_org_id_uq
  ON public.payroll_lines (org_id, id);
-- A project timer is represented by a live row and is deleted on finalization;
-- one row per employee prevents two browser tabs from running concurrent timers.
CREATE UNIQUE INDEX IF NOT EXISTS a26_project_timers_employee_uq
  ON public.project_timers (employee_id);

ALTER TABLE public.employees
  ADD CONSTRAINT a26_employees_department_same_org_fk
  FOREIGN KEY (org_id, department_id)
  REFERENCES public.departments (org_id, id)
  NOT VALID;

ALTER TABLE public.contracts
  ADD CONSTRAINT a26_contracts_employee_same_org_fk
  FOREIGN KEY (org_id, employee_id)
  REFERENCES public.employees (org_id, id)
  NOT VALID;

ALTER TABLE public.clock_entries
  ADD CONSTRAINT a26_clock_employee_same_org_fk
  FOREIGN KEY (org_id, employee_id)
  REFERENCES public.employees (org_id, id)
  NOT VALID;

ALTER TABLE public.leave_requests
  ADD CONSTRAINT a26_leave_employee_same_org_fk
  FOREIGN KEY (org_id, employee_id)
  REFERENCES public.employees (org_id, id)
  NOT VALID;
ALTER TABLE public.leave_requests
  ADD CONSTRAINT a26_leave_type_same_org_fk
  FOREIGN KEY (org_id, leave_type_id)
  REFERENCES public.leave_types (org_id, id)
  NOT VALID;

ALTER TABLE public.timesheet_entries
  ADD CONSTRAINT a26_timesheet_employee_same_org_fk
  FOREIGN KEY (org_id, employee_id)
  REFERENCES public.employees (org_id, id)
  NOT VALID;
ALTER TABLE public.timesheet_entries
  ADD CONSTRAINT a26_timesheet_project_same_org_fk
  FOREIGN KEY (org_id, project_id)
  REFERENCES public.projects (org_id, id)
  NOT VALID;

ALTER TABLE public.payroll_variables
  ADD CONSTRAINT a26_variables_period_same_org_fk
  FOREIGN KEY (org_id, period_id)
  REFERENCES public.payroll_periods (org_id, id)
  NOT VALID;
ALTER TABLE public.payroll_variables
  ADD CONSTRAINT a26_variables_employee_same_org_fk
  FOREIGN KEY (org_id, employee_id)
  REFERENCES public.employees (org_id, id)
  NOT VALID;

ALTER TABLE public.payroll_lines
  ADD CONSTRAINT a26_lines_period_same_org_fk
  FOREIGN KEY (org_id, period_id)
  REFERENCES public.payroll_periods (org_id, id)
  NOT VALID;
ALTER TABLE public.payroll_lines
  ADD CONSTRAINT a26_lines_employee_same_org_fk
  FOREIGN KEY (org_id, employee_id)
  REFERENCES public.employees (org_id, id)
  NOT VALID;

ALTER TABLE public.payroll_details
  ADD CONSTRAINT a26_details_line_same_org_fk
  FOREIGN KEY (org_id, line_id)
  REFERENCES public.payroll_lines (org_id, id)
  NOT VALID;

ALTER TABLE public.project_timers
  ADD CONSTRAINT a26_timer_employee_same_org_fk
  FOREIGN KEY (org_id, employee_id)
  REFERENCES public.employees (org_id, id)
  NOT VALID;
ALTER TABLE public.project_timers
  ADD CONSTRAINT a26_timer_project_same_org_fk
  FOREIGN KEY (org_id, project_id)
  REFERENCES public.projects (org_id, id)
  NOT VALID;

ALTER TABLE public.employees VALIDATE CONSTRAINT a26_employees_department_same_org_fk;
ALTER TABLE public.contracts VALIDATE CONSTRAINT a26_contracts_employee_same_org_fk;
ALTER TABLE public.clock_entries VALIDATE CONSTRAINT a26_clock_employee_same_org_fk;
ALTER TABLE public.leave_requests VALIDATE CONSTRAINT a26_leave_employee_same_org_fk;
ALTER TABLE public.leave_requests VALIDATE CONSTRAINT a26_leave_type_same_org_fk;
ALTER TABLE public.timesheet_entries VALIDATE CONSTRAINT a26_timesheet_employee_same_org_fk;
ALTER TABLE public.timesheet_entries VALIDATE CONSTRAINT a26_timesheet_project_same_org_fk;
ALTER TABLE public.payroll_variables VALIDATE CONSTRAINT a26_variables_period_same_org_fk;
ALTER TABLE public.payroll_variables VALIDATE CONSTRAINT a26_variables_employee_same_org_fk;
ALTER TABLE public.payroll_lines VALIDATE CONSTRAINT a26_lines_period_same_org_fk;
ALTER TABLE public.payroll_lines VALIDATE CONSTRAINT a26_lines_employee_same_org_fk;
ALTER TABLE public.payroll_details VALIDATE CONSTRAINT a26_details_line_same_org_fk;
ALTER TABLE public.project_timers VALIDATE CONSTRAINT a26_timer_employee_same_org_fk;
ALTER TABLE public.project_timers VALIDATE CONSTRAINT a26_timer_project_same_org_fk;

-- ---------------------------------------------------------------------------
-- Garde-fous serveur pour les mutations sensibles.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.guard_org_invite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := (SELECT auth.uid());

  IF TG_OP = 'INSERT' THEN
    IF v_uid IS NULL OR NOT private.has_org_role(NEW.org_id, ARRAY['admin_rh']::text[]) THEN
      RAISE EXCEPTION 'Seul un administrateur RH de cette organisation peut créer une invitation';
    END IF;
    NEW.created_by := v_uid;
    NEW.active := true;
    NEW.redeemed_by := NULL;
    NEW.redeemed_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.code IS DISTINCT FROM OLD.code
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Une invitation existante ne peut pas changer d''organisation, de code, de rôle ou de créateur';
  END IF;

  IF OLD.active = false AND NEW.active = true THEN
    RAISE EXCEPTION 'Une invitation désactivée ne peut pas être réactivée';
  END IF;

  IF NEW.redeemed_by IS DISTINCT FROM OLD.redeemed_by
     OR NEW.redeemed_at IS DISTINCT FROM OLD.redeemed_at THEN
    IF v_uid IS NULL
       OR NEW.redeemed_by IS DISTINCT FROM v_uid
       OR NEW.redeemed_at IS NULL
       OR NEW.active IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'Le rattachement d''une invitation doit être effectué par le serveur';
    END IF;
  END IF;

  IF NEW.active IS DISTINCT FROM OLD.active
     AND NEW.active = false
     AND NEW.redeemed_by IS NULL THEN
    IF v_uid IS NULL OR NOT private.has_org_role(OLD.org_id, ARRAY['admin_rh']::text[]) THEN
      RAISE EXCEPTION 'Seul un administrateur RH peut désactiver une invitation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_org_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    RAISE EXCEPTION 'L''organisation des paramètres est immuable';
  END IF;
  NEW.updated_at := pg_catalog.clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Le journal d''audit est inaltérable';
  END IF;

  v_uid := (SELECT auth.uid());
  IF v_uid IS NOT NULL THEN
    IF NOT private.org_member(NEW.org_id) THEN
      RAISE EXCEPTION 'Un membre de cette organisation est requis pour journaliser une action';
    END IF;
    NEW.actor := v_uid;
    NEW.actor_email := (SELECT u.email FROM auth.users AS u WHERE u.id = v_uid);
  ELSIF (SELECT auth.role()) <> 'service_role' OR NEW.actor IS NULL THEN
    RAISE EXCEPTION 'Une identité de service ou utilisateur est requise pour journaliser une action';
  END IF;

  NEW.created_at := pg_catalog.clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_employee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    RAISE EXCEPTION 'L''organisation d''un salarié est immuable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_leave_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_manager boolean;
  v_owner boolean;
BEGIN
  v_uid := (SELECT auth.uid());
  v_manager := private.has_org_role(NEW.org_id, ARRAY['admin_rh','manager']::text[]);
  v_owner := private.employee_owned(NEW.org_id, NEW.employee_id);

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'pending'
       AND NEW.decided_by IS NULL
       AND NEW.decided_at IS NULL
       AND (v_owner OR v_manager) THEN
      RETURN NEW;
    END IF;

    -- Le seed de démonstration est exécuté dans un espace explicitement marqué.
    IF private.is_demo_org(NEW.org_id)
       AND private.has_org_role(NEW.org_id, ARRAY['admin_rh']::text[])
       AND NEW.status IN ('pending','approved') THEN
      IF NEW.status = 'approved' THEN
        NEW.decided_by := v_uid;
        NEW.decided_at := pg_catalog.clock_timestamp();
      ELSE
        NEW.decided_by := NULL;
        NEW.decided_at := NULL;
      END IF;
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Une demande de congé doit être créée à l''état pending';
  END IF;

  IF NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
     OR NEW.leave_type_id IS DISTINCT FROM OLD.leave_type_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Le rattachement d''une demande de congé est immuable';
  END IF;

  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'Une demande de congé déjà décidée est immuable';
  END IF;

  IF NEW.status = 'pending' THEN
    IF NOT (v_owner OR v_manager) THEN
      RAISE EXCEPTION 'Droit insuffisant pour modifier cette demande de congé';
    END IF;
    NEW.decided_by := NULL;
    NEW.decided_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled' THEN
    IF NOT (v_owner OR v_manager) THEN
      RAISE EXCEPTION 'Seul le salarié concerné ou un responsable peut annuler cette demande';
    END IF;
    NEW.decided_by := NULL;
    NEW.decided_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.status IN ('approved','rejected') THEN
    IF NOT v_manager OR v_owner OR v_uid IS NULL THEN
      RAISE EXCEPTION 'La décision doit être prise par un responsable différent du salarié';
    END IF;
    NEW.decided_by := v_uid;
    NEW.decided_at := pg_catalog.clock_timestamp();
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Transition de congé interdite';
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_timesheet_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_manager boolean;
  v_owner boolean;
BEGIN
  v_uid := (SELECT auth.uid());
  v_manager := private.has_org_role(NEW.org_id, ARRAY['admin_rh','manager']::text[]);
  v_owner := private.employee_owned(NEW.org_id, NEW.employee_id);

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('draft','submitted') AND (v_owner OR v_manager)
       AND NEW.approved_by IS NULL AND NEW.approved_at IS NULL THEN
      RETURN NEW;
    END IF;
    IF private.is_demo_org(NEW.org_id)
       AND private.has_org_role(NEW.org_id, ARRAY['admin_rh']::text[])
       AND NEW.status IN ('submitted','approved') THEN
      IF NEW.status = 'approved' THEN
        NEW.approved_by := v_uid;
        NEW.approved_at := pg_catalog.clock_timestamp();
      ELSE
        NEW.approved_by := NULL;
        NEW.approved_at := NULL;
      END IF;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Une feuille de temps doit être créée à l''état draft ou submitted';
  END IF;

  IF NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Le rattachement d''une feuille de temps est immuable';
  END IF;

  IF OLD.status = 'approved' THEN
    RAISE EXCEPTION 'Une feuille de temps approuvée est immuable';
  END IF;

  IF OLD.status IN ('draft','rejected') AND NEW.status IN ('draft','submitted') THEN
    IF NOT (v_owner OR v_manager) THEN
      RAISE EXCEPTION 'Droit insuffisant pour modifier cette feuille de temps';
    END IF;
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
    RETURN NEW;
  END IF;

  IF OLD.status = 'submitted' AND NEW.status IN ('approved','rejected') THEN
    IF NOT v_manager OR v_owner OR v_uid IS NULL THEN
      RAISE EXCEPTION 'La décision doit être prise par un responsable différent du salarié';
    END IF;
    NEW.approved_by := v_uid;
    NEW.approved_at := pg_catalog.clock_timestamp();
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Transition de feuille de temps interdite';
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_payroll_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := (SELECT auth.uid());

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

CREATE OR REPLACE FUNCTION private.guard_payroll_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_org uuid;
  v_status text;
BEGIN
  v_uid := (SELECT auth.uid());

  IF TG_OP = 'DELETE' THEN
    SELECT pp.org_id, pp.status INTO v_org, v_status
    FROM public.payroll_periods AS pp
    WHERE pp.id = OLD.period_id;
    IF private.is_demo_reset() THEN
      RETURN OLD;
    END IF;
    IF v_status <> 'open'
       OR v_uid IS NULL
       OR NOT private.has_org_role(OLD.org_id, ARRAY['admin_rh','preparateur']::text[]) THEN
      RAISE EXCEPTION 'Les lignes d''un cycle préparé ou verrouillé ne peuvent pas être supprimées';
    END IF;
    RETURN OLD;
  END IF;

  SELECT pp.org_id, pp.status INTO v_org, v_status
  FROM public.payroll_periods AS pp
  WHERE pp.id = NEW.period_id;
  IF v_org IS NULL OR v_org IS DISTINCT FROM NEW.org_id THEN
    RAISE EXCEPTION 'La ligne de paie doit appartenir à la même organisation que son cycle';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_uid IS NULL
       OR v_status <> 'open'
       OR NEW.status <> 'calculated'
       OR NOT private.has_org_role(NEW.org_id, ARRAY['admin_rh','preparateur']::text[]) THEN
      RAISE EXCEPTION 'Une ligne ne peut être calculée que dans un cycle ouvert';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.period_id IS DISTINCT FROM OLD.period_id
     OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Le rattachement d''une ligne de paie est immuable';
  END IF;

  -- La fonction d'envoi utilise le service role sans auth.uid(). Elle ne peut
  -- alors modifier que les deux colonnes de suivi d'e-mail.
  IF v_uid IS NULL
     AND v_status IN ('approved','locked')
     AND (pg_catalog.to_jsonb(NEW) - ARRAY['emailed_at','email_error']::text[])
         = (pg_catalog.to_jsonb(OLD) - ARRAY['emailed_at','email_error']::text[]) THEN
    RETURN NEW;
  END IF;

  IF v_status = 'open' AND NEW.status = 'calculated' THEN
    IF v_uid IS NULL OR NOT private.has_org_role(NEW.org_id, ARRAY['admin_rh','preparateur']::text[]) THEN
      RAISE EXCEPTION 'Droit insuffisant pour modifier une ligne calculée';
    END IF;
    RETURN NEW;
  END IF;

  IF v_status = 'approved'
     AND OLD.status = 'calculated'
     AND NEW.status = 'approved'
     AND v_uid IS NOT NULL
     AND private.has_org_role(NEW.org_id, ARRAY['admin_rh','approveur_paie']::text[])
     AND (pg_catalog.to_jsonb(NEW) - ARRAY['status']::text[])
         = (pg_catalog.to_jsonb(OLD) - ARRAY['status']::text[]) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Modification de ligne interdite après préparation ou approbation';
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_payroll_detail()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org uuid;
  v_period uuid;
  v_status text;
  v_uid uuid;
BEGIN
  v_uid := (SELECT auth.uid());
  SELECT l.org_id, l.period_id, pp.status
    INTO v_org, v_period, v_status
  FROM public.payroll_lines AS l
  JOIN public.payroll_periods AS pp ON pp.id = l.period_id
  WHERE l.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.line_id ELSE NEW.line_id END;

  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Le détail d''une paie est immuable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF private.is_demo_reset() THEN
      RETURN OLD;
    END IF;
    IF v_status <> 'open'
       OR v_uid IS NULL
       OR NOT private.has_org_role(OLD.org_id, ARRAY['admin_rh','preparateur']::text[]) THEN
      RAISE EXCEPTION 'Les détails d''un cycle préparé ou verrouillé ne peuvent pas être supprimés';
    END IF;
    RETURN OLD;
  END IF;

  IF v_org IS NULL OR v_org IS DISTINCT FROM NEW.org_id OR v_status <> 'open'
     OR v_uid IS NULL
     OR NOT private.has_org_role(NEW.org_id, ARRAY['admin_rh','preparateur']::text[]) THEN
    RAISE EXCEPTION 'Un détail ne peut être créé que dans un cycle ouvert de la même organisation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_payroll_variable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_period uuid;
  v_status text;
  v_org uuid;
  v_uid uuid;
BEGIN
  v_uid := (SELECT auth.uid());
  v_period := CASE WHEN TG_OP = 'DELETE' THEN OLD.period_id ELSE NEW.period_id END;
  v_org := CASE WHEN TG_OP = 'DELETE' THEN OLD.org_id ELSE NEW.org_id END;
  SELECT pp.status INTO v_status
  FROM public.payroll_periods AS pp
  WHERE pp.id = v_period AND pp.org_id = v_org;

  IF private.is_demo_reset() AND TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF v_uid IS NULL OR v_status <> 'open'
     OR NOT private.has_org_role(v_org, ARRAY['admin_rh','preparateur']::text[]) THEN
    RAISE EXCEPTION 'Les variables ne sont modifiables que dans un cycle ouvert par la paie';
  END IF;

  IF TG_OP = 'UPDATE'
     AND (NEW.org_id IS DISTINCT FROM OLD.org_id
       OR NEW.period_id IS DISTINCT FROM OLD.period_id
       OR NEW.employee_id IS DISTINCT FROM OLD.employee_id) THEN
    RAISE EXCEPTION 'Le rattachement d''une variable de paie est immuable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_project_timer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org uuid;
  v_employee uuid;
  v_uid uuid;
BEGIN
  v_uid := (SELECT auth.uid());
  IF TG_OP = 'DELETE' THEN
    v_org := OLD.org_id;
    v_employee := OLD.employee_id;
  ELSE
    v_org := NEW.org_id;
    v_employee := NEW.employee_id;
  END IF;

  IF v_uid IS NULL
     OR NOT (private.employee_owned(v_org, v_employee)
       OR private.has_org_role(v_org, ARRAY['admin_rh','manager']::text[])) THEN
    RAISE EXCEPTION 'Droit insuffisant sur ce chronomètre';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.org_id IS DISTINCT FROM OLD.org_id
       OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
       OR NEW.started_at IS DISTINCT FROM OLD.started_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'L''identité et le début d''un chronomètre sont immuables';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a26_guard_org_invite ON public.org_invites;
CREATE TRIGGER a26_guard_org_invite
BEFORE INSERT OR UPDATE ON public.org_invites
FOR EACH ROW EXECUTE FUNCTION private.guard_org_invite();

DROP TRIGGER IF EXISTS a26_guard_org_settings ON public.org_settings;
CREATE TRIGGER a26_guard_org_settings
BEFORE INSERT OR UPDATE ON public.org_settings
FOR EACH ROW EXECUTE FUNCTION private.guard_org_settings();

DROP TRIGGER IF EXISTS a26_guard_audit_log ON public.audit_log;
CREATE TRIGGER a26_guard_audit_log
BEFORE INSERT OR UPDATE OR DELETE ON public.audit_log
FOR EACH ROW EXECUTE FUNCTION private.guard_audit_log();

DROP TRIGGER IF EXISTS a26_guard_employee ON public.employees;
CREATE TRIGGER a26_guard_employee
BEFORE INSERT OR UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION private.guard_employee();

DROP TRIGGER IF EXISTS a26_guard_leave_request ON public.leave_requests;
CREATE TRIGGER a26_guard_leave_request
BEFORE INSERT OR UPDATE ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION private.guard_leave_request();

DROP TRIGGER IF EXISTS a26_guard_timesheet_entry ON public.timesheet_entries;
CREATE TRIGGER a26_guard_timesheet_entry
BEFORE INSERT OR UPDATE ON public.timesheet_entries
FOR EACH ROW EXECUTE FUNCTION private.guard_timesheet_entry();

DROP TRIGGER IF EXISTS a26_guard_payroll_period ON public.payroll_periods;
CREATE TRIGGER a26_guard_payroll_period
BEFORE INSERT OR UPDATE OR DELETE ON public.payroll_periods
FOR EACH ROW EXECUTE FUNCTION private.guard_payroll_period();

DROP TRIGGER IF EXISTS a26_guard_payroll_line ON public.payroll_lines;
CREATE TRIGGER a26_guard_payroll_line
BEFORE INSERT OR UPDATE OR DELETE ON public.payroll_lines
FOR EACH ROW EXECUTE FUNCTION private.guard_payroll_line();

DROP TRIGGER IF EXISTS a26_guard_payroll_detail ON public.payroll_details;
CREATE TRIGGER a26_guard_payroll_detail
BEFORE INSERT OR UPDATE OR DELETE ON public.payroll_details
FOR EACH ROW EXECUTE FUNCTION private.guard_payroll_detail();

DROP TRIGGER IF EXISTS a26_guard_payroll_variable ON public.payroll_variables;
CREATE TRIGGER a26_guard_payroll_variable
BEFORE INSERT OR UPDATE OR DELETE ON public.payroll_variables
FOR EACH ROW EXECUTE FUNCTION private.guard_payroll_variable();

DROP TRIGGER IF EXISTS a26_guard_project_timer ON public.project_timers;
CREATE TRIGGER a26_guard_project_timer
BEFORE INSERT OR UPDATE OR DELETE ON public.project_timers
FOR EACH ROW EXECUTE FUNCTION private.guard_project_timer();

-- ---------------------------------------------------------------------------
-- Fonctions SECURITY DEFINER publiques : autorisation explicite et search_path.
-- ---------------------------------------------------------------------------

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

CREATE OR REPLACE FUNCTION public.join_org(p_org uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_count integer;
  v_org uuid;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL OR p_role IS DISTINCT FROM 'admin_rh' THEN
    RAISE EXCEPTION 'L''initialisation d''une organisation exige le rôle admin_rh';
  END IF;

  SELECT o.id INTO v_org
  FROM public.orgs AS o
  WHERE o.id = p_org
  FOR UPDATE;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;
  SELECT count(*)::integer INTO v_count
  FROM public.memberships AS m
  WHERE m.org_id = p_org;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Cette organisation a déjà des membres : utilisez une invitation';
  END IF;

  INSERT INTO public.memberships (org_id, user_id, role)
  VALUES (p_org, v_uid, 'admin_rh');
  PERFORM public.ensure_org_defaults(p_org);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_org_with_defaults(
  p_name text, p_legal_name text, p_ncc text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_org uuid;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF p_name IS NULL OR pg_catalog.length(pg_catalog.btrim(p_name)) < 2 THEN
    RAISE EXCEPTION 'Nom d''organisation trop court';
  END IF;

  INSERT INTO public.orgs (name, legal_name, ncc)
  VALUES (
    pg_catalog.btrim(p_name),
    NULLIF(pg_catalog.btrim(COALESCE(p_legal_name, '')), ''),
    NULLIF(pg_catalog.btrim(COALESCE(p_ncc, '')), '')
  )
  RETURNING id INTO v_org;

  INSERT INTO public.memberships (org_id, user_id, role)
  VALUES (v_org, v_uid, 'admin_rh');
  PERFORM public.ensure_org_defaults(v_org);

  INSERT INTO public.audit_log (org_id, actor, actor_email, action, entity, details)
  VALUES (
    v_org, v_uid,
    (SELECT u.email FROM auth.users AS u WHERE u.id = v_uid),
    'create_org', 'orgs', pg_catalog.jsonb_build_object('name', pg_catalog.btrim(p_name))
  );
  RETURN v_org;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_employee(p_org uuid, p_employee_number text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_email text;
  v_confirmed timestamptz;
  v_emp uuid;
  v_emp_email text;
  v_emp_user uuid;
BEGIN
  v_uid := (SELECT auth.uid());
  SELECT u.email, u.email_confirmed_at INTO v_email, v_confirmed
  FROM auth.users AS u
  WHERE u.id = v_uid;
  IF v_uid IS NULL OR v_confirmed IS NULL THEN
    RAISE EXCEPTION 'Une adresse e-mail vérifiée est nécessaire pour rattacher un dossier';
  END IF;
  IF NOT private.org_member(p_org) THEN
    RAISE EXCEPTION 'Vous devez d''abord rejoindre cette organisation';
  END IF;

  SELECT e.id, e.email, e.user_id
    INTO v_emp, v_emp_email, v_emp_user
  FROM public.employees AS e
  WHERE e.org_id = p_org
    AND e.employee_number = pg_catalog.btrim(COALESCE(p_employee_number, ''))
  FOR UPDATE OF e;
  IF v_emp IS NULL THEN
    RAISE EXCEPTION 'Salarié introuvable dans cette organisation';
  END IF;
  IF v_emp_user IS NOT NULL AND v_emp_user <> v_uid THEN
    RAISE EXCEPTION 'Ce dossier salarié est déjà rattaché à un autre compte';
  END IF;
  IF v_emp_user IS NULL
     AND (v_emp_email IS NULL OR pg_catalog.lower(pg_catalog.btrim(v_emp_email))
          IS DISTINCT FROM pg_catalog.lower(pg_catalog.btrim(v_email))) THEN
    RAISE EXCEPTION 'Le matricule et l''adresse e-mail du compte ne correspondent pas';
  END IF;

  UPDATE public.employees AS e
  SET user_id = v_uid, updated_at = pg_catalog.clock_timestamp()
  WHERE e.id = v_emp AND e.org_id = p_org AND e.user_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ce dossier salarié vient d''être rattaché à un autre compte';
  END IF;

  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id)
  VALUES (p_org, v_uid, 'claim_employee', 'employees', v_emp::text);
  RETURN v_emp;
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_invite(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_code text;
  v_count integer;
  v_invite uuid;
  v_org uuid;
  v_role text;
BEGIN
  v_uid := (SELECT auth.uid());
  v_code := pg_catalog.upper(pg_catalog.btrim(COALESCE(p_code, '')));
  IF v_uid IS NULL OR pg_catalog.length(v_code) < 4 THEN
    RAISE EXCEPTION 'Code d''invitation invalide';
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.org_invites AS i
  WHERE pg_catalog.upper(pg_catalog.btrim(i.code)) = v_code
    AND i.active = true;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Code d''invitation invalide ou expiré';
  END IF;

  SELECT i.id, i.org_id, i.role
    INTO v_invite, v_org, v_role
  FROM public.org_invites AS i
  WHERE pg_catalog.upper(pg_catalog.btrim(i.code)) = v_code
    AND i.active = true
  FOR UPDATE OF i;

  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Code d''invitation invalide ou déjà utilisé';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.memberships AS m
    WHERE m.org_id = v_org AND m.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Ce compte est déjà membre de cette organisation';
  END IF;

  INSERT INTO public.memberships (org_id, user_id, role)
  VALUES (v_org, v_uid, v_role);
  UPDATE public.org_invites AS i
  SET active = false, redeemed_by = v_uid, redeemed_at = pg_catalog.clock_timestamp()
  WHERE i.id = v_invite AND i.active = true;

  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (v_org, v_uid, 'redeem_invite', 'memberships', v_uid::text,
          pg_catalog.jsonb_build_object('invite_id', v_invite));
  RETURN v_org;
END;
$$;

-- Les helpers de semis sont internes. Le seed reste conservé pour ne pas
-- réécrire les données de démonstration, mais il est désormais inappelable par
-- authenticated et son search_path est explicitement vide.
-- `seed_demo_data` predates this hardening migration and its body uses
-- unqualified table names. It is no longer callable by API roles, but the
-- trusted create/reseed functions still invoke it; keep its trusted public
-- search path until the seed body is fully qualified in a later migration.
ALTER FUNCTION public.seed_demo_data(uuid, text) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.ensure_org_defaults(uuid) FROM PUBLIC, anon, authenticated;
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
  DELETE FROM public.leave_requests WHERE org_id = p_org;
  DELETE FROM public.clock_entries WHERE org_id = p_org;
  DELETE FROM public.contracts WHERE org_id = p_org;
  DELETE FROM public.employees WHERE org_id = p_org;
  PERFORM pg_catalog.set_config('app.a26_demo_reset', 'off', true);

  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id)
  VALUES (p_org, v_uid, 'reset_demo', 'orgs', p_org::text);
END;
$$;

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
    WHEN 'pme' THEN 'Distribution Ivoire SARL'
    WHEN 'ong' THEN 'ONG Horizon Santé CI'
    ELSE 'Groupe ATLANTIQUE CI'
  END;

  INSERT INTO public.orgs (name, legal_name, ncc, is_demo, demo_kind)
  VALUES (
    v_name, v_name,
    'SIMU-' || pg_catalog.upper(pg_catalog.left(pg_catalog.md5(pg_catalog.random()::text), 8)),
    true, p_kind
  )
  RETURNING id INTO v_org;
  INSERT INTO public.memberships (org_id, user_id, role)
  VALUES (v_org, v_uid, 'admin_rh');
  PERFORM public.ensure_org_defaults(v_org);
  PERFORM public.seed_demo_data(v_org, p_kind);
  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (v_org, v_uid, 'create_demo_org', 'orgs', v_org::text,
          pg_catalog.jsonb_build_object('kind', p_kind));
  RETURN v_org;
END;
$$;

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
END;
$$;

-- L'ancienne porte d'initialisation acceptait n'importe quel utilisateur sur
-- une organisation vide avec le rôle admin_rh. L'initialisation client passe
-- désormais par create_org_with_defaults, atomique et propriétaire du compte.
REVOKE ALL ON FUNCTION public.join_org(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_org_with_defaults(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_org_with_defaults(text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.claim_employee(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_employee(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.redeem_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_invite(text) TO authenticated;
REVOKE ALL ON FUNCTION public.reset_demo_data(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_demo_org(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_demo_org(text) TO authenticated;
REVOKE ALL ON FUNCTION public.reseed_demo_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reseed_demo_data(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC atomiques pour les transitions métier.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.decide_leave_request(
  p_request_id uuid, p_status text, p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_org uuid;
  v_employee uuid;
  v_current text;
  v_uid uuid;
BEGIN
  v_uid := (SELECT auth.uid());
  SELECT lr.org_id, lr.employee_id, lr.status
    INTO v_org, v_employee, v_current
  FROM public.leave_requests AS lr
  WHERE lr.id = p_request_id
  FOR UPDATE;
  IF v_org IS NULL OR p_status NOT IN ('approved','rejected')
     OR v_uid IS NULL
     OR NOT private.has_org_role(v_org, ARRAY['admin_rh','manager']::text[])
     OR private.employee_owned(v_org, v_employee)
     OR v_current <> 'pending' THEN
    RAISE EXCEPTION 'Décision de congé interdite';
  END IF;
  UPDATE public.leave_requests AS lr
  SET status = p_status, decision_note = NULLIF(pg_catalog.btrim(COALESCE(p_note, '')), '')
  WHERE lr.id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande de congé introuvable';
  END IF;
  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (v_org, v_uid,
          CASE WHEN p_status = 'approved' THEN 'approve_leave' ELSE 'reject_leave' END,
          'leave_requests', p_request_id::text,
          pg_catalog.jsonb_build_object('decision_note', NULLIF(pg_catalog.btrim(COALESCE(p_note, '')), '')));
END;
$$;

CREATE OR REPLACE FUNCTION public.set_timesheet_status(
  p_entry_id uuid, p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_org uuid;
  v_employee uuid;
  v_current text;
  v_uid uuid;
BEGIN
  v_uid := (SELECT auth.uid());
  SELECT te.org_id, te.employee_id, te.status
    INTO v_org, v_employee, v_current
  FROM public.timesheet_entries AS te
  WHERE te.id = p_entry_id
  FOR UPDATE;
  IF v_org IS NULL OR p_status NOT IN ('approved','rejected')
     OR v_uid IS NULL
     OR NOT private.has_org_role(v_org, ARRAY['admin_rh','manager']::text[])
     OR private.employee_owned(v_org, v_employee)
     OR v_current <> 'submitted' THEN
    RAISE EXCEPTION 'Décision de feuille de temps interdite';
  END IF;
  UPDATE public.timesheet_entries AS te
  SET status = p_status
  WHERE te.id = p_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Feuille de temps introuvable';
  END IF;
  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (v_org, v_uid,
          CASE WHEN p_status = 'approved' THEN 'approve_timesheet' ELSE 'reject_timesheet' END,
          'timesheet_entries', p_entry_id::text, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_payroll_period(p_period_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_org uuid;
  v_status text;
  v_prepared_by uuid;
BEGIN
  v_uid := (SELECT auth.uid());
  SELECT pp.org_id, pp.status, pp.prepared_by
    INTO v_org, v_status, v_prepared_by
  FROM public.payroll_periods AS pp
  WHERE pp.id = p_period_id
  FOR UPDATE;
  IF v_uid IS NULL OR v_org IS NULL OR v_status <> 'prepared'
     OR v_prepared_by IS NULL OR v_prepared_by = v_uid
     OR NOT private.has_org_role(v_org, ARRAY['admin_rh','approveur_paie']::text[]) THEN
    RAISE EXCEPTION 'Ce cycle ne peut pas être approuvé par cet utilisateur';
  END IF;

  UPDATE public.payroll_periods AS pp
  SET status = 'approved', approved_by = v_uid, approved_at = pg_catalog.clock_timestamp()
  WHERE pp.id = p_period_id;
  UPDATE public.payroll_lines AS pl
  SET status = 'approved'
  WHERE pl.period_id = p_period_id AND pl.status = 'calculated';
  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (v_org, v_uid, 'approve_payroll', 'payroll_periods', p_period_id::text, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.lock_payroll_period(p_period_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_org uuid;
  v_status text;
BEGIN
  v_uid := (SELECT auth.uid());
  SELECT pp.org_id, pp.status INTO v_org, v_status
  FROM public.payroll_periods AS pp
  WHERE pp.id = p_period_id
  FOR UPDATE;
  IF v_uid IS NULL OR v_org IS NULL OR v_status <> 'approved'
     OR NOT private.has_org_role(v_org, ARRAY['admin_rh']::text[]) THEN
    RAISE EXCEPTION 'Seul un administrateur peut verrouiller un cycle approuvé';
  END IF;
  UPDATE public.payroll_periods AS pp
  SET status = 'locked'
  WHERE pp.id = p_period_id;
  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (v_org, v_uid, 'lock_payroll', 'payroll_periods', p_period_id::text, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_project_timer(p_timer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
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
  v_cursor timestamptz;
  v_segment_end timestamptz;
  v_work_date date;
  v_seconds numeric;
  v_hours numeric;
  v_entry uuid;
  v_existing_hours numeric;
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
  v_cursor := v_started;
  WHILE v_cursor < v_finished LOOP
    v_work_date := (v_cursor AT TIME ZONE COALESCE(NULLIF(v_timezone, ''), 'UTC'))::date;
    v_segment_end := LEAST(
      v_finished,
      ((v_work_date + 1)::timestamp AT TIME ZONE COALESCE(NULLIF(v_timezone, ''), 'UTC'))
    );
    v_seconds := GREATEST(0, EXTRACT(EPOCH FROM (v_segment_end - v_cursor)));
    v_hours := pg_catalog.round(v_seconds / 3600, 2);
    -- Keep a positive sub-minute segment visible instead of dropping it when
    -- the timesheet precision (hundredths of an hour) rounds to zero.
    IF v_seconds > 0 AND v_hours = 0 THEN v_hours := 0.01; END IF;

    IF v_hours > 0 THEN
      v_entry := NULL;
      v_existing_hours := NULL;
      SELECT te.id, te.hours INTO v_entry, v_existing_hours
      FROM public.timesheet_entries AS te
      WHERE te.org_id = v_org
        AND te.employee_id = v_employee
        AND te.project_id = v_project
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
        VALUES (v_org, v_employee, v_project, v_work_date, v_hours, v_note, 'draft');
      END IF;
    END IF;
    v_cursor := v_segment_end;
  END LOOP;
  DELETE FROM public.project_timers AS pt WHERE pt.id = p_timer_id;
  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (v_org, v_uid, 'finalize_project_timer', 'project_timers', p_timer_id::text,
          pg_catalog.jsonb_build_object('finished_at', v_finished));
END;
$$;

REVOKE ALL ON FUNCTION public.decide_leave_request(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_leave_request(uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.set_timesheet_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_timesheet_status(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.approve_payroll_period(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_payroll_period(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.lock_payroll_period(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lock_payroll_period(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.finalize_project_timer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_project_timer(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Politiques RLS finales. Les anciennes politiques de ces tables sont retirées
-- de façon déterministe afin qu'aucune autorisation permissive ne se cumule.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_policy record;
BEGIN
  FOR v_policy IN
    SELECT p.policyname, p.tablename
    FROM pg_catalog.pg_policies AS p
    WHERE p.schemaname = 'public'
      AND p.tablename IN (
        'orgs','memberships','employees','contracts','clock_entries',
        'payroll_rules','payroll_periods','payroll_lines','payroll_details',
        'payroll_variables','leave_requests','timesheet_entries',
        'project_timers','org_settings','org_invites','audit_log'
      )
  LOOP
    EXECUTE pg_catalog.format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      v_policy.policyname, v_policy.tablename
    );
  END LOOP;
END;
$$;

ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clock_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_variables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheet_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_timers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Organisations et memberships : création uniquement par RPC contrôlée.
CREATE POLICY a26_orgs_select_member ON public.orgs
FOR SELECT TO authenticated
USING (private.org_member(id));

CREATE POLICY a26_orgs_update_admin ON public.orgs
FOR UPDATE TO authenticated
USING (private.has_org_role(id, ARRAY['admin_rh']::text[]))
WITH CHECK (private.has_org_role(id, ARRAY['admin_rh']::text[]));

CREATE POLICY a26_memberships_select_scoped ON public.memberships
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR private.has_org_role(org_id, ARRAY['admin_rh','manager','auditeur']::text[])
);

-- DML memberships/orgs : uniquement les fonctions SECURITY DEFINER ci-dessus.
REVOKE INSERT, UPDATE, DELETE ON public.memberships FROM authenticated;
REVOKE INSERT ON public.orgs FROM authenticated;

CREATE POLICY a26_employees_select_scoped ON public.employees
FOR SELECT TO authenticated
USING (
  private.employee_owned(org_id, id)
  OR private.has_org_role(org_id, ARRAY['admin_rh','manager','preparateur','approveur_paie','auditeur']::text[])
);

CREATE POLICY a26_employees_insert_admin ON public.employees
FOR INSERT TO authenticated
WITH CHECK (private.has_org_role(org_id, ARRAY['admin_rh']::text[]));

CREATE POLICY a26_employees_update_admin ON public.employees
FOR UPDATE TO authenticated
USING (private.has_org_role(org_id, ARRAY['admin_rh']::text[]))
WITH CHECK (private.has_org_role(org_id, ARRAY['admin_rh']::text[]));

CREATE POLICY a26_employees_delete_admin ON public.employees
FOR DELETE TO authenticated
USING (private.has_org_role(org_id, ARRAY['admin_rh']::text[]));

CREATE POLICY a26_contracts_select_scoped ON public.contracts
FOR SELECT TO authenticated
USING (
  private.employee_owned(org_id, employee_id)
  OR private.has_org_role(org_id, ARRAY['admin_rh','preparateur','approveur_paie','auditeur']::text[])
);

CREATE POLICY a26_contracts_insert_admin ON public.contracts
FOR INSERT TO authenticated
WITH CHECK (private.has_org_role(org_id, ARRAY['admin_rh']::text[]));

CREATE POLICY a26_contracts_update_admin ON public.contracts
FOR UPDATE TO authenticated
USING (private.has_org_role(org_id, ARRAY['admin_rh']::text[]))
WITH CHECK (private.has_org_role(org_id, ARRAY['admin_rh']::text[]));

CREATE POLICY a26_contracts_delete_admin ON public.contracts
FOR DELETE TO authenticated
USING (private.has_org_role(org_id, ARRAY['admin_rh']::text[]));

CREATE POLICY a26_clock_select_scoped ON public.clock_entries
FOR SELECT TO authenticated
USING (
  private.employee_owned(org_id, employee_id)
  OR private.has_org_role(org_id, ARRAY['admin_rh','manager','preparateur','auditeur']::text[])
);

CREATE POLICY a26_clock_insert_scoped ON public.clock_entries
FOR INSERT TO authenticated
WITH CHECK (
  private.employee_in_org(org_id, employee_id)
  AND (
    private.employee_owned(org_id, employee_id)
    OR private.has_org_role(org_id, ARRAY['admin_rh','manager']::text[])
  )
);

CREATE POLICY a26_clock_update_own ON public.clock_entries
FOR UPDATE TO authenticated
USING (private.employee_owned(org_id, employee_id))
WITH CHECK (private.employee_owned(org_id, employee_id));

CREATE POLICY a26_clock_update_manager ON public.clock_entries
FOR UPDATE TO authenticated
USING (private.has_org_role(org_id, ARRAY['admin_rh','manager']::text[]))
WITH CHECK (private.has_org_role(org_id, ARRAY['admin_rh','manager']::text[]));

CREATE POLICY a26_clock_delete_admin ON public.clock_entries
FOR DELETE TO authenticated
USING (private.has_org_role(org_id, ARRAY['admin_rh']::text[]));

CREATE POLICY a26_rules_select_payroll ON public.payroll_rules
FOR SELECT TO authenticated
USING (private.has_org_role(org_id, ARRAY['admin_rh','preparateur','approveur_paie','auditeur']::text[]));

CREATE POLICY a26_rules_insert_payroll ON public.payroll_rules
FOR INSERT TO authenticated
WITH CHECK (private.has_org_role(org_id, ARRAY['admin_rh','preparateur']::text[]));

CREATE POLICY a26_rules_update_payroll ON public.payroll_rules
FOR UPDATE TO authenticated
USING (private.has_org_role(org_id, ARRAY['admin_rh','preparateur']::text[]))
WITH CHECK (private.has_org_role(org_id, ARRAY['admin_rh','preparateur']::text[]));

CREATE POLICY a26_rules_delete_admin ON public.payroll_rules
FOR DELETE TO authenticated
USING (private.has_org_role(org_id, ARRAY['admin_rh']::text[]));

CREATE POLICY a26_periods_select_member ON public.payroll_periods
FOR SELECT TO authenticated
USING (private.org_member(org_id));

CREATE POLICY a26_periods_insert_payroll ON public.payroll_periods
FOR INSERT TO authenticated
WITH CHECK (private.has_org_role(org_id, ARRAY['admin_rh','preparateur']::text[]));

CREATE POLICY a26_periods_update_transition ON public.payroll_periods
FOR UPDATE TO authenticated
USING (private.has_org_role(org_id, ARRAY['admin_rh','preparateur','approveur_paie']::text[]))
WITH CHECK (private.has_org_role(org_id, ARRAY['admin_rh','preparateur','approveur_paie']::text[]));

CREATE POLICY a26_periods_delete_open_admin ON public.payroll_periods
FOR DELETE TO authenticated
USING (
  private.has_org_role(org_id, ARRAY['admin_rh']::text[])
  AND status = 'open'
);

CREATE POLICY a26_variables_select_payroll ON public.payroll_variables
FOR SELECT TO authenticated
USING (private.has_org_role(org_id, ARRAY['admin_rh','preparateur','approveur_paie','auditeur']::text[]));

CREATE POLICY a26_variables_insert_open ON public.payroll_variables
FOR INSERT TO authenticated
WITH CHECK (
  private.has_org_role(org_id, ARRAY['admin_rh','preparateur']::text[])
  AND private.payroll_period_has_status(org_id, period_id, ARRAY['open']::text[])
);

CREATE POLICY a26_variables_update_open ON public.payroll_variables
FOR UPDATE TO authenticated
USING (
  private.has_org_role(org_id, ARRAY['admin_rh','preparateur']::text[])
  AND private.payroll_period_has_status(org_id, period_id, ARRAY['open']::text[])
)
WITH CHECK (
  private.has_org_role(org_id, ARRAY['admin_rh','preparateur']::text[])
  AND private.payroll_period_has_status(org_id, period_id, ARRAY['open']::text[])
);

CREATE POLICY a26_variables_delete_open ON public.payroll_variables
FOR DELETE TO authenticated
USING (
  private.has_org_role(org_id, ARRAY['admin_rh','preparateur']::text[])
  AND private.payroll_period_has_status(org_id, period_id, ARRAY['open']::text[])
);

CREATE POLICY a26_lines_select_scoped ON public.payroll_lines
FOR SELECT TO authenticated
USING (
  private.has_org_role(org_id, ARRAY['admin_rh','preparateur','approveur_paie','auditeur']::text[])
  OR (
    private.employee_owned(org_id, employee_id)
    AND status = 'approved'
    AND private.payroll_period_has_status(org_id, period_id, ARRAY['approved','locked']::text[])
  )
);

CREATE POLICY a26_lines_insert_open ON public.payroll_lines
FOR INSERT TO authenticated
WITH CHECK (
  private.has_org_role(org_id, ARRAY['admin_rh','preparateur']::text[])
  AND private.payroll_period_has_status(org_id, period_id, ARRAY['open']::text[])
);

CREATE POLICY a26_lines_update_transition ON public.payroll_lines
FOR UPDATE TO authenticated
USING (
  (
    private.has_org_role(org_id, ARRAY['admin_rh','preparateur']::text[])
    AND private.payroll_period_has_status(org_id, period_id, ARRAY['open']::text[])
  )
  OR (
    private.has_org_role(org_id, ARRAY['admin_rh','approveur_paie']::text[])
    AND status = 'calculated'
    AND private.payroll_period_has_status(org_id, period_id, ARRAY['approved']::text[])
  )
)
WITH CHECK (
  (
    private.has_org_role(org_id, ARRAY['admin_rh','preparateur']::text[])
    AND status = 'calculated'
    AND private.payroll_period_has_status(org_id, period_id, ARRAY['open']::text[])
  )
  OR (
    private.has_org_role(org_id, ARRAY['admin_rh','approveur_paie']::text[])
    AND status = 'approved'
    AND private.payroll_period_has_status(org_id, period_id, ARRAY['approved']::text[])
  )
);

CREATE POLICY a26_lines_delete_open ON public.payroll_lines
FOR DELETE TO authenticated
USING (
  private.has_org_role(org_id, ARRAY['admin_rh','preparateur']::text[])
  AND private.payroll_period_has_status(org_id, period_id, ARRAY['open']::text[])
);

CREATE POLICY a26_details_select_scoped ON public.payroll_details
FOR SELECT TO authenticated
USING (
  private.has_org_role(org_id, ARRAY['admin_rh','preparateur','approveur_paie','auditeur']::text[])
  OR EXISTS (
    SELECT 1
    FROM public.payroll_lines AS l
    WHERE l.id = payroll_details.line_id
      AND l.org_id = payroll_details.org_id
      AND l.status = 'approved'
      AND private.employee_owned(l.org_id, l.employee_id)
      AND private.payroll_period_has_status(l.org_id, l.period_id, ARRAY['approved','locked']::text[])
  )
);

CREATE POLICY a26_details_insert_open ON public.payroll_details
FOR INSERT TO authenticated
WITH CHECK (
  private.has_org_role(org_id, ARRAY['admin_rh','preparateur']::text[])
  AND EXISTS (
    SELECT 1
    FROM public.payroll_lines AS l
    WHERE l.id = payroll_details.line_id
      AND l.org_id = payroll_details.org_id
      AND private.payroll_period_has_status(l.org_id, l.period_id, ARRAY['open']::text[])
  )
);

CREATE POLICY a26_details_delete_open ON public.payroll_details
FOR DELETE TO authenticated
USING (
  private.has_org_role(org_id, ARRAY['admin_rh','preparateur']::text[])
  AND EXISTS (
    SELECT 1
    FROM public.payroll_lines AS l
    WHERE l.id = payroll_details.line_id
      AND l.org_id = payroll_details.org_id
      AND private.payroll_period_has_status(l.org_id, l.period_id, ARRAY['open']::text[])
  )
);

CREATE POLICY a26_leave_select_scoped ON public.leave_requests
FOR SELECT TO authenticated
USING (
  private.employee_owned(org_id, employee_id)
  OR private.has_org_role(org_id, ARRAY['admin_rh','manager','preparateur','auditeur']::text[])
);

CREATE POLICY a26_leave_insert_pending ON public.leave_requests
FOR INSERT TO authenticated
WITH CHECK (
  (
    private.employee_owned(org_id, employee_id)
    OR private.has_org_role(org_id, ARRAY['admin_rh','manager']::text[])
  )
  AND status = 'pending'
);

CREATE POLICY a26_leave_update_transition ON public.leave_requests
FOR UPDATE TO authenticated
USING (
  private.employee_owned(org_id, employee_id)
  OR private.has_org_role(org_id, ARRAY['admin_rh','manager']::text[])
)
WITH CHECK (
  private.employee_owned(org_id, employee_id)
  OR private.has_org_role(org_id, ARRAY['admin_rh','manager']::text[])
);

CREATE POLICY a26_leave_delete_admin ON public.leave_requests
FOR DELETE TO authenticated
USING (private.has_org_role(org_id, ARRAY['admin_rh']::text[]));

CREATE POLICY a26_timesheet_select_scoped ON public.timesheet_entries
FOR SELECT TO authenticated
USING (
  private.employee_owned(org_id, employee_id)
  OR private.has_org_role(org_id, ARRAY['admin_rh','manager','preparateur','auditeur']::text[])
);

CREATE POLICY a26_timesheet_insert_draft_or_submitted ON public.timesheet_entries
FOR INSERT TO authenticated
WITH CHECK (
  (
    private.employee_owned(org_id, employee_id)
    OR private.has_org_role(org_id, ARRAY['admin_rh','manager']::text[])
  )
  AND status IN ('draft','submitted')
);

CREATE POLICY a26_timesheet_update_transition ON public.timesheet_entries
FOR UPDATE TO authenticated
USING (
  private.employee_owned(org_id, employee_id)
  OR private.has_org_role(org_id, ARRAY['admin_rh','manager']::text[])
)
WITH CHECK (
  private.employee_owned(org_id, employee_id)
  OR private.has_org_role(org_id, ARRAY['admin_rh','manager']::text[])
);

CREATE POLICY a26_timesheet_delete_admin ON public.timesheet_entries
FOR DELETE TO authenticated
USING (private.has_org_role(org_id, ARRAY['admin_rh']::text[]));

CREATE POLICY a26_timers_select_scoped ON public.project_timers
FOR SELECT TO authenticated
USING (
  private.employee_owned(org_id, employee_id)
  OR private.has_org_role(org_id, ARRAY['admin_rh','manager']::text[])
);

CREATE POLICY a26_timers_insert_scoped ON public.project_timers
FOR INSERT TO authenticated
WITH CHECK (
  private.employee_in_org(org_id, employee_id)
  AND (
    private.employee_owned(org_id, employee_id)
    OR private.has_org_role(org_id, ARRAY['admin_rh','manager']::text[])
  )
);

CREATE POLICY a26_timers_update_scoped ON public.project_timers
FOR UPDATE TO authenticated
USING (
  private.employee_owned(org_id, employee_id)
  OR private.has_org_role(org_id, ARRAY['admin_rh','manager']::text[])
)
WITH CHECK (
  private.employee_owned(org_id, employee_id)
  OR private.has_org_role(org_id, ARRAY['admin_rh','manager']::text[])
);

CREATE POLICY a26_timers_delete_scoped ON public.project_timers
FOR DELETE TO authenticated
USING (
  private.employee_owned(org_id, employee_id)
  OR private.has_org_role(org_id, ARRAY['admin_rh','manager']::text[])
);

CREATE POLICY a26_settings_select_member ON public.org_settings
FOR SELECT TO authenticated
USING (private.org_member(org_id));

CREATE POLICY a26_settings_insert_admin ON public.org_settings
FOR INSERT TO authenticated
WITH CHECK (private.has_org_role(org_id, ARRAY['admin_rh','preparateur']::text[]));

CREATE POLICY a26_settings_update_admin ON public.org_settings
FOR UPDATE TO authenticated
USING (private.has_org_role(org_id, ARRAY['admin_rh','preparateur']::text[]))
WITH CHECK (private.has_org_role(org_id, ARRAY['admin_rh','preparateur']::text[]));

CREATE POLICY a26_invites_select_admin ON public.org_invites
FOR SELECT TO authenticated
USING (private.has_org_role(org_id, ARRAY['admin_rh']::text[]));

CREATE POLICY a26_invites_insert_admin ON public.org_invites
FOR INSERT TO authenticated
WITH CHECK (private.has_org_role(org_id, ARRAY['admin_rh']::text[]));

CREATE POLICY a26_invites_update_admin ON public.org_invites
FOR UPDATE TO authenticated
USING (private.has_org_role(org_id, ARRAY['admin_rh']::text[]))
WITH CHECK (private.has_org_role(org_id, ARRAY['admin_rh']::text[]));

-- Une invitation n'est jamais supprimée physiquement par le client : sa trace
-- reste disponible pour l'audit et elle peut seulement être désactivée.
REVOKE DELETE ON public.org_invites FROM authenticated;

CREATE POLICY a26_audit_select_scoped ON public.audit_log
FOR SELECT TO authenticated
USING (private.has_org_role(org_id, ARRAY['admin_rh','auditeur']::text[]));

CREATE POLICY a26_audit_insert_member ON public.audit_log
FOR INSERT TO authenticated
WITH CHECK (private.org_member(org_id));

-- Aucune politique UPDATE/DELETE : le journal reste inaltérable.
