import React, { useMemo, useState } from 'react';
import useDashboardStore from '../../store/dashboardStore';
import SectionTitle from '../ui/SectionTitle';
import HBarChart from '../charts/HBarChart';
import { pct, fmt, getCoberturaVendedor, getCoberturaValue } from '../../utils/formatters';
import { VEND_COLORS } from '../../utils/colors';

export default function Cobertura() {
  const { cobertura, cobNegocio, clientesCero, vendedores, resumen } = useDashboardStore();

  const [vendedorSel, setVendedorSel] = useState('');

  const cobData = useMemo(
    () =>
      [...cobertura]
        .filter(r => getCoberturaValue(r) > 0)
        .sort((a, b) => getCoberturaValue(b) - getCoberturaValue(a)),
    [cobertura]
  );

  // ── Cobertura por Negocio a nivel Palumar ──────────────────────────
  const cobNegocioTotal = useMemo(() => {
    if (!cobNegocio.length) return [];

    // 1. Maestro único por vendedor (clientes_maestro es igual en todas sus filas)
    const maestroPorVend = {};
    cobNegocio.forEach(r => {
      const vCod = getCoberturaVendedor(r).split('-')[0].trim();
      if (vCod && !maestroPorVend[vCod]) {
        maestroPorVend[vCod] = Number(r.clientes_maestro || 0);
      }
    });
    const totalMaestro = Object.values(maestroPorVend).reduce((s, n) => s + n, 0);

    // 2. Sumar impactados por negocio a través de todos los vendedores
    const negMap = {};
    cobNegocio.forEach(r => {
      const neg = String(r.negocio || '').trim();
      if (!neg) return;
      if (!negMap[neg]) negMap[neg] = 0;
      negMap[neg] += Number(r.impactados || 0);
    });

    // 3. Venta por negocio desde resumen
    const ventaNeg = {};
    (resumen?.venta_por_negocio || []).forEach(n => { ventaNeg[n.negocio] = n.venta; });

    // 4. Construir array final, solo negocios con actividad
    return Object.entries(negMap)
      .filter(([, imp]) => imp > 0)
      .map(([negocio, impactados]) => ({
        negocio,
        maestro:    totalMaestro,
        impactados,
        sinCompra:  totalMaestro - impactados,
        cobertura:  totalMaestro > 0 ? Math.round(impactados / totalMaestro * 1000) / 10 : 0,
        venta:      ventaNeg[negocio] || 0,
      }))
      .sort((a, b) => b.cobertura - a.cobertura);
  }, [cobNegocio, resumen]);

  // Lista de vendedores únicos con datos de cobNegocio
  const vendedoresNeg = useMemo(() => {
    const seen = new Set();
    return cobNegocio
      .map(r => getCoberturaVendedor(r))
      .filter(v => { if (!v || seen.has(v)) return false; seen.add(v); return true; })
      .sort();
  }, [cobNegocio]);

  // Mapa cod_vendedor → clientes cero (desde FRECUENCIA_ECOM vía clientesCero)
  const ceroCodMap = useMemo(() => {
    const map = {};
    (clientesCero.por_vendedor || []).forEach(r => {
      if (r.cod) map[String(r.cod).trim()] = r.cantidad;
    });
    return map;
  }, [clientesCero]);

  // Mapa negocio → venta $ del vendedor seleccionado — debe declararse ANTES de negVend
  const ventaNegMap = useMemo(() => {
    if (!vendedorSel) return {};
    const cod = vendedorSel.split('-')[0].trim();
    const vend = vendedores.find(v =>
      String(v.cod || '').trim() === cod ||
      (v.nom_vendedor || v.vendedor || v.nombre || '') === vendedorSel
    );
    const map = {};
    (vend?.venta_por_negocio || []).forEach(n => { map[n.negocio] = n.venta; });
    return map;
  }, [vendedores, vendedorSel]);

  // Negocios del vendedor seleccionado (solo los que tienen actividad)
  const negVend = useMemo(() => {
    if (!vendedorSel) return [];
    const cod = vendedorSel.split('-')[0].trim();
    return cobNegocio
      .filter(r => {
        const vCod = getCoberturaVendedor(r).split('-')[0].trim();
        return vCod === cod && r.negocio && String(r.negocio).trim() !== '';
      })
      .filter(r => getCoberturaValue(r) > 0 || (ventaNegMap[r.negocio] || 0) > 0)
      .sort((a, b) => getCoberturaValue(b) - getCoberturaValue(a));
  }, [cobNegocio, vendedorSel, ventaNegMap]);

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
                const label     = getCoberturaVendedor(r);
                const cod       = label.split('-')[0].trim();
                const sinCompra = ceroCodMap[cod] ?? r.sin_compra ?? 0;
                return (
                  <tr key={i}>
                    <td>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-5 h-5 rounded-full flex-shrink-0"
                          style={{ background: VEND_COLORS[i % VEND_COLORS.length] }}
                        />
                        {label}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>{r.clientes_maestro || 0}</td>
                    <td style={{ textAlign: 'right' }}>{r.impactados || 0}</td>
                    <td style={{ textAlign: 'right' }} className="font-mono-num">
                      <span style={{ color: cob >= 95 ? 'var(--green)' : cob >= 75 ? 'var(--amber)' : 'var(--red)' }}>
                        {pct(cob)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ color: sinCompra > 0 ? 'var(--red)' : 'var(--muted)' }}>{sinCompra}</span>
                    </td>
                    <td><span className={`badge ${badgeClass}`}>{badgeLabel}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Cobertura por Negocio — Palumar Total ── */}
      {cobNegocioTotal.length > 0 && (
        <>
          <SectionTitle>Cobertura por Negocio — Palumar</SectionTitle>

          {/* Gráfica % */}
          <div className="chart-card mb-4">
            <div className="font-display font-semibold mb-3" style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Cobertura %
            </div>
            <HBarChart
              labels={cobNegocioTotal.map(r => r.negocio)}
              data={cobNegocioTotal.map(r => r.cobertura)}
              barColors={cobNegocioTotal.map((_, i) => VEND_COLORS[i % VEND_COLORS.length])}
              isPct
              metaValue={95}
              metaLabel="Meta 95%"
              minH={80}
              rowH={34}
            />
          </div>

          {/* Tabla detalle */}
          <div className="table-card mb-6">
            <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-2)' }}>
              <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>
                Detalle por Negocio
              </h3>
              <span className="text-palumar-muted" style={{ fontSize: '11px' }}>
                {cobNegocioTotal.length} líneas activas
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="palma-table">
                <thead>
                  <tr>
                    <th>Negocio</th>
                    <th style={{ textAlign: 'right' }}>Impactados</th>
                    <th style={{ textAlign: 'right' }}>Sin compra</th>
                    <th style={{ textAlign: 'right' }}>Cobertura</th>
                    <th style={{ textAlign: 'right' }}>Venta $</th>
                  </tr>
                </thead>
                <tbody>
                  {cobNegocioTotal.map((r, i) => {
                    const cobCol = r.cobertura >= 95 ? 'var(--green)' : r.cobertura >= 75 ? 'var(--amber)' : 'var(--red)';
                    return (
                      <tr key={r.negocio}>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-sm flex-shrink-0"
                              style={{ background: VEND_COLORS[i % VEND_COLORS.length] }} />
                            {r.negocio}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }} className="font-mono-num">
                          <span style={{ color: 'var(--green)' }}>{r.impactados}</span>
                        </td>
                        <td style={{ textAlign: 'right' }} className="font-mono-num">
                          <span style={{ color: r.sinCompra > 0 ? 'var(--red)' : 'var(--muted)' }}>{r.sinCompra}</span>
                        </td>
                        <td style={{ textAlign: 'right' }} className="font-mono-num">
                          <span style={{ fontWeight: 700, color: cobCol }}>{pct(r.cobertura)}</span>
                        </td>
                        <td style={{ textAlign: 'right' }} className="font-mono-num">
                          {r.venta > 0
                            ? <span style={{ color: 'var(--cyan)' }}>{fmt(r.venta)}</span>
                            : <span style={{ color: 'var(--muted)' }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '1px solid var(--border-2)' }}>
                    <td className="font-semibold" style={{ color: 'var(--palumar-white)', fontSize: '11px' }}>
                      Total activos
                    </td>
                    <td style={{ textAlign: 'right' }} className="font-mono-num font-semibold">
                      {cobNegocioTotal.reduce((s, r) => s + r.impactados, 0)}
                    </td>
                    <td style={{ textAlign: 'right' }} className="font-mono-num font-semibold">
                      <span style={{ color: 'var(--red)' }}>
                        {cobNegocioTotal.reduce((s, r) => s + r.sinCompra, 0)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }} className="font-mono-num font-semibold">
                      —
                    </td>
                    <td style={{ textAlign: 'right' }} className="font-mono-num font-semibold">
                      <span style={{ color: 'var(--cyan)' }}>
                        {fmt(cobNegocioTotal.reduce((s, r) => s + r.venta, 0))}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

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
