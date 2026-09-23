/*
# A26 — packs pays (Niger / CI), paiements, notifications, abonnement

1. `orgs.country_code` (CI | NE) + RPC `apply_country_pack` / `create_org_with_defaults` étendu.
2. Lots de paiement Mobile Money / espèces avec suivi payé / échec.
3. File `notification_outbox` (WhatsApp / e-mail).
4. Abonnement / essai `org_subscriptions`.
5. Rôle `cabinet` (multi-clients).
6. Libellés de bulletin issus des règles du pack (plus de CNPS figé).
*/

-- ---------------------------------------------------------------------------
-- Pays
-- ---------------------------------------------------------------------------

ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'CI';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orgs_country_code_check'
  ) THEN
    ALTER TABLE public.orgs
      ADD CONSTRAINT orgs_country_code_check CHECK (country_code IN ('CI', 'NE'));
  END IF;
END $$;

COMMENT ON COLUMN public.orgs.country_code IS 'Pack légal de pré-paie : CI (CNPS/ITS) ou NE (CNSS/IUTS).';

-- ---------------------------------------------------------------------------
-- Rôle cabinet
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS tbl
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'c'
      AND c.conrelid IN ('public.memberships'::regclass, 'public.org_invites'::regclass)
      AND a.attname = 'role'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', r.tbl, r.conname);
  END LOOP;
END $$;

ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_role_check
  CHECK (role IN ('admin_rh','manager','preparateur','approveur_paie','employee','auditeur','cabinet'));

ALTER TABLE public.org_invites
  ADD CONSTRAINT org_invites_role_check
  CHECK (role IN ('admin_rh','manager','preparateur','approveur_paie','employee','auditeur','cabinet'));

-- ---------------------------------------------------------------------------
-- Lots de paiement
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payment_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('mobile_money','cash','bank','mixed')),
  operator text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','exported','partial','paid','failed','cancelled')),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_batch_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.payment_batches(id) ON DELETE CASCADE,
  payroll_line_id uuid NOT NULL REFERENCES public.payroll_lines(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL,
  payment_method text CHECK (payment_method IN ('mobile_money','bank','cash')),
  mobile_operator text,
  payment_account text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','failed','skipped')),
  paid_at timestamptz,
  failure_reason text,
  receipt_note text,
  UNIQUE (batch_id, payroll_line_id)
);

CREATE INDEX IF NOT EXISTS payment_batches_org_period_idx
  ON public.payment_batches (org_id, period_id);
CREATE INDEX IF NOT EXISTS payment_batch_lines_batch_idx
  ON public.payment_batch_lines (batch_id);

ALTER TABLE public.payment_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_batch_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS a26_payment_batches_select ON public.payment_batches;
CREATE POLICY a26_payment_batches_select ON public.payment_batches FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = payment_batches.org_id AND m.user_id = auth.uid()
      AND m.role IN ('admin_rh','preparateur','approveur_paie','auditeur','cabinet')
  ));

DROP POLICY IF EXISTS a26_payment_batches_write ON public.payment_batches;
CREATE POLICY a26_payment_batches_write ON public.payment_batches FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = payment_batches.org_id AND m.user_id = auth.uid()
      AND m.role IN ('admin_rh','preparateur','approveur_paie')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = payment_batches.org_id AND m.user_id = auth.uid()
      AND m.role IN ('admin_rh','preparateur','approveur_paie')
  ));

DROP POLICY IF EXISTS a26_payment_lines_select ON public.payment_batch_lines;
CREATE POLICY a26_payment_lines_select ON public.payment_batch_lines FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = payment_batch_lines.org_id AND m.user_id = auth.uid()
      AND m.role IN ('admin_rh','preparateur','approveur_paie','auditeur','cabinet')
  ));

DROP POLICY IF EXISTS a26_payment_lines_write ON public.payment_batch_lines;
CREATE POLICY a26_payment_lines_write ON public.payment_batch_lines FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = payment_batch_lines.org_id AND m.user_id = auth.uid()
      AND m.role IN ('admin_rh','preparateur','approveur_paie')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = payment_batch_lines.org_id AND m.user_id = auth.uid()
      AND m.role IN ('admin_rh','preparateur','approveur_paie')
  ));

