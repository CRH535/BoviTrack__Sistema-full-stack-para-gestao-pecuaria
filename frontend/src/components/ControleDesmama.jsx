import Button from "./ui/Button";
import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import { calcularDiasEntreDatas, formatarDataSemFuso, obterDataAtualLocal } from "../utils/datas";

const TIPOS = [
  ["CONVENCIONAL", "Convencional"], ["LADO_A_LADO", "Racional / lado a lado"],
  ["ABRUPTA", "Abrupta"], ["PRECOCE", "Precoce"],
  ["TEMPORARIA", "Temporária / interrompida"], ["CONTROLADA", "Controlada"], ["OUTRA", "Outra"],
];
const STATUS = { PLANEJADA: "Planejada", EM_ANDAMENTO: "Em andamento", CONCLUIDA: "Concluída", CANCELADA: "Cancelada" };
const ROTULOS_TIPO = Object.fromEntries(TIPOS);

function ControleDesmama({ animal, onPesagemCriada }) {
  const [eventos, setEventos] = useState([]);
  const [statusAtual, setStatusAtual] = useState("NAO_DESMAMADO");
  const [alertas, setAlertas] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [maes, setMaes] = useState([]);
  const [formulario, setFormulario] = useState(false);
  const [conclusao, setConclusao] = useState(null);
  const [editando, setEditando] = useState(null);
  const [processando, setProcessando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [tentativa, setTentativa] = useState(0);
  const [dados, setDados] = useState({ data_planejada: obterDataAtualLocal(), tipo_desmama: "CONVENCIONAL", mae_id: animal.mae_id || "", lote_destino_id: "", status: "PLANEJADA", data_inicio: "", data_fim: "", suplementacao: "", observacao: "" });
  const [dadosConclusao, setDadosConclusao] = useState({ data_desmama: obterDataAtualLocal(), data_fim: obterDataAtualLocal(), peso_kg: "", metodo: "BALANCA", lote_destino_id: "", observacao: "" });

  async function carregar() {
    const [desmamas, lotesResposta, animaisResposta] = await Promise.all([
      api.getAllNested(`/animais/${animal.id}/desmamas`, "eventos"), api.getAll("/lotes"), api.getAll("/animais"),
    ]);
    setEventos(desmamas.data.eventos);
    setStatusAtual(desmamas.data.status_atual);
    setAlertas(desmamas.data.alertas || []);
    setLotes(lotesResposta.data.filter((lote) => Number(lote.propriedade_id) === Number(animal.propriedade_id)));
    setMaes(animaisResposta.data.filter((item) => item.sexo === "F" && item.id !== animal.id && Number(item.propriedade_id) === Number(animal.propriedade_id)));
  }

  useEffect(() => {
    let ativo = true;
    async function carregarInicial() {
      try {
        const [desmamas, lotesResposta, animaisResposta] = await Promise.all([
          api.getAllNested(`/animais/${animal.id}/desmamas`, "eventos"), api.getAll("/lotes"), api.getAll("/animais"),
        ]);
        if (!ativo) return;
        setEventos(desmamas.data.eventos);
        setStatusAtual(desmamas.data.status_atual);
        setAlertas(desmamas.data.alertas || []);
        setLotes(lotesResposta.data.filter((lote) => Number(lote.propriedade_id) === Number(animal.propriedade_id)));
        setMaes(animaisResposta.data.filter((item) => item.sexo === "F" && item.id !== animal.id && Number(item.propriedade_id) === Number(animal.propriedade_id)));
      } catch (falha) {
        if (ativo) setErro(falha.response?.data?.mensagem || "Não foi possível carregar o controle de desmama.");
      } finally {
        if (ativo) setCarregando(false);
      }
    }
    carregarInicial();
    return () => { ativo = false; };
  }, [animal.id, animal.propriedade_id, tentativa]);

  const ativa = useMemo(() => eventos.find((item) => ["PLANEJADA", "EM_ANDAMENTO"].includes(item.status) && item.tipo_desmama !== "TEMPORARIA"), [eventos]);
  const definitiva = useMemo(() => eventos.find((item) => item.status === "CONCLUIDA" && item.tipo_desmama !== "TEMPORARIA"), [eventos]);
  const idadeAtual = animal.data_nascimento ? calcularDiasEntreDatas(animal.data_nascimento, obterDataAtualLocal()) : null;

  function alterar(campo, valor) { setDados((atual) => ({ ...atual, [campo]: valor })); }
  function alterarConclusao(campo, valor) { setDadosConclusao((atual) => ({ ...atual, [campo]: valor })); }

  function planejar() {
    setEditando(null);
    setDados({ data_planejada: obterDataAtualLocal(), tipo_desmama: "CONVENCIONAL", mae_id: animal.mae_id || "", lote_destino_id: "", status: "PLANEJADA", data_inicio: "", data_fim: "", suplementacao: "", observacao: "" });
    setFormulario(true); setErro("");
  }

  function editar(item) {
    setEditando(item.id);
    setDados({ data_planejada: String(item.data_planejada).slice(0, 10), tipo_desmama: item.tipo_desmama, mae_id: item.mae_id || "", lote_destino_id: item.lote_destino_id || "", status: item.status, data_inicio: item.data_inicio ? String(item.data_inicio).slice(0, 10) : "", data_fim: item.data_fim ? String(item.data_fim).slice(0, 10) : "", suplementacao: item.suplementacao || "", observacao: item.observacao || "" });
    setFormulario(true);
  }

  async function salvar(evento) {
    evento.preventDefault(); if (processando) return; setProcessando(true); setErro(""); setMensagem("");
    const corpo = { ...dados, mae_id: dados.mae_id ? Number(dados.mae_id) : null, lote_destino_id: dados.lote_destino_id ? Number(dados.lote_destino_id) : null, data_inicio: dados.data_inicio || null, data_fim: dados.data_fim || null, suplementacao: dados.suplementacao.trim() || null, observacao: dados.observacao.trim() || null };
    try {
      const resposta = editando ? await api.put(`/desmamas/${editando}`, corpo) : await api.post(`/animais/${animal.id}/desmamas`, corpo);
      setMensagem(editando ? "Planejamento atualizado com sucesso." : "Desmama planejada com sucesso.");
      setFormulario(false); setEditando(null);
      if (resposta.data.alertas?.length) setAlertas(resposta.data.alertas);
      await carregar();
    } catch (falha) { setErro(falha.response?.data?.mensagem || "Não foi possível salvar o planejamento."); }
    finally { setProcessando(false); }
  }

  function abrirConclusao(item) {
    setConclusao(item);
    setDadosConclusao({ data_desmama: obterDataAtualLocal(), data_fim: obterDataAtualLocal(), peso_kg: "", metodo: "BALANCA", lote_destino_id: item.lote_destino_id || "", observacao: item.observacao || "" });
  }

  async function concluir(evento) {
    evento.preventDefault(); if (processando) return; setProcessando(true); setErro("");
    try {
      const temporaria = conclusao.tipo_desmama === "TEMPORARIA";
      await api.post(`/desmamas/${conclusao.id}/concluir`, temporaria
        ? { data_fim: dadosConclusao.data_fim, lote_destino_id: dadosConclusao.lote_destino_id ? Number(dadosConclusao.lote_destino_id) : null, observacao: dadosConclusao.observacao.trim() || null }
        : { data_desmama: dadosConclusao.data_desmama, peso_kg: Number(dadosConclusao.peso_kg), metodo: dadosConclusao.metodo || null, lote_destino_id: dadosConclusao.lote_destino_id ? Number(dadosConclusao.lote_destino_id) : null, observacao: dadosConclusao.observacao.trim() || null });
      setMensagem(temporaria ? "Período temporário concluído e mantido no histórico." : "Desmama concluída; peso e lote foram atualizados.");
      setConclusao(null); await carregar(); await onPesagemCriada?.();
    } catch (falha) { setErro(falha.response?.data?.mensagem || "Não foi possível concluir a desmama."); }
    finally { setProcessando(false); }
  }

  async function cancelar(item) {
    if (!window.confirm("Cancelar este planejamento e mantê-lo no histórico?")) return;
    try { await api.post(`/desmamas/${item.id}/cancelar`); setMensagem("Planejamento cancelado."); await carregar(); }
    catch (falha) { setErro(falha.response?.data?.mensagem || "Não foi possível cancelar a desmama."); }
  }

  return (
    <section className="management-section weaning-section">
      <div className="section-heading management-heading">
        <div><span className="eyebrow">Manejo do bezerro</span><h2>Controle de desmama</h2></div>
        {!definitiva && <Button startIcon="desmama" disabled={processando || carregando} type="button" onClick={planejar}>{eventos.length ? "Novo planejamento" : "Planejar desmama"}</Button>}
      </div>
      {carregando && <p role="status">Carregando manejo do animal...</p>}
      {mensagem && <p className="notice" role="status">{mensagem}</p>}
      {erro && <div className="notice notice-error" role="alert">{erro} <Button startIcon="atualizar" type="button" onClick={() => { setErro(""); setCarregando(true); setTentativa((atual) => atual + 1); }}>Tentar novamente</Button></div>}
      {alertas.map((alerta, indice) => <p className="notice notice-warning" key={`${alerta.id}-${indice}`}>{alerta.mensagem} {alerta.vacina && <strong>{alerta.vacina} em {formatarDataSemFuso(alerta.proxima_dose)}.</strong>}</p>)}
      <div hidden={carregando || Boolean(erro)} className="weaning-summary panel">
        <div><span>Status</span><strong>{statusAtual === "DESMAMADO" ? "Desmamado" : "Não desmamado"}</strong></div>
        <div><span>Idade atual</span><strong>{idadeAtual === null ? "Não informada" : `${idadeAtual} dias`}</strong></div>
        <div><span>Último peso</span><strong>{eventos[0]?.ultimo_peso ? `${Number(eventos[0].ultimo_peso).toLocaleString("pt-BR")} kg` : animal.peso ? `${animal.peso} kg` : "Não informado"}</strong></div>
        {ativa && <div><span>Data planejada</span><strong>{formatarDataSemFuso(ativa.data_planejada)}</strong><small>{animal.data_nascimento ? `${calcularDiasEntreDatas(animal.data_nascimento, ativa.data_planejada)} dias de idade previstos` : "Nascimento não informado"}</small></div>}
        {definitiva && <><div><span>Data da desmama</span><strong>{formatarDataSemFuso(definitiva.data_desmama)}</strong></div><div><span>Idade à desmama</span><strong>{definitiva.idade_desmama_dias == null ? "Não informada" : `${definitiva.idade_desmama_dias} dias`}</strong></div><div><span>Peso à desmama</span><strong>{definitiva.peso_desmama ? `${Number(definitiva.peso_desmama).toLocaleString("pt-BR")} kg` : "Não informado"}</strong></div></>}
      </div>

      {dados.tipo_desmama === "PRECOCE" && formulario && <p className="notice notice-warning">Desmama precoce exige atenção ao manejo nutricional e às condições do sistema de produção.</p>}
      {formulario && (
        <form className="panel data-form management-form" onSubmit={salvar}><fieldset className="form-fields" disabled={processando || carregando}>
          <div className="management-form-title"><h3>{editando ? "Editar planejamento" : "Planejar desmama"}</h3></div>
          <div><label htmlFor="controledesmama-campo-1">Data planejada</label><input id="controledesmama-campo-1" type="date" required value={dados.data_planejada} onChange={(e) => alterar("data_planejada", e.target.value)} /></div>
          <div><label htmlFor="controledesmama-campo-2">Tipo</label><select id="controledesmama-campo-2" value={dados.tipo_desmama} onChange={(e) => alterar("tipo_desmama", e.target.value)}>{TIPOS.map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}</select></div>
          <div><label htmlFor="controledesmama-campo-3">Mãe</label><select id="controledesmama-campo-3" value={dados.mae_id} onChange={(e) => alterar("mae_id", e.target.value)}><option value="">Não informada</option>{maes.map((mae) => <option key={mae.id} value={mae.id}>{mae.nome} — brinco {mae.numero_brinco || "não informado"}</option>)}</select></div>
          <div><label htmlFor="controledesmama-campo-4">Lote de destino planejado</label><select id="controledesmama-campo-4" value={dados.lote_destino_id} onChange={(e) => alterar("lote_destino_id", e.target.value)}><option value="">Não informado</option>{lotes.map((lote) => <option key={lote.id} value={lote.id}>{lote.nome}</option>)}</select></div>
          {dados.tipo_desmama === "TEMPORARIA" && <><div><label htmlFor="controledesmama-campo-5">Data de início</label><input id="controledesmama-campo-5" type="date" value={dados.data_inicio} onChange={(e) => alterar("data_inicio", e.target.value)} /></div><div><label htmlFor="controledesmama-campo-6">Data de fim prevista</label><input id="controledesmama-campo-6" type="date" value={dados.data_fim} onChange={(e) => alterar("data_fim", e.target.value)} /></div></>}
          <div><label htmlFor="controledesmama-campo-7">Status</label><select id="controledesmama-campo-7" value={dados.status} onChange={(e) => alterar("status", e.target.value)}><option value="PLANEJADA">Planejada</option><option value="EM_ANDAMENTO">Em andamento</option></select></div>
          <div><label htmlFor="controledesmama-campo-8">Suplementação</label><input id="controledesmama-campo-8" maxLength="500" value={dados.suplementacao} onChange={(e) => alterar("suplementacao", e.target.value)} /></div>
          <div className="management-wide-field"><label htmlFor="controledesmama-campo-9">Observações</label><textarea id="controledesmama-campo-9" maxLength="1000" value={dados.observacao} onChange={(e) => alterar("observacao", e.target.value)} /></div>
          <div className="form-actions management-form-actions"><Button startIcon="salvar" loading={processando} disabled={processando || carregando} type="submit">{processando ? "Salvando..." : "Salvar planejamento"}</Button><Button startIcon="fechar" disabled={processando || carregando} className="button-secondary" type="button" onClick={() => setFormulario(false)}>Cancelar</Button></div>
        </fieldset></form>
      )}

      {conclusao && (
        <form className="panel data-form management-form conclusion-form" onSubmit={concluir}><fieldset className="form-fields" disabled={processando || carregando}>
          <div className="management-form-title"><h3>Concluir {conclusao.tipo_desmama === "TEMPORARIA" ? "período temporário" : "desmama"}</h3></div>
          {conclusao.tipo_desmama === "TEMPORARIA" ? <div><label htmlFor="controledesmama-campo-10">Data de fim</label><input id="controledesmama-campo-10" required type="date" value={dadosConclusao.data_fim} onChange={(e) => alterarConclusao("data_fim", e.target.value)} /></div> : <><div><label htmlFor="controledesmama-campo-11">Data real da desmama</label><input id="controledesmama-campo-11" required type="date" value={dadosConclusao.data_desmama} onChange={(e) => alterarConclusao("data_desmama", e.target.value)} /></div><div><label htmlFor="controledesmama-campo-12">Peso na desmama (kg)</label><input id="controledesmama-campo-12" required min="0.01" max="99999999.99" step="0.01" type="number" value={dadosConclusao.peso_kg} onChange={(e) => alterarConclusao("peso_kg", e.target.value)} /></div><div><label htmlFor="controledesmama-campo-13">Método da pesagem</label><select id="controledesmama-campo-13" value={dadosConclusao.metodo} onChange={(e) => alterarConclusao("metodo", e.target.value)}><option value="BALANCA">Balança</option><option value="FITA">Fita de pesagem</option><option value="ESTIMATIVA">Estimativa</option><option value="OUTRO">Outro</option></select></div></>}
          <div><label htmlFor="controledesmama-campo-14">Lote de destino</label><select id="controledesmama-campo-14" value={dadosConclusao.lote_destino_id} onChange={(e) => alterarConclusao("lote_destino_id", e.target.value)}><option value="">Não informado</option>{lotes.map((lote) => <option key={lote.id} value={lote.id}>{lote.nome}</option>)}</select></div>
          <div className="management-wide-field"><label htmlFor="controledesmama-campo-15">Observações</label><textarea id="controledesmama-campo-15" value={dadosConclusao.observacao} onChange={(e) => alterarConclusao("observacao", e.target.value)} /></div>
          <div className="form-actions management-form-actions"><Button startIcon="concluir" loading={processando} disabled={processando || carregando} type="submit">{processando ? "Concluindo..." : "Concluir"}</Button><Button startIcon="fechar" disabled={processando || carregando} className="button-secondary" type="button" onClick={() => setConclusao(null)}>Cancelar</Button></div>
        </fieldset></form>
      )}

      <section className="history-section">
        <div className="section-heading"><div><span className="eyebrow">Eventos preservados</span><h3>Histórico de desmama</h3></div><span className="count-badge">{eventos.length}</span></div>
        {!carregando && !erro && !eventos.length && <div className="empty-state"><p>Nenhum evento de desmama registrado.</p></div>}
        <div hidden={carregando || Boolean(erro)} className="management-list">{eventos.map((item) => <article className="panel management-record weaning-record" key={item.id}><div><span className={`status-pill status-${item.status.toLowerCase()}`}>{STATUS[item.status]}</span><strong>{ROTULOS_TIPO[item.tipo_desmama]}</strong></div><div><strong>{formatarDataSemFuso(item.data_planejada)}</strong><span>{item.tipo_desmama === "TEMPORARIA" ? `${formatarDataSemFuso(item.data_inicio)} → ${formatarDataSemFuso(item.data_fim, "em aberto")}` : item.data_desmama ? `Concluída em ${formatarDataSemFuso(item.data_desmama)}` : "Data planejada"}</span></div><div><strong>Mãe</strong><span>{item.mae ? `${item.mae} — ${item.mae_brinco || "sem brinco"}` : "Não informada"}</span></div><p>{item.observacao || item.suplementacao || "Sem observações"}</p>{["PLANEJADA", "EM_ANDAMENTO"].includes(item.status) && <div className="record-actions"><Button startIcon="editar" disabled={processando || carregando} className="button-secondary button-small" type="button" onClick={() => editar(item)}>Editar</Button><Button startIcon="concluir" disabled={processando || carregando} className="button-small" type="button" onClick={() => abrirConclusao(item)}>Concluir</Button><Button startIcon="fechar" disabled={processando || carregando} className="button-danger button-small" type="button" onClick={() => cancelar(item)}>Cancelar</Button></div>}</article>)}</div>
      </section>
    </section>
  );
}

export default ControleDesmama;
