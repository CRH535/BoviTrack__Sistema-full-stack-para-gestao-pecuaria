const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
process.env.DB_POOL_MAX = "3";
const fixture = require("./helpers/bancoFixture");
const { mensagens } = require("./helpers/email");
const { app } = require("../app");
const dominio = require("../database/pool");
const { obterPoolAutenticacao } = require("../database/poolAutenticacao");
const { verificacaoEmailObrigatoria } = require("../config/email");
const { comAtor, transacao } = require("../database/contextoRls");
let server,
  base,
  total = 0;
const password = "Flag#Fixture2026";
const emailA = "flag-a-" + crypto.randomUUID() + "@example.test";
const emailB = "flag-b-" + crypto.randomUUID() + "@example.test";
const check = async (name, fn) => {
  await fn();
  total++;
  console.log("OK " + name);
};
async function request(route, { body, token, cookie, ticket, method } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  if (cookie) headers.Cookie = cookie.split(";")[0];
  if (ticket) headers["X-Email-Verification"] = ticket;
  const r = await fetch(base + route, {
    method: method || (body ? "POST" : "GET"),
    headers,
    body: body && JSON.stringify(body),
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers
      .getSetCookie()
      .find((c) => c.startsWith("bovitrack_refresh=")),
  };
}
const login = (email, senha = password) =>
  request("/auth/login", { body: { email, senha } });
async function flag(value) {
  await fixture.query(
    "UPDATE bovitrack_seg.configuracao_email SET obrigatoria=$1",
    [value],
  );
  process.env.EMAIL_VERIFICATION_REQUIRED = String(value);
}
async function main() {
  assert.equal(verificacaoEmailObrigatoria(), false);
  server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  base = "http://127.0.0.1:" + server.address().port;
  let a, b, admin, property, refreshA;
  await check(
    "FALSE: cadastro sem desafio, sem envio e sem verificacao artificial",
    async () => {
      let first;
      for (const email of [emailA, emailB]) {
        const r = await request("/auth/cadastro", {
          body: { nome: "Conta de teste", email, senha: password },
        });
        assert.equal(r.status, 201);
        assert.equal(r.data.verificacao, undefined);
        first = r;
        const u = (
          await fixture.query(
            "SELECT email_verificado,email_verificado_em FROM usuarios WHERE email=$1",
            [email],
          )
        ).rows[0];
        assert.equal(u.email_verificado, false);
        assert.equal(u.email_verificado_em, null);
      }
      const duplicate = await request("/auth/cadastro", {
        body: { nome: "Outra pessoa", email: emailB, senha: password },
      });
      assert.equal(duplicate.status, first.status);
      assert.deepEqual(duplicate.data, first.data);
      assert.equal(mensagens.size, 0);
      assert.equal(
        (
          await fixture.query(
            "SELECT count(*)::int AS n FROM verificacoes_email",
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (await request("/auth/email/reenviar", { body: { email: emailA } }))
          .status,
        409,
      );
      assert.equal(
        (await request("/auth/config")).data.verificacaoEmailObrigatoria,
        false,
      );
    },
  );
  await check(
    "FALSE: contas novas, antigas e admin nao verificados entram",
    async () => {
      await fixture.query(
        "UPDATE usuarios SET email_verificado=false,email_verificado_em=NULL WHERE email=ANY($1)",
        [[process.env.TEST_ADMIN_EMAIL, "e2e-owner@example.test"]],
      );
      a = await login(emailA);
      b = await login(emailB);
      admin = await login(
        process.env.TEST_ADMIN_EMAIL,
        process.env.TEST_ADMIN_SENHA,
      );
      for (const r of [
        a,
        b,
        admin,
        await login("e2e-owner@example.test", process.env.TEST_ADMIN_SENHA),
      ])
        assert.equal(r.status, 200);
      assert.equal(mensagens.size, 0);
    },
  );
  await check(
    "FALSE: me, refresh, propriedades, animal e dashboard com RLS",
    async () => {
      assert.equal(
        (await request("/auth/me", { token: a.data.token })).status,
        200,
      );
      refreshA = await request("/auth/refresh", { body: {}, cookie: a.cookie });
      assert.equal(refreshA.status, 200);
      const r = await request("/propriedades", {
        token: a.data.token,
        body: {
          nome: "Propriedade flag",
          cidade: "Teste",
          estado: "SP",
          area: 10,
        },
      });
      assert.equal(r.status, 201);
      property = r.data.propriedade.id;
      assert.equal(
        (
          await request("/animais", {
            token: a.data.token,
            body: {
              nome: "Animal flag",
              especie: "Bovino",
              sexo: "F",
              propriedade_id: property,
            },
          })
        ).status,
        201,
      );
      assert.equal(
        (await request("/dashboard", { token: a.data.token })).status,
        200,
      );
      assert.equal(
        (await request("/propriedades", { token: b.data.token })).data.length,
        0,
      );
      assert.equal(
        (await request("/propriedades/" + property, { token: b.data.token }))
          .status,
        404,
      );
      assert.equal(
        (await request("/usuarios", { token: a.data.token })).status,
        403,
      );
      assert.equal(
        (await request("/usuarios", { token: admin.data.token })).status,
        200,
      );
    },
  );
  await check(
    "FALSE: 90 transacoes concorrentes de pendentes mantem isolamento e reuso",
    async () => {
      const actors = [a, b].map((r) => ({
        id: r.data.usuario.id,
        sessionId: jwt.decode(r.data.token).sid,
      }));
      await Promise.all(
        Array.from({ length: 90 }, (_, i) =>
          comAtor(actors[i % 2], async (c) => {
            const r = await c.query("SELECT id FROM propriedades");
            assert.deepEqual(
              r.rows.map((row) => row.id),
              i % 2 === 0 ? [property] : [],
            );
          }),
        ),
      );
      assert.equal(dominio.waitingCount, 0);
      assert.ok(dominio.totalCount <= 3);
      assert.equal(
        (await dominio.query("SELECT id FROM propriedades")).rowCount,
        0,
      );
    },
  );
  await check(
    "flag administrativa: runtime/auth nao alteram config nem GUC contorna banco",
    async () => {
      for (const pool of [dominio, obterPoolAutenticacao()])
        await assert.rejects(
          pool.query(
            "UPDATE bovitrack_seg.configuracao_email SET obrigatoria=true",
          ),
          { code: "42501" },
        );
      await assert.rejects(
        dominio.query("UPDATE usuarios SET email_verificado=true"),
        { code: "42501" },
      );
      await assert.rejects(dominio.query("SET ROLE bovitrack_rls_identidade"), {
        code: "42501",
      });
      assert.equal(
        (
          await request("/auth/login", {
            body: {
              email: emailA,
              senha: password,
              EMAIL_VERIFICATION_REQUIRED: false,
            },
          })
        ).status,
        400,
      );
      await flag(true);
      await transacao(dominio, async (c) => {
        await c.query(
          "SELECT set_config('bovitrack.email_verification_required','false',true)",
        );
        assert.equal(
          (
            await c.query(
              "SELECT bovitrack_seg.email_verificacao_obrigatoria() AS required",
            )
          ).rows[0].required,
          true,
        );
        assert.equal(
          (await c.query("SELECT id FROM propriedades")).rowCount,
          0,
        );
      });
      await assert.rejects(
        comAtor(
          { id: a.data.usuario.id, sessionId: jwt.decode(a.data.token).sid },
          (c) => c.query("SELECT id FROM propriedades"),
        ),
        { codigo: "SESSAO_INVALIDA" },
      );
      await flag(false);
    },
  );
  await check(
    "divergencia API/SQL falha fechada sem revogar sessoes",
    async () => {
      const before = (
        await fixture.query(
          "SELECT count(*)::int AS n FROM sessoes_refresh WHERE revoked_at IS NULL",
        )
      ).rows[0].n;
      await fixture.query(
        "UPDATE bovitrack_seg.configuracao_email SET obrigatoria=true",
      );
      assert.equal((await login(emailA)).status, 503);
      assert.equal(
        (await request("/auth/me", { token: a.data.token })).status,
        503,
      );
      assert.equal(
        (
          await fixture.query(
            "SELECT count(*)::int AS n FROM sessoes_refresh WHERE revoked_at IS NULL",
          )
        ).rows[0].n,
        before,
      );
      await flag(false);
    },
  );
  await check(
    "FALSE -> TRUE: conta pendente e refresh bloqueados; codigo legitimo habilita conta",
    async () => {
      await flag(true);
      const pending = await login(emailA);
      assert.equal(pending.status, 403);
      assert.equal(pending.data.codigo, "EMAIL_NOT_VERIFIED");
      assert.equal(
        (await request("/auth/me", { token: a.data.token })).status,
        403,
      );
      assert.equal(
        (await request("/auth/refresh", { body: {}, cookie: refreshA.cookie }))
          .status,
        403,
      );
      const message = mensagens.get(emailA);
      assert.ok(message);
      const verified = await request("/auth/email/verificar", {
        body: { email: emailA, codigo: message.codigo },
        ticket: pending.data.verificacao.ticket,
      });
      assert.equal(verified.status, 200);
      assert.equal((await login(emailA)).status, 200);
      const u = (
        await fixture.query(
          "SELECT email_verificado FROM usuarios WHERE email=$1",
          [emailA],
        )
      ).rows[0];
      assert.equal(u.email_verificado, true);
    },
  );
  await check(
    "TRUE -> FALSE: pendente volta a entrar, sem ressuscitar sessao revogada",
    async () => {
      const before = mensagens.size;
      await flag(false);
      assert.equal(
        (await request("/auth/me", { token: a.data.token })).status,
        401,
      );
      a = await login(emailA);
      b = await login(emailB);
      assert.equal(a.status, 200);
      assert.equal(b.status, 200);
      assert.equal(mensagens.size, before);
      assert.equal(
        (
          await fixture.query(
            "SELECT email_verificado FROM usuarios WHERE email=$1",
            [emailB],
          )
        ).rows[0].email_verificado,
        false,
      );
    },
  );
  await check("FALSE: admin desativa usuario e revoga sua sessao", async () => {
    assert.equal(
      (
        await request("/usuarios/" + b.data.usuario.id + "/ativo", {
          token: admin.data.token,
          method: "PUT",
          body: { ativo: false },
        })
      ).status,
      200,
    );
    assert.equal(
      (await request("/auth/me", { token: b.data.token })).status,
      401,
    );
    assert.equal((await login(emailB)).status, 403);
  });
  await check(
    "FALSE: expiracao e logout continuam invalidando acesso",
    async () => {
      const exp = await login(emailA);
      await fixture.query(
        "UPDATE sessoes_refresh SET expires_at=now()-interval '1 second' WHERE session_id=$1",
        [jwt.decode(exp.data.token).sid],
      );
      assert.equal(
        (await request("/auth/me", { token: exp.data.token })).status,
        401,
      );
      assert.equal(
        (await request("/auth/refresh", { body: {}, cookie: exp.cookie }))
          .status,
        401,
      );
      assert.equal(
        (await request("/auth/logout", { body: {}, cookie: a.cookie })).status,
        200,
      );
      assert.equal(
        (await request("/auth/me", { token: a.data.token })).status,
        401,
      );
    },
  );
  await check(
    "FALSE: exclusao propria preserva controles e rate limit de login continua ativo",
    async () => {
      const email = "flag-delete-" + crypto.randomUUID() + "@example.test";
      assert.equal(
        (
          await request("/auth/cadastro", {
            body: { nome: "Excluir fixture", email, senha: password },
          })
        ).status,
        201,
      );
      const own = await login(email);
      assert.equal(own.status, 200);
      assert.equal(
        (
          await request("/usuarios/me", {
            token: own.data.token,
            method: "DELETE",
            body: { confirmacao: "EXCLUIR" },
          })
        ).status,
        200,
      );
      assert.equal(
        (await request("/auth/me", { token: own.data.token })).status,
        401,
      );
      await fixture.query("DELETE FROM limites_requisicao");
      for (let i = 0; i < 8; i++)
        assert.equal((await login(emailA, "senha-errada")).status, 401);
      assert.equal((await login(emailA, "senha-errada")).status, 429);
    },
  );
  console.log(
    total +
      " grupos de feature flag aprovados; FALSE/TRUE/transicoes, SQL real e Resend mock",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await flag(false).catch(() => {});
    if (server) await new Promise((resolve) => server.close(resolve));
    await Promise.all([
      fixture.end(),
      dominio.end(),
      obterPoolAutenticacao().end(),
    ]);
  });
