import { describe, expect, it } from 'vitest';
import { canAccessPage } from './access';
import {
  canConfigurePerformance, canManagePerformance, defaultCycleRange, isPerformanceReadOnly,
  objectiveAttainment, topSlots,
} from './performance';

describe('performance access', () => {
  it('opens the page to staff, employee and read-only roles, not to payroll roles', () => {
    for (const role of ['admin_rh', 'manager', 'employee', 'auditeur', 'cabinet'] as const) {
      expect(canAccessPage('performance', role)).toBe(true);
    }
    expect(canAccessPage('performance', 'preparateur')).toBe(false);
    expect(canAccessPage('performance', 'approveur_paie')).toBe(false);
    expect(canAccessPage('performance', null)).toBe(false);
  });

  it('keeps writes to RH and managers, settings to RH, and the cabinet read-only', () => {
    expect(canManagePerformance('manager')).toBe(true);
    expect(canManagePerformance('cabinet')).toBe(false);
    expect(canManagePerformance('employee')).toBe(false);
    expect(canConfigurePerformance('admin_rh')).toBe(true);
    expect(canConfigurePerformance('manager')).toBe(false);
    expect(isPerformanceReadOnly('cabinet')).toBe(true);
    expect(isPerformanceReadOnly('auditeur')).toBe(true);
    expect(isPerformanceReadOnly('manager')).toBe(false);
  });
});

describe('objectiveAttainment (mirrors the SQL function)', () => {
  it('measures higher-is-better objectives against the target, capped at 200 %', () => {
    expect(objectiveAttainment('higher', 100, 80)).toBe(80);
    expect(objectiveAttainment('higher', 100, 130)).toBe(130);
    expect(objectiveAttainment('higher', 100, 500)).toBe(200);
    expect(objectiveAttainment('higher', 0, 3)).toBe(100);
  });

  it('measures lower-is-better objectives', () => {
    expect(objectiveAttainment('lower', 4, 3)).toBe(100);
    expect(objectiveAttainment('lower', 4, 0)).toBe(100);
    expect(objectiveAttainment('lower', 4, 8)).toBe(50);
    expect(objectiveAttainment('lower', 0, 2)).toBe(0);
  });

  it('returns null while nothing is reported', () => {
    expect(objectiveAttainment('higher', 100, null)).toBeNull();
  });
});

describe('topSlots', () => {
  it('keeps at least the first person of a small department, then the first tenth rounded up', () => {
    expect(topSlots(1)).toBe(1);
    expect(topSlots(6)).toBe(1);
    expect(topSlots(10)).toBe(1);
    expect(topSlots(11)).toBe(2);
    expect(topSlots(25)).toBe(3);
  });
});

describe('defaultCycleRange', () => {
  it('derives a quarter and a month from a reference date', () => {
    expect(defaultCycleRange('quarter', new Date(2026, 7, 14))).toEqual({ start: '2026-07-01', end: '2026-09-30', label: 'T3 2026' });
    expect(defaultCycleRange('month', new Date(2026, 1, 3))).toEqual({ start: '2026-02-01', end: '2026-02-28', label: 'Février 2026' });
    expect(defaultCycleRange('semester', new Date(2026, 8, 1)).start).toBe('2026-07-01');
    expect(defaultCycleRange('year', new Date(2026, 8, 1)).end).toBe('2026-12-31');
  });
});
