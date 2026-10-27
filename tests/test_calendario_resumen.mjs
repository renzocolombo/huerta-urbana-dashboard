// Pruebas unitarias de turnoDePedido, metricasDia y metricasMes
import { turnoDePedido } from '../src/utils/entregaCalendario.js';
import { metricasDia, metricasMes, esPedidoCancelado } from '../src/utils/agendaCalendario.js';

let ok = 0;
let fail = 0;

function t(desc, cond, extra) {
  if (cond) {
    ok++;
    console.log("OK   ", desc);
  } else {
    fail++;
    console.log("FALLA", desc, extra ?? "");
  }
}

console.log("==================================================================");
console.log("PRUEBAS UNITARIAS: turnoDePedido");
console.log("==================================================================");

// 1. Bloque en dia_entrega
t("dia_entrega contiene Tarde -> Tarde", turnoDePedido({ dia_entrega: "Lunes 09/11/2026 Tarde" }) === "Tarde");
t("dia_entrega contiene Mañana -> Mañana", turnoDePedido({ dia_entrega: "Martes 10/11/2026 Mañana" }) === "Mañana");
t("dia_entrega contiene Manana sin tilde -> Mañana", turnoDePedido({ dia_entrega: "Martes 10/11/2026 Manana" }) === "Mañana");
t("dia_entrega tiene prioridad sobre horario_entrega contradictorio",
  turnoDePedido({ dia_entrega: "Martes 10/11/2026 Mañana", horario_entrega: "14 a 18 hs" }) === "Mañana"
);
t("dia_entrega Tarde tiene prioridad sobre horario_entrega de mañana",
  turnoDePedido({ dia_entrega: "Lunes 09/11/2026 Tarde", horario_entrega: "08:00 a 12:00" }) === "Tarde"
);

// 2. Solo horario_entrega
t("solo horario_entrega 'Mañana'", turnoDePedido({ dia_entrega: "Martes", horario_entrega: "Mañana" }) === "Mañana");
t("solo horario_entrega 'manana' minúscula", turnoDePedido({ dia_entrega: "Martes", horario_entrega: "manana" }) === "Mañana");
t("solo horario_entrega 'Tarde'", turnoDePedido({ dia_entrega: "Jueves", horario_entrega: "Tarde" }) === "Tarde");
t("solo horario_entrega 'tarde' minúscula", turnoDePedido({ dia_entrega: "Jueves", horario_entrega: "tarde" }) === "Tarde");
t("solo horario_entrega '08:00 a 12:00' (inicio < 12)", turnoDePedido({ dia_entrega: "Martes", horario_entrega: "08:00 a 12:00" }) === "Mañana");
t("solo horario_entrega '8 a 12 hs' (inicio < 12)", turnoDePedido({ dia_entrega: "Martes", horario_entrega: "8 a 12 hs" }) === "Mañana");
t("solo horario_entrega '09:00 - 13:00' (inicio < 12)", turnoDePedido({ dia_entrega: "", horario_entrega: "09:00 - 13:00" }) === "Mañana");
t("solo horario_entrega '14 a 18' (inicio >= 12)", turnoDePedido({ dia_entrega: "Jueves", horario_entrega: "14 a 18" }) === "Tarde");
t("solo horario_entrega '14 a 18 hs' (ejemplo real Sheet)", turnoDePedido({ dia_entrega: "Jueves", horario_entrega: "14 a 18 hs" }) === "Tarde");
t("solo horario_entrega '12:00 a 16:00' (inicio 12 -> Tarde)", turnoDePedido({ dia_entrega: "", horario_entrega: "12:00 a 16:00" }) === "Tarde");
t("solo horario_entrega '13:30 - 17:30' (inicio 13 -> Tarde)", turnoDePedido({ dia_entrega: "", horario_entrega: "13:30 - 17:30" }) === "Tarde");
t("soporta turno_entrega alternativo si no hay horario_entrega", turnoDePedido({ dia_entrega: "Martes", turno_entrega: "mañana" }) === "Mañana");

