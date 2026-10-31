// src/utils/faltantesLogic.js
// Lógica pura de cálculo de faltantes por pedidos pendientes (verdura/kilo + almacén).
// Testeable directamente con node sin entorno JSX.

import { parsearProductosPedido } from './remitoPrinter.js';
import { getTipoByNombre, getCategoriaPrincipal, getEanMapping } from '../data/productUtils.js';
import { leerCacheAlmacen } from './almacenCache.js';
import { resolverEntrega } from './agendaCalendario.js';
import { extraerFechaYMD } from './fechasEntrega.js';

const norm = (s) =>
  (s || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * Función central de cálculo de faltantes utilizada por la pantalla Faltantes y el Header (badge).
 */
export function calcularFaltantes(stockData, productosCostos, pedidos, stockKgList = null, almacenList = null) {
  // 1. Unificar catálogo de productos
  const stockList = Array.isArray(stockData)
    ? stockData
    : Object.values(stockData || {});
  const costosList = productosCostos || [];

  const catalogMap = new Map();

  // Incorporar costos
  costosList.forEach((c) => {
    if (!c || !c.nombre || !c.activo) return;
    const k = norm(c.nombre);
    catalogMap.set(k, {
      id: c.id,
      nombre: c.nombre,
      categoriaPrincipal: c.categoriaPrincipal || getCategoriaPrincipal(c.nombre),
      tipo: c.categoria || getTipoByNombre(c.nombre),
      unidad: c.unidad || 'kg',
      stock_unidades: Number(c.stock_unidades || 0),
      codigo_ean: c.codigo_ean || c.ean || '',
      stock_500g: 0,
      stock_1kg: 0,
      original_load_500g: null,
      original_load_1kg: null,
      fila: c.fila
    });
  });

  // Incorporar almacén local (almacenCache)
  try {
    const almCache = leerCacheAlmacen();
    Object.keys(almCache || {}).forEach((k) => {
      const alm = almCache[k];
      if (!alm || !alm.nombre) return;
      const existing = catalogMap.get(k) || {};
      catalogMap.set(k, {
        ...existing,
        id: alm.id || existing.id || k,
        nombre: alm.nombre || existing.nombre,
        categoriaPrincipal: 'Almacén',
        tipo: 'almacen',
        unidad: 'un',
        esUnidad: true,
        stock_unidades: Number(alm.stock ?? existing.stock_unidades ?? 0),
        codigo_ean: alm.codigo_ean || alm.ean || existing.codigo_ean || ''
      });
    });
  } catch (_) {
    // ignore
  }

  // Incorporar almacenList si fue provisto
  if (Array.isArray(almacenList)) {
    almacenList.forEach((alm) => {
      if (!alm || !alm.nombre) return;
      const k = norm(alm.nombre);
      const existing = catalogMap.get(k) || {};
      catalogMap.set(k, {
        ...existing,
        id: alm.id || existing.id || k,
        nombre: alm.nombre || existing.nombre,
        categoriaPrincipal: 'Almacén',
        tipo: 'almacen',
        unidad: 'un',
        esUnidad: true,
        stock_unidades: Number(alm.stock_unidades ?? alm.stock ?? existing.stock_unidades ?? 0),
        codigo_ean: alm.codigo_ean || alm.ean || existing.codigo_ean || ''
      });
    });
  }

  // Incorporar productos provenientes de getStockKg si existen
  if (Array.isArray(stockKgList)) {
    stockKgList.forEach((sk) => {
      if (!sk || !sk.producto) return;
      const k = norm(sk.producto);
      const existing = catalogMap.get(k) || {};
      catalogMap.set(k, {
        ...existing,
        id: sk.id || existing.id,
        nombre: sk.producto || existing.nombre,
        categoriaPrincipal: sk.categoria || existing.categoriaPrincipal || getCategoriaPrincipal(sk.producto),
        unidad: sk.unidad || existing.unidad || 'kg',
        en_deposito: Number(sk.en_deposito || 0),
      });
    });
  }

  // Sobreimprimir con datos de ControlStock
  stockList.forEach((s) => {
    if (!s || !s.nombre) return;
    const k = norm(s.nombre);
    const existing = catalogMap.get(k) || {};
    catalogMap.set(k, {
      ...existing,
      id: s.id || existing.id,
      nombre: s.nombre || existing.nombre,
      categoriaPrincipal: s.categoriaPrincipal || existing.categoriaPrincipal || getCategoriaPrincipal(s.nombre),
      tipo: s.tipo || existing.tipo || getTipoByNombre(s.nombre),
      unidad: s.unidad || existing.unidad || 'kg',
      esUnidad: s.esUnidad || existing.esUnidad,
      stock_unidades: s.stock_unidades !== undefined ? Number(s.stock_unidades) : Number(s.stock?.unidades ?? existing.stock_unidades ?? 0),
      stock_500g: s.stock_500g !== undefined ? s.stock_500g : (s.stock?.['500g'] ?? existing.stock_500g ?? 0),
      stock_1kg: s.stock_1kg !== undefined ? s.stock_1kg : (s.stock?.['1kg'] ?? existing.stock_1kg ?? 0),
      original_load_500g: s.original_load_500g !== undefined ? s.original_load_500g : (s.originalLoad?.['500g'] ?? null),
      original_load_1kg: s.original_load_1kg !== undefined ? s.original_load_1kg : (s.originalLoad?.['1kg'] ?? null),
      fila: s.fila || existing.fila
    });
  });

  // 2. Filtrar pedidos NO entregados ni cancelados (de cualquier fecha de entrega)
  const pedidosPendientes = (pedidos || []).filter((p) => {
    const estado = String(p.estado || '').toLowerCase().trim();
    const esEntregado = estado === 'entregado' || estado === 'delivered';
    const esCancelado = estado === 'cancelado' || estado === 'cancelled' ||
      (p.motivo_no_entrega && String(p.motivo_no_entrega).toLowerCase().includes('cancel'));
    return !esEntregado && !esCancelado;
  });

  // 3. Mapear demanda solicitada por producto y fecha más próxima
  const demandaPorProdKey = new Map();
  const proxEntregaPorProdKey = new Map();
  const sinIdentificar = [];
  let eanMap = {};
  try { eanMap = getEanMapping() || {}; } catch (_) {
    // ignore
  }

  pedidosPendientes.forEach((p) => {
    const items = parsearProductosPedido(p.producto, p.cantidades);
    let fEntregaYMD = '';
    try {
      const res = resolverEntrega(p);
      fEntregaYMD = res?.ymd || extraerFechaYMD(p.dia_entrega) || '';
    } catch (_) {
      fEntregaYMD = extraerFechaYMD(p.dia_entrega) || '';
    }

    items.forEach((item) => {
      const itemKey = norm(item.nombre);
      let matchKey = null;

      // Intentar emparejar por EAN si existe
      if (item.ean) {
        const eanClean = String(item.ean).trim();
        for (const [k, prod] of catalogMap.entries()) {
          if (prod.codigo_ean && String(prod.codigo_ean).trim() === eanClean) {
            matchKey = k;
            break;
          }
        }
        if (!matchKey && eanMap[eanClean]) {
          const normEanName = norm(eanMap[eanClean]);
          if (catalogMap.has(normEanName)) matchKey = normEanName;
        }
      }

      // Match en catálogo por nombre normalizado
      if (!matchKey) {
        if (catalogMap.has(itemKey)) {
          matchKey = itemKey;
        } else {
          for (const k of catalogMap.keys()) {
            if (k.includes(itemKey) || itemKey.includes(k)) {
              matchKey = k;
              break;
            }
          }
        }
      }

      const cantPedida = item.pesoSolicitado
        ? Math.round(item.pesoSolicitado * (item.cantidad || 1) * 100) / 100
        : Number(item.cantidad) || 1;

      if (matchKey) {
        demandaPorProdKey.set(
          matchKey,
          (demandaPorProdKey.get(matchKey) || 0) + cantPedida
        );

        if (fEntregaYMD) {
          const actualMin = proxEntregaPorProdKey.get(matchKey);
          if (!actualMin || fEntregaYMD < actualMin) {
            proxEntregaPorProdKey.set(matchKey, fEntregaYMD);
          }
        }
      } else {
        sinIdentificar.push({
          nombre: item.nombre,
          cantidad: cantPedida,
          pedido: p.numero_pedido || `#${p.sheetRowIndex || '?' }`,
          cliente: p.nombre || 'Sin nombre',
          fecha: p.fecha || '',
          diaEntrega: p.dia_entrega || ''
        });
      }
    });
  });

  // 4. Evaluar condiciones para cada producto
  const faltantes = [];

  catalogMap.forEach((p, k) => {
    const cat = p.categoriaPrincipal || getCategoriaPrincipal(p.nombre);
    const esUnidad =
      cat === 'Almacén' ||
      cat === 'Extras' ||
      p.esUnidad ||
      (p.unidad && (p.unidad.includes('unidad') || p.unidad.includes('maple')));
    const tipo = p.tipo || getTipoByNombre(p.nombre);

    let stockActual = 0;
    let cargaOriginal = 0;
    let tieneCargaOriginal = false;
    let unidadLabel = p.unidad || 'kg';

    if (cat === 'Almacén') {
      // Para productos de Almacén: unidades del producto contra stock_unidades
      stockActual = Number(p.stock_unidades ?? 0);
      unidadLabel = 'un';
    } else if (stockKgList) {
      // Fuente oficial getStockKg (en_deposito) para verduras/pesables
      stockActual = Number(p.en_deposito || 0);
      unidadLabel = p.unidad || (esUnidad ? (p.unidad?.includes('maple') ? 'maples' : 'uds') : 'kg');
    } else {
      // Cálculo legacy (ControlStock: bolsas 500g/1kg y stock_unidades)
      if (esUnidad) {
        stockActual = Number(p.stock_unidades ?? 0);
        unidadLabel = p.unidad?.includes('maple') ? 'maples' : 'uds';
        if (p.original_load_1kg !== null && p.original_load_1kg !== undefined && p.original_load_1kg !== '') {
          cargaOriginal = Number(p.original_load_1kg) || 0;
          tieneCargaOriginal = true;
        }
      } else if (tipo === 'hoja verde') {
        const s500 = Number(p.stock_500g || 0);
        const s1k = Number(p.stock_1kg || 0);
        stockActual = Math.round((s500 * 0.25 + s1k * 0.5) * 100) / 100;
        unidadLabel = 'kg';
        if (
          (p.original_load_500g !== null && p.original_load_500g !== undefined && p.original_load_500g !== '') ||
          (p.original_load_1kg !== null && p.original_load_1kg !== undefined && p.original_load_1kg !== '')
        ) {
          const o500 = Number(p.original_load_500g || 0);
          const o1k = Number(p.original_load_1kg || 0);
          cargaOriginal = Math.round((o500 * 0.25 + o1k * 0.5) * 100) / 100;
          tieneCargaOriginal = o500 > 0 || o1k > 0;
        }
      } else {
        const s500 = Number(p.stock_500g || 0);
        const s1k = Number(p.stock_1kg || 0);
        stockActual = Math.round((s500 * 0.5 + s1k * 1.0) * 100) / 100;
        unidadLabel = 'kg';
        if (
          (p.original_load_500g !== null && p.original_load_500g !== undefined && p.original_load_500g !== '') ||
          (p.original_load_1kg !== null && p.original_load_1kg !== undefined && p.original_load_1kg !== '')
        ) {
          const o500 = Number(p.original_load_500g || 0);
          const o1k = Number(p.original_load_1kg || 0);
          cargaOriginal = Math.round((o500 * 0.5 + o1k * 1.0) * 100) / 100;
          tieneCargaOriginal = o500 > 0 || o1k > 0;
        }
      }
    }

    const pedidoPendiente = Math.round((demandaPorProdKey.get(k) || 0) * 100) / 100;

    // Evaluación de estado
    let estado = null;
    let prioridad = 99;

    // a) SIN STOCK: stock total <= 0
    if (stockActual <= 0) {
      estado = 'Sin stock';
      prioridad = 1;
    }
    // b) FALTA PARA PEDIDOS: pedidos superan el stock disponible
    else if (pedidoPendiente > stockActual) {
      estado = 'Falta para pedidos';
      prioridad = 2;
    }
    // c) STOCK BAJO: stock actual <= 50% de la carga original
    else if (tieneCargaOriginal && cargaOriginal > 0 && stockActual <= cargaOriginal * 0.5) {
      estado = 'Stock bajo';
      prioridad = 3;
    }

    if (estado) {
      const faltaParaPedidos = Math.max(0, Math.round((pedidoPendiente - stockActual) * 100) / 100);
      const faltaParaOriginal = tieneCargaOriginal && cargaOriginal > 0
        ? Math.max(0, Math.round((cargaOriginal - stockActual) * 100) / 100)
        : 0;

      let comprarSugerido = Math.max(faltaParaPedidos, faltaParaOriginal);
      if (comprarSugerido <= 0) {
        comprarSugerido = pedidoPendiente > 0 ? pedidoPendiente : 1;
      }

      const proxYMD = proxEntregaPorProdKey.get(k) || null;
      let proximaEntregaLabel = 'Sin fecha';
      if (proxYMD) {
        const [y, m, d] = proxYMD.split('-');
        const dObj = new Date(Number(y), Number(m) - 1, Number(d));
        const nomDia = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][dObj.getDay()] || '';
        proximaEntregaLabel = `${nomDia} ${d}/${m}`;
      }

      faltantes.push({
        id: p.id || k,
        nombre: p.nombre,
        categoria: cat,
        estado,
        prioridad,
        stockActual,
        pedidoPendiente,
        faltaParaPedidos,
        comprarSugerido,
        unidad: unidadLabel,
        proximaEntregaYMD: proxYMD,
        proximaEntregaLabel
      });
    }
  });

  // Ordenar: Sin stock (1), Falta para pedidos (2), Stock bajo (3), luego por nombre
  faltantes.sort((a, b) => {
    if (a.prioridad !== b.prioridad) return a.prioridad - b.prioridad;
    return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
  });

  return { faltantes, sinIdentificar };
}
