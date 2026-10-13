const pool = require("../database/pool");
const { converterId } = require("../utils/validacoes");

function criarErroHttp(mensagem, status = 400) {
  const erro = new Error(mensagem);
  erro.status = status;
  return erro;
}

function normalizarId(valor, entidade) {
  const id = converterId(valor);

  if (!Number.isInteger(id) || id <= 0) {
    throw criarErroHttp(`${entidade} inválido`);
  }

  return id;
}

function criarGrupo(chave, titulo, registros) {
  return {
    chave,
    titulo,
    total: registros.length,
    registros,
  };
}

function montarImpacto(tipo, entidade, grupos) {
  const gruposComRegistros = grupos.filter((grupo) => grupo.total > 0);
  const resumo = Object.fromEntries(
    grupos.map((grupo) => [grupo.chave, grupo.total]),
  );

  return {
    tipo,
    entidade,
    total_registros: grupos.reduce((total, grupo) => total + grupo.total, 0),
    resumo,
    grupos: gruposComRegistros,
  };
}

async function consultarRegistrosDaPropriedade(executor, propriedadeId) {
  const consultas = [
    {
      chave: "animais",
      titulo: "Animais",
      sql: `SELECT id, nome, numero_brinco
              FROM animais
             WHERE propriedade_id = $1
             ORDER BY nome, id`,
    },
    {
      chave: "lotes",
      titulo: "Lotes",
      sql: `SELECT id, nome
              FROM lotes
             WHERE propriedade_id = $1
             ORDER BY nome, id`,
    },
    {
      chave: "animais_lotes",
      titulo: "Vínculos entre animais e lotes",
      sql: `SELECT al.animal_id,
                   al.lote_id,
                   a.nome AS animal_nome,
                   l.nome AS lote_nome
              FROM animais_lotes al
              JOIN animais a ON a.id = al.animal_id
              JOIN lotes l ON l.id = al.lote_id
             WHERE a.propriedade_id = $1 OR l.propriedade_id = $1
             ORDER BY a.nome, l.nome, al.animal_id, al.lote_id`,
    },
    {
      chave: "pesagens",
      titulo: "Pesagens",
      sql: `SELECT pe.id,
                   pe.animal_id,
                   a.nome AS animal_nome,
                   pe.data_pesagem,
                   pe.peso_kg
              FROM pesagens pe
              JOIN animais a ON a.id = pe.animal_id
             WHERE a.propriedade_id = $1
             ORDER BY pe.data_pesagem DESC, pe.id DESC`,
    },
    {
      chave: "desmamas",
      titulo: "Desmamas",
      sql: `SELECT de.id,
                   de.animal_id,
                   a.nome AS animal_nome,
                   de.data_planejada,
                   de.data_desmama,
                   de.status
              FROM desmamas de
              JOIN animais a ON a.id = de.animal_id
             WHERE a.propriedade_id = $1
             ORDER BY de.data_planejada DESC, de.id DESC`,
    },
    {
      chave: "vacinacoes",
      titulo: "Vacinações",
      sql: `SELECT vc.id,
                   vc.animal_id,
                   a.nome AS animal_nome,
                   v.nome AS vacina_nome,
                   vc.data_aplicacao
              FROM vacinacoes vc
              JOIN animais a ON a.id = vc.animal_id
              JOIN vacinas v ON v.id = vc.vacina_id
             WHERE a.propriedade_id = $1
             ORDER BY vc.data_aplicacao DESC, vc.id DESC`,
    },
    {
      chave: "despesas",
      titulo: "Despesas",
      sql: `SELECT id, descricao, categoria, valor, data
              FROM despesas
             WHERE propriedade_id = $1
             ORDER BY data DESC, id DESC`,
    },
    {
      chave: "receitas",
      titulo: "Receitas",
      sql: `SELECT id, descricao, categoria, valor, data
              FROM receitas
             WHERE propriedade_id = $1
             ORDER BY data DESC, id DESC`,
    },
    {
      chave: "producoes_leiteiras",
      titulo: "Produções leiteiras",
      sql: `SELECT pl.id,
                   pl.animal_id,
                   a.nome AS animal_nome,
                   pl.data,
                   pl.turno,
                   pl.quantidade_litros
              FROM producoes_leiteiras pl
              JOIN animais a ON a.id = pl.animal_id
             WHERE a.propriedade_id = $1
             ORDER BY pl.data DESC, pl.id DESC`,
    },
  ];

  const grupos = [];

  for (const consulta of consultas) {
    const resultado = await executor.query(consulta.sql, [propriedadeId]);
    grupos.push(criarGrupo(consulta.chave, consulta.titulo, resultado.rows));
  }

  return grupos;
}

