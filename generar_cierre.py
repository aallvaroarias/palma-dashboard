#!/usr/bin/env python3
"""
Generador PDF: Cierre de Mes PALUMAR — Junio 2026  (v2 — layout corregido)
Genera:
  cierre_mes_palumar/CIERRE_MES_PALUMAR_META_INFLADA.pdf
  cierre_mes_palumar/CIERRE_MES_PALUMAR_META_ECOM_REAL.pdf
  cierre_mes_palumar/datos_cierre_mes_palumar.json
  cierre_mes_palumar/datos_cierre_mes_palumar.csv

Datos validados contra API PALMA el 2026-07-01.
"""

import json
import csv
from pathlib import Path

from reportlab.pdfgen import canvas as rl
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white

# ─── Página ──────────────────────────────────────────────────────────────────
W, H = A4          # 595.27 x 841.89 pt
ML   = 20 * mm
MR   = 20 * mm
CW   = W - ML - MR  # ≈ 482 pt

# ─── Colores ─────────────────────────────────────────────────────────────────
NAVY   = HexColor('#0A3560')
BLUE   = HexColor('#1565A8')
CYAN   = HexColor('#17B8D9')
GOLD   = HexColor('#D4A017')
GREEN  = HexColor('#27A060')
RED    = HexColor('#C93030')
ORANGE = HexColor('#E07825')
LGRAY  = HexColor('#EDF2F7')
BGRAY  = HexColor('#CBD5E0')
MGRAY  = HexColor('#718096')
DARK   = HexColor('#1A2744')

# ─── Datos validados ─────────────────────────────────────────────────────────
VB          = 456288.81
DEV         = 46115.18
AV          = 16910.12
VN          = 393263.51
DEV_PCT     = 10.11
AV_PCT      = 3.71

COB_IMP     = 1789
COB_MAE     = 2608
COB_PCT     = 68.6

META_PALMA  = 564546.27
META_ECOM   = 462962.00
CUMPL_PALMA = 69.66
CUMPL_ECOM  = 84.94
FALTA_PALMA = 171282.76
FALTA_ECOM  = 69698.49

SIN_NEG     = 15101.89
SIN_NEG_PCT = 3.84

FECHA_CORTE = "29 de junio de 2026"
FECHA_HOY   = "1 de julio de 2026"

#  (nombre, venta, meta_ecom, meta_palma, cumpl_ecom, cumpl_palma, cob_imp, cob_pct)
NEGOCIOS = [
    ("Chocolates",        154328.35, 170589, 207673,  90.47, 74.32, 1352, 51.8),
    ("Cárnico",            94278.22, 137796, 167751,  68.42, 56.20, 1479, 56.7),
    ("Galletas",           60668.67,  85681, 104307,  70.81, 58.16, 1116, 42.8),
    ("Bebidas TMLUC",      35417.77,  34247,  41692, 103.42, 84.97,  834, 32.0),
    ("Café",               30064.11,  31562,  38423,  95.25, 78.24,  714, 27.4),
    ("Snacks TMLUC",        2464.67,   2037,   3520, 121.00, 70.02,   54,  2.1),
    ("Nutrición Experta",    868.39,   1000,   1120,  86.84, 77.54,   31,  1.2),
    ("Otros TMLUC",           71.44,     50,     61, 142.88,117.12,    6,  0.2),
]

# ─── Helpers de formato ───────────────────────────────────────────────────────
def c_fmt(n):
    return f"${n:,.0f}"

def p_fmt(n):
    return f"{n:.1f}%"

# ─── Primitivas de dibujo ─────────────────────────────────────────────────────
def ftext(c, x, y, text, font="Helvetica", size=10, color=DARK, align='left'):
    c.setFont(font, size)
    c.setFillColor(color)
    s = str(text)
    if align == 'center':
        c.drawCentredString(x, y, s)
    elif align == 'right':
        c.drawRightString(x, y, s)
    else:
        c.drawString(x, y, s)

def frect(c, x, y, w, h, fill, radius=0, stroke_color=None, lw=0.5):
    c.setFillColor(fill)
    if stroke_color:
        c.setStrokeColor(stroke_color)
        c.setLineWidth(lw)
    if radius:
        c.roundRect(x, y, w, h, radius, fill=1, stroke=1 if stroke_color else 0)
    else:
        c.rect(x, y, w, h, fill=1, stroke=1 if stroke_color else 0)

def fline(c, x1, y1, x2, y2, color=BGRAY, lw=0.5):
    c.setStrokeColor(color)
    c.setLineWidth(lw)
    c.line(x1, y1, x2, y2)

def wrap_text(c, x, y, text, font, size, color, max_w, line_h=13):
    """Dibuja texto con word-wrap; devuelve la y final (ya decrementada)."""
    c.setFont(font, size)
    words = text.split()
    buf = []
    for word in words:
        test = ' '.join(buf + [word])
        if buf and c.stringWidth(test, font, size) > max_w:
            ftext(c, x, y, ' '.join(buf), font, size, color)
            y -= line_h
            buf = [word]
        else:
            buf.append(word)
    if buf:
        ftext(c, x, y, ' '.join(buf), font, size, color)
        y -= line_h
    return y

# ─── Helpers de color por cumplimiento ────────────────────────────────────────
def cumpl_color(pct):
    if pct >= 100: return GREEN
    if pct >= 85:  return BLUE
    if pct >= 70:  return ORANGE
    return RED

def cumpl_bg(pct):
    if pct >= 100: return HexColor('#D4F4E5')
    if pct >= 85:  return HexColor('#D0E8F8')
    if pct >= 70:  return HexColor('#FEF1DC')
    return HexColor('#FADDDD')

