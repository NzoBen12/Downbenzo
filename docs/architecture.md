# Arquitectura

## Visión general

Monorepo npm workspaces. SPA React servida por nginx (o Vite en desarrollo) → API REST NestJS → PostgreSQL.
El navegador sólo habla con `/api/v1` del mismo origen (cookies `SameSite=Strict`); el frontend no conoce
la base de datos, ni IPs/URLs internas.

```
Browser ── /api/v1 ──► NestJS ──► Prisma ──► PostgreSQL
                         ├─ AuthProvider (local | corporate)
                         ├─ AuditService ─► AuditLog
                         ├─ ExportService (CSV/XLSX/PDF)
                         └─ NotificationService (interna; correo/push = adapter futuro)
```

## Backend (`apps/api/src`)

| Carpeta | Responsabilidad |
|---|---|
| `config/` | validación de entorno con Zod (falla al arrancar si falta algo) |
| `auth/` | login, JWT en cookie, `AuthProvider`, guards globales (auth, CSRF, permisos) |
| `common/` | catálogo de permisos y roles, alcance de datos (`dataScope`), paginación, `ZodPipe`, errores/requestId |
| `audit/`, `export/`, `prisma/` | servicios globales |
| `modules/<dominio>/` | controller (HTTP + permisos) · service (reglas) · schemas (Zod) |

Los guards son globales (`APP_GUARD`): una ruta **sin** `@Public()` exige sesión; `@RequirePermissions()` exige permisos.
Una ruta nueva sin decorador de permisos queda autenticada pero no autorizada por permiso: revisarlo en code review.

## Frontend (`apps/web/src`)

`api/` (cliente + tipos) · `auth/` (contexto, `Can`) · `components/ui/` (design system) · `layout/` ·
`pages/` · `lib/` (formato, hooks de listado). Estado de servidor con TanStack Query; estado de filtros en la URL.
La lógica de negocio vive en el servidor; los componentes sólo presentan y validan UX (Zod/RHF).

## Decisiones

* **Estados de visita como enum**, no tabla: son cinco, cerrados y con máquina de estados en código (`visit.rules.ts`).
  Estados finales: Exitosa, Sin éxito, Anulada. Diferida puede volver a Planificada con nueva fecha.
* **Alcance de datos por rol:** Jefe/a de Agencia → su agencia; Gestor/a → su agencia y sólo sus visitas/ventas.
  Resto → global. Aplicado en servidor (404 si el recurso queda fuera de alcance).
* **Anti-escalada:** un rol no puede conceder permisos que no posee; sólo Super Admin asigna/toca Super Admin;
  roles de sistema inmutables; nadie se bloquea/desactiva/cambia su propio rol.
* **Invalidación de sesiones** por `tokenVersion` (logout, bloqueo, cambio de rol/permisos, reset de contraseña).
* **Tarjetas:** sólo PAN enmascarado; el alta rechaza un PAN completo.
* **Dinero:** `Decimal(18,2)` en BD; se serializa como string.
* **Tendencia del dashboard** se agrega en memoria hasta 100 000 visitas del filtro; para volúmenes mayores,
  mover a `date_trunc` SQL / vista materializada.
* **Tests de BD** usan `migrate deploy` + seed idempotente (no `migrate reset`: Prisma lo bloquea para agentes de IA).

## Integraciones

| Adapter | Estado | Dónde |
|---|---|---|
| `AuthProvider` → `CorporateAuthProvider` | Stub (`NotImplementedException`) | `auth/corporate-auth.provider.ts`; activar con `AUTH_PROVIDER=corporate` |
| `NotificationService` | Implementación interna (BD) | `modules/notifications`; añadir adapters de correo/push |
| DELTA | Sólo `Product.isDelta` + flag `integration.delta.enabled` | crear `DeltaService` tras definir contrato |
| Sistema de tarjetas | Datos locales | crear `CardsGateway` tras definir contrato |

## Observabilidad

Logs JSON por petición (`requestId`, método, ruta sin query, estado, ms; nunca cabeceras/cuerpos),
`X-Request-Id` propagado, `/health`, `/ready` (BD), `/metrics` (básico, sin datos sensibles).
