import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { supabase } from './supabase';
import { useSession } from './session';
import { ClockEntry } from './types';
import {
  fetchOpenEntry, startSession, recordPresence, endSession, grossSeconds,
} from './workSession';

export const AUTO_LOGOUT_KEY = 'tempos_autologout';

interface WorkSessionValue {
  entry: ClockEntry | null;
  active: boolean;
  elapsedSeconds: number;
  activeSeconds: number;
  busy: boolean;
  prompting: boolean;
  graceRemaining: number;
  reminderIntervalMinutes: number;
  graceMinutes: number;
  start: () => Promise<void>;
  end: () => Promise<void>;
  confirm: () => Promise<void>;
}

const WorkSessionContext = createContext<WorkSessionValue | null>(null);

export function useWorkSession(): WorkSessionValue {
  const ctx = useContext(WorkSessionContext);
  if (!ctx) throw new Error('useWorkSession doit être utilisé dans WorkSessionProvider');
  return ctx;
}

export function WorkSessionProvider({ children }: { children: ReactNode }) {
  const { myEmployee, activeOrg, orgSettings } = useSession();
  const activeOrgId = activeOrg?.id ?? null;
  const myEmployeeId = myEmployee?.id ?? null;
  const [entry, setEntry] = useState<ClockEntry | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const endingRef = useRef(false);
  const actionRef = useRef(false);
  const entryRef = useRef<ClockEntry | null>(null);
  const loadRef = useRef(0);
  const wasPrompting = useRef(false);
  const promptedEntryId = useRef<string | null>(null);

  useEffect(() => {
    const requestId = ++loadRef.current;
    let cancelled = false;
    entryRef.current = null;
    setEntry(null);
    endingRef.current = false;
    wasPrompting.current = false;
    promptedEntryId.current = null;
    (async () => {
      if (!myEmployeeId || !activeOrgId) return;
      const open = await fetchOpenEntry(myEmployeeId, activeOrgId);
      if (cancelled || requestId !== loadRef.current) return;
      const current = open?.org_id === activeOrgId ? open : null;
      entryRef.current = current;
      setEntry(current);
    })();
    return () => { cancelled = true; };
  }, [activeOrgId, myEmployeeId]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const interval = orgSettings?.reminder_interval_minutes ?? 25;
  const grace = orgSettings?.grace_minutes ?? 5;
  const reminderSec = interval * 60;
  const graceLimitSec = (interval + grace) * 60;
  const capSec = graceLimitSec;

  // Ignore an entry from a previous organisation while the session context is
  // switching. This prevents displaying or closing another organisation's session.
  const currentEntry = entry?.org_id === activeOrgId ? entry : null;
  const idleSec = currentEntry
    ? Math.max(0, (now - new Date(currentEntry.last_active_at ?? currentEntry.clock_in).getTime()) / 1000)
    : 0;
  const prompting = !!currentEntry && idleSec >= reminderSec && idleSec < graceLimitSec;
  const overLimit = !!currentEntry && idleSec >= graceLimitSec;
  const graceRemaining = Math.max(0, Math.ceil(graceLimitSec - idleSec));

  useEffect(() => {
    if (!overLimit || !currentEntry || endingRef.current) return;
    const entryToClose = currentEntry;
    endingRef.current = true;
    (async () => {
      try {
        // endSession guarantees a strictly later clock_out, including when no
        // presence confirmation happened after clock_in.
        await endSession(entryToClose, orgSettings, 'auto_inactive');
        if (entryRef.current?.id === entryToClose.id) {
          entryRef.current = null;
          setEntry(null);
        }
        try { localStorage.setItem(AUTO_LOGOUT_KEY, '1'); } catch { /* ignore */ }
        await supabase.auth.signOut();
      } catch {
        // Keep the entry open when persistence fails so a later render can
        // retry instead of logging out with an unclosed session.
        endingRef.current = false;
      }
    })();
  }, [currentEntry, orgSettings, overLimit, now]);

  useEffect(() => {
    if (prompting && currentEntry && (!wasPrompting.current || promptedEntryId.current !== currentEntry.id)) {
      wasPrompting.current = true;
      promptedEntryId.current = currentEntry.id;
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification('Êtes-vous toujours là ?', {
            body: 'Confirmez votre présence pour garder votre session ouverte.',
          });
        } catch { /* ignore */ }
      }
    } else if (!prompting) {
      wasPrompting.current = false;
      promptedEntryId.current = null;
    }
  }, [currentEntry, prompting]);

  const start = async () => {
    if (!activeOrg || !myEmployee || actionRef.current || entryRef.current?.org_id === activeOrg.id) return;
    loadRef.current += 1;
    actionRef.current = true;
    setBusy(true);
    try {
      const e = await startSession(activeOrg.id, myEmployee.id);
      endingRef.current = false;
      entryRef.current = e;
      setEntry(e);
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    } finally {
      actionRef.current = false;
      setBusy(false);
    }
  };

  const confirm = async () => {
    const current = entryRef.current;
    if (!current || actionRef.current || endingRef.current) return;
    const currentIdleSec = Math.max(0, (Date.now() - new Date(current.last_active_at ?? current.clock_in).getTime()) / 1000);
    if (currentIdleSec >= graceLimitSec) return;
    loadRef.current += 1;
    actionRef.current = true;
    setBusy(true);
    try {
      const e = await recordPresence(current, orgSettings);
      if (entryRef.current?.id === current.id) {
        entryRef.current = e;
        setEntry(e);
      }
    } finally {
      actionRef.current = false;
      setBusy(false);
    }
  };

  const end = async () => {
    const current = entryRef.current;
    if (!current || actionRef.current || endingRef.current) return;
    loadRef.current += 1;
    actionRef.current = true;
    endingRef.current = true;
    setBusy(true);
    try {
      await endSession(current, orgSettings, 'manual');
      if (entryRef.current?.id === current.id) {
        entryRef.current = null;
        setEntry(null);
      }
    } catch (error) {
      endingRef.current = false;
      throw error;
    } finally {
      actionRef.current = false;
      setBusy(false);
    }
  };

  const activeSecondsPreview = currentEntry
    ? Math.max(0, Number(currentEntry.active_seconds) || 0) + Math.min(idleSec, capSec)
    : 0;

  const value: WorkSessionValue = {
    entry: currentEntry,
    active: !!currentEntry,
    elapsedSeconds: currentEntry ? grossSeconds(currentEntry) : 0,
    activeSeconds: Math.round(activeSecondsPreview),
    busy,
    prompting,
    graceRemaining,
    reminderIntervalMinutes: interval,
    graceMinutes: grace,
    start,
    end,
    confirm,
  };

  return (
    <WorkSessionContext.Provider value={value}>
      {children}
      {prompting && <PresencePrompt />}
    </WorkSessionContext.Provider>
  );
}

function PresencePrompt() {
  const { graceRemaining, confirm, end, busy } = useWorkSession();
  const mm = Math.floor(graceRemaining / 60);
  const ss = String(graceRemaining % 60).padStart(2, '0');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 overflow-hidden">
        <div className="bg-gradient-to-br from-amber-500 to-orange-600 px-6 py-5 text-white">
          <h2 className="text-lg font-bold">Êtes-vous toujours là ?</h2>
          <p className="text-sm text-amber-50 mt-1">
            Confirmez votre présence pour garder votre session de travail ouverte.
          </p>
        </div>
        <div className="p-6 space-y-5">
          <div className="text-center">
            <div className="text-4xl font-bold tabular-nums text-slate-900">{mm}:{ss}</div>
            <p className="text-xs text-slate-500 mt-1">
              Sans confirmation, votre session sera clôturée et vous serez déconnecté.
            </p>
          </div>
          <button
            onClick={() => confirm()}
            disabled={busy}
            className="w-full rounded-lg bg-teal-600 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition"
          >
            Je suis là
          </button>
          <button
            onClick={() => end()}
            disabled={busy}
            className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
          >
            Terminer ma session maintenant
          </button>
        </div>
      </div>
    </div>
  );
}
