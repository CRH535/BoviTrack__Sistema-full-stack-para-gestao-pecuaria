import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { prepararCodigoEmail } from './email-fixtures';
const require = createRequire(import.meta.url);
const { Pool } = require('../../../backend/node_modules/pg');
const bcrypt = require('../../../backend/node_modules/bcryptjs');
const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
test.afterAll(async () => { await db.end(); });
test.beforeEach(async () => { await db.query('DELETE FROM limites_requisicao'); });

test('conta antiga: bloqueio, código, dark/light, responsividade e login após verificar', async ({ page, context }, testInfo) => {
  const email = `legacy-${testInfo.project.name}-${Date.now()}@example.test`;
  await db.query("INSERT INTO usuarios(nome,email,senha,perfil) VALUES ('Conta antiga',$1,$2,'usuario')", [email, await bcrypt.hash(process.env.TEST_ADMIN_SENHA, 4)]);
  await page.goto('/login');
  await page.getByLabel('Email', { exact:true }).fill(email);
  await page.getByLabel('Senha', { exact:true }).fill(process.env.TEST_ADMIN_SENHA);
  await page.getByRole('button', { name:'Entrar', exact:true }).click();
  await expect(page.getByRole('heading', { name:'Verifique seu e-mail', exact:true })).toBeVisible();
  expect(page.url()).not.toContain(email);
  await expect(page.getByText(/l\*\*\*@example.test/)).toBeVisible();
  const cookies = await context.cookies();
  expect(cookies.some((c)=>c.name==='bovitrack_refresh' && c.value)).toBe(false);
  await expect(page.getByRole('button', {name:/Reenviar código em/})).toBeDisabled();
  for (const theme of ['light','dark']) {
    await page.emulateMedia({ colorScheme:theme });
    await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({ path:`../outputs/email-verification/${testInfo.project.name}-${theme}.png`,fullPage:true });
  }
  const code = await prepararCodigoEmail(db,email);
  await page.getByLabel('Código de 6 dígitos').fill(code==='000000'?'111111':'000000');
  await page.getByRole('button',{name:'Verificar e-mail',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Código inválido');
  await page.getByLabel('Código de 6 dígitos').fill(code);
  await page.getByRole('button',{name:'Verificar e-mail',exact:true}).click();
  await expect(page.getByRole('heading',{name:'E-mail verificado',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Ir para o login',exact:true}).click();
  await page.getByLabel('Email', { exact:true }).fill(email);
  await page.getByLabel('Senha', { exact:true }).fill(process.env.TEST_ADMIN_SENHA);
  await page.getByRole('button', { name:'Entrar', exact:true }).click();
  await expect(page.getByRole('heading',{name:'Visão geral do rebanho'})).toBeVisible();
});

test('URL manual e F5 não concedem acesso; contexto fica fora do storage', async ({ page }) => {
  await page.goto('/verificar-email');
  await expect(page.getByRole('heading',{name:'Acesse sua conta'})).toBeVisible();
  const email=`reload-${Date.now()}@example.test`;
  await page.goto('/cadastro');
  await page.getByLabel('Nome',{exact:true}).fill('Conta para reload');
  await page.getByLabel('Email',{exact:true}).fill(email);
  await page.getByLabel('Senha',{exact:true}).fill(process.env.TEST_ADMIN_SENHA);
  await page.getByLabel('Confirmar senha',{exact:true}).fill(process.env.TEST_ADMIN_SENHA);
  await page.getByRole('button',{name:'Criar conta',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Verifique seu e-mail',exact:true})).toBeVisible();
  const storage = await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}));
  expect(storage).not.toContain(email);
  expect(storage).not.toContain('email_hash');
  await page.goto('/animais');
  await expect(page.getByRole('heading',{name:'Acesse sua conta'})).toBeVisible();
});
