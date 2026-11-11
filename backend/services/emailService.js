const { Resend } = require('resend');
const { VERIFICACAO_EMAIL, obterConfiguracaoEmail } = require('../config/email');
const { templateVerificacaoEmail } = require('../emails/verificacaoEmail');

function criarEmailService({ criarCliente, configuracao = obterConfiguracaoEmail } = {}) {
  let cliente;
  async function enviar({ to, subject, html, text, idempotencyKey }) {
    const config = configuracao();
    // Timeout no transporte, sem retries automáticos que possam exceder o prazo.
    if (!cliente) {
      cliente = criarCliente ? criarCliente(config.apiKey) : new Resend(config.apiKey);
      // SDK 6.33.0 imprime o erro do provedor em desenvolvimento por padrão.
      // Versão fixada e teste de regressão para impedir vazamento em qualquer ambiente.
      cliente.logError = () => {};
    }
    try {
      const resultado = await cliente.emails.send(
        { from: config.from, to: [to], subject, html, text },
        { idempotencyKey, signal: AbortSignal.timeout(VERIFICACAO_EMAIL.envioTimeoutMs) },
      );
      if (resultado.error || !resultado.data?.id) throw new Error('Falha de entrega');
    } catch {
      // Não propagar mensagens/objetos do provedor (podem conter dados pessoais).
      const erro = new Error('Serviço de e-mail temporariamente indisponível');
      erro.code = 'EMAIL_SEND_FAILED';
      throw erro;
    }
  }
  async function enviarVerificacao({ email, codigo, desafioId }) {
    const template = templateVerificacaoEmail(codigo, VERIFICACAO_EMAIL.validadeMs / 60000);
    await enviar({ to: email, subject: 'Verifique seu e-mail — BoviTrack', ...template,
      idempotencyKey: `email-verification/${desafioId}` });
  }
  return { enviar, enviarVerificacao };
}

module.exports = { criarEmailService, ...criarEmailService() };
