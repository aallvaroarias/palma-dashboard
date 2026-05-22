import React, { useMemo } from 'react';
import useDashboardStore from '../../store/dashboardStore';
import KpiCard from '../ui/KpiCard';
import SectionTitle from '../ui/SectionTitle';
import HBarChart from '../charts/HBarChart';
import { fmt, pct } from '../../utils/formatters';
import { VEND_COLORS, COLORS } from '../../utils/colors';

export default function Devoluciones() {
  const { devoluciones } = useDashboardStore();

  const d = devoluciones;
  const conceptos = useMemo(() => (d.por_concepto || []).slice(0, 10), [d]);
  const vendedorDev = useMemo(() => (d.por_vendedor || []).sort((a, b) => (b.monto || 0) - (a.monto || 0)), [d]);

  const topConcepto = conceptos[0]?.concepto || '—';
  const topVendedor = vendedorDev[0]?.vendedor || '—';

  return (
    <div className="animate-fade-in">
      {/* KPIs */}
      <SectionTitle>Resumen Devoluciones</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <KpiCard
          label="Total Devoluciones"
          value={fmt(d.total || 0)}
          color="red"
        />
        <KpiCard
          label="Top Concepto"
          value={topConcepto}
          color="amber"
        />
        <KpiCard
          label="Top Vendedor"
          value={topVendedor}
          color="purple"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Por concepto */}
        <div className="chart-card">
          <div className="font-display font-bold text-palumar-white mb-4" style={{ fontSize: '14px' }}>
            Por Concepto
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

        {/* Por vendedor */}
        <div className="chart-card">
          <div className="font-display font-bold text-palumar-white mb-4" style={{ fontSize: '14px' }}>
            Por Vendedor
          </div>
          {vendedorDev.length > 0 ? (
            <HBarChart
              labels={vendedorDev.map(x => x.vendedor)}
              data={vendedorDev.map(x => x.monto)}
              barColors={vendedorDev.map((_, i) => VEND_COLORS[i % VEND_COLORS.length])}
            />
          ) : (
            <div className="text-center py-10 text-palumar-muted text-sm">Sin datos</div>
          )}
        </div>
      </div>

      {/* Detalle table */}
      {(d.detalle || []).length > 0 && (
        <>
          <SectionTitle>Detalle de Devoluciones</SectionTitle>
          <div className="table-card mb-8">
            <div className="overflow-x-auto">
              <table className="palma-table">
                <thead>
                  <tr>
                    {Object.keys(d.detalle[0] || {}).slice(0, 6).map((k) => (
                      <th key={k}>{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.detalle.slice(0, 50).map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).slice(0, 6).map((val, j) => (
                        <td key={j}>{String(val ?? '—')}</td>
                      ))}
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
