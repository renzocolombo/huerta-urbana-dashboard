// ─────────────────────────────────────────────────────────────────────────────
// Registro local único para la economía de los productos de ALMACÉN.
//
// Problema que resuelve: el Sheet (pestaña "Almacen") solo guarda costo_unitario,
// precio_venta y stock_unidades. NO guarda cantidad por lote, margen ni tope manual,
// y tres pantallas distintas (Panel de Costos, Control de Stock y Publicar) escribían
// la misma fila con criterios diferentes. Al recargar desde el Sheet los valores
// cargados por el usuario se perdían o se mezclaban.
//
// Ahora existe UN solo registro por producto (huerta_stock_units_cache_v1, el mismo
// que ya usan ControlStock y AgendaEntregas para el stock) y todas las pantallas lo
// leen y lo escriben con las mismas reglas.
//
// Convención del Sheet (columna "costo_unitario"): COSTO POR UNIDAD
//   costo_unitario = costoTotal del lote / cantidad del lote
// ─────────────────────────────────────────────────────────────────────────────

export const ALM_CACHE_KEY = 'huerta_stock_units_cache_v1';

export const normNombre = (s) =>
  (s || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function leerCacheAlmacen() {
  try {
    return JSON.parse(localStorage.getItem(ALM_CACHE_KEY) || '{}') || {};
  } catch (e) {
    return {};
  }
}

// Mezcla (no pisa) los campos nuevos sobre lo que ya había guardado.
export function guardarCacheAlmacen(nombre, patch) {
  if (!nombre || !String(nombre).trim()) return;
  try {
    const cache = leerCacheAlmacen();
    const k = normNombre(nombre);
    cache[k] = { ...(cache[k] || {}), ...patch };
    localStorage.setItem(ALM_CACHE_KEY, JSON.stringify(cache));
  } catch (e) { /* storage lleno o bloqueado: no romper la UI */ }
}

// Misma regla de precio que el Panel de Costos (costo/unidad + margen, con tope manual).
export function calcularPrecioAlmacen({ precioCajon, cantidadCajon, margen, precioMaxManual }) {
  const cantidad = Math.max(1, Number(cantidadCajon) || 1);
  const costoUnitario = (Number(precioCajon) || 0) / cantidad;
  const m = Number(margen);
  let precio = costoUnitario * (1 + (Number.isFinite(m) && m >= 0 ? m : 60) / 100);
  const tope = Number(precioMaxManual);
  if (tope > 0 && precio > tope) precio = tope;
  return { costoUnitario, precioFinal: Math.floor(precio) };
}

// Aplica el registro local sobre un producto de Almacén ya armado (muta y devuelve p).
// costoUnitSheet: costo por unidad leído del Sheet (si se leyó de ahí).
export function aplicarCacheAProducto(p, c, costoUnitSheet = 0) {
  const cantSheetBase = Number(p.cantidadCajon) > 0 ? Number(p.cantidadCajon) : 1;
  if (!c) {
    if (costoUnitSheet > 0 && !(Number(p.precioCajon) > 0)) p.precioCajon = costoUnitSheet * cantSheetBase;
    return p;
  }
  const cant = Number(c.cantidad);
  if (cant > 0) p.cantidadCajon = cant;
  const cantidad = Number(p.cantidadCajon) > 0 ? Number(p.cantidadCajon) : 1;

  const costoTotal = Number(c.costoTotal);
  if (costoTotal > 0) {
    p.precioCajon = costoTotal;
  } else if (costoUnitSheet > 0) {
    p.precioCajon = costoUnitSheet * cantidad;
  } else if (Number(c.costoUnitario) > 0 && !(Number(p.precioCajon) > 0)) {
    p.precioCajon = Number(c.costoUnitario) * cantidad;
  }

  if (c.stock !== undefined && c.stock !== null) p.stock_unidades = Number(c.stock) || 0;
  if (Number(c.margen) > 0) p.margen = Number(c.margen);
  if (Number(c.precioMaxManual) > 0) p.precioMaxManual = Number(c.precioMaxManual);
  else if (c.precioMaxManual === null) p.precioMaxManual = null;
  return p;
}

// Re-aplica el registro local a una lista completa (productos de Almacén únicamente).
export function refrescarAlmacenDesdeCache(lista) {
  const cache = leerCacheAlmacen();
  return (lista || []).map((p) => {
    if (p?.categoriaPrincipal !== 'Almacén') return p;
    const c = cache[normNombre(p.nombre)];
    return c ? aplicarCacheAProducto({ ...p }, c, 0) : p;
  });
}

// Guarda en el registro local lo que el usuario tiene en pantalla para un producto de Almacén.
export function persistirEconomiaAlmacen(p) {
  if (!p || p.categoriaPrincipal !== 'Almacén' || !p.nombre) return;
  const stock = Number(p.stock_unidades) || 0;
  const prev = leerCacheAlmacen()[normNombre(p.nombre)] || {};
  const { costoUnitario } = calcularPrecioAlmacen(p);
  guardarCacheAlmacen(p.nombre, {
    stock,
    originalLoad: Math.max(Number(prev.originalLoad) || 0, stock),
    subcategoria: p.subcategoria || prev.subcategoria,
    marca: p.marca ?? prev.marca,
    costoTotal: Number(p.precioCajon) || 0,
    cantidad: Math.max(1, Number(p.cantidadCajon) || 1),
    costoUnitario,
    margen: Number(p.margen) > 0 ? Number(p.margen) : 60,
    precioMaxManual: Number(p.precioMaxManual) > 0 ? Number(p.precioMaxManual) : null,
    fila: p.fila ?? prev.fila
  });
}

// Payload ÚNICO para escribir una fila de la pestaña Almacen.
export function armarPayloadAlmacen(p, fila) {
  const { costoUnitario, precioFinal } = calcularPrecioAlmacen(p);
  return {
    accion: 'updateAlmacen',
    action: 'updateAlmacen',
    sheetName: 'Almacen',
    sheet: 'Almacen',
    fila,
    nombre: p.nombre,
    marca: p.marca || '',
    categoria: 'Almacén',
    subcategoria: p.subcategoria || 'Almacén',
    codigo_ean: p.ean || '',
    costo_unitario: Math.round(costoUnitario * 100) / 100,
    precio_venta: precioFinal,
    stock_unidades: Number(p.stock_unidades) || 0,
    fila_val: fila
  };
}

// Huella de lo último enviado con éxito al Sheet (para saber qué falta publicar).
export function firmaPayloadAlmacen(pl) {
  return JSON.stringify([
    pl.nombre, pl.subcategoria, pl.marca || '',
    Number(pl.costo_unitario) || 0, Number(pl.precio_venta) || 0, Number(pl.stock_unidades) || 0
  ]);
}

// POST al Apps Script verificando de verdad la respuesta (antes se ignoraba).
export async function postAppsScript(url, payload, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let json = null;
    try { json = await res.json(); } catch (e) { /* respuesta no JSON: se acepta por status */ }
    if (json && json.success === false) throw new Error(json.error || 'El Apps Script rechazó el guardado');
    return json;
  } finally {
    clearTimeout(t);
  }
}

// Ediciones hechas en pantalla que todavía no llegaron al Sheet. Evita que una recarga
// asincrónica desde el Sheet pise lo que el usuario acaba de tipear.
const _pendientes = {};
export function marcarPendiente(nombre, campo, valor) {
  const k = normNombre(nombre);
  _pendientes[k] = { ...(_pendientes[k] || {}), [campo]: valor };
}
export function limpiarPendiente(nombre) {
  delete _pendientes[normNombre(nombre)];
}
export function aplicarPendientes(lista) {
  (lista || []).forEach((p) => {
    const pend = _pendientes[normNombre(p?.nombre)];
    if (pend) Object.assign(p, pend);
  });
  return lista;
}
