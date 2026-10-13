import Button from "../ui/Button";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const HIGHLIGHT_PADDING = 8;
const VIEWPORT_MARGIN = 16;
const TOOLTIP_GAP = 18;

function obterElementosFocaveis(container) {
  return Array.from(container?.querySelectorAll("button:not([disabled])") ?? []);
}

function elementoEstaVisivel(rect) {
  return (
    rect.top >= VIEWPORT_MARGIN &&
    rect.left >= VIEWPORT_MARGIN &&
    rect.bottom <= window.innerHeight - VIEWPORT_MARGIN &&
    rect.right <= window.innerWidth - VIEWPORT_MARGIN
  );
}

function TutorialOverlay({
  step,
  stepIndex,
  totalSteps,
  onPrevious,
  onNext,
  onSkip,
  onExit,
}) {
  const [targetRect, setTargetRect] = useState(null);
  const [tooltipSize, setTooltipSize] = useState({ width: 390, height: 280 });
  const tooltipRef = useRef(null);
  const scrollRequestedRef = useRef(false);
  const targetReady = Boolean(targetRect);

  useEffect(() => {
    scrollRequestedRef.current = false;

    let currentTarget = null;
    let targetResizeObserver = null;
    let frame = 0;

    function updateTarget() {
      frame = 0;
      const foundTarget = document.querySelector(step.target);

      if (foundTarget !== currentTarget) {
        targetResizeObserver?.disconnect();
        currentTarget = foundTarget;
        if (currentTarget && "ResizeObserver" in window) {
          targetResizeObserver = new ResizeObserver(scheduleUpdate);
          targetResizeObserver.observe(currentTarget);
        }
      }

      if (!currentTarget) {
        setTargetRect(null);
        return;
      }

      const rect = currentTarget.getBoundingClientRect();
      if (!scrollRequestedRef.current && !elementoEstaVisivel(rect)) {
        scrollRequestedRef.current = true;
        const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        currentTarget.scrollIntoView({
          behavior: reducedMotion ? "auto" : "smooth",
          block: "center",
          inline: "nearest",
        });
      }

      setTargetRect({
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      });
    }

    function scheduleUpdate() {
      if (frame) return;
      frame = requestAnimationFrame(updateTarget);
    }

    const mutationObserver = new MutationObserver(scheduleUpdate);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);
    scheduleUpdate();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      mutationObserver.disconnect();
      targetResizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
    };
  }, [step.target]);

  useLayoutEffect(() => {
    if (!tooltipRef.current || !("ResizeObserver" in window)) return undefined;

    const observer = new ResizeObserver(([entry]) => {
      setTooltipSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(tooltipRef.current);
    return () => observer.disconnect();
  }, [step.id, targetReady]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      tooltipRef.current?.querySelector("[data-tour-primary]")?.focus();
    });

    function controlarTeclado(evento) {
      if (evento.key === "Escape") {
        evento.preventDefault();
        onExit();
        return;
      }
      if (evento.key !== "Tab") return;

      const focaveis = obterElementosFocaveis(tooltipRef.current);
      if (!focaveis.length) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];

      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primeiro.focus();
      } else if (!tooltipRef.current?.contains(document.activeElement)) {
        evento.preventDefault();
        primeiro.focus();
      }
    }

    document.addEventListener("keydown", controlarTeclado);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", controlarTeclado);
    };
  }, [onExit, step.id, targetReady]);

  const tooltipStyle = useMemo(() => {
    if (!targetRect || window.innerWidth <= 700) return undefined;

    const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - tooltipSize.width - VIEWPORT_MARGIN);
    let left = Math.min(
      Math.max(VIEWPORT_MARGIN, targetRect.left),
      maxLeft,
    );
    let top = targetRect.bottom + TOOLTIP_GAP;

    if (top + tooltipSize.height > window.innerHeight - VIEWPORT_MARGIN) {
      top = targetRect.top - tooltipSize.height - TOOLTIP_GAP;
    }

    if (top < VIEWPORT_MARGIN) {
      const rightSpace = window.innerWidth - targetRect.right;
      if (rightSpace >= tooltipSize.width + TOOLTIP_GAP + VIEWPORT_MARGIN) {
        left = targetRect.right + TOOLTIP_GAP;
      } else if (targetRect.left >= tooltipSize.width + TOOLTIP_GAP + VIEWPORT_MARGIN) {
        left = targetRect.left - tooltipSize.width - TOOLTIP_GAP;
      }
      top = Math.min(
        Math.max(VIEWPORT_MARGIN, targetRect.top),
        Math.max(VIEWPORT_MARGIN, window.innerHeight - tooltipSize.height - VIEWPORT_MARGIN),
      );
    }

    return { top, left };
  }, [targetRect, tooltipSize]);

  const highlightStyle = targetRect
    ? {
        top: Math.max(0, targetRect.top - HIGHLIGHT_PADDING),
        left: Math.max(0, targetRect.left - HIGHLIGHT_PADDING),
        width: Math.min(
          window.innerWidth - Math.max(0, targetRect.left - HIGHLIGHT_PADDING),
          targetRect.width + HIGHLIGHT_PADDING * 2,
        ),
        height: Math.min(
          window.innerHeight - Math.max(0, targetRect.top - HIGHLIGHT_PADDING),
          targetRect.height + HIGHLIGHT_PADDING * 2,
        ),
      }
    : undefined;

  return createPortal(
    <div className="tutorial-tour-layer" aria-live="polite">
      <div className="tutorial-interaction-blocker" aria-hidden="true" />

      {targetRect ? (
        <>
          <div className="tutorial-highlight" style={highlightStyle} aria-hidden="true" />
          <section
            ref={tooltipRef}
            className="tutorial-tooltip"
            style={tooltipStyle}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`tutorial-step-title-${step.id}`}
            aria-describedby={`tutorial-step-description-${step.id}`}
          >
            <div className="tutorial-progress-row">
              <span>Etapa {stepIndex + 1} de {totalSteps}</span>
              <Button startIcon="fechar"
                className="tutorial-exit-link"
                type="button"
                onClick={onExit}
                aria-label="Sair do tutorial"
              >
                Sair do tutorial
              </Button>
            </div>
            <div className="tutorial-progress" aria-hidden="true">
              <span style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }} />
            </div>
            <h2 id={`tutorial-step-title-${step.id}`}>{step.title}</h2>
            <p id={`tutorial-step-description-${step.id}`}>{step.description}</p>

            <div className="tutorial-tooltip-actions">
              <div>
                {stepIndex > 0 && (
                  <Button startIcon="voltar"
                    className="tutorial-button tutorial-button--ghost"
                    type="button"
                    onClick={onPrevious}
                  >
                    Voltar
                  </Button>
                )}
                {stepIndex < totalSteps - 1 && (
                  <Button startIcon="avancar"
                    className="tutorial-button tutorial-button--ghost"
                    type="button"
                    onClick={onSkip}
                  >
                    Pular etapa
                  </Button>
                )}
              </div>
              <Button startIcon={stepIndex === totalSteps - 1 ? "concluir" : "avancar"}
                className="tutorial-button tutorial-button--primary"
                type="button"
                onClick={onNext}
                data-tour-primary="true"
              >
                {stepIndex === totalSteps - 1 ? "Concluir tutorial" : "Próximo"}
              </Button>
            </div>
          </section>
        </>
      ) : (
        <section ref={tooltipRef} className="tutorial-loading" role="dialog" aria-modal="true" aria-label="Etapa indisponível">
          <span className="tutorial-loading-spinner" aria-hidden="true" />
          <p role="status">Preparando esta etapa. Se ela não aparecer, você pode continuar.</p>
          <Button startIcon="fechar" type="button" onClick={onExit}>Sair do tutorial</Button>
          <Button startIcon={stepIndex === totalSteps - 1 ? "concluir" : "avancar"} type="button" onClick={onNext} data-tour-primary="true">{stepIndex === totalSteps - 1 ? "Concluir tutorial" : "Pular etapa"}</Button>
        </section>
      )}
    </div>,
    document.body,
  );
}

export default TutorialOverlay;
