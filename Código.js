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
    .addItem('4. Clientes cero (desde BASE)',  'calcularClientesCero')
    .addItem('4b. ✅ Clientes cero (desde ECOM)', 'procesarFrecuenciaECOM')
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

// Diagnóstico temporal: inspecciona MAESTRO_CLIENTES en crudo (headers +
// muestra de filas de un vendedor) para ver si hay alguna columna de
// "rutero válido" distinta de estado='A' que el sistema oficial use y que
// Código.js no esté considerando. Solo lectura, no escribe nada.
function debugMaestroClientes_(codAsesorParam) {
  const cod = codAsesorParam ? obtenerCodAsesor_(String(codAsesorParam)) : '';
  const hM = getSheet_(HOJAS.MAESTRO_CLIENTES);
  if (!hM || hM.getLastRow() < 2) return { ok: false, error: 'MAESTRO_CLIENTES vacía' };

  const allData = hM.getDataRange().getValues();
  const headers = allData[0].map((h, i) => `[${i}] ${h}`);

  const filasVendedor = [];
  let totalActivas = 0, totalParaCod = 0;
  for (let i = 1; i < allData.length; i++) {
    const r = allData[i];
    const estado = String(r[19] || '').trim().toUpperCase();
    if (estado === 'A') totalActivas++;
    const asesorRaw = String(r[20] || '').trim();
    const codV = obtenerCodAsesor_(asesorRaw);
    if (cod && codV === cod) {
      totalParaCod++;
      if (filasVendedor.length < 30) {
        filasVendedor.push({ fila: i + 1, valores: r, estado, asesor_raw: asesorRaw });
      }
    }
  }

  return {
    ok: true,
    cod_asesor: cod || null,
    total_filas_hoja:    allData.length - 1,
    total_estado_A:      totalActivas,
    total_para_vendedor: totalParaCod,
    headers,
    muestra_filas_vendedor: filasVendedor,
  };
}

// Debug temporal de solo lectura — dump de encabezados + muestra de filas de
// BASE_ACUMULADA para un vendedor, para confirmar qué columna es factura/doc
// y cuál es producto/SAP antes de construir el diagnóstico de venta positiva.
function debugBaseAcumulada_(codAsesorParam) {
  const cod = codAsesorParam ? obtenerCodAsesor_(String(codAsesorParam)) : '';
  const hB = getSheet_(HOJAS.BASE);
  if (!hB || hB.getLastRow() < 2) return { ok: false, error: 'BASE_ACUMULADA vacía' };
  const allData = hB.getDataRange().getValues();
  const headers = allData[0].map((h, i) => `[${i}] ${h}`);
  const muestra = [];
  for (let i = 1; i < allData.length && muestra.length < 15; i++) {
    const r = allData[i];
    if (cod && obtenerCodAsesor_(r[3]) !== cod) continue;
    muestra.push(r);
  }
  return { ok: true, headers, muestra };
}

// Diagnóstico de SOLO LECTURA: ¿qué 9 clientes de los 246 de PALMA podrían
// no pertenecer al Rutero oficial? Reproduce EXACTAMENTE el mismo filtro
// (estado==='A' + cod_asesor) que hoy usa calcularCoberturaNegocio() para
// construir el universo, expone cada columna candidata, agrupa conteos y
// detecta duplicados. No modifica ninguna hoja, no recalcula nada.
// Uso: /api/datos?sheet=auditoria_universo_vendedor&cod_asesor=208
function getAuditoriaUniversoVendedor_(codAsesorParam) {
  const cod = codAsesorParam ? obtenerCodAsesor_(String(codAsesorParam)) : '';
  if (!cod) return { ok: false, error: 'Falta parámetro cod_asesor' };

  const hM = getSheet_(HOJAS.MAESTRO_CLIENTES);
  if (!hM || hM.getLastRow() < 2) return { ok: false, error: 'MAESTRO_CLIENTES vacía' };

  const allData = hM.getDataRange().getValues();
  let nombreVendedor = '';

  // Filas crudas asignadas a este asesor, ANTES de deduplicar por cod_cliente
  const filasCrudas = [];
  for (let i = 1; i < allData.length; i++) {
    const r = allData[i];
    const asesorRaw = String(r[20] || '').trim();
    const codV = obtenerCodAsesor_(asesorRaw);
    if (codV !== cod) continue;
    if (!nombreVendedor && asesorRaw) nombreVendedor = asesorRaw;

    filasCrudas.push({
      fila:              i + 1,
      cod_cliente:       normalizarCodigoCliente_(r[0]),
      cod_cliente_raw:   String(r[0]),
      cliente:           String(r[1]  || '').trim(),
      direccion:         String(r[6]  || '').trim(),
      telefono:          String(r[7]  || '').trim(),
      dia_visita:        String(r[8]  || '').trim(),
      frecuencia_visita: String(r[9]  || '').trim(),
      segmento:          String(r[23] || '').trim(),
      // Hay dos columnas "Canal" en la hoja ([24] y [30]) — [30] es la que
      // viene poblada en la práctica; se usa como principal con [24] de respaldo.
      canal:             String(r[30] || '').trim() || String(r[24] || '').trim(),
      sub_canal:         String(r[31] || '').trim(),
      sector:            String(r[25] || '').trim(),
      estado:            String(r[19] || '').trim(),
      asesor:            asesorRaw,
      cod_asesor:        codV,
      fecha_creacion:    r[27] instanceof Date ? Utilities.formatDate(r[27], TZ, 'yyyy-MM-dd') : String(r[27] || '').trim(),
    });
  }

  // Mismo filtro que hoy usa calcularCoberturaNegocio()/cargarMaestroActivos_
  // para construir el universo de 246: estado==='A' + dedup por cod_cliente.
  const universoMap = {};
  filasCrudas.forEach(f => {
    if (f.estado.toUpperCase() !== 'A') return;
    if (!universoMap[f.cod_cliente]) universoMap[f.cod_cliente] = f;
  });
  const filasMaestro = Object.values(universoMap);

  function contarPor(campo) {
    const map = {};
    filasMaestro.forEach(f => {
      const v = f[campo] || '(vacío)';
      map[v] = (map[v] || 0) + 1;
    });
    return Object.entries(map)
      .map(([valor, count]) => ({ valor, count }))
      .sort((a, b) => b.count - a.count);
  }

  const conteos = {
    por_estado:            contarPor('estado'),
    por_dia_visita:        contarPor('dia_visita'),
    por_frecuencia_visita: contarPor('frecuencia_visita'),
    por_segmento:          contarPor('segmento'),
    por_canal:             contarPor('canal'),
    por_sub_canal:         contarPor('sub_canal'),
    por_sector:            contarPor('sector'),
  };

  const normTxt_ = s => String(s || '').toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

  function agruparDuplicados(keyFn) {
    const map = {};
    filasMaestro.forEach(f => {
      const k = keyFn(f);
      if (!k) return;
      if (!map[k]) map[k] = [];
      map[k].push(f);
    });
    return Object.values(map).filter(arr => arr.length > 1);
  }

  const duplicados_por_codigo        = agruparDuplicados(f => f.cod_cliente);
  const duplicados_por_nombre        = agruparDuplicados(f => normTxt_(f.cliente));
  const duplicados_por_codigo_nombre = agruparDuplicados(f => f.cod_cliente + '||' + normTxt_(f.cliente));
  const duplicados_por_direccion     = agruparDuplicados(f => normTxt_(f.direccion));

  // Candidatos a exclusión — heurística basada en campos vacíos típicos de
  // un cliente sin ruta real asignada. No es una decisión, solo una pista.
  const posibles_excluidos = [];
  filasMaestro.forEach(f => {
    const motivos = [];
    if (!f.frecuencia_visita) motivos.push('frecuencia_visita vacía');
    if (!f.dia_visita)        motivos.push('dia_visita vacío');
    if (!f.canal)             motivos.push('canal vacío');
    if (!f.sub_canal)         motivos.push('sub_canal vacío');
    if (motivos.length) {
      posibles_excluidos.push({
        cod_cliente: f.cod_cliente, cliente: f.cliente, direccion: f.direccion,
        dia_visita: f.dia_visita, frecuencia_visita: f.frecuencia_visita,
        segmento: f.segmento, canal: f.canal, sub_canal: f.sub_canal, sector: f.sector,
        motivo_sospecha: motivos.join(' + '),
      });
    }
  });

  // Referencia conocida del sistema oficial (solo la tenemos para 208 por ahora,
  // tomada de REFERENCIA_COB_NEG — mismo Rutero en Cárnico y Café).
  const refSistema = REFERENCIA_COB_NEG['Cárnico'] && REFERENCIA_COB_NEG['Cárnico'][cod];

  return {
    ok: true,
    cod_asesor: cod,
    vendedor: nombreVendedor,
    palma_universo:      filasMaestro.length,
    filas_crudas_total:  filasCrudas.length,
    sistema_rutero:      refSistema ? refSistema.rutero : null,
    diferencia:          refSistema ? filasMaestro.length - refSistema.rutero : null,
    conteos,
    duplicados_por_codigo,
    duplicados_por_nombre,
    duplicados_por_codigo_nombre,
    duplicados_por_direccion,
    posibles_excluidos,
    filas_maestro: filasMaestro,
  };
}

// Diagnóstico de solo lectura — identifica, para un vendedor + negocio dado,
// los clientes del universo (maestroSet) que tienen movimiento en el período
// actual pero NO quedan marcados "impactados" por calcularCoberturaNegocio()
// (porque todas sus filas de ese negocio tienen cantidad<=0, ej. solo
// devoluciones). No cambia lógica ni escribe nada — solo lista candidatos
// para explicar la diferencia Impactados PALMA vs Impactados sistema.
function getDiagnosticoImpactadosNegocio_(codAsesorParam, negocioParam) {
  const cod = codAsesorParam ? obtenerCodAsesor_(String(codAsesorParam)) : '';
  if (!cod) return { ok: false, error: 'Falta parámetro cod_asesor' };
  const negocioObjetivo = normNegMiG_(String(negocioParam || '').trim());
  if (!negocioObjetivo) return { ok: false, error: 'Falta parámetro negocio' };

  const hB = getSheet_(HOJAS.BASE);
  const hM = getSheet_(HOJAS.MAESTRO_CLIENTES);
  if (!hB || !hM) return { ok: false, error: 'Faltan hojas BASE_ACUMULADA o MAESTRO_CLIENTES' };

  // Mismo universo (maestroSet) que usa calcularCoberturaNegocio(): estado='A' + dedup.
  const maestroData = hM.getDataRange().getValues();
  const maestroSet = new Set();
  const nombreMaestro = {};
  maestroData.slice(1).forEach(r => {
    const asesorRaw = String(r[20] || '').trim();
    const codV = obtenerCodAsesor_(asesorRaw);
    if (codV !== cod) return;
    if (String(r[19] || '').trim().toUpperCase() !== 'A') return;
    const cli = normalizarCodigoCliente_(r[0]);
    if (!cli) return;
    maestroSet.add(cli);
    if (!nombreMaestro[cli]) nombreMaestro[cli] = String(r[1] || '').trim();
  });

  const baseData = hB.getDataRange().getValues().slice(1);
  let periodoCalc = '';
  baseData.forEach(r => {
    const v = r[18];
    const p = v instanceof Date
      ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}`
      : String(v || '').substring(0, 7);
    if (p > periodoCalc) periodoCalc = p;
  });

  // Por cliente: todas las filas de este negocio+período, separando filas con
  // cant>0 (las que SÍ marcan "impactado" hoy) de las que no.
  const porCliente = {};
  baseData.forEach(r => {
    const v = r[18];
    const p = v instanceof Date
      ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}`
      : String(v || '').substring(0, 7);
    if (p !== periodoCalc) return;
    if (!esFilaBaseValida_(r)) return;
    const codV = obtenerCodAsesor_(r[3]);
    if (codV !== cod) return;
    const negRaw = String(r[8] || '').trim();
    if (normNegMiG_(negRaw) !== negocioObjetivo) return;
    const cli = normalizarCodigoCliente_(r[1]);
    if (!cli) return;
    const cant  = parseFloat(r[13]) || 0;
    const venta = parseFloat(r[14]) || 0;
    if (!porCliente[cli]) porCliente[cli] = { cod_cliente: cli, filas: 0, cant_positivas: 0, cant_no_positivas: 0, venta_total: 0, venta_filas_positivas: 0 };
    const acc = porCliente[cli];
    acc.filas++;
    acc.venta_total += venta;
    if (cant > 0) { acc.cant_positivas++; acc.venta_filas_positivas += venta; }
    else acc.cant_no_positivas++;
  });

  const impactadosPalma = [];
  const candidatosExclusion = []; // en maestroSet, con movimiento, pero NUNCA cant>0
  let ventaImpactadosPalma = 0;
  Object.values(porCliente).forEach(acc => {
    if (!maestroSet.has(acc.cod_cliente)) return; // fuera del universo — no aplica
    const cliente = { ...acc, cliente: nombreMaestro[acc.cod_cliente] || '' };
    if (acc.cant_positivas > 0) {
      impactadosPalma.push(cliente);
      ventaImpactadosPalma += acc.venta_filas_positivas;
    } else {
      candidatosExclusion.push(cliente);
    }
  });

  return {
    ok: true,
    cod_asesor: cod,
    negocio: negocioObjetivo,
    periodo: periodoCalc,
    universo_total: maestroSet.size,
    impactados_palma: impactadosPalma.length,
    venta_impactados_palma: round2_(ventaImpactadosPalma),
    candidatos_exclusion: candidatosExclusion, // clientes con movimiento (solo cant<=0, ej. solo devoluciones) que el sistema podría contar como atendidos
    impactados_detalle: impactadosPalma,
  };
}


// Respaldo manual de COBERTURA_NEGOCIO antes de recalcular — copia completa
// de la hoja (valores, formato, fórmulas) con nombre con timestamp, nunca
// sobrescribe un backup existente. No borra ni modifica la hoja original.
function backupCoberturaNegocio_() {
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const hCN = ss.getSheetByName('COBERTURA_NEGOCIO');
  if (!hCN) return { ok: false, error: 'No existe la hoja COBERTURA_NEGOCIO' };

  const stamp  = Utilities.formatDate(new Date(), TZ, 'yyyy_MM_dd_HHmmss');
  const nombre = 'BACKUP_COBERTURA_NEGOCIO_' + stamp + '_ANTES_FIX';

  const copia = hCN.copyTo(ss);
  copia.setName(nombre);
  copia.hideSheet();

  return {
    ok: true,
    backup_sheet: nombre,
    filas_respaldadas: hCN.getLastRow(),
  };
}

