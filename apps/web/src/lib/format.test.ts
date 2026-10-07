import { describe, expect, it } from 'vitest';
import { formatNumber, fromLocalInput, toLocalInput, VISIT_STATUS } from './format';

describe('format', () => {
  it('toLocalInput / fromLocalInput son inversos', () => {
    const iso = '2026-03-10T14:30:00.000Z';
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
  });
  it('toLocalInput tolera valores vacíos', () => {
    expect(toLocalInput(null)).toBe('');
  });
  it('formatNumber muestra guion para vacíos', () => {
    expect(formatNumber(null)).toBe('—');
    expect(formatNumber('')).toBe('—');
  });
  it('define exactamente los cinco estados de visita', () => {
    expect(Object.keys(VISIT_STATUS).sort()).toEqual(['CANCELLED', 'DEFERRED', 'PLANNED', 'SUCCESSFUL', 'UNSUCCESSFUL']);
  });
});
