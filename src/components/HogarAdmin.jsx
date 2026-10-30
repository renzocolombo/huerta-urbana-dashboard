import { useState, useEffect } from 'react';
import { 
  ShieldCheck, DollarSign, Key, Lock, Plus, RefreshCw, 
  AlertCircle, AlertTriangle, CheckCircle2, History, X, Check, ArrowLeft,
  Scale
} from 'lucide-react';
import { 
  apiGetHogar, apiHogarCargar, apiSetHogarPin, apiSetAdminPin, apiGetConfig,
  apiGetStockKg, apiGetMovimientos, apiGetIngresos,
  getAdminPinSession, setAdminPinSession, clearAdminPinSession
} from '../utils/mercaderiaApi';
import { calcularBalanceProducto } from '../utils/balanceStock';

const $$ = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

export default function HogarAdmin({ onVolverEleccion }) {
  const [datosHogar, setDatosHogar] = useState(null);
  const [config, setConfig] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  // Sub-pestaña de auditoría
  const [subTabAdmin, setSubTabAdmin] = useState('movimientos'); // 'movimientos' | 'balance'
  const [balances, setBalances] = useState([]);

  // Modales
  const [modalCargar, setModalCargar] = useState(false);
  const [modalPinHogar, setModalPinHogar] = useState(false);
  const [modalPinAdmin, setModalPinAdmin] = useState(false);
  const [modalPedirAdminPin, setModalPedirAdminPin] = useState(null); // { onConfirm: (pin) => void, error: string }

  // Cargar datos de cuenta Hogar, configuración y balances
  const cargarTodo = async () => {
    setCargando(true);
    setError(null);
    try {
      const [resHogar, resConfig, resStock, resMov, resIngresos] = await Promise.all([
        apiGetHogar(),
        apiGetConfig(),
        apiGetStockKg().catch(() => null),
        apiGetMovimientos({ limite: 500 }).catch(() => null),
        apiGetIngresos(null, 500).catch(() => null)
      ]);

      if (resHogar && resHogar.ok) {
        setDatosHogar(resHogar);
      }
      if (resConfig && resConfig.ok) {
        setConfig(resConfig);
      }

      if (resStock && resStock.ok && Array.isArray(resStock.productos)) {
        const ingresos = (resIngresos && resIngresos.ok && Array.isArray(resIngresos.ingresos)) ? resIngresos.ingresos : [];
        const movimientos = (resMov && resMov.ok && Array.isArray(resMov.movimientos)) ? resMov.movimientos : [];

        const listaBalances = resStock.productos.map(p => {
          const prodNombre = p.producto;
          const costoUnit = Number(p.costo_kg_ultimo || p.costo || 0);

          const ings = ingresos.filter(ing => (ing.producto || '').toLowerCase().trim() === prodNombre.toLowerCase().trim());
          const totalIngresadoKg = ings.reduce((acc, it) => acc + (Number(it.kg_netos || it.kg) || 0), 0);

          const movs = movimientos.filter(m => (m.producto || '').toLowerCase().trim() === prodNombre.toLowerCase().trim());
          const mermasKg = movs.filter(m => m.tipo === 'MERMA').reduce((acc, it) => acc + (Number(it.kg) || 0), 0);
          const hogarKg = movs.filter(m => m.tipo === 'CASA').reduce((acc, it) => acc + (Number(it.kg) || 0), 0);

          const depositoKg = Number(p.en_deposito || 0);
          const vendidoKg = Number(p.comprometido || 0);

          return calcularBalanceProducto({
            producto: prodNombre,
            ingresado: totalIngresadoKg,
            vendido: vendidoKg,
            hogar: hogarKg,
            merma: mermasKg,
            deposito: depositoKg,
            costo_unitario: costoUnit
          });
        });

        setBalances(listaBalances);
      }
    } catch (e) {
      setError(e.message || 'Error cargando datos de administración.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarTodo();
  }, []);

  // Helper para ejecutar operaciones con PIN de Administrador (memoria 15 min)
  const ejecutarConAdminPin = (accionCallback) => {
    const pinMem = getAdminPinSession();
    if (pinMem) {
      accionCallback(pinMem);
      return;
    }
    setModalPedirAdminPin({
      error: null,
      onConfirm: (pinIngresado) => {
        setAdminPinSession(pinIngresado);
        setModalPedirAdminPin(null);
        accionCallback(pinIngresado);
      }
    });
  };

  const adminPinConfigurado = Boolean(config?.admin_pin_configurado);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pt-16 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Hogar &mdash; Administración
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Gestión de saldo familiar, claves de seguridad y auditoría de consumos
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          {onVolverEleccion && (
            <button
              onClick={onVolverEleccion}
              className="px-3 py-1.5 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-700 text-gray-300 hover:text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <ArrowLeft size={14} />
              <span>Cambiar modo</span>
            </button>
          )}
          <button
            onClick={cargarTodo}
            disabled={cargando}
            className="p-2 rounded-xl bg-gray-900 border border-gray-800 text-gray-400 hover:text-white cursor-pointer"
          >
            <RefreshCw size={15} className={cargando ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Alerta destacada si NO se configuró el PIN de Admin */}
      {!adminPinConfigurado && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg shadow-amber-500/5">
          <div className="flex items-center gap-2.5">
            <AlertTriangle size={20} className="shrink-0 text-amber-400" />
            <div>
              <p className="font-bold text-sm">Configurá tu PIN de administrador</p>
              <p className="text-xs text-amber-400/80">
                Es necesario para autorizar cargas de saldo, mermas y cambios de claves de seguridad.
              </p>
            </div>
          </div>
          <button
            onClick={() => setModalPinAdmin(true)}
            className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-black font-black text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer whitespace-nowrap self-start sm:self-center"
          >
            Configurar PIN Ahora
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
          {error}
        </div>
      )}

      {/* Tarjeta de Saldo y Acciones Rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Tarjeta Saldo */}
        <div className="bg-[#121212] border border-gray-800 rounded-3xl p-6 space-y-3 shadow-xl">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400 block">
            Saldo Actual del Hogar
          </span>
          <div className="text-3xl sm:text-4xl font-mono font-black text-green-400">
            {$$(datosHogar?.saldo || 0)}
          </div>
          <p className="text-[11px] text-gray-500">
            Monto disponible para que la familia registre consumos a precio de costo.
          </p>
          <button
            onClick={() => setModalCargar(true)}
            className="w-full py-2.5 bg-green-500 hover:bg-green-400 text-black font-black uppercase text-xs rounded-xl transition-all cursor-pointer shadow-md shadow-green-500/20 flex items-center justify-center gap-1.5 mt-2"
          >
            <Plus size={14} />
            <span>Cargar / Ajustar Saldo</span>
          </button>
        </div>

        {/* Tarjeta PIN del Hogar */}
        <div className="bg-[#121212] border border-gray-800 rounded-3xl p-6 space-y-3 shadow-xl flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-1">
              PIN de Acceso del Hogar
            </span>
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${datosHogar?.pin_configurado ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                {datosHogar?.pin_configurado ? 'Configurado' : 'Sin configurar'}
              </span>
            </div>
            <p className="text-[11px] text-gray-500 mt-2">
              Clave de 4 o 6 dígitos que usa la familia en su celular para ingresar al menú Hogar.
            </p>
          </div>
          <button
            onClick={() => setModalPinHogar(true)}
            className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold text-xs rounded-xl transition-all cursor-pointer border border-gray-700 flex items-center justify-center gap-1.5"
          >
            <Key size={14} />
            <span>Cambiar PIN del Hogar</span>
          </button>
        </div>

        {/* Tarjeta PIN de Administrador */}
        <div className="bg-[#121212] border border-gray-800 rounded-3xl p-6 space-y-3 shadow-xl flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-1">
              PIN de Administrador
            </span>
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${adminPinConfigurado ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'}`}>
                {adminPinConfigurado ? 'Configurado' : 'Pendiente'}
              </span>
            </div>
            <p className="text-[11px] text-gray-500 mt-2">
              Clave maestra requerida para autorizar mermas, correcciones y recargas de saldo.
            </p>
          </div>
          <button
            onClick={() => setModalPinAdmin(true)}
            className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold text-xs rounded-xl transition-all cursor-pointer border border-gray-700 flex items-center justify-center gap-1.5"
          >
            <Lock size={14} />
            <span>{adminPinConfigurado ? 'Cambiar PIN Admin' : 'Crear PIN Admin'}</span>
          </button>
        </div>
      </div>

      {/* Pestañas de Auditoría: Movimientos y Balance Exacto de Stock */}
      <div className="bg-[#121212] border border-gray-800 rounded-3xl overflow-hidden shadow-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-800 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSubTabAdmin('movimientos')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                subTabAdmin === 'movimientos' ? 'bg-amber-400 text-black shadow' : 'text-gray-400 hover:text-white bg-black/40 border border-gray-800'
              }`}
            >
              <History size={14} />
              <span>Movimientos Hogar ({datosHogar?.movimientos?.length || 0})</span>
            </button>
            <button
              onClick={() => setSubTabAdmin('balance')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                subTabAdmin === 'balance' ? 'bg-amber-400 text-black shadow' : 'text-gray-400 hover:text-white bg-black/40 border border-gray-800'
              }`}
            >
              <Scale size={14} />
              <span>Balance Exacto por Producto ({balances.length})</span>
            </button>
          </div>

          <span className="text-[11px] text-gray-500 font-mono">
            {subTabAdmin === 'movimientos' 
              ? `${datosHogar?.movimientos?.length || 0} registros` 
              : 'Auditoría en gramos enteros (0,000 kg)'}
          </span>
        </div>

        {/* ── SUB-VISTA A: HISTORIAL DE MOVIMIENTOS HOGAR ───────────────── */}
        {subTabAdmin === 'movimientos' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-black/60 border-b border-gray-800 text-gray-400 font-bold uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4">Fecha</th>
                  <th className="py-3 px-3">Tipo</th>
                  <th className="py-3 px-3 text-right">Monto</th>
                  <th className="py-3 px-3 text-right">Saldo Resultante</th>
                  <th className="py-3 px-4">Detalle / Nota</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60 font-medium">
                {(!datosHogar?.movimientos || datosHogar.movimientos.length === 0) ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-gray-500">
                      No hay movimientos registrados en el hogar aún.
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
                      <td className="py-3 px-4 text-gray-400 text-xs">{m.detalle || m.nota || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── SUB-VISTA B: PARTE 3 - BALANCE EXACTO POR PRODUCTO (SOLO LECTURA) ── */}
        {subTabAdmin === 'balance' && (
          <div className="space-y-3">
            <p className="text-[11px] text-gray-400">
              Cálculo en gramos enteros: <span className="font-mono text-gray-300">Diferencia = Ingresado - (Vendido + Hogar + Merma + Depósito)</span>. La diferencia exacta esperada es <strong className="text-green-400 font-mono">0,000 kg</strong>. Si hay descuadre aparece en <strong className="text-red-400 font-mono">rojo</strong>.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-black/60 border-b border-gray-800 text-gray-400 font-bold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-4">Producto</th>
                    <th className="py-3 px-3 text-right">Ingresado</th>
                    <th className="py-3 px-3 text-right">Vendido</th>
                    <th className="py-3 px-3 text-right">Hogar</th>
                    <th className="py-3 px-3 text-right">Merma</th>
                    <th className="py-3 px-3 text-right">Depósito</th>
                    <th className="py-3 px-3 text-right">Diferencia</th>
                    <th className="py-3 px-4 text-right">Valor Merma ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60 font-medium">
                  {balances.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-gray-500">
                        No hay productos registrados con stock en el sistema aún.
                      </td>
                    </tr>
                  ) : (
                    balances.map((b, idx) => (
                      <tr key={idx} className="hover:bg-white/[0.02]">
                        <td className="py-3 px-4 font-bold text-white">{b.producto}</td>
                        <td className="py-3 px-3 text-right font-mono text-gray-300">{b.ingresado.toFixed(3)} kg</td>
                        <td className="py-3 px-3 text-right font-mono text-blue-400">{b.vendido.toFixed(3)} kg</td>
                        <td className="py-3 px-3 text-right font-mono text-green-400">{b.hogar.toFixed(3)} kg</td>
                        <td className="py-3 px-3 text-right font-mono text-amber-400">{b.merma.toFixed(3)} kg</td>
                        <td className="py-3 px-3 text-right font-mono text-gray-200">{b.deposito.toFixed(3)} kg</td>
                        <td className="py-3 px-3 text-right">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                            b.esExacto 
                              ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
                              : 'bg-red-500/10 text-red-400 border border-red-500/30 font-black animate-pulse'
                          }`}>
                            {b.diferencia > 0 ? `+${b.diferencia.toFixed(3)}` : b.diferencia.toFixed(3)} kg
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-amber-300">
                          {$$(b.valor_merma_pesos)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL CARGAR SALDO ───────────────────────────────────────── */}
      {modalCargar && (
        <ModalCargarSaldo
          saldoActual={datosHogar?.saldo || 0}
          onClose={() => setModalCargar(false)}
          onSuccess={() => {
            setModalCargar(false);
            cargarTodo();
          }}
          ejecutarConAdminPin={ejecutarConAdminPin}
        />
      )}

      {/* ── MODAL CAMBIAR PIN HOGAR ──────────────────────────────────── */}
      {modalPinHogar && (
        <ModalCambiarPinHogar
          onClose={() => setModalPinHogar(false)}
          onSuccess={() => {
            setModalPinHogar(false);
            cargarTodo();
          }}
          ejecutarConAdminPin={ejecutarConAdminPin}
        />
      )}

      {/* ── MODAL CONFIGURAR PIN ADMIN ───────────────────────────────── */}
      {modalPinAdmin && (
        <ModalConfigurarPinAdmin
          adminPinConfigurado={adminPinConfigurado}
          onClose={() => setModalPinAdmin(false)}
          onSuccess={() => {
            setModalPinAdmin(false);
            cargarTodo();
          }}
        />
      )}

      {/* ── MODAL PEDIR PIN ADMIN (MEMORIA 15 MIN) ────────────────────── */}
      {modalPedirAdminPin && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-gray-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h2 className="text-sm font-black uppercase text-white flex items-center gap-2">
                <Lock size={16} className="text-amber-400" /> PIN de Administrador
              </h2>
              <button onClick={() => setModalPedirAdminPin(null)} className="text-gray-400 hover:text-white cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-gray-400">
              Ingresá tu PIN de administrador para autorizar esta operación.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const pinVal = e.target.elements.pinAdminInput.value;
                if (!pinVal.trim()) return;
                modalPedirAdminPin.onConfirm(pinVal.trim());
              }}
              className="space-y-3"
            >
              <input
                name="pinAdminInput"
                type="password"
                autoFocus
                placeholder="PIN Admin"
                className="w-full bg-black border border-gray-700 focus:border-amber-500 rounded-xl px-4 py-2.5 text-center text-lg font-mono tracking-widest text-white outline-none"
                required
              />

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setModalPedirAdminPin(null)}
                  className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-xl text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-[2] py-2 bg-amber-500 hover:bg-amber-400 text-black rounded-xl text-xs font-black uppercase tracking-wider"
                >
                  Autorizar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL: CARGAR SALDO AL HOGAR
// ─────────────────────────────────────────────────────────────────────────────
function ModalCargarSaldo({ saldoActual, onClose, onSuccess, ejecutarConAdminPin }) {
  const [monto, setMonto] = useState('');
  const [modo, setModo] = useState('sumar'); // 'sumar' | 'reemplazar'
  const [nota, setNota] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    const mNum = parseFloat(monto);
    if (isNaN(mNum) || mNum <= 0) {
      setError('Ingresá un monto válido en pesos.');
      return;
    }

    ejecutarConAdminPin(async (adminPin) => {
      setCargando(true);
      setError(null);

      try {
        const res = await apiHogarCargar({
          monto: mNum,
          modo,
          nota: nota.trim() || undefined,
          admin_pin: adminPin
        });

        if (res && res.ok) {
          onSuccess();
        } else {
          if (res?.error && res.error.toLowerCase().includes('pin')) {
            clearAdminPinSession();
          }
          setError(res?.error || 'No se pudo cargar el saldo.');
        }
      } catch (err) {
        setError(err.message || 'Error de red.');
      } finally {
        setCargando(false);
      }
    });
  };

  const nuevoSaldoEstimado = modo === 'sumar'
    ? (Number(saldoActual) + (Number(monto) || 0))
    : (Number(monto) || 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#121212] border border-gray-800 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <h2 className="text-sm font-black uppercase text-white flex items-center gap-2">
            <DollarSign size={16} className="text-green-400" /> Cargar Saldo al Hogar
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-gray-400 uppercase font-bold mb-1">Monto en Pesos ($) *</label>
            <input
              type="number"
              step="any"
              placeholder="Ej: 50000"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              className="w-full bg-black/60 border border-gray-700 focus:border-green-500 rounded-xl px-4 py-2.5 text-lg font-mono font-bold text-white outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-gray-400 uppercase font-bold mb-1.5">Modo de Carga</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setModo('sumar')}
                className={`py-2 px-3 rounded-xl font-bold cursor-pointer transition-all ${
                  modo === 'sumar'
                    ? 'bg-green-500 text-black shadow'
                    : 'bg-black border border-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                + Sumar al saldo
              </button>
              <button
                type="button"
                onClick={() => setModo('reemplazar')}
                className={`py-2 px-3 rounded-xl font-bold cursor-pointer transition-all ${
                  modo === 'reemplazar'
                    ? 'bg-amber-500 text-black shadow'
                    : 'bg-black border border-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                = Reemplazar saldo
              </button>
            </div>
          </div>

          <div>
            <label className="block text-gray-400 uppercase font-bold mb-1">Nota o Motivo (opcional)</label>
            <input
              type="text"
              placeholder="Ej: Asignación quincenal, Ajuste..."
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              className="w-full bg-black/60 border border-gray-700 rounded-xl px-3 py-2 text-white outline-none"
            />
          </div>

          <div className="p-3 rounded-xl bg-black/40 border border-gray-800 flex justify-between items-center">
            <span className="text-gray-400">Saldo resultante:</span>
            <span className="font-mono font-black text-green-400 text-base">
              {$$(nuevoSaldoEstimado)}
            </span>
          </div>

          {error && <div className="p-2.5 rounded-xl bg-red-500/10 text-red-300">{error}</div>}

          <button
            type="submit"
            disabled={cargando}
            className="w-full py-2.5 bg-green-500 hover:bg-green-400 text-black font-black uppercase rounded-xl transition-all cursor-pointer disabled:opacity-50"
          >
            {cargando ? 'Cargando saldo...' : 'Confirmar Carga'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL: CAMBIAR PIN DEL HOGAR
// ─────────────────────────────────────────────────────────────────────────────
function ModalCambiarPinHogar({ onClose, onSuccess, ejecutarConAdminPin }) {
  const [pinNuevo, setPinNuevo] = useState('');
  const [pinConfirmar, setPinConfirmar] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (pinNuevo.length < 4) {
      setError('El PIN debe tener al menos 4 dígitos.');
      return;
    }
    if (pinNuevo !== pinConfirmar) {
      setError('Los PINs no coinciden.');
      return;
    }

    ejecutarConAdminPin(async (adminPin) => {
      setCargando(true);
      setError(null);

      try {
        const res = await apiSetHogarPin({
          pin_nuevo: pinNuevo.trim(),
          admin_pin: adminPin
        });

        if (res && res.ok) {
          onSuccess();
        } else {
          if (res?.error && res.error.toLowerCase().includes('pin')) {
            clearAdminPinSession();
          }
          setError(res?.error || 'No se pudo actualizar el PIN del hogar.');
        }
      } catch (err) {
        setError(err.message || 'Error de red.');
      } finally {
        setCargando(false);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#121212] border border-gray-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <h2 className="text-sm font-black uppercase text-white flex items-center gap-2">
            <Key size={16} className="text-green-400" /> Cambiar PIN del Hogar
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block text-gray-400 uppercase font-bold mb-1">Nuevo PIN del Hogar</label>
            <input
              type="password"
              placeholder="4 a 6 dígitos"
              value={pinNuevo}
              onChange={(e) => setPinNuevo(e.target.value)}
              className="w-full bg-black/60 border border-gray-700 rounded-xl px-3 py-2 text-center text-lg font-mono text-white outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-gray-400 uppercase font-bold mb-1">Confirmar Nuevo PIN</label>
            <input
              type="password"
              placeholder="Repetí el PIN"
              value={pinConfirmar}
              onChange={(e) => setPinConfirmar(e.target.value)}
              className="w-full bg-black/60 border border-gray-700 rounded-xl px-3 py-2 text-center text-lg font-mono text-white outline-none"
              required
            />
          </div>

          {error && <div className="p-2.5 rounded-xl bg-red-500/10 text-red-300">{error}</div>}

          <button
            type="submit"
            disabled={cargando}
            className="w-full py-2.5 bg-green-500 hover:bg-green-400 text-black font-black uppercase rounded-xl transition-all cursor-pointer disabled:opacity-50 mt-2"
          >
            {cargando ? 'Guardando...' : 'Actualizar PIN Hogar'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL: CONFIGURAR PIN DE ADMINISTRADOR
// ─────────────────────────────────────────────────────────────────────────────
function ModalConfigurarPinAdmin({ adminPinConfigurado, onClose, onSuccess }) {
  const [pinActual, setPinActual] = useState('');
  const [pinNuevo, setPinNuevo] = useState('');
  const [pinConfirmar, setPinConfirmar] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (adminPinConfigurado && !pinActual.trim()) {
      setError('Ingresá tu PIN actual.');
      return;
    }
    if (pinNuevo.length < 4) {
      setError('El nuevo PIN debe tener al menos 4 dígitos.');
      return;
    }
    if (pinNuevo !== pinConfirmar) {
      setError('Los nuevos PINs no coinciden.');
      return;
    }

    setCargando(true);
    setError(null);

    try {
      const res = await apiSetAdminPin({
        pin_nuevo: pinNuevo.trim(),
        pin_actual: adminPinConfigurado ? pinActual.trim() : undefined
      });

      if (res && res.ok) {
        setAdminPinSession(pinNuevo.trim());
        onSuccess();
      } else {
        setError(res?.error || 'No se pudo configurar el PIN de administrador.');
      }
    } catch (err) {
      setError(err.message || 'Error de red.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#121212] border border-gray-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <h2 className="text-sm font-black uppercase text-white flex items-center gap-2">
            <Lock size={16} className="text-amber-400" />
            {adminPinConfigurado ? 'Cambiar PIN Admin' : 'Configurar PIN Admin'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          {adminPinConfigurado && (
            <div>
              <label className="block text-gray-400 uppercase font-bold mb-1">PIN Actual de Administrador</label>
              <input
                type="password"
                placeholder="PIN actual"
                value={pinActual}
                onChange={(e) => setPinActual(e.target.value)}
                className="w-full bg-black/60 border border-gray-700 rounded-xl px-3 py-2 text-center text-lg font-mono text-white outline-none"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-gray-400 uppercase font-bold mb-1">Nuevo PIN de Administrador</label>
            <input
              type="password"
              placeholder="Nuevo PIN"
              value={pinNuevo}
              onChange={(e) => setPinNuevo(e.target.value)}
              className="w-full bg-black/60 border border-gray-700 rounded-xl px-3 py-2 text-center text-lg font-mono text-white outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-gray-400 uppercase font-bold mb-1">Confirmar Nuevo PIN</label>
            <input
              type="password"
              placeholder="Repetí el nuevo PIN"
              value={pinConfirmar}
              onChange={(e) => setPinConfirmar(e.target.value)}
              className="w-full bg-black/60 border border-gray-700 rounded-xl px-3 py-2 text-center text-lg font-mono text-white outline-none"
              required
            />
          </div>

          {error && <div className="p-2.5 rounded-xl bg-red-500/10 text-red-300">{error}</div>}

          <button
            type="submit"
            disabled={cargando}
            className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase rounded-xl transition-all cursor-pointer disabled:opacity-50 mt-2"
          >
            {cargando ? 'Guardando...' : 'Guardar PIN Admin'}
          </button>
        </form>
      </div>
    </div>
  );
}
