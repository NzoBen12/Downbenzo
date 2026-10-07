import 'reflect-metadata';
import { createApp } from './bootstrap';
import { loadEnv } from './config/env';

/** Carga .env (cwd, luego raíz del monorepo) sin sobrescribir variables ya definidas en el entorno. */
function loadDotEnv() {
  for (const path of ['.env', '../../.env']) {
    try {
      process.loadEnvFile(path);
    } catch {
      /* archivo ausente: se usa el entorno */
    }
  }
}

async function main() {
  loadDotEnv();
  const env = loadEnv();
  const app = await createApp();
  await app.listen(env.PORT, '0.0.0.0');
}

void main();
