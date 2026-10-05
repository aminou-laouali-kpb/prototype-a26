import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { LEVEL_COLORS, formatScore, levelLabel } from '../../lib/performance';
import type { EmployeeRecognition, PerformanceLevel } from '../../lib/types';
import { BadgeList } from './RecognitionBadges';

interface LatestScore {
  score_final: number | null;
  level: PerformanceLevel;
  cycle: { label: string } | { label: string }[] | null;
}

/** Accueil salarié : dernier score, badges reçus, objectifs à déclarer. Absent tant que le module n’est pas migré. */
export function PerformanceHomeCard({ orgId, employeeId }: { orgId: string; employeeId: string }) {
  const [score, setScore] = useState<LatestScore | null>(null);
  const [badges, setBadges] = useState<EmployeeRecognition[]>([]);
  const [toReport, setToReport] = useState(0);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [scoreRes, badgeRes, objRes] = await Promise.all([
        supabase.from('performance_scores').select('score_final, level, cycle:performance_cycles!cycle_id(label)')
          .eq('org_id', orgId).eq('employee_id', employeeId).order('computed_at', { ascending: false }).limit(1),
        supabase.from('employee_recognitions').select('*')
          .eq('org_id', orgId).eq('employee_id', employeeId).eq('status', 'confirmed')
          .order('created_at', { ascending: false }).limit(6),
        supabase.from('employee_objectives').select('id', { count: 'exact', head: true })
          .eq('org_id', orgId).eq('employee_id', employeeId).eq('status', 'active'),
      ]);
      if (cancelled || scoreRes.error) return;
      setAvailable(true);
      setScore(((scoreRes.data ?? [])[0] ?? null) as LatestScore | null);
      setBadges((badgeRes.data ?? []) as EmployeeRecognition[]);
      setToReport(objRes.count ?? 0);
    })();
    return () => { cancelled = true; };
  }, [orgId, employeeId]);

  if (!available) return null;
  const cycle = score ? (Array.isArray(score.cycle) ? score.cycle[0] : score.cycle) : null;

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-900 inline-flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-teal-600" /> Ma performance
        </h2>
        <Link to="/performance" className="text-xs font-medium text-teal-700 hover:underline">Voir le détail</Link>
      </div>
      {score ? (
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold tabular-nums text-slate-900">{formatScore(score.score_final)}</span>
          <span className="text-xs text-slate-400">/ 100{cycle ? ` · ${cycle.label}` : ''}</span>
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${LEVEL_COLORS[score.level]}`}>{levelLabel(score.level)}</span>
        </div>
      ) : (
        <p className="text-sm text-slate-400">Pas encore de score calculé.</p>
      )}
      {toReport > 0 && (
        <p className="text-xs text-amber-700">{toReport} objectif(s) à déclarer à votre responsable.</p>
      )}
      <BadgeList items={badges} />
    </div>
  );
}