// 3. Vacíos y nulos
t("pedido null devuelve 'Sin turno'", turnoDePedido(null) === "Sin turno");
t("pedido undefined devuelve 'Sin turno'", turnoDePedido(undefined) === "Sin turno");
t("objeto vacío devuelve 'Sin turno'", turnoDePedido({}) === "Sin turno");
t("dia_entrega y horario_entrega cadenas vacías", turnoDePedido({ dia_entrega: "", horario_entrega: "" }) === "Sin turno");
t("espacios en blanco devuelve 'Sin turno'", turnoDePedido({ dia_entrega: "   ", horario_entrega: "   " }) === "Sin turno");

// 4. Texto no interpretable
t("texto raro en horario_entrega devuelve 'Sin turno'", turnoDePedido({ dia_entrega: "Martes", horario_entrega: "texto raro" }) === "Sin turno");
t("a convenir devuelve 'Sin turno'", turnoDePedido({ dia_entrega: "Martes", horario_entrega: "a convenir" }) === "Sin turno");
t("consultar cliente devuelve 'Sin turno'", turnoDePedido({ dia_entrega: "", horario_entrega: "consultar cliente" }) === "Sin turno");

console.log("\n==================================================================");
console.log("PRUEBAS UNITARIAS: metricasDia (TARJETA DEL DÍA)");
console.log("==================================================================");

const pedidosPruebaDia = [
  { numero_pedido: "P1", dia_entrega: "2026-11-03", horario_entrega: "8 a 12 hs", estado: "pendiente" },
  { numero_pedido: "P2", dia_entrega: "2026-11-03", horario_entrega: "09:00 - 13:00", estado: "armado" },
  { numero_pedido: "P3", dia_entrega: "2026-11-03", horario_entrega: "14 a 18 hs", estado: "pendiente" },
  { numero_pedido: "P4", dia_entrega: "2026-11-03", horario_entrega: "a convenir", estado: "pendiente" },
  { numero_pedido: "P5", dia_entrega: "2026-11-03", horario_entrega: "14 a 18 hs", estado: "cancelado" },
  { numero_pedido: "P6", dia_entrega: "2026-11-03", horario_entrega: "8 a 12 hs", estado: "no_entregado", motivo_no_entrega: "cliente cancelo pedido" },
  { numero_pedido: "P7", dia_entrega: "2026-11-04", horario_entrega: "8 a 12 hs", estado: "pendiente" }, // Otro día
];

const resDia = metricasDia(pedidosPruebaDia, "2026-11-03");

t("total del día excluye pedidos cancelados", resDia.total === 4);
t("cuántos de Mañana son correctos", resDia.manana === 2);
t("cuántos de Tarde son correctos", resDia.tarde === 1);
t("cuántos Sin turno son correctos", resDia.sinTurno === 1);
t("totales que cierran: manana + tarde + sinTurno === total", resDia.manana + resDia.tarde + resDia.sinTurno === resDia.total);
t("cancelados contados aparte", resDia.cancelados === 2);
t("lista de pedidos activos tiene largo igual a total", resDia.pedidosActivos.length === resDia.total);
t("lista de pedidos cancelados tiene largo igual a cancelados", resDia.pedidosCancelados.length === resDia.cancelados);

// Día sin pedidos
const resDiaVacio = metricasDia(pedidosPruebaDia, "2026-11-10");
t("día vacío total = 0", resDiaVacio.total === 0);
t("día vacío manana = 0", resDiaVacio.manana === 0);
t("día vacío tarde = 0", resDiaVacio.tarde === 0);
t("día vacío sinTurno = 0", resDiaVacio.sinTurno === 0);
t("día vacío cancelados = 0", resDiaVacio.cancelados === 0);
t("día vacío cierra: 0 + 0 + 0 === 0", resDiaVacio.manana + resDiaVacio.tarde + resDiaVacio.sinTurno === resDiaVacio.total);

console.log("\n==================================================================");
console.log("PRUEBAS UNITARIAS: metricasMes (TARJETA DEL MES)");
console.log("==================================================================");

