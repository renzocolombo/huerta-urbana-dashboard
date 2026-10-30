import assert from 'assert';
import {
  obtenerCodigoPropioCliente,
  validarEnvioCodigoReferido,
  prepararPayloadReferido,
  MENSAJE_SIN_CODIGO
} from '../src/utils/referidosClientes.js';

console.log('==================================================================');
console.log('PRUEBAS UNITARIAS: CÓDIGO DE REFERIDO PROPIO DE CLIENTES');
console.log('==================================================================\n');

let ok = 0;
let fallas = 0;

function test(nombre, fn) {
  try {
    fn();
    console.log(`OK    ${nombre}`);
    ok++;
  } catch (err) {
    console.error(`FAIL  ${nombre}: ${err.message}`);
    fallas++;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 1. OBTENCIÓN DEL CÓDIGO PROPIO DESDE LA HOJA CLIENTES (NUNCA DE PEDIDOS)
// ────────────────────────────────────────────────────────────────────────────
test('1.1 Cliente con código en Clientes cruzando por UID: devuelve código propio', () => {
  const cliente = { uid: 'usr_abc_123', email: 'test@example.com' };
  const clientesSheet = [
    { uid: 'usr_abc_123', email: 'otro@example.com', codigo_referido: 'HU-9876' },
    { uid: 'usr_xyz_999', email: 'test@example.com', codigo_referido: 'HU-1111' }
  ];

  const codigo = obtenerCodigoPropioCliente(cliente, clientesSheet);
  assert.strictEqual(codigo, 'HU-9876', 'Debe priorizar UID y traer el código propio de Clientes');
});

test('1.2 Cliente con código en Clientes cruzando por email: devuelve código propio', () => {
  const cliente = { uid: '', email: 'Carlos.Perez@Gmail.COM ' };
  const clientesSheet = [
    { uid: 'usr_carlos', email: 'carlos.perez@gmail.com', codigo_referido: 'HU-CP22' }
  ];

  const codigo = obtenerCodigoPropioCliente(cliente, clientesSheet);
  assert.strictEqual(codigo, 'HU-CP22', 'Debe coincidir email insensible a mayúsculas y espacios');
});

test('1.3 Cliente con codigo_referido en Pedidos (código usado) pero SIN código en Clientes: devuelve vacío', () => {
  // En Pedidos, codigo_referido es el código que el cliente USÓ al comprar (ej. el de su amigo HU-AMIGO)
  const cliente = {
    uid: 'usr_nuevo',
    email: 'comprador@gmail.com',
    codigo_referido_usado: 'HU-AMIGO',
    // Si algún código viniera de Pedidos.codigo_referido, NUNCA debe considerarse código propio
  };
  const clientesSheet = [
    { uid: 'usr_otro', email: 'otro@gmail.com', codigo_referido: 'HU-OTRO' }
  ];

  const codigo = obtenerCodigoPropioCliente(cliente, clientesSheet);
  assert.strictEqual(codigo, '', 'No debe leer de Pedidos: si no está en Clientes, el código es vacío');
});

test('1.4 Cliente sin coincidencia en Clientes: devuelve cadena vacía', () => {
  const cliente = { uid: 'usr_inexistente', email: 'no_existe@gmail.com' };
  const clientesSheet = [
    { uid: 'usr_1', email: 'uno@gmail.com', codigo_referido: 'HU-0001' }
  ];

  const codigo = obtenerCodigoPropioCliente(cliente, clientesSheet);
  assert.strictEqual(codigo, '');
});

// ────────────────────────────────────────────────────────────────────────────
// 2. VALIDACIÓN DE ENVÍO Y MENSAJE DE ADVERTENCIA
// ────────────────────────────────────────────────────────────────────────────
test('2.1 Cliente con código en Clientes: puede enviar y reporta código exacto', () => {
  const cliente = { email: 'laura@huerta.com' };
  const clientesSheet = [
    { email: 'laura@huerta.com', codigo_referido: 'HU-LAU1' }
  ];

  const validacion = validarEnvioCodigoReferido(cliente, clientesSheet);
  assert.strictEqual(validacion.puedeEnviar, true);
  assert.strictEqual(validacion.codigo, 'HU-LAU1');
  assert.strictEqual(validacion.motivo, '');
});

test('2.2 Cliente sin código en Clientes: NO puede enviar y muestra mensaje requerido', () => {
  const cliente = { email: 'sin_codigo@huerta.com' };
  const clientesSheet = [
    { email: 'sin_codigo@huerta.com', codigo_referido: '' }
  ];

  const validacion = validarEnvioCodigoReferido(cliente, clientesSheet);
  assert.strictEqual(validacion.puedeEnviar, false);
  assert.strictEqual(validacion.codigo, '');
  assert.strictEqual(
    validacion.motivo,
    'Este cliente todavía no tiene código: se genera cuando inicia sesión en la web'
  );
  assert.strictEqual(validacion.motivo, MENSAJE_SIN_CODIGO);
});

// ────────────────────────────────────────────────────────────────────────────
// 3. NINGUNA ESCRITURA A Pedidos.codigo_referido
// ────────────────────────────────────────────────────────────────────────────
test('3.1 prepararPayloadReferido contiene ÚNICAMENTE referido_estado y NO codigo_referido', () => {
  const payload = prepararPayloadReferido();
  assert.strictEqual(payload.referido_estado, 'Enviado');
  assert.strictEqual('codigo_referido' in payload, false, 'Payload NUNCA debe contener la clave codigo_referido');
  assert.deepStrictEqual(Object.keys(payload), ['referido_estado']);
});

// ────────────────────────────────────────────────────────────────────────────
// 4. SIMULACIÓN EN MEMORIA DEL FLUJO DE ENVÍO Y DESHABILITACIÓN
// ────────────────────────────────────────────────────────────────────────────
test('4.1 Simulación: cliente con código en Clientes envía su código y actualiza solo referido_estado', () => {
  const c = {
    sheetRowIndex: 42,
    nombre: 'Valeria Gómez',
    telefono: '1123456789',
    email: 'valeria@gmail.com',
    codigo_referido_usado: 'HU-COMPRA1', // código usado al comprar
    codigo_referido: 'HU-VALE' // código propio obtenido de Clientes
  };

  const escrituras = [];
  const fakeActualizarDatosCliente = (fila, payload) => {
    escrituras.push({ fila, payload });
  };

  const validacion = validarEnvioCodigoReferido(c, [{ email: c.email, codigo_referido: 'HU-VALE' }]);
  assert.strictEqual(validacion.puedeEnviar, true);

  // Simular envío
  if (validacion.puedeEnviar) {
    fakeActualizarDatosCliente(c.sheetRowIndex, prepararPayloadReferido());
  }

  // Verificaciones
  assert.strictEqual(escrituras.length, 1, 'Debe haber exactamente 1 llamada de actualización');
  assert.strictEqual(escrituras[0].fila, 42);
  assert.strictEqual(escrituras[0].payload.referido_estado, 'Enviado');
  assert.strictEqual('codigo_referido' in escrituras[0].payload, false, 'No debe escribir codigo_referido en Pedidos');

  // El mensaje de WhatsApp debe contener el código propio HU-VALE y no el usado ni uno inventado
  const mensajeSimulado = `Te compartimos tu código de referido personal: ${validacion.codigo}`;
  assert(mensajeSimulado.includes('HU-VALE'), 'El mensaje debe llevar el código propio de Clientes');
  assert(!mensajeSimulado.includes('HU-COMPRA1'), 'El mensaje NO debe llevar el código que usó en la compra');
});

test('4.2 Simulación: cliente sin código en Clientes no realiza escrituras ni genera código al azar', () => {
  const c = {
    sheetRowIndex: 88,
    nombre: 'Nuevo Cliente',
    telefono: '1199998888',
    email: 'nuevo@gmail.com',
    codigo_referido: '', // sin código en Clientes
    codigo_referido_usado: ''
  };

  const escrituras = [];
  const fakeActualizarDatosCliente = (fila, payload) => {
    escrituras.push({ fila, payload });
  };

  const validacion = validarEnvioCodigoReferido(c, []);
  assert.strictEqual(validacion.puedeEnviar, false);
  assert.strictEqual(validacion.motivo, MENSAJE_SIN_CODIGO);

  // Como no puede enviar, no se dispara ninguna actualización
  if (validacion.puedeEnviar) {
    fakeActualizarDatosCliente(c.sheetRowIndex, prepararPayloadReferido());
  }

  assert.strictEqual(escrituras.length, 0, 'No debe realizar ninguna escritura si no tiene código propio');
});

test('4.3 Preservación: un comprador que usó código de un amigo no sobreescribe Pedidos.codigo_referido', () => {
  // Pedido en la hoja Pedidos:
  const filaPedido = {
    sheetRowIndex: 15,
    numero_pedido: 'HU-5544',
    nombre: 'Comprador Amigo',
    email: 'amigo@gmail.com',
    codigo_referido: 'HU-JUAN1', // El código de JUAN que usó para tener descuento
    referido_estado: ''
  };

  // Hoja Clientes donde este comprador tiene su propio código (o ninguno):
  const clientesSheet = [
    { email: 'amigo@gmail.com', codigo_referido: 'HU-AMIG9' }
  ];

  const codigoPropio = obtenerCodigoPropioCliente(filaPedido, clientesSheet);
  assert.strictEqual(codigoPropio, 'HU-AMIG9');
  assert.notStrictEqual(codigoPropio, filaPedido.codigo_referido, 'El código propio difiere del código usado en Pedidos');

  // Al enviar su código de referido al cliente:
  const payload = prepararPayloadReferido();
  // Se aplica sobre la fila:
  const filaActualizada = { ...filaPedido, ...payload };

  // Verificación crítica: filaPedido.codigo_referido (HU-JUAN1) SE MANTIENE INTACTO
  assert.strictEqual(filaActualizada.codigo_referido, 'HU-JUAN1', 'codigo_referido en Pedidos permanece intacto para la acreditación del servidor');
  assert.strictEqual(filaActualizada.referido_estado, 'Enviado');
});

console.log(`\n==================================================================`);
console.log(`TOTAL RESULTADO: ${ok} ok, ${fallas} fallas`);
console.log(`==================================================================`);

if (fallas > 0) {
  process.exit(1);
}
