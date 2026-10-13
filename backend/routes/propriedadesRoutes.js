const express = require("express");
const pool = require("../database/pool")
const { normalizarPaginacao, responderPagina, validarCamposPermitidos, normalizarTextoObrigatorio, normalizarNumeroFinito, normalizarEstado } = require("../utils/validacoes");
const { validarParametroId } = require("../middleware/validacao");
const { registrarErro, registrarEvento } = require("../utils/log");
const {
  excluirPropriedadeComDados,
  obterImpactoExclusaoPropriedade,
} = require("../services/impactoExclusao");

const router = express.Router();
router.param("id", validarParametroId);

function serializarPropriedade(linha, ehAdmin) {
  const {
    proprietario_id,
    proprietario_nome,
    proprietario_email,
    ...propriedade
  } = linha;

  if (!ehAdmin) return propriedade;

  return {
    ...propriedade,
    proprietario: proprietario_id
      ? {
          id: proprietario_id,
          nome: proprietario_nome,
          email: proprietario_email,
        }
      : null,
  };
}

router.get("/propriedades", async (req, res) => {
  try {
    const paginacao = normalizarPaginacao(req.query);
    if (paginacao.erro) return res.status(400).json({ mensagem: paginacao.erro });
    const { limite, offset } = paginacao.valor;
    const resultado = await pool.query(
      `SELECT p.id,
              p.nome,
              p.cidade,
              p.estado,
              p.area,
              p.usuario_id,
              u.id AS proprietario_id,
              u.nome AS proprietario_nome,
              u.email AS proprietario_email
         FROM propriedades p
         LEFT JOIN usuarios u
           ON $1 = 'admin'
          AND u.id = p.usuario_id
        WHERE ($1 = 'admin' OR p.usuario_id = $2)
        ORDER BY p.id
        LIMIT $3 OFFSET $4`,
      [req.usuario.perfil, req.usuario.id, limite + 1, offset],
    );

    const propriedades = resultado.rows.map((linha) =>
      serializarPropriedade(linha, req.usuario.perfil === "admin"),
    );

    res.json(responderPagina(res, propriedades, paginacao.valor));
  } catch (erro) {
    registrarErro("propriedades_rota_erro", erro, req);

    res.status(500).json({
      mensagem: "Erro ao buscar propriedades",
    });
  }
});

router.get("/propriedades/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const resultado = await pool.query(
      `SELECT p.id,
              p.nome,
              p.cidade,
              p.estado,
              p.area,
              p.usuario_id,
              u.id AS proprietario_id,
              u.nome AS proprietario_nome,
              u.email AS proprietario_email
         FROM propriedades p
         LEFT JOIN usuarios u
           ON $2 = 'admin'
          AND u.id = p.usuario_id
        WHERE p.id = $1
          AND ($2 = 'admin' OR p.usuario_id = $3)`,
      [id, req.usuario.perfil, req.usuario.id],
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        mensagem: "Propriedade não encontrada",
      });
    }

    res.json(
      serializarPropriedade(
        resultado.rows[0],
        req.usuario.perfil === "admin",
      ),
    );
  } catch (erro) {
    registrarErro("propriedades_rota_erro", erro, req);

    res.status(500).json({
      mensagem: "Erro ao buscar propriedade",
    });
  }
});

router.get("/propriedades/:id/exclusao-preview", async (req, res) => {
  try {
    const impacto = await obterImpactoExclusaoPropriedade(
      pool,
      req.params.id,
      {
        usuarioId: req.usuario.id,
        perfil: req.usuario.perfil,
      },
    );

    res.json(impacto);
  } catch (erro) {
    if (erro.status) {
      return res.status(erro.status).json({ mensagem: erro.message });
    }

    registrarErro("propriedade_exclusao_preview_erro", erro, req);
    res.status(500).json({
      mensagem: "Não foi possível verificar os registros relacionados",
    });
  }
});

