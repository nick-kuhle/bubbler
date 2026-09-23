# Bubbler — Evony-styled UI redesign (preview app)

A self-contained **Vite + React + Tailwind CSS 4** preview app implementing the proposed
restyle of the LOL bubble scheduler UI: the look and feel of *Evony: The King's Return*
(ornate gold-framed panels, Cinzel display type, wine-and-gold palette, grain overlay)
while keeping alliance **LOL**'s fun identity (hot-pink accents, cyan bubbles, floating
bubble animation, giggle-toned copy).

The existing Next.js app in `../webapp` is untouched — this folder is a design preview and
the intended source for porting the design system into the production webapp.

## Run it

```bash
cd redesign
npm install
npm run dev      # http://localhost:5173
npm run build    # single-file build in dist/
```

It is a **mock preview**: any email signs in (the part before `@` becomes your Evony name);
include `op` or `nick` in the email to unlock the operator **War Room** view. State persists
in `localStorage` (guarded, so it also works in private mode / sandboxed iframes). EN/ES
language toggle included.

## Views

| View       | Route state  | Highlights                                                        |
|------------|--------------|-------------------------------------------------------------------|
| Login      | `login`      | crest logo with shield-glow pulse, hero art, ornate login panel    |
| Your Keep  | `dashboard`  | shield ring countdown, slot editor, run-now, profile, evidence     |
| Link       | `wizard`     | 6-step linking flow incl. 6-digit code step (90s window design)    |
| War Room   | `master`     | operator-only member slots + run ledger                            |
| Intel      | `info`       | how-it-works cards with generated art                              |

## Design system (`src/index.css`)

- Tokens: `--color-ink/wine/gold/pink-lol/cyan-bubble/parchment…`, fonts Cinzel + Nunito
- Components: `.ornate` gold corner-flourish panels, `.btn-gold/.btn-pink/.btn-cyan`,
  `.title-gold` shimmer, `.field-input`, `.bubbles` float-up animation, `.grain`,
  `.shield-glow` pulse
- Mobile-first: sticky blurred header + hamburger, fixed bottom tab bar with
  `env(safe-area-inset-bottom)`, `dvh` layouts, responsive grids/type

## Generated art (`public/images/`)

| File                 | Use                                            |
|----------------------|------------------------------------------------|
| `logo.png` (512px)   | crest: bubble-in-shield, crown, LOL ribbon; favicon + avatars |
| `hero.jpg`           | login backdrop + ambient app background        |
| `keep.jpg`           | dashboard hero, wizard + intel cards           |
| `general.jpg`        | alliance general portrait (female, default)    |
| `general-alt-male.jpg` | alternate general portrait (male) — swap into `general.jpg` to change |
| `gem.png` (512px)    | gem currency icon                              |
| `truce.jpg`          | truce scroll under a shield dome               |
| `banner.jpg`         | alliance war banners (war room + intel header) |

PNGs are downscaled/optimized for mobile (logo 3.3 MB → 532 KB, gem 3 MB → 383 KB).

## Notes

- `vite.config.ts` binds the dev server to `0.0.0.0` with `allowedHosts: true` so the
  preview can be reached through sandbox/proxy hosts.
- `vite-plugin-singlefile` makes `npm run build` emit one portable HTML file (assets in
  `public/` stay external; inline them as data URIs if you need a truly single file).
