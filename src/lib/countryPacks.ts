/**
 * Packs pays Afrique de l’Ouest.
 * Les codes techniques (cnps_*, cmu_*, its_*, fdfp_*) restent stables pour le
 * moteur de pré-paie ; seuls libellés, taux et congés changent selon le pays.
 *
 * Taux figés après recherche 2026 (voir commentaires de chaque règle).
 * CMU CI : valeur >= 100 = forfait XOF. its_on_gross = 1 → ITS sur le brut.
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

/** Côte d'Ivoire — CLEISS 01/2025, CGI art. 119 bis (ord. 2023-719), FDFP, décret 2022-986. */
const CI_RULES: PackRuleSeed[] = [
  { code: 'cnps_pension_tx_salarie', label: 'CNPS pension vieillesse — part salariale', category: 'cotisation_salarie', value: 6.3, bracket_from: null, bracket_to: null },
  { code: 'cnps_pension_tx_employeur', label: 'CNPS pension vieillesse — part employeur', category: 'cotisation_employeur', value: 7.7, bracket_from: null, bracket_to: null },
  { code: 'cnps_pf_tx_employeur', label: 'CNPS prestations familiales — part employeur', category: 'cotisation_employeur', value: 5.0, bracket_from: null, bracket_to: null },
  { code: 'cnps_at_tx_employeur', label: 'CNPS accidents du travail — part employeur (secteur tertiaire)', category: 'cotisation_employeur', value: 2.0, bracket_from: null, bracket_to: null },
  { code: 'cnps_rp_tx_employeur', label: 'CNPS assurance maternité — part employeur', category: 'cotisation_employeur', value: 0.75, bracket_from: null, bracket_to: null },
  { code: 'fdfp_tx_employeur', label: 'FDFP taxe additionnelle formation continue', category: 'cotisation_employeur', value: 1.2, bracket_from: null, bracket_to: null },
  { code: 'fdfp_tx_plan', label: 'FDFP taxe d’apprentissage', category: 'abarissement', value: 0.4, bracket_from: null, bracket_to: null },
  { code: 'cmu_tx_salarie', label: 'CMU — forfait salarial (XOF / personne)', category: 'cotisation_salarie', value: 500, bracket_from: null, bracket_to: null },
  { code: 'cmu_tx_employeur', label: 'CMU — forfait employeur (XOF / personne)', category: 'cotisation_employeur', value: 500, bracket_from: null, bracket_to: null },
  { code: 'plafond_mensuel', label: 'Plafond mensuel CNPS retraite (45 × SMIG)', category: 'plafond', value: 3375000, bracket_from: null, bracket_to: null },
  { code: 'plafond_prestations', label: 'Plafond CNPS PF / maternité / AT', category: 'plafond', value: 70000, bracket_from: null, bracket_to: null },
  { code: 'smig_mensuel', label: 'SMIG mensuel ivoirien', category: 'plafond', value: 75000, bracket_from: null, bracket_to: null },
  { code: 'taux_heures_supp', label: 'Majoration heures supplémentaires (%)', category: 'autre', value: 125, bracket_from: null, bracket_to: null },
  { code: 'its_on_gross', label: 'ITS assiette = brut (1) ou net social (0)', category: 'autre', value: 1, bracket_from: null, bracket_to: null },
  { code: 'its_t1_tx', label: 'ITS tranche 1 (0 à 75 000) — taux', category: 'impot', value: 0, bracket_from: 0, bracket_to: 75000 },
  { code: 'its_t2_tx', label: 'ITS tranche 2 (75 001 à 240 000) — taux', category: 'impot', value: 16, bracket_from: 75000, bracket_to: 240000 },
  { code: 'its_t3_tx', label: 'ITS tranche 3 (240 001 à 800 000) — taux', category: 'impot', value: 21, bracket_from: 240000, bracket_to: 800000 },
  { code: 'its_t4_tx', label: 'ITS tranche 4 (800 001 à 2 400 000) — taux', category: 'impot', value: 24, bracket_from: 800000, bracket_to: 2400000 },
  { code: 'its_t5_tx', label: 'ITS tranche 5 (2 400 001 à 8 000 000) — taux', category: 'impot', value: 28, bracket_from: 2400000, bracket_to: 8000000 },
  { code: 'its_t6_tx', label: 'ITS tranche 6 (au-delà de 8 000 000) — taux', category: 'impot', value: 32, bracket_from: 8000000, bracket_to: null },
];

/**
 * Niger — décret 2023-449 (JO 15/06/2023), ANPE 1 % au 01/01/2024,
 * plafond décret 2013-279, SMIG décret 2025-607 (42 000 F au 01/01/2026),
 * ITS/IUTS CGI art. 150 / LF 2026 (ord. 2025-44), FAFPA 3 % entreprises nationales.
 */
