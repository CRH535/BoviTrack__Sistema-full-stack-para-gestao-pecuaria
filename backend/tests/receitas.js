const assert = require("assert/strict");
const bcrypt = require("bcryptjs");
const { app, pool } = require("../server");
const { dataHojeNoFuso } = require("../utils/validacoes");

const sufixo = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const emailA = `receitas-a-${sufixo}@bovitrack.local`;
const emailB = `receitas-b-${sufixo}@bovitrack.local`;
const senha = "ReceitasTeste#2026";
let servidor;
let baseUrl;
let testesExecutados = 0;

async function requisitar(rota, { metodo = "GET", token, corpo } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (corpo) headers["content-type"] = "application/json";
  const resposta = await fetch(`${baseUrl}${rota}`, {
    method: metodo,
    headers,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return {
    status: resposta.status,
    dados: await resposta.json().catch(() => null),
  };
}

function confirmar(nome, condicao) {
  assert.ok(condicao, nome);
  testesExecutados += 1;
  console.log(`OK ${nome}`);
}

async function login(email, senhaLogin) {
  return requisitar("/auth/login", {
    metodo: "POST",
    corpo: { email, senha: senhaLogin },
  });
}

async function limpar() {
  const emails = [emailA, emailB];
  await pool.query(
    `DELETE FROM receitas WHERE propriedade_id IN (
       SELECT p.id FROM propriedades p JOIN usuarios u ON u.id = p.usuario_id
        WHERE u.email = ANY($1)
     )`,
    [emails],
  ).catch(() => {});
  await pool.query(
    `DELETE FROM despesas WHERE propriedade_id IN (
       SELECT p.id FROM propriedades p JOIN usuarios u ON u.id = p.usuario_id
        WHERE u.email = ANY($1)
     )`,
    [emails],
  ).catch(() => {});
  await pool.query(
    "DELETE FROM propriedades WHERE usuario_id IN (SELECT id FROM usuarios WHERE email = ANY($1))",
    [emails],
  ).catch(() => {});
  await pool.query(
    "DELETE FROM sessoes_refresh WHERE usuario_id IN (SELECT id FROM usuarios WHERE email = ANY($1))",
    [emails],
  ).catch(() => {});
  await pool.query("DELETE FROM usuarios WHERE email = ANY($1)", [emails]).catch(() => {});
}

async function executar() {
  if (process.env.ALLOW_TEST_DB_WRITES !== "true") {
    throw new Error("Defina ALLOW_TEST_DB_WRITES=true somente em um banco isolado de teste");
  }
  if (!process.env.TEST_ADMIN_EMAIL || !process.env.TEST_ADMIN_SENHA) {
    throw new Error("Informe TEST_ADMIN_EMAIL e TEST_ADMIN_SENHA");
  }

  await limpar();
  const hash = await bcrypt.hash(senha, 12);
  await pool.query(
    `INSERT INTO usuarios (nome, email, senha, perfil, ativo)
     VALUES ('Receitas A', $1, $3, 'usuario', TRUE),
            ('Receitas B', $2, $3, 'usuario', TRUE)`,
    [emailA, emailB, hash],
  );

  servidor = app.listen(0);
  await new Promise((resolve) => servidor.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${servidor.address().port}`;

  const [loginA, loginB, loginAdmin] = await Promise.all([
    login(emailA, senha),
    login(emailB, senha),
    login(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_SENHA),
  ]);
  confirmar("logins de teste funcionam", [loginA, loginB, loginAdmin].every((r) => r.status === 200));
  const tokenA = loginA.dados.token;
  const tokenB = loginB.dados.token;
  const tokenAdmin = loginAdmin.dados.token;

  const propriedadeA = await requisitar("/propriedades", {
    metodo: "POST",
    token: tokenA,
    corpo: { nome: "Fazenda Receitas A", cidade: "Teste", estado: "SP", area: 10 },
  });
  const propriedadeB = await requisitar("/propriedades", {
    metodo: "POST",
    token: tokenB,
    corpo: { nome: "Fazenda Receitas B", cidade: "Teste", estado: "SP", area: 10 },
  });
  const idA = propriedadeA.dados.propriedade.id;
  const idB = propriedadeB.dados.propriedade.id;
  // Os filtros financeiros usam APP_TIMEZONE, inclusive na virada do dia UTC.
  const hoje = dataHojeNoFuso();

  await requisitar("/despesas", {
    metodo: "POST",
    token: tokenA,
    corpo: { descricao: "Custo A", categoria: "Teste", valor: 40, data: hoje, propriedade_id: idA },
  });

  const receitaA = await requisitar("/receitas", {
    metodo: "POST",
    token: tokenA,
    corpo: {
      descricao: "Venda de leite A",
      categoria: "Venda de leite",
      valor: 100,
      data: hoje,
      propriedade_id: idA,
      forma_recebimento: " Pix ",
      observacao: "Receita de teste",
    },
  });
  const receitaAntigaA = await requisitar("/receitas", {
    metodo: "POST",
    token: tokenA,
    corpo: { descricao: "Venda antiga A", categoria: "Outros", valor: 50, data: "2000-01-01", propriedade_id: idA },
  });
  const receitaB = await requisitar("/receitas", {
    metodo: "POST",
    token: tokenB,
    corpo: { descricao: "Venda B", categoria: "Venda de animais", valor: 300, data: hoje, propriedade_id: idB },
  });
  confirmar(
    "cadastro aceita campos obrigatórios e opcionais",
    receitaA.status === 201 && receitaA.dados.receita.forma_recebimento === "Pix" &&
      receitaAntigaA.status === 201 && receitaB.status === 201,
  );

  confirmar("valor zero é rejeitado", (await requisitar("/receitas", {
    metodo: "POST", token: tokenA,
    corpo: { descricao: "Inválida", categoria: "Outros", valor: 0, data: hoje, propriedade_id: idA },
  })).status === 400);
  confirmar("usuário não cadastra em propriedade alheia", (await requisitar("/receitas", {
    metodo: "POST", token: tokenA,
    corpo: { descricao: "Ataque", categoria: "Outros", valor: 1, data: hoje, propriedade_id: idB },
  })).status === 404);

  const listaA = await requisitar("/receitas", { token: tokenA });
  confirmar("listagem comum contém somente receitas próprias", listaA.status === 200 && listaA.dados.length === 2 && listaA.dados.every((r) => r.propriedade_id === idA));
  confirmar("GET por ID alheio é bloqueado", (await requisitar(`/receitas/${receitaB.dados.receita.id}`, { token: tokenA })).status === 404);
  confirmar("PUT alheio é bloqueado", (await requisitar(`/receitas/${receitaB.dados.receita.id}`, {
    metodo: "PUT", token: tokenA,
    corpo: { descricao: "Ataque", categoria: "Outros", valor: 1, data: hoje, propriedade_id: idA },
  })).status === 404);
  confirmar("DELETE alheio é bloqueado", (await requisitar(`/receitas/${receitaB.dados.receita.id}`, { metodo: "DELETE", token: tokenA })).status === 404);

  const resumoTodos = await requisitar(`/receitas/resumo?periodo=todos&propriedade_id=${idA}`, { token: tokenA });
  confirmar("lucro líquido usa receitas menos despesas", resumoTodos.status === 200 && resumoTodos.dados.receita_total === 150 && resumoTodos.dados.despesas_totais === 40 && resumoTodos.dados.lucro_liquido === 110);
  const resumoMes = await requisitar(`/receitas/resumo?periodo=mes&propriedade_id=${idA}`, { token: tokenA });
  confirmar("filtro mensal afeta receitas e despesas", resumoMes.dados.receita_total === 100 && resumoMes.dados.despesas_totais === 40 && resumoMes.dados.lucro_liquido === 60);
  const categoria = await requisitar(`/receitas?periodo=todos&categoria=${encodeURIComponent("Venda de leite")}`, { token: tokenA });
  confirmar("filtro por categoria funciona", categoria.status === 200 && categoria.dados.length === 1 && categoria.dados[0].id === receitaA.dados.receita.id);
  const personalizado = await requisitar(`/receitas?periodo=personalizado&data_inicio=${hoje}&data_fim=${hoje}`, { token: tokenA });
  confirmar("período personalizado funciona", personalizado.status === 200 && personalizado.dados.length === 1);

  const editada = await requisitar(`/receitas/${receitaA.dados.receita.id}`, {
    metodo: "PUT", token: tokenA,
    corpo: { descricao: "Venda editada", categoria: "Venda de leite", valor: 120, data: hoje, propriedade_id: idA, forma_recebimento: "Dinheiro", observacao: "Editada" },
  });
  confirmar("edição própria funciona", editada.status === 200 && Number(editada.dados.receita.valor) === 120);
  confirmar("exclusão própria funciona", (await requisitar(`/receitas/${receitaAntigaA.dados.receita.id}`, { metodo: "DELETE", token: tokenA })).status === 200);

  const listaAdmin = await requisitar("/receitas", { token: tokenAdmin });
  confirmar("administrador possui visão global", listaAdmin.status === 200 && listaAdmin.dados.some((r) => r.id === receitaA.dados.receita.id) && listaAdmin.dados.some((r) => r.id === receitaB.dados.receita.id));

  const dashboardA = await requisitar("/dashboard", { token: tokenA });
  confirmar("dashboard inclui receitas e lucro isolados", dashboardA.status === 200 && dashboardA.dados.resumo.total_receitas === 120 && dashboardA.dados.resumo.lucro_liquido === 80);
}

executar()
  .then(() => console.log(`Testes de receitas concluídos: ${testesExecutados}`))
  .catch((erro) => {
    console.error(`Falha nos testes de receitas: ${erro.stack || erro.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await limpar();
    if (servidor) await new Promise((resolve) => servidor.close(resolve));
    await pool.end();
  });
