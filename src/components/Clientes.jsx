import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MessageCircle, ShoppingBag, DollarSign, Calendar, ShoppingCart, AlertTriangle } from 'lucide-react';

const $$ = (n) => `$${Number(n).toLocaleString('es-AR')}`;

export default function Clientes() {
  const { pedidos: PEDIDOS } = useGoogleSheets();

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
        };
      }
      mapa[p.email].pedidos += 1;
      mapa[p.email].totalGastado += p.total;
      if (p.fecha > mapa[p.email].ultimoPedido) {
        mapa[p.email].ultimoPedido = p.fecha;
      }
    });
    return Object.values(mapa).sort((a, b) => b.totalGastado - a.totalGastado);
  }, [PEDIDOS]);

  // Emails de clientes reales para excluirlos de carritos
  const emailsAprobados = useMemo(() => new Set(clientes.map(c => c.email)), [clientes]);

  // Carritos abandonados: formulario enviado pero ningún pedido con 'approved'
  const carritosAbandonados = useMemo(() => {
    const mapa = {};
    PEDIDOS.forEach(p => {
      // Solo incluir si el email NO tiene ningún pago aprobado
      if (emailsAprobados.has(p.email)) return;
      if (!mapa[p.email]) {
        mapa[p.email] = {
          nombre: p.nombre,
          telefono: p.telefono,
          email: p.email,
          localidad: p.localidad,
          producto: p.producto,
          total: p.total,
          fecha: p.fecha,
          estado_pago: p.estado_pago,
        };
      }
    });
    return Object.values(mapa).sort((a, b) => (b.fecha > a.fecha ? 1 : -1));
  }, [PEDIDOS, emailsAprobados]);

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

  return (
    <div className="space-y-10">

      {/* ── CLIENTES REALES ─────────────────────────────── */}
      <div>
        <div className="mb-6">
          <h2 className="text-xl font-bold text-white">Clientes</h2>
          <p className="text-gray-500 text-sm mt-1">
            {clientes.length} clientes con pago aprobado
          </p>
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
