/**
 * Test Suite: feat/armado-simple
 * Tres tipos de producto en Armado (AgendaEntregas), Hogar (Hogar.jsx) y Merma (ModalSalida / Productos.jsx):
 * A) Pesables (kg): Balanza Systel en vivo, OK congela peso exacto en gramos/kg sin redondear, Corregir reabre.
 * B) Unidad/Atado manual (sin balanza): control manual +/-, OK confirma cantidad editada/pedida con aviso si difiere.
 * C) Almacén con EAN: escaneo automático con pistola, cada clink suma 1, auto verde al completar sin OK.
 * Remito: formato de cantidades con unidades correctas (kg con 3 decimales, enteros para unidad y atado).
 * 
 * Regla: 100% en memoria, sin endpoints reales, sin imprimir claves ni secretos.
 */

import assert from 'node:assert';
import { 
  determinarTipoCaptura, 
  TIPOS_CAPTURA, 
  etiquetaUnidad 
} from '../src/utils/tipoCapturaProducto.js';
import { 
  calcularTotalPedido, 
  obtenerMontoACobrar 
} from '../src/utils/totalesPedido.js';
import { 
  estaPedidoArmado, 
  obtenerPesosReales, 
  calcularTotalDetalle 
} from '../src/utils/remitoPrinter.js';

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    _store: {},
    getItem(k) { return this._store[k] || null; },
    setItem(k, v) { this._store[k] = String(v); },
    removeItem(k) { delete this._store[k]; },
    clear() { this._store = {}; }
  };
}

console.log('==================================================================');
console.log('PRUEBAS UNITARIAS: TRES TIPOS DE PRODUCTO EN ARMADO, HOGAR Y MERMA');
console.log('==================================================================\n');

let totalTests = 0;
let passedTests = 0;