async function buscarPropriedadeAutorizada(
  executor,
  propriedadeId,
  { usuarioId, perfil, bloquear = false },
) {
  const sufixoBloqueio = bloquear ? " FOR UPDATE OF p" : "";
  const resultado = await executor.query(
    `SELECT p.id, p.nome, p.cidade, p.estado, p.area, p.usuario_id
       FROM propriedades p
      WHERE p.id = $1
        AND ($2 = 'admin' OR p.usuario_id = $3)${sufixoBloqueio}`,
    [propriedadeId, perfil, usuarioId],
  );

  if (resultado.rows.length === 0) {
    throw criarErroHttp("Propriedade não encontrada", 404);
  }

  return resultado.rows[0];
}

async function obterImpactoExclusaoPropriedade(
  executor,
  propriedadeId,
  acesso,
  opcoes = {},
) {
  const id = normalizarId(propriedadeId, "Propriedade");
  const propriedade = await buscarPropriedadeAutorizada(executor, id, {
    ...acesso,
    bloquear: Boolean(opcoes.bloquear),
  });
  const grupos = await consultarRegistrosDaPropriedade(executor, id);

  return montarImpacto(
    "propriedade",
    propriedade,
    grupos,
  );
}

async function executarExclusaoPropriedade(executor, propriedadeId) {
  const parametros = [propriedadeId];
  const exclusoes = {};
  const operacoes = [
    [
      "vacinacoes",
      `DELETE FROM vacinacoes
        WHERE animal_id IN (
          SELECT id FROM animais WHERE propriedade_id = $1
        )`,
    ],
    [
      "desmamas",
      `DELETE FROM desmamas
        WHERE animal_id IN (
          SELECT id FROM animais WHERE propriedade_id = $1
        )`,
    ],
    [
      "pesagens",
      `DELETE FROM pesagens
        WHERE animal_id IN (
          SELECT id FROM animais WHERE propriedade_id = $1
        )`,
    ],
    [
      "producoes_leiteiras",
      `DELETE FROM producoes_leiteiras
        WHERE animal_id IN (
          SELECT id FROM animais WHERE propriedade_id = $1
        )`,
    ],
    [
      "animais_lotes",
      `DELETE FROM animais_lotes al
        WHERE al.animal_id IN (
                SELECT id FROM animais WHERE propriedade_id = $1
              )
           OR al.lote_id IN (
                SELECT id FROM lotes WHERE propriedade_id = $1
              )`,
    ],
    ["despesas", "DELETE FROM despesas WHERE propriedade_id = $1"],
    ["receitas", "DELETE FROM receitas WHERE propriedade_id = $1"],
    ["animais", "DELETE FROM animais WHERE propriedade_id = $1"],
    ["lotes", "DELETE FROM lotes WHERE propriedade_id = $1"],
    ["propriedades", "DELETE FROM propriedades WHERE id = $1"],
  ];

  for (const [chave, sql] of operacoes) {
    const resultado = await executor.query(sql, parametros);
    exclusoes[chave] = resultado.rowCount;
  }

  return exclusoes;
}

async function excluirPropriedadeComDados(propriedadeId, acesso) {
  const id = normalizarId(propriedadeId, "Propriedade");
  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");
    const impacto = await obterImpactoExclusaoPropriedade(
      cliente,
      id,
      acesso,
      { bloquear: true },
    );
    const exclusoes = await executarExclusaoPropriedade(cliente, id);
    await cliente.query("COMMIT");

    return { propriedade: impacto.entidade, impacto, exclusoes };
  } catch (erro) {
    await cliente.query("ROLLBACK");
    throw erro;
  } finally {
    cliente.release();
  }
}

