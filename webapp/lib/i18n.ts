// lib/i18n.ts — tiny, dependency-free i18n for the "Sister's Automatic Bubble App".
// No framework package: a dictionary + a cookie. Server side sets the cookie on switch;
// client reads it from a <html data-lang> attribute set in the root layout.
//
// Locales: 'en' (default) and one starter 'es' so friends abroad can switch. Adding a
// language is one dictionary below + one entry in SUPPORTED — nothing else to wire.

export type Lang = "en" | "es";

export const SUPPORTED: Lang[] = ["en", "es"];

// iScout-style: each language shown by its OWN native name + script line,
// so French friends see "Français", your sister circle in Latin America sees
// "Español". Adding one language = 1 line here + 1 dict block below.
export const NATIVE: Record<Lang, string> = { en: "English", es: "Español" };

export const LANG_COOKIE = "bubbler_lang";

export const DEFAULT_LANG: Lang = "en";

export function isLang(v: string | undefined | null): v is Lang {
  return v === "en" || v === "es";
}

type DeepStringify<T> = T extends string ? string : { [K in keyof T]: DeepStringify<T[K]> };

export type Dict = DeepStringify<typeof en>;

// ---------------------------------------------------------------------------
// en — English (default)
// ---------------------------------------------------------------------------
export const en = {
  brand: "Sister's Automatic Bubble App",
  brandShort: "Sister's Bubble",
  tagline: "Hands-off peace-shield keeper for our Evony circle — bubbles open on schedule, so nobody's city burns while we're asleep.",
  nav: {
    home: "home",
    dashboard: "dashboard",
    info: "info",
    master: "master",
    wizard: "link a phone",
  },
  dashboard: {
    title: "Your bubble schedule",
    intro: "These are the days and times your Evony bubble opens, automatically — no need to remember anything. If a time falls while you're away, the app shifts it to the nearest friendly window.",
    none: "No bubbles scheduled yet.",
    noneHint: "Ask the operator to add you — then your 3-day bubbles appear here automatically.",
    today: "Today",
    next: "Next bubbles",
    columnDay: "day",
    columnMorning: "morning",
    columnEvening: "evening",
    mon: "Monday",
    tue: "Tuesday",
    wed: "Wednesday",
    thu: "Thursday",
    fri: "Friday",
    sat: "Saturday",
    sun: "Sunday",
    morning: "morning",
    evening: "evening",
    threeDayBubble: "starts a 3-day bubble",
  },
  master: {
    title: "Operator — master run list",
    intro: "Everything the scheduler has queued or claimed, newest first. Read-only surface for you, the operator.",
    empty: "No runs recorded yet. Jobs appear here as the scheduler fills due slots.",
    opBadge: "operator",
  },
  wizard: {
    title: "Link a phone",
    intro: "Send a magic link to your phone. Tap it once and this app stays signed in on that device — so the bubbles keep coming even when your computer is off.",
    emailLabel: "phone / email",
    send: "send magic link",
    sent: "Magic link sent — check your phone and tap it.",
    error: "Couldn't send that one — try again with the email you use in the game.",
  },
  info: {
    title: "How it works",
    intro: "The Sister's Automatic Bubble App schedules peace bubbles for our Evony circle so nobody has to babysit a shield.",
    bubbles: "What's a bubble?",
    bubblesBody: "A three-day automatic bubble on Evony: the app opens a shield on the right Evony server for you, three days at a time, so a city can't be attacked during that window.",
    defaultTitle: "The default schedule",
    defaultBody: "New members get bubbles on Monday and Wednesday morning, plus Friday evening — three-day windows by default. The operator can change any of this to suit your real game time.",
    i18nTitle: "Languages",
    i18nBody: "We're a far-flung circle, so the whole app switches language. Pick yours in the menu — your schedule is the same everywhere, just in your words.",
    private: "Private circle",
    privateBody: "No open signup, no passwords. Your email is your login — if you're not on the invite list, the app won't let you in.",
  },
  common: {
    back: "back",
    save: "save",
    language: "language",
  },
} as const;

