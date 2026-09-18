/*
# Plateforme Temps–RH–Pré-paie : noyau multi-entreprises (Côte d'Ivoire) — étape 1

1. Résumé en français
   - Crée le socle d'une application web RH multi-entreprises : chaque organisation
     (entreprise cliente) dispose de son propre espace cloisonné.
   - Les utilisateurs se connectent avec e-mail/mot de passe (Supabase Auth) et sont
     rattachés à une organisation via la table `memberships`, avec un rôle unique.
   - Rôles (champ `role` de `memberships`) :
     admin_rh (administrateur RH), manager (responsable d'équipe), preparateur
     (prépare la paie), approveur_paie (approuve la paie — principe des quatre yeux),
     employee (salarié), auditeur (lecture seule).
   - `is_member(uuid)` permet aux politiques RLS de vérifier l'appartenance à une
     organisation. Elle est créée APRÈS la table `memberships`.

2. Nouvelles tables
   - `orgs`        : organisations clientes (nom, raison sociale, NCC, devise XOF,
                     locale fr-CI, fuseau Africa/Abidjan).
   - `memberships` : rattachement utilisateur <-> organisation + rôle.
                     `user_id` NOT NULL DEFAULT auth.uid() (les inserts côté client
                     réussissent sans envoyer user_id). UNIQUE(org_id, user_id).
   - `departments` : services/équipes de l'organisation.
   - `employees`   : dossiers salariés (matricule unique PAR organisation, identité,
                     service, poste, embauche, statut, coordonnées de paiement).
   - `contracts`   : contrats historisés (CDI/CDD/essai/stage, dates, salaire de base
                     mensuel XOF, heures mensuelles — 173,33 h standard).

3. Sécurité (étape 1)
   - RLS activée sur les 5 tables ; politiques de base :
     * orgs / memberships / departments / employees / contracts : lecture limitée aux
       membres de l'organisation (via is_member) ;
     * écritures RH (departments, employees, contracts) réservées à admin_rh ;
     * chacun peut créer SA propre ligne dans memberships (pour rejoindre/créer une
       organisation) et insérer l'organisation qu'il crée.

4. Notes
   - Les salaires sont en numeric(14,2) (précision financière).
   - Les policies DROP ... IF EXISTS puis CREATE : migrations rejouables sans doublon.
*/

-- ===== Tables =====

CREATE TABLE IF NOT EXISTS public.orgs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text,
  ncc text,
  currency text NOT NULL DEFAULT 'XOF',
  locale text NOT NULL DEFAULT 'fr-CI',
  timezone text NOT NULL DEFAULT 'Africa/Abidjan',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin_rh','manager','preparateur','approveur_paie','employee','auditeur')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  employee_number text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  gender text CHECK (gender IN ('F','M')),
  birth_date date,
  phone text,
  email text,
  address text,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  job_title text,
  hire_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','archived')),
  payment_method text CHECK (payment_method IN ('mobile_money','bank','cash')),
  mobile_operator text,
  payment_account text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS employees_org_number_unique
  ON public.employees (org_id, employee_number);

CREATE TABLE IF NOT EXISTS public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  contract_type text NOT NULL CHECK (contract_type IN ('CDI','CDD','ESSAI','STAGE','APPRENTISSAGE')),
  start_date date NOT NULL,
  end_date date,
  base_salary numeric(14,2) NOT NULL DEFAULT 0,
  monthly_hours numeric(6,2) NOT NULL DEFAULT 173.33,
  is_current boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS contracts_employee_idx ON public.contracts (employee_id);
CREATE INDEX IF NOT EXISTS employees_org_idx ON public.employees (org_id);
CREATE INDEX IF NOT EXISTS departments_org_idx ON public.departments (org_id);

-- ===== Fonction utilitaire (après la table memberships) =====

CREATE OR REPLACE FUNCTION public.is_member(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = p_org AND m.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_member(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_member(uuid) TO authenticated;

-- ===== Politiques RLS =====

DROP POLICY IF EXISTS "orgs_select_member" ON public.orgs;
CREATE POLICY "orgs_select_member"
ON public.orgs FOR SELECT
TO authenticated
USING (public.is_member(id));

DROP POLICY IF EXISTS "orgs_insert_creator" ON public.orgs;
CREATE POLICY "orgs_insert_creator"
ON public.orgs FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "memberships_select_same_org" ON public.memberships;
CREATE POLICY "memberships_select_same_org"
ON public.memberships FOR SELECT
TO authenticated
USING (public.is_member(org_id));

DROP POLICY IF EXISTS "memberships_insert_own" ON public.memberships;
CREATE POLICY "memberships_insert_own"
ON public.memberships FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "departments_select_member" ON public.departments;
CREATE POLICY "departments_select_member"
ON public.departments FOR SELECT
TO authenticated
USING (public.is_member(org_id));

DROP POLICY IF EXISTS "departments_insert_admin" ON public.departments;
CREATE POLICY "departments_insert_admin"
ON public.departments FOR INSERT
TO authenticated
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
);

DROP POLICY IF EXISTS "departments_update_admin" ON public.departments;
CREATE POLICY "departments_update_admin"
ON public.departments FOR UPDATE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
)
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
);

DROP POLICY IF EXISTS "departments_delete_admin" ON public.departments;
CREATE POLICY "departments_delete_admin"
ON public.departments FOR DELETE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
);

DROP POLICY IF EXISTS "employees_select_member" ON public.employees;
CREATE POLICY "employees_select_member"
ON public.employees FOR SELECT
TO authenticated
USING (public.is_member(org_id));

DROP POLICY IF EXISTS "employees_insert_admin" ON public.employees;
CREATE POLICY "employees_insert_admin"
ON public.employees FOR INSERT
TO authenticated
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
);

DROP POLICY IF EXISTS "employees_update_admin" ON public.employees;
CREATE POLICY "employees_update_admin"
ON public.employees FOR UPDATE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
)
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
);

DROP POLICY IF EXISTS "employees_delete_admin" ON public.employees;
CREATE POLICY "employees_delete_admin"
ON public.employees FOR DELETE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
);

DROP POLICY IF EXISTS "contracts_select_member" ON public.contracts;
CREATE POLICY "contracts_select_member"
ON public.contracts FOR SELECT
TO authenticated
USING (public.is_member(org_id));

DROP POLICY IF EXISTS "contracts_insert_admin" ON public.contracts;
CREATE POLICY "contracts_insert_admin"
ON public.contracts FOR INSERT
TO authenticated
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
);

DROP POLICY IF EXISTS "contracts_update_admin" ON public.contracts;
CREATE POLICY "contracts_update_admin"
ON public.contracts FOR UPDATE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
)
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
);

DROP POLICY IF EXISTS "contracts_delete_admin" ON public.contracts;
CREATE POLICY "contracts_delete_admin"
ON public.contracts FOR DELETE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
);
