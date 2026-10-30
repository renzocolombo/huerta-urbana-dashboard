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

export const TIPOS_CAPTURA = {
  PESABLE: 'PESABLE',
  UNIDAD_MANUAL: 'UNIDAD_MANUAL',
  ALMACEN_EAN: 'ALMACEN_EAN'
};

const norm = (s) => (s || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * Determina el tipo de captura de un producto o ítem de pedido.
 * Utiliza únicamente los campos existentes (unidad, ean, nombre, categoría), sin inventar nuevos.
 * 
 * @param {Object} item - Producto del catálogo o ítem del pedido
 * @param {Object} [catalogoRef] - Diccionario opcional de productos para fallback de unidad/ean
 * @returns {'PESABLE'|'UNIDAD_MANUAL'|'ALMACEN_EAN'}
 */
export function determinarTipoCaptura(item, catalogoRef = null) {
  if (!item) return TIPOS_CAPTURA.PESABLE;

  const nombre = String(item.nombre || item.producto || '').trim();
  const nombreNorm = norm(nombre);

  // 1. TIPO C: ALMACÉN CON CÓDIGO DE BARRAS (EAN)
  // Verificar si tiene EAN explícito en el objeto
  const eanDirecto = item.ean || item.barcode || item.codigo_barras;
  if (eanDirecto && String(eanDirecto).trim().length >= 7) {
    return TIPOS_CAPTURA.ALMACEN_EAN;
  }

  // Verificar si está registrado en el mapa de códigos EAN de almacén
  try {
    const eanMap = getEanMapping();
    if (eanMap && typeof eanMap === 'object') {
      const matchEan = Object.values(eanMap).some(m => norm(m?.nombre) === nombreNorm);
      if (matchEan) {
        return TIPOS_CAPTURA.ALMACEN_EAN;
      }
    }
  } catch (e) {}

  // Si se proveyó catálogo de apoyo, consultar si ese producto tiene EAN
  let unidadCatalogo = null;
  if (catalogoRef) {
    let prodCat = null;
    if (typeof catalogoRef === 'object') {
      if (catalogoRef[nombreNorm]) {
        prodCat = catalogoRef[nombreNorm];
      } else if (Array.isArray(catalogoRef)) {
        prodCat = catalogoRef.find(p => norm(p.nombre || p.producto) === nombreNorm);
      } else {
        const foundKey = Object.keys(catalogoRef).find(k => norm(catalogoRef[k]?.nombre || k) === nombreNorm);
        if (foundKey) prodCat = catalogoRef[foundKey];
      }
    }
    if (prodCat) {
      if (prodCat.ean && String(prodCat.ean).trim().length >= 7) {
        return TIPOS_CAPTURA.ALMACEN_EAN;
      }
      unidadCatalogo = prodCat.unidad;
    }
  }

  // 2. TIPO B: POR UNIDAD O POR ATADO SIN CÓDIGO DE BARRAS
  // Resolver unidad del ítem o del catálogo
  let unidad = String(item.unidad || unidadCatalogo || '').toLowerCase().trim();

  // Detección por texto si no vino explícito en las propiedades
  if (!unidad) {
    if (/\b(atados?)\b/i.test(nombreNorm)) {
      unidad = 'atado';
    } else if (/\b(unidad|unidades|un|choclo|lechuga|perejil|albahaca|rucula|ciboulette|radicheta|verdeo|acelga|espinaca atado|apio|puerro)\b/i.test(nombreNorm) && !/\b(kg|kilos?)\b/i.test(nombreNorm)) {
      // Verduras típicas vendidas por atado o unidad cuando no especifican kg
      if (/\b(perejil|albahaca|rucula|ciboulette|radicheta|verdeo|acelga)\b/i.test(nombreNorm)) {
        unidad = 'atado';
      } else {
        unidad = 'unidad';
      }
    }
  }

  const esUnidadOAtado = (
    unidad === 'atado' ||
    unidad === 'atados' ||
    unidad === 'unidad' ||
    unidad === 'unidades' ||
    unidad === 'un' ||
    unidad === 'u' ||
    unidad === 'paquete' ||
    unidad === 'bandeja' ||
    unidad === 'maple' ||
    unidad === 'docena'
  );

  if (esUnidadOAtado) {
    return TIPOS_CAPTURA.UNIDAD_MANUAL;
  }

  // 3. TIPO A: PESABLES (por defecto todo lo que es 'kg' o verdura/fruta pesable)
  return TIPOS_CAPTURA.PESABLE;
}

/**
 * Normaliza la etiqueta legible de la unidad para mostrar en UI y remitos.
 * @param {string} unidad
 * @param {number} cantidad
 */
export function etiquetaUnidad(unidad, cantidad = 1) {
  const u = String(unidad || '').toLowerCase().trim();
  if (u === 'kg' || u === 'kilo' || u === 'kilos') return 'kg';
  if (u === 'atado' || u === 'atados') return cantidad === 1 ? 'atado' : 'atados';
  return cantidad === 1 ? 'unidad' : 'unidades';
}