# ─── Header / Footer ─────────────────────────────────────────────────────────
def draw_header(c, meta_type):
    badge = "META PALMA INFLADA" if meta_type == 'palma' else "META ECOM REAL"
    frect(c, 0, H - 11*mm, W, 11*mm, NAVY)
    ftext(c, ML, H - 7.2*mm, "DISTRIBUCIONES PALUMAR S.A.",
          "Helvetica-Bold", 7.5, white)
    ftext(c, W - MR, H - 7.2*mm,
          f"CIERRE JUNIO 2026  ·  {badge}", "Helvetica", 7, white, 'right')

def draw_footer(c, page_num, total=6):
    fline(c, ML, 13*mm, W - MR, 13*mm, BGRAY, 0.5)
    ftext(c, ML, 8.5*mm,
          "Confidencial · Distribuciones PALUMAR S.A. · Junio 2026",
          "Helvetica", 7, MGRAY)
    ftext(c, W - MR, 8.5*mm, f"Pág. {page_num} de {total}",
          "Helvetica", 7, MGRAY, 'right')

def section_title(c, y, title):
    ftext(c, ML, y, title.upper(), "Helvetica-Bold", 12, NAVY)
    fline(c, ML, y - 3, ML + 72*mm, y - 3, CYAN, 2)
    return y - 9*mm

# ═══════════════════════════════════════════════════════════════════════════════
#  PÁGINA 1 — PORTADA
# ═══════════════════════════════════════════════════════════════════════════════
def page_cover(c, meta_type):
    frect(c, 0, 0, W, H, NAVY)

    # Barra cyan superior
    frect(c, 0, H - 14*mm, W, 14*mm, CYAN)
    ftext(c, ML, H - 9.5*mm,
          "DISTRIBUCIONES PALUMAR S.A.", "Helvetica-Bold", 10.5, NAVY)
    ftext(c, W - MR, H - 9.5*mm, "Panamá · 2026",
          "Helvetica", 8, NAVY, 'right')

    # Título
    y = H - 72*mm
    ftext(c, W/2, y, "C I E R R E   D E   M E S",
          "Helvetica", 19, white, 'center')
    y -= 17*mm
    ftext(c, W/2, y, "JUNIO  2026",
          "Helvetica-Bold", 46, GOLD, 'center')
    y -= 11*mm
    ftext(c, W/2, y, "PALUMAR  ·  Consolidado General",
          "Helvetica", 11, HexColor('#8AB4D0'), 'center')
    y -= 6*mm
    ftext(c, W/2, y, f"Corte: {FECHA_CORTE}",
          "Helvetica", 9, HexColor('#5C8BAA'), 'center')

    # Divisor dorado
    y -= 11*mm
    frect(c, W/2 - 62*mm, y, 124*mm, 1.5, GOLD)

    # Badge tipo de meta
    y -= 13*mm
    bw, bh = 142*mm, 11*mm
    bx = (W - bw) / 2
    frect(c, bx, y - 2*mm, bw, bh, HexColor('#0E4D8A'))
    if meta_type == 'palma':
        badge_txt = "ANÁLISIS VS  META PALMA INFLADA   ·   $564,546"
    else:
        badge_txt = "ANÁLISIS VS  META ECOM REAL   ·   $462,962"
    ftext(c, W/2, y + 5, badge_txt, "Helvetica-Bold", 10, GOLD, 'center')

    # KPIs de vista previa — 3 cajas
    y -= 30*mm
    cumpl = CUMPL_PALMA if meta_type == 'palma' else CUMPL_ECOM
    kpis = [
        ("VENTA NETA",    c_fmt(VN),        white,                 f"Neta de dev. y averías"),
        ("CUMPLIMIENTO",  p_fmt(cumpl),
         GOLD if cumpl < 85 else GREEN,      f"vs Meta {'PALMA' if meta_type=='palma' else 'ECOM'}"),
        ("COBERTURA",     p_fmt(COB_PCT),    HexColor('#5DC8E8'),
         f"{COB_IMP:,} / {COB_MAE:,} clientes"),
    ]
    bkw, bkg = 53*mm, 4.5*mm
    bk0 = (W - (3*bkw + 2*bkg)) / 2
    for i, (lbl, val, col_v, sub) in enumerate(kpis):
        bx = bk0 + i*(bkw + bkg)
        # Caja
        frect(c, bx, y - 3*mm, bkw, 28*mm, HexColor('#0E3F72'), radius=3)
        # Etiqueta (arriba)
        ftext(c, bx + bkw/2, y + 19, lbl,
              "Helvetica", 6.5, HexColor('#7AACCF'), 'center')
        # Valor (centro)
        ftext(c, bx + bkw/2, y + 9, val,
              "Helvetica-Bold", 15, col_v, 'center')
        # Sub (abajo, separado del valor)
        ftext(c, bx + bkw/2, y - 1, sub,
              "Helvetica", 6, HexColor('#4A7A9A'), 'center')

    # Segunda fila — métricas secundarias
    y -= 39*mm
    sk = [
        ("VENTA BRUTA",  c_fmt(VB)),
        ("DEVOLUCIONES", f"{p_fmt(DEV_PCT)} · {c_fmt(DEV)}"),
        ("AVERÍAS",      f"{p_fmt(AV_PCT)} · {c_fmt(AV)}"),
    ]
    skw, skg = 54*mm, 4*mm
    sk0 = (W - (3*skw + 2*skg)) / 2
    for i, (lbl, val) in enumerate(sk):
        bx = sk0 + i*(skw + skg)
        frect(c, bx, y, skw, 16*mm, HexColor('#0B3360'), radius=2)
        ftext(c, bx + skw/2, y + 10, val,
              "Helvetica-Bold", 9.5, white, 'center')
        ftext(c, bx + skw/2, y + 2, lbl,
              "Helvetica", 6, HexColor('#5C8BAA'), 'center')

    # Pie de portada
    y -= 22*mm
    frect(c, ML, y, CW, 0.8, HexColor('#1A4870'))
    y -= 6*mm
    ftext(c, W/2, y,
          f"Generado el {FECHA_HOY}  ·  CONFIDENCIAL — Solo para uso directivo",
          "Helvetica", 7.5, HexColor('#3D6280'), 'center')
    ftext(c, W/2, y - 5*mm,
          "Este documento contiene información comercial sensible. No distribuir sin autorización.",
          "Helvetica", 7, HexColor('#2E4E66'), 'center')


