import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Employee, EmployeeRecognition } from '../../lib/types';
import { BadgeChip } from './RecognitionBadges';

type WallRow = EmployeeRecognition & { employee: Pick<Employee, 'first_name' | 'last_name'> | null };

/** Mur d’équipe du tableau de bord : badges du dernier cycle, jamais une liste ordonnée par score. */
export function TeamWallCard({ orgId }: { orgId: string }) {
  const [rows, setRows] = useState<WallRow[]>([]);
  const [label, setLabel] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cycleRes = await supabase.from('performance_cycles').select('id, label')
        .eq('org_id', orgId).order('start_date', { ascending: false }).limit(1);
      if (cancelled || cycleRes.error) return;
      setAvailable(true);
      const cycle = (cycleRes.data ?? [])[0] as { id: string; label: string } | undefined;
      if (!cycle) return;
      const res = await supabase.from('employee_recognitions')
        .select('*, employee:employees!employee_id(first_name, last_name)')
        .eq('cycle_id', cycle.id).eq('status', 'confirmed').order('created_at', { ascending: false }).limit(8);
      if (cancelled) return;
      setLabel(cycle.label);
      setRows((res.data ?? []) as unknown as WallRow[]);
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  if (!available) return null;

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-900 inline-flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-500" /> Mur d’équipe{label ? ` — ${label}` : ''}
        </h2>
        <Link to="/performance" className="text-xs font-medium text-teal-700 hover:underline">Performance</Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">Aucun badge attribué pour le moment.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-slate-800">{r.employee ? `${r.employee.first_name} ${r.employee.last_name}` : '—'}</span>
              <BadgeChip badge={r.badge} title={r.note ?? undefined} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
