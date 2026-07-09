// Client logic for the Instagram template studio (/templates).
// Ported from the Claude Design DCLogic prototype: one shared fundraiser
// state drives 21 fixed-size (1080px) export canvases; each can be downloaded
// as PNG or copied to the clipboard via html-to-image. State persists to
// localStorage and is seeded from the CMS "active fundraiser" on first visit.

import { fmtUAH, percentOf } from '../lib/format';

const STORAGE_KEY = 'vg-tpl-state-v1';
const LAYOUT_STORAGE_KEY = 'vg-tpl-layout-v1';
const REMOVED_STORAGE_KEY = 'vg-tpl-removed-v1';
const FORMAT_STORAGE_KEY = 'vg-tpl-format-v1';
const CANVAS_IDS = ['announce', 'progress', 'urgent', 'push', 'report', 'thanks', 'closed', 'milestone', 'remaining', 'thermo', 'goalpost', 'photopost', 'photostory', 'halfway', 'deadline', 'share', 'weekly', 'quote', 'minimal', 'sos', 'closedstory'];

interface State {
  titleMain: string;
  titleAccent: string;
  desc: string;
  goal: number;
  raised: number;
  /** the single uploaded photo, shared by every template's photo slot */
  photo: string | null;
  colors: Record<string, string>;
  /** editable status/kicker labels, keyed by the canvases' data-label roles */
  labels: Record<string, string>;
}

interface LayoutValue {
  x: number;
  y: number;
  scale: number;
}

interface ActionIcons {
  download: string;
  copy: string;
  edit: string;
  done: string;
  reset: string;
  remove: string;
  success: string;
  error: string;
}

type CardLayout = Record<string, LayoutValue>;
type LayoutStore = Record<string, CardLayout>;
/** cardId → list of node keys the user has removed from that card */
type RemovedStore = Record<string, string[]>;

/** Post/story toggle per card — only the resolution changes, not the design. */
type CardFormat = 'post' | 'story';
/** cardId → chosen format (absent = the card's native format) */
type FormatStore = Record<string, CardFormat>;
// Preview boxes are the 1080px canvas scaled by .tpl-scale (0.32963), so the
// preview height is the canvas height × that factor (1080→356, 1350→445).
const FORMAT_DIMS: Record<CardFormat, { canvas: number; preview: number }> = {
  post: { canvas: 1080, preview: 356 },
  story: { canvas: 1350, preview: 445 },
};
const FORMAT_META: Record<CardFormat, { label: string; res: string }> = {
  post: { label: 'ПОСТ', res: '1080×1080' },
  story: { label: 'СТОРІЗ', res: '1080×1350' },
};

interface CardEditor {
  actions: HTMLElement;
  canvas: HTMLElement;
  button: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  status: HTMLElement | null;
}

interface DragState {
  mode: 'move' | 'scale';
  cardId: string;
  key: string;
  node: HTMLElement;
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  originScale: number;
  scale: number;
  centerX: number;
  centerY: number;
  startDistance: number;
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

// Editable status/kicker labels baked into the canvases via `data-label`.
// The panel edits these; each value drives every canvas that shares the role
// (e.g. `closed` appears on three templates). Decorative glyphs (↓, ✕) live
// outside the bound span, so they are never part of the editable text.
const DEFAULT_LABELS: Record<string, string> = {
  collect: 'ЗБІР НА',
  active: 'АКТИВНИЙ ЗБІР',
  urgent: 'ТЕРМІНОВО · ЗБІР',
  checks: 'ЧЕКИ ✓ ФОТО ✓',
  handover: 'ПЕРЕДАНО',
  closedKicker: 'ЗБІР ЗАКРИТО',
  closed: 'ЗАКРИТО',
  collected: 'ВЖЕ ЗІБРАНО',
  thermo: 'ТЕРМОМЕТР ЗБОРУ',
  equator: 'ЕКВАТОР ЗБОРУ',
  deadline: 'ЗАКРИВАЄМО СЬОГОДНІ',
  lastDay: 'останній день збору',
  checksWeekly: 'ЧЕКИ ✓',
};
const LABEL_ROLES = Object.keys(DEFAULT_LABELS);

const FALLBACK: State = {
  titleMain: '',
  titleAccent: '',
  desc: '',
  goal: 500000,
  raised: 341500,
  photo: null,
  colors: { ...DEFAULT_COLORS },
  labels: { ...DEFAULT_LABELS },
};

// Only these keys survive merging — drops stale fields (e.g. the retired
// `no`/`jar`/`gift`) from old localStorage payloads and from the JSON seed.
const ALLOWED_KEYS: (keyof State)[] = ['titleMain', 'titleAccent', 'desc', 'goal', 'raised', 'photo', 'colors', 'labels'];

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
  // Migration: the retired separate goods photo (`gift`) becomes the shared one.
  if (!merged.photo && typeof saved.gift === 'string') merged.photo = saved.gift;
  // Deep-merge colours so a partial/stale saved object can't drop roles.
  const savedColors = merged.colors && typeof merged.colors === 'object' ? merged.colors : {};
  merged.colors = { ...DEFAULT_COLORS, ...savedColors };
  // Same for labels — a stale payload can't drop a role and blank a canvas.
  const savedLabels = merged.labels && typeof merged.labels === 'object' ? merged.labels : {};
  merged.labels = { ...DEFAULT_LABELS, ...savedLabels };
  return merged;
}

