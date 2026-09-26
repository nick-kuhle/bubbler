// lib/publicError.ts — error strings that leave the server. Postgres URLs can appear
// inside driver messages (host/user/password), so scrub the credentials before an error
// reaches a response body, a Vercel log or the browser. Shared by the agent routes.
export function publicError(err: unknown): string {
  return String(err instanceof Error ? err.message : err)
    .replace(/postgres(?:ql)?:\/\/[^@\s]+@/g, "postgres://***@")
    .slice(0, 240);
}
