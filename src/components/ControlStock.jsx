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
  'hoja verde': { totalDays: 4, alertDays: 2, icon: '🌿', labels: { small: '250g', large: '500g' } },
  'blando': { totalDays: 7, alertDays: 4, icon: '🍑', labels: { small: '500g', large: '1kg' } },
  'duro': { totalDays: 15, alertDays: 11, icon: '🥔', labels: { small: '500g', large: '1kg' } }
};

const PRODUCT_DATABASE = {
  'hoja verde': ['espinaca', 'lechuga', 'rucula', 'acelga', 'perejil', 'albahaca', 'ciboulette', 'radicheta'],
  'blando': ['tomate', 'tomate cherry', 'banana', 'durazno', 'frutilla', 'pera', 'morron', 'pepino', 'chaucha', 'berenjena'],
  'duro': [
    'papa', 'cebolla', 'cebolla comun', 'cebolla morada', 'zanahoria', 'zapallito', 'zapallo blanco', 'cabutia', 
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
  const { stockData, setStockData, productosCostos: contextMaster, stockData: contextStock } = useGoogleSheets();
  const [productosMaster, setProductosMaster] = useState([]);
  const [showFormId, setShowFormId] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [expandedCategory, setExpandedCategory] = useState(null);

  useEffect(() => {
    console.log('[CONTROL-STOCK] useEffect disparado. contextMaster:', contextMaster?.length, 'contextStock:', contextStock?.length);
    // contextMaster y contextStock vienen del fetch inicial en el contexto
    if (contextMaster?.length > 0 && contextStock?.length > 0) {
      console.log('[CONTROL-STOCK] Usando datos del contexto.');
      setProductosMaster(contextMaster);
      // Solo inicializar si el stock global está vacío o es un array (crudo de fetch)
      if (!stockData || Object.keys(stockData).length === 0 || Array.isArray(stockData)) {
        const initial = inicializarStockLocal(contextMaster, contextStock);
        setStockData(initial);
      }
      setCargando(false);
    } else {
      console.log('[CONTROL-STOCK] Datos del contexto no disponibles, cargando desde Sheet...');
      cargarStockDesdeSheet();
    }
  }, [contextMaster, contextStock]);

  const cargarStockDesdeSheet = async () => {
    setCargando(true);
    setError(null);
    
    const prodsSaved = localStorage.getItem(COSTOS_KEY);
    const master = prodsSaved ? JSON.parse(prodsSaved) : [];
    setProductosMaster(master);

    if (!API_KEY || !SHEET_ID) {
      console.error('[CONTROL-STOCK] Error: No hay API_KEY o SHEET_ID');
      setError('Faltan claves de configuración (SHEET_ID / API_KEY) en .env');
      setCargando(false);
      return;
    }

    console.log('[CONTROL-STOCK] Iniciando carga desde cargarStockDesdeSheet...');
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/ControlStock?key=${API_KEY}`;
      console.log('[CONTROL-STOCK] URL:', url);
      const res = await fetch(url);
      const data = await res.json();
      console.log('[CONTROL-STOCK] Respuesta:', data);
      
      if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
      const rows = data.values;
      
      if (!rows || rows.length < 1) {
        inicializarConDatos(master, []);
        return;
      }
      
      const headers = rows[0].map(h => h.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ /g, '_'));
      const parsedRows = rows.slice(1).map((row, index) => {
        const obj = { fila: index + 2 };
        headers.forEach((h, i) => { obj[h] = row[i] || ''; });
        return obj;
      });
      
      const initial = inicializarStockLocal(master, parsedRows);
      setStockData(initial);
    } catch (err) {
      console.error('[CONTROL-STOCK] Error crítico:', err);
      setError('No se pudo leer el stock. Revisa la conexión.');
    } finally {
      setCargando(false);
    }
  };

  const inicializarStockLocal = (master, remoteData) => {
    const newStockData = {};
    
    // Si master está vacío (ej: usuario Produccion), usar nombres de remoteData
    const catalog = (master && master.length > 0) ? master : remoteData.map((r, idx) => ({ id: 1000 + idx, nombre: r.producto || r.nombre }));

    catalog.forEach(p => {
      if (!p.nombre) return;
      const remoteInfo = remoteData.find(r => (r.producto || r.nombre)?.toLowerCase().trim() === p.nombre?.toLowerCase().trim());
      
      // Clasificación automática
      const autoTipo = getTipoByNombre(p.nombre);

      if (remoteInfo) {
        newStockData[p.id] = {
          nombre: p.nombre,
          fila: remoteInfo.fila,
          stock: { '500g': Number(remoteInfo.stock_500g || 0), '1kg': Number(remoteInfo.stock_1kg || 0) },
          originalLoad: { '500g': Number(remoteInfo.original_load_500g || remoteInfo.stock_500g || 0), '1kg': Number(remoteInfo.original_load_1kg || remoteInfo.stock_1kg || 0) },
          ultimoBandejeado: remoteInfo.ultimo_bandejeado || null,
          tipo: remoteInfo.tipo || autoTipo,
          totalDays: Number(remoteInfo.total_days || DEFAULTS_BY_TYPE[remoteInfo.tipo || autoTipo]?.totalDays || 4),
          urgentDays: Number(remoteInfo.urgent_days || DEFAULTS_BY_TYPE[remoteInfo.tipo || autoTipo]?.alertDays || 2)
        };
      } else if (p.fila) {
         // Si venía de remoteData pero no tiene match (raro)
         const def = DEFAULTS_BY_TYPE[autoTipo];
         newStockData[p.id] = {
           nombre: p.nombre, fila: p.fila, stock: { '500g': 0, '1kg': 0 }, originalLoad: { '500g': 0, '1kg': 0 },
           ultimoBandejeado: null, tipo: autoTipo, totalDays: def.totalDays, urgentDays: def.alertDays
         };
      } else {
        const def = DEFAULTS_BY_TYPE[autoTipo];
        newStockData[p.id] = {
          nombre: p.nombre, fila: null, stock: { '500g': 0, '1kg': 0 }, originalLoad: { '500g': 0, '1kg': 0 },
          ultimoBandejeado: null, tipo: autoTipo, totalDays: def.totalDays, urgentDays: def.alertDays
        };
      }
    });
    setStockData(newStockData);
  };

  const processedData = useMemo(() => {
    return Object.keys(stockData || {}).map(id => {
      const item = stockData[id];
      const totalStock = Object.values(item.stock || {}).reduce((s, c) => s + c, 0);
      const totalOriginal = Object.values(item.originalLoad || {}).reduce((s, c) => s + c, 0);
      
      let diasTranscurridos = null;
      let diasRestantes = null;
      if (item.ultimoBandejeado) {
        const diff = new Date() - new Date(item.ultimoBandejeado);
        diasTranscurridos = Math.floor(diff / (1000 * 60 * 60 * 24));
        diasRestantes = Math.max(0, item.totalDays - diasTranscurridos);
      }

      const isFaltante = totalStock === 0;
      
      // Lógica solicitada: Urgente Vender si días restantes <= 2
      const isUrgente = !isFaltante && diasRestantes !== null && (diasRestantes <= 2);
      const isStockBajo = !isFaltante && !isUrgente && totalOriginal > 0 && totalStock <= (totalOriginal / 2);

      let category = 'ok';
      if (isFaltante) category = 'faltante';
      else if (isUrgente) category = 'urgente';
      else if (isStockBajo) category = 'bajo';

      // Semáforo: Verde (> mitad), Amarillo (<= mitad), Rojo (<= 2), Gris (faltante)
      let statusColor = 'green';
      if (isFaltante) statusColor = 'gray';
      else if (diasRestantes !== null) {
        if (diasRestantes <= 2) statusColor = 'red';
        else if (diasRestantes <= (item.totalDays / 2)) statusColor = 'yellow';
      }

      return { id: Number(id), ...item, totalStock, totalOriginal, diasTranscurridos, diasRestantes, category, statusColor };
    });
  }, [stockData]);

  const syncWithSheet = async (updatedProduct) => {
    if (!APPS_SCRIPT_URL || !updatedProduct.fila) return;
    const payload = {
      accion: 'updateStock', fila: updatedProduct.fila, nombre: updatedProduct.nombre,
      stock_500g: updatedProduct.stock['500g'], stock_1kg: updatedProduct.stock['1kg'],
      original_load_500g: updatedProduct.originalLoad['500g'], original_load_1kg: updatedProduct.originalLoad['1kg'],
      tipo: updatedProduct.tipo, total_days: updatedProduct.totalDays, urgent_days: updatedProduct.urgentDays, ultimo_bandejeado: updatedProduct.ultimo_bandejeado
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
    
    // Asignación automática de días según tipo al cargar
    const typeDef = DEFAULTS_BY_TYPE[prod.tipo] || DEFAULTS_BY_TYPE['hoja verde'];
    prod.totalDays = typeDef.totalDays;
    prod.urgentDays = typeDef.alertDays;

    prod.stock['1kg'] = Math.max(0, Number(stock_1kg) || 0);
    prod.stock['500g'] = Math.max(0, Number(stock_500g) || 0);
    prod.originalLoad = { ...prod.stock }; 
    prod.ultimoBandejeado = fecha;
    
    setStockData(newData);
    syncWithSheet(prod);
    setShowFormId(null);
  };

  if (cargando) return <div className="flex flex-col items-center justify-center min-h-[400px] text-gray-500 gap-4"><Loader2 className="animate-spin text-green-500" size={40} /><p className="animate-pulse font-bold text-xs uppercase tracking-widest text-center">Cargando Stock...</p></div>;
  if (error) return <div className="bg-red-500/10 border border-red-500/20 rounded-[2rem] p-10 text-center space-y-4"><AlertCircle className="mx-auto text-red-500" size={48} /><h3 className="text-white font-bold text-lg">Error</h3><p className="text-red-400 text-sm max-w-md mx-auto">{error}</p><button onClick={cargarStockDesdeSheet} className="bg-red-500 text-white px-6 py-2 rounded-xl text-xs font-bold uppercase">Reintentar</button></div>;

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
        <button onClick={cargarStockDesdeSheet} className="text-gray-500 hover:text-white transition-colors p-2.5 rounded-xl bg-white/5"><RotateCcw size={16} /></button>
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
  // Estado local para edición de ajustes antes de guardar
  const [localSettings, setLocalSettings] = useState({ tipo: product.tipo, totalDays: product.totalDays, urgentDays: product.urgentDays });

  useEffect(() => {
    if (editing) setLocalSettings({ tipo: product.tipo, totalDays: product.totalDays, urgentDays: product.urgentDays });
  }, [editing, product]);

  const handleSaveSettings = () => {
    onUpdate(localSettings);
    setEditing(false);
  };

  const typeConfig = DEFAULTS_BY_TYPE[product.tipo] || DEFAULTS_BY_TYPE['hoja verde'];
  const icon = typeConfig.icon;
  const labels = typeConfig.labels;
  
  const cardStyles = { 
    red: 'bg-red-500/10 border-red-500/30 text-red-200', 
    yellow: 'bg-amber-500/10 border-amber-500/30 text-amber-100', 
    green: 'bg-green-500/10 border-green-500/20 text-green-100', 
    gray: 'bg-gray-800/20 border-gray-800 text-gray-500' 
  };

  const statusDot = { 
    red: 'bg-red-500 shadow-red-500', 
    yellow: 'bg-amber-500 shadow-amber-500', 
    green: 'bg-green-500 shadow-green-500', 
    gray: 'bg-gray-500' 
  };

  return (
    <div className={`${cardStyles[product.statusColor]} border rounded-3xl p-5 flex flex-col justify-between hover:scale-[1.02] transition-all relative group shadow-lg min-h-[230px]`}>
      <div className={`absolute top-4 right-4 w-2 h-2 rounded-full ${statusDot[product.statusColor]} shadow-[0_0_10px]`} />
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">{icon}</span>
          <h4 className="font-black text-white text-[14px] uppercase tracking-wide truncate leading-tight flex-1" title={product.nombre}>{product.nombre}</h4>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
             <span className="text-base">📦</span>
             <p className="text-[12px] font-bold">
               {product.totalStock} {product.totalStock === 1 ? 'bandeja' : 'bandejas'} 
               <span className="opacity-60 ml-1 font-medium">
                 ({product.stock['500g']}x{labels.small} | {product.stock['1kg']}x{labels.large})
               </span>
             </p>
          </div>
          
          <div className="flex items-center gap-2 opacity-80">
             <span className="text-base">📅</span>
             <p className={`text-[12px] font-bold uppercase tracking-tight ${!product.ultimoBandejeado ? 'text-gray-600' : ''}`}>
               {!product.ultimoBandejeado ? 'Sin stock cargado aún' : 
                product.diasTranscurridos === 0 ? 'Cargado hoy' : 
                product.diasTranscurridos === 1 ? 'Cargado hace 1 día' : 
                `Cargado hace ${product.diasTranscurridos} días`}
             </p>
          </div>
        </div>
      </div>

      <div className="mt-auto pt-4 space-y-3">
        <div className="bg-black/30 p-3 rounded-2xl border border-white/5">
           {product.diasRestantes <= 0 ? (
             <p className="text-[13px] font-black text-red-500 flex items-center gap-2 animate-pulse">
               🔴 VENDER HOY
             </p>
           ) : (
             <div className="space-y-1">
               <p className="text-[12px] font-bold flex items-center gap-2">
                 <span className="text-blue-400">⏳</span> {product.diasRestantes} días restantes
               </p>
               {product.diasRestantes > 2 && (
                 <p className="text-[10px] font-black uppercase opacity-40 flex items-center gap-1">
                   ⚠️ Urgente en: {product.diasRestantes - 2} días
                 </p>
               )}
               {product.diasRestantes <= 2 && product.diasRestantes > 0 && (
                 <p className="text-[11px] font-black uppercase text-red-400 flex items-center gap-1">
                   ⚠️ Urgente: vender ahora
                 </p>
               )}
             </div>
           )}
        </div>

        {!isAdding ? (
          <div className="flex justify-between items-center gap-3">
            <button onClick={onToggleAdd} className="flex-1 bg-green-600 hover:bg-green-500 text-white font-black text-[11px] py-3.5 rounded-xl shadow-lg border-b-4 border-green-800 active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-2 uppercase tracking-[0.1em]">
              <Plus size={16} /> Cargar
            </button>
            <button onClick={() => setEditing(true)} className="p-3.5 bg-white/5 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-all">
              <Settings size={18}/>
            </button>
          </div>
        ) : (
          <div className="bg-gray-900 absolute inset-0 z-20 p-5 rounded-3xl animate-in fade-in zoom-in-95 flex flex-col justify-center">
            <AddStockInline nombre={product.nombre} labels={labels} currentStock={product.stock} onCancel={onToggleAdd} onSave={onSaveAdd} />
          </div>
        )}
      </div>
      {editing && (
        <div className="absolute inset-0 bg-gray-900/95 z-30 p-4 rounded-3xl flex flex-col justify-center gap-3 animate-in slide-in-from-bottom-2">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Ajustes</span>
            <button onClick={() => setEditing(false)}><X size={14} className="text-gray-500 hover:text-white"/></button>
          </div>
          <div className="space-y-1">
             <p className="text-[9px] text-gray-600 uppercase font-black">Categoría</p>
             <div className="grid grid-cols-3 gap-1">
                {Object.keys(DEFAULTS_BY_TYPE).map(t => (
                  <button 
                    key={t} 
                    onClick={() => {
                       const def = DEFAULTS_BY_TYPE[t];
                       setLocalSettings({ ...localSettings, tipo: t, totalDays: def.totalDays, urgentDays: def.alertDays });
                    }} 
                    className={`p-1.5 rounded text-[8px] font-black uppercase tracking-tighter ${localSettings.tipo === t ? 'bg-green-600 text-white' : 'bg-white/5 text-gray-500'}`}
                  >
                    {t.split(' ')[0]}
                  </button>
                ))}
             </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
                <p className="text-[8px] text-gray-600 uppercase font-black">Vida Útil</p>
                <input type="number" className="w-full bg-black text-[12px] font-bold text-white px-2 py-1.5 rounded border border-gray-800 outline-none" value={localSettings.totalDays} onChange={(e) => setLocalSettings({...localSettings, totalDays: Number(e.target.value)})} />
            </div>
            <div className="space-y-1">
               <p className="text-[8px] text-gray-600 uppercase font-black">Urgente</p>
               <input type="number" className="w-full bg-black text-[12px] font-bold text-white px-2 py-1.5 rounded border border-gray-800 outline-none" value={localSettings.urgentDays} onChange={(e) => setLocalSettings({...localSettings, urgentDays: Number(e.target.value)})} />
            </div>
          </div>
          <div className="pt-2 space-y-2">
            <button onClick={handleSaveSettings} className="w-full bg-green-600 hover:bg-green-500 text-white text-[10px] font-black uppercase py-2.5 rounded-xl shadow-lg border-b-2 border-green-800 active:border-0 active:translate-y-0.5">Guardar Cambios</button>
            <button onClick={() => { if(confirm("¿Resetear stock y fechas?")) onUpdate({ stock: { '500g': 0, '1kg': 0 }, ultimoBandejeado: null }); setEditing(false); }} className="w-full text-red-500/60 hover:text-red-500 text-[8px] font-bold uppercase py-1">Reset Stock</button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddStockInline({ nombre, labels, currentStock, onCancel, onSave }) {
  const [data, setData] = useState({ stock_1kg: currentStock['1kg'], stock_500g: currentStock['500g'], fecha: new Date().toISOString().split('T')[0] });
  return (
    <div className="flex flex-col h-full justify-between py-1">
      <div className="text-center border-b border-white/10 pb-1">
        <p className="text-[12px] font-black truncate uppercase tracking-widest text-green-400">{nombre}</p>
      </div>
      <div className="space-y-2 mt-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-gray-400 font-bold uppercase tracking-tighter">{labels.large}:</span>
          <input 
            type="number" 
            autoFocus
            className="w-16 h-8 bg-black text-sm font-black text-white px-2 rounded-lg border border-gray-700 focus:border-green-500 outline-none text-center"
            value={data.stock_1kg} 
            onChange={(e) => setData({...data, stock_1kg: e.target.value})} 
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-gray-400 font-bold uppercase tracking-tighter">{labels.small}:</span>
          <input 
            type="number" 
            className="w-16 h-8 bg-black text-sm font-black text-white px-2 rounded-lg border border-gray-700 focus:border-green-500 outline-none text-center"
            value={data.stock_500g} 
            onChange={(e) => setData({...data, stock_500g: e.target.value})} 
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[8px] font-black text-gray-600 uppercase tracking-widest ml-1">Fecha</label>
          <input 
            type="date" 
            className="w-full h-8 bg-black text-[12px] font-bold text-white px-2 rounded-lg border border-gray-700 focus:border-green-500 outline-none"
            value={data.fecha} 
            onChange={(e) => setData({...data, fecha: e.target.value})} 
          />
        </div>
      </div>
      <div className="flex gap-1.5 mt-3">
        <button onClick={onCancel} className="flex-1 h-9 bg-gray-800 text-gray-400 font-black text-[10px] uppercase tracking-tighter rounded-xl">Salir</button>
        <button onClick={() => onSave(data)} className="flex-[2] h-9 bg-green-600 text-white font-black text-[10px] uppercase tracking-widest rounded-xl border-b-2 border-green-800 shadow-md">Guardar</button>
      </div>
    </div>
  );
}
