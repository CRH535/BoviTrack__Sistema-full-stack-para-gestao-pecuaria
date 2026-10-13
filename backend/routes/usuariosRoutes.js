const express = require("express");
const pool = require("../database/pool");
const { somenteAdmin, exigirAutenticacaoRecente } = require("../middleware/autenticacao");
const { responderCriacaoUsuario } = require("../controllers/usuariosController")
const { alterarAtivoUsuario, excluirUsuarioComDados } = require("../services/usuarios");
const { limparCookieRefresh } = require("../services/sessoes");
const { obterImpactoExclusaoUsuario } = require("../services/impactoExclusao");
const { normalizarPaginacao, responderPagina, validarCamposPermitidos } = require("../utils/validacoes");
const { validarParametroId } = require("../middleware/validacao");
const { registrarErro, registrarEvento } = require("../utils/log");

const router = express.Router();
router.param("id", validarParametroId);

router.post("/usuarios", somenteAdmin, async (req, res) => {
  await responderCriacaoUsuario(req, res, "Usuário cadastrado com sucesso!");
});

router.get("/auth/me", (req, res) => {
  res.json({ usuario: req.usuario });
});

router.get("/usuarios", somenteAdmin, async (req, res) => {
  try {
    const paginacao = normalizarPaginacao(req.query);
    if (paginacao.erro) return res.status(400).json({ mensagem: paginacao.erro });
    const { limite, offset } = paginacao.valor;
    const resultado = await pool.query(
      `SELECT id, nome, email, perfil, ativo, created_at
         FROM usuarios
        ORDER BY id
        LIMIT $1 OFFSET $2`,
      [limite + 1, offset],
    );

    res.json(responderPagina(res, resultado.rows, paginacao.valor));
  } catch (erro) {
    registrarErro("usuarios_rota_erro", erro, req);
    res.status(500).json({ mensagem: "Erro ao buscar usuários" });
  }
});

router.put("/usuarios/me", async (req, res) => {
  try {
    const campos = validarCamposPermitidos(req.body, ["nome", "email"]);
    if (campos.erro) return res.status(400).json({ mensagem: campos.erro });
    const { nome: nomeRecebido, email: emailRecebido } = req.body;

    if (typeof nomeRecebido !== "string" || typeof emailRecebido !== "string") {
      return res.status(400).json({ mensagem: "Nome e email são obrigatórios" });
    }

    const nome = nomeRecebido.trim();
    const email = emailRecebido.trim().toLowerCase();

    if (!nome || !email) {
      return res.status(400).json({ mensagem: "Nome e email são obrigatórios" });
    }

    if (nome.length > 120 || email.length > 255) {
      return res.status(400).json({ mensagem: "Nome ou email excede o tamanho permitido" });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ mensagem: "Email inválido" });
    }

    const resultado = await pool.query(
      `UPDATE usuarios
          SET nome = $1,
              email = $2
        WHERE id = $3
        RETURNING id, nome, email, perfil, ativo, created_at`,
      [nome, email, req.usuario.id],
    );

    res.json({
      mensagem: "Conta atualizada com sucesso!",
      usuario: resultado.rows[0],
    });
  } catch (erro) {
    if (erro.code === "23505") {
      return res.status(409).json({ mensagem: "Este email já está cadastrado" });
    }

    registrarErro("usuarios_rota_erro", erro, req);
    res.status(500).json({ mensagem: "Erro ao atualizar conta" });
  }
});

router.get("/usuarios/me/exclusao-preview", async (req, res) => {
  try {
    const impacto = await obterImpactoExclusaoUsuario(pool, req.usuario.id);
    res.json(impacto);
  } catch (erro) {
    if (erro.status) {
      return res.status(erro.status).json({ mensagem: erro.message });
    }

    registrarErro("usuario_exclusao_preview_erro", erro, req);
    res.status(500).json({
      mensagem: "Não foi possível verificar os registros relacionados",
    });
  }
});

router.delete("/usuarios/me", async (req, res) => {
  const campos = validarCamposPermitidos(req.body || {}, ["confirmacao"]);
  if (campos.erro) return res.status(400).json({ mensagem: campos.erro });
  if (req.body?.confirmacao !== "EXCLUIR") {
    return res.status(400).json({
      mensagem: "Digite EXCLUIR para confirmar a exclusão da conta",
    });
  }

  try {
    await excluirUsuarioComDados(req.usuario.id);
    limparCookieRefresh(res);
    registrarEvento("aviso", "conta_excluida_pelo_usuario", {
      request_id: req.id,
      usuario_id: req.usuario.id,
    });

    res.json({ mensagem: "Sua conta foi excluída com sucesso" });
  } catch (erro) {
    if (erro.status) {
      return res.status(erro.status).json({ mensagem: erro.message });
    }

    registrarErro("usuarios_rota_erro", erro, req);
    res.status(500).json({
      mensagem: "Não foi possível excluir sua conta. Nenhum dado foi removido",
    });
  }
});

