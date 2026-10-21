import { getEanMapping, saveEanMapping, asociarEanAProducto } from '../data/productUtils';
import { llamarAppsScript } from './mercaderiaApi';

/**
 * CAPA DE ACCESO UNIFICADA PARA MAPA DE CÓDIGOS EAN
 * 
 * PROPUESTA DE CONTRATO PARA EL APPS SCRIPT:
 * 1) Lectura:
 *    Acción: 'getMapaEan'
 *    Payload request: { accion: 'getMapaEan' }
 *    Respuesta esperada: { ok: true, mapa: { [ean]: { ean, productoId, nombre, subcategoria, unidad, actualizadoEl } } }
 * 
 * 2) Escritura:
 *    Acción: 'setEanProducto'
 *    Payload request: { accion: 'setEanProducto', ean, productoId, nombre, subcategoria, unidad }
 *    Respuesta esperada: { ok: true }
 */

export const ACCION_PROPUESTA_EAN_GET = 'getMapaEan';
export const ACCION_PROPUESTA_EAN_SET = 'setEanProducto';

/**
 * Lee el mapa de EAN desde Google Sheets vía Apps Script.
 * Si el backend aún no implementa la acción o hay error de conexión,
 * recurre al almacenamiento local como fallback transparente.
 */
export async function cargarMapaEan() {
  try {
    const res = await llamarAppsScript(ACCION_PROPUESTA_EAN_GET, {}, 8000);
    if (res && res.ok && res.mapa && typeof res.mapa === 'object') {
      // Guardar copia local en caso de desconexión futura
      saveEanMapping(res.mapa);
      return { ok: true, mapa: res.mapa, origen: 'sheet' };
    }
  } catch (err) {
    console.warn('[EAN-SERVICE] No se pudo leer el mapa EAN desde el Sheet, recurriendo a local:', err.message);
  }

  // Fallback transparente
  const localMap = getEanMapping();
  return { ok: true, mapa: localMap, origen: 'local' };
}

/**
 * Asocia un código EAN a un producto y lo persiste en Google Sheets vía Apps Script.
 */
export async function guardarAsociacionEan(ean, itemData) {
  const cleanEan = String(ean).trim().toUpperCase();

  // 1. Guardar en memoria/local primero para reactividad instantánea en pantalla
  const localEntry = asociarEanAProducto(cleanEan, itemData);

  // 2. Persistir en Google Sheets
  try {
    const res = await llamarAppsScript(ACCION_PROPUESTA_EAN_SET, {
      ean: cleanEan,
      productoId: itemData.productoId || null,
      nombre: itemData.nombre,
      subcategoria: itemData.subcategoria || 'Almacén',
      unidad: itemData.unidad || 'unidad',
      actualizadoEl: new Date().toISOString(),
    }, 10000);

    if (res && res.ok) {
      return { ok: true, entry: localEntry, persistidoEnSheet: true };
    } else {
      return { 
        ok: true, 
        entry: localEntry, 
        persistidoEnSheet: false, 
        aviso: res?.error || 'No se pudo guardar en el Sheet aún; se mantiene guardado localmente.' 
      };
    }
  } catch (err) {
    return {
      ok: true,
      entry: localEntry,
      persistidoEnSheet: false,
      aviso: `Error de red al guardar en Sheet: ${err.message}`,
    };
  }
}
