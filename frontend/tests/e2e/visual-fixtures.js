// Somente o banco descartável protegido pelo playwright.config.js.
export async function prepararReferenciaVisual(db) {
  const existente = await db.query(
    "SELECT id FROM propriedades WHERE nome = 'Fazenda Horizonte UI'",
  );
  if (existente.rowCount) {
    const animal = await db.query(
      "SELECT id FROM animais WHERE numero_brinco = 'UI-001'",
    );
    return animal.rows[0].id;
  }
  await db.query("BEGIN");
  try {
    const prop = await db.query(
      "INSERT INTO propriedades(nome,cidade,estado,area,usuario_id) SELECT 'Fazenda Horizonte UI','Uberaba','MG',240,id FROM usuarios WHERE email='admin@example.test' RETURNING id",
    );
    const id = prop.rows[0].id;
    const lote = await db.query(
      "INSERT INTO lotes(nome,descricao,propriedade_id) VALUES ('Lote Matrizes UI','Manejo de matrizes',$1) RETURNING id",
      [id],
    );
    const nomes = [
      "Aurora",
      "Estrela",
      "Mel",
      "Serena",
      "Lua",
      "Brisa",
      "Flor",
      "Sol",
      "Mimosa",
      "Gaúcha",
      "Nina",
      "Pérola",
      "Apolo",
      "Thor",
      "Bento",
      "Trovão",
      "Relâmpago",
    ];
    let referencia;
    for (const [index, nome] of nomes.entries()) {
      const a = await db.query(
        "INSERT INTO animais(nome,especie,raca,sexo,peso,propriedade_id,numero_brinco,data_nascimento) VALUES ($1,'Bovino','Girolando',$2,$3,$4,$5,'2024-02-10') RETURNING id",
        [
          nome,
          index < 12 ? "F" : "M",
          420 + index * 8,
          id,
          `UI-${String(index + 1).padStart(3, "0")}`,
        ],
      );
      if (!index) referencia = a.rows[0].id;
      if (index < 12)
        await db.query(
          "INSERT INTO animais_lotes(animal_id,lote_id) VALUES ($1,$2)",
          [a.rows[0].id, lote.rows[0].id],
        );
    }
    for (let mes = 5; mes >= 0; mes--) {
      await db.query(
        "INSERT INTO pesagens(animal_id,data_pesagem,peso_kg,tipo_pesagem) VALUES ($1,((CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - ($2::int * INTERVAL '1 month'))::date,$3,'ROTINA')",
        [referencia, mes, 420 + (5 - mes) * 12],
      );
      await db.query(
        "INSERT INTO receitas(descricao,categoria,valor,data,propriedade_id) VALUES ('Venda de leite UI','Venda de leite',$1,((CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - ($2::int * INTERVAL '1 month'))::date,$3)",
        [4200 + (5 - mes) * 380, mes, id],
      );
      await db.query(
        "INSERT INTO despesas(descricao,categoria,valor,data,propriedade_id) VALUES ('Ração concentrada UI','Alimentação',$1,((CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - ($2::int * INTERVAL '1 month'))::date,$3),('Manejo sanitário UI','Saúde animal',360,((CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - ($2::int * INTERVAL '1 month'))::date,$3)",
        [1800 + (5 - mes) * 120, mes, id],
      );
    }
    await db.query(
      "UPDATE animais a SET peso = (SELECT p.peso_kg FROM pesagens p WHERE p.animal_id = a.id ORDER BY p.data_pesagem DESC, p.id DESC LIMIT 1) WHERE a.id = $1",
      [referencia],
    );
    for (let dia = 27; dia >= 0; dia -= 3)
      await db.query(
        "INSERT INTO producoes_leiteiras(animal_id,data,turno,quantidade_litros) VALUES ($1,(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - $2::int,'manha',$3)",
        [referencia, dia, 14 + (27 - dia) * 0.18],
      );
    const vacina = await db.query(
      "INSERT INTO vacinas(nome,descricao,usuario_id) SELECT 'Aftosa UI','Vacina do cenário isolado',id FROM usuarios WHERE email='admin@example.test' RETURNING id",
    );
    await db.query(
      "INSERT INTO vacinacoes(animal_id,vacina_id,data_aplicacao,proxima_dose) VALUES ($1,$2,(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - 85,(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date + 5)",
      [referencia, vacina.rows[0].id],
    );
    await db.query("COMMIT");
    return referencia;
  } catch (erro) {
    await db.query("ROLLBACK");
    throw erro;
  }
}
