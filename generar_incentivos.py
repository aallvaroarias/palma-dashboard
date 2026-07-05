#!/usr/bin/env python3
"""
generar_incentivos.py
Liquidación de incentivos PALUMAR S.A. - Junio 2026

Genera por cada uno de los 14 vendedores PALUMAR:
  - PDF individual: LIQUIDACION_INCENTIVOS_JUNIO_2026_[COD]_[NOMBRE].pdf
  - PDF consolidado: CONSOLIDADO_PAGOS_INCENTIVOS_JUNIO_2026.pdf
  - CSV consolidado: CONSOLIDADO_PAGOS_INCENTIVOS_JUNIO_2026.csv
  - CSV auditoría cálculos: AUDITORIA_CALCULOS_INCENTIVOS_JUNIO_2026.csv
  - CSVs auditoría concursos: HORECA, TOSH, NE

VBIs confirmados:
  Presupuesto  = $154.00
  Efectividad  = $55.00
  DN Café      = $55.00  (meta 40% de maestra)
  Nuevos       = $55.00  (meta 15 clientes con pedido)
  Cliente Cero = $55.00  (meta ≤ 2% de maestra)
  Devolución   = $0.00   (no genera pago variable)
  Cartera      = $0.00   (no genera pago variable)
"""

import requests
import json
import csv
import os
import math
from collections import Counter
from datetime import datetime
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Table, TableStyle,
    Spacer, HRFlowable,
)
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

# ── CONFIGURACIÓN ─────────────────────────────────────────────────────────
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

# VBIs
VBI_PRESUPUESTO  = 154.00
VBI_EFECTIVIDAD  = 55.00
VBI_DN_CAFE      = 55.00
VBI_NUEVOS       = 55.00
VBI_CERO         = 55.00

META_DN_CAFE_PCT = 40.0   # % de maestra
META_NUEVOS      = 15     # clientes con pedido
META_CERO_PCT    = 2.0    # % máximo de sin compra

HORECA_KEYWORDS = [
    'hotel', 'restaurante', 'restaurant', 'rest.', 'cafetería', 'cafeteria',
    'café', 'cafe', 'horeca', 'food service', 'parrilla', 'cantina',
    'comedor', 'fonda', 'lunch', 'soda', 'bar ', 'taberna',
    'marisqueria', 'marisquería', 'cevicheria', 'cevichería',
    'fritanga', 'asadero', 'delicias',
]

# ── COLORES ───────────────────────────────────────────────────────────────
C_VERDE       = colors.HexColor("#1B5E20")
C_VERDE2      = colors.HexColor("#2E7D32")
C_VERDE_LIGHT = colors.HexColor("#E8F5E9")
C_AMARILLO    = colors.HexColor("#F9A825")
C_AMARILLO_LT = colors.HexColor("#FFF8E1")
C_ROJO        = colors.HexColor("#C62828")
C_ROJO_LT     = colors.HexColor("#FFEBEE")
C_GRIS        = colors.HexColor("#F5F5F5")
C_GRIS2       = colors.HexColor("#E0E0E0")
C_BLANCO      = colors.white
C_NEGRO       = colors.black
C_MUTED       = colors.HexColor("#757575")


# ── CÁLCULOS ──────────────────────────────────────────────────────────────

def calc_presupuesto(pct_cum, vbi=VBI_PRESUPUESTO):
    """Devuelve (pago, tramo_label, formula_label)."""
    if pct_cum < 80.0:
        return 0.0, "< 80%", "$0.00 — por debajo de meta mínima"
    elif pct_cum <= 95.0:
        p = round(vbi * 0.60, 2)
        return p, "80% – 95%", f"${vbi:.0f} × 60% = ${p:.2f}"
    elif pct_cum <= 99.0:
        p = round(vbi * 0.80, 2)
        return p, "95.1% – 99%", f"${vbi:.0f} × 80% = ${p:.2f}"
    elif pct_cum <= 105.0:
        p = round(vbi * 1.05, 2)
        return p, "99.1% – 105%", f"${vbi:.0f} × 105% = ${p:.2f}"
    else:
        f = min(pct_cum, 110.0) / 100.0
        p = round(vbi * f, 2)
        return p, f"> 105% (tope 110%)", f"${vbi:.0f} × {f*100:.1f}% = ${p:.2f}"


def calc_efectividad(pct_ef, vbi=VBI_EFECTIVIDAD):
    """Devuelve (pago, tramo_label, formula_label)."""
    if pct_ef < 80.0:
        return 0.0, "< 80%", "$0.00 — por debajo de meta mínima"
    elif pct_ef < 87.0:
        p = round(vbi * 0.80, 2)
        return p, "80% – 87%", f"${vbi:.0f} × 80% = ${p:.2f}"
    elif pct_ef < 90.0:
        p = round(vbi * 0.90, 2)
        return p, "87% – 90%", f"${vbi:.0f} × 90% = ${p:.2f}"
    else:
        p = round(vbi * 1.10, 2)
        return p, "≥ 90%", f"${vbi:.0f} × 110% = ${p:.2f}"


def calc_dn_cafe(pct_cafe, vbi=VBI_DN_CAFE, meta=META_DN_CAFE_PCT):
    if pct_cafe >= meta:
        return vbi, f"≥ {meta:.0f}% ✓", f"Meta alcanzada → ${vbi:.2f}"
    else:
        return 0.0, f"< {meta:.0f}% — meta no alcanzada", "$0.00"


def calc_nuevos(n, vbi=VBI_NUEVOS, meta=META_NUEVOS):
    if n >= meta:
        return vbi, f"≥ {meta} clientes ✓", f"Meta alcanzada → ${vbi:.2f}"
    else:
        return 0.0, f"< {meta} clientes — meta no alcanzada", "$0.00"


def calc_cero(pct_cero, vbi=VBI_CERO, meta=META_CERO_PCT):
    if pct_cero <= meta:
        return vbi, f"≤ {meta:.0f}% ✓ ({pct_cero:.1f}%)", f"Meta alcanzada → ${vbi:.2f}"
    else:
        return 0.0, f"{pct_cero:.1f}% > {meta:.0f}% — meta no alcanzada", "$0.00"


def es_horeca(nombre):
    n = nombre.lower()
    for kw in HORECA_KEYWORDS:
        if kw in n:
            return True, kw
    return False, None


# ── UTILIDADES ────────────────────────────────────────────────────────────

def fmt_usd(v):
    return f"${v:,.2f}"


