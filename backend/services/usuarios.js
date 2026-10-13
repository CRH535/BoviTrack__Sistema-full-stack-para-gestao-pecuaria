const bcrypt = require("bcryptjs");
const pool = require("../database/pool");
const { excluirUsuarioComDados } = require("./impactoExclusao");
const { validarCamposPermitidos } = require("../utils/validacoes");

function criarErroValidacao(mensagem, status = 400) {
  const erro = new Error(mensagem);
  erro.status = status;
  return erro;
}

function validarSenha(senha) {
  if (typeof senha !== "string" || senha.length < 8) {
    throw criarErroValidacao("A senha deve possuir pelo menos 8 caracteres");
  }

  if (Buffer.byteLength(senha, "utf8") > 72) {
    throw criarErroValidacao("A senha deve possuir no máximo 72 bytes em UTF-8");
  }
}

async function criarUsuarioComum(body) {
  // perfil e ativo sao campos legados aceitos, mas nunca definem privilegios.
  const campos = validarCamposPermitidos(body, ["nome", "email", "senha", "perfil", "ativo"]);
  if (campos.erro) throw criarErroValidacao(campos.erro);
  const { nome: nomeRecebido, email: emailRecebido, senha } = body;

  if (
    typeof nomeRecebido !== "string" ||
    typeof emailRecebido !== "string" ||
    typeof senha !== "string"
  ) {
    throw criarErroValidacao("Nome, email e senha são obrigatórios");
  }

  const nome = nomeRecebido.trim();
  const email = emailRecebido.trim().toLowerCase();

  if (!nome || !email || !senha) {
    throw criarErroValidacao("Nome, email e senha são obrigatórios");
  }

  if (nome.length > 120 || email.length > 255) {
    throw criarErroValidacao("Nome ou email excede o tamanho permitido");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw criarErroValidacao("Email inválido");
  }

  validarSenha(senha);

  const emailExistente = await pool.query(
    "SELECT 1 FROM usuarios WHERE email = $1",
    [email],
  );

  if (emailExistente.rows.length > 0) {
    // Mantém custo semelhante ao cadastro válido e reduz enumeração por tempo.
    await bcrypt.hash(senha, 12);
    throw criarErroValidacao("Este email já está cadastrado", 409);
  }

  const hash = await bcrypt.hash(senha, 12);

  try {
    const resultado = await pool.query(
      `INSERT INTO usuarios (nome, email, senha, perfil, ativo)
       VALUES ($1, $2, $3, 'usuario', TRUE)
       RETURNING id, nome, email, perfil, ativo, created_at`,
      [nome, email, hash],
    );

    return resultado.rows[0];
  } catch (erro) {
    if (erro.code === "23505") {
      throw criarErroValidacao("Este email já está cadastrado", 409);
    }

    throw erro;
  }
}

async function alterarAtivoUsuario(usuarioId, ativo, banco = pool) {
  const cliente = await banco.connect();
  try {
    await cliente.query("BEGIN");
    const existente = await cliente.query(
      "SELECT id, perfil FROM usuarios WHERE id = $1 FOR UPDATE",
      [usuarioId],
    );
    if (!existente.rows[0]) throw criarErroValidacao("Usuário não encontrado", 404);
    if (existente.rows[0].perfil === "admin") {
      throw criarErroValidacao("O administrador principal não pode ser ativado ou desativado por esta rota", 403);
    }
    const resultado = await cliente.query(
      `UPDATE usuarios SET ativo = $1 WHERE id = $2
       RETURNING id, nome, email, perfil, ativo, created_at`,
      [ativo, usuarioId],
    );
    if (!ativo) {
      await cliente.query(
        `UPDATE sessoes_refresh
            SET revoked_at = CURRENT_TIMESTAMP, revoke_reason = 'USUARIO_DESATIVADO'
          WHERE usuario_id = $1 AND revoked_at IS NULL`,
        [usuarioId],
      );
    }
    await cliente.query("COMMIT");
    return resultado.rows[0];
  } catch (erro) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw erro;
  } finally {
    cliente.release();
  }
}

module.exports = { alterarAtivoUsuario, criarUsuarioComum, excluirUsuarioComDados, validarSenha };
