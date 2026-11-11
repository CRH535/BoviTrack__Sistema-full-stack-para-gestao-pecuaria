const { Pool } = require("pg");

const url = new URL(process.env.BOVITRACK_TEST_ADMIN_URL || "http://ausente.invalid");
const runtime = new URL(process.env.DATABASE_URL || "http://ausente.invalid");
if (process.env.NODE_ENV !== "test" || process.env.ALLOW_TEST_DB_WRITES !== "true" ||
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.search || url.hash || !/^\/bovitrack_test_\d+_[0-9a-f]{6}$/.test(url.pathname) ||
    runtime.host !== url.host || runtime.pathname !== url.pathname) {
  throw new Error("Fixture privilegiada exige o banco descartável do runner local");
}

module.exports = new Pool({ connectionString: url.href, ssl: false, allowExitOnIdle: true });
