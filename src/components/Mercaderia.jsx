import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Scale, Package, DollarSign, Settings, History, Plus, Trash2, 
  Check, AlertCircle, AlertTriangle, TrendingUp, TrendingDown, 
  RefreshCw, ArrowRight, Search, ShieldAlert, FileText, CheckCircle2,
  Sliders, ShoppingBag, Eye, X
} from 'lucide-react';
import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { 
  apiGetConfig, apiSetConfig, apiCrearIngreso, apiGetStock, 
  apiGetIngresos, apiRegistrarSalida, apiGetMovimientos, 
  apiGetPreciosSugeridos, apiSetMargen, apiPublicarPrecios 
} from '../utils/mercaderiaApi';
import { BalanzaSystelSession, soportaWebSerial } from '../utils/balanzaSystel';
import { getCategoriaPrincipal } from '../data/productUtils';

const norm = (s) => (s || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export default function Mercaderia() {
  const [tabActiva, setTabActiva] = useState('ingresos'); // 'ingresos' | 'stock' | 'precios' | 'historial_ingresos' | 'config'
  const { productosCostos, stockData } = useGoogleSheets();

  // Configuración global compartida
  const [config, setConfig] = useState({
    tara_kg: 2.0,
    redondeo: 50,
    tope_casa_kg: 30,
    empaque_chica: 50,
    empaque_grande: 350
  });
  const [cargandoConfig, setCargandoConfig] = useState(false);
  const [errorConfig, setErrorConfig] = useState(null);

  const refrescarConfig = async () => {
    setCargandoConfig(true);
    setErrorConfig(null);
    try {
      const res = await apiGetConfig();
      if (res && res.ok) {
        setConfig(prev => ({
          ...prev,
          tara_kg: res.tara_kg !== undefined ? Number(res.tara_kg) : prev.tara_kg,
          redondeo: res.redondeo !== undefined ? Number(res.redondeo) : prev.redondeo,
          tope_casa_kg: res.tope_casa_kg !== undefined ? Number(res.tope_casa_kg) : prev.tope_casa_kg,
          empaque_chica: res.empaque_chica !== undefined ? Number(res.empaque_chica) : prev.empaque_chica,
          empaque_grande: res.empaque_grande !== undefined ? Number(res.empaque_grande) : prev.empaque_grande,
        }));
      } else if (res && res.error) {
        setErrorConfig(res.error);
      }
    } catch (e) {
      setErrorConfig(e.message);
    } finally {
      setCargandoConfig(false);
    }
  };

  useEffect(() => {
    refrescarConfig();
  }, []);

  // Catálogo unificado de productos existentes para autocompletar
  const catalogoProductos = useMemo(() => {
    const nombres = new Set();
    const lista = [];

    // 1. Del contexto productosCostos
    (productosCostos || []).forEach(p => {
      if (p && p.nombre && !nombres.has(norm(p.nombre))) {
        nombres.add(norm(p.nombre));
        lista.push({
          nombre: p.nombre,
          categoria: p.categoriaPrincipal || getCategoriaPrincipal(p.nombre),
          costoKgActual: p.costo_por_kg || p.costo || 0,
        });
      }
    });

    // 2. Del contexto stockData
    const stockList = Array.isArray(stockData) ? stockData : Object.values(stockData || {});
    stockList.forEach(p => {
      if (p && p.nombre && !nombres.has(norm(p.nombre))) {
        nombres.add(norm(p.nombre));
        lista.push({
          nombre: p.nombre,
          categoria: p.categoriaPrincipal || getCategoriaPrincipal(p.nombre),
          costoKgActual: 0,
        });
      }
    });

    return lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [productosCostos, stockData]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pt-16 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Encabezado */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-green-500/10 border border-green-500/30 flex items-center justify-center text-green-400">
              <Scale size={20} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Gestión de Mercadería, Stock & Precios
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">
                Ingresos en kg, control de stock por pesada y cálculo de precios por reposición
              </p>
            </div>
          </div>
        </div>

        {/* Tara global activa badge */}
        <div className="flex items-center gap-2 bg-[#141414] border border-gray-800 rounded-xl px-3.5 py-2 text-xs">
          <span className="text-gray-400 font-medium">Tara global:</span>
          <span className="font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg">
            {config.tara_kg} kg
          </span>
          <span className="text-gray-400 font-medium ml-2">Redondeo:</span>
          <span className="font-mono font-bold text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-lg">
            ${config.redondeo}
          </span>
        </div>
      </div>

      {/* Tabs principales */}
      <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 scrollbar-thin">
        {[
          { id: 'ingresos', label: 'Ingreso de Mercadería', icon: Plus },
          { id: 'stock', label: 'Stock en Kilos', icon: Package },
          { id: 'precios', label: 'Precios & Márgenes', icon: DollarSign },
          { id: 'historial_ingresos', label: 'Historial de Ingresos', icon: History },
          { id: 'config', label: 'Configuración', icon: Settings },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTabActiva(id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all cursor-pointer ${
              tabActiva === id
                ? 'bg-green-500 text-black shadow-lg shadow-green-500/20 font-black'
                : 'bg-[#141414] text-gray-400 hover:text-white hover:bg-gray-850 border border-gray-800'
            }`}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {errorConfig && (
        <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} />
            <span>Aviso de configuración: {errorConfig}</span>
          </div>
          <button onClick={refrescarConfig} className="underline hover:text-amber-100 font-bold ml-2">
            Reintentar
          </button>
        </div>
      )}

      {/* Contenido de pestaña */}
      {tabActiva === 'ingresos' && (
        <IngresoMercaderiaTab 
          config={config} 
          catalogoProductos={catalogoProductos} 
          onIngresoGuardado={() => {}}
        />
      )}

      {tabActiva === 'stock' && (
        <StockKgTab 
          config={config}
        />
      )}

      {tabActiva === 'precios' && (
        <PreciosSugeridosTab 
          config={config}
          productosCostos={productosCostos}
        />
      )}

      {tabActiva === 'historial_ingresos' && (
        <HistorialIngresosTab />
      )}

      {tabActiva === 'config' && (
        <ConfiguracionTab 
          config={config} 
          onConfigActualizada={refrescarConfig}
          cargando={cargandoConfig}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PESTAÑA 1: INGRESO DE MERCADERÍA
// ─────────────────────────────────────────────────────────────────────────────
function IngresoMercaderiaTab({ config, catalogoProductos }) {
  const [producto, setProducto] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [costoTotal, setCostoTotal] = useState('');
  const [cajones, setCajones] = useState([]); // Array de pesos netos por cajón [kg1, kg2, ...]
  const [pesoManualCajon, setPesoManualCajon] = useState('');
  const [kgNetosManual, setKgNetosManual] = useState('');
  const [modoManual, setModoManual] = useState(false); // true = escribe kg directo, false = cajones

  // Estado de balanza Systel Web Serial
  const [balanzaConectada, setBalanzaConectada] = useState(false);
  const [balanzaConectando, setBalanzaConectando] = useState(false);
  const [balanzaPesoVivo, setBalanzaPesoVivo] = useState(null);
  const [balanzaError, setBalanzaError] = useState(null);
  const balanzaSessionRef = useRef(null);

  // Estados de guardado
  const [guardando, setGuardando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState(null);
  const [mensajeError, setMensajeError] = useState(null);

  // Autocompletado de producto
  const [sugerenciasAbiertas, setSugerenciasAbiertas] = useState(false);
  const sugerenciasFiltradas = useMemo(() => {
    if (!producto || producto.length < 1) return [];
    const pNorm = norm(producto);
    return (catalogoProductos || [])
      .filter(p => norm(p.nombre).includes(pNorm))
      .slice(0, 6);
  }, [producto, catalogoProductos]);

  // Manejador Balanza Systel
  const toggleBalanza = async () => {
    if (balanzaConectada) {
      if (balanzaSessionRef.current) {
        await balanzaSessionRef.current.desconectar();
        balanzaSessionRef.current = null;
      }
      setBalanzaConectada(false);
      setBalanzaPesoVivo(null);
      return;
    }

    if (!soportaWebSerial()) {
      alert('Tu navegador no soporta Web Serial API. Para conectar la balanza directamente usá Google Chrome, MS Edge u Opera en PC.');
      return;
    }

    const session = new BalanzaSystelSession({
      onPeso: (peso) => {
        setBalanzaPesoVivo(peso);
      },
      onStatusChange: ({ conectando, conectado, error }) => {
        setBalanzaConectando(conectando);
        setBalanzaConectada(conectado);
        if (error) setBalanzaError(error);
      },
      onError: (err) => {
        setBalanzaError(err.message);
      }
    });

    balanzaSessionRef.current = session;
    await session.conectar();
  };

  useEffect(() => {
    return () => {
      if (balanzaSessionRef.current) {
        balanzaSessionRef.current.desconectar();
      }
    };
  }, []);

  // Agregar cajón desde la balanza o manual
  const agregarCajonDesdeBalanza = () => {
    if (balanzaPesoVivo === null || isNaN(balanzaPesoVivo) || balanzaPesoVivo <= 0) {
      alert('La balanza aún no registró un peso válido.');
      return;
    }
    const tara = Number(config.tara_kg) || 0;
    const neto = Number(Math.max(0, balanzaPesoVivo - tara).toFixed(3));
    if (neto <= 0) {
      alert(`El peso de la balanza (${balanzaPesoVivo} kg) es menor o igual a la tara global (${tara} kg).`);
      return;
    }
    setCajones(prev => [...prev, neto]);
  };

  const agregarCajonManual = () => {
    const val = parseFloat(pesoManualCajon);
    if (isNaN(val) || val <= 0) {
      alert('Ingresá un peso válido para el cajón.');
      return;
    }
    // Si el usuario ingresó peso bruto, o peso neto? Le permitimos restar tara si lo desea o ingresar el neto.
    // Usamos el valor ingresado como peso neto directo
    setCajones(prev => [...prev, Number(val.toFixed(3))]);
    setPesoManualCajon('');
  };

  const eliminarCajon = (index) => {
    setCajones(prev => prev.filter((_, i) => i !== index));
  };

  const limpiarCajones = () => {
    setCajones([]);
  };

  // Cálculo de Kilos Netos Totales
  const kgNetosTotales = useMemo(() => {
    if (modoManual) {
      return Number(parseFloat(kgNetosManual) || 0);
    }
    const suma = cajones.reduce((acc, c) => acc + (Number(c) || 0), 0);
    return Number(suma.toFixed(3));
  }, [modoManual, kgNetosManual, cajones]);

  // Cálculo de Costo por Kg
  const costoPorKg = useMemo(() => {
    const total = parseFloat(costoTotal) || 0;
    if (kgNetosTotales <= 0 || total <= 0) return 0;
    return Number((total / kgNetosTotales).toFixed(2));
  }, [costoTotal, kgNetosTotales]);

  // Guardar Ingreso
  const handleSubmit = async (e) => {
    e.preventDefault();
    setMensajeError(null);
    setMensajeExito(null);

    const prodLimpio = producto.trim();
    if (!prodLimpio) {
      setMensajeError('Por favor indicá el nombre del producto.');
      return;
    }

    if (kgNetosTotales <= 0) {
      setMensajeError('Los kilos netos deben ser mayores a 0. Agregá cajones o ingresá el total de kilos.');
      return;
    }

    const cTotal = parseFloat(costoTotal);
    if (isNaN(cTotal) || cTotal <= 0) {
      setMensajeError('Por favor indicá un costo total válido en pesos.');
      return;
    }

    setGuardando(true);
    try {
      const res = await apiCrearIngreso({
        producto: prodLimpio,
        proveedor: proveedor.trim() || 'Sin especificar',
        kg_netos: kgNetosTotales,
        costo_total: cTotal,
        cajones: cajones.length > 0 ? cajones : [kgNetosTotales]
      });

      if (res && res.ok) {
        setMensajeExito(`¡Ingreso registrado correctamente! Ingreso #${res.ingreso_id || 'OK'} · Costo: $${res.costo_kg || costoPorKg} / kg`);
        // Limpiar formulario
        setProducto('');
        setProveedor('');
        setCostoTotal('');
        setCajones([]);
        setKgNetosManual('');
      } else {
        setMensajeError(res?.error || 'No se pudo guardar el ingreso en Google Sheets.');
      }
    } catch (err) {
      setMensajeError(err.message || 'Error de red al registrar el ingreso.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Columna Izquierda: Formulario de Carga */}
      <div className="lg:col-span-7 space-y-6">
        <form onSubmit={handleSubmit} className="bg-[#121212] border border-gray-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-5">
          <div className="flex items-center justify-between border-b border-gray-800 pb-3">
            <h2 className="text-sm font-black uppercase tracking-wider text-green-400 flex items-center gap-2">
              <Plus size={16} /> Cargar Nuevo Ingreso
            </h2>
            <span className="text-[11px] text-gray-500 font-mono">
              Tara actual: {config.tara_kg} kg
            </span>
          </div>

          {/* Producto con Autocompletar */}
          <div className="relative">
            <label className="block text-xs font-bold uppercase text-gray-400 mb-1.5">
              Producto *
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Ej: Tomate Redondo, Espinaca, Cebolla..."
                value={producto}
                onChange={(e) => {
                  setProducto(e.target.value);
                  setSugerenciasAbiertas(true);
                }}
                onFocus={() => setSugerenciasAbiertas(true)}
                className="w-full bg-black/60 border border-gray-700 focus:border-green-500 rounded-xl px-4 py-2.5 text-sm font-semibold text-white placeholder-gray-600 outline-none transition-all"
                required
              />
              <Search size={16} className="absolute right-3.5 top-3 text-gray-500" />
            </div>

            {/* Dropdown de sugerencias */}
            {sugerenciasAbiertas && sugerenciasFiltradas.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-[#1a1a1a] border border-gray-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
                {sugerenciasFiltradas.map((s, idx) => (
                  <button
                    type="button"
                    key={idx}
                    onClick={() => {
                      setProducto(s.nombre);
                      setSugerenciasAbiertas(false);
                    }}
                    className="w-full px-4 py-2 text-left text-xs text-gray-200 hover:bg-green-500/20 hover:text-green-300 transition-colors flex items-center justify-between border-b border-gray-800/50 last:border-none cursor-pointer"
                  >
                    <span className="font-bold">{s.nombre}</span>
                    <span className="text-[10px] text-gray-500 uppercase">{s.categoria}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Proveedor y Costo Total */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-gray-400 mb-1.5">
                Proveedor
              </label>
              <input
                type="text"
                placeholder="Ej: Mercado Central, Don Pedro..."
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                className="w-full bg-black/60 border border-gray-700 focus:border-green-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-gray-400 mb-1.5">
                Costo Total Pagado ($) *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-gray-500 font-bold">$</span>
                <input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={costoTotal}
                  onChange={(e) => setCostoTotal(e.target.value)}
                  className="w-full bg-black/60 border border-gray-700 focus:border-green-500 rounded-xl pl-8 pr-4 py-2.5 text-sm font-mono font-bold text-white placeholder-gray-600 outline-none transition-all"
                  required
                />
              </div>
            </div>
          </div>

          {/* Sección de Kilos: Balanza Systel y Cajones */}
          <div className="bg-[#181818] border border-gray-800/80 rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
                <Scale size={15} className="text-amber-400" /> Pesaje de Mercadería (Kilos)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setModoManual(!modoManual)}
                  className="text-[11px] text-gray-400 hover:text-white underline font-semibold cursor-pointer"
                >
                  {modoManual ? '← Volver a pesaje por cajón' : 'Escribir total directo en kg'}
                </button>
              </div>
            </div>

            {modoManual ? (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Kilos Netos Totales
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.001"
                    placeholder="0.000"
                    value={kgNetosManual}
                    onChange={(e) => setKgNetosManual(e.target.value)}
                    className="w-full bg-black border border-gray-700 focus:border-green-500 rounded-xl px-4 py-2 text-base font-mono font-black text-white outline-none"
                  />
                  <span className="absolute right-4 top-2 text-xs text-gray-500 font-bold">kg</span>
                </div>
              </div>
            ) : (
              <>
                {/* Conexión y lectura de Balanza */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-black/40 border border-gray-800 p-3 rounded-xl">
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={toggleBalanza}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        balanzaConectada 
                          ? 'bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20' 
                          : 'bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20'
                      }`}
                    >
                      <Scale size={13} />
                      {balanzaConectando ? 'Conectando...' : balanzaConectada ? 'Desconectar Balanza' : 'Conectar Balanza Systel'}
                    </button>
                    {balanzaConectada && (
                      <span className="text-[11px] font-mono text-green-400 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        Vivo: <strong>{balanzaPesoVivo !== null ? `${balanzaPesoVivo} kg` : 'Esperando...'}</strong>
                      </span>
                    )}
                  </div>

                  {balanzaConectada && (
                    <button
                      type="button"
                      onClick={agregarCajonDesdeBalanza}
                      disabled={balanzaPesoVivo === null}
                      className="bg-amber-500 hover:bg-amber-400 text-black font-black text-xs px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                    >
                      <Plus size={14} />
                      <span>Tomar cajón ({balanzaPesoVivo !== null ? (Math.max(0, balanzaPesoVivo - config.tara_kg)).toFixed(3) : 0} kg netos)</span>
                    </button>
                  )}
                </div>

                {/* Input manual de cajón */}
                <div className="flex items-center gap-2 pt-1">
                  <div className="flex-1 relative">
                    <input
                      type="number"
                      step="0.001"
                      placeholder={`Peso neto de cajón en kg... (ej: 18.5)`}
                      value={pesoManualCajon}
                      onChange={(e) => setPesoManualCajon(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          agregarCajonManual();
                        }
                      }}
                      className="w-full bg-black/60 border border-gray-700 focus:border-green-500 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
                    />
                    <span className="absolute right-3 top-2 text-[10px] text-gray-500">kg neto</span>
                  </div>
                  <button
                    type="button"
                    onClick={agregarCajonManual}
                    className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white font-bold text-xs px-3 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1"
                  >
                    <Plus size={13} />
                    <span>Agregar cajón</span>
                  </button>
                </div>

                {/* Lista de Cajones cargados */}
                {cajones.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-gray-800/60">
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span className="font-semibold">{cajones.length} {cajones.length === 1 ? 'cajón' : 'cajones'} cargados:</span>
                      <button
                        type="button"
                        onClick={limpiarCajones}
                        className="text-red-400 hover:text-red-300 text-[11px] underline cursor-pointer"
                      >
                        Vaciar lista
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto pr-1">
                      {cajones.map((peso, idx) => (
                        <div
                          key={idx}
                          className="bg-black/70 border border-gray-700 px-2.5 py-1 rounded-lg text-xs font-mono flex items-center gap-2 text-white"
                        >
                          <span className="text-gray-500 text-[10px]">#{idx + 1}</span>
                          <span className="font-black text-amber-300">{peso} kg</span>
                          <button
                            type="button"
                            onClick={() => eliminarCajon(idx)}
                            className="text-gray-500 hover:text-red-400 transition-colors cursor-pointer"
                            title="Eliminar este cajón"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Feedback de error o éxito */}
          {mensajeError && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{mensajeError}</span>
            </div>
          )}

          {mensajeExito && (
            <div className="p-3.5 rounded-xl bg-green-500/10 border border-green-500/30 text-green-300 text-xs flex items-center gap-2">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>{mensajeExito}</span>
            </div>
          )}

          {/* Botón de Guardado */}
          <button
            type="submit"
            disabled={guardando}
            className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-black text-sm uppercase tracking-wider py-3.5 rounded-2xl transition-all shadow-lg shadow-green-500/20 active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
          >
            {guardando ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                <span>Guardando en Google Sheets...</span>
              </>
            ) : (
              <>
                <Check size={18} />
                <span>Registrar Ingreso de Mercadería</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Columna Derecha: Tarjetas de Resumen en Vivo */}
      <div className="lg:col-span-5 space-y-5">
        <div className="bg-[#121212] border border-gray-800 rounded-3xl p-6 space-y-5 shadow-xl">
          <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">
            Resumen en Vivo del Ingreso
          </h3>

          <div className="space-y-4">
            {/* Kilos Netos */}
            <div className="bg-black/50 border border-gray-800 rounded-2xl p-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                Kilos Netos Totales
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-mono font-black text-white">
                  {kgNetosTotales.toFixed(2)}
                </span>
                <span className="text-sm font-bold text-gray-500">kg</span>
              </div>
              <span className="text-[11px] text-gray-500 block mt-1">
                {modoManual ? 'Ingreso directo manual' : `${cajones.length} cajones pesados (tara: ${config.tara_kg}kg c/u)`}
              </span>
            </div>

            {/* Costo por Kilo Resultante */}
            <div className="bg-gradient-to-br from-green-500/10 to-transparent border border-green-500/30 rounded-2xl p-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-green-400 block mb-1">
                Costo Resultante por Kg
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-mono font-black text-green-300">
                  ${costoPorKg.toLocaleString('es-AR')}
                </span>
                <span className="text-sm font-bold text-green-500">/ kg</span>
              </div>
              <span className="text-[11px] text-green-400/70 block mt-1">
                Costo total: ${Number(costoTotal || 0).toLocaleString('es-AR')} ÷ {kgNetosTotales.toFixed(2)} kg
              </span>
            </div>

            {/* Ficha técnica rápida del producto seleccionado */}
            <div className="bg-black/30 border border-gray-800/60 rounded-2xl p-4 space-y-2 text-xs">
              <div className="flex justify-between items-center text-gray-400">
                <span>Producto seleccionado:</span>
                <span className="font-bold text-white">{producto || '—'}</span>
              </div>
              <div className="flex justify-between items-center text-gray-400">
                <span>Proveedor:</span>
                <span className="font-medium text-white">{proveedor || '—'}</span>
              </div>
              <div className="flex justify-between items-center text-gray-400">
                <span>Tara aplicada por cajón:</span>
                <span className="font-mono text-amber-300">{config.tara_kg} kg</span>
              </div>
            </div>
          </div>
        </div>

        {/* Guía informativa de persistencia */}
        <div className="bg-[#101010] border border-gray-800/80 rounded-2xl p-4 text-xs text-gray-400 space-y-2">
          <p className="font-bold text-gray-300 flex items-center gap-1.5">
            <CheckCircle2 size={14} className="text-green-400" />
            Sin datos en localStorage
          </p>
          <p className="text-[11px] leading-relaxed">
            Cada ingreso se envía inmediatamente al Google Sheet mediante la acción <code className="text-green-400 font-mono">crearIngreso</code>. El Sheet actualiza el stock en depósito, calcula el nuevo costo de reposición y audita el movimiento.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PESTAÑA 2: STOCK EN KILOS (getStock + registrarSalida + getMovimientos)
// ─────────────────────────────────────────────────────────────────────────────
function StockKgTab({ config }) {
  const [stockList, setStockList] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState('');

  // Modal de registrar salida (CASA / MERMA / AJUSTE)
  const [salidaModal, setSalidaModal] = useState(null); // { open, producto, tipo: 'CASA'|'MERMA'|'AJUSTE', kg, nota, stockActual }
  const [enviandoSalida, setEnviandoSalida] = useState(false);
  const [errorSalida, setErrorSalida] = useState(null);

  // Modal de Historial de Movimientos de un producto
  const [movimientosModal, setMovimientosModal] = useState(null); // { open, producto, items: [], cargando }

  const cargarStock = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await apiGetStock();
      if (res && res.ok && Array.isArray(res.productos)) {
        setStockList(res.productos);
      } else if (res && res.error) {
        setError(res.error);
      }
    } catch (e) {
      setError(e.message || 'Error cargando stock desde el Sheet');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarStock();
  }, []);

  const stockFiltrado = useMemo(() => {
    const q = norm(busqueda);
    if (!q) return stockList;
    return stockList.filter(p => norm(p.producto).includes(q));
  }, [stockList, busqueda]);

  // Manejo de salida manual (CASA / MERMA / AJUSTE)
  const handleConfirmarSalida = async (e) => {
    e.preventDefault();
    if (!salidaModal) return;
    const kgNum = parseFloat(salidaModal.kg);
    if (isNaN(kgNum) || kgNum <= 0) {
      setErrorSalida('Ingresá una cantidad de kilos válida.');
      return;
    }

    setEnviandoSalida(true);
    setErrorSalida(null);

    try {
      const res = await apiRegistrarSalida({
        producto: salidaModal.producto,
        tipo: salidaModal.tipo,
        kg: kgNum,
        nota: salidaModal.nota || ''
      });

      if (res && res.ok) {
        setSalidaModal(null);
        await cargarStock(); // Refrescar tabla de stock
      } else {
        setErrorSalida(res?.error || 'No se pudo registrar la salida en el Sheet.');
      }
    } catch (err) {
      setErrorSalida(err.message || 'Error de red al registrar la salida.');
    } finally {
      setEnviandoSalida(false);
    }
  };

  // Abrir historial de movimientos de un producto
  const verMovimientosProducto = async (productoNombre) => {
    setMovimientosModal({ open: true, producto: productoNombre, items: [], cargando: true });
    try {
      const res = await apiGetMovimientos(productoNombre, 30);
      if (res && res.ok && Array.isArray(res.movimientos)) {
        setMovimientosModal({ open: true, producto: productoNombre, items: res.movimientos, cargando: false });
      } else {
        setMovimientosModal({ open: true, producto: productoNombre, items: [], cargando: false, error: res?.error });
      }
    } catch (e) {
      setMovimientosModal({ open: true, producto: productoNombre, items: [], cargando: false, error: e.message });
    }
  };

  return (
    <div className="space-y-5">
      {/* Barra superior de acciones */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#121212] border border-gray-800 p-4 rounded-2xl">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3.5 top-3 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar por producto..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full bg-black/60 border border-gray-700 focus:border-green-500 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-gray-500 outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={cargarStock}
            disabled={cargando}
            className="px-3.5 py-2 rounded-xl bg-gray-800 hover:bg-gray-750 text-gray-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
            <span>Refrescar Stock</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
          <AlertCircle size={16} />
          <span>Error al leer stock: {error}</span>
        </div>
      )}

      {/* Tabla de Stock */}
      <div className="bg-[#121212] border border-gray-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-black/40 border-b border-gray-800 text-gray-400 font-bold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Producto</th>
                <th className="py-3 px-4 text-right">En Depósito</th>
                <th className="py-3 px-4 text-right">Comprometido</th>
                <th className="py-3 px-4 text-right">Vendible</th>
                <th className="py-3 px-4 text-right">Último Costo/Kg</th>
                <th className="py-3 px-4">Último Ingreso</th>
                <th className="py-3 px-4 text-center">Acciones de Salida</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60 font-medium">
              {cargando && stockList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-500">
                    <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-green-500" />
                    <span>Cargando stock en kg desde Google Sheets...</span>
                  </td>
                </tr>
              ) : stockFiltrado.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-500">
                    No se encontraron productos en el stock.
                  </td>
                </tr>
              ) : (
                stockFiltrado.map((item, idx) => {
                  const vendible = Number(item.vendible !== undefined ? item.vendible : (item.en_deposito - item.comprometido));
                  const esSinStock = vendible <= 0;

                  return (
                    <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3.5 px-4 font-bold text-white">
                        <button
                          type="button"
                          onClick={() => verMovimientosProducto(item.producto)}
                          className="hover:text-green-400 hover:underline text-left cursor-pointer flex items-center gap-1.5"
                          title="Ver historial de movimientos"
                        >
                          <span>{item.producto}</span>
                          <FileText size={12} className="text-gray-500" />
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-gray-200">
                        {Number(item.en_deposito || 0).toFixed(2)} kg
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-amber-400">
                        {Number(item.comprometido || 0).toFixed(2)} kg
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono">
                        <span className={`px-2 py-0.5 rounded-md font-black ${
                          esSinStock ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'
                        }`}>
                          {vendible.toFixed(2)} kg
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-gray-300">
                        ${Number(item.costo_kg_ultimo || 0).toLocaleString('es-AR')}
                      </td>
                      <td className="py-3.5 px-4 text-gray-400 text-[11px]">
                        {item.ultimo_ingreso || '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setSalidaModal({
                              open: true,
                              producto: item.producto,
                              tipo: 'CASA',
                              kg: '',
                              nota: '',
                              stockActual: item.en_deposito
                            })}
                            className="px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer"
                            title="Consumo personal (Casa)"
                          >
                            Casa
                          </button>
                          <button
                            type="button"
                            onClick={() => setSalidaModal({
                              open: true,
                              producto: item.producto,
                              tipo: 'MERMA',
                              kg: '',
                              nota: '',
                              stockActual: item.en_deposito
                            })}
                            className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer"
                            title="Merma (Tirar / Regalar)"
                          >
                            Merma
                          </button>
                          <button
                            type="button"
                            onClick={() => setSalidaModal({
                              open: true,
                              producto: item.producto,
                              tipo: 'AJUSTE',
                              kg: '',
                              nota: '',
                              stockActual: item.en_deposito
                            })}
                            className="px-2 py-1 bg-gray-700/40 hover:bg-gray-700 text-gray-300 border border-gray-600 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer"
                            title="Ajuste manual de stock"
                          >
                            Ajuste
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: REGISTRAR SALIDA (CASA / MERMA / AJUSTE) */}
      {salidaModal?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#161616] border border-gray-700 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h3 className="text-sm font-black uppercase text-white flex items-center gap-2">
                <span>Registrar Salida:</span>
                <span className={`px-2 py-0.5 rounded text-xs ${
                  salidaModal.tipo === 'CASA' ? 'bg-blue-500/20 text-blue-300' :
                  salidaModal.tipo === 'MERMA' ? 'bg-rose-500/20 text-rose-300' : 'bg-gray-700 text-gray-300'
                }`}>
                  {salidaModal.tipo}
                </span>
              </h3>
              <button onClick={() => setSalidaModal(null)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmarSalida} className="space-y-4 text-xs">
              <div>
                <span className="text-gray-400">Producto:</span>
                <p className="text-sm font-black text-white">{salidaModal.producto}</p>
                <span className="text-[11px] text-gray-500 font-mono">
                  En depósito actual: {Number(salidaModal.stockActual || 0).toFixed(2)} kg
                </span>
              </div>

              {salidaModal.tipo === 'CASA' && (
                <div className="bg-blue-500/10 border border-blue-500/20 p-2.5 rounded-xl text-blue-300 text-[11px]">
                  ℹ️ Tope configurado para Casa: <strong>{config.tope_casa_kg} kg</strong>
                </div>
              )}

              <div>
                <label className="block text-gray-300 font-bold uppercase mb-1">
                  Kilos a Descontar *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.001"
                    placeholder="0.000"
                    value={salidaModal.kg}
                    onChange={(e) => setSalidaModal({ ...salidaModal, kg: e.target.value })}
                    className="w-full bg-black border border-gray-700 focus:border-green-500 rounded-xl px-3 py-2 text-base font-mono font-black text-white outline-none"
                    required
                    autoFocus
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-gray-500 font-bold">kg</span>
                </div>
              </div>

              <div>
                <label className="block text-gray-300 font-bold uppercase mb-1">
                  Nota / Motivo
                </label>
                <input
                  type="text"
                  placeholder="Ej: Para el fin de semana, bolsa pinchada, etc."
                  value={salidaModal.nota}
                  onChange={(e) => setSalidaModal({ ...salidaModal, nota: e.target.value })}
                  className="w-full bg-black border border-gray-700 focus:border-green-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              {errorSalida && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-[11px]">
                  {errorSalida}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSalidaModal(null)}
                  className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold rounded-xl transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={enviandoSalida}
                  className="flex-[2] py-2.5 bg-green-500 hover:bg-green-400 text-black font-black uppercase rounded-xl transition-all shadow-lg shadow-green-500/20 cursor-pointer disabled:opacity-50"
                >
                  {enviandoSalida ? 'Registrando...' : 'Confirmar Salida'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: HISTORIAL DE MOVIMIENTOS POR PRODUCTO */}
      {movimientosModal?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#161616] border border-gray-700 rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <div>
                <h3 className="text-sm font-black uppercase text-white flex items-center gap-2">
                  <FileText size={16} className="text-green-400" />
                  Movimientos de Auditoría
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">{movimientosModal.producto}</p>
              </div>
              <button onClick={() => setMovimientosModal(null)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 text-xs">
              {movimientosModal.cargando ? (
                <div className="py-12 text-center text-gray-500">
                  <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-green-500" />
                  <span>Cargando movimientos...</span>
                </div>
              ) : movimientosModal.items.length === 0 ? (
                <div className="py-12 text-center text-gray-500">
                  No hay movimientos registrados para este producto todavía.
                </div>
              ) : (
                <div className="divide-y divide-gray-800/80">
                  {movimientosModal.items.map((mov, i) => (
                    <div key={i} className="py-2.5 flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                            mov.tipo === 'INGRESO' ? 'bg-green-500/20 text-green-400' :
                            mov.tipo === 'CASA' ? 'bg-blue-500/20 text-blue-300' :
                            mov.tipo === 'MERMA' ? 'bg-rose-500/20 text-rose-300' : 'bg-gray-700 text-gray-300'
                          }`}>
                            {mov.tipo}
                          </span>
                          <span className="font-bold text-white font-mono">{mov.kg} kg</span>
                        </div>
                        {mov.nota && <p className="text-[11px] text-gray-400 mt-0.5">{mov.nota}</p>}
                      </div>
                      <span className="text-[10px] text-gray-500 font-mono whitespace-nowrap">
                        {mov.fecha || mov.timestamp || '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PESTAÑA 3: PRECIOS POR REPOSICIÓN (getPreciosSugeridos + setMargen + publicarPrecios)
// ─────────────────────────────────────────────────────────────────────────────
function PreciosSugeridosTab({ config, productosCostos }) {
  const [preciosList, setPreciosList] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  // Margen editable temporal { [producto]: margen_pct }
  const [margenesEditados, setMargenesEditados] = useState({});
  const [guardandoMargen, setGuardandoMargen] = useState({});

  // Modal de resumen de cambios antes de publicar
  const [modalPublicar, setModalPublicar] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [publicarExito, setPublicarExito] = useState(null);
  const [publicarError, setPublicarError] = useState(null);

  const cargarPreciosSugeridos = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await apiGetPreciosSugeridos();
      if (res && res.ok && Array.isArray(res.productos)) {
        setPreciosList(res.productos);
      } else if (res && res.error) {
        setError(res.error);
      }
    } catch (e) {
      setError(e.message || 'Error cargando precios sugeridos');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarPreciosSugeridos();
  }, []);

  // Calcular precio sugerido redondeado al múltiplo configurable (sin decimales)
  const calcularPrecioSugerido = (costoUltimo, margenPct) => {
    const costo = Number(costoUltimo) || 0;
    const margen = Number(margenPct) || 0;
    const mult = Number(config.redondeo) || 50;
    if (costo <= 0) return 0;
    const precioBase = costo * (1 + margen / 100);
    return Math.round(precioBase / mult) * mult;
  };

  // Guardar margen al salir del input o Enter
  const handleGuardarMargen = async (producto, nuevoMargen) => {
    const mNum = parseFloat(nuevoMargen);
    if (isNaN(mNum)) return;

    setGuardandoMargen(prev => ({ ...prev, [producto]: true }));
    try {
      const res = await apiSetMargen(producto, mNum);
      if (res && res.ok) {
        // Actualizar lista local
        setPreciosList(prev => prev.map(p => {
          if (p.producto === producto) {
            const sug = calcularPrecioSugerido(p.costo_kg_ultimo, mNum);
            return { ...p, margen_pct: mNum, precio_sugerido: sug };
          }
          return p;
        }));
      } else {
        alert(res?.error || 'No se pudo guardar el margen en el Sheet');
      }
    } catch (e) {
      alert(`Error al guardar margen: ${e.message}`);
    } finally {
      setGuardandoMargen(prev => ({ ...prev, [producto]: false }));
    }
  };

  // Resumen de cambios para el modal de publicación
  const cambiosDePrecio = useMemo(() => {
    return preciosList.map(p => {
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
  }, [preciosList, margenesEditados, config.redondeo]);

  const productosQueCambian = useMemo(() => {
    return cambiosDePrecio.filter(c => c.cambia);
  }, [cambiosDePrecio]);

  // Ejecutar publicación
  const handleConfirmarPublicacion = async () => {
    setPublicando(true);
    setPublicarError(null);
    setPublicarExito(null);

    // Armar el payload: origen 'mercaderia', solo nombre y precio
    const prodsParaPublicar = preciosList.map(p => {
      const margenActual = margenesEditados[p.producto] !== undefined ? margenesEditados[p.producto] : p.margen_pct;
      const precioFinal = calcularPrecioSugerido(p.costo_kg_ultimo, margenActual);
      return {
        nombre: p.producto,
        precio: precioFinal,
      };
    });

    const payload = {
      origen: 'mercaderia',
      productos: prodsParaPublicar
    };

    try {
      const res = await apiPublicarPrecios(payload);
      if (res && res.ok) {
        setPublicarExito('¡Precios publicados con éxito en la tienda y guardados en HistorialPrecios!');
        await cargarPreciosSugeridos();
        setTimeout(() => {
          setModalPublicar(false);
          setPublicarExito(null);
        }, 2500);
      } else {
        setPublicarError(res?.error || 'El Apps Script rechazó la publicación.');
      }
    } catch (e) {
      setPublicarError(e.message || 'Error de red al publicar precios.');
    } finally {
      setPublicando(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Barra superior de acciones */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#121212] border border-gray-800 p-4 rounded-2xl">
        <div>
          <h2 className="text-sm font-black uppercase text-white tracking-wider flex items-center gap-2">
            <DollarSign size={16} className="text-green-400" /> Precios Sugeridos por Costo de Reposición
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Margen % editable en vivo · Redondeo a múltiplos de ${config.redondeo}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={cargarPreciosSugeridos}
            disabled={cargando}
            className="px-3.5 py-2 rounded-xl bg-gray-800 hover:bg-gray-750 text-gray-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
            <span>Recargar</span>
          </button>

          <button
            onClick={() => setModalPublicar(true)}
            disabled={preciosList.length === 0}
            className="px-4 py-2 rounded-xl bg-green-500 hover:bg-green-400 text-black text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-green-500/20 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
          >
            <Check size={14} />
            <span>Publicar Precios ({productosQueCambian.length} cambios)</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
          <AlertCircle size={16} />
          <span>Error al leer precios sugeridos: {error}</span>
        </div>
      )}

      {/* Tabla de Precios */}
      <div className="bg-[#121212] border border-gray-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-black/40 border-b border-gray-800 text-gray-400 font-bold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Producto</th>
                <th className="py-3 px-4 text-right">Costo Último</th>
                <th className="py-3 px-4 text-center">Margen %</th>
                <th className="py-3 px-4 text-right">Precio Sugerido</th>
                <th className="py-3 px-4 text-right">Precio Publicado</th>
                <th className="py-3 px-4 text-right">Diferencia</th>
                <th className="py-3 px-4 text-right">Stock Vendible</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60 font-medium">
              {cargando && preciosList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-500">
                    <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-green-500" />
                    <span>Cargando precios sugeridos desde Google Sheets...</span>
                  </td>
                </tr>
              ) : preciosList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-500">
                    No hay productos en la lista de precios sugeridos.
                  </td>
                </tr>
              ) : (
                preciosList.map((item, idx) => {
                  const margenVal = margenesEditados[item.producto] !== undefined
                    ? margenesEditados[item.producto]
                    : item.margen_pct;

                  const sugerido = calcularPrecioSugerido(item.costo_kg_ultimo, margenVal);
                  const publicado = Number(item.precio_publicado || 0);
                  const dif = sugerido - publicado;

                  return (
                    <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3.5 px-4 font-bold text-white">
                        {item.producto}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-gray-300">
                        ${Number(item.costo_kg_ultimo || 0).toLocaleString('es-AR')}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="inline-flex items-center gap-1 bg-black/60 border border-gray-700 rounded-lg px-2 py-1">
                          <input
                            type="number"
                            step="1"
                            value={margenVal}
                            onChange={(e) => setMargenesEditados({ ...margenesEditados, [item.producto]: e.target.value })}
                            onBlur={() => handleGuardarMargen(item.producto, margenVal)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleGuardarMargen(item.producto, margenVal);
                              }
                            }}
                            className="w-12 bg-transparent text-center font-mono font-bold text-white outline-none"
                          />
                          <span className="text-gray-500 font-bold">%</span>
                          {guardandoMargen[item.producto] && (
                            <RefreshCw size={10} className="animate-spin text-green-400" />
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-black text-green-400">
                        ${sugerido.toLocaleString('es-AR')}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-gray-400">
                        ${publicado.toLocaleString('es-AR')}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono">
                        {dif === 0 ? (
                          <span className="text-gray-500">Igual</span>
                        ) : dif > 0 ? (
                          <span className="text-emerald-400 font-bold flex items-center justify-end gap-0.5">
                            <TrendingUp size={12} /> +${dif}
                          </span>
                        ) : (
                          <span className="text-rose-400 font-bold flex items-center justify-end gap-0.5">
                            <TrendingDown size={12} /> -${Math.abs(dif)}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-gray-400">
                        {item.vendible !== undefined ? `${Number(item.vendible).toFixed(1)} kg` : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: RESUMEN DE CAMBIOS ANTES DE PUBLICAR */}
      {modalPublicar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#161616] border border-gray-700 rounded-3xl max-w-xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <div>
                <h3 className="text-sm font-black uppercase text-white flex items-center gap-2">
                  <DollarSign size={16} className="text-green-400" />
                  Confirmar Publicación de Precios
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Resumen de precios que se actualizarán en la tienda online y Google Sheets
                </p>
              </div>
              <button onClick={() => setModalPublicar(false)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
              {productosQueCambian.length === 0 ? (
                <div className="py-10 text-center text-gray-400 bg-black/30 rounded-2xl border border-gray-800 p-6">
                  <CheckCircle2 size={24} className="mx-auto mb-2 text-green-400" />
                  <p className="font-bold text-white">Todos los precios sugeridos coinciden con los publicados actualmente.</p>
                  <p className="text-gray-500 text-[11px] mt-1">Podés forzar la publicación para reconfirmar el catálogo.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                    {productosQueCambian.length} {productosQueCambian.length === 1 ? 'producto cambiará' : 'productos cambiarán'} de precio:
                  </span>
                  <div className="divide-y divide-gray-800/80 bg-black/40 border border-gray-800 rounded-2xl p-3">
                    {productosQueCambian.map((c, i) => (
                      <div key={i} className="py-2 flex items-center justify-between gap-3">
                        <span className="font-bold text-white">{c.producto}</span>
                        <div className="flex items-center gap-2 font-mono">
                          <span className="text-gray-500 line-through">${c.precio_publicado}</span>
                          <ArrowRight size={12} className="text-gray-400" />
                          <span className="font-black text-green-400">${c.precio_sugerido}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            c.diferencia > 0 ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                          }`}>
                            {c.diferencia > 0 ? `+${c.difPct}%` : `${c.difPct}%`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {publicarError && (
                <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
                  {publicarError}
                </div>
              )}

              {publicarExito && (
                <div className="p-3.5 rounded-xl bg-green-500/10 border border-green-500/30 text-green-300 text-xs">
                  {publicarExito}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-3 border-t border-gray-800">
              <button
                type="button"
                onClick={() => setModalPublicar(false)}
                className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold rounded-xl transition-all cursor-pointer"
              >
                Volver atrás
              </button>
              <button
                type="button"
                onClick={handleConfirmarPublicacion}
                disabled={publicando}
                className="flex-[2] py-3 bg-green-500 hover:bg-green-400 text-black font-black uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-green-500/20 cursor-pointer disabled:opacity-50"
              >
                {publicando ? 'Publicando en Google Sheets...' : 'Confirmar y Publicar en Tienda'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PESTAÑA 4: HISTORIAL DE INGRESOS (getIngresos)
// ─────────────────────────────────────────────────────────────────────────────
function HistorialIngresosTab() {
  const [ingresos, setIngresos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const cargarIngresos = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await apiGetIngresos(null, 50);
      if (res && res.ok && Array.isArray(res.ingresos)) {
        setIngresos(res.ingresos);
      } else if (res && res.error) {
        setError(res.error);
      }
    } catch (e) {
      setError(e.message || 'Error cargando historial de ingresos');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarIngresos();
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between bg-[#121212] border border-gray-800 p-4 rounded-2xl">
        <div>
          <h2 className="text-sm font-black uppercase text-white tracking-wider flex items-center gap-2">
            <History size={16} className="text-green-400" /> Registro de Compras e Ingresos
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Últimos ingresos registrados con detalle de kilos y costo unitario
          </p>
        </div>
        <button
          onClick={cargarIngresos}
          disabled={cargando}
          className="px-3.5 py-2 rounded-xl bg-gray-800 hover:bg-gray-750 text-gray-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
          <span>Refrescar</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
          {error}
        </div>
      )}

      <div className="bg-[#121212] border border-gray-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-black/40 border-b border-gray-800 text-gray-400 font-bold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Fecha / Hora</th>
                <th className="py-3 px-4">Producto</th>
                <th className="py-3 px-4">Proveedor</th>
                <th className="py-3 px-4 text-right">Kg Netos</th>
                <th className="py-3 px-4 text-right">Costo Total</th>
                <th className="py-3 px-4 text-right">Costo / Kg</th>
                <th className="py-3 px-4 text-center">Cajones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60 font-medium">
              {cargando && ingresos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-500">
                    <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-green-500" />
                    <span>Cargando ingresos desde el Sheet...</span>
                  </td>
                </tr>
              ) : ingresos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-500">
                    No hay ingresos registrados aún.
                  </td>
                </tr>
              ) : (
                ingresos.map((ing, i) => (
                  <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3.5 px-4 font-mono text-gray-400 text-[11px]">
                      {ing.fecha || ing.timestamp || '—'}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-white">
                      {ing.producto}
                    </td>
                    <td className="py-3.5 px-4 text-gray-300">
                      {ing.proveedor || 'Sin especificar'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-amber-300">
                      {Number(ing.kg_netos || 0).toFixed(2)} kg
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-gray-200">
                      ${Number(ing.costo_total || 0).toLocaleString('es-AR')}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-black text-green-400">
                      ${Number(ing.costo_kg || 0).toLocaleString('es-AR')}
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono text-gray-400 text-[11px]">
                      {Array.isArray(ing.cajones) ? `${ing.cajones.length} cj` : '1'}
                    </td>
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
// PESTAÑA 5: CONFIGURACIÓN GLOBAL (getConfig + setConfig)
// ─────────────────────────────────────────────────────────────────────────────
function ConfiguracionTab({ config, onConfigActualizada, cargando }) {
  const [valores, setValores] = useState({
    tara_kg: config.tara_kg || 2.0,
    redondeo: config.redondeo || 50,
    tope_casa_kg: config.tope_casa_kg || 30,
    empaque_chica: config.empaque_chica || 50,
    empaque_grande: config.empaque_grande || 350
  });

  const [guardandoClave, setGuardandoClave] = useState(null);
  const [exitoClave, setExitoClave] = useState(null);
  const [errorClave, setErrorClave] = useState(null);

  useEffect(() => {
    setValores({
      tara_kg: config.tara_kg,
      redondeo: config.redondeo,
      tope_casa_kg: config.tope_casa_kg,
      empaque_chica: config.empaque_chica,
      empaque_grande: config.empaque_grande
    });
  }, [config]);

  const handleGuardarCampo = async (clave) => {
    setGuardandoClave(clave);
    setErrorClave(null);
    setExitoClave(null);

    const val = Number(valores[clave]);
    if (isNaN(val)) {
      setErrorClave('Ingresá un valor numérico válido.');
      setGuardandoClave(null);
      return;
    }

    try {
      const res = await apiSetConfig(clave, val);
      if (res && res.ok) {
        setExitoClave(clave);
        onConfigActualizada();
        setTimeout(() => setExitoClave(null), 3000);
      } else {
        setErrorClave(res?.error || 'No se pudo guardar la configuración en el Sheet.');
      }
    } catch (e) {
      setErrorClave(e.message || 'Error de red al guardar.');
    } finally {
      setGuardandoClave(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-[#121212] border border-gray-800 rounded-3xl p-6 sm:p-7 shadow-xl space-y-6">
        <div className="border-b border-gray-800 pb-3">
          <h2 className="text-sm font-black uppercase text-green-400 tracking-wider flex items-center gap-2">
            <Sliders size={16} /> Configuración de Operaciones
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Parámetros globales guardados en la pestaña Config del Google Sheet. Celular, PC y producción comparten estos valores en tiempo real.
          </p>
        </div>

        {errorClave && (
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
            {errorClave}
          </div>
        )}

        <div className="space-y-5">
          {/* Tara global en kg */}
          <div className="bg-black/40 border border-gray-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold uppercase text-white block">Tara global de cajón</span>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Kilos a descontar automáticamente de cada pesada de cajón en el ingreso.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-24">
                <input
                  type="number"
                  step="0.05"
                  value={valores.tara_kg}
                  onChange={(e) => setValores({ ...valores, tara_kg: e.target.value })}
                  className="w-full bg-black border border-gray-700 focus:border-green-500 rounded-xl px-2.5 py-1.5 text-sm font-mono font-bold text-white outline-none"
                />
                <span className="absolute right-2 top-2 text-[10px] text-gray-500">kg</span>
              </div>
              <button
                type="button"
                onClick={() => handleGuardarCampo('tara_kg')}
                disabled={guardandoClave === 'tara_kg'}
                className="px-3 py-1.5 bg-gray-800 hover:bg-green-600 hover:text-black text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                {guardandoClave === 'tara_kg' ? '...' : exitoClave === 'tara_kg' ? '✓' : 'Guardar'}
              </button>
            </div>
          </div>

          {/* Múltiplo de redondeo de precios */}
          <div className="bg-black/40 border border-gray-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold uppercase text-white block">Múltiplo de Redondeo</span>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Los precios sugeridos se redondean a este múltiplo (default $50, sin decimales).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-24">
                <span className="absolute left-2.5 top-1.5 text-xs text-gray-500">$</span>
                <input
                  type="number"
                  step="10"
                  value={valores.redondeo}
                  onChange={(e) => setValores({ ...valores, redondeo: e.target.value })}
                  className="w-full bg-black border border-gray-700 focus:border-green-500 rounded-xl pl-6 pr-2 py-1.5 text-sm font-mono font-bold text-white outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => handleGuardarCampo('redondeo')}
                disabled={guardandoClave === 'redondeo'}
                className="px-3 py-1.5 bg-gray-800 hover:bg-green-600 hover:text-black text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                {guardandoClave === 'redondeo' ? '...' : exitoClave === 'redondeo' ? '✓' : 'Guardar'}
              </button>
            </div>
          </div>

          {/* Tope de consumo personal (Casa) */}
          <div className="bg-black/40 border border-gray-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold uppercase text-white block">Tope Consumo Casa</span>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Límite en kilos de consumo personal permitido para alertar en la UI.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-24">
                <input
                  type="number"
                  step="1"
                  value={valores.tope_casa_kg}
                  onChange={(e) => setValores({ ...valores, tope_casa_kg: e.target.value })}
                  className="w-full bg-black border border-gray-700 focus:border-green-500 rounded-xl px-2.5 py-1.5 text-sm font-mono font-bold text-white outline-none"
                />
                <span className="absolute right-2 top-2 text-[10px] text-gray-500">kg</span>
              </div>
              <button
                type="button"
                onClick={() => handleGuardarCampo('tope_casa_kg')}
                disabled={guardandoClave === 'tope_casa_kg'}
                className="px-3 py-1.5 bg-gray-800 hover:bg-green-600 hover:text-black text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                {guardandoClave === 'tope_casa_kg' ? '...' : exitoClave === 'tope_casa_kg' ? '✓' : 'Guardar'}
              </button>
            </div>
          </div>

          {/* Costos de empaques (informativos) */}
          <div className="border-t border-gray-800/80 pt-4 space-y-4">
            <span className="text-[11px] font-black uppercase text-gray-400 tracking-wider block">
              Costos de Empaque (Informativos)
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-black/40 border border-gray-800 rounded-2xl p-3.5 space-y-2">
                <span className="text-xs text-gray-300 font-bold block">Bolsa Chica ($50)</span>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1.5 text-xs text-gray-500">$</span>
                    <input
                      type="number"
                      value={valores.empaque_chica}
                      onChange={(e) => setValores({ ...valores, empaque_chica: e.target.value })}
                      className="w-full bg-black border border-gray-700 rounded-xl pl-6 pr-2 py-1.5 text-xs font-mono font-bold text-white outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleGuardarCampo('empaque_chica')}
                    disabled={guardandoClave === 'empaque_chica'}
                    className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-xs font-bold rounded-xl"
                  >
                    Guardar
                  </button>
                </div>
              </div>

              <div className="bg-black/40 border border-gray-800 rounded-2xl p-3.5 space-y-2">
                <span className="text-xs text-gray-300 font-bold block">Bolsa Grande ($350)</span>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1.5 text-xs text-gray-500">$</span>
                    <input
                      type="number"
                      value={valores.empaque_grande}
                      onChange={(e) => setValores({ ...valores, empaque_grande: e.target.value })}
                      className="w-full bg-black border border-gray-700 rounded-xl pl-6 pr-2 py-1.5 text-xs font-mono font-bold text-white outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleGuardarCampo('empaque_grande')}
                    disabled={guardandoClave === 'empaque_grande'}
                    className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-xs font-bold rounded-xl"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-gray-500 italic">
              * Los costos de empaque son informativos por ahora y no tocan precios de venta.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
