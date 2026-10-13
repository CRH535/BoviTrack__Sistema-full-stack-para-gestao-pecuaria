import Button from "./ui/Button";
import { useEffect, useId, useRef, useState } from "react";

function ConfirmacaoExclusao({
  aberto,
  titulo,
  mensagem,
  confirmacaoExigida,
  impacto,
  impactoObrigatorio = false,
  carregandoImpacto = false,
  erroImpacto = "",
  rotuloConfirmar = "Confirmar exclusão",
  rotuloProcessando = "Excluindo...",
  processando = false,
  onCancelar,
  onConfirmar,
}) {
  const [confirmacao, setConfirmacao] = useState("");
  const dialogRef = useRef(null);
  const tituloId = useId();
  const descricaoId = useId();
  const campoId = useId();

  useEffect(() => {
    if (!aberto) return undefined;
    const dialog = dialogRef.current;
    const focoAnterior = document.activeElement;
    const overflowAnterior = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflowAnterior;
      if (focoAnterior?.isConnected) focoAnterior.focus({ preventScroll: true });
    };
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return undefined;

    function fecharComEscape(evento) {
      if (evento.key === "Escape" && !processando) {
        setConfirmacao("");
        onCancelar();
      }
    }

    document.addEventListener("keydown", fecharComEscape);
    return () => document.removeEventListener("keydown", fecharComEscape);
  }, [aberto, onCancelar, processando]);

  if (!aberto) return null;

  const confirmacaoValida =
    (!confirmacaoExigida || confirmacao === confirmacaoExigida) &&
    (!impactoObrigatorio || Boolean(impacto)) &&
    !carregandoImpacto &&
    !erroImpacto;

  function cancelar() {
    if (processando) return;

    setConfirmacao("");
    onCancelar();
  }

  function confirmar(evento) {
    evento.preventDefault();

    if (confirmacaoValida && !processando) {
      setConfirmacao("");
      onConfirmar();
    }
  }

  return (
      <dialog
        ref={dialogRef}
        className="panel confirmation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={descricaoId}
        onCancel={(evento) => evento.preventDefault()}
      >
        <span className="danger-kicker">Ação permanente</span>
        <h2 id={tituloId}>{titulo}</h2>
        <p id={descricaoId}>{mensagem}</p>

        {impactoObrigatorio && carregandoImpacto && (
          <div className="deletion-impact-status" role="status">
            <span className="deletion-impact-spinner" aria-hidden="true" />
            Carregando informações da exclusão...
          </div>
        )}

        {impactoObrigatorio && erroImpacto && (
          <div className="deletion-impact-error" role="alert">
            <strong>Exclusão bloqueada por segurança.</strong>
            <span>{erroImpacto}</span>
          </div>
        )}

        {impactoObrigatorio && impacto && (
          <ResumoImpactoExclusao impacto={impacto} />
        )}

        <form onSubmit={confirmar}>
          {confirmacaoExigida && (
            <div className="confirmation-field">
              <label htmlFor={campoId}>
                Digite <strong>{confirmacaoExigida}</strong> para confirmar
              </label>
              <input
                id={campoId}
                type="text"
                value={confirmacao}
                onChange={(evento) => setConfirmacao(evento.target.value)}
                autoComplete="off"
                autoFocus
                disabled={processando}
              />
            </div>
          )}

          <div className="confirmation-actions">
            <Button startIcon="fechar"
              className="button-secondary"
              type="button"
              onClick={cancelar}
              disabled={processando}
              autoFocus={!confirmacaoExigida}
            >
              Cancelar
            </Button>
            <Button startIcon="excluir" loading={processando}
              className="button-danger"
              type="submit"
              disabled={!confirmacaoValida || processando}
            >
              {processando ? rotuloProcessando : rotuloConfirmar}
            </Button>
          </div>
        </form>
      </dialog>
  );
}

