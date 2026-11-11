import { defineConfig } from "@playwright/test";

if (process.env.BOVITRACK_E2E_ISOLATED !== "true" || process.env.NODE_ENV !== "test") {
  throw new Error("Execute node scripts/test-isolated.cjs e2e na raiz; E2E exige banco descartável local.");
}
const databaseUrl = new URL(process.env.DATABASE_URL);
if (databaseUrl.search || databaseUrl.hash || !['postgres:', 'postgresql:'].includes(databaseUrl.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(databaseUrl.hostname) || !databaseUrl.pathname.startsWith('/bovitrack_test_')) {
  throw new Error("Banco E2E deve ser local e criado pelo runner isolado");
}
const fixtureUrl = new URL(process.env.BOVITRACK_TEST_ADMIN_URL || "http://ausente.invalid");
if (fixtureUrl.protocol !== databaseUrl.protocol || fixtureUrl.search || fixtureUrl.hash ||
    fixtureUrl.host !== databaseUrl.host || fixtureUrl.pathname !== databaseUrl.pathname ||
    fixtureUrl.username === databaseUrl.username) {
  throw new Error("Credencial de fixture E2E deve ser separada e apontar ao mesmo banco isolado");
}

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  retries: 0,
  timeout: 60000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    actionTimeout: 10000,
    baseURL: "http://127.0.0.1:5175", browserName: "chromium",
    reducedMotion: "reduce", timezoneId: "America/Sao_Paulo",
    screenshot: "only-on-failure", trace: "retain-on-failure",
  },
  projects: [
    [1920, 1080], [1366, 768], [1024, 768], [768, 1024], [430, 932], [390, 844], [360, 800],
  ].map(([width, height]) => ({ name: `${width}x${height}`, use: { viewport: { width, height } } })),
  webServer: [
    { command: "node --require ../backend/tests/helpers/email.js ../backend/server.js", url: "http://127.0.0.1:3005", reuseExistingServer: false },
    { command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5175 --strictPort", url: "http://127.0.0.1:5175", reuseExistingServer: false },
  ],
});
