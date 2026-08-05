// Client-side export/copy for the /brand asset kit.
// Mirrors src/scripts/template-studio.ts: a framed node is captured to PNG via
// src/lib/dom-to-png for download or clipboard, while colours and type samples
// copy as plain text. Feedback is the inline [data-status] span pattern,
// auto-cleared after 2.5s.
import { nodeToBlob } from '../lib/dom-to-png';

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

async function makeBlob(id: string): Promise<Blob> {
  const node = document.getElementById('dl-' + id);
  if (!node) throw new Error('missing node: ' + id);
  // pixelRatio 3 — the brand marks are small, so upscale for a crisp asset.
  // (nodeToBlob awaits document.fonts.ready itself, so the graffiti marks never
  // fall back to `cursive` on a cold first capture.)
  return nodeToBlob(node, { pixelRatio: 3 });
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
