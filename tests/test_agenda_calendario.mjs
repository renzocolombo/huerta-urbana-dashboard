import * as A from "../src/utils/agendaCalendario.js";
let ok = 0, fail = 0;
function t(n, real, esp) { const a = JSON.stringify(real), b = JSON.stringify(esp); if (a === b) ok++; else { fail++; console.log("FALLA", n, a, "esperado", b); } }

const HOY = "2026-11-03"; // martes
const mk = (id, dia_entrega, fecha) => ({ numero_pedido: id, dia_entrega, fecha });
const pedidos = [
  mk("A", "Lunes 09/11/2026 Tarde", "2026-11-06 16:00:00"),
  mk("B", "Martes 03/11/2026 Mañana", "2026-11-02 10:00:00"),
  mk("C", "Martes", "2026-10-27"),
  mk("D", "Jueves", "2026-11-03"),
  mk("E", "", "2026-11-03"),
  mk("F", "Martes 03/11/2026 Tarde", "2026-11-02 15:00:00"),
  mk("G", "Lunes 02/11/2026 Tarde", "2026-10-30 09:00:00"), // pasado -> atrasado con fecha real
];
const enr = pedidos.map((p) => A.enriquecerPedido(p, HOY));
const by = Object.fromEntries(enr.map((p) => [p.numero_pedido, p]));

// resolver
t("A fecha/bloque", [by.A.entregaYMD, by.A.entregaBloque], ["2026-11-09", "T"]);
t("B fecha/bloque", [by.B.entregaYMD, by.B.entregaBloque], ["2026-11-03", "M"]);
t("C viejo sin bloque", [by.C.entregaYMD, by.C.entregaBloque], ["2026-10-27", null]);
t("D viejo jueves", [by.D.entregaYMD, by.D.entregaBloque], ["2026-11-05", null]);
t("E sin dia -> fecha pedido", [by.E.entregaYMD, by.E.entregaBloque], ["2026-11-03", null]);

// atrasados
t("C atrasado", by.C.esAtrasado, true);
t("G atrasado (fecha real)", by.G.esAtrasado, true);
t("B no atrasado", by.B.esAtrasado, false);

// agrupamiento y orden
const g = A.agruparPorFecha(enr);
t("atrasados orden", g.atrasados.map((p) => p.numero_pedido), ["C", "G"]);
t("fechas ordenadas", g.dias.map((d) => d.ymd), ["2026-11-03", "2026-11-05", "2026-11-09"]);
const hoyDia = g.dias[0];
t("hoy M", hoyDia.porBloque.M.map((p) => p.numero_pedido), ["B"]);
t("hoy T", hoyDia.porBloque.T.map((p) => p.numero_pedido), ["F"]);
t("hoy sin horario", hoyDia.porBloque.sin.map((p) => p.numero_pedido), ["E"]);
t("jueves sin horario", g.dias[1].porBloque.sin.map((p) => p.numero_pedido), ["D"]);
t("lunes T", g.dias[2].porBloque.T.map((p) => p.numero_pedido), ["A"]);

// etiquetas y pestana inicial
t("etiqueta hoy", A.etiquetaFecha("2026-11-03", HOY), "Hoy 03/11");
t("etiqueta manana", A.etiquetaFecha("2026-11-04", HOY), "Mañana 04/11");
t("etiqueta lun", A.etiquetaFecha("2026-11-09", HOY), "Lun 09/11");
t("etiqueta fin de mes", A.etiquetaFecha("2026-12-01", "2026-11-30"), "Mañana 01/12");
t("tab inicial hoy", A.claveTabInicial(["atrasados", "2026-11-03", "2026-11-05"], HOY), "2026-11-03");
t("tab inicial proxima", A.claveTabInicial(["atrasados", "2026-11-05", "2026-11-09"], HOY), "2026-11-05");
t("tab inicial solo atrasados", A.claveTabInicial(["atrasados"], HOY), "atrasados");

