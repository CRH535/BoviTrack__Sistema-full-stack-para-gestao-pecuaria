const { criarUsuarioComum } = require("../services/usuarios");
const { registrarEvento, registrarErro } = require("../utils/log");
const verificacao = require('../services/verificacaoEmail');
const { VERIFICACAO_EMAIL, verificacaoEmailObrigatoria } = require('../config/email');

async function responderCadastroPendente(req, res, inicio) {
  const email = verificacao.normalizarEmail(req.body.email);
  const ticket = verificacao.criarTicket(email);
  await verificacao.aguardarRespostaPublica(inicio);
  return res.status(202).json({ mensagem: 'Se os dados puderem ser utilizados, enviaremos um código de verificação.',
    verificacao: { ticket, emailMascarado: verificacao.mascararEmail(email), envio: 'SOLICITADO',
      validadeMinutos: VERIFICACAO_EMAIL.validadeMs / 60000, retryAfter: VERIFICACAO_EMAIL.cooldownMs / 1000 } });
}

async function responderCadastroOpcional(res, inicio) {
  // Mesmo corpo/status/prazo para cadastro novo e e-mail ja cadastrado.
  // Nao emitir ticket, codigo nem dados de conta quando a exigencia esta desligada.
  await verificacao.aguardarRespostaPublica(inicio);
  return res.status(201).json({ mensagem: 'Se os dados puderem ser utilizados, sua conta esta pronta. Entre para continuar.' });
}

async function responderCriacaoUsuario(req, res, mensagemSucesso, opcoes = {}) {
  const inicio = Date.now();
  try {
    const usuario = await criarUsuarioComum(req.body);

    if (opcoes.cadastroPublico && verificacaoEmailObrigatoria()) {
      // Conta permanece recuperável mesmo se transporte/configuração falharem.
      await verificacao.solicitarCodigo(usuario.email).catch((erro) => registrarErro('email_cadastro_envio_erro', erro, req));
      return await responderCadastroPendente(req, res, inicio);
    }

    if (opcoes.cadastroPublico) return await responderCadastroOpcional(res, inicio);

    registrarEvento("info", "usuario_criado_por_admin", {
      request_id: req.id,
      administrador_id: req.usuario?.id,
      usuario_id: usuario.id,
    });
    res.status(201).json({ mensagem: mensagemSucesso, usuario });
  } catch (erro) {
    if (opcoes.cadastroPublico && erro.status === 409) {
      registrarEvento("aviso", "cadastro_email_indisponivel", {
        request_id: req.id,
      });
      return verificacaoEmailObrigatoria()
        ? await responderCadastroPendente(req, res, inicio)
        : await responderCadastroOpcional(res, inicio);
    }
    if (erro.status) {
      return res.status(erro.status).json({ mensagem: erro.message });
    }

    registrarErro("erro_cadastro_usuario", erro, req);
    res.status(500).json({ mensagem: "Erro ao cadastrar usuário" });
  }
}

module.exports = { responderCriacaoUsuario };
