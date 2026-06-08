#!/bin/bash
# ══════════════════════════════════════════════════
#  Actualizar Inventario — Distribuciones Palumar
#  Doble clic para ejecutar
# ══════════════════════════════════════════════════
cd "$(dirname "$0")"

echo ""
echo "═══════════════════════════════════════"
echo "  PALMA · Actualización de Inventario"
echo "═══════════════════════════════════════"
echo ""
echo "📂  Buscando el Excel más reciente en ~/Downloads..."
echo ""

python3 scripts/update_inventario.py

if [ $? -eq 0 ]; then
  echo ""
  echo "✅  ¡Inventario actualizado en el dashboard!"
else
  echo ""
  echo "❌  Algo falló. Revisa que el archivo INVENTARIO esté en ~/Downloads."
fi

echo ""
read -p "Presiona Enter para cerrar..."