# ═══════════════════════════════════════════════════════════════════════════════
#  PÁGINA 2 — RESUMEN GENERAL
# ═══════════════════════════════════════════════════════════════════════════════
def page_resumen(c, meta_type):
    draw_header(c, meta_type)
    draw_footer(c, 2)

    y = H - 18*mm
    y = section_title(c, y, "Resumen General")

    meta_v = META_PALMA if meta_type == 'palma' else META_ECOM
    cumpl  = CUMPL_PALMA if meta_type == 'palma' else CUMPL_ECOM
    falta  = FALTA_PALMA if meta_type == 'palma' else FALTA_ECOM
    mlbl   = "Meta PALMA" if meta_type == 'palma' else "Meta ECOM"

    # 2 filas × 3 tarjetas KPI
    gap  = 4.5*mm
    cw_c = (CW - 2*gap) / 3
    ch_c = 54.0
    y_r1 = y - 6*mm - ch_c
    y_r2 = y_r1 - 5*mm - ch_c

    def kpi(x, y, label, val, sub, val_c=DARK, bg=LGRAY, border=None):
        frect(c, x, y, cw_c, ch_c, bg, radius=4,
              stroke_color=border, lw=1.0)
        # Etiqueta en parte alta
        ftext(c, x + cw_c/2, y + ch_c - 14,
              label, "Helvetica", 7.5, MGRAY, 'center')
        # Valor en el centro
        ftext(c, x + cw_c/2, y + ch_c/2 - 1,
              val, "Helvetica-Bold", 15, val_c, 'center')
        # Sub en parte baja (con margen suficiente)
        ftext(c, x + cw_c/2, y + 8,
              sub, "Helvetica", 7, MGRAY, 'center')

    x1 = ML
    x2 = ML + cw_c + gap
    x3 = ML + 2*(cw_c + gap)

    # Fila 1
    kpi(x1, y_r1, "VENTA BRUTA",  c_fmt(VB),  "Total facturado")
    kpi(x2, y_r1, "VENTA NETA",   c_fmt(VN),  "Neta de dev. y averías",
        NAVY, HexColor('#E0EBF5'), NAVY)
    kpi(x3, y_r1, "COBERTURA",    p_fmt(COB_PCT),
        f"{COB_IMP:,} / {COB_MAE:,} clientes",
        cumpl_color(COB_PCT), cumpl_bg(COB_PCT))

    # Fila 2
    kpi(x1, y_r2, mlbl.upper(),   c_fmt(meta_v), "Objetivo del período")
    kpi(x2, y_r2, "CUMPLIMIENTO", p_fmt(cumpl),
        f"vs {mlbl}", cumpl_color(cumpl), cumpl_bg(cumpl), cumpl_color(cumpl))
    kpi(x3, y_r2, "FALTANTE",     c_fmt(falta),
        f"para alcanzar {mlbl}", RED, HexColor('#FEEAEA'))

    # Separador
    y_sep = y_r2 - 9*mm
    fline(c, ML, y_sep, W - MR, y_sep, BGRAY, 0.5)

    # Resumen ejecutivo
    y_txt = y_sep - 10*mm
    ftext(c, ML, y_txt, "RESUMEN EJECUTIVO", "Helvetica-Bold", 9, NAVY)
    y_txt -= 7*mm

    if meta_type == 'palma':
        resumen = (
            f"Palumar cerró junio 2026 con una venta neta de {c_fmt(VN)}, "
            f"equivalente al {p_fmt(CUMPL_PALMA)} de cumplimiento frente a la "
            f"Meta PALMA de {c_fmt(META_PALMA)}. El déficit del período asciende "
            f"a {c_fmt(FALTA_PALMA)}. La cobertura de clientes finalizó en "
            f"{p_fmt(COB_PCT)} ({COB_IMP:,} de {COB_MAE:,} clientes impactados), "
            f"con 819 clientes sin visita durante el mes."
        )
    else:
        resumen = (
            f"Palumar cerró junio 2026 con una venta neta de {c_fmt(VN)}, "
            f"equivalente al {p_fmt(CUMPL_ECOM)} de cumplimiento frente a la "
            f"Meta ECOM de {c_fmt(META_ECOM)}. El déficit del período asciende "
            f"a {c_fmt(FALTA_ECOM)}. La cobertura de clientes finalizó en "
            f"{p_fmt(COB_PCT)} ({COB_IMP:,} de {COB_MAE:,} clientes impactados), "
            f"con 819 clientes sin visita durante el mes."
        )
    y_txt = wrap_text(c, ML, y_txt, resumen, "Helvetica", 9, DARK, CW, 14)

    # Indicadores complementarios — 4 mini-cajas
    y_txt -= 10*mm
    ftext(c, ML, y_txt, "INDICADORES COMPLEMENTARIOS",
          "Helvetica-Bold", 9, NAVY)
    y_txt -= 7*mm

    mini = [
        ("Venta Bruta",         c_fmt(VB)),
        ("Devoluciones",        f"{c_fmt(DEV)} ({p_fmt(DEV_PCT)})"),
        ("Averías",             f"{c_fmt(AV)} ({p_fmt(AV_PCT)})"),
        ("Sin negocio ident.",  f"{c_fmt(SIN_NEG)} ({p_fmt(SIN_NEG_PCT)})"),
    ]
    mh  = 30.0
    mw  = (CW - 3*3*mm) / 4
    mg  = 3*mm
    for i, (lbl, val) in enumerate(mini):
        bx = ML + i*(mw + mg)
        bg = HexColor('#FEF1DC') if i == 3 else LGRAY
        vc = ORANGE if i == 3 else DARK
        frect(c, bx, y_txt - mh + 6, mw, mh, bg, radius=3)
        # Valor (arriba dentro de la caja)
        ftext(c, bx + mw/2, y_txt - 3,
              val, "Helvetica-Bold", 8.5, vc, 'center')
        # Etiqueta (abajo dentro de la caja, separada del valor)
        ftext(c, bx + mw/2, y_txt - mh + 9,
              lbl, "Helvetica", 6.5, MGRAY, 'center')

    y_txt -= mh + 9*mm

    # Nota proyección
    frect(c, ML, y_txt - 5, CW, 18, HexColor('#EEF8FE'), radius=3,
          stroke_color=CYAN, lw=0.5)
    ftext(c, ML + 6, y_txt + 2,
          "Proyección de cierre: No aplica — mes cerrado al 29/06/2026.  "
          f"Venta neta final: {c_fmt(VN)}  (días hábiles restantes = 0).",
          "Helvetica", 8.5, HexColor('#1565A8'))


