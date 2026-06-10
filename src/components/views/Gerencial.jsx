import React, { useMemo, useState, useCallback, useEffect } from 'react';
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
    refetchClientes,
    coberturaPC,
    coberturaVendedoresPC,
    clientesSinPC,
    pcDetalle,
    loadPCDetalle,
    pcDetalleLoading,
    loadClientesSinPC,
    clientesSinPCLoading,
    loadingFase2,
  } = useDashboardStore();

  const [sedeFiltro, setSedeFiltro]       = useState('TODOS'); // 'TODOS' | 'CENTRALES' | 'CHIRIQUI'
  const [negocioFiltro, setNegocioFiltro] = useState('');
  const [vendedorTop10, setVendedorTop10] = useState('');
  const [negocioTop10, setNegocioTop10]   = useState('');
  const [ceroVendSel, setCeroVendSel] = useState('');
  const [loadingNuevosG, setLoadingNuevosG] = useState(false);
  const [filtroNuevosLabel, setFiltroNuevosLabel] = useState('Este período');
  const [showSinPC, setShowSinPC]         = useState(false);   // panel clientes pendientes
  const [showPCDetalle, setShowPCDetalle] = useState(false);   // panel detalle por producto

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
    'NUTRICION EXPERTA': 'Nutrición Experta',
    'NUTRICION':         'Nutrición Experta',
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
    // Quitar código inicial con cualquier cantidad de dígitos: "241-", "03-", "001 -"
    s = s.replace(/^\d+\s*[-_]\s*/, '');
    // Guardar versión limpia (sin código) para el fallback
    const limpio = s.trim();
    // Quitar acentos y caracteres corruptos para lookup en mapa
    s = s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/�/g, '').replace(/\?/g, '');
    s = s.toUpperCase().replace(/\s+/g, ' ').trim();
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
      const pctC   = meta > 0 ? Math.round(venta / meta * 1000) / 10 : 0;
      const falta  = meta - venta;
      return { negocio: key, meta, venta, proyec, pctC, falta, conMeta: meta > 0 };
    }).sort((a, b) => b.meta - a.meta || b.venta - a.venta);

    // Fila "Sin negocio identificado" si diferencia > $0.50
    if (Math.abs(ventaSinNegocio) > 0.5) {
      rows.push({
        negocio: 'Sin negocio identificado',
        meta: 0, venta: ventaSinNegocio,
        proyec: ventaSinNegocio * factor,
        pctC: 0, falta: 0, conMeta: false, sinIdentificar: true,
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

    const habilesTotal  = diasHabiles(inicio, fin);
    const habilesTransc = diasHabiles(inicio, hoy);
    if (habilesTransc === 0) return null;

    const proyeccion  = Math.round(rf.venta_neta / habilesTransc * habilesTotal);
    const pctAvance   = Math.round(habilesTransc / habilesTotal * 100);
    const cuota       = rf.cuota_total || 0;
    const pctVsCuota  = cuota > 0 ? Math.round(proyeccion / cuota * 100) : null;
    return { proyeccion, pctAvance, habilesTransc, habilesTotal, pctVsCuota };
  }, [rf]);

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

      {/* ── Filtro de Sede ── */}
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

      {/* ── KPIs ── */}
      <SectionTitle>KPIs Globales</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 tv:grid-cols-5 gap-3 mb-6">
        <KpiCard label="Venta Bruta" value={fmt(rf.venta_bruta ?? rf.venta_real ?? 0)} color="blue" />
        <KpiCard
          label="Devoluciones"
          value={fmt(rf.devolucion_total ?? rf.devoluciones ?? rf.devolucion ?? 0)}
          sub={`<span style="color:var(--red)">${pct(rf.pct_devolucion)}</span> de venta bruta`}
          color="red"
        />
        <KpiCard
          label="Averías"
          value={fmt(rf.averia_total ?? rf.averias ?? rf.averia ?? 0)}
          sub={pct(rf.pct_averia || 0)}
          color="red"
        />
        <KpiCard
          label="Descuentos"
          value={fmt(rf.descuento_total || 0)}
          sub={pct(rf.pct_descuento_total || 0)}
          color="amber"
        />
        <KpiCard label="Venta Neta" value={fmt(rf.venta_neta || 0)} color="green" />
        {proyeccionCierre && (
          <KpiCard
            label="Proyección Cierre"
            value={fmt(proyeccionCierre.proyeccion)}
            sub={proyeccionCierre.pctVsCuota != null
              ? `${proyeccionCierre.pctVsCuota}% de la meta · día ${proyeccionCierre.habilesTransc}/${proyeccionCierre.habilesTotal}`
              : `Día hábil ${proyeccionCierre.habilesTransc} de ${proyeccionCierre.habilesTotal} · ${proyeccionCierre.pctAvance}% del mes`}
            color={proyeccionCierre.pctVsCuota == null ? 'cyan'
              : proyeccionCierre.pctVsCuota >= 100 ? 'green'
              : proyeccionCierre.pctVsCuota >= 75  ? 'amber'
              : 'red'}
          />
        )}
        <KpiCard
          label="Cobertura"
          value={pct(rf.cobertura_pct || 0)}
          sub={`${rf.clientes_impactados ?? 0} de ${rf.clientes_maestro ?? 0} clientes activos`}
          color="cyan"
          barValue={rf.cobertura_pct || 0}
        />
        <KpiCard label="Ticket Promedio" value={fmt(rf.ticket_promedio)} color="blue" />
        <KpiCard
          label="Efectividad"
          value={pct(rf.efectividad_pct)}
          color="purple"
          barValue={rf.efectividad_pct || 0}
        />
        {rf.cuota_total > 0 && (
          <KpiCard
            label="Cuota Equipo"
            value={fmt(rf.cuota_total)}
            sub={`${pct(rf.pct_cumplimiento_equipo || 0)} cumplimiento`}
            color="gold"
            barValue={rf.pct_cumplimiento_equipo || 0}
          />
        )}
      </div>

      {/* ── Venta por Negocio ── */}
      {neg.length > 0 && (
        <>
          <SectionTitle>Venta por Negocio</SectionTitle>
          <div className="chart-card mb-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-palumar-muted" style={{ fontSize: '11px' }}>
                Venta neta del período · ordenado de mayor a menor
              </span>
              <span className="font-mono-num font-bold text-palumar-white" style={{ fontSize: '17px' }}>
                {fmt(rf?.venta_neta ?? 0)}
              </span>
            </div>
            <HBarChart
              labels={neg.map(n => n.negocio)}
              data={neg.map(n => n.venta)}
              barColors={neg.map((_, i) => VEND_COLORS[i % VEND_COLORS.length])}
              minH={120}
              rowH={36}
            />
          </div>
        </>
      )}

      {/* ── Metas por Negocio ── */}
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
                    <th style={{ minWidth: '140px' }}>Cumplimiento</th>
                    <th style={{ textAlign: 'right' }}>Falta / Exceso</th>
                  </tr>
                </thead>
                <tbody>
                  {metasPorNegocio.map((row, i) => {
                    const col = !row.conMeta ? 'var(--cyan)'
                      : row.pctC >= 100 ? 'var(--green)'
                      : row.pctC >= 75  ? 'var(--amber)'
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
                    const totalPct   = totalMeta > 0 ? Math.round(totalVenta / totalMeta * 1000) / 10 : 0;
                    const totalFalta = totalMeta - totalVenta;
                    const col2 = totalPct >= 100 ? 'var(--green)' : totalPct >= 75 ? 'var(--amber)' : 'var(--red)';
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

      {/* ── Cobertura Productos Clave ── */}
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
          {cobPCVendedoresFiltrados.length > 0 && (
            <div className="table-card mb-4">
              <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-2)' }}>
                <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>
                  Ranking Cobertura por Vendedor
                </h3>
                <span className="text-palumar-muted" style={{ fontSize: '11px' }}>
                  {cobPCVendedoresFiltrados.length} vendedores · menor cobertura primero
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="palma-table">
                  <thead>
                    <tr>
                      <th>Vendedor</th>
                      <th>Sede</th>
                      <th style={{ textAlign: 'right' }}>Activos</th>
                      <th style={{ textAlign: 'right' }}>Impactados</th>
                      <th style={{ textAlign: 'right' }}>Pendientes</th>
                      <th style={{ minWidth: '160px' }}>Cobertura %</th>
                      <th style={{ textAlign: 'right' }}>Venta clave</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cobPCVendedoresFiltrados.map((v, i) => {
                      const c   = v.cobertura_clave_pct || 0;
                      const col = c >= 70 ? 'var(--green)' : c >= 40 ? 'var(--amber)' : 'var(--red)';
                      const lbl = c >= 70 ? 'Bien' : c >= 40 ? 'En avance' : 'Crítico';
                      return (
                        <tr key={i}>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: VEND_COLORS[i % VEND_COLORS.length] }} />
                              {v.cod_asesor} — {v.vendedor}
                            </div>
                          </td>
                          <td><span className="badge badge-blue" style={{ fontSize: '10px' }}>{v.sede || '—'}</span></td>
                          <td style={{ textAlign: 'right' }}>{v.clientes_activos}</td>
                          <td style={{ textAlign: 'right', color: 'var(--green)', fontWeight: 700 }}>{v.clientes_impactados_clave}</td>
                          <td style={{ textAlign: 'right', color: 'var(--red)', fontWeight: 700 }}>{v.clientes_sin_impacto_clave}</td>
                          <td>
                            <div className="flex items-center gap-2 mb-0.5">
                              <div style={{ flex: 1, height: '6px', borderRadius: '99px', background: 'rgba(255,255,255,0.08)' }}>
                                <div style={{ height: '100%', borderRadius: '99px', width: `${Math.min(c, 100)}%`, background: col }} />
                              </div>
                              <span style={{ color: col, fontWeight: 700, fontSize: '12px', minWidth: '40px', textAlign: 'right' }}>{c.toFixed(1)}%</span>
                            </div>
                            <span style={{ fontSize: '10px', color: col }}>{lbl}</span>
                          </td>
                          <td style={{ textAlign: 'right' }} className="font-mono-num">{fmt(v.venta_productos_clave)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Botón Ver detalle por producto (demanda) */}
          <div className="flex flex-wrap gap-3 mb-4">
            <button
              onClick={() => { setShowPCDetalle(true); loadPCDetalle?.(); }}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                border: `1px solid ${showPCDetalle ? 'rgba(26,127,166,0.5)' : 'var(--border-2)'}`,
                background: showPCDetalle ? 'rgba(26,127,166,0.10)' : 'rgba(255,255,255,0.04)',
                color: showPCDetalle ? 'var(--cyan)' : 'var(--muted)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              Ver detalle por producto
            </button>
          </div>

          {/* ── Clientes pendientes — acordeón (oculto por defecto) ── */}
          <div className="table-card mb-4">
            {/* Cabecera siempre visible con contador y botón toggle */}
            <div
              className="px-5 py-3.5 flex items-center justify-between"
              style={{
                borderBottom: showSinPC ? '1px solid var(--border-2)' : 'none',
              }}
            >
              <div>
                <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>
                  Clientes pendientes — Sin Producto Clave
                </h3>
                <p className="text-palumar-muted" style={{ fontSize: '11px', marginTop: '2px' }}>
                  {clientesSinPCFiltrados.length > 0
                    ? `${clientesSinPCFiltrados.length.toLocaleString()} clientes pendientes · ordenados por venta periodo`
                    : `${(cobPCResumen.clientes_sin_impacto_clave || 0).toLocaleString()} clientes pendientes`}
                </p>
              </div>
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
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: `1px solid ${showSinPC ? 'rgba(239,68,68,0.4)' : 'var(--border-2)'}`,
                  background: showSinPC ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.05)',
                  color: showSinPC ? 'var(--red)' : 'var(--muted)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  flexShrink: 0,
                }}
              >
                {showSinPC ? 'Ocultar listado' : 'Ver listado'}
              </button>
            </div>

            {/* Cuerpo del acordeón */}
            {showSinPC && (
              clientesSinPCLoading ? (
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
                          <td>
                            {c.sede
                              ? <span className="badge badge-blue" style={{ fontSize: '10px' }}>{c.sede}</span>
                              : '—'}
                          </td>
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
            )}
          </div>

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

      {/* ── Clientes Sin Compra ── */}
      {(clientesCero.total > 0) && (
        <>
          <SectionTitle>Clientes Sin Compra</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <KpiCard
              label="Sin compra este período"
              value={String(sedeFiltro === 'TODOS' ? (clientesCero.total || 0) : ceroCeroTotal)}
              color="red"
            />
            {ceroVendedoresFiltrados.length > 0 && (
              <KpiCard
                label="Vendedor c/más ceros"
                value={ceroVendedoresFiltrados[0]?.vendedor?.split(' ')[0] || '—'}
                sub={`${ceroVendedoresFiltrados[0]?.cantidad} clientes`}
                color="amber"
              />
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
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
          </div>
        </>
      )}

      {/* ── Top 10 Clientes ── */}
      {topClientes.top_global?.length > 0 && (
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
            <div className="flex items-center gap-3 mb-4">
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
            </div>
            {/* Resumen total del negocio seleccionado */}
            {negocioFiltro && cobNegResumen && (
              <div
                className="flex flex-wrap items-center gap-5 mb-4 px-4 py-3 rounded-lg"
                style={{ background: 'rgba(45,174,217,0.07)', border: '1px solid rgba(45,174,217,0.18)' }}
              >
                <div>
                  <div className="text-palumar-muted" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cobertura total en {negocioFiltro}</div>
                  <div
                    className="font-mono-num font-bold"
                    style={{
                      fontSize: '22px',
                      color: cobNegResumen.pctTotal >= 90 ? 'var(--green)'
                           : cobNegResumen.pctTotal >= 70 ? 'var(--amber)'
                           : 'var(--red)',
                    }}
                  >
                    {pct(cobNegResumen.pctTotal)}
                  </div>
                </div>
                <div className="w-px h-8 flex-shrink-0" style={{ background: 'rgba(45,174,217,0.25)' }} />
                <div>
                  <div className="text-palumar-muted" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Clientes impactados</div>
                  <div className="font-mono-num font-bold text-palumar-white" style={{ fontSize: '18px' }}>
                    {cobNegResumen.totalImp}
                    <span className="text-palumar-muted font-normal" style={{ fontSize: '13px' }}> / {cobNegResumen.totalMae}</span>
                  </div>
                </div>
                <div className="w-px h-8 flex-shrink-0" style={{ background: 'rgba(45,174,217,0.25)' }} />
                <div>
                  <div className="text-palumar-muted" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sin impacto</div>
                  <div className="font-mono-num font-bold" style={{ fontSize: '18px', color: 'var(--red)' }}>
                    {cobNegResumen.totalMae - cobNegResumen.totalImp}
                  </div>
                </div>
              </div>
            )}

            {negocioFiltro && cobNegFiltrada.length > 0 ? (
              <HBarChart
                labels={cobNegFiltrada.map(r2 => getCoberturaVendedor(r2))}
                data={cobNegFiltrada.map(r2 => getCoberturaValue(r2))}
                barColors={cobNegFiltrada.map((_, i) => VEND_COLORS[i % VEND_COLORS.length])}
                isPct
                metaValue={95}
                secondaryData={cobNegFiltrada.map(r2 => {
                  const lbl = getCoberturaVendedor(r2);
                  return cobNegVentaMap[norm(lbl)] ?? cobNegVentaMap[lbl.split('-')[0].trim()] ?? 0;
                })}
                secondaryFmt={fmtK}
              />
            ) : (
              <div className="text-palumar-muted text-sm text-center py-6">
                {negocioFiltro ? 'Sin datos para este negocio' : 'Selecciona un negocio para ver el detalle'}
              </div>
            )}
          </div>
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

      {/* ── Top Marcas & SKUs ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {marcas.length > 0 && (
          <div className="table-card">
            <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-2)' }}>
              <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>
                Top Marcas
              </h3>
              <span className="text-palumar-muted" style={{ fontSize: '11px' }}>Por venta</span>
            </div>
            <div className="overflow-x-auto">
              <table className="palma-table">
                <thead>
                  <tr>
                    <th>Marca</th>
                    <th>Negocio</th>
                    <th style={{ textAlign: 'right' }}>Venta</th>
                    <th style={{ textAlign: 'right' }}>%</th>
                    <th style={{ textAlign: 'right' }}>Clientes</th>
                  </tr>
                </thead>
                <tbody>
                  {marcas.slice(0, 10).map((m, i) => (
                    <tr key={i}>
                      <td>{m.marca}</td>
                      <td>{m.negocio}</td>
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

        {skus.global?.length > 0 && (
          <div className="table-card">
            <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-2)' }}>
              <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>
                Top SKUs
              </h3>
              <span className="text-palumar-muted" style={{ fontSize: '11px' }}>Por venta</span>
            </div>
            <div className="overflow-x-auto">
              <table className="palma-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Negocio</th>
                    <th style={{ textAlign: 'right' }}>Venta</th>
                    <th style={{ textAlign: 'right' }}>Clientes</th>
                  </tr>
                </thead>
                <tbody>
                  {skus.global.slice(0, 15).map((s, i) => (
                    <tr key={i}>
                      <td>{s.nombre || s.sku}</td>
                      <td>{s.negocio}</td>
                      <td style={{ textAlign: 'right' }} className="font-mono-num">{fmt(s.venta)}</td>
                      <td style={{ textAlign: 'right' }}>{s.clientes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

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
    </div>
  );
}