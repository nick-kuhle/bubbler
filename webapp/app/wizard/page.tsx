import { cookies } from "next/headers";
import { t, isLang, Lang, LANG_COOKIE } from "@/lib/i18n";
import WizardForm from "@/components/WizardForm";

export default async function Wizard() {
  const rawLang = (await cookies()).get(LANG_COOKIE)?.value;
  const lang: Lang = isLang(rawLang) ? rawLang : "en";
  const dict = t(lang);

  return (
    <WizardForm
      title={dict.wizard.title}
      intro={dict.wizard.intro}
      emailLabel={dict.wizard.emailLabel}
      send={dict.wizard.send}
      sent={dict.wizard.sent}
      error={dict.wizard.error}
    />
  );
}
