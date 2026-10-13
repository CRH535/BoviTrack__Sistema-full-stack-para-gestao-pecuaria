import { useRef, useState } from "react";
import { IconButton } from "./ui/Button";

function PasswordInput({ rotulo = "senha", ...inputProps }) {
  const [visivel, setVisivel] = useState(false);
  const inputRef = useRef(null);
  const acao = `${visivel ? "Ocultar" : "Mostrar"} ${rotulo.toLowerCase()}`;

  function alternarVisibilidade() {
    setVisivel((valor) => !valor);
    inputRef.current?.focus({ preventScroll: true });
  }

  return (
    <div className="password-field">
      <input
        {...inputProps}
        ref={inputRef}
        type={visivel ? "text" : "password"}
      />
      <IconButton
        icon={visivel ? "ocultar" : "visualizar"}
        className="password-toggle"
        type="button"
        label={acao}
        aria-pressed={visivel}
        onClick={alternarVisibilidade}
      />
    </div>
  );
}

export default PasswordInput;
