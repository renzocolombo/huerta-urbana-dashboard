// ============================================================================
// Helper de Parseo y Formato de Cantidades y Moneda para Remitos (Argentina)
// Huerta Urbana Dashboard
// ============================================================================

/**
 * Parsea cualquier variante de cantidad ingresada o leída de Google Sheets / web:
 * - "4,250" -> 4.25 (coma decimal)
 * - "4.250" -> 4.25 (decimal con 3 cifras, e.g. kg)
 * - "4250 g" / "4250 gr" -> 4.25 kg
 * - "2" -> 2
 * - "0,5" -> 0.5
 * - Números nativos (2.5, 6.5)
 *
 * @param {string|number} raw
 * @param {string} [unidadFallback='kg']
 * @returns {{ valor: number, unidad: 'kg'|'un'|'atado' }}
 */
export function parsearCantidad(raw, unidadFallback = 'kg') {
  if (raw === null || raw === undefined || raw === '') {
    return { valor: 0, unidad: unidadFallback };
  }

  // Si ya es número nativo
  if (typeof raw === 'number') {
    if (isNaN(raw)) return { valor: 0, unidad: unidadFallback };
    // Caso especial de serial date de Google Sheets (> 40000, e.g. 46148):
    // No debería llegar acá si fetchRowsFromSheet priorizó cell.f, pero si llega:
    return { valor: raw, unidad: unidadFallback };
  }

  let s = String(raw).trim().toLowerCase();

  // 1. Detección de unidad explícita en el texto
  let unidad = null;
  if (/\b(kg|kilos?)\b/i.test(s)) {
    unidad = 'kg';
    s = s.replace(/\b(kg|kilos?)\b/gi, '').trim();
  } else if (/\b(g|gr|gramos?)\b/i.test(s)) {
    unidad = 'kg';
    s = s.replace(/\b(g|gr|gramos?)\b/gi, '').trim();
    const num = parseFloat(s.replace(',', '.'));
    const valKg = isNaN(num) ? 0 : Math.round((num / 1000) * 1000) / 1000;
    return { valor: valKg, unidad: 'kg' };
  } else if (/\b(atados?)\b/i.test(s)) {
    unidad = 'atado';
    s = s.replace(/\b(atados?)\b/gi, '').trim();
  } else if (/\b(u|un|unid|unidades?)\b/i.test(s)) {
    unidad = 'un';
    s = s.replace(/\b(u|un|unid|unidades?)\b/gi, '').trim();
  }

  // 2. Parseo numérico con tolerancia de formato argentino / internacional
  let num = 0;
  if (s.includes(',') && s.includes('.')) {
    // Si tiene ambos: "1.234,50" -> miles punto, decimal coma
    if (s.indexOf('.') < s.indexOf(',')) {
      num = parseFloat(s.replace(/\./g, '').replace(',', '.'));
    } else {
      num = parseFloat(s.replace(/,/g, ''));
    }
  } else if (s.includes(',')) {
    // Coma decimal: "4,250" -> 4.25 | "0,5" -> 0.5
    num = parseFloat(s.replace(',', '.'));
  } else if (s.includes('.')) {
    // Si viene como "4.250" o "6.5" o "4.25"
    // En cantidades de pedidos de verdulería "4.250" representa 4.250 kg (4,25 kg)
    num = parseFloat(s);
  } else {
    num = parseFloat(s);
  }

  const valorFinal = isNaN(num) ? 0 : Math.round(num * 1000) / 1000;
  return {
    valor: valorFinal,
    unidad: unidad || unidadFallback
  };
}

/**
 * Formatea una cantidad con su unidad en formato argentino estándar:
 * - kg: siempre 3 decimales con coma decimal ("4,250 kg", "6,500 kg", "0,500 kg")
 * - un: entero si no tiene decimales ("2 u"), o con coma si es fraccionario ("1,5 u")
 * - atado: "1 atado", "2 atados"
 *
 * @param {number|string} valor
 * @param {string} [unidad='kg']
 * @returns {string}
 */
export function formatearCantidad(valor, unidad = 'kg') {
  const num = typeof valor === 'number' ? valor : parsearCantidad(valor, unidad).valor;
  const u = (unidad || 'kg').toLowerCase().trim();

  if (u === 'kg' || u === 'kilos' || u === 'kilo') {
    const str = num.toLocaleString('es-AR', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    });
    return `${str} kg`;
  }

  if (u === 'atado' || u === 'atados') {
    const cant = Math.round(num);
    return `${cant} atado${cant === 1 ? '' : 's'}`;
  }

  // Unidades ("un", "u")
  if (Number.isInteger(num)) {
    return `${num} u`;
  }
  const str = num.toLocaleString('es-AR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 3,
  });
  return `${str} u`;
}

/**
 * Formatea un monto en pesos argentinos ($ con punto de miles y sin decimales si es entero):
 * 42972 -> "$42.972"
 * -1000 -> "-$1.000"
 * 0     -> "$0"
 *
 * @param {number} monto
 * @returns {string}
 */
export function formatearMoneda(monto) {
  if (monto === null || monto === undefined || isNaN(monto)) return '—';
  const val = Math.round(Number(monto));
  const sign = val < 0 ? '-' : '';
  const absStr = Math.abs(val).toLocaleString('es-AR');
  return `${sign}$${absStr}`;
}

/**
 * Formatea un precio unitario:
 * 6611 -> "$6.611"
 * null / 0 / NaN -> "—"
 *
 * @param {number|null} precio
 * @returns {string}
 */
export function formatearPrecioUnitario(precio) {
  if (precio === null || precio === undefined || isNaN(precio) || Number(precio) <= 0) {
    return '—';
  }
  return formatearMoneda(precio);
}
