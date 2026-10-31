import { estaPedidoArmado, parsearProductosPedido } from './remitoPrinter.js';

/**
 * Parsea un monto de forma ultra-robusta.
 * Acepta: número, texto con $, puntos de miles, coma decimal, espacios.
 * Si es vacío, undefined, null o NaN => devuelve 0.
 * Si es texto que no representa un monto (ej: "2 UNIDADES...") => devuelve 0.
 * NUNCA devuelve NaN.
 *
 * @param {*} val
 * @returns {number}
 */
export function parsearMonto(val) {
  if (val == null) return 0;
  if (typeof val === 'number') {
    return isNaN(val) || !isFinite(val) ? 0 : val;
  }
  let str = String(val).trim();
  if (!str) return 0;

  // Quitar signo $, espacios y caracteres no numéricos iniciales
  str = str.replace(/[$]/g, '').trim();
  if (!str) return 0;

  // Si contiene letras (ej: "2 UNIDADES HARINA..."), no es un monto válido
  if (/[a-zA-Z]/.test(str)) return 0;

  // Manejar separadores de miles y decimales
  if (str.includes('.') && str.includes(',')) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      // Formato es-AR: 20.400,50
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // Formato en-US: 20,400.50
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    // Solo coma: decimal ej 20400,50 o 1,5
    str = str.replace(',', '.');
  } else if (str.includes('.')) {
    const partes = str.split('.');
    if (partes.length > 2) {
      // Múltiples puntos: miles (ej 1.200.000)
      str = str.replace(/\./g, '');
    } else if (partes.length === 2) {
      if (partes[1].length === 3 && partes[0].length >= 1 && partes[0] !== '0') {
        // Un solo punto seguido de 3 dígitos: punto de miles argentino (ej: 20.400)
        str = partes[0] + partes[1];
      } else {
        // Decimal (ej: 20.5, 0.5)
        str = partes[0] + '.' + partes[1];
      }
    }
  }

  const n = parseFloat(str);
  return isNaN(n) || !isFinite(n) ? 0 : n;
}

/**
 * Formatea un monto de forma robusta. NUNCA devuelve NaN.
 * Si es vacío/undefined/null/NaN => devuelve "$0".
 * Formato entero en pesos argentinos (ej: "$20.400", "$0").
 *
 * @param {*} val
 * @returns {string}
 */
export function formatearMonto(val) {
  const num = Math.round(parsearMonto(val));
  return `$${num.toLocaleString('es-AR')}`;
}

/**
 * Parsea una cantidad (peso o unidades), aceptando coma decimal (ej: "1,5" => 1.5).
 *
 * @param {*} val
 * @returns {number}
 */
export function parsearCantidad(val) {
  if (val == null) return 0;
  if (typeof val === 'number') {
    return isNaN(val) || !isFinite(val) ? 0 : val;
  }
  const str = String(val).trim().replace(',', '.');
  const n = parseFloat(str);
  return isNaN(n) || !isFinite(n) ? 0 : n;
}

/**
 * Normaliza si un ítem de la preparación o del detalle está marcado como sin stock.
 */
export function esItemSinStock(it) {
  if (!it) return false;
  if (it.sin_stock === true || it.sinStock === true) return true;
  const sinStockStr = String(it.sin_stock ?? '').toLowerCase().trim();
  if (sinStockStr === 'true' || sinStockStr === 'si' || sinStockStr === '1') return true;
  const estadoStr = String(it.estado ?? '').toLowerCase().trim();
  if (estadoStr === 'sin_stock' || estadoStr === 'sin stock') return true;
  const motivoStr = String(it.motivo ?? '').toLowerCase().trim();
  if (motivoStr === 'sin_stock' || motivoStr === 'sin stock') return true;
  return false;
}

/**
 * Resuelve el precio unitario congelado de un producto según las fuentes disponibles:
 * 1) En el mismo objeto ítem (precio_unitario, precio_unit, precio)
 * 2) Función obtenerPrecioCongelado (opciones)
 * 3) Catálogo de precios en memoria (opciones.catalogoPrecios)
 */
