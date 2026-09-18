import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session';
import {
  PayrollLine, PayrollPeriod, PayrollDetail, Org, Employee,
  formatXof, monthLabel, formatDate, statusLabel, STATUS_COLORS,
} from '../lib/types';
import { Modal, ErrorBanner, Spinner, EmptyState, SimulationNotice } from '../components/ui';
import { openPrintDocument, payslipHtml } from '../lib/documents';
import { Fingerprint, FileText, Download } from 'lucide-react';

export function PayslipsPage() {
  const { session, myEmployee: sessionEmployee, activeOrg } = useSession();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [lines, setLines] = useState<PayrollLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ line: PayrollLine; details: PayrollDetail[]; period: PayrollPeriod | null } | null>(null);
  const orgId = activeOrg?.id;
  const userId = session?.user.id;

  const load = useCallback(async () => {
    if (!orgId || !userId) {
      setEmployee(null);
      setLines([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
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
        setLines([]);
        return;
      }
      const { data, error: err } = await supabase
        .from('payroll_lines')
        // A calculated line is not a published bulletin.
        .select('*, period:payroll_periods!inner(*)')
        .eq('org_id', orgId)
        .eq('employee_id', scopedEmployee.id)
        .in('period.status', ['approved', 'locked'])
        .order('created_at', { ascending: false });
      if (err) throw new Error(err.message);
      setLines((data ?? []) as unknown as PayrollLine[]);
    } catch (e) {
      setEmployee(null);
      setLines([]);
      setError(e instanceof Error ? e.message : 'Chargement des bulletins impossible.');
    } finally {
      setLoading(false);
    }
  }, [orgId, userId, sessionEmployee]);

  useEffect(() => { load(); }, [load]);

  const open = async (l: PayrollLine) => {
    const period = (l as unknown as { period?: PayrollPeriod }).period ?? null;
    if (!period || !orgId) {
      setError('Ce bulletin n’est plus associé à un cycle publié.');
      return;
    }
    const { data, error: detailsError } = await supabase
      .from('payroll_details')
      .select('*')
      .eq('org_id', orgId)
      .eq('line_id', l.id)
      .order('position');
    if (detailsError) {
      setError(detailsError.message);
      return;
    }
    setViewing({ line: l, details: (data ?? []) as PayrollDetail[], period });
  };

  if (loading) return <Spinner label="Chargement des bulletins…" />;

  if (!employee) {
    return (
      <>
        <ErrorBanner message={error} />
        <div className="rounded-2xl bg-white ring-1 ring-slate-200">
          <EmptyState
            icon={<Fingerprint className="w-6 h-6" />}
            title="Aucune fiche salarié liée à cette organisation"
            description="Demandez à votre administrateur RH de rattacher votre compte à votre fiche dans cette organisation."
          />
        </div>
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mes bulletins</h1>
        <p className="text-sm text-slate-500 mt-1">Vos bulletins de pré-paie, consultables, imprimables et vérifiables.</p>
      </div>
      <SimulationNotice />
      <ErrorBanner message={error} />

      {loading ? (
        <Spinner />
      ) : lines.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200">
          <EmptyState
            icon={<FileText className="w-6 h-6" />}
            title="Aucun bulletin pour l’instant"
            description="Vos bulletins apparaîtront ici dès qu’un cycle de paie sera validé et publié."
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lines.map((l) => {
            const period = (l as unknown as { period?: PayrollPeriod }).period;
            return (
              <button
                key={l.id}
                onClick={() => open(l)}
                className="text-left rounded-2xl bg-white ring-1 ring-slate-200 p-5 hover:ring-teal-400 hover:shadow-md transition"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-slate-900">
                      {period ? monthLabel(period.period_year, period.period_month) : 'Cycle'}
                    </span>
                    {period && <span className={`ml-2 inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 ${STATUS_COLORS[period.status]}`}>{statusLabel(period.status)}</span>}
                  </div>
                  <Fingerprint className="w-4 h-4 text-slate-300" />
                </div>
                <div className="mt-3 text-2xl font-bold text-teal-700">{formatXof(l.net)}</div>
                <div className="text-xs text-slate-400 mt-1">
                  Brut {formatXof(l.gross)} · Retenues {formatXof(Number(l.cnps_employee) + Number(l.cmu_employee) + Number(l.its))}
                </div>
                <div className="mt-3 inline-flex items-center gap-1 text-xs text-teal-700 font-medium">
                  Voir le détail
                </div>
              </button>
            );
          })}
        </div>
      )}

      {viewing && (
        <PayslipModal
          data={viewing}
          org={activeOrg}
          employee={employee}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

function PayslipModal({ data, org, employee, onClose }: {
  data: { line: PayrollLine; details: PayrollDetail[]; period: PayrollPeriod | null };
  org: Org | null;
  employee: Employee;
  onClose: () => void;
}) {
  const { line, details, period } = data;
  const gains = details.filter((d) => d.category === 'gain');
  const retenues = details.filter((d) => d.category === 'retenue_salarie' || d.category === 'impot');
  const charges = details.filter((d) => d.category === 'charge_employeur');

  const downloadPdf = () => {
    openPrintDocument(
      `Bulletin ${period ? monthLabel(period.period_year, period.period_month) : ''}`,
      payslipHtml(org, employee, line, details, period),
    );
  };

  return (
    <Modal open onClose={onClose} wide title={`Bulletin — ${period ? monthLabel(period.period_year, period.period_month) : ''}`}
      subtitle="Document de simulation — empreinte vérifiable.">
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Employeur</span>
            <span className="font-medium text-slate-900">{org?.name ?? '—'}</span>
          </div>
          {org?.ncc && (
            <div className="flex justify-between mt-1">
              <span className="text-slate-500">NCC</span>
              <span className="font-medium text-slate-900">{org.ncc}</span>
            </div>
          )}
          <div className="flex justify-between mt-1">
            <span className="text-slate-500">Salarié</span>
            <span className="font-medium text-slate-900">{employee.last_name} {employee.first_name} ({employee.employee_number})</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-slate-500">Poste</span>
            <span className="font-medium text-slate-900">{employee.job_title ?? '—'}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-slate-500">Embauché le</span>
            <span className="font-medium text-slate-900">{formatDate(employee.hire_date)}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-slate-500">Période</span>
            <span className="font-medium text-slate-900">{period ? monthLabel(period.period_year, period.period_month) : '—'}</span>
          </div>
        </div>

        <Section title="Gains" rows={gains} />
        <Section title="Retenues et impôts" rows={retenues} />
        {charges.length > 0 && <Section title="Charges patronales (employeur)" rows={charges} />}

        <div className="rounded-xl bg-teal-50 border border-teal-200 p-4 flex items-center justify-between">
          <span className="text-sm font-semibold text-teal-900">Net à payer</span>
          <span className="text-xl font-bold text-teal-800">{formatXof(line.net)}</span>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <Fingerprint className="w-4 h-4" />
            Empreinte : {line.fingerprint ? `${line.fingerprint.slice(0, 24)}…` : '—'}
          </span>
          <button onClick={downloadPdf} className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-600 hover:bg-slate-50 transition inline-flex items-center gap-1.5">
            <Download className="w-4 h-4" /> Télécharger en PDF
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Section({ title, rows }: { title: string; rows: PayrollDetail[] }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h4 className="text-sm font-semibold text-slate-700 mb-2">{title}</h4>
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-xs">
          <tbody className="divide-y divide-slate-100">
            {rows.map((d) => (
              <tr key={d.id}>
                <td className="px-3 py-2 text-slate-800">{d.label}</td>
                <td className="px-3 py-2 text-right text-slate-500">{d.rate != null ? `${d.rate} %` : ''}</td>
                <td className="px-3 py-2 text-right font-semibold text-slate-900">{formatXof(d.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
