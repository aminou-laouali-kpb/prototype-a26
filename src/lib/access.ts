import type { Role } from './types';

/**
 * Qui ouvre quelle page. Doit rester aligné avec les politiques RLS
 * (hardening + 011/013 + 014) : le menu ne promet pas une page vide.
 *
 * cabinet = lecture type auditeur (014) + abonnement / paiements.
 * manager = équipe, pas les salaires ni la pré-paie.
 */
export const PAGE_ROLES = {
  salaries: ['admin_rh', 'manager', 'preparateur', 'approveur_paie', 'auditeur', 'cabinet'],
  feuilles: ['admin_rh', 'manager', 'employee', 'auditeur', 'cabinet'],
  paie: ['admin_rh', 'preparateur', 'approveur_paie', 'auditeur', 'cabinet'],
  bulletins: ['employee', 'manager', 'admin_rh'],
  parametres: ['admin_rh', 'preparateur', 'cabinet'],
  audit: ['admin_rh', 'auditeur', 'cabinet'],
  paiements: ['admin_rh', 'preparateur', 'approveur_paie', 'auditeur', 'cabinet'],
  abonnement: ['admin_rh', 'cabinet'],
  primes: ['admin_rh', 'manager', 'preparateur', 'approveur_paie', 'auditeur', 'cabinet', 'employee'],
  performance: ['admin_rh', 'manager', 'employee', 'auditeur', 'cabinet'],
} as const satisfies Record<string, readonly Role[]>;

export type GuardedPage = keyof typeof PAGE_ROLES;

export function canAccessPage(page: GuardedPage, role: Role | null): boolean {
  if (!role) return false;
  return (PAGE_ROLES[page] as readonly Role[]).includes(role);
}

/** Contrats / salaires : `a26_contracts_select_scoped` exclut manager et salarié. */
export function canSeeContractPay(role: Role | null): boolean {
  return !!role && role !== 'manager' && role !== 'employee';
}

export function canEditEmployees(role: Role | null): boolean {
  return role === 'admin_rh';
}

/** Écriture org_settings / payroll_rules. cabinet = lecture seule (014). */
export function canWriteSettings(role: Role | null): boolean {
  return role === 'admin_rh' || role === 'preparateur';
}

export function canManageBilling(role: Role | null): boolean {
  return role === 'admin_rh' || role === 'cabinet';
}

export function canPreparePayroll(role: Role | null): boolean {
  return role === 'admin_rh' || role === 'preparateur';
}

export function canApprovePayroll(role: Role | null): boolean {
  return role === 'admin_rh' || role === 'approveur_paie';
}

export function canLockPayroll(role: Role | null): boolean {
  return role === 'admin_rh';
}
