import { useEffect, useState } from 'react';
import { Target } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { EmptyState, ErrorBanner, useAsyncAction } from '../../components/ui';
import { FormModal } from '../../components/FormModal';
import { ScoreBreakdown } from '../../components/performance/ScoreBreakdown';
import { BadgeList } from '../../components/performance/RecognitionBadges';
import {
  OBJECTIVE_STATUS_COLORS, PERK_STATUS_COLORS, formatQuantity, objectiveAttainment, objectiveStatusLabel,
  perkKindLabel, perkStatusLabel,
} from '../../lib/performance';
import { formatXof, statusLabel, STATUS_COLORS } from '../../lib/types';
import type { EmployeeObjective, PerformanceScoreLine } from '../../lib/types';
import type { PerformanceData } from './usePerformanceData';

/** Vue « Moi » : mes objectifs, mon score et son détail, mes badges. Le serveur ne renvoie que mes lignes. */
export function MyPerformance({ data, employeeId }: { data: PerformanceData; employeeId: string | null }) {
  const { cycle, objectives, scores, recognitions, perks, bonuses, reload } = data;
  const { busy, error, setError, run } = useAsyncAction();
  const [lines, setLines] = useState<PerformanceScoreLine[]>([]);
  const [reporting, setReporting] = useState<EmployeeObjective | null>(null);

  const mine = objectives.filter((o) => o.employee_id === employeeId);
  const score = scores.find((s) => s.employee_id === employeeId) ?? null;
  const myBadges = recognitions.filter((r) => r.employee_id === employeeId && r.status === 'confirmed');
  const scoreId = score?.id ?? null;
  const computedAt = score?.computed_at ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!scoreId) { setLines([]); return; }
    void supabase.from('performance_score_lines').select('*').eq('score_id', scoreId).order('position')
      .then(({ data: rows }) => { if (!cancelled) setLines((rows ?? []) as PerformanceScoreLine[]); });
    return () => { cancelled = true; };
  }, [scoreId, computedAt]);

  if (!employeeId) {
    return (
      <div className="rounded-2xl bg-white ring-1 ring-slate-200">
        <EmptyState title="Aucune fiche salarié rattachée à votre compte"
          description="Rattachez votre fiche depuis l’accueil pour voir vos objectifs et votre score." />
      </div>
    );
  }
  if (!cycle) {
    return (
      <div className="rounded-2xl bg-white ring-1 ring-slate-200">
        <EmptyState icon={<Target className="w-6 h-6" />} title="Pas de cycle de performance ouvert"
          description="Votre responsable fixera vos objectifs à l’ouverture du prochain cycle." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} />
      {myBadges.length > 0 && (
        <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Mes badges</h3>
          <BadgeList items={myBadges} />
        </section>
      )}

      <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">Mes objectifs — {cycle.label}</h3>
        {mine.length === 0 ? (
          <p className="text-sm text-slate-500">Votre responsable n’a pas encore publié d’objectif pour ce cycle.</p>
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
            {mine.map((o) => {
              const attain = objectiveAttainment(o.direction, o.target, o.achieved);
              const canReport = cycle.status !== 'closed' && (o.status === 'active' || o.status === 'self_reported');
              return (
                <div key={o.id} className="p-3 flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-900">{o.title}</div>
                    <div className="text-xs text-slate-500">
                      {o.indicator} — cible {formatQuantity(o.target)} {o.unit ?? ''} ({o.direction === 'lower' ? 'plus bas = mieux' : 'plus haut = mieux'}) · poids {o.weight_pct} %
                    </div>
                    {o.achieved !== null && (
                      <div className="text-xs text-slate-600 mt-0.5">
                        Votre résultat : {formatQuantity(o.achieved)} {o.unit ?? ''}{attain !== null ? ` (${formatQuantity(attain)} %)` : ''}
                      </div>
                    )}
                    {o.manager_note && <div className="text-xs text-slate-500 mt-0.5">Responsable : « {o.manager_note} »</div>}
                  </div>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${OBJECTIVE_STATUS_COLORS[o.status]}`}>{objectiveStatusLabel(o.status)}</span>
                  {canReport && (
                    <button onClick={() => { setError(null); setReporting(o); }} className="text-xs font-semibold text-teal-700 hover:underline whitespace-nowrap">
                      {o.status === 'self_reported' ? 'Corriger mon résultat' : 'Déclarer mon résultat'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-xs text-slate-500">Un objectif déclaré compte dans le score une fois confirmé par votre responsable. Avant cela, il est « non évalué », pas un zéro.</p>
      </section>

      <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">Mon score</h3>
        {score ? <ScoreBreakdown score={score} lines={lines} /> : (
          <p className="text-sm text-slate-500">Votre score sera calculé par votre responsable. Vous verrez alors chaque ligne qui le compose.</p>
        )}
      </section>

      {(perks.length > 0 || bonuses.length > 0) && (
        <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Mes récompenses</h3>
          <ul className="space-y-2 text-sm">
            {bonuses.filter((b) => b.employee_id === employeeId).map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-900">Prime de performance · {formatXof(b.amount)}</span>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${STATUS_COLORS[b.status] ?? STATUS_COLORS.draft}`}>{statusLabel(b.status)}</span>
              </li>
            ))}
            {perks.filter((p) => p.employee_id === employeeId).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-900">
                  {perkKindLabel(p.kind)} · {p.kind === 'bonus_leave' ? `${formatQuantity(p.amount)} jour(s)` : formatXof(p.amount)}
                </span>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${PERK_STATUS_COLORS[p.status]}`}>{perkStatusLabel(p.status)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {reporting && (
        <FormModal
          title="Déclarer mon résultat"
          subtitle={`${reporting.title} — cible ${formatQuantity(reporting.target)} ${reporting.unit ?? ''}`}
          submitLabel="Envoyer à mon responsable"
          busy={busy}
          error={error}
          onClose={() => setReporting(null)}
          fields={[
            {
              name: 'achieved', label: `Valeur atteinte (${reporting.unit || 'unité de l’objectif'})`, type: 'number', required: true, min: 0, step: 'any',
              defaultValue: reporting.achieved === null ? '' : String(reporting.achieved),
            },
            { name: 'note', label: 'Commentaire (optionnel)', type: 'textarea', defaultValue: reporting.employee_note ?? '' },
          ]}
          onSubmit={(v) => {
            void run(async () => {
              const { error: err } = await supabase.rpc('report_objective_progress', {
                p_id: reporting.id, p_achieved: Number(v.achieved), p_note: v.note || null,
              });
              if (err) throw new Error(err.message);
              setReporting(null);
              await reload();
            }).catch(() => {});
          }}
        />
      )}
    </div>
  );
}
