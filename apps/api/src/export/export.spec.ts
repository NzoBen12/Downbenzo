import { describe, expect, it } from 'vitest';
import { safeCell, toCsv } from './export.service';

describe('export', () => {
  it('neutraliza inyección de fórmulas', () => {
    expect(safeCell('=CMD()')).toBe("'=CMD()");
    expect(safeCell('+1')).toBe("'+1");
    expect(safeCell('normal')).toBe('normal');
    expect(safeCell(null)).toBe('');
  });
  it('escapa comillas y comas en CSV', () => {
    const csv = toCsv([{ header: 'A', key: 'a' }], [{ a: 'x,"y"' }]);
    expect(csv).toContain('"x,""y"""');
  });
});
