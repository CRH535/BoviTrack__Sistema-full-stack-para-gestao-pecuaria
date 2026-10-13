import { useEffect, useState } from "react";
import api from "../services/api";
import IconeImagem from "../components/IconeImagem";
import VoltarInicio from "../components/VoltarInicio";

function Vacinas() {
  const [vacinas, setVacinas] = useState([]);

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");

  const [editandoId, setEditandoId] = useState(null);
  const [mensagem, setMensagem] = useState("");
  const [processando, setProcessando] = useState(false);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [erroLista, setErroLista] = useState(false);

  useEffect(() => {
    carregarVacinas();
  }, []);

  async function carregarVacinas() {
    setCarregandoLista(true);
    setErroLista(false);
    try {
      const resposta = await api.getAll("/vacinas");
      setVacinas(resposta.data);
    } catch {
      setErroLista(true);
      console.error("Falha em uma operação de vacinas");
      setMensagem("Erro ao carregar vacinas");
    } finally {
      setCarregandoLista(false);
    }
  }

  function limparFormulario() {
    setNome("");
    setDescricao("");
    setEditandoId(null);
  }

  async function salvarVacina(evento) {
    evento.preventDefault();

    if (processando) return;
    setProcessando(true);
    try {
      const dados = {
        nome,
        descricao,
      };

      if (editandoId) {
        await api.put(`/vacinas/${editandoId}`, dados);
        setMensagem("Vacina atualizada com sucesso!");
      } else {
        await api.post("/vacinas", dados);
        setMensagem("Vacina cadastrada com sucesso!");
      }

      limparFormulario();
      carregarVacinas();
    } catch (erro) {
      console.error("Falha em uma operação de vacinas");

      setMensagem(erro.response?.data?.mensagem || "Erro ao salvar vacina");
    } finally {
      setProcessando(false);
    }
  }

  function editarVacina(vacina) {
    setEditandoId(vacina.id);
    setNome(vacina.nome);
    setDescricao(vacina.descricao || "");
  }

  async function excluirVacina(id) {
    const confirmar = window.confirm(
      "Tem certeza que deseja excluir esta vacina?",
    );

    if (!confirmar) return;

    if (processando) return;
    setProcessando(true);
    try {
      await api.delete(`/vacinas/${id}`);

      setVacinas((vacinasAtuais) =>
        vacinasAtuais.filter((vacina) => vacina.id !== id),
      );

      setMensagem("Vacina excluída com sucesso!");
    } catch (erro) {
      console.error("Falha em uma operação de vacinas");

      setMensagem(erro.response?.data?.mensagem || "Erro ao excluir vacina");
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Saúde animal</span>
          <h1>Vacinas</h1>
          <p>Mantenha organizado o catálogo sanitário.</p>
        </div>
        <VoltarInicio />
      </header>

      {processando && <p role="status">Salvando registros...</p>}
      {mensagem && <p className="notice" role="status">{mensagem}</p>}

      <form className="panel data-form" onSubmit={salvarVacina}>
        <fieldset className="form-fields" disabled={processando || carregandoLista}>
        <div>
          <label htmlFor="vacinas-campo-1">Nome</label>
          <br />

          <input id="vacinas-campo-1" required
            type="text"
            value={nome}
            maxLength="100"
            onChange={(e) => setNome(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="vacinas-campo-2">Descrição</label>
          <br />

          <input id="vacinas-campo-2"
            type="text"
            value={descricao}
            maxLength="255"
            onChange={(e) => setDescricao(e.target.value)}
          />
        </div>

        <br />

        <button type="submit">
          {editandoId ? "Salvar alterações" : "Cadastrar"}
        </button>

        {editandoId && (
          <button disabled={processando} className="button-secondary" type="button" onClick={limparFormulario}>
            Cancelar
          </button>
        )}
      </fieldset>
      </form>

      {carregandoLista && <p role="status">Carregando registros...</p>}
      {erroLista && <div className="notice notice-error" role="alert">Não foi possível carregar os registros. <button disabled={processando} type="button" onClick={carregarVacinas}>Tentar novamente</button></div>}

      <div className="section-heading">
        <div><span className="eyebrow">Catálogo</span><h2>Vacinas cadastradas</h2></div>
        <span className="count-badge">{carregandoLista || erroLista ? "—" : vacinas.length}</span>
      </div>

      {!carregandoLista && !erroLista && vacinas.length === 0 && <div className="empty-state"><p>Nenhuma vacina cadastrada.</p></div>}

      <div hidden={carregandoLista || erroLista} className="record-grid">
      {vacinas.map((vacina) => (
        <article className="record-card" key={vacina.id}>
          <span className="record-icon" aria-hidden="true">
            <IconeImagem nome="vacinas" className="record-icon-image" />
          </span>
          <h3>{vacina.nome}</h3>
          <p>{vacina.descricao || "-"}</p>

          <div className="record-actions">
          <button disabled={processando} className="button-secondary" type="button" onClick={() => editarVacina(vacina)}>
            Editar
          </button>

          <button disabled={processando} className="button-danger" type="button" onClick={() => excluirVacina(vacina.id)}>
            Excluir
          </button>
          </div>
        </article>
      ))}
      </div>
    </div>
  );
}

export default Vacinas;
