import { cookies } from "next/headers";
import { t, isLang, Lang, LANG_COOKIE } from "@/lib/i18n";

export default async function Info() {
  const rawLang = (await cookies()).get(LANG_COOKIE)?.value;
  const lang: Lang = isLang(rawLang) ? rawLang : "en";
  const dict = t(lang);

  return (
    <section className="card">
      <h2>{dict.info.title}</h2>
      <p className="muted">{dict.info.intro}</p>

      <h3 style={{ marginTop: "1.2rem" }}>{dict.info.bubbles}</h3>
      <p>{dict.info.bubblesBody}</p>

      <h3 style={{ marginTop: "1.2rem" }}>{dict.info.defaultTitle}</h3>
      <p>{dict.info.defaultBody}</p>

      <h3 style={{ marginTop: "1.2rem" }}>{dict.info.i18nTitle}</h3>
      <p>{dict.info.i18nBody}</p>

      <h3 style={{ marginTop: "1.2rem" }}>{dict.info.private}</h3>
      <p>{dict.info.privateBody}</p>
    </section>
  );
}
