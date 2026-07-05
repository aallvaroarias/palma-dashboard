#!/usr/bin/env python3
"""
generar_incentivos.py - v3.0
Reporte Individual de Desempeño + Liquidación de Incentivos
PALUMAR S.A. - Junio 2026
Estilo visual: similar al Reporte Individual Mayo 2026
"""

import requests, csv, os, math
from collections import Counter, defaultdict
from datetime import datetime
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Table, TableStyle,
    Spacer, HRFlowable, PageBreak, KeepTogether, Flowable,
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
FECHA_GEN     = datetime.now().strftime("%d de %B de %Y").replace(
    "January","enero").replace("February","febrero").replace("March","marzo"
    ).replace("April","abril").replace("May","mayo").replace("June","junio"
    ).replace("July","julio").replace("August","agosto").replace("September","septiembre"
    ).replace("October","octubre").replace("November","noviembre").replace("December","diciembre")

# ── VBIs ──────────────────────────────────────────────────────────────────
VBI_PRESUPUESTO  = 154.00
VBI_EFECTIVIDAD  = 55.00
VBI_DN_CAFE      = 55.00
VBI_NUEVOS       = 55.00
VBI_CERO         = 55.00
META_DN_CAFE_PCT = 40.0
META_NUEVOS      = 15
META_CERO_PCT    = 2.0

HORECA_KEYWORDS = [
    'hotel','restaurante','restaurant','rest.','cafetería','cafeteria',
    'café','cafe','horeca','food service','parrilla','cantina',
    'comedor','fonda','lunch','soda','bar ','taberna',
    'marisqueria','marisquería','cevicheria','cevichería',
    'fritanga','asadero','delicias',
]

# ── COLORES  (estilo mayo) ────────────────────────────────────────────────
C_TEAL       = colors.HexColor("#17A3B8")   # azul-teal: subtítulos, secciones, valores positivos
C_TEAL_DARK  = colors.HexColor("#0D7A8F")   # header tabla
C_TEAL_LIGHT = colors.HexColor("#E8F7FA")
C_RED        = colors.HexColor("#E74C3C")   # valores negativos, cumplimiento bajo
C_RED_LIGHT  = colors.HexColor("#FDEDEC")
C_ORANGE     = colors.HexColor("#E67E22")   # cobertura moderada, alertas
C_ORANGE_HDR = colors.HexColor("#E67E22")   # header tabla cobertura negocio
C_GREEN      = colors.HexColor("#27AE60")   # cumplimiento ≥100%
C_GREEN_LIGHT= colors.HexColor("#EAFAF1")
C_AMBER      = colors.HexColor("#F39C12")   # cobertura media
C_GRIS_CELL  = colors.HexColor("#F8F9FA")   # fondo alterno filas
C_GRIS_LINE  = colors.HexColor("#DEE2E6")   # líneas de tabla
C_TEXT_MUTED = colors.HexColor("#6C757D")   # etiquetas, subtexto
C_TEXT_DARK  = colors.HexColor("#212529")   # texto principal
C_BLANCO     = colors.white
C_NEGRO      = colors.black


# ── PROGRESS BAR FLOWABLE ─────────────────────────────────────────────────
class ProgressBar(Flowable):
    def __init__(self, pct, width, height=16, radius=3):
        Flowable.__init__(self)
        self.pct    = min(float(pct), 100)
        self.width  = width
        self.height = height
        self.radius = radius
        if pct >= 100:
            self.bar_color = C_GREEN
        elif pct >= 80:
            self.bar_color = C_AMBER
        else:
            self.bar_color = C_RED

    def draw(self):
        c = self.canv
        r = self.radius
        # Background track
        c.setFillColor(C_GRIS_LINE)
        c.roundRect(0, 0, self.width, self.height, r, fill=1, stroke=0)
        # Filled portion
        fill_w = max(self.width * self.pct / 100, r * 2)
        c.setFillColor(self.bar_color)
        c.roundRect(0, 0, fill_w, self.height, r, fill=1, stroke=0)

    def wrap(self, *args):
        return (self.width, self.height)


# ── CÁLCULOS ──────────────────────────────────────────────────────────────
def calc_presupuesto(pct, vbi=VBI_PRESUPUESTO):
    if pct < 80:   return 0.0,  "< 80%",            "$0.00",   "$0.00 — no alcanza tramo mínimo"
    elif pct <= 95: p = round(vbi*.60,2); return p, "80% – 95%",  f"${vbi:.0f}×60%",  f"${p:.2f}"
    elif pct <= 99: p = round(vbi*.80,2); return p, "95.1% – 99%",f"${vbi:.0f}×80%",  f"${p:.2f}"
    elif pct <=105: p = round(vbi*1.05,2);return p, "99.1% – 105%",f"${vbi:.0f}×105%",f"${p:.2f}"
    else:
        f = min(pct, 110) / 100
        p = round(vbi * f, 2)
        return p, f"> 105% (tope 110%)", f"${vbi:.0f}×{f*100:.1f}%", f"${p:.2f}"

def calc_efectividad(pct, vbi=VBI_EFECTIVIDAD):
    if pct < 80:   return 0.0,  "< 80%",        "$0.00",   "$0.00 — no alcanza tramo mínimo"
    elif pct < 87: p = round(vbi*.80,2); return p, "80% – 87%",  f"${vbi:.0f}×80%",  f"${p:.2f}"
    elif pct < 90: p = round(vbi*.90,2); return p, "87% – 90%",  f"${vbi:.0f}×90%",  f"${p:.2f}"
    else:          p = round(vbi*1.10,2);return p, "≥ 90%",       f"${vbi:.0f}×110%", f"${p:.2f}"

def calc_dn_cafe(pct, vbi=VBI_DN_CAFE, meta=META_DN_CAFE_PCT):
    if pct >= meta: return vbi, f"≥{meta:.0f}% ✓", "Cumple", f"${vbi:.2f}"
    return 0.0, f"< {meta:.0f}%", "No cumple", "$0.00"

def calc_nuevos(n, vbi=VBI_NUEVOS, meta=META_NUEVOS):
    if n >= meta: return vbi, f"≥{meta} clientes ✓", "Cumple", f"${vbi:.2f}"
    return 0.0, f"< {meta} clientes", "No cumple", "$0.00"

def calc_cero(pct, vbi=VBI_CERO, meta=META_CERO_PCT):
    if pct <= meta: return vbi, f"≤{meta:.0f}% ✓", "Cumple", f"${vbi:.2f}"
    return 0.0, f"{pct:.1f}% > {meta:.0f}%", "No cumple", "$0.00"


# ── UTILIDADES ────────────────────────────────────────────────────────────
def fmt_usd(v):  return f"${v:,.2f}"
def fmt_pct(v):  return f"{v:.1f}%"
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

