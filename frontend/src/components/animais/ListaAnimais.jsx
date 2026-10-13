import SearchInput from "../ui/SearchInput";
import Button, { IconButton } from "../ui/Button";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Card from "../ui/Card";
import Kpi from "../ui/Kpi";
import TabelaResponsiva from "../ui/TabelaResponsiva";
import Paginacao from "../ui/Paginacao";
import Distribuicao from "../ui/Distribuicao";
import { EstadoVazio } from "../ui/Estado";
import { formatarDataSemFuso } from "../../utils/datas";

const colunas = [
  {
    id: "numero_brinco",
    rotulo: "Brinco",
    ordenavel: true,
    render: (a) => <strong>{a.numero_brinco || "Não informado"}</strong>,
  },
  {
    id: "nome",
    rotulo: "Nome",
    ordenavel: true,
    render: (a) => <strong>{a.nome}</strong>,
  },
  {
    id: "sexo",
    rotulo: "Sexo",
    ordenavel: true,
    render: (a) =>
      a.sexo === "F" ? "Fêmea" : a.sexo === "M" ? "Macho" : "Não informado",
  },
  {
    id: "data_nascimento",
    rotulo: "Nascimento",
    secundaria: true,
    ordenavel: true,
    render: (a) => formatarDataSemFuso(a.data_nascimento),
  },
  {
    id: "propriedade",
    rotulo: "Propriedade",
    render: (a) => a.propriedade || "Não informada",
  },
  {
    id: "lotes",
    rotulo: "Lotes",
    secundaria: true,
    render: (a) => a.lotes?.map((l) => l.nome).join(", ") || "Sem lote",
  },
  {
    id: "peso",
    rotulo: "Peso",
    ordenavel: true,
    render: (a) =>
      a.peso == null ? "—" : `${Number(a.peso).toLocaleString("pt-BR")} kg`,
  },
];
export default function ListaAnimais({
  animais,
  propriedades,
  onEditar,
  onExcluir,
  processando,
}) {
  const [params, setParams] = useSearchParams();
  const busca = params.get("busca") || "";
  const [propriedade, setPropriedade] = useState("");
  const [lote, setLote] = useState("");
  const [sexo, setSexo] = useState("");
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);
  const [ordem, setOrdem] = useState({ campo: "nome", direcao: "asc" });
  const lotes = useMemo(
    () =>
      Array.from(
        new Map(
          animais
            .flatMap((a) => a.lotes || [])
            .map((item) => [String(item.id), item]),
        ).values(),
      ),
    [animais],
  );
  const lista = useMemo(
    () =>
      animais
        .filter((a) => {
          const texto =
            `${a.nome} ${a.numero_brinco || ""} ${a.raca || ""} ${a.especie}`.toLocaleLowerCase(
              "pt-BR",
            );
          return (
            texto.includes(busca.toLocaleLowerCase("pt-BR")) &&
            (!propriedade || String(a.propriedade_id) === propriedade) &&
            (!sexo || a.sexo === sexo) &&
            (!lote || a.lotes?.some((l) => String(l.id) === lote))
          );
        })
        .sort((a, b) => {
          const comparacao =
            ordem.campo === "peso"
              ? Number(a.peso ?? -1) - Number(b.peso ?? -1)
              : String(a[ordem.campo] || "").localeCompare(
                  String(b[ordem.campo] || ""),
                  "pt-BR",
                  { numeric: true },
                );
          return ordem.direcao === "asc" ? comparacao : -comparacao;
        }),
    [animais, busca, propriedade, sexo, lote, ordem],
  );
  const atual = Math.min(
    pagina,
    Math.max(1, Math.ceil(lista.length / porPagina)),
  );
  function pesquisar(value) {
    const novo = new URLSearchParams(params);
    value ? novo.set("busca", value) : novo.delete("busca");
    setParams(novo, { replace: true });
    setPagina(1);
  }
  function limpar() {
    pesquisar("");
    setPropriedade("");
    setLote("");
    setSexo("");
  }
  const distribuicao = propriedades.map((p) => ({
    nome: p.nome,
    valor: animais.filter((a) => Number(a.propriedade_id) === Number(p.id))
      .length,
  }));
  return (
    <>
      <section className="panel animal-filters" aria-label="Filtros do rebanho">
        <div>
          <label htmlFor="filtro-animal-busca">Buscar animal</label>
          <SearchInput
            id="filtro-animal-busca"
            type="search"
            placeholder="Brinco, nome ou raça"
            value={busca}
            onChange={(e) => pesquisar(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="filtro-animal-propriedade">Filtrar propriedade</label>
          <select
            id="filtro-animal-propriedade"
            value={propriedade}
            onChange={(e) => {
              setPropriedade(e.target.value);
              setPagina(1);
            }}
          >
            <option value="">Todas</option>
            {propriedades.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filtro-animal-lote">Filtrar lote</label>
          <select
            id="filtro-animal-lote"
            value={lote}
            onChange={(e) => {
              setLote(e.target.value);
              setPagina(1);
            }}
          >
            <option value="">Todos</option>
            {lotes.map((l) => (
              <option value={l.id} key={l.id}>
                {l.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filtro-animal-sexo">Filtrar sexo</label>
          <select
            id="filtro-animal-sexo"
            value={sexo}
            onChange={(e) => {
              setSexo(e.target.value);
              setPagina(1);
            }}
          >
            <option value="">Todos</option>
            <option value="F">Fêmeas</option>
            <option value="M">Machos</option>
          </select>
        </div>
        <Button startIcon="limpar" className="button-secondary" type="button" onClick={limpar}>
          Limpar filtros
        </Button>
        <div className="mobile-order">
          <label htmlFor="filtro-animal-ordem">Ordenar animais</label>
          <select
            id="filtro-animal-ordem"
            value={`${ordem.campo}:${ordem.direcao}`}
            onChange={(e) => {
              const [campo, direcao] = e.target.value.split(":");
              setOrdem({ campo, direcao });
              setPagina(1);
            }}
          >
            {colunas
              .filter((col) => col.ordenavel)
              .flatMap((col) =>
                ["asc", "desc"].map((direcao) => (
                  <option
                    key={`${col.id}:${direcao}`}
                    value={`${col.id}:${direcao}`}
                  >
                    {col.rotulo} ·{" "}
                    {direcao === "asc" ? "crescente" : "decrescente"}
                  </option>
                )),
              )}
          </select>
        </div>
      </section>
      <section
        className="stats-grid animal-kpis"
        aria-label="Indicadores do rebanho completo"
      >
        <Kpi
          rotulo="Total de animais"
          valor={animais.length}
          contexto="Rebanho completo"
          icone="animais"
        />
        <Kpi
          rotulo="Fêmeas"
          valor={animais.filter((a) => a.sexo === "F").length}
          contexto="Sexo cadastrado"
          icone="animais"
        />
        <Kpi
          rotulo="Machos"
          valor={animais.filter((a) => a.sexo === "M").length}
          contexto="Sexo cadastrado"
          icone="animais"
        />
        <Kpi
          rotulo="Sem lote"
          valor={animais.filter((a) => !a.lotes?.length).length}
          contexto="Ainda sem vínculo"
          icone="lotes"
          tom="info"
        />
      </section>
      <div className="animals-content-grid">
        <Card
          titulo={`Lista de animais (${lista.length})`}
          icone="animais"
          className="ui-table-panel"
        >
          {lista.length ? (
            <TabelaResponsiva
              linhaClassName="animal-card"
              nome="Lista de animais"
              colunas={colunas}
              itens={lista.slice((atual - 1) * porPagina, atual * porPagina)}
              ordenacao={ordem}
              onOrdenar={(campo) => {
                setOrdem({
                  campo,
                  direcao:
                    ordem.campo === campo && ordem.direcao === "asc"
                      ? "desc"
                      : "asc",
                });
                setPagina(1);
              }}
              renderAcoes={(a) => (
                <div className="record-actions">
                  <Button as={Link} startIcon="visualizar" className="button-link" to={`/animais/${a.id}`}>
                    Ver ficha
                  </Button>
                  <IconButton icon="editar" label="Editar" title={`Editar animal ${a.nome}`}
                    className="button-secondary"
                    type="button"
                    disabled={processando}
                    onClick={() => onEditar(a)}
                  />
                  <IconButton icon="excluir" label="Excluir" title={`Excluir animal ${a.nome}`}
                    className="button-danger"
                    type="button"
                    disabled={processando}
                    onClick={() => onExcluir(a.id)}
                  />
                </div>
              )}
            />
          ) : (
            <EstadoVazio
              titulo="Nenhum animal encontrado"
              descricao={
                animais.length
                  ? "Ajuste a busca ou limpe os filtros."
                  : "Cadastre o primeiro animal para acompanhar o rebanho."
              }
              acao={
                <Button as={Link} startIcon="mais" className="button-link" to="/animais?novo=1">
                  Cadastrar animal
                </Button>
              }
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
        </Card>
        <aside className="animals-insights">
          <Card titulo="Por propriedade" icone="propriedades">
            <Distribuicao itens={distribuicao} unidade="animais" />
          </Card>
          <Card titulo="Gestão individual" icone="identificacao">
            <p className="card-description">
              A ficha reúne pesagens, vacinações, desmama e produção de cada
              animal.
            </p>
            <Button as={Link} startIcon="pesagem" className="ui-help-link" to="/pesagens">
              Consultar pesagens
            </Button>
            <Button as={Link} startIcon="desmama" className="ui-help-link" to="/desmamas">
              Consultar desmamas
            </Button>
          </Card>
        </aside>
      </div>
    </>
  );
}
