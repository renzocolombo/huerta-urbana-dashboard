import { APPS_SCRIPT_URL } from './appsScriptUrl.js';

/**
 * Cliente de llamadas al Apps Script para Productos, Compras, Salidas y Hogar.
 * Envía POST JSON con { accion, ...params } contra el endpoint activo.
 */
export async function llamarAppsScript(accion, params = {}, timeoutMs = 20000) {
  if (!APPS_SCRIPT_URL) {
    return { ok: false, error: 'APPS_SCRIPT_URL no está configurada en la aplicación.' };
  }

  const payload = {
    accion,
    action: accion, // Compatibilidad con ambos nombres de clave
    ...params,
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, // text/plain evita preflight OPTIONS que falla en Apps Script
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      return { ok: false, error: `Error del servidor: HTTP ${res.status} ${res.statusText}` };
    }

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: `Respuesta no válida del Apps Script: ${text.slice(0, 120)}` };
    }

    if (data && (data.ok === false || data.success === false)) {
      return { ok: false, error: data.error || 'Error reportado por el Apps Script', ...data };
    }

    return { ok: true, ...data };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { ok: false, error: 'Tiempo de espera agotado al conectar con Google Sheets (timeout)' };
    }
    return { ok: false, error: err.message || 'Error de red al conectar con Google Sheets' };
  } finally {
    clearTimeout(timer);
  }
}

// ── 1. PRODUCTOS & CONFIG ──────────────────────────────────────────────────

export async function apiGetStockKg(producto = null) {
  return llamarAppsScript('getStockKg', producto ? { producto } : {});
}
export const apiGetStock = apiGetStockKg;

export async function apiGetPreciosSugeridos() {
  return llamarAppsScript('getPreciosSugeridos');
}

export async function apiCrearProducto({ producto, categoria, unidad = 'kg', margen_pct, marca, subcategoria, ean }) {
  return llamarAppsScript('crearProducto', {
    producto: String(producto).trim(),
    categoria: categoria ? String(categoria).trim() : 'Verduras',
    unidad: (unidad === 'un' || unidad === 'atado') ? unidad : 'kg',
    ...(margen_pct !== undefined && margen_pct !== null ? { margen_pct: Number(margen_pct) } : {}),
    ...(marca ? { marca: String(marca).trim() } : {}),
    ...(subcategoria ? { subcategoria: String(subcategoria).trim() } : {}),
    ...(ean ? { ean: String(ean).trim() } : {}),
  });
}

export async function apiSetMargen(producto, margen_pct) {
  return llamarAppsScript('setMargen', {
    producto: String(producto).trim(),
    margen_pct: Number(margen_pct),
  });
}

export async function apiPublicarPrecios(payload) {
  // Asegura: origen: 'mercaderia', enviando nombre, precio y disponible por producto.
  // Preserva campos adicionales si el flujo completo los incluye (categoria, unidad, activo, combos, etc.)
  const rawProductos = Array.isArray(payload) ? payload : (payload?.productos || []);
  const productos = rawProductos.map(p => {
    const item = {
      nombre: p.nombre || p.producto,
      precio: Number(p.precio) || 0,
      disponible: p.disponible !== false,
    };
    if (p.categoria !== undefined) item.categoria = p.categoria;
    if (p.unidad !== undefined) item.unidad = p.unidad;
    if (p.activo !== undefined) item.activo = p.activo;
    if (p.subcategoria !== undefined) item.subcategoria = p.subcategoria;
    if (p.marca !== undefined) item.marca = p.marca;
    return item;
  });

  const params = {
    origen: 'mercaderia',
    productos,
  };

  if (!Array.isArray(payload) && payload) {
    if (payload.monto_minimo !== undefined && payload.monto_minimo !== null) {
      params.monto_minimo = Math.round(Number(payload.monto_minimo));
    }
    if (payload.mensaje_minimo !== undefined && payload.mensaje_minimo !== null) {
      params.mensaje_minimo = String(payload.mensaje_minimo);
    }
    if (Array.isArray(payload.combos)) {
      params.combos = payload.combos;
    }
    if (payload.origen) {
      params.origen = payload.origen;
    }
  }

  return llamarAppsScript('publicarPrecios', params);
}

export async function apiGetPreciosWeb() {
  return llamarAppsScript('getPreciosWeb');
}

export async function apiGetConfig() {
  return llamarAppsScript('getConfig');
}

