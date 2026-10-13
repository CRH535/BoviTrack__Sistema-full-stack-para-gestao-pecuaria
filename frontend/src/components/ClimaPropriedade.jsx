import Button from "./ui/Button";
import { useEffect, useState } from "react";
import api from "../services/api";
import { formatarDataSemFuso } from "../utils/datas";
import { descreverClima, formatarMedida } from "../utils/clima";

function ClimaPropriedade({ propriedade, compacto = false }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    const controlador = new AbortController();
    // Cada seleção começa em estado de loading, sem mostrar o clima anterior.
    api.get(`/clima/propriedades/${propriedade.id}`, { signal: controlador.signal })
      .then((resposta) => {
        setDados(resposta.data);
        setErro("");
      })
      .catch((falha) => {
        if (falha.code === "ERR_CANCELED") return;
        setDados(null);
        setErro(falha.response?.data?.mensagem || "Não foi possível carregar os dados meteorológicos.");
      })
      .finally(() => {
        if (!controlador.signal.aborted) setCarregando(false);
      });
    return () => controlador.abort();
  }, [propriedade.id, tentativa]);

  const clima = dados && descreverClima(dados.atual.codigoClima);
  const hoje = dados?.previsao?.[0];

  return (
    <div className={`weather-content${compacto ? " weather-compact" : ""}`} aria-live="polite">
      {carregando && <p className="weather-message">Carregando previsão do tempo...</p>}
      {!carregando && erro && (
        <div className="weather-message">
          <p>{erro}</p>
          <Button startIcon="atualizar" className="button-secondary" type="button" onClick={() => { setCarregando(true); setTentativa((valor) => valor + 1); }}>
            Tentar novamente
          </Button>
        </div>
      )}
      {!carregando && dados && (
        <>
          <div className="weather-current">
            <span className="weather-symbol" role="img" aria-label={clima.descricao}>{clima.simbolo}</span>
            <div className="weather-current-main">
              <strong>{formatarMedida(dados.atual.temperatura, "°C")}</strong>
              <span>{clima.descricao}</span>
              <small>{dados.propriedade.cidade} - {dados.propriedade.estado}</small>
            </div>
          </div>
          <div className="weather-metrics">
            <span>Máx. {formatarMedida(hoje?.temperaturaMaxima, "°C")} · Mín. {formatarMedida(hoje?.temperaturaMinima, "°C")}</span>
            <span>Chuva: {formatarMedida(hoje?.probabilidadeChuva, "%")}</span>
            <span>Vento: {formatarMedida(dados.atual.vento, " km/h")}</span>
            {!compacto && <>
              <span>Sensação: {formatarMedida(dados.atual.sensacao, "°C")}</span>
              <span>Umidade: {formatarMedida(dados.atual.umidade, "%")}</span>
              <span>Precipitação: {typeof dados.atual.precipitacao === "number" ? `${dados.atual.precipitacao} mm` : "—"}</span>
            </>}
          </div>
          {!compacto && <>
            <h4 className="weather-forecast-heading">Previsão para os próximos dias</h4>
            <div className="weather-forecast">
              {dados.previsao.map((dia) => {
                const condicao = descreverClima(dia.codigoClima);
                return (
                  <div className="weather-day" key={dia.data}>
                    <strong>{formatarDataSemFuso(dia.data)}</strong>
                    <span role="img" aria-label={condicao.descricao}>{condicao.simbolo}</span>
                    <small>{formatarMedida(dia.temperaturaMinima, "°")} / {formatarMedida(dia.temperaturaMaxima, "°")}</small>
                    <small>Chuva {formatarMedida(dia.probabilidadeChuva, "%")}</small>
                    <small>Vento {formatarMedida(dia.ventoMaximo, " km/h")}</small>
                  </div>
                );
              })}
            </div>
          </>}
          {dados.alertas.length > 0 && (
            <ul className="weather-alerts">
              {dados.alertas.map((alerta) => <li key={alerta}>{alerta}</li>)}
            </ul>
          )}
          <small className="weather-credit">Dados meteorológicos: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a></small>
        </>
      )}
    </div>
  );
}

export default ClimaPropriedade;
