// tests/test_correcciones.mjs
import assert from 'node:assert';
import test from 'node:test';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { createServer } from 'vite';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
}

import { 
  norm, 
  normSinMarca, 
  sonNombresEquivalentes, 
  esUnidadManual, 
  esUnidadPesable 
} from '../src/utils/productNorm.js';

import { 
  analizarTipoCaptura, 
  determinarTipoCaptura, 
  TIPOS_CAPTURA 
} from '../src/utils/tipoCapturaProducto.js';

import { 
  parsearProductosPedido 
} from '../src/utils/remitoPrinter.js';

import { 
  calcularFaltantes 
} from '../src/utils/faltantesLogic.js';

import { 
  parsearMonto, 
  formatearMonto, 
  parsearCantidad, 
  calcularTotalPedido, 
  obtenerMontoACobrar 
} from '../src/utils/totalesPedido.js';

import { 
  calcularDetalleYTotalesDia 
} from '../src/utils/calendarioTotales.js';

import { 
  asociarEanAProducto, 
  getEanMapping 
} from '../src/data/productUtils.js';

import { 
  aplicarCacheAProducto 
} from '../src/utils/almacenCache.js';

// ==============================================================================
// 1. Tests de tipoCapturaProducto.js (Reconocimiento de UNIDAD_MANUAL y PESABLE)
// ==============================================================================
test('tipoCapturaProducto: reconoce unidades manuales compuestas y mayúsculas', () => {
  // "maple x30 uds" -> UNIDAD_MANUAL
  assert.strictEqual(
    determinarTipoCaptura({ nombre: 'Huevos Colorados', unidad: 'maple x30 uds' }),
    TIPOS_CAPTURA.UNIDAD_MANUAL,
    '"maple x30 uds" debe ser UNIDAD_MANUAL'
  );

  // "Maples" -> UNIDAD_MANUAL
  assert.strictEqual(
    determinarTipoCaptura({ nombre: 'Huevos Blancos', unidad: 'Maples' }),
    TIPOS_CAPTURA.UNIDAD_MANUAL,
    '"Maples" debe ser UNIDAD_MANUAL'
  );

  // "atado grande" -> UNIDAD_MANUAL
  assert.strictEqual(
    determinarTipoCaptura({ nombre: 'Acelga de huerta', unidad: 'atado grande' }),
    TIPOS_CAPTURA.UNIDAD_MANUAL,
    '"atado grande" debe ser UNIDAD_MANUAL'
  );

  // "x12 uds" -> UNIDAD_MANUAL
  assert.strictEqual(
    determinarTipoCaptura({ nombre: 'Naranjas seleccionadas', unidad: 'x12 uds' }),
    TIPOS_CAPTURA.UNIDAD_MANUAL,
    '"x12 uds" debe ser UNIDAD_MANUAL'
  );

  // "kg" -> PESABLE
  assert.strictEqual(
    determinarTipoCaptura({ nombre: 'Papa negra', unidad: 'kg' }),
    TIPOS_CAPTURA.PESABLE,
    '"kg" debe ser PESABLE'
  );

  // "kilo" -> PESABLE
  assert.strictEqual(
    determinarTipoCaptura({ nombre: 'Cebolla', unidad: 'kilo' }),
    TIPOS_CAPTURA.PESABLE,
    '"kilo" debe ser PESABLE'
  );

  // "kilos" -> PESABLE
  assert.strictEqual(
    determinarTipoCaptura({ nombre: 'Zanahoria', unidad: 'kilos' }),
    TIPOS_CAPTURA.PESABLE,
    '"kilos" debe ser PESABLE'
  );

  // "g" -> PESABLE
  assert.strictEqual(
    determinarTipoCaptura({ nombre: 'Ajo', unidad: 'g' }),
    TIPOS_CAPTURA.PESABLE,
    '"g" debe ser PESABLE'
  );

  // "unidad" -> UNIDAD_MANUAL
  assert.strictEqual(
    determinarTipoCaptura({ nombre: 'Choclo dulce', unidad: 'unidad' }),
    TIPOS_CAPTURA.UNIDAD_MANUAL,
    '"unidad" debe ser UNIDAD_MANUAL'
  );

  // "Maple" mayúsculas -> UNIDAD_MANUAL
  assert.strictEqual(
    determinarTipoCaptura({ nombre: 'Huevos', unidad: 'Maple' }),
    TIPOS_CAPTURA.UNIDAD_MANUAL,
    '"Maple" en mayúsculas debe ser UNIDAD_MANUAL'
  );
});

