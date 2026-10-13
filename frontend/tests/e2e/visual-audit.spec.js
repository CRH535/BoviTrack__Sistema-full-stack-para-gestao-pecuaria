import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { prepararReferenciaVisual } from "./visual-fixtures";
const require = createRequire(import.meta.url);
const { Pool } = require("../../../backend/node_modules/pg");
const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
test.afterAll(async () => {
  await db.end();
});

test("auditoria visual de todas as telas", async ({ page }, info) => {
  test.setTimeout(180000);
  const diretorio = path.resolve(
    process.cwd(),
    "../outputs/ui-audit/after",
    info.project.name,
  );
  mkdirSync(diretorio, { recursive: true });
  async function capturar(nome) {
    const arquivo = path.join(diretorio, nome);
    await page.screenshot({ path: arquivo, fullPage: true });
    await info.attach(nome, { path: arquivo, contentType: "image/png" });
  }
  await db.query("DELETE FROM limites_requisicao");
  const animalReferencia = await prepararReferenciaVisual(db);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(/127\.0\.0\.1:3005\/.*clima/, (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
  );
  await page.goto("/login");
  await capturar("login.png");
  await page.goto("/cadastro");
  await capturar("cadastro.png");
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("admin@example.test");
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
  const routes = [
    "/",
    "/animais",
    `/animais/${animalReferencia}`,
    "/propriedades",
    "/lotes",
    "/pesagens",
    "/desmamas",
    "/vacinas",
    "/vacinacoes",
    "/producao",
    "/despesas",
    "/lucros",
    "/configuracoes",
    "/usuarios",
    "/minha-conta",
  ];
  for (const theme of ["light", "dark"]) {
    await page.goto("/configuracoes");
    await page
      .getByRole("radio", { name: theme === "light" ? /^Claro/ : /^Escuro/ })
      .focus();
    await page.keyboard.press("Space");
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("main h1")).toBeVisible();
      await expect(page.getByText(/^Carregando/)).toHaveCount(0, {
        timeout: 10000,
      });
      if (route === "/lucros") {
        await page.getByLabel("Período", { exact: true }).selectOption("todos");
        await page.getByRole("button", { name: "Aplicar filtros" }).click();
        await expect(page.getByText(/^Carregando/)).toHaveCount(0);
      }
      const nomeRota =
        route === "/" ? "dashboard" : route.slice(1).replaceAll("/", "-");
      await capturar(`${theme}-${nomeRota}.png`);
      const size = await page.evaluate(() => ({
        viewport: innerWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(size.content, `${theme} ${route}`).toBeLessThanOrEqual(
        size.viewport + 1,
      );
    }
  }
  const menu = page.getByRole("button", { name: "Abrir menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Acesse sua conta" }),
  ).toBeVisible();
  await expect(page.locator("html")).not.toHaveClass(
    /black-hole-transition-active/,
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await capturar("login-dark.png");
  await page.goto("/cadastro");
  await expect(
    page.getByRole("heading", { name: "Crie sua conta" }),
  ).toBeVisible();
  await capturar("cadastro-dark.png");
  expect(errors).toEqual([]);
});