function readActionIcons(): ActionIcons {
  const fallback: ActionIcons = { download: '', copy: '', edit: '', done: '', reset: '', remove: '', success: '', error: '' };
  const el = document.getElementById('vg-tpl-icons');
  if (!el?.textContent) return fallback;
  try {
    const parsed = JSON.parse(el.textContent) as Partial<ActionIcons>;
    return {
      download: typeof parsed.download === 'string' ? parsed.download : '',
      copy: typeof parsed.copy === 'string' ? parsed.copy : '',
      edit: typeof parsed.edit === 'string' ? parsed.edit : '',
      done: typeof parsed.done === 'string' ? parsed.done : '',
      reset: typeof parsed.reset === 'string' ? parsed.reset : '',
      remove: typeof parsed.remove === 'string' ? parsed.remove : '',
      success: typeof parsed.success === 'string' ? parsed.success : '',
      error: typeof parsed.error === 'string' ? parsed.error : '',
    };
  } catch {
    return fallback;
  }
}

let state = readInitial();
const actionIcons = readActionIcons();
let editLayouts = readLayouts();
let removedNodes = readRemoved();
let cardFormats = readFormats();
const cardEditors = new Map<string, CardEditor>();
let activeCardId: string | null = null;
let dragState: DragState | null = null;

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage may be unavailable (private mode) — degrade silently */
  }
}

function isLayoutValue(value: unknown): value is LayoutValue {
  if (!value || typeof value !== 'object') return false;
  const point = value as Partial<LayoutValue>;
  return (
    typeof point.x === 'number' &&
    Number.isFinite(point.x) &&
    typeof point.y === 'number' &&
    Number.isFinite(point.y) &&
    (point.scale == null || (typeof point.scale === 'number' && Number.isFinite(point.scale)))
  );
}

function readLayouts(): LayoutStore {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};

    const layouts: LayoutStore = {};
    for (const [cardId, cardLayout] of Object.entries(parsed as Record<string, unknown>)) {
      if (!cardLayout || typeof cardLayout !== 'object') continue;

      const nodes: CardLayout = {};
      for (const [nodeKey, point] of Object.entries(cardLayout as Record<string, unknown>)) {
        if (isLayoutValue(point)) {
          nodes[nodeKey] = { x: point.x, y: point.y, scale: point.scale ?? 1 };
        }
      }

      if (Object.keys(nodes).length > 0) layouts[cardId] = nodes;
    }

    return layouts;
  } catch (error) {
    console.error('Could not read template layout edits.', error);
    return {};
  }
}

function persistLayouts(): void {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(editLayouts));
  } catch (error) {
    console.error('Could not persist template layout edits.', error);
  }
}

function readRemoved(): RemovedStore {
  try {
    const raw = localStorage.getItem(REMOVED_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};

    const removed: RemovedStore = {};
    for (const [cardId, keys] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(keys)) continue;
      const nodeKeys = keys.filter((k): k is string => typeof k === 'string');
      if (nodeKeys.length > 0) removed[cardId] = nodeKeys;
    }

    return removed;
  } catch (error) {
    console.error('Could not read removed template elements.', error);
    return {};
  }
}

function persistRemoved(): void {
  try {
    localStorage.setItem(REMOVED_STORAGE_KEY, JSON.stringify(removedNodes));
  } catch (error) {
    console.error('Could not persist removed template elements.', error);
  }
}

function readFormats(): FormatStore {
  try {
    const raw = localStorage.getItem(FORMAT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};

    const formats: FormatStore = {};
    for (const [cardId, fmt] of Object.entries(parsed as Record<string, unknown>)) {
      if (fmt === 'post' || fmt === 'story') formats[cardId] = fmt;
    }
    return formats;
  } catch (error) {
    console.error('Could not read template formats.', error);
    return {};
  }
}

function persistFormats(): void {
  try {
    localStorage.setItem(FORMAT_STORAGE_KEY, JSON.stringify(cardFormats));
  } catch (error) {
    console.error('Could not persist template formats.', error);
  }
}

function isDefaultLayoutValue(value: LayoutValue): boolean {
  return value.x === 0 && value.y === 0 && value.scale === 1;
}

function hasCardLayoutChanges(cardId: string): boolean {
  return Object.keys(editLayouts[cardId] ?? {}).length > 0;
}

function hasCardRemovals(cardId: string): boolean {
  return (removedNodes[cardId]?.length ?? 0) > 0;
}

function isNodeRemoved(cardId: string, key: string): boolean {
  return !!removedNodes[cardId]?.includes(key);
}

function hasCardEdits(cardId: string): boolean {
  return hasCardLayoutChanges(cardId) || hasCardRemovals(cardId);
}

function derived(): Record<string, string> {
  const goal = Math.max(1, Number(state.goal) || 0);
  const raised = Math.max(0, Number(state.raised) || 0);
  const pct = percentOf(raised, goal);
  return {
    titleMain: state.titleMain,
    titleAccent: state.titleAccent,
    desc: state.desc,
    percent: String(pct),
    percentCss: pct + '%',
    raisedFmt: fmtUAH(raised),
    goalFmt: fmtUAH(goal),
    remainingFmt: fmtUAH(Math.max(0, goal - raised)),
  };
}