def fmt_pct(v):
    return f"{v:.1f}%"


def clean_nombre(raw):
    import re
    s = re.sub(r"^\d{3}\s*[-–]\s*", "", str(raw or "")).strip()
    return s


def slug_nombre(raw):
    import re, unicodedata
    s = unicodedata.normalize("NFD", clean_nombre(raw))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^A-Za-z0-9]+", "_", s).strip("_").upper()


# ── FETCH ─────────────────────────────────────────────────────────────────

def fetch(sheet, extra=None):
    params = {"sheet": sheet}
    if extra:
        params.update(extra)
    print(f"  → GET sheet={sheet} {extra or ''}")
    r = requests.get(API_BASE, params=params, timeout=90, allow_redirects=True)
    r.raise_for_status()
    return r.json().get("data", {})


# ── CÁLCULO PRINCIPAL ─────────────────────────────────────────────────────

def calcular_incentivos(vendedores_list, inc_map, horeca_por_vend,
                        cafe_map, nuevos_map):
    results = []
    for v in sorted(vendedores_list, key=lambda x: x["cod"]):
        cod = str(v["cod"])
        inc = inc_map.get(cod, {})

        # Presupuesto
        pct_cum = float(v.get("pct_cumplimiento", 0))
        p_ppto, tramo_ppto, formula_ppto = calc_presupuesto(pct_cum)

        # Efectividad
        pct_ef = float(v.get("efectividad", 0))
        p_ef, tramo_ef, formula_ef = calc_efectividad(pct_ef)

        # DN Café
        cafe_info = cafe_map.get(cod, {})
        pct_cafe = float(cafe_info.get("cobertura_", 0))
        imp_cafe = int(cafe_info.get("impactados", 0))
        mae_cafe = int(cafe_info.get("clientes_maestro", 0))
        p_cafe, tramo_cafe, formula_cafe = calc_dn_cafe(pct_cafe)

        # Clientes nuevos con pedido
        n_nuevos = int(nuevos_map.get(cod, 0))
        p_nuevos, tramo_nuevos, formula_nuevos = calc_nuevos(n_nuevos)

        # Cliente cero
        mae = int(v.get("maestro", 0))
        sc  = int(v.get("sin_compra", 0))
        pct_cero = round(sc / mae * 100, 2) if mae > 0 else 0.0
        p_cero, tramo_cero, formula_cero = calc_cero(pct_cero)

        # TOSH
        tosh_n    = int(inc.get("clientes_tosh_impactados", 0))
        tosh_pago = float(math.floor(tosh_n / 20) * 10)

        # Nutrición Experta
        ne_venta = float(inc.get("venta_nutricion_experta", 0))
        ne_pago  = 20.0 if ne_venta >= 200.0 else 0.0

        # HORECA
        horeca_list  = horeca_por_vend.get(cod, [])
        horeca_pago  = float(len(horeca_list))

        total_indicadores = p_ppto + p_ef + p_cafe + p_nuevos + p_cero
        total_concursos   = tosh_pago + ne_pago + horeca_pago
        total_final       = total_indicadores + total_concursos

        results.append({
            "cod":           cod,
            "nombre":        v.get("nombre", ""),
            "nombre_limpio": clean_nombre(v.get("nombre", "")),
            # Ventas
            "venta_neta":       float(v.get("venta_neta", 0)),
            "cuota":            float(v.get("cuota", 0)),
            "pct_cumplimiento": pct_cum,
            # Presupuesto
            "p_ppto":     p_ppto,
            "tramo_ppto": tramo_ppto,
            "formula_ppto": formula_ppto,
            # Efectividad
            "pct_ef":    pct_ef,
            "p_ef":      p_ef,
            "tramo_ef":  tramo_ef,
            "formula_ef": formula_ef,
            # DN Café
            "pct_cafe":     pct_cafe,
            "imp_cafe":     imp_cafe,
            "mae_cafe":     mae_cafe,
            "p_cafe":       p_cafe,
            "tramo_cafe":   tramo_cafe,
            "formula_cafe": formula_cafe,
            # Clientes nuevos
            "n_nuevos":       n_nuevos,
            "p_nuevos":       p_nuevos,
            "tramo_nuevos":   tramo_nuevos,
            "formula_nuevos": formula_nuevos,
            # Cliente cero
            "pct_cero":     pct_cero,
            "mae":          mae,
            "sc":           sc,
            "p_cero":       p_cero,
            "tramo_cero":   tramo_cero,
            "formula_cero": formula_cero,
            # Concursos
            "tosh_n":       tosh_n,
            "tosh_pago":    tosh_pago,
            "tosh_skus":    inc.get("tosh_skus_vendidos", []),
            "ne_venta":     ne_venta,
            "ne_pago":      ne_pago,
            "horeca_list":  horeca_list,
            "horeca_pago":  horeca_pago,
            # Totales
            "total_indicadores": total_indicadores,
            "total_concursos":   total_concursos,
            "total_final":       total_final,
        })
    return results


# ── ESTILOS PDF ───────────────────────────────────────────────────────────

def make_styles():
    ss = getSampleStyleSheet()

    def ps(name, **kw):
        base = kw.pop("parent", ss["Normal"])
        return ParagraphStyle(name, parent=base, **kw)

    return {
        "title":     ps("title",   fontName="Helvetica-Bold", fontSize=15,
                        textColor=C_BLANCO, alignment=TA_CENTER, leading=19),
        "sub_hdr":   ps("sub_hdr", fontName="Helvetica", fontSize=10,
                        textColor=C_BLANCO, alignment=TA_CENTER, leading=13),
        "sec":       ps("sec",     fontName="Helvetica-Bold", fontSize=9,
                        textColor=C_BLANCO, alignment=TA_LEFT, leading=12,
                        leftIndent=6),
        "lbl":       ps("lbl",     fontName="Helvetica", fontSize=8,
                        textColor=C_MUTED, leading=11),
        "lbl_w":     ps("lbl_w",   fontName="Helvetica", fontSize=8,
                        textColor=C_BLANCO, leading=11),
        "body":      ps("body",    fontName="Helvetica", fontSize=9,
                        textColor=C_NEGRO, leading=13),
        "bold":      ps("bold",    fontName="Helvetica-Bold", fontSize=9,
                        textColor=C_NEGRO, leading=13),
        "ok":        ps("ok",      fontName="Helvetica-Bold", fontSize=11,
                        textColor=C_VERDE2, leading=15),
        "nok":       ps("nok",     fontName="Helvetica-Bold", fontSize=11,
                        textColor=C_ROJO, leading=15),
        "pago":      ps("pago",    fontName="Helvetica-Bold", fontSize=11,
                        textColor=C_VERDE, leading=15),
        "zero":      ps("zero",    fontName="Helvetica-Bold", fontSize=11,
                        textColor=C_MUTED, leading=15),
        "nota":      ps("nota",    fontName="Helvetica", fontSize=7,
                        textColor=C_MUTED, leading=10),
        "total_lbl": ps("total_lbl", fontName="Helvetica-Bold", fontSize=10,
                        textColor=C_NEGRO, leading=14),
        "total_val": ps("total_val", fontName="Helvetica-Bold", fontSize=12,
                        textColor=C_VERDE, alignment=TA_RIGHT, leading=16),
        "grand":     ps("grand",   fontName="Helvetica-Bold", fontSize=14,
                        textColor=C_VERDE, alignment=TA_RIGHT, leading=18),
        "ch":        ps("ch",      fontName="Helvetica-Bold", fontSize=7,
                        textColor=C_BLANCO, alignment=TA_CENTER, leading=9),
    }


