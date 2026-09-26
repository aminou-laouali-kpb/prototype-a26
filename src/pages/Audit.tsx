import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session';
import { AuditLogEntry } from '../lib/types';
import { printAuditExport } from '../lib/exports';
import { auditActionLabel, auditEntityLabel, formatAuditDetails } from '../lib/audit';
import { EmptyState } from '../components/ui';
import { ScrollText, Download } from 'lucide-react';

export function AuditPage() {
  const { activeOrg } = useSession();
  const activeOrgId = activeOrg?.id ?? null;
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeOrgId) return;
    const { data } = await supabase
      .from('audit_log')
      .select('*')
      .eq('org_id', activeOrgId)
      .order('created_at', { ascending: false })
      .limit(200);
    setEntries((data ?? []) as AuditLogEntry[]);
    setLoading(false);
  }, [activeOrgId]);

  useEffect(() => { if (activeOrgId) load(); }, [activeOrgId, load]);

  if (!activeOrg) return null;


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Journal d’audit</h1>
          <p className="text-sm text-slate-500 mt-1">
            Historique inaltérable des actions sensibles : qui, quoi, quand.
          </p>
        </div>
        {entries.length > 0 && (
          <button
            onClick={() => printAuditExport(activeOrg, entries.map((e) => ({
              created_at: new Date(e.created_at).toLocaleString('fr-FR'),
              actor_email: e.actor_email,
              action: auditActionLabel(e.action),
              entity: auditEntityLabel(e.entity),
              details: formatAuditDetails(e.details),
            })))}
            className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> Export PDF tamponnable
          </button>
        )}
      </div>

      {loading ? null : entries.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200">
          <EmptyState
            icon={<ScrollText className="w-6 h-6" />}
            title="Journal vide"
            description="Les actions réalisées dans l’organisation seront tracées ici."
          />
        </div>
      ) : (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 font-semibold">Quand</th>
                  <th className="px-4 py-3 font-semibold">Qui</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                  <th className="px-4 py-3 font-semibold">Objet</th>
                  <th className="px-4 py-3 font-semibold hidden md:table-cell">Détails</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                      {new Date(e.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-4 py-3 text-slate-700 text-xs">{e.actor_email ?? 'Système'}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-slate-900">{auditActionLabel(e.action)}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{auditEntityLabel(e.entity)}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs hidden md:table-cell">
                      {formatAuditDetails(e.details)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
