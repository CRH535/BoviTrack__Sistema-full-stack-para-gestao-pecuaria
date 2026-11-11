const express = require("express");
const { rotaComBanco } = require("../database/contextoRls");
const { normalizarPaginacao, responderPagina, validarCamposPermitidos, normalizarTextoObrigatorio, normalizarTextoOpcional } = require("../utils/validacoes");
const { validarParametroId } = require("../middleware/validacao");
const { registrarErro } = require("../utils/log");

const router = express.Router();
router.param("id", validarParametroId);

router.post("/vacinas", rotaComBanco(async (req, res, cliente, responder) => {
  try {
    const campos = validarCamposPermitidos(req.body, ["nome", "fabricante", "descricao"]);
    if (campos.erro) return responder(400, { mensagem: campos.erro });
    const nome = normalizarTextoObrigatorio(req.body.nome, "Nome da vacina", 100);
    const fabricante = normalizarTextoOpcional(req.body.fabricante, "Fabricante", 100);
    const descricao = normalizarTextoOpcional(req.body.descricao, "Descrição", 255);
    const erro = nome.erro || fabricante.erro || descricao.erro;
    if (erro) return responder(400, { mensagem: erro });

    const resultado = await cliente.query(
      `INSERT INTO vacinas
             (nome, fabricante, descricao, usuario_id)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
      [nome.valor, fabricante.valor, descricao.valor, req.usuario.id],
    );

    responder(201, {
      mensagem: "Vacina cadastrada com sucesso!",
      vacina: resultado.rows[0],
    });
  } catch (erro) {
    registrarErro("vacinas_rota_erro", erro, req);

    responder(500, {
      mensagem: "Erro ao cadastrar vacina",
    });
  }
}));

router.get("/vacinas", rotaComBanco(async (req, res, cliente, responder) => {
  try {
    const paginacao = normalizarPaginacao(req.query);
    if (paginacao.erro) return responder(400, { mensagem: paginacao.erro });
    const { limite, offset } = paginacao.valor;
    const resultado = await cliente.query(
      `SELECT id, nome, fabricante, descricao, usuario_id
         FROM vacinas
        WHERE ($1 = 'admin' OR usuario_id = $2)
        ORDER BY id
        LIMIT $3 OFFSET $4`,
      [req.usuario.perfil, req.usuario.id, limite + 1, offset],
    );

    responder(200, responderPagina(res, resultado.rows, paginacao.valor));
  } catch (erro) {
    registrarErro("vacinas_rota_erro", erro, req);

    responder(500, {
      mensagem: "Erro ao buscar vacinas",
    });
  }
}));

router.get("/vacinas/:id", rotaComBanco(async (req, res, cliente, responder) => {
  try {
    const { id } = req.params;

    const resultado = await cliente.query(
      `SELECT id, nome, fabricante, descricao, usuario_id
         FROM vacinas
        WHERE id = $1
          AND ($2 = 'admin' OR usuario_id = $3)`,
      [id, req.usuario.perfil, req.usuario.id],
    );

    if (resultado.rows.length === 0) {
      return responder(404, {
        mensagem: "Vacina não encontrada",
      });
    }

    responder(200, resultado.rows[0]);
  } catch (erro) {
    registrarErro("vacinas_rota_erro", erro, req);

    responder(500, {
      mensagem: "Erro ao buscar vacina",
    });
  }
}));

router.put("/vacinas/:id", rotaComBanco(async (req, res, cliente, responder) => {
  try {
    const campos = validarCamposPermitidos(req.body, ["nome", "fabricante", "descricao"]);
    if (campos.erro) return responder(400, { mensagem: campos.erro });
    const { id } = req.params;

    const nome = normalizarTextoObrigatorio(req.body.nome, "Nome da vacina", 100);
    const fabricante = normalizarTextoOpcional(req.body.fabricante, "Fabricante", 100);
    const descricao = normalizarTextoOpcional(req.body.descricao, "Descrição", 255);
    const erro = nome.erro || fabricante.erro || descricao.erro;
    if (erro) return responder(400, { mensagem: erro });

    const resultado = await cliente.query(
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
      return responder(404, {
        mensagem: "Vacina não encontrada",
      });
    }

    responder(200, {
      mensagem: "Vacina atualizada com sucesso!",
      vacina: resultado.rows[0],
    });
  } catch (erro) {
    registrarErro("vacinas_rota_erro", erro, req);

    responder(500, {
      mensagem: "Erro ao atualizar vacina",
    });
  }
}));

router.delete("/vacinas/:id", rotaComBanco(async (req, res, cliente, responder) => {
  try {
    const { id } = req.params;

    const resultado = await cliente.query(
      `DELETE FROM vacinas
             WHERE id = $1
               AND ($2 = 'admin' OR usuario_id = $3)
             RETURNING *`,
      [id, req.usuario.perfil, req.usuario.id],
    );

    if (resultado.rows.length === 0) {
      return responder(404, {
        mensagem: "Vacina não encontrada",
      });
    }

    responder(200, {
      mensagem: "Vacina excluída com sucesso!",
      vacina: resultado.rows[0],
    });
  } catch (erro) {
    registrarErro("vacinas_rota_erro", erro, req);

    responder(500, {
      mensagem: "Erro ao excluir vacina",
    });
  }
}));

// =========================
// VACINAÇÕES
// =========================

module.exports = router;
