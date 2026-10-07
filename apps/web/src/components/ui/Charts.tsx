import { formatNumber } from '../../lib/format';

/** Barras horizontales accesibles (valores también en texto). */
export function BarList({ items, label }: { items: { label: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="bars" role="list" aria-label={label}>
      {items.map((i) => (
        <div className="bar-row" role="listitem" key={i.label}>
          <span title={i.label} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.label}</span>
          <div className="bar-track" aria-hidden="true"><div className="bar-fill" style={{ width: `${(i.value / max) * 100}%` }} /></div>
          <span>{formatNumber(i.value)}</span>
        </div>
      ))}
    </div>
  );
}

interface Point { date: string; total: number; successful: number }

/** Serie temporal en SVG (sin dependencias) con alternativa textual. */
export function LineChart({ points, label }: { points: Point[]; label: string }) {
  if (points.length === 0) return null;
  const W = 640, H = 200, P = 28;
  const max = Math.max(1, ...points.map((p) => p.total));
  const x = (i: number) => P + (points.length === 1 ? (W - 2 * P) / 2 : (i / (points.length - 1)) * (W - 2 * P));
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  const path = (key: 'total' | 'successful') => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ width: '100%', height: 'auto', maxHeight: 260 }}>
        <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#d6dde7" />
        <line x1={P} y1={P} x2={P} y2={H - P} stroke="#d6dde7" />
        <text x={4} y={P + 4} fontSize="11" fill="#4d5b6e">{max}</text>
        <text x={P} y={H - 8} fontSize="11" fill="#4d5b6e">{points[0].date}</text>
        <text x={W - P} y={H - 8} fontSize="11" fill="#4d5b6e" textAnchor="end">{points[points.length - 1].date}</text>
        <path d={path('total')} fill="none" stroke="#0f4f91" strokeWidth="2" />
        <path d={path('successful')} fill="none" stroke="#0e8f7e" strokeWidth="2" strokeDasharray="5 3" />
      </svg>
      <figcaption className="row" style={{ fontSize: 12, color: 'var(--c-muted)' }}>
        <span style={{ color: '#0f4f91' }}>━ Total de visitas</span><span style={{ color: '#0e8f7e' }}>╍ Exitosas</span>
      </figcaption>
    </figure>
  );
}