export async function apiSetConfig(clave, valor) {
  return llamarAppsScript('setConfig', { clave, valor });
}

// ── 2. COMPRAS / INGRESOS ──────────────────────────────────────────────────

export async function apiCrearIngreso({ 
  producto, proveedor, proveedor_tel, kg_netos, costo_total, 
  cajones, categoria, unidad 
}) {
  return llamarAppsScript('crearIngreso', {
    producto: String(producto).trim(),
    proveedor: proveedor ? String(proveedor).trim() : 'Sin especificar',
    ...(proveedor_tel ? { proveedor_tel: String(proveedor_tel).trim() } : {}),
    kg_netos: Number(kg_netos),
    costo_total: Number(costo_total),
    ...(Array.isArray(cajones) && cajones.length > 0 ? { cajones } : {}),
    ...(categoria ? { categoria: String(categoria).trim() } : {}),
    ...(unidad ? { unidad: String(unidad).trim() } : {}),
  });
}

export async function apiGetIngresos(producto = null, limite = 100) {
  return llamarAppsScript('getIngresos', {
    ...(producto ? { producto } : {}),
    ...(limite ? { limite } : {}),
  });
}

export async function apiGetProveedores() {
  return llamarAppsScript('getProveedores');
}

// ── 3. SALIDAS (MERMA, AJUSTE, CASA) ───────────────────────────────────────

/**
 * Registra una o más salidas de stock en el Sheet.
 * @param {Object} params
 * @param {'MERMA'|'AJUSTE'|'CASA'} params.tipo
 * @param {Array<{producto: string, kg: number}>} params.items
 * @param {string} [params.nota]
 * @param {string} [params.admin_pin] Requerido para MERMA y AJUSTE
 * @param {string} [params.pin] Requerido para CASA
 */
export async function apiRegistrarSalidas({ tipo, items, nota, admin_pin, pin }) {
  const payload = {
    tipo,
    items: (items || []).map(it => ({
      producto: String(it.producto).trim(),
      kg: Number(it.kg),
    })),
    ...(nota ? { nota: String(nota).trim() } : {}),
    ...(admin_pin ? { admin_pin: String(admin_pin).trim() } : {}),
    ...(pin ? { pin: String(pin).trim() } : {}),
  };
  return llamarAppsScript('registrarSalidas', payload);
}

export async function apiGetMovimientos({ producto = null, tipo = null, limite = 100 } = {}) {
  return llamarAppsScript('getMovimientos', {
    ...(producto ? { producto } : {}),
    ...(tipo ? { tipo } : {}),
    ...(limite ? { limite } : {}),
  });
}

// ── 4. HOGAR (FAMILIA & ADMINISTRACIÓN) ─────────────────────────────────────

export async function apiGetHogar() {
  return llamarAppsScript('getHogar');
}

export async function apiVerificarHogarPin(pin) {
  return llamarAppsScript('verificarHogarPin', {
    pin: String(pin).trim(),
  });
}

export async function apiHogarCargar({ monto, modo = 'sumar', nota = '', admin_pin }) {
  return llamarAppsScript('hogarCargar', {
    monto: Number(monto),
    modo: (modo === 'reemplazar') ? 'reemplazar' : 'sumar',
    nota: String(nota || '').trim(),
    admin_pin: String(admin_pin).trim(),
  });
}

export async function apiSetHogarPin({ pin_nuevo, admin_pin }) {
  return llamarAppsScript('setHogarPin', {
    pin_nuevo: String(pin_nuevo).trim(),
    admin_pin: String(admin_pin).trim(),
  });
}

export async function apiSetAdminPin({ pin_nuevo, pin_actual }) {
  return llamarAppsScript('setAdminPin', {
    pin_nuevo: String(pin_nuevo).trim(),
    ...(pin_actual ? { pin_actual: String(pin_actual).trim() } : {}),
  });
}

// ── GESTIÓN DE PINS EN MEMORIA (NUNCA LOCALSTORAGE) ─────────────────────────
// Bloqueo automático por inactividad:
// Admin: 15 minutos sin uso
// Hogar: 5 minutos sin uso

let _adminPinMemory = null;
let _adminPinExpiresAt = 0;

