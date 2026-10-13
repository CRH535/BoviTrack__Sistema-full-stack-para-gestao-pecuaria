const caminhos = {
  inicio: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  animais:
    "M5 8h11l3 3v6H5z M5 9 2 7v5l3 1 M16 8l2-3 3 1-2 5 M7 17v4 M15 17v4 M19 15v6 M8 8V5 M11 8V5",
  "animais-lotes":
    "M5 8h11l3 3v6H5z M5 9 2 7v5l3 1 M7 17v4 M15 17v4 M18 6l3-3 M18 3h3v3",
  identificacao: "M8 3h8l5 18H3z M9 7a3 3 0 0 1 6 0 M12 7v3",
  lotes:
    "M12 2 6 5v7l6 3 6-3V5z M6 5l6 3 6-3 M12 8v7 M6 12l-5 3v6l5 2 6-3v-5 M18 12l5 3v6l-5 2-6-3 M1 15l5 3 6-3 M6 18v5 M12 15l6 3 5-3 M18 18v5",
  producao: "M9 2h6v4l3 4v11H6V10l3-4z M9 6h6 M6 12h12",
  propriedades: "M2 11 12 2l10 9 M5 9v12h14V9 M10 21v-7h4v7",
  vacinas:
    "M16 3l5 5 M14 5l5 5 M5 14l5 5 M7 12l5 5 M4 20l3-3 M7 12l8-8 5 5-8 8z",
  vacinacoes: "M16 3l5 5 M14 5l5 5 M5 14l5 5 M4 20l3-3 M7 12l8-8 5 5-8 8z",
  "proximas-vacinas": "M4 5h16v16H4z M8 2v6 M16 2v6 M4 10h16 M9 15l2 2 4-4",
  despesas: "M6 2h9l4 4v16H6z M15 2v5h4 M9 11h7 M9 15h7 M9 19h4",
  lucros: "M3 17l6-6 4 3 8-10 M16 4h5v5 M3 21h18",
  usuarios:
    "M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M2 21v-2a7 7 0 0 1 14 0v2 M17 4a4 4 0 0 1 0 8 M19 15a6 6 0 0 1 3 6",
  sair: "M9 3H3v18h6 M8 12h13 M16 7l5 5-5 5",
  busca: "M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14 M15 15l6 6",
  menu: "M3 6h18 M3 12h18 M3 18h18",
  fechar: "M5 5l14 14 M19 5 5 19",
  seta: "M9 5l7 7-7 7",
  mais: "M12 4v16 M4 12h16",
  alerta: "M12 3 2 21h20z M12 9v5 M12 17v1",
  calendario: "M4 5h16v16H4z M8 2v6 M16 2v6 M4 10h16",
  relogio: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20 M12 6v6l4 2",
  grafico: "M4 20v-6 M10 20V9 M16 20V4 M22 20H2",
  dinheiro:
    "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20 M15 8h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9 M12 6v12",
};
export default function Icone({ nome, className = "" }) {
  if (!caminhos[nome]) return null;
  return (
    <svg
      className={`app-image-icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={caminhos[nome]} />
    </svg>
  );
}
