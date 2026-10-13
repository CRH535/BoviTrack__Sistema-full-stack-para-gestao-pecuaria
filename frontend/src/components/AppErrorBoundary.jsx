import Button from "./ui/Button";
import { Component } from "react";
import { createPortal } from "react-dom";

class AppErrorBoundary extends Component {
  state = { falhou: false };

  static getDerivedStateFromError() {
    return { falhou: true };
  }

  render() {
    if (this.state.falhou) {
      // O portal mantém a recuperação acessível mesmo durante uma transição.
      return createPortal(
        <section className="app-error-recovery" role="alert" aria-labelledby="app-error-title">
          <div className="panel">
            <h1 id="app-error-title">Não foi possível abrir esta tela</h1>
            <p>A aplicação pode ter sido atualizada. Recarregue a página para tentar novamente.</p>
            <Button startIcon="atualizar" type="button" autoFocus onClick={() => window.location.reload()}>Recarregar página</Button>
          </div>
        </section>,
        document.body,
      );
    }
    return this.props.children;
  }
}

export default AppErrorBoundary;
