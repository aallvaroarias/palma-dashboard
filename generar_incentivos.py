#!/usr/bin/env python3
"""
generar_incentivos.py
Liquidación de incentivos PALUMAR S.A. - Junio 2026

Genera por cada uno de los 14 vendedores PALUMAR:
  - PDF individual: LIQUIDACION_INCENTIVOS_JUNIO_2026_[COD]_[NAME].pdf
  - PDF consolidado: CONSOLIDADO_PAGOS_INCENTIVOS_JUNIO_2026.pdf
  - CSV consolidado: CONSOLIDADO_PAGOS_INCENTIVOS_JUNIO_2026.csv
  - CSV auditoría HORECA, TOSH, Nutrición Experta, Cálculos

Nota: VBI (presupuesto y efectividad) no fue proporcionado.
Esos rubros se marcan como "Pendiente por dato faltante".
"""

import requests
import json
import csv
import os
import math
from datetime import datetime
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Table, TableStyle,
    Spacer, HRFlowable, KeepTogether
)
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

# ── CONFIGURACIÓN ────────────────────────────────────────────────────────
API_BASE = (
    "https://script.google.com/macros/s/"
    "AKfycbwRPhHFwnBnTadtIuH3FHapuwVjzXJr5suo-KlWxr-ReoA44VtAt1pZsf_TF2a1KIfK/exec"
)
PERIODO_LABEL = "Junio 2026"
PERIODO_CODE  = "2026-06"
OUTPUT_DIR    = "liquidacion_incentivos_junio_2026"
FECHA_GEN     = datetime.now().strftime("%d de %B de %Y").replace(
    "January","enero").replace("February","febrero").replace("March","marzo"
    ).replace("April","abril").replace("May","mayo").replace("June","junio"
    ).replace("July","julio").replace("August","agosto").replace("September","septiembre"
    ).replace("October","octubre").replace("November","noviembre").replace("December","diciembre")

HORECA_KEYWORDS = [
    'hotel', 'restaurante', 'restaurant', 'rest.', 'cafetería', 'cafeteria',
    'café', 'cafe', 'horeca', 'food service', 'parrilla', 'cantina',
    'comedor', 'fonda', 'lunch', 'soda', 'bar ', 'taberna', 'picnic',
    'marisqueria', 'marisquería', 'cevicheria', 'cevichería', 'fritanga',
    'asadero', 'bocadillo', 'cocina', 'rancho', 'delicias',
]

PENDIENTE_LABEL = "Pendiente — VBI no proporcionado"

# ── COLORES CORPORATIVOS ─────────────────────────────────────────────────
C_PALMA_VERDE  = colors.HexColor("#1B5E20")   # verde oscuro header
C_PALMA_VERDE2 = colors.HexColor("#2E7D32")   # verde secundario
C_ACCENT       = colors.HexColor("#43A047")   # verde acento
C_AMARILLO     = colors.HexColor("#F9A825")   # advertencia
C_GRIS_CLARO   = colors.HexColor("#F5F5F5")
C_GRIS_MED     = colors.HexColor("#E0E0E0")
C_ROJO         = colors.HexColor("#C62828")
C_BLANCO       = colors.white
C_NEGRO        = colors.black
C_PENDIENTE    = colors.HexColor("#FF8F00")   # naranja pendiente

# ── ESTILOS ──────────────────────────────────────────────────────────────
def make_styles():
    styles = getSampleStyleSheet()

    base = dict(fontName="Helvetica", leading=14, spaceAfter=4)

    estilos = {}

    estilos["title"] = ParagraphStyle(
        "title", parent=styles["Normal"],
        fontSize=16, fontName="Helvetica-Bold",
        textColor=C_BLANCO, alignment=TA_CENTER, leading=20, spaceAfter=0
    )
    estilos["subtitle"] = ParagraphStyle(
        "subtitle", parent=styles["Normal"],
        fontSize=11, fontName="Helvetica",
        textColor=C_BLANCO, alignment=TA_CENTER, leading=14
    )
    estilos["section_head"] = ParagraphStyle(
        "section_head", parent=styles["Normal"],
        fontSize=10, fontName="Helvetica-Bold",
        textColor=C_BLANCO, alignment=TA_LEFT, leading=14,
        leftIndent=8
    )
    estilos["body"] = ParagraphStyle(
        "body", parent=styles["Normal"],
        fontSize=9, fontName="Helvetica",
        textColor=C_NEGRO, leading=13
    )
    estilos["body_bold"] = ParagraphStyle(
        "body_bold", parent=styles["Normal"],
        fontSize=9, fontName="Helvetica-Bold",
        textColor=C_NEGRO, leading=13
    )
    estilos["label"] = ParagraphStyle(
        "label", parent=styles["Normal"],
        fontSize=8, fontName="Helvetica",
        textColor=colors.HexColor("#616161"), leading=11
    )
    estilos["value_big"] = ParagraphStyle(
        "value_big", parent=styles["Normal"],
        fontSize=14, fontName="Helvetica-Bold",
        textColor=C_PALMA_VERDE, alignment=TA_CENTER, leading=18
    )
    estilos["pendiente"] = ParagraphStyle(
        "pendiente", parent=styles["Normal"],
        fontSize=8, fontName="Helvetica-Bold",
        textColor=C_PENDIENTE, leading=11
    )
    estilos["nota"] = ParagraphStyle(
        "nota", parent=styles["Normal"],
        fontSize=7, fontName="Helvetica",
        textColor=colors.HexColor("#757575"), leading=10
    )
    estilos["total_label"] = ParagraphStyle(
        "total_label", parent=styles["Normal"],
        fontSize=11, fontName="Helvetica-Bold",
        textColor=C_PALMA_VERDE, alignment=TA_LEFT, leading=16
    )
    estilos["total_value"] = ParagraphStyle(
        "total_value", parent=styles["Normal"],
        fontSize=16, fontName="Helvetica-Bold",
        textColor=C_PALMA_VERDE2, alignment=TA_RIGHT, leading=20
    )
    return estilos


