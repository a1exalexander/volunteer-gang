import type { APIRoute } from 'astro';
import { getEntry } from 'astro:content';
import { renderOgPng, type OgInput } from '../../lib/og';

// First sentence of a paragraph, for OG subtitles (keeps the card short and
// tracks the YAML copy automatically).
const firstSentence = (s: string): string => {
  const m = s.match(/^[^.!?]*[.!?]/);
  return (m ? m[0] : s).trim();
};

// One OG image per page, populated from content (single source of truth) so the
// cards never drift from the live site. Add an entry here for a new page.
async function buildPages(): Promise<Record<string, OgInput>> {
  const [settingsEntry, homeEntry] = await Promise.all([
    getEntry('site', 'settings'),
    getEntry('pages', 'home'),
  ]);
  if (!settingsEntry || !homeEntry) {
    throw new Error('Missing content for OG images (site/settings, pages/home)');
  }
  const settings = settingsEntry.data;
  const home = homeEntry.data;
  const { word1, word2 } = settings.brand;

  return {
    home: {
      word1,
      word2,
      eyebrow: `${word1} ${word2} · ${settings.region}`,
      title: settings.tagline,
      subtitle: firstSentence(home.seo.description),
    },
    templates: {
      word1,
      word2,
      eyebrow: `${word1} ${word2} · ШАБЛОНИ`,
      title: home.sections.templates.title,
      subtitle: firstSentence(home.teaser.body),
    },
  };
}

export async function getStaticPaths() {
  const pages = await buildPages();
  return Object.entries(pages).map(([id, data]) => ({ params: { id }, props: { data } }));
}

export const GET: APIRoute = async ({ props }) => {
  const { data } = props as { data: OgInput };
  const png = await renderOgPng(data);
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
