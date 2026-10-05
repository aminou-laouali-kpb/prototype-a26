-- A26 — Câblage des notifications WhatsApp (côté base)
--
-- Jusqu'ici `notification_outbox` (011) existait sans que rien ne la remplisse
-- quand un congé est décidé ou qu'un cycle de paie avance, et sans point d'appui
-- pour un worker. Cette migration :
--   1. normalise les numéros (E.164, +227 / +225) et dédoublonne les messages ;
--   2. met en file, par triggers, les messages métier :
--        leave_approved / leave_rejected  décision de congé  → le salarié
--        payroll_approval                 cycle calculé      → les approbateurs paie
--        payslip_ready                    cycle verrouillé   → chaque salarié payé
--      (recognition_awarded est déjà posé par la migration 018) ;
--   3. ajoute deux fonctions réservées au rôle service_role pour le worker :
--      claim_pending_notifications (réserve un lot, sans doublon entre workers)
--      et finish_notification (succès, nouvel essai ou échec définitif).
-- Rien n'est envoyé ici : le worker (fonction Edge + compte WhatsApp Business)
-- reste à brancher. Sans lui, les lignes restent `pending` et l'écran
-- Paramètres → Notifications les montre.

-- ---------------------------------------------------------------------------
-- 1. Colonnes d'appui
-- ---------------------------------------------------------------------------

ALTER TABLE public.notification_outbox ADD COLUMN IF NOT EXISTS dedupe_key text;
ALTER TABLE public.notification_outbox ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.notification_outbox ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE public.notification_outbox ADD COLUMN IF NOT EXISTS provider_message_id text;

