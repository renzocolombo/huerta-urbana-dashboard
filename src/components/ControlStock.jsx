import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { useMemo } from 'react';
import { AlertTriangle, TrendingUp, Package } from 'lucide-react';
import { PRODUCTOS } from '../data/mockData';

const $$ = (n) => `$${Number(n).toLocaleString('es-AR')}`;

const UMBRAL_ALERTA = 20; // Si se vendieron más de N unidades esta semana, alerta

export default function ControlStock() {
  const { pedidos: PEDIDOS } = useGoogleSheets();

  const stats = useMemo(() => {
    const hoy = new Date();
    const haceSiete = new Date(hoy); haceSiete.setDate(hoy.getDate() - 7);
    const fmtDesde = haceSiete.toISOString().split('T')[0];
    const fmtHasta = hoy.toISOString().split('T')[0];
    const semana = PEDIDOS.filter(p => p.fecha >= fmtDesde && p.fecha <= fmtHasta);

    return PRODUCTOS.map(nombre => {
      const pedidosProd = semana.filter(p => p.producto === nombre);
      const totalUnidades = pedidosProd.reduce((s, p) => s + p.cantidades, 0);
      const totalFacturado = pedidosProd.reduce((s, p) => s + p.total, 0);
      const alerta = totalUnidades >= UMBRAL_ALERTA;
      return { nombre, totalUnidades, totalFacturado, pedidos: pedidosProd.length, alerta };
    }).sort((a, b) => b.totalUnidades - a.totalUnidades);
  }, []);

  const maxUnidades = Math.max(...stats.map(s => s.totalUnidades));

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">Control de stock</h2>
        <p className="text-gray-500 text-sm mt-1">Ventas de la última semana por producto</p>
      </div>

      {/* Alertas */}
      {stats.filter(s => s.alerta).length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-4 fade-in">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={15} className="text-amber-400" />
            <p className="text-sm font-semibold text-amber-400">Alta rotación detectada</p>
          </div>
          <p className="text-xs text-amber-300/70">
            Los siguientes productos superaron {UMBRAL_ALERTA} unidades esta semana:&nbsp;
            <strong>{stats.filter(s => s.alerta).map(s => s.nombre.replace('COMBO ','')).join(', ')}</strong>.
            Considerá reponer stock.
          </p>
        </div>
      )}

      {/* Cards de productos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map(s => {
          const pct = maxUnidades > 0 ? Math.round((s.totalUnidades / maxUnidades) * 100) : 0;
          return (
            <div
              key={s.nombre}
              className={`bg-[#1f2937] border rounded-2xl p-5 hover:border-gray-700 transition-all fade-in ${
                s.alerta ? 'border-amber-500/30' : 'border-gray-800'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-white text-sm">{s.nombre}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.pedidos} pedidos esta semana</p>
                </div>
                {s.alerta && (
                  <span className="bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <AlertTriangle size={10} />
                    Alta demanda
                  </span>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">Unidades vendidas</span>
                    <span className="text-sm font-bold text-white">{s.totalUnidades}</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${s.alerta ? 'bg-amber-500' : 'bg-green-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Facturado</span>
                  <span className="text-xs font-semibold text-green-400">{$$(s.totalFacturado)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
