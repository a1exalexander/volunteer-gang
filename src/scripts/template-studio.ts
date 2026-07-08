// Client logic for the Instagram template studio (/templates).
// Ported from the Claude Design DCLogic prototype: one shared fundraiser
// state drives 21 fixed-size (1080px) export canvases; each can be downloaded
// as PNG or copied to the clipboard via html-to-image. State persists to
// localStorage and is seeded from the CMS "active fundraiser" on first visit.

import { fmtUAH, percentOf, dayFmt } from '../lib/format';

const STORAGE_KEY = 'vg-tpl-state-v1';
const CANVAS_IDS = ['announce', 'progress', 'urgent', 'push', 'report', 'thanks', 'closed', 'milestone', 'remaining', 'thermo', 'goalpost', 'photopost', 'photostory', 'halfway', 'deadline', 'share', 'weekly', 'quote', 'minimal', 'sos', 'closedstory'];

interface State {
  day: number;
  titleMain: string;
  titleAccent: string;
  desc: string;
  goal: number;
  raised: number;
  photo: string | null;
  colors: Record<string, string>;
}

// User-mixable template palette roles → the `--c-*` custom properties the
// canvases read. Defaults mirror the brand tokens baked into `.gallery`.
const DEFAULT_COLORS: Record<string, string> = {
  ink: '#0d0c0c',
  chalk: '#f5f1ec',
  pink: '#ff2e88',
  acid: '#c9e400',
  bubble: '#f4a6e3',
};
const COLOR_ROLES = Object.keys(DEFAULT_COLORS);

const FALLBACK: State = {
  day: 3,
  titleMain: '',
  titleAccent: '',
  desc: '',
  goal: 500000,
  raised: 341500,
  photo: null,
  colors: { ...DEFAULT_COLORS },
};

// Only these keys survive merging — drops stale fields (e.g. the retired
// `no`/`jar`) from old localStorage payloads and from the JSON seed.
const ALLOWED_KEYS: (keyof State)[] = ['day', 'titleMain', 'titleAccent', 'desc', 'goal', 'raised', 'photo', 'colors'];

function pick(obj: Record<string, unknown>): Partial<State> {
  const out: Partial<State> = {};
  for (const k of ALLOWED_KEYS) if (k in obj) (out as Record<string, unknown>)[k] = obj[k];
  return out;
}

function readInitial(): State {
  let base: State = { ...FALLBACK };
  const el = document.getElementById('vg-tpl-initial');
  try {
    if (el?.textContent) base = { ...base, ...pick(JSON.parse(el.textContent)) };
  } catch {
    /* ignore malformed seed */
  }
  let saved: Record<string, unknown> = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
  } catch {
    /* ignore */
  }
  const merged = { ...base, ...pick(saved) };
  // Deep-merge colours so a partial/stale saved object can't drop roles.
  const savedColors = merged.colors && typeof merged.colors === 'object' ? merged.colors : {};
  merged.colors = { ...DEFAULT_COLORS, ...savedColors };
  return merged;
}

let state = readInitial();

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage may be unavailable (private mode) — degrade silently */
  }
}

function derived(): Record<string, string> {
  const goal = Math.max(1, Number(state.goal) || 0);
  const raised = Math.max(0, Number(state.raised) || 0);
  const pct = percentOf(raised, goal);
  return {
    day: String(state.day ?? ''),
    titleMain: state.titleMain,
    titleAccent: state.titleAccent,
    desc: state.desc,
    percent: String(pct),
    percentCss: pct + '%',
    raisedFmt: fmtUAH(raised),
    goalFmt: fmtUAH(goal),
    remainingFmt: fmtUAH(Math.max(0, goal - raised)),
    dayFmt: dayFmt(Number(state.day) || 1),
  };
}

function render(): void {
  const v = derived();

  document.querySelectorAll<HTMLElement>('[data-bind]').forEach((el) => {
    const key = el.dataset.bind;
    if (key && key in v) el.textContent = v[key];
  });

  document.querySelectorAll<HTMLElement>('[data-bar]').forEach((el) => {
    el.style.width = v.percentCss;
  });

  document.querySelectorAll<HTMLElement>('[data-bar-v]').forEach((el) => {
    el.style.height = v.percentCss;
  });

  const hasPhoto = !!state.photo;
  document.querySelectorAll<HTMLElement>('[data-photo]').forEach((el) => {
    el.style.backgroundImage = hasPhoto ? `url("${state.photo}")` : 'none';
    el.style.display = hasPhoto ? 'block' : 'none';
  });
  document.querySelectorAll<HTMLElement>('[data-nophoto]').forEach((el) => {
    el.style.display = hasPhoto ? 'none' : 'flex';
  });

  updatePhotoControls();
}

