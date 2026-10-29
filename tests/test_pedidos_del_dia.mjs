// Pruebas unitarias de elegibilidad, getHoyYMD, selección por fecha de entrega y prueba real de solo lectura
import fs from 'fs';
import { 
  esPedidoElegibleReparto, 
  esPedidoCancelado, 
  esFormaEntregaOLink, 
  METODOS_PAGO_CONTRA_ENTREGA, 
  resolverEntrega,
  etiquetaMedioPagoDisplay,
  metricasDia 
} from '../src/utils/agendaCalendario.js';
import { getHoyYMD, extraerFechaYMD, TZ_ARGENTINA } from '../src/utils/fechasEntrega.js';
import { turnoDePedido, dowDeYmd } from '../src/utils/entregaCalendario.js';

let ok = 0, fail = 0;
function t(desc, cond, extra) {
  if (cond) {
    ok++;
    console.log("OK   ", desc);
  } else {
    fail++;
    console.error("FALLA", desc, extra ?? "");
  }
}

console.log("==================================================================");
console.log("1. PRUEBAS UNITARIAS: ELEGIBILIDAD DE REPARTO (CONTRA ENTREGA Y MP)");
console.log("==================================================================");

// Efectivo sin forma_pago (como viene de la web)
const pEfectivoSinForma = {
  numero_pedido: "TEST-EFECTIVO",
  metodo_pago: "efectivo",
  forma_pago: "",
  estado_pago: "",
  estado: "pendiente"
};
t("Efectivo con forma_pago vacía es forma entrega/link", esFormaEntregaOLink(pEfectivoSinForma.forma_pago, pEfectivoSinForma.metodo_pago));
t("Efectivo con forma_pago vacía es elegible para reparto", esPedidoElegibleReparto(pEfectivoSinForma));

// Variantes aceptadas: contra_entrega y al_recibir
t("Variante contra_entrega es elegible", esPedidoElegibleReparto({ metodo_pago: "contra_entrega", estado: "pendiente" }));
t("Variante al_recibir es elegible", esPedidoElegibleReparto({ metodo_pago: "al_recibir", estado: "pendiente" }));

// Etiqueta en pantalla nunca dice efectivo
t("En pantalla se muestra 'Pago contra entrega' para efectivo", etiquetaMedioPagoDisplay(pEfectivoSinForma) === "Pago contra entrega");

// Mercadopago pendiente
const pMpPendiente = {
  numero_pedido: "TEST-MP-PENDIENTE",
  metodo_pago: "mercadopago",
  forma_pago: "",
  estado_pago: "pendiente",
  estado: "pendiente"
};
t("Mercadopago pendiente NO es elegible para reparto", !esPedidoElegibleReparto(pMpPendiente));

// Mercadopago aprobado
const pMpAprobado = {
  numero_pedido: "TEST-MP-APROBADO",
  metodo_pago: "mercadopago",
  forma_pago: "",
  estado_pago: "approved",
  estado: "pendiente"
};
t("Mercadopago approved ES elegible para reparto", esPedidoElegibleReparto(pMpAprobado));

const pMpPagado = {
  numero_pedido: "TEST-MP-PAGADO",
  metodo_pago: "mercadopago",
  forma_pago: "",
  estado_pago: "pagado",
  estado: "pendiente"
};
t("Mercadopago pagado ES elegible para reparto", esPedidoElegibleReparto(pMpPagado));

// Cancelado
const pCancelado = {
  numero_pedido: "TEST-CANCELADO",
  metodo_pago: "efectivo",
  forma_pago: "entrega",
  estado: "cancelado"
};
t("Cancelado NO es elegible para reparto normal", !esPedidoElegibleReparto(pCancelado));
t("esPedidoCancelado detecta estado cancelado", esPedidoCancelado(pCancelado));

console.log("\n==================================================================");
console.log("2. PRUEBAS UNITARIAS: getHoyYMD Y ZONA HORARIA ARGENTINA");
console.log("==================================================================");