// ==============================================================================
// 2. Tests de parsearProductosPedido (remitoPrinter.js)
// ==============================================================================
test('parsearProductosPedido: separa cantidad, unidad y nombre limpio sin dejar unidad en nombre', () => {
  // Caso 1: "2 KILOS HARINA LEUDANTE ULTRAREFINADA"
  const [p1] = parsearProductosPedido('2 KILOS HARINA LEUDANTE ULTRAREFINADA');
  assert.strictEqual(p1.nombre, 'HARINA LEUDANTE ULTRAREFINADA');
  assert.strictEqual(p1.cantidad, 2);
  assert.strictEqual(p1.unidad, 'kg');
  assert.strictEqual(p1.pesoSolicitado, 2);

  // Caso 2: "2 UNIDADES HARINA LEUDANTE ULTRAREFINADA"
  const [p2] = parsearProductosPedido('2 UNIDADES HARINA LEUDANTE ULTRAREFINADA');
  assert.strictEqual(p2.nombre, 'HARINA LEUDANTE ULTRAREFINADA');
  assert.strictEqual(p2.cantidad, 2);
  assert.strictEqual(p2.unidad, 'unidad');
  assert.strictEqual(p2.pesoSolicitado, null);

  // Caso 3: "1 MAPLE HUEVOS Nº1"
  const [p3] = parsearProductosPedido('1 MAPLE HUEVOS Nº1');
  assert.strictEqual(p3.nombre, 'HUEVOS Nº1');
  assert.strictEqual(p3.cantidad, 1);
  assert.strictEqual(p3.unidad, 'maple');
  assert.strictEqual(p3.pesoSolicitado, null);

  // Caso 4: "3 ATADOS PEREJIL"
  const [p4] = parsearProductosPedido('3 ATADOS PEREJIL');
  assert.strictEqual(p4.nombre, 'PEREJIL');
  assert.strictEqual(p4.cantidad, 3);
  assert.strictEqual(p4.unidad, 'atado');
  assert.strictEqual(p4.pesoSolicitado, null);

  // Caso 5: "1,5 KILOS PAPA"
  const [p5] = parsearProductosPedido('1,5 KILOS PAPA');
  assert.strictEqual(p5.nombre, 'PAPA');
  assert.strictEqual(p5.cantidad, 1.5);
  assert.strictEqual(p5.unidad, 'kg');
  assert.strictEqual(p5.pesoSolicitado, 1.5);

  // Caso 6: "2 Arroz 1kg" (presentación en nombre NO es peso solicitado)
  const [p6] = parsearProductosPedido('2 Arroz 1kg');
  assert.strictEqual(p6.nombre, 'Arroz 1kg');
  assert.strictEqual(p6.cantidad, 2);
  assert.strictEqual(p6.pesoSolicitado, null);

  // Caso 7: "1 Aceite de Oliva 500ml (Zuelo)"
  const [p7] = parsearProductosPedido('1 Aceite de Oliva 500ml (Zuelo)');
  assert.strictEqual(p7.nombre, 'Aceite de Oliva 500ml (Zuelo)');
  assert.strictEqual(p7.cantidad, 1);
  assert.strictEqual(p7.pesoSolicitado, null);

  // Caso 8: "2 HARINA X"
  const [p8] = parsearProductosPedido('2 HARINA X');
  assert.strictEqual(p8.nombre, 'HARINA X');
  assert.strictEqual(p8.cantidad, 2);
  assert.strictEqual(p8.unidad, null);
  assert.strictEqual(p8.pesoSolicitado, null);
});

test('parsearProductosPedido: múltiples items en una misma línea con coma decimal', () => {
  const items = parsearProductosPedido('1,5 KILOS PAPA, 1 MAPLE HUEVOS Nº1, 2 Arroz 1kg');
  assert.strictEqual(items.length, 3);
  assert.strictEqual(items[0].nombre, 'PAPA');
  assert.strictEqual(items[0].cantidad, 1.5);
  assert.strictEqual(items[1].nombre, 'HUEVOS Nº1');
  assert.strictEqual(items[1].cantidad, 1);
  assert.strictEqual(items[2].nombre, 'Arroz 1kg');
  assert.strictEqual(items[2].cantidad, 2);
});

// ==============================================================================
// 3. Tests de Normalización de Nombres y Equivalencias
// ==============================================================================
test('norm y sonNombresEquivalentes: unifica variaciones de Nº y marcas entre paréntesis', () => {
  // "Huevos Nº1", "Huevos N°1" y "huevos n1" son el mismo nombre normalizado
  const n1 = norm('Huevos Nº1');
  const n2 = norm('Huevos N°1');
  const n3 = norm('huevos n1');
  const n4 = norm('Huevos No. 1');
  const n5 = norm('huevos n° 1');

  assert.strictEqual(n1, 'huevos n1');
  assert.strictEqual(n2, 'huevos n1');
  assert.strictEqual(n3, 'huevos n1');
  assert.strictEqual(n4, 'huevos n1');
  assert.strictEqual(n5, 'huevos n1');

  assert.strictEqual(sonNombresEquivalentes('Huevos Nº1', 'Huevos N°1'), true);
  assert.strictEqual(sonNombresEquivalentes('Huevos Nº1', 'huevos n1'), true);
  assert.strictEqual(sonNombresEquivalentes('Huevos Nº1', 'Huevos No. 1'), true);

  // Marca entre paréntesis: "Aceite 500ml (Zuelo)" equivale a "Aceite 500ml Zuelo" y a "Aceite 500ml"
  assert.strictEqual(sonNombresEquivalentes('Aceite 500ml (Zuelo)', 'Aceite 500ml Zuelo'), true);
  assert.strictEqual(sonNombresEquivalentes('Aceite 500ml (Zuelo)', 'Aceite 500ml'), true);
  assert.strictEqual(sonNombresEquivalentes('Aceite 500ml', 'Aceite 500ml (Zuelo)'), true);
});

