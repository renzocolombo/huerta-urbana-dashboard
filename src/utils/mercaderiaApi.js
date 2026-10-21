import { APPS_SCRIPT_URL } from './appsScriptUrl';

/**
 * Cliente de llamadas al Apps Script para el módulo de Mercadería, Stock y Precios.
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

    if (data && data.ok === false) {
      return { ok: false, error: data.error || 'Error reportado por el Apps Script' };
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

// ── Servicios específicos del contrato ─────────────────────────────────────

export async function apiGetConfig() {
  return llamarAppsScript('getConfig');
}

export async function apiSetConfig(clave, valor) {
  return llamarAppsScript('setConfig', { clave, valor });
}

export async function apiCrearIngreso({ producto, proveedor, kg_netos, costo_total, cajones }) {
  return llamarAppsScript('crearIngreso', {
    producto,
    proveedor,
    kg_netos: Number(kg_netos),
    costo_total: Number(costo_total),
    ...(Array.isArray(cajones) ? { cajones } : {}),
  });
}

export async function apiGetStockKg(producto = null) {
  return llamarAppsScript('getStockKg', producto ? { producto } : {});
}
export const apiGetStock = apiGetStockKg;

export async function apiGetIngresos(producto = null, limite = 50) {
  return llamarAppsScript('getIngresos', {
    ...(producto ? { producto } : {}),
    ...(limite ? { limite } : {}),
  });
}

export async function apiRegistrarSalida({ producto, tipo, kg, nota }) {
  return llamarAppsScript('registrarSalida', {
    producto,
    tipo,
    kg: Number(kg),
    nota: nota || '',
  });
}

export async function apiGetMovimientos(producto = null, limite = 50) {
  return llamarAppsScript('getMovimientos', {
    ...(producto ? { producto } : {}),
    ...(limite ? { limite } : {}),
  });
}

export async function apiGetPreciosSugeridos() {
  return llamarAppsScript('getPreciosSugeridos');
}

export async function apiSetMargen(producto, margen_pct) {
  return llamarAppsScript('setMargen', {
    producto,
    margen_pct: Number(margen_pct),
  });
}

export async function apiPublicarPrecios(payload) {
  // Asegura: origen: 'mercaderia', solo nombre y precio por producto.
  // Sin unidad, sin categoria, sin combos ni monto_minimo.
  const rawProductos = Array.isArray(payload) ? payload : (payload?.productos || []);
  const productos = rawProductos.map(p => ({
    nombre: p.nombre,
    precio: Number(p.precio) || 0,
  }));

  return llamarAppsScript('publicarPrecios', {
    origen: 'mercaderia',
    productos,
  });
}
