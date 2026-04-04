import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MapPin, Navigation, Printer, AlertCircle } from 'lucide-react';
import { PEDIDOS, HOY } from '../data/mockData';

// Orden aproximado de zonas desde Tortuguitas, Pilar (distancia estimada)
const ORDEN_ZONAS = [
  'Tortuguitas','Manzanares','Manzone','Villa Astolfi',
  'Del Viso','La Lonja','Manuel Alberti','Zelaya',
  'Fátima','Pilar','Presidente Derqui','Villa Rosa',
];

function ordenarPorProximidad(pedidos) {
  return [...pedidos].sort((a, b) => {
    const ia = ORDEN_ZONAS.indexOf(a.localidad);
    const ib = ORDEN_ZONAS.indexOf(b.localidad);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

export default function RutaOptimizada() {
  const ruta = useMemo(() => {
    const hoy = PEDIDOS.filter(p => p.fecha === HOY && p.estado !== 'entregado');
    return ordenarPorProximidad(hoy);
  }, []);

  const imprimir = () => {
    const contenido = ruta
      .map((p, i) => `${i + 1}. ${p.nombre} - ${p.direccion} (${p.localidad}) - ${p.producto} x${p.cantidades} - ${p.horario_entrega}${p.observaciones ? `\n   OBS: ${p.observaciones}` : ''}`)
      .join('\n');
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>Ruta del día - Huerta Urbana</title>
      <style>body{font-family:sans-serif;padding:20px;} h2{color:#22c55e;} .parada{padding:8px 0;border-bottom:1px solid #eee;}</style>
      </head><body>
      <h2>🥦 Huerta Urbana - Ruta del ${HOY}</h2>
      <p>Salida desde: Tortuguitas, Pilar</p>
      ${ruta.map((p, i) => `
        <div class="parada">
          <strong>${i + 1}. ${p.nombre}</strong><br/>
          📍 ${p.direccion}<br/>
          🕐 ${p.horario_entrega} · 📦 ${p.producto} x${p.cantidades}
          ${p.observaciones ? `<br/><span style="color:#b45309;font-size:0.9em;font-weight:bold;">⚠️ OBS: ${p.observaciones}</span>` : ''}
        </div>
      `).join('')}
      </body></html>
    `);
    win.print();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Ruta optimizada</h2>
          <p className="text-gray-500 text-sm mt-1">Recorrido del día desde Tortuguitas, Pilar</p>
        </div>
        <button
          onClick={imprimir}
          className="flex items-center gap-2 bg-[#1f2937] border border-gray-700 hover:border-gray-600 text-white text-sm font-medium px-4 py-2 rounded-xl transition-all"
        >
          <Printer size={15} />
          Imprimir recorrido
        </button>
      </div>

      {ruta.length === 0 ? (
        <div className="bg-[#1f2937] border border-gray-800 rounded-2xl p-12 text-center">
          <Navigation size={32} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500">Todos los pedidos del día ya fueron entregados</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Punto de partida */}
          <div className="flex items-center gap-3 px-5 py-3 bg-green-500/10 border border-green-500/20 rounded-2xl">
            <div className="w-8 h-8 bg-green-500 rounded-xl flex items-center justify-center">
              <Navigation size={15} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-green-400">Punto de partida</p>
              <p className="text-xs text-gray-400">Tortuguitas, Pilar · Buenos Aires</p>
            </div>
          </div>

          {/* Paradas */}
          {ruta.map((p, i) => (
            <div key={p.numero_pedido} className="flex gap-4 fade-in">
              {/* Línea de progreso */}
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 bg-[#1f2937] border border-gray-700 rounded-xl flex items-center justify-center text-xs font-bold text-green-400">
                  {i + 1}
                </div>
                {i < ruta.length - 1 && <div className="w-px h-full bg-gray-800 mt-1" />}
              </div>
              {/* Detalle */}
              <div className="flex-1 bg-[#1f2937] border border-gray-800 rounded-2xl p-4 mb-1 hover:border-gray-700 transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-white text-sm">{p.nombre}</p>
                    <div className="flex items-center gap-1 mt-0.5 mb-2">
                      <MapPin size={11} className="text-gray-500 shrink-0" />
                      <p className="text-xs text-gray-400 truncate">{p.direccion}</p>
                    </div>
                    {p.observaciones && (
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 flex items-start gap-2 mb-2">
                        <AlertCircle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-200/90 leading-relaxed font-medium">"{p.observaciones}"</p>
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 text-xs bg-[#111827] text-gray-400 border border-gray-700 px-2 py-0.5 rounded-lg">
                    {p.horario_entrega}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs text-green-400 font-medium">{p.localidad}</span>
                  <span className="text-gray-600">·</span>
                  <span className="text-xs text-gray-500">{p.producto} x{p.cantidades}</span>
                  <span className="text-gray-600">·</span>
                  <span className={`text-xs font-medium ${p.metodo_pago === 'efectivo' ? 'text-amber-400' : 'text-green-400'}`}>
                    {p.metodo_pago === 'efectivo' ? '💵 Cobrar efectivo' : '✅ Pago digital'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
