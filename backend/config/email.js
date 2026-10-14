const VERIFICACAO_EMAIL = Object.freeze({
  digitos: 6,
  validadeMs: 10 * 60 * 1000,
  maxTentativas: 5,
  cooldownMs: 60 * 1000,
  ticketValidade: '30m',
  envioTimeoutMs: 3000,
  respostaPublicaMinMs: 3500,
  validacaoPublicaMinMs: 250,
  janelaHoraMs: 60 * 60 * 1000,
  janelaDiaMs: 24 * 60 * 60 * 1000,
  janelaMinutoMs: 60 * 1000,
  envioPorHora: 5,
  envioPorDia: 12,
  envioIpPorHora: 20,
  validacaoPorHora: 30,
  validacaoIpPorMinuto: 60,
});

function obterConfiguracaoEmail(ambiente = process.env) {
  const apiKey = ambiente.RESEND_API_KEY || '';
  const pepper = ambiente.EMAIL_VERIFICATION_PEPPER || '';
  const from = ambiente.EMAIL_FROM || 'BoviTrack <onboarding@resend.dev>';
  if (!apiKey.trim()) throw new Error('RESEND_API_KEY não foi configurada');
  if (Buffer.byteLength(pepper, 'utf8') < 32) {
    throw new Error('EMAIL_VERIFICATION_PEPPER deve possuir pelo menos 32 bytes');
  }
  if (/[\r\n]/.test(from) || !/^[^<>]+<[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>$/.test(from)) {
    throw new Error('EMAIL_FROM deve usar Nome <email@dominio>');
  }
  return { apiKey, pepper, from };
}

module.exports = { VERIFICACAO_EMAIL, obterConfiguracaoEmail };
