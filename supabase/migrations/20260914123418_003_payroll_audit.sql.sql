/*
# Pré-paie (Côte d'Ivoire, SIMULATION), bulletins et journal d'audit

1. Résumé en français
   - Ajoute le module « Pré-paie » (calculs clairement étiquetés SIMULATION) et le
     journal d'audit inaltérable :
     * `payroll_periods`  : cycles de paie mensuels, circuit de clôture open ->
                            prepared (par le préparateur) -> approved (par un
                            approbateur paie, principe « quatre yeux ») -> locked.
     * `payroll_rules`    : paramètres de calcul versionnés et modifiables (taux CNPS,
                            CMU, FDFP, barème ITS, plafonds), chaque règle portant sa
                            source, étiquetée « simulation » tant qu'un expert local
                            n'a pas validé.
     * `payroll_lines`    : une ligne par salarié et par cycle : brut, retenues, net,
                            charges employeur, empreinte de sécurité du bulletin.
     * `payroll_details`  : détail EXPLICABLE : catégorie, base, taux, montant, règle
                            et version utilisée pour chaque composante du bulletin.
     * `audit_log`        : historique inaltérable (aucune politique de modification).

2. Sécurité
   - RLS activée ; lecture réservée aux membres de l'organisation.
   - Calcul : préparateur ou admin RH ; approbation : approbateur paie ; le contrôle
     « préparateur différent de l'approbateur » est fait dans l'application.
   - Journal d'audit : consultation admin RH / auditeur, insertion par tout membre,
     modification et suppression IMPOSSIBLES.

3. Notes
   - Montants en francs CFA (XOF), numeric(14,2). Les taux semés côté application sont
     des SIMULATIONS à valider par un expert local ; ils restent modifiables.
*/

-- ===== Règles de paie =====

CREATE TABLE IF NOT EXISTS public.payroll_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  category text NOT NULL CHECK (category IN ('cotisation_salarie','cotisation_employeur','impot','plafond','abarissement','autre')),
  value numeric(14,6) NOT NULL DEFAULT 0,
  bracket_from numeric(14,2),
  bracket_to numeric(14,2),
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  active boolean NOT NULL DEFAULT true,
  version int NOT NULL DEFAULT 1,
  source text NOT NULL DEFAULT 'SIMULATION — à valider par un expert local',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code, effective_from)
);

ALTER TABLE public.payroll_rules ENABLE ROW LEVEL SECURITY;

-- ===== Cycles de paie =====

CREATE TABLE IF NOT EXISTS public.payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  period_year int NOT NULL,
  period_month int NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','prepared','approved','locked')),
  prepared_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  prepared_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, period_year, period_month)
);

ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;

-- ===== Lignes de paie =====

CREATE TABLE IF NOT EXISTS public.payroll_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  base_salary numeric(14,2) NOT NULL DEFAULT 0,
  worked_hours numeric(6,2) NOT NULL DEFAULT 173.33,
  overtime_hours numeric(6,2) NOT NULL DEFAULT 0,
  unpaid_absence_days numeric(5,1) NOT NULL DEFAULT 0,
  bonuses numeric(14,2) NOT NULL DEFAULT 0,
  gross numeric(14,2) NOT NULL DEFAULT 0,
  cnps_employee numeric(14,2) NOT NULL DEFAULT 0,
  cmu_employee numeric(14,2) NOT NULL DEFAULT 0,
  its numeric(14,2) NOT NULL DEFAULT 0,
  net numeric(14,2) NOT NULL DEFAULT 0,
  employer_cnps numeric(14,2) NOT NULL DEFAULT 0,
  employer_cmu numeric(14,2) NOT NULL DEFAULT 0,
  employer_fdfp numeric(14,2) NOT NULL DEFAULT 0,
  employer_total numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'calculated' CHECK (status IN ('calculated','approved')),
  fingerprint text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payroll_lines ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS payroll_lines_period_idx ON public.payroll_lines (period_id, employee_id);
CREATE UNIQUE INDEX IF NOT EXISTS payroll_lines_period_employee_unique
  ON public.payroll_lines (org_id, period_id, employee_id);

-- ===== Détail explicatif des calculs =====

CREATE TABLE IF NOT EXISTS public.payroll_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  line_id uuid NOT NULL REFERENCES public.payroll_lines(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('gain','retenue_salarie','charge_employeur','impot')),
  label text NOT NULL,
  calc_base numeric(14,2),
  rate numeric(8,4),
  amount numeric(14,2) NOT NULL,
  rule_code text,
  rule_version int,
  rule_source text,
  position int NOT NULL DEFAULT 0
);

