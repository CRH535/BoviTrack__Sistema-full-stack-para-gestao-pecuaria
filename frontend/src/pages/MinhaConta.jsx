import Button from "../components/ui/Button";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import ConfirmacaoExclusao from "../components/ConfirmacaoExclusao";
import VoltarInicio from "../components/VoltarInicio";
import api from "../services/api";

function MinhaConta() {
  const { usuario, atualizarUsuario, logout } = useAuth();
  const navigate = useNavigate();
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(usuario.nome || "");
  const [email, setEmail] = useState(usuario.email || "");
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [impactoExclusao, setImpactoExclusao] = useState(null);
  const [carregandoImpacto, setCarregandoImpacto] = useState(false);
  const [erroImpacto, setErroImpacto] = useState("");

  function cancelarEdicao() {
    setNome(usuario.nome || "");
    setEmail(usuario.email || "");
    setEditando(false);
  }

  async function salvarConta(evento) {
    evento.preventDefault();
    setMensagem("");
    setErro(false);
    setSalvando(true);

    try {
      const resposta = await api.put("/usuarios/me", { nome, email });
      atualizarUsuario(resposta.data.usuario);
      setNome(resposta.data.usuario.nome);
      setEmail(resposta.data.usuario.email);
      setMensagem(resposta.data.mensagem);
      setEditando(false);
    } catch (erroRequisicao) {
      setErro(true);
      setMensagem(
        erroRequisicao.response?.data?.mensagem || "Erro ao atualizar conta",
      );
    } finally {
      setSalvando(false);
    }
  }

  async function excluirMinhaConta() {
    if (!impactoExclusao) return;

    setExcluindo(true);
    setMensagem("");
    setErro(false);

    try {
      const resposta = await api.delete("/usuarios/me", {
        data: { confirmacao: "EXCLUIR" },
      });

      await logout();
      navigate("/login", {
        replace: true,
        state: { mensagem: resposta.data.mensagem },
      });
    } catch (erroRequisicao) {
      setErro(true);
      const mensagemErro =
        erroRequisicao.response?.data?.mensagem ||
        "Não foi possível excluir sua conta";
      setMensagem(mensagemErro);
      setErroImpacto(mensagemErro);
    } finally {
      setExcluindo(false);
    }
  }

  async function abrirExclusaoDaConta() {
    setConfirmandoExclusao(true);
    setImpactoExclusao(null);
    setErroImpacto("");
    setCarregandoImpacto(true);

    try {
      const resposta = await api.get("/usuarios/me/exclusao-preview");
      setImpactoExclusao(resposta.data);
    } catch (erroRequisicao) {
      setErroImpacto(
        erroRequisicao.response?.data?.mensagem ||
          "Não foi possível verificar os registros relacionados.",
      );
    } finally {
      setCarregandoImpacto(false);
    }
  }

  function fecharExclusaoDaConta() {
    if (excluindo) return;
    setConfirmandoExclusao(false);
    setImpactoExclusao(null);
    setCarregandoImpacto(false);
    setErroImpacto("");
  }

  return (
    <div className="page account-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Perfil</span>
          <h1>Minha Conta</h1>
          <p>Consulte e atualize as informações da sua conta no BoviTrack.</p>
        </div>
        <VoltarInicio />
      </header>

      {mensagem && (
        <p className={`notice${erro ? " notice-error" : ""}`}>{mensagem}</p>
      )}

      <section className="panel account-card">
        <div className="account-heading">
          <span className="user-avatar account-avatar" aria-hidden="true">
            {usuario.nome?.charAt(0).toUpperCase()}
          </span>
          <div>
            <span className="eyebrow">Dados da conta</span>
            <h2>{usuario.nome}</h2>
          </div>
        </div>

        {!editando && (
          <>
            <dl className="account-details">
              <div>
                <dt>Nome</dt>
                <dd>{usuario.nome}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{usuario.email}</dd>
              </div>
              <div>
                <dt>Tipo de conta</dt>
                <dd>{usuario.perfil === "admin" ? "Administrador" : "Usuário"}</dd>
              </div>
            </dl>

            <Button startIcon="editar" type="button" onClick={() => setEditando(true)}>
              Editar informações
            </Button>
          </>
        )}

        {editando && (
          <form className="account-form" onSubmit={salvarConta}>
            <div>
              <label htmlFor="account-name">Nome</label>
              <input
                id="account-name"
                type="text"
                value={nome}
                onChange={(evento) => setNome(evento.target.value)}
                maxLength="120"
                required
              />
            </div>
            <div>
              <label htmlFor="account-email">Email</label>
              <input
                id="account-email"
                type="email"
                value={email}
                onChange={(evento) => setEmail(evento.target.value)}
                maxLength="255"
                required
              />
            </div>
            <div className="form-actions">
              <Button startIcon="salvar" loading={salvando} type="submit" disabled={salvando}>
                {salvando ? "Salvando..." : "Salvar alterações"}
              </Button>
              <Button startIcon="fechar"
                className="button-secondary"
                type="button"
                onClick={cancelarEdicao}
                disabled={salvando}
              >
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </section>

      <section className="panel danger-zone">
        <div>
          <span className="danger-kicker">Zona de perigo</span>
          <h2>Excluir conta</h2>
          <p>
            A exclusão remove permanentemente sua conta e todos os dados
            vinculados a ela. Esta ação não poderá ser desfeita.
          </p>
        </div>

        {usuario.perfil === "usuario" ? (
          <Button startIcon="excluir"
            className="button-danger"
            type="button"
            onClick={abrirExclusaoDaConta}
          >
            Excluir minha conta
          </Button>
        ) : (
          <span className="protected-account-badge">
            Conta administrativa protegida
          </span>
        )}
      </section>

      <ConfirmacaoExclusao
        aberto={confirmandoExclusao}
        titulo="Excluir minha conta?"
        mensagem="Esta ação é permanente. Revise todos os dados vinculados que serão apagados antes de confirmar."
        confirmacaoExigida="EXCLUIR"
        impacto={impactoExclusao}
        impactoObrigatorio
        carregandoImpacto={carregandoImpacto}
        erroImpacto={erroImpacto}
        processando={excluindo}
        rotuloConfirmar="Excluir minha conta e registros"
        rotuloProcessando="Excluindo conta e registros..."
        onCancelar={fecharExclusaoDaConta}
        onConfirmar={excluirMinhaConta}
      />
    </div>
  );
}

export default MinhaConta;
