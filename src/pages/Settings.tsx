import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession, ROLE_LABELS } from '../lib/session';
import { LeaveType, PayrollRule, OrgInvite, Role, PayrollTimeBasis, DEFAULT_ORG_SETTINGS, NotificationOutboxItem } from '../lib/types';
import { COUNTRY_OPTIONS, getCountryPack } from '../lib/countryPacks';
import { Modal, Field, inputClass, ErrorBanner, Spinner, EmptyState, useAsyncAction, SimulationNotice } from '../components/ui';
import { canAccessPage, canWriteSettings } from '../lib/access';
import { Building, CalendarDays, Calculator, Plus, Ticket, Copy, Ban, RefreshCw, TimerReset, CheckCircle2, MessageCircle } from 'lucide-react';

export function SettingsPage() {
  const { activeOrg, activeRole } = useSession();
  const [tab, setTab] = useState<'org' | 'time' | 'leaves' | 'payroll' | 'access' | 'notifications'>('payroll');
  const isAdmin = activeRole === 'admin_rh';
  const canManage = canAccessPage('parametres', activeRole);
  const readOnly = !canWriteSettings(activeRole);

  useEffect(() => {
    if (!isAdmin && (tab === 'org' || tab === 'leaves' || tab === 'access')) setTab('payroll');
  }, [isAdmin, tab]);

  if (!activeOrg) return null;

  if (!canManage) {
    return (
      <div className="rounded-2xl bg-white ring-1 ring-slate-200">
        <EmptyState title="Accès limité" description="Seuls l’administrateur RH, le préparateur et le cabinet peuvent consulter ces paramètres." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Paramètres</h1>
        <p className="text-sm text-slate-500 mt-1">Organisation, pack pays, congés, règles de pré-paie, accès et WhatsApp.</p>
      </div>

      <div className="flex flex-wrap gap-2 p-1 bg-slate-100 rounded-lg w-fit">
        {isAdmin && <TabButton active={tab === 'org'} onClick={() => setTab('org')}>Organisation</TabButton>}
        <TabButton active={tab === 'time'} onClick={() => setTab('time')}>Temps &amp; présence</TabButton>
        {isAdmin && <TabButton active={tab === 'leaves'} onClick={() => setTab('leaves')}>Congés</TabButton>}
        <TabButton active={tab === 'payroll'} onClick={() => setTab('payroll')}>Règles de paie</TabButton>
        {isAdmin && <TabButton active={tab === 'access'} onClick={() => setTab('access')}>Accès et invitations</TabButton>}
        {(isAdmin || activeRole === 'preparateur') && (
          <TabButton active={tab === 'notifications'} onClick={() => setTab('notifications')}>WhatsApp</TabButton>
        )}
      </div>

      {tab === 'org' && <OrgTab />}
      {tab === 'time' && <TimeSettingsTab readOnly={readOnly} />}
      {tab === 'leaves' && <LeaveTypesTab />}
      {tab === 'payroll' && <RulesTab readOnly={readOnly} />}
      {tab === 'access' && <AccessTab />}
      {tab === 'notifications' && <NotificationsTab />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${active ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>
      {children}
    </button>
  );
}

function OrgTab() {
  const { activeOrg, refresh, session } = useSession();
  const [name, setName] = useState(activeOrg?.name ?? '');
  const [legalName, setLegalName] = useState(activeOrg?.legal_name ?? '');
  const [ncc, setNcc] = useState(activeOrg?.ncc ?? '');
  const [country, setCountry] = useState(activeOrg?.country_code ?? 'NE');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [packBusy, setPackBusy] = useState(false);

  useEffect(() => {
    setName(activeOrg?.name ?? '');
    setLegalName(activeOrg?.legal_name ?? '');
    setNcc(activeOrg?.ncc ?? '');
    setCountry(activeOrg?.country_code ?? 'NE');
  }, [activeOrg?.id, activeOrg?.name, activeOrg?.legal_name, activeOrg?.ncc, activeOrg?.country_code]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrg) return;
    setError(null);
    setSaved(false);
    const { data: updated, error: err } = await supabase
      .from('orgs')
      .update({ name: name.trim(), legal_name: legalName.trim() || null, ncc: ncc.trim() || null })
      .eq('id', activeOrg.id)
      .select('id')
      .maybeSingle();
    if (err) { setError(err.message); return; }
    if (!updated) { setError('Aucune modification enregistrée : vous n’avez pas les droits requis.'); return; }
    await supabase.from('audit_log').insert({
      org_id: activeOrg.id,
      actor: session?.user.id ?? null,
      action: 'update_org',
      entity: 'orgs',
      entity_id: activeOrg.id,
      details: { nom: name.trim() },
    });
    setSaved(true);
    await refresh();
  };

  const applyPack = async () => {
    if (!activeOrg) return;
    if (!confirm(`Appliquer le pack ${country === 'NE' ? 'Niger (CNSS / IUTS)' : 'Côte d’Ivoire (CNPS / ITS)'} ? Les règles actives actuelles seront désactivées.`)) return;
    setPackBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('apply_country_pack', {
      p_org: activeOrg.id,
      p_country: country,
    });
    if (err) {
      // Fallback client-side if RPC not yet migrated: update country_code only
      const { error: upErr } = await supabase.from('orgs').update({ country_code: country }).eq('id', activeOrg.id);
      setError(err.message + (upErr ? ` / ${upErr.message}` : ' — si la migration 011 n’est pas appliquée, seul le code pays a pu être mis à jour.'));
    }
    await refresh();
    setPackBusy(false);
  };

  const pack = getCountryPack(country);

  return (
    <div className="space-y-6 max-w-xl">
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-6">
        <h2 className="font-semibold text-slate-900 mb-4 inline-flex items-center gap-2">
          <Building className="w-4 h-4 text-teal-600" /> Informations de l’entreprise
        </h2>
        <ErrorBanner message={error} />
        <form onSubmit={save} className="space-y-4">
          <Field label="Nom"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required /></Field>
          <Field label="Raison sociale"><input className={inputClass} value={legalName} onChange={(e) => setLegalName(e.target.value)} /></Field>
          <Field label={`${pack.taxIdLabel} (n° contribuable)`}><input className={inputClass} value={ncc} onChange={(e) => setNcc(e.target.value)} /></Field>
          <div className="flex items-center gap-3">
            <button type="submit" className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition">Enregistrer</button>
            {saved && <span className="text-sm text-emerald-700">Enregistré</span>}
          </div>
        </form>
      </div>

      <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-6">
        <h2 className="font-semibold text-slate-900 mb-2">Pack pays (pré-paie)</h2>
        <p className="text-sm text-slate-500 mb-4">{pack.simulationNote}</p>
        <Field label="Pays">
          <select className={inputClass} value={country} onChange={(e) => setCountry(e.target.value)}>
            {COUNTRY_OPTIONS.map((o) => (
              <option key={o.code} value={o.code}>{o.label}</option>
            ))}
          </select>
        </Field>
        <ul className="mt-3 text-sm text-slate-600 list-disc pl-5 space-y-1">
          <li>{pack.socialShort} — {pack.socialFull}</li>
          <li>{pack.healthShort} — {pack.healthFull}</li>
          <li>{pack.taxShort} — {pack.taxFull}</li>
        </ul>
        <button
          type="button"
          disabled={packBusy}
          onClick={applyPack}
          className="mt-4 rounded-lg border border-teal-600 text-teal-700 px-4 py-2 text-sm font-semibold hover:bg-teal-50 disabled:opacity-50"
        >
          {packBusy ? 'Application…' : 'Appliquer le pack (reseeder les règles)'}
        </button>
      </div>
    </div>
  );
}

function TimeSettingsTab({ readOnly }: { readOnly: boolean }) {
  const { activeOrg, orgSettings, refreshOrgSettings, session } = useSession();
  const [interval, setInterval] = useState(DEFAULT_ORG_SETTINGS.reminder_interval_minutes);
  const [grace, setGrace] = useState(DEFAULT_ORG_SETTINGS.grace_minutes);
  const [basis, setBasis] = useState<PayrollTimeBasis>(DEFAULT_ORG_SETTINGS.payroll_time_basis);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAsyncAction();

  useEffect(() => {
    if (orgSettings) {
      setInterval(orgSettings.reminder_interval_minutes);
      setGrace(orgSettings.grace_minutes);
      setBasis(orgSettings.payroll_time_basis);
    }
  }, [orgSettings]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    run(async () => {
      if (!activeOrg) return;
      const { error: err } = await supabase
        .from('org_settings')
        .upsert({
          org_id: activeOrg.id,
          reminder_interval_minutes: interval,
          grace_minutes: grace,
          payroll_time_basis: basis,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'org_id' });
      if (err) throw new Error(err.message);
      await supabase.from('audit_log').insert({
        org_id: activeOrg.id,
        actor: session?.user.id ?? null,
        action: 'update_time_settings',
        entity: 'org_settings',
        entity_id: activeOrg.id,
        details: { rappel_min: interval, delai_min: grace, base_paie: basis },
      });
      await refreshOrgSettings();
      setSaved(true);
    }).catch(() => {});
  };

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-6 max-w-2xl">
      <h2 className="font-semibold text-slate-900 mb-1 inline-flex items-center gap-2">
        <TimerReset className="w-4 h-4 text-teal-600" /> Sessions de travail et contrôle de présence
      </h2>
      <p className="text-sm text-slate-500 mb-5">
        Pendant une session, un rappel « Êtes-vous toujours là ? » s’affiche à intervalle régulier.
        Sans confirmation dans le délai imparti, la session est clôturée automatiquement et le
        salarié est déconnecté.
      </p>
      <ErrorBanner message={error} />
      <form onSubmit={save} className="space-y-5">
        <fieldset disabled={readOnly} className="space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Rappel de présence toutes les (minutes)" hint="Ex. 25">
            <input type="number" min={1} max={240} className={inputClass} value={interval}
              onChange={(e) => setInterval(Number(e.target.value))} required />
          </Field>
          <Field label="Délai de confirmation avant clôture (minutes)" hint="Ex. 5">
            <input type="number" min={1} max={120} className={inputClass} value={grace}
              onChange={(e) => setGrace(Number(e.target.value))} required />
          </Field>
        </div>
        <Field label="Temps retenu pour la paie"
          hint="« Arrivée → sortie » compte toute la présence ; « Temps actif » déduit les périodes non confirmées.">
          <select className={inputClass} value={basis} onChange={(e) => setBasis(e.target.value as PayrollTimeBasis)}>
            <option value="gross">Arrivée → sortie (durée totale)</option>
            <option value="active">Temps confirmé actif</option>
          </select>
        </Field>
        </fieldset>
        {readOnly ? (
          <p className="text-xs text-slate-500">Consultation seule pour le cabinet : l’administrateur RH ou le préparateur modifie ces réglages.</p>
        ) : (
        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition">
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700">
              <CheckCircle2 className="w-4 h-4" /> Enregistré
            </span>
          )}
        </div>
        )}
      </form>
    </div>
  );
}

