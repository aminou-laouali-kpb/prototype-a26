-- A26 — Performance et récompenses (lots A à D de la feuille de route)
--
-- A  cycles, objectifs, déclaration du salarié, validation du responsable
-- B  réglages, indicateurs automatiques, score composite et lignes de détail
-- C  badges de reconnaissance (message WhatsApp en file d'attente)
-- D  prime proposée en brouillon, jours de congé bonus, budget formation
--
-- Mêmes principes que les primes (013) : écritures par fonctions SECURITY DEFINER
-- avec search_path vide, droit vérifié par private.has_org_role, une ligne
-- audit_log par action, aucun INSERT/UPDATE/DELETE direct depuis le navigateur.
-- Les indicateurs automatiques ne servent jamais seuls à sanctionner : le score
-- ouvre un échange, il ne touche pas au salaire. La prime passe par le circuit
-- 013 (brouillon → validée → cycle ouvert → versée), sans nouveau circuit de paie.

-- ---------------------------------------------------------------------------
-- 0. Colonnes d'appui sur l'existant
-- ---------------------------------------------------------------------------

-- Heure de soumission de la feuille mensuelle, écrite par le serveur.
ALTER TABLE public.timesheet_entries ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

CREATE OR REPLACE FUNCTION private.stamp_timesheet_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.submitted_at := CASE
      WHEN NEW.status = 'submitted' THEN pg_catalog.clock_timestamp()
      ELSE NULL
    END;
    RETURN NEW;
  END IF;

  IF NEW.status = 'submitted' THEN
    IF OLD.status = 'submitted' THEN
      NEW.submitted_at := OLD.submitted_at;
    ELSE
      NEW.submitted_at := pg_catalog.clock_timestamp();
    END IF;
  ELSIF NEW.status IN ('approved', 'rejected') THEN
    NEW.submitted_at := OLD.submitted_at;
  ELSE
    NEW.submitted_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_stamp_timesheet_submitted ON public.timesheet_entries;
CREATE TRIGGER zz_stamp_timesheet_submitted
BEFORE INSERT OR UPDATE ON public.timesheet_entries
FOR EACH ROW EXECUTE FUNCTION private.stamp_timesheet_submitted();

-- Lien prime → score (une seule prime active par score).
ALTER TABLE public.employee_bonuses ADD COLUMN IF NOT EXISTS score_id uuid;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.performance_settings (
  org_id uuid PRIMARY KEY REFERENCES public.orgs(id) ON DELETE CASCADE,
  weight_objectives integer NOT NULL DEFAULT 60 CHECK (weight_objectives BETWEEN 0 AND 100),
  expected_start_time time NOT NULL DEFAULT '08:00',
  late_grace_minutes integer NOT NULL DEFAULT 15 CHECK (late_grace_minutes BETWEEN 0 AND 240),
  submission_grace_days integer NOT NULL DEFAULT 5 CHECK (submission_grace_days BETWEEN 0 AND 31),
  daily_hours numeric(4,2) NOT NULL DEFAULT 8 CHECK (daily_hours > 0 AND daily_hours <= 24),
  work_days integer[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  holidays date[] NOT NULL DEFAULT ARRAY[]::date[],
  timezone text NOT NULL DEFAULT 'Africa/Niamey',
  weight_punctuality integer NOT NULL DEFAULT 30 CHECK (weight_punctuality BETWEEN 0 AND 100),
  weight_attendance integer NOT NULL DEFAULT 30 CHECK (weight_attendance BETWEEN 0 AND 100),
  weight_project_hours integer NOT NULL DEFAULT 20 CHECK (weight_project_hours BETWEEN 0 AND 100),
  weight_submission integer NOT NULL DEFAULT 20 CHECK (weight_submission BETWEEN 0 AND 100),
  weight_corrections integer NOT NULL DEFAULT 0 CHECK (weight_corrections BETWEEN 0 AND 100),
  conform_threshold integer NOT NULL DEFAULT 60,
  good_threshold integer NOT NULL DEFAULT 75,
  excellent_threshold integer NOT NULL DEFAULT 85,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT performance_kpi_weights_sum CHECK (
    weight_punctuality + weight_attendance + weight_project_hours
    + weight_submission + weight_corrections = 100
  ),
  CONSTRAINT performance_thresholds_ordered CHECK (
    conform_threshold > 0 AND conform_threshold < good_threshold
    AND good_threshold < excellent_threshold AND excellent_threshold <= 100
  ),
  CONSTRAINT performance_work_days_valid CHECK (
    work_days <@ ARRAY[1,2,3,4,5,6,7] AND cardinality(work_days) >= 1
  )
);

CREATE TABLE IF NOT EXISTS public.performance_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  label text NOT NULL,
  kind text NOT NULL DEFAULT 'quarter' CHECK (kind IN ('month', 'quarter', 'semester', 'year')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'review', 'closed')),
  created_by uuid,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT performance_cycle_dates CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS performance_cycles_org_idx
  ON public.performance_cycles (org_id, start_date DESC);

CREATE TABLE IF NOT EXISTS public.employee_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL REFERENCES public.performance_cycles(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  title text NOT NULL,
  indicator text NOT NULL,
  unit text,
  direction text NOT NULL DEFAULT 'higher' CHECK (direction IN ('higher', 'lower')),
  target numeric(14,2) NOT NULL CHECK (target >= 0),
  weight_pct integer NOT NULL CHECK (weight_pct BETWEEN 1 AND 100),
  achieved numeric(14,2) CHECK (achieved IS NULL OR achieved >= 0),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'self_reported', 'validated')),
  employee_note text,
  manager_note text,
  set_by uuid,
  reported_at timestamptz,
  validated_by uuid,
  validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employee_objectives_cycle_idx
  ON public.employee_objectives (cycle_id, employee_id);
CREATE INDEX IF NOT EXISTS employee_objectives_employee_idx
  ON public.employee_objectives (employee_id);
CREATE INDEX IF NOT EXISTS employee_objectives_org_idx
  ON public.employee_objectives (org_id);

CREATE TABLE IF NOT EXISTS public.performance_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL REFERENCES public.performance_cycles(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  department_id uuid,
  score_objectives numeric(5,2),
  score_kpi numeric(5,2),
  score_final numeric(5,2),
  objectives_evaluated integer NOT NULL DEFAULT 0,
  objectives_total integer NOT NULL DEFAULT 0,
  department_rank integer,
  department_size integer,
  level text NOT NULL DEFAULT 'non_evalue'
    CHECK (level IN ('non_evalue', 'a_suivre', 'conforme', 'bon', 'excellent')),
  computed_by uuid,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, employee_id)
);
CREATE INDEX IF NOT EXISTS performance_scores_employee_idx
  ON public.performance_scores (employee_id);
CREATE INDEX IF NOT EXISTS performance_scores_org_idx
  ON public.performance_scores (org_id);

CREATE TABLE IF NOT EXISTS public.performance_score_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  score_id uuid NOT NULL REFERENCES public.performance_scores(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('objective', 'kpi')),
  label text NOT NULL,
  detail text,
  value numeric(7,2),
  weight_pct numeric(6,2) NOT NULL DEFAULT 0,
  points numeric(6,2) NOT NULL DEFAULT 0,
  evaluated boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS performance_score_lines_score_idx
  ON public.performance_score_lines (score_id, position);

ALTER TABLE public.employee_bonuses
  DROP CONSTRAINT IF EXISTS employee_bonuses_score_fk;
ALTER TABLE public.employee_bonuses
  ADD CONSTRAINT employee_bonuses_score_fk
  FOREIGN KEY (score_id) REFERENCES public.performance_scores(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS employee_bonuses_score_unique
  ON public.employee_bonuses (score_id)
  WHERE score_id IS NOT NULL AND status <> 'cancelled';

CREATE TABLE IF NOT EXISTS public.employee_recognitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL REFERENCES public.performance_cycles(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  badge text NOT NULL
    CHECK (badge IN ('salarie_du_mois', 'assiduite_parfaite', 'objectifs_depasses', 'esprit_equipe')),
  origin text NOT NULL CHECK (origin IN ('manager', 'automatique')),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'confirmed')),
  note text,
  awarded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, employee_id, badge)
);
CREATE INDEX IF NOT EXISTS employee_recognitions_employee_idx
  ON public.employee_recognitions (employee_id);
CREATE INDEX IF NOT EXISTS employee_recognitions_org_idx
  ON public.employee_recognitions (org_id, cycle_id);

CREATE TABLE IF NOT EXISTS public.employee_perks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL REFERENCES public.performance_cycles(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  score_id uuid REFERENCES public.performance_scores(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('bonus_leave', 'training_budget')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  consumed_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (consumed_amount >= 0),
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'approved', 'consumed', 'cancelled')),
  reason text,
  proposed_by uuid,
  approved_by uuid,
  consume_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_perks_consumed_within CHECK (consumed_amount <= amount)
);
CREATE INDEX IF NOT EXISTS employee_perks_employee_idx
  ON public.employee_perks (employee_id);
