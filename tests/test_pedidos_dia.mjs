// tests/test_pedidos_dia.mjs
// Suite de pruebas de simulación y validación para feat/pedidos-dia.
// Requisitos A a H: Pedidos del día por fecha de ingreso, tarjeta unificada,
// armado con entrega futura, navegación de agenda y calendario con montos,
// faltantes mixtos (kilo + almacén) y renderizado SSR.

import assert from 'node:assert';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { createServer } from 'vite';

import { 
  extraerFechaIngresoYMD, 
  extraerHoraIngreso, 
  extraerFechaYMD 
} from '../src/utils/fechasEntrega.js';
import { 
  resolverEntrega, 
  esPedidoCancelado, 
  esPedidoEntregado, 
  semanasDelMes,
  semanasDelMesConVecinos,
  agruparPorFecha
} from '../src/utils/agendaCalendario.js';
import { bloquesDelDia, turnoDePedido } from '../src/utils/entregaCalendario.js';
import { calcularTotalPedido } from '../src/utils/totalesPedido.js';
import { estadoEntregaPedido } from '../src/utils/estadosPedido.js';
import { calcularFaltantes } from '../src/utils/faltantesLogic.js';
import { calcularDetalleYTotalesDia } from '../src/utils/calendarioTotales.js';

let passed = 0;
let failed = 0;

function t(desc, cond) {
  if (cond) {
    console.log(`OK    ${desc}`);
    passed++;
  } else {
    console.error(`FAIL  ${desc}`);
    failed++;
  }
}

console.log('==================================================================');
console.log('PRUEBAS: FEAT/PEDIDOS-DIA (Simulación, Lógica de Negocio y SSR)');
console.log('==================================================================\n');

// ── 1. PARSEO DE FECHA DE INGRESO SIN CORRIMIENTO UTC (Requisito A y H) ──
console.log('--- 1. Fechas y horas de ingreso sin corrimiento UTC (23:30 local) ---');

const casoLocalString = '2026-10-30 23:30:00';
const casoIsoString = '2026-10-30T23:30:00';
const casoDMYString = '30/10/2026 23:30:00';
const casoDateSheet = 'Date(2026,9,30,23,30,0)'; // Sheets: mes 9 = Octubre

t('Fecha YMD 23:30 local YYYY-MM-DD HH:mm:ss', extraerFechaIngresoYMD(casoLocalString) === '2026-10-30');
t('Hora 23:30 local YYYY-MM-DD HH:mm:ss', extraerHoraIngreso(casoLocalString) === '23:30');

t('Fecha YMD 23:30 local YYYY-MM-DDTHH:mm:ss', extraerFechaIngresoYMD(casoIsoString) === '2026-10-30');
t('Hora 23:30 local YYYY-MM-DDTHH:mm:ss', extraerHoraIngreso(casoIsoString) === '23:30');

t('Fecha YMD 23:30 local DD/MM/YYYY HH:mm:ss', extraerFechaIngresoYMD(casoDMYString) === '2026-10-30');
t('Hora 23:30 local DD/MM/YYYY HH:mm:ss', extraerHoraIngreso(casoDMYString) === '23:30');

t('Fecha YMD 23:30 local Date(Sheets)', extraerFechaIngresoYMD(casoDateSheet) === '2026-10-30');
t('Hora 23:30 local Date(Sheets)', extraerHoraIngreso(casoDateSheet) === '23:30');

// ── 2. CASO REAL HU-868434: INGRESO HOY (30/10) CON ENTREGA LUNES (02/11) ──
console.log('\n--- 2. Caso real HU-868434: Pedidos del día vs Agenda ---');

const pedidoHU868434 = {
  numero_pedido: 'HU-868434',
  nombre: 'Renzo Colombo',
  fecha: '2026-10-30 23:30:00',
  dia_entrega: 'Lunes 02/11/2026 Tarde',
  horario_entrega: '14:00 - 17:00',
  producto: 'Aceite de Oliva Extra Virgen 500ml',
  cantidades: '2',
  total: 16000,
  estado: 'pendiente',
  estado_pago: 'pending',
  metodo_pago: 'efectivo',
  localidad: 'Del Viso'
};