-- Un même événement ne produit qu'un message par destinataire.
CREATE UNIQUE INDEX IF NOT EXISTS notification_outbox_dedupe_idx
  ON public.notification_outbox (org_id, template_key, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Aides internes
-- ---------------------------------------------------------------------------

-- Numéro au format international sans espace, ou NULL s'il n'est pas exploitable.
--   '+227 90 11 20 30' → '+22790112030'   '0022790112030' → '+22790112030'
--   '90112030' (Niger) → '+22790112030'    '0102030405' (Côte d'Ivoire) → '+2250102030405'
CREATE OR REPLACE FUNCTION private.normalize_phone(p_phone text, p_country text DEFAULT 'NE')
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_raw text;
  v_digits text;
  v_prefix text;
BEGIN
  v_raw := pg_catalog.btrim(COALESCE(p_phone, ''));
  IF v_raw = '' THEN RETURN NULL; END IF;
  v_digits := pg_catalog.regexp_replace(v_raw, '[^0-9]', '', 'g');
  IF v_digits = '' THEN RETURN NULL; END IF;
  v_prefix := CASE p_country WHEN 'CI' THEN '225' ELSE '227' END;

  IF pg_catalog.left(v_raw, 1) = '+' THEN
    NULL;
  ELSIF pg_catalog.left(v_digits, 2) = '00' THEN
    v_digits := pg_catalog.substr(v_digits, 3);
  ELSIF pg_catalog.left(v_digits, 3) IN ('227', '225') AND pg_catalog.length(v_digits) >= 11 THEN
    NULL;
  ELSIF (p_country = 'CI' AND pg_catalog.length(v_digits) IN (8, 10))
        OR (p_country IS DISTINCT FROM 'CI' AND pg_catalog.length(v_digits) = 8) THEN
    v_digits := v_prefix || v_digits;
  ELSE
    RETURN NULL;
  END IF;

  IF pg_catalog.length(v_digits) < 8 OR pg_catalog.length(v_digits) > 15 THEN
    RETURN NULL;
  END IF;
  RETURN '+' || v_digits;
END;
$$;

CREATE OR REPLACE FUNCTION private.month_label_fr(p_year integer, p_month integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT (ARRAY['janvier','février','mars','avril','mai','juin','juillet','août',
                'septembre','octobre','novembre','décembre'])[p_month] || ' ' || p_year::text;
$$;

-- Met un message en file pour un salarié. Sans contrôle de droit : réservé aux triggers.
--   téléphone absent   → rien (rien à montrer)
--   téléphone invalide → ligne `failed` avec un message clair, visible dans l'écran
--   même événement     → un seul message (clé de dédoublonnage)
CREATE OR REPLACE FUNCTION private.queue_notification(
  p_org uuid,
  p_employee uuid,
  p_template text,
  p_payload jsonb,
  p_dedupe text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_phone text;
  v_country text;
  v_e164 text;
  v_org_name text;
BEGIN
  SELECT NULLIF(pg_catalog.btrim(e.phone), '') INTO v_phone
  FROM public.employees AS e
  WHERE e.id = p_employee AND e.org_id = p_org;
  IF v_phone IS NULL THEN RETURN; END IF;

  SELECT o.country_code, o.name INTO v_country, v_org_name
  FROM public.orgs AS o WHERE o.id = p_org;
  v_e164 := private.normalize_phone(v_phone, COALESCE(v_country, 'NE'));

  INSERT INTO public.notification_outbox (
    org_id, channel, template_key, recipient, payload, status, error, dedupe_key
  ) VALUES (
    p_org, 'whatsapp', p_template, COALESCE(v_e164, v_phone),
    pg_catalog.jsonb_build_object('org', v_org_name) || COALESCE(p_payload, '{}'::jsonb),
    CASE WHEN v_e164 IS NULL THEN 'failed' ELSE 'pending' END,
    CASE WHEN v_e164 IS NULL
         THEN 'Numéro WhatsApp invalide : corrigez la fiche du salarié (format +227… ou +225…)' END,
    p_dedupe
  )
  ON CONFLICT (org_id, template_key, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION private.normalize_phone(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.month_label_fr(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.queue_notification(uuid, uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Triggers métier
-- ---------------------------------------------------------------------------

-- Congé décidé → le salarié (le responsable ne reçoit rien : il vient de décider).
CREATE OR REPLACE FUNCTION private.notify_leave_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_type text;
BEGIN
  IF private.is_demo_reset() THEN RETURN NEW; END IF;
  IF NOT (OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected')) THEN
    RETURN NEW;
  END IF;
  SELECT lt.name INTO v_type FROM public.leave_types AS lt WHERE lt.id = NEW.leave_type_id;
  PERFORM private.queue_notification(
    NEW.org_id, NEW.employee_id,
    CASE NEW.status WHEN 'approved' THEN 'leave_approved' ELSE 'leave_rejected' END,
    pg_catalog.jsonb_build_object(
      'leave_request_id', NEW.id,
      'leave_type', v_type,
      'start_date', NEW.start_date,
      'end_date', NEW.end_date,
      'days', NEW.days,
      'decision_note', NEW.decision_note
    ),
    NEW.id::text || ':' || NEW.status
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a26_notify_leave_decision ON public.leave_requests;
CREATE TRIGGER a26_notify_leave_decision
AFTER UPDATE OF status ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION private.notify_leave_decision();

-- Cycle de paie : calculé → les approbateurs ; verrouillé → chaque salarié payé.
CREATE OR REPLACE FUNCTION private.notify_payroll_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_label text;
  v_target record;
BEGIN
  IF private.is_demo_reset() THEN RETURN NEW; END IF;
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  v_label := private.month_label_fr(NEW.period_year, NEW.period_month);

  IF NEW.status = 'prepared' THEN
    -- Une nouvelle préparation (après réouverture) redemande une approbation.
    FOR v_target IN
      SELECT DISTINCT e.id
      FROM public.memberships AS m
      JOIN public.employees AS e ON e.user_id = m.user_id AND e.org_id = m.org_id
      WHERE m.org_id = NEW.org_id AND m.role = 'approveur_paie' AND e.status = 'active'
    LOOP
      PERFORM private.queue_notification(
        NEW.org_id, v_target.id, 'payroll_approval',
        pg_catalog.jsonb_build_object('period_id', NEW.id, 'period_label', v_label),
        NEW.id::text || ':' || COALESCE(EXTRACT(epoch FROM NEW.prepared_at)::bigint::text, '0')
          || ':' || v_target.id::text
      );
    END LOOP;
  ELSIF NEW.status = 'locked' THEN
    FOR v_target IN
      SELECT DISTINCT pl.employee_id AS id
      FROM public.payroll_lines AS pl
      WHERE pl.org_id = NEW.org_id AND pl.period_id = NEW.id
    LOOP
      PERFORM private.queue_notification(
        NEW.org_id, v_target.id, 'payslip_ready',
        pg_catalog.jsonb_build_object('period_id', NEW.id, 'period_label', v_label),
        NEW.id::text || ':' || v_target.id::text
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a26_notify_payroll_status ON public.payroll_periods;
CREATE TRIGGER a26_notify_payroll_status
AFTER UPDATE OF status ON public.payroll_periods
FOR EACH ROW EXECUTE FUNCTION private.notify_payroll_status();

REVOKE ALL ON FUNCTION private.notify_leave_decision() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.notify_payroll_status() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Mise en file manuelle : même normalisation que les triggers
-- ---------------------------------------------------------------------------

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
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_country text;
  v_recipient text;
BEGIN
  IF p_channel NOT IN ('whatsapp', 'email', 'sms') THEN
    RAISE EXCEPTION 'Canal inconnu';
  END IF;
  IF NOT private.has_org_role(p_org, ARRAY['admin_rh', 'preparateur', 'manager']::text[]) THEN
    RAISE EXCEPTION 'Droits insuffisants';
  END IF;

  v_recipient := pg_catalog.btrim(COALESCE(p_recipient, ''));
  IF p_channel IN ('whatsapp', 'sms') THEN
    SELECT o.country_code INTO v_country FROM public.orgs AS o WHERE o.id = p_org;
    v_recipient := private.normalize_phone(v_recipient, COALESCE(v_country, 'NE'));
    IF v_recipient IS NULL THEN
      RAISE EXCEPTION 'Numéro invalide : utilisez le format international (+227… ou +225…)';
    END IF;
  ELSIF v_recipient = '' THEN
    RAISE EXCEPTION 'Destinataire obligatoire';
  END IF;

  INSERT INTO public.notification_outbox (org_id, channel, template_key, recipient, payload)
  VALUES (p_org, p_channel, pg_catalog.btrim(p_template), v_recipient, COALESCE(p_payload, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_notification(uuid, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_notification(uuid, text, text, text, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Points d'appui du worker (service_role uniquement)
-- ---------------------------------------------------------------------------

-- Réserve un lot de messages `pending`. SKIP LOCKED : deux workers ne prennent jamais
-- la même ligne. Une réservation oubliée (worker tombé) se libère après 10 minutes.
-- Cinq essais au plus : au-delà, la ligne reste `pending` mais n'est plus servie
-- (finish_notification la passe en `failed` dès le dernier essai manqué).
CREATE OR REPLACE FUNCTION public.claim_pending_notifications(
  p_org uuid DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS SETOF public.notification_outbox
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.notification_outbox AS n
  SET locked_at = pg_catalog.clock_timestamp(),
      attempts = n.attempts + 1
  WHERE n.id IN (
    SELECT q.id
    FROM public.notification_outbox AS q
    WHERE q.status = 'pending'
      AND q.attempts < 5
      AND (p_org IS NULL OR q.org_id = p_org)
      AND (q.locked_at IS NULL OR q.locked_at < pg_catalog.clock_timestamp() - interval '10 minutes')
    ORDER BY q.created_at
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 100))
    FOR UPDATE SKIP LOCKED
  )
  RETURNING n.*;
$$;

-- Clôt une réservation : envoyé, nouvel essai plus tard, ou échec définitif.
CREATE OR REPLACE FUNCTION public.finish_notification(
  p_id uuid,
  p_ok boolean,
  p_error text DEFAULT NULL,
  p_provider_id text DEFAULT NULL,
  p_retry boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempts integer;
  v_status text;
BEGIN
  SELECT n.attempts, n.status INTO v_attempts, v_status
  FROM public.notification_outbox AS n
  WHERE n.id = p_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification introuvable';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Notification déjà clôturée (statut : %)', v_status;
  END IF;

  IF p_ok THEN
    UPDATE public.notification_outbox AS n
    SET status = 'sent', sent_at = pg_catalog.clock_timestamp(), error = NULL,
        provider_message_id = NULLIF(pg_catalog.btrim(COALESCE(p_provider_id, '')), ''),
        locked_at = NULL
    WHERE n.id = p_id;
  ELSIF COALESCE(p_retry, true) AND v_attempts < 5 THEN
    UPDATE public.notification_outbox AS n
    SET error = NULLIF(pg_catalog.btrim(COALESCE(p_error, '')), ''), locked_at = NULL
    WHERE n.id = p_id;
  ELSE
    UPDATE public.notification_outbox AS n
    SET status = 'failed',
        error = COALESCE(NULLIF(pg_catalog.btrim(COALESCE(p_error, '')), ''), 'Échec d’envoi'),
        locked_at = NULL
    WHERE n.id = p_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pending_notifications(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_notification(uuid, boolean, text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_notifications(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_notification(uuid, boolean, text, text, boolean) TO service_role;
