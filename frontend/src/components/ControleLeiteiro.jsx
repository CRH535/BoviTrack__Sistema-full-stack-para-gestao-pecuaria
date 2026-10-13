import { useEffect, useMemo, useRef, useState } from "react";

import GraficoProducaoLeite from "./GraficoProducaoLeite";
import IconeImagem from "./IconeImagem";
import api from "../services/api";
import { formatarDataSemFuso, obterDataAtualLocal } from "../utils/datas";

const TURNOS = [
  { valor: "manha", rotulo: "Manhã" },
  { valor: "tarde", rotulo: "Tarde" },
  { valor: "noite", rotulo: "Noite" },
  { valor: "ordenha_unica", rotulo: "Ordenha única" },
];

const ROTULOS_TURNO = Object.fromEntries(
  TURNOS.map((turno) => [turno.valor, turno.rotulo]),
);

const RESUMO_INICIAL = {
  producao_hoje: 0,
  media_diaria: 0,
  producao_7_dias: 0,
  media_7_dias: 0,
  producao_30_dias: 0,
};

function formatarLitros(valor) {
  return `${Number(valor || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })} L`;
}

function ControleLeiteiro({ animal }) {
  const id = animal.id;

  const [producoes, setProducoes] = useState([]);
  const [resumo, setResumo] = useState(RESUMO_INICIAL);
  const [evolucao, setEvolucao] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [pronto, setPronto] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  const [formularioAberto, setFormularioAberto] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [data, setData] = useState(obterDataAtualLocal);
  const [turno, setTurno] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [observacao, setObservacao] = useState("");

  const [periodo, setPeriodo] = useState("todos");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const requisicaoHistoricoRef = useRef(0);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);

  useEffect(() => {
    let ativo = true;
    const controller = new AbortController();

    async function carregarPagina() {
      try {
        const [producoesResposta, resumoResposta] = await Promise.all([
          api.getAll(`/animais/${id}/producoes-leiteiras`, {
            params: { periodo: "todos" },
            signal: controller.signal,
          }),
          api.get(`/animais/${id}/producoes-leiteiras/resumo`, {
            signal: controller.signal,
          }),
        ]);

        if (!ativo) return;

        setPronto(true);
        setProducoes(producoesResposta.data);
        setResumo(resumoResposta.data.resumo);
        setEvolucao(resumoResposta.data.evolucao);
      } catch (erroCarregamento) {
        if (ativo) {
          setErro(
            erroCarregamento.response?.data?.mensagem ||
              "Não foi possível carregar o controle leiteiro.",
          );
        }
      } finally {
        if (ativo) setCarregando(false);
      }
    }

    carregarPagina();

    return () => {
      ativo = false;
      controller.abort();
    };
  }, [id, tentativa]);

  async function carregarHistorico(
    periodoRecebido = periodo,
    inicioRecebido = dataInicio,
    fimRecebido = dataFim,
  ) {
    const requisicao = ++requisicaoHistoricoRef.current;
    setCarregandoHistorico(true);
    const params = { periodo: periodoRecebido };

    if (periodoRecebido === "todos" && inicioRecebido) {
      params.data_inicio = inicioRecebido;
    }

    if (periodoRecebido === "todos" && fimRecebido) {
      params.data_fim = fimRecebido;
    }

    try {
      const resposta = await api.getAll(`/animais/${id}/producoes-leiteiras`, {
        params,
      });
      if (requisicao === requisicaoHistoricoRef.current)
        setProducoes(resposta.data);
    } catch (falha) {
      if (requisicao === requisicaoHistoricoRef.current) throw falha;
    } finally {
      if (requisicao === requisicaoHistoricoRef.current)
        setCarregandoHistorico(false);
    }
  }

  async function carregarResumo() {
    const resposta = await api.get(`/animais/${id}/producoes-leiteiras/resumo`);

    setResumo(resposta.data.resumo);
    setEvolucao(resposta.data.evolucao);
  }

  async function atualizarControleLeiteiro() {
    await Promise.all([carregarHistorico(), carregarResumo()]);
  }

  function limparFormulario() {
    setData(obterDataAtualLocal());
    setTurno("");
    setQuantidade("");
    setObservacao("");
    setEditandoId(null);
  }

  function abrirNovoRegistro() {
    limparFormulario();
    setMensagem("");
    setErro("");
    setFormularioAberto(true);
  }

  function editarProducao(producao) {
    setData(producao.data ? String(producao.data).slice(0, 10) : "");
    setTurno(producao.turno);
    setQuantidade(producao.quantidade_litros);
    setObservacao(producao.observacao || "");
    setEditandoId(producao.id);
    setMensagem("");
    setErro("");
    setFormularioAberto(true);
  }

  function fecharFormulario() {
    limparFormulario();
    setFormularioAberto(false);
  }

  async function salvarProducao(evento) {
    evento.preventDefault();
    if (processando) return;
    setMensagem("");
    setErro("");

    if (!data || !turno || !quantidade || Number(quantidade) <= 0) {
      setErro("Informe data, turno e uma quantidade maior que zero.");
      return;
    }

    const dados = {
      data,
      turno,
      quantidade_litros: Number(quantidade),
      observacao: observacao.trim() || null,
    };

    setProcessando(true);
    try {
      if (editandoId) {
        await api.put(`/producoes-leiteiras/${editandoId}`, dados);
        setMensagem("Produção atualizada com sucesso.");
      } else {
        await api.post(`/animais/${id}/producoes-leiteiras`, dados);
        setMensagem("Produção registrada com sucesso.");
      }

      fecharFormulario();
      await atualizarControleLeiteiro();
    } catch (erroSalvamento) {
      setErro(
        erroSalvamento.response?.data?.mensagem ||
          "Não foi possível salvar a produção.",
      );
    } finally {
      setProcessando(false);
    }
  }

  async function excluirProducao(producaoId) {
    if (processando) return;
    if (!window.confirm("Tem certeza que deseja excluir esta produção?")) {
      return;
    }

    setMensagem("");
    setErro("");

    setProcessando(true);
    try {
      await api.delete(`/producoes-leiteiras/${producaoId}`);
      setMensagem("Produção excluída com sucesso.");

      if (editandoId === producaoId) fecharFormulario();

      await atualizarControleLeiteiro();
    } catch (erroExclusao) {
      setErro(
        erroExclusao.response?.data?.mensagem ||
          "Não foi possível excluir a produção.",
      );
    } finally {
      setProcessando(false);
    }
  }

  async function aplicarPeriodo(novoPeriodo) {
    setPeriodo(novoPeriodo);
    setDataInicio("");
    setDataFim("");
    setErro("");

    try {
      await carregarHistorico(novoPeriodo, "", "");
    } catch (erroFiltro) {
      setErro(
        erroFiltro.response?.data?.mensagem ||
          "Não foi possível filtrar o histórico.",
      );
    }
  }

  async function aplicarIntervalo(evento) {
    evento.preventDefault();
    setErro("");

    if (dataInicio && dataFim && dataInicio > dataFim) {
      setErro("A data inicial não pode ser posterior à data final.");
      return;
    }

    setPeriodo("todos");

    try {
      await carregarHistorico("todos", dataInicio, dataFim);
    } catch (erroFiltro) {
      setErro(
        erroFiltro.response?.data?.mensagem ||
          "Não foi possível aplicar o intervalo.",
      );
    }
  }

  const producoesPorDia = useMemo(() => {
    const grupos = new Map();

    for (const producao of producoes) {
      if (!grupos.has(producao.data)) {
        grupos.set(producao.data, {
          data: producao.data,
          total: 0,
          itens: [],
        });
      }

      const grupo = grupos.get(producao.data);
      grupo.total += Number(producao.quantidade_litros);
      grupo.itens.push(producao);
    }

    return Array.from(grupos.values());
  }, [producoes]);

  if (carregando) return <p role="status">Carregando controle leiteiro...</p>;
  if (!pronto)
    return (
      <div className="notice notice-error" role="alert">
        {erro || "Não foi possível carregar a produção."}
        <button
          type="button"
          onClick={() => {
            setCarregando(true);
            setTentativa((n) => n + 1);
          }}
        >
          Tentar novamente
        </button>
      </div>
    );
  const diferencaSeteDias =
    Number(resumo.producao_hoje) - Number(resumo.media_7_dias);

  return (
    <div>
      {mensagem && (
        <p className="notice" role="status">
          {mensagem}
        </p>
      )}
      {erro && (
        <p className="notice notice-error" role="alert">
          {erro}
        </p>
      )}
      <section className="milk-section">
        <div className="section-heading milk-section-heading">
          <div>
            <span className="eyebrow">Acompanhamento individual</span>
            <h2 className="icon-title">
              <IconeImagem nome="producao" className="title-icon-image" />
              Controle Leiteiro
            </h2>
          </div>
          <button
            disabled={processando}
            type="button"
            onClick={abrirNovoRegistro}
          >
            <IconeImagem nome="producao" className="button-icon-image" />
            Registrar produção
          </button>
        </div>

        {formularioAberto && (
          <form className="panel data-form milk-form" onSubmit={salvarProducao}>
            <fieldset className="form-fields" disabled={processando}>
              <div className="milk-form-title">
                <h3>{editandoId ? "Editar produção" : "Registrar produção"}</h3>
                <p>Animal: {animal.nome}</p>
              </div>
              <div>
                <label htmlFor="milk-date">Data da ordenha</label>
                <input
                  id="milk-date"
                  type="date"
                  required
                  value={data}
                  onChange={(evento) => setData(evento.target.value)}
                />
              </div>
              <div>
                <label htmlFor="milk-shift">Turno</label>
                <select
                  id="milk-shift"
                  required
                  value={turno}
                  onChange={(evento) => setTurno(evento.target.value)}
                >
                  <option value="">Selecione</option>
                  {TURNOS.map((item) => (
                    <option value={item.valor} key={item.valor}>
                      {item.rotulo}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="milk-quantity">Quantidade (litros)</label>
                <input
                  id="milk-quantity"
                  type="number"
                  required
                  min="0.01"
                  max="99999999.99"
                  step="0.01"
                  inputMode="decimal"
                  value={quantidade}
                  onChange={(evento) => setQuantidade(evento.target.value)}
                  placeholder="Ex.: 12,5"
                />
              </div>
              <div className="milk-observation-field">
                <label htmlFor="milk-observation">Observação</label>
                <textarea
                  id="milk-observation"
                  maxLength="500"
                  value={observacao}
                  onChange={(evento) => setObservacao(evento.target.value)}
                  placeholder="Opcional"
                />
              </div>
              <div className="form-actions milk-form-actions">
                <button type="submit">
                  {editandoId ? "Salvar alterações" : "Registrar produção"}
                </button>
                <button
                  className="button-secondary"
                  type="button"
                  onClick={fecharFormulario}
                >
                  Cancelar
                </button>
              </div>
            </fieldset>
          </form>
        )}

        <div className="milk-stats-grid">
          <article className="stat-card milk-stat-card">
            <div>
              <span>Produção de hoje</span>
              <strong>{formatarLitros(resumo.producao_hoje)}</strong>
              <small>Soma das ordenhas de hoje</small>
            </div>
          </article>
          <article className="stat-card milk-stat-card">
            <div>
              <span>Média diária</span>
              <strong>{formatarLitros(resumo.media_diaria)}</strong>
              <small>Dias com produção registrada</small>
            </div>
          </article>
          <article className="stat-card milk-stat-card">
            <div>
              <span>Últimos 7 dias</span>
              <strong>{formatarLitros(resumo.producao_7_dias)}</strong>
              <small>Média: {formatarLitros(resumo.media_7_dias)}/dia</small>
            </div>
          </article>
          <article className="stat-card milk-stat-card">
            <div>
              <span>Últimos 30 dias</span>
              <strong>{formatarLitros(resumo.producao_30_dias)}</strong>
              <small>Produção acumulada</small>
            </div>
          </article>
        </div>

        {Number(resumo.media_7_dias) > 0 && (
          <p
            className={`milk-comparison ${diferencaSeteDias < 0 ? "is-lower" : "is-higher"}`}
          >
            Hoje: <strong>{formatarLitros(resumo.producao_hoje)}</strong>. Média
            dos últimos 7 dias:{" "}
            <strong>{formatarLitros(resumo.media_7_dias)}/dia</strong>. A
            produção de hoje está{" "}
            <strong>{formatarLitros(Math.abs(diferencaSeteDias))}</strong>{" "}
            {diferencaSeteDias < 0 ? "abaixo" : "acima"} dessa média.
          </p>
        )}

        <section className="panel milk-chart-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Últimos 30 dias</span>
              <h3>Evolução da produção</h3>
            </div>
          </div>
          <GraficoProducaoLeite dados={evolucao} />
        </section>

        <section className="milk-history-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Registros</span>
              <h3>Histórico de produção</h3>
            </div>
            <span className="count-badge">{producoes.length}</span>
          </div>

          <div className="milk-period-filters" aria-label="Filtrar histórico">
            {[
              ["hoje", "Hoje"],
              ["7dias", "Últimos 7 dias"],
              ["30dias", "Últimos 30 dias"],
              ["todos", "Todos"],
            ].map(([valor, rotulo]) => (
              <button
                className={
                  periodo === valor && !dataInicio && !dataFim
                    ? "active"
                    : "button-secondary"
                }
                type="button"
                onClick={() => aplicarPeriodo(valor)}
                key={valor}
              >
                {rotulo}
              </button>
            ))}
          </div>

          <form
            className="panel milk-custom-filter"
            onSubmit={aplicarIntervalo}
          >
            <div>
              <label htmlFor="milk-start">Data inicial</label>
              <input
                id="milk-start"
                type="date"
                value={dataInicio}
                onChange={(evento) => setDataInicio(evento.target.value)}
              />
            </div>
            <div>
              <label htmlFor="milk-end">Data final</label>
              <input
                id="milk-end"
                type="date"
                value={dataFim}
                onChange={(evento) => setDataFim(evento.target.value)}
              />
            </div>
            <button type="submit">Aplicar intervalo</button>
          </form>

          {carregandoHistorico && (
            <p role="status">Carregando histórico de produção...</p>
          )}
          {!carregandoHistorico && producoesPorDia.length === 0 && (
            <div className="empty-state">
              <p>Nenhuma produção encontrada para o período.</p>
            </div>
          )}

          <div hidden={carregandoHistorico} className="milk-days-list">
            {producoesPorDia.map((grupo) => (
              <article className="panel milk-day-card" key={grupo.data}>
                <header>
                  <div>
                    <span className="eyebrow">Data da ordenha</span>
                    <h3>{formatarDataSemFuso(grupo.data)}</h3>
                  </div>
                  <div className="milk-day-total">
                    <span>Total do dia</span>
                    <strong>{formatarLitros(grupo.total)}</strong>
                  </div>
                </header>
                <div className="milk-records-list">
                  {grupo.itens.map((producao) => (
                    <div className="milk-record-row" key={producao.id}>
                      <div>
                        <strong>
                          {ROTULOS_TURNO[producao.turno] || producao.turno}
                        </strong>
                        <span>
                          {formatarLitros(producao.quantidade_litros)}
                        </span>
                      </div>
                      <p>{producao.observacao || "Sem observação"}</p>
                      <div className="record-actions">
                        <button
                          disabled={processando}
                          className="button-secondary button-small"
                          type="button"
                          onClick={() => editarProducao(producao)}
                        >
                          Editar
                        </button>
                        <button
                          disabled={processando}
                          className="button-danger button-small"
                          type="button"
                          onClick={() => excluirProducao(producao.id)}
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}
export default ControleLeiteiro;
