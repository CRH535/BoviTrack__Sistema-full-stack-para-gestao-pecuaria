const { app, pool } = require("./app");

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  const host = process.env.NODE_ENV === "test" ? "127.0.0.1" : undefined;
  app.listen(PORT, host, () => {
    console.log(`Servidor esta em http://localhost:${PORT}`);
  });
}

module.exports = app;
module.exports.app = app;
module.exports.pool = pool;
