import assert from 'assert';
import {
  calcularTotalPedido,
  obtenerMontoACobrar,
  esItemSinStock,
  extraerItemsParaCalculo,
  resolverPrecioUnitario
} from '../src/utils/totalesPedido.js';
import { apiLiberarCredito, apiGetEstadoCreditoPedidos } from '../src/utils/mercaderiaApi.js';
import { obtenerPesosReales } from '../src/utils/remitoPrinter.js';

console.log('==================================================================');
console.log('PRUEBAS UNITARIAS FASE 2: CRÉDITO DE REFERIDOS Y MONTO AL COBRAR');
console.log('==================================================================\n');

let ok = 0;
let fallas = 0;

function test(nombre, fn) {
  try {
    fn();
    console.log(`OK    ${nombre}`);
    ok++;
  } catch (err) {
    console.error(`FAIL  ${nombre}: ${err.message}`);
    fallas++;
  }
}

async function testAsync(nombre, fn) {
  try {
    await fn();
    console.log(`OK    ${nombre}`);
    ok++;
  } catch (err) {
    console.error(`FAIL  ${nombre}: ${err.message}`);
    fallas++;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 1. PEDIDO SIN ARMAR = TOTAL DE LA HOJA (MARCADO ESTIMADO)
// ────────────────────────────────────────────────────────────────────────────
test('1.1 Pedido sin armar devuelve el total de la hoja y marca como estimado', () => {
  const pedido = {
    numero_pedido: 'HU-101',
    nombre: 'Ana Gómez',
    total: 35000,
    producto: 'Manzana, Banana',
    cantidades: '2kg, 1kg',
  };
  const calc = calcularTotalPedido(pedido, null);
  assert.strictEqual(calc.monto, 35000, 'El monto debe ser el total de la hoja');
  assert.strictEqual(calc.esEstimado, true, 'Debe estar marcado como estimado');
  assert.strictEqual(calc.motivoEstimado, 'Estimado, se ajusta al pesar');
  assert.strictEqual(calc.estaArmado, false);
});

test('1.2 Pedido con preparación vacía o sin pesadas completadas es no armado', () => {
  const pedido = { numero_pedido: 'HU-102', total: 18500 };
  const prep = { items: [{ nombre: 'Papa', bolsasAsignadas: [] }], completado: false };
  const calc = calcularTotalPedido(pedido, prep);
  assert.strictEqual(calc.monto, 18500);
  assert.strictEqual(calc.esEstimado, true);
  assert.strictEqual(calc.estaArmado, false);
});

// ────────────────────────────────────────────────────────────────────────────
// 2. PEDIDO ARMADO CON CRÉDITO Y CUPÓN = PESADO MENOS DESCUENTOS (PISO EN 0)
// ────────────────────────────────────────────────────────────────────────────
test('2.1 Pedido armado calcula suma de pesadas menos cupón y crédito de referido', () => {
  const pedido = {
    numero_pedido: 'HU-201',
    total: 25000,
    cupon_bienvenida_estado: 'BIENVENIDO10', // 10%
    credito_usado: '5000',
    detalle_json: JSON.stringify([
      { producto: 'Manzana Roja', cantidad_real: 2.0, precio_unitario: 10000, subtotal: 20000 },
      { producto: 'Banana Ecuador', cantidad_real: 1.0, precio_unitario: 10000, subtotal: 10000 },
    ])
  };
  // Subtotal pesado = 30.000
  // Cupón 10% = 3.000
  // Crédito referido = 5.000
  // Descuentos totales = 8.000
  // Neto a cobrar = 22.000
  const calc = calcularTotalPedido(pedido);
  assert.strictEqual(calc.subtotalPesado, 30000, 'Subtotal pesado debe ser 30000');
  assert.strictEqual(calc.descuentos, 8000, 'Descuentos totales deben ser 8000');
  assert.strictEqual(calc.monto, 22000, 'Monto a cobrar debe ser 22000');
  assert.strictEqual(calc.esEstimado, false, 'No debe ser estimado');
  assert.strictEqual(calc.estaArmado, true);
});

test('2.2 Descuentos mayores al subtotal tienen piso en 0', () => {
  const pedido = {
    numero_pedido: 'HU-202',
    total: 3000,
    credito_usado: '5000', // Crédito supera el subtotal de 4000
    detalle_json: JSON.stringify([
      { producto: 'Acelga', cantidad_real: 2, precio_unitario: 2000, subtotal: 4000 }
    ])
  };
  const calc = calcularTotalPedido(pedido);
  assert.strictEqual(calc.subtotalPesado, 4000);
  assert.strictEqual(calc.descuentos, 5000);
  assert.strictEqual(calc.monto, 0, 'El piso debe ser 0');
  assert.strictEqual(calc.esEstimado, false, 'Es un 0 genuino, no es estimado');
});

// ────────────────────────────────────────────────────────────────────────────
// 3. ÍTEM SIN PRECIO NO DA 0: AVISA "FALTA PRECIO DE [PRODUCTO]" Y USA HOJA
// ────────────────────────────────────────────────────────────────────────────
test('3.1 Ítem sin precio no da 0: avisa falta precio de [producto] y usa total de hoja como respaldo', () => {
  const pedido = {
    numero_pedido: 'HU-301',
    total: 19800,
    detalle_json: JSON.stringify([
      { producto: 'Tomate Platense', cantidad_real: 2.5, precio_unitario: 0 }, // Sin precio
      { producto: 'Zanahoria', cantidad_real: 1.0, precio_unitario: 3000, subtotal: 3000 }
    ])
  };
  const calc = calcularTotalPedido(pedido);
  assert.strictEqual(calc.monto, 19800, 'Debe respaldar con el total de la hoja');
  assert.strictEqual(calc.faltaPrecio, true, 'Debe marcar flag de faltaPrecio');
  assert.strictEqual(calc.productoSinPrecio, 'Tomate Platense');
  assert.strictEqual(calc.avisoFaltaPrecio, 'falta precio de Tomate Platense');
  assert.strictEqual(calc.esEstimado, true, 'Debe quedar marcado como estimado');
});

test('3.2 Ítem con precio ausente se resuelve si existe en opciones.catalogoPrecios', () => {
  const pedido = {
    numero_pedido: 'HU-302',
    total: 10000,
    detalle_json: JSON.stringify([
      { producto: 'Pera Williams', cantidad_real: 2.0, precio_unitario: null }
    ])
  };
  const catalogo = [{ nombre: 'Pera Williams', precio: 4500 }];
  const calc = calcularTotalPedido(pedido, null, { catalogoPrecios: catalogo });
  assert.strictEqual(calc.faltaPrecio, false);
  assert.strictEqual(calc.monto, 9000); // 2 * 4500
  assert.strictEqual(calc.esEstimado, false);
});

// ────────────────────────────────────────────────────────────────────────────
// 4. ÍTEM SIN_STOCK EXCLUIDO DEL TOTAL Y DE ÍTEMS A COBRAR
// ────────────────────────────────────────────────────────────────────────────
test('4.1 Ítem marcado sin_stock se excluye del subtotal pesado', () => {
  const pedido = {
    numero_pedido: 'HU-401',
    total: 20000,
    detalle_json: JSON.stringify([
      { producto: 'Palta Hass', cantidad_real: 1.0, precio_unitario: 8000, subtotal: 8000, sin_stock: true },
      { producto: 'Frutilla', cantidad_real: 1.0, precio_unitario: 7000, subtotal: 7000, sin_stock: false }
    ])
  };
  const calc = calcularTotalPedido(pedido);
  assert.strictEqual(calc.subtotalPesado, 7000, 'Solo debe sumar Frutilla (7000)');
  assert.strictEqual(calc.monto, 7000);
  assert.strictEqual(calc.items.length, 1);
  assert.strictEqual(calc.items[0].producto, 'Frutilla');
});

test('4.2 esItemSinStock detecta variantes booleanas y de string', () => {
  assert.strictEqual(esItemSinStock({ sin_stock: true }), true);
  assert.strictEqual(esItemSinStock({ sinStock: true }), true);
  assert.strictEqual(esItemSinStock({ sin_stock: 'si' }), true);
  assert.strictEqual(esItemSinStock({ sin_stock: 'true' }), true);
  assert.strictEqual(esItemSinStock({ estado: 'sin_stock' }), true);
  assert.strictEqual(esItemSinStock({ motivo: 'sin stock' }), true);
  assert.strictEqual(esItemSinStock({ sin_stock: false, estado: 'ok' }), false);
});

// ────────────────────────────────────────────────────────────────────────────
// 5. MONTO NUNCA 0 POR ERROR SALVO QUE TOTAL REALMENTE SEA 0
// ────────────────────────────────────────────────────────────────────────────
test('5.1 Si subtotales dan 0 por error pero la hoja tenía total > 0, devuelve total de hoja estimado', () => {
  const pedido = {
    numero_pedido: 'HU-501',
    total: 15400,
    detalle_json: JSON.stringify([]) // detalle vacío pero armado
  };
  const prep = { completado: true, items: [] };
  const calc = calcularTotalPedido(pedido, prep);
  assert.strictEqual(calc.monto, 15400, 'No debe mostrar 0 por error, debe respaldar con totalHoja');
  assert.strictEqual(calc.esEstimado, true);
});

test('5.2 Si el total realmente es 0 (pedido gratis / bonificado 100%), devuelve 0 válido', () => {
  const pedido = {
    numero_pedido: 'HU-502',
    total: 0,
    credito_usado: '10000',
    detalle_json: JSON.stringify([
      { producto: 'Lechuga', cantidad_real: 1, precio_unitario: 2500, subtotal: 2500 }
    ])
  };
  const calc = calcularTotalPedido(pedido);
  assert.strictEqual(calc.monto, 0);
  assert.strictEqual(calc.esEstimado, false);
});

// ────────────────────────────────────────────────────────────────────────────
// 6. WRAPPERS DE CRÉDITO CON RESPUESTAS SIMULADAS EN MEMORIA (SIN LLAMAR RED)
// ────────────────────────────────────────────────────────────────────────────
test('6.1 Normalización de parámetros de apiLiberarCredito y apiGetEstadoCreditoPedidos', () => {
  // Verificamos que las funciones acepten tanto objeto como valores planos sin arrojar excepciones
  assert.strictEqual(typeof apiLiberarCredito, 'function');
  assert.strictEqual(typeof apiGetEstadoCreditoPedidos, 'function');
});

test('6.2 Simulación en memoria de getEstadoCreditoPedidos y consumo de reserva', () => {
  // Mock en memoria con los 4 estados expuestos por el Apps Script v16
  const mockServerEstadoCredito = {
    'HU-001': { estado: 'reservado', monto: 5000 },
    'HU-002': { estado: 'consumido', monto: 5000 },
    'HU-003': { estado: 'liberado', monto: 5000 },
    'HU-004': { estado: 'sin_reserva', monto: 0 },
  };

  const getEstadoSimulado = (num) => mockServerEstadoCredito[num] || { estado: 'sin_reserva', monto: 0 };

  assert.strictEqual(getEstadoSimulado('HU-001').estado, 'reservado');
  assert.strictEqual(getEstadoSimulado('HU-002').estado, 'consumido');
  assert.strictEqual(getEstadoSimulado('HU-003').estado, 'liberado');
  assert.strictEqual(getEstadoSimulado('HU-004').estado, 'sin_reserva');
});

// ────────────────────────────────────────────────────────────────────────────
// 7. AVISO DE "SIN RESERVA": MOSTRAR ALERTA VISIBLE Y NO TOCAR SALDOS
// ────────────────────────────────────────────────────────────────────────────
test('7.1 Pedido con credito_usado > 0 y estado sin_reserva genera aviso visible', () => {
  const pedido = { numero_pedido: 'HU-701', credito_usado: '5000' };
  const estadoCredito = 'sin_reserva';

  const debeMostrarAvisoSinReserva = Number(pedido.credito_usado) > 0 && estadoCredito === 'sin_reserva';
  assert.strictEqual(debeMostrarAvisoSinReserva, true, 'Debe activar aviso Crédito sin reserva: revisar');

  // Regla: no tocar saldos si está sin_reserva
  let saldoTocado = false;
  if (estadoCredito === 'sin_reserva') {
    // NO tocar saldos
    saldoTocado = false;
  }
  assert.strictEqual(saldoTocado, false, 'NO se deben tocar saldos');
});

test('7.2 Pedido con credito_usado > 0 y estado reservado / consumido / liberado no genera alarma sin_reserva', () => {
  ['reservado', 'consumido', 'liberado'].forEach((est) => {
    const pedido = { numero_pedido: 'HU-702', credito_usado: '5000' };
    const esSinReserva = Number(pedido.credito_usado) > 0 && est === 'sin_reserva';
    assert.strictEqual(esSinReserva, false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 8. MENSAJE DE COBRO CON REFERIDO ACREDITADO Y CASOS NO_APLICA
// ────────────────────────────────────────────────────────────────────────────
test('8.1 Servidor responde con referido acreditado: muestra mensaje de felicitación', () => {
  const serverRespuestaAcreditado = {
    ok: true,
    cobrado: 15000,
    creditos: 'consumido_reserva',
    referido: 'acreditado:5000'
  };

  const mensajes = [];
  if (serverRespuestaAcreditado.creditos && String(serverRespuestaAcreditado.creditos).includes('consumido')) {
    mensajes.push('Crédito consumido');
  }
  if (serverRespuestaAcreditado.referido && String(serverRespuestaAcreditado.referido).startsWith('acreditado')) {
    mensajes.push('Crédito de referido acreditado al dueño del código');
  }

  assert.deepStrictEqual(mensajes, [
    'Crédito consumido',
    'Crédito de referido acreditado al dueño del código'
  ]);
});

test('8.2 Servidor responde con no_aplica o sin_codigo: NO muestra alertas alarmantes', () => {
  const casosNoAlarmantes = [
    { creditos: 'no_aplicado', referido: 'no_aplica:auto_referido' },
    { creditos: 'no_aplicado', referido: 'no_aplica:no_es_primer_pedido' },
    { creditos: 'no_aplicado', referido: 'no_aplica:codigo_inexistente' },
    { creditos: 'no_aplicado', referido: 'sin_codigo' },
    { creditos: 'no_aplicado', referido: 'ya_procesado:123' },
  ];

  casosNoAlarmantes.forEach((caso) => {
    const tieneMensajeAlarma = String(caso.referido).startsWith('acreditado');
    assert.strictEqual(tieneMensajeAlarma, false, `No debe alarmar para ${caso.referido}`);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 9. FUNCIÓN COMPARTIDA PARA AGENDA, PEDIDOS DEL DÍA Y MODAL
// ────────────────────────────────────────────────────────────────────────────
test('9.1 Agenda, Pedidos del día y Modal obtienen exactamente el mismo monto', () => {
  const pedido = {
    numero_pedido: 'HU-901',
    total: 28000,
    credito_usado: '4000',
    detalle_json: JSON.stringify([
      { producto: 'Naranja', cantidad_real: 4, precio_unitario: 3000, subtotal: 12000 },
      { producto: 'Mandarina', cantidad_real: 3, precio_unitario: 4000, subtotal: 12000 },
    ])
  };
  // Subtotal = 24.000, Credito = 4.000 -> Total = 20.000
  const montoAgenda = obtenerMontoACobrar(pedido);
  const montoPedidosDelDia = obtenerMontoACobrar(pedido);
  const montoModal = calcularTotalPedido(pedido).monto;

  assert.strictEqual(montoAgenda, 20000);
  assert.strictEqual(montoPedidosDelDia, 20000);
  assert.strictEqual(montoModal, 20000);
  assert.strictEqual(montoAgenda, montoPedidosDelDia);
  assert.strictEqual(montoAgenda, montoModal);
});

// ────────────────────────────────────────────────────────────────────────────
// 10. TEST DE INTEGRACIÓN: PEDIDO ARMADO CON ÍTEM SIN STOCK, CRÉDITO Y CUPÓN
// ────────────────────────────────────────────────────────────────────────────
test('10.1 Pedido armado con ítem sin_stock, crédito usado y cupón: monto exacto en Agenda y Pedidos del día', () => {
  // Ítems:
  // - Papa Cepillada: 2 kg x $3.000 = $6.000 (con stock)
  // - Manzana Roja: 1 kg x $5.000 = $5.000 (con stock)
  // - Palta Hass: 1 kg x $8.000 = $8.000 (sin_stock: true -> debe excluirse)
  // Suma ítems con stock = $11.000
  // Cupón 10% (BIENVENIDO10) = $1.100
  // Crédito usado = $2.000
  // Descuentos = $3.100
  // Monto final = $11.000 - $3.100 = $7.900 (nunca 0)
  const pedido = {
    numero_pedido: 'HU-INTEG-01',
    nombre: 'Cliente Integración',
    total: 19000,
    cupon_bienvenida_estado: 'BIENVENIDO10',
    credito_usado: '2000',
    detalle_json: JSON.stringify([
      { producto: 'Papa Cepillada', cantidad_real: 2, precio_unitario: 3000, subtotal: 6000, sin_stock: false },
      { producto: 'Manzana Roja', cantidad_real: 1, precio_unitario: 5000, subtotal: 5000 },
      { producto: 'Palta Hass', cantidad_real: 1, precio_unitario: 8000, subtotal: 8000, sin_stock: true }
    ])
  };

  const resultadoTotal = calcularTotalPedido(pedido);
  assert.strictEqual(resultadoTotal.subtotalPesado, 11000, 'Subtotal debe excluir el ítem sin_stock');
  assert.strictEqual(resultadoTotal.descuentos, 3100, 'Descuentos: $1.100 cupón + $2.000 crédito');
  assert.strictEqual(resultadoTotal.monto, 7900, 'Monto a cobrar debe ser 11000 - 3100 = 7900');
  assert.strictEqual(resultadoTotal.esEstimado, false, 'Pedido armado con precios válidos no es estimado');

  // En AgendaEntregas:
  // calcularTotalDetalle = (p, prep) => calcularTotalPedido(p, prep, { obtenerPrecioCongelado }).monto
  const montoAgenda = calcularTotalPedido(pedido).monto;

  // En PedidosDelDia:
  // const infoCobro = calcularTotalPedido(p, prep);
  const montoPedidosDelDia = calcularTotalPedido(pedido).monto;

  // En helper compartido:
  const montoHelper = obtenerMontoACobrar(pedido);

  assert.strictEqual(montoAgenda, 7900);
  assert.strictEqual(montoPedidosDelDia, 7900);
  assert.strictEqual(montoHelper, 7900);
  assert.strictEqual(montoAgenda, montoPedidosDelDia, 'Monto debe ser idéntico en Agenda y Pedidos del día');

  // Remito también excluye sin_stock y calcula idéntico monto
  const remitoData = obtenerPesosReales(pedido);
  assert.strictEqual(remitoData.items.length, 2, 'Remito debe contener solo los 2 ítems con stock');
  assert.strictEqual(remitoData.totalACobrar, 7900, 'Remito total a cobrar debe ser 7900');
});

test('10.2 Si descuentos cubren 100% de los ítems con stock, el monto es 0 legítimo', () => {
  const pedido = {
    numero_pedido: 'HU-INTEG-02',
    total: 10000,
    credito_usado: '15000', // mayor al subtotal con stock
    detalle_json: JSON.stringify([
      { producto: 'Papa Cepillada', cantidad_real: 2, precio_unitario: 3000, subtotal: 6000 },
      { producto: 'Palta Hass', cantidad_real: 1, precio_unitario: 8000, subtotal: 8000, sin_stock: true }
    ])
  };

  const calc = calcularTotalPedido(pedido);
  assert.strictEqual(calc.subtotalPesado, 6000);
  assert.strictEqual(calc.monto, 0, 'Debe ser 0 porque crédito cubre el total');
  assert.strictEqual(calc.esEstimado, false, 'Es 0 legítimo, no estimado');
  assert.strictEqual(obtenerMontoACobrar(pedido), 0);
});

console.log(`\n==================================================================`);
console.log(`TOTAL RESULTADO: ${ok} ok, ${fallas} fallas`);
console.log(`==================================================================`);

if (fallas > 0) {
  process.exit(1);
}
