function converterId(valor) {
  if (typeof valor !== "number" && (typeof valor !== "string" || !/^\d+$/.test(valor.trim()))) return null;
  const id = Number(valor);
  return Number.isSafeInteger(id) && id > 0 && id <= 2147483647 ? id : null;
}

function idOpcionalInformado(valor) {
  return valor !== undefined && valor !== null && valor !== "";
}

const ESTADOS_BR = new Set(["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"]);

function normalizarEstado(valor) {
  const uf = typeof valor === "string" ? valor.trim().toUpperCase() : "";
  return ESTADOS_BR.has(uf) ? { valor: uf } : { erro: "Estado deve ser uma UF brasileira válida" };
}

function validarCamposPermitidos(dados, camposPermitidos) {
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
    return { erro: "Corpo da requisição inválido" };
  }
  const permitidos = new Set(camposPermitidos);
  const desconhecidos = Object.keys(dados).filter((campo) => !permitidos.has(campo));
  return desconhecidos.length
    ? { erro: `Campos não permitidos: ${desconhecidos.join(", ")}` }
    : { valor: dados };
}

function normalizarTextoObrigatorio(valor, campo, limite, minimo = 1) {
  if (typeof valor !== "string") return { erro: `${campo} é obrigatório` };
  const texto = valor.trim();
  if (texto.length < minimo) return { erro: `${campo} deve possuir pelo menos ${minimo} caracteres` };
  if (texto.length > limite) return { erro: `${campo} deve possuir no máximo ${limite} caracteres` };
  return { valor: texto };
}

function normalizarNumeroFinito(valor, campo, { minimo, maximo } = {}) {
  if (typeof valor !== "number" && (typeof valor !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(valor.trim()))) {
    return { erro: `${campo} deve ser um número válido` };
  }
  const numero = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(numero)) return { erro: `${campo} deve ser um número válido` };
  if (minimo !== undefined && numero < minimo) return { erro: `${campo} está abaixo do limite permitido` };
  if (maximo !== undefined && numero > maximo) return { erro: `${campo} está acima do limite permitido` };
  return { valor: numero };
}

function normalizarPaginacao(query = {}) {
  const pagina = query.page === undefined ? 1 : converterId(query.page);
  const limite = query.limit === undefined ? 50 : converterId(query.limit);
  if (!pagina) return { erro: "Página inválida" };
  if (!limite || limite > 100) {
    return { erro: "Limite deve ser um inteiro entre 1 e 100" };
  }
  return { valor: { pagina, limite, offset: (pagina - 1) * limite } };
}

function responderPagina(res, linhas, paginacao) {
  const possuiMais = linhas.length > paginacao.limite;
  res.setHeader("X-Page", String(paginacao.pagina));
  res.setHeader("X-Limit", String(paginacao.limite));
  res.setHeader("X-Has-More", String(possuiMais));
  return linhas.slice(0, paginacao.limite);
}

function normalizarFormaPagamento(valor) {
  if (valor === undefined || valor === null) {
    return { valor: null };
  }

  if (typeof valor !== "string") {
    return { erro: "Forma de pagamento invalida" };
  }

  const formaPagamento = valor.trim();

  if (formaPagamento.length > 100) {
    return {
      erro: "A forma de pagamento deve possuir no maximo 100 caracteres",
    };
  }

  return { valor: formaPagamento || null };
}

function normalizarNumeroBrinco(valor) {
  if (valor === undefined || valor === null || valor === "") {
    return { valor: null };
  }

  if (typeof valor !== "string") {
    return { erro: "Numero do brinco invalido" };
  }

  const numeroBrinco = valor.trim();

  if (numeroBrinco.length > 50) {
    return { erro: "O numero do brinco deve possuir no maximo 50 caracteres" };
  }

  return { valor: numeroBrinco || null };
}

function normalizarDataNascimento(valor) {
  if (valor === undefined || valor === null || valor === "") {
    return { valor: null };
  }

  if (typeof valor !== "string") {
    return { erro: "Data de nascimento invalida" };
  }

  const dataNascimento = valor.trim();
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataNascimento);

  if (!partes) {
    return { erro: "Data de nascimento invalida" };
  }

  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  const dataUtc = new Date(Date.UTC(ano, mes - 1, dia));
  const dataExiste =
    dataUtc.getUTCFullYear() === ano &&
    dataUtc.getUTCMonth() === mes - 1 &&
    dataUtc.getUTCDate() === dia;

  if (!dataExiste || dataNascimento > dataHojeNoFuso()) {
    return { erro: "Data de nascimento invalida" };
  }

  return { valor: dataNascimento };
}

function dataHojeNoFuso(data = new Date()) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.APP_TIMEZONE || "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(data);
  const campos = Object.fromEntries(partes.map(({ type, value }) => [type, value]));
  return `${campos.year}-${campos.month}-${campos.day}`;
}

