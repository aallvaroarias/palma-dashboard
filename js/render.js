function renderAll() {
  renderGerencial();
}

function renderGerencial() {
  const r = STATE.resumen;
  if (!r) return;

  $('view-gerencial').innerHTML = `
    <div class="section-title">KPIs Globales</div>

    <div class="kpi-grid">
      <div class="kpi-card blue"><div class="kpi-label">Venta Real</div><div class="kpi-value">${fmt(r.venta_real)}</div></div>
      <div class="kpi-card red"><div class="kpi-label">Devoluciones</div><div class="kpi-value">${fmt(r.devolucion_total)}</div><div class="kpi-sub">${pct(r.pct_devolucion)}</div></div>
      <div class="kpi-card red"><div class="kpi-label">Averías</div><div class="kpi-value">${fmt(r.averia_total || 0)}</div><div class="kpi-sub">${pct(r.pct_averia || 0)}</div></div>
      <div class="kpi-card red"><div class="kpi-label">Total descuentos</div><div class="kpi-value">${fmt(r.descuento_total || 0)}</div><div class="kpi-sub">${pct(r.pct_descuento_total || 0)}</div></div>
      <div class="kpi-card green"><div class="kpi-label">Venta Neta</div><div class="kpi-value">${fmt(r.venta_neta)}</div></div>
      <div class="kpi-card cyan"><div class="kpi-label">Cobertura</div><div class="kpi-value">${pct(r.cobertura_pct)}</div><div class="kpi-sub">${r.clientes_impactados} / ${r.clientes_maestro}</div></div>
      <div class="kpi-card amber"><div class="kpi-label">Ticket Promedio</div><div class="kpi-value">${fmt(r.ticket_promedio)}</div></div>
      <div class="kpi-card purple"><div class="kpi-label">Efectividad</div><div class="kpi-value">${pct(r.efectividad_pct)}</div></div>
    </div>

    <div class="section-title">Análisis Comercial</div>

    <div class="chart-grid">
      <div class="chart-card">
        <div class="chart-header">
          <div>
            <div class="chart-title">Ranking de Vendedores</div>
            <div class="chart-sub">Ordenado por venta neta</div>
          </div>
        </div>
        <div class="chart-wrap" style="height:300px">
          <canvas id="chartRanking"></canvas>
        </div>
      </div>

      <div class="chart-card">
        <div class="chart-header">
          <div>
            <div class="chart-title">Venta por Negocio</div>
            <div class="chart-sub">Venta real del período</div>
          </div>
          <div class="chart-total">${fmt(r.venta_real)}</div>
        </div>
        <div class="chart-wrap" style="height:240px">
          <canvas id="chartNegocio"></canvas>
        </div>
      </div>
    </div>

    <div class="section-title">Detalle por Vendedor</div>

    <div class="table-card">
      <div class="table-header">
        <h3>Ranking Completo</h3>
        <span>${r.periodo || '—'}</span>
      </div>

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Vendedor</th>
            <th style="text-align:right">Venta Real</th>
            <th style="text-align:right">Devol.</th>
            <th style="text-align:right">Dev%</th>
            <th style="text-align:right">Venta Neta</th>
            <th style="text-align:right">Impactos</th>
            <th style="text-align:right">Cobertura</th>
          </tr>
        </thead>
        <tbody>
          ${renderTablaRanking()}
        </tbody>
      </table>
    </div>
  `;

  renderChartRanking(STATE.vendedores);
  renderChartNegocio(r);
}

function renderTablaRanking() {
  return [...STATE.vendedores]
    .sort((a,b) => (b.venta_neta || 0) - (a.venta_neta || 0))
    .map((v,i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${v.cod} - ${v.nombre}</td>
        <td style="text-align:right">${fmt(v.venta_real)}</td>
        <td style="text-align:right" class="down">${fmt(v.devol)}</td>
        <td style="text-align:right">${pct(v.pct_devolucion)}</td>
        <td style="text-align:right" class="down">${fmt(v.devol || 0)}</td>
        <td style="text-align:right" class="down">${fmt(v.averias || 0)}</td>
        <td style="text-align:right" class="up">${fmt(v.venta_neta)}</td>
        <td style="text-align:right">${v.clientes_imp || 0}</td>
        <td style="text-align:right">${pct(v.cobertura)}</td>
      </tr>
    `)
    .join('');
}

function showView(name, btn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

  $('view-' + name).classList.add('active');
  if (btn) btn.classList.add('active');
}

function applyFilters() {
  renderAll();
}
