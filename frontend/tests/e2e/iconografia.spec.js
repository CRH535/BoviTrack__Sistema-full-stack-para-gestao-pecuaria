import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prepararReferenciaVisual } from "./visual-fixtures";

const require = createRequire(import.meta.url);
const { Pool } = require("../../../backend/node_modules/pg");
const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
test.afterAll(() => db.end());

test("iconografia: todas as telas, temas e ações", async ({ page }, info) => {
  test.setTimeout(240000);
  const baseline = process.env.BOVITRACK_ICON_BASELINE === "true";
  const dir = path.resolve(
    "../outputs/iconografia",
    baseline ? "before" : process.env.BOVITRACK_ICON_PRODUCTION === "true" ? "production" : "after",
    info.project.name,
  );
  mkdirSync(dir, { recursive: true });
  await db.query("DELETE FROM limites_requisicao");
  const animal = await prepararReferenciaVisual(db);
  const errors = [];
  const iconErrors = [];
  const assetErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    // 401 de refresh sem sessão é esperado antes do login/depois do logout.
    // Clima é a única falha injetada; outros erros de recursos continuam falhando.
    const expectedSessionCheck = /Failed to load resource.*401/.test(message.text()) && /\/auth\/(refresh|me)(?:\?|$)/.test(message.location().url);
    const expectedWeather = /Failed to load resource.*503/.test(message.text()) && /\/clima(?:\/|\?|$)/.test(message.location().url);
    if (message.type() === "error" && !expectedWeather && !expectedSessionCheck)
      consoleErrors.push(message.text());
    if (/<path>|<svg>|attribute d|Ícone não cadastrado/.test(message.text()))
      iconErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (
      response.status() >= 400 &&
      /\.(svg|png|jpg|webp)(\?|$)/.test(response.url())
    )
      assetErrors.push(response.url());
  });
  await page.route(/127\.0\.0\.1:3005\/.*clima/, (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
  );
  const findings = [];
  async function audit(route, theme) {
    const result = await page.evaluate(() => {
      const visible = (el) =>
        el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
      const icons = [
        ...document.querySelectorAll(
          "svg.app-image-icon, .password-toggle svg, .nav-link svg",
        ),
      ].filter(visible);
      const hiddenIcons = [...document.querySelectorAll("svg.app-image-icon")]
        .filter((el) => visible(el.parentElement) && !visible(el))
        .map((el) => el.dataset.icon);
      const broken = icons.flatMap((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const shape = el.getBBox();
        const issues = [];
        if (!rect.width || !rect.height || rect.width > 70 || rect.height > 70)
          issues.push("dimensões");
        if (style.opacity === "0" || style.stroke === "transparent")
          issues.push("invisível");
        if (el.dataset.iconFallback) issues.push("nome desconhecido");
        if (!shape.width && !shape.height) issues.push("sem geometria");
        if (
          shape.x < 0 ||
          shape.y < 0 ||
          shape.x + shape.width > 24 ||
          shape.y + shape.height > 24
        )
          issues.push("fora do viewBox");
        if (el.getAttribute("aria-hidden") !== "true")
          issues.push("decorativo sem aria-hidden");
        return issues.length
          ? [
              {
                name: el.dataset.icon || el.parentElement.textContent.trim(),
                issues,
                width: rect.width,
                height: rect.height,
              },
            ]
          : [];
      });
      const images = [...document.images].filter(visible);
      const brokenImages = images.filter((el) => !el.complete || !el.naturalWidth).map((el) => el.src);
      const clipped = icons.flatMap((el) => {
        const rect = el.getBoundingClientRect();
        // Controles com ícone devem conter o SVG inteiro, inclusive em 320px.
        const control = el.closest("button, a.button-link");
        for (let parent = el.parentElement; parent; parent = parent.parentElement) {
          const bounds = parent.getBoundingClientRect(), style = getComputedStyle(parent);
          const x = parent === control || ["hidden", "clip"].includes(style.overflowX);
          const y = parent === control || ["hidden", "clip"].includes(style.overflowY);
          if ((x && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1)) ||
              (y && (rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1)))
            return [{ name: el.dataset.icon, control: parent.className || parent.getAttribute("aria-label") }];
          // Dialog modal é promovido à top layer; ancestrais DOM não o recortam.
          if (parent.matches("dialog[open]") || style.position === "fixed") break;
        }
        return [];
      });
      const rgb = (value) => (value.match(/[\d.]+/g) || []).map(Number);
      const luminance = (color) =>
        color
          .slice(0, 3)
          .map((v) => {
            const channel = v / 255;
            return channel <= 0.04045
              ? channel / 12.92
              : ((channel + 0.055) / 1.055) ** 2.4;
          })
          .reduce(
            (sum, value, index) =>
              sum + value * [0.2126, 0.7152, 0.0722][index],
            0,
          );
      const lowContrast = [];
      for (const el of icons) {
        if (el.closest(":disabled")) continue;
        const colors = [];
        for (
          let parent = el.parentElement;
          parent;
          parent = parent.parentElement
        )
          colors.push(rgb(getComputedStyle(parent).backgroundColor));
        let background = [255, 255, 255];
        for (const color of colors.reverse()) {
          const alpha = color[3] ?? 1;
          background = background.map(
            (v, i) => (color[i] || 0) * alpha + v * (1 - alpha),
          );
        }
        const foreground = rgb(getComputedStyle(el).color);
        const l1 = luminance(foreground),
          l2 = luminance(background);
        const contrast = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        if (contrast < 3) lowContrast.push({ name: el.dataset.icon, contrast });
      }
      const withoutIcons = [
        ...document.querySelectorAll("button, a.button-link"),
      ]
        .filter(visible)
        .filter((el) => !el.querySelector("svg"))
        .map((el) => (el.getAttribute("aria-label") || el.textContent).trim());
      const unnamed = [...document.querySelectorAll("button")]
        .filter(visible)
        .filter(
          (el) =>
            !el.textContent.trim() &&
            !el.getAttribute("aria-label") &&
            !el.getAttribute("aria-labelledby"),
        ).length;
      return {
        icons: icons.length,
        hiddenIcons,
        broken,
        brokenImages,
        clipped,
        lowContrast,
        withoutIcons,
        unnamed,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        overflowingElements: [...document.querySelectorAll("main *")].filter(visible).flatMap((el) => {
          const rect = el.getBoundingClientRect();
          return rect.right > innerWidth + 1 && !el.closest("svg")
            ? [{ tag: el.tagName, class: el.className, text: el.textContent.trim().slice(0, 80), left: rect.left, right: rect.right }] : [];
        }).slice(0, 20),
      };
    });
    findings.push({ route, theme, ...result });
    writeFileSync(path.join(dir, "inventory.json"), JSON.stringify(findings, null, 2));
    if (!baseline) {
      expect(result.broken, `${theme} ${route}`).toEqual([]);
      expect(result.hiddenIcons, `${theme} ${route}`).toEqual([]);
      expect(result.brokenImages, `${theme} ${route}`).toEqual([]);
      expect(result.clipped, `${theme} ${route}`).toEqual([]);
      expect(result.lowContrast, `${theme} ${route}`).toEqual([]);
      expect(result.withoutIcons, `${theme} ${route}`).toEqual([]);
      expect(result.unnamed, `${theme} ${route}`).toBe(0);
      expect(result.overflow, `${theme} ${route}: ${JSON.stringify(result.overflowingElements)}`).toBe(false);
    }
    const name = `${theme}-${route.replaceAll(/[^a-z0-9]/gi, "-") || "dashboard"}.png`;
    await page.screenshot({ path: path.join(dir, name), fullPage: true });
  }
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "Entrar", exact: true }),
  ).toBeVisible();
  await audit("login", "light");
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
  ) {
    await audit("tutorial-welcome", "light");
    await skip.click();
  }
  for (const theme of ["light", "dark"]) {
    await page.goto("/configuracoes");
    await page
      .getByRole("radio", { name: theme === "light" ? /^Claro/ : /^Escuro/ })
      .focus();
    await page.keyboard.press("Space");
    for (const route of [
      "/",
      "/animais",
      `/animais/${animal}`,
      `/animais/${animal}?aba=pesagens`,
      `/animais/${animal}?aba=vacinacao`,
      `/animais/${animal}?aba=desmama`,
      `/animais/${animal}?aba=producao`,
      `/animais/${animal}?aba=historico`,
      "/propriedades",
      "/lotes",
      "/vacinas",
      "/vacinacoes",
      "/pesagens",
      "/desmamas",
      "/producao",
      "/despesas",
      "/lucros",
      "/configuracoes",
      "/usuarios",
      "/minha-conta",
    ]) {
      await page.goto(route);
      await expect(page.locator("main h1")).toBeVisible();
      await expect(page.getByText(/^Carregando/)).toHaveCount(0, {
        timeout: 15000,
      });
      await audit(route, theme);
      if (route.endsWith("?aba=pesagens") || route.endsWith("?aba=desmama")) {
        const name = route.endsWith("?aba=pesagens") ? "Nova pesagem" : "Planejar desmama";
        await page.getByRole("button", { name, exact: true }).click();
        await audit(`${route}-form`, theme);
        await page.getByRole("button", { name: "Cancelar", exact: true }).click();
      }
      if (route.endsWith("?aba=producao")) {
        await page.getByRole("button", { name: "Registrar produção", exact: true }).click();
        await audit(`${route}-form`, theme);
        await page.getByRole("button", { name: "Cancelar", exact: true }).click();
      }
      if (route === "/lotes") {
        const manager = page.getByRole("button", { name: "Gerenciar animais", exact: true }).first();
        await manager.click();
        await expect(page.getByText("Carregando animais...", { exact: true })).toHaveCount(0);
        await audit("/lotes-animais", theme);
        await page.getByRole("button", { name: "Fechar animais", exact: true }).click();
      }
      if (route === "/configuracoes") {
        await page.getByRole("button", { name: "Refazer tutorial", exact: true }).click();
        await expect(page.locator(".tutorial-tooltip")).toBeVisible();
        await audit("tutorial-overlay", theme);
        await page.getByRole("button", { name: "Sair do tutorial", exact: true }).click();
        await expect(page.getByRole("dialog", { name: "Deseja sair do tutorial?" })).toBeVisible();
        await audit("tutorial-exit-modal", theme);
        await page.getByRole("button", { name: "Sair do tutorial", exact: true }).click();
      }
      const registration = page.locator("details.ui-registration");
      if (
        (await registration.count()) &&
        !(await registration.getAttribute("open"))
      ) {
        await registration.locator("summary").click();
        await audit(`${route}-form`, theme);
        await registration.locator("summary").click();
      }
      if (route === "/animais") {
        const edit = page
          .locator(".animal-card")
          .first()
          .getByRole("button", { name: "Editar", exact: true });
        await edit.click();
        await audit("/animais-edit", theme);
        await page
          .getByRole("button", { name: "Cancelar", exact: true })
          .click();
      }
      if (route === "/propriedades") {
        const remove = page
          .locator(".property-card")
          .first()
          .getByRole("button", { name: "Excluir", exact: true });
        await remove.click();
        const dialog = page.getByRole("dialog", { name: /^Excluir/ });
        await expect(dialog).toBeVisible();
        await expect(
          page.getByText("Carregando informações da exclusão..."),
        ).toHaveCount(0);
        await audit("/propriedades-delete-modal", theme);
        await page.keyboard.press("Escape");
        await expect(remove).toBeFocused();
      }
    }
  }
  const menu = page.getByRole("button", { name: "Abrir menu", exact: true });
  if (await menu.isVisible()) {
    await menu.click();
    await audit("drawer", "dark");
  }
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Acesse sua conta" }),
  ).toBeVisible();
  await expect(page.locator("html")).not.toHaveClass(
    /black-hole-transition-active/,
  );
  for (const theme of ["dark", "light"]) {
    await page.evaluate((value) => {
      const prefs = JSON.parse(
        localStorage.getItem("bovitrack_preferences") || "{}",
      );
      localStorage.setItem(
        "bovitrack_preferences",
        JSON.stringify({ ...prefs, theme: value }),
      );
    }, theme);
    await page.goto("/login");
    await expect(
      page.getByRole("button", { name: "Entrar", exact: true }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await audit("login", theme);
    await page
      .getByRole("button", { name: "Mostrar senha", exact: true })
      .click();
    await expect(page.getByLabel("Senha", { exact: true })).toHaveAttribute(
      "type",
      "text",
    );
    await audit("login-eye-off", theme);
    await page.goto("/cadastro");
    await expect(
      page.getByRole("button", { name: "Criar conta", exact: true }),
    ).toBeVisible();
    await audit("cadastro", theme);
  }
  writeFileSync(
    path.join(dir, "inventory.json"),
    JSON.stringify(findings, null, 2),
  );
  expect(errors).toEqual([]);
  expect(iconErrors).toEqual([]);
  expect(assetErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
