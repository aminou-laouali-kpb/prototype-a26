import { supabase } from './supabase';
import { ProjectTimer, TimesheetEntry } from './types';

export function todayStr(): string {
  const d = new Date();
  return localDateStr(d);
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface TimerSlice {
  workDate: string;
  seconds: number;
}

function timerSlices(startedAt: string, endedAt: number): TimerSlice[] {
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(endedAt) || endedAt <= start) return [];

  const slices: TimerSlice[] = [];
  let cursor = start;
  while (cursor < endedAt) {
    const current = new Date(cursor);
    const nextLocalMidnight = new Date(
      current.getFullYear(),
      current.getMonth(),
      current.getDate() + 1,
    ).getTime();
    const dateEnd = Math.min(endedAt, nextLocalMidnight > cursor ? nextLocalMidnight : endedAt);
    let chunkStart = cursor;
    const workDate = localDateStr(current);

    // A local calendar day can be longer than 24 hours around a DST change,
    // while timesheet_entries accepts at most 24 hours per row.
    while (chunkStart < dateEnd) {
      const chunkEnd = Math.min(dateEnd, chunkStart + 24 * 60 * 60 * 1000);
      slices.push({ workDate, seconds: (chunkEnd - chunkStart) / 1000 });
      chunkStart = chunkEnd;
    }
    cursor = dateEnd;
  }
  return slices;
}

function storedHours(seconds: number): number {
  // The database stores numeric(5,2) and rejects zero-hour rows. Keep the
  // nearest hundredth, with the smallest valid value for a very short stop.
  return Math.min(24, Math.max(0.01, Math.round((seconds / 3600) * 100) / 100));
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
    .select('*, project:projects(*)')
    .eq('employee_id', employeeId);
  if (orgId) query = query.eq('org_id', orgId);
  const { data } = await query.maybeSingle();
  return (data ?? null) as ProjectTimer | null;
}

export async function fetchTodayEntries(employeeId: string, orgId?: string): Promise<TimesheetEntry[]> {
  let query = supabase
    .from('timesheet_entries')
    .select('*, project:projects(*)')
    .eq('employee_id', employeeId)
    .eq('work_date', todayStr())
    .order('created_at', { ascending: true });
  if (orgId) query = query.eq('org_id', orgId);
  const { data } = await query;
  return (data ?? []) as TimesheetEntry[];
}

async function recordTimerTime(timer: ProjectTimer, stoppedAt: number): Promise<void> {
  const slices = timerSlices(timer.started_at, stoppedAt);
  if (slices.length === 0) {
    throw new Error('Le chronomètre a une date de démarrage invalide ou est encore en cours.');
  }

  // Send all date slices in one request. PostgREST executes one insert as one
  // database statement, so a failed slice does not leave a partial stop to be
  // duplicated on the next retry. The timer is deleted only after this write.
  const { error: timesheetError } = await supabase.from('timesheet_entries').insert(
    slices.map((slice) => ({
      org_id: timer.org_id,
      employee_id: timer.employee_id,
      project_id: timer.project_id,
      work_date: slice.workDate,
      hours: storedHours(slice.seconds),
      activity: timer.note ?? null,
      status: 'draft',
    })),
  );
  if (timesheetError) {
    throw new Error(`Enregistrement du temps impossible : ${timesheetError.message}`);
  }
}

export async function stopTimer(timer: ProjectTimer): Promise<void> {
  const stoppedAt = Date.now();
  await recordTimerTime(timer, stoppedAt);

  const { error: deleteError } = await supabase
    .from('project_timers')
    .delete()
    .eq('id', timer.id);
  if (deleteError) {
    throw new Error(`Suppression du chronomètre impossible : ${deleteError.message}`);
  }
}

export async function startTimer(
  orgId: string,
  employeeId: string,
  projectId: string,
  current: ProjectTimer | null,
): Promise<ProjectTimer | null> {
  if (current) {
    // Keep the unique timer row and switch it only after the previous segment
    // has been recorded. This avoids losing the active timer if the write of
    // the new project fails, and avoids the unique(employee_id) insert race.
    const switchedAt = Date.now();
    const currentStart = new Date(current.started_at).getTime();
    if (!Number.isFinite(currentStart) || switchedAt < currentStart) {
      throw new Error('Le chronomètre actif a une date de démarrage invalide.');
    }
    if (switchedAt > currentStart) await recordTimerTime(current, switchedAt);
    const { data, error } = await supabase
      .from('project_timers')
      .update({
        project_id: projectId,
        started_at: new Date(switchedAt).toISOString(),
        note: null,
      })
      .eq('id', current.id)
      .eq('org_id', orgId)
      .eq('employee_id', employeeId)
      .select('*, project:projects(*)')
      .single();
    if (error) throw new Error(error.message);
    return (data ?? null) as ProjectTimer | null;
  }

  const { data, error } = await supabase
    .from('project_timers')
    .insert({ org_id: orgId, employee_id: employeeId, project_id: projectId })
    .select('*, project:projects(*)')
    .single();
  if (error) throw new Error(error.message);
  return (data ?? null) as ProjectTimer | null;
}
