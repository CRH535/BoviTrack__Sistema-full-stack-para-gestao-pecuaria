import Button from "./ui/Button";
import { useEffect, useState } from "react";
import ConfirmacaoExclusao from "./ConfirmacaoExclusao";
import GraficoPeso from "./GraficoPeso";
import api from "../services/api";
import { formatarDataSemFuso, obterDataAtualLocal } from "../utils/datas";

const TIPOS = [
  ["NASCIMENTO", "Nascimento"], ["ROTINA", "Rotina"],
  ["PRE_DESMAMA", "Pré-desmama"], ["DESMAMA", "Desmama"],
  ["POS_DESMAMA", "Pós-desmama"], ["SOBREANO", "Sobreano"], ["OUTRA", "Outra"],
];
const METODOS = [
  ["BALANCA", "Balança"], ["FITA", "Fita de pesagem"],
  ["ESTIMATIVA", "Estimativa"], ["OUTRO", "Outro"],
];
const ROTULOS = Object.fromEntries([...TIPOS, ...METODOS]);
const RESUMO_VAZIO = {
  peso_atual: null, peso_nascimento: null, peso_desmama: null,
  variacao_recente: null, gmd_recente: null, gmd_desde_nascimento: null,
  gmd_nascimento_desmama: null, gmd_pos_desmama: null, p205: null,
};

function kg(valor, casas = 1) {
  return valor === null || valor === undefined
    ? "Dados insuficientes"
    : `${Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: 2 })} kg`;
}

function gmd(valor) {
  return valor === null || valor === undefined
    ? "Dados insuficientes"
    : `${Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg/dia`;
}

