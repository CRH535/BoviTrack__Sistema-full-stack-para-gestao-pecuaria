const { Pool } = require("pg");
const { criarConfiguracaoBanco } = require("./config");
const { registrarErro } = require("../utils/log");

let pool;

function obterPoolAutenticacao() {
  if (!pool) {
    const conexao = process.env.DATABASE_AUTH_URL;
    if (!conexao) throw new Error("DATABASE_AUTH_URL obrigatória");
    pool = new Pool(criarConfiguracaoBanco({ ...process.env, DATABASE_URL: conexao }));
    pool.on("error", (erro) => registrarErro("banco_auth_conexao_ociosa_erro", erro));
  }
  return pool;
}

module.exports = { obterPoolAutenticacao };
