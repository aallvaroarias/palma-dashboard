import React, { useMemo, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import useDashboardStore from '../../store/dashboardStore';
import KpiCard from '../ui/KpiCard';
import SectionTitle from '../ui/SectionTitle';
import HBarChart from '../charts/HBarChart';
import DoughnutChart from '../charts/DoughnutChart';
import LineChart from '../charts/LineChart';
import { fmt, pct, getCoberturaValue, getCoberturaVendedor, esRutaCentral } from '../../utils/formatters';
import { VEND_COLORS, NEG_COLORS, COLORS } from '../../utils/colors';

export default function Vendedor() {
  const [params] = useSearchParams();
  const cod = params.get('v');

  const { vendedores, cobertura, cobNegocio, efectividad, skus, clientesNuevos,
          clientesCero, topClientes, cuotas, refetchClientes } = useDashboardStore();

  const v = useMemo(
    () => vendedores.find(x => String(x.cod) === String(cod)),
    [vendedores, cod]
  );

  const equipoCobPct = useMemo(() => {
    if (!vendedores.length) return 0;
    return vendedores.reduce((s, x) => s + (+x.cobertura || 0), 0) / vendedores.length;
  }, [vendedores]);

  const cobVend = useMemo(() => {
    if (!cod) return [];
    return cobNegocio
      .filter(r2 => {
        const vnom = getCoberturaVendedor(r2);
        return v && (vnom === v.nombre || vnom === String(v.cod));
      })
      .sort((a, b) => getCoberturaValue(b) - getCoberturaValue(a));
  }, [cobNegocio, cod, v]);

  const efVend = useMemo(() => {
    if (!cod || !v) return [];
    return (efectividad.por_semana || []).filter(r2 => {
      const vnom = getCoberturaVendedor(r2);
      if (esRutaCentral(vnom)) return false;
      return vnom === v.nombre || vnom === String(v.cod);
    });
  }, [efectividad, cod, v]);

  const efField = useMemo(() => {
    if (!efVend.length) return 'efectividad';
    return Object.keys(efVend[0]).find(k => k.includes('efectividad')) || 'efectividad';
  }, [efVend]);

  const skusVend = useMemo(() => {
    if (!cod) return [];
    const found = skus.por_vendedor?.find(x => String(x.cod) === String(cod));
    return found?.skus || [];
  }, [skus, cod]);

  // Clientes nuevos con filtro de fecha propio del panel vendedor
  const [desdeN, setDesdeN] = useState('');
  const [hastaN, setHastaN] = useState('');
  const [loadingN, setLoadingN] = useState(false);

  const applyNuevos = useCallback(async (d, h) => {
    setLoadingN(true);
    try { await refetchClientes(d || undefined, h || undefined); }
    finally { setLoadingN(false); }
  }, [refetchClientes]);

  const nuevosVend = useMemo(() => {
    if (!v) return [];
    return (clientesNuevos.detalle || []).filter(c =>
      c.asesor === v.nombre || c.asesor === String(v.cod) ||
      c.cod_asesor === String(v.cod)
    );
  }, [clientesNuevos, v]);

  // Clientes cero de este vendedor
  const ceroVend = useMemo(() => {
    if (!v) return [];
    return (clientesCero.detalle || []).filter(r => {
      const nom = String(r.vendedor || r.nom_vendedor || '').trim();
      return nom === v.nombre || nom === String(v.cod);
    });
  }, [clientesCero, v]);

  // Cuota del vendedor: busca en el array cuotas por cod (fuente directa de la hoja CUOTAS)
  const vCuota = useMemo(() => {
    if (!v) return 0;
    const found = cuotas.find(c => String(c.cod).trim() === String(v.cod).trim());
    return found ? (found.cuota || 0) : (v.cuota || 0);
  }, [cuotas, v]);

  const vPctCumplimiento = useMemo(() => {
    if (!vCuota) return 0;
    const venta = v?.venta_neta || 0;
    return Math.round(venta / vCuota * 1000) / 10;
  }, [vCuota, v]);

  // Top 10 clientes de este vendedor
  const top10Vend = useMemo(() => {
    if (!v) return [];
    const found = (topClientes.top_por_vendedor || []).find(x =>
      x.cod_vendedor === String(v.cod) || x.nom_vendedor === v.nombre
    );
    return found?.top10 || [];
  }, [topClientes, v]);

  if (!cod) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-palumar-muted">
        <svg className="w-12 h-12 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <p className="text-sm">Selecciona un vendedor para ver su panel individual</p>
        <div className="flex flex-wrap gap-2 justify-center">
          {vendedores.map((vx, i) => (
            <Link
              key={vx.cod}
              to={`/panel?v=${vx.cod}`}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
              style={{
                background: 'rgba(26,127,166,0.1)',
                borderColor: 'rgba(26,127,166,0.25)',
                color: VEND_COLORS[i % VEND_COLORS.length],
              }}
            >
              {vx.cod} — {vx.nombre}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  if (!v) {
    return (
      <div className="text-center py-16 text-palumar-muted text-sm">
        Vendedor {cod} no encontrado.
        <br />
        <Link to="/panel" className="text-teal-light underline mt-2 inline-block">Seleccionar otro</Link>
      </div>
    );
  }

  const devPct = v.pct_devolucion ?? (v.venta_real > 0 ? (v.devol / v.venta_real * 100) : 0);
  // Solo negocios con venta neta positiva
  const negocios = (Array.isArray(v.venta_por_negocio) ? v.venta_por_negocio : [])
    .filter(n => n.venta > 0)
    .sort((a, b) => b.venta - a.venta);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-base flex-shrink-0"
          style={{ background: 'var(--blue)' }}
        >
          {v.nombre?.[0] || '?'}
        </div>
        <div>
          <h2 className="font-display font-bold text-palumar-white" style={{ fontSize: '18px' }}>
            {v.cod} — {v.nombre}
          </h2>
          <div className="text-palumar-muted" style={{ fontSize: '11px' }}>Panel individual de vendedor</div>
        </div>
        <Link
          to="/panel"
          className="ml-auto text-xs text-palumar-muted hover:text-palumar-white px-3 py-1.5 rounded-lg border transition-all"
          style={{ borderColor: 'var(--border-2)' }}
        >
          Cambiar vendedor
        </Link>
      </div>

      {/* KPIs */}
      <SectionTitle>Mis Métricas</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        <KpiCard label="Venta Real" value={fmt(v.venta_real)} color="blue" />
        <KpiCard
          label="Devoluciones"
          value={fmt(v.devol)}
          sub={pct(devPct)}
          color="red"
        />
        <KpiCard label="Venta Neta" value={fmt(v.venta_neta)} color="green" />
        <KpiCard
          label="Cobertura"
          value={pct(v.cobertura)}
          sub={`${v.clientes_imp || 0} de ${v.maestro || 0}`}
          color="cyan"
          barValue={v.cobertura || 0}
        />
        <KpiCard
          label="Ticket Prom."
          value={fmt(v.ticket_promedio || (v.venta_neta / (v.clientes_imp || 1)))}
          color="purple"
        />
        <KpiCard
          label="Mi Meta"
          value={vCuota > 0 ? fmt(vCuota) : 'Sin meta'}
          sub={vCuota > 0 ? `${pct(vPctCumplimiento)} logrado` : 'Configura en hoja CUOTAS'}
          color="gold"
          barValue={vCuota > 0 ? Math.min(vPctCumplimiento, 100) : 0}
        />
      </div>

      {/* ── Progreso Meta ── siempre visible, mensaje especial si no hay cuota */}
      {(() => {
        const cuota   = vCuota;
        const ventaB  = v.venta_neta || 0;
        const pctC    = vPctCumplimiento;
        const falta   = cuota - ventaB;
        const barW    = cuota > 0 ? Math.min(pctC, 100) : 0;
        const colorBar = pctC >= 100 ? 'var(--green)' : pctC >= 75 ? 'var(--amber)' : 'var(--red)';
        return (
          <div className="chart-card mb-6">
            {/* Título + estado */}
            <div className="flex items-center justify-between mb-3">
              <div className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>
                Meta del Período
              </div>
              {cuota > 0 && (
                <div className="font-mono-num font-bold" style={{ fontSize: '22px', color: colorBar }}>
                  {pct(pctC)}
                </div>
              )}
            </div>

            {cuota > 0 ? (
              <>
                {/* Barra de progreso */}
                <div
                  className="w-full rounded-full mb-1"
                  style={{ height: '10px', background: 'rgba(90,145,185,0.12)' }}
                >
                  <div
                    className="rounded-full"
                    style={{ width: `${barW}%`, height: '10px', background: colorBar, transition: 'width 0.6s ease' }}
                  />
                </div>
                <div className="text-right mb-4" style={{ fontSize: '10px', color: colorBar, fontWeight: 600 }}>
                  {falta > 0
                    ? `Faltan ${fmt(falta)} para alcanzar la meta`
                    : `✓ Meta superada — excediste por ${fmt(Math.abs(falta))}`}
                </div>

                {/* Tres stats */}
                <div
                  className="grid grid-cols-3 gap-4 pt-3 border-t"
                  style={{ borderColor: 'var(--border-2)' }}
                >
                  {[
                    { label: 'Venta Neta',   val: fmt(ventaB), color: 'var(--white-2)' },
                    { label: 'Meta Mensual', val: fmt(cuota),  color: 'var(--white-2)' },
                    { label: falta > 0 ? 'Falta para Meta' : 'Meta Superada',
                      val: falta > 0 ? fmt(falta) : `+${fmt(Math.abs(falta))}`,
                      color: colorBar },
                  ].map(({ label, val, color }) => (
                    <div key={label}>
                      <div className="text-palumar-muted mb-1"
                        style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {label}
                      </div>
                      <div className="font-mono-num font-bold" style={{ fontSize: '16px', color }}>
                        {val}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 gap-2">
                <div className="text-palumar-muted text-sm">
                  Este vendedor no tiene una meta configurada para este período.
                </div>
                <div className="text-palumar-muted" style={{ fontSize: '11px' }}>
                  Agrega a <strong style={{ color: 'var(--white-2)' }}>{v.cod}</strong> en la hoja <strong style={{ color: 'var(--white-2)' }}>CUOTAS</strong> del Google Sheets.
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        {/* Venta por negocio */}
        {negocios.length > 0 && (
          <div className="chart-card">
            <div className="font-display font-bold text-palumar-white mb-4" style={{ fontSize: '13px' }}>
              Venta por Negocio
            </div>
            <DoughnutChart
              labels={negocios.map(n => n.negocio)}
              data={negocios.map(n => n.venta || 0)}
              colors={negocios.map(n => NEG_COLORS[n.negocio] || '#64748B')}
              showLegend
              height={200}
            />
          </div>
        )}

        {/* Cobertura vs equipo */}
        <div className="chart-card">
          <div className="font-display font-bold text-palumar-white mb-4" style={{ fontSize: '13px' }}>
            Cobertura vs Equipo
          </div>
          <LineChart
            labels={['Mi cobertura', 'Prom. equipo', 'Meta']}
            datasets={[{
              label: 'Porcentaje',
              data: [+v.cobertura || 0, equipoCobPct, 95],
              color: '#2AAED9',
              fill: false,
            }]}
            formatValue={pct}
            isPct
            height={200}
          />
        </div>

        {/* Cobertura por negocio */}
        {cobVend.length > 0 && (
          <div className="chart-card">
            <div className="font-display font-bold text-palumar-white mb-4" style={{ fontSize: '13px' }}>
              Cobertura por Negocio
            </div>
            <HBarChart
              labels={cobVend.map(r2 => r2.negocio || getCoberturaVendedor(r2))}
              data={cobVend.map(r2 => getCoberturaValue(r2))}
              barColors={cobVend.map((_, i) => VEND_COLORS[i % VEND_COLORS.length])}
              isPct
              metaValue={95}
              metaLabel="Meta 95%"
              minH={120}
              rowH={32}
            />
            {/* Tabla detallada: maestro vs impactados por negocio */}
            <div className="mt-4 overflow-x-auto">
              <table className="palma-table">
                <thead>
                  <tr>
                    <th>Negocio</th>
                    <th style={{ textAlign: 'right' }}>Maestro</th>
                    <th style={{ textAlign: 'right' }}>Impactados</th>
                    <th style={{ textAlign: 'right' }}>Cobertura</th>
                  </tr>
                </thead>
                <tbody>
                  {cobVend.map((r2, i) => {
                    const cob = getCoberturaValue(r2);
                    const maestro    = r2.clientes_maestro || r2.maestro || 0;
                    const impactados = r2.impactados || 0;
                    return (
                      <tr key={i}>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-sm flex-shrink-0"
                              style={{ background: VEND_COLORS[i % VEND_COLORS.length] }} />
                            {r2.negocio || getCoberturaVendedor(r2)}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }} className="font-mono-num">{maestro}</td>
                        <td style={{ textAlign: 'right' }} className="font-mono-num">{impactados}</td>
                        <td style={{ textAlign: 'right' }} className="font-mono-num">
                          <span style={{ color: cob >= 95 ? 'var(--green)' : cob >= 75 ? 'var(--amber)' : 'var(--red)', fontWeight: 600 }}>
                            {pct(cob)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Efectividad por semana */}
      {efVend.length > 0 && (
        <>
          <SectionTitle>Efectividad por Semana</SectionTitle>
          <div className="chart-card mb-4">
            <HBarChart
              labels={efVend.map(r2 => `Sem ${r2.semana || r2.periodo}`)}
              data={efVend.map(r2 => +r2[efField] || 0)}
              color="#0FA97A"
              isPct
              metaValue={90}
              metaLabel="Meta 90%"
              minH={150}
              rowH={34}
            />
          </div>
        </>
      )}

      {/* Alertas */}
      <SectionTitle>Alertas</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
        <div className={`alert-item ${devPct > 10 ? 'alert-red' : 'alert-green'}`}>
          <strong style={{ display: 'block', marginBottom: '2px', fontSize: '11px', fontWeight: 700 }}>
            Devoluciones
          </strong>
          {pct(devPct)} de la venta real
        </div>
        <div className={`alert-item ${+v.cobertura >= 95 ? 'alert-green' : +v.cobertura >= 75 ? 'alert-amber' : 'alert-red'}`}>
          <strong style={{ display: 'block', marginBottom: '2px', fontSize: '11px', fontWeight: 700 }}>
            Cobertura
          </strong>
          {pct(v.cobertura)} — Meta 95%
        </div>
      </div>

      {/* ── Clientes Cero ── */}
      {ceroVend.length > 0 && (
        <>
          <SectionTitle>Mis Clientes Cero</SectionTitle>
          <div className="mb-3">
            <KpiCard label="Sin compra este período" value={String(ceroVend.length)} color="red" />
          </div>
          <div className="table-card mb-4">
            <div className="overflow-x-auto">
              <table className="palma-table">
                <thead>
                  <tr>
                    <th>Cód. Cliente</th>
                    <th>Cliente</th>
                    <th>Razón Social</th>
                    <th>Ciudad</th>
                  </tr>
                </thead>
                <tbody>
                  {ceroVend.map((c, i) => (
                    <tr key={i}>
                      <td className="font-mono-num" style={{ color: 'var(--red)', fontWeight: 700 }}>
                        {c.cod_cliente || c['cod cliente'] || '—'}
                      </td>
                      <td>{c.cliente || c.nom_cliente || '—'}</td>
                      <td>{c.razon_social || '—'}</td>
                      <td>{c.ciudad || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Top 10 Clientes ── */}
      {top10Vend.length > 0 && (
        <>
          <SectionTitle>Mis Top 10 Clientes</SectionTitle>
          <div className="table-card mb-4">
            <div className="overflow-x-auto">
              <table className="palma-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Cód.</th>
                    <th>Cliente</th>
                    <th style={{ textAlign: 'right' }}>Venta</th>
                  </tr>
                </thead>
                <tbody>
                  {top10Vend.map((c) => (
                    <tr key={c.cod_cliente}>
                      <td>
                        <span className="font-mono-num font-bold"
                          style={{ color: c.ranking <= 3 ? 'var(--gold)' : 'var(--muted)', fontSize: '11px' }}>
                          {c.ranking}
                        </span>
                      </td>
                      <td className="font-mono-num" style={{ color: 'var(--muted)', fontSize: '11px' }}>{c.cod_cliente}</td>
                      <td>{c.nombre}</td>
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

      {/* ── Mis Clientes Nuevos ── */}
      <SectionTitle>Mis Clientes Nuevos</SectionTitle>

      {/* Filtro de fechas */}
      <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-xl border"
        style={{ background: 'rgba(13,30,43,0.6)', borderColor: 'var(--border-2)' }}>
        <div className="flex items-center gap-2">
          <span className="text-palumar-muted" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Desde</span>
          <input type="date" value={desdeN} onChange={e => setDesdeN(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-palumar-muted" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Hasta</span>
          <input type="date" value={hastaN} onChange={e => setHastaN(e.target.value)} />
        </div>
        <button
          onClick={() => applyNuevos(desdeN, hastaN)}
          disabled={loadingN}
          className="h-8 px-4 rounded-lg text-xs font-semibold text-white"
          style={{ background: 'var(--blue)', opacity: loadingN ? 0.6 : 1 }}
        >
          {loadingN ? 'Cargando…' : 'Aplicar'}
        </button>
        <button
          onClick={() => { setDesdeN(''); setHastaN(''); applyNuevos('', ''); }}
          className="h-8 px-3 rounded-lg text-xs font-medium border"
          style={{ borderColor: 'var(--border-2)', color: 'var(--muted)' }}
        >
          Todo el historial
        </button>
      </div>

      <div className="mb-3">
        <KpiCard label="Clientes nuevos" value={String(nuevosVend.length)} color="green" />
      </div>

      {nuevosVend.length > 0 ? (
        <div className="table-card mb-4">
          <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-2)' }}>
            <span className="font-display font-bold text-palumar-white" style={{ fontSize: '12px' }}>
              {nuevosVend.length} cliente{nuevosVend.length !== 1 ? 's' : ''}
            </span>
            <span className="text-palumar-muted" style={{ fontSize: '11px' }}>
              {clientesNuevos.desde && clientesNuevos.hasta
                ? `${clientesNuevos.desde} → ${clientesNuevos.hasta}`
                : 'Todo el historial'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="palma-table">
              <thead>
                <tr>
                  <th>Cód.</th>
                  <th>Cliente</th>
                  <th>Razón Social</th>
                  <th>Fecha Creación</th>
                </tr>
              </thead>
              <tbody>
                {nuevosVend.map((c, i) => (
                  <tr key={i}>
                    <td className="font-mono-num" style={{ color: 'var(--cyan)', fontWeight: 600 }}>
                      {c.cod_cliente || '—'}
                    </td>
                    <td>{c.nombre || '—'}</td>
                    <td style={{ color: 'var(--muted)' }}>{c.razon_social || '—'}</td>
                    <td className="font-mono-num" style={{ color: 'var(--muted)' }}>{c.fecha_creacion || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-palumar-muted text-sm mb-4">
          Sin clientes nuevos en el rango seleccionado
        </div>
      )}

      {/* Top SKUs */}
      {skusVend.length > 0 && (
        <>
          <SectionTitle>Top SKUs</SectionTitle>
          <div className="table-card mb-8">
            <div className="overflow-x-auto">
              <table className="palma-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>SKU</th>
                    <th>Negocio</th>
                    <th style={{ textAlign: 'right' }}>Venta</th>
                    <th style={{ textAlign: 'right' }}>Clientes</th>
                  </tr>
                </thead>
                <tbody>
                  {skusVend.map((s, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{s.nombre || s.sku}</td>
                      <td>{s.negocio || '—'}</td>
                      <td style={{ textAlign: 'right' }} className="font-mono-num">{fmt(s.venta)}</td>
                      <td style={{ textAlign: 'right' }}>{s.clientes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
