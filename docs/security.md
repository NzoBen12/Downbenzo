# Seguridad

| Control | Implementación |
|---|---|
| Autenticación | `AuthProvider` (local con argon2id; corporativo = stub). Mensaje idéntico para usuario inexistente/clave errónea |
| Sesión | JWT HS256 en cookie `HttpOnly`, `SameSite=Strict`, `Secure` configurable; expiración `JWT_EXPIRES_IN_MINUTES`; revocación por `tokenVersion` |
| CSRF | Double-submit (`bange_csrf` + cabecera `X-CSRF-Token`) en mutaciones con cookie |
| Contraseñas | Política ≥12 caracteres con mayúsculas/minúsculas/números; cambio propio exige la actual, invalida otras sesiones y se audita |
| Fuerza bruta | Bloqueo tras `LOGIN_MAX_ATTEMPTS` (HTTP 423) + rate limit de login y global |
| Autorización | RBAC con guard global en servidor + alcance de datos por agencia/gestor. El frontend sólo oculta por UX |
| Entrada | Zod en body, query y params; paginación acotada; orden por lista blanca |
| SQL injection | Prisma parametrizado; sin SQL crudo con entrada de usuario (`$queryRaw` sólo en `/ready`) |
| XSS | React escapa; CSP estricta en API y nginx; sin `dangerouslySetInnerHTML` |
| Exportaciones | Prefijo `'` ante `= + - @` (inyección de fórmulas); requieren `reports.export` |
| Cabeceras | helmet, `Referrer-Policy: no-referrer`, `X-Frame-Options`/`frame-ancestors none` |
| Errores | Filtro global: nunca devuelve stack traces; incluye `requestId` |
| Logs | Sin cabeceras, cookies ni cuerpos; auditoría redacta `password*`, `token`, `secret` |
| Auditoría | Usuario, fecha, operación, entidad, id, antes/después, IP, requestId, resultado |
| Secretos | Sólo por entorno; `JWT_SECRET` ≥ 32 caracteres validado al arrancar; `.env` ignorado por Git |
| Datos de tarjeta | Sólo PAN enmascarado |

## Límites conocidos / recomendaciones antes de producción

* Activar `COOKIE_SECURE=true` y servir sólo por HTTPS; ajustar `CORS_ORIGINS`.
* El rate limiting es en memoria (por instancia): usar almacén compartido (Redis) si hay varias réplicas.
* La auditoría registra el resultado FALLO sólo en login; los 403/validaciones no se auditan (están en logs).
* El `Content-Security-Policy` de nginx permite `style-src 'unsafe-inline'` (estilos en línea de React): endurecer con nonces/hash si se requiere.
* `npm audit` reporta avisos en dependencias transitivas de herramientas de build; revisar en el pipeline.
* Sin MFA ni política de rotación de contraseñas: delegar en el IdP corporativo.
* Pruebas de penetración y revisión de cumplimiento bancario **no realizadas**.
