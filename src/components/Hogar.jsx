import { useState, useEffect, useMemo } from 'react';
import { 
  Home, ShoppingCart, Search, Check, X, AlertCircle, AlertTriangle, 
  RefreshCw, LogOut, Plus, Minus, Trash2, History, ArrowRight
} from 'lucide-react';
import { 
  apiGetHogar, apiVerificarHogarPin, apiRegistrarSalidas, apiGetStockKg,
  getHogarPinSession, setHogarPinSession, clearHogarPinSession
} from '../utils/mercaderiaApi';

const norm = (s) => (s || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const $$ = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

export default function Hogar({ standalone = false }) {
  // Estado de autenticación por PIN del hogar
  const [pinHogar, setPinHogar] = useState(() => getHogarPinSession());
  const [pinInput, setPinInput] = useState('');
  const [errorPin, setErrorPin] = useState(null);
  const [verificandoPin, setVerificandoPin] = useState(false);

  // Datos del Hogar
  const [datosHogar, setDatosHogar] = useState(null); // { ok, saldo, pin_configurado, movimientos: [] }
  const [cargandoHogar, setCargandoHogar] = useState(false);
  const [errorHogar, setErrorHogar] = useState(null);

  // Catálogo de productos disponibles con stock > 0
  const [productos, setProductos] = useState([]);
  const [cargandoProds, setCargandoProds] = useState(false);

  // Pestañas internas
  const [subTab, setSubTab] = useState('tienda'); // 'tienda' | 'movimientos'

  // Carrito de compras del hogar
  const [carrito, setCarrito] = useState([]); // [{ producto, unidad, costo_unitario, cantidad, subtotal }]
  const [confirmando, setConfirmando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState(null);
  const [mensajeError, setMensajeError] = useState(null);

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [categoriaChip, setCategoriaChip] = useState('Todos');

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

  // 2. Cargar productos con stock > 0
  const cargarProductosDisponibles = async () => {
    setCargandoProds(true);
    try {
      const res = await apiGetStockKg();
      if (res && res.ok && Array.isArray(res.productos)) {
        // Filtrar estrictamente productos con vendible / en_deposito > 0
        const conStock = res.productos
          .filter(p => Number(p.en_deposito || 0) > 0)
          .map(p => ({
            producto: p.producto,
            categoria: p.categoria || 'Verduras',
            unidad: p.unidad || 'kg',
            costo_unitario: Number(p.costo_kg_ultimo || 0),
            stock_disponible: Number(p.en_deposito || 0),
          }));
        setProductos(conStock);
      }
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
    setCarrito([]);
  };

  // Agregar al carrito
  const agregarAlCarrito = (p) => {
    const existe = carrito.find(it => it.producto === p.producto);
    if (existe) {
      const step = p.unidad === 'kg' ? 0.5 : 1;
      const nuevaCant = Number((existe.cantidad + step).toFixed(2));
      setCarrito(carrito.map(it => it.producto === p.producto ? {
        ...it,
        cantidad: nuevaCant,
        subtotal: Number((nuevaCant * it.costo_unitario).toFixed(2))
      } : it));
    } else {
      const cantInicial = 1;
      setCarrito([
        ...carrito,
        {
          producto: p.producto,
          unidad: p.unidad,
          costo_unitario: p.costo_unitario,
          cantidad: cantInicial,
          subtotal: Number((cantInicial * p.costo_unitario).toFixed(2)),
          stock_disponible: p.stock_disponible
        }
      ]);
    }
  };

  // Modificar cantidad en carrito
  const actualizarCantidadCarrito = (prodNombre, nuevaCant) => {
    const c = parseFloat(nuevaCant);
    if (isNaN(c) || c <= 0) {
      eliminarDelCarrito(prodNombre);
      return;
    }
    setCarrito(carrito.map(it => it.producto === prodNombre ? {
      ...it,
      cantidad: c,
      subtotal: Number((c * it.costo_unitario).toFixed(2))
    } : it));
  };

  const eliminarDelCarrito = (prodNombre) => {
    setCarrito(carrito.filter(it => it.producto !== prodNombre));
  };

  // Totales del carrito y saldo
  const saldoActual = Number(datosHogar?.saldo || 0);
  const totalCarrito = useMemo(() => {
    return carrito.reduce((acc, it) => acc + (it.subtotal || 0), 0);
  }, [carrito]);

  const saldoRestante = Number((saldoActual - totalCarrito).toFixed(2));
  const saldoInsuficiente = totalCarrito > saldoActual;

  // Confirmar consumo del Hogar
  const handleConfirmarConsumo = async () => {
    if (carrito.length === 0 || saldoInsuficiente) return;

    setConfirmando(true);
    setMensajeError(null);
    setMensajeExito(null);

    const itemsPayload = carrito.map(it => ({
      producto: it.producto,
      kg: Number(it.cantidad)
    }));

    try {
      const res = await apiRegistrarSalidas({
        tipo: 'CASA',
        items: itemsPayload,
        pin: pinHogar
      });

      if (res && res.ok) {
        const nuevoSaldo = res.saldo !== undefined ? res.saldo : saldoRestante;
        setMensajeExito(`¡Consumo registrado correctamente! Tu nuevo saldo disponible es $${Number(nuevoSaldo).toLocaleString('es-AR')}`);
        setCarrito([]);
        await cargarInfoHogar();
        await cargarProductosDisponibles();
      } else {
        if (res?.error && res.error.toLowerCase().includes('pin')) {
          handleSalir();
        }
        setMensajeError(res?.error || 'No se pudo registrar el consumo.');
      }
    } catch (err) {
      setMensajeError(err.message || 'Error de red al registrar el consumo.');
    } finally {
      setConfirmando(false);
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
        return norm(p.producto).includes(q);
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
            El hogar todavía no tiene PIN. Pedile al administrador que lo configure desde la sección de administración.
          </p>
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
            <h1 className="text-xl font-black text-white tracking-tight">Hogar · Acceso Familia</h1>
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

          <p className="text-[10px] text-gray-600 text-center">
            El PIN se mantiene activo por 5 minutos de uso. Nunca se guarda en el teléfono.
          </p>
        </div>
      </div>
    );
  }

  // ── CASO C: PANTALLA PRINCIPAL DEL HOGAR ──────────────────────────────────
  return (
    <div className={`min-h-screen bg-[#0a0a0a] text-white ${standalone ? 'p-4 sm:p-6' : 'pt-16 pb-20 px-4 sm:px-6 lg:px-8'} max-w-7xl mx-auto`}>
      {/* Barra de cabecera con Saldo y Salir */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#121212] border border-gray-800 p-5 rounded-3xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-green-500/10 border border-green-500/30 flex items-center justify-center text-green-400">
            <Home size={24} />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block">
              Hogar Huerta Urbana
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-gray-400 font-bold">Disponible:</span>
              <span className="text-2xl sm:text-3xl font-mono font-black text-green-400">
                {$$(saldoActual)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <div className="flex bg-black/60 border border-gray-800 p-1 rounded-xl">
            <button
              onClick={() => setSubTab('tienda')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                subTab === 'tienda' ? 'bg-green-500 text-black shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              Productos
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
            onClick={handleSalir}
            className="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer border border-gray-700"
          >
            <LogOut size={13} />
            <span>Salir</span>
          </button>
        </div>
      </div>

      {/* Feedback de mensajes */}
      {mensajeExito && (
        <div className="mb-4 p-4 rounded-2xl bg-green-500/10 border border-green-500/30 text-green-300 text-xs flex items-center gap-2">
          <Check size={16} />
          <span>{mensajeExito}</span>
        </div>
      )}

      {mensajeError && (
        <div className="mb-4 p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
          <AlertCircle size={16} />
          <span>{mensajeError}</span>
        </div>
      )}

      {/* ── SUB-VISTA 1: TIENDA DEL HOGAR ──────────────────────────────── */}
      {subTab === 'tienda' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Columna Izquierda: Catálogo de productos con stock */}
          <div className="lg:col-span-8 space-y-4">
            {/* Buscador y chips */}
            <div className="bg-[#121212] border border-gray-800 p-3.5 rounded-2xl space-y-3">
              <div className="relative">
                <Search size={15} className="absolute left-3.5 top-2.5 text-gray-500" />
                <input
                  type="text"
                  placeholder="Buscar en lo que hay disponible..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="w-full bg-black/60 border border-gray-700 focus:border-green-500 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-gray-500 outline-none"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {['Todos', 'Verdura', 'Fruta', 'Almacén', 'Otros'].map(chip => (
                  <button
                    key={chip}
                    onClick={() => setCategoriaChip(chip)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
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

            {/* Grilla de productos con stock */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {cargandoProds ? (
                <div className="col-span-full py-12 text-center text-xs text-gray-500">
                  <RefreshCw size={18} className="animate-spin mx-auto mb-2 text-green-500" />
                  Cargando productos disponibles...
                </div>
              ) : productosFiltrados.length === 0 ? (
                <div className="col-span-full py-12 text-center text-xs text-gray-500 bg-[#121212] border border-gray-800 rounded-2xl p-6">
                  No hay productos con stock disponibles en esta selección.
                </div>
              ) : (
                productosFiltrados.map((p, idx) => {
                  const enCarrito = carrito.find(it => it.producto === p.producto);

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => agregarAlCarrito(p)}
                      className={`bg-[#121212] hover:bg-[#181818] border rounded-2xl p-3.5 text-left transition-all cursor-pointer flex flex-col justify-between space-y-2 relative ${
                        enCarrito ? 'border-green-500/60 ring-1 ring-green-500/30' : 'border-gray-800'
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

                      {enCarrito && (
                        <span className="absolute top-2 right-2 bg-green-500 text-black text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">
                          {enCarrito.cantidad}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Columna Derecha: Carrito de Compras del Hogar */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-[#121212] border border-gray-800 rounded-3xl p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                <h2 className="text-xs font-black uppercase text-white flex items-center gap-1.5">
                  <ShoppingCart size={15} className="text-green-400" /> Mi Carrito ({carrito.length})
                </h2>
                {carrito.length > 0 && (
                  <button
                    onClick={() => setCarrito([])}
                    className="text-[11px] text-red-400 hover:text-red-300 underline cursor-pointer"
                  >
                    Vaciar
                  </button>
                )}
              </div>

              {carrito.length === 0 ? (
                <div className="py-12 text-center text-xs text-gray-500 space-y-1">
                  <p>Tocá los productos de la izquierda para agregarlos al carrito.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {carrito.map((it, idx) => (
                    <div key={idx} className="bg-black/50 border border-gray-800 rounded-2xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white text-xs">{it.producto}</span>
                        <button
                          onClick={() => eliminarDelCarrito(it.producto)}
                          className="text-gray-500 hover:text-red-400"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 bg-black border border-gray-800 rounded-lg px-2 py-1">
                          <input
                            type="number"
                            step={it.unidad === 'kg' ? '0.1' : '1'}
                            value={it.cantidad}
                            onChange={(e) => actualizarCantidadCarrito(it.producto, e.target.value)}
                            className="w-14 bg-transparent text-right font-mono font-bold text-white outline-none"
                          />
                          <span className="text-[10px] text-gray-500">{it.unidad}</span>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] text-gray-500 block">
                            {$$(it.costo_unitario)} /{it.unidad}
                          </span>
                          <span className="font-mono font-black text-amber-300">
                            {$$(it.subtotal)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Resumen de Totales y Saldo Restante */}
              {carrito.length > 0 && (
                <div className="pt-3 border-t border-gray-800 space-y-2 text-xs">
                  <div className="flex justify-between items-center text-gray-400">
                    <span>Total del carrito:</span>
                    <span className="font-mono font-bold text-white text-base">
                      {$$(totalCarrito)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-gray-400">
                    <span>Saldo que quedaría:</span>
                    <span className={`font-mono font-bold text-sm ${saldoInsuficiente ? 'text-red-400' : 'text-green-400'}`}>
                      {$$(saldoRestante)}
                    </span>
                  </div>

                  {saldoInsuficiente && (
                    <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-bold flex items-center gap-1.5">
                      <AlertTriangle size={14} className="shrink-0" />
                      <span>Saldo insuficiente para confirmar este consumo.</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleConfirmarConsumo}
                    disabled={confirmando || saldoInsuficiente || carrito.length === 0}
                    className="w-full py-3 bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-lg shadow-green-500/20 text-xs mt-2"
                  >
                    {confirmando ? 'Registrando...' : 'Confirmar Consumo'}
                  </button>
                </div>
              )}
            </div>
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
