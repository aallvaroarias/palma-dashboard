import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbxon9PiTxLibNmihjEGdRoCqYO4YdTEFes88w8Ub2YqDXfZaTPCm1Wk9L0-m-ONXSAh/exec';

/**
 * appsScriptProxy — Vite plugin that intercepts /api/datos in dev mode
 * and forwards the request to the Apps Script URL using Node.js fetch,
 * which correctly follows the 302 redirect to script.googleusercontent.com.
 */
function appsScriptProxy() {
  return {
    name: 'apps-script-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/api/datos')) return next();

        try {
          const parsed = new URL(req.url, 'http://localhost');
          let target = `${APPS_SCRIPT_URL}?sheet=${parsed.searchParams.get('sheet') || ''}`;
          const desde = parsed.searchParams.get('desde');
          const hasta  = parsed.searchParams.get('hasta');
          if (desde) target += `&desde=${desde}`;
          if (hasta)  target += `&hasta=${hasta}`;

          // Node.js fetch follows redirects natively
          const r    = await fetch(target);
          const data = await r.json();

          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify(data));
        } catch (e) {
          console.error('[apps-script-proxy]', e.message);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: e.message }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), appsScriptProxy()],
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
