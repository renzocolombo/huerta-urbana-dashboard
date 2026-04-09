import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { useState, useEffect, useMemo } from 'react';
import { 
  AlertTriangle, TrendingUp, Package, Plus, History, 
  Check, Info, Box, Edit2, RotateCcw, X, Save,
  AlertCircle, Loader2, Settings, ChevronDown, ChevronUp
} from 'lucide-react';

// Configuración de entorno
const SHEET_ID = import.meta.env.VITE_SHEET_ID;
const API_KEY  = import.meta.env.VITE_GOOGLE_SHEETS_KEY || import.meta.env.VITE_GOOGLE_API_KEY;
const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL;

const COSTOS_KEY = 'huerta_data_costos_v1_productos';

const DEFAULTS_BY_TYPE = {
  'hoja verde': { days: 2, icon: '🌿', labels: { small: '250g', large: '500g' } },
  'blando': { days: 4, icon: '🍑', labels: { small: '500g', large: '1kg' } },
  'duro': { days: 10, icon: '🥔', labels: { small: '500g', large: '1kg' } }
};

const PRODUCT_DATABASE = {
  'hoja verde': ['espinaca', 'lechuga', 'rucula', 'acelga', 'perejil', 'albahaca', 'ciboulette', 'radicheta'],
  'blando': ['tomate', 'tomate cherry', 'banana', 'durazno', 'frutilla', 'pera', 'morron', 'pepino', 'chaucha', 'berenjena'],
  'duro': [
    'papa', 'cebolla comun', 'cebolla morada', 'zanahoria', 'zapallito', 'zapallo blanco', 'cabutia', 
    'ajo', 'remolacha', 'hinojo', 'apio', 'brocoli', 'coliflor', 'repollo', 'choclo', 'huevos', 'miel pura',
    'palta', 'manzana roja', 'manzana verde', 'naranja', 'limon', 'pomelo', 'uva', 'arandano', 'boniato'
  ]
};

function getTipoByNombre(nombre) {
  const n = nombre.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (PRODUCT_DATABASE['hoja verde'].some(p => n.includes(p))) return 'hoja verde';
  if (PRODUCT_DATABASE['blando'].some(p => n.includes(p))) return 'blando';
  if (PRODUCT_DATABASE['duro'].some(p => n.includes(p))) return 'duro';
  return 'hoja verde'; // Default
}

