// ╔══════════════════════════════════════════════════════════════════╗
// ║  PALMA · Script Completo · Google Apps Script                   ║
// ║  Distribuciones Palumar S.A.                                    ║
// ║  Incluye: API endpoint + Menú de actualización + Cuotas         ║
// ╚══════════════════════════════════════════════════════════════════╝

// ════════════════════════════════════════════════════════════════════
// MENÚ PALMA
// ════════════════════════════════════════════════════════════════════

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🌴 PALMA')
    .addItem('⚡ ACTUALIZAR TODO',             'actualizarTodo')
    .addItem('🧹 Limpiar Todo',                'limpiarTodo')
    .addSeparator()
    .addItem('1. Cargar VMXC del día',         'cargarVMXC')
    .addSeparator()
    .addItem('2. Cobertura real',              'calcularCobertura')
    .addItem('3. Cobertura por negocio',       'calcularCoberturaNegocio')
    .addItem('4. Clientes cero',               'calcularClientesCero')
    .addItem('5. Procesar devoluciones',       'procesarDevoluciones')
    .addItem('6. Procesar efectividad',        'procesarEfectividad')
    .addSeparator()
    .addItem('7. Validar clientes vs MAESTRO', 'validarMaestra')
    .addToUi();
}

// ── ACTUALIZAR TODO ───────────────────────────────────────────────
function actualizarTodo() {
  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert(
    '🌴 PALMA · Actualizar Todo',
    'Se ejecutarán en orden:\n\n' +
    '1. Limpiar base\n' +
    '2. Cargar VMXC\n' +
    '3. Cobertura real\n' +
    '4. Cobertura por negocio\n' +
    '5. Clientes cero\n' +
    '6. Devoluciones\n' +
    '7. Efectividad\n\n' +
    'Asegúrate de haber pegado el VMXC en CARGA_DIARIA\n' +
    'y de haber escrito la fecha en A1.\n\n' +
    '¿Continuar?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ss.toast('Limpiando base anterior...', 'PALMA', 10);
    _limpiarInterno(ss);

    ss.toast('Paso 1/6 — Cargando VMXC...', 'PALMA', 10);
    cargarVMXC(true);

    ss.toast('Paso 2/6 — Calculando cobertura real...', 'PALMA', 10);
    calcularCobertura();

    ss.toast('Paso 3/6 — Calculando cobertura por negocio...', 'PALMA', 10);
    calcularCoberturaNegocio();

    ss.toast('Paso 4/6 — Calculando clientes cero...', 'PALMA', 10);
    calcularClientesCero();

    const hDevRaw = ss.getSheetByName('DEVOLUCIONES_RAW');
    if (hDevRaw) {
      ss.toast('Paso 5/6 — Procesando devoluciones...', 'PALMA', 10);
      procesarDevoluciones();
    }

    const hEfRaw = ss.getSheetByName('EFECTIVIDAD_RAW');
    if (hEfRaw) {
      ss.toast('Paso 6/6 — Procesando efectividad...', 'PALMA', 10);
      procesarEfectividad();
    }

    ss.toast('✅ Todo actualizado correctamente', 'PALMA', 10);

  } catch (e) {
    SpreadsheetApp.getUi().alert('❌ Error durante la actualización', e.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

// ── LIMPIAR TODO ──────────────────────────────────────────────────
function limpiarTodo() {
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const ui  = SpreadsheetApp.getUi();
  const confirm = ui.alert(
    '🧹 Limpiar Todo',
    'Se limpiarán:\n\n' +
    '• BASE_ACUMULADA\n' +
    '• RESUMEN_COBERTURA\n' +
    '• COBERTURA_NEGOCIO\n' +
    '• CLIENTES_CERO\n' +
    '• DEVOLUCIONES\n' +
    '• EFECTIVIDAD\n' +
    '• EFECTIVIDAD_RESUMEN\n\n' +
    '¿Continuar?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;
  _limpiarInterno(ss);
  ui.alert('✅ Limpieza completada', 'Ya puedes pegar el VMXC y actualizar.', ui.ButtonSet.OK);
}

function _limpiarInterno(ss) {
  const hojas = [
    'RESUMEN_COBERTURA', 'COBERTURA_NEGOCIO', 'CLIENTES_CERO',
    'DEVOLUCIONES', 'EFECTIVIDAD', 'EFECTIVIDAD_RESUMEN'
  ];
  hojas.forEach(nombre => {
    const h = ss.getSheetByName(nombre);
    if (h && h.getLastRow() > 1) {
      h.getRange(2, 1, h.getLastRow() - 1, h.getLastColumn()).clearContent();
    }
  });
  const hB = ss.getSheetByName('BASE_ACUMULADA');
  if (hB && hB.getLastRow() > 1) {
    hB.getRange(2, 1, hB.getLastRow() - 1, hB.getLastColumn()).clearContent();
  }
}

// ── MAPEO COLUMNAS VMXC ───────────────────────────────────────────
const COL = {
  cod_cliente:   0,
  cod_asesor:    1,
  nom_cliente:   3,
  cod_sku:      10,
  nom_producto: 11,
  cant_pedido:  13,
  cant_devol:   14,
  cant_neta:    15,
  valor_venta:  18,
  marca:        21,
  categoria:    25,
  negocio:      27,
  vendedor:     28,
  ciudad:       29,
};

// ── CARGAR VMXC ───────────────────────────────────────────────────
function cargarVMXC(silencioso = false) {
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const hC  = ss.getSheetByName('CARGA_DIARIA');
  const hB  = ss.getSheetByName('BASE_ACUMULADA');
  const ui  = SpreadsheetApp.getUi();

  if (!hC) { ui.alert('ERROR', 'No existe CARGA_DIARIA.',   ui.ButtonSet.OK); return; }
  if (!hB) { ui.alert('ERROR', 'No existe BASE_ACUMULADA.', ui.ButtonSet.OK); return; }

  const fechaRaw     = hC.getRange('A1').getValue();
  if (!fechaRaw) { ui.alert('ERROR', 'Escribe la fecha en A1 de CARGA_DIARIA.', ui.ButtonSet.OK); return; }

  const fechaStr     = parsearFecha(fechaRaw);
  const periodoActual = fechaStr ? fechaStr.substring(0, 7) : '';
  if (!fechaStr) { ui.alert('ERROR', 'Formato de fecha incorrecto en A1.', ui.ButtonSet.OK); return; }

  if (!silencioso) {
    const confirm = ui.alert(
      '📋 Confirmar carga VMXC',
      `Período: ${periodoActual}\nFecha: ${fechaStr}\n\nSe reemplazará toda la BASE_ACUMULADA.\n\n¿Continuar?`,
      ui.ButtonSet.YES_NO
    );
    if (confirm !== ui.Button.YES) return;
  }

  if (hB.getLastRow() > 1) {
    hB.getRange(2, 1, hB.getLastRow() - 1, hB.getLastColumn()).clearContent();
  }

  const lastRowC = hC.getLastRow();
  if (lastRowC < 3) { ui.alert('Sin datos', 'Pega el VMXC en CARGA_DIARIA desde fila 3.', ui.ButtonSet.OK); return; }

  const dataCarga = hC.getRange(3, 1, lastRowC - 2, hC.getLastColumn()).getValues();
  const nuevas    = [];
  let descartadas = 0;

  for (let i = 0; i < dataCarga.length; i++) {
    const r           = dataCarga[i];
    const codCli      = String(r[COL.cod_cliente] || '').trim();
    const codSku      = String(r[COL.cod_sku]     || '').trim();
    const asesorRaw   = String(r[COL.cod_asesor]  || '').trim();
    const vendedorRaw = String(r[COL.vendedor]    || '').trim();
    const codAsesor   = obtenerCodAsesor_(asesorRaw);

    if (!esVendedorValido_(codAsesor, vendedorRaw || asesorRaw)) { descartadas++; continue; }
    if (!codCli || codCli === '0' || codCli.toLowerCase() === 'cliente' || !codSku) { descartadas++; continue; }

    const cantNeta = parseFloat(r[COL.cant_neta])   || 0;
    const valor    = parseFloat(r[COL.valor_venta]) || 0;
    if (cantNeta === 0 && valor === 0) { descartadas++; continue; }

    const fObj   = new Date(fechaStr + 'T00:00:00');
    const semana = getISOWeek(fObj);
    const mes    = fObj.getMonth() + 1;
    const anio   = fObj.getFullYear();

    nuevas.push([
      fechaStr,
      codCli,
      String(r[COL.nom_cliente]  || '').trim(),
      String(r[COL.cod_asesor]   || '').trim(),
      String(r[COL.vendedor]     || '').trim(),
      String(r[COL.ciudad]       || '').trim(),
      codSku,
      String(r[COL.nom_producto] || '').trim(),
      String(r[COL.negocio]      || '').trim(),
      String(r[COL.categoria]    || '').trim(),
      String(r[COL.marca]        || '').trim(),
      parseFloat(r[COL.cant_pedido]) || 0,
      parseFloat(r[COL.cant_devol])  || 0,
      cantNeta,
      valor,
      semana,
      mes,
      anio,
      periodoActual,
    ]);
  }

  if (nuevas.length > 0) {
    hB.getRange(hB.getLastRow() + 1, 1, nuevas.length, nuevas[0].length).setValues(nuevas);
  }

  if (!silencioso) {
    ui.alert('✅ Carga completada',
      `Período: ${periodoActual}\nFilas cargadas: ${nuevas.length}\nDescartadas: ${descartadas}`,
      ui.ButtonSet.OK);
  }
}

// ── COBERTURA REAL ────────────────────────────────────────────────
function calcularCobertura() {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const hB   = ss.getSheetByName('BASE_ACUMULADA');
  const hM   = ss.getSheetByName('MAESTRO_CLIENTES');
  const hRes = ss.getSheetByName('RESUMEN_COBERTURA');
  const ui   = SpreadsheetApp.getUi();

  if (!hB)   { ui.alert('ERROR', 'No existe BASE_ACUMULADA.',    ui.ButtonSet.OK); return; }
  if (!hM)   { ui.alert('ERROR', 'No existe MAESTRO_CLIENTES.',  ui.ButtonSet.OK); return; }
  if (!hRes) { ui.alert('ERROR', 'No existe RESUMEN_COBERTURA.', ui.ButtonSet.OK); return; }

  const rutData    = hM.getDataRange().getValues();
  const ruteroMap  = {};
  const vendNombre = {};

  const codsValidos = new Set();
  if (hB && hB.getLastRow() > 1) {
    hB.getRange(2, 4, hB.getLastRow() - 1, 1).getValues().forEach(r => {
      const asesorTxt = String(r[0] || '').trim();
      const cod = obtenerCodAsesor_(asesorTxt);
      if (!esVendedorValido_(cod, asesorTxt)) return;
      if (cod && /^\d{3}$/.test(cod)) codsValidos.add(cod);
    });
  }

  for (let i = 1; i < rutData.length; i++) {
    const cli    = String(rutData[i][0]  || '').trim();
    const usu    = String(rutData[i][20] || '').trim();
    const estado = String(rutData[i][19] || '').trim().toUpperCase();
    if (!usu || !cli || cli === '0') continue;
    if (estado && estado !== 'A') continue;
    const cod = obtenerCodAsesor_(usu);
    if (!esVendedorValido_(cod, usu)) continue;
    if (!cod || !/^\d{3}$/.test(cod)) continue;
    if (codsValidos.size > 0 && !codsValidos.has(cod)) continue;
    if (!ruteroMap[cod]) { ruteroMap[cod] = new Set(); vendNombre[cod] = usu; }
    ruteroMap[cod].add(cli);
  }

  const baseData    = hB.getDataRange().getValues();
  const periodos    = [...new Set(baseData.slice(1).map(r => {
    const v = r[18];
    return v instanceof Date
      ? `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}`
      : String(v||'').substring(0,7);
  }))].filter(Boolean).sort();
  if (!periodos.length) { ui.alert('Sin datos', 'BASE_ACUMULADA vacía.', ui.ButtonSet.OK); return; }
  const periodoCalc = periodos[periodos.length - 1];

  const impMap = {};
  for (let i = 1; i < baseData.length; i++) {
    const v = baseData[i][18];
    const p = v instanceof Date
      ? `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}`
      : String(v||'').substring(0,7);
    if (p !== periodoCalc) continue;
    if (!esFilaBaseValida_(baseData[i])) continue;
    const codV = obtenerCodAsesor_(baseData[i][3]);
    const codC = String(baseData[i][1]).trim();
    if (!codV || !codC) continue;
    if (!impMap[codV]) impMap[codV] = new Set();
    impMap[codV].add(codC);
  }

  hRes.clearContents();
  hRes.getRange(1,1,1,6).setValues([['Vendedor','Clientes Maestro','Impactados','Cobertura %','Sin Compra','Período']]);
  hRes.getRange(1,1,1,6).setBackground('#1D4ED8').setFontColor('#FFFFFF').setFontWeight('bold');

  const rows = [];
  let totM = 0, totI = 0;
  for (const [cod, maestroSet] of Object.entries(ruteroMap)) {
    const impSet     = impMap[cod] || new Set();
    const impactados = [...maestroSet].filter(c => impSet.has(c)).length;
    const cobertura  = parseFloat((impactados / maestroSet.size * 100).toFixed(1));
    rows.push([vendNombre[cod], maestroSet.size, impactados, cobertura, maestroSet.size - impactados, periodoCalc]);
    totM += maestroSet.size;
    totI += impactados;
  }
  rows.sort((a,b) => b[3] - a[3]);
  rows.push(['TOTAL EQUIPO', totM, totI, parseFloat((totI/totM*100).toFixed(1)), totM-totI, periodoCalc]);
  hRes.getRange(2,1,rows.length,6).setValues(rows);
}

// ── COBERTURA POR NEGOCIO ─────────────────────────────────────────
function calcularCoberturaNegocio() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hB = ss.getSheetByName('BASE_ACUMULADA');
  const hM = ss.getSheetByName('MAESTRO_CLIENTES');
  const ui = SpreadsheetApp.getUi();

  if (!hB || !hM) { ui.alert('ERROR', 'Faltan hojas.', ui.ButtonSet.OK); return; }

  let hCN = ss.getSheetByName('COBERTURA_NEGOCIO');
  if (!hCN) hCN = ss.insertSheet('COBERTURA_NEGOCIO');
  else hCN.clearContents();

  const baseData = hB.getDataRange().getValues().slice(1);
  let periodoCalc = '';
  baseData.forEach(r => {
    const v = r[18];
    const p = v instanceof Date
      ? `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}`
      : String(v||'').substring(0,7);
    if (p > periodoCalc) periodoCalc = p;
  });
  if (!periodoCalc) return;

  const vendMap = {};
  baseData.forEach(r => {
    if (!esFilaBaseValida_(r)) return;
    const asesor   = String(r[3] || '').trim();
    const vendedor = String(r[4] || '').trim();
    const cod      = obtenerCodAsesor_(asesor);
    if (!esVendedorValido_(cod, vendedor || asesor)) return;
    if (!cod || !/^\d{3}$/.test(cod)) return;
    if (!vendMap[cod]) vendMap[cod] = asesor;
  });
  const codsValidos = new Set(Object.keys(vendMap));

  const maestroData = hM.getDataRange().getValues();
  const maestroMap  = {};
  maestroData.slice(1).forEach(r => {
    const cli    = String(r[0]  || '').trim();
    const asesor = String(r[20] || '').trim();
    const estado = String(r[19] || '').trim().toUpperCase();
    if (!cli || !asesor || estado !== 'A') return;
    const cod = obtenerCodAsesor_(asesor);
    if (!esVendedorValido_(cod, asesor)) return;
    if (!cod || !codsValidos.has(cod)) return;
    if (!maestroMap[cod]) maestroMap[cod] = new Set();
    maestroMap[cod].add(cli);
  });

  const impMap  = {};
  const negocios = new Set();
  baseData.forEach(r => {
    const v = r[18];
    const p = v instanceof Date
      ? `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}`
      : String(v||'').substring(0,7);
    if (p !== periodoCalc) return;
    if (parseFloat(r[13]) <= 0) return;
    if (!esFilaBaseValida_(r)) return;
    const cod  = obtenerCodAsesor_(r[3]);
    const codC = String(r[1] || '').trim();
    const neg  = String(r[8] || '').trim();
    if (!cod || !codsValidos.has(cod)) return;
    negocios.add(neg);
    if (!impMap[cod])      impMap[cod]      = {};
    if (!impMap[cod][neg]) impMap[cod][neg] = new Set();
    impMap[cod][neg].add(codC);
  });

  const negList = [...negocios].sort();
  const rows    = [];
  for (const cod of [...codsValidos].sort()) {
    const maestroSet = maestroMap[cod] || new Set();
    if (!maestroSet.size) continue;
    for (const neg of negList) {
      const impSet   = (impMap[cod]?.[neg]) || new Set();
      const impCount = [...maestroSet].filter(c => impSet.has(c)).length;
      rows.push([vendMap[cod], neg, maestroSet.size, impCount, parseFloat((impCount/maestroSet.size*100).toFixed(1)), periodoCalc]);
    }
  }

  hCN.getRange(1,1,1,6).setValues([['Vendedor','Negocio','Clientes Maestro','Impactados','Cobertura %','Período']]);
  hCN.getRange(1,1,1,6).setBackground('#1D4ED8').setFontColor('#FFFFFF').setFontWeight('bold');
  if (rows.length) hCN.getRange(2,1,rows.length,6).setValues(rows);
}

// ── CLIENTES CERO ─────────────────────────────────────────────────
function calcularClientesCero() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hB = ss.getSheetByName('BASE_ACUMULADA');
  const hM = ss.getSheetByName('MAESTRO_CLIENTES');
  const ui = SpreadsheetApp.getUi();
  if (!hB || !hM) { ui.alert('ERROR','Faltan hojas.',ui.ButtonSet.OK); return; }

  let hCC = ss.getSheetByName('CLIENTES_CERO');
  if (!hCC) hCC = ss.insertSheet('CLIENTES_CERO');
  else hCC.clearContents();

  const baseData = hB.getDataRange().getValues().slice(1);
  let periodoCalc = '';
  baseData.forEach(r => {
    const v = r[18];
    const p = v instanceof Date
      ? `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}`
      : String(v||'').substring(0,7);
    if (p > periodoCalc) periodoCalc = p;
  });

  const codsValidosCC = new Set();
  if (hB && hB.getLastRow() > 1) {
    hB.getRange(2,4,hB.getLastRow()-1,1).getValues().forEach(r => {
      const asesorTxt = String(r[0] || '').trim();
      const c = obtenerCodAsesor_(asesorTxt);
      if (!esVendedorValido_(c, asesorTxt)) return;
      if (c && /^\d{3}$/.test(c)) codsValidosCC.add(c);
    });
  }

  const rutData        = hM.getDataRange().getValues();
  const ruteroClientes = [];
  for (let i = 1; i < rutData.length; i++) {
    const cli    = String(rutData[i][0]  || '').trim();
    const usu    = String(rutData[i][20] || '').trim();
    const estado = String(rutData[i][19] || '').trim().toUpperCase();
    if (!usu || !cli || cli === '0') continue;
    if (estado && estado !== 'A') continue;
    const cod = obtenerCodAsesor_(usu);
    if (!esVendedorValido_(cod, usu)) continue;
    if (!cod || !/^\d{3}$/.test(cod)) continue;
    if (codsValidosCC.size > 0 && !codsValidosCC.has(cod)) continue;
    ruteroClientes.push({
      cod_vendedor:  cod,
      nom_vendedor:  usu,
      cod_cliente:   cli,
      nom_cliente:   String(rutData[i][1]  || '').trim(),
      razon_social:  String(rutData[i][5]  || '').trim(),
      direccion:     String(rutData[i][6]  || '').trim(),
      barrio:        String(rutData[i][22] || '').trim(),
      ciudad:        String(rutData[i][11] || '').trim(),
      fecha_creacion:String(rutData[i][27] || '').trim(),
    });
  }

  const compraronSet = new Set();
  for (let i = 0; i < baseData.length; i++) {
    const v = baseData[i][18];
    const p = v instanceof Date
      ? `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}`
      : String(v||'').substring(0,7);
    if (p !== periodoCalc) continue;
    if (!esFilaBaseValida_(baseData[i])) continue;
    if ((parseFloat(baseData[i][13]) || 0) > 0) {
      compraronSet.add(String(baseData[i][1]).trim());
    }
  }

  const cero = ruteroClientes.filter(c => !compraronSet.has(c.cod_cliente));

  hCC.getRange(1,1,1,9).setValues([['Vendedor','Cod Cliente','Cliente','Razon Social','Direccion','Barrio','Ciudad','Fecha Creacion','Período']]);
  hCC.getRange(1,1,1,9).setBackground('#DC2626').setFontColor('#FFFFFF').setFontWeight('bold');

  if (cero.length) {
    cero.sort((a,b) => a.nom_vendedor.localeCompare(b.nom_vendedor));
    hCC.getRange(2,1,cero.length,9).setValues(cero.map(c => [
      c.nom_vendedor, c.cod_cliente, c.nom_cliente, c.razon_social,
      c.direccion, c.barrio, c.ciudad, c.fecha_creacion, periodoCalc
    ]));
  }

  const resumen = {};
  cero.forEach(c => { resumen[c.nom_vendedor] = (resumen[c.nom_vendedor]||0)+1; });
  const msg = Object.entries(resumen).sort((a,b)=>b[1]-a[1]).map(([v,n])=>`${v}: ${n}`).join('\n');
  SpreadsheetApp.getUi().alert('✅ Clientes Cero',
    `Total: ${cero.length} de ${ruteroClientes.length}\n\n${msg}`,
    SpreadsheetApp.getUi().ButtonSet.OK);
}

// ── PROCESAR DEVOLUCIONES ─────────────────────────────────────────
function procesarDevoluciones() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hR = ss.getSheetByName('DEVOLUCIONES_RAW');
  if (!hR) { SpreadsheetApp.getUi().alert('ERROR','No existe DEVOLUCIONES_RAW.',SpreadsheetApp.getUi().ButtonSet.OK); return; }

  let hD = ss.getSheetByName('DEVOLUCIONES');
  if (!hD) hD = ss.insertSheet('DEVOLUCIONES');
  else hD.clearContents();

  const hC           = ss.getSheetByName('CARGA_DIARIA');
  const fechaRaw     = hC ? hC.getRange('A1').getValue() : null;
  const periodoActual = parsearPeriodo(fechaRaw) || '';

  const rawData = hR.getDataRange().getValues();
  if (rawData.length < 2) return;

  const nuevas    = [];
  let totalDevol  = 0;

  for (let i = 1; i < rawData.length; i++) {
    const row       = rawData[i];
    const codCli    = String(row[6]  || '').trim();
    const codSku    = String(row[0]  || '').trim();
    const vlr       = parseFloat(row[11]) || 0;
    const codAsesor = obtenerCodAsesor_(row[8]);
    const vendedor  = String(row[9]  || '').trim();

    if (!esVendedorValido_(codAsesor, vendedor)) continue;
    if (!codCli || !codSku) continue;

    totalDevol += vlr;
    nuevas.push([
      periodoActual,
      String(row[8]  || '').trim(),
      String(row[9]  || '').trim(),
      codCli,
      String(row[7]  || '').trim(),
      String(row[5]  || '').trim(),
      codSku,
      String(row[1]  || '').trim(),
      parseFloat(row[2])  || 0,
      parseFloat(row[3])  || 0,
      vlr,
      String(row[4]  || '').trim(),
      String(row[10] || '').trim(),
      periodoActual,
    ]);
  }

  hD.getRange(1,1,1,14).setValues([[
    'periodo_mes','cod_asesor','nom_vendedor','cod_cliente','nom_cliente',
    'factura','cod_sku','nom_producto','cantidad','costo_unitario',
    'vlr_devolucion','concepto','tipo_producto','periodo_filtro'
  ]]);
  hD.getRange(1,1,1,14).setBackground('#DC2626').setFontColor('#FFFFFF').setFontWeight('bold');
  if (nuevas.length) hD.getRange(2,1,nuevas.length,14).setValues(nuevas);

  ss.toast(`✅ Devoluciones: ${nuevas.length} registros · $${totalDevol.toFixed(2)}`, 'PALMA', 8);
}

// ── PROCESAR EFECTIVIDAD ──────────────────────────────────────────
function procesarEfectividad() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hR = ss.getSheetByName('EFECTIVIDAD_RAW');
  if (!hR) { SpreadsheetApp.getUi().alert('ERROR','No existe EFECTIVIDAD_RAW.',SpreadsheetApp.getUi().ButtonSet.OK); return; }

  let hEf  = ss.getSheetByName('EFECTIVIDAD');
  if (!hEf)  hEf  = ss.insertSheet('EFECTIVIDAD');
  else hEf.clearContents();

  let hRes = ss.getSheetByName('EFECTIVIDAD_RESUMEN');
  if (!hRes) hRes = ss.insertSheet('EFECTIVIDAD_RESUMEN');
  else hRes.clearContents();

  const rawData = hR.getDataRange().getValues();
  if (rawData.length < 2) return;

  const headers = rawData[0].map(h => String(h).trim().toLowerCase());
  const iAsesor = headers.findIndex(h => h.includes('asesor'));
  const iAnio   = headers.findIndex(h => h.includes('año') || h === 'a±o' || h.includes('ao'));
  const iMes    = headers.findIndex(h => h === 'mes');
  const iSemana = headers.findIndex(h => h.includes('semana'));
  const iIndic  = headers.findIndex(h => h.includes('indicador'));
  const iTotal  = headers.findIndex(h => h === 'total');

  const semMap     = {};
  const resumenMap = {};

  for (let i = 1; i < rawData.length; i++) {
    const row    = rawData[i];
    const asesor = String(row[iAsesor] || '').trim();
    const indic  = String(row[iIndic]  || '').trim();
    const total  = parseFloat(row[iTotal]) || 0;
    const codAsesor = obtenerCodAsesor_(asesor);
    if (!asesor || !esVendedorValido_(codAsesor, asesor)) continue;
    if (indic !== 'Impactos' && indic !== 'Maestra') continue;

    const anio   = parseInt(row[iAnio])   || 0;
    const mes    = parseInt(row[iMes])    || 0;
    const semana = parseInt(row[iSemana]) || 0;
    const key    = `${asesor}|${semana}`;

    if (!semMap[key]) semMap[key] = { asesor, anio, mes, semana, impactos:0, maestra:0 };
    if (indic === 'Impactos') semMap[key].impactos += total;
    if (indic === 'Maestra')  semMap[key].maestra  += total;

    if (!resumenMap[asesor]) resumenMap[asesor] = { impactos:0, maestra:0, anio, mes };
    if (indic === 'Impactos') resumenMap[asesor].impactos += total;
    if (indic === 'Maestra')  resumenMap[asesor].maestra  += total;
  }

  const efRows = Object.values(semMap).map(r => {
    const ef = r.maestra > 0 ? parseFloat((r.impactos/r.maestra*100).toFixed(1)) : 0;
    return [r.asesor, r.anio, r.mes, r.semana, r.impactos, r.maestra, ef];
  }).sort((a,b) => a[0].localeCompare(b[0]) || a[3]-b[3]);

  const resRows = Object.entries(resumenMap).map(([asesor, d]) => {
    const ef = d.maestra > 0 ? parseFloat((d.impactos/d.maestra*100).toFixed(1)) : 0;
    return [asesor, d.anio, d.mes, d.impactos, d.maestra, ef];
  }).sort((a,b) => b[5]-a[5]);

  hEf.getRange(1,1,1,7).setValues([['Vendedor','Año','Mes','Semana','Impactos','Maestra','Efectividad%']]);
  hEf.getRange(1,1,1,7).setBackground('#1D4ED8').setFontColor('#FFFFFF').setFontWeight('bold');
  if (efRows.length) hEf.getRange(2,1,efRows.length,7).setValues(efRows);

  hRes.getRange(1,1,1,6).setValues([['Vendedor','Año','Mes','Impactos','Maestra','Efectividad%']]);
  hRes.getRange(1,1,1,6).setBackground('#1D4ED8').setFontColor('#FFFFFF').setFontWeight('bold');
  if (resRows.length) hRes.getRange(2,1,resRows.length,6).setValues(resRows);

  ss.toast(`✅ Efectividad: ${resRows.length} vendedores procesados`, 'PALMA', 8);
}

