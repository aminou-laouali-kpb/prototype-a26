import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession, ROLE_LABELS } from '../lib/session';
import { Field, inputClass, ErrorBanner } from './ui';
import { COUNTRY_OPTIONS, type CountryCode } from '../lib/countryPacks';
import { LogOut, Building2, Sparkles, Store, Globe2, Landmark } from 'lucide-react';

const DEMO_OPTIONS: Array<{
  kind: 'pme' | 'ong' | 'groupe';
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    kind: 'pme',
    title: 'PME',
    description: 'Distribution Sahel SARL (Niger) — 10 salariés, pointages, congés, cycle de paie du mois.',
    icon: <Store className="w-5 h-5" />,
  },
  {
    kind: 'ong',
    title: 'ONG',
    description: 'ONG Horizon Santé Niger — 12 salariés, 3 projets bailleurs, feuilles de temps imputées.',
    icon: <Globe2 className="w-5 h-5" />,
  },
  {
    kind: 'groupe',
    title: 'Grande structure',
    description: 'Groupe SAHEL Holding (Niger) — 18 salariés, DRH, comptabilité, ateliers.',
    icon: <Landmark className="w-5 h-5" />,
  },
];

export function OrgGate() {
  const { session, memberships, activeOrg, setActiveOrgId, refresh } = useSession();
  const [tab, setTab] = useState<'join' | 'create' | 'demo'>('demo');
  const [inviteCode, setInviteCode] = useState('');
  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [ncc, setNcc] = useState('');
  const [country, setCountry] = useState<CountryCode>('NE');
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState<'pme' | 'ong' | 'groupe' | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (memberships.length === 0) setTab('demo');
    else setTab('join');
  }, [memberships.length]);

  const createOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError('Le nom de l’organisation doit contenir au moins deux caractères.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('create_org_with_defaults', {
        p_name: trimmedName,
        p_legal_name: legalName.trim() || null,
        p_ncc: ncc.trim() || null,
        p_country_code: country,
      });
      if (err) throw new Error(err.message);
      if (!data) throw new Error('L’organisation n’a pas pu être créée.');
      setActiveOrgId(data as string);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Création de l’organisation impossible.');
    } finally {
      setBusy(false);
    }
  };

  const redeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const code = inviteCode.trim().toUpperCase();
    if (code.length < 4) {
      setError('Saisissez un code d’invitation valide.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('redeem_invite', {
        p_code: code,
      });
      if (err) throw new Error('Code d’invitation invalide ou expiré.');
      if (!data) throw new Error('Code d’invitation invalide ou expiré.');
      setActiveOrgId(data as string);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Code d’invitation invalide ou expiré.');
    } finally {
      setBusy(false);
    }
  };

  const createDemo = async (kind: 'pme' | 'ong' | 'groupe') => {
    if (seeding !== null || busy) return;
    setSeeding(kind);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('create_demo_org', { p_kind: kind });
      if (err) throw new Error(err.message);
      if (!data) throw new Error('La démonstration n’a pas pu être créée.');
      setActiveOrgId(data as string);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Création du jeu de démonstration impossible.');
    } finally {
      setSeeding(null);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Bienvenue sur Prototype A26 — KPB Global LLC</h1>
              <p className="text-xs text-slate-500">{session?.user?.email}</p>
            </div>
          </div>
          <ErrorBanner message={error} />

          {memberships.length > 0 && (
            <div className="mb-5">
              <p className="text-sm font-medium text-slate-700 mb-2">Vos espaces</p>
              <div className="space-y-2">
                {memberships.map((m) => {
                  const org = Array.isArray(m.orgs) ? m.orgs[0] : m.orgs;
                  if (!org) return null;
                  return (
                    <button
                      type="button"
                      key={m.id}
                      onClick={() => setActiveOrgId(m.org_id)}
                      disabled={busy || seeding !== null}
                      className={`w-full flex items-center justify-between rounded-lg border px-4 py-3 text-left transition ${
                        activeOrg?.id === m.org_id ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <div className="text-sm font-medium text-slate-900 flex items-center gap-2">
                          {org.name}
                          {org.is_demo && (
                            <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">DÉMO</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">{ROLE_LABELS[m.role]}</div>
                      </div>
                      {activeOrg?.id === m.org_id && <span className="text-teal-600 text-xs font-semibold">Actif</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-2 p-1 bg-slate-100 rounded-lg mb-5">
            <button
              type="button"
              onClick={() => setTab('demo')}
              disabled={busy || seeding !== null}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition ${tab === 'demo' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
            >
              Démonstration
            </button>
            <button
              type="button"
              onClick={() => setTab('join')}
              disabled={busy || seeding !== null}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition ${tab === 'join' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
            >
              Code d’invitation
            </button>
            <button
              type="button"
              onClick={() => setTab('create')}
              disabled={busy || seeding !== null}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition ${tab === 'create' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
            >
              Créer
            </button>
          </div>

          {tab === 'demo' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">
                Chargez une entreprise fictive complète (données ivoiriennes réalistes) pour une démonstration immédiate.
              </p>
              {DEMO_OPTIONS.map((o) => (
                <button
                  key={o.kind}
                  onClick={() => createDemo(o.kind)}
                  disabled={seeding !== null}
                  className="w-full flex items-start gap-3 rounded-lg border border-slate-200 px-4 py-3 text-left hover:border-teal-400 hover:bg-teal-50/50 disabled:opacity-60 transition"
                >
                  <span className="mt-0.5 text-teal-600">{o.icon}</span>
                  <span className="flex-1">
                    <span className="text-sm font-semibold text-slate-900">{o.title}</span>
                    <span className="block text-xs text-slate-500 mt-0.5">{o.description}</span>
                  </span>
                  {seeding === o.kind ? (
                    <span className="text-xs text-teal-700 font-medium">Chargement…</span>
                  ) : (
                    <Sparkles className="w-4 h-4 text-slate-300" />
                  )}
                </button>
              ))}
              <p className="text-xs text-slate-400">
                Un espace de démonstration est clairement marqué « DÉMO » et peut être remis à zéro à tout moment depuis les Paramètres.
              </p>
            </div>
          )}

          {tab === 'join' && (
            <form onSubmit={redeem} className="space-y-4">
              <Field label="Code d’invitation" hint="Fourni par l’administrateur RH de votre organisation (ex. TEMPOS-4F7A)">
                <input
                  className={inputClass}
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  required
                  placeholder="TEMPOS-…"
                  autoCapitalize="characters"
                />
              </Field>
              <button disabled={busy} className="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition">
                {busy ? 'Vérification…' : 'Rejoindre l’organisation'}
              </button>
            </form>
          )}

          {tab === 'create' && (
            <form onSubmit={createOrg} className="space-y-4">
              <Field label="Nom de l’organisation">
                <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required placeholder="Sahel Distribution SA" />
              </Field>
              <Field label="Raison sociale (optionnel)">
                <input className={inputClass} value={legalName} onChange={(e) => setLegalName(e.target.value)} />
              </Field>
              <Field label="N° contribuable (optionnel)">
                <input className={inputClass} value={ncc} onChange={(e) => setNcc(e.target.value)} />
              </Field>
              <Field label="Pays (pack de pré-paie)">
                <select className={inputClass} value={country} onChange={(e) => setCountry(e.target.value as CountryCode)}>
                  {COUNTRY_OPTIONS.map((o) => (
                    <option key={o.code} value={o.code}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <button disabled={busy} className="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition">
                {busy ? 'Création…' : 'Créer mon organisation'}
              </button>
              <p className="text-xs text-slate-400">
                Vous serez administrateur RH : services, types de congés et règles de pré-paie
                (simulation {country === 'NE' ? 'Niger — CNSS / IUTS' : 'Côte d’Ivoire — CNPS / ITS'}) pré-configurés et modifiables.
              </p>
            </form>
          )}
        </div>
        <button onClick={signOut} className="mt-4 w-full text-sm text-slate-500 hover:text-slate-700 transition inline-flex items-center justify-center gap-2">
          <LogOut className="w-4 h-4" /> Se déconnecter
        </button>
      </div>
    </div>
  );
}