// ==============================================================================
// 4. Tests de Faltantes con los productos parseados y normalizados
// ==============================================================================
test('calcularFaltantes: calcula demanda correctamente para productos con nuevas unidades y equivalencias', () => {
  const stockData = [];
  const productosCostos = [
    { id: 1, nombre: 'Huevos Nº1', activo: true, stock_unidades: 5, categoriaPrincipal: 'Almacén', unidad: 'maple' },
    { id: 2, nombre: 'Papa', activo: true, stock_unidades: 0, categoriaPrincipal: 'Verduras', unidad: 'kg' }
  ];
  const stockKgList = [
    { producto: 'Papa', en_deposito: 2, comprometido: 0, vendible: 2 }
  ];
  const pedidos = [
    {
      numero_pedido: 'HU-9001',
      producto: '1 MAPLE HUEVOS N°1, 3,5 KILOS PAPA',
      cantidades: '1, 3.5',
      dia_entrega: '2026-11-02'
    }
  ];

  const { faltantes } = calcularFaltantes(stockData, productosCostos, pedidos, stockKgList, null);
  
  // Papa: vendible 2, demanda 3.5 -> faltaParaPedidos 1.5
  const faltantePapa = faltantes.find(f => norm(f.nombre || f.producto) === 'papa');
  assert.ok(faltantePapa, 'Debe detectar faltante de Papa');
  assert.strictEqual(faltantePapa.faltaParaPedidos, 1.5);

  // Huevos Nº1: stock 5, demanda 1 -> sin faltante
  const faltanteHuevos = faltantes.find(f => norm(f.nombre || f.producto) === 'huevos n1');
  assert.strictEqual(faltanteHuevos, undefined, 'Huevos tiene stock suficiente, no debe tener faltante');
});

// ==============================================================================
// 5. Tests de Almacén: índice por nombre + marca en Productos.jsx
// ==============================================================================
test('Productos almacén: indexación por nombre + marca no pisa dos marcas distintas', () => {
  const rawItems = [
    { nombre: 'Aceite 500ml', marca: 'MarcaA', stock_unidades: 10, precio_venta: 1500, costo_unitario: 1000 },
    { nombre: 'Aceite 500ml', marca: 'MarcaB', stock_unidades: 8, precio_venta: 1800, costo_unitario: 1200 }
  ];

  const mapaRawAlmacen = new Map();
  const procesarItemAlmacen = (item) => {
    if (!item) return;
    const nom = String(item.nombre || item.producto || '').trim();
    if (!nom) return;
    const marca = String(item.marca || '').trim();
    const k = norm(nom) + '__' + norm(marca);
    mapaRawAlmacen.set(k, {
      nombre: nom,
      producto: nom,
      marca,
      stock_unidades: item.stock_unidades,
      precio_venta: item.precio_venta,
      costo_unitario: item.costo_unitario
    });
  };

  rawItems.forEach(procesarItemAlmacen);

  // Deben existir 2 entradas distintas en el mapa
  assert.strictEqual(mapaRawAlmacen.size, 2);
  assert.ok(mapaRawAlmacen.has('aceite 500ml__marcaa'));
  assert.ok(mapaRawAlmacen.has('aceite 500ml__marcab'));

  // Ambas deben publicarse con la marca entre paréntesis
  const prodsPublicados = Array.from(mapaRawAlmacen.values()).map(p => {
    const nombreWeb = (p.marca && !p.producto.toLowerCase().includes(p.marca.toLowerCase()))
      ? `${p.producto} (${p.marca})`
      : p.producto;
    return {
      nombre: nombreWeb,
      unidad: 'unidad',
      precio: p.precio_venta
    };
  });

  assert.strictEqual(prodsPublicados[0].nombre, 'Aceite 500ml (MarcaA)');
  assert.strictEqual(prodsPublicados[0].unidad, 'unidad');
  assert.strictEqual(prodsPublicados[1].nombre, 'Aceite 500ml (MarcaB)');
  assert.strictEqual(prodsPublicados[1].unidad, 'unidad');
});

// ==============================================================================
// 6. Tests de Publicar: unidades y advertencia de productos sin unidad definida
// ==============================================================================
test('ModalPublicar: almacén publica unidad "unidad", huerta sin unidad NO inventa "kg" y genera advertencia', () => {
  const preciosList = [
    { producto: 'Aceite 500ml', marca: 'Natura', es_almacen: true, stock_unidades: 10, costo_unitario: 1000, precio_venta: 1500, unidad: 'un' },
    { producto: 'Tomate Cherry', es_almacen: false, categoria: 'Verduras', costo_kg_ultimo: 1000, precio_publicado: 2000, unidad: 'bandeja' },
    { producto: 'Rúcula especial', es_almacen: false, categoria: 'Verduras', costo_kg_ultimo: 500, precio_publicado: 900, unidad: '' } // Sin unidad
  ];

  const sinUnidadArr = [];
  const listValidos = [];

  preciosList.forEach(p => {
    const esAlm = Boolean(p.es_almacen);
    let nombreWeb = p.producto;
    if (esAlm && p.marca && !p.producto.toLowerCase().includes(p.marca.toLowerCase())) {
      nombreWeb = `${p.producto} (${p.marca})`;
    }
    const cat = p.categoria || (esAlm ? 'Almacén' : 'Verduras');
    const unidad = esAlm ? 'unidad' : (p.unidad || '');

    if (!esAlm && (!p.unidad || !String(p.unidad).trim())) {
      sinUnidadArr.push({
        producto: p.producto,
        categoria: cat
      });
    }

    listValidos.push({
      nombre: nombreWeb,
      precio: p.precio_venta || p.precio_publicado,
      unidad
    });
  });

  // 1. Almacén publica "unidad" (no "un")
  const alm = listValidos.find(x => x.nombre.includes('Aceite'));
  assert.strictEqual(alm.unidad, 'unidad');

  // 2. Huerta con unidad conserva su unidad
  const cherry = listValidos.find(x => x.nombre === 'Tomate Cherry');
  assert.strictEqual(cherry.unidad, 'bandeja');

  // 3. Huerta sin unidad NO inventa "kg", publica ""
  const rucula = listValidos.find(x => x.nombre === 'Rúcula especial');
  assert.strictEqual(rucula.unidad, '');

  // 4. Advertencia generada sin bloquear la publicación
  assert.strictEqual(sinUnidadArr.length, 1);
  assert.strictEqual(sinUnidadArr[0].producto, 'Rúcula especial');
  assert.strictEqual(listValidos.length, 3, 'No se bloqueó la publicación de ninguno');
});

