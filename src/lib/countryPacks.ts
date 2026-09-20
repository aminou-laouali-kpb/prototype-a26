/**
 * Packs pays Afrique de l’Ouest.
 * Les codes techniques (cnps_*, cmu_*, its_*, fdfp_*) restent stables pour le
 * moteur de pré-paie ; seuls libellés, taux et congés changent selon le pays.
 * Valeurs = SIMULATION à faire valider par un expert local.
 */

export type CountryCode = 'CI' | 'NE';

export interface PackLeaveType {
  code: string;
  name: string;
  paid: boolean;
  annual_days: number;
}

export interface PackRuleSeed {
  code: string;
  label: string;
  category: 'cotisation_salarie' | 'cotisation_employeur' | 'impot' | 'plafond' | 'abarissement' | 'autre';
  value: number;
  bracket_from: number | null;
  bracket_to: number | null;
}

export interface CountryPack {
  code: CountryCode;
  name: string;
  flagHint: string;
  currency: string;
  taxIdLabel: string;
  socialShort: string;
  healthShort: string;
  taxShort: string;
  trainingShort: string;
  socialFull: string;
  healthFull: string;
  taxFull: string;
  trainingFull: string;
  simulationNote: string;
  ohadaAccounts: {
    gross: string;
    employerSocial: string;
    employerHealth: string;
    employerTraining: string;
    netPayable: string;
    socialPayable: string;
    healthPayable: string;
    taxPayable: string;
    trainingPayable: string;
  };
  leaveTypes: PackLeaveType[];
  rules: PackRuleSeed[];
  mobileOperators: string[];
}

const CI_RULES: PackRuleSeed[] = [
  { code: 'cnps_pension_tx_salarie', label: 'CNPS pension vieillesse — part salariale', category: 'cotisation_salarie', value: 6.3, bracket_from: null, bracket_to: null },
  { code: 'cnps_pension_tx_employeur', label: 'CNPS pension vieillesse — part employeur', category: 'cotisation_employeur', value: 7.7, bracket_from: null, bracket_to: null },
  { code: 'cnps_pf_tx_employeur', label: 'CNPS prestations familiales — part employeur', category: 'cotisation_employeur', value: 5.75, bracket_from: null, bracket_to: null },
  { code: 'cnps_at_tx_employeur', label: 'CNPS accidents du travail — part employeur', category: 'cotisation_employeur', value: 2.0, bracket_from: null, bracket_to: null },
  { code: 'cnps_rp_tx_employeur', label: 'CNPS risques professionnels — part employeur', category: 'cotisation_employeur', value: 1.0, bracket_from: null, bracket_to: null },
  { code: 'fdfp_tx_employeur', label: 'FDFP formation professionnelle — part employeur', category: 'cotisation_employeur', value: 1.4, bracket_from: null, bracket_to: null },
  { code: 'fdfp_tx_plan', label: 'FDFP plan de développement — part employeur', category: 'abarissement', value: 0.4, bracket_from: null, bracket_to: null },
  { code: 'cmu_tx_salarie', label: 'CMU — part salariale', category: 'cotisation_salarie', value: 1.0, bracket_from: null, bracket_to: null },
  { code: 'cmu_tx_employeur', label: 'CMU — part employeur', category: 'cotisation_employeur', value: 4.0, bracket_from: null, bracket_to: null },
  { code: 'plafond_mensuel', label: 'Plafond mensuel de cotisation CNPS (SIMULATION)', category: 'plafond', value: 70000, bracket_from: null, bracket_to: null },
  { code: 'smig_mensuel', label: 'SMIG mensuel ivoirien (SIMULATION)', category: 'plafond', value: 75000, bracket_from: null, bracket_to: null },
  { code: 'taux_heures_supp', label: 'Majoration heures supplémentaires (%)', category: 'autre', value: 125, bracket_from: null, bracket_to: null },
  { code: 'its_t1_tx', label: 'ITS tranche 1 (0 à 50 000) — taux', category: 'impot', value: 0, bracket_from: 0, bracket_to: 50000 },
  { code: 'its_t2_tx', label: 'ITS tranche 2 (50 001 à 290 000) — taux', category: 'impot', value: 10, bracket_from: 50000, bracket_to: 290000 },
  { code: 'its_t3_tx', label: 'ITS tranche 3 (290 001 à 530 000) — taux', category: 'impot', value: 15, bracket_from: 290000, bracket_to: 530000 },
  { code: 'its_t4_tx', label: 'ITS tranche 4 (au-delà de 530 000) — taux', category: 'impot', value: 25, bracket_from: 530000, bracket_to: null },
];

