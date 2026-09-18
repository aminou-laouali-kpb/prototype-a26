import { Link } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { useSession } from '../lib/session';
import type { Role } from '../lib/types';

export function RoleRoute({
  roles,
  children,
}: {
  roles: readonly Role[];
  children: React.ReactNode;
}) {
  const { activeRole } = useSession();
  if (activeRole && roles.includes(activeRole)) return children;

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 px-6 py-16 text-center">
      <ShieldOff className="w-8 h-8 text-slate-300 mx-auto mb-3" />
      <h1 className="text-lg font-semibold text-slate-900">Accès refusé</h1>
      <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
        Ce menu n’est pas disponible avec votre rôle actuel. Revenez à l’accueil
        ou demandez un accès à l’administrateur RH.
      </p>
      <Link
        to="/"
        className="inline-flex mt-5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition"
      >
        Retour à l’accueil
      </Link>
    </div>
  );
}