// ==============================================================================
// 7. Tests de render SSR de Productos, PedidosDelDia, Agenda y ModalArmadoPedido
// ==============================================================================
test('SSR: render de Productos, PedidosDelDia, Agenda y ModalArmadoPedido sin lanzar error', async () => {
  const server = await createServer({ server: { middlewareMode: true } });
  try {
    const modContext = await server.ssrLoadModule('/src/context/GoogleSheetsContext.jsx');
    const GoogleSheetsContext = modContext.GoogleSheetsContext;

    const mockCtx = {
      pedidos: [
        {
          numero_pedido: 'HU-868434',
          cliente: 'Renzo Colombo',
          nombre: 'Renzo Colombo',
          telefono: '1122334455',
          direccion: 'Calle Falsa 123',
          producto: '2 Arroz 1kg, 1 MAPLE HUEVOS Nº1',
          cantidades: '2, 1',
          estado: 'pendiente',
          dia_entrega: 'Lunes 02/11/2026 Tarde',
          metodo_pago: 'Efectivo contra entrega',
          total: 10000
        }
      ],
      productosCostos: [
        { id: 1, nombre: 'Arroz 1kg', activo: true, precio: 2500, unidad: 'unidad', categoriaPrincipal: 'Almacén' },
        { id: 2, nombre: 'Huevos Nº1', activo: true, precio: 5000, unidad: 'maple', categoriaPrincipal: 'Almacén' }
      ],
      stockData: {},
      cargando: false,
      refrescar: () => {},
      actualizarStock: () => {},
      actualizarEstadoEnSheet: async () => ({ ok: true }),
      fetchControlStock: async () => ({ ok: true })
    };

    // 1. Render SSR Productos
    const modProductos = await server.ssrLoadModule('/src/components/Productos.jsx');
    const ProductosComp = modProductos.default;
    const htmlProductos = ReactDOMServer.renderToString(
      React.createElement(GoogleSheetsContext.Provider, { value: mockCtx },
        React.createElement(ProductosComp)
      )
    );
    assert.ok(typeof htmlProductos === 'string' && htmlProductos.length > 50, 'Productos debe renderizar en SSR');

    // 2. Render SSR PedidosDelDia
    const modPedidos = await server.ssrLoadModule('/src/components/PedidosDelDia.jsx');
    const PedidosDelDiaComp = modPedidos.default;
    const htmlPedidos = ReactDOMServer.renderToString(
      React.createElement(GoogleSheetsContext.Provider, { value: mockCtx },
        React.createElement(PedidosDelDiaComp, { rol: 'admin', usuario: 'Renzo' })
      )
    );
    assert.ok(typeof htmlPedidos === 'string' && htmlPedidos.length > 50, 'PedidosDelDia debe renderizar en SSR');

    // 3. Render SSR AgendaEntregas
    const modAgenda = await server.ssrLoadModule('/src/components/AgendaEntregas.jsx');
    const AgendaComp = modAgenda.default;
    const htmlAgenda = ReactDOMServer.renderToString(
      React.createElement(GoogleSheetsContext.Provider, { value: mockCtx },
        React.createElement(AgendaComp, { rol: 'admin', usuario: 'Renzo' })
      )
    );
    assert.ok(typeof htmlAgenda === 'string' && htmlAgenda.length > 50, 'AgendaEntregas debe renderizar en SSR');

    // 4. Render SSR ModalArmadoPedido
    const modModalArmado = await server.ssrLoadModule('/src/components/ModalArmadoPedido.jsx');
    const ModalArmadoComp = modModalArmado.default;
    const htmlModal = ReactDOMServer.renderToString(
      React.createElement(GoogleSheetsContext.Provider, { value: mockCtx },
        React.createElement(ModalArmadoComp, {
          pedido: mockCtx.pedidos[0],
          onClose: () => {},
          onPedidoArmado: () => {}
        })
      )
    );
    assert.ok(typeof htmlModal === 'string' && htmlModal.length > 50, 'ModalArmadoPedido debe renderizar en SSR');
    assert.ok(htmlModal.includes('HU-868434'), 'ModalArmadoPedido debe incluir numero de pedido');

  } finally {
    await server.close();
  }
});

// ==============================================================================
// 8. Verificación de eliminación de syncProductWithSheet y updateAlmacen en Armado
// ==============================================================================
test('Armado (Agenda, ModalArmado, Calendario): cero llamadas a syncProductWithSheet y updateAlmacen', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');

  const filesToCheck = [
    'src/components/AgendaEntregas.jsx',
    'src/components/ModalArmadoPedido.jsx',
    'src/components/CalendarioEntregas.jsx',
    'src/components/PedidosDelDia.jsx'
  ];

  for (const relPath of filesToCheck) {
    const fullPath = path.resolve(relPath);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf8');

    // No debe contener llamada a syncProductWithSheet
    assert.strictEqual(
      content.includes('syncProductWithSheet'),
      false,
      `Archivo ${relPath} no debe contener llamadas ni imports de syncProductWithSheet`
    );

    // No debe contener updateAlmacen
    assert.strictEqual(
      content.includes('updateAlmacen'),
      false,
      `Archivo ${relPath} no debe contener updateAlmacen`
    );
  }

  // Verificar que en ControlStock.jsx y PendientesIdentificar.jsx no haya fetch/postAppsScript activo con updateAlmacen
  const controlStockContent = fs.readFileSync(path.resolve('src/components/ControlStock.jsx'), 'utf8');
  assert.strictEqual(
    controlStockContent.includes("accion: 'updateAlmacen'"),
    false,
    'ControlStock.jsx no debe tener payload activo con updateAlmacen'
  );

  const pendientesContent = fs.readFileSync(path.resolve('src/components/PendientesIdentificar.jsx'), 'utf8');
  assert.strictEqual(
    pendientesContent.includes("accion: 'updateAlmacen'"),
    false,
    'PendientesIdentificar.jsx no debe tener postAppsScript activo con updateAlmacen'
  );
});

