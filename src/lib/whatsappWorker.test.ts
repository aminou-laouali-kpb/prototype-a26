import { describe, expect, it } from 'vitest';
import {
  buildTemplateMessage, classifyResponse, formatDateFr, formatDaysFr, maskRecipient, safeEqual,
  sanitizeParam, toWhatsAppNumber, type OutboxRow,
} from '../../supabase/functions/send-whatsapp/messages';

const row = (over: Partial<OutboxRow> = {}): OutboxRow => ({
  id: 'n1', org_id: 'o1', channel: 'whatsapp', template_key: 'leave_approved',
  recipient: '+22790112030', attempts: 1, payload: {}, ...over,
});

describe('whatsapp numbers', () => {
  it('turns an E.164 number into digits only, and refuses anything else', () => {
    expect(toWhatsAppNumber('+22790112030')).toBe('22790112030');
    expect(toWhatsAppNumber('22790112030')).toBeNull();
    expect(toWhatsAppNumber('+12')).toBeNull();
    expect(toWhatsAppNumber('+1234567890123456')).toBeNull();
    expect(toWhatsAppNumber('')).toBeNull();
  });

  it('masks the middle of a number for logs and previews', () => {
    expect(maskRecipient('+22790112030')).toBe('+227••••2030');
    expect(maskRecipient('+123')).toBe('••••');
  });
});

describe('template parameters', () => {
  it('cleans what Meta rejects: empty values, line breaks, long space runs, overlong text', () => {
    expect(sanitizeParam('')).toBe('-');
    expect(sanitizeParam(null, 'x')).toBe('x');
    expect(sanitizeParam('a\nb\t c   d')).toBe('a b c d');
    expect(sanitizeParam('x'.repeat(500))).toHaveLength(200);
  });

  it('formats dates and day counts the French way', () => {
    expect(formatDateFr('2026-10-12')).toBe('12/10/2026');
    expect(formatDaysFr('3.0')).toBe('3');
    expect(formatDaysFr(2.5)).toBe('2,5');
  });
});

describe('buildTemplateMessage', () => {
  it('builds the leave_approved template in the documented parameter order', () => {
    const built = buildTemplateMessage(row({
      payload: { org: 'Distribution Sahel SARL', leave_type: 'Congé annuel payé', start_date: '2026-10-12', end_date: '2026-10-14', days: '3.0' },
    }));
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.to).toBe('22790112030');
    expect(built.template).toBe('a26_leave_approved');
    expect(built.params).toEqual(['Congé annuel payé', '12/10/2026', '14/10/2026', '3', 'Distribution Sahel SARL']);
    expect(built.body).toMatchObject({
      messaging_product: 'whatsapp',
      to: '22790112030',
      type: 'template',
      template: { name: 'a26_leave_approved', language: { code: 'fr' } },
    });
  });

  it('gives a refusal note even when the manager wrote none', () => {
    const built = buildTemplateMessage(row({ template_key: 'leave_rejected', payload: { org: 'X', decision_note: null } }));
    expect(built.ok && built.params[4]).toBe('non précisé');
  });

  it('covers every template the database queues', () => {
    for (const key of ['leave_approved', 'leave_rejected', 'payroll_approval', 'payslip_ready', 'recognition_awarded', 'clock_reminder']) {
      expect(buildTemplateMessage(row({ template_key: key })).ok).toBe(true);
    }
  });

  it('honours the prefix and language options', () => {
    const built = buildTemplateMessage(row({ template_key: 'payslip_ready' }), { prefix: 'demo_', language: 'en' });
    expect(built.ok && built.template).toBe('demo_payslip_ready');
    expect(built.ok && (built.body.template as { language: { code: string } }).language.code).toBe('en');
  });

  it('refuses unknown templates, other channels and unusable numbers with a readable error', () => {
    expect(buildTemplateMessage(row({ template_key: 'inconnu' }))).toMatchObject({ ok: false });
    expect(buildTemplateMessage(row({ channel: 'email' }))).toMatchObject({ ok: false });
    const bad = buildTemplateMessage(row({ recipient: '12 34' }));
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.error).toContain('Numéro WhatsApp invalide');
  });
});

describe('classifyResponse', () => {
  it('reads the message id on success', () => {
    expect(classifyResponse(200, { messages: [{ id: 'wamid.ABC' }] })).toEqual({ kind: 'sent', providerId: 'wamid.ABC' });
  });

  it('retries on rate limits, server errors and an answer without message id', () => {
    expect(classifyResponse(429, {}).kind).toBe('retry');
    expect(classifyResponse(503, {}).kind).toBe('retry');
    expect(classifyResponse(400, { error: { code: 130429, message: 'Rate limit hit' } }).kind).toBe('retry');
    expect(classifyResponse(400, { error: { code: 131056 } }).kind).toBe('retry');
    expect(classifyResponse(200, {}).kind).toBe('retry');
  });

  it('stops the whole batch on a bad token or a blocked account', () => {
    expect(classifyResponse(401, { error: { code: 190, message: 'Invalid OAuth access token' } }).kind).toBe('auth');
    expect(classifyResponse(400, { error: { code: 190 } }).kind).toBe('auth');
    expect(classifyResponse(400, { error: { code: 131031 } }).kind).toBe('auth');
  });

  it('fails a message for good when the recipient or the template is the problem', () => {
    const outcome = classifyResponse(400, { error: { code: 131026, message: 'Message undeliverable', error_data: { details: 'Not a WhatsApp user' } } });
    expect(outcome).toEqual({ kind: 'fail', error: 'WhatsApp 131026 : Not a WhatsApp user' });
    expect(classifyResponse(404, { error: { code: 132001, message: 'Template does not exist' } }).kind).toBe('fail');
  });

  it('keeps stored errors short', () => {
    const outcome = classifyResponse(400, { error: { code: 100, message: 'x'.repeat(1000) } });
    expect(outcome.kind === 'fail' && outcome.error.length).toBeLessThanOrEqual(300);
  });
});

describe('safeEqual', () => {
  it('compares secrets', () => {
    expect(safeEqual('secret-secret-1234', 'secret-secret-1234')).toBe(true);
    expect(safeEqual('secret-secret-1234', 'secret-secret-1235')).toBe(false);
    expect(safeEqual('a', 'ab')).toBe(false);
  });
});
