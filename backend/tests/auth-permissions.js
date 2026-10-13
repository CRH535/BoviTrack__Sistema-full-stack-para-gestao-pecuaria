require("dotenv").config();

const assert = require("assert/strict");
const bcrypt = require("bcryptjs");
const { app, pool } = require("../server");

const adminEmail = process.env.TEST_ADMIN_EMAIL;
const adminSenha = process.env.TEST_ADMIN_SENHA;
const sufixo = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const emailA = `teste-a-${sufixo}@bovitrack.local`;
const emailB = `teste-b-${sufixo}@bovitrack.local`;
const emailAdminCriado = `teste-admin-criado-${sufixo}@bovitrack.local`;
const senhaUsuario = "TesteSeguro#2026";

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

  const dados = await resposta.json().catch(() => null);
  return { status: resposta.status, dados };
}

function confirmar(nome, condicao) {
  assert.ok(condicao, nome);
  testesExecutados += 1;
  console.log(`OK ${nome}`);
}

async function login(email, senha) {
  return requisitar("/auth/login", {
    metodo: "POST",
    corpo: { email, senha },
  });
}

async function limparDadosTemporarios() {
  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");
    const emails = [emailA, emailB, emailAdminCriado];

    await cliente.query(
      `DELETE FROM vacinacoes
        WHERE animal_id IN (
          SELECT a.id
            FROM animais a
            JOIN propriedades p ON p.id = a.propriedade_id
            JOIN usuarios u ON u.id = p.usuario_id
           WHERE u.email = ANY($1)
        )`,
      [emails],
    );
    await cliente.query(
      `DELETE FROM animais_lotes
        WHERE animal_id IN (
          SELECT a.id
            FROM animais a
            JOIN propriedades p ON p.id = a.propriedade_id
            JOIN usuarios u ON u.id = p.usuario_id
           WHERE u.email = ANY($1)
        )`,
      [emails],
    );
    await cliente.query(
      `DELETE FROM despesas
        WHERE propriedade_id IN (
          SELECT p.id FROM propriedades p
          JOIN usuarios u ON u.id = p.usuario_id
          WHERE u.email = ANY($1)
        )`,
      [emails],
    );
    await cliente.query(
      `DELETE FROM lotes
        WHERE propriedade_id IN (
          SELECT p.id FROM propriedades p
          JOIN usuarios u ON u.id = p.usuario_id
          WHERE u.email = ANY($1)
        )`,
      [emails],
    );
    await cliente.query(
      `DELETE FROM animais
        WHERE propriedade_id IN (
          SELECT p.id FROM propriedades p
          JOIN usuarios u ON u.id = p.usuario_id
          WHERE u.email = ANY($1)
        )`,
      [emails],
    );
    await cliente.query(
      `DELETE FROM vacinas
        WHERE usuario_id IN (SELECT id FROM usuarios WHERE email = ANY($1))`,
      [emails],
    );
    await cliente.query(
      `DELETE FROM propriedades
        WHERE usuario_id IN (SELECT id FROM usuarios WHERE email = ANY($1))`,
      [emails],
    );
    await cliente.query("DELETE FROM usuarios WHERE email = ANY($1)", [emails]);
    await cliente.query("COMMIT");
  } catch (erro) {
    await cliente.query("ROLLBACK");
    throw erro;
  } finally {
    cliente.release();
  }
}

