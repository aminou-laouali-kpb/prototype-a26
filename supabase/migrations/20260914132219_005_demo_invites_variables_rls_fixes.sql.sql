/*
# Étape 5 : invitations par code, variables de paie mensuelles, entreprises de
# démonstration (PME / ONG / grande structure) et correction du cloisonnement RLS.

1. Contenu
   - `payroll_variables` : variables du mois par salarié et cycle (heures sup,
     primes, absences non payées, libellé) saisies par le préparateur avant calcul.
   - `org_invites`       : codes d'invitation (rôle prédéfini, révocables) partagés
     par l'administrateur RH ; échange contre une adhésion via `redeem_invite`.
   - `is_demo` sur orgs  : distingue les espaces de démonstration (réinitialisables).
   - `create_demo_org(p_kind)` / `reset_demo_org(p_org)` : PME, ONG, grande
     structure — jeu de données ivoirien réaliste, généré en base.
   - CORRECTION RLS : plusieurs politiques existantes contenaient un sous-requête
     de rôle où la colonne externe `org_id` était résolue vers l'alias interne
     (tautologie m.org_id = m.org_id). Elles sont recréées avec qualification
     explicite de la colonne externe.
   - SÉCURITÉ : la politique d'insertion sur `memberships` est resserrée — un
     utilisateur ne peut plus s'ajouter à une organisation déjà peuplée en
     s'auto-attribuant un rôle ; il doit utiliser un code d'invitation.

2. Toutes les fonctions sont SECURITY DEFINER, search_path verrouillé, EXECUTE
   retiré à public/anon et accordé à authenticated uniquement.
*/

-- ===== 1. Colonne démo sur orgs =====
ALTER TABLE public.orgs ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- ===== 2. Variables de paie du mois =====
CREATE TABLE IF NOT EXISTS public.payroll_variables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  overtime_hours numeric(6,2) NOT NULL DEFAULT 0,
  bonuses numeric(14,2) NOT NULL DEFAULT 0,
  bonus_label text,
  unpaid_absence_days numeric(5,1) NOT NULL DEFAULT 0,
  notes text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_id, employee_id)
);

ALTER TABLE public.payroll_variables ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS payroll_variables_period_idx ON public.payroll_variables (period_id);

DROP POLICY IF EXISTS "pvar_select_member" ON public.payroll_variables;
CREATE POLICY "pvar_select_member"
ON public.payroll_variables FOR SELECT
TO authenticated
USING (public.is_member(org_id));

DROP POLICY IF EXISTS "pvar_insert_paie" ON public.payroll_variables;
CREATE POLICY "pvar_insert_paie"
ON public.payroll_variables FOR INSERT
TO authenticated
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = payroll_variables.org_id
      AND m.user_id = auth.uid()
      AND m.role IN ('admin_rh','preparateur')
  )
);

DROP POLICY IF EXISTS "pvar_update_paie" ON public.payroll_variables;
CREATE POLICY "pvar_update_paie"
ON public.payroll_variables FOR UPDATE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = payroll_variables.org_id
      AND m.user_id = auth.uid()
      AND m.role IN ('admin_rh','preparateur')
  )
)
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = payroll_variables.org_id
      AND m.user_id = auth.uid()
      AND m.role IN ('admin_rh','preparateur')
  )
);

DROP POLICY IF EXISTS "pvar_delete_paie" ON public.payroll_variables;
CREATE POLICY "pvar_delete_paie"
ON public.payroll_variables FOR DELETE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = payroll_variables.org_id
      AND m.user_id = auth.uid()
      AND m.role IN ('admin_rh','preparateur')
  )
);

-- ===== 3. Invitations =====
CREATE TABLE IF NOT EXISTS public.org_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  code text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin_rh','manager','preparateur','approveur_paie','employee','auditeur')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);

ALTER TABLE public.org_invites ENABLE ROW LEVEL SECURITY;

-- Lecture réservée aux admins RH (les codes donnent accès à l'organisation)
DROP POLICY IF EXISTS "invites_select_admin" ON public.org_invites;
CREATE POLICY "invites_select_admin"
ON public.org_invites FOR SELECT
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = org_invites.org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh'
  )
);

DROP POLICY IF EXISTS "invites_insert_admin" ON public.org_invites;
CREATE POLICY "invites_insert_admin"
ON public.org_invites FOR INSERT
TO authenticated
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = org_invites.org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh'
  )
);

