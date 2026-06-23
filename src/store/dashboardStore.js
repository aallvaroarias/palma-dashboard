import { create } from 'zustand';
import { vendedorValido, esBodega, getCoberturaVendedor } from '../utils/formatters';

// Always route through /api/datos → Vite proxy in dev, Vercel serverless in prod
const BASE       = '/api/datos';
const APPS_DIRECT = 'https://script.google.com/macros/s/AKfycbwRPhHFwnBnTadtIuH3FHapuwVjzXJr5suo-KlWxr-ReoA44VtAt1pZsf_TF2a1KIfK/exec';

function buildUrl(base, sheet, params = {}) {
  const sep = base.includes('?') ? '&' : '?';
  let url = `${base}${sep}sheet=${sheet}`;
  if (params.desde) url += `&desde=${params.desde}`;
  if (params.hasta) url += `&hasta=${params.hasta}`;
  return url;
}

function parseJson(json) {
  if (!json) return null;
  if (json.error) return null;                        // cualquier error de proxy → sin datos
  if (json.ok !== undefined) return json.ok ? json.data : null;  // wrapper Apps Script
  return json;                                         // proxy Vercel directo
}

/**
 * Pide un sheet al proxy Vercel.
 * Si el proxy devuelve 504 (sin stale cache), reintenta directo al Apps Script
 * solo para endpoints críticos (Fase 1); los diferidos simplemente devuelven null.
 */
async function fetchSheet(sheet, params = {}, { fallbackDirect = false } = {}) {
  // 1. Proxy Vercel
  try {
    const res  = await fetch(buildUrl(BASE, sheet, params));
    const json = await res.json();
    const data = parseJson(json);
    if (data !== null) return data;
    // proxy devolvió null (json.error=timeout y no había stale cache)
    if (!fallbackDirect) {
      console.warn(`[store] ${sheet} → proxy sin datos, sin fallback`);
      return null;
    }
    console.warn(`[store] ${sheet} → proxy sin datos, reintentando directo`);
  } catch (e) {
    if (!fallbackDirect) {
      console.warn(`[store] ${sheet} → proxy error (${e.message}), sin fallback`);
      return null;
    }
    console.warn(`[store] ${sheet} → proxy error (${e.message}), reintentando directo`);
  }

  // 2. Fallback directo a Apps Script (solo para fallbackDirect=true)
  try {
    const res  = await fetch(buildUrl(APPS_DIRECT, sheet, params));
    const json = await res.json();
    return parseJson(json);
  } catch (e) {
    console.error(`[store] ${sheet} → directo error: ${e.message}`);
    return null;
  }
}

// ─── Helpers de normalización para store ─────────────────────────────────────

function normalizeVendedores(raw) {
  // Soporta array directo [...] o envuelto { vendedores: [...] }
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.vendedores) ? raw.vendedores
    : [];
  return arr.filter(vendedorValido);
}
function normalizeCobertura(raw) {
  return raw ? raw.filter(r => !esBodega(getCoberturaVendedor(r))) : [];
}
function normalizeCobNegocio(raw) {
  return raw ? raw.filter(r => !esBodega(getCoberturaVendedor(r))) : [];
}

// ─── Store ───────────────────────────────────────────────────────────────────

