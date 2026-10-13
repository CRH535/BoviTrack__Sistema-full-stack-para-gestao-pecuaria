// Registro único: SVGs locais, sem dependência de biblioteca ou rede.
// Geometria já usada no PasswordInput; reutilizada também em "Ver ficha".
const olho =
  "M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z M15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0";
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
  vacinacoes:
    "M16 3l5 5 M14 5l5 5 M5 14l5 5 M4 20l3-3 M7 12l8-8 5 5-8 8z M16 19l2 2 4-4",
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
  entrar: "M15 3h6v18h-6 M3 12h13 M11 7l5 5-5 5",
  retirar: "M4 12h16",
  editar: "M15 4l5 5 M4 20l4-1L21 6a2 2 0 0 0-3-3L5 16z",
  excluir: "M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7",
  salvar: "M4 3h13l4 4v14H3V3z M7 3v6h10V3 M7 21v-8h10v8",
  filtro: "M3 6h18 M3 18h18 M8 3v6 M16 15v6",
  atualizar:
    "M20 8a8 8 0 0 0-14-2L3 9 M3 4v5h5 M4 16a8 8 0 0 0 14 2l3-3 M16 15h5v5",
  voltar: "M20 12H4 M10 6l-6 6 6 6",
  avancar: "M4 12h16 M14 6l6 6-6 6",
  ordenar: "M8 3v18 M4 7l4-4 4 4 M16 21V3 M12 17l4 4 4-4",
  subir: "M12 21V3 M6 9l6-6 6 6",
  descer: "M12 3v18 M6 15l6 6 6-6",
  visualizar: olho,
  ocultar: `${olho} M3 21 21 3`,
  concluir: "M4 12l5 5L20 6",
  resumo: "M6 3h12v18H6z M9 7h6 M9 11h6 M9 15h4",
  historico: "M3 11a9 9 0 1 1 1 6 M3 4v7h7 M12 7v5l3 2",
  desmama:
    "M5 9h11l3 3v5H5z M5 10l-3-2v4l3 1 M7 17v4 M16 17v4 M16 9l2-3 3 1-2 5 M8 5h4 M10 3v4",
  clima:
    "M7 15a4 4 0 1 1 7-3 3 3 0 1 1 4 6H7a3 3 0 0 1 0-6 M13 3v2 M19 5l-1 1 M21 10h-2 M7 5l1 1",
  tutorial: "M4 4h16v16H4z M10 8l6 4-6 4z",
  ajuda: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M9 9a3 3 0 1 1 5 2c-1 1-2 1-2 3 M12 17v1",
  sol: "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5 19 19 M5 19l1.5-1.5 M17.5 6.5 19 5",
  lua: "M21 13a9 9 0 1 1-10-10 7 7 0 0 0 10 10Z",
  sistema: "M3 3h18v13H3z M8 21h8 M12 16v5",
  bloqueio: "M6 10h12v11H6z M8 10V7a4 4 0 0 1 8 0v3 M12 14v3",
  carregando: "M21 12a9 9 0 1 1-9-9",
};
// Compatibilidade com os nomes usados antes da reformulação.
const aliases = {
  pesagem: "identificacao",
  adicionar: "mais",
  buscar: "busca",
  limpar: "atualizar",
};
export default function Icone({ nome, className = "" }) {
  const chave = Object.hasOwn(aliases, nome) ? aliases[nome] : nome;
  const conhecido = Object.hasOwn(caminhos, chave) || nome === "configuracoes";
  if (!conhecido) {
    if (import.meta.env.DEV) console.warn(`Ícone não cadastrado: ${nome}`);
  }
  return (
    <svg
      className={`app-image-icon ${className}`}
      data-icon={nome}
      data-icon-fallback={conhecido ? undefined : "true"}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {nome === "configuracoes" ? (
        <>
          <path d="M9.6 3.35 10.1 2h3.8l.5 1.35a2 2 0 0 0 2.55 1.14l1.3-.55 2.68 2.68-.55 1.3a2 2 0 0 0 1.14 2.55l1.35.5v3.8l-1.35.5a2 2 0 0 0-1.14 2.55l.55 1.3-2.68 2.68-1.3-.55a2 2 0 0 0-2.55 1.14l-.5 1.35h-3.8l-.5-1.35a2 2 0 0 0-2.55-1.14l-1.3.55-2.68-2.68.55-1.3a2 2 0 0 0-1.14-2.55l-1.35-.5v-3.8l1.35-.5a2 2 0 0 0 1.14-2.55l-.55-1.3 2.68-2.68 1.3.55A2 2 0 0 0 9.6 3.35Z" />
          <circle cx="12" cy="12.87" r="3.15" />
        </>
      ) : (
        <path d={conhecido ? caminhos[chave] : caminhos.alerta} />
      )}
    </svg>
  );
}
