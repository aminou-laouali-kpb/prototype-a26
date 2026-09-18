import { describe, expect, it } from 'vitest';
import {
  buildRuleMap,
  computePayslip,
  getPayrollPeriodDates,
  prorateLeaveDays,
  selectApplicableRules,
  type ComputeInput,
} from './payroll';
import type { PayrollRule } from './types';

function rule(partial: Partial<PayrollRule> & Pick<PayrollRule, 'code' | 'category' | 'value'>): PayrollRule {
  return {
    id: partial.code,
    org_id: 'org',
    label: partial.label ?? partial.code,
    bracket_from: null,
    bracket_to: null,
    effective_from: '2026-01-01',
    active: true,
    version: 1,
    source: 'test',
    ...partial,
  };
}

const SIMULATION_RULES: PayrollRule[] = [
  rule({ code: 'cnps_pension_tx_salarie', category: 'cotisation_salarie', value: 6.3 }),
  rule({ code: 'cnps_pension_tx_employeur', category: 'cotisation_employeur', value: 7.7 }),
  rule({ code: 'cnps_pf_tx_employeur', category: 'cotisation_employeur', value: 5.75 }),
  rule({ code: 'cnps_at_tx_employeur', category: 'cotisation_employeur', value: 2 }),
  rule({ code: 'cnps_rp_tx_employeur', category: 'cotisation_employeur', value: 1 }),
  rule({ code: 'fdfp_tx_employeur', category: 'cotisation_employeur', value: 1.4 }),
  rule({ code: 'fdfp_tx_plan', category: 'abarissement', value: 0.4 }),
  rule({ code: 'cmu_tx_salarie', category: 'cotisation_salarie', value: 1 }),
  rule({ code: 'cmu_tx_employeur', category: 'cotisation_employeur', value: 4 }),
  rule({ code: 'plafond_mensuel', category: 'plafond', value: 70000 }),
  rule({ code: 'smig_mensuel', category: 'plafond', value: 75000 }),
  rule({ code: 'taux_heures_supp', category: 'autre', value: 125 }),
  rule({ code: 'its_t1_tx', category: 'impot', value: 0, bracket_from: 0, bracket_to: 50000, label: 'ITS t1' }),
  rule({ code: 'its_t2_tx', category: 'impot', value: 10, bracket_from: 50000, bracket_to: 290000, label: 'ITS t2' }),
  rule({ code: 'its_t3_tx', category: 'impot', value: 15, bracket_from: 290000, bracket_to: 530000, label: 'ITS t3' }),
  rule({ code: 'its_t4_tx', category: 'impot', value: 25, bracket_from: 530000, bracket_to: null, label: 'ITS t4' }),
];

const FULL_MONTH: ComputeInput = {
  baseSalary: 300000,
  monthlyHours: 173.33,
  workedHours: 173.33,
  overtimeHours: 0,
  unpaidAbsenceDays: 0,
  monthlyCalendarDays: 30,
  bonuses: 0,
  effectiveDate: '2026-09-30',
};

describe('getPayrollPeriodDates', () => {
  it('covers a 31-day month', () => {
    expect(getPayrollPeriodDates(2026, 1)).toEqual({
      start: '2026-01-01',
      end: '2026-01-31',
      calendarDays: 31,
    });
  });

  it('handles February in a leap year', () => {
    expect(getPayrollPeriodDates(2024, 2)).toEqual({
      start: '2024-02-01',
      end: '2024-02-29',
      calendarDays: 29,
    });
  });

  it('rejects an invalid month', () => {
    expect(() => getPayrollPeriodDates(2026, 13)).toThrow('Période de paie invalide.');
  });
});

describe('prorateLeaveDays', () => {
  it('returns the declared days when the leave sits inside the period', () => {
    expect(prorateLeaveDays(3, '2026-09-10', '2026-09-12', '2026-09-01', '2026-09-30')).toBe(3);
  });

  it('prorates a leave that overlaps the month boundary', () => {
    expect(prorateLeaveDays(10, '2026-08-27', '2026-09-05', '2026-09-01', '2026-09-30')).toBe(5);
  });

  it('returns 0 when there is no overlap', () => {
    expect(prorateLeaveDays(2, '2026-08-01', '2026-08-02', '2026-09-01', '2026-09-30')).toBe(0);
  });
});

