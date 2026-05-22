const API_URL = 'https://script.google.com/macros/s/AKfycbxon9PiTxLibNmihjEGdRoCqYO4YdTEFes88w8Ub2YqDXfZaTPCm1Wk9L0-m-ONXSAh/exec';
const REFRESH_INTERVAL = 300000;
const COLORS = {
  blue:'#3B82F6', cyan:'#06B6D4', green:'#10B981',
  amber:'#F59E0B', red:'#EF4444', purple:'#8B5CF6'
};
const VEND_COLORS = ['#3B82F6','#10B981','#8B5CF6','#F59E0B','#06B6D4','#EF4444','#14B8A6','#F97316','#6366F1','#EC4899'];
const NEG_COLORS = {
  '01-Carnico':'#3B82F6',
  '02-Galletas':'#10B981',
  '03-Chocolates':'#F59E0B',
  '04-Café':'#8B5CF6',
  '10-TMLUC':'#06B6D4'
};
let STATE = {
  resumen:null,
  vendedores:[],
  cobertura:[],
  cobNegocio:[],
  efectividad:{ por_semana:[], resumen_mes:[] },
  devoluciones:{ total:0, por_concepto:[], por_vendedor:[], detalle:[] },
  clientesCero:{ total:0, por_vendedor:[], detalle:[] },
  clientesNuevos:{ total:0, por_vendedor:[], detalle:[] },
  tendencia:[],
  skus:{ global:[], por_vendedor:[] },
  marcas:[]
};
let CHARTS = {};
let refreshTimer = null;
const $ = id => document.getElementById(id);
const fmt = v => '$' + Math.abs(+v || 0).toLocaleString('en', { maximumFractionDigits:0 });
const fmtK = v => (+v || 0) >= 1000 ? '$' + ((+v)/1000).toFixed(0) + 'k' : '$' + (+v || 0).toFixed(0);
const pct = v => (+v || 0).toFixed(1) + '%';
function norm(v){
  return String(v || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,'')
    .replace(/-/g,'');
}
function esBodega(v){
  const x = norm(v);
  return x.includes('BOD100') || x.includes('BODEGA100') || x === 'BODEGA';
}
function vendedorValido(v){
  return v && !esBodega(v.cod) && !esBodega(v.nombre);
}
function dc(id){
  if (CHARTS[id]) {
    CHARTS[id].destroy();
    delete CHARTS[id];
  }
  const canvas = $(id);
  if (!canvas) return;
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();
}
async function fetchSheet(sheet){
  try {
    const res = await fetch(`${API_URL}?sheet=${sheet}&t=${Date.now()}`);
    const json = await res.json();
    return json.ok ? json.data : null;
  } catch(e) {
    console.error('Error cargando', sheet, e);
    return null;
  }
}
async function loadAll(){
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
  if (cobertura) STATE.cobertura = cobertura.filter(r => !esBodega(getCoberturaVendedor(r)));
  if (cobNegocio) STATE.cobNegocio = cobNegocio.filter(r => !esBodega(getCoberturaVendedor(r)));
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
  const now = new Date().toLocaleTimeString('es-PA', { hour:'2-digit', minute:'2-digit' });
  if ($('lastUpdate')) $('lastUpdate').textContent = `Act. ${now}`;
  if ($('topPeriodo')) $('topPeriodo').textContent = STATE.resumen?.periodo || '—';
  if ($('rankPeriodo')) $('rankPeriodo').textContent = STATE.resumen?.periodo || '—';
  if ($('filterInfo')) $('filterInfo').textContent = `${STATE.vendedores.length} vendedores · ${STATE.resumen?.clientes_maestro || 0} clientes`;
  if (btn) btn.classList.remove('loading');
}
function cargarSelectVendedores(){
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
function renderAll(){
  renderGerencial();
  renderTendencia();
  renderMarcasSkus();
  renderCobertura();
  renderEfectividad();
  renderDevoluciones();
  renderClientes();
  const cod = $('filtroVendedor')?.value;
  if (cod) renderVendedor(cod);
}
function renderGerencial(){
  const r = STATE.resumen;
  if (!r) return;
  $('kVenta').textContent = fmt(r.venta_bruta ?? r.venta_real ?? 0);
  $('kDevol').textContent = fmt(r.devolucion_total || 0);
  if ($('kAverias')) $('kAverias').textContent = fmt(r.averia_total || 0);
  if ($('kDescuentoTotal')) $('kDescuentoTotal').textContent = fmt(r.descuento_total || 0);
  $('kDevolPct').innerHTML = `<span class="down">${pct(r.pct_devolucion)}</span> de venta bruta`;
  $('kNeta').textContent = fmt(r.venta_neta || 0);
  $('kCob').textContent = pct(r.cobertura_pct || 0);
  $('kCobSub').textContent = `${r.clientes_impactados} / ${r.clientes_maestro}`;
  $('kCobBar').style.width = Math.min(r.cobertura_pct || 0, 100) + '%';
  $('kTicket').textContent = fmt(r.ticket_promedio);
  $('kEfect').textContent = pct(r.efectividad_pct);
  const vs = [...STATE.vendedores].sort((a,b) => (b.venta_neta || 0) - (a.venta_neta || 0));
  dc('chartRanking');
  CHARTS.ranking = new Chart($('chartRanking'), {
    type:'bar',
    data:{
      labels:vs.map(v => v.nombre),
      datasets:[{
        label:'Venta neta',
        data:vs.map(v => v.venta_neta || 0),
        backgroundColor:vs.map((_,i) => VEND_COLORS[i % VEND_COLORS.length] + 'CC'),
        borderRadius:4
      }]
    },
    options:{
      indexAxis:'y',
      responsive:true,
      maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c => fmt(c.raw)}} },
      scales:{
        x:{ ticks:{callback:fmtK,color:'#94A3B8'}, grid:{color:'rgba(148,163,184,.08)'} },
        y:{ ticks:{color:'#94A3B8'}, grid:{display:false} }
      }
    }
  });
  dc('chartNegocio');
  const neg = r.venta_por_negocio || [];
  $('totalNegocio').textContent = fmt(r.venta_real);
  CHARTS.negocio = new Chart($('chartNegocio'), {
    type:'doughnut',
    data:{
      labels:neg.map(n => n.negocio),
      datasets:[{
        data:neg.map(n => n.venta),
        backgroundColor:neg.map(n => (NEG_COLORS[n.negocio] || '#64748B') + 'CC'),
        borderColor:'#121F35',
        borderWidth:2
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      cutout:'62%',
      plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c => `${c.label}: ${fmt(c.raw)}`}} }
    }
  });
  $('legendNegocio').innerHTML = neg.map(n =>
    `<span class="legend-item"><span class="legend-dot" style="background:${NEG_COLORS[n.negocio] || '#64748B'}"></span>${n.negocio}</span>`
  ).join('');
  renderTablaRanking(vs);
  renderAlertas();
}
function renderTablaRanking(vs){
  $('tbRanking').innerHTML = vs.map((v,i) => {
    const devPct = v.pct_devolucion ?? (v.venta_real > 0 ? (v.devol / v.venta_real * 100) : 0);
    const cob = +v.cobertura || 0;
    const estado = cob >= 75
      ? '<span class="badge badge-green">En meta</span>'
      : cob >= 60
      ? '<span class="badge badge-amber">Cerca</span>'
      : '<span class="badge badge-red">Bajo meta</span>';
    return `<tr>
      <td>${i + 1}</td>
      <td>${v.cod} - ${v.nombre}</td>
      <td style="text-align:right"><span class="mono">${fmt(v.venta_real)}</span></td>
      <td style="text-align:right"><span class="mono down">${fmt(v.devol)}</span></td>
      <td style="text-align:right">${pct(devPct)}</td>
      <td style="text-align:right"><span class="mono up">${fmt(v.venta_neta)}</span></td>
      <td style="text-align:right">${v.maestro || 0}</td>
      <td style="text-align:right">${v.clientes_imp || 0}</td>
      <td style="text-align:right">${pct(v.cobertura)}</td>
      <td>${estado}</td>
    </tr>`;
  }).join('');
}
function renderAlertas(){
  const r = STATE.resumen;
  const alerts = [];
  STATE.vendedores.forEach(v => {
    if ((+v.cobertura || 0) < 65) alerts.push({type:'alert-red', msg:`🔴 <strong>${v.nombre}</strong> cobertura crítica: ${pct(v.cobertura)}`});
    else if ((+v.cobertura || 0) < 75) alerts.push({type:'alert-amber', msg:`⚠ <strong>${v.nombre}</strong> bajo meta: ${pct(v.cobertura)}`});
  });
  if ((+r.pct_devolucion || 0) > 10) {
    alerts.push({type:'alert-amber', msg:`⚠ <strong>Devoluciones altas:</strong> ${pct(r.pct_devolucion)} de la venta real`});
  }
  if (!alerts.length) alerts.push({type:'alert-green', msg:'✅ <strong>Sin alertas críticas</strong>'});
  $('alertGrid').innerHTML = alerts.slice(0,6).map(a => `<div class="alert ${a.type}">${a.msg}</div>`).join('');
}

