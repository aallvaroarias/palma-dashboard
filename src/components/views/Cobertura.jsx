import React, { useMemo } from 'react';
import useDashboardStore from '../../store/dashboardStore';
import SectionTitle from '../ui/SectionTitle';
import HBarChart from '../charts/HBarChart';
import { pct, getCoberturaVendedor, getCoberturaValue } from '../../utils/formatters';
import { VEND_COLORS } from '../../utils/colors';

export default function Cobertura() {
  const { cobertura, clientesCero } = useDashboardStore();

  const cobData = useMemo(
    () =>
      [...cobertura]
        .filter(r => getCoberturaValue(r) > 0)
        .sort((a, b) => getCoberturaValue(b) - getCoberturaValue(a)),
    [cobertura]
  );

  return (
    <div className="animate-fade-in">
      <SectionTitle>Cobertura por Vendedor</SectionTitle>

      {/* Chart */}
      <div className="chart-card mb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="font-display font-bold text-palumar-white" style={{ fontSize: '14px' }}>
            Cobertura Real
          </div>
          <span className="text-palumar-muted" style={{ fontSize: '11px' }}>
            Meta: <strong style={{ color: 'var(--red)' }}>75%</strong>
          </span>
        </div>
        <HBarChart
          labels={cobData.map(r => getCoberturaVendedor(r))}
          data={cobData.map(r => getCoberturaValue(r))}
          barColors={cobData.map((_, i) => VEND_COLORS[i % VEND_COLORS.length])}
          isPct
          metaValue={75}
          metaLabel="Meta 75%"
        />
      </div>

      {/* Table */}
      <div className="table-card mb-6">
        <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-2)' }}>
          <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>
            Detalle Cobertura
          </h3>
          <span className="text-palumar-muted" style={{ fontSize: '11px' }}>
            {cobData.length} vendedores
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="palma-table">
            <thead>
              <tr>
                <th>Vendedor</th>
                <th style={{ textAlign: 'right' }}>Maestro</th>
                <th style={{ textAlign: 'right' }}>Impactados</th>
                <th style={{ textAlign: 'right' }}>Cobertura</th>
                <th style={{ textAlign: 'right' }}>Sin compra</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {cobData.map((r, i) => {
                const cob = getCoberturaValue(r);
                const badgeClass = cob >= 75 ? 'badge-green' : cob >= 60 ? 'badge-amber' : 'badge-red';
                const badgeLabel = cob >= 75 ? 'En meta' : cob >= 60 ? 'Cerca' : 'Bajo meta';
                return (
                  <tr key={i}>
                    <td>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-5 h-5 rounded-full flex-shrink-0"
                          style={{ background: VEND_COLORS[i % VEND_COLORS.length] }}
                        />
                        {getCoberturaVendedor(r)}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>{r.clientes_maestro || 0}</td>
                    <td style={{ textAlign: 'right' }}>{r.impactados || 0}</td>
                    <td style={{ textAlign: 'right' }} className="font-mono-num">
                      <span style={{ color: cob >= 75 ? 'var(--green)' : cob >= 60 ? 'var(--amber)' : 'var(--red)' }}>
                        {pct(cob)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>{r.sin_compra || 0}</td>
                    <td><span className={`badge ${badgeClass}`}>{badgeLabel}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Clientes Cero */}
      <SectionTitle>Clientes Sin Compra</SectionTitle>
      <div className="mb-3 flex items-center gap-2">
        <span
          className="font-mono-num font-medium text-palumar-white"
          style={{ fontSize: '28px' }}
        >
          {clientesCero.total || 0}
        </span>
        <span className="text-palumar-muted text-sm">clientes sin compra en el período</span>
      </div>
      <div className="table-card mb-8">
        <div className="px-5 py-3.5 border-b" style={{ borderColor: 'var(--border-2)' }}>
          <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>
            Por Vendedor
          </h3>
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
              {(clientesCero.por_vendedor || []).map((r, i) => (
                <tr key={i}>
                  <td>{getCoberturaVendedor(r)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span style={{ color: 'var(--red)' }}>{r.cantidad}</span>
                  </td>
                </tr>
              ))}
              {(!clientesCero.por_vendedor || !clientesCero.por_vendedor.length) && (
                <tr>
                  <td colSpan={2} className="text-center text-palumar-muted py-4">Sin datos</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
