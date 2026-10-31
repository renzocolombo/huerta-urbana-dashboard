import React, { useMemo } from 'react';
import { 
  Package, Clock, Calendar, CheckCircle, AlertCircle, 
  ChevronRight, Play, Eye, RotateCcw, MapPin, CreditCard, DollarSign
} from 'lucide-react';
import { extraerHoraIngreso } from '../utils/fechasEntrega';
import { resolverEntrega } from '../utils/agendaCalendario';
import { turnoDePedido } from '../utils/entregaCalendario';
import { parsearProductosPedido, estaPedidoArmado } from '../utils/remitoPrinter';
import { calcularTotalPedido } from '../utils/totalesPedido';
import { estadoEntregaPedido, estadoPagoPedido } from '../utils/estadosPedido';

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function formatearEntregaLegible(pedido) {
  // Si dia_entrega ya tiene un texto completo legible ej "Lunes 02/11/2026 Tarde"
  const rawDia = (pedido.dia_entrega || '').trim();
  const turno = turnoDePedido(pedido);

  // Intentar resolver YMD
  const res = resolverEntrega(pedido);
  if (res && res.ymd && res.ymd.includes('-')) {
    const [y, m, d] = res.ymd.split('-');
    const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
    const diaNom = DIAS_SEMANA[dateObj.getDay()] || '';
    const turnoLabel = turno !== 'Sin turno' ? ` · ${turno}` : (res.bloque ? ` · ${res.bloque}` : '');
    return `${diaNom} ${d}/${m}${turnoLabel}`;
  }

  if (rawDia) {
    return rawDia;
  }

  return turno !== 'Sin turno' ? `Turno ${turno}` : 'Sin fecha definida';
}

