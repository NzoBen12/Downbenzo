# Estrategia de migración desde el sistema existente

> **No ejecutar migraciones destructivas automáticamente.** Esta plataforma no modifica ni lee el sistema origen.
> Sin acceso a la fuente (ver [source-analysis.md](source-analysis.md)), el mapeo es una **plantilla** a validar.

## Procedimiento propuesto

1. Extraer del sistema origen a CSV/JSON de sólo lectura (por la vía oficial que BANGE autorice, no scraping de URLs internas).
2. Cargar en una BD de **staging** con `origin = SOURCE_SNAPSHOT`.
3. Validar: conteos, claves únicas, referencias (agencia ↔ gestor ↔ visita), estados válidos.
4. Revisión de negocio de diferencias; sólo entonces promover a la BD objetivo en una ventana controlada con backup previo.
5. Los valores visibles de la UI original nunca se importan como cifras permanentes: el dashboard se recalcula.

## Mapeo propuesto (a confirmar)

| Origen (supuesto) | Destino | Transformación | Notas |
|---|---|---|---|
| Agencia (código, nombre, localidad) | `Agency` | trim; `code` único | |
| Gestor (nombre, agencia) | `Manager` | resolver `agencyId` por código | usuarios de acceso → `User.externalId` (SSO), **sin contraseñas** |
| Visita (fecha, estado, gestor, agencia, cliente/prospecto, observaciones) | `Visit` | normalizar estado a enum de 5 valores | tabla de equivalencias pendiente |
| No-cliente | `Prospect` | `interests` → array | |
| Producto / venta / DELTA | `Product` / `ProductSale` | `isDelta` según catálogo DELTA | **semántica DELTA pendiente** |
| Divisas | `CurrencyOperation` | moneda ISO-4217, importe `Decimal` | |
| Lotes / tarjetas / movimientos | `Lot` / `Card` / `CardMovement` | **sólo PAN enmascarado** | sistema de tarjetas = integración externa |
| Usuarios / roles | `User` / `Role` | mapear a roles RBAC | credenciales: no migrar; usar IdP |

## Campos no disponibles / dependen de integración externa

Contraseñas, PAN completos (no se almacenan), semántica DELTA, estados/valores exactos del sistema origen,
objetivos y acciones (estructura inferida), datos de cliente (sólo código y nombre).
