import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { parse } from "@babel/parser";

test("registro completo tem geometria válida e nomes desconhecidos nunca somem", async ({ page }) => {
  const source = parse(readFileSync(new URL("../../src/components/Icone.jsx", import.meta.url), "utf8"), { sourceType: "module", plugins: ["jsx"] });
  const objects = source.program.body.flatMap((node) => node.declarations || [])
    .filter((node) => ["caminhos", "aliases"].includes(node.id.name));
  const names = [...objects.flatMap((node) => node.init.properties.map((prop) => prop.key.name || prop.key.value)), "configuracoes"];
  const unknown = ["nao-cadastrado", "toString", "__proto__"];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`/tests/fixtures/icons.html?registry=${encodeURIComponent(JSON.stringify([...names, ...unknown]))}`);
  const gallery = page.getByRole("region", { name: "Registro de ícones" });
  for (const theme of ["light", "dark"]) {
    await page.locator("html").evaluate((el, value) => { el.dataset.theme = value; }, theme);
    const results = await gallery.locator("svg").evaluateAll((icons) => icons.map((icon) => {
      const box = icon.getBBox(), rect = icon.getBoundingClientRect();
      return { name: icon.dataset.icon, fallback: icon.dataset.iconFallback === "true",
        visible: icon.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }),
        width: rect.width, height: rect.height,
        geometry: (box.width > 0 || box.height > 0) && box.x >= 0 && box.y >= 0 && box.x + box.width <= 24 && box.y + box.height <= 24,
        color: getComputedStyle(icon).color, stroke: getComputedStyle(icon).stroke };
    }));
    expect(results).toHaveLength(names.length + unknown.length);
    for (const result of results) {
      expect(result.visible, result.name).toBe(true);
      expect(result.geometry, result.name).toBe(true);
      expect(result.width, result.name).toBe(20);
      expect(result.height, result.name).toBe(20);
      expect(result.stroke, result.name).toBe(result.color);
      expect(result.fallback, result.name).toBe(unknown.includes(result.name));
    }
  }
  expect(errors).toEqual([]);
});

test("botões preservam ícones, children, submit e estados", async ({
  page,
}) => {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/tests/fixtures/icons.html");
  const add = page.getByRole("button", { name: "Adicionar", exact: true });
  await expect(add.locator('[data-icon="mais"]')).toBeVisible();
  await add.click();
  await expect(page.getByLabel("Cliques")).toHaveText("1");
  const edit = page.getByRole("button", { name: "Editar registro" });
  await expect(edit.locator("svg")).toHaveCount(2);
  const search = page.getByRole("button", { name: "Buscar registro" });
  await expect(search.locator('[data-icon="busca"]')).toBeVisible();
  await expect(search.locator('[data-icon="seta"]')).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Prioridade explícita" }).locator("svg"),
  ).toHaveAttribute("data-icon", "salvar");
  const close = page.getByRole("button", { name: "Fechar exemplo" });
  await expect(close).toHaveAttribute("title", "Fechar exemplo");
  const disabled = page.getByRole("button", { name: "Excluir indisponível" });
  await expect(disabled).toBeDisabled();
  await expect(disabled.locator("svg")).toBeVisible();
  await page.getByRole("button", { name: "Salvar formulário" }).click();
  await expect(page.getByLabel("Enviado")).toHaveText("true");
  const save = page.getByRole("button", { name: "Salvar em andamento" });
  await save.click();
  await expect(save).toHaveAttribute("aria-busy", "true");
  await expect(save).toBeDisabled();
  await expect(save.locator('[data-icon="carregando"]')).toBeVisible();
  await expect(save.locator('[data-icon="salvar"]')).toHaveCount(0);
  for (const theme of ["light", "dark"]) {
    await page.locator("html").evaluate((el, value) => {
      el.dataset.theme = value;
    }, theme);
    await edit.hover();
    await edit.focus();
    await expect(edit).toBeFocused();
    await page.mouse.down();
    await expect(edit.locator('[data-icon="editar"]')).toBeVisible();
    await page.mouse.up();
    await expect(
      page.getByRole("button", { name: "Excluir exemplo", exact: true }),
    ).toHaveCSS(
      "color",
      await disabled.evaluate((el) => getComputedStyle(el).color),
    );
    const icons = await page.locator("main svg").evaluateAll((elements) =>
      elements.map((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          width: rect.width,
          height: rect.height,
          color: style.color,
          stroke: style.stroke,
          aria: el.getAttribute("aria-hidden"),
        };
      }),
    );
    for (const icon of icons) {
      expect(icon.width).toBe(18);
      expect(icon.height).toBe(18);
      expect(icon.stroke).toBe(icon.color);
      expect(icon.aria).toBe("true");
    }
  }
  expect(errors).toEqual([]);
});