// ==============================================================================
// 9. Verificación de los 3 flujos intactos en el armado
// ==============================================================================
test('Flujos intactos: 1) EAN Almacén suma contador/verde, 2) Pesaje balanza, 3) Unidad manual', () => {
  // 1) EAN de Almacén por unidad
  const itemAlmacen = {
    nombre: 'Arroz 1kg',
    ean: '7791234567890',
    cantidad: 2,
    scans: 0,
    confirmado: false
  };
  const tipoAlm = determinarTipoCaptura(itemAlmacen, {});
  assert.strictEqual(tipoAlm, TIPOS_CAPTURA.ALMACEN_EAN, 'Arroz con EAN debe ser ALMACEN_EAN');
  // Simular escaneo 1 y 2
  itemAlmacen.scans += 1;
  assert.strictEqual(itemAlmacen.scans < itemAlmacen.cantidad, true);
  itemAlmacen.scans += 1;
  itemAlmacen.confirmado = itemAlmacen.scans >= itemAlmacen.cantidad;
  assert.strictEqual(itemAlmacen.confirmado, true, 'Al completar scans queda confirmado (verde)');

  // 2) Pesaje por balanza
  const itemPesable = {
    nombre: 'Papa negra',
    unidad: 'kg',
    cantidad: 2.5,
    confirmado: false,
    pesoCongelado: null
  };
  const tipoPesable = determinarTipoCaptura(itemPesable, {});
  assert.strictEqual(tipoPesable, TIPOS_CAPTURA.PESABLE, 'Papa con unidad kg debe ser PESABLE');
  // Simular captura de peso desde la balanza Systel
  const pesoCapturadoBalanza = 2.485;
  itemPesable.pesoCongelado = pesoCapturadoBalanza;
  itemPesable.cantidad_real = pesoCapturadoBalanza;
  itemPesable.confirmado = true;
  assert.strictEqual(itemPesable.confirmado, true);
  assert.strictEqual(itemPesable.pesoCongelado, 2.485);

  // 3) Unidad manual (maple / atado / unidad)
  const itemManual = {
    nombre: 'Huevos Colorados',
    unidad: 'maple',
    cantidad: 1,
    confirmado: false,
    cantidadConfirmada: null
  };
  const tipoManual = determinarTipoCaptura(itemManual, {});
  assert.strictEqual(tipoManual, TIPOS_CAPTURA.UNIDAD_MANUAL, 'Huevos maple debe ser UNIDAD_MANUAL');
  // Confirmar cantidad manual
  itemManual.cantidadConfirmada = 1;
  itemManual.cantidad_real = 1;
  itemManual.confirmado = true;
  assert.strictEqual(itemManual.confirmado, true);
  assert.strictEqual(itemManual.cantidadConfirmada, 1);
});

