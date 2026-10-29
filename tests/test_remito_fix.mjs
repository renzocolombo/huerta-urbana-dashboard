// ============================================================================
// Suite de Pruebas Unitarias y de Integración: Remito, Precios y Cantidades
// Huerta Urbana Dashboard
// ============================================================================

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { 
  parsearCantidad, 
  formatearCantidad, 
  formatearMoneda, 
  formatearPrecioUnitario 
} from '../src/utils/formatoRemito.js';
import { 
  parsearProductosPedido, 
  obtenerPesosReales, 
  generarHojaRemitoHTML,
  setCatalogoPreciosWebCache,
  estaPedidoArmado,
  imprimirRemitoIndividual,
  imprimirRemitosEnLote
} from '../src/utils/remitoPrinter.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`OK    ${name}`);
    passed++;
  } catch (err) {
    console.error(`FAIL  ${name}`);
    console.error(`      ${err.message}`);
    failed++;
  }
}

console.log('==================================================================');
console.log('1. PARSEO Y FORMATO DE CANTIDADES (ARGENTINA)');
console.log('==================================================================');

test('parsearCantidad con coma decimal "4,250" devuelve 4.25 kg', () => {
  const res = parsearCantidad('4,250', 'kg');
  assert.strictEqual(res.valor, 4.25);
  assert.strictEqual(res.unidad, 'kg');
  assert.strictEqual(formatearCantidad(res.valor, res.unidad), '4,250 kg');
});

test('parsearCantidad con punto decimal "4.250" devuelve 4.25 kg', () => {
  const res = parsearCantidad('4.250', 'kg');
  assert.strictEqual(res.valor, 4.25);
  assert.strictEqual(res.unidad, 'kg');
  assert.strictEqual(formatearCantidad(res.valor, res.unidad), '4,250 kg');
});

test('parsearCantidad con gramos "4250 g" devuelve 4.25 kg', () => {
  const res = parsearCantidad('4250 g', 'kg');
  assert.strictEqual(res.valor, 4.25);
  assert.strictEqual(res.unidad, 'kg');
  assert.strictEqual(formatearCantidad(res.valor, res.unidad), '4,250 kg');
});

test('parsearCantidad entera "2" formatea como "2 u" o "2,000 kg"', () => {
  const res = parsearCantidad('2', 'un');
  assert.strictEqual(res.valor, 2);
  assert.strictEqual(formatearCantidad(res.valor, 'un'), '2 u');
  assert.strictEqual(formatearCantidad(res.valor, 'kg'), '2,000 kg');
});

test('parsearCantidad fraccionaria "0,5" devuelve 0.5', () => {
  const res = parsearCantidad('0,5', 'kg');
  assert.strictEqual(res.valor, 0.5);
  assert.strictEqual(formatearCantidad(res.valor, 'kg'), '0,500 kg');
  assert.strictEqual(formatearCantidad(res.valor, 'un'), '0,5 u');
});

test('formatearMoneda pesos argentinos', () => {
  assert.strictEqual(formatearMoneda(42972), '$42.972');
  assert.strictEqual(formatearMoneda(0), '$0');
  assert.strictEqual(formatearMoneda(-1500), '-$1.500');
});

test('formatearPrecioUnitario devuelve — si es nulo o 0', () => {
  assert.strictEqual(formatearPrecioUnitario(null), '—');
  assert.strictEqual(formatearPrecioUnitario(0), '—');
  assert.strictEqual(formatearPrecioUnitario(6611), '$6.611');
});

console.log('\n==================================================================');
console.log('2. PARSEO DE PRODUCTOS DEL PEDIDO (EVITAR ELEVAR AL CUADRADO)');
console.log('==================================================================');

test('parsearProductosPedido para "6.5 KILOS MANZANA ROJA" con cantidadGeneral 6.5 NO multiplica 6.5 * 6.5', () => {
  const items = parsearProductosPedido('6.5 KILOS MANZANA ROJA', 6.5);
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].nombre, 'MANZANA ROJA');
  assert.strictEqual(items[0].pesoSolicitado, 6.5);
  assert.strictEqual(items[0].cantidad, 6.5); // debe ser 6.5, nunca 42.25
});

