import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import Layout from "./components/LayoutApp";
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
const Producao = lazy(() => import("./pages/Producao"));
const Pesagens = lazy(() => import("./pages/Pesagens"));
const Desmamas = lazy(() => import("./pages/Desmamas"));
const Login = lazy(() => import("./pages/Login"));
const Cadastro = lazy(() => import("./pages/Cadastro"));
const Usuarios = lazy(() => import("./pages/Usuarios"));
const MinhaConta = lazy(() => import("./pages/MinhaConta"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
function FichaAnimalRoute() {
  const { id } = useParams();
  return <FichaAnimal key={id} />;
}

function App() {
  return (
    <AppErrorBoundary>
      <Suspense
        fallback={
          <p className="session-loading" role="status">
            Carregando tela...
          </p>
        }
      >
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
              <Route path="producao" element={<Producao />} />
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
