import { execFileSync } from "node:child_process";
import pg from "pg";

// Runs once before the whole suite, in the main vitest process.
// 1. Drop and recreate the test database (WITH (FORCE) closes any connection a crashed run left).
// 2. Run the migrations against it, exactly as `npm run migrate up` does for dev.
// So "green" always means "green from a clean database", never "green on leftovers".
export default async function setup() {
  const testUrl = new URL(process.env.TEST_DATABASE_URL ?? deriveTestUrl());
  const dbName = testUrl.pathname.slice(1);
  if (!/^[a-z_][a-z0-9_]*$/.test(dbName) || !dbName.endsWith("_test")) {
    // Refuse anything that is not clearly a test database: this function DROPs it.
    throw new Error(`Refusing to reset "${dbName}": the test database name must end in _test`);
  }

  const adminUrl = new URL(testUrl);
  adminUrl.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${dbName}`);
  } finally {
    await admin.end();
  }

  execFileSync(
    process.execPath,
    ["node_modules/node-pg-migrate/bin/node-pg-migrate.js", "up", "-m", "migrations"],
    { env: { ...process.env, DATABASE_URL: testUrl.toString() }, stdio: "pipe" }
  );
}

function deriveTestUrl() {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `${url.pathname}_test`;
  return url.toString();
}
