# Volunteer Gang

Astro static site for the **Volunteer Gang** volunteer team, with a Decap CMS
back office. Two pages:

- **`/`** — landing page: hero, active fundraiser, the team, templates teaser.
- **`/templates`** — an interactive Instagram image generator (7 branded
  post/story templates, live preview, PNG download + clipboard copy).

## Stack

- **Astro 6** (static output, no adapter)
- **Decap CMS 3** (loaded from CDN) with **Netlify Identity + git-gateway** in
  production and a **local backend** for dev
- Content = YAML in `src/content/**`, validated by Zod in `src/content.config.ts`
- `@astrojs/sitemap`, dynamic OG images (satori + resvg), GA4
- Hand-authored CSS with brand tokens in `src/styles/vg.css` (no framework)

## Develop

```bash
npm install
npm run dev          # site at http://localhost:4321  (admin at /admin)
npm run dev:cms      # site + Decap local backend (edits write to src/content/**)
```

With `npm run dev:cms` open <http://localhost:4321/admin/> — the local backend
needs no auth and writes directly to the YAML files.

```bash
npm run check        # astro check (types + content schema)
npm run build        # static build -> dist/
npm run preview      # serve dist/
```

## Content

> 📝 Редагуєте контент через `/admin`? Дивіться **[ADMIN-UA.md](./ADMIN-UA.md)** —
> покрокова інструкція українською для власників сайту.

| File | Edited in CMS as | Drives |
|---|---|---|
| `src/content/site/settings.yml` | Налаштування сайту | brand, nav, header CTA, footer, SEO |
| `src/content/active-jar/active.yml` | Активний збір | home fundraiser block + `isActive` toggle (also shows/hides the header CTA) |
| `src/content/fundraiser/active.yml` | Дані для шаблонів | defaults for the `/templates` generator |
| `src/content/pages/home.yml` | Сторінки → Головна | hero, section headings, stats, team members, teaser |

The `/templates` generator prefills from `fundraiser/active.yml`, while the home
"Активний збір" block and the header donate button are driven by
`active-jar/active.yml` (hidden entirely when `isActive: false`).

## Deploy (Netlify)

`netlify.toml` builds `npm run build` → `dist/` and rewrites `/admin/*` to the
Decap SPA. In the Netlify dashboard enable **Identity** and **Git Gateway** so
editors can log in at `/admin`. Optional env vars:

- `PUBLIC_GA_ID` — GA4 measurement id (analytics disabled when unset)
- `SITE` — canonical origin for absolute URLs (defaults to the Netlify subdomain)

## Notes

- The design is desktop-first (from the Claude Design handoff); the page chrome
  is responsive, while the 1080px Instagram export canvases stay fixed.
- `html-to-image` (CDN) powers the PNG export on `/templates`; state persists in
  `localStorage` under `vg-tpl-state-v1`.