// 23:30 hora Argentina del 29/10/2026 equivale a 02:30 UTC del 30/10/2026
const instante2330Arg = new Date("2026-10-30T02:30:00.000Z");
t("A las 23:30 en Argentina (02:30 UTC sig.), getHoyYMD devuelve la fecha de Argentina (2026-10-29)",
  getHoyYMD(instante2330Arg) === "2026-10-29"
);
t("extraerFechaYMD con timestamp UTC late night devuelve la fecha argentina correspondiente",
  extraerFechaYMD("2026-10-30T02:30:00.000Z") === "2026-10-29"
);
t("extraerFechaYMD normaliza Date(2026,9,29,2,27,16) a 2026-10-29",
  extraerFechaYMD("Date(2026,9,29,2,27,16)") === "2026-10-29"
);

console.log("\n==================================================================");
console.log("3. PRUEBAS UNITARIAS: SELECCIÓN POR FECHA DE ENTREGA Y SALTO PRÓXIMO");
console.log("==================================================================");

const pEntregaDia = {
  numero_pedido: "P-01",
  dia_entrega: "Viernes 30/10/2026 Tarde",
  metodo_pago: "efectivo",
  estado: "pendiente"
};
const resEntrega = resolverEntrega(pEntregaDia);
t("resolverEntrega extrae fecha YMD de dia_entrega", resEntrega.ymd === "2026-10-30");
t("resolverEntrega detecta turno Tarde", resEntrega.turno === "Tarde");

// Fallback a fecha_entrega si dia_entrega no trae fecha
const pFallbackFechaEntrega = {
  numero_pedido: "P-02",
  dia_entrega: "",
  fecha_entrega: "2026-10-30 14:00",
  horario_entrega: "14 a 17 hs",
  metodo_pago: "efectivo",
  estado: "pendiente"
};
t("Fallback a fecha_entrega cuando dia_entrega está vacío", resolverEntrega(pFallbackFechaEntrega).ymd === "2026-10-30");

// Función de salto a la próxima entrega con pedidos
function buscarProximaEntrega(pedidos, fechaActual) {
  const mapa = new Map();
  pedidos.forEach(p => {
    if (!esPedidoElegibleReparto(p) || esPedidoCancelado(p)) return;
    const f = resolverEntrega(p).ymd;
    if (f && f > fechaActual) {
      if (!mapa.has(f)) mapa.set(f, []);
      mapa.get(f).push(p);
    }
  });
  const fechas = Array.from(mapa.keys()).sort();
  if (!fechas.length) return null;
  const proxYmd = fechas[0];
  return { ymd: proxYmd, pedidos: mapa.get(proxYmd) };
}

const mockPool = [
  { numero_pedido: "A1", dia_entrega: "Viernes 30/10/2026 Tarde", metodo_pago: "efectivo", estado: "pendiente" },
  { numero_pedido: "A2", dia_entrega: "Viernes 30/10/2026 Mañana", metodo_pago: "efectivo", estado: "pendiente" },
  { numero_pedido: "A3", dia_entrega: "Martes 03/11/2026 Tarde", metodo_pago: "efectivo", estado: "pendiente" },
  { numero_pedido: "CANCEL", dia_entrega: "Viernes 30/10/2026 Tarde", metodo_pago: "efectivo", estado: "cancelado" },
  { numero_pedido: "MP_NO_PAGO", dia_entrega: "Viernes 30/10/2026 Tarde", metodo_pago: "mercadopago", estado_pago: "pendiente", estado: "pendiente" },
];

const saltoDesdeHoy = buscarProximaEntrega(mockPool, "2026-10-29");
t("Salto desde 29/10 encuentra 30/10", saltoDesdeHoy && saltoDesdeHoy.ymd === "2026-10-30");
t("Salto cuenta únicamente los 2 pedidos elegibles (excluyendo cancelado y MP pendiente)", saltoDesdeHoy && saltoDesdeHoy.pedidos.length === 2);

console.log("\n==================================================================");
console.log("4. PRUEBA DE SOLO LECTURA CON DATOS REALES DE GOOGLE SHEETS");
console.log("==================================================================");

