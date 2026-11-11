const express = require("express");
const { rotaComBanco } = require("../database/contextoRls");
const { converterId, normalizarPaginacao, responderPagina, validarCamposPermitidos, normalizarTextoObrigatorio, normalizarTextoOpcional } = require("../utils/validacoes")
const { validarParametroId } = require("../middleware/validacao");
const { registrarErro } = require("../utils/log");

const router = express.Router();
router.param("id", validarParametroId);

router.get("/lotes", rotaComBanco(async (req, res, cliente, responder) => {
  try {
    const paginacao = normalizarPaginacao(req.query);
    if (paginacao.erro) return responder(400, { mensagem: paginacao.erro });
    const { limite, offset } = paginacao.valor;
    const resultado = await cliente.query(`
            SELECT
                lotes.id,
                lotes.nome,
                lotes.descricao,
                lotes.propriedade_id,
                propriedades.nome AS propriedade,
                (SELECT COUNT(*)::INTEGER
                   FROM animais_lotes al
                  WHERE al.lote_id = lotes.id) AS quantidade_animais
            FROM lotes
            JOIN propriedades
                ON lotes.propriedade_id = propriedades.id
            WHERE ($1 = 'admin' OR propriedades.usuario_id = $2)
            ORDER BY lotes.id
            LIMIT $3 OFFSET $4
        `, [req.usuario.perfil, req.usuario.id, limite + 1, offset]);

    responder(200, responderPagina(res, resultado.rows, paginacao.valor));
  } catch (erro) {
    registrarErro("lotes_rota_erro", erro, req);

    responder(500, {
      mensagem: "Erro ao buscar lotes",
    });
  }
}));

router.get("/lotes/:id", rotaComBanco(async (req, res, cliente, responder) => {
  try {
    const { id } = req.params;

    const resultado = await cliente.query(
      `SELECT
                lotes.id,
                lotes.nome,
                lotes.descricao,
                lotes.propriedade_id,
                propriedades.nome AS propriedade,
                (SELECT COUNT(*)::INTEGER
                   FROM animais_lotes al
                  WHERE al.lote_id = lotes.id) AS quantidade_animais
             FROM lotes
             JOIN propriedades
                ON lotes.propriedade_id = propriedades.id
             WHERE lotes.id = $1
               AND ($2 = 'admin' OR propriedades.usuario_id = $3)`,
      [id, req.usuario.perfil, req.usuario.id],
    );

    if (resultado.rows.length === 0) {
      return responder(404, {
        mensagem: "Lote não encontrado",
      });
    }

    responder(200, resultado.rows[0]);
  } catch (erro) {
    registrarErro("lotes_rota_erro", erro, req);

    responder(500, {
      mensagem: "Erro ao buscar lote",
    });
  }
}));

router.post("/lotes", rotaComBanco(async (req, res, cliente, responder) => {
  try {
    const campos = validarCamposPermitidos(req.body, ["nome", "descricao", "propriedade_id"]);
    if (campos.erro) return responder(400, { mensagem: campos.erro });
    const nome = normalizarTextoObrigatorio(req.body.nome, "Nome", 100);
    const descricao = normalizarTextoOpcional(req.body.descricao, "Descrição", 255);
    const propriedade_id = converterId(req.body.propriedade_id);
    const erro = nome.erro || descricao.erro || (!propriedade_id && "Propriedade inválida");
    if (erro) return responder(400, { mensagem: erro });

    const propriedadeExiste = await cliente.query(
      `SELECT id
         FROM propriedades
        WHERE id = $1
          AND ($2 = 'admin' OR usuario_id = $3)`,
      [propriedade_id, req.usuario.perfil, req.usuario.id],
    );

    if (propriedadeExiste.rows.length === 0) {
      return responder(404, {
        mensagem: "Propriedade não encontrada",
      });
    }

    const resultado = await cliente.query(
      `INSERT INTO lotes
            (nome, descricao, propriedade_id)
            VALUES ($1, $2, $3)
            RETURNING *`,
      [nome.valor, descricao.valor, propriedade_id],
    );

    responder(201, {
      mensagem: "Lote cadastrado com sucesso!",
      lote: resultado.rows[0],
    });
  } catch (erro) {
    registrarErro("lotes_rota_erro", erro, req);

    responder(500, {
      mensagem: "Erro ao cadastrar lote",
    });
  }
}));

