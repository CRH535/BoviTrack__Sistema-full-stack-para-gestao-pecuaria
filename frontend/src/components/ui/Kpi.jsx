import { Link } from "react-router-dom";
import IconeImagem from "../IconeImagem";
export default function Kpi({
  rotulo,
  valor,
  contexto,
  icone,
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
          <IconeImagem nome={icone} />
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
