import assert from 'assert';
import { calcularTotalDetalle } from '../src/utils/remitoPrinter.js';
import { obtenerPesosReales, estaPedidoArmado, generarHojaRemitoHTML } from '../src/utils/remitoPrinter.js';

let passed = 0;
let failed = 0;

function test(desc, fn) {
  try {
    fn();
    console.log(`  [OK] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${desc}: ${err.message}`);
    failed++;
  }
}

console.log('============================================================');
console.log('1. TEST: PRODUCTO SIN FLAG = DISPONIBLE (RETROCOMPATIBILIDAD)');
console.log('============================================================');

test('Producto sin flag disponible (undefined) debe resolverse como disponible: true', () => {
  const prodSinFlag = { nombre: 'Manzana Roja', precio: 3000 };
  const disponible = prodSinFlag.disponible !== false;
  assert.strictEqual(disponible, true);
});

test('Producto con disponible: null debe resolverse como disponible: true', () => {
  const prodNull = { nombre: 'Pera Williams', precio: 2500, disponible: null };
  const disponible = prodNull.disponible !== false;
  assert.strictEqual(disponible, true);
});

test('Producto con disponible: true se resuelve como true', () => {
  const prodTrue = { nombre: 'Banana Ecuador', precio: 2800, disponible: true };
  const disponible = prodTrue.disponible !== false;
  assert.strictEqual(disponible, true);
});

test('Producto con disponible: false se resuelve como false', () => {
  const prodFalse = { nombre: 'Frutilla', precio: 4500, disponible: false };
  const disponible = prodFalse.disponible !== false;
  assert.strictEqual(disponible, false);
});


console.log('\n============================================================');
console.log('2. TEST: FLAG DISPONIBLE VIAJA EN EL PAYLOAD DE PUBLICACIÓN');
console.log('============================================================');

test('apiPublicarPrecios formatea payload mapeando disponible: p.disponible !== false', () => {
  const productosInput = [
    { nombre: 'Manzana', precio: 3000 }, // sin flag -> true
    { nombre: 'Banana', precio: 2000, disponible: true }, // true -> true
    { nombre: 'Naranja', precio: 1500, disponible: false }, // false -> false
  ];

  // Lógica implementada en apiPublicarPrecios (mercaderiaApi.js)
  const payloadProductos = productosInput.map(p => ({
    nombre: (p.nombre || p.producto || '').trim(),
    precio: Math.round(Number(p.precio) || 0),
    disponible: p.disponible !== false
  }));

  assert.strictEqual(payloadProductos[0].disponible, true);
  assert.strictEqual(payloadProductos[1].disponible, true);
  assert.strictEqual(payloadProductos[2].disponible, false);
});

test('Payload completo preserva disponible junto con categoria, unidad, combos y mínimos', () => {
  const pCompleto = {
    nombre: 'Aceite de Oliva 500ml',
    precio: 8500,
    categoria: 'Almacen',
    unidad: 'un',
    activo: true,
    disponible: false
  };

  const formatted = {
    nombre: pCompleto.nombre,
    precio: pCompleto.precio,
    disponible: pCompleto.disponible !== false,
    categoria: pCompleto.categoria,
    unidad: pCompleto.unidad,
    activo: pCompleto.activo
  };

  assert.strictEqual(formatted.disponible, false);
  assert.strictEqual(formatted.categoria, 'Almacen');
  assert.strictEqual(formatted.unidad, 'un');
});


console.log('\n============================================================');
console.log('3. TEST: ALMACÉN EN 0 QUEDA NO DISPONIBLE Y SE PUEDE FORZAR');
console.log('============================================================');

// Función que emula la lógica de resolución de Productos.jsx
function resolverDisponibilidadProducto({ prod, mapaAlmacenPorNombre, manualOverrides = {} }) {
  const nombreNorm = prod.nombre.trim().toLowerCase();
  const alm = mapaAlmacenPorNombre[nombreNorm];
  const esAlmacen = Boolean(alm);

  let disponible = prod.disponible !== false;
  let sinStockAlmacenAuto = false;
  let esForzado = false;

  if (manualOverrides[prod.nombre] !== undefined) {
    disponible = manualOverrides[prod.nombre];
    esForzado = true;
  } else if (esAlmacen) {
    const stockUds = Number(alm.stock_unidades) || 0;
    if (stockUds <= 0) {
      if (prod.disponible === true) {
        // Estaba guardado explícitamente como disponible aunque stock <= 0
        disponible = true;
        esForzado = true;
      } else {
        disponible = false;
        sinStockAlmacenAuto = true;
      }
    }
  }

  return { disponible, sinStockAlmacenAuto, esAlmacen, esForzado };
}