test('parsearProductosPedido para varios productos con kilos especificados', () => {
  const items = parsearProductosPedido('1 KILO PAPA, 1 KILO CEBOLLA', 2);
  assert.strictEqual(items.length, 2);
  assert.strictEqual(items[0].nombre, 'PAPA');
  assert.strictEqual(items[0].pesoSolicitado, 1);
  assert.strictEqual(items[0].cantidad, 1);
  assert.strictEqual(items[1].nombre, 'CEBOLLA');
  assert.strictEqual(items[1].pesoSolicitado, 1);
  assert.strictEqual(items[1].cantidad, 1);
});

test('parsearProductosPedido para multiplicadores tipo "2x 2kg PAPA"', () => {
  const items = parsearProductosPedido('2x 2kg PAPA', 1);
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].nombre, 'PAPA');
  assert.strictEqual(items[0].pesoSolicitado, 2);
  assert.strictEqual(items[0].cantidad, 4); // 2 x 2kg = 4kg
});

console.log('\n==================================================================');
console.log('3. PEDIDO REAL HU-836253: REMITO SIN LEYENDAS Y TOTAL EXACTO');
console.log('==================================================================');

const catalogoTest = [
  { nombre: 'Manzana roja', precio: 6611, unidad: 'kg', categoria: 'Frutas' },
  { nombre: 'Papa', precio: 120, unidad: 'kg', categoria: 'Verduras' },
  { nombre: 'Remolacha', precio: 3825, unidad: 'kg', categoria: 'Verduras' }
];
setCatalogoPreciosWebCache(catalogoTest);

const pedidoRealHU836253 = {
  numero_pedido: 'HU-836253',
  producto: '6.5 KILOS MANZANA ROJA',
  cantidades: 6.5,
  total: 42972,
  forma_pago: 'entrega',
  metodo_pago: 'efectivo',
  dia_entrega: 'Viernes 30/10/2026 Tarde',
  credito_usado: '0',
  cupon_bienvenida_estado: '',
  detalle_json: ''
};

test('HU-836253: obtenerPesosReales calcula cantidad 6.500 kg y total $42.972', () => {
  const calculo = obtenerPesosReales(pedidoRealHU836253, null, { catalogoPrecios: catalogoTest });
  assert.strictEqual(calculo.items.length, 1);
  const it = calculo.items[0];
  assert.strictEqual(it.nombre, 'MANZANA ROJA');
  assert.strictEqual(it.cantidadReal, 6.5);
  assert.strictEqual(it.cantidadFormateada, '6,500 kg');
  assert.strictEqual(it.precioUnitario, 6611);
  assert.strictEqual(it.totalLinea, 42972); // 6.5 * 6611 = 42971.5 -> 42972
  assert.strictEqual(calculo.subtotal, 42972);
  assert.strictEqual(calculo.totalACobrar, 42972);
  assert.strictEqual(calculo.esPesado, false);
});

test('HU-836253: generarHojaRemitoHTML NO contiene "pedidos sin precios congelados"', () => {
  const html = generarHojaRemitoHTML(pedidoRealHU836253, null, 'ORIGINAL - CLIENTE', { catalogoPrecios: catalogoTest });
  
  // Requisito 1: Eliminar por completo la leyenda
  assert.ok(!html.toLowerCase().includes('precios congelados'), 'No debe contener ninguna mención de precios congelados');
  assert.ok(!html.includes('pedido sin precios congelados'), 'No debe contener "pedido sin precios congelados"');

  // Requisito 2: Tabla del remito con 4 columnas y valores correctos
  assert.ok(html.includes('<th class="th-desc">Producto</th>'), 'Debe tener encabezado Producto');
  assert.ok(html.includes('<th class="th-cant">Cantidad</th>'), 'Debe tener encabezado Cantidad');
  assert.ok(html.includes('<th class="th-unit">Precio unitario</th>'), 'Debe tener encabezado Precio unitario');
  assert.ok(html.includes('<th class="th-total">Importe</th>'), 'Debe tener encabezado Importe');
  
  assert.ok(html.includes('6,500 kg'), 'Debe mostrar 6,500 kg');
  assert.ok(!html.includes('42,250'), 'JAMÁS debe mostrar 42,250');
  assert.ok(html.includes('$6.611'), 'Debe mostrar precio unitario $6.611');
  assert.ok(html.includes('$42.972'), 'Debe mostrar importe $42.972');

  // Requisito 2: Quitar leyenda de estimado y cualquier mención a estimado del remito
  assert.ok(!html.includes('Total estimado: puede variar según el peso real'), 'NO debe contener leyenda de total estimado');
  assert.ok(!html.toLowerCase().includes('estimado'), 'NO debe contener ninguna mención a estimado en el remito');

  // Requisitos Nuevos: Encabezado Emisor, Cliente y eliminación de IVA / Consumidor Final
  assert.ok(html.includes('Razón social: Renzo Alejandro Colombo'), 'Debe mostrar "Razón social: Renzo Alejandro Colombo"');
  assert.ok(html.includes('20-30219202-3'), 'Debe mantener el CUIT e Ingresos Brutos');
  assert.ok(html.includes('01/04/2026'), 'Debe mantener el Inicio de Actividades');
  assert.ok(!html.toLowerCase().includes('iva'), 'NO debe contener la palabra IVA en ningún lugar');
  assert.ok(!html.toLowerCase().includes('consumidor'), 'NO debe contener la palabra Consumidor en ningún lugar');
});

