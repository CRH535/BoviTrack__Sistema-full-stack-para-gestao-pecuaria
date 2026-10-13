import { Link } from "react-router-dom";
import IconeImagem from "../IconeImagem";
import IlustracaoModulo from "../IlustracaoModulo";
export default function Kpi({
  rotulo,
  valor,
  contexto,
  icone,
  ilustrado = false,
  tom = "success",
  to,
}) {
  const Tag = to ? Link : "article";
  return (
    <Tag
      className={`stat-card ui-kpi tone-${tom}${to ? " dashboard-link-card" : ""}`}
      {...(to ? { to } : {})}
    >
      {icone && (
        <span className="ui-kpi-icon">
          {ilustrado ? <IlustracaoModulo nome={icone} /> : <IconeImagem nome={icone} />}
        </span>
      )}
      <div>
        <span>{rotulo}</span>
        <strong>{valor}</strong>
        <small>{contexto}</small>
      </div>
    </Tag>
  );
}
