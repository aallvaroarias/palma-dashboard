#!/usr/bin/env python3
"""
Generador PDF: Cierre de Mes PALUMAR — Junio 2026
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
from datetime import date

from reportlab.pdfgen import canvas as rl
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white

# ─── Página ──────────────────────────────────────────────────────────────────
W, H   = A4          # 595.27 x 841.89 pt
ML     = 20 * mm
MR     = 20 * mm
CW     = W - ML - MR  # ≈ 482 pt

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
WHITE  = white

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
    ("Chocolates",        154328.35, 170589, 207673, 90.47, 74.32, 1352, 51.8),
    ("Cárnico",            94278.22, 137796, 167751, 68.42, 56.20, 1479, 56.7),
    ("Galletas",           60668.67,  85681, 104307, 70.81, 58.16, 1116, 42.8),
    ("Bebidas TMLUC",      35417.77,  34247,  41692,103.42, 84.97,  834, 32.0),
    ("Café",               30064.11,  31562,  38423, 95.25, 78.24,  714, 27.4),
    ("Snacks TMLUC",        2464.67,   2037,   3520,121.00, 70.02,   54,  2.1),
    ("Nutrición Experta",    868.39,   1000,   1120, 86.84, 77.54,   31,  1.2),
    ("Otros TMLUC",           71.44,     50,     61,142.88,117.12,    6,  0.2),
]

# ─── Helpers ─────────────────────────────────────────────────────────────────
def c_fmt(n):
    return f"${n:,.0f}"

def p_fmt(n):
    return f"{n:.1f}%"

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

def wrap_text(c, x, y, text, font, size, color, max_w, line_h=13):
    """Draw word-wrapped text, return final y position."""
    c.setFont(font, size)
    words = text.split()
    line_buf = []
    for word in words:
        test = ' '.join(line_buf + [word])
        if c.stringWidth(test, font, size) > max_w:
            ftext(c, x, y, ' '.join(line_buf), font, size, color)
            y -= line_h
            line_buf = [word]
        else:
            line_buf.append(word)
    if line_buf:
        ftext(c, x, y, ' '.join(line_buf), font, size, color)
        y -= line_h
    return y

# ─── Componentes de página ────────────────────────────────────────────────────
def draw_header(c, meta_type):
    badge = "META PALMA INFLADA" if meta_type == 'palma' else "META ECOM REAL"
    frect(c, 0, H - 11*mm, W, 11*mm, NAVY)
    ftext(c, ML, H - 7.2*mm, "DISTRIBUCIONES PALUMAR S.A.",
          "Helvetica-Bold", 7.5, WHITE)
    ftext(c, W - MR, H - 7.2*mm,
          f"CIERRE JUNIO 2026  ·  {badge}", "Helvetica", 7, WHITE, 'right')

def draw_footer(c, page_num, total=6):
    fline(c, ML, 13*mm, W - MR, 13*mm, BGRAY, 0.5)
    ftext(c, ML, 8.5*mm,
          "Confidencial · Distribuciones PALUMAR S.A. · Junio 2026",
          "Helvetica", 7, MGRAY)
    ftext(c, W - MR, 8.5*mm, f"Pág. {page_num} de {total}",
          "Helvetica", 7, MGRAY, 'right')

def draw_section_title(c, y, title):
    ftext(c, ML, y, title.upper(), "Helvetica-Bold", 12, NAVY)
    fline(c, ML, y - 3, ML + 72*mm, y - 3, CYAN, 2)
    return y - 9*mm

# ─── Página 1: Portada ────────────────────────────────────────────────────────
def page_cover(c, meta_type):
    # Fondo completo
    frect(c, 0, 0, W, H, NAVY)

    # Barra cyan superior
    frect(c, 0, H - 14*mm, W, 14*mm, CYAN)
    ftext(c, ML, H - 9.5*mm,
          "DISTRIBUCIONES PALUMAR S.A.", "Helvetica-Bold", 10.5, NAVY)
    ftext(c, W - MR, H - 9.5*mm, "Panamá · 2026",
          "Helvetica", 8, NAVY, 'right')

    # Título principal
    y = H - 72*mm
    ftext(c, W/2, y,
          "C I E R R E   D E   M E S", "Helvetica", 19, WHITE, 'center')
    y -= 17*mm
    ftext(c, W/2, y, "JUNIO  2026",
          "Helvetica-Bold", 46, GOLD, 'center')
    y -= 11*mm
    ftext(c, W/2, y,
          "PALUMAR  ·  Consolidado General", "Helvetica", 11, HexColor('#8AB4D0'), 'center')
    y -= 6*mm
    ftext(c, W/2, y, f"Corte: {FECHA_CORTE}",
          "Helvetica", 9, HexColor('#5C8BAA'), 'center')

    # Línea dorada separadora
    y -= 11*mm
    frect(c, W/2 - 62*mm, y, 124*mm, 1.5, GOLD)

    # Badge de tipo de meta
    y -= 13*mm
    bw = 142*mm
    bh = 11*mm
    bx = (W - bw) / 2
    frect(c, bx, y - 2*mm, bw, bh, HexColor('#0E4D8A'))
    if meta_type == 'palma':
        badge_txt = "ANÁLISIS VS  META PALMA INFLADA   ·   $564,546"
    else:
        badge_txt = "ANÁLISIS VS  META ECOM REAL   ·   $462,962"
    ftext(c, W/2, y + 5, badge_txt, "Helvetica-Bold", 10, GOLD, 'center')

    # KPIs de vista previa (3 cajas principales)
    y -= 30*mm
    cumpl = CUMPL_PALMA if meta_type == 'palma' else CUMPL_ECOM
    kpis = [
        ("VENTA NETA",    c_fmt(VN),         WHITE,                    ""),
        ("CUMPLIMIENTO",  p_fmt(cumpl),
         GOLD if cumpl < 85 else GREEN,       f"vs Meta {'PALMA' if meta_type=='palma' else 'ECOM'}"),
        ("COBERTURA",     p_fmt(COB_PCT),     HexColor('#5DC8E8'),
         f"{COB_IMP:,} / {COB_MAE:,} clientes"),
    ]
    bkw = 50*mm
    bkg = 4*mm
    bk0 = (W - (3*bkw + 2*bkg)) / 2
    for i, (lbl, val, col, sub) in enumerate(kpis):
        bx = bk0 + i*(bkw + bkg)
        frect(c, bx, y - 2*mm, bkw, 22*mm, HexColor('#0E3F72'), radius=3)
        ftext(c, bx + bkw/2, y + 12, val, "Helvetica-Bold", 15, col, 'center')
        ftext(c, bx + bkw/2, y + 2,  lbl, "Helvetica", 6.5,
              HexColor('#7AACCF'), 'center')
        if sub:
            ftext(c, bx + bkw/2, y - 4, sub, "Helvetica", 6,
                  HexColor('#4A7A9A'), 'center')

    # Segunda fila — métricas secundarias
    y -= 37*mm
    sk = [
        ("VENTA BRUTA",   c_fmt(VB)),
        ("DEVOLUCIONES",  f"{p_fmt(DEV_PCT)} · {c_fmt(DEV)}"),
        ("AVERÍAS",       f"{p_fmt(AV_PCT)} · {c_fmt(AV)}"),
    ]
    skw = 52*mm
    skg = 4*mm
    sk0 = (W - (3*skw + 2*skg)) / 2
    for i, (lbl, val) in enumerate(sk):
        bx = sk0 + i*(skw + skg)
        frect(c, bx, y, skw, 15*mm, HexColor('#0B3360'), radius=2)
        ftext(c, bx + skw/2, y + 8, val, "Helvetica-Bold", 9.5, WHITE, 'center')
        ftext(c, bx + skw/2, y + 1, lbl, "Helvetica", 6,
              HexColor('#5C8BAA'), 'center')

    # Separador inferior
    y -= 22*mm
    frect(c, ML, y, CW, 0.8, HexColor('#1A4870'))

    # Texto de pie de portada
    y -= 6*mm
    ftext(c, W/2, y,
          f"Generado el {FECHA_HOY}  ·  CONFIDENCIAL — Solo para uso directivo",
          "Helvetica", 7.5, HexColor('#3D6280'), 'center')
    ftext(c, W/2, y - 4.5*mm,
          "Este documento contiene información comercial sensible. No distribuir sin autorización.",
          "Helvetica", 7, HexColor('#2E4E66'), 'center')


# ─── Página 2: Resumen General ────────────────────────────────────────────────
def page_resumen(c, meta_type):
    draw_header(c, meta_type)
    draw_footer(c, 2)

    y = H - 18*mm
    y = draw_section_title(c, y, "Resumen General")

    meta_v  = META_PALMA if meta_type == 'palma' else META_ECOM
    cumpl   = CUMPL_PALMA if meta_type == 'palma' else CUMPL_ECOM
    falta   = FALTA_PALMA if meta_type == 'palma' else FALTA_ECOM
    mlbl    = "Meta PALMA" if meta_type == 'palma' else "Meta ECOM"

    # KPI cards — 2 filas × 3 cols
    gap   = 4*mm
    cw_c  = (CW - 2*gap) / 3
    ch_c  = 52.0
    y_r1  = y - 6*mm - ch_c
    y_r2  = y_r1 - 5*mm - ch_c

    def kpi(x, y, label, val, sub, val_c=DARK, bg=LGRAY, border=None):
        frect(c, x, y, cw_c, ch_c, bg, radius=4,
              stroke_color=border, lw=1.0)
        ftext(c, x + cw_c/2, y + ch_c - 13, label,
              "Helvetica", 7.5, MGRAY, 'center')
        ftext(c, x + cw_c/2, y + ch_c/2 - 1, val,
              "Helvetica-Bold", 15, val_c, 'center')
        ftext(c, x + cw_c/2, y + 7, sub,
              "Helvetica", 7, MGRAY, 'center')

    x1 = ML
    x2 = ML + cw_c + gap
    x3 = ML + 2*(cw_c + gap)

    # Fila 1
    kpi(x1, y_r1, "VENTA BRUTA", c_fmt(VB), "Total facturado")
    kpi(x2, y_r1, "VENTA NETA",  c_fmt(VN), "Neta de dev. y averías",
        NAVY, HexColor('#E0EBF5'), NAVY)
    kpi(x3, y_r1, "COBERTURA",   p_fmt(COB_PCT),
        f"{COB_IMP:,} / {COB_MAE:,} clientes",
        cumpl_color(COB_PCT), cumpl_bg(COB_PCT))

    # Fila 2
    kpi(x1, y_r2, mlbl.upper(), c_fmt(meta_v), "Objetivo del período")
    kpi(x2, y_r2, "CUMPLIMIENTO", p_fmt(cumpl),
        f"vs {mlbl}", cumpl_color(cumpl), cumpl_bg(cumpl), cumpl_color(cumpl))
    kpi(x3, y_r2, "FALTANTE", c_fmt(falta),
        f"para alcanzar {mlbl}", RED, HexColor('#FEEAEA'))

    # Separador
    y_sep = y_r2 - 9*mm
    fline(c, ML, y_sep, W - MR, y_sep, BGRAY, 0.5)

    # Resumen ejecutivo
    y_txt = y_sep - 10*mm
    ftext(c, ML, y_txt, "RESUMEN EJECUTIVO", "Helvetica-Bold", 9, NAVY)
    y_txt -= 6*mm

    if meta_type == 'palma':
        resumen = (
            f"Palumar cerró junio 2026 con una venta neta de {c_fmt(VN)}, equivalente al "
            f"{p_fmt(CUMPL_PALMA)} de cumplimiento frente a la Meta PALMA de {c_fmt(META_PALMA)}. "
            f"El déficit del período asciende a {c_fmt(FALTA_PALMA)}. "
            f"La cobertura de clientes finalizó en {p_fmt(COB_PCT)} "
            f"({COB_IMP:,} de {COB_MAE:,} clientes impactados), "
            f"con 819 clientes sin visita durante el mes."
        )
    else:
        resumen = (
            f"Palumar cerró junio 2026 con una venta neta de {c_fmt(VN)}, equivalente al "
            f"{p_fmt(CUMPL_ECOM)} de cumplimiento frente a la Meta ECOM de {c_fmt(META_ECOM)}. "
            f"El déficit del período asciende a {c_fmt(FALTA_ECOM)}. "
            f"La cobertura de clientes finalizó en {p_fmt(COB_PCT)} "
            f"({COB_IMP:,} de {COB_MAE:,} clientes impactados), "
            f"con 819 clientes sin visita durante el mes."
        )

    y_txt = wrap_text(c, ML, y_txt, resumen, "Helvetica", 9, DARK, CW, 13)

    # Métricas secundarias en 4 boxes pequeños
    y_txt -= 10*mm
    ftext(c, ML, y_txt, "INDICADORES COMPLEMENTARIOS", "Helvetica-Bold", 9, NAVY)
    y_txt -= 6*mm

    mini = [
        ("Venta Bruta",          c_fmt(VB)),
        ("Devoluciones",         f"{c_fmt(DEV)} ({p_fmt(DEV_PCT)})"),
        ("Averías",              f"{c_fmt(AV)} ({p_fmt(AV_PCT)})"),
        ("Sin negocio ident.",   f"{c_fmt(SIN_NEG)} ({p_fmt(SIN_NEG_PCT)})"),
    ]
    mw = (CW - 3*3*mm) / 4
    mg = 3*mm
    mh = 28.0
    for i, (lbl, val) in enumerate(mini):
        bx = ML + i*(mw + mg)
        bg = HexColor('#FEF1DC') if i == 3 else LGRAY
        vc = ORANGE if i == 3 else DARK
        frect(c, bx, y_txt - mh + 4, mw, mh, bg, radius=3)
        ftext(c, bx + mw/2, y_txt - 6, val,
              "Helvetica-Bold", 8.5, vc, 'center')
        ftext(c, bx + mw/2, y_txt - mh + 7, lbl,
              "Helvetica", 6.5, MGRAY, 'center')

    y_txt -= mh + 10*mm

    # Nota proyección
    frect(c, ML, y_txt - 4, CW, 17, HexColor('#EEF8FE'), radius=3,
          stroke_color=CYAN, lw=0.5)
    ftext(c, ML + 5, y_txt + 1,
          "Proyección de cierre: No aplica — mes cerrado al 29/06/2026. "
          f"Venta neta final: {c_fmt(VN)}  (días hábiles restantes = 0).",
          "Helvetica", 8.5, HexColor('#1565A8'))


# ─── Página 3: Calidad de Venta ───────────────────────────────────────────────
def page_calidad(c, meta_type):
    draw_header(c, meta_type)
    draw_footer(c, 3)

    y = H - 18*mm
    y = draw_section_title(c, y, "Calidad de Venta")

    # Composición de venta bruta — barra horizontal apilada
    y -= 6*mm
    ftext(c, ML, y, "Composición de Venta Bruta",
          "Helvetica-Bold", 9, MGRAY)
    y -= 6*mm

    bar_h = 20*mm
    bar_y = y - bar_h
    vn_w  = CW * (VN  / VB)
    dev_w = CW * (DEV / VB)
    av_w  = CW * (AV  / VB)

    frect(c, ML, bar_y, vn_w,  bar_h, GREEN)
    frect(c, ML + vn_w, bar_y, dev_w, bar_h, RED)
    frect(c, ML + vn_w + dev_w, bar_y, av_w, bar_h, ORANGE)

    # Etiquetas dentro de la barra
    ftext(c, ML + vn_w/2, bar_y + 12,
          f"Venta Neta: {c_fmt(VN)}  ({p_fmt(100-DEV_PCT-AV_PCT)})",
          "Helvetica-Bold", 9, WHITE, 'center')
    if dev_w > 30:
        ftext(c, ML + vn_w + dev_w/2, bar_y + 12,
              f"Dev. {p_fmt(DEV_PCT)}",
              "Helvetica-Bold", 7.5, WHITE, 'center')
    if av_w > 20:
        ftext(c, ML + vn_w + dev_w + av_w/2, bar_y + 12,
              f"Av. {p_fmt(AV_PCT)}",
              "Helvetica-Bold", 7, WHITE, 'center')

    # Leyenda debajo de la barra
    y = bar_y - 5*mm
    leyenda = [
        (GREEN,  f"Venta Neta {c_fmt(VN)} ({p_fmt(100-DEV_PCT-AV_PCT)})"),
        (RED,    f"Devoluciones {c_fmt(DEV)} ({p_fmt(DEV_PCT)})"),
        (ORANGE, f"Averías {c_fmt(AV)} ({p_fmt(AV_PCT)})"),
    ]
    lx = ML
    for col, txt in leyenda:
        frect(c, lx, y - 3, 8, 8, col)
        ftext(c, lx + 11, y, txt, "Helvetica", 7.5, DARK)
        lx += CW / 3

    y -= 10*mm

    # Separador
    fline(c, ML, y, W - MR, y, BGRAY, 0.5)
    y -= 8*mm

    # Tabla de métricas de calidad
    ftext(c, ML, y, "MÉTRICAS DE CALIDAD",
          "Helvetica-Bold", 9, NAVY)
    y -= 6*mm

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
         "Clientes con compra >= 1 unidad en el período"),
        ("Clientes sin impactar",
         f"{COB_MAE - COB_IMP:,}", "—",
         "Oportunidad de cobertura no aprovechada"),
    ]

    rh = 15*mm
    col_w = [CW - 160, 55, 70, 35]  # label, pct, monto, (vacío para sep)
    # Ajuste: etiqueta = 302, pct = 55, monto = 70, sep = 35 ... Total = 462? Let me recalc
    # CW ≈ 482. Columns: label=252, pct=60, monto=80, sep=90
    # Actually: 252+60+80 = 392... with ML that's fine.
    # Let me use explicit x positions:
    x_lbl  = ML
    x_pct  = ML + CW - 140
    x_mnt  = ML + CW - 75
    x_end  = ML + CW

    # Header row
    frect(c, ML, y - rh + 2, CW, rh, HexColor('#E5EDF5'))
    ftext(c, x_lbl + 3, y - 6, "Indicador",
          "Helvetica-Bold", 8, NAVY)
    ftext(c, x_pct, y - 6, "% / Cant.",
          "Helvetica-Bold", 8, NAVY, 'right')
    ftext(c, x_end, y - 6, "Monto",
          "Helvetica-Bold", 8, NAVY, 'right')
    y -= rh

    for i, (lbl, pct, monto, nota) in enumerate(filas):
        bg = WHITE if i % 2 == 0 else HexColor('#F7FAFD')
        frect(c, ML, y - rh + 2, CW, rh, bg)
        ftext(c, x_lbl + 3, y - 5, lbl, "Helvetica-Bold", 8.5, DARK)
        ftext(c, x_lbl + 3, y - 12, nota, "Helvetica", 7, MGRAY)
        ftext(c, x_pct, y - 7, pct,   "Helvetica-Bold", 9.5, DARK, 'right')
        ftext(c, x_end, y - 7, monto, "Helvetica", 9, MGRAY, 'right')
        y -= rh

    y -= 8*mm

    # Alerta: Sin negocio identificado
    frect(c, ML, y - 8, CW, 20, HexColor('#FFF3E0'), radius=3,
          stroke_color=ORANGE, lw=0.8)
    ftext(c, ML + 6, y + 3,
          f"Alerta de datos:  {c_fmt(SIN_NEG)} ({p_fmt(SIN_NEG_PCT)} de venta neta) "
          "sin negocio identificado en BASE_ACUMULADA — requiere auditoría.",
          "Helvetica-Bold", 8.5, HexColor('#8B4000'))


# ─── Página 4: Desempeño por Negocio ─────────────────────────────────────────
def page_negocios(c, meta_type):
    draw_header(c, meta_type)
    draw_footer(c, 4)

    y = H - 18*mm
    y = draw_section_title(c, y, "Desempeño por Negocio")

    # Subtítulo con fuente de meta
    mlbl = "Meta PALMA" if meta_type == 'palma' else "Meta ECOM"
    mval = META_PALMA if meta_type == 'palma' else META_ECOM
    ftext(c, ML, y - 2,
          f"Venta neta vs {mlbl} ({c_fmt(mval)}) · Cobertura empresa: {p_fmt(COB_PCT)} ({COB_IMP:,}/{COB_MAE:,})",
          "Helvetica", 8, MGRAY)
    y -= 8*mm

    # Columnas: Negocio | Venta | % Total | Meta | Cumpl% | Cob Imp | Cob%
    # Widths (total = CW ≈ 482)
    col_x = [ML, ML+128, ML+208, ML+288, ML+363, ML+428, ML+482]
    # Spans:   128       80      80       75      65      54
    col_lbl = ["Negocio", "Venta Neta", "% Total", mlbl, "Cumpl%", "Cob. Imp.", "Cob.%"]
    col_align = ['left', 'right', 'right', 'right', 'right', 'right', 'right']

    rh = 15.0
    hdr_h = 19.0

    # Header
    frect(c, ML, y - hdr_h, CW, hdr_h, NAVY)
    for j, (lbl, align) in enumerate(zip(col_lbl, col_align)):
        xj = col_x[j] + (3 if align == 'left' else -3)
        ftext(c, xj, y - 13, lbl, "Helvetica-Bold", 7.5, WHITE, align)
    y -= hdr_h

    # Filas de negocios
    total_venta = 0
    total_meta  = 0
    for i, neg in enumerate(NEGOCIOS):
        nombre, venta, meta_e, meta_p, cumpl_e, cumpl_p, cob_imp, cob_pct = neg
        meta  = meta_p if meta_type == 'palma' else meta_e
        cumpl = cumpl_p if meta_type == 'palma' else cumpl_e
        pct_total = venta / VN * 100

        total_venta += venta
        total_meta  += meta

        bg = WHITE if i % 2 == 0 else HexColor('#F5F8FC')
        frect(c, ML, y - rh, CW, rh, bg)

        # Barra de cumplimiento mini (ancho proporcional a cumpl, max = 100%)
        bar_full = col_x[4] - col_x[3] - 8
        bar_pct  = min(cumpl, 100) / 100 * bar_full
        bar_by   = y - rh + 4
        bar_bh   = 6
        frect(c, col_x[3] + 4, bar_by, bar_full, bar_bh, HexColor('#E5EDF5'))
        frect(c, col_x[3] + 4, bar_by, bar_pct, bar_bh, cumpl_color(cumpl))

        # Texto de cada columna
        ftext(c, col_x[0] + 3, y - 10, nombre, "Helvetica", 8.5, DARK)
        ftext(c, col_x[1] - 3, y - 10, c_fmt(venta),
              "Helvetica-Bold", 8, DARK, 'right')
        ftext(c, col_x[2] - 3, y - 10, p_fmt(pct_total),
              "Helvetica", 7.5, MGRAY, 'right')
        ftext(c, col_x[3] - 3, y - 10, c_fmt(meta),
              "Helvetica", 8, DARK, 'right')
        # Cumpl% con color
        c_bg = cumpl_bg(cumpl)
        c_col = cumpl_color(cumpl)
        frect(c, col_x[4] + 1, y - rh + 2, col_x[5] - col_x[4] - 2, rh - 3, c_bg, radius=2)
        ftext(c, col_x[5] - 3, y - 9, p_fmt(cumpl),
              "Helvetica-Bold", 8.5, c_col, 'right')
        ftext(c, col_x[5] - 3, y - 10, f"{cob_imp:,}",
              "Helvetica", 7.5, DARK, 'right')
        ftext(c, col_x[6] - 3, y - 10, p_fmt(cob_pct),
              "Helvetica", 7.5, DARK, 'right')

        y -= rh

    # Fila: Sin negocio identificado
    frect(c, ML, y - rh, CW, rh, HexColor('#FFF8F0'))
    ftext(c, col_x[0] + 3, y - 10, "Sin negocio identificado",
          "Helvetica-Oblique", 8, ORANGE)
    ftext(c, col_x[1] - 3, y - 10, c_fmt(SIN_NEG),
          "Helvetica", 8, ORANGE, 'right')
    ftext(c, col_x[2] - 3, y - 10, p_fmt(SIN_NEG_PCT),
          "Helvetica", 7.5, ORANGE, 'right')
    ftext(c, col_x[3] - 3, y - 10, "—", "Helvetica", 8, MGRAY, 'right')
    ftext(c, col_x[5] - 3, y - 10, "—", "Helvetica", 7.5, MGRAY, 'right')
    ftext(c, col_x[6] - 3, y - 10, "—", "Helvetica", 7.5, MGRAY, 'right')
    y -= rh

    # Fila TOTAL
    frect(c, ML, y - rh, CW, rh, HexColor('#E5EDF5'))
    cumpl_total = VN / mval * 100
    ftext(c, col_x[0] + 3, y - 10, "TOTAL PALUMAR",
          "Helvetica-Bold", 9, NAVY)
    ftext(c, col_x[1] - 3, y - 10, c_fmt(VN),
          "Helvetica-Bold", 9, NAVY, 'right')
    ftext(c, col_x[2] - 3, y - 10, "100.0%",
          "Helvetica-Bold", 8, NAVY, 'right')
    ftext(c, col_x[3] - 3, y - 10, c_fmt(mval),
          "Helvetica-Bold", 9, NAVY, 'right')
    ftext(c, col_x[5] - 3, y - 10, p_fmt(cumpl_total),
          "Helvetica-Bold", 9, cumpl_color(cumpl_total), 'right')
    ftext(c, col_x[5] - 3, y - 10, f"{COB_IMP:,}",
          "Helvetica-Bold", 8, NAVY, 'right')
    ftext(c, col_x[6] - 3, y - 10, p_fmt(COB_PCT),
          "Helvetica-Bold", 8, NAVY, 'right')
    y -= rh

    # Nota al pie de tabla
    y -= 4*mm
    ftext(c, ML, y,
          "* Cobertura: clientes impactados con cant. neta > 0 / universo empresa (2,608). "
          "Sin negocio: ventas sin código de negocio en BASE_ACUMULADA.",
          "Helvetica-Oblique", 7, MGRAY)


# ─── Página 5: Hallazgos Clave ────────────────────────────────────────────────
def page_hallazgos(c, meta_type):
    draw_header(c, meta_type)
    draw_footer(c, 5)

    y = H - 18*mm
    y = draw_section_title(c, y, "Hallazgos Clave")

    mlbl   = "PALMA" if meta_type == 'palma' else "ECOM"
    cumpl  = CUMPL_PALMA if meta_type == 'palma' else CUMPL_ECOM
    falta  = FALTA_PALMA if meta_type == 'palma' else FALTA_ECOM

    y -= 5*mm

    def hallazgo_section(title, color, items):
        nonlocal y
        # Título de sección con fondo
        frect(c, ML, y - 14, CW, 16, color)
        ftext(c, ML + 5, y - 10, title, "Helvetica-Bold", 8.5, WHITE)
        y -= 15
        # Items
        for txt in items:
            ftext(c, ML + 8, y - 4, f"•  {txt}", "Helvetica", 8.5, DARK)
            y -= 13
        y -= 4

    hallazgo_section(
        "LOGROS DESTACADOS",
        GREEN,
        [
            f"Bebidas TMLUC superó su meta {mlbl}: {p_fmt(103.42 if meta_type=='ecom' else 84.97)} "
            f"({c_fmt(35418)} vs {c_fmt(34247 if meta_type=='ecom' else 41692)})",
            f"Snacks TMLUC superó su meta {mlbl}: {p_fmt(121.0 if meta_type=='ecom' else 70.02)} "
            f"({c_fmt(2465)} vs {c_fmt(2037 if meta_type=='ecom' else 3520)})",
            f"Otros TMLUC superó su meta {mlbl}: {p_fmt(142.88 if meta_type=='ecom' else 117.12)} "
            f"({c_fmt(71)} vs {c_fmt(50 if meta_type=='ecom' else 61)})",
            f"Chocolates: {p_fmt(90.47 if meta_type=='ecom' else 74.32)} de cumplimiento — "
            f"negocio con mayor volumen de venta ({c_fmt(154328)})",
        ]
    )

    if meta_type == 'ecom':
        alertas = [
            f"Café casi en meta ECOM: {p_fmt(95.25)} — {c_fmt(1498)} de diferencia vs objetivo",
            f"Nutrición Experta: {p_fmt(86.84)} de meta ECOM — déficit de {c_fmt(132)}",
        ]
        criticos = [
            f"Cárnico: solo {p_fmt(68.42)} de meta ECOM ({c_fmt(94278)} de {c_fmt(137796)}) "
            f"— mayor déficit absoluto: {c_fmt(43518)}",
            f"Galletas: {p_fmt(70.81)} de meta ECOM ({c_fmt(60669)} de {c_fmt(85681)}) "
            f"— déficit de {c_fmt(25012)}",
        ]
    else:
        alertas = [
            f"Bebidas TMLUC: {p_fmt(84.97)} de meta PALMA — cerca del objetivo",
            f"Café: {p_fmt(78.24)} de meta PALMA — déficit {c_fmt(8359)}",
        ]
        criticos = [
            f"Cárnico: solo {p_fmt(56.20)} de meta PALMA ({c_fmt(94278)} de {c_fmt(167751)}) "
            f"— mayor déficit absoluto: {c_fmt(73473)}",
            f"Galletas: {p_fmt(58.16)} de meta PALMA ({c_fmt(60669)} de {c_fmt(104307)}) "
            f"— déficit de {c_fmt(43638)}",
            f"Chocolates: {p_fmt(74.32)} de meta PALMA — déficit de {c_fmt(53345)}",
        ]

    hallazgo_section("ALERTAS — EN RANGO", ORANGE, alertas)
    hallazgo_section("CRÍTICOS — POR DEBAJO DE META", RED, criticos)
    hallazgo_section(
        "CALIDAD DE DATOS / OPERACIÓN",
        HexColor('#6B7280'),
        [
            f"{c_fmt(SIN_NEG)} ({p_fmt(SIN_NEG_PCT)} de venta neta) sin negocio identificado — "
            "impacta fiabilidad de la distribución por negocio",
            f"Devoluciones en {p_fmt(DEV_PCT)} ({c_fmt(DEV)}) — nivel a monitorear "
            "si supera el 10% de manera sistemática",
            f"819 clientes ({p_fmt((COB_MAE-COB_IMP)/COB_MAE*100)}) sin impactar en el mes — "
            "oportunidad no aprovechada",
        ]
    )

    # Resumen de cumplimiento global
    y -= 2*mm
    frect(c, ML, y - 22, CW, 24, HexColor('#EEF3F8'), radius=4)
    ftext(c, ML + 6, y - 9,
          f"Cumplimiento global vs Meta {mlbl}:  {p_fmt(cumpl)}   "
          f"(Venta Neta {c_fmt(VN)}  /  Meta {c_fmt(META_PALMA if meta_type=='palma' else META_ECOM)})",
          "Helvetica-Bold", 9, NAVY)
    ftext(c, ML + 6, y - 18,
          f"Faltante:  {c_fmt(falta)}   •   Corte: {FECHA_CORTE}   •   Proyección: No aplica (mes cerrado)",
          "Helvetica", 8, MGRAY)


# ─── Página 6: Recomendaciones ────────────────────────────────────────────────
def page_recomendaciones(c, meta_type):
    draw_header(c, meta_type)
    draw_footer(c, 6)

    y = H - 18*mm
    y = draw_section_title(c, y, "Recomendaciones")

    mlbl = "PALMA" if meta_type == 'palma' else "ECOM"
    cumpl = CUMPL_PALMA if meta_type == 'palma' else CUMPL_ECOM

    y -= 6*mm

    recs = [
        (NAVY, "PRIORIDAD ALTA — Julio 2026",
         [
             f"Plan de recuperación Cárnico: definir ruta de acción inmediata. "
             f"Cerró junio en {p_fmt(68.42 if meta_type=='ecom' else 56.20)} vs meta {mlbl}. "
             "Revisar portafolio, precios y cobertura de ruta.",
             f"Plan de recuperación Galletas: {p_fmt(70.81 if meta_type=='ecom' else 58.16)} "
             f"vs meta {mlbl}. Identificar segmentos y canales con mayor potencial.",
             f"Aumentar cobertura: de {COB_IMP:,} a 1,900+ clientes en julio "
             f"(+111 clientes mínimo para llegar al 73%). Revisar clientes sin visita.",
         ]),
        (BLUE, "ACCIONES COMERCIALES",
         [
             "Mantener momentum en Bebidas TMLUC, Snacks y Otros TMLUC — estos negocios "
             "ya superaron sus metas, asegurar abastecimiento.",
             f"Chocolates ({p_fmt(90.47 if meta_type=='ecom' else 74.32)} vs meta): "
             "con mayor empuje puede llegar a meta en julio — es el negocio de mayor volumen.",
             "Café ({:.1f}%): a {:.0f} unidades/cajas de su meta ECOM — "
             "plan de push en última semana de cada período.".format(
                 95.25 if meta_type=='ecom' else 78.24,
                 1498 if meta_type=='ecom' else 8359),
         ]),
        (ORANGE, "CALIDAD Y DATOS",
         [
             f"Auditar {c_fmt(SIN_NEG)} en venta sin negocio identificado. "
             "Cruzar en BASE_ACUMULADA por SKU y asignar negocio correcto.",
             f"Devoluciones en {p_fmt(DEV_PCT)}: revisar si hay clientes con devolución "
             "recurrente o problemas de temperatura/manejo.",
             "Validar que CONFIG tenga DIAS_HABILES_MES y DIAS_HABILES_RESTANTES "
             "actualizados al inicio de cada mes.",
         ]),
        (HexColor('#6B7280'), "ANÁLISIS DE METAS",
         [
             f"Meta PALMA ($564,546) equivale a ~1.22× Meta ECOM ($462,962). "
             "Evaluar si la brecha del 22% es sostenible y alcanzable históricamente.",
             "Comparar desempeño de junio 2026 vs junio 2025 para determinar si "
             "hay estacionalidad que explique el resultado.",
             "Definir KPIs de seguimiento semanal para julio — no esperar al cierre "
             "para detectar rezagos.",
         ]),
    ]

    for col, section_title, items in recs:
        # Encabezado de sección
        frect(c, ML, y - 14, CW, 16, col)
        ftext(c, ML + 5, y - 10, section_title, "Helvetica-Bold", 8.5, WHITE)
        y -= 16

        for k, txt in enumerate(items, 1):
            # Número de acción
            frect(c, ML + 2, y - 11, 14, 13, col, radius=2)
            ftext(c, ML + 9, y - 5, str(k), "Helvetica-Bold", 7.5, WHITE, 'center')
            # Texto de acción (word-wrap)
            y2 = wrap_text(c, ML + 20, y - 3, txt, "Helvetica", 8.5, DARK, CW - 22, 12)
            y = min(y - 14, y2 - 2)

        y -= 3

    # Nota de cierre
    y -= 4*mm
    fline(c, ML, y, W - MR, y, BGRAY, 0.5)
    y -= 5*mm
    closing = (
        f"Este reporte consolida el desempeño de junio 2026 con venta neta de {c_fmt(VN)} "
        f"({p_fmt(cumpl)} de meta {mlbl}) y cobertura de {p_fmt(COB_PCT)}. "
        "Los datos tienen como fuente BASE_ACUMULADA con corte al 29/06/2026 "
        "y fueron validados contra los endpoints del sistema PALMA."
    )
    wrap_text(c, ML, y, closing, "Helvetica-Oblique", 7.5, MGRAY, CW, 11)


# ─── Generador de PDF ─────────────────────────────────────────────────────────
def generate_pdf(meta_type, out_path):
    c = rl.Canvas(str(out_path), pagesize=A4)

    page_cover(c, meta_type)
    c.showPage()

    page_resumen(c, meta_type)
    c.showPage()

    page_calidad(c, meta_type)
    c.showPage()

    page_negocios(c, meta_type)
    c.showPage()

    page_hallazgos(c, meta_type)
    c.showPage()

    page_recomendaciones(c, meta_type)
    c.showPage()

    c.save()
    print(f"  [OK] {out_path.name}")


# ─── JSON / CSV ───────────────────────────────────────────────────────────────
def generate_data_files(out_dir):
    data = {
        "periodo": "Junio 2026",
        "fecha_corte": "2026-06-29",
        "generado": FECHA_HOY,
        "ventas": {
            "venta_bruta": VB,
            "devolucion_total": DEV,
            "devolucion_pct": DEV_PCT,
            "averia_total": AV,
            "averia_pct": AV_PCT,
            "venta_neta": VN,
        },
        "cobertura": {
            "clientes_impactados": COB_IMP,
            "clientes_maestro": COB_MAE,
            "cobertura_pct": COB_PCT,
            "clientes_sin_impactar": COB_MAE - COB_IMP,
        },
        "metas": {
            "meta_palma": META_PALMA,
            "cumpl_palma": CUMPL_PALMA,
            "falta_palma": FALTA_PALMA,
            "meta_ecom": META_ECOM,
            "cumpl_ecom": CUMPL_ECOM,
            "falta_ecom": FALTA_ECOM,
        },
        "proyeccion": {
            "aplica": False,
            "nota": "Mes cerrado. Días hábiles restantes = 0. Corte 2026-06-29.",
        },
        "venta_sin_negocio": SIN_NEG,
        "venta_sin_negocio_pct": SIN_NEG_PCT,
        "negocios": [
            {
                "nombre": n[0],
                "venta_neta": n[1],
                "pct_venta_total": round(n[1]/VN*100, 2),
                "meta_ecom": n[2],
                "meta_palma": n[3],
                "cumpl_ecom": n[4],
                "cumpl_palma": n[5],
                "cobertura_impactados": n[6],
                "cobertura_pct": n[7],
            }
            for n in NEGOCIOS
        ],
    }

    json_path = out_dir / "datos_cierre_mes_palumar.json"
    json_path.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    print(f"  [OK] {json_path.name}")

    csv_path = out_dir / "datos_cierre_mes_palumar.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "negocio", "venta_neta", "pct_total",
            "meta_ecom", "meta_palma",
            "cumpl_ecom_pct", "cumpl_palma_pct",
            "cob_impactados", "cob_pct",
        ])
        for n in NEGOCIOS:
            writer.writerow([
                n[0], n[1], round(n[1]/VN*100, 2),
                n[2], n[3], n[4], n[5], n[6], n[7],
            ])
        writer.writerow([
            "Sin negocio identificado", SIN_NEG, SIN_NEG_PCT,
            "", "", "", "", "", "",
        ])
        writer.writerow([
            "TOTAL PALUMAR", VN, 100.0,
            META_ECOM, META_PALMA,
            CUMPL_ECOM, CUMPL_PALMA,
            COB_IMP, COB_PCT,
        ])
    print(f"  [OK] {csv_path.name}")


# ─── Main ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    out_dir = Path(__file__).parent / "cierre_mes_palumar"
    out_dir.mkdir(exist_ok=True)

    print("Generando Cierre de Mes PALUMAR — Junio 2026...")

    generate_pdf('palma', out_dir / "CIERRE_MES_PALUMAR_META_INFLADA.pdf")
    generate_pdf('ecom',  out_dir / "CIERRE_MES_PALUMAR_META_ECOM_REAL.pdf")
    generate_data_files(out_dir)

    print(f"\nArchivos generados en: {out_dir}/")
    for f in sorted(out_dir.iterdir()):
        size_kb = f.stat().st_size / 1024
        print(f"  {f.name:55s} {size_kb:6.1f} KB")