# ═══════════════════════════════════════════════════════════════════════════════
#  PÁGINA 3 — CALIDAD DE VENTA
# ═══════════════════════════════════════════════════════════════════════════════
def page_calidad(c, meta_type):
    draw_header(c, meta_type)
    draw_footer(c, 3)

    y = H - 18*mm
    y = section_title(c, y, "Calidad de Venta")

    # Barra apilada horizontal
    y -= 6*mm
    ftext(c, ML, y, "Composición de la Venta Bruta",
          "Helvetica-Bold", 9, MGRAY)
    y -= 7*mm

    bar_h = 22*mm
    bar_y = y - bar_h
    vn_w  = CW * (VN  / VB)
    dev_w = CW * (DEV / VB)
    av_w  = CW * (AV  / VB)

    frect(c, ML,             bar_y, vn_w,  bar_h, GREEN)
    frect(c, ML + vn_w,      bar_y, dev_w, bar_h, RED)
    frect(c, ML + vn_w + dev_w, bar_y, av_w, bar_h, ORANGE)

    # Etiqueta Venta Neta (dentro de la barra verde, zona izquierda)
    mid_vn = ML + vn_w / 2
    ftext(c, mid_vn, bar_y + 14,
          f"Venta Neta  {c_fmt(VN)}",
          "Helvetica-Bold", 9.5, white, 'center')
    ftext(c, mid_vn, bar_y + 4,
          p_fmt(100 - DEV_PCT - AV_PCT),
          "Helvetica", 8, white, 'center')

    # Etiqueta Devoluciones
    mid_dev = ML + vn_w + dev_w / 2
    if dev_w > 42:
        ftext(c, mid_dev, bar_y + 13, "Dev.",
              "Helvetica-Bold", 8, white, 'center')
        ftext(c, mid_dev, bar_y + 3, p_fmt(DEV_PCT),
              "Helvetica", 7.5, white, 'center')

    # Etiqueta Averías
    mid_av = ML + vn_w + dev_w + av_w / 2
    if av_w > 28:
        ftext(c, mid_av, bar_y + 13, "Av.",
              "Helvetica-Bold", 7.5, white, 'center')
        ftext(c, mid_av, bar_y + 3, p_fmt(AV_PCT),
              "Helvetica", 7, white, 'center')

    # Leyenda debajo de la barra (3 items separados claramente)
    y = bar_y - 7*mm
    leyenda = [
        (GREEN,  f"Venta Neta: {c_fmt(VN)} ({p_fmt(100-DEV_PCT-AV_PCT)})"),
        (RED,    f"Devoluciones: {c_fmt(DEV)} ({p_fmt(DEV_PCT)})"),
        (ORANGE, f"Averías: {c_fmt(AV)} ({p_fmt(AV_PCT)})"),
    ]
    lx = ML
    col_w3 = CW / 3
    for col_v, txt in leyenda:
        frect(c, lx + 1, y - 3, 9, 9, col_v)
        ftext(c, lx + 14, y, txt, "Helvetica", 7.5, DARK)
        lx += col_w3

    y -= 11*mm
    fline(c, ML, y, W - MR, y, BGRAY, 0.5)
    y -= 8*mm

    # Tabla de métricas de calidad
    ftext(c, ML, y, "MÉTRICAS DE CALIDAD", "Helvetica-Bold", 9, NAVY)
    y -= 7*mm

    # Encabezado de tabla
    x_lbl = ML
    x_pct = W - MR - 90
    x_mnt = W - MR
    rh = 15*mm

    frect(c, ML, y - rh + 2, CW, rh, HexColor('#E5EDF5'))
    ftext(c, x_lbl + 4, y - 7, "Indicador",        "Helvetica-Bold", 8, NAVY)
    ftext(c, x_pct,     y - 7, "Porcentaje / Cant.","Helvetica-Bold", 8, NAVY, 'right')
    ftext(c, x_mnt,     y - 7, "Monto",             "Helvetica-Bold", 8, NAVY, 'right')
    y -= rh

    filas = [
        ("Devoluciones / Venta Bruta",
         p_fmt(DEV_PCT), c_fmt(DEV),
         "Indicador de calidad de servicio y producto"),
        ("Averías / Venta Bruta",
         p_fmt(AV_PCT),  c_fmt(AV),
         "Pérdida por manejo, temperatura o vencimiento"),
        ("Venta Neta / Venta Bruta",
         p_fmt(100-DEV_PCT-AV_PCT), c_fmt(VN),
         "Eficiencia neta del período"),
        ("Cobertura de clientes",
         p_fmt(COB_PCT), f"{COB_IMP:,} / {COB_MAE:,}",
         "Clientes con compra neta > 0 en el período"),
        ("Clientes sin impactar",
         f"{COB_MAE - COB_IMP:,}", "—",
         "Oportunidad de cobertura no aprovechada"),
    ]
    for i, (lbl, pct, monto, nota) in enumerate(filas):
        bg = white if i % 2 == 0 else HexColor('#F7FAFD')
        frect(c, ML, y - rh + 2, CW, rh, bg)
        # Texto principal (label) y nota — separados verticalmente
        ftext(c, x_lbl + 4, y - 6,  lbl,  "Helvetica-Bold", 8.5, DARK)
        ftext(c, x_lbl + 4, y - 13, nota, "Helvetica",      7,   MGRAY)
        ftext(c, x_pct,     y - 9,  pct,  "Helvetica-Bold", 9.5, DARK,  'right')
        ftext(c, x_mnt,     y - 9,  monto,"Helvetica",      9,   MGRAY, 'right')
        y -= rh

    y -= 8*mm

    # Alerta sin negocio
    frect(c, ML, y - 8, CW, 20, HexColor('#FFF3E0'), radius=3,
          stroke_color=ORANGE, lw=0.8)
    ftext(c, ML + 6, y + 3,
          f"Alerta de datos:  {c_fmt(SIN_NEG)} ({p_fmt(SIN_NEG_PCT)} de venta neta) "
          "sin negocio identificado en BASE_ACUMULADA — requiere auditoría.",
          "Helvetica-Bold", 8.5, HexColor('#8B4000'))


