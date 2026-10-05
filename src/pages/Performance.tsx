import { useMemo, useState } from 'react';
import { Gift, Settings2, Target, Users } from 'lucide-react';
import { useSession } from '../lib/session';
import { ErrorBanner, Spinner } from '../components/ui';
import {
  CYCLE_STATUS_COLORS, canConfigurePerformance, canManagePerformance, cycleStatusLabel, isPerformanceReadOnly,
} from '../lib/performance';
import { formatDate } from '../lib/types';
import { usePerformanceData } from './performance/usePerformanceData';
import { MyPerformance } from './performance/MyPerformance';
import { TeamView } from './performance/TeamView';
import { RewardsView } from './performance/RewardsView';
import { CyclesView } from './performance/CyclesView';

type Tab = 'me' | 'team' | 'rewards' | 'cycles';

const TAB_META: Record<Tab, { label: string; icon: React.ReactNode }> = {
  me: { label: 'Moi', icon: <Target className="w-4 h-4" /> },
  team: { label: 'Équipe', icon: <Users className="w-4 h-4" /> },
  rewards: { label: 'Récompenses', icon: <Gift className="w-4 h-4" /> },
  cycles: { label: 'Cycles et réglages', icon: <Settings2 className="w-4 h-4" /> },
};

export function PerformancePage() {
  const { activeOrg, activeRole, myEmployee } = useSession();
  const canManage = canManagePerformance(activeRole);
  const canConfigure = canConfigurePerformance(activeRole);
  const readOnly = isPerformanceReadOnly(activeRole);
  const seesTeam = canManage || readOnly;

  const data = usePerformanceData(activeOrg?.id ?? null, seesTeam);

  const tabs = useMemo<Tab[]>(() => {
    const list: Tab[] = [];
    if (myEmployee && (activeRole === 'employee' || canManage)) list.push('me');
    if (seesTeam) list.push('team', 'rewards', 'cycles');
    if (list.length === 0) list.push('me');
    return list;
  }, [myEmployee, activeRole, canManage, seesTeam]);

  const [picked, setPicked] = useState<Tab | null>(null);
  const tab = picked && tabs.includes(picked) ? picked : tabs[0];

  if (!activeOrg) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Performance et récompenses</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Des objectifs fixés par le responsable et des indicateurs lus dans l’application, un score qui s’explique ligne par ligne, puis une prime ou un badge décidés sur des faits.
          </p>
        </div>
        {data.cycles.length > 0 && (
          <div className="flex items-center gap-3">
            <select
              aria-label="Cycle de performance"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={data.cycleId ?? ''}
              onChange={(e) => data.setCycleId(e.target.value)}
            >
              {data.cycles.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            {data.cycle && (
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${CYCLE_STATUS_COLORS[data.cycle.status]}`}
                title={`${formatDate(data.cycle.start_date)} → ${formatDate(data.cycle.end_date)}`}>
                {cycleStatusLabel(data.cycle.status)}
              </span>
            )}
          </div>
        )}
      </div>

      <ErrorBanner message={data.error} />

      {tabs.length > 1 && (
        <div className="flex flex-wrap gap-2 p-1 bg-slate-100 rounded-lg w-fit">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setPicked(t)}
              className={`px-3.5 py-1.5 rounded-md text-sm font-medium inline-flex items-center gap-2 transition ${tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {TAB_META[t].icon}{TAB_META[t].label}
            </button>
          ))}
        </div>
      )}

      {data.loading && data.cycles.length === 0 && !data.error ? (
        <Spinner label="Chargement de la performance…" />
      ) : data.error && data.cycles.length === 0 ? null : (
        <>
          {tab === 'me' && <MyPerformance data={data} employeeId={myEmployee?.id ?? null} />}
          {tab === 'team' && <TeamView data={data} canManage={canManage} ownEmployeeId={myEmployee?.id ?? null} />}
          {tab === 'rewards' && (
            <RewardsView data={data} canManage={canManage} canDecide={canConfigure} ownEmployeeId={myEmployee?.id ?? null} />
          )}
          {tab === 'cycles' && <CyclesView data={data} canConfigure={canConfigure} />}
        </>
      )}
    </div>
  );
}