test('Cliente muestra el nombre del pedido o "Cliente" si está vacío, sin mostrar email', () => {
  const pConNombre = {
    ...pedidoRealHU836253,
    nombre: 'Juan Perez',
    email: 'juan@test.com',
    direccion: 'Calle Falsa 123',
    localidad: 'Pilar'
  };
  const htmlConNombre = generarHojaRemitoHTML(pConNombre, null, 'ORIGINAL - CLIENTE', { catalogoPrecios: catalogoTest });
  assert.ok(htmlConNombre.includes('Juan Perez'), 'Debe mostrar el nombre del cliente');
  assert.ok(htmlConNombre.includes('Calle Falsa 123, Pilar'), 'Debe mostrar dirección y localidad');
  assert.ok(!htmlConNombre.includes('juan@test.com'), 'NO debe mostrar el email');

  const pSinNombre = {
    ...pedidoRealHU836253,
    nombre: '',
    email: 'sin_nombre@test.com'
  };
  const htmlSinNombre = generarHojaRemitoHTML(pSinNombre, null, 'ORIGINAL - CLIENTE', { catalogoPrecios: catalogoTest });
  assert.ok(htmlSinNombre.includes('Cliente'), 'Debe mostrar "Cliente" si el nombre viene vacío');
  assert.ok(!htmlSinNombre.toLowerCase().includes('consumidor'), 'NO debe decir Consumidor');
  assert.ok(!htmlSinNombre.toLowerCase().includes('iva'), 'NO debe decir IVA');
});

console.log('\n==================================================================');
console.log('4. PEDIDOS CON Y SIN DESCUENTO');
console.log('==================================================================');

test('Pedido con cupón de bienvenida BIENVENIDO10 (10% descuento)', () => {
  const pedidoCupon = {
    numero_pedido: 'HU-178776',
    producto: '1 KILO PAPA',
    cantidades: 1,
    total: 108,
    forma_pago: 'mercadopago',
    cupon_bienvenida_estado: 'BIENVENIDO10',
    credito_usado: ''
  };
  const calculo = obtenerPesosReales(pedidoCupon, null, { catalogoPrecios: catalogoTest });
  assert.strictEqual(calculo.subtotal, 120);
  assert.strictEqual(calculo.descuentoCupon, 12);
  assert.strictEqual(calculo.totalACobrar, 108);

  const html = generarHojaRemitoHTML(pedidoCupon, null, 'ORIGINAL - CLIENTE', { catalogoPrecios: catalogoTest });
  assert.ok(html.includes('Cupón bienvenida (BIENVENIDO10):'), 'Debe mostrar el nombre del cupón');
  assert.ok(html.includes('-$12'), 'Debe mostrar el descuento de $12');
  assert.ok(html.includes('$108'), 'Debe mostrar el total final');
});

