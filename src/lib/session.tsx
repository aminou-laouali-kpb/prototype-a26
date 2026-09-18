import { useEffect, useState, ReactNode, createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { Membership, Employee, Org, Role, OrgSettings, DEFAULT_ORG_SETTINGS, ROLE_LABELS } from './types';

export { ROLE_LABELS };

interface SessionContextValue {
  session: Session | null;
  loading: boolean;
  memberships: Membership[];
  activeOrg: Org | null;
  activeRole: Role | null;
  setActiveOrgId: (id: string) => void;
  refresh: () => Promise<void>;
  myEmployee: Employee | null;
  orgSettings: OrgSettings | null;
  refreshOrgSettings: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession doit être utilisé dans SessionProvider');
  return ctx;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [myEmployee, setMyEmployee] = useState<Employee | null>(null);
  const [orgSettings, setOrgSettings] = useState<OrgSettings | null>(null);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(() => localStorage.getItem('tempos_org'));
  const [refreshTick, setRefreshTick] = useState(0);
  const [settingsTick, setSettingsTick] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      (async () => {
        setSession(newSession);
        setRefreshTick((t) => t + 1);
      })();
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!session) {
        if (!cancelled) { setMemberships([]); setMyEmployee(null); }
        return;
      }
      const { data: ms } = await supabase
        .from('memberships')
        .select('id, org_id, role, orgs(*)')
        .eq('user_id', session.user.id);
      if (cancelled) return;
      setMemberships((ms ?? []) as unknown as Membership[]);

      // The same account can belong to several organisations. Resolve the
      // employee record only inside the organisation currently selected (or
      // the first returned membership while the selection is being restored).
      // Never auto-claim a record just because its e-mail matches: claiming is
      // an explicit, server-validated action from ClaimEmployeeCard.
      const selectedOrgId = (ms ?? []).find((membership) => membership.org_id === activeOrgId)?.org_id
        ?? (ms ?? [])[0]?.org_id;
      if (!selectedOrgId) {
        if (!cancelled) setMyEmployee(null);
        return;
      }
      const { data: byUser } = await supabase
        .from('employees')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('org_id', selectedOrgId)
        .limit(1);
      if (cancelled) return;
      if (byUser && byUser.length > 0) {
        setMyEmployee(byUser[0] as Employee);
      } else if (!cancelled) {
        setMyEmployee(null);
      }
    })();
    return () => { cancelled = true; };
  }, [session, refreshTick, session?.user?.id, activeOrgId]);

  const activeOrg: Org | null = (() => {
    if (!memberships.length) return null;
    const m = memberships.find((x) => x.org_id === activeOrgId) ?? memberships[0];
    return Array.isArray(m.orgs) ? m.orgs[0] ?? null : m.orgs ?? null;
  })();

  const activeRole: Role | null = (() => {
    if (!memberships.length) return null;
    const m = memberships.find((x) => x.org_id === activeOrg?.id) ?? memberships[0];
    return m?.role ?? null;
  })();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeOrg) { if (!cancelled) setOrgSettings(null); return; }
      const { data } = await supabase
        .from('org_settings')
        .select('*')
        .eq('org_id', activeOrg.id)
        .maybeSingle();
      if (cancelled) return;
      setOrgSettings(
        (data as OrgSettings | null) ?? {
          org_id: activeOrg.id,
          updated_at: new Date().toISOString(),
          ...DEFAULT_ORG_SETTINGS,
        },
      );
    })();
    return () => { cancelled = true; };
  }, [activeOrg, settingsTick]);

  const setActiveOrgId = (id: string) => {
    setActiveOrgIdState(id);
    localStorage.setItem('tempos_org', id);
  };

  const refresh = async () => setRefreshTick((t) => t + 1);
  const refreshOrgSettings = async () => setSettingsTick((t) => t + 1);

  return (
    <SessionContext.Provider
      value={{
        session, loading, memberships, activeOrg, activeRole, setActiveOrgId,
        refresh, myEmployee, orgSettings, refreshOrgSettings,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}
