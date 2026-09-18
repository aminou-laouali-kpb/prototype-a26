import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session';
import { Employee, Org, Project, TimesheetEntry, formatDate, statusLabel, STATUS_COLORS } from '../lib/types';
import { Modal, Field, inputClass, ErrorBanner, Spinner, EmptyState, useAsyncAction } from '../components/ui';
import { downloadCsv } from '../lib/csv';
import { openPrintDocument, monthlySheetHtml, MonthlySheetRow } from '../lib/documents';
import { ClipboardList, Plus, FolderPlus, BarChart3, FileSpreadsheet, CalendarRange, Download, Send, CheckCheck } from 'lucide-react';

const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const fmtHours = (h: number) => (Math.round(h * 100) / 100).toString().replace('.', ',');

function localIsoDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthBounds(year: number, month: number): { start: string; end: string } {
  const monthValue = String(month).padStart(2, '0');
  const start = `${year}-${monthValue}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  return { start, end: `${year}-${monthValue}-${String(lastDay).padStart(2, '0')}` };
}

export function TimesheetsPage() {
  const { activeOrg, activeRole, myEmployee } = useSession();
  const activeOrgId = activeOrg?.id ?? null;
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [view, setView] = useState<'mine' | 'team' | 'synthese' | 'feuille'>('mine');
  const [creating, setCreating] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const loadRef = useRef(0);

  const isManager = activeRole === 'admin_rh' || activeRole === 'manager';
  const canCreate = isManager || (activeRole === 'employee' && !!myEmployee);

  const load = useCallback(async () => {
    const requestId = ++loadRef.current;
    if (!activeOrgId) {
      setProjects([]);
      setEmployees([]);
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [projRes, empRes, tsRes] = await Promise.all([
        supabase.from('projects').select('*').eq('org_id', activeOrgId).order('name'),
        supabase.from('employees').select('*').eq('org_id', activeOrgId).order('last_name'),
        supabase.from('timesheet_entries')
          .select('*, project:projects(*), employee:employees(*)')
          .eq('org_id', activeOrgId)
          .order('work_date', { ascending: false }),
      ]);
      if (requestId !== loadRef.current) return;
      const queryError = projRes.error ?? empRes.error ?? tsRes.error;
      if (queryError) throw new Error(queryError.message);
      setProjects((projRes.data ?? []) as Project[]);
      setEmployees((empRes.data ?? []) as Employee[]);
      setEntries((tsRes.data ?? []) as TimesheetEntry[]);
    } catch (error) {
      if (requestId === loadRef.current) {
        setLoadError(error instanceof Error ? error.message : 'Impossible de charger les feuilles de temps.');
      }
    } finally {
      if (requestId === loadRef.current) setLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => {
    void load();
    return () => { loadRef.current += 1; };
  }, [load]);

  const visible = useMemo(() => {
    if (view === 'team' && isManager) return entries;
    if (!myEmployee) return [];
    return entries.filter((t) => t.employee_id === myEmployee.id);
  }, [entries, myEmployee, view, isManager]);

  const pendingCount = entries.filter((t) => t.status === 'submitted').length;
  const viewEntries = visible;

  const decide = async (t: TimesheetEntry, status: 'approved' | 'rejected') => {
    setActionError(null);
    const { error } = await supabase.rpc('set_timesheet_status', {
      p_entry_id: t.id,
      p_status: status,
    });
    if (error) { setActionError(error.message); return; }
    await load();
  };

  const newOpen = creating;
  const myEmployeeId = myEmployee?.id ?? null;

  if (!activeOrg) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Feuilles de temps</h1>
          <p className="text-sm text-slate-500 mt-1">
            Imputation du temps par projet / bailleur, avec approbation — pensé pour les ONG et rapports donateurs.
          </p>
        </div>
        <div className="flex gap-2">
          {isManager && (
            <button onClick={() => setProjectOpen(true)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition inline-flex items-center gap-2">
              <FolderPlus className="w-4 h-4" /> Nouveau projet
            </button>
          )}
          {canCreate && (
            <button
              onClick={() => setCreating(true)}
              disabled={loading || projects.every((p) => !p.active)}
              className="rounded-lg bg-teal-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Saisir des heures
            </button>
          )}
        </div>
      </div>

      <ErrorBanner message={loadError ?? actionError} />

      {projects.length === 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          Aucun projet configuré : créez d’abord un projet (ou bailleur) pour pouvoir imputer des heures.
        </div>
      )}

      <div className="flex gap-2 p-1 bg-slate-100 rounded-lg w-fit">
        <button onClick={() => setView('mine')} className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${view === 'mine' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>
          Mes saisies
        </button>
        {isManager && (
          <button onClick={() => setView('team')} className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${view === 'team' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>
            Tout le monde {pendingCount > 0 && <span className="ml-1 text-amber-600">({pendingCount} à valider)</span>}
          </button>
        )}
        <button onClick={() => setView('feuille')} className={`rounded-md px-4 py-1.5 text-sm font-medium transition inline-flex items-center gap-1.5 ${view === 'feuille' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>
          <CalendarRange className="w-3.5 h-3.5" /> Feuille mensuelle
        </button>
        <button onClick={() => setView('synthese')} className={`rounded-md px-4 py-1.5 text-sm font-medium transition inline-flex items-center gap-1.5 ${view === 'synthese' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>
          <BarChart3 className="w-3.5 h-3.5" /> Synthèse
        </button>
      </div>

      {view === 'synthese' ? (
        <TimesheetSummary
          entries={isManager ? entries : (myEmployee ? entries.filter((t) => t.employee_id === myEmployee.id) : [])}
          loading={loading}
          isManager={isManager}
        />
      ) : view === 'feuille' ? (
        <MonthlySheet
          org={activeOrg}
          employees={isManager ? employees : employees.filter((e) => e.id === myEmployeeId)}
          entries={entries}
          isManager={isManager}
          myEmployeeId={myEmployeeId}
          onChange={load}
        />
      ) : (

      loading ? <Spinner /> : (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 overflow-hidden">
          {viewEntries.length === 0 ? (
            <EmptyState
              icon={<ClipboardList className="w-6 h-6" />}
              title="Aucune saisie"
              description="Saisissez les heures passées par projet pour suivre l’activité."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Salarié</th>
                    <th className="px-4 py-3 font-semibold">Projet</th>
                    <th className="px-4 py-3 font-semibold">Activité</th>
                    <th className="px-4 py-3 font-semibold">Heures</th>
                    <th className="px-4 py-3 font-semibold">Statut</th>
                    {isManager && <th className="px-4 py-3"><span className="sr-only">Actions</span></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {viewEntries.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 text-slate-600">{formatDate(t.work_date)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {t.employee ? `${t.employee.last_name} ${t.employee.first_name}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{t.project?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{t.activity ?? '—'}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{Number(t.hours)} h</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${STATUS_COLORS[t.status]}`}>
                          {statusLabel(t.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isManager && t.status === 'submitted' && (
                          <div className="flex justify-end gap-2">
                            <button onClick={() => decide(t, 'approved')} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition">Approuver</button>
                            <button onClick={() => decide(t, 'rejected')} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition">Rejeter</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      {newOpen && (
        <NewEntryModal
          projects={projects}
          employees={isManager ? employees : employees.filter((e) => e.id === myEmployeeId)}
          defaultEmployeeId={myEmployeeId}
          existingEntries={entries}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); load(); }}
          orgId={activeOrg.id}
        />
      )}

      {projectOpen && (
        <NewProjectModal
          open={projectOpen}
          onClose={() => setProjectOpen(false)}
          onSaved={() => { setProjectOpen(false); load(); }}
        />
      )}
    </div>
  );
}

function NewEntryModal({ onClose, projects, employees, defaultEmployeeId, existingEntries, onSaved, orgId }: {
  onClose: () => void;
  projects: Project[];
  employees: Employee[];
  defaultEmployeeId: string | null;
  existingEntries: TimesheetEntry[];
  onSaved: () => void;
  orgId: string;
}) {
  const [form, setForm] = useState({
    employee_id: defaultEmployeeId ?? '',
    project_id: '',
    work_date: localIsoDate(),
    hours: 8,
    activity: '',
    status: 'submitted',
  });
  const { busy, error, run } = useAsyncAction();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const hours = Number(form.hours);
      if (!Number.isFinite(hours) || hours < 0.25 || hours > 24) {
        throw new Error('Le nombre d’heures doit être compris entre 0,25 et 24.');
      }
      if (!form.employee_id || !form.project_id) {
        throw new Error('Sélectionnez un salarié et un projet.');
      }
      const dayTotal = existingEntries
        .filter((t) => t.employee_id === form.employee_id && t.work_date === form.work_date)
        .reduce((sum, t) => sum + Number(t.hours), 0);
      if (dayTotal + hours > 24) {
        throw new Error(`Cette saisie dépasserait 24 heures imputées le ${form.work_date}.`);
      }
      const { error: err } = await supabase.from('timesheet_entries').insert({
        org_id: orgId,
        employee_id: form.employee_id,
        project_id: form.project_id,
        work_date: form.work_date,
        hours: Math.round(hours * 100) / 100,
        activity: form.activity.trim() || null,
        status: 'submitted',
      });
      if (err) throw new Error(err.message);
      onSaved();
    }).catch(() => {});
  };

  return (
    <Modal open onClose={onClose} title="Saisir des heures">
      <ErrorBanner message={error} />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Salarié">
          <select className={inputClass} value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} required>
            <option value="">— Choisir —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.last_name} {e.first_name}</option>)}
          </select>
        </Field>
        <Field label="Projet / bailleur">
          <select className={inputClass} value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })} required>
            <option value="">— Choisir —</option>
            {projects.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date">
            <input type="date" className={inputClass} value={form.work_date} onChange={(e) => setForm({ ...form, work_date: e.target.value })} required />
          </Field>
          <Field label="Heures">
            <input type="number" min={0.25} max={24} step={0.25} className={inputClass} value={form.hours} onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })} required />
          </Field>
        </div>
        <Field label="Activité (optionnel)">
          <input className={inputClass} value={form.activity} onChange={(e) => setForm({ ...form, activity: e.target.value })} placeholder="Formation des formateurs…" />
        </Field>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">Annuler</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition">
            {busy ? 'Envoi…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function MonthlySheet({ org, employees, entries, isManager, myEmployeeId, onChange }: {
  org: Org | null;
  employees: Employee[];
  entries: TimesheetEntry[];
  isManager: boolean;
  myEmployeeId: string | null;
  onChange: () => Promise<void>;
}) {
  const { session } = useSession();
  const now = new Date();
  const [employeeId, setEmployeeId] = useState<string>(myEmployeeId ?? employees[0]?.id ?? '');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const { busy, error, run } = useAsyncAction();

  const employee = employees.find((e) => e.id === employeeId) ?? null;
  const { start, end } = monthBounds(year, month);

  useEffect(() => {
    if (!isManager && myEmployeeId && employeeId !== myEmployeeId) {
      setEmployeeId(myEmployeeId);
    } else if (!employees.some((e) => e.id === employeeId)) {
      setEmployeeId(myEmployeeId ?? employees[0]?.id ?? '');
    }
  }, [employees, employeeId, isManager, myEmployeeId]);

  const monthEntries = useMemo(() => entries.filter((t) =>
    t.employee_id === employeeId && t.work_date >= start && t.work_date <= end,
  ), [entries, employeeId, start, end]);

  const rows = useMemo(() => {
    const byProject = new Map<string, MonthlySheetRow>();
    for (const t of monthEntries) {
      const key = t.project_id;
      const cur = byProject.get(key) ?? { project: t.project?.name ?? '—', funder: t.project?.funder ?? null, hours: 0 };
      cur.hours += Number(t.hours);
      byProject.set(key, cur);
    }
    return Array.from(byProject.values()).sort((a, b) => a.project.localeCompare(b.project));
  }, [monthEntries]);

  const total = monthEntries.reduce((s, t) => s + Number(t.hours), 0);
  const hasSubmitted = monthEntries.some((t) => t.status === 'submitted');
  const allApproved = monthEntries.length > 0 && monthEntries.every((t) => t.status === 'approved');
  const submittableCount = monthEntries.filter((t) => t.status === 'draft' || t.status === 'rejected').length;
  const approvableCount = monthEntries.filter((t) => t.status === 'submitted').length;
  const approvedAt = monthEntries
    .filter((t) => t.approved_at)
    .map((t) => t.approved_at as string)
    .sort()
    .pop() ?? null;
  const isOwn = employeeId === myEmployeeId;

  const monthStatus = allApproved ? 'approved' : hasSubmitted ? 'submitted' : 'draft';

  const bulkUpdate = (statuses: string[], patch: Record<string, unknown>, action: string) => {
    run(async () => {
      const ids = monthEntries.filter((t) => statuses.includes(t.status)).map((t) => t.id);
      if (ids.length === 0) return;
      if (patch.status === 'approved' || patch.status === 'rejected') {
        for (const id of ids) {
          const { error: err } = await supabase.rpc('set_timesheet_status', {
            p_entry_id: id,
            p_status: patch.status,
          });
          if (err) throw new Error(err.message);
        }
      } else {
        const { error: err } = await supabase.from('timesheet_entries').update(patch).in('id', ids);
        if (err) throw new Error(err.message);
      }
      await supabase.from('audit_log').insert({
        org_id: org?.id,
        actor: session?.user.id ?? null,
        action,
        entity: 'timesheet_entries',
        entity_id: employeeId,
        details: { periode: `${MONTHS_FR[month - 1]} ${year}`, lignes: ids.length },
      });
      await onChange();
    }).catch(() => {});
  };

  const canSubmit = isManager || isOwn;
  const submitMonth = () => bulkUpdate(
    ['draft', 'rejected'],
    { status: 'submitted', approved_by: null, approved_at: null },
    'submit_monthly_sheet',
  );
  const validateMonth = () => bulkUpdate(['submitted'], {
    status: 'approved', approved_by: session?.user.id ?? null, approved_at: new Date().toISOString(),
  }, 'validate_monthly_sheet');
  const rejectMonth = () => bulkUpdate(
    ['submitted'],
    { status: 'rejected', approved_by: null, approved_at: null },
    'reject_monthly_sheet',
  );

  const exportPdf = () => {
    if (!employee) return;
    openPrintDocument(
      `Feuille ${MONTHS_FR[month - 1]} ${year} — ${employee.last_name}`,
      monthlySheetHtml(org, employee, year, month, rows, total, {
        at: approvedAt, approved: allApproved, submitted: hasSubmitted,
      }),
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {isManager && (
          <select className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.last_name} {e.first_name}</option>)}
          </select>
        )}
        <select className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {MONTHS_FR.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <input type="number" min={2020} max={2100} className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          value={year} onChange={(e) => setYear(Number(e.target.value))} />
        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ring-1 ${STATUS_COLORS[monthStatus]}`}>
          {monthStatus === 'approved' ? 'Validée' : monthStatus === 'submitted' ? 'Soumise' : 'Brouillon'}
        </span>
      </div>

      <ErrorBanner message={error} />

      {!employee ? (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200">
          <EmptyState icon={<CalendarRange className="w-6 h-6" />} title="Aucun salarié"
            description="Reliez votre compte à une fiche salarié pour établir votre feuille mensuelle." />
        </div>
      ) : (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-900">{employee.last_name} {employee.first_name}</div>
              <div className="text-xs text-slate-400">{MONTHS_FR[month - 1]} {year} · {fmtHours(total)} h au total</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {canSubmit && submittableCount > 0 && (
                <button onClick={submitMonth} disabled={busy} className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition inline-flex items-center gap-1.5">
                  <Send className="w-4 h-4" /> Soumettre le mois
                </button>
              )}
              {isManager && approvableCount > 0 && (
                <>
                  <button onClick={validateMonth} disabled={busy} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition inline-flex items-center gap-1.5">
                    <CheckCheck className="w-4 h-4" /> Valider le mois
                  </button>
                  <button onClick={rejectMonth} disabled={busy} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50 transition">
                    Renvoyer
                  </button>
                </>
              )}
              <button onClick={exportPdf} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition inline-flex items-center gap-1.5">
                <Download className="w-4 h-4" /> PDF à signer
              </button>
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState icon={<CalendarRange className="w-6 h-6" />} title="Aucune heure sur ce mois"
              description="Imputez des heures aux projets pour constituer la feuille mensuelle." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 font-semibold">Projet</th>
                    <th className="px-4 py-3 font-semibold">Bailleur / financement</th>
                    <th className="px-4 py-3 font-semibold text-right">Heures</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.project} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 font-medium text-slate-900">{r.project}</td>
                      <td className="px-4 py-3 text-slate-500">{r.funder ?? '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{fmtHours(r.hours)} h</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
                    <td className="px-4 py-3" colSpan={2}>Total du mois</td>
                    <td className="px-4 py-3 text-right tabular-nums text-teal-700">{fmtHours(total)} h</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TimesheetSummary({ entries, loading, isManager }: {
  entries: TimesheetEntry[];
  loading: boolean;
  isManager: boolean;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { start, end } = monthBounds(year, month);
  const monthEntries = useMemo(
    () => entries.filter((t) => t.work_date >= start && t.work_date <= end),
    [entries, start, end],
  );

  const summary = useMemo(() => {
    const projects = new Map<string, string>();
    const employees = new Map<string, string>();
    const cells = new Map<string, number>();
    for (const t of monthEntries) {
      const pName = t.project?.name ?? '—';
      const eName = t.employee ? `${t.employee.last_name} ${t.employee.first_name}` : '—';
      projects.set(t.project_id, pName);
      employees.set(t.employee_id, eName);
      const key = `${t.employee_id}|${t.project_id}`;
      cells.set(key, (cells.get(key) ?? 0) + Number(t.hours));
    }
    const projectList = Array.from(projects.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    const employeeList = Array.from(employees.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    const cell = (empId: string, projId: string) => cells.get(`${empId}|${projId}`) ?? 0;
    const rowTotal = (empId: string) => projectList.reduce((s, [pid]) => s + cell(empId, pid), 0);
    const colTotal = (projId: string) => employeeList.reduce((s, [eid]) => s + cell(eid, projId), 0);
    const grand = monthEntries.reduce((s, t) => s + Number(t.hours), 0);
    return { projectList, employeeList, cell, rowTotal, colTotal, grand };
  }, [monthEntries]);

  const exportCsv = () => {
    const headers = ['Salarié', ...summary.projectList.map(([, name]) => name), 'Total'];
    const rows = summary.employeeList.map(([eid, name]) => [
      name,
      ...summary.projectList.map(([pid]) => fmtHours(summary.cell(eid, pid))),
      fmtHours(summary.rowTotal(eid)),
    ]);
    const totalRow = ['Total', ...summary.projectList.map(([pid]) => fmtHours(summary.colTotal(pid))), fmtHours(summary.grand)];
    downloadCsv(`synthese-temps-${year}-${String(month).padStart(2, '0')}.csv`, headers, [...rows, totalRow]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {MONTHS_FR.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <input type="number" min={2020} max={2100} className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          value={year} onChange={(e) => setYear(Number(e.target.value))} />
        {summary.grand > 0 && (
          <button onClick={exportCsv} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition inline-flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" /> Exporter (CSV)
          </button>
        )}
        <span className="text-sm text-slate-500 ml-auto">Total du mois : <span className="font-semibold text-slate-900">{fmtHours(summary.grand)} h</span></span>
      </div>

      {loading ? <Spinner /> : summary.grand === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200">
          <EmptyState icon={<BarChart3 className="w-6 h-6" />} title="Aucune heure sur ce mois"
            description="Les heures imputées aux projets apparaîtront ici, ventilées par projet et par salarié." />
        </div>
      ) : (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 font-semibold sticky left-0 bg-slate-50">{isManager ? 'Salarié' : 'Projet'}</th>
                  {summary.projectList.map(([pid, name]) => (
                    <th key={pid} className="px-4 py-3 font-semibold text-right whitespace-nowrap">{name}</th>
                  ))}
                  <th className="px-4 py-3 font-semibold text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.employeeList.map(([eid, name]) => (
                  <tr key={eid} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-medium text-slate-900 sticky left-0 bg-white">{name}</td>
                    {summary.projectList.map(([pid]) => {
                      const v = summary.cell(eid, pid);
                      return <td key={pid} className={`px-4 py-3 text-right tabular-nums ${v > 0 ? 'text-slate-700' : 'text-slate-300'}`}>{v > 0 ? fmtHours(v) : '—'}</td>;
                    })}
                    <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums">{fmtHours(summary.rowTotal(eid))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
                  <td className="px-4 py-3 sticky left-0 bg-slate-50">Total</td>
                  {summary.projectList.map(([pid]) => (
                    <td key={pid} className="px-4 py-3 text-right tabular-nums">{fmtHours(summary.colTotal(pid))}</td>
                  ))}
                  <td className="px-4 py-3 text-right tabular-nums text-teal-700">{fmtHours(summary.grand)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function NewProjectModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { activeOrg } = useSession();
  const [form, setForm] = useState({ name: '', code: '', funder: '' });
  const { busy, error, run } = useAsyncAction();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const { error: err } = await supabase.from('projects').insert({
        org_id: activeOrg?.id,
        name: form.name.trim(),
        code: form.code.trim() || null,
        funder: form.funder.trim() || null,
      });
      if (err) throw new Error(err.message);
      onSaved();
    }).catch(() => {});
  };

  return (
    <Modal open={open} onClose={onClose} title="Nouveau projet / bailleur">
      <ErrorBanner message={error} />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nom du projet">
          <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Code (optionnel)">
            <input className={inputClass} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </Field>
          <Field label="Bailleur (optionnel)">
            <input className={inputClass} value={form.funder} onChange={(e) => setForm({ ...form, funder: e.target.value })} />
          </Field>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">Annuler</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition">
            {busy ? 'Création…' : 'Créer le projet'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
