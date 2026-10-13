import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./styles/tokens.css";
import "./index.css";
import "./styles/layout.css";
import "./styles/ui.css";
import "./styles/icons.css";
import "./styles/navigation-images.css";
import App from "./App.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";
import { BlackHoleTransitionProvider } from "./transitions/BlackHoleTransitionProvider.jsx";
import { PreferencesProvider } from "./preferences/PreferencesProvider.jsx";
import { TutorialProvider } from "./tutorial/TutorialProvider.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <PreferencesProvider>
      <BrowserRouter>
        <BlackHoleTransitionProvider>
          <AuthProvider>
            <TutorialProvider>
              <App />
            </TutorialProvider>
          </AuthProvider>
        </BlackHoleTransitionProvider>
      </BrowserRouter>
    </PreferencesProvider>
  </StrictMode>,
);
