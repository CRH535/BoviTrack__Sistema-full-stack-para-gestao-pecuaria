import Button from "../components/ui/Button";
import { useEffect, useState } from "react";
import DashboardConteudo from "../components/dashboard/DashboardConteudo";
import api from "../services/api";

import { useBlackHoleTransition } from "../transitions/useBlackHoleTransition";

const resumoInicial = {
  propriedades: 0,
  animais: 0,
  lotes: 0,
  vacinas: 0,
  total_despesas: 0,
  total_receitas: 0,
  lucro_liquido: 0,
  bezerros_aleitamento: 0,
  desmamas_planejadas: 0,
  desmamas_proximas: 0,
  desmamados_ano: 0,
  animais_sem_pesagem_recente: 0,
};

function Dashboard() {
  const [resumo, setResumo] = useState(resumoInicial);
  const [proximasVacinacoes, setProximasVacinacoes] = useState([]);
  const [erro, setErro] = useState("");
  const [carregamentoConcluido, setCarregamentoConcluido] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const { sinalizarDestinoPronto } = useBlackHoleTransition();

  useEffect(() => {
    let componenteAtivo = true;
    const controller = new AbortController();

    async function carregarDashboard() {
      try {
        const resposta = await api.get("/dashboard", {
          signal: controller.signal,
        });
        if (componenteAtivo) {
          setResumo(resposta.data.resumo);
          setProximasVacinacoes(resposta.data.proximas_vacinacoes);
        }
      } catch {
        if (componenteAtivo) {
          console.error("Falha ao carregar o dashboard");
          setErro("Erro ao carregar o dashboard");
        }
      } finally {
        if (componenteAtivo) {
          setCarregamentoConcluido(true);
        }
      }
    }

    carregarDashboard();

    return () => {
      componenteAtivo = false;
      controller.abort();
    };
  }, [tentativa]);

  useEffect(() => {
    if (carregamentoConcluido) {
      sinalizarDestinoPronto("dashboard");
    }
  }, [carregamentoConcluido, sinalizarDestinoPronto]);

  if (!carregamentoConcluido) {
    return (
      <p className="session-loading inline-loading" role="status">
        Carregando visão geral do rebanho...
      </p>
    );
  }

  if (erro) {
    return (
      <div className="page">
        <h1>Visão geral do rebanho</h1>
        <p className="notice notice-error" role="alert">
          {erro}
        </p>
        <Button startIcon="atualizar"
          type="button"
          onClick={() => {
            setErro("");
            setCarregamentoConcluido(false);
            setTentativa((atual) => atual + 1);
          }}
        >
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <DashboardConteudo
      resumo={resumo}
      proximasVacinacoes={proximasVacinacoes}
    />
  );
}

export default Dashboard;
