// ── Identificación de unidades de Almacén por código EAN ────────────────────
// El stock oficial lo define Panel de Costos. Acá solo se lleva la cuenta de
// cuántas unidades de ese stock ya fueron escaneadas / identificadas.
import { getEanMapping, asociarEanAProducto, normalizeSubcategoriaAlmacen } from '../data/productUtils';

export const IDENT_KEY = 'huerta_almacen_identificacion_v1';

export const normNombre = (s) =>
  (s || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function getIdentificaciones() {
  try {
    const raw = localStorage.getItem(IDENT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveIdentificaciones(data) {
  try {
    localStorage.setItem(IDENT_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Error guardando identificaciones:', e);
  }
}

export const esProductoAlmacenUnidad = (p) =>
  !!p && p.categoriaPrincipal !== 'Verduras' && p.categoriaPrincipal !== 'Frutas' && (p.categoriaPrincipal === 'Almacén' || (p.id && String(p.id).startsWith('alm_')));

export const stockOficialUnidades = (p) =>
  Math.max(0, Math.round(Number(p?.stock?.unidades ?? p?.stock?.['1kg']) || 0));

export function getScansProducto(nombre) {
  return getIdentificaciones()[normNombre(nombre)]?.scans || [];
}

/** Busca si el código ya está asociado a OTRO producto (tracking o mapa EAN). */
export function productoDeCodigo(code, nombreActual) {
  const c = String(code).trim().toUpperCase();
  const actual = normNombre(nombreActual);
  const data = getIdentificaciones();
  for (const [key, val] of Object.entries(data)) {
    if (key !== actual && (val.scans || []).some((s) => s.code === c)) return val.nombre || key;
  }
  const mapped = getEanMapping()[c];
  if (mapped && normNombre(mapped.nombre) !== actual) return mapped.nombre;
  return null;
}

/** Registra un escaneo SIN tocar el stock. */
export function registrarEscaneo(prod, code, { forzar = false } = {}) {
  const c = String(code).trim().toUpperCase();
  const total = stockOficialUnidades(prod);
  const key = normNombre(prod.nombre);
  const data = getIdentificaciones();
  const entry = data[key] || { nombre: prod.nombre, scans: [] };

  if (entry.scans.length >= total && !forzar) {
    return { status: 'excedido', identificadas: entry.scans.length, total };
  }

  entry.nombre = prod.nombre;
  entry.scans = [...entry.scans, { code: c, ts: new Date().toISOString(), excedente: entry.scans.length >= total }];
  data[key] = entry;
  saveIdentificaciones(data);
  sincronizarMapaEan(prod, entry);
  return { status: 'ok', identificadas: entry.scans.length, total, completo: entry.scans.length >= total };
}

export function deshacerUltimoEscaneo(prod) {
  const key = normNombre(prod.nombre);
  const data = getIdentificaciones();
  const entry = data[key];
  if (!entry || entry.scans.length === 0) return null;
  const quitado = entry.scans[entry.scans.length - 1];
  entry.scans = entry.scans.slice(0, -1);
  data[key] = entry;
  saveIdentificaciones(data);
  return quitado;
}

/**
 * Asocia todos los códigos escaneados al mapa EAN global para que el armado
 * de pedidos y el escaneo general lo reconozcan de inmediato.
 */
function sincronizarMapaEan(prod, entry) {
  if (!entry?.scans || entry.scans.length === 0) return;
  const codigos = new Set(entry.scans.map((s) => s.code));
  codigos.forEach((code) => {
    asociarEanAProducto(code, {
      productoId: prod.id || null,
      nombre: prod.nombre,
      subcategoria: normalizeSubcategoriaAlmacen(prod.subcategoria),
      unidad: prod.unidad || 'unidad'
    });
  });
}
