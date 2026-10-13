export default function Marca({ className = "" }) {
  return (
    <span className={`brand ${className}`}>
      <img
        className="brand-symbol"
        src="/favicon.svg"
        alt=""
        aria-hidden="true"
      />
      <span>BoviTrack</span>
    </span>
  );
}
