import React, { useMemo, useState } from 'react';
import useDashboardStore from '../../store/dashboardStore';
import KpiCard from '../ui/KpiCard';
import SectionTitle from '../ui/SectionTitle';
import HBarChart from '../charts/HBarChart';
import { fmt, pct, getCoberturaVendedor } from '../../utils/formatters';

// ── Clave de acceso ───────────────────────────────────────────────────────────
// Cambiar solo esta constante para actualizar la clave.
// El acceso se guarda en sessionStorage (se borra al cerrar el navegador).
const MI_GERENCIA_KEY = 'ECOM2026';
const STORAGE_KEY     = 'palma_mg_access';

// ── Normalización de negocio — mismo mapa que Gerencial.jsx ──────────────────
const MAPA_NEGOCIOS = {
  'CHOCOLATES':         'Chocolates',  'CHOCOLATE':          'Chocolates',
  'GALLETAS':           'Galletas',    'GALLETA':            'Galletas',
  'CARNICO':            'Cárnico',     'CARNICOS':           'Cárnico',    'CARNICA': 'Cárnico',
  'CAFE':               'Café',        'CAF':                'Café',
  'BEBIDAS TMLUC':      'Bebidas TMLUC','BEBIDAS':           'Bebidas TMLUC','TMLUC':  'Bebidas TMLUC',
  'SNACKS TMLUC':       'Snacks TMLUC','SNACKS':             'Snacks TMLUC',
  'OTROS TMLUC':        'Otros TMLUC', 'OTROS':              'Otros TMLUC',
  'NUTRICION EXPERTA':  'Nutrición Experta', 'NUTRICION':    'Nutrición Experta',
  'NUTRICIUN EXPERTA':  'Nutrición Experta', 'NUTRICIUN':    'Nutrición Experta',
  'NUTRICI N EXPERTA':  'Nutrición Experta', 'NUTRICIONEXPERTA': 'Nutrición Experta',
  'BARRAS CORTAS':      'Barras Cortas','BARRAS':            'Barras Cortas',
  'TAJADOS':            'Tajados',     'TAJADO':             'Tajados',
  'SABORIZADAS':        'Saborizadas', 'SALUDABLES':         'Saludables',
};

function normNeg(nombre) {
  if (!nombre) return '';
  let s = String(nombre).trim();
  s = s.replace(/√©/g, 'e').replace(/√≥/g, 'o').replace(/√∫/g, 'u')
       .replace(/√°/g, 'a').replace(/√±/g, 'n').replace(/√≠/g, 'i');
  s = s.replace(/Û/g, 'u').replace(/û/g, 'u');
  s = s.replace(/^\d+\s*[-_]\s*/, '');
  const limpio = s.trim();
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/�/g, '').replace(/\?/g, '');
  s = s.toUpperCase().replace(/\s+/g, ' ').trim();
  return MAPA_NEGOCIOS[s] || limpio;
}

function colorPct(v) {
  if (v >= 90) return '#0FA97A';
  if (v >= 70) return '#C8A43E';
  return '#E05252';
}

