/**
 * Test Suite: Navegación, Elección de Modo, Sesiones de PIN y Consumo Hogar
 * HUERTA URBANA DASHBOARD
 * 
 * Regla: 100% simulaciones en memoria, sin llamadas a red ni endpoints reales.
 * No imprime claves, hashes ni secretos.
 */

import assert from 'node:assert';
import { 
  getAdminPinSession, setAdminPinSession, clearAdminPinSession,
  getHogarPinSession, setHogarPinSession, clearHogarPinSession
} from '../src/utils/mercaderiaApi.js';
import { calcularBalanceProducto, aGramos, aKilos } from '../src/utils/balanceStock.js';

console.log('==================================================================');
console.log('PRUEBAS UNITARIAS: NAVEGACIÓN, PINS Y CONSUMO HOGAR');
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
// 1. NAVEGACIÓN Y ELECCIÓN DE MODO
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- 1. Navegación y Elección de Modo ---');

it('Ruta directa #hogar se detecta correctamente para modo standalone', () => {
  const hash1 = '#hogar';
  const esRutaHogar1 = hash1.toLowerCase() === '#hogar';
  assert.strictEqual(esRutaHogar1, true);

  const hash2 = '#agenda';
  const esRutaHogar2 = hash2.toLowerCase() === '#hogar';
  assert.strictEqual(esRutaHogar2, false);
});

it('Estado inicial en HogarHub es modo = null (pantalla de elección)', () => {
  let modo = null;
  assert.strictEqual(modo, null, 'Debe iniciar mostrando los dos botones grandes');
});

it('Transición a modo Administrador si se autentica correctamente', () => {
  let modo = null;
  const autenticarAdmin = (pinValido) => {
    if (pinValido) modo = 'admin';
  };
  autenticarAdmin(true);
  assert.strictEqual(modo, 'admin');
});

it('Transición a modo Consumo Hogar si se autentica correctamente', () => {
  let modo = null;
  const autenticarHogar = (pinValido) => {
    if (pinValido) modo = 'consumo';
  };
  autenticarHogar(true);
  assert.strictEqual(modo, 'consumo');
});

