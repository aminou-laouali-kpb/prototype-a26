import type { Employee } from './types';

function norm(value: string): string {
  return value.trim().toLocaleLowerCase('fr');
}

/** Autre fiche déjà présente avec le même nom + prénom (hors la fiche en cours). */
export function findNameClone(
  employees: Pick<Employee, 'id' | 'first_name' | 'last_name' | 'employee_number'>[],
  firstName: string,
  lastName: string,
  exceptId?: string | null,
): Pick<Employee, 'id' | 'first_name' | 'last_name' | 'employee_number'> | null {
  const first = norm(firstName);
  const last = norm(lastName);
  if (!first || !last) return null;
  return employees.find((e) => (
    e.id !== exceptId
    && norm(e.first_name) === first
    && norm(e.last_name) === last
  )) ?? null;
}