async function executar() {
  if (process.env.ALLOW_TEST_DB_WRITES !== "true") {
    throw new Error("Defina ALLOW_TEST_DB_WRITES=true somente em um banco isolado de teste");
  }
  if (!adminEmail || !adminSenha) {
    throw new Error("Informe TEST_ADMIN_EMAIL e TEST_ADMIN_SENHA");
  }

  servidor = app.listen(0);
  await new Promise((resolve) => servidor.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${servidor.address().port}`;
  await pool.query("DELETE FROM limites_requisicao WHERE escopo IN ('LOGIN_CONTA', 'LOGIN_IP', 'LOGIN_ADMIN', 'CADASTRO_IP', 'REFRESH_SESSAO_IP')");

  const adminLogin = await login(adminEmail, adminSenha);
  confirmar("admin + senha correta -> 200", adminLogin.status === 200);
  const tokenAdmin = adminLogin.dados.token;
  const dashboardInicial = await requisitar("/dashboard", { token: tokenAdmin });

  const cadastroA = await requisitar("/auth/cadastro", {
    metodo: "POST",
    corpo: {
      nome: "Usuário A",
      email: emailA,
      senha: senhaUsuario,
      perfil: "admin",
      ativo: false,
    },
  });
  const cadastroB = await requisitar("/auth/cadastro", {
    metodo: "POST",
    corpo: { nome: "Usuário B", email: emailB, senha: senhaUsuario },
  });
  confirmar("cadastro público responde genericamente -> 202", cadastroA.status === 202 && cadastroB.status === 202);
  confirmar("cadastro público não expõe o usuário criado", cadastroA.dados.usuario === undefined && cadastroB.dados.usuario === undefined);

  const usuariosCriados = await pool.query(
    "SELECT id, email, perfil, ativo FROM usuarios WHERE email = ANY($1::text[]) ORDER BY email",
    [[emailA, emailB]],
  );
  const usuarioA = usuariosCriados.rows.find((usuario) => usuario.email === emailA);
  const usuarioB = usuariosCriados.rows.find((usuario) => usuario.email === emailB);
  confirmar("cadastro público ignora perfil admin", usuarioA?.perfil === "usuario");
  confirmar("cadastro público ignora ativo false", usuarioA?.ativo === true);

  const quantidadeAdmins = await pool.query(
    "SELECT COUNT(*) AS total FROM usuarios WHERE perfil = 'admin'",
  );
  confirmar("tentativa pública não cria segundo admin", Number(quantidadeAdmins.rows[0].total) === 1);

  const senhaArmazenada = await pool.query(
    "SELECT senha FROM usuarios WHERE email = $1",
    [emailA],
  );
  confirmar(
    "senha pública é armazenada somente como hash bcrypt",
    senhaArmazenada.rows[0].senha !== senhaUsuario &&
      (await bcrypt.compare(senhaUsuario, senhaArmazenada.rows[0].senha)),
  );

  confirmar("cadastro público duplicado mantém resposta genérica -> 202", (await requisitar("/auth/cadastro", { metodo: "POST", corpo: { nome: "Duplicado", email: emailA, senha: senhaUsuario } })).status === 202);
  await pool.query("DELETE FROM limites_requisicao WHERE escopo = 'CADASTRO_IP'");
  confirmar("cadastro público rejeita email inválido -> 400", (await requisitar("/auth/cadastro", { metodo: "POST", corpo: { nome: "Inválido", email: "email-invalido", senha: senhaUsuario } })).status === 400);
  confirmar("cadastro público rejeita senha curta -> 400", (await requisitar("/auth/cadastro", { metodo: "POST", corpo: { nome: "Inválido", email: `curta-${sufixo}@teste.local`, senha: "1234567" } })).status === 400);
  confirmar("cadastro público rejeita nome vazio -> 400", (await requisitar("/auth/cadastro", { metodo: "POST", corpo: { nome: " ", email: `vazio-${sufixo}@teste.local`, senha: senhaUsuario } })).status === 400);

  const cadastroAdministrativo = await requisitar("/usuarios", {
    metodo: "POST",
    token: tokenAdmin,
    corpo: {
      nome: "Usuário Administrativo",
      email: emailAdminCriado,
      senha: senhaUsuario,
      perfil: "admin",
    },
  });
  confirmar("área administrativa continua criando usuário comum", cadastroAdministrativo.status === 201 && cadastroAdministrativo.dados.usuario.perfil === "usuario");

  const loginA = await login(emailA, senhaUsuario);
  const loginB = await login(emailB, senhaUsuario);
  confirmar("usuário + senha correta -> 200", loginA.status === 200 && loginB.status === 200);
  let tokenA = loginA.dados.token;
  const tokenB = loginB.dados.token;

  const tentativaPrivilegio = await requisitar("/usuarios/me", {
    metodo: "PUT",
    token: tokenA,
    corpo: {
      nome: "Usuário A Atualizado",
      email: emailA,
      perfil: "admin",
    },
  });
  confirmar("edicao propria rejeita campos de privilegio", tentativaPrivilegio.status === 400);
  const edicaoPropriaA = await requisitar("/usuarios/me", {
    metodo: "PUT", token: tokenA, corpo: { nome: "Usuário A Atualizado", email: emailA },
  });
  confirmar(
    "usuário atualiza somente nome/email da própria conta",
    edicaoPropriaA.status === 200 &&
      edicaoPropriaA.dados.usuario.nome === "Usuário A Atualizado" &&
      edicaoPropriaA.dados.usuario.perfil === "usuario",
  );

  const dashboardNovoA = await requisitar("/dashboard", { token: tokenA });
  confirmar(
    "Dashboard de conta nova carrega zerado",
    dashboardNovoA.status === 200 &&
      Object.values(dashboardNovoA.dados.resumo).every((valor) => valor === 0) &&
      dashboardNovoA.dados.proximas_vacinacoes.length === 0,
  );

  confirmar("POST /usuarios sem token -> 401", (await requisitar("/usuarios", { metodo: "POST", corpo: { nome: "Ataque", email: `ataque-${sufixo}@teste.local`, senha: senhaUsuario } })).status === 401);
  confirmar("usuário comum tenta POST /usuarios -> 403", (await requisitar("/usuarios", { metodo: "POST", token: tokenA, corpo: { nome: "Ataque", email: `ataque-${sufixo}@teste.local`, senha: senhaUsuario, perfil: "admin" } })).status === 403);
  confirmar("email duplicado administrativo -> 409", (await requisitar("/usuarios", { metodo: "POST", token: tokenAdmin, corpo: { nome: "Duplicado", email: emailA, senha: senhaUsuario } })).status === 409);

  const usuarioBPorId = await requisitar(`/usuarios/${usuarioB.id}`, { token: tokenAdmin });
  confirmar("admin busca usuário por ID", usuarioBPorId.status === 200 && usuarioBPorId.dados.email === emailB);

  const tentativaAdmin = await requisitar(`/usuarios/${usuarioB.id}`, {
    metodo: "PUT", token: tokenAdmin,
    corpo: { nome: "Usuário B Editado", email: emailB, perfil: "admin", senha: "nao-deve-alterar" },
  });
  confirmar("edicao administrativa rejeita perfil e senha", tentativaAdmin.status === 400);
  const edicaoB = await requisitar(`/usuarios/${usuarioB.id}`, {
    metodo: "PUT", token: tokenAdmin, corpo: { nome: "Usuário B Editado", email: emailB },
  });
  confirmar("admin edita somente nome/email", edicaoB.status === 200 && edicaoB.dados.usuario.nome === "Usuário B Editado" && edicaoB.dados.usuario.perfil === "usuario");
  confirmar("edição com email de outro usuário -> 409", (await requisitar(`/usuarios/${usuarioB.id}`, { metodo: "PUT", token: tokenAdmin, corpo: { nome: "Usuário B", email: emailA } })).status === 409);

  confirmar("usuário comum tenta GET /usuarios -> 403", (await requisitar("/usuarios", { token: tokenA })).status === 403);
  confirmar("usuário comum tenta GET /usuarios/:id -> 403", (await requisitar(`/usuarios/${usuarioB.id}`, { token: tokenA })).status === 403);
  confirmar("usuário comum tenta PUT /usuarios/:id -> 403", (await requisitar(`/usuarios/${usuarioB.id}`, { metodo: "PUT", token: tokenA, corpo: { nome: "Ataque", email: emailB } })).status === 403);
  confirmar("usuário comum tenta desativar outro -> 403", (await requisitar(`/usuarios/${usuarioB.id}/ativo`, { metodo: "PUT", token: tokenA, corpo: { ativo: false } })).status === 403);
  confirmar("usuário comum tenta DELETE /usuarios/:id -> 403", (await requisitar(`/usuarios/${usuarioB.id}`, { metodo: "DELETE", token: tokenA })).status === 403);

  confirmar("senha errada -> 401", (await login(emailA, "senha-errada")).status === 401);
  confirmar("usuário inexistente -> 401", (await login(`inexistente-${sufixo}@teste.local`, senhaUsuario)).status === 401);
  confirmar("sem token -> 401", (await requisitar("/dashboard")).status === 401);
  confirmar("token inválido -> 401", (await requisitar("/dashboard", { token: "token.invalido" })).status === 401);

  async function criarConjunto(token, letra, valor) {
    const proximaDose = new Date();
    proximaDose.setDate(proximaDose.getDate() + 3);
    const propriedade = await requisitar("/propriedades", {
      metodo: "POST", token,
      corpo: { nome: `Fazenda ${letra}`, cidade: "Teste", estado: "SP", area: 10 },
    });
    const propriedadeId = propriedade.dados.propriedade.id;
    const animal = await requisitar("/animais", {
      metodo: "POST", token,
      corpo: { nome: `Animal ${letra}`, especie: "Bovino", sexo: "F", peso: 100, propriedade_id: propriedadeId },
    });
    const lote = await requisitar("/lotes", {
      metodo: "POST", token,
      corpo: { nome: `Lote ${letra}`, propriedade_id: propriedadeId },
    });
    const vacina = await requisitar("/vacinas", {
      metodo: "POST", token,
      corpo: { nome: `Vacina ${letra}`, descricao: "Teste" },
    });
    const despesa = await requisitar("/despesas", {
      metodo: "POST", token,
      corpo: { descricao: `Despesa ${letra}`, categoria: "Teste", valor, data: new Date().toISOString().slice(0, 10), propriedade_id: propriedadeId },
    });
    const vacinacao = await requisitar("/vacinacoes", {
      metodo: "POST", token,
      corpo: {
        animal_id: animal.dados.animal.id,
        vacina_id: vacina.dados.vacina.id,
        data_aplicacao: new Date().toISOString().slice(0, 10),
        proxima_dose: proximaDose.toISOString().slice(0, 10),
      },
    });
    confirmar(`conjunto ${letra} criado`, [propriedade, animal, lote, vacina, despesa, vacinacao].every((r) => r.status === 201));
    return {
      propriedade: propriedade.dados.propriedade,
      animal: animal.dados.animal,
      lote: lote.dados.lote,
      vacina: vacina.dados.vacina,
      vacinacao: vacinacao.dados.vacinacao,
      despesa: despesa.dados.despesa,
    };
  }

  const conjuntoA = await criarConjunto(tokenA, "A", 10);
  const conjuntoB = await criarConjunto(tokenB, "B", 20);

  const propriedadeANoBanco = await pool.query(
    "SELECT usuario_id FROM propriedades WHERE id = $1",
    [conjuntoA.propriedade.id],
  );
  confirmar(
    "primeira propriedade fica vinculada ao usuário do JWT",
    propriedadeANoBanco.rows[0].usuario_id === usuarioA.id,
  );

  const listaA = await requisitar("/propriedades", { token: tokenA });
  const listaB = await requisitar("/propriedades", { token: tokenB });
  const listaAdmin = await requisitar("/propriedades", { token: tokenAdmin });
  confirmar("USUARIO_A vê apenas propriedade A", listaA.dados.length === 1 && listaA.dados[0].id === conjuntoA.propriedade.id);
  confirmar("USUARIO_B vê apenas propriedade B", listaB.dados.length === 1 && listaB.dados[0].id === conjuntoB.propriedade.id);
  confirmar("ADMIN vê registros de A e B", listaAdmin.dados.some((p) => p.id === conjuntoA.propriedade.id) && listaAdmin.dados.some((p) => p.id === conjuntoB.propriedade.id));
  confirmar(
    "usuário comum não recebe dados do proprietário",
    !Object.prototype.hasOwnProperty.call(listaA.dados[0], "proprietario"),
  );

  const propriedadeAParaAdmin = listaAdmin.dados.find(
    (propriedade) => propriedade.id === conjuntoA.propriedade.id,
  );
  const propriedadeBParaAdmin = listaAdmin.dados.find(
    (propriedade) => propriedade.id === conjuntoB.propriedade.id,
  );
  confirmar(
    "admin recebe o proprietário correto de cada propriedade",
    propriedadeAParaAdmin?.proprietario?.id === usuarioA.id &&
      propriedadeAParaAdmin.proprietario.email === emailA &&
      propriedadeBParaAdmin?.proprietario?.id === usuarioB.id &&
      propriedadeBParaAdmin.proprietario.email === emailB,
  );
  confirmar(
    "resposta de propriedades não expõe senha ou sessão",
    [propriedadeAParaAdmin, propriedadeBParaAdmin].every(
      (propriedade) =>
        !Object.prototype.hasOwnProperty.call(propriedade.proprietario, "senha") &&
        !Object.prototype.hasOwnProperty.call(propriedade.proprietario, "token") &&
        !Object.prototype.hasOwnProperty.call(propriedade.proprietario, "sessao"),
    ),
  );

  const detalhePropriedadeAUsuario = await requisitar(
    `/propriedades/${conjuntoA.propriedade.id}`,
    { token: tokenA },
  );
  const detalhePropriedadeAAdmin = await requisitar(
    `/propriedades/${conjuntoA.propriedade.id}`,
    { token: tokenAdmin },
  );
  confirmar(
    "detalhe comum não recebe proprietário",
    detalhePropriedadeAUsuario.status === 200 &&
      !Object.prototype.hasOwnProperty.call(
        detalhePropriedadeAUsuario.dados,
        "proprietario",
      ),
  );
  confirmar(
    "detalhe admin recebe proprietário",
    detalhePropriedadeAAdmin.status === 200 &&
      detalhePropriedadeAAdmin.dados.proprietario.id === usuarioA.id &&
      detalhePropriedadeAAdmin.dados.proprietario.email === emailA,
  );

  const previewPropriedadeA = await requisitar(
    `/propriedades/${conjuntoA.propriedade.id}/exclusao-preview`,
    { token: tokenA },
  );
  confirmar(
    "preview da propriedade lista dependências sem excluir dados",
    previewPropriedadeA.status === 200 &&
      previewPropriedadeA.dados.entidade.id === conjuntoA.propriedade.id &&
      previewPropriedadeA.dados.resumo.animais === 1 &&
      previewPropriedadeA.dados.resumo.lotes === 1 &&
      previewPropriedadeA.dados.resumo.vacinacoes === 1 &&
      previewPropriedadeA.dados.resumo.despesas === 1 &&
      (await requisitar(`/propriedades/${conjuntoA.propriedade.id}`, {
        token: tokenA,
      })).status === 200,
  );
  confirmar(
    "usuário comum não consulta preview de propriedade alheia",
    (await requisitar(
      `/propriedades/${conjuntoB.propriedade.id}/exclusao-preview`,
      { token: tokenA },
    )).status === 404,
  );
  confirmar(
    "administrador consulta preview de propriedade autorizada",
    (await requisitar(
      `/propriedades/${conjuntoB.propriedade.id}/exclusao-preview`,
      { token: tokenAdmin },
    )).status === 200,
  );
  confirmar(
    "usuário comum consulta somente o preview da própria conta",
    (await requisitar("/usuarios/me/exclusao-preview", { token: tokenA }))
      .status === 200 &&
      (await requisitar(`/usuarios/${usuarioB.id}/exclusao-preview`, {
        token: tokenA,
      })).status === 403,
  );
  confirmar(
    "administrador consulta impacto de usuário comum e não da própria conta",
    (await requisitar(`/usuarios/${usuarioB.id}/exclusao-preview`, {
      token: tokenAdmin,
    })).status === 200 &&
      (await requisitar(
        `/usuarios/${adminLogin.dados.usuario.id}/exclusao-preview`,
        { token: tokenAdmin },
      )).status === 403,
  );

  for (const [rota, campo, idA] of [
    ["/animais", "id", conjuntoA.animal.id],
    ["/lotes", "id", conjuntoA.lote.id],
    ["/vacinas", "id", conjuntoA.vacina.id],
    ["/vacinacoes", "id", conjuntoA.vacinacao.id],
    ["/despesas", "descricao", "Despesa A"],
  ]) {
    const resposta = await requisitar(rota, { token: tokenA });
    confirmar(`lista ${rota} isolada para A`, resposta.dados.length === 1 && resposta.dados[0][campo] === idA);
  }

  confirmar("A tenta GET de propriedade B -> 404", (await requisitar(`/propriedades/${conjuntoB.propriedade.id}`, { token: tokenA })).status === 404);
  confirmar("A tenta PUT de propriedade B -> 404", (await requisitar(`/propriedades/${conjuntoB.propriedade.id}`, { metodo: "PUT", token: tokenA, corpo: { nome: "Ataque", cidade: "Teste", estado: "SP", area: 20 } })).status === 404);
  confirmar("A tenta DELETE de propriedade B -> 404", (await requisitar(`/propriedades/${conjuntoB.propriedade.id}`, { metodo: "DELETE", token: tokenA })).status === 404);

  confirmar("A tenta GET de animal B -> 404", (await requisitar(`/animais/${conjuntoB.animal.id}`, { token: tokenA })).status === 404);
  confirmar("A tenta PUT de animal B -> bloqueado", (await requisitar(`/animais/${conjuntoB.animal.id}`, { metodo: "PUT", token: tokenA, corpo: { nome: "Ataque", especie: "Bovino", sexo: "F", peso: 100, propriedade_id: conjuntoA.propriedade.id } })).status === 404);
  confirmar("A tenta DELETE de animal B -> 404", (await requisitar(`/animais/${conjuntoB.animal.id}`, { metodo: "DELETE", token: tokenA })).status === 404);
  confirmar("A tenta usar propriedade B -> 404", (await requisitar("/animais", { metodo: "POST", token: tokenA, corpo: { nome: "Ataque", especie: "Bovino", sexo: "M", propriedade_id: conjuntoB.propriedade.id } })).status === 404);
  confirmar("A tenta relacionar com lote B -> 404", (await requisitar(`/lotes/${conjuntoB.lote.id}/animais`, { metodo: "POST", token: tokenA, corpo: { animal_id: conjuntoA.animal.id } })).status === 404);
  confirmar("A tenta relacionar animal B com lote A -> 404", (await requisitar(`/lotes/${conjuntoA.lote.id}/animais`, { metodo: "POST", token: tokenA, corpo: { animal_id: conjuntoB.animal.id } })).status === 404);
  confirmar("A tenta usar vacina B -> 404", (await requisitar("/vacinacoes", { metodo: "POST", token: tokenA, corpo: { animal_id: conjuntoA.animal.id, vacina_id: conjuntoB.vacina.id, data_aplicacao: new Date().toISOString().slice(0, 10) } })).status === 404);

  confirmar("relação animal-lote do próprio usuário -> 201", (await requisitar(`/lotes/${conjuntoA.lote.id}/animais`, { metodo: "POST", token: tokenA, corpo: { animal_id: conjuntoA.animal.id } })).status === 201);
  confirmar("associação duplicada recebe bloqueio amigável", (await requisitar(`/lotes/${conjuntoA.lote.id}/animais`, { metodo: "POST", token: tokenA, corpo: { animal_id: conjuntoA.animal.id } })).status === 400);
  confirmar("A não consulta animais do lote B", (await requisitar(`/lotes/${conjuntoB.lote.id}/animais`, { token: tokenA })).status === 404);
  confirmar("A não consulta lotes do animal B", (await requisitar(`/animais/${conjuntoB.animal.id}/lotes`, { token: tokenA })).status === 404);
  confirmar("A não consulta vacinações do animal B", (await requisitar(`/animais/${conjuntoB.animal.id}/vacinacoes`, { token: tokenA })).status === 404);
  confirmar("A não consulta despesas da propriedade B", (await requisitar(`/propriedades/${conjuntoB.propriedade.id}/despesas`, { token: tokenA })).status === 404);
  confirmar("A não consulta resumo financeiro de B", (await requisitar(`/propriedades/${conjuntoB.propriedade.id}/despesas/resumo`, { token: tokenA })).status === 404);

  const resumoFinanceiroA = await requisitar(`/propriedades/${conjuntoA.propriedade.id}/despesas/resumo`, { token: tokenA });
  confirmar("resumo financeiro A contém somente R$ 10", resumoFinanceiroA.status === 200 && Number(resumoFinanceiroA.dados.resumo.total) === 10);
  const proximasA = await requisitar("/vacinacoes/proximas?periodo=semana", { token: tokenA });
  confirmar("alertas A contêm somente vacinação A", proximasA.status === 200 && proximasA.dados.length === 1 && proximasA.dados[0].id === conjuntoA.vacinacao.id);

  const dashboardA = await requisitar("/dashboard", { token: tokenA });
  const dashboardB = await requisitar("/dashboard", { token: tokenB });
  const dashboardAdmin = await requisitar("/dashboard", { token: tokenAdmin });
  confirmar("Dashboard A contém somente dados de A", dashboardA.dados.resumo.propriedades === 1 && dashboardA.dados.resumo.animais === 1 && dashboardA.dados.resumo.total_despesas === 10 && dashboardA.dados.proximas_vacinacoes.length === 1);
  confirmar("Dashboard B contém somente dados de B", dashboardB.dados.resumo.propriedades === 1 && dashboardB.dados.resumo.animais === 1 && dashboardB.dados.resumo.total_despesas === 20 && dashboardB.dados.proximas_vacinacoes.length === 1);
  confirmar("Dashboard admin soma A e B", dashboardAdmin.dados.resumo.propriedades === dashboardInicial.dados.resumo.propriedades + 2 && dashboardAdmin.dados.resumo.total_despesas === dashboardInicial.dados.resumo.total_despesas + 30);

  confirmar(
    "despesa sem forma de pagamento continua funcionando",
    conjuntoA.despesa.forma_pagamento === null,
  );

  const hoje = new Date().toISOString().slice(0, 10);
  const despesaPix = await requisitar("/despesas", {
    metodo: "POST",
    token: tokenA,
    corpo: {
      descricao: "Compra de ração",
      categoria: "Ração",
      forma_pagamento: "   Pix   ",
      valor: 850,
      data: hoje,
      propriedade_id: conjuntoA.propriedade.id,
    },
  });
  confirmar(
    "cadastro de despesa remove espaços da forma de pagamento",
    despesaPix.status === 201 &&
      despesaPix.dados.despesa.forma_pagamento === "Pix",
  );

  const despesaTextoLivre = await requisitar("/despesas", {
    metodo: "POST",
    token: tokenA,
    corpo: {
      descricao: "Compra parcelada",
      categoria: "Equipamentos",
      forma_pagamento: "Cartão de crédito em 3x",
      valor: 300,
      data: hoje,
      propriedade_id: conjuntoA.propriedade.id,
    },
  });
  confirmar(
    "forma de pagamento aceita e preserva texto livre",
    despesaTextoLivre.status === 201 &&
      despesaTextoLivre.dados.despesa.forma_pagamento ===
        "Cartão de crédito em 3x",
  );

  const despesaEditada = await requisitar(
    `/despesas/${despesaPix.dados.despesa.id}`,
    {
      metodo: "PUT",
      token: tokenA,
      corpo: {
        descricao: "Compra de ração",
        categoria: "Ração",
        forma_pagamento: "Dinheiro",
        valor: 850,
        data: hoje,
        propriedade_id: conjuntoA.propriedade.id,
      },
    },
  );
  confirmar(
    "edição altera a forma de pagamento",
    despesaEditada.status === 200 &&
      despesaEditada.dados.despesa.forma_pagamento === "Dinheiro",
  );

  const despesaSemForma = await requisitar(
    `/despesas/${despesaPix.dados.despesa.id}`,
    {
      metodo: "PUT",
      token: tokenA,
      corpo: {
        descricao: "Compra de ração",
        categoria: "Ração",
        forma_pagamento: "   ",
        valor: 850,
        data: hoje,
        propriedade_id: conjuntoA.propriedade.id,
      },
    },
  );
  confirmar(
    "apagar a forma de pagamento salva NULL sem excluir a despesa",
    despesaSemForma.status === 200 &&
      despesaSemForma.dados.despesa.forma_pagamento === null,
  );

  const despesaConsultada = await requisitar(
    `/despesas/${despesaTextoLivre.dados.despesa.id}`,
    { token: tokenA },
  );
  confirmar(
    "GET /despesas/:id retorna a forma de pagamento",
    despesaConsultada.status === 200 &&
      despesaConsultada.dados.forma_pagamento === "Cartão de crédito em 3x",
  );

  const despesasAComForma = await requisitar("/despesas", { token: tokenA });
  confirmar(
    "GET /despesas retorna formas preenchidas e nulas",
    despesasAComForma.status === 200 &&
      despesasAComForma.dados.some(
        (despesa) =>
          despesa.id === despesaTextoLivre.dados.despesa.id &&
          despesa.forma_pagamento === "Cartão de crédito em 3x",
      ) &&
      despesasAComForma.dados.some(
        (despesa) =>
          despesa.id === despesaPix.dados.despesa.id &&
          despesa.forma_pagamento === null,
      ),
  );

  const despesasDaPropriedade = await requisitar(
    `/propriedades/${conjuntoA.propriedade.id}/despesas`,
    { token: tokenA },
  );
  confirmar(
    "listagem financeira por propriedade inclui forma de pagamento",
    despesasDaPropriedade.status === 200 &&
      despesasDaPropriedade.dados.some(
        (despesa) =>
          despesa.id === despesaTextoLivre.dados.despesa.id &&
          despesa.forma_pagamento === "Cartão de crédito em 3x",
      ),
  );

  const resumoDepoisDaForma = await requisitar(
    `/propriedades/${conjuntoA.propriedade.id}/despesas/resumo`,
    { token: tokenA },
  );
  const categoriaRacao = resumoDepoisDaForma.dados.categorias.find(
    (categoria) => categoria.categoria === "Ração",
  );
  confirmar(
    "resumo financeiro mantém total, média, maior, menor e quantidade",
    resumoDepoisDaForma.status === 200 &&
      Number(resumoDepoisDaForma.dados.resumo.total) === 1160 &&
      Number(resumoDepoisDaForma.dados.resumo.media) === 386.67 &&
      Number(resumoDepoisDaForma.dados.resumo.maior) === 850 &&
      Number(resumoDepoisDaForma.dados.resumo.menor) === 10 &&
      Number(resumoDepoisDaForma.dados.resumo.quantidade) === 3,
  );
  confirmar(
    "totais por categoria permanecem corretos",
    Number(categoriaRacao.total) === 850 &&
      Number(categoriaRacao.media) === 850 &&
      Number(categoriaRacao.quantidade) === 1,
  );

  const despesasBDepoisDasNovas = await requisitar("/despesas", {
    token: tokenB,
  });
  const despesasAdminDepoisDasNovas = await requisitar("/despesas", {
    token: tokenAdmin,
  });
  confirmar(
    "usuário B não visualiza novas despesas de A",
    despesasBDepoisDasNovas.dados.length === 1 &&
      !despesasBDepoisDasNovas.dados.some(
        (despesa) => despesa.id === despesaTextoLivre.dados.despesa.id,
      ),
  );
  confirmar(
    "administrador visualiza despesas de A e B com a nova informação",
    despesasAdminDepoisDasNovas.dados.some(
      (despesa) => despesa.id === despesaTextoLivre.dados.despesa.id,
    ) &&
      despesasAdminDepoisDasNovas.dados.some(
        (despesa) => despesa.id === conjuntoB.despesa.id,
      ),
  );

  confirmar(
    "forma de pagamento acima de 100 caracteres -> 400",
    (await requisitar("/despesas", {
      metodo: "POST",
      token: tokenA,
      corpo: {
        descricao: "Forma extensa",
        categoria: "Teste",
        forma_pagamento: "x".repeat(101),
        valor: 1,
        data: hoje,
        propriedade_id: conjuntoA.propriedade.id,
      },
    })).status === 400,
  );

  confirmar(
    "animal sem brinco e nascimento continua funcionando",
    conjuntoA.animal.numero_brinco === null &&
      conjuntoA.animal.data_nascimento === null,
  );

  const animalCompleto = await requisitar("/animais", {
    metodo: "POST",
    token: tokenA,
    corpo: {
      nome: "Mimosa Completa",
      numero_brinco: "  00125  ",
      data_nascimento: "2023-04-15",
      especie: "Bovino",
      raca: "Nelore",
      sexo: "F",
      peso: 420,
      propriedade_id: conjuntoA.propriedade.id,
    },
  });
  confirmar(
    "animal completo preserva zeros, remove espaços e salva nascimento",
    animalCompleto.status === 201 &&
      animalCompleto.dados.animal.numero_brinco === "00125" &&
      animalCompleto.dados.animal.data_nascimento === "2023-04-15",
  );

  const brincoDuplicado = await requisitar("/animais", {
    metodo: "POST",
    token: tokenA,
    corpo: {
      nome: "Brinco duplicado",
      numero_brinco: "00125",
      especie: "Bovino",
      sexo: "F",
      propriedade_id: conjuntoA.propriedade.id,
    },
  });
  confirmar("brinco duplicado na mesma propriedade -> 409", brincoDuplicado.status === 409);

  const mesmoBrincoOutraPropriedade = await requisitar("/animais", {
    metodo: "POST",
    token: tokenB,
    corpo: {
      nome: "Mesmo brinco em outra fazenda",
      numero_brinco: "00125",
      especie: "Bovino",
      sexo: "M",
      propriedade_id: conjuntoB.propriedade.id,
    },
  });
  confirmar(
    "mesmo brinco em propriedades diferentes é permitido",
    mesmoBrincoOutraPropriedade.status === 201,
  );

  confirmar(
    "data de nascimento futura -> 400",
    (await requisitar("/animais", {
      metodo: "POST",
      token: tokenA,
      corpo: {
        nome: "Nascimento futuro",
        data_nascimento: "2999-01-01",
        especie: "Bovino",
        sexo: "F",
        propriedade_id: conjuntoA.propriedade.id,
      },
    })).status === 400,
  );
  confirmar(
    "data inexistente no calendário -> 400",
    (await requisitar("/animais", {
      metodo: "POST",
      token: tokenA,
      corpo: {
        nome: "Data inválida",
        data_nascimento: "2025-02-30",
        especie: "Bovino",
        sexo: "F",
        propriedade_id: conjuntoA.propriedade.id,
      },
    })).status === 400,
  );

  const animalEditadoComNovosCampos = await requisitar(
    `/animais/${conjuntoA.animal.id}`,
    {
      metodo: "PUT",
      token: tokenA,
      corpo: {
        nome: conjuntoA.animal.nome,
        numero_brinco: "00042",
        data_nascimento: "2020-02-29",
        especie: conjuntoA.animal.especie,
        raca: conjuntoA.animal.raca,
        sexo: conjuntoA.animal.sexo,
        peso: 105,
        propriedade_id: conjuntoA.propriedade.id,
      },
    },
  );
  confirmar(
    "edição adiciona brinco e nascimento ao animal existente",
    animalEditadoComNovosCampos.status === 200 &&
      animalEditadoComNovosCampos.dados.animal.numero_brinco === "00042" &&
      animalEditadoComNovosCampos.dados.animal.data_nascimento === "2020-02-29",
  );

  const animalParaEditar = Object.fromEntries(
    ["nome", "numero_brinco", "data_nascimento", "especie", "raca", "sexo", "peso", "propriedade_id", "mae_id"]
      .map((campo) => [campo, animalEditadoComNovosCampos.dados.animal[campo]]),
  );

  confirmar(
    "edição ignora o próprio animal na validação do brinco",
    (await requisitar(`/animais/${conjuntoA.animal.id}`, {
      metodo: "PUT",
      token: tokenA,
      corpo: {
        ...animalParaEditar,
        peso: 110,
      },
    })).status === 200,
  );

  confirmar(
    "edição bloqueia brinco pertencente a outro animal da propriedade",
    (await requisitar(`/animais/${conjuntoA.animal.id}`, {
      metodo: "PUT",
      token: tokenA,
      corpo: {
        ...animalParaEditar,
        numero_brinco: "00125",
      },
    })).status === 409,
  );

  const animalCompletoConsultado = await requisitar(
    `/animais/${animalCompleto.dados.animal.id}`,
    { token: tokenA },
  );
  confirmar(
    "GET por ID retorna brinco e data sem deslocamento de fuso",
    animalCompletoConsultado.status === 200 &&
      animalCompletoConsultado.dados.numero_brinco === "00125" &&
      animalCompletoConsultado.dados.data_nascimento === "2023-04-15",
  );
  const listaComNovosCampos = await requisitar("/animais", { token: tokenA });
  const animalCompletoNaLista = listaComNovosCampos.dados.find(
    (animal) => animal.id === animalCompleto.dados.animal.id,
  );
  confirmar(
    "GET /animais retorna brinco e data de nascimento",
    listaComNovosCampos.status === 200 &&
      animalCompletoNaLista.numero_brinco === "00125" &&
      animalCompletoNaLista.data_nascimento === "2023-04-15",
  );

  const animaisIniciaisLoteA = await requisitar(`/lotes/${conjuntoA.lote.id}/animais`, { token: tokenA });
  confirmar("GET animais do lote retorna Mimosa associada", animaisIniciaisLoteA.status === 200 && animaisIniciaisLoteA.dados.length === 1 && animaisIniciaisLoteA.dados[0].id === conjuntoA.animal.id);

  const estrela = await requisitar("/animais", {
    metodo: "POST", token: tokenA,
    corpo: { nome: "Estrela", especie: "Bovino", raca: "Nelore", sexo: "F", peso: 390, propriedade_id: conjuntoA.propriedade.id },
  });
  confirmar("Estrela cadastrada na propriedade A", estrela.status === 201);
  confirmar("Estrela adicionada ao lote Bezerros", (await requisitar(`/lotes/${conjuntoA.lote.id}/animais`, { metodo: "POST", token: tokenA, corpo: { animal_id: estrela.dados.animal.id } })).status === 201);

  const doisAnimaisNoLote = await requisitar(`/lotes/${conjuntoA.lote.id}/animais`, { token: tokenA });
  confirmar("lote passa a listar dois animais", doisAnimaisNoLote.status === 200 && doisAnimaisNoLote.dados.length === 2);
  const lotesDaMimosa = await requisitar(`/animais/${conjuntoA.animal.id}/lotes`, { token: tokenA });
  confirmar("GET lotes do animal retorna Bezerros", lotesDaMimosa.status === 200 && lotesDaMimosa.dados.some((lote) => lote.id === conjuntoA.lote.id));
  const animaisComLotes = await requisitar("/animais", { token: tokenA });
  confirmar(
    "listagem de animais informa os lotes associados",
    animaisComLotes.status === 200 &&
      animaisComLotes.dados
        .find((animal) => animal.id === conjuntoA.animal.id)
        ?.lotes.some((lote) => lote.id === conjuntoA.lote.id),
  );
  const lotesComQuantidade = await requisitar("/lotes", { token: tokenA });
  confirmar("listagem de lotes informa quantidade 2", lotesComQuantidade.dados.find((lote) => lote.id === conjuntoA.lote.id)?.quantidade_animais === 2);

  confirmar("remover Mimosa exclui somente a relação", (await requisitar(`/lotes/${conjuntoA.lote.id}/animais/${conjuntoA.animal.id}`, { metodo: "DELETE", token: tokenA })).status === 200);
  const mimosaSemLote = await requisitar(`/animais/${conjuntoA.animal.id}`, { token: tokenA });
  confirmar("Mimosa continua cadastrada após remoção do lote", mimosaSemLote.status === 200);
  confirmar("animal removido da relação passa a informar nenhum lote", mimosaSemLote.dados.lotes.length === 0);
  const relacaoMimosa = await pool.query(
    "SELECT COUNT(*) AS total FROM animais_lotes WHERE animal_id = $1 AND lote_id = $2",
    [conjuntoA.animal.id, conjuntoA.lote.id],
  );
  confirmar("somente a associação de Mimosa foi removida", Number(relacaoMimosa.rows[0].total) === 0);

  const outraPropriedadeA = await requisitar("/propriedades", {
    metodo: "POST", token: tokenA,
    corpo: { nome: "Outra Fazenda A", cidade: "Teste", estado: "SP", area: 5 },
  });
  const loteOutraPropriedade = await requisitar("/lotes", {
    metodo: "POST", token: tokenA,
    corpo: { nome: "Lote de Outra Propriedade", propriedade_id: outraPropriedadeA.dados.propriedade.id },
  });
  confirmar("mesmo usuário não associa animal entre propriedades", (await requisitar(`/lotes/${loteOutraPropriedade.dados.lote.id}/animais`, { metodo: "POST", token: tokenA, corpo: { animal_id: conjuntoA.animal.id } })).status === 400);

  const loteNovilhas = await requisitar("/lotes", {
    metodo: "POST", token: tokenA,
    corpo: { nome: "Novilhas", propriedade_id: conjuntoA.propriedade.id },
  });
  await requisitar(`/lotes/${loteNovilhas.dados.lote.id}/animais`, { metodo: "POST", token: tokenA, corpo: { animal_id: estrela.dados.animal.id } });
  confirmar("excluir lote associado funciona sem apagar animal", (await requisitar(`/lotes/${loteNovilhas.dados.lote.id}`, { metodo: "DELETE", token: tokenA })).status === 200 && (await requisitar(`/animais/${estrela.dados.animal.id}`, { token: tokenA })).status === 200);

  const animalTemporario = await requisitar("/animais", {
    metodo: "POST", token: tokenA,
    corpo: { nome: "Temporário", especie: "Bovino", sexo: "M", propriedade_id: conjuntoA.propriedade.id },
  });
  await requisitar(`/lotes/${conjuntoA.lote.id}/animais`, { metodo: "POST", token: tokenA, corpo: { animal_id: animalTemporario.dados.animal.id } });
  confirmar("excluir animal associado funciona sem apagar lote", (await requisitar(`/animais/${animalTemporario.dados.animal.id}`, { metodo: "DELETE", token: tokenA })).status === 200 && (await requisitar(`/lotes/${conjuntoA.lote.id}`, { token: tokenA })).status === 200);

  confirmar("admin associa animal B ao lote B", (await requisitar(`/lotes/${conjuntoB.lote.id}/animais`, { metodo: "POST", token: tokenAdmin, corpo: { animal_id: conjuntoB.animal.id } })).status === 201);
  confirmar("admin visualiza animais de lotes A e B", (await requisitar(`/lotes/${conjuntoA.lote.id}/animais`, { token: tokenAdmin })).status === 200 && (await requisitar(`/lotes/${conjuntoB.lote.id}/animais`, { token: tokenAdmin })).dados.some((animal) => animal.id === conjuntoB.animal.id));

  confirmar("IDs inválidos nas associações retornam 400", (await requisitar("/lotes/invalido/animais", { metodo: "POST", token: tokenA, corpo: { animal_id: "x" } })).status === 400);

  const usuariosAdmin = await requisitar("/usuarios", { token: tokenAdmin });
  confirmar("lista de usuários é exclusiva do admin", usuariosAdmin.status === 200 && (await requisitar("/usuarios", { token: tokenA })).status === 403);
  confirmar("lista de usuários nunca retorna hash", usuariosAdmin.dados.every((usuario) => usuario.senha === undefined));
  confirmar("admin principal não pode ser desativado", (await requisitar(`/usuarios/${adminLogin.dados.usuario.id}/ativo`, { metodo: "PUT", token: tokenAdmin, corpo: { ativo: false } })).status === 403);
  confirmar("admin principal não pode excluir a própria conta", (await requisitar(`/usuarios/${adminLogin.dados.usuario.id}`, { metodo: "DELETE", token: tokenAdmin })).status === 403);
  confirmar("admin principal não pode usar exclusão da própria conta", (await requisitar("/usuarios/me", { metodo: "DELETE", token: tokenAdmin, corpo: { confirmacao: "EXCLUIR" } })).status === 403);
  confirmar("exclusão própria exige confirmação textual", (await requisitar("/usuarios/me", { metodo: "DELETE", token: tokenA, corpo: { confirmacao: "excluir", usuario_id: usuarioB.id } })).status === 400);

  const propriedadeParaExcluir = await requisitar("/propriedades", {
    metodo: "POST",
    token: tokenB,
    corpo: {
      nome: "Fazenda Exclusão Segura",
      cidade: "Teste",
      estado: "SP",
      area: 12,
    },
  });
  const propriedadeExclusaoId = propriedadeParaExcluir.dados.propriedade.id;
  const animalParaExcluir = await requisitar("/animais", {
    metodo: "POST",
    token: tokenB,
    corpo: {
      nome: "Animal Exclusão",
      especie: "Bovino",
      sexo: "F",
      peso: 120,
      propriedade_id: propriedadeExclusaoId,
    },
  });
  const animalExclusaoId = animalParaExcluir.dados.animal.id;
  const loteParaExcluir = await requisitar("/lotes", {
    metodo: "POST",
    token: tokenB,
    corpo: { nome: "Lote Exclusão", propriedade_id: propriedadeExclusaoId },
  });
  const loteExclusaoId = loteParaExcluir.dados.lote.id;
  await requisitar(`/lotes/${loteExclusaoId}/animais`, {
    metodo: "POST",
    token: tokenB,
    corpo: { animal_id: animalExclusaoId },
  });
  const vacinacaoExclusao = await requisitar("/vacinacoes", {
    metodo: "POST",
    token: tokenB,
    corpo: {
      animal_id: animalExclusaoId,
      vacina_id: conjuntoB.vacina.id,
      data_aplicacao: new Date().toISOString().slice(0, 10),
    },
  });
  const despesaExclusao = await requisitar("/despesas", {
    metodo: "POST",
    token: tokenB,
    corpo: {
      descricao: "Despesa da exclusão",
      categoria: "Teste",
      valor: 30,
      data: new Date().toISOString().slice(0, 10),
      propriedade_id: propriedadeExclusaoId,
    },
  });
  const receitaExclusao = await requisitar("/receitas", {
    metodo: "POST",
    token: tokenB,
    corpo: {
      descricao: "Receita da exclusão",
      categoria: "Outros",
      valor: 60,
      data: new Date().toISOString().slice(0, 10),
      propriedade_id: propriedadeExclusaoId,
    },
  });
  const pesagemExclusao = await pool.query(
    `INSERT INTO pesagens
       (animal_id, data_pesagem, peso_kg, tipo_pesagem, lote_id, registrado_por)
     VALUES ($1, CURRENT_DATE, 121, 'ROTINA', $2, $3)
     RETURNING id`,
    [animalExclusaoId, loteExclusaoId, usuarioB.id],
  );
  const desmamaExclusao = await pool.query(
    `INSERT INTO desmamas
       (animal_id, data_planejada, tipo_desmama, status, registrado_por)
     VALUES ($1, CURRENT_DATE, 'CONVENCIONAL', 'PLANEJADA', $2)
     RETURNING id`,
    [animalExclusaoId, usuarioB.id],
  );
  const producaoExclusao = await pool.query(
    `INSERT INTO producoes_leiteiras
       (animal_id, data, turno, quantidade_litros)
     VALUES ($1, CURRENT_DATE, 'manha', 8)
     RETURNING id`,
    [animalExclusaoId],
  );

  const previewCompleto = await requisitar(
    `/propriedades/${propriedadeExclusaoId}/exclusao-preview`,
    { token: tokenB },
  );
  confirmar(
    "preview detalha todas as dependências reais da propriedade",
    previewCompleto.status === 200 &&
      [
        "animais",
        "lotes",
        "animais_lotes",
        "pesagens",
        "desmamas",
        "vacinacoes",
        "despesas",
        "receitas",
        "producoes_leiteiras",
      ].every((chave) => previewCompleto.dados.resumo[chave] === 1),
  );

  const exclusaoPropriedade = await requisitar(
    `/propriedades/${propriedadeExclusaoId}`,
    { metodo: "DELETE", token: tokenB },
  );
  confirmar(
    "exclusão transacional remove propriedade e dependências",
    exclusaoPropriedade.status === 200,
  );
  const dependenciasRestantes = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM propriedades WHERE id = $1)::integer AS propriedades,
       (SELECT COUNT(*) FROM animais WHERE id = $2)::integer AS animais,
       (SELECT COUNT(*) FROM lotes WHERE id = $3)::integer AS lotes,
       (SELECT COUNT(*) FROM vacinacoes WHERE id = $4)::integer AS vacinacoes,
       (SELECT COUNT(*) FROM despesas WHERE id = $5)::integer AS despesas,
       (SELECT COUNT(*) FROM receitas WHERE id = $6)::integer AS receitas,
       (SELECT COUNT(*) FROM pesagens WHERE id = $7)::integer AS pesagens,
       (SELECT COUNT(*) FROM desmamas WHERE id = $8)::integer AS desmamas,
       (SELECT COUNT(*) FROM producoes_leiteiras WHERE id = $9)::integer AS producoes,
       (SELECT COUNT(*) FROM animais_lotes WHERE animal_id = $2 OR lote_id = $3)::integer AS vinculos`,
    [
      propriedadeExclusaoId,
      animalExclusaoId,
      loteExclusaoId,
      vacinacaoExclusao.dados.vacinacao.id,
      despesaExclusao.dados.despesa.id,
      receitaExclusao.dados.receita.id,
      pesagemExclusao.rows[0].id,
      desmamaExclusao.rows[0].id,
      producaoExclusao.rows[0].id,
    ],
  );
  confirmar(
    "exclusão da propriedade não deixa registros órfãos",
    Object.values(dependenciasRestantes.rows[0]).every((total) => total === 0),
  );
  confirmar(
    "exclusão da propriedade preserva cadastro de vacina do usuário",
    (await pool.query("SELECT COUNT(*)::integer AS total FROM vacinas WHERE id = $1", [
      conjuntoB.vacina.id,
    ])).rows[0].total === 1,
  );

  const desativacaoA = await requisitar(`/usuarios/${usuarioA.id}/ativo`, {
    metodo: "PUT", token: tokenAdmin, corpo: { ativo: false },
  });
  confirmar("admin desativa USUARIO_A", desativacaoA.status === 200 && desativacaoA.dados.usuario.ativo === false);
  confirmar("USUARIO_A desativado não consegue login", (await login(emailA, senhaUsuario)).status === 403);
  confirmar("token antigo de usuário desativado é bloqueado", (await requisitar("/dashboard", { token: tokenA })).status === 401);

  const reativacaoA = await requisitar(`/usuarios/${usuarioA.id}/ativo`, {
    metodo: "PUT", token: tokenAdmin, corpo: { ativo: true },
  });
  confirmar("admin reativa USUARIO_A", reativacaoA.status === 200 && reativacaoA.dados.usuario.ativo === true);
  confirmar("reativacao nao ressuscita token anterior", (await requisitar("/dashboard", { token: tokenA })).status === 401);
  const loginReativado = await login(emailA, senhaUsuario);
  confirmar("USUARIO_A volta a fazer login", loginReativado.status === 200);
  tokenA = loginReativado.dados.token;

  const exclusaoB = await requisitar(`/usuarios/${usuarioB.id}`, {
    metodo: "DELETE",
    token: tokenAdmin,
  });
  confirmar("admin exclui usuário comum e seus dados", exclusaoB.status === 200);
  confirmar("usuário excluído pelo admin não consegue login", (await login(emailB, senhaUsuario)).status === 401);
  confirmar("token do usuário excluído pelo admin é invalidado", (await requisitar("/dashboard", { token: tokenB })).status === 401);

  const dadosRestantesB = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM usuarios WHERE id = $1)::integer AS usuarios,
       (SELECT COUNT(*) FROM propriedades WHERE usuario_id = $1)::integer AS propriedades,
       (SELECT COUNT(*) FROM vacinas WHERE usuario_id = $1)::integer AS vacinas,
       (SELECT COUNT(*) FROM sessoes_refresh WHERE usuario_id = $1)::integer AS sessoes`,
    [usuarioB.id],
  );
  confirmar(
    "exclusão administrativa não deixa dados diretos do usuário",
    Object.values(dadosRestantesB.rows[0]).every((total) => total === 0),
  );

  const tentativaExclusaoId = await requisitar("/usuarios/me", {
    metodo: "DELETE",
    token: tokenA,
    corpo: {
      confirmacao: "EXCLUIR",
      usuario_id: cadastroAdministrativo.dados.usuario.id,
    },
  });
  confirmar("exclusao propria rejeita usuario_id enviado no corpo", tentativaExclusaoId.status === 400);
  const exclusaoPropriaA = await requisitar("/usuarios/me", {
    metodo: "DELETE", token: tokenA, corpo: { confirmacao: "EXCLUIR" },
  });
  confirmar("usuário comum exclui somente a própria conta", exclusaoPropriaA.status === 200);
  confirmar("conta excluída pelo próprio usuário não consegue login", (await login(emailA, senhaUsuario)).status === 401);
  confirmar("token da conta excluída pelo próprio usuário é invalidado", (await requisitar("/dashboard", { token: tokenA })).status === 401);

  const dadosRestantesA = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM usuarios WHERE id = $1)::integer AS usuarios,
       (SELECT COUNT(*) FROM propriedades WHERE usuario_id = $1)::integer AS propriedades,
       (SELECT COUNT(*) FROM vacinas WHERE usuario_id = $1)::integer AS vacinas,
       (SELECT COUNT(*) FROM sessoes_refresh WHERE usuario_id = $1)::integer AS sessoes`,
    [usuarioA.id],
  );
  confirmar(
    "exclusão própria não aceita usuario_id do body e remove somente a conta autenticada",
    Object.values(dadosRestantesA.rows[0]).every((total) => total === 0) &&
      (await pool.query("SELECT COUNT(*)::integer AS total FROM usuarios WHERE id = $1", [cadastroAdministrativo.dados.usuario.id])).rows[0].total === 1,
  );
}

executar()
  .then(() => console.log(`\n${testesExecutados} verificações concluídas com sucesso.`))
  .catch((erro) => {
    console.error(`\nFALHA: ${erro.stack || erro.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (process.env.ALLOW_TEST_DB_WRITES === "true") {
      await limparDadosTemporarios().catch((erro) => {
        console.error(`Falha ao limpar dados temporários: ${erro.message}`);
        process.exitCode = 1;
      });
    }

    if (servidor) {
      await new Promise((resolve) => servidor.close(resolve));
    }

    await pool.end();
  });
