import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Button from "./ui/Button";
import api from "../services/api";
import ClimaPropriedade from "./ClimaPropriedade";

function ClimaDashboard() {
  const [propriedades, setPropriedades] = useState([]);
  const [selecionadaId, setSelecionadaId] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    api.getAll("/propriedades")
      .then((resposta) => {
        if (!ativo) return;
        const lista = resposta.data;
        setPropriedades(lista);
        setSelecionadaId(lista[0]?.id ?? null);
      })
      .catch(() => { if (ativo) setErro("Não foi possível carregar as propriedades."); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, []);

  const selecionada = propriedades.find((item) => item.id === selecionadaId);

  return (
    <section className="panel weather-panel" aria-labelledby="weather-title">
      <div className="panel-heading weather-panel-heading">
        <div><span className="eyebrow">Na propriedade</span><h2 id="weather-title">Clima</h2></div>
        <span className="panel-chip">7 dias</span>
      </div>
      {carregando && <p className="weather-message">Carregando propriedades...</p>}
      {!carregando && erro && <p className="weather-message">{erro}</p>}
      {!carregando && !erro && propriedades.length === 0 && (
        <div className="weather-message">Cadastre uma propriedade para visualizar a previsão. <Link to="/propriedades">Ver propriedades</Link></div>
      )}
      {!carregando && selecionada && <>
        {propriedades.length > 1 && (
          <label className="weather-select-label" htmlFor="weather-property">Propriedade
            <select id="weather-property" value={selecionadaId} onChange={(evento) => setSelecionadaId(Number(evento.target.value))}>
              {propriedades.map((propriedade) => <option key={propriedade.id} value={propriedade.id}>{propriedade.nome}</option>)}
            </select>
          </label>
        )}
        <ClimaPropriedade key={selecionada.id} propriedade={selecionada} compacto />
        <Button as={Link} endIcon="seta" className="weather-details-link" to={`/propriedades?clima=${selecionada.id}`}>Ver previsão completa nas propriedades</Button>
      </>}
    </section>
  );
}

export default ClimaDashboard;
