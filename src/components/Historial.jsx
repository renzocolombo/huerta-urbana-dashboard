import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Search, Filter, MessageCircle, ChevronDown } from 'lucide-react';
import { LOCALIDADES, PRODUCTOS } from '../data/mockData';

const $$ = (n) => `$${Number(n).toLocaleString('es-AR')}`;

export default function Historial() {
  const { pedidos: PEDIDOS } = useGoogleSheets();

  const [busqueda, setBusqueda] = useState('');
  const [localidad, setLocalidad] = useState('');
  const [producto, setProducto] = useState('');
  const [estado, setEstado] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 15;

  const filtrados = useMemo(() => {
    return PEDIDOS.filter(p => {
      const matchBusq = !busqueda || p.nombre.toLowerCase().includes(busqueda.toLowerCase()) || p.numero_pedido.includes(busqueda);
      const matchLoc = !localidad || p.localidad === localidad;
      const matchProd = !producto || p.producto === producto;
      const matchEst = !estado || p.estado === estado;
      const matchDesde = !desde || p.fecha >= desde;
      const matchHasta = !hasta || p.fecha <= hasta;
      return matchBusq && matchLoc && matchProd && matchEst && matchDesde && matchHasta;
    }).sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [busqueda, localidad, producto, estado, desde, hasta]);

  const totalPaginas = Math.ceil(filtrados.length / POR_PAGINA);
  const pedidosPagina = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const totalFiltrado = filtrados.reduce((s, p) => s + p.total, 0);

  const selectClass = "bg-[#111827] border border-gray-700 text-white text-xs rounded-lg px-3 py-2 focus:border-green-500";
  const inputClass = "bg-[#111827] border border-gray-700 text-white text-xs rounded-lg px-3 py-2";

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">Historial de pedidos</h2>
        <p className="text-gray-500 text-sm mt-1">{filtrados.length} pedidos · Total: {$$(totalFiltrado)}</p>
      </div>

      {/* Filtros */}
      <div className="bg-[#1f2937] border border-gray-800 rounded-2xl p-4 mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="relative col-span-2 sm:col-span-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Buscar nombre o #..."
              value={busqueda}
              onChange={e => { setBusqueda(e.target.value); setPagina(1); }}
              className={`${inputClass} pl-8 w-full`}
            />
          </div>
          <select value={localidad} onChange={e => { setLocalidad(e.target.value); setPagina(1); }} className={selectClass}>
            <option value="">Todas las localidades</option>
            {LOCALIDADES.map(l => <option key={l}>{l}</option>)}
          </select>
          <select value={producto} onChange={e => { setProducto(e.target.value); setPagina(1); }} className={selectClass}>
            <option value="">Todos los productos</option>
            {PRODUCTOS.map(p => <option key={p}>{p}</option>)}
          </select>
          <select value={estado} onChange={e => { setEstado(e.target.value); setPagina(1); }} className={selectClass}>
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendiente</option>
            <option value="en_preparacion">En preparación</option>
            <option value="listo">Listo</option>
            <option value="entregado">Entregado</option>
          </select>
          <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setPagina(1); }} className={inputClass} />
          <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setPagina(1); }} className={inputClass} />
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-[#1f2937] border border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['#','Fecha','Nombre','Localidad','Producto','Cant.','Total','Estado','Pago','Método'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pedidosPagina.map(p => (
                <tr key={p.numero_pedido} className="border-b border-gray-800/40 hover:bg-gray-800/20 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-400">{p.numero_pedido}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">{p.fecha}</td>
                  <td className="px-4 py-2.5 font-medium text-white whitespace-nowrap">{p.nombre}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">{p.localidad}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-300">{p.producto.replace('COMBO ','')}</td>
                  <td className="px-4 py-2.5 text-center text-gray-400 text-xs">{p.cantidades}</td>
                  <td className="px-4 py-2.5 font-semibold text-green-400 whitespace-nowrap">{$$(p.total)}</td>
                  <td className="px-4 py-2.5">
                    <EstadoBadge estado={p.estado} />
                  </td>
                  <td className="px-4 py-2.5">
                    <PagoBadge estado={p.estado_pago} />
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500 capitalize">{p.metodo_pago}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
          <span className="text-xs text-gray-500">
            Página {pagina} de {totalPaginas} · {filtrados.length} resultados
          </span>
          <div className="flex gap-2">
            <button
              disabled={pagina === 1}
              onClick={() => setPagina(p => p - 1)}
              className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-white rounded-lg disabled:opacity-40 transition-all"
            >
              Anterior
            </button>
            <button
              disabled={pagina === totalPaginas}
              onClick={() => setPagina(p => p + 1)}
              className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-white rounded-lg disabled:opacity-40 transition-all"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EstadoBadge({ estado }) {
  const cfg = {
    pendiente:      'bg-red-500/15 text-red-400',
    en_preparacion: 'bg-amber-500/15 text-amber-400',
    listo:          'bg-blue-500/15 text-blue-400',
    entregado:      'bg-green-500/15 text-green-400',
  };
  const labels = { pendiente:'Pendiente', en_preparacion:'Preparando', listo:'Listo', entregado:'Entregado' };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg[estado] || 'bg-gray-700 text-gray-400'}`}>{labels[estado] || estado}</span>;
}

function PagoBadge({ estado }) {
  const cfg = { pagado:'text-green-400', pendiente:'text-red-400', sin_pago:'text-gray-500' };
  const labels = { pagado:'Pagado', pendiente:'Pendiente', sin_pago:'Sin pago' };
  return <span className={`text-xs font-medium ${cfg[estado] || 'text-gray-400'}`}>{labels[estado] || estado}</span>;
}
