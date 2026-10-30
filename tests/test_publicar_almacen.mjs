/**
 * Test Suite: Publicación Unificada de Catálogo (Verdura + Almacén) y Render SSR
 * HUERTA URBANA DASHBOARD - Rama feat/ingreso-almacen
 * 
 * Reglas:
 * - 100% simulaciones en memoria, sin red ni endpoints reales.
 * - NO apretar ni ejecutar "Publicar precios" en ningún test con red.
 * - Valida armado de payload mixto, filtros de stock 0 y filas vacías, exclusión de items
 *   sin precio/costo, resumen de confirmación, y render SSR sin errores.
 */

import assert from 'node:assert';
import { createServer } from 'vite';
import React from 'react';
import ReactDOMServer from 'react-dom/server';

console.log('==================================================================');
console.log('PRUEBAS UNITARIAS: PUBLICACIÓN UNIFICADA DE CATÁLOGO (OFFLINE)');
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
// 1. ARMADO DEL PAYLOAD MIXTO (VERDURAS + ALMACÉN)
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- 1. Armado del Payload Mixto ---');

// Función que emula la lógica pura de armado de payload en ModalPublicar
function armarPayloadPublicacion({ preciosList, margenesEditados = {}, calcularPrecioSugerido }) {
  const listValidos = [];
  const listSinPrecio = [];
  const conteo = {};
  let sinStockTotal = 0;

  (preciosList || []).forEach(p => {
    const esAlm = Boolean(p.es_almacen || p.categoria === 'Almacén' || String(p.categoria || '').toLowerCase().includes('almacen'));

    let nombreWeb = p.producto;
    let precioFinal = 0;
    let costoUnit = 0;
    let disponible = true;
    let cat = p.categoria || (esAlm ? 'Almacén' : 'Verduras');
    let subcat = p.subcategoria || (esAlm ? 'Almacén' : '');
    let unidad = esAlm ? 'un' : (p.unidad || 'kg');

    if (esAlm) {
      if (p.marca && p.marca.trim() && !p.producto.toLowerCase().includes(p.marca.toLowerCase())) {
        nombreWeb = `${p.producto} (${p.marca.trim()})`;
      } else {
        nombreWeb = p.producto;
      }
      costoUnit = Number(p.costo_unitario || p.costo_kg_ultimo || 0);
      precioFinal = Number(p.precio_venta || p.precio_sugerido || p.precio_publicado || 0);
      disponible = Number(p.stock_unidades || 0) > 0;
    } else {
      const margenActual = margenesEditados[p.producto] !== undefined ? margenesEditados[p.producto] : p.margen_pct;
      const sugerido = typeof calcularPrecioSugerido === 'function'
        ? calcularPrecioSugerido(p.costo_kg_ultimo, margenActual)
        : Math.round(Number(p.costo_kg_ultimo || 0) * (1 + (Number(margenActual) || 60) / 100));
      costoUnit = Number(p.costo_kg_ultimo || 0);
      precioFinal = sugerido > 0 ? sugerido : (Number(p.precio_publicado) || 0);
      disponible = p.disponible !== false;
    }

    if (precioFinal <= 0 || costoUnit <= 0) {
      listSinPrecio.push({
        producto: p.producto,
        categoria: cat,
        motivo: precioFinal <= 0 ? 'Sin precio ($0)' : 'Sin costo ($0)'
      });
      return;
    }

    if (!disponible) sinStockTotal++;

    conteo[cat] = (conteo[cat] || 0) + 1;

    listValidos.push({
      nombre: nombreWeb,
      precio: Math.round(precioFinal),
      disponible,
      categoria: cat,
      ...(subcat ? { subcategoria: subcat } : {}),
      unidad,
      ...(p.marca ? { marca: p.marca } : {})
    });
  });

  return {
    prodsParaPublicar: listValidos,
    prodsSinPrecioOCosto: listSinPrecio,
    conteoPorCategoria: conteo,
    cantSinStock: sinStockTotal
  };
}

