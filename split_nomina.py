#!/usr/bin/env python3
"""
Split Planilla_Junio_Q1_2026.pdf into individual desprendibles.
Pages 2-19 (0-indexed 1-18) → one PDF per employee.
Updates api/nomina_map.json with new hashes.
"""
import hashlib
import json
import shutil
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader, PdfWriter

# ── Paths ────────────────────────────────────────────────────────────────────
SOURCE = Path("/Users/alvaroarias/Downloads/Planilla_Junio _ Q2 2026.pdf")
OUT_DIR = Path("/Users/alvaroarias/Desktop/Proyectos/palma-dashboard/public/nomina")
MAP_FILE = Path("/Users/alvaroarias/Desktop/Proyectos/palma-dashboard/api/nomina_map.json")

# ── Mapping: page index (0-based) → (cedula, nombre) ────────────────────────
# Page 0 = planilla general (skip); pages 1-18 = individual desprendibles
PAGE_MAP = {
    1:  ("4-733-560",   "HEIDY JAQUELINE VEGA FUENTE"),
    2:  ("6-719-931",   "FRANCISCO ALEXANDER GARCIA CHAVEZ"),
    3:  ("9-734-1315",  "ALAY ENRIQUE WOODS RAMOS"),
    4:  ("2-714-338",   "ANAYS CASTILLO VALDERRAMA"),
    5:  ("E-8-169155",  "DAYANA MOLA RODRIGUEZ"),
    6:  ("7-709-1025",  "RAUL ANDRES CASTRO RUIZ"),
    7:  ("6-710-157",   "GRACIELA EDITH CASSINO GUTIERREZ"),
    8:  ("4-750-1559",  "JAIME ELIAS CASTILLO"),
    9:  ("4-792-486",   "RENE ISAIAS MUÑOZ"),
    10: ("4-286-176",   "ENRIQUE JIMENEZ"),
    11: ("4-250-622",   "ARIEL ANTONIO GONZALES"),
    12: ("1-704-922",   "HAYMETH DEL CARMEN LEWIS"),
    13: ("4-738-1986",  "JOHNNY GIOVANNI PITTY"),
    14: ("4-737-1965",  "GUSTAVO ABEL ROJAS FUENTES"),
    15: ("1-715-926",   "ISMALDO FREDDY GOMEZ DAVILA"),
    16: ("8-842-488",   "STACY ELIZABETH CEPEDA BEITIA"),
    17: ("4-742-656",   "YURITZA DAYANA MONTENEGRO"),
    18: ("2-715-1101",  "MELISSA ZULAY CASTILLO FUENTES"),
}

def md5_24(data: bytes) -> str:
    return hashlib.md5(data).hexdigest()[:24]

def main():
    reader = PdfReader(str(SOURCE))
    total_pages = len(reader.pages)
    print(f"PDF cargado: {total_pages} páginas")

    with open(MAP_FILE) as f:
        nmap = json.load(f)

    updated = []
    for idx, (cedula, nombre) in PAGE_MAP.items():
        if idx >= total_pages:
            print(f"  ⚠ Página {idx+1} fuera de rango — saltando {cedula}")
            continue

        writer = PdfWriter()
        writer.add_page(reader.pages[idx])

        buf = BytesIO()
        writer.write(buf)
        pdf_bytes = buf.getvalue()

        new_hash = md5_24(pdf_bytes)
        dest = OUT_DIR / f"{new_hash}.pdf"

        old_hash = nmap.get(cedula, {}).get("hash", "")
        old_path = OUT_DIR / f"{old_hash}.pdf" if old_hash else None

        dest.write_bytes(pdf_bytes)

        # Remove old file if it exists and hash changed
        if old_hash and old_hash != new_hash and old_path and old_path.exists():
            old_path.unlink()
            print(f"  🗑  Borrado PDF viejo: {old_hash}.pdf")

        nmap[cedula] = {"hash": new_hash, "nombre": nombre}
        updated.append((cedula, nombre, new_hash))
        print(f"  ✓ [{idx+1:2d}] {cedula:12s}  {nombre[:30]:30s}  → {new_hash}")

    with open(MAP_FILE, "w") as f:
        json.dump(nmap, f, indent=2, ensure_ascii=False)

    print(f"\nActualizados {len(updated)} desprendibles en nomina_map.json")

if __name__ == "__main__":
    main()
