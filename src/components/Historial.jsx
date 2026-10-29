import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { LOCALIDADES, PRODUCTOS } from '../data/mockData';
import { estadoEntregaPedido, estadoPagoPedido, esVentaCerrada } from '../utils/estadosPedido';

const $$ = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

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
    return (PEDIDOS || []).filter(p => {
      const matchBusq = !busqueda || p.nombre.toLowerCase().includes(busqueda.toLowerCase()) || String(p.numero_pedido).includes(busqueda);
      const matchLoc = !localidad || p.localidad === localidad;
      const matchProd = !producto || p.producto === producto;
      const matchEst = !estado || p.estado === estado;
      const matchDesde = !desde || p.fecha >= desde;
      const matchHasta = !hasta || p.fecha <= hasta;
      return matchBusq && matchLoc && matchProd && matchEst && matchDesde && matchHasta;
    }).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  }, [PEDIDOS, busqueda, localidad, producto, estado, desde, hasta]);

  const totalPaginas = Math.ceil(filtrados.length / POR_PAGINA) || 1;
  const pedidosPagina = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const totalFiltrado = filtrados.reduce((s, p) => s + (Number(p.total) || 0), 0);

  // Solo pedidos con entrega cumplida y cobro confirmado cuentan como venta cerrada
  const ventasCerradas = useMemo(() => filtrados.filter(esVentaCerrada), [filtrados]);
  const totalVentasCerradas = useMemo(() => ventasCerradas.reduce((s, p) => s + (Number(p.total) || 0), 0), [ventasCerradas]);

  const selectClass = "bg-[#111827] border border-gray-700 text-white text-xs rounded-lg px-3 py-2 focus:border-green-500";
  const inputClass = "bg-[#111827] border border-gray-700 text-white text-xs rounded-lg px-3 py-2";

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">Historial de pedidos</h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm mt-1">
          <span className="text-gray-400">
            {filtrados.length} {filtrados.length === 1 ? 'pedido' : 'pedidos'}
          </span>
          <span className="text-emerald-400 font-semibold">
            Ventas cerradas: {ventasCerradas.length} ({$$(totalVentasCerradas)})
          </span>
          <span className="text-gray-500 text-xs">
            · Total registrado: {$$(totalFiltrado)}
          </span>
        </div>
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
            <option value="cancelado">Cancelado</option>
          </select>
          <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setPagina(1); }} className={inputClass} />
          <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setPagina(1); }} className={inputClass} />
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-[#1f2937] border border-gray-800 rounded-2xl overflow-hidden shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase">
                {['#','Fecha','Nombre','Localidad','Producto','Cant.','Total','Entrega','Pago','Medio'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-semibold tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pedidosPagina.map(p => {
                const estEnt = estadoEntregaPedido(p);
                const estPag = estadoPagoPedido(p);

                return (
                  <tr key={p.numero_pedido} className="border-b border-gray-800/40 hover:bg-gray-800/20 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-400">{p.numero_pedido}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">{p.fecha}</td>
                    <td className="px-4 py-2.5 font-medium text-white whitespace-nowrap">{p.nombre}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">{p.localidad || '-'}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-300">{(p.producto || '').replace('COMBO ','')}</td>
                    <td className="px-4 py-2.5 text-center text-gray-400 text-xs">{p.cantidades || 1}</td>
                    <td className="px-4 py-2.5 font-semibold text-emerald-400 whitespace-nowrap">{$$(p.total)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${estEnt.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${estEnt.dot}`} />
                        <span>{estEnt.label}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${estPag.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${estPag.dot}`} />
                        <span>{estPag.label}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-400 capitalize">
                      {p.medio_cobro || p.medio_pago || p.metodo_pago_elegido || p.forma_pago || '-'}
                    </td>
                  </tr>
                );
              })}
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
              className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-white rounded-lg disabled:opacity-40 transition-all cursor-pointer"
            >
              Anterior
            </button>
            <button
              disabled={pagina === totalPaginas}
              onClick={() => setPagina(p => p + 1)}
              className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-white rounded-lg disabled:opacity-40 transition-all cursor-pointer"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
