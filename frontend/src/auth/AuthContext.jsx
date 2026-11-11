import { useEffect, useRef, useState } from "react";
import api, {
  definirLogoutEmAndamento,
  definirTokenAcesso,
  limparTokenAcesso,
  obterTokenAcesso,
  obterGeracaoSessao,
  renovarSessao,
} from "../services/api";
import AuthContext from "./auth-context";

const CANAL_AUTH = "bovitrack-auth";
const CHAVE_EVENTO_AUTH = "bovitrack_auth_event";
const CHAVE_LOGOUT_PENDENTE = "bovitrack_logout_pending";

function lerStorage(chave) {
  try { return localStorage.getItem(chave); } catch { return null; }
}

function salvarStorage(chave, valor) {
  try {
    if (valor === null) localStorage.removeItem(chave);
    else localStorage.setItem(chave, valor);
  } catch { /* O estado da sessão continua em memória. */ }
}

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [verificacaoPendente, setVerificacaoPendente] = useState(null);
  const [verificacaoEmailObrigatoria, setVerificacaoEmailObrigatoria] = useState(null);
  const canalRef = useRef(null);

  useEffect(() => {
    let ativo = true;
    const encerrarLocalmente = () => {
      limparTokenAcesso();
      if (!ativo) return;
      setUsuario(null);
      setVerificacaoPendente(null);
      setCarregando(false);
    };

    const canal = "BroadcastChannel" in window ? new BroadcastChannel(CANAL_AUTH) : null;
    canalRef.current = canal;
    if (canal) canal.onmessage = (evento) => {
      if (evento.data?.tipo === "logout") encerrarLocalmente();
    };
    const receberStorage = (evento) => {
      if (evento.key === CHAVE_EVENTO_AUTH && evento.newValue) encerrarLocalmente();
    };
    window.addEventListener("bovitrack:sessao-encerrada", encerrarLocalmente);
    window.addEventListener("storage", receberStorage);

    async function restaurarSessao() {
      const geracao = obterGeracaoSessao();
      const vigente = () => ativo && geracao === obterGeracaoSessao();
      try {
        const config = await api.get('/auth/config', { ignorarRenovacao: true });
        if (vigente()) {
          setVerificacaoEmailObrigatoria(config.data.verificacaoEmailObrigatoria);
          if (config.data.verificacaoEmailObrigatoria === false) setVerificacaoPendente(null);
        }
        if (lerStorage(CHAVE_LOGOUT_PENDENTE)) {
          await api.post("/auth/logout", null, { ignorarRenovacao: true });
          if (vigente()) {
            salvarStorage(CHAVE_LOGOUT_PENDENTE, null);
            encerrarLocalmente();
          }
          return;
        }
        await renovarSessao();
        const resposta = await api.get("/auth/me");
        if (vigente()) setUsuario(resposta.data.usuario);
      } catch (erro) {
        if (!vigente()) return;
        if (![400, 401, 403].includes(erro.response?.status)) {
          console.error("Não foi possível restaurar a sessão");
        }
        encerrarLocalmente();
      } finally {
        if (vigente()) setCarregando(false);
      }
    }

    restaurarSessao();
    return () => {
      ativo = false;
      window.removeEventListener("bovitrack:sessao-encerrada", encerrarLocalmente);
      window.removeEventListener("storage", receberStorage);
      canal?.close();
    };
  }, []);

  function avisarOutrasAbas() {
    canalRef.current?.postMessage({ tipo: "logout" });
    salvarStorage(CHAVE_EVENTO_AUTH, String(Date.now()));
    salvarStorage(CHAVE_EVENTO_AUTH, null);
  }

  async function login(email, senha) {
    limparTokenAcesso();
    definirLogoutEmAndamento(false);
    let resposta;
    try {
      resposta = await api.post("/auth/login", { email, senha });
    } catch (erro) {
      if (erro.response?.data?.codigo === 'EMAIL_NOT_VERIFIED' && erro.response.data.verificacao) {
        iniciarVerificacao(email, erro.response.data.verificacao);
      }
      throw erro;
    }
    salvarStorage(CHAVE_LOGOUT_PENDENTE, null);
    // O cookie é compartilhado entre abas. Um login novo invalida as interfaces
    // antigas antes que possam renovar a sessão usando a outra conta.
    avisarOutrasAbas();
    definirTokenAcesso(resposta.data.token, resposta.data.usuario.id);
    setUsuario(resposta.data.usuario);
    setVerificacaoPendente(null);
    setCarregando(false);
  }

  async function logout({ manterInterface = false } = {}) {
    setVerificacaoPendente(null);
    const token = obterTokenAcesso();
    definirLogoutEmAndamento(true);
    limparTokenAcesso();
    avisarOutrasAbas();
    salvarStorage(CHAVE_LOGOUT_PENDENTE, "1");

    try {
      await api.post("/auth/logout", null, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      salvarStorage(CHAVE_LOGOUT_PENDENTE, null);
    } catch {
      // A sessão local já foi encerrada e não é reativada por uma falha de rede.
      console.error("Não foi possível confirmar o logout no servidor");
    } finally {
      if (!manterInterface) {
        setUsuario(null);
        definirLogoutEmAndamento(false);
      }
    }
  }

  async function logoutTodosDispositivos() {
    definirLogoutEmAndamento(true);
    try {
      await api.post("/auth/logout-all");
    } catch (erro) {
      definirLogoutEmAndamento(false);
      throw erro;
    }
    salvarStorage(CHAVE_LOGOUT_PENDENTE, null);
    limparTokenAcesso();
    avisarOutrasAbas();
    setUsuario(null);
    definirLogoutEmAndamento(false);
  }

  function finalizarLogoutVisual() {
    setUsuario(null);
    definirLogoutEmAndamento(false);
  }

  function atualizarUsuario(usuarioAtualizado) {
    setUsuario(usuarioAtualizado);
  }

  function iniciarVerificacao(email, dados) {
    limparTokenAcesso();
    setUsuario(null);
    setVerificacaoEmailObrigatoria(true);
    // Contexto restrito apenas em memória: sem URL, localStorage ou senha.
    setVerificacaoPendente({ email: email.trim().toLowerCase(), ...dados,
      reenviarEm: Date.now() + (Number(dados.retryAfter) || 0) * 1000 });
  }

  function concluirVerificacao() {
    setVerificacaoPendente(null);
  }

  return (
    <AuthContext.Provider value={{
      usuario,
      autenticado: Boolean(usuario),
      carregando,
      login,
      logout,
      logoutTodosDispositivos,
      finalizarLogoutVisual,
      atualizarUsuario,
      verificacaoPendente,
      verificacaoEmailObrigatoria,
      iniciarVerificacao,
      concluirVerificacao,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