// ── VALIDAR CLIENTES ──────────────────────────────────────────────
function validarMaestra() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hB = ss.getSheetByName('BASE_ACUMULADA');
  const hM = ss.getSheetByName('MAESTRO_CLIENTES');
  const ui = SpreadsheetApp.getUi();
  if (!hB || !hM) { ui.alert('ERROR','Faltan hojas.',ui.ButtonSet.OK); return; }

  const maestroClis = new Set(
    hM.getDataRange().getValues().slice(1)
      .filter(r => String(r[19]||'').trim().toUpperCase() === 'A')
      .map(r => String(r[0]).trim())
      .filter(c => c && c !== '0')
  );
  const baseClis = new Set(
    hB.getDataRange().getValues().slice(1)
      .filter(r => esFilaBaseValida_(r))
      .map(r => String(r[1]).trim())
      .filter(Boolean)
  );
  const sinMaestra = [...baseClis].filter(c => !maestroClis.has(c));

  if (!sinMaestra.length) {
    ui.alert('✅ Todo en orden','Todos los clientes con ventas están en MAESTRO_CLIENTES.',ui.ButtonSet.OK);
  } else {
    ui.alert(`⚠ ${sinMaestra.length} clientes sin maestro`,
      sinMaestra.slice(0,25).join('\n') + (sinMaestra.length>25 ? `\n...y ${sinMaestra.length-25} más` : ''),
      ui.ButtonSet.OK);
  }
}

