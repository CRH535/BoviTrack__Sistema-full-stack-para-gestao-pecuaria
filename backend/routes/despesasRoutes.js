const express = require("express");
const { rotaComBanco } = require("../database/contextoRls");
const { normalizarFormaPagamento, normalizarPaginacao, responderPagina, validarCamposPermitidos, converterId, normalizarDataCalendario, normalizarTextoObrigatorio, normalizarNumeroFinito } = require("../utils/validacoes")
const { validarParametroId } = require("../middleware/validacao");
const { registrarErro } = require("../utils/log");

const router = express.Router();
router.param("id", validarParametroId);

function normalizarDadosDespesa(dados) {
  const descricao = normalizarTextoObrigatorio(dados.descricao, "Descrição", 150);
  const categoria = normalizarTextoObrigatorio(dados.categoria, "Categoria", 100);
  const formaPagamento = normalizarFormaPagamento(dados.forma_pagamento);
  const valor = normalizarNumeroFinito(dados.valor, "Valor", { minimo: 0.01, maximo: 99999999.99 });
  const data = normalizarDataCalendario(dados.data, "Data");
  const propriedadeId = converterId(dados.propriedade_id);
  const erro = descricao.erro || categoria.erro || formaPagamento.erro || valor.erro || data.erro ||
    (!propriedadeId && "Propriedade inválida");
  if (erro) return { erro };
  return { valor: { descricao: descricao.valor, categoria: categoria.valor, formaPagamento: formaPagamento.valor, valor: valor.valor, data: data.valor, propriedade_id: propriedadeId } };
}

router.post("/despesas", rotaComBanco(async (req, res, cliente, responder) => {
  try {
    const campos = validarCamposPermitidos(req.body, ["descricao", "categoria", "forma_pagamento", "valor", "data", "propriedade_id"]);
    if (campos.erro) return responder(400, { mensagem: campos.erro });
    const dados = normalizarDadosDespesa(req.body);
    if (dados.erro) return responder(400, { mensagem: dados.erro });
    const { descricao, categoria, formaPagamento, valor, data, propriedade_id } = dados.valor;

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
      `INSERT INTO despesas
            (descricao, categoria, forma_pagamento, valor, data, propriedade_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *`,
      [
        descricao,
        categoria,
        formaPagamento,
        valor,
        data,
        propriedade_id,
      ],
    );

    responder(201, {
      mensagem: "Despesa cadastrada com sucesso!",
      despesa: resultado.rows[0],
    });
  } catch (erro) {
    registrarErro("despesas_rota_erro", erro, req);

    responder(500, {
      mensagem: "Erro ao cadastrar despesa",
    });
  }
}));

router.get("/despesas", rotaComBanco(async (req, res, cliente, responder) => {
  try {
    const paginacao = normalizarPaginacao(req.query);
    if (paginacao.erro) return responder(400, { mensagem: paginacao.erro });
    const { limite, offset } = paginacao.valor;
    const resultado = await cliente.query(`
            SELECT
                despesas.id,
                despesas.descricao,
                despesas.categoria,
                despesas.forma_pagamento,
                despesas.valor,
                despesas.data,
                despesas.propriedade_id,
                propriedades.nome AS propriedade
            FROM despesas
            JOIN propriedades
                ON despesas.propriedade_id = propriedades.id
            WHERE ($1 = 'admin' OR propriedades.usuario_id = $2)
            ORDER BY despesas.data DESC, despesas.id DESC
            LIMIT $3 OFFSET $4
        `, [req.usuario.perfil, req.usuario.id, limite + 1, offset]);

    responder(200, responderPagina(res, resultado.rows, paginacao.valor));
  } catch (erro) {
    registrarErro("despesas_rota_erro", erro, req);

    responder(500, {
      mensagem: "Erro ao buscar despesas",
    });
  }
}));

