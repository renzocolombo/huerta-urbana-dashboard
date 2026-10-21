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
 * El backend responde: { ok, mapa: { <ean>: { ean, productoId, nombre, subcategoria, unidad } }, items: [...] }
 * Se adapta la lectura a ese formato y se sincroniza la copia local.
 */
export async function cargarMapaEan() {
  try {
    const res = await llamarAppsScript(ACCION_PROPUESTA_EAN_GET, {}, 8000);
    if (res && res.ok) {
      const mapa = (res.mapa && typeof res.mapa === 'object') ? { ...res.mapa } : {};
      
      // Si vinieron items en la respuesta, enriquecer el mapa en caso de faltantes
      if (Array.isArray(res.items)) {
        res.items.forEach(it => {
          if (it && it.ean) {
            const clean = String(it.ean).trim().toUpperCase();
            if (!mapa[clean]) {
              mapa[clean] = {
                ean: clean,
                productoId: it.productoId || null,
                nombre: it.nombre,
                subcategoria: it.subcategoria || 'Almacén',
                unidad: it.unidad || 'unidad'
              };
            }
          }
        });
      }

      // Guardar copia local sincronizada
      saveEanMapping(mapa);
      return { ok: true, mapa, items: res.items || Object.values(mapa), origen: 'sheet' };
    }
  } catch (err) {
    console.warn('[EAN-SERVICE] No se pudo leer el mapa EAN desde el Sheet, recurriendo a local:', err.message);
  }

  // Fallback transparente
  const localMap = getEanMapping();
  return { ok: true, mapa: localMap, items: Object.values(localMap), origen: 'local' };
}

/**
 * Asocia un código EAN a un producto y lo persiste en Google Sheets vía Apps Script.
 * El Apps Script responde { ok: true/false, error?: string }.
 * Si ok es false o hay error de red, se muestra el error y NO se da por guardado en localStorage.
 */
export async function guardarAsociacionEan(ean, itemData) {
  const cleanEan = String(ean).trim().toUpperCase();

  try {
    const res = await llamarAppsScript(ACCION_PROPUESTA_EAN_SET, {
      ean: cleanEan,
      productoId: itemData.productoId || null,
      nombre: itemData.nombre,
      subcategoria: itemData.subcategoria || 'Almacén',
      unidad: itemData.unidad || 'unidad',
    }, 10000);

    if (res && res.ok) {
      // SOLO si el Apps Script confirmó ok: true, se persiste en localStorage
      const localEntry = asociarEanAProducto(cleanEan, itemData);
      return { ok: true, entry: localEntry, persistidoEnSheet: true };
    } else {
      const errorMsg = res?.error || 'No se pudo guardar la asociación EAN en Google Sheets (ok: false)';
      console.error(`[EAN-SERVICE] Error al guardar EAN ${cleanEan}:`, errorMsg);
      // NO se guarda en localStorage
      return { 
        ok: false, 
        error: errorMsg,
        persistidoEnSheet: false 
      };
    }
  } catch (err) {
    const errorMsg = `Error de red al guardar en Sheet: ${err.message}`;
    console.error(`[EAN-SERVICE] Error al guardar EAN ${cleanEan}:`, errorMsg);
    // NO se guarda en localStorage
    return {
      ok: false,
      error: errorMsg,
      persistidoEnSheet: false,
    };
  }
}