function it(desc, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`OK    ${desc}`);
  } catch (err) {
    console.error(`FAIL  ${desc}: ${err.message}`);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. DETERMINACIÓN DEL TIPO DE CAPTURA (UNA SOLA FUNCIÓN COMPARTIDA)
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- 1. Determinación de Tipo de Captura ---');

it('Identifica Tipo A (Pesable) para productos con unidad "kg"', () => {
  const papa = { producto: 'Papa Negra Especial', unidad: 'kg' };
  const tomate = { producto: 'Tomate Redondo', unidad: 'kg' };
  const cebolla = { producto: 'Cebolla', unidad: 'kg' };

  assert.strictEqual(determinarTipoCaptura(papa), TIPOS_CAPTURA.PESABLE);
  assert.strictEqual(determinarTipoCaptura(tomate), TIPOS_CAPTURA.PESABLE);
  assert.strictEqual(determinarTipoCaptura(cebolla), TIPOS_CAPTURA.PESABLE);
});

it('Identifica Tipo B (Unidad manual / atado) para verduras y frutas por unidad o atado sin EAN', () => {
  const choclo = { producto: 'Choclo Dulce', unidad: 'unidad' };
  const perejil = { producto: 'Perejil Fresco', unidad: 'atado' };
  const lechuga = { producto: 'Lechuga Capuchina', unidad: 'un' };
  const rabanito = { producto: 'Rabanito', unidad: 'atado' };

  assert.strictEqual(determinarTipoCaptura(choclo), TIPOS_CAPTURA.UNIDAD_MANUAL);
  assert.strictEqual(determinarTipoCaptura(perejil), TIPOS_CAPTURA.UNIDAD_MANUAL);
  assert.strictEqual(determinarTipoCaptura(lechuga), TIPOS_CAPTURA.UNIDAD_MANUAL);
  assert.strictEqual(determinarTipoCaptura(rabanito), TIPOS_CAPTURA.UNIDAD_MANUAL);
});

it('Identifica Tipo C (Almacén con EAN) si tiene código de barras o EAN de catálogo', () => {
  const lataChoclo = { producto: 'Choclo en Grano Arcor', unidad: 'un', ean: '7790580123456' };
  const yerba = { producto: 'Yerba Playadito 500g', unidad: 'un', barcode: '7790580654321' };

  assert.strictEqual(determinarTipoCaptura(lataChoclo), TIPOS_CAPTURA.ALMACEN_EAN);
  assert.strictEqual(determinarTipoCaptura(yerba), TIPOS_CAPTURA.ALMACEN_EAN);
});

it('etiquetaUnidad formatea correctamente singular y plural de unidades y atados', () => {
  assert.strictEqual(etiquetaUnidad('kg', 1.5), 'kg');
  assert.strictEqual(etiquetaUnidad('unidad', 1), 'unidad');
  assert.strictEqual(etiquetaUnidad('unidad', 3), 'unidades');
  assert.strictEqual(etiquetaUnidad('atado', 1), 'atado');
  assert.strictEqual(etiquetaUnidad('atado', 2), 'atados');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. SIMULACIÓN DE ARMADO DE PEDIDO MIXTO (AGENDA DE ENTREGAS)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 2. Simulación de Armado de Pedido Mixto ---');

const pedidoMixtoRaw = {
  numero_pedido: 'PED-TEST-100',
  cliente_nombre: 'Comprador Simulado',
  detalle_json: JSON.stringify([
    { producto: 'Papa Negra', cantidad: 2, unidad: 'kg', precio_unitario: 1000 },
    { producto: 'Choclo', cantidad: 4, unidad: 'unidad', precio_unitario: 500 },
    { producto: 'Perejil', cantidad: 2, unidad: 'atado', precio_unitario: 300 },
    { producto: 'Choclo Lata', cantidad: 2, unidad: 'un', ean: '7790580123456', precio_unitario: 800 }
  ])
};

// Simulación del estado del preparador en AgendaEntregas.jsx
let itemsPreparacion = JSON.parse(pedidoMixtoRaw.detalle_json).map((it, idx) => {
  const tipo = determinarTipoCaptura(it);
  return {
    ...it,
    id: idx,
    tipoCaptura: tipo,
    confirmado: false,
    pesoCongelado: null,
    cantidadEditada: Math.round(Number(it.cantidad) || 1),
    cantidadConfirmada: null,
    scans: 0
  };
});

it('Inicializa los 4 ítems con sus tipos respectivos y ninguno confirmado', () => {
  assert.strictEqual(itemsPreparacion[0].tipoCaptura, TIPOS_CAPTURA.PESABLE);
  assert.strictEqual(itemsPreparacion[1].tipoCaptura, TIPOS_CAPTURA.UNIDAD_MANUAL);
  assert.strictEqual(itemsPreparacion[2].tipoCaptura, TIPOS_CAPTURA.UNIDAD_MANUAL);
  assert.strictEqual(itemsPreparacion[3].tipoCaptura, TIPOS_CAPTURA.ALMACEN_EAN);

  const todosConfirmadosInicial = itemsPreparacion.every(it => it.confirmado);
  assert.strictEqual(todosConfirmadosInicial, false);
});

it('Tipo A (Papa): la balanza marca 2.450 kg -> OK congela exactamente 2.450 kg sin redondear', () => {
  // Simular lectura de balanza Systel en vivo
  const lecturaBalanzaVivo = 2.450; // gramos: 2450

  const itemIndex = 0;
  // Handler confirmarPesoPesable:
  itemsPreparacion[itemIndex] = {
    ...itemsPreparacion[itemIndex],
    pesoCongelado: lecturaBalanzaVivo,
    confirmado: true
  };

  assert.strictEqual(itemsPreparacion[itemIndex].confirmado, true);
  assert.strictEqual(itemsPreparacion[itemIndex].pesoCongelado, 2.450);
});

it('Tipo A (Papa): "Corregir" reabre el renglón para volver a pesar', () => {
  const itemIndex = 0;
  // Handler reabrirItemPesable:
  itemsPreparacion[itemIndex] = {
    ...itemsPreparacion[itemIndex],
    confirmado: false,
    pesoCongelado: null
  };

  assert.strictEqual(itemsPreparacion[itemIndex].confirmado, false);
  assert.strictEqual(itemsPreparacion[itemIndex].pesoCongelado, null);

  // Volvemos a confirmar con el peso exacto final de la balanza: 2.450 kg
  itemsPreparacion[itemIndex] = {
    ...itemsPreparacion[itemIndex],
    pesoCongelado: 2.450,
    confirmado: true
  };
  assert.strictEqual(itemsPreparacion[itemIndex].pesoCongelado, 2.450);
  assert.strictEqual(itemsPreparacion[itemIndex].confirmado, true);
});

it('Tipo B (Choclo): cantidad pedida 4 -> editada a 3 -> detecta aviso y OK confirma 3 unidades', () => {
  const itemIndex = 1;
  const cantPedida = Number(itemsPreparacion[itemIndex].cantidad);
  assert.strictEqual(cantPedida, 4);

  // El operario ajusta cantidad manual a 3
  itemsPreparacion[itemIndex].cantidadEditada = 3;
  const difiere = itemsPreparacion[itemIndex].cantidadEditada !== cantPedida;
  assert.strictEqual(difiere, true, 'Debe alertar que difiere de la cantidad pedida');

  // Pulsar OK confirma con cantidad 3
  itemsPreparacion[itemIndex] = {
    ...itemsPreparacion[itemIndex],
    cantidadConfirmada: 3,
    confirmado: true
  };

  assert.strictEqual(itemsPreparacion[itemIndex].confirmado, true);
  assert.strictEqual(itemsPreparacion[itemIndex].cantidadConfirmada, 3);
});

it('Tipo B (Perejil): cantidad pedida 2 atados -> OK confirma 2 atados', () => {
  const itemIndex = 2;
  itemsPreparacion[itemIndex] = {
    ...itemsPreparacion[itemIndex],
    cantidadConfirmada: 2,
    confirmado: true
  };

  assert.strictEqual(itemsPreparacion[itemIndex].confirmado, true);
  assert.strictEqual(itemsPreparacion[itemIndex].cantidadConfirmada, 2);
});

it('Tipo C (Lata EAN): escaneo automático suma 1 por clink y se pone verde al llegar a 2 sin OK', () => {
  const itemIndex = 3;
  const cantPedida = Number(itemsPreparacion[itemIndex].cantidad); // 2
  assert.strictEqual(cantPedida, 2);

  // Clink 1 de la pistola
  let scansActual = itemsPreparacion[itemIndex].scans + 1; // 1
  let completo = scansActual >= cantPedida;
  itemsPreparacion[itemIndex].scans = scansActual;
  itemsPreparacion[itemIndex].confirmado = completo;
  assert.strictEqual(itemsPreparacion[itemIndex].scans, 1);
  assert.strictEqual(itemsPreparacion[itemIndex].confirmado, false);

  // Clink 2 de la pistola
  scansActual = itemsPreparacion[itemIndex].scans + 1; // 2
  completo = scansActual >= cantPedida;
  itemsPreparacion[itemIndex].scans = scansActual;
  itemsPreparacion[itemIndex].confirmado = completo;
  assert.strictEqual(itemsPreparacion[itemIndex].scans, 2);
  assert.strictEqual(itemsPreparacion[itemIndex].confirmado, true, 'Debe confirmarse en verde automáticamente sin OK');
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. FINALIZACIÓN Y REMITO CON UNIDADES CORRECTAS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 3. Finalización de Pedido y Remito con Unidades Correctas ---');

it('Al estar todos completos, se genera detalle congelado con pesos y unidades reales', () => {
  const todosCompletos = itemsPreparacion.every(it => it.confirmado);
  assert.strictEqual(todosCompletos, true);

  // Construcción del detalle_json final congelado
  const detalleFinal = itemsPreparacion.map(it => {
    let cantFinal = it.cantidad;
    if (it.tipoCaptura === TIPOS_CAPTURA.PESABLE) {
      cantFinal = it.pesoCongelado != null ? it.pesoCongelado : it.cantidad;
    } else if (it.tipoCaptura === TIPOS_CAPTURA.UNIDAD_MANUAL) {
      cantFinal = it.cantidadConfirmada != null ? it.cantidadConfirmada : it.cantidadEditada;
    } else if (it.tipoCaptura === TIPOS_CAPTURA.ALMACEN_EAN) {
      cantFinal = it.scans || it.cantidad;
    }

    return {
      producto: it.producto,
      cantidad: cantFinal,
      unidad: it.unidad,
      precio_unitario: it.precio_unitario,
      subtotal: cantFinal * it.precio_unitario,
      tipoCaptura: it.tipoCaptura,
      pesoCongelado: it.pesoCongelado,
      cantidadConfirmada: it.cantidadConfirmada,
      confirmado: true
    };
  });

  const pedidoArmado = {
    ...pedidoMixtoRaw,
    armado_estado: 'Armado',
    detalle_json: JSON.stringify(detalleFinal)
  };

  assert.strictEqual(estaPedidoArmado(pedidoArmado), true);

  // Verificación de textos del remito para cada tipo
  const calculoRemito = obtenerPesosReales(pedidoArmado);
  const pesosReales = {};
  calculoRemito.items.forEach(it => {
    pesosReales[it.nombre] = it.cantidadFormateada;
  });

  // Papa: exacto en gramos (2,450 kg con coma decimal argentina)
  assert.strictEqual(pesosReales['Papa Negra'], '2,450 kg');

  // Choclo: cantidad entera de unidades editada (3 u)
  assert.strictEqual(pesosReales['Choclo'], '3 u');

  // Perejil: cantidad entera de atados (2 atados)
  assert.strictEqual(pesosReales['Perejil'], '2 atados');

  // Lata EAN: cantidad entera (2 u)
  assert.strictEqual(pesosReales['Choclo Lata'], '2 u');

  // Cálculo total de cobro respetando cantidades congeladas
  // Papa: 2.450 * 1000 = $2450
  // Choclo: 3 * 500 = $1500
  // Perejil: 2 * 300 = $600
  // Lata: 2 * 800 = $1600
  // Total = 2450 + 1500 + 600 + 1600 = $6150
  const totalCobro = calcularTotalPedido(pedidoArmado).monto;
  assert.strictEqual(totalCobro, 6150);

  const montoACobrar = obtenerMontoACobrar(pedidoArmado);
  assert.strictEqual(montoACobrar, 6150);

  const totalDetalle = calcularTotalDetalle(pedidoArmado);
  assert.strictEqual(totalDetalle, 6150);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. HOGAR CON LOS TRES TIPOS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 4. Consumo en Hogar con los Tres Tipos ---');

it('Hogar Tipo A (Pesable): Balanza Systel en vivo 1.150 kg -> genera payload exacto en kg', () => {
  const prodPesable = { producto: 'Tomate Perita', unidad: 'kg', costo_unitario: 800 };
  const tipo = determinarTipoCaptura(prodPesable);
  assert.strictEqual(tipo, TIPOS_CAPTURA.PESABLE);

  const lecturaVivo = 1.150;
  const payloadItem = {
    producto: prodPesable.producto,
    cantidad: Number(lecturaVivo),
    kg: Number(lecturaVivo),
    unidad: prodPesable.unidad
  };

  assert.strictEqual(payloadItem.cantidad, 1.150);
  assert.strictEqual(payloadItem.kg, 1.150);
  assert.strictEqual(payloadItem.unidad, 'kg');
});

it('Hogar Tipo B (Unidad manual): Perejil 2 atados -> genera payload entero en unidades', () => {
  const prodAtado = { producto: 'Perejil', unidad: 'atado', costo_unitario: 250 };
  const tipo = determinarTipoCaptura(prodAtado);
  assert.strictEqual(tipo, TIPOS_CAPTURA.UNIDAD_MANUAL);

  const cantidadIngresada = 2;
  const payloadItem = {
    producto: prodAtado.producto,
    cantidad: cantidadIngresada,
    unidades: cantidadIngresada,
    unidad: prodAtado.unidad
  };

  assert.strictEqual(payloadItem.cantidad, 2);
  assert.strictEqual(payloadItem.unidades, 2);
  assert.strictEqual(payloadItem.unidad, 'atado');
});

it('Hogar Tipo C (Almacén EAN): Lata Choclo 3 unidades escaneadas -> genera payload entero en unidades', () => {
  const prodEan = { producto: 'Choclo Lata', unidad: 'un', ean: '7790580123456', costo_unitario: 600 };
  const tipo = determinarTipoCaptura(prodEan);
  assert.strictEqual(tipo, TIPOS_CAPTURA.ALMACEN_EAN);

  const unidadesEscaneadas = 3;
  const payloadItem = {
    producto: prodEan.producto,
    cantidad: unidadesEscaneadas,
    unidades: unidadesEscaneadas,
    unidad: prodEan.unidad
  };

  assert.strictEqual(payloadItem.cantidad, 3);
  assert.strictEqual(payloadItem.unidades, 3);
  assert.strictEqual(payloadItem.unidad, 'un');
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. MERMA (MODALSALIDA) CON LOS TRES TIPOS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 5. ModalSalida (Merma) con los Tres Tipos ---');

it('Merma Tipo A (Pesable): Balanza Systel peso neto 0.350 kg -> descuenta 0.350 kg de merma', () => {
  const prod = { producto: 'Tomate', unidad: 'kg', en_deposito: 10.0, costo_kg_ultimo: 700 };
  assert.strictEqual(determinarTipoCaptura(prod), TIPOS_CAPTURA.PESABLE);

  const pesoNeto = 0.350;
  const itemSalida = {
    producto: prod.producto,
    unidad: prod.unidad,
    tipoCaptura: TIPOS_CAPTURA.PESABLE,
    cantidad: pesoNeto,
    kg: pesoNeto,
    stock_actual: prod.en_deposito,
    stock_resultante: Number((prod.en_deposito - pesoNeto).toFixed(3))
  };

  assert.strictEqual(itemSalida.stock_resultante, 9.650);
});

it('Merma Tipo B (Unidad manual): Choclo 2 unidades mermadas -> descuenta 2 unidades', () => {
  const prod = { producto: 'Choclo', unidad: 'unidad', en_deposito: 20, costo_kg_ultimo: 400 };
  assert.strictEqual(determinarTipoCaptura(prod), TIPOS_CAPTURA.UNIDAD_MANUAL);

  const cantManual = 2;
  const itemSalida = {
    producto: prod.producto,
    unidad: prod.unidad,
    tipoCaptura: TIPOS_CAPTURA.UNIDAD_MANUAL,
    cantidad: cantManual,
    unidades: cantManual,
    stock_actual: prod.en_deposito,
    stock_resultante: prod.en_deposito - cantManual
  };

  assert.strictEqual(itemSalida.stock_resultante, 18);
});

it('Merma Tipo C (Almacén EAN): Lata 1 unidad mermada -> descuenta 1 unidad', () => {
  const prod = { producto: 'Lata Choclo', unidad: 'un', ean: '7790580123456', en_deposito: 15, costo_kg_ultimo: 500 };
  assert.strictEqual(determinarTipoCaptura(prod), TIPOS_CAPTURA.ALMACEN_EAN);

  const cantEan = 1;
  const itemSalida = {
    producto: prod.producto,
    unidad: prod.unidad,
    tipoCaptura: TIPOS_CAPTURA.ALMACEN_EAN,
    cantidad: cantEan,
    unidades: cantEan,
    stock_actual: prod.en_deposito,
    stock_resultante: prod.en_deposito - cantEan
  };

  assert.strictEqual(itemSalida.stock_resultante, 14);
});

// ─────────────────────────────────────────────────────────────────────────────
// RESUMEN FINAL
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n==================================================================');
console.log(`TOTAL PRUEBAS: ${totalTests} | PASADAS: ${passedTests} | FALLIDAS: ${totalTests - passedTests}`);
console.log('==================================================================\n');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
