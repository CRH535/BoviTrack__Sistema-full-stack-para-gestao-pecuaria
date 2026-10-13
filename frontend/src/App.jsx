import { lazy, Suspense, useEffect } from "react";
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { useAuth } from "./auth/useAuth";
import ProtectedRoute from "./auth/ProtectedRoute";
import AdminRoute from "./auth/AdminRoute";
import AppErrorBoundary from "./components/AppErrorBoundary";
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Propriedades = lazy(() => import("./pages/Propriedades"));
const Animais = lazy(() => import("./pages/Animais"));
const FichaAnimal = lazy(() => import("./pages/FichaAnimal"));
const Lotes = lazy(() => import("./pages/Lotes"));
const Vacinas = lazy(() => import("./pages/Vacinas"));
const Vacinacoes = lazy(() => import("./pages/Vacinacoes"));
const Despesas = lazy(() => import("./pages/Despesas"));
const Lucros = lazy(() => import("./pages/Lucros"));
const Pesagens = lazy(() => import("./pages/Pesagens"));
const Desmamas = lazy(() => import("./pages/Desmamas"));
const Login = lazy(() => import("./pages/Login"));
const Cadastro = lazy(() => import("./pages/Cadastro"));
const Usuarios = lazy(() => import("./pages/Usuarios"));
const MinhaConta = lazy(() => import("./pages/MinhaConta"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
import IconeImagem from "./components/IconeImagem";
import IconeConfiguracoes from "./components/IconeConfiguracoes";
import { useBlackHoleTransition } from "./transitions/useBlackHoleTransition";

const itensMenu = [
  { to: "/", label: "Início", icon: "inicio", end: true },
  { to: "/propriedades", label: "Propriedades", icon: "propriedades" },
  { to: "/animais", label: "Animais", icon: "animais" },
  { to: "/lotes", label: "Lotes", icon: "lotes" },
  { to: "/pesagens", label: "Pesagens", icon: "identificacao" },
  { to: "/desmamas", label: "Desmamas", icon: "animais-lotes" },
  { to: "/vacinas", label: "Vacinas", icon: "vacinas" },
  { to: "/vacinacoes", label: "Vacinações", icon: "vacinacoes" },
  { to: "/despesas", label: "Despesas", icon: "despesas" },
  { to: "/lucros", label: "Lucros", icon: "producao" },
  { to: "/configuracoes", label: "Configurações", icon: "configuracoes" },
];

function Marca() {
  return (
    <span className="brand">
      <img
        className="brand-symbol"
        src="/favicon.svg"
        alt=""
        aria-hidden="true"
      />
      <span><strong>BOVI</strong>TRACK</span>
    </span>
  );
}

function FichaAnimalRoute() {
  const { id } = useParams();
  return <FichaAnimal key={id} />;
}

function Layout() {
  const { usuario, logout, finalizarLogoutVisual } = useAuth();
  const location = useLocation();
  const {
    iniciarTransicao,
    sinalizarDestinoPronto,
    sinalizarOperacaoConcluida,
  } = useBlackHoleTransition();

  useEffect(() => {
    sinalizarDestinoPronto("route");
  }, [location.pathname, sinalizarDestinoPronto]);

  async function sair() {
    const transicaoIniciada = iniciarTransicao("/login", {
      aguardarOperacao: true,
    });

    if (!transicaoIniciada) {
      return;
    }

    await logout({ manterInterface: true });
    sinalizarOperacaoConcluida(finalizarLogoutVisual);
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#conteudo-principal">Pular para o conteúdo</a>
      <aside className="sidebar">
        <Link className="sidebar-brand" to="/" aria-label="BoviTrack - início">
          <Marca />
        </Link>

        <nav className="nav-links" aria-label="Menu principal">
          {itensMenu.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              aria-label={item.label}
              title={item.label}
              data-tour={`menu-${item.icon}`}
              className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}
            >
              {item.icon === "configuracoes" ? (
                <IconeConfiguracoes className="nav-icon-image nav-settings-icon" />
              ) : (
                <IconeImagem nome={item.icon} className="nav-icon-image" />
              )}
              <span>{item.label}</span>
            </NavLink>
          ))}

          {usuario.perfil === "admin" && (
            <NavLink
              to="/usuarios"
              aria-label="Usuários"
              title="Usuários"
              className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}
            >
              <IconeImagem nome="usuarios" className="nav-icon-image" />
              <span>Usuários</span>
            </NavLink>
          )}

          {usuario.perfil === "usuario" && (
            <NavLink
              to="/minha-conta"
              aria-label="Minha Conta"
              title="Minha Conta"
              className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}
            >
              <IconeImagem nome="usuarios" className="nav-icon-image" />
              <span>Minha Conta</span>
            </NavLink>
          )}
        </nav>

        <div className="nav-user">
          <span className="user-avatar" aria-hidden="true">
            {usuario.nome?.charAt(0).toUpperCase()}
          </span>
          <span className="user-details">
            <strong>{usuario.nome}</strong>
            <small>{usuario.perfil === "admin" ? "Administrador" : "Usuário"}</small>
          </span>
          <button className="logout-button" type="button" onClick={sair} title="Sair" aria-label="Sair">
            <IconeImagem nome="sair" className="nav-icon-image" />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      <section className="app-main">
        <header className="topbar">
          <div>
            <strong>Olá, {usuario.nome?.split(" ")[0]}! <span aria-hidden="true">👋</span></strong>
            <small>Seu rebanho organizado em um só lugar</small>
          </div>
          <div className="topbar-user">
            <span className="topbar-dot" aria-hidden="true" />
            <span>{usuario.perfil === "admin" ? "Visão administrativa" : "Minha propriedade"}</span>
          </div>
        </header>

        <main id="conteudo-principal" className="page-content" tabIndex={-1}>
          <Outlet />
        </main>
      </section>
    </div>
  );
}

function App() {
  return (
    <AppErrorBoundary>
    <Suspense fallback={<p className="session-loading" role="status">Carregando tela...</p>}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/cadastro" element={<Cadastro />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="propriedades" element={<Propriedades />} />
          <Route path="animais" element={<Animais />} />
          <Route path="animais/:id" element={<FichaAnimalRoute />} />
          <Route path="lotes" element={<Lotes />} />
          <Route path="pesagens" element={<Pesagens />} />
          <Route path="desmamas" element={<Desmamas />} />
          <Route path="vacinas" element={<Vacinas />} />
          <Route path="vacinacoes" element={<Vacinacoes />} />
          <Route path="despesas" element={<Despesas />} />
          <Route path="lucros" element={<Lucros />} />
          <Route path="configuracoes" element={<Configuracoes />} />
          <Route path="minha-conta" element={<MinhaConta />} />
          <Route element={<AdminRoute />}>
            <Route path="usuarios" element={<Usuarios />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
    </AppErrorBoundary>
  );
}

export default App;