# ═══════════════════════════════════════════════════════════════════════════════
#  PÁGINA 4 — DESEMPEÑO POR NEGOCIO
#
#  Tabla con 6 columnas de ancho claramente separado:
#  Negocio | Venta Neta | Meta | Cumpl% | Cob. Imp. | Cob.%
#  Anchos:   115          82     80       72           72       61   = 482 pt
#
#  Cada texto se posiciona en el centro de su columna o alineado a su borde
#  derecho; ningún texto comparte coordenada X con otro de distinta columna.
# ═══════════════════════════════════════════════════════════════════════════════
def page_negocios(c, meta_type):
    draw_header(c, meta_type)
    draw_footer(c, 4)

    y = H - 18*mm
    y = section_title(c, y, "Desempeño por Negocio")

    mlbl = "Meta PALMA" if meta_type == 'palma' else "Meta ECOM"
    mval = META_PALMA if meta_type == 'palma' else META_ECOM

    ftext(c, ML, y - 2,
          f"Venta neta vs {mlbl} ({c_fmt(mval)}) · "
          f"Cobertura empresa: {p_fmt(COB_PCT)} ({COB_IMP:,}/{COB_MAE:,})",
          "Helvetica", 8, MGRAY)
    y -= 8*mm

    # ── Definición de columnas ────────────────────────────────────────────────
    # COL[k] = borde izquierdo de la columna k
    # COL[k+1] = borde derecho de la columna k  →  texto right: COL[k+1]-4
    #
    # Col 0: Negocio     (115 pt)
    # Col 1: Venta Neta  ( 82 pt)
    # Col 2: Meta        ( 80 pt)
    # Col 3: Cumpl%      ( 72 pt)  ← fondo de color por rendimiento
    # Col 4: Cob. Imp.   ( 72 pt)
    # Col 5: Cob.%       ( 61 pt)
    # ─────────────────────────────────────────────────────────────────────────
    COL = [ML, ML+115, ML+197, ML+277, ML+349, ML+421, ML+482]

    def col_r(k):   # borde derecho de columna k con padding
        return COL[k+1] - 4

    def col_l(k):   # borde izquierdo de columna k con padding
        return COL[k] + 4

    rh    = 16.0   # altura de fila de datos
    hdr_h = 20.0   # altura de encabezado

    # ── Encabezado ────────────────────────────────────────────────────────────
    frect(c, ML, y - hdr_h, CW, hdr_h, NAVY)
    hdrs = [
        (0, "Negocio",     'left'),
        (1, "Venta Neta",  'right'),
        (2, mlbl,          'right'),
        (3, "Cumpl%",      'right'),
        (4, "Cob. Imp.",   'right'),
        (5, "Cob.%",       'right'),
    ]
    for k, lbl, align in hdrs:
        x = col_l(k) if align == 'left' else col_r(k)
        ftext(c, x, y - 14, lbl, "Helvetica-Bold", 7.5, white, align)
    y -= hdr_h

    # ── Filas de negocios ─────────────────────────────────────────────────────
    for i, neg in enumerate(NEGOCIOS):
        nombre, venta, meta_e, meta_p, cumpl_e, cumpl_p, cob_imp, cob_pct = neg
        meta  = meta_p  if meta_type == 'palma' else meta_e
        cumpl = cumpl_p if meta_type == 'palma' else cumpl_e

        # Fondo alternado
        bg = white if i % 2 == 0 else HexColor('#F5F8FC')
        frect(c, ML, y - rh, CW, rh, bg)

        # Fondo de color en celda Cumpl% (col 3) ÚNICAMENTE
        cell_x = COL[3] + 1
        cell_w = COL[4] - COL[3] - 2
        frect(c, cell_x, y - rh + 2, cell_w, rh - 3, cumpl_bg(cumpl), radius=2)

        # Col 0 — Negocio (left)
        ftext(c, col_l(0), y - 11, nombre, "Helvetica", 8.5, DARK)

        # Col 1 — Venta Neta (right)
        ftext(c, col_r(1), y - 11, c_fmt(venta),
              "Helvetica-Bold", 8.5, DARK, 'right')

        # Col 2 — Meta (right)
        ftext(c, col_r(2), y - 11, c_fmt(meta),
              "Helvetica", 8, DARK, 'right')

        # Col 3 — Cumpl% (right, dentro de la celda de color)
        ftext(c, col_r(3), y - 11, p_fmt(cumpl),
              "Helvetica-Bold", 8.5, cumpl_color(cumpl), 'right')

        # Col 4 — Cob. Imp. (right)
        ftext(c, col_r(4), y - 11, f"{cob_imp:,}",
              "Helvetica", 8, DARK, 'right')

        # Col 5 — Cob.% (right)
        ftext(c, col_r(5), y - 11, p_fmt(cob_pct),
              "Helvetica", 8, DARK, 'right')

        y -= rh

    # ── Fila "Sin negocio" ────────────────────────────────────────────────────
    frect(c, ML, y - rh, CW, rh, HexColor('#FFF8F0'))
    ftext(c, col_l(0), y - 11, "Sin negocio identificado",
          "Helvetica-Oblique", 8, ORANGE)
    ftext(c, col_r(1), y - 11, c_fmt(SIN_NEG),
          "Helvetica", 8, ORANGE, 'right')
    ftext(c, col_r(2), y - 11, "—", "Helvetica", 8, MGRAY, 'right')
    ftext(c, col_r(3), y - 11, "—", "Helvetica", 8, MGRAY, 'right')
    ftext(c, col_r(4), y - 11, "—", "Helvetica", 8, MGRAY, 'right')
    ftext(c, col_r(5), y - 11, "—", "Helvetica", 8, MGRAY, 'right')
    y -= rh

    # ── Fila TOTAL ────────────────────────────────────────────────────────────
    frect(c, ML, y - rh, CW, rh, HexColor('#DDE8F2'))
    cumpl_tot = VN / mval * 100
    ftext(c, col_l(0), y - 11, "TOTAL PALUMAR",
          "Helvetica-Bold", 9, NAVY)
    ftext(c, col_r(1), y - 11, c_fmt(VN),
          "Helvetica-Bold", 9, NAVY, 'right')
    ftext(c, col_r(2), y - 11, c_fmt(mval),
          "Helvetica-Bold", 9, NAVY, 'right')
    ftext(c, col_r(3), y - 11, p_fmt(cumpl_tot),
          "Helvetica-Bold", 9, cumpl_color(cumpl_tot), 'right')
    ftext(c, col_r(4), y - 11, f"{COB_IMP:,}",
          "Helvetica-Bold", 9, NAVY, 'right')
    ftext(c, col_r(5), y - 11, p_fmt(COB_PCT),
          "Helvetica-Bold", 9, NAVY, 'right')
    y -= rh

    # Nota al pie
    y -= 4*mm
    ftext(c, ML, y,
          "* Cobertura: clientes con cant. neta > 0 / universo empresa (2,608). "
          "Sin negocio: ventas sin código de negocio en BASE_ACUMULADA.",
          "Helvetica-Oblique", 7, MGRAY)


