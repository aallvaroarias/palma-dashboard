#!/usr/bin/env python3
"""
Convierte el Excel de inventario al JSON que consume el dashboard.
Uso: python3 actualizar_inventario.py [ruta_excel]
Si no se pasa ruta, busca el archivo más reciente con "INVENTARIO" en ~/Downloads.
"""

import sys, os, json, glob
from datetime import datetime
import pandas as pd

DASHBOARD = os.path.dirname(os.path.abspath(__file__))
OUT_PATH  = os.path.join(DASHBOARD, 'api', 'inventario_data.json')

def find_excel():
    patron = os.path.expanduser('~/Downloads/*INVENTARIO*.XLS*')
    archivos = glob.glob(patron, recursive=False)
    if not archivos:
        patron2 = os.path.expanduser('~/Downloads/*inventario*.xls*')
        archivos = glob.glob(patron2, recursive=False)
    if not archivos:
        sys.exit('❌  No se encontró ningún archivo INVENTARIO en ~/Downloads.\n'
                 '    Descárgalo primero o pasa la ruta como argumento.')
    return max(archivos, key=os.path.getmtime)

def safe_float(v, default=None):
    try:
        f = float(v)
        return None if (f != f) else round(f, 4)   # NaN → None
    except Exception:
        return default

def safe_str(v):
    return str(v).strip() if pd.notna(v) else ''

def leer_secos(xl, sheet):
    df = pd.read_excel(xl, sheet_name=sheet, header=None)
    # Fecha en fila 2, col 2
    fecha_raw = df.iloc[2][2]
    fecha = fecha_raw.strftime('%Y-%m-%d') if isinstance(fecha_raw, datetime) else str(fecha_raw)[:10]
    # Datos desde fila 5 (índice 5)
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

def leer_frio(xl):
    df = pd.read_excel(xl, sheet_name='INV. FRIO', header=None)
    productos = []
    for _, r in df.iloc[5:].iterrows():
        linea = safe_str(r[0])
        cod   = safe_str(r[1])
        if not cod or cod in ('nan', 'Material', ''):
            continue
        productos.append({
            'linea':        linea,
            'codigo':       cod,
            'nombre':       safe_str(r[2]),
            'forecast':     safe_float(r[3], 0),
            'venta_mes':    safe_float(r[4], 0),
            'cumplimiento': safe_float(r[5], 0),
            'inv_centrales':safe_float(r[6], 0),
            'inv_chiriqui': safe_float(r[7], 0),
            'inv_planta':   safe_float(r[8], 0),
            'inv_br24':     safe_float(r[9], 0),
            'transito_br21':safe_float(r[10], 0),
            'cod_barras':   safe_float(r[11]),
            'estatus':      safe_str(r[12]),
        })
    return productos

def main():
    excel = sys.argv[1] if len(sys.argv) > 1 else find_excel()
    print(f'📂  Leyendo: {os.path.basename(excel)}')

    fecha_c, centrales = leer_secos(excel, 'CENTRALES')
    fecha_q, chiriqui  = leer_secos(excel, 'CHIRIQUI')
    frio               = leer_frio(excel)
    fecha = fecha_c or fecha_q

    data = {
        'fecha':     fecha,
        'centrales': centrales,
        'chiriqui':  chiriqui,
        'frio':      frio,
    }

    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f'✅  JSON generado: {len(centrales)} secos Centrales · '
          f'{len(chiriqui)} secos Chiriquí · {len(frio)} frío')
    print(f'    Corte: {fecha}')
    print(f'    → {OUT_PATH}')

if __name__ == '__main__':
    main()
