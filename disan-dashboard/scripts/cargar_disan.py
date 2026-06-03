#!/usr/bin/env python3
"""
DISAN · Cargador de datos a Supabase
Distribuciones Santiago De Tunja S.A.S

Uso:
  python3 scripts/cargar_disan.py

Archivos necesarios (ajusta las rutas abajo):
  - VMXC CSV mensual
  - Devoluciones XLS (formato HTML de ECOM)
  - Maestro clientes XLS (opcional, para cobertura)
  - Efectividad XLS (opcional)
  - Cuotas CSV (opcional)
"""

import csv
import json
import math
import os
import re
import sys
import requests
from collections import defaultdict
from datetime import date, datetime
from html.parser import HTMLParser

# ── CONFIGURACIÓN ────────────────────────────────────────────────────
SUPABASE_URL = 'https://kgkrxlbkjbcqukyipblr.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtna3J4bGJramJjcXVreWlwYmxyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDQ0NjcwOCwiZXhwIjoyMDk2MDIyNzA4fQ.LdjzhTpfIOKWOOeYblgjGWq0c2MEzqfrWGr8dgOFnv4'

# ── ARCHIVOS DE ENTRADA ───────────────────────────────────────────────
# Ajusta estas rutas cada mes
VMXC_CSV        = os.path.expanduser('~/Downloads/ventaxproductoxcli202606020.09743700.csv')
DEVOLUCIONES_XLS = os.path.expanduser('~/Downloads/devolucion202606021780437858.xls')
MAESTRO_XLS     = ''   # ruta al maestro de clientes (opcional)
EFECTIVIDAD_XLS = ''   # ruta al archivo de efectividad (opcional)
CUOTAS_CSV      = ''   # ruta al CSV de cuotas (opcional)

FECHA_VMXC = '2026-05-31'   # fecha del archivo VMXC
PERIODO    = '2026-05'

# ── COLUMNAS VMXC ────────────────────────────────────────────────────
COL_CLI   = 0
COL_ASESOR= 1
COL_NOM   = 3
COL_SKU   = 10
COL_NOMPROD=11
COL_CANTPED=13
COL_CANTDEV=14
COL_CANTNETA=15
COL_VALOR =18
COL_MARCA =21
COL_CAT   =25
COL_NEG   =27
COL_VEND  =28
COL_CIUDAD=29

# ── HELPERS ───────────────────────────────────────────────────────────
def r2(n):
    try: return round(float(n or 0), 2)
    except: return 0.0

def cod_asesor(v):
    return str(v or '').split('-')[0].strip()

BODEGAS = {'BOD100','BODEGA100','BODEGA'}
def es_valido(cod, nombre=''):
    c = re.sub(r'[-_\s]','', str(cod or '').upper())
    n = re.sub(r'[-_\s]','', str(nombre or '').upper())
    return c not in BODEGAS and n not in BODEGAS

def iso_week(fecha_str):
    d = datetime.strptime(fecha_str, '%Y-%m-%d').date()
    return d.isocalendar()[1]

# ── PARSER HTML/XLS ──────────────────────────────────────────────────
class HTMLTableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows, self.cur_row, self.cur_cell, self.in_cell = [], [], '', False
    def handle_starttag(self, tag, attrs):
        if tag == 'tr': self.cur_row = []
        elif tag in ('td','th'): self.in_cell = True; self.cur_cell = ''
    def handle_endtag(self, tag):
        if tag == 'tr':
            if self.cur_row: self.rows.append(self.cur_row[:])
        elif tag in ('td','th'):
            self.in_cell = False
            self.cur_row.append(self.cur_cell.strip())
    def handle_data(self, data):
        if self.in_cell: self.cur_cell += data

def parse_xls(path):
    with open(path, encoding='latin-1') as f:
        content = f.read()
    p = HTMLTableParser()
    p.feed(content)
    return p.rows  # rows[0] = headers, rows[1:] = data

