import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prepararReferenciaVisual } from "./visual-fixtures";

const require = createRequire(import.meta.url);
const { Pool } = require("../../../backend/node_modules/pg");
const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
test.afterAll(() => db.end());

const items = [
  ["Dashboard", "/", "inicio"],
  ["Animais", "/animais", "animais"],
  ["Propriedades", "/propriedades", "propriedades"],
  ["Lotes", "/lotes", "lotes"],
  ["Pesagens", "/pesagens", "pesagem"],
  ["Desmamas", "/desmamas", "desmama"],
  ["Vacinas", "/vacinas", "vacinas"],
  ["Vacinações", "/vacinacoes", "vacinacoes"],
  ["Produção", "/producao", "producao"],
  ["Despesas", "/despesas", "despesas"],
  ["Lucros", "/lucros", "lucros"],
  ["Configurações", "/configuracoes", "configuracoes"],
];

test("mini ilustrações mantêm menu, atalhos, temas, estados e permissões de navegação", async ({ page }, info) => {
  await db.query("DELETE FROM limites_requisicao");
  await prepararReferenciaVisual(db);
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => {
    const expectedRefresh = /Failed to load resource.*401/.test(message.text()) && /\/auth\/refresh(?:\?|$)/.test(message.location().url);
    const expectedWeather = /Failed to load resource.*503/.test(message.text()) && /\/clima(?:\/|\?|$)/.test(message.location().url);
    if ((message.type() === "error" && !expectedRefresh && !expectedWeather) || /não cadastrado/.test(message.text())) failures.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && /\.(?:webp|svg|png|jpg)(?:\?|$)/.test(response.url())) failures.push(`${response.status()} ${response.url()}`);
  });
  await page.route(/127\.0\.0\.1:3005\/.*clima/, (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
  const dir = path.resolve("../outputs/navigation-images", process.env.BOVITRACK_NAV_PRODUCTION === "true" ? "production" : "development", info.project.name);
  mkdirSync(dir, { recursive: true });
  const inventories = [];

  async function audit(label) {
    await expect.poll(() => page.locator(".module-illustration img").evaluateAll((images) => images.every((img) => img.complete && img.naturalWidth > 0))).toBe(true);
    const result = await page.evaluate(() => {
      const visible = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
      const images = [...document.querySelectorAll(".module-illustration")].filter(visible);
      const broken = images.flatMap((el) => {
        const rect = el.getBoundingClientRect(), parent = el.closest("a, .ui-kpi-icon, .ui-action-icon"), bounds = parent.getBoundingClientRect();
        const problems = [];
        if (rect.width < 27 || rect.width > 41 || rect.width !== rect.height) problems.push("tamanho");
        if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1) problems.push("corte");
        if (getComputedStyle(el).opacity === "0") problems.push("opacidade");
        if (el.getAttribute("aria-hidden") !== "true") problems.push("decorativo");
        for (const img of el.querySelectorAll("img")) {
          if (!img.complete || !img.naturalWidth || img.getAttribute("alt") !== "") problems.push("imagem");
          const b = img.getBoundingClientRect();
          if (b.left < rect.left - 1 || b.right > rect.right + 1 || b.top < rect.top - 1 || b.bottom > rect.bottom + 1) problems.push("imagem cortada");
        }
        if (el.closest(".nav-link")) {
          const text = el.nextElementSibling.getBoundingClientRect();
          if (text.left < rect.right + 7 || text.right > bounds.right) problems.push("texto sobreposto");
          if (Math.abs(bounds.height - 42) > 1) problems.push("altura da linha");
        }
        return problems.length ? [{ module: el.dataset.moduleImage, problems }] : [];
      });
      return { count: images.length, broken, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    inventories.push({ label, ...result });
    expect(result.broken, label).toEqual([]);
    expect(result.overflow, label).toBe(false);
    await page.screenshot({ path: path.join(dir, `${label}.png`), fullPage: label.endsWith("-dashboard") });
  }

  async function openMenu() {
    const open = page.getByRole("button", { name: "Abrir menu", exact: true });
    if (await open.isVisible()) {
      await open.click();
      return page.locator(".drawer");
    }
    return page.locator(".sidebar");
  }
  async function closeMenu() {
    const close = page.getByRole("button", { name: "Fechar menu", exact: true });
    if (await close.isVisible()) await close.click();
  }

  for (const [role, email] of [["admin", "admin@example.test"], ["produtor", "e2e-owner@example.test"]]) {
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(process.env.TEST_ADMIN_SENHA);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Visão geral do rebanho" })).toBeVisible();
    await expect(page.locator("html")).not.toHaveClass(/black-hole-transition-active/);
    const skip = page.getByRole("button", { name: /Agora não/ });
    if (await skip.isVisible()) await skip.click();
    for (const theme of ["light", "dark"]) {
      await page.goto("/configuracoes");
      await page.getByRole("radio", { name: theme === "light" ? /^Claro/ : /^Escuro/ }).focus();
      await page.keyboard.press("Space");
      await page.goto("/");
      await expect(page.getByText(/^Carregando/)).toHaveCount(0);
      await expect(page.locator(".dashboard-kpis .module-illustration")).toHaveCount(5);
      await expect(page.locator(".quick-actions .module-illustration")).toHaveCount(4);
      await audit(`${role}-${theme}-dashboard`);
      let menu = await openMenu();
      const allowed = [...items, role === "admin" ? ["Usuários", "/usuarios", "usuarios"] : ["Minha Conta", "/minha-conta", "usuarios"]];
      await expect(menu.locator(".nav-link")).toHaveCount(13);
      for (const [name, href, asset] of allowed) {
        const link = menu.getByRole("link", { name, exact: true });
        await expect(link).toHaveAttribute("href", href);
        await expect(link.locator(".module-illustration")).toHaveAttribute("data-module-image", asset);
        await link.hover();
        await link.focus();
        await expect(link).toBeFocused();
        await expect(link.locator("img").first()).toBeVisible();
      }
      await menu.getByRole("link", { name: "Dashboard", exact: true }).hover();
      await audit(`${role}-${theme}-menu`);
      await closeMenu();
      for (const name of ["Animais", "Produção", "Configurações", role === "admin" ? "Usuários" : "Minha Conta"]) {
        menu = await openMenu();
        await menu.getByRole("link", { name, exact: true }).click();
        await expect(page.locator("main h1")).toBeVisible();
        menu = await openMenu();
        const active = menu.getByRole("link", { name, exact: true });
        await expect(active).toHaveAttribute("aria-current", "page");
        await audit(`${role}-${theme}-active-${name.replaceAll(/[^a-z]/gi, "")}`);
        await closeMenu();
      }
    }
    const menu = await openMenu();
    await menu.getByRole("button", { name: "Sair", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Acesse sua conta" })).toBeVisible();
    await expect(page.locator("html")).not.toHaveClass(/black-hole-transition-active/);
  }
  writeFileSync(path.join(dir, "inventory.json"), JSON.stringify(inventories, null, 2));
  expect(failures).toEqual([]);
});
