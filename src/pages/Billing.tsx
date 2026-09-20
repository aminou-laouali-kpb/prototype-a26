import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session';
import { OrgSubscription, formatDate } from '../lib/types';
import {
  PLAN_CATALOG, daysLeftInTrial, formatPlanPrice, planLabel, subscriptionStatusLabel,
} from '../lib/billing';
import { ErrorBanner, Spinner } from '../components/ui';
import { CreditCard, Sparkles } from 'lucide-react';

export function BillingPage() {
  const { activeOrg, activeRole, session, refresh } = useSession();
  const [sub, setSub] = useState<OrgSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canManage = activeRole === 'admin_rh' || activeRole === 'cabinet';

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('org_subscriptions')
      .select('*')
      .eq('org_id', activeOrg.id)
      .maybeSingle();
    if (err) {
      setError(err.message.includes('schema cache') || err.code === 'PGRST205'
        ? 'Abonnements indisponibles tant que la migration 011 n’est pas appliquée.'
        : err.message);
      setSub(null);
    } else {
      setSub((data as OrgSubscription) ?? null);
    }
    setLoading(false);
  }, [activeOrg]);

  useEffect(() => { load(); }, [load]);

  const ensureTrial = async () => {
    if (!activeOrg || !canManage) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from('org_subscriptions').upsert({
      org_id: activeOrg.id,
      plan: 'trial',
      status: 'trialing',
      trial_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      seats: 25,
      amount_xof: 0,
      updated_at: new Date().toISOString(),
    });
    if (err) setError(err.message);
    else {
      await supabase.from('audit_log').insert({
        org_id: activeOrg.id,
        actor: session?.user.id ?? null,
        action: 'start_trial',
        entity: 'org_subscriptions',
        entity_id: activeOrg.id,
      });
      await load();
      await refresh();
    }
    setBusy(false);
  };

  const choosePlan = async (planId: typeof PLAN_CATALOG[number]['id']) => {
    if (!activeOrg || !canManage) return;
    const plan = PLAN_CATALOG.find((p) => p.id === planId);
    if (!plan) return;
    setBusy(true);
    setError(null);
    const payload = {
      org_id: activeOrg.id,
      plan: planId,
      status: planId === 'trial' ? 'trialing' as const : 'active' as const,
      trial_ends_at: planId === 'trial'
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        : sub?.trial_ends_at ?? null,
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      seats: plan.seats,
      amount_xof: plan.priceXof,
      notes: 'Facturation XOF — paiement Mobile Money / virement (simulation commerciale).',
      updated_at: new Date().toISOString(),
    };
    const { error: err } = await supabase.from('org_subscriptions').upsert(payload);
    if (err) setError(err.message);
    else {
      await supabase.from('audit_log').insert({
        org_id: activeOrg.id,
        actor: session?.user.id ?? null,
        action: 'select_plan',
        entity: 'org_subscriptions',
        entity_id: activeOrg.id,
        details: { plan: planId, amount_xof: plan.priceXof },
      });
      await load();
    }
    setBusy(false);
  };

  if (!activeOrg) return null;

  const left = daysLeftInTrial(sub);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Abonnement</h1>
        <p className="text-sm text-slate-500 mt-1">Essai 30 jours, plans PME / Groupe / Cabinet, facturation en FCFA.</p>
      </div>

      <ErrorBanner message={error} />

      {loading ? (
        <Spinner label="Chargement de l’abonnement…" />
      ) : (
        <>
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold text-slate-900">
                  {sub ? planLabel(sub.plan) : 'Aucun abonnement'}
                </div>
                <div className="text-sm text-slate-500 mt-1">
                  {sub
                    ? `${subscriptionStatusLabel(sub.status)} · ${sub.seats} sièges · ${formatPlanPrice(Number(sub.amount_xof))}`
                    : 'Démarrez un essai gratuit pour débloquer la pré-paie en production.'}
                </div>
                {sub?.trial_ends_at && (
                  <div className="text-sm text-amber-700 mt-2">
                    Essai jusqu’au {formatDate(sub.trial_ends_at)}
                    {left != null ? ` (${left} j restants)` : ''}
                  </div>
                )}
                {!sub && canManage && (
                  <button
                    disabled={busy}
                    onClick={ensureTrial}
                    className="mt-3 rounded-lg bg-teal-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-700 inline-flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" /> Démarrer l’essai 30 jours
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
            {PLAN_CATALOG.map((plan) => (
              <div key={plan.id} className={`rounded-2xl ring-1 p-5 ${sub?.plan === plan.id ? 'bg-teal-50 ring-teal-200' : 'bg-white ring-slate-200'}`}>
                <div className="font-semibold text-slate-900">{plan.name}</div>
                <div className="text-2xl font-bold text-teal-700 mt-2">{formatPlanPrice(plan.priceXof)}</div>
                <div className="text-xs text-slate-500 mt-1">{plan.seats} salariés max.</div>
                <p className="text-sm text-slate-600 mt-3">{plan.blurb}</p>
                {canManage && (
                  <button
                    disabled={busy || sub?.plan === plan.id}
                    onClick={() => choosePlan(plan.id)}
                    className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {sub?.plan === plan.id ? 'Plan actuel' : 'Choisir'}
                  </button>
                )}
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-500">
            Paiement commercial hors plateforme pour l’instant (Mobile Money / virement XOF). Support : WhatsApp FR.
          </p>
        </>
      )}
    </div>
  );
}
