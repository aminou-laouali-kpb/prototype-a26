import { describe, expect, it } from 'vitest';
import { findNameClone } from './employees';

const roster = [
  { id: '1', first_name: 'Aïcha', last_name: 'AMADOU', employee_number: 'NE-04782' },
  { id: '2', first_name: 'Ibrahim', last_name: 'SAIDOU', employee_number: 'NE-04781' },
];

describe('findNameClone', () => {
  it('spots a second AMADOU Aïcha before insert', () => {
    const hit = findNameClone(roster, 'aïcha', 'amadou');
    expect(hit?.employee_number).toBe('NE-04782');
  });

  it('ignores the row being edited', () => {
    expect(findNameClone(roster, 'Aïcha', 'AMADOU', '1')).toBeNull();
  });

  it('lets a distinct person through', () => {
    expect(findNameClone(roster, 'Awa', 'KONÉ')).toBeNull();
  });
});