CREATE INDEX IF NOT EXISTS employee_perks_cycle_idx
  ON public.employee_perks (cycle_id);
CREATE INDEX IF NOT EXISTS employee_perks_org_idx
  ON public.employee_perks (org_id);

-- ---------------------------------------------------------------------------
-- 2. RLS : lecture seulement. Le salarié ne lit que ses lignes.
-- ---------------------------------------------------------------------------

ALTER TABLE public.performance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_score_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_recognitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_perks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS a26_perf_settings_select ON public.performance_settings;
CREATE POLICY a26_perf_settings_select ON public.performance_settings
FOR SELECT TO authenticated
USING (private.org_member(org_id));

DROP POLICY IF EXISTS a26_perf_cycles_select ON public.performance_cycles;
CREATE POLICY a26_perf_cycles_select ON public.performance_cycles
FOR SELECT TO authenticated
USING (private.org_member(org_id));

DROP POLICY IF EXISTS a26_perf_objectives_select ON public.employee_objectives;
CREATE POLICY a26_perf_objectives_select ON public.employee_objectives
FOR SELECT TO authenticated
USING (
  private.has_org_role(org_id, ARRAY['admin_rh','manager','auditeur','cabinet']::text[])
  OR (status <> 'draft' AND private.employee_owned(org_id, employee_id))
);

DROP POLICY IF EXISTS a26_perf_scores_select ON public.performance_scores;
CREATE POLICY a26_perf_scores_select ON public.performance_scores
FOR SELECT TO authenticated
USING (
  private.has_org_role(org_id, ARRAY['admin_rh','manager','auditeur','cabinet']::text[])
  OR private.employee_owned(org_id, employee_id)
);

DROP POLICY IF EXISTS a26_perf_lines_select ON public.performance_score_lines;
CREATE POLICY a26_perf_lines_select ON public.performance_score_lines
FOR SELECT TO authenticated
USING (
  private.has_org_role(org_id, ARRAY['admin_rh','manager','auditeur','cabinet']::text[])
  OR EXISTS (
    SELECT 1
    FROM public.performance_scores AS ps
    WHERE ps.id = performance_score_lines.score_id
      AND private.employee_owned(ps.org_id, ps.employee_id)
  )
);

DROP POLICY IF EXISTS a26_perf_recognitions_select ON public.employee_recognitions;
CREATE POLICY a26_perf_recognitions_select ON public.employee_recognitions
FOR SELECT TO authenticated
USING (
  private.has_org_role(org_id, ARRAY['admin_rh','manager','auditeur','cabinet']::text[])
  OR (status = 'confirmed' AND private.employee_owned(org_id, employee_id))
);

DROP POLICY IF EXISTS a26_perf_perks_select ON public.employee_perks;
CREATE POLICY a26_perf_perks_select ON public.employee_perks
FOR SELECT TO authenticated
USING (
  private.has_org_role(org_id, ARRAY['admin_rh','manager','auditeur','cabinet']::text[])
  OR private.employee_owned(org_id, employee_id)
);

REVOKE INSERT, UPDATE, DELETE ON
  public.performance_settings, public.performance_cycles, public.employee_objectives,
  public.performance_scores, public.performance_score_lines,
  public.employee_recognitions, public.employee_perks
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON
  public.performance_settings, public.performance_cycles, public.employee_objectives,
  public.performance_scores, public.performance_score_lines,
  public.employee_recognitions, public.employee_perks
TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Aides internes
-- ---------------------------------------------------------------------------