// ---------------------------------------------------------------------------
// es — Spanish (starter locale for friends abroad)
// ---------------------------------------------------------------------------
export const es: Dict = {
  brand: "Aplicación automática de burbujas de la hermana",
  brandShort: "Burbuja de la hermana",
  tagline: "Guardián de escudo de paz para nuestro círculo de Evony, sin esfuerzo — las burbujas se abren según horario, para que ninguna ciudad arda mientras dormimos.",
  nav: {
    home: "inicio",
    dashboard: "panel",
    info: "información",
    master: "operador",
    wizard: "vincular un móvil",
  },
  dashboard: {
    title: "Tu horario de burbujas",
    intro: "Estos son los días y horas en que se abre tu burbuja de Evony automáticamente — no hace falta recordar nada. Si una hora cae mientras estás fuera, la aplicación la mueve a la ventana más cercana.",
    none: "Aún no hay burbujas programadas.",
    noneHint: "Pide al operador que te añada — tus burbujas de 3 días aparecerán aquí automáticamente.",
    today: "Hoy",
    next: "Próximas burbujas",
    columnDay: "día",
    columnMorning: "mañana",
    columnEvening: "tarde",
    mon: "lunes",
    tue: "martes",
    wed: "miércoles",
    thu: "jueves",
    fri: "viernes",
    sat: "sábado",
    sun: "domingo",
    morning: "mañana",
    evening: "tarde",
    threeDayBubble: "inicia una burbuja de 3 días",
  },
  master: {
    title: "Operador — lista de ejecuciones",
    intro: "Todo lo que el programador ha encolado o reclamado, primero lo más reciente. Superficie de solo lectura para ti, el operador.",
    empty: "Aún no hay ejecuciones. Los trabajos aparecen aquí cuando el programador llena los turnos.",
    opBadge: "operador",
  },
  wizard: {
    title: "Vincular un móvil",
    intro: "Envía un enlace mágico a tu móvil. Tócalo una vez y esta aplicación quedará iniciada en ese dispositivo — así las burbujas seguirán llegando aunque tu ordenador esté apagado.",
    emailLabel: "móvil / correo",
    send: "enviar enlace mágico",
    sent: "Enlace mágico enviado — revisa tu móvil y tócalo.",
    error: "No se pudo enviar — inténtalo de nuevo con el correo que usas en el juego.",
  },
  info: {
    title: "Cómo funciona",
    intro: "La aplicación automática de burbujas de la hermana programa escudos de paz para nuestro círculo de Evony, para que nadie tenga que vigilar un escudo.",
    bubbles: "¿Qué es una burbuja?",
    bubblesBody: "Una burbuja automática de tres días en Evony: la aplicación abre un escudo en el servidor correcto para ti, tres días a la vez, para que la ciudad no pueda ser atacada durante esa ventana.",
    defaultTitle: "El horario por defecto",
    defaultBody: "Los miembros nuevos reciben burbujas el lunes y miércoles por la mañana, además del viernes por la tarde — ventanas de tres días por defecto. El operador puede cambiar todo para ajustarse a tu tiempo real.",
    i18nTitle: "Idiomas",
    i18nBody: "Somos un círculo repartido por el mundo, así que toda la aplicación cambia de idioma. Elige el tuyo en el menú — tu horario es el mismo en todas partes, solo en tus palabras.",
    private: "Círculo privado",
    privateBody: "Sin registro abierto, sin contraseñas. Tu correo es tu acceso — si no estás en la lista de invitados, la aplicación no te dejará entrar.",
  },
  common: {
    back: "volver",
    save: "guardar",
    language: "idioma",
  },
} as const;

export function t(lang: Lang): Dict {
  return lang === "es" ? es : en;
}
