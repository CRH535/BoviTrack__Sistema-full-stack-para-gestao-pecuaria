import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import IconeImagem from "../IconeImagem";
export default function FormularioCadastro({ titulo, editando, children }) {
  const ref = useRef(null);
  const [params] = useSearchParams();
  const solicitado = params.get("novo") === "1";
  useEffect(() => {
    if (editando || solicitado) {
      ref.current.open = true;
      ref.current
        .querySelector("input, select")
        ?.focus({ preventScroll: true });
      ref.current.scrollIntoView({ block: "nearest", behavior: "instant" });
    }
  }, [editando, solicitado]);
  return (
    <details ref={ref} className="panel ui-registration">
      <summary>
        <span>
          <IconeImagem nome="mais" />
          {editando ? "Editar registro" : titulo}
        </span>
        <span className="ui-registration-hint">
          Preencher dados <IconeImagem nome="seta" />
        </span>
      </summary>
      {children}
    </details>
  );
}
