import dashboard from "../assets/navigation/dashboard.webp?no-inline";
import animais from "../assets/navigation/animais.webp?no-inline";
import propriedades from "../assets/navigation/propriedades.webp?no-inline";
import lotes from "../assets/navigation/lotes.webp?no-inline";
import pesagens from "../assets/navigation/pesagens.svg?no-inline";
import vacinas from "../assets/navigation/vacinas.webp?no-inline";
import vacinacoes from "../assets/navigation/vacinacoes.webp?no-inline";
import producao from "../assets/navigation/producao.svg?no-inline";
import despesas from "../assets/navigation/despesas.webp?no-inline";
import lucros from "../assets/navigation/lucros.webp?no-inline";
import usuarios from "../assets/navigation/usuarios.webp?no-inline";
import configuracoes from "../assets/navigation/configuracoes.svg?no-inline";
import Icone from "./Icone";

const imagens = {
  inicio: dashboard,
  animais,
  propriedades,
  lotes,
  pesagem: pesagens,
  identificacao: pesagens,
  vacinas,
  vacinacoes,
  producao,
  despesas,
  lucros,
  usuarios,
  configuracoes,
};

// Apenas módulos de navegação. Ações continuam usando o registro funcional Icone.
export default function IlustracaoModulo({ nome, className = "" }) {
  if (!Object.hasOwn(imagens, nome) && nome !== "desmama") {
    return <Icone nome={nome} className={className} />;
  }
  return (
    <span
      className={`module-illustration ${nome === "desmama" ? "module-illustration-pair" : ""} ${className}`.trim()}
      data-module-image={nome}
      aria-hidden="true"
    >
      {nome === "desmama" ? (
        <>
          <img src={animais} className="module-cow" alt="" width="96" height="96" draggable="false" />
          <img src={animais} className="module-calf" alt="" width="96" height="96" draggable="false" />
        </>
      ) : (
        <img src={imagens[nome]} alt="" width="96" height="96" draggable="false" />
      )}
    </span>
  );
}