function updatePhotoControls(): void {
  const clearBtn = document.getElementById('tpl-photo-clear');
  if (clearBtn) clearBtn.style.display = state.photo ? 'inline-block' : 'none';
}

type FieldEl = HTMLInputElement | HTMLTextAreaElement;

function bindField(id: string, key: keyof State, numeric = false): void {
  const el = document.getElementById(id) as FieldEl | null;
  if (!el) return;
  const current = state[key];
  el.value = current == null ? '' : String(current);
  el.addEventListener('input', () => {
    if (numeric) {
      (state[key] as unknown as number) = el.value === '' ? 0 : Number(el.value);
    } else {
      (state[key] as unknown as string) = el.value;
    }
    persist();
    render();
  });
}

// ---------- template colour mixer ----------
function applyColors(): void {
  const gallery = document.querySelector<HTMLElement>('.gallery');
  if (!gallery) return;
  for (const role of COLOR_ROLES) {
    gallery.style.setProperty('--c-' + role, state.colors[role] ?? DEFAULT_COLORS[role]);
  }
}

function bindColors(): void {
  document.querySelectorAll<HTMLInputElement>('[data-color]').forEach((inp) => {
    const role = inp.dataset.color;
    if (!role) return;
    if (state.colors[role]) inp.value = state.colors[role];
    inp.addEventListener('input', () => {
      state.colors = { ...state.colors, [role]: inp.value };
      persist();
      applyColors();
    });
  });

  document.getElementById('tpl-colors-reset')?.addEventListener('click', () => {
    state.colors = { ...DEFAULT_COLORS };
    document.querySelectorAll<HTMLInputElement>('[data-color]').forEach((inp) => {
      const role = inp.dataset.color;
      if (role && DEFAULT_COLORS[role]) inp.value = DEFAULT_COLORS[role];
    });
    persist();
    applyColors();
  });
}

function bindPhoto(): void {
  const fileInput = document.getElementById('tpl-photo') as HTMLInputElement | null;
  fileInput?.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.photo = String(reader.result);
      persist();
      render();
    };
    reader.readAsDataURL(file);
    fileInput.value = '';
  });

  document.getElementById('tpl-photo-clear')?.addEventListener('click', () => {
    state.photo = null;
    persist();
    render();
  });
}

// ---------- export (PNG download / clipboard copy) ----------
type HtmlToImage = { toBlob: (node: HTMLElement, opts?: Record<string, unknown>) => Promise<Blob | null> };

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

async function makeBlob(id: string): Promise<Blob> {
  const htmlToImage = lib();
  if (!htmlToImage) throw new Error('html-to-image not loaded');
  const node = document.getElementById('vgx-' + id);
  if (!node) throw new Error('missing canvas: ' + id);
  const blob = await htmlToImage.toBlob(node, { pixelRatio: 1 });
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

async function copy(id: string): Promise<void> {
  setStatus(id, '…');
  try {
    // ClipboardItem accepts a Promise<Blob>, which keeps Safari's user-gesture
    // requirement satisfied while the image renders.
    const item = new ClipboardItem({ 'image/png': makeBlob(id) });
    await navigator.clipboard.write([item]);
    setStatus(id, '✓ скопійовано');
  } catch (e) {
    console.error(e);
    setStatus(id, '✕ помилка');
  }
}

function bindActions(): void {
  document.querySelectorAll<HTMLElement>('[data-dl]').forEach((btn) => {
    const id = btn.dataset.dl;
    if (id) btn.addEventListener('click', () => download(id));
  });
  document.querySelectorAll<HTMLElement>('[data-cp]').forEach((btn) => {
    const id = btn.dataset.cp;
    if (id) btn.addEventListener('click', () => copy(id));
  });
}

function init(): void {
  bindField('tpl-day', 'day', true);
  bindField('tpl-titleMain', 'titleMain');
  bindField('tpl-titleAccent', 'titleAccent');
  bindField('tpl-desc', 'desc');
  bindField('tpl-goal', 'goal', true);
  bindField('tpl-raised', 'raised', true);
  bindPhoto();
  bindColors();
  bindActions();
  render();
  applyColors();
  // keep CANVAS_IDS referenced for clarity / future validation
  void CANVAS_IDS;
}

init();
