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
  loader: glob({ pattern: 'home.yml', base: './src/content/pages' }),
  schema: z
    .object({
      seo,
      hero: z.object({
        eyebrow: z.string(),
        sinceLabel: z.string(),
        intro: z.string(),
      }),
      sections: z.object({
        war: z.object({ num: z.string(), title: z.string() }),
        fundraiser: z.object({ num: z.string(), title: z.string() }),
        members: z.object({ num: z.string(), title: z.string() }),
        templates: z.object({ num: z.string(), title: z.string() }),
      }),
      war: z.object({
        lead: z.string(),
        body: z.string(),
        points: z.array(z.object({ title: z.string(), text: z.string() })),
        cta: z.object({ label: z.string(), href: z.string() }),
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

// ---------- TEMPLATES PAGE (templates singleton) ----------
const templatesPage = defineCollection({
  loader: glob({ pattern: 'templates.yml', base: './src/content/pages' }),
  schema: z
    .object({
      seo,
      studio: z
        .object({
          drawerToggle: z.string(),
          panelAriaLabel: z.string(),
          closePanelAriaLabel: z.string(),
          panelTitle: z.string(),
          panelIntro: z.string(),
          titleMainLabel: z.string(),
          titleAccentLabel: z.string(),
          descLabel: z.string(),
          goalLabel: z.string(),
          raisedLabel: z.string(),
          photoLabel: z.string(),
          dropzoneTitleEmpty: z.string(),
          dropzoneHintEmpty: z.string(),
          dropzoneTitleFilled: z.string(),
          dropzoneHintFilled: z.string(),
          clearPhotoLabel: z.string(),
          colorsTitle: z.string(),
          labelsTitle: z.string(),
          labelsIntro: z.string(),
          labelsResetLabel: z.string(),
          colorsResetLabel: z.string(),
          swatchInkLabel: z.string(),
          swatchChalkLabel: z.string(),
          swatchPinkLabel: z.string(),
          swatchAcidLabel: z.string(),
          swatchBubbleLabel: z.string(),
          alertLead: z.string(),
          alertBody: z.string(),
          actions: z.object({
            download: z.string(),
            copy: z.string(),
            edit: z.string(),
            done: z.string(),
            reset: z.string(),
            resetAll: z.string(),
            formatGroupAriaLabel: z.string(),
            formatPostLabel: z.string(),
            formatStoryLabel: z.string(),
            saved: z.string(),
            saveError: z.string(),
            copied: z.string(),
            copyError: z.string(),
            resizeElementAriaLabel: z.string(),
            removeElementAriaLabel: z.string(),
          }),
          labels: z.object({
            collect: z.string(),
            active: z.string(),
            urgent: z.string(),
            checks: z.string(),
            handover: z.string(),
            closedKicker: z.string(),
            closed: z.string(),
            collected: z.string(),
            thermo: z.string(),
            equator: z.string(),
            deadline: z.string(),
            lastDay: z.string(),
            checksWeekly: z.string(),
            giftKicker: z.string(),
            giftHeadline: z.string(),
            giftPreview: z.string(),
            giftList: z.string(),
            giftItem1: z.string(),
            giftItem2: z.string(),
            giftItem3: z.string(),
            giftItem4: z.string(),
            giftFor: z.string(),
            giftBrigade: z.string(),
          }),
        })
        .strict(),
    })
    .strict(),
});

// ---------- SHARED UI COPY ----------
const ui = defineCollection({
  loader: glob({ pattern: '**/*.yml', base: './src/content/ui' }),
  schema: z
    .object({
      templatesHeaderTag: z.string(),
      backHomeLabel: z.string(),
      templatesResetAllLabel: z.string(),
      templatesResetAllAriaLabel: z.string(),
      footerBrandBookLabel: z.string(),
      consent: z
        .object({
          kicker: z.string(),
          body: z.string(),
          acceptLabel: z.string(),
          declineLabel: z.string(),
        })
        .strict(),
    })
    .strict(),
});

export const collections = { site, fundraiser, pages, activeJar, templatesPage, ui };
