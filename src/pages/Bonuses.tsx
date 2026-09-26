import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session';
import {
  Employee, EmployeeBonus, PayrollPeriod, BonusKind, formatXof, monthLabel, statusLabel, STATUS_COLORS,
} from '../lib/types';
import {
  BONUS_KINDS, bonusKindLabel, canApproveBonus, canCancelBonus, canGrantBonus, canScheduleBonus,
} from '../lib/bonuses';
import { ErrorBanner, Field, Modal, Spinner, EmptyState, inputClass, useAsyncAction } from '../components/ui';
import { Award, Plus } from 'lucide-react';

export function BonusesPage() {
  const { activeOrg, activeRole, myEmployee } = useSession();
  const [rows, setRows] = useState<EmployeeBonus[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const { busy, error: actionError, run } = useAsyncAction();

  const isEmployeeOnly = activeRole === 'employee';
  const year = new Date().getFullYear();

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    setError(null);
    let bonusQuery = supabase
      .from('employee_bonuses')
      .select('*, employee:employees!employee_id(*)')
      .eq('org_id', activeOrg.id)
      .order('created_at', { ascending: false });
    if (isEmployeeOnly && myEmployee) {
      bonusQuery = bonusQuery.eq('employee_id', myEmployee.id);
    }
    const [bonusRes, empRes, perRes] = await Promise.all([
      bonusQuery,
      isEmployeeOnly
        ? Promise.resolve({ data: [], error: null })
        : supabase.from('employees').select('*').eq('org_id', activeOrg.id).eq('status', 'active').order('last_name'),
      supabase.from('payroll_periods').select('*').eq('org_id', activeOrg.id).eq('status', 'open').order('period_month'),
    ]);
    if (bonusRes.error) {
      setError(bonusRes.error.message.includes('schema cache') || bonusRes.error.code === 'PGRST205'
        ? 'Primes annuelles indisponibles tant que la migration 013 n’est pas appliquée.'
        : bonusRes.error.message);
      setRows([]);
    } else {
      setRows((bonusRes.data ?? []) as EmployeeBonus[]);
    }
    setEmployees((empRes.data ?? []) as Employee[]);
    setPeriods((perRes.data ?? []) as PayrollPeriod[]);
    setLoading(false);
  }, [activeOrg, isEmployeeOnly, myEmployee]);

  useEffect(() => { load(); }, [load]);

  const call = (name: string, args: Record<string, unknown>) =>
    run(async () => {
      const { error: err } = await supabase.rpc(name, args);
      if (err) throw new Error(err.message);
      await load();
    });

  if (!activeOrg) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Primes annuelles</h1>
          <p className="text-sm text-slate-500 mt-1">
            Attribution depuis le portail, versement sur un cycle ouvert. Le montant entre dans le brut du mois (CNSS / IUTS).
          </p>
        </div>
        {canGrantBonus(activeRole) && (
          <button
            onClick={() => setGrantOpen(true)}
            className="rounded-lg bg-teal-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-700 inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Attribuer une prime
          </button>
        )}
      </div>

      <ErrorBanner message={error ?? actionError} />

      {loading ? (
        <Spinner label="Chargement des primes…" />
      ) : rows.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200">
          <EmptyState
            icon={<Award className="w-6 h-6" />}
            title={isEmployeeOnly ? 'Aucune prime pour le moment' : 'Aucune prime annuelle'}
            description={canGrantBonus(activeRole)
              ? 'Attribuez une prime de performance ou un 13e mois, puis rattachez-la à un cycle de paie ouvert.'
              : 'Les primes validées apparaîtront ici, puis sur votre bulletin du mois de versement.'}
          />
        </div>
      ) : (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 font-semibold">Salarié</th>
                  <th className="px-4 py-3 font-semibold">Année</th>
                  <th className="px-4 py-3 font-semibold hidden md:table-cell">Type</th>
                  <th className="px-4 py-3 font-semibold">Montant</th>
                  <th className="px-4 py-3 font-semibold">Statut</th>
                  <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const emp = row.employee;
                  return (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">
                          {emp ? `${emp.last_name} ${emp.first_name}` : row.employee_id.slice(0, 8)}
                        </div>
                        <div className="text-xs text-slate-400">{row.label}</div>
                        {row.reason && <div className="text-xs text-slate-500 mt-0.5">{row.reason}</div>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.year}</td>
                      <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{bonusKindLabel(row.kind)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{formatXof(row.amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${STATUS_COLORS[row.status] ?? STATUS_COLORS.draft}`}>
                          {statusLabel(row.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                        {row.status === 'draft' && canApproveBonus(activeRole) && (
                          <button disabled={busy} onClick={() => { void call('approve_employee_bonus', { p_bonus_id: row.id }).catch(() => {}); }} className="text-xs font-medium text-teal-700 hover:underline">
                            Valider
                          </button>
                        )}
                        {(row.status === 'approved' || row.status === 'scheduled') && canScheduleBonus(activeRole) && (
                          <button disabled={busy} onClick={() => setScheduleId(row.id)} className="text-xs font-medium text-teal-700 hover:underline">
                            Verser sur un cycle
                          </button>
                        )}
                        {row.status !== 'paid' && row.status !== 'cancelled' && canCancelBonus(activeRole) && (
                          <button disabled={busy} onClick={() => { void call('cancel_employee_bonus', { p_bonus_id: row.id }).catch(() => {}); }} className="text-xs font-medium text-rose-600 hover:underline">
                            Annuler
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {grantOpen && (
        <GrantBonusModal
          employees={employees}
          defaultYear={year}
          busy={busy}
          error={actionError}
          onClose={() => setGrantOpen(false)}
          onSubmit={async (payload) => {
            try {
              await call('grant_employee_bonus', payload);
              setGrantOpen(false);
            } catch {
              /* error shown by useAsyncAction */
            }
          }}
        />
      )}

      {scheduleId && (
        <ScheduleBonusModal
          periods={periods}
          busy={busy}
          error={actionError}
          onClose={() => setScheduleId(null)}
          onSubmit={async (periodId) => {
            try {
              await call('schedule_employee_bonus', { p_bonus_id: scheduleId, p_period_id: periodId });
              setScheduleId(null);
            } catch {
              /* error shown by useAsyncAction */
            }
          }}
        />
      )}
    </div>
  );
}

function GrantBonusModal({
  employees, defaultYear, busy, error, onClose, onSubmit,
}: {
  employees: Employee[];
  defaultYear: number;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? '');
  const [year, setYear] = useState(defaultYear);
  const [kind, setKind] = useState<BonusKind>('performance');
  const [amount, setAmount] = useState('150000');
  const [reason, setReason] = useState('');
  const kindMeta = BONUS_KINDS.find((k) => k.id === kind)!;

  return (
    <Modal open onClose={onClose} title="Attribuer une prime annuelle"
      subtitle="Le manager propose ; l’administrateur RH valide. Le versement se fait ensuite sur un cycle ouvert.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            p_employee: employeeId,
            p_year: year,
            p_kind: kind,
            p_label: kindMeta.label,
            p_amount: Number(amount),
            p_reason: reason.trim() || null,
          });
        }}
      >
        <ErrorBanner message={error} />
        <Field label="Salarié">
          <select className={inputClass} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.last_name} {emp.first_name} · {emp.employee_number}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Année">
            <input type="number" min={2020} max={2100} className={inputClass} value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </Field>
          <Field label="Montant (FCFA)">
            <input type="number" min={1} step={1} className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </Field>
        </div>
        <Field label="Type">
          <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as BonusKind)}>
            {BONUS_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </Field>
        <Field label="Motif (optionnel)">
          <input className={inputClass} placeholder="Ex. Objectifs 2026 dépassés" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <p className="text-xs text-slate-500">
          La prime est imposée le mois du versement, comme une prime mensuelle. Elle s’ajoute aux variables du cycle, elle ne les remplace pas.
        </p>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Annuler</button>
          <button type="submit" disabled={busy || !employeeId} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">Enregistrer</button>
        </div>
      </form>
    </Modal>
  );
}

function ScheduleBonusModal({
  periods, busy, error, onClose, onSubmit,
}: {
  periods: PayrollPeriod[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (periodId: string) => void;
}) {
  const [periodId, setPeriodId] = useState(periods[0]?.id ?? '');
  return (
    <Modal open onClose={onClose} title="Verser sur un cycle"
      subtitle="Le montant sera ajouté au brut lors du prochain calcul de pré-paie.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (periodId) onSubmit(periodId);
        }}
      >
        <ErrorBanner message={error} />
        {periods.length === 0 ? (
          <p className="text-sm text-slate-600">Aucun cycle ouvert. Créez ou rouvrez un cycle en pré-paie.</p>
        ) : (
          <Field label="Cycle ouvert">
            <select className={inputClass} value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>{monthLabel(p.period_year, p.period_month)}</option>
              ))}
            </select>
          </Field>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Annuler</button>
          <button type="submit" disabled={busy || !periodId} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">Rattacher</button>
        </div>
      </form>
    </Modal>
  );
}
