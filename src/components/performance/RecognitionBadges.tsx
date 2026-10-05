import { Award, CalendarCheck, Handshake, Star, Target } from 'lucide-react';
import { badgeLabel } from '../../lib/performance';
import type { EmployeeRecognition, RecognitionBadge } from '../../lib/types';

const ICONS: Record<RecognitionBadge, React.ReactNode> = {
  salarie_du_mois: <Star className="w-3.5 h-3.5" />,
  assiduite_parfaite: <CalendarCheck className="w-3.5 h-3.5" />,
  objectifs_depasses: <Target className="w-3.5 h-3.5" />,
  esprit_equipe: <Handshake className="w-3.5 h-3.5" />,
};

export function BadgeChip({ badge, title }: { badge: RecognitionBadge; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-800 ring-1 ring-amber-200"
    >
      {ICONS[badge] ?? <Award className="w-3.5 h-3.5" />}
      {badgeLabel(badge)}
    </span>
  );
}

export function BadgeList({ items }: { items: EmployeeRecognition[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((r) => <BadgeChip key={r.id} badge={r.badge} title={r.note ?? undefined} />)}
    </div>
  );
}
