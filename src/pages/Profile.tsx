import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession, ROLE_LABELS } from '../lib/session';
import {
  Employee, Department, Contract, LeaveRequest, ClockEntry, TimesheetEntry,
  formatDate, formatXof, statusLabel, STATUS_COLORS,
} from '../lib/types';
import { Spinner, EmptyState, ErrorBanner, Field, inputClass, useAsyncAction } from '../components/ui';
import { UserRound, Save, Briefcase, CalendarCheck, Clock, ClipboardList } from 'lucide-react';

export function ProfilePage() {
  const { session, myEmployee: sessionEmployee, activeOrg, activeRole, refresh } = useSession();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);
  const [department, setDepartment] = useState<Department | null>(null);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [clocks, setClocks] = useState<ClockEntry[]>([]);
  const [timesheets, setTimesheets] = useState<TimesheetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const { busy, error, run } = useAsyncAction();
  const orgId = activeOrg?.id;
  const userId = session?.user.id;

  const load = useCallback(async () => {
    if (!orgId || !userId) {
      setEmployee(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      // Resolve the employee again in the active organisation. The session
      // context can still contain a record from the organisation used before a
      // switch, so it must never be used across org boundaries.
      const { data: linked, error: employeeError } = await supabase
        .from('employees')
        .select('*')
        .eq('org_id', orgId)
        .eq('user_id', userId)
        .maybeSingle();
      if (employeeError) throw new Error(employeeError.message);
      const scopedEmployee = (linked as Employee | null)
        ?? (sessionEmployee?.org_id === orgId ? sessionEmployee : null);
      setEmployee(scopedEmployee);
      if (!scopedEmployee) {
        setContract(null);
        setDepartment(null);
        setLeaves([]);
        setClocks([]);
        setTimesheets([]);
        return;
      }

      const [ctrRes, depRes, lvRes, ckRes, tsRes] = await Promise.all([
        supabase.from('contracts').select('*').eq('org_id', orgId).eq('employee_id', scopedEmployee.id).eq('is_current', true).maybeSingle(),
        supabase.from('departments').select('*').eq('org_id', orgId).eq('id', scopedEmployee.department_id ?? '').maybeSingle(),
        supabase.from('leave_requests').select('*, leave_type:leave_types!leave_type_id(*)')
          .eq('org_id', orgId).eq('employee_id', scopedEmployee.id).order('start_date', { ascending: false }).limit(10),
        supabase.from('clock_entries').select('*')
          .eq('org_id', orgId).eq('employee_id', scopedEmployee.id)
          .order('clock_in', { ascending: false }).limit(10),
        supabase.from('timesheet_entries').select('*, project:projects!project_id(*)')
          .eq('org_id', orgId).eq('employee_id', scopedEmployee.id).order('work_date', { ascending: false }).limit(10),
      ]);
      const queryError = [ctrRes.error, depRes.error, lvRes.error, ckRes.error, tsRes.error].find(Boolean);
      if (queryError) throw new Error(queryError.message);
      setContract((ctrRes.data ?? null) as Contract | null);
      setDepartment((depRes.data ?? null) as Department | null);
      setLeaves((lvRes.data ?? []) as unknown as LeaveRequest[]);
      setClocks((ckRes.data ?? []) as ClockEntry[]);
      setTimesheets((tsRes.data ?? []) as TimesheetEntry[]);
      setPhone(scopedEmployee.phone ?? '');
      setAddress(scopedEmployee.address ?? '');
    } catch (e) {
      setEmployee(null);
      setLoadError(e instanceof Error ? e.message : 'Chargement du profil impossible.');
    } finally {
      setLoading(false);
    }
  }, [orgId, userId, sessionEmployee]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner label="Chargement du profil…" />;

  if (!employee) {
    return (
      <>
        <ErrorBanner message={loadError ?? error} />
        <div className="rounded-2xl bg-white ring-1 ring-slate-200">
          <EmptyState
            icon={<UserRound className="w-6 h-6" />}
            title="Aucune fiche salarié liée à cette organisation"
            description="Demandez à votre administrateur RH de rattacher votre compte à votre fiche dans cette organisation."
          />
        </div>
      </>
    );
  }

  const canEditContact = activeRole === 'admin_rh';

  const saveContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditContact || !orgId) return;
    run(async () => {
      const { data: updated, error: err } = await supabase
        .from('employees')
        .update({ phone: phone.trim() || null, address: address.trim() || null })
        .eq('id', employee.id)
        .eq('org_id', orgId)
        .select('id, phone, address')
        .maybeSingle();
      if (err) throw new Error(err.message);
      if (!updated) throw new Error('Aucune modification enregistrée : vous n’avez pas les droits requis.');
      setEmployee({ ...employee, phone: updated.phone, address: updated.address });
      await refresh();
    }).catch(() => {});
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mon profil</h1>
        <p className="text-sm text-slate-500 mt-1">Vos informations, votre contrat et votre activité récente.</p>
      </div>
      <ErrorBanner message={loadError ?? error} />

      {loading ? <Spinner /> : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-teal-100 ring-1 ring-teal-200 flex items-center justify-center text-lg font-bold text-teal-700">
                  {employee.first_name?.[0] ?? ''}{employee.last_name?.[0] ?? ''}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{employee.first_name} {employee.last_name}</h2>
                  <p className="text-sm text-slate-500">{employee.job_title ?? '—'} · {department?.name ?? '—'}</p>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{employee.employee_number}</p>
                </div>
                <span className="ml-auto inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 bg-slate-100 text-slate-600 ring-slate-200">
                  {ROLE_LABELS[activeRole ?? 'employee']}
                </span>
              </div>

              <form onSubmit={saveContact} className="mt-5 grid sm:grid-cols-2 gap-4">
                <Field label="Téléphone">
                  <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+227 …" readOnly={!canEditContact} />
                </Field>
                <Field label="Adresse (optionnel)">
                  <input className={inputClass} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Quartier, ville" readOnly={!canEditContact} />
                </Field>
                <div className="sm:col-span-2 flex items-center justify-between">
                  <p className="text-xs text-slate-400">{canEditContact ? 'Les autres informations sont gérées par votre service RH.' : 'Ces coordonnées sont gérées par votre service RH.'}</p>
                  {canEditContact && (
                    <button type="submit" disabled={busy} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition inline-flex items-center gap-2">
                      <Save className="w-4 h-4" /> {busy ? 'Enregistrement…' : 'Enregistrer'}
                    </button>
                  )}
                </div>
              </form>
            </div>

            <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-5">
              <h2 className="font-semibold text-slate-900 mb-3 inline-flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-teal-600" /> Contrat
              </h2>
              {contract ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <Info label="Type" value={contract.contract_type} />
                  <Info label="Depuis le" value={formatDate(contract.start_date)} />
                  <Info label="Salaire de base" value={formatXof(contract.base_salary)} />
                  <Info label="Heures mensuelles" value={`${Number(contract.monthly_hours)} h`} />
                </div>
              ) : (
                <p className="text-sm text-slate-400">Aucun contrat actif.</p>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-5">
              <h2 className="font-semibold text-slate-900 mb-3 inline-flex items-center gap-2">
                <CalendarCheck className="w-4 h-4 text-teal-600" /> Dernières demandes de congés
              </h2>
              {leaves.length === 0 ? (
                <p className="text-sm text-slate-400">Aucune demande.</p>
              ) : (
                <div className="space-y-2">
                  {leaves.slice(0, 4).map((l) => (
                    <div key={l.id} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">{l.leave_type?.name ?? 'Congé'}</span>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 ${STATUS_COLORS[l.status]}`}>
                        {statusLabel(l.status)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-5">
              <h2 className="font-semibold text-slate-900 mb-3 inline-flex items-center gap-2">
                <Clock className="w-4 h-4 text-teal-600" /> Pointages récents
              </h2>
              {clocks.length === 0 ? (
                <p className="text-sm text-slate-400">Aucun pointage.</p>
              ) : (
                <div className="space-y-2">
                  {clocks.slice(0, 5).map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">{formatDate(c.work_date)}</span>
                      <span className="text-xs text-slate-400">
                        {new Date(c.clock_in).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        {c.clock_out ? ` → ${new Date(c.clock_out).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ' → …'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {timesheets.length > 0 && (
              <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-5">
                <h2 className="font-semibold text-slate-900 mb-3 inline-flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-teal-600" /> Feuilles de temps
                </h2>
                <div className="space-y-2">
                  {timesheets.slice(0, 4).map((t) => (
                    <div key={t.id} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 truncate">{t.project?.name ?? 'Projet'}</span>
                      <span className="text-xs font-semibold text-slate-900">{Number(t.hours)} h</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-semibold text-slate-900 mt-0.5">{value}</div>
    </div>
  );
}