export function getAdminPinSession() {
  if (!_adminPinMemory) return null;
  if (Date.now() > _adminPinExpiresAt) {
    _adminPinMemory = null;
    _adminPinExpiresAt = 0;
    return null;
  }
  // Renovar ventana de 15 minutos de inactividad
  _adminPinExpiresAt = Date.now() + 15 * 60 * 1000;
  return _adminPinMemory;
}

export function setAdminPinSession(pin) {
  _adminPinMemory = String(pin).trim();
  _adminPinExpiresAt = Date.now() + 15 * 60 * 1000;
}

export function clearAdminPinSession() {
  _adminPinMemory = null;
  _adminPinExpiresAt = 0;
}

let _hogarPinMemory = null;
let _hogarPinExpiresAt = 0;

export function getHogarPinSession() {
  if (!_hogarPinMemory) return null;
  if (Date.now() > _hogarPinExpiresAt) {
    _hogarPinMemory = null;
    _hogarPinExpiresAt = 0;
    return null;
  }
  // Renovar ventana de 5 minutos de inactividad
  _hogarPinExpiresAt = Date.now() + 5 * 60 * 1000;
  return _hogarPinMemory;
}

export function setHogarPinSession(pin) {
  _hogarPinMemory = String(pin).trim();
  _hogarPinExpiresAt = Date.now() + 5 * 60 * 1000;
}

export function clearHogarPinSession() {
  _hogarPinMemory = null;
  _hogarPinExpiresAt = 0;
}

// ── 5. ARMADO DE PEDIDOS & RESERVAS DE STOCK (APPS SCRIPT V8) ────────────────

export async function apiReservarPedido({ numero_pedido, items }) {
  return llamarAppsScript('reservarPedido', {
    numero_pedido: String(numero_pedido).trim(),
    items: (items || []).map(it => ({
      producto: String(it.producto || it.nombre || '').trim(),
      cantidad: Number(it.cantidad || 0),
    })),
  });
}

export async function apiRegistrarPesadas({ numero_pedido, items }) {
  return llamarAppsScript('registrarPesadas', {
    numero_pedido: String(numero_pedido).trim(),
    items: (items || []).map(it => ({
      producto: String(it.producto || it.nombre || '').trim(),
      cantidad_real: Number(it.cantidad_real != null ? it.cantidad_real : (it.cantidad || 0)),
    })),
  });
}

export async function apiGuardarPreparacion({ numero_pedido, preparacion }) {
  return llamarAppsScript('guardarPreparacion', {
    numero_pedido: String(numero_pedido).trim(),
    preparacion: preparacion || {},
  });
}

export async function apiGetPreparaciones({ dias = 7 } = {}) {
  return llamarAppsScript('getPreparaciones', {
    dias: Number(dias) || 7,
  });
}

export async function apiSetDetallePedido({ numero_pedido, detalle_json }) {
  const jsonStr = typeof detalle_json === 'string' ? detalle_json : JSON.stringify(detalle_json);
  return llamarAppsScript('setDetallePedido', {
    numero_pedido: String(numero_pedido).trim(),
    detalle_json: jsonStr,
  });
}

export async function apiGetReservas({ numero_pedido } = {}) {
  return llamarAppsScript('getReservas', numero_pedido ? { numero_pedido: String(numero_pedido).trim() } : {});
}

export async function apiLiberarPedido({ numero_pedido, motivo = 'Cancelado' }) {
  return llamarAppsScript('liberarPedido', {
    numero_pedido: String(numero_pedido).trim(),
    motivo: String(motivo || 'Cancelado').trim(),
  });
}

export async function apiCobrarPedido({ numero_pedido, medio, monto, items, nota }) {
  return llamarAppsScript('cobrarPedido', {
    numero_pedido: String(numero_pedido).trim(),
    medio: String(medio).trim().toLowerCase(),
    monto: Math.round(Number(monto) || 0),
    items: (items || []).map(it => ({
      producto: String(it.producto || it.nombre || '').trim(),
      cantidad_real: Number(it.cantidad_real != null ? it.cantidad_real : (it.cantidad || 0)),
    })),
    ...(nota ? { nota: String(nota).trim() } : {}),
  });
}

export async function apiEntregarPedido({ numero_pedido, items }) {
  return llamarAppsScript('entregarPedido', {
    numero_pedido: String(numero_pedido).trim(),
    items: (items || []).map(it => ({
      producto: String(it.producto || it.nombre || '').trim(),
      cantidad_real: Number(it.cantidad_real != null ? it.cantidad_real : (it.cantidad || 0)),
    })),
  });
}

