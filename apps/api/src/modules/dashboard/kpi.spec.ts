import { describe, expect, it } from 'vitest';
import { rank, summarizeVisits } from './kpi';

describe('summarizeVisits', () => {
  it('suma por estado y calcula la tasa de éxito sólo sobre visitas resueltas', () => {
    const s = summarizeVisits([
      { status: 'SUCCESSFUL', count: 6 },
      { status: 'UNSUCCESSFUL', count: 2 },
      { status: 'PLANNED', count: 10 },
      { status: 'DEFERRED', count: 1 },
      { status: 'CANCELLED', count: 3 },
    ]);
    expect(s).toMatchObject({ total: 22, successful: 6, unsuccessful: 2, planned: 10, deferred: 1, cancelled: 3, successRate: 75 });
  });

  it('devuelve 0 sin visitas resueltas (sin división por cero)', () => {
    expect(summarizeVisits([]).successRate).toBe(0);
    expect(summarizeVisits([{ status: 'PLANNED', count: 3 }]).successRate).toBe(0);
  });
});

describe('rank', () => {
  const rows = [
    { id: 'a', name: 'Ana', status: 'SUCCESSFUL' as const, count: 5 },
    { id: 'a', name: 'Ana', status: 'UNSUCCESSFUL' as const, count: 5 },
    { id: 'b', name: 'Beto', status: 'SUCCESSFUL' as const, count: 5 },
    { id: 'c', name: 'Cora', status: 'SUCCESSFUL' as const, count: 9 },
  ];
  it('ordena por exitosas, desempata por puntuación y respeta el límite', () => {
    const r = rank(rows, 2);
    expect(r.map((x) => x.id)).toEqual(['c', 'b']);
    expect(rank(rows).find((x) => x.id === 'a')?.score).toBe(50);
  });
});
