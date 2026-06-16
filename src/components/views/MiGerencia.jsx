import React, { useMemo } from 'react';
import useDashboardStore from '../../store/dashboardStore';
import KpiCard from '../ui/KpiCard';
import SectionTitle from '../ui/SectionTitle';
import HBarChart from '../charts/HBarChart';
import { fmt, pct } from '../../utils/formatters';

// Color by cumplimiento threshold
function colorPct(v) {
  if (v >= 90) return '#0FA97A';
  if (v >= 70) return '#C8A43E';
  return '#E05252';
}

function SpinnerRow() {
  return (
    <div className="flex items-center justify-center gap-3 py-16">
      <svg className="w-6 h-6 animate-spin" viewBox="0 0 24 24" fill="none" style={{ color: '#2AAED9', opacity: 0.7 }}>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2" />
        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="text-palumar-muted text-sm">Cargando datos de gerencia…</span>
    </div>
  );
}

export default function MiGerencia() {
  const { miGerencia: d, loadingFase2 } = useDashboardStore();

  const negocios = useMemo(() => (d?.negocios || []).slice().sort((a, b) => (b.venta_real || 0) - (a.venta_real || 0)), [d]);

  // Lectura rápida
  const lectura = useMemo(() => {
    if (!d) return null;
    const r = d.resumen || {};
    const pctReal = r.cumplimiento_ecom_pct || 0;
    const pctProy = r.cumplimiento_proyectado_pct || 0;
    const dias = d.dias_habiles_restantes || 0;
    const factor = d.factor_proyeccion || 1;

    // top negocio
    const top = [...(d.negocios || [])].sort((a, b) => (b.cumplimiento_pct || 0) - (a.cumplimiento_pct || 0))[0];
    // worst negocio
    const worst = [...(d.negocios || [])].sort((a, b) => (a.cumplimiento_pct || 0) - (b.cumplimiento_pct || 0))[0];

    const lines = [];
    lines.push(`Al cierre actual se lleva ${pct(pctReal)} de cumplimiento ECOM, con proyección de ${pct(pctProy)} al fin de mes (factor ×${factor.toFixed(2)}).`);
    if (pctProy >= 90) lines.push('La proyección indica que se puede alcanzar la meta ECOM con el ritmo actual.');
    else if (pctProy >= 70) lines.push(`Quedan ${dias} día${dias !== 1 ? 's' : ''} hábil${dias !== 1 ? 'es' : ''}. Se requiere acelerar el ritmo para cerrar la brecha.`);
    else lines.push(`Brecha crítica: se requieren ${fmt(r.diario_requerido || 0)}/día hábil para alcanzar la meta ECOM en ${dias} día${dias !== 1 ? 's' : ''} restante${dias !== 1 ? 's' : ''}.`);
    if (top) lines.push(`Mejor negocio: ${top.negocio} con ${pct(top.cumplimiento_pct)} de cumplimiento.`);
    if (worst && worst.negocio !== top?.negocio) lines.push(`Negocio con mayor brecha: ${worst.negocio} (${pct(worst.cumplimiento_pct)}).`);
    return lines;
  }, [d]);

  if (!d && loadingFase2) return <SpinnerRow />;

  if (!d) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <svg className="w-10 h-10 text-palumar-muted opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <p className="text-palumar-muted text-sm">Datos de gerencia no disponibles</p>
      </div>
    );
  }

  const r = d.resumen || {};

  // Charts
  const negsSorted = [...negocios];
  const chartLabels  = negsSorted.map(n => n.negocio);
  const chartCumpl   = negsSorted.map(n => +(n.cumplimiento_pct || 0).toFixed(1));
  const chartColors  = chartCumpl.map(colorPct);

  const brechasSorted = [...negocios].sort((a, b) => (b.falta_proyectada || 0) - (a.falta_proyectada || 0));
  const brechaLabels  = brechasSorted.map(n => n.negocio);
  const brechaData    = brechasSorted.map(n => +(n.falta_proyectada || 0));

  return (
    <div>
      {/* Banner hoja faltante */}
      {d.sin_hoja_ecom && (
        <div
          className="flex items-start gap-3 rounded-xl border mb-5 px-4 py-3"
          style={{ background: 'rgba(200,164,62,0.08)', borderColor: 'rgba(200,164,62,0.3)' }}
        >
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: '#C8A43E' }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <p className="text-sm" style={{ color: '#DDB84A', lineHeight: 1.5 }}>
            <strong>Usando metas ECOM por defecto</strong> — no se encontró la hoja <code style={{ background: 'rgba(200,164,62,0.15)', padding: '1px 5px', borderRadius: 3 }}>METAS_ECOM</code> en Google Sheets.
            Crea la hoja con columnas <em>NEGOCIO</em> y <em>META_ECOM</em> para personalizar los objetivos.
          </p>
        </div>
      )}

      {/* KPI cards */}
      <div className="kpi-grid mb-1">
        <KpiCard
          label="Venta Real ECOM"
          value={fmt(r.venta_real_total)}
          sub={`de ${fmt(r.meta_ecom_total)} meta ECOM`}
          color="blue"
          barValue={r.cumplimiento_ecom_pct}
          barColor={`linear-gradient(90deg, ${colorPct(r.cumplimiento_ecom_pct || 0)}, ${colorPct(r.cumplimiento_ecom_pct || 0)}88)`}
        />
        <KpiCard
          label="Meta ECOM"
          value={fmt(r.meta_ecom_total)}
          sub={`${d.sin_hoja_ecom ? 'Meta por defecto' : 'Meta hoja METAS_ECOM'}`}
          color="amber"
        />
        <KpiCard
          label="Cumplimiento ECOM"
          value={pct(r.cumplimiento_ecom_pct)}
          sub="vs meta ECOM"
          color={r.cumplimiento_ecom_pct >= 90 ? 'green' : r.cumplimiento_ecom_pct >= 70 ? 'amber' : 'red'}
          barValue={r.cumplimiento_ecom_pct}
        />
        <KpiCard
          label="Proyección fin de mes"
          value={fmt(r.proyeccion_total)}
          sub={`×${(d.factor_proyeccion || 1).toFixed(2)} · ${pct(r.cumplimiento_proyectado_pct)} proy.`}
          color="cyan"
          barValue={r.cumplimiento_proyectado_pct}
          barColor={`linear-gradient(90deg, ${colorPct(r.cumplimiento_proyectado_pct || 0)}, ${colorPct(r.cumplimiento_proyectado_pct || 0)}88)`}
        />
        <KpiCard
          label="Falta hoy"
          value={fmt(r.falta_hoy)}
          sub={`Falta proyectada: ${fmt(r.falta_proyectada)}`}
          color="red"
        />
        <KpiCard
          label="Diario requerido"
          value={fmt(r.diario_requerido)}
          sub={`${d.dias_habiles_restantes} días hábiles restantes`}
          color="purple"
        />
      </div>

      {/* Tabla por negocio */}
      <SectionTitle>Detalle por Negocio</SectionTitle>
      <div className="table-card mb-4 overflow-x-auto">
        <table className="w-full text-xs" style={{ borderCollapse: 'collapse', minWidth: 680 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-2)' }}>
              {['Negocio', 'Meta ECOM', 'Venta real', 'Cumpl.', 'Proyección', 'Cumpl. Proy.', 'Falta hoy', 'Falta proy.', 'Diario req.'].map(h => (
                <th
                  key={h}
                  className="font-semibold uppercase tracking-wider text-palumar-muted text-right first:text-left py-2 px-2"
                  style={{ fontSize: '9.5px', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {negocios.map((n, i) => {
              const cpct = n.cumplimiento_pct || 0;
              const ppct = n.cumplimiento_proyectado_pct || 0;
              return (
                <tr
                  key={n.negocio}
                  style={{ borderBottom: '1px solid var(--border-2)', background: i % 2 === 0 ? 'transparent' : 'rgba(90,145,185,0.03)' }}
                >
                  <td className="py-2 px-2 font-semibold text-palumar-white" style={{ whiteSpace: 'nowrap' }}>{n.negocio}</td>
                  <td className="py-2 px-2 text-right font-mono-num text-palumar-muted">{fmt(n.meta_ecom)}</td>
                  <td className="py-2 px-2 text-right font-mono-num text-palumar-white">{fmt(n.venta_real)}</td>
                  <td className="py-2 px-2 text-right font-mono-num font-semibold" style={{ color: colorPct(cpct) }}>{pct(cpct)}</td>
                  <td className="py-2 px-2 text-right font-mono-num text-palumar-muted">{fmt(n.proyeccion)}</td>
                  <td className="py-2 px-2 text-right font-mono-num" style={{ color: colorPct(ppct) }}>{pct(ppct)}</td>
                  <td className="py-2 px-2 text-right font-mono-num text-palumar-muted">{fmt(n.falta_hoy)}</td>
                  <td className="py-2 px-2 text-right font-mono-num" style={{ color: '#E05252' }}>{fmt(n.falta_proyectada)}</td>
                  <td className="py-2 px-2 text-right font-mono-num text-palumar-muted">{fmt(n.diario_requerido)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid var(--border-2)' }}>
              <td className="py-2 px-2 font-bold text-palumar-white text-xs">TOTAL</td>
              <td className="py-2 px-2 text-right font-mono-num font-bold text-palumar-muted">{fmt(r.meta_ecom_total)}</td>
              <td className="py-2 px-2 text-right font-mono-num font-bold text-palumar-white">{fmt(r.venta_real_total)}</td>
              <td className="py-2 px-2 text-right font-mono-num font-bold" style={{ color: colorPct(r.cumplimiento_ecom_pct || 0) }}>{pct(r.cumplimiento_ecom_pct)}</td>
              <td className="py-2 px-2 text-right font-mono-num font-bold text-palumar-muted">{fmt(r.proyeccion_total)}</td>
              <td className="py-2 px-2 text-right font-mono-num font-bold" style={{ color: colorPct(r.cumplimiento_proyectado_pct || 0) }}>{pct(r.cumplimiento_proyectado_pct)}</td>
              <td className="py-2 px-2 text-right font-mono-num font-bold text-palumar-muted">{fmt(r.falta_hoy)}</td>
              <td className="py-2 px-2 text-right font-mono-num font-bold" style={{ color: '#E05252' }}>{fmt(r.falta_proyectada)}</td>
              <td className="py-2 px-2 text-right font-mono-num font-bold text-palumar-muted">{fmt(r.diario_requerido)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Gráficas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="table-card">
          <p className="text-palumar-muted font-bold uppercase tracking-widest mb-3" style={{ fontSize: '10px', letterSpacing: '0.9px' }}>
            Cumplimiento % por Negocio
          </p>
          <HBarChart
            labels={chartLabels}
            data={chartCumpl}
            barColors={chartColors}
            isPct={true}
            rowH={34}
            minH={160}
          />
        </div>
        <div className="table-card">
          <p className="text-palumar-muted font-bold uppercase tracking-widest mb-3" style={{ fontSize: '10px', letterSpacing: '0.9px' }}>
            Brecha Proyectada por Negocio
          </p>
          <HBarChart
            labels={brechaLabels}
            data={brechaData}
            color="#E05252"
            rowH={34}
            minH={160}
            formatValue={fmt}
          />
        </div>
      </div>

      {/* Comparativo PALMA vs ECOM */}
      <SectionTitle>Comparativo PALMA vs ECOM</SectionTitle>
      <div className="table-card mb-4 overflow-x-auto">
        <table className="w-full text-xs" style={{ borderCollapse: 'collapse', minWidth: 480 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-2)' }}>
              {['Negocio', 'Meta PALMA', 'Meta ECOM', 'Diferencia', '% Inflado'].map(h => (
                <th
                  key={h}
                  className="font-semibold uppercase tracking-wider text-palumar-muted text-right first:text-left py-2 px-2"
                  style={{ fontSize: '9.5px', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {negocios.map((n, i) => {
              const diff = (n.meta_ecom || 0) - (n.meta_palma || 0);
              const inflado = n.inflado_pct || (n.meta_palma > 0 ? ((n.meta_ecom - n.meta_palma) / n.meta_palma) * 100 : 0);
              return (
                <tr
                  key={n.negocio}
                  style={{ borderBottom: '1px solid var(--border-2)', background: i % 2 === 0 ? 'transparent' : 'rgba(90,145,185,0.03)' }}
                >
                  <td className="py-2 px-2 font-semibold text-palumar-white" style={{ whiteSpace: 'nowrap' }}>{n.negocio}</td>
                  <td className="py-2 px-2 text-right font-mono-num text-palumar-muted">{fmt(n.meta_palma)}</td>
                  <td className="py-2 px-2 text-right font-mono-num text-palumar-white">{fmt(n.meta_ecom)}</td>
                  <td className="py-2 px-2 text-right font-mono-num" style={{ color: diff > 0 ? '#C8A43E' : '#0FA97A' }}>
                    {diff >= 0 ? '+' : ''}{fmt(diff)}
                  </td>
                  <td className="py-2 px-2 text-right font-mono-num" style={{ color: inflado > 0 ? '#C8A43E' : '#0FA97A' }}>
                    {inflado >= 0 ? '+' : ''}{pct(inflado)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid var(--border-2)' }}>
              <td className="py-2 px-2 font-bold text-palumar-white text-xs">TOTAL</td>
              <td className="py-2 px-2 text-right font-mono-num font-bold text-palumar-muted">
                {fmt(negocios.reduce((s, n) => s + (n.meta_palma || 0), 0))}
              </td>
              <td className="py-2 px-2 text-right font-mono-num font-bold text-palumar-white">{fmt(r.meta_ecom_total)}</td>
              <td className="py-2 px-2 text-right font-mono-num font-bold" style={{ color: '#C8A43E' }}>
                {(() => {
                  const totalPalma = negocios.reduce((s, n) => s + (n.meta_palma || 0), 0);
                  const d2 = (r.meta_ecom_total || 0) - totalPalma;
                  return `${d2 >= 0 ? '+' : ''}${fmt(d2)}`;
                })()}
              </td>
              <td className="py-2 px-2 text-right font-mono-num font-bold" style={{ color: '#C8A43E' }}>
                {(() => {
                  const totalPalma = negocios.reduce((s, n) => s + (n.meta_palma || 0), 0);
                  const i2 = totalPalma > 0 ? (((r.meta_ecom_total || 0) - totalPalma) / totalPalma) * 100 : 0;
                  return `${i2 >= 0 ? '+' : ''}${pct(i2)}`;
                })()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Lectura rápida */}
      {lectura && (
        <>
          <SectionTitle>Lectura Rápida</SectionTitle>
          <div
            className="rounded-xl border px-4 py-3 mb-6"
            style={{ background: 'rgba(26,127,166,0.07)', borderColor: 'rgba(45,170,217,0.2)' }}
          >
            {lectura.map((line, i) => (
              <p key={i} className="text-sm text-palumar-muted mb-1 last:mb-0" style={{ lineHeight: 1.6 }}>
                {i === 0 ? <strong style={{ color: 'var(--text-1)' }}>{line}</strong> : line}
              </p>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