function render(): void {
  const v = derived();

  document.querySelectorAll<HTMLElement>('[data-bind]').forEach((el) => {
    const key = el.dataset.bind;
    if (key && key in v) el.textContent = v[key];
  });

  document.querySelectorAll<HTMLElement>('[data-label]').forEach((el) => {
    const role = el.dataset.label;
    if (role && role in state.labels) el.textContent = state.labels[role];
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

  const dropzone = document.getElementById('tpl-photo-drop');
  if (dropzone) dropzone.classList.toggle('has-photo', !!state.photo);

  const thumb = document.getElementById('tpl-photo-thumb');
  if (thumb) thumb.style.backgroundImage = state.photo ? `url("${state.photo}")` : 'none';
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

// ---------- editable template labels (status / kicker badges) ----------
function bindLabels(): void {
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-label-input]').forEach((inp) => {
    const role = inp.dataset.labelInput;
    if (!role || !LABEL_ROLES.includes(role)) return;
    inp.value = state.labels[role] ?? DEFAULT_LABELS[role] ?? '';
    inp.addEventListener('input', () => {
      state.labels = { ...state.labels, [role]: inp.value };
      persist();
      render();
    });
  });

  document.getElementById('tpl-labels-reset')?.addEventListener('click', () => {
    state.labels = { ...DEFAULT_LABELS };
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-label-input]').forEach((inp) => {
      const role = inp.dataset.labelInput;
      if (role && DEFAULT_LABELS[role] != null) inp.value = DEFAULT_LABELS[role];
    });
    persist();
    render();
  });
}

function bindImage(inputId: string, clearId: string): void {
  const fileInput = document.getElementById(inputId) as HTMLInputElement | null;
  const dropzone = document.getElementById('tpl-photo-drop');

  const loadFile = (file: File | null | undefined): void => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.photo = String(reader.result);
      persist();
      render();
    };
    reader.readAsDataURL(file);
  };

  fileInput?.addEventListener('change', () => {
    loadFile(fileInput.files && fileInput.files[0]);
    fileInput.value = '';
  });

  if (dropzone) {
    const stop = (e: Event): void => {
      e.preventDefault();
      e.stopPropagation();
    };
    ['dragenter', 'dragover'].forEach((evt) =>
      dropzone.addEventListener(evt, (e) => {
        stop(e);
        dropzone.classList.add('is-dragover');
      })
    );
    ['dragleave', 'dragend'].forEach((evt) =>
      dropzone.addEventListener(evt, (e) => {
        stop(e);
        dropzone.classList.remove('is-dragover');
      })
    );
    dropzone.addEventListener('drop', (e) => {
      stop(e);
      dropzone.classList.remove('is-dragover');
      loadFile((e as DragEvent).dataTransfer?.files?.[0]);
    });
  }

  document.getElementById(clearId)?.addEventListener('click', () => {
    state.photo = null;
    persist();
    render();
  });
}

