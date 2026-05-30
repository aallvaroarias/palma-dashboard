import React, { useMemo } from 'react';
import useDashboardStore from '../../store/dashboardStore';
import SectionTitle from '../ui/SectionTitle';
import HBarChart from '../charts/HBarChart';
import { pct, getCoberturaVendedor, esRutaCentral } from '../../utils/formatters';
import { VEND_COLORS } from '../../utils/colors';

export default function Efectividad() {
  const { efectividad } = useDashboardStore();

  // Excluir Ruta Centrales de todas las vistas de efectividad
  const resMes = useMemo(
    () => (efectividad.resumen_mes || []).filter(r => !esRutaCentral(getCoberturaVendedor(r))),
    [efectividad]
  );
  const porSemana = useMemo(
    () => (efectividad.por_semana || []).filter(r => !esRutaCentral(getCoberturaVendedor(r))),
    [efectividad]
  );

  const efField = useMemo(() => {
    if (!resMes.length) return 'efectividad';
    return Object.keys(resMes[0]).find(k => k.includes('efectividad')) || 'efectividad';
  }, [resMes]);

  return (
    <div className="animate-fade-in">
      <SectionTitle>Efectividad Acumulada</SectionTitle>

      {/* Cumulative bar */}
      <div className="chart-card mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-display font-bold text-palumar-white" style={{ fontSize: '14px' }}>
            Acumulado Mes
          </div>
          <span className="text-palumar-muted" style={{ fontSize: '11px' }}>
            Meta: <strong style={{ color: 'var(--red)' }}>90%</strong>
          </span>
        </div>
        {resMes.length > 0 ? (
          <HBarChart
            labels={resMes.map(r => getCoberturaVendedor(r))}
            data={resMes.map(r => +r[efField] || 0)}
            barColors={resMes.map((_, i) => VEND_COLORS[i % VEND_COLORS.length])}
            isPct
            metaValue={90}
            metaLabel="Meta 90%"
          />
        ) : (
          <div className="text-center py-10 text-palumar-muted text-sm">Sin datos disponibles</div>
        )}
      </div>

      {/* Detail table by week */}
      <SectionTitle>Detalle por Semana</SectionTitle>
      <div className="table-card mb-8">
        <div className="px-5 py-3.5 border-b" style={{ borderColor: 'var(--border-2)' }}>
          <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>
            Efectividad Semanal
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="palma-table">
            <thead>
              <tr>
                <th>Vendedor</th>
                <th style={{ textAlign: 'right' }}>Semana</th>
                <th style={{ textAlign: 'right' }}>Impactos</th>
                <th style={{ textAlign: 'right' }}>Maestra</th>
                <th style={{ textAlign: 'right' }}>Efectividad</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {porSemana.slice(0, 100).map((r, i) => {
                const ef = +r.efectividad || +r[efField] || 0;
                const badgeClass = ef >= 90 ? 'badge-green' : ef >= 75 ? 'badge-amber' : 'badge-red';
                const badgeLabel = ef >= 90 ? 'En meta' : ef >= 75 ? 'Cerca' : 'Bajo meta';
                return (
                  <tr key={i}>
                    <td>{getCoberturaVendedor(r)}</td>
                    <td style={{ textAlign: 'right' }}>Sem. {r.semana || r.periodo || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{r.impactos || 0}</td>
                    <td style={{ textAlign: 'right' }}>{r.maestra || r.maestro || 0}</td>
                    <td style={{ textAlign: 'right' }} className="font-mono-num">
                      <span style={{ color: ef >= 90 ? 'var(--green)' : ef >= 75 ? 'var(--amber)' : 'var(--red)' }}>
                        {pct(ef)}
                      </span>
                    </td>
                    <td><span className={`badge ${badgeClass}`}>{badgeLabel}</span></td>
                  </tr>
                );
              })}
              {!porSemana.length && (
                <tr>
                  <td colSpan={6} className="text-center text-palumar-muted py-6">Sin datos</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
