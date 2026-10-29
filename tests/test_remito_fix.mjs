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
  setCatalogoPreciosWebCache 
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

  // Requisito 3: Pie del remito con aviso estimado para contra entrega sin pesar
  assert.ok(html.includes('Total estimado: puede variar según el peso real'), 'Debe indicar que el total es estimado');
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

test('Pedido armado con pesadas reales (esPesado = true) no muestra aviso estimado', () => {
  const prep = {
    completado: true,
    items: [
      {
        nombre: 'MANZANA ROJA',
        cantidad: 6.5,
        bolsasAsignadas: [
          { peso: 3.250, uniqueCode: 'B1' },
          { peso: 3.100, uniqueCode: 'B2' }
        ]
      }
    ]
  };
  const calculo = obtenerPesosReales(pedidoRealHU836253, prep, { catalogoPrecios: catalogoTest });
  assert.strictEqual(calculo.esPesado, true);
  assert.strictEqual(calculo.items[0].cantidadReal, 6.350); // 3.25 + 3.10
  assert.strictEqual(calculo.items[0].cantidadFormateada, '6,350 kg');
  assert.strictEqual(calculo.totalACobrar, Math.round(6.350 * 6611));

  const html = generarHojaRemitoHTML(pedidoRealHU836253, prep, 'ORIGINAL - CLIENTE', { catalogoPrecios: catalogoTest });
  assert.ok(html.includes('6,350 kg'), 'Debe mostrar el peso real de las bolsas');
  assert.ok(html.includes('Precio final calculado sobre el peso real entregado.'), 'Debe indicar que es sobre peso real entregado');
  assert.ok(!html.includes('Total estimado: puede variar según el peso real'), 'NO debe decir estimado cuando ya fue pesado');
});

test('Producto sin precio en catálogo muestra "—" y no rompe el remito', () => {
  const pedidoSinPrecio = {
    numero_pedido: 'HU-999999',
    producto: '1 KILO PITAYA EXOTICA, 1 KILO PAPA',
    cantidades: 2,
    total: 0,
    forma_pago: 'entrega'
  };
  const calculo = obtenerPesosReales(pedidoSinPrecio, null, { catalogoPrecios: catalogoTest });
  const html = generarHojaRemitoHTML(pedidoSinPrecio, null, 'ORIGINAL - CLIENTE', { catalogoPrecios: catalogoTest });
  assert.ok(html.includes('PITAYA EXOTICA'), 'Debe incluir el producto');
  assert.ok(!html.toLowerCase().includes('precios congelados'), 'No debe tener leyenda de precios congelados');
  assert.ok(html.includes('—'), 'Debe mostrar — para precio faltante');
});

console.log('\n==================================================================');
console.log(`TOTAL RESULTADO: ${passed} ok, ${failed} fallas`);
console.log('==================================================================\n');

// Guardar vista previa HTML para HU-836253
const htmlHU836253 = generarHojaRemitoHTML(pedidoRealHU836253, null, 'ORIGINAL - CLIENTE', {
  catalogoPrecios: catalogoTest,
  numeroRemito: '0001-00000093'
});

const previewPath = path.resolve('C:/Users/renzo/.gemini/antigravity-ide/brain/aca635ac-bb31-47b6-826b-18ed6a48d511/scratch/remito_preview_HU-836253.html');
fs.writeFileSync(previewPath, `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Vista Previa Remito HU-836253</title></head><body>${htmlHU836253}</body></html>`, 'utf8');
console.log(`[PREVIEW] Vista previa generada en: ${previewPath}`);

process.exitCode = failed > 0 ? 1 : 0;
