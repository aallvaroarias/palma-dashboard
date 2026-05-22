import { create } from 'zustand';
import { vendedorValido, esBodega, getCoberturaVendedor } from '../utils/formatters';

const BASE = import.meta.env.DEV
  ? 'https://script.google.com/macros/s/AKfycbxon9PiTxLibNmihjEGdRoCqYO4YdTEFes88w8Ub2YqDXfZaTPCm1Wk9L0-m-ONXSAh/exec'
  : '/api/datos';

async function fetchSheet(sheet, params = {}) {
  try {
    let url;
    if (import.meta.env.DEV) {
      // In dev, hit Apps Script directly (no proxy needed locally)
      url = `${BASE}?sheet=${sheet}`;
      if (params.desde) url += `&desde=${params.desde}`;
      if (params.hasta) url += `&hasta=${params.hasta}`;
    } else {
      url = `${BASE}?sheet=${sheet}`;
      if (params.desde) url += `&desde=${params.desde}`;
      if (params.hasta) url += `&hasta=${params.hasta}`;
    }

    const res = await fetch(url);
    const json = await res.json();

    // Apps Script wraps response in { ok, data }
    if (json && json.ok !== undefined) {
      return json.ok ? json.data : null;
    }
    // Vercel proxy returns data directly
    return json;
  } catch (e) {
    console.error('[store] Error fetching', sheet, e);
    return null;
  }
}

const useDashboardStore = create((set, get) => ({
  resumen: null,
  vendedores: [],
  cobertura: [],
  cobNegocio: [],
  efectividad: { por_semana: [], resumen_mes: [] },
  devoluciones: { total: 0, por_concepto: [], por_vendedor: [], detalle: [] },
  clientesCero: { total: 0, por_vendedor: [], detalle: [] },
  clientesNuevos: { total: 0, por_vendedor: [], por_mes: [], detalle: [], desde: null, hasta: null },
  tendencia: [],
  skus: { global: [], por_vendedor: [] },
  marcas: [],
  loading: false,
  lastUpdate: null,
  error: null,

  loadAll: async () => {
    set({ loading: true, error: null });

    try {
      const [
        resumen, vendedores, cobertura, cobNegocio,
        efectividad, devoluciones, cero, nuevos,
        tendencia, skus, marcas,
      ] = await Promise.all([
        fetchSheet('resumen'),
        fetchSheet('vendedores'),
        fetchSheet('cobertura'),
        fetchSheet('cob_negocio'),
        fetchSheet('efectividad'),
        fetchSheet('devoluciones'),
        fetchSheet('clientes_cero'),
        fetchSheet('clientes_nuevos'),
        fetchSheet('tendencia'),
        fetchSheet('skus'),
        fetchSheet('marcas'),
      ]);

      set({
        resumen: resumen || get().resumen,
        vendedores: vendedores
          ? vendedores.filter(vendedorValido)
          : get().vendedores,
        cobertura: cobertura
          ? cobertura.filter(r => !esBodega(getCoberturaVendedor(r)))
          : get().cobertura,
        cobNegocio: cobNegocio
          ? cobNegocio.filter(r => !esBodega(getCoberturaVendedor(r)))
          : get().cobNegocio,
        efectividad: efectividad || get().efectividad,
        devoluciones: devoluciones || get().devoluciones,
        clientesCero: cero || get().clientesCero,
        clientesNuevos: nuevos || get().clientesNuevos,
        tendencia: tendencia || get().tendencia,
        skus: skus || get().skus,
        marcas: marcas || get().marcas,
        loading: false,
        lastUpdate: new Date(),
      });
    } catch (e) {
      console.error('[store] loadAll error', e);
      set({ loading: false, error: 'Error cargando datos' });
    }
  },

  refetchClientes: async (desde, hasta) => {
    const params = {};
    if (desde) params.desde = desde;
    if (hasta) params.hasta = hasta;

    const nuevos = await fetchSheet('clientes_nuevos', params);
    if (nuevos) {
      set({ clientesNuevos: { ...nuevos, desde, hasta } });
    }
  },
}));

export default useDashboardStore;
