// Dynamic Open Graph image rendering (1200×630) with the Volunteer Gang brand.
// satori (HTML/CSS -> SVG) + resvg (SVG -> PNG). Fonts are bundled TTFs that
// cover Latin + Cyrillic so Ukrainian titles render correctly.
import satori from 'satori';
import { html } from 'satori-html';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Read from the project root rather than import.meta.url: this module is
// bundled at build time, so import.meta.url would point at the built chunk.
// OG images are prerendered during `astro build`, where cwd is the project root.
const fontDir = join(process.cwd(), 'src', 'assets', 'fonts');
const read = (f: string) => readFileSync(join(fontDir, f));

// Static single-file instances (pinned from the variable fonts with fonttools)
// with full Latin + Cyrillic coverage, so Ukrainian text renders in one file.
// satori's Font type is stricter than the plain shape we pass here.
const FONTS = [
  { name: 'Oswald', data: read('Oswald-700.ttf'), weight: 700, style: 'normal' },
  { name: 'Unbounded', data: read('Unbounded-800.ttf'), weight: 800, style: 'normal' },
  // Graffiti face for the "GANG" wordmark — matches the brand book (Latin only).
  { name: 'Sedgwick Ave Display', data: read('SedgwickAveDisplay.ttf'), weight: 400, style: 'normal' },
] as unknown as Parameters<typeof satori>[1]['fonts'];

// Brand tokens (mirrors vg.css :root — satori can't read CSS vars, so keep the
// hexes here and named in one place). Балаклава / Крейда / Пил / Фуксія / Бабл / Кислота.
const INK = '#0D0C0C';
const CHALK = '#F5F1EC';
const DUST = '#8A8580';
const PINK = '#FF2E88';
const BUBBLE = '#F4A6E3';
const ACID = '#C9E400';

export interface OgInput {
  word1: string;
  word2: string;
  eyebrow: string;
  title: string;
  subtitle: string;
}

export async function renderOgPng({ word1, word2, eyebrow, title, subtitle }: OgInput): Promise<Buffer> {
  // "GANG" as the brand graffiti wordmark: bubble fill, ink contour and a
  // stacked ink shadow + acid kant. satori supports text-shadow and
  // -webkit-text-stroke-* but not paint-order, so we approximate the layered
  // <GangWord> component with a single strokfilled node + two drop shadows.
  const gangStyle = [
    "display:flex",
    "font-family:'Sedgwick Ave Display'",
    'font-weight:400',
    'font-size:56px',
    `color:${BUBBLE}`,
    'margin-left:22px',
    '-webkit-text-stroke-width:2px',
    `-webkit-text-stroke-color:${INK}`,
    `text-shadow:4px 5px 0 ${INK}, 8px 9px 0 ${ACID}`,
  ].join(';');

  const markup = html`
    <div style="width:1200px;height:630px;background:${INK};display:flex;flex-direction:column;justify-content:space-between;padding:72px;box-sizing:border-box;">
      <div style="display:flex;color:${PINK};font-family:'Unbounded';font-weight:800;font-size:22px;letter-spacing:4px;">${eyebrow}</div>
      <div style="display:flex;flex-direction:column;max-width:1056px;">
        <div style="display:flex;flex-wrap:wrap;font-family:'Oswald';font-weight:700;font-size:76px;color:${CHALK};line-height:1.02;">${title}</div>
        <div style="display:flex;flex-wrap:wrap;font-family:'Oswald';font-weight:700;font-size:32px;color:${DUST};margin-top:26px;">${subtitle}</div>
      </div>
      <div style="display:flex;align-items:center;">
        <div style="display:flex;font-family:'Oswald';font-weight:700;font-size:40px;color:${CHALK};letter-spacing:1px;">${word1}</div>
        <div style="${gangStyle}">${word2}</div>
      </div>
    </div>
  `;

  const svg = await satori(markup, { width: 1200, height: 630, fonts: FONTS });
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } });
  return Buffer.from(resvg.render().asPng());
}
