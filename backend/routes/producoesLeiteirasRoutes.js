const express = require("express");
const { rotaComBanco } = require("../database/contextoRls");
const { buscarAnimalPermitido } = require("../services/acessoAnimais");
const {
  converterId,
  normalizarDataCalendario,
  normalizarProducaoLeiteira,
  normalizarPaginacao,
  responderPagina,
} = require("../utils/validacoes")
const { validarParametroId } = require("../middleware/validacao");
const { registrarErro } = require("../utils/log");

const router = express.Router();
router.param("animalId", validarParametroId);
router.param("id", validarParametroId);

router.post("/animais/:animalId/producoes-leiteiras", rotaComBanco(async (req, res, cliente, responder) => {
  try {
    const animalId = converterId(req.params.animalId);

    if (!animalId) {
      return responder(400, { mensagem: "ID do animal inválido" });
    }

    const animal = await buscarAnimalPermitido(animalId, req.usuario, cliente);

    if (!animal) {
      return responder(404, { mensagem: "Animal não encontrado" });
    }

    const producao = normalizarProducaoLeiteira(req.body);

    if (producao.erro) {
      return responder(400, { mensagem: producao.erro });
    }

    const { data, turno, quantidadeLitros, observacao } = producao.valor;
    const resultado = await cliente.query(
      `INSERT INTO producoes_leiteiras
              (animal_id, data, turno, quantidade_litros, observacao)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [animalId, data, turno, quantidadeLitros, observacao],
    );

    responder(201, {
      mensagem: "Produção leiteira registrada com sucesso!",
      producao: resultado.rows[0],
    });
  } catch (erro) {
    registrarErro("producoes_leiteiras_rota_erro", erro, req);
    responder(500, { mensagem: "Erro ao registrar produção leiteira" });
  }
}));

router.get("/animais/:animalId/producoes-leiteiras", rotaComBanco(async (req, res, cliente, responder) => {
  try {
    const paginacao = normalizarPaginacao(req.query);
    if (paginacao.erro) return responder(400, { mensagem: paginacao.erro });
    const { limite, offset } = paginacao.valor;
    const animalId = converterId(req.params.animalId);
    const periodo = req.query.periodo || "todos";
    const periodosPermitidos = ["hoje", "7dias", "30dias", "todos"];

    if (!animalId) {
      return responder(400, { mensagem: "ID do animal inválido" });
    }

    if (!periodosPermitidos.includes(periodo)) {
      return responder(400, {
        mensagem: "Período inválido. Use hoje, 7dias, 30dias ou todos",
      });
    }

    const animal = await buscarAnimalPermitido(animalId, req.usuario, cliente);

    if (!animal) {
      return responder(404, { mensagem: "Animal não encontrado" });
    }

    const dataInicio = req.query.data_inicio
      ? normalizarDataCalendario(req.query.data_inicio, "Data inicial")
      : { valor: null };
    const dataFim = req.query.data_fim
      ? normalizarDataCalendario(req.query.data_fim, "Data final")
      : { valor: null };

    if (dataInicio.erro || dataFim.erro) {
      return responder(400, {
        mensagem: dataInicio.erro || dataFim.erro,
      });
    }

    if (dataInicio.valor && dataFim.valor && dataInicio.valor > dataFim.valor) {
      return responder(400, {
        mensagem: "A data inicial não pode ser posterior à data final",
      });
    }

    if (periodo !== "todos" && (dataInicio.valor || dataFim.valor)) {
      return responder(400, {
        mensagem: "Use período ou intervalo personalizado, não ambos",
      });
    }

    const fusoHorario = process.env.APP_TIMEZONE || "America/Sao_Paulo";
    const resultado = await cliente.query(
      `SELECT id,
              animal_id,
              data,
              turno,
              quantidade_litros,
              observacao,
              created_at
         FROM producoes_leiteiras
        WHERE animal_id = $1
          AND (
            (
              $3 = 'todos'
              AND ($4::date IS NULL OR data >= $4::date)
              AND ($5::date IS NULL OR data <= $5::date)
            )
            OR (
              $3 = 'hoje'
              AND data = (CURRENT_TIMESTAMP AT TIME ZONE $2)::date
            )
            OR (
              $3 = '7dias'
              AND data BETWEEN
                    (CURRENT_TIMESTAMP AT TIME ZONE $2)::date - 6
                    AND (CURRENT_TIMESTAMP AT TIME ZONE $2)::date
            )
            OR (
              $3 = '30dias'
              AND data BETWEEN
                    (CURRENT_TIMESTAMP AT TIME ZONE $2)::date - 29
                    AND (CURRENT_TIMESTAMP AT TIME ZONE $2)::date
            )
          )
        ORDER BY data DESC,
                 CASE turno
                   WHEN 'manha' THEN 1
                   WHEN 'tarde' THEN 2
                   WHEN 'noite' THEN 3
                   ELSE 4
                 END,
                 id DESC
        LIMIT $6 OFFSET $7`,
      [
        animalId,
        fusoHorario,
        periodo,
        dataInicio.valor,
        dataFim.valor,
        limite + 1,
        offset,
      ],
    );

    responder(200, responderPagina(res, resultado.rows, paginacao.valor));
  } catch (erro) {
    registrarErro("producoes_leiteiras_rota_erro", erro, req);
    responder(500, { mensagem: "Erro ao buscar produções leiteiras" });
  }
}));

router.get("/animais/:animalId/producoes-leiteiras/resumo", rotaComBanco(async (req, res, cliente, responder) => {
  try {
    const animalId = converterId(req.params.animalId);

    if (!animalId) {
      return responder(400, { mensagem: "ID do animal inválido" });
    }

    const animal = await buscarAnimalPermitido(animalId, req.usuario, cliente);

    if (!animal) {
      return responder(404, { mensagem: "Animal não encontrado" });
    }

    const fusoHorario = process.env.APP_TIMEZONE || "America/Sao_Paulo";
    const resumoResultado = await cliente.query(
      `WITH referencia AS (
         SELECT (CURRENT_TIMESTAMP AT TIME ZONE $2)::date AS hoje
       ),
       totais_diarios AS (
         SELECT data, SUM(quantidade_litros) AS total
           FROM producoes_leiteiras
          WHERE animal_id = $1
          GROUP BY data
       )
       SELECT COALESCE(
                SUM(total) FILTER (WHERE data = referencia.hoje),
                0
              ) AS producao_hoje,
              COALESCE(AVG(total), 0) AS media_diaria,
              COALESCE(
                SUM(total) FILTER (
                  WHERE data BETWEEN referencia.hoje - 6 AND referencia.hoje
                ),
                0
              ) AS producao_7_dias,
              COALESCE(
                AVG(total) FILTER (
                  WHERE data BETWEEN referencia.hoje - 6 AND referencia.hoje
                ),
                0
              ) AS media_7_dias,
              COALESCE(
                SUM(total) FILTER (
                  WHERE data BETWEEN referencia.hoje - 29 AND referencia.hoje
                ),
                0
              ) AS producao_30_dias
         FROM referencia
         LEFT JOIN totais_diarios ON TRUE
        GROUP BY referencia.hoje`,
      [animalId, fusoHorario],
    );
    const evolucaoResultado = await cliente.query(
      `SELECT data, SUM(quantidade_litros) AS total_litros
         FROM producoes_leiteiras
        WHERE animal_id = $1
          AND data BETWEEN
                (CURRENT_TIMESTAMP AT TIME ZONE $2)::date - 29
                AND (CURRENT_TIMESTAMP AT TIME ZONE $2)::date
        GROUP BY data
        ORDER BY data`,
      [animalId, fusoHorario],
    );

    const resumo = resumoResultado.rows[0];

    responder(200, {
      resumo: {
        producao_hoje: Number(resumo.producao_hoje),
        media_diaria: Number(resumo.media_diaria),
        producao_7_dias: Number(resumo.producao_7_dias),
        media_7_dias: Number(resumo.media_7_dias),
        producao_30_dias: Number(resumo.producao_30_dias),
      },
      evolucao: evolucaoResultado.rows.map((item) => ({
        data: item.data,
        total_litros: Number(item.total_litros),
      })),
    });
  } catch (erro) {
    registrarErro("producoes_leiteiras_rota_erro", erro, req);
    responder(500, { mensagem: "Erro ao calcular resumo leiteiro" });
  }
}));

router.put("/producoes-leiteiras/:id", rotaComBanco(async (req, res, cliente, responder) => {
  try {
    const id = converterId(req.params.id);

    if (!id) {
      return responder(400, { mensagem: "ID da produção inválido" });
    }

    const producao = normalizarProducaoLeiteira(req.body);

    if (producao.erro) {
      return responder(400, { mensagem: producao.erro });
    }

    const { data, turno, quantidadeLitros, observacao } = producao.valor;
    const resultado = await cliente.query(
      `UPDATE producoes_leiteiras pl
          SET data = $1,
              turno = $2,
              quantidade_litros = $3,
              observacao = $4
        WHERE pl.id = $5
          AND EXISTS (
            SELECT 1
              FROM animais a
              JOIN propriedades p ON p.id = a.propriedade_id
             WHERE a.id = pl.animal_id
               AND ($6 = 'admin' OR p.usuario_id = $7)
          )
        RETURNING pl.*`,
      [
        data,
        turno,
        quantidadeLitros,
        observacao,
        id,
        req.usuario.perfil,
        req.usuario.id,
      ],
    );

    if (resultado.rows.length === 0) {
      return responder(404, { mensagem: "Produção não encontrada" });
    }

    responder(200, {
      mensagem: "Produção leiteira atualizada com sucesso!",
      producao: resultado.rows[0],
    });
  } catch (erro) {
    registrarErro("producoes_leiteiras_rota_erro", erro, req);
    responder(500, { mensagem: "Erro ao atualizar produção leiteira" });
  }
}));

router.delete("/producoes-leiteiras/:id", rotaComBanco(async (req, res, cliente, responder) => {
  try {
    const id = converterId(req.params.id);

    if (!id) {
      return responder(400, { mensagem: "ID da produção inválido" });
    }

    const resultado = await cliente.query(
      `DELETE FROM producoes_leiteiras pl
        WHERE pl.id = $1
          AND EXISTS (
            SELECT 1
              FROM animais a
              JOIN propriedades p ON p.id = a.propriedade_id
             WHERE a.id = pl.animal_id
               AND ($2 = 'admin' OR p.usuario_id = $3)
          )
        RETURNING pl.*`,
      [id, req.usuario.perfil, req.usuario.id],
    );

    if (resultado.rows.length === 0) {
      return responder(404, { mensagem: "Produção não encontrada" });
    }

    responder(200, {
      mensagem: "Produção leiteira excluída com sucesso!",
      producao: resultado.rows[0],
    });
  } catch (erro) {
    registrarErro("producoes_leiteiras_rota_erro", erro, req);
    responder(500, { mensagem: "Erro ao excluir produção leiteira" });
  }
}));

// =========================
// DESPESAS
// =========================

module.exports = router;
