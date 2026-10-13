import { useEffect, useState } from "react";
import ConfirmacaoExclusao from "../components/ConfirmacaoExclusao";
import VoltarInicio from "../components/VoltarInicio";
import api from "../services/api";
import PasswordInput from "../components/PasswordInput";

const formularioInicial = {
  nome: "",
  email: "",
  senha: "",
  confirmarSenha: "",
};

function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erroLista, setErroLista] = useState(false);
  const [formulario, setFormulario] = useState(formularioInicial);
  const [modo, setModo] = useState(null);
  const [editandoId, setEditandoId] = useState(null);
  const [mensagem, setMensagem] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [usuarioParaExcluir, setUsuarioParaExcluir] = useState(null);
  const [excluindo, setExcluindo] = useState(false);
  const [impactoExclusao, setImpactoExclusao] = useState(null);
  const [carregandoImpacto, setCarregandoImpacto] = useState(false);
  const [erroImpacto, setErroImpacto] = useState("");

  useEffect(() => {
    carregarUsuarios();
  }, []);

  async function carregarUsuarios() {
    setCarregando(true);
    setErroLista(false);
    try {
      const resposta = await api.getAll("/usuarios");
      setUsuarios(resposta.data);
    } catch (erro) {
      setErroLista(true);
      setMensagem(erro.response?.data?.mensagem || "Erro ao carregar usuários");
    } finally {
      setCarregando(false);
    }
  }

  function atualizarCampo(evento) {
    const { name, value } = evento.target;
    setFormulario((atual) => ({ ...atual, [name]: value }));
  }

  function abrirNovoUsuario() {
    setFormulario(formularioInicial);
    setEditandoId(null);
    setModo("novo");
    setMensagem("");
  }

  function abrirEdicao(usuario) {
    setFormulario({
      nome: usuario.nome,
      email: usuario.email,
      senha: "",
      confirmarSenha: "",
    });
    setEditandoId(usuario.id);
    setModo("editar");
    setMensagem("");
  }

  function fecharFormulario() {
    setFormulario(formularioInicial);
    setEditandoId(null);
    setModo(null);
  }

  async function salvarUsuario(evento) {
    evento.preventDefault();
    if (salvando) return;
    setMensagem("");

    const nome = formulario.nome.trim();
    const email = formulario.email.trim();

    if (!nome || !email) {
      setMensagem("Nome e email são obrigatórios.");
      return;
    }

    if (modo === "novo") {
      if (!formulario.senha) {
        setMensagem("A senha é obrigatória.");
        return;
      }

      if (formulario.senha.length < 8) {
        setMensagem("A senha deve possuir pelo menos 8 caracteres.");
        return;
      }

      if (formulario.senha !== formulario.confirmarSenha) {
        setMensagem("A senha e a confirmação devem ser iguais.");
        return;
      }
    }

    setSalvando(true);

    try {
      if (modo === "novo") {
        await api.post("/usuarios", { nome, email, senha: formulario.senha });
        setMensagem("Usuário criado com sucesso.");
      } else {
        await api.put(`/usuarios/${editandoId}`, { nome, email });
        setMensagem("Usuário atualizado com sucesso.");
      }

      fecharFormulario();
      await carregarUsuarios();
    } catch (erro) {
      setMensagem(erro.response?.data?.mensagem || "Erro ao salvar usuário");
    } finally {
      setSalvando(false);
    }
  }

  async function alterarSituacao(usuario) {
    const acao = usuario.ativo ? "desativar" : "ativar";
    const confirmar = window.confirm(
      `Tem certeza que deseja ${acao} ${usuario.nome}?`,
    );

    if (!confirmar) return;

    try {
      const resposta = await api.put(`/usuarios/${usuario.id}/ativo`, {
        ativo: !usuario.ativo,
      });
      setMensagem(resposta.data.mensagem);
      await carregarUsuarios();
    } catch (erro) {
      setMensagem(
        erro.response?.data?.mensagem || "Erro ao alterar situação do usuário",
      );
    }
  }

  async function excluirUsuario() {
    if (!usuarioParaExcluir || !impactoExclusao) return;

    setExcluindo(true);
    setMensagem("");

    try {
      const resposta = await api.delete(`/usuarios/${usuarioParaExcluir.id}`);
      setUsuarios((atuais) =>
        atuais.filter((usuario) => usuario.id !== usuarioParaExcluir.id),
      );
      setMensagem(resposta.data.mensagem);
      fecharExclusaoUsuario();
    } catch (erro) {
      setErroImpacto(
        erro.response?.data?.mensagem || "Erro ao excluir usuário",
      );
    } finally {
      setExcluindo(false);
    }
  }

  async function abrirExclusaoUsuario(usuario) {
    setUsuarioParaExcluir(usuario);
    setImpactoExclusao(null);
    setErroImpacto("");
    setCarregandoImpacto(true);

    try {
      const resposta = await api.get(
        `/usuarios/${usuario.id}/exclusao-preview`,
      );
      setImpactoExclusao(resposta.data);
      setCarregandoImpacto(false);
    } catch (erro) {
      setErroImpacto(
        erro.response?.data?.mensagem ||
          "Não foi possível verificar os registros relacionados.",
      );
      setCarregandoImpacto(false);
    }
  }

  function fecharExclusaoUsuario() {
    if (excluindo) return;
    setUsuarioParaExcluir(null);
    setImpactoExclusao(null);
    setCarregandoImpacto(false);
    setErroImpacto("");
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Administração</span>
          <h1>Usuários</h1>
          <p>Gerencie as contas de produtores que utilizam o BoviTrack.</p>
        </div>

        <div className="page-header-actions">
          {!modo && (
            <button type="button" onClick={abrirNovoUsuario}>
              + Novo usuário
            </button>
          )}
          <VoltarInicio />
        </div>
      </header>

      {mensagem && <p className="notice user-message">{mensagem}</p>}

      {modo && (
        <form className="panel user-form" onSubmit={salvarUsuario}>
          <fieldset className="form-fields" disabled={salvando}>
          <h2>{modo === "novo" ? "Novo usuário" : "Editar usuário"}</h2>

          <label htmlFor="usuario-nome">Nome</label>
          <input
            id="usuario-nome"
            name="nome"
            type="text"
            value={formulario.nome}
            onChange={atualizarCampo}
            maxLength="120"
            required
          />

          <label htmlFor="usuario-email">Email</label>
          <input
            id="usuario-email"
            name="email"
            type="email"
            value={formulario.email}
            onChange={atualizarCampo}
            maxLength="255"
            required
          />

          {modo === "novo" && (
            <>
              <label htmlFor="usuario-senha">Senha</label>
              <PasswordInput
                id="usuario-senha"
                name="senha"
                value={formulario.senha}
                onChange={atualizarCampo}
                minLength="8"
                autoComplete="new-password"
                required
              />

              <label htmlFor="usuario-confirmar-senha">Confirmar senha</label>
              <PasswordInput
                id="usuario-confirmar-senha"
                name="confirmarSenha"
                rotulo="confirmar senha"
                value={formulario.confirmarSenha}
                onChange={atualizarCampo}
                minLength="8"
                autoComplete="new-password"
                required
              />
            </>
          )}

          <div className="form-actions">
            <button type="submit" disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
            <button className="button-secondary" type="button" onClick={fecharFormulario}>
              Cancelar
            </button>
          </div>
        </fieldset></form>
      )}

      <div className="section-heading">
        <div><span className="eyebrow">Contas</span><h2>Usuários cadastrados</h2></div>
        <span className="count-badge">{carregando || erroLista ? "\u2014" : usuarios.length}</span>
      </div>

      {carregando && <p role="status">Carregando contas...</p>}
      {erroLista && <button type="button" onClick={carregarUsuarios}>Tentar novamente</button>}
      <div hidden={carregando || erroLista} className="panel users-table-wrapper">
        <table className="users-table">
          <thead>
            <tr>
              <th scope="col">Nome</th>
              <th scope="col">Email</th>
              <th scope="col">Perfil</th>
              <th scope="col">Situação</th>
              <th scope="col">Ações</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((usuario) => (
              <tr key={usuario.id}>
                <td>{usuario.nome}</td>
                <td>{usuario.email}</td>
                <td>{usuario.perfil === "admin" ? "Admin" : "Usuário"}</td>
                <td>{usuario.ativo ? "Ativo" : "Inativo"}</td>
                <td className="user-actions">
                  <button className="button-secondary button-small" type="button" onClick={() => abrirEdicao(usuario)}>
                    Editar
                  </button>

                  {usuario.perfil === "usuario" && (
                    <>
                      <button className="button-small" type="button" onClick={() => alterarSituacao(usuario)}>
                        {usuario.ativo ? "Desativar" : "Ativar"}
                      </button>
                      <button
                        className="button-danger button-small"
                        type="button"
                        onClick={() => abrirExclusaoUsuario(usuario)}
                      >
                        Excluir usuário
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!carregando && !erroLista && usuarios.length === 0 && <p>Nenhum usuário cadastrado.</p>}

      <ConfirmacaoExclusao
        aberto={Boolean(usuarioParaExcluir)}
        titulo={`Excluir ${usuarioParaExcluir?.nome || "usuário"}?`}
        mensagem="Esta ação é permanente. Revise a conta e todos os dados vinculados que serão apagados."
        impacto={impactoExclusao}
        impactoObrigatorio
        carregandoImpacto={carregandoImpacto}
        erroImpacto={erroImpacto}
        processando={excluindo}
        rotuloConfirmar="Excluir usuário e registros"
        rotuloProcessando="Excluindo usuário e registros..."
        onCancelar={fecharExclusaoUsuario}
        onConfirmar={excluirUsuario}
      />
    </div>
  );
}

export default Usuarios;
