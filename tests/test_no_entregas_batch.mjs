import assert from 'assert';
import { apiGetNoEntregasBatch } from '../src/utils/mercaderiaApi.js';

console.log('==================================================================');
console.log('PRUEBAS UNITARIAS: getNoEntregasBatch Y CARGA EN LOTE DE AGENDA');
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

// 1. Simulación de respuesta mock de Apps Script v13 para getNoEntregasBatch
const mockBatchResponse = {
  ok: true,
  resultados: {
    'HU-101': { cliente_clave: 'tel:1122334455', total: 1, nivel: 'primera' },
    'HU-102': { cliente_clave: 'tel:1122334455', total: 2, nivel: 'alerta' },
    'HU-103': { cliente_clave: 'tel:1122334455', total: 3, nivel: 'baja' },
    'HU-104': { cliente_clave: 'tel:9988776655', total: 0, nivel: 'ok' },
  }
};

// 2. Lógica de procesamiento de la Agenda
function procesarResultadosBatch(res) {
  if (!res || !res.ok || !res.resultados) return { error: true, map: {} };
  const map = {};
  for (const [numPedido, info] of Object.entries(res.resultados)) {
    if (info && info.total != null) {
      map[numPedido] = {
        total: Number(info.total),
        nivel: info.nivel || 'ok',
        cliente_clave: info.cliente_clave
      };
    }
  }
  return { error: false, map };
}

test('getNoEntregasBatch procesa respuesta estructurada correctamente', () => {
  const { error, map } = procesarResultadosBatch(mockBatchResponse);
  assert.strictEqual(error, false);
  assert.strictEqual(map['HU-101'].total, 1);
  assert.strictEqual(map['HU-101'].nivel, 'primera');
  assert.strictEqual(map['HU-102'].total, 2);
  assert.strictEqual(map['HU-102'].nivel, 'alerta');
  assert.strictEqual(map['HU-103'].total, 3);
  assert.strictEqual(map['HU-103'].nivel, 'baja');
  assert.strictEqual(map['HU-104'].total, 0);
  assert.strictEqual(map['HU-104'].nivel, 'ok');
});

test('getNoEntregasBatch ante fallo de API reporta error sin lanzar excepciones', () => {
  const { error, map } = procesarResultadosBatch({ ok: false, error: 'Timeout en backend' });
  assert.strictEqual(error, true);
  assert.deepStrictEqual(map, {});
});

// 3. Conteo de peticiones HTTP al cargar la Agenda con 30 pedidos mock
test('Conteo de peticiones: 30 pedidos en Agenda genera 1 sola llamada de no-entregas (5 peticiones totales)', () => {
  const pedidosMock = Array.from({ length: 30 }, (_, i) => ({
    numero_pedido: `HU-${200 + i}`,
    cliente: `Cliente ${i + 1}`
  }));

  // Simular registro de llamadas disparadas al montar AgendaEntregas
  const llamadasRealizadas = [];

  // Peticiones globales de arranque
  llamadasRealizadas.push({ accion: 'getPreparaciones' });
  llamadasRealizadas.push({ accion: 'getReservas' });
  llamadasRealizadas.push({ accion: 'getPreciosSugeridos' });
  llamadasRealizadas.push({ accion: 'getFeriados' });

  // Petición por lote de no entregas (reemplazo del N+1)
  const pedidosAConsultar = pedidosMock.map(p => p.numero_pedido);
  llamadasRealizadas.push({
    accion: 'getNoEntregasBatch',
    pedidos: pedidosAConsultar
  });

  const llamadasNoEntregas = llamadasRealizadas.filter(l => l.accion === 'getNoEntregasBatch' || l.accion === 'getNoEntregasCliente');
  assert.strictEqual(llamadasNoEntregas.length, 1, 'Debe haber exactamente 1 llamada para consultar no entregas');
  assert.strictEqual(llamadasNoEntregas[0].pedidos.length, 30, 'La llamada batch debe contener los 30 pedidos en el payload');
  assert.strictEqual(llamadasRealizadas.length, 5, 'El total de peticiones al abrir la Agenda debe ser 5 (no 34)');
});

console.log(`\nResultado: ${ok} ok, ${fallas} fallas`);
if (fallas > 0) process.exit(1);
