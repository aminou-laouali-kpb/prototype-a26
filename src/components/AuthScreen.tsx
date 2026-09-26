import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session';
import { AUTO_LOGOUT_KEY } from '../lib/workSessionContext';
import { Field, inputClass, ErrorBanner } from './ui';
import {
  Clock, ShieldCheck, Users, Wallet, FileCheck2, Building2,
  CheckCircle2, Lock, TimerOff,
} from 'lucide-react';

const FEATURES = [
  { icon: Clock, title: 'Temps & présences', desc: 'Pointage, corrections tracées et feuilles de temps par projet.' },
  { icon: Wallet, title: 'Pré-paie explicable', desc: 'Chaque ligne de bulletin remonte à sa règle, en francs CFA.' },
  { icon: ShieldCheck, title: 'Contrôle à quatre yeux', desc: 'Séparation stricte entre préparation et validation de la paie.' },
  { icon: Users, title: 'Rôles fins', desc: 'Accès calibrés : RH, managers, préparateurs, approbateurs, audit.' },
];

const STATS = [
  { value: '100 %', label: 'Calculs traçables' },
  { value: 'XOF', label: 'Franc CFA natif' },
  { value: '7', label: 'Rôles métiers' },
];

const AUTH_ERRORS: Array<[RegExp, string]> = [
  [/invalid login credentials/i, 'Adresse e-mail ou mot de passe incorrect.'],
  [/email not confirmed/i, 'Adresse e-mail non confirmée : ouvrez le lien reçu par e-mail.'],
  [/user already registered|already been registered/i, 'Un compte existe déjà avec cette adresse e-mail.'],
  [/password should be at least/i, 'Le mot de passe doit contenir au moins 6 caractères.'],
  [/rate limit|too many requests/i, 'Trop de tentatives. Patientez quelques minutes avant de réessayer.'],
  [/unable to validate email|invalid email/i, 'Adresse e-mail invalide.'],
  [/failed to fetch|network/i, 'Connexion au serveur impossible. Vérifiez votre accès Internet.'],
];

function authErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : '';
  for (const [pattern, message] of AUTH_ERRORS) {
    if (pattern.test(raw)) return message;
  }
  return raw || 'Erreur de connexion';
}

function AuthScreen() {
  const { refresh } = useSession();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [autoLoggedOut, setAutoLoggedOut] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(AUTO_LOGOUT_KEY) === '1') {
        setAutoLoggedOut(true);
        localStorage.removeItem(AUTO_LOGOUT_KEY);
      }
    } catch { /* ignore */ }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'signup') {
        const { error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (err) throw err;
        setInfo('Compte créé. Vous pouvez maintenant vous connecter.');
        setMode('signin');
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        await refresh();
      }
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Panneau de marque */}
      <div className="relative hidden lg:flex lg:w-[56%] flex-col justify-between p-12 xl:p-16 text-white overflow-hidden bg-slate-950">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-teal-950 to-slate-900" />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-teal-500/10 blur-3xl" />

        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-teal-400/15 ring-1 ring-teal-300/30 flex items-center justify-center">
              <Clock className="w-6 h-6 text-teal-300" />
            </div>
            <div>
              <div className="text-xl font-bold tracking-tight leading-none">Prototype A26</div>
              <div className="text-[11px] text-teal-200/70 mt-1 uppercase tracking-[0.2em]">KPB Global LLC</div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 ring-1 ring-white/10 px-3 py-1.5 text-xs text-teal-100/80">
            <Lock className="w-3.5 h-3.5 text-teal-300" /> Données chiffrées
          </span>
        </div>

        <div className="relative max-w-xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-teal-400/10 ring-1 ring-teal-300/20 px-3 py-1 text-xs font-medium text-teal-200 mb-6">
            <Building2 className="w-3.5 h-3.5" /> Plateforme RH & paie pour l'Afrique de l'Ouest
          </div>
          <h1 className="text-4xl xl:text-5xl font-bold leading-[1.1] tracking-tight">
            La gestion du temps, des RH et de la paie, réunie et vérifiable.
          </h1>
          <p className="mt-6 text-base text-slate-300/90 leading-relaxed">
            Pointage, congés, feuilles de temps par projet et pré-paie expliquée ligne par ligne,
            en francs CFA. Chaque montant remonte à sa règle — pensé pour la conformité et la confiance.
          </p>

          <div className="mt-10 grid sm:grid-cols-2 gap-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-3 rounded-xl bg-white/[0.04] ring-1 ring-white/10 p-4">
                <div className="w-9 h-9 shrink-0 rounded-lg bg-teal-400/15 ring-1 ring-teal-300/20 flex items-center justify-center">
                  <f.icon className="w-4 h-4 text-teal-300" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{f.title}</div>
                  <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center gap-8 border-t border-white/10 pt-6">
          {STATS.map((s) => (
            <div key={s.label}>
              <div className="text-xl font-bold text-white">{s.value}</div>
              <div className="text-xs text-slate-400 mt-0.5">{s.label}</div>
            </div>
          ))}
          <div className="ml-auto text-xs text-slate-500">© {new Date().getFullYear()} Prototype A26 — KPB Global LLC</div>
        </div>
      </div>

      {/* Panneau formulaire */}
      <div className="w-full lg:w-[44%] flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-slate-900">Prototype A26 — KPB Global LLC</span>
          </div>

          <div className="bg-white rounded-2xl shadow-xl ring-1 ring-slate-200/70 p-8">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              {mode === 'signin' ? 'Connexion' : 'Créer un compte'}
            </h2>
            <p className="text-sm text-slate-500 mt-1.5 mb-6">
              {mode === 'signin'
                ? 'Accédez à votre espace de gestion RH et paie.'
                : 'Quelques secondes suffisent pour démarrer.'}
            </p>
            {autoLoggedOut && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 mb-4">
                <TimerOff className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Votre session de travail a été clôturée pour inactivité et vous avez été déconnecté. Reconnectez-vous pour reprendre.</span>
              </div>
            )}
            <ErrorBanner message={error} />
            {info && (
              <div className="flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3 mb-4">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{info}</span>
              </div>
            )}
            <form onSubmit={submit} className="space-y-4">
              {mode === 'signup' && (
                <Field label="Nom complet">
                  <input className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Awa Koné" required />
                </Field>
              )}
              <Field label="Adresse e-mail">
                <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@entreprise.ne" required />
              </Field>
              <Field label="Mot de passe" hint={mode === 'signup' ? '6 caractères minimum' : undefined}>
                <input type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
              </Field>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition-colors shadow-sm shadow-teal-600/20"
              >
                {busy ? 'Un instant…' : mode === 'signin' ? 'Se connecter' : 'Créer mon compte'}
              </button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
              <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-slate-400">ou</span></div>
            </div>

            <button
              onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setInfo(null); }}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
            >
              {mode === 'signin' ? 'Créer un nouveau compte' : "J'ai déjà un compte — me connecter"}
            </button>
          </div>

          <div className="mt-6 flex items-center justify-center gap-6 text-xs text-slate-400">
            <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-teal-600" /> Accès par rôle</span>
            <span className="flex items-center gap-1.5"><FileCheck2 className="w-3.5 h-3.5 text-teal-600" /> Piste d'audit</span>
            <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 text-teal-600" /> Sécurisé</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AuthScreen;
