import { Link } from "react-router-dom";
import PainelFinanceiro from "../components/financas/PainelFinanceiro";
import Lancamentos from "../components/financas/Lancamentos";
import { filtrarDespesas } from "../utils/financas";
import FormularioCadastro from "../components/ui/FormularioCadastro";
import { useEffect, useMemo, useState } from "react";
import ConfirmacaoExclusao from "../components/ConfirmacaoExclusao";
import IconeImagem from "../components/IconeImagem";

import api from "../services/api";

const CATEGORIAS_SUGERIDAS = [
  "Venda de animais",
  "Venda de leite",
  "Venda de bezerros",
  "Venda de matrizes",
  "Venda de reprodutores",
  "Venda de outros produtos",
  "Outros",
];

const FORMAS_RECEBIMENTO = [
  "Pix",
  "Dinheiro",
  "Transferência",
  "Boleto",
  "Cartão",
  "Outro",
];
const RESUMO_INICIAL = {
  receita_total: 0,
  despesas_totais: 0,
  lucro_liquido: 0,
};
const FILTROS_INICIAIS = {
  propriedade_id: "",
  periodo: "mes",
  categoria: "",
  data_inicio: "",
  data_fim: "",
};

function Lucros() {
  const [receitas, setReceitas] = useState([]);
  const [despesas, setDespesas] = useState();
  const [propriedades, setPropriedades] = useState([]);
  const [resumo, setResumo] = useState(RESUMO_INICIAL);
  const [formulario, setFormulario] = useState({
    descricao: "",
    categoria: "",
    valor: "",
    data: "",
    propriedade_id: "",
    forma_recebimento: "",
    observacao: "",
  });
  const [filtros, setFiltros] = useState(FILTROS_INICIAIS);
  const [filtrosAplicados, setFiltrosAplicados] = useState(FILTROS_INICIAIS);
  const [editandoId, setEditandoId] = useState(null);
  const [receitaParaExcluir, setReceitaParaExcluir] = useState(null);
  const [processandoExclusao, setProcessandoExclusao] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const parametrosAtuais = useMemo(() => {
    const parametros = {
      periodo: filtrosAplicados.periodo,
    };
    if (filtrosAplicados.propriedade_id) {
      parametros.propriedade_id = filtrosAplicados.propriedade_id;
    }
    if (filtrosAplicados.categoria) {
      parametros.categoria = filtrosAplicados.categoria;
    }
    if (filtrosAplicados.periodo === "personalizado") {
      parametros.data_inicio = filtrosAplicados.data_inicio;
      parametros.data_fim = filtrosAplicados.data_fim;
    }
    return parametros;
  }, [filtrosAplicados]);

  useEffect(() => {
    let ativo = true;
    async function carregarDados() {
      try {
        const [lista, totais] = await Promise.all([
          api.getAll("/receitas", { params: parametrosAtuais }),
          api.get("/receitas/resumo", { params: parametrosAtuais }),
        ]);
        if (!ativo) return;
        setReceitas(lista.data);
        setResumo(totais.data);
        setErro("");
      } catch (falha) {
        if (!ativo) return;
        console.error("Falha em uma operação de receitas");
        setErro(falha.response?.data?.mensagem || "Erro ao carregar receitas");
      } finally {
        if (ativo) setCarregando(false);
      }
    }
    carregarDados();
    return () => {
      ativo = false;
    };
  }, [parametrosAtuais, refreshKey]);

  useEffect(() => {
    let ativo = true;
    api
      .getAll("/propriedades")
      .then((resposta) => {
        if (ativo) setPropriedades(resposta.data);
      })
      .catch(() => {
        if (ativo) setErro("Erro ao carregar propriedades");
      });
    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getAll("/despesas", { signal: controller.signal })
      .then((r) => {
        if (!controller.signal.aborted) setDespesas(r.data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setDespesas(null);
      });
    return () => controller.abort();
  }, [refreshKey]);
  const despesasFiltradas = useMemo(
    () => (despesas ? filtrarDespesas(despesas, filtrosAplicados) : despesas),
    [despesas, filtrosAplicados],
  );

  const categoriasDisponiveis = useMemo(
    () =>
      Array.from(
        new Set([
          ...CATEGORIAS_SUGERIDAS,
          ...receitas.map((receita) => receita.categoria).filter(Boolean),
        ]),
      ),
    [receitas],
  );

  function alterarFormulario(campo, valor) {
    setFormulario((atual) => ({ ...atual, [campo]: valor }));
  }

  function limparFormulario() {
    setFormulario({
      descricao: "",
      categoria: "",
      valor: "",
      data: "",
      propriedade_id: "",
      forma_recebimento: "",
      observacao: "",
    });
    setEditandoId(null);
  }

  async function salvarReceita(evento) {
    evento.preventDefault();
    if (salvando || processandoExclusao) return;
    setSalvando(true);
    setMensagem("");
    setErro("");
    const dados = {
      ...formulario,
      valor: Number(formulario.valor),
      propriedade_id: Number(formulario.propriedade_id),
    };

    try {
      if (editandoId) {
        await api.put(`/receitas/${editandoId}`, dados);
        setMensagem("Receita atualizada com sucesso!");
      } else {
        await api.post("/receitas", dados);
        setMensagem("Receita cadastrada com sucesso!");
      }
      limparFormulario();
      setCarregando(true);
      setRefreshKey((atual) => atual + 1);
    } catch (falha) {
      console.error("Falha em uma operação de receitas");
      setErro(falha.response?.data?.mensagem || "Erro ao salvar receita");
    } finally {
      setSalvando(false);
    }
  }

  function editarReceita(receita) {
    setEditandoId(receita.id);
    setFormulario({
      descricao: receita.descricao,
      categoria: receita.categoria,
      valor: receita.valor,
      data: String(receita.data || "").slice(0, 10),
      propriedade_id: String(receita.propriedade_id),
      forma_recebimento: receita.forma_recebimento || "",
      observacao: receita.observacao || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function excluirReceita() {
    if (!receitaParaExcluir) return;
    setProcessandoExclusao(true);
    try {
      await api.delete(`/receitas/${receitaParaExcluir.id}`);
      setReceitaParaExcluir(null);
      setMensagem("Receita excluída com sucesso!");
      setErro("");
      setRefreshKey((atual) => atual + 1);
    } catch (falha) {
      console.error("Falha em uma operação de receitas");
      setErro(falha.response?.data?.mensagem || "Erro ao excluir receita");
    } finally {
      setProcessandoExclusao(false);
    }
  }

  function aplicarFiltros(evento) {
    evento.preventDefault();
    setMensagem("");
    if (
      filtros.periodo === "personalizado" &&
      filtros.data_inicio > filtros.data_fim
    ) {
      setErro("A data inicial não pode ser posterior à data final.");
      return;
    }
    setCarregando(true);
    setFiltrosAplicados({ ...filtros });
  }

  return (
    <div className="page profits-page">
      <header className="page-header" data-tour="lucros">
        <div>
          <span className="eyebrow">Resultado financeiro</span>
          <h1 className="icon-title">
            <IconeImagem nome="producao" className="title-icon-image" />
            Produção e resultados
          </h1>
          <p>
            Registre receitas e acompanhe o resultado da atividade pecuária.
          </p>
        </div>
        <div className="page-header-actions">
          <Link className="button-link button-primary" to="/producao">
            Registrar produção
          </Link>
          <Link className="button-link" to="/despesas?novo=1">
            Nova despesa
          </Link>
        </div>
      </header>

      {mensagem && (
        <p className="notice" role="status">
          {mensagem}
        </p>
      )}
      {erro && (
        <div className="notice notice-error" role="alert">
          {erro}{" "}
          <button
            type="button"
            onClick={() => {
              setErro("");
              setCarregando(true);
              setRefreshKey((atual) => atual + 1);
            }}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {carregando && (
        <p role="status">Carregando receitas e resumo financeiro...</p>
      )}
      <form
        className="panel management-filters revenue-filters"
        onSubmit={aplicarFiltros}
      >
        <div>
          <label htmlFor="filtro-receita-propriedade">Propriedade</label>
          <select
            id="filtro-receita-propriedade"
            value={filtros.propriedade_id}
            onChange={(e) =>
              setFiltros((atual) => ({
                ...atual,
                propriedade_id: e.target.value,
              }))
            }
          >
            <option value="">Todas</option>
            {propriedades.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filtro-receita-periodo">Período</label>
          <select
            id="filtro-receita-periodo"
            value={filtros.periodo}
            onChange={(e) =>
              setFiltros((atual) => ({ ...atual, periodo: e.target.value }))
            }
          >
            <option value="hoje">Hoje</option>
            <option value="semana">Esta semana</option>
            <option value="mes">Este mês</option>
            <option value="ano">Este ano</option>
            <option value="personalizado">Período personalizado</option>
            <option value="todos">Todos</option>
          </select>
        </div>
        <div>
          <label htmlFor="filtro-receita-categoria">Categoria</label>
          <select
            id="filtro-receita-categoria"
            value={filtros.categoria}
            onChange={(e) =>
              setFiltros((atual) => ({ ...atual, categoria: e.target.value }))
            }
          >
            <option value="">Todas</option>
            {categoriasDisponiveis.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        {filtros.periodo === "personalizado" && (
          <>
            <div>
              <label htmlFor="filtro-receita-inicio">Data inicial</label>
              <input
                id="filtro-receita-inicio"
                type="date"
                required
                value={filtros.data_inicio}
                onChange={(e) =>
                  setFiltros((atual) => ({
                    ...atual,
                    data_inicio: e.target.value,
                  }))
                }
              />
            </div>
            <div>
              <label htmlFor="filtro-receita-fim">Data final</label>
              <input
                id="filtro-receita-fim"
                type="date"
                required
                value={filtros.data_fim}
                onChange={(e) =>
                  setFiltros((atual) => ({
                    ...atual,
                    data_fim: e.target.value,
                  }))
                }
              />
            </div>
          </>
        )}
        <button type="submit">Aplicar filtros</button>
      </form>
      {!carregando && !erro && (
        <PainelFinanceiro
          resumo={resumo}
          receitas={receitas}
          despesas={despesasFiltradas}
          categoria={filtrosAplicados.categoria}
        />
      )}

      <FormularioCadastro titulo="Nova receita" editando={editandoId}>
        <form className="panel data-form revenue-form" onSubmit={salvarReceita}>
          <fieldset
            className="form-fields"
            disabled={salvando || processandoExclusao || carregando}
          >
            <div>
              <label htmlFor="receita-descricao">Descrição</label>
              <input
                id="receita-descricao"
                maxLength="150"
                required
                value={formulario.descricao}
                onChange={(e) => alterarFormulario("descricao", e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="receita-categoria">Categoria</label>
              <input
                id="receita-categoria"
                list="categorias-receita"
                maxLength="100"
                required
                value={formulario.categoria}
                onChange={(e) => alterarFormulario("categoria", e.target.value)}
                placeholder="Selecione ou digite"
              />
              <datalist id="categorias-receita">
                {CATEGORIAS_SUGERIDAS.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </div>
            <div>
              <label htmlFor="receita-valor">Valor</label>
              <input
                id="receita-valor"
                type="number"
                min="0.01"
                max="999999999999.99"
                step="0.01"
                required
                value={formulario.valor}
                onChange={(e) => alterarFormulario("valor", e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="receita-data">Data</label>
              <input
                id="receita-data"
                type="date"
                required
                value={formulario.data}
                onChange={(e) => alterarFormulario("data", e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="receita-propriedade">Propriedade</label>
              <select
                id="receita-propriedade"
                required
                value={formulario.propriedade_id}
                onChange={(e) =>
                  alterarFormulario("propriedade_id", e.target.value)
                }
              >
                <option value="">Selecione</option>
                {propriedades.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="receita-forma">Forma de recebimento</label>
              <input
                id="receita-forma"
                list="formas-recebimento"
                maxLength="100"
                value={formulario.forma_recebimento}
                onChange={(e) =>
                  alterarFormulario("forma_recebimento", e.target.value)
                }
                placeholder="Ex.: Pix ou dinheiro"
              />
              <datalist id="formas-recebimento">
                {FORMAS_RECEBIMENTO.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </div>
            <div className="revenue-observation-field">
              <label htmlFor="receita-observacao">Observação (opcional)</label>
              <textarea
                id="receita-observacao"
                maxLength="500"
                value={formulario.observacao}
                onChange={(e) =>
                  alterarFormulario("observacao", e.target.value)
                }
              />
            </div>
            <div className="form-actions revenue-form-actions">
              <button type="submit">
                {salvando
                  ? "Salvando..."
                  : editandoId
                    ? "Salvar alterações"
                    : "Cadastrar receita"}
              </button>
              {editandoId && (
                <button
                  className="button-secondary"
                  type="button"
                  onClick={limparFormulario}
                >
                  Cancelar
                </button>
              )}
            </div>
          </fieldset>
        </form>
      </FormularioCadastro>

      {!carregando && !erro && (
        <Lancamentos
          receitas={receitas}
          despesas={despesasFiltradas}
          onEditar={editarReceita}
          onExcluir={setReceitaParaExcluir}
          processando={salvando || processandoExclusao}
        />
      )}

      <ConfirmacaoExclusao
        aberto={Boolean(receitaParaExcluir)}
        titulo="Excluir receita"
        mensagem="Tem certeza que deseja excluir esta receita? Esta ação não poderá ser desfeita."
        processando={processandoExclusao}
        onCancelar={() => setReceitaParaExcluir(null)}
        onConfirmar={excluirReceita}
      />
    </div>
  );
}

export default Lucros;
