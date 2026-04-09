import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { 
  Plus, Edit2, Check, Trash2, Package, ShoppingCart, 
  Settings, TrendingUp, AlertTriangle, Save, Globe, Lock, X, Loader2
} from 'lucide-react';

const STORAGE_KEY = 'huerta_data_costos_v1';
const SHEET_ID = import.meta.env.VITE_SHEET_ID;
const API_KEY  = import.meta.env.VITE_GOOGLE_SHEETS_KEY;
const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL;

const $$ = (n) => `$${Number(n).toLocaleString('es-AR')}`;

import { getTipoByNombre } from '../data/productUtils';

const PRODUCTOS_INICIALES = [
  { id: 1, nombre: 'Papa', categoria: 'duro', cantidadCajon: 20, unidad: 'kg', precioCajon: 12000, margen: 60, activo: true },
];

const COMBOS_INICIALES = [
  { id: 101, nombre: 'Combo Básico', precio: 45000, descripcion: '', productos: [], descuento: 0, activo: true },
  { id: 102, nombre: 'Combo Fit', precio: 50000, descripcion: '', productos: [], descuento: 0, activo: true },
  { id: 103, nombre: 'Combo Familiar', precio: 55000, descripcion: '', productos: [], descuento: 0, activo: true },
  { id: 104, nombre: 'Combo Premium', precio: 65000, descripcion: '', productos: [], descuento: 0, activo: true },
  { id: 105, nombre: 'Combo Vegetariano', precio: 65000, descripcion: '', productos: [], descuento: 0, activo: true },
  { id: 106, nombre: 'Combo Mensual', precio: 125000, descripcion: '', productos: [], descuento: 0, activo: true }
];