export default function ControlStock() {
  const [productosMaster, setProductosMaster] = useState([]);
  const [stockData, setStockData] = useState({});
  const [showFormId, setShowFormId] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [expandedCategory, setExpandedCategory] = useState(null);

  useEffect(() => {
    cargarDatosIniciales();
  }, []);

  const cargarDatosIniciales = async () => {
    setCargando(true);
    setError(null);
    console.log('[CONTROL-STOCK] Iniciando carga...');
    
    const prodsSaved = localStorage.getItem(COSTOS_KEY);
    const master = prodsSaved ? JSON.parse(prodsSaved) : [];
    console.log('[CONTROL-STOCK] Master list (localStorage):', master);
    setProductosMaster(master);

    if (!API_KEY || !SHEET_ID) {
      console.error('[CONTROL-STOCK] Error: No hay API_KEY o SHEET_ID');
      setError('Faltan claves de configuración (SHEET_ID / API_KEY) en .env');
      setCargando(false);
      return;
    }

    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/ControlStock?key=${API_KEY}`;
      console.log('[CONTROL-STOCK] URL Fetch:', url);
      
      const res = await fetch(url);
      const data = await res.json();
      console.log('[CONTROL-STOCK] Respuesta:', data);
      
      if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
      const rows = data.values;
      
      if (!rows || rows.length < 1) {
        console.warn('[CONTROL-STOCK] No hay filas en el Sheet');
        inicializarConMaster(master, []);
        return;
      }
      
      const headers = rows[0].map(h => h.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ /g, '_'));
      const parsedRows = rows.slice(1).map((row, index) => {
        const obj = { fila: index + 2 };
        headers.forEach((h, i) => { obj[h] = row[i] || ''; });
        return obj;
      });
      
      console.log('[CONTROL-STOCK] Filas parseadas:', parsedRows);
      inicializarConMaster(master, parsedRows);
    } catch (err) {
      console.error('[CONTROL-STOCK] Error crítico:', err);
      setError('No se pudo leer el stock. Revisa la conexión.');
    } finally {
      setCargando(false);
    }
  };

  const inicializarConMaster = (master, remoteData) => {
    const newStockData = {};
    master.forEach(p => {
      const remoteInfo = remoteData.find(r => r.nombre?.toLowerCase().trim() === p.nombre?.toLowerCase().trim());
      
      // Clasificación automática priorizada
      const autoTipo = getTipoByNombre(p.nombre);

      if (remoteInfo) {
        newStockData[p.id] = {
          nombre: p.nombre,
          fila: remoteInfo.fila,
          stock: { '500g': Number(remoteInfo.stock_500g || 0), '1kg': Number(remoteInfo.stock_1kg || 0) },
          originalLoad: { '500g': Number(remoteInfo.original_load_500g || remoteInfo.stock_500g || 0), '1kg': Number(remoteInfo.original_load_1kg || remoteInfo.stock_1kg || 0) },
          ultimoBandejeado: remoteInfo.ultimo_bandejeado || null,
          tipo: remoteInfo.tipo || autoTipo,
          urgentDays: Number(remoteInfo.urgent_days || DEFAULTS_BY_TYPE[remoteInfo.tipo || autoTipo]?.days || 2)
        };
      } else {
        newStockData[p.id] = {
          nombre: p.nombre, fila: null, stock: { '500g': 0, '1kg': 0 }, originalLoad: { '500g': 0, '1kg': 0 },
          ultimoBandejeado: null, tipo: autoTipo, urgentDays: DEFAULTS_BY_TYPE[autoTipo].days
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
    const { stock_1kg, stock_500g, fecha } = formData;
    const newData = { ...stockData };
    const prod = newData[pid];
    prod.stock['1kg'] = Math.max(0, Number(stock_1kg) || 0);
    prod.stock['500g'] = Math.max(0, Number(stock_500g) || 0);
    prod.originalLoad = { ...prod.stock }; 
    prod.ultimoBandejeado = fecha;
    setStockData(newData);
    syncWithSheet(prod);
    setShowFormId(null);
  };

  if (cargando) return <div className="flex flex-col items-center justify-center min-h-[400px] text-gray-500 gap-4"><Loader2 className="animate-spin text-green-500" size={40} /><p className="animate-pulse font-bold text-xs uppercase tracking-widest text-center">Cargando Stock...</p></div>;
  if (error) return <div className="bg-red-500/10 border border-red-500/20 rounded-[2rem] p-10 text-center space-y-4"><AlertCircle className="mx-auto text-red-500" size={48} /><h3 className="text-white font-bold text-lg">Error</h3><p className="text-red-400 text-sm max-w-md mx-auto">{error}</p><button onClick={cargarDatosIniciales} className="bg-red-500 text-white px-6 py-2 rounded-xl text-xs font-bold uppercase">Reintentar</button></div>;

  const toggleCategory = (cat) => {
    setExpandedCategory(expandedCategory === cat ? null : cat);
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Control de Stock</h2>
          <p className="text-gray-500 text-[10px] uppercase font-bold tracking-widest mt-1">Sincronizado vía Cloud API</p>
        </div>
        <button onClick={cargarDatosIniciales} className="text-gray-500 hover:text-white transition-colors p-2.5 rounded-xl bg-white/5"><RotateCcw size={16} /></button>
      </div>

      <div className="flex flex-col gap-3">
        <StatusAccordion title="URGENTE VENDER" icon="🔴" items={processedData.filter(d => d.category === 'urgente')} isOpen={expandedCategory === 'urgente'} onToggle={() => toggleCategory('urgente')} color="red" type="urgente" />
        <StatusAccordion title="STOCK BAJO" icon="🟡" items={processedData.filter(d => d.category === 'bajo')} isOpen={expandedCategory === 'bajo'} onToggle={() => toggleCategory('bajo')} color="amber" type="bajo" />
        <StatusAccordion title="FALTANTE" icon="⚫" items={processedData.filter(d => d.category === 'faltante')} isOpen={expandedCategory === 'faltante'} onToggle={() => toggleCategory('faltante')} color="gray" type="faltante" />
      </div>

      <div className="space-y-10 pt-10 border-t border-white/5">
        {[
          { id: 'hoja verde', label: '🌿 HOJA VERDE', color: 'text-green-500' },
          { id: 'blando', label: '🍅 BLANDO', color: 'text-red-500' },
          { id: 'duro', label: '🥔 DURO', color: 'text-amber-500' }
        ].map(cat => {
          const catItems = processedData.filter(p => p.tipo === cat.id);
          if (catItems.length === 0) return null;
          
          return (
            <div key={cat.id} className="space-y-4">
              <h3 className={`text-[11px] font-black ${cat.color} uppercase tracking-[0.3em] font-mono flex items-center gap-2`}>
                {cat.label}
                <span className="h-[1px] flex-1 bg-white/5"></span>
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-[12px]">
                {catItems.map(p => (
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
          );
        })}
      </div>
    </div>
  );
}

function StatusAccordion({ title, icon, items, isOpen, onToggle, color, type }) {
  const colorMap = { 
    red: 'bg-red-500/5 border-red-500/20 text-red-500 hover:bg-red-500/10', 
    amber: 'bg-amber-500/5 border-amber-500/20 text-amber-500 hover:bg-amber-500/10', 
    gray: 'bg-gray-800/10 border-gray-700/50 text-gray-400 hover:bg-gray-800/20' 
  };

  return (
    <div className={`${colorMap[color]} border rounded-2xl overflow-hidden transition-all duration-300`}>
      <button onClick={onToggle} className="w-full flex items-center justify-between p-4 lg:p-5">
        <div className="flex items-center gap-3">
          <span className="text-sm">{icon}</span>
          <h3 className="font-black text-[13px] uppercase tracking-widest">{title}</h3>
          <span className="bg-white/5 px-3 py-0.5 rounded-full text-[10px] font-mono">{items.length} {items.length === 1 ? 'producto' : 'productos'}</span>
        </div>
        {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {isOpen && (
        <div className="p-4 pt-0 lg:p-6 lg:pt-0 border-t border-white/5 animate-in slide-in-from-top-2 duration-200">
          {items.length === 0 ? (
            <div className="py-8 text-center bg-black/20 rounded-xl">
              <span className="text-xl">✅</span>
              <p className="text-[10px] font-black uppercase text-gray-500 mt-2 tracking-widest">Todo bien</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-[12px] pt-4">
              {items.map(p => {
                const labels = DEFAULTS_BY_TYPE[p.tipo]?.labels || { small: '500g', large: '1kg' };
                return (
                  <div key={p.id} className="bg-black/30 border border-white/5 rounded-2xl p-4 flex flex-col justify-between hover:bg-black/40 transition-all">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-white font-bold text-xs truncate pr-2">{p.nombre}</span>
                    </div>
                    <div className="flex gap-1 mb-2">
                      <div className="flex-1 bg-white/5 rounded-lg py-1 text-center">
                         <span className="text-[9px] font-black text-white">{p.stock['1kg']} <span className="text-[7px] opacity-40 uppercase">{labels.large.replace('g','')}</span></span>
                      </div>
                      <div className="flex-1 bg-white/5 rounded-lg py-1 text-center">
                         <span className="text-[9px] font-black text-white">{p.stock['500g']} <span className="text-[7px] opacity-40 uppercase">{labels.small.replace('g','')}</span></span>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono opacity-50 text-right">
                      {type === 'urgente' ? `${p.diasTranscurridos}d` : `${p.totalStock}u`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProductCard({ product, onUpdate, isAdding, onToggleAdd, onSaveAdd }) {
  const [editing, setEditing] = useState(false);
  const typeConfig = DEFAULTS_BY_TYPE[product.tipo] || DEFAULTS_BY_TYPE['hoja verde'];
  const icon = typeConfig.icon;
  const labels = typeConfig.labels;
  const categoryColor = { urgente: 'bg-red-500', bajo: 'bg-amber-500', faltante: 'bg-gray-500', ok: 'bg-green-500' };

  return (
    <div className="bg-[#1f2937] border border-gray-800 rounded-2xl p-3 flex flex-col justify-between hover:border-gray-700 transition-all relative group shadow-sm">
      <div className={`absolute top-3 right-3 w-1.5 h-1.5 rounded-full ${categoryColor[product.category]} shadow-[0_0_8px] ${product.category === 'urgente' ? 'shadow-red-500' : ''}`} />
      <div className="mb-2">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-sm">{icon}</span>
          <h4 className="font-bold text-white text-[11px] truncate leading-tight flex-1" title={product.nombre}>{product.nombre}</h4>
        </div>
        <div className="flex items-center gap-0.5 mt-2">
          <div className="flex-1 bg-black/30 rounded-lg p-1 text-center">
            <span className="text-[8px] text-gray-500 block uppercase font-bold leading-none mb-0.5">{labels.small}</span>
            <span className={`text-[11px] font-black ${product.stock['500g'] === 0 ? 'text-gray-700' : 'text-white'}`}>{product.stock['500g']}</span>
          </div>
          <div className="flex-1 bg-black/30 rounded-lg p-1 text-center">
            <span className="text-[8px] text-gray-500 block uppercase font-bold leading-none mb-0.5">{labels.large}</span>
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
          <button onClick={onToggleAdd} className="w-full bg-gray-800/80 hover:bg-gray-700 text-white font-black text-[9px] py-1.5 rounded-lg border border-gray-700 flex items-center justify-center gap-1 transition-all"><Plus size={10} /> Cargar</button>
        ) : (
          <div className="bg-gray-900 absolute inset-0 z-20 p-2 rounded-2xl animate-in fade-in flex flex-col justify-center">
            <AddStockInline nombre={product.nombre} labels={labels} currentStock={product.stock} onCancel={onToggleAdd} onSave={onSaveAdd} />
          </div>
        )}
      </div>
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

function AddStockInline({ nombre, labels, currentStock, onCancel, onSave }) {
  const [data, setData] = useState({ stock_1kg: currentStock['1kg'], stock_500g: currentStock['500g'], fecha: new Date().toISOString().split('T')[0] });
  return (
    <div className="space-y-2">
      <div className="text-center mb-1 text-green-400">
        <p className="text-[10px] font-black truncate">{nombre}</p>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[9px] text-gray-500 font-bold uppercase">{labels.large}:</span>
          <input type="number" value={data.stock_1kg} onChange={(e) => setData({...data, stock_1kg: e.target.value})} className="w-16 bg-black text-[10px] text-white p-1 rounded border border-gray-800 outline-none text-right" />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[9px] text-gray-500 font-bold uppercase">{labels.small}:</span>
          <input type="number" value={data.stock_500g} onChange={(e) => setData({...data, stock_500g: e.target.value})} className="w-16 bg-black text-[10px] text-white p-1 rounded border border-gray-800 outline-none text-right" />
        </div>
        <input type="date" value={data.fecha} onChange={(e) => setData({...data, fecha: e.target.value})} className="w-full bg-black text-[9px] text-white p-1 rounded border border-gray-800 outline-none mt-1" />
      </div>
      <div className="flex gap-1 pt-2">
        <button onClick={onCancel} className="flex-1 text-[8px] text-gray-500 font-bold uppercase py-1">Salir</button>
        <button onClick={() => onSave(data)} className="flex-1 bg-green-600 text-white text-[8px] font-black uppercase py-1 rounded">Listo</button>
      </div>
    </div>
  );
}
