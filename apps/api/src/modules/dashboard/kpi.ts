import { VisitStatus } from '@prisma/client';

export interface VisitSummary {
  total: number;
  successful: number;
  cancelled: number;
  unsuccessful: number;
  deferred: number;
  planned: number;
  /** % de visitas resueltas (exitosas + sin éxito) que fueron exitosas. */
  successRate: number;
}

export function summarizeVisits(rows: { status: VisitStatus; count: number }[]): VisitSummary {
  const by = (s: VisitStatus) => rows.filter((r) => r.status === s).reduce((a, r) => a + r.count, 0);
  const successful = by('SUCCESSFUL');
  const unsuccessful = by('UNSUCCESSFUL');
  const resolved = successful + unsuccessful;
  return {
    total: rows.reduce((a, r) => a + r.count, 0),
    successful,
    cancelled: by('CANCELLED'),
    unsuccessful,
    deferred: by('DEFERRED'),
    planned: by('PLANNED'),
    successRate: resolved === 0 ? 0 : Math.round((successful / resolved) * 1000) / 10,
  };
}

export interface RankingRow {
  id: string;
  name: string;
  total: number;
  successful: number;
  score: number;
}

/** Ordena por visitas exitosas, desempata por puntuación y luego por nombre (determinista). */
export function rank(rows: { id: string; name: string; status: VisitStatus; count: number }[], limit = 10): RankingRow[] {
  const map = new Map<string, RankingRow & { unsuccessful: number }>();
  for (const r of rows) {
    const e = map.get(r.id) ?? { id: r.id, name: r.name, total: 0, successful: 0, unsuccessful: 0, score: 0 };
    e.total += r.count;
    if (r.status === 'SUCCESSFUL') e.successful += r.count;
    if (r.status === 'UNSUCCESSFUL') e.unsuccessful += r.count;
    map.set(r.id, e);
  }
  return [...map.values()]
    .map(({ unsuccessful, ...e }) => {
      const resolved = e.successful + unsuccessful;
      return { ...e, score: resolved === 0 ? 0 : Math.round((e.successful / resolved) * 1000) / 10 };
    })
    .sort((a, b) => b.successful - a.successful || b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}
