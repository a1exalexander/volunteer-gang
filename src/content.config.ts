import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Shared building blocks
const seo = z.object({ title: z.string(), description: z.string() });
// Brand accent used for members' top border and stat numbers.
const accent = z.enum(['pink', 'acid', 'bubble', 'chalk']);

// ---------- SITE (settings singleton) ----------
const site = defineCollection({
  loader: glob({ pattern: '**/*.yml', base: './src/content/site' }),
  schema: z
    .object({
      brand: z.object({ word1: z.string(), word2: z.string() }),
      tagline: z.string(),
      since: z.string(),
      region: z.string(),
      footerTagline: z.string(),
      cta: z.object({ label: z.string(), href: z.string() }),
      nav: z.array(z.object({ label: z.string(), href: z.string() })),
      seo,
    })
    .strict(),
});

// ---------- FUNDRAISER (active збір singleton) ----------
// Single source of truth: feeds both the home fundraiser card and the
// Instagram templates generator's initial state.
const fundraiser = defineCollection({
  loader: glob({ pattern: '**/*.yml', base: './src/content/fundraiser' }),
  schema: z
    .object({
      no: z.string(),
      statusLabel: z.string(),
      cardTitle: z.string(),
      cardBody: z.string(),
      overview: z.string(),
      titleMain: z.string(), // multiline; newline = line break
      titleAccent: z.string(),
      desc: z.string(),
      goal: z.number().int().positive(),
      raised: z.number().int().nonnegative(),
      jar: z.string(),
    })
    .strict(),
});

// ---------- ACTIVE JAR (home «Активний збір» section singleton) ----------
// Drives the home fundraiser section only: a toggle, the target amount, and
// the Monobank donate button. Kept separate from `fundraiser` (templates data)
// so the current amount / progress bar no longer needs manual upkeep.
const activeJar = defineCollection({
  loader: glob({ pattern: '**/*.yml', base: './src/content/active-jar' }),
  schema: z
    .object({
      isActive: z.boolean(),
      no: z.string(),
      statusLabel: z.string(),
      cardTitle: z.string(),
      cardBody: z.string(),
      overview: z.string(),
      goal: z.number().int().positive(),
      jar: z.string(),
      jarLabel: z.string(),
      // Mini alert shown in place of the jar card while isActive is off
      // (e.g. a nudge to donate to UAnimals between our own fundraisers).
      noActiveAlert: z.object({
        lead: z.string(), // bold opener
        body: z.string(),
        linkLabel: z.string(),
        linkHref: z.string().url(),
      }),
    })
    .strict(),
});

// ---------- PAGES (home singleton) ----------
const pages = defineCollection({
  loader: glob({ pattern: '**/*.yml', base: './src/content/pages' }),
  schema: z
    .object({
      seo,
      hero: z.object({
        eyebrow: z.string(),
        sinceLabel: z.string(),
        intro: z.string(),
      }),
      sections: z.object({
        fundraiser: z.object({ num: z.string(), title: z.string() }),
        members: z.object({ num: z.string(), title: z.string() }),
        templates: z.object({ num: z.string(), title: z.string() }),
      }),
      stats: z.array(z.object({ k: z.string(), v: z.string(), color: accent })),
      proofLine: z.string(),
      members: z.array(
        z.object({
          idx: z.string(),
          name: z.string(),
          role: z.string(),
          photo: z.string().optional(),
          instagram: z.string().optional(), // handle without the @
          accent,
        })
      ),
      teaser: z.object({ body: z.string(), cta: z.string() }),
    })
    .strict(),
});

export const collections = { site, fundraiser, pages, activeJar };
