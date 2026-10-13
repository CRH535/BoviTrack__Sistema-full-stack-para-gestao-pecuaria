import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../services/api";
import { formatarDataSemFuso } from "../../utils/datas";
import Card from "../ui/Card";
import Kpi from "../ui/Kpi";
import IconeImagem from "../IconeImagem";
import ClimaDashboard from "../ClimaDashboard";
import Distribuicao from "../ui/Distribuicao";
const moeda = (valor) =>
  valor == null
    ? "—"
    : Number(valor).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });

export default function DashboardConteudo({ resumo, proximasVacinacoes }) {
  const [animais, setAnimais] = useState(null);
  const [pesagens, setPesagens] = useState(null);
  const [falhas, setFalhas] = useState([]);
  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([
      api.getAll("/animais", { signal: controller.signal }),
      api.get("/pesagens", {
        signal: controller.signal,
        params: { page: 1, limit: 5 },
      }),
    ]).then(([rebanho, historico]) => {
      if (controller.signal.aborted) return;
      if (rebanho.status === "fulfilled") setAnimais(rebanho.value.data);
      if (historico.status === "fulfilled") setPesagens(historico.value.data);
      setFalhas([
        ...(rebanho.status === "rejected" ? ["distribuição"] : []),
        ...(historico.status === "rejected" ? ["pesagens"] : []),
      ]);
    });
    return () => controller.abort();
  }, []);
  const financeiros =
    resumo.total_receitas != null && resumo.lucro_liquido != null;
  const alertas = [
    [
      "vacinacoes",
      proximasVacinacoes.length,
      proximasVacinacoes.length === 1
        ? "Vacinação nos próximos 7 dias"
        : "Vacinações nos próximos 7 dias",
      "Confira a agenda sanitária.",
      "vacinas",
      "danger",
    ],
    [
      "pesagens",
      Number(resumo.animais_sem_pesagem_recente),
      Number(resumo.animais_sem_pesagem_recente) === 1
        ? "Animal sem pesagem recente"
        : "Animais sem pesagem recente",
      "Sem registro nos últimos 60 dias.",
      "identificacao",
      "warning",
    ],
    [
      "desmamas",
      Number(resumo.desmamas_proximas),
      Number(resumo.desmamas_proximas) === 1
        ? "Desmama nos próximos 30 dias"
        : "Desmamas nos próximos 30 dias",
      "Revise o planejamento de manejo.",
      "animais-lotes",
      "info",
    ],
  ];
  const totalFinanceiro = Math.max(
    1,
    Number(resumo.total_receitas) || 0,
    Number(resumo.total_despesas),
  );
  return (
    <div className="page dashboard-page">
      <header className="page-header" data-tour="dashboard">
        <div>
          <h1>Visão geral do rebanho</h1>
          <p>
            Seu rebanho, os próximos cuidados e os resultados da propriedade.
          </p>
        </div>
        <span className="panel-chip">
          <IconeImagem nome="calendario" className="badge-icon-image" />
          Visão atual
        </span>
      </header>
      <section
        className="stats-grid dashboard-kpis"
        aria-label="Resumo do sistema"
      >
        <Kpi
          rotulo="Animais"
          valor={resumo.animais}
          contexto="No seu rebanho"
          icone="animais"
          to="/animais"
        />
        <Kpi
          rotulo="Propriedades"
          valor={resumo.propriedades}
          contexto="Unidades cadastradas"
          icone="propriedades"
          to="/propriedades"
        />
        <Kpi
          rotulo="Lotes"
          valor={resumo.lotes}
          contexto="Organização do rebanho"
          icone="lotes"
          to="/lotes"
        />
        <Kpi
          rotulo="Vacinações próximas"
          valor={proximasVacinacoes.length}
          contexto="Nos próximos 7 dias"
          icone="vacinas"
          tom="danger"
          to="/vacinacoes"
        />
        <Kpi
          rotulo="Desmamas próximas"
          valor={resumo.desmamas_proximas}
          contexto="Nos próximos 30 dias"
          icone="animais-lotes"
          tom="warning"
          to="/desmamas"
        />
      </section>
      <div className="dashboard-grid">
        <Card
          titulo="Atenção ao rebanho"
          icone="alerta"
          className="attention-card"
        >
          <p className="card-description">
            Priorize os cuidados que precisam de acompanhamento.
          </p>
          <div className="ui-action-list">
            {alertas.map(([rota, valor, titulo, contexto, icon, tom]) => (
              <Link
                className={`ui-action-row tone-${tom}`}
                key={rota}
                to={`/${rota}`}
              >
                <span className="ui-action-icon">
                  <IconeImagem nome={icon} />
                </span>
                <span>
                  <strong>
                    {valor} {titulo.toLocaleLowerCase("pt-BR")}
                  </strong>
                  <small>{contexto}</small>
                </span>
                <IconeImagem nome="seta" />
              </Link>
            ))}
          </div>
        </Card>
        <Card
          titulo="Resultado financeiro"
          icone="grafico"
          acao={<Link to="/lucros">Ver resultados →</Link>}
        >
          <span className="card-description">
            Acumulado dos registros cadastrados
          </span>
          <strong className="dashboard-profit">
            {moeda(resumo.lucro_liquido)}
          </strong>
          <p className="card-description">
            {financeiros
              ? "Lucro líquido · receitas menos despesas"
              : "Receitas indisponíveis. O resultado não pode ser calculado."}
          </p>
          <div className="finance-bars">
            {[
              ["Receitas", resumo.total_receitas, "success"],
              ["Despesas", resumo.total_despesas, "danger"],
            ].map(([label, valor, tom]) => (
              <div key={label}>
                <span>
                  {label}
                  <strong>{moeda(valor)}</strong>
                </span>
                <div className={`finance-track tone-${tom}`}>
                  <i
                    style={{
                      width: `${(Math.max(0, Number(valor) || 0) / totalFinanceiro) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card titulo="Distribuição do rebanho" icone="animais">
          <p className="card-description">Por sexo cadastrado</p>
          {animais ? (
            <Distribuicao
              itens={[
                {
                  nome: "Fêmeas",
                  valor: animais.filter((a) => a.sexo === "F").length,
                },
                {
                  nome: "Machos",
                  valor: animais.filter((a) => a.sexo === "M").length,
                },
                {
                  nome: "Não informado",
                  valor: animais.filter((a) => !["F", "M"].includes(a.sexo))
                    .length,
                },
              ]}
              unidade="animais"
            />
          ) : (
            <p className="ui-panel-status">
              {falhas.includes("distribuição")
                ? "Distribuição indisponível no momento."
                : "Carregando distribuição..."}
            </p>
          )}
        </Card>
        <Card
          titulo="Próximas vacinações"
          icone="calendario"
          acao={<Link to="/vacinacoes">Ver agenda →</Link>}
        >
          {proximasVacinacoes.length ? (
            <div className="ui-action-list">
              {proximasVacinacoes.slice(0, 5).map((item) => (
                <Link
                  className="ui-action-row"
                  to={`/animais/${item.animal_id}?aba=vacinacao`}
                  key={item.id}
                >
                  <span className="agenda-date">
                    <strong>{String(item.proxima_dose).slice(8, 10)}</strong>
                    <small>
                      {new Date(
                        `${String(item.proxima_dose).slice(0, 10)}T12:00:00`,
                      ).toLocaleDateString("pt-BR", { month: "short" })}
                    </small>
                  </span>
                  <span>
                    <strong>{item.vacina}</strong>
                    <small>{item.animal}</small>
                  </span>
                  <IconeImagem nome="seta" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="ui-panel-status">
              <IconeImagem nome="proximas-vacinas" />
              <strong>Nenhuma dose próxima</strong>
              <p>Nenhuma próxima dose prevista para os próximos 7 dias.</p>
              <Link to="/vacinacoes">Consultar vacinações</Link>
            </div>
          )}
        </Card>
        <Card titulo="Ações rápidas" icone="mais">
          <div className="ui-action-list quick-actions">
            {[
              [
                "/animais?novo=1",
                "Cadastrar animal",
                "Adicionar um animal ao rebanho",
                "animais",
              ],
              [
                "/pesagens",
                "Registrar pesagem",
                "Escolher o animal e acompanhar o peso",
                "identificacao",
              ],
              [
                "/producao",
                "Registrar produção",
                "Acessar o controle leiteiro individual",
                "producao",
              ],
              [
                "/despesas?novo=1",
                "Nova despesa",
                "Registrar um gasto da propriedade",
                "despesas",
              ],
            ].map(([to, titulo, descricao, icon]) => (
              <Link className="ui-action-row" to={to} key={to}>
                <span className="ui-action-icon">
                  <IconeImagem nome={icon} />
                </span>
                <span>
                  <strong>{titulo}</strong>
                  <small>{descricao}</small>
                </span>
                <IconeImagem nome="seta" />
              </Link>
            ))}
          </div>
        </Card>
        <Card
          titulo="Pesagens recentes"
          icone="relogio"
          acao={<Link to="/pesagens">Ver histórico →</Link>}
        >
          {pesagens ? (
            pesagens.length ? (
              <div className="ui-action-list">
                {pesagens.map((item) => (
                  <Link
                    className="ui-action-row"
                    key={item.id}
                    to={`/animais/${item.animal_id}?aba=pesagens`}
                  >
                    <span className="ui-action-icon">
                      <IconeImagem nome="identificacao" />
                    </span>
                    <span>
                      <strong>{item.animal}</strong>
                      <small>
                        {Number(item.peso_kg).toLocaleString("pt-BR")} kg ·{" "}
                        {formatarDataSemFuso(item.data_pesagem)}
                      </small>
                    </span>
                    <IconeImagem nome="seta" />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="ui-panel-status">Nenhuma pesagem registrada.</p>
            )
          ) : (
            <p className="ui-panel-status">
              {falhas.includes("pesagens")
                ? "Histórico indisponível no momento."
                : "Carregando pesagens..."}
            </p>
          )}
        </Card>
      </div>
      <Card
        titulo="Crescimento e manejo"
        icone="animais-lotes"
        className="dashboard-management"
      >
        <dl>
          {[
            ["Em aleitamento", resumo.bezerros_aleitamento],
            ["Desmamas planejadas", resumo.desmamas_planejadas],
            ["Desmamados no ano", resumo.desmamados_ano],
            ["Vacinas no catálogo", resumo.vacinas],
          ].map(([label, valor]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{valor}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <ClimaDashboard />
    </div>
  );
}
