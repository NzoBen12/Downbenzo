import { expect, Page, test } from '@playwright/test';

const PASSWORD = process.env.E2E_PASSWORD ?? 'Test-Passw0rd-Demo1';

async function login(page: Page, user: string) {
  await page.goto('/login');
  await page.getByLabel('Usuario o correo').fill(user);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('main')).toBeVisible();
}

test('1-2. inicia sesión y accede al dashboard con KPIs dinámicos', async ({ page }) => {
  await login(page, 'admin');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Total visitas' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Visitas exitosas' })).toBeVisible();
});

test('rechaza credenciales inválidas', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Usuario o correo').fill('admin');
  await page.getByLabel('Contraseña').fill('incorrecta-123');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('alert')).toContainText('Credenciales inválidas');
});

test('redirige a login sin sesión', async ({ page }) => {
  await page.goto('/agencies');
  await expect(page).toHaveURL(/\/login/);
});

test('3. consulta agencias con búsqueda, y 4. gestores', async ({ page }) => {
  await login(page, 'responsable');
  await page.getByRole('link', { name: 'Agencias' }).click();
  await expect(page.getByRole('table', { name: 'Listado de agencias' })).toBeVisible();
  await page.getByLabel('Buscar').fill('Bata');
  await expect(page.getByRole('link', { name: 'Agencia Bata' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Agencia Malabo' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Agencia Bata' }).click();
  await expect(page.getByRole('heading', { name: 'Agencia Bata' })).toBeVisible();
  await page.getByRole('link', { name: 'Gestores', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Listado de gestores' })).toBeVisible();
});

test('5-6. crea y edita una visita', async ({ page }) => {
  const tag = `E2E-${Date.now()}`;
  await login(page, 'responsable');
  await page.goto('/visits');
  await page.getByRole('button', { name: 'Nueva visita' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva visita' });
  const when = new Date(Date.now() + 3 * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  await dialog.getByLabel('Fecha y hora').fill(`${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T10:00`);
  await dialog.getByLabel('Agencia').selectOption({ label: 'Agencia Malabo' });
  await dialog.getByLabel('Gestor').selectOption({ index: 1 });
  await dialog.getByLabel('Prospecto', { exact: true }).selectOption({ index: 1 });
  await dialog.getByLabel('Observaciones').fill(`Visita creada ${tag}`);
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Visita creada', { exact: true })).toBeVisible();

  await page.getByLabel('Buscar').fill(`Visita creada ${tag}`);
  await expect(page.getByRole('table', { name: 'Listado de visitas' }).getByRole('row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Editar' }).first().click();
  const edit = page.getByRole('dialog', { name: 'Editar visita' });
  await edit.getByLabel('Observaciones').fill(`Visita editada ${tag}`);
  await edit.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Visita actualizada')).toBeVisible();
  await page.getByLabel('Buscar').fill(`Visita editada ${tag}`);
  await expect(page.getByRole('table', { name: 'Listado de visitas' }).getByRole('row')).toHaveCount(2);
});

test('7. consulta el calendario y cambia de vista', async ({ page }) => {
  await login(page, 'responsable');
  await page.getByRole('link', { name: 'Calendario' }).click();
  await expect(page.getByRole('grid')).toBeVisible();
  await page.getByRole('tab', { name: 'Semanal' }).click();
  await expect(page.getByRole('grid')).toBeVisible();
  await page.getByRole('tab', { name: 'Diaria' }).click();
  await expect(page.getByLabel('Visitas del día')).toBeVisible();
});

test('8. autorización: Consulta no ve acciones ni secciones de administración', async ({ page }) => {
  await login(page, 'consulta');
  await expect(page.getByRole('link', { name: 'Usuarios' })).toHaveCount(0);
  await page.goto('/visits');
  await expect(page.getByRole('button', { name: 'Nueva visita' })).toHaveCount(0);
  await page.goto('/users');
  await expect(page.getByText('No autorizado')).toBeVisible();
  // El backend también rechaza la llamada directa.
  const status = await page.evaluate(async () => (await fetch('/api/v1/users')).status);
  expect(status).toBe(403);
});

test('9. exporta CSV respetando los filtros', async ({ page }) => {
  await login(page, 'responsable');
  await page.goto('/visits?status=PLANNED');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Exportar CSV' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^visitas-.*\.csv$/);
  const content = (await (await download.createReadStream()).toArray()).join('');
  const lines = content.trim().split(/\r?\n/);
  expect(lines.length).toBeGreaterThan(1);
  expect(lines.slice(1).every((l) => l.includes('PLANNED'))).toBe(true);
});

test('búsqueda global navega al detalle', async ({ page }) => {
  await login(page, 'admin');
  await page.getByLabel('Búsqueda global').fill('Agencia Luba');
  await page.getByRole('link', { name: /Agencia Luba/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Agencia Luba' })).toBeVisible();
});
