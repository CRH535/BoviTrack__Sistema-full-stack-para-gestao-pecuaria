import IlustracaoModulo from "../IlustracaoModulo";
export default function Card({
  titulo,
  icone,
  acao,
  children,
  className = "",
}) {
  return (
    <section className={`panel ui-card ${className}`}>
      {titulo && (
        <header className="ui-card-heading">
          <h2>
            {icone && <IlustracaoModulo nome={icone} />}
            {titulo}
          </h2>
          {acao}
        </header>
      )}
      {children}
    </section>
  );
}