function hasOwnText(el: HTMLElement): boolean {
  return Array.from(el.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
}

function hasVisualStyle(style: CSSStyleDeclaration): boolean {
  return (
    style.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
    style.backgroundImage !== 'none' ||
    style.borderTopWidth !== '0px' ||
    style.borderRightWidth !== '0px' ||
    style.borderBottomWidth !== '0px' ||
    style.borderLeftWidth !== '0px' ||
    style.clipPath !== 'none'
  );
}

function hasInlineChildrenOnly(el: HTMLElement): boolean {
  return Array.from(el.children).every((child) => child.tagName === 'BR' || child.tagName === 'SPAN');
}

function hasCompositeChildren(el: HTMLElement): boolean {
  const children = Array.from(el.children);
  return children.length > 1 || children.some((child) => child.tagName !== 'BR' && child.tagName !== 'SPAN');
}

function isEditableCandidate(el: HTMLElement, canvas: HTMLElement): boolean {
  if (el === canvas) return false;

  const style = getComputedStyle(el);
  const directChild = el.parentElement === canvas;
  const bound = !!(el.dataset.bind || el.dataset.bar || el.dataset.barV || el.dataset.photo || el.dataset.nophoto || el.dataset.exportOptional);
  const hasText = hasOwnText(el) || (el.children.length === 0 && !!el.textContent?.trim());
  const leafTextBlock = hasText && hasInlineChildrenOnly(el);
  const positioned = style.position === 'absolute';
  const visual = hasVisualStyle(style);
  const compositeChildren = hasCompositeChildren(el);
  // A block wrapping an editable label span reads as a text block even when
  // the span is its only child (so plain-colour kickers stay drag/removable).
  const hasLabelChild = !!el.querySelector(':scope > [data-label]');

  if (bound && style.display !== 'inline') return true;
  if (directChild) return true;
  if (positioned) return true;
  if (compositeChildren) return true;
  if (hasLabelChild && style.display !== 'inline') return true;
  if (leafTextBlock && style.display !== 'inline') return true;
  if (visual && (hasText || compositeChildren || el.children.length <= 1)) return true;
  return false;
}

function shouldSkipNestedEditable(el: HTMLElement): boolean {
  const parentEditable = el.parentElement?.closest('[data-tpl-edit-node]');
  if (!parentEditable) return false;

  const style = getComputedStyle(el);
  const hasText = hasOwnText(el) || (el.children.length === 0 && !!el.textContent?.trim());
  const leafTextBlock = hasText && hasInlineChildrenOnly(el);
  const visual = hasVisualStyle(style);
  const positioned = style.position === 'absolute';
  const compositeChildren = hasCompositeChildren(el);

  return !positioned && !visual && !compositeChildren && (style.display === 'inline' || leafTextBlock);
}

function nodePath(canvas: HTMLElement, el: HTMLElement): string {
  const segments: number[] = [];
  let current: HTMLElement | null = el;

  while (current && current !== canvas) {
    const parentNode = current.parentNode;
    if (!(parentNode instanceof HTMLElement)) break;
    const parentEl: HTMLElement = parentNode;
    segments.unshift(Array.prototype.indexOf.call(parentEl.children, current));
    current = parentEl;
  }

  return segments.join('-');
}

function getLayoutValue(cardId: string, key: string): LayoutValue {
  return editLayouts[cardId]?.[key] ?? { x: 0, y: 0, scale: 1 };
}

function setLayoutValue(cardId: string, key: string, value: LayoutValue): void {
  const nextCardLayout = { ...(editLayouts[cardId] ?? {}) };

  if (isDefaultLayoutValue(value)) {
    delete nextCardLayout[key];
  } else {
    nextCardLayout[key] = value;
  }

  if (Object.keys(nextCardLayout).length === 0) {
    const nextLayouts = { ...editLayouts };
    delete nextLayouts[cardId];
    editLayouts = nextLayouts;
    return;
  }

  editLayouts = {
    ...editLayouts,
    [cardId]: nextCardLayout,
  };
}

function formatTransform(base: string, value: LayoutValue): string {
  const move = value.x === 0 && value.y === 0 ? '' : `translate(${value.x.toFixed(1)}px, ${value.y.toFixed(1)}px)`;
  const scale = value.scale === 1 ? '' : `scale(${value.scale.toFixed(3)})`;
  return [move, scale, base].filter(Boolean).join(' ').trim();
}

function ensureScaleHandle(node: HTMLElement): void {
  if (node.querySelector(':scope > [data-tpl-scale-handle]')) return;

  if (getComputedStyle(node).position === 'static' && !node.style.position) {
    node.style.position = 'relative';
  }

  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'tpl-edit-handle';
  handle.dataset.tplScaleHandle = 'true';
  handle.dataset.exportIgnore = 'true';
  handle.setAttribute('aria-label', 'Змінити розмір елемента');
  node.append(handle);
}

// The remove button only appears once its node is selected (see the
// `.is-selected` CSS rule); clicking it hides the element from the preview
// and the export, restorable via the card's «Скинути» button.
function ensureRemoveButton(cardId: string, node: HTMLElement): void {
  if (node.querySelector(':scope > [data-tpl-remove-handle]')) return;

  if (getComputedStyle(node).position === 'static' && !node.style.position) {
    node.style.position = 'relative';
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tpl-remove-btn';
  button.dataset.tplRemoveHandle = 'true';
  button.dataset.exportIgnore = 'true';
  button.setAttribute('aria-label', 'Видалити елемент');
  if (actionIcons.remove) {
    button.innerHTML = `<span class="tpl-btn-icon" aria-hidden="true">${actionIcons.remove}</span>`;
  } else {
    button.textContent = '✕';
  }
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const key = node.dataset.tplEditNode;
    if (key) removeNode(cardId, key);
  });
  node.append(button);
}

function selectNode(cardId: string, node: HTMLElement): void {
  const editor = cardEditors.get(cardId);
  if (!editor) return;
  editor.canvas.querySelectorAll<HTMLElement>('[data-tpl-edit-node].is-selected').forEach((n) => {
    if (n !== node) n.classList.remove('is-selected');
  });
  node.classList.add('is-selected');
}

function clearSelection(cardId: string): void {
  const editor = cardEditors.get(cardId);
  if (!editor) return;
  editor.canvas.querySelectorAll<HTMLElement>('[data-tpl-edit-node].is-selected').forEach((n) => {
    n.classList.remove('is-selected');
  });
}

function applyRemovedState(cardId: string): void {
  const editor = cardEditors.get(cardId);
  if (!editor) return;

  const removed = new Set(removedNodes[cardId] ?? []);
  editor.canvas.querySelectorAll<HTMLElement>('[data-tpl-edit-node]').forEach((node) => {
    const key = node.dataset.tplEditNode;
    const isRemoved = !!key && removed.has(key);
    node.classList.toggle('tpl-node-removed', isRemoved);
    if (isRemoved) node.classList.remove('is-selected');
  });
}

function removeNode(cardId: string, key: string): void {
  if (!isNodeRemoved(cardId, key)) {
    removedNodes = {
      ...removedNodes,
      [cardId]: [...(removedNodes[cardId] ?? []), key],
    };
  }
  applyRemovedState(cardId);
  updateCardControls(cardId);
  persistRemoved();
}

function restoreCardRemovals(cardId: string): void {
  if (!removedNodes[cardId]) return;

  const nextRemoved = { ...removedNodes };
  delete nextRemoved[cardId];
  removedNodes = nextRemoved;
  applyRemovedState(cardId);
  updateCardControls(cardId);
  persistRemoved();
}

