import { describe, expect, it } from 'vitest';
import { PLAN_CATALOG, listPriceAtCap, quoteAnnualXof, quoteMonthlyXof } from './billing';

const pme = PLAN_CATALOG.find((p) => p.id === 'pme')!;
const groupe = PLAN_CATALOG.find((p) => p.id === 'groupe')!;
const cabinet = PLAN_CATALOG.find((p) => p.id === 'cabinet')!;
const trial = PLAN_CATALOG.find((p) => p.id === 'trial')!;

describe('subscription quotes', () => {
  it('keeps trial free', () => {
    expect(quoteMonthlyXof(trial, 25)).toBe(0);
  });

  it('applies the PME floor below 30 employees (75 000 / 2 500)', () => {
    expect(quoteMonthlyXof(pme, 0)).toBe(75000);
    expect(quoteMonthlyXof(pme, 19)).toBe(75000);
    expect(quoteMonthlyXof(pme, 30)).toBe(75000);
    expect(quoteMonthlyXof(pme, 31)).toBe(77500);
  });

  it('bills PME at 2 500 F per employee up to 50', () => {
    expect(quoteMonthlyXof(pme, 40)).toBe(100000);
    expect(quoteMonthlyXof(pme, 50)).toBe(125000);
    expect(quoteMonthlyXof(pme, 80)).toBe(125000);
    expect(listPriceAtCap(pme)).toBe(125000);
  });

  it('applies Groupe volume rate 2 000 F with a 200 000 F floor', () => {
    expect(quoteMonthlyXof(groupe, 50)).toBe(200000);
    expect(quoteMonthlyXof(groupe, 120)).toBe(240000);
    expect(listPriceAtCap(groupe)).toBe(400000);
  });

  it('keeps Cabinet above a 350 000 F dossier floor', () => {
    expect(quoteMonthlyXof(cabinet, 80)).toBe(350000);
    expect(quoteMonthlyXof(cabinet, 200)).toBe(360000);
    expect(listPriceAtCap(cabinet)).toBe(900000);
  });

  it('gives two months free on the annual quote', () => {
    expect(quoteAnnualXof(pme, 50)).toBe(1_250_000);
  });

  it('is above the previous flat catalog (45 / 120 / 180 kF)', () => {
    expect(listPriceAtCap(pme)).toBeGreaterThan(45000);
    expect(listPriceAtCap(groupe)).toBeGreaterThan(120000);
    expect(listPriceAtCap(cabinet)).toBeGreaterThan(180000);
  });
});
