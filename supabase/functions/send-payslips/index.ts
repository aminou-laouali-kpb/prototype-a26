import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigin = Deno.env.get("PAYSLIP_ALLOWED_ORIGIN") || "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  "Vary": "Origin",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const fmtXof = (n: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(n || 0)) + " FCFA";

const escapeHtml = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character] ?? character));

const safeHeaderText = (value: string, fallback: string) => {
  const safe = value
    .replace(/[\r\n]+/g, " ")
    .replace(/[^\p{L}\p{N} .,+'&()-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return safe || fallback;
};

const isEmail = (value: string) =>
  value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !/^Bearer\s+\S+$/i.test(authHeader)) {
      return json({ error: "Non authentifié." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const configuredFromEmail = Deno.env.get("PAYSLIP_FROM_EMAIL") || "onboarding@resend.dev";
    const fromEmail = configuredFromEmail.replace(/[\r\n]/g, " ").trim();

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json({ error: "Configuration Supabase incomplète côté serveur." }, 500);
    }
    if (!resendKey) {
      return json({
        error: "Aucun service d'envoi d'e-mails n'est configuré. Ajoutez une clé RESEND_API_KEY pour activer l'envoi des bulletins.",
      }, 503);
    }
    if (!isEmail(fromEmail)) return json({ error: "Adresse d'expédition invalide côté serveur." }, 500);

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const periodId = typeof body?.period_id === "string" ? body.period_id.trim() : "";
    const forceResend = body?.force_resend === true;
    if (!isUuid(periodId)) return json({ error: "Cycle de paie manquant ou invalide." }, 400);

    // This client keeps all reads under the caller's RLS policies.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) return json({ error: "Session invalide." }, 401);

    const { data: period, error: periodErr } = await userClient
      .from("payroll_periods")
      .select("id, org_id, period_year, period_month, status")
      .eq("id", periodId)
      .maybeSingle();
    if (periodErr) return json({ error: periodErr.message }, 400);
    if (!period) return json({ error: "Cycle introuvable ou accès refusé." }, 404);
    if (period.status !== "approved" && period.status !== "locked") {
      return json({ error: "Les bulletins ne peuvent être envoyés qu'après validation du cycle." }, 409);
    }

    const { data: membership, error: membershipError } = await userClient
      .from("memberships")
      .select("role")
      .eq("org_id", period.org_id)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (membershipError) return json({ error: membershipError.message }, 403);
    const allowedRoles = ["admin_rh", "preparateur", "approveur_paie"];
    if (!membership || !allowedRoles.includes(membership.role)) {
      return json({ error: "Vous n'êtes pas autorisé à envoyer les bulletins." }, 403);
    }
    if (forceResend && membership.role !== "admin_rh") {
      return json({ error: "Seul un administrateur RH peut forcer un nouvel envoi." }, 403);
    }

    const { data: lines, error: linesErr } = await userClient
      .from("payroll_lines")
      .select("id, period_id, employee_id, gross, cnps_employee, cmu_employee, its, net, emailed_at, email_error, employee:employees(*)")
      .eq("org_id", period.org_id)
      .eq("period_id", periodId);
    if (linesErr) return json({ error: linesErr.message }, 400);

    const { data: org, error: orgError } = await userClient
      .from("orgs")
      .select("name, legal_name, country_code")
      .eq("id", period.org_id)
      .maybeSingle();
    if (orgError) return json({ error: orgError.message }, 400);
    const orgName = String(org?.legal_name || org?.name || "Votre employeur").trim();
    const deductionsLabel = org?.country_code === "CI" ? "CNPS, CMU, ITS" : "CNSS, IUTS";
    const displayOrgName = safeHeaderText(orgName, "Votre employeur");
    const periodLabel = `${MONTHS[period.period_month - 1] ?? "Période"} ${period.period_year}`;
    const safePeriodLabel = escapeHtml(periodLabel);

    const admin = createClient(supabaseUrl, serviceKey);
    let sent = 0;
    let skipped = 0;
    let alreadySent = 0;
    const failures: string[] = [];

    for (const line of lines ?? []) {
      if (!forceResend && line.emailed_at) {
        alreadySent++;
        continue;
      }

      const emp = Array.isArray(line.employee) ? line.employee[0] : line.employee;
      const to = String(emp?.email ?? "").trim();
      if (!to) {
        skipped++;
        continue;
      }
      if (!isEmail(to)) {
        const message = "Adresse e-mail invalide";
        const { error: trackingError } = await admin.from("payroll_lines")
          .update({ email_error: message })
          .eq("id", line.id)
          .eq("org_id", period.org_id);
        failures.push(`${String(emp?.last_name ?? to)}: ${trackingError ? `${message} (suivi impossible)` : message}`);
        continue;
      }

      const safeFirstName = escapeHtml(emp?.first_name ?? "");
      const html = `
        <div style="font-family:Arial,sans-serif;color:#0f172a;max-width:560px;margin:auto">
          <h2 style="color:#0f766e">Bulletin de paie — ${safePeriodLabel}</h2>
          <p>Bonjour ${safeFirstName},</p>
          <p>Votre bulletin de paie de simulation pour <strong>${safePeriodLabel}</strong> est disponible.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:6px 0;color:#64748b">Salaire brut</td><td style="text-align:right">${escapeHtml(fmtXof(line.gross))}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b">Retenues (${deductionsLabel})</td><td style="text-align:right">${escapeHtml(fmtXof(Number(line.cnps_employee) + Number(line.cmu_employee) + Number(line.its)))}</td></tr>
            <tr><td style="padding:10px 0;font-weight:700;border-top:1px solid #e2e8f0">Net à payer</td><td style="text-align:right;font-weight:700;border-top:1px solid #e2e8f0;color:#0f766e">${escapeHtml(fmtXof(line.net))}</td></tr>
          </table>
          <p>Connectez-vous à votre espace pour consulter et télécharger le détail complet en PDF.</p>
          <p style="color:#94a3b8;font-size:12px">Document de simulation émis par ${escapeHtml(orgName)}. À faire valider par un expert local.</p>
        </div>`;

      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: `${displayOrgName} <${fromEmail}>`,
            to: [to],
            subject: `Votre bulletin de paie — ${periodLabel}`,
            html,
          }),
        });
        if (!res.ok) {
          const responseBody = await res.text();
          const message = `Envoi refusé (${res.status})`;
          const { error: trackingError } = await admin.from("payroll_lines")
            .update({ email_error: message })
            .eq("id", line.id)
            .eq("org_id", period.org_id);
          failures.push(`${String(emp?.last_name ?? to)}: ${message}${trackingError ? " (suivi impossible)" : ` — ${responseBody.slice(0, 120)}`}`);
          continue;
        }
        const { error: trackingError } = await admin.from("payroll_lines")
          .update({ emailed_at: new Date().toISOString(), email_error: null })
          .eq("id", line.id)
          .eq("org_id", period.org_id);
        if (trackingError) {
          failures.push(`${String(emp?.last_name ?? to)}: e-mail envoyé mais suivi impossible`);
          continue;
        }
        sent++;
      } catch (e) {
        const message = e instanceof Error ? e.message : "erreur réseau";
        const { error: trackingError } = await admin.from("payroll_lines")
          .update({ email_error: message })
          .eq("id", line.id)
          .eq("org_id", period.org_id);
        failures.push(`${String(emp?.last_name ?? to)}: ${message}${trackingError ? " (suivi impossible)" : ""}`);
      }
    }

    const { error: auditError } = await admin.from("audit_log").insert({
      org_id: period.org_id,
      actor: userData.user.id,
      action: "email_payslips",
      entity: "payroll_periods",
      entity_id: periodId,
      details: {
        periode: periodLabel,
        envoyes: sent,
        sans_email: skipped,
        deja_envoyes: alreadySent,
        echecs: failures.length,
        renvoi_force: forceResend,
      },
    });
    if (auditError) {
      return json({ sent, skipped, already_sent: alreadySent, failures, error: "Envoi terminé mais journalisation impossible." }, 500);
    }

    return json({ sent, skipped, already_sent: alreadySent, failures });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erreur inattendue." }, 500);
  }
});
