// src/utils/productNorm.js
// Normalización canónica de nombres de productos y equivalencias.

/**
 * Normaliza un nombre de producto:
 * - Convierte a minúsculas y elimina acentos/diacríticos.
 * - Unifica variaciones de número: "Nº", "N°", "No.", "n°", "no" seguidos de dígito -> "n<digitos>".
 * - Elimina símbolos ordinales sueltos (º, °).
 * - Reemplaza paréntesis por espacios para unificar "Aceite 500ml (Zuelo)" -> "aceite 500ml zuelo".
 * - Colapsa espacios en blanco repetidos.
 * 
 * @param {string} s 
 * @returns {string}
 */
export function norm(s) {
  if (!s) return '';
  let res = String(s).toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Unificar variaciones de "número": Nº1, N°1, No. 1, No 1, n° 1 -> n1
  res = res.replace(/\b(?:n[º°o]\.?|nº|n°)\s*(\d+)\b/gi, 'n$1');
  res = res.replace(/\bn\s+(\d+)\b/gi, 'n$1');
  // Limpiar ordinales sueltos
  res = res.replace(/[º°]/g, '');
  // Tratar paréntesis como separador de palabras
  res = res.replace(/[()]+/g, ' ');
  // Colapsar espacios
  res = res.replace(/\s+/g, ' ').trim();
  return res;
}

/**
 * Normaliza un nombre ignorando cualquier marca o texto entre paréntesis.
 * E.g. "Aceite 500ml (Zuelo)" -> "aceite 500ml"
 * 
 * @param {string} s 
 * @returns {string}
 */
export function normSinMarca(s) {
  if (!s) return '';
  const sinParentesis = String(s).replace(/\([^)]*\)/g, ' ');
  return norm(sinParentesis);
}

/**
 * Evalúa si dos nombres de producto son equivalentes considerando:
 * - Igualdad normalizada exacta: norm(a) === norm(b)
 *   (e.g. "Huevos Nº1" === "Huevos N°1" === "huevos n1")
 * - Equivalencia con o sin marca entre paréntesis:
 *   "Aceite 500ml (Zuelo)" equivale a "Aceite 500ml Zuelo" y a "Aceite 500ml".
 * 
 * @param {string} a 
 * @param {string} b 
 * @returns {boolean}
 */
export function sonNombresEquivalentes(a, b) {
  if (!a || !b) return false;
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return true;

  const nsa = normSinMarca(a);
  const nsb = normSinMarca(b);
  if (nsa && nsb && nsa === nsb) return true;
  if (nsa && nsa === nb) return true;
  if (nsb && na === nsb) return true;

  return false;
}

/**
 * Reconoce si una unidad corresponde a PESABLE (kg, kilo, kilos, g, gr).
 * @param {string} uNorm
 * @returns {boolean}
 */
export function esUnidadPesable(uNorm) {
  if (!uNorm) return false;
  const u = norm(uNorm);
  return /\b(kg|kilos?|g|gr)\b/i.test(u) && !/\b(maple|atado|bandeja|docena|paquete|unidad|uds)\b/i.test(u);
}

/**
 * Reconoce como UNIDAD_MANUAL cualquier unidad que contenga:
 * maple, atado, bandeja, docena, paquete, unidad, un/u/uds (normalizada, sin acentos).
 * "kg", "kilo", "kilos", "g" siguen siendo PESABLE.
 * 
 * @param {string} uNorm 
 * @returns {boolean}
 */
export function esUnidadManual(uNorm) {
  if (!uNorm) return false;
  const u = norm(uNorm);
  if (esUnidadPesable(u)) return false;

  // Contiene cualquiera de las palabras base
  const contienePalabra = /maple|atado|bandeja|docena|paquete|unidad/i.test(u);
  if (contienePalabra) return true;

  // Reconocer un / u / uds como token
  const esTokenUnidad = /\b(un|u|uds)\b/i.test(u) || /\bx?\d+\s*(?:un|u|uds)\b/i.test(u);
  return esTokenUnidad;
}