# ═══════════════════════════════════════════════════════════════════════════════
#  PÁGINA 5 — HALLAZGOS CLAVE
# ═══════════════════════════════════════════════════════════════════════════════
def page_hallazgos(c, meta_type):
    draw_header(c, meta_type)
    draw_footer(c, 5)

    y = H - 18*mm
    y = section_title(c, y, "Hallazgos Clave")

    mlbl  = "PALMA" if meta_type == 'palma' else "ECOM"
    cumpl = CUMPL_PALMA if meta_type == 'palma' else CUMPL_ECOM
    falta = FALTA_PALMA if meta_type == 'palma' else FALTA_ECOM
    y -= 4*mm

    def seccion(titulo, color, items):
        nonlocal y
        # Encabezado de sección
        frect(c, ML, y - 15, CW, 17, color)
        ftext(c, ML + 5, y - 11, titulo,
              "Helvetica-Bold", 8.5, white)
        y -= 16

        for txt in items:
            # Bullet "•"
            ftext(c, ML + 6, y - 4, "•",
                  "Helvetica-Bold", 10, color)
            # Texto con word-wrap, sangría desde x=ML+18
            y2 = wrap_text(c, ML + 18, y - 4, txt,
                           "Helvetica", 8.5, DARK, CW - 20, 12)
            # El siguiente bullet empieza donde terminó el texto + 2pt de margen
            y = y2 - 2
        y -= 4   # espacio entre secciones

    seccion(
        "LOGROS DESTACADOS", GREEN,
        [
            f"Bebidas TMLUC: {p_fmt(103.42 if meta_type=='ecom' else 84.97)} "
            f"de meta {mlbl} — superó el objetivo "
            f"({c_fmt(35418)} vs {c_fmt(34247 if meta_type=='ecom' else 41692)})",

            f"Snacks TMLUC: {p_fmt(121.0 if meta_type=='ecom' else 70.02)} "
            f"de meta {mlbl} "
            f"({c_fmt(2465)} vs {c_fmt(2037 if meta_type=='ecom' else 3520)})",

            f"Otros TMLUC: {p_fmt(142.88 if meta_type=='ecom' else 117.12)} "
            f"de meta {mlbl} — mejor cumplimiento relativo de la cartera "
            f"({c_fmt(71)} vs {c_fmt(50 if meta_type=='ecom' else 61)})",

            f"Chocolates: mayor volumen de venta ({c_fmt(154328)}) — "
            f"{p_fmt(90.47 if meta_type=='ecom' else 74.32)} de cumplimiento {mlbl}",
        ]
    )

    if meta_type == 'ecom':
        alertas = [
            f"Café: {p_fmt(95.25)} de meta ECOM — a solo {c_fmt(1498)} "
            "del objetivo mensual",
            f"Nutrición Experta: {p_fmt(86.84)} de meta ECOM — "
            f"déficit de {c_fmt(132)}",
        ]
        criticos = [
            f"Cárnico: {p_fmt(68.42)} de meta ECOM ({c_fmt(94278)} de "
            f"{c_fmt(137796)}) — mayor déficit absoluto: {c_fmt(43518)}",
            f"Galletas: {p_fmt(70.81)} de meta ECOM ({c_fmt(60669)} de "
            f"{c_fmt(85681)}) — déficit de {c_fmt(25012)}",
        ]
    else:
        alertas = [
            f"Bebidas TMLUC: {p_fmt(84.97)} de meta PALMA — muy cerca "
            "del objetivo",
            f"Café: {p_fmt(78.24)} de meta PALMA — déficit {c_fmt(8359)}",
        ]
        criticos = [
            f"Cárnico: {p_fmt(56.20)} de meta PALMA ({c_fmt(94278)} de "
            f"{c_fmt(167751)}) — mayor déficit absoluto: {c_fmt(73473)}",
            f"Galletas: {p_fmt(58.16)} de meta PALMA ({c_fmt(60669)} de "
            f"{c_fmt(104307)}) — déficit de {c_fmt(43638)}",
            f"Chocolates: {p_fmt(74.32)} de meta PALMA — "
            f"déficit de {c_fmt(53345)}",
        ]

    seccion("ALERTAS — EN RANGO (70–99%)", ORANGE, alertas)
    seccion("CRÍTICOS — POR DEBAJO DE META", RED, criticos)
    seccion(
        "CALIDAD DE DATOS / OPERACIÓN", HexColor('#6B7280'),
        [
            f"{c_fmt(SIN_NEG)} ({p_fmt(SIN_NEG_PCT)} de venta neta) sin negocio "
            "identificado en BASE_ACUMULADA — impacta la distribución por categoría",
            f"Devoluciones en {p_fmt(DEV_PCT)} ({c_fmt(DEV)}) — "
            "nivel a monitorear si supera el 10% de forma sistemática",
            f"819 clientes ({p_fmt((COB_MAE-COB_IMP)/COB_MAE*100)}) sin impactar "
            "en el mes — oportunidad de cobertura no aprovechada",
        ]
    )

    # Resumen de cumplimiento
    y -= 2*mm
    frect(c, ML, y - 22, CW, 24, HexColor('#EEF3F8'), radius=4)
    ftext(c, ML + 6, y - 9,
          f"Cumplimiento global vs Meta {mlbl}:  {p_fmt(cumpl)}   "
          f"(Venta Neta {c_fmt(VN)}  /  Meta "
          f"{c_fmt(META_PALMA if meta_type=='palma' else META_ECOM)})",
          "Helvetica-Bold", 9, NAVY)
    ftext(c, ML + 6, y - 18,
          f"Faltante:  {c_fmt(falta)}   •   Corte: {FECHA_CORTE}   "
          "•   Proyección: No aplica (mes cerrado)",
          "Helvetica", 8, MGRAY)


