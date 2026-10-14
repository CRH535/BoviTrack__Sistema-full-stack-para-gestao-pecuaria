function sanitizarTexto(valor) {
  return String(valor || "")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[DATABASE_URL REDACTED]")
    .replace(/([^\s@])[^\s@]*@([^\s@]+)/g, '$1***@$2')
    .slice(0, 500);
}

function registrarEvento(nivel, evento, metadados = {}) {
  const permitidos = {};
  for (const [chave, valor] of Object.entries(metadados)) {
    if (valor === undefined || valor === null) continue;
    if (/senha|token|cookie|authorization|secret|database_url|pepper|api_key|codigo_hash|codigo_verificacao/i.test(chave)) continue;
    if (chave === 'codigo' && /^\d{6}$/.test(String(valor))) continue;
    permitidos[chave] = typeof valor === "string" ? sanitizarTexto(valor) : valor;
  }

  const linha = JSON.stringify({
    timestamp: new Date().toISOString(),
    nivel,
    evento,
    ...permitidos,
  });

  if (nivel === "erro") console.error(linha);
  else if (nivel === "aviso") console.warn(linha);
  else console.info(linha);
}

function registrarErro(evento, erro, req, extras = {}) {
  registrarEvento("erro", evento, {
    request_id: req?.id,
    metodo: req?.method,
    rota: req?.originalUrl?.split("?")[0],
    usuario_id: req?.usuario?.id,
    codigo: erro?.code,
    tipo: erro?.name,
    ...extras,
  });
}

module.exports = { registrarErro, registrarEvento };
