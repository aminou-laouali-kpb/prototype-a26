-- A26 — Appuis du worker WhatsApp (fonction Edge `send-whatsapp`)
--
-- Complète la migration 019 :
--   1. claim_pending_notifications filtre par canal : le worker WhatsApp ne doit
--      pas réserver les lignes e-mail ou SMS. Les lignes dont le dernier essai a
--      été réservé puis jamais clôturé (worker tombé) passent en `failed` au lieu
--      de rester `pending` à jamais.
--   2. release_notification rend une réservation sans consommer d'essai : un jeton
--      WhatsApp invalide ou expiré est un problème de configuration, pas du message.
-- Fonctions réservées au rôle service_role, comme celles de la 019.

DROP FUNCTION IF EXISTS public.claim_pending_notifications(uuid, integer);

CREATE OR REPLACE FUNCTION public.claim_pending_notifications(
  p_org uuid DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_channel text DEFAULT NULL
)
RETURNS SETOF public.notification_outbox
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH abandoned AS (
    UPDATE public.notification_outbox AS a
    SET status = 'failed',
        locked_at = NULL,
        error = COALESCE(a.error, 'Abandonné : 5 essais sans réponse du worker')
    WHERE a.status = 'pending'
      AND a.attempts >= 5
      AND a.locked_at < pg_catalog.clock_timestamp() - interval '10 minutes'
      AND (p_org IS NULL OR a.org_id = p_org)
      AND (p_channel IS NULL OR a.channel = p_channel)
    RETURNING a.id
  )
  UPDATE public.notification_outbox AS n
  SET locked_at = pg_catalog.clock_timestamp(),
      attempts = n.attempts + 1
  WHERE n.id IN (
    SELECT q.id
    FROM public.notification_outbox AS q
    WHERE q.status = 'pending'
      AND q.attempts < 5
      AND (p_org IS NULL OR q.org_id = p_org)
      AND (p_channel IS NULL OR q.channel = p_channel)
      AND (q.locked_at IS NULL OR q.locked_at < pg_catalog.clock_timestamp() - interval '10 minutes')
    ORDER BY q.created_at
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 100))
    FOR UPDATE SKIP LOCKED
  )
  RETURNING n.*;
$$;

-- Rend une réservation sans pénalité : l'essai du claim n'est pas décompté.
CREATE OR REPLACE FUNCTION public.release_notification(p_id uuid, p_error text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.notification_outbox AS n
  SET locked_at = NULL,
      attempts = GREATEST(n.attempts - 1, 0),
      error = NULLIF(pg_catalog.btrim(COALESCE(p_error, '')), '')
  WHERE n.id = p_id AND n.status = 'pending';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pending_notifications(uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_notification(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_notifications(uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_notification(uuid, text) TO service_role;