// ════════════════════════════════════════════════════════════════════
// HELPERS MENÚ
// ════════════════════════════════════════════════════════════════════

function parsearFecha(fechaRaw) {
  if (!fechaRaw) return null;
  if (fechaRaw instanceof Date) {
    const y = fechaRaw.getFullYear();
    const m = String(fechaRaw.getMonth()+1).padStart(2,'0');
    const d = String(fechaRaw.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
  const s = String(fechaRaw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const p = s.split('/');
    return `${p[2]}-${p[0].padStart(2,'0')}-${p[1].padStart(2,'0')}`;
  }
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
  } catch(e) {}
  return null;
}

function parsearPeriodo(fechaRaw) {
  const f = parsearFecha(fechaRaw);
  return f ? f.substring(0,7) : null;
}

function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
  const y = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d-y)/86400000)+1)/7);
}

// ════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN GENERAL
// ════════════════════════════════════════════════════════════════════

const TZ = 'America/Panama';

const HOJAS = {
  BASE:               'BASE_ACUMULADA',
  DEVOLUCIONES:       'DEVOLUCIONES',
  RESUMEN_COBERTURA:  'RESUMEN_COBERTURA',
  COBERTURA_NEGOCIO:  'COBERTURA_NEGOCIO',
  EFECTIVIDAD:        'EFECTIVIDAD',
  EFECTIVIDAD_RESUMEN:'EFECTIVIDAD_RESUMEN',
  CLIENTES_CERO:      'CLIENTES_CERO',
  CLIENTES_NUEVOS:    'CLIENTES_NUEVOS',
  MAESTRO_CLIENTES:   'MAESTRO_CLIENTES',
  CUOTAS:             'CUOTAS'            // metas mensuales por asesor
};

