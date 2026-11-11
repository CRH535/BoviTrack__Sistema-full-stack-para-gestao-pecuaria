require("dotenv").config();

const assert = require("node:assert/strict");
const { app } = require("../server");
const pool = require("./helpers/bancoFixture");

const sufixo = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const emails = [`bezerros-a-${sufixo}@bovitrack.local`, `bezerros-b-${sufixo}@bovitrack.local`];
const senha = "BezerrosSeguro#2026";
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
  const resposta = await fetch(`${baseUrl}${rota}`, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
  return { status: resposta.status, dados: await resposta.json().catch(() => null) };
}

async function limpar() {
  await pool.query(`DELETE FROM animais_lotes WHERE animal_id IN (SELECT a.id FROM animais a JOIN propriedades p ON p.id=a.propriedade_id JOIN usuarios u ON u.id=p.usuario_id WHERE u.email=ANY($1))`, [emails]);
  await pool.query(`DELETE FROM animais WHERE propriedade_id IN (SELECT p.id FROM propriedades p JOIN usuarios u ON u.id=p.usuario_id WHERE u.email=ANY($1))`, [emails]);
  await pool.query(`DELETE FROM lotes WHERE propriedade_id IN (SELECT p.id FROM propriedades p JOIN usuarios u ON u.id=p.usuario_id WHERE u.email=ANY($1))`, [emails]);
  await pool.query("DELETE FROM propriedades WHERE usuario_id IN (SELECT id FROM usuarios WHERE email=ANY($1))", [emails]);
  await pool.query("DELETE FROM usuarios WHERE email=ANY($1)", [emails]);
}

