import { Badge } from '../ui';
import { LEVEL_COLORS, formatScore, levelLabel } from '../../lib/performance';
import type { PerformanceScore, PerformanceScoreLine } from '../../lib/types';

/** Le score, ligne par ligne : la somme des points est le score final (garde-fou n° 2). */
export function ScoreBreakdown({ score, lines }: { score: PerformanceScore; lines: PerformanceScoreLine[] }) {
  const objectives = lines.filter((l) => l.source === 'objective');
  const kpis = lines.filter((l) => l.source === 'kpi');
  const total = lines.reduce((sum, l) => sum + Number(l.points), 0);

  const renderRows = (rows: PerformanceScoreLine[]) => rows.map((l) => (
    <tr key={l.id} className={l.evaluated ? '' : 'bg-slate-50/60 text-slate-500'}>
      <td className="px-3 py-2.5 align-top">
        <div className={`font-medium ${l.evaluated ? 'text-slate-900' : 'text-slate-600'}`}>{l.label}</div>
        {l.detail && <div className="text-xs text-slate-500 mt-0.5">{l.detail}</div>}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums align-top">{l.evaluated && l.value !== null ? `${formatScore(l.value)} %` : '—'}</td>
      <td className="px-3 py-2.5 text-right tabular-nums align-top">{l.evaluated && Number(l.weight_pct) > 0 ? `${formatScore(l.weight_pct)} %` : '—'}</td>
      <td className="px-3 py-2.5 text-right tabular-nums font-medium align-top">{l.evaluated && Number(l.weight_pct) > 0 ? formatScore(l.points) : '—'}</td>
    </tr>
  ));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-3xl font-bold text-slate-900 tabular-nums">
          {formatScore(score.score_final)}<span className="text-base font-medium text-slate-400"> / 100</span>
        </div>
        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ${LEVEL_COLORS[score.level]}`}>{levelLabel(score.level)}</span>
        {score.department_rank !== null && score.department_size ? (
          <Badge tone="slate">Rang {score.department_rank} sur {score.department_size} dans le service</Badge>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <div className="text-xs text-slate-500">Objectifs validés</div>
          <div className="font-semibold text-slate-900">
            {score.score_objectives === null ? 'Non évalué' : `${formatScore(score.score_objectives)} / 100`}
          </div>
          <div className="text-xs text-slate-400">{score.objectives_evaluated} validé(s) sur {score.objectives_total}</div>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <div className="text-xs text-slate-500">Indicateurs automatiques</div>
          <div className="font-semibold text-slate-900">
            {score.score_kpi === null ? 'Non évalué' : `${formatScore(score.score_kpi)} / 100`}
          </div>
          <div className="text-xs text-slate-400">Pointages, feuilles de temps, congés</div>
        </div>
      </div>
      <div className="rounded-xl ring-1 ring-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
              <th className="px-3 py-2 font-semibold">Ligne</th>
              <th className="px-3 py-2 font-semibold text-right">Résultat</th>
              <th className="px-3 py-2 font-semibold text-right">Poids dans le score</th>
              <th className="px-3 py-2 font-semibold text-right">Points</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {objectives.length > 0 && (
              <tr><td colSpan={4} className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Objectifs fixés par le responsable</td></tr>
            )}
            {renderRows(objectives)}
            <tr><td colSpan={4} className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Indicateurs lus dans l’application</td></tr>
            {renderRows(kpis)}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50">
              <td className="px-3 py-2.5 font-semibold text-slate-900" colSpan={3}>Score final</td>
              <td className="px-3 py-2.5 text-right font-bold tabular-nums text-slate-900">{formatScore(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Une ligne « non évaluée » ne compte ni en bien ni en mal : elle n’est pas un zéro caché. Ce score ouvre un échange avec le responsable ; il ne modifie pas le salaire.
      </p>
    </div>
  );
}
