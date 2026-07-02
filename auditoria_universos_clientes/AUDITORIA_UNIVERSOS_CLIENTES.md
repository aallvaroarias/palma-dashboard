# Auditoría de Universos de Clientes PALMA

**Fecha:** 2026-07-02  
**Propósito:** Explicar los tres denominadores distintos que aparecen en el dashboard (≈ 2 608 / 2 670 / 2 674).

> ⚠️ Documento de solo lectura. No se modificó ninguna hoja ni fórmula.

---

## 1. Universos en el estado ACTUAL de MAESTRO_CLIENTES

| Fuente / Función | Universo | Filtros aplicados | Excluidos |
|---|---:|---|---:|
| **MAESTRO_CLIENTES total** (filas) | 2.674 | Ninguno — todas las filas con codCli válido | — |
| **MAESTRO estado='A'** | 2.674 | `estado = 'A'` | — |
| **`cargarMaestroActivos_()`** | 2.673 | + excluye asesores BODEGA/BOD100 | 1 |
| **`calcularCobertura()`** (único) | 2.611 | + asesor con código numérico de 3 dígitos | 62 |
| **RESUMEN_COBERTURA** (precalculado) | 2.611 | Último resultado escrito por `calcularCobertura()` | — |

---

## 2. Explicación de cada diferencia

### 2.1  2.674 → 2.673  (1 cliente excluido)

`cargarMaestroActivos_()` excluye a los clientes cuyo asesor es BODEGA o BOD100.

| Cod. cliente | Nombre | Asesor |
|---|---|---|
| 9000000016450 | ALIMENTOS CARNICOS DE PANAMÁ S.A. | BOD100 - BODEGA 100 |

### 2.2  2.673 → 2.611  (62 clientes excluidos)

`calcularCobertura()` requiere que el código de asesor sea exactamente 3 dígitos numéricos.
Los 62 clientes excluidos tienen el campo asesor con el valor **"-"** (guión),
lo que `obtenerCodAsesor_()` normaliza como código vacío — no pasa el test `/^\d{3}$/`.

Esto significa que 62 clientes activos **no están asignados a ningún vendedor de campo**.
Están en MAESTRO con estado='A' pero con asesor='-': son clientes huérfanos.

**Archivo:** `CLIENTES_COD_NO_3DIGITS.csv` (contiene los 62 códigos de cliente)

### 2.3  Sin duplicados de multi-asesor

`calcularCobertura()` suma Sets por asesor. Diferencia suma vs únicos: 0.
Ningún cliente aparece asignado a dos asesores válidos simultáneamente. No hay inflación por este motivo.

---

## 3. Diagnóstico de integridad

| Condición | Cantidad |
|---|---:|
| Total filas MAESTRO_CLIENTES | 2.674 |
| Todos son estado='A' | 2.674 |
| Clientes asignados a BODEGA/BOD100 | 1 |
| Clientes sin asesor (campo vacío) | 0 |
| Clientes con asesor='-' (huérfanos) | 62 |
| Clientes con asesor sin ventas en BASE_ACUMULADA | 0 |
| Códigos de cliente duplicados en MAESTRO | 0 |
| Asesores con ventas en BASE_ACUMULADA | 14 |

---

## 4. Respuestas a las 10 preguntas de auditoría

**1. ¿De dónde salen los 2.674 clientes?**  
Son TODAS las filas de MAESTRO_CLIENTES (actualmente 2.674 filas).
El 100 % tiene estado='A'. Es el universo sin ningún filtro.

**2. ¿De dónde salen los ≈2.670 clientes?** (hoy 2.673)  
`cargarMaestroActivos_()` aplica un único filtro sobre 2.674: excluye clientes asignados a BODEGA/BOD100.
Hoy hay 1 cliente BODEGA → universo = 2.673.
La diferencia de 1 respecto al valor histórico (2.670) se debe a cambios en MAESTRO desde la última captura.

