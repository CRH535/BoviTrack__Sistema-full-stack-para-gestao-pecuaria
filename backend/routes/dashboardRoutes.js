const express = require("express");
const pool = require("../database/pool")
const { registrarErro, registrarEvento } = require("../utils/log");

const router = express.Router();

router.get("/dashboard", async (req, res) => {
  try {
    const parametros = [req.usuario.perfil, req.usuario.id];
    const parametrosComFuso = [...parametros, process.env.APP_TIMEZONE || "America/Sao_Paulo"];

    const resumoResultado = await pool.query(
      `SELECT
        (SELECT COUNT(*)
           FROM propriedades p
          WHERE ($1 = 'admin' OR p.usuario_id = $2)) AS propriedades,
        (SELECT COUNT(*)
           FROM animais a
           JOIN propriedades p ON p.id = a.propriedade_id
          WHERE ($1 = 'admin' OR p.usuario_id = $2)) AS animais,
        (SELECT COUNT(*)
           FROM lotes l
           JOIN propriedades p ON p.id = l.propriedade_id
          WHERE ($1 = 'admin' OR p.usuario_id = $2)) AS lotes,
        (SELECT COUNT(*)
           FROM vacinas v
          WHERE ($1 = 'admin' OR v.usuario_id = $2)) AS vacinas,
        (SELECT COALESCE(SUM(d.valor), 0)
           FROM despesas d
           JOIN propriedades p ON p.id = d.propriedade_id
          WHERE ($1 = 'admin' OR p.usuario_id = $2)) AS total_despesas,
        (SELECT COUNT(*)
           FROM animais a JOIN propriedades p ON p.id = a.propriedade_id
          WHERE a.data_nascimento >= (CURRENT_TIMESTAMP AT TIME ZONE $3)::date - 365
            AND ($1 = 'admin' OR p.usuario_id = $2)
            AND NOT EXISTS (
              SELECT 1 FROM desmamas de
               WHERE de.animal_id = a.id AND de.status = 'CONCLUIDA'
                 AND de.tipo_desmama <> 'TEMPORARIA'
            )) AS bezerros_aleitamento,
        (SELECT COUNT(*) FROM desmamas de
           JOIN animais a ON a.id = de.animal_id
           JOIN propriedades p ON p.id = a.propriedade_id
          WHERE de.status IN ('PLANEJADA','EM_ANDAMENTO')
            AND ($1 = 'admin' OR p.usuario_id = $2)) AS desmamas_planejadas,
        (SELECT COUNT(*) FROM desmamas de
           JOIN animais a ON a.id = de.animal_id
           JOIN propriedades p ON p.id = a.propriedade_id
          WHERE de.status IN ('PLANEJADA','EM_ANDAMENTO')
            AND de.data_planejada BETWEEN (CURRENT_TIMESTAMP AT TIME ZONE $3)::date AND (CURRENT_TIMESTAMP AT TIME ZONE $3)::date + 30
            AND ($1 = 'admin' OR p.usuario_id = $2)) AS desmamas_proximas,
        (SELECT COUNT(*) FROM desmamas de
           JOIN animais a ON a.id = de.animal_id
           JOIN propriedades p ON p.id = a.propriedade_id
          WHERE de.status = 'CONCLUIDA' AND de.tipo_desmama <> 'TEMPORARIA'
            AND EXTRACT(YEAR FROM de.data_desmama) = EXTRACT(YEAR FROM (CURRENT_TIMESTAMP AT TIME ZONE $3)::date)
            AND ($1 = 'admin' OR p.usuario_id = $2)) AS desmamados_ano,
        (SELECT COUNT(*) FROM animais a
           JOIN propriedades p ON p.id = a.propriedade_id
          WHERE ($1 = 'admin' OR p.usuario_id = $2)
            AND NOT EXISTS (
              SELECT 1 FROM pesagens pe WHERE pe.animal_id = a.id
                AND pe.data_pesagem >= (CURRENT_TIMESTAMP AT TIME ZONE $3)::date - 60
            )) AS animais_sem_pesagem_recente`,
      parametrosComFuso,
    );

    let totalReceitas = null;
    try {
      const receitasResultado = await pool.query(
        `SELECT COALESCE(SUM(r.valor), 0) AS total_receitas
           FROM receitas r
           JOIN propriedades p ON p.id = r.propriedade_id
          WHERE ($1 = 'admin' OR p.usuario_id = $2)`,
        parametros,
      );
      totalReceitas = Number(receitasResultado.rows[0].total_receitas);
    } catch (erro) {
      if (erro.code !== "42P01") throw erro;

      registrarEvento("aviso", "receitas_schema_pendente", {
        request_id: req.id,
        usuario_id: req.usuario.id,
      });
    }

    const proximasResultado = await pool.query(
      `SELECT vc.id,
              vc.animal_id,
              a.nome AS animal,
              vc.vacina_id,
              v.nome AS vacina,
              vc.data_aplicacao,
              vc.proxima_dose,
              vc.observacao
         FROM vacinacoes vc
         JOIN animais a ON a.id = vc.animal_id
         JOIN propriedades p ON p.id = a.propriedade_id
         JOIN vacinas v ON v.id = vc.vacina_id
        WHERE vc.proxima_dose BETWEEN (CURRENT_TIMESTAMP AT TIME ZONE $3)::date
                                  AND (CURRENT_TIMESTAMP AT TIME ZONE $3)::date + INTERVAL '7 days'
          AND (
            $1 = 'admin'
            OR (p.usuario_id = $2 AND v.usuario_id = $2)
          )
        ORDER BY vc.proxima_dose`,
      parametrosComFuso,
    );

    const resumo = resumoResultado.rows[0];

    res.json({
      resumo: {
        propriedades: Number(resumo.propriedades),
        animais: Number(resumo.animais),
        lotes: Number(resumo.lotes),
        vacinas: Number(resumo.vacinas),
        total_despesas: Number(resumo.total_despesas),
        total_receitas: totalReceitas,
        lucro_liquido: totalReceitas === null ? null : totalReceitas - Number(resumo.total_despesas),
        bezerros_aleitamento: Number(resumo.bezerros_aleitamento),
        desmamas_planejadas: Number(resumo.desmamas_planejadas),
        desmamas_proximas: Number(resumo.desmamas_proximas),
        desmamados_ano: Number(resumo.desmamados_ano),
        animais_sem_pesagem_recente: Number(resumo.animais_sem_pesagem_recente),
      },
      receitas_disponiveis: totalReceitas !== null,
      proximas_vacinacoes: proximasResultado.rows,
    });
  } catch (erro) {
    registrarErro("dashboard_erro", erro, req);
    res.status(500).json({ mensagem: "Erro ao carregar o dashboard" });
  }
});

// =========================
// PROPRIEDADES
// =========================

module.exports = router;