function applyOffset(cardId: string, node: HTMLElement): void {
  const key = node.dataset.tplEditNode;
  if (!key) return;

  const base = node.dataset.tplEditBaseTransform ?? '';
  node.style.transform = formatTransform(base, getLayoutValue(cardId, key));
}

function applyCardLayout(cardId: string): void {
  const editor = cardEditors.get(cardId);
  if (!editor) return;

  editor.canvas.querySelectorAll<HTMLElement>('[data-tpl-edit-node]').forEach((node) => {
    applyOffset(cardId, node);
  });
}

function setButtonLabel(button: HTMLElement, iconMarkup: string, label: string): void {
  if (!iconMarkup) {
    button.textContent = label;
    return;
  }
  button.innerHTML = `<span class="tpl-btn-icon" aria-hidden="true">${iconMarkup}</span><span>${label}</span>`;
}

function updateCardResetButton(cardId: string): void {
  const editor = cardEditors.get(cardId);
  if (!editor) return;

  const shouldRender = activeCardId === cardId && hasCardEdits(cardId);
  const isRendered = editor.resetButton.parentElement === editor.actions;

  if (shouldRender && !isRendered) {
    if (editor.status) {
      editor.actions.insertBefore(editor.resetButton, editor.status);
    } else {
      editor.actions.append(editor.resetButton);
    }
    return;
  }

  if (!shouldRender && isRendered) editor.resetButton.remove();
}

function updateCardEditButton(cardId: string): void {
  const editor = cardEditors.get(cardId);
  if (!editor) return;

  const editing = activeCardId === cardId;
  editor.button.classList.toggle('is-active', editing);
  setButtonLabel(editor.button, editing ? actionIcons.done : actionIcons.edit, editing ? 'Готово' : 'Редагувати');
  editor.button.setAttribute('aria-pressed', String(editing));
}

function updateCardControls(cardId: string): void {
  updateCardEditButton(cardId);
  updateCardResetButton(cardId);
}

function clearCardLayout(cardId: string): void {
  if (!editLayouts[cardId]) return;

  const nextLayouts = { ...editLayouts };
  delete nextLayouts[cardId];
  editLayouts = nextLayouts;
  applyCardLayout(cardId);
  updateCardControls(cardId);
  persistLayouts();
}

function registerEditableNodes(cardId: string, canvas: HTMLElement): void {
  const walker = document.createTreeWalker(canvas, NodeFilter.SHOW_ELEMENT);
  const editableNodes: HTMLElement[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!(node instanceof HTMLElement)) continue;
    if (!isEditableCandidate(node, canvas)) continue;
    if (shouldSkipNestedEditable(node)) continue;

    editableNodes.push(node);
  }

  for (const node of editableNodes) {
    node.dataset.tplEditNode = nodePath(canvas, node);
    node.dataset.tplEditBaseTransform = node.style.transform;
    ensureScaleHandle(node);
    ensureRemoveButton(cardId, node);
    applyOffset(cardId, node);
  }
}

function getCanvasScale(canvas: HTMLElement): number {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !canvas.offsetWidth) return 1;
  return rect.width / canvas.offsetWidth;
}

function setCardEditing(cardId: string, editing: boolean): void {
  const editor = cardEditors.get(cardId);
  if (!editor) return;

  if (editing && activeCardId && activeCardId !== cardId) setCardEditing(activeCardId, false);
  if (!editing && dragState?.cardId === cardId) finishDragging();
  if (!editing) clearSelection(cardId);

  editor.canvas.classList.toggle('canvas--editing', editing);
  activeCardId = editing ? cardId : activeCardId === cardId ? null : activeCardId;
  updateCardControls(cardId);
}

function finishDragging(): void {
  if (!dragState) return;
  dragState.node.classList.remove('is-dragging', 'is-scaling');
  if (dragState.node.hasPointerCapture(dragState.pointerId)) {
    dragState.node.releasePointerCapture(dragState.pointerId);
  }
  persistLayouts();
  dragState = null;
}

