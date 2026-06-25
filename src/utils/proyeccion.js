// Fuente única de la "proyección de cierre" — usada por Gerencial.jsx (Proyección
// vs Meta PALMA) y MiGerencia.jsx (Proyección vs Meta ECOM). Antes cada panel
// calculaba su propio factor de días hábiles por una vía distinta (Gerencial:
// días transcurridos reales hasta hoy; Mi Gerencia: factor pre-calculado en
// Código.js a partir de DIAS_HABILES_RESTANTES) y terminaban en valores
// absolutos distintos para la misma venta neta. Con este util ambos paneles
// reciben el mismo $ de proyección; solo cambia la meta contra la que se compara.

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
 * Proyección de cierre de mes a partir de venta neta + días hábiles transcurridos/totales.
 * @param {number} ventaNeta
 * @param {number} diasHabilesRestantesConfig — CONFIG.DIAS_HABILES_RESTANTES (0 si no disponible)
 * @returns {{proyeccion:number, pctAvance:number, habilesTransc:number, habilesTotal:number} | null}
 */
export function calcularProyeccionCierre(ventaNeta, diasHabilesRestantesConfig = 0) {
  if (!ventaNeta) return null;
  const hoy    = new Date();
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const fin    = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);

  const habilesTransc = diasHabilesEnRango(inicio, hoy);
  if (habilesTransc === 0) return null;

  const habilesTotal = diasHabilesRestantesConfig > 0
    ? habilesTransc + diasHabilesRestantesConfig
    : diasHabilesEnRango(inicio, fin);

  const proyeccion = Math.round(ventaNeta / habilesTransc * habilesTotal);
  const pctAvance  = Math.round(habilesTransc / habilesTotal * 100);
  return { proyeccion, pctAvance, habilesTransc, habilesTotal };
}