router.put("/lotes/:id", rotaComBanco(async (req, res, cliente, responder) => {
  try {
    const campos = validarCamposPermitidos(req.body, ["nome", "descricao", "propriedade_id"]);
    if (campos.erro) return responder(400, { mensagem: campos.erro });
    const { id } = req.params;

    const nome = normalizarTextoObrigatorio(req.body.nome, "Nome", 100);
    const descricao = normalizarTextoOpcional(req.body.descricao, "Descrição", 255);
    const propriedade_id = converterId(req.body.propriedade_id);
    const erro = nome.erro || descricao.erro || (!propriedade_id && "Propriedade inválida");
    if (erro) return responder(400, { mensagem: erro });

    const loteAtual = await cliente.query(
      `SELECT l.id
         FROM lotes l
         JOIN propriedades p ON p.id = l.propriedade_id
        WHERE l.id = $1
          AND ($2 = 'admin' OR p.usuario_id = $3)`,
      [id, req.usuario.perfil, req.usuario.id],
    );

    if (loteAtual.rows.length === 0) {
      return responder(404, { mensagem: "Lote não encontrado" });
    }

    const propriedadeExiste = await cliente.query(
      `SELECT id
         FROM propriedades
        WHERE id = $1
          AND ($2 = 'admin' OR usuario_id = $3)`,
      [propriedade_id, req.usuario.perfil, req.usuario.id],
    );

    if (propriedadeExiste.rows.length === 0) {
      return responder(404, {
        mensagem: "Propriedade não encontrada",
      });
    }

    const animalIncompativel = await cliente.query(
      `SELECT 1
         FROM animais_lotes al
         JOIN animais a ON a.id = al.animal_id
        WHERE al.lote_id = $1
          AND a.propriedade_id <> $2
       UNION ALL
       SELECT 1 FROM pesagens pe
        JOIN animais ap ON ap.id = pe.animal_id
        WHERE pe.lote_id = $1 AND ap.propriedade_id <> $2
       UNION ALL
       SELECT 1 FROM desmamas de
        JOIN animais ad ON ad.id = de.animal_id
        WHERE de.lote_destino_id = $1 AND ad.propriedade_id <> $2
        LIMIT 1`,
      [id, propriedade_id],
    );

    if (animalIncompativel.rows.length > 0) {
      return responder(400, {
        mensagem: "O lote possui animais incompatíveis com a nova propriedade",
      });
    }

    const resultado = await cliente.query(
      `UPDATE lotes
             SET nome = $1,
                 descricao = $2,
                 propriedade_id = $3
             WHERE id = $4
               AND (
                 $5 = 'admin'
                 OR EXISTS (
                   SELECT 1
                     FROM propriedades p
                    WHERE p.id = lotes.propriedade_id
                      AND p.usuario_id = $6
                 )
               )
             RETURNING *`,
      [
        nome.valor,
        descricao.valor,
        propriedade_id,
        id,
        req.usuario.perfil,
        req.usuario.id,
      ],
    );

    if (resultado.rows.length === 0) {
      return responder(404, {
        mensagem: "Lote não encontrado",
      });
    }

    responder(200, {
      mensagem: "Lote atualizado com sucesso!",
      lote: resultado.rows[0],
    });
  } catch (erro) {
    registrarErro("lotes_rota_erro", erro, req);

    responder(500, {
      mensagem: "Erro ao atualizar lote",
    });
  }
}));

