// WYSIWYG rasteriser for the /templates canvases and the /brand asset kit.
//
// Replaces html-to-image (loaded from a CDN until now). Same underlying browser
// primitive — the node is drawn inside an SVG <foreignObject>, which is then
// decoded as an image and painted to a <canvas> — but the clone is built very
// differently, and that difference is the whole point:
//
//   html-to-image walks the tree and copies *computed* styles onto every cloned
//   element. That transfer is lossy. On engines where getComputedStyle().cssText
//   comes back empty (Firefox, some Safari builds) it falls back to a
//   per-property copy that rewrites every font-size to `floor(px) - 0.1px`, so
//   text reflows and elements land a few pixels off where the editor put them.
//   That same path flattens computed paint and geometry properties onto SVG
//   children as inline styles, which is a standing hazard for the brand marks.
//
//   Here nothing is copied. The clone keeps its original markup and inline
//   styles, the page's own stylesheets are inlined next to it, and the element's
//   ancestor chain is rebuilt so every selector (`.gallery .canvas`, scoped
//   `data-astro-cid-*`, pseudo-elements, custom properties) resolves exactly as
//   it does on screen. The export is then the same cascade the preview uses.
//
// An SVG loaded as an image cannot fetch anything, so fonts and images must be
// inlined as data URIs first — hence the self-hosted fonts (scripts/gen-fonts.mjs).

export interface RenderOptions {
  /** Output scale: 1 = CSS pixels. */
  pixelRatio?: number;
  /** Return false to drop a node (and its subtree) from the export. */
  filter?: (node: Element) => boolean;
}

/** Marks the rebuilt ancestor chain so it contributes cascade, never layout. */
const ANCESTOR_ATTR = 'data-vg-export-ancestor';
const ANCESTOR_RESET = `[${ANCESTOR_ATTR}]{display:block!important;position:static!important;margin:0!important;padding:0!important;border:0!important;width:auto!important;height:auto!important;min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important;inset:auto!important;overflow:visible!important;transform:none!important;filter:none!important;opacity:1!important;background:none!important;box-shadow:none!important;animation:none!important;transition:none!important;}`;

/** url(...) -> data URI, resolved once per document lifetime. */
const assetCache = new Map<string, Promise<string>>();
/** The page's flattened stylesheets, collected once per document lifetime. */
let styleCache: Promise<string> | null = null;

async function toDataUri(url: string): Promise<string> {
  let pending = assetCache.get(url);
  if (!pending) {
    pending = (async () => {
      const res = await fetch(url, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`${url} -> ${res.status}`);
      const blob = await res.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    })();
    assetCache.set(url, pending);
  }
  return pending;
}

/**
 * Rewrites every url() in a CSS chunk to a data URI. Anything that can't be
 * fetched (a cross-origin asset without CORS) is left as-is: it simply won't
 * render inside the SVG, which is still better than failing the whole export.
 */
async function inlineCssUrls(css: string, base: string): Promise<string> {
  const urls = new Set<string>();
  for (const [, raw] of css.matchAll(/url\(\s*(?:"([^"]+)"|'([^']+)'|([^)'"]+))\s*\)/g)) {
    const value = (raw ?? '').trim();
    if (value && !value.startsWith('data:')) urls.add(value);
  }
  if (!urls.size) return css;

  const resolved = new Map<string, string>();
  await Promise.all(
    [...urls].map(async (value) => {
      try {
        resolved.set(value, await toDataUri(new URL(value, base).href));
      } catch {
        /* leave the original url() in place */
      }
    })
  );

  return css.replace(/url\(\s*(?:"([^"]+)"|'([^']+)'|([^)'"]+))\s*\)/g, (whole, a, b, c) => {
    const value = (a ?? b ?? c ?? '').trim();
    const data = resolved.get(value);
    return data ? `url("${data}")` : whole;
  });
}

/**
 * Serialises a stylesheet, resolving @media / @supports against the *live*
 * page instead of copying them through. Inside the exported SVG the viewport is
 * the card itself (1080px wide), so a media query carried over verbatim could
 * flip to a breakpoint the user never sees. Evaluating it here freezes the
 * cascade that is actually on screen.
 */
function serializeRules(rules: CSSRuleList): string {
  let out = '';
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSMediaRule) {
      if (window.matchMedia(rule.conditionText).matches) out += serializeRules(rule.cssRules);
    } else if (typeof CSSSupportsRule !== 'undefined' && rule instanceof CSSSupportsRule) {
      if (CSS.supports(rule.conditionText)) out += serializeRules(rule.cssRules);
    } else if (rule instanceof CSSImportRule) {
      if (rule.styleSheet) out += serializeRules(rule.styleSheet.cssRules);
    } else {
      out += rule.cssText + '\n';
    }
  }
  return out;
}