/** Taux indicatifs Niger — SIMULATION, à valider (CNSS / IUTS / AMO). */
const NE_RULES: PackRuleSeed[] = [
  { code: 'cnps_pension_tx_salarie', label: 'CNSS pension vieillesse — part salariale', category: 'cotisation_salarie', value: 1.6, bracket_from: null, bracket_to: null },
  { code: 'cnps_pension_tx_employeur', label: 'CNSS pension vieillesse — part employeur', category: 'cotisation_employeur', value: 4.0, bracket_from: null, bracket_to: null },
  { code: 'cnps_pf_tx_employeur', label: 'CNSS prestations familiales — part employeur', category: 'cotisation_employeur', value: 5.5, bracket_from: null, bracket_to: null },
  { code: 'cnps_at_tx_employeur', label: 'CNSS accidents du travail — part employeur', category: 'cotisation_employeur', value: 2.0, bracket_from: null, bracket_to: null },
  { code: 'cnps_rp_tx_employeur', label: 'CNSS risques professionnels — part employeur', category: 'cotisation_employeur', value: 1.0, bracket_from: null, bracket_to: null },
  { code: 'fdfp_tx_employeur', label: 'Formation professionnelle — part employeur', category: 'cotisation_employeur', value: 1.2, bracket_from: null, bracket_to: null },
  { code: 'fdfp_tx_plan', label: 'Contribution formation complémentaire — part employeur', category: 'abarissement', value: 0.3, bracket_from: null, bracket_to: null },
  { code: 'cmu_tx_salarie', label: 'AMO / couverture maladie — part salariale', category: 'cotisation_salarie', value: 1.0, bracket_from: null, bracket_to: null },
  { code: 'cmu_tx_employeur', label: 'AMO / couverture maladie — part employeur', category: 'cotisation_employeur', value: 3.0, bracket_from: null, bracket_to: null },
  { code: 'plafond_mensuel', label: 'Plafond mensuel de cotisation CNSS (SIMULATION)', category: 'plafond', value: 500000, bracket_from: null, bracket_to: null },
  { code: 'smig_mensuel', label: 'SMIG mensuel nigérien (SIMULATION)', category: 'plafond', value: 36000, bracket_from: null, bracket_to: null },
  { code: 'taux_heures_supp', label: 'Majoration heures supplémentaires (%)', category: 'autre', value: 125, bracket_from: null, bracket_to: null },
  { code: 'its_t1_tx', label: 'IUTS tranche 1 (0 à 25 000) — taux', category: 'impot', value: 0, bracket_from: 0, bracket_to: 25000 },
  { code: 'its_t2_tx', label: 'IUTS tranche 2 (25 001 à 50 000) — taux', category: 'impot', value: 2, bracket_from: 25000, bracket_to: 50000 },
  { code: 'its_t3_tx', label: 'IUTS tranche 3 (50 001 à 100 000) — taux', category: 'impot', value: 8, bracket_from: 50000, bracket_to: 100000 },
  { code: 'its_t4_tx', label: 'IUTS tranche 4 (100 001 à 200 000) — taux', category: 'impot', value: 15, bracket_from: 100000, bracket_to: 200000 },
  { code: 'its_t5_tx', label: 'IUTS tranche 5 (au-delà de 200 000) — taux', category: 'impot', value: 20, bracket_from: 200000, bracket_to: null },
];

const SHARED_LEAVES_CI: PackLeaveType[] = [
  { code: 'CAP', name: 'Congé annuel payé', paid: true, annual_days: 30 },
  { code: 'MAL', name: 'Congé maladie', paid: true, annual_days: 0 },
  { code: 'MAT', name: 'Congé maternité', paid: true, annual_days: 0 },
  { code: 'PAT', name: 'Congé paternité', paid: true, annual_days: 5 },
  { code: 'EXC', name: 'Autorisation exceptionnelle', paid: true, annual_days: 0 },
  { code: 'SOL', name: 'Congé sans solde', paid: false, annual_days: 0 },
];

