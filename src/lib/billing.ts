import type { OrgSubscription } from './types';
import { formatXof } from './types';

export const PLAN_CATALOG = [
  {
    id: 'trial' as const,
    name: 'Essai 30 jours',
    priceXof: 0,
    seats: 25,
    blurb: 'Toutes les fonctions pour démarrer une première paie au Niger.',
  },
  {
    id: 'pme' as const,
    name: 'PME',
    priceXof: 45000,
    seats: 50,
    blurb: 'Pointage, congés, pré-paie, exports CNSS / IUTS, Mobile Money.',
  },
  {
    id: 'groupe' as const,
    name: 'Groupe',
    priceXof: 120000,
    seats: 200,
    blurb: 'Multi-sites, audit renforcé, lots de paiement et support prioritaire.',
  },
  {
    id: 'cabinet' as const,
    name: 'Cabinet',
    priceXof: 180000,
    seats: 500,
    blurb: 'Multi-clients pour experts-comptables (plusieurs organisations).',
  },
];

export function planLabel(plan: OrgSubscription['plan']): string {
  return PLAN_CATALOG.find((p) => p.id === plan)?.name ?? plan;
}

export function subscriptionStatusLabel(status: OrgSubscription['status']): string {
  const map: Record<OrgSubscription['status'], string> = {
    trialing: 'Essai en cours',
    active: 'Actif',
    past_due: 'Paiement en retard',
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
