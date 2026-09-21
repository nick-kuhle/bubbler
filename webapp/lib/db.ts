// db.ts — the whole portable layer, news one async interface.
// Dev/local out of the box: node:sqlite (zero deps, Node 22+, file:data/bubbler.db).
// Prod on Vercel: postgres via DATABASE_URL (postgres://). Both engines expose the same
// async DB shape, so routes never branch on the engine.
//
// One rule honoured above all: the interface is the contract, the engines are behind it.
// No `?`→`$1`, no dual dialects, no optional generic nonsense — this file is where any
// placeholders or dialect trickery WOULD live, and that is exactly why they are banned
// here: everything below is plain async run/get/all with `?` only.

import { mkdirSync } from "node:fs";
import path from "node:path";

export type Row = Record<string, unknown>;
type PgPool = {
  query(sql: string, params: unknown[]): Promise<{ rows: Row[] }>;
  end(): Promise<void>;
};


export interface DB {
  run(sql: string, params?: unknown[]): Promise<void>;
  get(sql: string, params?: unknown[]): Promise<Row | undefined>;
  all(sql: string, params?: unknown[]): Promise<Row[]>;
  close(): Promise<void>;
}

let impl: DB | null = null;
let engine: "sqlite" | "pg" | null = null;

const url = (): string =>
  process.env.DATABASE_URL ?? "file:" + path.join("data", "bubbler.db");

const isPg = (u: string): boolean =>
  u.startsWith("postgres://") || u.startsWith("postgresql://");

/** Postgres binds `$1..$n`; sqlite binds `?`. Rewrites only inside this adapter. */
function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export function db(): DB {
  if (impl) return impl;
  const u = url();
  if (isPg(u)) {
    const { Pool } = require("pg") as unknown as { Pool: new (o: object) => {
      query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
      end(): Promise<void>;
    } };
    const pool = new Pool({ connectionString: u });
    impl = {
      async run(sql, params = []) {
        await pool.query(toPg(sql), params);
      },
      async get(sql, params = []) {
        const r = await pool.query(toPg(sql), params);
        return r.rows[0] as Row | undefined;
      },
      async all(sql, params = []) {
        const r = await pool.query(toPg(sql), params);
        return r.rows as Row[];
      },
      async close() {
        await pool.end();
      },
    };
  } else {
    const { DatabaseSync } = require("node:sqlite") as {
      DatabaseSync: new (f: string) => {
        exec(s: string): void;
        prepare(s: string): {
          run(...p: unknown[]): void;
          get(...p: unknown[]): unknown;
          all(...p: unknown[]): unknown[];
        };
        close(): void;
      };
    };
    const f = u.replace(/^file:/, "").replace(/^file:\/\//, "");
    mkdirSync(path.dirname(f), { recursive: true });
    const s = new DatabaseSync(f);
    s.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    impl = {
      async run(sql, params = []) {
        s.prepare(sql).run(...params);
      },
      async get(sql, params = []) {
        return s.prepare(sql).get(...params) as Row | undefined;
      },
      async all(sql, params = []) {
        return s.prepare(sql).all(...params) as Row[];
      },
      async close() {
        s.close();
      },
    };
  }
  return impl;
}

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY,
     email TEXT NOT NULL UNIQUE,
     evony_name TEXT NOT NULL,
     is_operator INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS sessions (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id),
     token_hash TEXT NOT NULL,
     expires_at TEXT NOT NULL,
     created_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS schedules (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id),
     weekdays INTEGER NOT NULL,
     time TEXT NOT NULL,
     gem_ack INTEGER NOT NULL DEFAULT 0,
     active INTEGER NOT NULL DEFAULT 1,
     created_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_schedules_user ON schedules(user_id)`,
  `CREATE TABLE IF NOT EXISTS link_sessions (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id),
     state TEXT NOT NULL,
     created_at TEXT NOT NULL,
     expires_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS jobs (
     id TEXT PRIMARY KEY,
     kind TEXT NOT NULL REFERENCES jobs(id) COLLATE NOCASE,
     user_id TEXT NOT NULL REFERENCES users(id),
     payload TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'pending',
     uniq TEXT,
     created_at TEXT NOT NULL,
     expires_at TEXT,
     UNIQUE(uniq) WHERE uniq IS NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_pending ON jobs(status, created_at)`,
];

export async function migrate(): Promise<void> {
  const d = db();
  for (const m of MIGRATIONS) await d.run(m);
}