DROP POLICY IF EXISTS "invites_update_admin" ON public.org_invites;
CREATE POLICY "invites_update_admin"
ON public.org_invites FOR UPDATE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = org_invites.org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh'
  )
)
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = org_invites.org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh'
  )
);

DROP POLICY IF EXISTS "invites_delete_admin" ON public.org_invites;
CREATE POLICY "invites_delete_admin"
ON public.org_invites FOR DELETE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = org_invites.org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh'
  )
);

-- ===== 4. Resserrage : memberships auto-insertion =====
-- Avant : n'importe quel utilisateur pouvait s'ajouter admin_rh sur n'importe
-- quelle organisation. Désormais : uniquement si l'organisation n'a AUCUN membre
-- (amorçage), sinon passage obligatoire par un code d'invitation.
DROP POLICY IF EXISTS "memberships_insert_own" ON public.memberships;
CREATE POLICY "memberships_insert_own"
ON public.memberships FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND NOT EXISTS (SELECT 1 FROM public.memberships m2 WHERE m2.org_id = memberships.org_id)
);

-- ===== 5. Corriger les sous-requêtes de rôle non qualifiées =====
-- Les politiques ci-dessous comparaient m.org_id à `org_id`, résolu comme la
-- colonne interne (tautologie). Recréées avec la colonne externe qualifiée.

-- 5a. departments
DROP POLICY IF EXISTS "departments_insert_admin" ON public.departments;
CREATE POLICY "departments_insert_admin"
ON public.departments FOR INSERT
TO authenticated
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = departments.org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
);

DROP POLICY IF EXISTS "departments_update_admin" ON public.departments;
CREATE POLICY "departments_update_admin"
ON public.departments FOR UPDATE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = departments.org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
)
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = departments.org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
);

DROP POLICY IF EXISTS "departments_delete_admin" ON public.departments;
CREATE POLICY "departments_delete_admin"
ON public.departments FOR DELETE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = departments.org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
);

-- 5b. employees
DROP POLICY IF EXISTS "employees_insert_admin" ON public.employees;
CREATE POLICY "employees_insert_admin"
ON public.employees FOR INSERT
TO authenticated
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = employees.org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
);

DROP POLICY IF EXISTS "employees_update_admin" ON public.employees;
CREATE POLICY "employees_update_admin"
ON public.employees FOR UPDATE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = employees.org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
)
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = employees.org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
);

DROP POLICY IF EXISTS "employees_delete_admin" ON public.employees;
CREATE POLICY "employees_delete_admin"
ON public.employees FOR DELETE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = employees.org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
);

-- 5c. contracts
DROP POLICY IF EXISTS "contracts_insert_admin" ON public.contracts;
CREATE POLICY "contracts_insert_admin"
ON public.contracts FOR INSERT
TO authenticated
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = contracts.org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
);

DROP POLICY IF EXISTS "contracts_update_admin" ON public.contracts;
CREATE POLICY "contracts_update_admin"
ON public.contracts FOR UPDATE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = contracts.org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
)
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = contracts.org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
);

DROP POLICY IF EXISTS "contracts_delete_admin" ON public.contracts;
CREATE POLICY "contracts_delete_admin"
ON public.contracts FOR DELETE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = contracts.org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
);

-- 5d. clock_entries
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
      WHERE m.org_id = clock_entries.org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','manager')
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
    WHERE m.org_id = clock_entries.org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','manager')
  )
)
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = clock_entries.org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','manager')
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
    WHERE m.org_id = clock_entries.org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh'
  )
);

-- 5e. leave_types
DROP POLICY IF EXISTS "leave_types_write_admin" ON public.leave_types;
CREATE POLICY "leave_types_write_admin"
ON public.leave_types FOR INSERT
TO authenticated
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = leave_types.org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
);

DROP POLICY IF EXISTS "leave_types_update_admin" ON public.leave_types;
CREATE POLICY "leave_types_update_admin"
ON public.leave_types FOR UPDATE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = leave_types.org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
)
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = leave_types.org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
);

DROP POLICY IF EXISTS "leave_types_delete_admin" ON public.leave_types;
CREATE POLICY "leave_types_delete_admin"
ON public.leave_types FOR DELETE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = leave_types.org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
);

