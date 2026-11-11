import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./useAuth";

function ProtectedRoute() {
  const { autenticado, carregando, verificacaoPendente } = useAuth();
  const location = useLocation();

  if (carregando) {
    return <p className="session-loading">Verificando sessão...</p>;
  }

  if (!autenticado) {
    if (verificacaoPendente) return <Navigate to="/verificar-email" replace />;
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

export default ProtectedRoute;