const pedidosPruebaMes = [
  // Mes 10 (Octubre 2026): 3 pedidos
  { numero_pedido: "OCT1", dia_entrega: "2026-10-15", horario_entrega: "8 a 12 hs", estado: "entregado" },
  { numero_pedido: "OCT2", dia_entrega: "2026-10-20", horario_entrega: "14 a 18 hs", estado: "entregado" },
  { numero_pedido: "OCT3", dia_entrega: "2026-10-25", horario_entrega: "14 a 18 hs", estado: "cancelado" },

  // Mes 11 (Noviembre 2026): 6 pedidos
  { numero_pedido: "NOV1", dia_entrega: "2026-11-03", horario_entrega: "8 a 12 hs", estado: "entregado" },
  { numero_pedido: "NOV2", dia_entrega: "2026-11-03", horario_entrega: "09:00 - 13:00", estado: "entregado" },
  { numero_pedido: "NOV3", dia_entrega: "2026-11-05", horario_entrega: "14 a 18 hs", estado: "pendiente" },
  { numero_pedido: "NOV4", dia_entrega: "2026-11-06", horario_entrega: "14 a 18 hs", estado: "armado" },
  { numero_pedido: "NOV5", dia_entrega: "2026-11-10", horario_entrega: "a convenir", estado: "no_entregado" },
  { numero_pedido: "NOV6", dia_entrega: "2026-11-12", horario_entrega: "14 a 18 hs", estado: "cancelado" },
];

const resMesNov = metricasMes(pedidosPruebaMes, 2026, 11);
t("total del mes correcto", resMesNov.total === 6);
t("entregados del mes correcto", resMesNov.entregados === 2);
t("pendientes del mes correcto (pendiente + armado)", resMesNov.pendientes === 2);
t("cancelados/no entregados del mes correcto", resMesNov.canceladosNoEntregados === 2);
t("suma de estados cubre el total del mes", resMesNov.entregados + resMesNov.pendientes + resMesNov.canceladosNoEntregados === resMesNov.total);
t("conteo de Mañana en el mes", resMesNov.manana === 2);
t("conteo de Tarde en el mes", resMesNov.tarde === 3);
t("suma de Mañana y Tarde en el mes", resMesNov.sumaMananaTarde === 5);
t("suma de Mañana y Tarde es exactamente manana + tarde", resMesNov.sumaMananaTarde === resMesNov.manana + resMesNov.tarde);
t("comparación con mes anterior: total mes anterior (Octubre = 3)", resMesNov.totalMesAnterior === 3);
t("comparación con mes anterior: diferencia en cantidad (6 - 3 = +3)", resMesNov.diferenciaMesAnterior === 3);

// Cambio de mes en el calendario: consultar Octubre
const resMesOct = metricasMes(pedidosPruebaMes, 2026, 10);
t("cambio de mes: total Octubre = 3", resMesOct.total === 3);
t("cambio de mes: entregados Octubre = 2", resMesOct.entregados === 2);
t("cambio de mes: cancelados/no entregados Octubre = 1", resMesOct.canceladosNoEntregados === 1);
t("cambio de mes: pendientes Octubre = 0", resMesOct.pendientes === 0);
t("cambio de mes: suma M + T Octubre", resMesOct.sumaMananaTarde === 3);
t("cambio de mes: total Septiembre (anterior sin pedidos) = 0", resMesOct.totalMesAnterior === 0);
t("cambio de mes: diferencia Octubre vs Septiembre = +3", resMesOct.diferenciaMesAnterior === 3);

// Mes vacío: Diciembre 2026
const resMesDic = metricasMes(pedidosPruebaMes, 2026, 12);
t("mes vacío: total = 0 sin errores", resMesDic.total === 0);
t("mes vacío: entregados = 0", resMesDic.entregados === 0);
t("mes vacío: pendientes = 0", resMesDic.pendientes === 0);
t("mes vacío: canceladosNoEntregados = 0", resMesDic.canceladosNoEntregados === 0);
t("mes vacío: sumaMananaTarde = 0", resMesDic.sumaMananaTarde === 0);
t("mes vacío: total mes anterior (Noviembre = 6)", resMesDic.totalMesAnterior === 6);
t("mes vacío: diferencia vs mes anterior (0 - 6 = -6)", resMesDic.diferenciaMesAnterior === -6);

console.log("\n==================================================================");
console.log(`TOTAL RESULTADO: ${ok} ok, ${fail} fallas`);
console.log("==================================================================");

process.exit(fail ? 1 : 0);