async function collectStyles(): Promise<string> {
  if (styleCache) return styleCache;
  styleCache = (async () => {
    const chunks: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      if (sheet.disabled) continue;
      const media = sheet.media?.mediaText;
      if (media && !window.matchMedia(media).matches) continue;
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        // Cross-origin stylesheet: unreadable by design. Everything the brand
        // needs is same-origin (see scripts/gen-fonts.mjs), so this is only a
        // heads-up for a stylesheet someone added later.
        console.warn('[export] skipping cross-origin stylesheet', sheet.href);
        continue;
      }
      chunks.push(await inlineCssUrls(serializeRules(rules), sheet.href ?? document.baseURI));
    }
    return chunks.join('\n');
  })();
  return styleCache;
}

/** Every family named in the subtree's computed styles, lowercased, unquoted. */
function usedFontFamilies(node: Element): Set<string> {
  const families = new Set<string>();
  const add = (list: string): void => {
    for (const name of list.split(',')) families.add(name.trim().replace(/^["']|["']$/g, '').toLowerCase());
  };
  for (const el of [node, ...Array.from(node.querySelectorAll('*'))]) {
    add(getComputedStyle(el).fontFamily);
    for (const pseudo of ['::before', '::after']) add(getComputedStyle(el, pseudo).fontFamily);
  }
  return families;
}

/**
 * Drops the @font-face blocks the card can't use — a family it never names, or
 * a subset whose unicode-range covers none of its characters. Inlining all 35
 * subsets would put ~1.3 MB of base64 in the SVG, and the whole document has to
 * fit in a data URI (see nodeToBlob), so this is not just an optimisation.
 * Weights are deliberately left alone: dropping a weight changes which face the
 * browser synthesises from, and that would move text.
 */
function pruneFontFaces(css: string, text: string, families: Set<string>): string {
  const codePoints = new Set<number>();
  for (const char of text) codePoints.add(char.codePointAt(0) ?? 0);

  return css.replace(/@font-face\s*\{[^}]*\}/g, (block) => {
    const family = /font-family:\s*([^;}]+)/i.exec(block)?.[1];
    if (family && !families.has(family.trim().replace(/^["']|["']$/g, '').toLowerCase())) return '';

    const range = /unicode-range:\s*([^;}]+)/i.exec(block)?.[1];
    if (!range) return block;
    for (const part of range.split(',')) {
      const token = part.trim();
      const span = /^U\+([0-9a-f]+)-([0-9a-f]+)$/i.exec(token);
      const single = /^U\+([0-9a-f]+)$/i.exec(token);
      const wildcard = /^U\+([0-9a-f]*)\?+$/i.exec(token);
      let from: number, to: number;
      if (span) {
        from = parseInt(span[1], 16);
        to = parseInt(span[2], 16);
      } else if (single) {
        from = to = parseInt(single[1], 16);
      } else if (wildcard) {
        const digits = wildcard[0].slice(2);
        from = parseInt(digits.replace(/\?/g, '0'), 16);
        to = parseInt(digits.replace(/\?/g, 'F'), 16);
      } else {
        return block; // unparsable — keep it rather than lose a glyph
      }
      for (const cp of codePoints) if (cp >= from && cp <= to) return block;
    }
    return '';
  });
}

/**
 * Every character the capture can paint: the node's text plus whatever CSS
 * injects through ::before / ::after, which never shows up in textContent and
 * would otherwise lose its subset to pruneFontFaces().
 */
function exportedText(node: Element): string {
  let text = node.textContent ?? '';
  for (const el of [node, ...Array.from(node.querySelectorAll('*'))]) {
    for (const pseudo of ['::before', '::after']) {
      const content = getComputedStyle(el, pseudo).content;
      if (content && content !== 'none' && content !== 'normal') text += content;
    }
  }
  return text;
}

/** Deep clone that honours the export filter and inlines <img> sources. */
async function cloneForExport(node: Element, filter?: (n: Element) => boolean): Promise<Element> {
  const clone = node.cloneNode(true) as Element;

  // Walk both trees in lockstep: the filter is asked about the *live* node
  // (so callers can look at computed styles), the clone is what gets pruned.
  const prune = (live: Element, copy: Element): void => {
    const liveKids = Array.from(live.children);
    const copyKids = Array.from(copy.children);
    for (let i = 0; i < liveKids.length; i++) {
      if (filter && !filter(liveKids[i])) copyKids[i].remove();
      else prune(liveKids[i], copyKids[i]);
    }
  };
  prune(node, clone);

  await Promise.all(
    Array.from(clone.querySelectorAll('img')).map(async (img) => {
      const src = img.getAttribute('src');
      if (!src || src.startsWith('data:')) return;
      try {
        img.setAttribute('src', await toDataUri(new URL(src, document.baseURI).href));
      } catch {
        /* keep the original src — it just won't paint */
      }
    })
  );

  return clone;
}

/**
 * Rebuilds <html> → … → parent as empty shells around the clone, so selectors
 * that depend on ancestors (`.gallery .canvas`), inherited properties and the
 * runtime `--c-*` custom properties all resolve the way they do on the page.
 * ANCESTOR_RESET strips their own box so they can't shift the card.
 */
function wrapInAncestors(node: Element, clone: Element): Element {
  let current: Element = clone;
  let parent = node.parentElement;
  while (parent) {
    const shell = parent.cloneNode(false) as Element;
    shell.setAttribute(ANCESTOR_ATTR, '');
    // Drop ids so a rule like #studio-panel can't match twice.
    shell.removeAttribute('id');
    shell.append(current);
    current = shell;
    parent = parent.parentElement;
  }
  return current;
}

function svgDocument(content: Element, width: number, height: number, scale: number, css: string): string {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('width', String(width * scale));
  svg.setAttribute('height', String(height * scale));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
  fo.setAttribute('x', '0');
  fo.setAttribute('y', '0');
  fo.setAttribute('width', '100%');
  fo.setAttribute('height', '100%');

  const host = document.createElement('div');
  host.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  const style = document.createElement('style');
  style.textContent = css;
  host.append(style, content);

  fo.append(host);
  svg.append(fo);
  return new XMLSerializer().serializeToString(svg);
}

/** Renders `node` exactly as the browser paints it, at `pixelRatio` scale. */
export async function nodeToBlob(node: HTMLElement, options: RenderOptions = {}): Promise<Blob> {
  const { pixelRatio = 1, filter } = options;

  // Metrics come from the layout box, not getBoundingClientRect(), so a card
  // sitting inside the scaled-down preview still exports at its true size.
  const width = node.offsetWidth || Math.ceil(node.getBoundingClientRect().width);
  const height = node.offsetHeight || Math.ceil(node.getBoundingClientRect().height);
  if (!width || !height) throw new Error('node has no size');

  try {
    await document.fonts.ready;
  } catch {
    /* no Font Loading API — the fonts are inlined below either way */
  }

  const [clone, pageCss] = await Promise.all([cloneForExport(node, filter), collectStyles()]);
  const css = ANCESTOR_RESET + pruneFontFaces(pageCss, exportedText(node), usedFontFamilies(node));
  const markup = svgDocument(wrapInAncestors(node, clone), width, height, pixelRatio, css);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');

  // The SVG has to travel as a data URI: an <img> pointed at a blob: URL is not
  // origin-clean, and the canvas it is drawn into ends up tainted (no
  // getImageData, no toBlob). Hence the aggressive font pruning above — the
  // payload has to stay small enough to be a URL.
  const image = await loadSvg(markup);

  // An SVG loaded as an image gets its own little document, and the @font-face
  // data URIs inside it are loaded *there*, asynchronously — the load event
  // fires before they are parsed, so a first raster can paint a text run in a
  // fallback face (this is why html-to-image tells Safari users to capture two
  // or three times). Keep drawing the same image — its font loads carry on
  // between draws — until two consecutive rasters agree.
  let previous = '';
  for (let pass = 0; pass < 12; pass++) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const signature = fingerprint(ctx, canvas.width, canvas.height);
    if (pass && signature === previous) break;
    previous = signature;
    await new Promise((resolve) => setTimeout(resolve, 60));
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('empty blob');
  return blob;
}

async function loadSvg(markup: string): Promise<HTMLImageElement> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('could not render the export SVG'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
  });
  // Best effort: Safari has shipped versions where decode() rejects for SVG.
  await image.decode().catch(() => undefined);
  return image;
}

/** Hash of every pixel, used to detect a settled render. */
function fingerprint(ctx: CanvasRenderingContext2D, width: number, height: number): string {
  const { data } = ctx.getImageData(0, 0, width, height);
  let hash = 0;
  for (let i = 0; i < data.length; i += 4) {
    hash = (hash * 31 + data[i] + data[i + 1] * 3 + data[i + 2] * 7) | 0;
  }
  return `${hash}:${data.length}`;
}
