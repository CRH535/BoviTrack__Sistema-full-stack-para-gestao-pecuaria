import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Pool } = require("../../../backend/node_modules/pg");
const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
test.afterAll(async () => {
  await db.end();
});
test.beforeEach(async ({ page }) => {
  await db.query("DELETE FROM limites_requisicao");
  await page.route(/127\.0\.0\.1:3005\/.*clima/, (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
  );
});
async function login(page) {
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill("e2e-owner@example.test");
  await page
    .getByLabel("Senha", { exact: true })
    .fill(process.env.TEST_ADMIN_SENHA);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Visão geral do rebanho" }),
  ).toBeVisible();
  await expect(page.locator("html")).not.toHaveClass(
    /black-hole-transition-active/,
  );
  const skip = page.getByRole("button", { name: /Agora não/ });
  if (
    await skip
      .waitFor({ state: "visible", timeout: 1500 })
      .then(() => true)
      .catch(() => false)
  )
    await skip.click();
}

test("vacina e vacinação mantêm cadastro, edição, exclusão e histórico na ficha", async ({
  page,
}) => {
  await login(page);
  const nome = `Vacina UI ${Date.now()}`;
  await page.goto("/vacinas?novo=1");
  await page.getByLabel("Nome", { exact: true }).fill(nome);
  await page
    .getByLabel("Descrição", { exact: true })
    .fill("Registro do banco isolado");
  await page
    .locator("form.data-form")
    .getByRole("button", { name: "Cadastrar", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: nome, exact: true }),
  ).toBeVisible();
  await page.goto("/vacinacoes?novo=1&animal=1");
  await expect(page.getByLabel("Animal", { exact: true })).toHaveValue("1");
  await page
    .getByLabel("Vacina", { exact: true })
    .selectOption({ label: nome });
  await page.getByLabel("Data de aplicação").fill("2026-10-01");
  await page.getByLabel("Próxima dose").fill("2026-11-01");
  await page
    .locator("form.data-form")
    .getByRole("button", { name: /Cadastrar|Registrar/ })
    .click();
  await page.getByLabel("Pesquisar registros").fill(nome);
  const registro = page.locator(".vaccination-card").filter({ hasText: nome });
  await expect(registro).toBeVisible();
  await registro.getByRole("button", { name: "Editar" }).click();
  await page.getByLabel("Próxima dose").fill("2026-11-05");
  await page
    .locator("form.data-form")
    .getByRole("button", { name: "Salvar alterações" })
    .click();
  await expect(registro).toContainText("05/11/2026");
  await page.goto("/animais/1?aba=vacinacao");
  await expect(
    page.getByRole("table", { name: "Vacinações do animal" }),
  ).toContainText(nome);
  await page.goto("/vacinacoes");
  await page.getByLabel("Pesquisar registros").fill(nome);
  page.once("dialog", (dialog) => dialog.accept());
  await registro.getByRole("button", { name: "Excluir" }).click();
  await expect(registro).toHaveCount(0);
  await page.goto("/vacinas");
  await page.getByLabel("Pesquisar registros").fill(nome);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .locator(".record-card")
    .filter({ hasText: nome })
    .getByRole("button", { name: "Excluir" })
    .click();
  await expect(
    page.getByRole("heading", { name: nome, exact: true }),
  ).toHaveCount(0);
});

test.describe("animação original", () => {
  test.use({ reducedMotion: "no-preference" });
  test("login e logout preservam transição black-hole completa", async ({
    page,
  }, info) => {
    await page.goto("/login");
    await page
      .getByLabel("Email", { exact: true })
      .fill("e2e-owner@example.test");
    await page
      .getByLabel("Senha", { exact: true })
      .fill(process.env.TEST_ADMIN_SENHA);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.locator("html")).toHaveClass(
      /black-hole-transition-active/,
    );
    await page.screenshot({ path: info.outputPath("login-transition.png") });
    await expect(page.locator("html")).not.toHaveClass(
      /black-hole-transition-active/,
      { timeout: 15000 },
    );
    await expect(
      page.getByRole("heading", { name: "Visão geral do rebanho" }),
    ).toBeVisible();
    const skip = page.getByRole("button", { name: /Agora não/ });
    if (
      await skip
        .waitFor({ state: "visible", timeout: 1500 })
        .then(() => true)
        .catch(() => false)
    )
      await skip.click();
    const menu = page.getByRole("button", { name: "Abrir menu", exact: true });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await expect(page.locator("html")).toHaveClass(
      /black-hole-transition-active/,
    );
    await expect(page.locator("html")).not.toHaveClass(
      /black-hole-transition-active/,
      { timeout: 15000 },
    );
    await expect(
      page.getByRole("heading", { name: "Acesse sua conta" }),
    ).toBeVisible();
  });
});

test("falha na lista usa alerta de erro e a nova tentativa limpa o feedback", async ({
  page,
}) => {
  await login(page);
  const rota = /\/animais\?/;
  await page.route(rota, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: '{"mensagem":"Falha simulada da lista"}',
    }),
  );
  await page.goto("/animais");
  await expect(page.getByRole("alert")).toHaveClass(/notice-error/);
  await expect(
    page.getByRole("table", { name: "Lista de animais" }),
  ).toHaveCount(0);
  await page.unroute(rota);
  await page
    .getByRole("button", { name: "Tentar novamente", exact: true })
    .click();
  await expect(
    page.getByRole("table", { name: "Lista de animais" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("gráfico usa escala temporal real e mostra valores por foco", async ({
  page,
}) => {
  const registros = await db.query(
    "INSERT INTO producoes_leiteiras(animal_id,data,turno,quantidade_litros) VALUES (1,(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - 14,'manha',5),(1,(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - 13,'manha',12),(1,(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - 5,'manha',14) RETURNING id",
  );
  try {
    await login(page);
    await page.goto("/animais/1?aba=producao");
    const pontos = page.locator(".milk-chart-point");
    await expect(pontos).toHaveCount(3);
    const x = await pontos.evaluateAll((elements) =>
      elements.map((element) => Number(element.getAttribute("cx"))),
    );
    expect((x[1] - x[0]) / (x[2] - x[0])).toBeCloseTo(1 / 9, 4);
    await pontos.nth(1).focus();
    await expect(page.locator(".chart-tooltip")).toContainText("12,0 L");
  } finally {
    await db.query(
      "DELETE FROM producoes_leiteiras WHERE id = ANY($1::int[])",
      [registros.rows.map((r) => r.id)],
    );
  }
});