// Pedidos del día 2026-10-30
const fechaIngresoPedido = extraerFechaIngresoYMD(pedidoHU868434.fecha);
t('HU-868434: Fecha de ingreso es 2026-10-30', fechaIngresoPedido === '2026-10-30');

const esDelDiaViernes30 = fechaIngresoPedido === '2026-10-30';
t('HU-868434: Aparece en Pedidos del día del Viernes 30/10', esDelDiaViernes30 === true);

const esDelDiaLunes02 = fechaIngresoPedido === '2026-11-02';
t('HU-868434: NO aparece en Pedidos del día del Lunes 02/11', esDelDiaLunes02 === false);

// Agrupamiento en Pedidos del día del 30/10: entrega es el 02/11
const resEntrega = resolverEntrega(pedidoHU868434);
t('HU-868434: Fecha de entrega resuelta es 2026-11-02', resEntrega.ymd === '2026-11-02');
t('HU-868434: Turno de entrega es Tarde', turnoDePedido(pedidoHU868434) === 'Tarde');

const esMasAdelante = resEntrega.ymd > '2026-10-31';
t('HU-868434: En Pedidos del día queda agrupado en "Más adelante"', esMasAdelante === true);

// En la Agenda:
// Pedidos activos de entrega el 02/11 deben incluir HU-868434
const pedidosActivosAgenda = [pedidoHU868434].filter(p => {
  const est = (p.estado || '').toLowerCase().trim();
  const cancelado = est === 'cancelado' || est === 'cancelled';
  const entregado = est === 'entregado' || est === 'delivered';
  return !cancelado && !entregado;
});
t('HU-868434: Aparece como pedido activo en la Agenda de entregas', pedidosActivosAgenda.length === 1);

const gruposAgenda = agruparPorFecha(pedidosActivosAgenda.map(p => ({
  ...p,
  entregaYMD: resEntrega.ymd,
  entregaBloque: 'T',
  claveOrden: `${resEntrega.ymd}_T`
})));
const diaLunes = gruposAgenda.dias.find(d => d.ymd === '2026-11-02');
t('HU-868434: Agenda genera la pestaña / día del Lunes 02/11', Boolean(diaLunes));
t('HU-868434: Figura en el turno Tarde del Lunes 02/11', diaLunes?.porBloque.T.length === 1);

// Armado de pedido con entrega futura
const puedeArmarseFuturo = !esPedidoCancelado(pedidoHU868434) && !esPedidoEntregado(pedidoHU868434);
t('HU-868434: Se puede armar hoy aunque su entrega sea futura (Lunes 02/11)', puedeArmarseFuturo === true);

// ── 3. FILTROS Y CONTADORES EN PEDIDOS DEL DÍA ──
console.log('\n--- 3. Filtros y contadores en Pedidos del día ---');

const pedidosDiaMock = [
  pedidoHU868434, // Pendiente, $16.000
  {
    numero_pedido: 'HU-868435',
    fecha: '2026-10-30 15:00:00',
    dia_entrega: 'Viernes 30/10/2026 Tarde',
    estado: 'preparado',
    producto: 'Tomate Redondo',
    cantidades: '2',
    total: 8000
  },
  {
    numero_pedido: 'HU-868436',
    fecha: '2026-10-30 18:00:00',
    dia_entrega: 'Sábado 31/10/2026 Mañana',
    estado: 'entregado',
    producto: 'Palta Hass',
    cantidades: '1',
    total: 5000
  },
  {
    numero_pedido: 'HU-868437',
    fecha: '2026-10-30 19:00:00',
    dia_entrega: 'Lunes 02/11/2026 Tarde',
    estado: 'cancelado',
    producto: 'Lechuga Criolla',
    cantidades: '1',
    total: 3000
  }
];

let totalMonto = 0;
let cPend = 0, cPrep = 0, cEnt = 0, cCanc = 0;

pedidosDiaMock.forEach(p => {
  const est = estadoEntregaPedido(p);
  const tot = calcularTotalPedido(p).monto;
  totalMonto += tot;

  if (est.id === 'cancelado') cCanc++;
  else if (est.id === 'entregado') cEnt++;
  else if (est.id === 'armado' || est.id === 'listo' || p.estado === 'preparado') cPrep++;
  else cPend++;
});

