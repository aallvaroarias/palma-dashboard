import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import useDashboardStore from '../../store/dashboardStore';
import KpiCard from '../ui/KpiCard';
import SectionTitle from '../ui/SectionTitle';
import HBarChart from '../charts/HBarChart';
import DoughnutChart from '../charts/DoughnutChart';
import LineChart from '../charts/LineChart';
import { fmt, pct, getCoberturaValue, getCoberturaVendedor, esRutaCentral } from '../../utils/formatters';
import { VEND_COLORS, NEG_COLORS, COLORS } from '../../utils/colors';

export default function Vendedor() {
  const [params] = useSearchParams();
  const cod = params.get('v');

  const { vendedores, loading, loadVendedores,
          cobertura, cobNegocio, efectividad, skus, clientesNuevos,
          clientesCero, topClientes, cuotas, devoluciones, dnMarcas, coberturaMarcas, loadingFase2, refetchClientes,
          coberturaVendedoresPC, clientesSinPC,
          loadClientesSinPC, config,
          combosVendedor,
          combosVendedorDetalle, loadCombosVendedorDetalle, combosVendedorDetalleLoading } = useDashboardStore();

  const [misMarcasVerTodas, setMisMarcasVerTodas] = useState(false);

  // Cargar clientes sin producto clave en cuanto hay un vendedor seleccionado
  useEffect(() => { if (cod) loadClientesSinPC?.(); }, [cod]); // eslint-disable-line react-hooks/exhaustive-deps
  // Cargar desglose por vendedor+producto de combos, bajo demanda
  useEffect(() => { if (cod) loadCombosVendedorDetalle?.(); }, [cod]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (esRutaCentral(vnom)) return false;
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

  // Clientes nuevos con filtro de fecha propio del panel vendedor
  const [desdeN, setDesdeN] = useState('');
  const [hastaN, setHastaN] = useState('');
  const [loadingN, setLoadingN] = useState(false);
  const [negocioVend, setNegocioVend] = useState('');

  const applyNuevos = useCallback(async (d, h) => {
    setLoadingN(true);
    try { await refetchClientes(d || undefined, h || undefined); }
    finally { setLoadingN(false); }
  }, [refetchClientes]);

  const nuevosVend = useMemo(() => {
    if (!v) return [];
    return (clientesNuevos.detalle || []).filter(c =>
      c.asesor === v.nombre || c.asesor === String(v.cod) ||
      c.cod_asesor === String(v.cod)
    );
  }, [clientesNuevos, v]);

  // Clientes cero de este vendedor
  const ceroVend = useMemo(() => {
    if (!v) return [];
    const myCod = String(v.cod).trim();
    return (clientesCero.detalle || []).filter(r => {
      // Preferir cod_vendedor (fuente inequívoca); fallback a nombre
      if (r.cod_vendedor) return String(r.cod_vendedor).trim() === myCod;
      const nom = String(r.vendedor || r.nom_vendedor || '').trim();
      return nom === v.nombre || nom === myCod;
    });
  }, [clientesCero, v]);

  // Cuota del vendedor: busca en el array cuotas por cod (fuente directa de la hoja CUOTAS)
  const vCuota = useMemo(() => {
    if (!v) return 0;
    const found = cuotas.find(c => String(c.cod).trim() === String(v.cod).trim());
    return found ? (found.cuota || 0) : (v.cuota || 0);
  }, [cuotas, v]);

  const vPctCumplimiento = useMemo(() => {
    if (!vCuota) return 0;
    const venta = v?.venta_neta || 0;
    return Math.round(venta / vCuota * 1000) / 10;
  }, [vCuota, v]);

  // Top 10 clientes de este vendedor
  const top10Vend = useMemo(() => {
    if (!v) return [];
    const found = (topClientes.top_por_vendedor || []).find(x =>
      x.cod_vendedor === String(v.cod) || x.nom_vendedor === v.nombre
    );
    return found?.top10 || [];
  }, [topClientes, v]);

  // Top 10 clientes con más devoluciones de este vendedor
  const topDevolucionesVend = useMemo(() => {
    if (!v) return [];
    const myCod = String(v.cod).trim();
    // Fuente primaria: por_cliente_por_vendedor del backend
    const found = (devoluciones.por_cliente_por_vendedor || []).find(x =>
      String(x.cod_asesor).trim() === myCod
    );
    if (found?.top10?.length) return found.top10;
    // Fallback: computar desde detalle
    const map = {};
    (devoluciones.detalle || []).forEach(r => {
      if (String(r.cod_asesor).trim() !== myCod) return;
      const key = r.cod_cliente || r.nom_cliente;
      if (!key) return;
      if (!map[key]) map[key] = { cod_cliente: r.cod_cliente, nom_cliente: r.nom_cliente, total: 0 };
      map[key].total += parseFloat(r.vlr_devolucion) || 0;
    });
    return Object.values(map)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map(x => ({ ...x, total: Math.round(x.total * 100) / 100 }));
  }, [devoluciones, v]);

  // Metas por negocio del vendedor (cruza cuotas.por_negocio con venta NETA por negocio)
  const metasPorNegocio = useMemo(() => {
    if (!v) return [];
    const found = cuotas.find(c => String(c.cod).trim() === String(v.cod).trim());
    const porNeg = found?.por_negocio || [];
    if (!porNeg.length) return [];

    const normN = s => s.toLowerCase()
      .replace(/√©/g,'e').replace(/√≥/g,'o').replace(/√ü/g,'u').replace(/√°/g,'a').replace(/√≠/g,'i')
      .replace(/^\d+-/, '')
      .replace(/[áàäâ]/g,'a').replace(/[éèëê]/g,'e').replace(/[íìïî]/g,'i')
      .replace(/[óòöô]/g,'o').replace(/[úùü]/g,'u')
      .replace(/[^a-z0-9]/g,' ').replace(/\s+/g,' ').trim();

    const ventaNegList = v.venta_por_negocio || [];
    const sumRaw = ventaNegList.reduce((s, n) => s + (n.venta || 0), 0);
    const netaFactor = sumRaw > 0 ? (v.venta_neta || sumRaw) / sumRaw : 1;

    // Matching mejorado igual que en Gerencial
    const findRaw = (cuotaNeg) => {
      const nN = normN(cuotaNeg);
      if (nN.includes('otros') && nN.includes('tmluc')) return null;
      if (nN.includes('snack') && nN.includes('tmluc')) {
        const e = ventaNegList.find(vn => { const kN = normN(vn.negocio); return kN.includes('snack') && kN.includes('tmluc'); });
        return e?.venta || 0;
      }
      // "Bebidas TMLUC": entry exacto "tmluc"
      if (nN.includes('tmluc')) {
        const e = ventaNegList.find(vn => normN(vn.negocio) === 'tmluc');
        return e?.venta || 0;
      }
      const words = nN.split(' ').filter(w => w.length > 3);
      const e = ventaNegList.find(vn => { const kN = normN(vn.negocio); return words.some(w => kN.includes(w)); });
      return e?.venta || 0;
    };

    const snacksRaw     = ventaNegList.find(vn => { const kN = normN(vn.negocio); return kN.includes('snack') && kN.includes('tmluc'); })?.venta || 0;
    const otrosTmlucRaw = ventaNegList
      .filter(vn => {
        const kN = normN(vn.negocio);
        return (kN.includes('tmluc') && !kN.includes('snack') && kN !== 'tmluc') || kN.includes('nutrici');
      })
      .reduce((s, vn) => s + Math.max(0, vn.venta), 0);

    return porNeg.map(item => {
      const nN = normN(item.negocio);
      const isOtros = nN.includes('otros') && nN.includes('tmluc');
      const raw   = isOtros ? otrosTmlucRaw : findRaw(item.negocio);
      const venta = Math.round(raw * netaFactor * 100) / 100;
      const meta  = item.meta || 0;
      const pct_c = meta > 0 ? Math.round(venta / meta * 1000) / 10 : 0;
      return { negocio: item.negocio, meta, venta, pct_c };
    }).sort((a, b) => b.meta - a.meta);
  }, [cuotas, v]);

  // Factor de proyección de cierre de mes
  // Usa DIAS_HABILES_RESTANTES desde CONFIG cuando está disponible
  const factorProyeccion = useMemo(() => {
    function diasHabiles(desde, hasta) {
      let c = 0; const d = new Date(desde);
      while (d <= hasta) { if (d.getDay() !== 0) c++; d.setDate(d.getDate() + 1); }
      return c;
    }
    const hoy    = new Date();
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const fin    = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    const transc = diasHabiles(inicio, hoy);
    const configDias = config?.dias_habiles_restantes || 0;
    const total  = configDias > 0 ? transc + configDias : diasHabiles(inicio, fin);
    return transc > 0 ? total / transc : 1;
  }, [config]);

  const diasHabilesRestantes = useMemo(() => {
    const configDias = config?.dias_habiles_restantes || 0;
    if (configDias > 0) return configDias;
    const hoy = new Date();
    const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    let c = 0, d = new Date(hoy);
    d.setDate(d.getDate() + 1);
    while (d <= fin) { if (d.getDay() !== 0) c++; d.setDate(d.getDate() + 1); }
    return c;
  }, [config]);

  // Top clientes por negocio de este vendedor
  const topNegociosVend = useMemo(() => {
    if (!v) return [];
    const found = (topClientes.top_por_vendedor_negocio || []).find(x =>
      x.cod_vendedor === String(v.cod)
    );
    return found?.negocios || [];
  }, [topClientes, v]);

  // Histórico del mes cerrado (snapshot del mes anterior)
  const [historico, setHistorico] = useState(null);
  useEffect(() => {
    fetch('/api/historico_clientes')
      .then(r => r.json())
      .then(d => { if (d?.mes) setHistorico(d); })
      .catch(() => {});
  }, []);

  const historicoVend = useMemo(() => {
    if (!historico || !v) return [];
    const found = (historico.top_por_vendedor || []).find(x =>
      String(x.cod_vendedor) === String(v.cod) || x.nom_vendedor === v.nombre
    );
    return found?.top10 || [];
  }, [historico, v]);

  const historicoVendNeg = useMemo(() => {
    if (!historico || !v) return [];
    const found = (historico.top_por_vendedor_negocio || []).find(x =>
      String(x.cod_vendedor) === String(v.cod)
    );
    return found?.negocios || [];
  }, [historico, v]);

  // ── Productos Clave: datos del vendedor ─────────────────────────────────────
  const pcVendedor = useMemo(() => {
    if (!v) return null;
    const myCod = String(v.cod).trim();
    return coberturaVendedoresPC.find(x => String(x.cod_asesor).trim() === myCod) || null;
  }, [coberturaVendedoresPC, v]);

  const clientesSinPCVend = useMemo(() => {
    if (!v) return [];
    const myCod = String(v.cod).trim();
    return (clientesSinPC?.clientes || []).filter(c =>
      String(c.cod_asesor || '').trim() === myCod
    );
  }, [clientesSinPC, v]);

  const combosVendedorEntry = useMemo(() => {
    if (!v) return null;
    const myCod = String(v.cod).trim();
    return combosVendedor.find(x => String(x.cod_asesor).trim() === myCod) || null;
  }, [combosVendedor, v]);

  const combosVendedorDetalleEntry = useMemo(() => {
    if (!v || !combosVendedorDetalle?.vendedores) return null;
    const myCod = String(v.cod).trim();
    return combosVendedorDetalle.vendedores.find(x => String(x.cod_asesor).trim() === myCod) || null;
  }, [combosVendedorDetalle, v]);

  // ── Mi cobertura por marcas — TODAS las marcas del vendedor (misma fuente
  // backend que Gerencial, vía store.coberturaMarcas, para que ambos paneles
  // nunca difieran) ──────────────────────────────────────────────────────────
  const misMarcasEntry = useMemo(() => {
    if (!v || !coberturaMarcas?.vendedores) return null;
    const myCod = String(v.cod).trim();
    return coberturaMarcas.vendedores.find(x => String(x.cod_asesor).trim() === myCod) || null;
  }, [coberturaMarcas, v]);

  const misMarcasOrdenadas = useMemo(() => {
    if (!misMarcasEntry?.marcas?.length) return [];
    return [...misMarcasEntry.marcas].sort((a, b) => b.cobertura_pct - a.cobertura_pct);
  }, [misMarcasEntry]);

  const misMarcasShown = misMarcasVerTodas ? misMarcasOrdenadas : misMarcasOrdenadas.slice(0, 10);

  if (!cod) {
    // ── Debug ──────────────────────────────────────────────────────────────
    console.group('[MiPanel] Debug vendedores');
    console.log('vendedores raw:', vendedores);
    console.log('loading:', loading);
    console.groupEnd();

    // Aún cargando Fase 1 (vendedores llegará con ella)
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-palumar-muted">
          <svg className="w-8 h-8 animate-spin opacity-60" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm">Cargando vendedores…</p>
        </div>
      );
    }

    // Fase 1 terminó pero no hay vendedores — error o array vacío
    if (!vendedores.length) {
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-palumar-muted">
          <svg className="w-12 h-12 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
              d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm">No se pudo cargar el listado de vendedores.</p>
          <button
            onClick={() => loadVendedores?.()}
            className="px-4 py-1.5 rounded-lg text-xs font-medium border transition-all"
            style={{
              background: 'rgba(26,127,166,0.15)',
              borderColor: 'rgba(26,127,166,0.4)',
              color: 'var(--cyan)',
            }}
          >
            Reintentar
          </button>
        </div>
      );
    }

    // Vendedores disponibles — mostrar selector
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
  // Solo negocios con venta neta positiva
  const negocios = (Array.isArray(v.venta_por_negocio) ? v.venta_por_negocio : [])
    .filter(n => n.venta > 0)
    .sort((a, b) => b.venta - a.venta);

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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        <KpiCard label="Venta Bruta" value={fmt(v.venta_real)} color="blue" />
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
          sub={`${v.impactados || 0} de ${v.maestro || 0}`}
          color="cyan"
          barValue={v.cobertura || 0}
        />
        <KpiCard
          label="Ticket Prom."
          value={fmt(v.ticket_promedio || (v.venta_neta / (v.clientes_imp || 1)))}
          color="purple"
        />
        <KpiCard
          label="Mi Meta"
          value={vCuota > 0 ? fmt(vCuota) : 'Sin meta'}
          sub={vCuota > 0 ? `${pct(vPctCumplimiento)} logrado` : 'Configura en hoja CUOTAS'}
          color="gold"
          barValue={vCuota > 0 ? Math.min(vPctCumplimiento, 100) : 0}
        />
      </div>

      {/* ── Progreso Meta ── siempre visible, mensaje especial si no hay cuota */}
      {(() => {
        const cuota   = vCuota;
        const ventaB  = v.venta_neta || 0;
        const pctC    = vPctCumplimiento;
        const falta   = cuota - ventaB;
        const barW    = cuota > 0 ? Math.min(pctC, 100) : 0;
        const colorBar = pctC >= 100 ? 'var(--green)' : pctC >= 75 ? 'var(--amber)' : 'var(--red)';
        return (
          <div className="chart-card mb-6">
            {/* Título + estado */}
            <div className="flex items-center justify-between mb-3">
              <div className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>
                Meta del Período
              </div>
              {cuota > 0 && (
                <div className="font-mono-num font-bold" style={{ fontSize: '22px', color: colorBar }}>
                  {pct(pctC)}
                </div>
              )}
            </div>

            {cuota > 0 ? (
              <>
                {/* Barra de progreso */}
                <div
                  className="w-full rounded-full mb-1"
                  style={{ height: '10px', background: 'rgba(90,145,185,0.12)' }}
                >
                  <div
                    className="rounded-full"
                    style={{ width: `${barW}%`, height: '10px', background: colorBar, transition: 'width 0.6s ease' }}
                  />
                </div>
                <div className="text-right mb-1" style={{ fontSize: '10px', color: colorBar, fontWeight: 600 }}>
                  {falta > 0
                    ? `Faltan ${fmt(falta)} para alcanzar la meta`
                    : `✓ Meta superada — excediste por ${fmt(Math.abs(falta))}`}
                </div>
                <div className="text-right mb-4">
                  {falta > 0 && diasHabilesRestantes > 0 && (
                    <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      Faltan {fmt(falta)} · {fmt(Math.round(falta / diasHabilesRestantes))} diarios por {diasHabilesRestantes} días
                    </span>
                  )}
                </div>

                {/* Tres stats */}
                <div
                  className="grid grid-cols-3 gap-4 pt-3 border-t"
                  style={{ borderColor: 'var(--border-2)' }}
                >
                  {[
                    { label: 'Venta Neta',   val: fmt(ventaB), color: 'var(--white-2)' },
                    { label: 'Meta Mensual', val: fmt(cuota),  color: 'var(--white-2)' },
                    { label: falta > 0 ? 'Falta para Meta' : 'Meta Superada',
                      val: falta > 0 ? fmt(falta) : `+${fmt(Math.abs(falta))}`,
                      color: colorBar },
                  ].map(({ label, val, color }) => (
                    <div key={label}>
                      <div className="text-palumar-muted mb-1"
                        style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {label}
                      </div>
                      <div className="font-mono-num font-bold" style={{ fontSize: '16px', color }}>
                        {val}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 gap-2">
                <div className="text-palumar-muted text-sm">
                  Este vendedor no tiene una meta configurada para este período.
                </div>
                <div className="text-palumar-muted" style={{ fontSize: '11px' }}>
                  Agrega a <strong style={{ color: 'var(--white-2)' }}>{v.cod}</strong> en la hoja <strong style={{ color: 'var(--white-2)' }}>CUOTAS</strong> del Google Sheets.
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Metas por Negocio ── */}
      {metasPorNegocio.length > 0 && (
        <>
          <SectionTitle>Metas por Negocio</SectionTitle>
          <div className="table-card mb-4">
            <div className="overflow-x-auto">
              <table className="palma-table">
                <thead>
                  <tr>
                    <th>Negocio</th>
                    <th style={{ textAlign: 'right' }}>Meta</th>
                    <th style={{ textAlign: 'right' }}>Venta Real</th>
                    <th style={{ textAlign: 'right' }}>Proyección</th>
                    <th style={{ textAlign: 'right' }}>Cumplimiento</th>
                    <th style={{ textAlign: 'right' }}>Falta / Exceso</th>
                    <th style={{ textAlign: 'right' }}>Diario requerido</th>
                  </tr>
                </thead>
                <tbody>
                  {metasPorNegocio.map((item, i) => {
                    const proyec = Math.round(item.venta * factorProyeccion);
                    const falta  = item.meta - item.venta;           // meta − venta real
                    const col    = item.meta > 0
                      ? (item.pct_c >= 100 ? 'var(--green)' : item.pct_c >= 75 ? 'var(--amber)' : 'var(--red)')
                      : 'var(--muted)';
                    const colP   = proyec >= item.meta ? 'var(--green)' : proyec >= item.meta * 0.75 ? 'var(--amber)' : 'var(--red)';
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 500 }}>{item.negocio}</td>
                        <td style={{ textAlign: 'right' }} className="font-mono-num">{fmt(item.meta)}</td>
                        <td style={{ textAlign: 'right' }} className="font-mono-num">{fmt(item.venta)}</td>
                        <td style={{ textAlign: 'right' }} className="font-mono-num">
                          <span style={{ color: colP, fontWeight: 600 }}>{fmt(proyec)}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ color: col, fontWeight: 700 }}>{item.pct_c.toFixed(1)}%</span>
                          <div style={{ height: '4px', borderRadius: '99px', background: 'rgba(255,255,255,0.08)', marginTop: '4px', width: '80px', marginLeft: 'auto' }}>
                            <div style={{ height: '100%', borderRadius: '99px', width: `${Math.min(item.pct_c, 100)}%`, background: col }} />
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }} className="font-mono-num">
                          <span style={{ color: falta <= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                            {falta <= 0 ? '+' : ''}{fmt(Math.abs(falta))}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }} className="font-mono-num">
                          {item.meta === 0
                            ? <span style={{ color: 'var(--muted)' }}>—</span>
                            : falta <= 0
                              ? <span style={{ color: 'var(--green)', fontWeight: 600 }}>Meta alcanzada</span>
                              : diasHabilesRestantes === 0
                                ? <span style={{ color: 'var(--amber)' }}>Configurar días</span>
                                : <span style={{ color: 'var(--amber)', fontWeight: 600 }}>{fmt(Math.round(falta / diasHabilesRestantes))}</span>}
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{ borderTop: '1px solid var(--border-2)', background: 'rgba(255,255,255,0.03)' }}>
                    <td style={{ fontWeight: 700, color: 'var(--white-2)' }}>TOTAL</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }} className="font-mono-num">{fmt(metasPorNegocio.reduce((s, x) => s + x.meta, 0))}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--green)' }} className="font-mono-num">{fmt(metasPorNegocio.reduce((s, x) => s + x.venta, 0))}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }} className="font-mono-num">{fmt(metasPorNegocio.reduce((s, x) => s + Math.round(x.venta * factorProyeccion), 0))}</td>
                    <td colSpan={3} />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── DN por Marca ── */}
      {(dnMarcas.length === 0 && loadingFase2) && (
        <div className="table-card mb-4 flex items-center justify-center gap-3 py-8">
          <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" style={{ color: '#2AAED9', opacity: 0.7, flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="text-palumar-muted text-sm">Cargando cobertura por marcas…</span>
        </div>
      )}
      {dnMarcas.length > 0 && (() => {
        const myCod  = String(v.cod).trim();
        const maestro = v.maestro || 0;
        const marcasVend = dnMarcas.map(item => {
          // El cod en por_vendedor puede venir como "211-HAYMETH LEWIS" o solo "211"
          const vEntry = (item.por_vendedor || []).find(x =>
            String(x.cod || '').split('-')[0].trim() === myCod
          );
          const clientes = vEntry?.clientes || 0;
          // Recalcular DN con maestro real del vendedor (no el del servidor que puede ser 0)
          const dn_pct  = maestro > 0 ? Math.round(clientes / maestro * 1000) / 10 : 0;
          return { ...item, clientes, dn_pct };
        }).sort((a, b) => b.venta - a.venta);
        return (
          <>
            <SectionTitle>Distribución Numérica por Marca (DN)</SectionTitle>
            <div className="table-card mb-4">
              <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border-2)' }}>
                <span className="text-palumar-muted" style={{ fontSize: '11px' }}>
                  DN = clientes que compraron la marca ÷ maestro del vendedor ({maestro} clientes)
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="palma-table">
                  <thead>
                    <tr>
                      <th>Marca</th>
                      <th style={{ textAlign: 'right' }}>Clientes</th>
                      <th style={{ textAlign: 'right' }}>DN%</th>
                      <th>Progreso vs Meta</th>
                      <th style={{ textAlign: 'right' }}>Meta DN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marcasVend.map((item, i) => {
                      const hasMeta = item.meta !== null && item.meta !== undefined;
                      const col     = hasMeta
                        ? (item.dn_pct >= item.meta ? 'var(--green)' : item.dn_pct >= item.meta * 0.75 ? 'var(--amber)' : 'var(--red)')
                        : 'var(--cyan)';
                      const barPct  = hasMeta ? Math.min(item.dn_pct / item.meta * 100, 100) : Math.min(item.dn_pct * 2, 100);
                      return (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{item.marca}</td>
                          <td style={{ textAlign: 'right' }}>{item.clientes}</td>
                          <td style={{ textAlign: 'right' }}>
                            <span style={{ color: col, fontWeight: 700 }}>{item.dn_pct.toFixed(1)}%</span>
                          </td>
                          <td style={{ minWidth: '140px' }}>
                            <div style={{ height: '6px', borderRadius: '99px', background: 'rgba(255,255,255,0.08)', position: 'relative' }}>
                              <div style={{ height: '100%', borderRadius: '99px', width: `${barPct}%`, background: col }} />
                            </div>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: hasMeta ? 700 : 400, color: hasMeta ? 'var(--cyan)' : 'var(--muted)' }}>
                            {hasMeta ? `${item.meta}%` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        );
      })()}

      {/* ── Mi Cobertura por Marcas ── */}
      <SectionTitle>Mi cobertura por marcas</SectionTitle>
      {!coberturaMarcas && loadingFase2 && (
        <div className="table-card mb-4 flex items-center justify-center gap-3 py-8">
          <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" style={{ color: '#2AAED9', opacity: 0.7, flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="text-palumar-muted text-sm">Cargando cobertura por marcas…</span>
        </div>
      )}
      {!coberturaMarcas && !loadingFase2 && (
        <div className="table-card mb-4 text-center py-8 text-palumar-muted text-sm">
          No se pudo cargar cobertura por marcas.
        </div>
      )}
      {coberturaMarcas && misMarcasOrdenadas.length === 0 && (
        <div className="table-card mb-4 text-center py-8 text-palumar-muted text-sm">
          Sin datos de cobertura por marcas para este filtro.
        </div>
      )}
      {coberturaMarcas && misMarcasOrdenadas.length > 0 && (
        <>
          <p className="text-palumar-muted mb-3" style={{ fontSize: '11px' }}>
            Universo: <strong style={{ color: 'var(--white-2)' }}>{(misMarcasEntry.universo_vendedor || 0).toLocaleString('es')}</strong> clientes activos asignados · cobertura = clientes impactados ÷ universo del vendedor
          </p>
          <div className="table-card mb-3 overflow-x-auto">
            <table className="palma-table">
              <thead>
                <tr>
                  <th>Marca</th>
                  <th style={{ textAlign: 'right' }}>Clientes impactados</th>
                  <th style={{ textAlign: 'right' }}>Universo vendedor</th>
                  <th style={{ textAlign: 'right' }}>Cobertura %</th>
                  <th style={{ textAlign: 'right' }}>Venta</th>
                  <th style={{ textAlign: 'right' }}>Oportunidad</th>
                </tr>
              </thead>
              <tbody>
                {misMarcasShown.map(m => {
                  const col = m.cobertura_pct >= 70 ? 'var(--green)' : m.cobertura_pct >= 40 ? 'var(--amber)' : 'var(--red)';
                  return (
                    <tr key={m.marca}>
                      <td style={{ fontWeight: 600 }}>{m.marca}</td>
                      <td style={{ textAlign: 'right' }}>{m.clientes_impactados.toLocaleString('es')}</td>
                      <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{m.universo.toLocaleString('es')}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span style={{ color: col, fontWeight: 700 }}>{m.cobertura_pct.toFixed(1)}%</span>
                      </td>
                      <td style={{ textAlign: 'right' }} className="font-mono-num">{fmt(m.venta)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--red)' }}>{m.oportunidad_clientes.toLocaleString('es')} clientes</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {misMarcasOrdenadas.length > 10 && (
            <div className="flex justify-end mb-6">
              <button
                onClick={() => setMisMarcasVerTodas(s => !s)}
                style={{ padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border-2)', background: 'rgba(255,255,255,0.04)', color: 'var(--muted)' }}
              >
                {misMarcasVerTodas ? '▲ Ver top 10' : `▼ Ver todas mis marcas (${misMarcasOrdenadas.length})`}
              </button>
            </div>
          )}
        </>
      )}

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
          <div className="font-display font-bold text-palumar-white mb-1" style={{ fontSize: '13px' }}>
            Cobertura vs Equipo
          </div>
          <p className="text-palumar-muted mb-3" style={{ fontSize: '11px' }}>
            Cobertura = clientes impactados ÷ maestro del vendedor ({v.maestro || 0} clientes)
          </p>
          <LineChart
            labels={['Mi cobertura', 'Prom. equipo', 'Meta']}
            datasets={[{
              label: 'Porcentaje',
              data: [+v.cobertura || 0, equipoCobPct, 95],
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
              metaValue={95}
              metaLabel="Meta 95%"
              minH={120}
              rowH={32}
            />
            {/* Tabla detallada: maestro vs impactados por negocio */}
            <div className="mt-4 overflow-x-auto">
              <table className="palma-table">
                <thead>
                  <tr>
                    <th>Negocio</th>
                    <th style={{ textAlign: 'right' }}>Maestro</th>
                    <th style={{ textAlign: 'right' }}>Impactados</th>
                    <th style={{ textAlign: 'right' }}>Cobertura</th>
                  </tr>
                </thead>
                <tbody>
                  {cobVend.map((r2, i) => {
                    const cob = getCoberturaValue(r2);
                    const maestro    = r2.clientes_maestro || r2.maestro || 0;
                    const impactados = r2.impactados || 0;
                    return (
                      <tr key={i}>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-sm flex-shrink-0"
                              style={{ background: VEND_COLORS[i % VEND_COLORS.length] }} />
                            {r2.negocio || getCoberturaVendedor(r2)}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }} className="font-mono-num">{maestro}</td>
                        <td style={{ textAlign: 'right' }} className="font-mono-num">{impactados}</td>
                        <td style={{ textAlign: 'right' }} className="font-mono-num">
                          <span style={{ color: cob >= 95 ? 'var(--green)' : cob >= 75 ? 'var(--amber)' : 'var(--red)', fontWeight: 600 }}>
                            {pct(cob)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
              metaValue={90}
              metaLabel="Meta 90%"
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
        <div className={`alert-item ${+v.cobertura >= 95 ? 'alert-green' : +v.cobertura >= 75 ? 'alert-amber' : 'alert-red'}`}>
          <strong style={{ display: 'block', marginBottom: '2px', fontSize: '11px', fontWeight: 700 }}>
            Cobertura
          </strong>
          {pct(v.cobertura)} — Meta 95%
        </div>
      </div>

      {/* ── Top Devoluciones por Cliente ── */}
      {topDevolucionesVend.length > 0 && (
        <>
          <SectionTitle>Top Clientes con Devoluciones</SectionTitle>
          <div className="table-card mb-4">
            <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-2)' }}>
              <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>
                Top {topDevolucionesVend.length} por monto devuelto
              </h3>
              <span className="text-palumar-muted" style={{ fontSize: '11px' }}>
                Total: <span style={{ color: 'var(--red)', fontWeight: 600 }}>{fmt(v.devol)}</span>
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="palma-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Cód.</th>
                    <th>Cliente</th>
                    <th style={{ textAlign: 'right' }}>Devolucion $</th>
                    <th style={{ textAlign: 'right' }}>% del total</th>
                  </tr>
                </thead>
                <tbody>
                  {topDevolucionesVend.map((c, i) => {
                    const pctTotal = v.devol > 0 ? (c.total / v.devol * 100) : 0;
                    return (
                      <tr key={i}>
                        <td className="font-mono-num" style={{ color: 'var(--muted)', fontSize: '11px' }}>{i + 1}</td>
                        <td className="font-mono-num" style={{ color: 'var(--muted)' }}>{c.cod_cliente || '—'}</td>
                        <td style={{ fontWeight: 500 }}>{c.nom_cliente || '—'}</td>
                        <td style={{ textAlign: 'right' }} className="font-mono-num">
                          <span style={{ color: 'var(--red)', fontWeight: 600 }}>{fmt(c.total)}</span>
                        </td>
                        <td style={{ textAlign: 'right' }} className="font-mono-num">
                          <span style={{ color: pctTotal > 20 ? 'var(--red)' : 'var(--muted)' }}>
                            {pct(pctTotal)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Clientes Cero ── */}
      {ceroVend.length > 0 && (
        <>
          <SectionTitle>Mis Clientes Cero</SectionTitle>
          <div className="mb-3">
            <KpiCard label="Sin compra este período" value={String(ceroVend.length)} color="red" />
          </div>
          <div className="table-card mb-4">
            <div className="overflow-x-auto">
              <table className="palma-table">
                <thead>
                  <tr>
                    <th>Cód. Cliente</th>
                    <th>Cliente</th>
                    <th>Razón Social</th>
                    <th>Ciudad</th>
                  </tr>
                </thead>
                <tbody>
                  {ceroVend.map((c, i) => (
                    <tr key={i}>
                      <td className="font-mono-num" style={{ color: 'var(--red)', fontWeight: 700 }}>
                        {c.cod_cliente || c['cod cliente'] || '—'}
                      </td>
                      <td>{c.cliente || c.nom_cliente || '—'}</td>
                      <td>{c.razon_social || '—'}</td>
                      <td>{c.ciudad || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Top 10 Clientes ── */}
      {top10Vend.length > 0 && (
        <>
          <SectionTitle>Mis Top 10 Clientes</SectionTitle>
          <div className="table-card mb-4">
            <div className="overflow-x-auto">
              <table className="palma-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Cód.</th>
                    <th>Cliente</th>
                    <th style={{ textAlign: 'right' }}>Venta</th>
                  </tr>
                </thead>
                <tbody>
                  {top10Vend.map((c) => (
                    <tr key={c.cod_cliente}>
                      <td>
                        <span className="font-mono-num font-bold"
                          style={{ color: c.ranking <= 3 ? 'var(--gold)' : 'var(--muted)', fontSize: '11px' }}>
                          {c.ranking}
                        </span>
                      </td>
                      <td className="font-mono-num" style={{ color: 'var(--muted)', fontSize: '11px' }}>{c.cod_cliente}</td>
                      <td>{c.nombre}</td>
                      <td style={{ textAlign: 'right' }} className="font-mono-num">
                        <span style={{ color: 'var(--green)' }}>{fmt(c.venta)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Mejores Clientes · Mes Anterior (snapshot) ── */}
      {historicoVend.length > 0 && (
        <>
          <SectionTitle>
            <span>Mis Mejores Clientes</span>
            <span
              className="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold"
              style={{ background: 'rgba(200,164,62,0.15)', color: 'var(--gold)', fontSize: '10px' }}
            >
              {historico.mes}
            </span>
          </SectionTitle>
          <div className="table-card mb-4">
            <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>
              Cierre de {historico.mes} · Referencia para el mes en curso
            </p>
            <div className="overflow-x-auto">
              <table className="palma-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Cód.</th>
                    <th>Cliente</th>
                    <th style={{ textAlign: 'right' }}>Venta {historico.mes}</th>
                  </tr>
                </thead>
                <tbody>
                  {historicoVend.map((c) => (
                    <tr key={c.cod_cliente}>
                      <td>
                        <span className="font-mono-num font-bold"
                          style={{ color: c.ranking <= 3 ? 'var(--gold)' : 'var(--muted)', fontSize: '11px' }}>
                          {c.ranking}
                        </span>
                      </td>
                      <td className="font-mono-num" style={{ color: 'var(--muted)', fontSize: '11px' }}>{c.cod_cliente}</td>
                      <td>{c.nombre}</td>
                      <td style={{ textAlign: 'right' }} className="font-mono-num">
                        <span style={{ color: 'var(--gold)' }}>{fmt(c.venta)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Clientes por negocio del histórico */}
          {historicoVendNeg.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>
                Por negocio · {historico.mes}
              </p>
              {historicoVendNeg.map((nx, ni) => {
                if (!nx.top10?.length) return null;
                const NEG_COLORS_CSS = ['var(--blue)','var(--cyan)','var(--green)','var(--amber)','var(--gold)','var(--red)','var(--muted)'];
                const negCol = NEG_COLORS_CSS[ni % NEG_COLORS_CSS.length];
                return (
                  <div key={nx.negocio} className="mb-3">
                    <div className="px-3 py-1 rounded-t text-xs font-bold"
                      style={{ background: `${negCol}22`, color: negCol, borderLeft: `3px solid ${negCol}` }}>
                      {nx.negocio}
                    </div>
                    <table className="palma-table" style={{ borderRadius: 0 }}>
                      <tbody>
                        {nx.top10.slice(0,5).map(c => (
                          <tr key={c.cod_cliente}>
                            <td style={{ width: 28 }}>
                              <span className="font-mono-num font-bold" style={{ color: c.ranking <= 3 ? 'var(--gold)' : 'var(--muted)', fontSize: '11px' }}>
                                {c.ranking}
                              </span>
                            </td>
                            <td className="font-mono-num" style={{ color: 'var(--muted)', fontSize: '10px', width: 56 }}>{c.cod_cliente}</td>
                            <td>{c.nombre}</td>
                            <td style={{ textAlign: 'right' }} className="font-mono-num">
                              <span style={{ color: negCol, fontWeight: 600 }}>{fmt(c.venta)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Mis Top Clientes por Negocio ── */}
      {topNegociosVend.length > 0 && (
        <>
          <SectionTitle>Mis Top Clientes por Negocio</SectionTitle>
          <div className="chart-card mb-4">
            <div className="flex items-center gap-3 mb-4">
              <select
                className="palma-select"
                value={negocioVend}
                onChange={e => setNegocioVend(e.target.value)}
              >
                <option value="">— Selecciona un negocio —</option>
                {topNegociosVend.map(nx => (
                  <option key={nx.negocio} value={nx.negocio}>{nx.negocio}</option>
                ))}
              </select>
            </div>
            {(() => {
              const nx = topNegociosVend.find(x => x.negocio === negocioVend);
              if (!negocioVend) return (
                <p className="text-center text-palumar-muted text-sm py-6">
                  Selecciona un negocio para ver tus mejores clientes
                </p>
              );
              if (!nx?.top10?.length) return (
                <p className="text-center text-palumar-muted text-sm py-6">Sin datos</p>
              );
              return (
                <div className="overflow-x-auto">
                  <table className="palma-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Cód.</th>
                        <th>Cliente</th>
                        <th style={{ textAlign: 'right' }}>Venta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nx.top10.map(c => (
                        <tr key={c.cod_cliente}>
                          <td>
                            <span className="font-mono-num font-bold"
                              style={{ color: c.ranking <= 3 ? 'var(--gold)' : 'var(--muted)', fontSize: '11px' }}>
                              {c.ranking}
                            </span>
                          </td>
                          <td className="font-mono-num" style={{ color: 'var(--muted)', fontSize: '11px' }}>{c.cod_cliente}</td>
                          <td>{c.nombre}</td>
                          <td style={{ textAlign: 'right' }} className="font-mono-num">
                            <span style={{ color: 'var(--green)' }}>{fmt(c.venta)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </>
      )}

      {/* ── Mis Clientes Nuevos ── */}
      <SectionTitle>Mis Clientes Nuevos</SectionTitle>

      {/* Filtro de fechas */}
      <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-xl border"
        style={{ background: 'rgba(13,30,43,0.6)', borderColor: 'var(--border-2)' }}>
        <div className="flex items-center gap-2">
          <span className="text-palumar-muted" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Desde</span>
          <input type="date" value={desdeN} onChange={e => setDesdeN(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-palumar-muted" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Hasta</span>
          <input type="date" value={hastaN} onChange={e => setHastaN(e.target.value)} />
        </div>
        <button
          onClick={() => applyNuevos(desdeN, hastaN)}
          disabled={loadingN}
          className="h-8 px-4 rounded-lg text-xs font-semibold text-white"
          style={{ background: 'var(--blue)', opacity: loadingN ? 0.6 : 1 }}
        >
          {loadingN ? 'Cargando…' : 'Aplicar'}
        </button>
        <button
          onClick={() => { setDesdeN(''); setHastaN(''); applyNuevos('', ''); }}
          className="h-8 px-3 rounded-lg text-xs font-medium border"
          style={{ borderColor: 'var(--border-2)', color: 'var(--muted)' }}
        >
          Todo el historial
        </button>
      </div>

      <div className="mb-3">
        <KpiCard label="Clientes nuevos" value={String(nuevosVend.length)} color="green" />
      </div>

      {nuevosVend.length > 0 ? (
        <div className="table-card mb-4">
          <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-2)' }}>
            <span className="font-display font-bold text-palumar-white" style={{ fontSize: '12px' }}>
              {nuevosVend.length} cliente{nuevosVend.length !== 1 ? 's' : ''}
            </span>
            <span className="text-palumar-muted" style={{ fontSize: '11px' }}>
              {clientesNuevos.desde && clientesNuevos.hasta
                ? `${clientesNuevos.desde} → ${clientesNuevos.hasta}`
                : 'Todo el historial'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="palma-table">
              <thead>
                <tr>
                  <th>Cód.</th>
                  <th>Cliente</th>
                  <th>Razón Social</th>
                  <th>Fecha Creación</th>
                </tr>
              </thead>
              <tbody>
                {nuevosVend.map((c, i) => (
                  <tr key={i}>
                    <td className="font-mono-num" style={{ color: 'var(--cyan)', fontWeight: 600 }}>
                      {c.cod_cliente || '—'}
                    </td>
                    <td>{c.nombre || '—'}</td>
                    <td style={{ color: 'var(--muted)' }}>{c.razon_social || '—'}</td>
                    <td className="font-mono-num" style={{ color: 'var(--muted)' }}>{c.fecha_creacion || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-palumar-muted text-sm mb-4">
          Sin clientes nuevos en el rango seleccionado
        </div>
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

      {/* ── Productos Clave ── */}
      {pcVendedor && (
        <>
          <SectionTitle>Mis Productos Clave</SectionTitle>

          {/* Contexto de universo medido */}
          <p className="text-palumar-muted mb-3" style={{ fontSize: '11px' }}>
            Cobertura clave = clientes con mínimo 1 producto clave ÷ maestro del vendedor
            {pcVendedor.clientes_activos > 0
              ? ` · ${pcVendedor.clientes_activos.toLocaleString()} clientes activos`
              : ''}
          </p>

          {/* 5 KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
            <KpiCard
              label="Clientes activos"
              value={String(pcVendedor.clientes_activos || 0)}
              color="blue"
            />
            <KpiCard
              label="Impactados"
              value={String(pcVendedor.clientes_impactados_clave || 0)}
              sub="al menos un producto clave"
              color="green"
            />
            <KpiCard
              label="Pendientes"
              value={String(pcVendedor.clientes_sin_impacto_clave || 0)}
              color="red"
            />
            <KpiCard
              label="Cobertura clave"
              value={`${(pcVendedor.cobertura_clave_pct || 0).toFixed(1)}%`}
              color={pcVendedor.cobertura_clave_pct >= 70 ? 'green' : pcVendedor.cobertura_clave_pct >= 40 ? 'amber' : 'red'}
              barValue={pcVendedor.cobertura_clave_pct || 0}
              sub={pcVendedor.cobertura_clave_pct >= 70 ? 'Bien' : pcVendedor.cobertura_clave_pct >= 40 ? 'En avance' : 'Crítico'}
            />
            <KpiCard
              label="Venta clave"
              value={fmt(pcVendedor.venta_productos_clave || 0)}
              color="cyan"
            />
          </div>

          {/* Tabla de clientes pendientes del vendedor */}
          {clientesSinPCVend.length > 0 && (
            <div className="table-card mb-4">
              <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-2)' }}>
                <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>
                  Clientes Pendientes — Sin Producto Clave
                </h3>
                <span className="text-palumar-muted" style={{ fontSize: '11px' }}>
                  {clientesSinPCVend.length} clientes
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="palma-table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Código</th>
                      <th style={{ textAlign: 'right' }}>Venta total periodo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientesSinPCVend.slice(0, 100).map((c, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{c.nombre_cliente || '—'}</td>
                        <td className="font-mono-num" style={{ color: 'var(--muted)', fontSize: '11px' }}>{c.cod_cliente}</td>
                        <td style={{ textAlign: 'right' }} className="font-mono-num">
                          {c.venta_total_periodo > 0
                            ? <span style={{ color: 'var(--cyan)' }}>{fmt(c.venta_total_periodo)}</span>
                            : <span style={{ color: 'var(--muted)' }}>$0</span>}
                        </td>
                      </tr>
                    ))}
                    {clientesSinPCVend.length > 100 && (
                      <tr>
                        <td colSpan={3} style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '11px', padding: '8px' }}>
                          + {clientesSinPCVend.length - 100} clientes más
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Mis Combos ── */}
      {(combosVendedorEntry || combosVendedorDetalleLoading || combosVendedorDetalleEntry) && (
        <>
          <SectionTitle>Mis Combos</SectionTitle>

          {/* 4 KPIs — solo ejecución, sin metas ni cumplimiento */}
          {combosVendedorEntry && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <KpiCard
                label="Clientes del maestro"
                value={String(v?.maestro || 0)}
                color="blue"
              />
              <KpiCard
                label="Clientes con combos"
                value={String(combosVendedorEntry.clientes_impactados || 0)}
                color="teal"
              />
              <KpiCard
                label="Unidades combos"
                value={String(combosVendedorEntry.unidades_vendidas || 0)}
                color="cyan"
              />
              <KpiCard
                label="Venta combos"
                value={fmt(combosVendedorEntry.venta_combos || 0)}
                color="purple"
              />
            </div>
          )}

          {/* Tabla detalle por producto */}
          <div className="table-card mb-4">
            {combosVendedorDetalleLoading ? (
              <div className="flex items-center justify-center" style={{ minHeight: 80 }}>
                <span className="text-palumar-muted" style={{ fontSize: 12 }}>Cargando combos del vendedor…</span>
              </div>
            ) : combosVendedorDetalleEntry?.productos?.length > 0 ? (
              <>
                <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-2)' }}>
                  <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>Detalle por Producto Combo</h3>
                  <span className="text-palumar-muted" style={{ fontSize: '11px' }}>{combosVendedorDetalleEntry.productos.length} productos</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="palma-table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>SAP</th>
                        <th>Negocio</th>
                        <th style={{ textAlign: 'right' }}>Clientes</th>
                        <th style={{ textAlign: 'right' }}>Unidades</th>
                        <th style={{ textAlign: 'right' }}>Venta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {combosVendedorDetalleEntry.productos.map((p, i) => (
                        <tr key={i} style={{ opacity: p.unidades_vendidas === 0 ? 0.55 : 1 }}>
                          <td style={{ fontWeight: p.unidades_vendidas > 0 ? 600 : 400 }}>
                            {p.producto || p.sap}
                            {p.unidades_vendidas === 0 && (
                              <span className="badge badge-red" style={{ fontSize: '9px', marginLeft: '6px' }}>sin venta</span>
                            )}
                          </td>
                          <td className="font-mono-num" style={{ color: 'var(--muted)', fontSize: '11px' }}>{p.sap}</td>
                          <td style={{ color: 'var(--muted)' }}>{p.negocio || '—'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{p.clientes_impactados}</td>
                          <td style={{ textAlign: 'right' }}>{p.unidades_vendidas}</td>
                          <td style={{ textAlign: 'right' }} className="font-mono-num">{fmt(p.venta_combos)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center" style={{ minHeight: 64 }}>
                <span className="text-palumar-muted" style={{ fontSize: 12 }}>
                  Este vendedor aún no tiene ventas de combos.
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