// ════════════════════════════════════════════════════════════════════
// PUNTO DE ENTRADA PRINCIPAL
// ════════════════════════════════════════════════════════════════════

function doGet(e) {
  if (!e) e = { parameter: {} };

  const callback = e.parameter.callback || '';
  const sheet    = String(e.parameter.sheet || 'resumen').toLowerCase();

  try {
    let data;

    switch (sheet) {
      case 'resumen':       data = getResumen();          break;
      case 'vendedores':    data = getVendedores();       break;
      case 'cobertura':     data = getCobertura();        break;
      case 'cob_negocio':   data = getCoberturaNegocios(); break;
      case 'efectividad':   data = getEfectividad();      break;
      case 'devoluciones':  data = getDevoluciones();     break;
      case 'clientes_cero': data = getClientesCero();     break;
      case 'clientes_nuevos': data = getClientesNuevos(e.parameter.desde, e.parameter.hasta); break;
      case 'tendencia':     data = getTendencia();        break;
      case 'skus':          data = getTopSKUs();          break;
      case 'marcas':        data = getTopMarcas();        break;
      case 'top_clientes':  data = getTopClientes();      break;
      case 'cuotas':        data = getCuotas();           break;  // ← nuevo
      case 'diagnostico':   data = getDiagnosticoAPI();   break;
      default:              data = getResumen();          break;
    }

    return output_({ ok: true, data, ts: new Date().toISOString() }, callback);

  } catch (err) {
    return output_({
      ok:    false,
      error: err && err.message ? err.message : String(err),
      stack: err && err.stack   ? err.stack   : '',
      ts:    new Date().toISOString()
    }, callback);
  }
}

function output_(obj, callback) {
  const payload = JSON.stringify(obj);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + payload + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}

// ════════════════════════════════════════════════════════════════════
// HELPERS GENERALES
// ════════════════════════════════════════════════════════════════════

function getSS_()             { return SpreadsheetApp.getActiveSpreadsheet(); }
function getSheet_(sheetName) { return getSS_().getSheetByName(sheetName); }
function round2_(n)           { return Math.round((parseFloat(n) || 0) * 100) / 100; }

function normalizarTexto_(v) {
  return String(v || '')
    .trim().toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '').replace(/-/g, '').replace(/_/g, '');
}

// Solo son averías estos cuatro conceptos exactos.
// "AVALADOS POR CALIDAD" queda como devolución normal.
const CONCEPTOS_AVERIA_ = [
  'PRODUCTOVENCIDO',
  'AVALADOSPORVENTAS',
  'AVERIAENTRANSPORTE',
  'PERDIDADEVACIO'
];

function esAveria_(concepto) {
  return CONCEPTOS_AVERIA_.includes(normalizarTexto_(concepto));
}

function normalizarHeader_(header) {
  return String(header || '')
    .trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function obtenerCodAsesor_(valor) {
  return String(valor || '').split('-')[0].trim();
}

function periodoYYYYMM_(valor) {
  if (valor instanceof Date) {
    return `${valor.getFullYear()}-${String(valor.getMonth() + 1).padStart(2, '0')}`;
  }
  const s = String(valor || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}/.test(s)) return s.substring(0, 7);
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  return s.substring(0, 7);
}

