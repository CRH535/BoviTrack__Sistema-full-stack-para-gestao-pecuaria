import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import VoltarInicio from "../components/VoltarInicio";
import RegistroFichaNotice from "../components/RegistroFichaNotice";
import api from "../services/api";
import { formatarDataSemFuso } from "../utils/datas";

const STATUS = [["", "Todos os status"], ["PLANEJADA", "Planejadas"], ["EM_ANDAMENTO", "Em andamento"], ["CONCLUIDA", "Concluídas"], ["CANCELADA", "Canceladas"]];
const TIPOS = [["", "Todos os tipos"], ["CONVENCIONAL", "Convencional"], ["LADO_A_LADO", "Racional / lado a lado"], ["ABRUPTA", "Abrupta"], ["PRECOCE", "Precoce"], ["TEMPORARIA", "Temporária"], ["CONTROLADA", "Controlada"], ["OUTRA", "Outra"]];
const ROTULOS_STATUS = Object.fromEntries(STATUS);
const ROTULOS_TIPO = Object.fromEntries(TIPOS);

function Desmamas() {
  const [registros, setRegistros] = useState([]);
  const [propriedades, setPropriedades] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [filtros, setFiltros] = useState({ busca: "", propriedade_id: "", lote_id: "", status: "", tipo: "" });
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const requisicaoRef = useRef(0);

  async function carregar(params = filtros) {
    const requisicao = ++requisicaoRef.current;
    setCarregando(true);
    setErro("");
    try { const resposta = await api.getAll("/desmamas", { params: Object.fromEntries(Object.entries(params).filter(([, valor]) => valor !== "")) }); if (requisicao === requisicaoRef.current) { setRegistros(resposta.data); setErro(""); } }
    catch (falha) { if (requisicao === requisicaoRef.current) setErro(falha.response?.data?.mensagem || "Não foi possível carregar as desmamas."); }
    finally { if (requisicao === requisicaoRef.current) setCarregando(false); }
  }
  useEffect(() => {
    let ativo = true;
    const requisicao = ++requisicaoRef.current;
    async function carregarInicial() {
      try {
        const [p, l, registrosResposta] = await Promise.all([
          api.getAll("/propriedades"), api.getAll("/lotes"), api.getAll("/desmamas"),
        ]);
        if (!ativo || requisicao !== requisicaoRef.current) return;
        setPropriedades(p.data); setLotes(l.data); setRegistros(registrosResposta.data);
      } catch (falha) {
        if (ativo && requisicao === requisicaoRef.current) setErro(falha.response?.data?.mensagem || "Não foi possível carregar as desmamas.");
      } finally {
        if (ativo && requisicao === requisicaoRef.current) setCarregando(false);
      }
    }
    carregarInicial();
    return () => { ativo = false; };
  }, []);
  function alterar(campo, valor) { setFiltros((atual) => ({ ...atual, [campo]: valor, ...(campo === "propriedade_id" ? { lote_id: "" } : {}) })); }

  return <div className="page">
    <header className="page-header" data-tour="desmamas"><div><span className="eyebrow">Planejamento de manejo</span><h1>Desmamas</h1><p>Acompanhe eventos planejados, em andamento e concluídos.</p></div><VoltarInicio /></header>
    {erro && <div className="notice notice-error" role="alert">{erro} <button type="button" onClick={() => carregar()}>Tentar novamente</button></div>}
    {carregando && <p role="status">Carregando registros...</p>}
    <RegistroFichaNotice tipo="desmama" acao="registrar uma desmama" />
    <form className="panel filter-panel management-filters" onSubmit={(e) => { e.preventDefault(); carregar(); }}>
      <div><label htmlFor="desmamas-campo-1">Animal ou brinco</label><input id="desmamas-campo-1" value={filtros.busca} onChange={(e) => alterar("busca", e.target.value)} /></div>
      <div><label htmlFor="desmamas-campo-2">Propriedade</label><select id="desmamas-campo-2" value={filtros.propriedade_id} onChange={(e) => alterar("propriedade_id", e.target.value)}><option value="">Todas</option>{propriedades.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></div>
      <div><label htmlFor="desmamas-campo-3">Lote de destino</label><select id="desmamas-campo-3" value={filtros.lote_id} onChange={(e) => alterar("lote_id", e.target.value)}><option value="">Todos</option>{lotes.filter((item) => !filtros.propriedade_id || Number(item.propriedade_id) === Number(filtros.propriedade_id)).map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></div>
      <div><label htmlFor="desmamas-campo-4">Status</label><select id="desmamas-campo-4" value={filtros.status} onChange={(e) => alterar("status", e.target.value)}>{STATUS.map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}</select></div>
      <div><label htmlFor="desmamas-campo-5">Tipo</label><select id="desmamas-campo-5" value={filtros.tipo} onChange={(e) => alterar("tipo", e.target.value)}>{TIPOS.map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}</select></div>
      <button type="submit">Aplicar filtros</button>
    </form>
    <div className="section-heading"><div><span className="eyebrow">Resultados</span><h2>Eventos de desmama</h2></div><span className="count-badge">{carregando || erro ? "\u2014" : registros.length}</span></div>
    {!carregando && !erro && !registros.length && <div className="empty-state"><p>Nenhuma desmama encontrada para os filtros selecionados.</p></div>}
    <div hidden={carregando || Boolean(erro)} className="management-list">{registros.map((item) => <article className="panel management-record weaning-record" key={item.id}><div><span className={`status-pill status-${item.status.toLowerCase()}`}>{ROTULOS_STATUS[item.status]}</span><strong>{ROTULOS_TIPO[item.tipo_desmama]}</strong></div><div><strong>{item.animal}</strong><span>Brinco {item.numero_brinco || "não informado"}</span></div><div><strong>{formatarDataSemFuso(item.data_planejada)}</strong><span>{item.idade_desmama_dias ? `${item.idade_desmama_dias} dias à desmama` : `${item.ultimo_peso ? `${Number(item.ultimo_peso).toLocaleString("pt-BR")} kg` : "Sem pesagem"}`}</span></div><p>Mãe: {item.mae || "não informada"}{item.lote_destino ? ` • Destino: ${item.lote_destino}` : ""}</p><Link className="button-secondary button-link" to={`/animais/${item.animal_id}`}>Abrir ficha</Link></article>)}</div>
  </div>;
}

export default Desmamas;
