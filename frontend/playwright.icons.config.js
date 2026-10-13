import base from "./playwright.config.js";

// Mesma API e banco descartável do runner. A variante production serve dist/.
const production = process.env.BOVITRACK_ICON_PRODUCTION === "true";
export default {
  ...base,
  reporter: [["list"], ["html", {
    open: "never",
    outputFolder: `../outputs/iconografia/${production ? "production-report" : "development-report"}`,
  }]],
  testMatch: production ? /icon(ografia|-search)\.spec\.js/ : /icon(ografia|-components|-search)\.spec\.js/,
  projects: [320, 375, 425, 768, 1024, 1440].map((width) => ({
    name: `${width}x900`,
    use: { viewport: { width, height: 900 } },
  })),
  webServer: [
    base.webServer[0],
    {
      ...base.webServer[1],
      // Só o frontend compila em production; API/guard continuam em test.
      env: { NODE_ENV: production ? "production" : "test" },
      command: production
        ? "npm run build && node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5175 --strictPort"
        : base.webServer[1].command,
    },
  ],
};
