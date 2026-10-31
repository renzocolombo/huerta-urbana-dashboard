// Helpers de fechas de entrega (movidos tal cual desde AgendaEntregas.jsx para poder probarlos sin React).
// La logica es identica a la que estaba en el componente; AgendaEntregas los reexporta.

export function parsearFecha(raw) {
  if (!raw) return null;
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw;
  const s = String(raw).trim();
  const mDate = s.match(/Date\((\d+),(\d+),(\d+)/);
  if (mDate) return new Date(parseInt(mDate[1], 10), parseInt(mDate[2], 10), parseInt(mDate[3], 10));
  const mDMY = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mDMY) return new Date(parseInt(mDMY[3], 10), parseInt(mDMY[2], 10) - 1, parseInt(mDMY[1], 10));
  const mYMD = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (mYMD) return new Date(parseInt(mYMD[1], 10), parseInt(mYMD[2], 10) - 1, parseInt(mYMD[3], 10));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function fechaA_YMD(d) {
  if (!d || isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

export function calcularFechaEntregaProgramada(fechaPedidoRaw, diaEntregaNombre) {
  const dPedido = parsearFecha(fechaPedidoRaw);
  if (!dPedido) return null;

  const diaNorm = (diaEntregaNombre || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const DIAS_MAP = {
    'domingo': 0,
    'lunes': 1,
    'martes': 2,
    'miercoles': 3,
    'jueves': 4,
    'viernes': 5,
    'sabado': 6
  };

  const targetDay = DIAS_MAP[diaNorm];
  if (targetDay === undefined) {
    return new Date(dPedido.getFullYear(), dPedido.getMonth(), dPedido.getDate());
  }

  const orderDay = dPedido.getDay();
  let diff = targetDay - orderDay;
  if (diff < 0) {
    diff += 7;
  }
  const dEntrega = new Date(dPedido.getFullYear(), dPedido.getMonth(), dPedido.getDate());
  dEntrega.setDate(dEntrega.getDate() + diff);
  return dEntrega;
}

export const TZ_ARGENTINA = 'America/Argentina/Buenos_Aires';

export function getHoyYMD(instante = new Date()) {
  const d = instante instanceof Date ? instante : new Date(instante);
  if (isNaN(d.getTime())) return '';
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_ARGENTINA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(d);
}

export function extraerFechaYMD(fechaStr) {
  if (!fechaStr) return '';
  if (fechaStr instanceof Date) {
    return isNaN(fechaStr.getTime()) ? '' : getHoyYMD(fechaStr);
  }
  if (typeof fechaStr === 'string') {
    const s = fechaStr.trim();
    // Google Sheets format: Date(YYYY, M-1, D, ...)
    const mDate = s.match(/Date\((\d+),(\d+),(\d+)/);
    if (mDate) {
      const y = mDate[1];
      const m = String(parseInt(mDate[2], 10) + 1).padStart(2, '0');
      const d = String(parseInt(mDate[3], 10)).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    // Si viene en formato ISO con hora / timezone (ej. 2026-10-30T02:30:00Z)
    if (s.includes('T') || s.includes('Z')) {
      const d = new Date(s);
      if (!isNaN(d.getTime())) return getHoyYMD(d);
    }
    // YYYY-MM-DD
    const mYMD = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (mYMD) {
      return `${mYMD[1]}-${mYMD[2].padStart(2, '0')}-${mYMD[3].padStart(2, '0')}`;
    }
    // DD/MM/YYYY
    const mDMY = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (mDMY) {
      return `${mDMY[3]}-${mDMY[2].padStart(2, '0')}-${mDMY[1].padStart(2, '0')}`;
    }
  }
  const d = parsearFecha(fechaStr);
  return d ? fechaA_YMD(d) : '';
}

export function esFechaInterpretable(raw) {
  return parsearFecha(raw) !== null;
}

export function obtenerFechaCierreEfectiva(p, estadoActual) {
  const est = (estadoActual || p?.estado || '').toLowerCase().trim();
  const esCancelado = est === 'cancelado' || est === 'cancelled' || est.includes('cancel');
  const candidatos = esCancelado
    ? [p?.fecha_cierre, p?.fecha_entrega, p?.fecha_cobro]
    : [p?.fecha_entrega, p?.fecha_cierre, p?.fecha_cobro];

  for (const c of candidatos) {
    if (c && parsearFecha(c) !== null) {
      return c;
    }
  }
  return '';
}

/**
 * Extrae la fecha de ingreso (YMD) de un pedido sin corrimiento por UTC.
 * Para formatos locales ("2026-10-30 23:30:00", "30/10/2026", "Date(...)") se extraen
 * directamente los componentes de la fecha. Si viene en ISO con 'Z' UTC, se formatea
 * en zona America/Argentina/Buenos_Aires.
 */
export function extraerFechaIngresoYMD(fechaRaw) {
  if (!fechaRaw) return '';
  if (fechaRaw instanceof Date) {
    return isNaN(fechaRaw.getTime()) ? '' : getHoyYMD(fechaRaw);
  }
  if (typeof fechaRaw === 'string') {
    const s = fechaRaw.trim();
    // Google Sheets format: Date(YYYY, M-1, D, ...)
    const mDate = s.match(/Date\((\d+),(\d+),(\d+)/);
    if (mDate) {
      const y = mDate[1];
      const m = String(parseInt(mDate[2], 10) + 1).padStart(2, '0');
      const d = String(parseInt(mDate[3], 10)).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    // Si viene con 'Z' explícito (UTC ISO string)
    if (s.endsWith('Z') || s.includes('Z')) {
      const d = new Date(s);
      if (!isNaN(d.getTime())) return getHoyYMD(d);
    }
    // YYYY-MM-DD (con o sin hora posterior ej. "2026-10-30 23:30:00" o "2026-10-30T23:30:00")
    const mYMD = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (mYMD) {
      return `${mYMD[1]}-${mYMD[2].padStart(2, '0')}-${mYMD[3].padStart(2, '0')}`;
    }
    // DD/MM/YYYY
    const mDMY = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (mDMY) {
      return `${mDMY[3]}-${mDMY[2].padStart(2, '0')}-${mDMY[1].padStart(2, '0')}`;
    }
  }
  return extraerFechaYMD(fechaRaw);
}

/**
 * Extrae la hora de ingreso formateada en "HH:mm" (ej: "23:30").
 */
export function extraerHoraIngreso(fechaRaw) {
  if (!fechaRaw) return '';
  if (fechaRaw instanceof Date) {
    if (isNaN(fechaRaw.getTime())) return '';
    const formatter = new Intl.DateTimeFormat('es-AR', {
      timeZone: TZ_ARGENTINA,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    return formatter.format(fechaRaw);
  }
  if (typeof fechaRaw === 'string') {
    const s = fechaRaw.trim();
    // Date(YYYY, M, D, H, m, s)
    const mDate = s.match(/Date\(\d+,\s*\d+,\s*\d+,\s*(\d+),\s*(\d+)/);
    if (mDate) {
      return `${mDate[1].padStart(2, '0')}:${mDate[2].padStart(2, '0')}`;
    }
    // Si tiene hora explicita HH:mm:ss o HH:mm
    const mHora = s.match(/(?:T|\s)(\d{1,2}):(\d{2})/);
    if (mHora) {
      // Si termina en Z, convertir por timezone
      if (s.endsWith('Z')) {
        const d = new Date(s);
        if (!isNaN(d.getTime())) {
          return new Intl.DateTimeFormat('es-AR', {
            timeZone: TZ_ARGENTINA,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }).format(d);
        }
      }
      return `${mHora[1].padStart(2, '0')}:${mHora[2]}`;
    }
  }
  const d = parsearFecha(fechaRaw);
  if (d && !isNaN(d.getTime())) {
    return new Intl.DateTimeFormat('es-AR', {
      timeZone: TZ_ARGENTINA,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(d);
  }
  return '';
}