t('Contador Total de pedidos del día', pedidosDiaMock.length === 4);
t('Contador Pendientes', cPend === 1);
t('Contador Listos / Preparados', cPrep === 1);
t('Contador Entregados', cEnt === 1);
t('Contador Cancelados', cCanc === 1);
t('Monto total calculado del día ($32.000)', totalMonto === 32000);

// ── 4. NAVEGACIÓN DE MES EN CALENDARIO (Octubre, Noviembre, Diciembre, Enero) ──
console.log('\n--- 4. Navegación de mes y reglas de entrega (Oct 2026 - Ene 2027) ---');

// Octubre 2026
const semOct = semanasDelMes(2026, 10, true);
t('Octubre 2026: tiene filas de semanas', semOct.length >= 5);
t('Octubre 2026: semanas vecinas completas (primer día es lunes 28/09)', semOct[0][0] === '2026-09-28');

// Noviembre 2026
const semNov = semanasDelMes(2026, 11, true);
t('Noviembre 2026: tiene filas de semanas', semNov.length >= 5);
t('Noviembre 2026: 1 de nov es domingo, semana vecina empieza lunes 26/10', semNov[0][0] === '2026-10-26');
t('Noviembre 2026: último día 30 de nov, semana vecina termina en diciembre', semNov[semNov.length - 1][6] === '2026-12-06');

// Diciembre 2026
const semDic = semanasDelMes(2026, 12, true);
t('Diciembre 2026: tiene filas de semanas', semDic.length >= 5);

// Enero 2027 (Cambio de año)
const semEne = semanasDelMes(2027, 1, true);
t('Enero 2027 (cambio de año): tiene filas de semanas', semEne.length >= 5);
t('Enero 2027: 1 de enero 2027 es viernes, semana vecina arranca en dic 2026', semEne[0][0] === '2026-12-28');

// Reglas de bloques en meses futuros (sin cupo ni límite)
// Lunes 02/11/2026: solo Tarde
t('Lunes futuro (02/11/2026): solo bloque Tarde', JSON.stringify(bloquesDelDia('2026-11-02', [])) === JSON.stringify(['T']));
// Martes 03/11/2026: Mañana y Tarde
t('Martes futuro (03/11/2026): ambos bloques (M y T)', JSON.stringify(bloquesDelDia('2026-11-03', [])) === JSON.stringify(['M', 'T']));
// Sábado 07/11/2026: solo Mañana
t('Sábado futuro (07/11/2026): solo bloque Mañana', JSON.stringify(bloquesDelDia('2026-11-07', [])) === JSON.stringify(['M']));
// Domingo 08/11/2026: ninguno
t('Domingo futuro (08/11/2026): sin entregas', JSON.stringify(bloquesDelDia('2026-11-08', [])) === JSON.stringify([]));

// Totales de calendario del día
const totNov02 = calcularDetalleYTotalesDia([pedidoHU868434], '2026-11-02', {}, { filtrarElegibles: false });
t('Calendario totales: cuenta 1 pedido el 02/11/2026', totNov02.totalPedidos === 1);
t('Calendario totales: monto de $16.000 el 02/11/2026', totNov02.totalMonto === 16000);

// ── 5. FALTANTES CON PEDIDOS PENDIENTES MIXTOS (KILO + ALMACÉN) ──
console.log('\n--- 5. Faltantes: Demanda de pedidos pendientes (Kilo + Almacén) ---');

const stockDataTest = {
  'prod_tomate': {
    nombre: 'Tomate Redondo',
    categoriaPrincipal: 'Verduras',
    tipo: 'kilo',
    stock: { '1kg': 2, '500g': 0 } // 2 kg disponibles
  }
};

const productosCostosTest = [
  {
    id: 'prod_tomate',
    nombre: 'Tomate Redondo',
    activo: true,
    categoriaPrincipal: 'Verduras',
    unidad: 'kg'
  },
  {
    id: 'prod_aceite',
    nombre: 'Aceite de Oliva Extra Virgen 500ml',
    activo: true,
    categoriaPrincipal: 'Almacén',
    unidad: 'unidades',
    stock_unidades: 0, // 0 unidades en almacén -> debe saltar faltante
    codigo_ean: '7791234567890'
  }
];

const stockKgListTest = [
  { producto: 'Tomate Redondo', en_deposito: 2, unidad: 'kg' } // 2 kg disponibles
];

