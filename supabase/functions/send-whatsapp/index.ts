// Worker WhatsApp : vide la file `notification_outbox` (canal whatsapp) vers l'API WhatsApp Business Cloud.
//
// Appelé par un planificateur (pg_cron + pg_net, ou n'importe quel cron HTTP) avec l'en-tête
// `x-worker-secret`. Voir docs/WHATSAPP-WORKER.md pour la mise en service.
//
//   POST { "limit": 20, "org_id": "<uuid>", "dry_run": false }   (tout est optionnel)
//
// dry_run : lit les messages en attente et montre ce qui partirait, sans rien réserver ni envoyer.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildTemplateMessage,
  classifyResponse,
  maskRecipient,
  safeEqual,
  type OutboxRow,
  type SendOutcome,
} from "./messages.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const CONCURRENCY = 5;
const SEND_TIMEOUT_MS = 15_000;

interface Summary {
  claimed: number;
  sent: number;
  retry: number;
  failed: number;
  released: number;
  aborted: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  const workerSecret = Deno.env.get("WHATSAPP_WORKER_SECRET") ?? "";
  if (workerSecret.length < 16) {
    return json({ error: "WHATSAPP_WORKER_SECRET manquant ou trop court (16 caractères minimum)." }, 500);
  }
  const provided = req.headers.get("x-worker-secret") ?? "";
  if (!safeEqual(provided, workerSecret)) return json({ error: "Non autorisé." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Configuration Supabase incomplète côté serveur." }, 500);
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const dryRun = body.dry_run === true;
  const orgId = typeof body.org_id === "string" && body.org_id.trim() ? body.org_id.trim() : null;
  if (orgId && !isUuid(orgId)) return json({ error: "org_id invalide." }, 400);
  const defaultLimit = Number(Deno.env.get("WHATSAPP_BATCH_SIZE")) || 20;
  const requested = Number(body.limit);
  const limit = Math.max(1, Math.min(Number.isFinite(requested) && requested > 0 ? requested : defaultLimit, 100));

  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const apiVersion = Deno.env.get("WHATSAPP_API_VERSION") || "v21.0";
  const apiBase = (Deno.env.get("WHATSAPP_API_BASE") || "https://graph.facebook.com").replace(/\/+$/, "");
  const templateOptions = {
    prefix: Deno.env.get("WHATSAPP_TEMPLATE_PREFIX") ?? "a26_",
    language: Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") ?? "fr",
  };

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  if (dryRun) {
    let query = admin
      .from("notification_outbox")
      .select("id, org_id, channel, template_key, recipient, payload, attempts")
      .eq("status", "pending")
      .eq("channel", "whatsapp")
      .order("created_at", { ascending: true })
      .limit(limit);
    if (orgId) query = query.eq("org_id", orgId);
    const { data, error } = await query;
    if (error) return json({ error: error.message }, 500);
    const preview = ((data ?? []) as OutboxRow[]).map((row) => {
      const built = buildTemplateMessage(row, templateOptions);
      return built.ok
        ? { id: row.id, to: maskRecipient(row.recipient), template: built.template, params: built.params }
        : { id: row.id, to: maskRecipient(row.recipient), error: built.error };
    });
    return json({
      dry_run: true,
      configured: Boolean(accessToken && phoneNumberId),
      pending: preview.length,
      preview,
    });
  }

  // Sans identifiants, on ne réserve rien : les messages restent `pending`, aucun essai n'est consommé.
  if (!accessToken || !phoneNumberId) {
    return json({
      error: "WhatsApp Business n'est pas configuré. Ajoutez WHATSAPP_ACCESS_TOKEN et WHATSAPP_PHONE_NUMBER_ID pour activer l'envoi.",
    }, 503);
  }

  const { data: claimed, error: claimError } = await admin.rpc("claim_pending_notifications", {
    p_org: orgId,
    p_limit: limit,
    p_channel: "whatsapp",
  });
  if (claimError) return json({ error: claimError.message }, 500);

  const rows = (claimed ?? []) as OutboxRow[];
  const summary: Summary = { claimed: rows.length, sent: 0, retry: 0, failed: 0, released: 0, aborted: null };
  const endpoint = `${apiBase}/${apiVersion}/${phoneNumberId}/messages`;

  // Une écriture d'état qui échoue ne doit pas faire perdre le résultat : trois tentatives.
  const record = async (fn: string, args: Record<string, unknown>) => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { error } = await admin.rpc(fn, args);
      if (!error) return;
      if (attempt === 3) console.error(`send-whatsapp: ${fn} a échoué`, error.message);
      else await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
    }
  };

  const send = async (payload: Record<string, unknown>): Promise<SendOutcome> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => null);
      return classifyResponse(response.status, data);
    } catch (e) {
      const reason = e instanceof DOMException && e.name === "AbortError" ? "délai dépassé" : "réseau injoignable";
      return { kind: "retry", error: `WhatsApp : ${reason}` };
    } finally {
      clearTimeout(timer);
    }
  };

  const queue = [...rows];
  const worker = async () => {
    for (let row = queue.shift(); row; row = queue.shift()) {
      if (summary.aborted) {
        await record("release_notification", { p_id: row.id, p_error: summary.aborted });
        summary.released++;
        continue;
      }
      const built = buildTemplateMessage(row, templateOptions);
      if (!built.ok) {
        await record("finish_notification", { p_id: row.id, p_ok: false, p_error: built.error, p_provider_id: null, p_retry: false });
        summary.failed++;
        continue;
      }
      const outcome = await send(built.body);
      if (outcome.kind === "sent") {
        await record("finish_notification", { p_id: row.id, p_ok: true, p_error: null, p_provider_id: outcome.providerId, p_retry: true });
        summary.sent++;
      } else if (outcome.kind === "retry") {
        await record("finish_notification", { p_id: row.id, p_ok: false, p_error: outcome.error, p_provider_id: null, p_retry: true });
        summary.retry++;
      } else if (outcome.kind === "fail") {
        await record("finish_notification", { p_id: row.id, p_ok: false, p_error: outcome.error, p_provider_id: null, p_retry: false });
        summary.failed++;
      } else {
        // Jeton ou compte invalide : on rend ce message et les suivants sans consommer d'essai.
        summary.aborted = outcome.error;
        await record("release_notification", { p_id: row.id, p_error: outcome.error });
        summary.released++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));

  console.log("send-whatsapp", JSON.stringify(summary));
  return json(summary, summary.aborted ? 502 : 200);
});
