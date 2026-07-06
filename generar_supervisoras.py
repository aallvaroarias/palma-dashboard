#!/usr/bin/env python3
"""
generar_supervisoras.py - v1.0
Liquidación de incentivos junio 2026 para supervisoras/líderes comerciales.
  - Dayana Mola   (Supervisora Centrales)
  - Stacy Cepeda  (Líder ventas Total Palumar)
PALUMAR S.A. — Junio 2026
"""

import requests, csv, os, math, unicodedata
from collections import Counter, defaultdict
from datetime import datetime

from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Table, TableStyle,
    Spacer, HRFlowable, PageBreak,
)
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT

# ── API ───────────────────────────────────────────────────────────────────────
DEPLOYMENT = "AKfycbwRPhHFwnBnTadtIuH3FHapuwVjzXJr5suo-KlWxr-ReoA44VtAt1pZsf_TF2a1KIfK"
BASE       = f"https://script.google.com/macros/s/{DEPLOYMENT}/exec"

PERIODO_LABEL = "Junio 2026"
FECHA_GEN     = datetime.now().strftime("%d de %B de %Y").lower().capitalize()
OUTPUT_DIR    = "liquidacion_incentivos_supervisoras_junio_2026"

# ── EQUIPOS ───────────────────────────────────────────────────────────────────
CENTRALES_CODES = {"201", "202", "203", "204", "206", "214"}   # sede=CENTRALES en cuotas

# ── VBI DAYANA MOLA (Supervisora Centrales) ───────────────────────────────────
VBI_D = {
    "ppto":    156.00,
    "ef":       39.00,
    "cafe":     65.00,
    "jet":      39.00,
    "cremas":   39.00,
    "nuevos":   26.00,
    "cero":     39.00,
    "devol":    26.00,
    "tikys":    26.00,
    "fotos":    52.00,
    "choc":     26.00,
    "gall":     39.00,
    "bebidas":  26.00,
    "ne":       26.00,
}

# ── VBI STACY CEPEDA (Líder Total Palumar) ────────────────────────────────────
VBI_S = {
    "ppto":    180.00,
    "ef":       45.00,
    "cafe":     75.00,
    "jet":      45.00,
    "cremas":   45.00,
    "nuevos":   30.00,
    "cero":     45.00,
    "devol":    30.00,
    "tikys":    30.00,
    "fotos":    60.00,
    "choc":     30.00,
    "gall":     45.00,
    "bebidas":  30.00,
    "ne":       30.00,
}

# ── METAS ─────────────────────────────────────────────────────────────────────
META_DN_CAFE_PCT   = 40.0
META_DN_JET_PCT    = 40.0
META_DN_CREMAS_PCT = 10.0
META_DN_TIKYS_PCT  = 15.0
META_NUEVOS_POR_VEND = 10
META_CERO_PCT      = 4.0
META_DEVOL_PCT     = 5.0

CREMA_KW = "CREMA"

# ── COLORES ───────────────────────────────────────────────────────────────────
C_TEAL       = colors.HexColor("#17A3B8")
C_TEAL_DARK  = colors.HexColor("#0D7A8F")
C_TEAL_LIGHT = colors.HexColor("#E8F7FA")
C_RED        = colors.HexColor("#E74C3C")
C_GREEN      = colors.HexColor("#27AE60")
C_GREEN_L    = colors.HexColor("#EAFAF1")
C_ORANGE     = colors.HexColor("#E67E22")
C_AMBER      = colors.HexColor("#F39C12")
C_GRIS       = colors.HexColor("#F8F9FA")
C_GRIS_LINE  = colors.HexColor("#DEE2E6")
C_BLANCO     = colors.white
C_TEXT_DARK  = colors.HexColor("#2C3E50")
C_TEXT_MUTED = colors.HexColor("#95A5A6")

# ── UTILIDADES ────────────────────────────────────────────────────────────────
def norm_neg(s):
    s = str(s).lower()
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")

def fmt_usd(v):
    try:
        v = float(v)
        return f"${v:,.2f}"
    except Exception:
        return "$0.00"

def fmt_pct(v):
    try:
        return f"{float(v):.1f}%"
    except Exception:
        return "0.0%"

def clean_nombre(s):
    return str(s).split("-", 1)[-1].strip().title() if "-" in str(s) else str(s).strip().title()

def fetch(sheet, params=None):
    p = {"sheet": sheet}
    if params:
        p.update(params)
    print(f"  → GET sheet={sheet} {params or ''}")
    r = requests.get(BASE, params=p, timeout=120)
    d = r.json()
    return d.get("data", d) if isinstance(d, dict) and "data" in d else d

# ── ESCALAS ───────────────────────────────────────────────────────────────────
def calc_presupuesto(pct, vbi):
    if pct < 80.0:   return 0.0
    if pct <= 95.0:  return round(vbi * 0.60, 2)
    if pct <= 99.0:  return round(vbi * 0.80, 2)
    if pct <= 105.0: return round(vbi * 1.05, 2)
    return round(min(vbi * (1.05 + (pct - 105.0) * 0.01), vbi * 1.10), 2)

def calc_efectividad_sup(pct, vbi):
    """Escala de efectividad supervisoras (step, diferente a vendedores)."""
    if pct < 80.0:  return 0.0
    if pct < 87.0:  return round(vbi * 0.80, 2)
    if pct < 90.0:  return round(vbi * 0.90, 2)
    return round(vbi * 1.10, 2)

# ── DN CREMAS (detalle_cobertura_negocio) ─────────────────────────────────────
def calc_dn_cremas_detalle(detalle_data, fallback_universo=0):
    filas = detalle_data.get("detalle_filas", [])
    clientes = set()
    skus_vistos = {}
    for row in filas:
        if CREMA_KW not in str(row.get("producto", "")).upper():
            continue
        if float(row.get("cant_neta", 0)) <= 0:
            continue
        clt = str(row.get("cod_cliente", ""))
        if clt:
            clientes.add(clt)
        sku = str(row.get("cod_sku", ""))
        if sku:
            skus_vistos[sku] = str(row.get("producto", ""))
    n = len(clientes)
    uni = int((detalle_data.get("resumen") or {}).get("universo", fallback_universo))
    if uni <= 0:
        uni = int(fallback_universo)
    pct = round(n / uni * 100, 1) if uni > 0 else 0.0
    return n, uni, pct

def fetch_cremas_por_vend(vendedores_list):
    print("\n  → Obteniendo DN Galletas Cremas (detalle_cobertura_negocio ×14)...")
    result = {}
    for v in sorted(vendedores_list, key=lambda x: x["cod"]):
        cod = str(v["cod"]).zfill(3)
        mae = int(v.get("maestro", 0))
        print(f"    Vendedor {cod}...", end="", flush=True)
        try:
            t0 = datetime.now()
            data = fetch("detalle_cobertura_negocio",
                         {"cod_asesor": cod, "negocio": "Galletas"})
            elapsed = (datetime.now() - t0).seconds
            n, uni, pct = calc_dn_cremas_detalle(data, mae)
            result[cod] = {"n": n, "universo": uni, "pct": pct}
            print(f" {n}/{uni} ({pct:.1f}%) — {elapsed}s")
        except Exception as e:
            print(f" ERROR: {e}")
            result[cod] = {"n": 0, "universo": mae, "pct": 0.0}
    return result

