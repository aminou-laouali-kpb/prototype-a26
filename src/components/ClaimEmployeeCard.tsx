import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session';
import { Field, inputClass, ErrorBanner } from './ui';
import { UserRoundCheck } from 'lucide-react';

export function ClaimEmployeeCard() {
  const { activeOrg, refresh } = useSession();
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrg) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('claim_employee', {
      p_org: activeOrg.id,
      p_employee_number: number.trim(),
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    await refresh();
  };

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-6 max-w-lg">
      <h2 className="font-semibold text-slate-900 inline-flex items-center gap-2">
        <UserRoundCheck className="w-4 h-4 text-teal-600" /> Reliez votre compte à votre dossier
      </h2>
      <p className="text-sm text-slate-500 mt-1 mb-4">
        Saisissez votre matricule pour retrouver votre fiche salarié. Vous pourrez ensuite
        démarrer vos sessions de travail et consulter vos bulletins.
      </p>
      <ErrorBanner message={error} />
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[180px]">
          <Field label="Matricule">
            <input className={inputClass} value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Ex. EMP-001" required />
          </Field>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition"
        >
          {busy ? 'Vérification…' : 'Relier mon dossier'}
        </button>
      </form>
    </div>
  );
}
