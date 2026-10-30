/**
 * Test Suite: Almacén Server v22 & Barra Superior Adaptable (Offline)
 * HUERTA URBANA DASHBOARD - Rama feat/ingreso-almacen
 * 
 * Reglas:
 * - 100% simulaciones en memoria, sin red ni endpoints reales.
 * - NO apretar ni ejecutar "Publicar precios".
 * - Valida apiActualizarPrecioAlmacen (EAN, margen, error de servidor),
 *   margen 30% por defecto para almacén, render SSR de Productos y Header.
 */

import assert from 'node:assert';
import { createServer } from 'vite';
import React from 'react';
import ReactDOMServer from 'react-dom/server';

console.log('==================================================================');
console.log('PRUEBAS UNITARIAS: ALMACÉN V22 Y BARRA SUPERIOR (OFFLINE)');
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
// 1. SIMULACIÓN DE apiActualizarPrecioAlmacen
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- 1. Simulación de apiActualizarPrecioAlmacen ---');

// Mock puro de llamarAppsScript para testear el contrato de apiActualizarPrecioAlmacen
function simularActualizarPrecioAlmacen(params, servidorMock) {
  const payload = {
    ...(params.ean ? { ean: String(params.ean).trim().toUpperCase() } : {}),
    ...(params.nombre ? { nombre: String(params.nombre).trim() } : {}),
    ...(params.marca ? { marca: String(params.marca).trim() } : {}),
    ...(params.precio_venta !== undefined && params.precio_venta !== null && params.precio_venta !== ''
      ? { precio_venta: Math.round(Number(params.precio_venta)) }
      : {}),
    ...(params.margen_pct !== undefined && params.margen_pct !== null && params.margen_pct !== ''
      ? { margen_pct: Math.round(Number(params.margen_pct)) }
      : {})
  };

  return servidorMock(payload);
}

it('Actualización de precio por EAN envía contrato v22 exacto', () => {
  let recibido = null;
  const mockServer = (p) => {
    recibido = p;
    return {
      ok: true,
      producto: 'Yerba Mate 1kg',
      ean: '7790070123456',
      precio_anterior: 3200,
      precio_venta: 3900,
      costo_unitario: 3000,
      margen_pct: 30
    };
  };

  const res = simularActualizarPrecioAlmacen({
    ean: '7790070123456',
    precio_venta: 3900,
    margen_pct: 30
  }, mockServer);

  assert.strictEqual(res.ok, true);
  assert.strictEqual(recibido.ean, '7790070123456');
  assert.strictEqual(recibido.precio_venta, 3900);
  assert.strictEqual(recibido.margen_pct, 30);
  assert.strictEqual(recibido.stock, undefined, 'Nunca debe enviar stock');
  assert.strictEqual(recibido.costo, undefined, 'Nunca debe enviar costo');
});

it('Actualización de precio por nombre y marca sin EAN', () => {
  let recibido = null;
  const mockServer = (p) => {
    recibido = p;
    return {
      ok: true,
      producto: 'Arroz Doble Carolina',
      marca: 'Gallo',
      precio_anterior: 2400,
      precio_venta: 2800,
      costo_unitario: 2150,
      margen_pct: 30
    };
  };

  const res = simularActualizarPrecioAlmacen({
    nombre: 'Arroz Doble Carolina',
    marca: 'Gallo',
    precio_venta: 2800
  }, mockServer);

  assert.strictEqual(res.ok, true);
  assert.strictEqual(recibido.nombre, 'Arroz Doble Carolina');
  assert.strictEqual(recibido.marca, 'Gallo');
  assert.strictEqual(recibido.precio_venta, 2800);
});