# ── CÁLCULO POR SUPERVISOR ────────────────────────────────────────────────────
def calcular_supervisor(nombre, rol, alcance_label, vbi, team_codes,
                        vendedores_all, cuotas_all, cafe_map, cob_neg_map,
                        marcas_por_vend, nuevos_map, cremas_pv, venta_neg_map_all):
    """Devuelve dict con todos los resultados del supervisor."""

    # ── Filtrar equipo ────────────────────────────────────────────────────────
    team_vend = [v for v in vendedores_all if str(v["cod"]).zfill(3) in team_codes]
    team_cuot = [c for c in cuotas_all      if str(c["cod"]).zfill(3) in team_codes]

    # ── Agregados financieros ─────────────────────────────────────────────────
    venta_bruta  = sum(float(v.get("venta_bruta",   0)) for v in team_vend)
    venta_neta   = sum(float(v.get("venta_neta",    0)) for v in team_vend)
    devol        = sum(float(v.get("devolucion_total", 0)) for v in team_vend)
    cuota_total  = sum(float(c.get("cuota", 0))          for c in team_cuot)
    maestro_tot  = sum(int(v.get("maestro",   0))        for v in team_vend)
    sin_compra   = sum(int(v.get("sin_compra", 0)) if "sin_compra" in v
                       else (int(v.get("maestro",0)) - int(v.get("impactados",0)))
                       for v in team_vend)

    pct_devol = devol / venta_bruta * 100 if venta_bruta > 0 else 0.0
    pct_cum   = venta_neta / cuota_total * 100 if cuota_total > 0 else 0.0
    pct_cero  = sin_compra / maestro_tot * 100 if maestro_tot > 0 else 0.0

    # ── Efectividad ponderada por maestra ─────────────────────────────────────
    ef_raw = sum(float(v.get("efectividad", 0)) / 100.0 * int(v.get("maestro", 0))
                 for v in team_vend)
    pct_ef = ef_raw / maestro_tot * 100 if maestro_tot > 0 else 0.0

    # ── DN Café ───────────────────────────────────────────────────────────────
    imp_cafe = sum(int(cafe_map.get(str(v["cod"]).zfill(3), {}).get("impactados", 0))
                   for v in team_vend)
    mae_cafe = sum(int(cafe_map.get(str(v["cod"]).zfill(3), {}).get("clientes_maestro", 0))
                   for v in team_vend)
    pct_cafe = imp_cafe / mae_cafe * 100 if mae_cafe > 0 else 0.0

    # ── DN Jet ────────────────────────────────────────────────────────────────
    imp_jet = sum(int((marcas_por_vend.get(str(v["cod"]).zfill(3), {})
                       .get("053-JET", {}) or {}).get("clientes_impactados", 0))
                  for v in team_vend)
    uni_jet = sum(int((marcas_por_vend.get(str(v["cod"]).zfill(3), {})
                       .get("053-JET", {}) or {}).get("universo", 0)) or int(v.get("maestro",0))
                  for v in team_vend)
    pct_jet = imp_jet / uni_jet * 100 if uni_jet > 0 else 0.0

    # ── DN Tikys ──────────────────────────────────────────────────────────────
    imp_tikys = sum(int((marcas_por_vend.get(str(v["cod"]).zfill(3), {})
                         .get("083-TIKYS", {}) or {}).get("clientes_impactados", 0))
                    for v in team_vend)
    uni_tikys = sum(int((marcas_por_vend.get(str(v["cod"]).zfill(3), {})
                         .get("083-TIKYS", {}) or {}).get("universo", 0)) or int(v.get("maestro",0))
                    for v in team_vend)
    pct_tikys = imp_tikys / uni_tikys * 100 if uni_tikys > 0 else 0.0

    # ── DN Cremas ─────────────────────────────────────────────────────────────
    n_cremas   = sum(cremas_pv.get(str(v["cod"]).zfill(3), {}).get("n", 0) for v in team_vend)
    uni_cremas = sum(cremas_pv.get(str(v["cod"]).zfill(3), {}).get("universo", 0)
                     for v in team_vend)
    if uni_cremas == 0:
        uni_cremas = maestro_tot
    pct_cremas = n_cremas / uni_cremas * 100 if uni_cremas > 0 else 0.0

    # ── Clientes nuevos (regla estricta: TODOS deben cumplir >= 10) ───────────
    nuevos_detalle = {}
    for v in team_vend:
        cod = str(v["cod"]).zfill(3)
        nuevos_detalle[cod] = {
            "nombre":  clean_nombre(v.get("nombre", cod)),
            "n":       int(nuevos_map.get(cod, 0)),
            "cumple":  int(nuevos_map.get(cod, 0)) >= META_NUEVOS_POR_VEND,
        }
    cumple_nuevos_todos = all(d["cumple"] for d in nuevos_detalle.values())

    # ── Ventas por negocio ────────────────────────────────────────────────────
    def venta_neg_equipo(kw):
        tot = 0.0
        for v in team_vend:
            vn = venta_neg_map_all.get(str(v["cod"]).zfill(3), {})
            for neg_key, val in vn.items():
                if kw.lower() in neg_key.lower():
                    tot += float(val)
        return tot

    def meta_neg_equipo(kw):
        tot = 0.0
        for c in team_cuot:
            for negocio in c.get("por_negocio", []):
                if kw.lower() in negocio["negocio"].lower():
                    tot += float(negocio.get("meta", 0))
        return tot

    venta_choc   = venta_neg_equipo("hocolat")
    venta_gall   = venta_neg_equipo("alleta")
    venta_bebidas= venta_neg_equipo("10-tmluc")
    venta_ne     = venta_neg_equipo("utrici")
    venta_cafe_n = venta_neg_equipo("af")
    venta_carn   = venta_neg_equipo("arnico")

    meta_choc    = meta_neg_equipo("Chocolates")
    meta_gall    = meta_neg_equipo("Galletas")
    meta_bebidas = meta_neg_equipo("Bebidas TMLUC")
    meta_ne      = meta_neg_equipo("Nutrición Experta")

    def pago_neg(venta, meta, vbi_k):
        pct = venta / meta * 100 if meta > 0 else 0.0
        pago = calc_presupuesto(pct, vbi[vbi_k]) if vbi[vbi_k] > 0 else 0.0
        return pct, pago

    pct_choc,    p_choc    = pago_neg(venta_choc,    meta_choc,    "choc")
    pct_gall,    p_gall    = pago_neg(venta_gall,    meta_gall,    "gall")
    pct_bebidas, p_bebidas = pago_neg(venta_bebidas, meta_bebidas, "bebidas")
    pct_ne,      p_ne      = pago_neg(venta_ne,      meta_ne,      "ne")

    # ── Pagos ─────────────────────────────────────────────────────────────────
    p_ppto  = calc_presupuesto(pct_cum, vbi["ppto"])
    p_ef    = calc_efectividad_sup(pct_ef, vbi["ef"])
    p_cafe  = vbi["cafe"]  if pct_cafe  >= META_DN_CAFE_PCT   else 0.0
    p_jet   = vbi["jet"]   if pct_jet   >= META_DN_JET_PCT    else 0.0
    p_tikys = vbi["tikys"] if pct_tikys >= META_DN_TIKYS_PCT  else 0.0
    p_cremas= vbi["cremas"]if pct_cremas>= META_DN_CREMAS_PCT else 0.0
    p_nuevos= vbi["nuevos"]if cumple_nuevos_todos              else 0.0
    p_cero  = vbi["cero"]  if pct_cero  <= META_CERO_PCT      else 0.0
    p_devol = vbi["devol"] if pct_devol <= META_DEVOL_PCT      else 0.0
    # fotos: siempre pendiente (sin fuente)

    total = (p_ppto + p_ef + p_cafe + p_jet + p_tikys + p_cremas +
             p_nuevos + p_cero + p_devol +
             p_choc + p_gall + p_bebidas + p_ne)

    return {
        "nombre":    nombre,
        "rol":       rol,
        "alcance":   alcance_label,
        "team_codes": team_codes,
        "vbi":       vbi,
        # Financiero
        "venta_bruta":  venta_bruta,
        "venta_neta":   venta_neta,
        "devol":        devol,
        "pct_devol":    pct_devol,
        "cuota_total":  cuota_total,
        "pct_cum":      pct_cum,
        "maestro_tot":  maestro_tot,
        "sin_compra":   sin_compra,
        "pct_cero":     pct_cero,
        "pct_ef":       pct_ef,
        # DN
        "pct_cafe":   pct_cafe,  "imp_cafe":  imp_cafe,  "mae_cafe":  mae_cafe,
        "pct_jet":    pct_jet,   "imp_jet":   imp_jet,   "uni_jet":   uni_jet,
        "pct_tikys":  pct_tikys, "imp_tikys": imp_tikys, "uni_tikys": uni_tikys,
        "pct_cremas": pct_cremas,"n_cremas":  n_cremas,  "uni_cremas":uni_cremas,
        # Nuevos
        "nuevos_detalle": nuevos_detalle,
        "cumple_nuevos":  cumple_nuevos_todos,
        # Negocios
        "venta_choc": venta_choc, "meta_choc": meta_choc, "pct_choc": pct_choc,
        "venta_gall": venta_gall, "meta_gall": meta_gall, "pct_gall": pct_gall,
        "venta_bebidas": venta_bebidas, "meta_bebidas": meta_bebidas, "pct_bebidas": pct_bebidas,
        "venta_ne":   venta_ne,   "meta_ne":   meta_ne,   "pct_ne":   pct_ne,
        "venta_cafe_n": venta_cafe_n,
        "venta_carn":   venta_carn,
        # Pagos
        "p_ppto": p_ppto, "p_ef": p_ef, "p_cafe": p_cafe,
        "p_jet": p_jet, "p_tikys": p_tikys, "p_cremas": p_cremas,
        "p_nuevos": p_nuevos, "p_cero": p_cero, "p_devol": p_devol,
        "p_choc": p_choc, "p_gall": p_gall, "p_bebidas": p_bebidas, "p_ne": p_ne,
        "total": total,
        # Team detail
        "team_vend": team_vend,
        "nuevos_map": nuevos_map,
    }

