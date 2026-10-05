import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type {
  Department, Employee, EmployeeBonus, EmployeeObjective, EmployeePerk, EmployeeRecognition,
  PerformanceCycle, PerformanceScore, PerformanceSettings,
} from '../../lib/types';

export type ScoreRow = PerformanceScore & { employee: Employee | null };
export type RecognitionRow = EmployeeRecognition & { employee: Employee | null };
export type PerkRow = EmployeePerk & { employee: Employee | null };
export type BonusRow = EmployeeBonus & { score_id: string | null; employee: Employee | null };

export interface PerformanceData {
  loading: boolean;
  error: string | null;
  cycles: PerformanceCycle[];
  cycle: PerformanceCycle | null;
  cycleId: string | null;
  setCycleId: (id: string) => void;
  settings: PerformanceSettings | null;
  employees: Employee[];
  departments: Department[];
  objectives: EmployeeObjective[];
  scores: ScoreRow[];
  recognitions: RecognitionRow[];
  perks: PerkRow[];
  bonuses: BonusRow[];
  reload: () => Promise<void>;
}

const MIGRATION_HINT = 'Le module Performance est indisponible tant que la migration 018 n’est pas appliquée.';

function isMissingTable(err: { message: string; code?: string } | null): boolean {
  return !!err && (err.code === 'PGRST205' || err.message.includes('schema cache'));
}

/** Charge les données d’un cycle. Le serveur filtre déjà par rôle (RLS) : le salarié ne reçoit que ses lignes. */
export function usePerformanceData(orgId: string | null, loadEmployees: boolean): PerformanceData {
  const [cycles, setCycles] = useState<PerformanceCycle[]>([]);
  const [cycleId, setCycleIdState] = useState<string | null>(null);
  const [settings, setSettings] = useState<PerformanceSettings | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [objectives, setObjectives] = useState<EmployeeObjective[]>([]);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [recognitions, setRecognitions] = useState<RecognitionRow[]>([]);
  const [perks, setPerks] = useState<PerkRow[]>([]);
  const [bonuses, setBonuses] = useState<BonusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    setLoading(true);
    setError(null);

    const cycleRes = await supabase.from('performance_cycles').select('*')
      .eq('org_id', orgId).order('start_date', { ascending: false });
    if (cycleRes.error) {
      setError(isMissingTable(cycleRes.error) ? MIGRATION_HINT : cycleRes.error.message);
      setCycles([]);
      setLoading(false);
      return;
    }
    const list = (cycleRes.data ?? []) as PerformanceCycle[];
    setCycles(list);
    const current = list.find((c) => c.id === cycleId) ?? list.find((c) => c.status !== 'closed') ?? list[0] ?? null;
    if (current && current.id !== cycleId) setCycleIdState(current.id);

    const [setRes, empRes, depRes] = await Promise.all([
      supabase.from('performance_settings').select('*').eq('org_id', orgId).maybeSingle(),
      loadEmployees
        ? supabase.from('employees').select('*').eq('org_id', orgId).eq('status', 'active').order('last_name')
        : Promise.resolve({ data: [], error: null }),
      supabase.from('departments').select('*').eq('org_id', orgId).order('name'),
    ]);
    setSettings((setRes.data ?? null) as PerformanceSettings | null);
    setEmployees((empRes.data ?? []) as Employee[]);
    setDepartments((depRes.data ?? []) as Department[]);

    if (!current) {
      setObjectives([]); setScores([]); setRecognitions([]); setPerks([]); setBonuses([]);
      setLoading(false);
      return;
    }

    const emb = 'employee:employees!employee_id(*)';
    const [objRes, scoreRes, recRes, perkRes, bonusRes] = await Promise.all([
      supabase.from('employee_objectives').select('*').eq('cycle_id', current.id).order('created_at'),
      supabase.from('performance_scores').select(`*, ${emb}`).eq('cycle_id', current.id),
      supabase.from('employee_recognitions').select(`*, ${emb}`).eq('cycle_id', current.id).order('created_at'),
      supabase.from('employee_perks').select(`*, ${emb}`).eq('cycle_id', current.id).order('created_at'),
      supabase.from('employee_bonuses').select(`*, ${emb}`).not('score_id', 'is', null).eq('org_id', orgId).order('created_at'),
    ]);
    const firstError = [objRes, scoreRes, recRes, perkRes].find((r) => r.error)?.error ?? null;
    if (firstError) setError(firstError.message);
    setObjectives((objRes.data ?? []) as EmployeeObjective[]);
    const scoreRows = (scoreRes.data ?? []) as unknown as ScoreRow[];
    setScores(scoreRows);
    setRecognitions((recRes.data ?? []) as unknown as RecognitionRow[]);
    setPerks((perkRes.data ?? []) as unknown as PerkRow[]);
    const scoreIds = new Set(scoreRows.map((s) => s.id));
    setBonuses(((bonusRes.data ?? []) as unknown as BonusRow[]).filter((b) => b.score_id && scoreIds.has(b.score_id)));
    setLoading(false);
  }, [orgId, cycleId, loadEmployees]);

  useEffect(() => { void load(); }, [load]);

  const cycle = useMemo(() => cycles.find((c) => c.id === cycleId) ?? null, [cycles, cycleId]);

  return {
    loading, error, cycles, cycle, cycleId,
    setCycleId: setCycleIdState,
    settings, employees, departments, objectives, scores, recognitions, perks, bonuses,
    reload: load,
  };
}
