const express = require("express");
const { rotaComBanco } = require("../database/contextoRls");
const { validarParametroId } = require("../middleware/validacao");
const { registrarErro } = require("../utils/log");
const {
  converterId,
  normalizarDataCalendario,
  normalizarNumeroFinito,
  normalizarPaginacao,
  normalizarTextoObrigatorio,
  normalizarTextoOpcional,
  responderPagina,
  validarCamposPermitidos,
} = require("../utils/validacoes");

const router = express.Router();
const PERIODOS = new Set(["todos", "hoje", "semana", "mes", "ano", "personalizado"]);

router.param("id", validarParametroId);

function normalizarReceita(dados) {
  const descricao = normalizarTextoObrigatorio(dados.descricao, "Descrição", 150);
  const categoria = normalizarTextoObrigatorio(dados.categoria, "Categoria", 100);
  const valor = normalizarNumeroFinito(dados.valor, "Valor", {
    minimo: 0.01,
    maximo: 999999999999.99,
  });
  const data = normalizarDataCalendario(dados.data, "Data");
  const propriedadeId = converterId(dados.propriedade_id);
  const formaRecebimento = normalizarTextoOpcional(
    dados.forma_recebimento,
    "Forma de recebimento",
    100,
  );
  const observacao = normalizarTextoOpcional(dados.observacao, "Observação", 500);
  const erro =
    descricao.erro ||
    categoria.erro ||
    valor.erro ||
    data.erro ||
    formaRecebimento.erro ||
    observacao.erro ||
    (!propriedadeId && "Propriedade inválida");

  if (erro) return { erro };
  return {
    valor: {
      descricao: descricao.valor,
      categoria: categoria.valor,
      valor: valor.valor,
      data: data.valor,
      propriedadeId,
      formaRecebimento: formaRecebimento.valor,
      observacao: observacao.valor,
    },
  };
}

function normalizarFiltros(query) {
  const campos = validarCamposPermitidos(query, [
    "page",
    "limit",
    "propriedade_id",
    "periodo",
    "categoria",
    "data_inicio",
    "data_fim",
  ]);
  if (campos.erro) return campos;

  if (query.periodo !== undefined && typeof query.periodo !== "string") {
    return { erro: "Período inválido" };
  }
  const periodo = query.periodo?.trim()
    ? query.periodo.trim().toLowerCase()
    : "todos";
  if (!PERIODOS.has(periodo)) {
    return { erro: "Período inválido" };
  }

  const propriedadeId = query.propriedade_id === undefined || query.propriedade_id === ""
    ? null
    : converterId(query.propriedade_id);
  if (query.propriedade_id !== undefined && query.propriedade_id !== "" && !propriedadeId) {
    return { erro: "Propriedade inválida" };
  }

  const categoria = query.categoria === undefined || query.categoria === ""
    ? { valor: null }
    : normalizarTextoObrigatorio(query.categoria, "Categoria", 100);
  if (categoria.erro) return categoria;

  if (periodo === "personalizado") {
    const dataInicio = normalizarDataCalendario(query.data_inicio, "Data inicial");
    const dataFim = normalizarDataCalendario(query.data_fim, "Data final");
    if (dataInicio.erro || dataFim.erro) {
      return { erro: dataInicio.erro || dataFim.erro };
    }
    if (dataInicio.valor > dataFim.valor) {
      return { erro: "A data inicial não pode ser posterior à data final" };
    }
    return {
      valor: {
        periodo,
        propriedadeId,
        categoria: categoria.valor,
        dataInicio: dataInicio.valor,
        dataFim: dataFim.valor,
      },
    };
  }

  if (query.data_inicio || query.data_fim) {
    return { erro: "Selecione o período personalizado para informar datas" };
  }

  return {
    valor: {
      periodo,
      propriedadeId,
      categoria: categoria.valor,
      dataInicio: null,
      dataFim: null,
    },
  };
}

function construirFiltro(aliasTabela, filtros, usuario, { incluirCategoria = true } = {}) {
  const valores = [usuario.perfil, usuario.id];
  const condicoes = [`($1 = 'admin' OR p.usuario_id = $2)`];

  function adicionar(valor, expressao) {
    valores.push(valor);
    condicoes.push(expressao.replace("?", `$${valores.length}`));
  }

  if (filtros.propriedadeId) {
    adicionar(filtros.propriedadeId, `${aliasTabela}.propriedade_id = ?`);
  }
  if (incluirCategoria && filtros.categoria) {
    adicionar(filtros.categoria, `${aliasTabela}.categoria = ?`);
  }

  let hoje;
  if (["hoje", "semana", "mes", "ano"].includes(filtros.periodo)) {
    valores.push(process.env.APP_TIMEZONE || "America/Sao_Paulo");
    hoje = `(CURRENT_TIMESTAMP AT TIME ZONE $${valores.length})::date`;
  }

  if (filtros.periodo === "hoje") {
    condicoes.push(`${aliasTabela}.data = ${hoje}`);
  } else if (filtros.periodo === "semana") {
    condicoes.push(`${aliasTabela}.data BETWEEN DATE_TRUNC('week', ${hoje})::date AND ${hoje}`);
  } else if (filtros.periodo === "mes") {
    condicoes.push(`${aliasTabela}.data BETWEEN DATE_TRUNC('month', ${hoje})::date AND ${hoje}`);
  } else if (filtros.periodo === "ano") {
    condicoes.push(`${aliasTabela}.data BETWEEN DATE_TRUNC('year', ${hoje})::date AND ${hoje}`);
  } else if (filtros.periodo === "personalizado") {
    adicionar(filtros.dataInicio, `${aliasTabela}.data >= ?`);
    adicionar(filtros.dataFim, `${aliasTabela}.data <= ?`);
  }

  return { where: condicoes.join(" AND "), valores };
}

