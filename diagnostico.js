// ══════════════════════════════════════════════════════════════════
// DIAGNÓSTICO GENERAL DE ESTRUCTURA DE GOOGLE SHEETS
// PALMA · Distribuciones Palumar S.A.
// ══════════════════════════════════════════════════════════════════

function diagnosticarEstructuraPALMA() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hojas = ss.getSheets();

  const nombreHojaSalida = 'DIAGNOSTICO_ESTRUCTURA';
  let salida = ss.getSheetByName(nombreHojaSalida);

  if (!salida) {
    salida = ss.insertSheet(nombreHojaSalida);
  } else {
    salida.clear();
  }

  const resultados = [];

  resultados.push([
    'Hoja',
    'Estado',
    'Filas',
    'Columnas',
    'Columna #',
    'Encabezado original',
    'Encabezado normalizado',
    'Muestra fila 2',
    'Muestra fila 3',
    'Muestra fila 4',
    'Tipo detectado',
    'Observaciones'
  ]);

  hojas.forEach(hoja => {
    const nombreHoja = hoja.getName();

    // Evitar diagnosticar la propia hoja de salida
    if (nombreHoja === nombreHojaSalida) return;

    const lastRow = hoja.getLastRow();
    const lastCol = hoja.getLastColumn();

    if (lastRow === 0 || lastCol === 0) {
      resultados.push([
        nombreHoja,
        'Vacía',
        lastRow,
        lastCol,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        'Hoja sin datos'
      ]);
      return;
    }

    const data = hoja.getRange(1, 1, Math.min(lastRow, 4), lastCol).getValues();
    const headers = data[0];

    headers.forEach((header, i) => {
      const muestra2 = data[1] ? data[1][i] : '';
      const muestra3 = data[2] ? data[2][i] : '';
      const muestra4 = data[3] ? data[3][i] : '';

      const tipo = detectarTipoDatoPALMA_(muestra2, muestra3, muestra4);
      const headerOriginal = String(header || '').trim();
      const headerNormalizado = normalizarHeaderPALMA_(headerOriginal);

      let obs = '';

      if (!headerOriginal) obs += 'Encabezado vacío. ';
      if (headerNormalizado.includes('vendedor') || headerNormalizado.includes('asesor')) obs += 'Posible campo de asesor/vendedor. ';
      if (headerNormalizado.includes('cliente')) obs += 'Posible campo de cliente. ';
      if (headerNormalizado.includes('devol')) obs += 'Posible campo de devolución. ';
      if (headerNormalizado.includes('venta') || headerNormalizado.includes('valor') || headerNormalizado.includes('vlr')) obs += 'Posible campo monetario. ';
      if (headerNormalizado.includes('fecha')) obs += 'Posible campo fecha. ';
      if (headerNormalizado.includes('negocio')) obs += 'Posible campo negocio/categoría. ';
      if (headerNormalizado.includes('sku') || headerNormalizado.includes('producto') || headerNormalizado.includes('material')) obs += 'Posible campo producto/SKU. ';

      resultados.push([
        nombreHoja,
        'Con datos',
        lastRow,
        lastCol,
        i + 1,
        headerOriginal,
        headerNormalizado,
        formatearMuestraPALMA_(muestra2),
        formatearMuestraPALMA_(muestra3),
        formatearMuestraPALMA_(muestra4),
        tipo,
        obs
      ]);
    });
  });

  salida.getRange(1, 1, resultados.length, resultados[0].length).setValues(resultados);

  // Formato visual
  salida.setFrozenRows(1);
  salida.autoResizeColumns(1, resultados[0].length);

  const headerRange = salida.getRange(1, 1, 1, resultados[0].length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#0B1628');
  headerRange.setFontColor('#FFFFFF');

  salida.getRange(1, 1, salida.getLastRow(), salida.getLastColumn()).createFilter();

  SpreadsheetApp.getUi().alert(
    '✅ Diagnóstico creado correctamente.\n\n' +
    'Revisa la hoja: ' + nombreHojaSalida
  );
}


// ── HELPERS DEL DIAGNÓSTICO ──────────────────────────────────────

function normalizarHeaderPALMA_(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function formatearMuestraPALMA_(valor) {
  if (valor instanceof Date) {
    return Utilities.formatDate(valor, 'America/Panama', 'yyyy-MM-dd');
  }

  if (valor === null || valor === undefined) return '';

  return String(valor);
}

function detectarTipoDatoPALMA_(v1, v2, v3) {
  const valores = [v1, v2, v3].filter(v => v !== '' && v !== null && v !== undefined);

  if (valores.length === 0) return 'Vacío';

  const todosFecha = valores.every(v => v instanceof Date);
  if (todosFecha) return 'Fecha';

  const todosNumero = valores.every(v => typeof v === 'number' && !isNaN(v));
  if (todosNumero) return 'Número';

  const algunosNegativos = valores.some(v => typeof v === 'number' && v < 0);
  if (algunosNegativos) return 'Número con negativos';

  const parecenCodigo = valores.every(v => {
    const s = String(v).trim();
    return /^[A-Z0-9\-]+$/i.test(s) && s.length <= 20;
  });

  if (parecenCodigo) return 'Código / ID';

  return 'Texto';
}