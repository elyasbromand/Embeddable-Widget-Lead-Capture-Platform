import { defineConfig } from "vitest/config";

// `npm test` loads .env first (for JWT_SECRET, MAIL_FROM, ...). Tests then point at their OWN
// database, `<dev db name>_test` on the same Postgres, so they never touch dev data.
// TEST_DATABASE_URL overrides that (e.g. in CI).
function testDatabaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `${url.pathname}_test`;
  return url.toString();
}

export default defineConfig({
  test: {
    // Every test file sees these, whatever the developer's .env says. The dev-only flags are
    // switched off here, so GEO_TEST_IP=8.8.8.8 in .env cannot make a test call a real provider.
    env: {
      NODE_ENV: "test",
      DATABASE_URL: testDatabaseUrl(),
      LOG_LEVEL: "silent",
      GEO_TEST_IP: "",
      GEO_FORCE_DOWN: "",
      FORCE_EMAIL_FAILURE: "false",
    },
    // Drops and recreates the test database, then runs every migration: each run starts clean.
    globalSetup: ["./test/setup/globalSetup.js"],
    // Files share one database, so they run one after another; each file empties the tables first.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