const NE_RULES: PackRuleSeed[] = [
  { code: 'cnps_pension_tx_salarie', label: 'CNSS pension vieillesse — part salariale', category: 'cotisation_salarie', value: 5.25, bracket_from: null, bracket_to: null },
  { code: 'cnps_pension_tx_employeur', label: 'CNSS pension vieillesse — part employeur', category: 'cotisation_employeur', value: 9.75, bracket_from: null, bracket_to: null },
  { code: 'cnps_pf_tx_employeur', label: 'CNSS prestations familiales — part employeur', category: 'cotisation_employeur', value: 4.9, bracket_from: null, bracket_to: null },
  { code: 'cnps_at_tx_employeur', label: 'CNSS accidents du travail — part employeur', category: 'cotisation_employeur', value: 1.75, bracket_from: null, bracket_to: null },
  { code: 'cnps_rp_tx_employeur', label: 'ANPE — cotisation employeur', category: 'cotisation_employeur', value: 1.0, bracket_from: null, bracket_to: null },
  { code: 'fdfp_tx_employeur', label: 'FAFPA taxe d’apprentissage (entreprises nationales)', category: 'cotisation_employeur', value: 3.0, bracket_from: null, bracket_to: null },
  { code: 'fdfp_tx_plan', label: 'Formation complémentaire — non instituée', category: 'abarissement', value: 0, bracket_from: null, bracket_to: null },
  { code: 'cmu_tx_salarie', label: 'AMO / RAMU — non prélevée sur la paie privée', category: 'cotisation_salarie', value: 0, bracket_from: null, bracket_to: null },
  { code: 'cmu_tx_employeur', label: 'AMO / RAMU — non prélevée sur la paie privée', category: 'cotisation_employeur', value: 0, bracket_from: null, bracket_to: null },
  { code: 'plafond_mensuel', label: 'Plafond mensuel de cotisation CNSS', category: 'plafond', value: 500000, bracket_from: null, bracket_to: null },
  { code: 'plafond_prestations', label: 'Plafond CNSS PF / AT / ANPE', category: 'plafond', value: 500000, bracket_from: null, bracket_to: null },
  { code: 'smig_mensuel', label: 'SMIG mensuel nigérien (01/2026)', category: 'plafond', value: 42000, bracket_from: null, bracket_to: null },
  { code: 'taux_heures_supp', label: 'Majoration heures supplémentaires (%)', category: 'autre', value: 125, bracket_from: null, bracket_to: null },
  { code: 'its_on_gross', label: 'IUTS assiette = brut (1) ou net social (0)', category: 'autre', value: 0, bracket_from: null, bracket_to: null },
  { code: 'its_t1_tx', label: 'IUTS / ITS tranche 1 (0 à 25 000) — taux', category: 'impot', value: 1, bracket_from: 0, bracket_to: 25000 },
  { code: 'its_t2_tx', label: 'IUTS / ITS tranche 2 (25 001 à 50 000) — taux', category: 'impot', value: 2, bracket_from: 25000, bracket_to: 50000 },
  { code: 'its_t3_tx', label: 'IUTS / ITS tranche 3 (50 001 à 100 000) — taux', category: 'impot', value: 6, bracket_from: 50000, bracket_to: 100000 },
  { code: 'its_t4_tx', label: 'IUTS / ITS tranche 4 (100 001 à 150 000) — taux', category: 'impot', value: 13, bracket_from: 100000, bracket_to: 150000 },
  { code: 'its_t5_tx', label: 'IUTS / ITS tranche 5 (150 001 à 300 000) — taux', category: 'impot', value: 25, bracket_from: 150000, bracket_to: 300000 },
  { code: 'its_t6_tx', label: 'IUTS / ITS tranche 6 (300 001 à 400 000) — taux', category: 'impot', value: 30, bracket_from: 300000, bracket_to: 400000 },
  { code: 'its_t7_tx', label: 'IUTS / ITS tranche 7 (400 001 à 700 000) — taux', category: 'impot', value: 32, bracket_from: 400000, bracket_to: 700000 },
  { code: 'its_t8_tx', label: 'IUTS / ITS tranche 8 (700 001 à 1 000 000) — taux', category: 'impot', value: 34, bracket_from: 700000, bracket_to: 1000000 },
  { code: 'its_t9_tx', label: 'IUTS / ITS tranche 9 (au-delà de 1 000 000) — taux', category: 'impot', value: 35, bracket_from: 1000000, bracket_to: null },
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
    simulationNote: 'Barème 2026 : CNPS CLEISS, ITS CGI art. 119 bis, FDFP 1,2 % + 0,4 %, CMU 500 F, SMIG 75 000 F.',
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
    simulationNote: 'Barème 2026 : CNSS décret 2023-449, ANPE 1 %, SMIG 42 000 F, IUTS CGI art. 150 / LF 2026, FAFPA 3 %.',
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