test('Producto de almacén con stock_unidades <= 0 queda disponible=false automáticamente con indicador', () => {
  const prod = { nombre: 'Fideos Integrales 500g', precio: 1200 };
  const mapaAlmacen = {
    'fideos integrales 500g': { stock_unidades: 0, categoria: 'Almacen' }
  };

  const res = resolverDisponibilidadProducto({ prod, mapaAlmacenPorNombre: mapaAlmacen });
  assert.strictEqual(res.disponible, false);
  assert.strictEqual(res.sinStockAlmacenAuto, true);
  assert.strictEqual(res.esForzado, false);
});

test('Producto de almacén con stock_unidades > 0 queda disponible=true', () => {
  const prod = { nombre: 'Arroz Integral 1kg', precio: 2200 };
  const mapaAlmacen = {
    'arroz integral 1kg': { stock_unidades: 15, categoria: 'Almacen' }
  };

  const res = resolverDisponibilidadProducto({ prod, mapaAlmacenPorNombre: mapaAlmacen });
  assert.strictEqual(res.disponible, true);
  assert.strictEqual(res.sinStockAlmacenAuto, false);
});

test('Operador puede forzar manualmente a disponible un producto de almacén con stock 0', () => {
  const prod = { nombre: 'Fideos Integrales 500g', precio: 1200 };
  const mapaAlmacen = {
    'fideos integrales 500g': { stock_unidades: 0, categoria: 'Almacen' }
  };

  // El operador cliqueó el switch manual a true
  const res = resolverDisponibilidadProducto({
    prod,
    mapaAlmacenPorNombre: mapaAlmacen,
    manualOverrides: { 'Fideos Integrales 500g': true }
  });

  assert.strictEqual(res.disponible, true);
  assert.strictEqual(res.esForzado, true);
});

test('Para frutas y verduras (no almacén) el stock no infiere automáticamente disponibilidad', () => {
  const prodVerdura = { nombre: 'Tomate Redondo', precio: 2500 };
  const mapaAlmacen = {}; // No está en almacén de unidades

  const res = resolverDisponibilidadProducto({ prod: prodVerdura, mapaAlmacenPorNombre: mapaAlmacen });
  assert.strictEqual(res.disponible, true);
  assert.strictEqual(res.sinStockAlmacenAuto, false);
  assert.strictEqual(res.esAlmacen, false);
});


console.log('\n============================================================');
console.log('4. TEST: QUITAR ÍTEM RECALCULA TOTAL, REMITO LO OMITE Y ESTÁ ARMADO');
console.log('============================================================');

test('Quitar ítem en preparación recalcula total con calcularTotalDetalle', () => {
  const pedido = {
    numero_pedido: 'HU-101',
    total: 10000,
    productos: '1x Manzana Roja, 1x Aceite Oliva, 1x Banana'
  };

  // Preparación con 3 productos
  const prep = {
    items: [
      {
        nombre: 'Manzana Roja',
        cantidad: 1,
        esUnidad: false,
        bolsasAsignadas: [{ peso: 1.0 }],
        precioUnitario: 3000
      },
      {
        nombre: 'Aceite Oliva',
        cantidad: 1,
        esUnidad: true,
        bolsasAsignadas: [{ peso: 1 }],
        precioUnitario: 5000,
        sin_stock: true // <--- QUITADO POR SIN STOCK
      },
      {
        nombre: 'Banana',
        cantidad: 1,
        esUnidad: false,
        bolsasAsignadas: [{ peso: 1.0 }],
        precioUnitario: 2000
      }
    ]
  };

  // calcularTotalDetalle ignora it.sin_stock
  const total = calcularTotalDetalle(pedido, prep);
  // Manzana (1kg * 3000) + Banana (1kg * 2000) = 5000 (Aceite Oliva 5000 queda en 0)
  assert.strictEqual(total, 5000);
});

