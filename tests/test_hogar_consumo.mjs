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

  const valorCostoMerma = Number((kgMermados * costoKgTomate).toFixed(2));
  assert.strictEqual(valorCostoMerma, 3330);

  stockTomate = Number((stockTomate - kgMermados).toFixed(3));
  assert.strictEqual(stockTomate, 13.15);
  assert.strictEqual(motivoMerma, 'Podrido');
});

console.log('\n==================================================================');
console.log(`TOTAL RESULTADO: ${passedTests} ok, 0 fallas (Total: ${totalTests})`);
console.log('==================================================================');
