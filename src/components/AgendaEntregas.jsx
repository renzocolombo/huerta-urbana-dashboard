import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { useState, useMemo, useEffect } from 'react';
import { MapPin, ChevronDown, ChevronUp, MessageCircle, AlertCircle, Package, CheckCircle, Sun, Sunset, Printer, FileText, User, Clock } from 'lucide-react';
import { HOY } from '../data/mockData';

const DIAS_SEMANA = ['Martes', 'Jueves'];
const $$ = (n) => `$${Number(n).toLocaleString('es-AR')}`;

const PAGO_CONFIG = {
  pagado:   { label: 'Pagado',    color: 'text-green-400' },
  pendiente: { label: 'Pendiente', color: 'text-red-400' },
  sin_pago:  { label: 'Sin pago',  color: 'text-gray-500' },
};

export default function AgendaEntregas({ rol }) {
  const { pedidos: PEDIDOS, actualizarEstadoEnSheet } = useGoogleSheets();

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
    
    // Obtener el pedido para saber la fila
    const pedido = PEDIDOS.find(p => p.numero_pedido === id);
    if (pedido && pedido.sheetRowIndex) {
      actualizarEstadoEnSheet(pedido.sheetRowIndex, estadoAAsignar);
    }
  };

  const abrirWhatsApp = (telefono, nombre, producto) => {
    const primerNombre = (nombre || '').split(' ')[0] || "Cliente";
    const msg = encodeURIComponent(`Hola ${primerNombre}! 🥦 Estuvimos armando tu pedido de *${producto || ''}* de Huerta Urbana. Nos pondremos en contacto pronto por la entrega.`);
    window.open(`https://wa.me/${(telefono || '').replace(/\D/g, '')}?text=${msg}`, '_blank');
  };

  const abrirRutaGoogle = () => {
    if (pedidosDelTurno.length === 0) return;

    const origen = 'Labarden 4252, Tortuguitas, Pilar, Buenos Aires';

    const destinos = pedidosDelTurno
      .map(p => `${p.direccion || ''}, ${p.localidad || ''}, Partido de Pilar, Buenos Aires`)
      .join('/');

    const url = `https://www.google.com/maps/dir/${encodeURIComponent(origen)}/${destinos}`;

    window.open(url, '_blank');
  };

  const imprimir = (alcance) => {
    if (rol === 'repartidor') return; // Seguridad extra
    const aImprimir = alcance === 'turno' ? pedidosDelTurno : pedidosDelDia;
    if (aImprimir.length === 0) return;

    const win = window.open('', '_blank');
    
    const styles = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
        
        @page { size: A4; margin: 0; }
        body { font-family: 'Inter', sans-serif; margin: 0; padding: 0; background: white; color: black; line-height: 1.4; }
        
        .hoja { 
          width: 210mm; 
          height: 297mm; 
          position: relative; 
          page-break-after: always; 
          padding: 12mm;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          border: 2px solid #000; /* Borde rectangular que enmarca todo */
        }
        
        /* HEADER (24px para el logo) */
        .header { display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 20px; }
        .header-left { font-size: 24px; font-weight: 800; }
        .header-web { font-size: 12px; color: #333; margin-top: 3px; font-weight: 400; }
        .header-right { text-align: right; font-size: 14px; font-weight: 700; }

        /* DATOS DEL CLIENTE (13px) */
        .client-data { margin-bottom: 25px; font-size: 13px; border-bottom: 1px solid #000; padding-bottom: 15px; }
        .client-info { font-size: 13px; margin-bottom: 5px; }
        .client-info strong { font-weight: 700; width: 110px; display: inline-block; }

        /* PRODUCTOS (12px, sin renglones) */
        .products-section { flex-grow: 1; margin-bottom: 20px; }
        .products-title { font-size: 14px; font-weight: 800; margin-bottom: 15px; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 5px; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; font-size: 12px; font-weight: 800; border-bottom: 1px solid #000; padding: 8px 0; text-transform: uppercase; }
        td { padding: 8px 0; font-size: 12px; border-bottom: none; /* Sin renglones */ }
        .qty { width: 50px; text-align: center; font-weight: 700; }
        .price { width: 100px; text-align: right; font-weight: 700; }

        /* TOTAL (Cuadro pegado al footer) */
        .total-container { display: flex; justify-content: flex-end; margin-bottom: 15px; }
        .total-box { font-size: 16px; font-weight: 800; padding: 10px 20px; border: 2px solid #000; min-width: 200px; text-align: right; }

        /* FOOTER */
        .footer { border-top: 2px solid #000; padding-top: 15px; }
        .signature-row { display: flex; flex-wrap: wrap; gap: 20px; margin-bottom: 15px; font-size: 13px; }
        .linea-puntos { border-bottom: 1px solid #000; display: inline-block; min-width: 150px; margin: 0 5px; height: 18px; }
        .thanks-footer { text-align: center; font-size: 12px; margin-top: 15px; font-weight: 600; }
      </style>
    `;

    const renderHojasPedido = (p) => {
      const crearHoja = (tipo) => {
        return `
          <div class="hoja">
            <div class="header">
              <div class="header-left">
                🌿 HUERTA URBANA
                <div class="header-web">huertaurbana.com.ar | Tel: 11 6177-1376</div>
              </div>
              <div class="header-right">
                PEDIDO: #${p.numero_pedido || '0000'}<br/>
                FECHA: ${p.fecha || p.dia_entrega || ''}<br/>
                REMITO - ${tipo}
              </div>
            </div>

            <div class="client-data">
              <div class="client-info"><strong>CLIENTE:</strong> ${p.nombre || "Consumidor Final"}</div>
              <div class="client-info"><strong>DIRECCIÓN:</strong> ${p.direccion || ""}, ${p.localidad || ""}</div>
              <div class="client-info"><strong>TELÉFONO:</strong> ${p.telefono || ""}</div>
              <div class="client-info"><strong>ENTREGA:</strong> ${p.dia_entrega || ""} (${p.horario_entrega || ""})</div>
              <div class="client-info"><strong>PAGO:</strong> APROBADO ✅</div>
              ${p.observaciones ? `<div class="client-info"><strong>OBS:</strong> ${p.observaciones}</div>` : ""}
            </div>

            <div class="products-section">
              <div class="products-title">Productos:</div>
              <table>
                <thead><tr><th class="qty">Cant</th><th>Descripción</th><th class="price">Subtotal</th></tr></thead>
                <tbody>
                  <tr>
                    <td class="qty">${p.cantidades || 1}</td>
                    <td>${p.producto || ""}</td>
                    <td class="price">$${p.total || 0}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="total-container">
              <div class="total-box">TOTAL A PAGAR: $${p.total || 0}</div>
            </div>

            <div class="footer">
              <div class="signature-row">
                <div>Recibí conforme: <span class="linea-puntos" style="min-width: 200px"></span></div>
              </div>
              <div class="signature-row">
                <div>Firma: <span class="linea-puntos" style="min-width: 180px"></span></div>
                <div>Aclaración: <span class="linea-puntos" style="min-width: 220px"></span></div>
              </div>
              <div class="thanks-footer">
                ¡Gracias por tu compra! 🌿 <strong>huertaurbana.com.ar</strong>
              </div>
            </div>
          </div>
        `;
      };

      return crearHoja("CLIENTE") + crearHoja("COPIA INTERNA");
    };

    win.document.write(`
      <html><head><title>REMITOS - HUERTA URBANA</title>${styles}</head><body>
      ${aImprimir.map((p) => renderHojasPedido(p)).join('')}
      <script>
        window.onload = () => {
          setTimeout(() => {
            window.print();
            window.close();
          }, 500);
        };
      </script>
      </body></html>
    `);

    // Sincronización
    aImprimir.forEach(p => {
      console.log(`[SYNC] Marcando pedido #${p.numero_pedido} como remito_impreso = SI`);
    });
  };

  // Filtrado de pedidos — solo pagos aprobados
  const pedidosDelDia = useMemo(() => {
    return PEDIDOS.filter(p => 
      p.dia_entrega === diaSeleccionado && 
      (p.estado_pago || '').toLowerCase() === 'approved'
    );
  }, [PEDIDOS, diaSeleccionado]);

  const pedidosDelTurno = useMemo(() => {
    return pedidosDelDia.filter(p => {
      const horaInicio = parseInt((p.horario_entrega || '09:00').split(':')[0], 10);
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
        
        {rol !== 'repartidor' && (
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
        )}
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
      <div className="flex items-center justify-between gap-3 mb-4">
        <span className="text-sm font-medium text-white bg-gray-800 px-3 py-1 rounded-lg border border-gray-700 w-fit">
          {pedidosDelTurno.length} pedidos
        </span>
        {pedidosDelTurno.length > 0 && (
          <button 
            onClick={abrirRutaGoogle}
            className="flex items-center gap-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 font-bold px-4 py-2 rounded-xl text-sm transition-all hover:scale-[1.02] shadow-[0_0_15px_rgba(99,102,241,0.1)] shrink-0"
          >
            🗺️ Abrir ruta del turno
          </button>
        )}
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
            const estadoActual = (estados[p.numero_pedido] || p.estado || 'pendiente').toLowerCase();

            // Configuración visual por estado
            const configEstado = {
              pendiente:    { icon: '⚪', label: 'PENDIENTE', color: 'text-amber-400',  bg: 'bg-amber-500/5',  border: 'border-amber-500/10' },
              preparado:    { icon: '🟡', label: 'PREPARADO', color: 'text-amber-400',  bg: 'bg-amber-500/5',  border: 'border-amber-500/10' },
              listo:        { icon: '🟡', label: 'PREPARADO', color: 'text-amber-400',  bg: 'bg-amber-500/5',  border: 'border-amber-500/10' },
              entregado:    { icon: '✅', label: 'ENTREGADO', color: 'text-green-400',  bg: 'bg-green-500/10', border: 'border-green-500/30' },
              no_entregado: { icon: '❌', label: 'NO ENTREGADO', color: 'text-red-400', bg: 'bg-red-500/10',   border: 'border-red-500/30' },
            };

            const conf = configEstado[estadoActual] || configEstado.pendiente;

            return (
              <div 
                key={p.numero_pedido} 
                className={`transition-all duration-300 rounded-2xl overflow-hidden border ${conf.bg} ${isOpen ? 'ring-1 ring-white/10' : conf.border}`}
              >
                
                {/* Cabecera (Click para expandir) */}
                <div 
                  className="px-4 pr-5 py-4 flex items-center justify-between cursor-pointer hover:bg-white/5"
                  onClick={() => toggleAcordeon(p.numero_pedido)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-black/40 rounded-xl flex items-center justify-center border border-white/10 text-lg">
                       {conf.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-sm text-white">
                          {p.nombre}
                        </p>
                        <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded border ${conf.color} ${conf.border} bg-black/20`}>
                          {conf.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-gray-500 flex items-center gap-0.5"><MapPin size={10} /> {p.localidad}</span>
                        <span className="text-[11px] text-gray-500 flex items-center gap-0.5"><Clock size={10} /> {p.horario_entrega}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                     <button className="text-gray-500 bg-black/40 p-1.5 rounded-lg border border-white/10">
                       {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                     </button>
                  </div>
                </div>

                {/* Contenido del Acordeón */}
                {isOpen && (
                  <div className="px-5 pb-5 pt-2 border-t border-white/5 bg-black/20 slide-in space-y-5">
                    
                    {/* Detalles Flex */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                       
                       {/* Lista de productos y observaciones */}
                       <div className="space-y-4">
                         <div className="bg-black/40 border border-white/5 p-3 rounded-xl flex justify-between items-center">
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

                         <div className="bg-black/40 border border-white/5 p-3 rounded-xl">
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

                         <div className="bg-black/40 border border-white/5 flex flex-col justify-center p-4 rounded-xl flex-1">
                           {rol !== 'repartidor' ? (
                             <>
                               <div className="flex justify-between items-end mb-2">
                                 <span className="text-gray-400 text-xs">Total del pedido</span>
                                 <span className="text-xl font-bold text-white">${p.total}</span>
                               </div>
                               <div className="flex justify-between items-center border-t border-white/5 pt-2 mt-1 text-sm">
                                 <span className="text-gray-500">Estado de pago</span>
                                 <span className={`font-bold ${PAGO_CONFIG[p.estado_pago]?.color}`}>
                                   {(PAGO_CONFIG[p.estado_pago]?.label || '').toUpperCase()}
                                 </span>
                               </div>
                             </>
                           ) : (
                             <div className="flex items-center justify-center h-full text-gray-500 italic text-xs">
                               Datos de facturación ocultos
                             </div>
                           )}
                         </div>
                       </div>
                    </div>

                    {/* Botonera de flujo Dinámica */}
                    {rol === 'repartidor' ? (
                      <div className="bg-black/60 border border-white/10 rounded-2xl p-5 shadow-inner">
                        <p className="text-center text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em] mb-4">Actualizar Entrega</p>
                        
                        <div className="flex gap-3">
                          {/* Botón NO ENTREGADO */}
                          <button
                            onClick={() => actualizarEstado(p.numero_pedido, estadoActual === 'no_entregado' ? 'preparado' : 'no_entregado')}
                            className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-4 rounded-2xl border font-black text-xs transition-all active:scale-95 ${
                              estadoActual === 'no_entregado'
                                ? 'bg-red-500 text-white border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.4)]'
                                : 'bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500/20'
                            }`}
                          >
                            <span className="text-xl">❌</span>
                            NO ENTREGADO
                          </button>

                          {/* Botón ENTREGADO */}
                          <button
                            onClick={() => actualizarEstado(p.numero_pedido, estadoActual === 'entregado' ? 'preparado' : 'entregado')}
                            className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-4 rounded-2xl border font-black text-xs transition-all active:scale-95 ${
                              estadoActual === 'entregado'
                                ? 'bg-green-500 text-white border-green-400 shadow-[0_0_20px_rgba(34,197,94,0.4)]'
                                : 'bg-green-500/10 border-green-500/20 text-green-500 hover:bg-green-500/20'
                            }`}
                          >
                            <span className="text-xl">✅</span>
                            ENTREGADO
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                        <p className="text-center text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-3">Actualizar estado logístico (Admin)</p>
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
                            onClick={() => actualizarEstado(p.numero_pedido, estadoActual === 'entregado' ? 'preparado' : 'entregado')}
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
                    )}

                    {/* Info de seguridad (Solo repartidor) */}
                    {rol === 'repartidor' && (
                      <p className="text-center text-[9px] text-gray-600 mt-4 leading-relaxed italic">
                        Los estados "Pendiente" y "Preparado" son solo de lectura para el repartidor. 
                        Cualquier cambio se sincronizará automáticamente con el Google Sheet.
                      </p>
                    )}
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
