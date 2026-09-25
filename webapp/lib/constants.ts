// lib/constants.ts — app-wide constants that are NOT translations.
// (These used to live in lib/i18n.ts, which conflated game rules with i18n; the
// i18n layer now owns nothing but locale routing + message catalogs.)

/** A fresh 3-day Truce Agreement costs this many gems (matches Evony's store). */
export const GEMS_72H = 2500;

/** Every time/delay shown anywhere in the app is Evony server time = UTC. */
export const UTC_NOTE = "All times are shown in Evony server time (UTC).";