const ROTULOS_RESUMO = {
  propriedades: "propriedades",
  animais: "animais",
  lotes: "lotes",
  animais_lotes: "vínculos animal/lote",
  pesagens: "pesagens",
  desmamas: "desmamas",
  vacinacoes: "vacinações",
  despesas: "despesas",
  receitas: "receitas",
  producoes_leiteiras: "produções leiteiras",
  vacinas: "vacinas cadastradas",
  sessoes_refresh: "sessões de acesso",
  sessoes_refresh_usados: "registros técnicos de sessão",
};

function formatarData(valor) {
  if (!valor) return "";
  const texto = String(valor).slice(0, 10);
  const partes = texto.split("-");
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : texto;
}

function detalhesResumo(resumo) {
  if (!resumo) return "";

  return Object.entries(resumo)
    .filter(([, total]) => Number(total) > 0)
    .map(([chave, total]) => `${total} ${ROTULOS_RESUMO[chave] || chave}`)
    .join(" · ");
}

function descreverRegistro(chave, registro) {
  switch (chave) {
    case "propriedades":
      return [registro.nome, detalhesResumo(registro.resumo)].filter(Boolean);
    case "animais":
      return [
        registro.nome || `Animal ${registro.id}`,
        registro.numero_brinco ? `Brinco ${registro.numero_brinco}` : "Sem brinco",
      ];
    case "lotes":
      return [registro.nome || `Lote ${registro.id}`];
    case "animais_lotes":
      return [`${registro.animal_nome} → ${registro.lote_nome}`];
    case "pesagens":
      return [
        registro.animal_nome,
        `${registro.peso_kg} kg em ${formatarData(registro.data_pesagem)}`,
      ];
    case "desmamas":
      return [
        registro.animal_nome,
        `${registro.status} · ${formatarData(registro.data_desmama || registro.data_planejada)}`,
      ];
    case "vacinacoes":
      return [
        registro.animal_nome,
        `${registro.vacina_nome} · ${formatarData(registro.data_aplicacao)}`,
      ];
    case "despesas":
    case "receitas":
      return [registro.descricao, `${registro.categoria} · ${formatarData(registro.data)}`];
    case "producoes_leiteiras":
      return [
        registro.animal_nome,
        `${registro.quantidade_litros} L · ${formatarData(registro.data)}`,
      ];
    case "vacinas":
      return [registro.nome, registro.fabricante].filter(Boolean);
    case "sessoes_refresh":
      return [`Sessão de acesso ${registro.id}`];
    case "sessoes_refresh_usados":
      return [`Registro técnico de sessão ${registro.id}`];
    default:
      return [registro.nome || registro.descricao || `Registro ${registro.id}`];
  }
}

function ResumoImpactoExclusao({ impacto }) {
  const semRelacionados = impacto.total_registros === 0;

  return (
    <div className="deletion-impact">
      {semRelacionados ? (
        <div className="deletion-impact-empty">
          <strong>Esta entidade não possui registros relacionados.</strong>
          <span>Será excluída apenas: {impacto.entidade.nome}</span>
        </div>
      ) : (
        <>
          <p className="deletion-impact-warning">
            Ao excluir, todos os registros listados abaixo serão removidos
            permanentemente.
          </p>

          <ul className="deletion-impact-totals" aria-label="Totais afetados">
            {Object.entries(impacto.resumo)
              .filter(([, total]) => Number(total) > 0)
              .map(([chave, total]) => (
                <li key={chave}>
                  <strong>{total}</strong> {ROTULOS_RESUMO[chave] || chave}
                </li>
              ))}
          </ul>

          <div className="deletion-impact-groups">
            {impacto.grupos.map((grupo) => (
              <details key={grupo.chave} className="deletion-impact-group">
                <summary>
                  <span>{grupo.titulo}</span>
                  <span className="count-badge">{grupo.total}</span>
                </summary>
                <ul>
                  {grupo.registros.map((registro, indice) => {
                    const [principal, detalhe] = descreverRegistro(
                      grupo.chave,
                      registro,
                    );
                    return (
                      <li key={registro.id ?? `${grupo.chave}-${indice}`}>
                        <strong>{principal}</strong>
                        {detalhe && <span>{detalhe}</span>}
                      </li>
                    );
                  })}
                </ul>
              </details>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default ConfirmacaoExclusao;