ALTER TABLE public.payroll_details ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS payroll_details_line_idx ON public.payroll_details (line_id);

-- ===== Journal d'audit =====

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS audit_org_created_idx ON public.audit_log (org_id, created_at DESC);

-- ===== Politiques RLS : payroll_rules =====

DROP POLICY IF EXISTS "payroll_rules_select_member" ON public.payroll_rules;
CREATE POLICY "payroll_rules_select_member"
ON public.payroll_rules FOR SELECT
TO authenticated
USING (public.is_member(org_id));

DROP POLICY IF EXISTS "payroll_rules_insert_paie" ON public.payroll_rules;
CREATE POLICY "payroll_rules_insert_paie"
ON public.payroll_rules FOR INSERT
TO authenticated
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','preparateur')
  )
);

DROP POLICY IF EXISTS "payroll_rules_update_paie" ON public.payroll_rules;
CREATE POLICY "payroll_rules_update_paie"
ON public.payroll_rules FOR UPDATE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','preparateur'))
)
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','preparateur'))
);

DROP POLICY IF EXISTS "payroll_rules_delete_admin" ON public.payroll_rules;
CREATE POLICY "payroll_rules_delete_admin"
ON public.payroll_rules FOR DELETE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
);

-- ===== Politiques RLS : payroll_periods =====

DROP POLICY IF EXISTS "periods_select_member" ON public.payroll_periods;
CREATE POLICY "periods_select_member"
ON public.payroll_periods FOR SELECT
TO authenticated
USING (public.is_member(org_id));

DROP POLICY IF EXISTS "periods_insert_paie" ON public.payroll_periods;
CREATE POLICY "periods_insert_paie"
ON public.payroll_periods FOR INSERT
TO authenticated
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','preparateur')
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
    WHERE m.org_id = org_id AND m.user_id = auth.uid()
      AND m.role IN ('admin_rh','preparateur','approveur_paie')
  )
)
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = org_id AND m.user_id = auth.uid()
      AND m.role IN ('admin_rh','preparateur','approveur_paie')
  )
);

DROP POLICY IF EXISTS "periods_delete_admin" ON public.payroll_periods;
CREATE POLICY "periods_delete_admin"
ON public.payroll_periods FOR DELETE
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role = 'admin_rh')
);

-- ===== Politiques RLS : payroll_lines =====

DROP POLICY IF EXISTS "lines_select_member" ON public.payroll_lines;
CREATE POLICY "lines_select_member"
ON public.payroll_lines FOR SELECT
TO authenticated
USING (public.is_member(org_id));

DROP POLICY IF EXISTS "lines_insert_paie" ON public.payroll_lines;
CREATE POLICY "lines_insert_paie"
ON public.payroll_lines FOR INSERT
TO authenticated
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','preparateur')
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
    WHERE m.org_id = org_id AND m.user_id = auth.uid()
      AND m.role IN ('admin_rh','preparateur','approveur_paie')
  )
)
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = org_id AND m.user_id = auth.uid()
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
    WHERE m.org_id = org_id AND m.user_id = auth.uid()
      AND m.role IN ('admin_rh','preparateur')
  )
);

-- ===== Politiques RLS : payroll_details =====

DROP POLICY IF EXISTS "details_select_member" ON public.payroll_details;
CREATE POLICY "details_select_member"
ON public.payroll_details FOR SELECT
TO authenticated
USING (public.is_member(org_id));

DROP POLICY IF EXISTS "details_insert_paie" ON public.payroll_details;
CREATE POLICY "details_insert_paie"
ON public.payroll_details FOR INSERT
TO authenticated
WITH CHECK (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','preparateur')
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
    WHERE m.org_id = org_id AND m.user_id = auth.uid()
      AND m.role IN ('admin_rh','preparateur')
  )
);

-- ===== Politiques RLS : audit_log (lecture et insertion uniquement) =====

DROP POLICY IF EXISTS "audit_select_admin_or_auditor" ON public.audit_log;
CREATE POLICY "audit_select_admin_or_auditor"
ON public.audit_log FOR SELECT
TO authenticated
USING (
  public.is_member(org_id)
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = org_id AND m.user_id = auth.uid() AND m.role IN ('admin_rh','auditeur')
  )
);

DROP POLICY IF EXISTS "audit_insert_member" ON public.audit_log;
CREATE POLICY "audit_insert_member"
ON public.audit_log FOR INSERT
TO authenticated
WITH CHECK (public.is_member(org_id));
-- Aucune politique UPDATE/DELETE : le journal est inaltérable.