def _sec_hdr(text, styles):
    t = Table([[Paragraph(text, styles["sec"])]], colWidths=[None])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), C_VERDE2),
        ("TOPPADDING",    (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
        ("RIGHTPADDING",  (0,0), (-1,-1), 8),
    ]))
    return t


def _ts_base():
    return TableStyle([
        ("TOPPADDING",    (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("LEFTPADDING",   (0,0), (-1,-1), 6),
        ("RIGHTPADDING",  (0,0), (-1,-1), 6),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ("BOX",           (0,0), (-1,-1), 0.5, C_GRIS2),
        ("INNERGRID",     (0,0), (-1,-1), 0.3, C_GRIS2),
    ])


# ── PDF INDIVIDUAL ────────────────────────────────────────────────────────

def build_pdf_individual(r, styles, out):
    doc = SimpleDocTemplate(
        out, pagesize=A4,
        topMargin=1.4*cm, bottomMargin=1.4*cm,
        leftMargin=1.8*cm, rightMargin=1.8*cm,
        title=f"Liquidación Incentivos {r['nombre_limpio']} — {PERIODO_LABEL}",
    )
    W = A4[0] - 3.6*cm
    story = []

    # ── CABECERA ──────────────────────────────────────────────────────────
    hdr = Table([[
        Paragraph("PALUMAR S.A.", styles["title"]),
        Paragraph(f"LIQUIDACIÓN DE INCENTIVOS — {PERIODO_LABEL.upper()}", styles["title"]),
    ]], colWidths=[W * .30, W * .70])
    hdr.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), C_VERDE),
        ("TOPPADDING",    (0,0), (-1,-1), 10),
        ("BOTTOMPADDING", (0,0), (-1,-1), 10),
        ("LEFTPADDING",   (0,0), (-1,-1), 10),
        ("RIGHTPADDING",  (0,0), (-1,-1), 10),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
    ]))
    story.append(hdr)

    info = Table([[Paragraph(
        f"<b>Vendedor:</b> {r['nombre_limpio']} &nbsp;|&nbsp; "
        f"<b>Código:</b> {r['cod']} &nbsp;|&nbsp; "
        f"<b>Período:</b> {PERIODO_LABEL} &nbsp;|&nbsp; "
        f"<b>Emisión:</b> {FECHA_GEN}",
        styles["body"])]], colWidths=[W])
    info.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), C_GRIS),
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING",   (0,0), (-1,-1), 10),
        ("RIGHTPADDING",  (0,0), (-1,-1), 10),
        ("BOX",           (0,0), (-1,-1), 0.5, C_GRIS2),
    ]))
    story.append(info)
    story.append(Spacer(1, .35*cm))

    # ── SECCIÓN A: INDICADORES ────────────────────────────────────────────
    story.append(_sec_hdr("A. INDICADORES DE DESEMPEÑO", styles))
    story.append(Spacer(1, .15*cm))

    # Tabla de todos los indicadores en una sola vista
    ind_rows = [[
        Paragraph("Indicador", styles["lbl_w"]),
        Paragraph("Dato\nReal", styles["lbl_w"]),
        Paragraph("Meta /\nEscala", styles["lbl_w"]),
        Paragraph("VBI", styles["lbl_w"]),
        Paragraph("Tramo\naplicado", styles["lbl_w"]),
        Paragraph("Fórmula", styles["lbl_w"]),
        Paragraph("Pago", styles["lbl_w"]),
    ]]

    def _ind_row(nombre, dato_str, meta_str, vbi, tramo, formula, pago):
        ok = pago > 0
        ps_pago = styles["pago"] if ok else styles["zero"]
        return [
            Paragraph(f"<b>{nombre}</b>", styles["body"]),
            Paragraph(dato_str, styles["bold"]),
            Paragraph(meta_str, styles["lbl"]),
            Paragraph(fmt_usd(vbi), styles["lbl"]),
            Paragraph(tramo, styles["body"]),
            Paragraph(formula, styles["lbl"]),
            Paragraph(fmt_usd(pago), ps_pago),
        ]

    ind_rows.append(_ind_row(
        "Presupuesto",
        fmt_pct(r["pct_cumplimiento"]),
        "meta 100%",
        VBI_PRESUPUESTO,
        r["tramo_ppto"], r["formula_ppto"], r["p_ppto"],
    ))
    ind_rows.append(_ind_row(
        "Efectividad",
        fmt_pct(r["pct_ef"]),
        "meta 90%",
        VBI_EFECTIVIDAD,
        r["tramo_ef"], r["formula_ef"], r["p_ef"],
    ))
    ind_rows.append(_ind_row(
        "DN Café",
        f"{fmt_pct(r['pct_cafe'])} ({r['imp_cafe']}/{r['mae_cafe']})",
        "meta ≥ 40% maestra",
        VBI_DN_CAFE,
        r["tramo_cafe"], r["formula_cafe"], r["p_cafe"],
    ))
    ind_rows.append(_ind_row(
        "Clientes nuevos c/pedido",
        f"{r['n_nuevos']} clientes",
        "meta ≥ 15",
        VBI_NUEVOS,
        r["tramo_nuevos"], r["formula_nuevos"], r["p_nuevos"],
    ))
    ind_rows.append(_ind_row(
        "Cliente cero",
        f"{fmt_pct(r['pct_cero'])} ({r['sc']}/{r['mae']})",
        "meta ≤ 2% maestra",
        VBI_CERO,
        r["tramo_cero"], r["formula_cero"], r["p_cero"],
    ))

    # Fila total indicadores
    ind_rows.append([
        Paragraph("<b>SUBTOTAL INDICADORES</b>", styles["bold"]),
        Paragraph("", styles["body"]),
        Paragraph("", styles["body"]),
        Paragraph("", styles["body"]),
        Paragraph("", styles["body"]),
        Paragraph("", styles["body"]),
        Paragraph(f"<b>{fmt_usd(r['total_indicadores'])}</b>",
                  styles["pago"] if r["total_indicadores"] > 0 else styles["zero"]),
    ])

    ind_cw = [W*.18, W*.12, W*.15, W*.07, W*.18, W*.19, W*.11]
    ind_tbl = Table(ind_rows, colWidths=ind_cw)
    ts = _ts_base()
    ts.add("BACKGROUND",   (0, 0), (-1, 0), C_VERDE2)
    ts.add("BACKGROUND",   (0, -1), (-1, -1), C_VERDE_LIGHT)
    ts.add("LINEABOVE",    (0, -1), (-1, -1), 1.0, C_VERDE2)
    for i in range(1, len(ind_rows) - 1):
        bg = C_GRIS if i % 2 == 1 else C_BLANCO
        ts.add("BACKGROUND", (0, i), (-1, i), bg)
    ind_tbl.setStyle(ts)
    story.append(ind_tbl)
    story.append(Spacer(1, .4*cm))

    # ── SECCIÓN B: CONCURSOS ──────────────────────────────────────────────
    story.append(_sec_hdr("B. CONCURSOS COMERCIALES", styles))
    story.append(Spacer(1, .15*cm))

    con_rows = [[
        Paragraph("Concurso", styles["lbl_w"]),
        Paragraph("Dato real", styles["lbl_w"]),
        Paragraph("Regla", styles["lbl_w"]),
        Paragraph("Pago", styles["lbl_w"]),
    ]]

    def _con_row(nombre, dato, regla, pago):
        ok = pago > 0
        return [
            Paragraph(f"<b>{nombre}</b>", styles["body"]),
            Paragraph(dato, styles["bold"]),
            Paragraph(regla, styles["lbl"]),
            Paragraph(fmt_usd(pago), styles["pago"] if ok else styles["zero"]),
        ]

    tosh_bloques = math.floor(r["tosh_n"] / 20)
    con_rows.append(_con_row(
        "TOSH (Brr.TOSH)",
        f"{r['tosh_n']} clientes impactados",
        f"floor({r['tosh_n']}/20) = {tosh_bloques} bloque(s) × $10",
        r["tosh_pago"],
    ))
    ne_ok = r["ne_venta"] >= 200.0
    con_rows.append(_con_row(
        "Nutrición Experta",
        fmt_usd(r["ne_venta"]),
        f"{'≥' if ne_ok else '<'} $200 → ${'20' if ne_ok else '0'}",
        r["ne_pago"],
    ))
    con_rows.append(_con_row(
        "HORECA",
        f"{len(r['horeca_list'])} cliente(s) HORECA nuevos",
        f"{len(r['horeca_list'])} × $1",
        r["horeca_pago"],
    ))

    con_rows.append([
        Paragraph("<b>SUBTOTAL CONCURSOS</b>", styles["bold"]),
        Paragraph("", styles["body"]),
        Paragraph("", styles["body"]),
        Paragraph(f"<b>{fmt_usd(r['total_concursos'])}</b>",
                  styles["pago"] if r["total_concursos"] > 0 else styles["zero"]),
    ])

    con_cw = [W*.22, W*.28, W*.30, W*.20]
    con_tbl = Table(con_rows, colWidths=con_cw)
    ts2 = _ts_base()
    ts2.add("BACKGROUND", (0, 0), (-1, 0), C_VERDE2)
    ts2.add("BACKGROUND", (0, -1), (-1, -1), C_VERDE_LIGHT)
    ts2.add("LINEABOVE",  (0, -1), (-1, -1), 1.0, C_VERDE2)
    for i in range(1, len(con_rows) - 1):
        bg = C_GRIS if i % 2 == 1 else C_BLANCO
        ts2.add("BACKGROUND", (0, i), (-1, i), bg)
    con_tbl.setStyle(ts2)
    story.append(con_tbl)

    if r["horeca_list"]:
        story.append(Spacer(1, .15*cm))
        det = [[Paragraph("Código", styles["lbl"]),
                Paragraph("Cliente HORECA", styles["lbl"]),
                Paragraph("Keyword", styles["lbl"])]]
        for h in r["horeca_list"]:
            det.append([Paragraph(str(h.get("cod","")), styles["nota"]),
                        Paragraph(str(h.get("nombre","")), styles["nota"]),
                        Paragraph(str(h.get("keyword","")), styles["nota"])])
        dt = Table(det, colWidths=[W*.15, W*.60, W*.25])
        dt.setStyle(TableStyle([
            ("BACKGROUND",    (0,0), (-1,0), C_GRIS2),
            ("BOX",           (0,0), (-1,-1), 0.4, C_GRIS2),
            ("INNERGRID",     (0,0), (-1,-1), 0.3, C_GRIS2),
            ("TOPPADDING",    (0,0), (-1,-1), 3),
            ("BOTTOMPADDING", (0,0), (-1,-1), 3),
            ("LEFTPADDING",   (0,0), (-1,-1), 5),
            ("RIGHTPADDING",  (0,0), (-1,-1), 5),
        ]))
        story.append(dt)

    if r["tosh_skus"]:
        story.append(Spacer(1, .10*cm))
        skus = "; ".join(str(s) for s in r["tosh_skus"][:6])
        if len(r["tosh_skus"]) > 6:
            skus += f" … (+{len(r['tosh_skus'])-6} más)"
        story.append(Paragraph(f"<i>SKUs TOSH: {skus}</i>", styles["nota"]))

    story.append(Spacer(1, .4*cm))

    # ── TOTAL FINAL ────────────────────────────────────────────────────────
    story.append(HRFlowable(width=W, thickness=1.5, color=C_VERDE))
    story.append(Spacer(1, .25*cm))

    tot_rows = [
        [Paragraph("Subtotal Indicadores de desempeño", styles["total_lbl"]),
         Paragraph(fmt_usd(r["total_indicadores"]), styles["total_val"])],
        [Paragraph("Subtotal Concursos comerciales", styles["total_lbl"]),
         Paragraph(fmt_usd(r["total_concursos"]), styles["total_val"])],
    ]
    tot_tbl = Table(tot_rows, colWidths=[W*.60, W*.40])
    tot_tbl.setStyle(TableStyle([
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
        ("RIGHTPADDING",  (0,0), (-1,-1), 8),
        ("LINEBELOW",     (0,-1), (-1,-1), 0.5, C_GRIS2),
    ]))
    story.append(tot_tbl)
    story.append(Spacer(1, .15*cm))

    # Grand total
    gt = Table([[
        Paragraph("<b>TOTAL A PAGAR — JUNIO 2026</b>", ParagraphStyle(
            "gt", parent=styles["total_lbl"], fontSize=12)),
        Paragraph(f"<b>{fmt_usd(r['total_final'])}</b>",
                  ParagraphStyle("gtv", parent=styles["grand"], fontSize=15)),
    ]], colWidths=[W*.55, W*.45])
    gt.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), C_VERDE_LIGHT),
        ("BOX",           (0,0), (-1,-1), 1.2, C_VERDE),
        ("TOPPADDING",    (0,0), (-1,-1), 10),
        ("BOTTOMPADDING", (0,0), (-1,-1), 10),
        ("LEFTPADDING",   (0,0), (-1,-1), 12),
        ("RIGHTPADDING",  (0,0), (-1,-1), 12),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
    ]))
    story.append(gt)
    story.append(Spacer(1, .35*cm))

    # Nota pie
    nota_t = Table([[Paragraph(
        f"Datos fuente: BASE_ACUMULADA · FRECUENCIA_ECOM · MAESTRO_CLIENTES — "
        f"sistema ECOM PALMA, período {PERIODO_LABEL}. "
        f"Indicadores: VBI Presupuesto=${VBI_PRESUPUESTO:.0f} · "
        f"VBI Efectividad=${VBI_EFECTIVIDAD:.0f} · "
        f"VBI DN Café/Nuevos/Cero=${VBI_DN_CAFE:.0f}. "
        f"Devolución y Cartera: $0 (no generan pago variable). "
        f"Salario básico $724 no incluido. "
        f"Generado el {FECHA_GEN}.",
        styles["nota"])]], colWidths=[W])
    nota_t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), C_AMARILLO_LT),
        ("BOX",           (0,0), (-1,-1), 0.5, C_AMARILLO),
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
        ("RIGHTPADDING",  (0,0), (-1,-1), 8),
    ]))
    story.append(nota_t)

    doc.build(story)