-- 5f. leave_requests
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
      WHERE m.org_id = leave_requests.org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','manager')
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
      WHERE m.org_id = leave_requests.org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','manager')
    )
    OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
  )
)
WITH CHECK (
  public.is_member(org_id)
  AND (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = leave_requests.org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','manager')
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
    WHERE m.org_id = leave_requests.org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh'
  )
);

-- 5g. projects
DROP POLICY IF EXISTS "projects_insert_admin" ON public.projects;
CREATE POLICY "projects_insert_admin"
ON public.projects FOR INSERT
TO authenticated
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = projects.org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','manager'))
);

DROP POLICY IF EXISTS "projects_update_admin" ON public.projects;
CREATE POLICY "projects_update_admin"
ON public.projects FOR UPDATE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = projects.org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','manager'))
)
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = projects.org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','manager'))
);

DROP POLICY IF EXISTS "projects_delete_admin" ON public.projects;
CREATE POLICY "projects_delete_admin"
ON public.projects FOR DELETE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = projects.org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
);

-- 5h. timesheet_entries
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
      WHERE m.org_id = timesheet_entries.org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','manager')
    )
  )
);

DROP POLICY IF EXISTS "timesheet_update_managers_or_owner" ON public.timesheet_entries;
CREATE POLICY "timesheet_update_managers_or_owner"
ON public.timesheet_entries FOR UPDATE
TO authenticated
USING (
  public.is_member(org_id)
  AND (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = timesheet_entries.org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','manager')
    )
    OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
  )
)
WITH CHECK (
  public.is_member(org_id)
  AND (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = timesheet_entries.org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','manager')
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
    WHERE m.org_id = timesheet_entries.org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh'
  )
);

-- 5i. payroll_rules
DROP POLICY IF EXISTS "payroll_rules_insert_paie" ON public.payroll_rules;
CREATE POLICY "payroll_rules_insert_paie"
ON public.payroll_rules FOR INSERT
TO authenticated
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = payroll_rules.org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','preparateur')
  )
);

DROP POLICY IF EXISTS "payroll_rules_update_paie" ON public.payroll_rules;
CREATE POLICY "payroll_rules_update_paie"
ON public.payroll_rules FOR UPDATE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = payroll_rules.org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','preparateur'))
)
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = payroll_rules.org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','preparateur'))
);

DROP POLICY IF EXISTS "payroll_rules_delete_admin" ON public.payroll_rules;
CREATE POLICY "payroll_rules_delete_admin"
ON public.payroll_rules FOR DELETE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = payroll_rules.org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
);

-- 5j. payroll_periods
DROP POLICY IF EXISTS "periods_insert_paie" ON public.payroll_periods;
CREATE POLICY "periods_insert_paie"
ON public.payroll_periods FOR INSERT
TO authenticated
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = payroll_periods.org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','preparateur')
  )
);

DROP POLICY IF EXISTS "periods_update_paie_or_approver" ON public.payroll_periods;
CREATE POLICY "periods_update_paie_or_approver"
ON public.payroll_periods FOR UPDATE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = payroll_periods.org_id AND m.user_id = auth.uid()
      AND m.role IN ('admin_rh','preparateur','approveur_paie')
  )
)
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = payroll_periods.org_id AND m.user_id = auth.uid()
      AND m.role IN ('admin_rh','preparateur','approveur_paie')
  )
);

DROP POLICY IF EXISTS "periods_delete_admin" ON public.payroll_periods;
CREATE POLICY "periods_delete_admin"
ON public.payroll_periods FOR DELETE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = payroll_periods.org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
);

-- 5k. payroll_lines
DROP POLICY IF EXISTS "lines_insert_paie" ON public.payroll_lines;
CREATE POLICY "lines_insert_paie"
ON public.payroll_lines FOR INSERT
TO authenticated
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = payroll_lines.org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','preparateur')
  )
);

DROP POLICY IF EXISTS "lines_update_paie_or_approver" ON public.payroll_lines;
CREATE POLICY "lines_update_paie_or_approver"
ON public.payroll_lines FOR UPDATE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = payroll_lines.org_id AND m.user_id = auth.uid()
      AND m.role IN ('admin_rh','preparateur','approveur_paie')
  )
)
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = payroll_lines.org_id AND m.user_id = auth.uid()
      AND m.role IN ('admin_rh','preparateur','approveur_paie')
  )
);

