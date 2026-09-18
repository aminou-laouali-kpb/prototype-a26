import type { Role } from './types';

export const PAGE_ROLES = {
  salaries: ['admin_rh', 'manager', 'preparateur', 'approveur_paie', 'auditeur'],
  feuilles: ['admin_rh', 'manager', 'employee', 'auditeur'],
  paie: ['admin_rh', 'preparateur', 'approveur_paie', 'auditeur'],
  bulletins: ['employee', 'manager', 'admin_rh'],
  parametres: ['admin_rh', 'preparateur'],
  audit: ['admin_rh', 'auditeur'],
} as const satisfies Record<string, readonly Role[]>;

export type GuardedPage = keyof typeof PAGE_ROLES;

export function canAccessPage(page: GuardedPage, role: Role | null): boolean {
  if (!role) return false;
  return (PAGE_ROLES[page] as readonly Role[]).includes(role);
}
