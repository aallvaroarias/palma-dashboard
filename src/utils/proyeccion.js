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
