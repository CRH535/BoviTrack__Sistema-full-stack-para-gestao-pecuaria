import Button from "../ui/Button";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../services/api";
import Card from "../ui/Card";
import Kpi from "../ui/Kpi";
import { Carregamento } from "../ui/Estado";
import GraficoPeso from "../GraficoPeso";
import GraficoProducaoLeite from "../GraficoProducaoLeite";
import {
  calcularDiasEntreDatas,
  formatarDataSemFuso,
  obterDataAtualLocal,
} from "../../utils/datas";

export default function ResumoAnimal({ animal, historico = false, onAbrir }) {
  const [dados, setDados] = useState(null);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const config = { signal: controller.signal };
    Promise.allSettled([
      api.get(`/animais/${animal.id}/pesagens/resumo`, config),
      api.get(`/animais/${animal.id}/producoes-leiteiras/resumo`, config),
      api.getAll(`/animais/${animal.id}/vacinacoes`, config),
      api.getAllNested(`/animais/${animal.id}/desmamas`, "eventos", config),
    ]).then((resultados) => {
      if (!controller.signal.aborted)
        setDados(
          resultados.map((r) =>
            r.status === "fulfilled" ? r.value.data : null,
          ),
        );
    });
    return () => controller.abort();
  }, [animal.id, tentativa]);
  if (!dados)
    return <Carregamento texto="Carregando resumo do animal..." cards={4} />;
  const [peso, leite, vacinas, desmamas] = dados;
  const hoje = obterDataAtualLocal();
  const agenda = [
    ...(vacinas || [])
      .filter(
        (v) => v.proxima_dose && String(v.proxima_dose).slice(0, 10) >= hoje,
      )
      .map((v) => ({
        id: `v${v.id}`,
        data: v.proxima_dose,
        titulo: v.vacina,
        descricao: "Próxima dose",
        aba: "vacinacao",
      })),
    ...(desmamas?.eventos || [])
      .filter((d) => ["PLANEJADA", "EM_ANDAMENTO"].includes(d.status))
      .map((d) => ({
        id: `d${d.id}`,
        data: d.data_planejada,
        titulo: "Desmama planejada",
        descricao: d.tipo_desmama
          .replaceAll("_", " ")
          .toLocaleLowerCase("pt-BR"),
        aba: "desmama",
      })),
  ].sort((a, b) => String(a.data).localeCompare(String(b.data)));
  const eventos = [
    ...(peso?.evolucao || []).map((p) => ({
      id: `p${p.id}`,
      data: p.data,
      titulo: "Pesagem registrada",
      descricao: `${Number(p.peso_kg).toLocaleString("pt-BR")} kg`,
      aba: "pesagens",
    })),
    ...(vacinas || []).map((v) => ({
      id: `v${v.id}`,
      data: v.data_aplicacao,
      titulo: "Vacinação realizada",
      descricao: v.vacina,
      aba: "vacinacao",
    })),
    ...(desmamas?.eventos || [])
      .filter((d) => d.status === "CONCLUIDA")
      .map((d) => ({
        id: `d${d.id}`,
        data: d.data_desmama || d.data_fim,
        titulo: "Desmama concluída",
        descricao: d.tipo_desmama.replaceAll("_", " "),
        aba: "desmama",
      })),
  ].sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const desatualizado =
    peso &&
    (!peso.resumo.ultima_pesagem ||
      calcularDiasEntreDatas(peso.resumo.ultima_pesagem.data_pesagem, hoje) >
        60);
  return (
    <>
      {dados.some((d) => d === null) && (
        <div className="notice notice-error" role="alert">
          Parte do resumo está indisponível.{" "}
          <Button startIcon="atualizar" type="button" onClick={() => setTentativa((n) => n + 1)}>
            Tentar novamente
          </Button>
        </div>
      )}
      {!historico && (
        <>
          <section
            className="stats-grid animal-kpis"
            aria-label="Resumo individual"
          >
            <Kpi
              rotulo="Peso atual"
              valor={
                peso?.resumo.peso_atual == null
                  ? "—"
                  : `${Number(peso.resumo.peso_atual).toLocaleString("pt-BR")} kg`
              }
              contexto={
                peso?.resumo.ultima_pesagem
                  ? formatarDataSemFuso(peso.resumo.ultima_pesagem.data_pesagem)
                  : "Sem pesagem registrada"
              }
              icone="identificacao"
            />
            <Kpi
              rotulo="Variação recente"
              valor={
                peso?.resumo.variacao_recente == null
                  ? "—"
                  : `${Number(peso.resumo.variacao_recente).toLocaleString("pt-BR")} kg`
              }
              contexto="Entre as duas últimas pesagens"
              icone="grafico"
            />
            <Kpi
              rotulo="Produção de hoje"
              valor={
                leite
                  ? `${Number(leite.resumo.producao_hoje).toLocaleString("pt-BR")} L`
                  : "—"
              }
              contexto="Soma das ordenhas de hoje"
              icone="producao"
              tom="info"
            />
            <Kpi
              rotulo="Últimos 30 dias"
              valor={
                leite
                  ? `${Number(leite.resumo.producao_30_dias).toLocaleString("pt-BR")} L`
                  : "—"
              }
              contexto="Leite registrado no período"
              icone="producao"
            />
          </section>
          <div className="profile-summary-grid">
            <div className="profile-charts">
              <Card
                titulo="Evolução do peso"
                icone="identificacao"
                acao={
                  <Button startIcon="pesagem"
                    className="ui-sort"
                    onClick={() => onAbrir("pesagens")}
                  >
                    Ver pesagens
                  </Button>
                }
              >
                {peso ? (
                  <GraficoPeso
                    dados={peso.evolucao}
                    dataNascimento={animal.data_nascimento}
                  />
                ) : (
                  <p>Gráfico indisponível.</p>
                )}
              </Card>
              <Card
                titulo="Produção de leite"
                icone="producao"
                acao={
                  <Button startIcon="producao"
                    className="ui-sort"
                    onClick={() => onAbrir("producao")}
                  >
                    Ver produção
                  </Button>
                }
              >
                <p className="card-description">Últimos 30 dias</p>
                {leite ? (
                  <GraficoProducaoLeite dados={leite.evolucao} />
                ) : (
                  <p>Gráfico indisponível.</p>
                )}
              </Card>
            </div>
            <aside className="profile-sidebar">
              <Card titulo="Próximas ações" icone="calendario">
                {agenda.length ? (
                  <div className="ui-timeline">
                    {agenda.slice(0, 5).map((item) => (
                      <Button startIcon={item.aba === "pesagens" ? "pesagem" : item.aba === "vacinacao" ? "vacinas" : "desmama"}
                        className="ui-timeline-item"
                        key={item.id}
                        type="button"
                        onClick={() => onAbrir(item.aba)}
                      >
                        <time>{formatarDataSemFuso(item.data)}</time>
                        <span>
                          <strong>{item.titulo}</strong>
                          <small>{item.descricao}</small>
                        </span>
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className="ui-panel-status">
                    {vacinas && desmamas
                      ? "Nenhuma próxima ação registrada."
                      : "Agenda incompleta no momento."}
                  </p>
                )}
              </Card>
              <Card titulo="Acompanhamento" icone="alerta">
                <p
                  className={`notice ${desatualizado ? "notice-warning" : ""}`}
                >
                  {peso
                    ? desatualizado
                      ? "Sem pesagem nos últimos 60 dias. Atualize o acompanhamento."
                      : "Há pesagem registrada nos últimos 60 dias."
                    : "Acompanhamento de peso indisponível."}
                </p>
                <Button startIcon="pesagem"
                  className="button-secondary"
                  type="button"
                  onClick={() => onAbrir("pesagens")}
                >
                  Registrar pesagem
                </Button>
              </Card>
            </aside>
          </div>
        </>
      )}
      <Card
        titulo={historico ? "Histórico de manejo" : "Histórico recente"}
        icone="relogio"
        className="profile-history"
        acao={
          !historico && (
            <Button startIcon="historico" className="ui-sort" onClick={() => onAbrir("historico")}>
              Ver histórico
            </Button>
          )
        }
      >
        <p className="card-description">
          Pesagens, vacinações e desmamas concluídas. As ordenhas ficam na aba
          Produção.
        </p>
        {eventos.length ? (
          <div className="ui-timeline">
            {(historico ? eventos : eventos.slice(0, 5)).map((item) => (
              <Button startIcon={item.aba === "pesagens" ? "pesagem" : item.aba === "vacinacao" ? "vacinas" : "desmama"}
                className="ui-timeline-item"
                key={item.id}
                type="button"
                onClick={() => onAbrir(item.aba)}
              >
                <time>{formatarDataSemFuso(item.data)}</time>
                <span>
                  <strong>{item.titulo}</strong>
                  <small>{item.descricao}</small>
                </span>
              </Button>
            ))}
          </div>
        ) : (
          <p>Nenhum registro de manejo disponível.</p>
        )}
        <Button as={Link} startIcon="voltar" className="ui-help-link" to="/animais">
          Voltar à lista de animais
        </Button>
      </Card>
    </>
  );
}
