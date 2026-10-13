import Button from "../components/ui/Button";
import Icone from "../components/Icone";
import IconeConfiguracoes from "../components/IconeConfiguracoes";
import VoltarInicio from "../components/VoltarInicio";
import { usePreferences } from "../preferences/usePreferences";
import { useTutorial } from "../tutorial/useTutorial";

const temas = [
  {
    value: "light",
    icon: "sol",
    label: "Claro",
    description: "Interface clara e leve.",
  },
  {
    value: "dark",
    icon: "lua",
    label: "Escuro",
    description: "Superfícies escuras e confortáveis.",
  },
  {
    value: "system",
    icon: "sistema",
    label: "Sistema",
    description: "Acompanha este dispositivo.",
  },
];

function Configuracoes() {
  const { theme, resolvedTheme, setTheme } = usePreferences();
  const { restartTutorial, tutorialActive } = useTutorial();

  return (
    <div className="page settings-page">
      <header className="page-header" data-tour="configuracoes">
        <div>
          <span className="eyebrow">Preferências locais</span>
          <h1 className="icon-title">
            <IconeConfiguracoes className="title-settings-icon" />
            Configurações
          </h1>
          <p>Personalize a aparência do BoviTrack neste dispositivo.</p>
        </div>
        <VoltarInicio />
      </header>

      <section
        className="panel settings-section"
        aria-labelledby="aparencia-titulo"
      >
        <div className="settings-section-heading">
          <div>
            <span className="settings-section-icon" aria-hidden="true">
              <IconeConfiguracoes />
            </span>
            <div>
              <h2 id="aparencia-titulo">Aparência</h2>
              <p>Escolha como as telas serão exibidas.</p>
            </div>
          </div>
        </div>

        <fieldset className="theme-fieldset">
          <legend>Tema</legend>
          <div className="theme-options">
            {temas.map((tema) => (
              <label
                key={tema.value}
                className={`theme-option${theme === tema.value ? " selected" : ""}`}
              >
                <input
                  type="radio"
                  name="tema"
                  value={tema.value}
                  checked={theme === tema.value}
                  onChange={() => setTheme(tema.value)}
                />

                <span
                  className={`theme-preview theme-preview--${tema.value}`}
                  aria-hidden="true"
                >
                  <span className="theme-preview-sidebar" />
                  <span className="theme-preview-content">
                    <span />
                    <span />
                  </span>
                </span>

                <span className="theme-option-copy">
                  <strong><Icone nome={tema.icon} />{tema.label}</strong>
                  <small>{tema.description}</small>
                </span>

                <span
                  className="theme-selection-indicator"
                  aria-hidden="true"
                />
              </label>
            ))}
          </div>
        </fieldset>

        <p className="settings-status" aria-live="polite">
          Tema aplicado agora:{" "}
          <strong>{resolvedTheme === "dark" ? "Escuro" : "Claro"}</strong>
          {theme === "system" ? " (definido pelo sistema)." : "."}
        </p>
      </section>

      <section
        className="panel settings-section"
        aria-labelledby="tutorial-titulo"
      >
        <div className="settings-section-heading">
          <div>
            <span className="settings-section-icon" aria-hidden="true">
              <Icone nome="ajuda" />
            </span>
            <div>
              <h2 id="tutorial-titulo">Tutorial do BoviTrack</h2>
              <p>
                Veja novamente o guia rápido das principais funções do sistema.
              </p>
            </div>
          </div>
        </div>
        <Button startIcon="tutorial"
          className="tutorial-settings-action"
          type="button"
          onClick={restartTutorial}
          disabled={tutorialActive}
        >
          Refazer tutorial
        </Button>
      </section>

      <section
        className="panel settings-section settings-future"
        aria-labelledby="preferencias-titulo"
      >
        <h2 id="preferencias-titulo">Neste dispositivo</h2>
        <p>
          O tema escolhido e o progresso do tutorial ficam salvos neste
          navegador. Você pode ajustar a aparência ou refazer o guia a qualquer
          momento.
        </p>
      </section>
    </div>
  );
}

export default Configuracoes;