router.get("/despesas/:id", rotaComBanco(async (req, res, cliente, responder) => {
  try {
    const { id } = req.params;

    const resultado = await cliente.query(
      `
            SELECT
                despesas.id,
                despesas.descricao,
                despesas.categoria,
                despesas.forma_pagamento,
                despesas.valor,
                despesas.data,
                despesas.propriedade_id,
                propriedades.nome AS propriedade
            FROM despesas
            JOIN propriedades
                ON despesas.propriedade_id = propriedades.id
            WHERE despesas.id = $1
              AND ($2 = 'admin' OR propriedades.usuario_id = $3)
        `,
      [id, req.usuario.perfil, req.usuario.id],
    );

    if (resultado.rows.length === 0) {
      return responder(404, {
        mensagem: "Despesa não encontrada",
      });
    }

    responder(200, resultado.rows[0]);
  } catch (erro) {
    registrarErro("despesas_rota_erro", erro, req);

    responder(500, {
      mensagem: "Erro ao buscar despesa",
    });
  }
}));

router.put("/despesas/:id", rotaComBanco(async (req, res, cliente, responder) => {
  try {
    const atual = await cliente.query(
      `SELECT d.id FROM despesas d JOIN propriedades p ON p.id = d.propriedade_id
        WHERE d.id = $1 AND ($2 = 'admin' OR p.usuario_id = $3)`,
      [req.params.id, req.usuario.perfil, req.usuario.id],
    );
    if (!atual.rows[0]) return responder(404, { mensagem: "Despesa não encontrada" });
    const campos = validarCamposPermitidos(req.body, ["descricao", "categoria", "forma_pagamento", "valor", "data", "propriedade_id"]);
    if (campos.erro) return responder(400, { mensagem: campos.erro });
    const { id } = req.params;

    const dados = normalizarDadosDespesa(req.body);
    if (dados.erro) return responder(400, { mensagem: dados.erro });
    const { descricao, categoria, formaPagamento, valor, data, propriedade_id } = dados.valor;

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
      `UPDATE despesas
             SET descricao = $1,
                 categoria = $2,
                 forma_pagamento = $3,
                 valor = $4,
                 data = $5,
                 propriedade_id = $6
             WHERE id = $7
               AND (
                 $8 = 'admin'
                 OR EXISTS (
                   SELECT 1
                     FROM propriedades p
                    WHERE p.id = despesas.propriedade_id
                      AND p.usuario_id = $9
                 )
               )
             RETURNING *`,
      [
        descricao,
        categoria,
        formaPagamento,
        valor,
        data,
        propriedade_id,
        id,
        req.usuario.perfil,
        req.usuario.id,
      ],
    );

    if (resultado.rows.length === 0) {
      return responder(404, {
        mensagem: "Despesa não encontrada",
      });
    }

    responder(200, {
      mensagem: "Despesa atualizada com sucesso!",
      despesa: resultado.rows[0],
    });
  } catch (erro) {
    registrarErro("despesas_rota_erro", erro, req);

    responder(500, {
      mensagem: "Erro ao atualizar despesa",
    });
  }
}));

router.delete("/despesas/:id", rotaComBanco(async (req, res, cliente, responder) => {
  try {
    const { id } = req.params;

    const resultado = await cliente.query(
      `DELETE FROM despesas d
             USING propriedades p
             WHERE d.id = $1
               AND p.id = d.propriedade_id
               AND ($2 = 'admin' OR p.usuario_id = $3)
             RETURNING d.*`,
      [id, req.usuario.perfil, req.usuario.id],
    );

    if (resultado.rows.length === 0) {
      return responder(404, {
        mensagem: "Despesa não encontrada",
      });
    }

    responder(200, {
      mensagem: "Despesa excluída com sucesso!",
      despesa: resultado.rows[0],
    });
  } catch (erro) {
    registrarErro("despesas_rota_erro", erro, req);

    responder(500, {
      mensagem: "Erro ao excluir despesa",
    });
  }
}));
// =========================
// DESPESAS POR PROPRIEDADE
// =========================