it('Payload mixto incluye verduras y almacén con unidad y categorías correctas', () => {
  const catalogo = [
    {
      producto: 'Tomate Redondo',
      categoria: 'Verduras',
      unidad: 'kg',
      costo_kg_ultimo: 1500,
      margen_pct: 60,
      precio_publicado: 2400,
      disponible: true
    },
    {
      producto: 'Arroz Doble Carolina 1kg',
      marca: 'Gallo',
      categoria: 'Almacén',
      subcategoria: 'Legumbres y Arroz',
      codigo_ean: '7790070123456',
      costo_unitario: 1800,
      precio_venta: 3100,
      stock_unidades: 25,
      es_almacen: true
    }
  ];

  const resultado = armarPayloadPublicacion({
    preciosList: catalogo,
    calcularPrecioSugerido: (costo, margen) => Math.round(costo * (1 + margen / 100))
  });

  assert.strictEqual(resultado.prodsParaPublicar.length, 2);

  // Verdura
  const itemVerdura = resultado.prodsParaPublicar.find(p => p.nombre === 'Tomate Redondo');
  assert.ok(itemVerdura);
  assert.strictEqual(itemVerdura.precio, 2400);
  assert.strictEqual(itemVerdura.unidad, 'kg');
  assert.strictEqual(itemVerdura.disponible, true);
  assert.strictEqual(itemVerdura.categoria, 'Verduras');

  // Almacén
  const itemAlmacen = resultado.prodsParaPublicar.find(p => p.nombre.includes('Arroz'));
  assert.ok(itemAlmacen);
  assert.strictEqual(itemAlmacen.nombre, 'Arroz Doble Carolina 1kg (Gallo)', 'Debe anexar marca si no está en el nombre');
  assert.strictEqual(itemAlmacen.precio, 3100, 'Precio debe ser precio_venta de hoja Almacen');
  assert.strictEqual(itemAlmacen.unidad, 'un', 'Unidad de almacén debe ser un');
  assert.strictEqual(itemAlmacen.disponible, true);
  assert.strictEqual(itemAlmacen.categoria, 'Almacén');
  assert.strictEqual(itemAlmacen.subcategoria, 'Legumbres y Arroz');
});