# ── UTILIDADES ───────────────────────────────────────────────────────────
def fmt_usd(v):
    if v is None:
        return "—"
    return f"${v:,.2f}"


def fmt_pct(v):
    return f"{v:.1f}%"


def clean_nombre(raw):
    """'211 - HAYMETH LEWIS' → 'HAYMETH LEWIS', también limpia códigos prefijo"""
    import re
    s = str(raw or "").strip()
    s = re.sub(r"^\d{3}\s*[-–]\s*", "", s)
    return s.strip()


def slug_nombre(raw):
    """Genera slug seguro para nombre de archivo"""
    import re, unicodedata
    s = clean_nombre(raw)
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^A-Za-z0-9]+", "_", s)
    return s.strip("_").upper()


def es_horeca(nombre):
    n = nombre.lower()
    for kw in HORECA_KEYWORDS:
        if kw in n:
            return True, kw
    return False, None


def tramo_presupuesto(pct):
    if pct < 80:
        return ("< 80%", 0.0, "No aplica")
    elif pct <= 95:
        return ("80% – 95%", 0.60, "60% de VBI")
    elif pct <= 99:
        return ("95.1% – 99%", 0.80, "80% de VBI")
    elif pct <= 105:
        return ("99.1% – 105%", 1.05, "105% de VBI")
    else:
        f = round(min(pct, 110.0) / 100.0, 4)
        return (f"> 105% (tope 110%)", f, f"{f*100:.1f}% de VBI (lineal)")


def tramo_efectividad(pct):
    if pct < 80:
        return ("< 80%", 0.0, "No aplica")
    elif pct < 87:
        return ("80% – 87%", 0.80, "80% de VBI")
    elif pct < 90:
        return ("87% – 90%", 0.90, "90% de VBI")
    else:
        return ("≥ 90%", 1.10, "110% de VBI")


# ── FETCH ────────────────────────────────────────────────────────────────
def fetch(sheet, extra=None):
    params = {"sheet": sheet}
    if extra:
        params.update(extra)
    print(f"  → GET sheet={sheet} {extra or ''}")
    r = requests.get(API_BASE, params=params, timeout=90, allow_redirects=True)
    r.raise_for_status()
    return r.json().get("data", {})


# ── CÁLCULO DE INCENTIVOS ────────────────────────────────────────────────
def calcular_incentivos(vendedores_list, inc_map, horeca_por_vendedor):
    results = []
    for v in sorted(vendedores_list, key=lambda x: x["cod"]):
        cod   = str(v["cod"])
        inc   = inc_map.get(cod, {})

        # Presupuesto
        pct_cum = v.get("pct_cumplimiento", 0)
        tr_ppto, factor_ppto, label_ppto = tramo_presupuesto(pct_cum)

        # Efectividad
        pct_ef = v.get("efectividad", 0)
        tr_ef, factor_ef, label_ef = tramo_efectividad(pct_ef)

        # TOSH: floor(clientes_tosh / 20) × $10
        tosh_n    = int(inc.get("clientes_tosh_impactados", 0))
        tosh_pago = math.floor(tosh_n / 20) * 10

        # Nutrición Experta: $20 si venta ≥ $200, sino $0
        ne_venta = float(inc.get("venta_nutricion_experta", 0))
        ne_pago  = 20.0 if ne_venta >= 200.0 else 0.0

        # HORECA: $1 × clientes nuevos horeca con venta en junio
        horeca_list  = horeca_por_vendedor.get(cod, [])
        horeca_count = len(horeca_list)
        horeca_pago  = float(horeca_count)

        total_confirmado = tosh_pago + ne_pago + horeca_pago

        results.append({
            "cod":              cod,
            "nombre":           v.get("nombre", ""),
            "nombre_limpio":    clean_nombre(v.get("nombre", "")),
            # Ventas
            "venta_neta":       float(v.get("venta_neta", 0)),
            "cuota":            float(v.get("cuota", 0)),
            "pct_cumplimiento": pct_cum,
            # Presupuesto
            "tramo_presupuesto": tr_ppto,
            "factor_presupuesto": factor_ppto,
            "label_presupuesto": label_ppto,
            "pago_presupuesto":  PENDIENTE_LABEL if factor_ppto > 0 else "No aplica",
            # Efectividad
            "pct_efectividad":   pct_ef,
            "tramo_efectividad": tr_ef,
            "factor_efectividad": factor_ef,
            "label_efectividad": label_ef,
            "pago_efectividad":  PENDIENTE_LABEL if factor_ef > 0 else "No aplica",
            # TOSH
            "tosh_clientes":    tosh_n,
            "tosh_pago":        tosh_pago,
            "tosh_skus":        inc.get("tosh_skus_vendidos", []),
            # NE
            "ne_venta":         ne_venta,
            "ne_pago":          ne_pago,
            # HORECA
            "horeca_clientes":  horeca_count,
            "horeca_pago":      horeca_pago,
            "horeca_detalle":   horeca_list,
            # Totales
            "total_confirmado": total_confirmado,
            "total_pendiente":  PENDIENTE_LABEL,
        })
    return results


