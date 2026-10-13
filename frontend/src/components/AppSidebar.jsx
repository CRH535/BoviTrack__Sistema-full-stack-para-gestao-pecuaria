import { useEffect, useRef } from "react";
import { Link, NavLink } from "react-router-dom";
import IconeImagem from "./IconeImagem";
import IconeConfiguracoes from "./IconeConfiguracoes";
import Marca from "./Marca";

const itens = [
  ["/", "Dashboard", "inicio"],
  ["/animais", "Animais", "animais"],
  ["/propriedades", "Propriedades", "propriedades"],
  ["/lotes", "Lotes", "lotes"],
  ["/pesagens", "Pesagens", "identificacao"],
  ["/desmamas", "Desmamas", "animais-lotes"],
  ["/vacinas", "Vacinas", "vacinas"],
  ["/vacinacoes", "Vacinações", "vacinacoes"],
  ["/producao", "Produção", "producao"],
  ["/despesas", "Despesas", "despesas"],
  ["/lucros", "Lucros", "lucros"],
  ["/configuracoes", "Configurações", "configuracoes"],
];
function Conteudo({ usuario, sair, fechar }) {
  return (
    <>
      <nav className="nav-links" aria-label="Menu principal">
        {[
          ...itens,
          usuario.perfil === "admin"
            ? ["/usuarios", "Usuários", "usuarios"]
            : ["/minha-conta", "Minha Conta", "usuarios"],
        ].map(([to, label, icon]) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            aria-label={label}
            title={label}
            data-tour={`menu-${icon}`}
            onClick={fechar}
            className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
          >
            {icon === "configuracoes" ? (
              <IconeConfiguracoes className="nav-icon-image" />
            ) : (
              <IconeImagem nome={icon} className="nav-icon-image" />
            )}
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="nav-user">
        <span className="user-avatar" aria-hidden="true">
          {usuario.nome?.charAt(0).toUpperCase()}
        </span>
        <span className="user-details">
          <strong>{usuario.nome}</strong>
          <small>
            {usuario.perfil === "admin" ? "Administrador" : "Produtor"}
          </small>
        </span>
        <button
          className="logout-button"
          type="button"
          onClick={() => {
            fechar?.();
            sair();
          }}
          aria-label="Sair"
        >
          <IconeImagem nome="sair" className="nav-icon-image" />
          <span>Sair</span>
        </button>
      </div>
    </>
  );
}
export default function AppSidebar({ usuario, sair, aberto, onFechar }) {
  const dialog = useRef(null);
  useEffect(() => {
    const el = dialog.current;
    if (!aberto) {
      if (el.open) el.close();
      return;
    }
    el.showModal();
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const media = window.matchMedia("(min-width: 1025px)");
    const redimensionar = () => {
      if (media.matches) onFechar();
    };
    media.addEventListener("change", redimensionar);
    return () => {
      document.body.style.overflow = anterior;
      media.removeEventListener("change", redimensionar);
      if (el.open) el.close();
    };
  }, [aberto, onFechar]);
  return (
    <>
      <aside className="sidebar">
        <Link className="sidebar-brand" to="/" aria-label="BoviTrack - início">
          <Marca />
        </Link>
        <Conteudo usuario={usuario} sair={sair} />
      </aside>
      <dialog
        ref={dialog}
        id="menu-mobile"
        className="drawer"
        aria-label="Navegação do BoviTrack"
        onCancel={onFechar}
        onClick={(event) => {
          if (
            event.target === event.currentTarget &&
            event.clientX > event.currentTarget.getBoundingClientRect().right
          )
            onFechar();
        }}
      >
        <div className="drawer-heading">
          <Link to="/" onClick={onFechar} aria-label="BoviTrack - início">
            <Marca />
          </Link>
          <button
            className="icon-button"
            type="button"
            onClick={onFechar}
            aria-label="Fechar menu"
          >
            <IconeImagem nome="fechar" />
          </button>
        </div>
        <Conteudo usuario={usuario} sair={sair} fechar={onFechar} />
      </dialog>
    </>
  );
}
