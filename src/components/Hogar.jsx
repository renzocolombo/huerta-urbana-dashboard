import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Home, ShoppingCart, Search, Check, X, AlertCircle, AlertTriangle, 
  RefreshCw, LogOut, Plus, Minus, Trash2, History, ArrowLeft,
  Scale, ScanBarcode, CheckCircle2
} from 'lucide-react';
import { 
  apiGetHogar, apiVerificarHogarPin, apiRegistrarSalidas, apiGetStockKg, apiGetAlmacen,
  getHogarPinSession, setHogarPinSession, clearHogarPinSession
} from '../utils/mercaderiaApi';
import { useBalanzaSystel } from '../utils/balanzaSystel';
import { getEanMapping, asociarEanAProducto } from '../data/productUtils';
import { determinarTipoCaptura, analizarTipoCaptura, TIPOS_CAPTURA } from '../utils/tipoCapturaProducto';
import { formatearMonto } from '../utils/totalesPedido';

const norm = (s) => (s || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const $$ = (n) => formatearMonto(n);

export default function Hogar({ standalone = false, onVolverEleccion }) {
  // Estado de autenticación por PIN del hogar
  const [pinHogar, setPinHogar] = useState(() => getHogarPinSession());
  const [pinInput, setPinInput] = useState('');
  const [errorPin, setErrorPin] = useState(null);
  const [verificandoPin, setVerificandoPin] = useState(false);

  // Balanza Systel (Web Serial API)
  const balanza = useBalanzaSystel();

  // Datos del Hogar
  const [datosHogar, setDatosHogar] = useState(null); // { ok, saldo, pin_configurado, movimientos: [] }
  const [cargandoHogar, setCargandoHogar] = useState(false);
  const [errorHogar, setErrorHogar] = useState(null);

  // Catálogo de productos disponibles con stock > 0
  const [productos, setProductos] = useState([]);
  const [cargandoProds, setCargandoProds] = useState(false);

  // Pestañas internas
  const [subTab, setSubTab] = useState('consumo'); // 'consumo' | 'movimientos'

  // Producto activo para consumo directo (mínimo de pasos)
  const [productoActivo, setProductoActivo] = useState(null);
  const [eanEscaneado, setEanEscaneado] = useState(null);
  const [pesoManual, setPesoManual] = useState('');
  const [unidadesManual, setUnidadesManual] = useState(1);
  const [descontarTara, setDescontarTara] = useState(false);
  const [taraValor, setTaraValor] = useState(0);

  // Estados de confirmación directa
  const [confirmandoDirecto, setConfirmandoDirecto] = useState(false);
  const [mensajeExito, setMensajeExito] = useState(null);
  const [mensajeError, setMensajeError] = useState(null);

  // Filtros y buscador
  const [busqueda, setBusqueda] = useState('');
  const [categoriaChip, setCategoriaChip] = useState('Todos');

  // Input ref para pistola / escáner de código de barras
  const scannerInputRef = useRef(null);

  // 1. Cargar estado inicial del Hogar
  const cargarInfoHogar = async () => {
    setCargandoHogar(true);
    setErrorHogar(null);
    try {
      const res = await apiGetHogar();
      if (res && res.ok) {
        setDatosHogar(res);
      } else {
        setErrorHogar(res?.error || 'No se pudo cargar la información del hogar.');
      }
    } catch (e) {
      setErrorHogar(e.message);
    } finally {
      setCargandoHogar(false);
    }
  };

  // 2. Cargar productos con stock > 0 (Mercadería + Almacén fresco del servidor)
  const cargarProductosDisponibles = async () => {
    setCargandoProds(true);
    try {
      const [resStock, resAlmacen] = await Promise.all([
        apiGetStockKg().catch(() => null),
        apiGetAlmacen().catch(() => null),
      ]);

      const listaCombinada = [];
      const mapaAgregados = new Set();

      // A) Productos de Mercadería (Stock Kg)
      if (resStock && resStock.ok && Array.isArray(resStock.productos)) {
        resStock.productos.forEach(p => {
          const nom = String(p.producto || p.nombre || '').trim();
          if (!nom) return;
          const stock = Number(p.en_deposito || 0) || Number(p.vendible || 0);
          if (stock > 0) {
            const k = norm(nom);
            mapaAgregados.add(k);
            listaCombinada.push({
              producto: nom,
              nombre: nom,
              marca: p.marca || '',
              categoria: p.categoria || 'Verduras',
              unidad: p.unidad || 'kg',
              costo_unitario: Number(p.costo_kg_ultimo || p.costo || 0),
              stock_disponible: stock,
              en_deposito: stock,
              vendible: stock,
              ean: p.ean || p.codigo_ean || p.barcode || '',
              barcode: p.ean || p.codigo_ean || p.barcode || '',
              fila: p.fila || null,
            });
          }
        });
      }

      // B) Productos de Almacén (getAlmacen fresco del servidor)
      const itemsAlm = (resAlmacen && resAlmacen.ok && (
        Array.isArray(resAlmacen.productos) ? resAlmacen.productos : 
        (Array.isArray(resAlmacen.almacen) ? resAlmacen.almacen : [])
      )) || (Array.isArray(resAlmacen) ? resAlmacen : []);

      itemsAlm.forEach(p => {
        const nom = String(p.nombre || p.producto || '').trim();
        if (!nom) return; // descartar filas fantasma / sin nombre
        const stockUds = Number(
          p.stock_unidades !== undefined ? p.stock_unidades :
          (p.unidades !== undefined ? p.unidades :
          (p.stock !== undefined ? p.stock : 0))
        ) || 0;

        // Regla: Cualquier producto con nombre no vacío y stock mayor a 0, en cualquier fila
        if (stockUds > 0) {
          const marca = String(p.marca || '').trim();
          const ean = String(p.codigo_ean || p.ean || p.barcode || '').trim().toUpperCase();
          const costo = Number(p.costo_unitario !== undefined ? p.costo_unitario : (p.costo || 0)) || 0;
          const precio = Number(p.precio_venta !== undefined ? p.precio_venta : (p.precio || 0)) || 0;
          const cat = String(p.categoria || 'Almacén').trim();
          const subcat = String(p.subcategoria || 'Almacén').trim();
          const fila = p.fila || p.fila_val || null;

          // Registrar en mapa EAN para lectura con pistola
          if (ean) {
            try {
              asociarEanAProducto(ean, {
                nombre: nom,
                marca,
                subcategoria: subcat,
                unidad: 'un'
              });
            } catch (_) {}
          }

          const k = norm(nom) + (marca ? '__' + norm(marca) : '');
          if (!mapaAgregados.has(k)) {
            mapaAgregados.add(k);
            listaCombinada.push({
              producto: marca ? `${nom} (${marca})` : nom,
              nombre: nom,
              marca,
              categoria: cat,
              subcategoria: subcat,
              unidad: 'un',
              costo_unitario: costo,
              precio_venta: precio,
              stock_disponible: stockUds,
              stock_unidades: stockUds,
              en_deposito: stockUds,
              vendible: stockUds,
              ean: ean,
              codigo_ean: ean,
              barcode: ean,
              fila,
              es_almacen: true
            });
          }
        }
      });

      setProductos(listaCombinada);
    } catch (e) {
      console.warn('[HOGAR] Error cargando productos disponibles:', e.message);
    } finally {
      setCargandoProds(false);
    }
  };

  useEffect(() => {
    cargarInfoHogar();
  }, []);

  useEffect(() => {
    if (pinHogar) {
      cargarProductosDisponibles();
    }
  }, [pinHogar]);

  // Manejar verificación de PIN
  const handleVerificarPin = async (e) => {
    e.preventDefault();
    if (!pinInput.trim()) return;

    setVerificandoPin(true);
    setErrorPin(null);

    try {
      const res = await apiVerificarHogarPin(pinInput.trim());
      if (res && res.ok) {
        setHogarPinSession(pinInput.trim());
        setPinHogar(pinInput.trim());
        setPinInput('');
        cargarInfoHogar();
        cargarProductosDisponibles();
      } else {
        setErrorPin(res?.error || 'PIN incorrecto.');
      }
    } catch (err) {
      setErrorPin(err.message || 'Error de conexión.');
    } finally {
      setVerificandoPin(false);
    }
  };

  // Salir / Bloquear sesión
  const handleSalir = () => {
    clearHogarPinSession();
    setPinHogar(null);
    setProductoActivo(null);
  };

  // Selección de producto
  const seleccionarProducto = (prod, pesoPredefinido = null, eanCodigo = null) => {
    setMensajeExito(null);
    setMensajeError(null);
    setProductoActivo(prod);
    setEanEscaneado(eanCodigo || prod.ean || prod.barcode || null);
    const esKg = (prod.unidad || 'kg').toLowerCase() === 'kg';
    if (esKg) {
      if (pesoPredefinido !== null && pesoPredefinido > 0) {
        setPesoManual(String(pesoPredefinido));
      } else {
        setPesoManual('');
      }
    } else {
      setUnidadesManual(1);
    }
  };

  // Manejo de lectura de pistola / escaneo EAN
  const handleScanInput = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = (e.target.value || '').trim();
      e.target.value = '';
      if (!code) return;

      // 1. Verificar si es código de balanza retail (starts with 20 or 02)
      const eanBalanza = code.match(/^(20|02)(\d{4,5})(\d{5})\d$/);
      if (eanBalanza) {
        const plu = eanBalanza[2];
        const gramos = parseInt(eanBalanza[3], 10);
        const pesoKg = Math.round((gramos / 1000) * 1000) / 1000;

        // Buscar producto por PLU o nombre
        const encontrado = productos.find(p => norm(p.producto).includes(norm(plu)));
        if (encontrado) {
          seleccionarProducto(encontrado, pesoKg, null);
          return;
        }
      }

      // 2. Verificar en el mapa EAN o código EAN directo
      const eanMap = getEanMapping();
      const eanInfo = eanMap[code.toUpperCase()];
      let prodMatch = null;
      if (eanInfo && eanInfo.nombre) {
        prodMatch = productos.find(p => norm(p.producto) === norm(eanInfo.nombre) || norm(p.nombre) === norm(eanInfo.nombre));
      }
      if (!prodMatch) {
        prodMatch = productos.find(p => {
          const eanStr = String(p.ean || p.barcode || p.codigo_ean || '').trim();
          if (eanStr && eanStr === code) return true;
          const nom = norm(p.producto || p.nombre || '');
          const mar = norm(p.marca || '');
          const cod = norm(code);
          return nom === cod || nom.includes(cod) || mar.includes(cod);
        });
      }

      if (prodMatch) {
        // Si el producto escaneado es el que ya estaba activo y es Almacén con EAN, cada clink suma 1
        const tipoMatch = determinarTipoCaptura(prodMatch, productos);
        if (productoActivo && prodMatch.producto === productoActivo.producto && tipoMatch === TIPOS_CAPTURA.ALMACEN_EAN) {
          setUnidadesManual(prev => (parseInt(prev, 10) || 1) + 1);
          setEanEscaneado(code);
        } else {
          seleccionarProducto(prodMatch, null, code);
        }
      } else {
        setMensajeError(`No se encontró ningún producto para el código "${code}".`);
      }
    }
  };

  // Cálculos para producto activo
  const saldoActual = Number(datosHogar?.saldo || 0);

  // Tipo de captura del producto activo según catálogo y EAN
  const analisisCapturaActivo = useMemo(() => {
    if (!productoActivo) return null;
    return analizarTipoCaptura(productoActivo, productos);
  }, [productoActivo, productos]);

  const tipoCapturaActivo = analisisCapturaActivo?.tipo || null;
  const deducidoPorNombreActivo = Boolean(analisisCapturaActivo?.deducidoPorNombre);

  const esPesable = tipoCapturaActivo === TIPOS_CAPTURA.PESABLE;
  const esUnidadManual = tipoCapturaActivo === TIPOS_CAPTURA.UNIDAD_MANUAL;
  const esAlmacenEan = tipoCapturaActivo === TIPOS_CAPTURA.ALMACEN_EAN;

  const pesoTomado = useMemo(() => {
    if (!productoActivo || !esPesable) return 0;

    // Si hay balanza conectada y peso vivo > 0 y no hay peso manual escrito
    if (balanza.conectado && balanza.pesoVivo !== null && balanza.pesoVivo > 0 && !pesoManual) {
      const bruto = Number(balanza.pesoVivo);
      const neto = descontarTara && taraValor > 0 ? Math.max(0, bruto - taraValor) : bruto;
      return Number(neto.toFixed(3));
    }

    const p = parseFloat(pesoManual);
    return isNaN(p) || p <= 0 ? 0 : Number(p.toFixed(3));
  }, [productoActivo, esPesable, balanza.conectado, balanza.pesoVivo, pesoManual, descontarTara, taraValor]);

  const cantidadFinal = useMemo(() => {
    if (!productoActivo) return 0;
    if (esPesable) return pesoTomado;
    const u = parseInt(unidadesManual, 10);
    return isNaN(u) || u <= 0 ? 1 : u;
  }, [productoActivo, esPesable, pesoTomado, unidadesManual]);

  const costoUnitarioActivo = Number(productoActivo?.costo_unitario || 0);
  const subtotalConsumo = Number((cantidadFinal * costoUnitarioActivo).toFixed(2));
  const saldoRestante = Number((saldoActual - subtotalConsumo).toFixed(2));
  const saldoInsuficiente = subtotalConsumo > saldoActual;

  // Confirmar consumo del Hogar (1 solo clic)
  const handleConfirmarConsumoDirecto = async () => {
    if (!productoActivo || cantidadFinal <= 0 || saldoInsuficiente) return;

    setConfirmandoDirecto(true);
    setMensajeError(null);
    setMensajeExito(null);

    // Formato exacto v19 del servidor:
    // - Almacén por unidad (con código de barras): { producto, unidades, ean }
    // - Kilos o verduras por unidad o atado (choclo, perejil, etc.): { producto, kg }
    const itemsPayload = [{
      producto: productoActivo.producto,
      ...(esAlmacenEan
        ? {
            unidades: Math.round(Number(cantidadFinal)),
            ...((eanEscaneado || productoActivo.ean || productoActivo.barcode)
              ? { ean: String(eanEscaneado || productoActivo.ean || productoActivo.barcode).trim() }
              : {})
          }
        : {
            kg: Number(cantidadFinal)
          }
      )
    }];

    try {
      const res = await apiRegistrarSalidas({
        tipo: 'CASA',
        items: itemsPayload,
        pin: pinHogar
      });

      if (res && res.ok) {
        const nuevoSaldo = res.saldo !== undefined ? res.saldo : saldoRestante;
        setDatosHogar(prev => ({ ...prev, saldo: nuevoSaldo }));
        setMensajeExito(
          `¡Consumo confirmado! Se descontaron ${cantidadFinal} ${etiquetaUnidad(productoActivo.unidad, cantidadFinal)} de ${productoActivo.producto} (${$$(subtotalConsumo)}). Nuevo saldo disponible: ${$$(nuevoSaldo)}`
        );

        // Limpiar selección para el próximo producto (sin descuento duplicado local)
        setProductoActivo(null);
        setEanEscaneado(null);
        setPesoManual('');
        setUnidadesManual(1);

        // Recargar información y stock desde el servidor
        cargarInfoHogar();
        cargarProductosDisponibles();
      } else {
        if (res?.error && res.error.toLowerCase().includes('pin')) {
          handleSalir();
        }
        // Mostrar mensaje exacto de error del servidor
        setMensajeError(res?.error || 'No se pudo registrar el consumo.');
      }
    } catch (err) {
      setMensajeError(err.message || 'Error de red al registrar el consumo.');
    } finally {
      setConfirmandoDirecto(false);
    }
  };

  // Filtrado de productos disponibles
  const productosFiltrados = useMemo(() => {
    return productos.filter(p => {
      const catNorm = norm(p.categoria || '');
      if (categoriaChip === 'Verdura' && !catNorm.includes('verdura')) return false;
      if (categoriaChip === 'Fruta' && !catNorm.includes('fruta')) return false;
      if (categoriaChip === 'Almacén' && !catNorm.includes('almacen')) return false;
      if (categoriaChip === 'Otros' && (catNorm.includes('verdura') || catNorm.includes('fruta') || catNorm.includes('almacen'))) return false;

      if (busqueda.trim()) {
        const q = norm(busqueda);
        const prod = norm(p.producto || p.nombre || '');
        const marca = norm(p.marca || '');
        const ean = String(p.ean || p.codigo_ean || p.barcode || '').trim();
        return prod.includes(q) || marca.includes(q) || ean.includes(q);
      }
      return true;
    });
  }, [productos, categoriaChip, busqueda]);

  // ── CASO A: EL HOGAR TODAVÍA NO TIENE PIN CONFIGURADO ─────────────────────
  if (datosHogar && datosHogar.pin_configurado === false) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-4">
        <div className="bg-[#121212] border border-gray-800 rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
            <Home size={28} />
          </div>
          <h2 className="text-lg font-black text-white">Hogar de la Familia</h2>
          <p className="text-sm text-gray-400 leading-relaxed">
            El hogar todavía no tiene PIN configurado. Pedile al administrador que lo configure desde el panel de administración.
          </p>
          {onVolverEleccion && (
            <button
              onClick={onVolverEleccion}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white font-bold text-xs rounded-xl cursor-pointer"
            >
              Volver a la selección
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── CASO B: SE REQUIERE INGRESAR PIN DEL HOGAR ────────────────────────────
  if (!pinHogar) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-4">
        <div className="bg-[#121212] border border-gray-800 rounded-3xl p-8 max-w-sm w-full space-y-5 shadow-2xl animate-in fade-in zoom-in-95">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-green-500/10 border border-green-500/30 flex items-center justify-center text-green-400 mx-auto">
              <Home size={24} />
            </div>
            <h1 className="text-xl font-black text-white tracking-tight">Hogar &mdash; Acceso Familia</h1>
            <p className="text-xs text-gray-400">
              Ingresá el PIN del hogar para ver el saldo y cargar tus consumos
            </p>
          </div>

          <form onSubmit={handleVerificarPin} className="space-y-4">
            <div>
              <input
                type="password"
                autoFocus
                placeholder="PIN del Hogar"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                className="w-full bg-black border border-gray-700 focus:border-green-500 rounded-2xl px-4 py-3 text-center text-2xl font-mono tracking-widest text-white outline-none"
                required
              />
            </div>

            {errorPin && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs text-center font-bold">
                {errorPin}
              </div>
            )}

            <button
              type="submit"
              disabled={verificandoPin || !pinInput.trim()}
              className="w-full py-3 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-lg shadow-green-500/20 text-xs"
            >
              {verificandoPin ? 'Verificando...' : 'Entrar al Hogar'}
            </button>
          </form>

          {onVolverEleccion && (
            <button
              onClick={onVolverEleccion}
              className="w-full text-center text-xs text-gray-500 hover:text-gray-300 cursor-pointer pt-2"
            >
              ← Volver a la pantalla de elección
            </button>
          )}

          <p className="text-[10px] text-gray-600 text-center">
            La sesión se mantiene activa por 5 minutos de uso. Nunca se guarda en el teléfono.
          </p>
        </div>
      </div>
    );
  }

  // ── CASO C: PANTALLA PRINCIPAL DE CONSUMO DEL HOGAR ───────────────────────
  return (
    <div className={`min-h-screen bg-[#0a0a0a] text-white ${standalone ? 'p-4 sm:p-6' : 'pt-16 pb-20 px-4 sm:px-6 lg:px-8'} max-w-7xl mx-auto space-y-5`}>
      {/* Barra de cabecera con Saldo y Controles */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#121212] border border-gray-800 p-5 rounded-3xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-green-500/10 border border-green-500/30 flex items-center justify-center text-green-400 shrink-0">
            <Home size={24} />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block">
              Hogar Huerta Urbana
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-gray-400 font-bold">Saldo disponible:</span>
              <span className="text-2xl sm:text-3xl font-mono font-black text-green-400">
                {$$(saldoActual)}
              </span>
            </div>
          </div>
        </div>

        {/* Botones de navegación y salida */}
        <div className="flex items-center gap-2 self-start sm:self-center flex-wrap">
          <div className="flex bg-black/60 border border-gray-800 p-1 rounded-xl">
            <button
              onClick={() => setSubTab('consumo')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                subTab === 'consumo' ? 'bg-green-500 text-black shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              Registrar Consumo
            </button>
            <button
              onClick={() => setSubTab('movimientos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                subTab === 'movimientos' ? 'bg-green-500 text-black shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              Mis Movimientos
            </button>
          </div>

          <button
            onClick={() => {
              cargarInfoHogar();
              cargarProductosDisponibles();
            }}
            disabled={cargandoHogar || cargandoProds}
            title="Actualizar stock y saldo desde el servidor"
            className="px-3 py-1.5 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-700 text-gray-300 hover:text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={13} className={cargandoHogar || cargandoProds ? 'animate-spin' : ''} />
            <span>Actualizar</span>
          </button>

          {onVolverEleccion && (
            <button
              onClick={onVolverEleccion}
              className="px-3 py-1.5 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-700 text-gray-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft size={14} />
              <span>Cambiar modo</span>
            </button>
          )}

          <button
            onClick={handleSalir}
            title="Bloquear sesión de Hogar"
            className="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer border border-gray-700"
          >
            <LogOut size={13} />
            <span>Salir</span>
          </button>
        </div>
      </div>

      {/* Feedback de mensajes */}
      {mensajeExito && (
        <div className="p-4 rounded-2xl bg-green-500/10 border border-green-500/30 text-green-300 text-xs flex items-center gap-2 animate-in fade-in">
          <Check size={16} className="shrink-0 text-green-400" />
          <span>{mensajeExito}</span>
        </div>
      )}

      {mensajeError && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2 animate-in fade-in">
          <AlertCircle size={16} className="shrink-0 text-red-400" />
          <span>{mensajeError}</span>
        </div>
      )}

      {/* ── SUB-VISTA 1: REGISTRAR CONSUMO (MÍNIMO DE PASOS) ────────────── */}
      {subTab === 'consumo' && (
        <div className="space-y-5">
          {/* ── PASO 2: PANEL DE PESAJE EN VIVO Y CONFIRMAR (SI HAY PRODUCTO ELEGIDO) ── */}
          {productoActivo && (
            <div className="bg-[#141414] border-2 border-green-500/60 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-xl bg-green-500/20 text-green-300 border border-green-500/30">
                    Producto elegido
                  </span>
                  <div>
                    <h2 className="text-lg sm:text-xl font-black text-white">
                      {productoActivo.producto}
                    </h2>
                    <p className="text-xs text-gray-400 font-mono">
                      Costo: <strong className="text-green-400">{$$(productoActivo.costo_unitario)}</strong>/{productoActivo.unidad} &middot; Stock disponible: {productoActivo.stock_disponible} {productoActivo.unidad}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setProductoActivo(null)}
                  className="px-3 py-1.5 rounded-xl bg-gray-900 border border-gray-700 text-gray-300 hover:text-white text-xs font-bold cursor-pointer"
                >
                  ✕ Cancelar
                </button>
              </div>

              {/* Aviso si el tipo fue deducido por nombre */}
              {deducidoPorNombreActivo && (
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-center gap-2">
                  <span>⚠️</span>
                  <span>Tipo deducido por nombre: revisar la unidad en el catálogo</span>
                </div>
              )}

              {/* TIPO A: PESABLES (kg) -> Balanza Systel en vivo */}
              {esPesable ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Tipo A: Pesable (kg) &mdash; Balanza Systel
                    </span>
                  </div>

                  {/* Tarjeta Balanza Systel */}
                  <div className="bg-black border border-gray-800 rounded-2xl p-4 text-center space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${balanza.conectado ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`} />
                        <span className={`font-bold ${balanza.conectado ? 'text-green-400' : 'text-gray-400'}`}>
                          {balanza.conectado ? 'Balanza Systel conectada' : 'Balanza no conectada'}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={balanza.toggle}
                        className="text-[11px] text-green-400 hover:underline font-bold cursor-pointer"
                      >
                        {balanza.conectado ? 'Desconectar balanza' : 'Conectar balanza'}
                      </button>
                    </div>

                    {/* Display gigante de peso vivo */}
                    <div className="py-2">
                      <span className="text-5xl sm:text-6xl font-mono font-black text-green-400 tracking-tight">
                        {pesoTomado.toFixed(3)}
                        <span className="text-2xl font-sans text-gray-500 ml-2">kg</span>
                      </span>
                    </div>

                    {/* Vía alternativa de contingencia (sin balanza) */}
                    <div className="max-w-xs mx-auto flex items-center gap-2 pt-2 border-t border-gray-900">
                      <label className="text-[11px] text-gray-500 whitespace-nowrap">
                        Contingencia manual:
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        placeholder="Solo si no hay balanza"
                        value={pesoManual}
                        onChange={(e) => setPesoManual(e.target.value)}
                        className="w-full bg-black/80 border border-gray-800 focus:border-green-500 rounded-xl px-2.5 py-1 text-center font-mono text-gray-300 text-xs outline-none"
                      />
                    </div>
                  </div>
                </div>
              ) : esUnidadManual ? (
                /* TIPO B: POR UNIDAD O ATADO SIN CÓDIGO DE BARRAS (choclo, lechuga, perejil, etc.) */
                <div className="bg-black border border-gray-800 rounded-2xl p-5 text-center space-y-3">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                      Tipo B: Por {etiquetaUnidad(productoActivo.unidad, 1)} (Sin balanza)
                    </span>
                  </div>
                  <span className="text-xs font-bold uppercase text-gray-400 block">
                    Cantidad a consumir ({etiquetaUnidad(productoActivo.unidad, unidadesManual)})
                  </span>
                  <div className="flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => setUnidadesManual(Math.max(1, (parseInt(unidadesManual, 10) || 1) - 1))}
                      className="w-10 h-10 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-bold text-lg flex items-center justify-center cursor-pointer"
                    >
                      <Minus size={16} />
                    </button>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={unidadesManual}
                      onChange={(e) => setUnidadesManual(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-20 bg-black/80 border border-gray-700 text-center font-mono font-black text-2xl text-white rounded-xl py-1 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setUnidadesManual((parseInt(unidadesManual, 10) || 1) + 1)}
                      className="w-10 h-10 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-bold text-lg flex items-center justify-center cursor-pointer"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                /* TIPO C: ALMACÉN CON CÓDIGO DE BARRAS (EAN) */
                <div className="bg-black border border-gray-800 rounded-2xl p-5 text-center space-y-3">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      Tipo C: Almacén (EAN &mdash; Pistola)
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Escaneá con la pistola de código de barras para sumar +1 automáticamente o ajustá la cantidad:
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => setUnidadesManual(Math.max(1, (parseInt(unidadesManual, 10) || 1) - 1))}
                      className="w-10 h-10 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-bold text-lg flex items-center justify-center cursor-pointer"
                    >
                      <Minus size={16} />
                    </button>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={unidadesManual}
                      onChange={(e) => setUnidadesManual(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-20 bg-black/80 border border-gray-700 text-center font-mono font-black text-2xl text-white rounded-xl py-1 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setUnidadesManual((parseInt(unidadesManual, 10) || 1) + 1)}
                      className="w-10 h-10 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-bold text-lg flex items-center justify-center cursor-pointer"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              )}

              {/* Resumen del consumo y botón OK */}
              <div className="bg-black/50 border border-gray-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs text-gray-400 font-bold">Total a descontar:</span>
                    <span className="text-xl sm:text-2xl font-mono font-black text-amber-300">
                      {$$(subtotalConsumo)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 font-mono">
                    Saldo que quedaría: <span className={saldoInsuficiente ? 'text-red-400 font-bold' : 'text-green-400 font-bold'}>{$$(saldoRestante)}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleConfirmarConsumoDirecto}
                  disabled={confirmandoDirecto || cantidadFinal <= 0 || saldoInsuficiente}
                  className="px-6 py-3 bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-black uppercase text-sm rounded-xl transition-all shadow-lg shadow-green-500/20 cursor-pointer flex items-center justify-center gap-2"
                >
                  {confirmandoDirecto ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>Descontando...</span>
                    </>
                  ) : (
                    <>
                      <Check size={18} />
                      <span>Confirmar Consumo (OK)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ── PASO 1: BARRA DE ESCANEO PISTOLA EAN & BUSCADOR ──────────────── */}
          <div className="bg-[#121212] border border-gray-800 p-4 rounded-3xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              {/* Input listo para pistola / lector de código de barras */}
              <div className="relative flex-1">
                <ScanBarcode size={16} className="absolute left-3.5 top-3 text-cyan-400" />
                <input
                  ref={scannerInputRef}
                  type="text"
                  placeholder="Escaneá con pistola o buscá producto (Enter)..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  onKeyDown={handleScanInput}
                  className="w-full bg-black/80 border border-gray-700 focus:border-green-500 rounded-2xl pl-10 pr-3 py-2.5 text-xs text-white placeholder-gray-500 outline-none"
                />
              </div>

              {/* Categorías */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                {['Todos', 'Verdura', 'Fruta', 'Almacén', 'Otros'].map(chip => (
                  <button
                    key={chip}
                    onClick={() => setCategoriaChip(chip)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                      categoriaChip === chip
                        ? 'bg-gray-200 text-black'
                        : 'bg-black/40 text-gray-400 hover:text-white border border-gray-800'
                    }`}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── GRILLA DE PRODUCTOS DISPONIBLES CON STOCK ──────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {cargandoProds ? (
              <div className="col-span-full py-16 text-center text-xs text-gray-500">
                <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-green-500" />
                Cargando productos con stock...
              </div>
            ) : productosFiltrados.length === 0 ? (
              <div className="col-span-full py-12 text-center text-xs text-gray-500 bg-[#121212] border border-gray-800 rounded-2xl p-6">
                No hay productos disponibles en esta selección.
              </div>
            ) : (
              productosFiltrados.map((p, idx) => {
                const esActivo = productoActivo?.producto === p.producto;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => seleccionarProducto(p)}
                    className={`bg-[#121212] hover:bg-[#181818] border rounded-2xl p-3.5 text-left transition-all cursor-pointer flex flex-col justify-between space-y-2 relative ${
                      esActivo ? 'border-green-500 ring-2 ring-green-500/40 bg-green-500/5' : 'border-gray-800'
                    }`}
                  >
                    <div>
                      <span className="text-[10px] font-mono text-gray-500 uppercase block">
                        {p.categoria}
                      </span>
                      <h3 className="font-bold text-white text-xs sm:text-sm leading-tight mt-0.5">
                        {p.producto}
                      </h3>
                    </div>

                    <div className="pt-2 border-t border-gray-800/60 flex items-baseline justify-between">
                      <span className="font-mono font-black text-green-400 text-xs sm:text-sm">
                        {$$(p.costo_unitario)}
                        <span className="text-[10px] text-gray-500 font-normal">/{p.unidad}</span>
                      </span>
                      <span className="text-[10px] text-gray-400 font-mono">
                        {p.stock_disponible.toFixed(p.unidad === 'kg' ? 1 : 0)} {p.unidad}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── SUB-VISTA 2: MIS MOVIMIENTOS ───────────────────────────────── */}
      {subTab === 'movimientos' && (
        <div className="bg-[#121212] border border-gray-800 rounded-3xl overflow-hidden shadow-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-800 pb-3">
            <h2 className="text-xs font-black uppercase text-white flex items-center gap-1.5">
              <History size={15} className="text-green-400" /> Historial de Movimientos de la Cuenta
            </h2>
            <button onClick={cargarInfoHogar} className="text-xs text-green-400 hover:underline font-bold cursor-pointer">
              Refrescar
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-black/60 border-b border-gray-800 text-gray-400 font-bold uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4">Fecha</th>
                  <th className="py-3 px-3">Tipo</th>
                  <th className="py-3 px-3 text-right">Monto</th>
                  <th className="py-3 px-3 text-right">Saldo Resultante</th>
                  <th className="py-3 px-4">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60 font-medium">
                {(!datosHogar?.movimientos || datosHogar.movimientos.length === 0) ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-gray-500">
                      No hay movimientos registrados en la cuenta aún.
                    </td>
                  </tr>
                ) : (
                  datosHogar.movimientos.map((m, idx) => (
                    <tr key={idx} className="hover:bg-white/[0.02]">
                      <td className="py-3 px-4 text-gray-400 font-mono text-[11px]">{m.fecha || '—'}</td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          m.tipo === 'CARGA' ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-400'
                        }`}>
                          {m.tipo}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold">
                        <span className={m.tipo === 'CARGA' ? 'text-green-400' : 'text-amber-400'}>
                          {m.tipo === 'CARGA' ? `+${$$(m.monto)}` : `-${$$(m.monto)}`}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-gray-200">
                        {$$(m.saldo_resultante)}
                      </td>
                      <td className="py-3 px-4 text-gray-400 text-xs">{m.detalle || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
