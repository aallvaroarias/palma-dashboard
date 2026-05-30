// Vercel serverless function — proxy + in-memory cache 60s
const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbxon9PiTxLibNmihjEGdRoCqYO4YdTEFes88w8Ub2YqDXfZaTPCm1Wk9L0-m-ONXSAh/exec';

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

  // clientes_nuevos con filtro de fecha: nunca cachear en el servidor
  // para que el usuario siempre obtenga datos frescos al cambiar el rango
  const esClientesFiltrado = sheet === 'clientes_nuevos' && (desde || hasta);
  if (esClientesFiltrado) {
    res.setHeader('Cache-Control', 'no-store');
  }

  const key = `${sheet}|${desde || ''}|${hasta || ''}`;
  const now = Date.now();

  if (!esClientesFiltrado && cache[key] && now - cache[key].ts < 60000) {
    res.setHeader('X-Cache', 'HIT');
    return res.json(cache[key].data);
  }

  try {
    let url = `${APPS_SCRIPT_URL}?sheet=${encodeURIComponent(sheet)}`;
    if (desde) url += `&desde=${encodeURIComponent(desde)}`;
    if (hasta) url += `&hasta=${encodeURIComponent(hasta)}`;

    const r = await fetch(url);
    if (!r.ok) {
      throw new Error(`Apps Script responded ${r.status}`);
    }

    const data = await r.json();
    cache[key] = { data, ts: now };

    res.setHeader('X-Cache', 'MISS');
    return res.json(data);
  } catch (err) {
    console.error('[datos.js] Error fetching sheet:', sheet, err.message);
    return res.status(502).json({ error: 'Upstream error', details: err.message });
  }
}