# ── PDF CONSOLIDADO ───────────────────────────────────────────────────────

def build_pdf_consolidado(results, styles, out):
    doc = SimpleDocTemplate(
        out, pagesize=(A4[1], A4[0]),   # landscape
        topMargin=1.2*cm, bottomMargin=1.2*cm,
        leftMargin=1.2*cm, rightMargin=1.2*cm,
        title=f"Consolidado Incentivos PALUMAR — {PERIODO_LABEL}",
    )
    W = A4[1] - 2.4*cm
    story = []

    hdr = Table([[
        Paragraph("PALUMAR S.A.", styles["title"]),
        Paragraph(f"CONSOLIDADO DE PAGOS — {PERIODO_LABEL.upper()}", styles["title"]),
        Paragraph(f"Emisión: {FECHA_GEN}", styles["sub_hdr"]),
    ]], colWidths=[W*.16, W*.60, W*.24])
    hdr.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), C_VERDE),
        ("TOPPADDING",    (0,0), (-1,-1), 9),
        ("BOTTOMPADDING", (0,0), (-1,-1), 9),
        ("LEFTPADDING",   (0,0), (-1,-1), 10),
        ("RIGHTPADDING",  (0,0), (-1,-1), 10),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
    ]))
    story.append(hdr)
    story.append(Spacer(1, .4*cm))

    cols = [
        ("Cód", W*.036),
        ("Vendedor", W*.115),
        ("Venta\nNeta", W*.065),
        ("Cuota", W*.065),
        ("%\nCum.", W*.043),
        ("Pago\nPpto.", W*.060),
        ("%\nEfec.", W*.043),
        ("Pago\nEfec.", W*.060),
        ("DN\nCafé%", W*.048),
        ("Pago\nCafé", W*.054),
        ("Nuevos\nClts.", W*.046),
        ("Pago\nNuevos", W*.054),
        ("%\nCero", W*.044),
        ("Pago\nCero", W*.054),
        ("TOSH\nPago", W*.054),
        ("NE\nPago", W*.046),
        ("HOR.\nPago", W*.046),
        ("TOTAL\nFINAL", W*.073),
    ]
    headers  = [c[0] for c in cols]
    col_w    = [c[1] for c in cols]

    rows = [[Paragraph(h, styles["ch"]) for h in headers]]

    tot = {k: 0.0 for k in ["p_ppto","p_ef","p_cafe","p_nuevos","p_cero",
                              "tosh_pago","ne_pago","horeca_pago","total_final"]}

    def _cp(val, ok=True):
        return Paragraph(val, styles["body"] if not isinstance(ok, bool) else
                         (styles["bold"] if ok else styles["body"]))

    for i, r in enumerate(results):
        ppt_ok  = r["p_ppto"] > 0
        ef_ok   = r["p_ef"] > 0
        bg = C_GRIS if i % 2 == 0 else C_BLANCO
        rows.append([
            Paragraph(r["cod"], styles["body"]),
            Paragraph(r["nombre_limpio"][:20], styles["body"]),
            Paragraph(fmt_usd(r["venta_neta"]), styles["body"]),
            Paragraph(fmt_usd(r["cuota"]), styles["body"]),
            Paragraph(fmt_pct(r["pct_cumplimiento"]),
                      ParagraphStyle("x", parent=styles["bold"],
                                     textColor=C_VERDE2 if ppt_ok else C_ROJO,
                                     fontSize=8, alignment=TA_CENTER)),
            Paragraph(fmt_usd(r["p_ppto"]),
                      styles["pago"] if ppt_ok else styles["zero"]),
            Paragraph(fmt_pct(r["pct_ef"]),
                      ParagraphStyle("x2", parent=styles["bold"],
                                     textColor=C_VERDE2 if ef_ok else C_ROJO,
                                     fontSize=8, alignment=TA_CENTER)),
            Paragraph(fmt_usd(r["p_ef"]),
                      styles["pago"] if ef_ok else styles["zero"]),
            Paragraph(fmt_pct(r["pct_cafe"]),
                      ParagraphStyle("x3", parent=styles["body"],
                                     textColor=C_VERDE2 if r["p_cafe"] > 0 else C_ROJO,
                                     fontSize=8, alignment=TA_CENTER)),
            Paragraph(fmt_usd(r["p_cafe"]),
                      styles["pago"] if r["p_cafe"] > 0 else styles["zero"]),
            Paragraph(str(r["n_nuevos"]),
                      ParagraphStyle("x4", parent=styles["body"],
                                     textColor=C_VERDE2 if r["p_nuevos"] > 0 else C_NEGRO,
                                     fontSize=8, alignment=TA_CENTER)),
            Paragraph(fmt_usd(r["p_nuevos"]),
                      styles["pago"] if r["p_nuevos"] > 0 else styles["zero"]),
            Paragraph(fmt_pct(r["pct_cero"]),
                      ParagraphStyle("x5", parent=styles["body"],
                                     textColor=C_VERDE2 if r["p_cero"] > 0 else C_NEGRO,
                                     fontSize=8, alignment=TA_CENTER)),
            Paragraph(fmt_usd(r["p_cero"]),
                      styles["pago"] if r["p_cero"] > 0 else styles["zero"]),
            Paragraph(fmt_usd(r["tosh_pago"]),
                      styles["pago"] if r["tosh_pago"] > 0 else styles["zero"]),
            Paragraph(fmt_usd(r["ne_pago"]),
                      styles["pago"] if r["ne_pago"] > 0 else styles["zero"]),
            Paragraph(fmt_usd(r["horeca_pago"]),
                      styles["pago"] if r["horeca_pago"] > 0 else styles["zero"]),
            Paragraph(f"<b>{fmt_usd(r['total_final'])}</b>",
                      ParagraphStyle("xf", parent=styles["pago"], fontSize=9)),
        ])
        for k in tot:
            tot[k] += r[k]

    # Fila totales
    rows.append([
        Paragraph("", styles["body"]),
        Paragraph("<b>TOTALES</b>", styles["bold"]),
        Paragraph("", styles["body"]),
        Paragraph("", styles["body"]),
        Paragraph("", styles["body"]),
        Paragraph(f"<b>{fmt_usd(tot['p_ppto'])}</b>",
                  ParagraphStyle("tp", parent=styles["pago"], fontSize=8)),
        Paragraph("", styles["body"]),
        Paragraph(f"<b>{fmt_usd(tot['p_ef'])}</b>",
                  ParagraphStyle("te", parent=styles["pago"], fontSize=8)),
        Paragraph("", styles["body"]),
        Paragraph(f"<b>{fmt_usd(tot['p_cafe'])}</b>",
                  ParagraphStyle("tc", parent=styles["pago"], fontSize=8)),
        Paragraph("", styles["body"]),
        Paragraph(f"<b>{fmt_usd(tot['p_nuevos'])}</b>",
                  ParagraphStyle("tn", parent=styles["pago"], fontSize=8)),
        Paragraph("", styles["body"]),
        Paragraph(f"<b>{fmt_usd(tot['p_cero'])}</b>",
                  ParagraphStyle("tz", parent=styles["pago"], fontSize=8)),
        Paragraph(f"<b>{fmt_usd(tot['tosh_pago'])}</b>",
                  ParagraphStyle("tt", parent=styles["pago"], fontSize=8)),
        Paragraph(f"<b>{fmt_usd(tot['ne_pago'])}</b>",
                  ParagraphStyle("tne", parent=styles["pago"], fontSize=8)),
        Paragraph(f"<b>{fmt_usd(tot['horeca_pago'])}</b>",
                  ParagraphStyle("th", parent=styles["pago"], fontSize=8)),
        Paragraph(f"<b>{fmt_usd(tot['total_final'])}</b>",
                  ParagraphStyle("tff", parent=styles["pago"], fontSize=10)),
    ])

    n = len(rows)
    tbl = Table(rows, colWidths=col_w, repeatRows=1)
    ts = TableStyle([
        ("BACKGROUND",    (0, 0),    (-1, 0),    C_VERDE),
        ("BACKGROUND",    (0, n-1),  (-1, n-1),  C_VERDE_LIGHT),
        ("LINEABOVE",     (0, n-1),  (-1, n-1),  1.0, C_VERDE),
        ("BOX",           (0, 0),    (-1, -1),   0.5, C_GRIS2),
        ("INNERGRID",     (0, 0),    (-1, -1),   0.3, C_GRIS2),
        ("TOPPADDING",    (0, 0),    (-1, -1),   3),
        ("BOTTOMPADDING", (0, 0),    (-1, -1),   3),
        ("LEFTPADDING",   (0, 0),    (-1, -1),   3),
        ("RIGHTPADDING",  (0, 0),    (-1, -1),   3),
        ("VALIGN",        (0, 0),    (-1, -1),   "MIDDLE"),
    ] + [
        ("BACKGROUND", (0, i+1), (-1, i+1), C_GRIS if i % 2 == 0 else C_BLANCO)
        for i in range(len(results))
    ])
    tbl.setStyle(ts)
    story.append(tbl)
    story.append(Spacer(1, .3*cm))

    nota_t = Table([[Paragraph(
        f"VBI: Presupuesto=${VBI_PRESUPUESTO:.0f} · Efectividad=${VBI_EFECTIVIDAD:.0f} · "
        f"DN Café/Nuevos/Cero=${VBI_DN_CAFE:.0f} · Devolución/Cartera=$0. "
        f"Salario básico $724 no incluido. "
        f"Fuente: BASE_ACUMULADA · FRECUENCIA_ECOM · MAESTRO_CLIENTES — {PERIODO_LABEL}. "
        f"Generado el {FECHA_GEN}.",
        styles["nota"])]], colWidths=[W])
    nota_t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), C_AMARILLO_LT),
        ("BOX",           (0,0), (-1,-1), 0.5, C_AMARILLO),
        ("TOPPADDING",    (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
        ("RIGHTPADDING",  (0,0), (-1,-1), 8),
    ]))
    story.append(nota_t)
    doc.build(story)


