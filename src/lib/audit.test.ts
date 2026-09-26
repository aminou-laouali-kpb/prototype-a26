import { describe, expect, it } from 'vitest';
import { auditActionLabel, formatAuditDetails } from './audit';

describe('journal d’audit', () => {
  it('traduit les actions techniques', () => {
    expect(auditActionLabel('seed_demo')).toBe('Chargement du jeu de démonstration');
    expect(auditActionLabel('approve_payroll')).toBe('Validation de la paie (4 yeux)');
    expect(auditActionLabel('custom_action')).toBe('custom action');
  });

  it('résume les détails sans JSON ni identifiants', () => {
    expect(formatAuditDetails({ kind: 'pme', country_code: 'NE' })).toBe('type : PME · pays : Niger');
    expect(formatAuditDetails({ period_id: '4f1c2b3a-1111-2222-3333-444455556666', period_year: 2026, period_month: 8, bulletins: 12 }))
      .toBe('août 2026 · bulletins : 12');
    expect(formatAuditDetails({ role: 'approveur_paie' })).toBe('rôle : Approbateur paie');
    expect(formatAuditDetails(null)).toBe('—');
  });
});