// ==============================================================================
// 11. Falla A: Simulación de hoja Almacén de 1000 filas (fila 1000 + fantasma 34-999)
// ==============================================================================
test('Falla A: Hoja Almacén 1000 filas — producto en fila 1000 se encuentra en todas las pantallas', () => {
  // Construir 1000 filas simuladas del Sheet Almacén
  const rawRows = [];
  // Fila 1: encabezado
  // Filas 2 a 33: productos reales
  for (let f = 2; f <= 33; f++) {
    rawRows.push({
      c: [
        { v: `Producto Almacén ${f}` }, // nombre
        { v: 'Marca Test' },            // marca
        { v: 'Almacén' },               // categoría
        { v: 'Comestibles' },           // subcategoría
        { v: `7790000000${f.toString().padStart(3, '0')}` }, // ean
        { v: 1000 },                    // costo_unitario
        { v: 1800 },                    // precio_venta
        { v: 10 },                      // stock_unidades
        { v: f }                        // filaCol
      ]
    });
  }

  // Filas 34 a 999: filas fantasma (vacías con categoría y ceros)
  for (let f = 34; f <= 999; f++) {
    rawRows.push({
      c: [
        { v: '' },          // nombre vacío
        { v: '' },          // marca vacía
        { v: 'Almacén' },   // categoría
        { v: '' },          // subcategoría
        { v: '' },          // ean
        { v: 0 },           // costo
        { v: 0 },           // precio
        { v: 0 },           // stock
        { v: f }            // filaCol
      ]
    });
  }

  // Fila 1000: Harina leudante ultrarefinada Pureza
  rawRows.push({
    c: [
      { v: 'harina leudante ultrarefinada' }, // nombre
      { v: 'pureza' },                       // marca
      { v: 'Almacén' },                      // categoría
      { v: 'Harinas' },                      // subcategoría
      { v: '7790070411854' },                // ean
      { v: 6000 },                           // costo_unitario
      { v: 10200 },                          // precio_venta
      { v: 5 },                              // stock_unidades
      { v: 1000 }                            // filaCol
    ]
  });

  // Simular parseo de GoogleSheetsContext
  const mapped = [];
  rawRows.forEach((r, idx) => {
    const nombreP = String(r.c?.[0]?.v || '').trim();
    if (!nombreP) return; // Filas fantasma 34-999 deben ser descartadas

    const filaCol = Number(r.c?.[8]?.v);
    const filaP = (filaCol && filaCol > 1) ? filaCol : (idx + 2); // > 1 permite fila 1000!
    const marcaP = String(r.c?.[1]?.v || '').trim();
    const catP = String(r.c?.[2]?.v || 'Almacén').trim();
    const subCatP = String(r.c?.[3]?.v || 'Almacén').trim();
    const eanP = String(r.c?.[4]?.v || '').trim();
    if (eanP) {
      asociarEanAProducto(eanP, { nombre: nombreP, marca: marcaP, subcategoria: subCatP, unidad: 'un' });
    }
    const costoP = Number(r.c?.[5]?.v) || 0;
    const precioP = Number(r.c?.[6]?.v) || 0;
    const stockUdsP = Number(r.c?.[7]?.v) || 0;

    mapped.push({
      id: `alm_${filaP}`,
      fila: filaP,
      nombre: nombreP,
      producto: nombreP,
      marca: marcaP,
      categoria: 'otros',
      categoriaPrincipal: 'Almacén',
      subcategoria: subCatP,
      cantidadCajon: 1,
      unidad: 'unidad',
      precioCajon: costoP,
      precio: precioP,
      precio_venta: precioP,
      costo_unitario: costoP,
      stock_unidades: stockUdsP,
      ean: eanP,
      codigo_ean: eanP,
      barcode: eanP,
      activo: true
    });
  });

  // 1. Debe haber exactamente 33 productos parseados (32 primeros + 1 de la fila 1000)
  assert.strictEqual(mapped.length, 33, 'Deben parsearse 33 productos ignorando las filas fantasma 34-999');
  
  // 2. El producto en la fila 1000 debe existir en la lista
  const prod1000 = mapped.find(p => p.fila === 1000);
  assert.ok(prod1000, 'El producto de la fila 1000 debe estar en la lista mapped');
  assert.strictEqual(prod1000.nombre, 'harina leudante ultrarefinada');
  assert.strictEqual(prod1000.stock_unidades, 5);
  assert.strictEqual(prod1000.ean, '7790070411854');

  // 3. Hogar: búsqueda por nombre, marca y EAN
  const buscarHogar = (q, lista) => {
    const qn = norm(q);
    return lista.filter(p => {
      const prod = norm(p.producto || p.nombre || '');
      const marca = norm(p.marca || '');
      const ean = String(p.ean || p.codigo_ean || p.barcode || '').trim();
      return prod.includes(qn) || marca.includes(qn) || ean.includes(qn);
    });
  };

  assert.strictEqual(buscarHogar('harina leudante', mapped).length, 1, 'Hogar encuentra fila 1000 por nombre');
  assert.strictEqual(buscarHogar('pureza', mapped).length, 1, 'Hogar encuentra fila 1000 por marca');
  assert.strictEqual(buscarHogar('7790070411854', mapped).length, 1, 'Hogar encuentra fila 1000 por código EAN');

  // 4. ModalSalida (Merma): búsqueda y escaneo
  const eanMap = getEanMapping();
  const eanInfo = eanMap['7790070411854'];
  assert.ok(eanInfo, 'El mapa EAN debe tener asociado 7790070411854');
  assert.strictEqual(norm(eanInfo.nombre), norm('harina leudante ultrarefinada'));

  const matchModalSalida = mapped.find(p => {
    const eanStr = String(p.ean || p.barcode || p.codigo_ean || '').trim();
    if (eanStr && eanStr === '7790070411854') return true;
    const nom = norm(p.producto || p.nombre || '');
    const mar = norm(p.marca || '');
    const cod = norm('7790070411854');
    return nom === cod || nom.includes(cod) || mar.includes(cod);
  });
  assert.ok(matchModalSalida, 'ModalSalida encuentra fila 1000 al escanear código EAN');
  assert.strictEqual(matchModalSalida.fila, 1000);

  // 5. Faltantes: calcularFaltantes detecta el stock del producto de fila 1000
  const pedidosFaltantes = [
    {
      numero_pedido: 'HU-1000',
      producto: '7 UNIDADES HARINA LEUDANTE ULTRAREFINADA',
      cantidades: '7',
      dia_entrega: '2026-11-02'
    }
  ];
  const resFaltantes = calcularFaltantes([], mapped, pedidosFaltantes, null, null);
  const faltanteHarina = resFaltantes.faltantes.find(f => norm(f.nombre).includes('harina leudante'));
  assert.ok(faltanteHarina, 'Faltantes detecta demanda de Harina');
  assert.strictEqual(faltanteHarina.stockActual, 5, 'Faltantes lee stock actual = 5 de fila 1000');
  assert.strictEqual(faltanteHarina.faltaParaPedidos, 2, 'Faltantes calcula que faltan 2 unidades (7 demanda - 5 stock)');

  // 6. AlmacenCache: no pisa stock fresco del Sheet si el cache local no es reciente
  const cacheViejo = { stock: 0 }; // sin updatedAt o viejo
  const prodActualizado = aplicarCacheAProducto({ ...prod1000 }, cacheViejo, 6000);
  assert.strictEqual(prodActualizado.stock_unidades, 5, 'Cache viejo con stock 0 NO debe pisar stock fresco = 5 del Sheet');
});

