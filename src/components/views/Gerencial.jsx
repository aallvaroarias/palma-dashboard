import React, { useMemo, useState, useCallback } from 'react';
import useDashboardStore from '../../store/dashboardStore';
import KpiCard from '../ui/KpiCard';
import SectionTitle from '../ui/SectionTitle';
import HBarChart from '../charts/HBarChart';
import LineChart from '../charts/LineChart';
import {
  fmt, fmtK, pct,
  getCoberturaVendedor, getCoberturaValue, esRutaCentral,
} from '../../utils/formatters';
import { VEND_COLORS } from '../../utils/colors';

function AlertItem({ type, children }) {
  return (
    <div className={`alert-item ${type}`}>
      {children}
    </div>
  );
}

export default function Gerencial() {
  const {
    resumen: r,
    vendedores,
    cobertura,
    cobNegocio,
    efectividad,
    clientesNuevos,
    clientesCero,
    tendencia,
    marcas,
    skus,
    topClientes,
    refetchClientes,
  } = useDashboardStore();

  const [negocioFiltro, setNegocioFiltro] = useState('');
  const [vendedorTop10, setVendedorTop10] = useState('');
  const [ceroVendSel, setCeroVendSel] = useState('');
  const [loadingNuevosG, setLoadingNuevosG] = useState(false);
  const [filtroNuevosLabel, setFiltroNuevosLabel] = useState('Este período');

  const applyNuevosG = useCallback(async (desde, hasta, label) => {
    setLoadingNuevosG(true);
    setFiltroNuevosLabel(label);
    try { await refetchClientes(desde || undefined, hasta || undefined); }
    finally { setLoadingNuevosG(false); }
  }, [refetchClientes]);

  // Quick filter helpers
  const hoy = new Date();
  const primerDiaMes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
  const hoyStr = hoy.toISOString().slice(0, 10);
  const hace30 = new Date(hoy); hace30.setDate(hoy.getDate() - 30);
  const hace30Str = hace30.toISOString().slice(0, 10);

  // Detalle de clientes cero del vendedor seleccionado
  const ceroVendDetalle = useMemo(() => {
    if (!ceroVendSel) return [];
    return (clientesCero.detalle || []).filter(c =>
      String(c.vendedor || '').trim() === ceroVendSel
    );
  }, [clientesCero, ceroVendSel]);

  const vs = useMemo(
    () => [...vendedores].sort((a, b) => (b.venta_neta || 0) - (a.venta_neta || 0)),
    [vendedores]
  );

  const cobData = useMemo(
    () =>
      [...cobertura]
        .filter(r2 => getCoberturaValue(r2) > 0)
        .sort((a, b) => getCoberturaValue(b) - getCoberturaValue(a)),
    [cobertura]
  );

  // Efectividad — excluir Ruta Centrales
  const efData = useMemo(
    () => (efectividad.resumen_mes || []).filter(r2 => !esRutaCentral(getCoberturaVendedor(r2))),
    [efectividad]
  );

  const efField = useMemo(() => {
    if (!efData.length) return 'efectividad';
    return Object.keys(efData[0]).find(k => k.includes('efectividad')) || 'efectividad';
  }, [efData]);

  // Negocio options for dropdown
  const negocios = useMemo(() => {
    const set = new Set();
    cobNegocio.forEach(r2 => r2.negocio && set.add(r2.negocio));
    return [...set].sort();
  }, [cobNegocio]);

  // Pivot: cobertura por negocio filtrada
  const cobNegFiltrada = useMemo(() => {
    if (!negocioFiltro) return [];
    return cobNegocio.filter(r2 => r2.negocio === negocioFiltro);
  }, [cobNegocio, negocioFiltro]);

  // Mapa nombre→venta_neta para mostrar $ junto a cobertura por vendedor
  const vendVentaMap = useMemo(() => {
    const map = {};
    vendedores.forEach(v => { if (v.nombre) map[v.nombre] = v.venta_neta || 0; });
    return map;
  }, [vendedores]);

  // Mapa nombre→venta en el negocio seleccionado (para cobertura por negocio)
  const cobNegVentaMap = useMemo(() => {
    if (!negocioFiltro) return {};
    const map = {};
    vendedores.forEach(v => {
      const n = (v.venta_por_negocio || []).find(x => x.negocio === negocioFiltro);
      if (v.nombre) map[v.nombre] = n ? (n.venta || 0) : 0;
    });
    return map;
  }, [vendedores, negocioFiltro]);

  const promEquipoCob = useMemo(() => {
    if (!cobData.length) return 0;
    return cobData.reduce((s, r2) => s + getCoberturaValue(r2), 0) / cobData.length;
  }, [cobData]);

  // Venta NETA por negocio — filtrar negocios con venta > 0, ordenar desc
  const neg = useMemo(
    () => [...(r?.venta_por_negocio || [])]
      .filter(n => n.venta > 0)
      .sort((a, b) => b.venta - a.venta),
    [r]
  );

  // Alerts
  const alerts = useMemo(() => {
    const list = [];
    vendedores.forEach(v => {
      const c = +v.cobertura || 0;
      if (c < 75) list.push({ type: 'alert-red', msg: `Cobertura crítica: ${v.nombre} (${pct(c)})` });
      else if (c < 95) list.push({ type: 'alert-amber', msg: `Bajo meta: ${v.nombre} (${pct(c)})` });
    });
    if ((+r?.pct_devolucion || 0) > 10) {
      list.push({ type: 'alert-amber', msg: `Devoluciones altas: ${pct(r.pct_devolucion)} de venta real` });
    }
    if (!list.length) list.push({ type: 'alert-green', msg: 'Sin alertas críticas' });
    return list.slice(0, 6);
  }, [vendedores, r]);

  if (!r) {
    return (
      <div className="flex items-center justify-center h-64 text-palumar-muted text-sm">
        Cargando datos...
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* ── KPIs ── */}
      <SectionTitle>KPIs Globales</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 tv:grid-cols-5 gap-3 mb-6">
        <KpiCard label="Venta Bruta" value={fmt(r.venta_bruta ?? r.venta_real ?? 0)} color="blue" />
        <KpiCard
          label="Devoluciones"
          value={fmt(r.devolucion_total || 0)}
          sub={`<span style="color:var(--red)">${pct(r.pct_devolucion)}</span> de venta bruta`}
          color="red"
        />
        <KpiCard
          label="Averías"
          value={fmt(r.averia_total || 0)}
          sub={pct(r.pct_averia || 0)}
          color="red"
        />
        <KpiCard
          label="Descuentos"
          value={fmt(r.descuento_total || 0)}
          sub={pct(r.pct_descuento_total || 0)}
          color="amber"
        />
        <KpiCard label="Venta Neta" value={fmt(r.venta_neta || 0)} color="green" />
        <KpiCard
          label="Cobertura"
          value={pct(r.cobertura_pct || 0)}
          sub={`${r.clientes_impactados} / ${r.clientes_maestro}`}
          color="cyan"
          barValue={r.cobertura_pct || 0}
        />
        <KpiCard label="Ticket Promedio" value={fmt(r.ticket_promedio)} color="blue" />
        <KpiCard
          label="Efectividad"
          value={pct(r.efectividad_pct)}
          color="purple"
          barValue={r.efectividad_pct || 0}
        />
        {r.cuota && (
          <KpiCard
            label="Cuota"
            value={fmt(r.cuota)}
            sub={`${pct(r.pct_cumplimiento_equipo || 0)} cumplimiento`}
            color="gold"
            barValue={r.pct_cumplimiento_equipo || 0}
          />
        )}
      </div>

      {/* ── Venta por Negocio ── */}
      {neg.length > 0 && (
        <>
          <SectionTitle>Venta por Negocio</SectionTitle>
          <div className="chart-card mb-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-palumar-muted" style={{ fontSize: '11px' }}>
                Venta neta del período · ordenado de mayor a menor
              </span>
              <span className="font-mono-num font-bold text-palumar-white" style={{ fontSize: '17px' }}>
                {fmt(r.venta_neta ?? 0)}
              </span>
            </div>
            <HBarChart
              labels={neg.map(n => n.negocio)}
              data={neg.map(n => n.venta)}
              barColors={neg.map((_, i) => VEND_COLORS[i % VEND_COLORS.length])}
              minH={120}
              rowH={36}
            />
          </div>
        </>
      )}

      {/* ── Clientes Sin Compra ── */}
      {(clientesCero.total > 0) && (
        <>
          <SectionTitle>Clientes Sin Compra</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <KpiCard
              label="Sin compra este período"
              value={String(clientesCero.total || 0)}
              color="red"
            />
            {(clientesCero.por_vendedor || []).length > 0 && (
              <KpiCard
                label="Vendedor c/más ceros"
                value={clientesCero.por_vendedor[0]?.vendedor?.split(' ')[0] || '—'}
                sub={`${clientesCero.por_vendedor[0]?.cantidad} clientes`}
                color="amber"
              />
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* Resumen por vendedor */}
            <div className="table-card">
              <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-2)' }}>
                <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>
                  Resumen por Vendedor
                </h3>
                <span className="text-palumar-muted" style={{ fontSize: '11px' }}>
                  {(clientesCero.por_vendedor || []).length} vendedores
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="palma-table">
                  <thead>
                    <tr>
                      <th>Vendedor</th>
                      <th style={{ textAlign: 'right' }}>Clientes cero</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(clientesCero.por_vendedor || []).map((row, i) => (
                      <tr
                        key={i}
                        className="cursor-pointer"
                        style={{ background: ceroVendSel === row.vendedor ? 'rgba(26,127,166,0.08)' : '' }}
                        onClick={() => setCeroVendSel(ceroVendSel === row.vendedor ? '' : row.vendedor)}
                      >
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: VEND_COLORS[i % VEND_COLORS.length] }} />
                            {row.vendedor}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ color: 'var(--red)', fontWeight: 700 }}>{row.cantidad}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Detalle del vendedor seleccionado */}
            <div className="table-card">
              <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-2)' }}>
                <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>
                  {ceroVendSel ? `Detalle — ${ceroVendSel}` : 'Detalle individual'}
                </h3>
                {ceroVendSel && (
                  <button
                    onClick={() => setCeroVendSel('')}
                    className="text-palumar-muted hover:text-palumar-white"
                    style={{ fontSize: '11px' }}
                  >
                    ✕ limpiar
                  </button>
                )}
              </div>
              {!ceroVendSel ? (
                <div className="px-5 py-10 text-center text-palumar-muted text-sm">
                  Haz clic en un vendedor de la tabla para ver sus clientes sin compra
                </div>
              ) : ceroVendDetalle.length === 0 ? (
                <div className="px-5 py-10 text-center text-palumar-muted text-sm">Sin datos</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="palma-table">
                    <thead>
                      <tr>
                        <th>Cód.</th>
                        <th>Cliente</th>
                        <th>Ciudad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ceroVendDetalle.map((c, i) => (
                        <tr key={i}>
                          <td className="font-mono-num" style={{ color: 'var(--red)', fontWeight: 700 }}>
                            {c.cod_cliente || '—'}
                          </td>
                          <td>{c.cliente || c.nom_cliente || '—'}</td>
                          <td style={{ color: 'var(--muted)' }}>{c.ciudad || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Top 20 Clientes ── */}
      {topClientes.top_global?.length > 0 && (
        <>
          <SectionTitle>Top 20 Clientes — Distribuidora</SectionTitle>
          <div className="table-card mb-4">
            <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-2)' }}>
              <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>
                Mejores clientes por venta neta · {r?.periodo || ''}
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="palma-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Cód.</th>
                    <th>Cliente</th>
                    <th>Vendedor</th>
                    <th>Negocio Principal</th>
                    <th style={{ textAlign: 'right' }}>Venta</th>
                  </tr>
                </thead>
                <tbody>
                  {topClientes.top_global.map((c) => (
                    <tr key={c.cod_cliente}>
                      <td>
                        <span
                          className="font-mono-num font-bold"
                          style={{ color: c.ranking <= 3 ? 'var(--gold)' : 'var(--muted)', fontSize: '11px' }}
                        >
                          {c.ranking}
                        </span>
                      </td>
                      <td className="font-mono-num" style={{ color: 'var(--muted)', fontSize: '11px' }}>{c.cod_cliente}</td>
                      <td>{c.nombre}</td>
                      <td style={{ color: 'var(--muted)' }}>{c.nom_vendedor || '—'}</td>
                      <td>
                        {c.negocio_principal
                          ? <span className="badge badge-blue" style={{ fontSize: '10px' }}>{c.negocio_principal}</span>
                          : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }} className="font-mono-num">
                        <span style={{ color: 'var(--green)' }}>{fmt(c.venta)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Clientes Nuevos ── */}
      {(clientesNuevos.total > 0 || true) && (
        <>
          <SectionTitle>Clientes Nuevos</SectionTitle>

          {/* Quick date filters */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {[
              { label: 'Este mes', desde: primerDiaMes, hasta: hoyStr },
              { label: 'Últ. 30 días', desde: hace30Str, hasta: hoyStr },
              { label: 'Todo el historial', desde: '', hasta: '' },
            ].map(({ label, desde, hasta }) => {
              const isActive = filtroNuevosLabel === label;
              return (
                <button
                  key={label}
                  onClick={() => applyNuevosG(desde, hasta, label)}
                  disabled={loadingNuevosG}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150"
                  style={{
                    background: isActive ? 'linear-gradient(135deg, rgba(15,169,122,0.2) 0%, rgba(52,211,153,0.1) 100%)' : 'rgba(13,30,43,0.5)',
                    borderColor: isActive ? 'rgba(15,169,122,0.45)' : 'var(--border-2)',
                    color: isActive ? 'var(--green)' : 'var(--muted)',
                  }}
                >
                  {loadingNuevosG && isActive ? '…' : label}
                </button>
              );
            })}
            {clientesNuevos.desde && (
              <span className="font-mono-num text-palumar-muted" style={{ fontSize: '10px' }}>
                {clientesNuevos.desde} → {clientesNuevos.hasta || hoyStr}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <KpiCard
              label="Nuevos este periodo"
              value={String(clientesNuevos.total)}
              color="green"
            />

            {clientesNuevos.por_vendedor.length > 0 && (
              <div className="chart-card sm:col-span-2">
                <div className="font-display font-bold text-palumar-white mb-3" style={{ fontSize: '13px' }}>
                  Por Vendedor
                </div>
                <HBarChart
                  labels={clientesNuevos.por_vendedor.map(v => v.vendedor)}
                  data={clientesNuevos.por_vendedor.map(v => v.cantidad)}
                  barColors={clientesNuevos.por_vendedor.map((_, i) => VEND_COLORS[i % VEND_COLORS.length])}
                  formatValue={(v) => String(v)}
                  minH={120}
                  rowH={30}
                />
              </div>
            )}

            {clientesNuevos.por_mes && clientesNuevos.por_mes.length > 0 && (
              <div className="chart-card sm:col-span-3">
                <div className="font-display font-bold text-palumar-white mb-3" style={{ fontSize: '13px' }}>
                  Tendencia Mensual
                </div>
                <LineChart
                  labels={clientesNuevos.por_mes.map(m => m.mes || m.periodo)}
                  datasets={[{
                    label: 'Nuevos',
                    data: clientesNuevos.por_mes.map(m => m.cantidad || m.total),
                    color: '#0FA97A',
                    fill: true,
                  }]}
                  formatValue={(v) => String(v)}
                  height={200}
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Análisis Comercial ── */}
      <SectionTitle>Análisis Comercial</SectionTitle>
      <div className="chart-card mb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="font-display font-bold text-palumar-white" style={{ fontSize: '14px' }}>
              Ranking de Vendedores
            </div>
            <div className="text-palumar-muted" style={{ fontSize: '11px', marginTop: '2px' }}>
              Ordenado por venta neta
            </div>
          </div>
        </div>
        <HBarChart
          labels={vs.map(v => v.nombre)}
          data={vs.map(v => v.venta_neta || 0)}
          barColors={vs.map((_, i) => VEND_COLORS[i % VEND_COLORS.length])}
        />
      </div>

      {/* ── Cobertura por vendedor ── */}
      <SectionTitle>Cobertura Real por Vendedor</SectionTitle>
      <div className="chart-card mb-4">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-palumar-muted" style={{ fontSize: '11px' }}>
            Promedio equipo: <strong style={{ color: 'var(--white-2)' }}>{pct(promEquipoCob)}</strong>
          </span>
          <span className="text-palumar-muted" style={{ fontSize: '11px' }}>
            Meta: <strong style={{ color: 'var(--red)' }}>95%</strong>
          </span>
        </div>
        <HBarChart
          labels={cobData.map(r2 => getCoberturaVendedor(r2))}
          data={cobData.map(r2 => getCoberturaValue(r2))}
          barColors={cobData.map((_, i) => VEND_COLORS[i % VEND_COLORS.length])}
          isPct
          metaValue={95}
          metaLabel="Meta 95%"
        />
        {/* Tabla: % + $ por vendedor */}
        <div className="mt-4 overflow-x-auto">
          <table className="palma-table">
            <thead>
              <tr>
                <th>Vendedor</th>
                <th style={{ textAlign: 'right' }}>Cobertura</th>
                <th style={{ textAlign: 'right' }}>Venta Neta $</th>
              </tr>
            </thead>
            <tbody>
              {cobData.map((r2, i) => {
                const nom = getCoberturaVendedor(r2);
                const cob = getCoberturaValue(r2);
                const venta = vendVentaMap[nom] ?? 0;
                return (
                  <tr key={i}>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: VEND_COLORS[i % VEND_COLORS.length] }} />
                        {nom}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ color: cob >= 95 ? 'var(--green)' : cob >= 75 ? 'var(--amber)' : 'var(--red)', fontWeight: 600 }}>
                        {pct(cob)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }} className="font-mono-num">
                      <span style={{ color: 'var(--green)' }}>{fmt(venta)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Cobertura por Negocio ── */}
      {negocios.length > 0 && (
        <>
          <SectionTitle>Cobertura por Negocio</SectionTitle>
          <div className="chart-card mb-4">
            <div className="flex items-center gap-3 mb-4">
              <select
                className="palma-select"
                value={negocioFiltro}
                onChange={e => setNegocioFiltro(e.target.value)}
              >
                <option value="">Selecciona un negocio</option>
                {negocios.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            {negocioFiltro && cobNegFiltrada.length > 0 ? (
              <>
                <HBarChart
                  labels={cobNegFiltrada.map(r2 => getCoberturaVendedor(r2))}
                  data={cobNegFiltrada.map(r2 => getCoberturaValue(r2))}
                  barColors={cobNegFiltrada.map((_, i) => VEND_COLORS[i % VEND_COLORS.length])}
                  isPct
                  metaValue={95}
                />
                {/* Tabla: % + $ por vendedor en el negocio */}
                <div className="mt-4 overflow-x-auto">
                  <table className="palma-table">
                    <thead>
                      <tr>
                        <th>Vendedor</th>
                        <th style={{ textAlign: 'right' }}>Cobertura</th>
                        <th style={{ textAlign: 'right' }}>Venta en {negocioFiltro} $</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cobNegFiltrada.map((r2, i) => {
                        const nom = getCoberturaVendedor(r2);
                        const cob = getCoberturaValue(r2);
                        const venta = cobNegVentaMap[nom] ?? 0;
                        return (
                          <tr key={i}>
                            <td>
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: VEND_COLORS[i % VEND_COLORS.length] }} />
                                {nom}
                              </div>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <span style={{ color: cob >= 95 ? 'var(--green)' : cob >= 75 ? 'var(--amber)' : 'var(--red)', fontWeight: 600 }}>
                                {pct(cob)}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }} className="font-mono-num">
                              <span style={{ color: venta > 0 ? 'var(--green)' : 'var(--muted)' }}>{fmt(venta)}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="text-palumar-muted text-sm text-center py-6">
                {negocioFiltro ? 'Sin datos para este negocio' : 'Selecciona un negocio para ver el detalle'}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Efectividad ── */}
      <SectionTitle>Efectividad por Vendedor</SectionTitle>
      <div className="chart-card mb-4">
        <div className="mb-1 flex items-center gap-3">
          <span className="text-palumar-muted" style={{ fontSize: '11px' }}>
            Meta: <strong style={{ color: 'var(--red)' }}>90%</strong>
          </span>
        </div>
        <HBarChart
          labels={efData.map(r2 => getCoberturaVendedor(r2))}
          data={efData.map(r2 => +r2[efField] || 0)}
          barColors={efData.map((_, i) => VEND_COLORS[i % VEND_COLORS.length])}
          isPct
          metaValue={90}
          metaLabel="Meta 90%"
        />
      </div>

      {/* ── Alertas ── */}
      <SectionTitle>Alertas</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 mb-4">
        {alerts.map((a, i) => (
          <AlertItem key={i} type={a.type}>
            {a.msg}
          </AlertItem>
        ))}
      </div>

      {/* ── Top Marcas & SKUs ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {marcas.length > 0 && (
          <div className="table-card">
            <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-2)' }}>
              <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>
                Top Marcas
              </h3>
              <span className="text-palumar-muted" style={{ fontSize: '11px' }}>Por venta</span>
            </div>
            <div className="overflow-x-auto">
              <table className="palma-table">
                <thead>
                  <tr>
                    <th>Marca</th>
                    <th>Negocio</th>
                    <th style={{ textAlign: 'right' }}>Venta</th>
                    <th style={{ textAlign: 'right' }}>%</th>
                    <th style={{ textAlign: 'right' }}>Clientes</th>
                  </tr>
                </thead>
                <tbody>
                  {marcas.slice(0, 10).map((m, i) => (
                    <tr key={i}>
                      <td>{m.marca}</td>
                      <td>{m.negocio}</td>
                      <td style={{ textAlign: 'right' }} className="font-mono-num">{fmt(m.venta)}</td>
                      <td style={{ textAlign: 'right' }}>{m.pct}%</td>
                      <td style={{ textAlign: 'right' }}>{m.clientes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {skus.global?.length > 0 && (
          <div className="table-card">
            <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-2)' }}>
              <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>
                Top SKUs
              </h3>
              <span className="text-palumar-muted" style={{ fontSize: '11px' }}>Por venta</span>
            </div>
            <div className="overflow-x-auto">
              <table className="palma-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Negocio</th>
                    <th style={{ textAlign: 'right' }}>Venta</th>
                    <th style={{ textAlign: 'right' }}>Clientes</th>
                  </tr>
                </thead>
                <tbody>
                  {skus.global.slice(0, 15).map((s, i) => (
                    <tr key={i}>
                      <td>{s.nombre || s.sku}</td>
                      <td>{s.negocio}</td>
                      <td style={{ textAlign: 'right' }} className="font-mono-num">{fmt(s.venta)}</td>
                      <td style={{ textAlign: 'right' }}>{s.clientes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Top 10 por Vendedor ── */}
      {topClientes.top_por_vendedor?.length > 0 && (
        <>
          <SectionTitle>Top 10 Clientes por Vendedor</SectionTitle>
          <div className="chart-card mb-4">
            <div className="flex items-center gap-3 mb-4">
              <select
                className="palma-select"
                value={vendedorTop10}
                onChange={e => setVendedorTop10(e.target.value)}
              >
                <option value="">— Selecciona un vendedor —</option>
                {topClientes.top_por_vendedor.map(vx => (
                  <option key={vx.cod_vendedor} value={vx.cod_vendedor}>
                    {vx.cod_vendedor} — {vx.nom_vendedor}
                  </option>
                ))}
              </select>
            </div>

            {(() => {
              const vx = topClientes.top_por_vendedor.find(x => x.cod_vendedor === vendedorTop10);
              if (!vendedorTop10) return (
                <p className="text-center text-palumar-muted text-sm py-6">
                  Selecciona un vendedor para ver sus 10 mejores clientes
                </p>
              );
              if (!vx?.top10?.length) return (
                <p className="text-center text-palumar-muted text-sm py-6">Sin datos</p>
              );
              return (
                <div className="overflow-x-auto">
                  <table className="palma-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Cód. Cliente</th>
                        <th>Cliente</th>
                        <th style={{ textAlign: 'right' }}>Venta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vx.top10.map(c => (
                        <tr key={c.cod_cliente}>
                          <td>
                            <span className="font-mono-num font-bold"
                              style={{ color: c.ranking <= 3 ? 'var(--gold)' : 'var(--muted)', fontSize: '11px' }}>
                              {c.ranking}
                            </span>
                          </td>
                          <td className="font-mono-num" style={{ color: 'var(--muted)', fontSize: '11px' }}>
                            {c.cod_cliente}
                          </td>
                          <td>{c.nombre}</td>
                          <td style={{ textAlign: 'right' }} className="font-mono-num">
                            <span style={{ color: 'var(--green)' }}>{fmt(c.venta)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </>
      )}

      {/* ── Ranking Completo ── */}
      <SectionTitle>Ranking Completo</SectionTitle>
      <div className="table-card mb-8">
        <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-2)' }}>
          <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>
            Detalle por Vendedor
          </h3>
          <span className="text-palumar-muted" style={{ fontSize: '11px' }}>{r.periodo || '—'}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="palma-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Vendedor</th>
                <th style={{ textAlign: 'right' }}>V. Real</th>
                <th style={{ textAlign: 'right' }}>Devol.</th>
                <th style={{ textAlign: 'right' }}>Dev%</th>
                <th style={{ textAlign: 'right' }}>V. Neta</th>
                <th style={{ textAlign: 'right' }}>Maestro</th>
                <th style={{ textAlign: 'right' }}>Impactos</th>
                <th style={{ textAlign: 'right' }}>Cobertura</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {vs.map((v, i) => {
                const devPct = v.pct_devolucion ?? (v.venta_real > 0 ? (v.devol / v.venta_real * 100) : 0);
                const cob = +v.cobertura || 0;
                const badgeClass = cob >= 95 ? 'badge-green' : cob >= 75 ? 'badge-amber' : 'badge-red';
                const badgeLabel = cob >= 95 ? 'En meta' : cob >= 75 ? 'Cerca' : 'Bajo meta';
                return (
                  <tr key={v.cod}>
                    <td>{i + 1}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
                          style={{
                            background: VEND_COLORS[i % VEND_COLORS.length],
                            fontSize: '9px',
                          }}
                        >
                          {v.nombre?.[0] || '?'}
                        </div>
                        <span>{v.cod} — {v.nombre}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }} className="font-mono-num">{fmt(v.venta_real)}</td>
                    <td style={{ textAlign: 'right' }} className="font-mono-num" style2="color:var(--red)">
                      <span style={{ color: 'var(--red)' }}>{fmt(v.devol)}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>{pct(devPct)}</td>
                    <td style={{ textAlign: 'right' }} className="font-mono-num">
                      <span style={{ color: 'var(--green)' }}>{fmt(v.venta_neta)}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>{v.maestro || 0}</td>
                    <td style={{ textAlign: 'right' }}>{v.clientes_imp || 0}</td>
                    <td style={{ textAlign: 'right' }}>{pct(v.cobertura)}</td>
                    <td><span className={`badge ${badgeClass}`}>{badgeLabel}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
