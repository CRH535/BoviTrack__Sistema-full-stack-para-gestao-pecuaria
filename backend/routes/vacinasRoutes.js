const express = require("express");
const pool = require("../database/pool")
const { normalizarPaginacao, responderPagina, validarCamposPermitidos, normalizarTextoObrigatorio, normalizarTextoOpcional } = require("../utils/validacoes");
const { validarParametroId } = require("../middleware/validacao");
const { registrarErro } = require("../utils/log");

const router = express.Router();
router.param("id", validarParametroId);

router.post("/vacinas", async (req, res) => {
  try {
    const campos = validarCamposPermitidos(req.body, ["nome", "fabricante", "descricao"]);
    if (campos.erro) return res.status(400).json({ mensagem: campos.erro });
    const nome = normalizarTextoObrigatorio(req.body.nome, "Nome da vacina", 100);
    const fabricante = normalizarTextoOpcional(req.body.fabricante, "Fabricante", 100);
    const descricao = normalizarTextoOpcional(req.body.descricao, "Descrição", 255);
    const erro = nome.erro || fabricante.erro || descricao.erro;
    if (erro) return res.status(400).json({ mensagem: erro });

    const resultado = await pool.query(
      `INSERT INTO vacinas
             (nome, fabricante, descricao, usuario_id)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
      [nome.valor, fabricante.valor, descricao.valor, req.usuario.id],
    );

    res.status(201).json({
      mensagem: "Vacina cadastrada com sucesso!",
      vacina: resultado.rows[0],
    });
  } catch (erro) {
    registrarErro("vacinas_rota_erro", erro, req);

    res.status(500).json({
      mensagem: "Erro ao cadastrar vacina",
    });
  }
});

router.get("/vacinas", async (req, res) => {
  try {
    const paginacao = normalizarPaginacao(req.query);
    if (paginacao.erro) return res.status(400).json({ mensagem: paginacao.erro });
    const { limite, offset } = paginacao.valor;
    const resultado = await pool.query(
      `SELECT id, nome, fabricante, descricao, usuario_id
         FROM vacinas
        WHERE ($1 = 'admin' OR usuario_id = $2)
        ORDER BY id
        LIMIT $3 OFFSET $4`,
      [req.usuario.perfil, req.usuario.id, limite + 1, offset],
    );

    res.json(responderPagina(res, resultado.rows, paginacao.valor));
  } catch (erro) {
    registrarErro("vacinas_rota_erro", erro, req);

    res.status(500).json({
      mensagem: "Erro ao buscar vacinas",
    });
  }
});

router.get("/vacinas/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const resultado = await pool.query(
      `SELECT id, nome, fabricante, descricao, usuario_id
         FROM vacinas
        WHERE id = $1
          AND ($2 = 'admin' OR usuario_id = $3)`,
      [id, req.usuario.perfil, req.usuario.id],
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        mensagem: "Vacina não encontrada",
      });
    }

    res.json(resultado.rows[0]);
  } catch (erro) {
    registrarErro("vacinas_rota_erro", erro, req);

    res.status(500).json({
      mensagem: "Erro ao buscar vacina",
    });
  }
});

router.put("/vacinas/:id", async (req, res) => {
  try {
    const campos = validarCamposPermitidos(req.body, ["nome", "fabricante", "descricao"]);
    if (campos.erro) return res.status(400).json({ mensagem: campos.erro });
    const { id } = req.params;

    const nome = normalizarTextoObrigatorio(req.body.nome, "Nome da vacina", 100);
    const fabricante = normalizarTextoOpcional(req.body.fabricante, "Fabricante", 100);
    const descricao = normalizarTextoOpcional(req.body.descricao, "Descrição", 255);
    const erro = nome.erro || fabricante.erro || descricao.erro;
    if (erro) return res.status(400).json({ mensagem: erro });

    const resultado = await pool.query(
      `UPDATE vacinas
             SET nome = $1,
                 fabricante = $2,
                 descricao = $3
             WHERE id = $4
               AND ($5 = 'admin' OR usuario_id = $6)
             RETURNING *`,
      [nome.valor, fabricante.valor, descricao.valor, id, req.usuario.perfil, req.usuario.id],
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        mensagem: "Vacina não encontrada",
      });
    }

    res.json({
      mensagem: "Vacina atualizada com sucesso!",
      vacina: resultado.rows[0],
    });
  } catch (erro) {
    registrarErro("vacinas_rota_erro", erro, req);

    res.status(500).json({
      mensagem: "Erro ao atualizar vacina",
    });
  }
});

router.delete("/vacinas/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const resultado = await pool.query(
      `DELETE FROM vacinas
             WHERE id = $1
               AND ($2 = 'admin' OR usuario_id = $3)
             RETURNING *`,
      [id, req.usuario.perfil, req.usuario.id],
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        mensagem: "Vacina não encontrada",
      });
    }

    res.json({
      mensagem: "Vacina excluída com sucesso!",
      vacina: resultado.rows[0],
    });
  } catch (erro) {
    registrarErro("vacinas_rota_erro", erro, req);

    res.status(500).json({
      mensagem: "Erro ao excluir vacina",
    });
  }
});

// =========================
// VACINAÇÕES
// =========================

module.exports = router;
