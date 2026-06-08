import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH  = path.join(__dirname, 'inventario_data.json');

export default function handler(req, res) {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    res.setHeader('Cache-Control', 's-maxage=0, stale-while-revalidate');
    return res.status(200).json({ ok: true, data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'No se pudo cargar el inventario' });
  }
}
