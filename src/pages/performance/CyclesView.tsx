import { useState } from 'react';
import { Plus, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/session';
import { ErrorBanner, Field, inputClass, useAsyncAction } from '../../components/ui';
import { FormModal } from '../../components/FormModal';
import {
  CYCLE_KINDS, CYCLE_STATUS_COLORS, PERFORMANCE_GUARDRAILS, cycleStatusLabel, defaultCycleRange,
} from '../../lib/performance';
import { formatDate } from '../../lib/types';
import type { PerformanceCycle, PerformanceCycleKind, PerformanceSettings } from '../../lib/types';
import type { PerformanceData } from './usePerformanceData';

export function CyclesView({ data, canConfigure }: { data: PerformanceData; canConfigure: boolean }) {
  const { activeOrg } = useSession();
  const { cycles, settings, reload } = data;
  const { busy, error, setError, run } = useAsyncAction();
  const [opening, setOpening] = useState(false);
  const [kind, setKind] = useState<PerformanceCycleKind>('quarter');
  const [reopening, setReopening] = useState<PerformanceCycle | null>(null);

  const call = (fn: () => PromiseLike<{ error: { message: string } | null }>, after?: () => void) =>
    run(async () => {
      const { error: err } = await fn();
      if (err) throw new Error(err.message);
      after?.();
      await reload();
    }).catch(() => {});

  const setStatus = (c: PerformanceCycle, status: string) =>
    call(() => supabase.rpc('set_performance_cycle_status', { p_cycle: c.id, p_status: status }));

  const range = defaultCycleRange(kind);
  const canSeed = canConfigure && activeOrg?.is_demo && cycles.length === 0;

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} />

      <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">Cycles</h3>
          <div className="flex gap-3">
            {canSeed && (
              <button disabled={busy} onClick={() => { void call(() => supabase.rpc('seed_performance_demo', { p_org: activeOrg!.id })); }}
                className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Charger le jeu de démonstration
              </button>
            )}
            {canConfigure && (
              <button onClick={() => { setError(null); setOpening(true); }}
                className="rounded-lg bg-teal-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-700 inline-flex items-center gap-2">
                <Plus className="w-4 h-4" /> Ouvrir un cycle
              </button>
            )}
          </div>
        </div>
        {cycles.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun cycle. {canConfigure ? 'Ouvrez le premier pour fixer des objectifs.' : 'L’administrateur RH ouvre les cycles.'}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {cycles.map((c) => (
              <li key={c.id} className="py-3 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-900">{c.label}</div>
                  <div className="text-xs text-slate-500">{formatDate(c.start_date)} → {formatDate(c.end_date)}</div>
                </div>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${CYCLE_STATUS_COLORS[c.status]}`}>{cycleStatusLabel(c.status)}</span>
                {canConfigure && (
                  <div className="flex gap-3 text-xs font-semibold whitespace-nowrap">
                    {c.status === 'open' && <button disabled={busy} onClick={() => { void setStatus(c, 'review'); }} className="text-teal-700 hover:underline">Passer en revue</button>}
                    {c.status === 'review' && <button disabled={busy} onClick={() => { void setStatus(c, 'open'); }} className="text-slate-600 hover:underline">Rouvrir aux objectifs</button>}
                    {c.status === 'review' && <button disabled={busy} onClick={() => { void setStatus(c, 'closed'); }} className="text-teal-700 hover:underline">Clore</button>}
                    {c.status === 'closed' && <button disabled={busy} onClick={() => { setError(null); setReopening(c); }} className="text-rose-600 hover:underline">Rouvrir avec un motif</button>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-slate-500">Ouvert : on fixe et on déclare les objectifs. En revue : le score est stable, on propose les récompenses. Clos : plus de recalcul sans réouverture motivée.</p>
      </section>

      {settings && <SettingsCard settings={settings} canConfigure={canConfigure} />}

      <section className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 inline-flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-teal-600" /> Règles de confiance</h3>
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-slate-700">
          {PERFORMANCE_GUARDRAILS.map((g) => <li key={g}>{g}</li>)}
        </ul>
      </section>

      {opening && (
        <FormModal
          key={kind}
          title="Ouvrir un cycle de performance"
          subtitle="Un cycle porte les objectifs et le score d’une période."
          submitLabel="Ouvrir"
          busy={busy}
          error={error}
          onClose={() => setOpening(false)}
          fields={[
            { name: 'kind', label: 'Période', type: 'select', defaultValue: kind, options: CYCLE_KINDS.map((k) => ({ value: k.id, label: k.label })) },
            { name: 'label', label: 'Nom', required: true, defaultValue: range.label },
            { name: 'start', label: 'Début', type: 'date', required: true, defaultValue: range.start },
            { name: 'end', label: 'Fin', type: 'date', required: true, defaultValue: range.end },
          ]}
          onSubmit={(v) => {
            if (v.kind !== kind) { setKind(v.kind as PerformanceCycleKind); return; }
            void call(() => supabase.rpc('open_performance_cycle', {
              p_org: activeOrg!.id, p_label: v.label, p_kind: v.kind, p_start: v.start, p_end: v.end,
            }), () => setOpening(false));
          }}
        />
      )}

      {reopening && (
        <FormModal
          title={`Rouvrir « ${reopening.label} »`}
          subtitle="Un cycle clos ne se recalcule pas en silence. Le motif est conservé dans le journal d’audit."
          submitLabel="Rouvrir"
          busy={busy}
          error={error}
          onClose={() => setReopening(null)}
          fields={[{ name: 'reason', label: 'Motif', type: 'textarea', required: true }]}
          onSubmit={(v) => {
            void call(() => supabase.rpc('reopen_performance_cycle', { p_cycle: reopening.id, p_reason: v.reason }), () => setReopening(null));
          }}
        />
      )}
    </div>
  );
}

const KPI_FIELDS: Array<{ key: keyof PerformanceSettings; label: string }> = [
  { key: 'weight_punctuality', label: 'Ponctualité' },
  { key: 'weight_attendance', label: 'Assiduité' },
  { key: 'weight_project_hours', label: 'Heures projet validées' },
  { key: 'weight_submission', label: 'Délai de soumission' },
  { key: 'weight_corrections', label: 'Corrections de pointage' },
];

function SettingsCard({ settings, canConfigure }: { settings: PerformanceSettings; canConfigure: boolean }) {
  const { busy, error, run } = useAsyncAction();
  const [form, setForm] = useState(() => ({
    weight_objectives: String(settings.weight_objectives),
    expected_start_time: settings.expected_start_time.slice(0, 5),
    late_grace_minutes: String(settings.late_grace_minutes),
    submission_grace_days: String(settings.submission_grace_days),
    daily_hours: String(settings.daily_hours),
    weight_punctuality: String(settings.weight_punctuality),
    weight_attendance: String(settings.weight_attendance),
    weight_project_hours: String(settings.weight_project_hours),
    weight_submission: String(settings.weight_submission),
    weight_corrections: String(settings.weight_corrections),
    conform_threshold: String(settings.conform_threshold),
    good_threshold: String(settings.good_threshold),
    excellent_threshold: String(settings.excellent_threshold),
    holidays: settings.holidays.join(', '),
  }));
  const [saved, setSaved] = useState(false);
  const set = (key: keyof typeof form, value: string) => { setSaved(false); setForm((f) => ({ ...f, [key]: value })); };
  const kpiSum = KPI_FIELDS.reduce((sum, f) => sum + Number(form[f.key as keyof typeof form] || 0), 0);

  const save = () => {
    const holidays = form.holidays.split(/[\s,;]+/).filter(Boolean);
    void run(async () => {
      const { error: err } = await supabase.rpc('save_performance_settings', {
        p_settings: {
          org_id: settings.org_id,
          weight_objectives: Number(form.weight_objectives),
          expected_start_time: form.expected_start_time,
          late_grace_minutes: Number(form.late_grace_minutes),
          submission_grace_days: Number(form.submission_grace_days),
          daily_hours: Number(form.daily_hours),
          weight_punctuality: Number(form.weight_punctuality),
          weight_attendance: Number(form.weight_attendance),
          weight_project_hours: Number(form.weight_project_hours),
          weight_submission: Number(form.weight_submission),
          weight_corrections: Number(form.weight_corrections),
          conform_threshold: Number(form.conform_threshold),
          good_threshold: Number(form.good_threshold),
          excellent_threshold: Number(form.excellent_threshold),
          holidays,
        },
      });
      if (err) throw new Error(err.message);
      setSaved(true);
    }).catch(() => {});
  };

  const num = (key: keyof typeof form, label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <input type="number" className={inputClass} value={form[key]} disabled={!canConfigure} onChange={(e) => set(key, e.target.value)} />
    </Field>
  );

  return (
    <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Réglages du score</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Les mêmes règles s’appliquent à tous les salariés de l’organisation. Fuseau horaire des pointages : {settings.timezone}.
          {!canConfigure && ' Lecture seule : l’administrateur RH modifie ces réglages.'}
        </p>
      </div>
      <ErrorBanner message={error} />
      <div className="grid gap-4 sm:grid-cols-3">
        {num('weight_objectives', 'Poids des objectifs (%)', 'Le reste va aux indicateurs automatiques.')}
        <Field label="Heure d’arrivée attendue">
          <input type="time" className={inputClass} value={form.expected_start_time} disabled={!canConfigure} onChange={(e) => set('expected_start_time', e.target.value)} />
        </Field>
        {num('late_grace_minutes', 'Tolérance de retard (min)')}
        {num('submission_grace_days', 'Délai de soumission (jours après la fin du mois)')}
        {num('daily_hours', 'Heures par jour')}
      </div>
      <div>
        <div className="text-sm font-medium text-slate-700 mb-2">Poids des indicateurs automatiques (total {kpiSum} / 100)</div>
        <div className="grid gap-4 sm:grid-cols-5">
          {KPI_FIELDS.map((f) => <div key={f.key}>{num(f.key as keyof typeof form, f.label)}</div>)}
        </div>
        <p className="text-xs text-slate-400 mt-1">Un poids à 0 affiche l’indicateur sans le compter (cas d’une PME sans projets, ou des corrections de pointage).</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {num('conform_threshold', 'Seuil « conforme »')}
        {num('good_threshold', 'Seuil « bon »')}
        {num('excellent_threshold', 'Seuil « excellent »', 'Il faut aussi être dans le haut du service.')}
      </div>
      <Field label="Jours fériés (AAAA-MM-JJ, séparés par une virgule)" hint="Retirés des jours ouvrés : sans calendrier, le score pénaliserait les fêtes.">
        <textarea className={inputClass} rows={2} value={form.holidays} disabled={!canConfigure} onChange={(e) => set('holidays', e.target.value)} />
      </Field>
      {canConfigure && (
        <div className="flex items-center gap-3">
          <button onClick={save} disabled={busy || kpiSum !== 100}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
            Enregistrer les réglages
          </button>
          {kpiSum !== 100 && <span className="text-xs text-rose-600">Les poids des indicateurs doivent totaliser 100.</span>}
          {saved && <span className="text-xs text-emerald-700">Réglages enregistrés. Recalculez les scores pour les appliquer.</span>}
        </div>
      )}
    </section>
  );
}