# ── ESTILOS PDF ───────────────────────────────────────────────────────────────
def make_styles():
    def ps(name, **kw):
        return ParagraphStyle(name, parent=getSampleStyleSheet()["Normal"], **kw)
    return {
        "brand":   ps("brand",  fontName="Helvetica-Bold",   fontSize=11, textColor=C_TEXT_DARK, leading=14),
        "title":   ps("title",  fontName="Helvetica-Bold",   fontSize=15, textColor=C_TEAL, leading=20, spaceAfter=4),
        "sub":     ps("sub",    fontName="Helvetica-Bold",   fontSize=10, textColor=C_TEAL_DARK, leading=13),
        "body":    ps("body",   fontName="Helvetica",        fontSize=9,  textColor=C_TEXT_DARK, leading=12),
        "body_b":  ps("bodyb",  fontName="Helvetica-Bold",   fontSize=9,  textColor=C_TEXT_DARK, leading=12),
        "muted":   ps("muted",  fontName="Helvetica",        fontSize=7,  textColor=C_TEXT_MUTED, leading=10),
        "footer":  ps("footer", fontName="Helvetica",        fontSize=7,  textColor=C_TEXT_MUTED, alignment=TA_CENTER, leading=10),
        "kpi_lbl": ps("kpil",   fontName="Helvetica",        fontSize=8,  textColor=C_TEXT_MUTED, leading=10),
        "kpi_val": ps("kpiv",   fontName="Helvetica-Bold",   fontSize=12, textColor=C_TEXT_DARK, leading=15),
        "kpi_big": ps("kpibig", fontName="Helvetica-Bold",   fontSize=16, textColor=C_TEAL, leading=20),
        "ind_cat": ps("icat",   fontName="Helvetica-BoldOblique", fontSize=8, textColor=C_TEAL_DARK, leading=10),
        "ind_th":  ps("ith",    fontName="Helvetica-Bold",   fontSize=8,  textColor=C_BLANCO, alignment=TA_CENTER, leading=10),
        "ind_td":  ps("itd",    fontName="Helvetica",        fontSize=8,  textColor=C_TEXT_DARK, leading=10),
        "ind_ok":  ps("iok",    fontName="Helvetica-Bold",   fontSize=8,  textColor=C_GREEN, alignment=TA_RIGHT, leading=10),
        "ind_no":  ps("ino",    fontName="Helvetica",        fontSize=8,  textColor=C_TEXT_MUTED, alignment=TA_RIGHT, leading=10),
        "ind_pend":ps("ipend",  fontName="Helvetica-Oblique",fontSize=8,  textColor=C_ORANGE, leading=10),
        "det_th":  ps("dth",    fontName="Helvetica-Bold",   fontSize=7.5,textColor=C_BLANCO, alignment=TA_CENTER, leading=9),
        "det_td":  ps("dtd",    fontName="Helvetica",        fontSize=7.5,textColor=C_TEXT_DARK, leading=9),
        "det_num": ps("dnum",   fontName="Helvetica-Bold",   fontSize=7.5,textColor=C_TEAL, alignment=TA_RIGHT, leading=9),
    }

def _sec_header(title, styles, color=None):
    c = color or C_TEAL
    return [
        HRFlowable(width="100%", thickness=1.5, color=c, spaceBefore=6, spaceAfter=0),
        Paragraph(title, ParagraphStyle("sh", parent=styles["sub"],
                                        textColor=c, spaceAfter=4)),
    ]

