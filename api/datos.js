// Vercel serverless function — proxy + in-memory cache
// Cache fresco: 300 s (5 min).  Stale usado como fallback ante timeout.
// Timeout hacia Apps Script: 9.2 s (límite Vercel Hobby = 10 s).
const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbxfZHGSDF69tdZNPK0tQefVymSFJE2CHNgn9tH85Kbl-_uDuSZVqaLn6-Cr28W3Zawx/exec';

// TTL por sheet (ms). Omitir = usar CACHE_DEFAULT_TTL.
const CACHE_DEFAULT_TTL = 300_000; // 5 min
const CACHE_TTL = {
  // Clientes nuevos sin filtro también se cachea 5 min
  clientes_nuevos: 300_000,
};

const cache = {};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { sheet, desde, hasta } = req.query;

  if (!sheet) {
    return res.status(400).json({ error: 'Missing sheet param' });
  }

  // Clientes_nuevos con rango de fechas = no cachear (resultado variable)
  const esClientesFiltrado = sheet === 'clientes_nuevos' && (desde || hasta);
  if (esClientesFiltrado) {
    res.setHeader('Cache-Control', 'no-store');
  }

  const key = `${sheet}|${desde || ''}|${hasta || ''}`;
  const now = Date.now();
  const ttl = CACHE_TTL[sheet] ?? CACHE_DEFAULT_TTL;

  // Servir caché fresco
  if (!esClientesFiltrado && cache[key] && now - cache[key].ts < ttl) {
    res.setHeader('X-Cache', 'HIT');
    res.setHeader('X-Cache-Age', String(Math.round((now - cache[key].ts) / 1000)) + 's');
    return res.json(cache[key].data);
  }

  try {
    let url = `${APPS_SCRIPT_URL}?sheet=${encodeURIComponent(sheet)}`;
    if (desde) url += `&desde=${encodeURIComponent(desde)}`;
    if (hasta) url += `&hasta=${encodeURIComponent(hasta)}`;

    // 9.2 s — Apps Script con cache caliente responde en <1 s;
    // deja ~0.8 s de margen antes del límite de 10 s de Vercel Hobby.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9200);

    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!r.ok) throw new Error(`Apps Script HTTP ${r.status}`);

    const data = await r.json();
    if (!esClientesFiltrado) cache[key] = { data, ts: now };

    res.setHeader('X-Cache', 'MISS');
    return res.json(data);

  } catch (err) {
    // Timeout o error de red — devolver stale si existe
    if (cache[key]) {
      const staleAge = Math.round((now - cache[key].ts) / 1000);
      console.warn(`[datos.js] Timeout — stale cache para "${sheet}" (${staleAge}s)`);
      res.setHeader('X-Cache', 'STALE');
      res.setHeader('X-Stale-Age', staleAge + 's');
      return res.json(cache[key].data);
    }
    // Sin ningún cache: 504 con fallback_url para que el cliente reintente directo
    console.error(`[datos.js] Error sin cache para "${sheet}":`, err.message);
    return res.status(504).json({
      error: 'timeout',
      fallback_url: `${APPS_SCRIPT_URL}?sheet=${encodeURIComponent(sheet)}`,
    });
  }
}
