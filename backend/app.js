require("./config/ambiente");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const pool = require("./database/pool");
const { criarConfiguracaoCors } = require("./config/cors");
const { autenticar } = require("./middleware/autenticacao");
const { contextoRequisicao } = require("./middleware/contextoRequisicao");
const { rotaNaoEncontrada, tratarErros } = require("./middleware/erros");
const authRoutes = require("./routes/authRoutes");
const verificacaoEmailRoutes = require("./routes/verificacaoEmailRoutes");
const usuariosRoutes = require("./routes/usuariosRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const propriedadesRoutes = require("./routes/propriedadesRoutes");
const animaisRoutes = require("./routes/animaisRoutes");
const lotesRoutes = require("./routes/lotesRoutes");
const vacinasRoutes = require("./routes/vacinasRoutes");
const vacinacoesRoutes = require("./routes/vacinacoesRoutes");
const producoesLeiteirasRoutes = require("./routes/producoesLeiteirasRoutes");
const pesagensRoutes = require("./routes/pesagensRoutes");
const desmamasRoutes = require("./routes/desmamasRoutes");
const despesasRoutes = require("./routes/despesasRoutes");
const receitasRoutes = require("./routes/receitasRoutes");
const climaRoutes = require("./routes/climaRoutes");

const app = express();

// Na Vercel existe exatamente um proxy confiável antes da função. Fora dela,
// não confiamos em X-Forwarded-For enviado diretamente pelo cliente.
if (process.env.VERCEL) {
  app.set("trust proxy", 1);
}

app.disable("x-powered-by");
app.use(contextoRequisicao);
app.use(
  helmet({
    // Esta aplicação entrega somente JSON. A CSP do SPA é configurada no frontend.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
    strictTransportSecurity: process.env.NODE_ENV === "production",
    referrerPolicy: { policy: "no-referrer" },
  }),
);
app.use((req, res, next) => {
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "100kb" }));
app.use(cors(criarConfiguracaoCors()));

app.get("/", (req, res) => {
  res.json({ status: "ok" });
});

app.use(authRoutes);
app.use(verificacaoEmailRoutes);
app.use(autenticar);
app.use(usuariosRoutes);
app.use(dashboardRoutes);
app.use(propriedadesRoutes);
app.use(animaisRoutes);
app.use(lotesRoutes);
app.use(vacinasRoutes);
app.use(vacinacoesRoutes);
app.use(producoesLeiteirasRoutes);
app.use(pesagensRoutes);
app.use(desmamasRoutes);
app.use(despesasRoutes);
app.use(receitasRoutes);
app.use(climaRoutes);
app.use(rotaNaoEncontrada);
app.use(tratarErros);

// A exportacao direta permite que a Vercel detecte o Express sem adaptadores.
// As propriedades preservam a interface usada pelos testes e pelo servidor local.
module.exports = app;
module.exports.app = app;
module.exports.pool = pool;
