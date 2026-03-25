import { useState, useMemo } from 'react';
import { MapPin, ChevronDown, ChevronUp, MessageCircle, AlertCircle, Package, CheckCircle, Sun, Sunset, Printer, FileText, User, Clock } from 'lucide-react';
import { PEDIDOS, HOY } from '../data/mockData';

const DIAS_SEMANA = ['Martes', 'Jueves'];
const $$ = (n) => `$${Number(n).toLocaleString('es-AR')}`;

const PAGO_CONFIG = {
  pagado:   { label: 'Pagado',    color: 'text-green-400' },
  pendiente: { label: 'Pendiente', color: 'text-red-400' },
  sin_pago:  { label: 'Sin pago',  color: 'text-gray-500' },
};

export default function AgendaEntregas() {
  const [diaSeleccionado, setDiaSeleccionado] = useState(DIAS_SEMANA[0]);
  const [turnoSeleccionado, setTurnoSeleccionado] = useState('Manana'); // 'Manana' | 'Tarde'

  // Estados dinámicos para operaciones
  const [estados, setEstados] = useState(() => {
    const map = {};
    PEDIDOS.forEach(p => { map[p.numero_pedido] = p.estado; });
    return map;
  });
  const [pedidosAbiertos, setPedidosAbiertos] = useState({});

  const toggleAcordeon = (id) => {
    setPedidosAbiertos(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const actualizarEstado = (id, estadoAAsignar) => {
    setEstados(prev => ({ ...prev, [id]: estadoAAsignar }));
    console.log(`[Google Sheets API] Columna M actualizada -> Pedido: ${id} | Estado: ${estadoAAsignar}`);
  };

  const abrirWhatsApp = (telefono, nombre, producto) => {
    const msg = encodeURIComponent(`Hola ${nombre.split(' ')[0]}! 🥦 Estuvimos armando tu pedido de *${producto}* de Huerta Urbana. Nos pondremos en contacto pronto por la entrega.`);
    window.open(`https://wa.me/${telefono.replace(/\D/g, '')}?text=${msg}`, '_blank');
  };

  const imprimir = (alcance) => {
    // alcance: 'turno' o 'dia'
    const aImprimir = alcance === 'turno' ? pedidosDelTurno : pedidosDelDia;
    
    // Simular Google Sheets remito_impreso = SI
    aImprimir.forEach(p => {
      console.log(`[Google Sheets API] Columna T (remito_impreso) = 'SI' para Pedido: ${p.numero_pedido}`);
    });

    const contenido = aImprimir
      .map((p, i) => `${i + 1}. ${p.nombre} - ${p.direccion} (${p.localidad}) - ${p.producto} x${p.cantidades} - ${p.horario_entrega}${p.observaciones ? `\n   OBS: ${p.observaciones}` : ''}`)
      .join('\n');
      
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>Remitos - Huerta Urbana</title>
      <style>body{font-family:sans-serif;padding:20px;} h2{color:#22c55e;} .parada{padding:15px 0;border-bottom:2px dashed #ccc; page-break-inside: avoid;}</style>
      </head><body>
      <h2>🥦 Huerta Urbana - Remitos ${diaSeleccionado} ${alcance === 'turno' ? (turnoSeleccionado === 'Manana' ? 'Mañana' : 'Tarde') : 'Todo el Día'}</h2>
      ${aImprimir.map((p, i) => `
        <div class="parada">
          <div style="font-size: 1.2em;"><strong>[#${p.numero_pedido}] ${p.nombre}</strong></div>
          <div style="margin-top: 5px;">📍 ${p.direccion}, ${p.localidad}</div>
          <div style="margin-top: 5px;">🕐 ${p.horario_entrega} · 📦 <strong>${p.producto} x${p.cantidades}</strong></div>
          <div style="margin-top: 5px;">💰 Total: $${p.total} (${p.estado_pago.toUpperCase()})</div>
          ${p.observaciones ? `<div style="margin-top:8px; padding:5px; background:#fffbeb; border:1px solid #f59e0b; color:#b45309; font-weight:bold;">⚠️ OBS: ${p.observaciones}</div>` : ''}
        </div>
      `).join('')}
      <script>window.print();</script>
      </body></html>
    `);
  };

  // Filtrado de pedidos
  const pedidosDelDia = useMemo(() => {
    return PEDIDOS.filter(p => p.dia_entrega === diaSeleccionado);
  }, [diaSeleccionado]);

  const pedidosDelTurno = useMemo(() => {
    return pedidosDelDia.filter(p => {
      const horaInicio = parseInt(p.horario_entrega.split(':')[0], 10);
      const isManana = isNaN(horaInicio) || horaInicio < 13;
      return (turnoSeleccionado === 'Manana' && isManana) || (turnoSeleccionado === 'Tarde' && !isManana);
    });
  }, [pedidosDelDia, turnoSeleccionado]);

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Agenda de Entregas (Operativa)</h2>
          <p className="text-gray-500 text-sm mt-1">Gestión completa, impresión y estados.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2">
           <button
             onClick={() => imprimir('turno')}
             className="flex items-center justify-center gap-2 bg-[#1f2937] hover:bg-gray-800 border border-gray-700 hover:border-gray-500 text-white text-sm font-medium px-4 py-2 rounded-xl transition-all"
           >
             <Printer size={15} />
             Imprimir este turno
           </button>
           <button
             onClick={() => imprimir('dia')}
             className="flex items-center justify-center gap-2 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 font-medium px-4 py-2 rounded-xl text-sm transition-all"
           >
             <FileText size={15} />
             Imprimir todo el día
           </button>
        </div>
      </div>

      {/* Tabs Nivel 1: Días */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {DIAS_SEMANA.map(dia => (
          <button
            key={dia}
            onClick={() => { setDiaSeleccionado(dia); setPedidosAbiertos({}); }}
            className={`whitespace-nowrap px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
              diaSeleccionado === dia
                ? 'bg-green-500 text-white shadow-[0_4px_15px_rgba(34,197,94,0.3)]'
                : 'bg-[#1f2937] border border-gray-800 text-gray-400 hover:text-white hover:border-gray-600'
            }`}
          >
            {dia}
          </button>
        ))}
      </div>

      {/* Tabs Nivel 2: Turnos */}
      <div className="flex gap-2 mb-6 bg-[#1f2937]/50 p-1.5 rounded-2xl w-fit">
        <button
          onClick={() => setTurnoSeleccionado('Manana')}
          className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all ${
            turnoSeleccionado === 'Manana'
              ? 'bg-[#111827] text-amber-400 border border-gray-700 shadow-md'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          <Sun size={16} />
          Turno Mañana (8-12 hs)
        </button>
        <button
          onClick={() => setTurnoSeleccionado('Tarde')}
          className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all ${
            turnoSeleccionado === 'Tarde'
              ? 'bg-[#111827] text-indigo-400 border border-gray-700 shadow-md'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          <Sunset size={16} />
          Turno Tarde (14-18 hs)
        </button>
      </div>

      {/* LISTA DE PEDIDOS */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-sm font-medium text-white bg-gray-800 px-3 py-1 rounded-lg border border-gray-700">
          {pedidosDelTurno.length} pedidos
        </span>
      </div>

      {pedidosDelTurno.length === 0 ? (
        <div className="bg-[#1f2937] border border-gray-800 rounded-2xl p-12 text-center">
          <MapPin size={32} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500">No hay entregas asignadas a este turno.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pedidosDelTurno.map(p => {
            const isOpen = !!pedidosAbiertos[p.numero_pedido];
            const estadoActual = estados[p.numero_pedido] || 'pendiente';

            return (
              <div key={p.numero_pedido} className={`bg-[#1f2937] border transition-all duration-300 rounded-2xl overflow-hidden ${isOpen ? 'border-gray-600 ring-1 ring-gray-600/50' : 'border-gray-800 hover:border-gray-700'}`}>
                
                {/* Cabecera (Click para expandir) */}
                <div 
                  className="px-5 py-4 flex items-center justify-between cursor-pointer bg-[#1f2937] hover:bg-[#263242]"
                  onClick={() => toggleAcordeon(p.numero_pedido)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 bg-gray-800 rounded-xl flex items-center justify-center border border-gray-700/50">
                       <User size={16} className={estadoActual === 'entregado' ? 'text-green-400' : (estadoActual === 'preparado' || estadoActual === 'listo' ? 'text-blue-400' : 'text-amber-400')} />
                    </div>
                    <div>
                      <p className="font-bold text-white text-sm">{p.nombre}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400 flex items-center gap-1"><MapPin size={10} /> {p.localidad}</span>
                        <span className="text-xs font-mono text-gray-500 mx-1">|</span>
                        <span className="text-xs text-gray-400 flex items-center gap-1"><Clock size={10} /> {p.horario_entrega}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                     <span className={`hidden sm:flex text-xs font-bold px-2 py-1 border rounded-lg uppercase tracking-wider ${
                        estadoActual === 'pendiente' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 
                        estadoActual === 'preparado' || estadoActual === 'listo' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 
                        'bg-green-500/10 text-green-400 border-green-500/20'
                     }`}>
                       {estadoActual === 'listo' ? 'PREPARADO' : estadoActual}
                     </span>
                     <button className="text-gray-500 bg-[#111827] p-1.5 rounded-lg border border-gray-700">
                       {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                     </button>
                  </div>
                </div>

                {/* Contenido del Acordeón */}
                {isOpen && (
                  <div className="px-5 pb-5 pt-2 border-t border-gray-800 bg-[#111827]/50 slide-in space-y-5">
                    
                    {/* Detalles Flex */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                       
                       {/* Lista de productos y observaciones */}
                       <div className="space-y-4">
                         <div className="bg-[#111827] border border-gray-800 p-3 rounded-xl flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <Package size={14} className="text-indigo-400" />
                              <span className="font-semibold text-white text-sm">{p.producto}</span>
                            </div>
                            <span className="bg-gray-800 text-gray-300 font-bold px-2.5 py-1 rounded-md text-xs border border-gray-700">x{p.cantidades}</span>
                         </div>
                         
                         {p.observaciones && (
                           <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl">
                             <p className="text-[10px] uppercase font-bold text-amber-500 tracking-wider mb-1">Observaciones</p>
                             <p className="text-sm text-amber-100 font-medium italic">"{p.observaciones}"</p>
                           </div>
                         )}

                         <div className="bg-[#111827] border border-gray-800 p-3 rounded-xl">
                           <p className="text-gray-400 text-xs mb-1">Dirección completa</p>
                           <p className="text-white text-sm font-medium">{p.direccion}, {p.localidad}</p>
                         </div>
                       </div>

                       {/* Contacto, Pago y Total */}
                       <div className="space-y-4 flex flex-col justify-between">
                         <button
                           onClick={() => abrirWhatsApp(p.telefono, p.nombre, p.producto)}
                           className="w-full flex items-center justify-center gap-2 bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/30 text-[#25D366] text-sm font-bold px-4 py-3 rounded-xl transition-all"
                         >
                           <MessageCircle size={18} />
                           WhatsApp: {p.telefono}
                         </button>

                         <div className="bg-[#111827] border border-gray-800 flex flex-col justify-center p-4 rounded-xl flex-1">
                           <div className="flex justify-between items-end mb-2">
                             <span className="text-gray-400 text-xs">Total del pedido</span>
                             <span className="text-xl font-bold text-white">{$$(p.total)}</span>
                           </div>
                           <div className="flex justify-between items-center border-t border-gray-800 pt-2 mt-1 text-sm">
                             <span className="text-gray-500">Estado de pago</span>
                             <span className={`font-bold ${PAGO_CONFIG[p.estado_pago]?.color}`}>
                               {PAGO_CONFIG[p.estado_pago]?.label.toUpperCase()}
                             </span>
                           </div>
                         </div>
                       </div>
                    </div>

                    {/* Botonera de flujo */}
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <p className="text-center text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-3">Actualizar estado logístico (Sync Sheet)</p>
                      <div className="flex flex-wrap sm:flex-nowrap gap-2">
                        <button
                          onClick={() => actualizarEstado(p.numero_pedido, 'pendiente')}
                          className={`flex-1 py-2.5 rounded-lg border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                            estadoActual === 'pendiente' 
                             ? 'bg-amber-500/10 border-amber-500/50 text-amber-400 ring-1 ring-amber-500/30' 
                             : 'bg-[#111827] border-gray-800 hover:border-amber-500/30 text-gray-500 hover:text-amber-400'
                          }`}
                        >
                          <AlertCircle size={14} /> PENDIENTE
                        </button>
                        <button
                          onClick={() => actualizarEstado(p.numero_pedido, 'preparado')}
                          className={`flex-1 py-2.5 rounded-lg border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                            estadoActual === 'preparado' || estadoActual === 'listo'
                             ? 'bg-blue-500/10 border-blue-500/50 text-blue-400 ring-1 ring-blue-500/30' 
                             : 'bg-[#111827] border-gray-800 hover:border-blue-500/30 text-gray-500 hover:text-blue-400'
                          }`}
                        >
                          <Package size={14} /> PREPARADO
                        </button>
                        <button
                          onClick={() => actualizarEstado(p.numero_pedido, 'entregado')}
                          className={`flex-1 py-2.5 rounded-lg border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                            estadoActual === 'entregado' 
                             ? 'bg-green-500/10 border-green-500/50 text-green-400 ring-1 ring-green-500/30' 
                             : 'bg-[#111827] border-gray-800 hover:border-green-500/30 text-gray-500 hover:text-green-400'
                          }`}
                        >
                          <CheckCircle size={14} /> ENTREGADO
                        </button>
                      </div>
                    </div>
                    
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