async function executar() {
  if (process.env.ALLOW_TEST_DB_WRITES !== "true") {
    throw new Error("Defina ALLOW_TEST_DB_WRITES=true somente em um banco isolado de teste");
  }
  await pool.query("DELETE FROM limites_requisicao WHERE escopo IN ('LOGIN_CONTA', 'LOGIN_IP', 'CADASTRO_IP')");
  servidor = app.listen(0);
  await new Promise((resolve) => servidor.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${servidor.address().port}`;

  for (const [indice, email] of emails.entries()) {
    const cadastro = await requisitar("/auth/cadastro", { metodo: "POST", corpo: { nome: `Produtor Bezerros ${indice + 1}`, email, senha } });
    confirmar(`cadastro do produtor ${indice + 1}`, cadastro.status === 202);
    await require('./helpers/email').verificarFixture(email);
  }
  const sessoes = await Promise.all(emails.map((email) => requisitar("/auth/login", { metodo: "POST", corpo: { email, senha } })));
  const [tokenA, tokenB] = sessoes.map((item) => item.dados.token);
  const propriedades = await Promise.all([
    requisitar("/propriedades", { metodo: "POST", token: tokenA, corpo: { nome: "Fazenda Bezerros A", cidade: "Teste", estado: "SP", area: 10 } }),
    requisitar("/propriedades", { metodo: "POST", token: tokenB, corpo: { nome: "Fazenda Bezerros B", cidade: "Teste", estado: "MG", area: 12 } }),
  ]);
  const [propriedadeA, propriedadeB] = propriedades.map((item) => item.dados.propriedade.id);
  const maeA = await requisitar("/animais", { metodo: "POST", token: tokenA, corpo: { nome: "Mãe A", especie: "Bovino", sexo: "F", propriedade_id: propriedadeA } });
  const maeB = await requisitar("/animais", { metodo: "POST", token: tokenB, corpo: { nome: "Mãe B", especie: "Bovino", sexo: "F", propriedade_id: propriedadeB } });
  const bezerroA = await requisitar("/animais", { metodo: "POST", token: tokenA, corpo: { nome: "Bezerro A", numero_brinco: `A-${sufixo}`, data_nascimento: "2026-01-01", especie: "Bovino", sexo: "M", propriedade_id: propriedadeA, mae_id: maeA.dados.animal.id } });
  const bezerroB = await requisitar("/animais", { metodo: "POST", token: tokenB, corpo: { nome: "Bezerro B", data_nascimento: "2026-01-01", especie: "Bovino", sexo: "M", propriedade_id: propriedadeB, mae_id: maeB.dados.animal.id } });
  confirmar("vínculo do bezerro com mãe da mesma propriedade", bezerroA.status === 201 && bezerroA.dados.animal.mae_id === maeA.dados.animal.id);
  confirmar("mãe de outra propriedade é bloqueada", (await requisitar("/animais", { metodo: "POST", token: tokenA, corpo: { nome: "Inválido", especie: "Bovino", sexo: "M", propriedade_id: propriedadeA, mae_id: maeB.dados.animal.id } })).status === 400);

  const loteA = await requisitar("/lotes", { metodo: "POST", token: tokenA, corpo: { nome: "Desmamados A", propriedade_id: propriedadeA } });
  const loteB = await requisitar("/lotes", { metodo: "POST", token: tokenB, corpo: { nome: "Desmamados B", propriedade_id: propriedadeB } });
  const rotaA = `/animais/${bezerroA.dados.animal.id}/pesagens`;
  const nascimento = await requisitar(rotaA, { metodo: "POST", token: tokenA, corpo: { data_pesagem: "2026-01-01", peso_kg: 32, tipo_pesagem: "NASCIMENTO", metodo: "BALANCA" } });
  const rotina = await requisitar(rotaA, { metodo: "POST", token: tokenA, corpo: { data_pesagem: "2026-04-01", peso_kg: 105, tipo_pesagem: "ROTINA", metodo: "FITA", lote_id: loteA.dados.lote.id } });
  confirmar("pesagens válidas atualizam o histórico", nascimento.status === 201 && rotina.status === 201);
  confirmar("lote de outra propriedade é bloqueado", (await requisitar(rotaA, { metodo: "POST", token: tokenA, corpo: { data_pesagem: "2026-05-01", peso_kg: 120, tipo_pesagem: "ROTINA", lote_id: loteB.dados.lote.id } })).status === 404);

  const pesagemB = await requisitar(`/animais/${bezerroB.dados.animal.id}/pesagens`, { metodo: "POST", token: tokenB, corpo: { data_pesagem: "2026-02-01", peso_kg: 50, tipo_pesagem: "ROTINA" } });
  confirmar("usuário A não lista pesagens de B", (await requisitar(`/animais/${bezerroB.dados.animal.id}/pesagens`, { token: tokenA })).status === 404);
  confirmar("usuário A não edita pesagem de B", (await requisitar(`/pesagens/${pesagemB.dados.pesagem.id}`, { metodo: "PUT", token: tokenA, corpo: { data_pesagem: "2026-02-01", peso_kg: 99, tipo_pesagem: "ROTINA" } })).status === 404);
  confirmar("usuário A não exclui pesagem de B", (await requisitar(`/pesagens/${pesagemB.dados.pesagem.id}`, { metodo: "DELETE", token: tokenA })).status === 404);
  const resumo = await requisitar(`${rotaA}/resumo`, { token: tokenA });
  confirmar("resumo calcula peso atual, variação e GMD", resumo.status === 200 && resumo.dados.resumo.peso_atual === 105 && resumo.dados.resumo.variacao_recente === 73 && resumo.dados.resumo.gmd_recente > 0);

  const planejamento = await requisitar(`/animais/${bezerroA.dados.animal.id}/desmamas`, { metodo: "POST", token: tokenA, corpo: { data_planejada: "2026-07-30", tipo_desmama: "LADO_A_LADO", mae_id: maeA.dados.animal.id, lote_destino_id: loteA.dados.lote.id, status: "PLANEJADA" } });
  confirmar("planejamento de desmama criado", planejamento.status === 201);
  confirmar("outro usuário não altera a desmama", (await requisitar(`/desmamas/${planejamento.dados.desmama.id}`, { metodo: "PUT", token: tokenB, corpo: { data_planejada: "2026-08-01", tipo_desmama: "CONVENCIONAL", status: "PLANEJADA" } })).status === 404);
  const concluida = await requisitar(`/desmamas/${planejamento.dados.desmama.id}/concluir`, { metodo: "POST", token: tokenA, corpo: { data_desmama: "2026-07-30", peso_kg: 190, metodo: "BALANCA", lote_destino_id: loteA.dados.lote.id } });
  confirmar("conclusão cria pesagem DESMAMA transacionalmente", concluida.status === 200 && concluida.dados.pesagem.tipo_pesagem === "DESMAMA");
  confirmar("segunda conclusão não duplica a pesagem", (await requisitar(`/desmamas/${planejamento.dados.desmama.id}/concluir`, { metodo: "POST", token: tokenA, corpo: { data_desmama: "2026-07-30", peso_kg: 190 } })).status === 409);
  const historico = await requisitar(`/animais/${bezerroA.dados.animal.id}/desmamas`, { token: tokenA });
  confirmar("animal fica definitivamente desmamado", historico.dados.status_atual === "DESMAMADO" && historico.dados.eventos[0].idade_desmama_dias === 210);
  const vinculo = await pool.query("SELECT 1 FROM animais_lotes WHERE animal_id=$1 AND lote_id=$2", [bezerroA.dados.animal.id, loteA.dados.lote.id]);
  confirmar("lote de destino é associado sem remover outros lotes", vinculo.rows.length === 1);

  const temporaria = await requisitar(`/animais/${bezerroB.dados.animal.id}/desmamas`, { metodo: "POST", token: tokenB, corpo: { data_planejada: "2026-06-01", data_inicio: "2026-06-01", data_fim: "2026-06-05", tipo_desmama: "TEMPORARIA", status: "EM_ANDAMENTO" } });
  const fimTemporaria = await requisitar(`/desmamas/${temporaria.dados.desmama.id}/concluir`, { metodo: "POST", token: tokenB, corpo: { data_fim: "2026-06-05" } });
  const historicoTemporario = await requisitar(`/animais/${bezerroB.dados.animal.id}/desmamas`, { token: tokenB });
  confirmar("desmama temporária conclui o período sem marcar definitivamente", fimTemporaria.status === 200 && historicoTemporario.dados.status_atual === "NAO_DESMAMADO");
  const definitivaPosterior = await requisitar(`/animais/${bezerroB.dados.animal.id}/desmamas`, { metodo: "POST", token: tokenB, corpo: { data_planejada: "2026-08-01", tipo_desmama: "CONVENCIONAL", status: "PLANEJADA" } });
  confirmar("desmama temporária permite planejamento definitivo futuro", definitivaPosterior.status === 201);
}

executar()
  .then(() => console.log(`\n${verificacoes} verificações integradas de pesagens/desmamas concluídas com sucesso.`))
  .catch((erro) => { console.error(`\nFALHA: ${erro.stack || erro.message}`); process.exitCode = 1; })
  .finally(async () => {
    await limpar().catch((erro) => { console.error(`Falha ao limpar teste: ${erro.message}`); process.exitCode = 1; });
    if (servidor) await new Promise((resolve) => servidor.close(resolve));
    await pool.end();
  });