function renderChartsVendedor(v) {
  if (!v) return;

  const negocios = Array.isArray(v.venta_por_negocio) ? v.venta_por_negocio : [];

  dc('chartVendNeg');

  if ($('chartVendNeg')) {
    CHARTS.vendNeg = new Chart($('chartVendNeg'), {
      type: 'doughnut',
      data: {
        labels: negocios.map(n => n.negocio),
        datasets: [{
          data: negocios.map(n => n.venta || 0),
          backgroundColor: negocios.map(n => (NEG_COLORS[n.negocio] || '#64748B') + 'CC'),
          borderColor: '#121F35',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#94A3B8', boxWidth: 10, font: { size: 10 } }
          },
          tooltip: {
            callbacks: {
              label: c => `${c.label}: ${fmt(c.raw)}`
            }
          }
        }
      }
    });
  }

  dc('chartVendCob');

  const equipoCob = STATE.vendedores.length
    ? STATE.vendedores.reduce((s, x) => s + (+x.cobertura || 0), 0) / STATE.vendedores.length
    : 0;

  if ($('chartVendCob')) {
    CHARTS.vendCob = new Chart($('chartVendCob'), {
      type: 'bar',
      data: {
        labels: ['Mi cobertura', 'Promedio equipo', 'Meta'],
        datasets: [{
          data: [
            +v.cobertura || 0,
            equipoCob,
            75
          ],
          backgroundColor: [
            COLORS.blue + 'CC',
            COLORS.green + 'CC',
            COLORS.red + 'CC'
          ],
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: c => pct(c.raw)
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: { callback: v => v + '%', color: '#94A3B8' },
            grid: { color: 'rgba(148,163,184,.08)' }
          },
          x: {
            ticks: { color: '#94A3B8' },
            grid: { display: false }
          }
        }
      }
    });
  }
}


