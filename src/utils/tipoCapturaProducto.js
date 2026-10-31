/**
 * tipoCapturaProducto.js
 * 
 * Lógica compartida para determinar el tipo de captura de un producto:
 * - A) PESABLE: Unidad kg (papa, cebolla, tomate, etc.). Se pesa en balanza (en vivo)
 *      y el botón OK congela exactamente el peso en gramos. Corregir reabre el renglón.
 * - B) UNIDAD_MANUAL: Verduras y frutas por unidad o atado SIN código de barras (choclo,
 *      lechuga, perejil, albahaca, etc.). NO se pesan. Renglón con cantidad pedida por
 *      defecto y control manual (+ / - / número) con botón OK que lo pone en verde.
 * - C) ALMACEN_EAN: Almacén con código de barras (EAN). Escaneo con pistola automático;
 *      cada clink suma 1 unidad. Se pone en verde automáticamente al llegar a la cantidad,
 *      sin botón OK.
 */

import { getEanMapping } from '../data/productUtils.js';
import { norm, sonNombresEquivalentes, esUnidadManual, esUnidadPesable } from './productNorm.js';

export { norm, sonNombresEquivalentes, esUnidadManual, esUnidadPesable };

export const TIPOS_CAPTURA = {
  PESABLE: 'PESABLE',
  UNIDAD_MANUAL: 'UNIDAD_MANUAL',
  ALMACEN_EAN: 'ALMACEN_EAN'
};

/**
 * Determina el tipo de captura de un producto o ítem de pedido.
 * Utiliza únicamente los campos existentes (unidad, ean, nombre, categoría), sin inventar nuevos.
 * 
 * @param {Object} item - Producto del catálogo o ítem del pedido
 * @param {Object} [catalogoRef] - Diccionario opcional de productos para fallback de unidad/ean
 * @returns {'PESABLE'|'UNIDAD_MANUAL'|'ALMACEN_EAN'}
 */
// Lista de respaldo para detección de Tipo B por nombre (solo cuando el catálogo no especifica unidad de unidad/atado)
export const PALABRAS_RESPALDO_NOMBRE_TIPO_B = [
  'choclo', 'lechuga', 'perejil', 'rabanito', 'verdeo', 
  'albahaca', 'rucula', 'ciboulette', 'radicheta', 'acelga', 
  'espinaca', 'apio', 'puerro'
];

/**
 * Analiza exhaustivamente el tipo de captura de un producto o ítem.
 * Prioriza siempre la unidad del catálogo; la lista de nombres es solo respaldo.
 * 
 * @param {Object} item - Producto del catálogo o ítem del pedido
 * @param {Object} [catalogoRef] - Diccionario opcional de productos para fallback de unidad/ean
 * @returns {{ tipo: 'PESABLE'|'UNIDAD_MANUAL'|'ALMACEN_EAN', deducidoPorNombre: boolean, aviso: string | null }}
 */
export function analizarTipoCaptura(item, catalogoRef = null) {
  if (!item) {
    return { tipo: TIPOS_CAPTURA.PESABLE, deducidoPorNombre: false, aviso: null };
  }

  const nombre = String(item.nombre || item.producto || '').trim();
  const nombreNorm = norm(nombre);

  // 1. TIPO C: ALMACÉN CON CÓDIGO DE BARRAS (EAN)
  const eanDirecto = item.ean || item.barcode || item.codigo_barras;
  if (eanDirecto && String(eanDirecto).trim().length >= 7) {
    return { tipo: TIPOS_CAPTURA.ALMACEN_EAN, deducidoPorNombre: false, aviso: null };
  }

  try {
    const eanMap = getEanMapping();
    if (eanMap && typeof eanMap === 'object') {
      const matchEan = Object.values(eanMap).some(m => sonNombresEquivalentes(m?.nombre, nombre));
      if (matchEan) {
        return { tipo: TIPOS_CAPTURA.ALMACEN_EAN, deducidoPorNombre: false, aviso: null };
      }
    }
  } catch (e) {}

  let unidadCatalogo = null;
  if (catalogoRef) {
    let prodCat = null;
    if (typeof catalogoRef === 'object') {
      if (catalogoRef[nombreNorm]) {
        prodCat = catalogoRef[nombreNorm];
      } else if (Array.isArray(catalogoRef)) {
        prodCat = catalogoRef.find(p => sonNombresEquivalentes(p.nombre || p.producto, nombre));
      } else {
        const foundKey = Object.keys(catalogoRef).find(k => sonNombresEquivalentes(catalogoRef[k]?.nombre || k, nombre));
        if (foundKey) prodCat = catalogoRef[foundKey];
      }
    }
    if (prodCat) {
      if (prodCat.ean && String(prodCat.ean).trim().length >= 7) {
        return { tipo: TIPOS_CAPTURA.ALMACEN_EAN, deducidoPorNombre: false, aviso: null };
      }
      unidadCatalogo = prodCat.unidad;
    }
  }

  // 2. TIPO B: POR UNIDAD O ATADO (PRIMERO: UNIDAD DEL CATÁLOGO)
  const unidadPropia = String(item.unidad || unidadCatalogo || '').trim();

  if (esUnidadManual(unidadPropia)) {
    return { tipo: TIPOS_CAPTURA.UNIDAD_MANUAL, deducidoPorNombre: false, aviso: null };
  }

  // 3. RESPALDO POR NOMBRE: solo si la unidad en catálogo no es pesable explícito y coincide con la lista
  const esPesableExplicito = esUnidadPesable(unidadPropia);
  
  if (!esPesableExplicito) {
    const regexRespaldo = new RegExp(`\\b(${PALABRAS_RESPALDO_NOMBRE_TIPO_B.join('|')})\\b`, 'i');
    if (regexRespaldo.test(nombreNorm)) {
      return {
        tipo: TIPOS_CAPTURA.UNIDAD_MANUAL,
        deducidoPorNombre: true,
        aviso: 'Tipo deducido por nombre: revisar la unidad en el catálogo'
      };
    }
  }

  // 4. TIPO A: PESABLES (por defecto todo lo que es 'kg' o verdura/fruta pesable)
  return { tipo: TIPOS_CAPTURA.PESABLE, deducidoPorNombre: false, aviso: null };
}

/**
 * Determina el tipo de captura de un producto o ítem de pedido.
 * Retorna directamente el string del tipo ('PESABLE'|'UNIDAD_MANUAL'|'ALMACEN_EAN').
 * 
 * @param {Object} item - Producto del catálogo o ítem del pedido
 * @param {Object} [catalogoRef] - Diccionario opcional de productos para fallback de unidad/ean
 * @returns {'PESABLE'|'UNIDAD_MANUAL'|'ALMACEN_EAN'}
 */
export function determinarTipoCaptura(item, catalogoRef = null) {
  return analizarTipoCaptura(item, catalogoRef).tipo;
}

/**
 * Normaliza la etiqueta legible de la unidad para mostrar en UI y remitos.
 * @param {string} unidad
 * @param {number} cantidad
 */
export function etiquetaUnidad(unidad, cantidad = 1) {
  const u = String(unidad || '').toLowerCase().trim();
  if (esUnidadPesable(u)) return 'kg';
  if (/atado/i.test(u)) return cantidad === 1 ? 'atado' : 'atados';
  if (/maple/i.test(u)) return cantidad === 1 ? 'maple' : 'maples';
  return cantidad === 1 ? 'unidad' : 'unidades';
}
