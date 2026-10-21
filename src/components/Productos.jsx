import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Package, ShoppingCart, Plus, Minus, Search, RefreshCw, 
  Settings, Check, X, AlertCircle, AlertTriangle, Scale,
  ChevronDown, ChevronUp, History, CheckCircle2, Lock,
  ArrowRight, FileText, Trash2, Sliders, ExternalLink
} from 'lucide-react';
import { 
  apiGetStockKg, apiGetPreciosSugeridos, apiCrearProducto,
  apiSetMargen, apiPublicarPrecios, apiGetConfig, apiSetConfig,
  apiCrearIngreso, apiGetIngresos, apiGetProveedores,
  apiRegistrarSalidas, apiGetMovimientos,
  getAdminPinSession, setAdminPinSession, clearAdminPinSession
} from '../utils/mercaderiaApi';
import { BalanzaSystelSession, soportaWebSerial } from '../utils/balanzaSystel';
import { getCategoriaPrincipal } from '../data/productUtils';

const norm = (s) => (s || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const $$ = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

export default function Productos() {
  // Pestañas internas
  const [subTab, setSubTab] = useState('tabla'); // 'tabla' | 'ingresos' | 'salidas'

  // Datos principales combinados
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [categoriaChip, setCategoriaChip] = useState('Todos'); // 'Todos' | 'Verdura' | 'Fruta' | 'Almacén' | 'Otros' | 'Sin categoría'

  // Configuración global (tara, redondeo, empaques)
  const [config, setConfig] = useState({
    tara_kg: 2.0,
    redondeo: 50,
    empaque_chica: 50,
    empaque_grande: 350,
    admin_pin_configurado: false,
    hogar_pin_configurado: false
  });

  // Modales
  const [modalCompra, setModalCompra] = useState(null); // { open: bool, productoPreseleccionado?: string }
  const [modalSalida, setModalSalida] = useState(false);
  const [modalNuevoProducto, setModalNuevoProducto] = useState(false);
  const [modalPublicar, setModalPublicar] = useState(false);
  const [modalConfig, setModalConfig] = useState(false);
  const [modalAdminPin, setModalAdminPin] = useState(null); // { open: bool, onConfirm: (pin) => void, error: string }

  // Estados de edición de margen inline
  const [margenesEditados, setMargenesEditados] = useState({});
  const [guardandoMargen, setGuardandoMargen] = useState({});

  // Cargar datos principales (Stock en kg + Precios sugeridos)
  const cargarDatos = async () => {
    setCargando(true);
    setError(null);
    try {
      const [resStock, resPrecios, resConfig] = await Promise.all([
        apiGetStockKg(),
        apiGetPreciosSugeridos(),
        apiGetConfig()
      ]);

      if (resConfig && resConfig.ok) {
        setConfig(prev => ({
          ...prev,
          tara_kg: resConfig.tara_kg !== undefined ? Number(resConfig.tara_kg) : prev.tara_kg,
          redondeo: resConfig.redondeo !== undefined ? Number(resConfig.redondeo) : prev.redondeo,
          empaque_chica: resConfig.empaque_chica !== undefined ? Number(resConfig.empaque_chica) : prev.empaque_chica,
          empaque_grande: resConfig.empaque_grande !== undefined ? Number(resConfig.empaque_grande) : prev.empaque_grande,
          admin_pin_configurado: Boolean(resConfig.admin_pin_configurado),
          hogar_pin_configurado: Boolean(resConfig.hogar_pin_configurado)
        }));
      }

      const listaStock = (resStock && resStock.ok && Array.isArray(resStock.productos)) ? resStock.productos : [];
      const listaPrecios = (resPrecios && resPrecios.ok && (Array.isArray(resPrecios.precios) ? resPrecios.precios : (Array.isArray(resPrecios.productos) ? resPrecios.productos : []))) || [];

      // Combinar por nombre normalizado
      const mapa = new Map();

      listaPrecios.forEach(p => {
        if (!p || !p.producto) return;
        const k = norm(p.producto);
        mapa.set(k, {
          producto: p.producto,
          categoria: p.categoria || getCategoriaPrincipal(p.producto),
          unidad: p.unidad || 'kg',
          costo_kg_ultimo: Number(p.costo_kg_ultimo || p.costo || 0),
          margen_pct: Number(p.margen_pct !== undefined ? p.margen_pct : 60),
          precio_sugerido: Number(p.precio_sugerido || 0),
          precio_publicado: Number(p.precio_publicado || 0),
          en_deposito: 0,
          comprometido: 0,
          vendible: 0,
          ultimo_ingreso: '—'
        });
      });

      listaStock.forEach(s => {
        if (!s || !s.producto) return;
        const k = norm(s.producto);
        const existing = mapa.get(k) || {
          producto: s.producto,
          categoria: s.categoria || getCategoriaPrincipal(s.producto),
          unidad: s.unidad || 'kg',
          costo_kg_ultimo: Number(s.costo_kg_ultimo || 0),
          margen_pct: 60,
          precio_sugerido: 0,
          precio_publicado: 0
        };

        mapa.set(k, {
          ...existing,
          categoria: s.categoria || existing.categoria || getCategoriaPrincipal(s.producto),
          unidad: s.unidad || existing.unidad || 'kg',
          costo_kg_ultimo: s.costo_kg_ultimo ? Number(s.costo_kg_ultimo) : existing.costo_kg_ultimo,
          en_deposito: Number(s.en_deposito || 0),
          comprometido: Number(s.comprometido || 0),
          vendible: Number(s.vendible !== undefined ? s.vendible : ((Number(s.en_deposito) || 0) - (Number(s.comprometido) || 0))),
          ultimo_ingreso: s.ultimo_ingreso || existing.ultimo_ingreso || '—'
        });
      });

      const combinados = Array.from(mapa.values()).sort((a, b) => a.producto.localeCompare(b.producto, 'es', { sensitivity: 'base' }));
      setProductos(combinados);

    } catch (err) {
      setError(err.message || 'Error cargando datos de productos');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  // Helper de cálculo de precio sugerido
  const calcularPrecioSugerido = (costo, margenPct) => {
    const c = Number(costo) || 0;
    const m = Number(margenPct) || 0;
    const mult = Number(config.redondeo) || 50;
    if (c <= 0) return 0;
    const base = c * (1 + m / 100);
    return Math.round(base / mult) * mult;
  };

  // Guardar margen editado
  const handleGuardarMargen = async (prodNombre, nuevoMargen) => {
    const mNum = parseFloat(nuevoMargen);
    if (isNaN(mNum)) return;

    setGuardandoMargen(prev => ({ ...prev, [prodNombre]: true }));
    try {
      const res = await apiSetMargen(prodNombre, mNum);
      if (res && res.ok) {
        setProductos(prev => prev.map(p => {
          if (p.producto === prodNombre) {
            const sug = calcularPrecioSugerido(p.costo_kg_ultimo, mNum);
            return { ...p, margen_pct: mNum, precio_sugerido: sug };
          }
          return p;
        }));
      } else {
        alert(res?.error || 'No se pudo guardar el margen');
      }
    } catch (e) {
      alert(`Error al guardar margen: ${e.message}`);
    } finally {
      setGuardandoMargen(prev => ({ ...prev, [prodNombre]: false }));
    }
  };

  // Helper para solicitar PIN de Admin con memoria de 15 minutos
  const ejecutarConAdminPin = (accionCallback) => {
    const pinMem = getAdminPinSession();
    if (pinMem) {
      accionCallback(pinMem);
      return;
    }
    setModalAdminPin({
      open: true,
      error: null,
      onConfirm: (pinIngresado) => {
        setAdminPinSession(pinIngresado);
        setModalAdminPin(null);
        accionCallback(pinIngresado);
      }
    });
  };

  // Filtrado de productos
  const productosFiltrados = useMemo(() => {
    return productos.filter(p => {
      // Filtro de chip
      const catNorm = norm(p.categoria || '');
      if (categoriaChip === 'Verdura' && !catNorm.includes('verdura')) return false;
      if (categoriaChip === 'Fruta' && !catNorm.includes('fruta')) return false;
      if (categoriaChip === 'Almacén' && !catNorm.includes('almacen')) return false;
      if (categoriaChip === 'Otros' && (catNorm.includes('verdura') || catNorm.includes('fruta') || catNorm.includes('almacen'))) return false;
      if (categoriaChip === 'Sin categoría' && p.categoria && p.categoria.trim() !== '' && p.categoria !== 'Sin categoría') return false;

      // Buscador
      if (busqueda.trim()) {
        const q = norm(busqueda);
        const matchNombre = norm(p.producto).includes(q);
        const matchCat = catNorm.includes(q);
        if (!matchNombre && !matchCat) return false;
      }

      return true;
    });
  }, [productos, categoriaChip, busqueda]);

  // Lista de cambios para el modal de publicación
  const cambiosDePrecio = useMemo(() => {
    return productos.map(p => {
      const margenActual = margenesEditados[p.producto] !== undefined ? margenesEditados[p.producto] : p.margen_pct;
      const sugerido = calcularPrecioSugerido(p.costo_kg_ultimo, margenActual);
      const publicado = Number(p.precio_publicado || 0);
      const diferencia = sugerido - publicado;
      const difPct = publicado > 0 ? ((diferencia / publicado) * 100).toFixed(1) : '100';

      return {
        producto: p.producto,
        costo_kg_ultimo: p.costo_kg_ultimo,
        margen_pct: margenActual,
        precio_sugerido: sugerido,
        precio_publicado: publicado,
        diferencia,
        difPct,
        cambia: sugerido > 0 && sugerido !== publicado
      };
    });
  }, [productos, margenesEditados, config.redondeo]);

  const productosQueCambian = useMemo(() => cambiosDePrecio.filter(c => c.cambia), [cambiosDePrecio]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pt-16 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* ── ENCABEZADO SUPERIOR ────────────────────────────────────────── */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-green-500/10 border border-green-500/30 flex items-center justify-center text-green-400">
              <Package size={20} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Productos & Stock
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">
                Tabla unificada de costos, márgenes, stock y compras
              </p>
            </div>
          </div>
        </div>

        {/* Pestañas de vista internas */}
        <div className="flex items-center gap-2">
          <div className="flex bg-black/60 border border-gray-800 p-1 rounded-xl">
            <button
              onClick={() => setSubTab('tabla')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                subTab === 'tabla' ? 'bg-green-500 text-black shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              Productos
            </button>
            <button
              onClick={() => setSubTab('ingresos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                subTab === 'ingresos' ? 'bg-green-500 text-black shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              Historial de Ingresos
            </button>
            <button
              onClick={() => setSubTab('salidas')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                subTab === 'salidas' ? 'bg-green-500 text-black shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              Historial de Salidas
            </button>
          </div>

          <button
            onClick={() => setModalConfig(true)}
            title="Configuración de Tara y Redondeo"
            className="p-2.5 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-700 text-gray-400 hover:text-white transition-all cursor-pointer"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* ── SUB-VISTA 1: TABLA PRINCIPAL DE PRODUCTOS ───────────────────── */}
      {subTab === 'tabla' && (
        <div className="space-y-4">
          {/* Barra de Filtros y Botones de Acción */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-[#121212] border border-gray-800 p-3.5 rounded-2xl">
            {/* Buscador */}
            <div className="relative flex-1 max-w-xs">
              <Search size={15} className="absolute left-3.5 top-2.5 text-gray-500" />
              <input
                type="text"
                placeholder="Buscar producto..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full bg-black/60 border border-gray-700 focus:border-green-500 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-gray-500 outline-none"
              />
            </div>

            {/* Chips de Categorías */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
              {['Todos', 'Verdura', 'Fruta', 'Almacén', 'Otros', 'Sin categoría'].map(chip => (
                <button
                  key={chip}
                  onClick={() => setCategoriaChip(chip)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    categoriaChip === chip
                      ? 'bg-gray-200 text-black'
                      : 'bg-black/40 text-gray-400 hover:text-white hover:bg-gray-800 border border-gray-800'
                  }`}
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Botones de Acción */}
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <button
                onClick={() => setModalCompra({ open: true })}
                className="px-3 py-1.5 rounded-xl bg-green-500 hover:bg-green-400 text-black text-xs font-black uppercase tracking-wider flex items-center gap-1 shadow-md shadow-green-500/10 cursor-pointer"
              >
                <Plus size={14} />
                <span>+ Compra</span>
              </button>

              <button
                onClick={() => setModalSalida(true)}
                className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <Minus size={14} />
                <span>− Salida</span>
              </button>

              <button
                onClick={() => setModalNuevoProducto(true)}
                className="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-750 text-gray-200 text-xs font-bold flex items-center gap-1 cursor-pointer border border-gray-700"
              >
                <Plus size={14} />
                <span>+ Producto</span>
              </button>

              <button
                onClick={() => setModalPublicar(true)}
                disabled={productos.length === 0}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1 shadow-md shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
              >
                <Check size={14} />
                <span>Publicar ({productosQueCambian.length})</span>
              </button>

              <button
                onClick={cargarDatos}
                disabled={cargando}
                title="Recargar datos"
                className="p-1.5 rounded-xl bg-gray-900 border border-gray-800 text-gray-400 hover:text-white cursor-pointer"
              >
                <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          {/* Tabla de Productos con Estilo PanelCostos */}
          <div className="bg-[#121212] border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-black/60 border-b border-gray-800 text-gray-400 font-bold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-4">Producto</th>
                    <th className="py-3 px-3">Categoría</th>
                    <th className="py-3 px-3 text-right">Stock</th>
                    <th className="py-3 px-3 text-right">Costo / Ud</th>
                    <th className="py-3 px-3 text-center">Margen %</th>
                    <th className="py-3 px-3 text-right">Precio Sugerido</th>
                    <th className="py-3 px-3 text-right">Precio Publicado</th>
                    <th className="py-3 px-3 text-right">Diferencia</th>
                    <th className="py-3 px-3 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60 font-medium">
                  {cargando && productos.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-gray-500">
                        <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-green-500" />
                        <span>Cargando catálogo unificado desde Google Sheets...</span>
                      </td>
                    </tr>
                  ) : productosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-gray-500">
                        No se encontraron productos con los filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    productosFiltrados.map((p, idx) => {
                      const margenVal = margenesEditados[p.producto] !== undefined
                        ? margenesEditados[p.producto]
                        : p.margen_pct;

                      const sug = calcularPrecioSugerido(p.costo_kg_ultimo, margenVal);
                      const pub = Number(p.precio_publicado || 0);
                      const dif = sug - pub;
                      const esSinStock = Number(p.en_deposito || 0) <= 0;

                      // Explicación de la cuenta: costo × factor -> redondeado
                      const factor = (1 + (Number(margenVal) || 0) / 100).toFixed(2).replace('.', ',');
                      const textoCuenta = p.costo_kg_ultimo > 0 
                        ? `costo × ${factor} → red. $${config.redondeo}` 
                        : 'sin costo';

                      return (
                        <tr 
                          key={idx} 
                          className={`hover:bg-white/[0.02] transition-colors ${esSinStock ? 'opacity-40 hover:opacity-100' : ''}`}
                        >
                          {/* 1. Producto */}
                          <td className="py-3 px-4 font-bold text-white text-sm">
                            {p.producto}
                          </td>

                          {/* 2. Categoría */}
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded-md bg-gray-800/80 border border-gray-700/60 text-gray-300 text-[10px] font-semibold">
                              {p.categoria || 'Sin categoría'}
                            </span>
                          </td>

                          {/* 3. Stock con unidad */}
                          <td className="py-3 px-3 text-right font-mono font-bold">
                            <span className={esSinStock ? 'text-gray-500' : 'text-white'}>
                              {p.unidad === 'kg' 
                                ? `${Number(p.en_deposito || 0).toFixed(2)} kg` 
                                : `${Math.round(Number(p.en_deposito || 0))} ${p.unidad}`}
                            </span>
                          </td>

                          {/* 4. Costo por unidad */}
                          <td className="py-3 px-3 text-right font-mono text-gray-300">
                            {p.costo_kg_ultimo > 0 ? (
                              <span>$${p.costo_kg_ultimo.toFixed(0)} <span className="text-[10px] text-gray-500 font-normal">/{p.unidad}</span></span>
                            ) : (
                              <span className="text-gray-600">—</span>
                            )}
                          </td>

                          {/* 5. Margen % editable */}
                          <td className="py-3 px-3 text-center">
                            <div className="inline-flex items-center justify-center gap-0.5 bg-black/60 border border-gray-800 focus-within:border-green-500 rounded-lg px-1.5 py-0.5">
                              <input
                                type="number"
                                className="w-11 bg-transparent text-right font-mono text-xs text-white outline-none"
                                value={margenVal !== undefined ? margenVal : ''}
                                onChange={(e) => setMargenesEditados({ ...margenesEditados, [p.producto]: e.target.value })}
                                onBlur={(e) => handleGuardarMargen(p.producto, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleGuardarMargen(p.producto, e.target.value);
                                  }
                                }}
                              />
                              <span className="text-[10px] text-gray-500">%</span>
                              {guardandoMargen[p.producto] && (
                                <RefreshCw size={10} className="animate-spin text-green-400 ml-0.5" />
                              )}
                            </div>
                          </td>

                          {/* 6. Precio sugerido con subtítulo explicativo */}
                          <td className="py-3 px-3 text-right">
                            <div className="font-mono font-black text-amber-300 text-sm">
                              {sug > 0 ? $$(sug) : '—'}
                            </div>
                            <div className="text-[9px] text-gray-500 font-mono">
                              {textoCuenta}
                            </div>
                          </td>

                          {/* 7. Precio publicado */}
                          <td className="py-3 px-3 text-right font-mono font-bold text-gray-300">
                            {pub > 0 ? $$(pub) : '—'}
                          </td>

                          {/* 8. Diferencia */}
                          <td className="py-3 px-3 text-right font-mono text-xs">
                            {sug > 0 && pub > 0 ? (
                              <span className={dif === 0 ? 'text-gray-500' : dif > 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                                {dif > 0 ? `+${$$(dif)}` : dif < 0 ? `-${$$(Math.abs(dif))}` : '$0'}
                              </span>
                            ) : (
                              <span className="text-gray-600">—</span>
                            )}
                          </td>

                          {/* 9. Botón + Compra por fila */}
                          <td className="py-3 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => setModalCompra({ open: true, productoPreseleccionado: p.producto })}
                              className="px-2.5 py-1 rounded-lg bg-green-500/10 border border-green-500/30 hover:bg-green-500 hover:text-black text-green-400 text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                            >
                              <Plus size={11} />
                              <span>+ Compra</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── SUB-VISTA 2: HISTORIAL DE INGRESOS ─────────────────────────── */}
      {subTab === 'ingresos' && (
        <HistorialIngresosTab onVolver={() => setSubTab('tabla')} />
      )}

      {/* ── SUB-VISTA 3: HISTORIAL DE SALIDAS ──────────────────────────── */}
      {subTab === 'salidas' && (
        <HistorialSalidasTab onVolver={() => setSubTab('tabla')} />
      )}

      {/* ── MODAL 1: NUEVA COMPRA (PARTE 2) ────────────────────────────── */}
      {modalCompra && modalCompra.open && (
        <ModalCompra
          productosExistentes={productos}
          productoInicial={modalCompra.productoPreseleccionado || ''}
          taraKg={config.tara_kg}
          onClose={() => setModalCompra(null)}
          onSuccess={() => {
            setModalCompra(null);
            cargarDatos();
          }}
        />
      )}

      {/* ── MODAL 2: REGISTRAR SALIDA (PARTE 3) ────────────────────────── */}
      {modalSalida && (
        <ModalSalida
          productosExistentes={productos}
          onClose={() => setModalSalida(false)}
          onSuccess={() => {
            setModalSalida(false);
            cargarDatos();
          }}
          ejecutarConAdminPin={ejecutarConAdminPin}
        />
      )}

      {/* ── MODAL 3: NUEVO PRODUCTO ────────────────────────────────────── */}
      {modalNuevoProducto && (
        <ModalNuevoProducto
          onClose={() => setModalNuevoProducto(false)}
          onSuccess={() => {
            setModalNuevoProducto(false);
            cargarDatos();
          }}
        />
      )}

      {/* ── MODAL 4: PUBLICAR PRECIOS (ANTES / DESPUÉS) ────────────────── */}
      {modalPublicar && (
        <ModalPublicar
          productosQueCambian={productosQueCambian}
          preciosList={productos}
          margenesEditados={margenesEditados}
          config={config}
          calcularPrecioSugerido={calcularPrecioSugerido}
          onClose={() => setModalPublicar(false)}
          onSuccess={() => {
            setModalPublicar(false);
            cargarDatos();
          }}
        />
      )}

      {/* ── MODAL 5: CONFIGURACIÓN GLOBAL (PARTE 6) ────────────────────── */}
      {modalConfig && (
        <ModalConfiguracion
          config={config}
          onClose={() => setModalConfig(false)}
          onGuardado={() => {
            cargarDatos();
          }}
        />
      )}

      {/* ── MODAL 6: PEDIR PIN DE ADMINISTRADOR (SOLO MEMORIA) ─────────── */}
      {modalAdminPin && modalAdminPin.open && (
        <ModalPedirAdminPin
          error={modalAdminPin.error}
          onConfirm={modalAdminPin.onConfirm}
          onClose={() => setModalAdminPin(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: MODAL NUEVA COMPRA (PARTE 2)
// ─────────────────────────────────────────────────────────────────────────────
function ModalCompra({ productosExistentes, productoInicial, taraKg, onClose, onSuccess }) {
  const [producto, setProducto] = useState(productoInicial || '');
  const [proveedor, setProveedor] = useState('');
  const [proveedorTel, setProveedorTel] = useState('');
  const [proveedoresLista, setProveedoresLista] = useState([]);
  const [costoTotal, setCostoTotal] = useState('');
  
  // Si el producto no existe en el catálogo, se muestran campos inline
  const [categoriaNueva, setCategoriaNueva] = useState('Verduras');
  const [unidadNueva, setUnidadNueva] = useState('kg');

  // Modo pesaje / cajones
  const [modoManual, setModoManual] = useState(false);
  const [cajones, setCajones] = useState([]);
  const [pesoManualCajon, setPesoManualCajon] = useState('');
  const [kgNetosManual, setKgNetosManual] = useState('');

  // Balanza Systel
  const [balanzaConectada, setBalanzaConectada] = useState(false);
  const [balanzaConectando, setBalanzaConectando] = useState(false);
  const [balanzaPesoVivo, setBalanzaPesoVivo] = useState(null);
  const balanzaSessionRef = useRef(null);

  // Estados de envío y feedback
  const [guardando, setGuardando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState(null);
  const [mensajeError, setMensajeError] = useState(null);

  // Verificar si el producto escrito existe
  const productoMatch = useMemo(() => {
    const q = norm(producto);
    if (!q) return null;
    return productosExistentes.find(p => norm(p.producto) === q) || null;
  }, [producto, productosExistentes]);

  const esProductoNuevo = Boolean(producto.trim() && !productoMatch);
  const unidadActiva = productoMatch ? productoMatch.unidad : unidadNueva;

  // Cargar lista de proveedores para autocompletar
  useEffect(() => {
    (async () => {
      try {
        const res = await apiGetProveedores();
        if (res && res.ok && Array.isArray(res.proveedores)) {
          setProveedoresLista(res.proveedores);
        }
      } catch (e) {
        // silencioso
      }
    })();
  }, []);

  // Manejar conexión de Balanza Systel
  const toggleBalanza = async () => {
    if (balanzaConectada) {
      if (balanzaSessionRef.current) balanzaSessionRef.current.desconectar();
      setBalanzaConectada(false);
      return;
    }
    if (!soportaWebSerial()) {
      alert('Tu navegador no soporta Web Serial API. Usá Chrome, Edge u Opera en una computadora.');
      return;
    }
    setBalanzaConectando(true);
    try {
      const session = new BalanzaSystelSession({
        onPeso: (kg) => setBalanzaPesoVivo(kg),
        onStatusChange: (status) => setBalanzaConectada(status === 'connected'),
        onError: (err) => alert(`Error de balanza: ${err}`)
      });
      balanzaSessionRef.current = session;
      const ok = await session.conectar();
      setBalanzaConectada(ok);
    } catch (e) {
      alert(`No se pudo conectar a la balanza: ${e.message}`);
    } finally {
      setBalanzaConectando(false);
    }
  };

  useEffect(() => {
    return () => {
      if (balanzaSessionRef.current) balanzaSessionRef.current.desconectar();
    };
  }, []);

  const agregarCajonDesdeBalanza = () => {
    if (!balanzaPesoVivo || balanzaPesoVivo <= 0) {
      alert('La balanza no registró un peso válido.');
      return;
    }
    const tara = Number(taraKg) || 0;
    const neto = Number(Math.max(0, balanzaPesoVivo - tara).toFixed(3));
    if (neto <= 0) {
      alert(`El peso (${balanzaPesoVivo} kg) es menor o igual a la tara (${tara} kg).`);
      return;
    }
    setCajones(prev => [...prev, neto]);
  };

  const agregarCajonManual = () => {
    const val = parseFloat(pesoManualCajon);
    if (isNaN(val) || val <= 0) return;
    setCajones(prev => [...prev, Number(val.toFixed(3))]);
    setPesoManualCajon('');
  };

  // Cálculo de cantidad total neta
  const cantidadTotalNeta = useMemo(() => {
    if (unidadActiva !== 'kg') {
      return parseFloat(kgNetosManual) || 0;
    }
    if (modoManual) {
      return parseFloat(kgNetosManual) || 0;
    }
    const suma = cajones.reduce((acc, c) => acc + (Number(c) || 0), 0);
    return Number(suma.toFixed(3));
  }, [unidadActiva, modoManual, kgNetosManual, cajones]);

  // Costo por unidad
  const costoPorUnidad = useMemo(() => {
    const c = parseFloat(costoTotal) || 0;
    if (c <= 0 || cantidadTotalNeta <= 0) return 0;
    return Number((c / cantidadTotalNeta).toFixed(2));
  }, [costoTotal, cantidadTotalNeta]);

  // Guardar Compra
  const handleGuardar = async (e) => {
    e.preventDefault();
    setMensajeError(null);
    setMensajeExito(null);

    const prodLimpio = producto.trim();
    if (!prodLimpio) {
      setMensajeError('Ingresá el nombre del producto.');
      return;
    }
    if (cantidadTotalNeta <= 0) {
      setMensajeError('La cantidad neta debe ser mayor a 0.');
      return;
    }
    const cTotal = parseFloat(costoTotal);
    if (isNaN(cTotal) || cTotal <= 0) {
      setMensajeError('Ingresá un costo total válido en pesos.');
      return;
    }

    setGuardando(true);
    try {
      const res = await apiCrearIngreso({
        producto: prodLimpio,
        proveedor: proveedor.trim() || 'Sin especificar',
        proveedor_tel: proveedorTel.trim() || undefined,
        kg_netos: cantidadTotalNeta,
        costo_total: cTotal,
        cajones: (unidadActiva === 'kg' && cajones.length > 0) ? cajones : undefined,
        categoria: esProductoNuevo ? categoriaNueva : undefined,
        unidad: esProductoNuevo ? unidadNueva : undefined,
      });

      if (res && res.ok) {
        const stockActualizado = res.stock_ahora !== undefined ? res.stock_ahora : 'actualizado';
        setMensajeExito(`¡Se sumaron ${cantidadTotalNeta} ${unidadActiva} a ${prodLimpio}! Costo: $${costoPorUnidad} por ${unidadActiva}. Stock ahora: ${stockActualizado}.`);
        setTimeout(() => {
          onSuccess();
        }, 1800);
      } else {
        setMensajeError(res?.error || 'No se pudo guardar la compra en Google Sheets.');
      }
    } catch (err) {
      setMensajeError(err.message || 'Error de red al guardar la compra.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-[#121212] border border-gray-800 rounded-3xl w-full max-w-2xl p-5 sm:p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 my-8">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <h2 className="text-base font-black uppercase tracking-wider text-green-400 flex items-center gap-2">
            <Plus size={18} /> Nueva Compra / Ingreso
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleGuardar} className="space-y-4">
          {/* Producto */}
          <div>
            <label className="block text-xs font-bold uppercase text-gray-400 mb-1">
              Producto *
            </label>
            <input
              type="text"
              placeholder="Ej: Tomate Redondo, Banana, Harina 0000..."
              value={producto}
              onChange={(e) => setProducto(e.target.value)}
              className="w-full bg-black/60 border border-gray-700 focus:border-green-500 rounded-xl px-4 py-2.5 text-sm text-white font-bold outline-none"
              required
            />

            {/* Aviso y campos inline si el producto no existe */}
            {esProductoNuevo && (
              <div className="mt-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 space-y-2.5">
                <p className="text-xs font-bold flex items-center gap-1.5">
                  <AlertTriangle size={14} /> El producto no existe en el catálogo. Se creará automáticamente:
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Categoría</label>
                    <select
                      value={categoriaNueva}
                      onChange={(e) => setCategoriaNueva(e.target.value)}
                      className="w-full bg-black border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                    >
                      <option value="Verduras">Verduras</option>
                      <option value="Frutas">Frutas</option>
                      <option value="Almacén">Almacén</option>
                      <option value="Otros">Otros</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Unidad</label>
                    <select
                      value={unidadNueva}
                      onChange={(e) => setUnidadNueva(e.target.value)}
                      className="w-full bg-black border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                    >
                      <option value="kg">kg (peso)</option>
                      <option value="un">un (unidad)</option>
                      <option value="atado">atado</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Proveedor y Teléfono */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase text-gray-400 mb-1">
                Proveedor
              </label>
              <input
                type="text"
                placeholder="Ej: Mercado Central, Don Pedro..."
                value={proveedor}
                onChange={(e) => {
                  setProveedor(e.target.value);
                  const pMatch = proveedoresLista.find(pv => norm(pv.nombre || pv) === norm(e.target.value));
                  if (pMatch && pMatch.telefono) setProveedorTel(pMatch.telefono);
                }}
                className="w-full bg-black/60 border border-gray-700 focus:border-green-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-gray-400 mb-1">
                Teléfono Proveedor (opcional)
              </label>
              <input
                type="text"
                placeholder="Ej: 11 4455-6677"
                value={proveedorTel}
                onChange={(e) => setProveedorTel(e.target.value)}
                className="w-full bg-black/60 border border-gray-700 focus:border-green-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
              />
            </div>
          </div>

          {/* Costo Total */}
          <div>
            <label className="block text-xs font-bold uppercase text-gray-400 mb-1">
              Costo Total Pagado ($) *
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-2 text-gray-500 font-bold">$</span>
              <input
                type="number"
                step="any"
                placeholder="0.00"
                value={costoTotal}
                onChange={(e) => setCostoTotal(e.target.value)}
                className="w-full bg-black/60 border border-gray-700 focus:border-green-500 rounded-xl pl-8 pr-4 py-2 text-sm font-mono font-bold text-white outline-none"
                required
              />
            </div>
          </div>

          {/* Sección de Cantidad (Pesaje o Unidades) */}
          <div className="bg-[#181818] border border-gray-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
                <Scale size={14} className="text-amber-400" /> Cantidad Comprada ({unidadActiva})
              </span>
              {unidadActiva === 'kg' && (
                <button
                  type="button"
                  onClick={() => setModoManual(!modoManual)}
                  className="text-[11px] text-gray-400 hover:text-white underline font-semibold cursor-pointer"
                >
                  {modoManual ? '← Pesar por cajón' : 'Escribir total directo'}
                </button>
              )}
            </div>

            {unidadActiva !== 'kg' || modoManual ? (
              <div>
                <input
                  type="number"
                  step={unidadActiva === 'kg' ? '0.001' : '1'}
                  placeholder={`Cantidad en ${unidadActiva}...`}
                  value={kgNetosManual}
                  onChange={(e) => setKgNetosManual(e.target.value)}
                  className="w-full bg-black border border-gray-700 focus:border-green-500 rounded-xl px-3.5 py-2 text-sm font-mono font-bold text-white outline-none"
                />
              </div>
            ) : (
              <>
                {/* Balanza Systel */}
                <div className="flex items-center justify-between gap-2 bg-black/40 border border-gray-800 p-2.5 rounded-xl">
                  <button
                    type="button"
                    onClick={toggleBalanza}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      balanzaConectada
                        ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                        : 'bg-green-500/10 text-green-400 border border-green-500/30'
                    }`}
                  >
                    <Scale size={13} />
                    {balanzaConectando ? 'Conectando...' : balanzaConectada ? 'Desconectar Balanza' : 'Conectar Balanza Systel'}
                  </button>

                  {balanzaConectada && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-amber-300">
                        {balanzaPesoVivo !== null ? `${balanzaPesoVivo.toFixed(3)} kg` : '0.000 kg'}
                      </span>
                      <button
                        type="button"
                        onClick={agregarCajonDesdeBalanza}
                        className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-black text-xs font-black rounded-lg cursor-pointer"
                      >
                        Pesar Cajón (-{taraKg}kg tara)
                      </button>
                    </div>
                  )}
                </div>

                {/* Input manual de cajón */}
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.001"
                    placeholder="Peso neto de cajón (kg)..."
                    value={pesoManualCajon}
                    onChange={(e) => setPesoManualCajon(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        agregarCajonManual();
                      }
                    }}
                    className="flex-1 bg-black/60 border border-gray-700 focus:border-green-500 rounded-xl px-3 py-1.5 text-xs font-mono text-white outline-none"
                  />
                  <button
                    type="button"
                    onClick={agregarCajonManual}
                    className="bg-gray-800 hover:bg-gray-700 text-white font-bold text-xs px-3 py-1.5 rounded-xl cursor-pointer"
                  >
                    + Cajón
                  </button>
                </div>

                {/* Lista de cajones */}
                {cajones.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {cajones.map((peso, idx) => (
                      <span key={idx} className="bg-black border border-gray-800 px-2 py-0.5 rounded text-[11px] font-mono text-amber-300 flex items-center gap-1.5">
                        #{idx + 1}: {peso}kg
                        <button type="button" onClick={() => setCajones(cajones.filter((_, i) => i !== idx))} className="text-gray-500 hover:text-red-400">
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Resumen en vivo */}
          <div className="bg-black/50 border border-gray-800/80 rounded-2xl p-3 flex items-center justify-around text-center">
            <div>
              <span className="text-[10px] text-gray-500 uppercase block">Cantidad Neta</span>
              <span className="text-lg font-mono font-black text-white">
                {cantidadTotalNeta} <span className="text-xs text-gray-400">{unidadActiva}</span>
              </span>
            </div>
            <div className="h-8 w-px bg-gray-800" />
            <div>
              <span className="text-[10px] text-gray-500 uppercase block">Costo / {unidadActiva}</span>
              <span className="text-lg font-mono font-black text-green-400">
                ${costoPorUnidad}
              </span>
            </div>
          </div>

          {mensajeError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
              {mensajeError}
            </div>
          )}

          {mensajeExito && (
            <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-300 text-xs">
              {mensajeExito}
            </div>
          )}

          <button
            type="submit"
            disabled={guardando}
            className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-black text-xs uppercase tracking-wider py-3 rounded-xl transition-all shadow-lg shadow-green-500/20 cursor-pointer flex items-center justify-center gap-1.5"
          >
            {guardando ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Guardando en Google Sheets...</span>
              </>
            ) : (
              <>
                <Check size={16} />
                <span>{esProductoNuevo ? 'Guardar compra y crear producto' : 'Registrar Compra'}</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: MODAL SALIDA (MERMA & CORRECCIÓN DE STOCK) (PARTE 3)
// ─────────────────────────────────────────────────────────────────────────────
function ModalSalida({ productosExistentes, onClose, onSuccess, ejecutarConAdminPin }) {
  const [tipoSalida, setTipoSalida] = useState('MERMA'); // 'MERMA' | 'AJUSTE'
  const [mostrarMasOpciones, setMostrarMasOpciones] = useState(false);

  // Lista de items a dar de baja
  const [itemsSalida, setItemsSalida] = useState([]); // [{ producto, kg, unidad, costo_unitario, stock_actual, stock_real? }]
  const [busqueda, setBusqueda] = useState('');
  const [chipCat, setChipCat] = useState('Todos');

  // Motivo para merma
  const [motivoRapido, setMotivoRapido] = useState('Podrido');
  const [notaPersonalizada, setNotaPersonalizada] = useState('');

  // Estados de envío
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState(null);

  // Filtrado de productos disponibles
  const productosFiltrados = useMemo(() => {
    return productosExistentes.filter(p => {
      const catNorm = norm(p.categoria || '');
      if (chipCat === 'Verdura' && !catNorm.includes('verdura')) return false;
      if (chipCat === 'Fruta' && !catNorm.includes('fruta')) return false;
      if (chipCat === 'Almacén' && !catNorm.includes('almacen')) return false;
      if (chipCat === 'Otros' && (catNorm.includes('verdura') || catNorm.includes('fruta') || catNorm.includes('almacen'))) return false;

      if (busqueda.trim()) {
        const q = norm(busqueda);
        return norm(p.producto).includes(q);
      }
      return true;
    });
  }, [productosExistentes, chipCat, busqueda]);

  // Agregar producto a la lista de salida
  const agregarProducto = (p) => {
    if (itemsSalida.some(it => it.producto === p.producto)) return;
    setItemsSalida([
      ...itemsSalida,
      {
        producto: p.producto,
        kg: p.unidad === 'kg' ? 1.0 : 1,
        unidad: p.unidad || 'kg',
        costo_unitario: p.costo_kg_ultimo || 0,
        stock_actual: Number(p.en_deposito || 0),
        stock_real: Number(p.en_deposito || 0)
      }
    ]);
  };

  const actualizarItem = (idx, campo, valor) => {
    setItemsSalida(itemsSalida.map((it, i) => i === idx ? { ...it, [campo]: valor } : it));
  };

  const eliminarItem = (idx) => {
    setItemsSalida(itemsSalida.filter((_, i) => i !== idx));
  };

  // Valor total al costo
  const valorTotalCosto = useMemo(() => {
    return itemsSalida.reduce((acc, it) => {
      const cantidad = tipoSalida === 'MERMA' 
        ? (Number(it.kg) || 0)
        : Math.abs((Number(it.stock_real) || 0) - (Number(it.stock_actual) || 0));
      return acc + (cantidad * (Number(it.costo_unitario) || 0));
    }, 0);
  }, [itemsSalida, tipoSalida]);

  // Enviar salida con validación de admin_pin
  const handleAplicar = () => {
    if (itemsSalida.length === 0) {
      alert('Agregá al menos un producto a la lista de salida.');
      return;
    }

    ejecutarConAdminPin(async (adminPin) => {
      setEnviando(true);
      setErrorEnvio(null);

      let payloadItems = [];
      let notaFinal = '';

      if (tipoSalida === 'MERMA') {
        payloadItems = itemsSalida.map(it => ({
          producto: it.producto,
          kg: Number(it.kg) || 0
        }));
        notaFinal = notaPersonalizada.trim() ? `${motivoRapido} - ${notaPersonalizada.trim()}` : motivoRapido;
      } else {
        // AJUSTE: diferencia calculada (stock_real - stock_actual)
        payloadItems = itemsSalida.map(it => {
          const diff = Number(((Number(it.stock_real) || 0) - (Number(it.stock_actual) || 0)).toFixed(3));
          return {
            producto: it.producto,
            kg: diff
          };
        });
        notaFinal = 'Conteo';
      }

      try {
        const res = await apiRegistrarSalidas({
          tipo: tipoSalida,
          items: payloadItems,
          nota: notaFinal,
          admin_pin: adminPin
        });

        if (res && res.ok) {
          onSuccess();
        } else {
          // Si el PIN fue incorrecto, limpiarlo de memoria para forzar volver a pedirlo
          if (res?.error && res.error.toLowerCase().includes('pin')) {
            clearAdminPinSession();
          }
          setErrorEnvio(res?.error || 'El servidor rechazó la salida.');
        }
      } catch (err) {
        setErrorEnvio(err.message || 'Error de red al registrar la salida.');
      } finally {
        setEnviando(false);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-[#121212] border border-gray-800 rounded-3xl w-full max-w-2xl p-5 sm:p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 my-8">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <div>
            <h2 className="text-base font-black uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <Minus size={18} /> Registrar Salida de Stock
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {tipoSalida === 'MERMA' ? 'Baja por merma, desperdicio o regalo' : 'Corrección por conteo físico'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Selector de Tipo */}
        <div className="flex items-center justify-between gap-3 bg-black/50 p-2 rounded-2xl border border-gray-800">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTipoSalida('MERMA')}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                tipoSalida === 'MERMA' ? 'bg-amber-500 text-black shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              Merma
            </button>
            {mostrarMasOpciones && (
              <button
                type="button"
                onClick={() => setTipoSalida('AJUSTE')}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  tipoSalida === 'AJUSTE' ? 'bg-blue-500 text-white shadow' : 'text-gray-400 hover:text-white'
                }`}
              >
                Corregir Stock
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMostrarMasOpciones(!mostrarMasOpciones)}
            className="text-[11px] text-gray-500 hover:text-gray-300 underline cursor-pointer"
          >
            {mostrarMasOpciones ? 'Menos opciones' : 'Más opciones'}
          </button>
        </div>

        {/* Motivo Merma (si tipo es MERMA) */}
        {tipoSalida === 'MERMA' && (
          <div className="space-y-2">
            <label className="block text-[11px] font-bold uppercase text-gray-400">Motivo de Merma</label>
            <div className="flex flex-wrap gap-2">
              {['Podrido', 'Golpeado', 'Regalo', 'Otro'].map(mot => (
                <button
                  type="button"
                  key={mot}
                  onClick={() => setMotivoRapido(mot)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                    motivoRapido === mot
                      ? 'bg-amber-400 text-black'
                      : 'bg-black border border-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {mot}
                </button>
              ))}
            </div>
            {motivoRapido === 'Otro' && (
              <input
                type="text"
                placeholder="Aclaración de motivo..."
                value={notaPersonalizada}
                onChange={(e) => setNotaPersonalizada(e.target.value)}
                className="w-full bg-black/60 border border-gray-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none"
              />
            )}
          </div>
        )}

        {/* Buscador y chips para agregar productos */}
        <div className="space-y-2 border-t border-gray-800/60 pt-3">
          <label className="block text-[11px] font-bold uppercase text-gray-400">Elegir Productos</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Buscar para agregar..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="flex-1 bg-black/60 border border-gray-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none"
            />
            <div className="flex gap-1 overflow-x-auto">
              {['Todos', 'Verdura', 'Fruta', 'Almacén'].map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChipCat(c)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${
                    chipCat === c ? 'bg-gray-200 text-black' : 'bg-black text-gray-400 border border-gray-800'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Lista rápida de resultados de búsqueda */}
          {busqueda.trim() && (
            <div className="max-h-28 overflow-y-auto bg-black/80 border border-gray-800 rounded-xl p-1 divide-y divide-gray-800">
              {productosFiltrados.slice(0, 6).map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    agregarProducto(p);
                    setBusqueda('');
                  }}
                  className="w-full px-3 py-1.5 text-left text-xs text-gray-200 hover:bg-amber-500/10 flex items-center justify-between cursor-pointer"
                >
                  <span>{p.producto}</span>
                  <span className="text-[10px] text-gray-500 font-mono">Stock: {p.en_deposito} {p.unidad}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Lista de Items seleccionados */}
        <div className="space-y-2">
          <label className="block text-[11px] font-bold uppercase text-gray-400">
            Productos a dar de baja ({itemsSalida.length})
          </label>

          {itemsSalida.length === 0 ? (
            <div className="py-6 text-center text-xs text-gray-500 border border-dashed border-gray-800 rounded-2xl">
              Buscá y seleccioná los productos arriba para agregarlos a la lista.
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {itemsSalida.map((it, idx) => (
                <div key={idx} className="bg-black/60 border border-gray-800 rounded-xl p-3 flex items-center justify-between gap-3 text-xs">
                  <div className="flex-1">
                    <span className="font-bold text-white block">{it.producto}</span>
                    <span className="text-[10px] text-gray-500 font-mono">
                      Stock actual: {it.stock_actual} {it.unidad} · Costo: $${it.costo_unitario}
                    </span>
                  </div>

                  {tipoSalida === 'MERMA' ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-gray-400">Baja:</span>
                      <input
                        type="number"
                        step={it.unidad === 'kg' ? '0.001' : '1'}
                        value={it.kg}
                        onChange={(e) => actualizarItem(idx, 'kg', e.target.value)}
                        className="w-20 bg-black border border-gray-700 rounded-lg px-2 py-1 text-right font-mono text-xs text-amber-300 font-bold"
                      />
                      <span className="text-[10px] text-gray-400">{it.unidad}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-400">Hay realmente:</span>
                        <input
                          type="number"
                          step={it.unidad === 'kg' ? '0.001' : '1'}
                          value={it.stock_real}
                          onChange={(e) => actualizarItem(idx, 'stock_real', e.target.value)}
                          className="w-20 bg-black border border-gray-700 rounded-lg px-2 py-1 text-right font-mono text-xs text-blue-300 font-bold"
                        />
                        <span className="text-[10px] text-gray-400">{it.unidad}</span>
                      </div>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-800 text-gray-300">
                        Dif: {(Number(it.stock_real || 0) - Number(it.stock_actual || 0)).toFixed(2)}
                      </span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => eliminarItem(idx)}
                    className="text-gray-500 hover:text-red-400 cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Resumen valor al costo */}
        {itemsSalida.length > 0 && (
          <div className="bg-black/40 border border-gray-800 p-3 rounded-xl flex items-center justify-between text-xs">
            <span className="text-gray-400">Valor total al costo de lo que sale:</span>
            <span className="font-mono font-black text-amber-300 text-sm">{valorTotalCosto > 0 ? $$(valorTotalCosto) : '$0'}</span>
          </div>
        )}

        {errorEnvio && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
            {errorEnvio}
          </div>
        )}

        <button
          type="button"
          onClick={handleAplicar}
          disabled={enviando || itemsSalida.length === 0}
          className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-black text-xs uppercase tracking-wider py-3 rounded-xl transition-all shadow-lg shadow-amber-500/20 cursor-pointer flex items-center justify-center gap-1.5"
        >
          {enviando ? (
            <>
              <RefreshCw size={14} className="animate-spin" />
              <span>Aplicando salida...</span>
            </>
          ) : (
            <>
              <Check size={16} />
              <span>Aplicar {tipoSalida === 'MERMA' ? 'Merma' : 'Corrección'}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: MODAL NUEVO PRODUCTO
// ─────────────────────────────────────────────────────────────────────────────
function ModalNuevoProducto({ onClose, onSuccess }) {
  const [producto, setProducto] = useState('');
  const [categoria, setCategoria] = useState('Verduras');
  const [unidad, setUnidad] = useState('kg');
  const [margenPct, setMargenPct] = useState('60');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!producto.trim()) return;

    setGuardando(true);
    setError(null);

    try {
      const res = await apiCrearProducto({
        producto: producto.trim(),
        categoria,
        unidad,
        margen_pct: Number(margenPct) || 60
      });

      if (res && res.ok) {
        onSuccess();
      } else {
        setError(res?.error || 'No se pudo crear el producto.');
      }
    } catch (err) {
      setError(err.message || 'Error de red.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#121212] border border-gray-800 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <h2 className="text-sm font-black uppercase text-white flex items-center gap-2">
            <Plus size={16} className="text-green-400" /> Crear Nuevo Producto
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block text-gray-400 uppercase font-bold mb-1">Nombre del Producto *</label>
            <input
              type="text"
              placeholder="Ej: Zapallo Anco, Palta Hass..."
              value={producto}
              onChange={(e) => setProducto(e.target.value)}
              className="w-full bg-black/60 border border-gray-700 rounded-xl px-3 py-2 text-white font-bold outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-400 uppercase font-bold mb-1">Categoría</label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-full bg-black border border-gray-700 rounded-xl px-2.5 py-2 text-white outline-none"
              >
                <option value="Verduras">Verduras</option>
                <option value="Frutas">Frutas</option>
                <option value="Almacén">Almacén</option>
                <option value="Otros">Otros</option>
              </select>
            </div>

            <div>
              <label className="block text-gray-400 uppercase font-bold mb-1">Unidad</label>
              <select
                value={unidad}
                onChange={(e) => setUnidad(e.target.value)}
                className="w-full bg-black border border-gray-700 rounded-xl px-2.5 py-2 text-white outline-none"
              >
                <option value="kg">kg (peso)</option>
                <option value="un">un (unidad)</option>
                <option value="atado">atado</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-gray-400 uppercase font-bold mb-1">Margen % por defecto</label>
            <input
              type="number"
              value={margenPct}
              onChange={(e) => setMargenPct(e.target.value)}
              className="w-full bg-black/60 border border-gray-700 rounded-xl px-3 py-2 text-white font-mono outline-none"
            />
          </div>

          {error && <div className="p-2.5 rounded-xl bg-red-500/10 text-red-300">{error}</div>}

          <button
            type="submit"
            disabled={guardando}
            className="w-full py-2.5 bg-green-500 hover:bg-green-400 text-black font-black uppercase rounded-xl transition-all cursor-pointer disabled:opacity-50 mt-2"
          >
            {guardando ? 'Guardando...' : 'Crear Producto'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: MODAL PUBLICAR PRECIOS (ANTES / DESPUÉS)
// ─────────────────────────────────────────────────────────────────────────────
function ModalPublicar({ productosQueCambian, preciosList, margenesEditados, config, calcularPrecioSugerido, onClose, onSuccess }) {
  const [publicando, setPublicando] = useState(false);
  const [error, setError] = useState(null);

  const handleConfirmar = async () => {
    setPublicando(true);
    setError(null);

    // Contrato estricto: origen 'mercaderia', solo nombre y precio
    const prodsParaPublicar = preciosList.map(p => {
      const margenActual = margenesEditados[p.producto] !== undefined ? margenesEditados[p.producto] : p.margen_pct;
      const precioFinal = calcularPrecioSugerido(p.costo_kg_ultimo, margenActual);
      return {
        nombre: p.producto,
        precio: precioFinal
      };
    });

    try {
      const res = await apiPublicarPrecios(prodsParaPublicar);
      if (res && res.ok) {
        onSuccess();
      } else {
        setError(res?.error || 'El Apps Script rechazó la publicación.');
      }
    } catch (e) {
      setError(e.message || 'Error de red.');
    } finally {
      setPublicando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#121212] border border-gray-800 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <h2 className="text-sm font-black uppercase text-white flex items-center gap-2">
            <Check size={16} className="text-green-400" /> Publicar Precios en Tienda
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-gray-300">
          Se actualizarán los precios en la tienda web y se auditarán en Google Sheets.
        </p>

        <div className="max-h-56 overflow-y-auto space-y-2 pr-1 divide-y divide-gray-800">
          {productosQueCambian.length === 0 ? (
            <p className="py-4 text-center text-xs text-gray-500">
              No hay productos con cambios de precio pendientes. Se republicarán los precios actuales.
            </p>
          ) : (
            productosQueCambian.map((c, i) => (
              <div key={i} className="pt-2 flex items-center justify-between text-xs">
                <span className="font-bold text-white">{c.producto}</span>
                <div className="flex items-center gap-2 font-mono">
                  <span className="text-gray-500 line-through">$${c.precio_publicado}</span>
                  <span className="text-gray-400">→</span>
                  <span className="text-green-400 font-bold">$${c.precio_sugerido}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {error && <div className="p-3 rounded-xl bg-red-500/10 text-red-300 text-xs">{error}</div>}

        <div className="flex gap-2 pt-2 border-t border-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold rounded-xl text-xs cursor-pointer"
          >
            Volver
          </button>
          <button
            type="button"
            onClick={handleConfirmar}
            disabled={publicando}
            className="flex-[2] py-2.5 bg-green-500 hover:bg-green-400 text-black font-black uppercase tracking-wider rounded-xl text-xs cursor-pointer disabled:opacity-50"
          >
            {publicando ? 'Publicando...' : 'Confirmar y Publicar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: MODAL CONFIGURACIÓN GLOBAL (PARTE 6)
// ─────────────────────────────────────────────────────────────────────────────
function ModalConfiguracion({ config, onClose, onGuardado }) {
  const [valores, setValores] = useState({
    tara_kg: config.tara_kg || 2.0,
    redondeo: config.redondeo || 50,
    empaque_chica: config.empaque_chica || 50,
    empaque_grande: config.empaque_grande || 350
  });

  const [guardando, setGuardando] = useState(null);
  const [error, setError] = useState(null);

  const guardarCampo = async (clave) => {
    setGuardando(clave);
    setError(null);
    try {
      const res = await apiSetConfig(clave, Number(valores[clave]));
      if (res && res.ok) {
        onGuardado();
      } else {
        setError(res?.error || 'No se pudo guardar la configuración.');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#121212] border border-gray-800 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <h2 className="text-sm font-black uppercase text-white flex items-center gap-2">
            <Settings size={16} className="text-green-400" /> Configuración Global
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          {[
            { clave: 'tara_kg', label: 'Tara global por cajón (kg)', step: '0.1' },
            { clave: 'redondeo', label: 'Múltiplo de redondeo de precios ($)', step: '10' },
            { clave: 'empaque_chica', label: 'Costo bolsa chica ($)', step: '10' },
            { clave: 'empaque_grande', label: 'Costo bolsa grande ($)', step: '10' },
          ].map(({ clave, label, step }) => (
            <div key={clave} className="bg-black/40 border border-gray-800 p-3 rounded-xl flex items-center justify-between gap-3">
              <div className="flex-1">
                <span className="font-bold text-gray-300 block">{label}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step={step}
                  value={valores[clave]}
                  onChange={(e) => setValores({ ...valores, [clave]: e.target.value })}
                  className="w-20 bg-black border border-gray-700 rounded-lg px-2 py-1 text-right font-mono text-xs text-white"
                />
                <button
                  type="button"
                  onClick={() => guardarCampo(clave)}
                  disabled={guardando === clave}
                  className="px-2.5 py-1 bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500 hover:text-black rounded-lg font-bold text-[11px] cursor-pointer"
                >
                  {guardando === clave ? '...' : 'Guardar'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {error && <div className="p-2.5 rounded-xl bg-red-500/10 text-red-300 text-xs">{error}</div>}

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 bg-gray-800 hover:bg-gray-750 text-gray-300 font-bold rounded-xl text-xs cursor-pointer mt-2"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: MODAL PEDIR PIN DE ADMINISTRADOR (SOLO MEMORIA)
// ─────────────────────────────────────────────────────────────────────────────
function ModalPedirAdminPin({ error, onConfirm, onClose }) {
  const [pin, setPin] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!pin.trim()) return;
    onConfirm(pin.trim());
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#121212] border border-gray-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <h2 className="text-sm font-black uppercase text-white flex items-center gap-2">
            <Lock size={16} className="text-amber-400" /> PIN de Administrador
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-gray-400">
          Ingresá tu PIN de administrador para confirmar esta operación. Se mantendrá activo por 15 minutos en memoria.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            autoFocus
            placeholder="PIN de Administrador"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full bg-black border border-gray-700 focus:border-amber-500 rounded-xl px-4 py-2.5 text-center text-lg font-mono tracking-widest text-white outline-none"
            required
          />

          {error && <div className="p-2 rounded-xl bg-red-500/10 text-red-300 text-xs text-center">{error}</div>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-xl text-xs font-bold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-[2] py-2 bg-amber-500 hover:bg-amber-400 text-black rounded-xl text-xs font-black uppercase tracking-wider"
            >
              Confirmar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: HISTORIAL DE INGRESOS (SUB-TAB)
// ─────────────────────────────────────────────────────────────────────────────
function HistorialIngresosTab({ onVolver }) {
  const [ingresos, setIngresos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const cargar = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await apiGetIngresos(null, 100);
      if (res && res.ok && Array.isArray(res.ingresos)) {
        setIngresos(res.ingresos);
      } else {
        setError(res?.error || 'No se pudo cargar el historial.');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-[#121212] border border-gray-800 p-3.5 rounded-2xl">
        <h2 className="text-xs font-black uppercase text-white flex items-center gap-2">
          <History size={15} className="text-green-400" /> Registro de Compras Realizadas
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={cargar} disabled={cargando} className="p-1.5 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white cursor-pointer">
            <RefreshCw size={13} className={cargando ? 'animate-spin' : ''} />
          </button>
          <button onClick={onVolver} className="text-xs text-green-400 hover:underline font-bold cursor-pointer">
            ← Volver a productos
          </button>
        </div>
      </div>

      {error && <div className="p-3 rounded-xl bg-red-500/10 text-red-300 text-xs">{error}</div>}

      <div className="bg-[#121212] border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-black/60 border-b border-gray-800 text-gray-400 font-bold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Fecha</th>
                <th className="py-3 px-3">Producto</th>
                <th className="py-3 px-3">Proveedor & Tel</th>
                <th className="py-3 px-3 text-right">Cantidad</th>
                <th className="py-3 px-3 text-right">Costo Total</th>
                <th className="py-3 px-3 text-right">Costo / Ud</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60 font-medium">
              {cargando && ingresos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">Cargando ingresos...</td>
                </tr>
              ) : ingresos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">No hay compras registradas aún.</td>
                </tr>
              ) : (
                ingresos.map((ing, i) => (
                  <tr key={i} className="hover:bg-white/[0.02]">
                    <td className="py-3 px-4 text-gray-400 font-mono text-[11px]">{ing.fecha || ing.timestamp || '—'}</td>
                    <td className="py-3 px-3 font-bold text-white">{ing.producto}</td>
                    <td className="py-3 px-3 text-gray-300">
                      <div>{ing.proveedor || 'Sin especificar'}</div>
                      {ing.proveedor_tel && <div className="text-[10px] text-gray-500 font-mono">{ing.proveedor_tel}</div>}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-amber-300">
                      {Number(ing.kg_netos || 0).toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-gray-300">{Number(ing.costo_total || 0).toLocaleString('es-AR')}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-green-400">${Number(ing.costo_kg || 0).toFixed(2)}</td>
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

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: HISTORIAL DE SALIDAS (SUB-TAB)
// ─────────────────────────────────────────────────────────────────────────────
function HistorialSalidasTab({ onVolver }) {
  const [salidas, setSalidas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const cargar = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await apiGetMovimientos({ limite: 100 });
      if (res && res.ok && Array.isArray(res.movimientos)) {
        // Filtrar solo MERMA y AJUSTE
        const filtrados = res.movimientos.filter(m => m.tipo === 'MERMA' || m.tipo === 'AJUSTE');
        setSalidas(filtrados);
      } else {
        setError(res?.error || 'No se pudo cargar el historial de salidas.');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-[#121212] border border-gray-800 p-3.5 rounded-2xl">
        <h2 className="text-xs font-black uppercase text-white flex items-center gap-2">
          <History size={15} className="text-amber-400" /> Registro de Salidas (Mermas y Ajustes)
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={cargar} disabled={cargando} className="p-1.5 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white cursor-pointer">
            <RefreshCw size={13} className={cargando ? 'animate-spin' : ''} />
          </button>
          <button onClick={onVolver} className="text-xs text-green-400 hover:underline font-bold cursor-pointer">
            ← Volver a productos
          </button>
        </div>
      </div>

      {error && <div className="p-3 rounded-xl bg-red-500/10 text-red-300 text-xs">{error}</div>}

      <div className="bg-[#121212] border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-black/60 border-b border-gray-800 text-gray-400 font-bold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Fecha</th>
                <th className="py-3 px-3">Tipo</th>
                <th className="py-3 px-3">Producto</th>
                <th className="py-3 px-3 text-right">Cantidad</th>
                <th className="py-3 px-3 text-right">Valor al Costo</th>
                <th className="py-3 px-3">Nota / Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60 font-medium">
              {cargando && salidas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">Cargando salidas...</td>
                </tr>
              ) : salidas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">No hay salidas registradas aún.</td>
                </tr>
              ) : (
                salidas.map((s, i) => (
                  <tr key={i} className="hover:bg-white/[0.02]">
                    <td className="py-3 px-4 text-gray-400 font-mono text-[11px]">{s.fecha || '—'}</td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        s.tipo === 'MERMA' ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'
                      }`}>
                        {s.tipo}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-bold text-white">{s.producto}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-gray-200">
                      {Number(s.kg || 0).toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-amber-300">
                      {s.valor_pesos ? $$(s.valor_pesos) : '—'}
                    </td>
                    <td className="py-3 px-3 text-gray-400 text-xs">{s.nota || '—'}</td>
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
