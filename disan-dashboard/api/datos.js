// Vercel serverless function — lee de Supabase
// DISAN · Distribuciones Santiago De Tunja S.A.S

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kgkrxlbkjbcqukyipblr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtna3J4bGJramJjcXVreWlwYmxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NDY3MDgsImV4cCI6MjA5NjAyMjcwOH0.zUAosMD7GP5FPCOO5GNfG1gPUu_VT8jE22SMudtN1w8';

const cache = {};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { sheet } = req.query;
  if (!sheet) return res.status(400).json({ error: 'Missing sheet param' });

  const now = Date.now();
  if (cache[sheet] && now - cache[sheet].ts < 60000) {
    res.setHeader('X-Cache', 'HIT');
    return res.json(cache[sheet].data);
  }

  try {
    const url = `${SUPABASE_URL}/rest/v1/cache_api?sheet=eq.${encodeURIComponent(sheet)}&select=data`;
    const r = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      }
    });

    if (!r.ok) throw new Error(`Supabase responded ${r.status}`);

    const rows = await r.json();
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: `Sheet '${sheet}' not found` });
    }

    const data = rows[0].data;
    cache[sheet] = { data, ts: now };

    res.setHeader('X-Cache', 'MISS');
    return res.json(data);

  } catch (err) {
    console.error('[datos.js] Error:', sheet, err.message);
    return res.status(502).json({ error: 'Upstream error', details: err.message });
  }
}