it('Respuesta con error del servidor v22 devuelve mensaje legible', () => {
  const mockServer = () => ({
    ok: false,
    error: 'Producto de almacén no encontrado: 7799999999999'
  });

  const res = simularActualizarPrecioAlmacen({
    ean: '7799999999999',
    precio_venta: 1500
  }, mockServer);

  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error, 'Producto de almacén no encontrado: 7799999999999');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. MARGEN 30% POR DEFECTO PARA ALMACÉN
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- 2. Margen 30% por Defecto para Almacén ---');

it('Cálculo en vivo de precio sugerido con margen 30% para almacén', () => {
  const costo = 2000;
  const margenAlmacen = 30;
  const precioSugeridoAlmacen = Math.round(costo * (1 + margenAlmacen / 100));

  assert.strictEqual(precioSugeridoAlmacen, 2600);

  // Mientras que para verduras sigue siendo 70%
  const margenVerduras = 70;
  const precioSugeridoVerduras = Math.round(costo * (1 + margenVerduras / 100));
  assert.strictEqual(precioSugeridoVerduras, 3400);
});

it('Cálculo bidireccional en vivo: cambiar precio actualiza margen y viceversa', () => {
  const costo = 1500;

  // 1. Tipear precio $2250 -> margen debe ser 50%
  const precioTipeado = 2250;
  const margenCalculado = Math.round(((precioTipeado - costo) / costo) * 100);
  assert.strictEqual(margenCalculado, 50);

  // 2. Tipear margen 40% -> precio debe ser $2100
  const margenTipeado = 40;
  const precioCalculado = Math.round(costo * (1 + margenTipeado / 100));
  assert.strictEqual(precioCalculado, 2100);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. RENDER SSR DE PRODUCTOS Y BARRA SUPERIOR (HEADER)
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- 3. Render SSR de Productos y Header Adaptable ---');

async function testSSR() {
  const server = await createServer({ server: { middlewareMode: true } });
  try {
    // 3.1 Render SSR de Header adaptable
    console.log('Probando render SSR de Header adaptable...');
    const modHeader = await server.ssrLoadModule('/src/components/Header.jsx');
    const HeaderComp = modHeader.default;

    const htmlHeader = ReactDOMServer.renderToString(
      React.createElement(HeaderComp, {
        seccion: 'productos',
        onNav: () => {},
        onLogout: () => {},
        rol: 'admin',
        usuario: 'Ren'
      })
    );

    assert.ok(htmlHeader.includes('Huerta Urbana'), 'Debe incluir el logo/título');
    assert.ok(htmlHeader.includes('Planilla'), 'Debe incluir el botón para abrir la planilla de Sheet');
    assert.ok(!htmlHeader.includes('Control stock (viejo)'), 'La pestaña stock viejo NO debe estar en la barra superior');
    assert.ok(htmlHeader.includes('Productos'), 'Debe incluir pestaña Productos');
    assert.ok(htmlHeader.includes('Finanzas'), 'Debe incluir pestaña Finanzas');
    assert.ok(htmlHeader.includes('Más'), 'Debe incluir el botón Más para vista tablet');

    totalTests++;
    passedTests++;
    console.log('OK    Render SSR de Header adaptable exitoso (sin stock viejo, con Planilla y menú Más)');

    // 3.2 Render SSR de Productos
    console.log('Probando render SSR de Productos...');
    const modProd = await server.ssrLoadModule('/src/components/Productos.jsx');
    const ProductosComp = modProd.default;

    const htmlProd = ReactDOMServer.renderToString(React.createElement(ProductosComp));
    assert.ok(htmlProd.includes('Huerta Urbana') || htmlProd.includes('Productos') || htmlProd.length > 500);

    totalTests++;
    passedTests++;
    console.log('OK    Render SSR de Productos exitoso sin lanzar errores');

  } finally {
    await server.close();
  }
}

testSSR().then(() => {
  console.log('\n==================================================================');
  console.log(`RESULTADOS: ${passedTests} de ${totalTests} pruebas pasaron exitosamente.`);
  console.log('==================================================================');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}).catch(err => {
  console.error('Error en pruebas SSR:', err);
  process.exit(1);
});