def nota_nomina(r):
    pct  = r["pct_cumplimiento"]
    tot  = r["total_final"]
    cuota = r["cuota"]
    venta = r["venta_neta"]
    efec  = r["pct_ef"]
    if pct >= 100:
        extra = venta - cuota
        return (
            f"Excelente desempeño comercial. El vendedor supera la meta mensual "
            f"con {fmt_pct(pct)} de cumplimiento, {fmt_usd(extra)} sobre la meta. "
            f"Obtiene pago por los indicadores detallados en esta liquidación."
        ), C_GREEN
    elif pct >= 80:
        falta = max(0.0, cuota - venta)
        if tot >= 100:
            return (
                f"Buen resultado. Cumplimiento del {fmt_pct(pct)} sobre meta de {fmt_usd(cuota)} "
                f"(brecha de {fmt_usd(falta)}). Se obtienen incentivos por presupuesto y concursos. "
                f"Se recomienda mantener ritmo de cobertura."
            ), C_GREEN
        else:
            return (
                f"Cumplimiento del {fmt_pct(pct)} sobre meta de {fmt_usd(cuota)}. "
                f"Se alcanza el tramo de presupuesto. Se recomienda mejorar la ejecución "
                f"por negocio y efectividad de visitas para el siguiente mes."
            ), C_AMBER
    elif tot > 0:
        return (
            f"Aunque no se alcanzó el tramo de presupuesto ({fmt_pct(pct)} de cumplimiento), "
            f"se obtienen incentivos por concursos específicos ({fmt_usd(tot)} en total). "
            f"Se recomienda enfocar el siguiente mes en cierre de brecha de venta y clientes cero."
        ), C_ORANGE
    else:
        return (
            f"No se generan pagos variables en este corte. Cumplimiento del "
            f"{fmt_pct(pct)} sobre meta de {fmt_usd(cuota)}. Se recomienda revisar "
            f"cobertura, venta neta y efectividad de visita para el siguiente mes."
        ), C_RED


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
                        cartera_map, venta_neg_map):
    results = []
    for v in sorted(vendedores_list, key=lambda x: x["cod"]):
        cod = str(v["cod"])
        inc = inc_map.get(cod, {})

        p_ppto, tramo_ppto, formula_ppto, pago_ppto_str = calc_presupuesto(float(v.get("pct_cumplimiento",0)))
        p_ef,   tramo_ef,   formula_ef,   pago_ef_str   = calc_efectividad(float(v.get("efectividad",0)))

        cafe_info = cafe_map.get(cod, {})
        pct_cafe  = float(cafe_info.get("cobertura_", 0))
        imp_cafe  = int(cafe_info.get("impactados", 0))
        mae_cafe  = int(cafe_info.get("clientes_maestro", 0))
        p_cafe, tramo_cafe, _, pago_cafe_str = calc_dn_cafe(pct_cafe)

        n_nuevos = int(nuevos_map.get(cod, 0))
        p_nuevos, tramo_nuevos, _, pago_nuevos_str = calc_nuevos(n_nuevos)

        mae = int(v.get("maestro", 0))
        sc  = int(v.get("sin_compra", 0))
        pct_cero = round(sc / mae * 100, 2) if mae > 0 else 0.0
        p_cero, tramo_cero, _, pago_cero_str = calc_cero(pct_cero)

        tosh_n    = int(inc.get("clientes_tosh_impactados", 0))
        tosh_pago = float(math.floor(tosh_n / 20) * 10)
        ne_venta  = float(inc.get("venta_nutricion_experta", 0))
        ne_pago   = 20.0 if ne_venta >= 200.0 else 0.0
        horeca_list = horeca_por_vend.get(cod, [])
        horeca_pago = float(len(horeca_list))

        total_ind = p_ppto + p_ef + p_cafe + p_nuevos + p_cero
        total_con = tosh_pago + ne_pago + horeca_pago
        total_fin = total_ind + total_con

        # Cobertura por negocio: merge cob_negocio + venta_por_negocio
        cob_rows  = sorted(cob_neg_map.get(cod, []),
                           key=lambda x: float(x.get("cobertura_", 0)), reverse=True)
        vn_map    = venta_neg_map.get(cod, {})
        cob_merged = [{
            "negocio":    row.get("negocio",""),
            "maestro":    int(row.get("clientes_maestro", 0)),
            "impactados": int(row.get("impactados", 0)),
            "cobertura":  float(row.get("cobertura_", 0)),
            "venta":      float(vn_map.get(row.get("negocio",""), 0)),
        } for row in cob_rows]

        # Cartera
        crt = cartera_map.get(cod, {})

        results.append({
            "cod":            cod,
            "nombre":         v.get("nombre",""),
            "nombre_limpio":  clean_nombre(v.get("nombre","")),
            # Ventas
            "venta_bruta":    float(v.get("venta_bruta", 0)),
            "venta_neta":     float(v.get("venta_neta", 0)),
            "devol":          float(v.get("devolucion_total", 0)),
            "pct_devolucion": float(v.get("pct_devolucion", 0)),
            "averia_total":   float(v.get("averia_total", 0)),
            "pct_averia":     float(v.get("pct_averia", 0)),
            "cuota":          float(v.get("cuota", 0)),
            "pct_cumplimiento": float(v.get("pct_cumplimiento", 0)),
            # Cobertura
            "maestro":        mae,
            "impactados":     int(v.get("impactados", 0)),
            "cobertura":      float(v.get("cobertura", 0)),
            "sin_compra":     sc,
            "efectividad":    float(v.get("efectividad", 0)),
            # Cobertura por negocio
            "cob_negocios":   cob_merged,
            # Cartera
            "cartera_total":      float(crt.get("total", 0)),
            "cartera_facturas":   int(crt.get("facturas", 0)),
            "cartera_pct_equipo": float(crt.get("pct_equipo", 0)),
            # Indicadores
            "p_ppto": p_ppto, "tramo_ppto": tramo_ppto, "formula_ppto": formula_ppto, "pago_ppto_str": pago_ppto_str,
            "pct_ef": float(v.get("efectividad",0)),
            "p_ef":   p_ef,   "tramo_ef":   tramo_ef,   "formula_ef":   formula_ef,   "pago_ef_str":   pago_ef_str,
            "pct_cafe": pct_cafe, "imp_cafe": imp_cafe, "mae_cafe": mae_cafe,
            "p_cafe": p_cafe, "tramo_cafe": tramo_cafe, "pago_cafe_str": pago_cafe_str,
            "n_nuevos": n_nuevos,
            "p_nuevos": p_nuevos, "tramo_nuevos": tramo_nuevos, "pago_nuevos_str": pago_nuevos_str,
            "pct_cero": pct_cero, "sc": sc, "mae": mae,
            "p_cero": p_cero, "tramo_cero": tramo_cero, "pago_cero_str": pago_cero_str,
            "tosh_n": tosh_n, "tosh_pago": tosh_pago, "tosh_skus": inc.get("tosh_skus_vendidos",[]),
            "ne_venta": ne_venta, "ne_pago": ne_pago,
            "horeca_list": horeca_list, "horeca_pago": horeca_pago,
            "total_indicadores": total_ind,
            "total_concursos":   total_con,
            "total_final":       total_fin,
        })
    return results


# ── ESTILOS ───────────────────────────────────────────────────────────────
def make_styles():
    def ps(name, **kw):
        return ParagraphStyle(name, parent=getSampleStyleSheet()["Normal"], **kw)

    return {
        # Encabezado
        "brand":     ps("brand",   fontName="Helvetica-Bold", fontSize=11,
                        textColor=C_TEXT_DARK, leading=14),
        "title":     ps("title",   fontName="Helvetica-Bold", fontSize=22,
                        textColor=C_TEXT_DARK, leading=26),
        "vendor_name": ps("vname", fontName="Helvetica-Bold", fontSize=13,
                          textColor=C_TEAL, leading=17),
        # Secciones
        "sec":       ps("sec",     fontName="Helvetica-Bold", fontSize=9,
                        textColor=C_TEAL, leading=12),
        # KPI cards
        "kpi_val":   ps("kv",      fontName="Helvetica-Bold", fontSize=18,
                        alignment=TA_CENTER, leading=22),
        "kpi_lbl":   ps("kl",      fontName="Helvetica", fontSize=8,
                        textColor=C_TEXT_MUTED, alignment=TA_CENTER, leading=11),
        # Body
        "body":      ps("body",    fontName="Helvetica", fontSize=9,
                        textColor=C_TEXT_DARK, leading=13),
        "body_b":    ps("bodyb",   fontName="Helvetica-Bold", fontSize=9,
                        textColor=C_TEXT_DARK, leading=13),
        "muted":     ps("muted",   fontName="Helvetica", fontSize=8,
                        textColor=C_TEXT_MUTED, leading=11),
        # Tabla cobertura negocio
        "cob_th":    ps("cobth",   fontName="Helvetica-Bold", fontSize=9,
                        textColor=C_BLANCO, alignment=TA_CENTER, leading=12),
        "cob_td":    ps("cobtd",   fontName="Helvetica", fontSize=9,
                        textColor=C_TEXT_DARK, leading=12),
        "cob_pct":   ps("cobpct",  fontName="Helvetica-Bold", fontSize=9,
                        alignment=TA_CENTER, leading=12),
        # Liquidación
        "liq_th":    ps("liqth",   fontName="Helvetica-Bold", fontSize=8,
                        textColor=C_BLANCO, alignment=TA_CENTER, leading=11),
        "liq_td":    ps("liqtd",   fontName="Helvetica", fontSize=8,
                        textColor=C_TEXT_DARK, leading=11),
        "liq_pago_ok":  ps("lpo",  fontName="Helvetica-Bold", fontSize=9,
                           textColor=C_GREEN, alignment=TA_CENTER, leading=12),
        "liq_pago_no":  ps("lpn",  fontName="Helvetica-Bold", fontSize=9,
                           textColor=C_TEXT_MUTED, alignment=TA_CENTER, leading=12),
        # Total a pagar
        "total_lbl": ps("tlbl",    fontName="Helvetica-Bold", fontSize=12,
                        textColor=C_TEXT_DARK, leading=16),
        "total_val": ps("tval",    fontName="Helvetica-Bold", fontSize=20,
                        textColor=C_TEAL, alignment=TA_RIGHT, leading=24),
        # Nota nómina
        "nota":      ps("nota",    fontName="Helvetica-Bold", fontSize=10,
                        leading=15),
        # Footer
        "footer":    ps("footer",  fontName="Helvetica", fontSize=7,
                        textColor=C_TEXT_MUTED, alignment=TA_CENTER, leading=10),
        # Consolidado
        "cons_th":   ps("cth",     fontName="Helvetica-Bold", fontSize=7,
                        textColor=C_BLANCO, alignment=TA_CENTER, leading=9),
        "cons_td":   ps("ctd",     fontName="Helvetica", fontSize=8,
                        textColor=C_TEXT_DARK, leading=10),
        "cons_pay":  ps("cpay",    fontName="Helvetica-Bold", fontSize=8,
                        textColor=C_TEAL, alignment=TA_RIGHT, leading=10),
        "cons_zero": ps("czero",   fontName="Helvetica", fontSize=8,
                        textColor=C_TEXT_MUTED, alignment=TA_RIGHT, leading=10),
    }


