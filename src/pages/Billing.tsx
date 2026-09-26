import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session';
import { OrgSubscription, formatDate, formatXof } from '../lib/types';
import {
  PLAN_CATALOG, daysLeftInTrial, formatPlanPrice, planLabel, quoteAnnualXof, quoteMonthlyXof,
  subscriptionStatusLabel, type PlanOffer,
} from '../lib/billing';
import { canManageBilling } from '../lib/access';
import { ErrorBanner, Spinner } from '../components/ui';
import { CreditCard, Sparkles } from 'lucide-react';

export function BillingPage() {
  const { activeOrg, activeRole, refresh } = useSession();
  const [sub, setSub] = useState<OrgSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [headcount, setHeadcount] = useState(0);
  const canManage = canManageBilling(activeRole);

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
    const { count } = await supabase
      .from('employees')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', activeOrg.id)
      .eq('status', 'active');
    setHeadcount(count ?? 0);
    setLoading(false);
  }, [activeOrg]);

  useEffect(() => { load(); }, [load]);

  const requestPlan = async (planId: PlanOffer['id']) => {
    if (!activeOrg || !canManage) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('request_subscription_plan', {
      p_org: activeOrg.id,
      p_plan: planId,
    });
    if (err) setError(err.message);
    else {
      await load();
      await refresh();
    }
    setBusy(false);
  };

  if (!activeOrg) return null;

  const left = daysLeftInTrial(sub);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Abonnement</h1>
        <p className="text-sm text-slate-500 mt-1">
          Tarifs HT au salarié, plancher mensuel, facturation en FCFA. Effectif actuel : {headcount} salarié{headcount > 1 ? 's' : ''}.
        </p>
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
                    onClick={() => requestPlan('trial')}
                    className="mt-3 rounded-lg bg-teal-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-700 inline-flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" /> Démarrer l’essai 30 jours
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
            {PLAN_CATALOG.map((plan) => {
              const monthly = quoteMonthlyXof(plan, headcount);
              const annual = quoteAnnualXof(plan, headcount);
              return (
              <div key={plan.id} className={`rounded-2xl ring-1 p-5 ${sub?.plan === plan.id ? 'bg-teal-50 ring-teal-200' : 'bg-white ring-slate-200'}`}>
                <div className="font-semibold text-slate-900">{plan.name}</div>
                <div className="text-2xl font-bold text-teal-700 mt-2">{formatPlanPrice(monthly)}</div>
                {plan.unitXof > 0 ? (
                  <div className="text-xs text-slate-500 mt-1 space-y-0.5">
                    <div>{formatXof(plan.unitXof)} HT / salarié · plancher {formatXof(plan.floorXof)}</div>
                    <div>Jusqu’à {plan.seats} salariés · annuel {formatXof(annual)} (10 mois)</div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 mt-1">{plan.seats} salariés max.</div>
                )}
                <p className="text-sm text-slate-600 mt-3">{plan.blurb}</p>
                {canManage && (plan.id !== 'trial' || !sub) && (
                  <button
                    disabled={busy || sub?.plan === plan.id}
                    onClick={() => requestPlan(plan.id)}
                    className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {sub?.plan === plan.id ? 'Plan actuel' : 'Choisir'}
                  </button>
                )}
              </div>
              );
            })}
          </div>

          <p className="text-xs text-slate-500">
            Prix HT. TVA en sus selon le pays (18 % CI, 19 % NE). Le montant affiché suit l’effectif actif,
            avec un plancher : on ne vend plus un forfait 50 sièges au prix d’une TPE.
            Annuel = 10 mois. Un plan payant reste « en attente de paiement » jusqu’à encaissement
            (Mobile Money / virement) — le portail ne l’active plus tout seul.
          </p>
        </>
      )}
    </div>
  );
}
