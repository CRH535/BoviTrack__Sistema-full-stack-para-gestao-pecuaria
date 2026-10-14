require("dotenv").config();

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const jwt = require("jsonwebtoken");
const { validarAmbiente } = require("../config/ambiente");
const { criarConfiguracaoPorUrl } = require("../database/config");
const { exigirAutenticacaoRecente } = require("../middleware/autenticacao");
const { protegerContraCsrf } = require("../middleware/csrf");
const { consumirLimite } = require("../services/limitesRequisicao");
const { sincronizarPesoAtual } = require("../services/pesoAtual");
const { obterIpCliente } = require("../utils/rede");
const { validarSenha } = require("../services/usuarios");
const {
  encerrarTodasSessoes,
  lerRefreshToken,
  renovarSessaoRefresh,
  verificarTokenAcesso,
} = require("../services/sessoes");
const { app } = require("../app");
const {
  converterId,
  normalizarDataCalendario,
  normalizarPaginacao,
  validarCamposPermitidos,
} = require("../utils/validacoes");

let total = 0;
async function teste(nome, executar) {
  await executar();
  total += 1;
  console.log(`OK ${nome}`);
}

function respostaFake() {
  return {
    statusRecebido: null,
    corpo: null,
    status(valor) { this.statusRecebido = valor; return this; },
    json(valor) { this.corpo = valor; return this; },
  };
}

