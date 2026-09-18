import { useWorkSession } from '../lib/workSessionContext';
import { formatClock, formatDuration } from '../lib/workSession';
import { Play, Square, CheckCircle2, Timer } from 'lucide-react';

export function SessionControlCard() {
  const {
    active, elapsedSeconds, activeSeconds, busy, start, end, confirm,
    reminderIntervalMinutes, graceMinutes,
  } = useWorkSession();

  if (!active) {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6">
        <div className="flex items-center gap-2 text-teal-300 text-sm font-medium">
          <Timer className="w-4 h-4" /> Session de travail
        </div>
        <h2 className="text-xl font-bold mt-2">Aucune session en cours</h2>
        <p className="text-sm text-slate-300 mt-1 leading-relaxed">
          Démarrez votre session pour enregistrer votre temps de présence. Un rappel de présence
          apparaîtra toutes les {reminderIntervalMinutes} minutes ; sans réponse sous {graceMinutes} minutes,
          la session se clôture et vous êtes déconnecté.
        </p>
        <button
          onClick={() => start()}
          disabled={busy}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-teal-500 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-400 disabled:opacity-50 transition"
        >
          <Play className="w-4 h-4" /> Démarrer ma session
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-6">
      <div className="flex items-center gap-2 text-teal-700 text-sm font-medium">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal-500" />
        </span>
        Session en cours
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <div className="text-4xl font-bold tabular-nums text-slate-900">{formatClock(elapsedSeconds)}</div>
          <div className="text-xs text-slate-400 mt-1">Temps depuis le début (arrivée → maintenant)</div>
        </div>
        <div>
          <div className="text-2xl font-semibold tabular-nums text-slate-700">{formatDuration(activeSeconds)}</div>
          <div className="text-xs text-slate-400 mt-1">Temps confirmé actif</div>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          onClick={() => confirm()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm font-semibold text-teal-700 hover:bg-teal-100 disabled:opacity-50 transition"
        >
          <CheckCircle2 className="w-4 h-4" /> Je suis là
        </button>
        <button
          onClick={() => end()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50 transition"
        >
          <Square className="w-4 h-4" /> Terminer ma session
        </button>
      </div>
      <p className="text-xs text-slate-400 mt-4">
        Rappel de présence toutes les {reminderIntervalMinutes} min. Confirmez sous {graceMinutes} min
        pour rester connecté.
      </p>
    </div>
  );
}
