import Button from "./ui/Button";
import { Link } from "react-router-dom";

function RegistroFichaNotice({ tipo, acao }) {
  return (
    <aside
      className="notice record-entry-notice"
      role="note"
      aria-label={`Orientação para registrar ${tipo}`}
    >
      <span className="record-entry-notice-icon" aria-hidden="true">i</span>
      <p>
        Os registros de {tipo} são feitos diretamente na ficha do animal. Acesse{" "}
        <strong>Animais &gt; Ver ficha</strong> para {acao}.
      </p>
      <Button as={Link} startIcon="animais" className="button-secondary button-link" to="/animais">
        Ir para Animais
      </Button>
    </aside>
  );
}

export default RegistroFichaNotice;