export function resolverPrecioUnitario(it, opciones = {}) {
  if (!it) return null;
  const itemObj = typeof it === 'string' ? { nombre: it } : it;
  const rawDirecto = itemObj.precio_unitario != null
    ? itemObj.precio_unitario
    : itemObj.precio_unit != null
    ? itemObj.precio_unit
    : itemObj.precio != null
    ? itemObj.precio
    : null;
  const pDirecto = parsearMonto(rawDirecto);
  if (pDirecto > 0) return pDirecto;

  const nombre = String(itemObj.nombre || itemObj.producto || '').trim();
  if (!nombre) return null;

  if (typeof opciones.obtenerPrecioCongelado === 'function') {
    const pr = parsearMonto(opciones.obtenerPrecioCongelado(nombre));
    if (pr > 0) return pr;
  }

  const catalogo = opciones.catalogoPrecios || opciones.catalogo || [];
  if (Array.isArray(catalogo) && catalogo.length > 0) {
    const norm = (s) =>
      String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
    const k = norm(nombre);
    const matched = catalogo.find((c) => {
      const cNorm = norm(c.nombre || c.producto);
      return cNorm === k || k.includes(cNorm) || cNorm.includes(k);
    });
    if (matched) {
      const pr = parsearMonto(
        matched.precio != null
          ? matched.precio
          : matched.precio_publicado != null
          ? matched.precio_publicado
          : matched.precio_sugerido
      );
      if (pr > 0) return pr;
    }
  }

  return null;
}

/**
 * Extrae la lista de ítems procesables para el cálculo de un pedido armado.
 * Excluye explícitamente ítems marcados como sin stock.
 */
export function extraerItemsParaCalculo(pedido, preparacion) {
  let rawItems = null;

  // 1. detalle_json en pedido o preparación
  const rawDetalle = pedido?.detalle_json || preparacion?.detalle_json;
  if (rawDetalle) {
    try {
      rawItems = typeof rawDetalle === 'string' ? JSON.parse(rawDetalle) : rawDetalle;
    } catch (_) {}
  }

  // 2. items de preparación local
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    if (preparacion && Array.isArray(preparacion.items) && preparacion.items.length > 0) {
      rawItems = preparacion.items;
    }
  }

  if (!Array.isArray(rawItems)) return [];

  return rawItems.filter((it) => !esItemSinStock(it));
}

/**
 * Calcula el monto exacto a cobrar de un pedido, con la siguiente matriz:
 *
 * 1. Si el pedido NO está armado (estaPedidoArmado false):
 *    - monto / total = p.total de la hoja (neto de cupón y crédito)
 *    - marcado como "Estimado, se ajusta al pesar"
 *
 * 2. Si está armado:
 *    - suma de subtotales pesados (sin ítems sin_stock)
 *    - menos descuentos (cupón y crédito, con el mismo cálculo que el remito)
 *    - piso en 0
 *
 * 3. Si algún ítem pesado no tiene precio congelado (precio 0 o no encontrado):
 *    - NO mostrar 0
 *    - avisar "falta precio de [producto]"
 *    - usar el total de la hoja como respaldo marcado como estimado
 *
 * 4. NUNCA devuelve NaN. Siempre devuelve ambos campos: monto y total.
 *
 * @param {Object} pedido - Pedido de la hoja o estado
 * @param {Object} [preparacion] - Preparación local en memoria
 * @param {Object} [opciones] - { obtenerPrecioCongelado, catalogoPrecios }
 * @returns {Object}
 */
