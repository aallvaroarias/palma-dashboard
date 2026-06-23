import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useDashboardStore from '../../store/dashboardStore';
import KpiCard from '../ui/KpiCard';
import SectionTitle from '../ui/SectionTitle';
import HBarChart from '../charts/HBarChart';
import LineChart from '../charts/LineChart';
import {
  fmt, fmtK, pct, norm,
  getCoberturaVendedor, getCoberturaValue, esRutaCentral,
} from '../../utils/formatters';
import { VEND_COLORS } from '../../utils/colors';

function AlertItem({ type, children }) {
  return (
    <div className={`alert-item ${type}`}>
      {children}
    </div>
  );
}

/** Encabezado de sección colapsable — mismo estilo que SectionTitle pero con toggle */
function CollapseTitle({ open, onToggle, children, badge }) {
  return (
    <div
      className="flex items-center gap-3 mt-7 mb-3.5 cursor-pointer select-none"
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onToggle()}
    >
      <div style={{ width: 3, height: 14, borderRadius: 2, background: 'linear-gradient(180deg,#2AAED9 0%,#1A7FA6 100%)', flexShrink: 0 }} />
      <span className="font-display font-bold uppercase tracking-widest text-palumar-white" style={{ fontSize: '10.5px', letterSpacing: '1.4px', opacity: 0.75 }}>
        {children}
      </span>
      {badge != null && (
        <span style={{ fontSize: '10px', color: 'var(--muted)', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', padding: '1px 6px' }}>
          {badge}
        </span>
      )}
      <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg,var(--border-2) 0%,transparent 100%)' }} />
      <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, marginLeft: 4 }}>
        {open ? '▲ Colapsar' : '▼ Ver'}
      </span>
    </div>
  );
}

// ── Helpers de sede ────────────────────────────────────────────────────────────
// Extrae el código del asesor de un label "201 - ANAYS" → "201"
// (equivalente a obtenerCodAsesor_ del backend)
const extractCod = (label) => String(label || '').split('-')[0].trim();

// Normaliza el nombre de sede a forma canónica
const normalizarSede = (sede) => {
  const s = String(sede || '').toUpperCase().trim();
  if (s.includes('CHIRIQ')) return 'CHIRIQUI';
  if (s.includes('CENTRAL') || s.includes('CTR')) return 'CENTRALES';
  return s;
};

// Umbrales de semáforo para Seguimiento de Concursos — mismo corte que usa
// el backend (Código.js) para calcular el campo `estado` de cada vendedor.
const UMBRAL_VERDE_CONCURSO    = 70;
const UMBRAL_AMARILLO_CONCURSO = 40;