router.post("/propriedades", async (req, res) => {
  try {
    const campos = validarCamposPermitidos(req.body, ["nome", "cidade", "estado", "area"]);
    if (campos.erro) return res.status(400).json({ mensagem: campos.erro });
    const nome = normalizarTextoObrigatorio(req.body.nome, "Nome", 100);
    const cidade = normalizarTextoObrigatorio(req.body.cidade, "Cidade", 100);
    const estado = normalizarEstado(req.body.estado);
    const area = normalizarNumeroFinito(req.body.area, "Área", { minimo: 0.01, maximo: 99999999.99 });
    const erro = nome.erro || cidade.erro || estado.erro || area.erro;
    if (erro) return res.status(400).json({ mensagem: erro });

    const resultado = await pool.query(
      `INSERT INTO propriedades (nome, cidade, estado, area, usuario_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
      [nome.valor, cidade.valor, estado.valor.toUpperCase(), area.valor, req.usuario.id],
    );

    res.status(201).json({
      mensagem: "Propriedade cadastrada com sucesso!",
      propriedade: resultado.rows[0],
    });
  } catch (erro) {
    registrarErro("propriedades_rota_erro", erro, req);

    res.status(500).json({
      mensagem: "Erro ao cadastrar propriedade",
    });
  }
});

router.put("/propriedades/:id", async (req, res) => {
  try {
    const campos = validarCamposPermitidos(req.body, ["nome", "cidade", "estado", "area"]);
    if (campos.erro) return res.status(400).json({ mensagem: campos.erro });
    const { id } = req.params;
    const nome = normalizarTextoObrigatorio(req.body.nome, "Nome", 100);
    const cidade = normalizarTextoObrigatorio(req.body.cidade, "Cidade", 100);
    const estado = normalizarEstado(req.body.estado);
    const area = normalizarNumeroFinito(req.body.area, "Área", { minimo: 0.01, maximo: 99999999.99 });
    const erro = nome.erro || cidade.erro || estado.erro || area.erro;
    if (erro) return res.status(400).json({ mensagem: erro });

    const resultado = await pool.query(
      `UPDATE propriedades
             SET nome = $1,
                 cidade = $2,
                 estado = $3,
                 area = $4
             WHERE id = $5
               AND ($6 = 'admin' OR usuario_id = $7)
             RETURNING *`,
      [
        nome.valor,
        cidade.valor,
        estado.valor.toUpperCase(),
        area.valor,
        id,
        req.usuario.perfil,
        req.usuario.id,
      ],
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        mensagem: "Propriedade não encontrada",
      });
    }

    res.json({
      mensagem: "Propriedade atualizada com sucesso!",
      propriedade: resultado.rows[0],
    });
  } catch (erro) {
    registrarErro("propriedades_rota_erro", erro, req);

    res.status(500).json({
      mensagem: "Erro ao atualizar propriedade",
    });
  }
});

router.delete("/propriedades/:id", async (req, res) => {
  try {
    const resultado = await excluirPropriedadeComDados(req.params.id, {
      usuarioId: req.usuario.id,
      perfil: req.usuario.perfil,
    });

    registrarEvento("aviso", "propriedade_excluida_com_dependencias", {
      request_id: req.id,
      usuario_id: req.usuario.id,
      propriedade_id: Number(req.params.id),
      exclusoes: resultado.exclusoes,
    });

    res.json({
      mensagem: "Propriedade e registros relacionados excluídos com sucesso.",
      propriedade: resultado.propriedade,
      exclusoes: resultado.exclusoes,
    });
  } catch (erro) {
    if (erro.status) {
      return res.status(erro.status).json({ mensagem: erro.message });
    }

    registrarErro("propriedades_rota_erro", erro, req);

    res.status(500).json({
      mensagem: "Não foi possível excluir a propriedade. Nenhum dado foi removido",
    });
  }
});
// =========================
// ANIMAIS
// =========================

module.exports = router;
