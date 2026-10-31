// Logica pura de la Agenda por fecha/bloque y del Calendario (sin React, testeable con node).
import {
  parseDiaEntrega, bloquesDelDia, primeraEntrega, claveOrden, dowDeYmd, BLOQUES, turnoDePedido,
} from './entregaCalendario.js';
import { calcularFechaEntregaProgramada, fechaA_YMD, parsearFecha, extraerFechaYMD } from './fechasEntrega.js';

export const METODOS_PAGO_CONTRA_ENTREGA = ['efectivo', 'contra_entrega', 'al_recibir'];

export function esFormaPagoContraEntrega(formaPago, metodoPago) {
  const f = (formaPago || '').toLowerCase().trim();
  const m = (metodoPago || '').toLowerCase().trim();
  return f === 'entrega' || METODOS_PAGO_CONTRA_ENTREGA.includes(m) || METODOS_PAGO_CONTRA_ENTREGA.includes(f);
}

export function esFormaEntregaOLink(formaPago, metodoPago) {
  const f = (formaPago || '').toLowerCase().trim();
  if (f === 'link') return true;
  return esFormaPagoContraEntrega(f, metodoPago);
}

export function esPedidoElegibleReparto(p, estadoActualOverride) {
  if (!p) return false;
  const estadoActual = (estadoActualOverride || p.estado || 'pendiente').toLowerCase().trim();
  const tieneReembolsoPendiente = (p.reembolso_estado || '').toLowerCase().trim() === 'pendiente';
  const esEntregado = estadoActual === 'entregado' || estadoActual === 'delivered';
  const esCancelado = estadoActual === 'cancelado' || estadoActual === 'cancelled' ||
    (estadoActual === 'no_entregado' && (p.motivo_no_entrega || p.motivo || '').toLowerCase().includes('cancel'));

  // Si está entregado o cancelado y no tiene reembolso pendiente, no va a reparto
  if ((esEntregado || esCancelado) && !tieneReembolsoPendiente) {
    return false;
  }

  const estadoPago = (p.estado_pago || '').toLowerCase().trim();
  const formaPago = (p.forma_pago || '').toLowerCase().trim();
  const metodoPago = (p.metodo_pago || p.medio_pago || '').toLowerCase().trim();

  const esAprobado = estadoPago === 'approved' || estadoPago === 'pagado';
  const esEntregaOLink = esFormaEntregaOLink(formaPago, metodoPago);

  if (!esAprobado && !esEntregaOLink && !tieneReembolsoPendiente) {
    return false;
  }

  return true;
}

export function etiquetaMedioPagoDisplay(p) {
  if (!p) return '-';
  const forma = (p.forma_pago || '').toLowerCase().trim();
  const medio = (p.metodo_pago || p.medio_pago || '').toLowerCase().trim();
  if (forma === 'entrega' || METODOS_PAGO_CONTRA_ENTREGA.includes(medio) || METODOS_PAGO_CONTRA_ENTREGA.includes(forma)) {
    return 'Pago contra entrega';
  }
  if (forma === 'link' || medio === 'link' || medio === 'link_pago') {
    return 'Link de Pago';
  }
  if (medio === 'mercadopago') {
    return 'Mercado Pago';
  }
  if (medio === 'transferencia') return 'Transferencia';
  if (medio === 'qr') return 'QR';
  if (medio === 'debito') return 'Débito';
  if (medio === 'credito') return 'Crédito';
  return p.medio_pago || p.metodo_pago || p.forma_pago || '-';
}

export const CLAVE_ATRASADOS = 'atrasados';
export const CLAVE_SIN_FECHA = 'sin-fecha';
const DIAS_CORTO = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

function sumarDiasYmd(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.getUTCFullYear() + '-' + String(t.getUTCMonth() + 1).padStart(2, '0') + '-' + String(t.getUTCDate()).padStart(2, '0');
}

// Fecha y bloque de entrega de un pedido. Pedido nuevo: columna dia_entrega con fecha.
// Fallback a fecha_entrega si existe. Pedido viejo ("Martes"/"Jueves"): calculo actual, con bloque interpretado de horario_entrega.
export function resolverEntrega(p) {
  const parsed = parseDiaEntrega(p?.dia_entrega);
  const turno = turnoDePedido(p);
  const bloque = turno === 'Mañana' ? 'M' : turno === 'Tarde' ? 'T' : null;
  if (parsed) return { ymd: parsed.ymd, bloque, turno, conFecha: true };
  const fEntregaYMD = extraerFechaYMD(p?.fecha_entrega);
  if (fEntregaYMD) return { ymd: fEntregaYMD, bloque, turno, conFecha: true };
  const d = calcularFechaEntregaProgramada(p?.fecha, p?.dia_entrega);
  return { ymd: d ? fechaA_YMD(d) : '', bloque, turno, conFecha: false };
}

