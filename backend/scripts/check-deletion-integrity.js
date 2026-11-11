require("dotenv").config();

const pool = require("../database/pool");
const {
  obterImpactoExclusaoPropriedade,
  obterImpactoExclusaoUsuario,
} = require("../services/impactoExclusao");

const VERIFICACOES_ORFAOS = [
  ["propriedades.usuario_id", "SELECT COUNT(*)::integer AS total FROM propriedades p LEFT JOIN usuarios u ON u.id = p.usuario_id WHERE u.id IS NULL"],
  ["animais.propriedade_id", "SELECT COUNT(*)::integer AS total FROM animais a LEFT JOIN propriedades p ON p.id = a.propriedade_id WHERE p.id IS NULL"],
  ["lotes.propriedade_id", "SELECT COUNT(*)::integer AS total FROM lotes l LEFT JOIN propriedades p ON p.id = l.propriedade_id WHERE p.id IS NULL"],
  ["despesas.propriedade_id", "SELECT COUNT(*)::integer AS total FROM despesas d LEFT JOIN propriedades p ON p.id = d.propriedade_id WHERE p.id IS NULL"],
  ["receitas.propriedade_id", "SELECT COUNT(*)::integer AS total FROM receitas r LEFT JOIN propriedades p ON p.id = r.propriedade_id WHERE p.id IS NULL"],
  ["vacinacoes.animal_id", "SELECT COUNT(*)::integer AS total FROM vacinacoes v LEFT JOIN animais a ON a.id = v.animal_id WHERE a.id IS NULL"],
  ["vacinacoes.vacina_id", "SELECT COUNT(*)::integer AS total FROM vacinacoes vc LEFT JOIN vacinas v ON v.id = vc.vacina_id WHERE v.id IS NULL"],
  ["pesagens.animal_id", "SELECT COUNT(*)::integer AS total FROM pesagens pe LEFT JOIN animais a ON a.id = pe.animal_id WHERE a.id IS NULL"],
  ["desmamas.animal_id", "SELECT COUNT(*)::integer AS total FROM desmamas de LEFT JOIN animais a ON a.id = de.animal_id WHERE a.id IS NULL"],
  ["producoes_leiteiras.animal_id", "SELECT COUNT(*)::integer AS total FROM producoes_leiteiras pl LEFT JOIN animais a ON a.id = pl.animal_id WHERE a.id IS NULL"],
  ["animais_lotes.animal_id", "SELECT COUNT(*)::integer AS total FROM animais_lotes al LEFT JOIN animais a ON a.id = al.animal_id WHERE a.id IS NULL"],
  ["animais_lotes.lote_id", "SELECT COUNT(*)::integer AS total FROM animais_lotes al LEFT JOIN lotes l ON l.id = al.lote_id WHERE l.id IS NULL"],
];

async function executar() {
  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN READ ONLY");
    const { rows: [{ limitado }] } = await cliente.query(
      "SELECT row_security_active('public.propriedades') AS limitado",
    );
    if (limitado) throw new Error("A checagem global exige credencial administrativa de leitura");

    const propriedade = await cliente.query(
      "SELECT id, usuario_id FROM propriedades ORDER BY id LIMIT 1",
    );
    if (propriedade.rows[0]) {
      const impacto = await obterImpactoExclusaoPropriedade(
        cliente,
        propriedade.rows[0].id,
        {
          usuarioId: propriedade.rows[0].usuario_id,
          perfil: "usuario",
        },
      );
      console.log(
        `OK preview de propriedade consultado (${impacto.total_registros} registros relacionados)`,
      );
    } else {
      console.log("INFO nenhuma propriedade disponível para validar o preview");
    }

    const usuario = await cliente.query(
      "SELECT id FROM usuarios WHERE perfil = 'usuario' ORDER BY id LIMIT 1",
    );
    if (usuario.rows[0]) {
      const impacto = await obterImpactoExclusaoUsuario(
        cliente,
        usuario.rows[0].id,
        { contarSessoes: (banco, id) => banco.query(
          `SELECT (SELECT count(*)::int FROM sessoes_refresh WHERE usuario_id=$1) AS sessoes,
                  (SELECT count(*)::int FROM sessoes_refresh_usados h
                    JOIN sessoes_refresh s ON s.id=h.sessao_id WHERE s.usuario_id=$1) AS usados`,
          [id],
        ) },
      );
      console.log(
        `OK preview de usuário consultado (${impacto.total_registros} registros relacionados)`,
      );
    } else {
      console.log("INFO nenhum usuário comum disponível para validar o preview");
    }

    for (const [relacao, sql] of VERIFICACOES_ORFAOS) {
      const resultado = await cliente.query(sql);
      if (resultado.rows[0].total !== 0) {
        throw new Error(`${relacao}: ${resultado.rows[0].total} registro(s) órfão(s)`);
      }
    }

    console.log("OK nenhuma relação órfã encontrada nas dependências verificadas");
    await cliente.query("ROLLBACK");
  } catch (erro) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw erro;
  } finally {
    cliente.release();
  }
}

executar()
  .catch((erro) => {
    console.error(`FALHA: ${erro.code || erro.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
