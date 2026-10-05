// Logique pure du worker WhatsApp : aucun accès réseau ni global Deno, donc testable avec Vitest.
// Le worker (index.ts) la branche sur l'API WhatsApp Business Cloud et sur la file `notification_outbox`.

export interface OutboxRow {
  id: string;
  org_id: string;
  channel: string;
  template_key: string;
  recipient: string;
  payload: Record<string, unknown> | null;
  attempts: number;
}

export interface TemplateOptions {
  /** Préfixe des modèles côté Meta, `a26_` par défaut (ex. a26_leave_approved). */
  prefix?: string;
  /** Langue du modèle approuvé, `fr` par défaut. */
  language?: string;
}

export type BuildResult =
  | { ok: true; to: string; template: string; body: Record<string, unknown>; params: string[] }
  | { ok: false; error: string };

export type SendOutcome =
  | { kind: "sent"; providerId: string }
  /** Panne passagère (réseau, quota, 5xx) : nouvel essai plus tard. */
  | { kind: "retry"; error: string }
  /** Échec définitif pour ce message (numéro sans WhatsApp, modèle inconnu…). */
  | { kind: "fail"; error: string }
  /** Jeton ou compte invalide : problème de configuration, on arrête le lot sans pénaliser les messages. */
  | { kind: "auth"; error: string };

const MAX_PARAM_LENGTH = 200;

/** Meta refuse les paramètres vides, les retours à la ligne, les tabulations et les longues suites d'espaces. */
export function sanitizeParam(value: unknown, fallback = "-"): string {
  const text = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim()
    .slice(0, MAX_PARAM_LENGTH)
    .trim();
  return text || fallback;
}

/** `2026-10-12` → `12/10/2026`. Toute autre valeur est renvoyée telle quelle. */
export function formatDateFr(value: unknown): string {
  const text = String(value ?? "");
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text;
}

/** `3` → `3`, `2.5` → `2,5`. */
export function formatDaysFr(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? "");
  return String(Math.round(n * 100) / 100).replace(".", ",");
}

/**
 * Numéro E.164 de la base (`+22790112030`) → format de l'API (`22790112030`, chiffres seuls).
 * Renvoie null si le numéro ne commence pas par `+` ou sort de 8 à 15 chiffres.
 */
export function toWhatsAppNumber(recipient: string): string | null {
  const text = String(recipient ?? "").trim();
  if (!text.startsWith("+")) return null;
  const digits = text.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/** `+22790112030` → `+227••••2030` pour les journaux et les aperçus. */
export function maskRecipient(recipient: string): string {
  const text = String(recipient ?? "");
  if (text.length <= 8) return "••••";
  return `${text.slice(0, 4)}••••${text.slice(-4)}`;
}

type PayloadReader = (key: string) => unknown;

interface TemplateSpec {
  /** Texte du corps à soumettre à Meta ; {{n}} suit l'ordre de `params`. */
  params: (read: PayloadReader) => string[];
}

/** Un modèle par type de message, dans l'ordre exact des variables {{1}}, {{2}}… du corps approuvé. */
export const TEMPLATE_SPECS: Record<string, TemplateSpec> = {
  leave_approved: {
    params: (p) => [
      sanitizeParam(p("leave_type"), "congé"),
      sanitizeParam(formatDateFr(p("start_date"))),
      sanitizeParam(formatDateFr(p("end_date"))),
      sanitizeParam(formatDaysFr(p("days"))),
      sanitizeParam(p("org"), "votre entreprise"),
    ],
  },
  leave_rejected: {
    params: (p) => [
      sanitizeParam(p("leave_type"), "congé"),
      sanitizeParam(formatDateFr(p("start_date"))),
      sanitizeParam(formatDateFr(p("end_date"))),
      sanitizeParam(p("org"), "votre entreprise"),
      sanitizeParam(p("decision_note"), "non précisé"),
    ],
  },
  payroll_approval: {
    params: (p) => [sanitizeParam(p("period_label")), sanitizeParam(p("org"), "votre entreprise")],
  },
  payslip_ready: {
    params: (p) => [sanitizeParam(p("period_label")), sanitizeParam(p("org"), "votre entreprise")],
  },
  recognition_awarded: {
    params: (p) => [sanitizeParam(p("badge_label")), sanitizeParam(p("org"), "votre entreprise")],
  },
  clock_reminder: {
    params: (p) => [sanitizeParam(p("org"), "votre entreprise")],
  },
};

/** Construit le corps de l'appel `POST /{phone-number-id}/messages` pour une ligne de la file. */
export function buildTemplateMessage(row: OutboxRow, options: TemplateOptions = {}): BuildResult {
  if (row.channel !== "whatsapp") {
    return { ok: false, error: `Canal « ${row.channel} » non pris en charge par le worker WhatsApp` };
  }
  const spec = TEMPLATE_SPECS[row.template_key];
  if (!spec) {
    return { ok: false, error: `Modèle « ${row.template_key} » inconnu : aucun message WhatsApp associé` };
  }
  const to = toWhatsAppNumber(row.recipient);
  if (!to) {
    return { ok: false, error: "Numéro WhatsApp invalide : corrigez la fiche du salarié (format +227… ou +225…)" };
  }
  const payload = row.payload ?? {};
  const params = spec.params((key) => payload[key]);
  const template = `${options.prefix ?? "a26_"}${row.template_key}`;
  return {
    ok: true,
    to,
    template,
    params,
    body: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: template,
        language: { code: options.language ?? "fr" },
        components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }],
      },
    },
  };
}

// Codes d'erreur de l'API WhatsApp Business Cloud (Graph API).
// https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
const RETRYABLE_CODES = new Set([
  4, // limite d'appels de l'application
  17, // limite d'appels du compte
  32, // limite d'appels de la page
  613, // limite d'appels personnalisée
  80007, // limite de débit du compte WhatsApp Business
  130429, // débit trop élevé
  131016, // service momentanément indisponible
  131056, // trop de messages vers le même destinataire en peu de temps
]);
const AUTH_CODES = new Set([
  190, // jeton expiré ou invalide
  200, // permission manquante
  10, // permission refusée
  131031, // compte WhatsApp Business bloqué
]);

function truncate(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Range la réponse HTTP de l'API dans l'une des quatre issues possibles. */
export function classifyResponse(status: number, json: unknown): SendOutcome {
  const data = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const messages = Array.isArray(data.messages) ? (data.messages as Array<Record<string, unknown>>) : [];
  const providerId = messages[0]?.id;
  if (status >= 200 && status < 300 && typeof providerId === "string" && providerId) {
    return { kind: "sent", providerId };
  }

  const err = (data.error && typeof data.error === "object" ? data.error : {}) as Record<string, unknown>;
  const code = typeof err.code === "number" ? err.code : Number(err.code);
  const errorData = (err.error_data && typeof err.error_data === "object" ? err.error_data : {}) as Record<string, unknown>;
  const detail = String(errorData.details ?? err.message ?? "").trim();
  const label = Number.isFinite(code) ? `WhatsApp ${code}` : `HTTP ${status}`;
  const error = truncate(detail ? `${label} : ${detail}` : label);

  if (status === 401 || status === 403 || AUTH_CODES.has(code)) return { kind: "auth", error };
  if (status === 429 || status >= 500 || RETRYABLE_CODES.has(code)) return { kind: "retry", error };
  if (status >= 200 && status < 300) {
    return { kind: "retry", error: "Réponse WhatsApp sans identifiant de message" };
  }
  return { kind: "fail", error };
}

/** Comparaison en temps constant, pour le secret partagé du worker. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
