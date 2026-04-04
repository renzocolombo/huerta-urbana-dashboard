import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MapPin, ChevronDown, ChevronUp, MessageCircle, AlertCircle, Package, CheckCircle, Sun, Sunset, Printer, FileText, Clock } from 'lucide-react';

const DIAS_SEMANA = ['Martes', 'Jueves'];

const PAGO_CONFIG = {
  pagado:   { label: 'Pagado',    color: 'text-green-400' },
  pendiente: { label: 'Pendiente', color: 'text-red-400' },
  sin_pago:  { label: 'Sin pago',  color: 'text-gray-500' },
};

export default function AgendaEntregas({ rol }) {
  const { pedidos: PEDIDOS, actualizarEstadoEnSheet } = useGoogleSheets();

  const [diaSeleccionado, setDiaSeleccionado] = useState(DIAS_SEMANA[0]);
  const [turnoSeleccionado, setTurnoSeleccionado] = useState('Manana'); // 'Manana' | 'Tarde'

  const [pedidosAbiertos, setPedidosAbiertos] = useState({});

  const toggleAcordeon = (id) => {
    setPedidosAbiertos(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const actualizarEstado = (id, estadoAAsignar) => {
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
    if (rol === 'repartidor') return;
    const aImprimir = alcance === 'turno' ? pedidosDelTurno : pedidosDelDia;
    if (aImprimir.length === 0) return;

    const win = window.open('', '_blank');
    const styles = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
        @page { size: A4; margin: 0; }
        body { font-family: 'Inter', sans-serif; margin: 0; padding: 0; background: white; color: black; line-height: 1.4; }
        .hoja { width: 210mm; height: 297mm; position: relative; page-break-after: always; padding: 12mm; box-sizing: border-box; display: flex; flex-direction: column; border: 2px solid #000; }
        .header { display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 20px; }
        .header-left { font-size: 24px; font-weight: 800; }
        .header-web { font-size: 12px; color: #333; margin-top: 3px; font-weight: 400; }
        .header-right { text-align: right; font-size: 14px; font-weight: 700; }
        .client-data { margin-bottom: 25px; font-size: 13px; border-bottom: 1px solid #000; padding-bottom: 15px; }
        .client-info { font-size: 13px; margin-bottom: 5px; }
        .client-info strong { font-weight: 700; width: 110px; display: inline-block; }
        .products-section { flex-grow: 1; margin-bottom: 20px; }
        .products-title { font-size: 14px; font-weight: 800; margin-bottom: 15px; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 5px; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; font-size: 12px; font-weight: 800; border-bottom: 1px solid #000; padding: 8px 0; text-transform: uppercase; }
        td { padding: 8px 0; font-size: 12px; }
        .total-container { display: flex; justify-content: flex-end; margin-bottom: 15px; }
        .total-box { font-size: 16px; font-weight: 800; padding: 10px 20px; border: 2px solid #000; min-width: 200px; text-align: right; }
        .footer { border-top: 2px solid #000; padding-top: 15px; }
        .signature-row { display: flex; flex-wrap: wrap; gap: 20px; margin-bottom: 15px; font-size: 13px; }
        .linea-puntos { border-bottom: 1px solid #000; display: inline-block; min-width: 150px; margin: 0 5px; height: 18px; }
        .thanks-footer { text-align: center; font-size: 12px; margin-top: 15px; font-weight: 600; }
      </style>
    `;

    const renderHojasPedido = (p) => {
      const crearHoja = (tipo) => `
        <div class="hoja">
          <div class="header">
            <div class="header-left">🌿 HUERTA URBANA<div class="header-web">huertaurbana.com.ar | Tel: 11 6177-1376</div></div>
            <div class="header-right">PEDIDO: #${p.numero_pedido || '0000'}<br/>FECHA: ${p.fecha || p.dia_entrega || ''}<br/>REMITO - ${tipo}</div>
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
              <thead><tr><th style="width:50px;text-align:center">Cant</th><th>Descripción</th><th style="width:100px;text-align:right">Subtotal</th></tr></thead>
              <tbody><tr><td style="text-align:center">${p.cantidades || 1}</td><td>${p.producto || ""}</td><td style="text-align:right">$${p.total || 0}</td></tr></tbody>
            </table>
          </div>
          <div class="total-container"><div class="total-box">TOTAL A PAGAR: $${p.total || 0}</div></div>
          <div class="footer">
            <div class="signature-row"><div>Recibí conforme: <span class="linea-puntos" style="min-width: 200px"></span></div></div>
            <div class="signature-row"><div>Firma: <span class="linea-puntos" style="min-width: 180px"></span></div><div>Aclaración: <span class="linea-puntos" style="min-width: 220px"></span></div></div>
            <div class="thanks-footer">¡Gracias por tu compra! 🌿 <strong>huertaurbana.com.ar</strong></div>
          </div>
        </div>
      `;
      return crearHoja("CLIENTE") + crearHoja("COPIA INTERNA");
    };

    win.document.write(`<html><head><title>REMITOS</title>${styles}</head><body>${aImprimir.map(renderHojasPedido).join('')}<script>window.onload=()=>{setTimeout(()=>{window.print();window.close();},500);};</script></body></html>`);
  };

  const pedidosDelDia = useMemo(() => {
    return PEDIDOS.filter(p => p.dia_entrega === diaSeleccionado && (p.estado_pago || '').toLowerCase() === 'approved');
  }, [PEDIDOS, diaSeleccionado]);

  const pedidosDelTurno = useMemo(() => {
    return pedidosDelDia.filter(p => {
      const horaInicio = parseInt((p.horario_entrega || '09:00').split(':')[0], 10);
      const isManana = isNaN(horaInicio) || horaInicio < 13;
      return (turnoSeleccionado === 'Manana' && isManana) || (turnoSeleccionado === 'Tarde' && !isManana);
    });
  }, [pedidosDelDia, turnoSeleccionado]);

  return (
    <div className="p-1 sm:p-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Agenda de Entregas</h2>
          <p className="text-gray-500 text-sm mt-1">{rol === 'repartidor' ? 'Vista de Reparto' : 'Gestión Operativa e Impresión'}</p>
        </div>
        
        {rol !== 'repartidor' && (
          <div className="flex flex-col sm:flex-row gap-2">
            <button onClick={() => imprimir('turno')} className="flex items-center justify-center gap-2 bg-[#1f2937] hover:bg-gray-800 border border-gray-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-all">
              <Printer size={15} /> Imprimir Turno
            </button>
            <button onClick={() => imprimir('dia')} className="flex items-center justify-center gap-2 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 font-medium px-4 py-2 rounded-xl text-sm transition-all">
              <FileText size={15} /> Imprimir Día
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {DIAS_SEMANA.map(dia => (
          <button key={dia} onClick={() => { setDiaSeleccionado(dia); setPedidosAbiertos({}); }}
            className={`whitespace-nowrap px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${diaSeleccionado === dia ? 'bg-green-500 text-white' : 'bg-[#1f2937] border border-gray-800 text-gray-400'}`}>
            {dia}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-6 bg-[#1f2937]/50 p-1.5 rounded-2xl w-fit">
        <button onClick={() => setTurnoSeleccionado('Manana')} className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all ${turnoSeleccionado === 'Manana' ? 'bg-[#111827] text-amber-400 border border-gray-700' : 'text-gray-500'}`}>
          <Sun size={16} /> Mañana
        </button>
        <button onClick={() => setTurnoSeleccionado('Tarde')} className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all ${turnoSeleccionado === 'Tarde' ? 'bg-[#111827] text-indigo-400 border border-gray-700' : 'text-gray-500'}`}>
          <Sunset size={16} /> Tarde
        </button>
      </div>

      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-white bg-gray-800 px-3 py-1 rounded-lg border border-gray-700">{pedidosDelTurno.length} pedidos</span>
        {pedidosDelTurno.length > 0 && (
          <button onClick={abrirRutaGoogle} className="flex items-center gap-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 font-bold px-4 py-2 rounded-xl text-sm transition-all">
            🗺️ Abrir ruta
          </button>
        )}
      </div>

      {pedidosDelTurno.length === 0 ? (
        <div className="bg-[#1f2937] border border-gray-800 rounded-2xl p-12 text-center text-gray-500">No hay entregas asignadas.</div>
      ) : (
        <div className="space-y-3">
          {pedidosDelTurno.map(p => {
            const isOpen = !!pedidosAbiertos[p.numero_pedido];
            const estadoActual = (p.estado || 'pendiente').toLowerCase();
            const configEstado = {
              pendiente:    { icon: '🟡', label: 'PREPARADO', color: 'text-amber-400',  bg: 'bg-amber-500/5',  border: 'border-amber-500/10' },
              preparado:    { icon: '🟡', label: 'PREPARADO', color: 'text-amber-400',  bg: 'bg-amber-500/5',  border: 'border-amber-500/10' },
              listo:        { icon: '🟡', label: 'PREPARADO', color: 'text-amber-400',  bg: 'bg-amber-500/5',  border: 'border-amber-500/10' },
              entregado:    { icon: '✅', label: 'ENTREGADO', color: 'text-green-500',  bg: 'bg-green-500/10', border: 'border-green-500/30' },
              no_entregado: { icon: '❌', label: 'NO ENTREGADO', color: 'text-red-500', bg: 'bg-red-500/10',   border: 'border-red-500/30' },
            };
            const conf = configEstado[estadoActual] || configEstado.pendiente;

            // Estética Rider Premium (Aura de Color Total)
            let riderBg = '';
            if (rol === 'repartidor') {
              if (estadoActual === 'entregado') riderBg = 'bg-green-500/15 border-green-500/40 text-green-400';
              else if (estadoActual === 'no_entregado') riderBg = 'bg-red-500/15 border-red-500/40 text-red-500';
              else riderBg = 'bg-amber-500/15 border-amber-500/40 text-amber-500'; // Dorado Premium (Oro)
            }

            return (
              <div key={p.numero_pedido} className={`transition-all duration-300 rounded-2xl overflow-hidden border ${riderBg || (conf.bg + ' ' + conf.border)} ${isOpen ? 'ring-2 ring-white/10' : ''} ${estadoActual === 'entregado' && rol !== 'repartidor' ? 'opacity-80' : ''}`}>
                <div className="px-4 py-4 flex items-center justify-between cursor-pointer" onClick={() => toggleAcordeon(p.numero_pedido)}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${riderBg ? 'bg-white/40 border-black/10' : 'bg-black/40 border-white/10'}`}>
                       {conf.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className={`font-bold ${riderBg ? 'text-lg' : 'text-sm'} ${riderBg ? 'text-inherit' : 'text-white'} ${estadoActual === 'entregado' && rol !== 'repartidor' ? 'text-gray-400 line-through decoration-green-500/50' : ''}`}>
                          {p.nombre}
                        </p>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border ${riderBg ? 'bg-transparent border-current opacity-80' : (conf.color + ' ' + conf.border + ' bg-black/20')}`}>
                          {conf.icon} {conf.label}
                        </span>
                      </div>
                      <p className={`text-[11px] font-medium ${riderBg ? 'opacity-80' : 'text-gray-500'}`}>{p.direccion} • {p.localidad}</p>
                    </div>
                  </div>
                  <div className={riderBg ? 'text-inherit' : 'text-gray-500'}>{isOpen ? <ChevronUp /> : <ChevronDown />}</div>
                </div>

                {isOpen && (
                  <div className="px-4 pb-5 pt-2 border-t border-black/5 space-y-4">
                    <div className={`p-3 rounded-xl border ${riderBg ? 'bg-white/40 border-black/10 text-black' : 'bg-black/40 border-white/10 text-white'}`}>
                      <p className="text-xs font-bold uppercase opacity-60 mb-1">Pedido</p>
                      <p className="font-semibold">{p.producto} x{p.cantidades}</p>
                      {p.observaciones && <p className="mt-2 text-sm italic opacity-80">"{p.observaciones}"</p>}
                    </div>

                    <div className="flex gap-2">
                      <button onClick={() => abrirWhatsApp(p.telefono, p.nombre, p.producto)} className="flex-1 flex items-center justify-center gap-2 bg-[#25D366] text-white font-bold py-3 rounded-xl shadow-lg">
                        <MessageCircle size={18} /> WhatsApp
                      </button>
                      {rol !== 'repartidor' && (
                        <div className="bg-black/40 border border-white/10 p-3 rounded-xl flex-1 text-right">
                          <p className="text-[10px] text-gray-500 uppercase">Total</p>
                          <p className="text-xl font-bold text-white">${p.total}</p>
                        </div>
                      )}
                    </div>

                    {rol === 'repartidor' ? (
                      <div className="flex justify-center gap-4 pt-4 border-t border-white/5">
                        <button 
                          onClick={() => actualizarEstado(p.numero_pedido, 'entregado')} 
                          className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center gap-1 shadow-lg transition-all active:scale-95 ${estadoActual === 'entregado' ? 'bg-green-500 text-white shadow-green-500/30 ring-2 ring-white/20' : 'bg-gray-800 text-green-400 border border-green-500/20 hover:bg-green-500/10'}`}
                        >
                          <span className="text-xl">✅</span>
                          <span className="text-[8px] font-black uppercase">Entr</span>
                        </button>
                        <button 
                          onClick={() => actualizarEstado(p.numero_pedido, 'no_entregado')} 
                          className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center gap-1 shadow-lg transition-all active:scale-95 ${estadoActual === 'no_entregado' ? 'bg-red-500 text-white shadow-red-500/30 ring-2 ring-white/20' : 'bg-gray-800 text-red-400 border border-red-500/20 hover:bg-red-500/10'}`}
                        >
                          <span className="text-xl">❌</span>
                          <span className="text-[8px] font-black uppercase">No Entr</span>
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 pt-2">
                        <button onClick={() => actualizarEstado(p.numero_pedido, 'pendiente')} className={`py-2 rounded-lg text-[10px] font-bold border transition-all ${estadoActual === 'pendiente' ? 'bg-amber-500 text-white' : 'bg-gray-800 text-gray-400 border-gray-700'}`}>PENDIENTE</button>
                        <button onClick={() => actualizarEstado(p.numero_pedido, 'preparado')} className={`py-2 rounded-lg text-[10px] font-bold border transition-all ${estadoActual === 'preparado' ? 'bg-blue-500 text-white' : 'bg-gray-800 text-gray-400 border-gray-700'}`}>PREPARADO</button>
                        <button onClick={() => actualizarEstado(p.numero_pedido, 'entregado')} className={`py-2 rounded-lg text-[10px] font-bold border transition-all ${estadoActual === 'entregado' ? 'bg-green-500 text-white' : 'bg-gray-800 text-gray-400 border-gray-700'}`}>ENTREGADO</button>
                      </div>
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
