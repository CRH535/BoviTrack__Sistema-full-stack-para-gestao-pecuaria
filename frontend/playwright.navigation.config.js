import base from "./playwright.config.js";

const production = process.env.BOVITRACK_NAV_PRODUCTION === "true";
export default {
  ...base,
  testMatch: "navigation-images.spec.js",
  timeout: 120000,
  reporter: [["list"], ["html", {
    open: "never",
    outputFolder: `../outputs/navigation-images/${production ? "production-report" : "development-report"}`,
  }]],
  projects: [320, 375, 425, 768, 1024, 1440].map((width) => ({
    name: `${width}x900`,
    use: { viewport: { width, height: 900 } },
  })),
  webServer: [base.webServer[0], {
    ...base.webServer[1],
    env: { NODE_ENV: production ? "production" : "test" },
    command: production
      ? "npm run build && node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5175 --strictPort"
      : base.webServer[1].command,
  }],
};
