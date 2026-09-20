import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Clock, LayoutDashboard, Users, CalendarCheck, Fingerprint, LogOut, Settings,
  ScrollText, Menu, X, Wallet, ClipboardList, Banknote, CreditCard,
} from 'lucide-react';
import { useSession, ROLE_LABELS } from '../lib/session';
import { PAGE_ROLES } from '../lib/access';
import { ROLE_COLORS, Role } from '../lib/types';
import { supabase } from '../lib/supabase';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  roles?: readonly Role[];
}

const NAV: NavItem[] = [
  { to: '/', label: 'Tableau de bord', icon: <LayoutDashboard className="w-4 h-4" /> },
  { to: '/salaries', label: 'Salariés', icon: <Users className="w-4 h-4" />, roles: PAGE_ROLES.salaries },
  { to: '/temps', label: 'Temps de travail', icon: <Clock className="w-4 h-4" /> },
  { to: '/conges', label: 'Congés', icon: <CalendarCheck className="w-4 h-4" /> },
  { to: '/feuilles', label: 'Feuilles de temps', icon: <ClipboardList className="w-4 h-4" />, roles: PAGE_ROLES.feuilles },
  { to: '/paie', label: 'Pré-paie', icon: <Wallet className="w-4 h-4" />, roles: PAGE_ROLES.paie },
  { to: '/paiements', label: 'Paiements', icon: <Banknote className="w-4 h-4" />, roles: PAGE_ROLES.paiements },
  { to: '/bulletins', label: 'Mes bulletins', icon: <Fingerprint className="w-4 h-4" />, roles: PAGE_ROLES.bulletins },
  { to: '/parametres', label: 'Paramètres', icon: <Settings className="w-4 h-4" />, roles: PAGE_ROLES.parametres },
  { to: '/abonnement', label: 'Abonnement', icon: <CreditCard className="w-4 h-4" />, roles: PAGE_ROLES.abonnement },
  { to: '/audit', label: 'Journal d’audit', icon: <ScrollText className="w-4 h-4" />, roles: PAGE_ROLES.audit },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { activeOrg, activeRole, memberships, setActiveOrgId, session } = useSession();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const orgMemberships = memberships.flatMap((membership) => {
    const org = Array.isArray(membership.orgs) ? membership.orgs[0] : membership.orgs;
    return org ? [{ membership, org }] : [];
  });

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Keep the persisted choice aligned with the safe fallback selected by the
  // session when a previously selected organisation is no longer available.
  useEffect(() => {
    const storedOrgId = localStorage.getItem('tempos_org');
    if (activeOrg && storedOrgId !== activeOrg.id) setActiveOrgId(activeOrg.id);
  }, [activeOrg, setActiveOrgId]);

  const items = NAV.filter((item) => !item.roles || (activeRole && item.roles.includes(activeRole)));

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className={`fixed lg:sticky lg:top-0 lg:h-screen inset-y-0 left-0 z-40 w-64 bg-slate-950 text-slate-300 flex flex-col transition-transform duration-200 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-3 px-5 h-16 border-b border-white/10 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-teal-500/20 ring-1 ring-teal-400/30 flex items-center justify-center">
            <Clock className="w-5 h-5 text-teal-300" />
          </div>
          <div>
            <div className="text-white font-bold tracking-tight leading-none">Prototype A26</div>
            <div className="text-[11px] text-slate-400 mt-0.5">KPB Global LLC</div>
          </div>
          <button className="ml-auto lg:hidden text-slate-400 hover:text-white" onClick={() => setOpen(false)} aria-label="Fermer le menu">
            <X className="w-5 h-5" />
          </button>
        </div>

        {orgMemberships.length > 1 && activeOrg && (
          <div className="px-3 pt-3">
            <label className="block text-[11px] uppercase tracking-wide text-slate-500 px-1 mb-1">Organisation</label>
            <select
              value={activeOrg.id}
              onChange={(e) => setActiveOrgId(e.target.value)}
              aria-label="Organisation active"
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {orgMemberships.map(({ membership, org }) => (
                <option key={membership.id} value={membership.org_id} className="bg-slate-900">{org.name}</option>
              ))}
            </select>
          </div>
        )}

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-teal-500/15 text-teal-300 ring-1 ring-teal-400/20'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 pb-4 border-t border-white/10 pt-3 shrink-0">
          <NavLink
            to="/profil"
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `block px-3 py-2 rounded-lg transition ${isActive ? 'bg-white/5' : 'hover:bg-white/5'}`
            }
          >
            <div className="text-sm text-white truncate">{session?.user.email}</div>
            {activeRole && (
              <span className={`inline-flex mt-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 ${ROLE_COLORS[activeRole]}`}>
                {ROLE_LABELS[activeRole]}
              </span>
            )}
          </NavLink>
          <button
            onClick={async () => { await supabase.auth.signOut(); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 transition"
          >
            <LogOut className="w-4 h-4" />
            Se déconnecter
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="lg:hidden sticky top-0 z-30 bg-slate-950 text-white flex items-center gap-3 px-4 h-14 shrink-0">
          <button onClick={() => setOpen(true)} aria-label="Ouvrir le menu" aria-expanded={open}>
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-bold">Prototype A26</span>
          <span className="text-xs text-slate-400 truncate ml-auto">{activeOrg?.name}</span>
        </header>
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          <div className="max-w-7xl">{children}</div>
        </main>
      </div>

      {open && <div className="fixed inset-0 z-30 bg-slate-900/60 lg:hidden" onClick={() => setOpen(false)} />}
    </div>
  );
}
