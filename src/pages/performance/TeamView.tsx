import { useEffect, useMemo, useState } from 'react';
import { Calculator, Plus, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAsyncAction, EmptyState, ErrorBanner, Modal } from '../../components/ui';
import { FormModal } from '../../components/FormModal';
import { ScoreBreakdown } from '../../components/performance/ScoreBreakdown';
import { BadgeList } from '../../components/performance/RecognitionBadges';
import {
  LEVEL_COLORS, OBJECTIVE_STATUS_COLORS, formatQuantity, formatScore, levelLabel, objectiveAttainment,
  objectiveStatusLabel, perkKindLabel, perkStatusLabel, PERK_STATUS_COLORS,
} from '../../lib/performance';
import { formatXof, statusLabel, STATUS_COLORS } from '../../lib/types';
import type { Employee, EmployeeObjective, PerformanceScoreLine } from '../../lib/types';
import type { PerformanceData, ScoreRow } from './usePerformanceData';

interface Props {
  data: PerformanceData;
  canManage: boolean;
  ownEmployeeId: string | null;
}

type ObjectiveForm = { employee: Employee; objective: EmployeeObjective | null };

export function TeamView({ data, canManage, ownEmployeeId }: Props) {
  const { cycle, employees, departments, objectives, scores, perks, bonuses, recognitions, reload } = data;
  const { busy, error, setError, run } = useAsyncAction();
  const [department, setDepartment] = useState('');
  const [query, setQuery] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const cycleOpen = cycle?.status === 'open';
  const scoreByEmployee = useMemo(() => new Map(scores.map((s) => [s.employee_id, s])), [scores]);
  const departmentName = (id: string | null) => departments.find((d) => d.id === id)?.name ?? '—';

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees
      .filter((e) => !department || e.department_id === department)
      .filter((e) => !q || `${e.last_name} ${e.first_name} ${e.employee_number}`.toLowerCase().includes(q))
      .map((e) => ({ employee: e, score: scoreByEmployee.get(e.id) ?? null }));
  }, [employees, department, query, scoreByEmployee]);

  const compute = () => {
    if (!cycle) return;
    setNotice(null);
    void run(async () => {
      const { data: count, error: err } = await supabase.rpc('compute_performance_scores', { p_cycle: cycle.id });
      if (err) throw new Error(err.message);
      setNotice(`${count} score(s) calculé(s).`);
      await reload();
    }).catch(() => {});
  };

  if (!cycle) {
    return (
      <div className="rounded-2xl bg-white ring-1 ring-slate-200">
        <EmptyState title="Aucun cycle de performance"
          description="L’administrateur RH ouvre un premier cycle depuis l’onglet « Cycles et réglages »." />
      </div>
    );
  }

  const detail = detailId ? employees.find((e) => e.id === detailId) ?? null : null;

  return (
    <div className="space-y-4">
      <ErrorBanner message={error} />
      {notice && <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-3">{notice}</div>}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            className="rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="Rechercher un salarié"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          aria-label="Filtrer par service"
        >
          <option value="">Tous les services</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {canManage && cycle.status !== 'closed' && (
          <button
            onClick={compute}
            disabled={busy}
            className="ml-auto rounded-lg bg-teal-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 inline-flex items-center gap-2"
          >
            <Calculator className="w-4 h-4" /> Calculer les scores
          </button>
        )}
      </div>

      <div className="rounded-2xl bg-white ring-1 ring-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 font-semibold">Salarié</th>
                <th className="px-4 py-3 font-semibold hidden md:table-cell">Service</th>
                <th className="px-4 py-3 font-semibold">Objectifs</th>
                <th className="px-4 py-3 font-semibold">Score</th>
                <th className="px-4 py-3 font-semibold">Niveau</th>
                <th className="px-4 py-3 font-semibold hidden md:table-cell">Rang du service</th>
                <th className="px-4 py-3"><span className="sr-only">Détail</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ employee: e, score }) => {
                const mine = objectives.filter((o) => o.employee_id === e.id);
                const validated = mine.filter((o) => o.status === 'validated').length;
                return (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{e.last_name} {e.first_name}</div>
                      <div className="text-xs text-slate-400">{e.employee_number}{e.job_title ? ` · ${e.job_title}` : ''}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{departmentName(e.department_id)}</td>
                    <td className="px-4 py-3 text-slate-600">{mine.length === 0 ? '—' : `${validated} / ${mine.length} validé(s)`}</td>
                    <td className="px-4 py-3 font-semibold tabular-nums text-slate-900">{score ? formatScore(score.score_final) : '—'}</td>
                    <td className="px-4 py-3">
                      {score ? (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${LEVEL_COLORS[score.level]}`}>{levelLabel(score.level)}</span>
                      ) : <span className="text-xs text-slate-400">Pas calculé</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 hidden md:table-cell">
                      {score?.department_rank ? `${score.department_rank} / ${score.department_size}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => { setError(null); setDetailId(e.id); }} className="text-xs font-medium text-teal-700 hover:underline">Détail</button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">Aucun salarié ne correspond.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <EmployeeDetail
          employee={detail}
          data={data}
          score={scoreByEmployee.get(detail.id) ?? null}
          canManage={canManage}
          isOwn={ownEmployeeId === detail.id}
          cycleOpen={!!cycleOpen}
          badges={recognitions.filter((r) => r.employee_id === detail.id && r.status === 'confirmed')}
          perks={perks.filter((p) => p.employee_id === detail.id)}
          bonuses={bonuses.filter((b) => b.employee_id === detail.id)}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}

function EmployeeDetail({
  employee, data, score, canManage, isOwn, cycleOpen, badges, perks, bonuses, onClose,
}: {
  employee: Employee;
  data: PerformanceData;
  score: ScoreRow | null;
  canManage: boolean;
  isOwn: boolean;
  cycleOpen: boolean;
  badges: PerformanceData['recognitions'];
  perks: PerformanceData['perks'];
  bonuses: PerformanceData['bonuses'];
  onClose: () => void;
}) {
  const { cycle, objectives, reload } = data;
  const { busy, error, setError, run } = useAsyncAction();
  const [lines, setLines] = useState<PerformanceScoreLine[]>([]);
  const [form, setForm] = useState<ObjectiveForm | null>(null);
  const [validating, setValidating] = useState<EmployeeObjective | null>(null);
  const [proposing, setProposing] = useState<'bonus' | 'perk' | null>(null);
  const mine = objectives.filter((o) => o.employee_id === employee.id);
  const weightUsed = mine.reduce((sum, o) => sum + o.weight_pct, 0);
  const scoreId = score?.id ?? null;
  const computedAt = score?.computed_at ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!scoreId) { setLines([]); return; }
    void supabase.from('performance_score_lines').select('*').eq('score_id', scoreId).order('position')
      .then(({ data: rows }) => { if (!cancelled) setLines((rows ?? []) as PerformanceScoreLine[]); });
    return () => { cancelled = true; };
  }, [scoreId, computedAt]);

  const call = (fn: () => PromiseLike<{ error: { message: string } | null }>, after?: () => void) =>
    run(async () => {
      const { error: err } = await fn();
      if (err) throw new Error(err.message);
      after?.();
      await reload();
    }).catch(() => {});

  if (!cycle) return null;
  const canPropose = canManage && !isOwn && score?.level === 'excellent' && cycle.status !== 'open';

  return (
    <Modal open onClose={onClose} wide title={`${employee.last_name} ${employee.first_name}`}
      subtitle={`${cycle.label} · ${employee.employee_number}${employee.job_title ? ` · ${employee.job_title}` : ''}`}>
      <div className="space-y-6">
        <ErrorBanner message={error} />

        {badges.length > 0 && <BadgeList items={badges} />}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-900">Objectifs</h4>
            {canManage && cycleOpen && (
              <button onClick={() => { setError(null); setForm({ employee, objective: null }); }}
                className="text-xs font-semibold text-teal-700 hover:underline inline-flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Ajouter un objectif
              </button>
            )}
          </div>
          {mine.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun objectif fixé pour ce cycle. Sans objectif validé, le score repose sur les indicateurs automatiques seuls.</p>
          ) : (
            <div className="rounded-xl ring-1 ring-slate-200 divide-y divide-slate-100">
              {mine.map((o) => {
                const attain = objectiveAttainment(o.direction, o.target, o.achieved);
                return (
                  <div key={o.id} className="p-3 flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-900">{o.title}</div>
                      <div className="text-xs text-slate-500">
                        {o.indicator} — cible {formatQuantity(o.target)} {o.unit ?? ''} ({o.direction === 'lower' ? 'plus bas = mieux' : 'plus haut = mieux'}) · poids {o.weight_pct} %
                      </div>
                      {o.achieved !== null && (
                        <div className="text-xs text-slate-600 mt-0.5">
                          Atteint : {formatQuantity(o.achieved)} {o.unit ?? ''}{attain !== null ? ` (${formatQuantity(attain)} %)` : ''}
                        </div>
                      )}
                      {o.employee_note && <div className="text-xs text-slate-500 mt-0.5">Salarié : « {o.employee_note} »</div>}
                      {o.manager_note && <div className="text-xs text-slate-500 mt-0.5">Responsable : « {o.manager_note} »</div>}
                    </div>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${OBJECTIVE_STATUS_COLORS[o.status]}`}>{objectiveStatusLabel(o.status)}</span>
                    {canManage && (
                      <div className="flex gap-3 text-xs font-medium whitespace-nowrap">
                        {cycle.status !== 'closed' && (o.status === 'active' || o.status === 'self_reported') && !isOwn && (
                          <button disabled={busy} onClick={() => { setError(null); setValidating(o); }} className="text-teal-700 hover:underline">Valider</button>
                        )}
                        {cycleOpen && (o.status === 'draft' || o.status === 'active') && (
                          <>
                            <button disabled={busy} onClick={() => { setError(null); setForm({ employee, objective: o }); }} className="text-slate-600 hover:underline">Modifier</button>
                            <button disabled={busy} onClick={() => { void call(() => supabase.rpc('delete_objective', { p_id: o.id })); }} className="text-rose-600 hover:underline">Retirer</button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {mine.length > 0 && <p className="text-xs text-slate-400">Poids attribués : {weightUsed} % sur 100.</p>}
        </section>

        <section className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-900">Score</h4>
          {score ? (
            <ScoreBreakdown score={score} lines={lines} />
          ) : (
            <p className="text-sm text-slate-500">Score pas encore calculé pour ce cycle.</p>
          )}
        </section>

        {(canPropose || perks.length > 0 || bonuses.length > 0) && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900">Récompenses</h4>
              {canPropose && (
                <div className="flex gap-3 text-xs font-semibold text-teal-700">
                  <button onClick={() => { setError(null); setProposing('bonus'); }} className="hover:underline">Proposer une prime</button>
                  <button onClick={() => { setError(null); setProposing('perk'); }} className="hover:underline">Proposer un avantage</button>
                </div>
              )}
            </div>
            {score && score.level === 'excellent' && cycle.status === 'open' && canManage && (
              <p className="text-xs text-slate-500">Passez le cycle « en revue » pour proposer une récompense quand le score est stable.</p>
            )}
            <ul className="space-y-2 text-sm">
              {bonuses.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">Prime de performance · {formatXof(b.amount)}</span>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${STATUS_COLORS[b.status] ?? STATUS_COLORS.draft}`}>{statusLabel(b.status)}</span>
                  <span className="text-xs text-slate-400">Validation et versement dans le menu Primes</span>
                </li>
              ))}
              {perks.map((p) => (
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
      </div>

      {form && (
        <FormModal
          title={form.objective ? 'Modifier l’objectif' : 'Nouvel objectif'}
          subtitle={`${form.employee.last_name} ${form.employee.first_name} · poids restant ${100 - weightUsed + (form.objective?.weight_pct ?? 0)} %`}
          submitLabel="Enregistrer"
          busy={busy}
          error={error}
          onClose={() => setForm(null)}
          fields={[
            { name: 'title', label: 'Titre', required: true, defaultValue: form.objective?.title ?? '', placeholder: 'Ex. Développer les ventes de la zone' },
            { name: 'indicator', label: 'Indicateur chiffré', required: true, defaultValue: form.objective?.indicator ?? '', placeholder: 'Ex. Chiffre d’affaires mensuel' },
            { name: 'target', label: 'Cible', type: 'number', required: true, min: 0, step: 'any', defaultValue: form.objective ? String(form.objective.target) : '' },
            { name: 'unit', label: 'Unité', defaultValue: form.objective?.unit ?? '', placeholder: 'FCFA, visites, jours…' },
            {
              name: 'direction', label: 'Sens', type: 'select', defaultValue: form.objective?.direction ?? 'higher',
              options: [{ value: 'higher', label: 'Plus haut = mieux' }, { value: 'lower', label: 'Plus bas = mieux (ex. retards)' }],
            },
            { name: 'weight', label: 'Poids (%)', type: 'number', required: true, min: 1, max: 100, step: 1, defaultValue: form.objective ? String(form.objective.weight_pct) : String(Math.max(1, 100 - weightUsed)) },
            {
              name: 'publish', label: 'Publication', type: 'select', defaultValue: 'yes',
              options: [{ value: 'yes', label: 'Publier : le salarié le voit' }, { value: 'no', label: 'Garder en brouillon' }],
            },
          ]}
          onSubmit={(v) => {
            void call(() => supabase.rpc('set_objective', {
              p_id: form.objective?.id ?? null,
              p_cycle: cycle.id,
              p_employee: form.employee.id,
              p_title: v.title,
              p_indicator: v.indicator,
              p_target: Number(v.target),
              p_unit: v.unit || null,
              p_direction: v.direction,
              p_weight_pct: Number(v.weight),
              p_publish: v.publish === 'yes',
            }), () => setForm(null));
          }}
        />
      )}

      {validating && (
        <FormModal
          title="Valider le résultat"
          subtitle={`${validating.title} — cible ${formatQuantity(validating.target)} ${validating.unit ?? ''}`}
          submitLabel="Valider"
          busy={busy}
          error={error}
          onClose={() => setValidating(null)}
          fields={[
            {
              name: 'achieved', label: `Valeur atteinte (${validating.unit || 'unité de l’objectif'})`, type: 'number', required: true, min: 0, step: 'any',
              defaultValue: validating.achieved === null ? '' : String(validating.achieved),
              hint: validating.achieved === null ? 'Le salarié n’a rien déclaré : saisissez la valeur constatée.' : 'Valeur déclarée par le salarié ; corrigez-la si besoin, la correction est tracée.',
            },
            { name: 'note', label: 'Commentaire (optionnel)', type: 'textarea' },
          ]}
          onSubmit={(v) => {
            void call(() => supabase.rpc('validate_objective', {
              p_id: validating.id, p_achieved: Number(v.achieved), p_note: v.note || null,
            }), () => setValidating(null));
          }}
        />
      )}

      {proposing === 'bonus' && score && (
        <FormModal
          title="Proposer une prime de performance"
          subtitle={`Score ${formatScore(score.score_final)}/100. La prime naît en brouillon : l’administrateur RH la valide dans le menu Primes.`}
          submitLabel="Proposer"
          busy={busy}
          error={error}
          onClose={() => setProposing(null)}
          fields={[{ name: 'amount', label: 'Montant (FCFA)', type: 'number', required: true, min: 1, step: 1 }]}
          onSubmit={(v) => {
            void call(() => supabase.rpc('propose_performance_bonus', { p_score: score.id, p_amount: Number(v.amount) }), () => setProposing(null));
          }}
        />
      )}

      {proposing === 'perk' && score && (
        <FormModal
          title="Proposer un avantage"
          subtitle="L’administrateur RH valide. Les jours bonus se posent ensuite par le circuit des congés."
          submitLabel="Proposer"
          busy={busy}
          error={error}
          onClose={() => setProposing(null)}
          fields={[
            {
              name: 'kind', label: 'Avantage', type: 'select',
              options: [{ value: 'bonus_leave', label: 'Jours de congé bonus (max 10)' }, { value: 'training_budget', label: 'Budget formation (FCFA)' }],
            },
            { name: 'amount', label: 'Quantité (jours ou FCFA)', type: 'number', required: true, min: 0.5, step: 0.5 },
            { name: 'reason', label: 'Motif (optionnel)' },
          ]}
          onSubmit={(v) => {
            void call(() => supabase.rpc('propose_perk', {
              p_score: score.id, p_kind: v.kind, p_amount: Number(v.amount), p_reason: v.reason || null,
            }), () => setProposing(null));
          }}
        />
      )}
    </Modal>
  );
}
