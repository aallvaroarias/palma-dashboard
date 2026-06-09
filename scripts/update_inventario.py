#!/usr/bin/env python3
"""
Actualiza api/inventario_data.json a partir del Excel de inventario.

Uso:
  python3 scripts/update_inventario.py                      # busca el más reciente en ~/Downloads
  python3 scripts/update_inventario.py ruta/al/archivo.xlsx # archivo específico
"""

import sys, os, json, glob, subprocess
from datetime import datetime

try:
    import pandas as pd
except ImportError:
    print("Instalando pandas...")
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'pandas', 'openpyxl', '-q'])
    import pandas as pd

# ── Localizar el archivo ──────────────────────────────────────────────────────
if len(sys.argv) > 1:
    excel_path = sys.argv[1]
else:
    patron = os.path.expanduser('~/Downloads/*INVENTARIO*.XLS*')
    archivos = sorted(glob.glob(patron), key=os.path.getmtime, reverse=True)
    if not archivos:
        patron2 = os.path.expanduser('~/Downloads/*inventario*.xls*')
        archivos = sorted(glob.glob(patron2), key=os.path.getmtime, reverse=True)
    if not archivos:
        print("❌  No se encontró ningún archivo INVENTARIO en ~/Downloads.")
        print("    Descárgalo primero o pasa la ruta como argumento.")
        sys.exit(1)
    excel_path = archivos[0]
    print(f"📂  Archivo: {os.path.basename(excel_path)}")

if not os.path.exists(excel_path):
    print(f"❌  Archivo no encontrado: {excel_path}")
    sys.exit(1)

# ── Helpers ───────────────────────────────────────────────────────────────────
def safe_float(v, default=None):
    try:
        f = float(v)
        return None if (f != f) else round(abs(f), 4)
    except Exception:
        return default

def safe_str(v):
    s = str(v).strip() if pd.notna(v) else ''
    return '' if s == 'nan' else s

# ── Leer hojas de secos ───────────────────────────────────────────────────────
def leer_secos(excel, sheet):
    df = pd.read_excel(excel, sheet_name=sheet, header=None)
    # Fecha en fila 2 (índice 2), columna 2
    fecha_raw = df.iloc[2][2]
    if isinstance(fecha_raw, datetime):
        fecha = fecha_raw.strftime('%Y-%m-%d')
    else:
        fecha = str(fecha_raw)[:10]

    productos = []
    for _, r in df.iloc[5:].iterrows():
        cod = safe_str(r[0])
        if not cod or cod in ('nan', 'Material', ''):
            continue
        productos.append({
            'codigo':    cod,
            'nombre':    safe_str(r[1]),
            'unidad':    safe_float(r[2], 1),
            'inv':       safe_float(r[3], 0),
            'venta_mes': safe_float(r[4], 0),
            'pedido':    safe_float(r[5], 0),
            'cobertura': safe_float(r[6], 0),
            'buffer':    safe_float(r[7], 0),
            'cod_barras':safe_float(r[8]),
            'inv_tla':   safe_float(r[10], 0),
            'proveedor': safe_str(r[11]),
        })
    return fecha, productos

# ── Leer hoja de frío ─────────────────────────────────────────────────────────
def leer_frio(excel):
    df = pd.read_excel(excel, sheet_name='INV. FRIO', header=None)
    productos = []
    for _, r in df.iloc[5:].iterrows():
        linea = safe_str(r[0])
        cod   = safe_str(r[1])
        if not cod or cod in ('nan', 'Material', ''):
            continue
        productos.append({
            'linea':         linea,
            'codigo':        cod,
            'nombre':        safe_str(r[2]),
            'forecast':      safe_float(r[3], 0),
            'venta_mes':     safe_float(r[4], 0),
            'cumplimiento':  safe_float(r[5], 0),
            'inv_centrales': safe_float(r[6], 0),
            'inv_chiriqui':  safe_float(r[7], 0),
            'inv_planta':    safe_float(r[8], 0),
            'inv_br24':      safe_float(r[9], 0),
            'transito_br21': safe_float(r[10], 0),
            'cod_barras':    safe_float(r[11]),
            'estatus':       safe_str(r[12]),
        })
    return productos

# ── Procesar ──────────────────────────────────────────────────────────────────
xl = pd.ExcelFile(excel_path)
hojas = xl.sheet_names

fecha_c, centrales = leer_secos(excel_path, 'CENTRALES') if 'CENTRALES' in hojas else ('', [])
fecha_q, chiriqui  = leer_secos(excel_path, 'CHIRIQUI')  if 'CHIRIQUI'  in hojas else ('', [])
frio               = leer_frio(excel_path)               if 'INV. FRIO' in hojas else []
fecha = fecha_c or fecha_q

data = {
    'fecha':     fecha,
    'centrales': centrales,
    'chiriqui':  chiriqui,
    'frio':      frio,
}

# ── Guardar JSON ──────────────────────────────────────────────────────────────
script_dir  = os.path.dirname(os.path.abspath(__file__))
repo_dir    = os.path.normpath(os.path.join(script_dir, '..'))
output_path = os.path.join(repo_dir, 'api', 'inventario_data.json')

with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"✅  JSON generado — Corte: {fecha}")
print(f"    Centrales: {len(centrales)} | Chiriquí: {len(chiriqui)} | Frío: {len(frio)}")

# ── Deploy a Vercel ───────────────────────────────────────────────────────────
print("\n🚀  Desplegando a Vercel...")
try:
    result = subprocess.run(
        ['npx', 'vercel', '--prod', '--yes'],
        cwd=repo_dir,
        capture_output=False
    )
    if result.returncode == 0:
        print("\n✅  ¡Inventario actualizado en el dashboard!")
    else:
        raise Exception("vercel retornó error")
except Exception:
    print("⚠️   Deploy via Vercel CLI falló. Intentando con git push...")
    try:
        subprocess.check_call(['git', 'add', 'api/inventario_data.json'], cwd=repo_dir)
        subprocess.check_call(['git', 'commit', '-m', f'inventario: {fecha}'], cwd=repo_dir)
        subprocess.check_call(['git', 'push'], cwd=repo_dir)
        print("✅  Subido via git push. Vercel desplegará en ~1 minuto.")
    except Exception as e:
        print(f"❌  Error: {e}")
        print("    Corre manualmente: npx vercel --prod --yes")
