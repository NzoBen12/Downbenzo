import { execSync } from 'child_process';

export const TEST_PASSWORD = 'Test-Passw0rd-Demo1';

export default function setup() {
  const url =
    process.env.TEST_DATABASE_URL ?? 'postgresql://bange:bange_dev@localhost:5432/bange_agenda_test?schema=public';
  const env = { ...process.env, DATABASE_URL: url, SEED_PASSWORD: TEST_PASSWORD };
  execSync('npx prisma migrate deploy', { env, stdio: 'ignore' });
  execSync('npx tsx prisma/seed.ts', { env, stdio: 'ignore' });
}