// ── COBERTURA POR NEGOCIO ─────────────────────────────────────────
// ── Negocio de respaldo cuando BASE_ACUMULADA llega con r[8] vacío ──────────
// Algunos SKU llegan sin negocio asignado en BASE_ACUMULADA aunque sí lo
// tienen en PRODUCTOS_CLAVE (ej. SALCH. HOTDOG BLUE RIBBON, CAFE COLCAFE
// GRANULADO). Sin este respaldo esa venta/cantidad queda fuera de
// COBERTURA_NEGOCIO por completo. Construido dinámicamente desde
// PRODUCTOS_CLAVE — nunca se queman SAP en código.
function construirContextoNegocioFallback_(baseData, periodoCalc) {
  const mapaSkuNegocio = {};
  cargarProductosClave_().todos.forEach(p => {
    if (p.sap && p.negocio) mapaSkuNegocio[limpiarSap_(p.sap)] = normNegMiG_(p.negocio);
  });

  // Para no fragmentar COBERTURA_NEGOCIO con un string nuevo (ej. "Cárnico")
  // cuando el resto de filas usa el crudo real (ej. "01-Carnico"), se resuelve
  // al raw más frecuente que YA existe en BASE_ACUMULADA para ese negocio
  // normalizado, en vez de usar el valor del catálogo directamente.
  const frecPorNegNorm = {}; // negNormalizado -> { raw: count }
  baseData.forEach(r => {
    const v = r[18];
    const p = v instanceof Date
      ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}`
      : String(v || '').substring(0, 7);
    if (p !== periodoCalc) return;
    const raw = String(r[8] || '').trim();
    if (!raw) return;
    const norm = normNegMiG_(raw);
    if (!frecPorNegNorm[norm]) frecPorNegNorm[norm] = {};
    frecPorNegNorm[norm][raw] = (frecPorNegNorm[norm][raw] || 0) + 1;
  });
  const rawCanonicoPorNegocio = {};
  Object.entries(frecPorNegNorm).forEach(([norm, conteos]) => {
    rawCanonicoPorNegocio[norm] = Object.entries(conteos).sort((a, b) => b[1] - a[1])[0][0];
  });

  return { mapaSkuNegocio, rawCanonicoPorNegocio };
}

function resolverNegocioFinal_(negocioRaw, sap, ctx) {
  const neg = String(negocioRaw || '').trim();
  if (neg) return neg;
  const negNorm = ctx.mapaSkuNegocio[limpiarSap_(sap)];
  if (!negNorm) return 'Sin negocio identificado';
  return ctx.rawCanonicoPorNegocio[negNorm] || negNorm;
}

function calcularCoberturaNegocio() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hB = ss.getSheetByName('BASE_ACUMULADA');
  const hM = ss.getSheetByName('MAESTRO_CLIENTES');
  // SpreadsheetApp.getUi() solo funciona en contexto de menú de Sheets, no
  // al invocar esta función vía el web app (doGet) — degradar sin romper.
  let ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (_) { /* sin UI disponible */ }

  if (!hB || !hM) {
    const msg = 'Faltan hojas BASE_ACUMULADA o MAESTRO_CLIENTES.';
    if (ui) ui.alert('ERROR', msg, ui.ButtonSet.OK);
    else throw new Error(msg);
    return;
  }

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
    const cli    = normalizarCodigoCliente_(r[0]);
    const asesor = String(r[20] || '').trim();
    const estado = String(r[19] || '').trim().toUpperCase();
    if (!cli || !asesor || estado !== 'A') return;
    const cod = obtenerCodAsesor_(asesor);
    if (!esVendedorValido_(cod, asesor)) return;
    if (!cod || !codsValidos.has(cod)) return;
    if (!maestroMap[cod]) maestroMap[cod] = new Set();
    maestroMap[cod].add(cli);
  });

  const ctxNegocio = construirContextoNegocioFallback_(baseData, periodoCalc);

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
    const codC = normalizarCodigoCliente_(r[1]);
    const neg  = resolverNegocioFinal_(r[8], r[6], ctxNegocio);
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
      .map(r => normalizarCodigoCliente_(r[1]))
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
  CUOTAS:             'CUOTAS',           // metas mensuales por asesor
  CARTERA:            'CARTERA',          // reporte CxC (pegar desde sistema)
  PRODUCTOS_CLAVE:    'PRODUCTOS_CLAVE',  // catálogo: Nombre|Detalle|GTINSE|SAP|Negocio|TR|Estado
  COMBOS:             'COMBOS'            // combos activos: SAP|PRODUCTO|NEGOCIO|META_UNIDADES|META_CLIENTES|ACTIVO
};

// ════════════════════════════════════════════════════════════════════
// PUNTO DE ENTRADA PRINCIPAL
// ════════════════════════════════════════════════════════════════════

function doGet(e) {
  if (!e) e = { parameter: {} };

  const callback = e.parameter.callback || '';
  const sheet    = String(e.parameter.sheet || 'resumen').toLowerCase();
  const t0       = Date.now();

  try {
    let data;

    switch (sheet) {
      // ── Rápidos: leen hojas pre-computadas (<3 s) ──────────────────────────
      case 'cobertura':       data = getCobertura();           break;
      case 'cob_negocio':     data = getCoberturaNegocios();   break;
      case 'efectividad':     data = getEfectividad();         break;
      case 'cuotas':          data = getCuotas();              break;
      case 'cartera':         data = getCartera();             break;
      case 'clientes_cero':   data = getClientesCero();        break;
      case 'clientes_nuevos': data = getClientesNuevos(e.parameter.desde, e.parameter.hasta); break;
      case 'productos_clave': data = getProductosClave_();     break;
      case 'config':          data = getConfig_();             break;

      // ── Pesados: leen BASE_ACUMULADA — con cache 300 s ────────────────────
      case 'resumen':
        data = withCache_('resumen',      300, getResumen);      break;
      case 'vendedores':
        data = withCache_('vendedores',   300, getVendedores);   break;
      case 'devoluciones':
        data = withCache_('devoluciones', 300, getDevoluciones); break;
      case 'tendencia':
        data = withCache_('tendencia',    300, getTendencia);    break;
      case 'marcas':
        data = withCache_('marcas',       300, getTopMarcas);    break;
      case 'skus':
        data = withCache_('skus',         300, getTopSKUs);      break;
      case 'top_clientes':
        data = withCache_('top_clientes', 300, getTopClientes);  break;
      case 'necesidad_cliente':
        data = withCache_('necesidad',    300, getNecesidadCliente); break;
      case 'dn_marcas':
        data = withCache_('dn_marcas',    300, getDNMarcas);     break;
      case 'cobertura_marcas':
        data = withCache_('cobertura_marcas', 300, getCoberturaMarcas_); break;
      case 'mi_gerencia':
        data = withCache_('mi_gerencia',  300, getMiGerencia_);  break;

      // ── Combos ───────────────────────────────────────────────────────────
      case 'combos':
        data = withCache_('combos',          300, getCombos_);          break;
      case 'combos_resumen':
        data = withCache_('combos_resumen',  300, getCombosResumen_);   break;
      case 'combos_vendedor':
        data = withCache_('combos_vendedor', 300, getCombosVendedor_);  break;
      case 'combos_detalle':
        data = withCache_('combos_detalle',         300, getCombosDetalle_);          break;
      case 'combos_vendedor_detalle':
        data = withCache_('combos_vend_detalle',    300, getCombosVendedorDetalle_);  break;

      // ── Productos clave (pesados) ─────────────────────────────────────────
      case 'cobertura_productos_clave':
        data = withCache_('cob_pc',          300, getCoberturaProductosClave_);         break;
      case 'cobertura_pc_vendedor':
        data = withCache_('cob_pc_vend',     300, getCoberturaProductosClaveVendedor_); break;
      case 'clientes_sin_pc':
        data = withCache_('clientes_sin_pc', 300, getClientesSinProductosClave_);       break;
      case 'pc_detalle':
        data = withCache_('pc_detalle',      300, getProductosClaveDetalle_);           break;

      // ── Utilidades ────────────────────────────────────────────────────────
      case 'warm_cache':
        warmCache_();
        data = { ok: true, ms: Date.now() - t0 };
        break;
      case 'invalidar_cache':
        invalidarCache_();
        data = { ok: true };
        break;
      case 'backup_cobertura_negocio':
        data = backupCoberturaNegocio_();
        break;
      case 'debug_maestro_clientes':
        data = debugMaestroClientes_(e.parameter.cod_asesor);
        break;
      case 'debug_base_acumulada':
        data = debugBaseAcumulada_(e.parameter.cod_asesor);
        break;
      case 'auditoria_universo_vendedor':
        // Solo lectura — no recalcula ni toca COBERTURA_NEGOCIO.
        data = getAuditoriaUniversoVendedor_(e.parameter.cod_asesor);
        break;
      case 'diagnostico_impactados_negocio':
        // Solo lectura — no recalcula ni toca COBERTURA_NEGOCIO.
        data = getDiagnosticoImpactadosNegocio_(e.parameter.cod_asesor, e.parameter.negocio);
        break;
      case 'auditoria_cant_neta_todos':
        // Solo lectura — regla OFICIAL (cant_neta>0) para los 14 vendedores × Cárnico/Café.
        data = withCache_('audit_cantneta_todos', 60, getAuditoriaCantNetaTodos_);
        break;
      case 'diagnostico_negocio_variantes':
        // Solo lectura — fragmentación de strings crudos de negocio (Cárnico/Café).
        data = withCache_('diag_neg_variantes', 60, getDiagnosticoNegocioVariantes_);
        break;
      case 'diagnostico_sku_negocio':
        // Solo lectura — SKUs cuyo negocio en PRODUCTOS_CLAVE no coincide con BASE_ACUMULADA.
        data = withCache_('diag_sku_negocio', 60, getDiagnosticoSkuNegocio_);
        break;
      case 'diagnostico_concentracion_fecha':
        // Solo lectura — venta de Cárnico/Café por fecha de carga, para un vendedor.
        data = getDiagnosticoConcentracionFecha_(e.parameter.cod_asesor);
        break;
      case 'detalle_cobertura_negocio':
        // Solo lectura — detalle exportable cliente/SKU para cruzar contra el sistema oficial.
        data = withCache_('detalle_cobneg_' + e.parameter.cod_asesor + '_' + e.parameter.negocio, 60,
          function() { return getDetalleCoberturaNegocio_(e.parameter.cod_asesor, e.parameter.negocio); });
        break;
      case 'recalcular_cobertura_negocio':
        // Dispara vía HTTP lo mismo que el menú "🌴 PALMA → 3. Cobertura por
        // negocio" — recalcula y reescribe la hoja COBERTURA_NEGOCIO completa.
        calcularCoberturaNegocio();
        data = { ok: true, ms: Date.now() - t0 };
        break;
      case 'cuota_debug':       data = getCuotaDebug_();       break;
      case 'diagnostico':       data = getDiagnosticoAPI();    break;
      case 'fechas_debug':      data = getFechasDebug_();      break;
      case 'auditoria_resumen':
        data = withCache_('audit_' + (e.parameter.modo || 'light'), 60,
          function() { return getAuditoriaResumen_(e.parameter.modo || 'light'); });
        break;
      case 'auditoria_vendedor': {
        // Escanea BASE_ACUMULADA completa (sin cache tarda >9s, supera el
        // timeout del proxy de Vercel) — cache corto de 60s por vendedor,
        // suficiente para que siga siendo "casi en vivo" para auditorías
        // puntuales sin romper el proxy. invalidar_cache también lo limpia.
        const codAud = e.parameter.cod_asesor;
        data = withCache_('audit_vend_' + codAud, 60,
          function() { return getAuditoriaVendedor_(codAud); });
        break;
      }
      case 'auditoria_cobertura_negocio': {
        const codAudCN = e.parameter.cod_asesor || '';
        data = withCache_('audit_cobneg_' + codAudCN, 60,
          function() { return getAuditoriaCoberturaNegocio_(codAudCN); });
        break;
      }
      case 'auditoria_universos_clientes':
        // Solo lectura — audita los tres universos de clientes (2608/2670/2674).
        data = getAuditoriaUniversosClientes_();
        break;
      default:                  data = getResumen();           break;
    }

    Logger.log('[doGet] sheet=' + sheet + ' ms=' + (Date.now() - t0));
    return output_({ ok: true, data, ts: new Date().toISOString() }, callback);

  } catch (err) {
    Logger.log('[doGet ERROR] sheet=' + sheet + ' ms=' + (Date.now() - t0) + ' err=' + (err && err.message));
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

// Averías: daño físico al producto (transporte, empaque, vencimiento).
// "AVALADOS POR VENTAS" y "AVALADOS POR CALIDAD" quedan como devolución normal.
const CONCEPTOS_AVERIA_ = [
  // Variantes exactas normalizadas (sin tildes, sin espacios)
  'PRODUCTOVENCIDO', 'PRODUCTOSENVENCIDOS', 'VENCIDO', 'VENCIDOS',
  'AVERIAENTRANSPORTE', 'AVERIATRANSPORTE', 'AVERIA', 'AVERIAS',
  'PERDIDADEVACIO', 'PERDIDA', 'PERDIDAVACIO', 'VACIO',
  'MERMA', 'MERMAS', 'DANOENTRANSPORTE', 'DANOPRODUCTO', 'DANO',
  'MALESTADO', 'DETERIORO', 'CONTAMINADO', 'CONTAMINACION',
  'CADUCADO', 'CADUCADOS', 'EXPIRADO', 'EXPIRADOS',
];
// Palabras parciales: si el concepto contiene alguna de estas raíces (normalizado)
const CONCEPTOS_AVERIA_PARCIAL_ = [
  'AVERIA', 'VENCIDO', 'PERDIDA', 'VACIO', 'MERMA', 'DANO', 'MALO',
];

function esAveria_(concepto) {
  var norm = normalizarTexto_(concepto);
  if (CONCEPTOS_AVERIA_.includes(norm)) return true;
  for (var i = 0; i < CONCEPTOS_AVERIA_PARCIAL_.length; i++) {
    if (norm.indexOf(CONCEPTOS_AVERIA_PARCIAL_[i]) >= 0) return true;
  }
  return false;
}

function normalizarHeader_(header) {
  return String(header || '')
    .trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

/**
 * Busca el índice de una columna entre varios nombres posibles.
 * Normaliza quitando tildes, espacios, guiones y comparando en MAYÚSCULAS.
 * Retorna -1 si no se encuentra ninguna de las variantes.
 */
function findCol_(headers, posibles) {
  function norm(s) {
    return String(s || '').trim().toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[\s_\-]+/g, '');
  }
  const headersNorm = headers.map(norm);
  for (var i = 0; i < posibles.length; i++) {
    var idx = headersNorm.indexOf(norm(posibles[i]));
    if (idx >= 0) return idx;
  }
  return -1;
}

/**
 * Convierte cualquier representación monetaria a número.
 * Soporta: 14688, "14.688", "14,688", "$14,688.00", "(14688)" (negativo).
 * Para vlr_devol siempre retorna el valor absoluto.
 */
function parseMoney_(v) {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  var s = String(v || '').trim();
  if (!s) return 0;
  var negativo = /^\(.*\)$/.test(s) || s.startsWith('-');
  // Quitar símbolos no numéricos excepto , . -
  s = s.replace(/[^\d,.\-]/g, '').replace(/\s/g, '');
  if (!s) return 0;
  // Si tiene coma Y punto: coma=miles, punto=decimal → quitar comas
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/,/g, '');
  } else if (s.includes(',') && !s.includes('.')) {
    // Solo coma: si hay exactamente 2 dígitos después, es decimal; si no, es miles
    var parts = s.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      s = s.replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  }
  var n = Number(s);
  if (isNaN(n)) return 0;
  return negativo ? -Math.abs(n) : n;
}

/**
 * Detecta la posición de cada columna de DEVOLUCIONES por nombre (robusto a cambios de estructura).
 * Se llama UNA vez por ejecución y el resultado se reutiliza.
 */
var _DEVOL_COL_MAP = null;
function getDevolucionesColMap_(headers) {
  // Si ya fue calculado en esta ejecución (múltiples llamadas al mismo endpoint), reutilizar
  if (_DEVOL_COL_MAP && _DEVOL_COL_MAP._headers === JSON.stringify(headers)) {
    return _DEVOL_COL_MAP;
  }
  function fc(posibles) { return findCol_(headers, posibles); }
  var map = {
    _headers:     JSON.stringify(headers),
    periodo_mes:  fc(['PERIODO MES','PERIODO_MES','FECHA MES','FECHA','MES','PERIODO']),
    cod_asesor:   fc(['COD ASESOR','COD_ASESOR','CODIGO ASESOR','COD VENDEDOR','CODIGO VENDEDOR','ASESOR COD']),
    nom_vendedor: fc(['NOM VENDEDOR','NOM_VENDEDOR','NOMBRE VENDEDOR','VENDEDOR','ASESOR','NOMBRE ASESOR','NOM ASESOR']),
    cod_cliente:  fc(['COD CLIENTE','COD_CLIENTE','CODIGO CLIENTE','ID CLIENTE','NIT','CLIENTE COD']),
    nom_cliente:  fc(['NOM CLIENTE','NOM_CLIENTE','NOMBRE CLIENTE','CLIENTE','RAZON SOCIAL']),
    factura:      fc(['FACTURA','NUM FACTURA','NUMERO FACTURA','NRO FACTURA','DOC','DOCUMENTO']),
    cod_sku:      fc(['COD SKU','COD_SKU','SKU','CODIGO PRODUCTO','COD PRODUCTO','PRODUCTO COD']),
    nom_producto: fc(['NOM PRODUCTO','NOM_PRODUCTO','NOMBRE PRODUCTO','PRODUCTO','DESCRIPCION','ARTICULO']),
    cantidad:     fc(['CANTIDAD','CANT','QTY','UNIDADES']),
    costo_unit:   fc(['COSTO UNIT','COSTO_UNIT','COSTO UNITARIO','PRECIO UNIT','PRECIO']),
    vlr_devol:    fc(['VLR DEVOL','VLR_DEVOL','VALOR DEVOLUCION','VALOR DEVOLUCION','VALOR DEVOLUC','VLRDEVOLUCION','VALOR','TOTAL','MONTO','IMPORTE','VLR']),
    concepto:     fc(['CONCEPTO','CAUSAL','MOTIVO','RAZON','RAZON DEVOLUCION','TIPO DEVOLUCION','TIPO']),
    tipo_producto:fc(['TIPO PRODUCTO','TIPO_PRODUCTO','TIPO PROD','NEGOCIO','LINEA']),
    periodo_filtro:fc(['PERIODO FILTRO','PERIODO_FILTRO','PERIODO CONTABLE','PERIODO DASHBOARD','PERIODO DASHBOARD','MES FILTRO','PERIODO CIERRE']),
  };
  _DEVOL_COL_MAP = map;
  // Log diagnóstico: qué columnas se detectaron y cuáles faltan
  var faltantes = ['vlr_devol','concepto','nom_vendedor','periodo_filtro'].filter(function(k) { return map[k] < 0; });
  Logger.log('[DevColMap] headers=' + JSON.stringify(headers.slice(0,15)));
  Logger.log('[DevColMap] vlr_devol=' + map.vlr_devol + ' concepto=' + map.concepto +
    ' cod_asesor=' + map.cod_asesor + ' nom_vendedor=' + map.nom_vendedor +
    ' periodo_filtro=' + map.periodo_filtro + ' periodo_mes=' + map.periodo_mes);
  if (faltantes.length) {
    Logger.log('[DevColMap] ⚠ COLUMNAS CRÍTICAS NO ENCONTRADAS: ' + faltantes.join(', '));
  }
  return map;
}

function obtenerCodAsesor_(valor) {
  return String(valor || '').split('-')[0].trim();
}

// Defensivo: si Excel/Sheets convirtió un código de cliente numérico largo a
// notación científica ("9E+12") o a float con ".0" al exportar/reimportar,
// lo reconstruye. No asume que "9E+12" sea un cliente genérico — solo
// reconstruye el número completo cuando la precisión sigue disponible.
function normalizarCodigoCliente_(valor) {
  if (valor === null || valor === undefined) return '';

  const raw = String(valor).trim();
  if (!raw) return '';

  if (/^\d+(\.0+)?$/.test(raw)) {
    return raw.replace(/\.0+$/, '');
  }

  if (/^\d+(\.\d+)?E\+\d+$/i.test(raw)) {
    const num = Number(raw);
    if (Number.isFinite(num)) return String(Math.trunc(num));
  }

  return raw;
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
  if (!cod) return false;
  const nom = String(r[4] || '').trim();
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

// Lee la hoja CUOTAS y devuelve un mapa { cod → cuota_total }.
// Estructura: A=Asesor | B=Sede | C=Negocio | D=Meta
// Retrocompatible: 2 cols (A=Asesor, B=Meta) y 3 cols (A=Asesor, B=Negocio, C=Meta) siguen funcionando.
function getCuotasMap_() {
  const h = getSheet_(HOJAS.CUOTAS);
  if (!h || h.getLastRow() < 2) return {};

  const data  = h.getDataRange().getValues();
  const ncols = (data[0] || []).length;
  const map   = {};

  for (let i = 1; i < data.length; i++) {
    const asesorRaw = String(data[i][0] || '').trim();
    if (!asesorRaw) continue;
    const cod = obtenerCodAsesor_(asesorRaw);
    if (!cod) continue;
    // 4 cols: meta en D (idx 3) | 3 cols: meta en C (idx 2) | legacy: meta en B (idx 1)
    const metaIdx   = ncols >= 4 ? 3 : (ncols === 3 ? 2 : 1);
    const cuota     = parseFloat(String(data[i][metaIdx] || '0').replace(/[$,]/g, '')) || 0;
    map[cod] = (map[cod] || 0) + cuota;
  }

  return map;
}

// Endpoint ?sheet=cuotas — devuelve metas totales + sede + desglose por negocio.
function getCuotas() {
  const h = getSheet_(HOJAS.CUOTAS);
  if (!h || h.getLastRow() < 2) return [];

  const allData = h.getDataRange().getValues();
  const ncols   = (allData[0] || []).length;
  const data    = allData.slice(1);

  // Columnas según número de columnas detectadas
  // 4 cols: A=Asesor B=Sede C=Negocio D=Meta
  // 3 cols: A=Asesor B=Negocio C=Meta  (sin sede)
  // 2 cols: A=Asesor B=Meta             (legacy)
  const tieneSede    = ncols >= 4;
  const tieneNegocio = ncols >= 3;

  const porCod = {};
  data.forEach(function(r) {
    const asesorRaw = String(r[0] || '').trim();
    if (!asesorRaw) return;
    const cod = obtenerCodAsesor_(asesorRaw);
    if (!cod) return;

    const sede     = tieneSede    ? String(r[1] || '').trim() : '';
    const negocio  = tieneSede    ? String(r[2] || '').trim()
                   : tieneNegocio ? String(r[1] || '').trim() : '';
    const metaIdx  = tieneSede ? 3 : (tieneNegocio ? 2 : 1);
    const cuota    = parseFloat(String(r[metaIdx] || '0').replace(/[$,]/g, '')) || 0;

    if (!porCod[cod]) porCod[cod] = { cod, asesor: asesorRaw, sede: sede, por_negocio: [] };
    // Actualizar sede si estaba vacía
    if (!porCod[cod].sede && sede) porCod[cod].sede = sede;

    const label = negocio || 'General';
    porCod[cod].por_negocio.push({ negocio: label, meta: round2_(cuota) });
  });

  return Object.values(porCod).map(function(v) {
    const cuota_total = round2_(v.por_negocio.reduce(function(s, n) { return s + n.meta; }, 0));
    return {
      cod:         v.cod,
      asesor:      v.asesor,
      sede:        v.sede,
      cuota:       cuota_total,
      cuota_total: cuota_total,
      por_negocio: v.por_negocio
    };
  });
}

// ════════════════════════════════════════════════════════════════════
// DEVOLUCIONES: HELPERS
// ════════════════════════════════════════════════════════════════════

// NOTA: La estructura de DEVOLUCIONES se detecta dinámicamente con getDevolucionesColMap_.
// Las columnas esperadas (en cualquier orden) son:
// periodo_mes, cod_asesor, nom_vendedor, cod_cliente, nom_cliente, factura,
// cod_sku, nom_producto, cantidad, costo_unit, vlr_devol, concepto, tipo_producto, periodo_filtro
// Ver findCol_() + getDevolucionesColMap_() para los nombres alternativos aceptados.

/**
 * Devuelve las filas de DEVOLUCIONES del período dado como objetos con propiedades nombradas.
 * Detección dinámica de columnas mediante getDevolucionesColMap_ para resistir cambios de estructura.
 */
function getDevolucionesPeriodoRaw_(periodoYYYYMM) {
  var hDev = getSheet_(HOJAS.DEVOLUCIONES);
  if (!hDev || hDev.getLastRow() < 2) {
    Logger.log('[DevRaw] Hoja DEVOLUCIONES vacía o inexistente.');
    return [];
  }

  var data    = hDev.getDataRange().getValues();
  var headers = data[0];
  var colMap  = getDevolucionesColMap_(headers);
  var filas   = data.slice(1);

  // Debug: primeras filas para verificar detección
  if (filas.length > 0) {
    var ejR = filas[0];
    Logger.log('[DevRaw] Muestra fila 0 — vlr_devol(idx=' + colMap.vlr_devol + ')=' +
      ejR[colMap.vlr_devol] + ' concepto(idx=' + colMap.concepto + ')=' + ejR[colMap.concepto] +
      ' periodo_filtro(idx=' + colMap.periodo_filtro + ')=' + ejR[colMap.periodo_filtro]);
  }

  var montosCero = 0, filasFiltradas = 0, filasValidas = 0;
  var resultado = [];

  filas.forEach(function(r, idx) {
    // ── Período ──
    var periodoFiltro = colMap.periodo_filtro >= 0 ? periodoYYYYMM_(r[colMap.periodo_filtro]) : '';
    var periodoMes    = colMap.periodo_mes    >= 0 ? periodoYYYYMM_(r[colMap.periodo_mes])    : '';
    var periodo       = periodoFiltro || periodoMes;

    if (periodoYYYYMM && periodo !== periodoYYYYMM) {
      filasFiltradas++;
      return;
    }

    // ── Vendedor ──
    var codRaw   = colMap.cod_asesor   >= 0 ? r[colMap.cod_asesor]   : '';
    var nomRaw   = colMap.nom_vendedor >= 0 ? r[colMap.nom_vendedor] : '';
    var cod      = obtenerCodAsesor_(codRaw);
    var vendedor = String(nomRaw || '').trim();
    if (!esVendedorValido_(cod, vendedor)) return;

    // ── Monto ──
    var vlrRaw = colMap.vlr_devol >= 0 ? r[colMap.vlr_devol] : 0;
    var monto  = Math.abs(parseMoney_(vlrRaw));
    if (!monto) {
      montosCero++;
      if (montosCero <= 3) {
        Logger.log('[DevRaw] ⚠ fila ' + (idx+2) + ' monto=0 — raw=' + vlrRaw +
          ' cod=' + cod + ' concepto=' + (colMap.concepto >= 0 ? r[colMap.concepto] : '?'));
      }
    }

    filasValidas++;
    var concepto_row    = colMap.concepto      >= 0 ? String(r[colMap.concepto]      || '').trim() : '';
    var tipo_producto_row = colMap.tipo_producto >= 0 ? String(r[colMap.tipo_producto] || '').trim().toUpperCase() : '';
    // Clasificación oficial del sistema: tipo_producto CAMBIO=avería, NORMAL=devolución.
    // Fallback a lógica por concepto solo si la columna no tiene valor reconocido.
    var es_averia_row = (tipo_producto_row === 'CAMBIO') ? true
                      : (tipo_producto_row === 'NORMAL') ? false
                      : esAveria_(concepto_row);
    resultado.push({
      periodo_mes:    colMap.periodo_mes    >= 0 ? r[colMap.periodo_mes]    : '',
      cod_asesor:     cod,
      nom_vendedor:   vendedor,
      cod_cliente:    colMap.cod_cliente    >= 0 ? r[colMap.cod_cliente]    : '',
      nom_cliente:    colMap.nom_cliente    >= 0 ? r[colMap.nom_cliente]    : '',
      factura:        colMap.factura        >= 0 ? r[colMap.factura]        : '',
      cod_sku:        colMap.cod_sku        >= 0 ? r[colMap.cod_sku]        : '',
      nom_producto:   colMap.nom_producto   >= 0 ? r[colMap.nom_producto]   : '',
      cantidad:       colMap.cantidad       >= 0 ? (Number(r[colMap.cantidad]) || 0) : 0,
      costo_unit:     colMap.costo_unit     >= 0 ? parseMoney_(r[colMap.costo_unit]) : 0,
      vlr_devol:      monto,
      concepto:       concepto_row,
      tipo_producto:  tipo_producto_row,
      es_averia:      es_averia_row,
      periodo_filtro: periodo,
      _raw:           r,
    });
  });

  Logger.log('[DevRaw] periodo=' + (periodoYYYYMM||'ALL') +
    ' → válidas=' + filasValidas + ' filtradas=' + filasFiltradas +
    ' montosCero=' + montosCero);
  return resultado;
}

function getTotalesDevolucionesPeriodo_(periodoYYYYMM) {
  const totales = { devoluciones: 0, averias: 0, total: 0 };
  getDevolucionesPeriodoRaw_(periodoYYYYMM).forEach(function(r) {
    var monto = r.vlr_devol;
    if (!monto) return;
    if (r.es_averia) totales.averias      += monto;
    else             totales.devoluciones += monto;
    totales.total += monto;
  });
  Logger.log('[DevTotales] periodo=' + periodoYYYYMM +
    ' devoluciones=' + totales.devoluciones +
    ' averias=' + totales.averias + ' total=' + totales.total);
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
  getDevolucionesPeriodoRaw_(periodoYYYYMM).forEach(function(r) {
    var cod   = r.cod_asesor;
    var monto = r.vlr_devol;
    if (!cod || !monto) return;
    if (!devMap[cod]) devMap[cod] = { devoluciones:0, averias:0, total:0 };
    if (r.es_averia) devMap[cod].averias      += monto;
    else             devMap[cod].devoluciones += monto;
    devMap[cod].total += monto;
  });
  Object.keys(devMap).forEach(function(cod) {
    devMap[cod].devoluciones = round2_(devMap[cod].devoluciones);
    devMap[cod].averias      = round2_(devMap[cod].averias);
    devMap[cod].total        = round2_(devMap[cod].total);
  });
  return devMap;
}

// ════════════════════════════════════════════════════════════════════
// CACHE (Apps Script CacheService)
// TTL por defecto: 300 s (5 min). Límite por clave en CacheService: ≈100 KB.
// Si el resultado serializado supera ese límite, put() falla silenciosamente
// y la función se ejecuta normalmente sin cache.
// ════════════════════════════════════════════════════════════════════

/**
 * Ejecuta computeFn, guarda el resultado en CacheService y lo retorna.
 * En llamadas siguientes (cache vivo) retorna el valor cacheado sin recalcular.
 */
function withCache_(cacheKey, ttlSec, computeFn) {
  const cache = CacheService.getScriptCache();
  const t0    = Date.now();

  // ── Intentar devolver desde cache ──────────────────────────────────────────
  const cached = cache.get(cacheKey);
  if (cached) {
    Logger.log('[Cache HIT]  ' + cacheKey + ' en ' + (Date.now() - t0) + ' ms');
    try { return JSON.parse(cached); } catch (_) { /* JSON corrupto → recalcular */ }
  }

  // ── Cache miss: calcular ───────────────────────────────────────────────────
  Logger.log('[Cache MISS] ' + cacheKey + ' — calculando...');
  const t1     = Date.now();
  const result = computeFn();
  const ms     = Date.now() - t1;
  Logger.log('[Cache CALC] ' + cacheKey + ' = ' + ms + ' ms');

  // ── Intentar guardar en cache (puede fallar si JSON > 100 KB) ─────────────
  // La función SIEMPRE devuelve el resultado, aunque el cache falle.
  try {
    const json = JSON.stringify(result);
    Logger.log('[Cache SIZE] ' + cacheKey + ' = ' + json.length + ' bytes');
    if (json.length > 90000) {
      Logger.log('[Cache WARN] ' + cacheKey +
        ' cerca del límite de CacheService (' + json.length + ' bytes)');
    }
    cache.put(cacheKey, json, ttlSec);
    Logger.log('[Cache PUT]  ' + cacheKey +
      ' guardado (' + ms + ' ms, ' + json.length + ' bytes)');
  } catch (e) {
    // CacheService rechazó el valor (demasiado grande u otro error).
    // Esto NO es un error fatal: el resultado se devuelve igualmente,
    // pero sin quedar cacheado (la próxima llamada volverá a computar).
    Logger.log('[Cache PUT FAIL] ' + cacheKey + ' — no se pudo cachear: ' + e.message);
  }
  return result;
}

/**
 * Pre-calienta el cache de los endpoints AGREGADOS (no los de detalle).
 *
 * ── Qué calienta ────────────────────────────────────────────────────────────
 *   resumen, vendedores, devoluciones, tendencia, dn_marcas, marcas, skus,
 *   top_clientes, necesidad, cob_pc, cob_pc_vend
 *
 * ── Qué NO calienta (cargan bajo demanda) ───────────────────────────────────
 *   pc_detalle       — puede superar 100 KB; solo cuando el usuario lo pide
 *   clientes_sin_pc  — puede superar 100 KB; solo cuando el usuario lo pide
 *
 * ── Configurar trigger ──────────────────────────────────────────────────────
 *   Ejecutar instalarTriggerWarmCache_() desde el editor de Apps Script.
 *   Eso instala el trigger automáticamente (everyMinutes(5) → warmCache_).
 *   Ver también: limpiarTriggersWarmCache_(), verificarTriggersWarmCache_()
 *
 * ── LockService ─────────────────────────────────────────────────────────────
 *   Si un ciclo de calentamiento tarda más de 5 min, el siguiente trigger
 *   llegaría mientras el anterior todavía corre. LockService lo evita:
 *   el nuevo intento espera 5 s y, si el lock no queda libre, sale sin hacer nada.
 */
function warmCache_() {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(5000)) {
    Logger.log('[warmCache_] Saltado — ya hay otra ejecución activa');
    return;
  }

  try {
    const t0 = Date.now();
    Logger.log('[warmCache_] Iniciando precalentamiento...');

    // Solo endpoints AGREGADOS cuya respuesta cabe en CacheService (< 100 KB)
    withCache_('resumen',      300, getResumen);      // ~1.6 KB
    withCache_('vendedores',   300, getVendedores);   // ~12 KB
    withCache_('tendencia',    300, getTendencia);    // ~0.1 KB
    withCache_('dn_marcas',    300, getDNMarcas);     // ~10 KB
    withCache_('marcas',       300, getTopMarcas);    // ~1.4 KB
    withCache_('skus',         300, getTopSKUs);      // ~28 KB
    withCache_('top_clientes', 300, getTopClientes);  // ~88 KB (cercano al límite)
    withCache_('necesidad',    300, getNecesidadCliente);
    withCache_('cob_pc',       300, getCoberturaProductosClave_);
    withCache_('cob_pc_vend',  300, getCoberturaProductosClaveVendedor_);
    withCache_('mi_gerencia',  300, getMiGerencia_);       // ~5 KB
    // ⚠ NO calentar — respuesta > 100 KB (CacheService no puede almacenarlos):
    //   'devoluciones'   ~219 KB — incluye array `detalle` completo
    //   'clientes_sin_pc' ~359 KB — lista completa de clientes
    //   'pc_detalle'      ~10 KB  — pequeño; se excluye por ser detalle bajo demanda

    Logger.log('[warmCache_] Completado en ' + (Date.now() - t0) + ' ms');
  } catch (err) {
    Logger.log('[warmCache_] ERROR: ' + err.message);
    throw err;  // re-lanzar para que Apps Script lo registre como fallo del trigger
  } finally {
    lock.releaseLock();
  }
}

// ── Gestión de trigger automático warmCache_ ─────────────────────────────────
// Ejecutar instalarTriggerWarmCache_() UNA VEZ desde el editor de Apps Script.
// Después corre automáticamente cada 5 minutos sin intervención manual.

/**
 * Instala el trigger que llama a warmCache_() cada 5 minutos.
 * Elimina triggers duplicados antes de crear uno nuevo.
 * Correr desde: Apps Script → Ejecutar → instalarTriggerWarmCache_
 */
function instalarTriggerWarmCache_() {
  limpiarTriggersWarmCache_();
  ScriptApp.newTrigger('warmCache_')
    .timeBased()
    .everyMinutes(5)
    .create();
  Logger.log('[Trigger] warmCache_ instalado — se ejecutará cada 5 minutos.');
}

/** Elimina todos los triggers que apunten a warmCache_. */
function limpiarTriggersWarmCache_() {
  var eliminados = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'warmCache_') {
      ScriptApp.deleteTrigger(t);
      eliminados++;
    }
  });
  Logger.log('[Trigger] Eliminados ' + eliminados + ' trigger(s) warmCache_.');
}

/** Muestra en el Logger cuántos triggers warmCache_ están activos. */
function verificarTriggersWarmCache_() {
  var activos = ScriptApp.getProjectTriggers().filter(function(t) {
    return t.getHandlerFunction() === 'warmCache_';
  });
  Logger.log('[Trigger] Triggers warmCache_ activos: ' + activos.length);
  activos.forEach(function(t) {
    Logger.log('  → id=' + t.getUniqueId() + '  tipo=' + t.getTriggerSource());
  });
  return activos.length;
}

// ── Wrappers públicos (sin _ ) para ejecutar manualmente desde el editor ─────
function instalarTriggerWarmCache()   { return instalarTriggerWarmCache_();   }
function verificarTriggersWarmCache() { return verificarTriggersWarmCache_(); }
function limpiarTriggersWarmCache()   { return limpiarTriggersWarmCache_();   }

/** Invalida todo el cache (correr tras actualizar datos en Sheets). */
function invalidarCache_() {
  CacheService.getScriptCache().removeAll([
    'resumen', 'vendedores', 'devoluciones', 'tendencia',
    'dn_marcas', 'cobertura_marcas', 'marcas', 'skus', 'top_clientes',
    'necesidad', 'cob_pc', 'cob_pc_vend', 'clientes_sin_pc', 'pc_detalle',
    'audit_light', 'audit_full'
  ]);
  // Resetear mapa de columnas en memoria para que la próxima llamada re-detecte
  _DEVOL_COL_MAP = null;
  Logger.log('[invalidarCache_] Cache limpiado.');
}

/**
 * Llama esta función desde el menú de Apps Script cada vez que actualices las bases.
 * Invalida el cache de CacheService para que los endpoints devuelvan datos frescos.
 * Luego precalienta el cache llamando los endpoints más pesados.
 *
 * Uso: En Apps Script → Ejecutar → refrescarDespuesDeActualizarBases_
 */
function refrescarDespuesDeActualizarBases_() {
  Logger.log('[Refresh] Iniciando invalidación de cache y precalentamiento...');
  // 1. Limpiar cache
  invalidarCache_();
  // 2. Resetear mapa de columnas (ya hecho en invalidarCache_, por si acaso)
  _DEVOL_COL_MAP = null;
  // 3. Diagnóstico rápido de columnas antes de calentar
  try {
    var hDev = getSheet_(HOJAS.DEVOLUCIONES);
    if (hDev && hDev.getLastRow() > 1) {
      var headers = hDev.getDataRange().getValues()[0];
      Logger.log('[Refresh] Headers DEVOLUCIONES: ' + JSON.stringify(headers));
      var colMap = getDevolucionesColMap_(headers);
      Logger.log('[Refresh] ColMap → vlr_devol=' + colMap.vlr_devol +
        ' concepto=' + colMap.concepto + ' periodo_filtro=' + colMap.periodo_filtro);
      // Muestra de las primeras 3 filas para confirmar valores
      var data = hDev.getDataRange().getValues().slice(1, 4);
      data.forEach(function(row, i) {
        Logger.log('[Refresh] Fila ' + (i+2) +
          ' vlr_devol=' + row[colMap.vlr_devol] +
          ' concepto='  + row[colMap.concepto] +
          ' periodo='   + row[colMap.periodo_filtro]);
      });
    } else {
      Logger.log('[Refresh] ⚠ Hoja DEVOLUCIONES vacía o no encontrada.');
    }
  } catch(e) {
    Logger.log('[Refresh] Error en diagnóstico: ' + e.message);
  }
  // 4. Precalentar los endpoints más pesados
  try {
    Logger.log('[Refresh] Precalentando warmCache_...');
    warmCache_();
    Logger.log('[Refresh] ✓ warmCache_ completado.');
  } catch(e) {
    Logger.log('[Refresh] Error en warmCache_: ' + e.message);
  }
  Logger.log('[Refresh] ✓ Listo. Cache refrescado con datos actualizados.');
}

// ════════════════════════════════════════════════════════════════════
// CONFIG — hoja CONFIG con clave/valor de configuración
// Estructura: CLAVE | VALOR  (fila 1 = cabecera, filas 2+ = datos)
// ════════════════════════════════════════════════════════════════════

function getConfig_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CONFIG');
  if (!sh) {
    return {
      dias_habiles_restantes: 0,
      dias_habiles_mes:       0,
      fecha_corte:            null,
      debug:                  'Hoja CONFIG no encontrada'
    };
  }
  const values = sh.getDataRange().getValues();
  const config = {};
  for (let i = 1; i < values.length; i++) {
    const clave = String(values[i][0] || '').trim().toUpperCase();
    const valor = values[i][1];
    if (clave) config[clave] = valor;
  }
  return {
    dias_habiles_restantes: Number(config['DIAS_HABILES_RESTANTES'] || 0),
    dias_habiles_mes:       Number(config['DIAS_HABILES_MES']       || 0),
    fecha_corte:            config['FECHA_CORTE'] || null
  };
}

// ════════════════════════════════════════════════════════════════════
// RESUMEN GLOBAL
// ════════════════════════════════════════════════════════════════════

function getResumen() {
  const hB   = getSheet_(HOJAS.BASE);
  const hRC  = getSheet_(HOJAS.RESUMEN_COBERTURA);
  const hEfR = getSheet_(HOJAS.EFECTIVIDAD_RESUMEN);
  if (!hB) return {};

  // Fecha de corte desde A1 de CARGA_DIARIA
  const hC = getSheet_(HOJAS.CARGA_DIARIA || 'CARGA_DIARIA');
  const fechaCorte = hC ? parsearFecha(hC.getRange('A1').getValue()) : null;

  const periodoActual = getPeriodoActualDesdeBase_();
  const mesData       = getBasePeriodoActual_();

  // ── Mapa cod→sede para desglose por sede ──────────────────────────────────
  const sedeMap = cargarSedeMap_();
  const SEDES   = ['TODOS', 'CENTRALES', 'CHIRIQUI', 'SIN_SEDE'];

  // Normaliza el string de sede crudo al valor canónico
  function normSedeCod_(cod) {
    var raw = String(sedeMap[cod] || '').toUpperCase().trim()
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (raw.indexOf('CENTRAL')  >= 0) return 'CENTRALES';
    if (raw.indexOf('CHIRIQUI') >= 0) return 'CHIRIQUI';
    return raw || 'SIN_SEDE';
  }

  // Acumuladores por sede
  var sedeTotales = {};
  SEDES.forEach(function(s) {
    sedeTotales[s] = { ventaNeta: 0, ventaPositiva: 0, ventaNegativa: 0,
                       clientesImp: {}, skusActivos: {}, negMap: {} };
  });

  // Cuotas del equipo
  const cuotaMap   = getCuotasMap_();
  const cuotaTotal = Object.values(cuotaMap).reduce(function(s, v) { return s + v; }, 0);

  // Cuotas por sede
  var cuotaPorSede = {};
  SEDES.forEach(function(s) { cuotaPorSede[s] = 0; });
  cuotaPorSede['TODOS'] = cuotaTotal;
  Object.keys(cuotaMap).forEach(function(cod) {
    var s = normSedeCod_(cod);
    cuotaPorSede[s] += cuotaMap[cod];
  });

  // ── Loop BASE_ACUMULADA: global + por sede de una sola pasada ─────────────
  var skusActivosGlobal = {};
  mesData.forEach(function(row) {
    var cod      = obtenerCodAsesor_(row[3]);
    var valor    = parseFloat(row[14]) || 0;
    var cantNeta = parseFloat(row[13]) || 0;
    var neg      = String(row[8] || '').trim();
    var cli      = String(row[1]);
    var sku      = String(row[6]);
    var sede     = normSedeCod_(cod);

    // TODOS
    sedeTotales['TODOS'].ventaNeta += valor;
    if (valor > 0) {
      sedeTotales['TODOS'].ventaPositiva += valor;
      sedeTotales['TODOS'].clientesImp[cli] = true;
      sedeTotales[sede].clientesImp[cli]    = true;
    }
    if (valor < 0) sedeTotales['TODOS'].ventaNegativa += Math.abs(valor);
    if (cantNeta > 0) { skusActivosGlobal[sku] = true; sedeTotales['TODOS'].skusActivos[sku] = true; }
    if (neg) sedeTotales['TODOS'].negMap[neg] = (sedeTotales['TODOS'].negMap[neg] || 0) + valor;

    // Por sede
    sedeTotales[sede].ventaNeta += valor;
    if (neg) sedeTotales[sede].negMap[neg] = (sedeTotales[sede].negMap[neg] || 0) + valor;
    if (cantNeta > 0) sedeTotales[sede].skusActivos[sku] = true;
  });

  // ── Devoluciones globales — MISMA fuente que el resumen histórico ───────────
  // getTotalesDevolucionesPeriodo_ incluye TODAS las filas válidas de DEVOLUCIONES
  // (incluso las que no tienen cod parseable), garantizando compatibilidad exacta
  // con el comportamiento anterior.
  var totalesDev   = getTotalesDevolucionesPeriodo_(periodoActual);
  const totalDevol   = totalesDev.devoluciones;
  const totalAverias = totalesDev.averias;
  const descuentoTotal = totalDevol + totalAverias;

  // ── Devoluciones por sede — segunda pasada sobre las mismas filas ─────────
  // Para el desglose por sede se itera directamente sobre las filas crudas.
  // Las filas sin cod parseable van a SIN_SEDE (no se pierden).
  var sedeDevTotales = {};
  SEDES.forEach(function(s) { sedeDevTotales[s] = { devoluciones: 0, averias: 0 }; });

  getDevolucionesPeriodoRaw_(periodoActual).forEach(function(row) {
    var monto = row.vlr_devol;
    if (!monto) return;
    var d = row.es_averia ? 0 : monto;
    var a = row.es_averia ? monto : 0;
    // Siempre sumamos al total global (debe coincidir con totalDevol / totalAverias)
    sedeDevTotales['TODOS'].devoluciones += d;
    sedeDevTotales['TODOS'].averias      += a;
    // Por sede según cod del asesor (SIN_SEDE si no es parseable)
    var cod  = row.cod_asesor;
    var sede = cod ? normSedeCod_(cod) : 'SIN_SEDE';
    sedeDevTotales[sede].devoluciones += d;
    sedeDevTotales[sede].averias      += a;
  });

  // Auditoría (visible en Apps Script Logs)
  Logger.log('[ResumenPorSede] TODOS  dev=' + totalDevol   + '  av=' + totalAverias   + '  vn=' + (sedeTotales['TODOS'].ventaNeta));
  Logger.log('[ResumenPorSede] TODOS  sedeDevTotales.dev=' + sedeDevTotales['TODOS'].devoluciones);
  Logger.log('[ResumenPorSede] CENTRALES dev=' + sedeDevTotales['CENTRALES'].devoluciones + '  av=' + sedeDevTotales['CENTRALES'].averias);
  Logger.log('[ResumenPorSede] CHIRIQUI  dev=' + sedeDevTotales['CHIRIQUI'].devoluciones  + '  av=' + sedeDevTotales['CHIRIQUI'].averias);
  Logger.log('[ResumenPorSede] SIN_SEDE  dev=' + sedeDevTotales['SIN_SEDE'].devoluciones  + '  av=' + sedeDevTotales['SIN_SEDE'].averias);

  const ventaNetaVMXC     = sedeTotales['TODOS'].ventaNeta;
  const ventaPositivaVMXC = sedeTotales['TODOS'].ventaPositiva;
  const ventaNegativaVMXC = sedeTotales['TODOS'].ventaNegativa;
  const ventaNeta         = ventaNetaVMXC;
  const ventaBruta        = ventaNeta + descuentoTotal;
  const clientesImpGlobal = Object.keys(sedeTotales['TODOS'].clientesImp);

  // ── Cobertura: global + por sede (RESUMEN_COBERTURA) ─────────────────────
  var cobPorSede = {};
  SEDES.forEach(function(s) { cobPorSede[s] = { maestro: 0, impactados: 0, pct: 0 }; });

  let coberturaGlobal = 0, totalMaestro = 0, totalImpactados = 0;
  if (hRC && hRC.getLastRow() > 1) {
    const rcData   = hRC.getDataRange().getValues().slice(1);
    const totalRow = rcData.find(function(rr) { return String(rr[0]||'').toUpperCase().indexOf('TOTAL') >= 0; });

    if (totalRow) {
      totalMaestro    = parseInt(totalRow[1]) || 0;
      totalImpactados = parseInt(totalRow[2]) || 0;
      coberturaGlobal = parseFloat(totalRow[3]) || 0;
      cobPorSede['TODOS'].maestro    = totalMaestro;
      cobPorSede['TODOS'].impactados = totalImpactados;
      cobPorSede['TODOS'].pct        = coberturaGlobal;
    }

    // Iterar vendedor a vendedor para desglose por sede (siempre)
    rcData.forEach(function(rr) {
      const vendedor = String(rr[0]||'').trim();
      const cod      = obtenerCodAsesor_(vendedor);
      if (!esVendedorValido_(cod, vendedor)) return;
      const mae  = parseInt(rr[1]) || 0;
      const imp  = parseInt(rr[2]) || 0;
      const sede = normSedeCod_(cod);
      cobPorSede[sede].maestro    += mae;
      cobPorSede[sede].impactados += imp;
      if (!totalRow) {
        cobPorSede['TODOS'].maestro    += mae;
        cobPorSede['TODOS'].impactados += imp;
      }
    });

    // Calcular % de cobertura para cada sede
    SEDES.forEach(function(s) {
      var c = cobPorSede[s];
      if (c.maestro > 0) c.pct = round2_(c.impactados / c.maestro * 100);
    });

    if (!totalRow) {
      totalMaestro    = cobPorSede['TODOS'].maestro;
      totalImpactados = cobPorSede['TODOS'].impactados;
      coberturaGlobal = cobPorSede['TODOS'].pct;
    }
  }

  // ── Efectividad: global + por sede (EFECTIVIDAD_RESUMEN) ─────────────────
  var efPorSede = {};
  SEDES.forEach(function(s) { efPorSede[s] = { vals: [] }; });
  let efectividadGlobal = 0;
  if (hEfR && hEfR.getLastRow() > 1) {
    hEfR.getDataRange().getValues().slice(1).forEach(function(rr) {
      const v   = String(rr[0]||'').trim();
      const cod = obtenerCodAsesor_(v);
      if (!esVendedorValido_(cod, v)) return;
      const ef   = parseFloat(rr[5]) || 0;
      if (ef <= 0) return;
      const sede = normSedeCod_(cod);
      efPorSede['TODOS'].vals.push(ef);
      efPorSede[sede].vals.push(ef);
    });
    SEDES.forEach(function(s) {
      var vals = efPorSede[s].vals;
      if (vals.length > 0) {
        efPorSede[s].pct = round2_(vals.reduce(function(a,b){return a+b;},0) / vals.length);
      } else {
        efPorSede[s].pct = 0;
      }
    });
    efectividadGlobal = efPorSede['TODOS'].pct;
  }

  // ── Venta por negocio (global) ────────────────────────────────────────────
  const negMapPositivo = {};
  mesData.forEach(function(row) {
    const neg   = String(row[8]||'').trim();
    const valor = parseFloat(row[14]) || 0;
    if (!neg || valor <= 0) return;
    negMapPositivo[neg] = (negMapPositivo[neg] || 0) + valor;
  });

  const venta_por_negocio = Object.entries(sedeTotales['TODOS'].negMap)
    .map(function(e) { return { negocio: e[0], venta: round2_(e[1]) }; })
    .sort(function(a, b) { return b.venta - a.venta; });

  const venta_positiva_por_negocio = Object.entries(negMapPositivo)
    .map(function(e) { return { negocio: e[0], venta: round2_(e[1]) }; })
    .sort(function(a, b) { return b.venta - a.venta; });

  // ── Helper: construir objeto KPI para una sede ────────────────────────────
  function buildSedeKPIs_(s) {
    var t    = sedeTotales[s];
    var dev  = sedeDevTotales[s];
    var d    = round2_(dev.devoluciones);
    var a    = round2_(dev.averias);
    var desc = round2_(d + a);
    var vn   = round2_(t.ventaNeta);
    var vb   = round2_(vn + desc);
    Logger.log('[buildSedeKPIs] ' + s + '  vb=' + vb + '  vn=' + vn + '  dev=' + d + '  av=' + a);
    var cuota    = round2_(cuotaPorSede[s] || 0);
    var nCli     = Object.keys(t.clientesImp).length;
    var cobSede  = cobPorSede[s];
    var efSede   = efPorSede[s];
    var vpn      = Object.entries(t.negMap)
      .map(function(e) { return { negocio: e[0], venta: round2_(e[1]) }; })
      .sort(function(x, y) { return y.venta - x.venta; });
    return {
      venta_bruta:             vb,
      venta_total:             vb,
      venta_real:              vb,
      venta_neta:              vn,
      devolucion_total:        d,
      averia_total:            a,
      descuento_total:         desc,
      pct_devolucion:          vb > 0 ? round2_(d    / vb * 100) : 0,
      pct_averia:              vb > 0 ? round2_(a    / vb * 100) : 0,
      pct_descuento_total:     vb > 0 ? round2_(desc / vb * 100) : 0,
      clientes_impactados:     nCli,
      clientes_maestro:        cobSede.maestro,
      cobertura_pct:           cobSede.pct,
      ticket_promedio:         nCli > 0 ? round2_(vn / nCli) : 0,
      efectividad_pct:         efSede.pct || 0,
      cuota_total:             cuota,
      pct_cumplimiento_equipo: cuota > 0 ? round2_(vn / cuota * 100) : 0,
      venta_por_negocio:       vpn
    };
  }

  return {
    periodo:      periodoActual,
    fecha_corte:  fechaCorte,

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
    clientes_impactados:     clientesImpGlobal.length,
    clientes_maestro:        totalMaestro,
    cobertura_pct:           round2_(coberturaGlobal),
    skus_activos:            Object.keys(skusActivosGlobal).length,
    ticket_promedio:         clientesImpGlobal.length > 0 ? round2_(ventaNeta / clientesImpGlobal.length) : 0,
    efectividad_pct:         round2_(efectividadGlobal),

    // Cuotas / metas del equipo
    cuota_total:             round2_(cuotaTotal),
    pct_cumplimiento_equipo: cuotaTotal > 0 ? round2_(ventaNeta / cuotaTotal * 100) : 0,

    // ── Desglose por sede (para KPI cards filtradas) ──────────────────────
    por_sede: {
      TODOS:     buildSedeKPIs_('TODOS'),
      CENTRALES: buildSedeKPIs_('CENTRALES'),
      CHIRIQUI:  buildSedeKPIs_('CHIRIQUI'),
      SIN_SEDE:  buildSedeKPIs_('SIN_SEDE')
    }
  };
}

// ════════════════════════════════════════════════════════════════════
// AUDITORÍA RESUMEN — compara dashboard vs informe del sistema
// Endpoint: ?sheet=auditoria_resumen[&modo=light|full]
// Por defecto modo=light (respuesta compacta, sin timeout).
// Referencia fija: INFORME DE VENTAS X ASESOR (sistema externo, Jun 2026 Q1)
// ════════════════════════════════════════════════════════════════════

function getAuditoriaResumen_(modo) {
  var t0 = Date.now();
  var isLight = (modo !== 'full');

  // ── Referencia del sistema (hardcoded del informe impreso) ────────────────
  var SISTEMA = {
    '201': { asesor: '201 ANAYS CASTILLO',          venta_bruta: 12967.00, devoluciones: 1390.98, averias:  527.72, venta_neta: 11048.30 },
    '202': { asesor: '202 MELISSA ZULAY CASTILLO',  venta_bruta: 13646.92, devoluciones: 2554.15, averias:  803.67, venta_neta: 10289.10 },
    '203': { asesor: '203 RAUL CASTRO',             venta_bruta: 14321.78, devoluciones: 2228.66, averias:  522.92, venta_neta: 11570.20 },
    '204': { asesor: '204 ALAY WOODS',              venta_bruta: 13346.77, devoluciones: 1753.41, averias:  797.60, venta_neta: 10795.76 },
    '205': { asesor: '205 RENE ISAIAS MUÑOZ',       venta_bruta: 11975.22, devoluciones: 3415.89, averias:  612.90, venta_neta:  7946.43 },
    '206': { asesor: '206 GRACIELA CASSINO',        venta_bruta:  8508.86, devoluciones:  929.21, averias:  507.18, venta_neta:  7072.47 },
    '207': { asesor: '207 JAIME ELIAS CASTILLO',    venta_bruta: 11866.96, devoluciones: 1528.34, averias:  330.97, venta_neta: 10007.65 },
    '208': { asesor: '208 ARIEL GONZALEZ',          venta_bruta:  8786.30, devoluciones: 1318.10, averias:  456.96, venta_neta:  7011.24 },
    '209': { asesor: '209 ENRIQUE JIMENEZ',         venta_bruta: 13309.30, devoluciones: 2795.59, averias:  597.87, venta_neta:  9915.84 },
    '210': { asesor: '210 JOHNNY PITTY',            venta_bruta: 10992.18, devoluciones: 1422.23, averias:  489.68, venta_neta:  9080.27 },
    '211': { asesor: '211 HAYMETH LEWIS',           venta_bruta: 18775.09, devoluciones:  596.99, averias:  150.23, venta_neta: 18027.87 },
    '212': { asesor: '212 ISMALDO GOMEZ',           venta_bruta: 24047.84, devoluciones: 2150.56, averias:   92.57, venta_neta: 21804.71 },
    '213': { asesor: '213 GUSTAVO ROJAS',           venta_bruta: 17240.38, devoluciones: 1115.25, averias:  221.58, venta_neta: 15903.55 },
    '214': { asesor: '214 RUTA CENTRALES 2',        venta_bruta:  4573.22, devoluciones: 1417.46, averias:  285.38, venta_neta:  2870.38 },
  };
  var sistemaTotal = { venta_bruta: 184357.82, devoluciones: 24616.82, averias: 6397.23, venta_neta: 153343.77 };

  // ── Período y totales del dashboard ───────────────────────────────────────
  // LIGHT: usa el resumen cacheado (instant) + solo lee DEVOLUCIONES (~4-6 s).
  //        NO lee BASE_ACUMULADA (14k filas → 8-10 s más → timeout en Vercel).
  // FULL: lee BASE + DEVOLUCIONES para el desglose de venta_neta por asesor.
  var periodoActual;
  var dashboardTotal;
  var baseMap = {};
  var filasBase = 0;

  // Resumen cacheado (warmCache_ lo renueva cada 5 min)
  var resumenCache = withCache_('resumen', 300, getResumen);
  var tResumen = Date.now();

  if (isLight && resumenCache) {
    // Período desde cache — no leer BASE.
    // TOTALES de devol/averias: se calcularán DESPUÉS del pase fresco sobre
    // DEVOLUCIONES para mantener consistencia con por_asesor.
    // venta_neta viene del cache (BASE es demasiado pesada para light).
    periodoActual = resumenCache.periodo || '';
    dashboardTotal = null;  // se completa abajo tras leer DEVOLUCIONES
  } else {
    // FULL o sin cache: leer BASE para totales y desglose VN por asesor
    periodoActual = getPeriodoActualDesdeBase_();
    var mesData = getBasePeriodoActual_();
    mesData.forEach(function(row) {
      filasBase++;
      var cod    = obtenerCodAsesor_(row[3]);
      var nombre = String(row[4] || '').trim();
      var valor  = parseFloat(row[14]) || 0;
      if (!cod || !esVendedorValido_(cod, nombre)) return;
      if (!baseMap[cod]) baseMap[cod] = { cod: cod, nombre: nombre, vn: 0 };
      else if (!baseMap[cod].nombre && nombre) baseMap[cod].nombre = nombre;
      baseMap[cod].vn += valor;
    });
    // dashboardTotal se construye abajo después de combinar con devol
    dashboardTotal = null;
  }
  var tBase = Date.now();

  // ── DEVOLUCIONES — un solo pase: devMap + conceptos + fuera de rango ──────
  var devRaw          = getDevolucionesPeriodoRaw_(periodoActual);
  var devMap             = {};
  var conceptosMap       = {};
  var devSinCod          = 0;
  var devSinCodDevol     = 0;
  var devSinCodAverias   = 0;
  var devolFueraDetalle  = [];
  var devolFueraMonto    = 0;

  devRaw.forEach(function(r) {
    var cod   = r.cod_asesor;
    var monto = r.vlr_devol;
    var conc  = r.concepto || '(vacío)';
    var esAv  = r.es_averia;

    if (cod && monto) {
      if (!devMap[cod]) devMap[cod] = { devoluciones: 0, averias: 0 };
      if (esAv) devMap[cod].averias      += monto;
      else      devMap[cod].devoluciones += monto;
    } else if (!cod) {
      devSinCod++;
      if (esAv) devSinCodAverias += monto || 0;
      else      devSinCodDevol   += monto || 0;
    }

    if (!conceptosMap[conc]) conceptosMap[conc] = { concepto: conc, tipo: esAv ? 'AVERIA' : 'DEVOLUCION', monto: 0, filas: 0 };
    conceptosMap[conc].monto += monto || 0;
    conceptosMap[conc].filas++;

    var n = parseInt(cod) || 0;
    if (n < 201 || n > 214) {
      devolFueraMonto += monto || 0;
      if (!isLight || devolFueraDetalle.length < 20) {
        devolFueraDetalle.push({ cod_asesor: cod, nom_vendedor: r.nom_vendedor, concepto: conc, monto: monto, tipo: esAv ? 'AVERIA' : 'DEVOLUCION' });
      }
    }
  });

  Object.keys(devMap).forEach(function(cod) {
    devMap[cod].devoluciones = round2_(devMap[cod].devoluciones);
    devMap[cod].averias      = round2_(devMap[cod].averias);
  });
  var tDevol = Date.now();

  // ── Top conceptos ─────────────────────────────────────────────────────────
  var conceptosList = Object.values(conceptosMap)
    .sort(function(a, b) { return b.monto - a.monto; })
    .slice(0, isLight ? 20 : 999)
    .map(function(c) { return { concepto: c.concepto, tipo: c.tipo, monto: round2_(c.monto), filas: c.filas }; });

  // ── Por asesor ────────────────────────────────────────────────────────────
  var todosLosAsesores = {};
  Object.keys(baseMap).forEach(function(c) { todosLosAsesores[c] = true; });
  Object.keys(devMap).forEach(function(c)  { todosLosAsesores[c] = true; });
  Object.keys(SISTEMA).forEach(function(c) { todosLosAsesores[c] = true; });

  var porAsesorAll  = [];
  var asesoresExtra = [];
  var dtVB = 0, dtDev = 0, dtAv = 0, dtVN = 0;
  var exVB = 0, exDev = 0, exAv = 0, exVN = 0;

  Object.keys(todosLosAsesores).forEach(function(cod) {
    var bm = baseMap[cod];
    var dm = devMap[cod] || { devoluciones: 0, averias: 0 };
    var sm = SISTEMA[cod];

    var vn = bm ? round2_(bm.vn) : null;  // null en light si no leímos BASE
    var d  = dm.devoluciones || 0;
    var a  = dm.averias      || 0;
    var vb = vn !== null ? round2_(vn + d + a) : null;
    var enDash = !!(bm || d > 0 || a > 0);

    if (enDash) { if (vb !== null) dtVB += vb; dtDev += d; dtAv += a; if (vn !== null) dtVN += vn; }

    var difDev = sm ? round2_(d  - sm.devoluciones) : null;
    var difAv  = sm ? round2_(a  - sm.averias)      : null;
    var difVB  = (sm && vb !== null) ? round2_(vb - sm.venta_bruta) : null;
    var difVN  = (sm && vn !== null) ? round2_(vn - sm.venta_neta)  : null;

    var obj = {
      cod_asesor:             cod,
      asesor_dashboard:       bm ? (cod + ' - ' + bm.nombre) : (sm ? sm.asesor : cod),
      en_sistema:             !!sm,
      en_dashboard:           enDash,
      devoluciones_dashboard: d,
      averias_dashboard:      a,
      venta_bruta_dashboard:  vb,       // null en light (no leímos BASE)
      venta_neta_dashboard:   vn,       // null en light
      devoluciones_sistema:   sm ? sm.devoluciones : null,
      averias_sistema:        sm ? sm.averias      : null,
      venta_bruta_sistema:    sm ? sm.venta_bruta  : null,
      venta_neta_sistema:     sm ? sm.venta_neta   : null,
      dif_devoluciones:       difDev,
      dif_averias:            difAv,
      dif_venta_bruta:        difVB,
      dif_venta_neta:         difVN,
    };

    if (enDash && !sm) {
      asesoresExtra.push(obj);
      exDev += d; exAv += a;
      if (vb !== null) exVB += vb;
      if (vn !== null) exVN += vn;
    }

    var tieneDif = (difDev !== null && difDev !== 0) || (difAv !== null && difAv !== 0) ||
                   (difVB  !== null && difVB  !== 0) || (difVN  !== null && difVN  !== 0);
    if (!isLight || !sm || tieneDif || (!enDash && sm)) {
      porAsesorAll.push(obj);
    }
  });

  porAsesorAll.sort(function(a, b) {
    return (parseInt(a.cod_asesor) || 9999) - (parseInt(b.cod_asesor) || 9999);
  });
  var tPorAsesor = Date.now();

  // Totales de devol/averias desde el pase fresco (consistente con por_asesor)
  var freshDev = round2_(Object.values(devMap).reduce(function(s,d){return s+d.devoluciones;},0) + devSinCodDevol);
  var freshAv  = round2_(Object.values(devMap).reduce(function(s,d){return s+d.averias;},0)      + devSinCodAverias);

  if (isLight) {
    // venta_neta desde cache (no leer BASE en light); devol/av desde hoja fresca
    var vnCache = resumenCache ? round2_(resumenCache.venta_neta || 0) : 0;
    dashboardTotal = {
      venta_bruta:  round2_(vnCache + freshDev + freshAv),
      devoluciones: freshDev,
      averias:      freshAv,
      venta_neta:   vnCache,
    };
  } else {
    // FULL: VN desde BASE (dtVN); devol/av desde hoja fresca (más preciso que dtDev/dtAv)
    dashboardTotal = {
      venta_bruta:  round2_(dtVN + freshDev + freshAv),
      devoluciones: freshDev,
      averias:      freshAv,
      venta_neta:   round2_(dtVN),
    };
  }

  // ── LOGS ─────────────────────────────────────────────────────────────────
  var msTotal = tPorAsesor - t0;
  Logger.log('[AUDITORIA RESUMEN] modo=' + (isLight ? 'light' : 'full') +
    ' periodo=' + periodoActual + ' ms=' + msTotal +
    ' (resumen=' + (tResumen-t0) + ' base=' + (tBase-tResumen) +
    ' devol=' + (tDevol-tBase) + ' porasesor=' + (tPorAsesor-tDevol) + ')');
  Logger.log('[AUDITORIA RESUMEN] venta_bruta_dashboard='  + dashboardTotal.venta_bruta);
  Logger.log('[AUDITORIA RESUMEN] devoluciones_dashboard=' + dashboardTotal.devoluciones);
  Logger.log('[AUDITORIA RESUMEN] averias_dashboard='      + dashboardTotal.averias);
  Logger.log('[AUDITORIA RESUMEN] venta_neta_dashboard='   + dashboardTotal.venta_neta);
  Logger.log('[AUDITORIA RESUMEN] asesores con devol='     + JSON.stringify(Object.keys(devMap).sort()));
  Logger.log('[AUDITORIA RESUMEN] devolucionesSinAsesor filas=' + devSinCod + ' devol=' + round2_(devSinCodDevol) + ' av=' + round2_(devSinCodAverias));
  Logger.log('[AUDITORIA RESUMEN] conceptosAverias=' + JSON.stringify(
    conceptosList.filter(function(c) { return c.tipo === 'AVERIA'; }).map(function(c) { return c.concepto + '=' + c.monto; })));
  Logger.log('[AUDITORIA RESUMEN] asesoresExtra=' +
    asesoresExtra.map(function(a) { return a.cod_asesor + '=' + a.asesor_dashboard; }).join(' | '));
  Logger.log('[AUDITORIA RESUMEN] devolucionesFueraRango201_214 filas=' + devolFueraDetalle.length + ' total=' + round2_(devolFueraMonto));

  return {
    ok:      true,
    modo:    isLight ? 'light' : 'full',
    periodo: periodoActual,
    nota:    isLight ? 'light: VB/VN por asesor omitidos (usan BASE). Usa ?modo=full para detalle completo.' : null,
    sistema_referencia: sistemaTotal,
    dashboard: dashboardTotal,
    diferencia: {
      venta_bruta:  round2_(dashboardTotal.venta_bruta  - sistemaTotal.venta_bruta),
      devoluciones: round2_(dashboardTotal.devoluciones - sistemaTotal.devoluciones),
      averias:      round2_(dashboardTotal.averias      - sistemaTotal.averias),
      venta_neta:   round2_(dashboardTotal.venta_neta   - sistemaTotal.venta_neta),
    },
    por_asesor:               porAsesorAll,
    conceptos_devoluciones:   conceptosList,
    asesores_extra_en_dashboard: asesoresExtra,
    total_extra_no_en_sistema: {
      venta_bruta:  round2_(exVB)  || null,
      devoluciones: round2_(exDev),
      averias:      round2_(exAv),
      venta_neta:   round2_(exVN)  || null,
    },
    devolucionesSinAsesor:        { filas: devSinCod, devol: round2_(devSinCodDevol), averias: round2_(devSinCodAverias) },
    devolucionesFueraRango201_214: { filas: devolFueraDetalle.length, total: round2_(devolFueraMonto), detalle: devolFueraDetalle },
    debug_ms: msTotal,
    debug_counts: {
      filas_base:      filasBase,
      filas_devol:     devRaw.length,
      asesores_devol:  Object.keys(devMap).length,
      conceptos_unicos: Object.keys(conceptosMap).length,
    },
  };
}

// ════════════════════════════════════════════════════════════════════
// AUDITORÍA DETALLE POR ASESOR (conceptos + base asesor 207)
// Llamar directo desde Apps Script URL — lee BASE (lento para Vercel).
// ?sheet=auditoria_detalle
// ════════════════════════════════════════════════════════════════════
function getAuditoriaDetalleAsesores_() {
  var t0 = Date.now();

  var ASESORES_FOCO = ['202', '203', '204', '206', '207', '214'];

  // Referencia del sistema para los asesores con diferencias conocidas
  var SISTEMA = {
    '202': { devoluciones: 2554.15, averias:  803.67, venta_neta: 10289.10 },
    '203': { devoluciones: 2228.66, averias:  522.92, venta_neta: 11570.20 },
    '204': { devoluciones: 1753.41, averias:  797.60, venta_neta: 10795.76 },
    '206': { devoluciones:  929.21, averias:  507.18, venta_neta:  7072.47 },
    '207': { devoluciones: 1528.34, averias:  330.97, venta_neta: 10007.65 },
    '214': { devoluciones: 1417.46, averias:  285.38, venta_neta:  2870.38 },
  };

  // Período desde cache (evita leer BASE dos veces)
  var resumenCache = withCache_('resumen', 300, getResumen);
  var periodoActual = resumenCache ? (resumenCache.periodo || '') : getPeriodoActualDesdeBase_();
  var tResumen = Date.now();

  // DEVOLUCIONES — un solo pase para todos los asesores foco
  var devRaw = getDevolucionesPeriodoRaw_(periodoActual);
  var tDevol = Date.now();

  // Acumuladores por asesor
  var porAsesor = {};
  ASESORES_FOCO.forEach(function(cod) {
    porAsesor[cod] = { devoluciones: 0, averias: 0, conceptos: {} };
  });

  devRaw.forEach(function(r) {
    var cod   = r.cod_asesor;
    if (ASESORES_FOCO.indexOf(cod) < 0) return;
    var conc  = r.concepto || '(vacío)';
    var esAv  = r.es_averia;
    var monto = r.vlr_devol || 0;
    if (!porAsesor[cod].conceptos[conc]) {
      porAsesor[cod].conceptos[conc] = { concepto: conc, tipo: esAv ? 'AVERIA' : 'DEVOLUCION', monto: 0, filas: 0 };
    }
    porAsesor[cod].conceptos[conc].monto += monto;
    porAsesor[cod].conceptos[conc].filas++;
    if (esAv) porAsesor[cod].averias      += monto;
    else      porAsesor[cod].devoluciones += monto;
  });

  // Resultado por asesor con diferencias
  var asesoresDetalle = ASESORES_FOCO.map(function(cod) {
    var pa = porAsesor[cod];
    var sm = SISTEMA[cod];
    var d  = round2_(pa.devoluciones);
    var a  = round2_(pa.averias);
    var conceptos = Object.values(pa.conceptos)
      .sort(function(x, y) { return y.monto - x.monto; })
      .map(function(c) { return { concepto: c.concepto, tipo: c.tipo, monto: round2_(c.monto), filas: c.filas }; });

    Logger.log('[DETALLE cod=' + cod + '] d=' + d + ' a=' + a +
      ' dif_d=' + (sm ? round2_(d - sm.devoluciones) : '?') +
      ' dif_a=' + (sm ? round2_(a - sm.averias) : '?') +
      ' conceptos: ' + conceptos.map(function(c){ return c.concepto + '(' + c.tipo[0] + ')=' + c.monto; }).join(' | '));

    return {
      cod_asesor:             cod,
      devoluciones_dashboard: d,
      averias_dashboard:      a,
      devoluciones_sistema:   sm ? sm.devoluciones : null,
      averias_sistema:        sm ? sm.averias      : null,
      dif_devoluciones:       sm ? round2_(d - sm.devoluciones)           : null,
      dif_averias:            sm ? round2_(a - sm.averias)                : null,
      dif_total:              sm ? round2_((d + a) - (sm.devoluciones + sm.averias)) : null,
      conceptos:              conceptos,
    };
  });

  // BASE_ACUMULADA — detalle filas asesor 207 (identifica fila faltante para brecha VN=-16.21)
  // BASE cols: [0]=fecha [1]=cod_cli [2]=nom_cli [3]=cod_asesor_raw [4]=nom_vendedor
  //            [5]=ciudad [6]=cod_sku [7]=nom_producto [8]=negocio
  //            [13]=cant_neta [14]=valor [18]=periodo
  var hB = getSheet_(HOJAS.BASE);
  var base207 = [];
  var vn207   = 0;
  var filas207 = 0;

  if (hB && hB.getLastRow() > 1) {
    var allBase = hB.getDataRange().getValues();
    for (var i = 1; i < allBase.length; i++) {
      var row   = allBase[i];
      var pRow  = periodoYYYYMM_(row[18]);
      if (pRow !== periodoActual) continue;
      var cod   = obtenerCodAsesor_(row[3]);
      if (cod !== '207') continue;
      var nom   = String(row[4] || '').trim();
      if (!esVendedorValido_(cod, nom)) continue;
      var valor = parseFloat(row[14]) || 0;
      vn207  += valor;
      filas207++;
      base207.push({
        fecha:        row[0] instanceof Date ? Utilities.formatDate(row[0], TZ, 'yyyy-MM-dd') : String(row[0] || ''),
        cod_cliente:  String(row[1] || '').trim(),
        nom_cliente:  String(row[2] || '').trim(),
        cod_sku:      String(row[6] || '').trim(),
        nom_producto: String(row[7] || '').trim(),
        negocio:      String(row[8] || '').trim(),
        cant_neta:    parseFloat(row[13]) || 0,
        valor:        valor,
      });
    }
  }
  base207.sort(function(a, b) { return a.fecha > b.fecha ? 1 : a.fecha < b.fecha ? -1 : 0; });

  var tBase = Date.now();
  var ms = tBase - t0;

  Logger.log('[AUDITORIA_DETALLE] periodo=' + periodoActual + ' ms=' + ms +
    ' (resumen=' + (tResumen-t0) + ' devol=' + (tDevol-tResumen) + ' base=' + (tBase-tDevol) + ')');
  Logger.log('[AUDITORIA_DETALLE] vn207_dashboard=' + round2_(vn207) +
    ' vn207_sistema=10007.65 dif=' + round2_(vn207 - 10007.65) + ' filas207=' + filas207);

  return {
    ok:      true,
    periodo: periodoActual,
    nota:    'Lee BASE completa (~14s). Llamar desde URL directa de Apps Script, no desde Vercel.',
    asesores_detalle: asesoresDetalle,
    asesor207_venta_neta: {
      venta_neta_dashboard: round2_(vn207),
      venta_neta_sistema:   10007.65,
      diferencia:           round2_(vn207 - 10007.65),
      filas_base:           filas207,
      detalle:              base207,
    },
    debug_ms:     ms,
    debug_counts: { filas_devol: devRaw.length, filas_base207: filas207 },
  };
}

// ════════════════════════════════════════════════════════════════════
// DIAGNÓSTICO CLASIFICACIÓN DEV vs AVERIA
// ?sheet=clasif_debug
// Muestra headers reales de DEVOLUCIONES y DEVOLUCIONES_RAW,
// filas de PRODUCTO VENCIDO asesor 214, y distribución de tipo_producto por concepto.
// ════════════════════════════════════════════════════════════════════
function getDiagnosticoClasifDevol_() {
  var t0 = Date.now();

  // Headers reales de ambas hojas
  var hDev    = getSheet_(HOJAS.DEVOLUCIONES);
  var hDevRaw = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DEVOLUCIONES_RAW');

  var devHeaders = [];
  var rawHeaders = [];
  var rawSampleRow214 = [];   // fila raw completa para asesor 214 PRODUCTO VENCIDO

  if (hDev && hDev.getLastRow() >= 1) {
    devHeaders = hDev.getRange(1, 1, 1, hDev.getLastColumn()).getValues()[0].map(String);
  }
  if (hDevRaw && hDevRaw.getLastRow() >= 1) {
    rawHeaders = hDevRaw.getRange(1, 1, 1, hDevRaw.getLastColumn()).getValues()[0].map(String);
    // Buscar primeras filas de asesor 214 con PRODUCTO VENCIDO en el raw
    if (hDevRaw.getLastRow() > 1) {
      var rawAll = hDevRaw.getDataRange().getValues();
      for (var ri = 1; ri < rawAll.length && rawSampleRow214.length < 5; ri++) {
        var rr = rawAll[ri];
        // cod_asesor suele estar en col 8 del raw (0-indexed)
        var codRaw = String(rr[8] || '').trim();
        var concRaw = String(rr[4] || '').toUpperCase();
        if (obtenerCodAsesor_(codRaw) === '214' && concRaw.indexOf('VENCIDO') >= 0) {
          rawSampleRow214.push(rr.map(function(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v || ''); }));
        }
      }
    }
  }

  // Período desde cache
  var resumenCache = withCache_('resumen', 300, getResumen);
  var periodoActual = resumenCache ? (resumenCache.periodo || '') : getPeriodoActualDesdeBase_();

  // Leer DEVOLUCIONES procesada (una pasada) para agrupar tipo_producto por concepto
  var devRaw = getDevolucionesPeriodoRaw_(periodoActual);

  // 1) Agrupación: concepto → tipo_producto → { monto, filas }
  var tipoPorConcepto = {};
  devRaw.forEach(function(r) {
    var conc = r.concepto  || '(vacío)';
    var tipo = r.tipo_producto || '(vacío)';
    if (!tipoPorConcepto[conc]) tipoPorConcepto[conc] = {};
    if (!tipoPorConcepto[conc][tipo]) tipoPorConcepto[conc][tipo] = { monto: 0, filas: 0 };
    tipoPorConcepto[conc][tipo].monto += r.vlr_devol || 0;
    tipoPorConcepto[conc][tipo].filas++;
  });

  var tipoPorConceptoList = Object.keys(tipoPorConcepto).map(function(conc) {
    return {
      concepto: conc,
      tipos: Object.keys(tipoPorConcepto[conc]).map(function(t) {
        return { tipo_producto: t, monto: round2_(tipoPorConcepto[conc][t].monto), filas: tipoPorConcepto[conc][t].filas };
      }).sort(function(a, b) { return b.monto - a.monto; }),
    };
  }).sort(function(a, b) {
    var ta = Object.values(tipoPorConcepto[a.concepto]).reduce(function(s, v){ return s + v.monto; }, 0);
    var tb = Object.values(tipoPorConcepto[b.concepto]).reduce(function(s, v){ return s + v.monto; }, 0);
    return tb - ta;
  });

  // 2) Detalle completo de asesor 214 PRODUCTO VENCIDO (procesado, no raw)
  var pv214 = devRaw.filter(function(r) {
    return r.cod_asesor === '214' && (r.concepto || '').toUpperCase().indexOf('VENCIDO') >= 0;
  }).map(function(r) {
    return {
      concepto:      r.concepto,
      tipo_producto: r.tipo_producto,
      vlr_devol:     r.vlr_devol,
      cod_cliente:   r.cod_cliente,
      nom_cliente:   r.nom_cliente,
      cod_sku:       r.cod_sku,
      nom_producto:  r.nom_producto,
      factura:       r.factura,
    };
  });

  // 3) Unique tipo_producto values across all rows
  var uniqueTipos = {};
  devRaw.forEach(function(r) { uniqueTipos[r.tipo_producto || '(vacío)'] = (uniqueTipos[r.tipo_producto || '(vacío)'] || 0) + 1; });

  Logger.log('[CLASIF_DEBUG] headers_devol=' + JSON.stringify(devHeaders));
  Logger.log('[CLASIF_DEBUG] headers_raw=' + JSON.stringify(rawHeaders));
  Logger.log('[CLASIF_DEBUG] unique_tipos=' + JSON.stringify(uniqueTipos));
  Logger.log('[CLASIF_DEBUG] pv214 filas=' + pv214.length);

  return {
    ok: true,
    periodo: periodoActual,
    devoluciones_headers: devHeaders,
    devoluciones_raw_headers: rawHeaders,
    devoluciones_raw_sample_214_pvencido: rawSampleRow214,
    unique_tipo_producto_values: uniqueTipos,
    tipo_producto_por_concepto: tipoPorConceptoList,
    asesor214_pvencido_detalle: pv214,
    debug_ms: Date.now() - t0,
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

    if (!cod) return;
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
    } else if (!vendMap[cod].nombre && vendedor) {
      vendMap[cod].nombre = vendedor;
    }

    vendMap[cod].venta_neta_vmx += valor;

    // Acumular venta NETA por negocio (incluye positivos y negativos)
    if (negocio) {
      vendMap[cod].negocios[negocio] = (vendMap[cod].negocios[negocio] || 0) + valor;
    }

    if (valor > 0) {
      vendMap[cod].venta_positiva_vmx += valor;
      vendMap[cod].clientes.add(normalizarCodigoCliente_(r[1]));
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

        // Cobertura — OJO: clientes_imp viene de BASE_ACUMULADA (este período,
        // valor>0); impactados/maestro/cobertura vienen de RESUMEN_COBERTURA
        // (otra fuente). Son cifras cercanas pero no idénticas — el frontend
        // debe emparejar "impactados" con "maestro"/"cobertura" (misma fuente),
        // nunca "clientes_imp" con "maestro" (fuentes distintas).
        clientes_imp: v.clientes.size,
        maestro:      cobMap[v.cod]?.maestro    || 0,
        impactados:   cobMap[v.cod]?.impactados || 0,
        cobertura:    cobMap[v.cod]?.cobertura   || 0,
        sin_compra:   cobMap[v.cod]?.sin_compra  || 0,

        // Operación
        efectividad: efMap[v.cod] || 0,
        ticket:      v.clientes.size > 0 ? round2_(ventaNeta / v.clientes.size) : 0,

        // Cuota / meta mensual
        cuota:            round2_(cuota),
        pct_cumplimiento: cuota > 0 ? round2_(ventaNeta / cuota * 100) : 0
      };
    })
    .sort((a, b) => b.venta_bruta - a.venta_bruta);
}

// ════════════════════════════════════════════════════════════════════
// AUDITORÍA INDIVIDUAL DE VENDEDOR — diagnóstico bajo demanda, sin cache,
// para validar caso a caso si BASE_ACUMULADA/RESUMEN_COBERTURA están al
// día y de dónde sale exactamente lo que muestra el panel "vendedores".
// Uso: /api/datos?sheet=auditoria_vendedor&cod_asesor=212
// ════════════════════════════════════════════════════════════════════
function getAuditoriaVendedor_(codAsesorParam) {
  const cod = obtenerCodAsesor_(String(codAsesorParam || ''));
  if (!cod) return { ok: false, error: 'Falta parámetro cod_asesor' };

  const mesData        = getBasePeriodoActual_();
  const filasVendedor  = mesData.filter(r => obtenerCodAsesor_(r[3]) === cod);

  let ventaNeta = 0;
  let nombreVendedor = '';
  const porCodigo        = {};      // cod_cliente normalizado → { cod_cliente, nombre, venta }
  const porNombre        = {};      // nombre normalizado      → { nombre, venta }
  const porCodigoYNombre = new Set();
  const ejemplosCodigos  = [];

  filasVendedor.forEach(r => {
    const valor = parseFloat(r[14]) || 0;
    ventaNeta += valor;
    if (!nombreVendedor) {
      const nom = String(r[4] || '').trim();
      if (nom) nombreVendedor = nom;
    }
    if (valor <= 0) return; // mismo criterio que getVendedores/getTopClientes: solo ventas positivas cuentan como "impacto"

    const codCliRaw = r[1];
    const codCli     = normalizarCodigoCliente_(codCliRaw);
    const nomCli      = String(r[2] || '').trim();
    if (!codCli) return;

    if (ejemplosCodigos.length < 15) {
      ejemplosCodigos.push({ raw: String(codCliRaw), normalizado: codCli, nombre: nomCli });
    }

    if (!porCodigo[codCli]) porCodigo[codCli] = { cod_cliente: codCli, nombre: nomCli, venta: 0 };
    porCodigo[codCli].venta += valor;

    const nomKey = normalizarTexto_(nomCli) || codCli;
    if (!porNombre[nomKey]) porNombre[nomKey] = { nombre: nomCli || codCli, venta: 0 };
    porNombre[nomKey].venta += valor;

    porCodigoYNombre.add(codCli + '||' + nomKey);
  });

  const topPorCodigo = Object.values(porCodigo)
    .sort((a, b) => b.venta - a.venta).slice(0, 10)
    .map((c, i) => ({ ranking: i + 1, cod_cliente: c.cod_cliente, nombre: c.nombre, venta: round2_(c.venta) }));

  const topPorNombre = Object.values(porNombre)
    .sort((a, b) => b.venta - a.venta).slice(0, 10)
    .map((c, i) => ({ ranking: i + 1, nombre: c.nombre, venta: round2_(c.venta) }));

  // ── RESUMEN_COBERTURA: fuente externa (no calculada por Código.js) ──
  const hRC = getSheet_(HOJAS.RESUMEN_COBERTURA);
  let cobInfo = null;
  if (hRC && hRC.getLastRow() > 1) {
    const fila = hRC.getDataRange().getValues().slice(1)
      .find(r => obtenerCodAsesor_(String(r[0] || '')) === cod);
    if (fila) {
      cobInfo = {
        maestro:       parseInt(fila[1])   || 0,
        impactados:    parseInt(fila[2])   || 0,
        cobertura_pct: parseFloat(fila[3]) || 0,
        fecha_o_corte: fila[5] !== undefined ? fechaISO_(fila[5]) : '',
      };
    }
  }

  // ── MAESTRO_CLIENTES real (universo asignado, independiente de RESUMEN_COBERTURA) ──
  const maestro = cargarMaestroActivos_();
  const clientesAsignadosReal = maestro.byAsesor[cod] ? maestro.byAsesor[cod].size : 0;

  // ── Lo que el panel "vendedores" (Mi Panel) muestra hoy ──────────────────
  // getVendedores() expone cobertura/impactados/maestro tal cual cobMap[cod]
  // (ver arriba) — son el MISMO valor, así que lo reutilizamos en vez de
  // volver a escanear toda BASE_ACUMULADA (eso duplicaba el costo y hacía
  // que el endpoint superara el timeout de 9.2s del proxy de Vercel).

  return {
    ok: true,
    cod_asesor: cod,
    vendedor: nombreVendedor,
    base_acumulada: {
      filas:                               filasVendedor.length,
      venta_neta:                          round2_(ventaNeta),
      clientes_unicos_por_codigo:          Object.keys(porCodigo).length,
      clientes_unicos_por_nombre:          Object.keys(porNombre).length,
      clientes_unicos_por_codigo_y_nombre: porCodigoYNombre.size,
      ejemplos_codigos:        ejemplosCodigos,
      top_clientes_por_codigo: topPorCodigo,
      top_clientes_por_nombre: topPorNombre,
    },
    resumen_cobertura: {
      existe:        !!cobInfo,
      maestro:       cobInfo ? cobInfo.maestro       : 0,
      impactados:    cobInfo ? cobInfo.impactados    : 0,
      cobertura_pct: cobInfo ? cobInfo.cobertura_pct : 0,
      fecha_o_corte: cobInfo ? cobInfo.fecha_o_corte : '',
    },
    maestro_clientes: {
      clientes_asignados_real: clientesAsignadosReal,
    },
    panel_actual: {
      cobertura_mostrada:            cobInfo ? cobInfo.cobertura_pct : 0,
      clientes_impactados_mostrados: cobInfo ? cobInfo.impactados    : 0,
      maestro_mostrado:              cobInfo ? cobInfo.maestro       : 0,
    },
  };
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
// AUDITORÍA: Cobertura por Negocio vs sistema oficial (DISTRIBUCION X
// PRODUCTOS). Tabla de referencia provista manualmente por el usuario —
// solo cubre Cárnico y Café por ahora. Uso:
//   /api/datos?sheet=auditoria_cobertura_negocio[&cod_asesor=208]
// ════════════════════════════════════════════════════════════════════
var REFERENCIA_COB_NEG = {
  'Cárnico': {
    '201': { impactados: 168, rutero: 216, cobertura_pct: 77.78, venta: 6932.07 },
    '202': { impactados: 164, rutero: 205, cobertura_pct: 80.00, venta: 9983.22 },
    '203': { impactados: 162, rutero: 217, cobertura_pct: 74.65, venta: 13874.69 },
    '204': { impactados: 157, rutero: 221, cobertura_pct: 71.04, venta: 7905.71 },
    '205': { impactados: 79,  rutero: 132, cobertura_pct: 59.85, venta: 4596.62 },
    '206': { impactados: 134, rutero: 181, cobertura_pct: 74.03, venta: 7339.50 },
    '207': { impactados: 159, rutero: 234, cobertura_pct: 67.95, venta: 12046.99 },
    '208': { impactados: 167, rutero: 237, cobertura_pct: 70.46, venta: 8198.45 },
    '209': { impactados: 125, rutero: 238, cobertura_pct: 52.52, venta: 7680.40 },
    '210': { impactados: 171, rutero: 259, cobertura_pct: 66.02, venta: 9626.74 },
    '211': { impactados: 13,  rutero: 63,  cobertura_pct: 20.63, venta: 3678.98 },
    '212': { impactados: 11,  rutero: 157, cobertura_pct: 7.01,  venta: 370.58  },
    '213': { impactados: 48,  rutero: 150, cobertura_pct: 32.00, venta: 2302.52 },
    '214': { impactados: 45,  rutero: 97,  cobertura_pct: 46.39, venta: 1926.50 },
  },
  'Café': {
    '201': { impactados: 88,  rutero: 216, cobertura_pct: 40.74, venta: 2719.13 },
    '202': { impactados: 72,  rutero: 205, cobertura_pct: 35.12, venta: 1722.84 },
    '203': { impactados: 103, rutero: 217, cobertura_pct: 47.47, venta: 2434.85 },
    '204': { impactados: 62,  rutero: 221, cobertura_pct: 28.05, venta: 2515.96 },
    '205': { impactados: 34,  rutero: 132, cobertura_pct: 25.76, venta: 1155.41 },
    '206': { impactados: 63,  rutero: 181, cobertura_pct: 34.81, venta: 2432.58 },
    '207': { impactados: 56,  rutero: 234, cobertura_pct: 23.93, venta: 2108.11 },
    '208': { impactados: 87,  rutero: 237, cobertura_pct: 36.71, venta: 1958.54 },
    '209': { impactados: 57,  rutero: 238, cobertura_pct: 23.95, venta: 2277.62 },
    '210': { impactados: 107, rutero: 259, cobertura_pct: 41.31, venta: 4778.02 },
    '211': { impactados: 17,  rutero: 63,  cobertura_pct: 26.98, venta: 1426.33 },
    '212': { impactados: 35,  rutero: 157, cobertura_pct: 22.29, venta: 2290.57 },
    '213': { impactados: 31,  rutero: 150, cobertura_pct: 20.67, venta: 2046.46 },
    '214': { impactados: 11,  rutero: 97,  cobertura_pct: 11.34, venta: 769.70  },
  },
};
var REFERENCIA_COB_NEG_TOTAL = {
  'Cárnico': { impactados: 1603, rutero: 2607, cobertura_pct: 61.49, venta: 96463.21 },
  'Café':    { impactados: 823,  rutero: 2607, cobertura_pct: 31.57, venta: 30636.12 },
};

// Venta NETA por vendedor × negocio normalizado, con el mismo respaldo de
// negocio (PRODUCTOS_CLAVE) que ya usa calcularCoberturaNegocio(). Escaneo
// propio e independiente de BASE_ACUMULADA — NO reutiliza getVendedores()
// a propósito: getVendedores() alimenta Mi Panel/Mi Gerencia/Gerencial/
// Cobertura por marcas/Seguimiento de concursos, que no deben cambiar de
// valor por este fix. Solo para auditoría de Cobertura por Negocio.
function calcularVentaPorNegocioConFallback_() {
  const hB = getSheet_(HOJAS.BASE);
  if (!hB) return {};
  const baseData = hB.getDataRange().getValues().slice(1);
  let periodoCalc = '';
  baseData.forEach(r => {
    const v = r[18];
    const p = v instanceof Date
      ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}`
      : String(v || '').substring(0, 7);
    if (p > periodoCalc) periodoCalc = p;
  });
  const ctxNegocio = construirContextoNegocioFallback_(baseData, periodoCalc);

  const ventaMap = {}; // cod_asesor -> negocio normalizado -> venta neta
  baseData.forEach(r => {
    const v = r[18];
    const p = v instanceof Date
      ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}`
      : String(v || '').substring(0, 7);
    if (p !== periodoCalc) return;
    if (!esFilaBaseValida_(r)) return;
    const cod = obtenerCodAsesor_(r[3]);
    if (!cod) return;
    const neg = normNegMiG_(resolverNegocioFinal_(r[8], r[6], ctxNegocio));
    if (!neg) return;
    if (!ventaMap[cod]) ventaMap[cod] = {};
    ventaMap[cod][neg] = round2_((ventaMap[cod][neg] || 0) + (parseFloat(r[14]) || 0));
  });
  return ventaMap;
}

function getAuditoriaCoberturaNegocio_(codFiltroParam) {
  const codFiltro = codFiltroParam ? obtenerCodAsesor_(String(codFiltroParam)) : '';

  const filasCN = getCoberturaNegocios();
  // Venta con respaldo de negocio (PRODUCTOS_CLAVE) — escaneo propio, no usa
  // el cache de getVendedores() (ver comentario en calcularVentaPorNegocioConFallback_).
  const ventaMap = withCache_('venta_negocio_fallback', 60, calcularVentaPorNegocioConFallback_);

  const negociosObjetivo = Object.keys(REFERENCIA_COB_NEG);
  const detalle = [];

  negociosObjetivo.forEach(negObjetivo => {
    const ref = REFERENCIA_COB_NEG[negObjetivo];
    Object.keys(ref).forEach(codV => {
      if (codFiltro && codV !== codFiltro) return;

      const fila = filasCN.find(r =>
        obtenerCodAsesor_(r.vendedor) === codV && normNegMiG_(r.negocio) === negObjetivo
      );
      const palmaImp    = fila ? Number(fila.impactados)      || 0 : 0;
      const palmaUniv   = fila ? Number(fila.clientes_maestro) || 0 : 0;
      const palmaPct    = fila ? Number(fila.cobertura_)       || 0 : 0;
      const palmaVenta  = ventaMap[codV]?.[negObjetivo] || 0;

      const sis = ref[codV];
      detalle.push({
        negocio:    negObjetivo,
        cod_asesor: codV,
        palma: {
          impactados:    palmaImp,
          universo:      palmaUniv,
          cobertura_pct: palmaPct,
          venta:         palmaVenta,
        },
        sistema_referencia: {
          impactados:    sis.impactados,
          rutero:        sis.rutero,
          cobertura_pct: sis.cobertura_pct,
          venta:         sis.venta,
        },
        diferencia: {
          impactados:   palmaImp  - sis.impactados,
          universo:     palmaUniv - sis.rutero,
          cobertura_pp: round2_(palmaPct - sis.cobertura_pct),
          venta:        round2_(palmaVenta - sis.venta),
        },
      });
    });
  });

  // Los totales por negocio (suma de TODOS los vendedores) solo tienen
  // sentido cuando no se filtra por un vendedor — comparar un solo vendedor
  // contra el total del equipo sería engañoso.
  const totales = codFiltro ? null : negociosObjetivo.map(neg => {
    const filasNeg        = detalle.filter(r => r.negocio === neg);
    const palmaImpTotal   = filasNeg.reduce((s, r) => s + r.palma.impactados, 0);
    const palmaUnivTotal  = filasNeg.reduce((s, r) => s + r.palma.universo, 0);
    const palmaVentaTotal = round2_(filasNeg.reduce((s, r) => s + r.palma.venta, 0));
    const palmaPctTotal   = palmaUnivTotal > 0 ? round2_(palmaImpTotal / palmaUnivTotal * 100) : 0;
    const sisT = REFERENCIA_COB_NEG_TOTAL[neg];
    return {
      negocio: neg,
      palma: { impactados: palmaImpTotal, universo: palmaUnivTotal, cobertura_pct: palmaPctTotal, venta: palmaVentaTotal },
      sistema_referencia: sisT,
      diferencia: {
        impactados:   palmaImpTotal  - sisT.impactados,
        universo:     palmaUnivTotal - sisT.rutero,
        cobertura_pp: round2_(palmaPctTotal - sisT.cobertura_pct),
        venta:        round2_(palmaVentaTotal - sisT.venta),
      },
    };
  });

  return { ok: true, cod_asesor: codFiltro || null, detalle, totales };
}

// ════════════════════════════════════════════════════════════════════
// Diagnóstico de solo lectura — regla OFICIAL confirmada: impactado =
// cant_neta > 0 (r[13]), NO valor_venta. No cambia calcularCoberturaNegocio(),
// no recalcula COBERTURA_NEGOCIO, no escribe nada. Solo compara contra
// REFERENCIA_COB_NEG para los 14 vendedores × Cárnico/Café.
// Uso: /api/datos?sheet=auditoria_cant_neta_todos
// ════════════════════════════════════════════════════════════════════
function getAuditoriaCantNetaTodos_() {
  const hB = getSheet_(HOJAS.BASE);
  const hM = getSheet_(HOJAS.MAESTRO_CLIENTES);
  if (!hB || !hM) return { ok: false, error: 'Faltan hojas BASE_ACUMULADA o MAESTRO_CLIENTES' };

  // Universo (maestroSet) idéntico al de calcularCoberturaNegocio(): estado='A' + dedup.
  const maestroPorCod = {};
  const nombreVendedorPorCod = {};
  hM.getDataRange().getValues().slice(1).forEach(r => {
    const asesorRaw = String(r[20] || '').trim();
    const cod = obtenerCodAsesor_(asesorRaw);
    if (!cod) return;
    if (String(r[19] || '').trim().toUpperCase() !== 'A') return;
    const cli = normalizarCodigoCliente_(r[0]);
    if (!cli) return;
    if (!maestroPorCod[cod]) maestroPorCod[cod] = new Set();
    maestroPorCod[cod].add(cli);
    if (!nombreVendedorPorCod[cod]) nombreVendedorPorCod[cod] = asesorRaw;
  });

  const baseData = hB.getDataRange().getValues().slice(1);
  let periodoCalc = '';
  baseData.forEach(r => {
    const v = r[18];
    const p = v instanceof Date
      ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}`
      : String(v || '').substring(0, 7);
    if (p > periodoCalc) periodoCalc = p;
  });

  // Mismo respaldo de negocio que calcularCoberturaNegocio() — si r[8] viene
  // vacío, se resuelve por cod_sku contra PRODUCTOS_CLAVE antes de descartar la fila.
  const ctxNegocio = construirContextoNegocioFallback_(baseData, periodoCalc);

  // Por vendedor+negocio(normalizado): impactados (clientes en maestroSet con
  // cant_neta>0), clientesConCantPositiva (TODOS, dentro o fuera del maestro),
  // filas con cant_neta>0, y venta NETA total del negocio (todas las filas,
  // igual que getVendedores().venta_por_negocio — no solo impactados).
  const acc = {}; // cod -> negocio -> {...}
  baseData.forEach(r => {
    const v = r[18];
    const p = v instanceof Date
      ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}`
      : String(v || '').substring(0, 7);
    if (p !== periodoCalc) return;
    if (!esFilaBaseValida_(r)) return;
    const cod = obtenerCodAsesor_(r[3]);
    if (!cod) return;
    const negRaw = resolverNegocioFinal_(r[8], r[6], ctxNegocio);
    const neg    = normNegMiG_(negRaw);
    if (neg !== 'Cárnico' && neg !== 'Café') return;
    const cli   = normalizarCodigoCliente_(r[1]);
    const cant  = parseFloat(r[13]) || 0;
    const venta = parseFloat(r[14]) || 0;

    if (!acc[cod]) acc[cod] = {};
    if (!acc[cod][neg]) {
      acc[cod][neg] = {
        venta_total_del_negocio: 0,
        filas_con_cant_neta_positiva: 0,
        clientesConCantPositiva: new Set(),
        clientesImpactados: new Set(),
        negocios_raw: new Set(),
      };
    }
    const a = acc[cod][neg];
    a.venta_total_del_negocio += venta; // NETO — incluye negativos, igual que getVendedores()
    a.negocios_raw.add(negRaw);
    if (cant > 0 && cli) {
      a.filas_con_cant_neta_positiva++;
      a.clientesConCantPositiva.add(cli);
      if (maestroPorCod[cod] && maestroPorCod[cod].has(cli)) a.clientesImpactados.add(cli);
    }
  });

  const detalle = [];
  ['Cárnico', 'Café'].forEach(neg => {
    Object.keys(REFERENCIA_COB_NEG[neg]).forEach(cod => {
      const a = (acc[cod] && acc[cod][neg]) || {
        venta_total_del_negocio: 0, filas_con_cant_neta_positiva: 0,
        clientesConCantPositiva: new Set(), clientesImpactados: new Set(), negocios_raw: new Set(),
      };
      const sis = REFERENCIA_COB_NEG[neg][cod];
      const palmaImp = a.clientesImpactados.size;
      const palmaVenta = round2_(a.venta_total_del_negocio);
      detalle.push({
        cod_asesor: cod,
        vendedor: nombreVendedorPorCod[cod] || '',
        negocio: neg,
        sistema: { impactados: sis.impactados, venta: sis.venta },
        palma: {
          impactados_por_cant_neta_positiva: palmaImp,
          venta_total_del_negocio: palmaVenta,
          filas_con_cant_neta_positiva: a.filas_con_cant_neta_positiva,
          clientes_con_cant_neta_positiva: a.clientesConCantPositiva.size,
          negocios_raw_detectados: [...a.negocios_raw],
        },
        diferencia: {
          impactados: palmaImp - sis.impactados,
          venta: round2_(palmaVenta - sis.venta),
        },
        // Si clientes_con_cant_neta_positiva > impactados, hay clientes con compra
        // real que NO están en el universo/rutero (MAESTRO_CLIENTES) de este vendedor.
        clientes_con_compra_fuera_de_maestro: a.clientesConCantPositiva.size - palmaImp,
      });
    });
  });

  return { ok: true, regla_impactado: 'cant_neta > 0 (r[13])', periodo: periodoCalc, detalle };
}

// Auditoría de solo lectura — explica de dónde salen los tres denominadores
// distintos (2,608 / 2,670 / ~2,674) que PALMA muestra en diferentes partes
// del dashboard. Clasifica cada fila de MAESTRO_CLIENTES según los filtros
// que aplica cada función, lista los clientes excluidos con la razón exacta
// y detecta duplicados de código de cliente. No modifica ninguna hoja.
// Uso: /api/datos?sheet=auditoria_universos_clientes
function getAuditoriaUniversosClientes_() {
  var hM   = getSheet_(HOJAS.MAESTRO_CLIENTES);
  var hB   = getSheet_(HOJAS.BASE);
  var hRes = getSheet_(HOJAS.RESUMEN_COBERTURA);

  if (!hM) return { ok: false, error: 'No existe MAESTRO_CLIENTES' };

  // ── 1. Construir codsValidos (idéntico a calcularCobertura) ─────────
  var codsValidos = new Set();
  if (hB && hB.getLastRow() > 1) {
    hB.getRange(2, 4, hB.getLastRow() - 1, 1).getValues().forEach(function(r) {
      var txt = String(r[0] || '').trim();
      var cod = obtenerCodAsesor_(txt);
      if (!esVendedorValido_(cod, txt)) return;
      if (cod && /^\d{3}$/.test(cod)) codsValidos.add(cod);
    });
  }

  // ── 2. Leer MAESTRO y clasificar cada fila ──────────────────────────
  var filas = hM.getDataRange().getValues().slice(1);
  var maestroTotalFilas = filas.length;

  var setEstadoA    = new Set();   // estado='A' + codCli válido (sin filtro de asesor)
  var setSinBodega  = new Set();   // ≡ cargarMaestroActivos_()  ≈ 2,670
  var setCalcCob    = new Set();   // unique clientes tras filtros de calcularCobertura
  var mapCalcCob    = {};          // cod_asesor → Set<cli_raw> (réplica de ruteroMap)

  var listaBodega         = [];
  var listaSinAsesor      = [];
  var listaCodNo3Digits   = [];
  var listaSinCodsValidos = [];
  var rawCount            = {};    // codCli → nº de filas (para detectar duplicados)

  filas.forEach(function(r) {
    var codCli    = normalizarCodigoCliente_(r[0]);
    var cliRaw    = String(r[0] || '').trim();         // calcularCobertura usa raw
    var nombre    = String(r[1]  || '').trim();
    var asesorRaw = String(r[20] || '').trim();
    var codAs     = obtenerCodAsesor_(asesorRaw);
    var estado    = String(r[19] || '').trim().toUpperCase();

    if (codCli) rawCount[codCli] = (rawCount[codCli] || 0) + 1;

    if (estado !== 'A') return;
    if (!codCli) return;

    // Universo A: estado='A' + codCli válido (cualquier asesor)
    setEstadoA.add(codCli);

    // Filtro BODEGA (cargarMaestroActivos_ excluye asesor BODEGA si asesorRaw es truthy)
    if (asesorRaw && !esVendedorValido_(codAs, asesorRaw)) {
      listaBodega.push({ cod_cliente: codCli, nombre: nombre, asesor: asesorRaw, cod_asesor: codAs });
      return;
    }

    // Universo B: cargarMaestroActivos_() — incluye clientes sin asesor
    setSinBodega.add(codCli);
    if (!asesorRaw) {
      listaSinAsesor.push({ cod_cliente: codCli, nombre: nombre });
    }

    // Réplica exacta de los filtros de calcularCobertura() para Universo C
    if (!asesorRaw || !cliRaw || cliRaw === '0') return;
    if (!codAs || !/^\d{3}$/.test(codAs)) {
      listaCodNo3Digits.push({ cod_cliente: codCli, nombre: nombre, asesor: asesorRaw, cod_asesor: codAs || '' });
      return;
    }
    if (codsValidos.size > 0 && !codsValidos.has(codAs)) {
      listaSinCodsValidos.push({ cod_cliente: codCli, nombre: nombre, asesor: asesorRaw, cod_asesor: codAs });
      return;
    }

    setCalcCob.add(codCli);
    if (!mapCalcCob[codAs]) mapCalcCob[codAs] = new Set();
    mapCalcCob[codAs].add(cliRaw);
  });

  // totM tal como lo reporta calcularCobertura (suma de Sets por vendedor,
  // un cliente con dos asesores válidos contaría doble)
  var totMCalcCob = Object.values(mapCalcCob).reduce(function(acc, s) { return acc + s.size; }, 0);

  // Duplicados (mismo codCli en más de una fila de MAESTRO)
  var duplicados = Object.keys(rawCount)
    .filter(function(k) { return rawCount[k] > 1; })
    .map(function(k) { return { cod_cliente: k, apariciones: rawCount[k] }; });

  // Total reportado por RESUMEN_COBERTURA (lo que calcularCobertura escribió)
  var resumenTotal = 0;
  if (hRes && hRes.getLastRow() > 2) {
    var rFilas = hRes.getDataRange().getValues().slice(1);
    var ultima = rFilas[rFilas.length - 1];
    if (ultima && String(ultima[0] || '').includes('TOTAL')) resumenTotal = Number(ultima[1]) || 0;
  }

  return {
    ok: true,
    fecha_auditoria: new Date().toISOString(),
    universos: {
      maestro_filas_total:        maestroTotalFilas,
      maestro_estado_A:           setEstadoA.size,
      maestro_sin_bodega:         setSinBodega.size,
      maestro_calc_cobertura:     setCalcCob.size,
      maestro_calc_cob_sum:       totMCalcCob,
      resumen_cobertura_total:    resumenTotal,
    },
    diferencias: {
      estado_A_vs_sin_bodega:     setEstadoA.size  - setSinBodega.size,
      sin_bodega_vs_calc_cob:     setSinBodega.size - setCalcCob.size,
      calc_cob_sum_vs_unique:     totMCalcCob       - setCalcCob.size,
    },
    conteos: {
      bodega:                     listaBodega.length,
      sin_asesor:                 listaSinAsesor.length,
      cod_asesor_no_3digits:      listaCodNo3Digits.length,
      asesor_sin_ventas_base:     listaSinCodsValidos.length,
      duplicados:                 duplicados.length,
      asesores_en_base:           codsValidos.size,
    },
    detalle: {
      bodega:               listaBodega,
      sin_asesor:           listaSinAsesor,
      cod_no_3digits:       listaCodNo3Digits,
      sin_codsValidos:      listaSinCodsValidos,
      duplicados:           duplicados,
    },
  };
}

// Diagnóstico de solo lectura — distribución GLOBAL (todos los vendedores) de
// los strings crudos de "negocio" (r[8]) que normalizan a Cárnico/Café, para
// detectar fragmentación (variantes de texto que deberían ser un solo negocio
// pero generan filas separadas en COBERTURA_NEGOCIO). No cambia nada.
// Uso: /api/datos?sheet=diagnostico_negocio_variantes
function getDiagnosticoNegocioVariantes_() {
  const hB = getSheet_(HOJAS.BASE);
  if (!hB) return { ok: false, error: 'Falta BASE_ACUMULADA' };
  const baseData = hB.getDataRange().getValues().slice(1);
  let periodoCalc = '';
  baseData.forEach(r => {
    const v = r[18];
    const p = v instanceof Date
      ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}`
      : String(v || '').substring(0, 7);
    if (p > periodoCalc) periodoCalc = p;
  });

  const variantesPorNegocio = {}; // negocioNormalizado -> { rawString -> {filas, venta, vendedores:Set} }
  baseData.forEach(r => {
    const v = r[18];
    const p = v instanceof Date
      ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}`
      : String(v || '').substring(0, 7);
    if (p !== periodoCalc) return;
    if (!esFilaBaseValida_(r)) return;
    const negRaw = String(r[8] || '').trim();
    const neg = normNegMiG_(negRaw);
    if (neg !== 'Cárnico' && neg !== 'Café') return;
    const cod = obtenerCodAsesor_(r[3]);
    if (!variantesPorNegocio[neg]) variantesPorNegocio[neg] = {};
    if (!variantesPorNegocio[neg][negRaw]) {
      variantesPorNegocio[neg][negRaw] = { filas: 0, venta: 0, vendedores: new Set() };
    }
    const x = variantesPorNegocio[neg][negRaw];
    x.filas++;
    x.venta += parseFloat(r[14]) || 0;
    if (cod) x.vendedores.add(cod);
  });

  const resultado = {};
  Object.entries(variantesPorNegocio).forEach(([neg, variantes]) => {
    resultado[neg] = Object.entries(variantes).map(([raw, x]) => ({
      negocio_raw: raw, filas: x.filas, venta: round2_(x.venta), vendedores: [...x.vendedores].sort(),
    }));
  });

  return {
    ok: true,
    periodo: periodoCalc,
    variantes_por_negocio: resultado,
    fragmentado: Object.entries(resultado).filter(([, v]) => v.length > 1).map(([k]) => k),
  };
}

// Diagnóstico de solo lectura — cruza el catálogo PRODUCTOS_CLAVE (negocio
// oficial por SKU) contra el negocio realmente registrado en BASE_ACUMULADA
// para ese mismo SKU, para detectar SKUs de Cárnico/Café mal clasificados
// (o viceversa). No cambia nada.
// Uso: /api/datos?sheet=diagnostico_sku_negocio
function getDiagnosticoSkuNegocio_() {
  const hB = getSheet_(HOJAS.BASE);
  if (!hB) return { ok: false, error: 'Falta BASE_ACUMULADA' };
  const catalogo = cargarProductosClave_().todos; // { sap, nombre, negocio, ... }
  const negocioOficialPorSap = {};
  catalogo.forEach(p => {
    if (p.sap && p.negocio) negocioOficialPorSap[p.sap] = normNegMiG_(p.negocio);
  });

  const baseData = hB.getDataRange().getValues().slice(1);
  let periodoCalc = '';
  baseData.forEach(r => {
    const v = r[18];
    const p = v instanceof Date
      ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}`
      : String(v || '').substring(0, 7);
    if (p > periodoCalc) periodoCalc = p;
  });

  const discrepancias = {}; // sap -> { nombre, negocio_oficial, negocio_base_acumulada:Set, filas, venta }
  baseData.forEach(r => {
    const v = r[18];
    const p = v instanceof Date
      ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}`
      : String(v || '').substring(0, 7);
    if (p !== periodoCalc) return;
    if (!esFilaBaseValida_(r)) return;
    const sap = limpiarSap_(r[6]);
    const negOficial = negocioOficialPorSap[sap];
    if (!negOficial) return; // SKU no está en el catálogo PRODUCTOS_CLAVE — no se puede comparar
    const negBase = normNegMiG_(String(r[8] || '').trim());
    if (negBase === negOficial) return; // coincide, no es discrepancia
    if (negOficial !== 'Cárnico' && negOficial !== 'Café' && negBase !== 'Cárnico' && negBase !== 'Café') return;

    if (!discrepancias[sap]) {
      discrepancias[sap] = {
        sap, nombre: String(r[7] || '').trim(), negocio_oficial_catalogo: negOficial,
        negocio_en_base_acumulada: new Set(), filas: 0, venta: 0,
      };
    }
    const d = discrepancias[sap];
    d.negocio_en_base_acumulada.add(negBase);
    d.filas++;
    d.venta += parseFloat(r[14]) || 0;
  });

  const lista = Object.values(discrepancias).map(d => ({
    sap: d.sap, nombre: d.nombre,
    negocio_oficial_catalogo: d.negocio_oficial_catalogo,
    negocio_en_base_acumulada: [...d.negocio_en_base_acumulada],
    filas: d.filas, venta: round2_(d.venta),
  })).sort((a, b) => b.venta - a.venta);

  return { ok: true, periodo: periodoCalc, total_skus_discrepantes: lista.length, discrepancias: lista };
}

// Diagnóstico de solo lectura — concentración por fecha de la venta en
// Cárnico/Café para un vendedor, para detectar si la venta "faltante" se
// concentra en días/semanas específicos (indicio de corte de carga distinto
// al del sistema oficial). No cambia nada.
// Uso: /api/datos?sheet=diagnostico_concentracion_fecha&cod_asesor=208
function getDiagnosticoConcentracionFecha_(codAsesorParam) {
  const cod = codAsesorParam ? obtenerCodAsesor_(String(codAsesorParam)) : '';
  if (!cod) return { ok: false, error: 'Falta parámetro cod_asesor' };
  const hB = getSheet_(HOJAS.BASE);
  if (!hB) return { ok: false, error: 'Falta BASE_ACUMULADA' };

  const baseData = hB.getDataRange().getValues().slice(1);
  let periodoCalc = '';
  baseData.forEach(r => {
    const v = r[18];
    const p = v instanceof Date
      ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}`
      : String(v || '').substring(0, 7);
    if (p > periodoCalc) periodoCalc = p;
  });

  const porFecha = {}; // negocio -> fecha(yyyy-MM-dd de fecha_carga) -> {filas, venta, semana}
  baseData.forEach(r => {
    const v = r[18];
    const p = v instanceof Date
      ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}`
      : String(v || '').substring(0, 7);
    if (p !== periodoCalc) return;
    if (!esFilaBaseValida_(r)) return;
    if (obtenerCodAsesor_(r[3]) !== cod) return;
    const neg = normNegMiG_(String(r[8] || '').trim());
    if (neg !== 'Cárnico' && neg !== 'Café') return;
    const fc = r[0];
    const fecha = fc instanceof Date ? Utilities.formatDate(fc, TZ, 'yyyy-MM-dd') : String(fc || '').trim();
    const semana = r[15];

    if (!porFecha[neg]) porFecha[neg] = {};
    if (!porFecha[neg][fecha]) porFecha[neg][fecha] = { filas: 0, venta: 0, semana };
    porFecha[neg][fecha].filas++;
    porFecha[neg][fecha].venta += parseFloat(r[14]) || 0;
  });

  const resultado = {};
  Object.entries(porFecha).forEach(([neg, fechas]) => {
    resultado[neg] = Object.entries(fechas)
      .map(([fecha, x]) => ({ fecha, semana: x.semana, filas: x.filas, venta: round2_(x.venta) }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  });

  return { ok: true, cod_asesor: cod, periodo: periodoCalc, fechas_carga_por_negocio: resultado };
}

// ════════════════════════════════════════════════════════════════════
// Detalle exportable de solo lectura — para cruzar manualmente contra el
// sistema oficial cliente por cliente / SKU por SKU. No cambia lógica, no
// recalcula COBERTURA_NEGOCIO, no escribe nada. Usa la MISMA regla oficial
// (cant_neta > 0) y el MISMO fallback de negocio por SKU (PRODUCTOS_CLAVE)
// ya aplicados en calcularCoberturaNegocio().
// Uso: /api/datos?sheet=detalle_cobertura_negocio&cod_asesor=208&negocio=Cárnico
// ════════════════════════════════════════════════════════════════════
function getDetalleCoberturaNegocio_(codAsesorParam, negocioParam) {
  const cod = codAsesorParam ? obtenerCodAsesor_(String(codAsesorParam)) : '';
  if (!cod) return { ok: false, error: 'Falta parámetro cod_asesor' };
  // Acepta cualquier negocio reconocido por normNegMiG_ (Cárnico, Café, Galletas,
  // Chocolates, etc.) — no se restringe a un par fijo para poder ampliar la
  // auditoría a otros negocios sin tocar esta función de nuevo.
  const negocioObjetivo = normNegMiG_(String(negocioParam || '').trim());
  if (!negocioObjetivo) {
    return { ok: false, error: 'Falta o es inválido el parámetro negocio' };
  }

  const hB = getSheet_(HOJAS.BASE);
  const hM = getSheet_(HOJAS.MAESTRO_CLIENTES);
  if (!hB || !hM) return { ok: false, error: 'Faltan hojas BASE_ACUMULADA o MAESTRO_CLIENTES' };

  // Universo (maestroSet) idéntico al de calcularCoberturaNegocio(): estado='A' + dedup.
  const maestroSet = new Set();
  const nombreClienteMaestro = {};
  let nombreVendedor = '';
  hM.getDataRange().getValues().slice(1).forEach(r => {
    const asesorRaw = String(r[20] || '').trim();
    const codV = obtenerCodAsesor_(asesorRaw);
    if (codV !== cod) return;
    if (!nombreVendedor && asesorRaw) nombreVendedor = asesorRaw;
    if (String(r[19] || '').trim().toUpperCase() !== 'A') return;
    const cli = normalizarCodigoCliente_(r[0]);
    if (!cli) return;
    maestroSet.add(cli);
    if (!nombreClienteMaestro[cli]) nombreClienteMaestro[cli] = String(r[1] || '').trim();
  });

  const baseData = hB.getDataRange().getValues().slice(1);
  let periodoCalc = '';
  let corte = '';
  baseData.forEach(r => {
    const v = r[18];
    const p = v instanceof Date
      ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}`
      : String(v || '').substring(0, 7);
    if (p > periodoCalc) periodoCalc = p;
    const fc = r[0];
    const fechaCarga = fc instanceof Date ? Utilities.formatDate(fc, TZ, 'yyyy-MM-dd') : String(fc || '').trim();
    if (fechaCarga > corte) corte = fechaCarga;
  });

  const ctxNegocio = construirContextoNegocioFallback_(baseData, periodoCalc);

  const detalleFilas   = [];
  const clientesMap    = {}; // cod_cliente -> {cliente, cant_neta_total, valor_venta_total, skus:Set, tieneCantPositiva:bool}
  const skusMap        = {}; // cod_sku -> {producto, cant_neta_total, valor_venta_total, clientesImpactados:Set}
  let ventaResumenTotal = 0;

  baseData.forEach(r => {
    const v = r[18];
    const p = v instanceof Date
      ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}`
      : String(v || '').substring(0, 7);
    if (p !== periodoCalc) return;
    if (!esFilaBaseValida_(r)) return;
    const codV = obtenerCodAsesor_(r[3]);
    if (codV !== cod) return;

    const negOriginal = String(r[8] || '').trim();
    const negFinalRaw = resolverNegocioFinal_(r[8], r[6], ctxNegocio);
    const negFinalNorm = normNegMiG_(negFinalRaw);
    if (negFinalNorm !== negocioObjetivo) return;

    const cli   = normalizarCodigoCliente_(r[1]);
    const sap   = limpiarSap_(r[6]);
    const cant  = parseFloat(r[13]) || 0;
    const venta = parseFloat(r[14]) || 0;
    const fc    = r[0];
    const fechaCarga = fc instanceof Date ? Utilities.formatDate(fc, TZ, 'yyyy-MM-dd') : String(fc || '').trim();

    ventaResumenTotal += venta;

    detalleFilas.push({
      cod_asesor: cod,
      vendedor: nombreVendedor,
      negocio: negocioObjetivo,
      cod_cliente: cli,
      cliente: nombreClienteMaestro[cli] || String(r[2] || '').trim(),
      cod_sku: sap,
      producto: String(r[7] || '').trim(),
      cant_neta: cant,
      valor_venta: round2_(venta),
      negocio_original_base: negOriginal,
      negocio_final_con_fallback: negFinalRaw,
      fecha_carga: fechaCarga,
    });

    if (cli) {
      if (!clientesMap[cli]) {
        clientesMap[cli] = {
          cod_cliente: cli,
          cliente: nombreClienteMaestro[cli] || String(r[2] || '').trim(),
          negocio_final: negocioObjetivo,
          cant_neta_total: 0,
          valor_venta_total: 0,
          skus: new Set(),
          tieneCantPositiva: false,
        };
      }
      const c = clientesMap[cli];
      c.cant_neta_total += cant;
      c.valor_venta_total += venta;
      if (sap) c.skus.add(sap);
      if (cant > 0) c.tieneCantPositiva = true;
    }

    if (sap) {
      if (!skusMap[sap]) {
        skusMap[sap] = {
          cod_sku: sap,
          producto: String(r[7] || '').trim(),
          negocio_final: negocioObjetivo,
          cant_neta_total: 0,
          valor_venta_total: 0,
          clientesImpactados: new Set(),
        };
      }
      const s = skusMap[sap];
      s.cant_neta_total += cant;
      s.valor_venta_total += venta;
      if (cant > 0 && cli && maestroSet.has(cli)) s.clientesImpactados.add(cli);
    }
  });

  const detalleClientes = Object.values(clientesMap).map(c => ({
    cod_cliente: c.cod_cliente,
    cliente: c.cliente,
    negocio_final: c.negocio_final,
    cant_neta_total: round2_(c.cant_neta_total),
    valor_venta_total: round2_(c.valor_venta_total),
    skus_comprados: c.skus.size,
    en_universo_maestro: maestroSet.has(c.cod_cliente),
    impactado: maestroSet.has(c.cod_cliente) && c.tieneCantPositiva,
  })).sort((a, b) => b.valor_venta_total - a.valor_venta_total);

  const detalleSkus = Object.values(skusMap).map(s => ({
    cod_sku: s.cod_sku,
    producto: s.producto,
    negocio_final: s.negocio_final,
    cant_neta_total: round2_(s.cant_neta_total),
    valor_venta_total: round2_(s.valor_venta_total),
    clientes_impactados: s.clientesImpactados.size,
  })).sort((a, b) => b.valor_venta_total - a.valor_venta_total);

  const impactadosTotal = detalleClientes.filter(c => c.impactado).length;

  return {
    ok: true,
    cod_asesor: cod,
    vendedor: nombreVendedor,
    negocio: negocioObjetivo,
    periodo: periodoCalc,
    corte,
    resumen: {
      universo: maestroSet.size,
      impactados: impactadosTotal,
      venta: round2_(ventaResumenTotal),
    },
    detalle_clientes: detalleClientes,
    detalle_skus: detalleSkus,
    detalle_filas: detalleFilas,
  };
}

// Diagnóstico: muestra qué ve el script en CUOTAS y cómo cruza con vendedores
function getCuotaDebug_() {
  const h = getSheet_(HOJAS.CUOTAS);
  const rawRows = [];
  if (h && h.getLastRow() > 1) {
    const vals = h.getDataRange().getValues();
    for (let i = 1; i < Math.min(vals.length, 20); i++) {
      const asesorRaw   = String(vals[i][0] || '').trim();
      const cuotaRaw    = vals[i][1];
      const cuotaParsed = parseFloat(String(cuotaRaw || '0').replace(/[$,]/g, '')) || 0;
      rawRows.push({
        fila:         i + 1,
        asesor_raw:   asesorRaw,
        cod_extraido: obtenerCodAsesor_(asesorRaw),
        cuota_raw:    cuotaRaw,
        tipo_raw:     typeof cuotaRaw,
        cuota_parsed: cuotaParsed,
      });
    }
  }

  const cuotaMap = getCuotasMap_();

  const mesData = getBasePeriodoActual_();
  const vendCods = {};
  mesData.forEach(r => {
    const cod = obtenerCodAsesor_(r[3]);
    if (cod && !vendCods[cod]) {
      vendCods[cod] = { cod, r3_raw: String(r[3]).trim(), cuota_en_mapa: cuotaMap[cod] || 0 };
    }
  });

  return {
    hoja_encontrada: !!h,
    nombre_buscado:  HOJAS.CUOTAS,
    filas_en_hoja:   h ? h.getLastRow() - 1 : 0,
    cuota_map:       cuotaMap,
    raw_rows:        rawRows,
    vendedores_cods: Object.values(vendCods).slice(0, 15),
  };
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
  var periodoActual = getPeriodoActualDesdeBase_();
  var raw           = getDevolucionesPeriodoRaw_(periodoActual);

  // ── Fallback de período: si no hay datos para el período de BASE, buscar el más reciente
  // en DEVOLUCIONES. Esto evita que la vista quede en $0 cuando la hoja de devoluciones
  // lleva un rezago o usa una fecha diferente a la de BASE.
  if (!raw.length) {
    var todosRaw = getDevolucionesPeriodoRaw_('');   // sin filtro de período
    if (todosRaw.length) {
      // raw ya son objetos nombrados; usar .periodo_filtro directamente
      var maxPeriodo = todosRaw.reduce(function(max, r) {
        var p = r.periodo_filtro;
        return p > max ? p : max;
      }, '');
      if (maxPeriodo) {
        raw = todosRaw.filter(function(r) {
          return r.periodo_filtro === maxPeriodo;
        });
        Logger.log('[getDevoluciones] periodoActual BASE=' + periodoActual +
          ' → sin datos en DEVOLUCIONES; usando período más reciente: ' + maxPeriodo);
        periodoActual = maxPeriodo;
      }
    }
  }
  Logger.log('[getDevoluciones] periodo=' + periodoActual + '  raw.length=' + raw.length);

  var conceptoMap     = {};
  var vendedorMap     = {};
  var vendConceptoMap = {};
  var detalle         = [];
  var totalDevoluciones = 0;
  var totalAverias      = 0;

  raw.forEach(function(r) {
    // raw ya son objetos nombrados — sin índices fijos
    var periodoMes  = fechaISO_(r.periodo_mes);
    var cod         = r.cod_asesor;
    var vendedor    = r.nom_vendedor;
    var codCliente  = r.cod_cliente;
    var nomCliente  = r.nom_cliente;
    var factura     = String(r.factura  || '').trim();
    var codSku      = String(r.cod_sku  || '').trim();
    var nomProducto = String(r.nom_producto || '').trim();
    var cantidad    = r.cantidad    || 0;
    var costoUnit   = r.costo_unit  || 0;
    var monto       = r.vlr_devol;   // ya es Math.abs + parseMoney_
    var concepto    = r.concepto || 'Sin concepto';
    var tipoProducto= r.tipo_producto || '';

    // Saltar solo si no hay NINGÚN identificador de vendedor (cod Y nombre ambos vacíos).
    if (!vendedor && !cod) return;
    if (!monto) return;

    // Separar averías de devoluciones puras (usa clasificación oficial del sistema)
    if (r.es_averia) totalAverias      += monto;
    else             totalDevoluciones += monto;

    // Si cod está vacío, usar solo el nombre del vendedor como clave de agrupación
    var nombreFinal = cod ? (cod + ' - ' + vendedor) : vendedor;
    conceptoMap[concepto]     = (conceptoMap[concepto]     || 0) + monto;
    vendedorMap[nombreFinal]  = (vendedorMap[nombreFinal]  || 0) + monto;

    // Desglose concepto × vendedor (para filtros del dashboard)
    if (!vendConceptoMap[nombreFinal]) vendConceptoMap[nombreFinal] = {};
    vendConceptoMap[nombreFinal][concepto] = (vendConceptoMap[nombreFinal][concepto] || 0) + monto;

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

  var total = detalle.reduce(function(s, r) { return s + (parseFloat(r.vlr_devolucion) || 0); }, 0);
  Logger.log('[getDevoluciones] detalle.length=' + detalle.length + '  total=' + round2_(total) +
    '  devoluciones=' + round2_(totalDevoluciones) + '  averias=' + round2_(totalAverias));

  // Top 10 clientes con más devoluciones por vendedor
  var cliVendMap = {};
  raw.forEach(function(r) {
    var cod    = r.cod_asesor;
    var vend   = r.nom_vendedor;
    var codCli = r.cod_cliente;
    var nomCli = r.nom_cliente;
    var monto  = r.vlr_devol;
    // Necesitamos al menos un identificador de vendedor y un cliente para registrar el top
    if (!vend || !codCli || !monto) return;
    // Clave: cod si está disponible, sino nombre del vendedor
    var claveVend = cod || vend;
    if (!cliVendMap[claveVend]) cliVendMap[claveVend] = { cod_asesor: cod, clave: claveVend };
    if (!cliVendMap[claveVend][codCli])
      cliVendMap[claveVend][codCli] = { cod_cliente: codCli, nom_cliente: nomCli, total: 0 };
    cliVendMap[claveVend][codCli].total += monto;
  });
  var por_cliente_por_vendedor = Object.keys(cliVendMap).map(function(claveVend) {
    var entry = cliVendMap[claveVend];
    var clientes = Object.keys(entry)
      .filter(function(k) { return k !== 'cod_asesor' && k !== 'clave'; })
      .map(function(k) { return entry[k]; })
      .sort(function(a, b) { return b.total - a.total; })
      .slice(0, 10)
      .map(function(c) { return { cod_cliente: c.cod_cliente, nom_cliente: c.nom_cliente, total: round2_(c.total) }; });
    return { cod_asesor: entry.cod_asesor || claveVend, top10: clientes };
  });

  const por_concepto_por_vendedor = Object.entries(vendConceptoMap).map(function([vendedor, conceptos]) {
    return {
      vendedor,
      por_concepto: Object.entries(conceptos)
        .map(([concepto, monto]) => ({ concepto, monto: round2_(monto) }))
        .sort((a, b) => b.monto - a.monto)
    };
  });

  return {
    total:               round2_(total),
    total_devoluciones:  round2_(totalDevoluciones),
    total_averias:       round2_(totalAverias),
    por_concepto: Object.entries(conceptoMap)
      .map(([concepto, monto]) => ({ concepto, monto: round2_(monto) }))
      .sort((a, b) => b.monto - a.monto),
    por_vendedor: Object.entries(vendedorMap)
      .map(([vendedor, monto]) => ({ vendedor, monto: round2_(monto) }))
      .sort((a, b) => b.monto - a.monto),
    por_concepto_por_vendedor,
    por_cliente_por_vendedor,
    detalle: detalle
      .sort((a, b) => b.vlr_devolucion - a.vlr_devolucion)
      .slice(0, 500)
  };
}

// ════════════════════════════════════════════════════════════════════
// VENTA POR NECESIDAD DE CLIENTE (col AD de MAESTRO_CLIENTES)
// ════════════════════════════════════════════════════════════════════
function getNecesidadCliente() {
  // 1. Leer MAESTRO_CLIENTES: construir mapa cod_cliente → necesidad (col AD = índice 29)
  const hM = getSheet_(HOJAS.MAESTRO_CLIENTES);
  const necesidadMap = {};  // cod_cliente → necesidad
  if (hM && hM.getLastRow() > 1) {
    hM.getDataRange().getValues().slice(1).forEach(function(r) {
      const estado = String(r[19] || '').trim().toUpperCase();
      if (estado !== 'A') return;
      const codCli   = String(r[0] || '').trim();
      const necesidad = String(r[29] || '').trim();  // col AD
      if (codCli && necesidad) necesidadMap[codCli] = necesidad;
    });
  }

  // 2. Leer BASE_ACUMULADA del período actual
  const base = getBasePeriodoActual_();

  // 3. Cruzar ventas con necesidad del cliente
  const necesidadVentaMap = {};  // necesidad → { total, clientes: Set, por_negocio: {} }
  const sinNecesidad = { total: 0, clientes: new Set(), por_negocio: {} };

  base.forEach(function(r) {
    const codCli  = normalizarCodigoCliente_(r[1]);
    const negocio = String(r[8]  || '').trim();
    const venta   = parseFloat(r[14]) || 0;
    if (venta <= 0 || !codCli) return;

    const nec = necesidadMap[codCli];
    const bucket = nec ? (necesidadVentaMap[nec] = necesidadVentaMap[nec] ||
      { necesidad: nec, total: 0, clientes: new Set(), por_negocio: {} }) : sinNecesidad;

    bucket.total += venta;
    bucket.clientes.add(codCli);
    bucket.por_negocio[negocio] = (bucket.por_negocio[negocio] || 0) + venta;
  });

  // 4. Serializar resultado
  const serializar = function(bucket) {
    return {
      necesidad:  bucket.necesidad || 'Sin clasificar',
      total:      round2_(bucket.total),
      clientes:   bucket.clientes.size,
      por_negocio: Object.entries(bucket.por_negocio)
        .map(([negocio, monto]) => ({ negocio, monto: round2_(monto) }))
        .sort((a, b) => b.monto - a.monto)
    };
  };

  const resultado = Object.values(necesidadVentaMap)
    .map(serializar)
    .sort((a, b) => b.total - a.total);

  if (sinNecesidad.total > 0) {
    resultado.push(serializar(sinNecesidad));
  }

  return {
    total: round2_(resultado.reduce((s, r) => s + r.total, 0)),
    total_clasificados: Object.keys(necesidadMap).length,
    por_necesidad: resultado
  };
}

// ════════════════════════════════════════════════════════════════════
// CLIENTES CERO
// ════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════
// CLIENTES CERO DESDE FRECUENCIA ECOM
// ════════════════════════════════════════════════════════════════════
// Pega el reporte "Frecuencia" de ECOM en la pestaña FRECUENCIA_ECOM
// (mismas columnas del Excel: Empresa, Cod Usuario, Usuario, Cod. cliente,
//  Cliente, Direccion, Telefono, Total Venta, Total Devolucion, Barrio,
//  Ciudad, Nom Establecimiento)
// Luego ejecuta este script desde el menú PALMA → 4b.

function procesarFrecuenciaECOM() {
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const ui  = SpreadsheetApp.getUi();
  const hF  = ss.getSheetByName('FRECUENCIA_ECOM');
  if (!hF) {
    ui.alert('ERROR', 'No existe la pestaña FRECUENCIA_ECOM.\nCreala y pega el reporte de ECOM con sus encabezados originales.', ui.ButtonSet.OK);
    return;
  }
  if (hF.getLastRow() < 2) {
    ui.alert('ERROR', 'La pestaña FRECUENCIA_ECOM está vacía.', ui.ButtonSet.OK);
    return;
  }

  // ── 1. Leer encabezados y datos de FRECUENCIA_ECOM ────────────────
  const raw     = hF.getDataRange().getValues();
  const headers = raw[0].map(h => String(h || '').trim().toLowerCase());

  // Índices de columnas del reporte ECOM
  const iCodUsr  = headers.indexOf('cod usuario');
  const iUsr     = headers.indexOf('usuario');
  const iCodCli  = headers.indexOf('cod. cliente');
  const iCliente = headers.indexOf('cliente');
  const iDir     = headers.indexOf('direccion');
  const iBarrio  = headers.indexOf('barrio');
  const iCiudad  = headers.indexOf('ciudad');
  const iEstab   = headers.indexOf('nom establecimiento');

  if ([iCodUsr, iUsr, iCodCli, iCliente].some(i => i === -1)) {
    ui.alert('ERROR', 'No se encontraron las columnas esperadas.\nVerifica que los encabezados coincidan con el reporte de ECOM.', ui.ButtonSet.OK);
    return;
  }

  // ── 2. Construir mapa cod_asesor → nom_vendedor desde BASE_ACUMULADA ─
  const hB       = ss.getSheetByName('BASE_ACUMULADA');
  const vendNomMap = {};   // '201' → 'ANAYS FUENTES'
  if (hB && hB.getLastRow() > 1) {
    hB.getDataRange().getValues().slice(1).forEach(r => {
      const asesor  = String(r[3] || '').trim();
      const nombre  = String(r[4] || '').trim();  // columna vendedor
      const cod     = obtenerCodAsesor_(asesor);
      if (cod && nombre && !vendNomMap[cod]) vendNomMap[cod] = nombre;
    });
  }

  // ── 3. Obtener período actual ──────────────────────────────────────
  const periodoActual = getPeriodoActualDesdeBase_() || '';

  // ── 4. Procesar filas ECOM ─────────────────────────────────────────
  const rows = [];
  for (let i = 1; i < raw.length; i++) {
    const r       = raw[i];
    const empresa = String(r[0] || '').trim();
    // Saltar fila TOTAL y filas sin empresa válida
    if (empresa.toUpperCase() === 'TOTAL') continue;

    const codUsuario = String(r[iCodUsr] || '').trim().replace(/\.0$/, '');
    const usuario    = String(r[iUsr]    || '').trim();
    const codCli     = String(r[iCodCli] || '').trim();
    const cliente    = String(r[iCliente]|| '').trim();

    if (!codUsuario || !codCli || !cliente) continue;

    // Nombre de vendedor: preferir el de BASE_ACUMULADA, si no usar ECOM
    const nomVend = vendNomMap[codUsuario] || usuario;

    const dir    = iDir    >= 0 ? String(r[iDir]    || '').trim() : '';
    const barrio = iBarrio >= 0 ? String(r[iBarrio] || '').trim() : '';
    const ciudad = iCiudad >= 0 ? String(r[iCiudad] || '').trim() : '';
    const estab  = iEstab  >= 0 ? String(r[iEstab]  || '').trim() : '';

    rows.push([nomVend, codCli, cliente, estab || cliente, dir, barrio, ciudad, '', periodoActual]);
  }

  if (!rows.length) {
    ui.alert('Sin datos', 'No se encontraron clientes cero en FRECUENCIA_ECOM.', ui.ButtonSet.OK);
    return;
  }

  // ── 5. Escribir CLIENTES_CERO ──────────────────────────────────────
  let hCC = ss.getSheetByName('CLIENTES_CERO');
  if (!hCC) hCC = ss.insertSheet('CLIENTES_CERO');
  else hCC.clearContents();

  const cabecera = [['Vendedor','Cod Cliente','Cliente','Razon Social','Direccion','Barrio','Ciudad','Fecha Creacion','Período']];
  hCC.getRange(1, 1, 1, 9).setValues(cabecera)
     .setBackground('#DC2626').setFontColor('#FFFFFF').setFontWeight('bold');

  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  hCC.getRange(2, 1, rows.length, 9).setValues(rows);

  // Resumen por vendedor para el toast
  const resumen = {};
  rows.forEach(r => { resumen[r[0]] = (resumen[r[0]] || 0) + 1; });
  const msg = Object.entries(resumen).sort((a,b) => b[1]-a[1]).map(([v,n]) => `${v}: ${n}`).join('\n');
  ui.alert('✅ Clientes Cero desde ECOM', `Total: ${rows.length} clientes sin compra\n\n${msg}`, ui.ButtonSet.OK);
}

function getClientesCero() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // ── Leer directo desde FRECUENCIA_ECOM si existe y tiene datos ──────
  const hF = ss.getSheetByName('FRECUENCIA_ECOM');
  if (hF && hF.getLastRow() > 1) {
    const raw     = hF.getDataRange().getValues();
    const headers = raw[0].map(h => String(h || '').trim().toLowerCase());

    const iCodUsr  = headers.indexOf('cod usuario');
    const iUsr     = headers.indexOf('usuario');
    const iCodCli  = headers.indexOf('cod. cliente');
    const iCliente = headers.indexOf('cliente');
    const iDir     = headers.indexOf('direccion');
    const iBarrio  = headers.indexOf('barrio');
    const iCiudad  = headers.indexOf('ciudad');
    const iEstab   = headers.indexOf('nom establecimiento');

    // Si las columnas del reporte ECOM están presentes, procesamos en vivo
    if (![iCodUsr, iUsr, iCodCli, iCliente].some(i => i === -1)) {
      // Mapa cod_asesor → nom_vendedor desde BASE_ACUMULADA
      const hB = ss.getSheetByName('BASE_ACUMULADA');
      const vendNomMap = {};
      if (hB && hB.getLastRow() > 1) {
        hB.getDataRange().getValues().slice(1).forEach(function(r) {
          const cod    = obtenerCodAsesor_(String(r[3] || '').trim());
          const nombre = String(r[4] || '').trim();
          if (cod && nombre && !vendNomMap[cod]) vendNomMap[cod] = nombre;
        });
      }

      const detalle     = [];
      const porVendedor = {};

      for (var i = 1; i < raw.length; i++) {
        var r       = raw[i];
        var empresa = String(r[0] || '').trim();
        if (empresa.toUpperCase() === 'TOTAL') continue;

        var codUsr  = String(r[iCodUsr] || '').trim().replace(/\.0$/, '');
        var usuario = String(r[iUsr]    || '').trim();
        var codCli  = String(r[iCodCli] || '').trim();
        var cliente = String(r[iCliente]|| '').trim();

        if (!codUsr || !codCli || !cliente) continue;

        var nomVend = vendNomMap[codUsr] || usuario;
        if (!esVendedorValido_(codUsr, nomVend)) continue;

        var dir    = iDir    >= 0 ? String(r[iDir]    || '').trim() : '';
        var barrio = iBarrio >= 0 ? String(r[iBarrio] || '').trim() : '';
        var ciudad = iCiudad >= 0 ? String(r[iCiudad] || '').trim() : '';
        var estab  = iEstab  >= 0 ? String(r[iEstab]  || '').trim() : '';

        // Agrupar por cod para evitar discrepancias por diferencias en nombre
        if (!porVendedor[codUsr]) porVendedor[codUsr] = { cod: codUsr, vendedor: nomVend, cantidad: 0 };
        porVendedor[codUsr].cantidad++;
        detalle.push({
          cod_vendedor: codUsr,
          vendedor:     nomVend,
          cod_cliente:  codCli,
          cliente:      cliente,
          razon_social: estab || cliente,
          direccion:    dir,
          barrio:       barrio,
          ciudad:       ciudad
        });
      }

      return {
        total: detalle.length,
        por_vendedor: Object.values(porVendedor)
          .sort(function(a, b) { return b.cantidad - a.cantidad; }),
        detalle: detalle
      };
    }
  }

  // ── Fallback: leer desde hoja CLIENTES_CERO (procesada manualmente) ─
  const fallback = sheetToJSON(HOJAS.CLIENTES_CERO)
    .filter(function(r) {
      var v   = String(r.vendedor || '').trim();
      var cod = obtenerCodAsesor_(v);
      return esVendedorValido_(cod, v);
    });

  const porVendedor = {};
  fallback.forEach(function(r) {
    var v   = String(r.vendedor || '').trim();
    var cod = obtenerCodAsesor_(v);
    if (!v) return;
    if (!porVendedor[cod]) porVendedor[cod] = { cod: cod, vendedor: v, cantidad: 0 };
    porVendedor[cod].cantidad++;
  });

  return {
    total: fallback.length,
    por_vendedor: Object.values(porVendedor)
      .sort(function(a, b) { return b.cantidad - a.cantidad; }),
    detalle: fallback
  };
}

// ════════════════════════════════════════════════════════════════════
// CLIENTES NUEVOS
// ════════════════════════════════════════════════════════════════════

/**
 * Convierte cualquier valor de fecha de Google Sheets a string 'YYYY-MM-DD'.
 * Maneja:
 *   1. Objeto Date real (celda fecha de Sheets) → Utilities.formatDate con TZ Panama
 *   2. Número (serial de fecha de Sheets, poco común vía getValues) → idem
 *   3. Texto 'M/D/YYYY' o 'MM/DD/YYYY' (formato Mes/Día/Año)  ← caso actual del usuario
 *   4. Texto 'YYYY-MM-DD' (ISO) → ya correcto
 *   5. Cualquier otro texto parseable por Date() → fallback
 * Devuelve '' si no se puede parsear.
 */
function parseFechaCreacion_(valor) {
  // 1. Objeto Date real de Google Sheets
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return Utilities.formatDate(valor, TZ, 'yyyy-MM-dd');
  }

  const s = String(valor || '').trim();
  if (!s) return '';

  // 2. Ya en formato ISO YYYY-MM-DD (o YYYY-MM-DDThh:mm:ss...)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10); // retorna solo la parte fecha
  }

  // 3. Formato MM/DD/YYYY o M/D/YYYY (Mes/Día/Año — American)
  //    Ejemplo: '5/15/2026' → '2026-05-15'
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const mm = mdy[1].padStart(2, '0');
    const dd = mdy[2].padStart(2, '0');
    const yyyy = mdy[3];
    // Validar que sea una fecha real
    const prueba = new Date(yyyy + '-' + mm + '-' + dd);
    if (!isNaN(prueba.getTime())) return yyyy + '-' + mm + '-' + dd;
  }

  // 4. Número de serie (días desde 30-dic-1899, base de Excel/Sheets)
  //    Sheets raramente devuelve números puros para fechas, pero cubrimos el caso
  const num = parseFloat(s);
  if (!isNaN(num) && num > 1 && num < 100000) {
    const epoch = new Date(Date.UTC(1899, 11, 30) + num * 86400000);
    if (!isNaN(epoch.getTime())) return Utilities.formatDate(epoch, TZ, 'yyyy-MM-dd');
  }

  // 5. Fallback: dejar que V8 intente parsear (cubre 'Jan 15, 2026', etc.)
  const d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, TZ, 'yyyy-MM-dd');

  return '';
}

function getClientesNuevos(desde, hasta) {
  const hM = getSheet_(HOJAS.MAESTRO_CLIENTES);
  if (!hM || hM.getLastRow() < 2) return { total:0, por_vendedor:[], por_mes:[], detalle:[], desde:desde||null, hasta:hasta||null };

  const data    = hM.getDataRange().getValues();
  const nuevos  = [];
  const porVend = {};
  const porMes  = {};

  // desde / hasta ya vienen como 'YYYY-MM-DD' — comparamos como strings para evitar
  // cualquier problema de timezone entre el script (UTC) y la hoja (America/Panama)
  const desdeStr = desde || '';
  const hastaStr = hasta || '';
  const hayFiltro = !!(desdeStr || hastaStr);

  for (let i = 1; i < data.length; i++) {
    const r      = data[i];
    const estado = String(r[19] || '').trim().toUpperCase();
    const asesor = String(r[20] || '').trim();
    const codA   = obtenerCodAsesor_(asesor);
    const fechaR = r[27]; // columna AB = fecha de creación

    if (estado !== 'A') continue;
    if (!esVendedorValido_(codA, asesor)) continue;

    // Convertir la celda a string YYYY-MM-DD
    const fechaStr = parseFechaCreacion_(fechaR);

    // Filtro por rango: comparación de strings YYYY-MM-DD (evita problemas de timezone)
    if (hayFiltro) {
      if (!fechaStr) continue;
      if (desdeStr && fechaStr < desdeStr) continue;
      if (hastaStr && fechaStr > hastaStr) continue;
    }
    // Sin filtro: incluir TODOS los clientes activos válidos aunque no tengan fecha en AB

    const mesStr = fechaStr ? fechaStr.slice(0, 7) : '';

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
      semMap[semana].clientes.add(normalizarCodigoCliente_(r[1]));
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
    skuMap[sku].clientes.add(normalizarCodigoCliente_(r[1]));

    if (!vendSkuMap[codAsesor])       vendSkuMap[codAsesor] = {};
    if (!vendSkuMap[codAsesor][sku])  vendSkuMap[codAsesor][sku] = { sku, nombre:nom, negocio:neg, venta:0, clientes:new Set() };
    vendSkuMap[codAsesor][sku].venta += valor;
    vendSkuMap[codAsesor][sku].clientes.add(normalizarCodigoCliente_(r[1]));
  });

  const global = Object.values(skuMap)
    .map(s => ({ sku:s.sku, nombre:s.nombre, negocio:s.negocio, marca:s.marca,
                 venta:round2_(s.venta), clientes:s.clientes.size, unidades:Math.round(s.unidades) }))
    .sort((a, b) => b.venta - a.venta)
    .slice(0, 150);  // aumentado para permitir filtro por negocio en frontend

  const por_vendedor = Object.entries(vendSkuMap).map(([cod, skus]) => ({
    cod,
    skus: Object.values(skus)
      .map(s => ({ sku:s.sku, nombre:s.nombre, negocio:s.negocio,
                   venta:round2_(s.venta), clientes:s.clientes.size,
                   unidades:Math.round(s.unidades || 0) }))
      .sort((a, b) => b.venta - a.venta)
      .slice(0, 15)
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
  const globalMap  = {};  // cod_cliente → { cod_cliente, nombre, venta, vendedores:{}, negocios:{} }
  const vendMap    = {};  // cod_asesor  → { cod_vendedor, nom_vendedor, clientes:{} }
  const negMap     = {};  // negocio     → { cod_cliente → { cod_cliente, nombre, venta, vendedores:{} } }
  const vendNegMap = {};  // cod_asesor  → { negocio → { cod_cliente → { cod_cliente, nombre, venta } } }

  mesData.forEach(function(r) {
    if (!esFilaBaseValida_(r)) return;
    const codCli  = normalizarCodigoCliente_(r[1]);
    const nomCli  = String(r[2]  || '').trim();
    const codAs   = obtenerCodAsesor_(String(r[3] || ''));
    const nomVend = String(r[4]  || '').trim();
    const negocio = String(r[8]  || '').trim();
    const valor   = parseFloat(r[14]) || 0;

    if (!codCli || !codAs) return;
    if (valor <= 0) return;

    // Acumulado global (con vendedor y negocio principal)
    if (!globalMap[codCli]) globalMap[codCli] = { cod_cliente: codCli, nombre: nomCli, venta: 0, vendedores: {}, negocios: {} };
    globalMap[codCli].venta += valor;
    globalMap[codCli].vendedores[nomVend] = (globalMap[codCli].vendedores[nomVend] || 0) + valor;
    if (negocio) globalMap[codCli].negocios[negocio] = (globalMap[codCli].negocios[negocio] || 0) + valor;

    // Acumulado por vendedor
    if (!vendMap[codAs]) vendMap[codAs] = { cod_vendedor: codAs, nom_vendedor: nomVend, clientes: {} };
    if (!vendMap[codAs].clientes[codCli])
      vendMap[codAs].clientes[codCli] = { cod_cliente: codCli, nombre: nomCli, venta: 0 };
    vendMap[codAs].clientes[codCli].venta += valor;

    // Acumulado por negocio (global)
    if (negocio) {
      if (!negMap[negocio]) negMap[negocio] = {};
      if (!negMap[negocio][codCli]) negMap[negocio][codCli] = { cod_cliente: codCli, nombre: nomCli, venta: 0, vendedores: {} };
      negMap[negocio][codCli].venta += valor;
      negMap[negocio][codCli].vendedores[nomVend] = (negMap[negocio][codCli].vendedores[nomVend] || 0) + valor;
    }

    // Acumulado por vendedor × negocio
    if (negocio) {
      if (!vendNegMap[codAs]) vendNegMap[codAs] = {};
      if (!vendNegMap[codAs][negocio]) vendNegMap[codAs][negocio] = {};
      if (!vendNegMap[codAs][negocio][codCli])
        vendNegMap[codAs][negocio][codCli] = { cod_cliente: codCli, nombre: nomCli, venta: 0 };
      vendNegMap[codAs][negocio][codCli].venta += valor;
    }
  });

  const top_global = Object.values(globalMap)
    .sort(function(a, b) { return b.venta - a.venta; })
    .slice(0, 20)
    .map(function(c, i) {
      // Vendedor principal = el que más le ha comprado al cliente
      var vendEntries = Object.entries(c.vendedores).sort(function(a, b) { return b[1] - a[1]; });
      var nom_vendedor = vendEntries.length ? vendEntries[0][0] : '';
      // Negocio principal = el negocio con mayor venta para este cliente
      var negEntries = Object.entries(c.negocios).sort(function(a, b) { return b[1] - a[1]; });
      var negocio_principal = negEntries.length ? negEntries[0][0] : '';
      return {
        ranking: i + 1,
        cod_cliente: c.cod_cliente,
        nombre: c.nombre,
        nom_vendedor: nom_vendedor,
        negocio_principal: negocio_principal,
        venta: round2_(c.venta)
      };
    });

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

  const top_por_negocio = Object.entries(negMap)
    .sort(function(a, b) { return a[0].localeCompare(b[0]); })
    .map(function(entry) {
      var neg = entry[0], clients = entry[1];
      return {
        negocio: neg,
        top10: Object.values(clients)
          .sort(function(a, b) { return b.venta - a.venta; })
          .slice(0, 10)
          .map(function(c, i) {
            var vendEntries = Object.entries(c.vendedores).sort(function(a, b) { return b[1] - a[1]; });
            var nom_vendedor = vendEntries.length ? vendEntries[0][0] : '';
            return { ranking: i + 1, cod_cliente: c.cod_cliente, nombre: c.nombre, nom_vendedor: nom_vendedor, venta: round2_(c.venta) };
          })
      };
    });

  const top_por_vendedor_negocio = Object.entries(vendNegMap).map(function(entry) {
    var cod = entry[0], negs = entry[1];
    return {
      cod_vendedor: cod,
      negocios: Object.entries(negs)
        .sort(function(a, b) { return a[0].localeCompare(b[0]); })
        .map(function(ne) {
          var neg = ne[0], clients = ne[1];
          return {
            negocio: neg,
            top10: Object.values(clients)
              .sort(function(a, b) { return b.venta - a.venta; })
              .slice(0, 10)
              .map(function(c, i) { return { ranking: i + 1, cod_cliente: c.cod_cliente, nombre: c.nombre, venta: round2_(c.venta) }; })
          };
        })
    };
  });

  return { top_global: top_global, top_por_vendedor: top_por_vendedor, top_por_negocio: top_por_negocio, top_por_vendedor_negocio: top_por_vendedor_negocio };
}

// ════════════════════════════════════════════════════════════════════

function getTopMarcas() {
  const mesData  = getBasePeriodoActual_();
  const marcaMap = {};

  mesData.forEach(r => {
    const marca   = String(r[10] || '').trim();
    const negocio = String(r[8]  || '').trim();
    const cant    = parseFloat(r[13]) || 0;
    const valor   = parseFloat(r[14]) || 0;
    if (!marca || valor <= 0) return;
    if (!marcaMap[marca]) marcaMap[marca] = { marca, negocio, venta:0, unidades:0, clientes:new Set() };
    marcaMap[marca].venta    += valor;
    marcaMap[marca].unidades += Math.max(cant, 0);
    marcaMap[marca].clientes.add(normalizarCodigoCliente_(r[1]));
  });

  const total = Object.values(marcaMap).reduce((s, m) => s + m.venta, 0);

  return Object.values(marcaMap)
    .map(m => ({
      marca:    m.marca,
      negocio:  m.negocio,
      venta:    round2_(m.venta),
      clientes: m.clientes.size,
      unidades: Math.round(m.unidades || 0),
      pct:      total > 0 ? round2_(m.venta / total * 100) : 0
    }))
    .sort((a, b) => b.venta - a.venta);
}

// ════════════════════════════════════════════════════════════════════
// DN POR MARCA — Distribución Numérica top-10 + marcas con meta definida
// ════════════════════════════════════════════════════════════════════
function getDNMarcas() {
  const mesData = getBasePeriodoActual_();

  // ── Maestro total: conteo único de clientes ACTIVOS en MAESTRO_CLIENTES ──
  const hMC = getSheet_(HOJAS.MAESTRO_CLIENTES);
  let maestroTotal = 0;
  if (hMC && hMC.getLastRow() > 1) {
    hMC.getDataRange().getValues().slice(1).forEach(function(r) {
      if (String(r[19] || '').trim().toUpperCase() === 'A') maestroTotal++;
    });
  }

  // ── Maestro por vendedor desde RESUMEN_COBERTURA ──
  const hRC = getSheet_('RESUMEN_COBERTURA');
  const maestroVend = {};   // cod → maestro individual
  if (hRC && hRC.getLastRow() > 1) {
    hRC.getDataRange().getValues().slice(1).forEach(function(r) {
      const raw  = String(r[0] || '').trim();
      const cod  = obtenerCodAsesor_(raw);
      const mstr = parseInt(r[1]) || 0;
      if (cod && mstr) maestroVend[cod] = mstr;
    });
  }

  // ── Acumular clientes por marca (global y por vendedor) ──
  const marcaVenta   = {};
  const marcaCli     = {};
  const vendMarcaCli = {};

  mesData.forEach(function(r) {
    const marca   = String(r[10] || '').trim();
    const codCli  = normalizarCodigoCliente_(r[1]);
    const rawVend = String(r[3]  || '').trim();
    const codVend = obtenerCodAsesor_(rawVend) || rawVend;  // extraer solo el código
    const valor   = parseFloat(r[14]) || 0;
    if (!marca || valor <= 0 || !codCli || !codVend) return;

    marcaVenta[marca] = (marcaVenta[marca] || 0) + valor;
    if (!marcaCli[marca])              marcaCli[marca] = new Set();
    if (!vendMarcaCli[marca])          vendMarcaCli[marca] = {};
    if (!vendMarcaCli[marca][codVend]) vendMarcaCli[marca][codVend] = new Set();
    marcaCli[marca].add(codCli);
    vendMarcaCli[marca][codVend].add(codCli);
  });

  // Top 10 marcas por venta
  const top10 = Object.entries(marcaVenta)
    .sort(function(a, b) { return b[1] - a[1]; })
    .slice(0, 10)
    .map(function(e) { return e[0]; });

  // Agregar marcas con meta aunque no estén en top-10
  const MARCAS_META = { 'CHOCOLISTO': 60, 'GRANUTS': 60, 'TIKYS': 10 };
  Object.keys(MARCAS_META).forEach(function(kw) {
    const found = Object.keys(marcaVenta).find(function(m) {
      return m.toUpperCase().includes(kw);
    });
    if (found && top10.indexOf(found) === -1) top10.push(found);
  });

  // Construir resultado
  return top10.map(function(marca) {
    const clientes = marcaCli[marca] ? marcaCli[marca].size : 0;
    const dn_pct   = maestroTotal > 0 ? round2_(clientes / maestroTotal * 100) : 0;

    // DN por vendedor — solo códigos numéricos válidos
    const por_vendedor = Object.entries(vendMarcaCli[marca] || {})
      .filter(function(e) { return /^\d+$/.test(e[0]); })
      .map(function(e) {
        const cod      = e[0];
        const cliSet   = e[1];
        const maestro  = maestroVend[cod] || 0;
        const vClientes= cliSet.size;
        const vDn      = maestro > 0 ? round2_(vClientes / maestro * 100) : 0;
        return { cod, clientes: vClientes, maestro, dn_pct: vDn };
      });

    // Meta si aplica
    const marcaUpper = marca.toUpperCase();
    const kwMatch    = Object.keys(MARCAS_META).find(function(kw) { return marcaUpper.includes(kw); });
    const meta       = kwMatch ? MARCAS_META[kwMatch] : null;

    return {
      marca,
      venta:        round2_(marcaVenta[marca] || 0),
      clientes,
      maestro:      maestroTotal,
      dn_pct,
      meta,          // null = sin meta definida
      por_vendedor
    };
  }).sort(function(a, b) { return b.venta - a.venta; });
}

// ════════════════════════════════════════════════════════════════════
// COBERTURA POR MARCAS — todas las marcas + seguimiento de concursos
// ════════════════════════════════════════════════════════════════════

// Marcas priorizadas para "Seguimiento de concursos" (match por keyword,
// igual lógica que MARCAS_META en getDNMarcas — no quedan hardcodeadas
// en el frontend, ambos paneles consumen este mismo arreglo vía el endpoint).
var MARCAS_CONCURSO = [
  { kw: 'TIKYS',      label: 'Tikys' },
  { kw: 'CHOCOLISTO', label: 'Chocolisto' },
  { kw: 'GRANUTS',    label: 'Granuts' },
];
var UMBRAL_VERDE_CONCURSO    = 70;
var UMBRAL_AMARILLO_CONCURSO = 40;

/**
 * Cobertura por marca — TODAS las marcas con venta (sin límite top-10),
 * tanto a nivel global (Gerencial) como por vendedor (Mi Panel).
 * Reutiliza la misma fuente y el mismo conteo de clientes únicos por Set
 * que getDNMarcas(), para que Gerencial y Mi Panel nunca difieran.
 * Además calcula el resumen de "Seguimiento de concursos" para las marcas
 * priorizadas (Tikys, Chocolisto, Granuts).
 */
function getCoberturaMarcas_() {
  const mesData = getBasePeriodoActual_();

  // ── Maestro total: clientes ACTIVOS en MAESTRO_CLIENTES ──────────────────
  const hMC = getSheet_(HOJAS.MAESTRO_CLIENTES);
  let maestroTotal = 0;
  if (hMC && hMC.getLastRow() > 1) {
    hMC.getDataRange().getValues().slice(1).forEach(function(r) {
      if (String(r[19] || '').trim().toUpperCase() === 'A') maestroTotal++;
    });
  }

  // ── Maestro por vendedor (RESUMEN_COBERTURA) + sede (CUOTAS) ────────────
  const hRC = getSheet_('RESUMEN_COBERTURA');
  const maestroVend = {};
  if (hRC && hRC.getLastRow() > 1) {
    hRC.getDataRange().getValues().slice(1).forEach(function(r) {
      const cod  = obtenerCodAsesor_(String(r[0] || '').trim());
      const mstr = parseInt(r[1]) || 0;
      if (cod && mstr) maestroVend[cod] = mstr;
    });
  }
  const sedeMap = cargarSedeMap_();

  // ── Acumular clientes únicos y venta por marca (global y por vendedor) ──
  const marcaVenta     = {};
  const marcaCli       = {};
  const vendMarcaCli   = {};
  const vendMarcaVenta = {};
  const vendNombre     = {};

  mesData.forEach(function(r) {
    const marca   = String(r[10] || '').trim();
    const codCli  = normalizarCodigoCliente_(r[1]);
    const rawVend = String(r[3]  || '').trim();
    const codVend = obtenerCodAsesor_(rawVend) || rawVend;
    const nomVend = String(r[4]  || '').trim();
    const valor   = parseFloat(r[14]) || 0;
    if (!marca || valor <= 0 || !codCli || !codVend) return;

    if (nomVend && !vendNombre[codVend]) vendNombre[codVend] = nomVend;

    marcaVenta[marca] = (marcaVenta[marca] || 0) + valor;
    if (!marcaCli[marca]) marcaCli[marca] = new Set();
    marcaCli[marca].add(codCli);

    if (!vendMarcaCli[codVend])        vendMarcaCli[codVend]        = {};
    if (!vendMarcaCli[codVend][marca]) vendMarcaCli[codVend][marca] = new Set();
    vendMarcaCli[codVend][marca].add(codCli);

    if (!vendMarcaVenta[codVend]) vendMarcaVenta[codVend] = {};
    vendMarcaVenta[codVend][marca] = (vendMarcaVenta[codVend][marca] || 0) + valor;
  });

  // ── Cobertura general por marca — TODAS, sin límite top-10 ───────────────
  const marcas = Object.keys(marcaVenta).map(function(marca) {
    const clientes  = marcaCli[marca] ? marcaCli[marca].size : 0;
    const cobertura = maestroTotal > 0 ? round2_(clientes / maestroTotal * 100) : 0;
    return {
      marca:                marca,
      clientes_impactados:  clientes,
      universo:             maestroTotal,
      cobertura_pct:        cobertura,
      venta:                round2_(marcaVenta[marca] || 0),
      oportunidad_clientes: Math.max(0, maestroTotal - clientes),
    };
  }).sort(function(a, b) { return b.cobertura_pct - a.cobertura_pct; });

  // ── Cobertura por vendedor — todas sus marcas ────────────────────────────
  const codsValidos = Object.keys(vendMarcaCli).filter(function(c) { return /^\d+$/.test(c); });
  const vendedores = codsValidos.map(function(cod) {
    const universoV = maestroVend[cod] || 0;
    const marcasV = Object.keys(vendMarcaCli[cod]).map(function(marca) {
      const clientes  = vendMarcaCli[cod][marca].size;
      const cobertura = universoV > 0 ? round2_(clientes / universoV * 100) : 0;
      return {
        marca:                marca,
        clientes_impactados:  clientes,
        universo:             universoV,
        cobertura_pct:        cobertura,
        venta:                round2_((vendMarcaVenta[cod] || {})[marca] || 0),
        oportunidad_clientes: Math.max(0, universoV - clientes),
      };
    }).sort(function(a, b) { return b.cobertura_pct - a.cobertura_pct; });

    return {
      cod_asesor:        cod,
      vendedor:          vendNombre[cod] || cod,
      sede:              sedeMap[cod] || '',
      universo_vendedor: universoV,
      marcas:            marcasV,
    };
  }).filter(function(v) { return esVendedorValido_(v.cod_asesor, v.vendedor); });

  // ── Seguimiento de concursos (marcas priorizadas) ────────────────────────
  // Resuelve, para cada keyword de concurso, el nombre real de marca que matchea
  // (ej. 'CHOCOLISTO' → 'Chocolisto Fortificado'), igual que MARCAS_META.
  const marcaPorKeyword = {};
  MARCAS_CONCURSO.forEach(function(m) {
    const found = Object.keys(marcaVenta).find(function(marca) {
      return marca.toUpperCase().includes(m.kw);
    });
    if (found) marcaPorKeyword[m.kw] = found;
  });

  const concursoResumen = MARCAS_CONCURSO.map(function(m) {
    const marcaReal = marcaPorKeyword[m.kw];
    const clientes  = marcaReal && marcaCli[marcaReal] ? marcaCli[marcaReal].size : 0;
    const cobertura = maestroTotal > 0 ? round2_(clientes / maestroTotal * 100) : 0;
    return {
      marca:               m.label,
      clientes_impactados: clientes,
      universo:            maestroTotal,
      cobertura_pct:       cobertura,
    };
  });

  const concursoVendedores = vendedores.map(function(v) {
    const marcasObj = {};
    let sumaCobertura = 0;
    MARCAS_CONCURSO.forEach(function(m) {
      const marcaReal = marcaPorKeyword[m.kw];
      const entry     = marcaReal ? v.marcas.find(function(x) { return x.marca === marcaReal; }) : null;
      const clientes  = entry ? entry.clientes_impactados : 0;
      const cobertura = v.universo_vendedor > 0 ? round2_(clientes / v.universo_vendedor * 100) : 0;
      marcasObj[m.label] = { clientes_impactados: clientes, cobertura_pct: cobertura };
      sumaCobertura += cobertura;
    });
    const promedio = round2_(sumaCobertura / MARCAS_CONCURSO.length);
    const estado   = promedio >= UMBRAL_VERDE_CONCURSO ? 'verde'
                    : promedio >= UMBRAL_AMARILLO_CONCURSO ? 'amarillo'
                    : 'rojo';
    return {
      cod_asesor:             v.cod_asesor,
      vendedor:               v.vendedor,
      sede:                   v.sede,
      universo:               v.universo_vendedor,
      marcas:                 marcasObj,
      promedio_cobertura_pct: promedio,
      estado:                 estado,
    };
  }).sort(function(a, b) { return a.promedio_cobertura_pct - b.promedio_cobertura_pct; });

  return {
    universo_total: maestroTotal,
    marcas:         marcas,
    vendedores:     vendedores,
    concursos: {
      marcas:     MARCAS_CONCURSO.map(function(m) { return m.label; }),
      resumen:    concursoResumen,
      vendedores: concursoVendedores,
    },
  };
}

// ════════════════════════════════════════════════════════════════════
// MI GERENCIA — Panel privado vs meta ECOM real
// ════════════════════════════════════════════════════════════════════

/**
 * Normaliza nombre de negocio para emparejar venta_por_negocio con METAS_ECOM.
 * Replica la lógica de normNeg() del frontend (Gerencial.jsx).
 */
function normNegMiG_(nombre) {
  var MAPA = {
    'CHOCOLATES': 'Chocolates',  'CHOCOLATE': 'Chocolates',
    'GALLETAS':   'Galletas',    'GALLETA':   'Galletas',
    'CARNICO':    'Cárnico',     'CARNICOS':  'Cárnico',   'CARNICA': 'Cárnico',
    'CAFE':       'Café',        'CAF':       'Café',
    'BEBIDAS TMLUC': 'Bebidas TMLUC', 'BEBIDAS': 'Bebidas TMLUC', 'TMLUC': 'Bebidas TMLUC',
    'SNACKS TMLUC':  'Snacks TMLUC',  'SNACKS':  'Snacks TMLUC',
    'OTROS TMLUC':   'Otros TMLUC',   'OTROS':   'Otros TMLUC',
    'NUTRICION EXPERTA': 'Nutrición Experta', 'NUTRICION': 'Nutrición Experta',
    'NUTRICIUN EXPERTA': 'Nutrición Experta', 'NUTRICIUN': 'Nutrición Experta',
    'BARRAS CORTAS': 'Barras Cortas', 'BARRAS': 'Barras Cortas',
    'TAJADOS': 'Tajados', 'TAJADO': 'Tajados',
  };
  if (!nombre) return '';
  var s = String(nombre).trim();
  // Repara mojibake típico de doble-encoding UTF-8→Latin1 (ej. "Nutrici√≥n Experta")
  s = s.replace(/√©/g, 'e').replace(/√≥/g, 'o').replace(/√∫/g, 'u')
       .replace(/√°/g, 'a').replace(/√±/g, 'n').replace(/√≠/g, 'i');
  s = s.replace(/Û/g, 'u').replace(/û/g, 'u');
  s = s.replace(/^\d+\s*[-_]\s*/, '');
  var limpio = s.trim();
  var key = s.toUpperCase()
    .replace(/[ÁÀÂÄ]/g, 'A').replace(/[ÉÈÊË]/g, 'E')
    .replace(/[ÍÌÎÏ]/g, 'I').replace(/[ÓÒÔÖ]/g, 'O')
    .replace(/[ÚÙÛÜ]/g, 'U').replace(/Ñ/g, 'N')
    .replace(/\s+/g, ' ').trim();
  return MAPA[key] || limpio;
}

/**
 * Panel privado gerencial: venta real vs meta ECOM (interna).
 * Lee la hoja METAS_ECOM (columnas A=NEGOCIO, B=META_ECOM).
 * Si la hoja no existe, usa valores por defecto hardcodeados.
 */
function getMiGerencia_() {
  // ── Metas por defecto (si la hoja METAS_ECOM no existe aún) ──────────────
  var DEFAULTS = {
    'Chocolates':        170589,
    'Cárnico':           137796,
    'Galletas':          85681,
    'Bebidas TMLUC':     34247,
    'Café':              31562,
    'Snacks TMLUC':      2037,
    'Otros TMLUC':       50,
    'Nutrición Experta': 1000,
  };

  // ── 1. Leer hoja METAS_ECOM ───────────────────────────────────────────────
  var hME = getSheet_('METAS_ECOM');
  var metasEcom = {};
  var hojaEncontrada = !!(hME && hME.getLastRow() >= 2);
  var sinHoja = !hojaEncontrada;
  var totalFilas = 0;
  var negCol = 0, metaCol = 1;           // fallback: columna A = negocio, B = meta

  if (hojaEncontrada) {
    var allRows = hME.getDataRange().getValues();
    totalFilas = allRows.length - 1;     // excluye encabezado
    // Detección flexible de columnas (acepta NEGOCIO / Negocio / META_ECOM / Meta ECOM / meta_ecom …)
    var headers = allRows[0].map(function(h) {
      return String(h || '').trim().toUpperCase().replace(/[\s_]+/g, '');
    });
    headers.forEach(function(h, i) {
      if (h === 'NEGOCIO' || h === 'NEG') negCol = i;
      if (h === 'METAECOM' || h === 'METAECO' || h === 'META_ECOM' || h === 'METAECOMECOM') metaCol = i;
    });
    allRows.slice(1).forEach(function(r) {
      var neg  = normNegMiG_(String(r[negCol] || '').trim());
      var meta = parseFloat(r[metaCol]) || 0;
      if (neg && meta > 0) metasEcom[neg] = (metasEcom[neg] || 0) + meta;
    });
    if (Object.keys(metasEcom).length === 0) sinHoja = true;
  }
  var usandoDefaults = sinHoja;
  if (sinHoja) {
    Object.keys(DEFAULTS).forEach(function(k) { metasEcom[k] = DEFAULTS[k]; });
  }

  // ── 2. Venta real por negocio (desde resumen cacheado) ───────────────────
  var resumenData = withCache_('resumen', 300, getResumen);
  var ventaMap = {};
  (resumenData.venta_por_negocio || []).forEach(function(v) {
    var neg = normNegMiG_(v.negocio);
    if (neg) ventaMap[neg] = round2_((ventaMap[neg] || 0) + (v.venta || 0));
  });

  // ── 3. Meta PALMA por negocio (desde cuotas — suma de todos los asesores) ─
  var cuotasData = getCuotas();
  var metaPalmaMap = {};
  cuotasData.forEach(function(c) {
    (c.por_negocio || []).forEach(function(n) {
      var neg = normNegMiG_(n.negocio);
      if (neg) metaPalmaMap[neg] = round2_((metaPalmaMap[neg] || 0) + (n.meta || 0));
    });
  });

  // ── 4. Config: días hábiles restantes ────────────────────────────────────
  var config = getConfig_();
  var diasRestantes = Number(config.dias_habiles_restantes) || 0;

  // ── 5. Factor de proyección: hTotal / hTranscurridos ─────────────────────
  var hoy = new Date();
  var inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  var fin    = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
  function diasHabMiG_(a, b) {
    var n = 0, d = new Date(a);
    while (d <= b) { if (d.getDay() !== 0) n++; d.setDate(d.getDate() + 1); }
    return n;
  }
  var hTotal  = diasHabMiG_(inicio, fin);
  var hTransc = hTotal - diasRestantes;
  var factor  = hTransc > 0 ? round2_(hTotal / hTransc) : 1;

  // ── 6. Filas por negocio ─────────────────────────────────────────────────
  var allNegs = {};
  Object.keys(metasEcom).forEach(function(k) { allNegs[k] = true; });
  Object.keys(ventaMap).forEach(function(k) { allNegs[k] = true; });

  var negocios = Object.keys(allNegs).map(function(neg) {
    var metaE  = metasEcom[neg] || 0;
    var venta  = ventaMap[neg]  || 0;
    var metaP  = metaPalmaMap[neg] || 0;
    var proyec = round2_(venta * factor);
    var cumplPct     = metaE > 0 ? round2_(venta  / metaE * 100) : null;
    var cumplProyPct = metaE > 0 ? round2_(proyec / metaE * 100) : null;
    var faltaHoy     = metaE > 0 ? round2_(metaE - venta)  : null;
    var faltaProyec  = metaE > 0 ? round2_(metaE - proyec) : null;
    var diarioReq    = diasRestantes > 0 && faltaHoy > 0 ? round2_(faltaHoy / diasRestantes) : 0;
    var difMeta      = metaE > 0 && metaP > 0 ? round2_(metaP - metaE)                  : null;
    var infladoPct   = metaE > 0 && metaP > 0 ? round2_((metaP / metaE - 1) * 100)      : null;
    return {
      negocio:                    neg,
      meta_ecom:                  metaE,
      meta_palma:                 round2_(metaP),
      venta_real:                 round2_(venta),
      proyeccion:                 proyec,
      cumplimiento_pct:           cumplPct,
      cumplimiento_proyectado_pct:cumplProyPct,
      falta_hoy:                  faltaHoy,
      falta_proyectada:           faltaProyec,
      diario_requerido:           diarioReq,
      diferencia_meta:            difMeta,
      inflado_pct:                infladoPct,
    };
  }).sort(function(a, b) {
    return (b.meta_ecom || 0) - (a.meta_ecom || 0) || (b.venta_real || 0) - (a.venta_real || 0);
  });

  // ── 7. Totales ────────────────────────────────────────────────────────────
  var ecomTotal   = Object.values(metasEcom).reduce(function(s, v) { return s + v; }, 0);
  var ventaTotal  = Object.values(ventaMap).reduce(function(s, v) { return s + v; }, 0);
  var proyecTotal = round2_(ventaTotal * factor);
  var faltaHoyT   = round2_(ecomTotal - ventaTotal);
  var faltaProyT  = round2_(ecomTotal - proyecTotal);

  return {
    sin_hoja_ecom:          sinHoja,
    hoja_encontrada:        hojaEncontrada,
    dias_habiles_restantes: diasRestantes,
    factor_proyeccion:      factor,
    debug: {
      fuente_metas:               usandoDefaults ? 'defaults' : 'METAS_ECOM',
      hoja_metas_ecom_encontrada: hojaEncontrada,
      total_filas_metas_ecom:     totalFilas,
      col_negocio:                negCol,
      col_meta_ecom:              metaCol,
    },
    resumen: {
      meta_ecom_total:             round2_(ecomTotal),
      venta_real_total:            round2_(ventaTotal),
      cumplimiento_ecom_pct:       ecomTotal > 0 ? round2_(ventaTotal  / ecomTotal * 100) : 0,
      proyeccion_total:            proyecTotal,
      cumplimiento_proyectado_pct: ecomTotal > 0 ? round2_(proyecTotal / ecomTotal * 100) : 0,
      falta_hoy:                   faltaHoyT,
      falta_proyectada:            faltaProyT,
      diario_requerido:            diasRestantes > 0 ? round2_(Math.max(0, faltaHoyT) / diasRestantes) : 0,
    },
    negocios: negocios,
  };
}

// ════════════════════════════════════════════════════════════════════
// DIAGNÓSTICO DE API
// ════════════════════════════════════════════════════════════════════

// Diagnóstico: muestra qué valores tiene la columna AB (fecha creación) en MAESTRO_CLIENTES
function getFechasDebug_() {
  const hM = getSheet_(HOJAS.MAESTRO_CLIENTES);
  if (!hM || hM.getLastRow() < 2) return { error: 'Hoja no encontrada o vacía' };
  const data = hM.getDataRange().getValues();
  const muestra = [];
  for (let i = 1; i < Math.min(data.length, 21); i++) { // primeras 20 filas
    const fechaR = data[i][27]; // columna AB
    muestra.push({
      fila: i + 1,
      tipo: typeof fechaR,
      esDate: fechaR instanceof Date,
      valorRaw: String(fechaR).slice(0, 30),
      parsedStr: parseFechaCreacion_(fechaR),
    });
  }
  return { total_filas: data.length - 1, muestra };
}

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

// ════════════════════════════════════════════════════════════════════
// CARTERA (CxC PENDIENTE)
// Pega el reporte CxC exportado desde el sistema en la hoja CARTERA.
// Columnas esperadas: N°. RUC, Tipo documento, Documento cliente,
// Cliente, Nombre corregimiento, Sucursal, Valor RUC, Valor Anticipo,
// Estado cxc, Estado efectivo, N° Recaudo, Recibo, Asesor, Fecha Cxc,
// Consignación Anticipo, Ref anticipo
// ════════════════════════════════════════════════════════════════════
function getCartera() {
  const h = getSheet_(HOJAS.CARTERA);
  if (!h || h.getLastRow() < 2) {
    return { total_pendiente: 0, total_facturas: 0, por_vendedor: [], por_tramo: [], top_clientes: [], detalle: [] };
  }

  const raw     = h.getDataRange().getValues();
  const rawHdrs = raw[0].map(function(v) {
    return String(v || '').trim().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[°\.\s]+/g, '_').replace(/[^a-z0-9_]/g, '');
  });

  // Localizar columnas de forma flexible
  function col(kws) {
    return rawHdrs.findIndex(function(h) { return kws.some(function(k) { return h.includes(k); }); });
  }
  const iRuc    = col(['n__ruc', 'ruc']);
  // Buscar columna exacta "Cliente" (no "Documento cliente" que solo tiene el código RUC)
  const iCli    = rawHdrs.indexOf('cliente') !== -1
    ? rawHdrs.indexOf('cliente')
    : col(['nombre_cliente', 'nom_cliente', 'cliente']);
  const iAsesor = col(['asesor']);
  const iValor  = col(['valor_ruc', 'valor']);
  const iEstado = col(['estado_cxc', 'estado']);
  const iFecha  = col(['fecha_cxc', 'fecha']);
  const iCorr   = col(['corregimiento', 'nombre_corregimiento']);

  const hoy = new Date();
  const pendientes = [];

  raw.slice(1).forEach(function(row) {
    const estado = String(row[iEstado] || '').trim().toLowerCase();
    if (estado !== 'pendiente') return;

    const clienteRaw = String(row[iCli] || '').trim();
    const dashIdx    = clienteRaw.indexOf(' - ');
    const codCli     = dashIdx >= 0 ? clienteRaw.substring(0, dashIdx).trim() : clienteRaw;
    const nomCli     = dashIdx >= 0 ? clienteRaw.substring(dashIdx + 3).trim() : '';

    const asesorRaw  = String(row[iAsesor] || '').trim();
    const codAs      = obtenerCodAsesor_(asesorRaw);
    const dashAs     = asesorRaw.indexOf(' - ');
    const nomAs      = dashAs >= 0 ? asesorRaw.substring(dashAs + 3).trim() : asesorRaw;

    // Formato español: punto = miles, coma = decimal (ej: "1.234,56" → 1234.56)
    var valorRaw = row[iValor];
    var valor;
    if (typeof valorRaw === 'number') {
      valor = valorRaw;
    } else {
      var valorStr = String(valorRaw || '0').trim()
        .replace(/\./g, '')   // quitar separador de miles
        .replace(/,/g, '.');  // coma decimal → punto
      valor = parseFloat(valorStr) || 0;
    }
    if (valor <= 0) return;

    var fechaObj = row[iFecha];
    if (!(fechaObj instanceof Date)) {
      fechaObj = new Date(String(fechaObj));
    }
    if (isNaN(fechaObj.getTime())) return;

    const diasVencido = Math.floor((hoy - fechaObj) / 86400000);
    var tramo;
    if      (diasVencido <= 30) tramo = '0-30';
    else if (diasVencido <= 60) tramo = '31-60';
    else if (diasVencido <= 90) tramo = '61-90';
    else                        tramo = '+90';

    pendientes.push({
      nro_ruc:      String(row[iRuc] || '').trim(),
      cliente:      clienteRaw,
      cod_cliente:  codCli,
      nom_cliente:  nomCli,
      cod_asesor:   codAs,
      nom_asesor:   nomAs,
      asesor:       asesorRaw,
      valor:        round2_(valor),
      fecha:        Utilities.formatDate(fechaObj, TZ, 'yyyy-MM-dd'),
      dias_vencido: diasVencido,
      tramo:        tramo,
      ciudad:       String(iCorr >= 0 ? (row[iCorr] || '') : '').trim()
    });
  });

  const total_pendiente = round2_(pendientes.reduce(function(s, r) { return s + r.valor; }, 0));

  // Por vendedor con desglose por tramo
  const vendMap = {};
  pendientes.forEach(function(r) {
    if (!vendMap[r.cod_asesor]) {
      vendMap[r.cod_asesor] = { cod_asesor: r.cod_asesor, asesor: r.asesor, nom_asesor: r.nom_asesor, total: 0, facturas: 0,
        tramos: { '0-30': 0, '31-60': 0, '61-90': 0, '+90': 0 } };
    }
    vendMap[r.cod_asesor].total        += r.valor;
    vendMap[r.cod_asesor].facturas     += 1;
    vendMap[r.cod_asesor].tramos[r.tramo] += r.valor;
  });
  const por_vendedor = Object.values(vendMap).map(function(v) {
    return {
      cod_asesor: v.cod_asesor, asesor: v.asesor, nom_asesor: v.nom_asesor,
      total: round2_(v.total), facturas: v.facturas,
      tramos: {
        '0-30':  round2_(v.tramos['0-30']),
        '31-60': round2_(v.tramos['31-60']),
        '61-90': round2_(v.tramos['61-90']),
        '+90':   round2_(v.tramos['+90'])
      }
    };
  }).sort(function(a, b) { return b.total - a.total; });

  // Totales por tramo
  const tramoAcc = { '0-30': 0, '31-60': 0, '61-90': 0, '+90': 0 };
  pendientes.forEach(function(r) { tramoAcc[r.tramo] += r.valor; });
  const por_tramo = [
    { tramo: '0-30',  label: '0-30 días',  monto: round2_(tramoAcc['0-30'])  },
    { tramo: '31-60', label: '31-60 días', monto: round2_(tramoAcc['31-60']) },
    { tramo: '61-90', label: '61-90 días', monto: round2_(tramoAcc['61-90']) },
    { tramo: '+90',   label: '+90 días',   monto: round2_(tramoAcc['+90'])   }
  ];

  // Top 15 clientes por monto pendiente
  const cliMap = {};
  pendientes.forEach(function(r) {
    if (!cliMap[r.cod_cliente]) {
      cliMap[r.cod_cliente] = { cod_cliente: r.cod_cliente, nom_cliente: r.nom_cliente, total: 0, facturas: 0, asesor: r.nom_asesor };
    }
    cliMap[r.cod_cliente].total   += r.valor;
    cliMap[r.cod_cliente].facturas += 1;
  });
  const top_clientes = Object.values(cliMap)
    .sort(function(a, b) { return b.total - a.total; })
    .slice(0, 15)
    .map(function(c) { return { cod_cliente: c.cod_cliente, nom_cliente: c.nom_cliente, total: round2_(c.total), facturas: c.facturas, asesor: c.asesor }; });

  return {
    total_pendiente: total_pendiente,
    total_facturas:  pendientes.length,
    por_vendedor:    por_vendedor,
    por_tramo:       por_tramo,
    top_clientes:    top_clientes,
    detalle:         pendientes.sort(function(a, b) { return b.valor - a.valor; }).slice(0, 300)
  };
}

// ════════════════════════════════════════════════════════════════════
// PRODUCTOS CLAVE — cobertura por cliente
// ════════════════════════════════════════════════════════════════════

/**
 * Limpia el campo SAP antes de comparar.
 * - Convierte a string, quita espacios y el sufijo ".0" de Excel.
 * - No convierte a número: preserva ceros iniciales y códigos largos.
 */
function limpiarSap_(sap) {
  return String(sap || '').trim().replace(/\.0$/, '');
}

/**
 * Lee PRODUCTOS_CLAVE y construye:
 *   claveMap  → { sap: { nombre, detalle, negocio, tr, estado } }
 *   todos     → Array de todos los productos del catálogo
 */
function cargarProductosClave_() {
  var productos = sheetToJSON(HOJAS.PRODUCTOS_CLAVE);
  var claveMap  = {};
  var todos     = [];

  productos.forEach(function(p) {
    var sap    = limpiarSap_(p.sap);
    var estado = normalizarTexto_(p.estado);
    var obj = {
      sap:     sap,
      gtinse:  String(p.gtinse  || '').trim(),
      nombre:  String(p.nombre  || '').trim(),
      detalle: String(p.detalle || '').trim(),
      negocio: String(p.negocio || '').trim(),
      tr:      String(p.tr      || '').trim(),
      estado:  String(p.estado  || '').trim()
    };
    todos.push(obj);
    if (estado === 'CLAVE' && sap) {
      claveMap[sap] = obj;
    }
  });

  return { claveMap: claveMap, todos: todos };
}

/**
 * Lee MAESTRO_CLIENTES y construye:
 *   activosSet → Set de cod_cliente activos (estado='A')
 *   byAsesor   → { cod_asesor: Set<cod_cliente> }
 *   byCliente  → { cod_cliente: { cod_asesor, asesor_raw, nombre } }
 *   total      → count
 */
function cargarMaestroActivos_() {
  var hM        = getSheet_(HOJAS.MAESTRO_CLIENTES);
  var activosSet = new Set();
  var byAsesor  = {};
  var byCliente = {};

  if (hM && hM.getLastRow() > 1) {
    hM.getDataRange().getValues().slice(1).forEach(function(r) {
      var estado = String(r[19] || '').trim().toUpperCase();
      if (estado !== 'A') return;
      var codCli    = normalizarCodigoCliente_(r[0]);
      var nombre    = String(r[1]  || '').trim();
      var asesorRaw = String(r[20] || '').trim();
      var codAs     = obtenerCodAsesor_(asesorRaw);
      if (!codCli) return;
      if (asesorRaw && !esVendedorValido_(codAs, asesorRaw)) return;

      activosSet.add(codCli);
      byCliente[codCli] = { cod_asesor: codAs, asesor_raw: asesorRaw, nombre: nombre };
      if (codAs) {
        if (!byAsesor[codAs]) byAsesor[codAs] = new Set();
        byAsesor[codAs].add(codCli);
      }
    });
  }

  return { activosSet: activosSet, byAsesor: byAsesor, byCliente: byCliente, total: activosSet.size };
}

/**
 * Lee CUOTAS y construye un mapa cod_asesor → sede.
 */
function cargarSedeMap_() {
  var sedeMap   = {};
  var hCuotas   = getSheet_(HOJAS.CUOTAS);
  if (!hCuotas || hCuotas.getLastRow() < 2) return sedeMap;
  var rows  = hCuotas.getDataRange().getValues().slice(1);
  var ncols = rows.length > 0 ? rows[0].length : 0;
  var tieneSede = ncols >= 4;
  rows.forEach(function(r) {
    var cod  = obtenerCodAsesor_(String(r[0] || '').trim());
    var sede = tieneSede ? String(r[1] || '').trim() : '';
    if (cod && sede && !sedeMap[cod]) sedeMap[cod] = sede;
  });
  return sedeMap;
}

// ── Endpoint: catálogo de productos clave ─────────────────────────
function getProductosClave_() {
  var pc   = cargarProductosClave_();
  var clave = Object.values(pc.claveMap);

  return {
    total_catalogo:         pc.todos.length,
    total_productos_clave:  clave.length,
    total_sap_clave_unicos: clave.length,
    productos:              clave
  };
}

// ── Endpoint: cobertura gerencial de productos clave ──────────────
function getCoberturaProductosClave_() {
  var pc          = cargarProductosClave_();
  var sapClaveSet = new Set(Object.keys(pc.claveMap));

  var maestro    = cargarMaestroActivos_();
  var activosSet = maestro.activosSet;
  var totalActivos = maestro.total;

  var base = getBasePeriodoActual_();

  var clientesImpactados = new Set();
  var ventaClave  = 0;
  var unidadesClave = 0;
  var negocioMap  = {};   // negocio → { clientes:Set, venta, unidades, saps:Set }
  var sapVendido  = new Set();
  var sapInvalido = 0;
  var sapNoEncontrado = 0;

  base.forEach(function(r) {
    var codCli  = normalizarCodigoCliente_(r[1]);
    var sap     = limpiarSap_(r[6]);
    var negocio = String(r[8]  || '').trim() || 'Sin negocio';
    var cant    = parseFloat(r[13]) || 0;
    var venta   = parseFloat(r[14]) || 0;
    if (venta <= 0 || !activosSet.has(codCli)) return;

    if (!sap)                      { sapInvalido++;        return; }
    if (!sapClaveSet.has(sap))     { sapNoEncontrado++;    return; }

    clientesImpactados.add(codCli);
    ventaClave   += venta;
    unidadesClave += Math.max(cant, 0);
    sapVendido.add(sap);

    if (!negocioMap[negocio]) negocioMap[negocio] = { negocio: negocio, clientes: new Set(), venta: 0, unidades: 0, saps: new Set() };
    negocioMap[negocio].clientes.add(codCli);
    negocioMap[negocio].venta    += venta;
    negocioMap[negocio].unidades += Math.max(cant, 0);
    negocioMap[negocio].saps.add(sap);
  });

  var impactados    = clientesImpactados.size;
  var sinImpacto    = totalActivos - impactados;
  var cobPct        = totalActivos > 0 ? round2_(impactados / totalActivos * 100) : 0;
  var vendidos      = sapVendido.size;
  var noVendidos    = sapClaveSet.size - vendidos;

  // Auditoría en Logger (visible en Apps Script)
  Logger.log('[PC] total_catalogo='           + pc.todos.length);
  Logger.log('[PC] total_productos_clave='    + sapClaveSet.size);
  Logger.log('[PC] total_sap_clave_unicos='   + sapClaveSet.size);
  Logger.log('[PC] total_clientes_activos='   + totalActivos);
  Logger.log('[PC] clientes_impactados_clave='+ impactados);
  Logger.log('[PC] clientes_sin_impacto='     + sinImpacto);
  Logger.log('[PC] cobertura_clave_pct='      + cobPct);
  Logger.log('[PC] venta_productos_clave='    + round2_(ventaClave));
  Logger.log('[PC] sap_clave_vendidos='       + vendidos);
  Logger.log('[PC] sap_clave_no_vendidos='    + noVendidos);
  Logger.log('[PC] ventas_sap_invalido='      + sapInvalido);
  Logger.log('[PC] ventas_sap_no_encontrado=' + sapNoEncontrado);

  return {
    total_clientes_activos:        totalActivos,
    clientes_impactados_clave:     impactados,
    clientes_sin_impacto_clave:    sinImpacto,
    cobertura_clave_pct:           cobPct,
    venta_productos_clave:         round2_(ventaClave),
    unidades_productos_clave:      Math.round(unidadesClave),
    total_productos_clave:         sapClaveSet.size,
    productos_clave_vendidos:      vendidos,
    productos_clave_no_vendidos:   noVendidos,
    ventas_sap_invalido:           sapInvalido,
    ventas_sap_no_encontrado:      sapNoEncontrado,
    negocios: Object.values(negocioMap)
      .map(function(n) { return {
        negocio:             n.negocio,
        clientes_impactados: n.clientes.size,
        venta:               round2_(n.venta),
        unidades:            Math.round(n.unidades),
        productos_vendidos:  n.saps.size
      }; })
      .sort(function(a, b) { return b.clientes_impactados - a.clientes_impactados; })
  };
}

// ── Endpoint: cobertura de productos clave por vendedor ───────────
function getCoberturaProductosClaveVendedor_() {
  var pc          = cargarProductosClave_();
  var sapClaveSet = new Set(Object.keys(pc.claveMap));
  var maestro     = cargarMaestroActivos_();
  var sedeMap     = cargarSedeMap_();
  var base        = getBasePeriodoActual_();

  // Acumular desde BASE: impactados clave por asesor
  var vendMap = {};  // cod_asesor → { nombre, clientes_imp:Set, venta, unidades, saps:Set }

  base.forEach(function(r) {
    var codCli   = normalizarCodigoCliente_(r[1]);
    var codAs    = obtenerCodAsesor_(String(r[3] || '').trim());
    var nomVend  = String(r[4]  || '').trim();
    var sap      = limpiarSap_(r[6]);
    var cant     = parseFloat(r[13]) || 0;
    var venta    = parseFloat(r[14]) || 0;

    if (!codAs || !nomVend || !esVendedorValido_(codAs, nomVend)) return;
    if (venta <= 0 || !sap || !sapClaveSet.has(sap)) return;
    if (!maestro.activosSet.has(codCli)) return;

    if (!vendMap[codAs]) vendMap[codAs] = { nombre: nomVend, clientes_imp: new Set(), venta: 0, unidades: 0, saps: new Set() };
    vendMap[codAs].clientes_imp.add(codCli);
    vendMap[codAs].venta    += venta;
    vendMap[codAs].unidades += Math.max(cant, 0);
    vendMap[codAs].saps.add(sap);
  });

  // Combinar con todos los asesores que tienen clientes activos en el maestro
  var result = Object.entries(maestro.byAsesor).map(function(entry) {
    var codAs      = entry[0];
    var cliActivos = entry[1];
    var v          = vendMap[codAs] || {};
    var impactados = v.clientes_imp ? v.clientes_imp.size : 0;
    var activos    = cliActivos.size;

    return {
      cod_asesor:                codAs,
      vendedor:                  v.nombre || codAs,
      sede:                      sedeMap[codAs] || '',
      clientes_activos:          activos,
      clientes_impactados_clave: impactados,
      clientes_sin_impacto_clave: activos - impactados,
      cobertura_clave_pct:       activos > 0 ? round2_(impactados / activos * 100) : 0,
      venta_productos_clave:     round2_(v.venta || 0),
      unidades_productos_clave:  Math.round(v.unidades || 0),
      productos_clave_vendidos:  v.saps ? v.saps.size : 0
    };
  }).filter(function(v) {
    return esVendedorValido_(v.cod_asesor, v.vendedor);
  }).sort(function(a, b) {
    return b.cobertura_clave_pct - a.cobertura_clave_pct;
  });

  return { vendedores: result };
}

// ── Endpoint: clientes activos que no compraron ningún producto clave ─
function getClientesSinProductosClave_() {
  var pc          = cargarProductosClave_();
  var sapClaveSet = new Set(Object.keys(pc.claveMap));
  var maestro     = cargarMaestroActivos_();
  var sedeMap     = cargarSedeMap_();
  var base        = getBasePeriodoActual_();

  // Recorrer base: qué clientes compraron al menos un producto clave
  var clientesConClave = new Set();
  var clienteVenta     = {};  // cod_cli → { venta_total, ultima_compra, cod_asesor, vendedor }

  base.forEach(function(r) {
    var codCli   = normalizarCodigoCliente_(r[1]);
    var codAs    = obtenerCodAsesor_(String(r[3] || '').trim());
    var nomVend  = String(r[4]  || '').trim();
    var sap      = limpiarSap_(r[6]);
    var venta    = parseFloat(r[14]) || 0;
    var fechaR   = r[18];

    if (!codCli || venta <= 0 || !esVendedorValido_(codAs, nomVend)) return;

    if (!clienteVenta[codCli]) clienteVenta[codCli] = { venta_total: 0, ultima_compra: '', cod_asesor: codAs, vendedor: nomVend };
    clienteVenta[codCli].venta_total += venta;
    var fs = fechaISO_(fechaR);
    if (fs && fs > clienteVenta[codCli].ultima_compra) clienteVenta[codCli].ultima_compra = fs;

    if (sap && sapClaveSet.has(sap)) clientesConClave.add(codCli);
  });

  // Clientes activos sin producto clave
  var clientes = [];
  maestro.activosSet.forEach(function(codCli) {
    if (clientesConClave.has(codCli)) return;
    var m  = maestro.byCliente[codCli] || {};
    var cv = clienteVenta[codCli]       || {};
    var codAs = cv.cod_asesor || m.cod_asesor || '';
    clientes.push({
      cod_cliente:          codCli,
      nombre_cliente:       m.nombre     || '',
      cod_asesor:           codAs,
      vendedor:             cv.vendedor  || m.asesor_raw || '',
      sede:                 sedeMap[codAs] || '',
      venta_total_periodo:  round2_(cv.venta_total || 0),
      ultima_compra:        cv.ultima_compra || ''
    });
  });

  clientes.sort(function(a, b) { return b.venta_total_periodo - a.venta_total_periodo; });

  return { total: clientes.length, clientes: clientes };
}

// ── Endpoint: detalle por producto clave ──────────────────────────
function getProductosClaveDetalle_() {
  var pc          = cargarProductosClave_();
  var sapClaveSet = new Set(Object.keys(pc.claveMap));
  var maestro     = cargarMaestroActivos_();
  var base        = getBasePeriodoActual_();

  var sapDataMap  = {};  // sap → { clientes:Set, venta, unidades, vendedores:Set }

  base.forEach(function(r) {
    var codCli  = normalizarCodigoCliente_(r[1]);
    var codAs   = obtenerCodAsesor_(String(r[3] || '').trim());
    var nomVend = String(r[4]  || '').trim();
    var sap     = limpiarSap_(r[6]);
    var cant    = parseFloat(r[13]) || 0;
    var venta   = parseFloat(r[14]) || 0;

    if (!sap || !sapClaveSet.has(sap)) return;
    if (venta <= 0 || !maestro.activosSet.has(codCli)) return;
    if (!esVendedorValido_(codAs, nomVend)) return;

    if (!sapDataMap[sap]) sapDataMap[sap] = { clientes: new Set(), venta: 0, unidades: 0, vendedores: new Set() };
    sapDataMap[sap].clientes.add(codCli);
    sapDataMap[sap].venta    += venta;
    sapDataMap[sap].unidades += Math.max(cant, 0);
    sapDataMap[sap].vendedores.add(codAs);
  });

  var productos = Object.keys(pc.claveMap).map(function(sap) {
    var info = pc.claveMap[sap];
    var d    = sapDataMap[sap] || {};
    return {
      sap:                  sap,
      nombre:               info.nombre,
      detalle:              info.detalle,
      negocio:              info.negocio,
      clientes_impactados:  d.clientes  ? d.clientes.size   : 0,
      venta:                round2_(d.venta || 0),
      unidades:             Math.round(d.unidades || 0),
      vendedores_impactando: d.vendedores ? d.vendedores.size : 0
    };
  }).sort(function(a, b) {
    return b.clientes_impactados - a.clientes_impactados || b.venta - a.venta;
  });

  return { productos: productos };
}

// ════════════════════════════════════════════════════════════════════
// COMBOS
// Lee la hoja COMBOS (SAP|PRODUCTO|NEGOCIO|META_UNIDADES|META_CLIENTES|ACTIVO)
// y cruza contra BASE_ACUMULADA para medir gestión comercial de combos.
// ════════════════════════════════════════════════════════════════════

/**
 * Lee la hoja COMBOS y devuelve array de combos activos.
 * Normaliza SAP igual que el resto del sistema (limpiarSap_).
 */
function cargarCombosActivos_() {
  var filas = sheetToJSON(HOJAS.COMBOS);
  if (!filas.length) return [];
  return filas.filter(function(r) {
    return normalizarTexto_(r.activo || r.ACTIVO || '') === 'SI';
  }).map(function(r) {
    return {
      sap:           limpiarSap_(r.sap),
      producto:      String(r.producto      || '').trim(),
      negocio:       String(r.negocio       || '').trim(),
      meta_unidades: parseFloat(String(r.meta_unidades || '0').replace(/[,$]/g, '')) || 0,
      meta_clientes: parseFloat(String(r.meta_clientes || '0').replace(/[,$]/g, '')) || 0,
    };
  }).filter(function(r) { return r.sap; });
}

// Endpoint ?sheet=combos — lista de combos activos
function getCombos_() {
  var combos = cargarCombosActivos_();
  return {
    total_combos: combos.length,
    combos: combos.map(function(c) {
      return {
        sap:           c.sap,
        producto:      c.producto,
        negocio:       c.negocio,
        meta_unidades: c.meta_unidades,
        meta_clientes: c.meta_clientes,
        activo:        'SI'
      };
    })
  };
}

/**
 * Helper compartido: cruza BASE_ACUMULADA con combos activos.
 * Devuelve estructuras pre-calculadas para los 3 endpoints de combos.
 */
function calcularCombosBase_() {
  var combos  = cargarCombosActivos_();
  var base    = getBasePeriodoActual_();
  var sedeMap = cargarSedeMap_();

  var combosSet = new Set(combos.map(function(c) { return c.sap; }));
  var comboInfo = {};  // sap → { producto, negocio, meta_unidades, meta_clientes }
  combos.forEach(function(c) { comboInfo[c.sap] = c; });

  // Acumuladores globales
  var clientesImpactados = new Set();
  var unidadesVendidas   = 0;
  var ventaCombos        = 0;
  var sapVendido         = new Set();

  // Por vendedor: cod_asesor → acumuladores
  var vendMap = {};  // cod → { nombre, sede, clientes:Set, unidades, venta, saps:Set }

  // Por SAP: sap → { clientes:Set, unidades, venta }
  var sapMap = {};

  var sapInvalido    = 0;
  var sapNoCombo     = 0;

  base.forEach(function(r) {
    var codCli  = normalizarCodigoCliente_(r[1]);
    var codAs   = obtenerCodAsesor_(String(r[3] || '').trim());
    var nomVend = String(r[4]  || '').trim();
    var sap     = limpiarSap_(r[6]);
    var cant    = parseFloat(r[13]) || 0;
    var venta   = parseFloat(r[14]) || 0;

    if (!codAs || !nomVend || !esVendedorValido_(codAs, nomVend)) return;
    if (venta <= 0) return;

    if (!sap)              { sapInvalido++; return; }
    if (!combosSet.has(sap)) { sapNoCombo++;   return; }

    // Acumuladores globales
    clientesImpactados.add(codCli);
    unidadesVendidas += Math.max(cant, 0);
    ventaCombos      += venta;
    sapVendido.add(sap);

    // Por vendedor
    if (!vendMap[codAs]) {
      var sede = String(sedeMap[codAs] || '').trim();
      vendMap[codAs] = {
        nombre: nomVend,
        sede:   sede,
        clientes: new Set(),
        unidades: 0,
        venta:    0,
        saps:     new Set()
      };
    }
    vendMap[codAs].clientes.add(codCli);
    vendMap[codAs].unidades += Math.max(cant, 0);
    vendMap[codAs].venta    += venta;
    vendMap[codAs].saps.add(sap);

    // Por SAP
    if (!sapMap[sap]) sapMap[sap] = { clientes: new Set(), unidades: 0, venta: 0 };
    sapMap[sap].clientes.add(codCli);
    sapMap[sap].unidades += Math.max(cant, 0);
    sapMap[sap].venta    += venta;
  });

  // Totales de metas
  var metaUnidadesTotal = combos.reduce(function(s, c) { return s + c.meta_unidades; }, 0);
  var metaClientesTotal = combos.reduce(function(s, c) { return s + c.meta_clientes; }, 0);

  Logger.log('[COMBOS] total combos activos=' + combos.length);
  Logger.log('[COMBOS] SAP combos set size=' + combosSet.size);
  Logger.log('[COMBOS] clientes impactados=' + clientesImpactados.size);
  Logger.log('[COMBOS] unidades vendidas=' + Math.round(unidadesVendidas));
  Logger.log('[COMBOS] venta combos=' + round2_(ventaCombos));
  Logger.log('[COMBOS] sap_invalido=' + sapInvalido + '  sap_no_combo=' + sapNoCombo);
  if (combos.length > 0) Logger.log('[COMBOS] primer combo=' + JSON.stringify(combos[0]));

  // Debug si no cruzó nada
  if (clientesImpactados.size === 0 && base.length > 0) {
    var primerSapCombo = combos.slice(0, 3).map(function(c) { return c.sap; });
    var primerSapBase  = base.slice(0, 3).map(function(r) { return limpiarSap_(r[6]); });
    Logger.log('[COMBOS][DEBUG] sin cruces — SAP combos: ' + primerSapCombo.join(', '));
    Logger.log('[COMBOS][DEBUG] SAP en BASE: ' + primerSapBase.join(', '));
  }

  return {
    combos:            combos,
    comboInfo:         comboInfo,
    clientesImpactados: clientesImpactados,
    unidadesVendidas:  unidadesVendidas,
    ventaCombos:       ventaCombos,
    sapVendido:        sapVendido,
    vendMap:           vendMap,
    sapMap:            sapMap,
    metaUnidadesTotal: metaUnidadesTotal,
    metaClientesTotal: metaClientesTotal
  };
}

// Endpoint ?sheet=combos_resumen — KPIs gerenciales globales
function getCombosResumen_() {
  var c = calcularCombosBase_();
  var imp  = c.clientesImpactados.size;
  var uni  = Math.round(c.unidadesVendidas);
  var vent = round2_(c.ventaCombos);
  var cumplUni = c.metaUnidadesTotal > 0 ? round2_(uni  / c.metaUnidadesTotal * 100) : 0;
  var cumplCli = c.metaClientesTotal > 0 ? round2_(imp  / c.metaClientesTotal * 100) : 0;
  return {
    clientes_impactados:       imp,
    unidades_vendidas:         uni,
    venta_combos:              vent,
    meta_unidades_total:       Math.round(c.metaUnidadesTotal),
    meta_clientes_total:       Math.round(c.metaClientesTotal),
    cumplimiento_unidades_pct: cumplUni,
    cumplimiento_clientes_pct: cumplCli,
    combos_vendidos:           c.sapVendido.size,
    combos_sin_venta:          c.combos.length - c.sapVendido.size,
    total_combos_activos:      c.combos.length
  };
}

// Endpoint ?sheet=combos_vendedor — ranking por vendedor
function getCombosVendedor_() {
  var c = calcularCombosBase_();
  var maestro = cargarMaestroActivos_();  // byAsesor → { cod: Set<cod_cliente> }

  // Totales reales del equipo para calcular % de contribución por vendedor.
  // NO se divide la meta global entre vendedores — esa lógica generaba porcentajes
  // ficticios (ej. 280%) porque la hoja COMBOS solo tiene metas de equipo, no por vendedor.
  var totalUniEquipo = Math.round(c.unidadesVendidas) || 1;
  var totalCliEquipo = c.clientesImpactados.size      || 1;

  var vendedores = Object.keys(c.vendMap).map(function(cod) {
    var v    = c.vendMap[cod];
    var imp  = v.clientes.size;
    var uni  = Math.round(v.unidades);
    var vent = round2_(v.venta);

    // % contribución: qué parte del total de combos del equipo aportó este vendedor
    var pctUni = round2_(uni  / totalUniEquipo * 100);
    var pctCli = round2_(imp  / totalCliEquipo * 100);

    // Total de clientes asignados al vendedor en su maestro activo
    var totalCli = (maestro.byAsesor[cod] || new Set()).size;
    var cobCombos = totalCli > 0 ? round2_(imp / totalCli * 100) : 0;

    return {
      cod_asesor:                cod,
      vendedor:                  cod + ' - ' + v.nombre,
      sede:                      v.sede,
      clientes_impactados:       imp,
      total_clientes_vendedor:   totalCli,
      cobertura_combos_pct:      cobCombos,
      unidades_vendidas:         uni,
      venta_combos:              vent,
      pct_contribucion_clientes: pctCli,
      pct_contribucion_unidades: pctUni
    };
  }).sort(function(a, b) {
    return (b.unidades_vendidas - a.unidades_vendidas)
        || (b.clientes_impactados - a.clientes_impactados)
        || (b.venta_combos - a.venta_combos);
  });

  return { vendedores: vendedores };
}

// Endpoint ?sheet=combos_detalle — desglose por producto/SAP
function getCombosDetalle_() {
  var c = calcularCombosBase_();

  var productos = c.combos.map(function(combo) {
    var d       = c.sapMap[combo.sap] || {};
    var imp     = d.clientes ? d.clientes.size : 0;
    var uni     = Math.round(d.unidades || 0);
    var vent    = round2_(d.venta || 0);
    var cumplUni = combo.meta_unidades > 0 ? round2_(uni / combo.meta_unidades * 100) : 0;
    var cumplCli = combo.meta_clientes > 0 ? round2_(imp / combo.meta_clientes * 100) : 0;
    return {
      sap:                       combo.sap,
      producto:                  combo.producto,
      negocio:                   combo.negocio,
      clientes_impactados:       imp,
      unidades_vendidas:         uni,
      venta_combos:              vent,
      meta_unidades:             combo.meta_unidades,
      meta_clientes:             combo.meta_clientes,
      cumplimiento_unidades_pct: cumplUni,
      cumplimiento_clientes_pct: cumplCli
    };
  }).sort(function(a, b) {
    return (b.clientes_impactados - a.clientes_impactados) || (b.venta_combos - a.venta_combos);
  });

  return { productos: productos };
}

// Endpoint ?sheet=combos_vendedor_detalle
// Desglose por vendedor + productos vendidos por ese vendedor.
// Sin metas ni cumplimiento — solo ejecución real (para Mi Panel).
function getCombosVendedorDetalle_() {
  var combos  = cargarCombosActivos_();
  var base    = getBasePeriodoActual_();
  var sedeMap = cargarSedeMap_();

  var combosSet = new Set(combos.map(function(c) { return c.sap; }));
  var comboInfo = {};
  combos.forEach(function(c) { comboInfo[c.sap] = c; });

  // vendMap: cod → { nombre, sede, clientes:Set, unidades, venta,
  //                  sapMap: { sap → { clientes:Set, unidades, venta } } }
  var vendMap = {};

  base.forEach(function(r) {
    var codCli  = normalizarCodigoCliente_(r[1]);
    var codAs   = obtenerCodAsesor_(String(r[3] || '').trim());
    var nomVend = String(r[4]  || '').trim();
    var sap     = limpiarSap_(r[6]);
    var cant    = parseFloat(r[13]) || 0;
    var venta   = parseFloat(r[14]) || 0;

    if (!codAs || !nomVend || !esVendedorValido_(codAs, nomVend)) return;
    if (venta <= 0) return;
    if (!sap || !combosSet.has(sap)) return;

    if (!vendMap[codAs]) {
      vendMap[codAs] = {
        nombre:  nomVend,
        sede:    String(sedeMap[codAs] || '').trim(),
        clientes: new Set(),
        unidades: 0,
        venta:    0,
        sapMap:   {}
      };
    }
    vendMap[codAs].clientes.add(codCli);
    vendMap[codAs].unidades += Math.max(cant, 0);
    vendMap[codAs].venta    += venta;

    var sm = vendMap[codAs].sapMap;
    if (!sm[sap]) sm[sap] = { clientes: new Set(), unidades: 0, venta: 0 };
    sm[sap].clientes.add(codCli);
    sm[sap].unidades += Math.max(cant, 0);
    sm[sap].venta    += venta;
  });

  var vendedores = Object.keys(vendMap).map(function(cod) {
    var v = vendMap[cod];

    var productos = Object.keys(v.sapMap).map(function(sap) {
      var s    = v.sapMap[sap];
      var info = comboInfo[sap] || {};
      return {
        sap:                 sap,
        producto:            info.producto || sap,
        negocio:             info.negocio  || '',
        clientes_impactados: s.clientes.size,
        unidades_vendidas:   Math.round(s.unidades),
        venta_combos:        round2_(s.venta)
      };
    }).sort(function(a, b) {
      return (b.unidades_vendidas - a.unidades_vendidas) || (b.venta_combos - a.venta_combos);
    });

    return {
      cod_asesor:                 cod,
      vendedor:                   cod + ' - ' + v.nombre,
      sede:                       v.sede,
      clientes_impactados_combos: v.clientes.size,
      unidades_vendidas:          Math.round(v.unidades),
      venta_combos:               round2_(v.venta),
      productos:                  productos
    };
  }).sort(function(a, b) {
    return (b.unidades_vendidas - a.unidades_vendidas) || (b.venta_combos - a.venta_combos);
  });

  return { vendedores: vendedores };
}
