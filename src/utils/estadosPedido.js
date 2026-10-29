// src/utils/estadosPedido.js
// Funciones compartidas únicas para derivar estados reales de Entrega y Pago en todo el dashboard.

import { METODOS_PAGO_CONTRA_ENTREGA, esFormaPagoContraEntrega } from './agendaCalendario.js';
import { estaPedidoArmado } from './remitoPrinter.js';

/**
 * Determina de forma estricta si un pedido fue efectivamente cobrado / pagado.
 * "Cobrado" SOLO si hay monto_cobrado > 0, fecha_cobro, cobrado explícito, medio_cobro real, o estado_pago approved/pagado.
 * Lo elegido por el cliente en checkout (ej: metodo_pago 'efectivo') NO significa cobrado.
 */
export function esPedidoCobrado(p) {
  if (!p) return false;

  const cobradoExplicito = p.cobrado === true || p.cobrado === 'true' || p.cobrado === 'TRUE';
  const tieneMontoCobrado = p.monto_cobrado != null && p.monto_cobrado !== '' && Number(p.monto_cobrado) > 0;
  const tieneFechaCobro = Boolean(p.fecha_cobro && String(p.fecha_cobro).trim() !== '');
  const tieneMedioCobro = Boolean(p.medio_cobro && String(p.medio_cobro).trim() !== '');

  const estadoPago = (p.estado_pago || '').toLowerCase().trim();
  const esPagoAprobado = estadoPago === 'approved' || estadoPago === 'pagado';

  return Boolean(cobradoExplicito || tieneMontoCobrado || tieneFechaCobro || tieneMedioCobro || esPagoAprobado);
}

/**
 * Determina si el pedido fue entregado.
 */
export function esPedidoEntregado(p, estadoOverride) {
  if (!p) return false;
  const est = (estadoOverride || p.estado || '').toLowerCase().trim();
  return est === 'entregado' || est === 'delivered';
}

/**
 * Determina si el pedido fue cancelado.
 */
export function esPedidoCancelado(p, estadoOverride) {
  if (!p) return false;
  const est = (estadoOverride || p.estado || '').toLowerCase().trim();
  if (est === 'cancelado' || est === 'cancelled') return true;
  if (est === 'no_entregado' || est === 'no entregado') {
    const mot = (p.motivo_no_entrega || p.motivo || '').toLowerCase().trim();
    if (mot.includes('cancel')) return true;
  }
  return false;
}

/**
 * Determina si el pedido fue marcado como no entregado (y no cancelado).
 */
export function esPedidoNoEntregado(p, estadoOverride) {
  if (!p) return false;
  if (esPedidoCancelado(p, estadoOverride)) return false;
  const est = (estadoOverride || p.estado || '').toLowerCase().trim();
  if (est === 'no_entregado' || est === 'no entregado') return true;
  return Boolean(p.fecha_no_entrega || p.motivo_no_entrega);
}

/**
 * Determina si el pedido está armado (pesado/armado o detalle_json generado).
 */
export function esPedidoArmado(p, preparacion, estadoOverride) {
  if (!p) return false;
  const est = (estadoOverride || p.estado || '').toLowerCase().trim();
  if (est === 'preparado' || est === 'listo') return true;
  return estaPedidoArmado(p, preparacion);
}

/**
 * Determina si un pedido está pendiente de entrega.
 * Es pendiente si NO está entregado, NO está cancelado, y NO está no entregado.
 */
export function esPedidoPendienteDeEntrega(p, estadoOverride) {
  if (!p) return false;
  if (esPedidoEntregado(p, estadoOverride)) return false;
  if (esPedidoCancelado(p, estadoOverride)) return false;
  if (esPedidoNoEntregado(p, estadoOverride)) return false;
  return true;
}

/**
 * Deriva el estado visual de ENTREGA de un pedido.
 * Devuelve { id, label, color, dot }
 */
