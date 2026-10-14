const express = require('express');
const { protegerContraCsrf } = require('../middleware/csrf');
const { limitarRequisicoes } = require('../middleware/rateLimit');
const { obterIpCliente } = require('../utils/rede');
const { normalizarEmail } = require('../services/verificacaoEmail');
const { VERIFICACAO_EMAIL: config } = require('../config/email');
const controller = require('../controllers/verificacaoEmailController');
const router = express.Router();

const envioIp = limitarRequisicoes({ escopo: 'EMAIL_ENVIO_IP', limite: config.envioIpPorHora,
  janelaMs: config.janelaHoraMs, obterChave: obterIpCliente });
const validacaoIp = limitarRequisicoes({ escopo: 'EMAIL_VALIDACAO_IP', limite: config.validacaoIpPorMinuto,
  janelaMs: config.janelaMinutoMs, obterChave: obterIpCliente });
const validacaoEmail = limitarRequisicoes({ escopo: 'EMAIL_VALIDACAO_CONTA', limite: config.validacaoPorHora,
  janelaMs: config.janelaHoraMs, obterChave: (req) => normalizarEmail(req.body?.email).slice(0, 255) });

router.post('/auth/email/reenviar', protegerContraCsrf, envioIp, controller.prepararVerificacao, controller.reenviarCodigo);
router.post('/auth/email/verificar', protegerContraCsrf, validacaoIp, controller.prepararVerificacao, validacaoEmail, controller.verificarCodigo);

module.exports = router;
