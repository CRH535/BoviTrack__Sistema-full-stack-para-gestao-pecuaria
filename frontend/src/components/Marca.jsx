import marcaClara from "../assets/brand/bovitrack-horizontal-claro.webp?no-inline";
import marcaEscura from "../assets/brand/bovitrack-horizontal-escuro.webp?no-inline";

export default function Marca({ className = "" }) {
  return (
    <span className={`brand ${className}`} role="img" aria-label="BoviTrack">
      <img
        className="brand-wordmark brand-wordmark-light"
        src={marcaClara}
        alt=""
        aria-hidden="true"
        width="640"
        height="179"
      />
      <img
        className="brand-wordmark brand-wordmark-dark"
        src={marcaEscura}
        alt=""
        aria-hidden="true"
        width="640"
        height="179"
      />
    </span>
  );
}
