# Agenda Comercial BANGE

Plataforma modular de gestión comercial: agencias, gestores, visitas, prospectos (no-clientes), calendario,
productos, cambio de divisa, lotes, tarjetas, objetivos, usuarios/roles, informes y auditoría.

> **Estado de las fuentes.** El prompt de origen referencia `Se ha pegado el markdown.md` y
> `agenda_comercial_bange_platform.zip`, pero **no estaban en el repositorio ni en el entorno** al construir
> esta versión. Todo el producto se ha derivado de la especificación. Ningún dato procede del sistema BANGE
> existente; los datos del seed son `DEMO`. Ver [docs/source-analysis.md](docs/source-analysis.md).

## Arquitectura

```
apps/
  api/   NestJS 11 · TypeScript · Prisma · PostgreSQL     (API REST /api/v1)
  web/   React 19 · Vite · React Router · TanStack Query · React Hook Form + Zod
docs/    architecture · database · security · api · deployment · source-analysis · migration
```

Capas del backend: `controller` (HTTP, permisos) → `service` (reglas de negocio, auditoría) → `Prisma` (persistencia).
Transversales: autenticación (`AuthProvider` desacoplado), RBAC (guard global), CSRF, auditoría, exportación,
notificaciones (`NotificationService` desacoplado), logging estructurado con `requestId`, errores centralizados.
Detalle en [docs/architecture.md](docs/architecture.md).

## Requisitos

Node ≥ 20, npm ≥ 10, PostgreSQL 16 (o Docker).

## Puesta en marcha local

```bash
cp .env.example .env            # y complete credenciales/secretos (ver "Variables de entorno")
npm install
# Base de datos (ejemplo con Docker): docker compose up -d db
cd apps/api && cp ../../.env .env   # la API lee apps/api/.env o variables del entorno
npx prisma migrate deploy       # aplica migraciones
npm run db:seed                 # datos DEMO; imprime una contraseña aleatoria si no define SEED_PASSWORD
cd ../.. && npm run dev:api     # http://localhost:3000  (health: /health, ready: /ready)
npm run dev:web                 # http://localhost:5173  (proxy /api → API)
```

Usuarios demo (contraseña = `SEED_PASSWORD` o la impresa por el seed):
`superadmin`, `admin`, `responsable`, `jefe`, `gestor`, `consulta`.

### Comandos

| Comando | Acción |
|---|---|
| `npm run db:migrate` | `prisma migrate deploy` (no destructivo) |
| `npm run db:seed` | datos demo (idempotente: omite si ya hay agencias) |
| `npm -w apps/api run db:seed:reference` | sólo roles y permisos (producción) |
| `npm run db:reset` | `prisma migrate reset` — **destructivo**, sólo desarrollo, ejecútelo usted |
| `npm run lint` / `typecheck` / `test` / `build` | calidad |
| `npm -w apps/web run e2e` | E2E Playwright (requiere API compilada y BD de test) |

## Tests

* **Unit** (Vitest): reglas de visitas, KPIs y rankings, ciclo de vida de tarjetas, exportación (anti-inyección
  de fórmulas), configuración, catálogo de permisos, cliente HTTP, componentes UI.
* **Integración** (`apps/api/test`, supertest + PostgreSQL real): login/lockout/logout, CSRF, RBAC, alcance de
  datos por rol, CRUD, máquina de estados de visitas, calendario, dashboard, informes, exportación CSV/XLSX/PDF,
  búsqueda, auditoría, escalada de privilegios.
* **E2E** (Playwright): login, dashboard, agencias, gestores, crear/editar visita, calendario, autorización,
  exportación y búsqueda global.

La BD de test (`bange_agenda_test`) debe existir; `TEST_DATABASE_URL` la configura. El setup aplica
`migrate deploy` y el seed (no resetea la BD).

## Docker

```bash
cp .env.example .env   # defina POSTGRES_PASSWORD y JWT_SECRET
docker compose up --build   # web http://localhost:8080 · api http://localhost:3000
docker compose exec api node ../../node_modules/tsx/dist/cli.mjs prisma/seed.ts   # opcional: datos demo
```

> La configuración Docker/Compose está escrita y `docker compose config` valida, pero **no se pudo construir ni
> ejecutar** en el entorno de desarrollo (sin daemon Docker). Verifíquela en su infraestructura.

## Variables de entorno

Ver [.env.example](.env.example). Obligatorias: `DATABASE_URL`, `JWT_SECRET` (≥ 32 caracteres; la API no arranca sin ellas).
No hay secretos ni credenciales en el repositorio.

## Seguridad (resumen)

Sesión por cookie `HttpOnly` + `SameSite=Strict`, CSRF double-submit, argon2id, bloqueo por intentos fallidos,
rate limiting, cabeceras (helmet/CSP), RBAC verificado en servidor, alcance de datos por agencia/gestor,
validación Zod en todas las entradas, auditoría con valores antes/después, PAN de tarjeta sólo enmascarado,
exportaciones neutralizadas contra inyección de fórmulas. Detalle y límites en [docs/security.md](docs/security.md).

## Integraciones futuras

Interfaces/adapters preparados, **no implementados** (requieren información corporativa):
`CorporateAuthProvider` (SSO/LDAP/AD/OIDC), `NotificationService` (correo/push), DELTA, sistema de tarjetas.
Ver [docs/architecture.md#integraciones](docs/architecture.md) y [docs/migration.md](docs/migration.md).
