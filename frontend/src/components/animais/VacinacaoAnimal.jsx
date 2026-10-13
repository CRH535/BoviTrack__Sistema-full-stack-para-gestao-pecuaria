import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../services/api";
import Card from "../ui/Card";
import TabelaResponsiva from "../ui/TabelaResponsiva";
import { Carregamento, EstadoVazio } from "../ui/Estado";
import { formatarDataSemFuso } from "../../utils/datas";
const colunas = [
  {
    id: "vacina",
    rotulo: "Vacina",
    render: (v) => <strong>{v.vacina}</strong>,
  },
  {
    id: "data_aplicacao",
    rotulo: "Aplicação",
    render: (v) => formatarDataSemFuso(v.data_aplicacao),
  },
  {
    id: "proxima_dose",
    rotulo: "Próxima dose",
    render: (v) => formatarDataSemFuso(v.proxima_dose),
  },
  {
    id: "observacao",
    rotulo: "Observação",
    render: (v) => v.observacao || "—",
  },
];
export default function VacinacaoAnimal({ animal }) {
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api
      .getAll(`/animais/${animal.id}/vacinacoes`, { signal: controller.signal })
      .then((r) => {
        setLista(r.data);
        setErro(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setErro(true);
      });
    return () => controller.abort();
  }, [animal.id, tentativa]);
  return (
    <>
      <div className="section-heading">
        <h2>Vacinações do animal</h2>
        <Link
          className="button-link"
          to={`/vacinacoes?novo=1&animal=${animal.id}`}
        >
          Registrar vacinação
        </Link>
      </div>
      {erro ? (
        <div className="notice notice-error" role="alert">
          Não foi possível carregar as vacinações.{" "}
          <button onClick={() => setTentativa((n) => n + 1)}>
            Tentar novamente
          </button>
        </div>
      ) : lista ? (
        lista.length ? (
          <Card className="ui-table-panel">
            <TabelaResponsiva
              nome="Vacinações do animal"
              colunas={colunas}
              itens={lista}
            />
          </Card>
        ) : (
          <EstadoVazio
            titulo="Nenhuma vacinação registrada"
            descricao="Registre as aplicações para acompanhar as próximas doses."
            icone="vacinas"
          />
        )
      ) : (
        <Carregamento />
      )}
    </>
  );
}
