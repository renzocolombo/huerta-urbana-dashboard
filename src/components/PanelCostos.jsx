import { useState } from 'react';
import { Edit2, Check, DollarSign, TrendingUp } from 'lucide-react';
import { PRODUCTOS_COSTOS } from '../data/mockData';

const $$ = (n) => `$${Number(n).toLocaleString('es-AR')}`;

export default function PanelCostos() {
  const [productos, setProductos] = useState(PRODUCTOS_COSTOS);
  const [editando, setEditando] = useState(null);
  const [publicado, setPublicado] = useState(false);

  const actualizarCosto = (idx, nuevoCosto) => {
    setProductos(prev => prev.map((p, i) =>
      i === idx ? { ...p, costo: Number(nuevoCosto) } : p
    ));
  };

  const publicarPrecios = () => {
    setPublicado(true);
    setTimeout(() => setPublicado(false), 3000);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Panel de costos</h2>
          <p className="text-gray-500 text-sm mt-1">Gestión de precios y márgenes</p>
        </div>
        <button
          onClick={publicarPrecios}
          className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl transition-all ${
            publicado
              ? 'bg-green-500/20 border border-green-500/40 text-green-400'
              : 'bg-green-500 hover:bg-green-400 text-white'
          }`}
        >
          {publicado ? <><Check size={15} /> Publicado!</> : <><TrendingUp size={15} /> Publicar precios</>}
        </button>
      </div>

      <div className="bg-[#1f2937] border border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Producto','Costo','Precio (+60%)','Precio Jumbo','Precio final','Margen %'].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {productos.map((p, idx) => {
                const precioSugerido = Math.round(p.costo * 1.6);
                const precioFinal = p.precio;
                const margen = p.costo > 0 ? Math.round(((precioFinal - p.costo) / precioFinal) * 100) : 0;
                return (
                  <tr key={p.nombre} className="border-b border-gray-800/40 hover:bg-gray-800/20 transition-colors">
                    <td className="px-5 py-4">
                      <span className="font-medium text-white text-xs">{p.nombre}</span>
                    </td>
                    <td className="px-5 py-4">
                      {editando === idx ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            defaultValue={p.costo}
                            onBlur={(e) => { actualizarCosto(idx, e.target.value); setEditando(null); }}
                            autoFocus
                            className="w-24 bg-[#111827] border border-green-500 text-white text-xs rounded-lg px-2 py-1"
                          />
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditando(idx)}
                          className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-green-400 transition-colors group"
                        >
                          {$$(p.costo)}
                          <Edit2 size={11} className="text-gray-600 group-hover:text-green-400" />
                        </button>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs text-blue-400 font-medium">{$$(precioSugerido)}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs text-gray-500 italic">— pendiente</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs text-green-400 font-semibold">{$$(precioFinal)}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        margen >= 50 ? 'bg-green-500/15 text-green-400' :
                        margen >= 30 ? 'bg-amber-500/15 text-amber-400' :
                        'bg-red-500/15 text-red-400'
                      }`}>
                        {margen}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-600 mt-3">
        * Haz clic en el costo para editarlo. El precio +60% se calcula automáticamente.
      </p>
    </div>
  );
}
