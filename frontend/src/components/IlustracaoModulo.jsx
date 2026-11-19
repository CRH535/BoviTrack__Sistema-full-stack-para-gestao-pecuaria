import dashboard from "../assets/navigation/dashboard.webp?no-inline";
import animais from "../assets/navigation/animais.webp?no-inline";
import propriedades from "../assets/navigation/propriedades.webp?no-inline";
import lotes from "../assets/navigation/lotes.webp?no-inline";
import pesagens from "../assets/navigation/pesagens.webp?no-inline";
import desmamas from "../assets/navigation/desmamas.webp?no-inline";
import vacinas from "../assets/navigation/vacinas.webp?no-inline";
import vacinacoes from "../assets/navigation/vacinacoes.webp?no-inline";
import producao from "../assets/navigation/producao.webp?no-inline";
import despesas from "../assets/navigation/despesas.webp?no-inline";
import lucros from "../assets/navigation/lucros.webp?no-inline";
import usuarios from "../assets/navigation/usuarios.webp?no-inline";
import minhaConta from "../assets/navigation/minha-conta.webp?no-inline";
import configuracoes from "../assets/navigation/configuracoes.webp?no-inline";
import Icone from "./Icone";

const imagens = {
  inicio: dashboard,
  animais,
  propriedades,
  lotes,
  pesagem: pesagens,
  identificacao: pesagens,
  desmama: desmamas,
  vacinas,
  vacinacoes,
  producao,
  despesas,
  lucros,
  usuarios,
  "minha-conta": minhaConta,
  configuracoes,
};

// Ilustrações dos módulos na navegação e no conteúdo. Ações usam Icone.
export default function IlustracaoModulo({ nome, className = "" }) {
  if (!Object.hasOwn(imagens, nome)) {
    return <Icone nome={nome} className={className} />;
  }
  return (
    <span
      className={`module-illustration ${className}`.trim()}
      data-module-image={nome}
      aria-hidden="true"
    >
      <img src={imagens[nome]} alt="" width="96" height="96" draggable="false" />
    </span>
  );
}
