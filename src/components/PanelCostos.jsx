import { useState, useMemo, useEffect } from 'react';
import { 
  Plus, Edit2, Check, Trash2, Package, ShoppingCart, 
  Settings, TrendingUp, AlertTriangle, Save, Globe, Lock, X
} from 'lucide-react';

const STORAGE_KEY = 'huerta_data_costos_v1';

const $$ = (n) => `$${Number(n).toLocaleString('es-AR')}`;

// Datos iniciales de productos
const PRODUCTOS_INICIALES = [
  // VERDURAS
  { id: 1, nombre: 'Papa', categoria: 'Verdura', cantidadCajon: 20, unidad: 'kg', precioCajon: 12000, margen: 60, precioJumbo: null, precioMaxManual: null, activo: true },
  { id: 2, nombre: 'Cebolla común', categoria: 'Verdura', cantidadCajon: 20, unidad: 'kg', precioCajon: 10000, margen: 60, precioJumbo: null, precioMaxManual: null, activo: true },
  { id: 3, nombre: 'Tomate', categoria: 'Verdura', cantidadCajon: 18, unidad: 'kg', precioCajon: 20000, margen: 60, precioJumbo: null, precioMaxManual: null, activo: true },
  { id: 4, nombre: 'Zanahoria', categoria: 'Verdura', cantidadCajon: 10, unidad: 'kg', precioCajon: 10000, margen: 60, precioJumbo: null, precioMaxManual: null, activo: true },
  { id: 5, nombre: 'Lechuga', categoria: 'Verdura', cantidadCajon: 7, unidad: 'unidad', precioCajon: 14000, margen: 60, precioJumbo: null, precioMaxManual: null, activo: true },
  { id: 6, nombre: 'Zapallito', categoria: 'Verdura', cantidadCajon: 20, unidad: 'kg', precioCajon: 15000, margen: 60, precioJumbo: null, precioMaxManual: null, activo: true },
  { id: 7, nombre: 'Zapallo blanco', categoria: 'Verdura', cantidadCajon: 15, unidad: 'kg', precioCajon: 12000, margen: 60, precioJumbo: null, precioMaxManual: null, activo: true },
  { id: 8, nombre: 'Morrón', categoria: 'Verdura', cantidadCajon: 8, unidad: 'kg', precioCajon: 22000, margen: 60, precioJumbo: null, precioMaxManual: null, activo: true },
  { id: 9, nombre: 'Rúcula', categoria: 'Verdura', cantidadCajon: 12, unidad: 'atado', precioCajon: 5000, margen: 60, precioJumbo: null, precioMaxManual: null, activo: true },
  { id: 10, nombre: 'Espinaca', categoria: 'Verdura', cantidadCajon: 12, unidad: 'kg', precioCajon: 12000, margen: 60, precioJumbo: null, precioMaxManual: null, activo: true },
  { id: 11, nombre: 'Remolacha', categoria: 'Verdura', cantidadCajon: 10, unidad: 'unidad', precioCajon: 25000, margen: 60, precioJumbo: null, precioMaxManual: null, activo: true },
  { id: 12, nombre: 'Pepino', categoria: 'Verdura', cantidadCajon: 15, unidad: 'kg', precioCajon: 12000, margen: 60, precioJumbo: null, precioMaxManual: null, activo: true },
  { id: 13, nombre: 'Brócoli', categoria: 'Verdura', cantidadCajon: 14, unidad: 'unidad', precioCajon: 18000, margen: 60, precioJumbo: null, precioMaxManual: null, activo: true },
  { id: 14, nombre: 'Cebolla morada', categoria: 'Verdura', cantidadCajon: 18, unidad: 'kg', precioCajon: 22000, margen: 60, precioJumbo: null, precioMaxManual: null, activo: true },
  { id: 15, nombre: 'Cabutia', categoria: 'Verdura', cantidadCajon: 20, unidad: 'kg', precioCajon: 15000, margen: 60, precioJumbo: null, precioMaxManual: null, activo: true },
  { id: 16, nombre: 'Ajo', categoria: 'Verdura', cantidadCajon: 50, unidad: 'cabeza', precioCajon: 28000, margen: 60, precioJumbo: null, precioMaxManual: null, activo: true },
  { id: 17, nombre: 'Tomate cherry', categoria: 'Verdura', cantidadCajon: 7, unidad: 'kg', precioCajon: 25000, margen: 60, precioJumbo: null, precioMaxManual: null, activo: true },
  { id: 18, nombre: 'Berenjena', categoria: 'Verdura', cantidadCajon: 10, unidad: 'kg', precioCajon: 12000, margen: 60, precioJumbo: null, precioMaxManual: null, activo: true },
  // FRUTAS
  { id: 19, nombre: 'Palta', categoria: 'Fruta', cantidadCajon: 1, unidad: 'unidad', precioCajon: 1300, margen: 60, precioJumbo: null, precioMaxManual: null, activo: true },
  { id: 20, nombre: 'Manzana roja', categoria: 'Fruta', cantidadCajon: 10, unidad: 'kg', precioCajon: 35000, margen: 60, precioJumbo: null, precioMaxManual: null, activo: true },
  { id: 21, nombre: 'Banana', categoria: 'Fruta', cantidadCajon: 20, unidad: 'kg', precioCajon: 42000, margen: 60, precioJumbo: null, precioMaxManual: null, activo: true },
  { id: 22, nombre: 'Naranja', categoria: 'Fruta', cantidadCajon: 10, unidad: 'kg', precioCajon: 22000, margen: 60, precioJumbo: null, precioMaxManual: null, activo: true },
  { id: 23, nombre: 'Manzana verde', categoria: 'Fruta', cantidadCajon: 20, unidad: 'kg', precioCajon: 45000, margen: 60, precioJumbo: null, precioMaxManual: null, activo: true },
  { id: 24, nombre: 'Limón', categoria: 'Fruta', cantidadCajon: 15, unidad: 'kg', precioCajon: 28000, margen: 60, precioJumbo: null, precioMaxManual: null, activo: true },
  { id: 25, nombre: 'Durazno', categoria: 'Fruta', cantidadCajon: 11, unidad: 'kg', precioCajon: 35000, margen: 60, precioJumbo: null, precioMaxManual: null, activo: true },
  { id: 26, nombre: 'Pomelo', categoria: 'Fruta', cantidadCajon: 16, unidad: 'kg', precioCajon: 30000, margen: 60, precioJumbo: null, precioMaxManual: null, activo: true },
  { id: 27, nombre: 'Uva', categoria: 'Fruta', cantidadCajon: 10, unidad: 'kg', precioCajon: 30000, margen: 60, precioJumbo: null, precioMaxManual: null, activo: true },
  { id: 28, nombre: 'Arándano', categoria: 'Fruta', cantidadCajon: 12, unidad: 'bandeja 250g', precioCajon: 25000, margen: 60, precioJumbo: null, precioMaxManual: null, activo: true },
  { id: 29, nombre: 'Choclo', categoria: 'Fruta', cantidadCajon: 40, unidad: 'unidad', precioCajon: 18000, margen: 60, precioJumbo: null, precioMaxManual: null, activo: true },
  // OTROS
  { id: 30, nombre: 'Huevos', categoria: 'Otro', cantidadCajon: 1, unidad: 'maple', precioCajon: 4500, margen: 60, precioJumbo: null, precioMaxManual: 6500, activo: true },
  { id: 31, nombre: 'Miel pura', categoria: 'Otro', cantidadCajon: 1, unidad: 'kg', precioCajon: 8000, margen: 60, precioJumbo: null, precioMaxManual: 11000, activo: true },
];