it('Si la marca ya está en el nombre del producto de almacén, no se duplica', () => {
  const catalogo = [
    {
      producto: 'Fideos Lucchetti Guiseros 500g',
      marca: 'Lucchetti',
      categoria: 'Almacén',
      costo_unitario: 900,
      precio_venta: 1600,
      stock_unidades: 12,
      es_almacen: true
    }
  ];

  const resultado = armarPayloadPublicacion({ preciosList: catalogo });
  assert.strictEqual(resultado.prodsParaPublicar[0].nombre, 'Fideos Lucchetti Guiseros 500g');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. PRODUCTOS SIN PRECIO O SIN COSTO NO SE PUBLICAN Y SE ADVIERTEN
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- 2. Exclusión de Productos sin Precio o sin Costo ---');

it('Producto de almacén con precio 0 o sin costo NO se publica y se añade a advertencias', () => {
  const catalogo = [
    {
      producto: 'Aceite Girasol 1.5L',
      categoria: 'Almacén',
      costo_unitario: 1500,
      precio_venta: 0, // SIN PRECIO
      stock_unidades: 10,
      es_almacen: true
    },
    {
      producto: 'Sal Fina 500g',
      categoria: 'Almacén',
      costo_unitario: 0, // SIN COSTO
      precio_venta: 800,
      stock_unidades: 5,
      es_almacen: true
    },
    {
      producto: 'Lentejas 400g',
      categoria: 'Almacén',
      costo_unitario: 800,
      precio_venta: 1400,
      stock_unidades: 20,
      es_almacen: true
    }
  ];

  const resultado = armarPayloadPublicacion({ preciosList: catalogo });

  // Solo Lentejas tiene precio y costo válidos
  assert.strictEqual(resultado.prodsParaPublicar.length, 1);
  assert.strictEqual(resultado.prodsParaPublicar[0].nombre, 'Lentejas 400g');

  // 2 productos sin precio/costo quedan en la lista de advertencia
  assert.strictEqual(resultado.prodsSinPrecioOCosto.length, 2);
  assert.ok(resultado.prodsSinPrecioOCosto.some(p => p.producto === 'Aceite Girasol 1.5L'));
  assert.ok(resultado.prodsSinPrecioOCosto.some(p => p.producto === 'Sal Fina 500g'));
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. FILAS VACÍAS Y STOCK 0 EN HOJA ALMACÉN SON IGNORADAS EN LA PANTALLA
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- 3. Ignorar Filas Vacías y Stock 0 de Hoja Almacén ---');

it('Filas vacías de la hoja y productos de almacén con stock 0 NO se muestran como productos', () => {
  const filasSheetAlmacen = [
    { nombre: '', marca: '', stock_unidades: 10 }, // Fila vacía
    { nombre: '   ', stock_unidades: 5 },          // Espacios
    { nombre: null, stock_unidades: 2 },           // Null
    { nombre: 'Atún en Aceite 170g', stock_unidades: 0, precio_venta: 1800, costo_unitario: 1100 }, // Stock 0
    { nombre: 'Choclo en Grano 300g', stock_unidades: -2, precio_venta: 1200, costo_unitario: 700 }, // Stock negativo
    { nombre: 'Puré de Tomate 520g', stock_unidades: 30, precio_venta: 950, costo_unitario: 550 }   // Válido
  ];

  // Lógica de filtrado al cargar datos en Productos.jsx
  const productosAlmacenFiltrados = filasSheetAlmacen.filter(alm => {
    const nom = String(alm?.nombre || '').trim();
    if (!nom) return false; // Fila vacía
    const stock = Number(alm.stock_unidades || 0);
    if (stock <= 0) return false; // Stock 0 o negativo
    return true;
  });

  assert.strictEqual(productosAlmacenFiltrados.length, 1);
  assert.strictEqual(productosAlmacenFiltrados[0].nombre, 'Puré de Tomate 520g');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. DISPONIBILIDAD SEGÚN STOCK DE ALMACÉN
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- 4. Disponibilidad según stock_unidades > 0 ---');

it('Almacén: disponible es true si stock_unidades > 0 y false si es 0', () => {
  const prodConStock = {
    producto: 'Galletitas Agua 300g',
    categoria: 'Almacén',
    costo_unitario: 600,
    precio_venta: 1100,
    stock_unidades: 8,
    es_almacen: true
  };

  const prodSinStock = {
    producto: 'Yerba Playadito 500g',
    categoria: 'Almacén',
    costo_unitario: 1800,
    precio_venta: 3200,
    stock_unidades: 0,
    es_almacen: true
  };

  const resConStock = armarPayloadPublicacion({ preciosList: [prodConStock] });
  assert.strictEqual(resConStock.prodsParaPublicar[0].disponible, true);

  const resSinStock = armarPayloadPublicacion({ preciosList: [prodSinStock] });
  assert.strictEqual(resSinStock.prodsParaPublicar[0].disponible, false);
  assert.strictEqual(resSinStock.cantSinStock, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. RESUMEN DE CONFIRMACIÓN PREVIO A PUBLICAR
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- 5. Resumen de Confirmación de Categorías ---');

it('Resumen desglosa correctamente cantidad por categoría y conteo sin stock', () => {
  const catalogoMixto = [
    { producto: 'Lechuga Criolla', categoria: 'Verduras', costo_kg_ultimo: 1000, margen_pct: 60, disponible: true },
    { producto: 'Acelga', categoria: 'Verduras', costo_kg_ultimo: 800, margen_pct: 60, disponible: false },
    { producto: 'Manzana Gala', categoria: 'Frutas', costo_kg_ultimo: 1800, margen_pct: 50, disponible: true },
    { producto: 'Arroz 1kg', categoria: 'Almacén', costo_unitario: 1200, precio_venta: 2000, stock_unidades: 15, es_almacen: true },
    { producto: 'Fideos 500g', categoria: 'Almacén', costo_unitario: 800, precio_venta: 1400, stock_unidades: 0, es_almacen: true }
  ];

  const resumen = armarPayloadPublicacion({ preciosList: catalogoMixto });

  assert.strictEqual(resumen.prodsParaPublicar.length, 5);
  assert.strictEqual(resumen.conteoPorCategoria['Verduras'], 2);
  assert.strictEqual(resumen.conteoPorCategoria['Frutas'], 1);
  assert.strictEqual(resumen.conteoPorCategoria['Almacén'], 2);
  assert.strictEqual(resumen.cantSinStock, 2, 'Acelga y Fideos están sin stock');
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. RENDER SSR DE PRODUCTOS.JSX CON DATOS MIXTOS Y VACÍOS
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- 6. Render SSR de Pantalla Productos ---');

async function testSSR() {
  const server = await createServer({ server: { middlewareMode: true } });
  try {
    const mod = await server.ssrLoadModule('/src/components/Productos.jsx');
    const ComponenteProductos = mod.default;

    // Render 1: Componente Productos vacío inicial
    console.log('Probando render SSR de Productos con catálogo vacío inicial...');
    const htmlVacio = ReactDOMServer.renderToString(React.createElement(ComponenteProductos));
    assert.ok(htmlVacio.length > 500, 'Debe renderizar la estructura principal HTML');
    passedTests++;
    totalTests++;
    console.log('OK    Render SSR de Productos con catálogo inicial vacío sin errores');

    // Render 2: ModalPublicar con datos mixtos
    // Extraemos ModalPublicar para probarlo de forma aislada
    const fs = await import('fs');
    let code = fs.readFileSync('src/components/Productos.jsx', 'utf-8');
    code = code.replace('function ModalPublicar(', 'export function ModalPublicar(');
    fs.writeFileSync('src/components/Productos_ssr_test.jsx', code);

    const mod2 = await server.ssrLoadModule('/src/components/Productos_ssr_test.jsx');
    const ModalPublicarComp = mod2.ModalPublicar;

    const prodsMixtos = [
      { producto: 'Papa Negra', categoria: 'Verduras', unidad: 'kg', costo_kg_ultimo: 600, margen_pct: 60, precio_publicado: 960, disponible: true },
      { producto: 'Yerba Mate 1kg', marca: 'Playadito', categoria: 'Almacén', subcategoria: 'Infusiones', unidad: 'un', costo_unitario: 2200, precio_venta: 3800, stock_unidades: 18, es_almacen: true },
      { producto: 'Sin Precio Test', categoria: 'Almacén', unidad: 'un', costo_unitario: 500, precio_venta: 0, stock_unidades: 5, es_almacen: true }
    ];

    const htmlModal = ReactDOMServer.renderToString(React.createElement(ModalPublicarComp, {
      productosQueCambian: [
        { producto: 'Yerba Mate 1kg (Playadito)', precio_publicado: 3500, precio_sugerido: 3800, disponible: true }
      ],
      preciosList: prodsMixtos,
      margenesEditados: {},
      calcularPrecioSugerido: (c, m) => Math.round(c * (1 + m / 100)),
      onClose: () => {},
      onSuccess: () => {}
    }));

    assert.ok(htmlModal.includes('Publicar Catálogo en Tienda'));
    assert.ok(htmlModal.includes('Yerba Mate 1kg (Playadito)'));
    assert.ok(htmlModal.includes('productos sin precio o costo NO se publican'));
    passedTests++;
    totalTests++;
    console.log('OK    Render SSR de ModalPublicar con datos mixtos y advertencia de sin precio');

    fs.unlinkSync('src/components/Productos_ssr_test.jsx');
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
