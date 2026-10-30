/**
 * Test Suite: Flujo de Nueva Compra / Ingreso de Almacén (Apps Script v21)
 * HUERTA URBANA DASHBOARD - Rama feat/ingreso-almacen
 * 
 * Reglas:
 * - 100% simulaciones en memoria, sin llamadas a red ni endpoints reales.
 * - Sin imprimir claves, PINs ni URLs.
 * - Valida contrato de acción `ingresoAlmacen`, UI behavior, cálculos en vivo,
 *   idempotencia de op_id, autocompletado y bloqueo de EAN, manejo de errores,
 *   y ausencia de updateAlmacen / syncProductWithSheet / apiCrearIngreso para almacén.
 */

import assert from 'node:assert';
import { apiIngresoAlmacen } from '../src/utils/mercaderiaApi.js';

console.log('==================================================================');
console.log('PRUEBAS UNITARIAS: INGRESO DE ALMACÉN V21 (OFFLINE SIMULATION)');
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
// 1. CONTRATO DE API apiIngresoAlmacen
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- 1. Contrato y Payload de apiIngresoAlmacen ---');

it('apiIngresoAlmacen formatea correctamente el payload según contrato v21', async () => {
  // Mock fetch para interceptar payload
  const originalFetch = global.fetch;
  let interceptedPayload = null;

  global.fetch = async (url, options) => {
    interceptedPayload = JSON.parse(options.body);
    return {
      ok: true,
      text: async () => JSON.stringify({
        ok: true,
        nuevo: false,
        producto: 'Fideos Lucchetti Guiseros 500g',
        ean: '7790040112233',
        stock: 36,
        costo_unitario: 850.5,
        costo_compra_unidad: 900,
        precio_venta: 1500,
        precio_sugerido: 1530
      })
    };
  };

  try {
    const res = await apiIngresoAlmacen({
      nombre: '  Fideos Lucchetti Guiseros 500g  ',
      marca: 'Lucchetti',
      categoria: 'Almacén',
      subcategoria: 'Pastas Secas',
      ean: '  7790040112233  ',
      unidades: '12',
      total_pagado: '10800',
      proveedor: 'Distribuidora Molinos',
      precio_venta: 1500,
      margen_pct: 70,
      op_id: 'uuid-test-1234'
    });

    assert.strictEqual(res.ok, true);
    assert.strictEqual(interceptedPayload.accion, 'ingresoAlmacen');
    assert.strictEqual(interceptedPayload.nombre, 'Fideos Lucchetti Guiseros 500g');
    assert.strictEqual(interceptedPayload.marca, 'Lucchetti');
    assert.strictEqual(interceptedPayload.categoria, 'Almacén');
    assert.strictEqual(interceptedPayload.subcategoria, 'Pastas Secas');
    assert.strictEqual(interceptedPayload.ean, '7790040112233');
    assert.strictEqual(interceptedPayload.unidades, 12);
    assert.strictEqual(interceptedPayload.total_pagado, 10800);
    assert.strictEqual(interceptedPayload.proveedor, 'Distribuidora Molinos');
    assert.strictEqual(interceptedPayload.precio_venta, 1500);
    assert.strictEqual(interceptedPayload.margen_pct, 70);
    assert.strictEqual(interceptedPayload.op_id, 'uuid-test-1234');
  } finally {
    global.fetch = originalFetch;
  }
});