function fechaISO_(valor) {
  if (valor instanceof Date) return Utilities.formatDate(valor, TZ, 'yyyy-MM-dd');
  const s = String(valor || '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
  return s;
}

// Excluye BOD100 / Bodega 100.
// NO excluye RUTA CENTRALES ni RUTA CENTRALES 2.
function esAsesorInterno_(valor) {
  const x = normalizarTexto_(valor);
  if (!x) return false;
  return (
    x.includes('BOD100')    ||
    x.includes('BODEGA100') ||
    x === 'BODEGA'          ||
    x.includes('BOD100BODEGA100')
  );
}

function esVendedorValido_(cod, nombre) {
  return !esAsesorInterno_(cod) && !esAsesorInterno_(nombre);
}

// r[3] = cod_asesor · r[4] = nom_vendedor
function esFilaBaseValida_(r) {
  const cod = obtenerCodAsesor_(r[3]);
  const nom = String(r[4] || '').trim();
  if (!cod || !nom) return false;
  return esVendedorValido_(cod, nom);
}

function getPeriodoActualDesdeBase_() {
  const hB = getSheet_(HOJAS.BASE);
  if (!hB || hB.getLastRow() < 2) return '';
  let periodoActual = '';
  hB.getDataRange().getValues().slice(1).forEach(r => {
    const p = periodoYYYYMM_(r[18]);
    if (p > periodoActual) periodoActual = p;
  });
  return periodoActual;
}

function getBasePeriodoActual_() {
  const hB = getSheet_(HOJAS.BASE);
  if (!hB || hB.getLastRow() < 2) return [];
  const periodoActual = getPeriodoActualDesdeBase_();
  return hB.getDataRange().getValues().slice(1).filter(r => {
    if (!esFilaBaseValida_(r)) return false;
    return periodoYYYYMM_(r[18]) === periodoActual;
  });
}

function sheetToJSON(sheetName) {
  const hoja = getSheet_(sheetName);
  if (!hoja) return [];
  const rows = hoja.getDataRange().getValues();
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => normalizarHeader_(h));
  return rows.slice(1)
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        let v = row[i];
        if (v instanceof Date) v = Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
        obj[h] = (v === null || v === undefined) ? '' : v;
      });
      return obj;
    })
    .filter(r => Object.values(r).some(v => v !== '' && v !== 0));
}

// ════════════════════════════════════════════════════════════════════
// CUOTAS / METAS MENSUALES
// ════════════════════════════════════════════════════════════════════

// Lee la hoja CUOTAS y devuelve un mapa { cod → cuota }.
// La hoja debe tener: A=Asesor (formato "COD-NOMBRE"), B=Cuota.
// Actualiza la hoja cada mes para cambiar las metas; no toques el código.
function getCuotasMap_() {
  const h = getSheet_(HOJAS.CUOTAS);
  if (!h || h.getLastRow() < 2) return {};

  const data = h.getDataRange().getValues();
  const map  = {};

  for (let i = 1; i < data.length; i++) {
    const asesorRaw = String(data[i][0] || '').trim();
    const cuotaRaw  = data[i][1];
    if (!asesorRaw) continue;

    const cod   = obtenerCodAsesor_(asesorRaw);
    // Acepta tanto número como texto con comas ("40,683.00")
    const cuota = parseFloat(String(cuotaRaw || '0').replace(/,/g, '')) || 0;
    if (cod) map[cod] = cuota;
  }

  return map;
}

// Endpoint ?sheet=cuotas — devuelve la lista completa de metas.
function getCuotas() {
  const h = getSheet_(HOJAS.CUOTAS);
  if (!h || h.getLastRow() < 2) return [];

  return h.getDataRange().getValues().slice(1)
    .filter(r => String(r[0] || '').trim())
    .map(r => {
      const asesorRaw = String(r[0] || '').trim();
      const cuota     = parseFloat(String(r[1] || '0').replace(/,/g, '')) || 0;
      return {
        cod:    obtenerCodAsesor_(asesorRaw),
        asesor: asesorRaw,
        cuota:  round2_(cuota)
      };
    });
}

// ════════════════════════════════════════════════════════════════════
// DEVOLUCIONES: HELPERS
// ════════════════════════════════════════════════════════════════════

// Estructura confirmada de DEVOLUCIONES:
// r[0]=periodo_mes r[1]=cod_asesor r[2]=nom_vendedor r[3]=cod_cliente
// r[4]=nom_cliente r[5]=factura    r[6]=cod_sku      r[7]=nom_producto
// r[8]=cantidad    r[9]=costo_unit r[10]=vlr_devol   r[11]=concepto
// r[12]=tipo_prod  r[13]=periodo_filtro

function getDevolucionesPeriodoRaw_(periodoYYYYMM) {
  const hDev = getSheet_(HOJAS.DEVOLUCIONES);
  if (!hDev || hDev.getLastRow() < 2) return [];

  return hDev.getDataRange().getValues().slice(1).filter(r => {
    const periodo  = periodoYYYYMM_(r[0]);
    const cod      = obtenerCodAsesor_(r[1]);
    const vendedor = String(r[2] || '').trim();
    if (periodoYYYYMM && periodo !== periodoYYYYMM) return false;
    return esVendedorValido_(cod, vendedor);
  });
}

function getTotalesDevolucionesPeriodo_(periodoYYYYMM) {
  const totales = { devoluciones: 0, averias: 0, total: 0 };
  getDevolucionesPeriodoRaw_(periodoYYYYMM).forEach(r => {
    const monto   = Math.abs(parseFloat(r[10]) || 0);
    const concepto = String(r[11] || '').trim();
    if (!monto) return;
    if (esAveria_(concepto)) totales.averias      += monto;
    else                     totales.devoluciones += monto;
    totales.total += monto;
  });
  return {
    devoluciones: round2_(totales.devoluciones),
    averias:      round2_(totales.averias),
    total:        round2_(totales.total)
  };
}

function getTotalDevolucionesPeriodo_(periodoYYYYMM) {
  return getTotalesDevolucionesPeriodo_(periodoYYYYMM).total;
}

function getDevolucionesPorCodAsesor_(periodoYYYYMM) {
  const devMap = {};
  getDevolucionesPeriodoRaw_(periodoYYYYMM).forEach(r => {
    const cod      = obtenerCodAsesor_(r[1]);
    const monto    = Math.abs(parseFloat(r[10]) || 0);
    const concepto = String(r[11] || '').trim();
    if (!cod || !monto) return;
    if (!devMap[cod]) devMap[cod] = { devoluciones:0, averias:0, total:0 };
    if (esAveria_(concepto)) devMap[cod].averias      += monto;
    else                     devMap[cod].devoluciones += monto;
    devMap[cod].total += monto;
  });
  Object.keys(devMap).forEach(cod => {
    devMap[cod].devoluciones = round2_(devMap[cod].devoluciones);
    devMap[cod].averias      = round2_(devMap[cod].averias);
    devMap[cod].total        = round2_(devMap[cod].total);
  });
  return devMap;
}

// ════════════════════════════════════════════════════════════════════
// RESUMEN GLOBAL
// ════════════════════════════════════════════════════════════════════