# ── PDF INDIVIDUAL ────────────────────────────────────────────────────────
def build_pdf_individual(r, styles, output_path):
    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        topMargin=1.5*cm,
        bottomMargin=1.5*cm,
        leftMargin=2.0*cm,
        rightMargin=2.0*cm,
        title=f"Liquidación Incentivos {r['nombre_limpio']} — {PERIODO_LABEL}",
    )

    W = A4[0] - 4.0*cm   # usable width
    story = []

    # ── CABECERA ──────────────────────────────────────────────────────────
    header_data = [
        [Paragraph("PALUMAR S.A.", styles["title"]),
         Paragraph(f"Vendedor: {r['nombre_limpio']}<br/>Código: {r['cod']}", styles["subtitle"])],
        [Paragraph(f"LIQUIDACIÓN DE INCENTIVOS — {PERIODO_LABEL.upper()}", styles["title"]),
         Paragraph(f"Generado: {FECHA_GEN}", styles["subtitle"])],
    ]
    header_tbl = Table([[
        Paragraph("PALUMAR S.A.", styles["title"]),
        Paragraph(f"LIQUIDACIÓN DE INCENTIVOS — {PERIODO_LABEL.upper()}", styles["title"]),
    ]], colWidths=[W*0.35, W*0.65])
    header_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), C_PALMA_VERDE),
        ("TEXTCOLOR",  (0, 0), (-1, -1), C_BLANCO),
        ("TOPPADDING",    (0,0), (-1,-1), 10),
        ("BOTTOMPADDING", (0,0), (-1,-1), 10),
        ("LEFTPADDING",   (0,0), (-1,-1), 12),
        ("RIGHTPADDING",  (0,0), (-1,-1), 12),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
    ]))
    story.append(header_tbl)

    # Subheader vendedor
    sub_data = [
        Paragraph(f"<b>Vendedor:</b> {r['nombre_limpio']} &nbsp;&nbsp;|&nbsp;&nbsp; <b>Código:</b> {r['cod']} &nbsp;&nbsp;|&nbsp;&nbsp; <b>Período:</b> {PERIODO_LABEL} &nbsp;&nbsp;|&nbsp;&nbsp; <b>Emisión:</b> {FECHA_GEN}", styles["body"])
    ]
    sub_tbl = Table([[sub_data[0]]], colWidths=[W])
    sub_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), C_GRIS_CLARO),
        ("TOPPADDING",    (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LEFTPADDING",   (0,0), (-1,-1), 10),
        ("RIGHTPADDING",  (0,0), (-1,-1), 10),
        ("BOX", (0,0), (-1,-1), 0.5, C_GRIS_MED),
    ]))
    story.append(sub_tbl)
    story.append(Spacer(1, 0.4*cm))

    # ── SECCIÓN: VENTAS vs CUOTA ──────────────────────────────────────────
    story.append(_section_header("1. Ventas vs. Cuota — Presupuesto 2026", styles))
    story.append(Spacer(1, 0.2*cm))

    ppto_color = C_ACCENT if r["pct_cumplimiento"] >= 80 else C_ROJO
    ppto_data = [
        [
            Paragraph("Venta Neta\nJunio 2026", styles["label"]),
            Paragraph("Cuota\nAsignada", styles["label"]),
            Paragraph("% Cumplimiento", styles["label"]),
            Paragraph("Tramo\nIncentivo", styles["label"]),
            Paragraph("Factor\nVBI", styles["label"]),
            Paragraph("Pago\nPresupuesto", styles["label"]),
        ],
        [
            Paragraph(fmt_usd(r["venta_neta"]), styles["body_bold"]),
            Paragraph(fmt_usd(r["cuota"]), styles["body"]),
            Paragraph(fmt_pct(r["pct_cumplimiento"]), ParagraphStyle(
                "pct", parent=styles["body_bold"],
                textColor=ppto_color, fontSize=11
            )),
            Paragraph(r["tramo_presupuesto"], styles["body"]),
            Paragraph(
                f"{r['factor_presupuesto']*100:.0f}%" if r["factor_presupuesto"] > 0 else "—",
                styles["body"]
            ),
            Paragraph(r["pago_presupuesto"], styles["pendiente"] if "Pendiente" in r["pago_presupuesto"] else styles["body"]),
        ],
    ]
    ppto_tbl = Table(ppto_data, colWidths=[W*0.18, W*0.18, W*0.14, W*0.17, W*0.12, W*0.21])
    ppto_tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0), C_PALMA_VERDE2),
        ("TEXTCOLOR",    (0, 0), (-1, 0), C_BLANCO),
        ("BACKGROUND",   (0, 1), (-1, 1), C_GRIS_CLARO),
        ("BOX",          (0, 0), (-1, -1), 0.5, C_GRIS_MED),
        ("INNERGRID",    (0, 0), (-1, -1), 0.5, C_GRIS_MED),
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING",   (0,0), (-1,-1), 6),
        ("RIGHTPADDING",  (0,0), (-1,-1), 6),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
    ]))
    story.append(ppto_tbl)
    story.append(_nota_vbi(styles))
    story.append(Spacer(1, 0.5*cm))

    # ── SECCIÓN: EFECTIVIDAD ──────────────────────────────────────────────
    story.append(_section_header("2. Efectividad de Visitas", styles))
    story.append(Spacer(1, 0.2*cm))

    efec_color = C_ACCENT if r["pct_efectividad"] >= 80 else C_ROJO
    efec_data = [
        [
            Paragraph("% Efectividad\nJunio 2026", styles["label"]),
            Paragraph("Tramo\nEscala", styles["label"]),
            Paragraph("Factor\nVBI", styles["label"]),
            Paragraph("Pago\nEfectividad", styles["label"]),
        ],
        [
            Paragraph(fmt_pct(r["pct_efectividad"]), ParagraphStyle(
                "efp", parent=styles["body_bold"],
                textColor=efec_color, fontSize=11
            )),
            Paragraph(r["tramo_efectividad"], styles["body"]),
            Paragraph(
                f"{r['factor_efectividad']*100:.0f}%" if r["factor_efectividad"] > 0 else "—",
                styles["body"]
            ),
            Paragraph(r["pago_efectividad"], styles["pendiente"] if "Pendiente" in r["pago_efectividad"] else styles["body"]),
        ],
    ]
    efec_tbl = Table(efec_data, colWidths=[W*0.20, W*0.25, W*0.20, W*0.35])
    efec_tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0), C_PALMA_VERDE2),
        ("TEXTCOLOR",    (0, 0), (-1, 0), C_BLANCO),
        ("BACKGROUND",   (0, 1), (-1, 1), C_GRIS_CLARO),
        ("BOX",          (0, 0), (-1, -1), 0.5, C_GRIS_MED),
        ("INNERGRID",    (0, 0), (-1, -1), 0.5, C_GRIS_MED),
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING",   (0,0), (-1,-1), 6),
        ("RIGHTPADDING",  (0,0), (-1,-1), 6),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
    ]))
    story.append(efec_tbl)
    story.append(_nota_vbi(styles))
    story.append(Spacer(1, 0.5*cm))

    # ── SECCIÓN: CONCURSO TOSH ────────────────────────────────────────────
    story.append(_section_header("3. Concurso TOSH — BRR.TOSH", styles))
    story.append(Spacer(1, 0.2*cm))

    tosh_data = [
        [
            Paragraph("Clientes impactados\ncon producto TOSH", styles["label"]),
            Paragraph("Bloques\ncompletos (÷20)", styles["label"]),
            Paragraph("Pago TOSH\n($10 / bloque)", styles["label"]),
        ],
        [
            Paragraph(str(r["tosh_clientes"]), styles["body_bold"]),
            Paragraph(str(math.floor(r["tosh_clientes"] / 20)), styles["body"]),
            Paragraph(fmt_usd(r["tosh_pago"]), ParagraphStyle(
                "toshv", parent=styles["body_bold"],
                textColor=C_PALMA_VERDE2, fontSize=11
            )),
        ],
    ]
    tosh_tbl = Table(tosh_data, colWidths=[W*0.33, W*0.33, W*0.34])
    _apply_concurso_style(tosh_tbl)
    story.append(tosh_tbl)

    if r["tosh_skus"]:
        story.append(Spacer(1, 0.15*cm))
        skus_str = ", ".join(str(s) for s in r["tosh_skus"][:8])
        if len(r["tosh_skus"]) > 8:
            skus_str += f" ... (+{len(r['tosh_skus'])-8} más)"
        story.append(Paragraph(
            f"<i>SKUs TOSH vendidos: {skus_str}</i>",
            styles["nota"]
        ))
    story.append(Spacer(1, 0.5*cm))

    # ── SECCIÓN: CONCURSO NUTRICIÓN EXPERTA ──────────────────────────────
    story.append(_section_header("4. Concurso Nutrición Experta", styles))
    story.append(Spacer(1, 0.2*cm))

    ne_alcanza = r["ne_venta"] >= 200.0
    ne_data = [
        [
            Paragraph("Venta Nutrición Experta\nJunio 2026", styles["label"]),
            Paragraph("Meta mínima", styles["label"]),
            Paragraph("¿Alcanza?", styles["label"]),
            Paragraph("Pago NE", styles["label"]),
        ],
        [
            Paragraph(fmt_usd(r["ne_venta"]), styles["body_bold"]),
            Paragraph("$200.00", styles["body"]),
            Paragraph("SÍ" if ne_alcanza else "NO",
                      ParagraphStyle("neal", parent=styles["body_bold"],
                                     textColor=C_ACCENT if ne_alcanza else C_ROJO, fontSize=11)),
            Paragraph(fmt_usd(r["ne_pago"]), ParagraphStyle(
                "nev", parent=styles["body_bold"],
                textColor=C_PALMA_VERDE2 if ne_alcanza else C_ROJO, fontSize=11
            )),
        ],
    ]
    ne_tbl = Table(ne_data, colWidths=[W*0.28, W*0.22, W*0.22, W*0.28])
    _apply_concurso_style(ne_tbl)
    story.append(ne_tbl)
    story.append(Spacer(1, 0.5*cm))

    # ── SECCIÓN: CONCURSO HORECA ──────────────────────────────────────────
    story.append(_section_header("5. Concurso HORECA — Clientes Nuevos Junio", styles))
    story.append(Spacer(1, 0.2*cm))

    horeca_data = [
        [
            Paragraph("Clientes nuevos HORECA\ncon venta — Junio 2026", styles["label"]),
            Paragraph("Pago HORECA\n($1 / cliente)", styles["label"]),
        ],
        [
            Paragraph(str(r["horeca_clientes"]), styles["body_bold"]),
            Paragraph(fmt_usd(r["horeca_pago"]), ParagraphStyle(
                "horecav", parent=styles["body_bold"],
                textColor=C_PALMA_VERDE2 if r["horeca_clientes"] > 0 else C_NEGRO,
                fontSize=11
            )),
        ],
    ]
    horeca_tbl = Table(horeca_data, colWidths=[W*0.60, W*0.40])
    _apply_concurso_style(horeca_tbl)
    story.append(horeca_tbl)

    if r["horeca_detalle"]:
        story.append(Spacer(1, 0.15*cm))
        det_rows = [
            [Paragraph("Código", styles["label"]),
             Paragraph("Nombre cliente HORECA", styles["label"]),
             Paragraph("Keyword detectado", styles["label"])]
        ]
        for h in r["horeca_detalle"]:
            det_rows.append([
                Paragraph(str(h.get("cod", "")), styles["body"]),
                Paragraph(str(h.get("nombre", "")), styles["body"]),
                Paragraph(str(h.get("keyword", "")), styles["body"]),
            ])
        det_tbl = Table(det_rows, colWidths=[W*0.20, W*0.55, W*0.25])
        det_tbl.setStyle(TableStyle([
            ("BACKGROUND",   (0, 0), (-1, 0), C_GRIS_MED),
            ("BOX",          (0, 0), (-1, -1), 0.5, C_GRIS_MED),
            ("INNERGRID",    (0, 0), (-1, -1), 0.3, C_GRIS_MED),
            ("TOPPADDING",    (0,0), (-1,-1), 3),
            ("BOTTOMPADDING", (0,0), (-1,-1), 3),
            ("LEFTPADDING",   (0,0), (-1,-1), 5),
            ("RIGHTPADDING",  (0,0), (-1,-1), 5),
        ]))
        story.append(det_tbl)
    story.append(Spacer(1, 0.6*cm))

    # ── RESUMEN TOTAL ─────────────────────────────────────────────────────
    story.append(HRFlowable(width=W, thickness=1.5, color=C_PALMA_VERDE))
    story.append(Spacer(1, 0.3*cm))

    total_rows = [
        [Paragraph("CONCEPTO", styles["label"]),
         Paragraph("ESTADO", styles["label"]),
         Paragraph("MONTO", styles["label"])],
        [Paragraph("Presupuesto 2026", styles["body"]),
         Paragraph(r["pago_presupuesto"], styles["pendiente"] if "Pendiente" in r["pago_presupuesto"] else styles["body"]),
         Paragraph("—", styles["body"])],
        [Paragraph("Efectividad de visitas", styles["body"]),
         Paragraph(r["pago_efectividad"], styles["pendiente"] if "Pendiente" in r["pago_efectividad"] else styles["body"]),
         Paragraph("—", styles["body"])],
        [Paragraph("Concurso TOSH", styles["body"]),
         Paragraph("Confirmado" if r["tosh_pago"] > 0 else "Sin bloque completo", styles["body"]),
         Paragraph(fmt_usd(r["tosh_pago"]), styles["body_bold"])],
        [Paragraph("Concurso Nutrición Experta", styles["body"]),
         Paragraph("Confirmado" if ne_alcanza else "Venta < $200", styles["body"]),
         Paragraph(fmt_usd(r["ne_pago"]), styles["body_bold"])],
        [Paragraph("Concurso HORECA", styles["body"]),
         Paragraph("Confirmado" if r["horeca_clientes"] > 0 else "Sin clientes HORECA nuevos", styles["body"]),
         Paragraph(fmt_usd(r["horeca_pago"]), styles["body_bold"])],
        [Paragraph("<b>TOTAL CONCURSOS CONFIRMADOS</b>", styles["body_bold"]),
         Paragraph("", styles["body"]),
         Paragraph(f"<b>{fmt_usd(r['total_confirmado'])}</b>", ParagraphStyle(
             "tcv", parent=styles["body_bold"],
             textColor=C_PALMA_VERDE, fontSize=12
         ))],
    ]
    total_tbl = Table(total_rows, colWidths=[W*0.35, W*0.45, W*0.20])
    total_tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0), C_PALMA_VERDE),
        ("TEXTCOLOR",    (0, 0), (-1, 0), C_BLANCO),
        ("BACKGROUND",   (0, -1), (-1, -1), C_GRIS_CLARO),
        ("LINEBELOW",    (0, -1), (-1, -1), 1.0, C_PALMA_VERDE),
        ("BOX",          (0, 0), (-1, -1), 0.5, C_GRIS_MED),
        ("INNERGRID",    (0, 0), (-1, -1), 0.3, C_GRIS_MED),
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
        ("RIGHTPADDING",  (0,0), (-1,-1), 8),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
    ]))
    story.append(total_tbl)
    story.append(Spacer(1, 0.4*cm))

    # ── NOTA FINAL ────────────────────────────────────────────────────────
    nota_text = (
        "<b>Nota:</b> Los rubros de Presupuesto 2026 y Efectividad de Visitas quedan como "
        "<b>Pendiente por dato faltante</b>: el Valor Base del Indicador (VBI) no fue proporcionado "
        "para este período. Una vez se indique el VBI, los montos correspondientes serán calculados "
        "con los factores registrados en este documento.<br/>"
        "Datos fuente: BASE_ACUMULADA · FRECUENCIA_ECOM · MAESTRO_CLIENTES — sistema ECOM PALMA, "
        f"período {PERIODO_LABEL}. Generado automáticamente el {FECHA_GEN}."
    )
    nota_tbl = Table([[Paragraph(nota_text, styles["nota"])]], colWidths=[W])
    nota_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), colors.HexColor("#FFF8E1")),
        ("BOX",           (0,0), (-1,-1), 0.5, C_AMARILLO),
        ("TOPPADDING",    (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
        ("RIGHTPADDING",  (0,0), (-1,-1), 8),
    ]))
    story.append(nota_tbl)

    doc.build(story)


