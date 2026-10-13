const express = require("express");
const pool = require("../database/pool");
const { registrarErro } = require("../utils/log");
const {
  buscarAnimalPermitido,
  buscarLoteCompativel,
} = require("../services/acessoAnimais");
const { montarResumoPesagens } = require("../services/calculosPesagem");
const { bloquearAnimalParaPeso, sincronizarPesoAtual } = require("../services/pesoAtual");
const {
  converterId,
  normalizarDataCalendario,
  normalizarPesagem,
  normalizarPaginacao,
  responderPagina,
} = require("../utils/validacoes");
const { validarParametroId } = require("../middleware/validacao");

const router = express.Router();
router.param("animalId", validarParametroId);
router.param("id", validarParametroId);

function serializarPesagens(linhas) {
  const crescentes = [...linhas].sort((a, b) => (
    String(a.data_pesagem).localeCompare(String(b.data_pesagem)) || Number(a.id) - Number(b.id)
  ));
  const variacoes = new Map();
  crescentes.forEach((item, indice) => {
    const anterior = crescentes[indice - 1];
    variacoes.set(item.id, anterior ? Number(item.peso_kg) - Number(anterior.peso_kg) : null);
  });
  return linhas.map((item) => ({
    ...item,
    peso_kg: Number(item.peso_kg),
    variacao_kg: item.variacao_kg == null
      ? variacoes.get(item.id)
      : Number(item.variacao_kg),
  }));
}

async function validarLote(pesagem, animal, usuario, cliente = pool) {
  if (!pesagem.loteId) return null;
  return buscarLoteCompativel(pesagem.loteId, animal.propriedade_id, usuario, cliente);
}

router.get("/animais/:animalId/pesagens", async (req, res) => {
  try {
    const paginacao = normalizarPaginacao(req.query);
    if (paginacao.erro) return res.status(400).json({ mensagem: paginacao.erro });
    const { limite, offset } = paginacao.valor;
    const animalId = converterId(req.params.animalId);
    if (!animalId) return res.status(400).json({ mensagem: "ID do animal inválido" });

    const animal = await buscarAnimalPermitido(animalId, req.usuario);
    if (!animal) return res.status(404).json({ mensagem: "Animal não encontrado" });

    const resultado = await pool.query(
      `SELECT p.id, p.animal_id, p.data_pesagem, p.peso_kg, p.tipo_pesagem,
              p.metodo, p.lote_id, l.nome AS lote, p.observacao,
              p.registrado_por, p.created_at, p.updated_at,
              p.peso_kg - LAG(p.peso_kg) OVER (
                PARTITION BY p.animal_id ORDER BY p.data_pesagem, p.id
              ) AS variacao_kg
         FROM pesagens p
         LEFT JOIN lotes l ON l.id = p.lote_id
        WHERE p.animal_id = $1
        ORDER BY p.data_pesagem DESC, p.id DESC
        LIMIT $2 OFFSET $3`,
      [animalId, limite + 1, offset],
    );
    const linhas = responderPagina(res, resultado.rows, paginacao.valor);
    res.json(serializarPesagens(linhas));
  } catch (erro) {
    registrarErro("pesagens_rota_erro", erro, req);
    res.status(500).json({ mensagem: "Erro ao buscar pesagens" });
  }
});