export default function TarjetaPedido({
  pedido,
  preparacion,
  onArmar,
  onImprimirRemito,
  onAbrirDetalle,
  children, // contenido adicional como acordeón de la agenda
  _expandido = false,
  className = ''
}) {
  const p = pedido;
  const prep = preparacion;

  const numPedido = p.numero_pedido || (p.sheetRowIndex ? `#${p.sheetRowIndex}` : 'Pedido');
  const nombreCliente = p.nombre || 'Cliente';
  const horaIngreso = extraerHoraIngreso(p.fecha);

  // Total y cálculo si es estimado
  const { total, esEstimado } = useMemo(() => {
    return calcularTotalPedido(p, prep);
  }, [p, prep]);

  // Estados visuales normalizados
  const estEntrega = estadoEntregaPedido(p, prep);
  const estPago = estadoPagoPedido(p);

  // Texto "Para: Lunes 02/11 · Tarde"
  const textoParaEntrega = useMemo(() => formatearEntregaLegible(p), [p]);

  // Resumen corto de productos
  const resumenProductos = useMemo(() => {
    if (!p.producto) return 'Sin productos listados';
    const items = parsearProductosPedido(p.producto, p.cantidades);
    if (!items || items.length === 0) return p.producto;

    const itemsStr = items.slice(0, 3).map(it => {
      const cant = it.cantidad ? `${it.cantidad}x ` : '';
      return `${cant}${it.nombre}`;
    }).join(' · ');

    const resto = items.length - 3;
    return resto > 0 ? `${itemsStr} · +${resto} más` : itemsStr;
  }, [p.producto, p.cantidades]);

  // Determinar estado de armado
  const armado = estaPedidoArmado(p, prep);
  const enPreparacion = Boolean(prep && !armado && (prep.items?.length > 0 || prep.fechaInicio));

  const esCancelado = estEntrega.estado === 'cancelado' || estEntrega.clave === 'cancelado';
  const esEntregado = estEntrega.estado === 'entregado' || estEntrega.clave === 'entregado';
  const puedeArmarse = !esCancelado && !esEntregado;

  // Botón dinámico de armado
  let botonArmar = null;
  if (puedeArmarse && onArmar) {
    if (armado) {
      botonArmar = (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onArmar(p);
          }}
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 hover:text-white font-extrabold text-xs uppercase tracking-wider transition-all shadow-md active:scale-95 cursor-pointer"
          title="Ver o modificar el armado del pedido"
        >
          <Eye size={16} className="text-cyan-400" />
          <span>Ver armado</span>
        </button>
      );
    } else if (enPreparacion) {
      botonArmar = (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onArmar(p);
          }}
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-900/40 border border-amber-400/40 active:scale-95 cursor-pointer animate-pulse"
          title="Continuar pesaje y escaneo del pedido"
        >
          <Play size={16} fill="currentColor" />
          <span>Continuar armado</span>
        </button>
      );
    } else {
      botonArmar = (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onArmar(p);
          }}
          className="flex-1 sm:flex-none flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-emerald-950/40 border border-emerald-400/30 active:scale-95 cursor-pointer"
          title="Iniciar pesaje, balanza y armado del pedido"
        >
          <Package size={17} />
          <span>Armar pedido</span>
        </button>
      );
    }
  }

  return (
    <div 
      className={`bg-[#141b26] border border-white/10 hover:border-white/20 rounded-2xl p-4 sm:p-5 shadow-lg transition-all ${className}`}
      onClick={onAbrirDetalle ? () => onAbrirDetalle(p) : undefined}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Lado izquierdo: Datos del pedido y entrega */}
        <div className="space-y-2.5 flex-1 min-w-0">
          {/* Fila 1: Número, Cliente, Hora y Badges */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-mono font-black text-sm text-green-400 bg-green-950/60 border border-green-500/30 px-2.5 py-0.5 rounded-lg shadow-inner">
              {numPedido}
            </span>
            <h3 className="font-bold text-white text-base truncate max-w-[220px] sm:max-w-[320px]">
              {nombreCliente}
            </h3>

            {horaIngreso && (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-gray-400 bg-black/40 border border-white/5 px-2 py-0.5 rounded-lg" title="Hora de ingreso del pedido">
                <Clock size={12} className="text-gray-400" />
                {horaIngreso} hs
              </span>
            )}

            {/* Badges de Estado de Entrega y Pago */}
            <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-lg border shadow-sm ${estEntrega.color}`}>
              {estEntrega.label}
            </span>
            <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-lg border shadow-sm ${estPago.color}`}>
              {estPago.label}
            </span>
          </div>

          {/* Fila 2: Destacado claro "Para: Lunes 02/11 · Tarde" */}
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-200 text-xs font-black shadow-sm">
              <Calendar size={14} className="text-indigo-400 shrink-0" />
              <span>Para: <span className="text-white font-extrabold">{textoParaEntrega}</span></span>
            </div>
            {p.localidad && (
              <span className="text-xs text-gray-400 flex items-center gap-1 font-medium truncate">
                <MapPin size={12} className="text-gray-500 shrink-0" />
                {p.localidad}
              </span>
            )}
          </div>

          {/* Fila 3: Resumen corto de productos */}
          <p className="text-xs text-gray-300 font-medium truncate max-w-2xl" title={p.producto}>
            <span className="text-gray-500 font-bold uppercase text-[10px] tracking-wider mr-1.5">Items:</span>
            {resumenProductos}
          </p>
        </div>

        {/* Lado derecho: Monto Total y Botón Prominente de Armado */}
        <div className="flex items-center justify-between lg:justify-end gap-3.5 pt-2 lg:pt-0 border-t lg:border-t-0 border-white/5 shrink-0">
          <div className="text-left lg:text-right">
            <div className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">
              {esEstimado ? 'Total estimado' : 'Total real'}
            </div>
            <div className="text-xl sm:text-2xl font-black text-white tracking-tight">
              ${Number(total || 0).toLocaleString('es-AR')}
            </div>
          </div>

          {/* Botón Armar pedido / Continuar / Ver */}
          <div className="flex items-center gap-2">
            {botonArmar}
            {onImprimirRemito && armado && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onImprimirRemito(p);
                }}
                className="p-3 rounded-xl bg-[#1f2937] hover:bg-gray-700 border border-gray-600 text-gray-300 hover:text-white transition-all cursor-pointer"
                title="Imprimir remito del pedido"
              >
                <Package size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Contenido adicional opcional (acordeón para detalles/dirección/etc.) */}
      {children}
    </div>
  );
}