async function validarAcessoPropriedade(propriedadeId, usuario, cliente) {
  if (!propriedadeId) return true;
  const resultado = await cliente.query(
    `SELECT id FROM propriedades
      WHERE id = $1 AND ($2 = 'admin' OR usuario_id = $3)`,
    [propriedadeId, usuario.perfil, usuario.id],
  );
  return resultado.rowCount > 0;
}

router.post("/receitas", rotaComBanco(async (req, res, cliente, responder) => {
  try {
    const campos = validarCamposPermitidos(req.body, [
      "descricao",
      "categoria",
      "valor",
      "data",
      "propriedade_id",
      "forma_recebimento",
      "observacao",
    ]);
    if (campos.erro) return responder(400, { mensagem: campos.erro });
    const dados = normalizarReceita(req.body);
    if (dados.erro) return responder(400, { mensagem: dados.erro });
    const receita = dados.valor;

    if (!(await validarAcessoPropriedade(receita.propriedadeId, req.usuario, cliente))) {
      return responder(404, { mensagem: "Propriedade não encontrada" });
    }

    const resultado = await cliente.query(
      `INSERT INTO receitas
        (descricao, categoria, valor, data, propriedade_id, forma_recebimento, observacao)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        receita.descricao,
        receita.categoria,
        receita.valor,
        receita.data,
        receita.propriedadeId,
        receita.formaRecebimento,
        receita.observacao,
      ],
    );

    return responder(201, {
      mensagem: "Receita cadastrada com sucesso!",
      receita: resultado.rows[0],
    });
  } catch (erro) {
    registrarErro("receitas_rota_erro", erro, req);
    return responder(500, { mensagem: "Erro ao cadastrar receita" });
  }
}));

router.get("/receitas", rotaComBanco(async (req, res, cliente, responder) => {
  try {
    const paginacao = normalizarPaginacao(req.query);
    if (paginacao.erro) return responder(400, { mensagem: paginacao.erro });
    const filtros = normalizarFiltros(req.query);
    if (filtros.erro) return responder(400, { mensagem: filtros.erro });
    if (!(await validarAcessoPropriedade(filtros.valor.propriedadeId, req.usuario, cliente))) {
      return responder(404, { mensagem: "Propriedade não encontrada" });
    }

    const consulta = construirFiltro("r", filtros.valor, req.usuario);
    consulta.valores.push(paginacao.valor.limite + 1, paginacao.valor.offset);
    const limite = `$${consulta.valores.length - 1}`;
    const offset = `$${consulta.valores.length}`;
    const resultado = await cliente.query(
      `SELECT r.id, r.descricao, r.categoria, r.valor, r.data,
              r.propriedade_id, r.forma_recebimento, r.observacao,
              p.nome AS propriedade
         FROM receitas r
         JOIN propriedades p ON p.id = r.propriedade_id
        WHERE ${consulta.where}
        ORDER BY r.data DESC, r.id DESC
        LIMIT ${limite} OFFSET ${offset}`,
      consulta.valores,
    );

    return responder(200, responderPagina(res, resultado.rows, paginacao.valor));
  } catch (erro) {
    registrarErro("receitas_rota_erro", erro, req);
    return responder(500, { mensagem: "Erro ao buscar receitas" });
  }
}));

router.get("/receitas/resumo", rotaComBanco(async (req, res, cliente, responder) => {
  try {
    const filtros = normalizarFiltros(req.query);
    if (filtros.erro) return responder(400, { mensagem: filtros.erro });
    if (!(await validarAcessoPropriedade(filtros.valor.propriedadeId, req.usuario, cliente))) {
      return responder(404, { mensagem: "Propriedade não encontrada" });
    }

    const filtroReceitas = construirFiltro("r", filtros.valor, req.usuario);
    const filtroDespesas = construirFiltro("d", filtros.valor, req.usuario, {
      incluirCategoria: false,
    });
    const receitasResultado = await cliente.query(
      `SELECT COALESCE(SUM(r.valor), 0) AS total
         FROM receitas r
         JOIN propriedades p ON p.id = r.propriedade_id
        WHERE ${filtroReceitas.where}`,
      filtroReceitas.valores,
    );
    const despesasResultado = await cliente.query(
      `SELECT COALESCE(SUM(d.valor), 0) AS total
         FROM despesas d
         JOIN propriedades p ON p.id = d.propriedade_id
        WHERE ${filtroDespesas.where}`,
      filtroDespesas.valores,
    );
    const totalReceitas = Number(receitasResultado.rows[0].total);
    const totalDespesas = Number(despesasResultado.rows[0].total);

    return responder(200, {
      receita_total: totalReceitas,
      despesas_totais: totalDespesas,
      lucro_liquido: totalReceitas - totalDespesas,
    });
  } catch (erro) {
    registrarErro("receitas_resumo_erro", erro, req);
    return responder(500, { mensagem: "Erro ao calcular resumo financeiro" });
  }
}));

router.get("/receitas/:id", rotaComBanco(async (req, res, cliente, responder) => {
  try {
    const resultado = await cliente.query(
      `SELECT r.id, r.descricao, r.categoria, r.valor, r.data,
              r.propriedade_id, r.forma_recebimento, r.observacao,
              p.nome AS propriedade
         FROM receitas r
         JOIN propriedades p ON p.id = r.propriedade_id
        WHERE r.id = $1 AND ($2 = 'admin' OR p.usuario_id = $3)`,
      [req.params.id, req.usuario.perfil, req.usuario.id],
    );
    if (!resultado.rowCount) {
      return responder(404, { mensagem: "Receita não encontrada" });
    }
    return responder(200, resultado.rows[0]);
  } catch (erro) {
    registrarErro("receitas_rota_erro", erro, req);
    return responder(500, { mensagem: "Erro ao buscar receita" });
  }
}));

router.put("/receitas/:id", rotaComBanco(async (req, res, cliente, responder) => {
  try {
    const atual = await cliente.query(
      `SELECT r.id FROM receitas r JOIN propriedades p ON p.id = r.propriedade_id
        WHERE r.id = $1 AND ($2 = 'admin' OR p.usuario_id = $3)`,
      [req.params.id, req.usuario.perfil, req.usuario.id],
    );
    if (!atual.rows[0]) return responder(404, { mensagem: "Receita não encontrada" });
    const campos = validarCamposPermitidos(req.body, [
      "descricao",
      "categoria",
      "valor",
      "data",
      "propriedade_id",
      "forma_recebimento",
      "observacao",
    ]);
    if (campos.erro) return responder(400, { mensagem: campos.erro });
    const dados = normalizarReceita(req.body);
    if (dados.erro) return responder(400, { mensagem: dados.erro });
    const receita = dados.valor;

    if (!(await validarAcessoPropriedade(receita.propriedadeId, req.usuario, cliente))) {
      return responder(404, { mensagem: "Propriedade não encontrada" });
    }

    const resultado = await cliente.query(
      `UPDATE receitas r
          SET descricao = $1, categoria = $2, valor = $3, data = $4,
              propriedade_id = $5, forma_recebimento = $6, observacao = $7,
              updated_at = CURRENT_TIMESTAMP
        WHERE r.id = $8
          AND ($9 = 'admin' OR EXISTS (
            SELECT 1 FROM propriedades p
             WHERE p.id = r.propriedade_id AND p.usuario_id = $10
          ))
        RETURNING *`,
      [
        receita.descricao,
        receita.categoria,
        receita.valor,
        receita.data,
        receita.propriedadeId,
        receita.formaRecebimento,
        receita.observacao,
        req.params.id,
        req.usuario.perfil,
        req.usuario.id,
      ],
    );
    if (!resultado.rowCount) {
      return responder(404, { mensagem: "Receita não encontrada" });
    }
    return responder(200, {
      mensagem: "Receita atualizada com sucesso!",
      receita: resultado.rows[0],
    });
  } catch (erro) {
    registrarErro("receitas_rota_erro", erro, req);
    return responder(500, { mensagem: "Erro ao atualizar receita" });
  }
}));

router.delete("/receitas/:id", rotaComBanco(async (req, res, cliente, responder) => {
  try {
    const resultado = await cliente.query(
      `DELETE FROM receitas r
        USING propriedades p
        WHERE r.id = $1 AND p.id = r.propriedade_id
          AND ($2 = 'admin' OR p.usuario_id = $3)
        RETURNING r.*`,
      [req.params.id, req.usuario.perfil, req.usuario.id],
    );
    if (!resultado.rowCount) {
      return responder(404, { mensagem: "Receita não encontrada" });
    }
    return responder(200, {
      mensagem: "Receita excluída com sucesso!",
      receita: resultado.rows[0],
    });
  } catch (erro) {
    registrarErro("receitas_rota_erro", erro, req);
    return responder(500, { mensagem: "Erro ao excluir receita" });
  }
}));

module.exports = router;
