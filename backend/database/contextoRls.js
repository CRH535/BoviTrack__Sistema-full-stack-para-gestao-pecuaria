const { createHmac } = require("node:crypto");
const pool = require("./pool");
const { verificacaoEmailObrigatoria } = require('../config/email');
const { conferirPoliticaEmail } = require('../middleware/politicaEmail');

async function transacao(banco, executar) {
  const cliente = await banco.connect();
  let descartar = false;
  let erroConexao;
  // O pg-pool retira seu listener enquanto o cliente está emprestado. Uma
  // desconexão assíncrona nesse intervalo não pode virar um evento sem tratador.
  const aoFalharConexao = (erro) => { descartar = true; erroConexao = erro; };
  cliente.on('error', aoFalharConexao);
  try {
    await cliente.query("BEGIN");
    const resultado = await executar(cliente);
    if (erroConexao) throw erroConexao;
    const fim = await cliente.query("COMMIT");
    if (fim.command !== "COMMIT") throw new Error("Transação abortada");
    return resultado;
  } catch (erro) {
    descartar ||= erro.message === "Query read timeout";
    if (!descartar) {
      try {
        await cliente.query("ROLLBACK");
      } catch {
        descartar = true;
      }
    }
    throw erro;
  } finally {
    cliente.removeListener('error', aoFalharConexao);
    cliente.release(descartar);
  }
}

function erroSessao() {
  return Object.assign(new Error("Sessão inválida ou usuário desativado"), {
    status: 401, codigo: "SESSAO_INVALIDA",
  });
}

function assinarContexto(mensagem) {
  const chave = process.env.DB_RLS_CONTEXT_KEY;
  if (!/^[0-9a-f]{64}$/.test(chave || "")) throw new Error("DB_RLS_CONTEXT_KEY inválida");
  return createHmac("sha256", Buffer.from(chave, "hex")).update(mensagem).digest("hex");
}

async function comAtor(identidade, executar, { permitirPendente = false, finalidade = "dominio" } = {}) {
  const { id, sessionId } = identidade;
  if (!Number.isInteger(id) || id < 1 || id > 2147483647 ||
      typeof sessionId !== "string" || !/^[0-9a-f]{64}$/.test(sessionId)) throw erroSessao();
  return transacao(pool, async (cliente) => {
    const { rows: [{ desafio }] } = await cliente.query("SELECT bovitrack_seg.desafio() AS desafio");
    const assinatura = assinarContexto(`bovitrack-rls-v1:${desafio}:${id}:${sessionId}:${finalidade}`);
    await cliente.query(
      `SELECT pg_catalog.set_config('search_path', 'pg_catalog, public, pg_temp', true),
              pg_catalog.set_config('bovitrack.usuario_id', $1, true),
              pg_catalog.set_config('bovitrack.session_id', $2, true),
              pg_catalog.set_config('bovitrack.assinatura', $3, true),
              pg_catalog.set_config('bovitrack.finalidade', $4, true)`,
      [String(id), sessionId, assinatura, finalidade],
    );
    const ator = (await cliente.query("SELECT *, bovitrack_seg.email_verificacao_obrigatoria() AS verificacao_email_obrigatoria FROM bovitrack_seg.sessao_atual()")).rows[0];
    if (ator) conferirPoliticaEmail(ator.verificacao_email_obrigatoria);
    if (!ator || (!permitirPendente && verificacaoEmailObrigatoria() && !ator.email_verificado) ||
        (identidade.perfil && ator.perfil !== identidade.perfil)) throw erroSessao();
    return executar(cliente, ator);
  });
}

function identidadeDaRequisicao(req) {
  return { id: req.usuario.id, perfil: req.usuario.perfil, sessionId: req.autenticacao.sessionId };
}

function rotaComBanco(handler, opcoes) {
  return async (req, res, next) => {
    let resposta;
    const responder = (status, corpo, aposCommit) => {
      resposta = { status, corpo, aposCommit };
    };
    const cancelar = new Error("A rota retornou um erro");
    try {
      await comAtor(identidadeDaRequisicao(req), async (cliente) => {
        await handler(req, res, cliente, responder);
        if (!resposta) throw new Error("Rota sem resposta");
        if (resposta.status >= 400) throw cancelar;
      }, opcoes);
    } catch (erro) {
      if (erro === cancelar) return res.status(resposta.status).json(resposta.corpo);
      if (erro.codigo === "SESSAO_INVALIDA") {
        return res.status(401).json({ mensagem: erro.message, codigo: erro.codigo });
      }
      return next(erro);
    }
    resposta.aposCommit?.();
    return res.status(resposta.status).json(resposta.corpo);
  };
}

module.exports = { assinarContexto, comAtor, identidadeDaRequisicao, rotaComBanco, transacao };
