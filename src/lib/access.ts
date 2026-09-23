import type { Role } from './types';

export const PAGE_ROLES = {
  salaries: ['admin_rh', 'manager', 'preparateur', 'approveur_paie', 'auditeur', 'cabinet'],
  feuilles: ['admin_rh', 'manager', 'employee', 'auditeur', 'cabinet'],
  paie: ['admin_rh', 'preparateur', 'approveur_paie', 'auditeur', 'cabinet'],
  bulletins: ['employee', 'manager', 'admin_rh'],
  parametres: ['admin_rh', 'preparateur', 'cabinet'],
  audit: ['admin_rh', 'auditeur', 'cabinet'],
  paiements: ['admin_rh', 'preparateur', 'approveur_paie', 'auditeur', 'cabinet'],
  abonnement: ['admin_rh', 'cabinet'],
} as const satisfies Record<string, readonly Role[]>;

export type GuardedPage = keyof typeof PAGE_ROLES;

export function canAccessPage(page: GuardedPage, role: Role | null): boolean {
  if (!role) return false;
  return (PAGE_ROLES[page] as readonly Role[]).includes(role);
}
