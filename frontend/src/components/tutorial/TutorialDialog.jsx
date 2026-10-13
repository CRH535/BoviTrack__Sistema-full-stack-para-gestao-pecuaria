import Button from "../ui/Button";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

function obterElementosFocaveis(container) {
  return Array.from(
    container?.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? [],
  );
}

function TutorialDialog({ eyebrow, title, description, actions, onEscape }) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const botaoPreferencial = dialogRef.current?.querySelector("[data-autofocus]");
      const primeiroBotao = obterElementosFocaveis(dialogRef.current)[0];
      (botaoPreferencial || primeiroBotao)?.focus();
    });

    function controlarTeclado(evento) {
      if (evento.key === "Escape" && onEscape) {
        evento.preventDefault();
        onEscape();
        return;
      }

      if (evento.key !== "Tab") return;
      const focaveis = obterElementosFocaveis(dialogRef.current);
      if (!focaveis.length) return;

      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primeiro.focus();
      } else if (!dialogRef.current?.contains(document.activeElement)) {
        evento.preventDefault();
        primeiro.focus();
      }
    }

    document.addEventListener("keydown", controlarTeclado);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", controlarTeclado);
    };
  }, [onEscape, title]);

  return createPortal(
    <div className="tutorial-dialog-backdrop">
      <section
        ref={dialogRef}
        className="tutorial-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        {eyebrow && <span className="tutorial-eyebrow">{eyebrow}</span>}
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>

        <div className="tutorial-dialog-actions">
          {actions.map((acao) => (
            <Button startIcon={acao.variant === "secondary" ? "fechar" : "tutorial"}
              key={acao.label}
              type="button"
              className={`tutorial-button tutorial-button--${acao.variant || "primary"}`}
              onClick={acao.onClick}
              data-autofocus={acao.autoFocus ? "true" : undefined}
            >
              {acao.label}
            </Button>
          ))}
        </div>
      </section>
    </div>,
    document.body,
  );
}

export default TutorialDialog;