**3. ¿De dónde salen los ≈2.608 clientes?** (hoy 2.611)  
`calcularCobertura()` aplica dos filtros adicionales: código de asesor 3 dígitos + asesor activo en BASE_ACUMULADA.
Hoy excluye 62 clientes con asesor='-' → universo = 2.611.
La diferencia de 62 es exactamente el grupo de clientes huérfanos.

**4. ¿Qué clientes explican la diferencia entre 2.674 y ≈2.670?**  
Solo 1 cliente: **ALIMENTOS CARNICOS DE PANAMÁ S.A.** (cod 9000000016450), asignado a BOD100.
Ver `CLIENTES_BODEGA.csv`.

**5. ¿Qué clientes explican la diferencia entre ≈2.670 y ≈2.608?** (hoy 62 clientes)  
Son 62 clientes cuyo campo asesor contiene '-' en lugar de un vendedor real.
`obtenerCodAsesor_('-')` devuelve cadena vacía → no pasa el filtro 3-dígitos de `calcularCobertura()`.
Ver `CLIENTES_COD_NO_3DIGITS.csv`.

**6. ¿Qué filtro está excluyendo clientes?**  
El filtro `!cod || !/^\d{3}$/.test(cod)` en `calcularCobertura()` — los 62 clientes con asesor='-'
quedan fuera del denominador de Cobertura General pero DENTRO del de Cobertura Producto Clave.

**7. ¿Cuál universo debe usarse para cierre de mes?**  
**2.673 (sin BODEGA)** — o alternativamente el total de 2.674.
El cierre de mes debe reflejar todos los clientes activos bajo asesores de campo,
incluyendo los 62 huérfanos que siguen siendo clientes reales aunque no tengan asesor asignado.
Usar 2.674 como denominador es la opción más conservadora y auditable.

**8. ¿Cuál universo debe mostrarse en cobertura general?**  
Debe homologarse a **2.673** (`cargarMaestroActivos_()`).
Actualmente usa {fmt_n(calc_uniq)} que excluye 62 clientes reales por falta de asesor.
Usar el mismo denominador que Cobertura Producto Clave elimina la inconsistencia.

**9. ¿Cuál universo debe mostrarse en cobertura producto clave?**  
Mantener **2.673** (`cargarMaestroActivos_()`) — ya es el más correcto de los tres.

**10. ¿Qué recomendación concreta haces para el dashboard?**  
Ver sección 5.

---

## 5. Recomendaciones

| # | Hallazgo | Acción recomendada | Impacto |
|---|---|---|---|
| 1 | Cobertura General usa 2.611 y Producto Clave usa 2.673 — denominadores distintos | Hacer que `getCobertura()` lea el total de `cargarMaestroActivos_()` en vez de RESUMEN_COBERTURA | Consistencia visual |
| 2 | 62 clientes activos con asesor='-' (sin vendedor asignado) | Asignar estos clientes a un asesor real en MAESTRO_CLIENTES | Cobertura correcta |
| 3 | 1 cliente asignado a BOD100 (depósito interno) | Reasignar o marcar como inactivo | Limpieza MAESTRO |
| 4 | El denominador de Cierre de Mes debe ser documentado y fijado antes de cada mes | Acordar si se usa 2.674, 2.673 o 2.611 y documentarlo en CONFIG | Trazabilidad |

---

## 6. Conclusión ejecutiva

**El universo oficial para cobertura general debe ser 2.673** (`cargarMaestroActivos_()`).

**El universo oficial para producto clave debe ser 2.673** (ya usa este valor).

**La diferencia entre 2.674, ~2.670 y ~2.608 se explica por:**
- **2.674 → 2.673**: 1 cliente asignado a BOD100 (depósito interno, no vendedor de campo)
- **2.673 → 2.611**: 62 clientes con asesor='-' que `calcularCobertura()` rechaza por no tener código de 3 dígitos

Los 62 clientes con asesor='-' son clientes activos reales sin vendedor asignado.
Su exclusión de la Cobertura General es un **bug de denominador**, no una decisión de negocio.
La acción correcta es asignarlos a un asesor real, o incluirlos explícitamente en el denominador.

---

*Generado por `generar_auditoria_universos.py` · Solo lectura · Sin cambios en producción*
