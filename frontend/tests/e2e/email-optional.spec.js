import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Pool } = require("../../../backend/node_modules/pg");
const db = new Pool({
  connectionString: process.env.BOVITRACK_TEST_ADMIN_URL,
  ssl: false,
});
test.afterAll(async () => {
  await db.end();
});
test("flag FALSE: cadastro, login, F5, dashboard e rota de verificacao opcional", async ({
  page,
}, testInfo) => {
  // A suite integral TRUE preserva seus cenarios originais. Este caso tem runner FALSE proprio.
  test.skip(
    process.env.EMAIL_VERIFICATION_REQUIRED !== "false",
    "Executar com BOVITRACK_TEST_EMAIL_REQUIRED=false",
  );
  await db.query("DELETE FROM limites_requisicao");
  await page.route(/127\.0\.0\.1:3005\/.*clima/, (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
  );
  const email =
    "optional-" + testInfo.project.name + "-" + Date.now() + "@example.test";
  await page.goto("/cadastro");
  await page.getByLabel("Nome", { exact: true }).fill("Conta opcional");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Senha", { exact: true })
    .fill(process.env.TEST_ADMIN_SENHA);
  await page
    .getByLabel("Confirmar senha", { exact: true })
    .fill(process.env.TEST_ADMIN_SENHA);
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Acesse sua conta" }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/verificar-email/);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Senha", { exact: true })
    .fill(process.env.TEST_ADMIN_SENHA);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Visão geral do rebanho" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Visão geral do rebanho" }),
  ).toBeVisible();
  await page.goto("/minha-conta");
  await page
    .getByRole("button", { name: "Editar informações", exact: true })
    .click();
  await page
    .getByLabel("Nome", { exact: true })
    .fill("Conta opcional atualizada");
  await page
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  await expect(
    page.getByText("Conta atualizada com sucesso!", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Editar informações", exact: true }),
  ).toBeVisible();
  await page.goto("/verificar-email");
  await expect(
    page.getByRole("heading", { name: "Visão geral do rebanho" }),
  ).toBeVisible();
  const user = (
    await db.query(
      "SELECT id,email_verificado,email_verificado_em FROM usuarios WHERE email=$1",
      [email],
    )
  ).rows[0];
  expect(user.email_verificado).toBe(false);
  expect(user.email_verificado_em).toBe(null);
  expect(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM verificacoes_email WHERE usuario_id=$1",
        [user.id],
      )
    ).rows[0].n,
  ).toBe(0);
});
