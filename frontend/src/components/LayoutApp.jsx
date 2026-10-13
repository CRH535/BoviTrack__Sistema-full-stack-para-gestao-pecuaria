import { useCallback, useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { useBlackHoleTransition } from "../transitions/useBlackHoleTransition";
import AppSidebar from "./AppSidebar";
import IconeImagem from "./IconeImagem";

export default function LayoutApp() {
  const { usuario, logout, finalizarLogoutVisual } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const [busca, setBusca] = useState("");
  const fechar = useCallback(() => setMenu(false), []);
  const {
    iniciarTransicao,
    sinalizarDestinoPronto,
    sinalizarOperacaoConcluida,
  } = useBlackHoleTransition();
  useEffect(() => {
    sinalizarDestinoPronto("route");
  }, [location.pathname, sinalizarDestinoPronto]);
  async function sair() {
    if (!iniciarTransicao("/login", { aguardarOperacao: true })) return;
    await logout({ manterInterface: true });
    sinalizarOperacaoConcluida(finalizarLogoutVisual);
  }
  function pesquisar(event) {
    event.preventDefault();
    navigate(`/animais?busca=${encodeURIComponent(busca.trim())}`);
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#conteudo-principal">
        Pular para o conteúdo
      </a>
      <AppSidebar
        usuario={usuario}
        sair={sair}
        aberto={menu}
        onFechar={fechar}
      />
      <section className="app-main">
        <header className="topbar">
          <button
            className="icon-button menu-toggle"
            type="button"
            aria-label="Abrir menu"
            aria-expanded={menu}
            aria-controls="menu-mobile"
            onClick={() => setMenu(true)}
          >
            <IconeImagem nome="menu" />
          </button>
          <form className="topbar-search" role="search" onSubmit={pesquisar}>
            <IconeImagem nome="busca" />
            <input
              type="search"
              aria-label="Buscar animal por nome ou brinco"
              placeholder="Buscar animal por nome ou brinco..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <button type="submit" aria-label="Pesquisar animais">
              <IconeImagem nome="seta" />
            </button>
          </form>
          <time
            className="topbar-date"
            dateTime={new Date().toLocaleDateString("en-CA")}
          >
            {new Date().toLocaleDateString("pt-BR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </time>
          <Link
            className="topbar-user"
            to="/minha-conta"
            aria-label="Abrir minha conta"
          >
            <span className="user-avatar" aria-hidden="true">
              {usuario.nome?.charAt(0).toUpperCase()}
            </span>
            <span className="user-details">
              <strong>{usuario.nome}</strong>
              <small>
                {usuario.perfil === "admin"
                  ? "Visão administrativa"
                  : "Gestão do rebanho"}
              </small>
            </span>
          </Link>
        </header>
        <main id="conteudo-principal" className="page-content" tabIndex={-1}>
          <Outlet />
        </main>
      </section>
    </div>
  );
}
