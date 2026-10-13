export default function Abas({ itens, ativa, onChange, id = "ficha" }) {
  function teclado(event, index) {
    let destino;
    if (event.key === "ArrowRight") destino = (index + 1) % itens.length;
    if (event.key === "ArrowLeft")
      destino = (index - 1 + itens.length) % itens.length;
    if (event.key === "Home") destino = 0;
    if (event.key === "End") destino = itens.length - 1;
    if (destino !== undefined) {
      event.preventDefault();
      onChange(itens[destino].id);
      document.getElementById(`${id}-tab-${itens[destino].id}`)?.focus();
    }
  }
  return (
    <div className="ui-tabs" role="tablist" aria-label="Informações do animal">
      {itens.map((item, index) => (
        <button
          id={`${id}-tab-${item.id}`}
          type="button"
          role="tab"
          aria-selected={ativa === item.id}
          aria-controls={`${id}-panel-${item.id}`}
          tabIndex={ativa === item.id ? 0 : -1}
          className={ativa === item.id ? "active" : ""}
          onClick={() => onChange(item.id)}
          onKeyDown={(e) => teclado(e, index)}
          key={item.id}
        >
          {item.rotulo}
        </button>
      ))}
    </div>
  );
}
