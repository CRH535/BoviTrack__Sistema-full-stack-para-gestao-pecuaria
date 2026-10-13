import { useMemo, useState } from "react";
import { EstadoVazio } from "./Estado";
import Paginacao from "./Paginacao";

export default function ColecaoRegistros({
  itens,
  campos,
  children,
  className = "",
  oculto,
}) {
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);
  const lista = useMemo(
    () =>
      itens.filter((item) =>
        campos.some((campo) =>
          String(item[campo] || "")
            .toLocaleLowerCase("pt-BR")
            .includes(busca.toLocaleLowerCase("pt-BR")),
        ),
      ),
    [itens, campos, busca],
  );
  const atual = Math.min(
    pagina,
    Math.max(1, Math.ceil(lista.length / porPagina)),
  );
  return (
    <section
      hidden={oculto}
      className="ui-collection"
      aria-label="Consultar registros"
    >
      <div className="panel collection-toolbar">
        <label>
          Pesquisar registros
          <input
            type="search"
            value={busca}
            placeholder="Buscar nos registros cadastrados..."
            onChange={(e) => {
              setBusca(e.target.value);
              setPagina(1);
            }}
          />
        </label>
        <span>
          {lista.length}{" "}
          {lista.length === 1 ? "registro encontrado" : "registros encontrados"}
        </span>
        <button
          className="button-secondary"
          type="button"
          onClick={() => {
            setBusca("");
            setPagina(1);
          }}
        >
          Limpar busca
        </button>
      </div>
      {lista.length ? (
        <div className={`record-grid ${className}`}>
          {lista
            .slice((atual - 1) * porPagina, atual * porPagina)
            .map(children)}
        </div>
      ) : (
        <EstadoVazio
          titulo="Nenhum registro encontrado"
          descricao="Ajuste a busca ou use o formulário acima para cadastrar."
          icone="busca"
        />
      )}
      <Paginacao
        total={lista.length}
        pagina={atual}
        porPagina={porPagina}
        onPagina={setPagina}
        onPorPagina={(n) => {
          setPorPagina(n);
          setPagina(1);
        }}
      />
    </section>
  );
}
