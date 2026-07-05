#!/usr/bin/env python3
"""
generar_incentivos.py - v6.0
Devolución calculada (meta ≤5%); negocios con cuotas (escala presupuesto);
DN Galletas Cremas calculado desde detalle_cobertura_negocio; frontend Venta Neta.
PALUMAR S.A. — Junio 2026
"""

import requests, csv, os, math, unicodedata
from collections import Counter, defaultdict
from datetime import datetime
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Table, TableStyle,
    Spacer, HRFlowable, PageBreak, Flowable,
)
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

# ── API ───────────────────────────────────────────────────────────────────
API_BASE = (
    "https://script.google.com/macros/s/"
    "AKfycbwRPhHFwnBnTadtIuH3FHapuwVjzXJr5suo-KlWxr-ReoA44VtAt1pZsf_TF2a1KIfK/exec"
)
PERIODO_LABEL = "Junio 2026"
OUTPUT_DIR    = "liquidacion_incentivos_junio_2026"
_MES = {"January":"enero","February":"febrero","March":"marzo","April":"abril",
        "May":"mayo","June":"junio","July":"julio","August":"agosto",
        "September":"septiembre","October":"octubre","November":"noviembre",
        "December":"diciembre"}
def _fecha():
    s = datetime.now().strftime("%d de %B de %Y")
    for k,v in _MES.items(): s = s.replace(k,v)
    return s
FECHA_GEN = _fecha()

# ── VBIs ─ VALORES REALES ─────────────────────────────────────────────────
# ▸ Indicadores de calidad
VBI_PRESUPUESTO        = 132.00   # era $154 — CORREGIDO
VBI_EFECTIVIDAD        = 33.00    # era $55  — CORREGIDO
VBI_DN_CAFE            = 55.00    # sin cambio
VBI_DN_JET             = 33.00    # nuevo (pendiente — sin fuente SKU Jet)
VBI_DN_GALLETAS_CREMAS = 33.00    # nuevo (pendiente — sin fuente SKU)
VBI_NUEVOS             = 22.00    # era $55  — CORREGIDO
VBI_CERO               = 33.00    # era $55  — CORREGIDO
VBI_DN_TIKYS           = 22.00    # nuevo (pendiente — sin fuente SKU Tikys)
VBI_DEVOLUCION_IND     = 22.00    # nuevo (pendiente — sin meta definida)
VBI_FOTOS              = 33.00    # nuevo (pendiente — sin fuente fotos)

# ▸ Indicadores de cantidad
VBI_EJ_CHOCOLATES = 22.00   # pendiente — sin cuota por negocio en API
VBI_EJ_GALLETAS   = 33.00   # pendiente — sin cuota por negocio en API
VBI_EJ_ZUKO       = 22.00   # pendiente — negocio Zuko no existe en API
VBI_NE_IND        = 11.00   # pendiente — sin meta definida

# ▸ Metas
META_DN_CAFE_PCT  = 40.0
META_DN_JET_PCT   = 40.0
META_DN_TIKYS_PCT = 15.0
META_NUEVOS           = 10    # era 15 — CORREGIDO
META_CERO_PCT         = 4.0   # era 2%  — CORREGIDO
META_DEVOLUCION_PCT   = 5.0   # ≤5% → $22, >5% → $0

# SKUs de Galletas Cremas (negocio 02-Galletas, marca 146-Pozuelo)
CREMAS_SKUS = {'1080669', '1007777', '1047712'}

# Indicador especial: pago = None → "Pendiente por dato fuente"
PENDIENTE_STR = "Pendiente por dato fuente"

HORECA_KEYWORDS = [
    'hotel','hoteles','restaurante','restaurant','rest.','cafetería',
    'cafeteria','café','cafe','horeca','food service','parrilla','cantina',
    'comedor','fonda','lunch','soda','bar ','taberna','marisqueria',
    'marisquería','cevicheria','cevichería','fritanga','asadero','delicias',
]

# ── COLORES ───────────────────────────────────────────────────────────────
C_TEAL        = colors.HexColor("#17A3B8")
C_TEAL_DARK   = colors.HexColor("#0D7A8F")
C_TEAL_LIGHT  = colors.HexColor("#E8F7FA")
C_RED         = colors.HexColor("#E74C3C")
C_RED_LIGHT   = colors.HexColor("#FDEDEC")
C_ORANGE      = colors.HexColor("#E67E22")
C_ORANGE_HDR  = colors.HexColor("#E67E22")
C_ORANGE_LIGHT= colors.HexColor("#FEF9E7")
C_GREEN       = colors.HexColor("#27AE60")
C_GREEN_LIGHT = colors.HexColor("#EAFAF1")
C_AMBER       = colors.HexColor("#F39C12")
C_GRIS_CELL   = colors.HexColor("#F8F9FA")
C_GRIS_LINE   = colors.HexColor("#DEE2E6")
C_TEXT_MUTED  = colors.HexColor("#6C757D")
C_TEXT_DARK   = colors.HexColor("#212529")
C_BLANCO      = colors.white


# ── PROGRESS BAR ──────────────────────────────────────────────────────────
class ProgressBar(Flowable):
    def __init__(self, pct, width, height=16, radius=3):
        Flowable.__init__(self)
        self.pct    = min(float(pct), 100)
        self.width  = width
        self.height = height
        self.radius = radius
        self.bar_color = C_GREEN if pct >= 100 else (C_AMBER if pct >= 80 else C_RED)

    def draw(self):
        c = self.canv; r = self.radius
        c.setFillColor(C_GRIS_LINE)
        c.roundRect(0, 0, self.width, self.height, r, fill=1, stroke=0)
        fill_w = max(self.width * self.pct / 100, r * 2)
        c.setFillColor(self.bar_color)
        c.roundRect(0, 0, fill_w, self.height, r, fill=1, stroke=0)

    def wrap(self, *args): return (self.width, self.height)


# ── ESCALAS ───────────────────────────────────────────────────────────────
def calc_presupuesto(pct, vbi=VBI_PRESUPUESTO):
    if pct < 80:    return 0.0, "< 80%",          "$0.00", "$0.00"
    elif pct <= 95: p = round(vbi*.60, 2); return p, "80% – 95%",    f"${vbi:.0f}×60%",      f"${p:.2f}"
    elif pct <= 99: p = round(vbi*.80, 2); return p, "95.1% – 99%",  f"${vbi:.0f}×80%",      f"${p:.2f}"
    elif pct <=105: p = round(vbi*1.05, 2);return p, "99.1% – 105%", f"${vbi:.0f}×105%",     f"${p:.2f}"
    else:
        f = min(pct, 110) / 100
        p = round(vbi * f, 2)
        return p, f"> 105% (tope 110%)", f"${vbi:.0f}×{f*100:.1f}%", f"${p:.2f}"

def calc_efectividad(pct, vbi=VBI_EFECTIVIDAD):
    if pct < 80:   return 0.0, "< 80%",     "$0.00",          "$0.00"
    elif pct < 87: p = round(vbi*.80, 2); return p, "80% – 87%", f"${vbi:.0f}×80%", f"${p:.2f}"
    elif pct < 90: p = round(vbi*.90, 2); return p, "87% – 90%", f"${vbi:.0f}×90%", f"${p:.2f}"
    else:          p = round(vbi*1.10, 2); return p, "≥ 90%",    f"${vbi:.0f}×110%", f"${p:.2f}"


# ── INDICADOR HELPER ──────────────────────────────────────────────────────
def ind(concepto, categoria, vbi, resultado, escala, pago, formula="", nota="", tipo_pendiente="sin_fuente"):
    """
    pago = float → calculado (puede ser $0 si no cumple)
    pago = None  → Pendiente (no suma al total)
    tipo_pendiente: "sin_fuente" | "sin_meta"
    """
    return {
        "concepto": concepto, "categoria": categoria,
        "vbi": vbi, "resultado": resultado, "escala": escala,
        "pago": pago, "formula": formula, "nota": nota,
        "pendiente": pago is None,
        "tipo_pendiente": tipo_pendiente if pago is None else None,
    }


def fmt_usd(v): return f"${v:,.2f}"
def fmt_pct(v): return f"{v:.1f}%"
def fmt_pago(p):
    if p is None: return PENDIENTE_STR
    return fmt_usd(p)

def clean_nombre(raw):
    import re
    return re.sub(r"^\d{3}\s*[-–]\s*", "", str(raw or "")).strip()
def slug_nombre(raw):
    import re, unicodedata
    s = unicodedata.normalize("NFD", clean_nombre(raw))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^A-Za-z0-9]+", "_", s).strip("_").upper()
def es_horeca(nombre):
    n = nombre.lower()
    for kw in HORECA_KEYWORDS:
        if kw in n: return True, kw
    return False, None

