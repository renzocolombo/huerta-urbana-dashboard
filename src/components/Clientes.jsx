import { useMemo } from 'react';
import { MessageCircle, ShoppingBag, DollarSign, Calendar } from 'lucide-react';
import { PEDIDOS } from '../data/mockData';

const $$ = (n) => `$${Number(n).toLocaleString('es-AR')}`;

export default function Clientes() {
  const clientes = useMemo(() => {
    const mapa = {};
    PEDIDOS.forEach(p => {
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
  }, []);

  const abrirWhatsApp = (tel, nombre) => {
    const msg = encodeURIComponent(`Hola ${nombre.split(' ')[0]}! 👋 ¿Cómo estás? Te escribimos desde Huerta Urbana 🥦`);
    window.open(`https://wa.me/${tel.replace(/\D/g,'')}?text=${msg}`, '_blank');
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">Clientes</h2>
        <p className="text-gray-500 text-sm mt-1">{clientes.length} clientes únicos</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {clientes.map(c => (
          <div key={c.email} className="bg-[#1f2937] border border-gray-800 rounded-2xl p-5 hover:border-gray-700 transition-all fade-in">
            {/* Avatar + nombre */}
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-400 font-bold text-sm shrink-0">
                {c.nombre.split(' ').map(n => n[0]).join('').slice(0,2)}
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
                <p className="text-[10px] font-bold text-white">{c.ultimoPedido.slice(5)}</p>
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
    </div>
  );
}