async function pruebaDatosReales() {
  if (!fs.existsSync('.env')) {
    console.log("No hay .env, omitiendo lectura real");
    return;
  }
  const envText = fs.readFileSync('.env', 'utf8');
  const env = Object.fromEntries(
    envText.split('\n').filter(l => l.includes('=')).map(l => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
  );

  const gvizUrl = `https://docs.google.com/spreadsheets/d/${env.VITE_SHEET_ID}/gviz/tq?tqx=out:json&sheet=Pedidos`;
  const res = await fetch(gvizUrl);
  const text = await res.text();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  const json = JSON.parse(text.substring(start, end + 1));
  const headers = (json.table.cols || []).map(c =>
    String(c.label || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ /g, '_')
  );

  const rawRows = (json.table.rows || []).map(r =>
    (r.c || []).map(cell => (cell ? (cell.v !== null && cell.v !== undefined ? cell.v : cell.f || '') : ''))
  );

  // Mapeo idéntico al de GoogleSheetsContext.jsx actualizado
  const parsedPedidos = rawRows.map((row, index) => {
    const obj = { sheetRowIndex: index + 2 };
    headers.forEach((h, i) => { obj[h] = row[i] || ''; });

    const formaPagoRaw = (obj.forma_pago || '').toLowerCase().trim();
    const metodoPagoRaw = (obj.metodo_pago || obj.medio_pago || obj.medio_cobro || '').toLowerCase().trim();
    const formaPago = formaPagoRaw || (METODOS_PAGO_CONTRA_ENTREGA.includes(metodoPagoRaw) ? 'entrega' : '');

    return {
      numero_pedido: obj.numero_pedido || '',
      fecha: extraerFechaYMD(obj.get_fecha || obj.fecha) || getHoyYMD(),
      nombre: obj.nombre || 'Sin Nombre',
      total: Number(obj.total) || 0,
      estado_pago: obj.estado_pago || 'pendiente',
      forma_pago: formaPago,
      metodo_pago: (obj.metodo_pago || '').toLowerCase().trim(),
      medio_pago: obj.medio_cobro || obj.medio_pago || obj.metodo_pago || '',
      dia_entrega: obj.dia_entrega || '',
      horario_entrega: obj.horario_entrega || '',
      estado: obj.estado || 'pendiente',
      reembolso_estado: (obj.reembolso_estado || '').toLowerCase().trim()
    };
  });

  // Filtrado como PedidosDelDia para 2026-10-30
  const FECHA_PRUEBA = "2026-10-30";
  const pedidosDia30 = parsedPedidos.filter(p => {
    return esPedidoElegibleReparto(p) && !esPedidoCancelado(p) && resolverEntrega(p).ymd === FECHA_PRUEBA;
  });

  const pedidoContraEntrega = pedidosDia30.find(p => p.numero_pedido === "HU-836253");
  t("Dato real: HU-836253 APARECE al elegir 30/10 en Pedidos del día", Boolean(pedidoContraEntrega));
  if (pedidoContraEntrega) {
    t("Dato real: HU-836253 tiene turno Tarde", turnoDePedido(pedidoContraEntrega) === "Tarde");
    t("Dato real: HU-836253 forma_pago resuelta como 'entrega'", pedidoContraEntrega.forma_pago === "entrega");
    t("Dato real: etiqueta de pago para HU-836253 es 'Pago contra entrega'", etiquetaMedioPagoDisplay(pedidoContraEntrega) === "Pago contra entrega");
  }

  // Verificar Calendario para 2026-10-30
  const pedidosActivosCalendario = parsedPedidos.filter(p => esPedidoElegibleReparto(p));
  const metDia30 = metricasDia(pedidosActivosCalendario, FECHA_PRUEBA);
  const estaEnCalendario = (metDia30.pedidosActivos || []).some(p => p.numero_pedido === "HU-836253");
  t("Dato real: HU-836253 APARECE en métricas de tarjeta del día del Calendario (2026-10-30)", estaEnCalendario);
  t("Dato real: métricas del día 30/10 registra turno Tarde >= 1", metDia30.tarde >= 1);

  // Verificar que HU-780105 (mercadopago sin pagar) NO aparece
  const pedidoMpSinPagar = pedidosDia30.find(p => p.numero_pedido === "HU-780105");
  t("Dato real: HU-780105 (mercadopago sin pagar) NO APARECE en Pedidos del día", pedidoMpSinPagar === undefined);
  const mpEnCalendario = (metDia30.pedidosActivos || []).some(p => p.numero_pedido === "HU-780105");
  t("Dato real: HU-780105 (mercadopago sin pagar) NO APARECE en Calendario", !mpEnCalendario);
}

await pruebaDatosReales();

console.log("\n==================================================================");
console.log(`TOTAL RESULTADO: ${ok} ok, ${fail} fallas`);
console.log("==================================================================");
process.exitCode = fail ? 1 : 0;