def norm_neg(s):
    """Normaliza nombre de negocio: sin tildes, minúsculas, sin prefijo numérico."""
    s = unicodedata.normalize("NFD", str(s or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.strip().lower()

def buscar_venta_neg(vn_map, keyword):
    """Busca venta en venta_neg_map por substring del nombre de negocio."""
    kw = keyword.lower()
    for key, val in vn_map.items():
        if kw in str(key).lower():
            return float(val)
    return 0.0

def calc_dn_cremas(detalle_data, fallback_universo=0):
    """Cuenta clientes únicos con venta positiva en SKUs CREMAS."""
    filas = detalle_data.get("detalle_filas", [])
    clientes = set()
    for row in filas:
        if str(row.get("cod_sku", "")) not in CREMAS_SKUS:
            continue
        if float(row.get("cant_neta", 0)) <= 0:
            continue
        clt = str(row.get("cod_cliente", ""))
        if clt:
            clientes.add(clt)
    n = len(clientes)
    uni = int((detalle_data.get("resumen") or {}).get("universo", fallback_universo))
    if uni <= 0:
        uni = int(fallback_universo)
    pct = round(n / uni * 100, 1) if uni > 0 else 0.0
    return n, uni, pct

def fetch_all_cremas(vendedores_list):
    """Fetches detalle_cobertura_negocio para cada vendedor y calcula DN Cremas."""
    print("  → Obteniendo DN Galletas Cremas (detalle_cobertura_negocio ×14)...")
    cremas_por_vend = {}
    for v in sorted(vendedores_list, key=lambda x: x["cod"]):
        cod = str(v["cod"]).zfill(3)
        mae = int(v.get("maestro", 0))
        print(f"    Vendedor {cod}...", end="", flush=True)
        try:
            t0 = datetime.now()
            data = fetch("detalle_cobertura_negocio", {"cod_asesor": cod, "negocio": "Galletas"})
            elapsed = (datetime.now() - t0).seconds
            n, uni, pct = calc_dn_cremas(data, mae)
            cremas_por_vend[cod] = {"n": n, "universo": uni, "pct": pct}
            print(f" {n}/{uni} ({pct:.1f}%) — {elapsed}s")
        except Exception as e:
            print(f" ERROR: {e}")
            cremas_por_vend[cod] = {"n": 0, "universo": mae, "pct": 0.0}
    return cremas_por_vend


# ── NOTA DE NÓMINA ────────────────────────────────────────────────────────
def nota_nomina(r):
    pct  = r["pct_cumplimiento"]
    tot  = r["total_final"]
    cuota= r["cuota"]
    venta= r["venta_neta"]
    n_pend = sum(1 for i in r["indicadores"] if i["pendiente"])
    pend_vbi = sum(i["vbi"] for i in r["indicadores"] if i["pendiente"])
    pend_note = ""
    if n_pend > 0:
        pend_note = (f" Hay {n_pend} indicador(es) con valor potencial máximo de "
                     f"{fmt_usd(pend_vbi)} pendientes "
                     f"(sin meta definida o sin fuente de datos).")

    if pct >= 100:
        extra = venta - cuota
        return (f"Excelente desempeño comercial. El vendedor supera la meta mensual "
                f"con {fmt_pct(pct)} de cumplimiento, {fmt_usd(extra)} sobre la meta. "
                f"Pago generado por indicadores y concursos según esta liquidación.{pend_note}"),C_GREEN
    elif pct >= 80:
        falta = max(0.0, cuota - venta)
        return (f"Buen resultado. Cumplimiento del {fmt_pct(pct)} sobre meta de {fmt_usd(cuota)} "
                f"(brecha de {fmt_usd(falta)}). Se generan pagos por indicadores en tramo.{pend_note}"),C_GREEN
    elif tot > 0:
        return (f"Cumplimiento del {fmt_pct(pct)} sobre meta ({fmt_usd(cuota)}). No se alcanza "
                f"el tramo de presupuesto, pero se generan pagos por concursos y algunos "
                f"indicadores de calidad.{pend_note}"), C_ORANGE
    else:
        return (f"No se generan pagos variables en este corte. Cumplimiento del "
                f"{fmt_pct(pct)} sobre meta de {fmt_usd(cuota)}. Se recomienda revisar "
                f"cobertura, venta neta y efectividad de visita.{pend_note}"), C_RED


# ── FETCH ─────────────────────────────────────────────────────────────────
def fetch(sheet, extra=None):
    p = {"sheet": sheet}
    if extra: p.update(extra)
    print(f"  → GET sheet={sheet} {extra or ''}")
    r = requests.get(API_BASE, params=p, timeout=90, allow_redirects=True)
    r.raise_for_status()
    return r.json().get("data", {})


# ── CÁLCULO PRINCIPAL ─────────────────────────────────────────────────────
def calcular_incentivos(vendedores_list, inc_map, horeca_por_vend,
                        cafe_map, nuevos_map, cob_neg_map,
                        cartera_map, venta_neg_map, marcas_por_vend,
                        cuotas_por_vend, cremas_por_vend):
    results = []
    for v in sorted(vendedores_list, key=lambda x: x["cod"]):
        cod  = str(v["cod"])
        inc  = inc_map.get(cod, {})
        mae  = int(v.get("maestro", 0))
        sc   = int(v.get("sin_compra", 0))
        pct_cum = float(v.get("pct_cumplimiento", 0))
        pct_ef  = float(v.get("efectividad", 0))

        # ── Escalas ───────────────────────────────────────────────────────
        p_ppto, tramo_ppto, f_ppto, _ = calc_presupuesto(pct_cum)
        p_ef,   tramo_ef,   f_ef,   _ = calc_efectividad(pct_ef)

        # ── DN Café Molido Sello Rojo ──────────────────────────────────────
        cafe_info  = cafe_map.get(cod, {})
        pct_cafe   = float(cafe_info.get("cobertura_", 0))
        imp_cafe   = int(cafe_info.get("impactados", 0))
        mae_cafe   = int(cafe_info.get("clientes_maestro", 0))
        if pct_cafe >= META_DN_CAFE_PCT:
            p_cafe = VBI_DN_CAFE; tramo_cafe = f"≥{META_DN_CAFE_PCT:.0f}% ✓"
        else:
            p_cafe = 0.0; tramo_cafe = f"{pct_cafe:.1f}% < {META_DN_CAFE_PCT:.0f}%"

        # ── Clientes nuevos ────────────────────────────────────────────────
        n_nuevos = int(nuevos_map.get(cod, 0))
        if n_nuevos >= META_NUEVOS:
            p_nuevos = VBI_NUEVOS; tramo_nuevos = f"≥{META_NUEVOS} ✓"
        else:
            p_nuevos = 0.0; tramo_nuevos = f"{n_nuevos} < {META_NUEVOS}"

        # ── Cliente cero ───────────────────────────────────────────────────
        pct_cero = round(sc / mae * 100, 2) if mae > 0 else 0.0
        if pct_cero <= META_CERO_PCT:
            p_cero = VBI_CERO; tramo_cero = f"≤{META_CERO_PCT:.0f}% ✓"
        else:
            p_cero = 0.0; tramo_cero = f"{pct_cero:.1f}% > {META_CERO_PCT:.0f}%"

        # ── DN Jet ────────────────────────────────────────────────────────
        _marcas_vend = marcas_por_vend.get(cod, {})
        jet_info  = _marcas_vend.get("053-JET", {})
        pct_jet   = float(jet_info.get("cobertura_pct", 0)) if jet_info else 0.0
        imp_jet   = int(jet_info.get("clientes_impactados", 0)) if jet_info else 0
        uni_jet   = int(jet_info.get("universo", 0)) if jet_info else mae
        if pct_jet >= META_DN_JET_PCT:
            p_jet = VBI_DN_JET; tramo_jet = f"≥{META_DN_JET_PCT:.0f}% ✓"
        else:
            p_jet = 0.0; tramo_jet = f"{pct_jet:.1f}% < {META_DN_JET_PCT:.0f}%"
        jet_resultado = f"{fmt_pct(pct_jet)} ({imp_jet}/{uni_jet})"

        # ── DN Tikys ──────────────────────────────────────────────────────
        tikys_info = _marcas_vend.get("083-TIKYS", {})
        pct_tikys  = float(tikys_info.get("cobertura_pct", 0)) if tikys_info else 0.0
        imp_tikys  = int(tikys_info.get("clientes_impactados", 0)) if tikys_info else 0
        uni_tikys  = int(tikys_info.get("universo", 0)) if tikys_info else mae
        if pct_tikys >= META_DN_TIKYS_PCT:
            p_tikys = VBI_DN_TIKYS; tramo_tikys = f"≥{META_DN_TIKYS_PCT:.0f}% ✓"
        else:
            p_tikys = 0.0; tramo_tikys = f"{pct_tikys:.1f}% < {META_DN_TIKYS_PCT:.0f}%"
        tikys_resultado = f"{fmt_pct(pct_tikys)} ({imp_tikys}/{uni_tikys})"

        # ── Marca Zuko (cobertura_marcas — no tiene cuota en endpoint) ───────
        zuko_info  = _marcas_vend.get("295-ZUKO", {})
        pct_zuko   = float(zuko_info.get("cobertura_pct", 0)) if zuko_info else 0.0
        imp_zuko   = int(zuko_info.get("clientes_impactados", 0)) if zuko_info else 0
        uni_zuko   = int(zuko_info.get("universo", 0)) if zuko_info else mae
        venta_zuko = float(zuko_info.get("venta", 0)) if zuko_info else 0.0
        zuko_resultado = (f"{fmt_pct(pct_zuko)} ({imp_zuko}/{uni_zuko})"
                          + (f" · {fmt_usd(venta_zuko)}" if venta_zuko > 0 else ""))

        # ── Venta por negocio (per vendor) ────────────────────────────────
        _vn = venta_neg_map.get(cod, {})
        venta_choc     = buscar_venta_neg(_vn, "hocolat")
        venta_gall_neg = buscar_venta_neg(_vn, "alleta")
        venta_ne_ind   = buscar_venta_neg(_vn, "utrici")
        venta_cafe_neg = buscar_venta_neg(_vn, "af")    # "04-CafÈ"
        venta_carn_neg = buscar_venta_neg(_vn, "arnico") # "01-Carnico"

        # ── Cuotas por negocio (endpoint cuotas, keys normalizadas) ──────────
        cuotas_vend = cuotas_por_vend.get(cod, {})

        def _calc_neg(venta, vbi, neg_key):
            """Calcula pago negocio con escala presupuesto desde cuotas."""
            meta = cuotas_vend.get(neg_key)
            if meta and meta > 0:
                cum = venta / meta * 100
                p, tramo, f, _ = calc_presupuesto(cum, vbi=vbi)
                return p, f"{fmt_usd(venta)} / {fmt_usd(meta)}", f"{fmt_pct(cum)} · {tramo}"
            return None, (fmt_usd(venta) if venta > 0 else "Sin venta"), "Meta no encontrada en cuotas"

        p_choc,   choc_resultado,  choc_escala  = _calc_neg(venta_choc,    VBI_EJ_CHOCOLATES, "chocolates")
        p_gall,   gall_resultado,  gall_escala  = _calc_neg(venta_gall_neg, VBI_EJ_GALLETAS,   "galletas")
        p_ne_ind, ne_ind_resultado, ne_ind_escala = _calc_neg(venta_ne_ind, VBI_NE_IND,        "nutricion experta")

        # Café ($0 informativo)
        meta_cafe_q = cuotas_vend.get("cafe") or cuotas_vend.get("bebidas tmluc") or 0
        if meta_cafe_q > 0:
            cum_cafe = venta_cafe_neg / meta_cafe_q * 100
            cafe_neg_resultado = f"{fmt_usd(venta_cafe_neg)} / {fmt_usd(meta_cafe_q)} ({fmt_pct(cum_cafe)})"
        else:
            cafe_neg_resultado = fmt_usd(venta_cafe_neg) if venta_cafe_neg > 0 else "Sin venta"

        # Cárnico ($0 informativo)
        meta_carn_q = cuotas_vend.get("carnico") or 0
        if meta_carn_q > 0:
            cum_carn = venta_carn_neg / meta_carn_q * 100
            carn_neg_resultado = f"{fmt_usd(venta_carn_neg)} / {fmt_usd(meta_carn_q)} ({fmt_pct(cum_carn)})"
        else:
            carn_neg_resultado = fmt_usd(venta_carn_neg) if venta_carn_neg > 0 else "Sin venta"

        # ── Devolución (meta ≤5%) ─────────────────────────────────────────
        pct_devol = float(v.get("pct_devolucion", 0))
        if pct_devol <= META_DEVOLUCION_PCT:
            p_devol = VBI_DEVOLUCION_IND; tramo_devol = f"≤{META_DEVOLUCION_PCT:.0f}% ✓"
        else:
            p_devol = 0.0; tramo_devol = f"{fmt_pct(pct_devol)} > {META_DEVOLUCION_PCT:.0f}%"

        # ── DN Galletas Cremas (calculado desde detalle_cobertura_negocio) ──
        cremas_data    = cremas_por_vend.get(cod, {})
        n_cremas       = cremas_data.get("n", 0)
        uni_cremas     = cremas_data.get("universo", mae)
        pct_cremas     = cremas_data.get("pct", 0.0)
        cremas_resultado = f"{fmt_pct(pct_cremas)} ({n_cremas}/{uni_cremas})"

        # ── Concursos ──────────────────────────────────────────────────────
        tosh_n    = int(inc.get("clientes_tosh_impactados", 0))
        tosh_pago = float(math.floor(tosh_n / 20) * 10)
        ne_venta  = float(inc.get("venta_nutricion_experta", 0))
        ne_pago   = 20.0 if ne_venta >= 200.0 else 0.0
        horeca_list = horeca_por_vend.get(cod, [])
        horeca_pago = float(len(horeca_list))

        # ── Lista de indicadores completa (v6.0) ─────────────────────────
        indicadores = [
            # CALIDAD
            ind("Presupuesto / Total negocio", "calidad",
                VBI_PRESUPUESTO, fmt_pct(pct_cum), tramo_ppto, p_ppto, f_ppto),
            ind("Efectividad de visitas", "calidad",
                VBI_EFECTIVIDAD, fmt_pct(pct_ef), tramo_ef, p_ef, f_ef),
            ind("DN Café Molido Sello Rojo", "calidad",
                VBI_DN_CAFE,
                f"{fmt_pct(pct_cafe)} ({imp_cafe}/{mae_cafe})",
                f"≥{META_DN_CAFE_PCT:.0f}% maestra",
                p_cafe),
            ind("DN Jet (Chocolates Jet)", "calidad",
                VBI_DN_JET, jet_resultado,
                f"≥{META_DN_JET_PCT:.0f}% maestra",
                p_jet, tramo_jet),
            ind("DN Galletas Cremas ×6", "calidad",
                VBI_DN_GALLETAS_CREMAS,
                cremas_resultado,
                "Meta pendiente de confirmar",
                None,
                nota="Resultado calculado desde detalle Galletas; meta de pago sin definir",
                tipo_pendiente="sin_meta"),
            ind("Clientes nuevos con pedido", "calidad",
                VBI_NUEVOS, f"{n_nuevos} clientes", f"≥{META_NUEVOS} clientes", p_nuevos),
            ind("Cliente cero", "calidad",
                VBI_CERO, f"{fmt_pct(pct_cero)} ({sc}/{mae})",
                f"≤{META_CERO_PCT:.0f}% de maestra", p_cero),
            ind("DN Tikys", "calidad",
                VBI_DN_TIKYS, tikys_resultado,
                f"≥{META_DN_TIKYS_PCT:.0f}% maestra",
                p_tikys, tramo_tikys),
            ind("Devolución (meta ≤5%)", "calidad",
                VBI_DEVOLUCION_IND, fmt_pct(pct_devol), tramo_devol, p_devol),
            ind("Ejecución de fotos", "calidad",
                VBI_FOTOS, "Sin fuente", "Meta en fuente", None,
                nota="No existe fuente de datos de fotos en API"),
            # CANTIDAD
            ind("Ejecución negocio Chocolates", "cantidad",
                VBI_EJ_CHOCOLATES, choc_resultado, choc_escala, p_choc,
                nota="" if p_choc is not None else "Meta no encontrada en cuotas",
                tipo_pendiente="sin_fuente"),
            ind("Ejecución negocio Galletas", "cantidad",
                VBI_EJ_GALLETAS, gall_resultado, gall_escala, p_gall,
                nota="" if p_gall is not None else "Meta no encontrada en cuotas",
                tipo_pendiente="sin_fuente"),
            ind("Ejecución negocio Zuko", "cantidad",
                VBI_EJ_ZUKO,
                zuko_resultado if zuko_resultado else "Sin datos marca Zuko",
                "Meta no en cuotas",
                None,
                nota="Negocio Zuko no existe en endpoint cuotas",
                tipo_pendiente="sin_fuente"),
            ind("Ejecución negocio Café", "cantidad",
                0, cafe_neg_resultado, "VBI $0 — informativo", 0.0),
            ind("Ejecución negocio Cárnico", "cantidad",
                0, carn_neg_resultado, "VBI $0 — informativo", 0.0),
            ind("Nutrición Experta (indicador)", "cantidad",
                VBI_NE_IND, ne_ind_resultado, ne_ind_escala, p_ne_ind,
                nota="" if p_ne_ind is not None else "Meta no encontrada en cuotas",
                tipo_pendiente="sin_fuente"),
            # CONCURSOS
            ind("Barras TOSH (×20 clientes)", "concurso",
                0, f"{tosh_n} clientes ({math.floor(tosh_n/20)} bloq. de 20)",
                "$10 / bloque de 20", tosh_pago),
            ind("Nutrición Experta (concurso)", "concurso",
                0, fmt_usd(ne_venta), "≥$200 → $20", ne_pago),
            ind("Clientes nuevos HORECA", "concurso",
                0, f"{len(horeca_list)} cliente(s) con venta",
                "$1 / cliente HORECA", horeca_pago),
        ]

        # ── Totales ────────────────────────────────────────────────────────
        total_ind  = sum(i["pago"] for i in indicadores
                         if not i["pendiente"] and i["categoria"] != "concurso")
        total_con  = sum(i["pago"] for i in indicadores if i["categoria"] == "concurso")
        total_fin  = total_ind + total_con
        pot_pend   = sum(i["vbi"] for i in indicadores
                         if i["pendiente"] and i["categoria"] != "concurso")
        n_pend     = sum(1 for i in indicadores if i["pendiente"])

        # ── Cobertura por negocio ─────────────────────────────────────────
        cob_rows = sorted(cob_neg_map.get(cod, []),
                          key=lambda x: float(x.get("cobertura_", 0)), reverse=True)
        vn_map   = venta_neg_map.get(cod, {})
        cob_negocios = [{
            "negocio":    row.get("negocio",""),
            "maestro":    int(row.get("clientes_maestro",0)),
            "impactados": int(row.get("impactados",0)),
            "cobertura":  float(row.get("cobertura_",0)),
            "venta":      float(vn_map.get(row.get("negocio",""),0)),
        } for row in cob_rows]

        # ── Cartera ────────────────────────────────────────────────────────
        crt = cartera_map.get(cod, {})

        results.append({
            "cod":          cod,
            "nombre":       v.get("nombre",""),
            "nombre_limpio": clean_nombre(v.get("nombre","")),
            # Ventas
            "venta_bruta":     float(v.get("venta_bruta",0)),
            "venta_neta":      float(v.get("venta_neta",0)),
            "devol":           float(v.get("devolucion_total",0)),
            "pct_devolucion":  float(v.get("pct_devolucion",0)),
            "averia_total":    float(v.get("averia_total",0)),
            "pct_averia":      float(v.get("pct_averia",0)),
            "cuota":           float(v.get("cuota",0)),
            "pct_cumplimiento":pct_cum,
            # Cobertura
            "maestro":    mae,
            "impactados": int(v.get("impactados",0)),
            "cobertura":  float(v.get("cobertura",0)),
            "sin_compra": sc,
            "pct_ef":     pct_ef,
            # Coberturas
            "cob_negocios":   cob_negocios,
            # Cartera
            "cartera_total":      float(crt.get("total",0)),
            "cartera_facturas":   int(crt.get("facturas",0)),
            "cartera_pct_equipo": float(crt.get("pct_equipo",0)),
            # Indicadores (lista completa)
            "indicadores":   indicadores,
            "total_indicadores": total_ind,
            "total_concursos":   total_con,
            "total_final":       total_fin,
            "potencial_pendiente": pot_pend,
            "n_pendiente":       n_pend,
            # Quick lookups for CSV
            "p_ppto": p_ppto, "p_ef": p_ef, "p_cafe": p_cafe,
            "p_nuevos": p_nuevos, "p_cero": p_cero,
            "tosh_n": tosh_n, "tosh_pago": tosh_pago,
            "ne_venta": ne_venta, "ne_pago": ne_pago,
            "horeca_list": horeca_list, "horeca_pago": horeca_pago,
            "pct_cafe": pct_cafe, "imp_cafe": imp_cafe, "mae_cafe": mae_cafe,
            "n_nuevos": n_nuevos, "pct_cero": pct_cero,
            "tramo_ppto": tramo_ppto, "tramo_ef": tramo_ef,
            "tosh_skus": inc.get("tosh_skus_vendidos",[]),
            # DN Jet / Tikys (calculados)
            "p_jet": p_jet, "pct_jet": pct_jet, "imp_jet": imp_jet, "uni_jet": uni_jet,
            "p_tikys": p_tikys, "pct_tikys": pct_tikys, "imp_tikys": imp_tikys, "uni_tikys": uni_tikys,
            # Zuko marca
            "pct_zuko": pct_zuko, "imp_zuko": imp_zuko, "uni_zuko": uni_zuko, "venta_zuko": venta_zuko,
            # Negocios venta + cuotas (v6.0)
            "venta_choc": venta_choc, "venta_gall_neg": venta_gall_neg, "venta_ne_ind": venta_ne_ind,
            "venta_cafe_neg": venta_cafe_neg, "venta_carn_neg": venta_carn_neg,
            "p_choc": p_choc or 0.0, "p_gall": p_gall or 0.0, "p_ne_ind": p_ne_ind or 0.0,
            "meta_choc": cuotas_vend.get("chocolates") or 0.0,
            "meta_gall": cuotas_vend.get("galletas") or 0.0,
            "meta_ne":   cuotas_vend.get("nutricion experta") or 0.0,
            # Devolución (v6.0)
            "p_devol": p_devol, "pct_devol": pct_devol, "tramo_devol": tramo_devol,
            # DN Cremas (v6.0)
            "n_cremas": n_cremas, "uni_cremas": uni_cremas, "pct_cremas": pct_cremas,
        })
    return results


# ── ESTILOS ───────────────────────────────────────────────────────────────
def make_styles():
    def ps(name, **kw):
        return ParagraphStyle(name, parent=getSampleStyleSheet()["Normal"], **kw)
    return {
        "brand":     ps("brand",   fontName="Helvetica-Bold", fontSize=11,
                        textColor=C_TEXT_DARK, leading=14),
        "title":     ps("title",   fontName="Helvetica-Bold", fontSize=22,
                        textColor=C_TEXT_DARK, leading=26),
        "vendor_name": ps("vname", fontName="Helvetica-Bold", fontSize=13,
                          textColor=C_TEAL, leading=17),
        "sec":       ps("sec",     fontName="Helvetica-Bold", fontSize=9,
                        textColor=C_TEAL, leading=12),
        "sec_sub":   ps("secsub",  fontName="Helvetica-Bold", fontSize=8,
                        textColor=C_TEXT_MUTED, leading=11),
        "kpi_val":   ps("kv",      fontName="Helvetica-Bold", fontSize=18,
                        alignment=TA_CENTER, leading=22),
        "kpi_lbl":   ps("kl",      fontName="Helvetica", fontSize=8,
                        textColor=C_TEXT_MUTED, alignment=TA_CENTER, leading=11),
        "body":      ps("body",    fontName="Helvetica", fontSize=9,
                        textColor=C_TEXT_DARK, leading=13),
        "body_b":    ps("bodyb",   fontName="Helvetica-Bold", fontSize=9,
                        textColor=C_TEXT_DARK, leading=13),
        "muted":     ps("muted",   fontName="Helvetica", fontSize=8,
                        textColor=C_TEXT_MUTED, leading=11),
        "cob_th":    ps("cobth",   fontName="Helvetica-Bold", fontSize=9,
                        textColor=C_BLANCO, alignment=TA_CENTER, leading=12),
        "cob_td":    ps("cobtd",   fontName="Helvetica", fontSize=9,
                        textColor=C_TEXT_DARK, leading=12),
        "liq_th":    ps("liqth",   fontName="Helvetica-Bold", fontSize=8,
                        textColor=C_BLANCO, alignment=TA_CENTER, leading=11),
        "liq_td":    ps("liqtd",   fontName="Helvetica", fontSize=8,
                        textColor=C_TEXT_DARK, leading=11),
        "liq_td_c":  ps("liqtdc",  fontName="Helvetica", fontSize=8,
                        textColor=C_TEXT_DARK, alignment=TA_CENTER, leading=11),
        "liq_pago_ok": ps("lpo",   fontName="Helvetica-Bold", fontSize=9,
                          textColor=C_GREEN, alignment=TA_CENTER, leading=12),
        "liq_pago_no": ps("lpn",   fontName="Helvetica", fontSize=8,
                          textColor=C_TEXT_MUTED, alignment=TA_CENTER, leading=11),
        "liq_pend":  ps("lpe",     fontName="Helvetica-Oblique", fontSize=8,
                        textColor=C_ORANGE, alignment=TA_CENTER, leading=11),
        "liq_cat":   ps("lcat",    fontName="Helvetica-BoldOblique", fontSize=8,
                        textColor=C_TEXT_MUTED, leading=11),
        "total_lbl": ps("tlbl",    fontName="Helvetica-Bold", fontSize=12,
                        textColor=C_TEXT_DARK, leading=16),
        "total_val": ps("tval",    fontName="Helvetica-Bold", fontSize=20,
                        textColor=C_TEAL, alignment=TA_RIGHT, leading=24),
        "nota":      ps("nota",    fontName="Helvetica-Bold", fontSize=10, leading=15),
        "footer":    ps("footer",  fontName="Helvetica", fontSize=7,
                        textColor=C_TEXT_MUTED, alignment=TA_CENTER, leading=10),
        "cons_th":   ps("cth",     fontName="Helvetica-Bold", fontSize=6.5,
                        textColor=C_BLANCO, alignment=TA_CENTER, leading=9),
        "cons_td":   ps("ctd",     fontName="Helvetica", fontSize=7.5,
                        textColor=C_TEXT_DARK, leading=9),
        "cons_num":  ps("cnum",    fontName="Helvetica-Bold", fontSize=7.5,
                        textColor=C_TEAL, alignment=TA_RIGHT, leading=9),
        "cons_zero": ps("czero",   fontName="Helvetica", fontSize=7,
                        textColor=C_TEXT_MUTED, alignment=TA_RIGHT, leading=9),
        "cons_pend": ps("cpend",   fontName="Helvetica-Oblique", fontSize=7,
                        textColor=C_ORANGE, alignment=TA_CENTER, leading=9),
    }


# ── HELPERS ───────────────────────────────────────────────────────────────
def _sec_header(text, styles, color=None):
    c = color or C_TEAL
    st = ParagraphStyle("sh2", parent=styles["sec"], textColor=c)
    return [Paragraph(text, st),
            HRFlowable(width="100%", thickness=1.2, color=c, spaceBefore=2, spaceAfter=8)]


def _kpi_card(value_str, label, val_color, W_card, styles):
    vp = ParagraphStyle("kv2", parent=styles["kpi_val"], textColor=val_color)
    t  = Table([[Paragraph(value_str, vp)],[Paragraph(label, styles["kpi_lbl"])]],
               colWidths=[W_card - 6])
    t.setStyle(TableStyle([
        ("BOX",          (0,0),(-1,-1), 0.75, C_GRIS_LINE),
        ("BACKGROUND",   (0,0),(-1,-1), C_BLANCO),
        ("TOPPADDING",   (0,0),(-1,-1), 10),
        ("BOTTOMPADDING",(0,0),(-1,-1), 10),
        ("LEFTPADDING",  (0,0),(-1,-1), 4),
        ("RIGHTPADDING", (0,0),(-1,-1), 4),
    ]))
    return t


def _liq_row(i, styles):
    """Render a single indicator row based on its pendiente/pago state."""
    is_pend = i["pendiente"]
    pago    = i["pago"]
    is_ok   = (not is_pend) and pago is not None and pago > 0

    if is_pend:
        if i.get("tipo_pendiente") == "sin_meta":
            pend_text = "Pend. — sin meta"
        else:
            pend_text = "Pend. — sin fuente"
        pago_p   = Paragraph(pend_text, styles["liq_pend"])
        row_bg   = C_ORANGE_LIGHT
    elif is_ok:
        pago_p   = Paragraph(fmt_usd(pago), styles["liq_pago_ok"])
        row_bg   = None
    else:
        pago_p   = Paragraph(fmt_usd(pago or 0), styles["liq_pago_no"])
        row_bg   = None

    nota_p = Paragraph(i["nota"][:60] if i["nota"] else "", styles["muted"])
    return (row_bg, [
        Paragraph(f"<b>{i['concepto']}</b>", styles["liq_td"]),
        Paragraph(i["resultado"],             styles["liq_td_c"]),
        Paragraph(i["escala"],                styles["liq_td"]),
        Paragraph(fmt_usd(i["vbi"]) if i["vbi"] > 0 else "—", styles["liq_td_c"]),
        pago_p,
        nota_p,
    ])


def _mini_header(cod, nombre_limpio, styles, W):
    """Repeated small header for pages 2 and 3."""
    elems = [
        Paragraph("PALMA · Distribuciones Palumar S.A.", styles["brand"]),
        HRFlowable(width=W, thickness=1.5, color=C_TEAL, spaceBefore=2, spaceAfter=6),
        Paragraph(f"{cod} — {nombre_limpio} · {PERIODO_LABEL}", styles["vendor_name"]),
        Spacer(1, 0.4*cm),
    ]
    return elems


# ── PDF INDIVIDUAL ────────────────────────────────────────────────────────
def build_pdf_individual(r, styles, out):
    doc = SimpleDocTemplate(
        out, pagesize=A4,
        topMargin=1.5*cm, bottomMargin=1.5*cm,
        leftMargin=2.0*cm, rightMargin=2.0*cm,
    )
    W = A4[0] - 4.0*cm
    story = []

    pct_cum = r["pct_cumplimiento"]
    pct_ef  = r["pct_ef"]
    cum_color = C_GREEN if pct_cum >= 100 else (C_AMBER if pct_cum >= 80 else C_RED)
    cob_color = C_GREEN if r["cobertura"] >= 85 else (C_AMBER if r["cobertura"] >= 70 else C_RED)
    dev_color = C_RED if r["pct_devolucion"] > 8 else C_ORANGE
    ef_color  = C_GREEN if pct_ef >= 90 else (C_AMBER if pct_ef >= 80 else C_RED)

    # ── Encabezado ─────────────────────────────────────────────────────
    story.append(Paragraph("PALMA · Distribuciones Palumar S.A.", styles["brand"]))
    story.append(HRFlowable(width=W, thickness=1.5, color=C_TEAL, spaceBefore=4, spaceAfter=10))
    story.append(Paragraph(f"Reporte Individual · {PERIODO_LABEL}", styles["title"]))
    story.append(Spacer(1,3))
    story.append(Paragraph(f"{r['cod']} — {r['nombre_limpio']}", styles["vendor_name"]))
    story.append(Spacer(1, 0.5*cm))

    # ── KPIs ───────────────────────────────────────────────────────────
    for e in _sec_header("RESUMEN DE VENTAS", styles):
        story.append(e)
    W_card = (W - 18) / 4
    kpi_row1 = [
        _kpi_card(fmt_usd(r["venta_bruta"]),   "Venta Bruta",       C_TEAL,    W_card, styles),
        _kpi_card(fmt_usd(r["devol"]),          "Devoluciones",      C_RED,     W_card, styles),
        _kpi_card(fmt_pct(r["pct_devolucion"]), "% Devolución",      dev_color, W_card, styles),
        _kpi_card(fmt_usd(r["venta_neta"]),     "Venta Neta",        C_TEAL,    W_card, styles),
    ]
    kpi_row2 = [
        _kpi_card(fmt_pct(r["cobertura"]),      "Cobertura",         cob_color, W_card, styles),
        _kpi_card(f"{r['impactados']}/{r['maestro']}", "Clientes",   C_TEAL,    W_card, styles),
        _kpi_card(fmt_usd(r["cuota"]),          "Meta Mensual",      C_TEAL,    W_card, styles),
        _kpi_card(fmt_pct(pct_cum),             "Cumpl. de Meta",    cum_color, W_card, styles),
    ]
    kpi_t = Table([kpi_row1, kpi_row2], colWidths=[W_card]*4)
    kpi_t.setStyle(TableStyle([
        ("TOPPADDING",    (0,0),(-1,-1), 4),
        ("BOTTOMPADDING", (0,0),(-1,-1), 4),
        ("LEFTPADDING",   (0,0),(-1,-1), 3),
        ("RIGHTPADDING",  (0,0),(-1,-1), 3),
    ]))
    story.append(kpi_t)
    story.append(Spacer(1, 0.5*cm))

    # ── Progreso ────────────────────────────────────────────────────────
    for e in _sec_header("PROGRESO VS META", styles):
        story.append(e)
    story.append(ProgressBar(pct_cum, W, height=18))
    story.append(Spacer(1,4))
    if pct_cum >= 100:
        brecha = r["venta_neta"] - r["cuota"]
        ptxt = (f"<b>{fmt_pct(pct_cum)}</b> logrado — "
                f"Superó la meta en <b>{fmt_usd(brecha)}</b>")
        pclr = C_GREEN
    else:
        falta = max(0, r["cuota"] - r["venta_neta"])
        ptxt = (f"<b>{fmt_pct(pct_cum)}</b> logrado — "
                f"Faltan <b>{fmt_usd(falta)}</b> para la meta")
        pclr = C_RED if pct_cum < 80 else C_AMBER
    story.append(Paragraph(ptxt, ParagraphStyle("pr", parent=styles["body"], textColor=pclr)))
    story.append(Spacer(1, 0.5*cm))

    # ── Detalle Financiero ──────────────────────────────────────────────
    for e in _sec_header("DETALLE FINANCIERO", styles):
        story.append(e)
    det_rows = [
        [Paragraph("Venta Bruta del mes",   styles["body"]),
         Paragraph(fmt_usd(r["venta_bruta"]),styles["body"]), Paragraph("", styles["body"])],
        [Paragraph("(-) Devoluciones",       styles["body"]),
         Paragraph(fmt_usd(r["devol"]),
                   ParagraphStyle("dv",parent=styles["body"],textColor=C_RED)),
         Paragraph(f"({fmt_pct(r['pct_devolucion'])})", styles["muted"])],
    ]
    if r["averia_total"] > 0:
        det_rows.append([
            Paragraph("(-) Averías",          styles["body"]),
            Paragraph(fmt_usd(r["averia_total"]),
                      ParagraphStyle("av",parent=styles["body"],textColor=C_RED)),
            Paragraph(f"({fmt_pct(r['pct_averia'])})", styles["muted"]),
        ])
    det_rows += [
        [Paragraph("= Venta Neta",           styles["body_b"]),
         Paragraph(fmt_usd(r["venta_neta"]),
                   ParagraphStyle("vn",parent=styles["body_b"],textColor=C_TEAL)), Paragraph("",styles["body"])],
        [Paragraph("Meta asignada",          styles["body"]),
         Paragraph(fmt_usd(r["cuota"]),      styles["body"]), Paragraph("",styles["body"])],
        [Paragraph("% Cumplimiento",         styles["body"]),
         Paragraph(fmt_pct(pct_cum),
                   ParagraphStyle("pc",parent=styles["body_b"],textColor=cum_color)), Paragraph("",styles["body"])],
        [Paragraph("Cobertura",              styles["body"]),
         Paragraph(fmt_pct(r["cobertura"]),
                   ParagraphStyle("cv",parent=styles["body_b"],textColor=cob_color)),
         Paragraph(f"{r['impactados']} de {r['maestro']} clientes", styles["muted"])],
        [Paragraph("Efectividad de visita",  styles["body"]),
         Paragraph(fmt_pct(pct_ef),
                   ParagraphStyle("ef",parent=styles["body_b"],textColor=ef_color)), Paragraph("",styles["body"])],
    ]
    det_tbl = Table(det_rows, colWidths=[W*0.48, W*0.28, W*0.24])
    det_tbl.setStyle(TableStyle([
        ("BOX",          (0,0),(-1,-1), 0.5, C_GRIS_LINE),
        ("INNERGRID",    (0,0),(-1,-1), 0.3, C_GRIS_LINE),
        ("TOPPADDING",   (0,0),(-1,-1), 5),("BOTTOMPADDING",(0,0),(-1,-1), 5),
        ("LEFTPADDING",  (0,0),(-1,-1),10),("RIGHTPADDING", (0,0),(-1,-1),10),
        *[("BACKGROUND",(0,i),(-1,i), C_GRIS_CELL if i%2==0 else C_BLANCO)
          for i in range(len(det_rows))],
    ]))
    story.append(det_tbl)
    story.append(Spacer(1, 0.5*cm))

    # ── Cartera ─────────────────────────────────────────────────────────
    for e in _sec_header("CARTERA PENDIENTE (CXC)", styles):
        story.append(e)
    if r["cartera_total"] > 0:
        crt_rows = [
            [Paragraph("Total pendiente de cobro",    styles["body"]),
             Paragraph(fmt_usd(r["cartera_total"]),
                       ParagraphStyle("ct",parent=styles["body_b"],textColor=C_RED))],
            [Paragraph("Número de facturas abiertas", styles["body"]),
             Paragraph(str(r["cartera_facturas"]),    styles["body"])],
            [Paragraph("% sobre cartera total equipo",styles["body"]),
             Paragraph(fmt_pct(r["cartera_pct_equipo"]),styles["body"])],
        ]
    else:
        crt_rows = [[Paragraph("Cartera pendiente", styles["body"]),
                     Paragraph("$0.00 — Sin saldo pendiente", styles["body"])]]
    crt_tbl = Table(crt_rows, colWidths=[W*0.55, W*0.45])
    crt_tbl.setStyle(TableStyle([
        ("BOX",          (0,0),(-1,-1), 0.5, C_GRIS_LINE),
        ("INNERGRID",    (0,0),(-1,-1), 0.3, C_GRIS_LINE),
        ("TOPPADDING",   (0,0),(-1,-1), 5),("BOTTOMPADDING",(0,0),(-1,-1), 5),
        ("LEFTPADDING",  (0,0),(-1,-1),10),("RIGHTPADDING", (0,0),(-1,-1),10),
        *[("BACKGROUND",(0,i),(-1,i), C_GRIS_CELL if i%2==0 else C_BLANCO)
          for i in range(len(crt_rows))],
    ]))
    story.append(crt_tbl)

    # ── PÁG. 2: COBERTURA + NOTA ────────────────────────────────────────
    story.append(PageBreak())
    for e in _mini_header(r["cod"], r["nombre_limpio"], styles, W):
        story.append(e)
    for e in _sec_header("COBERTURA POR NEGOCIO", styles):
        story.append(e)

    cob_data = [[Paragraph(h, styles["cob_th"]) for h in
                 ["Negocio","Maestro","Impactados","Cobertura","Venta Neta"]]]
    for row in r["cob_negocios"]:
        cob = row["cobertura"]
        cc  = C_GREEN if cob >= 70 else (C_AMBER if cob >= 40 else C_RED)
        cob_data.append([
            Paragraph(row["negocio"], styles["cob_td"]),
            Paragraph(str(row["maestro"]),
                      ParagraphStyle("cm",parent=styles["cob_td"],alignment=TA_CENTER,textColor=C_TEXT_MUTED)),
            Paragraph(str(row["impactados"]),
                      ParagraphStyle("ci",parent=styles["cob_td"],alignment=TA_CENTER)),
            Paragraph(fmt_pct(cob),
                      ParagraphStyle("cc",parent=styles["cob_td"],textColor=cc,
                                     fontName="Helvetica-Bold",alignment=TA_CENTER)),
            Paragraph(fmt_usd(row["venta"]) if row["venta"] else "—",
                      ParagraphStyle("cv",parent=styles["cob_td"],alignment=TA_RIGHT)),
        ])
    if not r["cob_negocios"]:
        _e = Paragraph("", styles["body"])
        cob_data.append([Paragraph("Sin datos de cobertura",styles["body"]),_e,_e,_e,_e])
    n_cob = len(cob_data)
    cob_tbl = Table(cob_data, colWidths=[W*0.38, W*0.12, W*0.14, W*0.14, W*0.22],
                    repeatRows=1)
    cob_tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0,0),(-1,0), C_ORANGE_HDR),
        ("BOX",          (0,0),(-1,-1), 0.5, C_GRIS_LINE),
        ("INNERGRID",    (0,0),(-1,-1), 0.3, C_GRIS_LINE),
        ("TOPPADDING",   (0,0),(-1,-1), 5),("BOTTOMPADDING",(0,0),(-1,-1), 5),
        ("LEFTPADDING",  (0,0),(-1,-1), 8),("RIGHTPADDING", (0,0),(-1,-1), 8),
        ("VALIGN",       (0,0),(-1,-1), "MIDDLE"),
        *[("BACKGROUND",(0,i),(-1,i), C_GRIS_CELL if i%2==0 else C_BLANCO)
          for i in range(1, n_cob)],
    ]))
    story.append(cob_tbl)
    story.append(Spacer(1, 0.7*cm))

    # Nota de nómina
    for e in _sec_header("NOTA DE NÓMINA", styles):
        story.append(e)
    nota_txt, nota_clr = nota_nomina(r)
    nota_tbl = Table([[Paragraph(nota_txt,
                                  ParagraphStyle("nm",parent=styles["nota"],textColor=nota_clr))]],
                     colWidths=[W])
    nota_tbl.setStyle(TableStyle([
        ("BOX",          (0,0),(-1,-1), 1.2, nota_clr),
        ("BACKGROUND",   (0,0),(-1,-1), C_BLANCO),
        ("TOPPADDING",   (0,0),(-1,-1),12),("BOTTOMPADDING",(0,0),(-1,-1),12),
        ("LEFTPADDING",  (0,0),(-1,-1),14),("RIGHTPADDING", (0,0),(-1,-1),14),
    ]))
    story.append(nota_tbl)

    # ── PÁG. 3: LIQUIDACIÓN ────────────────────────────────────────────────
    story.append(PageBreak())
    for e in _mini_header(r["cod"], r["nombre_limpio"], styles, W):
        story.append(e)
    for e in _sec_header(f"LIQUIDACIÓN DE INCENTIVOS — {PERIODO_LABEL.upper()}", styles):
        story.append(e)

    # Leyenda
    story.append(Paragraph(
        "Fondo <font color='#E67E22'>naranja</font> = Pendiente por dato fuente. "
        "No suma al total hasta que exista fuente de datos.",
        ParagraphStyle("ley", parent=styles["muted"], leftIndent=4, spaceAfter=6)))

    liq_hdr = [Paragraph(t, styles["liq_th"]) for t in
               ["Concepto","Resultado","Escala / Regla","VBI","Pago","Observación"]]
    col_w = [W*.27, W*.15, W*.20, W*.07, W*.12, W*.19]

    def _cat_sep(label, color):
        _e = Paragraph("", styles["liq_td"])
        return [
            Paragraph(f"<b>{label}</b>",
                      ParagraphStyle("cs", parent=styles["liq_cat"], textColor=color)),
            _e, _e, _e, _e, _e,
        ]

    # Build rows per category
    liq_rows = [liq_hdr]
    total_cols  = 0   # track row indices for background

    sections = [("calidad", "INDICADORES DE CALIDAD", C_TEAL_DARK),
                ("cantidad","INDICADORES DE CANTIDAD", C_TEAL),
                ("concurso","CONCURSOS ADICIONALES",   C_ORANGE)]

    row_idx   = 1
    sep_idxs  = {}
    row_bgs   = {}  # row_idx -> color

    for cat, label, color in sections:
        cat_inds = [i for i in r["indicadores"] if i["categoria"] == cat]
        if not cat_inds:
            continue
        sep_idxs[row_idx] = color
        liq_rows.append(_cat_sep(label, color))
        row_idx += 1
        for i in cat_inds:
            bg, row = _liq_row(i, styles)
            liq_rows.append(row)
            if bg: row_bgs[row_idx] = bg
            row_idx += 1

    n_liq = len(liq_rows)
    liq_tbl = Table(liq_rows, colWidths=col_w, repeatRows=1)
    style_cmds = [
        ("BACKGROUND",   (0,0),(-1,0), C_TEAL_DARK),
        ("BOX",          (0,0),(-1,-1), 0.5, C_GRIS_LINE),
        ("INNERGRID",    (0,0),(-1,-1), 0.3, C_GRIS_LINE),
        ("TOPPADDING",   (0,0),(-1,-1), 4),("BOTTOMPADDING",(0,0),(-1,-1), 4),
        ("LEFTPADDING",  (0,0),(-1,-1), 6),("RIGHTPADDING", (0,0),(-1,-1), 6),
        ("VALIGN",       (0,0),(-1,-1), "MIDDLE"),
    ]
    for ri, color in sep_idxs.items():
        bg = C_TEAL_LIGHT if color != C_ORANGE else C_ORANGE_LIGHT
        style_cmds.append(("BACKGROUND", (0,ri),(-1,ri), bg))
    for ri, bg in row_bgs.items():
        style_cmds.append(("BACKGROUND", (0,ri),(-1,ri), bg))
    for i in range(1, n_liq):
        if i not in sep_idxs and i not in row_bgs:
            bg = C_GRIS_CELL if i % 2 == 0 else C_BLANCO
            style_cmds.append(("BACKGROUND", (0,i),(-1,i), bg))
    liq_tbl.setStyle(TableStyle(style_cmds))
    story.append(liq_tbl)
    story.append(Spacer(1, 0.4*cm))

    # Totales resumen
    sub_data = [
        [Paragraph("Indicadores de calidad y cantidad calculados:", styles["body"]),
         Paragraph(fmt_usd(r["total_indicadores"]),
                   ParagraphStyle("si",parent=styles["body_b"],textColor=C_TEAL,alignment=TA_RIGHT))],
        [Paragraph("Concursos adicionales:", styles["body"]),
         Paragraph(fmt_usd(r["total_concursos"]),
                   ParagraphStyle("sc",parent=styles["body_b"],textColor=C_TEAL,alignment=TA_RIGHT))],
    ]
    if r["n_pendiente"] > 0:
        sub_data.append([
            Paragraph(f"Potencial pendiente por dato fuente "
                      f"({r['n_pendiente']} indicadores):", styles["muted"]),
            Paragraph(fmt_usd(r["potencial_pendiente"]),
                      ParagraphStyle("sp",parent=styles["muted"],textColor=C_ORANGE,
                                     alignment=TA_RIGHT)),
        ])
    sub_tbl = Table(sub_data, colWidths=[W*.70, W*.30])
    sub_tbl.setStyle(TableStyle([
        ("TOPPADDING",   (0,0),(-1,-1), 3),("BOTTOMPADDING",(0,0),(-1,-1), 3),
        ("LEFTPADDING",  (0,0),(-1,-1), 8),("RIGHTPADDING", (0,0),(-1,-1), 8),
    ]))
    story.append(sub_tbl)
    story.append(Spacer(1, 0.3*cm))

    tot_color = C_GREEN if r["total_final"] >= 100 else (C_AMBER if r["total_final"] > 0 else C_RED)
    tot_tbl = Table([[
        Paragraph(f"TOTAL A PAGAR — {PERIODO_LABEL.upper()}", styles["total_lbl"]),
        Paragraph(f"<b>{fmt_usd(r['total_final'])}</b>",
                  ParagraphStyle("tv2",parent=styles["total_val"],textColor=tot_color)),
    ]], colWidths=[W*.55, W*.45])
    tot_tbl.setStyle(TableStyle([
        ("BACKGROUND",  (0,0),(-1,-1), C_TEAL_LIGHT),
        ("BOX",         (0,0),(-1,-1), 1.5, C_TEAL),
        ("TOPPADDING",  (0,0),(-1,-1),12),("BOTTOMPADDING",(0,0),(-1,-1),12),
        ("LEFTPADDING", (0,0),(-1,-1),14),("RIGHTPADDING", (0,0),(-1,-1),14),
        ("VALIGN",      (0,0),(-1,-1),"MIDDLE"),
    ]))
    story.append(tot_tbl)
    story.append(Spacer(1, 0.4*cm))
    story.append(Paragraph(
        f"Reporte generado por PALMA · Distribuciones Palumar S.A. · {PERIODO_LABEL} · Confidencial",
        styles["footer"]))

    doc.build(story)