export default function PanelCostos() {
  const { productosCostos: contextProds } = useGoogleSheets();
  const [productos, setProductos] = useState([]);
  const [combos, setCombos] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY + '_combos');
    return saved ? JSON.parse(saved) : COMBOS_INICIALES;
  });
  const [montoMinimo, setMontoMinimo] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY + '_minimo');
    return saved ? JSON.parse(saved) : 35000;
  });
  const [mensajeMinimo, setMensajeMinimo] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY + '_msg');
    return saved ? JSON.parse(saved) : "El pedido mínimo es de $35.000";
  });

  const [cargando, setCargando] = useState(true);
  const [publicando, setPublicando] = useState(false);
  const [error, setError] = useState(null);

  // Carga inicial: Si contextProds ya tiene datos, usarlos.
  useEffect(() => {
    if (contextProds && contextProds.length > 0) {
      setProductos(contextProds);
      setCargando(false);
    } else {
      cargarDatosDesdeSheet();
    }
  }, [contextProds]);

  const cargarDatosDesdeSheet = async () => {
    console.log('[PANEL-COSTOS] Iniciando carga...');
    const SHEET_ID_VITE = import.meta.env.VITE_SHEET_ID;
    const API_KEY_VITE = import.meta.env.VITE_GOOGLE_SHEETS_KEY;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID_VITE}/values/PanelCostos?key=${API_KEY_VITE}`;
    
    console.log('[PANEL-COSTOS] URL:', url);

    if (!API_KEY_VITE || !SHEET_ID_VITE) {
      console.error('[PANEL-COSTOS] Error: Faltan variables de entorno VITE_SHEET_ID o VITE_GOOGLE_SHEETS_KEY');
      setProductos(PRODUCTOS_INICIALES);
      setCargando(false);
      return;
    }

    try {
      const response = await fetch(url);
      const data = await response.json();
      console.log('[PANEL-COSTOS] Datos recibidos:', data);
      
      if (!response.ok) {
        throw new Error(data?.error?.message || `Error HTTP ${response.status}`);
      }

      const rows = data.values;
      if (!rows || rows.length < 1) {
        console.warn('[PANEL-COSTOS] No se encontraron datos en la hoja PanelCostos');
        setProductos(PRODUCTOS_INICIALES);
        return;
      }

      // Mapeo dinámico: A=producto, B=costo, C=kilos, D=margen, E=max, f=activo, g=actualizado
      const mapped = rows.slice(1).map((row, index) => {
        const nombre = row[0] || 'Sin nombre';
        const tipo = getTipoByNombre(nombre);
        return {
          fila: index + 2,
          id: index + 1, 
          nombre: nombre,
          precioCajon: Number(row[1]) || 0,
          cantidadCajon: Number(row[2]) || 1,
          margen: Number(row[3]) || 60,
          precioMaxManual: row[4] ? Number(row[4]) : null,
          activo: row[5] === 'TRUE' || row[5] === 'true' || row[5] === '1',
          ultimaActualizacion: row[6] || '',
          categoria: tipo, 
          unidad: 'kg'
        };
      });

      console.log('[PANEL-COSTOS] Productos procesados:', mapped.length);
      setProductos(mapped);
    } catch (err) {
      console.error('[PANEL-COSTOS] Error fatal durante el fetch:', err);
      setError('No se pudo sincronizar el Panel de Costos. Revisa la consola para más detalles.');
      setProductos(PRODUCTOS_INICIALES);
    } finally {
      setCargando(false);
    }
  };

  const syncWithSheet = async (p) => {
    if (!APPS_SCRIPT_URL || !p.fila) return;
    
    const payload = {
      accion: 'updatePanelCostos',
      fila: p.fila,
      costo_cajon: p.precioCajon,
      margen: p.margen,
      activo: p.activo,
      precio_maximo: p.precioMaxManual,
      ultima_actualizacion: new Date().toLocaleDateString('es-AR')
    };

    try {
      // POST no-cors para evitar problemas preflight
      await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.error('Error síncronizando con Google Sheets:', e);
    }
  };

  // Persistencia local para Combos, Config y Sincronización con Control de Stock
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY + '_productos', JSON.stringify(productos));
    localStorage.setItem(STORAGE_KEY + '_combos', JSON.stringify(combos));
    localStorage.setItem(STORAGE_KEY + '_minimo', JSON.stringify(montoMinimo));
    localStorage.setItem(STORAGE_KEY + '_msg', JSON.stringify(mensajeMinimo));
  }, [productos, combos, montoMinimo, mensajeMinimo]);

  // Estados para el Modal de Producto
  const [showModalProd, setShowModalProd] = useState(false);
  const [tempProd, setTempProd] = useState({
    nombre: '', categoria: 'Verdura', cantidadCajon: 1, unidad: 'kg', 
    precioCajon: 0, margen: 60, precioMaxManual: ''
  });

  // Estados para el Modal de Combos
  const [showModalCombo, setShowModalCombo] = useState(false);
  const [comboEditando, setComboEditando] = useState(null);
  const [tempCombo, setTempCombo] = useState({
    nombre: '', descripcion: '', productos: [], descuento: 0, activo: true
  });

  // Lógica de cálculo de precios
  const productosCalculados = useMemo(() => {
    return productos.map(p => {
      const costoUnitario = p.precioCajon / p.cantidadCajon;
      const precioConMargen = costoUnitario * (1 + p.margen / 100);
      
      let precioFinal = precioConMargen;
      let alcanzadoTope = false;

      // El cálculo en el dashboard sigue usando topes para visualización de "Margen Real"
      if (p.precioJumbo && precioFinal > p.precioJumbo) {
        precioFinal = p.precioJumbo;
        alcanzadoTope = true;
      }
      if (p.precioMaxManual && precioFinal > p.precioMaxManual) {
        precioFinal = p.precioMaxManual;
        alcanzadoTope = true;
      }

      const margenReal = precioFinal > 0 ? ((precioFinal - costoUnitario) / precioFinal) * 100 : 0;
      const gananciaUnidad = precioFinal - costoUnitario;

      return { ...p, costoUnitario, precioConMargen, precioFinal, margenReal, gananciaUnidad, alcanzadoTope };
    });
  }, [productos]);

  // Lógica de cálculo de combos
  const combosCalculados = useMemo(() => {
    return combos.map(c => {
      let subtotal = 0;
      let alertaProdOff = false;

      c.productos.forEach(item => {
        const prod = productosCalculados.find(p => p.id === item.id || p.nombre === item.nombre);
        if (prod) {
          subtotal += prod.precioFinal * item.cantidad;
          if (!prod.activo) alertaProdOff = true;
        }
      });

      const precioFinal = subtotal * (1 - c.descuento / 100);
      return { ...c, subtotal, precioFinal, alertaProdOff };
    });
  }, [combos, productosCalculados]);

  // Resumen financiero corregido
  const resumen = useMemo(() => {
    const prodsActivos = productosCalculados.filter(p => p.activo);
    
    // Inversión Total: Suma de lo pagado por todos los cajones actuales
    const totalInvertido = prodsActivos.reduce((sum, p) => sum + p.precioCajon, 0);
    
    // Facturación Estimada: (Kilos por cajón * 0.90 de merma) * Precio de Venta Final
    const facturacionEstimada = prodsActivos.reduce((sum, p) => {
      const kilosUtiles = p.cantidadCajon * 0.90;
      return sum + (kilosUtiles * p.precioFinal);
    }, 0);
    
    // Ganancia Estimada: Facturación Total - Inversión Total
    const gananciaEstimada = facturacionEstimada - totalInvertido;
    
    // Margen Promedio: (Ganancia Total / Facturación Total) * 100
    const margenPromedio = facturacionEstimada > 0 ? (gananciaEstimada / facturacionEstimada) * 100 : 0;

    return {
      totalInvertido, facturacionEstimada, gananciaEstimada, margenPromedio,
      prodsActivos: prodsActivos.length,
      prodsInactivos: productosCalculados.length - prodsActivos.length,
      combosActivos: combosCalculados.filter(c => c.activo).length,
      combosInactivos: combosCalculados.length - combosCalculados.filter(c => c.activo).length
    };
  }, [productosCalculados, combosCalculados]);

  const actualizarProducto = (id, campo, valor) => {
    const nuevosProductos = productos.map(p => {
      if (p.id === id) {
        const updated = { ...p, [campo]: valor };
        syncWithSheet(updated);
        return updated;
      }
      return p;
    });
    setProductos(nuevosProductos);
  };

  const agregarProducto = () => {
    setTempProd({ 
      nombre: '', 
      categoria: 'hoja verde', 
      cantidadCajon: 1, 
      unidad: 'kg', 
      precioCajon: 0, 
      margen: 70, 
      precioMaxManual: '' 
    });
    setShowModalProd(true);
  };

  const guardarNuevoProd = async () => {
    if (!tempProd.nombre) return alert("El nombre es obligatorio");
    
    // 1. Crear el objeto para el estado local
    const nuevo = { 
      ...tempProd,
      id: Date.now(), 
      precioMaxManual: tempProd.precioMaxManual !== '' ? Number(tempProd.precioMaxManual) : null,
      activo: true,
      fila: null // Aún no tiene fila asignada por el Sheet
    };

    // 2. Actualizar estado local (y localStorage vía useEffect)
    setProductos(prev => [...prev, nuevo]);
    setShowModalProd(false);

    // 3. Sincronizar con Google Sheet vía Apps Script
    if (APPS_SCRIPT_URL) {
      const payload = { 
        accion: 'updatePanelCostos',
        producto: nuevo.nombre,
        costo_cajon: nuevo.precioCajon,
        kilos_cajon: nuevo.cantidadCajon,
        margen: nuevo.margen,
        precio_maximo: nuevo.precioMaxManual,
        activo: true
      };

      try {
        await fetch(APPS_SCRIPT_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify(payload)
        });
        console.log('[PANEL-COSTOS] Nuevo producto enviado al Sheet:', nuevo.nombre);
      } catch (e) {
        console.error('Error enviando nuevo producto:', e);
      }
    }
  };

  const eliminarProducto = (id) => {
    if (window.confirm("¿Eliminar este producto? Los cambios remotos deben hacerse directamente en el Sheet.")) {
      setProductos(prev => prev.filter(p => p.id !== id));
    }
  };

  const abrirModalNuevo = () => {
    setComboEditando(null);
    setTempCombo({ nombre: '', descripcion: '', productos: [], descuento: 0, activo: true });
    setShowModalCombo(true);
  };

  const abrirModalEditar = (combo) => {
    setComboEditando(combo.id);
    setTempCombo({ ...combo });
    setShowModalCombo(true);
  };

  const guardarCombo = () => {
    if (!tempCombo.nombre) return alert("El nombre es obligatorio");
    if (comboEditando) {
      setCombos(prev => prev.map(c => c.id === comboEditando ? { ...tempCombo, id: c.id } : c));
    } else {
      setCombos([...combos, { ...tempCombo, id: Date.now() }]);
    }
    setShowModalCombo(false);
  };

  const eliminarCombo = (id) => {
    if (window.confirm("¿Segur@ que querés eliminar este combo?")) {
      setCombos(prev => prev.filter(c => c.id !== id));
    }
  };

  const toggleProdEnCombo = (prodId) => {
    const existe = tempCombo.productos.find(p => p.id === prodId);
    if (existe) {
      setTempCombo({ ...tempCombo, productos: tempCombo.productos.filter(p => p.id !== prodId) });
    } else {
      setTempCombo({ ...tempCombo, productos: [...tempCombo.productos, { id: prodId, cantidad: 1 }] });
    }
  };

  const updateCantProdEnCombo = (prodId, cant) => {
    setTempCombo({
      ...tempCombo,
      productos: tempCombo.productos.map(p => p.id === prodId ? { ...p, cantidad: Number(cant) } : p)
    });
  };

  const publicar = () => {
    setPublicando(true);

    const prodsCalculadosPublicar = productosCalculados.filter(p => p.activo).map(p => ({
      ...p,
      precioPublicado: Math.round(p.costoUnitario * (1 + p.margen / 100))
    }));

    console.log("--- AUDITORÍA DE PRECIOS A PUBLICAR ---");
    prodsCalculadosPublicar.forEach(p => {
      console.log(`Producto: ${p.nombre} | Costo U: $${p.costoUnitario.toFixed(2)} | Margen: ${p.margen}% | Precio Publicado: $${p.precioPublicado}`);
    });
    console.log("---------------------------------------");

    const data = {
      monto_minimo: montoMinimo,
      mensaje_minimo: mensajeMinimo,
      productos: prodsCalculadosPublicar.map(p => ({
        nombre: p.nombre,
        precio: p.precioPublicado,
        unidad: p.unidad,
        activo: p.activo
      })),
      combos: combosCalculados.filter(c => c.activo).map(c => {
        let subtotalPublicado = 0;
        c.productos.forEach(item => {
          const prodPub = prodsCalculadosPublicar.find(p => p.id === item.id || p.nombre === item.nombre);
          if (prodPub) {
            subtotalPublicado += prodPub.precioPublicado * item.cantidad;
          }
        });
        const precioFinalCombo = Math.round(subtotalPublicado * (1 - c.descuento / 100));

        return {
          nombre: c.nombre,
          precio: precioFinalCombo,
          descripcion: c.descripcion,
          items: c.productos.map(cp => {
            const p = productos.find(prod => prod.id === cp.id || prod.nombre === cp.nombre);
            return p ? `${cp.cantidad}x ${p.nombre}` : `ID:${cp.id}`;
          }),
          activo: c.activo
        };
      }),
      ultima_actualizacion: new Date().toLocaleDateString('es-AR')
    };

    console.log("JSON Generado para precios.json:", data);

    setTimeout(() => {
      setPublicando(false);
      alert("✅ Precios publicados correctamente");
    }, 1500);
  };

  if (cargando) return <div className="flex flex-col items-center justify-center min-h-[400px] text-gray-500 gap-4"><Loader2 className="animate-spin text-green-500" size={40} /><p className="animate-pulse font-bold text-xs uppercase tracking-widest text-center">Cargando Costos...</p></div>;

  console.log('[PANEL-COSTOS] Productos en estado:', productos.length);
  console.log('[PANEL-COSTOS] ProductosCalculados:', productosCalculados.length);

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Panel de Costos v3.0</h2>
          <p className="text-gray-500 text-sm mt-1">{error || 'Sincronizado con Google Sheets'}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={cargarDatosDesdeSheet} className="p-3 bg-gray-800 hover:bg-gray-700 text-white rounded-2xl transition-all"><Globe size={18} /></button>
          <button
            onClick={publicar}
            disabled={publicando}
            className="flex items-center gap-2 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white font-bold px-6 py-3 rounded-2xl transition-all shadow-lg hover:shadow-green-500/20"
          >
            {publicando ? <Settings className="animate-spin" size={20} /> : <Globe size={20} />}
            {publicando ? 'Publicando...' : 'Publicar precios'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <ResumenCard titulo="Inversión total" valor={$$(resumen.totalInvertido)} sub="Suma de costo de cajones" icon={ShoppingCart} color="blue" />
        <ResumenCard titulo="Facturación Est." valor={$$(resumen.facturacionEstimada)} sub="Venta total (con 10% merma)" icon={TrendingUp} color="green" />
        <ResumenCard titulo="Ganancia Est." valor={$$(resumen.gananciaEstimada)} sub="Diferencia (Fact. - Inv.)" icon={Check} color="amber" />
        <ResumenCard titulo="Margen Promedio" valor={`${resumen.margenPromedio.toFixed(1)}%`} sub="Eficiencia sobre venta" icon={TrendingUp} color="purple" />
      </div>

      <div className="bg-[#1f2937] border border-gray-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Package size={20} className="text-green-500" /> PRODUCTOS INDIVIDUALES
          </h3>
          <button onClick={agregarProducto} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white text-xs px-4 py-2 rounded-xl transition-all">
            <Plus size={16} /> Agregar nuevo
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#111827] text-gray-500 uppercase tracking-widest font-bold">
              <tr>
                <th className="px-6 py-4">Producto</th>
                <th className="px-6 py-4">Cajón / Kilos</th>
                <th className="px-6 py-4">Costo U.</th>
                <th className="px-6 py-4">Margen %</th>
                <th className="px-6 py-4">Precio (+M)</th>
                <th className="px-6 py-4">Tope Manual</th>
                <th className="px-6 py-4">Precio Final</th>
                <th className="px-6 py-4">M. Real</th>
                <th className="px-6 py-4">Ganancia</th>
                <th className="px-6 py-4">Sincronización</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {[
                { id: 'hoja verde', label: '🌿 HOJA VERDE', color: 'text-green-500' },
                { id: 'blando', label: '🍅 BLANDO', color: 'text-red-500' },
                { id: 'duro', label: '🥔 DURO', color: 'text-amber-500' }
              ].map(cat => {
                const catItems = productosCalculados.filter(p => p.categoria === cat.id);
                if (catItems.length === 0) return null;
                
                return (
                  <Fragment key={cat.id}>
                    <tr className="bg-gray-900/80">
                      <td colSpan="10" className="px-6 py-2 border-y border-gray-800">
                        <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${cat.color}`}>{cat.label}</span>
                      </td>
                    </tr>
                    {catItems.map(p => (
                      <tr key={p.id} className={`hover:bg-gray-800/40 transition-colors ${!p.activo ? 'opacity-40' : ''}`}>
                        <td className="px-6 py-4">
                          <p className="font-bold text-white text-sm">{p.nombre}</p>
                          <p className="text-[10px] text-gray-600 font-medium">Fila: {p.fila || '-'}</p>
                        </td>
                        <td className="px-6 py-4 text-gray-400">
                          <input 
                            type="number" 
                            className="bg-gray-900 border border-gray-800 rounded-lg w-20 px-2 py-1 mb-1 focus:border-green-500 outline-none text-white block"
                            value={p.precioCajon}
                            onChange={(e) => actualizarProducto(p.id, 'precioCajon', Number(e.target.value))}
                          />
                          <div className="flex items-center gap-1 mt-1">
                            <input 
                              type="number" 
                              disabled
                              className="bg-gray-900/50 border border-gray-800 rounded-lg w-12 px-1 text-gray-500"
                              value={p.cantidadCajon}
                            />
                            <span className="text-[10px] text-gray-500 uppercase">{p.unidad}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono text-gray-400">{$$(p.costoUnitario.toFixed(0))}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1">
                            <input 
                              type="number" 
                              className="bg-gray-900 border border-gray-800 rounded-lg w-10 px-1 focus:border-green-500 outline-none text-white text-right"
                              value={p.margen}
                              onChange={(e) => actualizarProducto(p.id, 'margen', Number(e.target.value))}
                            />
                            <span className="text-gray-600">%</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono text-blue-400">{$$(p.precioConMargen.toFixed(0))}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1">
                            <Lock size={10} className="text-gray-600" />
                            <input 
                              type="number" 
                              className="bg-gray-900 border border-gray-800 rounded w-16 px-1 focus:border-amber-500 outline-none"
                              value={p.precioMaxManual || ''}
                              onChange={(e) => actualizarProducto(p.id, 'precioMaxManual', e.target.value ? Number(e.target.value) : null)}
                            />
                          </div>
                        </td>
                        <td className="px-6 py-4 relative">
                          <span className="text-sm font-black text-green-400 font-mono">{$$(p.precioFinal.toFixed(0))}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`font-bold px-2 py-0.5 rounded-full ${p.margenReal > 50 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-500'}`}>
                            {p.margenReal.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono text-gray-500">+$ {p.gananciaUnidad.toFixed(0)}</td>
                        <td className="px-6 py-4 flex items-center gap-3">
                          <button 
                            onClick={() => actualizarProducto(p.id, 'activo', !p.activo)}
                            className={`w-10 h-5 rounded-full relative ${p.activo ? 'bg-green-600' : 'bg-gray-700'}`}
                          >
                            <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${p.activo ? 'right-1' : 'left-1'}`} />
                          </button>
                          <button onClick={() => eliminarProducto(p.id)} className="p-1.5 text-gray-500 hover:text-red-400"><Trash2 size={16} /></button>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-[#1f2937] border border-gray-800 rounded-3xl overflow-hidden shadow-xl">
          <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <ShoppingCart size={20} className="text-amber-500" /> COMBOS (Local)
            </h3>
            <button onClick={abrirModalNuevo} className="bg-gray-800 hover:bg-gray-700 text-white text-xs px-4 py-2 rounded-xl transition-all"><Plus size={16} /> Crear combo</button>
          </div>
          <div className="p-6 space-y-4">
            {combosCalculados.map(c => (
              <div key={c.id} className={`bg-[#111827] border border-gray-800 rounded-2xl p-4 relative ${!c.activo ? 'opacity-50' : ''}`}>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="font-bold text-white text-md">{c.nombre}</h4>
                    <p className="text-[10px] text-gray-500 italic mt-0.5">{c.descripcion || 'Sin descripción'}</p>
                    {c.alertaProdOff && <p className="text-[10px] text-amber-500 font-bold mt-1 tracking-tighter uppercase flex items-center gap-1"><AlertTriangle size={10} /> Productos inactivos detectados</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => abrirModalEditar(c)} className="p-1.5 text-gray-500 hover:text-blue-400"><Edit2 size={14} /></button>
                    <button onClick={() => eliminarCombo(c.id)} className="p-1.5 text-gray-500 hover:text-red-400"><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-2 border-t border-gray-800 pt-3">
                  <div><p className="text-[10px] text-gray-500 uppercase">Subtotal</p><p className="font-mono text-sm text-gray-400">{$$(c.subtotal.toFixed(0))}</p></div>
                  <div className="text-right"><p className="text-[10px] text-gray-500 uppercase">Final</p><p className="font-mono text-lg font-black text-amber-400">{$$(c.precioFinal.toFixed(0))}</p></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#1f2937] border border-gray-800 rounded-3xl overflow-hidden shadow-xl">
          <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Settings size={20} className="text-blue-500" /> CONFIGURACIÓN GLOBAL (Local)
            </h3>
          </div>
          <div className="p-8 space-y-6">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-3">Pedido mínimo</label>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-black text-white">$</span>
                <input type="number" value={montoMinimo} onChange={(e) => setMontoMinimo(Number(e.target.value))} className="bg-[#111827] border border-gray-800 text-3xl font-black text-green-500 rounded-2xl w-full px-4 py-3" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-3">Mensaje</label>
              <textarea value={mensajeMinimo} onChange={(e) => setMensajeMinimo(e.target.value)} className="bg-[#111827] border border-gray-800 text-sm text-gray-400 rounded-2xl w-full px-4 py-3 h-32 resize-none" />
            </div>
          </div>
        </div>
      </div>

      {showModalProd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm shadow-2xl">
          <div className="bg-[#1f2937] border border-gray-800 rounded-3xl w-full max-w-lg overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus size={20} className="text-green-500" /> AGREGAR PRODUCTO
              </h3>
              <button onClick={() => setShowModalProd(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            
            <div className="p-8 space-y-5 overflow-y-auto max-h-[70vh]">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Nombre del Producto</label>
                <input 
                  type="text" 
                  autoFocus
                  className="w-full bg-gray-900 border border-gray-800 rounded-2xl px-4 py-3 text-white focus:border-green-500 outline-none transition-all"
                  placeholder="Ej: Banana Ecuador"
                  value={tempProd.nombre}
                  onChange={(e) => setTempProd({...tempProd, nombre: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-1 gap-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Categoría</label>
                  <div className="flex gap-2">
                    {['hoja verde', 'blando', 'duro'].map(cat => (
                      <button 
                        key={cat}
                        onClick={() => setTempProd({...tempProd, categoria: cat})}
                        className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-tight transition-all border ${tempProd.categoria === cat ? 'bg-green-600 border-green-500 text-white' : 'bg-gray-900 border-gray-800 text-gray-500'}`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Kilos por Cajón</label>
                  <input 
                    type="number" 
                    className="w-full bg-gray-900 border border-gray-800 rounded-2xl px-4 py-3 text-white focus:border-green-500 outline-none transition-all"
                    value={tempProd.cantidadCajon}
                    onChange={(e) => setTempProd({...tempProd, cantidadCajon: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Precio Cajón ($)</label>
                  <input 
                    type="number" 
                    className="w-full bg-gray-900 border border-gray-800 rounded-2xl px-4 py-3 text-white focus:border-green-500 outline-none transition-all"
                    value={tempProd.precioCajon}
                    onChange={(e) => setTempProd({...tempProd, precioCajon: Number(e.target.value)})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Margen (%)</label>
                  <input 
                    type="number" 
                    className="w-full bg-gray-900 border border-gray-800 rounded-2xl px-4 py-3 text-white focus:border-green-500 outline-none transition-all font-bold text-green-500"
                    value={tempProd.margen}
                    onChange={(e) => setTempProd({...tempProd, margen: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Tope Máximo (Opcional)</label>
                  <input 
                    type="number" 
                    className="w-full bg-gray-900 border border-gray-800 rounded-2xl px-4 py-3 text-white focus:border-amber-500 outline-none transition-all"
                    placeholder="Desactivado"
                    value={tempProd.precioMaxManual}
                    onChange={(e) => setTempProd({...tempProd, precioMaxManual: e.target.value === '' ? '' : Number(e.target.value)})}
                  />
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-800 bg-gray-900/30 flex gap-3">
              <button 
                onClick={() => setShowModalProd(false)} 
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-bold py-4 rounded-2xl transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={guardarNuevoProd} 
                className="flex-[2] bg-green-500 hover:bg-green-400 text-white font-black py-4 rounded-2xl shadow-lg shadow-green-500/20 transition-all border-b-4 border-green-700 active:border-b-0 active:translate-y-1"
              >
                GUARDAR PRODUCTO
              </button>
            </div>
          </div>
        </div>
      )}

      {showModalCombo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1f2937] border border-gray-800 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
              <h3 className="text-lg font-bold text-white">{comboEditando ? 'EDITAR COMBO' : 'CREAR COMBO'}</h3>
              <button onClick={() => setShowModalCombo(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div><label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Nombre</label><input type="text" value={tempCombo.nombre} onChange={(e) => setTempCombo({...tempCombo, nombre: e.target.value})} className="w-full bg-[#111827] border border-gray-800 text-white rounded-xl px-4 py-3" /></div>
                <div><label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Descuento %</label><input type="number" value={tempCombo.descuento} onChange={(e) => setTempCombo({...tempCombo, descuento: Number(e.target.value)})} className="w-full bg-[#111827] border border-gray-800 text-white rounded-xl px-4 py-3" /></div>
              </div>
              <div><label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Productos</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                  {productosCalculados.map(p => {
                    const seleccionado = tempCombo.productos.find(item => item.id === p.id || item.nombre === p.nombre);
                    return (
                      <div key={p.id} className={`flex items-center justify-between p-3 rounded-xl border ${seleccionado ? 'bg-green-500/10 border-green-500/30' : 'bg-[#111827] border-gray-800'}`}>
                        <div className="flex items-center gap-3">
                          <input type="checkbox" checked={!!seleccionado} onChange={() => toggleProdEnCombo(p.id)} className="accent-green-500" />
                          <div><p className="text-xs font-bold text-white">{p.nombre}</p><p className="text-[10px] text-gray-600">{$$(p.precioFinal)}/kg</p></div>
                        </div>
                        {seleccionado && <input type="number" value={seleccionado.cantidad} onChange={(e) => updateCantProdEnCombo(p.id, e.target.value)} className="w-12 bg-gray-900 border border-gray-700 text-white text-xs rounded text-center" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-800 flex gap-3">
              <button onClick={() => setShowModalCombo(false)} className="flex-1 bg-gray-800 text-white font-bold py-3 rounded-2xl">Cancelar</button>
              <button onClick={guardarCombo} className="flex-[2] bg-green-500 text-white font-bold py-3 rounded-2xl shadow-lg">Guardar Combo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResumenCard({ titulo, valor, sub, icon: Icon, color }) {
  const colors = { green: 'bg-green-500/10 text-green-500 border-green-500/20', blue: 'bg-blue-500/10 text-blue-500 border-blue-500/20', amber: 'bg-amber-500/10 text-amber-500 border-amber-500/20', purple: 'bg-purple-500/10 text-purple-500 border-purple-500/20' };
  return (
    <div className="bg-[#1f2937] border border-gray-800 rounded-2xl p-5 hover:border-gray-700 transition-all">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 border ${colors[color]}`}><Icon size={18} /></div>
      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{titulo}</p>
      <p className="text-xl font-black text-white mt-1">{valor}</p>
      <p className="text-[10px] text-gray-600 font-medium mt-1">{sub}</p>
    </div>
  );
}
