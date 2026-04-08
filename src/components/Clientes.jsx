import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MessageCircle, ShoppingBag, DollarSign, Calendar, ShoppingCart, AlertTriangle } from 'lucide-react';

const $$ = (n) => `$${Number(n).toLocaleString('es-AR')}`;

export default function Clientes() {
  const { pedidos: PEDIDOS, actualizarDatosCliente } = useGoogleSheets();

  const [cuponActivo, setCuponActivo] = useState(true);

  // Clientes reales: al menos un pedido con estado_pago === 'approved'
  const clientes = useMemo(() => {
    const mapa = {};
    PEDIDOS.forEach(p => {
      if ((p.estado_pago || '').toLowerCase() !== 'approved') return;
      if (!mapa[p.email]) {
        mapa[p.email] = {
          nombre: p.nombre,
          telefono: p.telefono,
          email: p.email,
          localidad: p.localidad,
          pedidos: 0,
          totalGastado: 0,
          ultimoPedido: '',
          sheetRowIndex: p.sheetRowIndex,
          cupon: (p.cupon || '').trim().toUpperCase(),
          cupon_bienvenida_estado: p.cupon_bienvenida_estado || '',
          codigo_referido: p.codigo_referido || '',
          referido_estado: p.referido_estado || '',
          referidos_count: parseInt(p.referidos_count) || 0,
          credito_acumulado: parseInt(p.credito_acumulado) || 0
        };
      }
      mapa[p.email].pedidos += 1;
      mapa[p.email].totalGastado += p.total;

      if (p.fecha > mapa[p.email].ultimoPedido) {
        mapa[p.email].ultimoPedido = p.fecha;
        mapa[p.email].sheetRowIndex = p.sheetRowIndex;
      }
      
      // Merge states: si alguna vez compró con el cupón o tiene un progreso guardado, rescatarlo
      if ((p.cupon || '').toUpperCase() === 'BIENVENIDO10') mapa[p.email].cupon = 'BIENVENIDO10';
      if (p.cupon_bienvenida_estado) mapa[p.email].cupon_bienvenida_estado = p.cupon_bienvenida_estado;
      if (p.codigo_referido) mapa[p.email].codigo_referido = p.codigo_referido;
      if (p.referido_estado) mapa[p.email].referido_estado = p.referido_estado;
      if (p.referidos_count) mapa[p.email].referidos_count = parseInt(p.referidos_count);
      if (p.credito_acumulado) mapa[p.email].credito_acumulado = parseInt(p.credito_acumulado);
    });
    return Object.values(mapa).sort((a, b) => b.totalGastado - a.totalGastado);
  }, [PEDIDOS]);

  // Carritos abandonados: pedidos con datos del cliente pero sin pago aprobado
  const carritosAbandonados = useMemo(() => {
    return PEDIDOS.filter(p => {
      const estadoPago = (p.estado_pago || '').toLowerCase().trim();
      const tieneAprobado = estadoPago === 'approved';
      const tieneDatos = !!(p.nombre || p.telefono);
      return !tieneAprobado && tieneDatos;
    }).sort((a, b) => (b.fecha > a.fecha ? 1 : -1));
  }, [PEDIDOS]);

  const abrirWhatsApp = (tel, nombre) => {
    const msg = encodeURIComponent(`Hola ${nombre.split(' ')[0]}! 👋 ¿Cómo estás? Te escribimos desde Huerta Urbana 🥦`);
    window.open(`https://wa.me/${(tel || '').replace(/\D/g, '')}?text=${msg}`, '_blank');
  };

  const abrirRecuperacion = (tel, nombre, producto) => {
    const primerNombre = (nombre || '').split(' ')[0] || 'ahí';
    const msg = encodeURIComponent(
      `Hola ${primerNombre}! 🌿 Vimos que casi completaste tu pedido de *${producto || 'Huerta Urbana'}*. ¿Querés que te ayudemos a finalizarlo? Estamos a disposición 🥦`
    );
    window.open(`https://wa.me/${(tel || '').replace(/\D/g, '')}?text=${msg}`, '_blank');
  };

  const enviarCuponBienvenida = (c) => {
    if (actualizarDatosCliente) actualizarDatosCliente(c.sheetRowIndex, { cupon_bienvenida_estado: 'Enviado' });
    const primerNombre = (c.nombre || '').split(' ')[0] || 'Cliente';
    const msg = encodeURIComponent(`Hola ${primerNombre}! 🌿\nTe regalamos un cupón de bienvenida:\n🎁 *BIENVENIDO10* — 10% off en tu próxima compra\nUso único — sin vencimiento\n\nQue tengas un excelente día!\nHuerta Urbana — 11 6177-1376`);
    window.open(`https://wa.me/${(c.telefono || '').replace(/\D/g, '')}?text=${msg}`, '_blank');
  };

  const enviarCodigoReferido = (c) => {
    let codigo = c.codigo_referido;
    if (!codigo) {
      const iniciales = (c.nombre || 'USR').split(' ')[0].toUpperCase().replace(/[^A-Z]/g, '');
      const num = Math.floor(1000 + Math.random() * 9000);
      codigo = `${iniciales}${num}`;
    }
    if (actualizarDatosCliente) actualizarDatosCliente(c.sheetRowIndex, { codigo_referido: codigo, referido_estado: 'Enviado' });
    
    const primerNombre = (c.nombre || '').split(' ')[0] || 'Cliente';
    const msg = encodeURIComponent(`Hola ${primerNombre}! 🌿\nTu código de referido personal:\n👥 *${codigo}*\n\nCompartilo con amigos y familia:\n✅ Ellos reciben 10% de descuento\n✅ Vos recibís $5.000 de crédito por cada uno\nSin límite de referidos — válido 30 días!\n\nQue tengas un excelente día!\nHuerta Urbana — 11 6177-1376`);
    window.open(`https://wa.me/${(c.telefono || '').replace(/\D/g, '')}?text=${msg}`, '_blank');
  };

  const renderWidgetBienvenida = (c) => {
    if (!cuponActivo) {
      return (
        <div className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border border-gray-800 bg-[#111827] opacity-60 h-24">
          <span className="text-xl">⚫</span>
          <span className="text-[10px] font-bold text-gray-500 uppercase text-center leading-none">Inactivo</span>
        </div>
      );
    }
    if (c.cupon === 'BIENVENIDO10') {
      return (
        <div className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border border-green-500/30 bg-green-500/10 h-24">
          <span className="text-xl">🟢</span>
          <span className="text-[10px] font-bold text-green-400 uppercase text-center leading-tight">BIENVENIDO10<br/><span className="text-white opacity-80 mt-1 block">— Usado —</span></span>
        </div>
      );
    }
    if (c.cupon_bienvenida_estado === 'Enviado') {
      return (
        <div className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border border-blue-500/30 bg-blue-500/10 h-24">
          <span className="text-xl">🔵</span>
          <span className="text-[10px] font-bold text-blue-400 uppercase text-center leading-tight">Enviado<br/><span className="text-white opacity-80 mt-1 block">— Pendiente —</span></span>
        </div>
      );
    }
    return (
      <button 
        onClick={() => enviarCuponBienvenida(c)}
        className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border border-gray-700 bg-gray-800/50 hover:bg-gray-800 active:scale-95 transition-all text-left h-24"
      >
        <span className="text-xl">🔘</span>
        <span className="text-[10px] font-bold text-gray-400 uppercase text-center leading-tight">Sin cupón</span>
        <span className="text-[10px] mt-0.5 text-green-400 font-bold bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded flex items-center justify-center gap-1 w-full"><GiftIcon/> Enviar</span>
      </button>
    );
  };

  const renderWidgetReferido = (c) => {
    if (c.referidos_count > 0) {
      return (
        <div className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 h-24 relative overflow-hidden">
          <div className="absolute inset-0 bg-yellow-500/5 blur-xl"></div>
          <span className="text-xl relative z-10">⭐</span>
          <span className="text-[10px] font-bold text-amber-400 uppercase text-center leading-tight relative z-10">{c.referidos_count} Referidos<br/><span className="text-white text-base mt-0.5 block">{c.credito_acumulado ? $$(c.credito_acumulado) : "$0"}</span></span>
        </div>
      );
    }
    if (c.referido_estado === 'Enviado') {
      return (
        <div className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border border-blue-500/30 bg-blue-500/10 h-24">
          <span className="text-xl">🔵</span>
          <span className="text-[10px] font-bold text-blue-400 uppercase text-center leading-tight">Enviado<br/><span className="text-blue-300 opacity-90 mt-1 block text-[11px] bg-blue-500/20 px-2 py-0.5 rounded border border-blue-500/20">{c.codigo_referido}</span></span>
        </div>
      );
    }
    return (
      <button 
        onClick={() => enviarCodigoReferido(c)}
        className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border border-gray-700 bg-gray-800/50 hover:bg-gray-800 active:scale-95 transition-all text-left h-24"
      >
        <span className="text-xl">🔘</span>
        <span className="text-[10px] font-bold text-gray-400 uppercase text-center leading-tight">No enviado</span>
        <span className="text-[10px] mt-0.5 text-blue-400 font-bold bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded flex items-center justify-center gap-1 w-full"><UsersIcon/> Generar</span>
      </button>
    );
  };

  const GiftIcon = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"></polyline><rect x="2" y="7" width="20" height="5"></rect><line x1="12" y1="22" x2="12" y2="7"></line><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path></svg>;
  const UsersIcon = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;

  return (
    <div className="space-y-10">

      {/* ── CLIENTES REALES ─────────────────────────────── */}
      <div>
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white">Clientes</h2>
            <p className="text-gray-500 text-sm mt-1">
              {clientes.length} clientes con pago aprobado
            </p>
          </div>
          
          {/* Toggle Cupón Global */}
          <div className="flex items-center gap-3 bg-[#1f2937] border border-gray-800 px-4 py-2.5 rounded-xl shrink-0 shadow-lg">
            <span className="text-xs font-bold text-white uppercase">BIENVENIDO10</span>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-black uppercase tracking-wider ${cuponActivo ? 'text-green-400' : 'text-gray-500'}`}>
                {cuponActivo ? '🟢 Activo' : '⚫ Inactivo'}
              </span>
              <button 
                onClick={() => setCuponActivo(!cuponActivo)}
                className={`w-11 h-6 rounded-full relative transition-colors ${cuponActivo ? 'bg-green-500' : 'bg-gray-700'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${cuponActivo ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
          </div>
        </div>

        {clientes.length === 0 ? (
          <div className="bg-[#1f2937] border border-gray-800 rounded-2xl p-10 text-center">
            <ShoppingBag size={32} className="text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500">Aún no hay clientes con pagos aprobados.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {clientes.map(c => (
              <div key={c.email} className="bg-[#1f2937] border border-gray-800 rounded-2xl p-5 hover:border-gray-700 transition-all fade-in">
                {/* Avatar + nombre */}
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-400 font-bold text-sm shrink-0">
                    {(c.nombre || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-white text-sm truncate">{c.nombre}</p>
                    <p className="text-xs text-gray-500 truncate">{c.localidad}</p>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="bg-[#111827] rounded-xl p-2 text-center">
                    <ShoppingBag size={12} className="text-gray-500 mx-auto mb-1" />
                    <p className="text-base font-bold text-white">{c.pedidos}</p>
                    <p className="text-[10px] text-gray-500">Pedidos</p>
                  </div>
                  <div className="bg-[#111827] rounded-xl p-2 text-center">
                    <DollarSign size={12} className="text-gray-500 mx-auto mb-1" />
                    <p className="text-xs font-bold text-green-400">{$$(c.totalGastado)}</p>
                    <p className="text-[10px] text-gray-500">Gastado</p>
                  </div>
                  <div className="bg-[#111827] rounded-xl p-2 text-center">
                    <Calendar size={12} className="text-gray-500 mx-auto mb-1" />
                    <p className="text-[10px] font-bold text-white">
                      {c.ultimoPedido ? c.ultimoPedido.split('-').reverse().join('/') : '-'}
                    </p>
                    <p className="text-[10px] text-gray-500">Último</p>
                  </div>
                </div>

                {/* FIDELIZACIÓN (Cupones y referidos) */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {renderWidgetBienvenida(c)}
                  {renderWidgetReferido(c)}
                </div>

                {/* Botón WhatsApp */}
                <button
                  onClick={() => abrirWhatsApp(c.telefono, c.nombre)}
                  className="w-full flex items-center justify-center gap-2 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 text-xs font-medium py-2 rounded-xl transition-all"
                >
                  <MessageCircle size={13} />
                  Contactar por WhatsApp
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── CARRITOS ABANDONADOS ─────────────────────────── */}
      <div>
        <div className="mb-6 flex items-start gap-3">
          <div className="w-9 h-9 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center shrink-0">
            <ShoppingCart size={18} className="text-amber-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Carritos Abandonados</h2>
            <p className="text-gray-500 text-sm mt-0.5">
              {carritosAbandonados.length} contactos que completaron el formulario pero no pagaron
            </p>
          </div>
        </div>

        {carritosAbandonados.length === 0 ? (
          <div className="bg-[#1f2937] border border-gray-800 rounded-2xl p-10 text-center">
            <AlertTriangle size={32} className="text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500">No hay carritos abandonados registrados.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {carritosAbandonados.map(c => (
              <div key={c.email} className="bg-[#1f2937] border border-amber-500/20 rounded-2xl p-5 hover:border-amber-500/40 transition-all fade-in">
                {/* Badge */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-sm shrink-0">
                      {(c.nombre || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-white text-sm truncate">{c.nombre}</p>
                      <p className="text-xs text-gray-500 truncate">{c.localidad}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-lg shrink-0">
                    No pagó
                  </span>
                </div>

                {/* Info del carrito */}
                <div className="bg-[#111827] border border-gray-800 rounded-xl p-3 mb-4 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] text-gray-500">Producto</span>
                    <span className="text-xs font-medium text-white truncate max-w-[60%] text-right">{c.producto || '-'}</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-gray-800 pt-1.5">
                    <span className="text-[11px] text-gray-500">Monto</span>
                    <span className="text-xs font-bold text-amber-400">{$$(c.total)}</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-gray-800 pt-1.5">
                    <span className="text-[11px] text-gray-500">Fecha</span>
                    <span className="text-xs text-gray-400">
                      {c.fecha ? c.fecha.split('-').reverse().join('/') : '-'}
                    </span>
                  </div>
                </div>

                {/* Botón de recuperación */}
                <button
                  onClick={() => abrirRecuperacion(c.telefono, c.nombre, c.producto)}
                  className="w-full flex items-center justify-center gap-2 bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/30 text-[#25D366] text-xs font-bold py-2.5 rounded-xl transition-all"
                >
                  <MessageCircle size={13} />
                  Recuperar por WhatsApp
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
