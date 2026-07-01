// Fuente única de la "proyección de cierre" para Gerencial.jsx y MiGerencia.jsx.
// Regla:
//   - La proyección absoluta debe ser igual en ambos paneles.
//   - Gerencial compara esa proyección contra Meta PALMA.
//   - Mi Gerencia compara esa misma proyección contra Meta ECOM.
//   - Ningún componente debe recalcular la proyección por separado: ambos
//     deben llamar a calcularProyeccionCierre() de aquí.

/** Cuenta días hábiles (lunes a sábado, excluye domingo) entre dos fechas, inclusive. */
export function diasHabilesEnRango(desde, hasta) {
  let c = 0;
  const d = new Date(desde);
  while (d <= hasta) {
    if (d.getDay() !== 0) c++;
    d.setDate(d.getDate() + 1);
  }
  return c;
}

/**
 * Proyección de cierre de mes a partir de venta neta + días hábiles.
 *
 * Fuente primaria: CONFIG.DIAS_HABILES_MES + CONFIG.DIAS_HABILES_RESTANTES.
 *   diasTranscurridos = diasHabilesMes - diasRestantes
 *   proyeccion        = ventaNeta + (ventaNeta / diasTranscurridos) * diasRestantes
 *
 * Fallback (cuando diasHabilesMes no está configurado): calcula los días
 * desde el 1º del mes actual hasta hoy — solo se usa si la hoja CONFIG
 * no tiene DIAS_HABILES_MES.
 *
 * @param {number} ventaNeta
 * @param {number} diasRestantes  — CONFIG.DIAS_HABILES_RESTANTES
 * @param {number} diasHabilesMes — CONFIG.DIAS_HABILES_MES (0 = no disponible)
 * @returns {{proyeccion:number, pctAvance:number, habilesTransc:number, habilesTotal:number} | null}
 */
export function calcularProyeccionCierre(ventaNeta, diasRestantes = 0, diasHabilesMes = 0) {
  if (!ventaNeta) return null;

  let habilesTotal;
  let habilesTransc;

  if (diasHabilesMes > 0) {
    // Fuente primaria: CONFIG — no depende de la fecha del sistema
    habilesTotal  = diasHabilesMes;
    habilesTransc = diasHabilesMes - diasRestantes;
  } else {
    // Fallback: calcular el total del mes del período desde el calendario.
    // Si estamos en los primeros 5 días del mes y quedan días del período,
    // el dato pertenece al mes anterior (cierre reciente).
    const hoy = new Date();
    const esPrimerosDias = hoy.getDate() <= 5;
    const mesRef = (esPrimerosDias && diasRestantes > 0)
      ? new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
      : new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const inicio = new Date(mesRef.getFullYear(), mesRef.getMonth(), 1);
    const fin    = new Date(mesRef.getFullYear(), mesRef.getMonth() + 1, 0);
    habilesTotal  = diasHabilesEnRango(inicio, fin);
    habilesTransc = habilesTotal - diasRestantes;
  }

  // Si no han transcurrido días (inicio de mes) la proyección es la venta actual
  if (habilesTransc <= 0) {
    return { proyeccion: Math.round(ventaNeta), pctAvance: 0, habilesTransc: 0, habilesTotal };
  }

  // Si no quedan días, el mes ya cerró: la proyección es la venta actual
  if (diasRestantes <= 0) {
    return { proyeccion: Math.round(ventaNeta), pctAvance: 100, habilesTransc, habilesTotal };
  }

  const promedioDiario = ventaNeta / habilesTransc;
  const proyeccion     = Math.round(ventaNeta + promedioDiario * diasRestantes);
  const pctAvance      = Math.round(habilesTransc / habilesTotal * 100);
  return { proyeccion, pctAvance, habilesTransc, habilesTotal };
}
