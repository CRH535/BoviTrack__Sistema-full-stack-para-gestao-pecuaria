// Mesmos intervalos de calendário da API (APP_TIMEZONE padrão do projeto).
export function filtrarDespesas(itens, filtros, agora = new Date()) {
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
  let inicio = "";
  let fim = hoje;
  if (filtros.periodo === "hoje") inicio = hoje;
  if (filtros.periodo === "mes") inicio = hoje.slice(0, 7) + "-01";
  if (filtros.periodo === "ano") inicio = hoje.slice(0, 4) + "-01-01";
  if (filtros.periodo === "semana") {
    const segunda = new Date(`${hoje}T12:00:00Z`);
    segunda.setUTCDate(segunda.getUTCDate() - ((segunda.getUTCDay() + 6) % 7));
    inicio = segunda.toISOString().slice(0, 10);
  }
  if (filtros.periodo === "personalizado") {
    inicio = filtros.data_inicio;
    fim = filtros.data_fim;
  }
  if (filtros.periodo === "todos") fim = "";
  return itens.filter((item) => {
    const data = String(item.data).slice(0, 10);
    return (
      (!filtros.propriedade_id ||
        Number(item.propriedade_id) === Number(filtros.propriedade_id)) &&
      (!inicio || data >= inicio) &&
      (!fim || data <= fim)
    );
  });
}

export function agruparFinancas(receitas, despesas) {
  const meses = new Map();
  for (const [tipo, itens] of [
    ["receitas", receitas],
    ["despesas", despesas],
  ]) {
    for (const item of itens) {
      const mes = String(item.data).slice(0, 7);
      const atual = meses.get(mes) || { mes, receitas: 0, despesas: 0 };
      atual[tipo] += Math.round(Number(item.valor) * 100);
      meses.set(mes, atual);
    }
  }
  return [...meses.values()]
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .slice(-6)
    .map((item) => ({
      ...item,
      receitas: item.receitas / 100,
      despesas: item.despesas / 100,
      lucro: (item.receitas - item.despesas) / 100,
    }));
}
