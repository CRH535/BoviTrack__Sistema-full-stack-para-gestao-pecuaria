import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Pool } = require("../../../backend/node_modules/pg");
const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
const password = process.env.TEST_ADMIN_SENHA;

test.afterAll(async () => { await db.end(); });
test.beforeEach(async ({ page }) => {
  // Permitido somente pelo guard do config + banco descartável do runner.
  await db.query("DELETE FROM limites_requisicao");
  // O clima externo é substituído por uma falha explícita; os dados de negócio
  // e autenticação usam o Express/PostgreSQL reais neste teste.
  await page.route(/http:\/\/127\.0\.0\.1:3005\/.*clima/, (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ mensagem: "Clima indisponível no ambiente de teste E2E" }) }));
});

async function dismissTutorial(page) {
  const welcome = page.getByRole("button", { name: /Agora não/ });
  if (await welcome.waitFor({ state: "visible", timeout: 1500 }).then(() => true).catch(() => false)) await welcome.click();
}

async function login(page, email = "e2e-owner@example.test") {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Visão geral do rebanho" })).toBeVisible();
  await expect(page.locator("html")).not.toHaveClass(/black-hole-transition-active/);
  await dismissTutorial(page);
}

async function noOverflow(page) {
  const size = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
  expect(size.content).toBeLessThanOrEqual(size.width + 1);
}

test("cadastro, login, refresh/F5, cookie privado, logout e novo login", async ({ page, context }) => {
  const email = `e2e-${Date.now()}@example.test`;
  await page.goto("/cadastro");
  await page.getByLabel("Nome", { exact: true }).fill("Produtor de teste");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByLabel("Confirmar senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Acesse sua conta" })).toBeVisible();
  await login(page, email);
  const cookies = await context.cookies();
  expect(cookies.find((cookie) => cookie.name === "bovitrack_refresh")?.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie.includes("bovitrack_refresh"))).toBe(false);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => /^(bovitrack|agrocontrol)_(token|usuario)$/.test(key)))).toEqual([]);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Visão geral do rebanho" })).toBeVisible();
  await dismissTutorial(page);
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Acesse sua conta" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Acesse sua conta" })).toBeVisible();
  await login(page, email);
});

test("navegação, modo escuro, ficha e ausência de overflow", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  await expect(page.locator(".stats-grid")).toContainText("250,00");
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("dashboard-light.png"), fullPage: true });
  const routes = [
    ["Propriedades", "Propriedades"], ["Animais", "Animais"], ["Lotes", "Lotes"],
    ["Pesagens", "Pesagens"], ["Desmamas", "Desmamas"], ["Vacinas", "Vacinas"],
    ["Vacinações", "Vacinações"], ["Despesas", "Despesas"], ["Lucros", "Lucros"],
    ["Configurações", "Configurações"],
  ];
  for (const [label, heading] of routes) {
    await page.getByRole("navigation", { name: "Menu principal" }).getByRole("link", { name: label, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading, exact: true, level: 1 })).toBeVisible();
    await noOverflow(page);
  }
  await page.getByRole("radio", { name: /Escuro/ }).focus();
  await page.getByRole("radio", { name: /Escuro/ }).press("Space");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("navigation").getByRole("link", { name: "Animais", exact: true }).click();
  await page.locator(".animal-card").filter({ hasText: "Mimosa E2E" }).getByRole("link", { name: "Ver ficha" }).click();
  await expect(page.getByRole("heading", { name: "Mimosa E2E", level: 1 })).toBeVisible();
  await expect(page.getByText("01/01/2024", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Pesagens/ })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("animal-dark.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("cadastro real de propriedade/animal, ficha, pesagem e modal por teclado", async ({ page }) => {
  await login(page);
  await page.getByRole("navigation").getByRole("link", { name: "Propriedades", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Propriedades", level: 1, exact: true })).toBeVisible();
  const name = `Fazenda ${Date.now()}`;
  await page.getByLabel("Nome", { exact: true }).fill(name);
  await page.getByLabel("Cidade", { exact: true }).fill("Uberaba");
  await page.getByLabel("Estado", { exact: true }).fill("MG");
  await page.getByLabel("Área (ha)", { exact: true }).fill("45.5");
  await page.locator("form").getByRole("button", { name: /Salvar|Cadastrar/ }).click();
  const card = page.locator(".property-card").filter({ hasText: name });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: /Excluir/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Esta entidade não possui registros relacionados.");
  await page.keyboard.press("Tab");
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(card.getByRole("button", { name: /Excluir/ })).toBeFocused();
  await page.getByRole("navigation").getByRole("link", { name: "Animais", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Animais", level: 1, exact: true })).toBeVisible();
  const animalName = `Novilha ${Date.now()}`;
  await page.getByLabel("Nome", { exact: true }).fill(animalName);
  await page.getByLabel("Número do brinco", { exact: true }).fill(`B-${Date.now()}`);
  await page.getByLabel("Data de nascimento", { exact: true }).fill("2025-01-01");
  await page.getByLabel("Espécie", { exact: true }).fill("Bovino");
  await page.getByLabel("Sexo", { exact: true }).selectOption("F");
  await page.getByLabel("Peso", { exact: true }).fill("250");
  await page.getByLabel("Propriedade", { exact: true }).selectOption({ label: name });
  await page.locator("form").getByRole("button", { name: /Salvar|Cadastrar/ }).click();
  await page.locator(".animal-card").filter({ hasText: animalName }).getByRole("link", { name: "Ver ficha" }).click();
  await expect(page.getByRole("heading", { name: animalName, level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Registrar primeira pesagem" }).click();
  await page.getByLabel("Data da pesagem").fill("2026-01-01");
  await page.getByLabel("Peso (kg)", { exact: true }).fill("300");
  await page.getByRole("button", { name: "Salvar pesagem" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Pesagem registrada com sucesso." })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: animalName, level: 1 })).toBeVisible();
  await expect(page.getByText("300,0 kg", { exact: true }).first()).toBeVisible();
  await noOverflow(page);
});

test("falha no dashboard mostra erro e recuperação, sem totais fictícios", async ({ page }) => {
  await page.route("**/dashboard", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"mensagem":"Falha simulada E2E"}' }));
  await login(page);
  await expect(page.getByRole("alert")).toContainText("carregar");
  await expect(page.locator(".stats-grid")).toHaveCount(0);
  await page.unroute("**/dashboard");
  await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(page.locator(".stats-grid")).toBeVisible();
});