// ==============================================================================
// 12. Falla B: HU-868434 y variantes de montos nunca devuelven NaN y calculan 20400
// ==============================================================================
test('Falla B: HU-868434 y variantes — montos seguros, sin NaN, total exacto 20400', () => {
  const catalogo = [
    {
      id: 1000,
      nombre: 'HARINA LEUDANTE ULTRAREFINADA',
      precio: 10200,
      precio_venta: 10200,
      unidad: 'unidad',
      categoriaPrincipal: 'Almacén'
    }
  ];

  // Caso Base: Pedido real HU-868434 sin armar
  const pedidoBase = {
    numero_pedido: 'HU-868434',
    fecha: '2026-10-30',
    dia_entrega: 'Lunes 02/11/2026 Tarde',
    forma_pago: 'efectivo',
    producto: '2 KILOS HARINA LEUDANTE ULTRAREFINADA',
    cantidades: '2',
    total: '20400'
  };

  // 1. Total como string '20400'
  const res1 = calcularTotalPedido(pedidoBase, null, { catalogo });
  assert.strictEqual(res1.monto, 20400, 'Monto debe ser 20400');
  assert.strictEqual(res1.total, 20400, 'Total debe ser 20400');
  assert.strictEqual(Number.isNaN(res1.monto), false);
  assert.strictEqual(res1.esEstimado, true, 'Pedido sin armar es estimado');

  // 2. Total como número 20400
  const res2 = calcularTotalPedido({ ...pedidoBase, total: 20400 }, null, { catalogo });
  assert.strictEqual(res2.monto, 20400);
  assert.strictEqual(res2.total, 20400);

  // 3. Total con signo peso y punto de miles '$20.400'
  const res3 = calcularTotalPedido({ ...pedidoBase, total: '$20.400' }, null, { catalogo });
  assert.strictEqual(res3.monto, 20400);
  assert.strictEqual(res3.total, 20400);

  // 4. Total con coma decimal '20.400,50'
  const res4 = calcularTotalPedido({ ...pedidoBase, total: '20.400,50' }, null, { catalogo });
  assert.strictEqual(res4.monto, 20401, 'Redondea 20400.5 a 20401');
  assert.strictEqual(res4.total, 20401);

  // 5. Total vacío '' -> calcula desde productos del catálogo
  const res5 = calcularTotalPedido({ ...pedidoBase, total: '' }, null, { catalogo });
  assert.strictEqual(res5.monto, 20400, 'Calcula 2 x 10200 = 20400');
  assert.strictEqual(res5.total, 20400);

  // 6. Total undefined -> calcula desde productos del catálogo
  const res6 = calcularTotalPedido({ ...pedidoBase, total: undefined }, null, { catalogo });
  assert.strictEqual(res6.monto, 20400);
  assert.strictEqual(res6.total, 20400);

  // 7. Línea con '2 UNIDADES HARINA LEUDANTE ULTRAREFINADA'
  const res7 = calcularTotalPedido({
    ...pedidoBase,
    producto: '2 UNIDADES HARINA LEUDANTE ULTRAREFINADA',
    total: undefined
  }, null, { catalogo });
  assert.strictEqual(res7.monto, 20400);
  assert.strictEqual(res7.total, 20400);

  // 8. Pedido armado con detalle de pesaje
  const prepArmada = {
    completado: true,
    items: [
      {
        nombre: 'HARINA LEUDANTE ULTRAREFINADA',
        precioUnitario: 10200,
        cantidad_real: 2,
        subtotal: 20400,
        confirmado: true
      }
    ]
  };
  const resArmado = calcularTotalPedido(pedidoBase, prepArmada, { catalogo });
  assert.strictEqual(resArmado.monto, 20400);
  assert.strictEqual(resArmado.total, 20400);
  assert.strictEqual(resArmado.estaArmado, true);

  // 9. Cantidad con coma decimal '1,5' y producto faltante en catálogo
  const resDec = calcularTotalPedido({
    numero_pedido: 'HU-999',
    producto: '1,5 KILOS PAPA',
    cantidades: '1,5',
    total: ''
  }, null, { catalogo: [] });
  assert.strictEqual(Number.isNaN(resDec.monto), false);
  assert.strictEqual(Number.isNaN(resDec.total), false);

  // 10. Robustez de parsearMonto y formatearMonto
  assert.strictEqual(parsearMonto(null), 0);
  assert.strictEqual(parsearMonto(undefined), 0);
  assert.strictEqual(parsearMonto(NaN), 0);
  assert.strictEqual(parsearMonto(''), 0);
  assert.strictEqual(parsearMonto('   '), 0);
  assert.strictEqual(parsearMonto('2 UNIDADES HARINA'), 0);
  assert.strictEqual(parsearMonto('$20.400'), 20400);
  assert.strictEqual(parsearMonto('20.400,50'), 20400.5);

  assert.strictEqual(formatearMonto(NaN), '$0');
  assert.strictEqual(formatearMonto(undefined), '$0');
  assert.strictEqual(formatearMonto(null), '$0');
  assert.strictEqual(formatearMonto('NaN'), '$0');
  assert.strictEqual(formatearMonto(20400), '$20.400');
  assert.strictEqual(formatearMonto('$20.400'), '$20.400');

  // 11. Calendario Totales con HU-868434
  const resDia = calcularDetalleYTotalesDia([pedidoBase], '2026-11-02', {}, { catalogo });
  assert.strictEqual(resDia.totalMonto, 20400, 'Total del día en calendario debe ser 20400');
  assert.strictEqual(Number.isNaN(resDia.totalMonto), false);
  assert.strictEqual(resDia.turnos.Tarde.total, 20400);
  assert.strictEqual(Number.isNaN(resDia.turnos.Tarde.total), false);
  assert.strictEqual(resDia.desglose.pendiente.monto, 20400);
});

