import React, { useState, useEffect } from 'react';
import { X, AlertCircle, DollarSign, ArrowRight, ShieldCheck } from 'lucide-react';

/**
 * Modal para registrar la devolución de un reembolso.
 * Exige seleccionar un medio (sin valor por defecto), y permite ingresar referencia y nota opcional.
 */
export default function ModalReembolsoDevuelto({
  abierto,
  pedido,
  onCerrar,
  onConfirmar,
  guardando = false,
  error = null,
}) {
  const [medio, setMedio] = useState('');
  const [referencia, setReferencia] = useState('');
  const [nota, setNota] = useState('');

  // Resetear formulario cada vez que se abre con un pedido nuevo
  useEffect(() => {
    if (abierto) {
      setMedio('');
      setReferencia('');
      setNota('');
    }
  }, [abierto, pedido]);

  if (!abierto || !pedido) return null;

  const numPedido = pedido.numero_pedido || pedido.pedido || '-';
  const clienteNombre = pedido.nombre || pedido.cliente || 'Cliente';
  const telefono = pedido.telefono || '';
  const monto = pedido._montoReembolso != null
    ? Number(pedido._montoReembolso)
    : (pedido.reembolso_monto != null
        ? Number(pedido.reembolso_monto)
        : (pedido.monto != null ? Number(pedido.monto) : Math.round(Number(pedido.total) || 0)));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!medio || guardando) return;
    onConfirmar({ medio, referencia: referencia.trim(), nota: nota.trim() });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-[#181d24] border border-gray-700/80 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5"
        role="dialog"
        aria-modal="true"
      >
        {/* Cabecera del modal */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 text-xl font-bold shadow-sm">
              💸
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Registrar Devolución de Reembolso</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Pedido <span className="font-mono font-bold text-gray-200">{numPedido}</span> · {clienteNombre}
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-30"
            title="Cerrar ventana"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tarjeta de información del pedido y monto */}
        <div className="bg-black/40 border border-white/5 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Cliente & Contacto</span>
            <div className="font-bold text-white text-sm mt-0.5">{clienteNombre}</div>
            {telefono && (
              <div className="text-xs text-gray-400 font-mono mt-0.5">Tel: {telefono}</div>
            )}
          </div>
          <div className="text-right">
            <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">Monto a Devolver</span>
            <div className="text-xl font-black font-mono text-white mt-0.5">
              ${monto.toLocaleString('es-AR')}
            </div>
          </div>
        </div>

        {/* Alerta de error si ocurrió alguno */}
        {error && (
          <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 text-xs flex items-start gap-2.5 animate-in fade-in">
            <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{error}</div>
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Selector de medio (OBLIGATORIO, SIN DEFAULT) */}
          <div>
            <label className="block text-xs font-bold text-gray-200 uppercase tracking-wider mb-1.5">
              Medio de Devolución <span className="text-red-400">*</span>
            </label>
            <select
              value={medio}
              onChange={(e) => setMedio(e.target.value)}
              disabled={guardando}
              className="w-full bg-[#111827] border border-gray-700 focus:border-red-500 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none transition-colors cursor-pointer disabled:opacity-50"
            >
              <option value="">-- Seleccioná un medio de devolución --</option>
              <option value="mercado_pago">Mercado Pago</option>
              <option value="transferencia">Transferencia bancaria</option>
              <option value="otro">Otro</option>
            </select>
            {!medio && (
              <p className="text-[11px] text-amber-400/90 mt-1">
                ⚠️ Es obligatorio seleccionar el medio con el que devolviste el dinero.
              </p>
            )}
          </div>

          {/* Referencia o N° de operación (Opcional, pero recomendado) */}
          <div>
            <label className="block text-xs font-bold text-gray-200 uppercase tracking-wider mb-1">
              Referencia / N° de Operación
            </label>
            <input
              type="text"
              placeholder="Ej: 1234567890 o nro. de comprobante"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              disabled={guardando}
              className="w-full bg-[#111827] border border-gray-700 focus:border-red-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 outline-none transition-colors disabled:opacity-50 font-mono"
            />
            <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
              <ShieldCheck size={12} className="text-indigo-400 inline" />
              <span>Recomendado para reclamos (nro. de transacción o transferencia).</span>
            </p>
          </div>

          {/* Nota opcional */}
          <div>
            <label className="block text-xs font-bold text-gray-200 uppercase tracking-wider mb-1">
              Nota interna (opcional)
            </label>
            <textarea
              rows={2}
              placeholder="Observación o motivo particular..."
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              disabled={guardando}
              className="w-full bg-[#111827] border border-gray-700 focus:border-red-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-gray-500 outline-none transition-colors disabled:opacity-50 resize-none"
            />
          </div>

          {/* Botones de acción */}
          <div className="flex items-center gap-3 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onCerrar}
              disabled={guardando}
              className="flex-1 py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-30"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!medio || guardando}
              className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 ${
                !medio || guardando
                  ? 'bg-gray-800 text-gray-500 border border-gray-700/50 cursor-not-allowed opacity-60'
                  : 'bg-red-600 hover:bg-red-500 text-white cursor-pointer shadow-red-950/40 border border-red-400/40'
              }`}
            >
              {guardando ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span>Registrando...</span>
                </>
              ) : (
                <>
                  <span>Confirmar devolución</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