// REVISAR FECHA
const al = (p, fer, pend = true) => A.alertasEntrega(p, fer, HOY, pend);
t("B ok no revisar", al(by.B, []).revisarFecha, false);
t("A ok no revisar", al(by.A, []).revisarFecha, false);
const manip = A.enriquecerPedido(mk("M", "Martes 03/11/2026 Mañana", "2026-11-03 10:00:00"), HOY); // pedido martes 10h -> primera = miercoles M
t("martes M con pedido martes 10h -> revisar", al(manip, []).revisarFecha, true);
const manip2 = A.enriquecerPedido(mk("M2", "Viernes 06/11/2026 Mañana", "2026-11-06 09:00:00"), HOY); // viernes 9h -> primera = viernes T
t("viernes M con pedido viernes 9h -> revisar", al(manip2, []).revisarFecha, true);
t("viejo nunca revisar", al(by.D, []).revisarFecha, false);
t("pedido en dia cerrado luego no marca revisar", al(by.B, ["2026-11-03"]).revisarFecha, false);

// DIA CERRADO
t("A con lunes cerrado", al(by.A, ["2026-11-09"]).diaCerrado, true);
t("A con lunes cerrado no pendiente", al(by.A, ["2026-11-09"], false).diaCerrado, false);
t("A sin cierre", al(by.A, []).diaCerrado, false);
const sabT = A.enriquecerPedido(mk("S", "Sabado 07/11/2026 Tarde", "2026-11-03 09:00:00"), HOY);
t("sabado tarde no existe", al(sabT, []).diaCerrado, true);
const lunM = A.enriquecerPedido(mk("L", "Lunes 09/11/2026 Mañana", "2026-11-03 09:00:00"), HOY);
t("lunes mañana no existe", al(lunM, []).diaCerrado, true);
t("viejo jueves en dia cerrado", al(by.D, ["2026-11-05"]).diaCerrado, true);
t("atrasado pasado no marca cerrado", al(by.G, ["2026-11-02"]).diaCerrado, false);

// conteo
t("conteo", A.conteoPorFecha(enr)["2026-11-03"], 3);

// calendario
const dias = [
  { fecha: "2026-11-23", estado: "cerrado", motivo: "Soberania", origen: "nacional" },
  { fecha: "2026-11-24", estado: "abierto", motivo: "Puente", origen: "manual" },
  { fecha: "2026-11-25", estado: "cerrado", motivo: "Obras", origen: "manual" },
];
const mp = A.mapaCalendario(dias);
t("estado feriado", A.estadoDelDia("2026-11-23", mp), "feriado");
t("estado abierto", A.estadoDelDia("2026-11-24", mp), "abierto");
t("estado cerrado manual", A.estadoDelDia("2026-11-25", mp), "cerrado");
t("estado sabado", A.estadoDelDia("2026-11-07", mp), "sabado");
t("estado domingo", A.estadoDelDia("2026-11-08", mp), "domingo");
t("estado normal", A.estadoDelDia("2026-11-04", mp), "normal");
t("acciones normal", A.accionesDelDia("2026-11-04", mp, HOY), ["cerrar"]);
t("acciones feriado", A.accionesDelDia("2026-11-23", mp, HOY), ["abrir"]);
t("acciones abierto", A.accionesDelDia("2026-11-24", mp, HOY), ["cerrar", "normal"]);
t("acciones cerrado manual", A.accionesDelDia("2026-11-25", mp, HOY), ["abrir", "normal"]);
t("acciones domingo", A.accionesDelDia("2026-11-08", mp, HOY), []);
t("acciones pasado", A.accionesDelDia("2026-11-02", mp, HOY), []);
t("acciones hoy", A.accionesDelDia(HOY, mp, HOY), ["cerrar"]);
const sem = A.semanasDelMes(2026, 11); // 1 nov 2026 = domingo
t("semanas: primera fila", sem[0], [null, null, null, null, null, null, "2026-11-01"]);
t("semanas: filas", sem.length, 6);
t("semanas: ultimo dia", sem[sem.length - 1].filter(Boolean).pop(), "2026-11-30");
t("semanas: largos", sem.every((f) => f.length === 7), true);
t("semanas feb 2027 (lun 1)", A.semanasDelMes(2027, 2)[0][0], "2027-02-01");

console.log(ok + " ok, " + fail + " fallas");
process.exit(fail ? 1 : 0);
