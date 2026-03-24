import { useMemo } from 'react';
import { ShoppingCart, TrendingUp, Calendar, DollarSign, ArrowUp, ArrowDown } from 'lucide-react';
import { HOY, PEDIDOS } from '../data/mockData';

// Formatea moneda argentina
const $$ = (n) => `$${Number(n).toLocaleString('es-AR')}`;

function KpiCard({ titulo, valor, subtitulo, icono: Icon, color = 'green', cambio }) {
  const colorMap = {
    green: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20' },
    blue:  { bg: 'bg-blue-500/10',  text: 'text-blue-400',  border: 'border-blue-500/20' },
    purple:{ bg: 'bg-purple-500/10',text: 'text-purple-400',border: 'border-purple-500/20' },
    amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
  };
  const c = colorMap[color];

  return (
    <div className="bg-[#1f2937] border border-gray-800 rounded-2xl p-5 hover:border-gray-700 transition-all duration-200 fade-in">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 ${c.bg} border ${c.border} rounded-xl flex items-center justify-center`}>
          <Icon size={18} className={c.text} />
        </div>
        {cambio !== undefined && (
          <span className={`flex items-center gap-0.5 text-xs font-medium ${cambio >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {cambio >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
            {Math.abs(cambio)}%
          </span>
        )}
      </div>
      <p className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-1">{titulo}</p>
      <p className="text-2xl font-bold text-white mb-1">{valor}</p>
      {subtitulo && <p className="text-xs text-gray-500">{subtitulo}</p>}
    </div>
  );
}

export default function Resumen() {
  const stats = useMemo(() => {
    const hoy = PEDIDOS.filter(p => p.fecha === HOY);
    const mesActual = new Date().getMonth();
    const mesActualPedidos = PEDIDOS.filter(p => new Date(p.fecha).getMonth() === mesActual);

    const pedidosHoy = hoy.length;
    const facturacionHoy = hoy.reduce((sum, p) => sum + p.total, 0);
    const pedidosMes = mesActualPedidos.length;
    const facturacionMes = mesActualPedidos.reduce((sum, p) => sum + p.total, 0);
    const gananciaMes = Math.round(facturacionMes * 0.6);

    return { pedidosHoy, facturacionHoy, pedidosMes, gananciaMes, facturacionMes };
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">Resumen</h2>
        <p className="text-gray-500 text-sm mt-1">Indicadores clave del negocio</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          titulo="Pedidos hoy"
          valor={stats.pedidosHoy}
          subtitulo={`${HOY}`}
          icono={ShoppingCart}
          color="green"
          cambio={12}
        />
        <KpiCard
          titulo="Facturación hoy"
          valor={$$(stats.facturacionHoy)}
          subtitulo="Total bruto del día"
          icono={DollarSign}
          color="blue"
          cambio={8}
        />
        <KpiCard
          titulo="Pedidos del mes"
          valor={stats.pedidosMes}
          subtitulo="Mes en curso"
          icono={Calendar}
          color="purple"
          cambio={5}
        />
        <KpiCard
          titulo="Ganancia estimada"
          valor={$$(stats.gananciaMes)}
          subtitulo="Margen 60% del mes"
          icono={TrendingUp}
          color="amber"
          cambio={18}
        />
      </div>

      {/* Barra de estado rápido */}
      <div className="mt-6 bg-[#1f2937] border border-gray-800 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Estado de pedidos hoy</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Pendientes',      estado: 'pendiente',      color: 'bg-red-500',    light: 'text-red-400' },
            { label: 'En preparación',  estado: 'en_preparacion', color: 'bg-amber-500',  light: 'text-amber-400' },
            { label: 'Listos',          estado: 'listo',          color: 'bg-blue-500',   light: 'text-blue-400' },
            { label: 'Entregados',      estado: 'entregado',      color: 'bg-green-500',  light: 'text-green-400' },
          ].map(({ label, estado, color, light }) => {
            const hoy = PEDIDOS.filter(p => p.fecha === HOY);
            const cant = hoy.filter(p => p.estado === estado).length;
            const pct = hoy.length ? Math.round((cant / hoy.length) * 100) : 0;
            return (
              <div key={estado} className="bg-[#111827] rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-full ${color}`} />
                  <span className="text-xs text-gray-400">{label}</span>
                </div>
                <p className={`text-2xl font-bold ${light}`}>{cant}</p>
                <div className="w-full bg-gray-800 rounded-full h-1 mt-2">
                  <div className={`${color} h-1 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