export function enriquecerPedido(p, hoyYMD) {
  const e = resolverEntrega(p);
  return {
    ...p,
    entregaYMD: e.ymd,
    entregaBloque: e.bloque,
    turnoEntrega: e.turno,
    entregaConFecha: e.conFecha,
    fechaEntregaProgramadaYMD: e.ymd,
    esAtrasado: Boolean(e.ymd && e.ymd < hoyYMD),
  };
}

// Agrupa pedidos enriquecidos: atrasados aparte; resto por fecha ordenada; dentro de cada fecha por bloque.
export function agruparPorFecha(enriquecidos) {
  const atrasados = enriquecidos.filter((p) => p.esAtrasado);
  const resto = enriquecidos.filter((p) => !p.esAtrasado);
  const porFecha = new Map();
  resto.forEach((p) => {
    const k = p.entregaYMD || CLAVE_SIN_FECHA;
    if (!porFecha.has(k)) porFecha.set(k, []);
    porFecha.get(k).push(p);
  });
  const claves = Array.from(porFecha.keys()).sort((a, b) => {
    if (a === CLAVE_SIN_FECHA) return 1;
    if (b === CLAVE_SIN_FECHA) return -1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  atrasados.sort((a, b) => {
    const ka = claveOrden(a.entregaYMD, a.entregaBloque);
    const kb = claveOrden(b.entregaYMD, b.entregaBloque);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  const dias = claves.map((k) => {
    const lista = porFecha.get(k);
    return {
      clave: k,
      ymd: k === CLAVE_SIN_FECHA ? '' : k,
      pedidos: lista,
      porBloque: {
        M: lista.filter((p) => p.entregaBloque === 'M'),
        T: lista.filter((p) => p.entregaBloque === 'T'),
        sin: lista.filter((p) => p.entregaBloque !== 'M' && p.entregaBloque !== 'T'),
      },
    };
  });
  return { atrasados, dias };
}

// "Hoy 27/10", "Mañana 28/10" o "Lun 02/11"
export function etiquetaFecha(ymd, hoyYMD) {
  if (!ymd) return 'Sin fecha';
  const [, m, d] = ymd.split('-');
  const dm = d + '/' + m;
  if (ymd === hoyYMD) return 'Hoy ' + dm;
  if (ymd === sumarDiasYmd(hoyYMD, 1)) return 'Mañana ' + dm;
  return DIAS_CORTO[dowDeYmd(ymd)] + ' ' + dm;
}

// Pestana por defecto: hoy; si no hay, la proxima con pedidos; si no, atrasados; si no, la primera.
export function claveTabInicial(claves, hoyYMD) {
  if (claves.includes(hoyYMD)) return hoyYMD;
  const futuras = claves.filter((k) => k !== CLAVE_ATRASADOS && k !== CLAVE_SIN_FECHA && k > hoyYMD).sort();
  if (futuras.length) return futuras[0];
  if (claves.includes(CLAVE_ATRASADOS)) return CLAVE_ATRASADOS;
  return claves[0] || null;
}

// Instante del pedido (hora Argentina). Si el texto no trae hora, se usa 00:00 (criterio mas permisivo).
export function instantePedido(fechaRaw) {
  const d = parsearFecha(fechaRaw);
  if (!d) return null;
  const ymd = fechaA_YMD(d);
  const mh = String(fechaRaw instanceof Date ? '' : fechaRaw).match(/(?:T|\s)(\d{1,2}):(\d{2})/);
  const hh = mh ? String(Math.min(23, Number(mh[1]))).padStart(2, '0') : '00';
  const mm = mh ? mh[2] : '00';
  return new Date(ymd + 'T' + hh + ':' + mm + ':00-03:00');
}

// Alertas de tarjeta. p debe venir de enriquecerPedido. No bloquean nada.
export function alertasEntrega(p, feriados, hoyYMD, esPendiente) {
  const out = { revisarFecha: false, diaCerrado: false };
  const ymd = p.entregaYMD;
  if (!ymd) return out;
  const fer = feriados || [];

  // 4) Entrega anterior a la primera posible segun la fecha del pedido (solo pedidos con fecha explicita).
  if (p.entregaConFecha) {
    const inst = instantePedido(p.fecha);
    if (inst) {
      // Se ignora el cierre de la propia fecha elegida: si se cerro despues, lo cubre DIA CERRADO.
      const pe = primeraEntrega(inst, fer.filter((f) => f !== ymd));
      if (pe) {
        const k = p.entregaBloque ? claveOrden(ymd, p.entregaBloque) : ymd;
        const kp = p.entregaBloque ? claveOrden(pe.ymd, pe.bloque) : pe.ymd;
        if (k < kp) out.revisarFecha = true;
      }
    }
  }

  // 5) Pendiente programado para un dia cerrado o un bloque inexistente.
  if (esPendiente && ymd >= hoyYMD) {
    const bs = bloquesDelDia(ymd, fer);
    if (bs.length === 0 || (p.entregaBloque && !bs.includes(p.entregaBloque))) out.diaCerrado = true;
  }
  return out;
}

// Cantidad de pedidos programados por fecha: { 'yyyy-mm-dd': n }
export function conteoPorFecha(enriquecidos) {
  const m = {};
  enriquecidos.forEach((p) => { if (p.entregaYMD) m[p.entregaYMD] = (m[p.entregaYMD] || 0) + 1; });
  return m;
}

// ── Calendario mensual ───────────────────────────────────────────────────────
export const ESTADOS_DIA = {
  normal:     { clave: 'normal',     etiqueta: 'Laborable',               desc: 'Entregas manana y tarde (lunes solo tarde)' },
  sabado:     { clave: 'sabado',     etiqueta: 'Solo mañana',             desc: 'Sabado: solo bloque manana' },
  domingo:    { clave: 'domingo',    etiqueta: 'Domingo (cerrado)',       desc: 'Sin entregas' },
  feriado:    { clave: 'feriado',    etiqueta: 'Feriado nacional',        desc: 'Cerrado' },
  abierto:    { clave: 'abierto',    etiqueta: 'No laborable (abierto)',  desc: 'Se trabaja' },
  cerrado:    { clave: 'cerrado',    etiqueta: 'Cerrado manual',          desc: 'Tratado como domingo' },
};

// diasMap: { ymd: { fecha, estado, motivo, origen } }
export function mapaCalendario(dias) {
  const m = {};
  (dias || []).forEach((d) => { if (d && d.fecha) m[d.fecha] = d; });
  return m;
}

export function estadoDelDia(ymd, diasMap) {
  const marca = diasMap?.[ymd];
  const dow = dowDeYmd(ymd);
  if (marca && marca.estado === 'cerrado') return marca.origen === 'nacional' ? 'feriado' : 'cerrado';
  if (marca && marca.estado === 'abierto') return 'abierto';
  if (dow === 0) return 'domingo';
  if (dow === 6) return 'sabado';
  return 'normal';
}

// Acciones disponibles segun estado (dia de hoy o futuro). Devuelve lista de 'cerrar' | 'abrir' | 'normal'.
export function accionesDelDia(ymd, diasMap, hoyYMD) {
  if (ymd < hoyYMD) return [];
  const est = estadoDelDia(ymd, diasMap);
  if (est === 'normal' || est === 'sabado') return ['cerrar'];
  if (est === 'feriado') return ['abrir'];
  if (est === 'cerrado') return ['abrir', 'normal'];
  if (est === 'abierto') return ['cerrar', 'normal'];
  return []; // domingo sin marca: ya esta cerrado
}

// Semanas (lunes a domingo) de un mes: array de filas de 7 celdas ymd o null.
export function semanasDelMes(anio, mes, conVecinos = false) { // mes 1..12
  if (conVecinos) {
    return semanasDelMesConVecinos(anio, mes);
  }
  const primero = anio + '-' + String(mes).padStart(2, '0') + '-01';
  const dias = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const offset = (dowDeYmd(primero) + 6) % 7; // lunes = 0
  const celdas = [];
  for (let i = 0; i < offset; i++) celdas.push(null);
  for (let d = 1; d <= dias; d++) celdas.push(anio + '-' + String(mes).padStart(2, '0') + '-' + String(d).padStart(2, '0'));
  while (celdas.length % 7 !== 0) celdas.push(null);
  const filas = [];
  for (let i = 0; i < celdas.length; i += 7) filas.push(celdas.slice(i, i + 7));
  return filas;
}

export function semanasDelMesConVecinos(anio, mes) {
  const primero = anio + '-' + String(mes).padStart(2, '0') + '-01';
  const dias = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const offset = (dowDeYmd(primero) + 6) % 7; // lunes = 0
  const celdas = [];

  for (let i = offset; i > 0; i--) {
    const dVecino = new Date(Date.UTC(anio, mes - 1, 1 - i));
    const y = dVecino.getUTCFullYear();
    const m = String(dVecino.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dVecino.getUTCDate()).padStart(2, '0');
    celdas.push(`${y}-${m}-${d}`);
  }

  for (let d = 1; d <= dias; d++) {
    celdas.push(anio + '-' + String(mes).padStart(2, '0') + '-' + String(d).padStart(2, '0'));
  }

  let proxD = 1;
  while (celdas.length % 7 !== 0) {
    const dVecino = new Date(Date.UTC(anio, mes, proxD++));
    const y = dVecino.getUTCFullYear();
    const m = String(dVecino.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dVecino.getUTCDate()).padStart(2, '0');
    celdas.push(`${y}-${m}-${d}`);
  }

  const filas = [];
  for (let i = 0; i < celdas.length; i += 7) {
    filas.push(celdas.slice(i, i + 7));
  }
  return filas;
}

export function esPedidoCancelado(p) {
  if (!p) return false;
  const est = String(p.estado || '').toLowerCase().trim();
  if (est === 'cancelado' || est === 'cancelled') return true;
  if (est === 'no_entregado') {
    const motivo = String(p.motivo_no_entrega || p.motivo || '').toLowerCase();
    if (motivo.includes('cancel')) return true;
  }
  return false;
}

export function esPedidoEntregado(p) {
  if (!p) return false;
  const est = String(p.estado || '').toLowerCase().trim();
  return est === 'entregado' || est === 'delivered';
}

export function esPedidoCanceladoONoEntregado(p) {
  if (!p) return false;
  const est = String(p.estado || '').toLowerCase().trim();
  return est === 'cancelado' || est === 'cancelled' || est === 'no_entregado';
}

// Metricas para la Tarjeta del Dia (al tocar un dia del calendario)
export function metricasDia(pedidos, ymd) {
  if (!ymd) {
    return { ymd: '', total: 0, manana: 0, tarde: 0, sinTurno: 0, cancelados: 0, pedidosActivos: [], pedidosCancelados: [] };
  }
  const lista = (pedidos || []).filter((p) => {
    const f = p.entregaYMD || resolverEntrega(p).ymd;
    return f === ymd;
  });

  const cancelados = lista.filter(esPedidoCancelado);
  const activos = lista.filter((p) => !esPedidoCancelado(p));

  let manana = 0;
  let tarde = 0;
  let sinTurno = 0;

  activos.forEach((p) => {
    const t = turnoDePedido(p);
    if (t === 'Mañana') manana++;
    else if (t === 'Tarde') tarde++;
    else sinTurno++;
  });

  return {
    ymd,
    total: activos.length,
    manana,
    tarde,
    sinTurno,
    cancelados: cancelados.length,
    pedidosActivos: activos,
    pedidosCancelados: cancelados,
  };
}

// Metricas para la Tarjeta del Mes (resumen mensual segun anio y mes)
export function metricasMes(pedidos, anio, mes) {
  const anioNum = Number(anio);
  const mesNum = Number(mes);
  const mesPad = String(mesNum).padStart(2, '0');
  const prefix = `${anioNum}-${mesPad}`;

  const prevAnio = mesNum === 1 ? anioNum - 1 : anioNum;
  const prevMes = mesNum === 1 ? 12 : mesNum - 1;
  const prevPrefix = `${prevAnio}-${String(prevMes).padStart(2, '0')}`;

  const delMes = (pedidos || []).filter((p) => {
    const f = p.entregaYMD || resolverEntrega(p).ymd;
    return f && f.startsWith(prefix);
  });

  const delMesAnt = (pedidos || []).filter((p) => {
    const f = p.entregaYMD || resolverEntrega(p).ymd;
    return f && f.startsWith(prevPrefix);
  });

  let entregados = 0;
  let canceladosNoEntregados = 0;
  let pendientes = 0;
  let manana = 0;
  let tarde = 0;
  let sinTurno = 0;

  delMes.forEach((p) => {
    if (esPedidoEntregado(p)) entregados++;
    else if (esPedidoCanceladoONoEntregado(p)) canceladosNoEntregados++;
    else pendientes++;

    const t = turnoDePedido(p);
    if (t === 'Mañana') manana++;
    else if (t === 'Tarde') tarde++;
    else sinTurno++;
  });

  return {
    anio: anioNum,
    mes: mesNum,
    total: delMes.length,
    entregados,
    pendientes,
    canceladosNoEntregados,
    manana,
    tarde,
    sinTurno,
    sumaMananaTarde: manana + tarde,
    totalMesAnterior: delMesAnt.length,
    diferenciaMesAnterior: delMes.length - delMesAnt.length,
  };
}

export { BLOQUES, turnoDePedido };