# ═══════════════════════════════════════════════════════════════════════════════
#  PÁGINA 6 — RECOMENDACIONES
# ═══════════════════════════════════════════════════════════════════════════════
def page_recomendaciones(c, meta_type):
    draw_header(c, meta_type)
    draw_footer(c, 6)

    y = H - 18*mm
    y = section_title(c, y, "Recomendaciones")

    mlbl  = "PALMA" if meta_type == 'palma' else "ECOM"
    cumpl = CUMPL_PALMA if meta_type == 'palma' else CUMPL_ECOM
    y -= 5*mm

    secciones = [
        (NAVY, "PRIORIDAD ALTA — Julio 2026", [
            f"Plan de recuperación Cárnico: negocio con mayor déficit absoluto "
            f"({p_fmt(68.42 if meta_type=='ecom' else 56.20)} vs meta {mlbl}). "
            "Revisar portafolio, precios y cobertura de ruta.",
            f"Plan de recuperación Galletas: "
            f"{p_fmt(70.81 if meta_type=='ecom' else 58.16)} vs meta {mlbl}. "
            "Identificar segmentos con mayor potencial.",
            f"Aumentar cobertura: de {COB_IMP:,} a 1,900+ clientes en julio "
            "(+111 clientes). Revisar clientes sin visita en el mes.",
        ]),
        (BLUE, "ACCIONES COMERCIALES", [
            "Mantener momentum en Bebidas TMLUC, Snacks y Otros TMLUC — "
            "superaron metas; asegurar abastecimiento.",
            f"Chocolates: con empuje adicional puede llegar a meta en julio — "
            f"es el negocio de mayor volumen ({c_fmt(154328)}).",
            f"Café: a solo {c_fmt(1498 if meta_type=='ecom' else 8359)} "
            f"de la meta {mlbl} — plan de push en última semana.",
        ]),
        (ORANGE, "CALIDAD Y DATOS", [
            f"Auditar {c_fmt(SIN_NEG)} en venta sin negocio identificado. "
            "Cruzar en BASE_ACUMULADA por SKU y asignar negocio correcto.",
            f"Devoluciones en {p_fmt(DEV_PCT)}: revisar si hay clientes con "
            "devolución recurrente o problemas de manejo.",
            "Actualizar CONFIG con DIAS_HABILES_MES y DIAS_HABILES_RESTANTES "
            "al inicio de cada mes.",
        ]),
        (HexColor('#6B7280'), "ANÁLISIS DE METAS", [
            f"Meta PALMA ({c_fmt(META_PALMA)}) equivale a 1.22× Meta ECOM "
            f"({c_fmt(META_ECOM)}). Evaluar si la brecha es sostenible.",
            "Comparar junio 2026 vs junio 2025 para detectar estacionalidad "
            "que explique el resultado.",
            "Definir KPIs de seguimiento semanal para julio — no esperar al "
            "cierre para detectar rezagos.",
        ]),
    ]

    for col_v, titulo, items in secciones:
        # Encabezado de sección
        frect(c, ML, y - 15, CW, 17, col_v)
        ftext(c, ML + 5, y - 11, titulo, "Helvetica-Bold", 8.5, white)
        y -= 17

        for k, txt in enumerate(items, 1):
            # Círculo numerado (número de acción)
            num_x, num_y = ML + 2, y - 12
            frect(c, num_x, num_y, 14, 14, col_v, radius=2)
            ftext(c, num_x + 7, num_y + 3, str(k),
                  "Helvetica-Bold", 7.5, white, 'center')
            # Texto con word-wrap a la derecha del número
            y2 = wrap_text(c, ML + 20, y - 4, txt,
                           "Helvetica", 8.5, DARK, CW - 22, 12)
            y = y2 - 2
        y -= 4

    # Nota de cierre
    y -= 4*mm
    fline(c, ML, y, W - MR, y, BGRAY, 0.5)
    y -= 5*mm
    closing = (
        f"Reporte de cierre — junio 2026 · Venta neta {c_fmt(VN)} "
        f"· {p_fmt(cumpl)} de meta {mlbl} "
        f"· Cobertura {p_fmt(COB_PCT)} "
        f"· Datos: BASE_ACUMULADA corte {FECHA_CORTE}."
    )
    wrap_text(c, ML, y, closing, "Helvetica-Oblique", 7.5, MGRAY, CW, 11)


