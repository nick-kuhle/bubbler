// scripts/migrate.ts — apply idempotent schema migrations against DATABASE_URL
// (or the local SQLite file when unset). Run via `npm run migrate`. Wired into the
// Vercel build so a fresh database comes up ready on first deploy.

import { migrate, db } from "../lib/db";

async function main() {
  await migrate();
  await db().close();
  console.log("migrations applied");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});