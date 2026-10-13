import Button from "../components/ui/Button";
import SearchInput from "../components/ui/SearchInput";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import VoltarInicio from "../components/VoltarInicio";
import RegistroFichaNotice from "../components/RegistroFichaNotice";
import api from "../services/api";
import { formatarDataSemFuso } from "../utils/datas";

const TIPOS = [["", "Todos os tipos"], ["NASCIMENTO", "Nascimento"], ["ROTINA", "Rotina"], ["PRE_DESMAMA", "Pré-desmama"], ["DESMAMA", "Desmama"], ["POS_DESMAMA", "Pós-desmama"], ["SOBREANO", "Sobreano"], ["OUTRA", "Outra"]];
const ROTULOS = Object.fromEntries(TIPOS);

function Pesagens() {
  const [registros, setRegistros] = useState([]);
  const [propriedades, setPropriedades] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [filtros, setFiltros] = useState({ busca: "", propriedade_id: "", lote_id: "", tipo: "", data_inicio: "", data_fim: "" });
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const requisicaoRef = useRef(0);

  async function carregar(params = filtros) {
    const requisicao = ++requisicaoRef.current;
    setCarregando(true);
    setErro("");
    try {
      const resposta = await api.getAll("/pesagens", { params: Object.fromEntries(Object.entries(params).filter(([, valor]) => valor !== "")) });
      if (requisicao === requisicaoRef.current) { setRegistros(resposta.data); setErro(""); }
    } catch (falha) { if (requisicao === requisicaoRef.current) setErro(falha.response?.data?.mensagem || "Não foi possível carregar as pesagens."); }
    finally { if (requisicao === requisicaoRef.current) setCarregando(false); }
  }
  useEffect(() => {
    let ativo = true;
    const requisicao = ++requisicaoRef.current;
    async function carregarInicial() {
      try {
        const [p, l, registrosResposta] = await Promise.all([
          api.getAll("/propriedades"), api.getAll("/lotes"), api.getAll("/pesagens"),
        ]);
        if (!ativo || requisicao !== requisicaoRef.current) return;
        setPropriedades(p.data); setLotes(l.data); setRegistros(registrosResposta.data);
      } catch (falha) {
        if (ativo && requisicao === requisicaoRef.current) setErro(falha.response?.data?.mensagem || "Não foi possível carregar as pesagens.");
      } finally {
        if (ativo && requisicao === requisicaoRef.current) setCarregando(false);
      }
    }
    carregarInicial();
    return () => { ativo = false; };
  }, []);

  function alterar(campo, valor) { setFiltros((atual) => ({ ...atual, [campo]: valor, ...(campo === "propriedade_id" ? { lote_id: "" } : {}) })); }

  return <div className="page">
    <header className="page-header" data-tour="pesagens"><div><span className="eyebrow">Desempenho do rebanho</span><h1>Pesagens</h1><p>Consulte o histórico por animal, propriedade, lote, período e tipo.</p></div><VoltarInicio /></header>
    {erro && <div className="notice notice-error" role="alert">{erro} <Button startIcon="atualizar" type="button" onClick={() => carregar()}>Tentar novamente</Button></div>}
    {carregando && <p role="status">Carregando registros...</p>}
    <RegistroFichaNotice tipo="pesagem" acao="adicionar uma nova pesagem" />
    <form className="panel filter-panel management-filters" onSubmit={(e) => { e.preventDefault(); carregar(); }}>
      <div><label htmlFor="pesagens-campo-1">Animal ou brinco</label><SearchInput id="pesagens-campo-1" value={filtros.busca} onChange={(e) => alterar("busca", e.target.value)} placeholder="Pesquisar" /></div>
      <div><label htmlFor="pesagens-campo-2">Propriedade</label><select id="pesagens-campo-2" value={filtros.propriedade_id} onChange={(e) => alterar("propriedade_id", e.target.value)}><option value="">Todas</option>{propriedades.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></div>
      <div><label htmlFor="pesagens-campo-3">Lote</label><select id="pesagens-campo-3" value={filtros.lote_id} onChange={(e) => alterar("lote_id", e.target.value)}><option value="">Todos</option>{lotes.filter((item) => !filtros.propriedade_id || Number(item.propriedade_id) === Number(filtros.propriedade_id)).map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></div>
      <div><label htmlFor="pesagens-campo-4">Tipo</label><select id="pesagens-campo-4" value={filtros.tipo} onChange={(e) => alterar("tipo", e.target.value)}>{TIPOS.map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}</select></div>
      <div><label htmlFor="pesagens-campo-5">Data inicial</label><input id="pesagens-campo-5" type="date" value={filtros.data_inicio} onChange={(e) => alterar("data_inicio", e.target.value)} /></div>
      <div><label htmlFor="pesagens-campo-6">Data final</label><input id="pesagens-campo-6" type="date" value={filtros.data_fim} onChange={(e) => alterar("data_fim", e.target.value)} /></div>
      <Button startIcon="filtro" type="submit">Aplicar filtros</Button>
    </form>
    <div className="section-heading"><div><span className="eyebrow">Resultados</span><h2>Histórico de pesagens</h2></div><span className="count-badge">{carregando || erro ? "\u2014" : registros.length}</span></div>
    {!carregando && !erro && !registros.length && <div className="empty-state"><p>Nenhuma pesagem encontrada para os filtros selecionados.</p></div>}
    <div hidden={carregando || Boolean(erro)} className="management-list">{registros.map((item) => <article className="panel management-record" key={item.id}><div><span className="eyebrow">{formatarDataSemFuso(item.data_pesagem)}</span><strong>{Number(item.peso_kg).toLocaleString("pt-BR")} kg</strong></div><div><strong>{item.animal}</strong><span>Brinco {item.numero_brinco || "não informado"}</span></div><div><strong>{ROTULOS[item.tipo_pesagem] || item.tipo_pesagem}</strong><span>{item.propriedade}{item.lote ? ` • ${item.lote}` : ""}</span></div><p>{item.observacao || "Sem observações"}</p><Button as={Link} startIcon="visualizar" className="button-secondary button-link" to={`/animais/${item.animal_id}`}>Abrir ficha</Button></article>)}</div>
  </div>;
}

export default Pesagens;
