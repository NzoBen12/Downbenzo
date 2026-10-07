const dateTime = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
const date = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' });
const number = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

export const formatDateTime = (v?: string | Date | null) => (v ? dateTime.format(new Date(v)) : '—');
export const formatDate = (v?: string | Date | null) => (v ? date.format(new Date(v)) : '—');
export const formatNumber = (v?: number | string | null) => (v === null || v === undefined || v === '' ? '—' : number.format(Number(v)));

/** Convierte un ISO a valor para <input type="datetime-local"> en hora local. */
export function toLocalInput(iso?: string | Date | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const fromLocalInput = (v: string) => new Date(v).toISOString();

export const VISIT_STATUS: Record<string, { label: string; tone: 'info' | 'ok' | 'danger' | 'warn' | 'neutral' }> = {
  PLANNED: { label: 'Planificada', tone: 'info' },
  SUCCESSFUL: { label: 'Realizada/Exitosa', tone: 'ok' },
  UNSUCCESSFUL: { label: 'Sin éxito', tone: 'danger' },
  DEFERRED: { label: 'Diferida', tone: 'warn' },
  CANCELLED: { label: 'Anulada', tone: 'neutral' },
};
export const PROSPECT_STATUS: Record<string, string> = { NEW: 'Nuevo', IN_FOLLOW_UP: 'En seguimiento', CONVERTED: 'Convertido', LOST: 'Perdido' };
export const LOT_STATUS: Record<string, string> = { CREATED: 'Creado', IN_TRANSIT: 'En tránsito', DELIVERED: 'Entregado', CANCELLED: 'Cancelado' };
export const CARD_STATUS: Record<string, string> = { IN_STOCK: 'En stock', DISTRIBUTED: 'Distribuida', ACTIVE: 'Activa', BLOCKED: 'Bloqueada', CANCELLED: 'Cancelada' };
export const CARD_MOVEMENT: Record<string, string> = { ENTRY: 'Entrada', DISTRIBUTION: 'Distribución', ACTIVATION: 'Activación', BLOCK: 'Bloqueo', CANCELLATION: 'Cancelación' };
export const CURRENCY_STATUS: Record<string, string> = { PENDING: 'Pendiente', COMPLETED: 'Completada', CANCELLED: 'Cancelada' };
