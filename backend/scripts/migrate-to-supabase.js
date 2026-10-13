require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { Client } = require("pg");
const {
  criarConfiguracaoLegada,
  criarConfiguracaoPorUrl,
} = require("../database/config");

const TABELAS = [
  "usuarios",
  "propriedades",
  "animais",
  "lotes",
  "vacinas",
  "vacinacoes",
  "despesas",
  "receitas",
  "animais_lotes",
];

const TABELAS_COM_SEQUENCE = TABELAS.filter(
  (tabela) => tabela !== "animais_lotes",
);

// Esta ferramenta foi escrita para o schema inicial. Nunca declarar sucesso
// quando uma origem atual possui historicos que nao serao copiados.
async function validarEscopoOrigem(cliente) {
  const resultado = await cliente.query(
    `SELECT table_name AS objeto FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name <> ALL($1::text[])
     UNION ALL
     SELECT table_name || '.' || column_name AS objeto
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'animais' AND column_name = 'mae_id'
     ORDER BY objeto`,
    [TABELAS],
  );
  if (resultado.rows.length) {
    throw new Error(
      `A origem possui estruturas nao suportadas por esta migracao inicial: ${resultado.rows.map((linha) => linha.objeto).join(", ")}. ` +
      "Nenhum backup ou escrita no destino foi iniciado. Use backup/restauracao completos revisados para o schema atual; nao remova tabelas ou colunas para contornar esta verificacao.",
    );
  }
}

function identificador(nome) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(nome)) {
    throw new Error(`Identificador SQL invalido: ${nome}`);
  }

  return `"${nome}"`;
}

function configuracaoOrigem() {
  if (process.env.LOCAL_DATABASE_URL) {
    return criarConfiguracaoPorUrl(process.env.LOCAL_DATABASE_URL, {
      sslMode: process.env.LOCAL_DB_SSL,
      sslCaPath: process.env.LOCAL_DB_SSL_CA_PATH,
    });
  }

  return criarConfiguracaoLegada({
    ...process.env,
    DB_SSL: process.env.LOCAL_DB_SSL || "disable",
    DB_SSL_CA_PATH: process.env.LOCAL_DB_SSL_CA_PATH,
  });
}

function configuracaoDestino() {
  const conexao = process.env.SUPABASE_MIGRATION_URL;

  if (!conexao) {
    throw new Error(
      "Defina SUPABASE_MIGRATION_URL com a Direct connection ou Session pooler do Supabase",
    );
  }

  return criarConfiguracaoPorUrl(conexao, {
    sslMode: process.env.SUPABASE_DB_SSL,
    sslCaPath: process.env.SUPABASE_DB_SSL_CA_PATH,
  });
}

