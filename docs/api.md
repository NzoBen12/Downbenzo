# API REST `/api/v1`

Autenticación por cookie de sesión (`bange_session`). Las mutaciones exigen `X-CSRF-Token` = cookie `bange_csrf`
(devuelto en `POST /auth/login` como `csrfToken`). Errores: `{ statusCode, message, errors?, requestId }`.
Listados: `?page&pageSize(≤200)&search&sortBy&sortDir` + filtros → `{ data, meta:{page,pageSize,total,totalPages} }`.
Códigos: 400 validación/regla · 401 sin sesión · 403 sin permiso/CSRF · 404 no existe o fuera de alcance · 409 estado no permitido · 423 cuenta bloqueada · 429 rate limit.

| Recurso | Endpoints | Permiso |
|---|---|---|
| Salud (sin prefijo) | `GET /health` `/ready` `/metrics` | público |
| Auth | `POST /auth/login` `POST /auth/logout` `GET /auth/me` | login público |
| Agencias | `GET /agencies` `/agencies/export?format=csv\|xlsx\|pdf` `/agencies/:id` · `POST` · `PATCH :id` · `POST :id/activate\|deactivate` · `DELETE :id` | `agencies.*` |
| Gestores | `GET /managers` `/:id` · `POST` `PATCH` `DELETE` | `managers.*` |
| Visitas | `GET /visits` `/visits/calendar?from&to` `/visits/export` `/visits/:id` · `POST` · `PATCH :id` · `POST :id/status` · `DELETE :id` | `visits.*` |
| Prospectos / Clientes | `GET/POST/PATCH/DELETE /prospects` · `GET/POST/PATCH /customers` | `prospects.*` `customers.*` |
| Productos / Ventas | `GET/POST/PATCH /products` · `GET/POST /sales` | `products.*` `sales.*` |
| Divisas | `GET/POST /currency-operations` `PATCH :id` `GET /export` | `currency.*` |
| Lotes | `GET/POST /lots` `GET :id` `POST :id/status` | `lots.*` |
| Tarjetas | `GET/POST /cards` `GET :id` `/cards/distribution` `/cards/movements` `POST :id/movements` | `cards.*` |
| Objetivos / Acciones | `GET/POST/PATCH /goals` `/actions` | `goals.*` `actions.*` |
| Dashboard | `GET /dashboard?from&to&agencyId&managerId&status` | `dashboard.read` |
| Informes | `GET /reports/:type?format=json\|csv\|xlsx\|pdf` (`activity`, `visits`, `manager-performance`, `agency-performance`, `products`, `currency`, `prospects`) | `reports.read` (+`reports.export`) |
| Búsqueda | `GET /search?q=` (agrupa por categoría; sólo categorías con permiso de lectura) | autenticado |
| Notificaciones | `GET /notifications` `POST :id/read` `POST read-all` | `notifications.read` |
| Usuarios | `GET /users` `/:id` · `POST` `PATCH` · `POST :id/block\|unblock` | `users.*` |
| Roles | `GET /roles` `/roles/permissions` `/:id` · `POST` `PATCH` | `roles.*` |
| Configuración | `GET /config` · `PUT /config/:key` | `config.*` |
| Auditoría | `GET /audit?entity&action&result&from&to&userId` | `audit.read` |

## Máquina de estados de visitas (`POST /visits/:id/status`)

`PLANNED → SUCCESSFUL | UNSUCCESSFUL | DEFERRED | CANCELLED` · `DEFERRED → PLANNED (newScheduledAt futura) | SUCCESSFUL | UNSUCCESSFUL | CANCELLED`.
Estados finales no admiten cambios ni edición (409).

## KPIs del dashboard

`visits` (total, por estado, `successRate` = exitosas/(exitosas+sin éxito)), `products` (vendidos, no vendidos, DELTA, importe),
`currency` (operaciones completadas y por moneda), `rankings` (gestores/agencias por visitas exitosas), `trend` (visitas/día).
Todos respetan filtros y el alcance de datos del usuario.
