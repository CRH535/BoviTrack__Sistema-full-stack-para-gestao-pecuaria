import useMensagem from "../hooks/useMensagem";
import ListaAnimais from "../components/animais/ListaAnimais";
import FormularioCadastro from "../components/ui/FormularioCadastro";
import { useCallback, useEffect, useState } from "react";

import api from "../services/api";

import VoltarInicio from "../components/VoltarInicio";

function obterDataAtualLocal() {
  const agora = new Date();
  const dataLocal = new Date(
    agora.getTime() - agora.getTimezoneOffset() * 60 * 1000,
  );

  return dataLocal.toISOString().slice(0, 10);
}

function Animais() {
  const [animais, setAnimais] = useState([]);
  const [propriedades, setPropriedades] = useState([]);

  const [nome, setNome] = useState("");
  const [numeroBrinco, setNumeroBrinco] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [especie, setEspecie] = useState("");
  const [raca, setRaca] = useState("");
  const [sexo, setSexo] = useState("");
  const [peso, setPeso] = useState("");
  const [propriedadeId, setPropriedadeId] = useState("");
  const [maeId, setMaeId] = useState("");

  const [editandoId, setEditandoId] = useState(null);
  const [mensagem, setMensagem, erroMensagem, limparErro] = useMensagem();
  const [processando, setProcessando] = useState(false);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [erroLista, setErroLista] = useState(false);

  const carregarAnimais = useCallback(
    () =>
      api
        .getAll("/animais")
        .then((resposta) => {
          setAnimais(resposta.data);
        })
        .catch(() => {
          setErroLista(true);
          console.error("Falha em uma operação de animais");
          setMensagem("Erro ao carregar animais", true);
        })
        .finally(() => {
          setCarregandoLista(false);
        }),
    [setMensagem],
  );
  function recarregarAnimais() {
    limparErro();
    setCarregandoLista(true);
    setErroLista(false);

    return carregarAnimais();
  }

  const carregarPropriedades = useCallback(
    () =>
      api
        .getAll("/propriedades")
        .then((resposta) => {
          setPropriedades(resposta.data);
        })
        .catch(() => {
          console.error("Falha em uma operação de animais");
        }),
    [],
  );

  useEffect(() => {
    carregarAnimais();
    carregarPropriedades();
  }, [carregarAnimais, carregarPropriedades]);

  function limparFormulario() {
    setNome("");
    setNumeroBrinco("");
    setDataNascimento("");
    setEspecie("");
    setRaca("");
    setSexo("");
    setPeso("");
    setPropriedadeId("");
    setMaeId("");
    setEditandoId(null);
  }

  async function salvarAnimal(evento) {
    evento.preventDefault();

    if (processando) return;
    setProcessando(true);
    try {
      const dados = {
        nome,
        numero_brinco: numeroBrinco,
        data_nascimento: dataNascimento || null,
        especie,
        raca,
        sexo,
        peso: peso ? Number(peso) : null,
        propriedade_id: Number(propriedadeId),
        mae_id: maeId ? Number(maeId) : null,
      };

      if (editandoId) {
        await api.put(`/animais/${editandoId}`, dados);
        setMensagem("Animal atualizado com sucesso!");
      } else {
        await api.post("/animais", dados);
        setMensagem("Animal cadastrado com sucesso!");
      }

      limparFormulario();
      recarregarAnimais();
    } catch (erro) {
      console.error("Falha em uma operação de animais");

      setMensagem(
        erro.response?.data?.mensagem || "Erro ao salvar animal",
        true,
      );
    } finally {
      setProcessando(false);
    }
  }

  function editarAnimal(animal) {
    setEditandoId(animal.id);
    setNome(animal.nome);
    setNumeroBrinco(animal.numero_brinco || "");
    setDataNascimento(animal.data_nascimento?.slice(0, 10) || "");
    setEspecie(animal.especie);
    setRaca(animal.raca || "");
    setSexo(animal.sexo);
    setPeso(animal.peso ?? "");
    setPropriedadeId(animal.propriedade_id);
    setMaeId(animal.mae_id || "");
  }

  async function excluirAnimal(id) {
    const confirmar = window.confirm(
      "Tem certeza que deseja excluir este animal?",
    );

    if (!confirmar) {
      return;
    }

    if (processando) return;
    setProcessando(true);
    try {
      await api.delete(`/animais/${id}`);

      setAnimais((animaisAtuais) =>
        animaisAtuais.filter((animal) => animal.id !== id),
      );

      setMensagem("Animal excluído com sucesso!");
    } catch (erro) {
      console.error("Falha em uma operação de animais");

      setMensagem(
        erro.response?.data?.mensagem || "Erro ao excluir animal",
        true,
      );
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header" data-tour="animais">
        <div>
          <span className="eyebrow">Gestão do rebanho</span>
          <h1>Gestão de animais</h1>
          <p>Controle a identificação e os dados do seu rebanho.</p>
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

      <FormularioCadastro titulo="Cadastrar animal" editando={editandoId}>
        <form className="panel data-form" onSubmit={salvarAnimal}>
          <fieldset
            className="form-fields"
            disabled={processando || carregandoLista}
          >
            <div>
              <label htmlFor="animais-campo-1">Nome</label>
              <br />

              <input
                id="animais-campo-1"
                required
                type="text"
                value={nome}
                maxLength="100"
                onChange={(e) => setNome(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="animais-campo-2">Número do brinco</label>
              <br />

              <input
                id="animais-campo-2"
                type="text"
                maxLength="50"
                value={numeroBrinco}
                onChange={(e) => setNumeroBrinco(e.target.value)}
                placeholder="Ex.: 00125 ou BOV-428"
              />
            </div>

            <div>
              <label htmlFor="animais-campo-3">Data de nascimento</label>
              <br />

              <input
                id="animais-campo-3"
                type="date"
                max={obterDataAtualLocal()}
                value={dataNascimento}
                onChange={(e) => setDataNascimento(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="animais-campo-4">Espécie</label>
              <br />

              <input
                id="animais-campo-4"
                required
                type="text"
                value={especie}
                maxLength="50"
                onChange={(e) => setEspecie(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="animais-campo-5">Raça</label>
              <br />

              <input
                id="animais-campo-5"
                type="text"
                value={raca}
                maxLength="50"
                onChange={(e) => setRaca(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="animais-campo-6">Sexo</label>
              <br />

              <select
                id="animais-campo-6"
                required
                value={sexo}
                onChange={(e) => setSexo(e.target.value)}
              >
                <option value="">Selecione</option>
                <option value="M">Macho</option>
                <option value="F">Fêmea</option>
              </select>
            </div>

            <div>
              <label htmlFor="animais-campo-7">Peso</label>
              <br />

              <input
                id="animais-campo-7"
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                value={peso}
                onChange={(e) => setPeso(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="animais-campo-8">Propriedade</label>
              <br />

              <select
                id="animais-campo-8"
                required
                value={propriedadeId}
                onChange={(e) => {
                  setPropriedadeId(e.target.value);
                  setMaeId("");
                }}
              >
                <option value="">Selecione</option>

                {propriedades.map((propriedade) => (
                  <option key={propriedade.id} value={propriedade.id}>
                    {propriedade.nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="animais-campo-9">Mãe (opcional)</label>
              <br />
              <select
                id="animais-campo-9"
                value={maeId}
                onChange={(e) => setMaeId(e.target.value)}
                disabled={!propriedadeId}
              >
                <option value="">Não informada</option>
                {animais
                  .filter(
                    (animal) =>
                      animal.sexo === "F" &&
                      Number(animal.propriedade_id) === Number(propriedadeId) &&
                      animal.id !== editandoId,
                  )
                  .map((animal) => (
                    <option key={animal.id} value={animal.id}>
                      {animal.nome} — brinco{" "}
                      {animal.numero_brinco || "não informado"}
                    </option>
                  ))}
              </select>
            </div>

            <br />

            <button type="submit">
              {editandoId ? "Salvar alterações" : "Cadastrar"}
            </button>

            {editandoId && (
              <button
                disabled={processando}
                className="button-secondary"
                type="button"
                onClick={limparFormulario}
              >
                Cancelar
              </button>
            )}
          </fieldset>
        </form>
      </FormularioCadastro>

      {carregandoLista && <p role="status">Carregando registros...</p>}
      {erroLista && (
        <div className="notice notice-error" role="alert">
          Não foi possível carregar os registros.{" "}
          <button
            disabled={processando}
            type="button"
            onClick={recarregarAnimais}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {!carregandoLista && !erroLista && (
        <ListaAnimais
          animais={animais}
          propriedades={propriedades}
          onEditar={editarAnimal}
          onExcluir={excluirAnimal}
          processando={processando}
        />
      )}
    </div>
  );
}

export default Animais;