function ambientePg(configuracao) {
  const ambiente = { ...process.env };

  if (configuracao.connectionString) {
    const url = new URL(configuracao.connectionString);
    ambiente.PGHOST = url.hostname;
    ambiente.PGPORT = url.port || "5432";
    ambiente.PGUSER = decodeURIComponent(url.username);
    ambiente.PGPASSWORD = decodeURIComponent(url.password);
    ambiente.PGDATABASE = decodeURIComponent(url.pathname.replace(/^\//, ""));

    if (url.searchParams.has("sslmode")) {
      ambiente.PGSSLMODE = url.searchParams.get("sslmode");
    } else if (configuracao.ssl) {
      ambiente.PGSSLMODE = configuracao.ssl.rejectUnauthorized
        ? "verify-full"
        : "require";
    }
  } else {
    ambiente.PGHOST = configuracao.host;
    ambiente.PGPORT = String(configuracao.port);
    ambiente.PGUSER = configuracao.user;
    ambiente.PGPASSWORD = configuracao.password;
    ambiente.PGDATABASE = configuracao.database;
    ambiente.PGSSLMODE = configuracao.ssl ? "require" : "disable";
  }

  return ambiente;
}

function criarBackup(configuracao) {
  const data = new Date().toISOString().replace(/[:.]/g, "-");
  const pasta = path.join(__dirname, "..", "backups");
  const arquivo = path.join(pasta, `bovitrack-antes-supabase-${data}.dump`);
  fs.mkdirSync(pasta, { recursive: true });

  const resultado = spawnSync(
    "pg_dump",
    [
      "--format=custom",
      "--schema=public",
      "--no-owner",
      "--no-privileges",
      "--no-subscriptions",
      `--file=${arquivo}`,
    ],
    {
      env: ambientePg(configuracao),
      stdio: "inherit",
    },
  );

  if (resultado.error) {
    throw new Error(
      `Nao foi possivel executar pg_dump: ${resultado.error.message}`,
    );
  }

  if (resultado.status !== 0) {
    throw new Error(`pg_dump terminou com o codigo ${resultado.status}`);
  }

  return arquivo;
}

async function tabelasExistentes(cliente) {
  const resultado = await cliente.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
      ORDER BY table_name`,
    [TABELAS],
  );

  return resultado.rows.map((linha) => linha.table_name);
}

async function criarSchemaSeNecessario(cliente) {
  const existentes = await tabelasExistentes(cliente);

  if (existentes.length === TABELAS.length) {
    return false;
  }

  if (existentes.length > 0) {
    throw new Error(
      `O destino possui apenas parte das tabelas do BoviTrack: ${existentes.join(", ")}. Nenhuma tabela foi alterada.`,
    );
  }

  const arquivo = path.join(
    __dirname,
    "..",
    "database",
    "supabase",
    "001_schema_bovitrack.sql",
  );
  await cliente.query(fs.readFileSync(arquivo, "utf8"));
  return true;
}

async function obterColunas(cliente) {
  const resultado = await cliente.query(
    `SELECT table_name,
            column_name,
            data_type,
            udt_name,
            is_nullable,
            character_maximum_length,
            numeric_precision,
            numeric_scale
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
      ORDER BY table_name, ordinal_position`,
    [TABELAS],
  );

  return resultado.rows;
}

function assinaturaColuna(coluna) {
  return [
    coluna.table_name,
    coluna.column_name,
    coluna.data_type,
    coluna.udt_name,
    coluna.is_nullable,
    coluna.character_maximum_length ?? "",
    coluna.numeric_precision ?? "",
    coluna.numeric_scale ?? "",
  ].join("|");
}

async function validarSchema(origem, destino) {
  const [colunasOrigem, colunasDestino] = await Promise.all([
    obterColunas(origem),
    obterColunas(destino),
  ]);
  const origemAssinaturas = colunasOrigem.map(assinaturaColuna);
  const destinoAssinaturas = new Set(colunasDestino.map(assinaturaColuna));
  const incompatibilidades = origemAssinaturas.filter(
    (assinatura) => !destinoAssinaturas.has(assinatura),
  );

  if (incompatibilidades.length > 0) {
    throw new Error(
      `O schema do destino nao e compativel com a origem:\n${incompatibilidades.join("\n")}`,
    );
  }

  const constraintsEsperadas = [
    "animais_lotes_animal_id_fkey",
    "animais_lotes_lote_id_fkey",
    "animais_lotes_pkey",
    "animais_pkey",
    "animais_propriedade_id_fkey",
    "despesas_pkey",
    "despesas_propriedade_id_fkey",
    "receitas_pkey",
    "receitas_propriedade_id_fkey",
    "receitas_valor_check",
    "lotes_pkey",
    "lotes_propriedade_id_fkey",
    "propriedades_pkey",
    "propriedades_usuario_id_fkey",
    "usuarios_email_key",
    "usuarios_perfil_check",
    "usuarios_pkey",
    "vacinacoes_animal_id_fkey",
    "vacinacoes_pkey",
    "vacinacoes_vacina_id_fkey",
    "vacinas_pkey",
    "vacinas_usuario_id_fkey",
  ];
  const resultadoConstraints = await destino.query(
    `SELECT conname
       FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace
        AND conname = ANY($1::text[])`,
    [constraintsEsperadas],
  );
  const constraintsEncontradas = new Set(
    resultadoConstraints.rows.map((linha) => linha.conname),
  );
  const constraintsAusentes = constraintsEsperadas.filter(
    (nome) => !constraintsEncontradas.has(nome),
  );

  if (constraintsAusentes.length > 0) {
    throw new Error(
      `Constraints ausentes no destino: ${constraintsAusentes.join(", ")}`,
    );
  }

  const objetosEsperados = [
    "animais_id_seq",
    "animais_propriedade_numero_brinco_uidx",
    "despesas_id_seq",
    "receitas_id_seq",
    "receitas_propriedade_data_idx",
    "lotes_id_seq",
    "propriedades_id_seq",
    "propriedades_usuario_id_idx",
    "usuarios_admin_unico_idx",
    "usuarios_id_seq",
    "vacinacoes_id_seq",
    "vacinas_id_seq",
    "vacinas_usuario_id_idx",
  ];
  const resultadoObjetos = await destino.query(
    `SELECT relname
       FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relname = ANY($1::text[])`,
    [objetosEsperados],
  );
  const objetosEncontrados = new Set(
    resultadoObjetos.rows.map((linha) => linha.relname),
  );
  const objetosAusentes = objetosEsperados.filter(
    (nome) => !objetosEncontrados.has(nome),
  );

  if (objetosAusentes.length > 0) {
    throw new Error(
      `Indices ou sequences ausentes no destino: ${objetosAusentes.join(", ")}`,
    );
  }

  return colunasOrigem;
}

async function garantirDestinoVazio(cliente) {
  const ocupadas = [];

  for (const tabela of TABELAS) {
    const resultado = await cliente.query(
      `SELECT COUNT(*)::integer AS total FROM public.${identificador(tabela)}`,
    );

    if (resultado.rows[0].total > 0) {
      ocupadas.push(`${tabela} (${resultado.rows[0].total})`);
    }
  }

  if (ocupadas.length > 0) {
    throw new Error(
      `O destino ja possui dados em ${ocupadas.join(", ")}. A migracao foi cancelada sem excluir registros.`,
    );
  }
}

function colunasDaTabela(colunas, tabela) {
  return colunas
    .filter((coluna) => coluna.table_name === tabela)
    .map((coluna) => coluna.column_name);
}

async function copiarTabela(origem, destino, tabela, colunas) {
  const nomes = colunas.map(identificador).join(", ");
  const ordem = colunas.includes("id")
    ? "id"
    : colunas.map(identificador).join(", ");
  const registros = await origem.query(
    `SELECT ${nomes} FROM public.${identificador(tabela)} ORDER BY ${ordem}`,
  );

  for (const registro of registros.rows) {
    const parametros = colunas.map((_, indice) => `$${indice + 1}`).join(", ");
    const valores = colunas.map((coluna) => registro[coluna]);
    await destino.query(
      `INSERT INTO public.${identificador(tabela)} (${nomes}) VALUES (${parametros})`,
      valores,
    );
  }

  return registros.rowCount;
}

async function corrigirSequences(cliente) {
  for (const tabela of TABELAS_COM_SEQUENCE) {
    await cliente.query(
      `SELECT setval(
         pg_get_serial_sequence('public.${tabela}', 'id'),
         COALESCE(MAX(id), 1),
         COUNT(*) > 0
       )
       FROM public.${identificador(tabela)}`,
    );
  }
}

async function executar() {
  const origemConfig = configuracaoOrigem();
  const destinoConfig = configuracaoDestino();
  const origem = new Client(origemConfig);
  const destino = new Client(destinoConfig);
  let transacaoOrigem = false;
  let transacaoDestino = false;

  try {
    await origem.connect();
    await validarEscopoOrigem(origem);
    console.log("1/6 Criando backup completo do schema public local...");
    const backup = criarBackup(origemConfig);
    console.log(`Backup criado em ${backup}`);

    console.log("2/6 Validando conexoes de origem e destino...");
    await destino.connect();
    const [versaoOrigem, versaoDestino] = await Promise.all([
      origem.query("SHOW server_version"),
      destino.query("SHOW server_version"),
    ]);
    console.log(
      `PostgreSQL origem ${versaoOrigem.rows[0].server_version}; destino ${versaoDestino.rows[0].server_version}`,
    );

    console.log("3/6 Preparando e validando o schema no Supabase...");
    const schemaCriado = await criarSchemaSeNecessario(destino);
    console.log(schemaCriado ? "Schema criado no Supabase." : "Schema existente sera reutilizado.");
    const colunas = await validarSchema(origem, destino);
    await garantirDestinoVazio(destino);

    console.log("4/6 Copiando dados com IDs preservados...");
    await origem.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    transacaoOrigem = true;
    await destino.query("BEGIN");
    transacaoDestino = true;

    const totais = {};

    for (const tabela of TABELAS) {
      totais[tabela] = await copiarTabela(
        origem,
        destino,
        tabela,
        colunasDaTabela(colunas, tabela),
      );
      console.log(`  ${tabela}: ${totais[tabela]} registro(s)`);
    }

    console.log("5/6 Corrigindo sequences e conferindo contagens...");
    await corrigirSequences(destino);

    for (const tabela of TABELAS) {
      const resultado = await destino.query(
        `SELECT COUNT(*)::integer AS total FROM public.${identificador(tabela)}`,
      );

      if (resultado.rows[0].total !== totais[tabela]) {
        throw new Error(`Contagem divergente na tabela ${tabela}`);
      }
    }

    await destino.query("COMMIT");
    transacaoDestino = false;
    await origem.query("COMMIT");
    transacaoOrigem = false;

    for (const tabela of TABELAS) {
      await destino.query(`ANALYZE public.${identificador(tabela)}`);
    }

    console.log("6/6 Migracao concluida e validada sem alterar os dados locais.");
    console.log("Agora configure DATABASE_URL com a conexao do Supabase e execute npm run db:check.");
  } catch (erro) {
    if (transacaoDestino) {
      await destino.query("ROLLBACK").catch(() => {});
    }

    if (transacaoOrigem) {
      await origem.query("ROLLBACK").catch(() => {});
    }

    throw erro;
  } finally {
    await Promise.allSettled([origem.end(), destino.end()]);
  }
}

executar().catch((erro) => {
  console.error(`Migracao cancelada: ${erro.message}`);
  process.exit(1);
});
