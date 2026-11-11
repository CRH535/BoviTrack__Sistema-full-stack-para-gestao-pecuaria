const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { obterPoolAutenticacao } = require('../database/poolAutenticacao');
const { assinarContexto, transacao } = require('../database/contextoRls');
const emailService = require('./emailService');
const { consumirLimite } = require('./limitesRequisicao');
const { VERIFICACAO_EMAIL: config, obterConfiguracaoEmail } = require('../config/email');
const { issuer } = require('../config/ambiente');
const { registrarEvento } = require('../utils/log');

const TICKET_AUDIENCE = 'bovitrack-email-verification';
function normalizarEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}
function emailValido(email) {
  return email.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function mascararEmail(email) {
  const [local, dominio] = normalizarEmail(email).split('@');
  return dominio ? `${local.slice(0, 1)}***@${dominio}` : '***';
}
function hmac(contexto) {
  return crypto.createHmac('sha256', obterConfiguracaoEmail().pepper).update(contexto).digest('hex');
}
function gerarCodigo() {
  return String(crypto.randomInt(0, 10 ** config.digitos)).padStart(config.digitos, '0');
}
function hashCodigo({ usuarioId, email, desafioId, codigo }) {
  return hmac(JSON.stringify(['email-code-v1', usuarioId, normalizarEmail(email), desafioId, codigo]));
}
function criarTicket(email, credenciaisComprovadas = false) {
  return jwt.sign({ finalidade: 'verificacao-email', email_hash: hmac(`email-ticket-v1:${normalizarEmail(email)}`),
    credenciais_comprovadas: credenciaisComprovadas, nonce: crypto.randomBytes(16).toString('hex') },
  process.env.JWT_SECRET, { algorithm: 'HS256', audience: TICKET_AUDIENCE, issuer, expiresIn: config.ticketValidade });
}
function validarTicket(ticket, email) {
  const dados = jwt.verify(ticket, process.env.JWT_SECRET, { algorithms: ['HS256'], audience: TICKET_AUDIENCE, issuer });
  const recebido = Buffer.from(dados.email_hash || '', 'hex');
  const esperado = Buffer.from(hmac(`email-ticket-v1:${normalizarEmail(email)}`), 'hex');
  if (dados.finalidade !== 'verificacao-email' || recebido.length !== esperado.length ||
      !crypto.timingSafeEqual(recebido, esperado)) throw new Error('Ticket inválido');
  return dados;
}

function criarVerificacaoEmailService({ banco, enviar = (dados) => emailService.enviarVerificacao(dados) } = {}) {
  async function solicitarCodigo(emailRecebido) {
    const email = normalizarEmail(emailRecebido);
    const autenticacao = banco || obterPoolAutenticacao();
    // Mesma infraestrutura persistente de rate limit; chave aplicada também a contas inexistentes.
    for (const regra of [
      { escopo: 'EMAIL_ENVIO_HORA', limite: config.envioPorHora, janelaMs: config.janelaHoraMs },
      { escopo: 'EMAIL_ENVIO_DIA', limite: config.envioPorDia, janelaMs: config.janelaDiaMs },
    ]) {
      const limite = await consumirLimite({ ...regra, chave: email, executor: autenticacao });
      if (!limite.permitido) return { estado: 'RATE_LIMIT', retryAfter: limite.retryAfter };
    }
    const reserva = await transacao(autenticacao, async (cliente) => {
      const { rows: [usuario] } = await cliente.query('SELECT * FROM bovitrack_seg.email_usuario($1)', [email]);
      if (!usuario || !usuario.ativo || usuario.email_verificado) return { estado: 'SEM_ENVIO', retryAfter: config.cooldownMs / 1000 };
      const { rows: [ultimo] } = await cliente.query('SELECT * FROM bovitrack_seg.email_ultimo($1)', [usuario.id]);
      const restante = ultimo ? config.cooldownMs - (Date.now() - new Date(ultimo.criado_em).getTime()) : 0;
      if (restante > 0) return { estado: 'COOLDOWN', retryAfter: Math.ceil(restante / 1000) };
      const id = crypto.randomUUID();
      let codigo = gerarCodigo();
      while (ultimo && hashCodigo({ usuarioId: usuario.id, email, desafioId: ultimo.id, codigo }) === ultimo.codigo_hash) {
        codigo = gerarCodigo();
      }
      const criadoEm = new Date();
      await cliente.query('SELECT bovitrack_seg.email_reservar($1,$2,$3,$4,$5)', [id, usuario.id,
        hashCodigo({ usuarioId: usuario.id, email, desafioId: id, codigo }), criadoEm,
        new Date(criadoEm.getTime() + config.validadeMs)]);
      return { desafioId: id, email, codigo, usuarioId: usuario.id };
    });
    if (reserva.estado) return reserva;

    try {
      await enviar(reserva);
    } catch {
      await autenticacao.query('SELECT bovitrack_seg.email_entrega($1,false)', [reserva.desafioId]);
      registrarEvento('aviso', 'email_verificacao_envio_falhou', { usuario_id: reserva.usuarioId });
      return { estado: 'FALHA_TEMPORARIA', retryAfter: config.cooldownMs / 1000 };
    }
    await autenticacao.query('SELECT bovitrack_seg.email_entrega($1,true)', [reserva.desafioId]);
    registrarEvento('info', 'email_verificacao_enviado', { usuario_id: reserva.usuarioId });
    return { estado: 'ENVIADO', retryAfter: config.cooldownMs / 1000 };
  }

  async function verificarCodigo(emailRecebido, codigo) {
    const email = normalizarEmail(emailRecebido);
    return transacao(banco || obterPoolAutenticacao(), async (cliente) => {
      const { rows: [usuario] } = await cliente.query('SELECT * FROM bovitrack_seg.email_usuario($1)', [email]);
      if (!usuario || !usuario.ativo) return { estado: 'CODE_INVALID_OR_EXPIRED' };
      const { rows: [desafio] } = await cliente.query('SELECT * FROM bovitrack_seg.email_ultimo($1)', [usuario.id]);
      if (!desafio) return { estado: 'CODE_INVALID_OR_EXPIRED' };
      const calculado = hashCodigo({ usuarioId: usuario.id, email, desafioId: desafio.id, codigo });
      const { rows: [{ xid }] } = await cliente.query('SELECT bovitrack_seg.desafio() AS xid');
      const prova = assinarContexto(`bovitrack-email-v1:${xid}:${usuario.id}:${desafio.id}:${calculado}:${config.maxTentativas}`);
      const resultado = await cliente.query('SELECT bovitrack_seg.email_resolver($1,$2,$3,$4,$5) AS estado',
        [usuario.id, desafio.id, calculado, config.maxTentativas, prova]);
      return resultado.rows[0];
    });
  }
  return { solicitarCodigo, verificarCodigo };
}

async function aguardarRespostaPublica(inicio, minimoMs = config.respostaPublicaMinMs) {
  const espera = minimoMs - (Date.now() - inicio);
  if (espera > 0) await new Promise((resolve) => setTimeout(resolve, espera));
}

module.exports = { ...criarVerificacaoEmailService(), criarVerificacaoEmailService, normalizarEmail,
  emailValido, mascararEmail, criarTicket, validarTicket, gerarCodigo, hashCodigo, aguardarRespostaPublica };
