import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAP_PATH  = path.join(__dirname, 'nomina_map.json');

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { cedula, clave } = req.body || {};

  if (!cedula || !clave) {
    return res.status(400).json({ error: 'Cédula y clave requeridas' });
  }

  // Verificar clave (configurar NOMINA_CLAVE en Vercel env vars)
  const CLAVE_CORRECTA = process.env.NOMINA_CLAVE || 'Palumar2026';
  if (clave.trim() !== CLAVE_CORRECTA) {
    return res.status(401).json({ error: 'Clave incorrecta' });
  }

  // Buscar cédula en el mapa
  let map = {};
  try {
    map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
  } catch (e) {
    return res.status(500).json({ error: 'Error cargando datos de nómina' });
  }

  const cedNorm = cedula.trim().toUpperCase();
  const entry   = map[cedNorm];

  if (!entry) {
    return res.status(404).json({ error: 'Cédula no encontrada en la nómina' });
  }

  return res.status(200).json({
    ok:      true,
    nombre:  entry.nombre,
    url:     `/nomina/${entry.hash}.pdf`,
  });
}