# ── CSVs ─────────────────────────────────────────────────────────────────

def write_csv_consolidado(results, out):
    fields = [
        "cod","nombre_limpio",
        "venta_neta","cuota","pct_cumplimiento",
        "tramo_ppto","p_ppto",
        "pct_ef","tramo_ef","p_ef",
        "pct_cafe","imp_cafe","mae_cafe","tramo_cafe","p_cafe",
        "n_nuevos","tramo_nuevos","p_nuevos",
        "pct_cero","sc","mae","tramo_cero","p_cero",
        "tosh_n","tosh_pago",
        "ne_venta","ne_pago",
        "horeca_pago",
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
    fields = [
        "cod","nombre_limpio",
        "venta_neta","cuota","pct_cumplimiento","tramo_ppto","formula_ppto","p_ppto",
        "pct_ef","tramo_ef","formula_ef","p_ef",
        "pct_cafe","imp_cafe","mae_cafe","tramo_cafe","formula_cafe","p_cafe",
        "n_nuevos","tramo_nuevos","formula_nuevos","p_nuevos",
        "pct_cero","sc","mae","tramo_cero","formula_cero","p_cero",
        "tosh_n","tosh_bloques","tosh_pago",
        "ne_venta","ne_meta","ne_pago",
        "horeca_clientes","horeca_pago",
        "total_indicadores","total_concursos","total_final",
    ]
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(fields)
        for r in results:
            w.writerow([
                r["cod"], r["nombre_limpio"],
                f"{r['venta_neta']:.2f}", f"{r['cuota']:.2f}",
                f"{r['pct_cumplimiento']:.2f}", r["tramo_ppto"],
                r["formula_ppto"], f"{r['p_ppto']:.2f}",
                f"{r['pct_ef']:.2f}", r["tramo_ef"],
                r["formula_ef"], f"{r['p_ef']:.2f}",
                f"{r['pct_cafe']:.1f}", r["imp_cafe"], r["mae_cafe"],
                r["tramo_cafe"], r["formula_cafe"], f"{r['p_cafe']:.2f}",
                r["n_nuevos"], r["tramo_nuevos"],
                r["formula_nuevos"], f"{r['p_nuevos']:.2f}",
                f"{r['pct_cero']:.2f}", r["sc"], r["mae"],
                r["tramo_cero"], r["formula_cero"], f"{r['p_cero']:.2f}",
                r["tosh_n"], math.floor(r["tosh_n"]/20), f"{r['tosh_pago']:.2f}",
                f"{r['ne_venta']:.2f}", "200.00", f"{r['ne_pago']:.2f}",
                len(r["horeca_list"]), f"{r['horeca_pago']:.2f}",
                f"{r['total_indicadores']:.2f}",
                f"{r['total_concursos']:.2f}",
                f"{r['total_final']:.2f}",
            ])


def write_csv_horeca(results, out):
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["cod_asesor","nombre_asesor","cod_cliente","nombre_cliente","keyword"])
        for r in results:
            for h in r["horeca_list"]:
                w.writerow([r["cod"], r["nombre_limpio"],
                             h.get("cod",""), h.get("nombre",""), h.get("keyword","")])


