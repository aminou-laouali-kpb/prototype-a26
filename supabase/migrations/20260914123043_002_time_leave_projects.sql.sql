/*
# Temps, congés et feuilles de temps projet

1. Résumé en français
   - Ajoute les modules « Temps de travail » et « Congés » ainsi que les feuilles de
     temps par projet/bailleur (utile aux ONG) :
     * `clock_entries`  : pointages entrée/sortie (web), avec corrections justifiées ;
     * `leave_types`    : types de congés de l'organisation (congé annuel payé, maladie,
                           maternité, exceptionnel...), avec nombre de jours annuels ;
     * `leave_requests` : demandes de congé (période, jours, statut, décision du
                           manager avec trace : qui, quand, motif) ;
     * `projects`       : projets/bailleurs pour l'allocation du temps ;
     * `timesheet_entries`: heures passées par jour/projet/activité, avec circuit
                           brouillon -> soumis -> approuvé/rejeté.
   - Un salarié ne voit que les données de son organisation (cloisonnement).

2. Colonnes notables
   - `clock_entries` : work_date, clock_in, clock_out (l'arrivée doit précéder le
     départ — contrainte en base), note, edited_by + edit_reason (correction justifiée).
   - `leave_requests` : statut pending/approved/rejected/cancelled, decided_by,
     decided_at, decision_note. `days` en numeric (demi-jours possibles).
   - `timesheet_entries` : statut draft/submitted/approved/rejected, heures 0,25 à 24,
     approbation tracée.

3. Sécurité
   - RLS activée ; lecture pour tous les membres de l'organisation.
   - Écritures : un salarié crée ses propres pointages/demandes/feuilles de temps ;
     seuls manager et admin_rh corrigent un pointage d'autrui, valident/refusent les
     congés (update sur leave_requests : manager ou admin_rh) et approuvent les
     feuilles de temps ; admin_rh gère types de congés et projets.
*/

-- ===== Pointages =====

CREATE TABLE IF NOT EXISTS public.clock_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  clock_in timestamptz NOT NULL,
  clock_out timestamptz,
  source text NOT NULL DEFAULT 'web',
  note text,
  edited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  edit_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clock_entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.clock_entries ADD CONSTRAINT clock_out_after_in
  CHECK (clock_out IS NULL OR clock_out > clock_in);

CREATE INDEX IF NOT EXISTS clock_entries_employee_date_idx
  ON public.clock_entries (employee_id, work_date);

-- ===== Types de congés =====

CREATE TABLE IF NOT EXISTS public.leave_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  paid boolean NOT NULL DEFAULT true,
  annual_days numeric(5,1) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);

ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;

-- ===== Demandes de congé =====

CREATE TABLE IF NOT EXISTS public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES public.leave_types(id) ON DELETE RESTRICT,
  start_date date NOT NULL,
  end_date date NOT NULL,
  days numeric(5,1) NOT NULL CHECK (days > 0),
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.leave_requests ADD CONSTRAINT leave_dates_ordered
  CHECK (end_date >= start_date);

CREATE INDEX IF NOT EXISTS leave_requests_employee_idx ON public.leave_requests (employee_id, start_date);

-- ===== Projets / bailleurs =====

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  code text,
  name text NOT NULL,
  funder text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- ===== Feuilles de temps (imputation par projet) =====

CREATE TABLE IF NOT EXISTS public.timesheet_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  hours numeric(5,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
  activity text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected')),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.timesheet_entries ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS timesheet_employee_date_idx
  ON public.timesheet_entries (employee_id, work_date);

-- ===== Fonction utilitaire : rôle courant dans une organisation =====

CREATE OR REPLACE FUNCTION public.my_role(p_org uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.role FROM public.memberships m
  WHERE m.org_id = p_org AND m.user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.my_role(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_role(uuid) TO authenticated;

-- ===== Politiques RLS : clock_entries =====

DROP POLICY IF EXISTS "clock_select_member" ON public.clock_entries;
CREATE POLICY "clock_select_member"
ON public.clock_entries FOR SELECT
TO authenticated
USING (public.is_member(org_id));

DROP POLICY IF EXISTS "clock_insert_member" ON public.clock_entries;
CREATE POLICY "clock_insert_member"
ON public.clock_entries FOR INSERT
TO authenticated
WITH CHECK (
  public.is_member(org_id)
  AND (
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','manager')
    )
  )
);

DROP POLICY IF EXISTS "clock_update_managers" ON public.clock_entries;
CREATE POLICY "clock_update_managers"
ON public.clock_entries FOR UPDATE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','manager')
  )
)
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','manager')
  )
);

