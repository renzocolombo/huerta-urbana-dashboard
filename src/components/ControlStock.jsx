import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { useState, useEffect, useMemo } from 'react';
import { 
  AlertTriangle, TrendingUp, Package, Plus, History, 
  Check, Info, Box, Edit2, RotateCcw, X, Save,
  AlertCircle
} from 'lucide-react';

const $$ = (n) => `$${Number(n).toLocaleString('es-AR')}`;

// Teclas de LocalStorage
const COSTOS_KEY = 'huerta_data_costos_v1_productos';
const STOCK_DATA_KEY = 'huerta_stock_v1_data';
const HISTORY_KEY = 'huerta_stock_v1_history';

// Configuración por defecto por tipo
const DEFAULTS_BY_TYPE = {
  'hoja verde': { days: 2, icon: '🌿' },
  'blando': { days: 4, icon: '🍑' },
  'duro': { days: 10, icon: '🥔' }
};

export default function ControlStock() {
  const { pedidos: PEDIDOS } = useGoogleSheets();

  // 1. Estados principales persistentes
  const [productosMaster, setProductosMaster] = useState([]);
  const [stockData, setStockData] = useState({});
  const [historial, setHistorial] = useState([]);
  const [showFormId, setShowFormId] = useState(null);

  // 2. Cargar datos iniciales de LocalStorage
  useEffect(() => {
    const prodsSaved = localStorage.getItem(COSTOS_KEY);
    const master = prodsSaved ? JSON.parse(prodsSaved) : [];
    setProductosMaster(master);

    const stockSaved = localStorage.getItem(STOCK_DATA_KEY);
    const sData = stockSaved ? JSON.parse(stockSaved) : {};
    
    // Sincronizar y aplicar esquema extendido
    const updatedStockData = { ...sData };
    master.forEach(p => {
      if (!updatedStockData[p.id]) {
        updatedStockData[p.id] = {
          nombre: p.nombre,
          stock: { '500g': 0, '1kg': 0 },
          originalLoad: { '500g': 0, '1kg': 0 },
          ultimoBandejeado: null,
          tipo: 'hoja verde',
          urgentDays: DEFAULTS_BY_TYPE['hoja verde'].days
        };
      } else {
        // Asegurar campos nuevos en registros viejos
        updatedStockData[p.id].nombre = p.nombre;
        if (!updatedStockData[p.id].originalLoad) updatedStockData[p.id].originalLoad = updatedStockData[p.id].stock;
        if (!updatedStockData[p.id].urgentDays) {
          const type = updatedStockData[p.id].tipo || 'hoja verde';
          updatedStockData[p.id].urgentDays = DEFAULTS_BY_TYPE[type]?.days || 2;
        }
      }
    });

    // Limpiar obsoletos
    Object.keys(updatedStockData).forEach(id => {
      if (!master.find(p => p.id === Number(id))) delete updatedStockData[id];
    });

    setStockData(updatedStockData);
    localStorage.setItem(STOCK_DATA_KEY, JSON.stringify(updatedStockData));

    const histSaved = localStorage.getItem(HISTORY_KEY);
    setHistorial(histSaved ? JSON.parse(histSaved) : []);
  }, []);

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

      // LÓGICA DE ESTADOS
      const isFaltante = totalStock === 0;
      const isUrgente = diasTranscurridos !== null && diasTranscurridos > item.urgentDays;
      const isStockBajo = !isFaltante && totalOriginal > 0 && totalStock <= (totalOriginal / 2);

      // Jerarquía: Faltante > Urgente > Bajo
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

  // 4. Handlers Principales
  const updateProductData = (pid, patch) => {
    const newData = { ...stockData };
    newData[pid] = { ...newData[pid], ...patch };
    setStockData(newData);
    localStorage.setItem(STOCK_DATA_KEY, JSON.stringify(newData));
  };

  const guardarCarga = (pid, formData) => {
    const { tamano, cantidad, tipo, fecha } = formData;
    const cantNum = Math.max(0, Number(cantidad) || 0);

    const newData = { ...stockData };
    const prod = newData[pid];
    
    // Al cargar bandejeado, sumamos y actualizamos el originalLoad al nuevo total
    prod.stock[tamano] += cantNum;
    prod.originalLoad = { ...prod.stock }; // El nuevo original es el stock total actual
    prod.ultimoBandejeado = fecha;
    prod.tipo = tipo;

    setStockData(newData);
    localStorage.setItem(STOCK_DATA_KEY, JSON.stringify(newData));

    // Historial
    const entry = {
      id: Date.now(), pid, nombre: prod.nombre, tamano, cantidad: cantNum,
      mode: 'add', fecha, tipo, fechaRegistro: new Date().toISOString()
    };
    setHistorial([entry, ...historial]);
    localStorage.setItem(HISTORY_KEY, JSON.stringify([entry, ...historial]));
    setShowFormId(null);
  };

  return (
    <div className="space-y-10 pb-20">
      <div>
        <h2 className="text-xl font-bold text-white">Control de Stock</h2>
        <p className="text-gray-500 text-sm mt-1">Gestión avanzada centrada en reposición y frescura</p>
      </div>

      {/* 📦 REDISEÑO DEL RESUMEN — 3 COLUMNAS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Columna 1: URGENTE VENDER */}
        <StatusColumn 
          title="🔴 URGENTE VENDER" 
          bg="bg-red-500/5 shadow-[0_0_20px_rgba(239,68,68,0.05)]" 
          borderColor="border-red-500/20"
          items={processedData.filter(d => d.category === 'urgente')}
          type="urgente"
        />

        {/* Columna 2: STOCK BAJO */}
        <StatusColumn 
          title="🟡 STOCK BAJO" 
          bg="bg-amber-500/5 shadow-[0_0_20px_rgba(245,158,11,0.05)]" 
          borderColor="border-amber-500/20"
          items={processedData.filter(d => d.category === 'bajo')}
          type="bajo"
        />

        {/* Columna 3: FALTANTE */}
        <StatusColumn 
          title="⚫ FALTANTE" 
          bg="bg-gray-800/10 shadow-[0_0_20px_rgba(0,0,0,0.1)]" 
          borderColor="border-gray-700/50"
          items={processedData.filter(d => d.category === 'faltante')}
          type="faltante"
        />
      </div>

      {/* Grid de Productos Detallado */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-2">Inventario Completo</h3>
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

      {/* Historial footer simple */}
      <div className="pt-10">
        <div className="flex items-center gap-2 mb-4 text-gray-500 opacity-50">
          <History size={16} />
          <span className="text-xs uppercase font-bold tracking-tighter">Últimos movimientos registrados</span>
        </div>
        <div className="space-y-2 opacity-50">
          {historial.slice(0, 5).map(h => (
            <div key={h.id} className="text-[10px] text-gray-400 font-mono flex gap-2">
              <span>{new Date(h.fechaRegistro).toLocaleDateString()}</span>
              <span className="text-gray-600">|</span>
              <span className="text-white">{h.nombre}</span>
              <span className="text-gray-600">|</span>
              <span className={h.mode === 'add' ? 'text-green-500' : 'text-blue-500'}>{h.mode === 'add' ? '+' : ''}{h.cantidad} {h.tamano}</span>
            </div>
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

// COMPONENTE: Tarjeta de Producto (Altamente editable)
function ProductCard({ product, onUpdate, isAdding, onToggleAdd, onSaveAdd }) {
  const [editingField, setEditingField] = useState(null); // 'tipo' | 'days' | 'stock500' | 'stock1k'
  const [resetConfirm, setResetConfirm] = useState(null); // '500g' | '1kg'
  
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
    // Si reseteamos todo, limpiamos fecha. Si no, solo el tamaño.
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
          
          {/* Edición de Tipo */}
          <div className="flex items-center gap-2">
            {editingField === 'tipo' ? (
              <select 
                autoFocus
                className="bg-gray-900 text-xs text-white border border-gray-700 rounded-lg px-2 py-1 outline-none"
                value={product.tipo}
                onChange={(e) => { onUpdate({ 
                  tipo: e.target.value, 
                  urgentDays: DEFAULTS_BY_TYPE[e.target.value]?.days || product.urgentDays 
                }); setEditingField(null); }}
                onBlur={() => setEditingField(null)}
              >
                <option value="hoja verde">Hoja Verde</option>
                <option value="blando">Blando</option>
                <option value="duro">Duro</option>
              </select>
            ) : (
              <button 
                onClick={() => setEditingField('tipo')}
                className="text-[10px] text-gray-500 uppercase font-black hover:text-white transition-colors flex items-center gap-1"
              >
                {product.tipo} <Edit2 size={8} />
              </button>
            )}
          </div>
        </div>

        {/* Alerta de días */}
        <div className="text-right">
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter mb-1">Alerta Urgente</p>
          {editingField === 'days' ? (
            <input 
              autoFocus
              type="number"
              className="bg-gray-900 text-xs text-white border border-gray-700 rounded-lg w-12 px-2 py-1 text-right outline-none"
              value={product.urgentDays}
              onChange={(e) => onUpdate({ urgentDays: Number(e.target.value) })}
              onBlur={() => setEditingField(null)}
              onKeyDown={(e) => e.key === 'Enter' && setEditingField(null)}
            />
          ) : (
            <button 
              onClick={() => setEditingField('days')}
              className="text-sm font-black text-white hover:text-green-400 transition-colors flex items-center justify-end gap-1"
            >
              {product.urgentDays} d <Edit2 size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Gestión de Stock */}
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
                    <button onClick={() => setResetConfirm(null)} className="bg-gray-700 text-white p-1 rounded-lg"><X size={12}/></button>
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

      {/* Info extra y botón carga */}
      <div className="pt-4 border-t border-gray-800">
        <div className="flex justify-between items-center mb-4 text-[10px]">
          <span className="text-gray-500 font-bold uppercase">Último: {product.ultimoBandejeado ? new Date(product.ultimoBandejeado).toLocaleDateString() : 'N/A'}</span>
          <span className={`font-black ${product.diasTranscurridos > product.urgentDays ? 'text-red-500' : 'text-green-500'}`}>
             {product.diasTranscurridos !== null ? `${product.diasTranscurridos} días de frescura` : 'Sin datos'}
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
