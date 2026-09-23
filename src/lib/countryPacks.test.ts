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

describe('locked 2026 official rates', () => {
  it('keeps the researched Niger CNSS / ANPE / IUTS / FAFPA / SMIG table', () => {
    const byCode = Object.fromEntries(COUNTRY_PACKS.NE.rules.map((r) => [r.code, r.value]));
    expect(byCode.cnps_pension_tx_salarie).toBe(5.25);
    expect(byCode.cnps_pension_tx_employeur).toBe(9.75);
    expect(byCode.cnps_pf_tx_employeur).toBe(4.9);
    expect(byCode.cnps_at_tx_employeur).toBe(1.75);
    expect(byCode.cnps_rp_tx_employeur).toBe(1);
    expect(byCode.fdfp_tx_employeur).toBe(3);
    expect(byCode.cmu_tx_salarie).toBe(0);
    expect(byCode.plafond_mensuel).toBe(500000);
    expect(byCode.smig_mensuel).toBe(42000);
    expect(byCode.its_on_gross).toBe(0);
    expect(byCode.its_t1_tx).toBe(1);
    expect(byCode.its_t9_tx).toBe(35);
  });

  it('keeps the researched Côte d’Ivoire CNPS / CMU / ITS / FDFP table', () => {
    const byCode = Object.fromEntries(COUNTRY_PACKS.CI.rules.map((r) => [r.code, r.value]));
    expect(byCode.cnps_pension_tx_salarie).toBe(6.3);
    expect(byCode.cnps_pension_tx_employeur).toBe(7.7);
    expect(byCode.cnps_pf_tx_employeur).toBe(5);
    expect(byCode.cnps_at_tx_employeur).toBe(2);
    expect(byCode.cnps_rp_tx_employeur).toBe(0.75);
    expect(byCode.fdfp_tx_employeur).toBe(1.2);
    expect(byCode.fdfp_tx_plan).toBe(0.4);
    expect(byCode.cmu_tx_salarie).toBe(500);
    expect(byCode.plafond_mensuel).toBe(3375000);
    expect(byCode.plafond_prestations).toBe(70000);
    expect(byCode.smig_mensuel).toBe(75000);
    expect(byCode.its_on_gross).toBe(1);
    expect(byCode.its_t1_tx).toBe(0);
    expect(byCode.its_t6_tx).toBe(32);
  });
});

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
  it('balances net = brut − cotisations − IUTS with 2026 official rates', () => {
    const rules = rulesFromPack('NE');
    const result = computePayslip(FULL_MONTH, rules, () => 1, () => 'test');
    expect(result.gross).toBe(200000);
    expect(result.cnpsEmployee).toBe(10500);
    expect(result.cmuEmployee).toBe(0);
    expect(result.its).toBe(20125);
    expect(result.net).toBe(169375);
    expect(result.net).toBeCloseTo(
      result.gross - result.cnpsEmployee - result.cmuEmployee - result.its,
      1,
    );
    expect(result.details.some((d) => d.label.includes('CNSS'))).toBe(true);
    expect(result.details.some((d) => d.label.includes('IUTS') || d.category === 'impot')).toBe(true);
    expect(COUNTRY_PACKS.NE.rules.find((r) => r.code === 'smig_mensuel')?.value).toBe(42000);
  });

  it('applies Côte d’Ivoire ITS on gross and CMU forfait 500 F', () => {
    const rules = rulesFromPack('CI');
    const result = computePayslip(FULL_MONTH, rules, () => 1, () => 'test');
    expect(result.cnpsEmployee).toBe(12600);
    expect(result.cmuEmployee).toBe(500);
    expect(result.its).toBe(20000);
    expect(result.net).toBe(166900);
    expect(result.details.some((d) => d.label.includes('CNPS'))).toBe(true);
    expect(result.employerCmu).toBe(500);
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
