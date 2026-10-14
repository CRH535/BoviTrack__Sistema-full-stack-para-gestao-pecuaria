const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const pool = require('../database/pool');
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

function criarVerificacaoEmailService({ banco = pool, enviar = (dados) => emailService.enviarVerificacao(dados) } = {}) {
  async function solicitarCodigo(emailRecebido) {
    const email = normalizarEmail(emailRecebido);
    // Mesma infraestrutura persistente de rate limit; chave aplicada também a contas inexistentes.
    for (const regra of [
      { escopo: 'EMAIL_ENVIO_HORA', limite: config.envioPorHora, janelaMs: config.janelaHoraMs },
      { escopo: 'EMAIL_ENVIO_DIA', limite: config.envioPorDia, janelaMs: config.janelaDiaMs },
    ]) {
      const limite = await consumirLimite({ ...regra, chave: email, executor: banco });
      if (!limite.permitido) return { estado: 'RATE_LIMIT', retryAfter: limite.retryAfter };
    }
    const cliente = await banco.connect();
    let desafio;
    try {
      await cliente.query('BEGIN');
      const resultado = await cliente.query(
        'SELECT id, email, email_verificado, ativo FROM usuarios WHERE lower(btrim(email)) = $1 FOR UPDATE', [email]);
      const usuario = resultado.rows[0];
      if (!usuario || !usuario.ativo || usuario.email_verificado) {
        await cliente.query('COMMIT');
        return { estado: 'SEM_ENVIO', retryAfter: config.cooldownMs / 1000 };
      }
      const anteriores = await cliente.query(
        'SELECT criado_em FROM verificacoes_email WHERE usuario_id = $1 ORDER BY criado_em DESC LIMIT 1', [usuario.id]);
      const restante = anteriores.rows[0] ? config.cooldownMs - (Date.now() - new Date(anteriores.rows[0].criado_em).getTime()) : 0;
      if (restante > 0) {
        await cliente.query('COMMIT');
        return { estado: 'COOLDOWN', retryAfter: Math.ceil(restante / 1000) };
      }
      await cliente.query(`UPDATE verificacoes_email SET invalidado_em = CURRENT_TIMESTAMP, motivo = 'REENVIO'
        WHERE usuario_id = $1 AND invalidado_em IS NULL`, [usuario.id]);
      const id = crypto.randomUUID();
      let codigo = gerarCodigo();
      // Mesmo um novo desafio não deve repetir o código imediatamente anterior.
      const ultimo = await cliente.query('SELECT id, codigo_hash FROM verificacoes_email WHERE usuario_id=$1 ORDER BY criado_em DESC LIMIT 1', [usuario.id]);
      while (ultimo.rows[0] && hashCodigo({ usuarioId: usuario.id, email, desafioId: ultimo.rows[0].id, codigo }) === ultimo.rows[0].codigo_hash) codigo = gerarCodigo();
      const criadoEm = new Date();
      await cliente.query(`INSERT INTO verificacoes_email (id, usuario_id, codigo_hash, criado_em, expira_em)
        VALUES ($1, $2, $3, $4, $5)`, [id, usuario.id, hashCodigo({ usuarioId: usuario.id, email, desafioId: id, codigo }),
        criadoEm, new Date(criadoEm.getTime() + config.validadeMs)]);
      await cliente.query('COMMIT');
      desafio = { desafioId: id, email, codigo, usuarioId: usuario.id };
    } catch (erro) {
      await cliente.query('ROLLBACK').catch(() => {});
      throw erro;
    } finally { cliente.release(); }

    // Nunca segurar locks/transações durante a chamada de rede. Uma reserva
    // persistida mantém cooldown mesmo se o processo falhar depois do commit.
    try {
      await enviar(desafio);
      await banco.query(`UPDATE verificacoes_email SET enviado_em = CURRENT_TIMESTAMP
        WHERE id = $1 AND invalidado_em IS NULL`, [desafio.desafioId]);
      registrarEvento('info', 'email_verificacao_enviado', { usuario_id: desafio.usuarioId });
      return { estado: 'ENVIADO', retryAfter: config.cooldownMs / 1000 };
    } catch {
      await banco.query(`UPDATE verificacoes_email SET invalidado_em = CURRENT_TIMESTAMP, motivo = 'FALHA_ENVIO'
        WHERE id = $1 AND invalidado_em IS NULL`, [desafio.desafioId]);
      registrarEvento('aviso', 'email_verificacao_envio_falhou', { usuario_id: desafio.usuarioId });
      return { estado: 'FALHA_TEMPORARIA', retryAfter: config.cooldownMs / 1000 };
    }
  }

  async function verificarCodigo(emailRecebido, codigo) {
    const email = normalizarEmail(emailRecebido);
    const cliente = await banco.connect();
    try {
      await cliente.query('BEGIN');
      const usuario = (await cliente.query(
        'SELECT id, email_verificado, ativo FROM usuarios WHERE lower(btrim(email)) = $1 FOR UPDATE', [email])).rows[0];
      if (!usuario || !usuario.ativo) { await cliente.query('COMMIT'); return { estado: 'CODE_INVALID_OR_EXPIRED' }; }
      const desafio = (await cliente.query(
        'SELECT * FROM verificacoes_email WHERE usuario_id = $1 ORDER BY criado_em DESC LIMIT 1 FOR UPDATE', [usuario.id])).rows[0];
      let estado;
      if (!desafio) estado = 'CODE_INVALID_OR_EXPIRED';
      else if (desafio.usado_em) estado = 'CODE_USED';
      else if (usuario.email_verificado) estado = 'EMAIL_ALREADY_VERIFIED';
      else if (desafio.tentativas >= config.maxTentativas) estado = 'CODE_ATTEMPTS_EXCEEDED';
      else if (new Date(desafio.expira_em).getTime() <= Date.now()) {
        estado = 'CODE_EXPIRED';
        await cliente.query(`UPDATE verificacoes_email SET invalidado_em = COALESCE(invalidado_em, CURRENT_TIMESTAMP), motivo = 'EXPIRADO' WHERE id = $1`, [desafio.id]);
      } else if (desafio.invalidado_em) estado = 'CODE_INVALID_OR_EXPIRED';
      else if (!desafio.enviado_em) estado = 'EMAIL_TEMPORARILY_UNAVAILABLE';
      else {
        const calculado = Buffer.from(hashCodigo({ usuarioId: usuario.id, email, desafioId: desafio.id, codigo }), 'hex');
        const armazenado = Buffer.from(desafio.codigo_hash, 'hex');
        if (calculado.length !== armazenado.length || !crypto.timingSafeEqual(calculado, armazenado)) {
          const tentativas = desafio.tentativas + 1;
          await cliente.query(`UPDATE verificacoes_email SET tentativas = $2::smallint,
            invalidado_em = CASE WHEN $2::smallint >= $3::smallint THEN CURRENT_TIMESTAMP ELSE NULL END,
            motivo = CASE WHEN $2::smallint >= $3::smallint THEN 'TENTATIVAS' ELSE NULL END WHERE id = $1`, [desafio.id, tentativas, config.maxTentativas]);
          estado = tentativas >= config.maxTentativas ? 'CODE_ATTEMPTS_EXCEEDED' : 'CODE_INVALID';
        } else {
          await cliente.query(`UPDATE verificacoes_email SET usado_em = CURRENT_TIMESTAMP,
            invalidado_em = CURRENT_TIMESTAMP, motivo = 'VERIFICADO' WHERE id = $1`, [desafio.id]);
          await cliente.query('UPDATE usuarios SET email_verificado = TRUE, email_verificado_em = CURRENT_TIMESTAMP WHERE id = $1', [usuario.id]);
          // Sessões anteriores não voltam a funcionar depois da verificação.
          await cliente.query(`UPDATE sessoes_refresh SET revoked_at = CURRENT_TIMESTAMP, revoke_reason = 'EMAIL_VERIFIED_RELOGIN'
            WHERE usuario_id = $1 AND revoked_at IS NULL`, [usuario.id]);
          estado = 'EMAIL_VERIFIED';
        }
      }
      await cliente.query('COMMIT');
      return { estado };
    } catch (erro) {
      await cliente.query('ROLLBACK').catch(() => {});
      throw erro;
    } finally { cliente.release(); }
  }
  return { solicitarCodigo, verificarCodigo };
}

async function aguardarRespostaPublica(inicio, minimoMs = config.respostaPublicaMinMs) {
  const espera = minimoMs - (Date.now() - inicio);
  if (espera > 0) await new Promise((resolve) => setTimeout(resolve, espera));
}

module.exports = { ...criarVerificacaoEmailService(), criarVerificacaoEmailService, normalizarEmail,
  emailValido, mascararEmail, criarTicket, validarTicket, gerarCodigo, hashCodigo, aguardarRespostaPublica };