function agregarGrupos(gruposPorPropriedade) {
  const agregados = new Map();

  for (const grupos of gruposPorPropriedade) {
    for (const grupo of grupos) {
      if (!agregados.has(grupo.chave)) {
        agregados.set(grupo.chave, {
          chave: grupo.chave,
          titulo: grupo.titulo,
          registros: [],
        });
      }

      agregados.get(grupo.chave).registros.push(...grupo.registros);
    }
  }

  return Array.from(agregados.values()).map((grupo) =>
    criarGrupo(grupo.chave, grupo.titulo, grupo.registros),
  );
}

function adicionarSemDuplicar(grupo, registros) {
  const ids = new Set(grupo.registros.map((registro) => String(registro.id)));

  for (const registro of registros) {
    if (!ids.has(String(registro.id))) {
      grupo.registros.push(registro);
      ids.add(String(registro.id));
    }
  }

  grupo.total = grupo.registros.length;
}

async function obterImpactoExclusaoUsuario(
  executor,
  usuarioId,
  opcoes = {},
) {
  const id = normalizarId(usuarioId, "Usuário");
  const sufixoBloqueio = opcoes.bloquear ? " FOR UPDATE" : "";
  const usuarioResultado = await executor.query(
    `SELECT id, nome, email, perfil
       FROM usuarios
      WHERE id = $1${sufixoBloqueio}`,
    [id],
  );

  if (usuarioResultado.rows.length === 0) {
    throw criarErroHttp("Usuário não encontrado", 404);
  }

  const usuario = usuarioResultado.rows[0];

  if (usuario.perfil === "admin") {
    throw criarErroHttp(
      "A conta do administrador principal não pode ser excluída",
      403,
    );
  }

  const propriedadesResultado = await executor.query(
    `SELECT id, nome
       FROM propriedades
      WHERE usuario_id = $1
      ORDER BY id${opcoes.bloquear ? " FOR UPDATE" : ""}`,
    [id],
  );
  const impactosPropriedades = [];

  for (const propriedade of propriedadesResultado.rows) {
    const grupos = await consultarRegistrosDaPropriedade(
      executor,
      propriedade.id,
    );
    const resumo = Object.fromEntries(
      grupos.map((grupo) => [grupo.chave, grupo.total]),
    );
    impactosPropriedades.push({
      propriedade,
      grupos,
      resumo,
    });
  }

  const grupos = agregarGrupos(
    impactosPropriedades.map((impacto) => impacto.grupos),
  );
  const propriedades = impactosPropriedades.map((impacto) => ({
    id: impacto.propriedade.id,
    nome: impacto.propriedade.nome,
    resumo: impacto.resumo,
  }));
  grupos.unshift(criarGrupo("propriedades", "Propriedades", propriedades));

  const vacinasResultado = await executor.query(
    `SELECT id, nome, fabricante
       FROM vacinas
      WHERE usuario_id = $1
      ORDER BY nome, id`,
    [id],
  );
  grupos.push(criarGrupo("vacinas", "Vacinas cadastradas", vacinasResultado.rows));

  const vacinacoesPorVacina = await executor.query(
    `SELECT vc.id,
            vc.animal_id,
            a.nome AS animal_nome,
            v.nome AS vacina_nome,
            vc.data_aplicacao
       FROM vacinacoes vc
       JOIN animais a ON a.id = vc.animal_id
       JOIN vacinas v ON v.id = vc.vacina_id
      WHERE v.usuario_id = $1
      ORDER BY vc.data_aplicacao DESC, vc.id DESC`,
    [id],
  );
  let grupoVacinacoes = grupos.find((grupo) => grupo.chave === "vacinacoes");

  if (!grupoVacinacoes) {
    grupoVacinacoes = criarGrupo("vacinacoes", "Vacinações", []);
    grupos.push(grupoVacinacoes);
  }
  adicionarSemDuplicar(grupoVacinacoes, vacinacoesPorVacina.rows);

  const sessoesResultado = await executor.query(
    `SELECT id
       FROM sessoes_refresh
      WHERE usuario_id = $1
      ORDER BY id`,
    [id],
  );
  grupos.push(
    criarGrupo(
      "sessoes_refresh",
      "Sessões de acesso",
      sessoesResultado.rows.map((_, indice) => ({
        id: indice + 1,
      })),
    ),
  );

  const sessoesUsadasResultado = await executor.query(
    `SELECT su.sessao_id
       FROM sessoes_refresh_usados su
       JOIN sessoes_refresh sr ON sr.id = su.sessao_id
      WHERE sr.usuario_id = $1
      ORDER BY su.used_at DESC`,
    [id],
  );
  grupos.push(
    criarGrupo(
      "sessoes_refresh_usados",
      "Histórico técnico das sessões",
      sessoesUsadasResultado.rows.map((registro, indice) => ({
        id: indice + 1,
      })),
    ),
  );

  return montarImpacto(
    "usuario",
    {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil,
    },
    grupos,
  );
}

