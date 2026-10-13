import { useMemo, useState } from "react";
import useLarguraGrafico from "../useLarguraGrafico";
import Card from "../ui/Card";
import Kpi from "../ui/Kpi";
import Distribuicao from "../ui/Distribuicao";
import { agruparFinancas } from "../../utils/financas";
const moeda = (v) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function GraficoFinanceiro({ meses }) {
  const [ref, larguraGrafico] = useLarguraGrafico(meses.length > 0);
  const [selecionado, setSelecionado] = useState(null);
  const visiveis = larguraGrafico < 500 ? meses.slice(-3) : meses;
  const mesSelecionado = meses.find((mes) => mes.mes === selecionado);
  if (!meses.length)
    return (
      <div ref={ref} className="ui-panel-status">
        Nenhum lançamento neste período.
      </div>
    );
  const max = Math.max(
    1,
    ...visiveis.flatMap((m) => [m.receitas, m.despesas, Math.abs(m.lucro)]),
  );
  return (
    <div ref={ref} className="finance-chart">
      <div className="finance-chart-legend">
        <span>● Receitas</span>
        <span>● Despesas</span>
        <span>● Lucro líquido</span>
      </div>
      <svg
        viewBox={`0 0 ${larguraGrafico} 310`}
        role="img"
        aria-label="Receitas, despesas e lucro líquido por mês"
      >
        <title>Valores mensais dos lançamentos filtrados</title>
        {[0, 1, 2, 3, 4].map((linha) => (
          <g key={linha}>
            <line
              x1="76"
              x2={larguraGrafico - 18}
              y1={26 + linha * 52}
              y2={26 + linha * 52}
              stroke="var(--chart-grid)"
            />
            <text x="66" y={31 + linha * 52} textAnchor="end">
              {((max * (4 - linha)) / 4).toLocaleString("pt-BR", {
                notation: "compact",
                maximumFractionDigits: 1,
              })}
            </text>
          </g>
        ))}
        {visiveis.map((mes, index) => {
          const largura = (larguraGrafico - 110) / visiveis.length;
          const x = 86 + index * largura;
          return (
            <g
              key={mes.mes}
              tabIndex="0"
              aria-label={`${mes.mes}: receitas ${moeda(mes.receitas)}, despesas ${moeda(mes.despesas)}, lucro ${moeda(mes.lucro)}`}
              onFocus={() => setSelecionado(mes.mes)}
              onBlur={() => setSelecionado(null)}
              onMouseEnter={() => setSelecionado(mes.mes)}
              onMouseLeave={() => setSelecionado(null)}
              onClick={() => setSelecionado(mes.mes)}
            >
              {[
                ["receitas", "var(--chart-line)"],
                ["despesas", "var(--danger)"],
                ["lucro", "var(--info)"],
              ].map(([campo, cor], i) => (
                <rect
                  key={campo}
                  x={x + i * largura * 0.23}
                  y={234 - (Math.max(0, mes[campo]) / max) * 208}
                  width={largura * 0.18}
                  height={(Math.max(0, mes[campo]) / max) * 208}
                  rx="2"
                  fill={cor}
                >
                  <title>
                    {mes.mes} · {campo}: {moeda(mes[campo])}
                  </title>
                </rect>
              ))}
              <text x={x + largura * 0.3} y="260" textAnchor="middle">
                {new Date(`${mes.mes}-01T12:00:00Z`).toLocaleDateString(
                  "pt-BR",
                  { month: "short", year: "2-digit", timeZone: "UTC" },
                )}
              </text>
              {mes.lucro < 0 && (
                <text
                  className="finance-negative-label"
                  x={x + largura * 0.3}
                  y="282"
                  textAnchor="middle"
                >
                  {larguraGrafico < 500
                    ? mes.lucro.toLocaleString("pt-BR", {
                        notation: "compact",
                        maximumFractionDigits: 1,
                      })
                    : `Lucro ${moeda(mes.lucro)}`}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="chart-tooltip" aria-live="polite">
        {mesSelecionado ? (
          <span>
            {mesSelecionado.mes} · Receita {moeda(mesSelecionado.receitas)} ·
            Despesas {moeda(mesSelecionado.despesas)} · Lucro{" "}
            {moeda(mesSelecionado.lucro)}
          </span>
        ) : (
          <span>Toque ou foque um mês para ver os valores.</span>
        )}
      </div>
      <p className="card-description">
        Valores em reais.{" "}
        {larguraGrafico < 500 && "Exibindo até três meses nesta tela. "}
        Resultados negativos são indicados abaixo de cada mês.
      </p>
    </div>
  );
}
export default function PainelFinanceiro({
  resumo,
  receitas,
  despesas,
  categoria,
}) {
  const meses = useMemo(
    () => agruparFinancas(receitas, despesas || []),
    [receitas, despesas],
  );
  const categorias = useMemo(() => {
    const grupos = new Map();
    for (const d of despesas || [])
      grupos.set(
        d.categoria || "Outros",
        (grupos.get(d.categoria || "Outros") || 0) +
          Math.round(Number(d.valor) * 100),
      );
    return [...grupos]
      .sort((a, b) => b[1] - a[1])
      .map(([nome, valor]) => ({ nome, valor: valor / 100 }));
  }, [despesas]);
  return (
    <>
      <section className="profit-summary-grid" aria-label="Resumo financeiro">
        <Kpi
          rotulo="Receita total"
          valor={moeda(resumo.receita_total)}
          contexto={
            categoria
              ? `Categoria: ${categoria}`
              : "Entradas no período selecionado"
          }
          icone="dinheiro"
        />
        <Kpi
          rotulo="Despesas totais"
          valor={moeda(resumo.despesas_totais)}
          contexto="Todas as categorias no período"
          icone="despesas"
          tom="danger"
        />
        <Kpi
          rotulo="Lucro líquido"
          valor={moeda(resumo.lucro_liquido)}
          contexto="Receitas filtradas menos despesas"
          icone="grafico"
          tom={Number(resumo.lucro_liquido) < 0 ? "danger" : "success"}
        />
      </section>
      <div className="financial-content-grid">
        <Card titulo="Receitas, despesas e lucro" icone="grafico">
          <p className="card-description">
            Até seis meses com lançamentos nos filtros selecionados.
            {categoria
              ? " As receitas consideram a categoria escolhida; despesas incluem todas as categorias."
              : ""}
          </p>
          {despesas === undefined ? (
            <p className="ui-panel-status">
              Carregando detalhamento financeiro...
            </p>
          ) : despesas ? (
            <GraficoFinanceiro meses={meses} />
          ) : (
            <p className="ui-panel-status">
              Detalhamento de despesas indisponível. Os totais acima vêm do
              resumo financeiro.
            </p>
          )}
        </Card>
        <Card titulo="Despesas por categoria" icone="despesas">
          {despesas === undefined ? (
            <p className="ui-panel-status">Carregando categorias...</p>
          ) : despesas ? (
            categorias.length ? (
              <Distribuicao itens={categorias} unidade="R$ em despesas" />
            ) : (
              <p className="ui-panel-status">Nenhuma despesa no período.</p>
            )
          ) : (
            <p className="ui-panel-status">Detalhamento indisponível.</p>
          )}
        </Card>
      </div>
    </>
  );
}