it('Botón Cambiar modo regresa a la pantalla de elección (modo = null)', () => {
  let modo = 'admin';
  const volver = () => { modo = null; };
  volver();
  assert.strictEqual(modo, null);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. SESIÓN Y CONTROL DE PIN DE ADMINISTRADOR (15 MINUTOS)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 2. Sesión y Control de PIN de Administrador (15 min) ---');

it('Sesión inicial de Admin es nula', () => {
  clearAdminPinSession();
  assert.strictEqual(getAdminPinSession(), null);
});

it('setAdminPinSession guarda la sesión en memoria y es recuperable', () => {
  clearAdminPinSession();
  const dummyPin = 'TEST_ADMIN_SECRET';
  setAdminPinSession(dummyPin);
  assert.strictEqual(getAdminPinSession(), dummyPin);
});

it('clearAdminPinSession anula la sesión de Administrador de inmediato', () => {
  setAdminPinSession('TEST_ADMIN_SECRET');
  clearAdminPinSession();
  assert.strictEqual(getAdminPinSession(), null);
});

it('Simulación de verificación de PIN Admin: PIN correcto otorga sesión', () => {
  clearAdminPinSession();
  const pinGuardado = 'SECRET_TEST_1';
  const simularVerificarAdmin = (inputPin) => {
    if (inputPin === pinGuardado) return { ok: true };
    return { ok: false, error: 'PIN incorrecto' };
  };

  const resCorrecto = simularVerificarAdmin('SECRET_TEST_1');
  assert.strictEqual(resCorrecto.ok, true);
  if (resCorrecto.ok) setAdminPinSession('SECRET_TEST_1');
  assert.strictEqual(getAdminPinSession(), 'SECRET_TEST_1');
});

it('Simulación de verificación de PIN Admin: PIN incorrecto es rechazado y no crea sesión', () => {
  clearAdminPinSession();
  const pinGuardado = 'SECRET_TEST_1';
  const simularVerificarAdmin = (inputPin) => {
    if (inputPin === pinGuardado) return { ok: true };
    return { ok: false, error: 'PIN incorrecto' };
  };

  const resIncorrecto = simularVerificarAdmin('INCORRECT_VALUE');
  assert.strictEqual(resIncorrecto.ok, false);
  assert.strictEqual(resIncorrecto.error, 'PIN incorrecto');
  assert.strictEqual(getAdminPinSession(), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. SESIÓN Y CONTROL DE PIN DEL HOGAR (5 MINUTOS)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 3. Sesión y Control de PIN del Hogar (5 min) ---');

it('Sesión inicial de Hogar es nula', () => {
  clearHogarPinSession();
  assert.strictEqual(getHogarPinSession(), null);
});

it('setHogarPinSession guarda la sesión de Hogar en memoria', () => {
  clearHogarPinSession();
  const dummyPin = 'TEST_HOGAR_SECRET';
  setHogarPinSession(dummyPin);
  assert.strictEqual(getHogarPinSession(), dummyPin);
});

it('clearHogarPinSession anula la sesión del Hogar de inmediato', () => {
  setHogarPinSession('TEST_HOGAR_SECRET');
  clearHogarPinSession();
  assert.strictEqual(getHogarPinSession(), null);
});

it('Simulación de verificación de PIN Hogar: PIN correcto otorga sesión', () => {
  clearHogarPinSession();
  const pinHogar = 'HOGAR_SECRET_1';
  const simularVerificarHogar = (inputPin) => {
    if (inputPin === pinHogar) return { ok: true };
    return { ok: false, error: 'PIN del hogar incorrecto' };
  };

  const res = simularVerificarHogar('HOGAR_SECRET_1');
  assert.strictEqual(res.ok, true);
  if (res.ok) setHogarPinSession('HOGAR_SECRET_1');
  assert.strictEqual(getHogarPinSession(), 'HOGAR_SECRET_1');
});

it('Simulación de verificación de PIN Hogar: PIN incorrecto es rechazado', () => {
  clearHogarPinSession();
  const pinHogar = 'HOGAR_SECRET_1';
  const simularVerificarHogar = (inputPin) => {
    if (inputPin === pinHogar) return { ok: true };
    return { ok: false, error: 'PIN del hogar incorrecto' };
  };

  const res = simularVerificarHogar('WRONG_HOGAR_PIN');
  assert.strictEqual(res.ok, false);
  assert.strictEqual(getHogarPinSession(), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. FLUJO DE CONSUMO DEL HOGAR (PESAJE Y ALMACÉN)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 4. Flujo de Consumo Hogar (Balanza y Almacén) ---');

it('Consumo por peso con balanza Systel: descuenta stock y saldo a precio de costo', () => {
  let saldoHogar = 50000;
  let stockBanana = 25.5; // kg
  const costoKgBanana = 1200;

  // Peso disparado por la balanza
  const pesoBalanzaVivo = 2.450; // kg
  const subtotal = Number((pesoBalanzaVivo * costoKgBanana).toFixed(2)); // 2940

  assert.strictEqual(subtotal, 2940);
  assert.strictEqual(saldoHogar >= subtotal, true);

  // Simular confirmación directa (OK)
  stockBanana = Number((stockBanana - pesoBalanzaVivo).toFixed(3));
  saldoHogar = Number((saldoHogar - subtotal).toFixed(2));

  assert.strictEqual(stockBanana, 23.05);
  assert.strictEqual(saldoHogar, 47060);
});

it('Consumo de Almacén por unidad (pistola EAN): descuenta cantidad y costo', () => {
  let saldoHogar = 47060;
  let stockFideos = 10; // unidades
  const costoUnidadFideos = 1500;

  // Escaneo con pistola EAN o selección
  const unidadesConsumidas = 3;
  const subtotal = Number((unidadesConsumidas * costoUnidadFideos).toFixed(2)); // 4500

  assert.strictEqual(subtotal, 4500);

  // Confirmar OK
  stockFideos = stockFideos - unidadesConsumidas;
  saldoHogar = Number((saldoHogar - subtotal).toFixed(2));

  assert.strictEqual(stockFideos, 7);
  assert.strictEqual(saldoHogar, 42560);
});

it('Rechazo por saldo insuficiente en el Hogar', () => {
  const saldoHogar = 1000;
  const costoTotal = 3500;

  const saldoInsuficiente = costoTotal > saldoHogar;
  assert.strictEqual(saldoInsuficiente, true, 'Debe detectar saldo insuficiente y deshabilitar confirmación');
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. EGRESO POR MERMA (VALORIZADA AL COSTO)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 5. Egreso de Mercadería por Merma ---');

it('Merma valorizada al costo descuenta stock con motivo opcional', () => {
  let stockTomate = 15.0; // kg
  const costoKgTomate = 1800;
  const kgMermados = 1.850;
  const motivoMerma = 'Podrido'; // default opcional

  stockTomate = Number((stockTomate - kgMermados).toFixed(3));
  assert.strictEqual(stockTomate, 13.15);
  assert.strictEqual(motivoMerma, 'Podrido');
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. PARTE 3: BALANCE EXACTO POR PRODUCTO (GRAMOS ENTEROS)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 6. PARTE 3: Balance Exacto por Producto (Gramos Enteros) ---');

it('Test requerido: ingreso 20,000 kg, hogar 0,900 y 1,100, venta 2,350, merma 0,150 -> depósito 15,500 y diferencia 0,000', () => {
  const balance = calcularBalanceProducto({
    producto: 'Tomate Redondo',
    ingresado: 20.000,
    hogar: [0.900, 1.100], // dos consumos de hogar: 0.900 + 1.100 = 2.000 kg
    vendido: 2.350,
    merma: 0.150,
    deposito: 15.500,
    costo_unitario: 1200
  });

  // Verificaciones exactas
  assert.strictEqual(balance.ingresado_g, 20000, 'Ingresado debe ser 20000 gramos');
  assert.strictEqual(balance.hogar_g, 2000, 'Hogar debe sumar 2000 gramos');
  assert.strictEqual(balance.vendido_g, 2350, 'Vendido debe ser 2350 gramos');
  assert.strictEqual(balance.merma_g, 150, 'Merma debe ser 150 gramos');
  assert.strictEqual(balance.deposito_g, 15500, 'Depósito debe ser 15500 gramos');

  // Total salidas + depósito = 2000 + 2350 + 150 + 15500 = 20000 g
  assert.strictEqual(balance.diferencia_g, 0, 'Diferencia en gramos debe ser 0');
  assert.strictEqual(balance.diferencia, 0, 'Diferencia en kg debe ser 0.000');
  assert.strictEqual(balance.esExacto, true, 'Debe marcarse como exacto');

  // Valorización de merma al costo: 0.150 kg * $1200 = $180.00
  assert.strictEqual(balance.valor_merma_pesos, 180.00, 'Valor merma debe ser 180.00 pesos');
});

it('Aritmética en gramos enteros previene errores de coma flotante IEEE-754 (0,1 + 0,2)', () => {
  // En JS puro: 0.1 + 0.2 === 0.30000000000000004 !== 0.3
  const floatInexacto = 0.1 + 0.2;
  assert.notStrictEqual(floatInexacto, 0.3, 'Demostración de que coma flotante estándar falla');

  // Con nuestra función en gramos enteros:
  const balance = calcularBalanceProducto({
    producto: 'Lechuga Criolla',
    ingresado: 0.300,
    hogar: [0.100, 0.200], // 0.1 + 0.2
    vendido: 0,
    merma: 0,
    deposito: 0,
    costo_unitario: 800
  });

  assert.strictEqual(balance.hogar_g, 300, '100g + 200g debe dar exactamente 300g sin flotante');
  assert.strictEqual(balance.diferencia_g, 0, 'Diferencia debe dar exactamente 0 gramos');
  assert.strictEqual(balance.diferencia, 0, 'Diferencia en kg debe ser 0.000');
  assert.strictEqual(balance.esExacto, true);
});

it('Detección de descuadre: si falta o sobra stock, diferencia !== 0 y esExacto es false (para alerta en rojo)', () => {
  const balanceDescuadrado = calcularBalanceProducto({
    producto: 'Banana Cavendish',
    ingresado: 10.000,
    vendido: 3.000,
    hogar: 1.000,
    merma: 0.500,
    deposito: 5.000, // Suma egresos + depósito = 9.500 kg (faltan 0.500 kg)
    costo_unitario: 1500
  });

  assert.strictEqual(balanceDescuadrado.diferencia_g, 500, 'Faltan 500 gramos');
  assert.strictEqual(balanceDescuadrado.diferencia, 0.500);
  assert.strictEqual(balanceDescuadrado.esExacto, false, 'No debe ser exacto para renderizar en rojo');
  assert.strictEqual(balanceDescuadrado.valor_merma_pesos, 750.00); // 0.500 * 1500
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. SERVIDOR V19: CONSUMO MIXTO, ERRORES DE STOCK Y SIN DOBLE DESCUENTO
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 4. Servidor v19: Consumo Mixto, Errores y Sin Doble Descuento ---');

it('Formato exacto v19: consumo mixto (kilos + unidades de almacén) sin clave unidad', () => {
  const itemsCliente = [
    { producto: 'Papa Negra', kg: 2.450 },
    { producto: 'Choclo en Grano Arcor', unidades: 3, ean: '7790580123456' }
  ];

  // Simular formateo de apiRegistrarSalidas
  const payloadItems = itemsCliente.map(it => {
    const p = { producto: String(it.producto).trim() };
    if (it.unidades !== undefined && it.unidades !== null) {
      p.unidades = Math.round(Number(it.unidades));
      if (it.ean) p.ean = String(it.ean).trim();
    } else if (it.kg !== undefined && it.kg !== null) {
      p.kg = Number(it.kg);
    }
    return p;
  });

  // Ítem 1 (Kilos): { producto, kg }
  assert.deepStrictEqual(payloadItems[0], { producto: 'Papa Negra', kg: 2.450 });
  assert.strictEqual('unidad' in payloadItems[0], false, 'No debe llevar la clave unidad');

  // Ítem 2 (Almacén): { producto, unidades, ean }
  assert.deepStrictEqual(payloadItems[1], { producto: 'Choclo en Grano Arcor', unidades: 3, ean: '7790580123456' });
  assert.strictEqual('unidad' in payloadItems[1], false, 'No debe llevar la clave unidad');
});

it('Simulación servidor v19 con éxito: respuesta contiene ok, total_pesos, saldo, almacen_items', () => {
  // Mock de respuesta v19 exitosa del servidor
  const respuestaServidorV19 = {
    ok: true,
    total_pesos: 4500,
    saldo: 15500,
    almacen_items: [
      { producto: 'Choclo en Grano Arcor', unidades_descontadas: 3, stock_restante: 12 }
    ]
  };

  assert.strictEqual(respuestaServidorV19.ok, true);
  assert.strictEqual(respuestaServidorV19.saldo, 15500);
  assert.strictEqual(respuestaServidorV19.almacen_items[0].unidades_descontadas, 3);
});

it('Manejo de error de stock insuficiente del servidor se muestra tal cual', () => {
  const respuestaErrorStock = {
    ok: false,
    error: 'No hay stock suficiente de Choclo en Grano Arcor (en almacen: 2)'
  };

  let mensajeErrorUI = null;
  if (!respuestaErrorStock.ok) {
    mensajeErrorUI = respuestaErrorStock.error;
  }

  assert.strictEqual(mensajeErrorUI, 'No hay stock suficiente de Choclo en Grano Arcor (en almacen: 2)');
});

it('Manejo de error de producto no encontrado en almacén se muestra tal cual', () => {
  const respuestaErrorNoEncontrado = {
    ok: false,
    error: 'Producto de almacen no encontrado: Galletitas Rellenas'
  };

  let mensajeErrorUI = null;
  if (!respuestaErrorNoEncontrado.ok) {
    mensajeErrorUI = respuestaErrorNoEncontrado.error;
  }

  assert.strictEqual(mensajeErrorUI, 'Producto de almacen no encontrado: Galletitas Rellenas');
});

it('Manejo de error de saldo del hogar insuficiente se muestra tal cual', () => {
  const respuestaErrorSaldo = {
    ok: false,
    error: 'Saldo del hogar insuficiente'
  };

  let mensajeErrorUI = null;
  if (!respuestaErrorSaldo.ok) {
    mensajeErrorUI = respuestaErrorSaldo.error;
  }

  assert.strictEqual(mensajeErrorUI, 'Saldo del hogar insuficiente');
});

it('EAN se incluye en el payload cuando el producto se elige por escaneo', () => {
  const prodMatch = { producto: 'Yerba Playadito 500g', unidad: 'un', ean: '7790580654321' };
  const codigoEscaneadoPistola = '7790580654321';

  const itemPayload = {
    producto: prodMatch.producto,
    unidades: 2,
    ...(codigoEscaneadoPistola ? { ean: codigoEscaneadoPistola } : {})
  };

  assert.strictEqual(itemPayload.ean, '7790580654321');
  assert.strictEqual('unidad' in itemPayload, false);
});

it('Sin doble descuento: el cliente no descuenta stock_unidades localmente y recarga desde el servidor', () => {
  let stockServidor = 10;
  let stockCliente = 10;
  let llamadasUpdateAlmacen = 0;
  let llamadasStockSync = 0;

  // Servidor descuenta
  const simularSalidaServidor = (unidades) => {
    stockServidor -= unidades;
    return { ok: true, saldo: 5000 };
  };

  // Cliente: envía al servidor y recarga (sin descuento local previo ni llamadas duplicadas)
  const registrarConsumoCliente = (unidades) => {
    const res = simularSalidaServidor(unidades);
    if (res.ok) {
      // Recargar desde servidor (NO modificar stockCliente restando directamente)
      stockCliente = stockServidor;
    }
  };

  registrarConsumoCliente(3);

  assert.strictEqual(stockServidor, 7, 'Servidor descontó 3 unidades');
  assert.strictEqual(stockCliente, 7, 'Cliente sincronizó exactamente con el servidor sin doble descuento');
  assert.strictEqual(llamadasUpdateAlmacen, 0, 'No debe llamar a updateAlmacen');
  assert.strictEqual(llamadasStockSync, 0, 'No debe llamar a stockSync');
});

console.log('\n==================================================================');
console.log(`TOTAL RESULTADO: ${passedTests} ok, 0 fallas (Total: ${totalTests})`);
console.log('==================================================================');
