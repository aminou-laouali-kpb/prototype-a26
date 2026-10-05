import type {
  ObjectiveDirection, ObjectiveStatus, PerformanceCycleKind, PerformanceCycleStatus,
  PerformanceLevel, PerkKind, PerkStatus, RecognitionBadge, Role,
} from './types';

/** Garde-fou n° 1 : un score ouvre un échange avec le responsable, il ne touche jamais au salaire. */
export const PERFORMANCE_GUARDRAILS = [
  'Les indicateurs automatiques ne servent jamais, seuls, à sanctionner. Un niveau « à suivre » ouvre un échange avec le responsable ; il ne coupe pas le salaire.',
  'Chaque salarié voit son score et chaque ligne qui le compose. Un chiffre sans détail n’est pas affiché.',
  'Une correction de pointage faite par un responsable est tracée et ne baisse pas le score du salarié.',
  'Le classement nominatif ne sort pas de l’équipe : le mur montre des badges, pas une liste ordonnée de toute la société.',
  'Une prime de performance entre dans le brut (cotisations, impôt) par le circuit des primes. Sa nature juridique se confirme avec l’expert local.',
  'Un cycle clos ne se recalcule pas en silence : une correction passe par une réouverture motivée et tracée.',
] as const;

export const CYCLE_KINDS: Array<{ id: PerformanceCycleKind; label: string }> = [
  { id: 'month', label: 'Mois' },
  { id: 'quarter', label: 'Trimestre' },
  { id: 'semester', label: 'Semestre' },
  { id: 'year', label: 'Année' },
];

export function cycleStatusLabel(status: PerformanceCycleStatus): string {
  return { open: 'Ouvert', review: 'En revue', closed: 'Clos' }[status];
}

export const CYCLE_STATUS_COLORS: Record<PerformanceCycleStatus, string> = {
  open: 'bg-sky-50 text-sky-700 ring-sky-200',
  review: 'bg-amber-50 text-amber-700 ring-amber-200',
  closed: 'bg-slate-800 text-white ring-slate-800',
};

export function objectiveStatusLabel(status: ObjectiveStatus): string {
  return {
    draft: 'Brouillon',
    active: 'À déclarer',
    self_reported: 'Déclaré, à valider',
    validated: 'Validé',
  }[status];
}

export const OBJECTIVE_STATUS_COLORS: Record<ObjectiveStatus, string> = {
  draft: 'bg-slate-100 text-slate-600 ring-slate-200',
  active: 'bg-sky-50 text-sky-700 ring-sky-200',
  self_reported: 'bg-amber-50 text-amber-700 ring-amber-200',
  validated: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

export function levelLabel(level: PerformanceLevel): string {
  return {
    non_evalue: 'Non évalué',
    a_suivre: 'À suivre',
    conforme: 'Conforme',
    bon: 'Bon',
    excellent: 'Excellent',
  }[level];
}

export const LEVEL_COLORS: Record<PerformanceLevel, string> = {
  non_evalue: 'bg-slate-100 text-slate-600 ring-slate-200',
  a_suivre: 'bg-amber-50 text-amber-700 ring-amber-200',
  conforme: 'bg-sky-50 text-sky-700 ring-sky-200',
  bon: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  excellent: 'bg-teal-600 text-white ring-teal-600',
};

export const BADGES: Array<{ id: RecognitionBadge; label: string; hint: string; manualOnly?: boolean }> = [
  { id: 'salarie_du_mois', label: 'Salarié du mois', hint: 'Meilleur score « excellent » du cycle.' },
  { id: 'assiduite_parfaite', label: 'Assiduité parfaite', hint: 'Tous les jours ouvrés pointés.' },
  { id: 'objectifs_depasses', label: 'Objectifs dépassés', hint: 'Atteinte pondérée des objectifs validés d’au moins 110 %.' },
  { id: 'esprit_equipe', label: 'Esprit d’équipe', hint: 'Toujours attribué à la main : aucun indicateur ne le mesure.', manualOnly: true },
];

export function badgeLabel(badge: RecognitionBadge): string {
  return BADGES.find((b) => b.id === badge)?.label ?? badge;
}

export function perkKindLabel(kind: PerkKind): string {
  return kind === 'bonus_leave' ? 'Jours de congé bonus' : 'Budget formation';
}

export function perkStatusLabel(status: PerkStatus): string {
  return { proposed: 'Proposé', approved: 'Validé', consumed: 'Consommé', cancelled: 'Annulé' }[status];
}

export const PERK_STATUS_COLORS: Record<PerkStatus, string> = {
  proposed: 'bg-amber-50 text-amber-700 ring-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  consumed: 'bg-slate-100 text-slate-600 ring-slate-200',
  cancelled: 'bg-slate-100 text-slate-500 ring-slate-200',
};

/** Fixer, valider, calculer, proposer : RH et manager. */
export function canManagePerformance(role: Role | null): boolean {
  return role === 'admin_rh' || role === 'manager';
}

/** Réglages, cycles, validation des récompenses : RH seulement. */
export function canConfigurePerformance(role: Role | null): boolean {
  return role === 'admin_rh';
}

/** Auditeur et cabinet lisent tout, ne modifient rien. */
export function isPerformanceReadOnly(role: Role | null): boolean {
  return role === 'auditeur' || role === 'cabinet';
}

/** Reflet de `private.objective_attainment` (SQL) pour l’aperçu côté écran, plafonné à 200 %. */
export function objectiveAttainment(direction: ObjectiveDirection, target: number, achieved: number | null): number | null {
  if (achieved === null || achieved === undefined) return null;
  if (direction === 'lower') {
    if (achieved <= target || achieved === 0) return 100;
    return Math.min(200, Math.round((target / achieved) * 10000) / 100);
  }
  if (target === 0) return 100;
  return Math.min(200, Math.round((achieved / target) * 10000) / 100);
}

/** Nombre de places « haut du service » : au moins 1, puis le premier dixième arrondi au supérieur. */
export function topSlots(departmentSize: number): number {
  return Math.max(1, Math.ceil(Math.max(departmentSize, 1) / 10));
}

export function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}

export function formatQuantity(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

/** Trimestre ou mois civil contenant `ref`, pour préremplir l’ouverture d’un cycle. */
export function defaultCycleRange(kind: PerformanceCycleKind, ref: Date = new Date()): { start: string; end: string; label: string } {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  if (kind === 'month') {
    return { start: iso(new Date(y, m, 1)), end: iso(new Date(y, m + 1, 0)), label: `${MONTHS[m]} ${y}` };
  }
  if (kind === 'quarter') {
    const q = Math.floor(m / 3);
    return { start: iso(new Date(y, q * 3, 1)), end: iso(new Date(y, q * 3 + 3, 0)), label: `T${q + 1} ${y}` };
  }
  if (kind === 'semester') {
    const h = m < 6 ? 0 : 1;
    return { start: iso(new Date(y, h * 6, 1)), end: iso(new Date(y, h * 6 + 6, 0)), label: `S${h + 1} ${y}` };
  }
  return { start: `${y}-01-01`, end: `${y}-12-31`, label: `Année ${y}` };
}