# ── HELPERS PDF ───────────────────────────────────────────────────────────
def _sec_header(text, styles):
    return [
        Paragraph(text, styles["sec"]),
        HRFlowable(width="100%", thickness=1.2, color=C_TEAL, spaceBefore=2, spaceAfter=8),
    ]


def _kpi_card(value_str, label, val_color, W_card, styles):
    vp = ParagraphStyle("kv2", parent=styles["kpi_val"], textColor=val_color)
    t = Table([
        [Paragraph(value_str, vp)],
        [Paragraph(label, styles["kpi_lbl"])],
    ], colWidths=[W_card - 6])
    t.setStyle(TableStyle([
        ("BOX",          (0,0), (-1,-1), 0.75, C_GRIS_LINE),
        ("BACKGROUND",   (0,0), (-1,-1), C_BLANCO),
        ("TOPPADDING",   (0,0), (-1,-1), 10),
        ("BOTTOMPADDING",(0,0), (-1,-1), 10),
        ("LEFTPADDING",  (0,0), (-1,-1), 4),
        ("RIGHTPADDING", (0,0), (-1,-1), 4),
    ]))
    return t


def _det_row(label, value, extra="", label_bold=False, val_color=None):
    lbl_s = "body_b" if label_bold else "body"
    return [label, value, extra]