# ── PDF INDIVIDUAL ────────────────────────────────────────────────────────────
def build_pdf_supervisora(r, styles, out):
    W_PAGE = A4[0] - 4.0*cm
    doc = SimpleDocTemplate(
        out, pagesize=A4,
        topMargin=1.5*cm, bottomMargin=1.5*cm,
        leftMargin=2.0*cm, rightMargin=2.0*cm,
    )
    W = W_PAGE
    story = []
    vbi  = r["vbi"]

    # ── PÁGINA 1: RESUMEN ─────────────────────────────────────────────────────
    story.append(Paragraph("PALMA · Distribuciones Palumar S.A.", styles["brand"]))
    story.append(HRFlowable(width=W, thickness=1.5, color=C_TEAL, spaceBefore=2, spaceAfter=6))
    story.append(Paragraph(f"Liquidación Incentivo {r['rol']} · {PERIODO_LABEL}", styles["title"]))
    story.append(Paragraph(r["nombre"], ParagraphStyle("nm", parent=styles["title"],
                                                        fontSize=13, textColor=C_TEXT_DARK)))
    story.append(Paragraph(f"Alcance: {r['alcance']}", styles["sub"]))
    story.append(Paragraph(f"Generado el {FECHA_GEN}", styles["muted"]))
    story.append(Spacer(1, 0.5*cm))

    # KPIs fila 1
    kpi_data = [
        [Paragraph("Venta Bruta",    styles["kpi_lbl"]),
         Paragraph("Devoluciones",   styles["kpi_lbl"]),
         Paragraph("% Devolución",   styles["kpi_lbl"]),
         Paragraph("Venta Neta",     styles["kpi_lbl"]),
         Paragraph("Meta Total",     styles["kpi_lbl"])],
        [Paragraph(fmt_usd(r["venta_bruta"]),  styles["kpi_val"]),
         Paragraph(fmt_usd(r["devol"]),        styles["kpi_val"]),
         Paragraph(fmt_pct(r["pct_devol"]),
                   ParagraphStyle("pd2",parent=styles["kpi_val"],
                                  textColor=C_RED if r["pct_devol"]>META_DEVOL_PCT else C_GREEN)),
         Paragraph(fmt_usd(r["venta_neta"]),   styles["kpi_val"]),
         Paragraph(fmt_usd(r["cuota_total"]),  styles["kpi_val"])],
    ]
    kpi_tbl = Table(kpi_data, colWidths=[W/5]*5)
    kpi_tbl.setStyle(TableStyle([
        ("BOX",         (0,0),(-1,-1), 0.5, C_GRIS_LINE),
        ("INNERGRID",   (0,0),(-1,-1), 0.3, C_GRIS_LINE),
        ("BACKGROUND",  (0,0),(-1,-1), C_GRIS),
        ("TOPPADDING",  (0,0),(-1,-1), 6),("BOTTOMPADDING",(0,0),(-1,-1),6),
        ("LEFTPADDING", (0,0),(-1,-1), 8),("RIGHTPADDING", (0,0),(-1,-1),8),
    ]))
    story.append(kpi_tbl)
    story.append(Spacer(1, 0.3*cm))

    # KPIs fila 2
    kpi2_data = [
        [Paragraph("Cumplimiento",  styles["kpi_lbl"]),
         Paragraph("Efectividad",   styles["kpi_lbl"]),
         Paragraph("Universo",      styles["kpi_lbl"]),
         Paragraph("Cliente Cero",  styles["kpi_lbl"]),
         Paragraph("TOTAL A PAGAR", styles["kpi_lbl"])],
        [Paragraph(fmt_pct(r["pct_cum"]),
                   ParagraphStyle("pc2",parent=styles["kpi_val"],
                                  textColor=C_GREEN if r["pct_cum"]>=100 else (C_AMBER if r["pct_cum"]>=80 else C_RED))),
         Paragraph(fmt_pct(r["pct_ef"]),
                   ParagraphStyle("ef2",parent=styles["kpi_val"],
                                  textColor=C_GREEN if r["pct_ef"]>=90 else (C_AMBER if r["pct_ef"]>=80 else C_RED))),
         Paragraph(str(r["maestro_tot"]), styles["kpi_val"]),
         Paragraph(fmt_pct(r["pct_cero"]),
                   ParagraphStyle("cero2",parent=styles["kpi_val"],
                                  textColor=C_GREEN if r["pct_cero"]<=META_CERO_PCT else C_RED)),
         Paragraph(fmt_usd(r["total"]), styles["kpi_big"])],
    ]
    kpi2_tbl = Table(kpi2_data, colWidths=[W/5]*5)
    kpi2_tbl.setStyle(TableStyle([
        ("BOX",         (0,0),(-1,-1), 0.5, C_TEAL),
        ("INNERGRID",   (0,0),(-1,-1), 0.3, C_GRIS_LINE),
        ("BACKGROUND",  (0,0),(-1,-1), C_TEAL_LIGHT),
        ("BACKGROUND",  (4,0),(4,-1),  colors.HexColor("#D5F5E3")),
        ("TOPPADDING",  (0,0),(-1,-1), 6),("BOTTOMPADDING",(0,0),(-1,-1),6),
        ("LEFTPADDING", (0,0),(-1,-1), 8),("RIGHTPADDING", (0,0),(-1,-1),8),
    ]))
    story.append(kpi2_tbl)
    story.append(Spacer(1, 0.4*cm))

    # Clientes nuevos alert
    nuevos_ok = [c for c, d in r["nuevos_detalle"].items() if d["cumple"]]
    nuevos_no = [f"{d['nombre']} ({d['n']})" for c, d in r["nuevos_detalle"].items() if not d["cumple"]]
    if nuevos_no:
        story.append(Paragraph(
            f"⚠ Clientes nuevos: no paga — vendedores sin mínimo 10: " + ", ".join(nuevos_no),
            ParagraphStyle("alrt",parent=styles["body"],textColor=C_RED,spaceAfter=2)))
    else:
        story.append(Paragraph(
            f"✓ Clientes nuevos: todos los vendedores cumplen ≥10 clientes.",
            ParagraphStyle("alrt2",parent=styles["body"],textColor=C_GREEN,spaceAfter=2)))

    story.append(PageBreak())

    # ── PÁGINA 2: INDICADORES ─────────────────────────────────────────────────
    story.append(Paragraph("PALMA · Distribuciones Palumar S.A.", styles["brand"]))
    story.append(HRFlowable(width=W, thickness=1.5, color=C_TEAL, spaceBefore=2, spaceAfter=6))
    story.append(Paragraph(f"Indicadores de Incentivo · {r['nombre']} · {PERIODO_LABEL}", styles["sub"]))
    story.append(Spacer(1, 0.3*cm))

    def ind_row(concepto, resultado, escala, vbi_val, pago, pendiente=False, nota=""):
        if pendiente:
            pago_cell = Paragraph("Pend.", styles["ind_pend"])
            pago_color = colors.HexColor("#FEF9E7")
        elif pago > 0:
            pago_cell = Paragraph(fmt_usd(pago), styles["ind_ok"])
            pago_color = C_GREEN_L
        else:
            pago_cell = Paragraph("$0.00", styles["ind_no"])
            pago_color = colors.white
        row = [
            Paragraph(concepto,          styles["ind_td"]),
            Paragraph(resultado,         styles["ind_td"]),
            Paragraph(escala,            styles["ind_td"]),
            Paragraph(fmt_usd(vbi_val),  styles["ind_td"]),
            pago_cell,
            Paragraph(nota,              styles["ind_td"]),
        ]
        return row, pago_color

    ind_cols = [W*.28, W*.18, W*.17, W*.08, W*.10, W*.19]
    ind_header = [Paragraph(h, styles["ind_th"]) for h in
                  ["Concepto", "Resultado", "Escala / Regla", "VBI", "Pago", "Observación"]]

    calidad_rows = []
    calidad_colors = []

    def add_ind(concepto, resultado, escala, vbi_val, pago, pendiente=False, nota=""):
        row, color = ind_row(concepto, resultado, escala, vbi_val, pago, pendiente, nota)
        calidad_rows.append(row)
        calidad_colors.append(color)

    for e in _sec_header("INDICADORES DE CALIDAD", styles):
        story.append(e)

    # Construir filas indicadores calidad
    inds_calidad = [
        ("Presupuesto / Total negocio",
         f"{fmt_pct(r['pct_cum'])} ({fmt_usd(r['venta_neta'])} / {fmt_usd(r['cuota_total'])})",
         "Escala presupuesto", vbi["ppto"], r["p_ppto"], False,
         f"Escala: {'60%' if r['pct_cum']<=95 else '80%' if r['pct_cum']<=99 else '105%' if r['pct_cum']<=105 else 'lineal'}"),
        ("Efectividad de visitas",
         fmt_pct(r["pct_ef"]),
         "≥90%→110% / ≥87%→90% / ≥80%→80% / <80%→$0", vbi["ef"], r["p_ef"], False, "Escala escalonada"),
        ("DN Café Molido Sello Rojo",
         f"{fmt_pct(r['pct_cafe'])} ({r['imp_cafe']}/{r['mae_cafe']})",
         f"≥{META_DN_CAFE_PCT:.0f}% maestra", vbi["cafe"], r["p_cafe"], False, ""),
        ("DN Jet (Chocolates Jet)",
         f"{fmt_pct(r['pct_jet'])} ({r['imp_jet']}/{r['uni_jet']})",
         f"≥{META_DN_JET_PCT:.0f}% maestra", vbi["jet"], r["p_jet"], False, ""),
        ("DN Galletas Cremas ×6",
         f"{fmt_pct(r['pct_cremas'])} ({r['n_cremas']}/{r['uni_cremas']})",
         f"≥{META_DN_CREMAS_PCT:.0f}% maestra", vbi["cremas"], r["p_cremas"], False,
         "Refs CREMA / negocio Galletas"),
        ("Clientes nuevos con pedido",
         f"{'Todos cumplen ≥10' if r['cumple_nuevos'] else 'No todos cumplen ≥10'}",
         "Todos los vendedores ≥10", vbi["nuevos"], r["p_nuevos"], False,
         f"{sum(1 for d in r['nuevos_detalle'].values() if d['cumple'])}/{len(r['nuevos_detalle'])} vendedores OK"),
        ("Cliente cero",
         f"{fmt_pct(r['pct_cero'])} ({r['sin_compra']}/{r['maestro_tot']})",
         f"≤{META_CERO_PCT:.0f}% maestra", vbi["cero"], r["p_cero"], False, ""),
        ("Devolución (meta ≤5%)",
         fmt_pct(r["pct_devol"]),
         f"≤{META_DEVOL_PCT:.0f}%", vbi["devol"], r["p_devol"], False, ""),
        ("DN Tikys",
         f"{fmt_pct(r['pct_tikys'])} ({r['imp_tikys']}/{r['uni_tikys']})",
         f"≥{META_DN_TIKYS_PCT:.0f}% maestra", vbi["tikys"], r["p_tikys"], False, ""),
        ("Ejecución de fotos",
         "Sin fuente", "Meta en fuente", vbi["fotos"], 0.0, True,
         "No existe fuente de datos en API"),
    ]

    rows_cal = [ind_header]
    style_cal = [
        ("BACKGROUND",  (0,0),(-1,0), C_TEAL_DARK),
        ("BOX",         (0,0),(-1,-1), 0.5, C_GRIS_LINE),
        ("INNERGRID",   (0,0),(-1,-1), 0.3, C_GRIS_LINE),
        ("TOPPADDING",  (0,0),(-1,-1), 4),("BOTTOMPADDING",(0,0),(-1,-1),4),
        ("LEFTPADDING", (0,0),(-1,-1), 5),("RIGHTPADDING", (0,0),(-1,-1),5),
        ("VALIGN",      (0,0),(-1,-1), "MIDDLE"),
    ]
    for i, (c, res, esc, vbi_v, pago, pend, nota) in enumerate(inds_calidad, 1):
        row, color = ind_row(c, res, esc, vbi_v, pago, pend, nota)
        rows_cal.append(row)
        if color != colors.white:
            style_cal.append(("BACKGROUND", (4,i),(4,i), color))
        if i % 2 == 0:
            style_cal.append(("BACKGROUND", (0,i),(3,i), C_GRIS))
            style_cal.append(("BACKGROUND", (5,i),(5,i), C_GRIS))

    tbl_cal = Table(rows_cal, colWidths=ind_cols, repeatRows=1)
    tbl_cal.setStyle(TableStyle(style_cal))
    story.append(tbl_cal)
    story.append(Spacer(1, 0.4*cm))

    for e in _sec_header("INDICADORES DE CANTIDAD", styles):
        story.append(e)

    inds_cant = [
        ("Ejecución negocio Chocolates",
         f"{fmt_pct(r['pct_choc'])} ({fmt_usd(r['venta_choc'])} / {fmt_usd(r['meta_choc'])})",
         "Escala presupuesto", vbi["choc"], r["p_choc"], False, ""),
        ("Ejecución negocio Galletas",
         f"{fmt_pct(r['pct_gall'])} ({fmt_usd(r['venta_gall'])} / {fmt_usd(r['meta_gall'])})",
         "Escala presupuesto", vbi["gall"], r["p_gall"], False, ""),
        ("Ejecución negocio Bebidas TMLUC",
         f"{fmt_pct(r['pct_bebidas'])} ({fmt_usd(r['venta_bebidas'])} / {fmt_usd(r['meta_bebidas'])})",
         "Escala presupuesto", vbi["bebidas"], r["p_bebidas"], False, "negocio 10-TMLUC"),
        ("Nutrición Experta (indicador)",
         f"{fmt_pct(r['pct_ne'])} ({fmt_usd(r['venta_ne'])} / {fmt_usd(r['meta_ne'])})",
         "Escala presupuesto", vbi["ne"], r["p_ne"], False, ""),
        ("Ejecución negocio Café",
         fmt_usd(r["venta_cafe_n"]),
         "VBI $0 — informativo", 0, 0.0, False, "No suma al total"),
        ("Ejecución negocio Cárnico",
         fmt_usd(r["venta_carn"]),
         "VBI $0 — informativo", 0, 0.0, False, "No suma al total"),
        ("Ejecución Culinarios / Kryzpo",
         "—", "VBI $0 — informativo", 0, 0.0, False, "No suma al total"),
    ]

    rows_cnt = [ind_header]
    style_cnt = [
        ("BACKGROUND",  (0,0),(-1,0), C_TEAL_DARK),
        ("BOX",         (0,0),(-1,-1), 0.5, C_GRIS_LINE),
        ("INNERGRID",   (0,0),(-1,-1), 0.3, C_GRIS_LINE),
        ("TOPPADDING",  (0,0),(-1,-1), 4),("BOTTOMPADDING",(0,0),(-1,-1),4),
        ("LEFTPADDING", (0,0),(-1,-1), 5),("RIGHTPADDING", (0,0),(-1,-1),5),
        ("VALIGN",      (0,0),(-1,-1), "MIDDLE"),
    ]
    for i, (c, res, esc, vbi_v, pago, pend, nota) in enumerate(inds_cant, 1):
        row, color = ind_row(c, res, esc, vbi_v, pago, pend, nota)
        rows_cnt.append(row)
        if color != colors.white and pago > 0:
            style_cnt.append(("BACKGROUND", (4,i),(4,i), color))
        if i % 2 == 0:
            style_cnt.append(("BACKGROUND", (0,i),(3,i), C_GRIS))
            style_cnt.append(("BACKGROUND", (5,i),(5,i), C_GRIS))

    tbl_cnt = Table(rows_cnt, colWidths=ind_cols, repeatRows=1)
    tbl_cnt.setStyle(TableStyle(style_cnt))
    story.append(tbl_cnt)
    story.append(Spacer(1, 0.3*cm))

    # Total
    total_data = [
        [Paragraph("TOTAL A PAGAR JUNIO 2026", styles["body_b"]),
         Paragraph(fmt_usd(r["total"]),
                   ParagraphStyle("tot2",parent=styles["kpi_big"],fontSize=14))],
        [Paragraph("Fotos pendiente (sin fuente) — potencial adicional:",styles["muted"]),
         Paragraph(fmt_usd(vbi["fotos"]), styles["muted"])],
    ]
    total_tbl = Table(total_data, colWidths=[W*0.65, W*0.35])
    total_tbl.setStyle(TableStyle([
        ("BOX",         (0,0),(-1,-1), 1.0, C_TEAL),
        ("BACKGROUND",  (0,0),(-1,-1), C_TEAL_LIGHT),
        ("TOPPADDING",  (0,0),(-1,-1), 8),("BOTTOMPADDING",(0,0),(-1,-1),8),
        ("LEFTPADDING", (0,0),(-1,-1), 10),("RIGHTPADDING",(0,0),(-1,-1),10),
        ("ALIGN",       (1,0),(1,-1),  "RIGHT"),
    ]))
    story.append(total_tbl)
    story.append(PageBreak())

    # ── PÁGINA 3: DETALLE POR VENDEDOR ────────────────────────────────────────
    story.append(Paragraph("PALMA · Distribuciones Palumar S.A.", styles["brand"]))
    story.append(HRFlowable(width=W, thickness=1.5, color=C_TEAL, spaceBefore=2, spaceAfter=6))
    story.append(Paragraph(
        f"Detalle por Vendedor — {r['alcance']} · {PERIODO_LABEL}", styles["sub"]))
    story.append(Spacer(1, 0.3*cm))

    det_cols = [W*.065, W*.16, W*.10, W*.10, W*.075, W*.075, W*.085, W*.085, W*.11, W*.145]
    det_header = [Paragraph(h, styles["det_th"]) for h in [
        "Cód", "Vendedor", "Venta Neta", "Meta", "%Cum", "%Efec",
        "Cl.Nuevos", "Cero%", "Devol%", "Observación"
    ]]

    det_rows = [det_header]
    det_style = [
        ("BACKGROUND",  (0,0),(-1,0), C_TEAL_DARK),
        ("BOX",         (0,0),(-1,-1), 0.5, C_GRIS_LINE),
        ("INNERGRID",   (0,0),(-1,-1), 0.3, C_GRIS_LINE),
        ("TOPPADDING",  (0,0),(-1,-1), 3),("BOTTOMPADDING",(0,0),(-1,-1),3),
        ("LEFTPADDING", (0,0),(-1,-1), 3),("RIGHTPADDING", (0,0),(-1,-1),3),
        ("VALIGN",      (0,0),(-1,-1), "MIDDLE"),
    ]

    team_sorted = sorted(r["team_vend"], key=lambda x: x["cod"])
    nuevos_map_r = r["nuevos_map"]
    for i, v in enumerate(team_sorted, 1):
        cod = str(v["cod"]).zfill(3)
        nombre_vend = clean_nombre(v.get("nombre", cod))[:18]
        vn    = float(v.get("venta_neta", 0))
        meta  = float(v.get("cuota", 0))  # cuota from vendedores; might be 0
        pct_c = float(v.get("pct_cumplimiento", 0))
        pct_e = float(v.get("efectividad", 0))
        n_nv  = int(nuevos_map_r.get(cod, 0))
        mae   = int(v.get("maestro", 0))
        sc    = int(v.get("sin_compra", 0)) if "sin_compra" in v else (mae - int(v.get("impactados",0)))
        pct_c0= sc / mae * 100 if mae > 0 else 0.0
        pct_dv= float(v.get("pct_devolucion", 0))

        obs_parts = []
        if n_nv < META_NUEVOS_POR_VEND:
            obs_parts.append(f"Nuevos: {n_nv} < 10")
        if pct_c0 > META_CERO_PCT:
            obs_parts.append(f"Cero: {pct_c0:.1f}%>4%")
        if pct_dv > META_DEVOL_PCT:
            obs_parts.append(f"Devol: {pct_dv:.1f}%>5%")
        obs = "; ".join(obs_parts) or "OK"

        color_row = C_GRIS if i % 2 == 0 else colors.white
        det_rows.append([
            Paragraph(cod,          styles["det_td"]),
            Paragraph(nombre_vend,  styles["det_td"]),
            Paragraph(fmt_usd(vn),  styles["det_num"]),
            Paragraph(fmt_usd(meta),styles["det_num"]),
            Paragraph(fmt_pct(pct_c),
                      ParagraphStyle(f"pc{i}",parent=styles["det_num"],
                                     textColor=C_GREEN if pct_c>=100 else (C_AMBER if pct_c>=80 else C_RED))),
            Paragraph(fmt_pct(pct_e),
                      ParagraphStyle(f"ef{i}",parent=styles["det_num"],
                                     textColor=C_GREEN if pct_e>=90 else (C_AMBER if pct_e>=80 else C_RED))),
            Paragraph(str(n_nv),
                      ParagraphStyle(f"nv{i}",parent=styles["det_num"],
                                     textColor=C_GREEN if n_nv>=10 else C_RED)),
            Paragraph(fmt_pct(pct_c0),
                      ParagraphStyle(f"cz{i}",parent=styles["det_num"],
                                     textColor=C_GREEN if pct_c0<=META_CERO_PCT else C_RED)),
            Paragraph(fmt_pct(pct_dv),
                      ParagraphStyle(f"dv{i}",parent=styles["det_num"],
                                     textColor=C_GREEN if pct_dv<=META_DEVOL_PCT else C_RED)),
            Paragraph(obs, styles["det_td"]),
        ])
        det_style.append(("BACKGROUND", (0,i),(-1,i), color_row))

    det_tbl = Table(det_rows, colWidths=det_cols, repeatRows=1)
    det_tbl.setStyle(TableStyle(det_style))
    story.append(det_tbl)
    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph(f"Total equipo: {len(team_sorted)} vendedores · {r['alcance']} · {PERIODO_LABEL}",
                            styles["footer"]))

    doc.build(story)

