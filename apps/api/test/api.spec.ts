import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';
import { TEST_PASSWORD } from './global-setup';

let app: INestApplication;
let prisma: PrismaService;

interface Session {
  cookies: string[];
  csrf: string;
}

async function login(identifier: string, password = TEST_PASSWORD): Promise<Session> {
  const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ identifier, password });
  expect(res.status).toBe(200);
  return { cookies: res.headers['set-cookie'] as unknown as string[], csrf: res.body.csrfToken };
}

const api = (s: Session) => ({
  get: (url: string) => request(app.getHttpServer()).get(`/api/v1${url}`).set('Cookie', s.cookies),
  post: (url: string, body: object = {}) =>
    request(app.getHttpServer()).post(`/api/v1${url}`).set('Cookie', s.cookies).set('X-CSRF-Token', s.csrf).send(body),
  patch: (url: string, body: object) =>
    request(app.getHttpServer()).patch(`/api/v1${url}`).set('Cookie', s.cookies).set('X-CSRF-Token', s.csrf).send(body),
});

const binary = (r: NodeJS.ReadableStream, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  r.on('data', (d: Buffer) => chunks.push(d));
  r.on('end', () => cb(null, Buffer.concat(chunks)));
};

beforeAll(async () => {
  app = await createApp();
  await app.init();
  prisma = app.get(PrismaService);
});
afterAll(async () => app.close());

describe('autenticación', () => {
  it('rechaza peticiones sin sesión', async () => {
    await request(app.getHttpServer()).get('/api/v1/agencies').expect(401);
  });

  it('rechaza credenciales inválidas sin revelar si el usuario existe', async () => {
    const a = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ identifier: 'admin', password: 'mala-clave-xx' });
    const b = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ identifier: 'noexiste', password: 'mala-clave-xx' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.message).toBe(b.body.message);
  });

  it('login emite cookie httpOnly y no expone el hash', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ identifier: 'admin', password: TEST_PASSWORD });
    const session = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('bange_session'))!;
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=Strict/i);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
  });

  it('bloquea la cuenta tras demasiados intentos fallidos', async () => {
    await prisma.user.update({ where: { username: 'consulta' }, data: { failedAttempts: 0, lockedUntil: null } });
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer()).post('/api/v1/auth/login').send({ identifier: 'consulta', password: 'incorrecta-123' });
    }
    const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ identifier: 'consulta', password: TEST_PASSWORD });
    expect(res.status).toBe(423);
    await prisma.user.update({ where: { username: 'consulta' }, data: { failedAttempts: 0, lockedUntil: null } });
  });

  it('logout invalida la sesión en el servidor', async () => {
    const s = await login('responsable');
    await api(s).post('/auth/logout').expect(204);
    await api(s).get('/auth/me').expect(401);
  });
});

describe('RBAC y CSRF', () => {
  it('Consulta no puede crear visitas aunque llame a la API directamente', async () => {
    const s = await login('consulta');
    await api(s).post('/visits', {}).expect(403);
  });

  it('rechaza mutaciones con cookie sin token CSRF', async () => {
    const s = await login('admin');
    await request(app.getHttpServer()).post('/api/v1/agencies').set('Cookie', s.cookies).send({ code: 'Z1', name: 'Z' }).expect(403);
  });

  it('Gestor no accede a usuarios ni auditoría', async () => {
    const s = await login('gestor');
    await api(s).get('/users').expect(403);
    await api(s).get('/audit').expect(403);
  });

  it('un Administrador no puede asignar el rol Super Admin', async () => {
    const s = await login('admin');
    const role = await prisma.role.findUniqueOrThrow({ where: { code: 'SUPER_ADMIN' } });
    const res = await api(s).post('/users', {
      email: 'x@demo.bange.example', username: 'x-user', fullName: 'X', roleId: role.id, password: 'Abcdefghij12',
    });
    expect(res.status).toBe(403);
  });
});

