/**
 * balanceStock.js
 * Cálculo de balance exacto por producto en gramos enteros internamente.
 * Evita cualquier distorsión por coma flotante IEEE-754 (ej. 0.1 + 0.2).
 */

export const aGramos = (kg) => Math.round(Number(kg || 0) * 1000);
export const aKilos = (gramos) => Number((gramos / 1000).toFixed(3));

/**
 * Calcula el balance exacto de stock de un producto.
 * @param {Object} params
 * @param {string} params.producto
 * @param {number|Array<number>} params.ingresado - kg ingresados o lista de ingresos
 * @param {number|Array<number>} params.vendido - kg vendidos en pedidos
 * @param {number|Array<number>} params.hogar - kg consumidos en el hogar
 * @param {number|Array<number>} params.merma - kg mermados
 * @param {number} params.deposito - kg actuales en depósito
 * @param {number} [params.costo_unitario] - costo por kg para valorizar merma
 */
export function calcularBalanceProducto({
  producto,
  ingresado = 0,
  vendido = 0,
  hogar = 0,
  merma = 0,
  deposito = 0,
  costo_unitario = 0
}) {
  const sumarGramos = (val) => {
    if (Array.isArray(val)) {
      return val.reduce((acc, v) => acc + aGramos(v), 0);
    }
    return aGramos(val);
  };

  const ingresado_g = sumarGramos(ingresado);
  const vendido_g = sumarGramos(vendido);
  const hogar_g = sumarGramos(hogar);
  const merma_g = sumarGramos(merma);
  const deposito_g = aGramos(deposito);

  // Egresos totales + remanente en depósito
  const total_salidas_y_deposito_g = vendido_g + hogar_g + merma_g + deposito_g;

  // Diferencia esperada: ingresado - (vendido + hogar + merma + deposito) === 0
  const diferencia_g = ingresado_g - total_salidas_y_deposito_g;

  const merma_kg = aKilos(merma_g);
  const valor_merma_pesos = Number((merma_kg * Number(costo_unitario || 0)).toFixed(2));

  return {
    producto: String(producto || ''),
    ingresado_g,
    vendido_g,
    hogar_g,
    merma_g,
    deposito_g,
    diferencia_g,

    ingresado: aKilos(ingresado_g),
    vendido: aKilos(vendido_g),
    hogar: aKilos(hogar_g),
    merma: merma_kg,
    deposito: aKilos(deposito_g),
    diferencia: aKilos(diferencia_g),

    valor_merma_pesos,
    esExacto: diferencia_g === 0
  };
}