# ── PDF INDIVIDUAL ────────────────────────────────────────────────────────
def build_pdf_individual(r, styles, out):
    doc = SimpleDocTemplate(
        out, pagesize=A4,
        topMargin=1.5*cm, bottomMargin=1.5*cm,
        leftMargin=2.0*cm, rightMargin=2.0*cm,
        title=f"Reporte Individual {PERIODO_LABEL} — {r['nombre_limpio']}",
    )
    W = A4[0] - 4.0*cm
    story = []

    pct_cum = r["pct_cumplimiento"]
    pct_ef  = r["efectividad"]

    # ── ENCABEZADO ────────────────────────────────────────────────────────
    story.append(Paragraph("PALMA · Distribuciones Palumar S.A.", styles["brand"]))
    story.append(HRFlowable(width=W, thickness=1.5, color=C_TEAL, spaceBefore=4, spaceAfter=10))
    story.append(Paragraph(f"Reporte Individual · {PERIODO_LABEL}", styles["title"]))
    story.append(Spacer(1, 3))
    story.append(Paragraph(f"{r['cod']} — {r['nombre_limpio']}", styles["vendor_name"]))
    story.append(Spacer(1, 0.5*cm))

    # ── RESUMEN DE VENTAS (KPIs) ──────────────────────────────────────────
    for e in _sec_header("RESUMEN DE VENTAS", styles):
        story.append(e)

    # Colores para valores KPI
    cum_color = C_GREEN if pct_cum >= 100 else (C_AMBER if pct_cum >= 80 else C_RED)
    cob_color = C_GREEN if r["cobertura"] >= 85 else (C_AMBER if r["cobertura"] >= 70 else C_RED)
    dev_color = C_RED if r["pct_devolucion"] > 8 else C_ORANGE

    W_card = (W - 18) / 4   # 4 cards por fila, 18 = 6 gaps × 3px padding
    kpi_row1 = [
        _kpi_card(fmt_usd(r["venta_bruta"]),    "Venta Bruta",       C_TEAL,    W_card, styles),
        _kpi_card(fmt_usd(r["devol"]),           "Devoluciones",      C_RED,     W_card, styles),
        _kpi_card(fmt_pct(r["pct_devolucion"]),  "% Devolución",      dev_color, W_card, styles),
        _kpi_card(fmt_usd(r["venta_neta"]),      "Venta Neta",        C_TEAL,    W_card, styles),
    ]
    kpi_row2 = [
        _kpi_card(fmt_pct(r["cobertura"]),       "Cobertura",         cob_color, W_card, styles),
        _kpi_card(f"{r['impactados']}/{r['maestro']}", "Clientes", C_TEAL, W_card, styles),
        _kpi_card(fmt_usd(r["cuota"]),           "Meta Mensual",      C_TEAL,    W_card, styles),
        _kpi_card(fmt_pct(pct_cum),              "Cumpl. de Meta",    cum_color, W_card, styles),
    ]
    kpi_outer = Table([kpi_row1, kpi_row2],
                      colWidths=[W_card]*4, rowHeights=[None, None])
    kpi_outer.setStyle(TableStyle([
        ("TOPPADDING",    (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("LEFTPADDING",   (0,0), (-1,-1), 3),
        ("RIGHTPADDING",  (0,0), (-1,-1), 3),
    ]))
    story.append(kpi_outer)
    story.append(Spacer(1, 0.5*cm))

    # ── PROGRESO VS META ──────────────────────────────────────────────────
    for e in _sec_header("PROGRESO VS META", styles):
        story.append(e)

    story.append(ProgressBar(pct_cum, W, height=18))
    story.append(Spacer(1, 4))

    if pct_cum >= 100:
        brecha = r["venta_neta"] - r["cuota"]
        prog_text = (f"<b>{fmt_pct(pct_cum)}</b> logrado — "
                     f"Superó la meta en <b>{fmt_usd(brecha)}</b>")
        prog_color = C_GREEN
    else:
        falta = max(0, r["cuota"] - r["venta_neta"])
        prog_text = (f"<b>{fmt_pct(pct_cum)}</b> logrado — "
                     f"Faltan <b>{fmt_usd(falta)}</b> para alcanzar la meta")
        prog_color = C_RED if pct_cum < 80 else C_AMBER

    story.append(Paragraph(prog_text, ParagraphStyle(
        "prog", parent=styles["body"], textColor=prog_color)))
    story.append(Spacer(1, 0.5*cm))

    # ── DETALLE FINANCIERO ────────────────────────────────────────────────
    for e in _sec_header("DETALLE FINANCIERO", styles):
        story.append(e)

    det_rows = [
        [Paragraph("Venta Bruta del mes",     styles["body"]),
         Paragraph(fmt_usd(r["venta_bruta"]), styles["body"]),
         Paragraph("", styles["body"])],
        [Paragraph("(-) Devoluciones",        styles["body"]),
         Paragraph(fmt_usd(r["devol"]),
                   ParagraphStyle("dv", parent=styles["body"], textColor=C_RED)),
         Paragraph(f"({fmt_pct(r['pct_devolucion'])})", styles["muted"])],
    ]
    if r["averia_total"] > 0:
        det_rows.append([
            Paragraph("(-) Averías",              styles["body"]),
            Paragraph(fmt_usd(r["averia_total"]),
                      ParagraphStyle("av", parent=styles["body"], textColor=C_RED)),
            Paragraph(f"({fmt_pct(r['pct_averia'])})", styles["muted"]),
        ])
    det_rows += [
        [Paragraph("= Venta Neta",             styles["body_b"]),
         Paragraph(fmt_usd(r["venta_neta"]),
                   ParagraphStyle("vn", parent=styles["body_b"], textColor=C_TEAL)),
         Paragraph("", styles["body"])],
        [Paragraph("Meta asignada",            styles["body"]),
         Paragraph(fmt_usd(r["cuota"]),        styles["body"]),
         Paragraph("", styles["body"])],
        [Paragraph("% Cumplimiento",           styles["body"]),
         Paragraph(fmt_pct(pct_cum),
                   ParagraphStyle("pc", parent=styles["body_b"], textColor=cum_color)),
         Paragraph("", styles["body"])],
        [Paragraph("Cobertura",                styles["body"]),
         Paragraph(fmt_pct(r["cobertura"]),
                   ParagraphStyle("cv", parent=styles["body_b"], textColor=cob_color)),
         Paragraph(f"{r['impactados']} de {r['maestro']} clientes", styles["muted"])],
        [Paragraph("Efectividad de visita",    styles["body"]),
         Paragraph(fmt_pct(pct_ef),
                   ParagraphStyle("ef", parent=styles["body_b"],
                                  textColor=C_GREEN if pct_ef >= 90 else
                                           (C_AMBER if pct_ef >= 80 else C_RED))),
         Paragraph("", styles["body"])],
    ]
    det_tbl = Table(det_rows, colWidths=[W*0.48, W*0.28, W*0.24])
    det_tbl.setStyle(TableStyle([
        ("BOX",          (0,0), (-1,-1), 0.5, C_GRIS_LINE),
        ("INNERGRID",    (0,0), (-1,-1), 0.3, C_GRIS_LINE),
        ("TOPPADDING",   (0,0), (-1,-1), 5),
        ("BOTTOMPADDING",(0,0), (-1,-1), 5),
        ("LEFTPADDING",  (0,0), (-1,-1), 10),
        ("RIGHTPADDING", (0,0), (-1,-1), 10),
        # Fondo alternado
        *[("BACKGROUND", (0,i), (-1,i), C_GRIS_CELL if i%2==0 else C_BLANCO)
          for i in range(len(det_rows))],
    ]))
    story.append(det_tbl)
    story.append(Spacer(1, 0.5*cm))

    # ── CARTERA ───────────────────────────────────────────────────────────
    for e in _sec_header("CARTERA PENDIENTE (CXC)", styles):
        story.append(e)

    if r["cartera_total"] > 0:
        crt_rows = [
            [Paragraph("Total pendiente de cobro",      styles["body"]),
             Paragraph(fmt_usd(r["cartera_total"]),
                       ParagraphStyle("ct", parent=styles["body_b"], textColor=C_RED))],
            [Paragraph("Número de facturas abiertas",   styles["body"]),
             Paragraph(str(r["cartera_facturas"]),      styles["body"])],
            [Paragraph("% sobre cartera total equipo",  styles["body"]),
             Paragraph(fmt_pct(r["cartera_pct_equipo"]),styles["body"])],
        ]
    else:
        crt_rows = [
            [Paragraph("Cartera pendiente", styles["body"]),
             Paragraph("$0.00 — Sin saldo pendiente", styles["body"])],
        ]
    crt_tbl = Table(crt_rows, colWidths=[W*0.55, W*0.45])
    crt_tbl.setStyle(TableStyle([
        ("BOX",          (0,0), (-1,-1), 0.5, C_GRIS_LINE),
        ("INNERGRID",    (0,0), (-1,-1), 0.3, C_GRIS_LINE),
        ("TOPPADDING",   (0,0), (-1,-1), 5),
        ("BOTTOMPADDING",(0,0), (-1,-1), 5),
        ("LEFTPADDING",  (0,0), (-1,-1), 10),
        ("RIGHTPADDING", (0,0), (-1,-1), 10),
        *[("BACKGROUND", (0,i), (-1,i), C_GRIS_CELL if i%2==0 else C_BLANCO)
          for i in range(len(crt_rows))],
    ]))
    story.append(crt_tbl)

    # ── PÁG. 2: COBERTURA POR NEGOCIO + NOTA DE NÓMINA ───────────────────
    story.append(PageBreak())

    # Repetir encabezado mini
    story.append(Paragraph("PALMA · Distribuciones Palumar S.A.", styles["brand"]))
    story.append(HRFlowable(width=W, thickness=1.5, color=C_TEAL, spaceBefore=2, spaceAfter=6))
    story.append(Paragraph(f"{r['cod']} — {r['nombre_limpio']} · {PERIODO_LABEL}",
                            styles["vendor_name"]))
    story.append(Spacer(1, 0.4*cm))

    for e in _sec_header("COBERTURA POR NEGOCIO", styles):
        story.append(e)

    cob_data = [[
        Paragraph("Negocio",     styles["cob_th"]),
        Paragraph("Maestro",     styles["cob_th"]),
        Paragraph("Impactados",  styles["cob_th"]),
        Paragraph("Cobertura",   styles["cob_th"]),
        Paragraph("Venta Neta",  styles["cob_th"]),
    ]]
    for row in r["cob_negocios"]:
        cob = row["cobertura"]
        cob_c = C_GREEN if cob >= 70 else (C_AMBER if cob >= 40 else C_RED)
        cob_data.append([
            Paragraph(row["negocio"],          styles["cob_td"]),
            Paragraph(str(row["maestro"]),
                      ParagraphStyle("cm", parent=styles["cob_td"],
                                     textColor=C_TEXT_MUTED, alignment=TA_CENTER)),
            Paragraph(str(row["impactados"]),
                      ParagraphStyle("ci", parent=styles["cob_td"], alignment=TA_CENTER)),
            Paragraph(fmt_pct(cob),
                      ParagraphStyle("cc", parent=styles["cob_pct"], textColor=cob_c)),
            Paragraph(fmt_usd(row["venta"]) if row["venta"] else "—",
                      ParagraphStyle("cv2", parent=styles["cob_td"], alignment=TA_RIGHT)),
        ])
    if not r["cob_negocios"]:
        _e = Paragraph("", styles["body"])
        cob_data.append([Paragraph("Sin datos de cobertura", styles["body"]),
                          _e, _e, _e, _e])

    cob_tbl = Table(cob_data, colWidths=[W*0.38, W*0.12, W*0.14, W*0.14, W*0.22],
                    repeatRows=1)
    n_cob = len(cob_data)
    cob_tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1,0), C_ORANGE_HDR),
        ("BOX",          (0,0), (-1,-1), 0.5, C_GRIS_LINE),
        ("INNERGRID",    (0,0), (-1,-1), 0.3, C_GRIS_LINE),
        ("TOPPADDING",   (0,0), (-1,-1), 5),
        ("BOTTOMPADDING",(0,0), (-1,-1), 5),
        ("LEFTPADDING",  (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("VALIGN",       (0,0), (-1,-1), "MIDDLE"),
        *[("BACKGROUND", (0,i), (-1,i), C_GRIS_CELL if i%2==0 else C_BLANCO)
          for i in range(1, n_cob)],
    ]))
    story.append(cob_tbl)
    story.append(Spacer(1, 0.7*cm))

    # ── NOTA DE NÓMINA ────────────────────────────────────────────────────
    for e in _sec_header("NOTA DE NÓMINA", styles):
        story.append(e)

    nota_text, nota_color = nota_nomina(r)
    nota_tbl = Table([[Paragraph(nota_text,
                                  ParagraphStyle("nm", parent=styles["nota"],
                                                 textColor=nota_color))]],
                     colWidths=[W])
    nota_tbl.setStyle(TableStyle([
        ("BOX",          (0,0), (-1,-1), 1.2, nota_color),
        ("BACKGROUND",   (0,0), (-1,-1), C_BLANCO),
        ("TOPPADDING",   (0,0), (-1,-1), 12),
        ("BOTTOMPADDING",(0,0), (-1,-1), 12),
        ("LEFTPADDING",  (0,0), (-1,-1), 14),
        ("RIGHTPADDING", (0,0), (-1,-1), 14),
    ]))
    story.append(nota_tbl)

    # ── PÁG. 3: LIQUIDACIÓN DE INCENTIVOS ────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("PALMA · Distribuciones Palumar S.A.", styles["brand"]))
    story.append(HRFlowable(width=W, thickness=1.5, color=C_TEAL, spaceBefore=2, spaceAfter=6))
    story.append(Paragraph(f"{r['cod']} — {r['nombre_limpio']} · {PERIODO_LABEL}",
                            styles["vendor_name"]))
    story.append(Spacer(1, 0.4*cm))

    for e in _sec_header(f"LIQUIDACIÓN DE INCENTIVOS — {PERIODO_LABEL.upper()}", styles):
        story.append(e)

    liq_hdr = [Paragraph(t, styles["liq_th"]) for t in
               ["Concepto","Resultado","Escala","VBI","Pago"]]

    def liq_row(concepto, resultado, escala, vbi_val, pago, es_ok=None):
        if es_ok is None: es_ok = pago > 0
        pst = styles["liq_pago_ok"] if es_ok else styles["liq_pago_no"]
        return [
            Paragraph(f"<b>{concepto}</b>", styles["liq_td"]),
            Paragraph(resultado,            styles["liq_td"]),
            Paragraph(escala,               styles["liq_td"]),
            Paragraph(fmt_usd(vbi_val),     styles["liq_td"]),
            Paragraph(fmt_usd(pago),        pst),
        ]

    liq_rows = [liq_hdr,
        liq_row("Presupuesto / Total negocio",
                fmt_pct(r["pct_cumplimiento"]) + " cumplimiento",
                r["tramo_ppto"], VBI_PRESUPUESTO, r["p_ppto"]),
        liq_row("Efectividad de visitas",
                fmt_pct(r["pct_ef"]) + " efectividad",
                r["tramo_ef"], VBI_EFECTIVIDAD, r["p_ef"]),
        liq_row("Distribución numérica Café",
                f"{fmt_pct(r['pct_cafe'])} ({r['imp_cafe']}/{r['mae_cafe']})",
                r["tramo_cafe"], VBI_DN_CAFE, r["p_cafe"]),
        liq_row("Clientes nuevos con pedido",
                f"{r['n_nuevos']} clientes (meta {META_NUEVOS})",
                r["tramo_nuevos"], VBI_NUEVOS, r["p_nuevos"]),
        liq_row("Cliente cero",
                f"{fmt_pct(r['pct_cero'])} ({r['sc']}/{r['mae']})",
                r["tramo_cero"], VBI_CERO, r["p_cero"]),
    ]

    # Separador concursos
    _e2 = Paragraph("", styles["liq_td"])
    liq_rows.append([
        Paragraph("<i>CONCURSOS COMERCIALES</i>",
                  ParagraphStyle("csep", parent=styles["liq_td"],
                                 textColor=C_TEXT_MUTED, fontName="Helvetica-Oblique")),
        _e2, _e2, _e2, _e2,
    ])
    tosh_bloq = math.floor(r["tosh_n"] / 20)
    liq_rows += [
        liq_row("Barras TOSH",
                f"{r['tosh_n']} clientes ({tosh_bloq} bloques de 20)",
                f"$10/bloque", 0, r["tosh_pago"]),
        liq_row("Nutrición Experta",
                fmt_usd(r["ne_venta"]) + " en venta NE",
                "≥$200 → $20", 0, r["ne_pago"]),
        liq_row("Clientes nuevos HORECA",
                f"{len(r['horeca_list'])} cliente(s)",
                "$1/cliente", 0, r["horeca_pago"]),
    ]

    n_liq = len(liq_rows)
    liq_tbl = Table(liq_rows, colWidths=[W*.30, W*.22, W*.20, W*.10, W*.18],
                    repeatRows=1)
    sep_row = 6  # index of the concursos separator
    liq_tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1,0), C_TEAL_DARK),
        ("BOX",          (0,0), (-1,-1), 0.5, C_GRIS_LINE),
        ("INNERGRID",    (0,0), (-1,-1), 0.3, C_GRIS_LINE),
        ("TOPPADDING",   (0,0), (-1,-1), 5),
        ("BOTTOMPADDING",(0,0), (-1,-1), 5),
        ("LEFTPADDING",  (0,0), (-1,-1), 7),
        ("RIGHTPADDING", (0,0), (-1,-1), 7),
        ("VALIGN",       (0,0), (-1,-1), "MIDDLE"),
        ("BACKGROUND",   (0,sep_row), (-1,sep_row), C_TEAL_LIGHT),
        *[("BACKGROUND", (0,i), (-1,i), C_GRIS_CELL if i%2==0 else C_BLANCO)
          for i in range(1, n_liq) if i != sep_row],
    ]))
    story.append(liq_tbl)
    story.append(Spacer(1, 0.5*cm))

    # ── TOTAL A PAGAR ─────────────────────────────────────────────────────
    tot_color = C_GREEN if r["total_final"] >= 100 else (C_AMBER if r["total_final"] > 0 else C_RED)
    tot_tbl = Table([[
        Paragraph("TOTAL A PAGAR — JUNIO 2026", styles["total_lbl"]),
        Paragraph(f"<b>{fmt_usd(r['total_final'])}</b>",
                  ParagraphStyle("tv2", parent=styles["total_val"], textColor=tot_color)),
    ]], colWidths=[W*0.55, W*0.45])
    tot_tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1,-1), C_TEAL_LIGHT),
        ("BOX",          (0,0), (-1,-1), 1.5, C_TEAL),
        ("TOPPADDING",   (0,0), (-1,-1), 12),
        ("BOTTOMPADDING",(0,0), (-1,-1), 12),
        ("LEFTPADDING",  (0,0), (-1,-1), 14),
        ("RIGHTPADDING", (0,0), (-1,-1), 14),
        ("VALIGN",       (0,0), (-1,-1), "MIDDLE"),
    ]))
    story.append(tot_tbl)
    story.append(Spacer(1, 0.4*cm))

    # ── PIE DE PÁGINA ─────────────────────────────────────────────────────
    story.append(Paragraph(
        f"Reporte generado por PALMA · Distribuciones Palumar S.A. · {PERIODO_LABEL} · Confidencial",
        styles["footer"]))

    doc.build(story)


