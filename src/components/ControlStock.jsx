import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { useState, useEffect, useMemo } from 'react';
import { 
  AlertTriangle, TrendingUp, Package, Plus, History, 
  Check, Info, Box, Edit2, RotateCcw, X, Save,
  AlertCircle, Loader2, Settings
} from 'lucide-react';

// Configuración de entorno
const SHEET_ID = import.meta.env.VITE_SHEET_ID;
const API_KEY  = import.meta.env.VITE_GOOGLE_SHEETS_KEY || import.meta.env.VITE_GOOGLE_API_KEY;
const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL;

const COSTOS_KEY = 'huerta_data_costos_v1_productos';

const DEFAULTS_BY_TYPE = {
  'hoja verde': { days: 2, icon: '🌿' },
  'blando': { days: 4, icon: '🍑' },
  'duro': { days: 10, icon: '🥔' }
};

export default function ControlStock() {
  const [productosMaster, setProductosMaster] = useState([]);
  const [stockData, setStockData] = useState({});
  const [historial, setHistorial] = useState([]);
  const [showFormId, setShowFormId] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    cargarDatosIniciales();
  }, []);

  const cargarDatosIniciales = async () => {
    setCargando(true);
    setError(null);
    const prodsSaved = localStorage.getItem(COSTOS_KEY);
    const master = prodsSaved ? JSON.parse(prodsSaved) : [];
    setProductosMaster(master);

    if (!API_KEY || !SHEET_ID) {
      setError('Faltan claves de configuración (SHEET_ID / API_KEY) en .env');
      setCargando(false);
      return;
    }

    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/ControlStock?key=${API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
      const rows = data.values;
      if (!rows || rows.length < 1) {
        inicializarConMaster(master, []);
        return;
      }
      const headers = rows[0].map(h => h.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ /g, '_'));
      const parsedRows = rows.slice(1).map((row, index) => {
        const obj = { fila: index + 2 };
        headers.forEach((h, i) => { obj[h] = row[i] || ''; });
        return obj;
      });
      inicializarConMaster(master, parsedRows);
    } catch (err) {
      setError('No se pudo leer el stock. Revisa la conexión.');
    } finally {
      setCargando(false);
    }
  };

  const inicializarConMaster = (master, remoteData) => {
    const newStockData = {};
    master.forEach(p => {
      const remoteInfo = remoteData.find(r => r.nombre?.toLowerCase().trim() === p.nombre?.toLowerCase().trim());
      if (remoteInfo) {
        newStockData[p.id] = {
          nombre: p.nombre,
          fila: remoteInfo.fila,
          stock: { '500g': Number(remoteInfo.stock_500g || 0), '1kg': Number(remoteInfo.stock_1kg || 0) },
          originalLoad: { '500g': Number(remoteInfo.original_load_500g || remoteInfo.stock_500g || 0), '1kg': Number(remoteInfo.original_load_1kg || remoteInfo.stock_1kg || 0) },
          ultimoBandejeado: remoteInfo.ultimo_bandejeado || null,
          tipo: remoteInfo.tipo || 'hoja verde',
          urgentDays: Number(remoteInfo.urgent_days || DEFAULTS_BY_TYPE[remoteInfo.tipo || 'hoja verde']?.days || 2)
        };
      } else {
        newStockData[p.id] = {
          nombre: p.nombre, fila: null, stock: { '500g': 0, '1kg': 0 }, originalLoad: { '500g': 0, '1kg': 0 },
          ultimoBandejeado: null, tipo: 'hoja verde', urgentDays: DEFAULTS_BY_TYPE['hoja verde'].days
        };
      }
    });
    setStockData(newStockData);
  };

  const processedData = useMemo(() => {
    return Object.keys(stockData).map(id => {
      const item = stockData[id];
      const totalStock = Object.values(item.stock).reduce((s, c) => s + c, 0);
      const totalOriginal = Object.values(item.originalLoad || {}).reduce((s, c) => s + c, 0);
      let diasTranscurridos = null;
      if (item.ultimoBandejeado) {
        const diff = new Date() - new Date(item.ultimoBandejeado);
        diasTranscurridos = Math.floor(diff / (1000 * 60 * 60 * 24));
      }
      const isFaltante = totalStock === 0;
      const isUrgente = diasTranscurridos !== null && diasTranscurridos > item.urgentDays;
      const isStockBajo = !isFaltante && totalOriginal > 0 && totalStock <= (totalOriginal / 2);
      let category = 'ok';
      if (isFaltante) category = 'faltante';
      else if (isUrgente) category = 'urgente';
      else if (isStockBajo) category = 'bajo';
      return { id: Number(id), ...item, totalStock, totalOriginal, diasTranscurridos, category };
    });
  }, [stockData]);

  const syncWithSheet = async (updatedProduct) => {
    if (!APPS_SCRIPT_URL || !updatedProduct.fila) return;
    const payload = {
      accion: 'updateStock', fila: updatedProduct.fila, nombre: updatedProduct.nombre,
      stock_500g: updatedProduct.stock['500g'], stock_1kg: updatedProduct.stock['1kg'],
      original_load_500g: updatedProduct.originalLoad['500g'], original_load_1kg: updatedProduct.originalLoad['1kg'],
      tipo: updatedProduct.tipo, urgent_days: updatedProduct.urgentDays, ultimo_bandejeado: updatedProduct.ultimo_bandejeado
    };
    try {
      await fetch(APPS_SCRIPT_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(payload) });
    } catch (e) { console.error(e); }
  };

  const updateProductData = (pid, patch) => {
    const newData = { ...stockData };
    newData[pid] = { ...newData[pid], ...patch };
    setStockData(newData);
    syncWithSheet(newData[pid]);
  };

  const guardarCarga = (pid, formData) => {
    const { tamano, cantidad, tipo, fecha } = formData;
    const newData = { ...stockData };
    const prod = newData[pid];
    prod.stock[tamano] += Math.max(0, Number(cantidad) || 0);
    prod.originalLoad = { ...prod.stock }; 
    prod.ultimoBandejeado = fecha;
    prod.tipo = tipo;
    setStockData(newData);
    syncWithSheet(prod);
    setShowFormId(null);
  };

  if (cargando) return <div className="flex flex-col items-center justify-center min-h-[400px] text-gray-500 gap-4"><Loader2 className="animate-spin text-green-500" size={40} /><p className="animate-pulse font-bold text-xs uppercase tracking-widest text-center">Cargando Stock...</p></div>;
  if (error) return <div className="bg-red-500/10 border border-red-500/20 rounded-[2rem] p-10 text-center space-y-4"><AlertCircle className="mx-auto text-red-500" size={48} /><h3 className="text-white font-bold text-lg">Error</h3><p className="text-red-400 text-sm max-w-md mx-auto">{error}</p><button onClick={cargarDatosIniciales} className="bg-red-500 text-white px-6 py-2 rounded-xl text-xs font-bold uppercase">Reintentar</button></div>;

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-xl font-bold text-white">Control de Stock</h2>
          <p className="text-gray-500 text-[10px] uppercase font-bold tracking-widest flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full" /> Sincronizado en la nube
          </p>
        </div>
        <button onClick={cargarDatosIniciales} className="text-gray-500 hover:text-white transition-colors p-2 rounded-lg bg-white/5"><RotateCcw size={14} /></button>
      </div>

      {/* Resumen Superior */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatusColumn title="🔴 Urgente" items={processedData.filter(d => d.category === 'urgente')} type="urgente" color="red" />
        <StatusColumn title="🟡 Bajo" items={processedData.filter(d => d.category === 'bajo')} type="bajo" color="amber" />
        <StatusColumn title="⚫ Faltante" items={processedData.filter(d => d.category === 'faltante')} type="faltante" color="gray" />
      </div>

      {/* Grilla Compacta de Productos */}
      <div className="space-y-4 pt-4">
        <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em] pl-1">Inventario General</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-[12px]">
          {processedData.map(p => (
            <ProductCard 
              key={p.id} 
              product={p} 
              onUpdate={(patch) => updateProductData(p.id, patch)}
              isAdding={showFormId === p.id}
              onToggleAdd={() => setShowFormId(showFormId === p.id ? null : p.id)}
              onSaveAdd={(data) => guardarCarga(p.id, data)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusColumn({ title, items, type, color }) {
  const colorMap = { red: 'bg-red-500/5 border-red-500/20', amber: 'bg-amber-500/5 border-amber-500/20', gray: 'bg-gray-800/10 border-gray-700/50' };
  return (
    <div className={`${colorMap[color]} border rounded-3xl p-4 flex flex-col min-h-[160px]`}>
      <h3 className="text-gray-400 font-black text-[10px] uppercase tracking-widest mb-3 flex justify-between">
        {title} <span>{items.length}</span>
      </h3>
      <div className="grid grid-cols-1 gap-2">
        {items.length === 0 ? (
          <p className="text-[10px] text-gray-600 font-bold opacity-30 mt-4 uppercase">OK</p>
        ) : (
          items.slice(0, 3).map(p => (
            <div key={p.id} className="text-[10px] text-white flex justify-between items-center bg-black/20 px-2 py-1 rounded-lg">
              <span className="truncate pr-2">{p.nombre}</span>
              <span className="font-mono opacity-50">{type === 'urgente' ? `${p.diasTranscurridos}d` : `${p.totalStock}u`}</span>
            </div>
          ))
        )}
        {items.length > 3 && <p className="text-[8px] text-gray-500 pl-1">+{items.length - 3} más...</p>}
      </div>
    </div>
  );
}

function ProductCard({ product, onUpdate, isAdding, onToggleAdd, onSaveAdd }) {
  const [editing, setEditing] = useState(false);
  const icon = DEFAULTS_BY_TYPE[product.tipo]?.icon || '🌿';
  const categoryColor = { urgente: 'bg-red-500', bajo: 'bg-amber-500', faltante: 'bg-gray-500', ok: 'bg-green-500' };

  return (
    <div className="bg-[#1f2937] border border-gray-800 rounded-2xl p-3 flex flex-col justify-between hover:border-gray-700 transition-all relative group shadow-sm">
      {/* Indicador Semáforo */}
      <div className={`absolute top-3 right-3 w-1.5 h-1.5 rounded-full ${categoryColor[product.category]} shadow-[0_0_8px] ${product.category === 'urgente' ? 'shadow-red-500' : ''}`} />
      
      <div className="mb-2">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-sm">{icon}</span>
          <h4 className="font-bold text-white text-[11px] truncate leading-tight flex-1" title={product.nombre}>{product.nombre}</h4>
        </div>
        
        {/* Stock Resume */}
        <div className="flex items-center gap-0.5 mt-2">
          <div className="flex-1 bg-black/30 rounded-lg p-1 text-center">
            <span className="text-[8px] text-gray-500 block uppercase font-bold leading-none mb-0.5">500g</span>
            <span className={`text-[11px] font-black ${product.stock['500g'] === 0 ? 'text-gray-700' : 'text-white'}`}>{product.stock['500g']}</span>
          </div>
          <div className="flex-1 bg-black/30 rounded-lg p-1 text-center">
            <span className="text-[8px] text-gray-500 block uppercase font-bold leading-none mb-0.5">1kg</span>
            <span className={`text-[11px] font-black ${product.stock['1kg'] === 0 ? 'text-gray-700' : 'text-white'}`}>{product.stock['1kg']}</span>
          </div>
        </div>
      </div>

      <div className="mt-auto pt-2 space-y-2">
        <div className="flex justify-between items-center text-[9px]">
          <span className="text-gray-500 font-bold">{product.diasTranscurridos ?? '-'} d frescura</span>
          <button onClick={() => setEditing(!editing)} className="text-gray-600 hover:text-white"><Settings size={10}/></button>
        </div>

        {!isAdding ? (
          <button 
            onClick={onToggleAdd}
            className="w-full bg-gray-800/80 hover:bg-gray-700 text-white font-black text-[9px] py-1.5 rounded-lg border border-gray-700 flex items-center justify-center gap-1 transition-all"
          >
            <Plus size={10} /> Cargar
          </button>
        ) : (
          <div className="bg-gray-900 absolute inset-0 z-20 p-2 rounded-2xl animate-in fade-in flex flex-col justify-center">
            <AddStockInline 
              initialTipo={product.tipo} 
              onCancel={onToggleAdd} 
              onSave={(data) => { 
                onSaveAdd(data); 
                // Manual trigger sync logic for inline add if needed (already handled by GUARDARCARGA)
              }} 
            />
          </div>
        )}
      </div>

      {/* Edit Overlay (Small) */}
      {editing && (
        <div className="absolute inset-0 bg-gray-900/95 z-30 p-3 rounded-2xl flex flex-col justify-center gap-2 animate-in slide-in-from-bottom-2">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[9px] font-bold text-gray-500 uppercase">Ajustes</span>
            <button onClick={() => setEditing(false)}><X size={10} className="text-gray-500"/></button>
          </div>
          <div className="space-y-1">
             <p className="text-[8px] text-gray-600 uppercase font-black">Tipo</p>
             <div className="grid grid-cols-3 gap-1">
                {Object.keys(DEFAULTS_BY_TYPE).map(t => (
                  <button key={t} onClick={() => { onUpdate({ tipo: t, urgentDays: DEFAULTS_BY_TYPE[t].days }); setEditing(false); }} className={`p-1 rounded text-[8px] font-bold ${product.tipo === t ? 'bg-green-600 text-white' : 'bg-white/5 text-gray-500'}`}>{t.split(' ')[0]}</button>
                ))}
             </div>
          </div>
          <div className="space-y-1 mt-1">
             <p className="text-[8px] text-gray-600 uppercase font-black">Días Alerta</p>
             <input type="number" className="w-full bg-black text-[10px] text-white p-1 rounded border border-gray-800" value={product.urgentDays} onChange={(e) => onUpdate({ urgentDays: Number(e.target.value) })} />
          </div>
          <button onClick={() => { onUpdate({ stock: { '500g': 0, '1kg': 0 }, ultimoBandejeado: null }); setEditing(false); }} className="w-full bg-red-900/30 text-red-500 text-[8px] font-black py-1 rounded mt-1 border border-red-900/50">RESET TOTAL</button>
        </div>
      )}
    </div>
  );
}

function AddStockInline({ onCancel, onSave, initialTipo }) {
  const [data, setData] = useState({ tamano: '1kg', cantidad: 1, tipo: initialTipo, fecha: new Date().toISOString().split('T')[0] });
  return (
    <div className="space-y-2">
      <p className="text-[9px] font-black text-white text-center mb-1">Cargar Bandejas</p>
      <div className="grid grid-cols-2 gap-1.5">
        <select value={data.tamano} onChange={(e) => setData({...data, tamano: e.target.value})} className="bg-black text-[9px] text-white p-1 rounded border border-gray-800 outline-none">
          <option value="500g">500g</option>
          <option value="1kg">1kg</option>
        </select>
        <input type="number" value={data.cantidad} min="1" onChange={(e) => setData({...data, cantidad: e.target.value})} className="bg-black text-[9px] text-white p-1 rounded border border-gray-800 outline-none" />
        <div className="col-span-2">
           <input type="date" value={data.fecha} onChange={(e) => setData({...data, fecha: e.target.value})} className="w-full bg-black text-[9px] text-white p-1 rounded border border-gray-800 outline-none" />
        </div>
      </div>
      <div className="flex gap-1 pt-1">
        <button onClick={onCancel} className="flex-1 text-[8px] text-gray-500 font-bold uppercase py-1">Cerrar</button>
        <button onClick={() => onSave(data)} className="flex-1 bg-green-600 text-white text-[8px] font-black uppercase py-1 rounded shadow-lg shadow-green-900/30">OK</button>
      </div>
    </div>
  );
}