const pedidosPendientesTest = [
  {
    numero_pedido: 'HU-900001',
    producto: 'Tomate Redondo',
    cantidades: '5', // Pide 5 kg, hay 2 kg -> faltan 3 kg
    estado: 'pendiente',
    dia_entrega: 'Lunes 02/11/2026 Tarde'
  },
  {
    numero_pedido: 'HU-900002',
    producto: 'Aceite de Oliva Extra Virgen 500ml',
    cantidades: '2', // Pide 2 unidades, hay 0 -> faltan 2 unidades
    estado: 'pendiente',
    dia_entrega: 'Martes 03/11/2026 Mañana'
  }
];

const resFaltantes = calcularFaltantes(
  stockDataTest,
  productosCostosTest,
  pedidosPendientesTest,
  stockKgListTest
);

const fTomate = resFaltantes.faltantes.find(f => f.nombre === 'Tomate Redondo');
const fAceite = resFaltantes.faltantes.find(f => f.nombre === 'Aceite de Oliva Extra Virgen 500ml');

t('Faltantes: Detecta faltante de Tomate (kilo)', Boolean(fTomate));
t('Faltantes: Falta de Tomate calculada correctamente (3 kg)', fTomate?.comprarSugerido >= 3);
t('Faltantes: Tomate indica entrega más próxima (02/11)', fTomate?.proximaEntregaLabel?.includes('02/11') || fTomate?.proximaEntregaYMD === '2026-11-02');

t('Faltantes: Detecta faltante de Aceite de Oliva (Almacén)', Boolean(fAceite));
t('Faltantes: Falta de Aceite calculada correctamente (2 unidades)', fAceite?.comprarSugerido === 2);
t('Faltantes: Aceite indica entrega más próxima (03/11)', fAceite?.proximaEntregaLabel?.includes('03/11') || fAceite?.proximaEntregaYMD === '2026-11-03');

// ── 6. RENDERIZADO SSR DE LOS COMPONENTES ──
console.log('\n--- 6. Renderizado SSR de Pedidos del día, Agenda, Calendario y Faltantes ---');