# ── PDF CONSOLIDADO MEJORADO ──────────────────────────────────────────────
def build_pdf_consolidado(results, styles, out):
    doc = SimpleDocTemplate(
        out, pagesize=(A4[1], A4[0]),  # landscape
        topMargin=1.2*cm, bottomMargin=1.2*cm,
        leftMargin=1.5*cm, rightMargin=1.5*cm,
        title=f"Consolidado Incentivos PALUMAR — {PERIODO_LABEL}",
    )
    W = A4[1] - 3.0*cm
    story = []

    # ── ENCABEZADO ────────────────────────────────────────────────────────
    story.append(Paragraph("PALMA · Distribuciones Palumar S.A.", styles["brand"]))
    story.append(HRFlowable(width=W, thickness=1.5, color=C_TEAL, spaceBefore=2, spaceAfter=6))
    story.append(Paragraph(f"Consolidado de Pagos de Incentivos · {PERIODO_LABEL}",
                            ParagraphStyle("ctit", parent=styles["title"], fontSize=18)))
    story.append(Paragraph(f"Generado el {FECHA_GEN}", styles["muted"]))
    story.append(Spacer(1, 0.5*cm))

    # ── RESUMEN EJECUTIVO ─────────────────────────────────────────────────
    grand_total  = sum(r["total_final"] for r in results)
    total_ind    = sum(r["total_indicadores"] for r in results)
    total_con    = sum(r["total_concursos"] for r in results)
    pagos        = [r["total_final"] for r in results]
    mayor        = max(pagos)
    menor        = min(pagos)
    promedio     = grand_total / len(results)
    con_pago     = sum(1 for p in pagos if p > 0)
    sin_pago     = len(pagos) - con_pago
    vendedor_max = next(r["nombre_limpio"][:18] for r in results if r["total_final"] == mayor)
    vendedor_min = next(r["nombre_limpio"][:18] for r in results if r["total_final"] == menor)

    summ_data = [
        [Paragraph("Total a pagar",          styles["body"]),
         Paragraph(fmt_usd(grand_total),
                   ParagraphStyle("sv1", parent=styles["body_b"],
                                  textColor=C_TEAL, fontSize=13)),
         Paragraph("Indicadores",            styles["body"]),
         Paragraph(fmt_usd(total_ind),       styles["body_b"]),
         Paragraph("Concursos",              styles["body"]),
         Paragraph(fmt_usd(total_con),       styles["body_b"])],
        [Paragraph("Vendedores liquidados",  styles["body"]),
         Paragraph(str(len(results)),        styles["body_b"]),
         Paragraph("Con pago variable",      styles["body"]),
         Paragraph(str(con_pago),
                   ParagraphStyle("sv2", parent=styles["body_b"], textColor=C_GREEN)),
         Paragraph("Sin pago variable",      styles["body"]),
         Paragraph(str(sin_pago),
                   ParagraphStyle("sv3", parent=styles["body_b"], textColor=C_RED))],
        [Paragraph("Mayor pago",             styles["body"]),
         Paragraph(f"{fmt_usd(mayor)} ({vendedor_max})", styles["body_b"]),
         Paragraph("Menor pago",             styles["body"]),
         Paragraph(f"{fmt_usd(menor)} ({vendedor_min})", styles["body_b"]),
         Paragraph("Promedio",               styles["body"]),
         Paragraph(fmt_usd(promedio),        styles["body_b"])],
    ]
    summ_tbl = Table(summ_data, colWidths=[W*0.13, W*0.20, W*0.12, W*0.18, W*0.12, W*0.25])
    summ_tbl.setStyle(TableStyle([
        ("BOX",          (0,0), (-1,-1), 0.5, C_GRIS_LINE),
        ("INNERGRID",    (0,0), (-1,-1), 0.3, C_GRIS_LINE),
        ("TOPPADDING",   (0,0), (-1,-1), 6),
        ("BOTTOMPADDING",(0,0), (-1,-1), 6),
        ("LEFTPADDING",  (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("BACKGROUND",   (0,0), (-1,-1), C_GRIS_CELL),
    ]))
    story.append(summ_tbl)
    story.append(Spacer(1, 0.4*cm))

    # ── TABLA PRINCIPAL ───────────────────────────────────────────────────
    for e in _sec_header("DETALLE POR VENDEDOR", styles):
        story.append(e)

    cols = [
        ("Cód",         W*.038), ("Vendedor",  W*.118),
        ("Venta\nNeta", W*.064), ("Cuota",     W*.064),
        ("%\nCum.",     W*.042),
        ("Cob.\n%",     W*.040), ("Efec.\n%",  W*.040),
        ("Pago\nPpto.", W*.058), ("Pago\nEfec.",W*.058),
        ("Pago\nCafé",  W*.052), ("Pago\nNuevos",W*.052),
        ("Pago\nCero",  W*.052),
        ("TOSH",        W*.046), ("NE",        W*.040), ("HOR.",W*.040),
        ("TOTAL\nFINAL",W*.094),
    ]
    headers  = [c[0] for c in cols]
    col_w    = [c[1] for c in cols]

    def _c(val, ps=None):
        return Paragraph(val, ps or styles["cons_td"])
    def _pay(val):
        return Paragraph(fmt_usd(val),
                         styles["cons_pay"] if val > 0 else styles["cons_zero"])

    rows = [[Paragraph(h, styles["cons_th"]) for h in headers]]
    tot  = defaultdict(float)

    sorted_results = sorted(results, key=lambda x: -x["total_final"])
    for i, r in enumerate(sorted_results):
        pct_c = r["pct_cumplimiento"]
        pct_e = r["pct_ef"]
        bg    = C_GRIS_CELL if i % 2 == 0 else C_BLANCO
        rows.append([
            _c(r["cod"]),
            _c(r["nombre_limpio"][:18]),
            _c(fmt_usd(r["venta_neta"])),
            _c(fmt_usd(r["cuota"])),
            Paragraph(fmt_pct(pct_c),
                      ParagraphStyle("pc2", parent=styles["cons_td"],
                                     textColor=C_GREEN if pct_c>=100 else
                                              (C_AMBER if pct_c>=80 else C_RED),
                                     fontName="Helvetica-Bold", alignment=TA_CENTER)),
            Paragraph(fmt_pct(r["cobertura"]),
                      ParagraphStyle("cob2", parent=styles["cons_td"],
                                     textColor=C_GREEN if r["cobertura"]>=85 else
                                              (C_AMBER if r["cobertura"]>=70 else C_RED),
                                     alignment=TA_CENTER)),
            Paragraph(fmt_pct(pct_e),
                      ParagraphStyle("ef2", parent=styles["cons_td"],
                                     textColor=C_GREEN if pct_e>=90 else
                                              (C_AMBER if pct_e>=80 else C_RED),
                                     alignment=TA_CENTER)),
            _pay(r["p_ppto"]), _pay(r["p_ef"]),
            _pay(r["p_cafe"]), _pay(r["p_nuevos"]), _pay(r["p_cero"]),
            _pay(r["tosh_pago"]), _pay(r["ne_pago"]), _pay(r["horeca_pago"]),
            Paragraph(f"<b>{fmt_usd(r['total_final'])}</b>",
                      ParagraphStyle("tf", parent=styles["cons_pay"], fontSize=9)),
        ])
        for k in ["p_ppto","p_ef","p_cafe","p_nuevos","p_cero",
                  "tosh_pago","ne_pago","horeca_pago","total_final"]:
            tot[k] += r[k]

    # Fila totales
    rows.append([
        _c(""), _c("<b>TOTALES</b>", styles["body_b"]),
        _c(""), _c(""), _c(""),
        _c(""), _c(""),
        Paragraph(f"<b>{fmt_usd(tot['p_ppto'])}</b>",    styles["cons_pay"]),
        Paragraph(f"<b>{fmt_usd(tot['p_ef'])}</b>",      styles["cons_pay"]),
        Paragraph(f"<b>{fmt_usd(tot['p_cafe'])}</b>",    styles["cons_pay"]),
        Paragraph(f"<b>{fmt_usd(tot['p_nuevos'])}</b>",  styles["cons_pay"]),
        Paragraph(f"<b>{fmt_usd(tot['p_cero'])}</b>",    styles["cons_pay"]),
        Paragraph(f"<b>{fmt_usd(tot['tosh_pago'])}</b>", styles["cons_pay"]),
        Paragraph(f"<b>{fmt_usd(tot['ne_pago'])}</b>",   styles["cons_pay"]),
        Paragraph(f"<b>{fmt_usd(tot['horeca_pago'])}</b>",styles["cons_pay"]),
        Paragraph(f"<b>{fmt_usd(tot['total_final'])}</b>",
                  ParagraphStyle("tft", parent=styles["cons_pay"], fontSize=10)),
    ])

    n_rows = len(rows)
    main_tbl = Table(rows, colWidths=col_w, repeatRows=1)
    main_tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1,0),       C_TEAL_DARK),
        ("BACKGROUND",   (0,n_rows-1), (-1,n_rows-1), C_TEAL_LIGHT),
        ("LINEABOVE",    (0,n_rows-1), (-1,n_rows-1), 1.0, C_TEAL),
        ("BOX",          (0,0), (-1,-1),      0.5, C_GRIS_LINE),
        ("INNERGRID",    (0,0), (-1,-1),      0.3, C_GRIS_LINE),
        ("TOPPADDING",   (0,0), (-1,-1),      3),
        ("BOTTOMPADDING",(0,0), (-1,-1),      3),
        ("LEFTPADDING",  (0,0), (-1,-1),      3),
        ("RIGHTPADDING", (0,0), (-1,-1),      3),
        ("VALIGN",       (0,0), (-1,-1),      "MIDDLE"),
        *[("BACKGROUND", (0,i), (-1,i), C_GRIS_CELL if i%2==0 else C_BLANCO)
          for i in range(1, n_rows-1)],
    ]))
    story.append(main_tbl)
    story.append(Spacer(1, 0.5*cm))

    # ── ALERTAS ────────────────────────────────────────────────────────────
    alertas = []
    sin_presup = [r["nombre_limpio"][:15] for r in results if r["p_ppto"] == 0]
    if sin_presup:
        alertas.append(f"⚠ {len(sin_presup)} vendedor(es) sin pago de presupuesto (cumplimiento < 80%): "
                       + ", ".join(sin_presup))
    sin_efec = [r["nombre_limpio"][:15] for r in results if r["p_ef"] == 0]
    if sin_efec:
        alertas.append(f"⚠ {len(sin_efec)} vendedor(es) con efectividad < 80%: "
                       + ", ".join(sin_efec))
    if sin_pago > 0:
        sin_list = [r["nombre_limpio"][:15] for r in results if r["total_final"] == 0]
        alertas.append(f"⚠ {sin_pago} vendedor(es) sin ningún pago variable: "
                       + ", ".join(sin_list))

    if alertas:
        for e in _sec_header("ALERTAS", styles):
            story.append(e)
        for a in alertas:
            story.append(Paragraph(a,
                ParagraphStyle("al", parent=styles["body"],
                               textColor=C_ORANGE, leftIndent=8, spaceAfter=3)))
        story.append(Spacer(1, 0.3*cm))

    # Nota pie
    story.append(Paragraph(
        f"VBI: Presupuesto=${VBI_PRESUPUESTO:.0f} · Efectividad=${VBI_EFECTIVIDAD:.0f} · "
        f"DN Café/Nuevos/Cero=${VBI_DN_CAFE:.0f}. "
        f"Tabla ordenada por total final descendente. "
        f"Fuente: BASE_ACUMULADA · FRECUENCIA_ECOM · MAESTRO_CLIENTES. "
        f"Generado el {FECHA_GEN}.",
        styles["footer"]))

    doc.build(story)


