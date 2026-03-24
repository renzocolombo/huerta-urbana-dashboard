import { useState, useMemo } from 'react';
import { MessageCircle, AlertCircle, CheckCircle, Clock, Truck, Package } from 'lucide-react';
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
                      <button
                        onClick={() => abrirWhatsApp(p.telefono, p.nombre, p.producto)}
                        className="flex items-center gap-1.5 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-all"
                      >
                        <MessageCircle size={12} />
                        WA
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
