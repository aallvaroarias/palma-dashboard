#!/usr/bin/env python3
"""
Genera los archivos de auditoría de universos de clientes PALMA.

Requiere que la versión actualizada de Código.js esté desplegada en Apps Script
y accesible vía el endpoint /api/datos?sheet=auditoria_universos_clientes.

Produce en auditoria_universos_clientes/:
  - AUDITORIA_UNIVERSOS_CLIENTES.md    — reporte ejecutivo con tabla de fuentes
  - CLIENTES_2670_NO_EN_2608.csv       — asesores sin ventas en BASE_ACUMULADA
  - CLIENTES_EXCLUIDOS_POR_FILTRO.csv  — todos los excluidos con motivo
  - DUPLICADOS_CLIENTES.csv            — códigos de cliente que aparecen >1 vez
  - CLIENTES_BODEGA.csv               — clientes asignados a asesor BODEGA
  - CLIENTES_SIN_ASESOR.csv           — clientes estado='A' sin asesor asignado
  - CLIENTES_COD_NO_3DIGITS.csv       — clientes cuyo asesor no tiene código de 3 dígitos
"""

import csv
import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime

# ── Configuración ────────────────────────────────────────────────────────────

PROXY_URL    = "https://palma-dashboard.vercel.app/api/datos?sheet=auditoria_universos_clientes"
DIRECTO_URL  = (
    "https://script.google.com/macros/s/"
    "AKfycbwRPhHFwnBnTadtIuH3FHapuwVjzXJr5suo-KlWxr-ReoA44VtAt1pZsf_TF2a1KIfK"
    "/exec?sheet=auditoria_universos_clientes"
)
OUTPUT_DIR   = os.path.join(os.path.dirname(__file__), "auditoria_universos_clientes")
TIMEOUT_SECS = 30

# ── Helpers ──────────────────────────────────────────────────────────────────

def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECS) as r:
        return json.loads(r.read().decode())


def write_csv(path: str, fieldnames: list, rows: list):
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    print(f"  ✓ {os.path.basename(path)} ({len(rows)} filas)")


def fmt_n(n) -> str:
    return f"{int(n):,}".replace(",", ".")


# ── Fetch ────────────────────────────────────────────────────────────────────

def fetch_auditoria() -> dict:
    for label, url in [("Vercel proxy", PROXY_URL), ("Apps Script directo", DIRECTO_URL)]:
        try:
            print(f"Consultando {label}...")
            payload = fetch_json(url)
            if not payload.get("ok"):
                wrapped = payload.get("data", payload)
                if isinstance(wrapped, dict) and wrapped.get("ok"):
                    return wrapped
                raise ValueError(f"Respuesta no ok: {payload}")
            # El proxy envuelve en {"ok":true,"data":{...}}
            data = payload.get("data", payload)
            if isinstance(data, dict) and "universos" in data:
                return data
            if "universos" in payload:
                return payload
            raise ValueError("Estructura inesperada")
        except Exception as e:
            print(f"  ✗ {label}: {e}")
    sys.exit("No se pudo obtener datos del endpoint. ¿Está desplegado el script?")


# ── Generadores ───────────────────────────────────────────────────────────────

