import type { CountryPack } from './countryPacks';
import { getCountryPack, payrollColumnLabels } from './countryPacks';
import { downloadCsv } from './csv';
import type { Employee, Org, PayrollLine, PayrollPeriod } from './types';
import { formatXof, monthLabel } from './types';
import { openPrintDocument } from './documents';

function empName(line: PayrollLine): string {
  const e = line.employee;
  return e ? `${e.last_name} ${e.first_name}` : '';
}

function periodSlug(period: PayrollPeriod | null): string {
  if (!period) return 'cycle';
  return `${period.period_year}-${String(period.period_month).padStart(2, '0')}`;
}

export function exportPayrollCsv(
  pack: CountryPack,
  period: PayrollPeriod | null,
  lines: PayrollLine[],
): void {
  const labels = payrollColumnLabels(pack);
  downloadCsv(
    `pre-paie-${periodSlug(period)}.csv`,
    [
      'Matricule', 'Salarié', 'Salaire de base', 'Heures sup', 'Primes', 'Absences non payées (j)',
      'Brut', labels.socialEmployee, labels.healthEmployee, labels.tax, 'Net à payer',
      labels.employerTotal, 'Coût total employeur', 'Pays', 'Simulation',
    ],
    lines.map((l) => [
      l.employee?.employee_number ?? '',
      empName(l),
      Number(l.base_salary),
      Number(l.overtime_hours),
      Number(l.bonuses),
      Number(l.unpaid_absence_days),
      Number(l.gross),
      Number(l.cnps_employee),
      Number(l.cmu_employee),
      Number(l.its),
      Number(l.net),
      Number(l.employer_total),
      Number(l.gross) + Number(l.employer_total),
      pack.code,
      pack.simulationNote,
    ]),
  );
}

/** Bordereau cotisations sociales (CNSS / CNPS). */
export function exportSocialDeclarationCsv(
  pack: CountryPack,
  org: Org | null,
  period: PayrollPeriod | null,
  lines: PayrollLine[],
): void {
  const totalEmployee = lines.reduce((s, l) => s + Number(l.cnps_employee), 0);
  const totalEmployer = lines.reduce((s, l) => s + Number(l.employer_cnps), 0);
  downloadCsv(
    `declaration-${pack.socialShort.toLowerCase()}-${periodSlug(period)}.csv`,
    [
      'Organisme', 'Matricule', 'Nom', 'Prénoms', 'Brut',
      `Part salarié (${pack.socialShort})`, `Part employeur (${pack.socialShort})`, 'Total cotisations', 'N° contribuable', 'Période',
    ],
    [
      ...lines.map((l) => [
        pack.socialFull,
        l.employee?.employee_number ?? '',
        l.employee?.last_name ?? '',
        l.employee?.first_name ?? '',
        Number(l.gross),
        Number(l.cnps_employee),
        Number(l.employer_cnps),
        Number(l.cnps_employee) + Number(l.employer_cnps),
        org?.ncc ?? '',
        period ? monthLabel(period.period_year, period.period_month) : '',
      ]),
      [
        'TOTAL', '', '', '',
        lines.reduce((s, l) => s + Number(l.gross), 0),
        totalEmployee,
        totalEmployer,
        totalEmployee + totalEmployer,
        org?.ncc ?? '',
        period ? monthLabel(period.period_year, period.period_month) : '',
      ],
    ],
  );
}

/** Déclaration IUTS / ITS. */
export function exportTaxDeclarationCsv(
  pack: CountryPack,
  org: Org | null,
  period: PayrollPeriod | null,
  lines: PayrollLine[],
): void {
  downloadCsv(
    `declaration-${pack.taxShort.toLowerCase()}-${periodSlug(period)}.csv`,
    [
      'Impôt', 'Matricule', 'Nom', 'Prénoms', 'Brut', 'Base imposable (approx.)',
      pack.taxShort, pack.taxIdLabel, 'Période', 'Note',
    ],
    lines.map((l) => [
      pack.taxFull,
      l.employee?.employee_number ?? '',
      l.employee?.last_name ?? '',
      l.employee?.first_name ?? '',
      Number(l.gross),
      Number(l.gross) - Number(l.cnps_employee) - Number(l.cmu_employee),
      Number(l.its),
      org?.ncc ?? '',
      period ? monthLabel(period.period_year, period.period_month) : '',
      pack.simulationNote,
    ]),
  );
}