export default function Gerencial() {
  const {
    resumen: r,
    vendedores,
    cobertura,
    cobNegocio,
    efectividad,
    clientesNuevos,
    clientesCero,
    tendencia,
    marcas,
    skus,
    topClientes,
    cuotas,
    coberturaMarcas,
    refetchClientes,
    coberturaPC,
    coberturaVendedoresPC,
    clientesSinPC,
    pcDetalle,
    loadPCDetalle,
    pcDetalleLoading,
    loadClientesSinPC,
    clientesSinPCLoading,
    combosResumen,
    combosVendedor,
    combosDetalle,
    loadCombosDetalle,
    combosDetalleLoading,
    loadingFase2,
    config,
    isStale,
    lastSuccessfulLoad,
    lastLoadError,
    loadAll,
  } = useDashboardStore();

  const [sedeFiltro, setSedeFiltro]       = useState('TODOS'); // 'TODOS' | 'CENTRALES' | 'CHIRIQUI'
  const [negocioFiltro, setNegocioFiltro] = useState('');
  const [cobNegOrden, setCobNegOrden]     = useState('oportunidad'); // orden de "Cobertura por Negocio"
  const [vendedorTop10, setVendedorTop10] = useState('');
  const [negocioTop10, setNegocioTop10]   = useState('');
  const [ceroVendSel, setCeroVendSel] = useState('');
  const [loadingNuevosG, setLoadingNuevosG] = useState(false);
  const [filtroNuevosLabel, setFiltroNuevosLabel] = useState('Este período');
  const [showSinPC, setShowSinPC]         = useState(false);   // panel clientes pendientes
  const [showPCDetalle, setShowPCDetalle] = useState(false);   // panel detalle por producto

  // Secciones colapsadas (cerradas por defecto para mantener el panel ejecutivo)
  const [openCobertura,   setOpenCobertura]   = useState(false);
  const [openCobNegocio,  setOpenCobNegocio]  = useState(false);
  const [openMetasCumpl,  setOpenMetasCumpl]  = useState(false);
  const [openEfectividad, setOpenEfectividad] = useState(false);
  const [openCeroClientes,setOpenCeroClientes]= useState(false);
  const [openNuevos,      setOpenNuevos]      = useState(false);
  const [openAnalisis,    setOpenAnalisis]    = useState(false);
  const [openMarcas,      setOpenMarcas]      = useState(false);
  const [openAvanceVend,  setOpenAvanceVend]  = useState(false);
  const [showAllPCTable,      setShowAllPCTable]      = useState(false);
  const [showCombosDetalle,   setShowCombosDetalle]   = useState(false);
  const [showAllCombosTable,  setShowAllCombosTable]  = useState(false); // ver todos los vendedores combos
  const [negocioAnalisisFiltro, setNegocioAnalisisFiltro] = useState(''); // filtro análisis SKUs/marcas
  const [skusLimit,           setSkusLimit]           = useState(15); // paginación "Ver más" SKUs
  const [marcasVerTodas, setMarcasVerTodas] = useState(false); // Cobertura por marcas: top10 vs todas
  const [marcasOrden,    setMarcasOrden]    = useState('cobertura'); // 'cobertura' | 'oportunidad' | 'venta'

  const applyNuevosG = useCallback(async (desde, hasta, label) => {
    setLoadingNuevosG(true);
    setFiltroNuevosLabel(label);
    try { await refetchClientes(desde || undefined, hasta || undefined); }
    finally { setLoadingNuevosG(false); }
  }, [refetchClientes]);

  // Limpiar selección de vendedor cero al cambiar sede
  useEffect(() => { setCeroVendSel(''); }, [sedeFiltro]);

  // Quick filter helpers
  const hoy = new Date();
  const primerDiaMes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
  const hoyStr = hoy.toISOString().slice(0, 10);
  const hace30 = new Date(hoy); hace30.setDate(hoy.getDate() - 30);
  const hace30Str = hace30.toISOString().slice(0, 10);

  // ── Mapa cod → sede (fuente: cuotas, que tiene campo sede por asesor) ─────────
  // DEBE ser el primero de los memos de sede: los siguientes dependen de él.
  const asesorSedeMap = useMemo(() => {
    const map = {};
    cuotas.forEach(c => {
      const cod = String(c.cod || '').trim();
      if (cod) map[cod] = normalizarSede(c.sede || '');
    });
    return map;
  }, [cuotas]);

  // ── Vendedores filtrados por sede ────────────────────────────────────────────
  const vendedoresFiltrados = useMemo(() => {
    if (sedeFiltro === 'TODOS') return vendedores;
    return vendedores.filter(v => {
      const cod = String(v.cod || '').trim();
      return asesorSedeMap[cod] === sedeFiltro;
    });
  }, [vendedores, asesorSedeMap, sedeFiltro]);

  // ── Clientes cero filtrados por sede ─────────────────────────────────────────
  const ceroVendedoresFiltrados = useMemo(() => {
    if (sedeFiltro === 'TODOS') return clientesCero.por_vendedor || [];
    return (clientesCero.por_vendedor || []).filter(row => {
      const cod = String(row.cod || extractCod(row.vendedor || '')).trim();
      return asesorSedeMap[cod] === sedeFiltro;
    });
  }, [clientesCero, asesorSedeMap, sedeFiltro]);

  // Total clientes cero del filtro actual
  const ceroCeroTotal = useMemo(
    () => ceroVendedoresFiltrados.reduce((s, row) => s + (row.cantidad || 0), 0),
    [ceroVendedoresFiltrados]
  );

  // Detalle de clientes cero del vendedor seleccionado
  const ceroVendDetalle = useMemo(() => {
    if (!ceroVendSel) return [];
    return (clientesCero.detalle || []).filter(c => {
      const matchVend = c.cod_vendedor
        ? String(c.cod_vendedor).trim() === ceroVendSel
        : String(c.vendedor || '').trim() === ceroVendSel;
      return matchVend;
    });
  }, [clientesCero, ceroVendSel]);

  const vs = useMemo(
    () => [...vendedoresFiltrados].sort((a, b) => (b.venta_neta || 0) - (a.venta_neta || 0)),
    [vendedoresFiltrados]
  );

  const cobData = useMemo(() => {
    const base = sedeFiltro === 'TODOS'
      ? cobertura
      : cobertura.filter(r2 => {
          const cod = extractCod(getCoberturaVendedor(r2));
          return asesorSedeMap[cod] === sedeFiltro;
        });
    return base
      .filter(r2 => getCoberturaValue(r2) > 0)
      .sort((a, b) => getCoberturaValue(b) - getCoberturaValue(a));
  }, [cobertura, asesorSedeMap, sedeFiltro]);

  // Efectividad — excluir Ruta Centrales + filtrar por sede
  const efData = useMemo(() => {
    const base = sedeFiltro === 'TODOS'
      ? (efectividad.resumen_mes || [])
      : (efectividad.resumen_mes || []).filter(r2 => {
          const cod = extractCod(getCoberturaVendedor(r2));
          return asesorSedeMap[cod] === sedeFiltro;
        });
    return base.filter(r2 => !esRutaCentral(getCoberturaVendedor(r2)));
  }, [efectividad, asesorSedeMap, sedeFiltro]);

  const efField = useMemo(() => {
    if (!efData.length) return 'efectividad';
    return Object.keys(efData[0]).find(k => k.includes('efectividad')) || 'efectividad';
  }, [efData]);

  // Negocio options for dropdown
  const negocios = useMemo(() => {
    const set = new Set();
    cobNegocio.forEach(r2 => r2.negocio && set.add(r2.negocio));
    return [...set].sort();
  }, [cobNegocio]);

  // Pivot: cobertura por negocio filtrada
  const cobNegFiltrada = useMemo(() => {
    if (!negocioFiltro) return [];
    return cobNegocio.filter(r2 => r2.negocio === negocioFiltro);
  }, [cobNegocio, negocioFiltro]);

  // Mapas de venta por vendedor para las barras de cobertura.
  //
  // El label de cobertura viene como "201 - ANAYS" (código + nombre).
  // v.cod = "201" y v.nombre = "ANAYS" vienen de fuentes separadas.
  // La clave más robusta es norm(cod + nombre) = "201ANAYS",
  // porque norm("201 - ANAYS") también da "201ANAYS" (elimina espacios y guiones).
  // Así coinciden sin importar el separador que use cada fuente.
  const vendVentaMap = useMemo(() => {
    const map = {};
    vendedoresFiltrados.forEach(v => {
      const venta  = v.venta_neta || 0;
      const cod    = String(v.cod    || '').trim();
      const nombre = String(v.nombre || '').trim();
      if (cod && nombre) map[norm(cod + nombre)] = venta;  // "201ANAYS"  ← clave principal
      if (cod)           map[cod]                = venta;  // "201"        ← fallback
      if (nombre)        map[norm(nombre)]       = venta;  // "ANAYS"      ← fallback
    });
    return map;
  }, [vendedoresFiltrados]);

  // Mapa equivalente para venta en el negocio seleccionado (cobertura por negocio)
  const cobNegVentaMap = useMemo(() => {
    if (!negocioFiltro) return {};
    const map = {};
    vendedoresFiltrados.forEach(v => {
      const n     = (v.venta_por_negocio || []).find(x => x.negocio === negocioFiltro);
      const venta = n ? (n.venta || 0) : 0;
      const cod    = String(v.cod    || '').trim();
      const nombre = String(v.nombre || '').trim();
      if (cod && nombre) map[norm(cod + nombre)] = venta;
      if (cod)           map[cod]                = venta;
      if (nombre)        map[norm(nombre)]       = venta;
    });
    return map;
  }, [vendedoresFiltrados, negocioFiltro]);

  const promEquipoCob = useMemo(() => {
    if (!cobData.length) return 0;
    return cobData.reduce((s, r2) => s + getCoberturaValue(r2), 0) / cobData.length;
  }, [cobData]);

  // Resumen total cobertura para el negocio seleccionado
  const cobNegResumen = useMemo(() => {
    if (!cobNegFiltrada.length) return null;
    const totalImp = cobNegFiltrada.reduce((s, r2) => s + (Number(r2.impactados) || 0), 0);
    const totalMae = cobNegFiltrada.reduce((s, r2) => s + (Number(r2.clientes_maestro) || 0), 0);
    const pctTotal = totalMae > 0 ? totalImp / totalMae * 100 : 0;
    return { totalImp, totalMae, pctTotal };
  }, [cobNegFiltrada]);

  // ── Detalle por vendedor para el negocio seleccionado ───────────────────────
  // clientes_maestro en COBERTURA_NEGOCIO ya es el universo TOTAL del vendedor
  // (mismo valor en todas sus filas de negocio) — viene de RESUMEN_COBERTURA,
  // la misma fuente que usa el resto de PALMA para universos. No se inventa.
  const cobNegDetalle = useMemo(() => {
    return cobNegFiltrada.map(r2 => {
      const lbl       = getCoberturaVendedor(r2);
      const maestro    = Number(r2.clientes_maestro) || 0;
      const impactados = Number(r2.impactados) || 0;
      const venta      = cobNegVentaMap[norm(lbl)] ?? cobNegVentaMap[lbl.split('-')[0].trim()] ?? 0;
      return {
        vendedor:   lbl,
        cobertura:  getCoberturaValue(r2),
        impactados,
        maestro,
        pendientes: Math.max(0, maestro - impactados),
        venta,
      };
    });
  }, [cobNegFiltrada, cobNegVentaMap]);

  const cobNegOrdenado = useMemo(() => {
    const sorters = {
      oportunidad:    (a, b) => b.pendientes - a.pendientes,
      menorCobertura: (a, b) => a.cobertura  - b.cobertura,
      mayorCobertura: (a, b) => b.cobertura  - a.cobertura,
      mayorVenta:     (a, b) => b.venta      - a.venta,
    };
    return [...cobNegDetalle].sort(sorters[cobNegOrden] || sorters.oportunidad);
  }, [cobNegDetalle, cobNegOrden]);

  // ── Cobertura por marcas: TODAS las marcas, recalculado por sede ────────────
  // TODOS → usa coberturaMarcas.marcas (ya agregado global en backend).
  // Sede  → re-agrega desde coberturaMarcas.vendedores filtrados por sede,
  // mismo patrón que metasPorNegocio/cobNegResumen, para que Gerencial nunca
  // difiera de Mi Panel (misma fuente backend, el frontend solo filtra).
  const marcasGeneral = useMemo(() => {
    if (!coberturaMarcas) return [];
    if (sedeFiltro === 'TODOS') return coberturaMarcas.marcas || [];

    const vendsFiltrados = (coberturaMarcas.vendedores || []).filter(v =>
      normalizarSede(v.sede) === sedeFiltro
    );
    if (!vendsFiltrados.length) return [];

    const universoTotal = vendsFiltrados.reduce((s, v) => s + (v.universo_vendedor || 0), 0);
    const acc = {}; // marca → { clientes, venta }
    vendsFiltrados.forEach(v => {
      (v.marcas || []).forEach(m => {
        if (!acc[m.marca]) acc[m.marca] = { clientes: 0, venta: 0 };
        acc[m.marca].clientes += m.clientes_impactados || 0;
        acc[m.marca].venta    += m.venta || 0;
      });
    });

    return Object.entries(acc).map(([marca, d]) => ({
      marca,
      clientes_impactados: d.clientes,
      universo: universoTotal,
      cobertura_pct: universoTotal > 0 ? Math.round(d.clientes / universoTotal * 1000) / 10 : 0,
      venta: Math.round(d.venta * 100) / 100,
      oportunidad_clientes: Math.max(0, universoTotal - d.clientes),
    })).sort((a, b) => b.cobertura_pct - a.cobertura_pct);
  }, [coberturaMarcas, sedeFiltro]);

  const marcasMiniKPIs = useMemo(() => {
    if (!marcasGeneral.length) return null;
    const conVenta = marcasGeneral.filter(m => (m.venta || 0) > 0);
    const lider = [...marcasGeneral].sort((a, b) => b.cobertura_pct - a.cobertura_pct)[0];
    const mayorOportunidad = [...marcasGeneral].sort((a, b) => b.oportunidad_clientes - a.oportunidad_clientes)[0];
    return { lider, mayorOportunidad, totalConVenta: conVenta.length };
  }, [marcasGeneral]);

  const marcasOrdenadas = useMemo(() => {
    const sorters = {
      cobertura:   (a, b) => b.cobertura_pct - a.cobertura_pct,
      oportunidad: (a, b) => b.oportunidad_clientes - a.oportunidad_clientes,
      venta:       (a, b) => b.venta - a.venta,
    };
    return [...marcasGeneral].sort(sorters[marcasOrden] || sorters.cobertura);
  }, [marcasGeneral, marcasOrden]);

  const marcasTablaShown = marcasVerTodas ? marcasOrdenadas : marcasOrdenadas.slice(0, 10);

  // ── Seguimiento de concursos: filtrado por sede + excluye RUTA CENTRALES ────
  // (RUTA CENTRALES es una ruta virtual, no un vendedor gestionable — mismo
  // criterio que avanceVendedores/efData más abajo.)
  const concursoVendedoresFiltrados = useMemo(() => {
    if (!coberturaMarcas?.concursos) return [];
    const base = (coberturaMarcas.concursos.vendedores || []).filter(v => !esRutaCentral(v.vendedor));
    const filtrados = sedeFiltro === 'TODOS'
      ? base
      : base.filter(v => normalizarSede(v.sede) === sedeFiltro);
    return [...filtrados].sort((a, b) => a.promedio_cobertura_pct - b.promedio_cobertura_pct);
  }, [coberturaMarcas, sedeFiltro]);

  const concursoResumenFiltrado = useMemo(() => {
    if (!coberturaMarcas?.concursos) return [];
    const marcasNombres = coberturaMarcas.concursos.marcas || [];
    if (sedeFiltro === 'TODOS') return coberturaMarcas.concursos.resumen || [];
    if (!concursoVendedoresFiltrados.length) return [];

    const universoTotal = concursoVendedoresFiltrados.reduce((s, v) => s + (v.universo || 0), 0);
    return marcasNombres.map(marca => {
      const clientes = concursoVendedoresFiltrados.reduce(
        (s, v) => s + (v.marcas?.[marca]?.clientes_impactados || 0), 0
      );
      return {
        marca,
        clientes_impactados: clientes,
        universo: universoTotal,
        cobertura_pct: universoTotal > 0 ? Math.round(clientes / universoTotal * 1000) / 10 : 0,
      };
    });
  }, [coberturaMarcas, sedeFiltro, concursoVendedoresFiltrados]);

  // Mapa cod→cuota desde la hoja CUOTAS (fuente directa, independiente del join en backend)
  const cuotaMap = useMemo(() => {
    const map = {};
    cuotas.forEach(c => { if (c.cod) map[String(c.cod).trim()] = c.cuota || 0; });
    return map;
  }, [cuotas]);

  // ── Resumen filtrado por sede ─────────────────────────────────────────────
  // Cuando sedeFiltro === 'TODOS' retorna el resumen global (r).
  // Cuando hay filtro de sede retorna r.por_sede[sedeFiltro] (calculado en backend).
  // DEBE estar ANTES del early return `if (!r)` para no violar las reglas de Hooks.
  const rf = useMemo(() => {
    if (!r) return null;
    if (sedeFiltro === 'TODOS') return r;
    return r?.por_sede?.[sedeFiltro] ?? r;
  }, [r, sedeFiltro]);

  // Auditoría en consola cada vez que cambia sede o datos
  useMemo(() => {
    if (!rf) return;
    console.group('[FiltroSede KPIs] sede=' + sedeFiltro);
    console.log('resumen crudo (r):',      r);
    console.log('resumen filtrado (rf):',  rf);
    console.log('venta_bruta',             rf.venta_bruta);
    console.log('devolucion_total',        rf.devolucion_total);
    console.log('averia_total',            rf.averia_total);
    console.log('descuento_total',         rf.descuento_total);
    console.log('venta_neta',              rf.venta_neta);
    console.log('clientes_impactados',     rf.clientes_impactados);
    console.log('clientes_maestro',        rf.clientes_maestro);
    console.log('cobertura_pct',           rf.cobertura_pct);
    console.log('cuota_total',             rf.cuota_total);
    if (r?.por_sede) {
      const tC = r.por_sede.CENTRALES;
      const tQ = r.por_sede.CHIRIQUI;
      const tS = r.por_sede.SIN_SEDE;
      console.log('Σ venta_neta  C+Q+S =', (tC?.venta_neta||0)+(tQ?.venta_neta||0)+(tS?.venta_neta||0), '≈ TODOS =', r.venta_neta);
      console.log('Σ devol_total C+Q+S =', (tC?.devolucion_total||0)+(tQ?.devolucion_total||0)+(tS?.devolucion_total||0), '≈ TODOS =', r.devolucion_total);
    }
    console.groupEnd();
  }, [rf, sedeFiltro, r]);

  // Vendedores con cuota configurada, ordenados por % cumplimiento desc
  const metaData = useMemo(() => {
    return [...vendedoresFiltrados]
      .filter(v => !esRutaCentral(v.nombre))
      .map(v => {
        const cuota = cuotaMap[String(v.cod).trim()] ?? (v.cuota || 0);
        const venta = v.venta_neta || 0;
        const pct_cumplimiento = cuota > 0 ? Math.round(venta / cuota * 1000) / 10 : 0;
        return { ...v, cuota, pct_cumplimiento };
      })
      .filter(v => v.cuota > 0)
      .sort((a, b) => b.pct_cumplimiento - a.pct_cumplimiento);
  }, [vendedoresFiltrados, cuotaMap]);

  // ── Normalización de nombres de negocio ──────────────────────────────────
  // Unifica nombres que vienen con código ("03-Chocolates"), sin tildes ("Cafe"),
  // con caracteres dañados ("Caf�"), en mayúsculas, etc.
  const MAPA_NEGOCIOS = {
    'CHOCOLATES':        'Chocolates',
    'CHOCOLATE':         'Chocolates',
    'GALLETAS':          'Galletas',
    'GALLETA':           'Galletas',
    'CARNICO':           'Cárnico',
    'CARNICOS':          'Cárnico',
    'CARNICA':           'Cárnico',
    'CAFE':              'Café',
    'CAF':               'Café',
    'BEBIDAS TMLUC':     'Bebidas TMLUC',
    'BEBIDAS':           'Bebidas TMLUC',
    'TMLUC':             'Bebidas TMLUC',
    'SNACKS TMLUC':      'Snacks TMLUC',
    'SNACKS':            'Snacks TMLUC',
    'OTROS TMLUC':       'Otros TMLUC',
    'OTROS':             'Otros TMLUC',
    'NUTRICION EXPERTA':  'Nutrición Experta',
    'NUTRICION':          'Nutrición Experta',
    // variantes con Û→U (encoding artifact U+00DB): "NutriciÛn" → NFD strip → "NUTRICIUN"
    'NUTRICIUN EXPERTA':  'Nutrición Experta',
    'NUTRICIUN':          'Nutrición Experta',
    // variante con espacio corrupto "NUTRICI N EXPERTA"
    'NUTRICI N EXPERTA':  'Nutrición Experta',
    // variante sin espacio "NUTRICIONEXPERTA"
    'NUTRICIONEXPERTA':   'Nutrición Experta',
    'BARRAS CORTAS':     'Barras Cortas',
    'BARRAS':            'Barras Cortas',
    'TAJADOS':           'Tajados',
    'TAJADO':            'Tajados',
    'SABORIZADAS':       'Saborizadas',
    'SALUDABLES':        'Saludables',
  };

  function normNeg(nombre) {
    if (!nombre) return '';
    let s = String(nombre).trim();
    // Reparar Mojibake MacRoman: bytes UTF-8 leídos como Mac Roman
    // é → √©   ó → √≥   ú → √∫   á → √°   í → √≠   ñ → √±
    s = s.replace(/√©/g, 'e').replace(/√≥/g, 'o').replace(/√∫/g, 'u')
         .replace(/√°/g, 'a').replace(/√±/g, 'n').replace(/√≠/g, 'i');
    // Reparar Û/û (U+00DB / U+00FB): en algunos encodings "ó" llega como Û
    // NFD de Û = U + combining circumflex → tras strip queda "U" → "NUTRICIUN"
    // Reemplazamos antes de NFD para que caiga en la clave del mapa
    s = s.replace(/Û/g, 'u').replace(/û/g, 'u');
    // Quitar código inicial con cualquier cantidad de dígitos: "241-", "03-", "001 -"
    s = s.replace(/^\d+\s*[-_]\s*/, '');
    // Guardar versión limpia (sin código) para el fallback
    const limpio = s.trim();
    // Quitar acentos y caracteres corruptos para lookup en mapa
    s = s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/�/g, '').replace(/\?/g, '');
    s = s.toUpperCase().replace(/\s+/g, ' ').trim();
    if (process.env.NODE_ENV !== 'production' && s.includes('NUTRI')) {
      console.log('[normNeg] entrada:', nombre, '→ clave:', s, '→ resultado:', MAPA_NEGOCIOS[s] || limpio);
    }
    // Si está en el mapa usar el nombre canónico, si no usar el nombre limpio (sin código)
    return MAPA_NEGOCIOS[s] ? MAPA_NEGOCIOS[s] : limpio;
  }

  // Metas por negocio: suma cuotas × sede cruzada con venta real por negocio
  const metasPorNegocio = useMemo(() => {
    // ── Meta: filtrar cuotas por sede ─────────────────────────────────────────
    const cuotasFiltradas = sedeFiltro === 'TODOS'
      ? cuotas
      : cuotas.filter(c => normalizarSede(c.sede) === sedeFiltro);

    const metaMap = {};
    cuotasFiltradas.forEach(c => {
      (c.por_negocio || []).forEach(({ negocio, meta }) => {
        const key = normNeg(negocio);
        if (key) metaMap[key] = (metaMap[key] || 0) + (meta || 0);
      });
    });
    if (!Object.keys(metaMap).length) return [];

    // ── Venta: siempre desde rf.venta_por_negocio (backend pre-agregado por sede) ─
    // TODOS → rf === r → r.venta_por_negocio
    // Sede  → rf === r.por_sede[sedeFiltro] → venta_por_negocio de esa sede
    // Fallback: si por_sede no está en cache (backend viejo), usar vendedoresFiltrados
    const rfVpn = rf?.venta_por_negocio;
    const ventaMap = {};
    if (rfVpn?.length) {
      rfVpn.forEach(({ negocio, venta }) => {
        const key = normNeg(negocio);
        if (key) ventaMap[key] = (ventaMap[key] || 0) + (venta || 0);
      });
    } else {
      // Fallback: calcular desde vendedores cuando por_sede no está disponible
      vendedoresFiltrados.forEach(v => {
        (v.venta_por_negocio || []).forEach(({ negocio, venta }) => {
          const key = normNeg(negocio);
          if (key) ventaMap[key] = (ventaMap[key] || 0) + (venta || 0);
        });
      });
    }

    // ── KPI de referencia (para calcular "sin negocio") ──────────────────────
    const ventaKPI = rf?.venta_neta ?? 0;

    // Factor de proyección (días hábiles lun-sáb)
    const hoy2 = new Date();
    const inicio = new Date(hoy2.getFullYear(), hoy2.getMonth(), 1);
    const fin    = new Date(hoy2.getFullYear(), hoy2.getMonth() + 1, 0);
    function diasHab(a, b) {
      let n = 0, d = new Date(a);
      while (d <= b) { if (d.getDay() !== 0) n++; d.setDate(d.getDate() + 1); }
      return n;
    }
    const hTotal  = diasHab(inicio, fin);
    const hTransc = diasHab(inicio, hoy2);
    const factor  = hTransc > 0 ? hTotal / hTransc : 1;

    const ventaTotalRaw   = Object.values(ventaMap).reduce((s, v) => s + v, 0);
    const ventaSinNegocio = Math.round((ventaKPI - ventaTotalRaw) * 100) / 100;

    // Auditoría (solo en modo TODOS para mantener consistencia con la auditoría original)
    if (sedeFiltro === 'TODOS') {
      const rawEntries = rf?.venta_por_negocio || [];
      const negociosNormalizados = rawEntries.map(n => ({ crudo: n.negocio, normalizado: normNeg(n.negocio) }));
      const noHomologados = negociosNormalizados.filter(n => {
        const s = n.crudo.trim().replace(/^\d+\s*[-_]\s*/, '')
          .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/�/g, '')
          .toUpperCase().replace(/\s+/g, ' ').trim();
        return !MAPA_NEGOCIOS[s];
      });
      console.group('[MetasPorNegocio] Auditoría diferencia KPI vs tabla');
      console.table({ ventaKpiPrincipal: ventaKPI, sumaNegociosEnBASE: ventaTotalRaw, ventaSinNegocioEnBASE: ventaSinNegocio });
      if (noHomologados.length) console.warn('⚠ Negocios NO homologados:', noHomologados);
      else console.log('✅ Todos los negocios fueron homologados');
      console.groupEnd();
    }

    // Unión de todos los negocios (floats internos, sin redondear)
    const allKeys = new Set([...Object.keys(metaMap), ...Object.keys(ventaMap)]);
    const rows = [...allKeys].map(key => {
      const meta  = metaMap[key] || 0;
      const venta = ventaMap[key] || 0;
      const proyec = venta * factor;
      const pctC     = meta > 0 ? Math.round(venta  / meta * 1000) / 10 : 0;
      const pctProy  = meta > 0 ? Math.round(proyec / meta * 1000) / 10 : 0;
      const falta  = meta - venta;
      return { negocio: key, meta, venta, proyec, pctC, pctProy, falta, conMeta: meta > 0 };
    }).sort((a, b) => b.meta - a.meta || b.venta - a.venta);

    // Fila "Sin negocio identificado" si diferencia > $0.50
    if (Math.abs(ventaSinNegocio) > 0.5) {
      rows.push({
        negocio: 'Sin negocio identificado',
        meta: 0, venta: ventaSinNegocio,
        proyec: ventaSinNegocio * factor,
        pctC: 0, pctProy: 0, falta: 0, conMeta: false, sinIdentificar: true,
      });
    }

    return rows;
  }, [cuotas, rf, vendedoresFiltrados, sedeFiltro]);

  // Venta NETA por negocio — normalizada con normNeg, agrupada, sin códigos ni chars dañados
  // Fuente principal: rf.venta_por_negocio (pre-agregado en backend por sede).
  // Fallback: vendedoresFiltrados[].venta_por_negocio si por_sede no está disponible.
  const neg = useMemo(() => {
    const grouped = {};
    const source = rf?.venta_por_negocio;
    if (source?.length) {
      source.forEach(({ negocio, venta }) => {
        const key = normNeg(negocio);
        if (!key) return;
        grouped[key] = (grouped[key] || 0) + (venta || 0);
      });
    } else {
      // Fallback cuando el backend no tiene por_sede todavía
      vendedoresFiltrados.forEach(v => {
        (v.venta_por_negocio || []).forEach(({ negocio, venta }) => {
          const key = normNeg(negocio);
          if (!key) return;
          grouped[key] = (grouped[key] || 0) + (venta || 0);
        });
      });
    }

    return Object.entries(grouped)
      .filter(([, venta]) => venta > 0)
      .map(([negocio, venta]) => ({ negocio, venta }))
      .sort((a, b) => b.venta - a.venta);
  }, [rf, vendedoresFiltrados]);

  // Alerts
  const alerts = useMemo(() => {
    const list = [];
    vendedoresFiltrados.forEach(v => {
      const c = +v.cobertura || 0;
      if (c < 75) list.push({ type: 'alert-red', msg: `Cobertura crítica: ${v.nombre} (${pct(c)})` });
      else if (c < 95) list.push({ type: 'alert-amber', msg: `Bajo meta: ${v.nombre} (${pct(c)})` });
    });
    if ((+rf?.pct_devolucion || 0) > 10) {
      list.push({ type: 'alert-amber', msg: `Devoluciones altas: ${pct(rf.pct_devolucion)} de venta real` });
    }
    if (!list.length) list.push({ type: 'alert-green', msg: 'Sin alertas críticas' });
    return list.slice(0, 6);
  }, [vendedoresFiltrados, rf]);

  // Proyección de cierre de mes basada en días hábiles (lun–sáb)
  // Usa DIAS_HABILES_RESTANTES desde CONFIG cuando está disponible
  const proyeccionCierre = useMemo(() => {
    if (!rf?.venta_neta) return null;
    const hoy   = new Date();
    const anio  = hoy.getFullYear();
    const mes   = hoy.getMonth();
    const inicio = new Date(anio, mes, 1);
    const fin    = new Date(anio, mes + 1, 0);

    function diasHabiles(desde, hasta) {
      let c = 0;
      const d = new Date(desde);
      while (d <= hasta) {
        if (d.getDay() !== 0) c++;   // excluye domingos
        d.setDate(d.getDate() + 1);
      }
      return c;
    }

    const habilesTransc = diasHabiles(inicio, hoy);
    if (habilesTransc === 0) return null;

    const configDias   = config?.dias_habiles_restantes || 0;
    const habilesTotal = configDias > 0
      ? habilesTransc + configDias
      : diasHabiles(inicio, fin);

    const proyeccion  = Math.round(rf.venta_neta / habilesTransc * habilesTotal);
    const pctAvance   = Math.round(habilesTransc / habilesTotal * 100);
    const cuota       = rf.cuota_total || 0;
    const pctVsCuota  = cuota > 0 ? Math.round(proyeccion / cuota * 100) : null;
    return { proyeccion, pctAvance, habilesTransc, habilesTotal, pctVsCuota };
  }, [rf, config]);

  const diasHabilesRestantes = useMemo(() => {
    const configDias = config?.dias_habiles_restantes || 0;
    if (configDias > 0) return configDias;
    if (proyeccionCierre) return proyeccionCierre.habilesTotal - proyeccionCierre.habilesTransc;
    return 0;
  }, [config, proyeccionCierre]);

  useMemo(() => {
    if (!config || !rf) return;
    const faltante = Math.max(0, (rf.cuota_total || 0) - (rf.venta_neta || 0));
    const diario   = diasHabilesRestantes > 0 ? Math.round(faltante / diasHabilesRestantes) : 0;
    console.group('[DiasHabiles Config]');
    console.log('config:', config);
    console.log('dias_habiles_restantes:', diasHabilesRestantes);
    console.log('faltante gerencial:', faltante);
    console.log('diario requerido gerencial:', diario);
    console.groupEnd();
  }, [config, rf, diasHabilesRestantes]);

  // ── Productos Clave: filtrado por sede ──────────────────────────────────────
  // ⚠ DEBEN estar ANTES del early return `if (!r)`.
  // No dependen de `r` — son seguros con r === null.
  const cobPCVendedoresFiltrados = useMemo(() => {
    const base = sedeFiltro === 'TODOS'
      ? coberturaVendedoresPC
      : coberturaVendedoresPC.filter(v => {
          const sedeV = normalizarSede(v.sede || '');
          const sedeA = asesorSedeMap[String(v.cod_asesor || '').trim()] || '';
          return (sedeV || sedeA) === sedeFiltro;
        });
    // Ordenar por cobertura ASC (peor cobertura primero → prioridad de acción)
    return [...base].sort((a, b) => (a.cobertura_clave_pct || 0) - (b.cobertura_clave_pct || 0));
  }, [coberturaVendedoresPC, asesorSedeMap, sedeFiltro]);

  const cobPCResumen = useMemo(() => {
    if (sedeFiltro === 'TODOS') return coberturaPC;
    const vends = cobPCVendedoresFiltrados;
    const totalAct = vends.reduce((s, v) => s + (v.clientes_activos || 0), 0);
    const totalImp = vends.reduce((s, v) => s + (v.clientes_impactados_clave || 0), 0);
    return {
      total_clientes_activos:      totalAct,
      clientes_impactados_clave:   totalImp,
      clientes_sin_impacto_clave:  totalAct - totalImp,
      cobertura_clave_pct:         totalAct > 0 ? Math.round(totalImp / totalAct * 1000) / 10 : 0,
      venta_productos_clave:       vends.reduce((s, v) => s + (v.venta_productos_clave || 0), 0),
      total_productos_clave:       coberturaPC.total_productos_clave || 0,
      productos_clave_vendidos:    coberturaPC.productos_clave_vendidos || 0,
      productos_clave_no_vendidos: coberturaPC.productos_clave_no_vendidos || 0,
    };
  }, [coberturaPC, cobPCVendedoresFiltrados, sedeFiltro]);

  const clientesSinPCFiltrados = useMemo(() => {
    // Defensivo: clientesSinPC puede ser un objeto {total, clientes:[]} o null/array
    const lista = Array.isArray(clientesSinPC)
      ? clientesSinPC
      : (clientesSinPC?.clientes || []);
    if (sedeFiltro === 'TODOS') return lista;
    return lista.filter(c => {
      const cod   = String(c.cod_asesor || '').trim();
      const sedeC = normalizarSede(c.sede || '');
      return (sedeC || asesorSedeMap[cod] || '') === sedeFiltro;
    });
  }, [clientesSinPC, asesorSedeMap, sedeFiltro]);

  // ── Combos: filtrado por sede ──────────────────────────────────────────────
  const combosVendedorFiltrados = useMemo(() => {
    if (sedeFiltro === 'TODOS') return combosVendedor;
    return combosVendedor.filter(v => normalizarSede(v.sede || '') === sedeFiltro);
  }, [combosVendedor, sedeFiltro]);

  const combosResumenFiltrado = useMemo(() => {
    // Debug temporal
    console.group('[Combos Cumplimiento Debug]');
    console.log('combosResumen:', combosResumen);
    console.log('combosVendedor:', combosVendedor);
    console.log('primer vendedor:', combosVendedor?.[0]);
    console.groupEnd();

    if (sedeFiltro === 'TODOS') return combosResumen || null;

    // Para vistas filtradas por sede: re-agregar actuals de los vendedores filtrados.
    // Las metas vienen siempre del resumen global (COMBOS no tiene metas por sede).
    const vends = combosVendedorFiltrados;
    if (!vends.length) return combosResumen || null;

    const u  = vends.reduce((s, v) => s + (v.unidades_vendidas || 0), 0);
    const c  = vends.reduce((s, v) => s + (v.clientes_impactados || 0), 0);
    const vc = vends.reduce((s, v) => s + (v.venta_combos || 0), 0);
    // Metas globales del resumen (aplican al equipo completo, se muestran como referencia)
    const muTotal = combosResumen?.meta_unidades_total || 0;
    const mcTotal = combosResumen?.meta_clientes_total || 0;
    return {
      clientes_impactados:       c,
      unidades_vendidas:         u,
      venta_combos:              vc,
      meta_unidades_total:       muTotal,
      meta_clientes_total:       mcTotal,
      cumplimiento_unidades_pct: muTotal > 0 ? Math.round(u / muTotal * 1000) / 10 : 0,
      cumplimiento_clientes_pct: mcTotal > 0 ? Math.round(c / mcTotal * 1000) / 10 : 0,
    };
  }, [combosResumen, combosVendedor, combosVendedorFiltrados, sedeFiltro]);

  const navigate = useNavigate();

  // ── Avance completo por vendedor (para tabla expandible) ─────────────────────
  const avanceVendedores = useMemo(() => {
    const factor = proyeccionCierre && proyeccionCierre.habilesTransc > 0
      ? proyeccionCierre.habilesTotal / proyeccionCierre.habilesTransc
      : 1;
    return [...vendedoresFiltrados]
      .filter(v => !esRutaCentral(v.nombre))
      .map(v => {
        const cod      = String(v.cod).trim();
        const meta     = cuotaMap[cod] ?? (v.cuota || 0);
        const venta    = v.venta_neta || 0;
        const cumplPct = meta > 0 ? Math.round(venta / meta * 1000) / 10 : null;
        const proyecc  = Math.round(venta * factor);
        const faltaRaw = meta > 0 ? meta - venta : null;
        const diario   = (faltaRaw != null && faltaRaw > 0 && diasHabilesRestantes > 0)
          ? Math.round(faltaRaw / diasHabilesRestantes) : (faltaRaw != null ? 0 : null);
        return {
          cod, nombre: v.nombre,
          sede:      asesorSedeMap[cod] || '—',
          venta, meta, cumplPct, proyecc, faltaRaw, diario,
          cobertura: +v.cobertura || 0,
        };
      })
      .sort((a, b) => {
        // sin meta al final; resto: menor cumplimiento primero
        if (a.cumplPct === null && b.cumplPct !== null) return 1;
        if (a.cumplPct !== null && b.cumplPct === null) return -1;
        if (a.cumplPct === null && b.cumplPct === null) return 0;
        return a.cumplPct - b.cumplPct;
      });
  }, [vendedoresFiltrados, cuotaMap, asesorSedeMap, proyeccionCierre, diasHabilesRestantes]);

  // ── Ranking completo enriquecido (venta + cumplimiento + cobertura + PC) ─────
  const rankingVendedores = useMemo(() => {
    return vs.map(v => {
      const metaEntry = metaData.find(m => String(m.cod).trim() === String(v.cod).trim());
      const pcEntry   = cobPCVendedoresFiltrados.find(p => String(p.cod_asesor || '').trim() === String(v.cod).trim());
      return {
        cod:       v.cod,
        nombre:    v.nombre,
        venta:     v.venta_neta || 0,
        pct_cumpl: metaEntry?.pct_cumplimiento ?? null,
        cobertura: +v.cobertura || 0,
        cob_pc:    pcEntry?.cobertura_clave_pct ?? null,
      };
    });
  }, [vs, metaData, cobPCVendedoresFiltrados]);

  // Top 5 mejores (por venta neta desc — vs ya viene sorted desc)
  const top5Mejores = rankingVendedores.slice(0, 5);

  // 5 más críticos (por cobertura asc; si hay empate, por pct_cumpl asc)
  const top5Criticos = useMemo(() => {
    return [...rankingVendedores]
      .sort((a, b) => {
        if (a.cobertura !== b.cobertura) return a.cobertura - b.cobertura;
        return (a.pct_cumpl ?? 999) - (b.pct_cumpl ?? 999);
      })
      .slice(0, 5);
  }, [rankingVendedores]);

  // ── Alertas de gestión enriquecidas ──────────────────────────────────────────
  const alertasGestion = useMemo(() => {
    const items = [];

    // 1. Negocio más lejos de meta
    const conMeta = metasPorNegocio.filter(m => m.conMeta && !m.sinIdentificar && m.falta > 0);
    if (conMeta.length > 0) {
      const masLejos = conMeta.reduce((prev, curr) => (curr.pctC < prev.pctC ? curr : prev));
      items.push({
        tipo:      masLejos.pctC < 70 ? 'rojo' : 'ambar',
        titulo:    'Negocio más lejos de meta',
        valor:     masLejos.negocio,
        sub:       `${masLejos.pctC.toFixed(1)}% · Faltan ${(masLejos.falta).toLocaleString('es', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
        link:      null,
        linkLabel: null,
      });
    }

    // 2. Vendedor con menor cobertura
    if (top5Criticos.length > 0) {
      const peor = top5Criticos[0];
      if (peor.cobertura < 95) {
        items.push({
          tipo:      peor.cobertura < 70 ? 'rojo' : 'ambar',
          titulo:    'Menor cobertura',
          valor:     peor.nombre || `Cód. ${peor.cod}`,
          sub:       `${peor.cobertura.toFixed(1)}% de cobertura`,
          link:      '/cobertura',
          linkLabel: 'Ver Cobertura →',
        });
      }
    }

    // 3. Vendedor con menor cumplimiento de cuota
    if (metaData.length > 0) {
      const menorCumpl = metaData[metaData.length - 1];
      if (menorCumpl.pct_cumplimiento < 90) {
        const falta = (menorCumpl.cuota || 0) - (menorCumpl.venta_neta || 0);
        items.push({
          tipo:      menorCumpl.pct_cumplimiento < 60 ? 'rojo' : 'ambar',
          titulo:    'Menor cumplimiento cuota',
          valor:     menorCumpl.nombre,
          sub:       `${menorCumpl.pct_cumplimiento.toFixed(1)}%` + (falta > 0 ? ` · Falta ${falta.toLocaleString('es', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : ''),
          link:      null,
          linkLabel: null,
        });
      }
    }

    // 4. Devoluciones elevadas
    const pctDev = +(rf?.pct_devolucion || 0);
    if (pctDev > 8) {
      items.push({
        tipo:      pctDev > 15 ? 'rojo' : 'ambar',
        titulo:    'Devoluciones elevadas',
        valor:     pct(pctDev),
        sub:       `${fmt(rf?.devolucion_total ?? rf?.devoluciones ?? 0)} en devoluciones del período`,
        link:      '/devoluciones',
        linkLabel: 'Ver Devoluciones →',
      });
    }

    // 5. Productos Clave — menor cobertura
    if (cobPCVendedoresFiltrados.length > 0) {
      const peorPC = cobPCVendedoresFiltrados[0]; // ya viene sorted ASC
      if ((peorPC.cobertura_clave_pct || 0) < 60) {
        items.push({
          tipo:      (peorPC.cobertura_clave_pct || 0) < 30 ? 'rojo' : 'ambar',
          titulo:    'Menor cobertura PC',
          valor:     peorPC.vendedor || `Cód. ${peorPC.cod_asesor}`,
          sub:       `${(peorPC.cobertura_clave_pct || 0).toFixed(1)}% · ${peorPC.clientes_sin_impacto_clave || 0} clientes pendientes`,
          link:      null,
          linkLabel: null,
        });
      }
    }

    // 6. Cobertura general baja
    if ((rf?.cobertura_pct || 0) < 80 && items.length < 6) {
      items.push({
        tipo:      (rf?.cobertura_pct || 0) < 60 ? 'rojo' : 'ambar',
        titulo:    'Cobertura del equipo',
        valor:     pct(rf?.cobertura_pct || 0),
        sub:       `${rf?.clientes_impactados || 0} de ${rf?.clientes_maestro || 0} clientes activos`,
        link:      '/cobertura',
        linkLabel: 'Ver Cobertura →',
      });
    }

    if (!items.length) {
      items.push({
        tipo:      'verde',
        titulo:    '¡Sin alertas críticas!',
        valor:     'Todos los indicadores en meta',
        sub:       'Cobertura, cumplimiento y devoluciones dentro de rangos normales',
        link:      null,
        linkLabel: null,
      });
    }

    return items.slice(0, 6);
  }, [metasPorNegocio, top5Criticos, metaData, rf, cobPCVendedoresFiltrados]);

  if (!r) {
    return (
      <div className="flex items-center justify-center h-64 text-palumar-muted text-sm">
        Cargando datos...
      </div>
    );
  }

  // KPIs del equipo filtrado (para la barra de resumen del filtro)
  // Usa rf para mostrar siempre datos coherentes con los KPI cards
  const ventaEquipo = rf?.venta_neta ?? 0;
  const cuotaEquipo = rf?.cuota_total ?? 0;

  return (
    <div className="animate-fade-in">

      {/* ── 1. Filtro de Sede ── */}
      <div
        className="flex flex-wrap items-center gap-2 mb-5 px-4 py-3 rounded-xl"
        style={{ background: 'rgba(13,30,43,0.6)', border: '1px solid var(--border-2)' }}
      >
        <span className="text-palumar-muted font-semibold" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: '4px' }}>
          Vista:
        </span>
        {[
          { key: 'TODOS',     label: 'Todos',     color: 'var(--green)', border: 'rgba(15,169,122,0.45)', bg: 'linear-gradient(135deg,rgba(15,169,122,0.18) 0%,rgba(52,211,153,0.09) 100%)' },
          { key: 'CENTRALES', label: 'Centrales', color: 'var(--cyan)',  border: 'rgba(45,174,217,0.45)', bg: 'linear-gradient(135deg,rgba(45,174,217,0.18) 0%,rgba(45,174,217,0.09) 100%)' },
          { key: 'CHIRIQUI',  label: 'Chiriquí',  color: 'var(--cyan)',  border: 'rgba(45,174,217,0.45)', bg: 'linear-gradient(135deg,rgba(45,174,217,0.18) 0%,rgba(45,174,217,0.09) 100%)' },
        ].map(({ key, label, color, border, bg }) => {
          const active = sedeFiltro === key;
          return (
            <button
              key={key}
              onClick={() => setSedeFiltro(key)}
              className="px-4 py-1.5 rounded-lg font-bold transition-all duration-150"
              style={{
                fontSize: '12px',
                background: active ? bg : 'rgba(255,255,255,0.03)',
                border: `1px solid ${active ? border : 'var(--border-2)'}`,
                color: active ? color : 'var(--muted)',
                boxShadow: active ? `0 0 8px ${border}` : 'none',
              }}
            >
              {label}
            </button>
          );
        })}
        {sedeFiltro !== 'TODOS' && (
          <span className="ml-2 text-palumar-muted" style={{ fontSize: '11px' }}>
            {`${vendedoresFiltrados.length} vendedor${vendedoresFiltrados.length !== 1 ? 'es' : ''} · Venta: `}
            <strong style={{ color: 'var(--cyan)' }}>{fmt(ventaEquipo)}</strong>
            {cuotaEquipo > 0 && (
              <> · Cuota: <strong style={{ color: 'var(--gold)' }}>{fmt(cuotaEquipo)}</strong>
                {' · '}<strong style={{ color: ventaEquipo >= cuotaEquipo ? 'var(--green)' : 'var(--amber)' }}>
                  {Math.round(ventaEquipo / cuotaEquipo * 100)}%
                </strong></>
            )}
          </span>
        )}
      </div>

      {/* ── Aviso datos desactualizados ── */}
      {isStale && r && (
        <div
          className="flex items-center justify-between gap-3 mb-4 px-4 py-2.5 rounded-xl"
          style={{
            background: 'rgba(234,179,8,0.08)',
            border: '1px solid rgba(234,179,8,0.35)',
          }}
        >
          <div className="flex items-center gap-2">
            <span style={{ fontSize: '14px' }}>⚠</span>
            <span style={{ fontSize: '11px', color: 'var(--gold)', fontWeight: 600 }}>
              Datos no actualizados
            </span>
            {lastSuccessfulLoad && (
              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                · Última carga válida:{' '}
                {lastSuccessfulLoad.toLocaleTimeString('es-PA', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {lastLoadError && (
              <span style={{ fontSize: '10px', color: 'rgba(234,179,8,0.6)', marginLeft: 4 }}>
                ({lastLoadError})
              </span>
            )}
          </div>
          <button
            onClick={loadAll}
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--gold)',
              background: 'rgba(234,179,8,0.12)',
              border: '1px solid rgba(234,179,8,0.3)',
              borderRadius: '6px',
              padding: '3px 10px',
              cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
        </div>
      )}

      {/* ── 2. KPIs Ejecutivos ── */}
      <SectionTitle>KPIs Ejecutivos</SectionTitle>

      {/* Fila 1 — lectura comercial principal */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <KpiCard
          label="Venta Bruta"
          value={fmt(rf.venta_bruta || 0)}
          sub={rf.cuota_total > 0 ? `${pct((rf.venta_bruta || 0) / rf.cuota_total * 100)} de meta` : undefined}
          color="cyan"
        />
        <KpiCard
          label="Venta Neta"
          value={fmt(rf.venta_neta || 0)}
          sub={rf.cuota_total > 0 ? `${pct((rf.venta_neta || 0) / rf.cuota_total * 100)} de meta` : undefined}
          color="green"
        />
        {proyeccionCierre ? (
          <KpiCard
            label="Proyección"
            value={fmt(proyeccionCierre.proyeccion)}
            sub={proyeccionCierre.pctVsCuota != null ? `${proyeccionCierre.pctVsCuota}% proyectado` : undefined}
            color={proyeccionCierre.pctVsCuota == null ? 'cyan'
              : proyeccionCierre.pctVsCuota >= 100 ? 'green'
              : proyeccionCierre.pctVsCuota >= 75  ? 'amber'
              : 'red'}
          />
        ) : (
          <KpiCard label="Ticket Prom." value={fmt(rf.ticket_promedio || 0)} color="blue" />
        )}
        {rf.cuota_total > 0 ? (
          <KpiCard
            label="Meta del equipo"
            value={fmt(rf.cuota_total)}
            sub={`<span style="font-size:20px;font-weight:700;color:${(rf.pct_cumplimiento_equipo||0)>=100?'#34D399':(rf.pct_cumplimiento_equipo||0)>=75?'#DDB84A':'#F87171'};font-family:'DM Mono',monospace;letter-spacing:-0.5px;line-height:1">${pct(rf.pct_cumplimiento_equipo||0)}</span><span style="font-size:11px;color:#7A9BB8;margin-left:6px">cumplido · ${fmt(rf.venta_neta||0)}</span>`}
            color={(rf.pct_cumplimiento_equipo || 0) >= 100 ? 'green' : (rf.pct_cumplimiento_equipo || 0) >= 75 ? 'amber' : 'red'}
            barValue={rf.pct_cumplimiento_equipo || 0}
          />
        ) : (
          <KpiCard
            label="Efectividad"
            value={pct(rf.efectividad_pct)}
            color="purple"
            barValue={rf.efectividad_pct || 0}
          />
        )}
      </div>

      {/* Fila 2 — cobertura, calidad y ejecución */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard
          label="Cobertura"
          value={pct(rf.cobertura_pct || 0)}
          sub={`${rf.clientes_impactados ?? 0} / ${rf.clientes_maestro ?? 0} clientes`}
          color={(rf.cobertura_pct || 0) >= 90 ? 'green' : (rf.cobertura_pct || 0) >= 70 ? 'amber' : 'red'}
          barValue={rf.cobertura_pct || 0}
        />
        <KpiCard
          label="Devoluciones"
          value={fmt(rf.devolucion_total ?? rf.devoluciones ?? rf.devolucion ?? 0)}
          sub={`${pct(rf.venta_bruta > 0 ? (rf.devolucion_total ?? rf.devoluciones ?? rf.devolucion ?? 0) / rf.venta_bruta * 100 : rf.pct_devolucion)} de venta bruta`}
          color="red"
        />
        <KpiCard
          label="Averías"
          value={fmt(rf.averia_total ?? rf.averias ?? rf.averiados ?? 0)}
          sub={`${pct(rf.venta_bruta > 0 ? (rf.averia_total ?? rf.averias ?? 0) / rf.venta_bruta * 100 : rf.pct_averia ?? 0)} de venta bruta`}
          color="amber"
        />
        <KpiCard
          label="Cob. Prod. Clave"
          value={pct(cobPCResumen.cobertura_clave_pct || 0)}
          sub={`${cobPCResumen.clientes_impactados_clave || 0} / ${cobPCResumen.total_clientes_activos || 0}`}
          color={(cobPCResumen.cobertura_clave_pct || 0) >= 70 ? 'green' : (cobPCResumen.cobertura_clave_pct || 0) >= 40 ? 'amber' : 'red'}
          barValue={cobPCResumen.cobertura_clave_pct || 0}
        />
      </div>

      {/* Días hábiles restantes — faltante diario */}
      {diasHabilesRestantes > 0 && (rf.cuota_total || 0) > 0 && (() => {
        const faltante = Math.max(0, (rf.cuota_total || 0) - (rf.venta_neta || 0));
        if (faltante <= 0) return null;
        const diario = Math.round(faltante / diasHabilesRestantes);
        return (
          <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '-14px', marginBottom: '20px', textAlign: 'right' }}>
            Faltan {fmt(faltante)} · {fmt(diario)} diarios por {diasHabilesRestantes} días
          </p>
        );
      })()}

      {/* ── 3. Alertas de Gestión ── */}
      <SectionTitle>Alertas de gestión</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {alertasGestion.map((a, i) => {
          const borderCol = a.tipo === 'rojo' ? 'var(--red)' : a.tipo === 'ambar' ? 'var(--amber)' : 'var(--green)';
          return (
            <div key={i} className="table-card" style={{ borderLeft: `3px solid ${borderCol}` }}>
              <div className="px-4 py-3.5">
                <div className="text-palumar-muted mb-1" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {a.titulo}
                </div>
                <div className="font-bold" style={{ fontSize: '14px', color: borderCol, lineHeight: 1.3 }}>
                  {a.valor}
                </div>
                {a.sub && <div className="text-palumar-muted mt-1" style={{ fontSize: '11px' }}>{a.sub}</div>}
                {a.link && (
                  <button
                    onClick={() => navigate(a.link)}
                    style={{ marginTop: '8px', fontSize: '11px', color: 'var(--cyan)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    {a.linkLabel}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 4. Metas por Negocio ── */}
      {metasPorNegocio.length > 0 && (
        <>
          <SectionTitle>Metas por Negocio</SectionTitle>
          <div className="table-card mb-6">
            <div className="overflow-x-auto">
              <table className="palma-table">
                <thead>
                  <tr>
                    <th>Negocio</th>
                    <th style={{ textAlign: 'right' }}>Meta</th>
                    <th style={{ textAlign: 'right' }}>Venta Real</th>
                    <th style={{ textAlign: 'right' }}>Proyección</th>
                    <th style={{ minWidth: '140px' }}>Cumpl. Actual</th>
                    <th style={{ minWidth: '110px' }}>Cumpl. Proy.</th>
                    <th style={{ textAlign: 'right' }}>Falta / Exceso</th>
                  </tr>
                </thead>
                <tbody>
                  {metasPorNegocio.map((row, i) => {
                    const col = !row.conMeta ? 'var(--cyan)'
                      : row.pctC >= 100 ? 'var(--green)'
                      : row.pctC >= 75  ? 'var(--amber)'
                      : 'var(--red)';
                    const colProy = !row.conMeta ? 'var(--cyan)'
                      : row.pctProy >= 90 ? 'var(--green)'
                      : row.pctProy >= 70 ? 'var(--amber)'
                      : 'var(--red)';
                    const barW = row.conMeta ? Math.min(row.pctC, 100) : 0;
                    const exceso = row.falta < 0;
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 600, color: row.sinIdentificar ? 'var(--muted)' : 'inherit', fontStyle: row.sinIdentificar ? 'italic' : 'normal' }}>
                          {row.negocio}
                          {!row.conMeta && !row.sinIdentificar && <span className="text-palumar-muted" style={{ fontSize: '10px', marginLeft: '6px' }}>sin meta</span>}
                        </td>
                        <td style={{ textAlign: 'right' }} className="font-mono-num">
                          {row.conMeta ? fmt(row.meta) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--cyan)' }} className="font-mono-num">{fmt(row.venta)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--muted)' }} className="font-mono-num">{fmt(row.proyec)}</td>
                        <td>
                          {row.conMeta ? (
                            <div className="flex items-center gap-2">
                              <div style={{ flex: 1, height: '6px', borderRadius: '99px', background: 'rgba(255,255,255,0.08)', position: 'relative' }}>
                                <div style={{ height: '100%', borderRadius: '99px', width: `${barW}%`, background: col, transition: 'width 0.4s ease' }} />
                              </div>
                              <span style={{ color: col, fontWeight: 700, fontSize: '12px', minWidth: '40px', textAlign: 'right' }}>{row.pctC.toFixed(1)}%</span>
                            </div>
                          ) : <span className="text-palumar-muted">—</span>}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {row.conMeta
                            ? <span style={{ color: colProy, fontWeight: 700, fontSize: '12px' }}>{row.pctProy.toFixed(1)}%</span>
                            : <span className="text-palumar-muted">—</span>}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: !row.conMeta ? 'var(--muted)' : exceso ? 'var(--green)' : 'var(--red)' }} className="font-mono-num">
                          {!row.conMeta ? '—' : exceso ? `+${fmt(Math.abs(row.falta))}` : fmt(row.falta)}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Fila total */}
                  {metasPorNegocio.some(r2 => r2.conMeta) && (() => {
                    const totalMeta  = metasPorNegocio.filter(r2 => r2.conMeta).reduce((s, r2) => s + r2.meta, 0);
                    const totalVenta = metasPorNegocio.reduce((s, r2) => s + r2.venta, 0);
                    const totalProyec= metasPorNegocio.reduce((s, r2) => s + r2.proyec, 0);
                    const totalPct   = totalMeta > 0 ? Math.round(totalVenta  / totalMeta * 1000) / 10 : 0;
                    const totalPctProy = totalMeta > 0 ? Math.round(totalProyec / totalMeta * 1000) / 10 : 0;
                    const totalFalta = totalMeta - totalVenta;
                    const col2 = totalPct >= 100 ? 'var(--green)' : totalPct >= 75 ? 'var(--amber)' : 'var(--red)';
                    const col2Proy = totalPctProy >= 90 ? 'var(--green)' : totalPctProy >= 70 ? 'var(--amber)' : 'var(--red)';
                    return (
                      <tr style={{ borderTop: '2px solid var(--border-2)', fontWeight: 700 }}>
                        <td>TOTAL</td>
                        <td style={{ textAlign: 'right' }} className="font-mono-num">{fmt(totalMeta)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--cyan)' }} className="font-mono-num">{fmt(totalVenta)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--muted)' }} className="font-mono-num">{fmt(totalProyec)}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div style={{ flex: 1, height: '6px', borderRadius: '99px', background: 'rgba(255,255,255,0.08)' }}>
                              <div style={{ height: '100%', borderRadius: '99px', width: `${Math.min(totalPct, 100)}%`, background: col2 }} />
                            </div>
                            <span style={{ color: col2, fontWeight: 700, fontSize: '12px', minWidth: '40px', textAlign: 'right' }}>{totalPct.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ color: col2Proy, fontWeight: 700, fontSize: '12px' }}>{totalPctProy.toFixed(1)}%</span>
                        </td>
                        <td style={{ textAlign: 'right', color: totalFalta <= 0 ? 'var(--green)' : 'var(--red)' }} className="font-mono-num">
                          {totalFalta <= 0 ? `+${fmt(Math.abs(totalFalta))}` : fmt(totalFalta)}
                        </td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── 5. Ranking Vendedores (Top 5 mejores + 5 más críticos) ── */}
      {rankingVendedores.length > 0 && (
        <>
          <SectionTitle>Ranking Vendedores</SectionTitle>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-3">
            {/* Top 5 Mejores */}
            <div className="table-card">
              <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-2)' }}>
                <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>🏆 Top 5 Mejores</h3>
                <span className="text-palumar-muted" style={{ fontSize: '11px' }}>por venta neta</span>
              </div>
              <div className="overflow-x-auto">
                <table className="palma-table">
                  <thead>
                    <tr>
                      <th>Vendedor</th>
                      <th style={{ textAlign: 'right' }}>Venta</th>
                      <th style={{ textAlign: 'right' }}>Cumpl.</th>
                      <th style={{ textAlign: 'right' }}>Cob.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top5Mejores.map((v, i) => {
                      const colC   = v.pct_cumpl == null ? 'var(--muted)' : v.pct_cumpl >= 100 ? 'var(--green)' : v.pct_cumpl >= 75 ? 'var(--amber)' : 'var(--red)';
                      const colCob = v.cobertura >= 90 ? 'var(--green)' : v.cobertura >= 70 ? 'var(--amber)' : 'var(--red)';
                      return (
                        <tr key={v.cod}>
                          <td>
                            <div className="flex items-center gap-2">
                              <span className="font-mono-num font-bold" style={{ color: i === 0 ? 'var(--gold)' : 'var(--muted)', fontSize: '10px', minWidth: 14 }}>{i + 1}</span>
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: VEND_COLORS[i % VEND_COLORS.length] }} />
                              <span style={{ fontSize: '12px' }}>{v.nombre}</span>
                            </div>
                          </td>
                          <td style={{ textAlign: 'right', color: 'var(--cyan)' }} className="font-mono-num">{fmt(v.venta)}</td>
                          <td style={{ textAlign: 'right', color: colC, fontWeight: 700 }} className="font-mono-num">
                            {v.pct_cumpl != null ? `${v.pct_cumpl.toFixed(0)}%` : '—'}
                          </td>
                          <td style={{ textAlign: 'right', color: colCob, fontWeight: 700 }} className="font-mono-num">
                            {v.cobertura > 0 ? `${v.cobertura.toFixed(0)}%` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            {/* 5 Más Críticos */}
            <div className="table-card">
              <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-2)' }}>
                <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>⚠ 5 Más Críticos</h3>
                <span className="text-palumar-muted" style={{ fontSize: '11px' }}>menor cobertura</span>
              </div>
              <div className="overflow-x-auto">
                <table className="palma-table">
                  <thead>
                    <tr>
                      <th>Vendedor</th>
                      <th style={{ textAlign: 'right' }}>Venta</th>
                      <th style={{ textAlign: 'right' }}>Cumpl.</th>
                      <th style={{ textAlign: 'right' }}>Cob.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top5Criticos.map((v, i) => {
                      const colC   = v.pct_cumpl == null ? 'var(--muted)' : v.pct_cumpl >= 100 ? 'var(--green)' : v.pct_cumpl >= 75 ? 'var(--amber)' : 'var(--red)';
                      const colCob = v.cobertura >= 90 ? 'var(--green)' : v.cobertura >= 70 ? 'var(--amber)' : 'var(--red)';
                      return (
                        <tr key={v.cod}>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: VEND_COLORS[i % VEND_COLORS.length] }} />
                              <span style={{ fontSize: '12px' }}>{v.nombre}</span>
                            </div>
                          </td>
                          <td style={{ textAlign: 'right', color: 'var(--cyan)' }} className="font-mono-num">{fmt(v.venta)}</td>
                          <td style={{ textAlign: 'right', color: colC, fontWeight: 700 }} className="font-mono-num">
                            {v.pct_cumpl != null ? `${v.pct_cumpl.toFixed(0)}%` : '—'}
                          </td>
                          <td style={{ textAlign: 'right', color: colCob, fontWeight: 700 }} className="font-mono-num">
                            {v.cobertura > 0 ? `${v.cobertura.toFixed(0)}%` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="flex justify-end mb-3">
            <button
              onClick={() => navigate('/panel')}
              style={{ fontSize: '12px', color: 'var(--cyan)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}
            >
              Ver ranking completo en Mi Panel →
            </button>
          </div>

          {/* ── Avance total vendedores (colapsable) ── */}
          {avanceVendedores.length > 0 && (() => {
            const colCumpl = (v) => v.cumplPct == null ? 'var(--muted)'
              : v.cumplPct >= 90 ? 'var(--green)'
              : v.cumplPct >= 70 ? 'var(--amber)'
              : 'var(--red)';
            const colCob = (c) => c >= 90 ? 'var(--green)' : c >= 70 ? 'var(--amber)' : 'var(--red)';
            const totalVenta = avanceVendedores.reduce((s, v) => s + v.venta, 0);
            const totalMeta  = avanceVendedores.filter(v => v.meta > 0).reduce((s, v) => s + v.meta, 0);
            const totalPct   = totalMeta > 0 ? Math.round(totalVenta / totalMeta * 1000) / 10 : null;
            return (
              <>
                <CollapseTitle
                  open={openAvanceVend}
                  onToggle={() => setOpenAvanceVend(o => !o)}
                  badge={avanceVendedores.length}
                >
                  Avance total vendedores
                </CollapseTitle>
                {openAvanceVend && (
                  <div className="table-card mb-4 overflow-x-auto">
                    <table className="palma-table" style={{ minWidth: 760 }}>
                      <thead>
                        <tr>
                          <th>Vendedor</th>
                          <th>Sede</th>
                          <th style={{ textAlign: 'right' }}>Venta real</th>
                          <th style={{ textAlign: 'right' }}>Meta</th>
                          <th style={{ textAlign: 'right' }}>Cumpl.</th>
                          <th style={{ textAlign: 'right' }}>Proyección</th>
                          <th style={{ textAlign: 'right' }}>Falta</th>
                          <th style={{ textAlign: 'right' }}>Diario req.</th>
                          <th style={{ textAlign: 'right' }}>Cobertura</th>
                        </tr>
                      </thead>
                      <tbody>
                        {avanceVendedores.map(v => {
                          const excedente = v.faltaRaw != null && v.faltaRaw < 0;
                          const proyOk    = v.meta > 0 && v.proyecc >= v.meta;
                          return (
                            <tr key={v.cod}>
                              <td style={{ fontSize: '12px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.nombre}</td>
                              <td style={{ fontSize: '11px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{v.sede}</td>
                              <td className="font-mono-num" style={{ textAlign: 'right', color: 'var(--cyan)' }}>{fmt(v.venta)}</td>
                              <td className="font-mono-num" style={{ textAlign: 'right', color: 'var(--muted)' }}>
                                {v.meta > 0 ? fmt(v.meta) : '—'}
                              </td>
                              <td className="font-mono-num" style={{ textAlign: 'right', color: colCumpl(v), fontWeight: 700 }}>
                                {v.cumplPct != null ? `${v.cumplPct.toFixed(1)}%` : '—'}
                              </td>
                              <td className="font-mono-num" style={{ textAlign: 'right', color: proyOk ? 'var(--green)' : 'var(--amber)' }}>
                                {fmt(v.proyecc)}
                              </td>
                              <td className="font-mono-num" style={{ textAlign: 'right', color: excedente ? 'var(--green)' : v.faltaRaw == null ? 'var(--muted)' : 'var(--red)', fontWeight: 600 }}>
                                {v.faltaRaw == null ? '—' : excedente ? `+${fmt(Math.abs(v.faltaRaw))}` : fmt(v.faltaRaw)}
                              </td>
                              <td className="font-mono-num" style={{ textAlign: 'right', color: v.diario === 0 ? 'var(--green)' : 'var(--muted)' }}>
                                {v.diario == null ? '—' : v.diario === 0 ? '✓' : fmt(v.diario)}
                              </td>
                              <td className="font-mono-num" style={{ textAlign: 'right', color: colCob(v.cobertura), fontWeight: 700 }}>
                                {v.cobertura > 0 ? `${v.cobertura.toFixed(0)}%` : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {/* Totales */}
                      <tfoot>
                        <tr style={{ borderTop: '2px solid var(--border-2)' }}>
                          <td colSpan={2} style={{ fontWeight: 700, fontSize: '11px', color: 'var(--white-2)', paddingTop: 6, paddingBottom: 6 }}>
                            TOTAL ({avanceVendedores.length} vendedores)
                          </td>
                          <td className="font-mono-num" style={{ textAlign: 'right', color: 'var(--cyan)', fontWeight: 700 }}>{fmt(totalVenta)}</td>
                          <td className="font-mono-num" style={{ textAlign: 'right', color: 'var(--muted)', fontWeight: 700 }}>{totalMeta > 0 ? fmt(totalMeta) : '—'}</td>
                          <td className="font-mono-num" style={{ textAlign: 'right', fontWeight: 700, color: totalPct == null ? 'var(--muted)' : totalPct >= 90 ? 'var(--green)' : totalPct >= 70 ? 'var(--amber)' : 'var(--red)' }}>
                            {totalPct != null ? `${totalPct.toFixed(1)}%` : '—'}
                          </td>
                          <td colSpan={4} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </>
            );
          })()}
        </>
      )}

      {/* ── 6. Cobertura Productos Clave (simplificado) ── */}
      {(cobPCResumen.total_clientes_activos > 0 || cobPCVendedoresFiltrados.length > 0) && (
        <>
          <SectionTitle>Cobertura Productos Clave</SectionTitle>

          {/* Contexto de universo medido */}
          <p className="text-palumar-muted mb-3" style={{ fontSize: '11px' }}>
            Cobertura clave = clientes con mínimo 1 producto clave ÷ clientes activos{' '}
            {sedeFiltro === 'TODOS' ? 'medidos' : sedeFiltro === 'CENTRALES' ? 'de Centrales' : 'de Chiriquí'}
            {cobPCResumen.total_clientes_activos > 0
              ? ` · ${cobPCResumen.total_clientes_activos.toLocaleString()} clientes`
              : ''}
          </p>

          {/* 4 KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <KpiCard
              label="Cobertura clave"
              value={pct(cobPCResumen.cobertura_clave_pct || 0)}
              color={cobPCResumen.cobertura_clave_pct >= 70 ? 'green' : cobPCResumen.cobertura_clave_pct >= 40 ? 'amber' : 'red'}
              barValue={cobPCResumen.cobertura_clave_pct || 0}
              sub={cobPCResumen.cobertura_clave_pct >= 70 ? 'Bien' : cobPCResumen.cobertura_clave_pct >= 40 ? 'En avance' : 'Crítico'}
            />
            <KpiCard
              label="Clientes impactados"
              value={String(cobPCResumen.clientes_impactados_clave || 0)}
              sub="al menos un producto clave"
              color="green"
            />
            <KpiCard
              label="Clientes pendientes"
              value={String(cobPCResumen.clientes_sin_impacto_clave || 0)}
              color="red"
            />
            <KpiCard
              label="Venta clave"
              value={fmt(cobPCResumen.venta_productos_clave || 0)}
              color="cyan"
            />
          </div>

          {/* Ranking por vendedor — menor cobertura primero para priorizar acción */}
          {/* Tabla PC por vendedor — 6 filas por defecto, expand */}
          {cobPCVendedoresFiltrados.length > 0 && (
            <div className="table-card mb-4">
              <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-2)' }}>
                <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>Cobertura PC por Vendedor</h3>
                <span className="text-palumar-muted" style={{ fontSize: '11px' }}>
                  {cobPCVendedoresFiltrados.length} vendedores · menor cobertura primero
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="palma-table">
                  <thead>
                    <tr>
                      <th>Vendedor</th>
                      <th style={{ textAlign: 'right' }}>Pendientes</th>
                      <th style={{ minWidth: '160px' }}>Cobertura %</th>
                      <th style={{ textAlign: 'right' }}>Venta clave</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(showAllPCTable ? cobPCVendedoresFiltrados : cobPCVendedoresFiltrados.slice(0, 6)).map((v, i) => {
                      const c   = v.cobertura_clave_pct || 0;
                      const col = c >= 70 ? 'var(--green)' : c >= 40 ? 'var(--amber)' : 'var(--red)';
                      return (
                        <tr key={i}>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: VEND_COLORS[i % VEND_COLORS.length] }} />
                              {v.cod_asesor} — {v.vendedor}
                            </div>
                          </td>
                          <td style={{ textAlign: 'right', color: 'var(--red)', fontWeight: 700 }}>{v.clientes_sin_impacto_clave}</td>
                          <td>
                            <div className="flex items-center gap-2">
                              <div style={{ flex: 1, height: '6px', borderRadius: '99px', background: 'rgba(255,255,255,0.08)' }}>
                                <div style={{ height: '100%', borderRadius: '99px', width: `${Math.min(c, 100)}%`, background: col }} />
                              </div>
                              <span style={{ color: col, fontWeight: 700, fontSize: '12px', minWidth: '40px', textAlign: 'right' }}>{c.toFixed(1)}%</span>
                            </div>
                          </td>
                          <td style={{ textAlign: 'right' }} className="font-mono-num">{fmt(v.venta_productos_clave)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {cobPCVendedoresFiltrados.length > 6 && (
                <div className="px-5 py-2.5 border-t" style={{ borderColor: 'var(--border-2)' }}>
                  <button
                    onClick={() => setShowAllPCTable(!showAllPCTable)}
                    style={{ fontSize: '12px', color: 'var(--cyan)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    {showAllPCTable ? '▲ Ver menos' : `▼ Ver ${cobPCVendedoresFiltrados.length - 6} vendedores más`}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Botones de acción */}
          <div className="flex flex-wrap gap-3 mb-4">
            <button
              onClick={() => {
                const willOpen = !showSinPC;
                setShowSinPC(willOpen);
                if (willOpen) {
                  const lista = Array.isArray(clientesSinPC) ? clientesSinPC : (clientesSinPC?.clientes || []);
                  if (!lista.length) loadClientesSinPC?.();
                }
              }}
              style={{
                padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                border: `1px solid ${showSinPC ? 'rgba(239,68,68,0.4)' : 'var(--border-2)'}`,
                background: showSinPC ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)',
                color: showSinPC ? 'var(--red)' : 'var(--muted)',
              }}
            >
              {showSinPC ? '▲ Ocultar clientes pendientes' : `▼ Ver clientes pendientes (${cobPCResumen.clientes_sin_impacto_clave || 0})`}
            </button>
            <button
              onClick={() => { setShowPCDetalle(true); loadPCDetalle?.(); }}
              style={{
                padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                border: `1px solid ${showPCDetalle ? 'rgba(26,127,166,0.5)' : 'var(--border-2)'}`,
                background: showPCDetalle ? 'rgba(26,127,166,0.10)' : 'rgba(255,255,255,0.04)',
                color: showPCDetalle ? 'var(--cyan)' : 'var(--muted)',
              }}
            >
              Ver detalle por producto
            </button>
            <button
              onClick={() => navigate('/clientes')}
              style={{ padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border-2)', background: 'rgba(255,255,255,0.04)', color: 'var(--muted)' }}
            >
              Ver en panel Clientes →
            </button>
          </div>

          {/* Listado clientes pendientes (acordeón) */}
          {showSinPC && (
            <div className="table-card mb-4">
              <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-2)' }}>
                <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>Clientes pendientes — Sin Producto Clave</h3>
                <span className="text-palumar-muted" style={{ fontSize: '11px' }}>
                  {clientesSinPCFiltrados.length > 0 ? `${clientesSinPCFiltrados.length.toLocaleString()} clientes` : ''}
                </span>
              </div>
              {clientesSinPCLoading ? (
                <div className="flex items-center justify-center" style={{ minHeight: 80 }}>
                  <span className="text-palumar-muted" style={{ fontSize: 12 }}>Cargando clientes pendientes…</span>
                </div>
              ) : clientesSinPCFiltrados.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="palma-table">
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>Código</th>
                        <th>Vendedor</th>
                        <th>Sede</th>
                        <th style={{ textAlign: 'right' }}>Venta periodo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientesSinPCFiltrados.slice(0, 150).map((c, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{c.nombre_cliente || '—'}</td>
                          <td className="font-mono-num" style={{ color: 'var(--muted)', fontSize: '11px' }}>{c.cod_cliente}</td>
                          <td style={{ color: 'var(--muted)' }}>{c.vendedor || c.cod_asesor || '—'}</td>
                          <td>{c.sede ? <span className="badge badge-blue" style={{ fontSize: '10px' }}>{c.sede}</span> : '—'}</td>
                          <td style={{ textAlign: 'right' }} className="font-mono-num">
                            {c.venta_total_periodo > 0
                              ? <span style={{ color: 'var(--cyan)' }}>{fmt(c.venta_total_periodo)}</span>
                              : <span style={{ color: 'var(--muted)' }}>$0</span>}
                          </td>
                        </tr>
                      ))}
                      {clientesSinPCFiltrados.length > 150 && (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '11px', padding: '8px' }}>
                            + {clientesSinPCFiltrados.length - 150} clientes más
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex items-center justify-center" style={{ minHeight: 64 }}>
                  <span className="text-palumar-muted" style={{ fontSize: 12 }}>
                    No se pudo cargar el listado. Intenta nuevamente.
                  </span>
                </div>
              )
            }
          </div>
          )}

          {/* ── Detalle por producto (carga bajo demanda) ── */}
          {showPCDetalle && (
            <div className="table-card mb-6">
              {pcDetalleLoading ? (
                <div className="flex items-center justify-center" style={{ minHeight: 80 }}>
                  <span className="text-palumar-muted" style={{ fontSize: 12 }}>Cargando detalle de productos…</span>
                </div>
              ) : (pcDetalle?.productos || []).length > 0 ? (
                <>
                  <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-2)' }}>
                    <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>Detalle por Producto Clave</h3>
                    <span className="text-palumar-muted" style={{ fontSize: '11px' }}>Ordenado por clientes impactados</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="palma-table">
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th>SAP</th>
                          <th>Negocio</th>
                          <th style={{ textAlign: 'right' }}>Clientes impactados</th>
                          <th style={{ textAlign: 'right' }}>Venta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(pcDetalle?.productos || []).map((p, i) => (
                          <tr key={i} style={{ opacity: p.clientes_impactados === 0 ? 0.5 : 1 }}>
                            <td style={{ fontWeight: p.clientes_impactados > 0 ? 600 : 400 }}>
                              {p.nombre || p.detalle}
                              {p.clientes_impactados === 0 && (
                                <span className="badge badge-red" style={{ fontSize: '9px', marginLeft: '6px' }}>sin venta</span>
                              )}
                            </td>
                            <td className="font-mono-num" style={{ color: 'var(--muted)', fontSize: '11px' }}>{p.sap}</td>
                            <td style={{ color: 'var(--muted)' }}>{p.negocio || '—'}</td>
                            <td style={{ textAlign: 'right', color: p.clientes_impactados > 0 ? 'var(--green)' : 'var(--muted)', fontWeight: 700 }}>
                              {p.clientes_impactados}
                            </td>
                            <td style={{ textAlign: 'right' }} className="font-mono-num">{fmt(p.venta)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center" style={{ minHeight: 64 }}>
                  <span className="text-palumar-muted" style={{ fontSize: 12 }}>
                    No se pudo cargar el detalle. Intenta nuevamente.
                  </span>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════
          SECCIONES OPERATIVAS — colapsadas por defecto
          ══════════════════════════════════════════════════════════ */}

      {/* 7. Clientes Sin Compra */}
      {clientesCero.total > 0 && (
        <>
          <CollapseTitle
            open={openCeroClientes}
            onToggle={() => setOpenCeroClientes(!openCeroClientes)}
            badge={sedeFiltro === 'TODOS' ? clientesCero.total : ceroCeroTotal}
          >
            Clientes Sin Compra
          </CollapseTitle>

          {openCeroClientes && <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* Resumen por vendedor */}
            <div className="table-card">
              <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-2)' }}>
                <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>
                  Resumen por Vendedor
                </h3>
                <span className="text-palumar-muted" style={{ fontSize: '11px' }}>
                  {ceroVendedoresFiltrados.length} vendedores
                </span>
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
                    {ceroVendedoresFiltrados.map((row, i) => (
                      <tr
                        key={i}
                        className="cursor-pointer"
                        style={{ background: ceroVendSel === (row.cod || row.vendedor) ? 'rgba(26,127,166,0.08)' : '' }}
                        onClick={() => { const key = row.cod || row.vendedor; setCeroVendSel(ceroVendSel === key ? '' : key); }}
                      >
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: VEND_COLORS[i % VEND_COLORS.length] }} />
                            {row.vendedor}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ color: 'var(--red)', fontWeight: 700 }}>{row.cantidad}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Detalle del vendedor seleccionado */}
            <div className="table-card">
              <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-2)' }}>
                <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>
                  {ceroVendSel ? `Detalle — ${ceroVendSel}` : 'Detalle individual'}
                </h3>
                {ceroVendSel && (
                  <button
                    onClick={() => setCeroVendSel('')}
                    className="text-palumar-muted hover:text-palumar-white"
                    style={{ fontSize: '11px' }}
                  >
                    ✕ limpiar
                  </button>
                )}
              </div>
              {!ceroVendSel ? (
                <div className="px-5 py-10 text-center text-palumar-muted text-sm">
                  Haz clic en un vendedor de la tabla para ver sus clientes sin compra
                </div>
              ) : ceroVendDetalle.length === 0 ? (
                <div className="px-5 py-10 text-center text-palumar-muted text-sm">Sin datos</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="palma-table">
                    <thead>
                      <tr>
                        <th>Cód.</th>
                        <th>Cliente</th>
                        <th>Ciudad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ceroVendDetalle.map((c, i) => (
                        <tr key={i}>
                          <td className="font-mono-num" style={{ color: 'var(--red)', fontWeight: 700 }}>
                            {c.cod_cliente || '—'}
                          </td>
                          <td>{c.cliente || c.nom_cliente || '—'}</td>
                          <td style={{ color: 'var(--muted)' }}>{c.ciudad || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>}
        </>
      )}

      {/* ─ Top 10 Clientes y Top 10 por Negocio → movidos a paneles Clientes / Cobertura ─ */}

      {/* 8. Clientes Nuevos */}
      {false && (
        <>
          <SectionTitle>Top 10 Clientes — Distribuidora</SectionTitle>
          <div className="table-card mb-4">
            <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-2)' }}>
              <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>
                Mejores clientes por venta neta · {r?.periodo || ''}
              </h3>
              <span className="text-palumar-muted" style={{ fontSize: '11px' }}>Top 10</span>
            </div>
            <div className="overflow-x-auto">
              <table className="palma-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Cód.</th>
                    <th>Cliente</th>
                    <th>Vendedor</th>
                    <th>Negocio Principal</th>
                    <th style={{ textAlign: 'right' }}>Venta</th>
                  </tr>
                </thead>
                <tbody>
                  {topClientes.top_global.slice(0, 10).map((c) => (
                    <tr key={c.cod_cliente}>
                      <td>
                        <span
                          className="font-mono-num font-bold"
                          style={{ color: c.ranking <= 3 ? 'var(--gold)' : 'var(--muted)', fontSize: '11px' }}
                        >
                          {c.ranking}
                        </span>
                      </td>
                      <td className="font-mono-num" style={{ color: 'var(--muted)', fontSize: '11px' }}>{c.cod_cliente}</td>
                      <td>{c.nombre}</td>
                      <td style={{ color: 'var(--muted)' }}>{c.nom_vendedor || '—'}</td>
                      <td>
                        {c.negocio_principal
                          ? <span className="badge badge-blue" style={{ fontSize: '10px' }}>{c.negocio_principal}</span>
                          : '—'}
                      </td>
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

      {/* ── Top 10 por Negocio ── */}
      {topClientes.top_por_negocio?.length > 0 && (
        <>
          <SectionTitle>Top 10 Clientes por Negocio</SectionTitle>
          <div className="chart-card mb-4">
            <div className="flex items-center gap-3 mb-4">
              <select
                className="palma-select"
                value={negocioTop10}
                onChange={e => setNegocioTop10(e.target.value)}
              >
                <option value="">— Selecciona un negocio —</option>
                {topClientes.top_por_negocio.map(nx => (
                  <option key={nx.negocio} value={nx.negocio}>{nx.negocio}</option>
                ))}
              </select>
            </div>

            {(() => {
              const nx = topClientes.top_por_negocio.find(x => x.negocio === negocioTop10);
              if (!negocioTop10) return (
                <p className="text-center text-palumar-muted text-sm py-6">
                  Selecciona un negocio para ver sus 10 mejores clientes
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
                        <th>Cód. Cliente</th>
                        <th>Cliente</th>
                        <th>Vendedor</th>
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
                          <td className="font-mono-num" style={{ color: 'var(--muted)', fontSize: '11px' }}>
                            {c.cod_cliente}
                          </td>
                          <td>{c.nombre}</td>
                          <td style={{ color: 'var(--muted)' }}>{c.nom_vendedor || '—'}</td>
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

      {/* ── Clientes Nuevos ── */}
      {(clientesNuevos.total > 0 || true) && (
        <>
          <SectionTitle>Clientes Nuevos</SectionTitle>

          {/* Quick date filters */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {[
              { label: 'Este mes', desde: primerDiaMes, hasta: hoyStr },
              { label: 'Últ. 30 días', desde: hace30Str, hasta: hoyStr },
              { label: 'Todo el historial', desde: '', hasta: '' },
            ].map(({ label, desde, hasta }) => {
              const isActive = filtroNuevosLabel === label;
              return (
                <button
                  key={label}
                  onClick={() => applyNuevosG(desde, hasta, label)}
                  disabled={loadingNuevosG}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150"
                  style={{
                    background: isActive ? 'linear-gradient(135deg, rgba(15,169,122,0.2) 0%, rgba(52,211,153,0.1) 100%)' : 'rgba(13,30,43,0.5)',
                    borderColor: isActive ? 'rgba(15,169,122,0.45)' : 'var(--border-2)',
                    color: isActive ? 'var(--green)' : 'var(--muted)',
                  }}
                >
                  {loadingNuevosG && isActive ? '…' : label}
                </button>
              );
            })}
            {clientesNuevos.desde && (
              <span className="font-mono-num text-palumar-muted" style={{ fontSize: '10px' }}>
                {clientesNuevos.desde} → {clientesNuevos.hasta || hoyStr}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <KpiCard
              label="Nuevos este periodo"
              value={String(clientesNuevos.total)}
              color="green"
            />

            {clientesNuevos.por_vendedor.length > 0 && (
              <div className="chart-card sm:col-span-2">
                <div className="font-display font-bold text-palumar-white mb-3" style={{ fontSize: '13px' }}>
                  Por Vendedor
                </div>
                <HBarChart
                  labels={clientesNuevos.por_vendedor.map(v => v.vendedor)}
                  data={clientesNuevos.por_vendedor.map(v => v.cantidad)}
                  barColors={clientesNuevos.por_vendedor.map((_, i) => VEND_COLORS[i % VEND_COLORS.length])}
                  formatValue={(v) => String(v)}
                  minH={120}
                  rowH={30}
                />
              </div>
            )}

            {clientesNuevos.por_mes && clientesNuevos.por_mes.length > 0 && (
              <div className="chart-card sm:col-span-3">
                <div className="font-display font-bold text-palumar-white mb-3" style={{ fontSize: '13px' }}>
                  Tendencia Mensual
                </div>
                <LineChart
                  labels={clientesNuevos.por_mes.map(m => m.mes || m.periodo)}
                  datasets={[{
                    label: 'Nuevos',
                    data: clientesNuevos.por_mes.map(m => m.cantidad || m.total),
                    color: '#0FA97A',
                    fill: true,
                  }]}
                  formatValue={(v) => String(v)}
                  height={200}
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Análisis Comercial ── */}
      <SectionTitle>Análisis Comercial</SectionTitle>
      <div className="chart-card mb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="font-display font-bold text-palumar-white" style={{ fontSize: '14px' }}>
              Ranking de Vendedores
            </div>
            <div className="text-palumar-muted" style={{ fontSize: '11px', marginTop: '2px' }}>
              Ordenado por venta neta
            </div>
          </div>
        </div>
        <HBarChart
          labels={vs.map(v => v.nombre)}
          data={vs.map(v => v.venta_neta || 0)}
          barColors={vs.map((_, i) => VEND_COLORS[i % VEND_COLORS.length])}
        />
      </div>

      {/* ── Metas y Cumplimiento ── */}
      {metaData.length > 0 && (
        <>
          <SectionTitle>Metas y Cumplimiento</SectionTitle>
          <div className="chart-card mb-4">

            {/* Resumen Total Palumar */}
            {(rf.cuota_total || 0) > 0 && (() => {
              const ventaR = rf.venta_neta ?? 0;
              const falta  = (rf.cuota_total || 0) - ventaR;
              const pctC   = rf.pct_cumplimiento_equipo || 0;
              const colorP = pctC >= 100 ? 'var(--green)' : pctC >= 75 ? 'var(--amber)' : 'var(--red)';
              return (
                <div
                  className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5 pb-5 border-b"
                  style={{ borderColor: 'var(--border-2)' }}
                >
                  {[
                    { label: 'Cuota Equipo', val: fmt(rf.cuota_total), color: 'var(--white-2)' },
                    { label: 'Venta Neta',   val: fmt(ventaR),        color: 'var(--white-2)' },
                    { label: 'Cumplimiento', val: pct(pctC),           color: colorP },
                    { label: 'Falta para Meta',
                      val: falta <= 0 ? '✓ Superada' : fmt(falta),
                      color: falta <= 0 ? 'var(--green)' : 'var(--red)' },
                  ].map(({ label, val, color }) => (
                    <div key={label} className="text-center px-2">
                      <div className="text-palumar-muted mb-1" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                      <div className="font-mono-num font-bold" style={{ fontSize: '18px', color }}>{val}</div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Barra por vendedor: % cumplimiento + falta en $ */}
            <div className="text-palumar-muted mb-2" style={{ fontSize: '11px' }}>
              Ordenado por % de cumplimiento · Meta <strong style={{ color: 'var(--red)' }}>100%</strong>
            </div>
            <HBarChart
              labels={metaData.map(v => v.nombre)}
              data={metaData.map(v => Math.min(v.pct_cumplimiento || 0, 120))}
              barColors={metaData.map((_, i) => VEND_COLORS[i % VEND_COLORS.length])}
              isPct
              metaValue={100}
              metaLabel="Meta"
              secondaryData={metaData.map(v => (v.cuota || 0) - (v.venta_neta || 0))}
              secondaryFmt={(v) => v > 0 ? `Falta ${fmtK(v)}` : 'Meta ✓'}
            />
          </div>
        </>
      )}

      {/* ── Cobertura por vendedor ── */}
      <SectionTitle>Cobertura Real por Vendedor</SectionTitle>
      <div className="chart-card mb-4">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-palumar-muted" style={{ fontSize: '11px' }}>
            Promedio equipo: <strong style={{ color: 'var(--white-2)' }}>{pct(promEquipoCob)}</strong>
          </span>
          <span className="text-palumar-muted" style={{ fontSize: '11px' }}>
            Meta: <strong style={{ color: 'var(--red)' }}>95%</strong>
          </span>
        </div>
        <p className="text-palumar-muted mb-3" style={{ fontSize: '11px' }}>
          Cobertura = clientes impactados ÷ maestro de cada vendedor
          {rf?.clientes_maestro > 0
            ? ` · universo ${sedeFiltro === 'TODOS' ? 'total' : sedeFiltro === 'CENTRALES' ? 'Centrales' : 'Chiriquí'}: ${(rf.clientes_maestro).toLocaleString()} clientes activos`
            : ''}
        </p>
        <HBarChart
          labels={cobData.map(r2 => getCoberturaVendedor(r2))}
          data={cobData.map(r2 => getCoberturaValue(r2))}
          barColors={cobData.map((_, i) => VEND_COLORS[i % VEND_COLORS.length])}
          isPct
          metaValue={95}
          metaLabel="Meta 95%"
          secondaryData={cobData.map(r2 => {
            const lbl = getCoberturaVendedor(r2);
            return vendVentaMap[norm(lbl)] ?? vendVentaMap[lbl.split('-')[0].trim()] ?? 0;
          })}
          secondaryFmt={fmtK}
        />
      </div>

      {/* ── Cobertura por Negocio ── */}
      {negocios.length > 0 && (
        <>
          <SectionTitle>Cobertura por Negocio</SectionTitle>
          <div className="chart-card mb-4">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <select
                className="palma-select"
                value={negocioFiltro}
                onChange={e => setNegocioFiltro(e.target.value)}
              >
                <option value="">Selecciona un negocio</option>
                {negocios.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              {negocioFiltro && cobNegOrdenado.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-palumar-muted" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
                    Ordenar por:
                  </span>
                  <select
                    className="palma-select"
                    value={cobNegOrden}
                    onChange={e => setCobNegOrden(e.target.value)}
                    style={{ maxWidth: 200 }}
                  >
                    <option value="oportunidad">Mayor oportunidad</option>
                    <option value="menorCobertura">Menor cobertura</option>
                    <option value="mayorCobertura">Mayor cobertura</option>
                    <option value="mayorVenta">Mayor venta</option>
                  </select>
                </div>
              )}
            </div>

            {/* Resumen total del negocio seleccionado */}
            {negocioFiltro && cobNegResumen && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {[
                  { label: `Cobertura total en ${negocioFiltro}`, value: pct(cobNegResumen.pctTotal),
                    color: cobNegResumen.pctTotal >= 90 ? 'var(--green)' : cobNegResumen.pctTotal >= 70 ? 'var(--amber)' : 'var(--red)' },
                  { label: 'Clientes impactados', value: cobNegResumen.totalImp.toLocaleString('es'), color: 'var(--white-2)' },
                  { label: 'Sin impacto', value: (cobNegResumen.totalMae - cobNegResumen.totalImp).toLocaleString('es'), color: 'var(--red)' },
                  { label: 'Universo', value: `${cobNegResumen.totalMae.toLocaleString('es')} clientes`, color: 'var(--cyan)' },
                ].map(stat => (
                  <div key={stat.label} className="px-4 py-3 rounded-lg" style={{ background: 'rgba(45,174,217,0.07)', border: '1px solid rgba(45,174,217,0.18)' }}>
                    <div className="text-palumar-muted mb-1" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {stat.label}
                    </div>
                    <div className="font-mono-num font-bold" style={{ fontSize: '20px', color: stat.color }}>
                      {stat.value}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {negocioFiltro && cobNegOrdenado.length > 0 ? (
              <>
                <HBarChart
                  labels={cobNegOrdenado.map(d => d.vendedor)}
                  data={cobNegOrdenado.map(d => d.cobertura)}
                  barColors={cobNegOrdenado.map((_, i) => VEND_COLORS[i % VEND_COLORS.length])}
                  isPct
                  metaValue={95}
                  metaLabel="Meta 95%"
                  rowH={40}
                  minH={180}
                  secondaryData={cobNegOrdenado.map(d => d.impactados)}
                  secondaryFmt={(n) => `${n.toLocaleString('es')} clientes`}
                  secondaryColor="rgba(237,244,251,0.88)"
                />

                {/* Detalle por vendedor */}
                <p className="text-palumar-muted mt-4 mb-2" style={{ fontSize: '11px' }}>
                  Detalle por vendedor
                </p>
                <div className="overflow-x-auto">
                  <table className="palma-table">
                    <thead>
                      <tr>
                        <th>Vendedor</th>
                        <th style={{ textAlign: 'right' }}>Total clientes</th>
                        <th style={{ textAlign: 'right' }}>Impactados</th>
                        <th style={{ textAlign: 'right' }}>Pendientes</th>
                        <th style={{ minWidth: '120px' }}>Cobertura %</th>
                        <th style={{ textAlign: 'right' }}>Venta negocio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cobNegOrdenado.map((d, i) => {
                        const col = d.cobertura >= 90 ? 'var(--green)' : d.cobertura >= 70 ? 'var(--amber)' : 'var(--red)';
                        return (
                          <tr key={d.vendedor + i}>
                            <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{d.vendedor}</td>
                            <td style={{ textAlign: 'right' }} className="font-mono-num">{d.maestro.toLocaleString('es')}</td>
                            <td style={{ textAlign: 'right' }} className="font-mono-num">{d.impactados.toLocaleString('es')}</td>
                            <td style={{ textAlign: 'right', color: 'var(--red)', fontWeight: 600 }} className="font-mono-num">
                              {d.pendientes.toLocaleString('es')}
                            </td>
                            <td>
                              <div className="flex items-center gap-2">
                                <div style={{ flex: 1, height: '6px', borderRadius: '99px', background: 'rgba(255,255,255,0.08)' }}>
                                  <div style={{ height: '100%', borderRadius: '99px', width: `${Math.min(d.cobertura, 100)}%`, background: col }} />
                                </div>
                                <span style={{ color: col, fontWeight: 700, fontSize: '12px', minWidth: '40px', textAlign: 'right' }}>{d.cobertura.toFixed(1)}%</span>
                              </div>
                            </td>
                            <td style={{ textAlign: 'right', color: 'var(--cyan)' }} className="font-mono-num">{fmt(d.venta)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="text-palumar-muted text-sm text-center py-6">
                {negocioFiltro ? 'Sin datos para este negocio' : 'Selecciona un negocio para ver el detalle'}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Cobertura por Marcas ── */}
      <SectionTitle>Cobertura por marcas</SectionTitle>
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
      {coberturaMarcas && marcasGeneral.length === 0 && (
        <div className="table-card mb-4 text-center py-8 text-palumar-muted text-sm">
          Sin datos de cobertura por marcas para este filtro.
        </div>
      )}
      {coberturaMarcas && marcasGeneral.length > 0 && marcasMiniKPIs && (
        <>
          {/* 3 mini KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <KpiCard
              label="Marca líder por cobertura"
              value={marcasMiniKPIs.lider.marca}
              sub={`${pct(marcasMiniKPIs.lider.cobertura_pct)} · ${marcasMiniKPIs.lider.clientes_impactados.toLocaleString('es')} clientes`}
              color="green"
            />
            <KpiCard
              label="Marca con mayor oportunidad"
              value={marcasMiniKPIs.mayorOportunidad.marca}
              sub={`${marcasMiniKPIs.mayorOportunidad.oportunidad_clientes.toLocaleString('es')} clientes sin impactar`}
              color="amber"
            />
            <KpiCard
              label="Marcas con venta"
              value={String(marcasMiniKPIs.totalConVenta)}
              sub={`de ${marcasGeneral.length} marcas medidas`}
              color="cyan"
            />
          </div>

          {/* Selector de orden */}
          <div className="flex items-center gap-3 mb-3">
            <span className="text-palumar-muted" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
              Ordenar por:
            </span>
            <select
              className="palma-select"
              value={marcasOrden}
              onChange={e => setMarcasOrden(e.target.value)}
              style={{ maxWidth: 200 }}
            >
              <option value="cobertura">Mayor cobertura</option>
              <option value="oportunidad">Mayor oportunidad</option>
              <option value="venta">Mayor venta</option>
            </select>
          </div>

          {/* Gráfica horizontal — marcas mostradas (top10 o todas) */}
          <div className="chart-card mb-3">
            <HBarChart
              labels={marcasTablaShown.map(m => m.marca)}
              data={marcasTablaShown.map(m => m.cobertura_pct)}
              barColors={marcasTablaShown.map((_, i) => VEND_COLORS[i % VEND_COLORS.length])}
              isPct
              rowH={32}
              minH={160}
              secondaryData={marcasTablaShown.map(m => m.clientes_impactados)}
              secondaryFmt={(n) => `${n.toLocaleString('es')} clientes`}
            />
          </div>

          {/* Tabla compacta */}
          <div className="table-card mb-3 overflow-x-auto">
            <table className="palma-table">
              <thead>
                <tr>
                  <th>Marca</th>
                  <th style={{ textAlign: 'right' }}>Clientes impactados</th>
                  <th style={{ textAlign: 'right' }}>Universo</th>
                  <th style={{ textAlign: 'right' }}>Cobertura %</th>
                  <th style={{ textAlign: 'right' }}>Venta</th>
                  <th style={{ textAlign: 'right' }}>Oportunidad</th>
                </tr>
              </thead>
              <tbody>
                {marcasTablaShown.map(m => {
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

          {marcasOrdenadas.length > 10 && (
            <div className="flex justify-end mb-6">
              <button
                onClick={() => setMarcasVerTodas(v => !v)}
                style={{ padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border-2)', background: 'rgba(255,255,255,0.04)', color: 'var(--muted)' }}
              >
                {marcasVerTodas ? '▲ Ver top 10' : `▼ Ver todas las marcas (${marcasOrdenadas.length})`}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Efectividad ── */}
      <SectionTitle>Efectividad por Vendedor</SectionTitle>
      <div className="chart-card mb-4">
        <div className="mb-1 flex items-center gap-3">
          <span className="text-palumar-muted" style={{ fontSize: '11px' }}>
            Meta: <strong style={{ color: 'var(--red)' }}>90%</strong>
          </span>
        </div>
        <HBarChart
          labels={efData.map(r2 => getCoberturaVendedor(r2))}
          data={efData.map(r2 => +r2[efField] || 0)}
          barColors={efData.map((_, i) => VEND_COLORS[i % VEND_COLORS.length])}
          isPct
          metaValue={90}
          metaLabel="Meta 90%"
        />
      </div>

      {/* ── Alertas ── */}
      <SectionTitle>Alertas</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 mb-4">
        {alerts.map((a, i) => (
          <AlertItem key={i} type={a.type}>
            {a.msg}
          </AlertItem>
        ))}
      </div>

      {/* ── Análisis por Negocio — Marcas & SKUs ── */}
      {(marcas.length > 0 || skus.global?.length > 0) && (() => {
        const negociosSet = new Set();
        marcas.forEach(m => { const n = normNeg(m.negocio); if (n) negociosSet.add(n); });
        skus.global?.forEach(s => { const n = normNeg(s.negocio); if (n) negociosSet.add(n); });
        const negocioOpts = [...negociosSet].sort();

        const marcasFiltradas = negocioAnalisisFiltro
          ? marcas.filter(m => normNeg(m.negocio) === negocioAnalisisFiltro)
          : marcas;
        const skusFiltrados = negocioAnalisisFiltro
          ? (skus.global || []).filter(s => normNeg(s.negocio) === negocioAnalisisFiltro)
          : (skus.global || []);

        return (
          <>
            <SectionTitle>Análisis por Negocio</SectionTitle>

            {/* Filtro negocio */}
            <div className="flex items-center gap-3 mb-4">
              <select
                className="palma-select"
                value={negocioAnalisisFiltro}
                onChange={e => { setNegocioAnalisisFiltro(e.target.value); setSkusLimit(15); }}
                style={{ maxWidth: 220 }}
              >
                <option value="">Todos los negocios</option>
                {negocioOpts.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              {negocioAnalisisFiltro && (
                <button
                  onClick={() => { setNegocioAnalisisFiltro(''); setSkusLimit(15); }}
                  style={{ fontSize: '11px', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
                >
                  ✕ Limpiar
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              {marcasFiltradas.length > 0 && (
                <div className="table-card">
                  <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-2)' }}>
                    <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>Top Marcas</h3>
                    <span className="text-palumar-muted" style={{ fontSize: '11px' }}>Por venta</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="palma-table">
                      <thead>
                        <tr>
                          <th>Marca</th>
                          {!negocioAnalisisFiltro && <th>Negocio</th>}
                          <th style={{ textAlign: 'right' }}>Venta</th>
                          <th style={{ textAlign: 'right' }}>%</th>
                          <th style={{ textAlign: 'right' }}>Clientes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {marcasFiltradas.slice(0, 10).map((m, i) => (
                          <tr key={i}>
                            <td>{m.marca}</td>
                            {!negocioAnalisisFiltro && <td style={{ color: 'var(--muted)' }}>{normNeg(m.negocio) || '—'}</td>}
                            <td style={{ textAlign: 'right' }} className="font-mono-num">{fmt(m.venta)}</td>
                            <td style={{ textAlign: 'right' }}>{m.pct}%</td>
                            <td style={{ textAlign: 'right' }}>{m.clientes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {skusFiltrados.length > 0 && (
                <div className="table-card">
                  <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-2)' }}>
                    <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>Top SKUs</h3>
                    <span className="text-palumar-muted" style={{ fontSize: '11px' }}>Por venta</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="palma-table">
                      <thead>
                        <tr>
                          <th>SKU</th>
                          {!negocioAnalisisFiltro && <th>Negocio</th>}
                          <th style={{ textAlign: 'right' }}>Venta</th>
                          <th style={{ textAlign: 'right' }}>Unidades</th>
                          <th style={{ textAlign: 'right' }}>Clientes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {skusFiltrados.slice(0, skusLimit).map((s, i) => (
                          <tr key={i}>
                            <td>{s.nombre || s.sku}</td>
                            {!negocioAnalisisFiltro && <td style={{ color: 'var(--muted)' }}>{normNeg(s.negocio) || '—'}</td>}
                            <td style={{ textAlign: 'right' }} className="font-mono-num">{fmt(s.venta)}</td>
                            <td style={{ textAlign: 'right' }}>{(s.unidades || 0).toLocaleString()}</td>
                            <td style={{ textAlign: 'right' }}>{s.clientes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {skusFiltrados.length > skusLimit && (
                    <div className="px-5 py-2.5 border-t" style={{ borderColor: 'var(--border-2)' }}>
                      <button
                        onClick={() => setSkusLimit(n => n + 15)}
                        style={{ padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border-2)', background: 'rgba(255,255,255,0.04)', color: 'var(--muted)' }}
                      >
                        ▼ Ver más ({skusFiltrados.length - skusLimit} restantes)
                      </button>
                    </div>
                  )}
                  {skusLimit > 15 && (
                    <div className="px-5 py-2.5 border-t" style={{ borderColor: 'var(--border-2)' }}>
                      <button
                        onClick={() => setSkusLimit(15)}
                        style={{ padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border-2)', background: 'rgba(255,255,255,0.04)', color: 'var(--muted)' }}
                      >
                        ▲ Ver menos
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        );
      })()}

      {/* ── Top 10 por Vendedor ── */}
      {topClientes.top_por_vendedor?.length > 0 && (
        <>
          <SectionTitle>Top 10 Clientes por Vendedor</SectionTitle>
          <div className="chart-card mb-4">
            <div className="flex items-center gap-3 mb-4">
              <select
                className="palma-select"
                value={vendedorTop10}
                onChange={e => setVendedorTop10(e.target.value)}
              >
                <option value="">— Selecciona un vendedor —</option>
                {topClientes.top_por_vendedor.map(vx => (
                  <option key={vx.cod_vendedor} value={vx.cod_vendedor}>
                    {vx.cod_vendedor} — {vx.nom_vendedor}
                  </option>
                ))}
              </select>
            </div>

            {(() => {
              const vx = topClientes.top_por_vendedor.find(x => x.cod_vendedor === vendedorTop10);
              if (!vendedorTop10) return (
                <p className="text-center text-palumar-muted text-sm py-6">
                  Selecciona un vendedor para ver sus 10 mejores clientes
                </p>
              );
              if (!vx?.top10?.length) return (
                <p className="text-center text-palumar-muted text-sm py-6">Sin datos</p>
              );
              return (
                <div className="overflow-x-auto">
                  <table className="palma-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Cód. Cliente</th>
                        <th>Cliente</th>
                        <th style={{ textAlign: 'right' }}>Venta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vx.top10.map(c => (
                        <tr key={c.cod_cliente}>
                          <td>
                            <span className="font-mono-num font-bold"
                              style={{ color: c.ranking <= 3 ? 'var(--gold)' : 'var(--muted)', fontSize: '11px' }}>
                              {c.ranking}
                            </span>
                          </td>
                          <td className="font-mono-num" style={{ color: 'var(--muted)', fontSize: '11px' }}>
                            {c.cod_cliente}
                          </td>
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

      {/* ── Gestión de Combos ── */}
      {(combosResumenFiltrado || combosVendedorFiltrados.length > 0) && (() => {
        const cr = combosResumenFiltrado;
        const cv = [...combosVendedorFiltrados].sort((a, b) => (b.unidades_vendidas || 0) - (a.unidades_vendidas || 0));
        const cvShown = showAllCombosTable ? cv : cv.slice(0, 8);
        return (
          <>
            <SectionTitle>Gestión de Combos</SectionTitle>

            {/* 4 KPIs */}
            {cr && (() => {
              const avCli = cr.meta_clientes_total > 0
                ? Math.round(cr.clientes_impactados / cr.meta_clientes_total * 1000) / 10
                : null;
              const avUni = cr.meta_unidades_total > 0
                ? Math.round(cr.unidades_vendidas / cr.meta_unidades_total * 1000) / 10
                : null;
              const colCli = avCli == null ? 'teal' : avCli >= 100 ? 'green' : avCli >= 70 ? 'amber' : 'red';
              const colUni = avUni == null ? 'cyan'  : avUni >= 100 ? 'green' : avUni >= 70 ? 'amber' : 'red';
              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <KpiCard
                    label="Clientes impactados"
                    value={cr.meta_clientes_total > 0
                      ? `${(cr.clientes_impactados || 0).toLocaleString()} / ${cr.meta_clientes_total.toLocaleString()}`
                      : String(cr.clientes_impactados || 0)}
                    sub={avCli != null ? `${avCli.toFixed(1)}% avance` : 'Sin meta'}
                    color={colCli}
                    barValue={avCli ?? 0}
                  />
                  <KpiCard
                    label="Unidades vendidas"
                    value={cr.meta_unidades_total > 0
                      ? `${(cr.unidades_vendidas || 0).toLocaleString()} / ${cr.meta_unidades_total.toLocaleString()}`
                      : String(cr.unidades_vendidas || 0)}
                    sub={avUni != null ? `${avUni.toFixed(1)}% avance` : 'Sin meta'}
                    color={colUni}
                    barValue={avUni ?? 0}
                  />
                  <KpiCard
                    label="Cumpl. equipo"
                    value={pct(cr.cumplimiento_unidades_pct || 0)}
                    sub={`Clientes: ${pct(cr.cumplimiento_clientes_pct || 0)}`}
                    color={(cr.cumplimiento_unidades_pct || 0) >= 100 ? 'green' : (cr.cumplimiento_unidades_pct || 0) >= 70 ? 'amber' : 'red'}
                    barValue={cr.cumplimiento_unidades_pct || 0}
                  />
                  <KpiCard
                    label="Venta Combos"
                    value={fmt(cr.venta_combos || 0)}
                    color="purple"
                  />
                </div>
              );
            })()}

            {/* Ranking por vendedor */}
            {cv.length > 0 && (
              <div className="table-card mb-4">
                <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-2)' }}>
                  <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>Ranking Combos por Vendedor</h3>
                  <span className="text-palumar-muted" style={{ fontSize: '11px' }}>% equipo = unidades del vendedor ÷ unidades totales del equipo</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="palma-table">
                    <thead>
                      <tr>
                        <th>Vendedor</th>
                        <th style={{ textAlign: 'right' }}>Clientes combos</th>
                        <th style={{ textAlign: 'right' }}>Unidades</th>
                        <th style={{ minWidth: '140px' }}>% Equipo</th>
                        <th style={{ textAlign: 'right' }}>Venta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cvShown.map((v, i) => {
                        const p    = v.pct_contribucion_unidades || 0;
                        const tot  = v.total_clientes_vendedor || 0;
                        const cob  = v.cobertura_combos_pct || 0;
                        return (
                          <tr key={v.cod_asesor || i}>
                            <td>
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: VEND_COLORS[i % VEND_COLORS.length] }} />
                                {v.cod_asesor} — {v.vendedor}
                              </div>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <span style={{ fontWeight: 600 }}>{v.clientes_impactados}</span>
                              {tot > 0 && (
                                <>
                                  <span style={{ color: 'var(--muted)', fontSize: '11px' }}> / {tot}</span>
                                  <div style={{ color: 'var(--muted)', fontSize: '10px' }}>{cob.toFixed(1)}% cob.</div>
                                </>
                              )}
                            </td>
                            <td style={{ textAlign: 'right' }}>{v.unidades_vendidas}</td>
                            <td>
                              <div className="flex items-center gap-2">
                                <div style={{ flex: 1, height: '6px', borderRadius: '99px', background: 'rgba(255,255,255,0.08)' }}>
                                  <div style={{ height: '100%', borderRadius: '99px', width: `${Math.min(p, 100)}%`, background: 'var(--cyan)' }} />
                                </div>
                                <span style={{ color: 'var(--cyan)', fontWeight: 700, fontSize: '12px', minWidth: '40px', textAlign: 'right' }}>{p.toFixed(1)}%</span>
                              </div>
                            </td>
                            <td style={{ textAlign: 'right' }} className="font-mono-num">{fmt(v.venta_combos)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Ver todos / Ver menos + botón detalle por producto */}
                <div className="px-5 py-2.5 border-t flex items-center gap-3" style={{ borderColor: 'var(--border-2)' }}>
                  {cv.length > 8 && (
                    <button
                      onClick={() => setShowAllCombosTable(s => !s)}
                      style={{
                        padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                        border: '1px solid var(--border-2)', background: 'rgba(255,255,255,0.04)', color: 'var(--muted)',
                      }}
                    >
                      {showAllCombosTable ? `▲ Ver menos (${cv.length})` : `▼ Ver todos (${cv.length})`}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const next = !showCombosDetalle;
                      setShowCombosDetalle(next);
                      if (next) loadCombosDetalle?.();
                    }}
                    style={{
                      padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                      border: `1px solid ${showCombosDetalle ? 'rgba(26,127,166,0.5)' : 'var(--border-2)'}`,
                      background: showCombosDetalle ? 'rgba(26,127,166,0.10)' : 'rgba(255,255,255,0.04)',
                      color: showCombosDetalle ? 'var(--cyan)' : 'var(--muted)',
                    }}
                  >
                    {showCombosDetalle ? '▲ Ocultar detalle por producto' : '▼ Ver detalle por producto'}
                  </button>
                </div>
              </div>
            )}

            {/* Detalle por producto — carga bajo demanda */}
            {showCombosDetalle && (
              <div className="table-card mb-6">
                {combosDetalleLoading ? (
                  <div className="flex items-center justify-center" style={{ minHeight: 80 }}>
                    <span className="text-palumar-muted" style={{ fontSize: 12 }}>Cargando detalle de combos…</span>
                  </div>
                ) : (combosDetalle?.productos || []).length > 0 ? (
                  <>
                    <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-2)' }}>
                      <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>Detalle por Producto Combo</h3>
                      <span className="text-palumar-muted" style={{ fontSize: '11px' }}>{(combosDetalle?.productos || []).length} combos activos</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="palma-table">
                        <thead>
                          <tr>
                            <th>Producto</th>
                            <th>Negocio</th>
                            <th style={{ textAlign: 'right' }}>Clientes / Meta</th>
                            <th style={{ textAlign: 'right' }}>Unidades / Meta</th>
                            <th style={{ textAlign: 'right' }}>Cumpl. cli.</th>
                            <th style={{ textAlign: 'right' }}>Cumpl. und.</th>
                            <th style={{ textAlign: 'right' }}>Venta</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(combosDetalle?.productos || []).map((p, i) => {
                            const cu  = p.cumplimiento_unidades_pct || 0;
                            const cc  = p.cumplimiento_clientes_pct || 0;
                            const colU = cu >= 100 ? 'var(--green)' : cu >= 70 ? 'var(--amber)' : 'var(--red)';
                            const colC = cc >= 100 ? 'var(--green)' : cc >= 70 ? 'var(--amber)' : 'var(--red)';
                            return (
                              <tr key={i} style={{ opacity: p.unidades_vendidas === 0 ? 0.55 : 1 }}>
                                <td style={{ fontWeight: p.unidades_vendidas > 0 ? 600 : 400 }}>
                                  {p.producto || p.sap}
                                  {p.unidades_vendidas === 0 && (
                                    <span className="badge badge-red" style={{ fontSize: '9px', marginLeft: '6px' }}>sin venta</span>
                                  )}
                                </td>
                                <td style={{ color: 'var(--muted)' }}>{normNeg(p.negocio) || '—'}</td>
                                <td style={{ textAlign: 'right' }}>
                                  <span style={{ fontWeight: 600 }}>{p.clientes_impactados}</span>
                                  {p.meta_clientes > 0 && <span style={{ color: 'var(--muted)', fontSize: '11px' }}> / {p.meta_clientes}</span>}
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <span style={{ fontWeight: 600 }}>{p.unidades_vendidas}</span>
                                  {p.meta_unidades > 0 && <span style={{ color: 'var(--muted)', fontSize: '11px' }}> / {p.meta_unidades}</span>}
                                </td>
                                <td style={{ textAlign: 'right', color: colC, fontWeight: 700 }}>{cc.toFixed(1)}%</td>
                                <td style={{ textAlign: 'right', color: colU, fontWeight: 700 }}>{cu.toFixed(1)}%</td>
                                <td style={{ textAlign: 'right' }} className="font-mono-num">{fmt(p.venta_combos)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center" style={{ minHeight: 64 }}>
                    <span className="text-palumar-muted" style={{ fontSize: 12 }}>
                      No se pudo cargar el detalle de combos. Intenta nuevamente.
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        );
      })()}

      {/* ── Ranking Completo ── */}
      <SectionTitle>Ranking Completo</SectionTitle>
      <div className="table-card mb-8">
        <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-2)' }}>
          <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>
            Detalle por Vendedor
          </h3>
          <span className="text-palumar-muted" style={{ fontSize: '11px' }}>{r.periodo || '—'}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="palma-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Vendedor</th>
                <th style={{ textAlign: 'right' }}>V. Real</th>
                <th style={{ textAlign: 'right' }}>Devol.</th>
                <th style={{ textAlign: 'right' }}>Dev%</th>
                <th style={{ textAlign: 'right' }}>V. Neta</th>
                <th style={{ textAlign: 'right' }}>Maestro</th>
                <th style={{ textAlign: 'right' }}>Impactos</th>
                <th style={{ textAlign: 'right' }}>Cobertura</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {vs.map((v, i) => {
                const devPct = v.pct_devolucion ?? (v.venta_real > 0 ? (v.devol / v.venta_real * 100) : 0);
                const cob = +v.cobertura || 0;
                const badgeClass = cob >= 95 ? 'badge-green' : cob >= 75 ? 'badge-amber' : 'badge-red';
                const badgeLabel = cob >= 95 ? 'En meta' : cob >= 75 ? 'Cerca' : 'Bajo meta';
                return (
                  <tr key={v.cod}>
                    <td>{i + 1}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
                          style={{
                            background: VEND_COLORS[i % VEND_COLORS.length],
                            fontSize: '9px',
                          }}
                        >
                          {v.nombre?.[0] || '?'}
                        </div>
                        <span>{v.cod} — {v.nombre}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }} className="font-mono-num">{fmt(v.venta_real)}</td>
                    <td style={{ textAlign: 'right' }} className="font-mono-num" style2="color:var(--red)">
                      <span style={{ color: 'var(--red)' }}>{fmt(v.devol)}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>{pct(devPct)}</td>
                    <td style={{ textAlign: 'right' }} className="font-mono-num">
                      <span style={{ color: 'var(--green)' }}>{fmt(v.venta_neta)}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>{v.maestro || 0}</td>
                    <td style={{ textAlign: 'right' }}>{v.clientes_imp || 0}</td>
                    <td style={{ textAlign: 'right' }}>{pct(v.cobertura)}</td>
                    <td><span className={`badge ${badgeClass}`}>{badgeLabel}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Seguimiento de Concursos ── */}
      <SectionTitle>Seguimiento de concursos</SectionTitle>
      <p className="text-palumar-muted mb-4" style={{ fontSize: '11px' }}>
        Cobertura por vendedor en marcas en medición
      </p>
      {!coberturaMarcas && loadingFase2 && (
        <div className="table-card mb-8 flex items-center justify-center gap-3 py-8">
          <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" style={{ color: '#2AAED9', opacity: 0.7, flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="text-palumar-muted text-sm">Cargando seguimiento de concursos…</span>
        </div>
      )}
      {!coberturaMarcas && !loadingFase2 && (
        <div className="table-card mb-8 text-center py-8 text-palumar-muted text-sm">
          No se pudo cargar el seguimiento de concursos.
        </div>
      )}
      {coberturaMarcas && concursoVendedoresFiltrados.length === 0 && (
        <div className="table-card mb-8 text-center py-8 text-palumar-muted text-sm">
          Sin datos de seguimiento de concursos para este filtro.
        </div>
      )}
      {coberturaMarcas && concursoVendedoresFiltrados.length > 0 && (
        <>
          {/* 3 mini KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            {concursoResumenFiltrado.map(c => (
              <KpiCard
                key={c.marca}
                label={`Cobertura promedio ${c.marca}`}
                value={pct(c.cobertura_pct)}
                sub={`${c.clientes_impactados.toLocaleString('es')} / ${c.universo.toLocaleString('es')} clientes`}
                color={c.cobertura_pct >= UMBRAL_VERDE_CONCURSO ? 'green' : c.cobertura_pct >= UMBRAL_AMARILLO_CONCURSO ? 'amber' : 'red'}
                barValue={c.cobertura_pct}
              />
            ))}
          </div>

          {/* Tabla por vendedor */}
          <div className="table-card mb-8 overflow-x-auto">
            <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-2)' }}>
              <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>
                Cobertura por vendedor — marcas en medición
              </h3>
              <span className="text-palumar-muted" style={{ fontSize: '11px' }}>
                Ordenado por menor cobertura primero · {concursoVendedoresFiltrados.length} vendedores
              </span>
            </div>
            <table className="palma-table" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th>Sede</th>
                  <th style={{ textAlign: 'right' }}>Universo</th>
                  {(coberturaMarcas.concursos.marcas || []).map(marca => (
                    <th key={marca} style={{ textAlign: 'right' }}>{marca}</th>
                  ))}
                  <th style={{ textAlign: 'right' }}>Prom. cobertura</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {concursoVendedoresFiltrados.map(v => {
                  const estadoColor = v.estado === 'verde' ? 'var(--green)' : v.estado === 'amarillo' ? 'var(--amber)' : 'var(--red)';
                  const estadoLabel = v.estado === 'verde' ? 'Bien' : v.estado === 'amarillo' ? 'En avance' : 'Gestionar';
                  return (
                    <tr key={v.cod_asesor}>
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{v.vendedor}</td>
                      <td style={{ color: 'var(--muted)', fontSize: '11px' }}>{normalizarSede(v.sede) || '—'}</td>
                      <td style={{ textAlign: 'right' }} className="font-mono-num">{v.universo.toLocaleString('es')}</td>
                      {(coberturaMarcas.concursos.marcas || []).map(marca => {
                        const m = v.marcas?.[marca];
                        return (
                          <td key={marca} style={{ textAlign: 'right' }}>
                            {m ? (
                              <>
                                <span style={{
                                  color: m.cobertura_pct >= UMBRAL_VERDE_CONCURSO ? 'var(--green)' : m.cobertura_pct >= UMBRAL_AMARILLO_CONCURSO ? 'var(--amber)' : 'var(--red)',
                                  fontWeight: 700,
                                }}>
                                  {m.cobertura_pct.toFixed(1)}%
                                </span>
                                <div style={{ color: 'var(--muted)', fontSize: '10px' }}>
                                  {m.clientes_impactados}/{v.universo}
                                </div>
                              </>
                            ) : <span style={{ color: 'var(--muted)' }}>—</span>}
                          </td>
                        );
                      })}
                      <td style={{ textAlign: 'right' }}>
                        <span style={{ color: estadoColor, fontWeight: 700 }}>{v.promedio_cobertura_pct.toFixed(1)}%</span>
                      </td>
                      <td>
                        <span className="badge" style={{ background: `${estadoColor}22`, color: estadoColor, border: `1px solid ${estadoColor}55` }}>
                          {estadoLabel}
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
  );
}