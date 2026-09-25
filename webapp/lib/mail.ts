// lib/mail.ts — transactional email for the login code. Zero magic: send the OTP from
// a provider or an SMTP relay; both are "custom email" (our own from-address + HTML),
// only the delivery route differs. Neither is in use in production until you configure
// one, and the requester route fails closed rather than silently leaking the code.
//
// Providers (all have 100%-free starter tiers, plenty for a handful of members):
//   - Resend  (RESEND_API_KEY + MAIL_FROM)  — 100 emails/day free, one API key, no SMTP.
//   - Any SMTP host (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS + MAIL_FROM) — Gmail
//     app passwords, Brevo, MailerSend, your own relay, …
//
// With neither configured the sender reports `provider: "none"`; local dev still works
// because /api/auth/code exposes `dev_code` when NODE_ENV is not production.

type SendResult =
  | { ok: true; provider: "resend" | "smtp" }
  | { ok: false; provider: "none" };

function env(name: string): string | undefined {
  const p = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return p?.env?.[name];
}

function mailFrom(): string {
  // MAIL_FROM like "Bubbler <bubbler@yourdomain.com>"; bare addresses are fine too.
  return env("MAIL_FROM") || "LOL Bubbler <onboarding@resend.dev>";
}

function subject(): string {
  return "Your LOL Bubbler login code";
}

function htmlBody(code: string): string {
  const c = code.split("").join(" ");
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;font-family:ui-sans-serif,system-ui,sans-serif;background:#eef4ff;color:#111827;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr><td align="center">
        <div style="max-width:420px;background:#ffffff;border-radius:16px;padding:32px;box-shadow:0 8px 30px rgba(29,78,216,.12);">
          <div style="font-family:'Baloo 2',sans-serif;font-weight:800;font-size:20px;color:#1d4ed8;margin-bottom:12px;">🛡️ LOL Bubbler</div>
          <p style="margin:0 0 8px;font-size:15px;line-height:1.5;">Your one-time login code is:</p>
          <div style="font-family:monospace;font-weight:700;font-size:32px;letter-spacing:10px;text-align:center;color:#1e3a8a;background:#eff6ff;border:1px dashed #93c5fd;border-radius:12px;padding:16px 8px;margin:16px 0;">${c}</div>
          <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280;">It expires in 10 minutes and works once. If you didn't ask for this code, you can safely ignore this email.</p>
        </div>
      </td></tr>
    </table>
  </body>
</html>`;
}

async function sendResend(to: string, code: string): Promise<SendResult> {
  const key = env("RESEND_API_KEY");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: mailFrom(),
      to: [to],
      subject: subject(),
      html: htmlBody(code),
    }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`resend ${r.status}: ${text.slice(0, 200)}`);
  }
  return { ok: true, provider: "resend" };
}

async function sendSmtp(to: string, code: string): Promise<SendResult> {
  const { createTransport } = await import("nodemailer");
  const host = env("SMTP_HOST");
  if (!host) return { ok: false, provider: "none" };
  const port = Number(env("SMTP_PORT") || 587);
  const user = env("SMTP_USER") || "";
  const pass = env("SMTP_PASS") || "";
  const transporter = createTransport({
    host,
    port,
    secure: port === 465,
    auth: user ? { user, pass } : undefined,
  });
  await transporter.sendMail({
    from: mailFrom(),
    to,
    subject: subject(),
    html: htmlBody(code),
  });
  return { ok: true, provider: "smtp" };
}

/** Deliver an OTP. Throws on provider errors (route turns them into a 502). */
export async function sendCodeEmail(to: string, code: string): Promise<SendResult> {
  const key = env("RESEND_API_KEY");
  if (key) return sendResend(to, code);
  return sendSmtp(to, code);
}

export type { SendResult };