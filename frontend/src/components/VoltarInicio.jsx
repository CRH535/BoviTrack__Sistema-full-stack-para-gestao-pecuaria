import { Link } from "react-router-dom";
import Icone from "./Icone";

function VoltarInicio({ className = "" }) {
  return (
    <Link
      className={`button-secondary button-link back-home-button ${className}`.trim()}
      to="/"
      aria-label="Voltar ao Dashboard Inicial"
    >
      <Icone nome="voltar" className="back-home-icon" />
      Voltar ao Início
    </Link>
  );
}

export default VoltarInicio;
