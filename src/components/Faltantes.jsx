import { useState, useEffect, useMemo } from 'react';
import { 
  Printer, Copy, Check, AlertCircle, AlertTriangle, 
  PackageX, ShoppingBag, Layers, HelpCircle, CheckSquare, Search, RefreshCw
} from 'lucide-react';
import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { parsearProductosPedido } from '../utils/remitoPrinter';
import { getTipoByNombre, getCategoriaPrincipal } from '../data/productUtils';
import { apiGetStockKg } from '../utils/mercaderiaApi';

const norm = (s) =>
  (s || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * Función central de cálculo de faltantes utilizada por la pantalla Faltantes y el Header (badge).
 */
export function calcularFaltantes(stockData, productosCostos, pedidos, stockKgList = null) {
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
      stock_unidades: c.stock_unidades || 0,
      stock_500g: 0,
      stock_1kg: 0,
      original_load_500g: null,
      original_load_1kg: null,
      fila: c.fila
    });
  });

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
      stock_unidades: s.stock_unidades !== undefined ? s.stock_unidades : (s.stock?.unidades ?? existing.stock_unidades ?? 0),
      stock_500g: s.stock_500g !== undefined ? s.stock_500g : (s.stock?.['500g'] ?? existing.stock_500g ?? 0),
      stock_1kg: s.stock_1kg !== undefined ? s.stock_1kg : (s.stock?.['1kg'] ?? existing.stock_1kg ?? 0),
      original_load_500g: s.original_load_500g !== undefined ? s.original_load_500g : (s.originalLoad?.['500g'] ?? null),
      original_load_1kg: s.original_load_1kg !== undefined ? s.original_load_1kg : (s.originalLoad?.['1kg'] ?? null),
      fila: s.fila || existing.fila
    });
  });

  // 2. Filtrar pedidos aprobados no entregados y sin motivo de no entrega (sin filtrar por día)
  const pedidosAprobados = (pedidos || []).filter((p) => {
    const pago = String(p.estado_pago || '').toLowerCase().trim();
    const estado = String(p.estado || '').toLowerCase().trim();
    const tieneMotivo = Boolean(p.motivo_no_entrega);
    return (
      (pago === 'approved' || pago === 'aprobado' || pago === 'pagado') &&
      estado !== 'entregado' &&
      !tieneMotivo
    );
  });

  // 3. Mapear demanda solicitada por producto
  const demandaPorProdKey = new Map();
  const sinIdentificar = [];

  pedidosAprobados.forEach((p) => {
    const items = parsearProductosPedido(p.producto, p.cantidades);
    items.forEach((item) => {
      const itemKey = norm(item.nombre);
      // Buscar en el catálogo
      let matchKey = null;
      if (catalogMap.has(itemKey)) {
        matchKey = itemKey;
      } else {
        // Intento de match parcial
        for (const k of catalogMap.keys()) {
          if (k.includes(itemKey) || itemKey.includes(k)) {
            matchKey = k;
            break;
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

    if (stockKgList) {
      // Fuente oficial getStockKg (en_deposito), comparando por nombre normalizado. Si no está, stock 0.
      stockActual = Number(p.en_deposito || 0);
      unidadLabel = p.unidad || (esUnidad ? (p.unidad?.includes('maple') ? 'maples' : 'uds') : 'kg');
    } else {
      // Cálculo previo legacy (ControlStock: bolsas 500g/1kg y stock_unidades)
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

    // a) SIN STOCK: stock total = 0
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

      faltantes.push({
        id: p.id || k,
        nombre: p.nombre,
        categoria: cat,
        estado,
        prioridad,
        stockActual,
        pedidoPendiente,
        comprarSugerido,
        unidad: unidadLabel
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

export default function Faltantes() {
  const { stockData, productosCostos, pedidos } = useGoogleSheets();
  const [copiado, setCopiado] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('Todos');
  const [stockKgList, setStockKgList] = useState(null);
  const [cargandoStockKg, setCargandoStockKg] = useState(false);

  const cargarStockKg = async () => {
    setCargandoStockKg(true);
    try {
      const res = await apiGetStockKg();
      if (res && res.ok && Array.isArray(res.productos)) {
        setStockKgList(res.productos);
      }
    } catch (e) {
      console.warn('Error al obtener getStockKg para faltantes:', e);
    } finally {
      setCargandoStockKg(false);
    }
  };

  useEffect(() => {
    cargarStockKg();
  }, []);

  const { faltantes, sinIdentificar } = useMemo(() => {
    return calcularFaltantes(stockData, productosCostos, pedidos, stockKgList);
  }, [stockData, productosCostos, pedidos, stockKgList]);

  const filtrados = useMemo(() => {
    return faltantes.filter((item) => {
      if (filtroEstado !== 'Todos' && item.estado !== filtroEstado) return false;
      if (busqueda.trim() && !norm(item.nombre).includes(norm(busqueda))) return false;
      return true;
    });
  }, [faltantes, filtroEstado, busqueda]);

  const conteos = useMemo(() => {
    return {
      total: faltantes.length,
      sinStock: faltantes.filter((f) => f.estado === 'Sin stock').length,
      faltaPedidos: faltantes.filter((f) => f.estado === 'Falta para pedidos').length,
      stockBajo: faltantes.filter((f) => f.estado === 'Stock bajo').length
    };
  }, [faltantes]);

  // Copiar para WhatsApp
  const handleCopiarWhatsApp = () => {
    const fechaHora = new Date().toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const sinStockList = faltantes.filter((f) => f.estado === 'Sin stock');
    const faltaPedidosList = faltantes.filter((f) => f.estado === 'Falta para pedidos');
    const stockBajoList = faltantes.filter((f) => f.estado === 'Stock bajo');

    let texto = `*LISTA DE COMPRAS / FALTANTES — HUERTA URBANA*\n`;
    texto += `Fecha: ${fechaHora}\n\n`;

    if (sinStockList.length > 0) {
      texto += `*🚫 SIN STOCK (${sinStockList.length}):*\n`;
      sinStockList.forEach((item) => {
        const pedStr = item.pedidoPendiente > 0 ? ` (pedidos: ${item.pedidoPendiente} ${item.unidad})` : '';
        texto += `• ${item.nombre}: comprar ${item.comprarSugerido} ${item.unidad}${pedStr}\n`;
      });
      texto += `\n`;
    }

    if (faltaPedidosList.length > 0) {
      texto += `*⚠️ FALTA PARA PEDIDOS (${faltaPedidosList.length}):*\n`;
      faltaPedidosList.forEach((item) => {
        texto += `• ${item.nombre}: comprar ${item.comprarSugerido} ${item.unidad} (stock: ${item.stockActual}, pedidos: ${item.pedidoPendiente})\n`;
      });
      texto += `\n`;
    }

    if (stockBajoList.length > 0) {
      texto += `*🟡 STOCK BAJO (${stockBajoList.length}):*\n`;
      stockBajoList.forEach((item) => {
        texto += `• ${item.nombre}: comprar ${item.comprarSugerido} ${item.unidad} (queda: ${item.stockActual} ${item.unidad})\n`;
      });
      texto += `\n`;
    }

    if (sinIdentificar.length > 0) {
      texto += `*❓ ÍTEMS SIN IDENTIFICAR (${sinIdentificar.length}):*\n`;
      sinIdentificar.forEach((item) => {
        texto += `• ${item.nombre} (cant: ${item.cantidad}, pedido ${item.pedido})\n`;
      });
    }

    navigator.clipboard.writeText(texto.trim()).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    });
  };

  const handleImprimir = () => {
    window.print();
  };

  const fechaActualStr = new Date().toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className="space-y-6">
      {/* ── Encabezado y Acciones (ocultos al imprimir) ───────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-800 no-print">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <span className="p-2 rounded-xl bg-red-500/15 text-red-400 border border-red-500/30">
                <PackageX size={22} />
              </span>
              Faltantes y Reposición
            </h1>
            {conteos.total > 0 && (
              <span className="px-2.5 py-1 rounded-full text-xs font-black bg-red-500 text-white shadow-lg shadow-red-500/30 animate-pulse">
                {conteos.total} {conteos.total === 1 ? 'producto' : 'productos'}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Productos sin stock, con faltante para pedidos aprobados o por debajo del 50% de carga.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handleCopiarWhatsApp}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-md shadow-emerald-950/30 active:scale-95 cursor-pointer"
            title="Copia el listado ordenado para enviarlo por WhatsApp"
          >
            {copiado ? <Check size={16} className="text-emerald-200" /> : <Copy size={16} />}
            <span>{copiado ? '¡Copiado para WhatsApp!' : 'Copiar para WhatsApp'}</span>
          </button>

          <button
            onClick={handleImprimir}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all shadow-md shadow-indigo-950/30 active:scale-95 cursor-pointer"
            title="Abre la vista de impresión en formato A4 con casillas para tildar"
          >
            <Printer size={16} />
            <span>Imprimir planilla (A4)</span>
          </button>

          <button
            onClick={cargarStockKg}
            disabled={cargandoStockKg}
            className="p-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-all cursor-pointer"
            title="Refrescar stock en depósito (getStockKg)"
          >
            <RefreshCw size={16} className={cargandoStockKg ? 'animate-spin text-green-400' : ''} />
          </button>
        </div>
      </div>

      {/* ── KPIs / Filtros rápidos (ocultos al imprimir) ──────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 no-print">
        <button
          onClick={() => setFiltroEstado('Todos')}
          className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
            filtroEstado === 'Todos'
              ? 'bg-gray-800 border-white/20 ring-1 ring-white/20'
              : 'bg-[#181818] border-gray-800 hover:border-gray-700'
          }`}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Total Faltantes</p>
          <p className="text-2xl font-black text-white mt-1">{conteos.total}</p>
        </button>

        <button
          onClick={() => setFiltroEstado('Sin stock')}
          className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
            filtroEstado === 'Sin stock'
              ? 'bg-red-500/20 border-red-500/50 ring-1 ring-red-500/30'
              : 'bg-[#181818] border-gray-800 hover:border-red-500/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-red-400">Sin Stock</p>
            <span className="w-2 h-2 rounded-full bg-red-500" />
          </div>
          <p className="text-2xl font-black text-red-400 mt-1">{conteos.sinStock}</p>
        </button>

        <button
          onClick={() => setFiltroEstado('Falta para pedidos')}
          className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
            filtroEstado === 'Falta para pedidos'
              ? 'bg-amber-500/20 border-amber-500/50 ring-1 ring-amber-500/30'
              : 'bg-[#181818] border-gray-800 hover:border-amber-500/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Falta p/ Pedidos</p>
            <span className="w-2 h-2 rounded-full bg-amber-500" />
          </div>
          <p className="text-2xl font-black text-amber-400 mt-1">{conteos.faltaPedidos}</p>
        </button>

        <button
          onClick={() => setFiltroEstado('Stock bajo')}
          className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
            filtroEstado === 'Stock bajo'
              ? 'bg-yellow-500/20 border-yellow-500/50 ring-1 ring-yellow-500/30'
              : 'bg-[#181818] border-gray-800 hover:border-yellow-500/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-yellow-400">Stock Bajo (&le;50%)</p>
            <span className="w-2 h-2 rounded-full bg-yellow-500" />
          </div>
          <p className="text-2xl font-black text-yellow-400 mt-1">{conteos.stockBajo}</p>
        </button>
      </div>

      {/* ── Buscador (oculto al imprimir) ────────────────────────────────────── */}
      <div className="relative max-w-md no-print">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar producto..."
          className="w-full bg-[#181818] border border-gray-800 text-white text-xs rounded-xl pl-10 pr-4 py-2.5 outline-none focus:border-green-500 transition-all placeholder:text-gray-600"
        />
      </div>

      {/* ── Encabezado visible SOLO en modo impresión ────────────────────────── */}
      <div className="only-print mb-6">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid black', paddingBottom: '8px', marginBottom: '12px' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: '900', margin: 0, textTransform: 'uppercase' }}>
              Huerta Urbana — Planilla de Compras y Faltantes
            </h1>
            <p style={{ fontSize: '11px', margin: '3px 0 0 0', color: '#333' }}>
              Generado: {fechaActualStr} · Total de ítems a comprar: {faltantes.length}
            </p>
          </div>
          <div style={{ textAlign: 'right', fontSize: '10px', color: '#444' }}>
            <span>[ ] Tildar al comprar</span>
          </div>
        </div>
      </div>

      {/* ── TABLA PRINCIPAL DE FALTANTES ─────────────────────────────────────── */}
      <div className="bg-[#181818] border border-gray-800 rounded-2xl overflow-hidden print-table-container">
        {filtrados.length === 0 ? (
          <div className="py-12 text-center text-gray-500">
            <CheckSquare size={36} className="mx-auto mb-2 text-green-500 opacity-60" />
            <p className="text-sm font-bold text-gray-300">¡Todo en orden!</p>
            <p className="text-xs text-gray-500 mt-1">No hay productos que cumplan el criterio seleccionado.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse tabla-faltantes">
            <thead>
              <tr className="border-b border-gray-800 text-[10px] font-black uppercase text-gray-400 bg-white/[0.02]">
                <th className="py-3 px-4 w-10 text-center">Tildar</th>
                <th className="py-3 px-4">Producto</th>
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-4 text-right">Stock Actual</th>
                <th className="py-3 px-4 text-right">Pedido Pendiente</th>
                <th className="py-3 px-4 text-right font-black text-white">Comprar Sugerido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60 text-xs">
              {filtrados.map((item) => {
                const configEstado = {
                  'Sin stock': {
                    badge: 'bg-red-500/15 text-red-400 border-red-500/30',
                    dot: 'bg-red-500'
                  },
                  'Falta para pedidos': {
                    badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
                    dot: 'bg-amber-500'
                  },
                  'Stock bajo': {
                    badge: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
                    dot: 'bg-yellow-500'
                  }
                }[item.estado] || {
                  badge: 'bg-gray-800 text-gray-400 border-gray-700',
                  dot: 'bg-gray-500'
                };

                return (
                  <tr key={item.id} className="hover:bg-white/[0.02] transition-colors fila-producto">
                    <td className="py-3 px-4 text-center">
                      <div className="w-4 h-4 mx-auto border-2 border-gray-600 rounded flex items-center justify-center checkbox-print" />
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-bold text-white text-sm">{item.nombre}</p>
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider">{item.categoria}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${configEstado.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${configEstado.dot}`} />
                        {item.estado}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-gray-300">
                      {item.stockActual} {item.unidad}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      {item.pedidoPendiente > 0 ? (
                        <span className="text-amber-400 font-bold">
                          {item.pedidoPendiente} {item.unidad}
                        </span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-black text-sm text-green-400 bg-green-500/5">
                      {item.comprarSugerido} {item.unidad}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── SECCIÓN: ÍTEMS DE PEDIDOS SIN IDENTIFICAR ───────────────────────── */}
      {sinIdentificar.length > 0 && (
        <div className="bg-[#181818] border border-amber-500/30 rounded-2xl p-5 space-y-3 print-break-inside-avoid">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
            <HelpCircle size={18} />
            <h2>Ítems de Pedidos sin Identificar en el Catálogo ({sinIdentificar.length})</h2>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Estos productos fueron cargados en pedidos aprobados pero su nombre no coincide de forma exacta con ningún producto del inventario. Revisalos a mano para incluirlos en las compras:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-800 text-[10px] font-black uppercase text-gray-500">
                  <th className="py-2 px-3">Ítem Pedido</th>
                  <th className="py-2 px-3 text-right">Cantidad</th>
                  <th className="py-2 px-3">Pedido</th>
                  <th className="py-2 px-3">Cliente</th>
                  <th className="py-2 px-3">Día Entrega</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {sinIdentificar.map((item, idx) => (
                  <tr key={idx} className="hover:bg-white/[0.02]">
                    <td className="py-2 px-3 font-bold text-amber-300">{item.nombre}</td>
                    <td className="py-2 px-3 text-right font-mono text-white">{item.cantidad}</td>
                    <td className="py-2 px-3 font-mono text-gray-400">{item.pedido}</td>
                    <td className="py-2 px-3 text-gray-300">{item.cliente}</td>
                    <td className="py-2 px-3 text-gray-400">{item.diaEntrega || item.fecha || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Estilos CSS de Impresión ────────────────────────────────────────── */}
      <style>{`
        .only-print {
          display: none;
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm;
          }

          body {
            background: white !important;
            color: black !important;
            font-size: 10pt !important;
          }

          /* Ocultar elementos de navegación y botones */
          header,
          nav,
          aside,
          button,
          .no-print {
            display: none !important;
          }

          .only-print {
            display: block !important;
          }

          .print-table-container {
            background: white !important;
            border: 1px solid #000 !important;
            border-radius: 0 !important;
          }

          .tabla-faltantes {
            width: 100% !important;
            color: black !important;
          }

          .tabla-faltantes th {
            background: #f0f0f0 !important;
            color: black !important;
            border-bottom: 2px solid #000 !important;
            font-size: 8pt !important;
            padding: 6px !important;
          }

          .tabla-faltantes td {
            border-bottom: 1px solid #ccc !important;
            color: black !important;
            font-size: 9pt !important;
            padding: 5px 6px !important;
          }

          .fila-producto {
            page-break-inside: avoid;
          }

          .checkbox-print {
            width: 12px !important;
            height: 12px !important;
            border: 1.5px solid #000 !important;
            background: white !important;
          }

          .print-break-inside-avoid {
            page-break-inside: avoid;
            background: white !important;
            color: black !important;
            border: 1px solid #000 !important;
          }
        }
      `}</style>
    </div>
  );
}
