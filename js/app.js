let STATE = {
  resumen: null,
  vendedores: [],
  cobertura: [],
  cobNegocio: [],
  efectividad: { por_semana: [], resumen_mes: [] },
  devoluciones: { total: 0, por_concepto: [], por_vendedor: [], detalle: [] },
  clientesCero: { total: 0, por_vendedor: [], detalle: [] },
  clientesNuevos: { total: 0, por_vendedor: [], detalle: [] },
  tendencia: [],
  skus: { global: [], por_vendedor: [] },
  marcas: []
};

let refreshTimer = null;

async function loadAll() {
  const btn = $('refreshBtn');
  if (btn) btn.classList.add('loading');

  const [
    resumen,
    vendedores,
    cobertura,
    cobNegocio,
    efectividad,
    devoluciones,
    cero,
    nuevos,
    tendencia,
    skus,
    marcas
  ] = await Promise.all([
    fetchSheet('resumen'),
    fetchSheet('vendedores'),
    fetchSheet('cobertura'),
    fetchSheet('cob_negocio'),
    fetchSheet('efectividad'),
    fetchSheet('devoluciones'),
    fetchSheet('clientes_cero'),
    fetchSheet('clientes_nuevos'),
    fetchSheet('tendencia'),
    fetchSheet('skus'),
    fetchSheet('marcas')
  ]);

  if (resumen) STATE.resumen = resumen;
  if (vendedores) STATE.vendedores = vendedores.filter(vendedorValido);
  if (cobertura) STATE.cobertura = cobertura;
  if (cobNegocio) STATE.cobNegocio = cobNegocio;
  if (efectividad) STATE.efectividad = efectividad;
  if (devoluciones) STATE.devoluciones = devoluciones;
  if (cero) STATE.clientesCero = cero;
  if (nuevos) STATE.clientesNuevos = nuevos;
  if (tendencia) STATE.tendencia = tendencia;
  if (skus) STATE.skus = skus;
  if (marcas) STATE.marcas = marcas;

  cargarSelectVendedores();
  renderAll();

  $('loadingOverlay')?.classList.add('hidden');

  setTimeout(() => {
    if ($('loadingOverlay')) $('loadingOverlay').style.display = 'none';
  }, 500);

  const now = new Date().toLocaleTimeString('es-PA', {
    hour: '2-digit',
    minute: '2-digit'
  });

  if ($('lastUpdate')) $('lastUpdate').textContent = `Act. ${now}`;
  if ($('topPeriodo')) $('topPeriodo').textContent = STATE.resumen?.periodo || '—';
  if ($('filterInfo')) {
    $('filterInfo').textContent =
      `${STATE.vendedores.length} vendedores · ${STATE.resumen?.clientes_maestro || 0} clientes`;
  }

  if (btn) btn.classList.remove('loading');
}

function cargarSelectVendedores() {
  const sel = $('filtroVendedor');
  if (!sel) return;

  const actual = sel.value;
  sel.innerHTML = '<option value="">Todos los vendedores</option>';

  STATE.vendedores.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.cod;
    opt.textContent = `${v.cod} - ${v.nombre}`;
    sel.appendChild(opt);
  });

  if (actual) sel.value = actual;
}

document.addEventListener('DOMContentLoaded', () => {
  loadAll();
  refreshTimer = setInterval(loadAll, REFRESH_INTERVAL);
});

window.addEventListener('beforeunload', () => {
  clearInterval(refreshTimer);
});