# ── CSVs ──────────────────────────────────────────────────────────────────
def write_csv_consolidado(results, out):
    fields = [
        "cod","nombre_limpio","venta_neta","cuota","pct_cumplimiento",
        "tramo_ppto","p_ppto","pct_ef","tramo_ef","p_ef",
        "pct_cafe","imp_cafe","mae_cafe","tramo_cafe","p_cafe",
        "n_nuevos","tramo_nuevos","p_nuevos",
        "pct_cero","sc","mae","tramo_cero","p_cero",
        "tosh_n","tosh_pago","ne_venta","ne_pago","horeca_pago",
        "total_indicadores","total_concursos","total_final",
    ]
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for r in results:
            row = {k: r[k] for k in fields}
            for k in ["venta_neta","cuota","p_ppto","p_ef","p_cafe","p_nuevos",
                      "p_cero","tosh_pago","ne_venta","ne_pago","horeca_pago",
                      "total_indicadores","total_concursos","total_final"]:
                row[k] = f"{r[k]:.2f}"
            w.writerow(row)


def write_csv_calculos(results, out):
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["cod","nombre","venta_neta","cuota","pct_cum",
                    "tramo_ppto","formula_ppto","p_ppto",
                    "pct_ef","tramo_ef","formula_ef","p_ef",
                    "pct_cafe","tramo_cafe","p_cafe",
                    "n_nuevos","tramo_nuevos","p_nuevos",
                    "pct_cero","tramo_cero","p_cero",
                    "tosh_n","bloq20","tosh_pago",
                    "ne_venta","ne_pago","horeca_n","horeca_pago",
                    "total_ind","total_con","total_final"])
        for r in results:
            w.writerow([r["cod"],r["nombre_limpio"],
                        f"{r['venta_neta']:.2f}",f"{r['cuota']:.2f}",f"{r['pct_cumplimiento']:.2f}",
                        r["tramo_ppto"],r["formula_ppto"],f"{r['p_ppto']:.2f}",
                        f"{r['pct_ef']:.2f}",r["tramo_ef"],r["formula_ef"],f"{r['p_ef']:.2f}",
                        f"{r['pct_cafe']:.1f}",r["tramo_cafe"],f"{r['p_cafe']:.2f}",
                        r["n_nuevos"],r["tramo_nuevos"],f"{r['p_nuevos']:.2f}",
                        f"{r['pct_cero']:.2f}",r["tramo_cero"],f"{r['p_cero']:.2f}",
                        r["tosh_n"],math.floor(r["tosh_n"]/20),f"{r['tosh_pago']:.2f}",
                        f"{r['ne_venta']:.2f}",f"{r['ne_pago']:.2f}",
                        len(r["horeca_list"]),f"{r['horeca_pago']:.2f}",
                        f"{r['total_indicadores']:.2f}",f"{r['total_concursos']:.2f}",f"{r['total_final']:.2f}"])


