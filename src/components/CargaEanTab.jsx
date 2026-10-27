import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ScanBarcode, Plus, Trash2, Search, Check, AlertCircle, 
  ArrowLeft, RefreshCw, Sparkles, Tag, ShoppingCart, 
  AlertTriangle, DollarSign, Package, CheckCircle2, X, Store
} from 'lucide-react';
import { 
  apiBuscarPorEan, 
  apiSetEanProducto, 
  apiCrearProducto, 
  apiCrearIngreso 
} from '../utils/mercaderiaApi';
import { useGoogleSheets } from '../context/GoogleSheetsContext';

const SUBCATEGORIAS_OPCIONES = [
  'Almacén',
  'Galletitas',
  'Bebidas',
  'Snacks',
  'Golosinas',
  'Lácteos',
  'Limpieza',
  'Conservas',
  'Condimentos',
  'Fideos y Arroz',
  'Aceites y Vinagres',
  'Desayuno y Merienda',
  'Otros'
];

/**
 * Calcula el precio de venta sugerido con margen y redondeo a 50
 */
const calcularPrecioVentaSugerido = (costo, margen) => {
  const c = Number(costo) || 0;
  if (c <= 0) return 0;
  const m = Number(margen) || 70;
  const bruto = c * (1 + m / 100);
  return Math.round(bruto / 50) * 50;
};