(async () => {
  await teste("IDs, paginação, datas e campos desconhecidos são rejeitados", () => {
    for (const valor of [-1, 0, 1.5, NaN, Infinity, "abc"]) assert.equal(converterId(valor), null);
    assert.equal(converterId("7"), 7);
    assert.ok(normalizarPaginacao({ page: 0 }).erro);
    assert.ok(normalizarPaginacao({ limit: 101 }).erro);
    assert.deepEqual(normalizarPaginacao({ page: 2, limit: 50 }).valor, { pagina: 2, limite: 50, offset: 50 });
    assert.ok(normalizarDataCalendario("2026-02-30").erro);
    assert.ok(validarCamposPermitidos({ nome: "x", perfil: "admin" }, ["nome"]).erro);
    assert.throws(() => validarSenha("curta"));
    assert.throws(() => validarSenha("🔐".repeat(19)));
    assert.doesNotThrow(() => validarSenha("senha-segura-2026"));
  });

  await teste("cookie malformado não lança exceção", () => {
    const req = { headers: { cookie: "bovitrack_refresh=%ZZ" } };
    assert.equal(lerRefreshToken(req), null);
    assert.equal(req.refreshCookieInvalido, true);
  });

  await teste("refresh rotaciona hash e replay antigo revoga a família", async () => {
    const criarPool = (responder) => ({
      connect: async () => ({
        query: responder,
        release() {},
      }),
    });
    const consultasRotacao = [];
    const poolRotacao = criarPool(async (sql) => {
      consultasRotacao.push(sql);
      if (/SELECT sr\.id/.test(sql)) return { rows: [{
        id: 9, session_id: "sessao", family_id: "familia",
        expires_at: new Date(Date.now() + 60000), last_authenticated_at: new Date(),
        revoked_at: null, usuario_id: 1, nome: "Teste", email: "t@e.st",
        perfil: "usuario", ativo: true, email_verificado: true,
      }] };
      return { rows: [], rowCount: 1 };
    });
    const rotacao = await renovarSessaoRefresh(poolRotacao, "a".repeat(64));
    assert.equal(rotacao.sessionId, "sessao");
    assert.notEqual(rotacao.token, "a".repeat(64));
    assert.ok(consultasRotacao.some((sql) => /sessoes_refresh_usados/.test(sql)));

    let familiaRevogada = false;
    const poolReplay = criarPool(async (sql) => {
      if (/SELECT sr\.id/.test(sql)) return { rows: [] };
      if (/SELECT su\.family_id/.test(sql)) return { rows: [{ family_id: "familia", used_at: new Date(Date.now() - 10000), revoked_at: null }] };
      if (/revoke_reason = 'REPLAY'/.test(sql)) familiaRevogada = true;
      return { rows: [], rowCount: 1 };
    });
    assert.equal((await renovarSessaoRefresh(poolReplay, "b".repeat(64))).replay, true);
    assert.equal(familiaRevogada, true);

    let logoutTodos = false;
    await encerrarTodasSessoes({ query: async (sql, valores) => {
      logoutTodos = /usuario_id = \$1/.test(sql) && valores[0] === 1;
      return { rowCount: 2 };
    } }, 1);
    assert.equal(logoutTodos, true);
  });

  await teste("JWT rejeita algoritmo, issuer, audience e expiração incorretos", () => {
    const segredo = process.env.JWT_SECRET;
    const base = { perfil: "usuario", sid: "sessao", sub: "1" };
    for (const opcoes of [
      { algorithm: "HS384", issuer: "bovitrack-api", audience: "bovitrack-web" },
      { algorithm: "HS256", issuer: "outro", audience: "bovitrack-web" },
      { algorithm: "HS256", issuer: "bovitrack-api", audience: "outro" },
      { algorithm: "HS256", issuer: "bovitrack-api", audience: "bovitrack-web", expiresIn: -1 },
    ]) {
      const token = jwt.sign(base, segredo, opcoes);
      assert.throws(() => verificarTokenAcesso(token));
    }
  });

  await teste("produção falha com segredo fraco, access token longo e TLS inseguro", () => {
    const base = {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@db.example.com/postgres?sslmode=verify-full",
      JWT_SECRET: "uma-chave-realmente-forte-com-mais-de-trinta-e-dois-bytes-2026",
      JWT_ACCESS_EXPIRES_IN: "15m",
      JWT_REFRESH_EXPIRES_IN: "7d",
      JWT_ISSUER: "bovitrack-api",
      JWT_AUDIENCE: "bovitrack-web",
      FRONTEND_URL: "https://bovitrack.example",
      COOKIE_SECURE: "true",
      COOKIE_SAME_SITE: "none",
      RESEND_API_KEY: 're_fake_test_only', EMAIL_VERIFICATION_PEPPER: 'p'.repeat(48),
    };
    assert.doesNotThrow(() => validarAmbiente(base));
    assert.throws(() => validarAmbiente({ ...base, RESEND_API_KEY: '' }));
    assert.throws(() => validarAmbiente({ ...base, EMAIL_VERIFICATION_PEPPER: '' }));
    assert.throws(() => validarAmbiente({ ...base, JWT_SECRET: "fraco" }));
    assert.throws(() => validarAmbiente({ ...base, JWT_ACCESS_EXPIRES_IN: "8h" }));
    assert.throws(() => validarAmbiente({ ...base, JWT_REFRESH_EXPIRES_IN: "365d" }));
    assert.throws(() => validarAmbiente({ ...base, DATABASE_URL: "postgresql://user:pass@db.example.com/postgres?sslmode=require" }));
    assert.throws(() => criarConfiguracaoPorUrl("postgresql://u:p@db.example.com/postgres", { sslMode: "require", producao: true }));
  });

  await teste("CSRF bloqueia origem estranha e aceita a allowlist exata", () => {
    const anterior = { NODE_ENV: process.env.NODE_ENV, FRONTEND_URL: process.env.FRONTEND_URL };
    process.env.NODE_ENV = "production";
    process.env.FRONTEND_URL = "https://app.example";
    const bloqueada = respostaFake();
    protegerContraCsrf({ id: "1", originalUrl: "/auth/refresh", headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } }, bloqueada, () => assert.fail());
    assert.equal(bloqueada.statusRecebido, 403);
    let passou = false;
    protegerContraCsrf({ headers: { origin: "https://app.example", "sec-fetch-site": "cross-site" } }, respostaFake(), () => { passou = true; });
    assert.equal(passou, true);
    Object.assign(process.env, anterior);
  });

  await teste("IP na Vercel prioriza o header controlado pela plataforma", () => {
    const req = {
      headers: {
        "x-vercel-forwarded-for": "203.0.113.10",
        "x-forwarded-for": "198.51.100.2",
      },
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
    };
    assert.equal(obterIpCliente(req, { VERCEL: "1" }), "203.0.113.10");
    assert.equal(obterIpCliente(req, {}), "127.0.0.1");
  });

  await teste("operações administrativas destrutivas exigem autenticação recente", () => {
    const agora = Math.floor(Date.now() / 1000);
    let passou = false;
    exigirAutenticacaoRecente(900)(
      { autenticacao: { autenticadoEm: agora - 60 } },
      respostaFake(),
      () => { passou = true; },
    );
    assert.equal(passou, true);

    const antiga = respostaFake();
    exigirAutenticacaoRecente(900)(
      { autenticacao: { autenticadoEm: agora - 901 } },
      antiga,
      () => assert.fail("não deveria aceitar sessão antiga"),
    );
    assert.equal(antiga.statusRecebido, 403);
    assert.equal(antiga.corpo.codigo, "REAUTENTICACAO_NECESSARIA");
  });

  await teste("rate limit usa atualização atômica e bloqueia após o limite", async () => {
    let contador = 0;
    const executor = { query: async (sql) => {
      assert.match(sql, /ON CONFLICT[\s\S]*DO UPDATE/);
      contador += 1;
      return { rows: [{ contador }] };
    } };
    assert.equal((await consumirLimite({ escopo: "TESTE", chave: "ip", limite: 2, janelaMs: 60000, executor })).permitido, true);
    assert.equal((await consumirLimite({ escopo: "TESTE", chave: "ip", limite: 2, janelaMs: 60000, executor })).permitido, true);
    assert.equal((await consumirLimite({ escopo: "TESTE", chave: "ip", limite: 2, janelaMs: 60000, executor })).permitido, false);
  });

  await teste("sincronização de peso bloqueia e escolhe a última pesagem cronológica", async () => {
    const consultas = [];
    const cliente = { query: async (sql) => {
      consultas.push(sql);
      return { rows: [{ id: 1 }] };
    } };
    await sincronizarPesoAtual(cliente, 1);
    assert.match(consultas[0], /FOR UPDATE/);
    assert.match(consultas[1], /ORDER BY p\.data_pesagem DESC, p\.id DESC/);
  });

  await teste("rotas transacionais não readquirem o pool global", () => {
    const pesagens = fs.readFileSync(path.join(__dirname, "../routes/pesagensRoutes.js"), "utf8");
    const trechoPesagens = pesagens.slice(pesagens.indexOf('router.post("/animais/:animalId/pesagens"'), pesagens.indexOf('router.get("/pesagens"'));
    assert.doesNotMatch(trechoPesagens, /await pool\.query/);
    const desmamas = fs.readFileSync(path.join(__dirname, "../routes/desmamasRoutes.js"), "utf8");
    const trechoConclusao = desmamas.slice(desmamas.indexOf('router.post("/desmamas/:id/concluir"'), desmamas.indexOf('router.post("/desmamas/:id/cancelar"'));
    assert.doesNotMatch(trechoConclusao, /await pool\.query/);
    assert.match(trechoConclusao, /buscarAnimalPermitido\([^\n]+cliente, true\)/);
  });

  await teste("health check é mínimo, headers estão ativos e JSON grande recebe 413", async () => {
    const servidor = await new Promise((resolve) => {
      const instancia = app.listen(0, "127.0.0.1", () => resolve(instancia));
    });
    try {
      const endereco = servidor.address();
      const base = `http://127.0.0.1:${endereco.port}`;
      const health = await fetch(`${base}/`);
      assert.deepEqual(await health.json(), { status: "ok" });
      assert.equal(health.headers.get("x-content-type-options"), "nosniff");
      assert.equal(health.headers.get("x-powered-by"), null);
      const grande = await fetch(`${base}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "a@b.test", senha: "x".repeat(110 * 1024) }),
      });
      assert.equal(grande.status, 413);
    } finally {
      await new Promise((resolve) => servidor.close(resolve));
    }
  });

  await teste("frontend mantém JWT só em memória e restaura a sessão por refresh + me", () => {
    const apiFonte = fs.readFileSync(path.join(__dirname, "../../frontend/src/services/api.js"), "utf8");
    const authFonte = fs.readFileSync(path.join(__dirname, "../../frontend/src/auth/AuthContext.jsx"), "utf8");
    const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, "../../frontend/vercel.json"), "utf8"));

    assert.doesNotMatch(apiFonte, /localStorage\.setItem\([^\n]*(token|jwt)/i);
    assert.doesNotMatch(apiFonte, /sessionStorage|indexedDB/i);
    assert.match(apiFonte, /let tokenAcesso = null/);
    assert.match(apiFonte, /withCredentials: true/);
    assert.match(apiFonte, /renovacaoEmAndamento/);
    assert.match(authFonte, /await renovarSessao\(\)[\s\S]*api\.get\("\/auth\/me"\)/);
    assert.match(authFonte, /BroadcastChannel/);

    const headers = vercel.headers.flatMap((regra) => regra.headers || []);
    const csp = headers.find((header) => header.key === "Content-Security-Policy")?.value || "";
    assert.match(csp, /default-src 'self'/);
    assert.doesNotMatch(csp, /unsafe-eval/);
    assert.match(csp, /frame-ancestors 'none'/);
  });

  console.log(`${total} grupos de segurança validados com sucesso.`);
})().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