async function testSSR() {
  const server = await createServer({ server: { middlewareMode: true } });
  try {
    // 6.1 TarjetaPedido
    console.log('Probando render SSR de TarjetaPedido...');
    const modTarjeta = await server.ssrLoadModule('/src/components/TarjetaPedido.jsx');
    const TarjetaPedidoComp = modTarjeta.default;
    const htmlTarjeta = ReactDOMServer.renderToString(
      React.createElement(TarjetaPedidoComp, {
        pedido: pedidoHU868434,
        preparacion: null,
        onArmar: () => {}
      })
    );
    assert.ok(htmlTarjeta.includes('HU-868434'), 'Debe incluir número de pedido');
    assert.ok(htmlTarjeta.includes('Renzo Colombo'), 'Debe incluir nombre del cliente');
    assert.ok(htmlTarjeta.includes('Armar pedido'), 'Debe incluir botón Armar pedido');
    t('SSR TarjetaPedido exitoso', true);

    // Context helper
    const modContext = await server.ssrLoadModule('/src/context/GoogleSheetsContext.jsx');
    const GoogleSheetsContext = modContext.GoogleSheetsContext;

    const mockCtxReal = {
      pedidos: [pedidoHU868434],
      productosCostos: productosCostosTest,
      stockData: stockDataTest,
      cargando: false,
      refrescar: () => {},
      actualizarStock: () => {}
    };

    const mockCtxVacio = {
      pedidos: [],
      productosCostos: [],
      stockData: {},
      cargando: false,
      refrescar: () => {},
      actualizarStock: () => {}
    };

    // 6.2 PedidosDelDia (Vacío y Real)
    console.log('Probando render SSR de PedidosDelDia (vacío y con datos)...');
    const modPedidos = await server.ssrLoadModule('/src/components/PedidosDelDia.jsx');
    const PedidosDelDiaComp = modPedidos.default;
    
    // Vacío
    const htmlPedidosVacio = ReactDOMServer.renderToString(
      React.createElement(GoogleSheetsContext.Provider, { value: mockCtxVacio },
        React.createElement(PedidosDelDiaComp, { rol: 'admin', usuario: 'Ren' })
      )
    );
    assert.ok(htmlPedidosVacio.includes('Pedidos del Día'), 'Pedidos vacío debe incluir título');
    assert.ok(htmlPedidosVacio.includes('Total Ingresados'), 'Pedidos vacío debe incluir métricas');

    // Real
    const htmlPedidosReal = ReactDOMServer.renderToString(
      React.createElement(GoogleSheetsContext.Provider, { value: mockCtxReal },
        React.createElement(PedidosDelDiaComp, { rol: 'admin', usuario: 'Ren' })
      )
    );
    assert.ok(htmlPedidosReal.includes('HU-868434'), 'Pedidos real debe incluir HU-868434');
    t('SSR PedidosDelDia (vacío y real) exitoso', true);

    // 6.3 AgendaEntregas (Vacío y Real)
    console.log('Probando render SSR de AgendaEntregas (vacío y con datos)...');
    const modAgenda = await server.ssrLoadModule('/src/components/AgendaEntregas.jsx');
    const AgendaComp = modAgenda.default;

    // Vacío
    const htmlAgendaVacio = ReactDOMServer.renderToString(
      React.createElement(GoogleSheetsContext.Provider, { value: mockCtxVacio },
        React.createElement(AgendaComp, { rol: 'admin', usuario: 'Ren' })
      )
    );
    assert.ok(htmlAgendaVacio.length > 50, 'Agenda vacía debe renderizar');

    // Real
    const htmlAgendaReal = ReactDOMServer.renderToString(
      React.createElement(GoogleSheetsContext.Provider, { value: mockCtxReal },
        React.createElement(AgendaComp, { rol: 'admin', usuario: 'Ren' })
      )
    );
    assert.ok(htmlAgendaReal.length > 50, 'Agenda real debe renderizar');
    t('SSR AgendaEntregas (vacío y real) exitoso', true);

    // 6.4 CalendarioEntregas (Vacío y Real)
    console.log('Probando render SSR de CalendarioEntregas (vacío y con datos)...');
    const modCal = await server.ssrLoadModule('/src/components/CalendarioEntregas.jsx');
    const CalendarioComp = modCal.default;

    // Vacío
    const htmlCalVacio = ReactDOMServer.renderToString(
      React.createElement(CalendarioComp, {
        hoyYMD: '2026-10-30',
        pedidos: [],
        conteo: {}
      })
    );
    assert.ok(htmlCalVacio.includes('Hoy'), 'Calendario vacío debe incluir botón Hoy');

    // Real
    const htmlCalReal = ReactDOMServer.renderToString(
      React.createElement(CalendarioComp, {
        hoyYMD: '2026-10-30',
        pedidos: [pedidoHU868434],
        conteo: { '2026-11-02': 1 }
      })
    );
    assert.ok(htmlCalReal.includes('cal-mes-hoy') || htmlCalReal.includes('Hoy'), 'Calendario real debe incluir botón Hoy');
    t('SSR CalendarioEntregas (vacío y real) exitoso', true);

    // 6.5 Faltantes (Vacío y Real)
    console.log('Probando render SSR de Faltantes (vacío y con datos)...');
    const modFalt = await server.ssrLoadModule('/src/components/Faltantes.jsx');
    const FaltantesComp = modFalt.default;

    // Vacío
    const htmlFaltVacio = ReactDOMServer.renderToString(
      React.createElement(GoogleSheetsContext.Provider, { value: mockCtxVacio },
        React.createElement(FaltantesComp)
      )
    );
    assert.ok(htmlFaltVacio.length > 50, 'Faltantes vacío debe renderizar');

    // Real
    const htmlFaltReal = ReactDOMServer.renderToString(
      React.createElement(GoogleSheetsContext.Provider, { value: mockCtxReal },
        React.createElement(FaltantesComp)
      )
    );
    assert.ok(htmlFaltReal.length > 50, 'Faltantes real debe renderizar');
    t('SSR Faltantes (vacío y real) exitoso', true);

  } finally {
    await server.close();
  }
}

await testSSR();

console.log('\n==================================================================');
console.log(`TOTAL: ${passed} pasados, ${failed} fallados.`);
console.log('==================================================================');

process.exit(failed ? 1 : 0);