export function estadoEntregaPedido(p, preparacion = null, estadoOverride = null) {
  if (!p) {
    return { id: 'desconocido', label: 'Sin datos', color: 'bg-gray-500/15 text-gray-400 border-gray-500/30', dot: 'bg-gray-500' };
  }

  if (esPedidoCancelado(p, estadoOverride)) {
    return { id: 'cancelado', label: 'Cancelado', color: 'bg-red-500/15 text-red-400 border-red-500/30', dot: 'bg-red-500' };
  }

  if (esPedidoEntregado(p, estadoOverride)) {
    return { id: 'entregado', label: 'Entregado', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-500' };
  }

  if (esPedidoNoEntregado(p, estadoOverride)) {
    return { id: 'no_entregado', label: 'No entregado', color: 'bg-rose-500/15 text-rose-400 border-rose-500/30', dot: 'bg-rose-500' };
  }

  const est = (estadoOverride || p.estado || '').toLowerCase().trim();
  if (est === 'en_preparacion') {
    return { id: 'en_preparacion', label: 'En preparación', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', dot: 'bg-amber-500' };
  }

  if (esPedidoArmado(p, preparacion, estadoOverride)) {
    return { id: 'armado', label: 'Armado', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30', dot: 'bg-blue-500' };
  }

  // Por defecto: vacío o 'pendiente'
  return { id: 'pendiente', label: 'Pendiente de entrega', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', dot: 'bg-amber-500' };
}

/**
 * Deriva el estado visual de PAGO de un pedido.
 * Devuelve { id, label, shortLabel, detalle, color, dot, esCobrado }
 */
export function estadoPagoPedido(p) {
  if (!p) {
    return { id: 'desconocido', label: 'Sin datos', shortLabel: '-', color: 'bg-gray-500/15 text-gray-400 border-gray-500/30', dot: 'bg-gray-500', esCobrado: false };
  }

  const reembolsoEstado = (p.reembolso_estado || '').toLowerCase().trim();
  if (reembolsoEstado === 'pendiente') {
    const monto = p.reembolso_monto != null ? Number(p.reembolso_monto) : Math.round(Number(p.total) || 0);
    return {
      id: 'a_reembolsar',
      label: `A reembolsar ($${monto.toLocaleString('es-AR')})`,
      shortLabel: 'A reembolsar',
      detalle: 'Reembolso pendiente de procesamiento',
      color: 'bg-red-500/20 text-red-300 border-red-500/40',
      dot: 'bg-red-500',
      esCobrado: false
    };
  }

  if (reembolsoEstado === 'devuelto') {
    const monto = p.reembolso_monto != null ? Number(p.reembolso_monto) : Math.round(Number(p.total) || 0);
    return {
      id: 'reembolsado',
      label: `Reembolsado ($${monto.toLocaleString('es-AR')})`,
      shortLabel: 'Reembolsado',
      detalle: 'Reembolso devuelto',
      color: 'bg-gray-500/20 text-gray-300 border-gray-500/40',
      dot: 'bg-gray-400',
      esCobrado: false
    };
  }

  const cobrado = esPedidoCobrado(p);
  const formaPago = (p.forma_pago || '').toLowerCase().trim();
  const metodoPago = (p.metodo_pago || p.metodo_pago_elegido || '').toLowerCase().trim();
  const esContraEntrega = formaPago === 'entrega' || esFormaPagoContraEntrega(formaPago, metodoPago);
  const esLink = formaPago === 'link' || metodoPago === 'link' || metodoPago === 'link_pago';

  if (cobrado) {
    if (esContraEntrega) {
      return {
        id: 'cobrado',
        label: 'Cobrado (contra entrega)',
        shortLabel: 'Cobrado',
        detalle: p.medio_cobro ? `Cobrado · ${p.medio_cobro.toUpperCase()}` : 'Cobrado contra entrega',
        color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        dot: 'bg-emerald-500',
        esCobrado: true
      };
    }
    return {
      id: 'pagado',
      label: 'Pagado online',
      shortLabel: 'Pagado',
      detalle: 'Pagado online',
      color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      dot: 'bg-emerald-500',
      esCobrado: true
    };
  }

  // NO cobrado
  if (esContraEntrega) {
    return {
      id: 'pendiente_cobro',
      label: 'Pendiente de cobro (contra entrega)',
      shortLabel: 'Pendiente de cobro',
      detalle: 'A cobrar al entregar el pedido',
      color: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      dot: 'bg-amber-500',
      esCobrado: false
    };
  }

  if (esLink) {
    return {
      id: 'pendiente_link',
      label: 'Pendiente de cobro (link de pago)',
      shortLabel: 'Pendiente de cobro',
      detalle: 'Esperando pago por link',
      color: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
      dot: 'bg-sky-400',
      esCobrado: false
    };
  }

  const estadoPago = (p.estado_pago || '').toLowerCase().trim();
  if (estadoPago === 'rejected' || estadoPago === 'rechazado') {
    return {
      id: 'rechazado',
      label: 'Pago rechazado',
      shortLabel: 'Rechazado',
      detalle: 'Pago online rechazado',
      color: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
      dot: 'bg-rose-500',
      esCobrado: false
    };
  }

  return {
    id: 'pendiente_online',
    label: 'Pendiente de pago (online)',
    shortLabel: 'Pendiente de pago',
    detalle: 'Esperando confirmación de pago',
    color: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    dot: 'bg-amber-500',
    esCobrado: false
  };
}

/**
 * Determina si un pedido es una venta cerrada (entregado y cobrado/pagado sin cancelar).
 * Utilizado por Clientes, Historial y métricas de calendario para no inflar ventas con pedidos pendientes.
 */
export function esVentaCerrada(p) {
  if (!p) return false;
  if (esPedidoCancelado(p)) return false;
  return esPedidoEntregado(p) && esPedidoCobrado(p);
}

/**
 * Calcula el resumen diario de estados de entrega y pago para un conjunto de pedidos.
 * Devuelve contadores de entrega, pago y monto total pendiente de cobro en pesos.
 */
export function calcularResumenDia(pedidos = [], preparaciones = {}) {
  const lista = Array.isArray(pedidos) ? pedidos : [];
  let pendientesEntrega = 0;
  let armados = 0;
  let entregados = 0;
  let noEntregados = 0;
  let cancelados = 0;

  let pendientesPago = 0;
  let pagadosCobrados = 0;
  let totalPendienteCobrarPesos = 0;

  lista.forEach(p => {
    const prep = preparaciones?.[p.numero_pedido] || null;
    const estEntrega = estadoEntregaPedido(p, prep);
    if (estEntrega.id === 'entregado') entregados++;
    else if (estEntrega.id === 'no_entregado') noEntregados++;
    else if (estEntrega.id === 'cancelado') cancelados++;
    else if (estEntrega.id === 'armado') armados++;
    else pendientesEntrega++;

    const estPago = estadoPagoPedido(p);
    if (estPago.esCobrado) {
      pagadosCobrados++;
    } else if (estEntrega.id !== 'cancelado') {
      pendientesPago++;
      totalPendienteCobrarPesos += Number(p.total || 0);
    }
  });

  return {
    total: lista.length,
    pendientesEntrega,
    armados,
    entregados,
    noEntregados,
    cancelados,
    pendientesPago,
    pagadosCobrados,
    totalPendienteCobrarPesos: Math.round(totalPendienteCobrarPesos),
  };
}
