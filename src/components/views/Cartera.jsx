import React, { useMemo, useState } from 'react';
import useDashboardStore from '../../store/dashboardStore';
import KpiCard from '../ui/KpiCard';
import SectionTitle from '../ui/SectionTitle';
import HBarChart from '../charts/HBarChart';
import { fmt, pct } from '../../utils/formatters';
import { VEND_COLORS } from '../../utils/colors';

const TRAMO_COLORS = {
  '0-30':  '#2AAED9',
  '31-60': '#F59E0B',
  '61-90': '#F97316',
  '+90':   '#EF4444',
};

const TRAMO_LABELS = {
  '0-30':  '0-30 días',
  '31-60': '31-60 días',
  '61-90': '61-90 días',
  '+90':   '+90 días',
};

// Combina cod y nombre tal como aparece en col E del sheet
function clienteLabel(c) {
  if (c.cliente) return c.cliente;
  return c.cod_cliente
    ? `${c.cod_cliente}${c.nom_cliente ? ' - ' + c.nom_cliente : ''}`
    : (c.nom_cliente || '—');
}

export default function Cartera() {
  const { cartera } = useDashboardStore();
  const [vendedorSel, setVendedorSel] = useState('');

  const { total_pendiente, total_facturas, por_vendedor, por_tramo, top_clientes, detalle } = cartera;

  const montoVencido = useMemo(() =>
    (por_tramo || []).filter(t => t.tramo !== '0-30').reduce((s, t) => s + t.monto, 0),
  [por_tramo]);

  const pctVencido = total_pendiente > 0 ? (montoVencido / total_pendiente * 100) : 0;

  const mayorDeudor = top_clientes?.[0];

  const detalleVend = useMemo(() => {
    if (!vendedorSel) return detalle || [];
    return (detalle || []).filter(r => r.cod_asesor === vendedorSel);
  }, [detalle, vendedorSel]);

  const noData = !total_pendiente && !total_facturas;

  if (noData) {
    return (
      <div className="animate-fade-in">
        <SectionTitle>Cartera</SectionTitle>
        <div className="chart-card flex flex-col items-center justify-center py-16 gap-3">
          <div style={{ fontSize: '36px' }}>📋</div>
          <p className="text-palumar-white font-semibold text-sm">Sin datos de cartera</p>
          <p className="text-palumar-muted text-xs text-center max-w-xs">
            Crea una pestaña <strong style={{ color: 'var(--cyan)' }}>CARTERA</strong> en Google Sheets
            y pega el reporte CxC exportado de tu sistema. Luego haz un nuevo deploy del Apps Script.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* ── KPIs ── */}
      <SectionTitle>Cartera Pendiente</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Total Pendiente"     value={fmt(total_pendiente)} color="red" />
        <KpiCard label="Facturas Pendientes" value={String(total_facturas)} color="amber" />
        <KpiCard
          label="Cartera Vencida"
          value={fmt(montoVencido)}
          sub={`${pct(pctVencido)} del total`}
          color={pctVencido > 30 ? 'red' : 'amber'}
          barValue={pctVencido}
        />
        {mayorDeudor && (
          <KpiCard
            label="Mayor Deudor"
            value={fmt(mayorDeudor.total)}
            sub={clienteLabel(mayorDeudor)}
            color="blue"
          />
        )}
      </div>

      {/* ── Aging ── */}
      <SectionTitle>Antigüedad de Cartera</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {(por_tramo || []).map(t => (
          <div key={t.tramo} className="chart-card text-center">
            <div className="text-palumar-muted mb-1" style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {TRAMO_LABELS[t.tramo] || t.tramo}
            </div>
            <div className="font-mono-num font-bold" style={{ fontSize: '20px', color: TRAMO_COLORS[t.tramo] || 'var(--white)' }}>
              {fmt(t.monto)}
            </div>
            <div className="text-palumar-muted" style={{ fontSize: '11px', marginTop: '2px' }}>
              {total_pendiente > 0 ? pct(t.monto / total_pendiente * 100) : '—'}
            </div>
            <div style={{ marginTop: '8px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.07)' }}>
              <div style={{
                height: '100%', borderRadius: '2px',
                width: `${total_pendiente > 0 ? Math.min(t.monto / total_pendiente * 100, 100) : 0}%`,
                background: TRAMO_COLORS[t.tramo] || 'var(--blue)',
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* ── Por Vendedor ── */}
      <SectionTitle>Cartera por Vendedor</SectionTitle>
      <div className="chart-card mb-4">
        <HBarChart
          labels={(por_vendedor || []).map(v => v.asesor)}
          data={(por_vendedor || []).map(v => v.total)}
          barColors={(por_vendedor || []).map((_, i) => VEND_COLORS[i % VEND_COLORS.length])}
        />
      </div>
      <div className="table-card mb-6">
        <div className="px-5 py-3.5 border-b" style={{ borderColor: 'var(--border-2)' }}>
          <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>Detalle por Vendedor</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="palma-table">
            <thead>
              <tr>
                <th>Vendedor</th>
                <th style={{ textAlign: 'right' }}>0-30 d</th>
                <th style={{ textAlign: 'right' }}>31-60 d</th>
                <th style={{ textAlign: 'right' }}>61-90 d</th>
                <th style={{ textAlign: 'right' }}>+90 d</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ textAlign: 'right' }}>Fact.</th>
              </tr>
            </thead>
            <tbody>
              {(por_vendedor || []).map((v, i) => (
                <tr key={i}>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: VEND_COLORS[i % VEND_COLORS.length] }} />
                      {v.asesor}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }} className="font-mono-num">
                    <span style={{ color: 'var(--cyan)' }}>{v.tramos?.['0-30'] > 0 ? fmt(v.tramos['0-30']) : '—'}</span>
                  </td>
                  <td style={{ textAlign: 'right' }} className="font-mono-num">
                    <span style={{ color: 'var(--amber)' }}>{v.tramos?.['31-60'] > 0 ? fmt(v.tramos['31-60']) : '—'}</span>
                  </td>
                  <td style={{ textAlign: 'right' }} className="font-mono-num">
                    <span style={{ color: '#F97316' }}>{v.tramos?.['61-90'] > 0 ? fmt(v.tramos['61-90']) : '—'}</span>
                  </td>
                  <td style={{ textAlign: 'right' }} className="font-mono-num">
                    <span style={{ color: 'var(--red)' }}>{v.tramos?.['+90'] > 0 ? fmt(v.tramos['+90']) : '—'}</span>
                  </td>
                  <td style={{ textAlign: 'right' }} className="font-mono-num">
                    <strong style={{ color: 'var(--white)' }}>{fmt(v.total)}</strong>
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--muted)' }} className="font-mono-num">
                    {v.facturas}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Top Clientes ── */}
      <SectionTitle>Top Clientes con Cartera Pendiente</SectionTitle>
      <div className="table-card mb-6">
        <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-2)' }}>
          <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>
            Top {top_clientes?.length || 0} clientes
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="palma-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Cliente</th>
                <th>Vendedor</th>
                <th style={{ textAlign: 'right' }}>Fact.</th>
                <th style={{ textAlign: 'right' }}>Pendiente</th>
                <th style={{ textAlign: 'right' }}>% total</th>
              </tr>
            </thead>
            <tbody>
              {(top_clientes || []).map((c, i) => {
                const pctT = total_pendiente > 0 ? (c.total / total_pendiente * 100) : 0;
                return (
                  <tr key={i}>
                    <td className="font-mono-num" style={{ color: 'var(--muted)', fontSize: '11px' }}>{i + 1}</td>
                    <td style={{ fontWeight: 500 }}>{clienteLabel(c)}</td>
                    <td style={{ color: 'var(--muted)', fontSize: '12px' }}>{c.asesor}</td>
                    <td style={{ textAlign: 'right', color: 'var(--muted)' }} className="font-mono-num">{c.facturas}</td>
                    <td style={{ textAlign: 'right' }} className="font-mono-num">
                      <strong style={{ color: pctT > 15 ? 'var(--red)' : 'var(--white)' }}>{fmt(c.total)}</strong>
                    </td>
                    <td style={{ textAlign: 'right' }} className="font-mono-num">
                      <span style={{ color: pctT > 15 ? 'var(--red)' : 'var(--muted)' }}>{pct(pctT)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Detalle ── */}
      <SectionTitle>Detalle de Facturas</SectionTitle>
      <div className="table-card mb-8">
        <div className="px-5 py-3.5 border-b flex items-center gap-3 flex-wrap" style={{ borderColor: 'var(--border-2)' }}>
          <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>Facturas pendientes</h3>
          <select
            className="palma-select ml-auto"
            value={vendedorSel}
            onChange={e => setVendedorSel(e.target.value)}
          >
            <option value="">— Todos los vendedores —</option>
            {(por_vendedor || []).map(v => (
              <option key={v.cod_asesor} value={v.cod_asesor}>{v.asesor}</option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="palma-table">
            <thead>
              <tr>
                <th>N° Factura</th>
                <th>Cliente</th>
                <th>Vendedor</th>
                <th>Ciudad</th>
                <th style={{ textAlign: 'right' }}>Fecha</th>
                <th style={{ textAlign: 'right' }}>Días</th>
                <th>Tramo</th>
                <th style={{ textAlign: 'right' }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {detalleVend.map((r, i) => (
                <tr key={i}>
                  <td className="font-mono-num" style={{ color: 'var(--muted)', fontSize: '11px' }}>{r.nro_ruc}</td>
                  <td style={{ fontSize: '12px', fontWeight: 500 }}>{clienteLabel(r)}</td>
                  <td style={{ color: 'var(--muted)', fontSize: '11px' }}>{r.nom_asesor}</td>
                  <td style={{ color: 'var(--muted)', fontSize: '11px' }}>{r.ciudad?.split('(')[0].trim() || '—'}</td>
                  <td style={{ textAlign: 'right', color: 'var(--muted)', fontSize: '11px' }} className="font-mono-num">{r.fecha}</td>
                  <td style={{ textAlign: 'right' }} className="font-mono-num">
                    <span style={{ color: r.dias_vencido > 60 ? 'var(--red)' : r.dias_vencido > 30 ? 'var(--amber)' : 'var(--muted)' }}>
                      {r.dias_vencido}d
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${r.tramo === '0-30' ? 'badge-green' : r.tramo === '31-60' ? 'badge-amber' : 'badge-red'}`}>
                      {TRAMO_LABELS[r.tramo]}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }} className="font-mono-num">
                    <strong style={{ color: r.tramo === '+90' || r.tramo === '61-90' ? 'var(--red)' : 'var(--white)' }}>
                      {fmt(r.valor)}
                    </strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
