const fs   = require('fs');
const path = require('path');

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const filePath = path.join(__dirname, 'historico_clientes_data.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json(data);
  } catch {
    res.json({ mes: null, top_por_vendedor: [], top_global: [] });
  }
};
