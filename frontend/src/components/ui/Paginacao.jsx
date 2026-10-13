import { IconButton } from "./Button";
export default function Paginacao({
  total,
  pagina,
  porPagina,
  onPagina,
  onPorPagina,
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  return (
    <footer className="ui-pagination">
      <span>
        {total
          ? `${(pagina - 1) * porPagina + 1}–${Math.min(pagina * porPagina, total)} de ${total} registros`
          : "0 registros"}
      </span>
      <div>
        <label>
          Por página{" "}
          <select
            value={porPagina}
            onChange={(e) => onPorPagina(Number(e.target.value))}
          >
            {[10, 25, 50].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <IconButton
          icon="voltar"
          label="Página anterior"
          type="button"
          className="button-secondary button-small"
          disabled={pagina <= 1}
          onClick={() => onPagina(pagina - 1)}
        />
        <span aria-live="polite">
          {pagina} / {paginas}
        </span>
        <IconButton
          icon="avancar"
          label="Próxima página"
          type="button"
          className="button-secondary button-small"
          disabled={pagina >= paginas}
          onClick={() => onPagina(pagina + 1)}
        />
      </div>
    </footer>
  );
}