# ── PDF CONSOLIDADO ───────────────────────────────────────────────────────────
def build_pdf_consolidado_sup(resultados, styles, out):
    doc = SimpleDocTemplate(
        out, pagesize=A4,
        topMargin=1.5*cm, bottomMargin=1.5*cm,
        leftMargin=2.0*cm, rightMargin=2.0*cm,
    )
    W = A4[0] - 4.0*cm
    story = []
    story.append(Paragraph("PALMA · Distribuciones Palumar S.A.", styles["brand"]))
    story.append(HRFlowable(width=W, thickness=1.5, color=C_TEAL, spaceBefore=2, spaceAfter=6))
    story.append(Paragraph(f"Consolidado Supervisoras · {PERIODO_LABEL}", styles["title"]))
    story.append(Paragraph(f"Generado el {FECHA_GEN}", styles["muted"]))
    story.append(Spacer(1, 0.4*cm))

    for e in _sec_header("RESUMEN EJECUTIVO", styles):
        story.append(e)

    sum_cols = [W*.20, W*.18, W*.18, W*.18, W*.13, W*.13]
    sum_hdr = [Paragraph(h, styles["ind_th"]) for h in
               ["Supervisora / Líder", "Alcance", "Venta Neta", "Meta", "%Cum", "Total Pago"]]
    sum_rows = [sum_hdr]
    for r in resultados:
        sum_rows.append([
            Paragraph(r["nombre"], styles["body_b"]),
            Paragraph(r["alcance"], styles["body"]),
            Paragraph(fmt_usd(r["venta_neta"]), styles["body"]),
            Paragraph(fmt_usd(r["cuota_total"]), styles["body"]),
            Paragraph(fmt_pct(r["pct_cum"]),
                      ParagraphStyle("pc3",parent=styles["body"],
                                     textColor=C_GREEN if r["pct_cum"]>=100 else (C_AMBER if r["pct_cum"]>=80 else C_RED))),
            Paragraph(fmt_usd(r["total"]),
                      ParagraphStyle("tot3",parent=styles["body_b"],textColor=C_TEAL)),
        ])
    sum_tbl = Table(sum_rows, colWidths=sum_cols, repeatRows=1)
    sum_tbl.setStyle(TableStyle([
        ("BACKGROUND",  (0,0),(-1,0), C_TEAL_DARK),
        ("BACKGROUND",  (0,1),(-1,-1), C_TEAL_LIGHT),
        ("BOX",         (0,0),(-1,-1), 0.5, C_GRIS_LINE),
        ("INNERGRID",   (0,0),(-1,-1), 0.3, C_GRIS_LINE),
        ("TOPPADDING",  (0,0),(-1,-1), 6),("BOTTOMPADDING",(0,0),(-1,-1),6),
        ("LEFTPADDING", (0,0),(-1,-1), 8),("RIGHTPADDING", (0,0),(-1,-1),8),
    ]))
    story.append(sum_tbl)
    story.append(Spacer(1, 0.4*cm))

    for e in _sec_header("DETALLE INDICADORES POR SUPERVISORA", styles):
        story.append(e)

    ind_cols2 = [W*.24, W*.18, W*.16, W*.08, W*.10, W*.10, W*.14]
    ind_hdr2  = [Paragraph(h, styles["ind_th"]) for h in
                 ["Concepto", "Dayana (Centrales)", "Stacy (Total)", "VBI D", "VBI S", "Pago D", "Pago S"]]

    def safe_pago(r, key):
        return fmt_usd(r.get(f"p_{key}", 0.0))

    def safe_res(r, key):
        mapping = {
            "ppto":    f"{fmt_pct(r['pct_cum'])}",
            "ef":      f"{fmt_pct(r['pct_ef'])}",
            "cafe":    f"{fmt_pct(r['pct_cafe'])}",
            "jet":     f"{fmt_pct(r['pct_jet'])}",
            "cremas":  f"{fmt_pct(r['pct_cremas'])}",
            "nuevos":  f"{'Cumple' if r['cumple_nuevos'] else 'No cumple'}",
            "cero":    f"{fmt_pct(r['pct_cero'])}",
            "devol":   f"{fmt_pct(r['pct_devol'])}",
            "tikys":   f"{fmt_pct(r['pct_tikys'])}",
            "fotos":   "Pendiente",
            "choc":    f"{fmt_pct(r['pct_choc'])}",
            "gall":    f"{fmt_pct(r['pct_gall'])}",
            "bebidas": f"{fmt_pct(r['pct_bebidas'])}",
            "ne":      f"{fmt_pct(r['pct_ne'])}",
        }
        return mapping.get(key, "—")

    rd = resultados[0]  # Dayana
    rs = resultados[1]  # Stacy

    indicadores_orden = [
        ("Presupuesto Total negocio",  "ppto"),
        ("Efectividad",                "ef"),
        ("DN Café Molido Sello Rojo",  "cafe"),
        ("DN Jet",                     "jet"),
        ("DN Galletas Cremas ×6",      "cremas"),
        ("Clientes nuevos c/pedido",   "nuevos"),
        ("Cliente cero",               "cero"),
        ("Devolución ≤5%",             "devol"),
        ("DN Tikys",                   "tikys"),
        ("Fotos",                      "fotos"),
        ("Ej. Chocolates",             "choc"),
        ("Ej. Galletas",               "gall"),
        ("Ej. Bebidas TMLUC",          "bebidas"),
        ("Nutrición Experta",          "ne"),
    ]
    det_rows2 = [ind_hdr2]
    det_style2 = [
        ("BACKGROUND",  (0,0),(-1,0), C_TEAL_DARK),
        ("BOX",         (0,0),(-1,-1), 0.5, C_GRIS_LINE),
        ("INNERGRID",   (0,0),(-1,-1), 0.3, C_GRIS_LINE),
        ("TOPPADDING",  (0,0),(-1,-1), 4),("BOTTOMPADDING",(0,0),(-1,-1),4),
        ("LEFTPADDING", (0,0),(-1,-1), 5),("RIGHTPADDING", (0,0),(-1,-1),5),
        ("VALIGN",      (0,0),(-1,-1), "MIDDLE"),
    ]
    for i, (concepto, key) in enumerate(indicadores_orden, 1):
        pd_v = rd.get(f"p_{key}", 0.0)
        ps_v = rs.get(f"p_{key}", 0.0)
        is_pend = (key == "fotos")
        p_d_cell = Paragraph("Pend.", styles["ind_pend"]) if is_pend else \
                   (Paragraph(fmt_usd(pd_v), styles["ind_ok"]) if pd_v > 0 else
                    Paragraph("$0.00", styles["ind_no"]))
        p_s_cell = Paragraph("Pend.", styles["ind_pend"]) if is_pend else \
                   (Paragraph(fmt_usd(ps_v), styles["ind_ok"]) if ps_v > 0 else
                    Paragraph("$0.00", styles["ind_no"]))
        det_rows2.append([
            Paragraph(concepto, styles["ind_td"]),
            Paragraph(safe_res(rd, key), styles["ind_td"]),
            Paragraph(safe_res(rs, key), styles["ind_td"]),
            Paragraph(fmt_usd(rd["vbi"].get(key, 0)), styles["ind_td"]),
            Paragraph(fmt_usd(rs["vbi"].get(key, 0)), styles["ind_td"]),
            p_d_cell,
            p_s_cell,
        ])
        if i % 2 == 0:
            det_style2.append(("BACKGROUND", (0,i),(-1,i), C_GRIS))
    det_tbl2 = Table(det_rows2, colWidths=ind_cols2, repeatRows=1)
    det_tbl2.setStyle(TableStyle(det_style2))
    story.append(det_tbl2)
    story.append(Spacer(1, 0.4*cm))

    total_data = [
        [Paragraph("", styles["body"]),
         Paragraph("Dayana Mola", styles["body_b"]),
         Paragraph("Stacy Cepeda", styles["body_b"])],
        [Paragraph("TOTAL A PAGAR JUNIO 2026", styles["body_b"]),
         Paragraph(fmt_usd(rd["total"]), ParagraphStyle("td2",parent=styles["kpi_big"],fontSize=13)),
         Paragraph(fmt_usd(rs["total"]), ParagraphStyle("ts2",parent=styles["kpi_big"],fontSize=13))],
        [Paragraph("Fotos pendiente (pot. adicional)", styles["muted"]),
         Paragraph(fmt_usd(rd["vbi"]["fotos"]), styles["muted"]),
         Paragraph(fmt_usd(rs["vbi"]["fotos"]), styles["muted"])],
    ]
    total_tbl = Table(total_data, colWidths=[W*.40, W*.30, W*.30])
    total_tbl.setStyle(TableStyle([
        ("BOX",         (0,0),(-1,-1), 1.0, C_TEAL),
        ("BACKGROUND",  (0,0),(-1,-1), C_TEAL_LIGHT),
        ("TOPPADDING",  (0,0),(-1,-1), 8),("BOTTOMPADDING",(0,0),(-1,-1),8),
        ("LEFTPADDING", (0,0),(-1,-1), 10),("RIGHTPADDING",(0,0),(-1,-1),10),
        ("ALIGN",       (1,0),(2,-1),  "CENTER"),
    ]))
    story.append(total_tbl)
    doc.build(story)

