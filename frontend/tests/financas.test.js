import test from "node:test";
import assert from "node:assert/strict";
import { agruparFinancas, filtrarDespesas } from "../src/utils/financas.js";

test("período financeiro usa segunda-feira, limites inclusivos e calendário de São Paulo", () => {
  const itens = [
    { id: 1, data: "2026-10-11", propriedade_id: 1 },
    { id: 2, data: "2026-10-12", propriedade_id: 1 },
    { id: 3, data: "2026-10-13", propriedade_id: 1 },
    { id: 4, data: "2026-10-14", propriedade_id: 1 },
    { id: 5, data: "2026-10-13", propriedade_id: 2 },
  ];
  assert.deepEqual(
    filtrarDespesas(
      itens,
      { periodo: "semana", propriedade_id: "1" },
      new Date("2026-10-14T02:00:00Z"),
    ).map((d) => d.id),
    [2, 3],
  );
  assert.deepEqual(
    filtrarDespesas(itens, {
      periodo: "personalizado",
      data_inicio: "2026-10-11",
      data_fim: "2026-10-12",
    }).map((d) => d.id),
    [1, 2],
  );
});
test("agregação preserva centavos, meses independentes e lucro negativo", () => {
  const meses = agruparFinancas(
    [
      { data: "2026-01-01", valor: ".10" },
      { data: "2026-01-02", valor: ".20" },
    ],
    [{ data: "2026-02-01", valor: "5.00" }],
  );
  assert.deepEqual(meses, [
    { mes: "2026-01", receitas: 0.3, despesas: 0, lucro: 0.3 },
    { mes: "2026-02", receitas: 0, despesas: 5, lucro: -5 },
  ]);
});
