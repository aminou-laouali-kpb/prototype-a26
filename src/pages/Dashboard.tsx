import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session';
import {
  PayrollPeriod, PayrollLine, LeaveRequest, Employee, Department, ClockEntry,
  formatXof, monthLabel, statusLabel, STATUS_COLORS, formatDate,
} from '../lib/types';
import { EmptyState, SimulationNotice, Spinner, ErrorBanner } from '../components/ui';
import {
  Users, CalendarClock, Wallet, Clock, ChevronDown, ChevronRight, PlayCircle,
  ArrowRight,
} from 'lucide-react';

const DEMO_STEPS = [
  { icon: <Users className="w-4 h-4" />, title: '1. Salariés', text: 'Parcourez les dossiers : matricule, contrat, coordonnées de paiement (Mobile Money, banque).' },
  { icon: <Clock className="w-4 h-4" />, title: '2. Temps', text: 'Pointez une arrivée puis une sortie ; montrez une correction avec son motif.' },
  { icon: <CalendarClock className="w-4 h-4" />, title: '3. Congés', text: 'Créez une demande, puis validez-la depuis la vue « Toutes les demandes ».' },
  { icon: <Wallet className="w-4 h-4" />, title: '4. Pré-paie', text: 'Saisissez les variables du mois (heures sup, primes). Les primes annuelles s’attribuent dans Primes, puis se versent sur un cycle ouvert.' },
  { icon: <Users className="w-4 h-4" />, title: '5. Quatre yeux', text: 'Connectez-vous avec un compte Approbateur paie pour valider le cycle (le préparateur ne peut pas le faire).' },
  { icon: <PlayCircle className="w-4 h-4" />, title: '6. Bulletins', text: 'Chaque salarié voit ses bulletins, imprimables en PDF, avec empreinte de vérification.' },
];

