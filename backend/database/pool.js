const { Pool, types } = require("pg");
const { criarConfiguracaoBanco } = require("./config");
const { registrarErro } = require("../utils/log");

// PostgreSQL DATE nao possui horario nem fuso. Manter YYYY-MM-DD evita que a
// serializacao JSON desloque o dia conforme o timezone do servidor.
types.setTypeParser(1082, (valor) => valor);

const pool = new Pool(criarConfiguracaoBanco());

// Uma conexao ociosa pode cair sem haver uma requisicao aguardando query.
// O pg remove esse cliente do pool; registrar apenas codigo/tipo evita expor
// credenciais ou detalhes da conexao e impede um evento error sem listener.
pool.on("error", (erro) => registrarErro("banco_conexao_ociosa_erro", erro));

module.exports = pool;