test('Pedido con crédito de referido usado', () => {
  const pedidoCredito = {
    numero_pedido: 'HU-780105',
    producto: '9 KILOS REMOLACHA',
    cantidades: 9,
    total: 24425,
    forma_pago: 'mercadopago',
    cupon_bienvenida_estado: '',
    credito_usado: '10000'
  };
  const calculo = obtenerPesosReales(pedidoCredito, null, { catalogoPrecios: catalogoTest });
  assert.strictEqual(calculo.subtotal, 34425); // 9 * 3825 = 34425
  assert.strictEqual(calculo.descuentoCredito, 10000);
  assert.strictEqual(calculo.totalACobrar, 24425);

  const html = generarHojaRemitoHTML(pedidoCredito, null, 'ORIGINAL - CLIENTE', { catalogoPrecios: catalogoTest });
  assert.ok(html.includes('Crédito de referido:'), 'Debe mostrar Crédito de referido');
  assert.ok(html.includes('-$10.000'), 'Debe mostrar -$10.000');
  assert.ok(html.includes('$24.425'), 'Debe mostrar total $24.425');
});

console.log('\n==================================================================');
console.log('5. PEDIDO PESADO VS SIN PESAR');
console.log('==================================================================');

console.log('\n==================================================================');
console.log('5. PEDIDO ARMADO / PESADO VS PEDIDO SIN ARMAR');
console.log('==================================================================');

test('estaPedidoArmado devuelve false para pedido sin pesadas reales ni detalle_json', () => {
  const pedidoSinArmar = {
    numero_pedido: 'HU-111111',
    producto: '6 KILOS PAPA',
    cantidades: 6,
    total: 12000,
    estado: 'pendiente'
  };
  assert.strictEqual(estaPedidoArmado(pedidoSinArmar, null), false);
  assert.strictEqual(estaPedidoArmado(pedidoSinArmar, { items: [] }), false);
});

test('estaPedidoArmado devuelve true si pedido tiene detalle_json de armado', () => {
  const pedidoArmado = {
    numero_pedido: 'HU-222222',
    detalle_json: JSON.stringify([
      { producto: 'PAPA', cantidad_real: 6.350, unidad: 'kg', precio_unitario: 2000, subtotal: 12700 }
    ])
  };
  assert.strictEqual(estaPedidoArmado(pedidoArmado, null), true);
});

test('estaPedidoArmado devuelve true si preparación local está completada con pesadas', () => {
  const pedido = { numero_pedido: 'HU-333333' };
  const prep = {
    completado: true,
    items: [
      { nombre: 'PAPA', bolsasAsignadas: [{ peso: 3.250 }, { peso: 3.100 }] }
    ]
  };
  assert.strictEqual(estaPedidoArmado(pedido, prep), true);
});

test('Bloqueo de impresión: imprimirRemitoIndividual no procede si pedido no está armado', async () => {
  const pedidoSinArmar = { numero_pedido: 'HU-444444' };
  let alertLlamado = false;
  // Simular entorno de navegador
  globalThis.window = {
    alert: (msg) => { alertLlamado = true; },
    open: () => { throw new Error('No debe abrirse ventana'); }
  };

  await imprimirRemitoIndividual(pedidoSinArmar, null);
  assert.strictEqual(alertLlamado, true, 'Debe disparar aviso al operador para pedido no armado');
});

test('Impresión masiva: omite los pedidos no armados y avisa al operador', async () => {
  const pedidoArmado = {
    numero_pedido: 'HU-ARMADO-1',
    detalle_json: [{ producto: 'TOMATE', cantidad_real: 2, unidad: 'kg', precio_unitario: 3000, subtotal: 6000 }]
  };
  const pedidoNoArmado = {
    numero_pedido: 'HU-PEND-2',
    producto: 'LECHUGA'
  };

  let avisoOmitidos = '';
  let ventanaAbierta = false;

  globalThis.window = {
    alert: (msg) => { avisoOmitidos = msg; },
    open: () => ({
      document: {
        write: () => {},
        open: () => {},
        close: () => {}
      }
    })
  };

  await imprimirRemitosEnLote([pedidoArmado, pedidoNoArmado], {}, 'Test Lote');
  assert.ok(avisoOmitidos.includes('Se omitieron 1 pedidos sin armar (#HU-PEND-2)'), 'Debe alertar que se omitió el no armado');
});