def generar_md(auditoria: dict, output_dir: str):
    u  = auditoria["universos"]
    d  = auditoria["diferencias"]
    c  = auditoria["conteos"]
    ts = auditoria.get("fecha_auditoria", datetime.now().isoformat())[:10]

    maestro_a     = u["maestro_estado_A"]
    sin_bodega    = u["maestro_sin_bodega"]
    calc_cob_sum  = u["maestro_calc_cob_sum"]
    calc_cob_uniq = u["maestro_calc_cobertura"]
    resumen       = u["resumen_cobertura_total"]

    lines = [
        f"# Auditoría de Universos de Clientes PALMA",
        f"",
        f"**Fecha:** {ts}  ",
        f"**Propósito:** Explicar los tres denominadores distintos que aparecen en el dashboard (2 608 / 2 670 / ~2 674).",
        f"",
        f"> ⚠️ Documento de solo lectura. No se modificó ninguna hoja ni fórmula.",
        f"",
        f"---",
        f"",
        f"## 1. Resumen de universos",
        f"",
        f"| Fuente / Función | Universo | Filtros aplicados | Excluidos vs universo anterior |",
        f"|---|---:|---|---:|",
        f"| **MAESTRO_CLIENTES total** (filas) | {fmt_n(u['maestro_filas_total'])} | Ninguno | — |",
        f"| **MAESTRO estado='A'** (`setEstadoA`) | {fmt_n(maestro_a)} | `estado = 'A'` + `codCli` válido | — |",
        f"| **`cargarMaestroActivos_()`** ≈ 2 670 | {fmt_n(sin_bodega)} | + excluye asesores BODEGA/BOD100 | {fmt_n(d['estado_A_vs_sin_bodega'])} clientes BODEGA |",
        f"| **`calcularCobertura()`** (unique) ≈ 2 608 | {fmt_n(calc_cob_uniq)} | + asesor con cod 3 dígitos + en BASE_ACUMULADA | {fmt_n(d['sin_bodega_vs_calc_cob'])} clientes sin ventas período |",
        f"| **`calcularCobertura()`** (suma por vendedor) | {fmt_n(calc_cob_sum)} | Ídem anterior, suma de Sets por asesor | {fmt_n(d['calc_cob_sum_vs_unique'])} duplicados multi-asesor |",
        f"| **RESUMEN_COBERTURA** (precalculado) | {fmt_n(resumen)} | Último valor escrito por `calcularCobertura()` | — |",
        f"",
        f"---",
        f"",
        f"## 2. Explicación de cada diferencia",
        f"",
        f"### 2.1  ~2 674 → 2 670 ({fmt_n(d['estado_A_vs_sin_bodega'])} clientes excluidos)",
        f"",
        f"`cargarMaestroActivos_()` excluye a los clientes cuyo asesor es BODEGA o BOD100.",
        f"Estos {fmt_n(d['estado_A_vs_sin_bodega'])} clientes están en MAESTRO con `estado='A'` pero asignados a un depósito interno,",
        f"no a un vendedor de campo, por lo que no deben contar en la cobertura comercial.",
        f"",
        f"**Archivo:** `CLIENTES_BODEGA.csv` ({fmt_n(c['bodega'])} filas)",
        f"",
        f"### 2.2  2 670 → 2 608 ({fmt_n(d['sin_bodega_vs_calc_cob'])} clientes excluidos)",
        f"",
        f"`calcularCobertura()` aplica un filtro extra: el asesor asignado debe tener **al menos una fila**",
        f"en `BASE_ACUMULADA` durante el período de corte. Los {fmt_n(d['sin_bodega_vs_calc_cob'])} clientes excluidos",
        f"están asignados a asesores que no cargaron datos en el mes calculado.",
        f"",
        f"Desglose:",
        f"- **{fmt_n(c['asesor_sin_ventas_base'])}** clientes: asesor no aparece en BASE_ACUMULADA (período actual)",
        f"- **{fmt_n(c['cod_asesor_no_3digits'])}** clientes: código de asesor no tiene exactamente 3 dígitos",
        f"- **{fmt_n(c['sin_asesor'])}** clientes: estado='A' sin asesor asignado (incluidos en 2 670 pero no en 2 608)",
        f"",
        f"**Archivos:** `CLIENTES_2670_NO_EN_2608.csv`, `CLIENTES_SIN_ASESOR.csv`, `CLIENTES_COD_NO_3DIGITS.csv`",
        f"",
        f"### 2.3  Diferencia suma vs únicos ({fmt_n(d['calc_cob_sum_vs_unique'])} clientes)",
        f"",
        f"`calcularCobertura()` acumula clientes por asesor en `ruteroMap[cod]`.",
        f"Si un cliente aparece asignado a dos asesores válidos, se cuenta dos veces en `totM`.",
        f"La diferencia de {fmt_n(d['calc_cob_sum_vs_unique'])} indica exactamente cuántos clientes tienen ese solapamiento.",
        f"",
        f"---",
        f"",
        f"## 3. Diagnóstico de integridad",
        f"",
        f"| Condición | Cantidad |",
        f"|---|---:|",
        f"| Clientes asignados a BODEGA/BOD100 | {fmt_n(c['bodega'])} |",
        f"| Clientes sin asesor asignado | {fmt_n(c['sin_asesor'])} |",
        f"| Clientes con código de asesor ≠ 3 dígitos | {fmt_n(c['cod_asesor_no_3digits'])} |",
        f"| Clientes con asesor sin ventas en período | {fmt_n(c['asesor_sin_ventas_base'])} |",
        f"| Códigos de cliente duplicados en MAESTRO | {fmt_n(c['duplicados'])} |",
        f"| Asesores distintos con ventas en BASE | {fmt_n(c['asesores_en_base'])} |",
        f"",
        f"---",
        f"",
        f"## 4. Recomendaciones",
        f"",
        f"| # | Hallazgo | Recomendación | Impacto |",
        f"|---|---|---|---|",
        f"| 1 | El dashboard muestra **2 608** en Cobertura General y **2 670** en Cobertura Producto Clave | Elegir **un solo denominador** para toda la pantalla principal — se recomienda **2 670** (base estable, sin depender de si el asesor cargó datos ese mes) | Coherencia visual |",
        f"| 2 | {fmt_n(d['sin_bodega_vs_calc_cob'])} clientes desaparecen del denominador si su asesor no carga en BASE_ACUMULADA | Validar si esto es intencional (excluir asesores inactivos) o si debería usar el universo fijo de MAESTRO | Exactitud de cobertura |",
        f"| 3 | {fmt_n(c['bodega'])} clientes asignados a BODEGA | Reasignar a asesor de campo o marcar como `estado='B'` si ya no son clientes activos | Limpieza de MAESTRO |",
        f"| 4 | {fmt_n(c['duplicados'])} duplicados en MAESTRO | Revisar y eliminar duplicados — un cliente con dos filas puede inflar el universo | Integridad de datos |",
        f"",
        f"---",
        f"",
        f"*Generado por `generar_auditoria_universos.py` · Solo lectura · Sin cambios en producción*",
    ]

    path = os.path.join(output_dir, "AUDITORIA_UNIVERSOS_CLIENTES.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"  ✓ AUDITORIA_UNIVERSOS_CLIENTES.md")


def generar_csvs(auditoria: dict, output_dir: str):
    det = auditoria["detalle"]

    # CLIENTES_2670_NO_EN_2608: sin_codsValidos + cod_no_3digits
    rows_2670_no_2608 = (
        [{"razon": "Asesor sin ventas en BASE_ACUMULADA", **r} for r in det["sin_codsValidos"]] +
        [{"razon": "Código asesor no tiene 3 dígitos",    **r} for r in det["cod_no_3digits"]]
    )
    write_csv(
        os.path.join(output_dir, "CLIENTES_2670_NO_EN_2608.csv"),
        ["cod_cliente", "nombre", "asesor", "cod_asesor", "razon"],
        rows_2670_no_2608,
    )

    # CLIENTES_EXCLUIDOS_POR_FILTRO (todos los excluidos de 2,608)
    excluidos = (
        [{"razon": "Asesor BODEGA/BOD100",                **r} for r in det["bodega"]] +
        [{"razon": "Sin asesor asignado",                  **r} for r in det["sin_asesor"]] +
        [{"razon": "Código asesor no tiene 3 dígitos",    **r} for r in det["cod_no_3digits"]] +
        [{"razon": "Asesor sin ventas en BASE_ACUMULADA", **r} for r in det["sin_codsValidos"]]
    )
    write_csv(
        os.path.join(output_dir, "CLIENTES_EXCLUIDOS_POR_FILTRO.csv"),
        ["cod_cliente", "nombre", "asesor", "cod_asesor", "razon"],
        excluidos,
    )

    # DUPLICADOS_CLIENTES
    write_csv(
        os.path.join(output_dir, "DUPLICADOS_CLIENTES.csv"),
        ["cod_cliente", "apariciones"],
        det["duplicados"],
    )

    # CLIENTES_BODEGA
    write_csv(
        os.path.join(output_dir, "CLIENTES_BODEGA.csv"),
        ["cod_cliente", "nombre", "asesor", "cod_asesor"],
        det["bodega"],
    )

    # CLIENTES_SIN_ASESOR
    write_csv(
        os.path.join(output_dir, "CLIENTES_SIN_ASESOR.csv"),
        ["cod_cliente", "nombre"],
        det["sin_asesor"],
    )

    # CLIENTES_COD_NO_3DIGITS
    write_csv(
        os.path.join(output_dir, "CLIENTES_COD_NO_3DIGITS.csv"),
        ["cod_cliente", "nombre", "asesor", "cod_asesor"],
        det["cod_no_3digits"],
    )

    # Guardar JSON crudo para trazabilidad
    raw_path = os.path.join(output_dir, "auditoria_raw.json")
    with open(raw_path, "w", encoding="utf-8") as f:
        json.dump(auditoria, f, ensure_ascii=False, indent=2)
    print(f"  ✓ auditoria_raw.json (datos completos del endpoint)")


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("=" * 60)
    print("Auditoría de Universos de Clientes PALMA")
    print("=" * 60)

    auditoria = fetch_auditoria()

    u = auditoria["universos"]
    d = auditoria["diferencias"]
    print()
    print(f"  MAESTRO total filas:         {fmt_n(u['maestro_filas_total'])}")
    print(f"  MAESTRO estado='A':          {fmt_n(u['maestro_estado_A'])}")
    print(f"  cargarMaestroActivos_ (B):   {fmt_n(u['maestro_sin_bodega'])}")
    print(f"  calcularCobertura (unique):  {fmt_n(u['maestro_calc_cobertura'])}")
    print(f"  calcularCobertura (sum):     {fmt_n(u['maestro_calc_cob_sum'])}")
    print(f"  RESUMEN_COBERTURA (escrito): {fmt_n(u['resumen_cobertura_total'])}")
    print()
    print(f"  Diferencia A vs B (BODEGA):  {fmt_n(d['estado_A_vs_sin_bodega'])}")
    print(f"  Diferencia B vs 2608:        {fmt_n(d['sin_bodega_vs_calc_cob'])}")
    print()
    print("Generando archivos...")
    print()

    generar_md(auditoria, OUTPUT_DIR)
    generar_csvs(auditoria, OUTPUT_DIR)

    print()
    print(f"Archivos en: {OUTPUT_DIR}")
    print("=" * 60)


if __name__ == "__main__":
    main()
