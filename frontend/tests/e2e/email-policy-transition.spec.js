import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { prepararCodigoEmail } from "./email-fixtures";

const require = createRequire(import.meta.url);
const { Pool } = require("../../../backend/node_modules/pg");
const bcrypt = require("../../../backend/node_modules/bcryptjs");
const db = new Pool({
  connectionString: process.env.BOVITRACK_TEST_ADMIN_URL,
  ssl: false,
});

test.afterAll(async () => {
  await db.end();
});

test("a exigencia retornada no login atualiza a politica antiga da aba", async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.EMAIL_VERIFICATION_REQUIRED !== "true",
    "Cenario de ativacao TRUE",
  );
  await db.query("DELETE FROM limites_requisicao");
  const email = `transition-${testInfo.project.name}-${Date.now()}@example.test`;
  await db.query(
    "INSERT INTO usuarios(nome,email,senha,perfil) VALUES ('Conta de transicao',$1,$2,'usuario')",
    [email, await bcrypt.hash(process.env.TEST_ADMIN_SENHA, 4)],
  );
  // Simula a configuracao que a aba recebeu antes da ativacao. Login e codigo
  // continuam usando o backend TRUE e o PostgreSQL reais.
  await page.route(
    "**/auth/config",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ verificacaoEmailObrigatoria: false }),
      }),
  );
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Senha", { exact: true })
    .fill(process.env.TEST_ADMIN_SENHA);
  await page.unroute("**/auth/config");
  const response = page.waitForResponse(
    (res) =>
      res.url().endsWith("/auth/login") && res.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  expect((await response).status()).toBe(403);
  await expect(
    page.getByRole("heading", { name: "Verifique seu e-mail", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Código de 6 dígitos")
    .fill(await prepararCodigoEmail(db, email));
  await page
    .getByRole("button", { name: "Verificar e-mail", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "E-mail verificado", exact: true }),
  ).toBeVisible();
});
