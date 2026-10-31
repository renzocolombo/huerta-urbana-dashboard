import { useState, useEffect, useMemo } from 'react';
import { 
  Printer, Copy, Check, AlertCircle, AlertTriangle, 
  PackageX, ShoppingBag, Layers, HelpCircle, CheckSquare, Search, RefreshCw
} from 'lucide-react';
import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { apiGetStockKg } from '../utils/mercaderiaApi';

/**
 * Función central de cálculo de faltantes utilizada por la pantalla Faltantes y el Header (badge).
 */
export { calcularFaltantes } from '../utils/faltantesLogic.js';
import { calcularFaltantes } from '../utils/faltantesLogic.js';

const norm = (s) =>
  (s || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

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
                      {item.proximaEntregaLabel && item.pedidoPendiente > 0 && (
                        <span className="block text-[10px] text-gray-400 mt-1 font-mono">
                          Para: <span className="text-gray-300 font-bold">{item.proximaEntregaLabel}</span>
                        </span>
                      )}
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
