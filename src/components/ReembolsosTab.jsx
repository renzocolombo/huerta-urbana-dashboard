import React, { useState, useMemo } from 'react';
import { 
  RotateCcw, Search, X, RefreshCw, AlertCircle, Clock, 
  CheckCircle, MessageCircle, Phone, Calendar, ArrowRight, DollarSign,
  Tag, ShieldCheck
} from 'lucide-react';

const MEDIOS_REEMBOLSO_LABELS = {
  mercado_pago: 'Mercado Pago',
  transferencia: 'Transferencia',
  otro: 'Otro',
};

const getMedioLabel = (raw) => {
  if (!raw) return '-';
  const key = String(raw).toLowerCase().trim();
  return MEDIOS_REEMBOLSO_LABELS[key] || raw;
};

const formatFecha = (d) => {
  if (!d) return '-';
  try {
    const parsed = new Date(d);
    if (!isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  } catch (e) {}
  return String(d).replace('T', ' ').slice(0, 16);
};

export default function ReembolsosTab({
  reembolsos = [],
  cargando = false,
  error = null,
  onRecargar,
  onMarcarDevuelto,
}) {
  const [filtroEstado, setFiltroEstado] = useState('todos'); // 'todos' | 'pendiente' | 'devuelto'
  const [busqueda, setBusqueda] = useState('');

  // Totales
  const totales = useMemo(() => {
    let cantPendientes = 0;
    let sumaPendientes = 0;
    let cantDevueltos = 0;
    let sumaDevueltos = 0;

    for (const r of reembolsos) {
      const est = (r.estado || '').toLowerCase().trim();
      const m = Number(r.monto) || Number(r.reembolso_monto) || Number(r.total) || 0;
      if (est === 'pendiente') {
        cantPendientes++;
        sumaPendientes += m;
      } else if (est === 'devuelto') {
        cantDevueltos++;
        sumaDevueltos += m;
      }
    }

    return { cantPendientes, sumaPendientes, cantDevueltos, sumaDevueltos };
  }, [reembolsos]);

  // Lista filtrada
  const listaFiltrada = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return reembolsos.filter(r => {
      const est = (r.estado || '').toLowerCase().trim();
      if (filtroEstado === 'pendiente' && est !== 'pendiente') return false;
      if (filtroEstado === 'devuelto' && est !== 'devuelto') return false;

      if (!q) return true;
      const num = String(r.numero_pedido || r.pedido || '').toLowerCase();
      const nom = String(r.nombre || r.cliente || '').toLowerCase();
      const tel = String(r.telefono || '').toLowerCase();
      return num.includes(q) || nom.includes(q) || tel.includes(q);
    });
  }, [reembolsos, filtroEstado, busqueda]);

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* ── 1. TOTALES SUPERIORES ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Tarjeta Pendientes */}
        <div className="bg-[#111827]/80 border border-red-500/30 rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 text-xl font-bold">
              ⏳
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-red-400">
                Pendientes de Devolución
              </span>
              <div className="text-xl sm:text-2xl font-black font-mono text-white mt-0.5">
                ${totales.sumaPendientes.toLocaleString('es-AR')}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {totales.cantPendientes} {totales.cantPendientes === 1 ? 'pedido pendiente' : 'pedidos pendientes'}
              </p>
            </div>
          </div>
          {totales.cantPendientes > 0 && (
            <span className="hidden sm:inline-block px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-500/20 text-red-300 border border-red-500/40">
              A Resolver
            </span>
          )}
        </div>

        {/* Tarjeta Devueltos */}
        <div className="bg-[#111827]/80 border border-gray-700/60 rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-xl font-bold">
              ✅
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Reembolsos Devueltos
              </span>
              <div className="text-xl sm:text-2xl font-black font-mono text-white mt-0.5">
                ${totales.sumaDevueltos.toLocaleString('es-AR')}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {totales.cantDevueltos} {totales.cantDevueltos === 1 ? 'devolución registrada' : 'devoluciones registradas'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRecargar}
            disabled={cargando}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all border border-white/5 cursor-pointer disabled:opacity-40"
            title="Actualizar datos desde el servidor"
          >
            <RefreshCw size={15} className={cargando ? 'animate-spin text-indigo-400' : ''} />
          </button>
        </div>
      </div>

      {/* ── 2. BARRA DE FILTROS Y BÚSQUEDA ─────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#111827]/80 border border-white/5 p-4 rounded-2xl">
        {/* Selector de estado: Todos / Pendientes / Devueltos */}
        <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-gray-800">
          <button
            type="button"
            onClick={() => setFiltroEstado('todos')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filtroEstado === 'todos'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Todos ({reembolsos.length})
          </button>
          <button
            type="button"
            onClick={() => setFiltroEstado('pendiente')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              filtroEstado === 'pendiente'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <span>Pendientes</span>
            {totales.cantPendientes > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                filtroEstado === 'pendiente' ? 'bg-black/30 text-white' : 'bg-red-500/20 text-red-300'
              }`}>
                {totales.cantPendientes}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setFiltroEstado('devuelto')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              filtroEstado === 'devuelto'
                ? 'bg-gray-700 text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <span>Devueltos</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
              filtroEstado === 'devuelto' ? 'bg-black/30 text-white' : 'bg-white/10 text-gray-400'
            }`}>
              {totales.cantDevueltos}
            </span>
          </button>
        </div>

        {/* Buscador */}
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search size={14} className="absolute left-3 top-3 text-gray-500" />
            <input
              type="text"
              placeholder="Buscar por nro pedido, cliente o teléfono..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full bg-black/40 border border-gray-700/60 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-rose-500 transition-all font-sans"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda('')}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-white cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── 3. ESTADOS DE CARGA Y ERROR ────────────────────────────────────── */}
      {cargando && (
        <div className="bg-[#1f2937]/50 border border-gray-800 rounded-2xl p-12 text-center space-y-3">
          <div className="w-8 h-8 border-3 border-rose-500/20 border-t-rose-500 rounded-full animate-spin mx-auto" />
          <p className="text-gray-400 text-xs font-medium">Cargando registros de reembolsos...</p>
        </div>
      )}

      {error && !cargando && (
        <div className="bg-red-500/15 border border-red-500/30 rounded-2xl p-4 flex items-center justify-between gap-3 text-red-200">
          <div className="flex items-center gap-2.5">
            <AlertCircle size={18} className="text-red-400 shrink-0" />
            <span className="text-xs font-medium">{error}</span>
          </div>
          <button
            type="button"
            onClick={onRecargar}
            className="text-xs font-bold text-red-300 hover:text-white underline cursor-pointer shrink-0"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* ── 4. ESTADO VACÍO ────────────────────────────────────────────────── */}
      {!cargando && !error && reembolsos.length === 0 && (
        <div className="bg-[#1f2937] border border-gray-800 rounded-2xl p-12 text-center space-y-2">
          <RotateCcw size={32} className="text-gray-600 mx-auto mb-1" />
          <p className="text-gray-300 font-bold">Sin reembolsos registrados</p>
          <p className="text-gray-500 text-xs">
            Cuando un pedido pagado online no pueda ser entregado y se cancele, aparecerá aquí automáticamente.
          </p>
        </div>
      )}

      {!cargando && !error && reembolsos.length > 0 && listaFiltrada.length === 0 && (
        <div className="bg-[#1f2937] border border-gray-800 rounded-2xl p-10 text-center space-y-2">
          <Search size={28} className="text-gray-600 mx-auto mb-1" />
          <p className="text-gray-400 font-medium">No se encontraron reembolsos para los filtros seleccionados.</p>
          <button
            type="button"
            onClick={() => { setFiltroEstado('todos'); setBusqueda(''); }}
            className="text-xs font-bold text-rose-400 hover:text-rose-300 underline cursor-pointer"
          >
            Limpiar filtros
          </button>
        </div>
      )}

      {/* ── 5. LISTA DE REEMBOLSOS (DESKTOP: TABLA / MOBILE: TARJETAS) ───── */}
      {!cargando && !error && listaFiltrada.length > 0 && (
        <>
          {/* TABLA DESKTOP */}
          <div className="hidden md:block bg-[#111827]/60 border border-white/5 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-300">
                <thead className="bg-black/30 border-b border-white/5 text-[11px] uppercase tracking-wider text-gray-400 font-bold">
                  <tr>
                    <th className="px-4 py-3.5">Pedido / Cliente</th>
                    <th className="px-4 py-3.5">Teléfono</th>
                    <th className="px-4 py-3.5">Monto</th>
                    <th className="px-4 py-3.5">Fecha Pedido</th>
                    <th className="px-4 py-3.5">Motivo</th>
                    <th className="px-4 py-3.5">Reembolso Pend.</th>
                    <th className="px-4 py-3.5">Fecha Devuelto</th>
                    <th className="px-4 py-3.5">Medio / Ref</th>
                    <th className="px-4 py-3.5">Estado</th>
                    <th className="px-4 py-3.5 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {listaFiltrada.map((r, idx) => {
                    const est = (r.estado || '').toLowerCase().trim();
                    const esPendiente = est === 'pendiente';
                    const esDevuelto = est === 'devuelto';
                    const montoVal = Number(r.monto) || Number(r.reembolso_monto) || Number(r.total) || 0;
                    const medioLegible = getMedioLabel(r.reembolso_medio);
                    const cleanPhone = String(r.telefono || '').replace(/\D/g, '');

                    return (
                      <tr key={r.numero_pedido || idx} className="hover:bg-white/[0.02] transition-colors">
                        {/* Pedido / Cliente */}
                        <td className="px-4 py-3.5">
                          <div className="font-bold text-white">{r.nombre || 'Sin nombre'}</div>
                          <div className="font-mono text-[11px] text-gray-400">{r.numero_pedido}</div>
                        </td>

                        {/* Teléfono */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {cleanPhone ? (
                            <a
                              href={`https://web.whatsapp.com/send?phone=${cleanPhone}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-400 hover:text-emerald-300 font-mono text-xs flex items-center gap-1 underline"
                              title="Abrir chat en WhatsApp Web"
                            >
                              <MessageCircle size={12} />
                              <span>{r.telefono}</span>
                            </a>
                          ) : (
                            <span className="text-gray-500 font-mono text-xs">-</span>
                          )}
                        </td>

                        {/* Monto */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="font-black text-white font-mono text-sm">
                            ${montoVal.toLocaleString('es-AR')}
                          </span>
                        </td>

                        {/* Fecha Pedido */}
                        <td className="px-4 py-3.5 whitespace-nowrap text-gray-400 font-mono text-[11px]">
                          {formatFecha(r.fecha)}
                        </td>

                        {/* Motivo */}
                        <td className="px-4 py-3.5 text-gray-300 max-w-[160px] truncate" title={r.motivo_no_entrega || '-'}>
                          {r.motivo_no_entrega || '-'}
                        </td>

                        {/* Fecha Reembolso Pendiente */}
                        <td className="px-4 py-3.5 whitespace-nowrap text-gray-400 font-mono text-[11px]">
                          {formatFecha(r.fecha_reembolso_pendiente || r.fecha_no_entrega)}
                        </td>

                        {/* Fecha Devuelto */}
                        <td className="px-4 py-3.5 whitespace-nowrap text-gray-400 font-mono text-[11px]">
                          {formatFecha(r.fecha_reembolso)}
                        </td>

                        {/* Medio / Ref */}
                        <td className="px-4 py-3.5">
                          <div className="font-medium text-gray-200">{medioLegible}</div>
                          {r.reembolso_ref ? (
                            <div className="font-mono text-[10px] text-gray-400 truncate max-w-[140px]" title={r.reembolso_ref}>
                              Ref: {r.reembolso_ref}
                            </div>
                          ) : null}
                        </td>

                        {/* Estado */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {esPendiente ? (
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-red-500/20 text-red-300 border border-red-500/40 inline-block">
                              Pendiente
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-gray-500/20 text-gray-300 border border-gray-500/40 inline-block">
                              Devuelto
                            </span>
                          )}
                        </td>

                        {/* Acción */}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          {esPendiente ? (
                            <button
                              type="button"
                              onClick={() => onMarcarDevuelto(r)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider bg-red-600 hover:bg-red-500 text-white transition-all shadow-md active:scale-95 cursor-pointer border border-red-400/40"
                              title="Marcar devolución efectuada"
                            >
                              <span>💸</span>
                              <span>Marcar devuelto</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-gray-500 italic">Completado</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* TARJETAS MOBILE */}
          <div className="md:hidden space-y-3">
            {listaFiltrada.map((r, idx) => {
              const est = (r.estado || '').toLowerCase().trim();
              const esPendiente = est === 'pendiente';
              const montoVal = Number(r.monto) || Number(r.reembolso_monto) || Number(r.total) || 0;
              const medioLegible = getMedioLabel(r.reembolso_medio);
              const cleanPhone = String(r.telefono || '').replace(/\D/g, '');

              return (
                <div 
                  key={r.numero_pedido || idx}
                  className={`bg-[#181d24] border rounded-2xl p-4 space-y-3 shadow-md ${
                    esPendiente ? 'border-red-500/30' : 'border-gray-800'
                  }`}
                >
                  {/* Fila 1: Pedido + Estado */}
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-mono font-bold text-gray-400">{r.numero_pedido}</span>
                      <h4 className="font-bold text-white text-sm">{r.nombre || 'Sin nombre'}</h4>
                    </div>
                    {esPendiente ? (
                      <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-red-500/20 text-red-300 border border-red-500/40">
                        Pendiente
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-gray-500/20 text-gray-300 border border-gray-500/40">
                        Devuelto
                      </span>
                    )}
                  </div>

                  {/* Fila 2: Monto y Teléfono */}
                  <div className="flex items-center justify-between bg-black/40 rounded-xl p-3 border border-white/5">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-500">Monto</span>
                      <div className="text-base font-black font-mono text-white mt-0.5">
                        ${montoVal.toLocaleString('es-AR')}
                      </div>
                    </div>
                    {cleanPhone && (
                      <a
                        href={`https://web.whatsapp.com/send?phone=${cleanPhone}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-400 hover:text-emerald-300 text-xs font-mono flex items-center gap-1.5 underline"
                      >
                        <MessageCircle size={14} />
                        <span>{r.telefono}</span>
                      </a>
                    )}
                  </div>

                  {/* Fila 3: Detalles */}
                  <div className="text-xs space-y-1.5 text-gray-400 pt-1">
                    {r.motivo_no_entrega && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Motivo:</span>
                        <span className="text-gray-200 font-medium">{r.motivo_no_entrega}</span>
                      </div>
                    )}
                    {r.fecha && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Fecha Pedido:</span>
                        <span className="font-mono text-gray-300">{formatFecha(r.fecha)}</span>
                      </div>
                    )}
                    {r.fecha_reembolso_pendiente && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Pendiente desde:</span>
                        <span className="font-mono text-gray-300">{formatFecha(r.fecha_reembolso_pendiente)}</span>
                      </div>
                    )}
                    {r.fecha_reembolso && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Devuelto el:</span>
                        <span className="font-mono text-gray-300">{formatFecha(r.fecha_reembolso)}</span>
                      </div>
                    )}
                    {r.reembolso_medio && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Medio:</span>
                        <span className="text-gray-200 font-bold">{medioLegible}</span>
                      </div>
                    )}
                    {r.reembolso_ref && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Referencia:</span>
                        <span className="font-mono text-gray-300">{r.reembolso_ref}</span>
                      </div>
                    )}
                  </div>

                  {/* Fila 4: Botón marcar devuelto si está pendiente */}
                  {esPendiente && (
                    <button
                      type="button"
                      onClick={() => onMarcarDevuelto(r)}
                      className="w-full mt-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 bg-red-600 hover:bg-red-500 text-white cursor-pointer shadow-red-950/40 border border-red-400/40"
                    >
                      <span>💸</span>
                      <span>Marcar reembolso devuelto</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
