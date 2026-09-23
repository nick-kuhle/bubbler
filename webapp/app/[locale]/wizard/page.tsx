import { setRequestLocale } from "next-intl/server";

import WizardForm from "@/components/WizardForm";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Lang, Link, t } from "@/lib/i18n";

export default async function WizardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ again?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const dict = t(locale as Lang);
  const w = dict.wizard;

  const again = (await searchParams).again === "1";
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
          <p className="ok" style={{ fontSize: "1.6rem", margin: "0 0 0.4rem" }}>✓</p>
          <h2 style={{ margin: "0 0 0.3rem" }}>{w.alreadyTitle}</h2>
          <p className="muted">{w.alreadyBody}</p>
          <div className="row" style={{ justifyContent: "center", marginTop: "1rem" }}>
            <Link className="btn" href="/dashboard">{w.goDashboard}</Link>
            <Link className="btn" href="/wizard?again=1">{w.linkAgain}</Link>
          </div>
        </section>
      );
    }
  }

  return <WizardForm dict={dict} />;
}