router.delete("/lotes/:id", rotaComBanco(async (req, res, cliente, responder) => {
  try {
    const { id } = req.params;

    const resultado = await cliente.query(
      `DELETE FROM lotes l
             USING propriedades p
             WHERE l.id = $1
               AND p.id = l.propriedade_id
               AND ($2 = 'admin' OR p.usuario_id = $3)
             RETURNING l.*`,
      [id, req.usuario.perfil, req.usuario.id],
    );

    if (resultado.rows.length === 0) {
      return responder(404, {
        mensagem: "Lote não encontrado",
      });
    }

    responder(200, {
      mensagem: "Lote excluído com sucesso!",
      lote: resultado.rows[0],
    });
  } catch (erro) {
    registrarErro("lotes_rota_erro", erro, req);

    responder(500, {
      mensagem: "Erro ao excluir lote",
    });
  }
}));

// =========================
// ANIMAIS ↔ LOTES
// =========================

router.post("/lotes/:id/animais", rotaComBanco(async (req, res, cliente, responder) => {
  try {
    const campos = validarCamposPermitidos(req.body, ["animal_id"]);
    if (campos.erro) return responder(400, { mensagem: campos.erro });
    const { id } = req.params;
    const { animal_id } = req.body;
    const loteId = converterId(id);
    const animalId = converterId(animal_id);

    if (!loteId || !animalId) {
      return responder(400, {
        mensagem: "Lote e animal devem possuir IDs válidos",
      });
    }

    const loteExiste = await cliente.query(
      `SELECT l.*, p.usuario_id
         FROM lotes l
         JOIN propriedades p ON p.id = l.propriedade_id
        WHERE l.id = $1
          AND ($2 = 'admin' OR p.usuario_id = $3)`,
      [loteId, req.usuario.perfil, req.usuario.id],
    );

    if (loteExiste.rows.length === 0) {
      return responder(404, {
        mensagem: "Lote não encontrado",
      });
    }

    const animalExiste = await cliente.query(
      `SELECT a.*, p.usuario_id
         FROM animais a
         JOIN propriedades p ON p.id = a.propriedade_id
        WHERE a.id = $1
          AND ($2 = 'admin' OR p.usuario_id = $3)`,
      [animalId, req.usuario.perfil, req.usuario.id],
    );

    if (animalExiste.rows.length === 0) {
      return responder(404, {
        mensagem: "Animal não encontrado",
      });
    }

    if (
      loteExiste.rows[0].propriedade_id !== animalExiste.rows[0].propriedade_id
    ) {
      return responder(400, {
        mensagem: "Animal e lote pertencem a propriedades diferentes",
      });
    }

    const relacaoExiste = await cliente.query(
      `SELECT * FROM animais_lotes
             WHERE animal_id = $1
             AND lote_id = $2`,
      [animalId, loteId],
    );

    if (relacaoExiste.rows.length > 0) {
      return responder(400, {
        mensagem: "Animal já pertence a este lote",
      });
    }

    const resultado = await cliente.query(
      `INSERT INTO animais_lotes
            (animal_id, lote_id)
            VALUES ($1, $2)
            RETURNING *`,
      [animalId, loteId],
    );

    responder(201, {
      mensagem: "Animal adicionado ao lote com sucesso!",
      relacao: resultado.rows[0],
    });
  } catch (erro) {
    if (erro.code === "23505") {
      return responder(400, {
        mensagem: "Animal já pertence a este lote",
      });
    }

    registrarErro("lotes_rota_erro", erro, req);

    responder(500, {
      mensagem: "Erro ao adicionar animal ao lote",
    });
  }
}));

