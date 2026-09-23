import { getCountryPack } from './countryPacks';

export interface EmployeeImportRow {
  employee_number: string;
  last_name: string;
  first_name: string;
  job_title: string | null;
  phone: string | null;
  email: string | null;
  payment_method: 'mobile_money' | 'bank' | 'cash' | null;
  mobile_operator: string | null;
  payment_account: string | null;
  base_salary: number | null;
  contract_type: 'CDI' | 'CDD' | 'ESSAI' | 'STAGE' | 'APPRENTISSAGE' | null;
  hire_date: string | null;
}

export interface EmployeeImportResult {
  rows: EmployeeImportRow[];
  errors: string[];
}

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && ch === sep) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function detectSep(headerLine: string): string {
  const semis = (headerLine.match(/;/g) || []).length;
  const commas = (headerLine.match(/,/g) || []).length;
  return semis >= commas ? ';' : ',';
}

function normHeader(h: string): string {
  return h
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const HEADER_MAP: Record<string, keyof EmployeeImportRow> = {
  matricule: 'employee_number',
  employee_number: 'employee_number',
  nom: 'last_name',
  last_name: 'last_name',
  prenom: 'first_name',
  prenoms: 'first_name',
  first_name: 'first_name',
  poste: 'job_title',
  job_title: 'job_title',
  telephone: 'phone',
  phone: 'phone',
  email: 'email',
  moyen_paiement: 'payment_method',
  payment_method: 'payment_method',
  operateur: 'mobile_operator',
  mobile_operator: 'mobile_operator',
  compte: 'payment_account',
  payment_account: 'payment_account',
  salaire: 'base_salary',
  salaire_de_base: 'base_salary',
  base_salary: 'base_salary',
  contrat: 'contract_type',
  contract_type: 'contract_type',
  date_embauche: 'hire_date',
  hire_date: 'hire_date',
};

function parsePaymentMethod(v: string): EmployeeImportRow['payment_method'] {
  const t = v.trim().toLowerCase();
  if (!t) return null;
  if (t.includes('cash') || t.includes('espece')) return 'cash';
  if (t.includes('bank') || t.includes('banque') || t.includes('virement')) return 'bank';
  if (t.includes('mobile') || t.includes('momo') || t.includes('orange') || t.includes('airtel')) return 'mobile_money';
  if (t === 'mobile_money' || t === 'bank' || t === 'cash') return t;
  return 'mobile_money';
}

function parseContract(v: string): EmployeeImportRow['contract_type'] {
  const t = v.trim().toUpperCase();
  if (['CDI', 'CDD', 'ESSAI', 'STAGE', 'APPRENTISSAGE'].includes(t)) {
    return t as EmployeeImportRow['contract_type'];
  }
  return t ? 'CDI' : null;
}

/** Parse un CSV Excel (séparateur ; ou ,) vers des fiches salariés. */
export function parseEmployeeCsv(text: string, countryCode?: string | null): EmployeeImportResult {
  const pack = getCountryPack(countryCode);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const errors: string[] = [];
  if (lines.length < 2) {
    return { rows: [], errors: ['Le fichier doit contenir une ligne d’en-tête et au moins une ligne de données.'] };
  }
  const sep = detectSep(lines[0]);
  const headers = splitCsvLine(lines[0], sep).map(normHeader);
  const mapped = headers.map((h) => HEADER_MAP[h] ?? null);
  if (!mapped.includes('employee_number') || !mapped.includes('last_name') || !mapped.includes('first_name')) {
    return {
      rows: [],
      errors: ['Colonnes obligatoires manquantes : Matricule, Nom, Prénoms (ou équivalents).'],
    };
  }

  const rows: EmployeeImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], sep);
    const row: EmployeeImportRow = {
      employee_number: '',
      last_name: '',
      first_name: '',
      job_title: null,
      phone: null,
      email: null,
      payment_method: null,
      mobile_operator: null,
      payment_account: null,
      base_salary: null,
      contract_type: null,
      hire_date: null,
    };
    mapped.forEach((key, idx) => {
      if (!key) return;
      const raw = (cells[idx] ?? '').trim();
      if (!raw) return;
      if (key === 'base_salary') {
        const n = Number(raw.replace(/\s/g, '').replace(',', '.'));
        row.base_salary = Number.isFinite(n) ? n : null;
      } else if (key === 'payment_method') {
        row.payment_method = parsePaymentMethod(raw);
      } else if (key === 'contract_type') {
        row.contract_type = parseContract(raw);
      } else if (key === 'mobile_operator') {
        row.mobile_operator = raw || pack.mobileOperators[0] || null;
      } else {
        (row as unknown as Record<string, unknown>)[key] = raw;
      }
    });
    if (!row.employee_number || !row.last_name || !row.first_name) {
      errors.push(`Ligne ${i + 1} : matricule / nom / prénom incomplets.`);
      continue;
    }
    if (!row.payment_method) row.payment_method = 'mobile_money';
    if (row.payment_method === 'mobile_money' && !row.mobile_operator) {
      row.mobile_operator = pack.mobileOperators[0] ?? null;
    }
    rows.push(row);
  }
  return { rows, errors };
}

export function employeeImportTemplateCsv(countryCode?: string | null): string {
  const pack = getCountryPack(countryCode);
  const header = [
    'Matricule', 'Nom', 'Prénoms', 'Poste', 'Telephone', 'Email',
    'Moyen_paiement', 'Operateur', 'Compte', 'Salaire_de_base', 'Contrat', 'Date_embauche',
  ].join(';');
  const sample = [
    'E001', 'DIALLO', 'Aïcha', 'Comptable', '+22790000000', 'aicha@exemple.ne',
    'mobile_money', pack.mobileOperators[0] ?? 'Airtel Money', '90000000', '250000', 'CDI', '2024-01-15',
  ].join(';');
  return `\uFEFF${header}\n${sample}\n`;
}