DROP POLICY IF EXISTS "clock_delete_admin" ON public.clock_entries;
CREATE POLICY "clock_delete_admin"
ON public.clock_entries FOR DELETE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh'
  )
);

-- ===== Politiques RLS : leave_types =====

DROP POLICY IF EXISTS "leave_types_select_member" ON public.leave_types;
CREATE POLICY "leave_types_select_member"
ON public.leave_types FOR SELECT
TO authenticated
USING (public.is_member(org_id));

DROP POLICY IF EXISTS "leave_types_write_admin" ON public.leave_types;
CREATE POLICY "leave_types_write_admin"
ON public.leave_types FOR INSERT
TO authenticated
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
);

DROP POLICY IF EXISTS "leave_types_update_admin" ON public.leave_types;
CREATE POLICY "leave_types_update_admin"
ON public.leave_types FOR UPDATE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
)
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
);

DROP POLICY IF EXISTS "leave_types_delete_admin" ON public.leave_types;
CREATE POLICY "leave_types_delete_admin"
ON public.leave_types FOR DELETE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
);

-- ===== Politiques RLS : leave_requests =====

DROP POLICY IF EXISTS "leave_select_member" ON public.leave_requests;
CREATE POLICY "leave_select_member"
ON public.leave_requests FOR SELECT
TO authenticated
USING (public.is_member(org_id));

DROP POLICY IF EXISTS "leave_insert_own_or_admin" ON public.leave_requests;
CREATE POLICY "leave_insert_own_or_admin"
ON public.leave_requests FOR INSERT
TO authenticated
WITH CHECK (
  public.is_member(org_id)
  AND (
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','manager')
    )
  )
);

DROP POLICY IF EXISTS "leave_update_managers_or_owner" ON public.leave_requests;
CREATE POLICY "leave_update_managers_or_owner"
ON public.leave_requests FOR UPDATE
TO authenticated
USING (
  public.is_member(org_id)
  AND (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','manager')
    )
    OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
  )
)
WITH CHECK (
  public.is_member(org_id)
  AND (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','manager')
    )
    OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "leave_delete_admin" ON public.leave_requests;
CREATE POLICY "leave_delete_admin"
ON public.leave_requests FOR DELETE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh'
  )
);

-- ===== Politiques RLS : projects =====

DROP POLICY IF EXISTS "projects_select_member" ON public.projects;
CREATE POLICY "projects_select_member"
ON public.projects FOR SELECT
TO authenticated
USING (public.is_member(org_id));

DROP POLICY IF EXISTS "projects_insert_admin" ON public.projects;
CREATE POLICY "projects_insert_admin"
ON public.projects FOR INSERT
TO authenticated
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','manager'))
);

DROP POLICY IF EXISTS "projects_update_admin" ON public.projects;
CREATE POLICY "projects_update_admin"
ON public.projects FOR UPDATE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','manager'))
)
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','manager'))
);

DROP POLICY IF EXISTS "projects_delete_admin" ON public.projects;
CREATE POLICY "projects_delete_admin"
ON public.projects FOR DELETE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
);

-- ===== Politiques RLS : timesheet_entries =====

DROP POLICY IF EXISTS "timesheet_select_member" ON public.timesheet_entries;
CREATE POLICY "timesheet_select_member"
ON public.timesheet_entries FOR SELECT
TO authenticated
USING (public.is_member(org_id));

DROP POLICY IF EXISTS "timesheet_insert_member" ON public.timesheet_entries;
CREATE POLICY "timesheet_insert_member"
ON public.timesheet_entries FOR INSERT
TO authenticated
WITH CHECK (
  public.is_member(org_id)
  AND (
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','manager')
    )
  )
);

DROP POLICY IF EXISTS "timesheet_update_member" ON public.timesheet_entries;
CREATE POLICY "timesheet_update_managers_or_owner"
ON public.timesheet_entries FOR UPDATE
TO authenticated
USING (
  public.is_member(org_id)
  AND (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','manager')
    )
    OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
  )
)
WITH CHECK (
  public.is_member(org_id)
  AND (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','manager')
    )
    OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "timesheet_delete_admin" ON public.timesheet_entries;
CREATE POLICY "timesheet_delete_admin"
ON public.timesheet_entries FOR DELETE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh'
  )
);
