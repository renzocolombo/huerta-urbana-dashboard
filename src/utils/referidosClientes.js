/**
 * Utilidades para la gestión de códigos de referidos en Huerta Urbana Dashboard.
 * 
 * Reglas de negocio críticas:
 * 1. El código propio de un cliente se lee EXCLUSIVAMENTE de la hoja Clientes (columna codigo_referido).
 *    NUNCA de la columna codigo_referido de Pedidos, ya que en Pedidos esa columna almacena
 *    el código que el comprador USÓ al comprar (para acreditar a su amigo).
 * 2. El cruce se realiza prioritariamente por UID y secundariamente por email.
 * 3. Si el cliente no tiene código en Clientes, NO se genera uno al azar.
 *    Se muestra el mensaje: "Este cliente todavía no tiene código: se genera cuando inicia sesión en la web"
 *    y se deshabilita el envío.
 * 4. Al enviar el código, el dashboard NUNCA escribe codigo_referido en Pedidos.
 *    Solo actualiza referido_estado = 'Enviado'.
 */

export const MENSAJE_SIN_CODIGO = 'Este cliente todavía no tiene código: se genera cuando inicia sesión en la web';

/**
 * Resuelve el código de referido propio de un cliente cruzando con la hoja Clientes.
 * 
 * @param {Object} cliente - Objeto con datos del cliente ({ uid, email, ... })
 * @param {Array} clientesSheet - Filas de la hoja Clientes
 * @returns {string} Código propio (ej: 'HU-A1B2') o cadena vacía si no existe.
 */
export function obtenerCodigoPropioCliente(cliente, clientesSheet) {
  if (!cliente || !Array.isArray(clientesSheet) || clientesSheet.length === 0) {
    return '';
  }

  const uid = String(cliente.uid || '').trim();
  const email = String(cliente.email || '').toLowerCase().trim();

  // 1. Cruzar por UID si está disponible
  if (uid) {
    const matchUid = clientesSheet.find(cs => {
      const csUid = String(cs.uid || cs.user_id || '').trim();
      return csUid && csUid === uid && Boolean(cs.codigo_referido);
    });
    if (matchUid && matchUid.codigo_referido) {
      return String(matchUid.codigo_referido).trim();
    }
  }

  // 2. Cruzar por email si está disponible
  if (email) {
    const matchEmail = clientesSheet.find(cs => {
      const csEmail = String(cs.email || '').toLowerCase().trim();
      return csEmail && csEmail === email && Boolean(cs.codigo_referido);
    });
    if (matchEmail && matchEmail.codigo_referido) {
      return String(matchEmail.codigo_referido).trim();
    }
  }

  return '';
}

/**
 * Valida si un cliente tiene código propio y puede enviársele.
 * 
 * @param {Object} cliente - Objeto con datos del cliente
 * @param {Array} clientesSheet - Filas de la hoja Clientes
 * @returns {{ puedeEnviar: boolean, codigo: string, motivo: string }}
 */
export function validarEnvioCodigoReferido(cliente, clientesSheet) {
  const codigo = obtenerCodigoPropioCliente(cliente, clientesSheet) || String(cliente?.codigo_referido || '').trim();

  if (!codigo) {
    return {
      puedeEnviar: false,
      codigo: '',
      motivo: MENSAJE_SIN_CODIGO
    };
  }

  return {
    puedeEnviar: true,
    codigo,
    motivo: ''
  };
}

/**
 * Prepara el payload para actualizar el pedido al enviar el código de referido.
 * NUNCA incluye `codigo_referido`. Solo marca `referido_estado: 'Enviado'`.
 * 
 * @returns {{ referido_estado: string }}
 */
export function prepararPayloadReferido() {
  return {
    referido_estado: 'Enviado'
  };
}