// ── Pantalla de acceso ────────────────────────────────────────────────────────
function AccessGate({ children }) {
  const [unlocked, setUnlocked] = useState(
    () => sessionStorage.getItem(STORAGE_KEY) === 'true'
  );
  const [input, setInput]     = useState('');
  const [error, setError]     = useState(false);
  const [visible, setVisible] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (input.trim() === MI_GERENCIA_KEY) {
      sessionStorage.setItem(STORAGE_KEY, 'true');
      setUnlocked(true);
    } else {
      setError(true);
      setInput('');
    }
  };

  if (unlocked) return children;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div
        className="rounded-2xl border flex flex-col gap-5 p-7 w-full max-w-sm"
        style={{ background: 'var(--navy-2)', borderColor: 'var(--border-2)' }}
      >
        {/* Icon + título */}
        <div className="flex flex-col items-center gap-2">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mb-1"
            style={{ background: 'rgba(26,127,166,0.15)', border: '1.5px solid rgba(45,200,216,0.2)' }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: '#2AAED9' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <p className="font-display font-bold text-palumar-white" style={{ fontSize: '15px' }}>
            Mi Gerencia
          </p>
          <p className="text-palumar-muted text-xs text-center" style={{ lineHeight: 1.5 }}>
            Panel privado · ingresa la clave de acceso
          </p>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="relative">
            <input
              type={visible ? 'text' : 'password'}
              value={input}
              onChange={(e) => { setInput(e.target.value); setError(false); }}
              placeholder="Clave de acceso"
              autoFocus
              className="w-full rounded-lg border px-4 py-2.5 text-sm text-palumar-white pr-10"
              style={{
                background: 'var(--navy-3)',
                borderColor: error ? '#E05252' : 'var(--border-2)',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <button
              type="button"
              onClick={() => setVisible(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-palumar-muted hover:text-palumar-white transition-colors"
              tabIndex={-1}
            >
              {visible ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>

          {error && (
            <p className="text-xs" style={{ color: '#E05252' }}>Clave incorrecta</p>
          )}

          <button
            type="submit"
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all duration-150"
            style={{ background: 'var(--blue)' }}
          >
            Ingresar
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Panel principal ───────────────────────────────────────────────────────────
function MiGerenciaContent() {
  const { miGerencia: mg, resumen: r, cobNegocio, loadingFase2 } = useDashboardStore();

  // ── Ventas OFICIALES: siempre desde resumen (misma fuente que panel Gerencial) ─
  const ventaBruta = r?.venta_bruta || 0;
  const ventaNeta  = r?.venta_neta  || 0;
  const devTotal   = r?.devolucion_total ?? r?.devoluciones ?? r?.devolucion ?? 0;
  const avTotal    = r?.averia_total     ?? r?.averias      ?? r?.averiados  ?? 0;

  // ── Metas ECOM: desde endpoint mi_gerencia (hoja METAS_ECOM o defaults) ──
  const metaEcomTotal = mg?.resumen?.meta_ecom_total || 0;
  const diasRestantes = mg?.dias_habiles_restantes   || 0;
  const factorProy    = mg?.factor_proyeccion        || 1;
  const sinHojaEcom   = mg?.sin_hoja_ecom            ?? true;

  // ── Cálculos ECOM usando Venta Neta oficial ───────────────────────────────
  const cumplEcomPct     = metaEcomTotal > 0 ? (ventaNeta / metaEcomTotal) * 100 : 0;
  const proyeccion       = ventaNeta * factorProy;
  const cumplProyEcomPct = metaEcomTotal > 0 ? (proyeccion / metaEcomTotal) * 100 : 0;
  const falta            = metaEcomTotal - ventaNeta;
  const diarioReq        = diasRestantes > 0 ? falta / diasRestantes : 0;

  // ── Venta por negocio: misma fuente que "Metas por negocio" en Gerencial ──
  const ventaMapNeg = useMemo(() => {
    const map = {};
    (r?.venta_por_negocio || []).forEach(({ negocio, venta }) => {
      const key = normNeg(negocio);
      if (key) map[key] = (map[key] || 0) + (venta || 0);
    });
    return map;
  }, [r]);

  // ── Cobertura por negocio (misma fuente que panel Cobertura) ────────────
  const NEGOCIOS_ECOM_SET = new Set(['Chocolates', 'Cárnico', 'Galletas', 'Café', 'Bebidas TMLUC', 'Snacks TMLUC', 'Otros TMLUC']);

  const cobNegocioTotal = useMemo(() => {
    if (!cobNegocio?.length) return [];
    // Maestro único por vendedor (evita duplicar el universo)
    const maestroPorVend = {};
    cobNegocio.forEach(row => {
      const vCod = getCoberturaVendedor(row).split('-')[0].trim();
      if (vCod && !maestroPorVend[vCod]) maestroPorVend[vCod] = Number(row.clientes_maestro || 0);
    });
    const totalMaestro = Object.values(maestroPorVend).reduce((s, n) => s + n, 0);
    // Impactados por negocio normalizado (solo los 7 ECOM)
    const negMap = {};
    cobNegocio.forEach(row => {
      const neg = normNeg(String(row.negocio || '').trim());
      if (!neg || !NEGOCIOS_ECOM_SET.has(neg)) return;
      negMap[neg] = (negMap[neg] || 0) + Number(row.impactados || 0);
    });
    // Venta por negocio desde resumen
    const ventaNeg = {};
    (r?.venta_por_negocio || []).forEach(n => {
      const neg = normNeg(n.negocio);
      ventaNeg[neg] = (ventaNeg[neg] || 0) + (n.venta || 0);
    });
    return Object.entries(negMap)
      .map(([negocio, impactados]) => ({
        negocio,
        maestro:   totalMaestro,
        impactados,
        cobertura: totalMaestro > 0 ? Math.round(impactados / totalMaestro * 1000) / 10 : 0,
        venta:     ventaNeg[negocio] || 0,
      }))
      .sort((a, b) => b.cobertura - a.cobertura);
  }, [cobNegocio, r]);

  // ── Meta ECOM y PALMA por negocio (desde mg.negocios) ────────────────────
  const metaEcomMapNeg = useMemo(() => {
    const map = {};
    (mg?.negocios || []).forEach(n => {
      if (n.negocio && (n.meta_ecom || 0) > 0) map[n.negocio] = n.meta_ecom;
    });
    return map;
  }, [mg]);

  const metaPalmaMapNeg = useMemo(() => {
    const map = {};
    (mg?.negocios || []).forEach(n => {
      if (n.negocio) map[n.negocio] = n.meta_palma || 0;
    });
    return map;
  }, [mg]);

  // ── Tabla por negocio: solo negocios con meta ECOM, cruzado con venta real ─
  const tablaNeg = useMemo(() => {
    return Object.entries(metaEcomMapNeg)
      .map(([neg, metaEcom]) => {
        const ventaReal    = ventaMapNeg[neg] || 0;
        const metaPalma    = metaPalmaMapNeg[neg] || 0;
        const cumplPct     = metaEcom > 0 ? (ventaReal / metaEcom) * 100 : 0;
        const proy         = ventaReal * factorProy;
        const cumplProyPct = metaEcom > 0 ? (proy / metaEcom) * 100 : 0;
        const faltaNeg     = metaEcom - ventaReal;
        const diarioNeg    = diasRestantes > 0 ? faltaNeg / diasRestantes : 0;
        return { neg, metaEcom, ventaReal, metaPalma, cumplPct, proy, cumplProyPct, faltaNeg, diarioNeg };
      })
      .sort((a, b) => b.ventaReal - a.ventaReal);
  }, [metaEcomMapNeg, ventaMapNeg, metaPalmaMapNeg, factorProy, diasRestantes]);

  // ── Lectura rápida ────────────────────────────────────────────────────────
  const lectura = useMemo(() => {
    if (!mg || !r) return null;
    const lines = [];
    const devPct = ventaBruta > 0 ? (devTotal / ventaBruta) * 100 : 0;
    const avPct  = ventaBruta > 0 ? (avTotal  / ventaBruta) * 100 : 0;
    lines.push(
      `La operación oficial registra ${fmt(ventaBruta)} bruto → ${fmt(ventaNeta)} neto ` +
      `(Dev: ${fmt(devTotal)} / ${pct(devPct)}, Av: ${fmt(avTotal)} / ${pct(avPct)}).`
    );
    if (cumplEcomPct >= 90) {
      lines.push(`Contra la meta ECOM de ${fmt(metaEcomTotal)}, vamos en ${pct(cumplEcomPct)} — en ruta para cerrar el mes.`);
    } else if (cumplEcomPct >= 70) {
      lines.push(`Contra la meta ECOM de ${fmt(metaEcomTotal)}, vamos en ${pct(cumplEcomPct)} — requiere acelerar el ritmo.`);
    } else {
      lines.push(`Contra la meta ECOM de ${fmt(metaEcomTotal)}, vamos en ${pct(cumplEcomPct)} — brecha crítica de ${fmt(falta)}.`);
    }
    if (diasRestantes > 0) {
      lines.push(
        `Con ${diasRestantes} días hábiles restantes y factor ×${factorProy.toFixed(2)}, ` +
        `la proyección de cierre es ${fmt(proyeccion)} (${pct(cumplProyEcomPct)} de la meta ECOM). ` +
        `Diario requerido: ${fmt(diarioReq)}/día.`
      );
    }
    return lines;
  }, [mg, r, ventaBruta, ventaNeta, devTotal, avTotal, metaEcomTotal,
      cumplEcomPct, falta, diasRestantes, factorProy, proyeccion, cumplProyEcomPct, diarioReq]);

  // ── Datos para gráficas ───────────────────────────────────────────────────
  const chartCumpl  = tablaNeg.map(n => +n.cumplPct.toFixed(1));
  const chartColors = chartCumpl.map(colorPct);
  const brechasSorted = [...tablaNeg].sort((a, b) => b.faltaNeg - a.faltaNeg);

  // ── Estados de carga ──────────────────────────────────────────────────────
  if (!mg && loadingFase2) {
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

  if (!mg) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <p className="text-palumar-muted text-sm">Datos de gerencia no disponibles</p>
      </div>
    );
  }

  return (
    <div>
      {/* Banner: hoja METAS_ECOM no encontrada */}
      {sinHojaEcom && (
        <div
          className="flex items-start gap-3 rounded-xl border mb-5 px-4 py-3"
          style={{ background: 'rgba(200,164,62,0.08)', borderColor: 'rgba(200,164,62,0.3)' }}
        >
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: '#C8A43E' }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <p className="text-sm" style={{ color: '#DDB84A', lineHeight: 1.5 }}>
            <strong>Usando metas ECOM por defecto</strong> — no se encontró la hoja{' '}
            <code style={{ background: 'rgba(200,164,62,0.15)', padding: '1px 5px', borderRadius: 3 }}>METAS_ECOM</code>.
            Crea la hoja con columnas <em>NEGOCIO</em> y <em>META_ECOM</em> para usar tus metas reales.
          </p>
        </div>
      )}

      {/* ── 9 KPIs ─────────────────────────────────────────────────────────── */}
      {/* Fila 1: operación oficial (VB, VN, Dev, Av) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <KpiCard
          label="Venta Bruta"
          value={fmt(ventaBruta)}
          sub="Venta total antes de deducciones"
          color="cyan"
        />
        <KpiCard
          label="Venta Neta"
          value={fmt(ventaNeta)}
          sub="Base para cumplimiento ECOM"
          color="green"
          barValue={cumplEcomPct}
          barColor={`linear-gradient(90deg,${colorPct(cumplEcomPct)},${colorPct(cumplEcomPct)}88)`}
        />
        <KpiCard
          label="Devoluciones"
          value={fmt(devTotal)}
          sub={`${pct(ventaBruta > 0 ? (devTotal / ventaBruta) * 100 : 0)} de venta bruta`}
          color="red"
        />
        <KpiCard
          label="Averías"
          value={fmt(avTotal)}
          sub={`${pct(ventaBruta > 0 ? (avTotal / ventaBruta) * 100 : 0)} de venta bruta`}
          color="amber"
        />
      </div>

      {/* Fila 2: análisis ECOM (Meta, Cumpl, Proy, Falta, Diario) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <KpiCard
          label="Meta ECOM"
          value={fmt(metaEcomTotal)}
          sub={sinHojaEcom ? 'Meta por defecto' : 'Hoja METAS_ECOM'}
          color="gold"
        />
        <KpiCard
          label="Cumplimiento ECOM"
          value={pct(cumplEcomPct)}
          sub="Venta Neta / Meta ECOM"
          color={cumplEcomPct >= 90 ? 'green' : cumplEcomPct >= 70 ? 'amber' : 'red'}
          barValue={cumplEcomPct}
        />
        <KpiCard
          label="Proyección cierre"
          value={fmt(proyeccion)}
          sub={`Ritmo ×${factorProy.toFixed(2)} · <strong style="color:${colorPct(cumplProyEcomPct)}">${pct(cumplProyEcomPct)}</strong> vs meta · ${diasRestantes} días`}
          color="teal"
          barValue={cumplProyEcomPct}
          barColor={`linear-gradient(90deg,${colorPct(cumplProyEcomPct)},${colorPct(cumplProyEcomPct)}88)`}
        />
        <KpiCard
          label="Falta vs Meta ECOM"
          value={fmt(falta)}
          sub={`${diasRestantes} días hábiles restantes`}
          color="red"
        />
        <KpiCard
          label="Diario requerido"
          value={fmt(diarioReq)}
          sub="Para alcanzar Meta ECOM"
          color="purple"
        />
      </div>

      {/* ── Tabla por negocio ──────────────────────────────────────────────── */}
      <SectionTitle>Detalle por Negocio</SectionTitle>
      <div className="table-card mb-4 overflow-x-auto">
        <table className="w-full text-xs" style={{ borderCollapse: 'collapse', minWidth: 580 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-2)' }}>
              {['Negocio', 'Meta ECOM', 'Venta real', 'Cumpl. ECOM', 'Proyección', 'Cumpl. Proy.', 'Falta ECOM', 'Diario req.'].map(h => (
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
            {tablaNeg.map((n, i) => (
              <tr
                key={n.neg}
                style={{
                  borderBottom: '1px solid var(--border-2)',
                  background: i % 2 === 0 ? 'transparent' : 'rgba(90,145,185,0.03)',
                }}
              >
                <td className="py-2 px-2 font-semibold text-palumar-white" style={{ whiteSpace: 'nowrap' }}>{n.neg}</td>
                <td className="py-2 px-2 text-right font-mono-num text-palumar-muted">{fmt(n.metaEcom)}</td>
                <td className="py-2 px-2 text-right font-mono-num text-palumar-white">{fmt(n.ventaReal)}</td>
                <td className="py-2 px-2 text-right font-mono-num font-semibold" style={{ color: colorPct(n.cumplPct) }}>{pct(n.cumplPct)}</td>
                <td className="py-2 px-2 text-right font-mono-num text-palumar-muted">{fmt(n.proy)}</td>
                <td className="py-2 px-2 text-right font-mono-num" style={{ color: colorPct(n.cumplProyPct) }}>{pct(n.cumplProyPct)}</td>
                <td className="py-2 px-2 text-right font-mono-num" style={{ color: '#E05252' }}>{fmt(n.faltaNeg)}</td>
                <td className="py-2 px-2 text-right font-mono-num text-palumar-muted">{fmt(n.diarioNeg)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid var(--border-2)' }}>
              <td className="py-2 px-2 font-bold text-palumar-white text-xs">TOTAL</td>
              <td className="py-2 px-2 text-right font-mono-num font-bold text-palumar-muted">{fmt(metaEcomTotal)}</td>
              <td className="py-2 px-2 text-right font-mono-num font-bold text-palumar-white">{fmt(ventaNeta)}</td>
              <td className="py-2 px-2 text-right font-mono-num font-bold" style={{ color: colorPct(cumplEcomPct) }}>{pct(cumplEcomPct)}</td>
              <td className="py-2 px-2 text-right font-mono-num font-bold text-palumar-muted">{fmt(proyeccion)}</td>
              <td className="py-2 px-2 text-right font-mono-num font-bold" style={{ color: colorPct(cumplProyEcomPct) }}>{pct(cumplProyEcomPct)}</td>
              <td className="py-2 px-2 text-right font-mono-num font-bold" style={{ color: '#E05252' }}>{fmt(falta)}</td>
              <td className="py-2 px-2 text-right font-mono-num font-bold text-palumar-muted">{fmt(diarioReq)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── Cobertura por Negocio ──────────────────────────────────────────── */}
      {cobNegocioTotal.length > 0 && (
        <>
          <SectionTitle>Cobertura por Negocio</SectionTitle>
          {cobNegocioTotal[0]?.maestro > 0 && (
            <p className="text-palumar-muted mb-3" style={{ fontSize: '11px', lineHeight: 1.5 }}>
              Universo: <strong style={{ color: 'var(--text-2)' }}>{cobNegocioTotal[0].maestro.toLocaleString('es')}</strong> clientes activos · cada barra = impactados / universo
            </p>
          )}
          <div className="chart-card mb-3">
            <HBarChart
              labels={cobNegocioTotal.map(n => n.negocio)}
              data={cobNegocioTotal.map(n => n.cobertura)}
              barColors={cobNegocioTotal.map(n => colorPct(n.cobertura))}
              isPct
              rowH={38}
              minH={180}
              secondaryData={cobNegocioTotal.map(n => n.impactados)}
              secondaryFmt={(n) => `${n.toLocaleString('es')} clientes`}
            />
          </div>
          <div className="table-card mb-4 overflow-x-auto">
            <table className="w-full text-xs" style={{ borderCollapse: 'collapse', minWidth: 360 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-2)' }}>
                  {['Negocio', 'Impactados', 'Universo', 'Cobertura', 'Venta'].map(h => (
                    <th key={h} className="font-semibold uppercase tracking-wider text-palumar-muted text-right first:text-left py-2 px-2"
                      style={{ fontSize: '9.5px', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cobNegocioTotal.map((n, i) => (
                  <tr key={n.negocio} style={{ borderBottom: '1px solid var(--border-2)', background: i % 2 === 0 ? 'transparent' : 'rgba(90,145,185,0.03)' }}>
                    <td className="py-2 px-2 font-semibold text-palumar-white" style={{ whiteSpace: 'nowrap' }}>{n.negocio}</td>
                    <td className="py-2 px-2 text-right font-mono-num text-palumar-white">{n.impactados.toLocaleString('es')}</td>
                    <td className="py-2 px-2 text-right font-mono-num text-palumar-muted">{n.maestro.toLocaleString('es')}</td>
                    <td className="py-2 px-2 text-right font-mono-num font-semibold" style={{ color: colorPct(n.cobertura) }}>{pct(n.cobertura)}</td>
                    <td className="py-2 px-2 text-right font-mono-num text-palumar-muted">{fmt(n.venta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Gráficas ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="chart-card">
          <p className="text-palumar-muted font-bold uppercase tracking-widest mb-3" style={{ fontSize: '10px', letterSpacing: '0.9px' }}>
            Cumplimiento ECOM % por Negocio
          </p>
          <HBarChart
            labels={tablaNeg.map(n => n.neg)}
            data={chartCumpl}
            barColors={chartColors}
            isPct
            rowH={34}
            minH={160}
          />
        </div>
        <div className="chart-card">
          <p className="text-palumar-muted font-bold uppercase tracking-widest mb-3" style={{ fontSize: '10px', letterSpacing: '0.9px' }}>
            Brecha vs Meta ECOM por Negocio
          </p>
          <HBarChart
            labels={brechasSorted.map(n => n.neg)}
            data={brechasSorted.map(n => n.faltaNeg)}
            color="#E05252"
            rowH={34}
            minH={160}
            formatValue={fmt}
          />
        </div>
      </div>

      {/* ── Meta PALMA vs Meta ECOM (sección secundaria) ─────────────────── */}
      <SectionTitle>Meta PALMA vs Meta ECOM</SectionTitle>
      <div className="table-card mb-4 overflow-x-auto">
        <table className="w-full text-xs" style={{ borderCollapse: 'collapse', minWidth: 400 }}>
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
            {tablaNeg.map((n, i) => {
              const diff       = n.metaEcom - n.metaPalma;
              const infladoPct = n.metaPalma > 0 ? (diff / n.metaPalma) * 100 : 0;
              return (
                <tr
                  key={n.neg}
                  style={{
                    borderBottom: '1px solid var(--border-2)',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(90,145,185,0.03)',
                  }}
                >
                  <td className="py-2 px-2 font-semibold text-palumar-white" style={{ whiteSpace: 'nowrap' }}>{n.neg}</td>
                  <td className="py-2 px-2 text-right font-mono-num text-palumar-muted">{fmt(n.metaPalma)}</td>
                  <td className="py-2 px-2 text-right font-mono-num text-palumar-white">{fmt(n.metaEcom)}</td>
                  <td className="py-2 px-2 text-right font-mono-num" style={{ color: diff > 0 ? '#C8A43E' : '#0FA97A' }}>
                    {diff >= 0 ? '+' : ''}{fmt(diff)}
                  </td>
                  <td className="py-2 px-2 text-right font-mono-num" style={{ color: infladoPct > 0 ? '#C8A43E' : '#0FA97A' }}>
                    {infladoPct >= 0 ? '+' : ''}{pct(infladoPct)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            {(() => {
              const totalPalma = tablaNeg.reduce((s, n) => s + n.metaPalma, 0);
              const totalDiff  = metaEcomTotal - totalPalma;
              const totalInfl  = totalPalma > 0 ? (totalDiff / totalPalma) * 100 : 0;
              return (
                <tr style={{ borderTop: '2px solid var(--border-2)' }}>
                  <td className="py-2 px-2 font-bold text-palumar-white text-xs">TOTAL</td>
                  <td className="py-2 px-2 text-right font-mono-num font-bold text-palumar-muted">{fmt(totalPalma)}</td>
                  <td className="py-2 px-2 text-right font-mono-num font-bold text-palumar-white">{fmt(metaEcomTotal)}</td>
                  <td className="py-2 px-2 text-right font-mono-num font-bold" style={{ color: totalDiff > 0 ? '#C8A43E' : '#0FA97A' }}>
                    {totalDiff >= 0 ? '+' : ''}{fmt(totalDiff)}
                  </td>
                  <td className="py-2 px-2 text-right font-mono-num font-bold" style={{ color: totalInfl > 0 ? '#C8A43E' : '#0FA97A' }}>
                    {totalInfl >= 0 ? '+' : ''}{pct(totalInfl)}
                  </td>
                </tr>
              );
            })()}
          </tfoot>
        </table>
      </div>

      {/* ── Lectura rápida ─────────────────────────────────────────────────── */}
      {lectura && (
        <>
          <SectionTitle>Lectura Rápida</SectionTitle>
          <div
            className="rounded-xl border px-4 py-3 mb-6"
            style={{ background: 'rgba(26,127,166,0.07)', borderColor: 'rgba(45,170,217,0.2)' }}
          >
            {lectura.map((line, i) => (
              <p key={i} className="text-sm text-palumar-muted mb-1 last:mb-0" style={{ lineHeight: 1.6 }}>
                {i === 0
                  ? <strong style={{ color: 'var(--text-1)' }}>{line}</strong>
                  : line}
              </p>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Export con access gate ────────────────────────────────────────────────────
export default function MiGerencia() {
  return (
    <AccessGate>
      <MiGerenciaContent />
    </AccessGate>
  );
}
