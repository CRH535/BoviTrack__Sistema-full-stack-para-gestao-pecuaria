import Button from "../components/ui/Button";
import useMensagem from "../hooks/useMensagem";
import ColecaoRegistros from "../components/ui/ColecaoRegistros";
import FormularioCadastro from "../components/ui/FormularioCadastro";
import { useCallback, useEffect, useRef, useState } from "react";
import api from "../services/api";
import IconeImagem from "../components/IconeImagem";
import VoltarInicio from "../components/VoltarInicio";

const CAMPOS_BUSCA = ["nome", "descricao", "propriedade"];

function Lotes() {
  const [lotes, setLotes] = useState([]);
  const [propriedades, setPropriedades] = useState([]);
  const [animais, setAnimais] = useState([]);
  const [loteGerenciado, setLoteGerenciado] = useState(null);
  const [animaisDoLote, setAnimaisDoLote] = useState([]);
  const [animalSelecionado, setAnimalSelecionado] = useState("");
  const [carregandoAnimais, setCarregandoAnimais] = useState(false);
  const loteAtivoRef = useRef(null);
  const requisicaoAnimaisRef = useRef(0);

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [propriedadeId, setPropriedadeId] = useState("");

  const [editandoId, setEditandoId] = useState(null);
  const [mensagem, setMensagem, erroMensagem, limparErro] = useMensagem();
  const [processando, setProcessando] = useState(false);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [erroLista, setErroLista] = useState(false);

  const carregarLotes = useCallback(
    () =>
      api
        .getAll("/lotes")
        .then((resposta) => {
          setLotes(resposta.data);
        })
        .catch(() => {
          setErroLista(true);
          console.error("Falha em uma operação de lotes");
          setMensagem("Erro ao carregar lotes", true);
        })
        .finally(() => {
          setCarregandoLista(false);
        }),
    [setMensagem],
  );
  function recarregarLotes() {
    limparErro();
    setCarregandoLista(true);
    setErroLista(false);

    return carregarLotes();
  }

  const carregarPropriedades = useCallback(
    () =>
      api
        .getAll("/propriedades")
        .then((resposta) => {
          setPropriedades(resposta.data);
        })
        .catch(() => {
          console.error("Falha em uma operação de lotes");
        }),
    [],
  );

  const carregarAnimais = useCallback(
    () =>
      api
        .getAll("/animais")
        .then((resposta) => {
          setAnimais(resposta.data);
        })
        .catch(() => {
          console.error("Falha em uma operação de lotes");
          setMensagem("Erro ao carregar animais disponíveis", true);
        }),
    [setMensagem],
  );

  useEffect(() => {
    carregarLotes();
    carregarPropriedades();
    carregarAnimais();
  }, [carregarLotes, carregarPropriedades, carregarAnimais]);

  async function carregarAnimaisDoLote(loteId) {
    const requisicao = ++requisicaoAnimaisRef.current;
    setCarregandoAnimais(true);

    try {
      const resposta = await api.getAll(`/lotes/${loteId}/animais`);
      if (
        requisicao !== requisicaoAnimaisRef.current ||
        loteAtivoRef.current !== loteId
      )
        return;
      const animaisVinculados = resposta.data;
      const idNumerico = Number(loteId);

      setAnimaisDoLote(animaisVinculados);
      setLotes((lotesAtuais) =>
        lotesAtuais.map((lote) =>
          lote.id === idNumerico
            ? { ...lote, quantidade_animais: animaisVinculados.length }
            : lote,
        ),
      );
      setLoteGerenciado((loteAtual) =>
        loteAtual?.id === idNumerico
          ? { ...loteAtual, quantidade_animais: animaisVinculados.length }
          : loteAtual,
      );
    } catch (erro) {
      if (
        requisicao !== requisicaoAnimaisRef.current ||
        loteAtivoRef.current !== loteId
      )
        return;
      console.error("Falha em uma operação de lotes");
      setMensagem(
        erro.response?.data?.mensagem || "Erro ao carregar animais do lote",
        true,
      );
    } finally {
      if (requisicao === requisicaoAnimaisRef.current)
        setCarregandoAnimais(false);
    }
  }

  async function gerenciarAnimais(lote) {
    if (loteGerenciado?.id === lote.id) {
      loteAtivoRef.current = null;
      requisicaoAnimaisRef.current += 1;
      setLoteGerenciado(null);
      setAnimaisDoLote([]);
      setAnimalSelecionado("");
      return;
    }

    loteAtivoRef.current = lote.id;
    setAnimaisDoLote([]);
    setLoteGerenciado(lote);
    setAnimalSelecionado("");
    setMensagem("");
    await carregarAnimaisDoLote(lote.id);
  }

  async function adicionarAnimalAoLote(evento) {
    evento.preventDefault();

    if (!loteGerenciado || !animalSelecionado) {
      setMensagem("Selecione um animal para adicionar.", true);
      return;
    }

    if (processando) return;
    setProcessando(true);
    try {
      const resposta = await api.post(`/lotes/${loteGerenciado.id}/animais`, {
        animal_id: Number(animalSelecionado),
      });

      setMensagem(resposta.data.mensagem);
      setAnimalSelecionado("");
      await carregarAnimaisDoLote(loteGerenciado.id);
    } catch (erro) {
      console.error("Falha em uma operação de lotes");
      setMensagem(
        erro.response?.data?.mensagem || "Não foi possível adicionar o animal.",
        true,
      );
    } finally {
      setProcessando(false);
    }
  }

  async function removerAnimalDoLote(animal) {
    if (!loteGerenciado) return;

    const confirmar = window.confirm(
      `Remover ${animal.nome} deste lote? O animal continuará cadastrado.`,
    );

    if (!confirmar) return;

    if (processando) return;
    setProcessando(true);
    try {
      const resposta = await api.delete(
        `/lotes/${loteGerenciado.id}/animais/${animal.id}`,
      );

      setMensagem(resposta.data.mensagem);
      await carregarAnimaisDoLote(loteGerenciado.id);
    } catch (erro) {
      console.error("Falha em uma operação de lotes");
      setMensagem(
        erro.response?.data?.mensagem || "Não foi possível remover o animal.",
        true,
      );
    } finally {
      setProcessando(false);
    }
  }

  function limparFormulario() {
    setNome("");
    setDescricao("");
    setPropriedadeId("");
    setEditandoId(null);
  }

  async function salvarLote(evento) {
    evento.preventDefault();

    if (processando) return;
    setProcessando(true);
    try {
      const dados = {
        nome,
        descricao,
        propriedade_id: Number(propriedadeId),
      };

      if (editandoId) {
        await api.put(`/lotes/${editandoId}`, dados);
        setMensagem("Lote atualizado com sucesso!");
      } else {
        await api.post("/lotes", dados);
        setMensagem("Lote cadastrado com sucesso!");
      }

      limparFormulario();
      recarregarLotes();
    } catch (erro) {
      console.error("Falha em uma operação de lotes");

      setMensagem(erro.response?.data?.mensagem || "Erro ao salvar lote", true);
    } finally {
      setProcessando(false);
    }
  }

  function editarLote(lote) {
    loteAtivoRef.current = null;
    requisicaoAnimaisRef.current += 1;
    setLoteGerenciado(null);
    setAnimaisDoLote([]);
    setEditandoId(lote.id);
    setNome(lote.nome);
    setDescricao(lote.descricao || "");
    setPropriedadeId(lote.propriedade_id);
  }

  async function excluirLote(id) {
    const confirmar = window.confirm(
      "Tem certeza que deseja excluir este lote?",
    );

    if (!confirmar) return;

    if (processando) return;
    setProcessando(true);
    try {
      await api.delete(`/lotes/${id}`);

      setLotes((lotesAtuais) => lotesAtuais.filter((lote) => lote.id !== id));

      if (loteGerenciado?.id === id) {
        loteAtivoRef.current = null;
        requisicaoAnimaisRef.current += 1;
        setLoteGerenciado(null);
        setAnimaisDoLote([]);
        setAnimalSelecionado("");
      }

      setMensagem("Lote excluído com sucesso!");
    } catch (erro) {
      console.error("Falha em uma operação de lotes");

      setMensagem(
        erro.response?.data?.mensagem || "Erro ao excluir lote",
        true,
      );
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header" data-tour="lotes">
        <div>
          <span className="eyebrow">Organização do rebanho</span>
          <h1>Lotes</h1>
          <p>Agrupe e gerencie os animais por propriedade.</p>
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

      <FormularioCadastro titulo="Cadastrar lote" editando={editandoId}>
        <form className="panel data-form" onSubmit={salvarLote}>
          <fieldset
            className="form-fields"
            disabled={processando || carregandoLista}
          >
            <div>
              <label htmlFor="lotes-campo-1">Nome</label>
              <br />

              <input
                id="lotes-campo-1"
                required
                type="text"
                value={nome}
                maxLength="100"
                onChange={(e) => setNome(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="lotes-campo-2">Descrição</label>
              <br />

              <input
                id="lotes-campo-2"
                type="text"
                value={descricao}
                maxLength="255"
                onChange={(e) => setDescricao(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="lotes-campo-3">Propriedade</label>
              <br />

              <select
                id="lotes-campo-3"
                required
                value={propriedadeId}
                onChange={(e) => setPropriedadeId(e.target.value)}
              >
                <option value="">Selecione</option>

                {propriedades.map((propriedade) => (
                  <option key={propriedade.id} value={propriedade.id}>
                    {propriedade.nome}
                  </option>
                ))}
              </select>
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
            onClick={recarregarLotes}
          >
            Tentar novamente
          </Button>
        </div>
      )}

      <div className="section-heading">
        <div>
          <span className="eyebrow">Lotes ativos</span>
          <h2>Lotes cadastrados</h2>
        </div>
        <span className="count-badge">
          {carregandoLista || erroLista ? "—" : lotes.length}
        </span>
      </div>

      <ColecaoRegistros
        itens={lotes}
        campos={CAMPOS_BUSCA}
        className="lot-grid"
        oculto={carregandoLista || erroLista}
      >
        {(lote) => {
          const animaisCompativeis = animais.filter(
            (animal) =>
              Number(animal.propriedade_id) === Number(lote.propriedade_id) &&
              !animaisDoLote.some(
                (animalVinculado) => animalVinculado.id === animal.id,
              ),
          );

          return (
            <article
              className={`record-card lot-card${loteGerenciado?.id === lote.id ? " expanded" : ""}`}
              key={lote.id}
            >
              <span className="record-icon" aria-hidden="true">
                <IconeImagem nome="lotes" className="record-icon-image" />
              </span>
              <h3>{lote.nome}</h3>

              <p>{lote.descricao || "-"}</p>

              <p>Propriedade: {lote.propriedade || lote.propriedade_id}</p>
              <p>Animais: {lote.quantidade_animais || 0}</p>

              <div className="lot-actions">
                <Button
                  disabled={processando}
                  type="button"
                  onClick={() => gerenciarAnimais(lote)}
                >
                  <IconeImagem
                    nome="animais-lotes"
                    className="button-icon-image"
                  />
                  {loteGerenciado?.id === lote.id
                    ? "Fechar animais"
                    : "Gerenciar animais"}
                </Button>

                <Button startIcon="editar"
                  disabled={processando}
                  className="button-secondary"
                  type="button"
                  onClick={() => editarLote(lote)}
                >
                  Editar
                </Button>

                <Button startIcon="excluir"
                  disabled={processando}
                  className="button-danger"
                  type="button"
                  onClick={() => excluirLote(lote.id)}
                >
                  Excluir
                </Button>
              </div>

              {loteGerenciado?.id === lote.id && (
                <section className="lot-animals-manager">
                  <h3 className="icon-title">
                    <IconeImagem
                      nome="animais-lotes"
                      className="title-icon-image"
                    />
                    Animais do lote: {lote.nome}
                  </h3>
                  <p>Propriedade: {lote.propriedade}</p>

                  {carregandoAnimais && <p>Carregando animais...</p>}

                  {!carregandoAnimais && animaisDoLote.length === 0 && (
                    <p>Nenhum animal vinculado a este lote.</p>
                  )}

                  {animaisDoLote.map((animal) => (
                    <div className="lot-animal" key={animal.id}>
                      <div>
                        <strong>{animal.nome}</strong>
                        {animal.numero_brinco && (
                          <p className="lot-animal-details">
                            Brinco: {animal.numero_brinco}
                          </p>
                        )}
                        <p className="lot-animal-details">
                          {animal.raca || animal.especie}
                          {" • "}
                          {animal.sexo || "-"}
                          {" • "}
                          {animal.peso
                            ? `${animal.peso} kg`
                            : "Peso não informado"}
                        </p>
                      </div>

                      <Button startIcon="retirar"
                        disabled={processando}
                        className="button-danger"
                        type="button"
                        onClick={() => removerAnimalDoLote(animal)}
                      >
Remover
                      </Button>
                    </div>
                  ))}

                  <form
                    className="lot-add-form"
                    onSubmit={adicionarAnimalAoLote}
                  >
                    <fieldset
                      className="form-fields"
                      disabled={processando || carregandoLista}
                    >
                      <label htmlFor={`animal-lote-${lote.id}`}>
                        Adicionar animal
                      </label>
                      <select
                        id={`animal-lote-${lote.id}`}
                        value={animalSelecionado}
                        onChange={(evento) =>
                          setAnimalSelecionado(evento.target.value)
                        }
                        disabled={animaisCompativeis.length === 0}
                      >
                        <option value="">
                          {animaisCompativeis.length === 0
                            ? "Nenhum animal disponível"
                            : "Selecione um animal"}
                        </option>

                        {animaisCompativeis.map((animal) => (
                          <option key={animal.id} value={animal.id}>
                            {animal.nome}
                            {animal.numero_brinco
                              ? ` — Brinco ${animal.numero_brinco}`
                              : ""}
                            {` — ${animal.raca || animal.especie}`}
                          </option>
                        ))}
                      </select>

                      <Button startIcon="mais" loading={processando}
                        type="submit"
                        disabled={
                          !animalSelecionado || animaisCompativeis.length === 0
                        }
                      >
Adicionar ao lote
                      </Button>
                    </fieldset>
                  </form>
                </section>
              )}
            </article>
          );
        }}
      </ColecaoRegistros>
    </div>
  );
}

export default Lotes;
