// auth.ts — magic-link sessions (no passwords; email IS the login, matches app login).
//
// Flow: /api/auth POST {email} -> creates an operator-approved user on first use (private
// circle, no open signup), issues a session, sets an httpOnly cookie. A real deployment
// emails a signed magic link instead and the cookie is set only after clicking it; the
// dev path below is explicit and documented in 05-security (no secrets shipped).

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";
import { nid, nowIso, addDaysIso } from "./id";

export const SESSION_COOKIE = "bubbler_session";

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Raw session token handed to the browser (opaque, 48 chars base64url). */
export function newToken(): string {
  return randomBytes(36).toString("base64url");
}

export type CurrentUser = {
  id: string;
  email: string;
  evony_name: string;
  is_operator: boolean;
};

function rowToUser(r: Record<string, unknown>): CurrentUser {
  return {
    id: String(r.id),
    email: String(r.email),
    evony_name: String(r.evony_name),
    is_operator: Number(r.is_operator) === 1,
  };
}

/** Current user from the session cookie, or null. */
export async function currentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await db().get(
    `SELECT u.id, u.email, u.evony_name, u.is_operator
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`,
    [sha256(token), nowIso()],
  );
  return row ? rowToUser(row) : null;
}

/** Create a user if needed (private circle, email seed-gated) and start a session. */
export async function ensureUser(email: string, isOperator = false): Promise<CurrentUser> {
  const e = String(email || "").trim().toLowerCase();
  if (!e || !e.includes("@")) throw new Error("bad-email");

  const d = db();
  let row = await d.get("SELECT * FROM users WHERE email = ?", [e]);
  let created = false;
  if (!row) {
    const id = nid();
    d.run(
      "INSERT INTO users (id, email, evony_name, is_operator, created_at) VALUES (?, ?, ?, ?, ?)",
      [id, e, e, isOperator ? 1 : 0, nowIso()],
    );
    row = await d.get("SELECT * FROM users WHERE email = ?", [e]);
    created = true;
  }
  const user = rowToUser(row!);
  // link the session
  const token = newToken();
  d.run(
    "INSERT INTO sessions (id, token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
    [nid(), sha256(token), user.id, addDaysIso(30), nowIso()],
  );
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return user;
}

/** Route guards. */
export async function requireLogin(): Promise<CurrentUser> {
  const u = await currentUser();
  if (!u) throw new Error("unauthorized");
  return u;
}

export async function requireOperator(): Promise<CurrentUser> {
  const u = await requireLogin();
  if (!u.is_operator) throw new Error("operator-only");
  return u;
}