const verificacao = require('../services/verificacaoEmail');
const { VERIFICACAO_EMAIL: config } = require('../config/email');
const { registrarErro } = require('../utils/log');
const { validarCamposPermitidos } = require('../utils/validacoes');

function prepararVerificacao(req, res, next) {
  const campos = validarCamposPermitidos(req.body, ['email', 'codigo']);
  const email = verificacao.normalizarEmail(req.body?.email);
  if (campos.erro || !verificacao.emailValido(email)) {
    return res.status(400).json({ mensagem: 'Informe dados válidos para verificar seu e-mail' });
  }
  try {
    const ticket = req.headers['x-email-verification'];
    if (typeof ticket !== 'string' || ticket.length > 2048) throw new Error('Ticket inválido');
    const dados = verificacao.validarTicket(ticket, email);
    req.verificacaoEmail = { email, detalhado: dados.credenciais_comprovadas === true };
    next();
  } catch {
    res.status(401).json({ codigo: 'VERIFICATION_CONTEXT_EXPIRED', mensagem: 'Entre novamente para continuar a verificação' });
  }
}

async function reenviarCodigo(req, res) {
  const inicio = Date.now();
  const { email, detalhado } = req.verificacaoEmail;
  try {
    const resultado = await verificacao.solicitarCodigo(email);
    if (detalhado) {
      res.setHeader('Retry-After', String(resultado.retryAfter));
      const status = resultado.estado === 'COOLDOWN' || resultado.estado === 'RATE_LIMIT' ? 429 : resultado.estado === 'FALHA_TEMPORARIA' ? 503 : 202;
      return res.status(status).json({ envio: resultado.estado, retryAfter: resultado.retryAfter,
        mensagem: resultado.estado === 'FALHA_TEMPORARIA' ? 'Não foi possível enviar agora. Aguarde e tente novamente.' : 'Solicitação de envio recebida' });
    }
    await verificacao.aguardarRespostaPublica(inicio);
    res.setHeader('Retry-After', String(config.cooldownMs / 1000));
    res.status(202).json({ retryAfter: config.cooldownMs / 1000,
      mensagem: 'Se existir uma conta pendente para este endereço, enviaremos um novo código.' });
  } catch (erro) {
    registrarErro('email_verificacao_reenvio_erro', erro, req);
    if (!detalhado) await verificacao.aguardarRespostaPublica(inicio);
    res.status(503).json({ mensagem: 'Serviço temporariamente indisponível. Tente novamente mais tarde.' });
  }
}

const MENSAGENS = {
  CODE_INVALID: 'Código inválido. Confira os 6 dígitos e tente novamente.',
  CODE_INVALID_OR_EXPIRED: 'Código inválido ou expirado. Solicite um novo código.',
  CODE_EXPIRED: 'Código expirado. Solicite um novo código.',
  CODE_USED: 'Este código já foi utilizado. Volte ao login.',
  CODE_ATTEMPTS_EXCEEDED: 'Limite de tentativas atingido. Solicite um novo código.',
  EMAIL_ALREADY_VERIFIED: 'Seu e-mail já foi verificado. Volte ao login.',
  EMAIL_TEMPORARILY_UNAVAILABLE: 'Envio em preparação ou indisponível. Aguarde e tente novamente.',
};
async function verificarCodigo(req, res) {
  const inicio = Date.now();
  if (typeof req.body.codigo !== 'string' || !/^\d{6}$/.test(req.body.codigo)) {
    return res.status(400).json({ codigo: 'CODE_FORMAT_INVALID', mensagem: 'Informe um código numérico de 6 dígitos' });
  }
  try {
    const resultado = await verificacao.verificarCodigo(req.verificacaoEmail.email, req.body.codigo);
    if (!req.verificacaoEmail.detalhado) await verificacao.aguardarRespostaPublica(inicio, config.validacaoPublicaMinMs);
    if (resultado.estado === 'EMAIL_VERIFIED') {
      return res.json({ codigo: resultado.estado, mensagem: 'E-mail verificado com sucesso. Entre para continuar.' });
    }
    // Detalhes sobre a conta somente após comprovação da senha no login.
    const codigo = req.verificacaoEmail.detalhado ? resultado.estado : 'CODE_INVALID_OR_EXPIRED';
    res.status(400).json({ codigo, mensagem: MENSAGENS[codigo] });
  } catch (erro) {
    registrarErro('email_verificacao_validacao_erro', erro, req);
    if (!req.verificacaoEmail.detalhado) await verificacao.aguardarRespostaPublica(inicio, config.validacaoPublicaMinMs);
    res.status(503).json({ mensagem: 'Serviço temporariamente indisponível. Tente novamente mais tarde.' });
  }
}

module.exports = { prepararVerificacao, reenviarCodigo, verificarCodigo };
