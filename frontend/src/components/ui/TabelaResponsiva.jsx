export default function TabelaResponsiva({
  colunas,
  itens,
  renderAcoes,
  ordenacao,
  onOrdenar,
  nome = "Registros",
  linhaClassName = "",
}) {
  return (
    <table className="ui-table" aria-label={nome}>
      <thead>
        <tr>
          {colunas.map((col) => (
            <th
              key={col.id}
              className={col.secundaria ? "secondary-column" : ""}
              scope="col"
              aria-sort={
                ordenacao?.campo === col.id
                  ? ordenacao.direcao === "asc"
                    ? "ascending"
                    : "descending"
                  : undefined
              }
            >
              {col.ordenavel && onOrdenar ? (
                <button
                  className="ui-sort"
                  type="button"
                  onClick={() => onOrdenar(col.id)}
                >
                  {col.rotulo}
                  <span aria-hidden="true">
                    {ordenacao?.campo === col.id
                      ? ordenacao.direcao === "asc"
                        ? "↑"
                        : "↓"
                      : "↕"}
                  </span>
                </button>
              ) : (
                col.rotulo
              )}
            </th>
          ))}
          {renderAcoes && <th scope="col">Ações</th>}
        </tr>
      </thead>
      <tbody>
        {itens.map((item) => (
          <tr key={item.id} className={linhaClassName}>
            {colunas.map((col) => (
              <td
                key={col.id}
                className={col.secundaria ? "secondary-column" : ""}
                data-label={col.rotulo}
              >
                {col.render(item)}
              </td>
            ))}
            {renderAcoes && (
              <td className="ui-table-actions" data-label="Ações">
                {renderAcoes(item)}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
