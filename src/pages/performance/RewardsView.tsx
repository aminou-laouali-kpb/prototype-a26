import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { EmptyState, ErrorBanner, useAsyncAction } from '../../components/ui';
import { FormModal } from '../../components/FormModal';
import { BadgeChip } from '../../components/performance/RecognitionBadges';
import {
  BADGES, PERK_STATUS_COLORS, badgeLabel, formatQuantity, perkKindLabel, perkStatusLabel,
} from '../../lib/performance';
import { formatXof, statusLabel, STATUS_COLORS } from '../../lib/types';
import type { PerkRow, PerformanceData } from './usePerformanceData';

interface Props {
  data: PerformanceData;
  canManage: boolean;
  canDecide: boolean;
  ownEmployeeId: string | null;
}

export function RewardsView({ data, canManage, canDecide, ownEmployeeId }: Props) {
  const { cycle, employees, recognitions, perks, bonuses, reload } = data;
  const { busy, error, setError, run } = useAsyncAction();
  const [awarding, setAwarding] = useState(false);
  const [consuming, setConsuming] = useState<PerkRow | null>(null);

  const name = (e: { last_name: string; first_name: string } | null) => (e ? `${e.last_name} ${e.first_name}` : '—');
  const proposed = recognitions.filter((r) => r.status === 'proposed');
  const confirmed = recognitions.filter((r) => r.status === 'confirmed');

  const call = (fn: () => PromiseLike<{ error: { message: string } | null }>, after?: () => void) =>
    run(async () => {
      const { error: err } = await fn();
      if (err) throw new Error(err.message);
      after?.();
      await reload();
    }).catch(() => {});

  if (!cycle) {
    return (
      <div className="rounded-2xl bg-white ring-1 ring-slate-200">
        <EmptyState title="Aucun cycle de performance" description="Les récompenses se rattachent à un cycle." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} />

      <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Mur d’équipe — {cycle.label}</h3>
            <p className="text-xs text-slate-500 mt-0.5">Des badges, pas un classement : la liste ordonnée de l’équipe ne sort pas de cet écran.</p>
          </div>
          {canManage && cycle.status !== 'closed' && (
            <button onClick={() => { setError(null); setAwarding(true); }}
              className="rounded-lg bg-teal-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-700 inline-flex items-center gap-2">
              <Plus className="w-4 h-4" /> Attribuer un badge
            </button>
          )}
        </div>
        {confirmed.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun badge attribué pour ce cycle.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {BADGES.map((b) => {
              const who = confirmed.filter((r) => r.badge === b.id);
              if (who.length === 0) return null;
              return (
                <div key={b.id} className="rounded-xl ring-1 ring-slate-200 p-3 space-y-2">
                  <BadgeChip badge={b.id} />
                  <ul className="text-sm text-slate-700 space-y-0.5">
                    {who.map((r) => <li key={r.id} title={r.note ?? undefined}>{name(r.employee)}</li>)}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {canManage && proposed.length > 0 && (
        <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Badges proposés par le calcul</h3>
          <p className="text-xs text-slate-500">Rien n’est attribué tout seul : confirmez ceux qui sont mérités. La confirmation prévient le salarié par WhatsApp quand l’envoi est branché.</p>
          <ul className="divide-y divide-slate-100">
            {proposed.map((r) => (
              <li key={r.id} className="py-2.5 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-slate-900">{name(r.employee)}</span>
                  <span className="text-slate-500"> — {badgeLabel(r.badge)}</span>
                  {r.note && <div className="text-xs text-slate-400">{r.note}</div>}
                </div>
                {r.employee_id !== ownEmployeeId && (
                  <button disabled={busy} onClick={() => { void call(() => supabase.rpc('award_recognition', { p_cycle: cycle.id, p_employee: r.employee_id, p_badge: r.badge, p_note: r.note })); }}
                    className="text-xs font-semibold text-teal-700 hover:underline">Confirmer</button>
                )}
                <button disabled={busy} onClick={() => { void call(() => supabase.rpc('dismiss_recognition', { p_id: r.id })); }}
                  className="text-xs font-medium text-slate-500 hover:underline">Écarter</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">Primes de performance</h3>
        {bonuses.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune prime proposée. Elle se propose depuis le détail d’un salarié au niveau « excellent », cycle en revue.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {bonuses.map((b) => (
              <li key={b.id} className="py-2.5 flex flex-wrap items-center gap-3">
                <span className="font-medium text-slate-900">{name(b.employee)}</span>
                <span className="text-slate-600">{formatXof(b.amount)}</span>
                <span className="text-xs text-slate-400">{b.reason}</span>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${STATUS_COLORS[b.status] ?? STATUS_COLORS.draft}`}>{statusLabel(b.status)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-slate-500">
          La validation, le rattachement à un cycle de paie et le versement se font dans le menu <Link to="/primes" className="text-teal-700 font-medium hover:underline">Primes</Link>, comme toute prime.
        </p>
      </section>

      <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">Avantages</h3>
        {perks.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun avantage proposé pour ce cycle.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-4 font-semibold">Salarié</th>
                  <th className="py-2 pr-4 font-semibold">Avantage</th>
                  <th className="py-2 pr-4 font-semibold">Consommé</th>
                  <th className="py-2 pr-4 font-semibold">Statut</th>
                  <th className="py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {perks.map((p) => {
                  const isLeave = p.kind === 'bonus_leave';
                  const fmt = (n: number) => (isLeave ? `${formatQuantity(n)} j` : formatXof(n));
                  return (
                    <tr key={p.id}>
                      <td className="py-2.5 pr-4 font-medium text-slate-900">{name(p.employee)}</td>
                      <td className="py-2.5 pr-4 text-slate-700">{perkKindLabel(p.kind)} · {fmt(p.amount)}</td>
                      <td className="py-2.5 pr-4 text-slate-600">{fmt(p.consumed_amount)}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${PERK_STATUS_COLORS[p.status]}`}>{perkStatusLabel(p.status)}</span>
                      </td>
                      <td className="py-2.5 text-right whitespace-nowrap space-x-3">
                        {canDecide && p.status === 'proposed' && (
                          <button disabled={busy} onClick={() => { void call(() => supabase.rpc('decide_perk', { p_perk: p.id, p_decision: 'approve' })); }} className="text-xs font-semibold text-teal-700 hover:underline">Valider</button>
                        )}
                        {canDecide && p.status === 'approved' && (
                          <button disabled={busy} onClick={() => { setError(null); setConsuming(p); }} className="text-xs font-semibold text-teal-700 hover:underline">Enregistrer une consommation</button>
                        )}
                        {canDecide && (p.status === 'proposed' || (p.status === 'approved' && p.consumed_amount === 0)) && (
                          <button disabled={busy} onClick={() => { void call(() => supabase.rpc('decide_perk', { p_perk: p.id, p_decision: 'cancel' })); }} className="text-xs font-medium text-rose-600 hover:underline">Annuler</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-slate-500">
          Les jours bonus créditent le type de congé « BON » (payé, comme le congé annuel) ; le salarié les pose depuis Congés. Le budget formation est suivi ici : le montant consommé est saisi par le RH, il n’y a pas de second bulletin.
        </p>
      </section>

      {awarding && (
        <FormModal
          title="Attribuer un badge"
          subtitle="Le salarié le voit sur son accueil ; un message WhatsApp part quand l’envoi est branché."
          submitLabel="Attribuer"
          busy={busy}
          error={error}
          onClose={() => setAwarding(false)}
          fields={[
            {
              name: 'employee', label: 'Salarié', type: 'select', required: true,
              options: employees.filter((e) => e.id !== ownEmployeeId).map((e) => ({ value: e.id, label: `${e.last_name} ${e.first_name} · ${e.employee_number}` })),
            },
            { name: 'badge', label: 'Badge', type: 'select', options: BADGES.map((b) => ({ value: b.id, label: `${b.label} — ${b.hint}` })), defaultValue: 'esprit_equipe' },
            { name: 'note', label: 'Motif (optionnel)' },
          ]}
          onSubmit={(v) => {
            void call(() => supabase.rpc('award_recognition', { p_cycle: cycle.id, p_employee: v.employee, p_badge: v.badge, p_note: v.note || null }), () => setAwarding(false));
          }}
        />
      )}

      {consuming && (
        <FormModal
          title="Enregistrer une consommation"
          subtitle={`${perkKindLabel(consuming.kind)} — reste ${consuming.kind === 'bonus_leave' ? `${formatQuantity(consuming.amount - consuming.consumed_amount)} jour(s)` : formatXof(consuming.amount - consuming.consumed_amount)}`}
          submitLabel="Enregistrer"
          busy={busy}
          error={error}
          onClose={() => setConsuming(null)}
          fields={[
            { name: 'amount', label: consuming.kind === 'bonus_leave' ? 'Jours consommés' : 'Montant consommé (FCFA)', type: 'number', required: true, min: 0.5, step: 0.5 },
            { name: 'note', label: 'Référence (facture, organisme, dates)', type: 'textarea' },
          ]}
          onSubmit={(v) => {
            void call(() => supabase.rpc('consume_perk', { p_perk: consuming.id, p_amount: Number(v.amount), p_note: v.note || null }), () => setConsuming(null));
          }}
        />
      )}
    </div>
  );
}