console.log('\n==================================================================');
console.log('6. REMITO DE PEDIDO ARMADO: 2 PESADAS REALES, PRECIOS CONGELADOS Y TOTAL EXACTO');
console.log('==================================================================');

test('Pedido armado con 2 pesadas reales calcula 6,350 kg, usa precio congelado de detalle_json y no tiene leyendas de estimado', () => {
  const pedidoArmadoConPesadas = {
    numero_pedido: 'HU-836253',
    nombre: 'Agustina Gomez',
    telefono: '1165432198',
    direccion: 'Av. Corrientes 1234',
    localidad: 'Almagro',
    dia_entrega: 'Viernes 30/10/2026 Mañana',
    forma_pago: 'entrega',
    total: 42972,
    detalle_json: JSON.stringify([
      {
        producto: 'MANZANA ROJA',
        cantidad_real: 6.350,
        unidad: 'kg',
        precio_unitario: 6611,
        subtotal: 41980
      }
    ])
  };

  // Catálogo actual con precio DISTINTO para probar que SIEMPRE prevalece detalle_json
  const catalogoModificado = [{ nombre: 'MANZANA ROJA', precio: 99999 }];

  const calculo = obtenerPesosReales(pedidoArmadoConPesadas, null, { catalogoPrecios: catalogoModificado });
  assert.strictEqual(calculo.tieneDetalleJson, true);
  assert.strictEqual(calculo.items[0].cantidadReal, 6.350);
  assert.strictEqual(calculo.items[0].cantidadFormateada, '6,350 kg');
  assert.strictEqual(calculo.items[0].precioUnitario, 6611, 'Debe respetar el precio congelado en detalle_json y no el catálogo actual');
  assert.strictEqual(calculo.items[0].totalLinea, 41980);
  assert.strictEqual(calculo.subtotal, 41980);
  assert.strictEqual(calculo.totalACobrar, 41980);

  const html = generarHojaRemitoHTML(pedidoArmadoConPesadas, null, 'ORIGINAL - CLIENTE', {
    catalogoPrecios: catalogoModificado,
    numeroRemito: '0001-00000093'
  });

  // Verificaciones de contenido y ausencia de leyendas de estimado
  assert.ok(html.includes('6,350 kg'), 'Debe mostrar 6,350 kg');
  assert.ok(html.includes('$6.611'), 'Debe mostrar precio unitario congelado $6.611');
  assert.ok(html.includes('$41.980'), 'Debe mostrar total a cobrar $41.980');
  assert.ok(html.includes('Precio final calculado sobre el peso real entregado.'), 'Debe indicar cálculo sobre peso real');
  assert.ok(!html.includes('Total estimado: puede variar según el peso real'), 'NO debe contener leyenda de total estimado');
  assert.ok(!html.includes('aviso-total-estimado'), 'NO debe tener clase aviso-total-estimado');
  assert.ok(!html.toLowerCase().includes('estimado'), 'NO debe tener ninguna mención a estimado en el remito');
});

test('Pedido armado con múltiples descuentos (cupón bienvenida + crédito referido + promo)', () => {
  const pedidoConDescuentos = {
    numero_pedido: 'HU-DESC-01',
    nombre: 'Laura Morales',
    forma_pago: 'entrega',
    cupon_bienvenida_estado: 'BIENVENIDO10',
    credito_usado: '5000',
    descuento_promocion: 2000,
    promocion_nombre: 'Promo Primavera',
    detalle_json: JSON.stringify([
      { producto: 'BOLSON VERDURAS', cantidad_real: 2, unidad: 'un', precio_unitario: 25000, subtotal: 50000 }
    ])
  };

  const calculo = obtenerPesosReales(pedidoConDescuentos, null);
  // Subtotal = 50.000
  // Cupón 10% = 5.000
  // Crédito = 5.000
  // Promo = 2.000
  // Descuentos = 12.000 -> Total = 38.000
  assert.strictEqual(calculo.subtotal, 50000);
  assert.strictEqual(calculo.descuentoCupon, 5000);
  assert.strictEqual(calculo.descuentoCredito, 5000);
  assert.strictEqual(calculo.descuentos, 12000);
  assert.strictEqual(calculo.totalACobrar, 38000);

  const html = generarHojaRemitoHTML(pedidoConDescuentos, null, 'ORIGINAL - CLIENTE');
  assert.ok(html.includes('Subtotal:'), 'Debe contener Subtotal');
  assert.ok(html.includes('$50.000'), 'Debe mostrar subtotal $50.000');
  assert.ok(html.includes('Cupón bienvenida (BIENVENIDO10):'), 'Debe mostrar cupón');
  assert.ok(html.includes('-$5.000'), 'Debe mostrar -$5.000 cupón');
  assert.ok(html.includes('Crédito de referido:'), 'Debe mostrar crédito referido');
  assert.ok(html.includes('-$5.000'), 'Debe mostrar -$5.000 crédito');
  assert.ok(html.includes('Promo Primavera:'), 'Debe mostrar la promo con su nombre');
  assert.ok(html.includes('-$2.000'), 'Debe mostrar -$2.000 promo');
  assert.ok(html.includes('$38.000'), 'Debe mostrar total a cobrar $38.000');
});

