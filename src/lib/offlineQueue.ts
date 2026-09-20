const QUEUE_KEY = 'a26_offline_queue_v1';

export type OfflineActionType = 'clock_in' | 'clock_out' | 'approve_leave' | 'approve_timesheet';

export interface OfflineQueuedAction {
  id: string;
  type: OfflineActionType;
  orgId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

function readQueue(): OfflineQueuedAction[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineQueuedAction[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items: OfflineQueuedAction[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export function enqueueOfflineAction(
  type: OfflineActionType,
  orgId: string,
  payload: Record<string, unknown>,
): OfflineQueuedAction {
  const item: OfflineQueuedAction = {
    id: crypto.randomUUID(),
    type,
    orgId,
    payload,
    createdAt: new Date().toISOString(),
  };
  const q = readQueue();
  q.push(item);
  writeQueue(q);
  return item;
}

export function listOfflineActions(orgId?: string): OfflineQueuedAction[] {
  const q = readQueue();
  return orgId ? q.filter((i) => i.orgId === orgId) : q;
}

export function removeOfflineAction(id: string): void {
  writeQueue(readQueue().filter((i) => i.id !== id));
}

export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

/** Rejoue les actions hors-ligne quand le réseau revient (best-effort). */
export async function flushOfflineQueue(
  replay: (action: OfflineQueuedAction) => Promise<void>,
): Promise<number> {
  if (!isOnline()) return 0;
  const items = listOfflineActions();
  let done = 0;
  for (const item of items) {
    try {
      await replay(item);
      removeOfflineAction(item.id);
      done++;
    } catch {
      break;
    }
  }
  return done;
}

/** Enregistre le service worker PWA (cache shell) si le navigateur le permet. */
export async function registerServiceWorker(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    // Ignore registration failures (dev / insecure contexts).
  }
  window.addEventListener('online', () => {
    void flushOfflineQueue(async (action) => {
      if (action.type === 'clock_in') {
        const { supabase } = await import('./supabase');
        const { error } = await supabase.from('clock_entries').insert({
          org_id: action.orgId,
          employee_id: action.payload.employeeId,
          work_date: action.payload.work_date,
          clock_in: action.payload.clock_in,
          last_active_at: action.payload.clock_in,
          active_seconds: 0,
          source: 'offline-sync',
        });
        if (error) throw error;
      }
    });
  });
}
