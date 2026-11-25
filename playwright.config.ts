import { defineConfig } from "@playwright/test";
const port = 4289;
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port " + port,
    url: "http://127.0.0.1:" + port,
    timeout: 60000,
    reuseExistingServer: false,
    env: {
      CRM_SEED_SAMPLE_WORKSPACE: "true",
      CRM_TEST_DB: "memory://",
      DATABASE_URL: "",
      POSTGRES_URL: "",
      VERCEL: "",
      CRM_FILE_DIR: ".demo/browser-test-files",
    },
  },
  use: {
    baseURL: "http://127.0.0.1:" + port,
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined },
  },
});