test('Pedido armado sin descuentos: subtotal y total a cobrar coinciden', () => {
  const pedidoSinDesc = {
    numero_pedido: 'HU-NODESC-01',
    detalle_json: JSON.stringify([
      { producto: 'FRUTILLAS', cantidad_real: 1.5, unidad: 'kg', precio_unitario: 10000, subtotal: 15000 }
    ])
  };

  const calculo = obtenerPesosReales(pedidoSinDesc, null);
  assert.strictEqual(calculo.subtotal, 15000);
  assert.strictEqual(calculo.descuentos, 0);
  assert.strictEqual(calculo.totalACobrar, 15000);

  const html = generarHojaRemitoHTML(pedidoSinDesc, null, 'ORIGINAL - CLIENTE');
  assert.ok(html.includes('$15.000'), 'Debe mostrar $15.000');
  assert.ok(html.includes('Descuentos:'), 'Debe mostrar línea de Descuentos');
  assert.ok(html.includes('—'), 'Descuentos vacíos debe mostrar guion');
});

console.log('\n==================================================================');
console.log(`TOTAL RESULTADO: ${passed} ok, ${failed} fallas`);
console.log('==================================================================\n');

// Guardar vista previa HTML de pedido armado de ejemplo (HU-836253)
const pedidoEjemploArmado = {
  numero_pedido: 'HU-836253',
  nombre: 'Agustina Gomez',
  telefono: '1165432198',
  direccion: 'Av. Corrientes 1234, CABA',
  localidad: 'Almagro',
  dia_entrega: 'Viernes 30/10/2026 Mañana',
  forma_pago: 'entrega',
  observaciones: 'Tocar timbre 3B',
  detalle_json: JSON.stringify([
    {
      producto: 'MANZANA ROJA',
      cantidad_real: 6.350,
      unidad: 'kg',
      precio_unitario: 6611,
      subtotal: 41980
    }
  ])
};

const htmlPreview = generarHojaRemitoHTML(pedidoEjemploArmado, null, 'ORIGINAL - CLIENTE', {
  numeroRemito: '0001-00000093'
});

const previewPathActual = path.resolve('C:/Users/renzo/.gemini/antigravity-ide/brain/2596cf92-12a0-4eff-a339-5dc10c4baa47/scratch/remito_preview_armado.html');
fs.mkdirSync(path.dirname(previewPathActual), { recursive: true });
fs.writeFileSync(previewPathActual, `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Vista Previa Remito Armado HU-836253</title></head><body>${htmlPreview}</body></html>`, 'utf8');
console.log(`[PREVIEW] Vista previa regenerada en: ${previewPathActual}`);

// Mantener retrocompatibilidad en path anterior si la carpeta existe
try {
  const previewPathPrev = path.resolve('C:/Users/renzo/.gemini/antigravity-ide/brain/aca635ac-bb31-47b6-826b-18ed6a48d511/scratch/remito_preview_HU-836253.html');
  fs.mkdirSync(path.dirname(previewPathPrev), { recursive: true });
  fs.writeFileSync(previewPathPrev, `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Vista Previa Remito HU-836253</title></head><body>${htmlPreview}</body></html>`, 'utf8');
} catch (_) {}

process.exitCode = failed > 0 ? 1 : 0;