router.get("/animais/:animalId/pesagens/resumo", async (req, res) => {
  try {
    const animalId = converterId(req.params.animalId);
    if (!animalId) return res.status(400).json({ mensagem: "ID do animal inválido" });
    const animal = await buscarAnimalPermitido(animalId, req.usuario);
    if (!animal) return res.status(404).json({ mensagem: "Animal não encontrado" });

    const [pesagensResultado, lotesResultado] = await Promise.all([
      pool.query(
        `SELECT id, animal_id, data_pesagem, peso_kg, tipo_pesagem, metodo,
                lote_id, observacao, created_at, updated_at
           FROM pesagens
          WHERE animal_id = $1
          ORDER BY data_pesagem, id`,
        [animalId],
      ),
      pool.query(
        `WITH animais_do_lote AS (
           SELECT al.lote_id, al.animal_id
             FROM animais_lotes al
            WHERE al.lote_id IN (
              SELECT lote_id FROM animais_lotes WHERE animal_id = $1
            )
         ), ultimas AS (
           SELECT DISTINCT ON (p.animal_id) p.animal_id, p.peso_kg
             FROM pesagens p
            WHERE p.animal_id IN (SELECT animal_id FROM animais_do_lote)
            ORDER BY p.animal_id, p.data_pesagem DESC, p.id DESC
         )
         SELECT l.id AS lote_id, l.nome AS lote,
                AVG(u.peso_kg)::numeric(10,2) AS peso_medio,
                COUNT(u.animal_id)::integer AS animais_com_pesagem
           FROM ultimas u
           JOIN animais_do_lote adl ON adl.animal_id = u.animal_id
           JOIN lotes l ON l.id = adl.lote_id
           JOIN animais a ON a.id = u.animal_id AND a.propriedade_id = l.propriedade_id
           JOIN propriedades pr ON pr.id = l.propriedade_id
          WHERE ($2 = 'admin' OR pr.usuario_id = $3)
          GROUP BY l.id, l.nome
          ORDER BY l.nome`,
        [animalId, req.usuario.perfil, req.usuario.id],
      ),
    ]);

    const pesagens = serializarPesagens(pesagensResultado.rows);
    const resumo = montarResumoPesagens(animal, pesagens);
    res.json({
      resumo,
      evolucao: [...pesagens].reverse().map((item) => ({
        id: item.id,
        data: item.data_pesagem,
        peso_kg: item.peso_kg,
        tipo_pesagem: item.tipo_pesagem,
      })),
      comparacao_lotes: lotesResultado.rows.map((item) => ({
        ...item,
        peso_medio: Number(item.peso_medio),
        diferenca_kg: resumo.peso_atual === null
          ? null
          : resumo.peso_atual - Number(item.peso_medio),
      })),
    });
  } catch (erro) {
    registrarErro("pesagens_rota_erro", erro, req);
    res.status(500).json({ mensagem: "Erro ao calcular indicadores de pesagem" });
  }
});

