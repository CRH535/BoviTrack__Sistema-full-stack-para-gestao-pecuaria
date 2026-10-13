import { useState } from "react";
import { createRoot } from "react-dom/client";
import Button, { IconButton } from "../../src/components/ui/Button";
import Icone from "../../src/components/Icone";
import "../../src/styles/tokens.css";
import "../../src/index.css";
import "../../src/styles/layout.css";
import "../../src/styles/ui.css";
import "../../src/styles/icons.css";

export default function Fixture() {
  const [clicks, setClicks] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const registry = JSON.parse(new URLSearchParams(location.search).get("registry") || "[]");
  return (
    <main style={{ padding: 24 }}>
      {registry.length > 0 && (
        <section aria-label="Registro de ícones" style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {registry.map((nome) => <Icone key={nome} nome={nome} />)}
        </section>
      )}
      <Button icon="mais" onClick={() => setClicks(clicks + 1)}>
        Adicionar
      </Button>
      <output aria-label="Cliques">{clicks}</output>
      <Button startIcon="editar" endIcon="seta">
        Editar registro
      </Button>
      <Button leftIcon={<Icone nome="busca" />} rightIcon="seta">
        Buscar registro
      </Button>
      <Button icon="mais" startIcon="salvar">
        Prioridade explícita
      </Button>
      <Button disabled startIcon="excluir" className="button-danger">
        Excluir indisponível
      </Button>
      <IconButton label="Fechar exemplo" icon="fechar" />
      <IconButton
        label="Excluir exemplo"
        icon="excluir"
        className="button-danger"
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(true);
        }}
      >
        <Button type="submit" icon="salvar">
          Salvar formulário
        </Button>
        <output aria-label="Enviado">{String(submitted)}</output>
      </form>
      <Button loading={loading} icon="salvar" onClick={() => setLoading(true)}>
        Salvar em andamento
      </Button>
    </main>
  );
}
createRoot(document.getElementById("root")).render(<Fixture />);
