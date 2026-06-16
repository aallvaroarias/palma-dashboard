import React, { useState, useMemo, useCallback } from 'react';
import useDashboardStore from '../../store/dashboardStore';
import KpiCard from '../ui/KpiCard';
import SectionTitle from '../ui/SectionTitle';
import HBarChart from '../charts/HBarChart';
import LineChart from '../charts/LineChart';
import { fmt, hoy, diasAtras, inicioMes, mesLabel } from '../../utils/formatters';
import { VEND_COLORS, COLORS } from '../../utils/colors';

const NEG_COLORS_LIST = [
  '#2AAED9', '#0FA97A', '#C8A43E', '#8B6CF6',
  '#2DC8D8', '#E05252', '#5BADC7', '#DDB84A',
  '#4CAF8A', '#F97316',
];

export default function Clientes() {
  const { clientesNuevos, clientesCero, resumen, necesidadCliente, loadingFase2, refetchClientes } = useDashboardStore();
  const [expandedNec, setExpandedNec] = useState(null);
  const [filterNegocio, setFilterNegocio] = useState('');

  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [loading, setLoading] = useState(false);

  const apply = useCallback(
    async (d, h) => {
      setLoading(true);
      try {
        await refetchClientes(d || undefined, h || undefined);
      } finally {
        setLoading(false);
      }
    },
    [refetchClientes]
  );

  const quickFilter = (tipo) => {
    let d = '', h = '';
    if (tipo === '30d') {
      d = diasAtras(30);
      h = hoy();
    } else if (tipo === 'mes') {
      d = inicioMes();
      h = hoy();
    }
    setDesde(d);
    setHasta(h);
    apply(d, h);
  };

  const handleApply = () => apply(desde, hasta);

  const porVend = useMemo(
    () => [...(clientesNuevos.por_vendedor || [])].sort((a, b) => (b.cantidad || 0) - (a.cantidad || 0)),
    [clientesNuevos]
  );

  const porMes = useMemo(() => clientesNuevos.por_mes || [], [clientesNuevos]);

  const topVend = porVend[0];

  return (
    <div className="animate-fade-in">
      {/* KPIs */}
      <SectionTitle>Resumen Clientes</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <KpiCard
          label="Nuevos"
          value={String(clientesNuevos.total || 0)}
          color="green"
        />
        <KpiCard
          label="Top Vendedor"
          value={topVend?.vendedor || '—'}
          sub={topVend ? `${topVend.cantidad} clientes` : undefined}
          color="blue"
        />
        <KpiCard
          label="Clientes Cero"
          value={String(clientesCero.total || 0)}
          color="red"
        />
        <KpiCard
          label="Maestro Total"
          value={String(resumen?.clientes_maestro || 0)}
          color="cyan"
        />
      </div>

      {/* Filtros fecha */}
      <SectionTitle>Filtros</SectionTitle>
      <div
        className="flex flex-wrap items-center gap-3 mb-5 p-4 rounded-xl border"
        style={{ background: 'rgba(13,30,43,0.6)', borderColor: 'var(--border-2)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-palumar-muted" style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            Desde
          </span>
          <input
            type="date"
            value={desde}
            onChange={e => setDesde(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-palumar-muted" style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            Hasta
          </span>
          <input
            type="date"
            value={hasta}
            onChange={e => setHasta(e.target.value)}
          />
        </div>
        <button
          onClick={handleApply}
          disabled={loading}
          className="h-8 px-4 rounded-lg text-xs font-semibold text-white transition-all"
          style={{ background: 'var(--blue)', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? 'Cargando…' : 'Aplicar'}
        </button>

        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <span className="text-palumar-muted" style={{ fontSize: '11px' }}>Acceso rápido:</span>
          <button
            onClick={() => quickFilter('todo')}
            className="h-7 px-3 rounded-lg text-xs font-medium border transition-all hover:bg-navy-3"
            style={{ borderColor: 'var(--border-2)', color: 'var(--muted)' }}
          >
            Todo
          </button>
          <button
            onClick={() => quickFilter('30d')}
            className="h-7 px-3 rounded-lg text-xs font-medium border transition-all hover:bg-navy-3"
            style={{ borderColor: 'var(--border-2)', color: 'var(--muted)' }}
          >
            Últ. 30 días
          </button>
          <button
            onClick={() => quickFilter('mes')}
            className="h-7 px-3 rounded-lg text-xs font-medium border transition-all hover:bg-navy-3"
            style={{ borderColor: 'var(--border-2)', color: 'var(--muted)' }}
          >
            Este mes
          </button>
          {['2025','2024','2023'].map(yr => (
            <button
              key={yr}
              onClick={() => {
                const d = `${yr}-01-01`, h = `${yr}-12-31`;
                setDesde(d); setHasta(h); apply(d, h);
              }}
              className="h-7 px-3 rounded-lg text-xs font-medium border transition-all hover:bg-navy-3"
              style={{ borderColor: 'var(--border-2)', color: 'var(--muted)' }}
            >
              {yr}
            </button>
          ))}
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Ranking por vendedor */}
        <div className="chart-card">
          <div className="font-display font-bold text-palumar-white mb-4" style={{ fontSize: '14px' }}>
            Nuevos por Vendedor
          </div>
          {porVend.length > 0 ? (
            <HBarChart
              labels={porVend.map(v => v.vendedor)}
              data={porVend.map(v => v.cantidad)}
              barColors={porVend.map((_, i) => VEND_COLORS[i % VEND_COLORS.length])}
              formatValue={(v) => String(v)}
              minH={120}
              rowH={34}
            />
          ) : (
            <div className="text-center py-10 text-palumar-muted text-sm">Sin datos</div>
          )}
        </div>

        {/* Tendencia mensual */}
        <div className="chart-card">
          <div className="font-display font-bold text-palumar-white mb-4" style={{ fontSize: '14px' }}>
            Tendencia Mensual
          </div>
          {porMes.length > 0 ? (
            <LineChart
              labels={porMes.map(m => mesLabel(m.mes || m.periodo) || m.mes || m.periodo)}
              datasets={[{
                label: 'Nuevos',
                data: porMes.map(m => m.cantidad || m.total || 0),
                color: '#0FA97A',
                fill: true,
              }]}
              formatValue={(v) => String(v)}
              height={240}
            />
          ) : (
            <div className="text-center py-10 text-palumar-muted text-sm">Sin datos</div>
          )}
        </div>
      </div>

      {/* Tabla ranking por vendedor */}
      <SectionTitle>Ranking por Vendedor</SectionTitle>
      <div className="table-card mb-4">
        <div className="overflow-x-auto">
          <table className="palma-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Vendedor</th>
                <th style={{ textAlign: 'right' }}>Clientes Nuevos</th>
              </tr>
            </thead>
            <tbody>
              {porVend.map((v, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-5 h-5 rounded-full flex-shrink-0"
                        style={{ background: VEND_COLORS[i % VEND_COLORS.length] }}
                      />
                      {v.vendedor}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span style={{ color: 'var(--green)', fontWeight: 600 }}>{v.cantidad}</span>
                  </td>
                </tr>
              ))}
              {!porVend.length && (
                <tr>
                  <td colSpan={3} className="text-center text-palumar-muted py-6">Sin datos en el período seleccionado</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Venta por Necesidad de Cliente ── */}
      {(() => {
        const nec = necesidadCliente || {};
        const allItems = nec.por_necesidad || [];
        const hasData = allItems.length > 0;

        // Negocios únicos para el filtro (computed inline, no hook)
        const allNegocios = (() => {
          const s = new Set();
          allItems.forEach(item => (item.por_negocio || []).forEach(n => s.add(n.negocio)));
          return [...s].sort();
        })();

        // Items filtrados por negocio seleccionado
        const items = !filterNegocio ? allItems : allItems
          .map(item => {
            const entry = (item.por_negocio || []).find(n => n.negocio === filterNegocio);
            return entry ? { ...item, total: entry.monto } : null;
          })
          .filter(x => x && x.total > 0)
          .sort((a, b) => b.total - a.total);

        const filteredTotal = items.reduce((s, x) => s + x.total, 0);
        const topNec = items[0];

        return (
          <>
            <SectionTitle>Venta por Necesidad de Cliente</SectionTitle>

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
              <KpiCard
                label={filterNegocio ? `Venta · ${filterNegocio}` : 'Venta Clasificada'}
                value={fmt(filterNegocio ? filteredTotal : (nec.total || 0))}
                color="blue"
              />
              <KpiCard label="Clientes Clasificados" value={String(nec.total_clasificados || 0)} color="cyan" />
              <KpiCard
                label="Categoría Líder"
                value={topNec?.necesidad || '—'}
                sub={topNec ? fmt(topNec.total) : undefined}
                color="purple"
              />
            </div>

            {!hasData ? (
              <div
                className="flex flex-col items-center justify-center gap-3 rounded-xl border mb-4 py-12"
                style={{ borderColor: 'var(--border-2)', background: 'rgba(13,30,43,0.5)' }}
              >
                {loadingFase2 ? (
                  <>
                    <svg className="w-7 h-7 animate-spin" viewBox="0 0 24 24" fill="none" style={{ color: '#2AAED9', opacity: 0.7 }}>
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <p className="text-palumar-muted text-sm">Cargando datos de necesidad de cliente…</p>
                  </>
                ) : (
                  <>
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--muted)', opacity: 0.5 }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-palumar-muted text-sm">Datos de necesidad de cliente no disponibles</p>
                  </>
                )}
              </div>
            ) : (
              <>
                {/* ── Filtro por negocio ── */}
                <div className="flex flex-wrap items-center gap-2 mb-5">
                  <button
                    onClick={() => setFilterNegocio('')}
                    style={{
                      fontSize: '11px', fontWeight: 700, padding: '5px 14px',
                      borderRadius: '99px', cursor: 'pointer', transition: 'all 0.15s',
                      background: !filterNegocio ? 'rgba(42,174,217,0.15)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${!filterNegocio ? 'rgba(42,174,217,0.6)' : 'rgba(255,255,255,0.1)'}`,
                      color: !filterNegocio ? '#2AAED9' : 'var(--muted)',
                    }}
                  >
                    Todos
                  </button>
                  {allNegocios.map((neg, ni) => {
                    const active = filterNegocio === neg;
                    const color = NEG_COLORS_LIST[ni % NEG_COLORS_LIST.length];
                    return (
                      <button
                        key={neg}
                        onClick={() => setFilterNegocio(active ? '' : neg)}
                        style={{
                          fontSize: '11px', fontWeight: 700, padding: '5px 14px',
                          borderRadius: '99px', cursor: 'pointer', transition: 'all 0.15s',
                          background: active ? `${color}22` : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${active ? color : 'rgba(255,255,255,0.1)'}`,
                          color: active ? color : 'var(--muted)',
                        }}
                      >
                        {neg}
                      </button>
                    );
                  })}
                </div>

                {/* Gráfico + detalle por negocio */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                  <div className="chart-card">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="font-display font-bold text-palumar-white" style={{ fontSize: '14px' }}>
                        Ventas por Necesidad
                      </span>
                      {filterNegocio && (
                        <span style={{
                          fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px',
                          background: 'rgba(42,174,217,0.12)', border: '1px solid rgba(42,174,217,0.3)',
                          color: '#2AAED9',
                        }}>
                          {filterNegocio}
                        </span>
                      )}
                    </div>
                    {items.length > 0 ? (
                      <HBarChart
                        labels={items.map(x => x.necesidad)}
                        data={items.map(x => x.total)}
                        barColors={items.map(item => {
                          const origIdx = allItems.findIndex(a => a.necesidad === item.necesidad);
                          return NEG_COLORS_LIST[(origIdx >= 0 ? origIdx : 0) % NEG_COLORS_LIST.length];
                        })}
                        minH={160}
                        rowH={38}
                      />
                    ) : (
                      <div className="text-center py-10 text-palumar-muted text-sm">Sin ventas para este negocio</div>
                    )}
                  </div>

                  {/* Panel de desglose por negocio (solo sin filtro activo) */}
                  {!filterNegocio && (
                    <div className="chart-card">
                      <div className="font-display font-bold text-palumar-white mb-3" style={{ fontSize: '14px' }}>
                        Desglose por Negocio
                      </div>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {allItems.map((item, i) => (
                          <button
                            key={item.necesidad}
                            onClick={() => setExpandedNec(expandedNec === item.necesidad ? null : item.necesidad)}
                            style={{
                              fontSize: '11px', fontWeight: 700, padding: '4px 12px',
                              borderRadius: '99px', cursor: 'pointer', transition: 'all 0.15s',
                              background: expandedNec === item.necesidad
                                ? `${NEG_COLORS_LIST[i % NEG_COLORS_LIST.length]}22`
                                : 'rgba(255,255,255,0.04)',
                              border: `1px solid ${expandedNec === item.necesidad
                                ? NEG_COLORS_LIST[i % NEG_COLORS_LIST.length]
                                : 'rgba(255,255,255,0.1)'}`,
                              color: expandedNec === item.necesidad
                                ? NEG_COLORS_LIST[i % NEG_COLORS_LIST.length]
                                : 'var(--muted)',
                            }}
                          >
                            {item.necesidad}
                          </button>
                        ))}
                      </div>
                      {(() => {
                        const sel = expandedNec
                          ? allItems.find(x => x.necesidad === expandedNec)
                          : allItems[0];
                        if (!sel) return null;
                        const negocios = sel.por_negocio || [];
                        return (
                          <div>
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-palumar-white font-semibold" style={{ fontSize: '12px' }}>{sel.necesidad}</span>
                              <span className="text-palumar-muted" style={{ fontSize: '11px' }}>
                                · {sel.clientes} cliente{sel.clientes !== 1 ? 's' : ''} · {fmt(sel.total)}
                              </span>
                            </div>
                            <div className="space-y-2">
                              {negocios.map((neg, ni) => {
                                const share = sel.total > 0 ? (neg.monto / sel.total) * 100 : 0;
                                const color = NEG_COLORS_LIST[ni % NEG_COLORS_LIST.length];
                                return (
                                  <div key={neg.negocio}>
                                    <div className="flex items-center justify-between mb-1">
                                      <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{neg.negocio}</span>
                                      <span style={{ fontSize: '11px', color, fontWeight: 600 }}>{fmt(neg.monto)}</span>
                                    </div>
                                    <div style={{ height: '5px', borderRadius: '99px', background: 'rgba(255,255,255,0.06)' }}>
                                      <div style={{
                                        height: '100%', borderRadius: '99px',
                                        width: `${share.toFixed(1)}%`,
                                        background: color,
                                        transition: 'width 0.4s ease',
                                      }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* Tabla resumen */}
                <div className="table-card mb-4">
                  <div className="px-5 py-3.5 border-b flex items-center gap-3" style={{ borderColor: 'var(--border-2)' }}>
                    <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>Resumen por Necesidad</h3>
                    {filterNegocio && (
                      <span style={{
                        fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px',
                        background: 'rgba(42,174,217,0.12)', border: '1px solid rgba(42,174,217,0.3)',
                        color: '#2AAED9',
                      }}>
                        {filterNegocio}
                      </span>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="palma-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Necesidad</th>
                          <th style={{ textAlign: 'right' }}>Clientes</th>
                          <th style={{ textAlign: 'right' }}>Venta Total</th>
                          <th style={{ textAlign: 'right' }}>% del Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, i) => {
                          const base = filterNegocio ? filteredTotal : (nec.total || 0);
                          const share = base > 0 ? (item.total / base) * 100 : 0;
                          const origIdx = allItems.findIndex(x => x.necesidad === item.necesidad);
                          const color = NEG_COLORS_LIST[origIdx % NEG_COLORS_LIST.length];
                          return (
                            <tr key={i}>
                              <td style={{ color: 'var(--muted)', fontSize: '11px' }}>{i + 1}</td>
                              <td>
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                                  <span style={{ fontWeight: 500 }}>{item.necesidad}</span>
                                </div>
                              </td>
                              <td style={{ textAlign: 'right', color: 'var(--cyan)' }}>{item.clientes}</td>
                              <td style={{ textAlign: 'right' }} className="font-mono-num">
                                <span style={{ color, fontWeight: 600 }}>{fmt(item.total)}</span>
                              </td>
                              <td style={{ textAlign: 'right', color: 'var(--muted)', fontSize: '11px' }}>
                                {share.toFixed(1)}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        );
      })()}

      {/* Tabla detalle completo */}
      {(clientesNuevos.detalle || []).length > 0 && (
        <>
          <SectionTitle>Detalle Completo</SectionTitle>
          <div className="table-card mb-8">
            <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-2)' }}>
              <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>
                Listado de Clientes Nuevos
              </h3>
              <span className="text-palumar-muted" style={{ fontSize: '11px' }}>
                {clientesNuevos.detalle.length} registros
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="palma-table">
                <thead>
                  <tr>
                    <th>Cód. Cliente</th>
                    <th>Asesor</th>
                    <th>Cliente / Razón Social</th>
                    <th>Fecha Creación</th>
                  </tr>
                </thead>
                <tbody>
                  {clientesNuevos.detalle.map((c, i) => (
                    <tr key={i}>
                      <td className="font-mono-num" style={{ color: 'var(--cyan)', fontWeight: 600 }}>
                        {c.cod_cliente || '—'}
                      </td>
                      <td>{c.asesor || '—'}</td>
                      <td>{c.nombre || c.razon_social || '—'}</td>
                      <td>{c.fecha_creacion || '—'}</td>
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
