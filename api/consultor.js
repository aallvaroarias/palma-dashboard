// Vercel serverless function — Consultor IA con Gemini
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const { pregunta, contexto } = body;
  if (!pregunta) return res.status(400).json({ error: 'Falta la pregunta' });

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) return res.status(500).json({ error: 'API key no configurada' });

  const systemPrompt = `Eres el consultor de ventas de Distribuciones Palumar, una distribuidora de alimentos en Panamá.
Tu rol es responder preguntas del equipo comercial usando los datos reales del período actual que se te proporcionan.

REGLAS:
- Responde siempre en español, de forma clara y directa.
- Usa los datos del contexto para dar números exactos.
- Si no encuentras el dato específico, dilo honestamente.
- Usa formato limpio: listas, números, porcentajes según corresponda.
- Sé conciso pero completo. Máximo 3-4 párrafos o listas cortas.
- Si preguntan por un código de cliente o SKU que no está en el top, dilo claramente.
- Trata al usuario de tú, de forma cercana y profesional.

DATOS ACTUALES DE PALUMAR:
${contexto || 'Sin datos disponibles'}`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: systemPrompt + '\n\nPREGUNTA DEL USUARIO: ' + pregunta }]
            }
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1024,
          }
        })
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      console.error('[consultor] Gemini error:', err);
      return res.status(502).json({ error: 'Error al contactar Gemini', details: err });
    }

    const data = await geminiRes.json();
    const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Sin respuesta';
    return res.json({ respuesta: texto });

  } catch (err) {
    console.error('[consultor] Error:', err.message);
    return res.status(500).json({ error: 'Error interno', details: err.message });
  }
}
