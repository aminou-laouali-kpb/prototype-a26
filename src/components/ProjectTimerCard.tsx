import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '../lib/session';
import { Project, ProjectTimer, TimesheetEntry } from '../lib/types';
import {
  fetchActiveTimer, fetchTodayEntries, startTimer, stopTimer,
  elapsedSeconds, formatClock, formatHoursDecimal,
} from '../lib/projectTimer';
import { supabase } from '../lib/supabase';
import { ErrorBanner, Spinner } from './ui';
import { Timer, Play, Square, FolderKanban } from 'lucide-react';

export function ProjectTimerCard({ onFlush }: { onFlush?: () => void }) {
  const { activeOrg, myEmployee } = useSession();
  const activeOrgId = activeOrg?.id ?? null;
  const myEmployeeId = myEmployee?.id ?? null;
  const [projects, setProjects] = useState<Project[]>([]);
  const [timer, setTimer] = useState<ProjectTimer | null>(null);
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const startedRef = useRef(false);

  const load = useCallback(async () => {
    if (!activeOrgId || !myEmployeeId) return;
    const [projRes, activeTimer, todayEntries] = await Promise.all([
      supabase.from('projects').select('*').eq('org_id', activeOrgId).eq('active', true).order('name'),
      fetchActiveTimer(myEmployeeId, activeOrgId),
      fetchTodayEntries(myEmployeeId, activeOrgId),
    ]);
    setProjects((projRes.data ?? []) as Project[]);
    setTimer(activeTimer);
    setEntries(todayEntries);
    setLoading(false);
  }, [activeOrgId, myEmployeeId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!myEmployee || !activeOrg) return null;

  const running = timer ? elapsedSeconds(timer, now) : 0;

  const savedByProject = new Map<string, number>();
  for (const e of entries) {
    savedByProject.set(e.project_id, (savedByProject.get(e.project_id) ?? 0) + Number(e.hours));
  }
  const liveHoursByProject = (projectId: string) => {
    const saved = savedByProject.get(projectId) ?? 0;
    const live = timer && timer.project_id === projectId ? running / 3600 : 0;
    return saved + live;
  };
  const totalToday = Array.from(savedByProject.values()).reduce((s, h) => s + h, 0) + running / 3600;

  const pickProject = async (projectId: string) => {
    if (busy) return;
    if (timer && timer.project_id === projectId) return;
    setBusy(true);
    setError(null);
    startedRef.current = true;
    try {
      const next = await startTimer(activeOrg.id, myEmployee.id, projectId, timer);
      setTimer(next);
      const todayEntries = await fetchTodayEntries(myEmployee.id, activeOrg.id);
      setEntries(todayEntries);
      onFlush?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de démarrer le chronomètre.');
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (!timer || busy) return;
    setBusy(true);
    setError(null);
    try {
      await stopTimer(timer);
      setTimer(null);
      const todayEntries = await fetchTodayEntries(myEmployee.id, activeOrg.id);
      setEntries(todayEntries);
      onFlush?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible d’arrêter le chronomètre.');
    } finally {
      setBusy(false);
    }
  };

  const activeProject = timer ? projects.find((p) => p.id === timer.project_id) : null;

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-slate-900 inline-flex items-center gap-2">
          <Timer className="w-4 h-4 text-teal-600" /> Suivi du temps par projet
        </h2>
        <span className="text-xs text-slate-400">Aujourd’hui · {formatHoursDecimal(totalToday)}</span>
      </div>

      <ErrorBanner message={error} />

      {loading ? (
        <Spinner />
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
          <FolderKanban className="w-6 h-6 mx-auto mb-2 text-slate-300" />
          Aucun projet actif. Demandez à votre responsable d’en créer un pour ventiler votre temps.
        </div>
      ) : (
        <>
          {timer ? (
            <div className="rounded-xl bg-teal-50 border border-teal-200 p-4 mb-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-teal-700">En cours</div>
                  <div className="text-sm font-semibold text-teal-900 truncate">{activeProject?.name ?? 'Projet'}</div>
                </div>
                <div className="text-2xl font-bold tabular-nums text-teal-800">{formatClock(running)}</div>
                <button
                  onClick={stop}
                  disabled={busy}
                  className="shrink-0 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50 transition inline-flex items-center gap-1.5"
                >
                  <Square className="w-4 h-4" /> Arrêter
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500 mb-4">
              Choisissez un projet pour lancer le chronomètre. Basculez d’un projet à l’autre en un clic : le temps du projet précédent est enregistré automatiquement.
            </p>
          )}

          <div className="space-y-2">
            {projects.map((p) => {
              const isActive = timer?.project_id === p.id;
              const hours = liveHoursByProject(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => pickProject(p.id)}
                  disabled={busy || isActive}
                  className={`w-full flex items-center justify-between rounded-lg border px-4 py-3 text-left transition ${
                    isActive
                      ? 'border-teal-400 bg-teal-50/60 cursor-default'
                      : 'border-slate-200 hover:border-teal-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    {isActive ? (
                      <span className="w-2.5 h-2.5 rounded-full bg-teal-500 animate-pulse shrink-0" />
                    ) : (
                      <Play className="w-4 h-4 text-slate-300 shrink-0" />
                    )}
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-900 truncate">{p.name}</span>
                      {p.funder && <span className="block text-[11px] text-slate-400 truncate">{p.funder}</span>}
                    </span>
                  </span>
                  <span className={`text-sm tabular-nums font-semibold ${hours > 0 ? 'text-slate-700' : 'text-slate-300'}`}>
                    {formatHoursDecimal(hours)}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="text-[11px] text-slate-400 mt-4">
            Les heures chronométrées alimentent vos feuilles de temps du jour (en brouillon), que vous pourrez soumettre à validation.
          </p>
        </>
      )}
    </div>
  );
}
