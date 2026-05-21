const $ = id => document.getElementById(id);

const fmt = v =>
  '$' + Math.abs(+v || 0).toLocaleString('en', {
    maximumFractionDigits: 0
  });

const fmtK = v =>
  (+v || 0) >= 1000
    ? '$' + ((+v) / 1000).toFixed(0) + 'k'
    : '$' + (+v || 0).toFixed(0);

const pct = v => (+v || 0).toFixed(1) + '%';

function norm(v) {
  return String(v || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .replace(/-/g, '');
}

function esBodega(v) {
  const x = norm(v);
  return x.includes('BOD100') || x.includes('BODEGA100') || x === 'BODEGA';
}

function vendedorValido(v) {
  return v && !esBodega(v.cod) && !esBodega(v.nombre);
}

function destroyChart(id) {
  if (window.CHARTS && CHARTS[id]) {
    CHARTS[id].destroy();
    delete CHARTS[id];
  }

  const canvas = $(id);
  if (!canvas) return;

  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();
}
