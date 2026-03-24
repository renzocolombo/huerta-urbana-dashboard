import { useMemo, useState } from 'react';
import { MapPin, ChevronRight } from 'lucide-react';
import { PEDIDOS, HOY } from '../data/mockData';

const DIAS_SEMANA = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

export default function AgendaEntregas() {
  const [diaSeleccionado, setDiaSeleccionado] = useState(DIAS_SEMANA[0]);

  const agrupado = useMemo(() => {
    // Agrupar todos los pedidos (no solo hoy) por dia_entrega → localidad
    const pedidosDia = PEDIDOS.filter(p => p.dia_entrega === diaSeleccionado);
    const mapa = {};
    pedidosDia.forEach(p => {
      if (!mapa[p.localidad]) mapa[p.localidad] = [];
      mapa[p.localidad].push(p);
    });
    return mapa;
  }, [diaSeleccionado]);

  const totalDia = Object.values(agrupado).flat().length;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">Agenda de entregas</h2>
        <p className="text-gray-500 text-sm mt-1">Pedidos agrupados por día y localidad</p>
      </div>

      {/* Tabs de días */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {DIAS_SEMANA.map(dia => (
          <button
            key={dia}
            onClick={() => setDiaSeleccionado(dia)}
            className={`whitespace-nowrap px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              diaSeleccionado === dia
                ? 'bg-green-500 text-white'
                : 'bg-[#1f2937] border border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
            }`}
          >
            {dia}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-4">
        <span className="text-sm text-gray-400">{totalDia} pedidos para el {diaSeleccionado}</span>
      </div>

      {Object.keys(agrupado).length === 0 ? (
        <div className="bg-[#1f2937] border border-gray-800 rounded-2xl p-12 text-center">
          <MapPin size={32} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500">Sin entregas para este día</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(agrupado).map(([localidad, pedidos]) => (
            <div key={localidad} className="bg-[#1f2937] border border-gray-800 rounded-2xl overflow-hidden fade-in">
              {/* Header localidad */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 bg-[#111827]/50">
                <div className="flex items-center gap-2">
                  <MapPin size={15} className="text-green-400" />
                  <span className="font-semibold text-white text-sm">{localidad}</span>
                </div>
                <span className="text-xs bg-green-500/15 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full">
                  {pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Pedidos */}
              <div className="divide-y divide-gray-800/50">
                {pedidos.map(p => (
                  <div key={p.numero_pedido} className="flex items-center justify-between px-5 py-3 hover:bg-gray-800/20">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium">{p.nombre}</p>
                      <p className="text-xs text-gray-500 truncate">{p.direccion}</p>
                    </div>
                    <div className="text-right ml-4 shrink-0">
                      <p className="text-xs text-gray-400 font-medium">{p.horario_entrega}</p>
                      <p className="text-xs text-gray-600">{p.producto.slice(0,15)}...</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
