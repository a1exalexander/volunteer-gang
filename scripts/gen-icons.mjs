// Rasterize the vector graffiti-G favicon into PNG app icons.
// Single source of truth: public/favicon.svg (pure vector, no font needed).
// Run: npm run gen:icons  (commit the generated PNGs).
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const svg = readFileSync(join(root, 'public', 'favicon.svg'), 'utf8');

// [output filename, pixel size]
const TARGETS = [
  ['favicon-16.png', 16],
  ['favicon-32.png', 32],
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
];

for (const [name, size] of TARGETS) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
  const png = resvg.render().asPng();
  writeFileSync(join(root, 'public', name), png);
  console.log(`  ${name.padEnd(22)} ${size}×${size}`);
}
console.log('icons generated');