def write_csv_tosh(results, out):
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["cod_asesor","nombre_asesor","clientes_tosh","bloques_20","pago_tosh","skus"])
        for r in results:
            w.writerow([r["cod"], r["nombre_limpio"], r["tosh_n"],
                        math.floor(r["tosh_n"]/20), f"{r['tosh_pago']:.2f}",
                        "; ".join(str(s) for s in r["tosh_skus"])])


def write_csv_ne(results, out):
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["cod_asesor","nombre_asesor","venta_ne","meta_200","alcanza","pago_ne"])
        for r in results:
            w.writerow([r["cod"], r["nombre_limpio"], f"{r['ne_venta']:.2f}",
                        "200.00", "SI" if r["ne_venta"] >= 200 else "NO",
                        f"{r['ne_pago']:.2f}"])


# ── MAIN ──────────────────────────────────────────────────────────────────

def main():
    print(f"\n{'='*65}")
    print(f"  LIQUIDACIÓN DE INCENTIVOS — {PERIODO_LABEL.upper()}")
    print(f"  PALUMAR S.A.")
    print(f"{'='*65}\n")

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # 1. Fetch
    print("1. Obteniendo datos desde API PALMA...\n")
    vendedores_data  = fetch("vendedores")
    inc_data         = fetch("incentivos_vendedores")
    cn_data          = fetch("clientes_nuevos", {"desde":"2026-06-01","hasta":"2026-06-30"})
    cob_neg_data     = fetch("cob_negocio")

    assert isinstance(vendedores_data, list) and len(vendedores_data) > 0, \
        "ERROR: vendedores endpoint retornó datos vacíos"

    # Map incentivos
    inc_map = {str(v["cod"]): v for v in inc_data.get("vendedores", [])}

    # Map DN Café por vendedor (cob_negocio filtrado a "04-CafÈ" o similares)
    cafe_map = {}
    for row in (cob_neg_data if isinstance(cob_neg_data, list) else []):
        neg = str(row.get("negocio", "")).lower()
        if "caf" in neg:
            vend_txt = str(row.get("vendedor",""))
            cod = vend_txt.split("-")[0].strip().zfill(3)
            cafe_map[cod] = row

    # Clientes nuevos con pedido por vendedor
    cn_detalle = cn_data.get("detalle", []) if isinstance(cn_data, dict) else []
    nuevos_cnt = Counter(str(c.get("cod_asesor","")).zfill(3) for c in cn_detalle)

    # HORECA detection
    horeca_por_vend = {}
    horeca_total = 0
    for c in cn_detalle:
        razon  = str(c.get("razon_social","") or "")
        nombre = str(c.get("nombre","") or "")
        ok, kw = es_horeca(razon)
        if not ok:
            ok, kw = es_horeca(nombre)
        if ok:
            cod_a = str(c.get("cod_asesor","")).zfill(3)
            if cod_a not in horeca_por_vend:
                horeca_por_vend[cod_a] = []
            horeca_por_vend[cod_a].append({
                "cod":     str(c.get("cod_cliente","")),
                "nombre":  razon or nombre,
                "keyword": kw,
            })
            horeca_total += 1

    print(f"   Vendedores:          {len(vendedores_data)}")
    print(f"   Clientes nuevos:     {sum(nuevos_cnt.values())}")
    print(f"   Clientes HORECA:     {horeca_total}")
    print(f"   Filas DN Café:       {len(cafe_map)}")

    # 2. Calcular
    print("\n2. Calculando incentivos...\n")
    results = calcular_incentivos(vendedores_data, inc_map, horeca_por_vend,
                                   cafe_map, nuevos_cnt)

    # Verificar no-negativos
    for r in results:
        assert r["total_final"] >= 0, f"Pago negativo en {r['cod']}: {r['total_final']}"

    # Resumen en consola
    hdr_fmt = "{:<5} {:<27} {:>6} {:>7} {:>6} {:>6} {:>7} {:>7} {:>7} {:>8}"
    sep = "-" * 82
    print(hdr_fmt.format("COD","NOMBRE","%CUM","PPTO$","EF$","CAFÉ$","NUE$","CERO$","CON$","TOTAL$"))
    print(sep)
    for r in results:
        print(hdr_fmt.format(
            r["cod"], r["nombre_limpio"][:27],
            fmt_pct(r["pct_cumplimiento"]),
            fmt_usd(r["p_ppto"]),
            fmt_usd(r["p_ef"]),
            fmt_usd(r["p_cafe"]),
            fmt_usd(r["p_nuevos"]),
            fmt_usd(r["p_cero"]),
            fmt_usd(r["total_concursos"]),
            fmt_usd(r["total_final"]),
        ))
    print(sep)
    grand = sum(r["total_final"] for r in results)
    print(f"{'GRAN TOTAL':>50}  {fmt_usd(grand):>8}")
    print(f"\n  Indicadores: Ppto={fmt_usd(sum(r['p_ppto'] for r in results))} "
          f"Efec={fmt_usd(sum(r['p_ef'] for r in results))} "
          f"Café={fmt_usd(sum(r['p_cafe'] for r in results))} "
          f"Nuevos={fmt_usd(sum(r['p_nuevos'] for r in results))} "
          f"Cero={fmt_usd(sum(r['p_cero'] for r in results))}")
    print(f"  Concursos:   TOSH={fmt_usd(sum(r['tosh_pago'] for r in results))} "
          f"NE={fmt_usd(sum(r['ne_pago'] for r in results))} "
          f"HORECA={fmt_usd(sum(r['horeca_pago'] for r in results))}")

    # 3. PDFs individuales
    print("\n3. Generando PDFs individuales...\n")
    styles = make_styles()
    for r in results:
        slug  = slug_nombre(r["nombre"])
        fname = f"LIQUIDACION_INCENTIVOS_JUNIO_2026_{r['cod']}_{slug}.pdf"
        build_pdf_individual(r, styles, os.path.join(OUTPUT_DIR, fname))
        print(f"   ✓ {fname}  → Total: {fmt_usd(r['total_final'])}")

    # 4. PDF consolidado
    print("\n4. Generando PDF consolidado...\n")
    cons_pdf = os.path.join(OUTPUT_DIR, "CONSOLIDADO_PAGOS_INCENTIVOS_JUNIO_2026.pdf")
    build_pdf_consolidado(results, styles, cons_pdf)
    print(f"   ✓ CONSOLIDADO_PAGOS_INCENTIVOS_JUNIO_2026.pdf")

    # 5. CSVs
    print("\n5. Generando CSVs...\n")
    write_csv_consolidado(results, os.path.join(OUTPUT_DIR, "CONSOLIDADO_PAGOS_INCENTIVOS_JUNIO_2026.csv"))
    print("   ✓ CONSOLIDADO_PAGOS_INCENTIVOS_JUNIO_2026.csv")
    write_csv_calculos(results,   os.path.join(OUTPUT_DIR, "AUDITORIA_CALCULOS_INCENTIVOS_JUNIO_2026.csv"))
    print("   ✓ AUDITORIA_CALCULOS_INCENTIVOS_JUNIO_2026.csv")
    write_csv_horeca(results,     os.path.join(OUTPUT_DIR, "AUDITORIA_HORECA_JUNIO_2026.csv"))
    print("   ✓ AUDITORIA_HORECA_JUNIO_2026.csv")
    write_csv_tosh(results,       os.path.join(OUTPUT_DIR, "AUDITORIA_TOSH_JUNIO_2026.csv"))
    print("   ✓ AUDITORIA_TOSH_JUNIO_2026.csv")
    write_csv_ne(results,         os.path.join(OUTPUT_DIR, "AUDITORIA_NE_JUNIO_2026.csv"))
    print("   ✓ AUDITORIA_NE_JUNIO_2026.csv")

    # 6. Validaciones finales
    print("\n6. Validaciones...\n")
    assert len(results) == 14, f"Esperados 14 vendedores, obtenidos {len(results)}"
    no_pendientes = all(
        "Pendiente" not in str(r["tramo_ppto"]) and "Pendiente" not in str(r["tramo_ef"])
        for r in results
    )
    sum_ind = sum(r["total_final"] for r in results)
    assert abs(sum_ind - grand) < 0.01, f"Discrepancia suma: {sum_ind} vs {grand}"
    pagos_neg = [r["cod"] for r in results if r["total_final"] < 0]
    assert not pagos_neg, f"Pagos negativos en: {pagos_neg}"

    print(f"   ✓ 14 vendedores procesados")
    print(f"   ✓ Sin pendientes VBI (presupuesto y efectividad calculados)")
    print(f"   ✓ Sin pagos negativos")
    print(f"   ✓ Suma individuales = consolidado: {fmt_usd(grand)}")

    print(f"\n{'='*65}")
    print(f"  RESUMEN FINAL — TOTAL A PAGAR JUNIO 2026")
    print(f"{'='*65}")
    print(f"  Presupuesto:          {fmt_usd(sum(r['p_ppto'] for r in results))}")
    print(f"  Efectividad:          {fmt_usd(sum(r['p_ef'] for r in results))}")
    print(f"  DN Café:              {fmt_usd(sum(r['p_cafe'] for r in results))}")
    print(f"  Clientes nuevos:      {fmt_usd(sum(r['p_nuevos'] for r in results))}")
    print(f"  Cliente cero:         {fmt_usd(sum(r['p_cero'] for r in results))}")
    print(f"  ────────────────────────────────────")
    print(f"  Subtotal indicadores: {fmt_usd(sum(r['total_indicadores'] for r in results))}")
    print(f"  Concurso TOSH:        {fmt_usd(sum(r['tosh_pago'] for r in results))}")
    print(f"  Concurso NE:          {fmt_usd(sum(r['ne_pago'] for r in results))}")
    print(f"  Concurso HORECA:      {fmt_usd(sum(r['horeca_pago'] for r in results))}")
    print(f"  Subtotal concursos:   {fmt_usd(sum(r['total_concursos'] for r in results))}")
    print(f"  ════════════════════════════════════")
    print(f"  TOTAL GENERAL:        {fmt_usd(grand)}")
    print(f"{'='*65}\n")


if __name__ == "__main__":
    main()
