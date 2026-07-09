# Volunteer Gang

Astro static site for the **Volunteer Gang** volunteer team, with a Decap CMS
back office. Two pages:

- **`/`** — landing page: hero, active fundraiser, the team, templates teaser.
- **`/templates`** — an interactive Instagram image generator (25 branded
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

## Templates analytics flow

`/templates` now emits a unified GA4 event `template_interaction` with
`section: "templates"` and an `action` parameter for key user steps:

- `studio_loaded`
- `field_updated` (title/description/goal/raised changes)
- `color_updated`, `colors_reset`
- `label_updated`, `labels_reset`
- `photo_uploaded`, `photo_cleared`
- `card_format_changed` (post/story)
- `card_edit_mode_changed`, `card_element_transformed`,
  `card_element_removed`, `card_removed_elements_reset`, `card_edits_reset`
- `drawer_toggled` (mobile panel open/close)
- `template_export` with `method` (`download`/`copy`) and `status`
  (`success`/`error`)

### GA4 setup (events, conversions, explorations)

In GA4 Admin:

1. Open **Admin → Events** and verify incoming `template_interaction`.
2. Open **Admin → Key events** (Conversions) and mark these as key:
   - `template_export` where `status = success` (primary success metric)
   - `photo_uploaded` (content-enriched session)
   - `card_format_changed` (format customization intent)

#### Recommended funnel (Explore → Funnel exploration)

Create a funnel scoped to `section = templates`:

1. `studio_loaded`
2. `field_updated` OR `photo_uploaded`
3. `template_export` with `status = success`

Use breakdowns by:

- `method` (`download` vs `copy`)
- `card_id`
- device category (mobile/desktop)

#### Recommended free-form reports

- **Top templates exported**  
  Filter: `action = template_export` and `status = success`  
  Rows: `card_id`  
  Values: Event count

- **Export error rate**  
  Filter: `action = template_export`  
  Rows: `status`, `method`  
  Values: Event count

- **Editing depth before export**  
  Build segment: users with `card_edit_mode_changed` or `card_element_transformed`  
  Compare export success (`template_export` + `status=success`) vs users without edits.

## Notes

- The design is desktop-first (from the Claude Design handoff); the page chrome
  is responsive, while the 1080px Instagram export canvases stay fixed.
- `html-to-image` (CDN) powers the PNG export on `/templates`; state persists in
  `localStorage` under `vg-tpl-state-v1`.
