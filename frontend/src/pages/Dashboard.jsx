import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { formatarDataSemFuso } from "../utils/datas";
import IconeImagem from "../components/IconeImagem";
import ClimaDashboard from "../components/ClimaDashboard";
import { useBlackHoleTransition } from "../transitions/useBlackHoleTransition";

const resumoInicial = {
  propriedades: 0,
  animais: 0,
  lotes: 0,
  vacinas: 0,
  total_despesas: 0,
  total_receitas: 0,
  lucro_liquido: 0,
  bezerros_aleitamento: 0,
  desmamas_planejadas: 0,
  desmamas_proximas: 0,
  desmamados_ano: 0,
  animais_sem_pesagem_recente: 0,
};

function Dashboard() {
  const [resumo, setResumo] = useState(resumoInicial);
  const [proximasVacinacoes, setProximasVacinacoes] = useState([]);
  const [erro, setErro] = useState("");
  const [carregamentoConcluido, setCarregamentoConcluido] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const { sinalizarDestinoPronto } = useBlackHoleTransition();

  useEffect(() => {
    let componenteAtivo = true;

    async function carregarDashboard() {
      try {
        const resposta = await api.get("/dashboard");
        if (componenteAtivo) {
          setResumo(resposta.data.resumo);
          setProximasVacinacoes(resposta.data.proximas_vacinacoes);
        }
      } catch {
        console.error("Falha ao carregar o dashboard");
        if (componenteAtivo) {
          setErro("Erro ao carregar o dashboard");
        }
      } finally {
        if (componenteAtivo) {
          setCarregamentoConcluido(true);
        }
      }
    }

    carregarDashboard();

    return () => {
      componenteAtivo = false;
    };
  }, [tentativa]);

  useEffect(() => {
    if (carregamentoConcluido) {
      sinalizarDestinoPronto("dashboard");
    }
  }, [carregamentoConcluido, sinalizarDestinoPronto]);

  const indicadores = [
    { nome: "Propriedades", valor: Number(resumo.propriedades), icon: "propriedades", rota: "/propriedades" },
    { nome: "Animais", valor: Number(resumo.animais), icon: "animais", rota: "/animais" },
    { nome: "Lotes", valor: Number(resumo.lotes), icon: "lotes", rota: "/lotes" },
    { nome: "Vacinas", valor: Number(resumo.vacinas), icon: "vacinas", rota: "/vacinas" },
  ];
  const maiorIndicador = Math.max(1, ...indicadores.map((item) => item.valor));
  const receitasDisponiveis = resumo.receitas_disponiveis !== false && resumo.total_receitas != null && resumo.lucro_liquido != null;

  if (!carregamentoConcluido) {
    return <p className="session-loading inline-loading" role="status">Carregando visão geral do rebanho...</p>;
  }

  if (erro) {
    return <div className="page"><h1>Visão geral do rebanho</h1><p className="notice notice-error" role="alert">{erro}</p><button type="button" onClick={() => { setErro(""); setCarregamentoConcluido(false); setTentativa((atual) => atual + 1); }}>Tentar novamente</button></div>;
  }

  return (
    <div className="page dashboard-page">
      <header className="page-header" data-tour="dashboard">
        <div>
          <span className="eyebrow">Gestão pecuária</span>
          <h1>Visão geral do rebanho</h1>
          <p>Acompanhe animais, lotes, vacinações e despesas em um só lugar.</p>
        </div>
        <span className="status-badge"><span /> Dados carregados</span>
      </header>

      {erro && <p className="notice notice-error" role="alert">{erro}</p>}

      <section className="stats-grid" aria-label="Resumo do sistema">
        {indicadores.map((item) => (
          <Link
            className="stat-card dashboard-link-card"
            key={item.nome}
            to={item.rota}
            aria-label={`Abrir ${item.nome}`}
          >
            <div>
              <span>{item.nome}</span>
              <strong>{item.valor}</strong>
              <small>Registros cadastrados</small>
            </div>
            <span className="stat-icon" aria-hidden="true">
              <IconeImagem nome={item.icon} className="stat-icon-image" />
            </span>
          </Link>
        ))}

        <Link
          className="stat-card stat-card-finance dashboard-link-card"
          to="/despesas"
          aria-label="Abrir Despesas"
        >
          <div>
            <span>Despesas totais</span>
            <strong>R$ {Number(resumo.total_despesas).toLocaleString("pt-BR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}</strong>
            <small>Valor acumulado</small>
          </div>
          <span className="stat-icon" aria-hidden="true">
            <IconeImagem nome="despesas" className="stat-icon-image" />
          </span>
        </Link>

        <Link
          className="stat-card stat-card-finance dashboard-link-card"
          to="/lucros"
          aria-label="Abrir Receitas"
        >
          <div><span>Receitas totais</span><strong>{receitasDisponiveis ? `R$ ${Number(resumo.total_receitas).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</strong><small>{receitasDisponiveis ? "Entradas acumuladas" : "Receitas indisponíveis"}</small></div>
          <span className="stat-icon" aria-hidden="true"><IconeImagem nome="producao" className="stat-icon-image" /></span>
        </Link>

        <Link
          className="stat-card stat-card-finance dashboard-link-card"
          to="/lucros"
          aria-label="Abrir Lucros"
          data-tour="lucros-card"
        >
          <div>
            <span>Lucro líquido</span>
            <strong>{receitasDisponiveis ? `R$ ${Number(resumo.lucro_liquido).toLocaleString("pt-BR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}` : "—"}</strong>
            <small>{receitasDisponiveis ? "Receitas menos despesas" : "Resumo financeiro incompleto"}</small>
          </div>
          <span className="stat-icon" aria-hidden="true">
            <IconeImagem nome="producao" className="stat-icon-image" />
          </span>
        </Link>
      </section>

      <div className="section-heading dashboard-calf-heading">
        <div><span className="eyebrow">Crescimento e manejo</span><h2>Bezerros e desmamas</h2></div>
      </div>
      <section className="calf-stats-grid" aria-label="Indicadores de bezerros e desmamas">
        <Link className="stat-card dashboard-link-card" to="/desmamas"><div><span>Em aleitamento</span><strong>{Number(resumo.bezerros_aleitamento)}</strong><small>Bezerros sem desmama definitiva</small></div></Link>
        <Link className="stat-card dashboard-link-card" to="/desmamas"><div><span>Desmamas planejadas</span><strong>{Number(resumo.desmamas_planejadas)}</strong><small>Planejadas ou em andamento</small></div></Link>
        <Link className="stat-card dashboard-link-card" to="/desmamas"><div><span>Próximos 30 dias</span><strong>{Number(resumo.desmamas_proximas)}</strong><small>Desmamas programadas</small></div></Link>
        <Link className="stat-card dashboard-link-card" to="/desmamas"><div><span>Desmamados no ano</span><strong>{Number(resumo.desmamados_ano)}</strong><small>Eventos definitivos concluídos</small></div></Link>
        <Link className="stat-card dashboard-link-card" to="/pesagens"><div><span>Sem pesagem recente</span><strong>{Number(resumo.animais_sem_pesagem_recente)}</strong><small>Sem registro nos últimos 60 dias</small></div></Link>
      </section>

      <section className="dashboard-panels">
        <article className="panel overview-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Resumo geral</span>
              <h2>Distribuição dos registros</h2>
            </div>
            <span className="panel-chip">Dados atuais</span>
          </div>

          <div className="metric-chart">
            {indicadores.map((item) => (
              <div className="metric-row" key={item.nome}>
                <span>{item.nome}</span>
                <div className="metric-track">
                  <span style={{ width: `${(item.valor / maiorIndicador) * 100}%` }} />
                </div>
                <strong>{item.valor}</strong>
              </div>
            ))}
          </div>
        </article>

        <Link
          className="panel activity-panel dashboard-link-card"
          to="/vacinacoes"
          aria-label="Abrir Vacinações"
        >
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Agenda sanitária</span>
              <h2>Próximas vacinações</h2>
            </div>
            <span className="panel-chip">7 dias</span>
          </div>

          {proximasVacinacoes.length === 0 && (
            <div className="empty-state compact-empty">
              <span aria-hidden="true">
                <IconeImagem nome="proximas-vacinas" className="empty-icon-image" />
              </span>
              <p>Nenhuma vacinação prevista para esta semana.</p>
            </div>
          )}

          <div className="activity-list">
            {proximasVacinacoes.map((vacinacao) => (
              <div className="activity-item" key={vacinacao.id}>
                <span className="activity-icon" aria-hidden="true">
                  <IconeImagem nome="vacinacoes" className="activity-icon-image" />
                </span>
                <div>
                  <strong>{vacinacao.animal}</strong>
                  <small>{vacinacao.vacina}</small>
                </div>
                <time>
                  {vacinacao.proxima_dose
                    ? formatarDataSemFuso(vacinacao.proxima_dose)
                    : "-"}
                </time>
              </div>
            ))}
          </div>
        </Link>
      </section>
      <ClimaDashboard />
    </div>
  );
}

export default Dashboard;