def _section_header(text, styles):
    tbl = Table([[Paragraph(text, styles["section_head"])]], colWidths=[None])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), C_PALMA_VERDE2),
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
        ("RIGHTPADDING",  (0,0), (-1,-1), 8),
    ]))
    return tbl


def _nota_vbi(styles):
    return Paragraph(
        "⚠ <i>Pago pendiente: el VBI (Valor Base del Indicador) para este indicador no fue proporcionado.</i>",
        styles["nota"]
    )


def _apply_concurso_style(tbl):
    tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0), C_PALMA_VERDE2),
        ("TEXTCOLOR",    (0, 0), (-1, 0), C_BLANCO),
        ("BACKGROUND",   (0, 1), (-1, 1), C_GRIS_CLARO),
        ("BOX",          (0, 0), (-1, -1), 0.5, C_GRIS_MED),
        ("INNERGRID",    (0, 0), (-1, -1), 0.5, C_GRIS_MED),
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING",   (0,0), (-1,-1), 6),
        ("RIGHTPADDING",  (0,0), (-1,-1), 6),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
    ]))


# ── PDF CONSOLIDADO ───────────────────────────────────────────────────────
def build_pdf_consolidado(results, styles, output_path):
    doc = SimpleDocTemplate(
        output_path,
        pagesize=(A4[1], A4[0]),  # landscape
        topMargin=1.5*cm,
        bottomMargin=1.5*cm,
        leftMargin=1.5*cm,
        rightMargin=1.5*cm,
        title=f"Consolidado Incentivos PALUMAR — {PERIODO_LABEL}",
    )

    W = A4[1] - 3.0*cm  # landscape usable width

    story = []

    # Encabezado
    hdr = Table([[
        Paragraph("PALUMAR S.A.", styles["title"]),
        Paragraph(f"CONSOLIDADO DE PAGOS DE INCENTIVOS — {PERIODO_LABEL.upper()}", styles["title"]),
        Paragraph(f"Generado: {FECHA_GEN}", styles["subtitle"]),
    ]], colWidths=[W*0.18, W*0.60, W*0.22])
    hdr.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), C_PALMA_VERDE),
        ("TEXTCOLOR",  (0,0), (-1,-1), C_BLANCO),
        ("TOPPADDING",    (0,0), (-1,-1), 10),
        ("BOTTOMPADDING", (0,0), (-1,-1), 10),
        ("LEFTPADDING",   (0,0), (-1,-1), 12),
        ("RIGHTPADDING",  (0,0), (-1,-1), 12),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
    ]))
    story.append(hdr)
    story.append(Spacer(1, 0.5*cm))

    # Tabla principal
    col_headers = [
        "Cód", "Vendedor",
        "Venta\nNeta", "Cuota", "% Cum.",
        "Tramo\nPpto.", "Pago\nPpto.",
        "% Efec.", "Tramo\nEfec.", "Pago\nEfec.",
        "TOSH\nClts", "Pago\nTOSH",
        "NE\nVenta", "Pago\nNE",
        "HORECA\nClts", "Pago\nHOREC",
        "Total\nConfirm.",
    ]
    col_w = [
        W*0.040, W*0.130,       # cod, nombre
        W*0.075, W*0.075, W*0.050,   # ventas
        W*0.065, W*0.085,       # presupuesto
        W*0.045, W*0.065, W*0.085,   # efectividad
        W*0.040, W*0.055,       # tosh
        W*0.060, W*0.050,       # NE
        W*0.040, W*0.055,       # horeca
        W*0.080,                # total
    ]

    rows = [
        [Paragraph(h, ParagraphStyle("ch", parent=styles["label"],
                                      textColor=C_BLANCO, fontSize=7,
                                      alignment=TA_CENTER, leading=9))
         for h in col_headers]
    ]

    total_tosh = total_ne = total_horeca = total_confirm = 0
    for i, r in enumerate(results):
        bg = C_GRIS_CLARO if i % 2 == 0 else C_BLANCO
        ne_ok = r["ne_venta"] >= 200
        rows.append([
            Paragraph(r["cod"], styles["body"]),
            Paragraph(r["nombre_limpio"][:22], styles["body"]),
            Paragraph(fmt_usd(r["venta_neta"]), styles["body"]),
            Paragraph(fmt_usd(r["cuota"]), styles["body"]),
            Paragraph(fmt_pct(r["pct_cumplimiento"]),
                      ParagraphStyle("cp", parent=styles["body_bold"],
                                     textColor=C_ACCENT if r["pct_cumplimiento"] >= 80 else C_ROJO,
                                     fontSize=8, alignment=TA_CENTER)),
            Paragraph(r["tramo_presupuesto"], styles["nota"]),
            Paragraph(PENDIENTE_LABEL[:18] + "…" if "Pendiente" in r["pago_presupuesto"] else r["pago_presupuesto"],
                      styles["pendiente"]),
            Paragraph(fmt_pct(r["pct_efectividad"]),
                      ParagraphStyle("ef", parent=styles["body_bold"],
                                     textColor=C_ACCENT if r["pct_efectividad"] >= 80 else C_ROJO,
                                     fontSize=8, alignment=TA_CENTER)),
            Paragraph(r["tramo_efectividad"], styles["nota"]),
            Paragraph(PENDIENTE_LABEL[:18] + "…" if "Pendiente" in r["pago_efectividad"] else r["pago_efectividad"],
                      styles["pendiente"]),
            Paragraph(str(r["tosh_clientes"]), styles["body"]),
            Paragraph(fmt_usd(r["tosh_pago"]), styles["body_bold"]),
            Paragraph(fmt_usd(r["ne_venta"]), styles["body"]),
            Paragraph(fmt_usd(r["ne_pago"]),
                      ParagraphStyle("nep", parent=styles["body_bold"],
                                     textColor=C_PALMA_VERDE2 if ne_ok else C_ROJO, fontSize=8)),
            Paragraph(str(r["horeca_clientes"]), styles["body"]),
            Paragraph(fmt_usd(r["horeca_pago"]), styles["body_bold"]),
            Paragraph(f"<b>{fmt_usd(r['total_confirmado'])}</b>",
                      ParagraphStyle("tc", parent=styles["body_bold"],
                                     textColor=C_PALMA_VERDE, fontSize=9)),
        ])
        total_tosh   += r["tosh_pago"]
        total_ne     += r["ne_pago"]
        total_horeca += r["horeca_pago"]
        total_confirm += r["total_confirmado"]

    # Fila de totales
    rows.append([
        Paragraph("", styles["body"]),
        Paragraph("<b>TOTALES</b>", styles["body_bold"]),
        Paragraph("", styles["body"]), Paragraph("", styles["body"]), Paragraph("", styles["body"]),
        Paragraph("", styles["body"]), Paragraph("", styles["body"]),
        Paragraph("", styles["body"]), Paragraph("", styles["body"]), Paragraph("", styles["body"]),
        Paragraph("", styles["body"]),
        Paragraph(f"<b>{fmt_usd(total_tosh)}</b>", ParagraphStyle("tt", parent=styles["body_bold"], textColor=C_PALMA_VERDE, fontSize=8)),
        Paragraph("", styles["body"]),
        Paragraph(f"<b>{fmt_usd(total_ne)}</b>", ParagraphStyle("tn", parent=styles["body_bold"], textColor=C_PALMA_VERDE, fontSize=8)),
        Paragraph("", styles["body"]),
        Paragraph(f"<b>{fmt_usd(total_horeca)}</b>", ParagraphStyle("th", parent=styles["body_bold"], textColor=C_PALMA_VERDE, fontSize=8)),
        Paragraph(f"<b>{fmt_usd(total_confirm)}</b>", ParagraphStyle("tcc", parent=styles["body_bold"], textColor=C_PALMA_VERDE, fontSize=10)),
    ])

    main_tbl = Table(rows, colWidths=col_w, repeatRows=1)
    n_data = len(rows)
    main_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0),    (-1, 0),         C_PALMA_VERDE),
        ("BACKGROUND",    (0, n_data-1), (-1, n_data-1), C_GRIS_CLARO),
        ("LINEBELOW",     (0, 0),    (-1, 0),         1.0, C_BLANCO),
        ("LINEABOVE",     (0, n_data-1), (-1, n_data-1), 1.0, C_PALMA_VERDE),
        ("BOX",           (0, 0),    (-1, -1),        0.5, C_GRIS_MED),
        ("INNERGRID",     (0, 0),    (-1, -1),        0.3, C_GRIS_MED),
        ("TOPPADDING",    (0, 0),    (-1, -1),        3),
        ("BOTTOMPADDING", (0, 0),    (-1, -1),        3),
        ("LEFTPADDING",   (0, 0),    (-1, -1),        3),
        ("RIGHTPADDING",  (0, 0),    (-1, -1),        3),
        ("VALIGN",        (0, 0),    (-1, -1),        "MIDDLE"),
    ] + [
        ("BACKGROUND", (0, i+1), (-1, i+1), C_GRIS_CLARO if i % 2 == 0 else C_BLANCO)
        for i in range(len(results))
    ]))
    story.append(main_tbl)
    story.append(Spacer(1, 0.4*cm))

    # Nota
    nota_text = (
        f"<b>Nota:</b> Presupuesto y Efectividad marcados como pendientes — VBI no proporcionado. "
        f"Total confirmado incluye únicamente concursos TOSH + Nutrición Experta + HORECA. "
        f"Fuente: BASE_ACUMULADA · FRECUENCIA_ECOM — sistema ECOM PALMA, período {PERIODO_LABEL}. "
        f"Generado el {FECHA_GEN}."
    )
    nota_tbl = Table([[Paragraph(nota_text, styles["nota"])]], colWidths=[W])
    nota_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), colors.HexColor("#FFF8E1")),
        ("BOX",           (0,0), (-1,-1), 0.5, C_AMARILLO),
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
        ("RIGHTPADDING",  (0,0), (-1,-1), 8),
    ]))
    story.append(nota_tbl)

    doc.build(story)


