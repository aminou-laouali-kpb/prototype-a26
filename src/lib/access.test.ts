import { describe, expect, it } from 'vitest';
import {
  canAccessPage, canApprovePayroll, canEditEmployees, canLockPayroll,
  canManageBilling, canPreparePayroll, canSeeContractPay, canWriteSettings,
} from './access';

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

  it('opens primes for RH, manager and the employee', () => {
    expect(canAccessPage('primes', 'admin_rh')).toBe(true);
    expect(canAccessPage('primes', 'manager')).toBe(true);
    expect(canAccessPage('primes', 'employee')).toBe(true);
    expect(canAccessPage('primes', null)).toBe(false);
  });

  it('hides contract pay from managers and employees', () => {
    expect(canSeeContractPay('admin_rh')).toBe(true);
    expect(canSeeContractPay('cabinet')).toBe(true);
    expect(canSeeContractPay('manager')).toBe(false);
    expect(canSeeContractPay('employee')).toBe(false);
  });

  it('keeps settings writes off the cabinet role', () => {
    expect(canWriteSettings('admin_rh')).toBe(true);
    expect(canWriteSettings('preparateur')).toBe(true);
    expect(canWriteSettings('cabinet')).toBe(false);
    expect(canManageBilling('cabinet')).toBe(true);
    expect(canEditEmployees('manager')).toBe(false);
  });

  it('keeps four-eyes roles on payroll actions', () => {
    expect(canPreparePayroll('preparateur')).toBe(true);
    expect(canPreparePayroll('approveur_paie')).toBe(false);
    expect(canApprovePayroll('approveur_paie')).toBe(true);
    expect(canLockPayroll('preparateur')).toBe(false);
    expect(canLockPayroll('admin_rh')).toBe(true);
  });
});
