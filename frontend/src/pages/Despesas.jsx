import { useEffect, useState } from "react";
import api from "../services/api";
import IconeImagem from "../components/IconeImagem";
import VoltarInicio from "../components/VoltarInicio";

function formatarDataSemFuso(data) {
  if (!data) return "-";

  const dataIso = String(data).slice(0, 10);
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataIso);

  if (!partes) return "-";

  return `${partes[3]}/${partes[2]}/${partes[1]}`;
}

function Despesas() {
  const [despesas, setDespesas] = useState([]);
  const [propriedades, setPropriedades] = useState([]);

  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState("");
  const [propriedadeId, setPropriedadeId] = useState("");

  const [editandoId, setEditandoId] = useState(null);
  const [mensagem, setMensagem] = useState("");
  const [processando, setProcessando] = useState(false);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [erroLista, setErroLista] = useState(false);

  useEffect(() => {
    carregarDespesas();
    carregarPropriedades();
  }, []);

  async function carregarDespesas() {
    setCarregandoLista(true);
    setErroLista(false);
    try {
      const resposta = await api.getAll("/despesas");
      setDespesas(resposta.data);
    } catch {
      setErroLista(true);
      console.error("Falha em uma operação de despesas");
      setMensagem("Erro ao carregar despesas");
    } finally {
      setCarregandoLista(false);
    }
  }

  async function carregarPropriedades() {
    try {
      const resposta = await api.getAll("/propriedades");
      setPropriedades(resposta.data);
    } catch {
      console.error("Falha em uma operação de despesas");
    }
  }

  function limparFormulario() {
    setDescricao("");
    setCategoria("");
    setFormaPagamento("");
    setValor("");
    setData("");
    setPropriedadeId("");
    setEditandoId(null);
  }

  async function salvarDespesa(evento) {
    evento.preventDefault();

    if (processando) return;
    setProcessando(true);
    try {
      const dados = {
        descricao,
        categoria,
        forma_pagamento: formaPagamento,
        valor: Number(valor),
        data,
        propriedade_id: Number(propriedadeId),
      };

      if (editandoId) {
        await api.put(`/despesas/${editandoId}`, dados);
        setMensagem("Despesa atualizada com sucesso!");
      } else {
        await api.post("/despesas", dados);
        setMensagem("Despesa cadastrada com sucesso!");
      }

      limparFormulario();
      carregarDespesas();
    } catch (erro) {
      console.error("Falha em uma operação de despesas");

      setMensagem(erro.response?.data?.mensagem || "Erro ao salvar despesa");
    } finally {
      setProcessando(false);
    }
  }

  function editarDespesa(despesa) {
    setEditandoId(despesa.id);
    setDescricao(despesa.descricao);
    setCategoria(despesa.categoria);
    setFormaPagamento(despesa.forma_pagamento || "");
    setValor(despesa.valor);
    setData(despesa.data ? despesa.data.substring(0, 10) : "");
    setPropriedadeId(despesa.propriedade_id);
  }

  async function excluirDespesa(id) {
    const confirmar = window.confirm(
      "Tem certeza que deseja excluir esta despesa?",
    );

    if (!confirmar) return;

    if (processando) return;
    setProcessando(true);
    try {
      await api.delete(`/despesas/${id}`);

      setDespesas((despesasAtuais) =>
        despesasAtuais.filter((despesa) => despesa.id !== id),
      );

      setMensagem("Despesa excluída com sucesso!");
    } catch (erro) {
      console.error("Falha em uma operação de despesas");

      setMensagem(erro.response?.data?.mensagem || "Erro ao excluir despesa");
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header" data-tour="despesas">
        <div>
          <span className="eyebrow">Controle financeiro</span>
          <h1>Despesas</h1>
          <p>Acompanhe os custos do manejo e da sua produção pecuária.</p>
        </div>
        <VoltarInicio />
      </header>

      {processando && <p role="status">Salvando registros...</p>}
      {mensagem && <p className="notice" role="status">{mensagem}</p>}

      <form className="panel data-form" onSubmit={salvarDespesa}>
        <fieldset className="form-fields" disabled={processando || carregandoLista}>
        <div>
          <label htmlFor="despesas-campo-1">Descrição</label>
          <br />

          <input id="despesas-campo-1" required
            type="text"
            value={descricao}
            maxLength="150"
            onChange={(e) => setDescricao(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="despesas-campo-2">Categoria</label>
          <br />

          <input id="despesas-campo-2" required
            type="text"
            value={categoria}
            maxLength="100"
            onChange={(e) => setCategoria(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="despesas-campo-3">Forma de pagamento</label>
          <br />

          <input id="despesas-campo-3"
            type="text"
            maxLength="100"
            value={formaPagamento}
            onChange={(e) => setFormaPagamento(e.target.value)}
            placeholder="Ex.: Pix, dinheiro, cartão..."
          />
        </div>

        <div>
          <label htmlFor="despesas-campo-4">Valor</label>
          <br />

          <input id="despesas-campo-4" required
            type="number"
            min="0.01" max="99999999.99" step="0.01"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="despesas-campo-5">Data</label>
          <br />

          <input id="despesas-campo-5" required
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="despesas-campo-6">Propriedade</label>
          <br />

          <select id="despesas-campo-6" required
            value={propriedadeId}
            onChange={(e) => setPropriedadeId(e.target.value)}
          >
            <option value="">Selecione</option>

            {propriedades.map((propriedade) => (
              <option key={propriedade.id} value={propriedade.id}>
                {propriedade.nome}
              </option>
            ))}
          </select>
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
      {erroLista && <div className="notice notice-error" role="alert">Não foi possível carregar os registros. <button disabled={processando} type="button" onClick={carregarDespesas}>Tentar novamente</button></div>}

      <div className="section-heading">
        <div><span className="eyebrow">Histórico</span><h2>Despesas cadastradas</h2></div>
        <span className="count-badge">{carregandoLista || erroLista ? "—" : despesas.length}</span>
      </div>

      {!carregandoLista && !erroLista && despesas.length === 0 && <div className="empty-state"><p>Nenhuma despesa cadastrada.</p></div>}

      <div hidden={carregandoLista || erroLista} className="record-grid expense-grid">
      {despesas.map((despesa) => (
        <article className="record-card expense-card" key={despesa.id}>
          <span className="record-icon" aria-hidden="true">
            <IconeImagem nome="despesas" className="record-icon-image" />
          </span>
          <span className="tag-badge">{despesa.categoria}</span>
          <h3>{despesa.descricao}</h3>

          <p>
            Forma de pagamento: {despesa.forma_pagamento || "Não informada"}
          </p>

          <strong className="expense-value">R$ {Number(despesa.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>

          <p>Data: {formatarDataSemFuso(despesa.data)}</p>

          <p>Propriedade: {despesa.propriedade || despesa.propriedade_id}</p>

          <div className="record-actions">
          <button disabled={processando} className="button-secondary" type="button" onClick={() => editarDespesa(despesa)}>
            Editar
          </button>

          <button disabled={processando} className="button-danger" type="button" onClick={() => excluirDespesa(despesa.id)}>
            Excluir
          </button>
          </div>
        </article>
      ))}
      </div>
    </div>
  );
}

export default Despesas;
