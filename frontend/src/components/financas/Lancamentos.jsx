import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../ui/Card";
import TabelaResponsiva from "../ui/TabelaResponsiva";
import Paginacao from "../ui/Paginacao";
import { EstadoVazio } from "../ui/Estado";
import { formatarDataSemFuso } from "../../utils/datas";
const colunas = [
  { id: "data", rotulo: "Data", render: (r) => formatarDataSemFuso(r.data) },
  {
    id: "categoria",
    rotulo: "Categoria",
    render: (r) => (
      <span className={`financial-tag ${r.tipo}`}>{r.categoria}</span>
    ),
  },
  {
    id: "descricao",
    rotulo: "Descrição",
    render: (r) => (
      <>
        <strong>{r.descricao}</strong>
        {r.observacao && <small className="table-note">{r.observacao}</small>}
        <small className="table-note">
          {r.forma_recebimento || r.forma_pagamento || "Forma não informada"}
        </small>
      </>
    ),
  },
  {
    id: "valor",
    rotulo: "Valor",
    render: (r) => (
      <strong
        className={
          r.tipo === "despesa" ? "profit-negative" : "financial-positive"
        }
      >
        {r.tipo === "despesa" ? "−" : "+"}{" "}
        {Number(r.valor).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        })}
      </strong>
    ),
  },
  {
    id: "propriedade",
    rotulo: "Propriedade",
    secundaria: true,
    render: (r) => r.propriedade,
  },
];
export default function Lancamentos({
  receitas,
  despesas,
  onEditar,
  onExcluir,
  processando,
}) {
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);
  const itens = useMemo(
    () =>
      [
        ...receitas.map((r) => ({
          ...r,
          id: `r${r.id}`,
          registro: r,
          tipo: "receita",
        })),
        ...(despesas || []).map((r) => ({
          ...r,
          id: `d${r.id}`,
          registro: r,
          tipo: "despesa",
        })),
      ].sort(
        (a, b) =>
          String(b.data).localeCompare(String(a.data)) ||
          b.registro.id - a.registro.id,
      ),
    [receitas, despesas],
  );
  const atual = Math.min(
    pagina,
    Math.max(1, Math.ceil(itens.length / porPagina)),
  );
  return (
    <Card
      titulo="Lançamentos do período"
      icone="despesas"
      className="ui-table-panel"
    >
      {itens.length ? (
        <TabelaResponsiva
          nome="Lançamentos financeiros"
          colunas={colunas}
          itens={itens.slice((atual - 1) * porPagina, atual * porPagina)}
          renderAcoes={(r) =>
            r.tipo === "receita" ? (
              <div className="record-actions">
                <button
                  className="button-secondary"
                  type="button"
                  disabled={processando}
                  onClick={() => onEditar(r.registro)}
                >
                  Editar
                </button>
                <button
                  className="button-danger"
                  type="button"
                  disabled={processando}
                  onClick={() => onExcluir(r.registro)}
                >
                  Excluir
                </button>
              </div>
            ) : (
              <Link className="button-link" to="/despesas">
                Gerenciar despesa
              </Link>
            )
          }
        />
      ) : (
        <EstadoVazio
          titulo="Nenhum lançamento encontrado"
          descricao="Ajuste o período ou registre uma receita ou despesa."
          icone="dinheiro"
        />
      )}
      <Paginacao
        total={itens.length}
        pagina={atual}
        porPagina={porPagina}
        onPagina={setPagina}
        onPorPagina={(n) => {
          setPorPagina(n);
          setPagina(1);
        }}
      />
    </Card>
  );
}