function getResumen() {
  const hB   = getSheet_(HOJAS.BASE);
  const hRC  = getSheet_(HOJAS.RESUMEN_COBERTURA);
  const hEfR = getSheet_(HOJAS.EFECTIVIDAD_RESUMEN);
  if (!hB) return {};

  const periodoActual = getPeriodoActualDesdeBase_();
  const mesData       = getBasePeriodoActual_();

  // Cuotas del equipo
  const cuotaMap   = getCuotasMap_();
  const cuotaTotal = Object.values(cuotaMap).reduce((s, v) => s + v, 0);

  // Venta neta VMXC (Vta + ITMBS, positivos y negativos; sin BOD100)
  let ventaNetaVMXC      = 0;
  let ventaPositivaVMXC  = 0;
  let ventaNegativaVMXC  = 0;
  const clientesImp = new Set();
  const skusActivos = new Set();

  mesData.forEach(r => {
    const valor    = parseFloat(r[14]) || 0;
    const cantNeta = parseFloat(r[13]) || 0;
    ventaNetaVMXC += valor;
    if (valor > 0) {
      ventaPositivaVMXC += valor;
      clientesImp.add(String(r[1]));
    }
    if (valor < 0) ventaNegativaVMXC += Math.abs(valor);
    if (cantNeta > 0) skusActivos.add(String(r[6]));
  });

  // Devoluciones y averías siempre desde hoja DEVOLUCIONES
  const totalesDev    = getTotalesDevolucionesPeriodo_(periodoActual);
  const totalDevol    = totalesDev.devoluciones;
  const totalAverias  = totalesDev.averias;
  const descuentoTotal = totalDevol + totalAverias;

  const ventaNeta  = ventaNetaVMXC;
  const ventaBruta = ventaNeta + descuentoTotal;

  // Cobertura global
  let coberturaGlobal = 0, totalMaestro = 0, totalImpactados = 0;
  if (hRC && hRC.getLastRow() > 1) {
    const rcData   = hRC.getDataRange().getValues().slice(1);
    const totalRow = rcData.find(r => String(r[0]||'').toUpperCase().includes('TOTAL'));
    if (totalRow) {
      totalMaestro    = parseInt(totalRow[1]) || 0;
      totalImpactados = parseInt(totalRow[2]) || 0;
      coberturaGlobal = parseFloat(totalRow[3]) || 0;
    } else {
      rcData.forEach(r => {
        const vendedor = String(r[0]||'').trim();
        const cod      = obtenerCodAsesor_(vendedor);
        if (!esVendedorValido_(cod, vendedor)) return;
        totalMaestro    += parseInt(r[1]) || 0;
        totalImpactados += parseInt(r[2]) || 0;
      });
      coberturaGlobal = totalMaestro > 0
        ? round2_(totalImpactados / totalMaestro * 100) : 0;
    }
  }

  // Efectividad global (promedio de vendedores)
  let efectividadGlobal = 0;
  if (hEfR && hEfR.getLastRow() > 1) {
    const efData = hEfR.getDataRange().getValues().slice(1)
      .filter(r => {
        const v   = String(r[0]||'').trim();
        const cod = obtenerCodAsesor_(v);
        return esVendedorValido_(cod, v);
      })
      .map(r => parseFloat(r[5]) || 0)
      .filter(v => v > 0);
    if (efData.length > 0) {
      efectividadGlobal = round2_(efData.reduce((s, v) => s + v, 0) / efData.length);
    }
  }

  // Venta por negocio
  const negMapNeto     = {};
  const negMapPositivo = {};
  mesData.forEach(r => {
    const neg   = String(r[8]||'').trim();
    const valor = parseFloat(r[14]) || 0;
    if (!neg) return;
    negMapNeto[neg] = (negMapNeto[neg] || 0) + valor;
    if (valor > 0) negMapPositivo[neg] = (negMapPositivo[neg] || 0) + valor;
  });

  const venta_por_negocio = Object.entries(negMapNeto)
    .map(([negocio, venta]) => ({ negocio, venta: round2_(venta) }))
    .sort((a, b) => b.venta - a.venta);

  const venta_positiva_por_negocio = Object.entries(negMapPositivo)
    .map(([negocio, venta]) => ({ negocio, venta: round2_(venta) }))
    .sort((a, b) => b.venta - a.venta);

  return {
    periodo: periodoActual,

    // Campos alineados con ECOM
    venta_bruta:             round2_(ventaBruta),
    venta_total:             round2_(ventaBruta),
    venta_real:              round2_(ventaBruta),   // alias para compatibilidad frontend
    venta_neta:              round2_(ventaNeta),
    vta_mas_itmbs:           round2_(ventaNeta),

    // Auditoría VMXC
    venta_vmx_neta:          round2_(ventaNetaVMXC),
    venta_vmx_positiva:      round2_(ventaPositivaVMXC),
    venta_vmx_negativa_abs:  round2_(ventaNegativaVMXC),

    venta_por_negocio,
    venta_positiva_por_negocio,

    // Devoluciones (solo desde hoja DEVOLUCIONES)
    devolucion_total:        round2_(totalDevol),
    averia_total:            round2_(totalAverias),
    descuento_total:         round2_(descuentoTotal),
    pct_devolucion:          ventaBruta > 0 ? round2_(totalDevol    / ventaBruta * 100) : 0,
    pct_averia:              ventaBruta > 0 ? round2_(totalAverias  / ventaBruta * 100) : 0,
    pct_descuento_total:     ventaBruta > 0 ? round2_(descuentoTotal/ ventaBruta * 100) : 0,

    // Cobertura y operación
    clientes_impactados:     clientesImp.size,
    clientes_maestro:        totalMaestro,
    cobertura_pct:           round2_(coberturaGlobal),
    skus_activos:            skusActivos.size,
    ticket_promedio:         clientesImp.size > 0 ? round2_(ventaNeta / clientesImp.size) : 0,
    efectividad_pct:         round2_(efectividadGlobal),

    // Cuotas / metas del equipo
    cuota_total:             round2_(cuotaTotal),
    pct_cumplimiento_equipo: cuotaTotal > 0 ? round2_(ventaBruta / cuotaTotal * 100) : 0
  };
}

// ════════════════════════════════════════════════════════════════════
// RANKING VENDEDORES
// ════════════════════════════════════════════════════════════════════

function getVendedores() {
  const hB   = getSheet_(HOJAS.BASE);
  const hRC  = getSheet_(HOJAS.RESUMEN_COBERTURA);
  const hEfR = getSheet_(HOJAS.EFECTIVIDAD_RESUMEN);
  if (!hB) return [];

  const periodoActual = getPeriodoActualDesdeBase_();
  const mesData       = getBasePeriodoActual_();

  // Mapa de cuotas por código de asesor (leído una sola vez)
  const cuotaMap = getCuotasMap_();

  // Acumular ventas por vendedor
  const vendMap = {};
  mesData.forEach(r => {
    const cod      = obtenerCodAsesor_(r[3]);
    const vendedor = String(r[4] || '').trim();
    const valor    = parseFloat(r[14]) || 0;
    const negocio  = String(r[8]  || '').trim();

    if (!cod || !vendedor) return;
    if (!esVendedorValido_(cod, vendedor)) return;

    if (!vendMap[cod]) {
      vendMap[cod] = {
        cod,
        nombre:                vendedor,
        venta_neta_vmx:        0,
        venta_positiva_vmx:    0,
        venta_negativa_vmx_abs:0,
        clientes:              new Set(),
        negocios:              {}
      };
    }

    vendMap[cod].venta_neta_vmx += valor;

    // Acumular venta NETA por negocio (incluye positivos y negativos)
    if (negocio) {
      vendMap[cod].negocios[negocio] = (vendMap[cod].negocios[negocio] || 0) + valor;
    }

    if (valor > 0) {
      vendMap[cod].venta_positiva_vmx += valor;
      vendMap[cod].clientes.add(String(r[1]));
    }
    if (valor < 0) {
      vendMap[cod].venta_negativa_vmx_abs += Math.abs(valor);
    }
  });

  // Devoluciones y averías desde hoja DEVOLUCIONES
  const devMap = getDevolucionesPorCodAsesor_(periodoActual);

  // Cobertura desde RESUMEN_COBERTURA
  const cobMap = {};
  if (hRC && hRC.getLastRow() > 1) {
    hRC.getDataRange().getValues().slice(1).forEach(r => {
      const vendedorTxt = String(r[0] || '').trim();
      const cod         = obtenerCodAsesor_(vendedorTxt);
      if (!esVendedorValido_(cod, vendedorTxt)) return;
      cobMap[cod] = {
        maestro:    parseInt(r[1])   || 0,
        impactados: parseInt(r[2])   || 0,
        cobertura:  parseFloat(r[3]) || 0,
        sin_compra: parseInt(r[4])   || 0
      };
    });
  }

  // Efectividad desde EFECTIVIDAD_RESUMEN
  const efMap = {};
  if (hEfR && hEfR.getLastRow() > 1) {
    hEfR.getDataRange().getValues().slice(1).forEach(r => {
      const vendedorTxt = String(r[0] || '').trim();
      const cod         = obtenerCodAsesor_(vendedorTxt);
      if (!esVendedorValido_(cod, vendedorTxt)) return;
      efMap[cod] = parseFloat(r[5]) || 0;
    });
  }

  return Object.values(vendMap)
    .filter(v => esVendedorValido_(v.cod, v.nombre))
    .map(v => {
      const devInfo        = devMap[v.cod] || { devoluciones:0, averias:0, total:0 };
      const devol          = devInfo.devoluciones || 0;
      const averias        = devInfo.averias       || 0;
      const descuentoTotal = devol + averias;

      // Regla ECOM: venta_bruta = venta_neta_vmx + devoluciones + averías
      const ventaNeta  = v.venta_neta_vmx;
      const ventaBruta = ventaNeta + descuentoTotal;

      const cuota = cuotaMap[v.cod] || 0;

      return {
        cod:    v.cod,
        nombre: v.nombre,

        // Ventas
        venta_bruta:            round2_(ventaBruta),
        venta_total:            round2_(ventaBruta),
        venta_real:             round2_(ventaBruta),   // alias compatibilidad frontend
        venta_neta:             round2_(ventaNeta),
        vta_mas_itmbs:          round2_(ventaNeta),

        // Auditoría VMXC
        venta_vmx_neta:         round2_(v.venta_neta_vmx),
        venta_vmx_positiva:     round2_(v.venta_positiva_vmx),
        venta_vmx_negativa_abs: round2_(v.venta_negativa_vmx_abs),

        // Venta por negocio (para gráfica "Mi Panel · Venta por Negocio")
        venta_por_negocio: Object.entries(v.negocios || {})
          .map(([negocio, venta]) => ({ negocio, venta: round2_(venta) }))
          .sort((a, b) => b.venta - a.venta),

        // Devoluciones y averías (desde DEVOLUCIONES, no del VMXC)
        devol:            round2_(devol),
        devolucion_total: round2_(devol),
        averias:          round2_(averias),
        averia_total:     round2_(averias),
        descuento_total:  round2_(descuentoTotal),

        pct_devolucion:    ventaBruta > 0 ? round2_(devol         / ventaBruta * 100) : 0,
        pct_averia:        ventaBruta > 0 ? round2_(averias        / ventaBruta * 100) : 0,
        pct_descuento_total: ventaBruta > 0 ? round2_(descuentoTotal/ ventaBruta * 100) : 0,

        // Cobertura
        clientes_imp: v.clientes.size,
        maestro:      cobMap[v.cod]?.maestro    || 0,
        cobertura:    cobMap[v.cod]?.cobertura   || 0,
        sin_compra:   cobMap[v.cod]?.sin_compra  || 0,

        // Operación
        efectividad: efMap[v.cod] || 0,
        ticket:      v.clientes.size > 0 ? round2_(ventaNeta / v.clientes.size) : 0,

        // Cuota / meta mensual
        cuota:            round2_(cuota),
        pct_cumplimiento: cuota > 0 ? round2_(ventaBruta / cuota * 100) : 0
      };
    })
    .sort((a, b) => b.venta_bruta - a.venta_bruta);
}

