import { describe, expect, it } from 'vitest';
import { canTransition, isEditable } from './visit.rules';

describe('visit rules', () => {
  it('permite las transiciones previstas', () => {
    expect(canTransition('PLANNED', 'SUCCESSFUL')).toBe(true);
    expect(canTransition('PLANNED', 'DEFERRED')).toBe(true);
    expect(canTransition('DEFERRED', 'PLANNED')).toBe(true);
  });
  it('los estados finales no admiten transiciones', () => {
    for (const s of ['SUCCESSFUL', 'UNSUCCESSFUL', 'CANCELLED'] as const) {
      expect(canTransition(s, 'PLANNED')).toBe(false);
      expect(isEditable(s)).toBe(false);
    }
  });
  it('no permite transiciones inválidas', () => {
    expect(canTransition('PLANNED', 'PLANNED')).toBe(false);
  });
});