# ═══════════════════════════════════════════════════════════════════════════════
#  GENERADOR
# ═══════════════════════════════════════════════════════════════════════════════
def generate_pdf(meta_type, out_path):
    cv = rl.Canvas(str(out_path), pagesize=A4)
    page_cover(cv, meta_type);          cv.showPage()
    page_resumen(cv, meta_type);        cv.showPage()
    page_calidad(cv, meta_type);        cv.showPage()
    page_negocios(cv, meta_type);       cv.showPage()
    page_hallazgos(cv, meta_type);      cv.showPage()
    page_recomendaciones(cv, meta_type);cv.showPage()
    cv.save()
    print(f"  [OK] {out_path.name}")


def generate_data_files(out_dir):
    data = {
        "periodo": "Junio 2026",
        "fecha_corte": "2026-06-29",
        "generado": FECHA_HOY,
        "ventas": {
            "venta_bruta": VB, "devolucion_total": DEV,
            "devolucion_pct": DEV_PCT, "averia_total": AV,
            "averia_pct": AV_PCT, "venta_neta": VN,
        },
        "cobertura": {
            "clientes_impactados": COB_IMP, "clientes_maestro": COB_MAE,
            "cobertura_pct": COB_PCT, "clientes_sin_impactar": COB_MAE - COB_IMP,
        },
        "metas": {
            "meta_palma": META_PALMA, "cumpl_palma": CUMPL_PALMA,
            "falta_palma": FALTA_PALMA, "meta_ecom": META_ECOM,
            "cumpl_ecom": CUMPL_ECOM, "falta_ecom": FALTA_ECOM,
        },
        "proyeccion": {
            "aplica": False,
            "nota": "Mes cerrado. Días hábiles restantes = 0. Corte 2026-06-29.",
        },
        "venta_sin_negocio": SIN_NEG,
        "venta_sin_negocio_pct": SIN_NEG_PCT,
        "negocios": [
            {
                "nombre": n[0], "venta_neta": n[1],
                "pct_venta_total": round(n[1]/VN*100, 2),
                "meta_ecom": n[2], "meta_palma": n[3],
                "cumpl_ecom": n[4], "cumpl_palma": n[5],
                "cobertura_impactados": n[6], "cobertura_pct": n[7],
            }
            for n in NEGOCIOS
        ],
    }

    json_path = out_dir / "datos_cierre_mes_palumar.json"
    json_path.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    print(f"  [OK] {json_path.name}")

    csv_path = out_dir / "datos_cierre_mes_palumar.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["negocio","venta_neta","pct_total","meta_ecom","meta_palma",
                    "cumpl_ecom_pct","cumpl_palma_pct","cob_impactados","cob_pct"])
        for n in NEGOCIOS:
            w.writerow([n[0], n[1], round(n[1]/VN*100,2),
                        n[2], n[3], n[4], n[5], n[6], n[7]])
        w.writerow(["Sin negocio identificado", SIN_NEG, SIN_NEG_PCT,
                    "","","","","",""])
        w.writerow(["TOTAL PALUMAR", VN, 100.0, META_ECOM, META_PALMA,
                    CUMPL_ECOM, CUMPL_PALMA, COB_IMP, COB_PCT])
    print(f"  [OK] {csv_path.name}")


# ─── Main ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    out_dir = Path(__file__).parent / "cierre_mes_palumar"
    out_dir.mkdir(exist_ok=True)

    print("Generando Cierre de Mes PALUMAR — Junio 2026  (v2)...")
    generate_pdf('palma', out_dir / "CIERRE_MES_PALUMAR_META_INFLADA.pdf")
    generate_pdf('ecom',  out_dir / "CIERRE_MES_PALUMAR_META_ECOM_REAL.pdf")
    generate_data_files(out_dir)

    print(f"\nArchivos en: {out_dir}/")
    for f in sorted(out_dir.iterdir()):
        print(f"  {f.name:55s} {f.stat().st_size/1024:6.1f} KB")