function LeaveTypesTab() {
  const { activeOrg } = useSession();
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<LeaveType | 'new' | null>(null);

  const orgId = activeOrg?.id;
  const load = useCallback(async () => {
    if (!orgId) return;
    const { data } = await supabase.from('leave_types').select('*').eq('org_id', orgId).order('name');
    setTypes((data ?? []) as LeaveType[]);
  }, [orgId]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  if (!activeOrg) return null;

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-slate-900 inline-flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-teal-600" /> Types de congés
        </h2>
        <button onClick={() => setEditing('new')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition inline-flex items-center gap-2">
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>
      {loading ? <Spinner /> : types.length === 0 ? (
        <EmptyState title="Aucun type de congé" description="Ajoutez vos types de congés (annuel, maladie, sans solde…)." />
      ) : (
        <div className="divide-y divide-slate-100">
          {types.map((t) => (
            <div key={t.id} className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm font-medium text-slate-900">{t.name}</div>
                <div className="text-xs text-slate-400">
                  {t.code} · {t.paid ? 'payé' : 'non payé'}{Number(t.annual_days) > 0 ? ` · ${Number(t.annual_days)} j/an` : ''}
                </div>
              </div>
              <button onClick={() => setEditing(t)} className="text-sm text-teal-700 hover:underline">Modifier</button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <LeaveTypeModal
          leaveType={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function LeaveTypeModal({ leaveType, onClose, onSaved }: {
  leaveType: LeaveType | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { activeOrg } = useSession();
  const [form, setForm] = useState({
    code: leaveType?.code ?? '',
    name: leaveType?.name ?? '',
    paid: leaveType?.paid ?? true,
    annual_days: Number(leaveType?.annual_days ?? 0),
  });
  const { busy, error, run } = useAsyncAction();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (!activeOrg) return;
      const payload = {
        org_id: activeOrg.id,
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        paid: form.paid,
        annual_days: Number(form.annual_days),
      };
      const { data, error: err } = leaveType
        ? await supabase.from('leave_types').update({ name: payload.name, paid: payload.paid, annual_days: payload.annual_days })
          .eq('id', leaveType.id).eq('org_id', activeOrg.id).select('id').maybeSingle()
        : await supabase.from('leave_types').insert(payload).select('id').maybeSingle();
      if (err) throw new Error(err.message);
      if (!data) throw new Error('Aucune modification enregistrée : vous n’avez pas les droits requis.');
      onSaved();
    }).catch(() => {});
  };

  return (
    <Modal open onClose={onClose} title={leaveType ? 'Modifier le type de congé' : 'Nouveau type de congé'}>
      <ErrorBanner message={error} />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Code" hint="ex. CAP, MAL, SOL">
            <input className={inputClass} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required maxLength={8} />
          </Field>
          <Field label="Libellé">
            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <Field label="Payé ?">
              <select className={inputClass} value={form.paid ? 'true' : 'false'} onChange={(e) => setForm({ ...form, paid: e.target.value === 'true' })}>
              <option value="true">Payé</option>
              <option value="false">Non payé</option>
            </select>
          </Field>
          <Field label="Jours annuels" hint="0 = illimité / non plafonné">
            <input type="number" min={0} step={0.5} className={inputClass} value={form.annual_days} onChange={(e) => setForm({ ...form, annual_days: Number(e.target.value) })} />
          </Field>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">Annuler</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition">
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RulesTab({ readOnly }: { readOnly: boolean }) {
  const { activeOrg } = useSession();
  const [editingRule, setEditingRule] = useState<PayrollRule | null>(null);
  const [rules, setRules] = useState<PayrollRule[]>([]);
  const [loading, setLoading] = useState(true);

  const orgId = activeOrg?.id;
  const load = useCallback(async () => {
    if (!orgId) return;
    const { data } = await supabase
      .from('payroll_rules').select('*').eq('org_id', orgId).eq('active', true)
      .order('category').order('label');
    setRules((data ?? []) as PayrollRule[]);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  if (!activeOrg) return null;

  const categoryLabels: Record<string, string> = {
    cotisation_salarie: 'Cotisations salariales',
    cotisation_employeur: 'Cotisations patronales',
    impot: 'Impôt (barème)',
    plafond: 'Plafonds et repères',
    abarissement: 'Formation',
    autre: 'Autres',
  };

  return (
    <div className="space-y-4">
      <SimulationNotice />
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-6">
        <h2 className="font-semibold text-slate-900 mb-1 inline-flex items-center gap-2">
          <Calculator className="w-4 h-4 text-teal-600" /> Règles de pré-paie (barème 2026)
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          Taux officiels 2026 du pack pays, modifiables ici. Seules les règles actives sont affichées.
        </p>
        {loading ? <Spinner /> : rules.length === 0 ? (
          <EmptyState title="Aucune règle" />
        ) : (
          <div className="space-y-6">
            {['cotisation_salarie', 'cotisation_employeur', 'impot', 'plafond', 'abarissement'].map((cat) => {
              const rows = rules.filter((r) => r.category === cat);
              if (rows.length === 0) return null;
              return (
                <div key={cat}>
                  <h3 className="text-sm font-semibold text-slate-900 mb-2">{categoryLabels[cat] ?? cat}</h3>
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-left text-xs text-slate-500">
                          <th className="px-3 py-2 font-medium">Libellé</th>
                          <th className="px-3 py-2 font-medium text-right">Valeur</th>
                          <th className="px-3 py-2 font-medium">Source</th>
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rows.map((r) => (
                          <tr key={r.id}>
                            <td className="px-3 py-2 text-sm text-slate-800">{r.label}</td>
                            <td className="px-3 py-2 text-right font-medium text-slate-900">{Number(r.value)}{r.category === 'impot' || r.code.includes('_tx') ? ' %' : ''}</td>
                            <td className="px-3 py-2 text-xs text-slate-400 max-w-xs truncate">{r.source}</td>
                            <td className="px-3 py-2 text-right">
                              {!readOnly && (
                                <button onClick={() => setEditingRule(r)} className="text-sm text-teal-700 hover:underline">Modifier</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editingRule && (
        <RuleModal
          rule={editingRule}
          onClose={() => setEditingRule(null)}
          onSaved={() => { setEditingRule(null); load(); }}
        />
      )}
    </div>
  );
}

function RuleModal({ rule, onClose, onSaved }: { rule: PayrollRule; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState(String(Number(rule.value)));
  const { busy, error, run } = useAsyncAction();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const { error: err } = await supabase
        .from('payroll_rules')
        .update({ value: Number(value), version: rule.version + 1 })
        .eq('id', rule.id);
      if (err) throw new Error(err.message);
      onSaved();
    }).catch(() => {});
  };

  return (
    <Modal open onClose={onClose} title="Modifier la règle" subtitle={`${rule.label} — version actuelle v${rule.version}`}>
      <ErrorBanner message={error} />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nouvelle valeur" hint={rule.source}>
          <input type="number" step="0.0001" className={inputClass} value={value} onChange={(e) => setValue(e.target.value)} required />
        </Field>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">Annuler</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition">
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const INVITE_PREFIX = 'A26-';

function randomCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const buf = new Uint32Array(8);
  crypto.getRandomValues(buf);
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[buf[i] % chars.length];
  return code;
}

function AccessTab() {
  const { activeOrg } = useSession();
  const [invites, setInvites] = useState<OrgInvite[]>([]);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const orgId = activeOrg?.id;
  const load = useCallback(async () => {
    if (!orgId) return;
    const { data } = await supabase
      .from('org_invites')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    setInvites((data ?? []) as OrgInvite[]);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  if (!activeOrg) return null;

  const copy = async (c: string) => {
    await navigator.clipboard.writeText(c);
    setCopied(c);
    setTimeout(() => setCopied(null), 2000);
  };

  const resetDemo = async () => {
    if (!window.confirm('Remettre à zéro toutes les données de démonstration de cet espace ? Les salariés, pointages, congés et cycles de paie de démonstration seront supprimés puis régénérés.')) return;
    setResetting(true);
    setNotice(null);
    const { error: err } = await supabase.rpc('reseed_demo_data', { p_org: activeOrg.id });
    setResetting(false);
    if (err) { setNotice('Réinitialisation impossible : ' + err.message); return; }
    await load();
  };

  const cleanClones = async () => {
    if (!window.confirm('Supprimer les fiches de démonstration en double (même nom, autre matricule) ? La fiche rattachée à un compte, ou la plus complète, est conservée.')) return;
    setCleaning(true);
    setNotice(null);
    const { data, error: err } = await supabase.rpc('cleanup_demo_name_clones', { p_org: activeOrg.id });
    setCleaning(false);
    if (err) { setNotice('Ménage impossible : ' + err.message); return; }
    const removed = (data as { removed?: number } | null)?.removed ?? 0;
    setNotice(removed === 0
      ? 'Aucun doublon de nom trouvé.'
      : `${removed} fiche${removed > 1 ? 's' : ''} en double supprimée${removed > 1 ? 's' : ''}.`);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
          <h2 className="font-semibold text-slate-900 inline-flex items-center gap-2">
            <Ticket className="w-4 h-4 text-teal-600" /> Invitations
          </h2>
          <button onClick={() => setCreating(true)} className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-700 transition inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> Nouveau code
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Partagez un code avec un collègue : il le saisira à sa connexion pour rejoindre l’organisation avec le rôle choisi.
        </p>
        {invites.length === 0 ? (
          <EmptyState title="Aucun code d’invitation" description="Créez un code pour inviter un responsable, un salarié ou un auditeur." />
        ) : (
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs text-slate-500">
                  <th className="px-3 py-2 font-medium">Code</th>
                  <th className="px-3 py-2 font-medium">Rôle accordé</th>
                  <th className="px-3 py-2 font-medium">Statut</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invites.map((i) => (
                  <tr key={i.id} className={i.active ? '' : 'opacity-50'}>
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-800">{i.code}</td>
                    <td className="px-3 py-2 text-sm text-slate-600">{ROLE_LABELS[i.role]}</td>
                    <td className="px-3 py-2 text-xs">{i.active ? 'Actif' : 'Révoqué'}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button onClick={() => copy(i.code)} className="mr-2 p-1.5 rounded-lg text-slate-400 hover:text-teal-700 hover:bg-teal-50 transition" aria-label="Copier le code">
                        <Copy className="w-4 h-4" />
                      </button>
                      {i.active && (
                        <button
                          onClick={async () => {
                            const { error: err } = await supabase.from('org_invites').update({ active: false }).eq('id', i.id);
                            if (!err) load();
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                          aria-label="Désactiver le code"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {copied && (
          <p className="text-xs text-emerald-700 mt-2">Code {copied} copié — collez-le dans un e-mail ou un message.</p>
        )}
      </div>

      {activeOrg.is_demo && (
        <div className="rounded-2xl bg-amber-50 ring-1 ring-amber-200 p-6">
          <h2 className="font-semibold text-amber-900 mb-1 inline-flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Espace de démonstration
          </h2>
          <p className="text-sm text-amber-800 mb-3">
            Cet espace contient un jeu de données fictif ({activeOrg.demo_kind === 'pme' ? 'PME' : activeOrg.demo_kind === 'ong' ? 'ONG' : 'grande structure'}).
            La remise à zéro efface toutes les données saisies puis régénère le jeu initial.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={cleanClones}
              disabled={cleaning || resetting}
              className="rounded-lg border border-amber-300 bg-white px-3.5 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50 transition inline-flex items-center gap-2"
            >
              {cleaning ? 'Ménage…' : 'Nettoyer les fiches en double'}
            </button>
            <button
              onClick={resetDemo}
              disabled={resetting || cleaning}
              className="rounded-lg border border-amber-300 bg-white px-3.5 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50 transition inline-flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${resetting ? 'animate-spin' : ''}`} />
              {resetting ? 'Régénération…' : 'Réinitialiser les données de démonstration'}
            </button>
          </div>
          {notice && <p className={`mt-2 text-xs ${notice.startsWith('Ménage') || notice.startsWith('Réinitialisation') ? 'text-rose-700' : 'text-emerald-800'}`}>{notice}</p>}
        </div>
      )}

      {creating && (
        <InviteModal
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); load(); }}
        />
      )}
    </div>
  );
}

function InviteModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { activeOrg, session } = useSession();
  const [role, setRole] = useState<Role>('employee');
  const { busy, error, run } = useAsyncAction();
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (!activeOrg) return;
      const code = `${INVITE_PREFIX}${randomCode()}`;
      const { error: err } = await supabase.from('org_invites').insert({
        org_id: activeOrg.id,
        code,
        role,
        created_by: session?.user.id ?? null,
      });
      if (err) throw new Error(err.message);
      await supabase.from('audit_log').insert({
        org_id: activeOrg.id,
        actor: session?.user.id ?? null,
        action: 'create_invite',
        entity: 'org_invites',
        details: { role, code },
      });
      setCreated(code);
    }).catch(() => {});
  };

  return (
    <Modal open onClose={onClose} title="Nouveau code d’invitation"
      subtitle="La personne saisira ce code à sa première connexion pour rejoindre l’organisation.">
      <ErrorBanner message={error} />
      {created ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
            <p className="text-sm text-emerald-800">Code créé. Communiquez-le à la personne invitée :</p>
            <div className="mt-2 flex items-center justify-between rounded-lg bg-white border border-emerald-200 px-3 py-2">
              <span className="font-mono font-bold text-emerald-900">{created}</span>
              <button
                onClick={() => { navigator.clipboard.writeText(created); setCopied(true); }}
                className="text-xs font-semibold text-emerald-700 hover:underline inline-flex items-center gap-1"
              >
                <Copy className="w-3.5 h-3.5" /> {copied ? 'Copié !' : 'Copier'}
              </button>
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={onSaved} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition">Terminé</button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Rôle attribué à l’arrivée">
            <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">Annuler</button>
            <button type="submit" disabled={busy} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition">
              {busy ? 'Création…' : 'Créer le code'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function NotificationsTab() {
  const { activeOrg, session } = useSession();
  const [items, setItems] = useState<NotificationOutboxItem[]>([]);
  const [phone, setPhone] = useState('');
  const [template, setTemplate] = useState('payslip_ready');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!activeOrg) return;
    const { data, error: err } = await supabase
      .from('notification_outbox')
      .select('*')
      .eq('org_id', activeOrg.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (err) setError(err.message);
    else setItems((data ?? []) as NotificationOutboxItem[]);
  }, [activeOrg]);

  useEffect(() => { load(); }, [load]);

  const enqueue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrg || !phone.trim()) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('enqueue_notification', {
      p_org: activeOrg.id,
      p_channel: 'whatsapp',
      p_template: template,
      p_recipient: phone.trim(),
      p_payload: { org: activeOrg.name, queued_by: session?.user.email ?? null },
    });
    if (err) {
      // Pas de repli côté navigateur : une mise en file refusée (numéro invalide, droits) s'affiche telle quelle.
      setError(err.message);
      setBusy(false);
      return;
    }
    setPhone('');
    await load();
    setBusy(false);
  };

  const markSent = async (id: string) => {
    setError(null);
    const { error: err } = await supabase.from('notification_outbox').update({
      status: 'sent',
      sent_at: new Date().toISOString(),
    }).eq('id', id);
    if (err) setError(err.message);
    await load();
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-6">
        <h2 className="font-semibold text-slate-900 mb-2 inline-flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-teal-600" /> File WhatsApp
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          Les congés décidés, les cycles de paie et les badges mettent leurs messages en file automatiquement. Le worker
          WhatsApp (fonction send-whatsapp) les envoie dès qu&apos;il est branché ; un message en échec affiche son motif.
          « Marquer envoyé » reste réservé à un envoi fait à la main, hors application.
        </p>
        <ErrorBanner message={error} />
        <form onSubmit={enqueue} className="grid sm:grid-cols-3 gap-3 items-end">
          <Field label="Modèle">
            <select className={inputClass} value={template} onChange={(e) => setTemplate(e.target.value)}>
              <option value="payslip_ready">Bulletin prêt</option>
              <option value="leave_approved">Congé approuvé</option>
              <option value="leave_rejected">Congé refusé</option>
              <option value="clock_reminder">Rappel pointage</option>
              <option value="payroll_approval">Validation paie requise</option>
            </select>
          </Field>
          <Field label="N° WhatsApp (+227…)">
            <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+22790…" required />
          </Field>
          <button type="submit" disabled={busy} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
            Mettre en file
          </button>
        </form>
      </div>

      <div className="rounded-2xl bg-white ring-1 ring-slate-200 overflow-hidden">
        {items.length === 0 ? (
          <EmptyState title="File vide" description="Aucune notification en attente." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Destinataire</th>
                <th className="px-3 py-2 text-left">Modèle</th>
                <th className="px-3 py-2 text-left">Statut</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{i.recipient}</td>
                  <td className="px-3 py-2">{i.template_key}</td>
                  <td className="px-3 py-2">
                    {i.status}
                    {i.error && <div className="text-xs text-rose-600 max-w-xs">{i.error}</div>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {i.status === 'pending' && (
                      <button onClick={() => markSent(i.id)} className="text-xs font-semibold text-teal-700 hover:underline">
                        Marquer envoyé (envoi manuel)
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
