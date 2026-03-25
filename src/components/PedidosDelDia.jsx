import { useState, useMemo } from 'react';
import { MessageCircle, AlertCircle, CheckCircle, Clock, Truck, Package, Eye, X, MapPin, Calendar, CreditCard, User, FileText } from 'lucide-react';
import { PEDIDOS, HOY } from '../data/mockData';

const $$ = (n) => `$${Number(n).toLocaleString('es-AR')}`;

const ESTADO_CONFIG = {
  pendiente:      { label: 'Pendiente',      color: 'bg-red-500/15 text-red-400 border-red-500/30',    dot: 'bg-red-500' },
  en_preparacion: { label: 'En preparación', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', dot: 'bg-amber-500' },
  listo:          { label: 'Listo',          color: 'bg-blue-500/15 text-blue-400 border-blue-500/30',  dot: 'bg-blue-500' },
  entregado:      { label: 'Entregado',      color: 'bg-green-500/15 text-green-400 border-green-500/30', dot: 'bg-green-500' },
};

const PAGO_CONFIG = {
  pagado:   { label: 'Pagado',    color: 'text-green-400' },
  pendiente: { label: 'Pendiente', color: 'text-red-400' },
  sin_pago:  { label: 'Sin pago',  color: 'text-gray-500' },
};

function Badge({ config }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${config.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

export default function PedidosDelDia() {
  const pedidosHoy = useMemo(() =>
    PEDIDOS.filter(p => p.fecha === HOY).sort((a, b) => (a.estado === 'pendiente' ? -1 : 1)),
  []);

  const [estados, setEstados] = useState(() => {
    const map = {};
    pedidosHoy.forEach(p => { map[p.numero_pedido] = p.estado; });
    return map;
  });

  const actualizarEstado = (numero, nuevoEstado) => {
    setEstados(prev => ({ ...prev, [numero]: nuevoEstado }));
  };

  const abrirWhatsApp = (telefono, nombre, producto) => {
    const msg = encodeURIComponent(`Hola ${nombre.split(' ')[0]}! 🥦 Te avisamos que tu pedido de *${producto}* de Huerta Urbana está listo para entrega. ¡Gracias por elegirnos!`);
    window.open(`https://wa.me/${telefono.replace(/\D/g, '')}?text=${msg}`, '_blank');
  };

  const pendientesLargo = pedidosHoy.filter(p =>
    estados[p.numero_pedido] === 'pendiente' && p.horas_atras >= 2
  );

  const [pedidoSeleccionado, setPedidoSeleccionado] = useState(null);

  const cambiarEstadoModal = (nuevoEstado) => {
    if (!pedidoSeleccionado) return;
    actualizarEstado(pedidoSeleccionado.numero_pedido, nuevoEstado);
    // Mock webhook / Google sheet
    console.log(`[Google Sheets API] Subiendo a Sheet Columna M... Pedido: ${pedidoSeleccionado.numero_pedido} | Estado: ${nuevoEstado}`);
    setPedidoSeleccionado(prev => ({ ...prev, estado: nuevoEstado }));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Pedidos del día</h2>
          <p className="text-gray-500 text-sm mt-1">{pedidosHoy.length} pedidos · {HOY}</p>
        </div>
        <div className="flex items-center gap-2 text-sm font-semibold text-white bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-2">
          <Package size={15} className="text-green-400" />
          {pedidosHoy.length} pedidos
        </div>
      </div>

      {/* Alerta pendientes hace más de 2 horas */}
      {pendientesLargo.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-4 flex items-center gap-3 fade-in">
          <AlertCircle size={16} className="text-red-400 shrink-0" />
          <p className="text-sm text-red-300">
            <strong>{pendientesLargo.length} pedido(s)</strong> pendiente(s) hace más de 2 horas: {pendientesLargo.map(p => p.nombre.split(' ')[0]).join(', ')}
          </p>
        </div>
      )}

      {/* Tabla / cards */}
      <div className="bg-[#1f2937] border border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['#','Nombre','Localidad','Producto','Total','Estado','Pago','Acciones'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pedidosHoy.map((p) => {
                const estadoActual = estados[p.numero_pedido];
                const esPendLargo = estadoActual === 'pendiente' && p.horas_atras >= 2;
                return (
                  <tr
                    key={p.numero_pedido}
                    className={`border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors ${esPendLargo ? 'bg-red-500/5' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-gray-400">{p.numero_pedido}</span>
                      {esPendLargo && <AlertCircle size={12} className="inline ml-1 text-red-400" />}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-white">{p.nombre}</span>
                      {p.horas_atras !== null && (
                        <p className="text-xs text-gray-500 flex items-center gap-1"><Clock size={10} /> hace {p.horas_atras}h</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{p.localidad}</td>
                    <td className="px-4 py-3">
                      <span className="text-white text-xs">{p.producto}</span>
                      <p className="text-xs text-gray-500">x{p.cantidades}</p>
                    </td>
                    <td className="px-4 py-3 font-semibold text-green-400">{$$(p.total)}</td>
                    <td className="px-4 py-3">
                      <select
                        value={estadoActual}
                        onChange={e => actualizarEstado(p.numero_pedido, e.target.value)}
                        className="bg-[#111827] border border-gray-700 text-white text-xs rounded-lg px-2 py-1 cursor-pointer"
                      >
                        <option value="pendiente">Pendiente</option>
                        <option value="en_preparacion">En preparación</option>
                        <option value="listo">Listo</option>
                        <option value="entregado">Entregado</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${PAGO_CONFIG[p.estado_pago]?.color}`}>
                        {PAGO_CONFIG[p.estado_pago]?.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setPedidoSeleccionado({ ...p, estado: estadoActual })}
                          className="flex items-center gap-1.5 bg-[#1f2937] hover:bg-gray-800 border border-gray-700 hover:text-white text-gray-400 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-all"
                        >
                          <Eye size={12} />
                          Abrir
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DETALLES DEL PEDIDO */}
      {pedidoSeleccionado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm shadow-2xl">
          <div className="bg-[#1f2937] border border-gray-800 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col slide-in">
            {/* Header */}
            <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-500/10 border border-green-500/30 rounded-xl flex items-center justify-center">
                  <Package size={18} className="text-green-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">
                    Pedido {pedidoSeleccionado.numero_pedido}
                  </h3>
                  <p className="text-xs text-gray-500">{pedidoSeleccionado.fecha}</p>
                </div>
              </div>
              <button onClick={() => setPedidoSeleccionado(null)} className="text-gray-500 hover:text-white transition-colors p-2 bg-[#111827] rounded-xl hover:bg-gray-800">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
              
              {/* Bloque Cliente */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#111827] rounded-xl p-4 border border-gray-800">
                  <div className="flex items-center gap-2 mb-3">
                    <User size={14} className="text-green-400" />
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Cliente</span>
                  </div>
                  <p className="text-base font-medium text-white mb-2">{pedidoSeleccionado.nombre}</p>
                  <button 
                    onClick={() => abrirWhatsApp(pedidoSeleccionado.telefono, pedidoSeleccionado.nombre, pedidoSeleccionado.producto)}
                    className="flex w-full justify-center items-center gap-2 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 text-sm font-medium px-3 py-2 rounded-lg transition-all"
                  >
                    <MessageCircle size={14} />
                    {pedidoSeleccionado.telefono}
                  </button>
                </div>

                <div className="bg-[#111827] rounded-xl p-4 border border-gray-800">
                  <div className="flex items-center gap-2 mb-3">
                    <CreditCard size={14} className="text-blue-400" />
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Pago</span>
                  </div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-gray-400">Total:</span>
                    <span className="text-lg font-bold text-white">{$$(pedidoSeleccionado.total)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-400">Estado:</span>
                    <span className={`font-medium ${PAGO_CONFIG[pedidoSeleccionado.estado_pago]?.color}`}>
                      {PAGO_CONFIG[pedidoSeleccionado.estado_pago]?.label.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Logística */}
              <div className="bg-[#111827] rounded-xl p-4 border border-gray-800 space-y-4">
                 <div className="flex items-start gap-3">
                   <div className="mt-0.5"><MapPin size={16} className="text-amber-400" /></div>
                   <div>
                     <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Dirección de Entrega</p>
                     <p className="text-sm text-white font-medium">{pedidoSeleccionado.direccion}</p>
                     <p className="text-xs text-gray-400">{pedidoSeleccionado.localidad}</p>
                   </div>
                 </div>
                 <div className="flex items-start gap-3 border-t border-gray-800 pt-3">
                   <div className="mt-0.5"><Calendar size={16} className="text-purple-400" /></div>
                   <div>
                     <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Timeline</p>
                     <p className="text-sm text-white">{pedidoSeleccionado.dia_entrega} · {pedidoSeleccionado.horario_entrega}</p>
                   </div>
                 </div>
              </div>

              {/* Contenido / Productos */}
              <div className="bg-[#111827] rounded-xl p-4 border border-gray-800">
                 <div className="flex items-center gap-2 mb-3">
                   <Package size={14} className="text-green-400" />
                   <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Pedido</span>
                 </div>
                 <div className="flex justify-between items-center bg-gray-900/50 p-3 rounded-lg border border-gray-800/50">
                   <span className="text-sm font-medium text-white">{pedidoSeleccionado.producto}</span>
                   <span className="text-sm text-gray-400 bg-gray-800 px-2 py-0.5 rounded-md">x{pedidoSeleccionado.cantidades}</span>
                 </div>
              </div>

              {/* Observaciones (Opcional) */}
              {pedidoSeleccionado.observaciones && (
                <div className="bg-amber-500/10 rounded-xl p-4 border border-amber-500/20">
                   <div className="flex items-center gap-2 mb-2">
                     <FileText size={14} className="text-amber-400" />
                     <span className="text-xs font-bold text-amber-500 uppercase tracking-wider">Observaciones del cliente</span>
                   </div>
                   <p className="text-sm text-amber-100/80 italic">"{pedidoSeleccionado.observaciones}"</p>
                </div>
              )}
            </div>

            {/* Footer / Workflow de Estados */}
            <div className="p-6 border-t border-gray-800 bg-gray-900/50">
              <p className="text-center text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-4">Progreso del Pedido (Sincroniza con Google Sheets)</p>
              <div className="grid grid-cols-3 gap-3">
                <button 
                  onClick={() => cambiarEstadoModal('pendiente')}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${
                    pedidoSeleccionado.estado === 'pendiente' || pedidoSeleccionado.estado === 'en_preparacion'
                      ? 'bg-amber-500/10 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.1)]' 
                      : 'bg-[#111827] border-gray-800 hover:border-amber-500/30'
                  }`}
                >
                  <AlertCircle size={20} className={`mb-1 ${pedidoSeleccionado.estado === 'pendiente' || pedidoSeleccionado.estado === 'en_preparacion' ? 'text-amber-400' : 'text-gray-600'}`} />
                  <span className={`text-[10px] font-bold uppercase ${pedidoSeleccionado.estado === 'pendiente' || pedidoSeleccionado.estado === 'en_preparacion' ? 'text-amber-400' : 'text-gray-500'}`}>Pendiente</span>
                </button>

                <button 
                  onClick={() => cambiarEstadoModal('listo')}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${
                    pedidoSeleccionado.estado === 'listo'
                      ? 'bg-blue-500/10 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.1)]' 
                      : 'bg-[#111827] border-gray-800 hover:border-blue-500/30'
                  }`}
                >
                  <Package size={20} className={`mb-1 ${pedidoSeleccionado.estado === 'listo' ? 'text-blue-400' : 'text-gray-600'}`} />
                  <span className={`text-[10px] font-bold uppercase ${pedidoSeleccionado.estado === 'listo' ? 'text-blue-400' : 'text-gray-500'}`}>Preparado</span>
                </button>

                <button 
                  onClick={() => cambiarEstadoModal('entregado')}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${
                    pedidoSeleccionado.estado === 'entregado'
                      ? 'bg-green-500/10 border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.1)]' 
                      : 'bg-[#111827] border-gray-800 hover:border-green-500/30'
                  }`}
                >
                  <CheckCircle size={20} className={`mb-1 ${pedidoSeleccionado.estado === 'entregado' ? 'text-green-400' : 'text-gray-600'}`} />
                  <span className={`text-[10px] font-bold uppercase ${pedidoSeleccionado.estado === 'entregado' ? 'text-green-400' : 'text-gray-500'}`}>Entregado</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
