import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session';
import {
  ClockEntry, LeaveRequest, PayrollLine, formatDate, formatXof, statusLabel, STATUS_COLORS,
} from '../lib/types';
import { grossSeconds, formatDuration } from '../lib/workSession';
import { SessionControlCard } from '../components/SessionControlCard';
import { ProjectTimerCard } from '../components/ProjectTimerCard';
import { ClaimEmployeeCard } from '../components/ClaimEmployeeCard';
import { EmptyState, Spinner } from '../components/ui';
import { CalendarCheck, Clock, Fingerprint, ArrowRight } from 'lucide-react';

function startOfWeek(): Date {
  const d = new Date();
  const day = (d.getDay() + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}

export function EmployeeHome() {
  const { myEmployee, orgSettings, activeOrg } = useSession();
  const employeeId = myEmployee?.id ?? null;
  const orgId = activeOrg?.id ?? null;
  const [clocks, setClocks] = useState<ClockEntry[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [payslips, setPayslips] = useState<PayrollLine[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!employeeId || !orgId) { setLoading(false); return; }
    setLoading(true);
    const [ckRes, lvRes, psRes] = await Promise.all([
      supabase.from('clock_entries').select('*')
        .eq('org_id', orgId).eq('employee_id', employeeId)
        .order('clock_in', { ascending: false }).limit(30),
      supabase.from('leave_requests').select('*, leave_type:leave_types(*)')
        .eq('org_id', orgId).eq('employee_id', employeeId)
        .order('start_date', { ascending: false }).limit(5),
      supabase.from('payroll_lines').select('*')
        .eq('org_id', orgId).eq('employee_id', employeeId).limit(3),
    ]);
    setClocks((ckRes.data ?? []) as ClockEntry[]);
    setLeaves((lvRes.data ?? []) as unknown as LeaveRequest[]);
    setPayslips((psRes.data ?? []) as PayrollLine[]);
    setLoading(false);
  }, [employeeId, orgId]);

  useEffect(() => { load(); }, [load]);

  if (!myEmployee) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bonjour</h1>
          <p className="text-sm text-slate-500 mt-1">Reliez votre compte pour accéder à votre espace salarié.</p>
        </div>
        <ClaimEmployeeCard />
      </div>
    );
  }

  const basis = orgSettings?.payroll_time_basis ?? 'gross';
  const weekStart = startOfWeek().getTime();
  const closed = clocks.filter((c) => c.clock_out);
  const weekClocks = closed.filter((c) => new Date(c.clock_in).getTime() >= weekStart);
  const weekSeconds = weekClocks.reduce(
    (s, c) => s + (basis === 'active' ? c.active_seconds : grossSeconds(c)), 0,
  );
  const pendingLeaves = leaves.filter((l) => l.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Bonjour {myEmployee.first_name}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Votre espace salarié — {myEmployee.job_title ?? 'poste non renseigné'}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <SessionControlCard />

          <ProjectTimerCard />

          <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-900 inline-flex items-center gap-2">
                <Clock className="w-4 h-4 text-teal-600" /> Mes dernières sessions
              </h2>
              <Link to="/temps" className="text-xs font-medium text-teal-700 hover:underline inline-flex items-center gap-1">
                Voir tout <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            {loading ? <Spinner /> : closed.length === 0 ? (
              <EmptyState icon={<Clock className="w-6 h-6" />} title="Aucune session enregistrée"
                description="Démarrez votre première session ci-dessus." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                      <th className="py-2 pr-4 font-semibold">Jour</th>
                      <th className="py-2 pr-4 font-semibold">Arrivée</th>
                      <th className="py-2 pr-4 font-semibold">Sortie</th>
                      <th className="py-2 pr-4 font-semibold">Durée totale</th>
                      <th className="py-2 pr-4 font-semibold">Temps actif</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {closed.slice(0, 8).map((c) => (
                      <tr key={c.id}>
                        <td className="py-2 pr-4 text-slate-700">{formatDate(c.work_date)}</td>
                        <td className="py-2 pr-4 text-slate-600">{time(c.clock_in)}</td>
                        <td className="py-2 pr-4 text-slate-600">
                          {c.clock_out ? time(c.clock_out) : '—'}
                          {c.closed_reason === 'auto_inactive' && (
                            <span className="ml-1 text-[10px] font-semibold text-amber-600">auto</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 font-medium text-slate-900">{formatDuration(grossSeconds(c))}</td>
                        <td className="py-2 pr-4 text-slate-600">{formatDuration(c.active_seconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-5">
            <h2 className="font-semibold text-slate-900 mb-1">Cette semaine</h2>
            <div className="text-3xl font-bold text-slate-900 mt-2">{formatDuration(weekSeconds)}</div>
            <p className="text-xs text-slate-400 mt-1">
              {basis === 'active' ? 'Temps confirmé actif' : 'Temps arrivée → sortie'} · {weekClocks.length} session(s)
            </p>
          </div>

          <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-900 inline-flex items-center gap-2">
                <CalendarCheck className="w-4 h-4 text-teal-600" /> Mes congés
              </h2>
              <Link to="/conges" className="text-xs font-medium text-teal-700 hover:underline">Gérer</Link>
            </div>
            {leaves.length === 0 ? (
              <p className="text-sm text-slate-400">Aucune demande.</p>
            ) : (
              <div className="space-y-2">
                {leaves.slice(0, 4).map((l) => (
                  <div key={l.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 truncate">{l.leave_type?.name ?? 'Congé'} · {formatDate(l.start_date)}</span>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 ${STATUS_COLORS[l.status]}`}>
                      {statusLabel(l.status)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {pendingLeaves > 0 && (
              <p className="text-xs text-amber-600 mt-3">{pendingLeaves} demande(s) en attente de décision.</p>
            )}
          </div>

          <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-900 inline-flex items-center gap-2">
                <Fingerprint className="w-4 h-4 text-teal-600" /> Mes bulletins
              </h2>
              <Link to="/bulletins" className="text-xs font-medium text-teal-700 hover:underline">Ouvrir</Link>
            </div>
            {payslips.length === 0 ? (
              <p className="text-sm text-slate-400">Aucun bulletin disponible.</p>
            ) : (
              <div className="space-y-2">
                {payslips.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Net à payer</span>
                    <span className="font-semibold text-slate-900">{formatXof(p.net)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
