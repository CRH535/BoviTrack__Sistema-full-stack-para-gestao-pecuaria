import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// Config do Playwright garante banco descartável local. O factory troca apenas
// o transporte da Resend; verificação, HMAC e PostgreSQL são os mesmos da API.
export async function prepararCodigoEmail(db, email) {
  const { criarVerificacaoEmailService } = require('../../../backend/services/verificacaoEmail');
  await db.query(`UPDATE verificacoes_email SET criado_em=criado_em-INTERVAL '61 seconds'
    WHERE usuario_id=(SELECT id FROM usuarios WHERE email=$1)`, [email]);
  let codigo;
  const service = criarVerificacaoEmailService({ banco: db, enviar: async (dados) => { codigo = dados.codigo; } });
  const envio = await service.solicitarCodigo(email);
  if (envio.estado !== 'ENVIADO') throw new Error('Fixture de verificação indisponível');
  return codigo;
}
