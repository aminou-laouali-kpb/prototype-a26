import type { OrgSubscription } from './types';
import { formatXof } from './types';

/**
 * Catalogue 2026 — recoupé le 23/09/2026.
 *
 * Ancien forfait (45 / 120 / 180 kF pour 50 / 200 / 500 sièges) = 900 / 600 / 360 F
 * par salarié : sous le plancher SaaS UEMOA et sous le coût d’un classeur Excel.
 *
 * Ancrages :
 * - SunuPayRH (SN) : 1 500 F HT/salarié (Essentiel) · 2 500 F (Premium) + plancher
 * - FasoPaie (BF) : 4 900 F + 500 F/salarié (entrée de gamme, un pays)
 * - Cabinets CI : Excel paie 57–200 kF (achat) ; externalisation 50–300 kF/mois
 * - Sage 100 Paie Afrique : ~2–4 M F / an
 *
 * A26 (deux packs pays, quatre yeux, lots Mobile Money, audit) se cale sur le
 * Premium UEMOA (2 500 F) avec dégressivité volume, pas sur le discount 500 F.
 */
export const PLAN_CATALOG = [
  {
    id: 'trial' as const,
    name: 'Essai 30 jours',
    unitXof: 0,
    floorXof: 0,
    seats: 25,
    blurb: 'Toutes les fonctions pour une première paie au Niger ou en Côte d’Ivoire.',
  },
  {
    id: 'pme' as const,
    name: 'PME',
    unitXof: 2500,
    floorXof: 75000,
    seats: 50,
    blurb: 'Pointage, congés, pré-paie CNSS/IUTS ou CNPS/ITS, lots Mobile Money, quatre yeux.',
  },
  {
    id: 'groupe' as const,
    name: 'Groupe',
    unitXof: 2000,
    floorXof: 200000,
    seats: 200,
    blurb: 'Dégressif volume (−20 %), multi-sites, audit renforcé, support prioritaire.',
  },
  {
    id: 'cabinet' as const,
    name: 'Cabinet',
    unitXof: 1800,
    floorXof: 350000,
    seats: 500,
    blurb: 'Multi-clients pour experts-comptables. Prix plancher dossier, puis à l’effectif.',
  },
] as const;

export type PlanOffer = (typeof PLAN_CATALOG)[number];

/** Mensuel HT : max(plancher, salariés facturés × tarif unitaire), salariés plafonnés au plan. */
export function quoteMonthlyXof(plan: PlanOffer, employees: number): number {
  if (plan.unitXof <= 0) return 0;
  const billed = Math.max(0, Math.min(Math.floor(Math.max(0, employees)), plan.seats));
  return Math.max(plan.floorXof, billed * plan.unitXof);
}

/** Annuel HT : 10 mois (2 mois offerts, usage courant UEMOA). */
export function quoteAnnualXof(plan: PlanOffer, employees: number): number {
  return quoteMonthlyXof(plan, employees) * 10;
}

export function listPriceAtCap(plan: PlanOffer): number {
  return quoteMonthlyXof(plan, plan.seats);
}

export function planLabel(plan: OrgSubscription['plan']): string {
  return PLAN_CATALOG.find((p) => p.id === plan)?.name ?? plan;
}

export function subscriptionStatusLabel(status: OrgSubscription['status']): string {
  const map: Record<OrgSubscription['status'], string> = {
    trialing: 'Essai en cours',
    active: 'Actif',
    past_due: 'En attente de paiement',
    cancelled: 'Résilié',
    expired: 'Expiré',
  };
  return map[status] ?? status;
}

export function daysLeftInTrial(sub: OrgSubscription | null): number | null {
  if (!sub?.trial_ends_at) return null;
  const end = new Date(sub.trial_ends_at).getTime();
  const diff = Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000));
  return diff;
}

export function formatPlanPrice(amount: number): string {
  if (amount <= 0) return 'Gratuit';
  return `${formatXof(amount)} / mois`;
}
