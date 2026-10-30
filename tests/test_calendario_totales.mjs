// tests/test_calendario_totales.mjs
// Pruebas unitarias de detalle y totales por turno y del día para el Calendario de Entregas.

import { calcularDetalleYTotalesDia } from '../src/utils/calendarioTotales.js';

let passed = 0;
let failed = 0;

function t(desc, cond) {
  if (cond) {
    console.log(`OK    ${desc}`);
    passed++;
  } else {
    console.error(`FAIL  ${desc}`);
    failed++;
  }
}

console.log('==================================================================');
console.log('PRUEBAS UNITARIAS: calcularDetalleYTotalesDia (CALENDARIO)');
console.log('==================================================================\n');

const FECHA_TEST = '2026-11-05';

// Pedidos de prueba:
// 1. Mañana, armado (exacto), pagado (approved) -> monto 5000, cobrado
const p1 = {
  numero_pedido: 'HU-101',
  dia_entrega: FECHA_TEST,
  horario_entrega: '8 a 12 hs',
  estado: 'armado',
  estado_pago: 'approved',
  metodo_pago: 'mercadopago',
  total: 5000,
  detalle_json: JSON.stringify([{ producto: 'Tomate', cantidad_real: 1, precio_unitario: 5000 }]),
  nombre: 'Cliente Uno',
  localidad: 'Del Viso',
};

// 2. Mañana, sin armar (estimado), contra entrega efectivo -> monto 3000, pendiente
const p2 = {
  numero_pedido: 'HU-102',
  dia_entrega: FECHA_TEST,
  horario_entrega: '09:00 - 13:00',
  estado: 'pendiente',
  estado_pago: 'pendiente',
  metodo_pago: 'efectivo',
  forma_pago: 'entrega',
  total: 3000,
  nombre: 'Cliente Dos',
  localidad: 'Pilar',
};

// 3. Tarde, armado (exacto), cobrado contra entrega -> monto 4000, cobrado
const p3 = {
  numero_pedido: 'HU-103',
  dia_entrega: FECHA_TEST,
  horario_entrega: '14 a 18 hs',
  estado: 'armado',
  estado_pago: 'pendiente',
  forma_pago: 'entrega',
  metodo_pago: 'efectivo',
  cobrado: true,
  monto_cobrado: 4000,
  total: 4000,
  detalle_json: JSON.stringify([{ producto: 'Lechuga', cantidad_real: 2, precio_unitario: 2000 }]),
  nombre: 'Cliente Tres',
  localidad: 'Tortuguitas',
};

// 4. Tarde, sin armar (estimado), link de pago sin pagar -> monto 2500, pendiente
const p4 = {
  numero_pedido: 'HU-104',
  dia_entrega: FECHA_TEST,
  horario_entrega: '14 a 18 hs',
  estado: 'pendiente',
  estado_pago: 'pendiente',
  forma_pago: 'link',
  total: 2500,
  nombre: 'Cliente Cuatro',
  localidad: 'Garín',
};

// 5. Sin turno, sin armar (estimado), contra entrega -> monto 1500, pendiente
const p5 = {
  numero_pedido: 'HU-105',
  dia_entrega: FECHA_TEST,
  horario_entrega: 'a convenir',
  estado: 'pendiente',
  estado_pago: 'pendiente',
  forma_pago: 'entrega',
  total: 1500,
  nombre: 'Cliente Cinco',
  localidad: 'Del Viso',
};

// 6. Cancelado del mismo día -> NO debe sumar a los turnos activos ni a la facturación
const p6 = {
  numero_pedido: 'HU-106',
  dia_entrega: FECHA_TEST,
  horario_entrega: '8 a 12 hs',
  estado: 'cancelado',
  total: 8000,
  nombre: 'Cliente Cancelado',
};

// 7. No elegible: mercadopago rechazado/sin pagar (sin link ni contra entrega) -> NO debe sumar
const p7 = {
  numero_pedido: 'HU-107',
  dia_entrega: FECHA_TEST,
  horario_entrega: '8 a 12 hs',
  estado: 'pendiente',
  estado_pago: 'rejected',
  metodo_pago: 'mercadopago',
  forma_pago: 'mercadopago',
  total: 9000,
  nombre: 'Cliente Rechazado',
};

// 8. De otro día -> NO debe sumar
const p8 = {
  numero_pedido: 'HU-108',
  dia_entrega: '2026-11-06',
  horario_entrega: '8 a 12 hs',
  estado: 'pendiente',
  estado_pago: 'approved',
  total: 7000,
};

const pedidosMock = [p1, p2, p3, p4, p5, p6, p7, p8];

const res = calcularDetalleYTotalesDia(pedidosMock, FECHA_TEST);

console.log('--- 1. Elegibilidad y Conteo Total ---');
t('total de pedidos elegibles es 5 (excluye cancelado, rechazado y otro día)', res.totalPedidos === 5);
t('cancelados registrados aparte en pedidosCancelados (1 cancelado)', res.pedidosCancelados.length === 1);
t('el cancelado es HU-106', res.pedidosCancelados[0].numero_pedido === 'HU-106');