function bindCardEditors(): void {
  document.querySelectorAll<HTMLElement>('.tpl').forEach((card) => {
    const actions = card.querySelector<HTMLElement>('.tpl-actions');
    const canvas = card.querySelector<HTMLElement>('.canvas');
    const exportBtn = actions?.querySelector<HTMLElement>('[data-dl]');
    const cardId = exportBtn?.dataset.dl;
    if (!actions || !canvas || !cardId || !CANVAS_IDS.includes(cardId)) return;

    registerEditableNodes(cardId, canvas);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cp-btn tpl-edit-btn';
    button.dataset.editCard = cardId;
    button.setAttribute('aria-pressed', 'false');
    setButtonLabel(button, actionIcons.edit, 'Редагувати');
    button.addEventListener('click', () => setCardEditing(cardId, activeCardId !== cardId));

    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'ghost-btn tpl-reset-btn';
    setButtonLabel(resetButton, actionIcons.reset, 'Скинути');
    resetButton.addEventListener('click', () => {
      clearCardLayout(cardId);
      restoreCardRemovals(cardId);
    });

    const status = actions.querySelector<HTMLElement>('.tpl-status');
    if (status) {
      actions.insertBefore(button, status);
    } else {
      actions.append(button);
    }

    canvas.addEventListener('pointerdown', (event) => {
      if (activeCardId !== cardId) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      // The remove button handles its own click; don't start a drag under it.
      if (target.closest<HTMLElement>('[data-tpl-remove-handle]')) return;

      const handle = target.closest<HTMLElement>('[data-tpl-scale-handle]');
      const node = target.closest<HTMLElement>('[data-tpl-edit-node]');
      if (!node || !canvas.contains(node)) {
        clearSelection(cardId);
        return;
      }

      const key = node.dataset.tplEditNode;
      if (!key) return;

      // Clicking an element selects it, revealing its remove button.
      selectNode(cardId, node);

      const layoutValue = getLayoutValue(cardId, key);
      const rect = node.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const startDistance = Math.max(1, Math.hypot(event.clientX - centerX, event.clientY - centerY));

      dragState = {
        mode: handle ? 'scale' : 'move',
        cardId,
        key,
        node,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: layoutValue.x,
        originY: layoutValue.y,
        originScale: layoutValue.scale,
        scale: getCanvasScale(canvas),
        centerX,
        centerY,
        startDistance,
      };

      node.classList.add(handle ? 'is-scaling' : 'is-dragging');
      node.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    cardEditors.set(cardId, { actions, canvas, button, resetButton, status });
    applyRemovedState(cardId);
    updateCardControls(cardId);
  });

  document.addEventListener('pointermove', (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;

    let layoutValue: LayoutValue;
    if (dragState.mode === 'scale') {
      const distance = Math.max(1, Math.hypot(event.clientX - dragState.centerX, event.clientY - dragState.centerY));
      const nextScale = Math.min(3, Math.max(0.35, dragState.originScale * (distance / dragState.startDistance)));
      layoutValue = { x: dragState.originX, y: dragState.originY, scale: nextScale };
    } else {
      const dx = (event.clientX - dragState.startX) / dragState.scale;
      const dy = (event.clientY - dragState.startY) / dragState.scale;
      layoutValue = { x: dragState.originX + dx, y: dragState.originY + dy, scale: dragState.originScale };
    }

    setLayoutValue(dragState.cardId, dragState.key, layoutValue);
    applyOffset(dragState.cardId, dragState.node);
    updateCardControls(dragState.cardId);
  });

  document.addEventListener('pointerup', (event) => {
    if (dragState && event.pointerId === dragState.pointerId) finishDragging();
  });
  document.addEventListener('pointercancel', (event) => {
    if (dragState && event.pointerId === dragState.pointerId) finishDragging();
  });

  // Delete / Backspace removes the currently selected element, unless the
  // user is typing in a form field (where those keys must edit text).
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;
    if (!activeCardId) return;

    const target = event.target;
    if (target instanceof HTMLElement) {
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
    }

    const editor = cardEditors.get(activeCardId);
    const selected = editor?.canvas.querySelector<HTMLElement>('[data-tpl-edit-node].is-selected');
    const key = selected?.dataset.tplEditNode;
    if (!key) return;

    event.preventDefault();
    removeNode(activeCardId, key);
  });
}

// ---------- export (PNG download / clipboard copy) ----------
type HtmlToImage = { toBlob: (node: HTMLElement, opts?: Record<string, unknown>) => Promise<Blob | null> };

// Photo slots are optional: elements marked data-export-optional="photo"
// are placeholder-hints for the preview only. When no photo was uploaded
// they are dropped from the export clone, so the downloaded or copied PNG
// comes out without the placeholder (see the alert on /templates).
function exportFilter(node: Node): boolean {
  if (!(node instanceof HTMLElement)) return true;
  if (node.classList.contains('tpl-node-removed')) return false;
  if (node.dataset.exportOptional === 'photo') return !!state.photo;
  if (node.dataset.exportIgnore === 'true') return false;
  return true;
}

function lib(): HtmlToImage | null {
  return (window as unknown as { htmlToImage?: HtmlToImage }).htmlToImage ?? null;
}

const timers: Record<string, number> = {};
function setActionTooltip(id: string, mode: 'cp' | 'dl', msg: string, ok: boolean): void {
  const selector = mode === 'cp' ? `[data-cp="${id}"]` : `[data-dl="${id}"]`;
  const btn = document.querySelector<HTMLElement>(selector);
  if (!btn) return;

  const baseAria = btn.dataset.baseAriaLabel ?? btn.getAttribute('aria-label') ?? '';
  btn.dataset.baseAriaLabel = baseAria;

  // Render the tooltip as a real element so a react-icons SVG can sit next to
  // the label — the CSS `::after` used before could only show plain text.
  let tip = btn.querySelector<HTMLElement>('.action-tooltip');
  if (!tip) {
    tip = document.createElement('span');
    tip.className = 'action-tooltip';
    tip.setAttribute('aria-hidden', 'true');
    btn.appendChild(tip);
  }
  tip.classList.toggle('action-tooltip--error', !ok);
  const iconMarkup = ok ? actionIcons.success : actionIcons.error;
  const iconWrap = document.createElement('span');
  iconWrap.className = 'action-tooltip-icon';
  iconWrap.setAttribute('aria-hidden', 'true');
  iconWrap.innerHTML = iconMarkup;
  const label = document.createElement('span');
  label.textContent = msg;
  tip.replaceChildren(iconWrap, label);

  btn.classList.add('action-tooltip-visible');
  btn.setAttribute('aria-label', msg);

  const timerKey = `action-tip-${mode}-${id}`;
  window.clearTimeout(timers[timerKey]);
  timers[timerKey] = window.setTimeout(() => {
    btn.classList.remove('action-tooltip-visible');
    if (baseAria) btn.setAttribute('aria-label', baseAria);
    else btn.removeAttribute('aria-label');
  }, 2500);
}

