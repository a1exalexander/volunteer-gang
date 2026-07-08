import type { APIRoute } from 'astro';
import { renderOgPng, type OgInput } from '../../lib/og';

// One OG image per page. Add an entry here when a new page needs its own card.
const PAGES: Record<string, OgInput> = {
  home: {
    eyebrow: 'VOLUNTEER GANG · UA',
    title: 'Дівчата. Збори. Перемога.',
    subtitle: 'Адресні збори для бригад і батальйонів ЗСУ за прямими запитами.',
  },
  templates: {
    eyebrow: 'VOLUNTEER GANG · ШАБЛОНИ',
    title: 'Шаблони для Instagram',
    subtitle: 'Пости та сторіз у фірмовому стилі — заповни й забери одним кліком.',
  },
};

export function getStaticPaths() {
  return Object.keys(PAGES).map((id) => ({ params: { id } }));
}

export const GET: APIRoute = async ({ params }) => {
  const id = params.id ?? 'home';
  const data = PAGES[id] ?? PAGES.home;
  const png = await renderOgPng(data);
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
