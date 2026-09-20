import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session';
import {
  Employee, Department, Contract, formatXof, statusLabel, STATUS_COLORS,
} from '../lib/types';
import { parseEmployeeCsv, employeeImportTemplateCsv } from '../lib/employeeImport';
import { Modal, Field, inputClass, ErrorBanner, Spinner, EmptyState, useAsyncAction } from '../components/ui';
import { Users, Plus, Search, Pencil, Download, Upload } from 'lucide-react';

export function EmployeesPage() {
  const { activeOrg, activeRole, session } = useSession();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Employee | 'new' | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const canEdit = activeRole === 'admin_rh';

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    const [emp, dep, ctr] = await Promise.all([
      supabase.from('employees').select('*').eq('org_id', activeOrg.id).order('last_name'),
      supabase.from('departments').select('*').eq('org_id', activeOrg.id).order('name'),
      supabase.from('contracts').select('*').eq('org_id', activeOrg.id).eq('is_current', true),
    ]);
    setEmployees((emp.data ?? []) as Employee[]);
    setDepartments((dep.data ?? []) as Department[]);
    setContracts((ctr.data ?? []) as Contract[]);
    setLoading(false);
  }, [activeOrg]);

  useEffect(() => {
    if (activeOrg) load();
  }, [activeOrg, load]);

  if (!activeOrg) return null;

  const filtered = employees.filter((e) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [e.first_name, e.last_name, e.employee_number, e.job_title]
      .some((v) => (v ?? '').toLowerCase().includes(q));
  });

  const exportCsv = () => {
    const header = ['Matricule', 'Nom', 'Prénoms', 'Poste', 'Service', 'Contrat', 'Salaire de base', 'Statut'];
    const rows = filtered.map((emp) => {
      const c = contracts.find((x) => x.employee_id === emp.id);
      const d = departments.find((x) => x.id === emp.department_id);
      return [
        emp.employee_number,
        emp.last_name,
        emp.first_name,
        emp.job_title ?? '',
        d?.name ?? '',
        c?.contract_type ?? 'Aucun contrat',
        c ? String(c.base_salary) : '',
        String(emp.status),
      ];
    });
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${v.split('"').join('""')}"`).join(';'))
      .join('\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'salaries.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadTemplate = () => {
    const csv = employeeImportTemplateCsv(activeOrg?.country_code);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modele-import-salaries.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImportFile = async (file: File) => {
    if (!activeOrg || !canEdit) return;
    setImportBusy(true);
    setImportError(null);
    try {
      const text = await file.text();
      const { rows, errors } = parseEmployeeCsv(text, activeOrg.country_code);
      if (errors.length && rows.length === 0) {
        setImportError(errors.join(' '));
        return;
      }
      for (const row of rows) {
        const { data: existing } = await supabase
          .from('employees')
          .select('id')
          .eq('org_id', activeOrg.id)
          .eq('employee_number', row.employee_number)
          .maybeSingle();
        let empId = existing?.id as string | undefined;
        if (empId) {
          const { error: empErr } = await supabase.from('employees').update({
            last_name: row.last_name,
            first_name: row.first_name,
            job_title: row.job_title,
            phone: row.phone,
            email: row.email,
            payment_method: row.payment_method,
            mobile_operator: row.mobile_operator,
            payment_account: row.payment_account,
            hire_date: row.hire_date,
          }).eq('id', empId);
          if (empErr) throw new Error(empErr.message);
        } else {
          const { data: emp, error: empErr } = await supabase
            .from('employees')
            .insert({
              org_id: activeOrg.id,
              employee_number: row.employee_number,
              last_name: row.last_name,
              first_name: row.first_name,
              job_title: row.job_title,
              phone: row.phone,
              email: row.email,
              payment_method: row.payment_method,
              mobile_operator: row.mobile_operator,
              payment_account: row.payment_account,
              hire_date: row.hire_date,
              status: 'active',
            })
            .select('id')
            .single();
          if (empErr) throw new Error(empErr.message);
          empId = emp.id;
        }
        if (empId && row.base_salary != null && row.contract_type) {
          await supabase.from('contracts').update({ is_current: false }).eq('employee_id', empId).eq('is_current', true);
          await supabase.from('contracts').insert({
            org_id: activeOrg.id,
            employee_id: empId,
            contract_type: row.contract_type,
            start_date: row.hire_date || new Date().toISOString().slice(0, 10),
            base_salary: row.base_salary,
            monthly_hours: 173.33,
            is_current: true,
          });
        }
      }
      await supabase.from('audit_log').insert({
        org_id: activeOrg.id,
        actor: session?.user.id ?? null,
        action: 'import_employees',
        entity: 'employees',
        details: { count: rows.length, warnings: errors },
      });
      await load();
      if (errors.length) setImportError(`Import partiel : ${rows.length} lignes OK. ${errors.slice(0, 3).join(' ')}`);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Import impossible.');
    } finally {
      setImportBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Salariés</h1>
          <p className="text-sm text-slate-500 mt-1">Dossiers du personnel, contrats et coordonnées de paiement.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportCsv} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition inline-flex items-center gap-2">
            <Download className="w-4 h-4" /> Exporter
          </button>
          {canEdit && (
            <>
              <button onClick={downloadTemplate} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition inline-flex items-center gap-2">
                <Download className="w-4 h-4" /> Modèle Excel/CSV
              </button>
              <button
                disabled={importBusy}
                onClick={() => fileRef.current?.click()}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition inline-flex items-center gap-2 disabled:opacity-50"
              >
                <Upload className="w-4 h-4" /> {importBusy ? 'Import…' : 'Importer CSV'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onImportFile(f);
                }}
              />
              <button onClick={() => setEditing('new')} className="rounded-lg bg-teal-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition inline-flex items-center gap-2">
                <Plus className="w-4 h-4" /> Ajouter un salarié
              </button>
            </>
          )}
        </div>
      </div>

      <ErrorBanner message={importError} />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          placeholder="Rechercher un salarié…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200">
          <EmptyState
            icon={<Users className="w-6 h-6" />}
            title={search ? 'Aucun salarié trouvé' : 'Aucun salarié enregistré'}
            description={canEdit
              ? 'Créez le premier dossier salarié pour démarrer.'
              : 'Votre administrateur RH n’a pas encore créé de dossiers salariés.'}
          />
        </div>
      ) : (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 font-semibold">Matricule</th>
                  <th className="px-4 py-3 font-semibold">Salarié</th>
                  <th className="px-4 py-3 font-semibold hidden md:table-cell">Poste</th>
                  <th className="px-4 py-3 font-semibold hidden lg:table-cell">Service</th>
                  <th className="px-4 py-3 font-semibold hidden lg:table-cell">Salaire de base</th>
                  <th className="px-4 py-3 font-semibold">Statut</th>
                  {canEdit && <th className="px-4 py-3"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((emp) => {
                  const c = contracts.find((x) => x.employee_id === emp.id);
                  const dept = departments.find((d) => d.id === emp.department_id);
                  return (
                    <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{emp.employee_number}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{emp.last_name} {emp.first_name}</div>
                        <div className="text-xs text-slate-400">{emp.email ?? emp.phone ?? '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{emp.job_title ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">{dept?.name ?? '—'}</td>
                      <td className="px-4 py-3 font-medium text-slate-900 hidden lg:table-cell">
                        {c ? formatXof(c.base_salary) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${STATUS_COLORS[emp.status]}`}>
                          {statusLabel(emp.status)}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setEditing(emp)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-teal-700 hover:bg-teal-50 transition"
                            aria-label="Modifier"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && activeRole === 'admin_rh' && (
        <EmployeeModal
          employee={editing === 'new' ? null : editing}
          departments={departments}
          orgId={activeOrg.id}
          currentUserId={session?.user.id ?? null}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function EmployeeModal({ employee, departments, orgId, currentUserId, onClose, onSaved }: {
  employee: Employee | null;
  departments: Department[];
  orgId: string;
  currentUserId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    employee_number: employee?.employee_number ?? '',
    first_name: employee?.first_name ?? '',
    last_name: employee?.last_name ?? '',
    gender: employee?.gender ?? '',
    birth_date: employee?.birth_date ?? '',
    phone: employee?.phone ?? '',
    email: employee?.email ?? '',
    address: employee?.address ?? '',
    department_id: employee?.department_id ?? '',
    job_title: employee?.job_title ?? '',
    hire_date: employee?.hire_date ?? '',
    status: employee?.status ?? 'active',
    payment_method: employee?.payment_method ?? 'mobile_money',
    mobile_operator: employee?.mobile_operator ?? '',
    payment_account: employee?.payment_account ?? '',
    contract_type: 'CDI',
    base_salary: 75000,
    monthly_hours: 173.33,
  });
  const { busy, error, run } = useAsyncAction();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const employeeNumber = form.employee_number.trim();
      const firstName = form.first_name.trim();
      const lastName = form.last_name.trim();
      if (!employeeNumber || !firstName || !lastName) {
        throw new Error('Matricule, nom et prénoms sont obligatoires.');
      }

      const baseSalary = Number(form.base_salary);
      const monthlyHours = Number(form.monthly_hours);
      if (!employee && (!Number.isFinite(baseSalary) || baseSalary <= 0)) {
        throw new Error('Le salaire de base du premier contrat doit être supérieur à zéro.');
      }
      if (!employee && (!Number.isFinite(monthlyHours) || monthlyHours <= 0)) {
        throw new Error('Les heures mensuelles du premier contrat doivent être supérieures à zéro.');
      }

      const payload = {
        org_id: orgId,
        employee_number: employeeNumber,
        first_name: firstName,
        last_name: lastName,
        gender: form.gender || null,
        birth_date: form.birth_date || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        department_id: form.department_id || null,
        job_title: form.job_title.trim() || null,
        hire_date: form.hire_date || null,
        status: form.status,
        payment_method: form.payment_method || null,
        mobile_operator: form.payment_method === 'mobile_money' ? form.mobile_operator.trim() || null : null,
        payment_account: form.payment_method === 'cash' ? null : form.payment_account.trim() || null,
      };

      let employeeId: string;
      if (employee) {
        const { error: err } = await supabase.from('employees').update(payload).eq('id', employee.id);
        if (err) throw new Error(err.message);
        employeeId = employee.id;
      } else {
        const { data: created, error: err } = await supabase
          .from('employees')
          .insert({ ...payload, org_id: orgId })
          .select()
          .maybeSingle();
        if (err) throw new Error(err.message);
        if (!created) throw new Error('Création impossible : vérifiez que le matricule est unique.');
        employeeId = created.id;
      }

      if (!employee) {
        const contractStartDate = form.hire_date || (() => {
          const today = new Date();
          return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        })();
        const { error: contractError } = await supabase.from('contracts').insert({
          org_id: orgId,
          employee_id: employeeId,
          contract_type: form.contract_type,
          start_date: contractStartDate,
          base_salary: baseSalary,
          monthly_hours: monthlyHours,
          is_current: true,
        });
        if (contractError) {
          const { error: rollbackError } = await supabase
            .from('employees')
            .delete()
            .eq('id', employeeId)
            .eq('org_id', orgId);
          if (rollbackError) {
            throw new Error(`Le salarié a été créé mais son contrat n’a pas pu être enregistré : ${contractError.message}. Nettoyage impossible : ${rollbackError.message}`);
          }
          throw new Error(`Le contrat initial n’a pas pu être enregistré : ${contractError.message}`);
        }
      }

      await supabase.from('audit_log').insert({
        org_id: orgId,
        actor: currentUserId,
        action: employee ? 'update_employee' : 'create_employee',
        entity: 'employees',
        entity_id: employeeId,
        details: { matricule: form.employee_number, nom: `${form.last_name} ${form.first_name}` },
      });

      onSaved();
    }).catch(() => {});
  };

  return (
    <Modal open onClose={onClose} title={employee ? 'Modifier le dossier' : 'Nouveau salarié'} wide
      subtitle="Les coordonnées de paiement sont sensibles : toute modification est enregistrée au journal.">
      <ErrorBanner message={error} />
      <form onSubmit={submit} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Matricule">
            <input className={inputClass} value={form.employee_number} onChange={(e) => setForm({ ...form, employee_number: e.target.value })} required placeholder="EMP-001" />
          </Field>
          <Field label="Date d’embauche">
            <input type="date" className={inputClass} value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} />
          </Field>
          <Field label="Nom">
            <input className={inputClass} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required />
          </Field>
          <Field label="Prénoms">
            <input className={inputClass} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required />
          </Field>
          <Field label="Poste">
            <input className={inputClass} value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} placeholder="Comptable" />
          </Field>
          <Field label="Service">
            <select className={inputClass} value={form.department_id ?? ''} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
              <option value="">— Aucun —</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="Téléphone">
            <input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+225 07 00 00 00 00" />
          </Field>
          <Field label="E-mail">
            <input type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
        </div>

        {!employee && (
          <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4">
            <h4 className="text-sm font-semibold text-slate-900 mb-3">Premier contrat</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Type">
                <select className={inputClass} value={form.contract_type} onChange={(e) => setForm({ ...form, contract_type: e.target.value })}>
                  {['CDI', 'CDD', 'ESSAI', 'STAGE', 'APPRENTISSAGE'].map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Salaire de base mensuel (FCFA)">
                <input type="number" min={0} step={500} className={inputClass} value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: Number(e.target.value) })} required />
              </Field>
              <Field label="Heures mensuelles">
                <input type="number" step={0.01} min={1} className={inputClass} value={form.monthly_hours} onChange={(e) => setForm({ ...form, monthly_hours: Number(e.target.value) })} />
              </Field>
            </div>
          </div>
        )}

        <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
          <h4 className="text-sm font-semibold text-slate-900 mb-3">Coordonnées de paiement</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Moyen">
              <select className={inputClass} value={form.payment_method ?? 'mobile_money'} onChange={(e) => setForm({ ...form, payment_method: e.target.value as 'mobile_money' | 'bank' | 'cash' })}>
                <option value="mobile_money">Mobile Money</option>
                <option value="bank">Virement bancaire</option>
                <option value="cash">Espèces</option>
              </select>
            </Field>
            {form.payment_method === 'mobile_money' && (
              <Field label="Opérateur">
                <select className={inputClass} value={form.mobile_operator} onChange={(e) => setForm({ ...form, mobile_operator: e.target.value })}>
                  <option value="">Choisir…</option>
                  <option>Orange Money</option>
                  <option>MTN MoMo</option>
                  <option>Moov Money</option>
                  <option>Wave</option>
                </select>
              </Field>
            )}
            {form.payment_method !== 'cash' && (
              <Field label={form.payment_method === 'bank' ? 'RIB / Numéro de compte' : 'Numéro Mobile Money'}>
                <input className={inputClass} value={form.payment_account} onChange={(e) => setForm({ ...form, payment_account: e.target.value })} />
              </Field>
            )}
          </div>
        </div>

        {employee && (
          <Field label="Statut du dossier">
            <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Employee['status'] })}>
              <option value="active">Actif</option>
              <option value="suspended">Suspendu</option>
              <option value="archived">Archivé</option>
            </select>
          </Field>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
            Annuler
          </button>
          <button type="submit" disabled={busy} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition">
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