const TURNOS_ORDENHA = new Set([
  "manha",
  "tarde",
  "noite",
  "ordenha_unica",
]);

const TIPOS_PESAGEM = new Set([
  "NASCIMENTO",
  "ROTINA",
  "PRE_DESMAMA",
  "DESMAMA",
  "POS_DESMAMA",
  "SOBREANO",
  "OUTRA",
]);
const METODOS_PESAGEM = new Set(["BALANCA", "FITA", "ESTIMATIVA", "OUTRO"]);
const TIPOS_DESMAMA = new Set([
  "CONVENCIONAL",
  "LADO_A_LADO",
  "ABRUPTA",
  "PRECOCE",
  "TEMPORARIA",
  "CONTROLADA",
  "OUTRA",
]);
const STATUS_DESMAMA = new Set([
  "PLANEJADA",
  "EM_ANDAMENTO",
  "CONCLUIDA",
  "CANCELADA",
]);

function normalizarDataCalendario(valor, campo = "Data") {
  if (typeof valor !== "string") {
    return { erro: `${campo} inválida` };
  }

  const data = valor.trim();
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);

  if (!partes) {
    return { erro: `${campo} inválida` };
  }

  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  const dataUtc = new Date(Date.UTC(ano, mes - 1, dia));
  const dataExiste =
    dataUtc.getUTCFullYear() === ano &&
    dataUtc.getUTCMonth() === mes - 1 &&
    dataUtc.getUTCDate() === dia;

  return dataExiste ? { valor: data } : { erro: `${campo} inválida` };
}

function normalizarProducaoLeiteira(dados) {
  const campos = validarCamposPermitidos(dados, ["data", "turno", "quantidade_litros", "observacao"]);
  if (campos.erro) return campos;
  const data = normalizarDataCalendario(dados.data, "Data da ordenha");
  const turno = typeof dados.turno === "string" ? dados.turno.trim() : "";
  const quantidadeValidada = normalizarNumeroFinito(dados.quantidade_litros, "Quantidade de leite", { minimo: 0.01, maximo: 99999999.99 });
  if (quantidadeValidada.erro) return quantidadeValidada;
  const quantidade = quantidadeValidada.valor;

  if (data.erro) return data;

  if (!TURNOS_ORDENHA.has(turno)) {
    return { erro: "Turno inválido" };
  }

  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    return { erro: "A quantidade de leite deve ser um número maior que zero" };
  }

  if (quantidade > 99999999.99) {
    return { erro: "Quantidade de leite acima do limite permitido" };
  }

  if (
    dados.observacao !== undefined &&
    dados.observacao !== null &&
    typeof dados.observacao !== "string"
  ) {
    return { erro: "Observação inválida" };
  }

  const observacao = dados.observacao?.trim() || null;

  if (observacao && observacao.length > 500) {
    return { erro: "A observação deve possuir no máximo 500 caracteres" };
  }

  return {
    valor: {
      data: data.valor,
      turno,
      quantidadeLitros: quantidade,
      observacao,
    },
  };
}

function normalizarTextoOpcional(valor, campo, limite) {
  if (valor === undefined || valor === null || valor === "") return { valor: null };
  if (typeof valor !== "string") return { erro: `${campo} invÃ¡lida` };
  const texto = valor.trim();
  if (texto.length > limite) {
    return { erro: `${campo} deve possuir no mÃ¡ximo ${limite} caracteres` };
  }
  return { valor: texto || null };
}

function normalizarPesagem(dados) {
  const campos = validarCamposPermitidos(dados, ["data_pesagem", "peso_kg", "tipo_pesagem", "metodo", "lote_id", "observacao"]);
  if (campos.erro) return campos;
  const data = normalizarDataCalendario(dados.data_pesagem, "Data da pesagem");
  const pesoValidado = normalizarNumeroFinito(dados.peso_kg, "Peso", { minimo: 0.01, maximo: 99999999.99 });
  if (pesoValidado.erro) return pesoValidado;
  const peso = pesoValidado.valor;
  const tipo = typeof dados.tipo_pesagem === "string"
    ? dados.tipo_pesagem.trim().toUpperCase()
    : "";
  if (dados.metodo !== undefined && dados.metodo !== null && typeof dados.metodo !== "string") return { erro: "Metodo invalido" };
  const metodo = dados.metodo?.trim().toUpperCase() || null;
  const loteId = dados.lote_id === undefined || dados.lote_id === null || dados.lote_id === ""
    ? null
    : converterId(dados.lote_id);
  const observacao = normalizarTextoOpcional(dados.observacao, "ObservaÃ§Ã£o", 500);

  if (data.erro) return data;
  if (!Number.isFinite(peso) || peso <= 0 || peso > 99999999.99) {
    return { erro: "O peso deve ser um nÃºmero maior que zero e dentro do limite permitido" };
  }
  if (!TIPOS_PESAGEM.has(tipo)) return { erro: "Tipo de pesagem invÃ¡lido" };
  if (metodo && !METODOS_PESAGEM.has(metodo)) return { erro: "MÃ©todo de pesagem invÃ¡lido" };
  if (idOpcionalInformado(dados.lote_id) && !loteId) return { erro: "Lote invÃ¡lido" };
  if (observacao.erro) return observacao;

  return {
    valor: {
      dataPesagem: data.valor,
      pesoKg: peso,
      tipoPesagem: tipo,
      metodo,
      loteId,
      observacao: observacao.valor,
    },
  };
}

