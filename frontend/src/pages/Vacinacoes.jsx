import Button from "../components/ui/Button";
import useMensagem from "../hooks/useMensagem";
import ColecaoRegistros from "../components/ui/ColecaoRegistros";
import FormularioCadastro from "../components/ui/FormularioCadastro";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../services/api";
import { formatarDataSemFuso } from "../utils/datas";
import IconeImagem from "../components/IconeImagem";
import VoltarInicio from "../components/VoltarInicio";

const CAMPOS_BUSCA = ["animal", "vacina", "observacao"];

function Vacinacoes() {
  const [params] = useSearchParams();
  const [vacinacoes, setVacinacoes] = useState([]);
  const [animais, setAnimais] = useState([]);
  const [vacinas, setVacinas] = useState([]);

  const [animalId, setAnimalId] = useState(() => params.get("animal") || "");
  const [vacinaId, setVacinaId] = useState("");
  const [dataAplicacao, setDataAplicacao] = useState("");
  const [proximaDose, setProximaDose] = useState("");
  const [observacao, setObservacao] = useState("");

  const [editandoId, setEditandoId] = useState(null);
  const [mensagem, setMensagem, erroMensagem, limparErro] = useMensagem();
  const [processando, setProcessando] = useState(false);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [erroLista, setErroLista] = useState(false);

  const carregarVacinacoes = useCallback(
    () =>
      api
        .getAll("/vacinacoes")
        .then((resposta) => {
          setVacinacoes(resposta.data);
        })
        .catch(() => {
          setErroLista(true);
          console.error("Falha em uma operação de vacinações");
          setMensagem("Erro ao carregar vacinações", true);
        })
        .finally(() => {
          setCarregandoLista(false);
        }),
    [setMensagem],
  );
  function recarregarVacinacoes() {
    limparErro();
    setCarregandoLista(true);
    setErroLista(false);

    return carregarVacinacoes();
  }

  const carregarAnimais = useCallback(
    () =>
      api
        .getAll("/animais")
        .then((resposta) => {
          setAnimais(resposta.data);
        })
        .catch(() => {
          console.error("Falha em uma operação de vacinações");
        }),
    [],
  );

  const carregarVacinas = useCallback(
    () =>
      api
        .getAll("/vacinas")
        .then((resposta) => {
          setVacinas(resposta.data);
        })
        .catch(() => {
          console.error("Falha em uma operação de vacinações");
        }),
    [],
  );

  useEffect(() => {
    carregarVacinacoes();
    carregarAnimais();
    carregarVacinas();
  }, [carregarVacinacoes, carregarAnimais, carregarVacinas]);

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
      recarregarVacinacoes();
    } catch (erro) {
      console.error("Falha em uma operação de vacinações");

      setMensagem(
        erro.response?.data?.mensagem || "Erro ao salvar vacinação",
        true,
      );
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

      setMensagem(
        erro.response?.data?.mensagem || "Erro ao excluir vacinação",
        true,
      );
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
      {mensagem && !erroLista && (
        <p
          className={`notice${erroMensagem ? " notice-error" : ""}`}
          role={erroMensagem ? "alert" : "status"}
        >
          {mensagem}
        </p>
      )}

      <FormularioCadastro titulo="Registrar vacinação" editando={editandoId}>
        <form className="panel data-form" onSubmit={salvarVacinacao}>
          <fieldset
            className="form-fields"
            disabled={processando || carregandoLista}
          >
            <div>
              <label htmlFor="vacinacoes-campo-1">Animal</label>
              <br />

              <select
                id="vacinacoes-campo-1"
                required
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

              <select
                id="vacinacoes-campo-2"
                required
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

              <input
                id="vacinacoes-campo-3"
                required
                type="date"
                value={dataAplicacao}
                onChange={(e) => setDataAplicacao(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="vacinacoes-campo-4">Próxima dose</label>
              <br />

              <input
                id="vacinacoes-campo-4"
                type="date"
                min={dataAplicacao || undefined}
                value={proximaDose}
                onChange={(e) => setProximaDose(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="vacinacoes-campo-5">Observação</label>
              <br />

              <textarea
                id="vacinacoes-campo-5"
                value={observacao}
                maxLength="255"
                onChange={(e) => setObservacao(e.target.value)}
              />
            </div>

            <br />

            <Button startIcon={editandoId ? "salvar" : "vacinacoes"} loading={processando} type="submit">
              {editandoId ? "Salvar alterações" : "Registrar vacinação"}
            </Button>

            {editandoId && (
              <Button startIcon="fechar"
                disabled={processando}
                className="button-secondary"
                type="button"
                onClick={limparFormulario}
              >
                Cancelar
              </Button>
            )}
          </fieldset>
        </form>
      </FormularioCadastro>

      {carregandoLista && <p role="status">Carregando registros...</p>}
      {erroLista && (
        <div className="notice notice-error" role="alert">
          Não foi possível carregar os registros.{" "}
          <Button startIcon="atualizar"
            disabled={processando}
            type="button"
            onClick={recarregarVacinacoes}
          >
            Tentar novamente
          </Button>
        </div>
      )}

      <div className="section-heading">
        <div>
          <span className="eyebrow">Histórico</span>
          <h2>Vacinações registradas</h2>
        </div>
        <span className="count-badge">
          {carregandoLista || erroLista ? "—" : vacinacoes.length}
        </span>
      </div>

      <ColecaoRegistros
        itens={vacinacoes}
        campos={CAMPOS_BUSCA}
        className="vaccination-grid"
        oculto={carregandoLista || erroLista}
      >
        {(vacinacao) => (
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
              <Button startIcon="editar"
                disabled={processando}
                className="button-secondary"
                type="button"
                onClick={() => editarVacinacao(vacinacao)}
              >
                Editar
              </Button>

              <Button startIcon="excluir"
                disabled={processando}
                className="button-danger"
                type="button"
                onClick={() => excluirVacinacao(vacinacao.id)}
              >
                Excluir
              </Button>
            </div>
          </article>
        )}
      </ColecaoRegistros>
    </div>
  );
}

export default Vacinacoes;
