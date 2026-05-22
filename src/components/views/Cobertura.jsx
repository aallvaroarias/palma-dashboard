import React, { useMemo, useState } from 'react';
import useDashboardStore from '../../store/dashboardStore';
import SectionTitle from '../ui/SectionTitle';
import HBarChart from '../charts/HBarChart';
import { pct, fmt, getCoberturaVendedor, getCoberturaValue } from '../../utils/formatters';
import { VEND_COLORS } from '../../utils/colors';

export default function Cobertura() {
  const { cobertura, cobNegocio, clientesCero, vendedores } = useDashboardStore();

  const [vendedorSel, setVendedorSel] = useState('');

  const cobData = useMemo(
    () =>
      [...cobertura]
        .filter(r => getCoberturaValue(r) > 0)
        .sort((a, b) => getCoberturaValue(b) - getCoberturaValue(a)),
    [cobertura]
  );

  // Lista de vendedores únicos con datos de cobNegocio
  const vendedoresNeg = useMemo(() => {
    const seen = new Set();
    return cobNegocio
      .map(r => getCoberturaVendedor(r))
      .filter(v => { if (!v || seen.has(v)) return false; seen.add(v); return true; })
      .sort();
  }, [cobNegocio]);

  // Negocios del vendedor seleccionado
  const negVend = useMemo(() => {
    if (!vendedorSel) return [];
    return cobNegocio
      .filter(r => getCoberturaVendedor(r) === vendedorSel)
      .sort((a, b) => getCoberturaValue(b) - getCoberturaValue(a));
  }, [cobNegocio, vendedorSel]);

  // Mapa negocio → venta $ del vendedor seleccionado (desde vendedores)
  const ventaNegMap = useMemo(() => {
    if (!vendedorSel) return {};
    const vend = vendedores.find(v =>
      (v.nom_vendedor || v.vendedor || v.nombre || '') === vendedorSel
    );
    const map = {};
    (vend?.venta_por_negocio || []).forEach(n => { map[n.negocio] = n.venta; });
    return map;
  }, [vendedores, vendedorSel]);

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
            Meta: <strong style={{ color: 'var(--red)' }}>95%</strong>
          </span>
        </div>
        <HBarChart
          labels={cobData.map(r => getCoberturaVendedor(r))}
          data={cobData.map(r => getCoberturaValue(r))}
          barColors={cobData.map((_, i) => VEND_COLORS[i % VEND_COLORS.length])}
          isPct
          metaValue={95}
          metaLabel="Meta 95%"
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
                const badgeClass = cob >= 95 ? 'badge-green' : cob >= 75 ? 'badge-amber' : 'badge-red';
                const badgeLabel = cob >= 95 ? 'En meta' : cob >= 75 ? 'Cerca' : 'Bajo meta';
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
                      <span style={{ color: cob >= 95 ? 'var(--green)' : cob >= 75 ? 'var(--amber)' : 'var(--red)' }}>
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

      {/* ── Cobertura por Negocio — Individual ── */}
      {vendedoresNeg.length > 0 && (
        <>
          <SectionTitle>Cobertura por Negocio — Individual</SectionTitle>
          <div className="chart-card mb-4">
            <div className="flex items-center gap-3 mb-4">
              <select
                className="palma-select"
                value={vendedorSel}
                onChange={e => setVendedorSel(e.target.value)}
              >
                <option value="">— Selecciona un vendedor —</option>
                {vendedoresNeg.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

            {!vendedorSel ? (
              <p className="text-center text-palumar-muted text-sm py-6">
                Selecciona un vendedor para ver su cobertura por línea de negocio
              </p>
            ) : negVend.length === 0 ? (
              <p className="text-center text-palumar-muted text-sm py-6">Sin datos</p>
            ) : (
              <>
                {/* ── Gráfica cobertura % ── */}
                <div className="font-display font-semibold mb-2" style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                  Cobertura %
                </div>
                <HBarChart
                  labels={negVend.map(r => r.negocio || getCoberturaVendedor(r))}
                  data={negVend.map(r => getCoberturaValue(r))}
                  barColors={negVend.map((_, i) => VEND_COLORS[i % VEND_COLORS.length])}
                  isPct
                  metaValue={95}
                  metaLabel="Meta 95%"
                  minH={100}
                  rowH={36}
                />

                {/* ── Gráfica ventas $ ── */}
                <div className="font-display font-semibold mt-5 mb-2" style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                  Venta $
                </div>
                <HBarChart
                  labels={negVend.map(r => r.negocio || getCoberturaVendedor(r))}
                  data={negVend.map(r => ventaNegMap[r.negocio] || 0)}
                  barColors={negVend.map((_, i) => VEND_COLORS[i % VEND_COLORS.length])}
                  minH={100}
                  rowH={36}
                />

                {/* ── Tabla combinada ── */}
                <div className="mt-5 overflow-x-auto">
                  <table className="palma-table">
                    <thead>
                      <tr>
                        <th>Negocio</th>
                        <th style={{ textAlign: 'right' }}>Maestro</th>
                        <th style={{ textAlign: 'right' }}>Impactados</th>
                        <th style={{ textAlign: 'right' }}>Sin compra</th>
                        <th style={{ textAlign: 'right' }}>Cobertura</th>
                        <th style={{ textAlign: 'right' }}>Venta $</th>
                      </tr>
                    </thead>
                    <tbody>
                      {negVend.map((r, i) => {
                        const cob        = getCoberturaValue(r);
                        const maestro    = Number(r.clientes_maestro || r.maestro || 0);
                        const impactados = Number(r.impactados || 0);
                        const sinCompra  = maestro - impactados;
                        const venta      = ventaNegMap[r.negocio] || 0;
                        return (
                          <tr key={i}>
                            <td>
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-sm flex-shrink-0"
                                  style={{ background: VEND_COLORS[i % VEND_COLORS.length] }} />
                                {r.negocio || getCoberturaVendedor(r)}
                              </div>
                            </td>
                            <td style={{ textAlign: 'right' }} className="font-mono-num">{maestro}</td>
                            <td style={{ textAlign: 'right' }} className="font-mono-num">
                              <span style={{ color: 'var(--green)' }}>{impactados}</span>
                            </td>
                            <td style={{ textAlign: 'right' }} className="font-mono-num">
                              <span style={{ color: sinCompra > 0 ? 'var(--red)' : 'var(--muted)' }}>{sinCompra}</span>
                            </td>
                            <td style={{ textAlign: 'right' }} className="font-mono-num">
                              <span style={{ color: cob >= 95 ? 'var(--green)' : cob >= 75 ? 'var(--amber)' : 'var(--red)', fontWeight: 700 }}>
                                {pct(cob)}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }} className="font-mono-num">
                              <span style={{ color: 'var(--cyan)', fontWeight: 600 }}>
                                {venta > 0 ? fmt(venta) : <span style={{ color: 'var(--muted)' }}>—</span>}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      )}

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