# ── CSVs DE AUDITORÍA ─────────────────────────────────────────────────────────
def write_csv_consolidado(resultados, out):
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["nombre","rol","alcance","venta_bruta","venta_neta","devol","pct_devol",
                    "cuota_total","pct_cum","maestro_tot","sin_compra","pct_cero","pct_ef",
                    "p_ppto","p_ef","p_cafe","p_jet","p_cremas","p_nuevos","p_cero","p_devol",
                    "p_tikys","p_choc","p_gall","p_bebidas","p_ne","total"])
        for r in resultados:
            w.writerow([r["nombre"],r["rol"],r["alcance"],
                        f"{r['venta_bruta']:.2f}",f"{r['venta_neta']:.2f}",
                        f"{r['devol']:.2f}",f"{r['pct_devol']:.2f}",
                        f"{r['cuota_total']:.2f}",f"{r['pct_cum']:.2f}",
                        r["maestro_tot"],r["sin_compra"],f"{r['pct_cero']:.2f}",
                        f"{r['pct_ef']:.2f}",
                        f"{r['p_ppto']:.2f}",f"{r['p_ef']:.2f}",f"{r['p_cafe']:.2f}",
                        f"{r['p_jet']:.2f}",f"{r['p_cremas']:.2f}",f"{r['p_nuevos']:.2f}",
                        f"{r['p_cero']:.2f}",f"{r['p_devol']:.2f}",f"{r['p_tikys']:.2f}",
                        f"{r['p_choc']:.2f}",f"{r['p_gall']:.2f}",
                        f"{r['p_bebidas']:.2f}",f"{r['p_ne']:.2f}",f"{r['total']:.2f}"])

