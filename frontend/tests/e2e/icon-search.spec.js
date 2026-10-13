import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Pool } = require("../../../backend/node_modules/pg");
const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
test.afterAll(() => db.end());

test("buscas de pesagens e desmamas mantêm lupa, texto e filtros", async ({ page }, info) => {
  await db.query("DELETE FROM limites_requisicao");
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("admin@example.test");
  await page.getByLabel("Senha", { exact: true }).fill(process.env.TEST_ADMIN_SENHA);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Visão geral do rebanho" })).toBeVisible();
  await expect(page.locator("html")).not.toHaveClass(/black-hole-transition-active/);
  const skip = page.getByRole("button", { name: /Agora não/ });
  await expect(skip).toBeVisible();
  await skip.click();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => {
      const prefs = JSON.parse(localStorage.getItem("bovitrack_preferences") || "{}");
      localStorage.setItem("bovitrack_preferences", JSON.stringify({ ...prefs, theme: value }));
    }, theme);
    for (const route of ["/pesagens", "/desmamas"]) {
      await page.goto(route);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.getByText(/^Carregando/)).toHaveCount(0);
      const input = page.getByLabel("Animal ou brinco", { exact: true });
      const icon = page.locator('.management-filters .ui-search-field [data-icon="busca"]');
      await expect(icon).toBeVisible();
      const geometry = await icon.evaluate((el) => {
        const input = el.parentElement.querySelector("input");
        const box = el.getBoundingClientRect(), field = input.getBoundingClientRect();
        const style = getComputedStyle(input), iconStyle = getComputedStyle(el);
        return { width: box.width, height: box.height,
          contained: box.left >= field.left && box.right <= field.right && box.top >= field.top && box.bottom <= field.bottom,
          separated: box.right <= field.left + parseFloat(style.paddingLeft),
          color: iconStyle.color, stroke: iconStyle.stroke,
          overflow: document.documentElement.scrollWidth > innerWidth + 1 };
      });
      expect(geometry.width).toBe(18);
      expect(geometry.height).toBe(18);
      expect(geometry.contained).toBe(true);
      expect(geometry.separated).toBe(true);
      expect(geometry.stroke).toBe(geometry.color);
      expect(geometry.overflow).toBe(false);
      await input.fill("Mimosa");
      await page.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
      await expect(page.getByText(/^Carregando/)).toHaveCount(0);
      await expect(input).toHaveValue("Mimosa");
      await expect(icon).toBeVisible();
      await page.screenshot({ path: info.outputPath(`${theme}-${route.slice(1)}.png`), fullPage: true });
    }
  }
  expect(errors).toEqual([]);
});
