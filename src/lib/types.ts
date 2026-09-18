export type Role =
  | 'admin_rh'
  | 'manager'
  | 'preparateur'
  | 'approveur_paie'
  | 'employee'
  | 'auditeur';

export const ROLE_LABELS: Record<Role, string> = {
  admin_rh: 'Administrateur RH',
  manager: 'Responsable d’équipe',
  preparateur: 'Préparateur de paie',
  approveur_paie: 'Approbateur paie',
  employee: 'Salarié',
  auditeur: 'Auditeur (lecture seule)',
};

export interface Org {
  id: string;
  name: string;
  legal_name: string | null;
  ncc: string | null;
  currency: string;
  locale: string;
  timezone: string;
  is_demo: boolean;
  demo_kind: 'pme' | 'ong' | 'groupe' | null;
}

export interface Membership {
  id: string;
  org_id: string;
  role: Role;
  orgs: Org | Org[];
}

export interface Employee {
  id: string;
  org_id: string;
  user_id: string | null;
  employee_number: string;
  first_name: string;
  last_name: string;
  gender: 'F' | 'M' | null;
  birth_date: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  department_id: string | null;
  job_title: string | null;
  hire_date: string | null;
  status: 'active' | 'suspended' | 'archived';
  payment_method: 'mobile_money' | 'bank' | 'cash' | null;
  mobile_operator: string | null;
  payment_account: string | null;
}

export interface Department {
  id: string;
  org_id: string;
  name: string;
  code: string | null;
}

export interface Contract {
  id: string;
  org_id: string;
  employee_id: string;
  contract_type: 'CDI' | 'CDD' | 'ESSAI' | 'STAGE' | 'APPRENTISSAGE';
  start_date: string;
  end_date: string | null;
  base_salary: number;
  monthly_hours: number;
  is_current: boolean;
  notes: string | null;
}

export interface ClockEntry {
  id: string;
  org_id: string;
  employee_id: string;
  work_date: string;
  clock_in: string;
  clock_out: string | null;
  source: string;
  note: string | null;
  edited_by: string | null;
  edit_reason: string | null;
  last_active_at: string | null;
  active_seconds: number;
  closed_reason: 'manual' | 'auto_inactive' | null;
}

export type PayrollTimeBasis = 'gross' | 'active';

export interface OrgSettings {
  org_id: string;
  reminder_interval_minutes: number;
  grace_minutes: number;
  payroll_time_basis: PayrollTimeBasis;
  updated_at: string;
}

export const DEFAULT_ORG_SETTINGS: Omit<OrgSettings, 'org_id' | 'updated_at'> = {
  reminder_interval_minutes: 25,
  grace_minutes: 5,
  payroll_time_basis: 'gross',
};

export interface LeaveType {
  id: string;
  org_id: string;
  code: string;
  name: string;
  paid: boolean;
  annual_days: number;
}

export interface LeaveRequest {
  id: string;
  org_id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  employee?: Employee;
  leave_type?: LeaveType;
}

export interface Project {
  id: string;
  org_id: string;
  code: string | null;
  name: string;
  funder: string | null;
  active: boolean;
}

export interface TimesheetEntry {
  id: string;
  org_id: string;
  employee_id: string;
  project_id: string;
  work_date: string;
  hours: number;
  activity: string | null;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
  project?: Project;
  employee?: Employee;
}

export interface ProjectTimer {
  id: string;
  org_id: string;
  employee_id: string;
  project_id: string;
  started_at: string;
  note: string | null;
  project?: Project;
}

export interface PayrollRule {
  id: string;
  org_id: string;
  code: string;
  label: string;
  category: 'cotisation_salarie' | 'cotisation_employeur' | 'impot' | 'plafond' | 'abarissement' | 'autre';
  value: number;
  bracket_from: number | null;
  bracket_to: number | null;
  effective_from: string;
  active: boolean;
  version: number;
  source: string;
}

export interface PayrollPeriod {
  id: string;
  org_id: string;
  period_year: number;
  period_month: number;
  status: 'open' | 'prepared' | 'approved' | 'locked';
  prepared_by: string | null;
  prepared_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
}

export interface PayrollLine {
  id: string;
  org_id: string;
  period_id: string;
  employee_id: string;
  base_salary: number;
  worked_hours: number;
  overtime_hours: number;
  unpaid_absence_days: number;
  bonuses: number;
  gross: number;
  cnps_employee: number;
  cmu_employee: number;
  its: number;
  net: number;
  employer_cnps: number;
  employer_cmu: number;
  employer_fdfp: number;
  employer_total: number;
  status: 'calculated' | 'approved';
  fingerprint: string | null;
  employee?: Employee;
}

export interface PayrollDetail {
  id: string;
  org_id: string;
  line_id: string;
  category: 'gain' | 'retenue_salarie' | 'charge_employeur' | 'impot';
  label: string;
  calc_base: number | null;
  rate: number | null;
  amount: number;
  rule_code: string | null;
  rule_version: number | null;
  rule_source: string | null;
  position: number;
}

export interface AuditLogEntry {
  id: string;
  org_id: string;
  actor: string | null;
  actor_email: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface PayrollVariable {
  id: string;
  org_id: string;
  period_id: string;
  employee_id: string;
  overtime_hours: number;
  bonuses: number;
  bonus_label: string | null;
  unpaid_absence_days: number;
  notes: string | null;
}

export interface OrgInvite {
  id: string;
  org_id: string;
  code: string;
  role: Role;
  active: boolean;
  created_at: string;
}

export function formatXof(amount: number | null | undefined): string {
  const n = Number(amount ?? 0);
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n) + ' FCFA';
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

export const ROLE_COLORS: Record<Role, string> = {
  admin_rh: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  manager: 'bg-sky-50 text-sky-700 ring-sky-200',
  preparateur: 'bg-amber-50 text-amber-700 ring-amber-200',
  approveur_paie: 'bg-orange-50 text-orange-700 ring-orange-200',
  employee: 'bg-slate-100 text-slate-700 ring-slate-200',
  auditeur: 'bg-stone-100 text-stone-600 ring-stone-200',
};

export const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
  cancelled: 'bg-slate-100 text-slate-600 ring-slate-200',
  draft: 'bg-slate-100 text-slate-600 ring-slate-200',
  submitted: 'bg-amber-50 text-amber-700 ring-amber-200',
  open: 'bg-sky-50 text-sky-700 ring-sky-200',
  prepared: 'bg-amber-50 text-amber-700 ring-amber-200',
  locked: 'bg-slate-800 text-white ring-slate-800',
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  suspended: 'bg-amber-50 text-amber-700 ring-amber-200',
  archived: 'bg-slate-100 text-slate-600 ring-slate-200',
  calculated: 'bg-sky-50 text-sky-700 ring-sky-200',
};

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: 'En attente',
    approved: 'Approuvé',
    rejected: 'Refusé',
    cancelled: 'Annulé',
    draft: 'Brouillon',
    submitted: 'Soumis',
    open: 'Ouverte',
    prepared: 'Calculée',
    locked: 'Verrouillée',
    active: 'Actif',
    suspended: 'Suspendu',
    archived: 'Archivé',
    calculated: 'Calculé',
  };
  return map[status] ?? status;
}