// ════════════════════════════════════════════════════════════════════
// COBERTURA
// ════════════════════════════════════════════════════════════════════

function getCobertura() {
  return sheetToJSON(HOJAS.RESUMEN_COBERTURA)
    .filter(r => {
      const vendedor = String(r.vendedor || '').trim();
      const cod      = obtenerCodAsesor_(vendedor);
      if (normalizarTexto_(vendedor).includes('TOTAL')) return false;
      return esVendedorValido_(cod, vendedor);
    });
}

function getCoberturaNegocios() {
  return sheetToJSON(HOJAS.COBERTURA_NEGOCIO)
    .filter(r => {
      const vendedor = String(r.vendedor || '').trim();
      const cod      = obtenerCodAsesor_(vendedor);
      if (normalizarTexto_(vendedor).includes('TOTAL')) return false;
      return esVendedorValido_(cod, vendedor);
    });
}

// ════════════════════════════════════════════════════════════════════
// EFECTIVIDAD
// ════════════════════════════════════════════════════════════════════

function getEfectividad() {
  const porSemana = sheetToJSON(HOJAS.EFECTIVIDAD)
    .filter(r => {
      const v   = String(r.vendedor || '').trim();
      const cod = obtenerCodAsesor_(v);
      return esVendedorValido_(cod, v);
    })
    .map(r => ({ ...r, efectividad: parseFloat(r.efectividad) || 0 }));

  const resumenMes = sheetToJSON(HOJAS.EFECTIVIDAD_RESUMEN)
    .filter(r => {
      const v   = String(r.vendedor || '').trim();
      const cod = obtenerCodAsesor_(v);
      if (normalizarTexto_(v).includes('TOTAL')) return false;
      return esVendedorValido_(cod, v);
    })
    .map(r => ({ ...r, efectividad: parseFloat(r.efectividad) || 0 }));

  return { por_semana: porSemana, resumen_mes: resumenMes };
}

// ════════════════════════════════════════════════════════════════════
// DEVOLUCIONES
// ════════════════════════════════════════════════════════════════════

function getDevoluciones() {
  const periodoActual = getPeriodoActualDesdeBase_();
  const raw           = getDevolucionesPeriodoRaw_(periodoActual);

  const conceptoMap = {};
  const vendedorMap = {};
  const detalle     = [];

  raw.forEach(r => {
    const periodoMes  = fechaISO_(r[0]);
    const cod         = obtenerCodAsesor_(r[1]);
    const vendedor    = String(r[2]  || '').trim();
    const codCliente  = String(r[3]  || '').trim();
    const nomCliente  = String(r[4]  || '').trim();
    const factura     = String(r[5]  || '').trim();
    const codSku      = String(r[6]  || '').trim();
    const nomProducto = String(r[7]  || '').trim();
    const cantidad    = parseFloat(r[8])  || 0;
    const costoUnit   = parseFloat(r[9])  || 0;
    const monto       = Math.abs(parseFloat(r[10]) || 0);
    const concepto    = String(r[11] || 'Sin concepto').trim();
    const tipoProducto= String(r[12] || '').trim();

    if (!cod || !vendedor) return;
    if (!esVendedorValido_(cod, vendedor)) return;

    const nombreFinal = `${cod} - ${vendedor}`;
    conceptoMap[concepto]     = (conceptoMap[concepto]     || 0) + monto;
    vendedorMap[nombreFinal]  = (vendedorMap[nombreFinal]  || 0) + monto;

    detalle.push({
      periodo_mes:    periodoMes,
      cod_asesor:     cod,
      nom_vendedor:   vendedor,
      vendedor:       nombreFinal,
      cod_cliente:    codCliente,
      nom_cliente:    nomCliente,
      factura,
      cod_sku:        codSku,
      nom_producto:   nomProducto,
      cantidad,
      costo_unitario: round2_(costoUnit),
      vlr_devolucion: round2_(monto),
      concepto,
      tipo_producto:  tipoProducto
    });
  });

  const total = detalle.reduce((s, r) => s + (parseFloat(r.vlr_devolucion) || 0), 0);

  return {
    total: round2_(total),
    por_concepto: Object.entries(conceptoMap)
      .map(([concepto, monto]) => ({ concepto, monto: round2_(monto) }))
      .sort((a, b) => b.monto - a.monto),
    por_vendedor: Object.entries(vendedorMap)
      .map(([vendedor, monto]) => ({ vendedor, monto: round2_(monto) }))
      .sort((a, b) => b.monto - a.monto),
    detalle: detalle
      .sort((a, b) => b.vlr_devolucion - a.vlr_devolucion)
      .slice(0, 300)
  };
}

// ════════════════════════════════════════════════════════════════════
// CLIENTES CERO
// ════════════════════════════════════════════════════════════════════

