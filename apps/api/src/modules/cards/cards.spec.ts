import { describe, expect, it } from 'vitest';
import { maskedPanRegex, nextCardStatus } from './cards';

describe('cards', () => {
  it('sólo acepta PAN enmascarado', () => {
    expect(maskedPanRegex.test('4111 **** **** 1111')).toBe(true);
    expect(maskedPanRegex.test('4111111111111111')).toBe(false);
    expect(maskedPanRegex.test('4111 1111 1111 1111')).toBe(false);
  });
  it('aplica el ciclo de vida', () => {
    expect(nextCardStatus('IN_STOCK', 'DISTRIBUTION')).toBe('DISTRIBUTED');
    expect(nextCardStatus('DISTRIBUTED', 'ACTIVATION')).toBe('ACTIVE');
    expect(nextCardStatus('IN_STOCK', 'ACTIVATION')).toBeNull();
    expect(nextCardStatus('CANCELLED', 'BLOCK')).toBeNull();
  });
});
