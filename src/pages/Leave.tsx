import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session';
import { Employee, LeaveType, LeaveRequest, formatDate, statusLabel, STATUS_COLORS } from '../lib/types';
import { Modal, Field, inputClass, ErrorBanner, Spinner, EmptyState, useAsyncAction } from '../components/ui';
import { CalendarCheck, Plus } from 'lucide-react';

const DAY_MS = 24 * 60 * 60 * 1000;

interface DateRange {
  start: Date;
  end: Date;
}

interface LeaveUsage {
  approved: number;
  pending: number;
}

interface LeaveBalance {
  employeeId: string;
  employeeName: string | null;
  type: LeaveType;
  taken: number;
  pending: number;
  remaining: number;
}

function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return date;
}

function rangeFromDates(startDate: string, endDate: string): DateRange | null {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end || end < start) return null;
  return { start, end };
}

function dateRangeForYear(year: number): DateRange {
  return {
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year, 11, 31)),
  };
}

function inclusiveCalendarDays(range: DateRange): number {
  return Math.floor((range.end.getTime() - range.start.getTime()) / DAY_MS) + 1;
}

function intersectRanges(left: DateRange, right: DateRange): DateRange | null {
  const start = new Date(Math.max(left.start.getTime(), right.start.getTime()));
  const end = new Date(Math.min(left.end.getTime(), right.end.getTime()));
  return end < start ? null : { start, end };
}

function mergeRange(ranges: DateRange[], addition: DateRange): DateRange[] {
  const merged: DateRange[] = [];
  for (const range of [...ranges, addition].sort((a, b) => a.start.getTime() - b.start.getTime())) {
    const previous = merged[merged.length - 1];
    if (!previous || range.start.getTime() > previous.end.getTime() + DAY_MS) {
      merged.push({ ...range });
    } else if (range.end > previous.end) {
      previous.end = range.end;
    }
  }
  return merged;
}

function uncoveredCalendarDays(range: DateRange, occupied: DateRange[]): number {
  let uncovered = inclusiveCalendarDays(range);
  for (const occupiedRange of occupied) {
    const overlap = intersectRanges(range, occupiedRange);
    if (overlap) uncovered -= inclusiveCalendarDays(overlap);
  }
  return Math.max(0, uncovered);
}

