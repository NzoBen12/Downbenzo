# Fase 1 — Auditoría de fuentes y del proyecto

## Hallazgo principal

El repositorio `nzoben12/downbenzo` contenía únicamente `README.md` (`# Downbenzo`). No existían:
`Se ha pegado el markdown.md`, `agenda_comercial_bange_platform.zip` ni `agenda_comercial_platform/*`.
Se buscaron también en el disco del entorno de ejecución sin resultado.

**Decisión (confirmada por el solicitante):** construir la plataforma únicamente desde la especificación.

## Clasificación de elementos

| Elemento | Clasificación |
|---|---|
| Módulos de navegación (Dashboard, Agencias, Gestores, Visitas, No-clientes, Calendario, Divisa, Lotes, Tarjetas, Información, Usuarios, Roles, Configuraciones) | **Inferido de la especificación** (no verificado contra la fuente) |
| Estados de visita (Planificada, Realizada/Exitosa, Sin éxito, Diferida, Anulada) | Especificación; no se añadieron estados |
| KPIs del dashboard (total, exitosas, anuladas, sin éxito, diferidas, planificadas, productos vendidos/no vendidos/DELTA, importe, divisas, rankings) | Especificación; **calculados dinámicamente**. No hay snapshot de valores |
| Datos del seed | **Placeholder/demo** (`origin = DEMO`). No existen registros `SOURCE_SNAPSHOT` |
| Fórmula de "puntuación" de gestor | **Inferida** (éxito / resueltas). Confirmar con negocio |
| Valores del producto "DELTA" | Booleano `Product.isDelta`; semántica real **pendiente de integración externa** |
| Autenticación corporativa, tarjetas (sistema origen), DELTA, notificaciones por correo | **Pendiente de integración externa** (adapters preparados) |
| Rutas/URLs/IP internas, tokens CSRF, cookies del sistema original | No se reproducen ni se usan |

## Qué hay que revisar cuando lleguen las fuentes

1. Contrastar nombres de módulos, etiquetas, columnas y filtros con el HTML original.
2. Cargar los valores visibles como `SOURCE_SNAPSHOT` (el enum `DataOrigin` ya existe) — nunca presentarlos como datos vivos.
3. Confirmar fórmula de puntuación, definición de "producto no vendido" y semántica DELTA.
4. Revisar el mapeo de [migration.md](migration.md).

## Riesgos

* Divergencia entre lo inferido y el sistema real (mitigación: punto 1 arriba).
* Reglas de negocio (estados finales de visita, alcance por rol) son decisiones nuestras; ver [architecture.md](architecture.md#decisiones).
