/**
 * Validaciones y utilidades para la configuración del Pedido Mínimo de Compra en PreciosWeb.
 */

export const MONTO_MINIMO_MAXIMO = 1000000;
export const UMBRAL_DOBLE_CONFIRMACION = 10000;

/**
 * Valida un monto para pedido mínimo.
 * @param {any} monto - Monto a validar (string o number)
 * @returns {{ valido: boolean, error?: string, pideDobleConfirmacion: boolean, montoNumero?: number }}
 */
export function validarPedidoMinimo(monto) {
  if (monto === undefined || monto === null || String(monto).trim() === '') {
    return {
      valido: false,
      error: 'El monto no puede estar vacío.',
      pideDobleConfirmacion: false,
    };
  }

  const str = String(monto).trim();
  // Validar si es numérico y no contiene caracteres extraños
  if (!/^-?\d+(\.\d+)?$/.test(str)) {
    return {
      valido: false,
      error: 'El monto debe ser un valor numérico válido.',
      pideDobleConfirmacion: false,
    };
  }

  const num = Number(str);
  if (Number.isNaN(num)) {
    return {
      valido: false,
      error: 'El monto debe ser un valor numérico válido.',
      pideDobleConfirmacion: false,
    };
  }

  if (num < 0) {
    return {
      valido: false,
      error: 'El monto no puede ser negativo.',
      pideDobleConfirmacion: false,
    };
  }

  if (!Number.isInteger(num)) {
    return {
      valido: false,
      error: 'El monto debe ser un número entero (sin centavos).',
      pideDobleConfirmacion: false,
    };
  }

  if (num > MONTO_MINIMO_MAXIMO) {
    return {
      valido: false,
      error: `El monto no puede superar $${MONTO_MINIMO_MAXIMO.toLocaleString('es-AR')}.`,
      pideDobleConfirmacion: false,
    };
  }

  const pideDobleConfirmacion = num < UMBRAL_DOBLE_CONFIRMACION;

  return {
    valido: true,
    montoNumero: num,
    pideDobleConfirmacion,
  };
}

/**
 * Genera el mensaje por defecto asociado a un monto de pedido mínimo.
 * @param {number|string} monto
 * @returns {string}
 */
export function generarMensajeMinimo(monto) {
  const num = Number(monto);
  const formateado = Number.isFinite(num) ? Math.floor(Math.max(0, num)).toLocaleString('es-AR') : '0';
  return `El pedido mínimo es de $${formateado}`;
}

/**
 * Formatea una fecha de última actualización a string legible local (es-AR).
 * @param {string|Date} fechaRaw
 * @returns {string}
 */
export function formatearFechaActualizacion(fechaRaw) {
  if (!fechaRaw) return '—';
  try {
    const d = new Date(fechaRaw);
    if (Number.isNaN(d.getTime())) return String(fechaRaw);
    return d.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }) + ' hs';
  } catch {
    return String(fechaRaw);
  }
}