# ── PDF CONSOLIDADO ────────────────────────────────────────────────────────
def build_pdf_consolidado(results, styles, out):
    doc = SimpleDocTemplate(
        out, pagesize=(A4[1], A4[0]),  # landscape
        topMargin=1.2*cm, bottomMargin=1.2*cm,
        leftMargin=1.5*cm, rightMargin=1.5*cm,
    )
    W = A4[1] - 3.0*cm
    story = []

    story.append(Paragraph("PALMA · Distribuciones Palumar S.A.", styles["brand"]))
    story.append(HRFlowable(width=W, thickness=1.5, color=C_TEAL, spaceBefore=2, spaceAfter=6))
    story.append(Paragraph(f"Consolidado de Pagos de Incentivos · {PERIODO_LABEL}",
                            ParagraphStyle("ctit",parent=styles["title"],fontSize=16,leading=20)))
    story.append(Paragraph(f"Generado el {FECHA_GEN}", styles["muted"]))
    story.append(Spacer(1, 0.4*cm))

    # ── Resumen ejecutivo ─────────────────────────────────────────────────
    grand = sum(r["total_final"] for r in results)
    t_ind = sum(r["total_indicadores"] for r in results)
    t_con = sum(r["total_concursos"] for r in results)
    pagos = [r["total_final"] for r in results]
    con_pago = sum(1 for p in pagos if p > 0)
    sin_pago = len(pagos) - con_pago
    mayor = max(pagos); menor = min(pagos); prom = grand / len(results)
    vmax = next(r["nombre_limpio"][:15] for r in results if r["total_final"] == mayor)
    vmin = next(r["nombre_limpio"][:15] for r in results if r["total_final"] == menor)
    n_pend_total = sum(r["n_pendiente"] for r in results)
    pot_pend_total = sum(r["potencial_pendiente"] for r in results)

    sum_data = [
        [Paragraph("Total a pagar", styles["body"]),
         Paragraph(fmt_usd(grand),
                   ParagraphStyle("sv1",parent=styles["body_b"],textColor=C_TEAL,fontSize=12)),
         Paragraph("Indicadores calculados", styles["body"]),
         Paragraph(fmt_usd(t_ind), styles["body_b"]),
         Paragraph("Concursos", styles["body"]),
         Paragraph(fmt_usd(t_con), styles["body_b"])],
        [Paragraph("Vendedores", styles["body"]),
         Paragraph(str(len(results)), styles["body_b"]),
         Paragraph("Con pago variable", styles["body"]),
         Paragraph(str(con_pago),
                   ParagraphStyle("sv2",parent=styles["body_b"],textColor=C_GREEN)),
         Paragraph("Sin pago variable", styles["body"]),
         Paragraph(str(sin_pago),
                   ParagraphStyle("sv3",parent=styles["body_b"],textColor=C_RED))],
        [Paragraph("Mayor pago", styles["body"]),
         Paragraph(f"{fmt_usd(mayor)} ({vmax})", styles["body_b"]),
         Paragraph("Menor pago", styles["body"]),
         Paragraph(f"{fmt_usd(menor)} ({vmin})", styles["body_b"]),
         Paragraph("Promedio", styles["body"]),
         Paragraph(fmt_usd(prom), styles["body_b"])],
        [Paragraph("Indicadores pendientes (sin fuente)", styles["body"]),
         Paragraph(f"{n_pend_total} (pot. {fmt_usd(pot_pend_total)})",
                   ParagraphStyle("sv4",parent=styles["body_b"],textColor=C_ORANGE)),
         Paragraph("VBI Presupuesto", styles["body"]),
         Paragraph(fmt_usd(VBI_PRESUPUESTO), styles["body_b"]),
         Paragraph("VBI Efectividad", styles["body"]),
         Paragraph(fmt_usd(VBI_EFECTIVIDAD), styles["body_b"])],
    ]
    sum_tbl = Table(sum_data, colWidths=[W*.14, W*.20, W*.13, W*.18, W*.11, W*.24])
    sum_tbl.setStyle(TableStyle([
        ("BOX",          (0,0),(-1,-1), 0.5, C_GRIS_LINE),
        ("INNERGRID",    (0,0),(-1,-1), 0.3, C_GRIS_LINE),
        ("TOPPADDING",   (0,0),(-1,-1), 5),("BOTTOMPADDING",(0,0),(-1,-1), 5),
        ("LEFTPADDING",  (0,0),(-1,-1), 7),("RIGHTPADDING", (0,0),(-1,-1), 7),
        ("BACKGROUND",   (0,0),(-1,-1), C_GRIS_CELL),
    ]))
    story.append(sum_tbl)
    story.append(Spacer(1, 0.4*cm))

    # ── Tabla principal ───────────────────────────────────────────────────
    for e in _sec_header("DETALLE POR VENDEDOR — TODOS LOS INDICADORES", styles):
        story.append(e)

    # Columns: Cód | Vendedor | Venta N. | Meta | %Cum | Cob% | Efec%
    #          | Ppto | Efec | Café | Jet | Gall* | Nuevos | Cero | Tikys
    #          | Devol | Fotos* | Ej.Choc | Ej.Gall | Ej.Zuko* | NE Ind
    #          | TOSH | NE Conc | HORECA | TOTAL
    # * = aún pendiente; sin * = calculado en v6.0
    cols = [
        ("Cód",     W*.036),("Vendedor",  W*.10),
        ("Venta\nNeta",W*.058),("Meta",    W*.058),
        ("%\nCum.", W*.040),("Cob\n%",   W*.036),("Efec\n%", W*.036),
        ("Pago\nPpto.",W*.052),("Pago\nEfec.",W*.047),
        ("Pago\nCafé", W*.047),("DN\nJet", W*.040),("DN\nGall*",W*.040),
        ("Pago\nNuevos",W*.047),("Pago\nCero",W*.047),("DN\nTikys", W*.040),
        ("Devol",   W*.040),("Fotos*",    W*.040),
        ("Ej.\nChoc",W*.038),("Ej.\nGall",W*.038),("Ej.\nZuko*",W*.038),("NE\nInd",W*.034),
        ("TOSH",    W*.042),("NE\nConc.", W*.040),("HOR.",    W*.036),
        ("TOTAL",   W*.076),
    ]
    headers  = [c[0] for c in cols]
    col_w    = [c[1] for c in cols]

    def _c(val, sty=None): return Paragraph(val, sty or styles["cons_td"])
    def _num(val): return Paragraph(fmt_usd(val),styles["cons_num"] if val>0 else styles["cons_zero"])
    def _pend(): return Paragraph("Pend.", styles["cons_pend"])

    rows = [[Paragraph(h, styles["cons_th"]) for h in headers]]
    tot  = defaultdict(float)

    for i, r in enumerate(sorted(results, key=lambda x: -x["total_final"])):
        pc = r["pct_cumplimiento"]
        pe = r["pct_ef"]
        rows.append([
            _c(r["cod"]),
            _c(r["nombre_limpio"][:14]),
            _c(fmt_usd(r["venta_neta"])),
            _c(fmt_usd(r["cuota"])),
            Paragraph(fmt_pct(pc),
                      ParagraphStyle("pc2",parent=styles["cons_td"],
                                     textColor=C_GREEN if pc>=100 else(C_AMBER if pc>=80 else C_RED),
                                     fontName="Helvetica-Bold",alignment=TA_CENTER)),
            Paragraph(fmt_pct(r["cobertura"]),
                      ParagraphStyle("cob2",parent=styles["cons_td"],
                                     textColor=C_GREEN if r["cobertura"]>=85 else(C_AMBER if r["cobertura"]>=70 else C_RED),
                                     alignment=TA_CENTER)),
            Paragraph(fmt_pct(pe),
                      ParagraphStyle("ef2",parent=styles["cons_td"],
                                     textColor=C_GREEN if pe>=90 else(C_AMBER if pe>=80 else C_RED),
                                     alignment=TA_CENTER)),
            _num(r["p_ppto"]), _num(r["p_ef"]),
            _num(r["p_cafe"]), _num(r["p_jet"]), _pend(),
            _num(r["p_nuevos"]), _num(r["p_cero"]), _num(r["p_tikys"]),
            _num(r["p_devol"]), _pend(),
            _num(r["p_choc"]), _num(r["p_gall"]), _pend(), _num(r["p_ne_ind"]),
            _num(r["tosh_pago"]), _num(r["ne_pago"]), _num(r["horeca_pago"]),
            Paragraph(f"<b>{fmt_usd(r['total_final'])}</b>",
                      ParagraphStyle("tf",parent=styles["cons_num"],fontSize=8)),
        ])
        for k in ["p_ppto","p_ef","p_cafe","p_jet","p_tikys","p_nuevos","p_cero",
                  "p_devol","p_choc","p_gall","p_ne_ind",
                  "tosh_pago","ne_pago","horeca_pago","total_final"]:
            tot[k] += r[k]

    n_rows = len(rows)
    # Totals row
    _e = _c("")
    rows.append([
        _e, Paragraph("<b>TOTALES</b>", styles["body_b"]),
        _e, _e, _e, _e, _e,
        Paragraph(f"<b>{fmt_usd(tot['p_ppto'])}</b>",    styles["cons_num"]),
        Paragraph(f"<b>{fmt_usd(tot['p_ef'])}</b>",      styles["cons_num"]),
        Paragraph(f"<b>{fmt_usd(tot['p_cafe'])}</b>",    styles["cons_num"]),
        Paragraph(f"<b>{fmt_usd(tot['p_jet'])}</b>",     styles["cons_num"]),
        _pend(),
        Paragraph(f"<b>{fmt_usd(tot['p_nuevos'])}</b>",  styles["cons_num"]),
        Paragraph(f"<b>{fmt_usd(tot['p_cero'])}</b>",    styles["cons_num"]),
        Paragraph(f"<b>{fmt_usd(tot['p_tikys'])}</b>",   styles["cons_num"]),
        Paragraph(f"<b>{fmt_usd(tot['p_devol'])}</b>",   styles["cons_num"]),
        _pend(),
        Paragraph(f"<b>{fmt_usd(tot['p_choc'])}</b>",    styles["cons_num"]),
        Paragraph(f"<b>{fmt_usd(tot['p_gall'])}</b>",    styles["cons_num"]),
        _pend(),
        Paragraph(f"<b>{fmt_usd(tot['p_ne_ind'])}</b>",  styles["cons_num"]),
        Paragraph(f"<b>{fmt_usd(tot['tosh_pago'])}</b>", styles["cons_num"]),
        Paragraph(f"<b>{fmt_usd(tot['ne_pago'])}</b>",   styles["cons_num"]),
        Paragraph(f"<b>{fmt_usd(tot['horeca_pago'])}</b>",styles["cons_num"]),
        Paragraph(f"<b>{fmt_usd(tot['total_final'])}</b>",
                  ParagraphStyle("tft",parent=styles["cons_num"],fontSize=9)),
    ])

    tbl = Table(rows, colWidths=col_w, repeatRows=1)
    tbl_style = [
        ("BACKGROUND",   (0,0),(-1,0),       C_TEAL_DARK),
        ("BACKGROUND",   (0,n_rows),(-1,n_rows), C_TEAL_LIGHT),
        ("LINEABOVE",    (0,n_rows),(-1,n_rows), 1.0, C_TEAL),
        ("BOX",          (0,0),(-1,-1),      0.5, C_GRIS_LINE),
        ("INNERGRID",    (0,0),(-1,-1),      0.3, C_GRIS_LINE),
        ("TOPPADDING",   (0,0),(-1,-1),      3),
        ("BOTTOMPADDING",(0,0),(-1,-1),      3),
        ("LEFTPADDING",  (0,0),(-1,-1),      2),
        ("RIGHTPADDING", (0,0),(-1,-1),      2),
        ("VALIGN",       (0,0),(-1,-1),      "MIDDLE"),
        *[("BACKGROUND",(0,i),(-1,i), C_GRIS_CELL if i%2==0 else C_BLANCO)
          for i in range(1, n_rows)],
    ]
    tbl.setStyle(TableStyle(tbl_style))
    story.append(tbl)
    story.append(Spacer(1, 0.4*cm))

    # ── Alertas y notas ───────────────────────────────────────────────────
    for e in _sec_header("ALERTAS E INDICADORES PENDIENTES", styles, C_ORANGE):
        story.append(e)

    story.append(Paragraph(
        "v6.0 — Indicadores calculados: Devolución (meta ≤5%), Ejecución Chocolates/Galletas/NE "
        "(metas desde cuotas, escala presupuesto), DN Cremas (SKUs CREMAS en negocio Galletas), "
        "DN Jet, DN Tikys. "
        "Pendientes: DN Galletas Cremas (meta sin confirmar), Ejecución Zuko (no en cuotas), Fotos. "
        f"Potencial pendiente promedio: "
        f"{fmt_usd(sum(r['potencial_pendiente'] for r in results)/len(results))}.",
        ParagraphStyle("al",parent=styles["body"],textColor=C_ORANGE,spaceAfter=4)))

    sin_presup = [r["nombre_limpio"][:15] for r in results if r["p_ppto"] == 0]
    if sin_presup:
        story.append(Paragraph(
            f"⚠ {len(sin_presup)} vendedor(es) sin pago de presupuesto (< 80%): " +
            ", ".join(sin_presup),
            ParagraphStyle("al2",parent=styles["body"],textColor=C_RED,spaceAfter=2)))

    story.append(Paragraph(
        f"VBI Presupuesto=${VBI_PRESUPUESTO:.0f} · Efectividad=${VBI_EFECTIVIDAD:.0f} · "
        f"DN Café=${VBI_DN_CAFE:.0f} · Nuevos=${VBI_NUEVOS:.0f} (meta {META_NUEVOS}) · "
        f"Cero=${VBI_CERO:.0f} (meta ≤{META_CERO_PCT:.0f}%). "
        f"Generado el {FECHA_GEN}.",
        styles["footer"]))

    doc.build(story)