function roundLeaveDays(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Allocates the stored request total over the dates it covers. This keeps the
 * existing `days` API (including half-days) while making year/month totals
 * additive and preventing an interval from being counted twice.
 */
function allocatedDaysInPeriod(
  request: LeaveRequest,
  period: DateRange,
  occupied: DateRange[],
): { days: number; covered: DateRange | null } {
  const requestRange = rangeFromDates(request.start_date, request.end_date);
  if (!requestRange) return { days: 0, covered: null };
  const covered = intersectRanges(requestRange, period);
  if (!covered) return { days: 0, covered: null };

  const requestDays = Number(request.days);
  if (!Number.isFinite(requestDays) || requestDays <= 0) return { days: 0, covered };

  const requestSpan = inclusiveCalendarDays(requestRange);
  const availableDays = uncoveredCalendarDays(covered, occupied);
  return {
    days: roundLeaveDays(requestDays * (availableDays / requestSpan)),
    covered,
  };
}

function leaveUsageByEmployeeAndType(requests: LeaveRequest[], year: number): Map<string, LeaveUsage> {
  const usage = new Map<string, LeaveUsage>();
  const occupiedByEmployee = new Map<string, DateRange[]>();
  const period = dateRangeForYear(year);
  const relevant = requests
    .filter((request) => request.status === 'approved' || request.status === 'pending')
    // Approved leave owns an overlapping historical interval before pending leave.
    .sort((a, b) => (
      (a.status === 'approved' ? 0 : 1) - (b.status === 'approved' ? 0 : 1)
      || a.start_date.localeCompare(b.start_date)
      || a.end_date.localeCompare(b.end_date)
      || a.id.localeCompare(b.id)
    ));

  for (const request of relevant) {
    const occupied = occupiedByEmployee.get(request.employee_id) ?? [];
    const allocation = allocatedDaysInPeriod(request, period, occupied);
    if (allocation.covered) {
      occupiedByEmployee.set(request.employee_id, mergeRange(occupied, allocation.covered));
    }
    if (allocation.days <= 0) continue;

    const key = `${request.employee_id}:${request.leave_type_id}`;
    const current = usage.get(key) ?? { approved: 0, pending: 0 };
    const status: 'approved' | 'pending' = request.status === 'approved' ? 'approved' : 'pending';
    current[status] = roundLeaveDays(current[status] + allocation.days);
    usage.set(key, current);
  }
  return usage;
}

function formatLeaveDays(value: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(roundLeaveDays(value));
}

export function LeavePage() {
  const { activeOrg, activeRole, myEmployee } = useSession();
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'mine' | 'team'>('mine');
  const [creating, setCreating] = useState(false);
  const [balanceYear, setBalanceYear] = useState(() => new Date().getFullYear());

  const isManager = activeRole === 'admin_rh' || activeRole === 'manager';
  const myEmpId = myEmployee?.id ?? null;
  const activeOrgId = activeOrg?.id ?? null;

  const load = useCallback(async () => {
    if (!activeOrgId) return;
    setLoading(true);
    const [typeRes, empRes, reqRes] = await Promise.all([
      supabase.from('leave_types').select('*').eq('org_id', activeOrgId).order('name'),
      supabase.from('employees').select('*').eq('org_id', activeOrgId).order('last_name'),
      supabase.from('leave_requests').select('*, leave_type:leave_types!leave_type_id(*), employee:employees!employee_id(*)')
        .eq('org_id', activeOrgId)
        .order('created_at', { ascending: false }),
    ]);
    setLeaveTypes((typeRes.data ?? []) as LeaveType[]);
    setEmployees((empRes.data ?? []) as Employee[]);
    setRequests((reqRes.data ?? []) as LeaveRequest[]);
    setLoading(false);
  }, [activeOrgId]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    if (view === 'team' && isManager) return requests;
    if (!myEmpId) return [];
    return requests.filter((r) => r.employee_id === myEmpId);
  }, [requests, myEmpId, view, isManager]);

  const empName = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? `${e.last_name} ${e.first_name}` : '—';
  };

  const decide = async (req: LeaveRequest, status: 'approved' | 'rejected') => {
    const note = window.prompt(
      status === 'approved' ? 'Motif / commentaire (optionnel) :' : 'Motif du refus :',
      status === 'approved' ? '' : '',
    );
    if (note === null) return;

    if (status === 'approved') {
      const { data: conflicts, error: conflictError } = await supabase
        .from('leave_requests')
        .select('id')
        .eq('org_id', req.org_id)
        .eq('employee_id', req.employee_id)
        .eq('status', 'approved')
        .neq('id', req.id)
        .lte('start_date', req.end_date)
        .gte('end_date', req.start_date)
        .limit(1);
      if (conflictError) { alert(conflictError.message); return; }
      if ((conflicts ?? []).length > 0) {
        alert('Impossible d’approuver cette demande : sa période chevauche un congé déjà approuvé pour ce salarié.');
        return;
      }
    }

    const { error } = await supabase.rpc('decide_leave_request', {
      p_request_id: req.id,
      p_status: status,
      p_note: note || null,
    });
    if (error) { alert(error.message); return; }
    await load();
  };

  const balances = useMemo(() => {
    const usage = leaveUsageByEmployeeAndType(requests, balanceYear);
    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
    const employeeIds = view === 'team' && isManager
      ? employees.map((employee) => employee.id)
      : myEmpId ? [myEmpId] : [];

    return employeeIds.flatMap<LeaveBalance>((employeeId) => leaveTypes
      .filter((type) => Number(type.annual_days) > 0)
      .map((type) => {
        const current = usage.get(`${employeeId}:${type.id}`) ?? { approved: 0, pending: 0 };
        const taken = roundLeaveDays(current.approved);
        const pending = roundLeaveDays(current.pending);
        const employee = employeeById.get(employeeId);
        return {
          employeeId,
          employeeName: view === 'team' ? (employee ? `${employee.last_name} ${employee.first_name}` : '—') : null,
          type,
          taken,
          pending,
          remaining: roundLeaveDays(Math.max(0, Number(type.annual_days) - taken)),
        };
      }));
  }, [requests, balanceYear, employees, leaveTypes, view, isManager, myEmpId]);

  const displayedBalances = balances.filter((balance) => (
    balance.taken > 0 || balance.pending > 0 || balance.remaining < Number(balance.type.annual_days)
  ));

  if (!activeOrg) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Congés</h1>
          <p className="text-sm text-slate-500 mt-1">Demandes, validations managériales et soldes suivis.</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="rounded-lg bg-teal-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition inline-flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Nouvelle demande
        </button>
      </div>

      {balances.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Soldes {balanceYear}</h2>
              <p className="text-xs text-slate-500">Congés approuvés et en attente, ventilés par année calendaire.</p>
            </div>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
              Année
              <input
                type="number"
                min={2000}
                max={2100}
                className="w-24 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={balanceYear}
                onChange={(e) => setBalanceYear(Number(e.target.value) || new Date().getFullYear())}
              />
            </label>
          </div>
          {displayedBalances.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {displayedBalances.map((b) => (
            <div key={`${b.employeeId}:${b.type.id}`} className="rounded-2xl bg-white ring-1 ring-slate-200 p-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  {b.employeeName && <div className="text-[11px] font-semibold text-slate-700 truncate">{b.employeeName}</div>}
                  <span className="text-xs text-slate-500 truncate">{b.type.name}</span>
                </div>
                {b.pending > 0 && (
                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 ring-1 ring-amber-200 rounded px-1.5 py-0.5">{formatLeaveDays(b.pending)} en attente</span>
                )}
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-bold text-slate-900">{formatLeaveDays(b.remaining)}</span>
                <span className="text-xs text-slate-400">/ {formatLeaveDays(Number(b.type.annual_days))} j restants</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-teal-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (Number(b.type.annual_days) > 0 ? (b.taken / Number(b.type.annual_days)) * 100 : 0))}%` }}
                />
              </div>
              <div className="mt-1 text-[11px] text-slate-400">{formatLeaveDays(b.taken)} jour(s) pris</div>
            </div>
          ))}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 p-1 bg-slate-100 rounded-lg w-fit">
        <button
          onClick={() => setView('mine')}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${view === 'mine' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
        >
          Mes demandes
        </button>
        {isManager && (
          <button
            onClick={() => setView('team')}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${view === 'team' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
          >
            Toutes les demandes
          </button>
        )}
      </div>

      {loading ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200">
          <EmptyState
            icon={<CalendarCheck className="w-6 h-6" />}
            title="Aucune demande de congé"
            description={view === 'team' ? 'Aucune demande dans l’organisation.' : 'Créez votre première demande de congé.'}
          />
        </div>
      ) : (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 font-semibold">Salarié</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Période</th>
                  <th className="px-4 py-3 font-semibold">Jours</th>
                  <th className="px-4 py-3 font-semibold">Statut</th>
                  <th className="px-4 py-3 font-semibold hidden lg:table-cell">Décision</th>
                  {isManager && <th className="px-4 py-3"><span className="sr-only">Décision</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {r.employee ? `${r.employee.last_name} ${r.employee.first_name}` : empName(r.employee_id)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.leave_type?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 text-sm">
                      {formatDate(r.start_date)} → {formatDate(r.end_date)}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{r.days}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${STATUS_COLORS[r.status]}`}>
                        {statusLabel(r.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 hidden lg:table-cell">
                      {r.decision_note ?? '—'}
                    </td>
                    {isManager && r.status === 'pending' && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => decide(r, 'approved')} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition">Approuver</button>
                          <button onClick={() => decide(r, 'rejected')} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition">Refuser</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <NewLeaveModal
        open={creating}
        onClose={() => setCreating(false)}
        employees={isManager ? employees : employees.filter((e) => e.id === myEmployee?.id)}
        leaveTypes={leaveTypes}
        defaultEmployeeId={myEmployee?.id ?? null}
        onSaved={() => { setCreating(false); load(); }}
      />
    </div>
  );
}

function NewLeaveModal({ open, onClose, employees, leaveTypes, defaultEmployeeId, onSaved }: {
  open: boolean;
  onClose: () => void;
  employees: Employee[];
  leaveTypes: LeaveType[];
  defaultEmployeeId: string | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    employee_id: '',
    leave_type_id: '',
    start_date: '',
    end_date: '',
    days: 1,
    reason: '',
  });
  const { busy, error, run } = useAsyncAction();

  useEffect(() => {
    if (open) {
      setForm((current) => ({
        ...current,
        employee_id: current.employee_id && employees.some((employee) => employee.id === current.employee_id)
          ? current.employee_id
          : defaultEmployeeId || '',
        leave_type_id: current.leave_type_id && leaveTypes.some((type) => type.id === current.leave_type_id)
          ? current.leave_type_id
          : leaveTypes[0]?.id ?? '',
      }));
    }
  }, [open, defaultEmployeeId, employees, leaveTypes]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const emp = employees.find((x) => x.id === form.employee_id);
      if (!emp) throw new Error('Choisissez un salarié.');
      const leaveType = leaveTypes.find((type) => type.id === form.leave_type_id);
      if (!leaveType) throw new Error('Choisissez un type de congé.');

      const requestRange = rangeFromDates(form.start_date, form.end_date);
      if (!requestRange) throw new Error('La date de fin doit être postérieure ou égale à la date de début.');

      const days = Number(form.days);
      if (!Number.isFinite(days) || days <= 0) throw new Error('Le nombre de jours doit être supérieur à zéro.');
      if (Math.abs(days * 2 - Math.round(days * 2)) > 1e-9) {
        throw new Error('Le nombre de jours doit être un multiple de 0,5.');
      }
      const maximumDays = inclusiveCalendarDays(requestRange);
      if (days > maximumDays) {
        throw new Error(`Le nombre de jours ne peut pas dépasser la période sélectionnée (${maximumDays} jour(s)).`);
      }

      const { data: conflicts, error: conflictError } = await supabase
        .from('leave_requests')
        .select('id')
        .eq('org_id', emp.org_id)
        .eq('employee_id', emp.id)
        .in('status', ['pending', 'approved'])
        .lte('start_date', form.end_date)
        .gte('end_date', form.start_date)
        .limit(1);
      if (conflictError) throw new Error(conflictError.message);
      if ((conflicts ?? []).length > 0) {
        throw new Error('Cette période chevauche déjà une demande en attente ou un congé approuvé pour ce salarié.');
      }

      const { error: err } = await supabase.from('leave_requests').insert({
        org_id: emp.org_id,
        employee_id: emp.id,
        leave_type_id: form.leave_type_id,
        start_date: form.start_date,
        end_date: form.end_date,
        days,
        reason: form.reason.trim() || null,
        status: 'pending',
      });
      if (err) throw new Error(err.message);
      onSaved();
    }).catch(() => {});
  };

  return (
    <Modal open={open} onClose={onClose} title="Nouvelle demande de congé">
      <ErrorBanner message={error} />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Salarié">
          <select className={inputClass} value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} required>
            <option value="">— Choisir —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.last_name} {e.first_name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Type de congé">
            <select className={inputClass} value={form.leave_type_id} onChange={(e) => setForm({ ...form, leave_type_id: e.target.value })} required>
              <option value="">— Choisir —</option>
              {leaveTypes.map((t) => <option key={t.id} value={t.id}>{t.name}{t.paid ? '' : ' (non payé)'}</option>)}
            </select>
          </Field>
          <Field label="Nombre de jours">
            <input type="number" min={0.5} step={0.5} className={inputClass} value={form.days} onChange={(e) => setForm({ ...form, days: Number(e.target.value) })} required />
          </Field>
          <Field label="Du">
            <input type="date" className={inputClass} value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required />
          </Field>
          <Field label="Au">
            <input type="date" className={inputClass} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} required />
          </Field>
        </div>
        <Field label="Motif (optionnel)">
          <input className={inputClass} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">Annuler</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition">
            {busy ? 'Envoi…' : 'Envoyer la demande'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
