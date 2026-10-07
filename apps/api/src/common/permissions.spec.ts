import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, SYSTEM_ROLES } from './permissions';

describe('catálogo de permisos', () => {
  it('todo permiso de rol existe en el catálogo', () => {
    for (const r of SYSTEM_ROLES) for (const p of r.permissions) expect(ALL_PERMISSIONS).toContain(p);
  });
  it('Consulta no tiene permisos de escritura', () => {
    const viewer = SYSTEM_ROLES.find((r) => r.code === 'VIEWER')!;
    expect(viewer.permissions.every((p) => p.endsWith('.read'))).toBe(true);
  });
  it('Gestor no puede administrar usuarios ni auditoría', () => {
    const m = SYSTEM_ROLES.find((r) => r.code === 'MANAGER')!;
    expect(m.permissions.some((p) => /^(users|roles|audit|config)\./.test(p))).toBe(false);
  });
});