def write_csv_auditoria(resultados, out):
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["supervisora","alcance","indicador","vbi","resultado","meta","pago","observacion"])
        for r in resultados:
            vbi = r["vbi"]
            rows = [
                ("Presupuesto Total negocio", vbi["ppto"],
                 f"{r['pct_cum']:.1f}%", "Escala presupuesto", f"{r['p_ppto']:.2f}", ""),
                ("Efectividad de visitas", vbi["ef"],
                 f"{r['pct_ef']:.1f}%", "≥90%→110% escalonada", f"{r['p_ef']:.2f}", ""),
                ("DN Café Molido Sello Rojo", vbi["cafe"],
                 f"{r['pct_cafe']:.1f}% ({r['imp_cafe']}/{r['mae_cafe']})",
                 f"≥{META_DN_CAFE_PCT:.0f}%", f"{r['p_cafe']:.2f}", ""),
                ("DN Jet", vbi["jet"],
                 f"{r['pct_jet']:.1f}% ({r['imp_jet']}/{r['uni_jet']})",
                 f"≥{META_DN_JET_PCT:.0f}%", f"{r['p_jet']:.2f}", ""),
                ("DN Galletas Cremas ×6", vbi["cremas"],
                 f"{r['pct_cremas']:.1f}% ({r['n_cremas']}/{r['uni_cremas']})",
                 f"≥{META_DN_CREMAS_PCT:.0f}%", f"{r['p_cremas']:.2f}", "Refs CREMA negocio Galletas"),
                ("Clientes nuevos con pedido", vbi["nuevos"],
                 f"{'Cumple' if r['cumple_nuevos'] else 'No cumple'}",
                 "Todos ≥10", f"{r['p_nuevos']:.2f}", "Regla estricta por vendedor"),
                ("Cliente cero", vbi["cero"],
                 f"{r['pct_cero']:.1f}% ({r['sin_compra']}/{r['maestro_tot']})",
                 f"≤{META_CERO_PCT:.0f}%", f"{r['p_cero']:.2f}", ""),
                ("Devolución ≤5%", vbi["devol"],
                 f"{r['pct_devol']:.1f}%", f"≤{META_DEVOL_PCT:.0f}%", f"{r['p_devol']:.2f}", ""),
                ("DN Tikys", vbi["tikys"],
                 f"{r['pct_tikys']:.1f}% ({r['imp_tikys']}/{r['uni_tikys']})",
                 f"≥{META_DN_TIKYS_PCT:.0f}%", f"{r['p_tikys']:.2f}", ""),
                ("Fotos", vbi["fotos"], "Sin fuente", "—", "0.00", "Pendiente"),
                ("Ej. Chocolates", vbi["choc"],
                 f"{r['pct_choc']:.1f}%", "Escala presupuesto", f"{r['p_choc']:.2f}", ""),
                ("Ej. Galletas", vbi["gall"],
                 f"{r['pct_gall']:.1f}%", "Escala presupuesto", f"{r['p_gall']:.2f}", ""),
                ("Ej. Bebidas TMLUC", vbi["bebidas"],
                 f"{r['pct_bebidas']:.1f}%", "Escala presupuesto", f"{r['p_bebidas']:.2f}", "negocio 10-TMLUC"),
                ("Nutrición Experta", vbi["ne"],
                 f"{r['pct_ne']:.1f}%", "Escala presupuesto", f"{r['p_ne']:.2f}", ""),
            ]
            for ind, vb, res, meta, pago, obs in rows:
                w.writerow([r["nombre"], r["alcance"], ind, vb, res, meta, pago, obs])

def write_csv_clientes_nuevos(resultados, out):
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["supervisora","alcance","cod_vendedor","vendedor",
                    "clientes_nuevos","meta","cumple","impacto_indicador"])
        for r in resultados:
            for cod, d in sorted(r["nuevos_detalle"].items()):
                w.writerow([r["nombre"], r["alcance"], cod, d["nombre"],
                             d["n"], META_NUEVOS_POR_VEND,
                             "SI" if d["cumple"] else "NO",
                             "OK" if d["cumple"] else "Bloquea pago supervisora"])

def write_csv_negocios(resultados, out):
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["supervisora","alcance","negocio","venta_neta","meta",
                    "cumplimiento_pct","vbi","pago","observacion"])
        for r in resultados:
            negs = [
                ("Chocolates",    r["venta_choc"],   r["meta_choc"],   r["pct_choc"],   "choc",    ""),
                ("Galletas",      r["venta_gall"],   r["meta_gall"],   r["pct_gall"],   "gall",    ""),
                ("Bebidas TMLUC", r["venta_bebidas"],r["meta_bebidas"],r["pct_bebidas"],"bebidas","negocio 10-TMLUC"),
                ("NE indicador",  r["venta_ne"],     r["meta_ne"],     r["pct_ne"],     "ne",      ""),
                ("Café",          r["venta_cafe_n"], 0,                0,               "—",       "VBI $0 informativo"),
                ("Cárnico",       r["venta_carn"],   0,                0,               "—",       "VBI $0 informativo"),
            ]
            for neg, venta, meta, pct, key, obs in negs:
                pago = r.get(f"p_{key}", 0.0) if key != "—" else 0.0
                vbi_v = r["vbi"].get(key, 0) if key != "—" else 0
                w.writerow([r["nombre"], r["alcance"], neg,
                             f"{venta:.2f}", f"{meta:.2f}",
                             f"{pct:.1f}", f"{vbi_v:.2f}", f"{pago:.2f}", obs])

def write_csv_dn(resultados, out):
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["supervisora","alcance","indicador","impactados","universo",
                    "dn_pct","meta_pct","cumple","vbi","pago"])
        for r in resultados:
            dns = [
                ("DN Café Sello Rojo", r["imp_cafe"],  r["mae_cafe"],  r["pct_cafe"],  META_DN_CAFE_PCT,  "cafe"),
                ("DN Jet",             r["imp_jet"],   r["uni_jet"],   r["pct_jet"],   META_DN_JET_PCT,   "jet"),
                ("DN Galletas Cremas", r["n_cremas"],  r["uni_cremas"],r["pct_cremas"],META_DN_CREMAS_PCT,"cremas"),
                ("DN Tikys",           r["imp_tikys"], r["uni_tikys"], r["pct_tikys"], META_DN_TIKYS_PCT,  "tikys"),
            ]
            for ind, imp, uni, pct, meta_p, key in dns:
                cumple = "SI" if pct >= meta_p else "NO"
                pago   = r.get(f"p_{key}", 0.0)
                vbi_v  = r["vbi"].get(key, 0)
                w.writerow([r["nombre"], r["alcance"], ind,
                             imp, uni, f"{pct:.1f}", f"{meta_p:.0f}",
                             cumple, f"{vbi_v:.2f}", f"{pago:.2f}"])

def write_csv_devolucion(resultados, out):
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["supervisora","alcance","venta_bruta","devolucion_total",
                    "pct_devolucion","meta_pct","cumple","vbi","pago"])
        for r in resultados:
            cumple = "SI" if r["pct_devol"] <= META_DEVOL_PCT else "NO"
            w.writerow([r["nombre"], r["alcance"],
                         f"{r['venta_bruta']:.2f}", f"{r['devol']:.2f}",
                         f"{r['pct_devol']:.2f}", f"{META_DEVOL_PCT:.0f}",
                         cumple, f"{r['vbi']['devol']:.2f}", f"{r['p_devol']:.2f}"])