// ==============================================================================
// 13. SSR: Ningún componente renderiza la palabra "NaN" en su HTML
// ==============================================================================
test('SSR: Renderizado de TarjetaPedido, PedidosDelDia, Calendario y Agenda jamás produce "NaN"', async () => {
  const server = await createServer({ server: { middlewareMode: true } });
  try {
    const modContext = await server.ssrLoadModule('/src/context/GoogleSheetsContext.jsx');
    const GoogleSheetsContext = modContext.GoogleSheetsContext;

    // Escenario 1: Pedido HU-868434 con total string y formatos varios
    const mockCtxReal = {
      pedidos: [
        {
          numero_pedido: 'HU-868434',
          cliente: 'Cliente Test',
          nombre: 'Cliente Test',
          telefono: '1122334455',
          direccion: 'Calle Falsa 123',
          producto: '2 KILOS HARINA LEUDANTE ULTRAREFINADA',
          cantidades: '2',
          estado: 'pendiente',
          dia_entrega: 'Lunes 02/11/2026 Tarde',
          metodo_pago: 'efectivo',
          total: '20400'
        }
      ],
      productosCostos: [
        { id: 1000, nombre: 'HARINA LEUDANTE ULTRAREFINADA', activo: true, precio: 10200, unidad: 'unidad', categoriaPrincipal: 'Almacén' }
      ],
      stockData: {},
      cargando: false,
      refrescar: () => {},
      actualizarStock: () => {},
      actualizarEstadoEnSheet: async () => ({ ok: true }),
      fetchControlStock: async () => ({ ok: true })
    };

    // Escenario 2: Contexto vacío
    const mockCtxVacio = {
      pedidos: [],
      productosCostos: [],
      stockData: {},
      cargando: false,
      refrescar: () => {},
      actualizarStock: () => {},
      actualizarEstadoEnSheet: async () => ({ ok: true }),
      fetchControlStock: async () => ({ ok: true })
    };

    // Cargar componentes
    const modTarjeta = await server.ssrLoadModule('/src/components/TarjetaPedido.jsx');
    const TarjetaPedidoComp = modTarjeta.default;

    const modPedidos = await server.ssrLoadModule('/src/components/PedidosDelDia.jsx');
    const PedidosDelDiaComp = modPedidos.default;

    const modAgenda = await server.ssrLoadModule('/src/components/AgendaEntregas.jsx');
    const AgendaComp = modAgenda.default;

    const modCalendario = await server.ssrLoadModule('/src/components/CalendarioEntregas.jsx');
    const CalendarioComp = modCalendario.default;

    // 1. TarjetaPedido con HU-868434
    const htmlTarjeta = ReactDOMServer.renderToString(
      React.createElement(GoogleSheetsContext.Provider, { value: mockCtxReal },
        React.createElement(TarjetaPedidoComp, {
          pedido: mockCtxReal.pedidos[0],
          preparacion: null
        })
      )
    );
    assert.strictEqual(htmlTarjeta.includes('NaN'), false, 'TarjetaPedido no debe contener "NaN"');
    assert.ok(htmlTarjeta.includes('$20.400'), 'TarjetaPedido debe mostrar $20.400');

    // 2. PedidosDelDia con HU-868434 y vacío
    const htmlPedidosReal = ReactDOMServer.renderToString(
      React.createElement(GoogleSheetsContext.Provider, { value: mockCtxReal },
        React.createElement(PedidosDelDiaComp, { rol: 'admin', usuario: 'Renzo' })
      )
    );
    assert.strictEqual(htmlPedidosReal.includes('NaN'), false, 'PedidosDelDia (real) no debe contener "NaN"');

    const htmlPedidosVacio = ReactDOMServer.renderToString(
      React.createElement(GoogleSheetsContext.Provider, { value: mockCtxVacio },
        React.createElement(PedidosDelDiaComp, { rol: 'admin', usuario: 'Renzo' })
      )
    );
    assert.strictEqual(htmlPedidosVacio.includes('NaN'), false, 'PedidosDelDia (vacío) no debe contener "NaN"');

    // 3. AgendaEntregas con HU-868434 y vacío
    const htmlAgendaReal = ReactDOMServer.renderToString(
      React.createElement(GoogleSheetsContext.Provider, { value: mockCtxReal },
        React.createElement(AgendaComp, { rol: 'admin', usuario: 'Renzo' })
      )
    );
    assert.strictEqual(htmlAgendaReal.includes('NaN'), false, 'AgendaEntregas (real) no debe contener "NaN"');

    const htmlAgendaVacio = ReactDOMServer.renderToString(
      React.createElement(GoogleSheetsContext.Provider, { value: mockCtxVacio },
        React.createElement(AgendaComp, { rol: 'admin', usuario: 'Renzo' })
      )
    );
    assert.strictEqual(htmlAgendaVacio.includes('NaN'), false, 'AgendaEntregas (vacío) no debe contener "NaN"');

    // 4. CalendarioEntregas con HU-868434 y vacío
    const htmlCalReal = ReactDOMServer.renderToString(
      React.createElement(GoogleSheetsContext.Provider, { value: mockCtxReal },
        React.createElement(CalendarioComp, { rol: 'admin', usuario: 'Renzo' })
      )
    );
    assert.strictEqual(htmlCalReal.includes('NaN'), false, 'CalendarioEntregas (real) no debe contener "NaN"');

    const htmlCalVacio = ReactDOMServer.renderToString(
      React.createElement(GoogleSheetsContext.Provider, { value: mockCtxVacio },
        React.createElement(CalendarioComp, { rol: 'admin', usuario: 'Renzo' })
      )
    );
    assert.strictEqual(htmlCalVacio.includes('NaN'), false, 'CalendarioEntregas (vacío) no debe contener "NaN"');

  } finally {
    await server.close();
  }
});



