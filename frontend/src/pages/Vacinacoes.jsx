import { useEffect, useState } from "react";
import api from "../services/api";
import { formatarDataSemFuso } from "../utils/datas";
import IconeImagem from "../components/IconeImagem";
import VoltarInicio from "../components/VoltarInicio";

function Vacinacoes() {
  const [vacinacoes, setVacinacoes] = useState([]);
  const [animais, setAnimais] = useState([]);
  const [vacinas, setVacinas] = useState([]);

  const [animalId, setAnimalId] = useState("");
  const [vacinaId, setVacinaId] = useState("");
  const [dataAplicacao, setDataAplicacao] = useState("");
  const [proximaDose, setProximaDose] = useState("");
  const [observacao, setObservacao] = useState("");

  const [editandoId, setEditandoId] = useState(null);
  const [mensagem, setMensagem] = useState("");
  const [processando, setProcessando] = useState(false);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [erroLista, setErroLista] = useState(false);

  useEffect(() => {
    carregarVacinacoes();
    carregarAnimais();
    carregarVacinas();
  }, []);

  async function carregarVacinacoes() {
    setCarregandoLista(true);
    setErroLista(false);
    try {
      const resposta = await api.getAll("/vacinacoes");
      setVacinacoes(resposta.data);
    } catch {
      setErroLista(true);
      console.error("Falha em uma operação de vacinações");
      setMensagem("Erro ao carregar vacinações");
    } finally {
      setCarregandoLista(false);
    }
  }

  async function carregarAnimais() {
    try {
      const resposta = await api.getAll("/animais");
      setAnimais(resposta.data);
    } catch {
      console.error("Falha em uma operação de vacinações");
    }
  }

  async function carregarVacinas() {
    try {
      const resposta = await api.getAll("/vacinas");
      setVacinas(resposta.data);
    } catch {
      console.error("Falha em uma operação de vacinações");
    }
  }

  function limparFormulario() {
    setAnimalId("");
    setVacinaId("");
    setDataAplicacao("");
    setProximaDose("");
    setObservacao("");
    setEditandoId(null);
  }

  async function salvarVacinacao(evento) {
    evento.preventDefault();

    if (processando) return;
    setProcessando(true);
    try {
      const dados = {
        animal_id: Number(animalId),
        vacina_id: Number(vacinaId),
        data_aplicacao: dataAplicacao,
        proxima_dose: proximaDose || null,
        observacao: observacao || null,
      };

      if (editandoId) {
        await api.put(`/vacinacoes/${editandoId}`, dados);
        setMensagem("Vacinação atualizada com sucesso!");
      } else {
        await api.post("/vacinacoes", dados);
        setMensagem("Vacinação cadastrada com sucesso!");
      }

      limparFormulario();
      carregarVacinacoes();
    } catch (erro) {
      console.error("Falha em uma operação de vacinações");

      setMensagem(erro.response?.data?.mensagem || "Erro ao salvar vacinação");
    } finally {
      setProcessando(false);
    }
  }

  function editarVacinacao(vacinacao) {
    setEditandoId(vacinacao.id);
    setAnimalId(vacinacao.animal_id);
    setVacinaId(vacinacao.vacina_id);

    setDataAplicacao(
      vacinacao.data_aplicacao ? vacinacao.data_aplicacao.substring(0, 10) : "",
    );

    setProximaDose(
      vacinacao.proxima_dose ? vacinacao.proxima_dose.substring(0, 10) : "",
    );

    setObservacao(vacinacao.observacao || "");
  }

  async function excluirVacinacao(id) {
    const confirmar = window.confirm(
      "Tem certeza que deseja excluir esta vacinação?",
    );

    if (!confirmar) return;

    if (processando) return;
    setProcessando(true);
    try {
      await api.delete(`/vacinacoes/${id}`);

      setVacinacoes((vacinacoesAtuais) =>
        vacinacoesAtuais.filter((vacinacao) => vacinacao.id !== id),
      );

      setMensagem("Vacinação excluída com sucesso!");
    } catch (erro) {
      console.error("Falha em uma operação de vacinações");

      setMensagem(erro.response?.data?.mensagem || "Erro ao excluir vacinação");
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header" data-tour="vacinacoes">
        <div>
          <span className="eyebrow">Agenda sanitária</span>
          <h1>Vacinações</h1>
          <p>Registre aplicações e acompanhe as próximas doses.</p>
        </div>
        <VoltarInicio />
      </header>

      {processando && <p role="status">Salvando registros...</p>}
      {mensagem && <p className="notice" role="status">{mensagem}</p>}

      <form className="panel data-form" onSubmit={salvarVacinacao}>
        <fieldset className="form-fields" disabled={processando || carregandoLista}>
        <div>
          <label htmlFor="vacinacoes-campo-1">Animal</label>
          <br />

          <select id="vacinacoes-campo-1" required
            value={animalId}
            onChange={(e) => setAnimalId(e.target.value)}
          >
            <option value="">Selecione</option>

            {animais.map((animal) => (
              <option key={animal.id} value={animal.id}>
                {animal.nome}
                {animal.numero_brinco
                  ? ` — Brinco ${animal.numero_brinco}`
                  : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="vacinacoes-campo-2">Vacina</label>
          <br />

          <select id="vacinacoes-campo-2" required
            value={vacinaId}
            onChange={(e) => setVacinaId(e.target.value)}
          >
            <option value="">Selecione</option>

            {vacinas.map((vacina) => (
              <option key={vacina.id} value={vacina.id}>
                {vacina.nome}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="vacinacoes-campo-3">Data de aplicação</label>
          <br />

          <input id="vacinacoes-campo-3" required
            type="date"
            value={dataAplicacao}
            onChange={(e) => setDataAplicacao(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="vacinacoes-campo-4">Próxima dose</label>
          <br />

          <input id="vacinacoes-campo-4"
            type="date"
            min={dataAplicacao || undefined}
            value={proximaDose}
            onChange={(e) => setProximaDose(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="vacinacoes-campo-5">Observação</label>
          <br />

          <textarea id="vacinacoes-campo-5"
            value={observacao}
            maxLength="255"
            onChange={(e) => setObservacao(e.target.value)}
          />
        </div>

        <br />

        <button type="submit">
          {editandoId ? "Salvar alterações" : "Registrar vacinação"}
        </button>

        {editandoId && (
          <button disabled={processando} className="button-secondary" type="button" onClick={limparFormulario}>
            Cancelar
          </button>
        )}
      </fieldset>
      </form>

      {carregandoLista && <p role="status">Carregando registros...</p>}
      {erroLista && <div className="notice notice-error" role="alert">Não foi possível carregar os registros. <button disabled={processando} type="button" onClick={carregarVacinacoes}>Tentar novamente</button></div>}

      <div className="section-heading">
        <div><span className="eyebrow">Histórico</span><h2>Vacinações registradas</h2></div>
        <span className="count-badge">{carregandoLista || erroLista ? "—" : vacinacoes.length}</span>
      </div>

      {!carregandoLista && !erroLista && vacinacoes.length === 0 && <div className="empty-state"><p>Nenhuma vacinação registrada.</p></div>}

      <div hidden={carregandoLista || erroLista} className="record-grid vaccination-grid">
      {vacinacoes.map((vacinacao) => (
        <article className="record-card vaccination-card" key={vacinacao.id}>
          <span className="record-icon" aria-hidden="true">
            <IconeImagem nome="vacinacoes" className="record-icon-image" />
          </span>
          <h3>{vacinacao.animal || `Animal ${vacinacao.animal_id}`}</h3>

          <p>Vacina: {vacinacao.vacina || vacinacao.vacina_id}</p>

          <p>
            Aplicação:{" "}
            {vacinacao.data_aplicacao
              ? formatarDataSemFuso(vacinacao.data_aplicacao)
              : "-"}
          </p>

          <p>
            Próxima dose:{" "}
            {vacinacao.proxima_dose
              ? formatarDataSemFuso(vacinacao.proxima_dose)
              : "Não informada"}
          </p>

          <p>Observação: {vacinacao.observacao || "-"}</p>

          <div className="record-actions">
          <button disabled={processando} className="button-secondary" type="button" onClick={() => editarVacinacao(vacinacao)}>
            Editar
          </button>

          <button disabled={processando} className="button-danger" type="button" onClick={() => excluirVacinacao(vacinacao.id)}>
            Excluir
          </button>
          </div>
        </article>
      ))}
      </div>
    </div>
  );
}

export default Vacinacoes;