export function exportOhadaCsv(
  pack: CountryPack,
  period: PayrollPeriod | null,
  lines: PayrollLine[],
): { ok: true } | { ok: false; error: string } {
  const a = pack.ohadaAccounts;
  const totals = {
    gross: lines.reduce((s, l) => s + Number(l.gross), 0),
    net: lines.reduce((s, l) => s + Number(l.net), 0),
    employerSocial: lines.reduce((s, l) => s + Number(l.employer_cnps), 0),
    employerHealth: lines.reduce((s, l) => s + Number(l.employer_cmu), 0),
    employerTraining: lines.reduce((s, l) => s + Number(l.employer_fdfp), 0),
    employeeSocial: lines.reduce((s, l) => s + Number(l.cnps_employee), 0),
    employeeHealth: lines.reduce((s, l) => s + Number(l.cmu_employee), 0),
    tax: lines.reduce((s, l) => s + Number(l.its), 0),
  };
  const totalDebit = totals.gross + totals.employerSocial + totals.employerHealth + totals.employerTraining;
  const totalCredit = totals.net + totals.employeeSocial + totals.employeeHealth + totals.tax
    + totals.employerSocial + totals.employerHealth + totals.employerTraining;
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    return {
      ok: false,
      error: `Export OHADA déséquilibré : débit ${formatXof(totalDebit)}, crédit ${formatXof(totalCredit)}.`,
    };
  }

  downloadCsv(
    `ecriture-ohada-${periodSlug(period)}.csv`,
    ['Compte', 'Libellé', 'Débit (FCFA)', 'Crédit (FCFA)', 'Note'],
    [
      [a.gross, 'Rémunérations du personnel (brut)', totals.gross, null, `Cycle ${period ? monthLabel(period.period_year, period.period_month) : ''}`],
      [a.employerSocial, `${pack.socialShort} — part employeur`, totals.employerSocial, null, pack.simulationNote],
      [a.employerHealth, `${pack.healthShort} — part employeur`, totals.employerHealth, null, ''],
      [a.employerTraining, `${pack.trainingShort} — part employeur`, totals.employerTraining, null, ''],
      [a.netPayable, 'Rémunérations dues au personnel', null, totals.net, 'Net à payer'],
      [a.socialPayable, `${pack.socialShort} — retenues salariales et patronales`, null, totals.employeeSocial + totals.employerSocial, ''],
      [a.healthPayable, `${pack.healthShort} — retenues salariales et patronales`, null, totals.employeeHealth + totals.employerHealth, ''],
      [a.taxPayable, `État — ${pack.taxShort}`, null, totals.tax, ''],
      [a.trainingPayable, `${pack.trainingShort} — contribution employeur`, null, totals.employerTraining, ''],
      ['', 'TOTAL', totalDebit, totalCredit, 'Contrôle débit = crédit'],
    ],
  );
  return { ok: true };
}

export function exportMobileMoneyFile(
  pack: CountryPack,
  period: PayrollPeriod | null,
  lines: PayrollLine[],
  operatorFilter?: string | null,
): void {
  const filtered = lines.filter((l) => {
    const emp = l.employee as Employee | undefined;
    if (emp?.payment_method && emp.payment_method !== 'mobile_money') return false;
    if (operatorFilter && emp?.mobile_operator && emp.mobile_operator !== operatorFilter) return false;
    return true;
  });
  downloadCsv(
    `mobile-money-${periodSlug(period)}.csv`,
    ['Opérateur', 'Téléphone', 'Nom bénéficiaire', 'Montant (FCFA)', 'Référence', 'Matricule', 'Devise'],
    filtered.map((l) => {
      const emp = l.employee as Employee | undefined;
      return [
        emp?.mobile_operator ?? pack.mobileOperators[0] ?? '',
        emp?.payment_account ?? emp?.phone ?? '',
        emp ? `${emp.last_name} ${emp.first_name}` : '',
        Number(l.net),
        `PAIE-${periodSlug(period)}-${emp?.employee_number ?? ''}`,
        emp?.employee_number ?? '',
        'XOF',
      ];
    }),
  );
}

