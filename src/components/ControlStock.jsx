import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { useState, useEffect, useMemo } from 'react';
import { 
  AlertTriangle, TrendingUp, Package, Plus, History, 
  Check, Info, Box, Edit2, RotateCcw, X, Save,
  AlertCircle, Loader2
} from 'lucide-react';

// Teclas de LocalStorage (Solo para sincronización de productos master)
const COSTOS_KEY = 'huerta_data_costos_v1_productos';
const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL;

// Configuración por defecto por tipo
const DEFAULTS_BY_TYPE = {
  'hoja verde': { days: 2, icon: '🌿' },
  'blando': { days: 4, icon: '🍑' },
  'duro': { days: 10, icon: '🥔' }
};

export default function ControlStock() {
  const { conectado: apiConectada } = useGoogleSheets();

  // 1. Estados principales
  const [productosMaster, setProductosMaster] = useState([]);
  const [stockData, setStockData] = useState({});
  const [historial, setHistorial] = useState([]);
  const [showFormId, setShowFormId] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  // 2. Cargar productos master y luego el stock de Google Sheets
  useEffect(() => {
    cargarDatosIniciales();
  }, []);

  const cargarDatosIniciales = async () => {
    setCargando(true);
    setError(null);

    // 2a. Leer productos del Panel de Costos (Maestro) desde LocalStorage
    const prodsSaved = localStorage.getItem(COSTOS_KEY);
    const master = prodsSaved ? JSON.parse(prodsSaved) : [];
    setProductosMaster(master);

    // 2b. Leer data de Stock desde Google Sheets
    if (!APPS_SCRIPT_URL) {
      setError('Falta VITE_APPS_SCRIPT_URL en el entorno');
      setCargando(false);
      return;
    }

    try {
      console.log('[STOCK-SYNC] Solicitando stock a Google Sheets...');
      const res = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ accion: 'getStock' })
      });
      
      const data = await res.json();
      if (!Array.isArray(data)) {
        throw new Error('La respuesta de Google Sheets no es un formato válido (se esperaba array)');
      }

      console.log(`[STOCK-SYNC] ✅ ${data.length} registros de stock recibidos.`);

      // Sincronizar Master con Data remota
      const newStockData = {};
      master.forEach(p => {
        // Buscamos el producto en la data remota por nombre o ID
        const remoteInfo = data.find(r => r.nombre?.toLowerCase().trim() === p.nombre?.toLowerCase().trim());
        
        if (remoteInfo) {
          newStockData[p.id] = {
            nombre: p.nombre,
            fila: remoteInfo.fila, // Guardamos la fila para futuras actualizaciones
            stock: { 
              '500g': Number(remoteInfo.stock_500g || 0), 
              '1kg': Number(remoteInfo.stock_1kg || 0) 
            },
            originalLoad: { 
              '500g': Number(remoteInfo.original_load_500g || remoteInfo.stock_500g || 0), 
              '1kg': Number(remoteInfo.original_load_1kg || remoteInfo.stock_1kg || 0) 
            },
            ultimoBandejeado: remoteInfo.ultimo_bandejeado || null,
            tipo: remoteInfo.tipo || 'hoja verde',
            urgentDays: Number(remoteInfo.urgent_days || DEFAULTS_BY_TYPE[remoteInfo.tipo || 'hoja verde'].days)
          };
        } else {
          // Si no existe en el Sheet, lo inicializamos localmente (se guardará al primer cambio)
          newStockData[p.id] = {
            nombre: p.nombre,
            fila: null, // No tiene fila aún
            stock: { '500g': 0, '1kg': 0 },
            originalLoad: { '500g': 0, '1kg': 0 },
            ultimoBandejeado: null,
            tipo: 'hoja verde',
            urgentDays: DEFAULTS_BY_TYPE['hoja verde'].days
          };
        }
      });

      setStockData(newStockData);
    } catch (err) {
      console.error('[STOCK-SYNC] ❌ Error al cargar stock:', err.message);
      setError('No se pudo leer el stock de Google Sheets. Verifica la conexión.');
      
      // Fallback a localStorage por seguridad si ya existía algo (opcional, pero user pidió REEMPLAZAR)
      // Por ahora dejamos el error visible.
    } finally {
      setCargando(false);
    }
  };

  // 3. Lógica de cálculo de alertas y categorías
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

      return { 
        id: Number(id), 
        ...item, 
        totalStock, 
        totalOriginal,
        diasTranscurridos, 
        category
      };
    });
  }, [stockData]);

  // 4. Handlers Principales Sincronizados con Google Sheets
  const syncWithSheet = async (pid, updatedProduct) => {
    if (!APPS_SCRIPT_URL || !updatedProduct.fila) {
      console.warn('[STOCK-SYNC] No se puede sincronizar: Falta URL o Fila');
      return;
    }

    const payload = {
      accion: 'updateStock',
      fila: updatedProduct.fila,
      nombre: updatedProduct.nombre,
      stock_500g: updatedProduct.stock['500g'],
      stock_1kg: updatedProduct.stock['1kg'],
      original_load_500g: updatedProduct.originalLoad['500g'],
      original_load_1kg: updatedProduct.originalLoad['1kg'],
      tipo: updatedProduct.tipo,
      urgent_days: updatedProduct.urgentDays,
      ultimo_bandejeado: updatedProduct.ultimoBandejeado
    };

    try {
      // Usamos no-cors para el envío según instrucción del usuario
      await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      });
      console.log(`[STOCK-SYNC] ✅ Sincronización enviada para ${updatedProduct.nombre}`);
    } catch (e) {
      console.error(`[STOCK-SYNC] ❌ Error al sincronizar:`, e.message);
    }
  };

  const updateProductData = (pid, patch) => {
    const newData = { ...stockData };
    newData[pid] = { ...newData[pid], ...patch };
    setStockData(newData);
    
    // Sincronización remota
    syncWithSheet(pid, newData[pid]);
  };

  const guardarCarga = (pid, formData) => {
    const { tamano, cantidad, tipo, fecha } = formData;
    const cantNum = Math.max(0, Number(cantidad) || 0);

    const newData = { ...stockData };
    const prod = newData[pid];
    
    prod.stock[tamano] += cantNum;
    prod.originalLoad = { ...prod.stock }; 
    prod.ultimoBandejeado = fecha;
    prod.tipo = tipo;

    setStockData(newData);
    syncWithSheet(pid, prod);

    setShowFormId(null);
  };

  if (cargando) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-gray-500 gap-4">
        <Loader2 className="animate-spin text-green-500" size={40} />
        <p className="animate-pulse font-bold text-xs uppercase tracking-widest">Sincronizando con Google Sheets...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-[2rem] p-10 text-center space-y-4">
        <AlertCircle className="mx-auto text-red-500" size={48} />
        <h3 className="text-white font-bold text-lg">Error de Sincronización</h3>
        <p className="text-red-400 text-sm max-w-md mx-auto">{error}</p>
        <button 
          onClick={cargarDatosIniciales}
          className="bg-red-500 text-white px-6 py-2 rounded-xl text-xs font-bold uppercase hover:bg-red-400 transition-colors"
        >
          Reintentar conexión
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-20">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-xl font-bold text-white">Control de Stock</h2>
          <p className="text-gray-500 text-sm mt-1 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            Sincronizado con Google Sheets (Tiempo Real)
          </p>
        </div>
        <button 
          onClick={cargarDatosIniciales}
          className="text-gray-500 hover:text-white transition-colors p-2 rounded-xl bg-white/5"
          title="Refrescar desde Sheet"
        >
          <RotateCcw size={16} />
        </button>
      </div>

      {/* 📦 RESUMEN DE STOCK — 3 COLUMNAS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatusColumn 
          title="🔴 URGENTE VENDER" 
          bg="bg-red-500/5 shadow-[0_0_20px_rgba(239,68,68,0.05)]" 
          borderColor="border-red-500/20"
          items={processedData.filter(d => d.category === 'urgente')}
          type="urgente"
        />

        <StatusColumn 
          title="🟡 STOCK BAJO" 
          bg="bg-amber-500/5 shadow-[0_0_20px_rgba(245,158,11,0.05)]" 
          borderColor="border-amber-500/20"
          items={processedData.filter(d => d.category === 'bajo')}
          type="bajo"
        />

        <StatusColumn 
          title="⚫ FALTANTE" 
          bg="bg-gray-800/10 shadow-[0_0_20px_rgba(0,0,0,0.1)]" 
          borderColor="border-gray-700/50"
          items={processedData.filter(d => d.category === 'faltante')}
          type="faltante"
        />
      </div>

      {/* Grid de Productos */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-2">Inventario en la Nube</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
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

// COMPONENTE: Columnas del Resumen
function StatusColumn({ title, bg, borderColor, items, type }) {
  return (
    <div className={`${bg} ${borderColor} border rounded-[2.5rem] p-6 flex flex-col min-h-[300px]`}>
      <h3 className="text-gray-300 font-black text-xs uppercase tracking-widest mb-6 flex items-center justify-between">
        {title}
        <span className="text-[10px] font-normal opacity-50">{items.length}</span>
      </h3>
      
      <div className="space-y-4">
        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center pt-10 text-gray-600 opacity-40">
            <Check size={32} />
            <p className="text-[10px] uppercase font-bold mt-2">✅ Todo bien</p>
          </div>
        ) : (
          items.map(p => (
            <div key={p.id} className="bg-black/20 border border-white/5 rounded-2xl p-4 shadow-sm">
              <div className="flex justify-between items-start">
                <span className="text-white font-bold text-sm tracking-tight">{p.nombre}</span>
                <span className="text-[10px] font-mono text-gray-500">
                  {type === 'urgente' ? `${p.diasTranscurridos}d` : `${p.totalStock}u`}
                </span>
              </div>
              <div className="flex gap-2 mt-2">
                {Object.entries(p.stock).map(([size, count]) => count > 0 && (
                  <span key={size} className="text-[9px] bg-white/5 px-2 py-0.5 rounded-full text-gray-400">
                    {size}: {count}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// COMPONENTE: Tarjeta de Producto
function ProductCard({ product, onUpdate, isAdding, onToggleAdd, onSaveAdd }) {
  const [editingField, setEditingField] = useState(null);
  const [resetConfirm, setResetConfirm] = useState(null);
  
  const icon = DEFAULTS_BY_TYPE[product.tipo]?.icon || '🌿';

  const handleUpdateStock = (size, val) => {
    const newStock = { ...product.stock };
    newStock[size] = Math.max(0, Number(val));
    onUpdate({ stock: newStock });
    setEditingField(null);
  };

  const handleResetStock = (size) => {
    const newStock = { ...product.stock };
    newStock[size] = 0;
    const total = Object.values(newStock).reduce((a,b)=>a+b, 0);
    onUpdate({ 
      stock: newStock, 
      ultimoBandejeado: total === 0 ? null : product.ultimoBandejeado,
      originalLoad: total === 0 ? { '500g': 0, '1kg': 0 } : product.originalLoad
    });
    setResetConfirm(null);
  };

  return (
    <div className="bg-[#1f2937] border border-gray-800 rounded-[2rem] p-6 hover:border-gray-700 transition-all group overflow-hidden relative">
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">{icon}</span>
            <h4 className="font-bold text-white text-md tracking-tight">{product.nombre}</h4>
          </div>
          <button 
            onClick={() => setEditingField('tipo')}
            className="text-[10px] text-gray-500 uppercase font-black hover:text-white transition-colors flex items-center gap-1"
          >
            {product.tipo} <Edit2 size={8} />
          </button>
        </div>

        <div className="text-right">
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter mb-1">Alerta Urgente</p>
          <button 
            onClick={() => setEditingField('days')}
            className="text-sm font-black text-white hover:text-green-400 transition-colors flex items-center justify-end gap-1"
          >
            {product.urgentDays} d <Edit2 size={10} />
          </button>
        </div>
      </div>

      <div className="space-y-3 mb-6">
        {['500g', '1kg'].map(size => {
          const isFaltante = product.stock[size] === 0;
          return (
            <div key={size} className="bg-black/20 rounded-2xl p-3 flex items-center justify-between border border-white/5">
              <div>
                <span className="text-[10px] font-black text-gray-600 uppercase block mb-0.5">{size}</span>
                {editingField === `stock-${size}` ? (
                  <input 
                    autoFocus
                    type="number"
                    className="bg-gray-800 text-md font-black text-white w-16 px-2 rounded outline-none"
                    value={product.stock[size]}
                    onChange={(e) => handleUpdateStock(size, e.target.value)}
                    onBlur={() => setEditingField(null)}
                    onKeyDown={(e) => e.key === 'Enter' && setEditingField(null)}
                  />
                ) : (
                  <span className={`text-lg font-black ${isFaltante ? 'text-gray-700' : 'text-white'}`}>
                    {product.stock[size]} <span className="text-xs font-normal opacity-40">bandejas</span>
                  </span>
                )}
              </div>
              
              <div className="flex gap-2">
                {resetConfirm === size ? (
                  <div className="flex items-center gap-1 animate-in slide-in-from-right-2">
                    <button onClick={() => handleResetStock(size)} className="bg-red-600 text-white text-[9px] font-black px-2 py-1 rounded-lg">SI, RESET</button>
                    <button onClick={() => setResetConfirm(null)} className="p-1 text-white border border-gray-700 rounded-lg"><X size={12}/></button>
                  </div>
                ) : (
                  <>
                    <button onClick={() => setEditingField(`stock-${size}`)} className="p-2 text-gray-600 hover:text-white transition-colors bg-white/5 rounded-xl"><Edit2 size={14}/></button>
                    <button onClick={() => setResetConfirm(size)} className="p-2 text-gray-600 hover:text-red-500 transition-colors bg-white/5 rounded-xl"><RotateCcw size={14}/></button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-4 border-t border-gray-800">
        <div className="flex justify-between items-center mb-4 text-[10px]">
          <span className="text-gray-500 font-bold uppercase">Último: {product.ultimoBandejeado ? new Date(product.ultimoBandejeado).toLocaleDateString() : 'N/A'}</span>
          <span className={`font-black ${product.diasTranscurridos > product.urgentDays ? 'text-red-500' : 'text-green-500'}`}>
             {product.diasTranscurridos !== null ? `${product.diasTranscurridos} d frescura` : 'Sin datos'}
          </span>
        </div>

        {!isAdding ? (
          <button 
            onClick={onToggleAdd}
            className="w-full flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 text-white font-black text-xs py-3 rounded-2xl transition-all border border-gray-700"
          >
            <Plus size={16} /> Cargar bandejeado
          </button>
        ) : (
          <AddStockInline 
            prodId={product.id}
            initialTipo={product.tipo}
            onCancel={onToggleAdd}
            onSave={onSaveAdd}
          />
        )}
      </div>

      {/* Edit Overlays (Simplified) */}
      {editingField === 'tipo' && (
        <div className="absolute inset-0 bg-gray-900/95 flex flex-col items-center justify-center p-6 z-10 animate-in fade-in">
          <p className="text-[10px] font-bold text-gray-500 uppercase mb-4">Cambiar Tipo</p>
          <div className="grid grid-cols-1 gap-2 w-full">
            {Object.keys(DEFAULTS_BY_TYPE).map(t => (
              <button 
                key={t}
                onClick={() => { onUpdate({ tipo: t, urgentDays: DEFAULTS_BY_TYPE[t].days }); setEditingField(null); }}
                className={`py-3 px-4 rounded-2xl text-xs font-bold uppercase transition-all ${product.tipo === t ? 'bg-green-500 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
              >
                {t} {DEFAULTS_BY_TYPE[t].icon}
              </button>
            ))}
          </div>
          <button onClick={() => setEditingField(null)} className="mt-6 text-[10px] text-gray-500 font-bold uppercase hover:text-white">Cancelar</button>
        </div>
      )}

      {editingField === 'days' && (
        <div className="absolute inset-0 bg-gray-900/95 flex flex-col items-center justify-center p-6 z-10 animate-in fade-in">
          <p className="text-[10px] font-bold text-gray-500 uppercase mb-4">Días Alerta Urgente</p>
          <input 
            autoFocus
            type="number"
            className="bg-black text-3xl font-black text-white text-center w-24 p-4 rounded-3xl border border-gray-800 mb-6 outline-none"
            value={product.urgentDays}
            onChange={(e) => onUpdate({ urgentDays: Number(e.target.value) })}
            onKeyDown={(e) => e.key === 'Enter' && setEditingField(null)}
          />
          <button onClick={() => setEditingField(null)} className="bg-green-500 text-white px-8 py-3 rounded-2xl text-xs font-bold uppercase hover:bg-green-400 transition-all">Guardar</button>
        </div>
      )}
    </div>
  );
}

// COMPONENTE: Formulario inline de carga
function AddStockInline({ onCancel, onSave, initialTipo }) {
  const [data, setData] = useState({
    tamano: '1kg',
    cantidad: 1,
    tipo: initialTipo,
    fecha: new Date().toISOString().split('T')[0]
  });

  return (
    <div className="bg-gray-900 p-4 rounded-2xl space-y-4 animate-in fade-in transition-all">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[9px] font-bold text-gray-500 uppercase block mb-1">Tamaño</label>
          <select 
            value={data.tamano}
            onChange={(e) => setData({...data, tamano: e.target.value})}
            className="w-full bg-[#111827] text-white text-xs border border-gray-800 rounded-xl px-3 py-2 outline-none"
          >
            <option value="500g">500g</option>
            <option value="1kg">1kg</option>
          </select>
        </div>
        <div>
          <label className="text-[9px] font-bold text-gray-500 uppercase block mb-1">Cantidad</label>
          <input 
            type="number"
            value={data.cantidad}
            min="1"
            onChange={(e) => setData({...data, cantidad: e.target.value})}
            className="w-full bg-[#111827] text-white text-xs border border-gray-800 rounded-xl px-3 py-2 outline-none"
          />
        </div>
        <div className="col-span-2">
           <label className="text-[9px] font-bold text-gray-500 uppercase block mb-1">Fecha Bandejeado</label>
           <input 
            type="date"
            value={data.fecha}
            onChange={(e) => setData({...data, fecha: e.target.value})}
            className="w-full bg-[#111827] text-white text-xs border border-gray-800 rounded-xl px-3 py-2 outline-none"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 text-[10px] text-gray-500 font-bold hover:text-white">Cancelar</button>
        <button 
          onClick={() => onSave(data)}
          className="flex-2 bg-green-600 hover:bg-green-500 text-white text-[10px] font-black px-4 py-2 rounded-xl transition-all shadow-lg shadow-green-900/40"
        >
          Guardar Carga
        </button>
      </div>
    </div>
  );
}
