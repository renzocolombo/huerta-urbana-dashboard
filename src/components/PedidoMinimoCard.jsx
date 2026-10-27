import { useState, useEffect, useCallback } from 'react';
import { ShoppingBag, RefreshCw, AlertTriangle, CheckCircle2, AlertCircle, Info, ShieldAlert } from 'lucide-react';
import { apiGetPreciosWeb, apiPublicarPrecios } from '../utils/mercaderiaApi';
import { 
  validarPedidoMinimo, 
  generarMensajeMinimo, 
  formatearFechaActualizacion,
  UMBRAL_DOBLE_CONFIRMACION 
} from '../utils/pedidoMinimo';

export default function PedidoMinimoCard() {
  // Estado leído en vivo desde PreciosWeb
  const [actual, setActual] = useState({
    monto_minimo: null,
    mensaje_minimo: '',
    ultima_actualizacion: null,
  });
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState(null);

  // Formulario de edición
  const [montoInput, setMontoInput] = useState('');
  const [mensajeInput, setMensajeInput] = useState('');
  const [mensajeEditadoManualmente, setMensajeEditadoManualmente] = useState(false);

  // Estados de guardado y confirmación
  const [modalConfirmacion, setModalConfirmacion] = useState(false); // paso 1
  const [pasoDobleConfirmacion, setPasoDobleConfirmacion] = useState(false); // paso 2 (solo si < 10.000)
  const [guardando, setGuardando] = useState(false);
  const [feedback, setFeedback] = useState(null); // { tipo: 'exito' | 'error', mensaje: string }

  // Cargar datos actuales de PreciosWeb
  const cargarDatos = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const res = await apiGetPreciosWeb();
      if (res && res.ok) {
        const monto = res.monto_minimo !== undefined && res.monto_minimo !== null ? Number(res.monto_minimo) : 0;
        const mensaje = res.mensaje_minimo || generarMensajeMinimo(monto);
        setActual({
          monto_minimo: monto,
          mensaje_minimo: mensaje,
          ultima_actualizacion: res.ultima_actualizacion || res.actualizado || null,
        });

        // Inicializar formulario si está vacío o recién cargado
        setMontoInput(String(monto));
        setMensajeInput(mensaje);
        setMensajeEditadoManualmente(false);
      } else {
        setErrorCarga(res?.error || 'No se pudieron obtener los precios web.');
      }
    } catch (err) {
      setErrorCarga(err.message || 'Error de conexión al cargar pedido mínimo.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // Manejador del cambio de monto: si el mensaje no se editó a mano, se regenera automáticamente
  const handleMontoChange = (e) => {
    const val = e.target.value;
    setMontoInput(val);

    if (!mensajeEditadoManualmente) {
      if (val.trim() === '' || Number.isNaN(Number(val))) {
        setMensajeInput('El pedido mínimo es de $0');
      } else {
        setMensajeInput(generarMensajeMinimo(val));
      }
    }
  };

  // Manejador del cambio de mensaje a mano
  const handleMensajeChange = (e) => {
    setMensajeInput(e.target.value);
    setMensajeEditadoManualmente(true);
  };

  // Restablecer mensaje al formato automático
  const handleResetMensajeAuto = () => {
    setMensajeEditadoManualmente(false);
    setMensajeInput(generarMensajeMinimo(montoInput));
  };

  // Validación actual del monto
  const validacion = validarPedidoMinimo(montoInput);

  // Apertura de modal de confirmación
  const handleIniciarGuardar = (e) => {
    e.preventDefault();
    setFeedback(null);

    if (!validacion.valido) {
      setFeedback({ tipo: 'error', mensaje: validacion.error });
      return;
    }

    setPasoDobleConfirmacion(false);
    setModalConfirmacion(true);
  };

  // Confirmación y envío
  const handleConfirmarGuardado = async () => {
    if (guardando) return; // Evitar doble envío

    // Si es menor al umbral y aún no completó la advertencia extra
    if (validacion.pideDobleConfirmacion && !pasoDobleConfirmacion) {
      setPasoDobleConfirmacion(true);
      return;
    }

    setGuardando(true);
    setFeedback(null);

    try {
      const res = await apiPublicarPrecios({
        origen: 'mercaderia',
        productos: [],
        monto_minimo: validacion.montoNumero,
        mensaje_minimo: mensajeInput.trim() || generarMensajeMinimo(validacion.montoNumero),
      });

      if (res && res.ok) {
        setFeedback({
          tipo: 'exito',
          mensaje: `Pedido mínimo actualizado exitosamente a $${validacion.montoNumero.toLocaleString('es-AR')}.`,
        });
        setModalConfirmacion(false);
        setPasoDobleConfirmacion(false);
        // Recargar el valor en vivo
        await cargarDatos();
      } else {
        setFeedback({
          tipo: 'error',
          mensaje: res?.error || 'El servidor no pudo actualizar el pedido mínimo.',
        });
      }
    } catch (err) {
      setFeedback({
        tipo: 'error',
        mensaje: err.message || 'Error de red al actualizar pedido mínimo.',
      });
    } finally {
      setGuardando(false);
    }
  };

  const hayCambiosSinGuardar = actual.monto_minimo !== null && (
    Number(montoInput) !== Number(actual.monto_minimo) ||
    mensajeInput.trim() !== String(actual.mensaje_minimo || '').trim()
  );

  return (
    <div className="bg-[#121212] border border-gray-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
      {/* Encabezado de la tarjeta */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <ShoppingBag size={18} />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase text-white tracking-wide flex items-center gap-2">
              Pedido mínimo de compra
            </h2>
            <p className="text-[11px] text-gray-400">
              Control del umbral mínimo exigido en la tienda web (PreciosWeb)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={cargarDatos}
            disabled={cargando}
            title="Recargar estado desde PreciosWeb"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-gray-900 border border-gray-800 text-gray-400 hover:text-white transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={12} className={cargando ? 'animate-spin' : ''} />
            <span>{cargando ? 'Cargando...' : 'Actualizar'}</span>
          </button>
        </div>
      </div>

      {/* Alerta de error al cargar */}
      {errorCarga && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
          <AlertCircle size={15} className="shrink-0" />
          <span>{errorCarga}</span>
        </div>
      )}

      {/* Valores actuales en vivo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-black/50 border border-gray-800/80 p-3 rounded-xl">
          <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 block mb-1">
            Monto actual en la web
          </span>
          <span className="text-base sm:text-lg font-black font-mono text-amber-400">
            {actual.monto_minimo !== null ? `$${actual.monto_minimo.toLocaleString('es-AR')}` : '—'}
          </span>
        </div>

        <div className="bg-black/50 border border-gray-800/80 p-3 rounded-xl sm:col-span-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400">
              Mensaje actual en la web
            </span>
            <span className="text-[10px] text-gray-400 font-mono">
              Act.: {formatearFechaActualizacion(actual.ultima_actualizacion)}
            </span>
          </div>
          <span className="text-xs font-medium text-gray-200 block truncate" title={actual.mensaje_minimo}>
            {actual.mensaje_minimo || '—'}
          </span>
        </div>
      </div>

      {/* Formulario de edición */}
      <form onSubmit={handleIniciarGuardar} className="space-y-3 pt-1">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Campo Monto */}
          <div>
            <label htmlFor="input-monto-minimo" className="block text-xs font-bold text-gray-300 mb-1">
              Monto mínimo ($)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-gray-500 font-mono text-xs">$</span>
              <input
                id="input-monto-minimo"
                type="number"
                min="0"
                max="1000000"
                step="1"
                value={montoInput}
                onChange={handleMontoChange}
                placeholder="35000"
                className={`w-full bg-black/70 border rounded-xl pl-7 pr-3 py-2 text-xs font-mono text-white outline-none transition-all ${
                  !validacion.valido && montoInput !== ''
                    ? 'border-red-500/80 focus:border-red-500'
                    : 'border-gray-700 focus:border-amber-500'
                }`}
              />
            </div>
            {!validacion.valido && montoInput !== '' && (
              <p className="text-[10px] text-red-400 mt-1">{validacion.error}</p>
            )}
            {validacion.valido && validacion.pideDobleConfirmacion && (
              <p className="text-[10px] text-amber-400/90 mt-1 flex items-center gap-1">
                <AlertTriangle size={11} /> Monto menor a $10.000 (requerirá confirmación extra)
              </p>
            )}
          </div>

          {/* Campo Mensaje */}
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="input-mensaje-minimo" className="text-xs font-bold text-gray-300">
                Mensaje a mostrar en la web
              </label>
              {mensajeEditadoManualmente && (
                <button
                  type="button"
                  onClick={handleResetMensajeAuto}
                  className="text-[10px] text-amber-400 hover:text-amber-300 underline cursor-pointer"
                >
                  Restablecer formato automático
                </button>
              )}
            </div>
            <input
              id="input-mensaje-minimo"
              type="text"
              value={mensajeInput}
              onChange={handleMensajeChange}
              placeholder="El pedido mínimo es de $35.000"
              className="w-full bg-black/70 border border-gray-700 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-white outline-none transition-all"
            />
            <p className="text-[10px] text-gray-400 mt-1">
              {mensajeEditadoManualmente
                ? '✏️ Editado a mano (no se sobreescribe al cambiar el monto)'
                : '⚡ Mensaje automático (se actualiza solo al cambiar el monto)'}
            </p>
          </div>
        </div>

        {/* Feedback de resultado */}
        {feedback && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
              feedback.tipo === 'exito'
                ? 'bg-green-500/10 border border-green-500/30 text-green-300'
                : 'bg-red-500/10 border border-red-500/30 text-red-300'
            }`}
          >
            {feedback.tipo === 'exito' ? (
              <CheckCircle2 size={15} className="shrink-0 text-green-400" />
            ) : (
              <AlertCircle size={15} className="shrink-0 text-red-400" />
            )}
            <span>{feedback.mensaje}</span>
          </div>
        )}

        {/* Botón Guardar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <div className="text-[11px] text-gray-400 flex items-center gap-1.5">
            <Info size={13} className="text-gray-400 shrink-0" />
            <span>Al guardar sólo se actualiza el mínimo. Precios y combos se conservan intactos.</span>
          </div>

          <button
            type="submit"
            disabled={guardando || !validacion.valido || !hayCambiosSinGuardar}
            className={`w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer ${
              hayCambiosSinGuardar && validacion.valido && !guardando
                ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/20 scale-[1.01]'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700/60'
            }`}
          >
            <ShoppingBag size={14} />
            <span>{guardando ? 'Guardando...' : 'Guardar Mínimo'}</span>
          </button>
        </div>
      </form>

      {/* Modal / Diálogo de Confirmación */}
      {modalConfirmacion && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-gray-800 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            {/* Header del modal */}
            <div className="flex items-center gap-3 border-b border-gray-800 pb-3">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                  validacion.pideDobleConfirmacion
                    ? 'bg-red-500/10 border border-red-500/30 text-red-400'
                    : 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
                }`}
              >
                {validacion.pideDobleConfirmacion ? <ShieldAlert size={20} /> : <AlertTriangle size={20} />}
              </div>
              <div>
                <h3 className="text-sm font-black uppercase text-white">
                  {validacion.pideDobleConfirmacion && pasoDobleConfirmacion
                    ? 'Confirmación extra de seguridad'
                    : 'Confirmar pedido mínimo'}
                </h3>
                <p className="text-[11px] text-gray-400">
                  {validacion.pideDobleConfirmacion && pasoDobleConfirmacion
                    ? 'Paso 2 de 2: Verificación de valor bajo'
                    : 'Paso 1: Aplicar cambio a la tienda'}
                </p>
              </div>
            </div>

            {/* Contenido según paso */}
            {!pasoDobleConfirmacion ? (
              <div className="space-y-3">
                <div className="p-3.5 bg-black/50 border border-gray-800 rounded-2xl space-y-2">
                  <p className="text-xs text-gray-200 leading-relaxed font-semibold">
                    La web va a exigir un mínimo de{' '}
                    <strong className="text-amber-400 text-sm font-mono">
                      ${validacion.montoNumero?.toLocaleString('es-AR')}
                    </strong>{' '}
                    desde ahora.
                  </p>
                  <p className="text-[11px] text-gray-400 font-mono bg-black/60 p-2 rounded-lg border border-gray-800">
                    Mensaje: "{mensajeInput.trim()}"
                  </p>
                </div>

                {validacion.pideDobleConfirmacion && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-start gap-2">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                    <span>
                      <strong>Atención:</strong> El monto ingresado (${validacion.montoNumero?.toLocaleString('es-AR')}) es menor a $10.000. Al continuar se te solicitará una segunda confirmación.
                    </span>
                  </div>
                )}
              </div>
            ) : (
              /* Paso 2: Advertencia extra para montos menores a $10.000 */
              <div className="space-y-3">
                <div className="p-3.5 bg-red-500/10 border border-red-500/40 rounded-2xl space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-red-400 font-black uppercase tracking-wide">
                    <ShieldAlert size={16} />
                    <span>¿Estás seguro de que no es un valor de prueba?</span>
                  </div>
                  <p className="text-red-200 leading-relaxed">
                    Estás por configurar un pedido mínimo de sólo{' '}
                    <strong className="text-white font-mono text-sm">
                      ${validacion.montoNumero?.toLocaleString('es-AR')}
                    </strong>
                    .
                  </p>
                  <p className="text-gray-400 text-[11px]">
                    Si es un valor de testing accidental (como $100), los clientes podrán realizar compras por montos muy inferiores al costo operativo de entrega.
                  </p>
                </div>
              </div>
            )}

            {/* Botones de acción del modal */}
            <div className="flex gap-2 pt-2 border-t border-gray-800">
              <button
                type="button"
                disabled={guardando}
                onClick={() => {
                  setModalConfirmacion(false);
                  setPasoDobleConfirmacion(false);
                }}
                className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold rounded-xl text-xs cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={guardando}
                onClick={handleConfirmarGuardado}
                className={`flex-[2] py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-50 ${
                  validacion.pideDobleConfirmacion && pasoDobleConfirmacion
                    ? 'bg-red-500 hover:bg-red-400 text-white shadow-red-500/20'
                    : 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/20'
                }`}
              >
                {guardando ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : validacion.pideDobleConfirmacion && !pasoDobleConfirmacion ? (
                  <span>Continuar</span>
                ) : (
                  <span>Confirmar</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