-- ---------------------------------------------------------------------------
-- Notifications (WhatsApp / e-mail)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('whatsapp','email','sms')),
  template_key text NOT NULL,
  recipient text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','failed','cancelled')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS notification_outbox_pending_idx
  ON public.notification_outbox (org_id, status, created_at)
  WHERE status = 'pending';

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS a26_notif_select ON public.notification_outbox;
CREATE POLICY a26_notif_select ON public.notification_outbox FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = notification_outbox.org_id AND m.user_id = auth.uid()
      AND m.role IN ('admin_rh','preparateur','manager')
  ));

DROP POLICY IF EXISTS a26_notif_insert ON public.notification_outbox;
CREATE POLICY a26_notif_insert ON public.notification_outbox FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = notification_outbox.org_id AND m.user_id = auth.uid()
      AND m.role IN ('admin_rh','preparateur','manager')
  ));

DROP POLICY IF EXISTS a26_notif_update ON public.notification_outbox;
CREATE POLICY a26_notif_update ON public.notification_outbox FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = notification_outbox.org_id AND m.user_id = auth.uid()
      AND m.role IN ('admin_rh','preparateur')
  ));

-- ---------------------------------------------------------------------------
-- Abonnement / essai
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.org_subscriptions (
  org_id uuid PRIMARY KEY REFERENCES public.orgs(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'trial'
    CHECK (plan IN ('trial','pme','groupe','cabinet')),
  status text NOT NULL DEFAULT 'trialing'
    CHECK (status IN ('trialing','active','past_due','cancelled','expired')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  seats integer NOT NULL DEFAULT 25,
  amount_xof numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.org_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS a26_subs_select ON public.org_subscriptions;
CREATE POLICY a26_subs_select ON public.org_subscriptions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = org_subscriptions.org_id AND m.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS a26_subs_admin ON public.org_subscriptions;
CREATE POLICY a26_subs_admin ON public.org_subscriptions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = org_subscriptions.org_id AND m.user_id = auth.uid()
      AND m.role IN ('admin_rh','cabinet')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = org_subscriptions.org_id AND m.user_id = auth.uid()
      AND m.role IN ('admin_rh','cabinet')
  ));

-- ---------------------------------------------------------------------------
-- Libellés bulletin = label de la règle du pack
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.payslip_rule_line(
  p_rules jsonb,
  p_pos integer,
  p_category text,
  p_label text,
  p_base numeric,
  p_code text,
  p_amount numeric
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_array(jsonb_build_object(
    'category', p_category,
    'label', COALESCE(private.rule_elem(p_rules, p_code)->>'label', p_label),
    'calc_base', CASE WHEN p_base IS NULL THEN NULL ELSE pg_catalog.round(p_base, 2) END,
    'rate', CASE
      WHEN private.rule_elem(p_rules, p_code) IS NULL THEN NULL
      ELSE pg_catalog.round((private.rule_elem(p_rules, p_code)->>'value')::numeric, 4)
    END,
    'amount', pg_catalog.round(p_amount, 2),
    'rule_code', p_code,
    'rule_version', CASE
      WHEN private.rule_elem(p_rules, p_code) IS NULL THEN NULL
      ELSE (private.rule_elem(p_rules, p_code)->>'version')::int
    END,
    'rule_source', CASE
      WHEN private.rule_elem(p_rules, p_code) IS NULL THEN NULL
      ELSE private.rule_elem(p_rules, p_code)->>'source'
    END,
    'position', p_pos
  ));
$$;

-- ---------------------------------------------------------------------------
-- Semis selon country_code
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_org_defaults(p_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_country text;
BEGIN
  SELECT country_code INTO v_country FROM public.orgs WHERE id = p_org;
  IF v_country IS NULL THEN
    v_country := 'CI';
  END IF;

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

  IF v_country = 'NE' THEN
    INSERT INTO public.leave_types (org_id, code, name, paid, annual_days)
    SELECT p_org, t.tcode, t.tname, t.tpaid, t.tdays
    FROM (VALUES
      ('CAP', 'Congé annuel payé', true, 30.0),
      ('MAL', 'Congé maladie', true, 0.0),
      ('MAT', 'Congé maternité (14 semaines indicatives)', true, 98.0),
      ('PAT', 'Congé paternité', true, 3.0),
      ('EXC', 'Autorisation exceptionnelle', true, 0.0),
      ('SOL', 'Congé sans solde', false, 0.0)
    ) AS t(tcode, tname, tpaid, tdays)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.leave_types lt WHERE lt.org_id = p_org AND lt.code = t.tcode
    );

    INSERT INTO public.payroll_rules (org_id, code, label, category, value, bracket_from, bracket_to, effective_from, source)
    SELECT p_org, r.rcode, r.rlabel, r.rcat, r.rval, r.rfrom, r.rto, CURRENT_DATE,
           'SIMULATION Niger — à valider par un expert local'
    FROM (VALUES
      ('cnps_pension_tx_salarie', 'CNSS pension vieillesse — part salariale', 'cotisation_salarie', 1.6::numeric, NULL::numeric, NULL::numeric),
      ('cnps_pension_tx_employeur', 'CNSS pension vieillesse — part employeur', 'cotisation_employeur', 4.0::numeric, NULL::numeric, NULL::numeric),
      ('cnps_pf_tx_employeur', 'CNSS prestations familiales — part employeur', 'cotisation_employeur', 5.5::numeric, NULL::numeric, NULL::numeric),
      ('cnps_at_tx_employeur', 'CNSS accidents du travail — part employeur', 'cotisation_employeur', 2.0::numeric, NULL::numeric, NULL::numeric),
      ('cnps_rp_tx_employeur', 'CNSS risques professionnels — part employeur', 'cotisation_employeur', 1.0::numeric, NULL::numeric, NULL::numeric),
      ('fdfp_tx_employeur', 'Formation professionnelle — part employeur', 'cotisation_employeur', 1.2::numeric, NULL::numeric, NULL::numeric),
      ('fdfp_tx_plan', 'Contribution formation complémentaire — part employeur', 'abatement', 0.3::numeric, NULL::numeric, NULL::numeric),
      ('cmu_tx_salarie', 'AMO / couverture maladie — part salariale', 'cotisation_salarie', 1.0::numeric, NULL::numeric, NULL::numeric),
      ('cmu_tx_employeur', 'AMO / couverture maladie — part employeur', 'cotisation_employeur', 3.0::numeric, NULL::numeric, NULL::numeric),
      ('plafond_mensuel', 'Plafond mensuel de cotisation CNSS (SIMULATION)', 'plafond', 500000::numeric, NULL::numeric, NULL::numeric),
      ('smig_mensuel', 'SMIG mensuel nigérien (SIMULATION)', 'plafond', 36000::numeric, NULL::numeric, NULL::numeric),
      ('taux_heures_supp', 'Majoration heures supplémentaires (%)', 'autre', 125::numeric, NULL::numeric, NULL::numeric),
      ('its_t1_tx', 'IUTS tranche 1 (0 à 25 000) — taux', 'impot', 0.0::numeric, 0::numeric, 25000::numeric),
      ('its_t2_tx', 'IUTS tranche 2 (25 001 à 50 000) — taux', 'impot', 2.0::numeric, 25000::numeric, 50000::numeric),
      ('its_t3_tx', 'IUTS tranche 3 (50 001 à 100 000) — taux', 'impot', 8.0::numeric, 50000::numeric, 100000::numeric),
      ('its_t4_tx', 'IUTS tranche 4 (100 001 à 200 000) — taux', 'impot', 15.0::numeric, 100000::numeric, 200000::numeric),
      ('its_t5_tx', 'IUTS tranche 5 (au-delà de 200 000) — taux', 'impot', 20.0::numeric, 200000::numeric, NULL::numeric)
    ) AS r(rcode, rlabel, rcat, rval, rfrom, rto)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.payroll_rules pr WHERE pr.org_id = p_org AND pr.code = r.rcode AND pr.active
    );
  ELSE
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

    INSERT INTO public.payroll_rules (org_id, code, label, category, value, bracket_from, bracket_to, effective_from, source)
    SELECT p_org, r.rcode, r.rlabel, r.rcat, r.rval, r.rfrom, r.rto, CURRENT_DATE,
           'SIMULATION — à valider par un expert local'
    FROM (VALUES
      ('cnps_pension_tx_salarie', 'CNPS pension vieillesse — part salariale', 'cotisation_salarie', 6.3::numeric, NULL::numeric, NULL::numeric),
      ('cnps_pension_tx_employeur', 'CNPS pension vieillesse — part employeur', 'cotisation_employeur', 7.7::numeric, NULL::numeric, NULL::numeric),
      ('cnps_pf_tx_employeur', 'CNPS prestations familiales — part employeur', 'cotisation_employeur', 5.75::numeric, NULL::numeric, NULL::numeric),
      ('cnps_at_tx_employeur', 'CNPS accidents du travail — part employeur', 'cotisation_employeur', 2.0::numeric, NULL::numeric, NULL::numeric),
      ('cnps_rp_tx_employeur', 'CNPS risques professionnels — part employeur', 'cotisation_employeur', 1.0::numeric, NULL::numeric, NULL::numeric),
      ('fdfp_tx_employeur', 'FDFP formation professionnelle — part employeur', 'cotisation_employeur', 1.4::numeric, NULL::numeric, NULL::numeric),
      ('fdfp_tx_plan', 'FDFP plan de développement — part employeur', 'abatement', 0.4::numeric, NULL::numeric, NULL::numeric),
      ('cmu_tx_salarie', 'CMU — part salariale', 'cotisation_salarie', 1.0::numeric, NULL::numeric, NULL::numeric),
      ('cmu_tx_employeur', 'CMU — part employeur', 'cotisation_employeur', 4.0::numeric, NULL::numeric, NULL::numeric),
      ('plafond_mensuel', 'Plafond mensuel de cotisation CNPS (SIMULATION)', 'plafond', 70000::numeric, NULL::numeric, NULL::numeric),
      ('smig_mensuel', 'SMIG mensuel ivoirien (SIMULATION)', 'plafond', 75000::numeric, NULL::numeric, NULL::numeric),
      ('taux_heures_supp', 'Majoration heures supplémentaires (%)', 'autre', 125::numeric, NULL::numeric, NULL::numeric),
      ('its_t1_tx', 'ITS tranche 1 (0 à 50 000) — taux', 'impot', 0.0::numeric, 0::numeric, 50000::numeric),
      ('its_t2_tx', 'ITS tranche 2 (50 001 à 290 000) — taux', 'impot', 10.0::numeric, 50000::numeric, 290000::numeric),
      ('its_t3_tx', 'ITS tranche 3 (290 001 à 530 000) — taux', 'impot', 15.0::numeric, 290000::numeric, 530000::numeric),
      ('its_t4_tx', 'ITS tranche 4 (au-delà de 530 000) — taux', 'impot', 25.0::numeric, 530000::numeric, NULL::numeric)
    ) AS r(rcode, rlabel, rcat, rval, rfrom, rto)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.payroll_rules pr WHERE pr.org_id = p_org AND pr.code = r.rcode AND pr.active
    );
  END IF;

  INSERT INTO public.org_subscriptions (org_id, plan, status, trial_ends_at, seats, amount_xof)
  VALUES (
    p_org,
    'trial',
    'trialing',
    now() + interval '30 days',
    25,
    0
  )
  ON CONFLICT (org_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_org_defaults(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ensure_org_defaults(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Appliquer / changer de pack pays (désactive anciennes règles, reseede)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_country_pack(p_org uuid, p_country text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_country NOT IN ('CI', 'NE') THEN
    RAISE EXCEPTION 'Pack pays inconnu : %', p_country;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = p_org AND m.user_id = auth.uid() AND m.role IN ('admin_rh', 'cabinet')
  ) THEN
    RAISE EXCEPTION 'Droits insuffisants pour changer le pack pays';
  END IF;

  UPDATE public.orgs SET country_code = p_country WHERE id = p_org;

  UPDATE public.payroll_rules
  SET active = false
  WHERE org_id = p_org AND active = true;

  -- Laisse les leave_types existants ; ensure_org_defaults ajoute les manquants
  -- et insère les nouvelles règles actives (codes absents ou inactifs → insert).
  -- Pour forcer un nouveau jeu, on insère même si un code inactif existe :
  INSERT INTO public.payroll_rules (org_id, code, label, category, value, bracket_from, bracket_to, effective_from, active, version, source)
  SELECT p_org, r.code, r.label, r.category, r.value, r.bracket_from, r.bracket_to, CURRENT_DATE, true, 1,
         CASE WHEN p_country = 'NE'
           THEN 'SIMULATION Niger — à valider par un expert local'
           ELSE 'SIMULATION — à valider par un expert local'
         END
  FROM public.payroll_rules r
  WHERE false; -- placeholder remplacé ci-dessous via ensure après delete soft

  -- Réutilise ensure : comme des règles actives n'existent plus, INSERT NOT EXISTS
  -- sur (org_id, code, active) ne suffit pas si un code inactif existe.
  -- On insère donc des règles fraîches via un INSERT SELECT dédié en réappelant
  -- la logique pays après avoir marqué inactive.
  PERFORM public.ensure_org_defaults(p_org);

  -- ensure_org_defaults skip si code existe même inactive — force insert manquant actifs
  IF p_country = 'NE' THEN
    INSERT INTO public.payroll_rules (org_id, code, label, category, value, bracket_from, bracket_to, effective_from, source)
    SELECT p_org, r.rcode, r.rlabel, r.rcat, r.rval, r.rfrom, r.rto, CURRENT_DATE,
           'SIMULATION Niger — à valider par un expert local'
    FROM (VALUES
      ('cnps_pension_tx_salarie', 'CNSS pension vieillesse — part salariale', 'cotisation_salarie', 1.6::numeric, NULL::numeric, NULL::numeric),
      ('cnps_pension_tx_employeur', 'CNSS pension vieillesse — part employeur', 'cotisation_employeur', 4.0::numeric, NULL::numeric, NULL::numeric),
      ('cnps_pf_tx_employeur', 'CNSS prestations familiales — part employeur', 'cotisation_employeur', 5.5::numeric, NULL::numeric, NULL::numeric),
      ('cnps_at_tx_employeur', 'CNSS accidents du travail — part employeur', 'cotisation_employeur', 2.0::numeric, NULL::numeric, NULL::numeric),
      ('cnps_rp_tx_employeur', 'CNSS risques professionnels — part employeur', 'cotisation_employeur', 1.0::numeric, NULL::numeric, NULL::numeric),
      ('fdfp_tx_employeur', 'Formation professionnelle — part employeur', 'cotisation_employeur', 1.2::numeric, NULL::numeric, NULL::numeric),
      ('fdfp_tx_plan', 'Contribution formation complémentaire — part employeur', 'abatement', 0.3::numeric, NULL::numeric, NULL::numeric),
      ('cmu_tx_salarie', 'AMO / couverture maladie — part salariale', 'cotisation_salarie', 1.0::numeric, NULL::numeric, NULL::numeric),
      ('cmu_tx_employeur', 'AMO / couverture maladie — part employeur', 'cotisation_employeur', 3.0::numeric, NULL::numeric, NULL::numeric),
      ('plafond_mensuel', 'Plafond mensuel de cotisation CNSS (SIMULATION)', 'plafond', 500000::numeric, NULL::numeric, NULL::numeric),
      ('smig_mensuel', 'SMIG mensuel nigérien (SIMULATION)', 'plafond', 36000::numeric, NULL::numeric, NULL::numeric),
      ('taux_heures_supp', 'Majoration heures supplémentaires (%)', 'autre', 125::numeric, NULL::numeric, NULL::numeric),
      ('its_t1_tx', 'IUTS tranche 1 (0 à 25 000) — taux', 'impot', 0.0::numeric, 0::numeric, 25000::numeric),
      ('its_t2_tx', 'IUTS tranche 2 (25 001 à 50 000) — taux', 'impot', 2.0::numeric, 25000::numeric, 50000::numeric),
      ('its_t3_tx', 'IUTS tranche 3 (50 001 à 100 000) — taux', 'impot', 8.0::numeric, 50000::numeric, 100000::numeric),
      ('its_t4_tx', 'IUTS tranche 4 (100 001 à 200 000) — taux', 'impot', 15.0::numeric, 100000::numeric, 200000::numeric),
      ('its_t5_tx', 'IUTS tranche 5 (au-delà de 200 000) — taux', 'impot', 20.0::numeric, 200000::numeric, NULL::numeric)
    ) AS r(rcode, rlabel, rcat, rval, rfrom, rto)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.payroll_rules pr
      WHERE pr.org_id = p_org AND pr.code = r.rcode AND pr.active
    );
  ELSE
    INSERT INTO public.payroll_rules (org_id, code, label, category, value, bracket_from, bracket_to, effective_from, source)
    SELECT p_org, r.rcode, r.rlabel, r.rcat, r.rval, r.rfrom, r.rto, CURRENT_DATE,
           'SIMULATION — à valider par un expert local'
    FROM (VALUES
      ('cnps_pension_tx_salarie', 'CNPS pension vieillesse — part salariale', 'cotisation_salarie', 6.3::numeric, NULL::numeric, NULL::numeric),
      ('cnps_pension_tx_employeur', 'CNPS pension vieillesse — part employeur', 'cotisation_employeur', 7.7::numeric, NULL::numeric, NULL::numeric),
      ('cnps_pf_tx_employeur', 'CNPS prestations familiales — part employeur', 'cotisation_employeur', 5.75::numeric, NULL::numeric, NULL::numeric),
      ('cnps_at_tx_employeur', 'CNPS accidents du travail — part employeur', 'cotisation_employeur', 2.0::numeric, NULL::numeric, NULL::numeric),
      ('cnps_rp_tx_employeur', 'CNPS risques professionnels — part employeur', 'cotisation_employeur', 1.0::numeric, NULL::numeric, NULL::numeric),
      ('fdfp_tx_employeur', 'FDFP formation professionnelle — part employeur', 'cotisation_employeur', 1.4::numeric, NULL::numeric, NULL::numeric),
      ('fdfp_tx_plan', 'FDFP plan de développement — part employeur', 'abatement', 0.4::numeric, NULL::numeric, NULL::numeric),
      ('cmu_tx_salarie', 'CMU — part salariale', 'cotisation_salarie', 1.0::numeric, NULL::numeric, NULL::numeric),
      ('cmu_tx_employeur', 'CMU — part employeur', 'cotisation_employeur', 4.0::numeric, NULL::numeric, NULL::numeric),
      ('plafond_mensuel', 'Plafond mensuel de cotisation CNPS (SIMULATION)', 'plafond', 70000::numeric, NULL::numeric, NULL::numeric),
      ('smig_mensuel', 'SMIG mensuel ivoirien (SIMULATION)', 'plafond', 75000::numeric, NULL::numeric, NULL::numeric),
      ('taux_heures_supp', 'Majoration heures supplémentaires (%)', 'autre', 125::numeric, NULL::numeric, NULL::numeric),
      ('its_t1_tx', 'ITS tranche 1 (0 à 50 000) — taux', 'impot', 0.0::numeric, 0::numeric, 50000::numeric),
      ('its_t2_tx', 'ITS tranche 2 (50 001 à 290 000) — taux', 'impot', 10.0::numeric, 50000::numeric, 290000::numeric),
      ('its_t3_tx', 'ITS tranche 3 (290 001 à 530 000) — taux', 'impot', 15.0::numeric, 290000::numeric, 530000::numeric),
      ('its_t4_tx', 'ITS tranche 4 (au-delà de 530 000) — taux', 'impot', 25.0::numeric, 530000::numeric, NULL::numeric)
    ) AS r(rcode, rlabel, rcat, rval, rfrom, rto)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.payroll_rules pr
      WHERE pr.org_id = p_org AND pr.code = r.rcode AND pr.active
    );
  END IF;

  INSERT INTO public.audit_log (org_id, actor, actor_email, action, entity, details)
  VALUES (
    p_org,
    auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    'apply_country_pack',
    'orgs',
    jsonb_build_object('country_code', p_country)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_country_pack(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.apply_country_pack(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Création d'org avec pays (défaut Niger)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_org_with_defaults(
  p_name text,
  p_legal_name text,
  p_ncc text,
  p_country_code text DEFAULT 'NE'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid;
  v_country text;
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) < 2 THEN
    RAISE EXCEPTION 'Nom d''organisation trop court';
  END IF;

  v_country := COALESCE(NULLIF(trim(p_country_code), ''), 'NE');
  IF v_country NOT IN ('CI', 'NE') THEN
    RAISE EXCEPTION 'Pack pays inconnu : %', v_country;
  END IF;

  INSERT INTO public.orgs (name, legal_name, ncc, country_code)
  VALUES (
    trim(p_name),
    NULLIF(trim(coalesce(p_legal_name, '')), ''),
    NULLIF(trim(coalesce(p_ncc, '')), ''),
    v_country
  )
  RETURNING id INTO v_org;

  INSERT INTO public.memberships (org_id, user_id, role)
  VALUES (v_org, auth.uid(), 'admin_rh');

  PERFORM public.ensure_org_defaults(v_org);

  INSERT INTO public.audit_log (org_id, actor, actor_email, action, entity, details)
  VALUES (
    v_org,
    auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    'create_org',
    'orgs',
    jsonb_build_object('name', p_name, 'country_code', v_country)
  );

  RETURN v_org;
END;
$$;

REVOKE ALL ON FUNCTION public.create_org_with_defaults(text, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_org_with_defaults(text, text, text, text) TO authenticated;

-- Rétrocompat : ancienne signature 3 args → Niger
CREATE OR REPLACE FUNCTION public.create_org_with_defaults(p_name text, p_legal_name text, p_ncc text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.create_org_with_defaults(p_name, p_legal_name, p_ncc, 'NE');
END;
$$;

REVOKE ALL ON FUNCTION public.create_org_with_defaults(text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_org_with_defaults(text, text, text) TO authenticated;

-- join_org : autoriser cabinet
CREATE OR REPLACE FUNCTION public.join_org(p_org uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count int;
BEGIN
  IF p_role NOT IN ('admin_rh','manager','preparateur','approveur_paie','employee','auditeur','cabinet') THEN
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

-- File notification helper
CREATE OR REPLACE FUNCTION public.enqueue_notification(
  p_org uuid,
  p_channel text,
  p_template text,
  p_recipient text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_channel NOT IN ('whatsapp', 'email', 'sms') THEN
    RAISE EXCEPTION 'Canal inconnu';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = p_org AND m.user_id = auth.uid()
      AND m.role IN ('admin_rh','preparateur','manager')
  ) THEN
    RAISE EXCEPTION 'Droits insuffisants';
  END IF;

  INSERT INTO public.notification_outbox (org_id, channel, template_key, recipient, payload)
  VALUES (p_org, p_channel, p_template, trim(p_recipient), COALESCE(p_payload, '{}'::jsonb))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_notification(uuid, text, text, text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_notification(uuid, text, text, text, jsonb) TO authenticated;
