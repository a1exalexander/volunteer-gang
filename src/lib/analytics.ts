// Lightweight client-side analytics wiring. Every function is a no-op when
// GA hasn't loaded (no PUBLIC_GA_ID, or consent not granted), so it is always
// safe to call.

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export function trackEvent(name: string, params: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('event', name, params);
}

/**
 * Wire click tracking for any element carrying `data-track="<event>"`.
 * `data-evt-*` attributes become event params, e.g.
 * `data-evt-cta-location="hero"` -> `{ cta_location: 'hero' }`.
 */
export function initAnalytics(): void {
  if (typeof document === 'undefined') return;
  document.querySelectorAll<HTMLElement>('[data-track]').forEach((el) => {
    el.addEventListener('click', () => {
      const name = el.dataset.track || 'click';
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(el.dataset)) {
        if (k.startsWith('evt') && v != null) {
          const key = k
            .replace(/^evt/, '')
            .replace(/([A-Z])/g, '_$1')
            .toLowerCase()
            .replace(/^_/, '');
          if (key) params[key] = v;
        }
      }
      trackEvent(name, params);
    });
  });
}
