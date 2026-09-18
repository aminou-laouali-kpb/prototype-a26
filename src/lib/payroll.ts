import type { PayrollRule, PayrollDetail } from './types';

const DATE_ONLY_LENGTH = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

function dateOnly(value: string): string {
  return value.slice(0, DATE_ONLY_LENGTH);
}

function parseDateOnly(value: string): number {
  const [year, month, day] = dateOnly(value).split('-').map(Number);
  if (![year, month, day].every(Number.isInteger)) return Number.NaN;
  return Date.UTC(year, month - 1, day);
}

function daysBetweenInclusive(startDate: string, endDate: string): number {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.floor((end - start) / DAY_MS) + 1;
}

export interface PayrollPeriodDates {
  start: string;
  end: string;
  calendarDays: number;
}

export function getPayrollPeriodDates(year: number, month: number): PayrollPeriodDates {
  if (!Number.isInteger(year) || year < 1 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('Période de paie invalide.');
  }
  const monthText = String(month).padStart(2, '0');
  const calendarDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${year}-${monthText}-01`,
    end: `${year}-${monthText}-${String(calendarDays).padStart(2, '0')}`,
    calendarDays,
  };
}

export function prorateLeaveDays(
  days: number,
  leaveStart: string,
  leaveEnd: string,
  periodStart: string,
  periodEnd: string,
): number {
  const totalLeaveDays = daysBetweenInclusive(leaveStart, leaveEnd);
  if (totalLeaveDays === 0) return 0;

  const overlapStart = Math.max(parseDateOnly(leaveStart), parseDateOnly(periodStart));
  const overlapEnd = Math.min(parseDateOnly(leaveEnd), parseDateOnly(periodEnd));
  if (!Number.isFinite(overlapStart) || !Number.isFinite(overlapEnd) || overlapEnd < overlapStart) return 0;

  const overlapDays = Math.floor((overlapEnd - overlapStart) / DAY_MS) + 1;
  const declaredDays = Number(days);
  if (!Number.isFinite(declaredDays) || declaredDays <= 0) return 0;
  return Math.round((declaredDays * overlapDays / totalLeaveDays) * 100) / 100;
}

export function selectApplicableRules(rules: PayrollRule[], effectiveDate?: string): PayrollRule[] {
  const asOf = effectiveDate ? dateOnly(effectiveDate) : '9999-12-31';
  const selected = new Map<string, PayrollRule>();

  for (const rule of rules) {
    if (!rule.active || dateOnly(rule.effective_from) > asOf) continue;
    const current = selected.get(rule.code);
    if (
      !current
      || dateOnly(rule.effective_from) > dateOnly(current.effective_from)
      || (
        dateOnly(rule.effective_from) === dateOnly(current.effective_from)
        && Number(rule.version) > Number(current.version)
      )
    ) {
      selected.set(rule.code, rule);
    }
  }

  return Array.from(selected.values());
}

export interface RuleMap {
  get: (code: string) => number;
}

export function buildRuleMap(rules: PayrollRule[]): RuleMap {
  const map = new Map<string, number>();
  for (const r of selectApplicableRules(rules)) {
    const value = Number(r.value);
    if (Number.isFinite(value)) map.set(r.code, value);
  }
  return {
    get: (code: string) => {
      const v = map.get(code);
      if (v === undefined) throw new Error(`Règle de paie manquante : ${code}. Ajoutez-la dans les Paramètres.`);
      return v;
    },
  };
}

export interface ComputeInput {
  baseSalary: number;
  monthlyHours: number;
  workedHours: number;
  overtimeHours: number;
  unpaidAbsenceDays: number;
  monthlyCalendarDays: number;
  bonuses: number;
  effectiveDate?: string;
}

export interface ComputeResult {
  gross: number;
  cnpsEmployee: number;
  cmuEmployee: number;
  its: number;
  net: number;
  employerCnps: number;
  employerCmu: number;
  employerFdfp: number;
  employerTotal: number;
  details: Array<Omit<PayrollDetail, 'id' | 'org_id' | 'line_id'>>;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function computePayslip(
  input: ComputeInput,
  rules: PayrollRule[],
  ruleVersion: (code: string) => number | null,
  ruleSource: (code: string) => string | null,
): ComputeResult {
  const applicableRules = selectApplicableRules(rules, input.effectiveDate);
  const rm = buildRuleMap(applicableRules);
  const details: ComputeResult['details'] = [];

  if (!Number.isFinite(input.baseSalary) || input.baseSalary < 0) throw new Error('Salaire de base invalide.');
  if (!Number.isFinite(input.monthlyHours) || input.monthlyHours <= 0) throw new Error('Heures mensuelles invalides.');
  if (!Number.isFinite(input.monthlyCalendarDays) || input.monthlyCalendarDays <= 0) throw new Error('Nombre de jours calendaires invalide.');
  if (!Number.isFinite(input.overtimeHours) || input.overtimeHours < 0) throw new Error('Heures supplémentaires invalides.');
  if (!Number.isFinite(input.unpaidAbsenceDays) || input.unpaidAbsenceDays < 0 || input.unpaidAbsenceDays > input.monthlyCalendarDays) {
    throw new Error('Nombre de jours d’absence non payée invalide.');
  }
  if (!Number.isFinite(input.bonuses) || input.bonuses < 0) throw new Error('Montant des primes invalide.');

  const findRule = (code: string) => applicableRules.find((rule) => rule.code === code);

  let pos = 0;
  const pushDetail = (
    category: PayrollDetail['category'],
    label: string,
    calcBase: number | null,
    rate: number | null,
    amount: number,
    ruleCode: string | null,
  ) => {
    details.push({
      category,
      label,
      calc_base: calcBase !== null ? round(calcBase) : null,
      rate: rate !== null ? round(rate * 10000) / 10000 : null,
      amount: round(amount),
      rule_code: ruleCode,
      rule_version: ruleCode ? findRule(ruleCode)?.version ?? ruleVersion(ruleCode) : null,
      rule_source: ruleCode ? findRule(ruleCode)?.source ?? ruleSource(ruleCode) : null,
      position: pos++,
    });
  };

  if (!Number.isFinite(input.workedHours) || input.workedHours < 0) {
    throw new Error('Nombre d’heures travaillées invalide.');
  }

  // A time-based payroll source and unpaid leave can describe the same
  // absence. Use the largest deduction instead of adding both, otherwise a
  // missing day would be charged once through the clock and a second time
  // through the leave request.
  const missingHours = Math.max(0, input.monthlyHours - input.workedHours);
  const leaveHours = input.monthlyHours * input.unpaidAbsenceDays / input.monthlyCalendarDays;
  const deductedHours = Math.min(input.monthlyHours, Math.max(missingHours, leaveHours));
  const absenceAmount = round(input.baseSalary * deductedHours / input.monthlyHours);
  const baseProrated = round(input.baseSalary - absenceAmount);

  pushDetail('gain', 'Salaire de base', input.baseSalary, null, input.baseSalary, null);
  if (absenceAmount > 0) {
    const label = missingHours > leaveHours
      ? `Proratisation du temps (${round(input.workedHours)} h / ${round(input.monthlyHours)} h)`
      : `Absence non payée (${input.unpaidAbsenceDays} j)`;
    pushDetail('retenue_salarie', label, input.baseSalary, null, absenceAmount, null);
  }

  // Heures supplémentaires — taux paramétrable simple (125 % par défaut)
  let overtimeRate = 125;
  const otRule = findRule('taux_heures_supp');
  if (otRule) overtimeRate = Number(otRule.value);
  const hourly = input.baseSalary / input.monthlyHours;
  const overtimeAmount = round(hourly * input.overtimeHours * (overtimeRate / 100));
  if (overtimeAmount > 0) {
    pushDetail('gain', `Heures supplémentaires (${input.overtimeHours} h à ${overtimeRate} %)`, input.baseSalary, overtimeRate, overtimeAmount, 'taux_heures_supp');
  }

  if (input.bonuses > 0) {
    pushDetail('gain', 'Primes et indemnités', null, null, round(input.bonuses), null);
  }

  const gross = round(baseProrated + overtimeAmount + input.bonuses);

  // CNPS : pension vieillesse sur brut plafonné
  const plafond = rm.get('plafond_mensuel');
  const taxableBase = Math.min(gross, plafond);
  const cnpsEmployee = round(taxableBase * (rm.get('cnps_pension_tx_salarie') / 100));
  pushDetail('retenue_salarie', 'CNPS pension vieillesse (plafonnée)', taxableBase, rm.get('cnps_pension_tx_salarie'), cnpsEmployee, 'cnps_pension_tx_salarie');

  const cmuEmployee = round(gross * (rm.get('cmu_tx_salarie') / 100));
  pushDetail('retenue_salarie', 'CMU (Couverture Maladie Universelle)', gross, rm.get('cmu_tx_salarie'), cmuEmployee, 'cmu_tx_salarie');

  const netBeforeTax = round(gross - cnpsEmployee - cmuEmployee);

  // Barème ITS progressif par tranches
  let its = 0;
  const brackets = applicableRules
    .filter((r) => r.category === 'impot' && /^its_t\d+_tx$/.test(r.code))
    .sort((a, b) => (Number(a.bracket_from) || 0) - (Number(b.bracket_from) || 0));
  let previousTo = 0;
  for (const [index, b] of brackets.entries()) {
    const from = Number(b.bracket_from ?? 0);
    const to = b.bracket_to !== null ? Number(b.bracket_to) : Infinity;
    const sliceWidth = Math.max(0, Math.min(Math.max(0, netBeforeTax), to) - from);
    const rate = Number(b.value);
    if (
      !Number.isFinite(from)
      || from < 0
      || from < previousTo
      || !Number.isFinite(rate)
      || rate < 0
      || (to !== Infinity && (!Number.isFinite(to) || to <= from))
      || (to === Infinity && index !== brackets.length - 1)
    ) {
      throw new Error(`Tranche ITS invalide : ${b.code}.`);
    }
    if (to !== Infinity) previousTo = to;
    const amount = round(sliceWidth * (rate / 100));
    if (sliceWidth > 0) {
      pushDetail('impot', b.label, netBeforeTax, rate, amount, b.code);
    }
    its += amount;
  }
  its = round(its);
  pushDetail('impot', 'Total impôt sur traitements et salaires', netBeforeTax, null, its, null);

  const net = round(netBeforeTax - its);

  // Charges patronales
  const pensionEmployer = round(taxableBase * (rm.get('cnps_pension_tx_employeur') / 100));
  pushDetail('charge_employeur', 'CNPS pension vieillesse (plafonnée)', taxableBase, rm.get('cnps_pension_tx_employeur'), pensionEmployer, 'cnps_pension_tx_employeur');

  const pfEmployer = round(gross * (rm.get('cnps_pf_tx_employeur') / 100));
  pushDetail('charge_employeur', 'CNPS prestations familiales', gross, rm.get('cnps_pf_tx_employeur'), pfEmployer, 'cnps_pf_tx_employeur');

  const atEmployer = round(gross * (rm.get('cnps_at_tx_employeur') / 100));
  pushDetail('charge_employeur', 'CNPS accidents du travail', gross, rm.get('cnps_at_tx_employeur'), atEmployer, 'cnps_at_tx_employeur');

  const rpEmployer = round(gross * (rm.get('cnps_rp_tx_employeur') / 100));
  pushDetail('charge_employeur', 'CNPS risques professionnels', gross, rm.get('cnps_rp_tx_employeur'), rpEmployer, 'cnps_rp_tx_employeur');

  const cmuEmployer = round(gross * (rm.get('cmu_tx_employeur') / 100));
  pushDetail('charge_employeur', 'CMU — part employeur', gross, rm.get('cmu_tx_employeur'), cmuEmployer, 'cmu_tx_employeur');

  const fdfpEmployer = round(gross * (rm.get('fdfp_tx_employeur') / 100));
  pushDetail('charge_employeur', 'FDFP formation professionnelle', gross, rm.get('fdfp_tx_employeur'), fdfpEmployer, 'fdfp_tx_employeur');

  const fdfpPlan = round(gross * (rm.get('fdfp_tx_plan') / 100));
  pushDetail('charge_employeur', 'FDFP plan de développement', gross, rm.get('fdfp_tx_plan'), fdfpPlan, 'fdfp_tx_plan');

  const employerCnps = round(pensionEmployer + pfEmployer + atEmployer + rpEmployer);
  const employerCmu = cmuEmployer;
  const employerFdfp = round(fdfpEmployer + fdfpPlan);
  const employerTotal = round(employerCnps + employerCmu + employerFdfp);

  return {
    gross,
    cnpsEmployee,
    cmuEmployee,
    its,
    net,
    employerCnps,
    employerCmu,
    employerFdfp,
    employerTotal,
    details,
  };
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
