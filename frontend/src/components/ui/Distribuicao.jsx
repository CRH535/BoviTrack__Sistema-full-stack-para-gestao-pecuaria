export default function Distribuicao({ itens, unidade = "registros" }) {
  const total = itens.reduce((soma, item) => soma + Number(item.valor), 0);
  const cores = [
    "var(--chart-line)",
    "#7cb879",
    "#b4d8ad",
    "#76879b",
    "#b8c5cf",
  ];
  let acumulado = 0;
  const segmentos = [];
  for (const [index, item] of itens.entries()) {
    const parte = total ? (Number(item.valor) / total) * 100 : 0;
    segmentos.push({
      ...item,
      id: item.id ?? `${item.nome}-${index}`,
      parte,
      inicio: acumulado,
      cor: cores[index % cores.length],
    });
    acumulado += parte;
  }
  return (
    <div className="ui-distribution">
      <div className="ui-donut">
        <svg
          viewBox="0 0 120 120"
          role="img"
          aria-label={itens
            .map((item) => `${item.nome}: ${item.valor}`)
            .join(", ")}
        >
          <circle
            cx="60"
            cy="60"
            r="45"
            fill="none"
            stroke="var(--track)"
            strokeWidth="19"
          />
          {segmentos
            .filter((item) => item.parte > 0)
            .map((item) => (
              <circle
                key={item.id}
                cx="60"
                cy="60"
                r="45"
                fill="none"
                stroke={item.cor}
                strokeWidth="19"
                pathLength="100"
                strokeDasharray={`${item.parte} ${100 - item.parte}`}
                strokeDashoffset={-item.inicio}
                transform="rotate(-90 60 60)"
              >
                <title>
                  {item.nome}: {item.valor}
                </title>
              </circle>
            ))}
        </svg>
        <div>
          <strong>
            {total.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
          </strong>
          <span>{unidade}</span>
        </div>
      </div>
      <ul>
        {segmentos.map((item) => (
          <li key={item.id}>
            <span
              className="distribution-dot"
              style={{ background: item.cor }}
            />
            <span>{item.nome}</span>
            <strong>
              {Number(item.valor).toLocaleString("pt-BR", {
                maximumFractionDigits: 2,
              })}
              <small>
                {item.parte.toLocaleString("pt-BR", {
                  maximumFractionDigits: 1,
                })}
                %
              </small>
            </strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
