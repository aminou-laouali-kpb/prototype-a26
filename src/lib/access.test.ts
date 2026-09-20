import { describe, expect, it } from 'vitest';
import { canAccessPage } from './access';

describe('canAccessPage', () => {
  it('lets payroll roles open pré-paie and blocks employees', () => {
    expect(canAccessPage('paie', 'admin_rh')).toBe(true);
    expect(canAccessPage('paie', 'approveur_paie')).toBe(true);
    expect(canAccessPage('paie', 'employee')).toBe(false);
  });

  it('keeps personal payslips away from auditors', () => {
    expect(canAccessPage('bulletins', 'employee')).toBe(true);
    expect(canAccessPage('bulletins', 'auditeur')).toBe(false);
  });

  it('lets cabinet open pré-paie and abonnement', () => {
    expect(canAccessPage('paie', 'cabinet')).toBe(true);
    expect(canAccessPage('abonnement', 'cabinet')).toBe(true);
    expect(canAccessPage('abonnement', 'employee')).toBe(false);
  });
});
