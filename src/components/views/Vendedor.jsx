import React, { useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import useDashboardStore from '../../store/dashboardStore';
import KpiCard from '../ui/KpiCard';
import SectionTitle from '../ui/SectionTitle';
import HBarChart from '../charts/HBarChart';
import DoughnutChart from '../charts/DoughnutChart';
import LineChart from '../charts/LineChart';
import { fmt, pct, getCoberturaValue, getCoberturaVendedor } from '../../utils/formatters';
import { VEND_COLORS, NEG_COLORS, COLORS } from '../../utils/colors';

export default function Vendedor() {
  const [params] = useSearchParams();
  const cod = params.get('v');

  const { vendedores, cobertura, cobNegocio, efectividad, skus, clientesNuevos } = useDashboardStore();

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

  const nuevosVend = useMemo(() => {
    if (!v) return [];
    return (clientesNuevos.detalle || []).filter(c => {
      return c.asesor === v.nombre || c.asesor === String(v.cod);
    });
  }, [clientesNuevos, v]);

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
  const negocios = Array.isArray(v.venta_por_negocio) ? v.venta_por_negocio : [];

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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
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
      </div>

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
              data: [+v.cobertura || 0, equipoCobPct, 75],
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
              metaValue={75}
              minH={120}
              rowH={32}
            />
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
              metaValue={80}
              metaLabel="Meta 80%"
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
        <div className={`alert-item ${+v.cobertura >= 75 ? 'alert-green' : 'alert-amber'}`}>
          <strong style={{ display: 'block', marginBottom: '2px', fontSize: '11px', fontWeight: 700 }}>
            Cobertura
          </strong>
          {pct(v.cobertura)} — Meta 75%
        </div>
      </div>

      {/* Mis clientes nuevos */}
      {nuevosVend.length > 0 && (
        <>
          <SectionTitle>Mis Clientes Nuevos</SectionTitle>
          <div className="flex items-center gap-3 mb-3">
            <KpiCard
              label="Total nuevos"
              value={String(nuevosVend.length)}
              color="green"
            />
          </div>
          <div className="table-card mb-4">
            <div className="px-5 py-3.5 border-b" style={{ borderColor: 'var(--border-2)' }}>
              <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>
                Detalle Clientes Nuevos
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="palma-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Razón Social</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {nuevosVend.map((c, i) => (
                    <tr key={i}>
                      <td>{c.cod || c.codigo || '—'}</td>
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