-- Une ligne de réglages par organisation, créée à la demande (fuseau selon le pays).
CREATE OR REPLACE FUNCTION private.ensure_performance_settings(p_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.performance_settings (org_id, timezone)
  SELECT o.id,
         CASE o.country_code WHEN 'CI' THEN 'Africa/Abidjan' ELSE 'Africa/Niamey' END
  FROM public.orgs AS o
  WHERE o.id = p_org
  ON CONFLICT (org_id) DO NOTHING;
END;
$$;

-- Taux d'atteinte d'un objectif, en %, plafonné à 200.
CREATE OR REPLACE FUNCTION private.objective_attainment(p_direction text, p_target numeric, p_achieved numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_achieved IS NULL OR p_target IS NULL THEN NULL
    WHEN p_direction = 'lower' THEN
      CASE
        WHEN p_achieved <= p_target THEN 100
        WHEN p_achieved = 0 THEN 100
        ELSE LEAST(200, pg_catalog.round(p_target / p_achieved * 100, 2))
      END
    ELSE
      CASE
        WHEN p_target = 0 THEN 100
        ELSE LEAST(200, pg_catalog.round(p_achieved / p_target * 100, 2))
      END
  END;
$$;

CREATE OR REPLACE FUNCTION private.performance_level(
  p_final numeric, p_rank integer, p_size integer,
  p_conform integer, p_good integer, p_excellent integer
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_final IS NULL THEN 'non_evalue'
    WHEN p_final >= p_excellent
         AND p_rank IS NOT NULL
         AND p_rank <= GREATEST(1, CEIL(COALESCE(p_size, 1)::numeric / 10)::integer) THEN 'excellent'
    WHEN p_final >= p_good THEN 'bon'
    WHEN p_final >= p_conform THEN 'conforme'
    ELSE 'a_suivre'
  END;
$$;

CREATE OR REPLACE FUNCTION private.perf_badge_label(p_badge text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_badge
    WHEN 'salarie_du_mois' THEN 'Salarié du mois'
    WHEN 'assiduite_parfaite' THEN 'Assiduité parfaite'
    WHEN 'objectifs_depasses' THEN 'Objectifs dépassés'
    WHEN 'esprit_equipe' THEN 'Esprit d’équipe'
    ELSE p_badge
  END;
$$;

-- Message WhatsApp en file d'attente (le worker l'envoie ; sans lui, le badge s'affiche quand même).
CREATE OR REPLACE FUNCTION private.queue_recognition_message(p_recognition uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rec record;
  v_phone text;
  v_org_name text;
BEGIN
  SELECT r.org_id, r.employee_id, r.badge, r.cycle_id INTO v_rec
  FROM public.employee_recognitions AS r
  WHERE r.id = p_recognition;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT NULLIF(btrim(e.phone), '') INTO v_phone
  FROM public.employees AS e WHERE e.id = v_rec.employee_id;
  IF v_phone IS NULL THEN RETURN; END IF;

  SELECT o.name INTO v_org_name FROM public.orgs AS o WHERE o.id = v_rec.org_id;
  INSERT INTO public.notification_outbox (org_id, channel, template_key, recipient, payload)
  VALUES (
    v_rec.org_id, 'whatsapp', 'recognition_awarded', v_phone,
    pg_catalog.jsonb_build_object(
      'org', v_org_name,
      'badge', v_rec.badge,
      'badge_label', private.perf_badge_label(v_rec.badge),
      'recognition_id', p_recognition
    )
  );
END;
$$;

-- Cœur du calcul : sans contrôle de droit (réservé aux fonctions publiques ci-dessous).
CREATE OR REPLACE FUNCTION private.compute_performance_scores_core(p_cycle uuid, p_actor uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cycle record;
  v_s record;
  v_emp record;
  v_start date;
  v_end date;
  v_today date := (pg_catalog.clock_timestamp() AT TIME ZONE 'UTC')::date;
  v_last_day date;
  v_expected integer;
  v_present integer;
  v_on_time integer;
  v_hours numeric;
  v_ts_rows integer;
  v_sub_avg numeric;
  v_corr_self integer;
  v_corr_mgr integer;
  v_kpi_att numeric;
  v_kpi_pun numeric;
  v_kpi_hrs numeric;
  v_kpi_sub numeric;
  v_kpi_cor numeric;
  v_kpi_total_w numeric;
  v_kpi_score numeric;
  v_obj_total_w numeric;
  v_obj_score numeric;
  v_obj_uncapped numeric;
  v_obj_evaluated integer;
  v_obj_total integer;
  v_share_obj numeric;
  v_share_kpi numeric;
  v_final numeric;
  v_score_id uuid;
  v_pos integer;
  v_pts numeric;
  v_eff numeric;
  v_attain numeric;
  v_obj record;
  v_count integer := 0;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_kw_p numeric; v_kw_a numeric; v_kw_h numeric; v_kw_s numeric; v_kw_c numeric;
BEGIN
  SELECT c.* INTO v_cycle FROM public.performance_cycles AS c WHERE c.id = p_cycle;
  PERFORM private.ensure_performance_settings(v_cycle.org_id);
  SELECT ps.* INTO v_s FROM public.performance_settings AS ps WHERE ps.org_id = v_cycle.org_id;

  v_start := v_cycle.start_date;
  v_end := LEAST(v_cycle.end_date, GREATEST(v_start, v_today));

  FOR v_emp IN
    SELECT e.id, e.user_id, e.department_id, e.hire_date
    FROM public.employees AS e
    WHERE e.org_id = v_cycle.org_id
      AND e.status = 'active'
      AND (e.hire_date IS NULL OR e.hire_date <= v_cycle.end_date)
    ORDER BY e.last_name, e.first_name
  LOOP
    -- ---------------- Indicateurs automatiques ----------------
    WITH days AS (
      SELECT g.d::date AS d
      FROM pg_catalog.generate_series(
             GREATEST(v_start, COALESCE(v_emp.hire_date, v_start)), v_end, interval '1 day'
           ) AS g(d)
      WHERE pg_catalog.date_part('isodow', g.d)::integer = ANY (v_s.work_days)
        AND g.d::date <> ALL (v_s.holidays)
        AND NOT EXISTS (
          SELECT 1
          FROM public.leave_requests AS lr
          WHERE lr.org_id = v_cycle.org_id
            AND lr.employee_id = v_emp.id
            AND lr.status = 'approved'
            AND g.d::date BETWEEN lr.start_date AND lr.end_date
        )
    ), first_in AS (
      SELECT ce.work_date, pg_catalog.min(ce.clock_in) AS ci
      FROM public.clock_entries AS ce
      WHERE ce.org_id = v_cycle.org_id
        AND ce.employee_id = v_emp.id
        AND ce.work_date BETWEEN v_start AND v_cycle.end_date
      GROUP BY ce.work_date
    )
    SELECT
      pg_catalog.count(*)::integer,
      (pg_catalog.count(fi.work_date))::integer,
      (pg_catalog.count(*) FILTER (
        WHERE fi.ci IS NOT NULL
          AND (fi.ci AT TIME ZONE v_s.timezone)::time
              <= v_s.expected_start_time + pg_catalog.make_interval(mins => v_s.late_grace_minutes)
      ))::integer
    INTO v_expected, v_present, v_on_time
    FROM days
    LEFT JOIN first_in AS fi ON fi.work_date = days.d;

    v_kpi_att := CASE WHEN v_expected > 0
      THEN LEAST(100, pg_catalog.round(v_present::numeric / v_expected * 100, 2)) END;
    v_kpi_pun := CASE WHEN v_present > 0
      THEN pg_catalog.round(v_on_time::numeric / v_present * 100, 2) END;

    SELECT pg_catalog.count(*)::integer,
           COALESCE(pg_catalog.sum(te.hours) FILTER (WHERE te.status = 'approved'), 0)
    INTO v_ts_rows, v_hours
    FROM public.timesheet_entries AS te
    WHERE te.org_id = v_cycle.org_id
      AND te.employee_id = v_emp.id
      AND te.work_date BETWEEN v_start AND v_cycle.end_date;
    v_kpi_hrs := CASE WHEN v_ts_rows > 0 AND v_expected > 0
      THEN LEAST(100, pg_catalog.round(v_hours / (v_expected * v_s.daily_hours) * 100, 2)) END;

    SELECT pg_catalog.round(pg_catalog.avg(GREATEST(0, 100 - 20 * GREATEST(0,
             ((m.last_sub AT TIME ZONE v_s.timezone)::date
              - ((pg_catalog.date_trunc('month', m.month_start) + interval '1 month - 1 day')::date
                 + v_s.submission_grace_days))))), 2)
    INTO v_sub_avg
    FROM (
      SELECT pg_catalog.date_trunc('month', te.work_date) AS month_start,
             pg_catalog.max(te.submitted_at) AS last_sub
      FROM public.timesheet_entries AS te
      WHERE te.org_id = v_cycle.org_id
        AND te.employee_id = v_emp.id
        AND te.work_date BETWEEN v_start AND v_cycle.end_date
        AND te.submitted_at IS NOT NULL
      GROUP BY 1
    ) AS m;
    v_kpi_sub := v_sub_avg;

    SELECT
      (pg_catalog.count(*) FILTER (WHERE ce.edited_by IS NOT DISTINCT FROM v_emp.user_id AND v_emp.user_id IS NOT NULL))::integer,
      (pg_catalog.count(*) FILTER (WHERE NOT (ce.edited_by IS NOT DISTINCT FROM v_emp.user_id AND v_emp.user_id IS NOT NULL)))::integer
    INTO v_corr_self, v_corr_mgr
    FROM public.clock_entries AS ce
    WHERE ce.org_id = v_cycle.org_id
      AND ce.employee_id = v_emp.id
      AND ce.work_date BETWEEN v_start AND v_cycle.end_date
      AND ce.edit_reason IS NOT NULL;
    v_kpi_cor := CASE WHEN v_expected > 0 THEN GREATEST(0, 100 - 10 * v_corr_self) END;

    v_kw_p := CASE WHEN v_kpi_pun IS NOT NULL THEN v_s.weight_punctuality ELSE 0 END;
    v_kw_a := CASE WHEN v_kpi_att IS NOT NULL THEN v_s.weight_attendance ELSE 0 END;
    v_kw_h := CASE WHEN v_kpi_hrs IS NOT NULL THEN v_s.weight_project_hours ELSE 0 END;
    v_kw_s := CASE WHEN v_kpi_sub IS NOT NULL THEN v_s.weight_submission ELSE 0 END;
    v_kw_c := CASE WHEN v_kpi_cor IS NOT NULL THEN v_s.weight_corrections ELSE 0 END;
    v_kpi_total_w := v_kw_p + v_kw_a + v_kw_h + v_kw_s + v_kw_c;
    v_kpi_score := CASE WHEN v_kpi_total_w > 0 THEN pg_catalog.round((
        COALESCE(v_kpi_pun, 0) * v_kw_p + COALESCE(v_kpi_att, 0) * v_kw_a
        + COALESCE(v_kpi_hrs, 0) * v_kw_h + COALESCE(v_kpi_sub, 0) * v_kw_s
        + COALESCE(v_kpi_cor, 0) * v_kw_c) / v_kpi_total_w, 2) END;

    -- ---------------- Objectifs validés ----------------
    SELECT pg_catalog.count(*) FILTER (WHERE o.status = 'validated')::integer,
           pg_catalog.count(*)::integer,
           COALESCE(pg_catalog.sum(o.weight_pct) FILTER (WHERE o.status = 'validated'), 0)
    INTO v_obj_evaluated, v_obj_total, v_obj_total_w
    FROM public.employee_objectives AS o
    WHERE o.cycle_id = p_cycle AND o.employee_id = v_emp.id AND o.status <> 'draft';

    v_obj_score := NULL;
    v_obj_uncapped := NULL;
    IF v_obj_total_w > 0 THEN
      SELECT pg_catalog.round(pg_catalog.sum(o.weight_pct * LEAST(100, private.objective_attainment(o.direction, o.target, o.achieved))) / v_obj_total_w, 2),
             pg_catalog.round(pg_catalog.sum(o.weight_pct * private.objective_attainment(o.direction, o.target, o.achieved)) / v_obj_total_w, 2)
      INTO v_obj_score, v_obj_uncapped
      FROM public.employee_objectives AS o
      WHERE o.cycle_id = p_cycle AND o.employee_id = v_emp.id AND o.status = 'validated';
    END IF;

    -- ---------------- Combinaison ----------------
    IF v_obj_score IS NOT NULL AND v_kpi_score IS NOT NULL THEN
      v_share_obj := v_s.weight_objectives;
      v_share_kpi := 100 - v_s.weight_objectives;
    ELSIF v_obj_score IS NOT NULL THEN
      v_share_obj := 100; v_share_kpi := 0;
    ELSIF v_kpi_score IS NOT NULL THEN
      v_share_obj := 0; v_share_kpi := 100;
    ELSE
      v_share_obj := 0; v_share_kpi := 0;
    END IF;

    INSERT INTO public.performance_scores AS ps (
      org_id, cycle_id, employee_id, department_id, score_objectives, score_kpi,
      score_final, objectives_evaluated, objectives_total, level, computed_by, computed_at
    ) VALUES (
      v_cycle.org_id, p_cycle, v_emp.id, v_emp.department_id, v_obj_score, v_kpi_score,
      NULL, v_obj_evaluated, v_obj_total, 'non_evalue', p_actor, pg_catalog.clock_timestamp()
    )
    ON CONFLICT (cycle_id, employee_id) DO UPDATE
    SET department_id = EXCLUDED.department_id,
        score_objectives = EXCLUDED.score_objectives,
        score_kpi = EXCLUDED.score_kpi,
        objectives_evaluated = EXCLUDED.objectives_evaluated,
        objectives_total = EXCLUDED.objectives_total,
        computed_by = EXCLUDED.computed_by,
        computed_at = EXCLUDED.computed_at
    RETURNING ps.id INTO v_score_id;
    v_ids := v_ids || v_score_id;

    DELETE FROM public.performance_score_lines AS l WHERE l.score_id = v_score_id;
    v_final := 0;
    v_pos := 0;

    -- Lignes d'objectifs : tous les objectifs actifs ou plus, évalués ou non.
    FOR v_obj IN
      SELECT o.title, o.indicator, o.unit, o.direction, o.target, o.achieved, o.weight_pct, o.status
      FROM public.employee_objectives AS o
      WHERE o.cycle_id = p_cycle AND o.employee_id = v_emp.id AND o.status <> 'draft'
      ORDER BY o.created_at, o.id
    LOOP
      v_pos := v_pos + 1;
      IF v_obj.status = 'validated' AND v_share_obj > 0 THEN
        v_attain := private.objective_attainment(v_obj.direction, v_obj.target, v_obj.achieved);
        v_eff := pg_catalog.round(v_share_obj * v_obj.weight_pct / v_obj_total_w, 2);
        v_pts := pg_catalog.round(LEAST(100, v_attain) * v_eff / 100, 2);
        v_final := v_final + v_pts;
        INSERT INTO public.performance_score_lines (org_id, score_id, source, label, detail, value, weight_pct, points, evaluated, position)
        VALUES (v_cycle.org_id, v_score_id, 'objective', v_obj.title,
                pg_catalog.format('%s : %s sur %s %s (%s)', v_obj.indicator,
                  pg_catalog.trim_scale(v_obj.achieved), pg_catalog.trim_scale(v_obj.target),
                  COALESCE(v_obj.unit, ''),
                  CASE v_obj.direction WHEN 'lower' THEN 'plus bas = mieux' ELSE 'plus haut = mieux' END),
                LEAST(100, v_attain), v_eff, v_pts, true, v_pos);
      ELSE
        INSERT INTO public.performance_score_lines (org_id, score_id, source, label, detail, value, weight_pct, points, evaluated, position)
        VALUES (v_cycle.org_id, v_score_id, 'objective', v_obj.title,
                CASE v_obj.status
                  WHEN 'self_reported' THEN 'Déclaré par le salarié, en attente de validation du responsable : non évalué'
                  ELSE 'Pas encore de résultat validé : non évalué'
                END,
                NULL, 0, 0, false, v_pos);
      END IF;
    END LOOP;

    -- Lignes d'indicateurs automatiques.
    IF v_share_kpi > 0 THEN
      v_kpi_total_w := GREATEST(v_kpi_total_w, 1);
    END IF;
    v_pos := v_pos + 1;
    PERFORM private.perf_kpi_line(v_cycle.org_id, v_score_id, 'Ponctualité', v_kpi_pun, v_kw_p, v_kpi_total_w, v_share_kpi,
      pg_catalog.format('%s jour(s) à l’heure sur %s présent(s) (arrivée avant %s + %s min)', v_on_time, v_present,
        pg_catalog.to_char(v_s.expected_start_time, 'HH24:MI'), v_s.late_grace_minutes), v_pos);
    v_pos := v_pos + 1;
    PERFORM private.perf_kpi_line(v_cycle.org_id, v_score_id, 'Assiduité', v_kpi_att, v_kw_a, v_kpi_total_w, v_share_kpi,
      pg_catalog.format('%s jour(s) pointé(s) sur %s jour(s) ouvré(s), congés approuvés et jours fériés retirés', v_present, v_expected), v_pos);
    v_pos := v_pos + 1;
    PERFORM private.perf_kpi_line(v_cycle.org_id, v_score_id, 'Heures projet validées', v_kpi_hrs, v_kw_h, v_kpi_total_w, v_share_kpi,
      CASE WHEN v_kpi_hrs IS NULL THEN 'Aucune feuille de temps sur la période'
           ELSE pg_catalog.format('%s h approuvée(s) sur %s h attendue(s)', pg_catalog.trim_scale(v_hours), pg_catalog.trim_scale(pg_catalog.round(v_expected * v_s.daily_hours, 1))) END, v_pos);
    v_pos := v_pos + 1;
    PERFORM private.perf_kpi_line(v_cycle.org_id, v_score_id, 'Délai de soumission', v_kpi_sub, v_kw_s, v_kpi_total_w, v_share_kpi,
      pg_catalog.format('Feuille mensuelle soumise dans les %s jour(s) après la fin du mois', v_s.submission_grace_days), v_pos);
    v_pos := v_pos + 1;
    PERFORM private.perf_kpi_line(v_cycle.org_id, v_score_id, 'Corrections de pointage', v_kpi_cor, v_kw_c, v_kpi_total_w, v_share_kpi,
      pg_catalog.format('%s correction(s) à l’initiative du salarié ; %s faite(s) par un responsable (non pénalisée)', v_corr_self, v_corr_mgr), v_pos);

    SELECT COALESCE(pg_catalog.sum(l.points), 0) INTO v_final
    FROM public.performance_score_lines AS l WHERE l.score_id = v_score_id;

    UPDATE public.performance_scores AS ps
    SET score_final = CASE WHEN v_share_obj + v_share_kpi = 0 THEN NULL ELSE pg_catalog.round(v_final, 2) END
    WHERE ps.id = v_score_id;

    -- Badges automatiques proposés (à confirmer par un responsable).
    DELETE FROM public.employee_recognitions AS r
    WHERE r.cycle_id = p_cycle AND r.employee_id = v_emp.id
      AND r.origin = 'automatique' AND r.status = 'proposed';
    IF v_kpi_att = 100 AND v_expected >= 5 THEN
      INSERT INTO public.employee_recognitions (org_id, cycle_id, employee_id, badge, origin, status, note)
      VALUES (v_cycle.org_id, p_cycle, v_emp.id, 'assiduite_parfaite', 'automatique', 'proposed',
              pg_catalog.format('%s jour(s) ouvré(s), tous pointés', v_expected))
      ON CONFLICT (cycle_id, employee_id, badge) DO NOTHING;
    END IF;
    IF v_obj_uncapped IS NOT NULL AND v_obj_uncapped >= 110 THEN
      INSERT INTO public.employee_recognitions (org_id, cycle_id, employee_id, badge, origin, status, note)
      VALUES (v_cycle.org_id, p_cycle, v_emp.id, 'objectifs_depasses', 'automatique', 'proposed',
              pg_catalog.format('Atteinte pondérée des objectifs validés : %s %%', pg_catalog.trim_scale(v_obj_uncapped)))
      ON CONFLICT (cycle_id, employee_id, badge) DO NOTHING;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  -- Salariés qui ne sont plus dans le périmètre.
  DELETE FROM public.performance_scores AS ps
  WHERE ps.cycle_id = p_cycle AND NOT (ps.id = ANY (v_ids));

  -- Rang dans le service, puis niveau.
  UPDATE public.performance_scores AS ps
  SET department_rank = r.rnk, department_size = r.sz
  FROM (
    SELECT s2.id,
           CASE WHEN s2.score_final IS NULL THEN NULL
                ELSE pg_catalog.rank() OVER (PARTITION BY s2.department_id ORDER BY s2.score_final DESC) END AS rnk,
           pg_catalog.count(s2.score_final) OVER (PARTITION BY s2.department_id) AS sz
    FROM public.performance_scores AS s2
    WHERE s2.cycle_id = p_cycle
  ) AS r
  WHERE ps.id = r.id;

  UPDATE public.performance_scores AS ps
  SET level = private.performance_level(
    ps.score_final, ps.department_rank, ps.department_size,
    v_s.conform_threshold, v_s.good_threshold, v_s.excellent_threshold)
  WHERE ps.cycle_id = p_cycle;

  -- Salarié du mois : meilleur score « excellent » de l'organisation.
  INSERT INTO public.employee_recognitions (org_id, cycle_id, employee_id, badge, origin, status, note)
  SELECT v_cycle.org_id, p_cycle, ps.employee_id, 'salarie_du_mois', 'automatique', 'proposed',
         pg_catalog.format('Meilleur score du cycle : %s/100', pg_catalog.trim_scale(ps.score_final))
  FROM public.performance_scores AS ps
  JOIN public.employees AS e ON e.id = ps.employee_id
  WHERE ps.cycle_id = p_cycle AND ps.level = 'excellent'
  ORDER BY ps.score_final DESC, e.employee_number
  LIMIT 1
  ON CONFLICT (cycle_id, employee_id, badge) DO NOTHING;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION private.perf_kpi_line(
  p_org uuid, p_score uuid, p_label text, p_value numeric, p_kw numeric,
  p_total_kw numeric, p_share_kpi numeric, p_detail text, p_pos integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_eff numeric;
BEGIN
  IF p_value IS NULL THEN
    INSERT INTO public.performance_score_lines (org_id, score_id, source, label, detail, value, weight_pct, points, evaluated, position)
    VALUES (p_org, p_score, 'kpi', p_label, p_detail || ' — non évalué', NULL, 0, 0, false, p_pos);
  ELSIF p_kw <= 0 OR p_share_kpi <= 0 OR p_total_kw <= 0 THEN
    INSERT INTO public.performance_score_lines (org_id, score_id, source, label, detail, value, weight_pct, points, evaluated, position)
    VALUES (p_org, p_score, 'kpi', p_label, p_detail || ' — poids 0 : affiché, non compté', p_value, 0, 0, true, p_pos);
  ELSE
    v_eff := pg_catalog.round(p_share_kpi * p_kw / p_total_kw, 2);
    INSERT INTO public.performance_score_lines (org_id, score_id, source, label, detail, value, weight_pct, points, evaluated, position)
    VALUES (p_org, p_score, 'kpi', p_label, p_detail, p_value, v_eff,
            pg_catalog.round(p_value * v_eff / 100, 2), true, p_pos);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.perf_kpi_line(uuid, uuid, text, numeric, numeric, numeric, numeric, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.compute_performance_scores_core(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.queue_recognition_message(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.ensure_performance_settings(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.stamp_timesheet_submitted() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Fonctions publiques : réglages et cycles (admin_rh)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_performance_settings(p_settings jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_org uuid;
BEGIN
  v_uid := (SELECT auth.uid());
  v_org := NULLIF(p_settings->>'org_id', '')::uuid;
  IF v_uid IS NULL OR v_org IS NULL
     OR NOT private.has_org_role(v_org, ARRAY['admin_rh']::text[]) THEN
    RAISE EXCEPTION 'Seul l’administrateur RH règle le module performance';
  END IF;
  PERFORM private.ensure_performance_settings(v_org);

  BEGIN
    UPDATE public.performance_settings AS ps
    SET weight_objectives = COALESCE((p_settings->>'weight_objectives')::integer, ps.weight_objectives),
        expected_start_time = COALESCE((p_settings->>'expected_start_time')::time, ps.expected_start_time),
        late_grace_minutes = COALESCE((p_settings->>'late_grace_minutes')::integer, ps.late_grace_minutes),
        submission_grace_days = COALESCE((p_settings->>'submission_grace_days')::integer, ps.submission_grace_days),
        daily_hours = COALESCE((p_settings->>'daily_hours')::numeric, ps.daily_hours),
        weight_punctuality = COALESCE((p_settings->>'weight_punctuality')::integer, ps.weight_punctuality),
        weight_attendance = COALESCE((p_settings->>'weight_attendance')::integer, ps.weight_attendance),
        weight_project_hours = COALESCE((p_settings->>'weight_project_hours')::integer, ps.weight_project_hours),
        weight_submission = COALESCE((p_settings->>'weight_submission')::integer, ps.weight_submission),
        weight_corrections = COALESCE((p_settings->>'weight_corrections')::integer, ps.weight_corrections),
        conform_threshold = COALESCE((p_settings->>'conform_threshold')::integer, ps.conform_threshold),
        good_threshold = COALESCE((p_settings->>'good_threshold')::integer, ps.good_threshold),
        excellent_threshold = COALESCE((p_settings->>'excellent_threshold')::integer, ps.excellent_threshold),
        holidays = CASE WHEN p_settings ? 'holidays'
          THEN COALESCE(ARRAY(SELECT pg_catalog.jsonb_array_elements_text(p_settings->'holidays')::date), ARRAY[]::date[])
          ELSE ps.holidays END,
        updated_by = v_uid,
        updated_at = pg_catalog.clock_timestamp()
    WHERE ps.org_id = v_org;

  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'Réglages invalides : les poids des indicateurs doivent totaliser 100, les seuils doivent croître (conforme < bon < excellent ≤ 100) et le poids des objectifs rester entre 0 et 100';
  END;

  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (v_org, v_uid, 'update_performance_settings', 'performance_settings', v_org::text, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.open_performance_cycle(
  p_org uuid, p_label text, p_kind text, p_start date, p_end date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_id uuid;
  v_label text;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL OR NOT private.has_org_role(p_org, ARRAY['admin_rh']::text[]) THEN
    RAISE EXCEPTION 'Seul l’administrateur RH ouvre un cycle de performance';
  END IF;
  v_label := NULLIF(btrim(p_label), '');
  IF v_label IS NULL THEN RAISE EXCEPTION 'Le cycle doit avoir un nom'; END IF;
  IF p_kind NOT IN ('month', 'quarter', 'semester', 'year') THEN
    RAISE EXCEPTION 'Type de cycle inconnu';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start THEN
    RAISE EXCEPTION 'Période de cycle invalide';
  END IF;
  PERFORM private.ensure_performance_settings(p_org);

  INSERT INTO public.performance_cycles (org_id, label, kind, start_date, end_date, created_by)
  VALUES (p_org, v_label, p_kind, p_start, p_end, v_uid)
  RETURNING id INTO v_id;

  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (p_org, v_uid, 'open_performance_cycle', 'performance_cycles', v_id::text,
          pg_catalog.jsonb_build_object('label', v_label, 'kind', p_kind, 'start', p_start, 'end', p_end));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_performance_cycle_status(p_cycle uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_org uuid;
  v_old text;
BEGIN
  v_uid := (SELECT auth.uid());
  SELECT c.org_id, c.status INTO v_org, v_old
  FROM public.performance_cycles AS c WHERE c.id = p_cycle FOR UPDATE;
  IF v_uid IS NULL OR v_org IS NULL
     OR NOT private.has_org_role(v_org, ARRAY['admin_rh']::text[]) THEN
    RAISE EXCEPTION 'Cycle introuvable ou accès refusé';
  END IF;
  IF NOT ((v_old = 'open' AND p_status = 'review')
       OR (v_old = 'review' AND p_status IN ('open', 'closed'))) THEN
    RAISE EXCEPTION 'Transition de cycle interdite (%, puis %). Un cycle clos se rouvre avec un motif.', v_old, p_status;
  END IF;
  IF p_status = 'closed' AND NOT EXISTS (
    SELECT 1 FROM public.performance_scores AS ps WHERE ps.cycle_id = p_cycle
  ) THEN
    RAISE EXCEPTION 'Calculez les scores avant de clore le cycle';
  END IF;

  UPDATE public.performance_cycles AS c
  SET status = p_status,
      closed_at = CASE WHEN p_status = 'closed' THEN pg_catalog.clock_timestamp() ELSE NULL END
  WHERE c.id = p_cycle;

  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (v_org, v_uid, 'set_performance_cycle_status', 'performance_cycles', p_cycle::text,
          pg_catalog.jsonb_build_object('from', v_old, 'to', p_status));
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_performance_cycle(p_cycle uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_org uuid;
  v_status text;
  v_reason text;
BEGIN
  v_uid := (SELECT auth.uid());
  SELECT c.org_id, c.status INTO v_org, v_status
  FROM public.performance_cycles AS c WHERE c.id = p_cycle FOR UPDATE;
  IF v_uid IS NULL OR v_org IS NULL
     OR NOT private.has_org_role(v_org, ARRAY['admin_rh']::text[]) THEN
    RAISE EXCEPTION 'Cycle introuvable ou accès refusé';
  END IF;
  IF v_status <> 'closed' THEN
    RAISE EXCEPTION 'Seul un cycle clos se rouvre';
  END IF;
  v_reason := NULLIF(btrim(COALESCE(p_reason, '')), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Un motif est obligatoire pour rouvrir un cycle clos';
  END IF;
  UPDATE public.performance_cycles AS c
  SET status = 'review', closed_at = NULL WHERE c.id = p_cycle;
  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (v_org, v_uid, 'reopen_performance_cycle', 'performance_cycles', p_cycle::text,
          pg_catalog.jsonb_build_object('reason', v_reason));
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Objectifs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_objective(
  p_id uuid,
  p_cycle uuid,
  p_employee uuid,
  p_title text,
  p_indicator text,
  p_target numeric,
  p_unit text,
  p_direction text,
  p_weight_pct integer,
  p_publish boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_org uuid;
  v_c_status text;
  v_e_org uuid;
  v_old record;
  v_other integer;
  v_id uuid;
  v_status text;
  v_title text;
  v_indicator text;
BEGIN
  v_uid := (SELECT auth.uid());
  SELECT c.org_id, c.status INTO v_org, v_c_status
  FROM public.performance_cycles AS c WHERE c.id = p_cycle;
  SELECT e.org_id INTO v_e_org FROM public.employees AS e WHERE e.id = p_employee;
  IF v_uid IS NULL OR v_org IS NULL OR v_e_org IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'Cycle ou salarié introuvable';
  END IF;
  IF NOT private.has_org_role(v_org, ARRAY['admin_rh', 'manager']::text[]) THEN
    RAISE EXCEPTION 'Seuls le RH ou le manager fixent les objectifs';
  END IF;
  IF private.employee_owned(v_org, p_employee)
     AND NOT private.has_org_role(v_org, ARRAY['admin_rh']::text[]) THEN
    RAISE EXCEPTION 'Un manager ne fixe pas ses propres objectifs : ils sont fixés par l’administrateur RH';
  END IF;
  IF v_c_status <> 'open' THEN
    RAISE EXCEPTION 'Les objectifs se fixent tant que le cycle est ouvert';
  END IF;
  v_title := NULLIF(btrim(COALESCE(p_title, '')), '');
  v_indicator := NULLIF(btrim(COALESCE(p_indicator, '')), '');
  IF v_title IS NULL OR v_indicator IS NULL THEN
    RAISE EXCEPTION 'Un objectif a un titre et un indicateur chiffré';
  END IF;
  IF p_target IS NULL OR p_target < 0 THEN RAISE EXCEPTION 'La cible doit être un nombre positif ou nul'; END IF;
  IF p_direction NOT IN ('higher', 'lower') THEN RAISE EXCEPTION 'Sens d’objectif inconnu'; END IF;
  IF p_weight_pct IS NULL OR p_weight_pct < 1 OR p_weight_pct > 100 THEN
    RAISE EXCEPTION 'Le poids doit être compris entre 1 et 100';
  END IF;

  IF p_id IS NOT NULL THEN
    SELECT o.* INTO v_old FROM public.employee_objectives AS o WHERE o.id = p_id FOR UPDATE;
    IF NOT FOUND OR v_old.org_id <> v_org OR v_old.cycle_id <> p_cycle OR v_old.employee_id <> p_employee THEN
      RAISE EXCEPTION 'Objectif introuvable';
    END IF;
    IF v_old.status NOT IN ('draft', 'active') THEN
      RAISE EXCEPTION 'Un objectif déclaré ou validé ne se modifie plus';
    END IF;
  END IF;

  SELECT COALESCE(pg_catalog.sum(o.weight_pct), 0)::integer INTO v_other
  FROM public.employee_objectives AS o
  WHERE o.cycle_id = p_cycle AND o.employee_id = p_employee AND o.id IS DISTINCT FROM p_id;
  IF v_other + p_weight_pct > 100 THEN
    RAISE EXCEPTION 'La somme des poids dépasse 100 (déjà % attribué)', v_other;
  END IF;

  v_status := CASE WHEN COALESCE(p_publish, true) THEN 'active' ELSE 'draft' END;

  IF p_id IS NULL THEN
    INSERT INTO public.employee_objectives (
      org_id, cycle_id, employee_id, title, indicator, unit, direction, target, weight_pct, status, set_by
    ) VALUES (
      v_org, p_cycle, p_employee, v_title, v_indicator, NULLIF(btrim(COALESCE(p_unit, '')), ''),
      p_direction, p_target, p_weight_pct, v_status, v_uid
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.employee_objectives AS o
    SET title = v_title, indicator = v_indicator, unit = NULLIF(btrim(COALESCE(p_unit, '')), ''),
        direction = p_direction, target = p_target, weight_pct = p_weight_pct,
        status = v_status, set_by = v_uid, updated_at = pg_catalog.clock_timestamp()
    WHERE o.id = p_id
    RETURNING o.id INTO v_id;
  END IF;

  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (v_org, v_uid, 'set_objective', 'employee_objectives', v_id::text,
          pg_catalog.jsonb_build_object('employee_id', p_employee, 'title', v_title,
            'target', p_target, 'weight_pct', p_weight_pct, 'status', v_status));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_objective(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_o record;
  v_c_status text;
BEGIN
  v_uid := (SELECT auth.uid());
  SELECT o.* INTO v_o FROM public.employee_objectives AS o WHERE o.id = p_id FOR UPDATE;
  IF v_uid IS NULL OR NOT FOUND THEN RAISE EXCEPTION 'Objectif introuvable ou accès refusé'; END IF;
  IF NOT private.has_org_role(v_o.org_id, ARRAY['admin_rh', 'manager']::text[]) THEN
    RAISE EXCEPTION 'Seuls le RH ou le manager retirent un objectif';
  END IF;
  SELECT c.status INTO v_c_status FROM public.performance_cycles AS c WHERE c.id = v_o.cycle_id;
  IF v_c_status <> 'open' OR v_o.status NOT IN ('draft', 'active') THEN
    RAISE EXCEPTION 'Seul un objectif non déclaré d’un cycle ouvert peut être retiré';
  END IF;
  DELETE FROM public.employee_objectives AS o WHERE o.id = p_id;
  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (v_o.org_id, v_uid, 'delete_objective', 'employee_objectives', p_id::text,
          pg_catalog.jsonb_build_object('employee_id', v_o.employee_id, 'title', v_o.title));
END;
$$;

CREATE OR REPLACE FUNCTION public.report_objective_progress(p_id uuid, p_achieved numeric, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_o record;
  v_c_status text;
BEGIN
  v_uid := (SELECT auth.uid());
  SELECT o.* INTO v_o FROM public.employee_objectives AS o WHERE o.id = p_id FOR UPDATE;
  IF v_uid IS NULL OR NOT FOUND OR NOT private.employee_owned(v_o.org_id, v_o.employee_id) THEN
    RAISE EXCEPTION 'Objectif introuvable ou accès refusé';
  END IF;
  SELECT c.status INTO v_c_status FROM public.performance_cycles AS c WHERE c.id = v_o.cycle_id;
  IF v_c_status = 'closed' THEN RAISE EXCEPTION 'Ce cycle est clos'; END IF;
  IF v_o.status NOT IN ('active', 'self_reported') THEN
    RAISE EXCEPTION 'Cet objectif ne peut plus être déclaré (statut : %)', v_o.status;
  END IF;
  IF p_achieved IS NULL OR p_achieved < 0 THEN
    RAISE EXCEPTION 'La valeur atteinte doit être un nombre positif ou nul';
  END IF;
  UPDATE public.employee_objectives AS o
  SET achieved = p_achieved, status = 'self_reported',
      employee_note = NULLIF(btrim(COALESCE(p_note, '')), ''),
      reported_at = pg_catalog.clock_timestamp(), updated_at = pg_catalog.clock_timestamp()
  WHERE o.id = p_id;
  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (v_o.org_id, v_uid, 'report_objective', 'employee_objectives', p_id::text,
          pg_catalog.jsonb_build_object('achieved', p_achieved));
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_objective(p_id uuid, p_achieved numeric DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_o record;
  v_c_status text;
  v_value numeric;
BEGIN
  v_uid := (SELECT auth.uid());
  SELECT o.* INTO v_o FROM public.employee_objectives AS o WHERE o.id = p_id FOR UPDATE;
  IF v_uid IS NULL OR NOT FOUND
     OR NOT private.has_org_role(v_o.org_id, ARRAY['admin_rh', 'manager']::text[]) THEN
    RAISE EXCEPTION 'Objectif introuvable ou accès refusé';
  END IF;
  IF private.employee_owned(v_o.org_id, v_o.employee_id) THEN
    RAISE EXCEPTION 'On ne valide pas son propre objectif';
  END IF;
  SELECT c.status INTO v_c_status FROM public.performance_cycles AS c WHERE c.id = v_o.cycle_id;
  IF v_c_status = 'closed' THEN RAISE EXCEPTION 'Ce cycle est clos'; END IF;
  IF v_o.status NOT IN ('active', 'self_reported') THEN
    RAISE EXCEPTION 'Cet objectif n’est pas prêt à être validé (statut : %)', v_o.status;
  END IF;
  v_value := COALESCE(p_achieved, v_o.achieved);
  IF v_value IS NULL OR v_value < 0 THEN
    RAISE EXCEPTION 'Indiquez la valeur atteinte avant de valider';
  END IF;
  UPDATE public.employee_objectives AS o
  SET achieved = v_value, status = 'validated',
      manager_note = NULLIF(btrim(COALESCE(p_note, '')), ''),
      validated_by = v_uid, validated_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
  WHERE o.id = p_id;
  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (v_o.org_id, v_uid, 'validate_objective', 'employee_objectives', p_id::text,
          pg_catalog.jsonb_build_object('reported', v_o.achieved, 'validated', v_value));
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Score
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.compute_performance_scores(p_cycle uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_org uuid;
  v_status text;
  v_count integer;
BEGIN
  v_uid := (SELECT auth.uid());
  SELECT c.org_id, c.status INTO v_org, v_status
  FROM public.performance_cycles AS c WHERE c.id = p_cycle FOR UPDATE;
  IF v_uid IS NULL OR v_org IS NULL
     OR NOT private.has_org_role(v_org, ARRAY['admin_rh', 'manager']::text[]) THEN
    RAISE EXCEPTION 'Cycle introuvable ou accès refusé';
  END IF;
  IF v_status = 'closed' THEN
    RAISE EXCEPTION 'Un cycle clos ne se recalcule pas en silence : rouvrez-le avec un motif';
  END IF;
  v_count := private.compute_performance_scores_core(p_cycle, v_uid);
  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (v_org, v_uid, 'compute_performance', 'performance_cycles', p_cycle::text,
          pg_catalog.jsonb_build_object('scores', v_count));
  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Reconnaissance (badges)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.award_recognition(p_cycle uuid, p_employee uuid, p_badge text, p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_org uuid;
  v_e_org uuid;
  v_id uuid;
  v_existing record;
BEGIN
  v_uid := (SELECT auth.uid());
  SELECT c.org_id INTO v_org FROM public.performance_cycles AS c WHERE c.id = p_cycle;
  SELECT e.org_id INTO v_e_org FROM public.employees AS e WHERE e.id = p_employee;
  IF v_uid IS NULL OR v_org IS NULL OR v_e_org IS DISTINCT FROM v_org
     OR NOT private.has_org_role(v_org, ARRAY['admin_rh', 'manager']::text[]) THEN
    RAISE EXCEPTION 'Cycle ou salarié introuvable, ou accès refusé';
  END IF;
  IF private.employee_owned(v_org, p_employee) THEN
    RAISE EXCEPTION 'On ne s’attribue pas un badge à soi-même';
  END IF;
  IF p_badge NOT IN ('salarie_du_mois', 'assiduite_parfaite', 'objectifs_depasses', 'esprit_equipe') THEN
    RAISE EXCEPTION 'Badge inconnu';
  END IF;

  SELECT r.id, r.status INTO v_existing
  FROM public.employee_recognitions AS r
  WHERE r.cycle_id = p_cycle AND r.employee_id = p_employee AND r.badge = p_badge
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.status = 'confirmed' THEN
      RAISE EXCEPTION 'Ce badge est déjà attribué pour ce cycle';
    END IF;
    UPDATE public.employee_recognitions AS r
    SET status = 'confirmed', origin = CASE WHEN r.origin = 'automatique' THEN r.origin ELSE 'manager' END,
        awarded_by = v_uid, note = COALESCE(NULLIF(btrim(COALESCE(p_note, '')), ''), r.note)
    WHERE r.id = v_existing.id;
    v_id := v_existing.id;
  ELSE
    INSERT INTO public.employee_recognitions (org_id, cycle_id, employee_id, badge, origin, status, note, awarded_by)
    VALUES (v_org, p_cycle, p_employee, p_badge, 'manager', 'confirmed',
            NULLIF(btrim(COALESCE(p_note, '')), ''), v_uid)
    RETURNING id INTO v_id;
  END IF;

  PERFORM private.queue_recognition_message(v_id);
  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (v_org, v_uid, 'award_recognition', 'employee_recognitions', v_id::text,
          pg_catalog.jsonb_build_object('employee_id', p_employee, 'badge', p_badge));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_recognition(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_r record;
BEGIN
  v_uid := (SELECT auth.uid());
  SELECT r.* INTO v_r FROM public.employee_recognitions AS r WHERE r.id = p_id FOR UPDATE;
  IF v_uid IS NULL OR NOT FOUND
     OR NOT private.has_org_role(v_r.org_id, ARRAY['admin_rh', 'manager']::text[]) THEN
    RAISE EXCEPTION 'Badge introuvable ou accès refusé';
  END IF;
  IF v_r.status <> 'proposed' THEN
    RAISE EXCEPTION 'Seule une proposition de badge peut être écartée';
  END IF;
  DELETE FROM public.employee_recognitions AS r WHERE r.id = p_id;
  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (v_r.org_id, v_uid, 'dismiss_recognition', 'employee_recognitions', p_id::text,
          pg_catalog.jsonb_build_object('employee_id', v_r.employee_id, 'badge', v_r.badge));
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Récompenses : prime en brouillon, avantages
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.excellent_score(p_score uuid)
RETURNS record
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row record;
  v_uid uuid;
BEGIN
  v_uid := (SELECT auth.uid());
  SELECT ps.id, ps.org_id, ps.cycle_id, ps.employee_id, ps.score_final, ps.level,
         c.label AS cycle_label, c.end_date, c.status AS cycle_status
  INTO v_row
  FROM public.performance_scores AS ps
  JOIN public.performance_cycles AS c ON c.id = ps.cycle_id
  WHERE ps.id = p_score;
  IF v_uid IS NULL OR NOT FOUND
     OR NOT private.has_org_role(v_row.org_id, ARRAY['admin_rh', 'manager']::text[]) THEN
    RAISE EXCEPTION 'Score introuvable ou accès refusé';
  END IF;
  IF private.employee_owned(v_row.org_id, v_row.employee_id) THEN
    RAISE EXCEPTION 'On ne se propose pas une récompense à soi-même';
  END IF;
  IF v_row.level <> 'excellent' THEN
    RAISE EXCEPTION 'Une récompense se propose pour un niveau « excellent » seulement';
  END IF;
  IF v_row.cycle_status = 'open' THEN
    RAISE EXCEPTION 'Passez le cycle en revue avant de proposer une récompense, quand le score est stable';
  END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION private.excellent_score(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.propose_performance_bonus(p_score uuid, p_amount numeric)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_s record;
  v_id uuid;
  v_reason text;
BEGIN
  v_uid := (SELECT auth.uid());
  v_s := private.excellent_score(p_score);
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Le montant de la prime doit être supérieur à zéro';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.employee_bonuses AS b
    WHERE b.score_id = p_score AND b.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Une prime est déjà proposée pour ce score';
  END IF;
  v_reason := pg_catalog.format('Score %s/100 — %s',
    pg_catalog.trim_scale(v_s.score_final), v_s.cycle_label);

  -- Toujours en brouillon, même si l'appelant est RH : la validation est un geste distinct.
  INSERT INTO public.employee_bonuses (
    org_id, employee_id, year, kind, label, amount, status, reason, awarded_by, score_id
  ) VALUES (
    v_s.org_id, v_s.employee_id, EXTRACT(YEAR FROM v_s.end_date)::integer, 'performance',
    'Prime de performance', pg_catalog.round(p_amount, 2), 'draft', v_reason, v_uid, p_score
  )
  RETURNING id INTO v_id;

  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (v_s.org_id, v_uid, 'propose_performance_bonus', 'employee_bonuses', v_id::text,
          pg_catalog.jsonb_build_object('employee_id', v_s.employee_id, 'score_id', p_score,
            'amount', p_amount, 'status', 'draft'));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.propose_perk(p_score uuid, p_kind text, p_amount numeric, p_reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_s record;
  v_id uuid;
BEGIN
  v_uid := (SELECT auth.uid());
  v_s := private.excellent_score(p_score);
  IF p_kind NOT IN ('bonus_leave', 'training_budget') THEN
    RAISE EXCEPTION 'Type d’avantage inconnu';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'La quantité doit être supérieure à zéro';
  END IF;
  IF p_kind = 'bonus_leave' AND (p_amount > 10 OR p_amount * 2 <> pg_catalog.trunc(p_amount * 2)) THEN
    RAISE EXCEPTION 'Les jours bonus sont limités à 10, par demi-journée';
  END IF;

  INSERT INTO public.employee_perks (
    org_id, cycle_id, employee_id, score_id, kind, amount, reason, proposed_by
  ) VALUES (
    v_s.org_id, v_s.cycle_id, v_s.employee_id, p_score, p_kind, p_amount,
    COALESCE(NULLIF(btrim(COALESCE(p_reason, '')), ''),
             pg_catalog.format('Score %s/100 — %s', pg_catalog.trim_scale(v_s.score_final), v_s.cycle_label)),
    v_uid
  )
  RETURNING id INTO v_id;

  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (v_s.org_id, v_uid, 'propose_perk', 'employee_perks', v_id::text,
          pg_catalog.jsonb_build_object('employee_id', v_s.employee_id, 'kind', p_kind, 'amount', p_amount));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_perk(p_perk uuid, p_decision text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_p record;
BEGIN
  v_uid := (SELECT auth.uid());
  SELECT p.* INTO v_p FROM public.employee_perks AS p WHERE p.id = p_perk FOR UPDATE;
  IF v_uid IS NULL OR NOT FOUND
     OR NOT private.has_org_role(v_p.org_id, ARRAY['admin_rh']::text[]) THEN
    RAISE EXCEPTION 'Avantage introuvable ou accès refusé : seul l’administrateur RH valide';
  END IF;
  IF p_decision NOT IN ('approve', 'cancel') THEN RAISE EXCEPTION 'Décision inconnue'; END IF;

  IF p_decision = 'approve' THEN
    IF v_p.status <> 'proposed' THEN
      RAISE EXCEPTION 'Seul un avantage proposé peut être validé';
    END IF;
    UPDATE public.employee_perks AS p
    SET status = 'approved', approved_by = v_uid, updated_at = pg_catalog.clock_timestamp()
    WHERE p.id = p_perk;
    IF v_p.kind = 'bonus_leave' THEN
      -- Type payé, comme CAP : le moteur de paie ne le traite pas comme du sans-solde (017).
      INSERT INTO public.leave_types (org_id, code, name, paid, annual_days)
      VALUES (v_p.org_id, 'BON', 'Jours bonus performance', true, 0)
      ON CONFLICT (org_id, code) DO NOTHING;
    END IF;
  ELSE
    IF v_p.status = 'consumed' OR v_p.consumed_amount > 0 THEN
      RAISE EXCEPTION 'Un avantage déjà consommé ne s’annule pas';
    END IF;
    IF v_p.status = 'cancelled' THEN RAISE EXCEPTION 'Avantage déjà annulé'; END IF;
    UPDATE public.employee_perks AS p
    SET status = 'cancelled', updated_at = pg_catalog.clock_timestamp()
    WHERE p.id = p_perk;
  END IF;

  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (v_p.org_id, v_uid, 'decide_perk', 'employee_perks', p_perk::text,
          pg_catalog.jsonb_build_object('decision', p_decision, 'kind', v_p.kind));
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_perk(p_perk uuid, p_amount numeric, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_p record;
  v_total numeric;
BEGIN
  v_uid := (SELECT auth.uid());
  SELECT p.* INTO v_p FROM public.employee_perks AS p WHERE p.id = p_perk FOR UPDATE;
  IF v_uid IS NULL OR NOT FOUND
     OR NOT private.has_org_role(v_p.org_id, ARRAY['admin_rh']::text[]) THEN
    RAISE EXCEPTION 'Avantage introuvable ou accès refusé : seul l’administrateur RH enregistre la consommation';
  END IF;
  IF v_p.status <> 'approved' THEN
    RAISE EXCEPTION 'Seul un avantage validé se consomme';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Quantité consommée invalide'; END IF;
  v_total := v_p.consumed_amount + p_amount;
  IF v_total > v_p.amount THEN
    RAISE EXCEPTION 'La consommation dépasse l’avantage accordé (% sur %)', v_total, v_p.amount;
  END IF;
  UPDATE public.employee_perks AS p
  SET consumed_amount = v_total,
      status = CASE WHEN v_total = p.amount THEN 'consumed' ELSE p.status END,
      consume_note = NULLIF(btrim(COALESCE(p_note, '')), ''),
      updated_at = pg_catalog.clock_timestamp()
  WHERE p.id = p_perk;
  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (v_p.org_id, v_uid, 'consume_perk', 'employee_perks', p_perk::text,
          pg_catalog.jsonb_build_object('consumed', p_amount, 'total_consumed', v_total));
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Jeu de démonstration (espaces de démonstration seulement)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.seed_performance_demo(p_org uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_cycle uuid;
  v_start date := (pg_catalog.date_trunc('month', CURRENT_DATE) - interval '1 month')::date;
  v_end date := (pg_catalog.date_trunc('month', CURRENT_DATE) - interval '1 day')::date;
  v_emp record;
  v_i integer := 0;
  v_target numeric;
  v_ratio numeric;
  v_ratios numeric[] := ARRAY[1.15, 0.97, 0.90, 0.78, 1.00, 0.85, 0.70, 0.93, 0.99, 0.62, 1.04, 0.88];
  v_oid uuid;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL OR NOT private.is_demo_org(p_org)
     OR NOT private.has_org_role(p_org, ARRAY['admin_rh']::text[]) THEN
    RAISE EXCEPTION 'Chargement réservé à l’administrateur d’un espace de démonstration';
  END IF;
  IF EXISTS (SELECT 1 FROM public.performance_cycles AS c WHERE c.org_id = p_org) THEN
    RETURN NULL;
  END IF;
  PERFORM private.ensure_performance_settings(p_org);
  -- Les pointages du jeu de démo sont écrits en UTC (arrivée vers 08:00) : fuseau aligné.
  UPDATE public.performance_settings AS ps SET timezone = 'UTC' WHERE ps.org_id = p_org;

  INSERT INTO public.performance_cycles (org_id, label, kind, start_date, end_date, status, created_by)
  VALUES (p_org,
          (ARRAY['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'])[EXTRACT(MONTH FROM v_start)::integer]
            || ' ' || EXTRACT(YEAR FROM v_start)::integer,
          'month', v_start, v_end, 'open', v_uid)
  RETURNING id INTO v_cycle;

  FOR v_emp IN
    SELECT e.id FROM public.employees AS e
    WHERE e.org_id = p_org AND e.status = 'active'
    ORDER BY e.employee_number
  LOOP
    v_i := v_i + 1;
    v_ratio := v_ratios[((v_i - 1) % pg_catalog.array_length(v_ratios, 1)) + 1];

    v_target := 100;
    INSERT INTO public.employee_objectives (org_id, cycle_id, employee_id, title, indicator, unit, direction, target, weight_pct, status, set_by)
    VALUES (p_org, v_cycle, v_emp.id, 'Atteindre l’objectif d’activité du mois', 'Opérations traitées', 'opérations', 'higher', v_target, 60, 'validated', v_uid)
    RETURNING id INTO v_oid;
    UPDATE public.employee_objectives AS o
    SET achieved = pg_catalog.round(v_target * v_ratio, 0), reported_at = pg_catalog.clock_timestamp(),
        validated_by = v_uid, validated_at = pg_catalog.clock_timestamp()
    WHERE o.id = v_oid;

    IF v_i % 4 = 0 THEN
      -- Déclaré par le salarié, pas encore validé : non évalué.
      INSERT INTO public.employee_objectives (org_id, cycle_id, employee_id, title, indicator, unit, direction, target, weight_pct, status, achieved, reported_at, set_by)
      VALUES (p_org, v_cycle, v_emp.id, 'Réduire les retards de livraison', 'Retards constatés', 'retards', 'lower', 4, 40, 'self_reported', 3, pg_catalog.clock_timestamp(), v_uid);
    ELSE
      INSERT INTO public.employee_objectives (org_id, cycle_id, employee_id, title, indicator, unit, direction, target, weight_pct, status, achieved, validated_by, validated_at, set_by)
      VALUES (p_org, v_cycle, v_emp.id, 'Réduire les retards de livraison', 'Retards constatés', 'retards', 'lower', 4, 40, 'validated',
              CASE WHEN v_ratio >= 1 THEN 3 ELSE 6 END, v_uid, pg_catalog.clock_timestamp(), v_uid);
    END IF;
  END LOOP;

  PERFORM private.compute_performance_scores_core(v_cycle, v_uid);
  UPDATE public.performance_cycles AS c SET status = 'review' WHERE c.id = v_cycle;

  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id, details)
  VALUES (p_org, v_uid, 'seed_performance_demo', 'performance_cycles', v_cycle::text, NULL);
  RETURN v_cycle;
END;
$$;

-- La remise à zéro de la démo supprime aussi les cycles de performance
-- (objectifs, scores, badges et avantages partent avec, par cascade).
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
  DELETE FROM public.projects WHERE org_id = p_org;
  DELETE FROM public.leave_requests WHERE org_id = p_org;
  DELETE FROM public.clock_entries WHERE org_id = p_org;
  DELETE FROM public.performance_cycles WHERE org_id = p_org;
  DELETE FROM public.contracts WHERE org_id = p_org;
  DELETE FROM public.employees WHERE org_id = p_org;
  PERFORM pg_catalog.set_config('app.a26_demo_reset', 'off', true);

  INSERT INTO public.audit_log (org_id, actor, action, entity, entity_id)
  VALUES (p_org, v_uid, 'reset_demo', 'orgs', p_org::text);
END;
$$;

REVOKE ALL ON FUNCTION public.reset_demo_data(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10. Droits d'exécution
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.save_performance_settings(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.open_performance_cycle(uuid, text, text, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_performance_cycle_status(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reopen_performance_cycle(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_objective(uuid, uuid, uuid, text, text, numeric, text, text, integer, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_objective(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_objective_progress(uuid, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validate_objective(uuid, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.compute_performance_scores(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.award_recognition(uuid, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dismiss_recognition(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.propose_performance_bonus(uuid, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.propose_perk(uuid, text, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_perk(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.consume_perk(uuid, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.seed_performance_demo(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.save_performance_settings(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_performance_cycle(uuid, text, text, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_performance_cycle_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_performance_cycle(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_objective(uuid, uuid, uuid, text, text, numeric, text, text, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_objective(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_objective_progress(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_objective(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_performance_scores(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.award_recognition(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_recognition(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.propose_performance_bonus(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.propose_perk(uuid, text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_perk(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_perk(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_performance_demo(uuid) TO authenticated;
