import { ROLE_LABELS, type AuditLogEntry } from './types';

/** Libellés métier des actions tracées (SQL + client). */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  create_org: 'Création de l’organisation',
  update_org: 'Modification de l’organisation',
  create_demo_org: 'Création de l’espace de démonstration',
  seed_demo: 'Chargement du jeu de démonstration',
  reset_demo: 'Remise à zéro de la démonstration',
  cleanup_demo_clones: 'Nettoyage des fiches en double',
  create_invite: 'Invitation créée',
  redeem_invite: 'Invitation acceptée',
  claim_employee: 'Rattachement compte ↔ fiche salarié',
  create_employee: 'Création d’un salarié',
  update_employee: 'Modification d’un salarié',
  import_employees: 'Import de salariés',
  correct_clock_entry: 'Correction de pointage',
  update_time_settings: 'Réglages du temps de travail',
  switch_project_timer: 'Changement de projet (chronomètre)',
  finalize_project_timer: 'Arrêt du chronomètre projet',
  approve_leave: 'Congé approuvé',
  reject_leave: 'Congé refusé',
  approve_timesheet: 'Feuille de temps approuvée',
  reject_timesheet: 'Feuille de temps rejetée',
  submit_monthly_sheet: 'Feuille mensuelle soumise',
  validate_monthly_sheet: 'Feuille mensuelle validée',
  reject_monthly_sheet: 'Feuille mensuelle rejetée',
  create_payroll_period: 'Création d’un cycle de paie',
  update_payroll_variables: 'Saisie des variables de paie',
  compute_payroll: 'Calcul de la pré-paie',
  approve_payroll: 'Validation de la paie (4 yeux)',
  lock_payroll: 'Verrouillage du cycle',
  reopen_payroll: 'Réouverture du cycle',
  grant_bonus: 'Prime attribuée',
  approve_bonus: 'Prime validée',
  schedule_bonus: 'Prime rattachée à un cycle',
  cancel_bonus: 'Prime annulée',
  create_payment_batch: 'Lot de paiement créé',
  email_payslips: 'Envoi des bulletins par e-mail',
  request_plan: 'Demande d’abonnement',
  update_performance_settings: 'Réglages du module performance',
  open_performance_cycle: 'Cycle de performance ouvert',
  set_performance_cycle_status: 'Cycle de performance : changement d’étape',
  reopen_performance_cycle: 'Cycle de performance rouvert',
  set_objective: 'Objectif fixé',
  delete_objective: 'Objectif retiré',
  report_objective: 'Résultat déclaré par le salarié',
  validate_objective: 'Objectif validé',
  compute_performance: 'Calcul des scores de performance',
  award_recognition: 'Badge attribué',
  dismiss_recognition: 'Proposition de badge écartée',
  propose_performance_bonus: 'Prime de performance proposée',
  propose_perk: 'Avantage proposé',
  decide_perk: 'Avantage : décision RH',
  consume_perk: 'Avantage consommé',
  seed_performance_demo: 'Chargement du jeu de démonstration performance',
};

const ENTITY_LABELS: Record<string, string> = {
  orgs: 'Organisation',
  org_settings: 'Paramètres',
  org_invites: 'Invitations',
  org_subscriptions: 'Abonnement',
  memberships: 'Accès',
  employees: 'Salariés',
  clock_entries: 'Pointages',
  project_timers: 'Chronomètre',
  leave_requests: 'Congés',
  timesheet_entries: 'Feuilles de temps',
  payroll_periods: 'Cycle de paie',
  payroll_variables: 'Variables de paie',
  payroll_lines: 'Bulletins',
  employee_bonuses: 'Primes',
  payment_batches: 'Paiements',
  performance_cycles: 'Cycles de performance',
  performance_settings: 'Réglages performance',
  employee_objectives: 'Objectifs',
  employee_recognitions: 'Badges',
  employee_perks: 'Avantages',
};

const DETAIL_LABELS: Record<string, string> = {
  kind: 'type',
  country_code: 'pays',
  role: 'rôle',
  status: 'statut',
  bulletins: 'bulletins',
  bulletins_supprimes: 'bulletins supprimés',
  lignes: 'lignes',
  periode: 'période',
  count: 'nombre',
  amount: 'montant',
  amount_xof: 'montant',
  plan: 'offre',
  removed: 'supprimées',
  from_project: 'de',
  to_project: 'vers',
  reason: 'motif',
  total: 'total',
  sent: 'envoyés',
  failed: 'échecs',
  employee: 'salarié',
  badge: 'badge',
  title: 'titre',
  target: 'cible',
  weight_pct: 'poids (%)',
  scores: 'scores',
  decision: 'décision',
  from: 'de',
  to: 'vers',
  reported: 'déclaré',
  validated: 'validé',
  consumed: 'consommé',
  total_consumed: 'total consommé',
  achieved: 'atteint',
  label: 'cycle',
};

const VALUE_LABELS: Record<string, string> = {
  pme: 'PME',
  ong: 'ONG',
  groupe: 'Groupe',
  NE: 'Niger',
  CI: 'Côte d’Ivoire',
  ...ROLE_LABELS,
  approved: 'approuvé',
  rejected: 'refusé',
  locked: 'verrouillé',
  calculated: 'calculé',
};

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
const TECHNICAL_KEYS = new Set(['period_id', 'employee_id', 'invite_id', 'user_id', 'org_id', 'kept', 'dropped', 'finished_at', 'code']);

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action.replace(/_/g, ' ');
}

export function auditEntityLabel(entity: string): string {
  return ENTITY_LABELS[entity] ?? entity;
}

function formatValue(key: string, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    const n = value.toLocaleString('fr-FR');
    return key.startsWith('amount') ? `${n} FCFA` : n;
  }
  if (typeof value === 'boolean') return value ? 'oui' : 'non';
  if (Array.isArray(value)) return value.length ? value.map(String).join(', ') : null;
  if (typeof value === 'object') return null;
  const s = String(value);
  if (UUID_RE.test(s)) return null;
  return VALUE_LABELS[s] ?? s;
}

/** Résumé lisible des détails d’une entrée (jamais de JSON brut à l’écran). */
export function formatAuditDetails(details: AuditLogEntry['details']): string {
  if (!details) return '—';
  const parts: string[] = [];
  const year = details.period_year ?? details.year;
  const month = details.period_month;
  if (typeof month === 'number' && month >= 1 && month <= 12) {
    parts.push(`${MONTHS[month - 1]}${year ? ` ${year}` : ''}`);
  } else if (year) {
    parts.push(`année ${year}`);
  }
  for (const [key, raw] of Object.entries(details)) {
    if (TECHNICAL_KEYS.has(key) || key === 'period_year' || key === 'period_month' || key === 'year') continue;
    const value = formatValue(key, raw);
    if (value === null) continue;
    const label = DETAIL_LABELS[key] ?? key.replace(/_/g, ' ');
    parts.push(`${label} : ${value}`);
  }
  return parts.length ? parts.join(' · ') : '—';
}
