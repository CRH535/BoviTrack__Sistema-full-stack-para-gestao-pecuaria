import assert from "node:assert/strict";
import { test } from "node:test";
import axios from "axios";
import api, { definirLogoutEmAndamento, definirTokenAcesso, limparTokenAcesso, obterTokenAcesso, renovarSessao } from "../src/services/api.js";

function resposta(config, data, headers = {}) {
  return { config, data, headers, status: 200, statusText: "OK" };
}

test("refresh atrasado não ressuscita logout nem substitui login novo", async () => {
  definirLogoutEmAndamento(false);
  let liberar;
  let iniciou;
  const iniciado = new Promise((resolve) => { iniciou = resolve; });
  api.defaults.adapter = (config) => new Promise((resolve) => {
    liberar = () => resolve(resposta(config, { token: "token-antigo" }));
    iniciou();
  });
  const pendente = renovarSessao();
  const rejeitado = assert.rejects(pendente, axios.isCancel);
  await iniciado;
  definirLogoutEmAndamento(true);
  limparTokenAcesso();
  definirTokenAcesso("login-novo");
  liberar();
  await rejeitado;
  assert.equal(obterTokenAcesso(), "login-novo");
  definirLogoutEmAndamento(false);
});

test("requisições simultâneas compartilham uma rotação", async () => {
  limparTokenAcesso();
  let chamadas = 0;
  api.defaults.adapter = async (config) => {
    chamadas++;
    return resposta(config, { token: "renovado" });
  };
  await Promise.all([renovarSessao(), renovarSessao(), renovarSessao()]);
  assert.equal(chamadas, 1);
  assert.equal(obterTokenAcesso(), "renovado");
});

test("resposta de conta anterior é descartada", async () => {
  let liberar;
  let iniciou;
  const iniciado = new Promise((resolve) => { iniciou = resolve; });
  api.defaults.adapter = (config) => new Promise((resolve) => {
    liberar = () => resolve(resposta(config, [{ nome: "dados privados antigos" }]));
    iniciou();
  });
  const requisicao = api.get("/animais");
  const rejeitado = assert.rejects(requisicao, axios.isCancel);
  await iniciado;
  definirTokenAcesso("outra-conta");
  liberar();
  await rejeitado;
});

test("paginação preserva filtros e não devolve lista truncada", async () => {
  let chamadas = 0;
  api.defaults.adapter = async (config) => {
    chamadas++;
    assert.equal(config.params.propriedade_id, 7);
    return resposta(config, [config.params.page], { "x-has-more": config.params.page < 3 ? "true" : "false" });
  };
  assert.deepEqual((await api.getAll("/animais", { params: { propriedade_id: 7 } })).data, [1, 2, 3]);
  assert.equal(chamadas, 3);
  api.defaults.adapter = async (config) => resposta(config, [], { "x-has-more": "true" });
  await assert.rejects(api.getAll("/animais"), /10.000/);
  api.defaults.adapter = async (config) => resposta(config, { pesagens: [] }, { "x-has-more": "true" });
  await assert.rejects(api.getAllNested("/animais/1/pesagens", "pesagens"), /10.000/);
});

test("paginação composta não mistura contas entre páginas", async () => {
  for (const nested of [false, true]) {
    let chamadas = 0;
    const dados = ["conta anterior"];
    dados[Symbol.iterator] = function* () {
      definirTokenAcesso("conta nova");
      yield "conta anterior";
    };
    api.defaults.adapter = async (config) => {
      chamadas++;
      return resposta(config, nested ? { itens: dados } : dados, { "x-has-more": "true" });
    };
    await assert.rejects(nested ? api.getAllNested("/historico", "itens") : api.getAll("/animais"), axios.isCancel);
    assert.equal(chamadas, 1);
  }
});

test("cookie de outra conta não substitui silenciosamente a identidade ativa", async () => {
  const events = [];
  globalThis.window = { dispatchEvent: (event) => events.push(event.type) };
  definirTokenAcesso("conta-1", 1);
  api.defaults.adapter = async (config) => resposta(config, { token: "conta-2", usuario: { id: 2 } });
  await assert.rejects(renovarSessao(), axios.isCancel);
  assert.equal(obterTokenAcesso(), null);
  assert.deepEqual(events, ["bovitrack:sessao-encerrada"]);
  delete globalThis.window;
});
