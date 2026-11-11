// Mock carregado somente pelos testes; nenhum envio real, flag ou bypass no runtime.
const assert = require('node:assert/strict');
const url = new URL(process.env.DATABASE_URL || 'http://ausente.invalid');
if (process.env.NODE_ENV !== 'test' || process.env.ALLOW_TEST_DB_WRITES !== 'true' || url.search || url.hash ||
    !['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    !url.pathname.startsWith('/bovitrack_test_')) throw new Error('Fixture de e-mail exige banco descartável local');
const mensagens = new Map();
const emailService = require('../../services/emailService');
emailService.enviarVerificacao = async (dados) => { mensagens.set(dados.email, { ...dados }); };

async function verificarFixture(email) {
  const service = require('../../services/verificacaoEmail');
  const envio = mensagens.get(email);
  assert.ok(envio, 'Fixture recebeu código pelo mock');
  const resultado = await service.verificarCodigo(email, envio.codigo);
  assert.equal(resultado.estado, 'EMAIL_VERIFIED');
}
module.exports = { mensagens, verificarFixture };
