import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { useState, useEffect, useMemo } from 'react';
import { 
  AlertTriangle, TrendingUp, Package, Plus, History, 
  ChevronDown, ChevronUp, Check, Info, Box
} from 'lucide-react';

const $$ = (n) => `$${Number(n).toLocaleString('es-AR')}`;

// Teclas de LocalStorage
const COSTOS_KEY = 'huerta_data_costos_v1_productos';
const STOCK_DATA_KEY = 'huerta_stock_v1_data';
const HISTORY_KEY = 'huerta_stock_v1_history';

export default function ControlStock() {
  const { pedidos: PEDIDOS } = useGoogleSheets();

  // 1. Estados principales persistentes
  const [productosMaster, setProductosMaster] = useState([]);
  const [stockData, setStockData] = useState({});
  const [historial, setHistorial] = useState([]);
  const [showFormId, setShowFormId] = useState(null); // ID del producto mostrando formulario

  // 2. Cargar datos iniciales de LocalStorage
  useEffect(() => {
    // 2a. Leer productos del Panel de Costos
    const prodsSaved = localStorage.getItem(COSTOS_KEY);
    const master = prodsSaved ? JSON.parse(prodsSaved) : [];
    setProductosMaster(master);

    // 2b. Leer data de Stock
    const stockSaved = localStorage.getItem(STOCK_DATA_KEY);
    const sData = stockSaved ? JSON.parse(stockSaved) : {};
    
    // Sincronizar: Asegurar que cada producto activo de Master tenga una entrada en stockData
    const updatedStockData = { ...sData };
    master.forEach(p => {
      if (!updatedStockData[p.id]) {
        updatedStockData[p.id] = {
          nombre: p.nombre,
          stock: { '500g': 0, '1kg': 0 },
          ultimoBandejeado: null,
          tipo: 'hoja verde'
        };
      } else {
        // Actualizar nombre por si cambió en Panel de Costos
        updatedStockData[p.id].nombre = p.nombre;
      }
    });

    // Limpiar: Eliminar del stock los productos que ya no existen en Master
    Object.keys(updatedStockData).forEach(id => {
      if (!master.find(p => p.id === Number(id))) {
        delete updatedStockData[id];
      }
    });

    setStockData(updatedStockData);
    localStorage.setItem(STOCK_DATA_KEY, JSON.stringify(updatedStockData));

    // 2c. Leer Historial
    const histSaved = localStorage.getItem(HISTORY_KEY);
    setHistorial(histSaved ? JSON.parse(histSaved) : []);
  }, []);

  // 3. Lógica de cálculo de alertas y resumen
  const processedData = useMemo(() => {
    return Object.keys(stockData).map(id => {
      const item = stockData[id];
      const totalBandejas = Object.values(item.stock).reduce((s, c) => s + c, 0);
      
      // Cálculo de días transcurridos
      let diasTranscurridos = null;
      if (item.ultimoBandejeado) {
        const diff = new Date() - new Date(item.ultimoBandejeado);
        diasTranscurridos = Math.floor(diff / (1000 * 60 * 60 * 24));
      }

      // Semáforo Cantidad (🟢 4+, 🟡 2-3, 🔴 0-1)
      let statusCant = 'ok';
      if (totalBandejas <= 1) statusCant = 'urgente';
      else if (totalBandejas <= 3) statusCant = 'bajo';

      // Semáforo Días según tipo
      let statusDias = 'ok';
      if (diasTranscurridos !== null) {
        if (item.tipo === 'hoja verde') {
          if (diasTranscurridos >= 2) statusDias = 'urgente';
          else if (diasTranscurridos >= 1) statusDias = 'bajo';
        } else if (item.tipo === 'blando') {
          if (diasTranscurridos >= 5) statusDias = 'urgente';
          else if (diasTranscurridos >= 3) statusDias = 'bajo';
        } else if (item.tipo === 'duro') {
          if (diasTranscurridos >= 12) statusDias = 'urgente';
          else if (diasTranscurridos >= 7) statusDias = 'bajo';
        }
      }

      // El estado general es el más severo de los dos
      const severityMap = { 'ok': 0, 'bajo': 1, 'urgente': 2 };
      const val = Math.max(severityMap[statusCant], severityMap[statusDias]);
      const statusFinal = Object.keys(severityMap).find(k => severityMap[k] === val);

      return { id: Number(id), ...item, totalBandejas, diasTranscurridos, statusFinal, statusCant, statusDias };
    });
  }, [stockData]);

  const resumen = useMemo(() => {
    return {
      urgente: processedData.filter(d => d.statusFinal === 'urgente').length,
      bajo: processedData.filter(d => d.statusFinal === 'bajo').length,
      ok: processedData.filter(d => d.statusFinal === 'ok').length,
    };
  }, [processedData]);

  // 4. Funciones de carga
  const guardarCarga = (pid, formData) => {
    const { tamano, cantidad, tipo, fecha, mode } = formData;
    
    // Normalizar cantidad (no negativos, default 0)
    const cantNum = Math.max(0, Number(cantidad) || 0);

    // Actualizar StockData
    const newStockData = { ...stockData };
    const prod = newStockData[pid];
    
    if (mode === 'set') {
      prod.stock[tamano] = cantNum;
    } else {
      prod.stock[tamano] += cantNum;
    }
    
    prod.ultimoBandejeado = fecha;
    prod.tipo = tipo;

    setStockData(newStockData);
    localStorage.setItem(STOCK_DATA_KEY, JSON.stringify(newStockData));

    // Agregar al Historial
    const newEntry = {
      id: Date.now(),
      pid,
      nombre: prod.nombre,
      tamano,
      cantidad: cantNum,
      mode: mode || 'add',
      fecha: fecha,
      tipo,
      fechaRegistro: new Date().toISOString()
    };
    const newHistorial = [newEntry, ...historial];
    setHistorial(newHistorial);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistorial));

    setShowFormId(null);
  };

  const resetearStock = (pid) => {
    if (!window.confirm(`¿Resetear el stock de ${stockData[pid].nombre}?`)) return;

    const newStockData = { ...stockData };
    newStockData[pid].stock = { '500g': 0, '1kg': 0 };
    newStockData[pid].ultimoBandejeado = null;

    setStockData(newStockData);
    localStorage.setItem(STOCK_DATA_KEY, JSON.stringify(newStockData));
    
    // Opcional: registrar en historial
    const newEntry = {
      id: Date.now(),
      pid,
      nombre: newStockData[pid].nombre,
      tamano: 'Todos',
      cantidad: 0,
      mode: 'reset',
      fecha: new Date().toISOString().split('T')[0],
      tipo: newStockData[pid].tipo,
      fechaRegistro: new Date().toISOString()
    };
    setHistorial([newEntry, ...historial]);
    localStorage.setItem(HISTORY_KEY, JSON.stringify([newEntry, ...historial]));
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Control de Stock</h2>
          <p className="text-gray-500 text-sm mt-1">Gestión de bandejas sincronizada con costos y ventas</p>
        </div>
      </div>

      {/* 📦 RESUMEN DE STOCK HOY */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#1f2937] border border-red-500/30 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center text-red-400">
            <AlertTriangle size={24} />
          </div>
          <div>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Urgente vender</p>
            <p className="text-2xl font-black text-white">{resumen.urgente}</p>
          </div>
        </div>
        <div className="bg-[#1f2937] border border-amber-500/30 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Stock bajo</p>
            <p className="text-2xl font-black text-white">{resumen.bajo}</p>
          </div>
        </div>
        <div className="bg-[#1f2937] border border-green-500/30 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center text-green-400">
            <Check size={24} />
          </div>
          <div>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Stock OK</p>
            <p className="text-2xl font-black text-white">{resumen.ok}</p>
          </div>
        </div>
      </div>

      {/* Grid de Productos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {processedData.map(p => (
          <ProductCard 
            key={p.id} 
            product={p} 
            isEditing={showFormId === p.id}
            onToggleEdit={() => setShowFormId(showFormId === p.id ? null : p.id)}
            onSave={(data) => guardarCarga(p.id, data)}
            onReset={() => resetearStock(p.id)}
          />
        ))}
      </div>

      {/* Historial */}
      <div className="bg-[#111827] border border-gray-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="p-6 border-b border-gray-800 flex items-center gap-2">
          <History size={20} className="text-gray-400" />
          <h3 className="font-bold text-white uppercase text-xs tracking-widest">Historial de Bandejeado</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-900 text-gray-500 font-bold uppercase tracking-widest px-6">
              <tr>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Producto</th>
                <th className="px-6 py-4">Tamaño / Cant.</th>
                <th className="px-6 py-4">Tipo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {historial.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-10 text-center text-gray-600 italic">No hay registros de bandejeado</td>
                </tr>
              ) : (
                historial.slice(0, 50).map(h => (
                  <tr key={h.id} className="hover:bg-gray-800/40 transition-colors">
                    <td className="px-6 py-4 text-white">
                      {new Date(h.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                    </td>
                    <td className="px-6 py-4 font-bold text-gray-300">{h.nombre}</td>
                    <td className="px-6 py-4">
                      <span className="text-gray-400 font-mono">{h.tamano} @ </span>
                      <span className="font-black text-green-400">{h.cantidad}</span>
                    </td>
                    <td className="px-6 py-4 text-gray-500 uppercase text-[10px]">{h.tipo}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ProductCard({ product, isEditing, onToggleEdit, onSave, onReset }) {
  const [formMode, setFormMode] = useState('add'); // 'add' | 'set'
  const [formData, setFormData] = useState({
    tamano: '1kg',
    cantidad: 1,
    tipo: product.tipo || 'hoja verde',
    fecha: new Date().toISOString().split('T')[0]
  });

  const handleOpenTool = (mode) => {
    setFormMode(mode);
    setFormData({
      ...formData,
      cantidad: mode === 'set' ? 0 : 1,
      tipo: product.tipo || 'hoja verde',
      fecha: product.ultimoBandejeado || new Date().toISOString().split('T')[0]
    });
    onToggleEdit();
  };

  const getStatusColor = (status) => {
    if (status === 'urgente') return 'text-red-400 bg-red-500/10 border-red-500/20';
    if (status === 'bajo') return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    return 'text-green-400 bg-green-500/10 border-green-500/20';
  };

  const getDayAlert = () => {
    if (product.diasTranscurridos === null) return null;
    return product.diasTranscurridos === 0 ? 'Hoy' : `${product.diasTranscurridos} ${product.diasTranscurridos === 1 ? 'día' : 'días'}`;
  };

  return (
    <div className={`bg-[#1f2937] border rounded-3xl p-5 shadow-lg transition-all ${
      product.statusFinal === 'urgente' ? 'border-red-500/30 ring-1 ring-red-500/10' :
      product.statusFinal === 'bajo' ? 'border-amber-500/30' :
      'border-gray-800'
    }`}>
      <div className="flex justify-between items-start mb-4">
        <div>
          <h4 className="font-bold text-white text-md leading-tight">{product.nombre}</h4>
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full inline-block mt-2 border ${getStatusColor(product.statusFinal)}`}>
            {product.statusFinal === 'urgente' ? '🔴 Urgente' : product.statusFinal === 'bajo' ? '🟡 Bajo' : '🟢 Stock OK'}
          </span>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">Último bandejeado</p>
          <p className={`text-xs font-black mt-0.5 ${
            product.statusDias === 'urgente' ? 'text-red-400' :
            product.statusDias === 'bajo' ? 'text-amber-400' :
            'text-green-400'
          }`}>
            {getDayAlert() || '-'}
          </p>
        </div>
      </div>

      {/* Desglose Stock */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {['500g', '1kg'].map(size => (
          <div key={size} className="bg-gray-900/50 border border-gray-800 rounded-xl p-2 text-center">
            <p className="text-[9px] text-gray-500 uppercase font-black">{size}</p>
            <p className={`text-sm font-black ${product.stock[size] > 0 ? 'text-white' : 'text-gray-700'}`}>
              {product.stock[size] || 0}
            </p>
          </div>
        ))}
      </div>

      {!isEditing ? (
        <div className="flex flex-col gap-2">
          <button 
            onClick={() => handleOpenTool('add')}
            className="w-full flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 text-white text-[11px] font-bold py-2.5 rounded-2xl transition-all border border-gray-700 hover:border-gray-600"
          >
            <Plus size={14} /> Cargar bandejeado
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={() => handleOpenTool('set')}
              className="flex items-center justify-center gap-2 bg-gray-800/50 hover:bg-gray-700 text-gray-400 text-[10px] font-bold py-2 rounded-xl transition-all border border-gray-800 hover:border-gray-600"
            >
              ✏️ Editar
            </button>
            <button 
              onClick={onReset}
              className="flex items-center justify-center gap-2 bg-red-500/5 hover:bg-red-500/10 text-red-500/50 hover:text-red-500 text-[10px] font-bold py-2 rounded-xl transition-all border border-red-500/10 hover:border-red-500/20"
            >
              🔄 Resetear
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 slide-in space-y-4">
          <div className="flex items-center justify-between mb-1">
             <span className="text-[10px] font-black text-white uppercase tracking-widest">
               {formMode === 'set' ? '✏️ Modo Edición Manual' : '📦 Cargar Bandejeado'}
             </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[8px] font-bold text-gray-500 uppercase mb-1">Tamaño</label>
              <select 
                value={formData.tamano}
                onChange={(e) => setFormData({...formData, tamano: e.target.value})}
                className="w-full bg-[#111827] border border-gray-800 text-white text-[10px] px-2 py-1.5 rounded-lg outline-none"
              >
                <option value="500g">500g</option>
                <option value="1kg">1kg</option>
              </select>
            </div>
            <div>
              <label className="block text-[8px] font-bold text-gray-500 uppercase mb-1">Cantidad</label>
              <input 
                type="number" 
                min="0"
                value={formData.cantidad}
                onChange={(e) => setFormData({...formData, cantidad: Math.max(0, Number(e.target.value))})}
                className="w-full bg-[#111827] border border-gray-800 text-white text-[10px] px-2 py-1.5 rounded-lg outline-none font-black text-center"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[8px] font-bold text-gray-500 uppercase mb-1">Tipo Prod.</label>
              <select 
                value={formData.tipo}
                onChange={(e) => setFormData({...formData, tipo: e.target.value})}
                className="w-full bg-[#111827] border border-gray-800 text-white text-[10px] px-2 py-1.5 rounded-lg outline-none"
              >
                <option value="hoja verde">Hoja Verde</option>
                <option value="blando">Blando</option>
                <option value="duro">Duro</option>
              </select>
            </div>
            <div>
              <label className="block text-[8px] font-bold text-gray-500 uppercase mb-1">Fecha</label>
              <input 
                type="date" 
                value={formData.fecha}
                onChange={(e) => setFormData({...formData, fecha: e.target.value})}
                className="w-full bg-[#111827] border border-gray-800 text-white text-[10px] px-2 py-1.5 rounded-lg outline-none"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={onToggleEdit} className="flex-1 text-[10px] text-gray-500 font-bold hover:text-white transition-colors">Cancelar</button>
            <button 
              onClick={() => onSave({ ...formData, mode: formMode })}
              className="flex-[2] bg-green-500 hover:bg-green-400 text-white text-[10px] font-bold py-2 rounded-xl transition-all shadow-lg shadow-green-500/20"
            >
              {formMode === 'set' ? 'Actualizar Stock' : 'Guardar Stock'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
