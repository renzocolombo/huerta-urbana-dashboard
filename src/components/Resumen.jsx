import { useState, useMemo } from 'react';
import { ShoppingCart, TrendingUp, Calendar, DollarSign, ArrowUp, ArrowDown, Settings2, Package, Percent } from 'lucide-react';
import { HOY, PEDIDOS } from '../data/mockData';

// Formatea moneda argentina
const $$ = (n) => `$${Number(Math.abs(n)).toLocaleString('es-AR')}`;

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
  const [config, setConfig] = useState({
    comisionMP: 8,
    costobolsas: 500,
    monotributo: 52000
  });

  const [showConfig, setShowConfig] = useState(false);

  const stats = useMemo(() => {
    const hoy = PEDIDOS.filter(p => p.fecha === HOY);
    const mesActual = new Date().getMonth();
    const mesActualPedidos = PEDIDOS.filter(p => new Date(p.fecha).getMonth() === mesActual);

    const pedidosHoy = hoy.length;
    const facturacionHoy = hoy.reduce((sum, p) => sum + p.total, 0);
    const pedidosMes = mesActualPedidos.length;
    
    // Cálculos financieros mes (Bruto)
    const facturacionMesBruta = mesActualPedidos.reduce((sum, p) => sum + p.total, 0);
    const comisionMPTotal = Math.round(facturacionMesBruta * (config.comisionMP / 100));
    const costoMercaderiaTotal = Math.round(facturacionMesBruta * 0.40); // Asumimos costo 40% (margen 60%)
    const costoInsumosTotal = pedidosMes * config.costobolsas;
    const gananciaNetaMes = facturacionMesBruta - comisionMPTotal - costoMercaderiaTotal - costoInsumosTotal - config.monotributo;
    const margenRealPct = facturacionMesBruta > 0 ? (gananciaNetaMes / facturacionMesBruta) * 100 : 0;

    return { 
      pedidosHoy, 
      facturacionHoy, 
      pedidosMes, 
      facturacionMesBruta, 
      comisionMPTotal, 
      costoMercaderiaTotal, 
      costoInsumosTotal, 
      gananciaNetaMes, 
      margenRealPct 
    };
  }, [config]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Resumen</h2>
          <p className="text-gray-500 text-sm mt-1">Indicadores clave y desglose financiero</p>
        </div>
        <button 
          onClick={() => setShowConfig(!showConfig)}
          className={`flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-xl border transition-all ${showConfig ? 'bg-green-500/10 border-green-500/40 text-green-400' : 'bg-[#1f2937] border-gray-800 text-gray-400 hover:text-white'}`}
        >
          <Settings2 size={14} />
          Configurar variables
        </button>
      </div>

      {showConfig && (
        <div className="bg-[#1f2937] border border-green-500/20 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-3 gap-6 fade-in shadow-xl shadow-green-500/5">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Comisión Mercado Pago</label>
            <div className="relative">
              <Percent size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
              <input 
                type="number" 
                value={config.comisionMP} 
                onChange={(e) => setConfig({ ...config, comisionMP: Number(e.target.value) })}
                className="w-full bg-[#111827] border border-gray-800 text-white rounded-xl pl-9 pr-4 py-2.5 text-sm focus:border-green-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Costo bolsas/bandejas</label>
            <div className="relative">
              <Package size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
              <input 
                type="number" 
                value={config.costobolsas} 
                onChange={(e) => setConfig({ ...config, costobolsas: Number(e.target.value) })}
                className="w-full bg-[#111827] border border-gray-800 text-white rounded-xl pl-9 pr-4 py-2.5 text-sm focus:border-green-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Monotributo mensual</label>
            <div className="relative">
              <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
              <input 
                type="number" 
                value={config.monotributo} 
                onChange={(e) => setConfig({ ...config, monotributo: Number(e.target.value) })}
                className="w-full bg-[#111827] border border-gray-800 text-white rounded-xl pl-9 pr-4 py-2.5 text-sm focus:border-green-500 outline-none"
              />
            </div>
          </div>
        </div>
      )}

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
          valor={$$(stats.gananciaNetaMes)}
          subtitulo="Neto real acumulado"
          icono={TrendingUp}
          color="amber"
          cambio={18}
        />
      </div>

      {/* TARJETA GRANDE — DESGLOSE MENSUAL */}
      <div className="bg-[#1f2937] border border-gray-800 rounded-3xl p-8 shadow-2xl overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h3 className="text-xl font-black text-white uppercase tracking-tight">Desglose Financiero Mensual</h3>
            <p className="text-gray-500 text-xs mt-1">Estimación basada en {stats.pedidosMes} pedidos acumulados este mes</p>
          </div>
          <div className="text-left md:text-right">
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Margen Real Utilidad</p>
            <span className="text-3xl font-black text-green-400">{stats.margenRealPct.toFixed(1)}%</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div className="space-y-4">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400">Facturación Bruta (Ventas Mes)</span>
              <span className="font-mono text-white">{$$(stats.facturacionMesBruta)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400 flex items-center gap-2">Comisión MP ({config.comisionMP}%)</span>
              <span className="font-mono text-red-400/80">- {$$(stats.comisionMPTotal)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400">Costo Mercadería (Inversión)</span>
              <span className="font-mono text-red-400/80">- {$$(stats.costoMercaderiaTotal)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400 flex items-center gap-2">Bolsas y Bandejas ({$$(config.costobolsas)} p/ped)</span>
              <span className="font-mono text-red-400/80">- {$$(stats.costoInsumosTotal)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400">Monotributo Mensual</span>
              <span className="font-mono text-red-400/80">- {$$(config.monotributo)}</span>
            </div>
          </div>

          <div className="bg-[#111827]/50 rounded-3xl p-8 flex flex-col items-center justify-center border border-gray-800/50">
            <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-3">Ganancia Neta Disponible</p>
            <p className="text-6xl font-black text-green-400 tracking-tighter drop-shadow-[0_0_15px_rgba(34,197,94,0.3)]">
              {$$(stats.gananciaNetaMes)}
            </p>
            <div className="mt-6 flex items-center gap-2 bg-green-500/10 text-green-400 text-[10px] px-4 py-1.5 rounded-full border border-green-500/20 font-bold uppercase">
              <TrendingUp size={12} /> Negocio Altamente Rentable
            </div>
          </div>
        </div>
      </div>

      {/* Barra de estado rápido */}
      <div className="bg-[#1f2937] border border-gray-800 rounded-2xl p-5">
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