export function calcularTotalPedido(pedido, preparacion = null, opciones = {}) {
  if (!pedido) {
    return {
      monto: 0,
      total: 0,
      esEstimado: false,
      motivoEstimado: '',
      estaArmado: false,
      faltaPrecio: false,
      productoSinPrecio: null,
      avisoFaltaPrecio: null,
      subtotalPesado: 0,
      descuentos: 0,
      descuentosDetalle: [],
      items: [],
    };
  }

  const totalHojaRaw = parsearMonto(pedido.total);
  const totalHoja = Math.max(0, Math.round(totalHojaRaw));

  // ── CASO A: PEDIDO NO ARMADO ──────────────────────────────────────────────
  const armado = estaPedidoArmado(pedido, preparacion);
  if (!armado) {
    if (totalHoja > 0) {
      return {
        monto: totalHoja,
        total: totalHoja,
        esEstimado: true,
        motivoEstimado: 'Estimado, se ajusta al pesar',
        estaArmado: false,
        faltaPrecio: false,
        productoSinPrecio: null,
        avisoFaltaPrecio: null,
        subtotalPesado: totalHoja,
        descuentos: 0,
        descuentosDetalle: [],
        items: [],
      };
    }

    // Si el total de la hoja viene vacío o 0, calcular estimado a partir de los productos y el catálogo si es posible
    const itemsRaw = parsearProductosPedido(pedido.producto || pedido.productos || '', pedido.cantidades || '');
    let sumaEstimada = 0;
    const itemsEstimados = [];
    let faltaPrecio = false;
    let productoSinPrecio = null;

    for (const it of itemsRaw) {
      const nom = it.nombre || '';
      const cant = parsearCantidad(it.pesoSolicitado ?? it.cantidad ?? 1);
      const pr = resolverPrecioUnitario(it, opciones);
      if (pr != null && pr > 0) {
        const sub = Math.round(cant * pr);
        sumaEstimada += sub;
        itemsEstimados.push({
          nombre: nom,
          cantidad: cant,
          precioUnitario: pr,
          subtotal: sub
        });
      } else {
        faltaPrecio = true;
        if (!productoSinPrecio) productoSinPrecio = nom;
      }
    }

    const montoEstimado = Math.round(parsearMonto(sumaEstimada));
    return {
      monto: montoEstimado,
      total: montoEstimado,
      esEstimado: true,
      motivoEstimado: 'Estimado, se ajusta al pesar',
      estaArmado: false,
      faltaPrecio,
      productoSinPrecio,
      avisoFaltaPrecio: faltaPrecio ? `Falta precio: ${productoSinPrecio}` : null,
      subtotalPesado: montoEstimado,
      descuentos: 0,
      descuentosDetalle: [],
      items: itemsEstimados,
    };
  }

  // ── CASO B: PEDIDO ARMADO ─────────────────────────────────────────────────
  const itemsFiltrados = extraerItemsParaCalculo(pedido, preparacion);

  // Si está armado pero no tiene ítems válidos (todos sin stock, etc.)
  if (itemsFiltrados.length === 0) {
    return {
      monto: totalHoja,
      total: totalHoja,
      esEstimado: true,
      motivoEstimado: 'Estimado, se ajusta al pesar',
      estaArmado: true,
      faltaPrecio: false,
      productoSinPrecio: null,
      avisoFaltaPrecio: null,
      subtotalPesado: totalHoja,
      descuentos: 0,
      descuentosDetalle: [],
      items: [],
    };
  }

  let sumaSubtotales = 0;
  const itemsProcesados = [];

  for (const it of itemsFiltrados) {
    const nombre = String(it.nombre || it.producto || 'Producto').trim();
    const esUnidad = Boolean(
      it.esUnidad ||
      it.slot === 'unidades' ||
      String(it.unidad || '').toLowerCase() === 'un' ||
      String(it.unidad || '').toLowerCase() === 'unidad'
    );
    const bolsas = Array.isArray(it.bolsasAsignadas) ? it.bolsasAsignadas : [];

    let cantReal = 0;
    if (it.pesoCongelado != null && parsearCantidad(it.pesoCongelado) > 0) {
      cantReal = parsearCantidad(it.pesoCongelado);
    } else if (it.cantidadConfirmada != null && parsearCantidad(it.cantidadConfirmada) > 0) {
      cantReal = parsearCantidad(it.cantidadConfirmada);
    } else if (it.cantidad_real != null && parsearCantidad(it.cantidad_real) > 0) {
      cantReal = parsearCantidad(it.cantidad_real);
    } else if (it.cantidad != null && parsearCantidad(it.cantidad) > 0) {
      cantReal = parsearCantidad(it.cantidad);
    } else if (bolsas.length > 0) {
      cantReal = esUnidad
        ? bolsas.length
        : Number(bolsas.reduce((acc, b) => acc + (parsearCantidad(b.peso) || 0), 0).toFixed(3));
    } else if (it.pesoSolicitado != null && parsearCantidad(it.pesoSolicitado) > 0) {
      cantReal = parsearCantidad(it.pesoSolicitado);
    } else {
      cantReal = 1;
    }

    const precioUnit = resolverPrecioUnitario(it, opciones);

    // Si algún ítem pesado no tiene precio congelado (precio 0 o no encontrado),
    // NO mostrar 0: avisar "falta precio de [producto]" y usar total de la hoja como respaldo.
    if (precioUnit === null || precioUnit <= 0) {
      const aviso = `falta precio de ${nombre}`;
      return {
        monto: totalHoja,
        total: totalHoja,
        esEstimado: true,
        motivoEstimado: aviso,
        faltaPrecio: true,
        productoSinPrecio: nombre,
        avisoFaltaPrecio: aviso,
        estaArmado: true,
        subtotalPesado: totalHoja,
        descuentos: 0,
        descuentosDetalle: [],
        items: itemsProcesados,
      };
    }

    const subtotalDirecto = it.subtotal != null ? parsearMonto(it.subtotal) : 0;
    const subtotalLinea = subtotalDirecto > 0
      ? Math.round(subtotalDirecto)
      : Math.round(cantReal * precioUnit);

    sumaSubtotales += parsearMonto(subtotalLinea);
    itemsProcesados.push({
      producto: nombre,
      nombre,
      cantidad_real: cantReal,
      precio_unitario: precioUnit,
      subtotal: subtotalLinea,
    });
  }

  // ── DESCUENTOS (idéntico cálculo que el remito: descuentosDetalle) ────────
  let descuentoCupon = 0;
  let cuponNombre = '';
  let descuentoCredito = 0;

  const rawCupon = String(pedido.cupon_bienvenida_estado || pedido.cupon || '').trim();
  if (rawCupon && !['no', 'false', '0', 'null', 'undefined'].includes(rawCupon.toLowerCase())) {
    cuponNombre = rawCupon;
  }

  const rawCredito = String(pedido.credito_usado || '').trim();
  const numCred = parsearMonto(rawCredito);
  if (numCred > 0) {
    descuentoCredito = Math.round(numCred);
  }

  if (cuponNombre) {
    const pctMatch = cuponNombre.match(/(\d+)/);
    if (pctMatch) {
      const pct = Number(pctMatch[1]);
      if (pct > 0 && pct <= 100) {
        descuentoCupon = Math.round(sumaSubtotales * (pct / 100));
      }
    } else if (pedido.descuento_cupon != null && parsearMonto(pedido.descuento_cupon) > 0) {
      descuentoCupon = Math.round(parsearMonto(pedido.descuento_cupon));
    } else if (sumaSubtotales > totalHoja && (sumaSubtotales - totalHoja - descuentoCredito) > 0) {
      descuentoCupon = Math.round(sumaSubtotales - totalHoja - descuentoCredito);
    }
  }

  const descuentosDetalle = [];
  if (descuentoCupon > 0) {
    descuentosDetalle.push({
      tipo: 'cupon',
      nombre: `Cupón bienvenida (${cuponNombre})`,
      monto: descuentoCupon,
    });
  }
  if (descuentoCredito > 0) {
    descuentosDetalle.push({
      tipo: 'credito',
      nombre: 'Crédito de referido',
      monto: descuentoCredito,
    });
  }

  const promoMonto = parsearMonto(pedido.descuento_promocion || pedido.descuento_promo || 0);
  if (promoMonto > 0) {
    descuentosDetalle.push({
      tipo: 'promocion',
      nombre: pedido.promocion_nombre || pedido.promo_nombre || 'Promoción especial',
      monto: Math.round(promoMonto),
    });
  }

  if (Array.isArray(pedido.descuentos)) {
    pedido.descuentos.forEach((d) => {
      const m = parsearMonto(d?.monto);
      if (m > 0) {
        descuentosDetalle.push({
          tipo: 'descuento',
          nombre: d.nombre || 'Descuento',
          monto: Math.round(m),
        });
      }
    });
  }

  const totalDescuentos = descuentosDetalle.reduce((sum, d) => sum + parsearMonto(d.monto), 0);

  // Piso en 0
  const totalNeto = Math.max(0, sumaSubtotales - totalDescuentos);

  // Regla: Nunca mostrar 0 salvo que el total realmente sea 0 (descuentos >= suma)
  let montoFinal = Math.round(parsearMonto(totalNeto));
  let esEstimado = false;
  let motivoEstimado = '';

  if (montoFinal === 0 && sumaSubtotales === 0 && totalHoja > 0) {
    // Si la suma de subtotales dio 0 por error pero la hoja tenía un total válido
    montoFinal = totalHoja;
    esEstimado = true;
    motivoEstimado = 'Estimado, se ajusta al pesar';
  }

  return {
    monto: montoFinal,
    total: montoFinal,
    esEstimado,
    motivoEstimado,
    estaArmado: true,
    faltaPrecio: false,
    productoSinPrecio: null,
    avisoFaltaPrecio: null,
    subtotalPesado: sumaSubtotales,
    descuentos: totalDescuentos,
    descuentosDetalle,
    items: itemsProcesados,
  };
}

/**
 * Función compartida para obtener el número de monto a cobrar.
 */
export function obtenerMontoACobrar(pedido, preparacion = null, opciones = {}) {
  const calc = calcularTotalPedido(pedido, preparacion, opciones);
  return parsearMonto(calc?.monto ?? calc?.total);
}