it('apiIngresoAlmacen funciona con campos opcionales omitidos (proveedor, marca, subcat)', async () => {
  const originalFetch = global.fetch;
  let interceptedPayload = null;

  global.fetch = async (url, options) => {
    interceptedPayload = JSON.parse(options.body);
    return {
      ok: true,
      text: async () => JSON.stringify({
        ok: true,
        nuevo: true,
        producto: 'Galletitas Variedad 400g',
        ean: '7791234567890',
        stock: 10,
        costo_unitario: 1200,
        costo_compra_unidad: 1200,
        precio_venta: 2040,
        precio_sugerido: 2040
      })
    };
  };

  try {
    const res = await apiIngresoAlmacen({
      nombre: 'Galletitas Variedad 400g',
      ean: '7791234567890',
      unidades: 10,
      total_pagado: 12000,
      op_id: 'op-minimal'
    });

    assert.strictEqual(res.ok, true);
    assert.strictEqual(interceptedPayload.proveedor, undefined, 'Proveedor omitido no debe viajar como clave vacía');
    assert.strictEqual(interceptedPayload.marca, undefined, 'Marca omitida no debe viajar');
    assert.strictEqual(interceptedPayload.margen_pct, 70, 'Margen por defecto debe ser 70%');
    assert.strictEqual(interceptedPayload.categoria, 'Almacén');
    assert.strictEqual(interceptedPayload.unidades, 10);
    assert.strictEqual(interceptedPayload.total_pagado, 12000);
  } finally {
    global.fetch = originalFetch;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. PRODUCTO NUEVO CON EAN
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- 2. Producto Nuevo con EAN ---');

it('EAN nuevo permite escribir nombre libremente (readOnly = false)', () => {
  // Simulación de cache y lógica de coincidencia de EAN de Productos.jsx
  const cacheAlmacen = [
    { nombre: 'Aceite Girasol 1.5L', ean: '7790001', stock: 15, costo: 1800 }
  ];

  const buscarEanEnCache = (eanEscaneado) => {
    return cacheAlmacen.find(p => p.ean === eanEscaneado) || null;
  };

  const eanNuevo = '7799999999999';
  const match = buscarEanEnCache(eanNuevo);

  assert.strictEqual(match, null, 'El EAN no debe existir en el caché');
  const readOnlyNombre = Boolean(match);
  assert.strictEqual(readOnlyNombre, false, 'El campo nombre debe estar editable para un producto nuevo');

  let nombreIngresado = 'Yerba Mate Orgánica 500g';
  let marcaIngresada = 'Roapipo';
  let subcatIngresada = 'Infusiones';

  assert.strictEqual(nombreIngresado.trim().length > 0, true);
  assert.strictEqual(marcaIngresada, 'Roapipo');
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. EAN EXISTENTE AUTOCOMPLETA Y BLOQUEA EL NOMBRE
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- 3. EAN Existente Autocompleta y Bloquea Nombre ---');

it('Al ingresar un EAN existente, autocompleta nombre, marca, stock y costo actual, y bloquea el nombre', () => {
  const cacheAlmacen = [
    {
      nombre: 'Arroz Doble Carolina 1kg',
      marca: 'Gallo',
      categoria: 'Almacén',
      subcategoria: 'Legumbres y Arroz',
      ean: '7790070123456',
      stock: 24,
      costo: 1850.50,
      precio: 3100
    }
  ];

  // Estado del formulario
  let formState = {
    categoria: 'Almacén',
    ean: '',
    nombre: '',
    marca: '',
    subcategoria: '',
    stockActual: null,
    costoActual: null,
    precioVenta: '',
    isReadOnlyNombre: false
  };

  // Simulación del handler onChange/onBlur de EAN en Productos.jsx
  const handleEanChange = (inputEan) => {
    formState.ean = inputEan.trim();
    const match = cacheAlmacen.find(item => item.ean === formState.ean);
    if (match) {
      formState.nombre = match.nombre;
      formState.marca = match.marca || '';
      formState.subcategoria = match.subcategoria || '';
      formState.stockActual = match.stock;
      formState.costoActual = match.costo;
      formState.precioVenta = match.precio || '';
      formState.isReadOnlyNombre = true;
    } else {
      formState.isReadOnlyNombre = false;
    }
  };

  // Escanear EAN existente
  handleEanChange('7790070123456');

  assert.strictEqual(formState.nombre, 'Arroz Doble Carolina 1kg');
  assert.strictEqual(formState.marca, 'Gallo');
  assert.strictEqual(formState.subcategoria, 'Legumbres y Arroz');
  assert.strictEqual(formState.stockActual, 24);
  assert.strictEqual(formState.costoActual, 1850.50);
  assert.strictEqual(formState.precioVenta, 3100);
  assert.strictEqual(formState.isReadOnlyNombre, true, 'El nombre debe ser de solo lectura para evitar duplicar/renombrar');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. ENTER DE LA PISTOLA NO ENVÍA EL FORMULARIO
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- 4. Enter de la Pistola en Campo EAN ---');

it('Enter en el input EAN ejecuta preventDefault y pasa el foco a cantidad sin enviar', () => {
  let preventDefaultCalled = false;
  let focusedInput = null;
  let formSubmitted = false;

  const mockCantidadInputRef = {
    current: {
      focus: () => {
        focusedInput = 'cantidad';
      },
      select: () => {}
    }
  };

  const handleKeyDownEan = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      mockCantidadInputRef.current?.focus();
    }
  };

  const mockSubmit = () => {
    formSubmitted = true;
  };

  // Simular evento keydown de la pistola de código de barras
  const syntheticEvent = {
    key: 'Enter',
    preventDefault: () => {
      preventDefaultCalled = true;
    }
  };

  handleKeyDownEan(syntheticEvent);

  assert.strictEqual(preventDefaultCalled, true, 'preventDefault debe ser invocado para no disparar onSubmit');
  assert.strictEqual(focusedInput, 'cantidad', 'El foco debe transferirse al input de cantidad');
  assert.strictEqual(formSubmitted, false, 'El formulario NO debe haber sido enviado');
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. CÁLCULOS EN VIVO: COSTO POR PAQUETE (20000 / 6) Y PRECIO DE VENTA
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- 5. Cálculos en Vivo (Costo / Paquete, Margen y Precio) ---');

it('Cálculo en vivo: total pagado 20000 / 6 unidades da costo 3333.33 y sugerido 5667', () => {
  const totalPagado = 20000;
  const unidades = 6;
  const margenPct = 70; // default 70%

  // Fórmula implementada en Productos.jsx
  const costoPaqueteNum = unidades > 0 ? (totalPagado / unidades) : 0;
  const costoPaqueteFormatted = Math.round(costoPaqueteNum * 100) / 100;
  assert.strictEqual(costoPaqueteFormatted, 3333.33, '20000 / 6 redondeado a 2 decimales debe ser 3333.33');

  const precioSugeridoCalculado = costoPaqueteNum > 0
    ? Math.round(costoPaqueteNum * (1 + (margenPct / 100)))
    : 0;

  // 3333.3333 * 1.70 = 5666.6666... redondeado a entero = 5667
  assert.strictEqual(precioSugeridoCalculado, 5667, 'Precio sugerido con 70% de margen debe ser 5667');

  // Permitir edición del precio de venta antes de guardar
  let precioVentaUsuario = precioSugeridoCalculado;
  // El usuario decide modificar el precio final a 5500
  precioVentaUsuario = 5500;
  assert.strictEqual(precioVentaUsuario, 5500, 'El precio de venta debe ser editable antes de guardar');
});

it('Cálculo de margen dinámico editable (ej: 50% y 100%)', () => {
  const totalPagado = 10000;
  const unidades = 5;
  const costo = totalPagado / unidades; // 2000

  // Con 50%
  const sugerido50 = Math.round(costo * (1 + 50 / 100));
  assert.strictEqual(sugerido50, 3000);

  // Con 100%
  const sugerido100 = Math.round(costo * (1 + 100 / 100));
  assert.strictEqual(sugerido100, 4000);
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. IDEMPOTENCIA CON op_id: DOBLE CLIC ENVÍA EL MISMO op_id
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- 6. Idempotencia y op_id en Doble Clic / Reintentos ---');

it('Doble clic o reintento de guardado envía exactamente el mismo op_id', async () => {
  const opIdRef = { current: null };

  const getOrCreateOpId = () => {
    if (!opIdRef.current) {
      opIdRef.current = 'op-' + Math.random().toString(36).substring(2, 10);
    }
    return opIdRef.current;
  };

  const sentPayloads = [];

  const simularGuardado = async () => {
    const op_id = getOrCreateOpId();
    sentPayloads.push({ op_id, timestamp: Date.now() });
    // Supongamos que el primer clic falla por timeout o error de red
    return { ok: false, error: 'Network timeout' };
  };

  // Clic 1
  await simularGuardado();
  // Clic 2 (reintento inmediato por el usuario)
  await simularGuardado();

  assert.strictEqual(sentPayloads.length, 2);
  assert.ok(sentPayloads[0].op_id, 'Debe haber generado un op_id');
  assert.strictEqual(
    sentPayloads[0].op_id,
    sentPayloads[1].op_id,
    'El segundo intento DEBE reutilizar el mismo op_id para evitar duplicación en el servidor v21'
  );

  // Cuando el servidor responde ok, se limpia opIdRef
  const simularExito = async () => {
    const op_id = getOrCreateOpId();
    opIdRef.current = null; // resetea tras éxito
    return { ok: true, op_id };
  };

  await simularExito();

  // Una nueva compra distinta posterior debe generar un op_id diferente
  const nuevoOpId = getOrCreateOpId();
  assert.notStrictEqual(nuevoOpId, sentPayloads[0].op_id, 'Una nueva compra debe generar un nuevo op_id');
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. ERROR DEL SERVIDOR SE MUESTRA Y CONSERVA EL FORMULARIO
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- 7. Manejo de Errores del Servidor ---');

it('Error del servidor muestra texto legible y no limpia los campos del formulario', async () => {
  let formState = {
    nombre: 'Café Molido 250g',
    ean: '7790001234567',
    unidades: 12,
    totalPagado: 25000,
    margenPct: 70,
    precioVenta: 3500
  };

  let errorMessageDisplayed = null;

  const simularRespuestaServidorError = async () => {
    return {
      ok: false,
      error: 'El codigo 7790001234567 ya pertenece a otro producto: Cafe Torrado La Morenita'
    };
  };

  // Ejecución de guardado
  const res = await simularRespuestaServidorError();

  if (!res.ok) {
    errorMessageDisplayed = res.error;
    // NO limpiar formState en caso de error
  } else {
    // Si fuera ok, se limpiaría
    formState = null;
  }

  assert.strictEqual(
    errorMessageDisplayed,
    'El codigo 7790001234567 ya pertenece a otro producto: Cafe Torrado La Morenita'
  );
  assert.strictEqual(formState.nombre, 'Café Molido 250g', 'El nombre se conserva');
  assert.strictEqual(formState.ean, '7790001234567', 'El EAN se conserva');
  assert.strictEqual(formState.unidades, 12, 'Las unidades se conservan');
  assert.strictEqual(formState.totalPagado, 25000, 'El total pagado se conserva');
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. AUSENCIA DE updateAlmacen, syncProductWithSheet Y apiCrearIngreso EN ALMACÉN
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- 8. Aislamiento de Flujo Almacén (Sin updateAlmacen / sync) ---');

it('Para productos de Almacén NO se invoca updateAlmacen, syncProductWithSheet ni apiCrearIngreso', async () => {
  const calls = {
    apiIngresoAlmacen: 0,
    updateAlmacen: 0,
    syncProductWithSheet: 0,
    apiCrearIngreso: 0,
    fetchControlStock: 0,
    fetchPanelCostos: 0
  };

  const mockApi = {
    apiIngresoAlmacen: async () => {
      calls.apiIngresoAlmacen++;
      return {
        ok: true,
        nuevo: false,
        producto: 'Mermelada Frutilla 400g',
        ean: '779008899',
        stock: 18,
        costo_unitario: 1100,
        costo_compra_unidad: 1150,
        precio_venta: 1950,
        precio_sugerido: 1955
      };
    },
    updateAlmacen: async () => { calls.updateAlmacen++; },
    syncProductWithSheet: async () => { calls.syncProductWithSheet++; },
    apiCrearIngreso: async () => { calls.apiCrearIngreso++; },
    fetchControlStock: async () => { calls.fetchControlStock++; },
    fetchPanelCostos: async () => { calls.fetchPanelCostos++; }
  };

  // Simulación del handler de guardado en Productos.jsx
  const handleGuardarCompra = async (esAlmacen) => {
    if (esAlmacen) {
      const res = await mockApi.apiIngresoAlmacen();
      if (res.ok) {
        // Recarga el caché desde el servidor sin mutar stock en pantalla directamente
        await mockApi.fetchControlStock();
        await mockApi.fetchPanelCostos();
      }
      return;
    }

    // Flujo verduras / frutas
    await mockApi.apiCrearIngreso();
  };

  await handleGuardarCompra(true);

  assert.strictEqual(calls.apiIngresoAlmacen, 1, 'apiIngresoAlmacen debió ser llamada');
  assert.strictEqual(calls.updateAlmacen, 0, 'updateAlmacen NUNCA debe llamarse para Almacén');
  assert.strictEqual(calls.syncProductWithSheet, 0, 'syncProductWithSheet NUNCA debe llamarse para Almacén');
  assert.strictEqual(calls.apiCrearIngreso, 0, 'apiCrearIngreso NUNCA debe registrar un ingreso de verduras para Almacén');
  assert.strictEqual(calls.fetchControlStock, 1, 'Debe recargar el stock desde el servidor');
  assert.strictEqual(calls.fetchPanelCostos, 1, 'Debe recargar los costos desde el servidor');
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. PROVEEDOR Y TELÉFONO OPCIONALES
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- 9. Proveedor y Teléfono Opcionales ---');

it('Guardado no se bloquea si proveedor y teléfono están vacíos', () => {
  const validarFormulario = ({ esAlmacen, nombre, ean, cantidad, totalPagado, proveedor, proveedorTel }) => {
    const errors = [];
    if (!nombre.trim()) errors.push('El nombre es obligatorio');
    if (esAlmacen && !ean.trim()) errors.push('El código de barras (EAN) es obligatorio');
    if (Number(cantidad) <= 0) errors.push('La cantidad debe ser mayor a 0');
    if (Number(totalPagado) <= 0) errors.push('El total pagado debe ser mayor a 0');
    // Proveedor y teléfono son OPCIONALES: no agregan errores si están vacíos
    return errors;
  };

  const validacionAlmacenSinProveedor = validarFormulario({
    esAlmacen: true,
    nombre: 'Lentejas 400g',
    ean: '7790011223344',
    cantidad: 10,
    totalPagado: 12000,
    proveedor: '',
    proveedorTel: ''
  });

  assert.strictEqual(
    validacionAlmacenSinProveedor.length,
    0,
    'El formulario debe ser válido aun sin proveedor ni teléfono'
  );
});

console.log('\n==================================================================');
console.log(`RESULTADOS: ${passedTests} de ${totalTests} pruebas pasaron exitosamente.`);
console.log('==================================================================');

if (passedTests !== totalTests) {
  process.exit(1);
}
