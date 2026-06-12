import React, { useState, useMemo } from 'react';
import useDashboardStore from '../../store/dashboardStore';
import KpiCard from '../ui/KpiCard';
import SectionTitle from '../ui/SectionTitle';
import HBarChart from '../charts/HBarChart';
import { fmt } from '../../utils/formatters';
import { VEND_COLORS, COLORS } from '../../utils/colors';

const SEL = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid var(--border-2)',
  borderRadius: '10px',
  color: 'var(--white)',
  fontSize: '12px',
  padding: '6px 12px',
  outline: 'none',
  cursor: 'pointer',
  minWidth: '170px',
};

const SEL_ACTIVE = {
  ...SEL,
  border: '1px solid rgba(239,68,68,0.5)',
  background: 'rgba(239,68,68,0.08)',
};

// Quita el prefijo "cod - " de los nombres de vendedor para display
const labelVend = (v) => String(v || '').replace(/^\d+\s*-\s*/, '').trim();

export default function Devoluciones() {
  const { devoluciones } = useDashboardStore();
  const [filterVendedor, setFilterVendedor] = useState('');
  const [filterConcepto, setFilterConcepto] = useState('');

  const d = devoluciones;
  const hasFilter = filterVendedor || filterConcepto;

  // ── Dropdowns desde datos COMPLETOS del servidor, no del detalle de 500 filas ──

  // por_vendedor tiene la clave "cod - nombre" (ej: "208 - ARIEL PEREZ")
  const uniqueVendedores = useMemo(() => {
    return (d.por_vendedor || [])
      .map(v => v.vendedor || '')
      .filter(Boolean)
      .sort((a, b) => labelVend(a).localeCompare(labelVend(b)));
  }, [d]);

  // por_concepto tiene todos los conceptos sin límite de 500
  const uniqueConceptos = useMemo(() => {
    return (d.por_concepto || [])
      .map(c => c.concepto || '')
      .filter(Boolean)
      .sort();
  }, [d]);

  // Detalle filtrado — usa r.vendedor (formato "cod - nombre") para matchear la clave correcta
  const filteredDetalle = useMemo(() => {
    let rows = d.detalle || [];
    if (filterVendedor) rows = rows.filter(r => (r.vendedor || '') === filterVendedor);
    if (filterConcepto) rows = rows.filter(r => (r.concepto || r.motivo || '') === filterConcepto);
    return rows;
  }, [d, filterVendedor, filterConcepto]);

  // Totales desde datos pre-calculados del servidor (completos)
  const totalFiltrado = useMemo(() => {
    if (!hasFilter) return d.total || 0;
    // Solo vendedor → por_vendedor (clave "cod - nombre", coincide con filterVendedor)
    if (filterVendedor && !filterConcepto) {
      const found = (d.por_vendedor || []).find(v => (v.vendedor || '') === filterVendedor);
      return found?.monto || 0;
    }
    // Solo concepto → por_concepto
    if (filterConcepto && !filterVendedor) {
      const found = (d.por_concepto || []).find(c => (c.concepto || '') === filterConcepto);
      return found?.monto || 0;
    }
    // Ambos filtros → sumar desde detalle (muestra limitada)
    return filteredDetalle.reduce((s, r) => s + (r.vlr_devolucion ?? r.valor ?? 0), 0);
  }, [d, filterVendedor, filterConcepto, filteredDetalle, hasFilter]);

  // Gráfico de conceptos — usa por_concepto_por_vendedor cuando hay filtro de vendedor
  const conceptos = useMemo(() => {
    if (!filterVendedor) return (d.por_concepto || []).slice(0, 10);
    // por_concepto_por_vendedor usa la misma clave "cod - nombre" → match directo
    const entry = (d.por_concepto_por_vendedor || []).find(e => e.vendedor === filterVendedor);
    if (entry) return (entry.por_concepto || []).slice(0, 10);
    // Fallback si el Apps Script todavía no fue actualizado
    const agg = {};
    filteredDetalle.forEach(r => {
      const k = r.concepto || r.motivo || '—';
      agg[k] = (agg[k] || 0) + (r.vlr_devolucion ?? r.valor ?? 0);
    });
    return Object.entries(agg)
      .map(([concepto, monto]) => ({ concepto, monto }))
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 10);
  }, [d, filteredDetalle, filterVendedor]);

  const vendedorDev = useMemo(() => {
    if (!filterConcepto) return (d.por_vendedor || []).sort((a, b) => (b.monto || 0) - (a.monto || 0));
    // Con filtro de concepto: agregar desde detalle disponible
    const agg = {};
    filteredDetalle.forEach(r => {
      const k = r.vendedor || '—';
      agg[k] = (agg[k] || 0) + (r.vlr_devolucion ?? r.valor ?? 0);
    });
    return Object.entries(agg)
      .map(([vendedor, monto]) => ({ vendedor, monto }))
      .sort((a, b) => b.monto - a.monto);
  }, [d, filteredDetalle, filterConcepto]);

  const topConcepto = (d.por_concepto || [])[0]?.concepto || '—';
  const topVendedor = labelVend((d.por_vendedor || []).sort((a,b) => (b.monto||0)-(a.monto||0))[0]?.vendedor || '—');

  return (
    <div className="animate-fade-in">
      <SectionTitle>Resumen Devoluciones</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
        <KpiCard
          label={filterVendedor ? `Devoluciones · ${labelVend(filterVendedor)}` : 'Devoluciones'}
          value={fmt(hasFilter ? totalFiltrado : (d.total_devoluciones ?? d.total ?? 0))}
          color="red"
        />
        <KpiCard
          label="Averías"
          value={fmt(hasFilter ? 0 : (d.total_averias ?? 0))}
          sub={hasFilter ? 'Filtrar por vendedor suma devoluciones + averías' : undefined}
          color="amber"
        />
        <KpiCard
          label={hasFilter ? `Total devolución + averías` : 'Total impacto'}
          value={fmt(hasFilter ? totalFiltrado : (d.total || 0))}
          color="red"
        />
        <KpiCard
          label="Top Concepto"
          value={filterVendedor ? (conceptos[0]?.concepto || '—') : topConcepto}
          color="blue"
        />
        <KpiCard
          label={filterVendedor ? 'Conceptos' : 'Top Vendedor'}
          value={filterVendedor ? String(conceptos.length) : topVendedor}
          color="purple"
        />
      </div>

      {/* ── Filtros ── */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <select
          value={filterVendedor}
          onChange={e => setFilterVendedor(e.target.value)}
          style={filterVendedor ? SEL_ACTIVE : SEL}
        >
          <option value="">Todos los vendedores</option>
          {uniqueVendedores.map(v => <option key={v} value={v}>{labelVend(v)}</option>)}
        </select>

        <select
          value={filterConcepto}
          onChange={e => setFilterConcepto(e.target.value)}
          style={filterConcepto ? SEL_ACTIVE : SEL}
        >
          <option value="">Todos los conceptos</option>
          {uniqueConceptos.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {hasFilter && (
          <>
            <button
              onClick={() => { setFilterVendedor(''); setFilterConcepto(''); }}
              className="flex items-center gap-1"
              style={{
                fontSize: '11px', fontWeight: 700, padding: '5px 12px',
                borderRadius: '99px', cursor: 'pointer',
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.35)',
                color: 'var(--red)',
              }}
            >
              Limpiar filtros ×
            </button>
            <span className="text-palumar-muted" style={{ fontSize: '11px' }}>
              {filteredDetalle.length} registro{filteredDetalle.length !== 1 ? 's' : ''} · {fmt(totalFiltrado)}
            </span>
          </>
        )}
      </div>

      {/* ── Gráficos ── */}
      {filterVendedor ? (
        /* ── MODO VENDEDOR: un solo gráfico ancho con sus conceptos ── */
        <div className="chart-card mb-4">
          {/* Encabezado con nombre + total */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <span className="font-display font-bold text-palumar-white" style={{ fontSize: '15px' }}>
              Devoluciones de {labelVend(filterVendedor)}
            </span>
            <span style={{
              fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '99px',
              background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)',
              color: 'var(--red)',
            }}>
              Total: {fmt(totalFiltrado)}
            </span>
            {/* Aviso si los datos vienen del fallback (Apps Script no actualizado) */}
            {!(d.por_concepto_por_vendedor || []).find(e => e.vendedor === filterVendedor) && (
              <span style={{ fontSize: '10px', color: 'var(--muted)', opacity: 0.7 }}>
                ⚠ Desglose desde muestra parcial — actualiza el Apps Script para ver el 100%
              </span>
            )}
          </div>

          {/* Tabla de conceptos con barra de progreso */}
          {conceptos.length > 0 ? (
            <div className="space-y-3">
              {conceptos.map((c, i) => {
                const share = totalFiltrado > 0 ? (c.monto / totalFiltrado) * 100 : 0;
                return (
                  <div key={c.concepto}>
                    <div className="flex items-center justify-between mb-1">
                      <span style={{ fontSize: '12px', color: 'var(--white)', fontWeight: 500 }}>
                        {c.concepto}
                      </span>
                      <div className="flex items-center gap-3">
                        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                          {share.toFixed(1)}%
                        </span>
                        <span style={{ fontSize: '13px', color: 'var(--red)', fontWeight: 700, minWidth: '70px', textAlign: 'right' }}>
                          {fmt(c.monto)}
                        </span>
                      </div>
                    </div>
                    <div style={{ height: '6px', borderRadius: '99px', background: 'rgba(255,255,255,0.06)' }}>
                      <div style={{
                        height: '100%', borderRadius: '99px',
                        width: `${Math.min(share, 100).toFixed(1)}%`,
                        background: COLORS.red,
                        transition: 'width 0.4s ease',
                      }} />
                    </div>
                  </div>
                );
              })}
              {/* Fila total */}
              <div className="flex items-center justify-between pt-3 mt-1" style={{ borderTop: '1px solid var(--border-2)' }}>
                <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 700 }}>TOTAL</span>
                <span style={{ fontSize: '14px', color: 'var(--red)', fontWeight: 700 }}>{fmt(totalFiltrado)}</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-10 text-palumar-muted text-sm">Sin devoluciones registradas</div>
          )}
        </div>
      ) : (
        /* ── MODO GLOBAL: dos gráficos lado a lado ── */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div className="chart-card">
            <div className="flex items-center gap-2 mb-4">
              <span className="font-display font-bold text-palumar-white" style={{ fontSize: '14px' }}>
                Por Concepto
              </span>
              {filterConcepto && (
                <span style={{
                  fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px',
                  background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                  color: 'var(--red)',
                }}>
                  {filterConcepto}
                </span>
              )}
            </div>
            {conceptos.length > 0 ? (
              <HBarChart
                labels={conceptos.map(x => x.concepto)}
                data={conceptos.map(x => x.monto)}
                color={COLORS.red}
              />
            ) : (
              <div className="text-center py-10 text-palumar-muted text-sm">Sin datos</div>
            )}
          </div>

          <div className="chart-card">
            <div className="font-display font-bold text-palumar-white mb-4" style={{ fontSize: '14px' }}>
              Por Vendedor
            </div>
            {vendedorDev.length > 0 ? (
              <HBarChart
                labels={vendedorDev.map(x => labelVend(x.vendedor))}
                data={vendedorDev.map(x => x.monto)}
                barColors={vendedorDev.map((_, i) => VEND_COLORS[i % VEND_COLORS.length])}
              />
            ) : (
              <div className="text-center py-10 text-palumar-muted text-sm">Sin datos</div>
            )}
          </div>
        </div>
      )}

      {/* ── Tabla detalle ── */}
      {(d.detalle || []).length > 0 && (
        <>
          <SectionTitle>Detalle de Devoluciones</SectionTitle>
          <div className="table-card mb-8">
            <div className="px-5 py-3.5 border-b flex items-center gap-3 flex-wrap" style={{ borderColor: 'var(--border-2)' }}>
              <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>
                {filteredDetalle.length} registro{filteredDetalle.length !== 1 ? 's' : ''} en pantalla
              </h3>
              {hasFilter && (
                <span className="text-palumar-muted ml-auto" style={{ fontSize: '11px' }}>
                  Total real: <strong style={{ color: 'var(--red)' }}>{fmt(totalFiltrado)}</strong>
                </span>
              )}
              {(d.detalle || []).length >= 500 && (
                <span className="text-palumar-muted" style={{ fontSize: '10px', opacity: 0.6 }}>
                  (muestra de 500 registros — el total real se calcula desde el servidor)
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="palma-table">
                <thead>
                  <tr>
                    <th>Vendedor</th>
                    <th>Cliente</th>
                    <th>Concepto</th>
                    <th style={{ textAlign: 'right' }}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDetalle.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>
                        Sin resultados para el filtro seleccionado
                      </td>
                    </tr>
                  ) : filteredDetalle.slice(0, 200).map((row, i) => (
                    <tr key={i}>
                      <td style={{ color: 'var(--muted)', fontSize: '11px' }}>
                        {labelVend(row.vendedor || row.nom_vendedor || '—')}
                      </td>
                      <td style={{ fontWeight: 500, fontSize: '12px' }}>
                        {row.nom_cliente || row.cod_cliente || '—'}
                      </td>
                      <td style={{ color: 'var(--muted)', fontSize: '11px' }}>
                        {row.concepto || row.motivo || '—'}
                      </td>
                      <td style={{ textAlign: 'right' }} className="font-mono-num">
                        <span style={{ color: 'var(--red)', fontWeight: 600 }}>
                          {fmt(row.vlr_devolucion ?? row.valor ?? 0)}
                        </span>
                      </td>
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