# ── PROCESAR VMXC ────────────────────────────────────────────────────
def procesar_vmxc():
    print(f'📂 Leyendo VMXC: {VMXC_CSV}')
    semana = iso_week(FECHA_VMXC)
    mes    = int(PERIODO.split('-')[1])
    anio   = int(PERIODO.split('-')[0])

    ventas_vend  = defaultdict(lambda: {
        'nombre':'', 'venta_neta':0.0, 'venta_pos':0.0,
        'clientes':set(), 'negocios':defaultdict(float),
        'skus':defaultdict(lambda:{'nombre':'','negocio':'','venta':0.0,'clientes':set()})
    })
    marcas_map   = defaultdict(lambda: {'negocio':'','venta':0.0,'clientes':set()})
    tendencia    = defaultdict(lambda: {'venta':0.0,'clientes':set()})
    clientes_imp = set()
    skus_activos = set()
    venta_neta_total = 0.0
    neg_map = defaultdict(float)

    total = descartadas = 0
    with open(VMXC_CSV, encoding='latin-1') as f:
        reader = csv.reader(f)
        next(reader)
        for r in reader:
            if len(r) < 30: descartadas += 1; continue
            total += 1

            cod_cli  = r[COL_CLI].strip()
            asesor   = r[COL_ASESOR].strip()
            vendedor = r[COL_VEND].strip()
            cod_sku  = r[COL_SKU].strip()
            cod      = cod_asesor(asesor)

            if not es_valido(cod, vendedor): descartadas += 1; continue
            if not cod_cli or cod_cli == '0' or not cod_sku: descartadas += 1; continue

            try:
                cant_neta = float(r[COL_CANTNETA] or 0)
                valor     = float(r[COL_VALOR] or 0)
            except: descartadas += 1; continue

            if cant_neta == 0 and valor == 0: descartadas += 1; continue

            negocio = r[COL_NEG].strip()
            marca   = r[COL_MARCA].strip()

            venta_neta_total += valor
            if valor > 0:
                clientes_imp.add(cod_cli)
            if cant_neta > 0:
                skus_activos.add(cod_sku)

            neg_map[negocio] += valor

            # Por vendedor
            v = ventas_vend[cod]
            v['nombre'] = vendedor
            v['venta_neta'] += valor
            if valor > 0:
                v['venta_pos'] += valor
                v['clientes'].add(cod_cli)
                v['negocios'][negocio] += valor
            s = v['skus'][cod_sku]
            s['nombre']  = r[COL_NOMPROD].strip()
            s['negocio'] = negocio
            s['venta']  += valor
            s['clientes'].add(cod_cli)

            # Marcas
            if marca and valor > 0:
                marcas_map[marca]['negocio'] = negocio
                marcas_map[marca]['venta']  += valor
                marcas_map[marca]['clientes'].add(cod_cli)

            # Tendencia
            tendencia[semana]['venta']   += valor if valor > 0 else 0
            tendencia[semana]['clientes'].add(cod_cli)

    print(f'   {total:,} filas · {descartadas:,} descartadas · {len(ventas_vend)} vendedores')

    # ── Resumen global ────────────────────────────────────────────────
    venta_por_neg = sorted(
        [{'negocio':k,'venta':r2(v)} for k,v in neg_map.items()],
        key=lambda x: -x['venta']
    )
    resumen = {
        'periodo': PERIODO,
        'venta_bruta': r2(venta_neta_total),
        'venta_total': r2(venta_neta_total),
        'venta_real':  r2(venta_neta_total),
        'venta_neta':  r2(venta_neta_total),
        'vta_mas_itmbs': r2(venta_neta_total),
        'venta_vmx_neta': r2(venta_neta_total),
        'devolucion_total': 0, 'averia_total': 0, 'descuento_total': 0,
        'pct_devolucion': 0, 'pct_averia': 0, 'pct_descuento_total': 0,
        'clientes_impactados': len(clientes_imp),
        'clientes_maestro': 0,
        'cobertura_pct': 0,
        'skus_activos': len(skus_activos),
        'ticket_promedio': r2(venta_neta_total / len(clientes_imp)) if clientes_imp else 0,
        'efectividad_pct': 0,
        'cuota_total': 0,
        'pct_cumplimiento_equipo': 0,
        'venta_por_negocio': venta_por_neg,
        'venta_positiva_por_negocio': venta_por_neg,
    }

    # ── Vendedores ────────────────────────────────────────────────────
    vendedores = []
    for cod, v in ventas_vend.items():
        if not es_valido(cod, v['nombre']): continue
        vbn = sorted([{'negocio':n,'venta':r2(val)} for n,val in v['negocios'].items()], key=lambda x:-x['venta'])
        top_skus = sorted(
            [{'sku':s,'nombre':d['nombre'],'negocio':d['negocio'],'venta':r2(d['venta']),'clientes':len(d['clientes'])}
             for s,d in v['skus'].items() if d['venta'] > 0],
            key=lambda x:-x['venta']
        )[:5]
        vn = r2(v['venta_neta'])
        vendedores.append({
            'cod': cod, 'nombre': v['nombre'],
            'venta_bruta': vn, 'venta_total': vn, 'venta_real': vn,
            'venta_neta': vn, 'vta_mas_itmbs': vn,
            'devolucion_total': 0, 'averia_total': 0, 'descuento_total': 0,
            'pct_devolucion': 0, 'pct_averia': 0,
            'clientes_imp': len(v['clientes']),
            'maestro': 0, 'cobertura': 0, 'sin_compra': 0,
            'efectividad': 0,
            'ticket': r2(vn / len(v['clientes'])) if v['clientes'] else 0,
            'cuota': 0, 'pct_cumplimiento': 0,
            'venta_por_negocio': vbn,
            'top_skus': top_skus,
        })
    vendedores.sort(key=lambda x: -x['venta_bruta'])

    # ── Top SKUs global ───────────────────────────────────────────────
    skus_global = defaultdict(lambda: {'nombre':'','negocio':'','marca':'','venta':0.0,'clientes':set(),'unidades':0.0})
    skus_por_vend = defaultdict(lambda: defaultdict(lambda: {'nombre':'','negocio':'','venta':0.0,'clientes':set()}))
    with open(VMXC_CSV, encoding='latin-1') as f:
        reader = csv.reader(f)
        next(reader)
        for r in reader:
            if len(r) < 30: continue
            valor = float(r[COL_VALOR] or 0) if r[COL_VALOR] else 0
            if valor <= 0: continue
            cod = cod_asesor(r[COL_ASESOR].strip())
            if not es_valido(cod, r[COL_VEND].strip()): continue
            sku = r[COL_SKU].strip()
            if not sku: continue
            sg = skus_global[sku]
            sg['nombre']  = r[COL_NOMPROD].strip()
            sg['negocio'] = r[COL_NEG].strip()
            sg['marca']   = r[COL_MARCA].strip()
            sg['venta']  += valor
            sg['clientes'].add(r[COL_CLI].strip())
            try: sg['unidades'] += float(r[COL_CANTNETA] or 0)
            except: pass
            sv = skus_por_vend[cod][sku]
            sv['nombre']  = r[COL_NOMPROD].strip()
            sv['negocio'] = r[COL_NEG].strip()
            sv['venta']  += valor
            sv['clientes'].add(r[COL_CLI].strip())

    global_skus = sorted(
        [{'sku':s,'nombre':d['nombre'],'negocio':d['negocio'],'marca':d['marca'],
          'venta':r2(d['venta']),'clientes':len(d['clientes']),'unidades':int(d['unidades'])}
         for s,d in skus_global.items()],
        key=lambda x: -x['venta']
    )[:20]

    por_vend_skus = [
        {'cod': cod, 'skus': sorted(
            [{'sku':s,'nombre':d['nombre'],'negocio':d['negocio'],
              'venta':r2(d['venta']),'clientes':len(d['clientes'])}
             for s,d in skus.items()],
            key=lambda x:-x['venta']
        )[:5]}
        for cod, skus in skus_por_vend.items()
    ]

    # ── Marcas ────────────────────────────────────────────────────────
    total_marcas = sum(d['venta'] for d in marcas_map.values())
    marcas = sorted(
        [{'marca':m,'negocio':d['negocio'],'venta':r2(d['venta']),
          'clientes':len(d['clientes']),
          'pct': r2(d['venta']/total_marcas*100) if total_marcas else 0}
         for m,d in marcas_map.items()],
        key=lambda x: -x['venta']
    )[:15]

    # ── Tendencia ─────────────────────────────────────────────────────
    tend = sorted(
        [{'semana':s,'venta':r2(d['venta']),'clientes':len(d['clientes']),
          'pedidos':0,'ticket':r2(d['venta']/len(d['clientes'])) if d['clientes'] else 0,
          'periodo':PERIODO}
         for s,d in tendencia.items()],
        key=lambda x: x['semana']
    )

    return resumen, vendedores, {'global':global_skus,'por_vendedor':por_vend_skus}, marcas, tend