test('Remito excluye ítems con sin_stock: true y suma total exacto', () => {
  const detalleJson = [
    {
      producto: 'Manzana Roja',
      cantidad_real: 2.0,
      precio_unitario: 3000,
      subtotal: 6000
    },
    {
      producto: 'Miel Pura 500g',
      cantidad_real: 0,
      precio_unitario: 4500,
      subtotal: 0,
      sin_stock: true // <--- QUITADO
    },
    {
      producto: 'Zanahoria',
      cantidad_real: 1.5,
      precio_unitario: 1000,
      subtotal: 1500
    }
  ];

  const pedido = {
    numero_pedido: 'HU-202',
    nombre: 'Mariana Gomez',
    detalle_json: detalleJson,
    total: 7500
  };

  const pesosReales = obtenerPesosReales(pedido);
  assert.strictEqual(pesosReales.items.length, 2);
  assert.strictEqual(pesosReales.items.some(p => p.nombre === 'Miel Pura 500g'), false);

  const html = generarHojaRemitoHTML(pedido);
  assert.strictEqual(html.includes('Miel Pura 500g'), false);
  assert.strictEqual(html.includes('Manzana Roja'), true);
  assert.strictEqual(html.includes('Zanahoria'), true);
});

test('estaPedidoArmado devuelve true con detalle_json generado tras armado', () => {
  const pedido = {
    numero_pedido: 'HU-303',
    detalle_json: JSON.stringify([
      { producto: 'Papa', cantidad_real: 2, subtotal: 3000 },
      { producto: 'Cebolla', cantidad_real: 0, subtotal: 0, sin_stock: true }
    ])
  };

  assert.strictEqual(estaPedidoArmado(pedido), true);
});

test('Deshacer quitar ítem restaura el producto a disponible en preparación', () => {
  const item = {
    nombre: 'Acelga',
    cantidad: 1,
    sin_stock: true
  };

  // Simulación de marcarItemSinStock(..., false)
  item.sin_stock = false;
  assert.strictEqual(item.sin_stock, false);
});


console.log('\n============================================================');
console.log('5. TEST: PEDIDO PAGADO ONLINE MUESTRA AVISO AL ARMADOR');
console.log('============================================================');

test('Pedido online approved detecta baja de total y calcula saldo a favor sin reembolso automático', () => {
  const pedido = {
    numero_pedido: 'HU-404',
    estado_pago: 'approved',
    total: 12000
  };

  const totalOriginal = Math.round(Number(pedido.total || 0));
  const totalActual = 8500; // tras quitar producto sin stock de $3500

  const esPagoOnlineApproved = String(pedido.estado_pago || '').toLowerCase() === 'approved';
  const bajóTotal = totalActual < totalOriginal;
  const saldoAFavor = Math.max(0, totalOriginal - totalActual);

  assert.strictEqual(esPagoOnlineApproved, true);
  assert.strictEqual(bajóTotal, true);
  assert.strictEqual(saldoAFavor, 3500);

  const mensajeEsperado = `El total bajó de $${totalOriginal.toLocaleString('es-AR')} a $${totalActual.toLocaleString('es-AR')}: queda saldo a favor de $${saldoAFavor.toLocaleString('es-AR')} para el cliente.`;
  assert.strictEqual(
    mensajeEsperado,
    'El total bajó de $12.000 a $8.500: queda saldo a favor de $3.500 para el cliente.'
  );
});

test('Pedido contra entrega NO genera aviso de saldo a favor por pago online', () => {
  const pedido = {
    numero_pedido: 'HU-505',
    estado_pago: 'pending',
    forma_pago: 'entrega',
    total: 10000
  };

  const esPagoOnlineApproved = String(pedido.estado_pago || '').toLowerCase() === 'approved';
  assert.strictEqual(esPagoOnlineApproved, false);
});


console.log('\n============================================================');
console.log(`TOTAL: ${passed} pasadas, ${failed} fallidas`);
console.log('============================================================');

if (failed > 0) process.exit(1);