const COMBOS_INICIALES = [
  { id: 101, nombre: 'Combo Familiar', productos: [], descuento: 0, activo: true },
  { id: 102, nombre: 'Combo Premium', productos: [], descuento: 0, activo: true },
  { id: 103, nombre: 'Combo Básico', productos: [], descuento: 0, activo: true },
  { id: 104, nombre: 'Combo Fit', productos: [], descuento: 0, activo: true },
];

export default function PanelCostos() {
  // Persistencia: Inicialización
  const [productos, setProductos] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY + '_productos');
    return saved ? JSON.parse(saved) : PRODUCTOS_INICIALES;
  });
  const [combos, setCombos] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY + '_combos');
    return saved ? JSON.parse(saved) : COMBOS_INICIALES;
  });
  const [montoMinimo, setMontoMinimo] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY + '_minimo');
    return saved ? JSON.parse(saved) : 45000;
  });
  const [mensajeMinimo, setMensajeMinimo] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY + '_msg');
    return saved ? JSON.parse(saved) : "Compra mínima $45.000 para envío sin cargo";
  });

  // Persistencia: Autoguardado
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY + '_productos', JSON.stringify(productos));
    localStorage.setItem(STORAGE_KEY + '_combos', JSON.stringify(combos));
    localStorage.setItem(STORAGE_KEY + '_minimo', JSON.stringify(montoMinimo));
    localStorage.setItem(STORAGE_KEY + '_msg', JSON.stringify(mensajeMinimo));
  }, [productos, combos, montoMinimo, mensajeMinimo]);

  const [publicando, setPublicando] = useState(false);
  
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
        const prod = productosCalculados.find(p => p.id === item.id);
        if (prod) {
          subtotal += prod.precioFinal * item.cantidad;
          if (!prod.activo) alertaProdOff = true;
        }
      });

      const precioFinal = subtotal * (1 - c.descuento / 100);
      return { ...c, subtotal, precioFinal, alertaProdOff };
    });
  }, [combos, productosCalculados]);

  // Resumen financiero
  const resumen = useMemo(() => {
    const prodsActivos = productosCalculados.filter(p => p.activo);
    const totalInvertido = prodsActivos.reduce((sum, p) => sum + p.precioCajon, 0);
    // Asumiendo que vendemos 1 unidad/kg de cada activo para estimar
    const facturacionEstimada = prodsActivos.reduce((sum, p) => sum + p.precioFinal, 0);
    const gananciaEstimada = facturacionEstimada - prodsActivos.reduce((sum, p) => sum + p.costoUnitario, 0);
    const margenPromedio = prodsActivos.length > 0 ? prodsActivos.reduce((sum, p) => sum + p.margenReal, 0) / prodsActivos.length : 0;

    return {
      totalInvertido, facturacionEstimada, gananciaEstimada, margenPromedio,
      prodsActivos: prodsActivos.length,
      prodsInactivos: productosCalculados.length - prodsActivos.length,
      combosActivos: combosCalculados.filter(c => c.activo).length,
      combosInactivos: combosCalculados.length - combosCalculados.filter(c => c.activo).length
    };
  }, [productosCalculados, combosCalculados]);

  const actualizarProducto = (id, campo, valor) => {
    setProductos(prev => prev.map(p => p.id === id ? { ...p, [campo]: valor } : p));
  };

  const agregarProducto = () => {
    setTempProd({ nombre: '', categoria: 'Verdura', cantidadCajon: 1, unidad: 'kg', precioCajon: 0, margen: 60, precioMaxManual: '' });
    setShowModalProd(true);
  };

  const guardarNuevoProd = () => {
    if (!tempProd.nombre) return alert("El nombre es obligatorio");
    if (!tempProd.cantidadCajon || tempProd.cantidadCajon <= 0) return alert("Los Kilos por cajón son obligatorios");
    const nuevo = { 
      ...tempProd,
      id: Date.now(), 
      precioMaxManual: tempProd.precioMaxManual !== '' ? Number(tempProd.precioMaxManual) : null,
      precioJumbo: null,
      activo: true 
    };
    setProductos([...productos, nuevo]);
    setShowModalProd(false);
  };

  const eliminarProducto = (id) => {
    if (window.confirm("¿Eliminar este producto?")) {
      setProductos(prev => prev.filter(p => p.id !== id));
      // También limpiarlo de combos
      setCombos(prev => prev.map(c => ({
        ...c, productos: c.productos.filter(cp => cp.id !== id)
      })));
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
    const data = {
      fecha: new Date().toISOString(),
      montoMinimo,
      mensajeMinimo,
      productos: productosCalculados.filter(p => p.activo).map(p => ({
        nombre: p.nombre,
        categoria: p.categoria,
        precio: p.precioFinal,
        unidad: p.unidad
      })),
      combos: combosCalculados.filter(c => c.activo).map(c => ({
        nombre: c.nombre,
        precio: c.precioFinal,
        items: c.productos
      }))
    };
    // Simular guardado
    console.log("Generando precios.json...", data);
    setTimeout(() => {
      setPublicando(false);
      alert("Precios publicados y precios.json generado satisfactoriamente.");
    }, 1500);
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Panel de Costos v3.0</h2>
          <p className="text-gray-500 text-sm mt-1">Gestión avanzada de productos, combos y estrategia de precios</p>
        </div>
        <button
          onClick={publicar}
          disabled={publicando}
          className="flex items-center gap-2 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white font-bold px-6 py-3 rounded-2xl transition-all shadow-lg hover:shadow-green-500/20"
        >
          {publicando ? <Settings className="animate-spin" size={20} /> : <Globe size={20} />}
          {publicando ? 'Publicando...' : 'Publicar precios'}
        </button>
      </div>

      {/* SECCION 4: RESUMEN */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <ResumenCard titulo="Inversión total" valor={$$(resumen.totalInvertido)} sub="Total en cajones" icon={ShoppingCart} color="blue" />
        <ResumenCard titulo="Facturación Est." valor={$$(resumen.facturacionEstimada)} sub="Venta x1 unidad cada prod." icon={TrendingUp} color="green" />
        <ResumenCard titulo="Margen Promedio" valor={`${resumen.margenPromedio.toFixed(1)}%`} sub="Promedio ponderado" icon={TrendingUp} color="amber" />
        <ResumenCard titulo="Estado Catálogo" valor={`${resumen.prodsActivos} Activos`} sub={`${resumen.combosActivos} Combos activos`} icon={Package} color="purple" />
      </div>

      {/* SECCION 1: PRODUCTOS INDIVIDUALES */}
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
                <th className="px-6 py-4">Producto / Cat.</th>
                <th className="px-6 py-4">Cajón / Unidad</th>
                <th className="px-6 py-4">Costo U.</th>
                <th className="px-6 py-4">Margen %</th>
                <th className="px-6 py-4">Precio (+M)</th>
                <th className="px-6 py-4">Tope (J/M)</th>
                <th className="px-6 py-4">Precio Final</th>
                <th className="px-6 py-4">M. Real</th>
                <th className="px-6 py-4">Ganancia</th>
                <th className="px-6 py-4">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {productosCalculados.map(p => (
                <tr key={p.id} className={`hover:bg-gray-800/40 transition-colors ${!p.activo ? 'opacity-40' : ''}`}>
                  <td className="px-6 py-4">
                    <p className="font-bold text-white text-sm">{p.nombre}</p>
                    <p className="text-[10px] text-gray-600 font-medium">{p.categoria}</p>
                  </td>
                  <td className="px-6 py-4 text-gray-400">
                    <input 
                      type="number" 
                      className="bg-gray-900 border border-gray-800 rounded-lg w-20 px-2 py-1 mb-1 focus:border-green-500 outline-none text-white block"
                      value={p.precioCajon}
                      onChange={(e) => actualizarProducto(p.id, 'precioCajon', Number(e.target.value))}
                      title="Precio Cajón"
                    />
                    <div className="flex items-center gap-1 mt-1">
                      <input 
                        type="number" 
                        className="bg-gray-900 border border-gray-800 rounded-lg w-12 px-1 focus:border-green-500 outline-none text-white"
                        value={p.cantidadCajon}
                        onChange={(e) => actualizarProducto(p.id, 'cantidadCajon', Number(e.target.value))}
                        title="Cantidad por cajón"
                      />
                      <span className="text-[10px] text-gray-500 tracking-tighter uppercase">{p.unidad}</span>
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
                  <td className="px-6 py-4 space-y-1">
                    <div className="flex items-center gap-1">
                      <Globe size={10} className="text-gray-600" />
                      <input 
                        type="number" placeholder="Jumbo"
                        className="bg-gray-900 border border-gray-800 rounded w-16 px-1 focus:border-amber-500 outline-none"
                        value={p.precioJumbo || ''}
                        onChange={(e) => actualizarProducto(p.id, 'precioJumbo', e.target.value ? Number(e.target.value) : null)}
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <Lock size={10} className="text-gray-600" />
                      <input 
                        type="number" placeholder="Manual"
                        className="bg-gray-900 border border-gray-800 rounded w-16 px-1 focus:border-amber-500 outline-none"
                        value={p.precioMaxManual || ''}
                        onChange={(e) => actualizarProducto(p.id, 'precioMaxManual', e.target.value ? Number(e.target.value) : null)}
                      />
                    </div>
                  </td>
                  <td className="px-6 py-4 relative">
                    <span className="text-sm font-black text-green-400 font-mono">{$$(p.precioFinal.toFixed(0))}</span>
                    {p.alcanzadoTope && (
                      <div className="absolute -top-1 right-2" title="Tope alcanzado">
                        <AlertTriangle size={12} className="text-amber-500" />
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`font-bold px-2 py-0.5 rounded-full ${
                      p.margenReal > 50 ? 'bg-green-500/10 text-green-400' :
                      p.margenReal >= 40 ? 'bg-amber-500/10 text-amber-500' :
                      'bg-red-500/10 text-red-500'
                    }`}>
                      {p.margenReal.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-gray-500">+$ {p.gananciaUnidad.toFixed(0)}</td>
                  <td className="px-6 py-4 flex items-center gap-3">
                    <button 
                      onClick={() => actualizarProducto(p.id, 'activo', !p.activo)}
                      className={`w-10 h-5 shrink-0 rounded-full transition-all relative ${p.activo ? 'bg-green-600' : 'bg-gray-700'}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${p.activo ? 'right-1' : 'left-1'}`} />
                    </button>
                    <button
                      onClick={() => eliminarProducto(p.id)}
                      className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
                      title="Eliminar producto"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* SECCION 2: COMBOS */}
        <div className="bg-[#1f2937] border border-gray-800 rounded-3xl overflow-hidden shadow-xl">
          <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <ShoppingCart size={20} className="text-amber-500" /> ARMADOR DE COMBOS
            </h3>
            <button 
              onClick={abrirModalNuevo}
              className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white text-xs px-4 py-2 rounded-xl transition-all"
            >
              <Plus size={16} /> Crear combo
            </button>
          </div>
          <div className="p-6 space-y-4">
            {combosCalculados.map(c => (
              <div key={c.id} className={`bg-[#111827] border border-gray-800 rounded-2xl p-4 relative ${!c.activo ? 'opacity-50' : ''}`}>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="font-bold text-white text-md">{c.nombre}</h4>
                    <p className="text-[10px] text-gray-500 italic mt-0.5">{c.descripcion || 'Sin descripción'}</p>
                    {c.alertaProdOff && (
                      <p className="flex items-center gap-1 text-[10px] text-amber-500 font-bold mt-1">
                        <AlertTriangle size={10} /> HAY PRODUCTOS INACTIVOS EN ESTE COMBO
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => abrirModalEditar(c)}
                      className="p-1.5 text-gray-500 hover:text-blue-400 transition-colors"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button 
                      onClick={() => eliminarCombo(c.id)}
                      className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                    <button 
                      onClick={() => setCombos(prev => prev.map(item => item.id === c.id ? {...item, activo: !item.activo} : item))}
                      className={`w-8 h-4 rounded-full relative transition-all ml-2 ${c.activo ? 'bg-amber-600' : 'bg-gray-800'}`}
                    >
                      <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${c.activo ? 'right-0.5' : 'left-0.5'}`} />
                    </button>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mt-2 border-t border-gray-800 pt-3">
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-tighter">Subtotal (Suma prods)</p>
                    <p className="font-mono text-sm text-gray-400">{$$(c.subtotal.toFixed(0))}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-gray-500 uppercase tracking-tighter">Precio Final</p>
                    <p className="font-mono text-lg font-black text-amber-400">{$$(c.precioFinal.toFixed(0))}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SECCION 3: CONFIGURACIÓN GENERAL */}
        <div className="bg-[#1f2937] border border-gray-800 rounded-3xl overflow-hidden shadow-xl">
          <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Settings size={20} className="text-blue-500" /> CONFIGURACIÓN GLOBAL
            </h3>
          </div>
          <div className="p-8 space-y-6">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-3">Compra mínima para envío</label>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-black text-white">$</span>
                <input 
                  type="number" 
                  value={montoMinimo}
                  onChange={(e) => setMontoMinimo(Number(e.target.value))}
                  className="bg-[#111827] border border-gray-800 text-3xl font-black text-green-500 rounded-2xl w-full px-4 py-3 focus:border-green-500 transition-all"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-3">Mensaje preventa</label>
              <textarea 
                value={mensajeMinimo}
                onChange={(e) => setMensajeMinimo(e.target.value)}
                className="bg-[#111827] border border-gray-800 text-sm text-gray-400 rounded-2xl w-full px-4 py-3 focus:border-blue-500 transition-all h-32 resize-none"
              />
            </div>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4">
              <p className="text-xs text-blue-400 leading-relaxed">
                Este mensaje se mostrará automáticamente en el carrito de compras cuando el usuario no alcance el monto mínimo de compra.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL PRODUCTO */}
      {showModalProd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm shadow-2xl">
          <div className="bg-[#1f2937] border border-gray-800 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col slide-in">
            <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
              <h3 className="text-lg font-bold text-white">AGREGAR NUEVO PRODUCTO</h3>
              <button onClick={() => setShowModalProd(false)} className="text-gray-500 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Nombre del producto</label>
                  <input 
                    type="text" 
                    value={tempProd.nombre}
                    onChange={(e) => setTempProd({...tempProd, nombre: e.target.value})}
                    placeholder="Ej: Papa Blanca"
                    className="w-full bg-[#111827] border border-gray-800 text-white rounded-xl px-4 py-3 text-sm focus:border-green-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Categoría</label>
                  <select 
                    value={tempProd.categoria}
                    onChange={(e) => setTempProd({...tempProd, categoria: e.target.value})}
                    className="w-full bg-[#111827] border border-gray-800 text-white rounded-xl px-4 py-3 text-sm focus:border-green-500 outline-none transition-all"
                  >
                    <option value="Verdura">Verdura</option>
                    <option value="Fruta">Fruta</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Precio del Cajón / Unidad Mayor</label>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 font-bold">$</span>
                    <input 
                      type="number" 
                      value={tempProd.precioCajon}
                      onChange={(e) => setTempProd({...tempProd, precioCajon: Number(e.target.value)})}
                      className="w-full bg-[#111827] border border-gray-800 text-white rounded-xl px-4 py-3 text-sm focus:border-green-500 outline-none transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Kilos por cajón</label>
                  <input 
                    type="number" 
                    value={tempProd.cantidadCajon}
                    onChange={(e) => setTempProd({...tempProd, cantidadCajon: Number(e.target.value)})}
                    className="w-full bg-[#111827] border border-gray-800 text-white rounded-xl px-4 py-3 text-sm focus:border-green-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Unidad</label>
                  <select 
                    value={tempProd.unidad}
                    onChange={(e) => setTempProd({...tempProd, unidad: e.target.value})}
                    className="w-full bg-[#111827] border border-gray-800 text-white rounded-xl px-4 py-3 text-sm focus:border-green-500 outline-none transition-all"
                  >
                    <option value="kg">kg</option>
                    <option value="unidad">unidad</option>
                    <option value="bandeja">bandeja</option>
                    <option value="maple">maple</option>
                    <option value="litro">litro</option>
                    <option value="atado">atado</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Margen deseado %</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number" 
                      value={tempProd.margen}
                      onChange={(e) => setTempProd({...tempProd, margen: Number(e.target.value)})}
                      className="w-full bg-[#111827] border border-gray-800 text-white rounded-xl px-4 py-3 text-sm focus:border-green-500 outline-none transition-all"
                    />
                    <span className="text-gray-500 font-bold">%</span>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Tope Máximo Manual (Opcional)</label>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 font-bold">$</span>
                    <input 
                      type="number" 
                      value={tempProd.precioMaxManual}
                      onChange={(e) => setTempProd({...tempProd, precioMaxManual: e.target.value})}
                      placeholder="Sin tope"
                      className="w-full bg-[#111827] border border-gray-800 text-white rounded-xl px-4 py-3 text-sm focus:border-amber-500 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Vista Previa Cálculos */}
              <div className="bg-gray-900/50 rounded-2xl p-6 border border-gray-800/50">
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-4">Proyección en tiempo real</p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Costo Unitario</p>
                    <p className="text-lg font-bold text-gray-300">{$$(tempProd.precioCajon / tempProd.cantidadCajon || 0)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Precio Venta (Est.)</p>
                    <p className="text-lg font-bold text-blue-400">
                      {$$( (tempProd.precioCajon / tempProd.cantidadCajon || 0) * (1 + tempProd.margen / 100) )}
                    </p>
                  </div>
                  <div className="text-right border-l border-gray-800 pl-4">
                    <p className="text-[10px] text-green-500 font-bold uppercase mb-1">Margen Real</p>
                    <p className="text-xl font-black text-green-400">
                      {tempProd.precioMaxManual && Number(tempProd.precioMaxManual) < ((tempProd.precioCajon / tempProd.cantidadCajon) * (1+tempProd.margen/100))
                        ? (((Number(tempProd.precioMaxManual) - (tempProd.precioCajon / tempProd.cantidadCajon)) / Number(tempProd.precioMaxManual))*100).toFixed(1)
                        : tempProd.margen}%
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-800 flex gap-3">
              <button 
                onClick={() => setShowModalProd(false)}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 rounded-2xl transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={guardarNuevoProd}
                className="flex-[2] bg-green-500 hover:bg-green-400 text-white font-bold py-3 rounded-2xl transition-all shadow-lg shadow-green-500/20 flex items-center justify-center gap-2"
              >
                <Save size={18} /> Guardar Producto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL COMBO */}
      {showModalCombo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm shadow-2xl">
          <div className="bg-[#1f2937] border border-gray-800 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col slide-in">
            <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
              <h3 className="text-lg font-bold text-white">
                {comboEditando ? 'EDITAR COMBO' : 'CREAR NUEVO COMBO'}
              </h3>
              <button onClick={() => setShowModalCombo(false)} className="text-gray-500 hover:text-white transition-colors">
                <Trash2 size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Nombre del combo</label>
                  <input 
                    type="text" 
                    value={tempCombo.nombre}
                    onChange={(e) => setTempCombo({...tempCombo, nombre: e.target.value})}
                    placeholder="Ej: Combo Semanal"
                    className="w-full bg-[#111827] border border-gray-800 text-white rounded-xl px-4 py-3 text-sm focus:border-green-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Descuento %</label>
                  <input 
                    type="number" 
                    value={tempCombo.descuento}
                    onChange={(e) => setTempCombo({...tempCombo, descuento: Number(e.target.value)})}
                    className="w-full bg-[#111827] border border-gray-800 text-white rounded-xl px-4 py-3 text-sm focus:border-green-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Descripción corta</label>
                <input 
                  type="text" 
                  value={tempCombo.descripcion}
                  onChange={(e) => setTempCombo({...tempCombo, descripcion: e.target.value})}
                  placeholder="Ej: Fruta de estación para toda la semana"
                  className="w-full bg-[#111827] border border-gray-800 text-white rounded-xl px-4 py-3 text-sm focus:border-green-500 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-4">Seleccionar Productos</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                  {productosCalculados.map(p => {
                    const seleccionado = tempCombo.productos.find(item => item.id === p.id);
                    return (
                      <div 
                        key={p.id} 
                        className={`flex items-center justify-between p-3 rounded-xl border transition-all ${seleccionado ? 'bg-green-500/10 border-green-500/30' : 'bg-[#111827] border-gray-800 hover:border-gray-700'}`}
                      >
                        <div className="flex items-center gap-3">
                          <input 
                            type="checkbox" 
                            checked={!!seleccionado} 
                            onChange={() => toggleProdEnCombo(p.id)}
                            className="accent-green-500 w-4 h-4"
                          />
                          <div>
                            <p className="text-xs font-bold text-white">{p.nombre}</p>
                            <p className="text-[10px] text-gray-600">{$$(p.precioFinal)}/{p.unidad}</p>
                          </div>
                        </div>
                        {seleccionado && (
                          <input 
                            type="number" 
                            value={seleccionado.cantidad}
                            onChange={(e) => updateCantProdEnCombo(p.id, e.target.value)}
                            className="w-12 bg-gray-900 border border-gray-700 text-white text-xs rounded px-1.5 py-1 text-center"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Vista Previa Precio */}
              <div className="bg-gray-900/50 rounded-2xl p-6 border border-gray-800/50 flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Precio Final Estimado</p>
                  <p className="text-3xl font-black text-amber-500">
                    {$$(tempCombo.productos.reduce((sum, item) => {
                      const p = productosCalculados.find(prod => prod.id === item.id);
                      return sum + (p ? p.precioFinal * item.cantidad : 0);
                    }, 0) * (1 - tempCombo.descuento / 100))}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Ahorro %</p>
                  <p className="text-xl font-bold text-green-400">{tempCombo.descuento}%</p>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-800 flex gap-3">
              <button 
                onClick={() => setShowModalCombo(false)}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 rounded-2xl transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={guardarCombo}
                className="flex-[2] bg-green-500 hover:bg-green-400 text-white font-bold py-3 rounded-2xl transition-all shadow-lg shadow-green-500/20 flex items-center justify-center gap-2"
              >
                <Save size={18} /> Guardar Combo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResumenCard({ titulo, valor, sub, icon: Icon, color }) {
  const colors = {
    green: 'bg-green-500/10 text-green-500 border-green-500/20',
    blue: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    amber: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    purple: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  };
  return (
    <div className="bg-[#1f2937] border border-gray-800 rounded-2xl p-5 hover:border-gray-700 transition-all group">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 border ${colors[color]}`}>
        <Icon size={18} />
      </div>
      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{titulo}</p>
      <p className="text-xl font-black text-white mt-1">{valor}</p>
      <p className="text-[10px] text-gray-600 font-medium mt-1">{sub}</p>
    </div>
  );
}