console.log('\n--- 2. Turno Mañana ---');
const manana = res.turnos.Mañana;
t('Mañana tiene 2 pedidos', manana.cantidad === 2);
t('Mañana tiene pedidos HU-101 y HU-102', manana.pedidos.some(x => x.numero_pedido === 'HU-101') && manana.pedidos.some(x => x.numero_pedido === 'HU-102'));
t('HU-101 es exacto (armado: true, esEstimado: false)', manana.pedidos.find(x => x.numero_pedido === 'HU-101').esEstimado === false);
t('HU-102 es estimado (esEstimado: true)', manana.pedidos.find(x => x.numero_pedido === 'HU-102').esEstimado === true);
t('Suma monto Mañana es 5000 + 3000 = 8000', manana.total === 8000);
t('Mañana tieneEstimados es true', manana.tieneEstimados === true);
t('Mañana estimadosCount es 1', manana.estimadosCount === 1);

console.log('\n--- 3. Turno Tarde ---');
const tarde = res.turnos.Tarde;
t('Tarde tiene 2 pedidos', tarde.cantidad === 2);
t('Suma monto Tarde es 4000 + 2500 = 6500', tarde.total === 6500);
t('Tarde tieneEstimados es true', tarde.tieneEstimados === true);
t('Tarde estimadosCount es 1', tarde.estimadosCount === 1);

console.log('\n--- 4. Sin Turno ---');
const sinTurno = res.turnos['Sin turno'];
t('Sin turno tiene 1 pedido', sinTurno.cantidad === 1);
t('Suma monto Sin turno es 1500', sinTurno.total === 1500);
t('Sin turno tieneEstimados es true', sinTurno.tieneEstimados === true);

console.log('\n--- 5. Total del Día ---');
t('totalMonto es 8000 + 6500 + 1500 = 16000', res.totalMonto === 16000);
t('totalEstimadosCount es 3 (p2, p4, p5)', res.totalEstimadosCount === 3);
t('tieneEstimados en total del día es true', res.tieneEstimados === true);

console.log('\n--- 6. Desglose: Ya Cobrado vs Pendiente ---');
const cobrado = res.desglose.cobrado;
const pendiente = res.desglose.pendiente;
t('Cobrado tiene 2 pedidos (HU-101 por MP approved y HU-103 por cobrado: true)', cobrado.cantidad === 2);
t('Monto cobrado es 5000 + 4000 = 9000', cobrado.monto === 9000);
t('Pendiente tiene 3 pedidos (HU-102, HU-104, HU-105)', pendiente.cantidad === 3);
t('Monto pendiente es 3000 + 2500 + 1500 = 7000', pendiente.monto === 7000);
t('Suma de cobrado + pendiente coincide exactamente con totalMonto (9000 + 7000 === 16000)', cobrado.monto + pendiente.monto === res.totalMonto);
t('Suma de cantidades coincide con totalPedidos (2 + 3 === 5)', cobrado.cantidad + pendiente.cantidad === res.totalPedidos);

console.log('\n--- 7. Insignias de Entrega y Pago en cada Pedido ---');
const itemP1 = manana.pedidos.find(x => x.numero_pedido === 'HU-101');
t('itemP1 contiene estEnt con label "Armado"', itemP1.estEnt.label === 'Armado');
t('itemP1 contiene estPag con label correspondiente a cobrado', itemP1.estPag.esCobrado === true);
t('itemP1 contiene localidad "Del Viso"', itemP1.localidad === 'Del Viso');
t('itemP1 contiene nombre "Cliente Uno"', itemP1.nombre === 'Cliente Uno');

console.log('\n--- 8. Caso sin Estimados (Todo Armado) ---');
const pedidosTodosArmados = [
  { ...p1, numero_pedido: 'ARM-1' },
  { ...p3, numero_pedido: 'ARM-2' },
];
const resArmados = calcularDetalleYTotalesDia(pedidosTodosArmados, FECHA_TEST);
t('Día con todo armado tieneEstimados es false', resArmados.tieneEstimados === false);
t('Día con todo armado totalEstimadosCount es 0', resArmados.totalEstimadosCount === 0);
t('Mañana en día todo armado tieneEstimados es false', resArmados.turnos.Mañana.tieneEstimados === false);

console.log('\n--- 9. Caso Día Vacío ---');
const resVacio = calcularDetalleYTotalesDia(pedidosMock, '2026-12-31');
t('Día vacío totalPedidos es 0', resVacio.totalPedidos === 0);
t('Día vacío totalMonto es 0', resVacio.totalMonto === 0);
t('Día vacío tieneEstimados es false', resVacio.tieneEstimados === false);
t('Día vacío Mañana cantidad es 0', resVacio.turnos.Mañana.cantidad === 0);
t('Día vacío Tarde cantidad es 0', resVacio.turnos.Tarde.cantidad === 0);
t('Día vacío cobrado monto es 0', resVacio.desglose.cobrado.monto === 0);
t('Día vacío pendiente monto es 0', resVacio.desglose.pendiente.monto === 0);

console.log('\n==================================================================');
console.log(`TOTAL RESULTADO: ${passed} ok, ${failed} fallas`);
console.log('==================================================================');

if (failed > 0) {
  process.exit(1);
}
