import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AlertCircle, Clock, Package, Printer } from 'lucide-react';
import { HOY } from '../data/mockData';
import { imprimirRemitoIndividual, imprimirRemitosEnLote } from '../utils/remitoPrinter';

const $$ = (n) => `$${Number(n).toLocaleString('es-AR')}`;

const ESTADO_CONFIG = {
  pendiente:      { label: 'Pendiente',      color: 'bg-red-500/15 text-red-400 border-red-500/30',    dot: 'bg-red-500' },
  en_preparacion: { label: 'En preparación', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', dot: 'bg-amber-500' },
  listo:          { label: 'Listo',          color: 'bg-blue-500/15 text-blue-400 border-blue-500/30',  dot: 'bg-blue-500' },
  entregado:      { label: 'Entregado',      color: 'bg-green-500/15 text-green-400 border-green-500/30', dot: 'bg-green-500' },
};

const PAGO_CONFIG = {
  pagado:    { label: 'Pagado',    color: 'text-green-400' },
  approved:  { label: 'Aprobado',  color: 'text-green-400' },
  aprobado:  { label: 'Aprobado',  color: 'text-green-400' },
  pendiente: { label: 'Pendiente', color: 'text-amber-400' },
  pending:   { label: 'Pendiente', color: 'text-amber-400' },
  sin_pago:  { label: 'Sin pago',  color: 'text-gray-500' },
  rejected:  { label: 'Rechazado', color: 'text-red-400' },
  rechazado: { label: 'Rechazado', color: 'text-red-400' },
  cancelled: { label: 'Cancelado', color: 'text-gray-500' },
  cancelado: { label: 'Cancelado', color: 'text-gray-500' },
};

function Badge({ config }) {
  if (!config) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${config.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

export default function PedidosDelDia() {
  const { pedidos: PEDIDOS, actualizarRemitoEnSheet } = useGoogleSheets();

  const preparaciones = useMemo(() => {
    try {
      const s = localStorage.getItem('huerta_preparaciones_v1');
      return s ? JSON.parse(s) : {};
    } catch (e) {
      return {};
    }
  }, []);

  const pedidosHoy = useMemo(() =>
    PEDIDOS.filter(p => p.fecha === HOY).sort((a, b) => (a.estado === 'pendiente' ? -1 : 1)),
  [PEDIDOS]);

  const [filtroEstado, setFiltroEstado] = useState(null);

  const pedidosMostrados = useMemo(() => {
    if (!filtroEstado) return pedidosHoy;
    if (filtroEstado === 'listo') {
      return pedidosHoy.filter(p => p.estado === 'listo' || p.estado === 'preparado');
    }
    return pedidosHoy.filter(p => p.estado === filtroEstado);
  }, [pedidosHoy, filtroEstado]);

  const pendientesLargo = pedidosHoy.filter(p => p.estado === 'pendiente' && p.horas_atras >= 2);

  const imprimirRemitoPedido = (p) => {
    const prep = preparaciones[p.numero_pedido] || null;
    imprimirRemitoIndividual(p, prep);
    if (p.sheetRowIndex && actualizarRemitoEnSheet) {
      actualizarRemitoEnSheet(p.sheetRowIndex, true);
    }
  };

  const imprimirTodosHoy = () => {
    if (pedidosHoy.length === 0) {
      alert('No hay pedidos en el día de hoy para imprimir.');
      return;
    }
    imprimirRemitosEnLote(pedidosHoy, preparaciones, `Remitos del Día · ${HOY}`);
    pedidosHoy.forEach(p => {
      if (p.sheetRowIndex && actualizarRemitoEnSheet) {
        actualizarRemitoEnSheet(p.sheetRowIndex, true);
      }
    });
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Pedidos del día (Vista Rápida)</h2>
          <p className="text-gray-500 text-sm mt-1">{pedidosHoy.length} pedidos · {HOY}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {pedidosHoy.length > 0 && (
            <button
              onClick={imprimirTodosHoy}
              className="flex items-center gap-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 border border-indigo-500/40 rounded-xl px-4 py-2 transition-all shadow-md shadow-indigo-900/30"
              title="Imprime todos los remitos del día en un solo documento consolidado"
            >
              <Printer size={15} />
              Imprimir remitos de hoy ({pedidosHoy.length})
            </button>
          )}
          <div className="flex items-center gap-2 text-sm font-semibold text-white bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-2">
            <Package size={15} className="text-green-400" />
            {pedidosHoy.length} pedidos
          </div>
        </div>
      </div>

      {/* Barra de estado rápido: Estado de pedidos hoy */}
      <div className="bg-[#1f2937] border border-gray-800 rounded-2xl p-5 mb-6 shadow-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Estado de pedidos hoy</h3>
          {filtroEstado && (
            <button
              onClick={() => setFiltroEstado(null)}
              className="text-xs text-green-400 hover:text-green-300 underline font-medium cursor-pointer"
            >
              Mostrar todos ({pedidosHoy.length})
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Pendientes',      estado: 'pendiente',      color: 'bg-red-500',    light: 'text-red-400',    border: 'border-red-500/40' },
            { label: 'En preparación',  estado: 'en_preparacion', color: 'bg-amber-500',  light: 'text-amber-400',  border: 'border-amber-500/40' },
            { label: 'Listos',          estado: 'listo',          color: 'bg-blue-500',   light: 'text-blue-400',   border: 'border-blue-500/40' },
            { label: 'Entregados',      estado: 'entregado',      color: 'bg-green-500',  light: 'text-green-400',  border: 'border-green-500/40' },
          ].map(({ label, estado, color, light, border }) => {
            const cant = pedidosHoy.filter(p => estado === 'listo' ? (p.estado === 'listo' || p.estado === 'preparado') : p.estado === estado).length;
            const pct = pedidosHoy.length ? Math.round((cant / pedidosHoy.length) * 100) : 0;
            const isSelected = filtroEstado === estado;
            return (
              <div 
                key={estado} 
                onClick={() => setFiltroEstado(isSelected ? null : estado)}
                className={`bg-[#111827] rounded-xl p-3 cursor-pointer transition-all border ${isSelected ? border + ' ring-1 ring-white/20' : 'border-transparent hover:border-gray-700'}`}
                title={`Click para filtrar por ${label}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${color}`} />
                    <span className="text-xs text-gray-400 font-medium">{label}</span>
                  </div>
                  {isSelected && <span className="text-[10px] text-green-400 font-mono">Activo</span>}
                </div>
                <p className={`text-2xl font-bold ${light}`}>{cant}</p>
                <div className="w-full bg-gray-800 rounded-full h-1.5 mt-2 overflow-hidden">
                  <div className={`${color} h-full rounded-full transition-all`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {pendientesLargo.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-4 flex items-center gap-3 fade-in">
          <AlertCircle size={16} className="text-red-400 shrink-0" />
          <p className="text-sm text-red-300">
            <strong>{pendientesLargo.length} pedido(s)</strong> pendiente(s) hace más de 2 horas.
          </p>
        </div>
      )}

      <div className="bg-[#1f2937] border border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['#','Nombre','Localidad','Producto','Total','Estado','Pago','Remito'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pedidosMostrados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-gray-500 text-xs italic">
                    No hay pedidos con el estado seleccionado ({filtroEstado}).
                  </td>
                </tr>
              ) : (
                pedidosMostrados.map((p) => {
                const esPendLargo = p.estado === 'pendiente' && p.horas_atras >= 2;
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
                      <Badge config={ESTADO_CONFIG[p.estado]} />
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const pagoKey = (p.estado_pago || '').toLowerCase().trim();
                        const config = PAGO_CONFIG[pagoKey] || { label: p.estado_pago || 'Pendiente', color: 'text-amber-400' };
                        return (
                          <span className={`text-xs font-medium ${config.color}`}>
                            {config.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => imprimirRemitoPedido(p)}
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-500/10 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-300 hover:text-white rounded-lg text-xs font-semibold transition-all shadow-sm active:scale-95 cursor-pointer"
                        title="Imprimir remito individual de este pedido"
                      >
                        <Printer size={12} className="text-indigo-400" />
                        <span>Remito</span>
                      </button>
                    </td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
