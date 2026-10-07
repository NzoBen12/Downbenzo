# Despliegue

1. **Imágenes:** `apps/api/Dockerfile` (migra con `prisma migrate deploy` al arrancar y sirve en :3000) y
   `apps/web/Dockerfile` (nginx no-root en :8080, proxy `/api` → `api:3000`).
2. **Secretos** por variables de entorno del orquestador (nunca en imagen/Git): `DATABASE_URL`, `JWT_SECRET`, etc.
3. **HTTPS** en el balanceador; `COOKIE_SECURE=true`; `CORS_ORIGINS` con el origen público.
4. **BD:** PostgreSQL gestionado con backups; usuario de aplicación con permisos mínimos (migraciones con otro rol si es posible).
5. **Datos iniciales:** el seed crea roles/permisos (necesarios) y datos DEMO. En producción ejecute sólo la parte de
   roles/permisos o cree los roles manualmente; **no cargue datos demo**.
6. **Salud:** `/health` (liveness), `/ready` (readiness con BD).
7. **CI:** `.github/workflows/ci.yml` ejecuta lint, typecheck, tests (con PostgreSQL), build y E2E. No despliega.

> Docker/Compose no se pudo ejecutar en el entorno de desarrollo; valide el build de imágenes en su pipeline.
