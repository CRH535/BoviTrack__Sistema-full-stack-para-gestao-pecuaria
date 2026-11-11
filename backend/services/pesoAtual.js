async function bloquearAnimalParaPeso(cliente, animalId) {
  const resultado = await cliente.query(
    "SELECT id FROM animais WHERE id = $1 FOR UPDATE",
    [animalId],
  );
  return Boolean(resultado.rows[0]);
}

async function sincronizarPesoAtual(cliente, animalId) {
  if (!(await bloquearAnimalParaPeso(cliente, animalId))) throw new Error("Animal indisponivel para sincronizar peso");
  const atualizado = await cliente.query(
    `UPDATE animais
        SET peso = (
          SELECT p.peso_kg
            FROM pesagens p
           WHERE p.animal_id = animais.id
           ORDER BY p.data_pesagem DESC, p.id DESC
           LIMIT 1
        )
      WHERE id = $1`,
    [animalId],
  );
  if (atualizado.rowCount !== 1) throw new Error("Peso do animal nao atualizado");
}

module.exports = { bloquearAnimalParaPeso, sincronizarPesoAtual };
