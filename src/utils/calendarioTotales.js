// src/utils/calendarioTotales.js
// Cálculo puro de detalle y totales por turno y del día para el Calendario de Entregas.

import { turnoDePedido, esPedidoElegibleReparto, resolverEntrega, esPedidoCancelado } from './agendaCalendario.js';
import { calcularTotalPedido, parsearMonto } from './totalesPedido.js';
import { estadoEntregaPedido, estadoPagoPedido, esPedidoCobrado } from './estadosPedido.js';

/**
 * Calcula el detalle y totales por turno (Mañana, Tarde, Sin turno) y el total del día
 * para una fecha dada (ymd).
 * 
 * Requisitos:
 * 1) Pedidos que cuentan: los elegibles para reparto de ese día (turnoDePedido, esPedidoElegibleReparto, resolverEntrega).
 * 2) Monto de cada pedido vía calcularTotalPedido (totalesPedido.js), distinguiendo estimados (sin armar) de exactos (armados).
 * 3) Totales por turno: cantidad, suma de montos e indicación de estimados ("incluye N estimados").
 * 4) Total del día: cantidad total (mañana + tarde + sin horario), monto total y desglose (ya cobrado vs pendiente de cobro).
 *
 * @param {Array} pedidos - Lista de pedidos (de la hoja o enriquecidos)
 * @param {string} ymd - Fecha en formato 'YYYY-MM-DD'
 * @param {Object} [preparaciones] - Mapa de preparaciones { [numero_pedido]: prep }
 * @param {Object} [opciones] - Opciones de cálculo
 * @returns {Object}
 */
export function calcularDetalleYTotalesDia(pedidos, ymd, preparaciones = {}, opciones = {}) {
  const turnos = {
    Mañana: {
      clave: 'Mañana',
      pedidos: [],
      total: 0,
      cantidad: 0,
      estimadosCount: 0,
      tieneEstimados: false,
    },
    Tarde: {
      clave: 'Tarde',
      pedidos: [],
      total: 0,
      cantidad: 0,
      estimadosCount: 0,
      tieneEstimados: false,
    },
    'Sin turno': {
      clave: 'Sin turno',
      pedidos: [],
      total: 0,
      cantidad: 0,
      estimadosCount: 0,
      tieneEstimados: false,
    },
  };

  const desglose = {
    cobrado: {
      cantidad: 0,
      monto: 0,
      estimadosCount: 0,
      tieneEstimados: false,
    },
    pendiente: {
      cantidad: 0,
      monto: 0,
      estimadosCount: 0,
      tieneEstimados: false,
    },
  };

  if (!ymd || !Array.isArray(pedidos) || pedidos.length === 0) {
    return {
      ymd: ymd || '',
      turnos,
      totalPedidos: 0,
      totalMonto: 0,
      totalEstimadosCount: 0,
      tieneEstimados: false,
      desglose,
      pedidosCancelados: [],
    };
  }

  // 1. Filtrar pedidos que correspondan a la fecha ymd
  const deLaFecha = pedidos.filter((p) => {
    const f = p?.entregaYMD || resolverEntrega(p).ymd;
    return f === ymd;
  });

  // Cancelados mostrados aparte
  const pedidosCancelados = deLaFecha.filter(esPedidoCancelado);

  // 2. Pedidos que cuentan: elegibles para reparto de ese día (Requisito 5)
  const activos = deLaFecha.filter((p) => {
    if (esPedidoCancelado(p)) return false;
    if (opciones.filtrarElegibles === false) return true;
    return esPedidoElegibleReparto(p);
  });

  let totalMonto = 0;
  let totalEstimadosCount = 0;

  activos.forEach((p) => {
    const turno = turnoDePedido(p);
    const turnoKey = (turno === 'Mañana' || turno === 'Tarde') ? turno : 'Sin turno';

    const prep = preparaciones?.[p.numero_pedido] || null;
    const calc = calcularTotalPedido(p, prep, opciones);
    const monto = parsearMonto(calc?.monto ?? calc?.total);
    const esEstimado = Boolean(calc?.esEstimado);

    const estEnt = estadoEntregaPedido(p, prep);
    const estPag = estadoPagoPedido(p);
    const esCobrado = Boolean(estPag?.esCobrado || esPedidoCobrado(p));

    const item = {
      pedido: p,
      numero_pedido: p.numero_pedido || p.id || '',
      nombre: p.nombre || 'Sin nombre',
      localidad: p.localidad || p.direccion || '—',
      monto,
      esEstimado,
      motivoEstimado: calc?.motivoEstimado || '',
      estaArmado: Boolean(calc?.estaArmado),
      estEnt,
      estPag,
      esCobrado,
      turno,
    };

    turnos[turnoKey].pedidos.push(item);
    turnos[turnoKey].total += monto;
    turnos[turnoKey].cantidad += 1;
    if (esEstimado) {
      turnos[turnoKey].estimadosCount += 1;
      turnos[turnoKey].tieneEstimados = true;
    }

    totalMonto += monto;
    if (esEstimado) {
      totalEstimadosCount += 1;
    }

    if (esCobrado) {
      desglose.cobrado.cantidad += 1;
      desglose.cobrado.monto += monto;
      if (esEstimado) {
        desglose.cobrado.estimadosCount += 1;
        desglose.cobrado.tieneEstimados = true;
      }
    } else {
      desglose.pendiente.cantidad += 1;
      desglose.pendiente.monto += monto;
      if (esEstimado) {
        desglose.pendiente.estimadosCount += 1;
        desglose.pendiente.tieneEstimados = true;
      }
    }
  });

  return {
    ymd,
    turnos,
    totalPedidos: activos.length,
    totalMonto,
    totalEstimadosCount,
    tieneEstimados: totalEstimadosCount > 0,
    desglose,
    pedidosCancelados,
  };
}
