import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session';
import {
  Employee, PayrollPeriod, PayrollLine, PayrollDetail, PayrollVariable, Org,
  formatXof, monthLabel, statusLabel,
} from '../lib/types';
import { downloadCsv } from '../lib/csv';
import { openPrintDocument, annualRecapHtml, AnnualRow } from '../lib/documents';
import {
  exportPayrollCsv, exportSocialDeclarationCsv, exportTaxDeclarationCsv,
  exportOhadaCsv, exportMobileMoneyFile, printPayrollBook,
} from '../lib/exports';
import { getCountryPack, payrollColumnLabels } from '../lib/countryPacks';
import {
  Modal, Field, inputClass, ErrorBanner, Spinner, EmptyState, SimulationNotice, useAsyncAction,
} from '../components/ui';
import {
  Wallet, Calculator, Check, Lock, Plus, Eye, FileSpreadsheet, Landmark, Table2, Variable, ShieldCheck, CalendarRange, Mail, BookOpen,
} from 'lucide-react';

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export function PayrollPage() {
  const { activeOrg, activeRole, session } = useSession();
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [lines, setLines] = useState<PayrollLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLine, setDetailLine] = useState<PayrollLine | null>(null);
  const [detailRows, setDetailRows] = useState<PayrollDetail[]>([]);
  const [creating, setCreating] = useState(false);
  const [variablesOpen, setVariablesOpen] = useState(false);
  const [annualOpen, setAnnualOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [emailResult, setEmailResult] = useState<string | null>(null);

  const canPrepare = activeRole === 'admin_rh' || activeRole === 'preparateur';
  const canApprove = activeRole === 'approveur_paie' || activeRole === 'admin_rh';
  const canLock = activeRole === 'admin_rh';

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    const { data: periodData } = await supabase
      .from('payroll_periods')
      .select('*')
      .eq('org_id', activeOrg.id)
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false });
    const list = (periodData ?? []) as PayrollPeriod[];
    setPeriods(list);
    const current = list.find((p) => p.id === selectedPeriodId) ?? list[0] ?? null;
    if (current) {
      if (selectedPeriodId !== current.id) setSelectedPeriodId(current.id);
      const lineRes = await supabase
        .from('payroll_lines').select('*, employee:employees!employee_id(*)').eq('period_id', current.id);
      setLines((lineRes.data ?? []) as PayrollLine[]);
    } else {
      if (selectedPeriodId !== null) setSelectedPeriodId(null);
      setLines([]);
    }
    setLoading(false);
  }, [activeOrg, selectedPeriodId]);

  useEffect(() => { if (activeOrg) load(); }, [activeOrg, load]);

  const totals = useMemo(() => ({
    gross: lines.reduce((s, l) => s + Number(l.gross), 0),
    retenues: lines.reduce((s, l) => s + Number(l.cnps_employee) + Number(l.cmu_employee) + Number(l.its), 0),
    net: lines.reduce((s, l) => s + Number(l.net), 0),
    charges: lines.reduce((s, l) => s + Number(l.employer_total), 0),
  }), [lines]);

  if (!activeOrg) return null;

  const period = periods.find((p) => p.id === selectedPeriodId) ?? null;

  const empName = (l: PayrollLine) => (l.employee ? `${l.employee.last_name} ${l.employee.first_name}` : '—');

  const openDetails = async (l: PayrollLine) => {
    setDetailLine(l);
    const { data } = await supabase
      .from('payroll_details').select('*').eq('line_id', l.id).order('position');
    setDetailRows((data ?? []) as PayrollDetail[]);
  };

  const computePeriod = async () => {
    if (!period) return;
    if (period.status !== 'open') {
      setActionError('Ce cycle est déjà préparé. Il faut l’approuver ou le laisser ouvert avant un nouveau calcul.');
      return;
    }
    setWorking(true);
    setActionError(null);
    try {
      const { error } = await supabase.rpc('prepare_payroll_period', {
        p_period_id: period.id,
      });
      if (error) throw new Error(error.message);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erreur de calcul');
    } finally {
      setWorking(false);
    }
  };

  const approvePeriod = async () => {
    if (!period) return;
    setActionError(null);
    if (period.prepared_by && period.prepared_by === session?.user.id) {
      setActionError('Quatre yeux : le préparateur de ce cycle ne peut pas l’approuver. Une autre personne (rôle Approbateur paie) doit le valider.');
      return;
    }
    const { error } = await supabase.rpc('approve_payroll_period', {
      p_period_id: period.id,
    });
    if (error) { setActionError(error.message); return; }
    load();
  };

  const lockPeriod = async () => {
    if (!period) return;
    setActionError(null);
    const { error } = await supabase.rpc('lock_payroll_period', {
      p_period_id: period.id,
    });
    if (error) { setActionError(error.message); return; }
    load();
  };

  const emailPeriod = async () => {
    if (!period || !session) return;
    setEmailing(true);
    setEmailResult(null);
    setActionError(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-payslips`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ period_id: period.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Envoi impossible (${res.status})`);
      const parts = [`${data.sent ?? 0} bulletin(s) envoyé(s)`];
      if (data.skipped) parts.push(`${data.skipped} sans e-mail`);
      if (Array.isArray(data.failures) && data.failures.length) parts.push(`${data.failures.length} en échec`);
      setEmailResult(parts.join(' · '));
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Envoi des bulletins impossible.');
    } finally {
      setEmailing(false);
    }
  };

  const emailedCount = lines.filter((l) => (l as PayrollLine & { emailed_at?: string | null }).emailed_at).length;

  const pack = getCountryPack(activeOrg?.country_code);
  const colLabels = payrollColumnLabels(pack);

  const exportPayroll = () => {
    exportPayrollCsv(pack, period, lines);
  };

  const exportPayment = () => {
    downloadCsv(
      `paiement-${period ? `${period.period_year}-${String(period.period_month).padStart(2, '0')}` : 'cycle'}.csv`,
      ['Matricule', 'Salarié', 'Moyen de paiement', 'Opérateur', 'Compte / Numéro', 'Net à payer (FCFA)', 'Devise'],
      lines.map((l) => {
        const emp = (l.employee ?? null) as Employee | undefined;
        const methodLabel = emp?.payment_method === 'bank' ? 'Virement bancaire'
          : emp?.payment_method === 'cash' ? 'Espèces'
          : `Mobile Money${emp?.mobile_operator ? ` — ${emp.mobile_operator}` : ''}`;
        return [
          emp?.employee_number ?? '',
          emp ? `${emp.last_name} ${emp.first_name}` : '',
          methodLabel,
          emp?.mobile_operator ?? '',
          emp?.payment_account ?? '',
          Number(l.net),
          'XOF',
        ];
      }),
    );
  };

  const exportAccounting = () => {
    const result = exportOhadaCsv(pack, period, lines);
    if (!result.ok) setActionError(result.error);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pré-paie</h1>
          <p className="text-sm text-slate-500 mt-1">
            Pack {pack.name} ({colLabels.socialEmployee}, {colLabels.tax}) — cycles mensuels, calcul explicable et validation à quatre yeux.
            {' '}Les primes annuelles s’attribuent dans{' '}
            <Link to="/primes" className="font-medium text-teal-700 hover:underline">Primes</Link>
            {' '}puis s’ajoutent au brut du cycle choisi.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setAnnualOpen(true)} className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition inline-flex items-center gap-2">
            <CalendarRange className="w-4 h-4" /> Récapitulatif annuel
          </button>
          {canPrepare && (
            <button onClick={() => setCreating(true)} className="rounded-lg bg-teal-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition inline-flex items-center gap-2">
              <Plus className="w-4 h-4" /> Nouveau cycle
            </button>
          )}
        </div>
      </div>

      <SimulationNotice />
      <ErrorBanner message={actionError} />

      {loading ? (
        <Spinner />
      ) : periods.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200">
          <EmptyState
            icon={<Wallet className="w-6 h-6" />}
            title="Aucun cycle de paie"
            description="Créez un cycle mensuel puis lancez le calcul de pré-paie."
            action={canPrepare ? (
              <button onClick={() => setCreating(true)} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition inline-flex items-center gap-2">
                <Plus className="w-4 h-4" /> Créer le premier cycle
              </button>
            ) : undefined}
          />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={selectedPeriodId ?? periods[0]?.id ?? ''}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {monthLabel(p.period_year, p.period_month)} — {statusLabel(p.status)}
                </option>
              ))}
            </select>

            {period && canPrepare && period.status === 'open' && (
              <>
                <button onClick={() => setVariablesOpen(true)} className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition inline-flex items-center gap-2">
                  <Variable className="w-4 h-4" /> Variables du mois
                </button>
                <button onClick={computePeriod} disabled={working} className="rounded-lg bg-teal-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition inline-flex items-center gap-2">
                  <Calculator className="w-4 h-4" /> {working ? 'Calcul en cours…' : 'Lancer le calcul'}
                </button>
              </>
            )}
            {period && canApprove && period.status === 'prepared' && (
              <button onClick={approvePeriod} className="rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition inline-flex items-center gap-2">
                <Check className="w-4 h-4" /> Valider (4 yeux)
              </button>
            )}
            {period && canLock && period.status === 'approved' && (
              <button onClick={lockPeriod} className="rounded-lg bg-slate-800 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-900 transition inline-flex items-center gap-2">
                <Lock className="w-4 h-4" /> Verrouiller
              </button>
            )}
          </div>

          {lines.length > 0 && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <MetricCard label="Brut total" value={totals.gross} />
                <MetricCard label="Retenues salariés" value={totals.retenues} />
                <MetricCard label="Net à payer" value={totals.net} />
                <MetricCard label="Charges employeur" value={totals.charges} />
              </div>

              {period && period.status !== 'locked' && (
                <div className="flex flex-wrap gap-2">
                  <button onClick={exportPayroll} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition inline-flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4" /> Export paie (CSV)
                  </button>
                  <button onClick={exportPayment} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition inline-flex items-center gap-2">
                    <Landmark className="w-4 h-4" /> Fichier de paiement
                  </button>
                  <button onClick={() => exportMobileMoneyFile(pack, period, lines)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition inline-flex items-center gap-2">
                    <Landmark className="w-4 h-4" /> Masse Mobile Money
                  </button>
                  <button onClick={exportAccounting} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition inline-flex items-center gap-2">
                    <Table2 className="w-4 h-4" /> Écritures OHADA
                  </button>
                  <button onClick={() => exportSocialDeclarationCsv(pack, activeOrg, period, lines)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition inline-flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4" /> Déclaration {pack.socialShort}
                  </button>
                  <button onClick={() => exportTaxDeclarationCsv(pack, activeOrg, period, lines)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition inline-flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4" /> Déclaration {pack.taxShort}
                  </button>
                  <button onClick={() => printPayrollBook(activeOrg, period, lines)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition inline-flex items-center gap-2">
                    <BookOpen className="w-4 h-4" /> Livre de paie PDF
                  </button>
                </div>
              )}

              {period && (period.status === 'approved' || period.status === 'locked') && (canPrepare || canApprove) && (
                <div className="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-slate-600">
                    <p className="font-medium text-slate-900">Distribution des bulletins par e-mail</p>
                    <p>{emailedCount} / {lines.length} bulletin(s) déjà envoyé(s).</p>
                    {emailResult && <p className="text-emerald-700 mt-1">{emailResult}</p>}
                  </div>
                  <button
                    onClick={emailPeriod}
                    disabled={emailing}
                    className="rounded-lg bg-slate-800 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-900 transition inline-flex items-center gap-2 disabled:opacity-60"
                  >
                    <Mail className="w-4 h-4" /> {emailing ? 'Envoi en cours…' : 'Envoyer les bulletins par e-mail'}
                  </button>
                </div>
              )}
            </>
          )}

          <div className="rounded-2xl bg-white ring-1 ring-slate-200 overflow-hidden">
            {lines.length === 0 ? (
              <EmptyState
                icon={<Wallet className="w-6 h-6" />}
                title="Cycle sans calcul"
                description="Saisissez les variables du mois (heures sup, primes) puis lancez le calcul pour générer les bulletins."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 font-semibold">Salarié</th>
                      <th className="px-4 py-3 font-semibold">Base</th>
                      <th className="px-4 py-3 font-semibold">Variables</th>
                      <th className="px-4 py-3 font-semibold">Brut</th>
                      <th className="px-4 py-3 font-semibold hidden md:table-cell">Retenues</th>
                      <th className="px-4 py-3 font-semibold">Net à payer</th>
                      <th className="px-4 py-3 font-semibold hidden xl:table-cell">Charges patronales</th>
                      <th className="px-4 py-3"><span className="sr-only">Détail</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lines.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 font-medium text-slate-900">{empName(l)}</td>
                        <td className="px-4 py-3 text-slate-600">{formatXof(l.base_salary)}</td>
                        <td className="px-4 py-3 text-slate-600 text-xs">
                          {Number(l.overtime_hours) > 0 && <span className="block">+{Number(l.overtime_hours)} h sup</span>}
                          {Number(l.bonuses) > 0 && <span className="block text-emerald-700">+{formatXof(l.bonuses)}</span>}
                          {Number(l.unpaid_absence_days) > 0 && <span className="block text-rose-600">−{Number(l.unpaid_absence_days)} j abs.</span>}
                          {Number(l.overtime_hours) === 0 && Number(l.bonuses) === 0 && Number(l.unpaid_absence_days) === 0 && '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-900">{formatXof(l.gross)}</td>
                        <td className="px-4 py-3 text-rose-600 hidden md:table-cell">
                          −{formatXof(Number(l.cnps_employee) + Number(l.cmu_employee) + Number(l.its))}
                        </td>
                        <td className="px-4 py-3 font-bold text-teal-700">{formatXof(l.net)}</td>
                        <td className="px-4 py-3 text-slate-600 hidden xl:table-cell">{formatXof(l.employer_total)}</td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => openDetails(l)} className="p-1.5 rounded-lg text-slate-400 hover:text-teal-700 hover:bg-teal-50 transition" aria-label="Voir le détail">
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {annualOpen && activeOrg && (
        <AnnualRecapModal orgId={activeOrg.id} org={activeOrg} onClose={() => setAnnualOpen(false)} />
      )}

      {creating && (
        <NewPeriodModal
          existing={periods}
          onClose={() => setCreating(false)}
          onSaved={async (id) => { setCreating(false); setSelectedPeriodId(id); await load(); }}
        />
      )}

      {variablesOpen && period && activeOrg && (
        <VariablesModal
          period={period}
          orgId={activeOrg.id}
          onClose={() => setVariablesOpen(false)}
          onSaved={() => { setVariablesOpen(false); load(); }}
        />
      )}

      {detailLine && (
        <DetailModal
          line={detailLine}
          details={detailRows}
          onClose={() => setDetailLine(null)}
        />
      )}
    </div>
  );}

function VariablesModal({ period, orgId, onClose, onSaved }: {
  period: PayrollPeriod;
  orgId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { session } = useSession();
  const [emps, setEmps] = useState<Employee[]>([]);
  const [vars, setVars] = useState<PayrollVariable[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { busy, error, run } = useAsyncAction();

  const load = useCallback(async () => {
    const [empRes, varRes] = await Promise.all([
      supabase.from('employees').select('*').eq('org_id', orgId).eq('status', 'active').order('last_name'),
      supabase.from('payroll_variables').select('*').eq('period_id', period.id),
    ]);
    setEmps((empRes.data ?? []) as Employee[]);
    setVars((varRes.data ?? []) as PayrollVariable[]);
    setLoading(false);
  }, [orgId, period.id]);

  useEffect(() => { load(); }, [load]);

  const varFor = (empId: string): PayrollVariable | undefined => vars.find((v) => v.employee_id === empId);

  const upsert = (emp: Employee, field: 'overtime_hours' | 'bonuses' | 'unpaid_absence_days' | 'bonus_label', value: string) => {
    const existing = varFor(emp.id);
    const base: PayrollVariable = existing ?? {
      id: '', org_id: orgId, period_id: period.id, employee_id: emp.id,
      overtime_hours: 0, bonuses: 0, bonus_label: null, unpaid_absence_days: 0, notes: null,
    };
    const next = { ...base };
    if (field === 'bonus_label') next.bonus_label = value.trim() || null;
    else next[field] = value === '' ? 0 : Number(value);
    setVars((list) => (existing ? list.map((v) => (v.employee_id === emp.id ? next : v)) : [...list, next]));
    pending.current.set(emp.id, next);
  };

  const pending = useRef(new Map<string, PayrollVariable>());

  const saveAll = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const toUpsert = Array.from(pending.current.values());
      if (toUpsert.length === 0) { onSaved(); return; }
      const { error: err } = await supabase
        .from('payroll_variables')
        .upsert(
          toUpsert.map((v) => ({
            org_id: orgId,
            period_id: period.id,
            employee_id: v.employee_id,
            overtime_hours: v.overtime_hours,
            bonuses: v.bonuses,
            bonus_label: v.bonus_label,
            unpaid_absence_days: v.unpaid_absence_days,
            notes: v.notes,
            updated_by: session?.user.id ?? null,
          })),
          { onConflict: 'period_id,employee_id' },
        );
      if (err) throw new Error(err.message);
      await supabase.from('audit_log').insert({
        org_id: orgId,
        actor: session?.user.id ?? null,
        action: 'update_payroll_variables',
        entity: 'payroll_variables',
        entity_id: period.id,
        details: { periode: monthLabel(period.period_year, period.period_month), lignes: toUpsert.length },
      });
      onSaved();
    }).catch(() => {});
  };

  const filtered = emps.filter((e) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [e.first_name, e.last_name, e.employee_number].some((v) => (v ?? '').toLowerCase().includes(q));
  });

  return (
    <Modal open onClose={onClose} title="Variables du mois" wide
      subtitle={`${monthLabel(period.period_year, period.period_month)} — heures supplémentaires, primes et absences non payées par salarié.`}>
      {loading ? <Spinner /> : (
        <form onSubmit={saveAll} className="space-y-4">
          <ErrorBanner message={error} />
          <input
            className={inputClass}
            placeholder="Rechercher un salarié…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0">
                <tr className="bg-slate-50 text-left text-xs text-slate-500">
                  <th className="px-3 py-2 font-medium">Salarié</th>
                  <th className="px-3 py-2 font-medium w-24 text-right">H. sup</th>
                  <th className="px-3 py-2 font-medium w-32 text-right">Prime</th>
                  <th className="px-3 py-2 font-medium w-40">Libellé prime</th>
                  <th className="px-3 py-2 font-medium w-24 text-right">Abs. non payées (j)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((emp) => {
                  const v = varFor(emp.id);
                  return (
                    <tr key={emp.id}>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">{emp.last_name} {emp.first_name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{emp.employee_number}</div>
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min={0} step={0.5} className="w-full rounded-md border border-slate-300 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                          value={v?.overtime_hours ?? 0} onChange={(e) => upsert(emp, 'overtime_hours', e.target.value)} />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min={0} step={500} className="w-full rounded-md border border-slate-300 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                          value={v?.bonuses ?? 0} onChange={(e) => upsert(emp, 'bonuses', e.target.value)} />
                      </td>
                      <td className="px-3 py-2">
                        <input className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                          placeholder="ex. Prime de rendement" value={v?.bonus_label ?? ''} onChange={(e) => upsert(emp, 'bonus_label', e.target.value)} />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min={0} step={0.5} className="w-full rounded-md border border-slate-300 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                          value={v?.unpaid_absence_days ?? 0} onChange={(e) => upsert(emp, 'unpaid_absence_days', e.target.value)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400">
            Les absences non payées issues des congés validés (type « sans solde ») s’ajoutent automatiquement au calcul.
            Les primes annuelles (menu Primes) s’ajoutent au brut du cycle ; elles ne remplacent pas ce champ.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">Annuler</button>
            <button type="submit" disabled={busy} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition">
              {busy ? 'Enregistrement…' : 'Enregistrer les variables'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-bold text-slate-900 mt-1">{formatXof(value)}</div>
    </div>
  );
}

function NewPeriodModal({ existing, onClose, onSaved }: {
  existing: PayrollPeriod[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { activeOrg, session } = useSession();
  const now = new Date();
  const defaultMonth = now.getMonth() + 1;
  const defaultYear = now.getFullYear();
  const [month, setMonth] = useState(defaultMonth);
  const [year, setYear] = useState(defaultYear);
  const months = useMemo(
    () => MONTHS.map((label, i) => ({ value: i + 1, label, taken: existing.some((p) => p.period_year === year && p.period_month === i + 1) })),
    [existing, year],
  );
  const { busy, error, run } = useAsyncAction();

  useEffect(() => {
    const selected = months.find((m) => m.value === month);
    const firstAvailable = months.find((m) => !m.taken);
    if (selected?.taken && firstAvailable) setMonth(firstAvailable.value);
  }, [months, month]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (!activeOrg) return;
      const dup = existing.some((p) => p.period_year === year && p.period_month === month);
      if (dup) throw new Error('Un cycle existe déjà pour ce mois.');
      const { data, error: err } = await supabase
        .from('payroll_periods')
        .insert({ org_id: activeOrg.id, period_year: year, period_month: month, status: 'open' })
        .select('id')
        .single();
      if (err) throw new Error(err.message);
      await supabase.from('audit_log').insert({
        org_id: activeOrg.id,
        actor: session?.user.id ?? null,
        action: 'create_payroll_period',
        entity: 'payroll_periods',
        entity_id: data.id,
        details: { periode: monthLabel(year, month) },
      });
      onSaved(data.id);
    }).catch(() => {});
  };

  return (
    <Modal open onClose={onClose} title="Nouveau cycle de paie" subtitle="Un cycle mensuel, de la saisie au verrouillage.">
      <ErrorBanner message={error} />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Mois">
            <select className={inputClass} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {months.map((m) => (
                <option key={m.value} value={m.value} disabled={m.taken}>
                  {m.label}{m.taken ? ' (existe)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Année">
            <input type="number" className={inputClass} value={year} min={2020} max={2100} onChange={(e) => setYear(Number(e.target.value))} />
          </Field>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">Annuler</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition">
            {busy ? 'Création…' : 'Créer le cycle'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AnnualRecapModal({ orgId, org, onClose }: { orgId: string; org: Org; onClose: () => void }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState<AnnualRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: periodData } = await supabase
      .from('payroll_periods').select('id').eq('org_id', orgId).eq('period_year', year);
    const ids = (periodData ?? []).map((p: { id: string }) => p.id);
    if (ids.length === 0) { setRows([]); setLoading(false); return; }
    const { data: lineData } = await supabase
      .from('payroll_lines').select('*, employee:employees!employee_id(*)').in('period_id', ids);
    const byEmp = new Map<string, AnnualRow>();
    for (const l of (lineData ?? []) as PayrollLine[]) {
      const emp = l.employee;
      const key = l.employee_id;
      const cur = byEmp.get(key) ?? {
        name: emp ? `${emp.last_name} ${emp.first_name}` : '—',
        number: emp?.employee_number ?? '',
        gross: 0, cnps: 0, cmu: 0, its: 0, net: 0, employer: 0,
      };
      cur.gross += Number(l.gross);
      cur.cnps += Number(l.cnps_employee);
      cur.cmu += Number(l.cmu_employee);
      cur.its += Number(l.its);
      cur.net += Number(l.net);
      cur.employer += Number(l.employer_total);
      byEmp.set(key, cur);
    }
    setRows(Array.from(byEmp.values()).sort((a, b) => a.name.localeCompare(b.name)));
    setLoading(false);
  }, [orgId, year]);

  useEffect(() => { load(); }, [load]);

  const totals = rows.reduce((a, r) => ({
    gross: a.gross + r.gross, cnps: a.cnps + r.cnps, cmu: a.cmu + r.cmu,
    its: a.its + r.its, net: a.net + r.net, employer: a.employer + r.employer,
  }), { gross: 0, cnps: 0, cmu: 0, its: 0, net: 0, employer: 0 });

  const exportCsv = () => {
    downloadCsv(
      `recapitulatif-annuel-${year}.csv`,
      ['Matricule', 'Salarié', 'Brut annuel', 'CNPS salarié', 'CMU salarié', 'ITS', 'Net annuel', 'Charges employeur'],
      [
        ...rows.map((r) => [r.number, r.name, r.gross, r.cnps, r.cmu, r.its, r.net, r.employer]),
        ['', 'TOTAL', totals.gross, totals.cnps, totals.cmu, totals.its, totals.net, totals.employer],
      ],
    );
  };

  const exportPdf = () => openPrintDocument(`Récapitulatif annuel ${year}`, annualRecapHtml(org, year, rows));

  return (
    <Modal open onClose={onClose} wide title="Récapitulatif annuel des salaires"
      subtitle="Cumul des salaires et retenues sur l’année — pour préparer la déclaration fiscale annuelle (simulation).">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input type="number" min={2020} max={2100}
            className="w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            value={year} onChange={(e) => setYear(Number(e.target.value))} />
          {rows.length > 0 && (
            <>
              <button onClick={exportCsv} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition inline-flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" /> Export tableur
              </button>
              <button onClick={exportPdf} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition inline-flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" /> Export PDF
              </button>
            </>
          )}
        </div>

        {loading ? <Spinner /> : rows.length === 0 ? (
          <EmptyState icon={<CalendarRange className="w-6 h-6" />} title="Aucun bulletin sur cette année"
            description="Calculez au moins un cycle de paie pour alimenter le récapitulatif annuel." />
        ) : (
          <div className="rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
                  <th className="px-3 py-2 font-semibold">Salarié</th>
                  <th className="px-3 py-2 font-semibold text-right">Brut</th>
                  <th className="px-3 py-2 font-semibold text-right hidden sm:table-cell">CNPS</th>
                  <th className="px-3 py-2 font-semibold text-right hidden sm:table-cell">CMU</th>
                  <th className="px-3 py-2 font-semibold text-right">ITS</th>
                  <th className="px-3 py-2 font-semibold text-right">Net</th>
                  <th className="px-3 py-2 font-semibold text-right hidden md:table-cell">Charges empl.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.number + r.name}>
                    <td className="px-3 py-2 font-medium text-slate-900">{r.name}<div className="text-[11px] text-slate-400 font-mono">{r.number}</div></td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatXof(r.gross)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500 hidden sm:table-cell">{formatXof(r.cnps)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500 hidden sm:table-cell">{formatXof(r.cmu)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{formatXof(r.its)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-teal-700">{formatXof(r.net)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500 hidden md:table-cell">{formatXof(r.employer)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatXof(totals.gross)}</td>
                  <td className="px-3 py-2 text-right tabular-nums hidden sm:table-cell">{formatXof(totals.cnps)}</td>
                  <td className="px-3 py-2 text-right tabular-nums hidden sm:table-cell">{formatXof(totals.cmu)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatXof(totals.its)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-teal-700">{formatXof(totals.net)}</td>
                  <td className="px-3 py-2 text-right tabular-nums hidden md:table-cell">{formatXof(totals.employer)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}

function DetailModal({ line, details, onClose }: { line: PayrollLine; details: PayrollDetail[]; onClose: () => void }) {
  const groups: Array<{ key: PayrollDetail['category']; title: string; tone: string }> = [
    { key: 'gain', title: 'Gains', tone: 'text-emerald-700' },
    { key: 'retenue_salarie', title: 'Retenues salariales', tone: 'text-rose-700' },
    { key: 'impot', title: 'Impôts', tone: 'text-rose-700' },
    { key: 'charge_employeur', title: 'Charges patronales', tone: 'text-sky-700' },
  ];

  return (
    <Modal open onClose={onClose} title="Détail du bulletin (simulation)" wide
      subtitle={`${line.employee ? `${line.employee.last_name} ${line.employee.first_name}` : ''} — chaque ligne montre la règle utilisée et sa source.`}>
      <div className="space-y-5">
        {groups.map((g) => {
          const rows = details.filter((d) => d.category === g.key);
          if (rows.length === 0) return null;
          return (
            <div key={g.key}>
              <h4 className={`text-sm font-semibold ${g.tone} mb-2`}>{g.title}</h4>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-left text-slate-500">
                      <th className="px-3 py-2 font-medium">Libellé</th>
                      <th className="px-3 py-2 font-medium text-right">Base</th>
                      <th className="px-3 py-2 font-medium text-right">Taux</th>
                      <th className="px-3 py-2 font-medium text-right">Montant</th>
                      <th className="px-3 py-2 font-medium hidden sm:table-cell">Règle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((d) => (
                      <tr key={d.id}>
                        <td className="px-3 py-2 text-slate-800">{d.label}</td>
                        <td className="px-3 py-2 text-right text-slate-500">{d.calc_base != null ? formatXof(d.calc_base) : '—'}</td>
                        <td className="px-3 py-2 text-right text-slate-500">{d.rate != null ? `${d.rate} %` : '—'}</td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-900">{formatXof(d.amount)}</td>
                        <td className="px-3 py-2 text-slate-400 hidden sm:table-cell">
                          {d.rule_code ? `${d.rule_code} (v${d.rule_version})` : 'saisie'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        <div className="rounded-xl bg-teal-50 border border-teal-200 p-4 flex items-center justify-between">
          <span className="text-sm font-semibold text-teal-900">Net à payer</span>
          <span className="text-xl font-bold text-teal-800">{formatXof(line.net)}</span>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <ShieldCheck className="w-4 h-4" />
          Empreinte du bulletin : {line.fingerprint ? `${line.fingerprint.slice(0, 16)}…` : '—'}
        </div>
      </div>
    </Modal>
  );
}