router.get("/propriedades/:id/despesas", rotaComBanco(async (req, res, cliente, responder) => {
  try {
    const { id } = req.params;
    const paginacao = normalizarPaginacao(req.query);
    if (paginacao.erro) return responder(400, { mensagem: paginacao.erro });

    const {
      periodo = "todos",
      categoria,
      valor_minimo,
      valor_maximo,
      data_inicio,
      data_fim,
    } = req.query;

    const propriedadeExiste = await cliente.query(
      `SELECT id, nome, cidade, estado, area
         FROM propriedades
        WHERE id = $1
          AND ($2 = 'admin' OR usuario_id = $3)`,
      [id, req.usuario.perfil, req.usuario.id],
    );

    if (propriedadeExiste.rows.length === 0) {
      return responder(404, {
        mensagem: "Propriedade não encontrada",
      });
    }

    if (!["hoje", "semana", "mes", "todos"].includes(periodo)) {
      return responder(400, {
        mensagem: "Período inválido. Use hoje, semana, mes ou todos",
      });
    }

    const valorMinimo = valor_minimo === undefined
      ? { valor: null } : normalizarNumeroFinito(valor_minimo, "Valor minimo", { minimo: 0, maximo: 99999999.99 });
    const valorMaximo = valor_maximo === undefined
      ? { valor: null } : normalizarNumeroFinito(valor_maximo, "Valor maximo", { minimo: 0, maximo: 99999999.99 });
    if (valorMinimo.erro || valorMaximo.erro) {
      return responder(400, { mensagem: valorMinimo.erro || valorMaximo.erro });
    }
    if (valorMinimo.valor !== null && valorMaximo.valor !== null && valorMinimo.valor > valorMaximo.valor) {
      return responder(400, { mensagem: "O valor minimo nao pode ser maior que o valor maximo" });
    }

    const dataInicioValidada = data_inicio
      ? normalizarDataCalendario(data_inicio, "Data inicial")
      : { valor: null };
    if (dataInicioValidada.erro) {
      return responder(400, {
        mensagem: "Data inicial inválida",
      });
    }

    const dataFimValidada = data_fim
      ? normalizarDataCalendario(data_fim, "Data final")
      : { valor: null };
    if (dataFimValidada.erro) {
      return responder(400, {
        mensagem: "Data final inválida",
      });
    }

    if (data_inicio && data_fim && dataInicioValidada.valor > dataFimValidada.valor) {
      return responder(400, {
        mensagem: "A data inicial não pode ser posterior à data final",
      });
    }

    if (periodo !== "todos" && (data_inicio || data_fim)) {
      return responder(400, {
        mensagem:
          "Use periodo ou intervalo de datas, não os dois ao mesmo tempo",
      });
    }

    if (categoria !== undefined && (typeof categoria !== "string" || !categoria.trim() || categoria.trim().length > 100)) {
      return responder(400, { mensagem: "Categoria inválida" });
    }

    const valores = [id];
    if (periodo !== "todos") valores.push(process.env.APP_TIMEZONE || "America/Sao_Paulo");
    let filtro = "";

    if (periodo === "hoje") {
      filtro += " AND data = (CURRENT_TIMESTAMP AT TIME ZONE $2)::date";
    }

    if (periodo === "semana") {
      filtro += `
                AND data BETWEEN (CURRENT_TIMESTAMP AT TIME ZONE $2)::date - INTERVAL '7 days'
                AND (CURRENT_TIMESTAMP AT TIME ZONE $2)::date
            `;
    }

    if (periodo === "mes") {
      filtro += `
                AND data BETWEEN DATE_TRUNC('month', (CURRENT_TIMESTAMP AT TIME ZONE $2)::date)
                AND (CURRENT_TIMESTAMP AT TIME ZONE $2)::date
            `;
    }

    if (categoria) {
      const parametro = valores.length + 1;

      filtro += ` AND categoria = $${parametro}`;
      valores.push(categoria.trim());
    }

    if (valorMinimo.valor !== null) {
      const parametro = valores.length + 1;

      filtro += ` AND valor >= $${parametro}`;
      valores.push(valorMinimo.valor);
    }

    if (valorMaximo.valor !== null) {
      const parametro = valores.length + 1;

      filtro += ` AND valor <= $${parametro}`;
      valores.push(valorMaximo.valor);
    }

    if (data_inicio) {
      const parametro = valores.length + 1;

      filtro += ` AND data >= $${parametro}`;
      valores.push(dataInicioValidada.valor);
    }

    if (data_fim) {
      const parametro = valores.length + 1;

      filtro += ` AND data <= $${parametro}`;
      valores.push(dataFimValidada.valor);
    }

    const parametroLimite = valores.length + 1;
    const parametroOffset = valores.length + 2;
    valores.push(paginacao.valor.limite + 1, paginacao.valor.offset);

    const resultado = await cliente.query(
      `SELECT id, descricao, categoria, valor, data, forma_pagamento,
              propriedade_id
             FROM despesas
             WHERE propriedade_id = $1
             ${filtro}
             ORDER BY data DESC, valor DESC, id DESC
             LIMIT $${parametroLimite} OFFSET $${parametroOffset}`,
      valores,
    );

    responder(200, responderPagina(res, resultado.rows, paginacao.valor));
  } catch (erro) {
    registrarErro("despesas_rota_erro", erro, req);

    responder(500, {
      mensagem: "Erro ao buscar despesas da propriedade",
    });
  }
}));
// =========================
// RESUMO FINANCEIRO
// =========================