async function makeBlob(id: string): Promise<Blob> {
  const htmlToImage = lib();
  if (!htmlToImage) throw new Error('html-to-image not loaded');
  const node = document.getElementById('vgx-' + id);
  if (!node) throw new Error('missing canvas: ' + id);
  node.classList.add('canvas--exporting');
  try {
    const blob = await htmlToImage.toBlob(node, { pixelRatio: 1, filter: exportFilter });
    if (!blob) throw new Error('empty blob');
    return blob;
  } finally {
    node.classList.remove('canvas--exporting');
  }
}

async function download(id: string): Promise<void> {
  try {
    const blob = await makeBlob(id);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vg-${id}.png`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    setActionTooltip(id, 'dl', 'Збережено', true);
  } catch (e) {
    console.error(e);
    setActionTooltip(id, 'dl', 'Помилка збереження', false);
  }
}

async function copy(id: string): Promise<void> {
  try {
    // ClipboardItem accepts a Promise<Blob>, which keeps Safari's user-gesture
    // requirement satisfied while the image renders.
    const item = new ClipboardItem({ 'image/png': makeBlob(id) });
    await navigator.clipboard.write([item]);
    setActionTooltip(id, 'cp', 'Скопійовано', true);
  } catch (e) {
    console.error(e);
    setActionTooltip(id, 'cp', 'Помилка копіювання', false);
  }
}

// ---------- mobile bottom drawer for the fields panel ----------
function bindDrawer(): void {
  const panel = document.getElementById('studio-panel');
  const toggle = document.getElementById('studio-drawer-toggle');
  const closeBtn = document.getElementById('studio-drawer-close');
  const backdrop = document.getElementById('studio-drawer-backdrop');
  if (!panel || !toggle || !backdrop) return;

  const setOpen = (open: boolean): void => {
    panel.classList.toggle('open', open);
    backdrop.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    // Freeze the page behind the drawer; harmless on desktop where the
    // drawer chrome is display:none and setOpen is never called.
    document.body.classList.toggle('drawer-locked', open);
  };

  toggle.addEventListener('click', () => setOpen(!panel.classList.contains('open')));
  closeBtn?.addEventListener('click', () => setOpen(false));
  backdrop.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('open')) setOpen(false);
  });

  // If the viewport grows past the mobile breakpoint while the drawer is
  // open, reset so the desktop sidebar isn't left with a scroll-locked body.
  window.matchMedia('(min-width: 900.02px)').addEventListener('change', (e) => {
    if (e.matches) setOpen(false);
  });
}

// ---------- per-card post/story format toggle ----------
// Each canvas ships with an inline height of 1080 (post) or 1350 (story).
function nativeFormat(canvas: HTMLElement): CardFormat {
  return canvas.style.height.trim() === '1350px' ? 'story' : 'post';
}

function bindCardFormats(): void {
  document.querySelectorAll<HTMLElement>('.tpl').forEach((card) => {
    const canvas = card.querySelector<HTMLElement>('.canvas');
    const preview = card.querySelector<HTMLElement>('.tpl-preview');
    const cap = card.querySelector<HTMLElement>('.tpl-cap');
    const cardId = card.querySelector<HTMLElement>('[data-dl]')?.dataset.dl;
    if (!canvas || !preview || !cardId || !CANVAS_IDS.includes(cardId)) return;

    // Caption reads "ПОСТ · <NAME> · 1080×1080"; keep <NAME> to rebuild it
    // as the format flips (prefix + resolution become dynamic).
    const capParts = (cap?.textContent ?? '').split(' · ');
    const capName = capParts.length >= 3 ? capParts.slice(1, -1).join(' · ') : '';

    const native = nativeFormat(canvas);

    const group = document.createElement('div');
    group.className = 'tpl-format';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Формат');

    const buttons = {} as Record<CardFormat, HTMLButtonElement>;
    (['post', 'story'] as CardFormat[]).forEach((fmt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tpl-format-btn';
      btn.dataset.formatBtn = fmt;
      btn.textContent = fmt === 'post' ? 'Пост' : 'Сторіз';
      buttons[fmt] = btn;
      group.append(btn);
    });
    card.prepend(group);

    const apply = (fmt: CardFormat, save: boolean): void => {
      const dims = FORMAT_DIMS[fmt];
      canvas.style.height = dims.canvas + 'px';
      preview.style.height = dims.preview + 'px';
      if (cap && capName) cap.textContent = `${FORMAT_META[fmt].label} · ${capName} · ${FORMAT_META[fmt].res}`;
      for (const key of ['post', 'story'] as CardFormat[]) {
        const active = key === fmt;
        buttons[key].classList.toggle('is-active', active);
        buttons[key].setAttribute('aria-pressed', String(active));
      }
      // Only store a divergence from the card's native format.
      if (fmt === native) delete cardFormats[cardId];
      else cardFormats[cardId] = fmt;
      if (save) persistFormats();
    };

    buttons.post.addEventListener('click', () => apply('post', true));
    buttons.story.addEventListener('click', () => apply('story', true));

    apply(cardFormats[cardId] ?? native, false);
  });
}

// ---------- desktop panel offset ----------
// Publish the sticky header's live height so the fixed sidebar can sit right
// below it and size its own scroll area (see .studio-panel in vg.css).
function bindStudioLayout(): void {
  const header = document.querySelector<HTMLElement>('.site-header');
  if (!header) return;
  const setVar = (): void => {
    const h = Math.round(header.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--studio-header-h', `${h}px`);
  };
  setVar();
  window.addEventListener('resize', setVar);
}

// ---------- panel field → canvas highlight ----------
// Focusing (or hovering) a control in the fields panel rings every canvas
// element it drives, so the editor can see where that content will change.
// Selectors are scoped to `.gallery` so the panel's own preview figures
// (which reuse the same data-bind roles) are never lit up.
const FIELD_HIGHLIGHT: Record<string, string> = {
  'tpl-titleMain': '[data-bind="titleMain"]',
  'tpl-titleAccent': '[data-bind="titleAccent"]',
  'tpl-desc': '[data-bind="desc"]',
  'tpl-goal': '[data-bind="goalFmt"]',
  'tpl-raised': '[data-bind="raisedFmt"]',
};

function highlightSelectorFor(el: HTMLElement): string | null {
  const labelRole = el.dataset.labelInput;
  if (labelRole && LABEL_ROLES.includes(labelRole)) return `[data-label="${labelRole}"]`;
  if (el.id && FIELD_HIGHLIGHT[el.id]) return FIELD_HIGHLIGHT[el.id];
  if (el.id === 'tpl-photo-clear' || el.closest('#tpl-photo-drop')) {
    return '[data-export-optional="photo"],[data-photo],[data-nophoto]';
  }
  return null;
}

let activeHighlight: string | null = null;

function applyBindHighlight(selector: string | null): void {
  if (selector === activeHighlight) return;
  document.querySelectorAll<HTMLElement>('.tpl-bind-highlight').forEach((el) => el.classList.remove('tpl-bind-highlight'));
  activeHighlight = selector;
  if (!selector) return;
  // Scope every comma-separated part to `.gallery` so a multi-selector
  // (e.g. the photo slots) can't leak past the canvases.
  const scoped = selector
    .split(',')
    .map((part) => '.gallery ' + part.trim())
    .join(',');
  document.querySelectorAll<HTMLElement>(scoped).forEach((el) => el.classList.add('tpl-bind-highlight'));
}

// Fields whose row (not just the control itself) should trigger a hover preview.
const HOVER_FIELD_SELECTOR = '[data-label-input], #tpl-titleMain, #tpl-titleAccent, #tpl-desc, #tpl-goal, #tpl-raised, #tpl-photo-drop, #tpl-photo-clear';

function bindFocusHighlight(): void {
  const panel = document.getElementById('studio-panel');
  if (!panel) return;

  // Focus wins over hover: once a field is focused its highlight stays put
  // even as the pointer drifts across other rows.
  let focusLocked = false;

  panel.addEventListener('focusin', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const selector = highlightSelectorFor(target);
    focusLocked = !!selector;
    applyBindHighlight(selector);
  });
  panel.addEventListener('focusout', () => {
    focusLocked = false;
    applyBindHighlight(null);
  });

  panel.addEventListener('pointerover', (event) => {
    if (focusLocked) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const field = target.closest<HTMLElement>(HOVER_FIELD_SELECTOR);
    applyBindHighlight(field ? highlightSelectorFor(field) : null);
  });
  panel.addEventListener('pointerleave', () => {
    if (!focusLocked) applyBindHighlight(null);
  });
}

function bindActions(): void {
  document.querySelectorAll<HTMLElement>('[data-dl]').forEach((btn) => {
    const id = btn.dataset.dl;
    setButtonLabel(btn, actionIcons.download, 'PNG');
    if (id) btn.addEventListener('click', () => download(id));
  });
  document.querySelectorAll<HTMLElement>('[data-cp]').forEach((btn) => {
    const id = btn.dataset.cp;
    setButtonLabel(btn, actionIcons.copy, 'Копіювати');
    if (id) btn.addEventListener('click', () => copy(id));
  });
}

function init(): void {
  bindField('tpl-titleMain', 'titleMain');
  bindField('tpl-titleAccent', 'titleAccent');
  bindField('tpl-desc', 'desc');
  bindField('tpl-goal', 'goal', true);
  bindField('tpl-raised', 'raised', true);
  bindImage('tpl-photo', 'tpl-photo-clear');
  bindColors();
  bindLabels();
  bindActions();
  bindCardFormats();
  bindCardEditors();
  bindFocusHighlight();
  bindDrawer();
  bindStudioLayout();
  render();
  applyColors();
  // keep CANVAS_IDS referenced for clarity / future validation
  void CANVAS_IDS;
}

init();
