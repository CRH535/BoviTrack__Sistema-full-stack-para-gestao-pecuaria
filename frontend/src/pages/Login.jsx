import Button from "../components/ui/Button";
import { useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { useBlackHoleTransition } from "../transitions/useBlackHoleTransition";
import PasswordInput from "../components/PasswordInput";
import Marca from "../components/Marca";

function Login() {
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mensagem, setMensagem] = useState(location.state?.mensagem || "");
  const [mensagemSucesso, setMensagemSucesso] = useState(
    Boolean(location.state?.mensagem),
  );
  const [enviando, setEnviando] = useState(false);
  const { autenticado, carregando, login } = useAuth();
  const { iniciarTransicao, sinalizarDestinoPronto, transicaoAtiva } =
    useBlackHoleTransition();

  useEffect(() => {
    sinalizarDestinoPronto("login");
  }, [sinalizarDestinoPronto]);

  if (!carregando && autenticado && !enviando && !transicaoAtiva) {
    return <Navigate to="/" replace />;
  }

  async function entrar(evento) {
    evento.preventDefault();
    if (carregando || enviando || transicaoAtiva) return;
    setMensagem("");
    setMensagemSucesso(false);
    setEnviando(true);

    try {
      await login(email, senha);
      iniciarTransicao(location.state?.from?.pathname || "/");
    } catch (erro) {
      setMensagem(erro.response?.data?.mensagem || "Erro ao realizar login");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="login-page">
      <section className="auth-visual" aria-hidden="true">
        <div className="auth-visual-content">
          <Marca className="auth-brand" />
          <div>
            <span className="auth-kicker">Gestão pecuária simples</span>
            <h1>Gerencie melhor a sua produção.</h1>
            <p>
              Animais, lotes, vacinações e despesas organizados em um só lugar.
            </p>
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="login-card">
          <Marca className="auth-mobile-brand" />
          <span className="auth-kicker">Bem-vindo de volta</span>
          <h1>Acesse sua conta</h1>
          <p>Entre para acompanhar seu rebanho e sua propriedade.</p>

          {mensagem && (
            <p
              role={mensagemSucesso ? "status" : "alert"}
              className={`form-message${mensagemSucesso ? " success-message" : ""}`}
            >
              {mensagem}
            </p>
          )}

          <form onSubmit={entrar}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
              autoComplete="email"
              required
              placeholder="seu@email.com"
            />

            <label htmlFor="senha">Senha</label>
            <PasswordInput
              id="senha"
              value={senha}
              onChange={(evento) => setSenha(evento.target.value)}
              autoComplete="current-password"
              required
              placeholder="Digite sua senha"
            />

            <Button startIcon="entrar" loading={carregando || enviando || transicaoAtiva}
              type="submit"
              disabled={carregando || enviando || transicaoAtiva}
            >
              {carregando
                ? "Verificando sessão..."
                : enviando
                  ? "Entrando..."
                  : "Entrar"}
            </Button>
          </form>

          <p className="auth-switch">
            Ainda não tem uma conta? <Link to="/cadastro">Criar conta</Link>
          </p>
        </div>
      </section>
    </main>
  );
}

export default Login;
