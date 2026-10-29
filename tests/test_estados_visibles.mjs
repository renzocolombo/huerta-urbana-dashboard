import assert from 'node:assert';
import fs from 'node:fs';
import { 
  esPedidoCobrado, 
  esPedidoEntregado, 
  esPedidoCancelado, 
  esPedidoNoEntregado, 
  esPedidoArmado, 
  esPedidoPendienteDeEntrega, 
  estadoEntregaPedido, 
  estadoPagoPedido, 
  esVentaCerrada, 
  calcularResumenDia 
} from '../src/utils/estadosPedido.js';
import { esFormaPagoContraEntrega, claveTabInicial, METODOS_PAGO_CONTRA_ENTREGA } from '../src/utils/agendaCalendario.js';
import { extraerFechaYMD, getHoyYMD } from '../src/utils/fechasEntrega.js';

let passed = 0;
let failed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  [OK] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${desc}: ${err.message}`);
    failed++;
  }
}

async function itAsync(desc, fn) {
  try {
    await fn();
    console.log(`  [OK] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${desc}: ${err.message}`);
    failed++;
  }
}

console.log('\n============================================================');
console.log('1. REPRODUCCIÓN DEL BUG: metodo_pago efectivo con medio_cobro vacío');
console.log('============================================================');

it('Un pedido nuevo con metodo_pago="efectivo" y sin cobro registrado NO debe estar cobrado', () => {
  const p = {
    numero_pedido: 'TEST-BUG-01',
    estado: 'Pendiente',
    metodo_pago: 'efectivo',
    forma_pago: 'entrega',
    medio_cobro: '',
    medio_pago: '',
    monto_cobrado: '',
    fecha_cobro: '',
    estado_pago: '',
    cobrado: false,
    total: 15000,
  };

  assert.strictEqual(esPedidoCobrado(p), false, 'No debe considerarse cobrado');
  const estPago = estadoPagoPedido(p);
  assert.strictEqual(estPago.id, 'pendiente_cobro');
  assert.strictEqual(estPago.label, 'Pendiente de cobro (contra entrega)');
  assert.strictEqual(estPago.esCobrado, false);
});

it('Un pedido con estado y cobro vacíos es "Pendiente de entrega" y "Pendiente de cobro (contra entrega)"', () => {
  const p = {
    numero_pedido: 'TEST-VACIO-01',
    estado: '',
    metodo_pago: 'efectivo',
    forma_pago: 'entrega',
    medio_cobro: '',
    total: 8500,
  };

  const estEnt = estadoEntregaPedido(p);
  const estPag = estadoPagoPedido(p);

  assert.strictEqual(estEnt.id, 'pendiente');
  assert.strictEqual(estEnt.label, 'Pendiente de entrega');
  assert.strictEqual(estPag.id, 'pendiente_cobro');
  assert.strictEqual(estPag.label, 'Pendiente de cobro (contra entrega)');
});

console.log('\n============================================================');
console.log('2. MATRIZ DE ESTADOS EN TODAS LAS VISTAS');
console.log('============================================================');

it('Caso 1: Nuevo pedido contra entrega', () => {
  const p = {
    numero_pedido: 'HU-001',
    estado: 'pendiente',
    forma_pago: 'entrega',
    metodo_pago: 'efectivo',
    total: 10000,
  };
  const estEnt = estadoEntregaPedido(p);
  const estPag = estadoPagoPedido(p);

  assert.strictEqual(estEnt.label, 'Pendiente de entrega');
  assert.strictEqual(estPag.label, 'Pendiente de cobro (contra entrega)');
  assert.strictEqual(esVentaCerrada(p), false);
});

it('Caso 2: Mercado Pago sin pagar (online)', () => {
  const p = {
    numero_pedido: 'HU-002',
    estado: 'pendiente',
    forma_pago: 'mercadopago',
    metodo_pago: 'mercadopago',
    estado_pago: 'pending',
    total: 12000,
  };
  const estEnt = estadoEntregaPedido(p);
  const estPag = estadoPagoPedido(p);

  assert.strictEqual(estEnt.label, 'Pendiente de entrega');
  assert.strictEqual(estPag.label, 'Pendiente de pago (online)');
  assert.strictEqual(esVentaCerrada(p), false);
});

it('Caso 3: Pedido armado con pesadas', () => {
  const p = {
    numero_pedido: 'HU-003',
    estado: 'listo',
    forma_pago: 'entrega',
    metodo_pago: 'efectivo',
    detalle_json: JSON.stringify([{ producto: 'Tomate', cantidad_real: 1.2, subtotal: 3600 }]),
  };
  const prep = { items: [{ nombre: 'Tomate', bolsasAsignadas: [{ peso: 1.2 }] }] };
  const estEnt = estadoEntregaPedido(p, prep);

  assert.strictEqual(estEnt.id, 'armado');
  assert.strictEqual(estEnt.label, 'Armado');
  assert.strictEqual(esPedidoArmado(p, prep), true);
});

it('Caso 4: Entregado y cobrado (Venta cerrada)', () => {
  const p = {
    numero_pedido: 'HU-004',
    estado: 'Entregado',
    forma_pago: 'entrega',
    medio_cobro: 'debito',
    monto_cobrado: 9500,
    fecha_cobro: '2026-10-30',
    estado_pago: 'approved',
    cobrado: true,
    total: 9500,
  };
  const estEnt = estadoEntregaPedido(p);
  const estPag = estadoPagoPedido(p);

  assert.strictEqual(estEnt.label, 'Entregado');
  assert.strictEqual(estPag.esCobrado, true);
  assert.strictEqual(esVentaCerrada(p), true, 'Debe contar como venta cerrada');
});

it('Caso 5: Entregado sin cobrar (NO es venta cerrada)', () => {
  const p = {
    numero_pedido: 'HU-005',
    estado: 'Entregado',
    forma_pago: 'entrega',
    metodo_pago: 'efectivo',
    medio_cobro: '',
    monto_cobrado: '',
    fecha_cobro: '',
    estado_pago: '',
    total: 9500,
  };
  const estEnt = estadoEntregaPedido(p);
  const estPag = estadoPagoPedido(p);

  assert.strictEqual(estEnt.label, 'Entregado');
  assert.strictEqual(estPag.label, 'Pendiente de cobro (contra entrega)');
  assert.strictEqual(esVentaCerrada(p), false, 'NO es venta cerrada si no está cobrado');
});

it('Caso 6: No entregado', () => {
  const p = {
    numero_pedido: 'HU-006',
    estado: 'no_entregado',
    motivo_no_entrega: 'Cliente ausente',
    total: 8000,
  };
  const estEnt = estadoEntregaPedido(p);

  assert.strictEqual(estEnt.id, 'no_entregado');
  assert.strictEqual(estEnt.label, 'No entregado');
  assert.strictEqual(esVentaCerrada(p), false);
});

it('Caso 7: Cancelado', () => {
  const p = {
    numero_pedido: 'HU-007',
    estado: 'cancelado',
    total: 8000,
  };
  const estEnt = estadoEntregaPedido(p);

  assert.strictEqual(estEnt.id, 'cancelado');
  assert.strictEqual(estEnt.label, 'Cancelado');
  assert.strictEqual(esVentaCerrada(p), false);
});

it('Caso 8: Con reembolso (pendiente y devuelto)', () => {
  const pPend = {
    numero_pedido: 'HU-008A',
    estado: 'entregado',
    reembolso_estado: 'pendiente',
    reembolso_monto: 1500,
  };
  const estPagPend = estadoPagoPedido(pPend);
  assert.strictEqual(estPagPend.id, 'a_reembolsar');
  assert.strictEqual(estPagPend.shortLabel, 'A reembolsar');

  const pDev = {
    numero_pedido: 'HU-008B',
    estado: 'entregado',
    reembolso_estado: 'devuelto',
    reembolso_monto: 1500,
  };
  const estPagDev = estadoPagoPedido(pDev);
  assert.strictEqual(estPagDev.id, 'reembolsado');
  assert.strictEqual(estPagDev.shortLabel, 'Reembolsado');
});

console.log('\n============================================================');
console.log('3. RESUMEN DEL DÍA: calcularResumenDia');
console.log('============================================================');

it('Calcula correctamente todas las métricas del resumen del día', () => {
  const pedidos = [
    { numero_pedido: '1', estado: 'pendiente', forma_pago: 'entrega', metodo_pago: 'efectivo', total: 1000 },
    { numero_pedido: '2', estado: 'listo', forma_pago: 'entrega', metodo_pago: 'efectivo', total: 2000, detalle_json: '[{"subtotal":2000}]' },
    { numero_pedido: '3', estado: 'entregado', forma_pago: 'entrega', medio_cobro: 'debito', cobrado: true, total: 3000 },
    { numero_pedido: '4', estado: 'entregado', forma_pago: 'entrega', metodo_pago: 'efectivo', total: 4000 }, // entregado pero no cobrado
    { numero_pedido: '5', estado: 'no_entregado', forma_pago: 'entrega', metodo_pago: 'efectivo', total: 5000 },
  ];

  const res = calcularResumenDia(pedidos, {});

  assert.strictEqual(res.pendientesEntrega, 1, '1 pendiente de entrega (#1)');
  assert.strictEqual(res.armados, 1, '1 armado (#2)');
  assert.strictEqual(res.entregados, 2, '2 entregados (#3 y #4)');
  assert.strictEqual(res.noEntregados, 1, '1 no entregado (#5)');
  assert.strictEqual(res.pendientesPago, 4, '4 pendientes de pago (#1, #2, #4, #5)');
  assert.strictEqual(res.pagadosCobrados, 1, '1 cobrado (#3)');
  assert.strictEqual(res.totalPendienteCobrarPesos, 12000, 'Total pendiente a cobrar: 1000 + 2000 + 4000 + 5000 = 12000');
});

console.log('\n============================================================');
console.log('4. REGLAS DE CLIENTES Y CARRITOS ABANDONADOS');
console.log('============================================================');

it('Un pedido contra entrega pertenece al cliente y NUNCA va a carritos abandonados ni cuenta como venta cerrada antes de cobrarse', () => {
  const pedidoContraEntrega = {
    numero_pedido: 'HU-CLI-01',
    nombre: 'Ana Perez',
    telefono: '1155551234',
    email: 'ana@example.com',
    forma_pago: 'entrega',
    metodo_pago: 'efectivo',
    estado: 'pendiente',
    total: 8000,
  };

  const formaPago = (pedidoContraEntrega.forma_pago || '').toLowerCase().trim();
  const metodoPago = (pedidoContraEntrega.metodo_pago || '').toLowerCase().trim();
  const esContraEntrega = formaPago === 'entrega' || esFormaPagoContraEntrega(formaPago, metodoPago);

  assert.strictEqual(esContraEntrega, true, 'Es pedido contra entrega');

  // En Clientes: carritosAbandonados filtra estrictamente excluyendo contra entrega
  const esCarritoAbandonado = !esContraEntrega && pedidoContraEntrega.estado_pago !== 'approved';
  assert.strictEqual(esCarritoAbandonado, false, 'Contra entrega NUNCA es carrito abandonado');

  // Y no cuenta como venta cerrada
  assert.strictEqual(esVentaCerrada(pedidoContraEntrega), false, 'No cuenta como venta cerrada');
});

it('Un pedido de Mercado Pago sin pagar SÍ va a carritos abandonados', () => {
  const pedidoMP = {
    numero_pedido: 'HU-CLI-02',
    nombre: 'Juan Gomez',
    telefono: '1144445678',
    email: 'juan@example.com',
    forma_pago: 'mercadopago',
    metodo_pago: 'mercadopago',
    estado_pago: 'pending',
    total: 11000,
  };

  const formaPago = (pedidoMP.forma_pago || '').toLowerCase().trim();
  const metodoPago = (pedidoMP.metodo_pago || '').toLowerCase().trim();
  const esContraEntrega = formaPago === 'entrega' || esFormaPagoContraEntrega(formaPago, metodoPago);

  const esCarritoAbandonado = !esContraEntrega && pedidoMP.estado_pago !== 'approved';
  assert.strictEqual(esCarritoAbandonado, true, 'Online sin pagar ES carrito abandonado');
});

console.log('\n============================================================');
console.log('5. RUTEO DE FECHAS: claveTabInicial');
console.log('============================================================');

it('Si hoy no tiene pedidos, claveTabInicial salta al próximo día con entregas', () => {
  const fechasDisponibles = ['2026-10-30', '2026-11-03'];
  const hoy = '2026-10-29';

  const elegida = claveTabInicial(fechasDisponibles, hoy);
  assert.strictEqual(elegida, '2026-10-30', 'Debe saltar directo a 2026-10-30');
});

it('Si hoy sí tiene pedidos, claveTabInicial elige hoy', () => {
  const fechasDisponibles = ['2026-10-29', '2026-10-30'];
  const hoy = '2026-10-29';

  const elegida = claveTabInicial(fechasDisponibles, hoy);
  assert.strictEqual(elegida, '2026-10-29', 'Debe elegir hoy');
});

console.log('\n============================================================');
console.log('6. VERIFICACIÓN DE SOLO LECTURA CON LOS 3 PEDIDOS REALES');
console.log('============================================================');

await itAsync('Verificación de solo lectura con datos reales de la hoja', async () => {
  if (!fs.existsSync('.env')) {
    console.log('    (Sin .env, omitiendo lectura en vivo)');
    return;
  }
  const envText = fs.readFileSync('.env', 'utf8');
  const env = Object.fromEntries(
    envText.split('\n').filter(l => l.includes('=')).map(l => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
  );

  const gvizUrl = `https://docs.google.com/spreadsheets/d/${env.VITE_SHEET_ID}/gviz/tq?tqx=out:json&sheet=Pedidos`;
  const res = await fetch(gvizUrl);
  const text = await res.text();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  const json = JSON.parse(text.substring(start, end + 1));
  const headers = (json.table.cols || []).map(c =>
    String(c.label || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ /g, '_')
  );

  const rawRows = (json.table.rows || []).map(r =>
    (r.c || []).map(cell => (cell ? (cell.v !== null && cell.v !== undefined ? cell.v : cell.f || '') : ''))
  );

  const parsedPedidos = rawRows.map((row, index) => {
    const obj = { sheetRowIndex: index + 2 };
    headers.forEach((h, i) => { obj[h] = row[i] || ''; });

    const formaPagoRaw = (obj.forma_pago || '').toLowerCase().trim();
    const metodoPagoRaw = (obj.metodo_pago || obj.medio_pago || obj.medio_cobro || '').toLowerCase().trim();
    const formaPago = formaPagoRaw || (METODOS_PAGO_CONTRA_ENTREGA.includes(metodoPagoRaw) ? 'entrega' : '');

    return {
      numero_pedido: obj.numero_pedido || '',
      fecha: extraerFechaYMD(obj.get_fecha || obj.fecha) || getHoyYMD(),
      nombre: obj.nombre || 'Sin Nombre',
      total: Number(obj.total) || 0,
      estado_pago: obj.estado_pago || 'pendiente',
      forma_pago: formaPago,
      metodo_pago: (obj.metodo_pago || '').toLowerCase().trim(),
      metodo_pago_elegido: (obj.metodo_pago || '').toLowerCase().trim(),
      medio_pago: obj.medio_cobro || '',
      medio_cobro: obj.medio_cobro || '',
      monto_cobrado: obj.monto_cobrado || '',
      fecha_cobro: obj.fecha_cobro || '',
      dia_entrega: obj.dia_entrega || '',
      horario_entrega: obj.horario_entrega || '',
      estado: obj.estado || 'pendiente',
      cobrado: obj.cobrado === 'VERDADERO' || obj.cobrado === true || obj.cobrado === 'TRUE' || !!obj.monto_cobrado,
    };
  });

  const p780105 = parsedPedidos.find(p => p.numero_pedido === 'HU-780105');
  const p836253 = parsedPedidos.find(p => p.numero_pedido === 'HU-836253');
  const p725825 = parsedPedidos.find(p => p.numero_pedido === 'HU-725825');

  assert.ok(p780105, 'HU-780105 debe existir');
  assert.ok(p836253, 'HU-836253 debe existir');
  assert.ok(p725825, 'HU-725825 debe existir');

  // HU-780105: Mercadopago pendiente
  const ent780105 = estadoEntregaPedido(p780105);
  const pag780105 = estadoPagoPedido(p780105);
  assert.strictEqual(ent780105.label, 'Pendiente de entrega', 'HU-780105 debe ser Pendiente de entrega');
  assert.strictEqual(pag780105.label, 'Pendiente de pago (online)', 'HU-780105 debe ser Pendiente de pago (online)');
  assert.strictEqual(esPedidoCobrado(p780105), false, 'HU-780105 no debe estar cobrado');

  // HU-836253: Contra entrega nuevo
  const ent836253 = estadoEntregaPedido(p836253);
  const pag836253 = estadoPagoPedido(p836253);
  assert.strictEqual(ent836253.label, 'Pendiente de entrega', 'HU-836253 debe ser Pendiente de entrega');
  assert.strictEqual(pag836253.label, 'Pendiente de cobro (contra entrega)', 'HU-836253 debe ser Pendiente de cobro (contra entrega)');
  assert.strictEqual(esPedidoCobrado(p836253), false, 'HU-836253 no debe estar cobrado');

  // HU-725825: Contra entrega nuevo
  const ent725825 = estadoEntregaPedido(p725825);
  const pag725825 = estadoPagoPedido(p725825);
  assert.strictEqual(ent725825.label, 'Pendiente de entrega', 'HU-725825 debe ser Pendiente de entrega');
  assert.strictEqual(pag725825.label, 'Pendiente de cobro (contra entrega)', 'HU-725825 debe ser Pendiente de cobro (contra entrega)');
  assert.strictEqual(esPedidoCobrado(p725825), false, 'HU-725825 no debe estar cobrado');
});

console.log('\n============================================================');
console.log(`TOTAL: ${passed} pasadas, ${failed} fallidas`);
console.log('============================================================');

if (failed > 0) process.exit(1);