# ── MAIN ──────────────────────────────────────────────────────────────────────
def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print(f"\n{'='*65}")
    print(f"  LIQUIDACIÓN SUPERVISORAS — {PERIODO_LABEL.upper()}")
    print(f"  PALUMAR S.A. — v1.0")
    print(f"{'='*65}\n")

    # 1. Fetch data
    print("1. Obteniendo datos desde API PALMA...")
    vendedores_data = fetch("vendedores")
    cuotas_raw      = fetch("cuotas")
    cn_data         = fetch("clientes_nuevos",
                            {"desde": "2026-06-01", "hasta": "2026-06-30"})
    cob_neg_raw     = fetch("cob_negocio")
    marcas_raw      = fetch("cobertura_marcas")

    if isinstance(vendedores_data, dict):
        vendedores_data = vendedores_data.get("data", [])
    cuotas_list = cuotas_raw if isinstance(cuotas_raw, list) else cuotas_raw.get("data", [])

    print(f"\n   Vendedores: {len(vendedores_data)}  Cuotas: {len(cuotas_list)}")

    # Normalizar cod en vendedores
    for v in vendedores_data:
        v["cod"] = str(v["cod"]).zfill(3)

    # cafe_map: from cob_negocio
    cafe_map = {}
    cob_neg_list = cob_neg_raw if isinstance(cob_neg_raw, list) else cob_neg_raw.get("data", [])
    for row in cob_neg_list:
        neg = str(row.get("negocio", "")).lower()
        vt  = str(row.get("vendedor", ""))
        cod = vt.split("-")[0].strip().zfill(3)
        if "caf" in neg:
            cafe_map[cod] = row

    # marcas_por_vend
    marcas_por_vend = {}
    _ml = (marcas_raw.get("vendedores", []) if isinstance(marcas_raw, dict)
           else marcas_raw if isinstance(marcas_raw, list) else [])
    for _mv in _ml:
        _cod = str(_mv.get("cod", "")).zfill(3)
        marcas_por_vend[_cod] = {}
        for _m in _mv.get("marcas", []):
            marcas_por_vend[_cod][str(_m.get("marca", "")).upper()] = _m

    # nuevos_map
    cn_detalle = cn_data.get("detalle", []) if isinstance(cn_data, dict) else []
    nuevos_map = Counter(str(c.get("cod_asesor", "")).zfill(3) for c in cn_detalle)
    print(f"   Clientes nuevos: {sum(nuevos_map.values())} registros")

    # venta_neg_map
    venta_neg_map = {}
    for v in vendedores_data:
        cod = str(v["cod"]).zfill(3)
        venta_neg_map[cod] = {r["negocio"]: r.get("venta", 0)
                               for r in v.get("venta_por_negocio", [])}

    # Fetch DN Cremas
    print("\n2. Obteniendo DN Galletas Cremas (14 llamadas API)...")
    cremas_pv = fetch_cremas_por_vend(vendedores_data)

    # All vendor codes
    all_codes = {str(v["cod"]).zfill(3) for v in vendedores_data}
    chiriqui_codes = all_codes - CENTRALES_CODES

    print(f"\n   Equipo CENTRALES: {sorted(CENTRALES_CODES)}")
    print(f"   Equipo CHIRIQUI:  {sorted(chiriqui_codes)}")

    # 2. Calcular supervisoras
    print("\n3. Calculando indicadores supervisoras...")
    r_dayana = calcular_supervisor(
        "Dayana Mola", "Supervisora Centrales", "Equipo Centrales",
        VBI_D, CENTRALES_CODES,
        vendedores_data, cuotas_list, cafe_map, {},
        marcas_por_vend, nuevos_map, cremas_pv, venta_neg_map,
    )
    r_stacy = calcular_supervisor(
        "Stacy Cepeda", "Líder de ventas Total Palumar", "Total Palumar",
        VBI_S, all_codes,
        vendedores_data, cuotas_list, cafe_map, {},
        marcas_por_vend, nuevos_map, cremas_pv, venta_neg_map,
    )
    resultados = [r_dayana, r_stacy]

    for r in resultados:
        print(f"\n  {r['nombre']} ({r['alcance']})")
        print(f"    Venta Neta: {fmt_usd(r['venta_neta'])}  Meta: {fmt_usd(r['cuota_total'])}  %Cum: {fmt_pct(r['pct_cum'])}")
        print(f"    Efectividad: {fmt_pct(r['pct_ef'])}  Cliente cero: {fmt_pct(r['pct_cero'])}  Devol: {fmt_pct(r['pct_devol'])}")
        print(f"    DN Café: {fmt_pct(r['pct_cafe'])}  DN Jet: {fmt_pct(r['pct_jet'])}  DN Cremas: {fmt_pct(r['pct_cremas'])}  DN Tikys: {fmt_pct(r['pct_tikys'])}")
        print(f"    Nuevos todos cumplen: {r['cumple_nuevos']}")
        print(f"    TOTAL: {fmt_usd(r['total'])}")

    # 3. Generar PDFs individuales
    print("\n4. Generando PDFs individuales...")
    styles = make_styles()

    pdf_dayana = os.path.join(OUTPUT_DIR, "PDF_DAYANA_MOLA_SUPERVISORA_CENTRALES_JUNIO_2026.pdf")
    build_pdf_supervisora(r_dayana, styles, pdf_dayana)
    print(f"   ✓ {os.path.basename(pdf_dayana)}")

    pdf_stacy = os.path.join(OUTPUT_DIR, "PDF_STACY_CEPEDA_LIDER_VENTAS_TOTAL_PALUMAR_JUNIO_2026.pdf")
    build_pdf_supervisora(r_stacy, styles, pdf_stacy)
    print(f"   ✓ {os.path.basename(pdf_stacy)}")

    # 4. Consolidado
    print("\n5. Generando PDF consolidado...")
    pdf_consol = os.path.join(OUTPUT_DIR, "CONSOLIDADO_SUPERVISORAS_JUNIO_2026.pdf")
    build_pdf_consolidado_sup(resultados, styles, pdf_consol)
    print(f"   ✓ {os.path.basename(pdf_consol)}")

    # 5. CSVs
    print("\n6. Generando CSVs de auditoría...")
    write_csv_consolidado(resultados,
        os.path.join(OUTPUT_DIR, "CONSOLIDADO_SUPERVISORAS_JUNIO_2026.csv"))
    print("   ✓ CONSOLIDADO_SUPERVISORAS_JUNIO_2026.csv")

    write_csv_auditoria(resultados,
        os.path.join(OUTPUT_DIR, "AUDITORIA_SUPERVISORAS_JUNIO_2026.csv"))
    print("   ✓ AUDITORIA_SUPERVISORAS_JUNIO_2026.csv")

    write_csv_clientes_nuevos(resultados,
        os.path.join(OUTPUT_DIR, "AUDITORIA_CLIENTES_NUEVOS_SUPERVISORAS_JUNIO_2026.csv"))
    print("   ✓ AUDITORIA_CLIENTES_NUEVOS_SUPERVISORAS_JUNIO_2026.csv")

    write_csv_negocios(resultados,
        os.path.join(OUTPUT_DIR, "AUDITORIA_NEGOCIOS_SUPERVISORAS_JUNIO_2026.csv"))
    print("   ✓ AUDITORIA_NEGOCIOS_SUPERVISORAS_JUNIO_2026.csv")

    write_csv_dn(resultados,
        os.path.join(OUTPUT_DIR, "AUDITORIA_DN_SUPERVISORAS_JUNIO_2026.csv"))
    print("   ✓ AUDITORIA_DN_SUPERVISORAS_JUNIO_2026.csv")

    write_csv_devolucion(resultados,
        os.path.join(OUTPUT_DIR, "AUDITORIA_DEVOLUCION_SUPERVISORAS_JUNIO_2026.csv"))
    print("   ✓ AUDITORIA_DEVOLUCION_SUPERVISORAS_JUNIO_2026.csv")

    # 6. Validaciones
    print("\n7. Validaciones...")
    assert any(not r["pct_cum"] < 0 for r in resultados), "pct_cum negativo"
    assert all(r["total"] >= 0 for r in resultados), "Pago negativo detectado"
    assert len(r_dayana["team_vend"]) == len(CENTRALES_CODES), "Error equipo Centrales"
    assert len(r_stacy["team_vend"]) == len(all_codes), "Error equipo Total Palumar"
    print(f"   ✓ Dayana cubre {len(r_dayana['team_vend'])} vendedores Centrales")
    print(f"   ✓ Stacy cubre {len(r_stacy['team_vend'])} vendedores Total Palumar")
    print(f"   ✓ Sin pagos negativos")
    print(f"   ✓ 2 PDFs individuales generados")
    print(f"   ✓ PDF consolidado generado")
    print(f"   ✓ 6 CSVs de auditoría generados")
    for r in resultados:
        nuevos_no = [f"{d['nombre']}:{d['n']}" for d in r["nuevos_detalle"].values() if not d["cumple"]]
        if nuevos_no:
            print(f"   ℹ {r['nombre']} — Nuevos no paga: {', '.join(nuevos_no)}")
        else:
            print(f"   ✓ {r['nombre']} — Todos los vendedores cumplen clientes nuevos")

    print(f"\n{'='*65}")
    print(f"  RESUMEN FINAL — SUPERVISORAS JUNIO 2026")
    print(f"{'='*65}")
    for r in resultados:
        print(f"\n  {r['nombre']} — {r['alcance']}")
        print(f"  {'─'*45}")
        vbi = r["vbi"]
        items = [
            ("Presupuesto (VBI ${:.0f})".format(vbi["ppto"]),    r["p_ppto"]),
            ("Efectividad (VBI ${:.0f})".format(vbi["ef"]),      r["p_ef"]),
            ("DN Café (VBI ${:.0f})".format(vbi["cafe"]),        r["p_cafe"]),
            ("DN Jet (VBI ${:.0f})".format(vbi["jet"]),          r["p_jet"]),
            ("DN Cremas (VBI ${:.0f})".format(vbi["cremas"]),    r["p_cremas"]),
            ("Clientes nuevos (VBI ${:.0f})".format(vbi["nuevos"]),r["p_nuevos"]),
            ("Cliente cero (VBI ${:.0f})".format(vbi["cero"]),   r["p_cero"]),
            ("Devolución (VBI ${:.0f})".format(vbi["devol"]),    r["p_devol"]),
            ("DN Tikys (VBI ${:.0f})".format(vbi["tikys"]),      r["p_tikys"]),
            ("Ej. Chocolates (VBI ${:.0f})".format(vbi["choc"]),  r["p_choc"]),
            ("Ej. Galletas (VBI ${:.0f})".format(vbi["gall"]),   r["p_gall"]),
            ("Ej. Bebidas TMLUC (VBI ${:.0f})".format(vbi["bebidas"]),r["p_bebidas"]),
            ("NE indicador (VBI ${:.0f})".format(vbi["ne"]),     r["p_ne"]),
        ]
        for label, pago in items:
            print(f"  {label:<42} {fmt_usd(pago):>8}")
        print(f"  {'─'*45}")
        print(f"  {'TOTAL GENERAL':42} {fmt_usd(r['total']):>8}")
        print(f"  Fotos pendiente (pot. adicional):          {fmt_usd(vbi['fotos']):>8}")
    print(f"\n{'='*65}\n")


if __name__ == "__main__":
    main()
