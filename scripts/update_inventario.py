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
    archivos = sorted(glob.glob(patron, recursive=False), key=os.path.getmtime, reverse=True)
    if not archivos:
        patron2 = os.path.expanduser('~/Downloads/*inventario*.xls*')
        archivos = sorted(glob.glob(patron2), key=os.path.getmtime, reverse=True)
    if not archivos:
        print("No se encontró ningún archivo INVENTARIO en ~/Downloads.")
        print("Uso: python3 scripts/update_inventario.py ruta/al/archivo.xlsx")
        sys.exit(1)
    excel_path = archivos[0]
    print(f"Archivo encontrado: {os.path.basename(excel_path)}")

if not os.path.exists(excel_path):
    print(f"Archivo no encontrado: {excel_path}")
    sys.exit(1)

# ── Configuración ─────────────────────────────────────────────────────────────
SHEETS = {
    'PANAMA':    'panama',
    'CENTRALES': 'centrales',
    'CHIRIQUI':  'chiriqui',
    'INV. FRIO': 'frio',
}

COL_MAP = {
    'Material':               'codigo',
    'Descripción Material':   'nombre',
    'UMB':                    'unidad',
    'Inv. Disponible':        'inv',
    'Venta Mes':              'venta_mes',
    'Stock En Pedido':        'pedido',
    'Cobertura Sin Transito': 'cobertura',
    'Buffer':                 'buffer',
    'Codigo de Barras':       'cod_barras',
    'ADU (Consumo Promedio)': 'adu',
    'Inv. TLA':               'inv_tla',
    'Proveedor':              'proveedor',
    'UN X DISP.':             'un_x_disp',
}

# ── Extraer fecha del archivo ─────────────────────────────────────────────────
def extraer_fecha(path):
    nombre = os.path.basename(path)
    for part in nombre.split('_'):
        part = part.replace('-', '')
        if len(part) == 8 and part.isdigit():
            try:
                return datetime.strptime(part, '%Y%m%d').strftime('%Y-%m-%d')
            except ValueError:
                pass
    return datetime.today().strftime('%Y-%m-%d')

fecha = extraer_fecha(excel_path)

# ── Leer hojas ────────────────────────────────────────────────────────────────
xl = pd.ExcelFile(excel_path)
hojas_disponibles = xl.sheet_names
result = {'fecha': fecha}

for sheet, key in SHEETS.items():
    if sheet not in hojas_disponibles:
        print(f"  Hoja '{sheet}' no encontrada, se omite.")
        result[key] = []
        continue

    df_raw = pd.read_excel(excel_path, sheet_name=sheet, header=None)

    # Encontrar fila de encabezado (la que tiene 'Material')
    hdr_row = None
    for i, row in df_raw.iterrows():
        if 'Material' in row.values:
            hdr_row = i
            break

    if hdr_row is None:
        print(f"  Hoja '{sheet}': no se encontró encabezado, se omite.")
        result[key] = []
        continue

    df = pd.read_excel(excel_path, sheet_name=sheet, header=hdr_row)
    df = df.dropna(how='all')
    df = df[pd.to_numeric(df['Material'], errors='coerce').notna()]

    records = []
    for _, row in df.iterrows():
        rec = {}
        for col_orig, col_new in COL_MAP.items():
            val = row.get(col_orig, 0.0) if col_orig in df.columns else 0.0
            if pd.isna(val):
                val = 0.0
            elif isinstance(val, float):
                # venta_mes y adu vienen negativos como convención de salida
                if col_new in ('venta_mes', 'adu'):
                    val = round(abs(val), 6)
                else:
                    val = round(val, 6)
            rec[col_new] = val
        # Cobertura puede venir como string ("Sin Forecats") → 0
        if not isinstance(rec.get('cobertura'), (int, float)):
            rec['cobertura'] = 0.0
        records.append(rec)

    result[key] = records
    print(f"  {sheet}: {len(records)} productos")

# ── Guardar JSON ──────────────────────────────────────────────────────────────
script_dir = os.path.dirname(os.path.abspath(__file__))
output_path = os.path.join(script_dir, '..', 'api', 'inventario_data.json')
output_path = os.path.normpath(output_path)

with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print(f"\nJSON actualizado: {output_path}")
print(f"Fecha: {fecha}")
total = sum(len(v) for v in result.values() if isinstance(v, list))
print(f"Total productos: {total}")

# ── Git commit + push automático ─────────────────────────────────────────────
repo_dir = os.path.join(script_dir, '..')
print("\nSubiendo a Vercel...")
try:
    subprocess.check_call(['git', 'add', 'api/inventario_data.json'], cwd=repo_dir)
    subprocess.check_call(['git', 'commit', '-m', f'inventario: actualización {fecha}'], cwd=repo_dir)
    subprocess.check_call(['git', 'push'], cwd=repo_dir)
    print("Listo. Vercel desplegará en ~1 minuto.")
except subprocess.CalledProcessError as e:
    print(f"Error en git: {e}")
    print("Puedes hacer el push manualmente: git add api/inventario_data.json && git commit -m 'inventario' && git push")
