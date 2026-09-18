import { supabase } from './supabase';
import { ClockEntry, OrgSettings, DEFAULT_ORG_SETTINGS } from './types';

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function capSeconds(settings: OrgSettings | null): number {
  const s = settings ?? { ...DEFAULT_ORG_SETTINGS, org_id: '', updated_at: '' };
  const interval = Number(s.reminder_interval_minutes);
  const grace = Number(s.grace_minutes);
  const safeInterval = Number.isFinite(interval) ? Math.max(0, interval) : DEFAULT_ORG_SETTINGS.reminder_interval_minutes;
  const safeGrace = Number.isFinite(grace) ? Math.max(0, grace) : DEFAULT_ORG_SETTINGS.grace_minutes;
  return (safeInterval + safeGrace) * 60;
}

export async function fetchOpenEntry(employeeId: string, orgId?: string): Promise<ClockEntry | null> {
  let query = supabase
    .from('clock_entries')
    .select('*')
    .eq('employee_id', employeeId)
    .is('clock_out', null)
    .order('clock_in', { ascending: false })
    .limit(1);
  if (orgId) query = query.eq('org_id', orgId);
  const { data, error } = await query.maybeSingle();
  if (error) return null;
  return (data as ClockEntry | null) ?? null;
}

export async function startSession(orgId: string, employeeId: string): Promise<ClockEntry> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('clock_entries')
    .insert({
      org_id: orgId,
      employee_id: employeeId,
      work_date: todayIso(),
      clock_in: now,
      last_active_at: now,
      active_seconds: 0,
      source: 'web',
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as ClockEntry;
}

function accumulate(entry: ClockEntry, settings: OrgSettings | null, until: number): number {
  const clockIn = new Date(entry.clock_in).getTime();
  const lastValue = new Date(entry.last_active_at ?? entry.clock_in).getTime();
  const validUntil = Number.isFinite(until) ? until : Date.now();
  const last = Number.isFinite(lastValue)
    ? Math.max(lastValue, Number.isFinite(clockIn) ? clockIn : lastValue)
    : validUntil;
  const delta = Math.max(0, (validUntil - last) / 1000);
  const add = Math.min(delta, capSeconds(settings));
  return Math.max(0, Math.round((Number(entry.active_seconds) || 0) + add));
}

function closeTimeAfter(entry: ClockEntry, candidateMs: number): string {
  const clockInMs = new Date(entry.clock_in).getTime();
  const candidate = Number.isFinite(candidateMs) ? candidateMs : Date.now();
  const minimum = Number.isFinite(clockInMs) ? clockInMs + 1000 : candidate;
  return new Date(Math.max(candidate, minimum)).toISOString();
}

export async function recordPresence(entry: ClockEntry, settings: OrgSettings | null): Promise<ClockEntry> {
  const now = Date.now();
  const active = accumulate(entry, settings, now);
  const nowIso = new Date(now).toISOString();
  const { data, error } = await supabase
    .from('clock_entries')
    .update({ last_active_at: nowIso, active_seconds: active })
    .eq('id', entry.id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as ClockEntry;
}

export async function endSession(
  entry: ClockEntry,
  settings: OrgSettings | null,
  reason: 'manual' | 'auto_inactive',
): Promise<ClockEntry> {
  const now = Date.now();
  let clockOut: string;
  let active: number;
  if (reason === 'manual') {
    active = accumulate(entry, settings, now);
    clockOut = closeTimeAfter(entry, now);
  } else {
    // Inactivity closes the real session at the time the timeout is observed.
    // Keep active_seconds limited to confirmed presence; grossSeconds can still
    // represent the full clock-in → automatic clock-out span.
    active = Math.max(0, Math.round(Number(entry.active_seconds) || 0));
    clockOut = closeTimeAfter(entry, now);
  }
  const { data, error } = await supabase
    .from('clock_entries')
    .update({ clock_out: clockOut, active_seconds: active, closed_reason: reason })
    .eq('id', entry.id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as ClockEntry;
}

export function grossSeconds(entry: ClockEntry): number {
  const start = new Date(entry.clock_in).getTime();
  const end = entry.clock_out ? new Date(entry.clock_out).getTime() : Date.now();
  return Number.isFinite(start) && Number.isFinite(end)
    ? Math.max(0, Math.round((end - start) / 1000))
    : 0;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0 && m === 0) return `${s % 60} s`;
  return `${h} h ${String(m).padStart(2, '0')}`;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