router.get("/propriedades/:id/despesas/resumo", rotaComBanco(async (req, res, cliente, responder) => {
  try {
    const { id } = req.params;

    const {
      periodo = "todos",
      categoria,
      valor_minimo,
      valor_maximo,
      data_inicio,
      data_fim,
    } = req.query;

    const propriedadeExiste = await cliente.query(
      `SELECT id, nome, cidade, estado, area
         FROM propriedades
        WHERE id = $1
          AND ($2 = 'admin' OR usuario_id = $3)`,
      [id, req.usuario.perfil, req.usuario.id],
    );

    if (propriedadeExiste.rows.length === 0) {
      return responder(404, {
        mensagem: "Propriedade não encontrada",
      });
    }

    if (!["hoje", "semana", "mes", "todos"].includes(periodo)) {
      return responder(400, {
        mensagem: "Período inválido. Use hoje, semana, mes ou todos",
      });
    }

    const valorMinimo = valor_minimo === undefined
      ? { valor: null } : normalizarNumeroFinito(valor_minimo, "Valor minimo", { minimo: 0, maximo: 99999999.99 });
    const valorMaximo = valor_maximo === undefined
      ? { valor: null } : normalizarNumeroFinito(valor_maximo, "Valor maximo", { minimo: 0, maximo: 99999999.99 });
    if (valorMinimo.erro || valorMaximo.erro) {
      return responder(400, { mensagem: valorMinimo.erro || valorMaximo.erro });
    }
    if (valorMinimo.valor !== null && valorMaximo.valor !== null && valorMinimo.valor > valorMaximo.valor) {
      return responder(400, { mensagem: "O valor minimo nao pode ser maior que o valor maximo" });
    }

    const dataInicioValidada = data_inicio
      ? normalizarDataCalendario(data_inicio, "Data inicial")
      : { valor: null };
    if (dataInicioValidada.erro) {
      return responder(400, {
        mensagem: "Data inicial inválida",
      });
    }

    const dataFimValidada = data_fim
      ? normalizarDataCalendario(data_fim, "Data final")
      : { valor: null };
    if (dataFimValidada.erro) {
      return responder(400, {
        mensagem: "Data final inválida",
      });
    }

    if (data_inicio && data_fim && dataInicioValidada.valor > dataFimValidada.valor) {
      return responder(400, {
        mensagem: "A data inicial não pode ser posterior à data final",
      });
    }

    if (periodo !== "todos" && (data_inicio || data_fim)) {
      return responder(400, {
        mensagem:
          "Use periodo ou intervalo de datas, não os dois ao mesmo tempo",
      });
    }

    if (categoria !== undefined && (typeof categoria !== "string" || !categoria.trim() || categoria.trim().length > 100)) {
      return responder(400, { mensagem: "Categoria inválida" });
    }

    const valores = [id];
    if (periodo !== "todos") valores.push(process.env.APP_TIMEZONE || "America/Sao_Paulo");
    let filtro = "";

    if (periodo === "hoje") {
      filtro += " AND data = (CURRENT_TIMESTAMP AT TIME ZONE $2)::date";
    }

    if (periodo === "semana") {
      filtro += `
                AND data BETWEEN (CURRENT_TIMESTAMP AT TIME ZONE $2)::date - INTERVAL '7 days'
                AND (CURRENT_TIMESTAMP AT TIME ZONE $2)::date
            `;
    }

    if (periodo === "mes") {
      filtro += `
                AND data BETWEEN DATE_TRUNC('month', (CURRENT_TIMESTAMP AT TIME ZONE $2)::date)
                AND (CURRENT_TIMESTAMP AT TIME ZONE $2)::date
            `;
    }

    if (categoria) {
      const parametro = valores.length + 1;

      filtro += ` AND categoria = $${parametro}`;
      valores.push(categoria.trim());
    }

    if (valorMinimo.valor !== null) {
      const parametro = valores.length + 1;

      filtro += ` AND valor >= $${parametro}`;
      valores.push(valorMinimo.valor);
    }

    if (valorMaximo.valor !== null) {
      const parametro = valores.length + 1;

      filtro += ` AND valor <= $${parametro}`;
      valores.push(valorMaximo.valor);
    }

    if (data_inicio) {
      const parametro = valores.length + 1;

      filtro += ` AND data >= $${parametro}`;
      valores.push(dataInicioValidada.valor);
    }

    if (data_fim) {
      const parametro = valores.length + 1;

      filtro += ` AND data <= $${parametro}`;
      valores.push(dataFimValidada.valor);
    }

    const resumoResultado = await cliente.query(
      `SELECT
        COALESCE(SUM(valor), 0) AS total,
        COALESCE(ROUND(AVG(valor), 2), 0) AS media,
        COALESCE(MAX(valor), 0) AS maior,
        COALESCE(MIN(valor), 0) AS menor,
        COUNT(*) AS quantidade
     FROM despesas
     WHERE propriedade_id = $1
     ${filtro}`,
      valores,
    );

    const categoriasResultado = await cliente.query(
      `SELECT
        categoria,
        COALESCE(SUM(valor), 0) AS total,
        COUNT(*) AS quantidade,
        COALESCE(ROUND(AVG(valor), 2), 0) AS media
     FROM despesas
     WHERE propriedade_id = $1
     ${filtro}
     GROUP BY categoria
     ORDER BY total DESC`,
      valores,
    );

    const propriedade = propriedadeExiste.rows[0];

    const dadosPropriedade = {
      id: propriedade.id,
      nome: propriedade.nome,
      cidade: propriedade.cidade,
      estado: propriedade.estado,
      area: propriedade.area,
    };

    responder(200, {
      propriedade: dadosPropriedade,

      resumo: {
        total: resumoResultado.rows[0].total,
        media: resumoResultado.rows[0].media,
        maior: resumoResultado.rows[0].maior,
        menor: resumoResultado.rows[0].menor,
        quantidade: resumoResultado.rows[0].quantidade,
      },

      categorias: categoriasResultado.rows,
    });
  } catch (erro) {
    registrarErro("despesas_rota_erro", erro, req);

    responder(500, {
      mensagem: "Erro ao buscar resumo de despesas",
    });
  }
}));

module.exports = router;
