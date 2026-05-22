/** Format as currency: $1,234 */
export const fmt = (v) =>
  '$' + Math.abs(+v || 0).toLocaleString('en', { maximumFractionDigits: 0 });

/** Format as compact currency: $1k */
export const fmtK = (v) =>
  (+v || 0) >= 1000
    ? '$' + ((+v) / 1000).toFixed(0) + 'k'
    : '$' + (+v || 0).toFixed(0);

/** Format as percentage: 12.3% */
export const pct = (v) => (+v || 0).toFixed(1) + '%';

/** Normalize string: remove accents, spaces, dashes, uppercase */
export const norm = (v) =>
  String(v || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '')
    .replace(/-/g, '');

/** Detect bodega/warehouse accounts */
export const esBodega = (v) => {
  const x = norm(v);
  return x.includes('BOD100') || x.includes('BODEGA100') || x === 'BODEGA';
};

/** Filter out bodega rows */
export const vendedorValido = (v) =>
  v && !esBodega(v.cod) && !esBodega(v.nombre);

/** Get cobertura vendor name from various field name styles */
export const getCoberturaVendedor = (row) =>
  String(row.vendedor ?? row.nombre ?? row.nom_vendedor ?? '').trim();

/** Get cobertura value from various field name styles */
export const getCoberturaValue = (row) =>
  Number(
    row.cobertura ??
    row.cobertura_ ??
    row.cobertura_pct ??
    row['cobertura_%'] ??
    row['cobertura %'] ??
    0
  );

/** Month label from yyyy-mm string */
export const mesLabel = (ym) => {
  if (!ym) return '';
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const parts = String(ym).split('-');
  if (parts.length < 2) return ym;
  const m = parseInt(parts[1], 10) - 1;
  return `${meses[m] || ym} ${parts[0].slice(2)}`;
};

/** Shorten long vendor name */
export const shortNombre = (nombre, max = 18) => {
  if (!nombre) return '';
  return nombre.length > max ? nombre.slice(0, max) + '…' : nombre;
};

/** Today as yyyy-mm-dd */
export const hoy = () => new Date().toISOString().slice(0, 10);

/** n days ago as yyyy-mm-dd */
export const diasAtras = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

/** First day of current month */
export const inicioMes = () => {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
};