function getClientesCero() {
  const raw = sheetToJSON(HOJAS.CLIENTES_CERO)
    .filter(r => {
      const v   = String(r.vendedor || '').trim();
      const cod = obtenerCodAsesor_(v);
      return esVendedorValido_(cod, v);
    });

  const porVendedor = {};
  raw.forEach(r => {
    const v   = String(r.vendedor || '').trim();
    const cod = obtenerCodAsesor_(v);
    if (!v || !esVendedorValido_(cod, v)) return;
    porVendedor[v] = (porVendedor[v] || 0) + 1;
  });

  return {
    total: raw.length,
    por_vendedor: Object.entries(porVendedor)
      .map(([vendedor, cantidad]) => ({ vendedor, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad),
    detalle: raw
  };
}

// ════════════════════════════════════════════════════════════════════
// CLIENTES NUEVOS
// ════════════════════════════════════════════════════════════════════

function getClientesNuevos(desde, hasta) {
  const hM = getSheet_(HOJAS.MAESTRO_CLIENTES);
  if (!hM || hM.getLastRow() < 2) return { total:0, por_vendedor:[], por_mes:[], detalle:[], desde:desde||null, hasta:hasta||null };

  const data    = hM.getDataRange().getValues();
  const nuevos  = [];
  const porVend = {};
  const porMes  = {};

  // Parsear rango de fechas (si se proveen)
  let fechaDesde = null, fechaHasta = null;
  if (desde) {
    const d = new Date(desde + 'T00:00:00');
    if (!isNaN(d.getTime())) fechaDesde = d;
  }
  if (hasta) {
    const h = new Date(hasta + 'T23:59:59');
    if (!isNaN(h.getTime())) fechaHasta = h;
  }
  const hayFiltro = !!(fechaDesde || fechaHasta);

  for (let i = 1; i < data.length; i++) {
    const r      = data[i];
    const estado = String(r[19] || '').trim().toUpperCase();
    const asesor = String(r[20] || '').trim();
    const codA   = obtenerCodAsesor_(asesor);
    const fechaR = r[27]; // columna AB = fecha de creación

    if (estado !== 'A') continue;
    if (!esVendedorValido_(codA, asesor)) continue;

    // Intentar parsear fecha de columna AB
    let fecha = null;
    if (fechaR instanceof Date && !isNaN(fechaR.getTime())) {
      fecha = fechaR;
    } else {
      const s = String(fechaR || '').trim();
      if (s) {
        const d = new Date(s);
        if (!isNaN(d.getTime())) fecha = d;
      }
    }

    // Con filtro activo: excluir si no tiene fecha o está fuera del rango
    if (hayFiltro) {
      if (!fecha) continue;
      if (fechaDesde && fecha < fechaDesde) continue;
      if (fechaHasta && fecha > fechaHasta) continue;
    }
    // Sin filtro: incluir TODOS los clientes activos válidos aunque no tengan fecha en AB

    const fechaStr = fecha ? Utilities.formatDate(fecha, TZ, 'yyyy-MM-dd') : '';
    const mesStr   = fecha ? Utilities.formatDate(fecha, TZ, 'yyyy-MM')    : '';

    nuevos.push({
      asesor,
      cod_asesor:     codA,
      cod_cliente:    String(r[0] || '').trim(),
      nombre:         String(r[1] || '').trim(),
      razon_social:   String(r[5] || '').trim(),
      fecha_creacion: fechaStr
    });
    porVend[asesor] = (porVend[asesor] || 0) + 1;
    if (mesStr) porMes[mesStr] = (porMes[mesStr] || 0) + 1;
  }

  // Ordenar: con fecha primero (más reciente arriba), sin fecha al final
  nuevos.sort((a, b) => {
    if (!a.fecha_creacion && !b.fecha_creacion) return 0;
    if (!a.fecha_creacion) return 1;
    if (!b.fecha_creacion) return -1;
    return b.fecha_creacion.localeCompare(a.fecha_creacion);
  });

  return {
    total: nuevos.length,
    desde: desde || null,
    hasta: hasta || null,
    por_vendedor: Object.entries(porVend)
      .map(([vendedor, cantidad]) => ({ vendedor, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad),
    por_mes: Object.entries(porMes)
      .map(([mes, cantidad]) => ({ mes, cantidad }))
      .sort((a, b) => a.mes.localeCompare(b.mes)),
    detalle: nuevos
  };
}

// ════════════════════════════════════════════════════════════════════
// TENDENCIA SEMANAL
// ════════════════════════════════════════════════════════════════════

function getTendencia() {
  const periodoActual = getPeriodoActualDesdeBase_();
  const mesData       = getBasePeriodoActual_();
  const semMap        = {};

  mesData.forEach(r => {
    const semana = parseInt(r[15]) || 0;
    const valor  = parseFloat(r[14]) || 0;
    if (!semana) return;
    if (!semMap[semana]) semMap[semana] = { semana, venta:0, clientes:new Set(), pedidos:0 };
    if (valor > 0) {
      semMap[semana].venta += valor;
      semMap[semana].clientes.add(String(r[1]));
      semMap[semana].pedidos++;
    }
  });

  return Object.values(semMap)
    .map(s => ({
      semana:  s.semana,
      venta:   round2_(s.venta),
      clientes:s.clientes.size,
      pedidos: s.pedidos,
      ticket:  s.clientes.size > 0 ? round2_(s.venta / s.clientes.size) : 0,
      periodo: periodoActual
    }))
    .sort((a, b) => a.semana - b.semana);
}

// ════════════════════════════════════════════════════════════════════
// TOP SKUs
// ════════════════════════════════════════════════════════════════════

function getTopSKUs() {
  const mesData   = getBasePeriodoActual_();
  const skuMap    = {};
  const vendSkuMap = {};

  mesData.forEach(r => {
    const codAsesor = obtenerCodAsesor_(r[3]);
    const sku       = String(r[6]  || '').trim();
    const nom       = String(r[7]  || '').trim();
    const neg       = String(r[8]  || '').trim();
    const marca     = String(r[10] || '').trim();
    const cant      = parseFloat(r[13]) || 0;
    const valor     = parseFloat(r[14]) || 0;

    if (!codAsesor || !sku || valor <= 0) return;

    if (!skuMap[sku]) skuMap[sku] = { sku, nombre:nom, negocio:neg, marca, venta:0, clientes:new Set(), unidades:0 };
    skuMap[sku].venta    += valor;
    skuMap[sku].unidades += cant;
    skuMap[sku].clientes.add(String(r[1]));

    if (!vendSkuMap[codAsesor])       vendSkuMap[codAsesor] = {};
    if (!vendSkuMap[codAsesor][sku])  vendSkuMap[codAsesor][sku] = { sku, nombre:nom, negocio:neg, venta:0, clientes:new Set() };
    vendSkuMap[codAsesor][sku].venta += valor;
    vendSkuMap[codAsesor][sku].clientes.add(String(r[1]));
  });

  const global = Object.values(skuMap)
    .map(s => ({ sku:s.sku, nombre:s.nombre, negocio:s.negocio, marca:s.marca,
                 venta:round2_(s.venta), clientes:s.clientes.size, unidades:Math.round(s.unidades) }))
    .sort((a, b) => b.venta - a.venta)
    .slice(0, 20);

  const por_vendedor = Object.entries(vendSkuMap).map(([cod, skus]) => ({
    cod,
    skus: Object.values(skus)
      .map(s => ({ sku:s.sku, nombre:s.nombre, negocio:s.negocio,
                   venta:round2_(s.venta), clientes:s.clientes.size }))
      .sort((a, b) => b.venta - a.venta)
      .slice(0, 5)
  }));

  return { global, por_vendedor };
}

// ════════════════════════════════════════════════════════════════════
// TOP MARCAS
// ════════════════════════════════════════════════════════════════════
// TOP CLIENTES (global + por vendedor)
// ════════════════════════════════════════════════════════════════════

function getTopClientes() {
  const mesData   = getBasePeriodoActual_();
  const globalMap = {};   // cod_cliente → { cod_cliente, nombre, venta }
  const vendMap   = {};   // cod_asesor  → { cod_vendedor, nom_vendedor, clientes:{} }

  mesData.forEach(function(r) {
    if (!esFilaBaseValida_(r)) return;
    const codCli  = String(r[1]  || '').trim();
    const nomCli  = String(r[2]  || '').trim();
    const codAs   = obtenerCodAsesor_(String(r[3] || ''));
    const nomVend = String(r[4]  || '').trim();
    const valor   = parseFloat(r[14]) || 0;

    if (!codCli || !codAs) return;
    if (valor <= 0) return;

    // Acumulado global
    if (!globalMap[codCli]) globalMap[codCli] = { cod_cliente: codCli, nombre: nomCli, venta: 0 };
    globalMap[codCli].venta += valor;

    // Acumulado por vendedor
    if (!vendMap[codAs]) vendMap[codAs] = { cod_vendedor: codAs, nom_vendedor: nomVend, clientes: {} };
    if (!vendMap[codAs].clientes[codCli])
      vendMap[codAs].clientes[codCli] = { cod_cliente: codCli, nombre: nomCli, venta: 0 };
    vendMap[codAs].clientes[codCli].venta += valor;
  });

  const top_global = Object.values(globalMap)
    .sort(function(a, b) { return b.venta - a.venta; })
    .slice(0, 10)
    .map(function(c, i) { return { ranking: i + 1, cod_cliente: c.cod_cliente, nombre: c.nombre, venta: round2_(c.venta) }; });

  const top_por_vendedor = Object.entries(vendMap).map(function(entry) {
    var cod = entry[0], v = entry[1];
    return {
      cod_vendedor: cod,
      nom_vendedor: v.nom_vendedor,
      top10: Object.values(v.clientes)
        .sort(function(a, b) { return b.venta - a.venta; })
        .slice(0, 10)
        .map(function(c, i) { return { ranking: i + 1, cod_cliente: c.cod_cliente, nombre: c.nombre, venta: round2_(c.venta) }; })
    };
  });

  return { top_global: top_global, top_por_vendedor: top_por_vendedor };
}

// ════════════════════════════════════════════════════════════════════

function getTopMarcas() {
  const mesData  = getBasePeriodoActual_();
  const marcaMap = {};

  mesData.forEach(r => {
    const marca   = String(r[10] || '').trim();
    const negocio = String(r[8]  || '').trim();
    const valor   = parseFloat(r[14]) || 0;
    if (!marca || valor <= 0) return;
    if (!marcaMap[marca]) marcaMap[marca] = { marca, negocio, venta:0, clientes:new Set() };
    marcaMap[marca].venta += valor;
    marcaMap[marca].clientes.add(String(r[1]));
  });

  const total = Object.values(marcaMap).reduce((s, m) => s + m.venta, 0);

  return Object.values(marcaMap)
    .map(m => ({
      marca:    m.marca,
      negocio:  m.negocio,
      venta:    round2_(m.venta),
      clientes: m.clientes.size,
      pct:      total > 0 ? round2_(m.venta / total * 100) : 0
    }))
    .sort((a, b) => b.venta - a.venta)
    .slice(0, 15);
}

// ════════════════════════════════════════════════════════════════════
// DIAGNÓSTICO DE API
// ════════════════════════════════════════════════════════════════════

function getDiagnosticoAPI() {
  const ss = getSS_();
  const hojas = [
    HOJAS.BASE, HOJAS.DEVOLUCIONES, HOJAS.RESUMEN_COBERTURA,
    HOJAS.COBERTURA_NEGOCIO, HOJAS.EFECTIVIDAD, HOJAS.EFECTIVIDAD_RESUMEN,
    HOJAS.CLIENTES_CERO, HOJAS.MAESTRO_CLIENTES, HOJAS.CUOTAS
  ];

  const resumenHojas = hojas.map(nombre => {
    const h = ss.getSheetByName(nombre);
    return { hoja:nombre, existe:!!h, filas:h?h.getLastRow():0, columnas:h?h.getLastColumn():0 };
  });

  const periodo     = getPeriodoActualDesdeBase_();
  const vendedores  = getVendedores();
  const devoluciones= getDevoluciones();
  const cuotas      = getCuotas();

  return {
    periodo_actual:          periodo,
    hojas:                   resumenHojas,
    vendedores_activos:      vendedores.length,
    devolucion_total:        devoluciones.total,
    vendedores_con_devolucion: devoluciones.por_vendedor.length,
    cuotas_configuradas:     cuotas.length,
    cuota_total_equipo:      cuotas.reduce((s, c) => s + c.cuota, 0)
  };
}
