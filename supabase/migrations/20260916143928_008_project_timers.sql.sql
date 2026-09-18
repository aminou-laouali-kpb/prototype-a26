/*
# Chronomètre multi-projets en temps réel

1. Résumé en français
   - Ajoute la table `project_timers` qui mémorise le chronomètre actif d'un salarié.
   - Un salarié ne peut avoir qu'UN seul chronomètre en cours à la fois (contrainte
     d'unicité sur `employee_id`). Démarrer un autre projet arrête le précédent et
     bascule la comptabilisation vers le nouveau projet.
   - Quand le salarié arrête ou change de projet, le temps écoulé est ajouté à sa
     feuille de temps du jour (`timesheet_entries`) par l'application. Cette table ne
     conserve donc que le chronomètre EN COURS, pas l'historique.

2. Nouvelle table : project_timers
   - `id` (uuid, clé primaire)
   - `org_id` (uuid) — organisation, cloisonnement
   - `employee_id` (uuid) — salarié propriétaire du chronomètre (unique)
   - `project_id` (uuid) — projet en cours de chronométrage
   - `started_at` (timestamptz) — instant de démarrage du segment courant
   - `note` (text) — activité optionnelle reportée sur la feuille de temps
   - `created_at` (timestamptz)

3. Sécurité (RLS)
   - RLS activée.
   - Lecture : tous les membres de l'organisation.
   - Écriture (insert/update/delete) : le salarié pour son propre chronomètre, ou un
     responsable / administrateur RH de l'organisation.
*/

CREATE TABLE IF NOT EXISTS public.project_timers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id)
);

ALTER TABLE public.project_timers ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS project_timers_org_idx ON public.project_timers (org_id);

DROP POLICY IF EXISTS "project_timers_select_member" ON public.project_timers;
CREATE POLICY "project_timers_select_member"
ON public.project_timers FOR SELECT
TO authenticated
USING (public.is_member(org_id));

DROP POLICY IF EXISTS "project_timers_insert_own_or_manager" ON public.project_timers;
CREATE POLICY "project_timers_insert_own_or_manager"
ON public.project_timers FOR INSERT
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

DROP POLICY IF EXISTS "project_timers_update_own_or_manager" ON public.project_timers;
CREATE POLICY "project_timers_update_own_or_manager"
ON public.project_timers FOR UPDATE
TO authenticated
USING (
  public.is_member(org_id)
  AND (
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','manager')
    )
  )
)
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

DROP POLICY IF EXISTS "project_timers_delete_own_or_manager" ON public.project_timers;
CREATE POLICY "project_timers_delete_own_or_manager"
ON public.project_timers FOR DELETE
TO authenticated
USING (
  public.is_member(org_id)
  AND (
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','manager')
    )
  )
);
