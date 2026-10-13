import axios from "axios";

const API_URL = (import.meta.env?.VITE_API_URL || "http://localhost:3000").replace(/\/+$/, "");
const CHAVES_AUTH_LEGADAS = ["bovitrack_token", "bovitrack_usuario", "agrocontrol_token", "agrocontrol_usuario"];
const ROTAS_SEM_RENOVACAO = new Set(["/auth/login", "/auth/cadastro", "/auth/refresh", "/auth/logout", "/auth/logout-all"]);

// A preferência visual continua no localStorage. Somente artefatos antigos de
// autenticação são removidos durante a migração para token em memória.
for (const chave of CHAVES_AUTH_LEGADAS) {
  try { localStorage.removeItem(chave); } catch { /* Armazenamento pode estar bloqueado. */ }
}

const api = axios.create({ baseURL: API_URL, withCredentials: true, timeout: 15000 });
let tokenAcesso = null;
let renovacaoEmAndamento = null;
let logoutEmAndamento = false;
let geracaoSessao = 0;
let usuarioSessaoId = null;

export function obterGeracaoSessao() {
  return geracaoSessao;
}

export function definirTokenAcesso(token, usuarioId = null) {
  geracaoSessao += 1;
  renovacaoEmAndamento = null;
  tokenAcesso = typeof token === "string" && token ? token : null;
  usuarioSessaoId = usuarioId;
}

export function obterTokenAcesso() {
  return tokenAcesso;
}

export function limparTokenAcesso() {
  geracaoSessao += 1;
  renovacaoEmAndamento = null;
  tokenAcesso = null;
  usuarioSessaoId = null;
}

export function definirLogoutEmAndamento(valor) {
  logoutEmAndamento = Boolean(valor);
}

function notificarSessaoEncerrada() {
  limparTokenAcesso();
  window.dispatchEvent(new CustomEvent("bovitrack:sessao-encerrada"));
}

function aguardar(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function executarRenovacao(geracao, tentativaConcorrente = false) {
  try {
    const resposta = await api.post("/auth/refresh", null, { ignorarRenovacao: true });
    if (geracao !== geracaoSessao || logoutEmAndamento) {
      throw new axios.CanceledError("A sessão foi encerrada ou substituída");
    }
    const usuarioRenovadoId = resposta.data.usuario?.id ?? null;
    if (usuarioSessaoId !== null && usuarioRenovadoId !== usuarioSessaoId) {
      notificarSessaoEncerrada();
      throw new axios.CanceledError("A conta foi alterada em outra aba");
    }
    tokenAcesso = resposta.data.token;
    usuarioSessaoId = usuarioRenovadoId;
    return resposta.data;
  } catch (erro) {
    // Outra aba pode ter rotacionado o cookie enquanto esta requisição estava
    // em trânsito. Uma única repetição usa o cookie atualizado pelo browser.
    if (geracao === geracaoSessao && !logoutEmAndamento && !tentativaConcorrente && erro.response?.status === 409 && erro.response?.data?.codigo === "REFRESH_CONCORRENTE") {
      await aguardar(150);
      if (geracao !== geracaoSessao || logoutEmAndamento) throw new axios.CanceledError();
      return executarRenovacao(geracao, true);
    }
    throw erro;
  }
}

export function renovarSessao() {
  if (logoutEmAndamento) return Promise.reject(new axios.CanceledError("Logout em andamento"));
  if (!renovacaoEmAndamento) {
    const renovacao = executarRenovacao(geracaoSessao).finally(() => {
      if (renovacaoEmAndamento === renovacao) renovacaoEmAndamento = null;
    });
    renovacaoEmAndamento = renovacao;
  }
  return renovacaoEmAndamento;
}

api.interceptors.request.use((config) => {
  config.geracaoSessao = geracaoSessao;
  if (tokenAcesso && !config.headers.Authorization) config.headers.Authorization = `Bearer ${tokenAcesso}`;
  return config;
});

api.interceptors.response.use(
  (response) => {
    if (response.config.geracaoSessao !== geracaoSessao) throw new axios.CanceledError("Resposta de sessão anterior");
    return response;
  },
  async (error) => {
    const requisicaoOriginal = error.config;
    if (requisicaoOriginal && requisicaoOriginal.geracaoSessao !== geracaoSessao) {
      return Promise.reject(new axios.CanceledError("Resposta de sessão anterior"));
    }
    const rota = String(requisicaoOriginal?.url || "").split("?")[0];
    const podeRenovar = !logoutEmAndamento && error.response?.status === 401 && requisicaoOriginal &&
      !requisicaoOriginal.ignorarRenovacao && !requisicaoOriginal.tentouRenovar && !ROTAS_SEM_RENOVACAO.has(rota);

    if (!podeRenovar) return Promise.reject(error);
    requisicaoOriginal.tentouRenovar = true;

    try {
      const { token } = await renovarSessao();
      requisicaoOriginal.headers.Authorization = `Bearer ${token}`;
      return api(requisicaoOriginal);
    } catch (erroRenovacao) {
      if ([400, 401, 403].includes(erroRenovacao.response?.status)) notificarSessaoEncerrada();
      return Promise.reject(erroRenovacao);
    }
  },
);

// Mantém as telas compatíveis com paginação server-side: cada resposta do
// backend permanece limitada e este helper reúne as páginas necessárias.
api.getAll = async function getAll(url, config = {}) {
  const geracao = geracaoSessao;
  const acumulado = [];
  let pagina = 1;
  let ultimaResposta;
  do {
    if (geracao !== geracaoSessao) throw new axios.CanceledError("A conta mudou durante a paginação");
    ultimaResposta = await api.get(url, { ...config, params: { ...config.params, page: pagina, limit: 100 } });
    if (geracao !== geracaoSessao) throw new axios.CanceledError("A conta mudou durante a paginação");
    const itens = Array.isArray(ultimaResposta.data) ? ultimaResposta.data : [];
    acumulado.push(...itens);
    pagina += 1;
  } while (ultimaResposta.headers["x-has-more"] === "true" && pagina <= 100);
  if (geracao !== geracaoSessao) throw new axios.CanceledError("A conta mudou durante a paginação");
  if (ultimaResposta.headers["x-has-more"] === "true") {
    throw new Error("Há mais de 10.000 registros. Refine os filtros para carregar a lista completa.");
  }
  return { ...ultimaResposta, data: acumulado };
};

api.getAllNested = async function getAllNested(url, campo, config = {}) {
  const geracao = geracaoSessao;
  let pagina = 1;
  let respostaCombinada;
  const itens = [];
  do {
    if (geracao !== geracaoSessao) throw new axios.CanceledError("A conta mudou durante a paginação");
    const resposta = await api.get(url, { ...config, params: { ...config.params, page: pagina, limit: 100 } });
    if (geracao !== geracaoSessao) throw new axios.CanceledError("A conta mudou durante a paginação");
    if (!respostaCombinada) respostaCombinada = { ...resposta, data: { ...resposta.data } };
    itens.push(...(Array.isArray(resposta.data?.[campo]) ? resposta.data[campo] : []));
    pagina += 1;
    if (resposta.headers["x-has-more"] !== "true") break;
    if (pagina > 100) throw new Error("Há mais de 10.000 registros. Refine os filtros para carregar o histórico completo.");
  } while (pagina <= 100);
  if (geracao !== geracaoSessao) throw new axios.CanceledError("A conta mudou durante a paginação");
  respostaCombinada.data[campo] = itens;
  return respostaCombinada;
};

export default api;
