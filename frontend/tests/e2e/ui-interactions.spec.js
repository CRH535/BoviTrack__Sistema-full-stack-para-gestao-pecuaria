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
async function semOverflow(page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}

test("drawer por teclado, filtros, ordenação, paginação e busca da topbar", async ({
  page,
}) => {
  const prop = await db.query(
    "SELECT p.id FROM propriedades p JOIN usuarios u ON u.id=p.usuario_id WHERE u.email='e2e-owner@example.test' AND p.nome='Fazenda E2E'",
  );
  await db.query(
    "INSERT INTO animais(nome,especie,sexo,propriedade_id,numero_brinco) SELECT 'Tabela E2E '||s,'Bovino','M',$1,'TABLE-'||s FROM generate_series(1,12) s WHERE NOT EXISTS (SELECT 1 FROM animais WHERE numero_brinco='TABLE-'||s AND propriedade_id=$1)",
    [prop.rows[0].id],
  );
  await login(page);
  const abrir = page.getByRole("button", { name: "Abrir menu", exact: true });
  if (await abrir.isVisible()) {
    await abrir.click();
    const dialog = page.getByRole("dialog", { name: "Navegação do BoviTrack" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(abrir).toBeFocused();
    await abrir.click();
  }
  await page
    .getByRole("navigation", { name: "Menu principal" })
    .getByRole("link", { name: "Animais", exact: true })
    .click();
  await page.getByLabel("Buscar animal", { exact: true }).fill("TABLE-");
  await expect(
    page.getByRole("table", { name: "Lista de animais" }).locator("tbody tr"),
  ).toHaveCount(10);
  await page
    .getByRole("button", { name: "Próxima página", exact: true })
    .click();
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Página anterior", exact: true })
    .click();
  if (await page.getByRole("button", { name: /^Nome/ }).isVisible()) {
    await page.getByRole("button", { name: /^Nome/ }).click();
    await expect(
      page.getByRole("table").locator("tbody tr").first(),
    ).toContainText("Tabela E2E 12");
  }
  await page.getByLabel("Filtrar sexo").selectOption("F");
  await expect(
    page.getByText("Nenhum animal encontrado", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await page.getByRole("search").getByRole("searchbox").fill("Mimosa E2E");
  await page.getByRole("button", { name: "Pesquisar animais" }).click();
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(1);
  await expect(page.getByRole("table")).toContainText("Mimosa E2E");
  await semOverflow(page);
});

test("abas preservam formulário e produção cria, edita e exclui", async ({
  page,
}) => {
  await login(page);
  await page.goto("/animais/1?aba=producao");
  await page
    .getByRole("button", { name: "Registrar produção", exact: true })
    .click();
  const form = page.locator(".milk-form");
  await form.getByLabel("Data da ordenha").fill("2026-10-01");
  await form.getByLabel("Turno").selectOption("manha");
  await form.getByLabel("Quantidade (litros)").fill("18.5");
  const observacao = `Ordenha UI ${Date.now()}`;
  await form.getByLabel("Observação").fill(observacao);
  await page.getByRole("tab", { name: "Pesagens", exact: true }).click();
  await page.getByRole("tab", { name: "Produção", exact: true }).click();
  await expect(form.getByLabel("Observação")).toHaveValue(observacao);
  await form
    .getByRole("button", { name: "Registrar produção", exact: true })
    .click();
  const linha = page
    .locator(".milk-record-row")
    .filter({ hasText: observacao });
  await expect(linha).toContainText("18,5 L");
  await linha.getByRole("button", { name: "Editar" }).click();
  await form.getByLabel("Quantidade (litros)").fill("19.5");
  await form.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(linha).toContainText("19,5 L");
  page.once("dialog", (dialog) => dialog.accept());
  await linha.getByRole("button", { name: "Excluir" }).click();
  await expect(linha).toHaveCount(0);
  await page.getByRole("tab", { name: "Resumo", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Pesagens", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await semOverflow(page);
});

test("receita cria, edita, filtra e exclui sem alterar despesas", async ({
  page,
}) => {
  await login(page);
  await page.goto("/lucros?novo=1");
  await expect(
    page.getByRole("heading", { name: "Produção e resultados", exact: true }),
  ).toBeVisible();
  const form = page.locator(".revenue-form");
  const descricao = `Receita UI ${Date.now()}`;
  await form.getByLabel("Descrição", { exact: true }).fill(descricao);
  await form.getByLabel("Categoria", { exact: true }).fill("Venda de leite");
  await form.getByLabel("Valor", { exact: true }).fill("125.30");
  await form.getByLabel("Data", { exact: true }).fill("2026-10-01");
  await form
    .getByLabel("Propriedade", { exact: true })
    .selectOption({ label: "Fazenda E2E" });
  await form.getByRole("button", { name: "Cadastrar receita" }).click();
  await page.getByLabel("Período", { exact: true }).selectOption("todos");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  const linha = page
    .getByRole("table", { name: "Lançamentos financeiros" })
    .locator("tbody tr")
    .filter({ hasText: descricao });
  await expect(linha).toContainText("125,30");
  await linha.getByRole("button", { name: "Editar" }).click();
  await form.getByLabel("Valor", { exact: true }).fill("150.30");
  await form.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(linha).toContainText("150,30");
  await linha.getByRole("button", { name: "Excluir" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar exclusão" })
    .click();
  await expect(linha).toHaveCount(0);
  await expect(page.getByRole("table")).toContainText("Ração E2E");
  await page
    .getByLabel("Período", { exact: true })
    .selectOption("personalizado");
  await page.getByLabel("Data inicial").fill("2026-10-12");
  await page.getByLabel("Data final").fill("2026-10-01");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page.getByRole("alert")).toContainText("data inicial");
  await semOverflow(page);
});

test("lote mantém vínculos e conclusão de desmama atualiza peso e lote", async ({
  page,
}) => {
  const prop = await db.query(
    "SELECT p.id FROM propriedades p JOIN usuarios u ON u.id=p.usuario_id WHERE u.email='e2e-owner@example.test' AND p.nome='Fazenda E2E'",
  );
  const calf = await db.query(
    "INSERT INTO animais(nome,especie,sexo,propriedade_id,numero_brinco,data_nascimento,mae_id) VALUES ($1,'Bovino','F',$2,$3,'2026-05-01',1) RETURNING id",
    [`Bezerra UI ${Date.now()}`, prop.rows[0].id, `CALF-${Date.now()}`],
  );
  await login(page);
  await page.goto("/lotes");
  const lote = page
    .locator(".lot-card")
    .filter({
      has: page.getByRole("heading", { name: "Lote E2E", exact: true }),
    });
  await lote.getByRole("button", { name: /Gerenciar animais/ }).click();
  await lote.getByLabel("Adicionar animal").selectOption("1");
  await lote.getByRole("button", { name: "Adicionar ao lote" }).click();
  const mimosa = lote.locator(".lot-animal").filter({ hasText: "Mimosa E2E" });
  await expect(mimosa).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await mimosa.getByRole("button", { name: "Remover" }).click();
  await expect(mimosa).toHaveCount(0);
  await page.goto(`/animais/${calf.rows[0].id}?aba=desmama`);
  await page.getByRole("button", { name: "Planejar desmama" }).click();
  await page.getByLabel("Data planejada").fill("2026-10-01");
  await page.getByRole("button", { name: "Salvar planejamento" }).click();
  await page
    .locator(".weaning-record")
    .getByRole("button", { name: "Concluir", exact: true })
    .click();
  await page.getByLabel("Data real da desmama").fill("2026-10-01");
  await page.getByLabel("Peso na desmama (kg)").fill("270");
  await page
    .getByLabel("Lote de destino", { exact: true })
    .selectOption({ label: "Lote E2E" });
  await page
    .locator(".conclusion-form")
    .getByRole("button", { name: "Concluir", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Desmama concluída" }),
  ).toBeVisible();
  await expect(page.locator(".animal-profile-details")).toContainText("270 kg");
  await expect(page.locator(".animal-profile-lots")).toContainText("Lote E2E");
  await page.getByRole("tab", { name: "Pesagens", exact: true }).click();
  await expect(page.locator(".management-record").first()).toContainText(
    "270,0 kg",
  );
  await semOverflow(page);
});