# ── CSVs ──────────────────────────────────────────────────────────────────
def write_csv_consolidado(results, out):
    fields = ["cod","nombre_limpio","venta_neta","cuota","pct_cumplimiento",
              "tramo_ppto","p_ppto","pct_ef","tramo_ef","p_ef",
              "pct_cafe","imp_cafe","mae_cafe","p_cafe",
              "n_nuevos","p_nuevos","pct_cero","sin_compra","maestro","p_cero",
              "tosh_n","tosh_pago","ne_venta","ne_pago","horeca_pago",
              "total_indicadores","total_concursos","total_final","n_pendiente","potencial_pendiente"]
    with open(out,"w",newline="",encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for r in results:
            row = {k: r[k] for k in fields}
            for k in ["venta_neta","cuota","p_ppto","p_ef","p_cafe","p_nuevos","p_cero",
                      "tosh_pago","ne_venta","ne_pago","horeca_pago",
                      "total_indicadores","total_concursos","total_final","potencial_pendiente"]:
                row[k] = f"{r[k]:.2f}"
            w.writerow(row)

def write_csv_calculos(results, out):
    with open(out,"w",newline="",encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["cod","nombre","concepto","categoria","vbi","resultado","escala",
                    "pago","pendiente","nota"])
        for r in results:
            for i in r["indicadores"]:
                w.writerow([r["cod"],r["nombre_limpio"],i["concepto"],i["categoria"],
                             f"{i['vbi']:.2f}",i["resultado"],i["escala"],
                             f"{i['pago']:.2f}" if i["pago"] is not None else PENDIENTE_STR,
                             "SI" if i["pendiente"] else "NO",
                             i["nota"]])

def write_csv_horeca(results, out):
    with open(out,"w",newline="",encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["cod_asesor","nombre","cod_cliente","nombre_cliente","keyword"])
        for r in results:
            for h in r["horeca_list"]:
                w.writerow([r["cod"],r["nombre_limpio"],
                             h.get("cod",""),h.get("nombre",""),h.get("keyword","")])

def write_csv_tosh(results, out):
    with open(out,"w",newline="",encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["cod_asesor","nombre","clientes_tosh","bloques_20","pago_tosh","skus"])
        for r in results:
            w.writerow([r["cod"],r["nombre_limpio"],r["tosh_n"],
                        math.floor(r["tosh_n"]/20),f"{r['tosh_pago']:.2f}",
                        "; ".join(str(s) for s in r["tosh_skus"])])

def write_csv_ne(results, out):
    with open(out,"w",newline="",encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["cod_asesor","nombre","venta_ne","meta","alcanza","pago_concurso"])
        for r in results:
            w.writerow([r["cod"],r["nombre_limpio"],f"{r['ne_venta']:.2f}",
                        "200.00","SI" if r["ne_venta"]>=200 else "NO",
                        f"{r['ne_pago']:.2f}"])

def write_csv_dn_cafe(results, out):
    with open(out,"w",newline="",encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["cod_asesor","nombre","maestro_cafe","impactados_cafe",
                    "pct_cobertura_cafe","meta_pct","cumple","pago"])
        for r in results:
            cumple = "SI" if r["pct_cafe"] >= META_DN_CAFE_PCT else "NO"
            w.writerow([r["cod"],r["nombre_limpio"],r["mae_cafe"],r["imp_cafe"],
                        f"{r['pct_cafe']:.1f}",f"{META_DN_CAFE_PCT:.0f}",
                        cumple,f"{r['p_cafe']:.2f}"])

def write_csv_cliente_cero(results, out):
    with open(out,"w",newline="",encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["cod_asesor","nombre","clientes_maestro","clientes_cero",
                    "pct_cero","meta_pct","cumple","pago"])
        for r in results:
            cumple = "SI" if r["pct_cero"] <= META_CERO_PCT else "NO"
            w.writerow([r["cod"],r["nombre_limpio"],r["maestro"],r["sin_compra"],
                        f"{r['pct_cero']:.2f}",f"{META_CERO_PCT:.0f}",
                        cumple,f"{r['p_cero']:.2f}"])

def write_csv_clientes_nuevos(results, cn_detalle, out):
    with open(out,"w",newline="",encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["cod_asesor","nombre_asesor","cod_cliente","nombre_cliente",
                    "fecha_creacion","canal"])
        for c in cn_detalle:
            cod = str(c.get("cod_asesor","")).zfill(3)
            vend = next((r["nombre_limpio"] for r in results if r["cod"]==cod), "")
            w.writerow([cod, vend,
                        c.get("cod_cliente",""),
                        c.get("razon_social","") or c.get("nombre",""),
                        c.get("fecha_creacion",""),
                        c.get("canal","")])

def write_csv_pendientes(results, out):
    with open(out,"w",newline="",encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["concepto","categoria","vbi","razon_pendiente","vendedores_afectados"])
        pend_map = {}
        for r in results:
            for i in r["indicadores"]:
                if i["pendiente"]:
                    key = i["concepto"]
                    if key not in pend_map:
                        pend_map[key] = {"cat": i["categoria"],
                                         "vbi": i["vbi"],
                                         "nota": i["nota"],
                                         "count": 0}
                    pend_map[key]["count"] += 1
        for concepto, d in pend_map.items():
            w.writerow([concepto, d["cat"], f"{d['vbi']:.2f}",
                        d["nota"], d["count"]])

def write_csv_dn_jet(results, out):
    with open(out,"w",newline="",encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["cod_asesor","nombre","universo","impactados","pct_dn_jet",
                    "meta_pct","cumple","pago"])
        for r in results:
            cumple = "SI" if r["pct_jet"] >= META_DN_JET_PCT else "NO"
            w.writerow([r["cod"],r["nombre_limpio"],r["uni_jet"],r["imp_jet"],
                        f"{r['pct_jet']:.1f}",f"{META_DN_JET_PCT:.0f}",
                        cumple,f"{r['p_jet']:.2f}"])

def write_csv_dn_tikys(results, out):
    with open(out,"w",newline="",encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["cod_asesor","nombre","universo","impactados","pct_dn_tikys",
                    "meta_pct","cumple","pago"])
        for r in results:
            cumple = "SI" if r["pct_tikys"] >= META_DN_TIKYS_PCT else "NO"
            w.writerow([r["cod"],r["nombre_limpio"],r["uni_tikys"],r["imp_tikys"],
                        f"{r['pct_tikys']:.1f}",f"{META_DN_TIKYS_PCT:.0f}",
                        cumple,f"{r['p_tikys']:.2f}"])

def write_csv_dn_galletas_cremas(results, out):
    with open(out,"w",newline="",encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["cod_asesor","nombre","n_clientes_cremas","universo",
                    "pct_dn_cremas","vbi","meta","estado"])
        for r in results:
            w.writerow([
                r["cod"], r["nombre_limpio"],
                r["n_cremas"], r["uni_cremas"],
                f"{r['pct_cremas']:.1f}",
                f"{VBI_DN_GALLETAS_CREMAS:.0f}",
                "Pendiente de confirmar",
                "Resultado calculado — meta de pago sin definir",
            ])

def write_csv_negocios_incentivos(results, out):
    with open(out,"w",newline="",encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["cod_asesor","nombre","negocio","venta_neta_negocio",
                    "meta_negocio","cumplimiento_negocio","vbi",
                    "escala_aplicada","pago","observacion"])
        negocios_spec = [
            ("Chocolates", "venta_choc",    "meta_choc", VBI_EJ_CHOCOLATES, "p_choc"),
            ("Galletas",   "venta_gall_neg","meta_gall", VBI_EJ_GALLETAS,   "p_gall"),
            ("NE indicador","venta_ne_ind", "meta_ne",   VBI_NE_IND,        "p_ne_ind"),
            ("Zuko",       "venta_zuko",    None,        VBI_EJ_ZUKO,       None),
            ("Café",       "venta_cafe_neg",None,        0,                 None),
            ("Cárnico",    "venta_carn_neg",None,        0,                 None),
        ]
        for r in results:
            for neg, vk, mk, vbi, pk in negocios_spec:
                venta = r.get(vk, 0)
                meta  = r.get(mk, 0) if mk else 0
                cum   = f"{venta/meta*100:.1f}%" if meta and meta > 0 else "—"
                pago  = r.get(pk, None) if pk else (0.0 if vbi == 0 else None)
                if pk is None and vbi > 0:
                    obs = "Meta no en cuotas — pendiente"
                elif vbi == 0:
                    obs = "VBI $0 — informativo"
                elif meta and meta > 0:
                    obs = "Calculado — escala presupuesto"
                else:
                    obs = "Meta no encontrada en cuotas"
                w.writerow([
                    r["cod"], r["nombre_limpio"], neg,
                    f"{venta:.2f}", f"{meta:.2f}", cum,
                    f"{vbi:.0f}",
                    "escala_presupuesto" if (pago is not None and vbi > 0) else "—",
                    f"{pago:.2f}" if pago is not None else "Pendiente",
                    obs,
                ])

def write_csv_devolucion(results, out):
    with open(out,"w",newline="",encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["cod_asesor","nombre","pct_devolucion","devolucion_total",
                    "meta_pct","cumple","vbi","pago","nota"])
        for r in results:
            cumple = "SI" if r["pct_devol"] <= META_DEVOLUCION_PCT else "NO"
            w.writerow([r["cod"], r["nombre_limpio"],
                        f"{r['pct_devol']:.2f}", f"{r['devol']:.2f}",
                        f"{META_DEVOLUCION_PCT:.1f}",
                        cumple, f"{VBI_DEVOLUCION_IND:.0f}",
                        f"{r['p_devol']:.2f}",
                        f"Meta ≤{META_DEVOLUCION_PCT:.0f}%; {r['tramo_devol']}"])


def write_csv_homologacion_venta_neta(results, venta_neg_map_full, out):
    with open(out,"w",newline="",encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["cod_asesor","nombre","venta_neta_total","suma_venta_neta_negocios",
                    "sin_negocio_identificado","diferencia","estado"])
        for r in results:
            cod = r["cod"]
            vn_total = r["venta_neta"]
            vn_map = venta_neg_map_full.get(cod, {})
            suma_neg = sum(float(val) for val in vn_map.values() if float(val) > 0)
            diff = vn_total - suma_neg
            sin_neg = max(0.0, round(diff, 2))
            estado = ("OK" if abs(diff) < 1.0
                      else ("Diferencia <5%" if abs(diff) < vn_total * 0.05 else "Revisar"))
            w.writerow([cod, r["nombre_limpio"],
                        f"{vn_total:.2f}", f"{suma_neg:.2f}",
                        f"{sin_neg:.2f}", f"{diff:.2f}", estado])


# ── MAIN ──────────────────────────────────────────────────────────────────
def main():
    print(f"\n{'='*65}")
    print(f"  RECÁLCULO INCENTIVOS — {PERIODO_LABEL.upper()}")
    print(f"  PALUMAR S.A. — v6.0 (devolución+negocios+cremas calculados)")
    print(f"{'='*65}\n")
    print(f"  VBI Presupuesto: ${VBI_PRESUPUESTO:.0f}  Efectividad: ${VBI_EFECTIVIDAD:.0f}")
    print(f"  DN Jet: ${VBI_DN_JET:.0f} (meta ≥{META_DN_JET_PCT:.0f}%)  "
          f"DN Tikys: ${VBI_DN_TIKYS:.0f} (meta ≥{META_DN_TIKYS_PCT:.0f}%)")
    print(f"  Devolución: ${VBI_DEVOLUCION_IND:.0f} (meta ≤{META_DEVOLUCION_PCT:.0f}%)")
    print(f"  Meta Clientes Nuevos: {META_NUEVOS}  Meta Cliente Cero: ≤{META_CERO_PCT:.0f}%")
    print()

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # 1. Fetch datos
    print("1. Obteniendo datos desde API PALMA...\n")
    vendedores_data = fetch("vendedores")
    inc_data        = fetch("incentivos_vendedores")
    cn_data         = fetch("clientes_nuevos", {"desde":"2026-06-01","hasta":"2026-06-30"})
    cob_neg_raw     = fetch("cob_negocio")
    cartera_raw     = fetch("cartera")
    marcas_raw      = fetch("cobertura_marcas")
    cuotas_raw      = fetch("cuotas")

    assert isinstance(vendedores_data, list) and len(vendedores_data) > 0

    # inc_map
    inc_map = {str(v["cod"]): v for v in inc_data.get("vendedores",[])}

    # cafe_map + cob_neg_map
    cafe_map = {}
    cob_neg_map = defaultdict(list)
    for row in (cob_neg_raw if isinstance(cob_neg_raw, list) else []):
        neg = str(row.get("negocio","")).lower()
        vt  = str(row.get("vendedor",""))
        cod = vt.split("-")[0].strip().zfill(3)
        cob_neg_map[cod].append(row)
        if "caf" in neg:
            cafe_map[cod] = row

    # venta_neg_map
    venta_neg_map = {}
    for v in vendedores_data:
        cod = str(v["cod"])
        venta_neg_map[cod] = {r["negocio"]: r.get("venta",0)
                               for r in v.get("venta_por_negocio",[])}

    # nuevos_map + HORECA + clientes_nuevos detalle
    cn_detalle = cn_data.get("detalle",[]) if isinstance(cn_data, dict) else []
    nuevos_map = Counter(str(c.get("cod_asesor","")).zfill(3) for c in cn_detalle)
    horeca_por_vend = defaultdict(list)
    for c in cn_detalle:
        razon  = str(c.get("razon_social","") or "")
        nombre = str(c.get("nombre","") or "")
        ok, kw = es_horeca(razon)
        if not ok: ok, kw = es_horeca(nombre)
        if ok:
            cod_a = str(c.get("cod_asesor","")).zfill(3)
            horeca_por_vend[cod_a].append({
                "cod":     str(c.get("cod_cliente","")),
                "nombre":  razon or nombre,
                "keyword": kw,
            })

    # cartera_map
    cartera_map = {}
    total_eq_crt = float(cartera_raw.get("total_pendiente",0)) if isinstance(cartera_raw,dict) else 0
    for cv in (cartera_raw.get("por_vendedor",[]) if isinstance(cartera_raw,dict) else []):
        cod = str(cv.get("cod_asesor","")).zfill(3)
        cartera_map[cod] = {
            "total":      float(cv.get("total",0)),
            "facturas":   int(cv.get("facturas",0)),
            "pct_equipo": round(cv["total"]/total_eq_crt*100, 1) if total_eq_crt>0 else 0,
        }

    # marcas_por_vend
    marcas_por_vend = {}
    _marcas_list = (marcas_raw.get("vendedores", []) if isinstance(marcas_raw, dict)
                    else marcas_raw if isinstance(marcas_raw, list) else [])
    for _mv in _marcas_list:
        _cod = str(_mv.get("cod", "")).zfill(3)
        marcas_por_vend[_cod] = {}
        for _m in _mv.get("marcas", []):
            _key = str(_m.get("marca", "")).upper()
            marcas_por_vend[_cod][_key] = _m

    # cuotas_por_vend (keys normalizadas por negocio)
    _cuotas_list = (cuotas_raw if isinstance(cuotas_raw, list)
                    else cuotas_raw.get("vendedores", []) if isinstance(cuotas_raw, dict)
                    else [])
    cuotas_por_vend = {}
    for vq in _cuotas_list:
        _cq = str(vq.get("cod", "")).zfill(3)
        cuotas_por_vend[_cq] = {
            norm_neg(n["negocio"]): float(n.get("meta", 0))
            for n in vq.get("por_negocio", [])
        }

    print(f"   Vendedores:        {len(vendedores_data)}")
    print(f"   Clientes nuevos:   {sum(nuevos_map.values())}")
    print(f"   HORECA detectados: {sum(len(v) for v in horeca_por_vend.values())}")
    print(f"   Negocios DN Café:  {len(cafe_map)}")
    print(f"   Vendedores marcas: {len(marcas_por_vend)}")
    print(f"   Cuotas cargadas:   {len(cuotas_por_vend)} vendedores")
    jet_total = sum(1 for d in marcas_por_vend.values() if "053-JET" in d)
    tikys_total = sum(1 for d in marcas_por_vend.values() if "083-TIKYS" in d)
    print(f"   Vendedores con Jet: {jet_total}  con Tikys: {tikys_total}")

    # 2. DN Cremas (requiere 14 llamadas a detalle_cobertura_negocio)
    print("\n2. Obteniendo DN Galletas Cremas (puede tomar ~3-6 minutos)...\n")
    cremas_por_vend = fetch_all_cremas(vendedores_data)

    # 3. Calcular
    print("\n3. Calculando incentivos (v6.0 — devolución+negocios+cremas calculados)...\n")
    results = calcular_incentivos(
        vendedores_data, inc_map, horeca_por_vend,
        cafe_map, nuevos_map, cob_neg_map, cartera_map, venta_neg_map, marcas_por_vend,
        cuotas_por_vend, cremas_por_vend
    )
    assert all(r["total_final"] >= 0 for r in results), "Pago negativo detectado"

    grand = sum(r["total_final"] for r in results)

    fmt = "{:<5} {:<27} {:>7} {:>8} {:>7} {:>7} {:>6} {:>8}"
    fmt_hdr = "{:<5} {:<25} {:>7} {:>7} {:>6} {:>6} {:>6} {:>6} {:>6} {:>8}"
    print(fmt_hdr.format("COD","NOMBRE","%CUM","PPTO$","EF$","CAFÉ$","JET$","TIKYS$","CONC$","TOTAL$"))
    print("-"*82)
    for r in results:
        print(fmt_hdr.format(
            r["cod"], r["nombre_limpio"][:25],
            fmt_pct(r["pct_cumplimiento"]),
            fmt_usd(r["p_ppto"]), fmt_usd(r["p_ef"]),
            fmt_usd(r["p_cafe"]),
            fmt_usd(r["p_jet"]), fmt_usd(r["p_tikys"]),
            fmt_usd(r["total_concursos"]),
            fmt_usd(r["total_final"]),
        ))
    print("-"*82)
    TOTAL_V5 = 922.60
    diff = grand - TOTAL_V5
    print(f"{'GRAN TOTAL':>62} {fmt_usd(grand)}")
    print(f"  vs v5.0 (era {fmt_usd(TOTAL_V5)}): diferencia = {fmt_usd(diff)} "
          f"({'▲ nuevos indicadores calculados' if diff >= 0 else '▼'})")

    # 4. PDFs individuales
    print("\n4. Generando PDFs individuales (3 páginas c/u)...\n")
    styles = make_styles()
    for r in results:
        slug  = slug_nombre(r["nombre"])
        fname = f"LIQUIDACION_INCENTIVOS_JUNIO_2026_{r['cod']}_{slug}.pdf"
        build_pdf_individual(r, styles, os.path.join(OUTPUT_DIR, fname))
        pend_note = f"  [+{r['n_pendiente']} pend.]" if r["n_pendiente"] > 0 else ""
        print(f"   ✓ {r['cod']} {r['nombre_limpio'][:22]:22}  {fmt_usd(r['total_final'])}{pend_note}")

    # 5. Consolidado
    print("\n5. Generando PDF consolidado...\n")
    build_pdf_consolidado(results, styles,
        os.path.join(OUTPUT_DIR, "CONSOLIDADO_PAGOS_INCENTIVOS_JUNIO_2026.pdf"))
    print("   ✓ CONSOLIDADO_PAGOS_INCENTIVOS_JUNIO_2026.pdf")

    # 6. CSVs
    print("\n6. Generando CSVs de auditoría...\n")
    write_csv_consolidado(results,
        os.path.join(OUTPUT_DIR, "CONSOLIDADO_PAGOS_INCENTIVOS_JUNIO_2026.csv"))
    print("   ✓ CONSOLIDADO_PAGOS_INCENTIVOS_JUNIO_2026.csv")
    write_csv_calculos(results,
        os.path.join(OUTPUT_DIR, "AUDITORIA_CALCULOS_INCENTIVOS_JUNIO_2026.csv"))
    print("   ✓ AUDITORIA_CALCULOS_INCENTIVOS_JUNIO_2026.csv")
    write_csv_horeca(results,
        os.path.join(OUTPUT_DIR, "AUDITORIA_HORECA_JUNIO_2026.csv"))
    print("   ✓ AUDITORIA_HORECA_JUNIO_2026.csv")
    write_csv_tosh(results,
        os.path.join(OUTPUT_DIR, "AUDITORIA_TOSH_JUNIO_2026.csv"))
    print("   ✓ AUDITORIA_TOSH_JUNIO_2026.csv")
    write_csv_ne(results,
        os.path.join(OUTPUT_DIR, "AUDITORIA_NUTRICION_EXPERTA_JUNIO_2026.csv"))
    print("   ✓ AUDITORIA_NUTRICION_EXPERTA_JUNIO_2026.csv")
    write_csv_dn_cafe(results,
        os.path.join(OUTPUT_DIR, "AUDITORIA_DN_CAFE_SELLO_ROJO_JUNIO_2026.csv"))
    print("   ✓ AUDITORIA_DN_CAFE_SELLO_ROJO_JUNIO_2026.csv")
    write_csv_cliente_cero(results,
        os.path.join(OUTPUT_DIR, "AUDITORIA_CLIENTE_CERO_JUNIO_2026.csv"))
    print("   ✓ AUDITORIA_CLIENTE_CERO_JUNIO_2026.csv")
    write_csv_clientes_nuevos(results, cn_detalle,
        os.path.join(OUTPUT_DIR, "AUDITORIA_CLIENTES_NUEVOS_JUNIO_2026.csv"))
    print("   ✓ AUDITORIA_CLIENTES_NUEVOS_JUNIO_2026.csv")
    write_csv_pendientes(results,
        os.path.join(OUTPUT_DIR, "AUDITORIA_PENDIENTES_JUNIO_2026.csv"))
    print("   ✓ AUDITORIA_PENDIENTES_JUNIO_2026.csv  ← indicadores pendientes")
    write_csv_dn_jet(results,
        os.path.join(OUTPUT_DIR, "AUDITORIA_DN_JET_JUNIO_2026.csv"))
    print("   ✓ AUDITORIA_DN_JET_JUNIO_2026.csv")
    write_csv_dn_tikys(results,
        os.path.join(OUTPUT_DIR, "AUDITORIA_DN_TIKYS_JUNIO_2026.csv"))
    print("   ✓ AUDITORIA_DN_TIKYS_JUNIO_2026.csv")
    write_csv_dn_galletas_cremas(results,
        os.path.join(OUTPUT_DIR, "AUDITORIA_DN_GALLETAS_CREMAS_JUNIO_2026.csv"))
    print("   ✓ AUDITORIA_DN_GALLETAS_CREMAS_JUNIO_2026.csv  ← resultado calculado")
    write_csv_negocios_incentivos(results,
        os.path.join(OUTPUT_DIR, "AUDITORIA_NEGOCIOS_INCENTIVOS_JUNIO_2026.csv"))
    print("   ✓ AUDITORIA_NEGOCIOS_INCENTIVOS_JUNIO_2026.csv")
    write_csv_devolucion(results,
        os.path.join(OUTPUT_DIR, "AUDITORIA_DEVOLUCION_META_JUNIO_2026.csv"))
    print("   ✓ AUDITORIA_DEVOLUCION_META_JUNIO_2026.csv")
    write_csv_homologacion_venta_neta(results, venta_neg_map,
        os.path.join(OUTPUT_DIR, "AUDITORIA_HOMOLOGACION_VENTA_NETA_JUNIO_2026.csv"))
    print("   ✓ AUDITORIA_HOMOLOGACION_VENTA_NETA_JUNIO_2026.csv")

    # 7. Validaciones
    print("\n7. Validaciones...\n")
    assert len(results) == 14,              f"Esperados 14 vendedores, got {len(results)}"
    n_pdfs = sum(1 for f in os.listdir(OUTPUT_DIR)
                 if f.startswith("LIQUIDACION_INCENTIVOS_JUNIO_2026_") and f.endswith(".pdf"))
    assert n_pdfs == 14,                    f"PDFs generados: {n_pdfs}"
    assert not any(r["total_final"]<0 for r in results), "Hay pagos negativos"
    # VBIs correctos
    assert VBI_PRESUPUESTO == 132.00,       "VBI Presupuesto incorrecto"
    assert VBI_EFECTIVIDAD == 33.00,        "VBI Efectividad incorrecto"
    assert VBI_NUEVOS      == 22.00,        "VBI Nuevos incorrecto"
    assert VBI_CERO        == 33.00,        "VBI Cero incorrecto"
    assert META_NUEVOS     == 10,           "Meta nuevos incorrecta"
    assert META_CERO_PCT   == 4.0,          "Meta cero incorrecta"
    # Concursos activos
    tosh_total  = sum(r["tosh_pago"] for r in results)
    ne_total    = sum(r["ne_pago"]   for r in results)
    horeca_total= sum(r["horeca_pago"] for r in results)
    assert tosh_total  >= 0 and ne_total >= 0 and horeca_total >= 0
    # Suma coincide
    t_ind = sum(r["total_indicadores"] for r in results)
    t_con = sum(r["total_concursos"]   for r in results)
    assert abs(t_ind + t_con - grand) < 0.01
    print("   ✓ 14 vendedores procesados")
    print("   ✓ 14 PDFs individuales (3 páginas)")
    print("   ✓ VBI Presupuesto = $132")
    print("   ✓ VBI Efectividad = $33")
    print("   ✓ Meta clientes nuevos = 10")
    print("   ✓ Meta cliente cero = 4%")
    print(f"  ✓ Meta devolución ≤{META_DEVOLUCION_PCT:.0f}% — VBI ${VBI_DEVOLUCION_IND:.0f}")
    print("   ✓ Concursos TOSH / HORECA / Nutrición Experta activos")
    print("   ✓ Sin pagos negativos")
    print(f"   ✓ Suma individuales = total consolidado = {fmt_usd(grand)}")
    total_jet   = sum(r["p_jet"] for r in results)
    total_tikys = sum(r["p_tikys"] for r in results)
    total_devol = sum(r["p_devol"] for r in results)
    total_choc  = sum(r["p_choc"] for r in results)
    total_gall  = sum(r["p_gall"] for r in results)
    total_ne_ind = sum(r["p_ne_ind"] for r in results)
    n_jet_cumple  = sum(1 for r in results if r["pct_jet"]  >= META_DN_JET_PCT)
    n_tikys_cumple= sum(1 for r in results if r["pct_tikys"]>= META_DN_TIKYS_PCT)
    n_devol_cumple= sum(1 for r in results if r["pct_devol"] <= META_DEVOLUCION_PCT)
    print(f"   ✓ DN Jet   : {n_jet_cumple}/{len(results)} cumplen ≥{META_DN_JET_PCT:.0f}% → {fmt_usd(total_jet)}")
    print(f"   ✓ DN Tikys : {n_tikys_cumple}/{len(results)} cumplen ≥{META_DN_TIKYS_PCT:.0f}% → {fmt_usd(total_tikys)}")
    print(f"   ✓ Devolución: {n_devol_cumple}/{len(results)} cumplen ≤{META_DEVOLUCION_PCT:.0f}% → {fmt_usd(total_devol)}")
    print(f"   ✓ Ej.Chocolates: {fmt_usd(total_choc)}  Ej.Galletas: {fmt_usd(total_gall)}  NE ind: {fmt_usd(total_ne_ind)}")
    cremas_total = sum(r["pct_cremas"] for r in results)
    print(f"   ✓ DN Cremas calculado — promedio equipo: {cremas_total/len(results):.1f}% — pago pendiente meta")

    n_pend_uniq = len({i["concepto"] for r in results for i in r["indicadores"] if i["pendiente"]})
    print(f"   ℹ {n_pend_uniq} indicadores aún pendientes (sin meta o sin fuente — no suman al total)")

    # 8. Resumen final
    print(f"\n{'='*65}")
    print(f"  RESUMEN FINAL — TOTAL A PAGAR JUNIO 2026  (v6.0)")
    print(f"{'='*65}")
    print(f"  Presupuesto (VBI $132):             {fmt_usd(sum(r['p_ppto'] for r in results))}")
    print(f"  Efectividad (VBI $33):              {fmt_usd(sum(r['p_ef'] for r in results))}")
    print(f"  DN Café Sello Rojo (VBI $55):       {fmt_usd(sum(r['p_cafe'] for r in results))}")
    print(f"  DN Jet (VBI $33):                   {fmt_usd(total_jet)}")
    print(f"  DN Tikys (VBI $22):                 {fmt_usd(total_tikys)}")
    print(f"  Clientes nuevos (VBI $22):          {fmt_usd(sum(r['p_nuevos'] for r in results))}")
    print(f"  Cliente cero (VBI $33):             {fmt_usd(sum(r['p_cero'] for r in results))}")
    print(f"  Devolución (VBI $22, meta ≤5%):     {fmt_usd(total_devol)}")
    print(f"  Ej. Chocolates (VBI $22):           {fmt_usd(total_choc)}")
    print(f"  Ej. Galletas (VBI $33):             {fmt_usd(total_gall)}")
    print(f"  NE indicador (VBI $11):             {fmt_usd(total_ne_ind)}")
    print(f"  ─────────────────────────────────────────────")
    print(f"  Subtotal indicadores calc.:         {fmt_usd(t_ind)}")
    print(f"  Concurso TOSH:                      {fmt_usd(tosh_total)}")
    print(f"  Concurso Nutrición Experta:         {fmt_usd(ne_total)}")
    print(f"  Concurso HORECA:                    {fmt_usd(horeca_total)}")
    print(f"  Subtotal concursos:                 {fmt_usd(t_con)}")
    print(f"  ═════════════════════════════════════════════")
    print(f"  TOTAL GENERAL:                      {fmt_usd(grand)}")
    print(f"  ─────────────────────────────────────────────")
    print(f"  Potencial indicadores pend.:        {fmt_usd(sum(r['potencial_pendiente'] for r in results))}")
    print(f"{'='*65}\n")


if __name__ == "__main__":
    main()