router.get("/lotes/:id/animais", rotaComBanco(async (req, res, cliente, responder) => {
  try {
    const paginacao = normalizarPaginacao(req.query);
    if (paginacao.erro) return responder(400, { mensagem: paginacao.erro });
    const { limite, offset } = paginacao.valor;
    const { id } = req.params;
    const loteId = converterId(id);

    if (!loteId) {
      return responder(400, { mensagem: "ID do lote inválido" });
    }

    const loteExiste = await cliente.query(
      `SELECT l.id
         FROM lotes l
         JOIN propriedades p ON p.id = l.propriedade_id
        WHERE l.id = $1
          AND ($2 = 'admin' OR p.usuario_id = $3)`,
      [loteId, req.usuario.perfil, req.usuario.id],
    );

    if (loteExiste.rows.length === 0) {
      return responder(404, {
        mensagem: "Lote não encontrado",
      });
    }

    const resultado = await cliente.query(
      `SELECT animais.*
             FROM animais
             JOIN animais_lotes
                ON animais.id = animais_lotes.animal_id
             JOIN lotes
                ON lotes.id = animais_lotes.lote_id
             WHERE animais_lotes.lote_id = $1
               AND animais.propriedade_id = lotes.propriedade_id
             ORDER BY animais.id
             LIMIT $2 OFFSET $3`,
      [loteId, limite + 1, offset],
    );

    responder(200, responderPagina(res, resultado.rows, paginacao.valor));
  } catch (erro) {
    registrarErro("lotes_rota_erro", erro, req);

    responder(500, {
      mensagem: "Erro ao buscar animais do lote",
    });
  }
}));

router.delete("/lotes/:id/animais/:animal_id", rotaComBanco(async (req, res, cliente, responder) => {
  try {
    const { id, animal_id } = req.params;
    const loteId = converterId(id);
    const animalId = converterId(animal_id);

    if (!loteId || !animalId) {
      return responder(400, {
        mensagem: "Lote e animal devem possuir IDs válidos",
      });
    }

    const resultado = await cliente.query(
      `DELETE FROM animais_lotes al
             USING lotes l, propriedades p, animais a
             WHERE al.lote_id = $1
               AND al.animal_id = $2
               AND l.id = al.lote_id
               AND a.id = al.animal_id
               AND p.id = l.propriedade_id
               AND a.propriedade_id = p.id
               AND ($3 = 'admin' OR p.usuario_id = $4)
             RETURNING al.*`,
      [loteId, animalId, req.usuario.perfil, req.usuario.id],
    );

    if (resultado.rows.length === 0) {
      return responder(404, {
        mensagem: "Animal não encontrado neste lote",
      });
    }

    responder(200, {
      mensagem: "Animal removido do lote com sucesso!",
      relacao: resultado.rows[0],
    });
  } catch (erro) {
    registrarErro("lotes_rota_erro", erro, req);

    responder(500, {
      mensagem: "Erro ao remover animal do lote",
    });
  }
}));

router.get("/animais/:id/lotes", rotaComBanco(async (req, res, cliente, responder) => {
  try {
    const paginacao = normalizarPaginacao(req.query);
    if (paginacao.erro) return responder(400, { mensagem: paginacao.erro });
    const { limite, offset } = paginacao.valor;
    const { id } = req.params;
    const animalId = converterId(id);

    if (!animalId) {
      return responder(400, { mensagem: "ID do animal inválido" });
    }

    const animalExiste = await cliente.query(
      `SELECT a.id
         FROM animais a
         JOIN propriedades p ON p.id = a.propriedade_id
        WHERE a.id = $1
          AND ($2 = 'admin' OR p.usuario_id = $3)`,
      [animalId, req.usuario.perfil, req.usuario.id],
    );

    if (animalExiste.rows.length === 0) {
      return responder(404, {
        mensagem: "Animal não encontrado",
      });
    }

    const resultado = await cliente.query(
      `SELECT lotes.*
             FROM lotes
             JOIN animais_lotes
                ON lotes.id = animais_lotes.lote_id
             JOIN animais
                ON animais.id = animais_lotes.animal_id
             WHERE animais_lotes.animal_id = $1
               AND lotes.propriedade_id = animais.propriedade_id
             ORDER BY lotes.id
             LIMIT $2 OFFSET $3`,
      [animalId, limite + 1, offset],
    );

    responder(200, responderPagina(res, resultado.rows, paginacao.valor));
  } catch (erro) {
    registrarErro("lotes_rota_erro", erro, req);

    responder(500, {
      mensagem: "Erro ao buscar lotes do animal",
    });
  }
}));
// =========================
// VACINAS
// =========================

module.exports = router;