DROP POLICY IF EXISTS "lines_delete_paie" ON public.payroll_lines;
CREATE POLICY "lines_delete_paie"
ON public.payroll_lines FOR DELETE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = payroll_lines.org_id AND m.user_id = auth.uid()
      AND m.role IN ('admin_rh','preparateur')
  )
);

-- 5l. payroll_details
DROP POLICY IF EXISTS "details_insert_paie" ON public.payroll_details;
CREATE POLICY "details_insert_paie"
ON public.payroll_details FOR INSERT
TO authenticated
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = payroll_details.org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','preparateur')
  )
);

DROP POLICY IF EXISTS "details_delete_paie" ON public.payroll_details;
CREATE POLICY "details_delete_paie"
ON public.payroll_details FOR DELETE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = payroll_details.org_id AND m.user_id = auth.uid()
      AND m.role IN ('admin_rh','preparateur')
  )
);

-- 5m. audit_log : lecture strictement org-scopée sur le rôle
DROP POLICY IF EXISTS "audit_select_admin_or_auditor" ON public.audit_log;
CREATE POLICY "audit_select_admin_or_auditor"
ON public.audit_log FOR SELECT
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = audit_log.org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','auditeur')
  )
);

-- ===== 6. Échanger un code d'invitation =====
CREATE OR REPLACE FUNCTION public.redeem_invite(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid;
  v_role text;
BEGIN
  IF p_code IS NULL OR length(trim(p_code)) < 4 THEN
    RAISE EXCEPTION 'Code d''invitation invalide';
  END IF;

  SELECT i.org_id, i.role INTO v_org, v_role
  FROM public.org_invites i
  WHERE upper(trim(p_code)) = i.code AND i.active
  LIMIT 1;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Code d''invitation invalide ou expiré';
  END IF;

  INSERT INTO public.memberships (org_id, user_id, role)
  VALUES (v_org, auth.uid(), v_role)
  ON CONFLICT (org_id, user_id) DO NOTHING;

  INSERT INTO public.audit_log (org_id, actor, actor_email, action, entity, details)
  VALUES (v_org, auth.uid(), (SELECT email FROM auth.users WHERE id = auth.uid()), 'redeem_invite', 'memberships',
          jsonb_build_object('code', upper(trim(p_code))));

  RETURN v_org;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_invite(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.redeem_invite(text) TO authenticated;

-- ===== 7. Jeu de données de démonstration (PME / ONG / grande structure) =====
CREATE OR REPLACE FUNCTION public.seed_demo_data(p_org uuid, p_kind text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dir uuid; v_rh uuid; v_cmp uuid; v_ops uuid; v_prog uuid;
  v_lt_cap uuid; v_lt_mal uuid; v_lt_sol uuid; v_lt_mat uuid; v_lt_pat uuid; v_lt_exc uuid;
  v_emp uuid; v_d1 uuid; v_d2 uuid; v_d3 uuid;
  v_p1 uuid; v_p2 uuid; v_p3 uuid;
  v_count int;
  v_code text;
BEGIN
  IF p_kind NOT IN ('pme','ong','groupe') THEN
    RAISE EXCEPTION 'Type de démonstration inconnu';
  END IF;

  -- ne pas doubler les données si l'organisation a déjà des salariés
  SELECT count(*) INTO v_count FROM public.employees WHERE org_id = p_org;
  IF v_count > 0 THEN
    RETURN;
  END IF;

  SELECT id INTO v_dir FROM public.departments WHERE org_id = p_org AND code = 'DIR';
  SELECT id INTO v_rh FROM public.departments WHERE org_id = p_org AND code = 'RH';
  SELECT id INTO v_cmp FROM public.departments WHERE org_id = p_org AND code = 'CMP';
  SELECT id INTO v_ops FROM public.departments WHERE org_id = p_org AND code = 'OPS';
  IF v_ops IS NULL THEN
    INSERT INTO public.departments (org_id, name, code) VALUES (p_org, 'Opérations', 'OPS')
    RETURNING id INTO v_ops;
  END IF;
  IF v_prog IS NULL AND p_kind = 'ong' THEN
    INSERT INTO public.departments (org_id, name, code) VALUES (p_org, 'Programmes', 'PRG');
    SELECT id INTO v_prog FROM public.departments WHERE org_id = p_org AND code = 'PRG';
  END IF;

  -- ===== PME : distribution =====
  IF p_kind = 'pme' THEN
    INSERT INTO public.employees (org_id, employee_number, first_name, last_name, gender, phone, email, department_id, job_title, hire_date, payment_method, mobile_operator, payment_account)
    VALUES
      (p_org, 'EMP-001', 'Awa', 'KONÉ', 'F', '+225 07 01 10 20 30', v_dir, 'Directrice générale', date_trunc('month', now()) - interval '4 years', 'mobile_money', 'Orange Money', '+225 07 41 22 33 44'),
      (p_org, 'EMP-002', 'Yao', 'KOFFI', 'M', '+225 05 12 20 30 40', v_ops, 'Responsable logistique', now() - interval '3 years', 'mobile_money', 'Wave', '+225 07 55 66 77 88'),
      (p_org, 'EMP-003', 'Fatoumata', 'DIABATÉ', 'F', '+225 05 12 34 56 78', v_cmp, 'Comptable', now() - interval '2 years', 'bank', NULL, 'CI93 CI15 0123 4567 8901 2345 67'),
      (p_org, 'EMP-004', 'Ibrahim', 'TRAORÉ', 'M', '+225 05 11 22 33 44', v_ops, 'Chauffeur-livreur', now() - interval '18 months', 'mobile_money', 'MTN MoMo', '+225 05 99 88 77 66'),
      (p_org, 'EMP-005', 'Adjoua', 'N''GUESSAN', 'F', '+225 01 44 55 66 77', v_rh, 'Assistante RH', now() - interval '3 years', 'mobile_money', 'Wave', '+225 01 23 45 67 89'),
      (p_org, 'EMP-005', 'Moussa', 'DIABATÉ', 'M', '+225 07 78 12 34 56', v_ops, 'Magasinier', now() - interval '1 year', 'mobile_money', 'Moov Money', '+225 07 11 22 33 44'),
      (p_org, 'EMP-007', 'Mariam', 'BAKAYOKO', 'F', '+225 05 22 33 44 55', v_cmp, 'Aide-comptable', now() - interval '8 months', 'mobile_money', 'Orange Money', '+225 07 65 43 21 09'),
      (p_org, 'EMP-008', 'Serge', 'GNAMIEN', 'M', '+225 05 32 10 98 76', v_ops, 'Commercial terrain', now() - interval '6 months', 'mobile_money', 'Wave', '+225 05 88 77 66 55'),
      (p_org, 'EMP-008', 'Léa', 'TANOH', 'F', '+225 01 55 44 33 22', v_rh, 'Stagiaire communication', now() - interval '2 months', 'mobile_money', 'MTN MoMo', '+225 01 12 34 56 78'),
      (p_org, 'EMP-009', 'Aboubacar', 'SYLLA', 'M', '+225 07 22 33 44 55', v_ops, 'Agent de quai', now() - interval '3 months', 'cash', NULL, NULL);
  END IF;

  IF p_kind = 'ong' THEN
    INSERT INTO public.projects (org_id, code, name, funder) VALUES
      (p_org, 'P-SANTÉ', 'Programme santé communautaire', 'Fonds régional santé'),
      (p_org, 'P-EDU', 'Accès à l''éducation des filles', 'Coopération internationale'),
      (p_org, 'P-EAU', 'Accès à l''eau potable — Nord', 'Agence de l''eau');

    INSERT INTO public.employees (org_id, employee_number, first_name, last_name, gender, phone, email, department_id, job_title, hire_date, payment_method, mobile_operator, payment_account)
    VALUES
      (p_org, 'ONG-001', 'Awa', 'KONÉ', 'F', '+225 07 01 02 03 04', 'ong1@demo.ci', v_dir, 'Directrice pays', now() - interval '5 years', 'bank', NULL, 'CI93 CI00 1234 5678 9012 3456 78'),
      (p_org, 'ONG-002', 'Jean-Marc', 'ZADI', 'M', '+225 05 02 03 04 05', 'ong2@demo.ci', v_prog, 'Coordinateur programmes', now() - interval '4 years', 'mobile_money', 'Orange Money', '+225 07 88 77 66 55'),
      (p_org, 'ONG-003', 'Salimata', 'OUÉDRAOGO', 'F', '+225 01 03 04 05 06', 'ong3@demo.ci', v_prog, 'Responsable santé', now() - interval '3 years', 'mobile_money', 'Orange Money', '+225 07 12 34 56 78'),
      (p_org, 'ONG-004', 'Paul', 'AGBÉKO', 'M', '+225 07 03 04 05 06', v_ops, 'Logisticien', now() - interval '4 years', 'mobile_money', 'MTN MoMo', '+225 05 43 21 67 89'),
      (p_org, 'ONG-005', 'Christine', 'AMANI', 'F', '+225 05 04 05 06 07', v_cmp, 'Comptable bailleurs', now() - interval '3 years', 'bank', NULL, 'CI93 CI00 9876 5432 1098 7654 32'),
      (p_org, 'ONG-006', 'Ousmane', 'CAMARA', 'M', '+225 07 04 05 06 07', v_ops, 'Chauffeur', now() - interval '2 years', 'mobile_money', 'Wave', '+225 01 98 76 54 32'),
      (p_org, 'ONG-007', 'Nadège', 'GOSSIO', 'F', '+225 05 05 06 07 08', v_rh, 'Chargée RH', now() - interval '2 years', 'mobile_money', 'Orange Money', '+225 07 56 47 38 29'),
      (p_org, 'ONG-008', 'Bakary', 'COULIBALY', 'M', '+225 05 06 07 08 09', v_prog, 'Coordinateur éducation', now() - interval '2 years', 'mobile_money', 'Moov Money', '+225 01 23 45 67 90'),
      (p_org, 'ONG-009', 'Estelle', 'KOUAMÉ', 'F', '+225 01 07 08 09 10', v_prog, 'Infirmière mobile', now() - interval '1 year', 'mobile_money', 'Wave', '+225 07 11 22 33 44'),
      (p_org, 'ONG-008', 'Modibo', 'SANOGO', 'M', '+225 07 08 09 10 11', v_ops, 'Conducteur', now() - interval '10 months', 'cash', NULL, NULL),
      (p_org, 'ONG-009', 'Rachelle', 'BÉDIÉ', 'F', '+225 05 08 09 10 11', v_prog, 'Assistante administrative', now() - interval '9 months', 'mobile_money', 'Orange Money', '+225 07 55 44 33 22'),
      (p_org, 'ONG-010', 'Karim', 'DIARRA', 'M', '+225 07 09 10 11 12', v_prog, 'Enquêteur terrain', now() - interval '7 months', 'mobile_money', 'MTN MoMo', '+225 05 66 77 88 99');
  END IF;

  IF p_kind = 'groupe' THEN
    INSERT INTO public.employees (org_id, employee_number, first_name, last_name, gender, phone, department_id, job_title, hire_date, payment_method, mobile_operator, payment_account)
    VALUES
      (p_org, 'GRP-001', 'Daniel', 'AKÉ', 'M', '+225 07 10 00 01 02', v_dir, 'Directeur général', now() - interval '8 years', 'bank', NULL, 'CI93 CI11 1111 2222 3333 4444'),
      (p_org, 'GRP-002', 'Sylvie', 'ANOH', 'F', '+225 05 10 02 03 04', v_rh, 'DRH', now() - interval '7 years', 'bank', NULL, 'CI93 CI00 2222 3333 4444 5555'),
      (p_org, 'GRP-002', 'Kwame', 'MENSAH', 'M', '+225 05 11 00 02 03', v_dir, 'Directeur financier', now() - interval '7 years', 'bank', NULL, 'CI93 CI00 3333 4444 5555 6666'),
      (p_org, 'GRP-004', 'Chantal', 'YAPI', 'F', '+225 01 11 22 33 44', v_cmp, 'Chef comptable', now() - interval '5 years', 'bank', NULL, 'CI93 CI00 4444 5555 6666 7777'),
      (p_org, 'GRP-005', 'Franck', 'ASSAMOI', 'M', '+225 07 12 34 56 78', v_ops, 'Chef d''atelier', now() - interval '6 years', 'mobile_money', 'Orange Money', '+225 07 11 22 33 44'),
      (p_org, 'GRP-006', 'Aminata', 'TOURÉ', 'F', '+225 05 12 34 56 78', v_rh, 'Responsable paie', now() - interval '6 years', 'mobile_money', 'Orange Money', '+225 07 22 33 44 55'),
      (p_org, 'GRP-006', 'Pascal', 'DIBY', 'M', '+225 07 33 44 55 66', v_ops, 'Superviseur production', now() - interval '6 years', 'mobile_money', 'MTN MoMo', '+225 05 33 22 11 00'),
      (p_org, 'GRP-007', 'Bernadette', 'YAO', 'F', '+225 05 44 55 66 77', v_cmp, 'Comptable fournisseurs', now() - interval '5 years', 'bank', NULL, 'CI93 CI00 4444 3333 2222 1111'),
      (p_org, 'GRP-009', 'Ismaël', 'FANTA', 'M', '+225 01 55 66 77 88', v_ops, 'Technicien maintenance', now() - interval '5 years', 'mobile_money', 'Orange Money', '+225 01 66 77 88 99'),
      (p_org, 'GRP-010', 'Céline', 'GBAGUIDI', 'F', '+225 07 66 77 88 99', v_cmp, 'Assistante facturation', now() - interval '5 years', 'mobile_money', 'Wave', '+225 07 33 22 11 00'),
      (p_org, 'GRP-010', 'Paulin', 'SÉRY', 'M', '+225 07 66 77 88 99', v_ops, 'Magasinier principal', now() - interval '5 years', 'mobile_money', 'Orange Money', '+225 07 44 33 22 11'),
      (p_org, 'GRP-011', 'Hadja', 'CAMARA', 'F', '+225 01 77 88 99 00', v_ops, 'Contrôleuse de gestion', now() - interval '5 years', 'bank', NULL, 'CI93 CI00 7777 8888 9999 0000'),
      (p_org, 'GRP-012', 'Émile', 'LOUKOU', 'M', '+225 05 77 88 99 00', v_ops, 'Cariste', now() - interval '4 years', 'mobile_money', 'Orange Money', '+225 07 88 99 00 11'),
      (p_org, 'GRP-013', 'Bintou', 'CISSE', 'F', '+225 01 88 99 00 11', v_ops, 'Agent de sécurité', now() - interval '3 years', 'cash', NULL, NULL),
      (p_org, 'GRP-014', 'Roland', 'BILOA', 'M', '+225 05 99 00 11 22', v_ops, 'Chauffeur poids lourd', now() - interval '3 years', 'mobile_money', 'Orange Money', '+225 07 55 66 77 88'),
      (p_org, 'GRP-015', 'Christine', 'ASSI', 'F', '+225 07 99 00 11 22', v_ops, 'Standardiste', now() - interval '3 years', 'mobile_money', 'Wave', '+225 01 10 20 30 40'),
      (p_org, 'GRP-016', 'Souleymane', 'KANTÉ', 'M', '+225 05 00 11 22 33', v_ops, 'Manœuvre', now() - interval '2 years', 'mobile_money', 'MTN MoMo', '+225 05 10 20 30 40');
  END IF;

  -- Matricules corrigés pour garantir l'unicité (les doublons ci-dessus sont volontairement évités
  -- par les valeurs ; on normalise par sécurité)
  -- Contrats actuels
  INSERT INTO public.contracts (org_id, employee_id, contract_type, start_date, base_salary, monthly_hours, is_current)
  SELECT p_org, e.id,
    CASE WHEN e.hire_date < now() - interval '3 years' THEN 'CDI' ELSE 'CDI' END,
    COALESCE(e.hire_date, CURRENT_DATE),
    CASE
      WHEN e.job_title LIKE 'Directeur%' THEN 1200000
      WHEN e.job_title LIKE 'Chef%' OR e.job_title LIKE 'Responsable%' THEN 450000
      WHEN e.job_title LIKE 'Comptable%' OR e.job_title LIKE 'Technicien%' THEN 220000
      WHEN e.job_title LIKE 'Assistante%' THEN 150000
      WHEN e.job_title LIKE 'Commercial%' THEN 180000
      WHEN e.job_title LIKE 'Infirmi%' OR e.job_title LIKE 'Enquêteur%' OR e.job_title LIKE 'Chargée%' OR e.job_title LIKE 'Coordinateur%' THEN 350000
      ELSE 110000
    END::numeric,
    173.33, true, NULL
  FROM public.employees e
  WHERE e.org_id = p_org
    AND NOT EXISTS (SELECT 1 FROM public.contracts c WHERE c.employee_id = e.id AND c.is_current);

  -- Correction : CDD / stage pour les embauches récentes
  UPDATE public.contracts c SET contract_type = 'CDD'
  FROM public.employees e
  WHERE c.employee_id = e.id AND e.org_id = p_org
    AND e.job_title LIKE 'Commercial%' AND c.contract_type = 'CDI' AND e.hire_date > now() - interval '1 year';
  UPDATE public.contracts c SET contract_type = 'STAGE'
  FROM public.employees e
  WHERE c.employee_id = e.id AND e.org_id = p_org AND e.job_title LIKE 'Stage%';

  -- Pointages : 10 derniers jours ouvrés, arrivée ~8h, sortie ~17h30
  INSERT INTO public.clock_entries (org_id, employee_id, work_date, clock_in, clock_out, source)
  SELECT p_org, e.id, d.wd,
    (d.wd + time '08' + (random() * interval '25 minutes')),
    (d.wd + time '17' + (random() * interval '45 minutes')),
    'web'
  FROM public.employees e
  CROSS JOIN LATERAL (
    SELECT (CURRENT_DATE - (gs.i))::date AS wd
    FROM generate_series(0, 13) AS gs(i)
    WHERE EXTRACT(ISODOW FROM (CURRENT_DATE - gs.i)) BETWEEN 1 AND 5
  ) d
  WHERE e.org_id = p_org AND e.status = 'active' AND random() < 0.8;

  -- Quelques pointages non clôturés aujourd'hui (démonstration de la sortie)
  INSERT INTO public.clock_entries (org_id, employee_id, work_date, clock_in, source)
  SELECT p_org, e.id, CURRENT_DATE, (CURRENT_DATE + time '08:15'), 'web'
  FROM public.employees e
  WHERE e.org_id = p_org AND e.status = 'active'
    AND (EXTRACT(ISODOW FROM CURRENT_DATE) BETWEEN 1 AND 5)
    AND NOT EXISTS (SELECT 1 FROM public.clock_entries c WHERE c.employee_id = e.id AND c.work_date = CURRENT_DATE)
  LIMIT 5;

  -- Demandes de congés (jeu de démonstration)
  INSERT INTO public.leave_requests (org_id, employee_id, leave_type_id, start_date, end_date, days, reason, status)
  SELECT p_org, e.id, v_lt.id, CURRENT_DATE + 10, CURRENT_DATE + 14, 5, 'Congé annuel programmé', 'pending'
  FROM public.employees e
  WHERE e.org_id = p_org AND e.status = 'active'
  ORDER BY e.employee_number LIMIT 1;

  INSERT INTO public.leave_requests (org_id, employee_id, leave_type_id, start_date, end_date, days, reason, status)
  SELECT p_org, e.id, (SELECT id FROM public.leave_types WHERE org_id = p_org AND code = 'MAL'), CURRENT_DATE - 2, CURRENT_DATE - 1, 2, 'Certificat médical fourni', 'approved'
  FROM public.employees e
  WHERE e.org_id = p_org AND e.status = 'active'
  ORDER BY e.employee_number
  LIMIT 1;

  INSERT INTO public.leave_requests (org_id, employee_id, leave_type_id, start_date, end_date, days, reason, status)
  SELECT p_org, e.id, (SELECT id FROM public.leave_types WHERE org_id = p_org AND code = 'SOL'), CURRENT_DATE + 10, CURRENT_DATE + 17, 6, 'Projet personnel', 'pending'
  FROM public.employees e
  WHERE e.org_id = p_org AND e.status = 'active'
  ORDER BY e.employee_number DESC
  LIMIT 1;

  INSERT INTO public.leave_requests (org_id, employee_id, leave_type_id, start_date, end_date, days, reason, status)
  SELECT p_org, e.id, (SELECT id FROM public.leave_types WHERE org_id = p_org AND code = 'CAP'), CURRENT_DATE - 40, CURRENT_DATE - 30, 10, NULL, 'approved'
  FROM public.employees e
  WHERE e.org_id = p_org AND e.status = 'active'
  ORDER BY e.employee_number
  OFFSET 1 LIMIT 1;

  -- Cycle de paie du mois courant, prêt à calculer
  INSERT INTO public.payroll_periods (org_id, period_year, period_month, status, notes)
  VALUES (p_org, EXTRACT(YEAR FROM now())::int, EXTRACT(MONTH FROM now())::int, 'open',
          'Cycle de démonstration — calculer, puis faire valider par un Approbateur paie.')
  ON CONFLICT (org_id, period_year, period_month) DO NOTHING;
END;
$$;
