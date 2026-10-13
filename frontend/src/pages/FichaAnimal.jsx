import Button from "../components/ui/Button";
import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import api from "../services/api";
import IconeImagem from "../components/IconeImagem";
const ControlePesagens = lazy(() => import("../components/ControlePesagens"));
const ControleDesmama = lazy(() => import("../components/ControleDesmama"));
const ControleLeiteiro = lazy(() => import("../components/ControleLeiteiro"));
import ResumoAnimal from "../components/animais/ResumoAnimal";
import VacinacaoAnimal from "../components/animais/VacinacaoAnimal";
import Abas from "../components/ui/Abas";
import { Carregamento } from "../components/ui/Estado";
import { formatarDataSemFuso } from "../utils/datas";

const abas = [
  { id: "resumo", rotulo: "Resumo", icone: "resumo" },
  { id: "pesagens", rotulo: "Pesagens", icone: "pesagem" },
  { id: "vacinacao", rotulo: "Vacinação", icone: "vacinacoes" },
  { id: "desmama", rotulo: "Desmama", icone: "desmama" },
  { id: "producao", rotulo: "Produção", icone: "producao" },
  { id: "historico", rotulo: "Histórico", icone: "historico" },
];
export default function FichaAnimal() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const solicitada = params.get("aba");
  const ativa = abas.some((a) => a.id === solicitada) ? solicitada : "resumo";
  const [visitadas, setVisitadas] = useState(() => new Set([ativa]));
  const [animal, setAnimal] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [tentativa, setTentativa] = useState(0);
  const [atualizacaoManejo, setAtualizacaoManejo] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api
      .get(`/animais/${id}`, { signal: controller.signal })
      .then((r) => {
        setAnimal(r.data);
        setErro("");
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setErro("Não foi possível carregar a ficha do animal.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setCarregando(false);
      });
    return () => controller.abort();
  }, [id, tentativa]);
  function abrir(aba) {
    const novo = new URLSearchParams(params);
    novo.set("aba", aba);
    setParams(novo, { replace: true });
    setVisitadas((v) => new Set([...v, aba]));
  }
  async function atualizarAnimal() {
    const resposta = await api.get(`/animais/${id}`);
    setAnimal(resposta.data);
  }
  async function atualizarManejo() {
    await atualizarAnimal();
    setAtualizacaoManejo((valor) => valor + 1);
  }
  const visitada = (aba) => ativa === aba || visitadas.has(aba);
  const painel = (aba) => ({
    id: `ficha-panel-${aba}`,
    role: "tabpanel",
    "aria-labelledby": `ficha-tab-${aba}`,
    hidden: ativa !== aba,
    tabIndex: 0,
  });
  if (carregando) return <Carregamento texto="Carregando ficha do animal..." />;
  if (!animal)
    return (
      <div className="page">
        <h1>Ficha do animal</h1>
        <p className="notice notice-error" role="alert">
          {erro}
        </p>
        <Button startIcon="atualizar"
          type="button"
          onClick={() => {
            setCarregando(true);
            setTentativa((n) => n + 1);
          }}
        >
          Tentar novamente
        </Button>{" "}
        <Button as={Link} startIcon="voltar" className="button-link" to="/animais">
          Voltar para animais
        </Button>
      </div>
    );
  return (
    <div className="page animal-profile-page">
      <nav className="ui-breadcrumb" aria-label="Caminho da ficha">
        <Link to="/animais">Animais</Link>
        <span aria-hidden="true">/</span>
        <span>{animal.nome}</span>
      </nav>
      <header className="page-header animal-profile-header">
        <div>
          <h1>{animal.nome}</h1>
          <p>
            Ficha do animal · identificação, manejo e produção em um só lugar.
          </p>
        </div>
        <Button as={Link} startIcon="voltar" className="button-link" to="/animais">
          Voltar para animais
        </Button>
      </header>
      <section className="panel animal-profile-card">
        <div className="animal-profile-identity">
          <span className="animal-profile-avatar" aria-hidden="true">
            <IconeImagem
              nome="animais"
              className="animal-profile-avatar-image"
            />
          </span>
          <div>
            <span className="eyebrow">Identificação do rebanho</span>
            <h2>{animal.nome}</h2>
            <span className="tag-badge">
              Brinco {animal.numero_brinco || "não informado"}
            </span>
          </div>
        </div>
        <dl className="animal-profile-details">
          <div>
            <dt>Sexo</dt>
            <dd>
              {animal.sexo === "F"
                ? "Fêmea"
                : animal.sexo === "M"
                  ? "Macho"
                  : "Não informado"}
            </dd>
          </div>
          <div>
            <dt>Nascimento</dt>
            <dd>
              {formatarDataSemFuso(animal.data_nascimento, "Não informado")}
            </dd>
          </div>
          <div>
            <dt>Espécie / raça</dt>
            <dd>
              {animal.especie} · {animal.raca || "Raça não informada"}
            </dd>
          </div>
          <div>
            <dt>Propriedade</dt>
            <dd>{animal.propriedade}</dd>
          </div>
          <div>
            <dt>Peso atual</dt>
            <dd>
              {animal.peso == null
                ? "Não informado"
                : `${Number(animal.peso).toLocaleString("pt-BR")} kg`}
            </dd>
          </div>
          <div>
            <dt>Mãe</dt>
            <dd>
              {animal.mae
                ? `${animal.mae} · brinco ${animal.mae_numero_brinco || "não informado"}`
                : "Não informada"}
            </dd>
          </div>
          <div className="animal-profile-lots">
            <dt>Lotes atuais</dt>
            <dd>
              {animal.lotes?.length
                ? animal.lotes.map((l) => (
                    <span className="tag-badge" key={l.id}>
                      {l.nome}
                    </span>
                  ))
                : "Nenhum lote"}
            </dd>
          </div>
        </dl>
      </section>
      <Abas itens={abas} ativa={ativa} onChange={abrir} />
      <Suspense
        fallback={<Carregamento texto="Carregando controle do animal..." />}
      >
        <div {...painel("resumo")}>
          {ativa === "resumo" && (
            <ResumoAnimal animal={animal} onAbrir={abrir} />
          )}
        </div>
        <div {...painel("pesagens")}>
          {visitada("pesagens") && (
            <ControlePesagens
              animal={animal}
              refreshKey={atualizacaoManejo}
              onAtualizarAnimal={atualizarAnimal}
            />
          )}
        </div>
        <div {...painel("vacinacao")}>
          {visitada("vacinacao") && <VacinacaoAnimal animal={animal} />}
        </div>
        <div {...painel("desmama")}>
          {visitada("desmama") && (
            <ControleDesmama
              animal={animal}
              onPesagemCriada={atualizarManejo}
            />
          )}
        </div>
        <div {...painel("producao")}>
          {visitada("producao") && <ControleLeiteiro animal={animal} />}
        </div>
        <div {...painel("historico")}>
          {ativa === "historico" && (
            <ResumoAnimal animal={animal} historico onAbrir={abrir} />
          )}
        </div>
      </Suspense>
    </div>
  );
}
