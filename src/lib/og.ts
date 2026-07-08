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

export interface OgInput {
  eyebrow: string;
  title: string;
  subtitle: string;
}

export async function renderOgPng({ eyebrow, title, subtitle }: OgInput): Promise<Buffer> {
  const markup = html`
    <div style="width:1200px;height:630px;background:#0D0C0C;display:flex;flex-direction:column;justify-content:space-between;padding:72px;box-sizing:border-box;">
      <div style="display:flex;color:#FF2E88;font-family:'Unbounded';font-weight:800;font-size:22px;letter-spacing:4px;">${eyebrow}</div>
      <div style="display:flex;flex-direction:column;max-width:1056px;">
        <div style="display:flex;flex-wrap:wrap;font-family:'Oswald';font-weight:700;font-size:76px;color:#F5F1EC;line-height:1.02;">${title}</div>
        <div style="display:flex;flex-wrap:wrap;font-family:'Oswald';font-weight:700;font-size:32px;color:#8A8580;margin-top:26px;">${subtitle}</div>
      </div>
      <div style="display:flex;align-items:center;">
        <div style="display:flex;font-family:'Oswald';font-weight:700;font-size:40px;color:#F5F1EC;letter-spacing:1px;">VOLUNTEER</div>
        <div style="display:flex;font-family:'Sedgwick Ave Display';font-weight:400;font-size:52px;color:#FF2E88;margin-left:18px;">GANG</div>
      </div>
    </div>
  `;

  const svg = await satori(markup, { width: 1200, height: 630, fonts: FONTS });
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } });
  return Buffer.from(resvg.render().asPng());
}