# ── CSV CONSOLIDADO ───────────────────────────────────────────────────────
def write_csv_consolidado(results, output_path):
    fieldnames = [
        "cod", "nombre_limpio",
        "venta_neta", "cuota", "pct_cumplimiento",
        "tramo_presupuesto", "factor_presupuesto", "pago_presupuesto",
        "pct_efectividad", "tramo_efectividad", "factor_efectividad", "pago_efectividad",
        "tosh_clientes", "tosh_pago",
        "ne_venta", "ne_pago",
        "horeca_clientes", "horeca_pago",
        "total_confirmado", "total_pendiente",
    ]
    with open(output_path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        for r in results:
            row = {k: r[k] for k in fieldnames}
            # format numbers
            row["venta_neta"]    = f"{r['venta_neta']:.2f}"
            row["cuota"]         = f"{r['cuota']:.2f}"
            row["ne_venta"]      = f"{r['ne_venta']:.2f}"
            row["horeca_pago"]   = f"{r['horeca_pago']:.2f}"
            row["total_confirmado"] = f"{r['total_confirmado']:.2f}"
            w.writerow(row)


# ── CSV AUDITORÍA HORECA ──────────────────────────────────────────────────
def write_csv_horeca(results, output_path):
    with open(output_path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["cod_asesor", "nombre_asesor", "cod_cliente", "nombre_cliente", "keyword_horeca"])
        for r in results:
            if r["horeca_detalle"]:
                for h in r["horeca_detalle"]:
                    w.writerow([
                        r["cod"], r["nombre_limpio"],
                        h.get("cod", ""), h.get("nombre", ""), h.get("keyword", "")
                    ])


# ── CSV AUDITORÍA TOSH ────────────────────────────────────────────────────
def write_csv_tosh(results, output_path):
    with open(output_path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["cod_asesor", "nombre_asesor", "clientes_tosh", "bloques_20", "pago_tosh", "skus_vendidos"])
        for r in results:
            skus_str = "; ".join(str(s) for s in r.get("tosh_skus", []))
            w.writerow([
                r["cod"], r["nombre_limpio"],
                r["tosh_clientes"],
                math.floor(r["tosh_clientes"] / 20),
                f"{r['tosh_pago']:.2f}",
                skus_str,
            ])


# ── CSV AUDITORÍA NUTRICIÓN EXPERTA ──────────────────────────────────────
def write_csv_ne(results, output_path):
    with open(output_path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["cod_asesor", "nombre_asesor", "venta_nutricion_experta", "meta_200", "alcanza", "pago_ne"])
        for r in results:
            w.writerow([
                r["cod"], r["nombre_limpio"],
                f"{r['ne_venta']:.2f}",
                "200.00",
                "SI" if r["ne_venta"] >= 200 else "NO",
                f"{r['ne_pago']:.2f}",
            ])


# ── CSV AUDITORÍA CÁLCULOS ────────────────────────────────────────────────
def write_csv_calculos(results, output_path):
    with open(output_path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow([
            "cod_asesor", "nombre_asesor",
            "venta_neta", "cuota", "pct_cumplimiento",
            "tramo_presupuesto", "factor_presupuesto_vbi",
            "pct_efectividad", "tramo_efectividad", "factor_efectividad_vbi",
            "formula_tosh", "tosh_clientes", "bloques_20", "pago_tosh",
            "formula_ne", "ne_venta", "ne_meta", "pago_ne",
            "formula_horeca", "horeca_clientes_nuevos", "pago_horeca",
            "total_concursos_confirmado",
            "pago_presupuesto_pendiente", "pago_efectividad_pendiente",
        ])
        for r in results:
            w.writerow([
                r["cod"], r["nombre_limpio"],
                f"{r['venta_neta']:.2f}", f"{r['cuota']:.2f}", f"{r['pct_cumplimiento']:.2f}",
                r["tramo_presupuesto"], f"{r['factor_presupuesto']*100:.1f}% de VBI",
                f"{r['pct_efectividad']:.2f}", r["tramo_efectividad"], f"{r['factor_efectividad']*100:.1f}% de VBI",
                f"floor({r['tosh_clientes']}/20)×$10", r["tosh_clientes"],
                math.floor(r["tosh_clientes"]/20), f"{r['tosh_pago']:.2f}",
                "$20 si NE≥$200", f"{r['ne_venta']:.2f}", "200.00", f"{r['ne_pago']:.2f}",
                "$1×HORECA_nuevos_junio", r["horeca_clientes"], f"{r['horeca_pago']:.2f}",
                f"{r['total_confirmado']:.2f}",
                "Pendiente — VBI no proporcionado",
                "Pendiente — VBI no proporcionado",
            ])


# ── MAIN ──────────────────────────────────────────────────────────────────
def main():
    print(f"\n{'='*60}")
    print(f"  LIQUIDACIÓN DE INCENTIVOS — {PERIODO_LABEL.upper()}")
    print(f"  PALUMAR S.A.")
    print(f"{'='*60}\n")

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # 1. Fetch
    print("1. Obteniendo datos desde API PALMA...\n")
    vendedores_data = fetch("vendedores")
    inc_data        = fetch("incentivos_vendedores")
    cn_data         = fetch("clientes_nuevos", {"desde": "2026-06-01", "hasta": "2026-06-30"})

    if not isinstance(vendedores_data, list) or len(vendedores_data) == 0:
        print("ERROR: vendedores endpoint retornó datos vacíos o inesperados")
        return

    inc_map = {}
    for v in inc_data.get("vendedores", []):
        inc_map[str(v["cod"])] = v
    print(f"   Vendedores base:     {len(vendedores_data)}")
    print(f"   Registros incentivos: {len(inc_map)}")

    # 2. HORECA desde clientes_nuevos
    horeca_por_vendedor = {}
    cn_detalle = cn_data.get("detalle", [])
    print(f"   Clientes nuevos junio: {len(cn_detalle)}")

    horeca_total = 0
    for c in cn_detalle:
        razon  = c.get("razon_social", "") or ""
        nombre = c.get("nombre", "")       or ""
        ok, kw = es_horeca(razon)
        if not ok:
            ok, kw = es_horeca(nombre)
        if ok:
            cod_a = str(c.get("cod_asesor", "")).zfill(3)
            if cod_a not in horeca_por_vendedor:
                horeca_por_vendedor[cod_a] = []
            horeca_por_vendedor[cod_a].append({
                "cod":     c.get("cod_cliente", ""),
                "nombre":  razon or nombre,
                "keyword": kw,
            })
            horeca_total += 1

    print(f"   Clientes HORECA nuevos: {horeca_total}")
    for cod, lst in sorted(horeca_por_vendedor.items()):
        for h in lst:
            print(f"     [{cod}] {h['nombre']} → '{h['keyword']}'")

    # 3. Calcular
    print("\n2. Calculando incentivos...\n")
    results = calcular_incentivos(vendedores_data, inc_map, horeca_por_vendedor)

    print(f"{'COD':<5} {'NOMBRE':<28} {'%CUM':>6} {'TOSH$':>7} {'NE$':>6} {'HORECA$':>8} {'TOTAL$':>8}")
    print("-"*70)
    grand_total = 0
    for r in results:
        print(f"{r['cod']:<5} {r['nombre_limpio']:<28} "
              f"{r['pct_cumplimiento']:>5.1f}% "
              f"{r['tosh_pago']:>7.2f} "
              f"{r['ne_pago']:>6.2f} "
              f"{r['horeca_pago']:>8.2f} "
              f"{r['total_confirmado']:>8.2f}")
        grand_total += r["total_confirmado"]
    print("-"*70)
    print(f"{'TOTAL':>38} {grand_total:>8.2f}")

    # 4. PDFs individuales
    print("\n3. Generando PDFs individuales...\n")
    styles = make_styles()
    for r in results:
        slug = slug_nombre(r["nombre"])
        fname = f"LIQUIDACION_INCENTIVOS_JUNIO_2026_{r['cod']}_{slug}.pdf"
        fpath = os.path.join(OUTPUT_DIR, fname)
        build_pdf_individual(r, styles, fpath)
        print(f"   ✓ {fname}")

    # 5. PDF consolidado
    print("\n4. Generando PDF consolidado...\n")
    cons_pdf = os.path.join(OUTPUT_DIR, "CONSOLIDADO_PAGOS_INCENTIVOS_JUNIO_2026.pdf")
    build_pdf_consolidado(results, styles, cons_pdf)
    print(f"   ✓ CONSOLIDADO_PAGOS_INCENTIVOS_JUNIO_2026.pdf")

    # 6. CSVs
    print("\n5. Generando CSVs...\n")
    write_csv_consolidado(results, os.path.join(OUTPUT_DIR, "CONSOLIDADO_PAGOS_INCENTIVOS_JUNIO_2026.csv"))
    print("   ✓ CONSOLIDADO_PAGOS_INCENTIVOS_JUNIO_2026.csv")

    write_csv_horeca(results, os.path.join(OUTPUT_DIR, "AUDITORIA_HORECA_JUNIO_2026.csv"))
    print("   ✓ AUDITORIA_HORECA_JUNIO_2026.csv")

    write_csv_tosh(results, os.path.join(OUTPUT_DIR, "AUDITORIA_TOSH_JUNIO_2026.csv"))
    print("   ✓ AUDITORIA_TOSH_JUNIO_2026.csv")

    write_csv_ne(results, os.path.join(OUTPUT_DIR, "AUDITORIA_NE_JUNIO_2026.csv"))
    print("   ✓ AUDITORIA_NE_JUNIO_2026.csv")

    write_csv_calculos(results, os.path.join(OUTPUT_DIR, "AUDITORIA_CALCULOS_JUNIO_2026.csv"))
    print("   ✓ AUDITORIA_CALCULOS_JUNIO_2026.csv")

    # 7. Resumen final
    print(f"\n{'='*60}")
    print(f"  RESUMEN FINAL")
    print(f"{'='*60}")
    print(f"  Vendedores procesados:    {len(results)}")
    print(f"  Clientes HORECA nuevos:   {horeca_total}")
    print(f"  Total concursos TOSH:     {fmt_usd(sum(r['tosh_pago'] for r in results))}")
    print(f"  Total concursos NE:       {fmt_usd(sum(r['ne_pago'] for r in results))}")
    print(f"  Total concursos HORECA:   {fmt_usd(sum(r['horeca_pago'] for r in results))}")
    print(f"  TOTAL CONFIRMADO:         {fmt_usd(grand_total)}")
    print(f"  Presupuesto + Efectividad: PENDIENTE (VBI no proporcionado)")
    print(f"\n  Archivos en: {os.path.abspath(OUTPUT_DIR)}/")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
