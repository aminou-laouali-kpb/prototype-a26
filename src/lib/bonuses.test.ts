import { describe, expect, it } from 'vitest';
import { canAccessPage } from './access';
import { canApproveBonus, canCancelBonus, canGrantBonus, canScheduleBonus } from './bonuses';

describe('annual bonus portal access', () => {
  it('lets RH and managers grant, only RH approve, RH or preparer schedule', () => {
    expect(canGrantBonus('admin_rh')).toBe(true);
    expect(canGrantBonus('manager')).toBe(true);
    expect(canGrantBonus('employee')).toBe(false);
    expect(canApproveBonus('manager')).toBe(false);
    expect(canApproveBonus('admin_rh')).toBe(true);
    expect(canScheduleBonus('preparateur')).toBe(true);
    expect(canScheduleBonus('manager')).toBe(false);
    expect(canCancelBonus('admin_rh')).toBe(true);
    expect(canCancelBonus('preparateur')).toBe(false);
  });

  it('opens the primes page for staff and the employee', () => {
    expect(canAccessPage('primes', 'admin_rh')).toBe(true);
    expect(canAccessPage('primes', 'employee')).toBe(true);
    expect(canAccessPage('primes', null)).toBe(false);
  });
});