def write_csv_horeca(results, out):
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["cod_asesor","nombre","cod_cliente","nombre_cliente","keyword"])
        for r in results:
            for h in r["horeca_list"]:
                w.writerow([r["cod"],r["nombre_limpio"],
                             h.get("cod",""),h.get("nombre",""),h.get("keyword","")])


def write_csv_tosh(results, out):
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["cod_asesor","nombre","clientes_tosh","bloques_20","pago_tosh","skus"])
        for r in results:
            w.writerow([r["cod"],r["nombre_limpio"],r["tosh_n"],
                        math.floor(r["tosh_n"]/20),f"{r['tosh_pago']:.2f}",
                        "; ".join(str(s) for s in r["tosh_skus"])])


def write_csv_ne(results, out):
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["cod_asesor","nombre","venta_ne","meta","alcanza","pago_ne"])
        for r in results:
            w.writerow([r["cod"],r["nombre_limpio"],f"{r['ne_venta']:.2f}",
                        "200.00","SI" if r["ne_venta"]>=200 else "NO",
                        f"{r['ne_pago']:.2f}"])


# ── MAIN ──────────────────────────────────────────────────────────────────
def main():
    print(f"\n{'='*65}")
    print(f"  REPORTE INDIVIDUAL + LIQUIDACIÓN — {PERIODO_LABEL.upper()}")
    print(f"  PALUMAR S.A.")
    print(f"{'='*65}\n")

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # 1. Fetch
    print("1. Obteniendo datos desde API PALMA...\n")
    vendedores_data = fetch("vendedores")
    inc_data        = fetch("incentivos_vendedores")
    cn_data         = fetch("clientes_nuevos", {"desde":"2026-06-01","hasta":"2026-06-30"})
    cob_neg_raw     = fetch("cob_negocio")
    cartera_raw     = fetch("cartera")

    assert isinstance(vendedores_data, list) and len(vendedores_data) > 0

    # inc_map
    inc_map = {str(v["cod"]): v for v in inc_data.get("vendedores",[])}

    # cafe_map: cod → row from cob_negocio where negocio has "caf"
    cafe_map = {}
    cob_neg_map  = defaultdict(list)
    for row in (cob_neg_raw if isinstance(cob_neg_raw, list) else []):
        neg = str(row.get("negocio","")).lower()
        vt  = str(row.get("vendedor",""))
        cod = vt.split("-")[0].strip().zfill(3)
        cob_neg_map[cod].append(row)
        if "caf" in neg:
            cafe_map[cod] = row

    # venta_por_negocio map: cod → {negocio: venta}
    venta_neg_map = {}
    for v in vendedores_data:
        cod = str(v["cod"])
        venta_neg_map[cod] = {r["negocio"]: r.get("venta",0)
                               for r in v.get("venta_por_negocio",[])}

    # nuevos_map
    cn_detalle = cn_data.get("detalle",[]) if isinstance(cn_data, dict) else []
    nuevos_map = Counter(str(c.get("cod_asesor","")).zfill(3) for c in cn_detalle)

    # HORECA
    horeca_por_vend = defaultdict(list)
    horeca_total = 0
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
            horeca_total += 1

    # cartera_map: cod → {total, facturas, pct_equipo}
    cartera_map = {}
    total_eq_crt = float(cartera_raw.get("total_pendiente",0)) if isinstance(cartera_raw, dict) else 0
    for cv in (cartera_raw.get("por_vendedor",[]) if isinstance(cartera_raw, dict) else []):
        cod = str(cv.get("cod_asesor","")).zfill(3)
        pct_eq = cv["total"]/total_eq_crt*100 if total_eq_crt>0 else 0
        cartera_map[cod] = {
            "total":    float(cv.get("total",0)),
            "facturas": int(cv.get("facturas",0)),
            "pct_equipo": round(pct_eq, 1),
        }

    print(f"   Vendedores:        {len(vendedores_data)}")
    print(f"   Clientes nuevos:   {sum(nuevos_map.values())}")
    print(f"   HORECA detectados: {horeca_total}")
    print(f"   Negocios DN Café:  {len(cafe_map)}")
    print(f"   Con cartera:       {len(cartera_map)}")

    # 2. Calcular
    print("\n2. Calculando incentivos...\n")
    results = calcular_incentivos(
        vendedores_data, inc_map, horeca_por_vend,
        cafe_map, nuevos_map, cob_neg_map, cartera_map, venta_neg_map
    )
    assert all(r["total_final"] >= 0 for r in results), "Pago negativo detectado"

    grand = sum(r["total_final"] for r in results)
    # Control: totales deben coincidir con valores previos
    assert abs(grand - 1076.60) < 0.10, f"Total inesperado: {grand:.2f} (esperado 1076.60)"
    print(f"   ✓ Total general: {fmt_usd(grand)}  (control: $1,076.60)")

    # Resumen consola
    fmt = "{:<5} {:<27} {:>7} {:>8} {:>7} {:>7} {:>7} {:>7} {:>8}"
    print(fmt.format("COD","NOMBRE","%CUM","PPTO$","EF$","CAFÉ$","CONC$","CRT$","TOTAL$"))
    print("-"*85)
    for r in results:
        print(fmt.format(
            r["cod"], r["nombre_limpio"][:27],
            fmt_pct(r["pct_cumplimiento"]),
            fmt_usd(r["p_ppto"]), fmt_usd(r["p_ef"]),
            fmt_usd(r["p_cafe"]),
            fmt_usd(r["total_concursos"]),
            fmt_usd(r["cartera_total"]),
            fmt_usd(r["total_final"]),
        ))
    print("-"*85)
    print(f"{'GRAN TOTAL':>55}  {fmt_usd(grand)}")

    # 3. PDFs individuales
    print("\n3. Generando PDFs individuales (3 páginas c/u)...\n")
    styles = make_styles()
    for r in results:
        slug  = slug_nombre(r["nombre"])
        fname = f"LIQUIDACION_INCENTIVOS_JUNIO_2026_{r['cod']}_{slug}.pdf"
        build_pdf_individual(r, styles, os.path.join(OUTPUT_DIR, fname))
        print(f"   ✓ {r['cod']} {r['nombre_limpio'][:22]:22}  Total: {fmt_usd(r['total_final'])}")

    # 4. PDF consolidado
    print("\n4. Generando PDF consolidado...\n")
    build_pdf_consolidado(results, styles,
        os.path.join(OUTPUT_DIR, "CONSOLIDADO_PAGOS_INCENTIVOS_JUNIO_2026.pdf"))
    print("   ✓ CONSOLIDADO_PAGOS_INCENTIVOS_JUNIO_2026.pdf")

    # 5. CSVs
    print("\n5. Generando CSVs...\n")
    write_csv_consolidado(results, os.path.join(OUTPUT_DIR, "CONSOLIDADO_PAGOS_INCENTIVOS_JUNIO_2026.csv"))
    print("   ✓ CONSOLIDADO_PAGOS_INCENTIVOS_JUNIO_2026.csv")
    write_csv_calculos(results,    os.path.join(OUTPUT_DIR, "AUDITORIA_CALCULOS_INCENTIVOS_JUNIO_2026.csv"))
    print("   ✓ AUDITORIA_CALCULOS_INCENTIVOS_JUNIO_2026.csv")
    write_csv_horeca(results,      os.path.join(OUTPUT_DIR, "AUDITORIA_HORECA_JUNIO_2026.csv"))
    print("   ✓ AUDITORIA_HORECA_JUNIO_2026.csv")
    write_csv_tosh(results,        os.path.join(OUTPUT_DIR, "AUDITORIA_TOSH_JUNIO_2026.csv"))
    print("   ✓ AUDITORIA_TOSH_JUNIO_2026.csv")
    write_csv_ne(results,          os.path.join(OUTPUT_DIR, "AUDITORIA_NE_JUNIO_2026.csv"))
    print("   ✓ AUDITORIA_NE_JUNIO_2026.csv")

    # 6. Validaciones
    print("\n6. Validaciones finales...\n")
    assert len(results) == 14
    assert all("Pendiente" not in str(r["tramo_ppto"]) for r in results)
    sum_check = sum(r["total_final"] for r in results)
    assert abs(sum_check - grand) < 0.01
    assert not any(r["total_final"] < 0 for r in results)
    n_pdfs = sum(1 for f in os.listdir(OUTPUT_DIR)
                 if f.startswith("LIQUIDACION_INCENTIVOS_JUNIO_2026_") and f.endswith(".pdf"))
    assert n_pdfs == 14, f"PDFs generados: {n_pdfs}"
    print("   ✓ 14 vendedores procesados")
    print("   ✓ 14 PDFs individuales (3 páginas: desempeño + cobertura + liquidación)")
    print("   ✓ Sin pendientes VBI")
    print("   ✓ Sin pagos negativos")
    print(f"   ✓ Suma individuales = consolidado = {fmt_usd(grand)}")

    print(f"\n{'='*65}")
    print(f"  RESUMEN FINAL — TOTAL A PAGAR JUNIO 2026")
    print(f"{'='*65}")
    print(f"  Presupuesto:           {fmt_usd(sum(r['p_ppto'] for r in results))}")
    print(f"  Efectividad:           {fmt_usd(sum(r['p_ef'] for r in results))}")
    print(f"  DN Café:               {fmt_usd(sum(r['p_cafe'] for r in results))}")
    print(f"  Clientes nuevos:       {fmt_usd(sum(r['p_nuevos'] for r in results))}")
    print(f"  Cliente cero:          {fmt_usd(sum(r['p_cero'] for r in results))}")
    print(f"  ──────────────────────────────────────────")
    print(f"  Subtotal indicadores:  {fmt_usd(sum(r['total_indicadores'] for r in results))}")
    print(f"  Concurso TOSH:         {fmt_usd(sum(r['tosh_pago'] for r in results))}")
    print(f"  Concurso NE:           {fmt_usd(sum(r['ne_pago'] for r in results))}")
    print(f"  Concurso HORECA:       {fmt_usd(sum(r['horeca_pago'] for r in results))}")
    print(f"  Subtotal concursos:    {fmt_usd(sum(r['total_concursos'] for r in results))}")
    print(f"  ══════════════════════════════════════════")
    print(f"  TOTAL GENERAL:         {fmt_usd(grand)}")
    print(f"{'='*65}\n")


if __name__ == "__main__":
    main()