function normalizarDesmama(dados, { permitirConclusao = false } = {}) {
  const campos = validarCamposPermitidos(dados, ["data_planejada", "data_inicio", "data_fim", "data_desmama", "tipo_desmama", "status", "mae_id", "lote_destino_id", "suplementacao", "observacao"]);
  if (campos.erro) return campos;
  const dataPlanejada = normalizarDataCalendario(dados.data_planejada, "Data planejada");
  const tipo = typeof dados.tipo_desmama === "string"
    ? dados.tipo_desmama.trim().toUpperCase()
    : "";
  if (dados.status !== undefined && typeof dados.status !== "string") return { erro: "Status invalido" };
  const status = typeof dados.status === "string"
    ? dados.status.trim().toUpperCase()
    : "PLANEJADA";
  const maeId = dados.mae_id === undefined || dados.mae_id === null || dados.mae_id === ""
    ? null
    : converterId(dados.mae_id);
  const loteId = dados.lote_destino_id === undefined || dados.lote_destino_id === null || dados.lote_destino_id === ""
    ? null
    : converterId(dados.lote_destino_id);
  const suplementacao = normalizarTextoOpcional(dados.suplementacao, "SuplementaÃ§Ã£o", 500);
  const observacao = normalizarTextoOpcional(dados.observacao, "ObservaÃ§Ã£o", 1000);

  if (dataPlanejada.erro) return dataPlanejada;
  if (!TIPOS_DESMAMA.has(tipo)) return { erro: "Tipo de desmama invÃ¡lido" };
  if (!STATUS_DESMAMA.has(status)) return { erro: "Status da desmama invÃ¡lido" };
  if (!permitirConclusao && ["CONCLUIDA", "CANCELADA"].includes(status)) {
    return { erro: "Use a aÃ§Ã£o especÃ­fica para concluir ou cancelar a desmama" };
  }
  if (idOpcionalInformado(dados.mae_id) && !maeId) return { erro: "MÃ£e invÃ¡lida" };
  if (idOpcionalInformado(dados.lote_destino_id) && !loteId) return { erro: "Lote de destino invÃ¡lido" };
  if (suplementacao.erro || observacao.erro) return suplementacao.erro ? suplementacao : observacao;

  const datas = {};
  for (const [chave, rotulo] of [
    ["data_inicio", "Data de inÃ­cio"],
    ["data_fim", "Data de fim"],
    ["data_desmama", "Data da desmama"],
  ]) {
    if (dados[chave] === undefined || dados[chave] === null || dados[chave] === "") {
      datas[chave] = null;
      continue;
    }
    const resultado = normalizarDataCalendario(dados[chave], rotulo);
    if (resultado.erro) return resultado;
    datas[chave] = resultado.valor;
  }

  if (datas.data_fim && (!datas.data_inicio || datas.data_fim < datas.data_inicio)) {
    return { erro: "A data de fim nÃ£o pode ser anterior Ã  data de inÃ­cio" };
  }

  return {
    valor: {
      dataPlanejada: dataPlanejada.valor,
      dataInicio: datas.data_inicio,
      dataFim: datas.data_fim,
      dataDesmama: datas.data_desmama,
      tipoDesmama: tipo,
      status,
      maeId,
      loteDestinoId: loteId,
      suplementacao: suplementacao.valor,
      observacao: observacao.valor,
    },
  };
}

module.exports = {
  converterId,
  idOpcionalInformado,
  normalizarEstado,
  dataHojeNoFuso,
  validarCamposPermitidos,
  normalizarTextoObrigatorio,
  normalizarTextoOpcional,
  normalizarNumeroFinito,
  normalizarPaginacao,
  responderPagina,
  normalizarDataCalendario,
  normalizarDataNascimento,
  normalizarFormaPagamento,
  normalizarNumeroBrinco,
  normalizarDesmama,
  normalizarPesagem,
  normalizarProducaoLeiteira,
};