function renderVendedor(cod){
  const v = STATE.vendedores.find(x => String(x.cod) === String(cod));
  if (!v) return;
  const devPct = v.pct_devolucion ?? (v.venta_real > 0 ? (v.devol / v.venta_real * 100) : 0);
  $('vendKpis').innerHTML = `
    <div class="kpi-card blue"><div class="kpi-label">Venta Real</div><div class="kpi-value">${fmt(v.venta_real)}</div></div>
    <div class="kpi-card red"><div class="kpi-label">Devoluciones</div><div class="kpi-value">${fmt(v.devol)}</div><div class="kpi-sub">${pct(devPct)}</div></div>
    <div class="kpi-card green"><div class="kpi-label">Venta Neta</div><div class="kpi-value">${fmt(v.venta_neta)}</div></div>
    <div class="kpi-card cyan"><div class="kpi-label">Impactos</div><div class="kpi-value">${v.clientes_imp || 0}</div><div class="kpi-sub">de ${v.maestro || 0}</div></div>
    <div class="kpi-card purple"><div class="kpi-label">Cobertura</div><div class="kpi-value">${pct(v.cobertura)}</div></div>
  `;
  renderChartsVendedor(v);

  $('vendAlerts').innerHTML = `
    <div class="alert ${devPct > 10 ? 'alert-red' : 'alert-green'}">
      <strong>Devoluciones</strong>${pct(devPct)} de la venta real
    </div>
    <div class="alert ${v.cobertura >= 75 ? 'alert-green' : 'alert-amber'}">
      <strong>Cobertura</strong>${pct(v.cobertura)}
    </div>
  `;
  const skus = STATE.skus.por_vendedor.find(x => String(x.cod) === String(cod));
  $('tbVendSkus').innerHTML = (skus?.skus || []).map((s,i) => `
    <tr>
      <td>${i+1}</td>
      <td>${s.nombre || s.sku}</td>
      <td>${s.negocio || ''}</td>
      <td style="text-align:right">${fmt(s.venta)}</td>
      <td style="text-align:right">${s.clientes}</td>
    </tr>
  `).join('');
}
function renderTendencia(){
  if (!STATE.tendencia.length) return;
  dc('chartTendencia');
  CHARTS.tendencia = new Chart($('chartTendencia'), {
    type:'bar',
    data:{
      labels:STATE.tendencia.map(x => `Sem ${x.semana}`),
      datasets:[{
        label:'Venta real',
        data:STATE.tendencia.map(x => x.venta),
        backgroundColor:COLORS.blue + 'CC',
        borderRadius:4
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{ tooltip:{callbacks:{label:c => fmt(c.raw)}} },
      scales:{ y:{ticks:{callback:fmtK,color:'#94A3B8'}}, x:{ticks:{color:'#94A3B8'}} }
    }
  });
}
function renderMarcasSkus(){
  $('tbMarcas').innerHTML = STATE.marcas.slice(0,10).map(m => `
    <tr>
      <td>${m.marca}</td>
      <td>${m.negocio}</td>
      <td style="text-align:right">${fmt(m.venta)}</td>
      <td style="text-align:right">${m.pct}%</td>
      <td style="text-align:right">${m.clientes}</td>
    </tr>
  `).join('');
  $('tbSkus').innerHTML = STATE.skus.global.slice(0,15).map(s => `
    <tr>
      <td>${s.nombre || s.sku}</td>
      <td>${s.negocio}</td>
      <td style="text-align:right">${fmt(s.venta)}</td>
      <td style="text-align:right">${s.clientes}</td>
    </tr>
  `).join('');
}

function getCoberturaValue(row) {
  return Number(row.cobertura ?? row.cobertura_ ?? row.cobertura_pct ?? row['cobertura_%'] ?? row['cobertura %'] ?? 0);
}

function getCoberturaVendedor(row) {
  return String(row.vendedor ?? row.nombre ?? row.nom_vendedor ?? '').trim();
}


function renderCobertura(){
  const data = (STATE.cobertura || [])
    .filter(r => getCoberturaValue(r) > 0)
    .sort((a,b) => getCoberturaValue(b) - getCoberturaValue(a));

  $('tbCobertura').innerHTML = data.map(r => `
    <tr>
      <td>${getCoberturaVendedor(r)}</td>
      <td style="text-align:right">${r.clientes_maestro || 0}</td>
      <td style="text-align:right">${r.impactados || 0}</td>
      <td style="text-align:right">${pct(getCoberturaValue(r))}</td>
      <td style="text-align:right">${r.sin_compra || 0}</td>
    </tr>
  `).join('');

  dc('chartCobertura');

  if ($('chartCobertura') && data.length) {
    CHARTS.cobertura = new Chart($('chartCobertura'), {
      type: 'bar',
      data: {
        labels: data.map(r => getCoberturaVendedor(r)),
        datasets: [{
          label: 'Cobertura real',
          data: data.map(r => getCoberturaValue(r)),
          backgroundColor: COLORS.blue + 'CC',
          borderRadius: 6
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: c => `${pct(c.raw)}`
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            max: 100,
            ticks: {
              callback: v => v + '%',
              color: '#94A3B8'
            },
            grid: { color: 'rgba(148,163,184,.08)' }
          },
          y: {
            ticks: { color: '#94A3B8' },
            grid: { display: false }
          }
        }
      }
    });
  }

  $('totalCero').textContent = `${STATE.clientesCero.total || 0} clientes`;
  $('tbCero').innerHTML = (STATE.clientesCero.por_vendedor || []).map(r => `
    <tr><td>${getCoberturaVendedor(r)}</td><td style="text-align:right">${r.cantidad}</td></tr>
  `).join('');
}
function renderEfectividad(){
  const data = STATE.efectividad.resumen_mes || [];
  if (!data.length) return;
  const efField = Object.keys(data[0]).find(k => k.includes('efectividad')) || 'efectividad';
  dc('chartEfect');
  CHARTS.efect = new Chart($('chartEfect'), {
    type:'bar',
    data:{
      labels:data.map(r => getCoberturaVendedor(r)),
      datasets:[{
        data:data.map(r => +r[efField] || 0),
        backgroundColor:COLORS.green + 'CC',
        borderRadius:4
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{ y:{ticks:{callback:v => v+'%',color:'#94A3B8'}}, x:{ticks:{color:'#94A3B8'}} }
    }
  });
  $('tbEfectividad').innerHTML = (STATE.efectividad.por_semana || []).slice(0,50).map(r => `
    <tr>
      <td>${getCoberturaVendedor(r)}</td>
      <td style="text-align:right">${r.semana || ''}</td>
      <td style="text-align:right">${r.impactos || 0}</td>
      <td style="text-align:right">${r.maestra || 0}</td>
      <td style="text-align:right">${pct(r.efectividad)}</td>
    </tr>
  `).join('');
}
function renderDevoluciones(){
  const d = STATE.devoluciones;
  if (!d.por_concepto.length && !d.por_vendedor.length) return;
  dc('chartDevConcepto');
  CHARTS.devConcepto = new Chart($('chartDevConcepto'), {
    type:'bar',
    data:{
      labels:d.por_concepto.slice(0,8).map(x => x.concepto),
      datasets:[{data:d.por_concepto.slice(0,8).map(x => x.monto), backgroundColor:COLORS.red + 'CC'}]
    },
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}}
  });
  dc('chartDevVend');
  CHARTS.devVend = new Chart($('chartDevVend'), {
    type:'bar',
    data:{
      labels:d.por_vendedor.map(x => x.vendedor),
      datasets:[{data:d.por_vendedor.map(x => x.monto), backgroundColor:COLORS.amber + 'CC'}]
    },
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}}
  });
}
function renderClientes(){
  $('kNuevos').textContent = STATE.clientesNuevos.total || 0;
  $('kCeroCount').textContent = STATE.clientesCero.total || 0;
  $('kMaestro').textContent = STATE.resumen?.clientes_maestro || 0;
  $('tbNuevosVend').innerHTML = STATE.clientesNuevos.por_vendedor.map(v => `
    <tr><td>${v.vendedor}</td><td style="text-align:right">${v.cantidad}</td></tr>
  `).join('');
  $('tbNuevosLista').innerHTML = STATE.clientesNuevos.detalle.slice(0,30).map(c => `
    <tr><td>${c.asesor}</td><td>${c.nombre || c.razon_social}</td><td>${c.fecha_creacion}</td></tr>
  `).join('');
}
function applyFilters(){
  const cod = $('filtroVendedor').value;
  if (cod) {
    showView('vendedor', document.querySelector('.nav-tab:nth-child(2)'));
    renderVendedor(cod);
  } else {
    showView('gerencial', document.querySelector('.nav-tab:nth-child(1)'));
    renderGerencial();
  }
}
function showView(name, btn){
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  $('view-' + name).classList.add('active');
  if (btn) btn.classList.add('active');
}
document.addEventListener('DOMContentLoaded', () => {
  loadAll();
  refreshTimer = setInterval(loadAll, REFRESH_INTERVAL);
});
window.addEventListener('beforeunload', () => clearInterval(refreshTimer));