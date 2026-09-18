import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session';
import { useWorkSession } from '../lib/workSessionContext';
import { grossSeconds, formatDuration } from '../lib/workSession';
import { Employee, ClockEntry } from '../lib/types';
import { SessionControlCard } from '../components/SessionControlCard';
import { ClaimEmployeeCard } from '../components/ClaimEmployeeCard';
import { Modal, Field, inputClass, ErrorBanner, Spinner, EmptyState, useAsyncAction } from '../components/ui';
import { Clock, Pencil, Timer } from 'lucide-react';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function TimePage() {
  const { activeOrg, activeRole, myEmployee, session } = useSession();
  const { active } = useWorkSession();
  const activeOrgId = activeOrg?.id ?? null;
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entries, setEntries] = useState<ClockEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dayFilter, setDayFilter] = useState(todayIso());
  const [editing, setEditing] = useState<ClockEntry | null>(null);

  const canEditOthers = activeRole === 'admin_rh' || activeRole === 'manager';
  const myEmpId = myEmployee?.id ?? null;

  const load = useCallback(async () => {
    if (!activeOrgId) return;
    setLoading(true);
    const [empRes, entRes] = await Promise.all([
      supabase.from('employees').select('*').eq('org_id', activeOrgId).order('last_name'),
      supabase.from('clock_entries').select('*').eq('org_id', activeOrgId).order('clock_in', { ascending: false }),
    ]);
    setEmployees((empRes.data ?? []) as Employee[]);
    setEntries((entRes.data ?? []) as ClockEntry[]);
    setLoading(false);
  }, [activeOrgId]);

  // Loads on mount/org change, and again when the user starts or ends a session.
  useEffect(() => { load(); }, [active, load]);

  const dayEntries = useMemo(
    () => entries.filter((e) => e.work_date === dayFilter),
    [entries, dayFilter],
  );

  if (!activeOrg) return null;

  const empName = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? `${e.last_name} ${e.first_name}` : '—';
  };

  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Temps de travail</h1>
        <p className="text-sm text-slate-500 mt-1">Sessions de travail suivies, corrections justifiées et présences.</p>
      </div>

      {myEmpId ? (
        <SessionControlCard />
      ) : activeRole === 'employee' ? (
        <ClaimEmployeeCard />
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Field label="Journée affichée">
          <input
            type="date"
            className={inputClass}
            value={dayFilter}
            max={todayIso()}
            onChange={(e) => setDayFilter(e.target.value)}
          />
        </Field>
      </div>

      {loading ? (
        <Spinner />
      ) : dayEntries.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200">
          <EmptyState
            icon={<Clock className="w-6 h-6" />}
            title="Aucune session ce jour"
            description="Les sessions d’arrivée et de sortie apparaîtront ici."
          />
        </div>
      ) : (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 font-semibold">Salarié</th>
                  <th className="px-4 py-3 font-semibold">Arrivée</th>
                  <th className="px-4 py-3 font-semibold">Sortie</th>
                  <th className="px-4 py-3 font-semibold">Durée totale</th>
                  <th className="px-4 py-3 font-semibold">Temps actif</th>
                  <th className="px-4 py-3 font-semibold hidden md:table-cell">Note</th>
                  {canEditOthers && <th className="px-4 py-3"><span className="sr-only">Corriger</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dayEntries.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-medium text-slate-900">{empName(e.employee_id)}</td>
                    <td className="px-4 py-3 text-slate-700">{time(e.clock_in)}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {e.clock_out ? (
                        <span className="inline-flex items-center gap-1">
                          {time(e.clock_out)}
                          {e.closed_reason === 'auto_inactive' && (
                            <span className="text-[10px] font-semibold text-amber-600">auto</span>
                          )}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-teal-700"><Timer className="w-3.5 h-3.5" /> en cours</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{e.clock_out ? formatDuration(grossSeconds(e)) : 'en cours'}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDuration(e.active_seconds)}</td>
                    <td className="px-4 py-3 text-slate-500 hidden md:table-cell">
                      {e.edit_reason ? <span className="italic">corrigé : {e.edit_reason}</span> : (e.note ?? '—')}
                    </td>
                    {canEditOthers && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setEditing(e)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-teal-700 hover:bg-teal-50 transition"
                          aria-label="Corriger"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && canEditOthers && (
        <CorrectionModal
          entry={editing}
          employeeName={empName(editing.employee_id)}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
          actorId={session?.user.id ?? null}
        />
      )}
    </div>
  );
}

function CorrectionModal({ entry, employeeName, onClose, onSaved, actorId }: {
  entry: ClockEntry;
  employeeName: string;
  onClose: () => void;
  onSaved: () => void;
  actorId: string | null;
}) {
  const [form, setForm] = useState({
    clock_in: toLocalInput(entry.clock_in),
    clock_out: entry.clock_out ? toLocalInput(entry.clock_out) : '',
    reason: '',
  });
  const { busy, error, run } = useAsyncAction();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (!form.reason.trim()) throw new Error('Un motif de correction est obligatoire (traçabilité).');
      const { error: err } = await supabase
        .from('clock_entries')
        .update({
          clock_in: new Date(form.clock_in).toISOString(),
          clock_out: form.clock_out ? new Date(form.clock_out).toISOString() : null,
          edited_by: actorId,
          edit_reason: form.reason.trim(),
        })
        .eq('id', entry.id);
      if (err) throw new Error(err.message);
      if (entry.org_id) {
        await supabase.from('audit_log').insert({
          org_id: entry.org_id,
          actor: actorId,
          action: 'correct_clock_entry',
          entity: 'clock_entries',
          entity_id: entry.id,
          details: { salarié: employeeName, motif: form.reason.trim() },
        });
      }
      onSaved();
    }).catch(() => {});
  };

  return (
    <Modal open onClose={onClose} title="Corriger le pointage" subtitle={employeeName}>
      <ErrorBanner message={error} />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Arrivée">
            <input type="datetime-local" className={inputClass} value={form.clock_in} onChange={(e) => setForm({ ...form, clock_in: e.target.value })} required />
          </Field>
          <Field label="Sortie (vide = en cours)">
            <input type="datetime-local" className={inputClass} value={form.clock_out} onChange={(e) => setForm({ ...form, clock_out: e.target.value })} />
          </Field>
        </div>
        <Field label="Motif de la correction" hint="Obligatoire — conservé au journal d’audit">
          <input className={inputClass} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Ex. oubli de pointage de sortie" required />
        </Field>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">Annuler</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition">
            {busy ? 'Enregistrement…' : 'Enregistrer la correction'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
