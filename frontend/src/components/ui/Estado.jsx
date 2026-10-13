import IconeImagem from "../IconeImagem";
export function EstadoVazio({ titulo, descricao, acao, icone = "animais" }) {
  return (
    <div className="empty-state ui-empty">
      <span className="ui-empty-icon">
        <IconeImagem nome={icone} />
      </span>
      <strong>{titulo}</strong>
      {descricao && <p>{descricao}</p>}
      {acao}
    </div>
  );
}
export function Carregamento({ texto = "Carregando registros...", cards = 3 }) {
  return (
    <div className="ui-loading" role="status">
      <span>{texto}</span>
      <div className="ui-skeleton-grid" aria-hidden="true">
        {Array.from({ length: cards }, (_, i) => (
          <div className="ui-skeleton" key={i}>
            <i />
            <i />
            <i />
          </div>
        ))}
      </div>
    </div>
  );
}
