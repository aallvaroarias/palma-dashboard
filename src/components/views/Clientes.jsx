import React, { useState, useMemo, useCallback } from 'react';
import useDashboardStore from '../../store/dashboardStore';
import KpiCard from '../ui/KpiCard';
import SectionTitle from '../ui/SectionTitle';
import HBarChart from '../charts/HBarChart';
import LineChart from '../charts/LineChart';
import { hoy, diasAtras, inicioMes, mesLabel } from '../../utils/formatters';
import { VEND_COLORS } from '../../utils/colors';

export default function Clientes() {
  const { clientesNuevos, clientesCero, resumen, refetchClientes } = useDashboardStore();

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
                    <th>Asesor</th>
                    <th>Cliente</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {clientesNuevos.detalle.map((c, i) => (
                    <tr key={i}>
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