/** Congés indicatifs Code du travail nigérien (ajustables). */
const SHARED_LEAVES_NE: PackLeaveType[] = [
  { code: 'CAP', name: 'Congé annuel payé', paid: true, annual_days: 30 },
  { code: 'MAL', name: 'Congé maladie', paid: true, annual_days: 0 },
  { code: 'MAT', name: 'Congé maternité (14 semaines indicatives)', paid: true, annual_days: 98 },
  { code: 'PAT', name: 'Congé paternité', paid: true, annual_days: 3 },
  { code: 'EXC', name: 'Autorisation exceptionnelle', paid: true, annual_days: 0 },
  { code: 'SOL', name: 'Congé sans solde', paid: false, annual_days: 0 },
];

export const COUNTRY_PACKS: Record<CountryCode, CountryPack> = {
  CI: {
    code: 'CI',
    name: 'Côte d’Ivoire',
    flagHint: 'CI',
    currency: 'XOF',
    taxIdLabel: 'NCC',
    socialShort: 'CNPS',
    healthShort: 'CMU',
    taxShort: 'ITS',
    trainingShort: 'FDFP',
    socialFull: 'Caisse Nationale de Prévoyance Sociale',
    healthFull: 'Couverture Maladie Universelle',
    taxFull: 'Impôt sur les traitements et salaires',
    trainingFull: 'Fonds de Développement de la Formation Professionnelle',
    simulationNote: 'Simulation Côte d’Ivoire — à valider par un expert local.',
    ohadaAccounts: {
      gross: '6411',
      employerSocial: '6461',
      employerHealth: '6471',
      employerTraining: '6472',
      netPayable: '4211',
      socialPayable: '4310',
      healthPayable: '4314',
      taxPayable: '4213',
      trainingPayable: '4315',
    },
    leaveTypes: SHARED_LEAVES_CI,
    rules: CI_RULES,
    mobileOperators: ['Orange Money', 'MTN MoMo', 'Wave', 'Moov Money'],
  },
  NE: {
    code: 'NE',
    name: 'Niger',
    flagHint: 'NE',
    currency: 'XOF',
    taxIdLabel: 'NIF',
    socialShort: 'CNSS',
    healthShort: 'AMO',
    taxShort: 'IUTS',
    trainingShort: 'Formation',
    socialFull: 'Caisse Nationale de Sécurité Sociale',
    healthFull: 'Assurance maladie / couverture santé',
    taxFull: 'Impôt unique sur les traitements et salaires',
    trainingFull: 'Contribution à la formation professionnelle',
    simulationNote: 'Simulation Niger — à valider par un expert-comptable / CNSS locales.',
    ohadaAccounts: {
      gross: '6411',
      employerSocial: '6461',
      employerHealth: '6471',
      employerTraining: '6472',
      netPayable: '4211',
      socialPayable: '4310',
      healthPayable: '4314',
      taxPayable: '4213',
      trainingPayable: '4315',
    },
    leaveTypes: SHARED_LEAVES_NE,
    rules: NE_RULES,
    mobileOperators: ['Airtel Money', 'Moov Money', 'Orange Money', 'Zamani'],
  },
};

export const COUNTRY_OPTIONS: Array<{ code: CountryCode; label: string }> = [
  { code: 'NE', label: 'Niger' },
  { code: 'CI', label: 'Côte d’Ivoire' },
];

export function isCountryCode(value: string | null | undefined): value is CountryCode {
  return value === 'CI' || value === 'NE';
}

export function getCountryPack(code: string | null | undefined): CountryPack {
  if (isCountryCode(code)) return COUNTRY_PACKS[code];
  return COUNTRY_PACKS.NE;
}

export function payrollColumnLabels(pack: CountryPack) {
  return {
    socialEmployee: `${pack.socialShort} salarié`,
    healthEmployee: `${pack.healthShort} salarié`,
    tax: pack.taxShort,
    employerSocial: `${pack.socialShort} employeur`,
    employerHealth: `${pack.healthShort} employeur`,
    employerTraining: pack.trainingShort,
    employerTotal: 'Charges employeur',
  };
}
