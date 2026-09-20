import { supabase } from './supabase';
import { ProjectTimer, TimesheetEntry } from './types';

export function todayStr(): string {
  const d = new Date();
  return localDateStr(d);
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function elapsedSeconds(timer: ProjectTimer, now = Date.now()): number {
  const startedAt = new Date(timer.started_at).getTime();
  return Number.isFinite(startedAt) && Number.isFinite(now)
    ? Math.max(0, Math.floor((now - startedAt) / 1000))
    : 0;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function formatHoursDecimal(hours: number): string {
  const totalMinutes = Math.round(Math.max(0, Number(hours) || 0) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, '0')}`;
}

export async function fetchActiveTimer(employeeId: string, orgId?: string): Promise<ProjectTimer | null> {
  let query = supabase
    .from('project_timers')
    .select('*, project:projects!project_id(*)')
    .eq('employee_id', employeeId);
  if (orgId) query = query.eq('org_id', orgId);
  const { data } = await query.maybeSingle();
  return (data ?? null) as ProjectTimer | null;
}

export async function fetchTodayEntries(employeeId: string, orgId?: string): Promise<TimesheetEntry[]> {
  let query = supabase
    .from('timesheet_entries')
    .select('*, project:projects!project_id(*)')
    .eq('employee_id', employeeId)
    .eq('work_date', todayStr())
    .order('created_at', { ascending: true });
  if (orgId) query = query.eq('org_id', orgId);
  const { data } = await query;
  return (data ?? []) as TimesheetEntry[];
}

export async function stopTimer(timer: ProjectTimer): Promise<void> {
  const { error } = await supabase.rpc('finalize_project_timer', {
    p_timer_id: timer.id,
  });
  if (error) throw new Error(error.message);
}

export async function startTimer(
  orgId: string,
  employeeId: string,
  projectId: string,
  current: ProjectTimer | null,
): Promise<ProjectTimer | null> {
  if (current) {
    const { error } = await supabase.rpc('switch_project_timer', {
      p_timer_id: current.id,
      p_project_id: projectId,
    });
    if (error) throw new Error(error.message);
    return fetchActiveTimer(employeeId, orgId);
  }

  const { data, error } = await supabase
    .from('project_timers')
    .insert({ org_id: orgId, employee_id: employeeId, project_id: projectId })
    .select('*, project:projects!project_id(*)')
    .single();
  if (error) throw new Error(error.message);
  return (data ?? null) as ProjectTimer | null;
}
