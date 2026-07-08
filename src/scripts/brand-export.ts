// Client-side export/copy for the /brand asset kit.
// Mirrors src/scripts/template-studio.ts: html-to-image is loaded as a global
// via CDN (see brand.astro), a framed node is captured to PNG for download or
// clipboard, while colours and type samples copy as plain text. Feedback is the
// inline [data-status] span pattern, auto-cleared after 2.5s.
type HtmlToImage = {
  toBlob: (node: HTMLElement, opts?: Record<string, unknown>) => Promise<Blob | null>;
};

function lib(): HtmlToImage | null {
  return (window as unknown as { htmlToImage?: HtmlToImage }).htmlToImage ?? null;
}

const timers: Record<string, number> = {};
function setStatus(id: string, msg: string): void {
  const el = document.querySelector<HTMLElement>(`[data-status="${id}"]`);
  if (!el) return;
  el.textContent = msg;
  if (msg && msg !== '…') {
    window.clearTimeout(timers[id]);
    timers[id] = window.setTimeout(() => {
      el.textContent = '';
    }, 2500);
  }
}

// The graffiti marks depend on Sedgwick Ave Display (Google Fonts); wait for
// fonts before the first capture so exports don't fall back to `cursive`.
let fontsReady = false;
async function ensureFonts(): Promise<void> {
  if (fontsReady) return;
  try {
    await document.fonts.ready;
  } catch {
    /* older browsers without the Font Loading API — skip */
  }
  fontsReady = true;
}

async function makeBlob(id: string): Promise<Blob> {
  const htmlToImage = lib();
  if (!htmlToImage) throw new Error('html-to-image not loaded');
  const node = document.getElementById('dl-' + id);
  if (!node) throw new Error('missing node: ' + id);
  await ensureFonts();
  // pixelRatio 3 — the brand marks are small, so upscale for a crisp asset.
  const blob = await htmlToImage.toBlob(node, { pixelRatio: 3 });
  if (!blob) throw new Error('empty blob');
  return blob;
}

async function download(id: string): Promise<void> {
  setStatus(id, '…');
  try {
    const blob = await makeBlob(id);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vg-${id}.png`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    setStatus(id, '✓ збережено');
  } catch (e) {
    console.error(e);
    setStatus(id, '✕ помилка');
  }
}

async function copyImg(id: string): Promise<void> {
  setStatus(id, '…');
  try {
    // ClipboardItem accepts a Promise<Blob>, preserving Safari's user gesture.
    const item = new ClipboardItem({ 'image/png': makeBlob(id) });
    await navigator.clipboard.write([item]);
    setStatus(id, '✓ скопійовано');
  } catch (e) {
    console.error(e);
    setStatus(id, '✕ помилка');
  }
}

async function copyText(value: string, statusId: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    setStatus(statusId, '✓ скопійовано');
  } catch (e) {
    console.error(e);
    setStatus(statusId, '✕ помилка');
  }
}

function bindActions(): void {
  document.querySelectorAll<HTMLElement>('[data-dl]').forEach((btn) => {
    const id = btn.dataset.dl;
    if (id) btn.addEventListener('click', () => download(id));
  });
  document.querySelectorAll<HTMLElement>('[data-cp]').forEach((btn) => {
    const id = btn.dataset.cp;
    if (id) btn.addEventListener('click', () => copyImg(id));
  });
  // Text copies (hex codes, type samples) — value in data-*, target span in data-for.
  document.querySelectorAll<HTMLElement>('[data-copy-hex], [data-copy-text]').forEach((btn) => {
    const value = btn.dataset.copyHex ?? btn.dataset.copyText;
    const statusId = btn.dataset.for;
    if (value && statusId) btn.addEventListener('click', () => copyText(value, statusId));
  });
}

bindActions();
