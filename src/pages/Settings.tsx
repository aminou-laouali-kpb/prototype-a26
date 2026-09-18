import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession, ROLE_LABELS } from '../lib/session';
import { LeaveType, PayrollRule, OrgInvite, Role, PayrollTimeBasis, DEFAULT_ORG_SETTINGS } from '../lib/types';
import { Modal, Field, inputClass, ErrorBanner, Spinner, EmptyState, useAsyncAction, SimulationNotice } from '../components/ui';
import { Building, CalendarDays, Calculator, Plus, Ticket, Copy, Ban, RefreshCw, TimerReset, CheckCircle2 } from 'lucide-react';

export function SettingsPage() {
  const { activeOrg, activeRole } = useSession();
  const [tab, setTab] = useState<'org' | 'time' | 'leaves' | 'payroll' | 'access'>('payroll');
  const isAdmin = activeRole === 'admin_rh';
  const canManage = isAdmin || activeRole === 'preparateur';

  useEffect(() => {
    if (!isAdmin && (tab === 'org' || tab === 'leaves' || tab === 'access')) setTab('payroll');
  }, [isAdmin, tab]);

  if (!activeOrg) return null;

  if (!canManage) {
    return (
      <div className="rounded-2xl bg-white ring-1 ring-slate-200">
        <EmptyState title="Accès limité" description="Seuls l’administrateur RH et le préparateur de paie peuvent consulter ces paramètres." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Paramètres</h1>
        <p className="text-sm text-slate-500 mt-1">Organisation, types de congés, règles de pré-paie (simulation) et accès.</p>
      </div>

      <div className="flex flex-wrap gap-2 p-1 bg-slate-100 rounded-lg w-fit">
        {isAdmin && <TabButton active={tab === 'org'} onClick={() => setTab('org')}>Organisation</TabButton>}
        <TabButton active={tab === 'time'} onClick={() => setTab('time')}>Temps &amp; présence</TabButton>
        {isAdmin && <TabButton active={tab === 'leaves'} onClick={() => setTab('leaves')}>Congés</TabButton>}
        <TabButton active={tab === 'payroll'} onClick={() => setTab('payroll')}>Règles de paie</TabButton>
        {isAdmin && <TabButton active={tab === 'access'} onClick={() => setTab('access')}>Accès et invitations</TabButton>}
      </div>

      {tab === 'org' && <OrgTab />}
      {tab === 'time' && <TimeSettingsTab />}
      {tab === 'leaves' && <LeaveTypesTab />}
      {tab === 'payroll' && <RulesTab />}
      {tab === 'access' && <AccessTab />}
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
  const { activeOrg, refresh } = useSession();
  const [name, setName] = useState(activeOrg?.name ?? '');
  const [legalName, setLegalName] = useState(activeOrg?.legal_name ?? '');
  const [ncc, setNcc] = useState(activeOrg?.ncc ?? '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { session } = useSession();

  useEffect(() => {
    setName(activeOrg?.name ?? '');
    setLegalName(activeOrg?.legal_name ?? '');
    setNcc(activeOrg?.ncc ?? '');
  }, [activeOrg?.id, activeOrg?.name, activeOrg?.legal_name, activeOrg?.ncc]);

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

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-6 max-w-xl">
      <h2 className="font-semibold text-slate-900 mb-4 inline-flex items-center gap-2">
        <Building className="w-4 h-4 text-teal-600" /> Informations de l’entreprise
      </h2>
      <ErrorBanner message={error} />
      <form onSubmit={save} className="space-y-4">
        <Field label="Nom"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Raison sociale"><input className={inputClass} value={legalName} onChange={(e) => setLegalName(e.target.value)} /></Field>
        <Field label="N° contribuable (NCC)"><input className={inputClass} value={ncc} onChange={(e) => setNcc(e.target.value)} /></Field>
        <div className="flex items-center gap-3">
          <button type="submit" className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition">Enregistrer</button>
          {saved && <span className="text-sm text-emerald-700">Enregistré</span>}
        </div>
      </form>
    </div>
  );
}

function TimeSettingsTab() {
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

function RulesTab() {
  const { activeOrg } = useSession();
  const [editingRule, setEditingRule] = useState<PayrollRule | null>(null);
  const [rules, setRules] = useState<PayrollRule[]>([]);
  const [loading, setLoading] = useState(true);

  const orgId = activeOrg?.id;
  const load = useCallback(async () => {
    if (!orgId) return;
    const { data } = await supabase
      .from('payroll_rules').select('*').eq('org_id', orgId)
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
          <Calculator className="w-4 h-4 text-teal-600" /> Règles de pré-paie (simulation)
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          Toutes les valeurs sont des simulations de démonstration, modifiables ici.
          Faites-les valider par un expert-comptable local avant tout usage réel.
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
                              <button onClick={() => setEditingRule(r)} className="text-sm text-teal-700 hover:underline">Modifier</button>
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

const INVITE_PREFIX = 'TEMPOS-';

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
          <button
            onClick={resetDemo}
            disabled={resetting}
            className="rounded-lg border border-amber-300 bg-white px-3.5 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50 transition inline-flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${resetting ? 'animate-spin' : ''}`} />
            {resetting ? 'Régénération…' : 'Réinitialiser les données de démonstration'}
          </button>
          {notice && <p className="mt-2 text-xs text-rose-700">{notice}</p>}
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
