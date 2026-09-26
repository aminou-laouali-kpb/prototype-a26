import {
  Org, Employee, PayrollLine, PayrollDetail, PayrollPeriod,
  formatXof, monthLabel, formatDate,
} from './types';
import { getCountryPack, payrollColumnLabels } from './countryPacks';

function esc(v: string | number | null | undefined): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const BASE_STYLE = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 32px; font-size: 13px; line-height: 1.5; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  h2 { font-size: 14px; margin: 22px 0 8px; color: #0f766e; }
  .muted { color: #64748b; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f766e; padding-bottom: 14px; margin-bottom: 18px; }
  .brand { font-weight: 700; }
  .badge { display: inline-block; background: #f1f5f9; color: #475569; border-radius: 999px; padding: 3px 10px; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid #e2e8f0; }
  th { background: #f8fafc; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #64748b; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .total { background: #f0fdfa; font-weight: 700; }
  .net { display: flex; justify-content: space-between; align-items: center; background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 12px; padding: 14px 18px; margin-top: 18px; }
  .net .label { font-weight: 600; color: #115e59; }
  .net .value { font-size: 20px; font-weight: 700; color: #0f766e; }
  .sign { display: flex; gap: 40px; margin-top: 48px; }
  .sign > div { flex: 1; }
  .sign .line { border-top: 1px solid #94a3b8; margin-top: 60px; padding-top: 6px; font-size: 12px; color: #475569; }
  .note { margin-top: 28px; font-size: 11px; color: #94a3b8; }
  @media print { body { padding: 0; } @page { margin: 18mm; } }
`;

export function openPrintDocument(title: string, bodyHtml: string): void {
  const w = window.open('', '_blank', 'width=920,height=1000');
  if (!w) {
    alert('Autorisez les fenêtres pop-up pour générer le document PDF.');
    return;
  }
  w.document.open();
  w.document.write(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title>` +
    `<style>${BASE_STYLE}</style></head><body>${bodyHtml}` +
    `<script>window.onload=function(){setTimeout(function(){window.focus();window.print();},150);};</script>` +
    `</body></html>`,
  );
  w.document.close();
}

function orgHead(org: Org | null, right: string): string {
  return `<div class="head">
    <div>
      <div class="brand">${esc(org?.legal_name || org?.name || 'Organisation')}</div>
      ${org?.ncc ? `<div class="muted">${esc(getCountryPack(org.country_code).taxIdLabel)} ${esc(org.ncc)}</div>` : ''}
    </div>
    <div style="text-align:right">${right}</div>
  </div>`;
}

function detailRows(rows: PayrollDetail[]): string {
  return rows.map((d) => `<tr>
    <td>${esc(d.label)}</td>
    <td class="num muted">${d.calc_base != null ? esc(formatXof(d.calc_base)) : ''}</td>
    <td class="num muted">${d.rate != null ? esc(d.rate) + ' %' : ''}</td>
    <td class="num">${esc(formatXof(d.amount))}</td>
  </tr>`).join('');
}

export function payslipHtml(
  org: Org | null,
  employee: Employee,
  line: PayrollLine,
  details: PayrollDetail[],
  period: PayrollPeriod | null,
): string {
  const gains = details.filter((d) => d.category === 'gain');
  const retenues = details.filter((d) => d.category === 'retenue_salarie' || d.category === 'impot');
  const charges = details.filter((d) => d.category === 'charge_employeur');
  const section = (title: string, rows: PayrollDetail[]) => rows.length === 0 ? '' : `<h2>${esc(title)}</h2>
    <table><thead><tr><th>Libellé</th><th class="num">Base</th><th class="num">Taux</th><th class="num">Montant</th></tr></thead>
    <tbody>${detailRows(rows)}</tbody></table>`;

  const periodLabel = period ? monthLabel(period.period_year, period.period_month) : '';
  return orgHead(org, `<h1>Bulletin de paie</h1><div class="badge">Simulation — ${esc(periodLabel)}</div>`)
    + `<table><tbody>
        <tr><td class="muted">Salarié</td><td>${esc(employee.last_name)} ${esc(employee.first_name)} (${esc(employee.employee_number)})</td>
            <td class="muted">Poste</td><td>${esc(employee.job_title || '—')}</td></tr>
        <tr><td class="muted">Embauché le</td><td>${esc(formatDate(employee.hire_date))}</td>
            <td class="muted">Période</td><td>${esc(periodLabel)}</td></tr>
      </tbody></table>`
    + section('Gains', gains)
    + section('Retenues et impôts', retenues)
    + section('Charges patronales (employeur)', charges)
    + `<div class="net"><span class="label">Net à payer</span><span class="value">${esc(formatXof(line.net))}</span></div>`
    + `<div class="note">Document de simulation à faire valider par un expert local. Empreinte : ${esc(line.fingerprint ? line.fingerprint.slice(0, 32) : '—')}</div>`;
}

export interface MonthlySheetRow { project: string; funder: string | null; hours: number; }

export function monthlySheetHtml(
  org: Org | null,
  employee: Employee,
  year: number,
  month: number,
  rows: MonthlySheetRow[],
  total: number,
  validated: { at: string | null; approved: boolean; submitted: boolean },
): string {
  const fmt = (h: number) => (Math.round(h * 100) / 100).toString().replace('.', ',') + ' h';
  const body = rows.length === 0
    ? `<tr><td colspan="3" class="muted">Aucune heure imputée sur ce mois.</td></tr>`
    : rows.map((r) => `<tr><td>${esc(r.project)}</td><td class="muted">${esc(r.funder || '')}</td><td class="num">${esc(fmt(r.hours))}</td></tr>`).join('');
  const statusText = validated.approved
    ? `Feuille validée${validated.at ? ' le ' + esc(formatDate(validated.at)) : ''}`
    : validated.submitted ? 'Feuille soumise, en attente de validation' : 'Brouillon';

  return orgHead(org, `<h1>Feuille d'activité mensuelle</h1><div class="badge">${esc(monthLabel(year, month))}</div>`)
    + `<table><tbody>
        <tr><td class="muted">Salarié</td><td>${esc(employee.last_name)} ${esc(employee.first_name)} (${esc(employee.employee_number)})</td>
            <td class="muted">Poste</td><td>${esc(employee.job_title || '—')}</td></tr>
        <tr><td class="muted">Statut</td><td colspan="3">${statusText}</td></tr>
      </tbody></table>`
    + `<h2>Heures ventilées par projet</h2>
       <table><thead><tr><th>Projet</th><th>Bailleur / financement</th><th class="num">Heures</th></tr></thead>
       <tbody>${body}</tbody>
       <tfoot><tr class="total"><td colspan="2">Total du mois</td><td class="num">${esc(fmt(total))}</td></tr></tfoot></table>`
    + `<div class="sign">
        <div><div class="line">Signature du salarié</div></div>
        <div><div class="line">Signature du responsable hiérarchique</div></div>
      </div>`
    + `<div class="note">Feuille d'activité — émargement formel requis. Généré le ${esc(formatDate(new Date().toISOString()))}.</div>`;
}

export interface AnnualRow {
  name: string; number: string;
  gross: number; cnps: number; cmu: number; its: number; net: number; employer: number;
}

export function annualRecapHtml(org: Org | null, year: number, rows: AnnualRow[]): string {
  const cols = payrollColumnLabels(getCountryPack(org?.country_code));
  const t = rows.reduce((a, r) => ({
    gross: a.gross + r.gross, cnps: a.cnps + r.cnps, cmu: a.cmu + r.cmu,
    its: a.its + r.its, net: a.net + r.net, employer: a.employer + r.employer,
  }), { gross: 0, cnps: 0, cmu: 0, its: 0, net: 0, employer: 0 });

  const body = rows.length === 0
    ? `<tr><td colspan="7" class="muted">Aucun bulletin calculé sur cette année.</td></tr>`
    : rows.map((r) => `<tr>
        <td>${esc(r.name)}<div class="muted" style="font-size:11px">${esc(r.number)}</div></td>
        <td class="num">${esc(formatXof(r.gross))}</td>
        <td class="num">${esc(formatXof(r.cnps))}</td>
        <td class="num">${esc(formatXof(r.cmu))}</td>
        <td class="num">${esc(formatXof(r.its))}</td>
        <td class="num">${esc(formatXof(r.net))}</td>
        <td class="num">${esc(formatXof(r.employer))}</td>
      </tr>`).join('');

  return orgHead(org, `<h1>Récapitulatif annuel des salaires</h1><div class="badge">Année ${esc(year)} — simulation</div>`)
    + `<table><thead><tr>
        <th>Salarié</th><th class="num">Brut</th><th class="num">${esc(cols.socialEmployee)}</th><th class="num">${esc(cols.healthEmployee)}</th>
        <th class="num">${esc(cols.tax)}</th><th class="num">Net</th><th class="num">Charges empl.</th>
      </tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr class="total">
        <td>Total (${rows.length})</td>
        <td class="num">${esc(formatXof(t.gross))}</td>
        <td class="num">${esc(formatXof(t.cnps))}</td>
        <td class="num">${esc(formatXof(t.cmu))}</td>
        <td class="num">${esc(formatXof(t.its))}</td>
        <td class="num">${esc(formatXof(t.net))}</td>
        <td class="num">${esc(formatXof(t.employer))}</td>
      </tr></tfoot></table>`
    + `<div class="note">État récapitulatif annuel de simulation, destiné à préparer la déclaration fiscale annuelle. À faire valider par un expert-comptable local avant tout dépôt officiel.</div>`;
}