export default function CargaEanTab({ onVolver, onProductoActualizado }) {
  const { productosCostos } = useGoogleSheets();

  // Estados del escáner
  const [eanInput, setEanInput] = useState('');
  const [modoCargaRapida, setModoCargaRapida] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState(null);
  const [ultimoEscaneado, setUltimoEscaneado] = useState(null); // Feedback de último producto encontrado
  const [toastFeedback, setToastFeedback] = useState(null);

  // Formulario de Alta para EAN no encontrado
  const [formAlta, setFormAlta] = useState(null);
  // formAlta: { ean, nombre, marca, subcategoria, costoUnitario, margen, cantidadInicial, guardando, error }
  const [duplicadoEncontrado, setDuplicadoEncontrado] = useState(null);

  // Lista de ingreso pendiente (lote escaneado)
  const [itemsIngreso, setItemsIngreso] = useState([]);
  // Cada item: { ean, nombre, marca, subcategoria, cantidad, costoUnitario, unidad: 'un', categoria: 'Almacén' }
  const [proveedorIngreso, setProveedorIngreso] = useState('');
  const [guardandoIngreso, setGuardandoIngreso] = useState(false);
  const [errorIngreso, setErrorIngreso] = useState(null);
  const [exitoIngreso, setExitoIngreso] = useState(null);

  const scanInputRef = useRef(null);

  // Autofoco continuo al input de escaneo
  const enfocarEan = () => {
    setTimeout(() => {
      if (scanInputRef.current && !formAlta) {
        scanInputRef.current.focus();
      }
    }, 60);
  };

  useEffect(() => {
    enfocarEan();
  }, [formAlta]);

  // Limpiar toast después de 3.5 segundos
  useEffect(() => {
    if (toastFeedback) {
      const timer = setTimeout(() => setToastFeedback(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toastFeedback]);

  // Totales del lote pendiente de ingreso
  const resumenIngreso = useMemo(() => {
    const totalItems = itemsIngreso.length;
    const totalUnidades = itemsIngreso.reduce((acc, it) => acc + (Number(it.cantidad) || 0), 0);
    const costoTotalLote = itemsIngreso.reduce((acc, it) => acc + ((Number(it.cantidad) || 0) * (Number(it.costoUnitario) || 0)), 0);
    return { totalItems, totalUnidades, costoTotalLote };
  }, [itemsIngreso]);

  // Manejador del escaneo / submit de EAN
  const procesarLecturaEan = async (e) => {
    if (e) e.preventDefault();
    const cleanEan = String(eanInput || '').trim().toUpperCase();
    if (!cleanEan) return;

    setErrorBusqueda(null);
    setBuscando(true);
    setUltimoEscaneado(null);
    setFormAlta(null);
    setDuplicadoEncontrado(null);

    try {
      const res = await apiBuscarPorEan({ ean: cleanEan });
      if (!res || res.ok === false) {
        throw new Error(res?.error || 'Error al buscar código EAN en el servidor');
      }

      if (res.encontrado) {
        // ── CASO A: EAN ENCONTRADO ───────────────────────────────────────────
        const prodData = {
          ean: cleanEan,
          nombre: res.producto || 'Producto',
          marca: res.marca || '',
          subcategoria: res.subcategoria || 'Almacén',
          unidad: res.unidad || 'un',
          categoria: res.categoria || 'Almacén',
          en_deposito: Number(res.en_deposito) || 0,
          vendible: Number(res.vendible) || 0,
        };
        setUltimoEscaneado(prodData);

        // Si está en modo carga rápida, sumar automáticamente 1 unidad al lote
        if (modoCargaRapida) {
          sumarAlIngreso(prodData, 1);
          setToastFeedback(`+1 unidad sumada a "${prodData.nombre}"`);
          setEanInput('');
          enfocarEan();
        }
      } else {
        // ── CASO B: EAN NO ENCONTRADO -> ABRIR FORMULARIO DE ALTA ───────────
        setFormAlta({
          ean: cleanEan,
          nombre: '',
          marca: '',
          subcategoria: 'Almacén',
          costoUnitario: '',
          margen: 70,
          cantidadInicial: 1,
          guardando: false,
          error: null,
        });
      }
    } catch (err) {
      setErrorBusqueda(err.message || 'Error de conexión al consultar EAN');
    } finally {
      setBuscando(false);
    }
  };

  // Agregar o incrementar producto en la lista de ingreso pendiente
  const sumarAlIngreso = (prod, cant = 1, costo = 0) => {
    setItemsIngreso(prev => {
      const idx = prev.findIndex(item => item.ean === prod.ean || (item.nombre.toLowerCase().trim() === prod.nombre.toLowerCase().trim()));
      if (idx !== -1) {
        const actualizados = [...prev];
        const prevItem = actualizados[idx];
        const nuevaCant = Number(prevItem.cantidad || 0) + Number(cant || 1);
        actualizados[idx] = {
          ...prevItem,
          cantidad: nuevaCant,
          costoUnitario: costo > 0 ? costo : prevItem.costoUnitario
        };
        return actualizados;
      } else {
        return [
          {
            ean: prod.ean,
            nombre: prod.nombre,
            marca: prod.marca || '',
            subcategoria: prod.subcategoria || 'Almacén',
            cantidad: Number(cant) || 1,
            costoUnitario: Number(costo) || 0,
            unidad: prod.unidad || 'un',
            categoria: prod.categoria || 'Almacén'
          },
          ...prev
        ];
      }
    });
  };

  // Verificar duplicados en tiempo real al escribir en el formulario de alta
  const verificarDuplicadoCatalogo = (nombre, marca) => {
    if (!nombre.trim()) {
      setDuplicadoEncontrado(null);
      return;
    }
    const n = nombre.trim().toLowerCase();
    const m = marca ? marca.trim().toLowerCase() : '';
    const match = (productosCostos || []).find(p => {
      const pNom = (p.nombre || p.producto || '').trim().toLowerCase();
      const pMarca = (p.marca || '').trim().toLowerCase();
      if (m) {
        return pNom === n && pMarca === m;
      }
      return pNom === n;
    });

    if (match) {
      setDuplicadoEncontrado(match);
    } else {
      setDuplicadoEncontrado(null);
    }
  };

  // Guardar alta de producto nuevo
  const handleGuardarAlta = async (e) => {
    e.preventDefault();
    if (!formAlta) return;

    const nombreLimpio = formAlta.nombre.trim();
    const costoNum = parseFloat(formAlta.costoUnitario);
    const cantNum = parseInt(formAlta.cantidadInicial, 10) || 1;

    if (!nombreLimpio) {
      setFormAlta(prev => ({ ...prev, error: 'El nombre del producto es obligatorio.' }));
      return;
    }
    if (isNaN(costoNum) || costoNum <= 0) {
      setFormAlta(prev => ({ ...prev, error: 'El costo unitario debe ser un valor mayor a $0.' }));
      return;
    }

    setFormAlta(prev => ({ ...prev, guardando: true, error: null }));

    try {
      // 1. Crear producto en catálogo (PanelCostos)
      const resCrear = await apiCrearProducto({
        producto: nombreLimpio,
        categoria: 'Almacén',
        unidad: 'un',
        margen_pct: Number(formAlta.margen) || 70,
        marca: formAlta.marca.trim(),
        subcategoria: formAlta.subcategoria,
        ean: formAlta.ean
      });

      if (!resCrear || resCrear.ok === false) {
        throw new Error(resCrear?.error || 'Error al dar de alta el producto en PanelCostos');
      }

      // 2. Asociar EAN
      const resEan = await apiSetEanProducto({
        ean: formAlta.ean,
        nombre: nombreLimpio,
        subcategoria: formAlta.subcategoria,
        unidad: 'un',
        marca: formAlta.marca.trim(),
      });

      if (!resEan || resEan.ok === false) {
        console.warn('Aviso al guardar EAN:', resEan?.error);
      }

      // 3. Sumar a la lista de ingreso pendiente
      sumarAlIngreso({
        ean: formAlta.ean,
        nombre: nombreLimpio,
        marca: formAlta.marca.trim(),
        subcategoria: formAlta.subcategoria,
        unidad: 'un',
        categoria: 'Almacén'
      }, cantNum, costoNum);

      setToastFeedback(`✅ ¡"${nombreLimpio}" creado y sumado con ${cantNum} un.!`);
      setFormAlta(null);
      setDuplicadoEncontrado(null);
      setEanInput('');
      if (onProductoActualizado) onProductoActualizado();
      enfocarEan();
    } catch (err) {
      setFormAlta(prev => ({ ...prev, guardando: false, error: err.message || 'Error al crear producto' }));
    }
  };

  // Asociar EAN a producto existente en caso de duplicado
  const handleAsociarEanAExistente = async () => {
    if (!formAlta || !duplicadoEncontrado) return;
    setFormAlta(prev => ({ ...prev, guardando: true, error: null }));

    try {
      const nombreExistente = duplicadoEncontrado.nombre || duplicadoEncontrado.producto;
      const resEan = await apiSetEanProducto({
        ean: formAlta.ean,
        nombre: nombreExistente,
        subcategoria: duplicadoEncontrado.subcategoria || formAlta.subcategoria,
        unidad: duplicadoEncontrado.unidad || 'un',
        marca: duplicadoEncontrado.marca || formAlta.marca,
      });

      if (!resEan || resEan.ok === false) {
        throw new Error(resEan?.error || 'No se pudo asociar el EAN al producto existente');
      }

      const cantNum = parseInt(formAlta.cantidadInicial, 10) || 1;
      const costoNum = parseFloat(formAlta.costoUnitario) || (duplicadoEncontrado.costo_kg_ultimo || duplicadoEncontrado.precioCajon || 0);

      sumarAlIngreso({
        ean: formAlta.ean,
        nombre: nombreExistente,
        marca: duplicadoEncontrado.marca || formAlta.marca,
        subcategoria: duplicadoEncontrado.subcategoria || formAlta.subcategoria,
        unidad: duplicadoEncontrado.unidad || 'un',
        categoria: 'Almacén'
      }, cantNum, costoNum);

      setToastFeedback(`✅ EAN asociado a "${nombreExistente}" y sumado al ingreso`);
      setFormAlta(null);
      setDuplicadoEncontrado(null);
      setEanInput('');
      enfocarEan();
    } catch (err) {
      setFormAlta(prev => ({ ...prev, guardando: false, error: err.message }));
    }
  };

  // Confirmar y registrar el lote completo de compras / ingresos
  const handleConfirmarIngresoLote = async () => {
    if (itemsIngreso.length === 0 || guardandoIngreso) return;

    setGuardandoIngreso(true);
    setErrorIngreso(null);
    setExitoIngreso(null);

    const pendientes = [...itemsIngreso];
    const errores = [];
    const exitosos = [];

    for (const item of pendientes) {
      try {
        const cant = Number(item.cantidad) || 1;
        const cTotal = Math.round((Number(item.costoUnitario) || 0) * cant);

        const res = await apiCrearIngreso({
          producto: item.nombre,
          proveedor: proveedorIngreso.trim() || 'Sin especificar',
          kg_netos: cant,
          costo_total: cTotal,
          categoria: 'Almacén',
          unidad: item.unidad || 'un',
        });

        if (res && res.ok) {
          exitosos.push(item);
        } else {
          errores.push(`${item.nombre}: ${res?.error || 'Error al guardar'}`);
        }
      } catch (err) {
        errores.push(`${item.nombre}: ${err.message || 'Error de red'}`);
      }
    }

    // Filtrar de la lista únicamente los que tuvieron éxito (conservar los que fallaron)
    setItemsIngreso(prev => prev.filter(it => !exitosos.some(ex => ex.ean === it.ean && ex.nombre === it.nombre)));

    if (errores.length > 0) {
      setErrorIngreso(`Fallaron ${errores.length} ingresos: ${errores.join(' | ')}. Los productos no guardados permanecen en la lista.`);
    } else {
      setExitoIngreso(`¡Ingreso de ${exitosos.length} productos (${resumenIngreso.totalUnidades} unidades) registrado exitosamente!`);
      setProveedorIngreso('');
      if (onProductoActualizado) onProductoActualizado();
    }

    setGuardandoIngreso(false);
    enfocarEan();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ── BARRA SUPERIOR CON ACCIÓN DE VOLVER Y TÍTULO ─────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#121212] border border-gray-800 p-4 rounded-2xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onVolver}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all cursor-pointer"
            title="Volver a tabla de productos"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
              <ScanBarcode className="text-green-400" size={20} />
              <span>Alta y Carga Rápida por Código de Barras (EAN)</span>
            </h2>
            <p className="text-xs text-gray-400">
              Escaneá con la lectora o ingresá el código para consultar stock, dar de alta y registrar compras de Almacén.
            </p>
          </div>
        </div>

        {/* Toggle de Modo Carga Rápida */}
        <label className="flex items-center gap-2.5 bg-black/40 border border-gray-700/60 px-3.5 py-2 rounded-xl cursor-pointer self-start sm:self-auto select-none">
          <input
            type="checkbox"
            checked={modoCargaRapida}
            onChange={(e) => setModoCargaRapida(e.target.checked)}
            className="w-4 h-4 accent-green-500 rounded cursor-pointer"
          />
          <span className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
            <Sparkles size={13} className="text-amber-400" />
            <span>Modo Carga Rápida (+1 ud al leer)</span>
          </span>
        </label>
      </div>

      {/* ── NOTIFICACIÓN TOAST FLOTANTE O FIJA ───────────────────────────── */}
      {toastFeedback && (
        <div className="p-3 bg-emerald-500/15 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs font-bold flex items-center justify-between shadow-lg shadow-emerald-950/20 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-400" />
            <span>{toastFeedback}</span>
          </div>
          <button onClick={() => setToastFeedback(null)} className="text-gray-400 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── ZONA DE ESCANEO ACTIVA ────────────────────────────────────────── */}
      <div className="bg-[#181d24] border border-gray-700/80 rounded-2xl p-5 shadow-xl space-y-4">
        <form onSubmit={procesarLecturaEan} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <div className="absolute left-3.5 top-3.5 text-gray-400 flex items-center gap-1">
              <ScanBarcode size={18} className={buscando ? 'animate-pulse text-green-400' : 'text-gray-400'} />
            </div>
            <input
              ref={scanInputRef}
              type="text"
              placeholder="Escaneá con la lectora o ingresá el código EAN y presioná Enter..."
              value={eanInput}
              onChange={(e) => setEanInput(e.target.value)}
              disabled={buscando}
              className="w-full bg-[#111827] border border-gray-600 focus:border-green-500 rounded-xl pl-11 pr-10 py-3 text-sm text-white placeholder-gray-500 outline-none transition-all font-mono font-bold shadow-inner"
            />
            {eanInput && (
              <button
                type="button"
                onClick={() => { setEanInput(''); enfocarEan(); }}
                className="absolute right-3.5 top-3.5 text-gray-400 hover:text-white cursor-pointer"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={!eanInput.trim() || buscando}
            className={`px-5 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-md ${
              !eanInput.trim() || buscando
                ? 'bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed'
                : 'bg-green-500 hover:bg-green-400 text-black cursor-pointer shadow-green-950/30'
            }`}
          >
            {buscando ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Buscando...</span>
              </>
            ) : (
              <>
                <Search size={14} />
                <span>Buscar EAN</span>
              </>
            )}
          </button>
        </form>

        {errorBusqueda && (
          <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2 animate-in fade-in">
            <AlertCircle size={15} className="shrink-0 text-red-400" />
            <span>{errorBusqueda}</span>
          </div>
        )}

        {/* ── TARJETA: PRODUCTO ENCONTRADO EN ESCANEO ────────────────────── */}
        {ultimoEscaneado && (
          <div className="bg-black/50 border border-green-500/30 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-green-500/15 border border-green-500/30 flex items-center justify-center text-green-400 text-xl font-bold">
                📦
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-white text-base">{ultimoEscaneado.nombre}</h3>
                  {ultimoEscaneado.marca && (
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-white/10 text-gray-300 px-2 py-0.5 rounded-md">
                      {ultimoEscaneado.marca}
                    </span>
                  )}
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-gray-800 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-md">
                    {ultimoEscaneado.subcategoria}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400 mt-1 font-mono">
                  <span>EAN: {ultimoEscaneado.ean}</span>
                  <span>·</span>
                  <span>En depósito: <strong className="text-white">{ultimoEscaneado.en_deposito}</strong> un</span>
                  <span>·</span>
                  <span>Vendible: <strong className="text-emerald-400">{ultimoEscaneado.vendible}</strong> un</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end md:self-auto">
              <button
                type="button"
                onClick={() => {
                  sumarAlIngreso(ultimoEscaneado, 1);
                  setToastFeedback(`+1 unidad sumada a "${ultimoEscaneado.nombre}"`);
                  enfocarEan();
                }}
                className="px-3.5 py-2 rounded-xl bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 text-green-300 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
              >
                <Plus size={14} />
                <span>Sumar +1 al ingreso</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── FORMULARIO DE ALTA (EAN NO ENCONTRADO) ────────────────────────── */}
      {formAlta && (
        <div className="bg-[#181d24] border border-amber-500/40 rounded-2xl p-6 shadow-2xl space-y-5 animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 text-lg font-bold">
                ✨
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Alta de Producto de Almacén</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  El código EAN <span className="font-mono font-bold text-amber-300">{formAlta.ean}</span> no está registrado. Completá los datos para darlo de alta.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setFormAlta(null); enfocarEan(); }}
              className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {formAlta.error && (
            <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
              <AlertCircle size={16} className="text-red-400 shrink-0" />
              <span>{formAlta.error}</span>
            </div>
          )}

          {/* Alerta de Duplicado si ya existe en catálogo */}
          {duplicadoEncontrado && (
            <div className="p-4 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold">
                    Ya existe un producto en catálogo con este nombre: "{duplicadoEncontrado.nombre || duplicadoEncontrado.producto}" {duplicadoEncontrado.marca ? `(${duplicadoEncontrado.marca})` : ''}.
                  </p>
                  <p className="text-[11px] text-amber-300/80 mt-0.5">
                    Podés asociar este código EAN al producto existente para no duplicar filas en el catálogo de Almacén.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleAsociarEanAExistente}
                disabled={formAlta.guardando}
                className="px-3 py-1.5 rounded-lg bg-amber-500 text-black font-black text-xs uppercase tracking-wider hover:bg-amber-400 transition-all cursor-pointer shadow-sm disabled:opacity-50"
              >
                Asociar EAN a producto existente
              </button>
            </div>
          )}

          <form onSubmit={handleGuardarAlta} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Código EAN (Readonly) */}
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">
                  Código EAN
                </label>
                <input
                  type="text"
                  value={formAlta.ean}
                  readOnly
                  className="w-full bg-black/40 border border-gray-700 rounded-xl px-3.5 py-2.5 text-xs text-amber-300 font-mono font-bold outline-none cursor-not-allowed"
                />
              </div>

              {/* Nombre (Obligatorio) */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-gray-200 uppercase tracking-wider mb-1">
                  Nombre del Producto <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ej: Galletitas Oreo 118g"
                  value={formAlta.nombre}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormAlta(prev => ({ ...prev, nombre: val }));
                    verificarDuplicadoCatalogo(val, formAlta.marca);
                  }}
                  disabled={formAlta.guardando}
                  required
                  className="w-full bg-[#111827] border border-gray-700 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 outline-none transition-colors"
                />
              </div>

              {/* Marca */}
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">
                  Marca
                </label>
                <input
                  type="text"
                  placeholder="Ej: Bagley / Mondelez"
                  value={formAlta.marca}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormAlta(prev => ({ ...prev, marca: val }));
                    verificarDuplicadoCatalogo(formAlta.nombre, val);
                  }}
                  disabled={formAlta.guardando}
                  className="w-full bg-[#111827] border border-gray-700 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 outline-none transition-colors"
                />
              </div>

              {/* Subcategoría */}
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">
                  Subcategoría
                </label>
                <select
                  value={formAlta.subcategoria}
                  onChange={(e) => setFormAlta(prev => ({ ...prev, subcategoria: e.target.value }))}
                  disabled={formAlta.guardando}
                  className="w-full bg-[#111827] border border-gray-700 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none transition-colors cursor-pointer"
                >
                  {SUBCATEGORIAS_OPCIONES.map(sub => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>
              </div>

              {/* Costo Unitario (Obligatorio > 0) */}
              <div>
                <label className="block text-xs font-bold text-gray-200 uppercase tracking-wider mb-1">
                  Costo Unitario ($) <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  placeholder="Ej: 1200"
                  value={formAlta.costoUnitario}
                  onChange={(e) => setFormAlta(prev => ({ ...prev, costoUnitario: e.target.value }))}
                  disabled={formAlta.guardando}
                  required
                  className="w-full bg-[#111827] border border-gray-700 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono placeholder-gray-500 outline-none transition-colors"
                />
              </div>

              {/* Margen % */}
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">
                  Margen (%)
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={formAlta.margen}
                  onChange={(e) => setFormAlta(prev => ({ ...prev, margen: e.target.value }))}
                  disabled={formAlta.guardando}
                  className="w-full bg-[#111827] border border-gray-700 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono outline-none transition-colors"
                />
              </div>

              {/* Cantidad Inicial a Ingresar */}
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">
                  Cantidad Inicial a Ingresar
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={formAlta.cantidadInicial}
                  onChange={(e) => setFormAlta(prev => ({ ...prev, cantidadInicial: e.target.value }))}
                  disabled={formAlta.guardando}
                  className="w-full bg-[#111827] border border-gray-700 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono outline-none transition-colors"
                />
              </div>

              {/* Precio de Venta Calculado (Informativo, redondeado a 50) */}
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Precio Venta Sugerido (Info)
                </label>
                <div className="bg-black/40 border border-white/5 rounded-xl px-3.5 py-2.5 flex items-center justify-between">
                  <span className="text-xs text-gray-400 font-mono">Redondeado a $50:</span>
                  <span className="text-base font-black font-mono text-emerald-400">
                    ${calcularPrecioVentaSugerido(formAlta.costoUnitario, formAlta.margen).toLocaleString('es-AR')}
                  </span>
                </div>
              </div>
            </div>

            {/* Botones de acción del formulario */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => { setFormAlta(null); enfocarEan(); }}
                disabled={formAlta.guardando}
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white text-xs font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={formAlta.guardando || !formAlta.nombre.trim() || Number(formAlta.costoUnitario) <= 0}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-black text-xs uppercase tracking-wider transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {formAlta.guardando ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Guardando producto...</span>
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    <span>Guardar y Sumar al Ingreso</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── LOTE DE INGRESO PENDIENTE (PRODUCTOS ESCANEADOS) ─────────────── */}
      <div className="bg-[#121212] border border-gray-800 rounded-2xl p-5 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-green-500/15 border border-green-500/30 flex items-center justify-center text-green-400 text-sm font-bold">
              <ShoppingCart size={16} />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase text-white tracking-wider flex items-center gap-2">
                <span>Lote de Ingreso Pendiente</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 font-bold">
                  {resumenIngreso.totalItems} {resumenIngreso.totalItems === 1 ? 'ítem' : 'ítems'}
                </span>
              </h3>
              <p className="text-[11px] text-gray-400">
                Podés editar cantidades y costos antes de confirmar la compra en Google Sheets.
              </p>
            </div>
          </div>

          {itemsIngreso.length > 0 && (
            <button
              type="button"
              onClick={() => { setItemsIngreso([]); enfocarEan(); }}
              disabled={guardandoIngreso}
              className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer self-start sm:self-auto"
            >
              <Trash2 size={13} />
              <span>Vaciar lista</span>
            </button>
          )}
        </div>

        {errorIngreso && (
          <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle size={15} className="text-red-400 shrink-0" />
              <span>{errorIngreso}</span>
            </div>
            <button onClick={() => setErrorIngreso(null)} className="text-gray-400 hover:text-white">
              <X size={14} />
            </button>
          </div>
        )}

        {exitoIngreso && (
          <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
              <span>{exitoIngreso}</span>
            </div>
            <button onClick={() => setExitoIngreso(null)} className="text-gray-400 hover:text-white">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Tabla / Tarjetas de lo escaneado */}
        {itemsIngreso.length === 0 ? (
          <div className="py-12 text-center text-gray-500 space-y-2 border border-dashed border-gray-800 rounded-xl">
            <ScanBarcode size={32} className="mx-auto text-gray-600 mb-1" />
            <p className="text-xs font-bold text-gray-400">No hay productos en el lote pendiente.</p>
            <p className="text-[11px] text-gray-600 max-w-sm mx-auto">
              Escaneá códigos EAN con la lectora para agregarlos automáticamente a este ingreso.
            </p>
          </div>
        ) : (
          <>
            {/* VISTA DESKTOP: TABLA */}
            <div className="hidden md:block overflow-x-auto border border-gray-800 rounded-xl">
              <table className="w-full text-left text-xs text-gray-300">
                <thead className="bg-black/50 border-b border-gray-800 text-[10px] font-bold uppercase text-gray-400">
                  <tr>
                    <th className="py-3 px-3.5">Código EAN</th>
                    <th className="py-3 px-3.5">Producto</th>
                    <th className="py-3 px-3.5">Subcategoría</th>
                    <th className="py-3 px-3.5 text-center">Cantidad</th>
                    <th className="py-3 px-3.5 text-right">Costo Unitario ($)</th>
                    <th className="py-3 px-3.5 text-right">Subtotal ($)</th>
                    <th className="py-3 px-3 text-center">Quitar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60 font-medium">
                  {itemsIngreso.map((item, idx) => {
                    const cant = Number(item.cantidad) || 1;
                    const costo = Number(item.costoUnitario) || 0;
                    const subtotal = cant * costo;

                    return (
                      <tr key={item.ean || idx} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-2.5 px-3.5 font-mono text-gray-400 font-bold text-[11px]">
                          {item.ean || '-'}
                        </td>
                        <td className="py-2.5 px-3.5 font-bold text-white text-sm">
                          <div>{item.nombre}</div>
                          {item.marca && (
                            <div className="text-[10px] text-gray-400 font-normal">{item.marca}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3.5 text-gray-400">
                          <span className="px-2 py-0.5 rounded-md bg-gray-800 text-gray-300 text-[10px]">
                            {item.subcategoria}
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5 text-center">
                          <div className="inline-flex items-center gap-1 bg-black/50 border border-gray-700 rounded-lg p-0.5">
                            <button
                              type="button"
                              onClick={() => {
                                const n = Math.max(1, cant - 1);
                                setItemsIngreso(prev => prev.map((it, i) => i === idx ? { ...it, cantidad: n } : it));
                              }}
                              className="px-2 py-0.5 text-gray-400 hover:text-white font-bold cursor-pointer"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={cant}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                const n = isNaN(val) || val < 1 ? 1 : val;
                                setItemsIngreso(prev => prev.map((it, i) => i === idx ? { ...it, cantidad: n } : it));
                              }}
                              className="w-12 bg-transparent text-center font-bold text-white font-mono text-xs outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setItemsIngreso(prev => prev.map((it, i) => i === idx ? { ...it, cantidad: cant + 1 } : it));
                              }}
                              className="px-2 py-0.5 text-gray-400 hover:text-white font-bold cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 px-3.5 text-right">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={costo || ''}
                            placeholder="0"
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setItemsIngreso(prev => prev.map((it, i) => i === idx ? { ...it, costoUnitario: val } : it));
                            }}
                            className="w-24 bg-black/50 border border-gray-700 focus:border-green-500 rounded-lg px-2 py-1 text-right font-mono text-white text-xs outline-none"
                          />
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono font-bold text-white">
                          ${subtotal.toLocaleString('es-AR')}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setItemsIngreso(prev => prev.filter((_, i) => i !== idx));
                              enfocarEan();
                            }}
                            className="p-1.5 text-gray-500 hover:text-red-400 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                            title="Eliminar de la lista"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* VISTA MOBILE: TARJETAS */}
            <div className="md:hidden space-y-3">
              {itemsIngreso.map((item, idx) => {
                const cant = Number(item.cantidad) || 1;
                const costo = Number(item.costoUnitario) || 0;
                const subtotal = cant * costo;

                return (
                  <div key={item.ean || idx} className="bg-black/40 border border-gray-800 rounded-xl p-3.5 space-y-2.5">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-mono text-[10px] text-gray-500">{item.ean || '-'}</div>
                        <h4 className="font-bold text-white text-sm">{item.nombre}</h4>
                        <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
                          {item.marca && <span>{item.marca} · </span>}
                          <span>{item.subcategoria}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setItemsIngreso(prev => prev.filter((_, i) => i !== idx));
                          enfocarEan();
                        }}
                        className="text-gray-500 hover:text-red-400 p-1 cursor-pointer"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-800 text-xs">
                      <div>
                        <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Cantidad</label>
                        <div className="flex items-center bg-black/60 border border-gray-700 rounded-lg p-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              const n = Math.max(1, cant - 1);
                              setItemsIngreso(prev => prev.map((it, i) => i === idx ? { ...it, cantidad: n } : it));
                            }}
                            className="px-2 py-1 text-gray-400 font-bold"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={cant}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              const n = isNaN(val) || val < 1 ? 1 : val;
                              setItemsIngreso(prev => prev.map((it, i) => i === idx ? { ...it, cantidad: n } : it));
                            }}
                            className="w-full text-center font-bold text-white font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setItemsIngreso(prev => prev.map((it, i) => i === idx ? { ...it, cantidad: cant + 1 } : it));
                            }}
                            className="px-2 py-1 text-gray-400 font-bold"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Costo Unit ($)</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={costo || ''}
                          placeholder="0"
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setItemsIngreso(prev => prev.map((it, i) => i === idx ? { ...it, costoUnitario: val } : it));
                          }}
                          className="w-full bg-black/60 border border-gray-700 rounded-lg p-1.5 text-right font-mono text-white"
                        />
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-1 border-t border-gray-800 text-xs">
                      <span className="text-gray-400">Subtotal:</span>
                      <span className="font-mono font-bold text-white text-sm">${subtotal.toLocaleString('es-AR')}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* BARRA DE CONFIRMACIÓN DE INGRESO */}
            <div className="bg-black/60 border border-gray-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-6 flex-wrap">
                <div>
                  <span className="text-[10px] uppercase font-bold text-gray-400 block">Total Unidades</span>
                  <div className="text-base font-black font-mono text-white">
                    {resumenIngreso.totalUnidades} uds
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-gray-400 block">Inversión Total</span>
                  <div className="text-base font-black font-mono text-emerald-400">
                    ${resumenIngreso.costoTotalLote.toLocaleString('es-AR')}
                  </div>
                </div>

                <div className="flex-1 min-w-[200px]">
                  <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Proveedor (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Ej: Distribuidora Central..."
                    value={proveedorIngreso}
                    onChange={(e) => setProveedorIngreso(e.target.value)}
                    disabled={guardandoIngreso}
                    className="w-full bg-[#111827] border border-gray-700 focus:border-green-500 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 outline-none"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleConfirmarIngresoLote}
                disabled={guardandoIngreso || itemsIngreso.length === 0}
                className="w-full md:w-auto px-6 py-3 rounded-xl bg-green-500 hover:bg-green-400 text-black font-black text-xs uppercase tracking-wider transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {guardandoIngreso ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Registrando compras en Sheets...</span>
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    <span>Confirmar Ingreso ({resumenIngreso.totalUnidades} uds)</span>
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
