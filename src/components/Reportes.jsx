import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FileText, Download, Calendar } from 'lucide-react';


const $$ = (n) => `$${Number(n).toLocaleString('es-AR')}`;

export default function Reportes() {
  const { pedidos: PEDIDOS } = useGoogleSheets();

  const hoy = new Date().toISOString().split('T')[0];
  const haceTreinta = new Date(); haceTreinta.setDate(haceTreinta.getDate() - 30);
  const [desde, setDesde] = useState(haceTreinta.toISOString().split('T')[0]);
  const [hasta, setHasta] = useState(hoy);
  const [generado, setGenerado] = useState(false);

  const pedidosPeriodo = PEDIDOS.filter(p => p.fecha >= desde && p.fecha <= hasta);
  const facturacion = pedidosPeriodo.reduce((s, p) => s + p.total, 0);
  const ganancia = Math.round(facturacion * 0.6);

  // Conteo por producto
  const porProducto = {};
  pedidosPeriodo.forEach(p => {
    if (!porProducto[p.producto]) porProducto[p.producto] = { unidades: 0, total: 0 };
    porProducto[p.producto].unidades += p.cantidades;
    porProducto[p.producto].total += p.total;
  });

  // Top localidad
  const porLocalidad = {};
  pedidosPeriodo.forEach(p => { porLocalidad[p.localidad] = (porLocalidad[p.localidad] || 0) + 1; });

  const generarPDF = () => {
    setGenerado(true);
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>Reporte Huerta Urbana ${desde} - ${hasta}</title>
      <style>
        body{font-family:sans-serif;padding:30px;color:#111;}
        h1{color:#22c55e;} h2{color:#333;border-bottom:2px solid #22c55e;padding-bottom:8px;}
        table{width:100%;border-collapse:collapse;margin-top:12px;}
        th{background:#f9fafb;text-align:left;padding:8px;font-size:12px;text-transform:uppercase;color:#666;}
        td{padding:8px;border-bottom:1px solid #eee;font-size:13px;}
        .stat{display:inline-block;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 20px;margin:8px 8px 8px 0;}
        .stat-val{font-size:22px;font-weight:bold;color:#16a34a;}
        .stat-label{font-size:11px;color:#666;text-transform:uppercase;}
      </style></head><body>
      <h1>🥦 Huerta Urbana · Reporte de ventas</h1>
      <p>Período: <strong>${desde}</strong> al <strong>${hasta}</strong></p>
      <h2>Resumen general</h2>
      <div class="stat"><div class="stat-val">${pedidosPeriodo.length}</div><div class="stat-label">Pedidos totales</div></div>
      <div class="stat"><div class="stat-val">${$$(facturacion)}</div><div class="stat-label">Facturación bruta</div></div>
      <div class="stat"><div class="stat-val">${$$(ganancia)}</div><div class="stat-label">Ganancia estimada (60%)</div></div>
      <h2>Por producto</h2>
      <table>
        <tr><th>Producto</th><th>Unidades</th><th>Facturado</th></tr>
        ${(porProducto && Object.keys(porProducto).length > 0) ? Object.entries(porProducto).sort((a,b)=>b[1].unidades-a[1].unidades).map(([nombre, d]) =>
          `<tr><td>${nombre}</td><td>${d.unidades}</td><td>${$$(d.total)}</td></tr>`
        ).join('') : '<tr><td colspan="3">No hay datos disponibles</td></tr>'}
      </table>
      <h2>Por localidad</h2>
      <table>
        <tr><th>Localidad</th><th>Pedidos</th></tr>
        ${(porLocalidad && Object.keys(porLocalidad).length > 0) ? Object.entries(porLocalidad).sort((a,b)=>b[1]-a[1]).map(([loc, cant]) =>
          `<tr><td>${loc}</td><td>${cant}</td></tr>`
        ).join('') : '<tr><td colspan="2">No hay datos disponibles</td></tr>'}
      </table>
      <p style="margin-top:30px;color:#999;font-size:11px;">Generado el ${new Date().toLocaleString('es-AR')} · Huerta Urbana, Pilar</p>
      </body></html>`);
    win.print();
    setTimeout(() => setGenerado(false), 3000);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Reportes</h2>
          <p className="text-gray-500 text-sm mt-1">Exportar resumen de ventas del período</p>
        </div>
        <button
          onClick={generarPDF}
          className="flex items-center gap-2 bg-green-500 hover:bg-green-400 text-white text-sm font-medium px-4 py-2 rounded-xl transition-all"
        >
          <Download size={15} />
          {generado ? 'Generando...' : 'Exportar PDF'}
        </button>
      </div>

      {/* Selector de período */}
      <div className="bg-[#1f2937] border border-gray-800 rounded-2xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Calendar size={15} className="text-green-400" /> Seleccionar período
        </h3>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Desde</label>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
              className="bg-[#111827] border border-gray-700 text-white text-sm rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Hasta</label>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
              className="bg-[#111827] border border-gray-700 text-white text-sm rounded-lg px-3 py-2" />
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Pedidos del período', valor: pedidosPeriodo.length, color: 'text-white' },
          { label: 'Facturación bruta', valor: $$(facturacion), color: 'text-green-400' },
          { label: 'Ganancia estimada', valor: $$(ganancia), color: 'text-blue-400' },
        ].map(s => (
          <div key={s.label} className="bg-[#1f2937] border border-gray-800 rounded-2xl p-4 fade-in">
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className={`text-xl font-bold ${s.color}`}>{s.valor}</p>
          </div>
        ))}
      </div>

      {/* Tabla preview */}
      <div className="bg-[#1f2937] border border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-white">Ventas por producto</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Producto</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Unidades</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Facturado</th>
            </tr>
          </thead>
          <tbody>
            {porProducto && Object.keys(porProducto).length > 0 ? Object.entries(porProducto).sort((a,b)=>b[1].unidades-a[1].unidades).map(([nombre, d]) => (
              <tr key={nombre} className="border-b border-gray-800/40 hover:bg-gray-800/20">
                <td className="px-5 py-3 text-white text-xs font-medium">{nombre}</td>
                <td className="px-5 py-3 text-gray-400 text-xs">{d.unidades}</td>
                <td className="px-5 py-3 text-green-400 text-xs font-semibold">{$$(d.total)}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan="3" className="px-5 py-10 text-center text-gray-500 italic">No hay datos de productos para este período</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
