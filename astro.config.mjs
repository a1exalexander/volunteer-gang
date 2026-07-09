// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

// Astro 6's dev server doesn't auto-serve index.html from public/ subdirectories,
// so /admin/ 404s in dev even though public/admin/index.html exists. Netlify
// handles directory indexes in production, so this rewrite is dev-only.
const serveAdminIndex = {
  name: 'serve-admin-index',
  /** @param {import('vite').ViteDevServer} server */
  configureServer(server) {
    server.middlewares.use((/** @type {any} */ req, /** @type {any} */ _res, /** @type {any} */ next) => {
      if (req.url === '/admin' || req.url === '/admin/') {
        req.url = '/admin/index.html';
      }
      next();
    });
  },
};

// https://astro.build/config
export default defineConfig({
  // Used to build absolute URLs for canonical + og:image meta, the sitemap,
  // robots.txt, and JSON-LD structured data. Override via SITE env var when needed.
  site: process.env.SITE || 'https://volunteer-gang.netlify.app',
  integrations: [
    react(),
    // Generates /sitemap-index.xml + /sitemap-0.xml from all built HTML pages.
    // The /admin SPA is excluded; non-HTML routes (og/*.png, robots.txt) are
    // skipped automatically.
    sitemap({ filter: (page) => !page.includes('/admin') && !page.includes('/brand') }),
  ],
  vite: {
    plugins: [serveAdminIndex],
  },
});