// ── 7. NO ENTREGAS & ALERTAS DE CLIENTE ─────────────────────────────────────

export async function apiRegistrarNoEntrega({ numero_pedido, motivo, accion_tomada }) {
  return llamarAppsScript('registrarNoEntrega', {
    numero_pedido: String(numero_pedido).trim(),
    motivo: String(motivo || '').trim(),
    accion_tomada: String(accion_tomada || '').trim().toLowerCase(), // "reagendar" | "cancelar"
  });
}

export async function apiGetNoEntregasCliente({ numero_pedido }) {
  return llamarAppsScript('getNoEntregasCliente', {
    numero_pedido: String(numero_pedido).trim(),
  });
}

export async function apiGetNoEntregasBatch({ pedidos = [] }) {
  const lista = Array.isArray(pedidos) ? pedidos.map(p => String(p).trim()).filter(Boolean) : [];
  return llamarAppsScript('getNoEntregasBatch', {
    pedidos: lista,
  });
}

// ── 7B. CRÉDITO Y REFERIDOS (Apps Script v16) ──────────────────────────────

export async function apiLiberarCredito(params) {
  const num = typeof params === 'object' && params !== null
    ? (params.numero_pedido || params.pedido)
    : params;
  return llamarAppsScript('liberarCredito', {
    numero_pedido: String(num || '').trim(),
  });
}

export async function apiGetEstadoCreditoPedidos(params = {}) {
  const rawList = Array.isArray(params)
    ? params
    : (params?.pedidos || []);
  const lista = rawList
    .map(p => (typeof p === 'object' && p !== null ? (p.numero_pedido || p.id) : p))
    .filter(Boolean)
    .map(p => String(p).trim());
  return llamarAppsScript('getEstadoCreditoPedidos', {
    pedidos: lista,
  });
}

// ── 8. REEMBOLSOS ────────────────────────────────────────────────────────────

export async function apiRegistrarReembolso({ numero_pedido, estado, monto, medio, referencia, nota }) {
  return llamarAppsScript('registrarReembolso', {
    numero_pedido: String(numero_pedido).trim(),
    estado: String(estado || '').trim().toLowerCase(), // "pendiente" | "devuelto"
    ...(monto != null && monto !== '' ? { monto: Number(monto) } : {}),
    ...(medio ? { medio: String(medio).trim().toLowerCase() } : {}),
    ...(referencia != null && String(referencia).trim() !== '' ? { referencia: String(referencia).trim() } : {}),
    ...(nota != null && String(nota).trim() !== '' ? { nota: String(nota).trim() } : {}),
  });
}

export async function apiGetReembolsos() {
  return llamarAppsScript('getReembolsos', {});
}

export async function apiGetReembolsosPendientes() {
  return llamarAppsScript('getReembolsosPendientes', {});
}

// ── 9. EAN & ALMACÉN ─────────────────────────────────────────────────────────

export async function apiBuscarPorEan({ ean }) {
  return llamarAppsScript('buscarPorEan', {
    ean: String(ean || '').trim().toUpperCase(),
  });
}

export async function apiGetMapaEan() {
  return llamarAppsScript('getMapaEan', {});
}

export async function apiSetEanProducto({ ean, productoId = null, nombre, subcategoria = 'Almacén', unidad = 'un', marca = '' }) {
  return llamarAppsScript('setEanProducto', {
    ean: String(ean || '').trim().toUpperCase(),
    ...(productoId ? { productoId } : {}),
    nombre: String(nombre || '').trim(),
    subcategoria: String(subcategoria || 'Almacén').trim(),
    unidad: String(unidad || 'un').trim(),
    marca: String(marca || '').trim(),
  });
}





// -- CALENDARIO DE ENTREGAS --
export async function apiGetFeriados() {
  return llamarAppsScript('getFeriados');
}

export async function apiGetCalendario() {
  return llamarAppsScript('getCalendario');
}

// estado: 'cerrado' | 'abierto' | 'normal' (normal borra la marca)
export async function apiSetDiaCalendario(fecha, estado, motivo = '') {
  return llamarAppsScript('setDiaCalendario', { fecha, estado, ...(motivo ? { motivo: String(motivo).trim() } : {}) });
}

export async function apiSembrarFeriados() {
  return llamarAppsScript('sembrarFeriados');
}
