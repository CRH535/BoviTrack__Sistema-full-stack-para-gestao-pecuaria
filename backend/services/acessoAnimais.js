async function buscarAnimalPermitido(animalId, usuario, cliente, bloquear = false) {
  const resultado = await cliente.query(
    `SELECT a.id, a.nome, a.numero_brinco, a.data_nascimento, a.peso,
            a.propriedade_id, a.mae_id, p.usuario_id
       FROM animais a
       JOIN propriedades p ON p.id = a.propriedade_id
      WHERE a.id = $1
        AND ($2 = 'admin' OR p.usuario_id = $3)
      ${bloquear ? "FOR UPDATE OF a" : ""}`,
    [animalId, usuario.perfil, usuario.id],
  );

  return resultado.rows[0] || null;
}

async function buscarLoteCompativel(loteId, propriedadeId, usuario, cliente) {
  if (!loteId) return null;
  const resultado = await cliente.query(
    `SELECT l.id, l.nome
       FROM lotes l
       JOIN propriedades p ON p.id = l.propriedade_id
      WHERE l.id = $1
        AND l.propriedade_id = $2
        AND ($3 = 'admin' OR p.usuario_id = $4)`,
    [loteId, propriedadeId, usuario.perfil, usuario.id],
  );
  return resultado.rows[0] || null;
}

async function buscarMaeCompativel(maeId, animal, usuario, cliente) {
  if (!maeId) return null;
  const resultado = await cliente.query(
    `SELECT m.id, m.nome, m.numero_brinco
       FROM animais m
       JOIN propriedades p ON p.id = m.propriedade_id
      WHERE m.id = $1
        AND m.id <> $2
        AND m.sexo = 'F'
        AND m.propriedade_id = $3
        AND ($4 = 'admin' OR p.usuario_id = $5)`,
    [maeId, animal.id, animal.propriedade_id, usuario.perfil, usuario.id],
  );
  return resultado.rows[0] || null;
}

module.exports = {
  buscarAnimalPermitido,
  buscarLoteCompativel,
  buscarMaeCompativel,
};
