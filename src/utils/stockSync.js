// ============================================================================
// Sincronización Unificada de Stock con Google Sheets (Apps Script)
// Huerta Urbana Dashboard
// ============================================================================

import { APPS_SCRIPT_URL } from './appsScriptUrl';
import { 
  getCategoriaPrincipal, 
  SUBCATEGORIAS_ALMACEN 
} from '../data/productUtils';
import { 
  calcularPrecioAlmacen, 
  leerCacheAlmacen, 
  guardarCacheAlmacen, 
  firmaPayloadAlmacen 
} from './almacenCache';

const SHEET_ID = import.meta.env.VITE_SHEET_ID;

const norm = (s) =>
  (s || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Realiza un POST a Apps Script con reintentos exponenciales.
 * Reintenta hasta maxAttempts veces con espera creciente.
 */
async function postAppsScriptConReintentos(payload, productoNombre, onStatusChange, maxAttempts = 3) {
  if (!APPS_SCRIPT_URL) {
    console.warn('[STOCK-SYNC] Falta APPS_SCRIPT_URL. No se sincronizó.');
    return { success: false, error: 'APPS_SCRIPT_URL no configurada' };
  }

  let ultimoError = null;

  for (let intento = 1; intento <= maxAttempts; intento++) {
    try {
      const res = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      let json = null;
      try {
        json = await res.clone().json();
      } catch (e) {
        // Respuesta no-JSON aceptada si HTTP status es ok
      }

      if (json && json.success === false) {
        throw new Error(json.error || 'Apps Script rechazó el guardado');
      }

      // Éxito
      if (onStatusChange) {
        onStatusChange({
          status: 'success',
          intento,
          message: 'Guardado en Google Sheet correctamente'
        });
      }
      return { success: true, payload };
    } catch (err) {
      ultimoError = err;
      console.warn(`[STOCK-SYNC] Intento ${intento}/${maxAttempts} falló para "${productoNombre}":`, err.message);

      if (intento < maxAttempts) {
        if (onStatusChange) {
          onStatusChange({
            status: 'retrying',
            attempt: intento,
            maxAttempts,
            message: 'No se pudo guardar en el Sheet, reintentando'
          });
        }
        // Espera creciente: 1000ms, 2500ms...
        await sleep(intento * 1200);
      }
    }
  }

  // Si fallaron todos los reintentos, no rompemos ni revertimos el estado local
  console.error(`❌ [STOCK-SYNC] Fallaron los ${maxAttempts} intentos de guardado en el Sheet para "${productoNombre}":`, ultimoError?.message);
  if (onStatusChange) {
    onStatusChange({
      status: 'error',
      maxAttempts,
      message: 'No se pudo guardar en el Sheet, reintentando'
    });
  }
  return { success: false, error: ultimoError?.message };
}

/**
 * Sincroniza un producto (Verdura, Fruta o Almacén) con la hoja correspondiente en Google Sheets.
 */
export async function syncProductWithSheet(updatedProduct, options = {}) {
  if (!updatedProduct || !updatedProduct.nombre) return { success: false };

  const { onStatusChange, currentStockMap = {} } = options;
  const nombre = updatedProduct.nombre;
  const autoCatSync = getCategoriaPrincipal(nombre);
  const esVerduraOFruta =
    autoCatSync === 'Verduras' ||
    autoCatSync === 'Frutas' ||
    updatedProduct.categoriaPrincipal === 'Verduras' ||
    updatedProduct.categoriaPrincipal === 'Frutas';
  const isAlmacen =
    !esVerduraOFruta &&
    (updatedProduct.categoriaPrincipal === 'Almacén' ||
      (updatedProduct.id && String(updatedProduct.id).startsWith('alm_')));

  // ── CASO 1: PRODUCTOS DE ALMACÉN ──────────────────────────────────────────
  if (isAlmacen) {
    let filaDestino =
      updatedProduct.fila && Number(updatedProduct.fila) > 1
        ? Number(updatedProduct.fila)
        : null;

    if (!filaDestino) {
      let maxFilaEncontrada = 1;

      // 1. Revisar estado actual en memoria
      Object.values(currentStockMap || {}).forEach((p) => {
        const isAlmP =
          !esVerduraOFruta &&
          (p.categoriaPrincipal === 'Almacén' ||
            (p.id && String(p.id).startsWith('alm_')));
        if (isAlmP) {
          const f = Number(p.fila);
          if (f && f > 1 && f > maxFilaEncontrada) maxFilaEncontrada = f;
          if (
            p.nombre &&
            p.nombre.trim().toLowerCase() === nombre.trim().toLowerCase() &&
            f &&
            f > 1
          ) {
            filaDestino = f;
          }
        }
      });

      // 2. Revisar localStorage
      try {
        const cacheAlm = leerCacheAlmacen();
        const cachedItem = cacheAlm[norm(nombre)];
        if (cachedItem?.fila && Number(cachedItem.fila) > 1) {
          filaDestino = Number(cachedItem.fila);
        }
      } catch (e) {}

      try {
        const cs = JSON.parse(
          localStorage.getItem('huerta_custom_almacen_prods_v1') || '[]'
        );
        cs.forEach((p) => {
          const f = Number(p.fila);
          if (f && f > 1 && f > maxFilaEncontrada) maxFilaEncontrada = f;
          if (
            p.nombre &&
            p.nombre.trim().toLowerCase() === nombre.trim().toLowerCase() &&
            f &&
            f > 1
          ) {
            filaDestino = f;
          }
        });
      } catch (e) {}

      // 3. Fallback: buscar en el Sheet
      if (!filaDestino && SHEET_ID) {
        try {
          const gvizRes = await fetch(
            `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=Almacen`
          );
          if (gvizRes.ok) {
            const text = await gvizRes.text();
            const s = text.indexOf('{');
            const e = text.lastIndexOf('}');
            if (s !== -1 && e !== -1) {
              const json = JSON.parse(text.substring(s, e + 1));
              const rows = json.table?.rows || [];
              const isHeader =
                String(rows[0]?.c?.[0]?.v || '').toLowerCase() === 'nombre';
              const existingIdx = rows.findIndex(
                (r) =>
                  String(r.c?.[0]?.v || '')
                    .trim()
                    .toLowerCase() === nombre.trim().toLowerCase()
              );
              if (existingIdx !== -1) {
                const fVal = Number(rows[existingIdx]?.c?.[8]?.v);
                filaDestino =
                  fVal && fVal > 1
                    ? fVal
                    : isHeader
                    ? existingIdx + 3
                    : existingIdx + 2;
              } else {
                rows.forEach((r, idx) => {
                  const fVal =
                    Number(r.c?.[8]?.v) ||
                    (isHeader ? idx + 3 : idx + 2);
                  if (fVal > 1 && fVal > maxFilaEncontrada)
                    maxFilaEncontrada = fVal;
                });
              }
            }
          }
        } catch (e) {
          console.warn('[STOCK-SYNC] Error consultando fila Almacen:', e);
        }
      }

      if (!filaDestino) {
        filaDestino = Math.max(maxFilaEncontrada, 1) + 1;
      }
    }

    if (!filaDestino || filaDestino < 2) filaDestino = 2;
    updatedProduct.fila = filaDestino;

    const stockUds =
      Number(
        updatedProduct.stock?.unidades ??
          updatedProduct.stock?.['1kg'] ??
          updatedProduct.stock_unidades
      ) || 0;

    const costoUnit =
      updatedProduct.costoUnitario ||
      updatedProduct.costo_unitario ||
      leerCacheAlmacen()[norm(nombre)]?.costoUnitario ||
      0;

    const precioVentaCalc =
      updatedProduct.precioVenta ||
      updatedProduct.precio_venta ||
      calcularPrecioAlmacen({
        precioCajon: costoUnit,
        cantidadCajon: 1,
        margen: leerCacheAlmacen()[norm(nombre)]?.margen,
        precioMaxManual: leerCacheAlmacen()[norm(nombre)]?.precioMaxManual
      }).precioFinal;

    const payloadAlmacen = {
      accion: 'updateAlmacen',
      action: 'updateAlmacen',
      sheetName: 'Almacen',
      sheet: 'Almacen',
      fila: filaDestino,
      nombre,
      marca: updatedProduct.marca || '',
      categoria: 'Almacén',
      subcategoria: updatedProduct.subcategoria || 'Almacén',
      codigo_ean: updatedProduct.ean || updatedProduct.codigo_ean || '',
      costo_unitario: costoUnit,
      precio_venta: precioVentaCalc,
      stock_unidades: stockUds,
      fila_val: filaDestino
    };

    const res = await postAppsScriptConReintentos(
      payloadAlmacen,
      nombre,
      onStatusChange
    );

    if (res.success) {
      guardarCacheAlmacen(nombre, {
        sentSig: firmaPayloadAlmacen(payloadAlmacen),
        fila: filaDestino,
        stock: stockUds
      });
    }

    return res;
  }

  // ── CASO 2: PRODUCTOS DE CONTROLSTOCK (VERDURAS / FRUTAS) ─────────────────
  if (
    updatedProduct.categoriaPrincipal === 'Almacén' ||
    updatedProduct.subcategoria === 'Almacén' ||
    SUBCATEGORIAS_ALMACEN.includes(updatedProduct.subcategoria)
  ) {
    return { success: false, error: 'Omitido: producto de almacén en ControlStock' };
  }

  if (!updatedProduct.fila) {
    console.warn(`[STOCK-SYNC] "${nombre}" no tiene fila asignada en ControlStock.`);
    return { success: false, error: 'Sin fila' };
  }

  const payloadStock = {
    accion: 'updateStock',
    action: 'updateStock',
    sheetName: 'ControlStock',
    fila: updatedProduct.fila,
    nombre,
    stock_500g: updatedProduct.stock?.['500g'] ?? 0,
    stock_1kg: updatedProduct.stock?.['1kg'] ?? 0,
    original_load_500g:
      updatedProduct.originalLoad?.['500g'] ??
      updatedProduct.stock?.['500g'] ??
      0,
    original_load_1kg:
      updatedProduct.originalLoad?.['1kg'] ??
      updatedProduct.stock?.['1kg'] ??
      0,
    tipo: updatedProduct.tipo || 'duro',
    total_days: updatedProduct.totalDays ?? 15,
    urgent_days: updatedProduct.urgentDays ?? 2,
    ultimo_bandejeado:
      updatedProduct.ultimo_bandejeado ||
      updatedProduct.ultimoBandejeado ||
      new Date().toISOString().split('T')[0]
  };

  return postAppsScriptConReintentos(payloadStock, nombre, onStatusChange);
}