const useDashboardStore = create((set, get) => ({
  resumen:         null,
  vendedores:      [],
  cobertura:       [],
  cobNegocio:      [],
  efectividad:     { por_semana: [], resumen_mes: [] },
  devoluciones:    { total: 0, por_concepto: [], por_vendedor: [], detalle: [] },
  clientesCero:    { total: 0, por_vendedor: [], detalle: [] },
  clientesNuevos:  { total: 0, por_vendedor: [], por_mes: [], detalle: [], desde: null, hasta: null },
  tendencia:       [],
  skus:            { global: [], por_vendedor: [] },
  marcas:          [],
  topClientes:     { top_global: [], top_por_vendedor: [], top_por_negocio: [] },
  cuotas:          [],
  cartera:         { total_pendiente: 0, total_facturas: 0, por_vendedor: [], por_tramo: [], top_clientes: [], detalle: [] },
  necesidadCliente:{ total: 0, total_clasificados: 0, por_necesidad: [] },
  dnMarcas:        [],
  coberturaMarcas: null,
  miGerencia:      null,
  config:          null,
  // ── Productos clave ──────────────────────────────────────────────────────────
  productosClaveList:   { total_catalogo: 0, total_productos_clave: 0, productos: [] },
  coberturaPC: {
    total_clientes_activos: 0, clientes_impactados_clave: 0, clientes_sin_impacto_clave: 0,
    cobertura_clave_pct: 0, venta_productos_clave: 0, unidades_productos_clave: 0,
    total_productos_clave: 0, productos_clave_vendidos: 0, productos_clave_no_vendidos: 0,
    negocios: []
  },
  coberturaVendedoresPC: [],
  clientesSinPC:  { total: 0, clientes: [] },
  pcDetalle:      { productos: [] },

  // ── Combos ───────────────────────────────────────────────────────────────
  combosResumen:         null,
  combosVendedor:        [],
  combosDetalle:         null,
  combosVendedorDetalle: null,  // desglose por vendedor+producto, cargado bajo demanda

  // Estado de carga
  loading:       false,   // Fase 1 en progreso
  loadingFase2:  false,   // Fase 2 en progreso
  pcDetalleLoading: false,
  clientesSinPCLoading: false,
  combosDetalleLoading: false,
  combosVendedorDetalleLoading: false,
  lastUpdate:         null,
  lastSuccessfulLoad: null,   // última vez que resumen cargó OK
  lastLoadError:      null,   // descripción del error cuando resumen falla
  isStale:            false,  // true = resumen no pudo actualizarse, se muestra dato anterior
  error:         null,

  // ─────────────────────────────────────────────────────────────────────────
  // loadAll — Fase 1 (crítica, bloquea loading) + Fase 2 (diferida, background)
  // ─────────────────────────────────────────────────────────────────────────
  loadAll: async () => {
    set({ loading: true, error: null });
    const t0 = Date.now();

    console.group('%c[Store] Carga dashboard', 'color:#4ade80;font-weight:bold');

    // ── FASE 1: Endpoints críticos ─────────────────────────────────────────
    // Estos datos alimentan las secciones principales del Gerencial (KPIs,
    // gráficos de negocio, metas, cobertura). Con CacheService en Apps Script
    // deberían responder en <1 s después del primer calentamiento.
    // `vendedores` está aquí (no en Fase 2) para que el selector de Mi Panel
    // esté disponible desde el primer render.
    const fase1 = [
      'resumen', 'cobertura', 'cob_negocio', 'efectividad',
      'cuotas', 'clientes_cero', 'clientes_nuevos', 'cartera',
      'productos_clave', 'cobertura_productos_clave', 'cobertura_pc_vendedor',
      'vendedores', 'config',
    ];
    console.log('▶ Fase 1 (' + fase1.length + ' endpoints):', fase1.join(', '));

    try {
      const [
        resumen, cobertura, cobNegocio, efectividad,
        cuotas, cero, nuevos, cartera,
        productosClaveRaw, coberturaPC, coberturaVendedoresRaw,
        vendedoresRaw, configData,
      ] = await Promise.all(
        fase1.map(s => fetchSheet(s, {}, { fallbackDirect: true }))
      );

      console.log('✓ Fase 1 completada en', Date.now() - t0, 'ms');

      const resumenOk = resumen !== null;
      const now = new Date();
      if (!resumenOk) {
        console.warn('[Store] resumen falló — mostrando datos anteriores como stale');
      }

      set({
        resumen:              resumenOk ? resumen : get().resumen,
        cobertura:            normalizeCobertura(cobertura),
        cobNegocio:           normalizeCobNegocio(cobNegocio),
        efectividad:          efectividad          || get().efectividad,
        cuotas:               cuotas               || get().cuotas,
        clientesCero:         cero                 || get().clientesCero,
        clientesNuevos:       nuevos               || get().clientesNuevos,
        cartera:              cartera              || get().cartera,
        productosClaveList:   productosClaveRaw    || get().productosClaveList,
        coberturaPC:          coberturaPC          || get().coberturaPC,
        coberturaVendedoresPC: coberturaVendedoresRaw?.vendedores ?? get().coberturaVendedoresPC,
        vendedores:           normalizeVendedores(vendedoresRaw),
        config:               configData           || get().config,
        loading:              false,
        lastUpdate:           now,
        isStale:              !resumenOk,
        lastSuccessfulLoad:   resumenOk ? now : get().lastSuccessfulLoad,
        lastLoadError:        resumenOk ? null
          : `No se pudo actualizar · ${now.toLocaleTimeString('es-PA', { hour: '2-digit', minute: '2-digit' })}`,
      });
    } catch (e) {
      console.error('[Store] Fase 1 error:', e);
      set({ loading: false, error: 'Error cargando datos principales' });
    }

    // ── FASE 2: Endpoints diferidos ────────────────────────────────────────
    // Se cargan en background después de que el UI ya es visible.
    // Cada uno actualiza el store individualmente cuando llega.
    // Escalonados para no saturar Apps Script simultáneamente.
    // [sheet, delay_ms, setter_fn, fallbackDirect?]
    //
    // fallbackDirect=true → si Vercel timeout, reintenta directo a Apps Script.
    // Usar SOLO para endpoints que no caben en CacheService (>100 KB) y por
    // tanto siempre serán lentos en Vercel. Al ser Fase 2 / background, la
    // espera de 20-30 s no bloquea el render.
    //
    // fallbackDirect=false (default) → si Vercel falla, queda null silencioso.
    // Usar para endpoints que SÍ son cacheados en Apps Script (<100 KB).
    const fase2 = [
      // vendedores movido a Fase 1 — selector de Mi Panel disponible desde el inicio
      ['devoluciones',      100,  d => ({ devoluciones: d }),           true],  // ~219 KB, no cacheable
      ['tendencia',         700,  d => ({ tendencia: d })],
      ['marcas',            1000, d => ({ marcas: d })],
      ['skus',              1300, d => ({ skus: d })],
      ['top_clientes',      1600, d => ({ topClientes: d })],
      ['dn_marcas',         1900, d => ({ dnMarcas: d }),           true],
      ['cobertura_marcas',  2050, d => ({ coberturaMarcas: d }),    true],
      ['necesidad_cliente', 2200, d => ({ necesidadCliente: d }),   true],
      ['mi_gerencia',       2500, d => ({ miGerencia: d }),         true],
      ['combos_resumen',    2500, d => ({ combosResumen: d })],
      ['combos_vendedor',   2800, d => ({ combosVendedor: d?.vendedores ?? [] })],
      // clientes_sin_pc movido a carga bajo demanda (loadClientesSinPC) — ~359 KB, no auto-cargar
    ];
    console.log('▶ Fase 2 (' + fase2.length + ' endpoints, diferidos):', fase2.map(f => f[0]).join(', '));

    set({ loadingFase2: true });

    let fase2Done = 0;
    fase2.forEach(([sheet, delay, setter, useFallback = false]) => {
      setTimeout(async () => {
        const ts = Date.now();
        try {
          const data = await fetchSheet(sheet, {}, { fallbackDirect: useFallback });
          if (data !== null) {
            // setter() dentro del try: si lanza por estructura inesperada,
            // queda aislado y no afecta los demás endpoints.
            const patch = setter(data);
            set(patch);
            console.log(`  ✓ Fase 2 [${sheet}] en ${Date.now() - ts} ms`);
          } else {
            console.warn(`  ✗ Fase 2 [${sheet}] sin datos (${Date.now() - ts} ms)`);
          }
        } catch (e) {
          // Error aislado: UI sigue funcionando con el estado previo del store
          console.warn(`  ✗ Fase 2 [${sheet}] error: ${e.message} (${Date.now() - ts} ms)`);
        } finally {
          fase2Done++;
          if (fase2Done === fase2.length) {
            set({ loadingFase2: false });
            console.log('✓ Fase 2 completada en', Date.now() - t0, 'ms');
            console.groupEnd();
          }
        }
      }, delay);
    });
  },

  // ─────────────────────────────────────────────────────────────────────────
  // loadVendedores — carga/recarga vendedores bajo demanda (fallback y retry)
  // ─────────────────────────────────────────────────────────────────────────
  loadVendedores: async () => {
    try {
      const data = await fetchSheet('vendedores', {}, { fallbackDirect: true });
      if (data !== null) set({ vendedores: normalizeVendedores(data) });
    } catch (e) {
      console.warn('[Store] loadVendedores error:', e.message);
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // loadPCDetalle — carga lazy de pc_detalle (solo cuando se necesita)
  // ─────────────────────────────────────────────────────────────────────────
  loadPCDetalle: async () => {
    if (get().pcDetalle?.productos?.length > 0) return; // ya cargado
    set({ pcDetalleLoading: true });
    try {
      const data = await fetchSheet('pc_detalle', {}, { fallbackDirect: false });
      if (data) set({ pcDetalle: data });
    } catch (e) {
      console.warn('[Store] loadPCDetalle error:', e.message);
    } finally {
      set({ pcDetalleLoading: false });
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // loadClientesSinPC — carga lazy de clientes_sin_pc (solo bajo demanda)
  // ─────────────────────────────────────────────────────────────────────────
  loadClientesSinPC: async () => {
    if (get().clientesSinPCLoading) return; // prevenir doble carga simultánea
    set({ clientesSinPCLoading: true });
    try {
      const data = await fetchSheet('clientes_sin_pc', {}, { fallbackDirect: true });
      if (data !== null) set({ clientesSinPC: data });
    } catch (e) {
      console.warn('[Store] loadClientesSinPC error:', e.message);
    } finally {
      set({ clientesSinPCLoading: false });
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // loadCombosDetalle — carga lazy de combos_detalle (solo bajo demanda)
  // ─────────────────────────────────────────────────────────────────────────
  loadCombosDetalle: async () => {
    if (get().combosDetalle !== null) return; // ya cargado
    if (get().combosDetalleLoading) return;   // prevenir doble carga
    set({ combosDetalleLoading: true });
    console.group('[Combos Debug] loadCombosDetalle');
    try {
      const data = await fetchSheet('combos_detalle', {}, { fallbackDirect: false });
      console.log('[Combos Debug] combos_detalle recibido:', data);
      if (data) set({ combosDetalle: data });
    } catch (e) {
      console.warn('[Combos Debug] loadCombosDetalle error:', e.message);
    } finally {
      set({ combosDetalleLoading: false });
      console.groupEnd();
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // loadCombosVendedorDetalle — desglose por vendedor+producto, solo bajo demanda
  // ─────────────────────────────────────────────────────────────────────────
  loadCombosVendedorDetalle: async () => {
    if (get().combosVendedorDetalle !== null) return;
    if (get().combosVendedorDetalleLoading) return;
    set({ combosVendedorDetalleLoading: true });
    try {
      const data = await fetchSheet('combos_vendedor_detalle', {}, { fallbackDirect: false });
      if (data) set({ combosVendedorDetalle: data });
    } catch (e) {
      console.warn('[Combos Debug] loadCombosVendedorDetalle error:', e.message);
    } finally {
      set({ combosVendedorDetalleLoading: false });
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // refetchClientes — recarga clientes_nuevos con filtro de fechas
  // ─────────────────────────────────────────────────────────────────────────
  refetchClientes: async (desde, hasta) => {
    const params = {};
    if (desde) params.desde = desde;
    if (hasta) params.hasta = hasta;

    const nuevos = await fetchSheet('clientes_nuevos', params, { fallbackDirect: false });
    if (nuevos) {
      set({ clientesNuevos: { ...nuevos, desde, hasta } });
    }
  },
}));

export default useDashboardStore;