export function Dashboard() {
  const { activeOrg, activeRole } = useSession();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<LeaveRequest[]>([]);
  const [todayEntries, setTodayEntries] = useState<ClockEntry[]>([]);
  const [period, setPeriod] = useState<PayrollPeriod | null>(null);
  const [lines, setLines] = useState<PayrollLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(true);
  const orgId = activeOrg?.id;

  const load = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const today = new Date().toISOString().slice(0, 10);
    const [empRes, depRes, leaveRes, periodRes, clockRes] = await Promise.all([
      supabase.from('employees').select('*').eq('org_id', orgId),
      supabase.from('departments').select('*').eq('org_id', orgId).order('name'),
      supabase.from('leave_requests').select('*, employee:employees!employee_id(*), leave_type:leave_types!leave_type_id(*)')
        .eq('org_id', orgId).eq('status', 'pending')
        .order('created_at', { ascending: false }).limit(5),
      supabase.from('payroll_periods').select('*')
        .eq('org_id', orgId)
        .order('period_year', { ascending: false })
        .order('period_month', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('clock_entries').select('*')
        .eq('org_id', orgId).eq('work_date', today),
    ]);
    const queryError = [empRes.error, depRes.error, leaveRes.error, periodRes.error, clockRes.error].find(Boolean);
    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return;
    }
    setEmployees((empRes.data ?? []) as Employee[]);
    setDepartments((depRes.data ?? []) as Department[]);
    setPendingLeaves((leaveRes.data ?? []) as LeaveRequest[]);
    setTodayEntries((clockRes.data ?? []) as ClockEntry[]);
    const p = (periodRes.data ?? null) as PayrollPeriod | null;
    setPeriod(p);
    if (p) {
      const { data: lineData, error: lineError } = await supabase
        .from('payroll_lines')
        .select('*, employee:employees!employee_id(*)')
        .eq('period_id', p.id);
      if (lineError) {
        setError(lineError.message);
        setLines([]);
      } else {
        setLines((lineData ?? []) as PayrollLine[]);
      }
    } else {
      setLines([]);
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  if (!activeOrg) return null;

  if (loading) return <Spinner label="Chargement du tableau de bord…" />;

  const activeCount = employees.filter((e) => e.status === 'active').length;
  const presentCount = new Set(todayEntries.map((e) => e.employee_id)).size;
  const netTotal = lines.reduce((s, l) => s + Number(l.net), 0);
  const costTotal = lines.reduce((s, l) => s + Number(l.gross) + Number(l.employer_total), 0);

  const byDept = departments
    .map((d) => ({ dept: d, count: employees.filter((e) => e.department_id === d.id && e.status === 'active').length }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);
  const maxDept = Math.max(1, ...byDept.map((x) => x.count));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tableau de bord</h1>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
            {activeOrg.name} — vue d’ensemble
            {activeOrg.is_demo && (
              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">DÉMO</span>
            )}
          </p>
        </div>
        <SimulationNotice className="max-w-md" />
      </div>

      <ErrorBanner message={error} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Effectif actif" value={String(activeCount)} sub={`${employees.length} dossiers au total`} icon={<Users className="w-5 h-5 text-teal-600" />} />
        <StatCard
          label="Présents aujourd’hui"
          value={String(presentCount)}
          sub={`${Math.max(0, activeCount - presentCount)} sans pointage`}
          icon={<Clock className="w-5 h-5 text-sky-600" />}
        />
        <StatCard label="Congés à valider" value={String(pendingLeaves.length)} sub="demandes en attente de décision" icon={<CalendarClock className="w-5 h-5 text-amber-600" />} />
        <StatCard
          label="Masse salariale nette"
          value={formatXof(netTotal)}
          sub={period ? monthLabel(period.period_year, period.period_month) : 'Aucun cycle calculé'}
          icon={<Wallet className="w-5 h-5 text-slate-700" />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {period && lines.length > 0 && (
            <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="font-semibold text-slate-900">
                    Dernier cycle de paie — {monthLabel(period.period_year, period.period_month)}
                  </h2>
                  <p className="text-sm text-slate-500 mt-0.5">{lines.length} bulletins · coût employeur total {formatXof(costTotal)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ${STATUS_COLORS[period.status]}`}>
                    {statusLabel(period.status)}
                  </span>
                  <Link to="/paie" className="text-sm font-medium text-teal-700 hover:underline inline-flex items-center gap-1">
                    Ouvrir <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
                <Metric label="Brut total" value={lines.reduce((s, l) => s + Number(l.gross), 0)} />
                <Metric label="Retenues salariés" value={lines.reduce((s, l) => s + Number(l.cnps_employee) + Number(l.cmu_employee) + Number(l.its), 0)} />
                <Metric label="Net à payer" value={lines.reduce((s, l) => s + Number(l.net), 0)} />
                <Metric label="Charges employeur" value={lines.reduce((s, l) => s + Number(l.employer_total), 0)} />
              </div>
            </div>
          )}

          {!period && (
            <div className="rounded-2xl bg-white ring-1 ring-slate-200">
              <EmptyState
                icon={<Wallet className="w-6 h-6" />}
                title="Aucun cycle de paie pour l’instant"
                description="Lancez un premier calcul depuis l’onglet Pré-paie."
              />
            </div>
          )}

          <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-5">
            <h2 className="font-semibold text-slate-900 mb-4">Effectif par service</h2>
            {byDept.length === 0 ? (
              <p className="text-sm text-slate-400">Aucune donnée.</p>
            ) : (
              <div className="space-y-3">
                {byDept.map(({ dept, count }) => (
                  <div key={dept.id} className="flex items-center gap-3">
                    <span className="w-36 shrink-0 text-sm text-slate-600 truncate">{dept.name}</span>
                    <div className="flex-1 h-6 rounded-lg bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-lg bg-gradient-to-r from-teal-500 to-teal-600 transition-all"
                        style={{ width: `${(count / maxDept) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-sm font-semibold text-slate-900">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-900">Congés à valider</h2>
              <Link to="/conges" className="text-xs font-medium text-teal-700 hover:underline">Tout voir</Link>
            </div>
            {pendingLeaves.length === 0 ? (
              <p className="text-sm text-slate-400">Aucune demande en attente.</p>
            ) : (
              <div className="space-y-3">
                {pendingLeaves.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium text-slate-900">
                        {r.employee ? `${r.employee.last_name} ${r.employee.first_name}` : 'Salarié'}
                      </div>
                      <div className="text-xs text-slate-400">
                        {r.leave_type?.name} · {formatDate(r.start_date)}
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-slate-600">{r.days} j</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {(activeRole === 'admin_rh' || activeRole === 'manager' || activeRole === 'preparateur' || activeRole === 'approveur_paie') && (
            <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white p-5">
              <button onClick={() => setGuideOpen(!guideOpen)} className="w-full flex items-center justify-between text-left">
                <span className="font-semibold inline-flex items-center gap-2">
                  <PlayCircle className="w-5 h-5 text-teal-300" /> Guide de démonstration
                </span>
                {guideOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
              </button>
              {guideOpen && (
                <ol className="mt-4 space-y-3">
                  {DEMO_STEPS.map((s) => (
                    <li key={s.title} className="flex gap-3">
                      <span className="mt-0.5 text-teal-300 shrink-0">{s.icon}</span>
                      <span>
                        <span className="text-sm font-semibold">{s.title}</span>
                        <span className="block text-xs text-slate-300 leading-relaxed">{s.text}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon }: { label: string; value: string; sub: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">{label}</span>
        {icon}
      </div>
      <div className="mt-3 text-3xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{sub}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-base font-bold text-slate-900 mt-0.5">{formatXof(value)}</div>
    </div>
  );
}
