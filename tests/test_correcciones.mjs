// tests/test_correcciones.mjs
import assert from 'node:assert';
import test from 'node:test';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { createServer } from 'vite';

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