async function executarExclusaoUsuario(executor, usuarioId) {
  const parametros = [usuarioId];
  const exclusoes = {};
  const operacoes = [
    [
      "vacinacoes",
      `DELETE FROM vacinacoes
        WHERE animal_id IN (
                SELECT a.id
                  FROM animais a
                  JOIN propriedades p ON p.id = a.propriedade_id
                 WHERE p.usuario_id = $1
              )
           OR vacina_id IN (
                SELECT id FROM vacinas WHERE usuario_id = $1
              )`,
    ],
    [
      "desmamas",
      `DELETE FROM desmamas
        WHERE animal_id IN (
          SELECT a.id
            FROM animais a
            JOIN propriedades p ON p.id = a.propriedade_id
           WHERE p.usuario_id = $1
        )`,
    ],
    [
      "pesagens",
      `DELETE FROM pesagens
        WHERE animal_id IN (
          SELECT a.id
            FROM animais a
            JOIN propriedades p ON p.id = a.propriedade_id
           WHERE p.usuario_id = $1
        )`,
    ],
    [
      "producoes_leiteiras",
      `DELETE FROM producoes_leiteiras
        WHERE animal_id IN (
          SELECT a.id
            FROM animais a
            JOIN propriedades p ON p.id = a.propriedade_id
           WHERE p.usuario_id = $1
        )`,
    ],
    [
      "animais_lotes",
      `DELETE FROM animais_lotes al
        WHERE al.animal_id IN (
                SELECT a.id
                  FROM animais a
                  JOIN propriedades p ON p.id = a.propriedade_id
                 WHERE p.usuario_id = $1
              )
           OR al.lote_id IN (
                SELECT l.id
                  FROM lotes l
                  JOIN propriedades p ON p.id = l.propriedade_id
                 WHERE p.usuario_id = $1
              )`,
    ],
    [
      "despesas",
      `DELETE FROM despesas
        WHERE propriedade_id IN (
          SELECT id FROM propriedades WHERE usuario_id = $1
        )`,
    ],
    [
      "receitas",
      `DELETE FROM receitas
        WHERE propriedade_id IN (
          SELECT id FROM propriedades WHERE usuario_id = $1
        )`,
    ],
    [
      "animais",
      `DELETE FROM animais
        WHERE propriedade_id IN (
          SELECT id FROM propriedades WHERE usuario_id = $1
        )`,
    ],
    [
      "lotes",
      `DELETE FROM lotes
        WHERE propriedade_id IN (
          SELECT id FROM propriedades WHERE usuario_id = $1
        )`,
    ],
    ["vacinas", "DELETE FROM vacinas WHERE usuario_id = $1"],
    ["propriedades", "DELETE FROM propriedades WHERE usuario_id = $1"],
    ["sessoes_refresh", "DELETE FROM sessoes_refresh WHERE usuario_id = $1"],
    ["usuarios", "DELETE FROM usuarios WHERE id = $1"],
  ];

  for (const [chave, sql] of operacoes) {
    const resultado = await executor.query(sql, parametros);
    exclusoes[chave] = resultado.rowCount;
  }

  return exclusoes;
}

async function excluirUsuarioComDados(usuarioId) {
  const id = normalizarId(usuarioId, "Usuário");
  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");
    const impacto = await obterImpactoExclusaoUsuario(cliente, id, {
      bloquear: true,
    });
    const exclusoes = await executarExclusaoUsuario(cliente, id);
    await cliente.query("COMMIT");

    return { usuario: impacto.entidade, impacto, exclusoes };
  } catch (erro) {
    await cliente.query("ROLLBACK");
    throw erro;
  } finally {
    cliente.release();
  }
}

module.exports = {
  excluirPropriedadeComDados,
  excluirUsuarioComDados,
  obterImpactoExclusaoPropriedade,
  obterImpactoExclusaoUsuario,
};
