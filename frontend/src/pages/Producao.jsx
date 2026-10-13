import SearchInput from "../components/ui/SearchInput";
import Button from "../components/ui/Button";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import IconeImagem from "../components/IconeImagem";
import Card from "../components/ui/Card";
import { Carregamento, EstadoVazio } from "../components/ui/Estado";

export default function Producao() {
  const [animais, setAnimais] = useState([]);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api
      .getAll("/animais", { signal: controller.signal })
      .then((resposta) => {
        setAnimais(resposta.data);
        setErro(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setErro(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setCarregando(false);
      });
    return () => controller.abort();
  }, [tentativa]);
  const lista = animais.filter((animal) =>
    `${animal.nome} ${animal.numero_brinco || ""} ${animal.propriedade}`
      .toLocaleLowerCase("pt-BR")
      .includes(busca.toLocaleLowerCase("pt-BR")),
  );
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Controle leiteiro</span>
          <h1>Produção leiteira</h1>
          <p>
            Selecione um animal para registrar ordenhas e acompanhar sua
            produção.
          </p>
        </div>
        <Button as={Link} startIcon="lucros" className="button-link" to="/lucros">
          Ver resultados financeiros
        </Button>
      </header>
      <Card titulo="Acompanhamento por animal" icone="producao">
        <label htmlFor="busca-producao">
          Buscar por nome, brinco ou propriedade
        </label>
        <SearchInput
          id="busca-producao"
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Encontre o animal para registrar a ordenha"
        />
      </Card>
      {carregando ? (
        <Carregamento />
      ) : erro ? (
        <div className="notice notice-error" role="alert">
          Não foi possível carregar os animais.{" "}
          <Button startIcon="atualizar"
            type="button"
            onClick={() => {
              setCarregando(true);
              setTentativa((n) => n + 1);
            }}
          >
            Tentar novamente
          </Button>
        </div>
      ) : (
        <>
          <div className="section-heading">
            <h2>Animais disponíveis</h2>
            <span className="count-badge">{lista.length}</span>
          </div>
          {lista.length ? (
            <div className="record-grid">
              {lista.map((animal) => (
                <article className="record-card" key={animal.id}>
                  <span className="record-icon">
                    <IconeImagem
                      nome="producao"
                      className="record-icon-image"
                    />
                  </span>
                  <h3>{animal.nome}</h3>
                  <p>Brinco {animal.numero_brinco || "não informado"}</p>
                  <p>{animal.propriedade}</p>
                  <div className="record-actions">
                    <Button as={Link} startIcon="producao"
                      className="button-link"
                      to={`/animais/${animal.id}?aba=producao`}
                    >
                      Abrir controle leiteiro
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EstadoVazio
              titulo="Nenhum animal encontrado"
              descricao="Cadastre um animal ou ajuste a busca para começar."
              acao={
                <Button as={Link} startIcon="mais" className="button-link" to="/animais?novo=1">
                  Cadastrar animal
                </Button>
              }
            />
          )}
        </>
      )}
    </div>
  );
}
