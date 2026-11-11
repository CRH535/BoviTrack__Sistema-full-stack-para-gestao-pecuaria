require("dotenv").config();

const assert = require("assert/strict");
const { app } = require("../server");
const pool = require("./helpers/bancoFixture");

const sufixo = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const emailA = `leite-a-${sufixo}@bovitrack.local`;
const emailB = `leite-b-${sufixo}@bovitrack.local`;
const senha = "LeiteSeguro#2026";
let servidor;
let baseUrl;
let verificacoes = 0;

function confirmar(nome, condicao) {
  assert.ok(condicao, nome);
  verificacoes += 1;
  console.log(`OK ${nome}`);
}

async function requisitar(rota, { metodo = "GET", token, corpo } = {}) {
  const headers = {};

  if (token) headers.authorization = `Bearer ${token}`;
  if (corpo) headers["content-type"] = "application/json";

  const resposta = await fetch(`${baseUrl}${rota}`, {
    method: metodo,
    headers,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = await resposta.json().catch(() => null);

  return { status: resposta.status, dados };
}

async function login(email, senhaRecebida) {
  return requisitar("/auth/login", {
    metodo: "POST",
    corpo: { email, senha: senhaRecebida },
  });
}

function dataNoFuso(timeZone) {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const valores = Object.fromEntries(
    partes.filter((parte) => parte.type !== "literal").map((parte) => [parte.type, parte.value]),
  );

  return `${valores.year}-${valores.month}-${valores.day}`;
}

function somarDias(data, dias) {
  const [ano, mes, dia] = data.split("-").map(Number);
  const resultado = new Date(Date.UTC(ano, mes - 1, dia + dias));

  return [
    resultado.getUTCFullYear(),
    String(resultado.getUTCMonth() + 1).padStart(2, "0"),
    String(resultado.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

async function limpar() {
  const emails = [emailA, emailB];

  await pool.query(
    `DELETE FROM producoes_leiteiras
      WHERE animal_id IN (
        SELECT a.id
          FROM animais a
          JOIN propriedades p ON p.id = a.propriedade_id
          JOIN usuarios u ON u.id = p.usuario_id
         WHERE u.email = ANY($1)
      )`,
    [emails],
  );
  await pool.query(
    `DELETE FROM animais
      WHERE propriedade_id IN (
        SELECT p.id
          FROM propriedades p
          JOIN usuarios u ON u.id = p.usuario_id
         WHERE u.email = ANY($1)
      )`,
    [emails],
  );
  await pool.query(
    "DELETE FROM propriedades WHERE usuario_id IN (SELECT id FROM usuarios WHERE email = ANY($1))",
    [emails],
  );
  await pool.query("DELETE FROM usuarios WHERE email = ANY($1)", [emails]);
}

async function executar() {
  if (process.env.ALLOW_TEST_DB_WRITES !== "true") {
    throw new Error("Defina ALLOW_TEST_DB_WRITES=true somente em um banco isolado de teste");
  }
  await pool.query("DELETE FROM limites_requisicao WHERE escopo IN ('LOGIN_CONTA', 'LOGIN_IP', 'CADASTRO_IP')");
  servidor = app.listen(0);
  await new Promise((resolve) => servidor.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${servidor.address().port}`;

  const admin = await login(
    process.env.TEST_ADMIN_EMAIL,
    process.env.TEST_ADMIN_SENHA,
  );
  confirmar("login administrativo", admin.status === 200);

  const cadastroA = await requisitar("/auth/cadastro", {
    metodo: "POST",
    corpo: { nome: "Produtor Leite A", email: emailA, senha },
  });
  const cadastroB = await requisitar("/auth/cadastro", {
    metodo: "POST",
    corpo: { nome: "Produtor Leite B", email: emailB, senha },
  });
  confirmar("criação dos usuários de teste", cadastroA.status === 202 && cadastroB.status === 202);
  const { verificarFixture } = require('./helpers/email');
  await verificarFixture(emailA);
  await verificarFixture(emailB);

  const [sessaoA, sessaoB] = await Promise.all([
    login(emailA, senha),
    login(emailB, senha),
  ]);
  const tokenA = sessaoA.dados.token;
  const tokenB = sessaoB.dados.token;
  const tokenAdmin = admin.dados.token;

  const propriedadeA = await requisitar("/propriedades", {
    metodo: "POST",
    token: tokenA,
    corpo: { nome: "Fazenda Leite A", cidade: "Teste", estado: "SP", area: 10 },
  });
  const propriedadeB = await requisitar("/propriedades", {
    metodo: "POST",
    token: tokenB,
    corpo: { nome: "Fazenda Leite B", cidade: "Teste", estado: "MG", area: 12 },
  });
  const animalA = await requisitar("/animais", {
    metodo: "POST",
    token: tokenA,
    corpo: { nome: "Mimosa Leite", especie: "Bovino", raca: "Holandesa", sexo: "F", propriedade_id: propriedadeA.dados.propriedade.id },
  });
  const animalB = await requisitar("/animais", {
    metodo: "POST",
    token: tokenB,
    corpo: { nome: "Estrela Leite", especie: "Bovino", raca: "Jersey", sexo: "F", propriedade_id: propriedadeB.dados.propriedade.id },
  });
  confirmar("animais leiteiros criados", animalA.status === 201 && animalB.status === 201);

  const hoje = dataNoFuso(process.env.APP_TIMEZONE || "America/Sao_Paulo");
  const ontem = somarDias(hoje, -1);
  const rotaA = `/animais/${animalA.dados.animal.id}/producoes-leiteiras`;
  const rotaB = `/animais/${animalB.dados.animal.id}/producoes-leiteiras`;
  const manha = await requisitar(rotaA, {
    metodo: "POST", token: tokenA,
    corpo: { data: hoje, turno: "manha", quantidade_litros: 12.5, observacao: "  Normal  " },
  });
  const tarde = await requisitar(rotaA, {
    metodo: "POST", token: tokenA,
    corpo: { data: hoje, turno: "tarde", quantidade_litros: 10.8 },
  });
  const anterior = await requisitar(rotaA, {
    metodo: "POST", token: tokenA,
    corpo: { data: ontem, turno: "ordenha_unica", quantidade_litros: 9 },
  });
  confirmar("registros de manhã, tarde e dia anterior -> 201", manha.status === 201 && tarde.status === 201 && anterior.status === 201);
  confirmar("data DATE preservada sem deslocamento", manha.dados.producao.data === hoje);
  confirmar("observação normalizada", manha.dados.producao.observacao === "Normal");

  const lista = await requisitar(rotaA, { token: tokenA });
  confirmar("histórico ordena data e turnos", lista.status === 200 && lista.dados.length === 3 && lista.dados[0].turno === "manha" && lista.dados[1].turno === "tarde");
  const resumo = await requisitar(`${rotaA}/resumo`, { token: tokenA });
  confirmar("total diário calculado em 23,3 L", resumo.status === 200 && Math.abs(resumo.dados.resumo.producao_hoje - 23.3) < 0.001);
  confirmar("resumo de 7 e 30 dias calculado", Math.abs(resumo.dados.resumo.producao_7_dias - 32.3) < 0.001 && Math.abs(resumo.dados.resumo.producao_30_dias - 32.3) < 0.001);
  confirmar("evolução soma ordenhas por dia", resumo.dados.evolucao.some((item) => item.data === hoje && Math.abs(item.total_litros - 23.3) < 0.001));

  const hojeFiltrado = await requisitar(`${rotaA}?periodo=hoje`, { token: tokenA });
  const seteDias = await requisitar(`${rotaA}?periodo=7dias`, { token: tokenA });
  const intervalo = await requisitar(`${rotaA}?periodo=todos&data_inicio=${hoje}&data_fim=${hoje}`, { token: tokenA });
  confirmar("filtros hoje, 7 dias e intervalo", hojeFiltrado.dados.length === 2 && seteDias.dados.length === 3 && intervalo.dados.length === 2);

  confirmar("quantidade zero bloqueada", (await requisitar(rotaA, { metodo: "POST", token: tokenA, corpo: { data: hoje, turno: "manha", quantidade_litros: 0 } })).status === 400);
  confirmar("turno inválido bloqueado", (await requisitar(rotaA, { metodo: "POST", token: tokenA, corpo: { data: hoje, turno: "madrugada", quantidade_litros: 1 } })).status === 400);
  confirmar("data inexistente bloqueada", (await requisitar(rotaA, { metodo: "POST", token: tokenA, corpo: { data: "2026-02-30", turno: "manha", quantidade_litros: 1 } })).status === 400);

  const editada = await requisitar(`/producoes-leiteiras/${manha.dados.producao.id}`, {
    metodo: "PUT", token: tokenA,
    corpo: { data: hoje, turno: "manha", quantidade_litros: 13, observacao: "Atualizada" },
  });
  confirmar("edição da produção permitida ao proprietário", editada.status === 200 && Number(editada.dados.producao.quantidade_litros) === 13);

  const producaoB = await requisitar(rotaB, {
    metodo: "POST", token: tokenB,
    corpo: { data: hoje, turno: "noite", quantidade_litros: 5 },
  });
  confirmar("usuário B registra no próprio animal", producaoB.status === 201);
  confirmar("A não lista produção do animal B", (await requisitar(rotaB, { token: tokenA })).status === 404);
  confirmar("A não registra produção no animal B", (await requisitar(rotaB, { metodo: "POST", token: tokenA, corpo: { data: hoje, turno: "manha", quantidade_litros: 2 } })).status === 404);
  confirmar("A não edita produção de B", (await requisitar(`/producoes-leiteiras/${producaoB.dados.producao.id}`, { metodo: "PUT", token: tokenA, corpo: { data: hoje, turno: "noite", quantidade_litros: 9 } })).status === 404);
  confirmar("A não exclui produção de B", (await requisitar(`/producoes-leiteiras/${producaoB.dados.producao.id}`, { metodo: "DELETE", token: tokenA })).status === 404);
  confirmar("admin visualiza produções de A e B", (await requisitar(rotaA, { token: tokenAdmin })).status === 200 && (await requisitar(rotaB, { token: tokenAdmin })).status === 200);
  confirmar("rota sem token permanece protegida", (await requisitar(rotaA)).status === 401);

  const excluida = await requisitar(`/producoes-leiteiras/${tarde.dados.producao.id}`, { metodo: "DELETE", token: tokenA });
  confirmar("exclusão remove apenas o registro leiteiro", excluida.status === 200 && (await requisitar(`/animais/${animalA.dados.animal.id}`, { token: tokenA })).status === 200);

  const animalTemporario = await requisitar("/animais", {
    metodo: "POST", token: tokenA,
    corpo: { nome: "Animal temporário leite", especie: "Bovino", sexo: "F", propriedade_id: propriedadeA.dados.propriedade.id },
  });
  const producaoTemporaria = await requisitar(`/animais/${animalTemporario.dados.animal.id}/producoes-leiteiras`, {
    metodo: "POST", token: tokenA,
    corpo: { data: hoje, turno: "manha", quantidade_litros: 3 },
  });
  await requisitar(`/animais/${animalTemporario.dados.animal.id}`, { metodo: "DELETE", token: tokenA });
  const relacaoRemovida = await pool.query("SELECT 1 FROM producoes_leiteiras WHERE id = $1", [producaoTemporaria.dados.producao.id]);
  confirmar("excluir animal remove produções relacionadas por cascade", relacaoRemovida.rows.length === 0);
}

executar()
  .then(() => console.log(`\n${verificacoes} verificações de controle leiteiro concluídas com sucesso.`))
  .catch((erro) => {
    console.error(`\nFALHA: ${erro.stack || erro.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await limpar().catch((erro) => {
      console.error(`Falha ao limpar teste: ${erro.message}`);
      process.exitCode = 1;
    });

    if (servidor) await new Promise((resolve) => servidor.close(resolve));
    await pool.end();
  });