export function printPayrollBook(
  org: Org | null,
  period: PayrollPeriod | null,
  lines: PayrollLine[],
  countryCode?: string | null,
): void {
  const pack = getCountryPack(countryCode ?? org?.country_code);
  const labels = payrollColumnLabels(pack);
  const rows = lines.map((l) => `<tr>
    <td>${esc(l.employee?.employee_number ?? '')}</td>
    <td>${esc(empName(l))}</td>
    <td class="num">${esc(formatXof(l.gross))}</td>
    <td class="num">${esc(formatXof(l.cnps_employee))}</td>
    <td class="num">${esc(formatXof(l.cmu_employee))}</td>
    <td class="num">${esc(formatXof(l.its))}</td>
    <td class="num">${esc(formatXof(l.net))}</td>
    <td class="num">${esc(formatXof(l.employer_total))}</td>
  </tr>`).join('');
  const t = lines.reduce((a, l) => ({
    gross: a.gross + Number(l.gross),
    social: a.social + Number(l.cnps_employee),
    health: a.health + Number(l.cmu_employee),
    tax: a.tax + Number(l.its),
    net: a.net + Number(l.net),
    employer: a.employer + Number(l.employer_total),
  }), { gross: 0, social: 0, health: 0, tax: 0, net: 0, employer: 0 });

  const periodLabel = period ? monthLabel(period.period_year, period.period_month) : '';
  const body = `
    <div class="head">
      <div>
        <div class="brand">${esc(org?.legal_name || org?.name || 'Organisation')}</div>
        <div class="muted">${esc(pack.taxIdLabel)} ${esc(org?.ncc || '—')} · Pack ${esc(pack.name)}</div>
      </div>
      <div style="text-align:right">
        <h1>Livre de paie</h1>
        <div class="badge">${esc(periodLabel)} — simulation</div>
      </div>
    </div>
    <table>
      <thead><tr>
        <th>Matricule</th><th>Salarié</th>
        <th class="num">Brut</th>
        <th class="num">${esc(labels.socialEmployee)}</th>
        <th class="num">${esc(labels.healthEmployee)}</th>
        <th class="num">${esc(labels.tax)}</th>
        <th class="num">Net</th>
        <th class="num">Charges</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="8" class="muted">Aucune ligne.</td></tr>'}</tbody>
      <tfoot><tr class="total">
        <td colspan="2">Total (${lines.length})</td>
        <td class="num">${esc(formatXof(t.gross))}</td>
        <td class="num">${esc(formatXof(t.social))}</td>
        <td class="num">${esc(formatXof(t.health))}</td>
        <td class="num">${esc(formatXof(t.tax))}</td>
        <td class="num">${esc(formatXof(t.net))}</td>
        <td class="num">${esc(formatXof(t.employer))}</td>
      </tr></tfoot>
    </table>
    <div class="sign">
      <div><div class="line">Préparé par</div></div>
      <div><div class="line">Validé (quatre yeux)</div></div>
      <div><div class="line">Cachet / inspecteur</div></div>
    </div>
    <div class="note">${esc(pack.simulationNote)}</div>
  `;
  openPrintDocument(`Livre de paie — ${periodLabel}`, body);
}

function esc(v: string | number | null | undefined): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function printCashReceipt(
  org: Org | null,
  employee: Employee,
  amount: number,
  periodLabel: string,
  note?: string | null,
): void {
  const body = `
    <div class="head">
      <div class="brand">${esc(org?.legal_name || org?.name || 'Organisation')}</div>
      <div style="text-align:right"><h1>Reçu de paiement en espèces</h1>
        <div class="badge">${esc(periodLabel)}</div></div>
    </div>
    <p>Je soussigné(e), <strong>${esc(employee.last_name)} ${esc(employee.first_name)}</strong>
      (matricule ${esc(employee.employee_number)}), reconnais avoir reçu la somme de
      <strong>${esc(formatXof(amount))}</strong> au titre du salaire net de la période ${esc(periodLabel)}.</p>
    ${note ? `<p class="muted">Note : ${esc(note)}</p>` : ''}
    <div class="sign">
      <div><div class="line">Signature du salarié</div></div>
      <div><div class="line">Signature du caissier / RH</div></div>
    </div>
    <div class="note">Document de preuve pour remise cash — à conserver avec le lot de paiement.</div>
  `;
  openPrintDocument(`Reçu cash — ${employee.employee_number}`, body);
}

export function printAuditExport(
  org: Org | null,
  entries: Array<{ created_at: string; actor_email: string | null; action: string; entity: string; details: unknown }>,
): void {
  const rows = entries.map((e) => `<tr>
    <td>${esc(e.created_at)}</td>
    <td>${esc(e.actor_email || '—')}</td>
    <td>${esc(e.action)}</td>
    <td>${esc(e.entity)}</td>
    <td class="muted" style="font-size:11px">${esc(typeof e.details === 'string' ? e.details : JSON.stringify(e.details ?? {}))}</td>
  </tr>`).join('');
  const body = `
    <div class="head">
      <div class="brand">${esc(org?.legal_name || org?.name || 'Organisation')}</div>
      <div style="text-align:right"><h1>Journal d’audit</h1>
        <div class="badge">Export tamponnable</div></div>
    </div>
    <table>
      <thead><tr><th>Date</th><th>Acteur</th><th>Action</th><th>Entité</th><th>Détails</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" class="muted">Aucune entrée.</td></tr>'}</tbody>
    </table>
    <div class="sign">
      <div><div class="line">Contrôle interne</div></div>
      <div><div class="line">Direction / bailleur</div></div>
    </div>
  `;
  openPrintDocument('Journal d’audit', body);
}