router.get("/usuarios/:id", somenteAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT id, nome, email, perfil, ativo, created_at
         FROM usuarios
        WHERE id = $1`,
      [req.params.id],
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensagem: "Usuário não encontrado" });
    }

    res.json(resultado.rows[0]);
  } catch (erro) {
    registrarErro("usuarios_rota_erro", erro, req);
    res.status(500).json({ mensagem: "Erro ao buscar usuário" });
  }
});

router.get(
  "/usuarios/:id/exclusao-preview",
  somenteAdmin,
  exigirAutenticacaoRecente(),
  async (req, res) => {
    if (Number(req.params.id) === Number(req.usuario.id)) {
      return res.status(403).json({
        mensagem: "O administrador não pode excluir a própria conta",
      });
    }

    try {
      const impacto = await obterImpactoExclusaoUsuario(pool, req.params.id);
      res.json(impacto);
    } catch (erro) {
      if (erro.status) {
        return res.status(erro.status).json({ mensagem: erro.message });
      }

      registrarErro("usuario_exclusao_preview_erro", erro, req);
      res.status(500).json({
        mensagem: "Não foi possível verificar os registros relacionados",
      });
    }
  },
);

router.put("/usuarios/:id", somenteAdmin, async (req, res) => {
  try {
    const campos = validarCamposPermitidos(req.body, ["nome", "email"]);
    if (campos.erro) return res.status(400).json({ mensagem: campos.erro });
    const { nome: nomeRecebido, email: emailRecebido } = req.body;

    if (typeof nomeRecebido !== "string" || typeof emailRecebido !== "string") {
      return res.status(400).json({ mensagem: "Nome e email são obrigatórios" });
    }

    const nome = nomeRecebido.trim();
    const email = emailRecebido.trim().toLowerCase();

    if (!nome || !email) {
      return res.status(400).json({ mensagem: "Nome e email são obrigatórios" });
    }

    if (nome.length > 120 || email.length > 255) {
      return res.status(400).json({ mensagem: "Nome ou email excede o tamanho permitido" });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ mensagem: "Email inválido" });
    }

    const resultado = await pool.query(
      `UPDATE usuarios
          SET nome = $1,
              email = $2
        WHERE id = $3
        RETURNING id, nome, email, perfil, ativo, created_at`,
      [nome, email, req.params.id],
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensagem: "Usuário não encontrado" });
    }

    res.json({
      mensagem: "Usuário atualizado com sucesso!",
      usuario: resultado.rows[0],
    });
    registrarEvento("info", "usuario_editado_por_admin", {
      request_id: req.id,
      administrador_id: req.usuario.id,
      usuario_id: Number(req.params.id),
    });
  } catch (erro) {
    if (erro.code === "23505") {
      return res.status(409).json({ mensagem: "Este email já está cadastrado" });
    }

    registrarErro("usuarios_rota_erro", erro, req);
    res.status(500).json({ mensagem: "Erro ao atualizar usuário" });
  }
});

router.put("/usuarios/:id/ativo", somenteAdmin, exigirAutenticacaoRecente(), async (req, res) => {
  try {
    const campos = validarCamposPermitidos(req.body, ["ativo"]);
    if (campos.erro) return res.status(400).json({ mensagem: campos.erro });
    const { ativo } = req.body;

    if (typeof ativo !== "boolean") {
      return res.status(400).json({ mensagem: "O campo ativo deve ser verdadeiro ou falso" });
    }

    const usuario = await alterarAtivoUsuario(req.params.id, ativo);

    res.json({
      mensagem: ativo
        ? "Usuário ativado com sucesso!"
        : "Usuário desativado com sucesso!",
      usuario,
    });
    registrarEvento("info", "usuario_status_alterado", {
      request_id: req.id,
      administrador_id: req.usuario.id,
      usuario_id: Number(req.params.id),
      ativo,
    });
  } catch (erro) {
    if (erro.status) return res.status(erro.status).json({ mensagem: erro.message });
    registrarErro("usuarios_rota_erro", erro, req);
    res.status(500).json({ mensagem: "Erro ao alterar situação do usuário" });
  }
});

router.delete("/usuarios/:id", somenteAdmin, exigirAutenticacaoRecente(), async (req, res) => {
  if (Number(req.params.id) === Number(req.usuario.id)) {
    return res.status(403).json({
      mensagem: "O administrador não pode excluir a própria conta",
    });
  }

  try {
    const resultado = await excluirUsuarioComDados(req.params.id);

    registrarEvento("aviso", "usuario_excluido_por_admin", {
      request_id: req.id,
      administrador_id: req.usuario.id,
      usuario_id: Number(req.params.id),
    });

    res.json({
      mensagem: "Usuário e dados vinculados excluídos com sucesso",
      usuario: resultado.usuario,
    });
  } catch (erro) {
    if (erro.status) {
      return res.status(erro.status).json({ mensagem: erro.message });
    }

    registrarErro("usuarios_rota_erro", erro, req);
    res.status(500).json({
      mensagem: "Não foi possível excluir o usuário. Nenhum dado foi removido",
    });
  }
});

// =========================
// DASHBOARD
// =========================

module.exports = router;
