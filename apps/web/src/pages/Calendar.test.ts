import { describe, expect, it } from 'vitest';
import { visibleRange } from './Calendar';

describe('visibleRange', () => {
  it('el rango mensual empieza en lunes y cubre el mes completo', () => {
    const { from, to } = visibleRange('month', new Date(2026, 1, 15)); // febrero 2026
    expect(from.getDay()).toBe(1);
    expect(from <= new Date(2026, 1, 1)).toBe(true);
    expect(to >= new Date(2026, 2, 1)).toBe(true);
    expect((to.getTime() - from.getTime()) / 86_400_000 % 7).toBe(0);
  });
  it('semana = 7 días desde el lunes', () => {
    const { from, to } = visibleRange('week', new Date(2026, 4, 14));
    expect(from.getDay()).toBe(1);
    expect(Math.round((to.getTime() - from.getTime()) / 86_400_000)).toBe(7);
  });
  it('día = 1 día', () => {
    const { from, to } = visibleRange('day', new Date(2026, 4, 14));
    expect(Math.round((to.getTime() - from.getTime()) / 86_400_000)).toBe(1);
  });
});
