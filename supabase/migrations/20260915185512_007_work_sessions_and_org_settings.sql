/*
# Work sessions, presence tracking and organisation time settings

This migration adds everything needed to turn simple clock-in/clock-out into a
monitored "work session" with inactivity control, and to let each organisation
choose how worked time is measured for payroll.

## 1. Modified tables
- `clock_entries`
  - `last_active_at` (timestamptz) — the last moment the employee confirmed
    presence ("I'm here") or clocked in. Used to detect inactivity.
  - `active_seconds` (integer, default 0) — accumulated *confirmed active*
    working time, capped per interval so idle gaps are deducted. This is the
    "active" measure, distinct from the raw clock_in→clock_out span.
  - `closed_reason` (text) — how the session ended: 'manual' (employee ended it)
    or 'auto_inactive' (closed automatically after no presence confirmation).
  - Existing closed rows are backfilled: last_active_at = clock_out,
    active_seconds = full span, closed_reason = 'manual'.

## 2. New tables
- `org_settings` (one row per organisation)
  - `org_id` (uuid, primary key, references orgs)
  - `reminder_interval_minutes` (int, default 25) — how often the presence
    reminder appears during an active session.
  - `grace_minutes` (int, default 5) — how long the employee has to confirm
    before the session is closed automatically and they are signed out.
  - `payroll_time_basis` (text, default 'gross') — 'gross' counts clock_in→
    clock_out; 'active' counts only confirmed active time.
  - `updated_at` (timestamptz)

## 3. Security
- New policy `clock_update_own`: an employee may update their OWN clock entry
  (needed to end their session and record presence confirmations). Managers and
  admins keep their existing correction policy.
- RLS enabled on `org_settings`:
  - members of the organisation can read the settings;
  - only `admin_rh` and `preparateur` can create or change them.
*/

-- 1. clock_entries session columns -------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clock_entries' AND column_name='last_active_at') THEN
    ALTER TABLE public.clock_entries ADD COLUMN last_active_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clock_entries' AND column_name='active_seconds') THEN
    ALTER TABLE public.clock_entries ADD COLUMN active_seconds integer NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clock_entries' AND column_name='closed_reason') THEN
    ALTER TABLE public.clock_entries ADD COLUMN closed_reason text;
  END IF;
END $$;

-- Backfill existing rows so history stays coherent
UPDATE public.clock_entries
SET last_active_at = COALESCE(last_active_at, clock_out, clock_in)
WHERE last_active_at IS NULL;

UPDATE public.clock_entries
SET active_seconds = GREATEST(0, ROUND(EXTRACT(EPOCH FROM (clock_out - clock_in)))::int)
WHERE clock_out IS NOT NULL AND active_seconds = 0;

UPDATE public.clock_entries
SET closed_reason = 'manual'
WHERE clock_out IS NOT NULL AND closed_reason IS NULL;

-- 2. Self-service update policy for employees ---------------------------------
DROP POLICY IF EXISTS "clock_update_own" ON public.clock_entries;
CREATE POLICY "clock_update_own" ON public.clock_entries
  FOR UPDATE TO authenticated
  USING (
    is_member(org_id) AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = clock_entries.employee_id AND e.user_id = auth.uid()
    )
  )
  WITH CHECK (
    is_member(org_id) AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = clock_entries.employee_id AND e.user_id = auth.uid()
    )
  );

-- 3. org_settings table -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.org_settings (
  org_id uuid PRIMARY KEY REFERENCES public.orgs(id) ON DELETE CASCADE,
  reminder_interval_minutes int NOT NULL DEFAULT 25 CHECK (reminder_interval_minutes BETWEEN 1 AND 240),
  grace_minutes int NOT NULL DEFAULT 5 CHECK (grace_minutes BETWEEN 1 AND 120),
  payroll_time_basis text NOT NULL DEFAULT 'gross' CHECK (payroll_time_basis IN ('gross', 'active')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_settings_select_member" ON public.org_settings;
CREATE POLICY "org_settings_select_member" ON public.org_settings
  FOR SELECT TO authenticated
  USING (is_member(org_id));

DROP POLICY IF EXISTS "org_settings_insert_admin" ON public.org_settings;
CREATE POLICY "org_settings_insert_admin" ON public.org_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    is_member(org_id) AND EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = org_settings.org_id AND m.user_id = auth.uid()
        AND m.role IN ('admin_rh', 'preparateur')
    )
  );

DROP POLICY IF EXISTS "org_settings_update_admin" ON public.org_settings;
CREATE POLICY "org_settings_update_admin" ON public.org_settings
  FOR UPDATE TO authenticated
  USING (
    is_member(org_id) AND EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = org_settings.org_id AND m.user_id = auth.uid()
        AND m.role IN ('admin_rh', 'preparateur')
    )
  )
  WITH CHECK (
    is_member(org_id) AND EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = org_settings.org_id AND m.user_id = auth.uid()
        AND m.role IN ('admin_rh', 'preparateur')
    )
  );
