import type { BonusKind, Role } from './types';

export const BONUS_KINDS: Array<{ id: BonusKind; label: string }> = [
  { id: 'performance', label: 'Prime annuelle de performance' },
  { id: '13e_mois', label: '13e mois' },
  { id: 'autre', label: 'Autre prime annuelle' },
];

export function bonusKindLabel(kind: BonusKind): string {
  return BONUS_KINDS.find((k) => k.id === kind)?.label ?? kind;
}

export function canGrantBonus(role: Role | null): boolean {
  return role === 'admin_rh' || role === 'manager' || role === 'cabinet';
}

export function canApproveBonus(role: Role | null): boolean {
  return role === 'admin_rh';
}

export function canScheduleBonus(role: Role | null): boolean {
  return role === 'admin_rh' || role === 'preparateur';
}

export function canCancelBonus(role: Role | null): boolean {
  return role === 'admin_rh';
}
