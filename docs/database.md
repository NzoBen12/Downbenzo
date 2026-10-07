# Base de datos

PostgreSQL 16, Prisma. Esquema: `apps/api/prisma/schema.prisma`; migraciones en `apps/api/prisma/migrations`.

## Entidades

`User`, `Role`, `Permission`, `RolePermission`, `Agency`, `Manager`, `Customer`, `Prospect`, `Visit`,
`Product`, `ProductSale`, `Goal`, `Action`, `CurrencyOperation`, `Lot`, `Card`, `CardMovement`,
`Notification`, `AuditLog`, `Configuration`. Estados como enums (`VisitStatus`, `ProspectStatus`, `LotStatus`,
`CardStatus`, `CardMovementType`, `CurrencyOperationStatus`, `GoalStatus`, `ActionStatus`).

* **Soft delete** (`deletedAt`): User, Agency, Manager, Prospect, Visit.
* **Procedencia:** `origin` (`USER` | `DEMO` | `SOURCE_SNAPSHOT`) en datos de negocio.
* **Integridad:** FKs en todas las relaciones; `Visit.agencyId/managerId` obligatorios (la API valida que el gestor
  pertenezca a la agencia); cliente XOR prospecto en visita (validado en API, no con CHECK).
* **Índices** orientados a dashboard/filtros: `Visit(scheduledAt)`, `(status)`, `(agencyId, scheduledAt)`,
  `(managerId, scheduledAt)`, `ProductSale(soldAt)`, `(productId, soldAt)`, `(agencyId, soldAt)`,
  `CurrencyOperation(operatedAt)`, `(agencyId, operatedAt)`, `AuditLog(createdAt)`, `(entity, entityId)`.

## Comandos

```bash
npx prisma migrate deploy        # aplicar migraciones (no destructivo)
npx prisma migrate dev --name x  # crear migración (desarrollo)
npm run db:seed                  # datos DEMO
npm run db:reset                 # DESTRUCTIVO: sólo desarrollo
```

## Pendiente / mejoras

* Búsqueda por texto con `pg_trgm` si crecen los volúmenes (hoy `ILIKE`).
* CHECK constraints (cliente XOR prospecto) y particionado de `AuditLog` en producción.
