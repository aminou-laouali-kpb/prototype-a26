import { describe, expect, it } from 'vitest';
import { COUNTRY_PACKS, getCountryPack, payrollColumnLabels } from './countryPacks';
import { computePayslip, type ComputeInput } from './payroll';
import type { PayrollRule } from './types';
import { parseEmployeeCsv } from './employeeImport';

function rulesFromPack(code: 'CI' | 'NE'): PayrollRule[] {
  return COUNTRY_PACKS[code].rules.map((r) => ({
    id: r.code,
    org_id: 'org',
    code: r.code,
    label: r.label,
    category: r.category,
    value: r.value,
    bracket_from: r.bracket_from,
    bracket_to: r.bracket_to,
    effective_from: '2026-01-01',
    active: true,
    version: 1,
    source: 'test',
  }));
}

const FULL_MONTH: ComputeInput = {
  baseSalary: 200000,
  monthlyHours: 173.33,
  workedHours: 173.33,
  overtimeHours: 0,
  unpaidAbsenceDays: 0,
  monthlyCalendarDays: 30,
  bonuses: 0,
  effectiveDate: '2026-09-30',
};

describe('country packs', () => {
  it('defaults unknown codes to Niger', () => {
    expect(getCountryPack(null).code).toBe('NE');
    expect(getCountryPack('XX').socialShort).toBe('CNSS');
  });

  it('exposes CI and NE labels', () => {
    expect(payrollColumnLabels(COUNTRY_PACKS.CI).tax).toBe('ITS');
    expect(payrollColumnLabels(COUNTRY_PACKS.NE).tax).toBe('IUTS');
    expect(payrollColumnLabels(COUNTRY_PACKS.NE).socialEmployee).toContain('CNSS');
  });
});

describe('Niger payroll engine', () => {
  it('balances net = brut − cotisations − IUTS', () => {
    const rules = rulesFromPack('NE');
    const result = computePayslip(FULL_MONTH, rules, () => 1, () => 'test');
    expect(result.net).toBeCloseTo(
      result.gross - result.cnpsEmployee - result.cmuEmployee - result.its,
      1,
    );
    expect(result.details.some((d) => d.label.includes('CNSS'))).toBe(true);
    expect(result.details.some((d) => d.label.includes('IUTS') || d.category === 'impot')).toBe(true);
  });

  it('keeps Côte d’Ivoire pack compatible', () => {
    const rules = rulesFromPack('CI');
    const result = computePayslip(FULL_MONTH, rules, () => 1, () => 'test');
    expect(result.details.some((d) => d.label.includes('CNPS'))).toBe(true);
  });
});

describe('employee CSV import', () => {
  it('parses a francophone Excel-style CSV', () => {
    const csv = 'Matricule;Nom;Prénoms;Salaire_de_base;Moyen_paiement;Operateur\nE1;SAIDOU;Ibrahim;180000;mobile_money;Airtel Money\n';
    const { rows, errors } = parseEmployeeCsv(csv, 'NE');
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].last_name).toBe('SAIDOU');
    expect(rows[0].base_salary).toBe(180000);
    expect(rows[0].mobile_operator).toBe('Airtel Money');
  });
});
