import { setRequestLocale } from "next-intl/server";

import UnlinkButton from "@/components/UnlinkButton";
import WizardForm from "@/components/WizardForm";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Lang, Link, t } from "@/lib/i18n";

export default async function WizardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ again?: string; welcome?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const dict = t(locale as Lang);
  const w = dict.wizard;

  const { again, welcome } = await searchParams;
  const user = await currentUser();

  if (!user) {
    return (
      <section className="card" style={{ maxWidth: 560, margin: "3rem auto", textAlign: "center" }}>
        <h2 style={{ marginBottom: "0.3rem" }}>{w.signedOutTitle}</h2>
        <p className="muted">{w.signedOutBody}</p>
        <Link className="btn" href="/" style={{ display: "inline-block", marginTop: "0.6rem" }}>
          {w.signIn}
        </Link>
      </section>
    );
  }

  if (!again) {
    const scheduled = await db().get(
      `SELECT id FROM slots WHERE user_id = ? AND active = 1 LIMIT 1`,
      [user.id],
    );
    if (scheduled) {
      return (
        <section className="card" style={{ maxWidth: 560, margin: "3rem auto", textAlign: "center" }}>
          <span className="check" aria-hidden>✓</span>
          <h2 style={{ margin: "0.6rem 0 0.3rem" }}>{w.alreadyTitle}</h2>
          <p className="muted">{w.alreadyBody}</p>
          <div className="row" style={{ justifyContent: "center", marginTop: "1rem" }}>
            <Link className="btn" href="/dashboard">{w.goDashboard}</Link>
            <UnlinkButton dict={dict} />
          </div>
        </section>
      );
    }
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
        <span className="tile" aria-hidden>🛡️</span>
        <div>
          <p className="kicker">{welcome === "1" ? "Welcome aboard" : "Truce Agreement"}</p>
          <h2 className="title-pop font-display" style={{ margin: "0.15rem 0 0" }}>{w.title}</h2>
        </div>
      </div>
      {welcome === "1" && (
        <p className="muted" style={{ maxWidth: 560, margin: "0 0 1.2rem" }}>
          You&apos;re in! Link your Evony account below so the shield lands on the right city. Takes about a minute.
        </p>
      )}
      <WizardForm dict={dict} />
    </>
  );
}