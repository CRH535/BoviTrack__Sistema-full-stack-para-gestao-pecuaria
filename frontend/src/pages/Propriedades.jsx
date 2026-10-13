import Button from "../components/ui/Button";
import useMensagem from "../hooks/useMensagem";
import ColecaoRegistros from "../components/ui/ColecaoRegistros";
import FormularioCadastro from "../components/ui/FormularioCadastro";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../services/api";
import IconeImagem from "../components/IconeImagem";
import ConfirmacaoExclusao from "../components/ConfirmacaoExclusao";
import VoltarInicio from "../components/VoltarInicio";
import ClimaPropriedade from "../components/ClimaPropriedade";
import { useAuth } from "../auth/useAuth";

const CAMPOS_BUSCA = ["nome", "cidade", "estado"];

function Propriedades() {
  const [searchParams] = useSearchParams();
  const climaSolicitado = Number(searchParams.get("clima"));
  const { usuario } = useAuth();
  const ehAdmin = usuario?.perfil === "admin";
  const [propriedades, setPropriedades] = useState([]);
  const [climaAbertoId, setClimaAbertoId] = useState(
    Number.isSafeInteger(climaSolicitado) && climaSolicitado > 0
      ? climaSolicitado
      : null,
  );

  const [nome, setNome] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [area, setArea] = useState("");

  const [editandoId, setEditandoId] = useState(null);
  const [mensagem, setMensagem, erroMensagem, limparErro] = useMensagem();
  const [processando, setProcessando] = useState(false);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [erroLista, setErroLista] = useState(false);
  const [exclusao, setExclusao] = useState({
    propriedade: null,
    impacto: null,
    carregando: false,
    erro: "",
    processando: false,
  });

  const carregarPropriedades = useCallback(
    () =>
      api
        .getAll("/propriedades")
        .then((resposta) => {
          setPropriedades(resposta.data);
        })
        .catch(() => {
          setErroLista(true);
          console.error("Falha em uma operação de propriedades");
          setMensagem("Erro ao carregar propriedades", true);
        })
        .finally(() => {
          setCarregandoLista(false);
        }),
    [setMensagem],
  );
  function recarregarPropriedades() {
    limparErro();
    setCarregandoLista(true);
    setErroLista(false);

    return carregarPropriedades();
  }

  useEffect(() => {
    carregarPropriedades();
  }, [carregarPropriedades]);

  function limparFormulario() {
    setNome("");
    setCidade("");
    setEstado("");
    setArea("");
    setEditandoId(null);
  }

  async function salvarPropriedade(evento) {
    evento.preventDefault();

    if (processando) return;
    setProcessando(true);
    try {
      const dados = {
        nome,
        cidade,
        estado,
        area: Number(area),
      };

      if (editandoId) {
        await api.put(`/propriedades/${editandoId}`, dados);
        setMensagem("Propriedade atualizada com sucesso!");
      } else {
        await api.post("/propriedades", dados);
        setMensagem("Propriedade cadastrada com sucesso!");
      }

      limparFormulario();
      recarregarPropriedades();
    } catch (erro) {
      console.error("Falha em uma operação de propriedades");

      setMensagem(
        erro.response?.data?.mensagem || "Erro ao salvar propriedade",
        true,
      );
    } finally {
      setProcessando(false);
    }
  }

  function editarPropriedade(propriedade) {
    setEditandoId(propriedade.id);
    setNome(propriedade.nome);
    setCidade(propriedade.cidade);
    setEstado(propriedade.estado);
    setArea(propriedade.area);
  }

  async function abrirExclusao(propriedade) {
    setExclusao({
      propriedade,
      impacto: null,
      carregando: true,
      erro: "",
      processando: false,
    });

    try {
      const resposta = await api.get(
        `/propriedades/${propriedade.id}/exclusao-preview`,
      );
      setExclusao((atual) =>
        atual.propriedade?.id === propriedade.id
          ? { ...atual, impacto: resposta.data, carregando: false }
          : atual,
      );
    } catch (erro) {
      setExclusao((atual) =>
        atual.propriedade?.id === propriedade.id
          ? {
              ...atual,
              carregando: false,
              erro:
                erro.response?.data?.mensagem ||
                "Não foi possível verificar os registros relacionados.",
            }
          : atual,
      );
    }
  }

  function fecharExclusao() {
    if (exclusao.processando) return;
    setExclusao({
      propriedade: null,
      impacto: null,
      carregando: false,
      erro: "",
      processando: false,
    });
  }

  async function excluirPropriedade() {
    if (!exclusao.propriedade || !exclusao.impacto) return;

    const id = exclusao.propriedade.id;
    setExclusao((atual) => ({ ...atual, processando: true, erro: "" }));

    try {
      const resposta = await api.delete(`/propriedades/${id}`);

      setPropriedades((propriedadesAtuais) =>
        propriedadesAtuais.filter((propriedade) => propriedade.id !== id),
      );
      setMensagem(resposta.data.mensagem);
      fecharExclusao();
    } catch (erro) {
      console.error("Falha em uma operação de propriedades");
      setExclusao((atual) => ({
        ...atual,
        processando: false,
        erro:
          erro.response?.data?.mensagem ||
          "Não foi possível excluir a propriedade.",
      }));
    }
  }

  return (
    <div className="page">
      <header className="page-header" data-tour="propriedades">
        <div>
          <span className="eyebrow">Gestão das propriedades</span>
          <h1>Propriedades</h1>
          <p>Organize as propriedades onde o seu rebanho é manejado.</p>
        </div>
        <VoltarInicio />
      </header>

      {processando && <p role="status">Salvando registros...</p>}
      {mensagem && !erroLista && (
        <p
          className={`notice${erroMensagem ? " notice-error" : ""}`}
          role={erroMensagem ? "alert" : "status"}
        >
          {mensagem}
        </p>
      )}

      <FormularioCadastro titulo="Cadastrar propriedade" editando={editandoId}>
        <form className="panel data-form" onSubmit={salvarPropriedade}>
          <fieldset
            className="form-fields"
            disabled={processando || carregandoLista}
          >
            <div>
              <label htmlFor="propriedades-campo-1">Nome</label>
              <br />

              <input
                id="propriedades-campo-1"
                required
                type="text"
                value={nome}
                maxLength="100"
                onChange={(e) => setNome(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="propriedades-campo-2">Cidade</label>
              <br />

              <input
                id="propriedades-campo-2"
                required
                type="text"
                value={cidade}
                maxLength="100"
                onChange={(e) => setCidade(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="propriedades-campo-3">Estado</label>
              <br />

              <input
                id="propriedades-campo-3"
                required
                type="text"
                value={estado}
                maxLength="2"
                onChange={(e) => setEstado(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="propriedades-campo-4">Área (ha)</label>
              <br />

              <input
                id="propriedades-campo-4"
                required
                type="number"
                min="0.01"
                max="99999999.99"
                step="0.01"
                value={area}
                onChange={(e) => setArea(e.target.value)}
              />
            </div>

            <br />

            <Button startIcon={editandoId ? "salvar" : "mais"} loading={processando} type="submit">
              {editandoId ? "Salvar alterações" : "Cadastrar"}
            </Button>

            {editandoId && (
              <Button startIcon="fechar"
                disabled={processando}
                className="button-secondary"
                type="button"
                onClick={limparFormulario}
              >
                Cancelar
              </Button>
            )}
          </fieldset>
        </form>
      </FormularioCadastro>

      {carregandoLista && <p role="status">Carregando registros...</p>}
      {erroLista && (
        <div className="notice notice-error" role="alert">
          Não foi possível carregar os registros.{" "}
          <Button startIcon="atualizar"
            disabled={processando}
            type="button"
            onClick={recarregarPropriedades}
          >
            Tentar novamente
          </Button>
        </div>
      )}

      <div className="section-heading">
        <div>
          <span className="eyebrow">Seus dados</span>
          <h2>Propriedades cadastradas</h2>
        </div>
        <span className="count-badge">
          {carregandoLista || erroLista ? "—" : propriedades.length}
        </span>
      </div>

      <ColecaoRegistros
        itens={propriedades}
        campos={CAMPOS_BUSCA}
        className=""
        oculto={carregandoLista || erroLista}
      >
        {(propriedade) => (
          <article
            className={`record-card property-card${climaAbertoId === propriedade.id ? " property-card-expanded" : ""}`}
            key={propriedade.id}
          >
            <span className="record-icon" aria-hidden="true">
              <IconeImagem nome="propriedades" className="record-icon-image" />
            </span>
            <h3>{propriedade.nome}</h3>

            <p>
              {propriedade.cidade} - {propriedade.estado}
            </p>

            <p>Área: {propriedade.area} ha</p>

            {ehAdmin && propriedade.proprietario && (
              <section
                className="property-owner-details"
                aria-label={`Proprietário de ${propriedade.nome}`}
              >
                <p>
                  <strong>Proprietário:</strong> {propriedade.proprietario.nome}
                </p>
                <p>
                  <strong>E-mail:</strong>{" "}
                  <a href={`mailto:${propriedade.proprietario.email}`}>
                    {propriedade.proprietario.email}
                  </a>
                </p>
              </section>
            )}

            <div className="record-actions">
              <Button startIcon="clima"
                disabled={processando}
                className="button-secondary"
                type="button"
                aria-expanded={climaAbertoId === propriedade.id}
                onClick={() =>
                  setClimaAbertoId((atual) =>
                    atual === propriedade.id ? null : propriedade.id,
                  )
                }
              >
                {climaAbertoId === propriedade.id
                  ? "Ocultar clima"
                  : "Ver clima"}
              </Button>
              <Button startIcon="editar"
                disabled={processando}
                className="button-secondary"
                type="button"
                onClick={() => editarPropriedade(propriedade)}
              >
                Editar
              </Button>

              <Button startIcon="excluir"
                disabled={processando}
                className="button-danger"
                type="button"
                onClick={() => abrirExclusao(propriedade)}
              >
                Excluir
              </Button>
            </div>
            {climaAbertoId === propriedade.id && (
              <section
                className="property-weather"
                aria-label={`Clima de ${propriedade.nome}`}
              >
                <h4>Clima atual</h4>
                <ClimaPropriedade
                  key={`${propriedade.id}:${propriedade.nome}:${propriedade.cidade}:${propriedade.estado}`}
                  propriedade={propriedade}
                />
              </section>
            )}
          </article>
        )}
      </ColecaoRegistros>

      <ConfirmacaoExclusao
        aberto={Boolean(exclusao.propriedade)}
        titulo={`Excluir ${exclusao.propriedade?.nome || "propriedade"}?`}
        mensagem="Esta ação é permanente. Antes de confirmar, revise todos os registros que serão apagados junto com a propriedade."
        impacto={exclusao.impacto}
        impactoObrigatorio
        carregandoImpacto={exclusao.carregando}
        erroImpacto={exclusao.erro}
        processando={exclusao.processando}
        rotuloConfirmar="Excluir propriedade e registros"
        rotuloProcessando="Excluindo propriedade e registros..."
        onCancelar={fecharExclusao}
        onConfirmar={excluirPropriedade}
      />
    </div>
  );
}

export default Propriedades;
