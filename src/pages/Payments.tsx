import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session';
import {
  PaymentBatch, PaymentBatchLine, PayrollLine, PayrollPeriod,
  formatXof, monthLabel, statusLabel, STATUS_COLORS,
} from '../lib/types';
import { getCountryPack } from '../lib/countryPacks';
import { exportMobileMoneyFile, printCashReceipt } from '../lib/exports';
import { ErrorBanner, Spinner, EmptyState } from '../components/ui';
import { Banknote, Download, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

export function PaymentsPage() {
  const { activeOrg, activeRole, session } = useSession();
  const pack = getCountryPack(activeOrg?.country_code);
  const canEdit = activeRole === 'admin_rh' || activeRole === 'preparateur' || activeRole === 'approveur_paie';

  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [periodId, setPeriodId] = useState<string>('');
  const [batches, setBatches] = useState<PaymentBatch[]>([]);
  const [lines, setLines] = useState<(PaymentBatchLine & { employee?: PaymentBatchLine['employee'] })[]>([]);
  const [payrollLines, setPayrollLines] = useState<PayrollLine[]>([]);
  const [activeBatch, setActiveBatch] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadPeriods = useCallback(async () => {
    if (!activeOrg) return;
    const { data } = await supabase
      .from('payroll_periods')
      .select('*')
      .eq('org_id', activeOrg.id)
      .in('status', ['approved', 'locked', 'prepared'])
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false });
    const list = (data ?? []) as PayrollPeriod[];
    setPeriods(list);
    setPeriodId((current) => current || list[0]?.id || '');
  }, [activeOrg, setPeriods, setPeriodId]);

  const loadBatches = useCallback(async () => {
    if (!activeOrg || !periodId) {
      setBatches([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const [{ data: b }, { data: pl }] = await Promise.all([
      supabase.from('payment_batches').select('*').eq('org_id', activeOrg.id).eq('period_id', periodId).order('created_at', { ascending: false }),
      supabase.from('payroll_lines').select('*, employee:employees!employee_id(*)').eq('period_id', periodId),
    ]);
    setBatches((b ?? []) as PaymentBatch[]);
    setPayrollLines((pl ?? []) as PayrollLine[]);
    setLoading(false);
  }, [activeOrg, periodId]);

  const loadLines = useCallback(async (batchId: string) => {
    const { data } = await supabase
      .from('payment_batch_lines')
      .select('*, employee:employees!employee_id(*)')
      .eq('batch_id', batchId)
      .order('amount', { ascending: false });
    setLines((data ?? []) as PaymentBatchLine[]);
    setActiveBatch(batchId);
  }, [setLines, setActiveBatch]);

  useEffect(() => { loadPeriods(); }, [loadPeriods]);
  useEffect(() => { loadBatches(); }, [loadBatches]);

  const createBatch = async (channel: PaymentBatch['channel']) => {
    if (!activeOrg || !periodId || !canEdit) return;
    setBusy(true);
    setError(null);
    try {
      const { data: batch, error: err } = await supabase
        .from('payment_batches')
        .insert({
          org_id: activeOrg.id,
          period_id: periodId,
          channel,
          operator: channel === 'mobile_money' ? pack.mobileOperators[0] : null,
          status: 'draft',
          created_by: session?.user.id ?? null,
        })
        .select('*')
        .single();
      if (err) throw err;

      const eligible = payrollLines.filter((l) => {
        const m = l.employee?.payment_method;
        if (channel === 'mobile_money') return !m || m === 'mobile_money';
        if (channel === 'cash') return m === 'cash';
        if (channel === 'bank') return m === 'bank';
        return true;
      });

      if (eligible.length) {
        const { error: lineErr } = await supabase.from('payment_batch_lines').insert(
          eligible.map((l) => ({
            org_id: activeOrg.id,
            batch_id: batch.id,
            payroll_line_id: l.id,
            employee_id: l.employee_id,
            amount: Number(l.net),
            payment_method: l.employee?.payment_method ?? (channel === 'mixed' ? 'mobile_money' : channel),
            mobile_operator: l.employee?.mobile_operator ?? null,
            payment_account: l.employee?.payment_account ?? null,
            status: 'pending',
          })),
        );
        if (lineErr) throw lineErr;
      }

      await supabase.from('audit_log').insert({
        org_id: activeOrg.id,
        actor: session?.user.id ?? null,
        action: 'create_payment_batch',
        entity: 'payment_batches',
        entity_id: batch.id,
        details: { channel, lines: eligible.length },
      });

      await loadBatches();
      await loadLines(batch.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Création du lot impossible (appliquez la migration 011).');
    } finally {
      setBusy(false);
    }
  };

  const setLineStatus = async (line: PaymentBatchLine, status: 'paid' | 'failed' | 'pending', reason?: string) => {
    if (!canEdit) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase
      .from('payment_batch_lines')
      .update({
        status,
        paid_at: status === 'paid' ? new Date().toISOString() : null,
        failure_reason: status === 'failed' ? (reason || 'Échec opérateur') : null,
      })
      .eq('id', line.id);
    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    if (activeBatch) {
      const { data: all } = await supabase.from('payment_batch_lines').select('status').eq('batch_id', activeBatch);
      const statuses = (all ?? []).map((x) => x.status as string);
      let batchStatus: PaymentBatch['status'] = 'exported';
      if (statuses.every((s) => s === 'paid')) batchStatus = 'paid';
      else if (statuses.some((s) => s === 'failed') && statuses.some((s) => s === 'paid')) batchStatus = 'partial';
      else if (statuses.every((s) => s === 'failed')) batchStatus = 'failed';
      else if (statuses.some((s) => s === 'paid')) batchStatus = 'partial';
      const { error: batchErr } = await supabase
        .from('payment_batches')
        .update({ status: batchStatus, updated_at: new Date().toISOString() })
        .eq('id', activeBatch);
      if (batchErr) setError(`Ligne mise à jour, mais statut du lot inchangé : ${batchErr.message}`);
      await loadBatches();
      await loadLines(activeBatch);
    }
    setBusy(false);
  };

  const period = periods.find((p) => p.id === periodId) ?? null;

  if (!activeOrg) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Paiements salaires</h1>
          <p className="text-sm text-slate-500 mt-1">
            Lots Mobile Money ({pack.mobileOperators.slice(0, 3).join(', ')}…), espèces avec reçu, suivi payé / échec.
          </p>
        </div>
        <select
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={periodId}
          onChange={(e) => { setPeriodId(e.target.value); setActiveBatch(null); setLines([]); }}
          aria-label="Cycle de paie"
        >
          {periods.map((p) => (
            <option key={p.id} value={p.id}>{monthLabel(p.period_year, p.period_month)} ({statusLabel(p.status)})</option>
          ))}
        </select>
      </div>

      <ErrorBanner message={error} />

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <button disabled={busy || !periodId} onClick={() => createBatch('mobile_money')} className="rounded-lg bg-teal-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 inline-flex items-center gap-2">
            <Banknote className="w-4 h-4" /> Lot Mobile Money
          </button>
          <button disabled={busy || !periodId} onClick={() => createBatch('cash')} className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Lot espèces
          </button>
          <button disabled={busy || !periodId} onClick={() => createBatch('mixed')} className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Lot mixte
          </button>
          {period && payrollLines.length > 0 && (
            <button
              onClick={() => exportMobileMoneyFile(pack, period, payrollLines)}
              className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
            >
              <Download className="w-4 h-4" /> Fichier masse MM
            </button>
          )}
        </div>
      )}

      {loading ? (
        <Spinner label="Chargement des lots…" />
      ) : batches.length === 0 ? (
        <EmptyState title="Aucun lot" description="Créez un lot à partir d’un cycle de paie approuvé ou calculé." />
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Canal</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Créé</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr
                    key={b.id}
                    onClick={() => loadLines(b.id)}
                    className={`border-t border-slate-100 cursor-pointer hover:bg-slate-50 ${activeBatch === b.id ? 'bg-teal-50/50' : ''}`}
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {b.channel === 'mobile_money' ? 'Mobile Money' : b.channel === 'cash' ? 'Espèces' : b.channel === 'bank' ? 'Banque' : 'Mixte'}
                      {b.operator ? <div className="text-xs text-slate-500">{b.operator}</div> : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 ${STATUS_COLORS[b.status] ?? STATUS_COLORS.draft}`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{new Date(b.created_at).toLocaleString('fr-FR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-4 space-y-3">
            {!activeBatch ? (
              <p className="text-sm text-slate-500">Sélectionnez un lot pour voir les lignes.</p>
            ) : lines.length === 0 ? (
              <p className="text-sm text-slate-500">Lot vide.</p>
            ) : (
              lines.map((line) => {
                const emp = line.employee;
                return (
                  <div key={line.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <div className="font-medium text-slate-900">
                        {emp ? `${emp.last_name} ${emp.first_name}` : line.employee_id.slice(0, 8)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {line.payment_method === 'cash' ? 'Espèces' : line.mobile_operator || line.payment_method || '—'}
                        {line.payment_account ? ` · ${line.payment_account}` : ''}
                      </div>
                      <div className="text-sm font-semibold text-teal-700 mt-0.5">{formatXof(line.amount)}</div>
                      {line.failure_reason && <div className="text-xs text-rose-600">{line.failure_reason}</div>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 ${STATUS_COLORS[line.status] ?? ''}`}>
                        {line.status}
                      </span>
                      {canEdit && line.status !== 'paid' && (
                        <button disabled={busy} onClick={() => setLineStatus(line, 'paid')} className="rounded-md bg-emerald-600 text-white px-2 py-1 text-xs inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Payé
                        </button>
                      )}
                      {canEdit && line.status !== 'failed' && (
                        <button disabled={busy} onClick={() => setLineStatus(line, 'failed')} className="rounded-md bg-rose-600 text-white px-2 py-1 text-xs inline-flex items-center gap-1">
                          <XCircle className="w-3 h-3" /> Échec
                        </button>
                      )}
                      {canEdit && line.status !== 'pending' && (
                        <button disabled={busy} onClick={() => setLineStatus(line, 'pending')} className="rounded-md border border-slate-300 px-2 py-1 text-xs inline-flex items-center gap-1">
                          <RefreshCw className="w-3 h-3" /> Reset
                        </button>
                      )}
                      {line.payment_method === 'cash' && emp && period && (
                        <button
                          onClick={() => printCashReceipt(activeOrg, emp, Number(line.amount), monthLabel(period.period_year, period.period_month), line.receipt_note)}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                        >
                          Reçu PDF
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
