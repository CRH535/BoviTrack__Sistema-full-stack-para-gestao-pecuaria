require("dotenv").config();

const pool = require("../database/pool");

const TABELAS = [
  "usuarios",
  "sessoes_refresh",
  "sessoes_refresh_usados",
  "limites_requisicao",
  "propriedades",
  "animais",
  "producoes_leiteiras",
  "pesagens",
  "desmamas",
  "lotes",
  "animais_lotes",
  "vacinas",
  "vacinacoes",
  "despesas",
  "receitas",
];

const TABELAS_COM_SEQUENCE = TABELAS.filter(
  (tabela) => !["animais_lotes", "sessoes_refresh_usados", "limites_requisicao"].includes(tabela),
);

async function verificar(cliente) {
  const versao = await cliente.query("SHOW server_version");
  const tabelas = await cliente.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
      ORDER BY table_name`,
    [TABELAS],
  );
  const encontradas = new Set(tabelas.rows.map((linha) => linha.table_name));
  const ausentes = TABELAS.filter((tabela) => !encontradas.has(tabela));

  if (ausentes.length > 0) {
    throw new Error(`Tabelas ausentes: ${ausentes.join(", ")}`);
  }

  const contagens = [];

  for (const tabela of TABELAS) {
    const resultado = await cliente.query(
      `SELECT COUNT(*)::integer AS total FROM public."${tabela}"`,
    );
    contagens.push({ tabela, registros: resultado.rows[0].total });
  }

  const orfaos = await cliente.query(
    `SELECT
       (SELECT COUNT(*) FROM propriedades p LEFT JOIN usuarios u ON u.id = p.usuario_id WHERE u.id IS NULL)::integer
         AS propriedades_sem_usuario,
       (SELECT COUNT(*) FROM animais a LEFT JOIN propriedades p ON p.id = a.propriedade_id WHERE p.id IS NULL)::integer
         AS animais_sem_propriedade,
       (SELECT COUNT(*) FROM producoes_leiteiras pl LEFT JOIN animais a ON a.id = pl.animal_id WHERE a.id IS NULL)::integer
         AS producoes_sem_animal,
       (SELECT COUNT(*) FROM pesagens pe LEFT JOIN animais a ON a.id = pe.animal_id WHERE a.id IS NULL)::integer
         AS pesagens_sem_animal,
       (SELECT COUNT(*) FROM desmamas de LEFT JOIN animais a ON a.id = de.animal_id WHERE a.id IS NULL)::integer
         AS desmamas_sem_animal,
       (SELECT COUNT(*) FROM animais a LEFT JOIN animais m ON m.id = a.mae_id WHERE a.mae_id IS NOT NULL AND m.id IS NULL)::integer
         AS animais_sem_mae_valida,
       (SELECT COUNT(*) FROM lotes l LEFT JOIN propriedades p ON p.id = l.propriedade_id WHERE p.id IS NULL)::integer
         AS lotes_sem_propriedade,
       (SELECT COUNT(*) FROM despesas d LEFT JOIN propriedades p ON p.id = d.propriedade_id WHERE p.id IS NULL)::integer
         AS despesas_sem_propriedade,
       (SELECT COUNT(*) FROM receitas r LEFT JOIN propriedades p ON p.id = r.propriedade_id WHERE p.id IS NULL)::integer
         AS receitas_sem_propriedade,
       (SELECT COUNT(*) FROM vacinas v LEFT JOIN usuarios u ON u.id = v.usuario_id WHERE u.id IS NULL)::integer
         AS vacinas_sem_usuario,
       (SELECT COUNT(*) FROM sessoes_refresh sr LEFT JOIN usuarios u ON u.id = sr.usuario_id WHERE u.id IS NULL)::integer
         AS sessoes_sem_usuario,
       (SELECT COUNT(*) FROM vacinacoes vc LEFT JOIN animais a ON a.id = vc.animal_id WHERE a.id IS NULL)::integer
         AS vacinacoes_sem_animal,
       (SELECT COUNT(*) FROM vacinacoes vc LEFT JOIN vacinas v ON v.id = vc.vacina_id WHERE v.id IS NULL)::integer
         AS vacinacoes_sem_vacina,
       (SELECT COUNT(*) FROM animais_lotes al LEFT JOIN animais a ON a.id = al.animal_id WHERE a.id IS NULL)::integer
         AS relacoes_sem_animal,
       (SELECT COUNT(*) FROM animais_lotes al LEFT JOIN lotes l ON l.id = al.lote_id WHERE l.id IS NULL)::integer
         AS relacoes_sem_lote,
       (SELECT COUNT(*) FROM sessoes_refresh_usados su LEFT JOIN sessoes_refresh sr ON sr.id = su.sessao_id WHERE sr.id IS NULL)::integer
         AS tokens_usados_sem_sessao,
       (SELECT COUNT(*) FROM pesagens pe LEFT JOIN lotes l ON l.id = pe.lote_id WHERE pe.lote_id IS NOT NULL AND l.id IS NULL)::integer
         AS pesagens_sem_lote_valido,
       (SELECT COUNT(*) FROM desmamas de LEFT JOIN animais m ON m.id = de.mae_id WHERE de.mae_id IS NOT NULL AND m.id IS NULL)::integer
         AS desmamas_sem_mae_valida,
       (SELECT COUNT(*) FROM desmamas de LEFT JOIN lotes l ON l.id = de.lote_destino_id WHERE de.lote_destino_id IS NOT NULL AND l.id IS NULL)::integer
         AS desmamas_sem_lote_valido,
       (SELECT COUNT(*) FROM desmamas de LEFT JOIN pesagens pe ON pe.id = de.peso_desmama_id WHERE de.peso_desmama_id IS NOT NULL AND pe.id IS NULL)::integer
         AS desmamas_sem_pesagem_valida,
       (SELECT COUNT(*) FROM pesagens pe LEFT JOIN usuarios u ON u.id = pe.registrado_por WHERE pe.registrado_por IS NOT NULL AND u.id IS NULL)::integer
         AS pesagens_sem_registrador,
       (SELECT COUNT(*) FROM desmamas de LEFT JOIN usuarios u ON u.id = de.registrado_por WHERE de.registrado_por IS NOT NULL AND u.id IS NULL)::integer
         AS desmamas_sem_registrador`,
  );
  const problemas = Object.entries(orfaos.rows[0]).filter(([, total]) => total > 0);

  if (problemas.length > 0) {
    throw new Error(
      `Relacionamentos orfaos: ${problemas.map(([nome, total]) => `${nome}=${total}`).join(", ")}`,
    );
  }

  const integridade = await cliente.query(
    `SELECT
       (SELECT COUNT(*) FROM animais a JOIN animais m ON m.id = a.mae_id
         WHERE m.id = a.id OR m.sexo IS DISTINCT FROM 'F'
            OR m.propriedade_id IS DISTINCT FROM a.propriedade_id)::integer AS parentesco_inconsistente,
       (SELECT COUNT(*) FROM animais_lotes al JOIN animais a ON a.id = al.animal_id JOIN lotes l ON l.id = al.lote_id
         WHERE a.propriedade_id <> l.propriedade_id)::integer AS lotes_animais_incompativeis,
       (SELECT COUNT(*) FROM vacinacoes vc JOIN animais a ON a.id = vc.animal_id
         JOIN propriedades p ON p.id = a.propriedade_id JOIN vacinas v ON v.id = vc.vacina_id
         WHERE p.usuario_id <> v.usuario_id)::integer AS vacinacoes_entre_usuarios,
       (SELECT COUNT(*) FROM pesagens pe JOIN animais a ON a.id = pe.animal_id JOIN lotes l ON l.id = pe.lote_id
         WHERE a.propriedade_id <> l.propriedade_id)::integer AS pesagens_lotes_incompativeis,
       (SELECT COUNT(*) FROM desmamas de JOIN animais a ON a.id = de.animal_id JOIN animais m ON m.id = de.mae_id
         WHERE m.id = a.id OR m.sexo IS DISTINCT FROM 'F'
            OR m.propriedade_id <> a.propriedade_id)::integer AS desmamas_maes_incompativeis,
       (SELECT COUNT(*) FROM desmamas de JOIN animais a ON a.id = de.animal_id JOIN lotes l ON l.id = de.lote_destino_id
         WHERE a.propriedade_id <> l.propriedade_id)::integer AS desmamas_lotes_incompativeis,
       (SELECT COUNT(*) FROM desmamas de JOIN pesagens pe ON pe.id = de.peso_desmama_id
         WHERE de.animal_id <> pe.animal_id)::integer AS desmamas_pesagens_incompativeis,
       (SELECT COUNT(*) FROM sessoes_refresh_usados su JOIN sessoes_refresh sr ON sr.id = su.sessao_id
         WHERE su.family_id IS DISTINCT FROM sr.family_id)::integer AS tokens_usados_familias_incompativeis,
       (SELECT COUNT(*) FROM sessoes_refresh
         WHERE session_id IS NULL OR family_id IS NULL OR last_authenticated_at IS NULL
            OR length(session_id) = 0 OR length(family_id) = 0)::integer AS sessoes_sem_identidade,
       (SELECT COUNT(*) FROM limites_requisicao
         WHERE contador <= 0 OR janela_fim <= janela_inicio)::integer AS limites_invalidos`,
  );
  const inconsistencias = Object.entries(integridade.rows[0]).filter(([, total]) => total > 0);
  if (inconsistencias.length) {
    throw new Error(`Referencias inconsistentes: ${inconsistencias.map(([nome, total]) => `${nome}=${total}`).join(", ")}`);
  }

  for (const tabela of TABELAS_COM_SEQUENCE) {
    const sequence = await cliente.query(
      `SELECT pg_get_serial_sequence($1, 'id') AS nome,
              quote_ident(n.nspname) || '.' || quote_ident(c.relname) AS identificador
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.oid = pg_get_serial_sequence($1, 'id')::regclass`,
      [`public.${tabela}`],
    );

    if (!sequence.rows[0]?.nome) {
      throw new Error(`Sequence do ID nao encontrada para ${tabela}`);
    }

    const posicao = await cliente.query(
      `SELECT MAX(id)::bigint AS maior_id,
              (SELECT last_value FROM ${sequence.rows[0].identificador})::bigint AS ultimo_valor,
              (SELECT is_called FROM ${sequence.rows[0].identificador}) AS chamada
         FROM public."${tabela}"`,
    );
    const { maior_id, ultimo_valor, chamada } = posicao.rows[0];

    if (maior_id !== null && (BigInt(ultimo_valor) < BigInt(maior_id)
        || (!chamada && BigInt(ultimo_valor) === BigInt(maior_id)))) {
      throw new Error(
        `Sequence de ${tabela} esta atrasada: ${ultimo_valor} < ${maior_id}`,
      );
    }
  }

  console.log(`PostgreSQL ${versao.rows[0].server_version}`);
  console.table(contagens);
  console.log("Schema e relacionamentos do BoviTrack validados com sucesso.");
}

async function executar() {
  const cliente = await pool.connect();
  try {
    // Todas as verificacoes compartilham um snapshot e nao podem escrever dados.
    await cliente.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await verificar(cliente);
  } finally {
    await cliente.query("ROLLBACK").catch(() => {});
    cliente.release();
  }
}

executar()
  .catch((erro) => {
    console.error(`Falha na verificacao: ${erro.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