describe('selectApplicableRules', () => {
  it('keeps the latest effective version of each code', () => {
    const selected = selectApplicableRules([
      rule({ code: 'cmu_tx_salarie', category: 'cotisation_salarie', value: 1, effective_from: '2025-01-01', version: 1 }),
      rule({ code: 'cmu_tx_salarie', category: 'cotisation_salarie', value: 1.5, effective_from: '2026-01-01', version: 2 }),
      rule({ code: 'cmu_tx_salarie', category: 'cotisation_salarie', value: 9, effective_from: '2027-01-01', version: 3 }),
    ], '2026-09-30');
    expect(selected).toHaveLength(1);
    expect(selected[0].value).toBe(1.5);
  });
});

describe('computePayslip', () => {
  const version = (code: string) => SIMULATION_RULES.find((item) => item.code === code)?.version ?? null;
  const source = (code: string) => SIMULATION_RULES.find((item) => item.code === code)?.source ?? null;

  it('balances net = brut − CNPS − CMU − ITS for a full month', () => {
    const result = computePayslip(FULL_MONTH, SIMULATION_RULES, version, source);
    expect(result.gross).toBe(300000);
    expect(result.cnpsEmployee).toBe(4410);
    expect(result.cmuEmployee).toBe(3000);
    expect(result.its).toBe(24388.5);
    expect(result.net).toBe(268201.5);
    expect(result.net).toBe(result.gross - result.cnpsEmployee - result.cmuEmployee - result.its);
    expect(result.employerCnps).toBe(31640);
    expect(result.employerCmu).toBe(12000);
    expect(result.employerFdfp).toBe(5400);
    expect(result.employerTotal).toBe(49040);
  });

  it('does not add clock absence and unpaid leave together', () => {
    const byClock = computePayslip(
      { ...FULL_MONTH, workedHours: 173.33 - 173.33 * 2 / 30, unpaidAbsenceDays: 0 },
      SIMULATION_RULES,
      version,
      source,
    );
    const byLeave = computePayslip(
      { ...FULL_MONTH, unpaidAbsenceDays: 2 },
      SIMULATION_RULES,
      version,
      source,
    );
    const both = computePayslip(
      { ...FULL_MONTH, workedHours: 173.33 - 173.33 * 2 / 30, unpaidAbsenceDays: 2 },
      SIMULATION_RULES,
      version,
      source,
    );
    expect(both.gross).toBe(byClock.gross);
    expect(both.gross).toBe(byLeave.gross);
    expect(both.gross).toBeLessThan(FULL_MONTH.baseSalary);
  });

  it('adds overtime at 125 % and bonuses to the gross', () => {
    const result = computePayslip(
      { ...FULL_MONTH, overtimeHours: 10, bonuses: 20000 },
      SIMULATION_RULES,
      version,
      source,
    );
    const hourly = 300000 / 173.33;
    const overtime = Math.round(hourly * 10 * 1.25 * 100) / 100;
    expect(result.gross).toBe(Math.round((300000 + overtime + 20000) * 100) / 100);
    expect(result.details.some((row) => row.label.startsWith('Heures supplémentaires'))).toBe(true);
    expect(result.details.some((row) => row.label === 'Primes et indemnités')).toBe(true);
  });

  it('rejects unpaid days beyond the calendar month', () => {
    expect(() => computePayslip(
      { ...FULL_MONTH, unpaidAbsenceDays: 31 },
      SIMULATION_RULES,
      version,
      source,
    )).toThrow('Nombre de jours d’absence non payée invalide.');
  });

  it('fails when a required rule is missing', () => {
    expect(() => buildRuleMap([])).not.toThrow();
    expect(() => computePayslip(FULL_MONTH, [], version, source)).toThrow(/Règle de paie manquante/);
  });
});
