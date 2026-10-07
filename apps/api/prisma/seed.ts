/* Datos de DEMOSTRACIÓN. Todo registro se marca origin = DEMO: no son datos bancarios reales. */
import { PrismaClient, VisitStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { ALL_PERMISSIONS, SYSTEM_ROLES } from '../src/common/permissions';

const prisma = new PrismaClient();
const origin = 'DEMO' as const;

// PRNG determinista para que el seed sea reproducible.
let state = 42;
const rnd = () => ((state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const day = 86_400_000;

async function main() {
  const password = process.env.SEED_PASSWORD ?? `Demo-${randomBytes(9).toString('base64url')}1a`;
  const hash = process.env.SEED_MODE === 'reference' ? '' : await argon2.hash(password);

  for (const code of ALL_PERMISSIONS) {
    await prisma.permission.upsert({ where: { code }, create: { code, description: code }, update: {} });
  }
  const perms = await prisma.permission.findMany();
  const byCode = new Map(perms.map((p) => [p.code, p.id]));
  const roles: Record<string, string> = {};
  for (const r of SYSTEM_ROLES) {
    const role = await prisma.role.upsert({
      where: { code: r.code },
      create: { code: r.code, name: r.name, description: r.description, isSystem: true },
      update: { name: r.name, description: r.description },
    });
    roles[r.code] = role.id;
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({ data: r.permissions.map((p) => ({ roleId: role.id, permissionId: byCode.get(p)! })) });
  }

  if (process.env.SEED_MODE === 'reference') {
    console.log('Seed de referencia completado: sólo roles y permisos (sin datos demo ni usuarios).');
    return;
  }

  if ((await prisma.agency.count()) > 0) {
    console.log('La base de datos ya contiene agencias: se omiten los datos demo.');
    return;
  }

  const cities = ['Malabo', 'Bata', 'Ebebiyín', 'Mongomo', 'Luba'];
  const agencies = await Promise.all(
    cities.map((city, i) => prisma.agency.create({ data: { code: `AG${i + 1}`, name: `Agencia ${city}`, city, phone: `+240 555 00${i}0`, origin } })),
  );
  const names = ['Ana Mba', 'Carlos Nguema', 'Lucía Obiang', 'Pedro Esono', 'María Ela', 'Juan Ondo', 'Sara Bela', 'Diego Nsue'];
  const managers = await Promise.all(
    names.map((fullName, i) =>
      prisma.manager.create({ data: { code: `GE${i + 1}`, fullName, email: `gestor${i + 1}@demo.bange.example`, agencyId: agencies[i % agencies.length].id, origin } }),
    ),
  );

  const mk = (username: string, fullName: string, role: string, extra: object = {}) =>
    prisma.user.create({ data: { username, email: `${username}@demo.bange.example`, fullName, roleId: roles[role], passwordHash: hash, ...extra } });
  await mk('superadmin', 'Super Admin Demo', 'SUPER_ADMIN');
  await mk('admin', 'Administrador Demo', 'ADMIN');
  await mk('responsable', 'Responsable Comercial Demo', 'COMMERCIAL_LEAD');
  await mk('jefe', 'Jefe de Agencia Demo', 'AGENCY_HEAD', { agencyId: agencies[0].id });
  const mgrUser = await mk('gestor', 'Gestor Demo', 'MANAGER', { agencyId: managers[0].agencyId });
  await prisma.manager.update({ where: { id: managers[0].id }, data: { userId: mgrUser.id } });
  await mk('consulta', 'Consulta Demo', 'VIEWER');

  const products = await Promise.all(
    [['CUENTA', 'Cuenta corriente', false], ['TARJ', 'Tarjeta de débito', false], ['DELTA1', 'DELTA Premium', true], ['DELTA2', 'DELTA Estándar', true], ['SEG', 'Seguro', false], ['PREST', 'Préstamo personal', false]].map(
      ([code, name, isDelta]) => prisma.product.create({ data: { code: code as string, name: name as string, isDelta: isDelta as boolean, origin } }),
    ),
  );
  const customers = await Promise.all(
    Array.from({ length: 10 }, (_, i) => prisma.customer.create({ data: { code: `CLI${String(i + 1).padStart(4, '0')}`, fullName: `Cliente Demo ${i + 1}`, origin } })),
  );
  const interests = ['Cuenta', 'Tarjeta', 'Seguro', 'Préstamo', 'Divisas'];
  const prospects = await Promise.all(
    Array.from({ length: 40 }, (_, i) =>
      prisma.prospect.create({
        data: { fullName: `Prospecto Demo ${i + 1}`, city: pick(cities), interests: [pick(interests)], status: pick(['NEW', 'IN_FOLLOW_UP', 'CONVERTED', 'LOST'] as const), origin },
      }),
    ),
  );

  const now = Date.now();
  const statuses: VisitStatus[] = ['SUCCESSFUL', 'SUCCESSFUL', 'SUCCESSFUL', 'UNSUCCESSFUL', 'DEFERRED', 'CANCELLED'];
  for (let i = 0; i < 220; i++) {
    const offset = Math.floor(rnd() * 120) - 90; // -90..+30 días
    const m = pick(managers);
    const future = offset > 0;
    const status: VisitStatus = future ? 'PLANNED' : pick(statuses);
    const useProspect = rnd() < 0.8;
    const visit = await prisma.visit.create({
      data: {
        scheduledAt: new Date(now + offset * day + Math.floor(rnd() * 9) * 3_600_000),
        status, agencyId: m.agencyId, managerId: m.id,
        prospectId: useProspect ? pick(prospects).id : null,
        customerId: useProspect ? null : pick(customers).id,
        result: status === 'SUCCESSFUL' ? 'Interés confirmado' : status === 'UNSUCCESSFUL' ? 'Sin interés' : null,
        origin,
      },
    });
    if (status === 'SUCCESSFUL' || status === 'UNSUCCESSFUL') {
      const sold = status === 'SUCCESSFUL' && rnd() < 0.7;
      await prisma.productSale.create({
        data: { productId: pick(products).id, agencyId: m.agencyId, managerId: m.id, visitId: visit.id, sold, amount: sold ? Math.round(rnd() * 5_000_000) / 100 : 0, soldAt: visit.scheduledAt, origin },
      });
    }
  }
  for (let i = 0; i < 80; i++) {
    const m = pick(managers);
    await prisma.currencyOperation.create({
      data: { operatedAt: new Date(now - Math.floor(rnd() * 90) * day), currency: pick(['USD', 'EUR', 'XAF', 'GBP']), amount: Math.round(rnd() * 200_000) / 100 + 10, rate: 1 + Math.round(rnd() * 100) / 100, agencyId: m.agencyId, managerId: m.id, status: pick(['COMPLETED', 'COMPLETED', 'PENDING', 'CANCELLED'] as const), origin },
    });
  }
  for (let i = 0; i < 6; i++) {
    const lot = await prisma.lot.create({ data: { code: `LOT-${String(i + 1).padStart(4, '0')}`, quantity: 10, agencyId: agencies[i % agencies.length].id, status: pick(['CREATED', 'IN_TRANSIT', 'DELIVERED'] as const), origin } });
    for (let c = 0; c < 10; c++) {
      const delivered = lot.status === 'DELIVERED';
      const card = await prisma.card.create({
        data: { reference: `${lot.code}-${c + 1}`, maskedPan: `4000 **** **** ${String(1000 + i * 10 + c)}`, lotId: lot.id, agencyId: delivered ? lot.agencyId : null, status: delivered ? 'DISTRIBUTED' : 'IN_STOCK', origin },
      });
      await prisma.cardMovement.create({ data: { cardId: card.id, type: 'ENTRY' } });
      if (delivered) await prisma.cardMovement.create({ data: { cardId: card.id, type: 'DISTRIBUTION' } });
    }
  }
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
  await prisma.goal.createMany({
    data: [
      { title: 'Visitas exitosas del mes', targetValue: 120, currentValue: 64, periodStart: monthStart, periodEnd: monthEnd },
      { title: 'Ventas DELTA', targetValue: 40, currentValue: 12, periodStart: monthStart, periodEnd: monthEnd, productId: products[2].id },
    ],
  });
  await prisma.action.createMany({
    data: [
      { title: 'Seguimiento de prospectos en estado "En seguimiento"', dueDate: new Date(now + 7 * day), managerId: managers[0].id },
      { title: 'Revisar lotes en tránsito', dueDate: new Date(now + 3 * day) },
    ],
  });
  await prisma.configuration.createMany({
    data: [
      { key: 'general.org_name', value: 'BANGE', category: 'general' },
      { key: 'general.default_page_size', value: 20, category: 'general' },
      { key: 'visits.reminder_hours', value: 24, category: 'visits' },
      { key: 'integration.delta.enabled', value: false, category: 'integration' },
    ],
  });
  await prisma.auditLog.create({ data: { action: 'seed.run', entity: 'System', after: { origin } } });

  console.log('Seed completado (datos DEMO).');
  if (!process.env.SEED_PASSWORD) console.log(`Contraseña generada para usuarios demo (superadmin, admin, responsable, jefe, gestor, consulta): ${password}`);
}

main().finally(() => prisma.$disconnect());