router.post("/animais/:animalId/pesagens", async (req, res) => {
  const animalId = converterId(req.params.animalId);
  if (!animalId) return res.status(400).json({ mensagem: "ID do animal inválido" });
  const normalizada = normalizarPesagem(req.body);
  if (normalizada.erro) return res.status(400).json({ mensagem: normalizada.erro });
  const pesagem = normalizada.valor;
  let cliente;
  try {
    cliente = await pool.connect();
    await cliente.query("BEGIN");
    const animal = await buscarAnimalPermitido(animalId, req.usuario, cliente, true);
    if (!animal) {
      await cliente.query("ROLLBACK");
      return res.status(404).json({ mensagem: "Animal não encontrado" });
    }
    if (pesagem.loteId && !(await validarLote(pesagem, animal, req.usuario, cliente))) {
      await cliente.query("ROLLBACK");
      return res.status(404).json({ mensagem: "Lote não encontrado na propriedade do animal" });
    }

    await bloquearAnimalParaPeso(cliente, animalId);
    const resultado = await cliente.query(
      `INSERT INTO pesagens
              (animal_id, data_pesagem, peso_kg, tipo_pesagem, metodo,
               lote_id, observacao, registrado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [animalId, pesagem.dataPesagem, pesagem.pesoKg, pesagem.tipoPesagem,
        pesagem.metodo, pesagem.loteId, pesagem.observacao, req.usuario.id],
    );
    await sincronizarPesoAtual(cliente, animalId);
    await cliente.query("COMMIT");
    res.status(201).json({ mensagem: "Pesagem registrada com sucesso!", pesagem: resultado.rows[0] });
  } catch (erro) {
    if (cliente) await cliente.query("ROLLBACK").catch(() => {});
    registrarErro("pesagens_rota_erro", erro, req);
    res.status(500).json({ mensagem: "Erro ao registrar pesagem" });
  } finally {
    cliente?.release();
  }
});

router.put("/pesagens/:id", async (req, res) => {
  const id = converterId(req.params.id);
  if (!id) return res.status(400).json({ mensagem: "ID da pesagem inválido" });
  const normalizada = normalizarPesagem(req.body);
  if (normalizada.erro) return res.status(400).json({ mensagem: normalizada.erro });
  const pesagem = normalizada.valor;
  let cliente;
  try {
    cliente = await pool.connect();
    await cliente.query("BEGIN");
    const existente = await cliente.query(
      `SELECT pe.animal_id
         FROM pesagens pe
         JOIN animais a ON a.id = pe.animal_id
         JOIN propriedades p ON p.id = a.propriedade_id
        WHERE pe.id = $1 AND ($2 = 'admin' OR p.usuario_id = $3)
        FOR UPDATE OF pe`,
      [id, req.usuario.perfil, req.usuario.id],
    );
    if (!existente.rows[0]) {
      await cliente.query("ROLLBACK");
      return res.status(404).json({ mensagem: "Pesagem não encontrada" });
    }
    const animal = await buscarAnimalPermitido(existente.rows[0].animal_id, req.usuario, cliente, true);
    if (pesagem.loteId && !(await validarLote(pesagem, animal, req.usuario, cliente))) {
      await cliente.query("ROLLBACK");
      return res.status(404).json({ mensagem: "Lote não encontrado na propriedade do animal" });
    }

    await bloquearAnimalParaPeso(cliente, animal.id);
    const resultado = await cliente.query(
      `UPDATE pesagens SET data_pesagem = $1, peso_kg = $2, tipo_pesagem = $3,
              metodo = $4, lote_id = $5, observacao = $6,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $7 RETURNING *`,
      [pesagem.dataPesagem, pesagem.pesoKg, pesagem.tipoPesagem, pesagem.metodo,
        pesagem.loteId, pesagem.observacao, id],
    );
    await sincronizarPesoAtual(cliente, animal.id);
    await cliente.query("COMMIT");
    res.json({ mensagem: "Pesagem atualizada com sucesso!", pesagem: resultado.rows[0] });
  } catch (erro) {
    if (cliente) await cliente.query("ROLLBACK").catch(() => {});
    registrarErro("pesagens_rota_erro", erro, req);
    res.status(500).json({ mensagem: "Erro ao atualizar pesagem" });
  } finally {
    cliente?.release();
  }
});

router.delete("/pesagens/:id", async (req, res) => {
  const id = converterId(req.params.id);
  if (!id) return res.status(400).json({ mensagem: "ID da pesagem inválido" });
  let cliente;
  try {
    cliente = await pool.connect();
    await cliente.query("BEGIN");
    const existente = await cliente.query(
      `SELECT pe.animal_id
         FROM pesagens pe
         JOIN animais a ON a.id = pe.animal_id
         JOIN propriedades p ON p.id = a.propriedade_id
        WHERE pe.id = $1 AND ($2 = 'admin' OR p.usuario_id = $3)
        FOR UPDATE OF pe`,
      [id, req.usuario.perfil, req.usuario.id],
    );
    if (!existente.rows[0]) {
      await cliente.query("ROLLBACK");
      return res.status(404).json({ mensagem: "Pesagem não encontrada" });
    }
    await bloquearAnimalParaPeso(cliente, existente.rows[0].animal_id);
    const resultado = await cliente.query(
      `DELETE FROM pesagens pe
        WHERE pe.id = $1
          AND NOT EXISTS (SELECT 1 FROM desmamas d WHERE d.peso_desmama_id = pe.id)
          AND EXISTS (
            SELECT 1 FROM animais a JOIN propriedades p ON p.id = a.propriedade_id
             WHERE a.id = pe.animal_id AND ($2 = 'admin' OR p.usuario_id = $3)
          )
        RETURNING pe.*`,
      [id, req.usuario.perfil, req.usuario.id],
    );
    if (!resultado.rows[0]) {
      await cliente.query("ROLLBACK");
      return res.status(404).json({ mensagem: "Pesagem não encontrada ou vinculada a uma desmama" });
    }
    await sincronizarPesoAtual(cliente, resultado.rows[0].animal_id);
    await cliente.query("COMMIT");
    res.json({ mensagem: "Pesagem excluída com sucesso!", pesagem: resultado.rows[0] });
  } catch (erro) {
    if (cliente) await cliente.query("ROLLBACK").catch(() => {});
    registrarErro("pesagens_rota_erro", erro, req);
    res.status(500).json({ mensagem: "Erro ao excluir pesagem" });
  } finally {
    cliente?.release();
  }
});

router.get("/pesagens", async (req, res) => {
  try {
    const paginacao = normalizarPaginacao(req.query);
    if (paginacao.erro) return res.status(400).json({ mensagem: paginacao.erro });
    const { limite, offset } = paginacao.valor;
    const propriedadeId = req.query.propriedade_id ? converterId(req.query.propriedade_id) : null;
    const loteId = req.query.lote_id ? converterId(req.query.lote_id) : null;
    const animalId = req.query.animal_id ? converterId(req.query.animal_id) : null;
    if (req.query.tipo !== undefined && typeof req.query.tipo !== "string") return res.status(400).json({ mensagem: "Filtro invalido" });
    const tipo = req.query.tipo ? String(req.query.tipo).toUpperCase() : null;
    if (req.query.busca !== undefined && typeof req.query.busca !== "string") return res.status(400).json({ mensagem: "Busca invalida" });
    const busca = (req.query.busca || "").trim();
    if (busca.length > 120) return res.status(400).json({ mensagem: "Busca acima do limite permitido" });
    const inicio = req.query.data_inicio ? normalizarDataCalendario(req.query.data_inicio, "Data inicial") : { valor: null };
    const fim = req.query.data_fim ? normalizarDataCalendario(req.query.data_fim, "Data final") : { valor: null };
    if (inicio.erro || fim.erro) return res.status(400).json({ mensagem: inicio.erro || fim.erro });
    if ((req.query.propriedade_id && !propriedadeId) || (req.query.lote_id && !loteId) || (req.query.animal_id && !animalId)) {
      return res.status(400).json({ mensagem: "Filtro de ID inválido" });
    }
    if (tipo && !["NASCIMENTO", "ROTINA", "PRE_DESMAMA", "DESMAMA", "POS_DESMAMA", "SOBREANO", "OUTRA"].includes(tipo)) {
      return res.status(400).json({ mensagem: "Tipo de pesagem inválido" });
    }
    if (inicio.valor && fim.valor && inicio.valor > fim.valor) {
      return res.status(400).json({ mensagem: "A data inicial não pode ser posterior à data final" });
    }

    const resultado = await pool.query(
      `SELECT pe.id, pe.animal_id, a.nome AS animal, a.numero_brinco,
              a.propriedade_id, pr.nome AS propriedade, pe.data_pesagem,
              pe.peso_kg, pe.tipo_pesagem, pe.metodo, pe.lote_id,
              l.nome AS lote, pe.observacao
         FROM pesagens pe
         JOIN animais a ON a.id = pe.animal_id
         JOIN propriedades pr ON pr.id = a.propriedade_id
         LEFT JOIN lotes l ON l.id = pe.lote_id
        WHERE ($1 = 'admin' OR pr.usuario_id = $2)
          AND ($3::integer IS NULL OR pr.id = $3)
          AND ($4::integer IS NULL OR pe.lote_id = $4)
          AND ($5::integer IS NULL OR a.id = $5)
          AND ($6::text IS NULL OR pe.tipo_pesagem = $6)
          AND ($7::date IS NULL OR pe.data_pesagem >= $7)
          AND ($8::date IS NULL OR pe.data_pesagem <= $8)
          AND ($9 = '' OR a.nome ILIKE '%' || $9 || '%' OR COALESCE(a.numero_brinco, '') ILIKE '%' || $9 || '%')
        ORDER BY pe.data_pesagem DESC, pe.id DESC
        LIMIT $10 OFFSET $11`,
      [req.usuario.perfil, req.usuario.id, propriedadeId, loteId, animalId,
        tipo, inicio.valor, fim.valor, busca, limite + 1, offset],
    );
    const linhas = responderPagina(res, resultado.rows, paginacao.valor);
    res.json(serializarPesagens(linhas));
  } catch (erro) {
    registrarErro("pesagens_rota_erro", erro, req);
    res.status(500).json({ mensagem: "Erro ao buscar pesagens" });
  }
});

module.exports = router;
module.exports.sincronizarPesoAtual = sincronizarPesoAtual;
