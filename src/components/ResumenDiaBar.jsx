import { Package, Clock, CheckCircle, AlertCircle, DollarSign, CreditCard, ChevronRight } from 'lucide-react';

const $$ = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

export default function ResumenDiaBar({ resumen, onVerPedidosDelDia, onVolverAgenda, fechaLabel, origen = 'agenda' }) {
  if (!resumen) return null;

  return (
    <div className="bg-[#111827]/90 border border-gray-800 rounded-2xl p-4 mb-5 shadow-lg">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 border-b border-gray-800/80 pb-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-300">
            Resumen del día {fechaLabel ? `· ${fechaLabel}` : ''}
          </h3>
        </div>

        {origen === 'agenda' && onVerPedidosDelDia && (
          <button
            type="button"
            onClick={onVerPedidosDelDia}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 transition-all cursor-pointer w-fit active:scale-95"
            title="Ver estos pedidos en la vista Pedidos del Día"
          >
            <span>Ver pedidos del día</span>
            <ChevronRight size={13} />
          </button>
        )}

        {origen === 'pedidos' && onVolverAgenda && (
          <button
            type="button"
            onClick={onVolverAgenda}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 transition-all cursor-pointer w-fit active:scale-95"
            title="Volver a Agenda de entregas conservando esta fecha"
          >
            <span>Volver a Agenda</span>
            <ChevronRight size={13} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
        {/* 1. Pendientes de entrega */}
        <div className="bg-black/30 border border-amber-500/20 rounded-xl p-2.5">
          <div className="flex items-center justify-between text-amber-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Pend. Entrega</span>
            <Clock size={12} />
          </div>
          <p className="text-lg font-black text-amber-300">{resumen.pendientesEntrega}</p>
        </div>

        {/* 2. Armados */}
        <div className="bg-black/30 border border-blue-500/20 rounded-xl p-2.5">
          <div className="flex items-center justify-between text-blue-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Armados</span>
            <Package size={12} />
          </div>
          <p className="text-lg font-black text-blue-300">{resumen.armados}</p>
        </div>

        {/* 3. Entregados */}
        <div className="bg-black/30 border border-emerald-500/20 rounded-xl p-2.5">
          <div className="flex items-center justify-between text-emerald-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Entregados</span>
            <CheckCircle size={12} />
          </div>
          <p className="text-lg font-black text-emerald-300">{resumen.entregados}</p>
        </div>

        {/* 4. No entregados */}
        <div className="bg-black/30 border border-rose-500/20 rounded-xl p-2.5">
          <div className="flex items-center justify-between text-rose-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">No Entregados</span>
            <AlertCircle size={12} />
          </div>
          <p className="text-lg font-black text-rose-300">{resumen.noEntregados}</p>
        </div>

        {/* 5. Pendientes de pago */}
        <div className="bg-black/30 border border-amber-500/20 rounded-xl p-2.5">
          <div className="flex items-center justify-between text-amber-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Pend. Pago</span>
            <DollarSign size={12} />
          </div>
          <p className="text-lg font-black text-amber-300">{resumen.pendientesPago}</p>
        </div>

        {/* 6. Pagados / Cobrados */}
        <div className="bg-black/30 border border-emerald-500/20 rounded-xl p-2.5">
          <div className="flex items-center justify-between text-emerald-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Pagados</span>
            <CreditCard size={12} />
          </div>
          <p className="text-lg font-black text-emerald-300">{resumen.pagadosCobrados}</p>
        </div>

        {/* 7. Total pendiente de cobro en pesos */}
        <div className="bg-black/40 border border-amber-500/40 rounded-xl p-2.5 col-span-2 sm:col-span-2 lg:col-span-1 shadow-inner">
          <div className="flex items-center justify-between text-amber-300 mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider">Total a Cobrar</span>
            <DollarSign size={12} />
          </div>
          <p className="text-lg font-black text-amber-400 truncate" title={$$(resumen.totalPendienteCobrarPesos)}>
            {$$(resumen.totalPendienteCobrarPesos)}
          </p>
        </div>
      </div>
    </div>
  );
}
