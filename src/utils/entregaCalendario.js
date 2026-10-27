// Calendario de entregas Huerta Urbana (v2: dos bloques). Mismo archivo para web y dashboard.
// Bloques: M = Manana 8 a 12, T = Tarde 14 a 17.
// Dias con entrega: lunes solo T; martes a viernes M y T; sabado solo M; domingo nada. Feriados/cerrados: nada.
// Regla: se salta un bloque.
//  - Pedido lun a jue: mismo bloque del dia siguiente (antes de las 12 -> M, desde las 12 -> T).
//  - Pedido viernes: hasta 12 -> viernes T; de 12 a 15 -> sabado M; desde 15 -> lunes T.
//  - Pedido sabado, domingo o dia cerrado: primera Tarde disponible.
//  - Si el bloque que corresponde no existe (feriado, sabado T, lunes M...), pasa al primer bloque disponible que sigue.
export const TZ = "America/Argentina/Buenos_Aires";
export const HORA_CORTE = 12;
export const HORA_CORTE_VIERNES = 15;
export const HORIZONTE_DIAS = 14;
export const BLOQUES = {
  M: { codigo: "M", nombre: "Mañana", desde: 8, hasta: 12 },
  T: { codigo: "T", nombre: "Tarde", desde: 14, hasta: 17 },
};
const DIAS = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];

export function partesAR(instante) {
  const d = instante instanceof Date ? instante : new Date(instante);
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
  const p = {};
  f.formatToParts(d).forEach((x) => { p[x.type] = x.value; });
  const ymd = p.year + "-" + p.month + "-" + p.day;
  return { ymd, h: Number(p.hour), dow: dowDeYmd(ymd) };
}
export function dowDeYmd(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export function sumarDias(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.getUTCFullYear() + "-" + String(t.getUTCMonth() + 1).padStart(2, "0") + "-" + String(t.getUTCDate()).padStart(2, "0");
}
// feriados = lista de fechas ymd CERRADAS (feriados nacionales + no laborables marcados).
export function bloquesDelDia(ymd, feriados) {
  if ((feriados || []).includes(ymd)) return [];
  const dow = dowDeYmd(ymd);
  if (dow === 0) return [];
  if (dow === 1) return ["T"];
  if (dow === 6) return ["M"];
  return ["M", "T"];
}
// Primer bloque existente en o despues de (ymd, bloque), recorriendo la secuencia M,T de cada dia.
function primerDisponibleDesde(ymd, bloque, feriados) {
  let c = ymd;
  let primero = true;
  for (let i = 0; i < 400; i++) {
    const bs = bloquesDelDia(c, feriados);
    for (const b of bs) {
      if (primero && b < bloque) continue; // "M" < "T"
      return { ymd: c, bloque: b };
    }
    primero = false;
    c = sumarDias(c, 1);
  }
  return null;
}
function primeraTardeDesde(ymd, feriados) {
  let c = ymd;
  for (let i = 0; i < 400; i++) {
    if (bloquesDelDia(c, feriados).includes("T")) return { ymd: c, bloque: "T" };
    c = sumarDias(c, 1);
  }
  return null;
}
export function primeraEntrega(instante, feriados) {
  const { ymd, h, dow } = partesAR(instante);
  const cerrado = (feriados || []).includes(ymd);
  if (dow === 0 || dow === 6 || cerrado) return primeraTardeDesde(sumarDias(ymd, 1), feriados);
  if (dow >= 1 && dow <= 4) return primerDisponibleDesde(sumarDias(ymd, 1), h < HORA_CORTE ? "M" : "T", feriados);
  // viernes
  if (h < HORA_CORTE) return primerDisponibleDesde(ymd, "T", feriados);
  if (h < HORA_CORTE_VIERNES) return primerDisponibleDesde(sumarDias(ymd, 1), "M", feriados);
  return primerDisponibleDesde(sumarDias(ymd, 3), "T", feriados);
}
// Todos los bloques elegibles, en orden, desde la primera entrega hasta el horizonte.
export function bloquesDisponibles(instante, feriados, horizonte) {
  const primera = primeraEntrega(instante, feriados);
  if (!primera) return [];
  const limite = sumarDias(partesAR(instante).ymd, horizonte || HORIZONTE_DIAS);
  const out = [];
  for (let c = primera.ymd; c <= limite; c = sumarDias(c, 1)) {
    for (const b of bloquesDelDia(c, feriados)) {
      if (c === primera.ymd && b < primera.bloque) continue;
      out.push({ ymd: c, bloque: b });
    }
  }
  return out;
}
export function validarEntrega(ymd, bloque, instante, feriados, horizonte) {
  return bloquesDisponibles(instante, feriados, horizonte).some((x) => x.ymd === ymd && x.bloque === bloque);
}
// Texto para la columna dia_entrega: "Lunes 09/11/2026 Tarde"
export function formatoDiaEntrega(ymd, bloque) {
  const [y, m, d] = ymd.split("-");
  return DIAS[dowDeYmd(ymd)] + " " + d + "/" + m + "/" + y + " " + BLOQUES[bloque].nombre;
}
// Inverso: { ymd, bloque } ; bloque null si el texto no lo trae. null si no hay fecha (pedidos viejos "Martes").
export function parseDiaEntrega(texto) {
  const s = String(texto || "");
  const mYMD = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  const mDMY = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  let ymd = null;
  if (mYMD) {
    ymd = mYMD[1] + "-" + mYMD[2].padStart(2, "0") + "-" + mYMD[3].padStart(2, "0");
  } else if (mDMY) {
    ymd = mDMY[3] + "-" + mDMY[2].padStart(2, "0") + "-" + mDMY[1].padStart(2, "0");
  } else {
    return null;
  }
  const n = s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const bloque = n.includes("manana") ? "M" : n.includes("tarde") ? "T" : null;
  return { ymd, bloque };
}
export function etiquetaBloque(bloque) {
  const b = BLOQUES[bloque];
  return b.nombre + " (" + b.desde + " a " + b.hasta + " h)";
}
// Para ordenar: "2026-11-03M" < "2026-11-03T"
export function claveOrden(ymd, bloque) { return ymd + (bloque || "M"); }

// Unico helper para determinar el turno de un pedido en todas las vistas (tarjeta, calendario, agenda).
// Devuelve: 'Mañana' | 'Tarde' | 'Sin turno'
export function turnoDePedido(pedido) {
  if (!pedido) return 'Sin turno';

  // (a) bloque dentro de dia_entrega (Mañana/Tarde) si existe
  const diaEntregaStr = String(pedido.dia_entrega || '').trim();
  if (diaEntregaStr) {
    const diaNorm = diaEntregaStr.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (diaNorm.includes('manana')) return 'Mañana';
    if (diaNorm.includes('tarde')) return 'Tarde';
  }

  // (b) si no, interpretar horario_entrega (o turno_entrega):
  const horarioStr = String(pedido.horario_entrega || pedido.turno_entrega || '').trim();
  if (horarioStr) {
    const horNorm = horarioStr.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (horNorm.includes('manana')) return 'Mañana';
    if (horNorm.includes('tarde')) return 'Tarde';

    const match = horNorm.match(/(\d{1,2})(?::(\d{2}))?/);
    if (match) {
      const hora = parseInt(match[1], 10);
      if (!isNaN(hora) && hora >= 0 && hora <= 24) {
        return hora < 12 ? 'Mañana' : 'Tarde';
      }
    }
  }

  // (c) si no se puede interpretar → "Sin turno"
  return 'Sin turno';
}