function ControlePesagens({ animal, onAtualizarAnimal, refreshKey = 0 }) {
  const [pesagens, setPesagens] = useState([]);
  const [resumo, setResumo] = useState(RESUMO_VAZIO);
  const [evolucao, setEvolucao] = useState([]);
  const [comparacoes, setComparacoes] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [formulario, setFormulario] = useState(false);
  const [editando, setEditando] = useState(null);
  const [excluir, setExcluir] = useState(null);
  const [processando, setProcessando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [tentativa, setTentativa] = useState(0);
  const [dados, setDados] = useState({
    data_pesagem: obterDataAtualLocal(), peso_kg: "", tipo_pesagem: "ROTINA",
    metodo: "BALANCA", lote_id: "", observacao: "",
  });

  async function carregar() {
    const [historico, indicadores, lotesResposta] = await Promise.all([
      api.getAll(`/animais/${animal.id}/pesagens`),
      api.get(`/animais/${animal.id}/pesagens/resumo`),
      api.getAll("/lotes"),
    ]);
    setPesagens(historico.data);
    setResumo(indicadores.data.resumo);
    setEvolucao(indicadores.data.evolucao);
    setComparacoes(indicadores.data.comparacao_lotes);
    setLotes(lotesResposta.data.filter((lote) => Number(lote.propriedade_id) === Number(animal.propriedade_id)));
  }

  useEffect(() => {
    let ativo = true;
    async function carregarInicial() {
      try {
        const [historico, indicadores, lotesResposta] = await Promise.all([
          api.getAll(`/animais/${animal.id}/pesagens`),
          api.get(`/animais/${animal.id}/pesagens/resumo`),
          api.getAll("/lotes"),
        ]);
        if (!ativo) return;
        setPesagens(historico.data);
        setResumo(indicadores.data.resumo);
        setEvolucao(indicadores.data.evolucao);
        setComparacoes(indicadores.data.comparacao_lotes);
        setLotes(lotesResposta.data.filter((lote) => Number(lote.propriedade_id) === Number(animal.propriedade_id)));
      } catch (falha) {
        if (ativo) setErro(falha.response?.data?.mensagem || "Não foi possível carregar as pesagens.");
      } finally {
        if (ativo) setCarregando(false);
      }
    }
    carregarInicial();
    return () => { ativo = false; };
  }, [animal.id, animal.propriedade_id, refreshKey, tentativa]);

  function alterar(campo, valor) {
    setDados((atual) => ({ ...atual, [campo]: valor }));
  }

  function novo() {
    setEditando(null);
    setDados({ data_pesagem: obterDataAtualLocal(), peso_kg: "", tipo_pesagem: "ROTINA", metodo: "BALANCA", lote_id: "", observacao: "" });
    setFormulario(true);
    setErro("");
  }

  function editar(item) {
    setEditando(item.id);
    setDados({
      data_pesagem: String(item.data_pesagem).slice(0, 10),
      peso_kg: item.peso_kg,
      tipo_pesagem: item.tipo_pesagem,
      metodo: item.metodo || "",
      lote_id: item.lote_id || "",
      observacao: item.observacao || "",
    });
    setFormulario(true);
  }

  async function salvar(evento) {
    evento.preventDefault(); if (processando) return;
    if (!dados.data_pesagem || !dados.tipo_pesagem || Number(dados.peso_kg) <= 0) {
      setErro("Informe data, tipo e peso maior que zero.");
      return;
    }
    setProcessando(true); setErro(""); setMensagem("");
    const corpo = { ...dados, peso_kg: Number(dados.peso_kg), lote_id: dados.lote_id ? Number(dados.lote_id) : null, observacao: dados.observacao.trim() || null };
    try {
      if (editando) await api.put(`/pesagens/${editando}`, corpo);
      else await api.post(`/animais/${animal.id}/pesagens`, corpo);
      setMensagem(editando ? "Pesagem atualizada com sucesso." : "Pesagem registrada com sucesso.");
      setFormulario(false); setEditando(null);
      await Promise.all([carregar(), onAtualizarAnimal?.()]);
    } catch (falha) {
      setErro(falha.response?.data?.mensagem || "Não foi possível salvar a pesagem.");
    } finally { setProcessando(false); }
  }

  async function confirmarExclusao() {
    setProcessando(true); setErro("");
    try {
      await api.delete(`/pesagens/${excluir.id}`);
      setMensagem("Pesagem excluída com sucesso."); setExcluir(null);
      await Promise.all([carregar(), onAtualizarAnimal?.()]);
    } catch (falha) {
      setErro(falha.response?.data?.mensagem || "Não foi possível excluir a pesagem.");
    } finally { setProcessando(false); }
  }

  return (
    <section className="management-section weighing-section">
      <div className="section-heading management-heading">
        <div><span className="eyebrow">Crescimento individual</span><h2>Pesagens e desempenho</h2></div>
        <Button startIcon="pesagem" disabled={processando || carregando} type="button" onClick={novo}>{pesagens.length ? "Nova pesagem" : "Registrar primeira pesagem"}</Button>
      </div>
      {carregando && <p role="status">Carregando manejo do animal...</p>}
      {mensagem && <p className="notice" role="status">{mensagem}</p>}
      {erro && <div className="notice notice-error" role="alert">{erro} <Button startIcon="atualizar" type="button" onClick={() => { setErro(""); setCarregando(true); setTentativa((atual) => atual + 1); }}>Tentar novamente</Button></div>}

      {formulario && (
        <form className="panel data-form management-form" onSubmit={salvar}><fieldset className="form-fields" disabled={processando || carregando}>
          <div className="management-form-title"><h3>{editando ? "Editar pesagem" : "Nova pesagem"}</h3><p>Animal: {animal.nome}</p></div>
          <div><label htmlFor="controlepesagens-campo-1">Data da pesagem</label><input id="controlepesagens-campo-1" type="date" required value={dados.data_pesagem} onChange={(e) => alterar("data_pesagem", e.target.value)} /></div>
          <div><label htmlFor="controlepesagens-campo-2">Peso (kg)</label><input id="controlepesagens-campo-2" type="number" min="0.01" max="99999999.99" step="0.01" required value={dados.peso_kg} onChange={(e) => alterar("peso_kg", e.target.value)} /></div>
          <div><label htmlFor="controlepesagens-campo-3">Tipo</label><select id="controlepesagens-campo-3" required value={dados.tipo_pesagem} onChange={(e) => alterar("tipo_pesagem", e.target.value)}>{TIPOS.map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}</select></div>
          <div><label htmlFor="controlepesagens-campo-4">Método</label><select id="controlepesagens-campo-4" value={dados.metodo} onChange={(e) => alterar("metodo", e.target.value)}><option value="">Não informado</option>{METODOS.map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}</select></div>
          <div><label htmlFor="controlepesagens-campo-5">Lote na pesagem</label><select id="controlepesagens-campo-5" value={dados.lote_id} onChange={(e) => alterar("lote_id", e.target.value)}><option value="">Não informado</option>{lotes.map((lote) => <option key={lote.id} value={lote.id}>{lote.nome}</option>)}</select></div>
          <div className="management-wide-field"><label htmlFor="controlepesagens-campo-6">Observações</label><textarea id="controlepesagens-campo-6" maxLength="500" value={dados.observacao} onChange={(e) => alterar("observacao", e.target.value)} /></div>
          <div className="form-actions management-form-actions"><Button startIcon="salvar" loading={processando} disabled={processando || carregando} type="submit">{processando ? "Salvando..." : "Salvar pesagem"}</Button><Button startIcon="fechar" disabled={processando || carregando} className="button-secondary" type="button" onClick={() => setFormulario(false)}>Cancelar</Button></div>
        </fieldset></form>
      )}

      <div hidden={carregando || Boolean(erro)} className="performance-grid">
        <article className="stat-card"><div><span>Peso ao nascer</span><strong>{kg(resumo.peso_nascimento)}</strong><small>Somente pesagem do tipo Nascimento</small></div></article>
        <article className="stat-card"><div><span>Peso atual</span><strong>{kg(resumo.peso_atual)}</strong><small>{resumo.ultima_pesagem ? `Em ${formatarDataSemFuso(resumo.ultima_pesagem.data_pesagem)}` : "Cadastro legado"}</small></div></article>
        <article className="stat-card"><div><span>Variação recente</span><strong>{resumo.variacao_recente == null ? "Dados insuficientes" : `${resumo.variacao_recente >= 0 ? "+" : ""}${kg(resumo.variacao_recente)}`}</strong><small>Entre as duas últimas pesagens</small></div></article>
        <article className="stat-card"><div><span>GMD recente</span><strong>{gmd(resumo.gmd_recente)}</strong><small>Entre as duas últimas pesagens</small></div></article>
        <article className="stat-card"><div><span>GMD desde nascimento</span><strong>{gmd(resumo.gmd_desde_nascimento)}</strong><small>Exige pesagem Nascimento</small></div></article>
        <article className="stat-card"><div><span>GMD até a desmama</span><strong>{gmd(resumo.gmd_nascimento_desmama)}</strong><small>Nascimento → desmama</small></div></article>
        <article className="stat-card"><div><span>GMD pós-desmama</span><strong>{gmd(resumo.gmd_pos_desmama)}</strong><small>Desmama → última pós-desmama</small></div></article>
        <article className="stat-card"><div><span>P205</span><strong>{kg(resumo.p205)}</strong><small>Peso ajustado aos 205 dias</small></div></article>
      </div>

      <section hidden={carregando || Boolean(erro)} className="panel growth-chart-panel"><div className="panel-heading"><div><span className="eyebrow">Peso × tempo</span><h3>Evolução do peso</h3></div></div><GraficoPeso dados={evolucao} dataNascimento={animal.data_nascimento} /></section>

      {comparacoes.map((item) => (
        <p className="notice comparison-notice" key={item.lote_id}>No lote <strong>{item.lote}</strong>: peso médio {kg(item.peso_medio)}; diferença do animal {item.diferenca_kg >= 0 ? "+" : ""}{kg(item.diferenca_kg)} ({item.animais_com_pesagem} animais com pesagem).</p>
      ))}

      <section className="history-section">
        <div className="section-heading"><div><span className="eyebrow">Registros</span><h3>Histórico de pesagens</h3></div><span className="count-badge">{pesagens.length}</span></div>
        {!carregando && !erro && !pesagens.length && <div className="empty-state"><p>Nenhuma pesagem registrada ainda.</p></div>}
        <div hidden={carregando || Boolean(erro)} className="management-list">
          {pesagens.map((item) => (
            <article className="panel management-record" key={item.id}>
              <div><span className="eyebrow">{formatarDataSemFuso(item.data_pesagem)}</span><strong>{kg(item.peso_kg)}</strong></div>
              <div><strong>{ROTULOS[item.tipo_pesagem] || item.tipo_pesagem}</strong><span>{item.metodo ? ROTULOS[item.metodo] : "Método não informado"}{item.lote ? ` • ${item.lote}` : ""}</span></div>
              <div><strong>Variação</strong><span>{item.variacao_kg == null ? "—" : `${item.variacao_kg >= 0 ? "+" : ""}${kg(item.variacao_kg)}`}</span></div>
              <p>{item.observacao || "Sem observações"}</p>
              <div className="record-actions"><Button startIcon="editar" disabled={processando || carregando} className="button-secondary button-small" type="button" onClick={() => editar(item)}>Editar</Button><Button startIcon="excluir" disabled={processando || carregando} className="button-danger button-small" type="button" onClick={() => setExcluir(item)}>Excluir</Button></div>
            </article>
          ))}
        </div>
      </section>
      <ConfirmacaoExclusao aberto={Boolean(excluir)} titulo="Excluir pesagem?" mensagem="A pesagem será removida do histórico e os indicadores serão recalculados. Esta ação não poderá ser desfeita." processando={processando} onCancelar={() => setExcluir(null)} onConfirmar={confirmarExclusao} />
    </section>
  );
}

export default ControlePesagens;
