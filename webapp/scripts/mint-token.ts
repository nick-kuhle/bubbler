// scripts/mint-token.ts — mint a long-lived bearer token for the on-device agent.
//
//   npm run token -- base@example.com 365
//
// Walks: ensure the user exists (created as operator if they match AUTH_OPERATOR),
// create a session with the requested lifetime, print the raw token on stdout.
// Put that token in phone-agent/config.yaml `agent.bearer_token`.

import { migrate, db } from "../lib/db";
import { nid, nowIso, addDaysIso } from "../lib/id";
import { newToken } from "../lib/auth";

function sha256(s: string): string {
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  return createHash("sha256").update(s).digest("hex");
}

async function main() {
  const [, , emailArg, daysArg] = process.argv;
  if (!emailArg || !String(emailArg).includes("@")) {
    console.error("usage: npm run token -- <email> [days]");
    process.exit(1);
  }
  const email = String(emailArg).trim().toLowerCase();
  const days = Math.min(Math.max(Number(daysArg) || 365, 1), 365 * 5);

  await migrate();
  const d = db();
  const operator = (process.env.AUTH_OPERATOR || "").toLowerCase() === email ? 1 : 0;

  let row = await d.get("SELECT id FROM users WHERE email = ?", [email]);
  if (!row) {
    await d.run(
      "INSERT INTO users (id, email, evony_name, is_operator, created_at) VALUES (?, ?, ?, ?, ?)",
      [nid(), email, email, operator, nowIso()],
    );
    row = (await d.get("SELECT id FROM users WHERE email = ?", [email]))!;
  }

  const token = newToken();
  await d.run(
    "INSERT INTO sessions (id, token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
    [nid(), sha256(token), String(row.id), addDaysIso(days), nowIso()],
  );
  await d.close();

  console.log(token);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});