describe('agencias y alcance de datos', () => {
  it('lista con paginación, búsqueda y filtro', async () => {
    const s = await login('responsable');
    const res = await api(s).get('/agencies?pageSize=2&search=agencia').expect(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(5);
    const none = await api(s).get('/agencies?search=zzzzz').expect(200);
    expect(none.body.data).toHaveLength(0);
  });

  it('Jefe de Agencia sólo ve su agencia', async () => {
    const s = await login('jefe');
    const res = await api(s).get('/agencies').expect(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('rechaza parámetros de paginación inválidos', async () => {
    const s = await login('admin');
    await api(s).get('/agencies?pageSize=9999').expect(400);
  });

  it('crea una agencia y deja rastro de auditoría', async () => {
    const s = await login('admin');
    const code = `T${Date.now()}`.slice(0, 20);
    const res = await api(s).post('/agencies', { code, name: 'Agencia Test' }).expect(201);
    const log = await prisma.auditLog.findFirst({ where: { action: 'agency.create', entityId: res.body.id } });
    expect(log?.userId).toBeTruthy();
    expect(log?.after).toMatchObject({ code });
  });
});

describe('visitas', () => {
  let visitId: string;
  const future = () => new Date(Date.now() + 5 * 86_400_000).toISOString();

  it('crea una visita válida', async () => {
    const s = await login('responsable');
    const manager = await prisma.manager.findFirstOrThrow({ where: { code: 'GE1' } });
    const prospect = await prisma.prospect.findFirstOrThrow();
    const res = await api(s)
      .post('/visits', { scheduledAt: future(), agencyId: manager.agencyId, managerId: manager.id, prospectId: prospect.id })
      .expect(201);
    expect(res.body.status).toBe('PLANNED');
    visitId = res.body.id;
  });

  it('notifica al gestor asignado', async () => {
    const manager = await prisma.manager.findFirstOrThrow({ where: { code: 'GE1' } });
    const n = await prisma.notification.count({ where: { userId: manager.userId!, type: 'visit.assigned' } });
    expect(n).toBeGreaterThan(0);
  });

  it('rechaza gestor que no pertenece a la agencia', async () => {
    const s = await login('responsable');
    const manager = await prisma.manager.findFirstOrThrow({ where: { code: 'GE1' } });
    const other = await prisma.agency.findFirstOrThrow({ where: { id: { not: manager.agencyId } } });
    const prospect = await prisma.prospect.findFirstOrThrow();
    await api(s).post('/visits', { scheduledAt: future(), agencyId: other.id, managerId: manager.id, prospectId: prospect.id }).expect(400);
  });

  it('exige exactamente un cliente o prospecto', async () => {
    const s = await login('responsable');
    const manager = await prisma.manager.findFirstOrThrow({ where: { code: 'GE1' } });
    await api(s).post('/visits', { scheduledAt: future(), agencyId: manager.agencyId, managerId: manager.id }).expect(400);
  });

  it('edita y reprograma, registrando auditoría', async () => {
    const s = await login('responsable');
    const newDate = new Date(Date.now() + 9 * 86_400_000).toISOString();
    await api(s).patch(`/visits/${visitId}`, { scheduledAt: newDate, notes: 'Cambio de hora' }).expect(200);
    expect(await prisma.auditLog.count({ where: { action: 'visit.reschedule', entityId: visitId } })).toBe(1);
  });

  it('aplica la máquina de estados', async () => {
    const s = await login('responsable');
    await api(s).post(`/visits/${visitId}/status`, { status: 'DEFERRED' }).expect(200);
    await api(s).post(`/visits/${visitId}/status`, { status: 'PLANNED' }).expect(400);
    await api(s).post(`/visits/${visitId}/status`, { status: 'SUCCESSFUL', result: 'OK' }).expect(200);
    await api(s).post(`/visits/${visitId}/status`, { status: 'PLANNED', newScheduledAt: future() }).expect(409);
    await api(s).patch(`/visits/${visitId}`, { notes: 'x' }).expect(409);
  });

  it('el calendario devuelve visitas del rango y respeta filtros', async () => {
    const s = await login('responsable');
    const from = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const to = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const all = await api(s).get(`/visits/calendar?from=${from}&to=${to}`).expect(200);
    expect(all.body.length).toBeGreaterThan(0);
    const planned = await api(s).get(`/visits/calendar?from=${from}&to=${to}&status=PLANNED`).expect(200);
    expect(planned.body.every((v: { status: string }) => v.status === 'PLANNED')).toBe(true);
    await api(s).get('/visits/calendar').expect(400);
  });

  it('el Gestor sólo ve y gestiona sus propias visitas', async () => {
    const s = await login('gestor');
    const mine = await prisma.manager.findFirstOrThrow({ where: { code: 'GE1' } });
    const list = await api(s).get('/visits?pageSize=200').expect(200);
    expect(list.body.data.length).toBeGreaterThan(0);
    expect(list.body.data.every((v: { managerId: string }) => v.managerId === mine.id)).toBe(true);
    const foreign = await prisma.visit.findFirstOrThrow({ where: { managerId: { not: mine.id }, status: 'PLANNED' } });
    await api(s).get(`/visits/${foreign.id}`).expect(404);
    await api(s).post(`/visits/${foreign.id}/status`, { status: 'CANCELLED' }).expect(404);
  });

  it('exporta CSV respetando filtros', async () => {
    const s = await login('responsable');
    const res = await api(s).get('/visits/export?format=csv&status=PLANNED').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const lines = res.text.trim().split('\r\n');
    expect(lines[0]).toContain('Fecha');
    expect(lines.slice(1).every((l) => l.includes('PLANNED'))).toBe(true);
  });

  it('exporta Excel y PDF válidos', async () => {
    const s = await login('responsable');
    const x = await api(s).get('/agencies/export?format=xlsx').buffer(true).parse(binary);
    expect(x.status).toBe(200);
    expect((x.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    const p = await api(s).get('/agencies/export?format=pdf').buffer(true).parse(binary);
    expect((p.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });
});

describe('dashboard, informes y búsqueda', () => {
  it('KPIs dinámicos coherentes con la base de datos', async () => {
    const s = await login('admin');
    const res = await api(s).get('/dashboard').expect(200);
    const total = await prisma.visit.count({ where: { deletedAt: null } });
    expect(res.body.visits.total).toBe(total);
    expect(res.body.rankings.managers.length).toBeGreaterThan(0);
  });

  it('los filtros del dashboard reducen el resultado', async () => {
    const s = await login('admin');
    const agency = await prisma.agency.findFirstOrThrow({ where: { code: 'AG1' } });
    const all = await api(s).get('/dashboard').expect(200);
    const filtered = await api(s).get(`/dashboard?agencyId=${agency.id}&status=PLANNED`).expect(200);
    expect(filtered.body.visits.total).toBeLessThan(all.body.visits.total);
    expect(filtered.body.visits.total).toBe(filtered.body.visits.planned);
  });

  it('informes JSON y exportación', async () => {
    const s = await login('admin');
    const r = await api(s).get('/reports/manager-performance').expect(200);
    expect(r.body.rows.length).toBeGreaterThan(0);
    await api(s).get('/reports/inexistente').expect(400);
    const csv = await api(s).get('/reports/products?format=csv').expect(200);
    expect(csv.headers['content-type']).toMatch(/csv/);
  });

  it('búsqueda global agrupa por categoría', async () => {
    const s = await login('admin');
    const res = await api(s).get('/search?q=agencia').expect(200);
    expect(res.body.results.find((g: { category: string }) => g.category === 'agencies')).toBeTruthy();
    await api(s).get('/search?q=a').expect(400);
  });
});

describe('administración', () => {
  it('cambiar el rol de un usuario invalida su sesión y se audita', async () => {
    const admin = await login('superadmin');
    const target = await login('consulta');
    const user = await prisma.user.findUniqueOrThrow({ where: { username: 'consulta' } });
    const role = await prisma.role.findUniqueOrThrow({ where: { code: 'MANAGER' } });
    const before = await prisma.auditLog.count({ where: { action: 'user.role_change', entityId: user.id } });
    try {
      await api(admin).patch(`/users/${user.id}`, { roleId: role.id }).expect(200);
      await api(target).get('/auth/me').expect(401);
      expect(await prisma.auditLog.count({ where: { action: 'user.role_change', entityId: user.id } })).toBe(before + 1);
    } finally {
      // Restaura el rol original para que la BD de test siga siendo reutilizable.
      await prisma.user.update({ where: { id: user.id }, data: { roleId: user.roleId } });
    }
  });

  it('no permite editar roles de sistema', async () => {
    const s = await login('superadmin');
    const role = await prisma.role.findUniqueOrThrow({ where: { code: 'VIEWER' } });
    await api(s).patch(`/roles/${role.id}`, { permissions: ['agencies.read'] }).expect(400);
  });

  it('no permite conceder permisos que el administrador no posee', async () => {
    const s = await login('admin');
    await api(s).post('/roles', { code: 'CUSTOM_X', name: 'X', permissions: ['roles.create'] }).expect(403);
  });

  it('la auditoría es consultable con permiso y no filtra secretos', async () => {
    const s = await login('admin');
    const res = await api(s).get('/audit?pageSize=100').expect(200);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
  });

  it('tarjetas: rechaza PAN completo y aplica el ciclo de vida', async () => {
    const s = await login('responsable');
    await api(s).post('/cards', { maskedPan: '4111111111111111', reference: 'T-1' }).expect(400);
    const card = await api(s).post('/cards', { maskedPan: '4111 **** **** 1111', reference: `T-OK-${Date.now()}` }).expect(201);
    await api(s).post(`/cards/${card.body.id}/movements`, { type: 'ACTIVATION' }).expect(409);
    await api(s).post(`/cards/${card.body.id}/movements`, { type: 'DISTRIBUTION' }).expect(400);
    const agency = await prisma.agency.findFirstOrThrow();
    await api(s).post(`/cards/${card.body.id}/movements`, { type: 'DISTRIBUTION', agencyId: agency.id }).expect(201);
  });

  it('endpoints de salud', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
    await request(app.getHttpServer()).get('/ready').expect(200);
  });
});

describe('productos, ventas, clientes y objetivos', () => {
  it('registra una venta y la lista filtrada por producto', async () => {
    const s = await login('responsable');
    const manager = await prisma.manager.findFirstOrThrow({ where: { code: 'GE1' } });
    const product = await prisma.product.findFirstOrThrow({ where: { isDelta: true } });
    const created = await api(s).post('/sales', { productId: product.id, agencyId: manager.agencyId, managerId: manager.id, sold: true, amount: 125.5 }).expect(201);
    const list = await api(s).get(`/sales?productId=${product.id}&pageSize=200`).expect(200);
    expect(list.body.data.some((x: { id: string }) => x.id === created.body.id)).toBe(true);
    expect(list.body.data.every((x: { product: { id: string } }) => x.product.id === product.id)).toBe(true);
  });

  it('rechaza ventas con gestor de otra agencia y importes negativos', async () => {
    const s = await login('responsable');
    const manager = await prisma.manager.findFirstOrThrow({ where: { code: 'GE1' } });
    const other = await prisma.agency.findFirstOrThrow({ where: { id: { not: manager.agencyId } } });
    const product = await prisma.product.findFirstOrThrow();
    await api(s).post('/sales', { productId: product.id, agencyId: other.id, managerId: manager.id }).expect(400);
    await api(s).post('/sales', { productId: product.id, agencyId: manager.agencyId, managerId: manager.id, amount: -1 }).expect(400);
  });

  it('el Gestor sólo puede registrar ventas propias', async () => {
    const s = await login('gestor');
    const mine = await prisma.manager.findFirstOrThrow({ where: { code: 'GE1' } });
    const foreign = await prisma.manager.findFirstOrThrow({ where: { id: { not: mine.id } } });
    const product = await prisma.product.findFirstOrThrow();
    await api(s).post('/sales', { productId: product.id, agencyId: foreign.agencyId, managerId: foreign.id }).expect(400);
    await api(s).post('/sales', { productId: product.id, agencyId: mine.agencyId, managerId: mine.id }).expect(201);
  });

  it('clientes: el Gestor no puede crear, el Responsable sí; el código es único', async () => {
    const code = `C${Date.now()}`;
    await api(await login('gestor')).post('/customers', { code, fullName: 'X' }).expect(403);
    const s = await login('responsable');
    await api(s).post('/customers', { code, fullName: 'Cliente Test' }).expect(201);
    await api(s).post('/customers', { code, fullName: 'Duplicado' }).expect(409);
  });

  it('objetivos: valida que el periodo sea coherente', async () => {
    const s = await login('responsable');
    const now = Date.now();
    await api(s).post('/goals', { title: 'Mal', targetValue: 10, periodStart: new Date(now).toISOString(), periodEnd: new Date(now - 86_400_000).toISOString() }).expect(400);
    await api(s).post('/goals', { title: 'Bien', targetValue: 10, periodStart: new Date(now).toISOString(), periodEnd: new Date(now + 86_400_000).toISOString() }).expect(201);
  });
});