# ── PROCESAR DEVOLUCIONES ────────────────────────────────────────────
def procesar_devoluciones():
    if not DEVOLUCIONES_XLS or not os.path.exists(DEVOLUCIONES_XLS):
        print('⚠️  Sin archivo de devoluciones')
        return {'total':0,'por_concepto':[],'por_vendedor':[],'detalle':[]}

    print(f'📂 Leyendo devoluciones: {DEVOLUCIONES_XLS}')
    rows = parse_xls(DEVOLUCIONES_XLS)
    if len(rows) < 2: return {'total':0,'por_concepto':[],'por_vendedor':[],'detalle':[]}

    concepto_map = defaultdict(float)
    vendedor_map = defaultdict(float)
    detalle      = []
    total        = 0.0

    for row in rows[1:]:
        if len(row) < 12: continue
        cod_sku    = row[0].strip()
        nom_prod   = row[1].strip()
        cantidad   = float(row[2] or 0) if row[2] else 0
        costo      = float(row[3].replace(',','') or 0) if row[3] else 0
        concepto   = row[4].strip()
        factura    = row[5].strip()
        cod_cli    = row[6].strip()
        nom_cli    = row[7].strip()
        cod_as     = row[8].strip()
        vendedor   = row[9].strip()
        tipo_prod  = row[10].strip()
        vlr        = float(row[11].replace(',','') or 0) if row[11] else 0

        cod = cod_asesor(cod_as)
        if not es_valido(cod, vendedor): continue
        if not cod_cli or not cod_sku: continue

        total += vlr
        nombre_vend = f'{cod_as} - {vendedor}'
        concepto_map[concepto]    += vlr
        vendedor_map[nombre_vend] += vlr

        detalle.append({
            'periodo_mes': PERIODO,
            'cod_asesor': cod_as, 'nom_vendedor': vendedor,
            'vendedor': nombre_vend,
            'cod_cliente': cod_cli, 'nom_cliente': nom_cli,
            'factura': factura, 'cod_sku': cod_sku, 'nom_producto': nom_prod,
            'cantidad': cantidad, 'costo_unitario': r2(costo),
            'vlr_devolucion': r2(vlr), 'concepto': concepto, 'tipo_producto': tipo_prod
        })

    print(f'   {len(detalle)} registros · ${total:,.0f}')
    return {
        'total': r2(total),
        'por_concepto': sorted([{'concepto':k,'monto':r2(v)} for k,v in concepto_map.items()], key=lambda x:-x['monto']),
        'por_vendedor': sorted([{'vendedor':k,'monto':r2(v)} for k,v in vendedor_map.items()], key=lambda x:-x['monto']),
        'detalle': sorted(detalle, key=lambda x:-x['vlr_devolucion'])[:300]
    }

# ── PROCESAR CUOTAS ──────────────────────────────────────────────────
def procesar_cuotas():
    if not CUOTAS_CSV or not os.path.exists(CUOTAS_CSV):
        return []
    print(f'📂 Leyendo cuotas: {CUOTAS_CSV}')
    cuotas = []
    with open(CUOTAS_CSV, encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader)
        for row in reader:
            if len(row) < 2: continue
            asesor = row[0].strip()
            cuota  = float(str(row[1]).replace(',','') or 0)
            if asesor:
                cuotas.append({'cod': cod_asesor(asesor), 'asesor': asesor, 'cuota': r2(cuota)})
    return cuotas

# ── SUBIR A SUPABASE ─────────────────────────────────────────────────
def upsert(sheet, data):
    url  = f'{SUPABASE_URL}/rest/v1/cache_api'
    hdrs = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
    }
    payload = {'sheet': sheet, 'data': data, 'updated_at': datetime.utcnow().isoformat()}
    r = requests.post(url, headers=hdrs, json=payload)
    if r.status_code in (200, 201):
        print(f'   ✅ {sheet}')
    else:
        print(f'   ❌ {sheet}: {r.status_code} {r.text[:200]}')

# ── MAIN ─────────────────────────────────────────────────────────────
def main():
    print('=' * 55)
    print('  DISAN · Cargador Supabase')
    print(f'  Período: {PERIODO}')
    print('=' * 55)

    # Procesar archivos
    resumen, vendedores, skus, marcas, tendencia = procesar_vmxc()
    devoluciones = procesar_devoluciones()
    cuotas       = procesar_cuotas()

    # Ajustar resumen con devoluciones
    dev_total = devoluciones['total']
    resumen['devolucion_total']    = dev_total
    resumen['descuento_total']     = dev_total
    vb = resumen['venta_bruta']
    resumen['pct_devolucion']      = r2(dev_total/vb*100) if vb else 0
    resumen['pct_descuento_total'] = r2(dev_total/vb*100) if vb else 0

    # Ajustar vendedores con devoluciones
    dev_por_vend = {d['vendedor'].split(' - ')[0].strip(): d['monto']
                    for d in devoluciones['por_vendedor']}
    for v in vendedores:
        devol = dev_por_vend.get(v['cod'], 0)
        v['devolucion_total']  = r2(devol)
        v['descuento_total']   = r2(devol)
        vb_v = v['venta_bruta']
        v['pct_devolucion']    = r2(devol/vb_v*100) if vb_v else 0

    # Ajustar cuotas
    if cuotas:
        cuota_map = {c['cod']: c['cuota'] for c in cuotas}
        total_cuota = sum(c['cuota'] for c in cuotas)
        resumen['cuota_total'] = r2(total_cuota)
        resumen['pct_cumplimiento_equipo'] = r2(resumen['venta_bruta']/total_cuota*100) if total_cuota else 0
        for v in vendedores:
            cuota = cuota_map.get(v['cod'], 0)
            v['cuota'] = r2(cuota)
            v['pct_cumplimiento'] = r2(v['venta_bruta']/cuota*100) if cuota else 0

    # Subir todo
    print('\n📤 Subiendo a Supabase...')
    upsert('resumen',      resumen)
    upsert('vendedores',   vendedores)
    upsert('skus',         skus)
    upsert('marcas',       marcas)
    upsert('tendencia',    tendencia)
    upsert('devoluciones', devoluciones)
    upsert('cuotas',       cuotas)
    upsert('cobertura',    [])
    upsert('cob_negocio',  [])
    upsert('clientes_cero',{'total':0,'por_vendedor':[],'detalle':[]})
    upsert('clientes_nuevos',{'total':0,'por_vendedor':[],'por_mes':[],'detalle':[]})
    upsert('cartera',      {'total_pendiente':0,'total_facturas':0,'por_vendedor':[],'por_tramo':[],'top_clientes':[],'detalle':[]})

    print('\n✅ Carga completa')
    print(f'   Vendedores: {len(vendedores)}')
    print(f'   Devoluciones: ${devoluciones["total"]:,.0f}')
    print(f'   Venta bruta: ${resumen["venta_bruta"]:,.0f}')

if __name__ == '__main__':
    main()
