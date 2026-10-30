import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Loader2, AlertTriangle, RefreshCw, CalendarDays,
  X, Download, Sun, Sunset, Clock, Package, CheckCircle, TrendingUp, TrendingDown, Minus
} from 'lucide-react';
import { apiGetCalendario, apiSetDiaCalendario, apiSembrarFeriados } from '../utils/mercaderiaApi';
import {
  mapaCalendario, estadoDelDia, accionesDelDia, semanasDelMes, ESTADOS_DIA,
  metricasDia, metricasMes, turnoDePedido,
} from '../utils/agendaCalendario';
import { calcularDetalleYTotalesDia } from '../utils/calendarioTotales';
import { useGoogleSheets } from '../context/GoogleSheetsContext';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS_CAB = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];

const ESTILO = {
  normal:  { celda: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-100', punto: 'bg-emerald-400' },
  sabado:  { celda: 'bg-amber-500/10 border-amber-500/30 text-amber-100',       punto: 'bg-amber-400' },
  domingo: { celda: 'bg-gray-700/30 border-gray-600/40 text-gray-400',          punto: 'bg-gray-500' },
  feriado: { celda: 'bg-red-500/15 border-red-500/40 text-red-100',             punto: 'bg-red-400' },
  abierto: { celda: 'bg-sky-500/15 border-sky-500/40 text-sky-100',             punto: 'bg-sky-400' },
  cerrado: { celda: 'bg-fuchsia-500/15 border-fuchsia-500/40 text-fuchsia-100', punto: 'bg-fuchsia-400' },
};

function fmtLargo(ymd) {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

export default function CalendarioEntregas({ conteo = {}, hoyYMD, onCambio, pedidos: pedidosProp, preparaciones = {} }) {
  const [anio, setAnio] = useState(() => Number(hoyYMD.slice(0, 4)));
  const [mes, setMes] = useState(() => Number(hoyYMD.slice(5, 7)));
  const [dias, setDias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [seleccionado, setSeleccionado] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [confirmando, setConfirmando] = useState(null); // accion pendiente de confirmar
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null); // { tipo: 'ok' | 'error', texto }
  const [sembrando, setSembrando] = useState(false);
  const [turnosAbiertos, setTurnosAbiertos] = useState({});
  const enVuelo = useRef(false);

  const toggleTurno = (nombre) => {
    setTurnosAbiertos((prev) => ({
      ...prev,
      [nombre]: !prev[nombre],
    }));
  };

  // Obtener pedidos de props o de contexto
  let sheetsCtx = null;
  try {
    sheetsCtx = useGoogleSheets();
  } catch (e) {
    // Para contextos de prueba aislados
  }
  const todosLosPedidos = useMemo(() => {
    if (pedidosProp && Array.isArray(pedidosProp) && pedidosProp.length > 0) return pedidosProp;
    return sheetsCtx?.pedidos || [];
  }, [pedidosProp, sheetsCtx?.pedidos]);

  // Metricas mensuales (se actualizan al cambiar anio/mes)
  const mesMetricas = useMemo(() => metricasMes(todosLosPedidos, anio, mes), [todosLosPedidos, anio, mes]);

  // Metricas del dia seleccionado
  const diaMetricas = useMemo(() => seleccionado ? metricasDia(todosLosPedidos, seleccionado) : null, [todosLosPedidos, seleccionado]);

  // Detalle y totales por turno y del día seleccionado (con cálculo exacto/estimado)
  const diaTotales = useMemo(() => {
    if (!seleccionado) return null;
    return calcularDetalleYTotalesDia(todosLosPedidos, seleccionado, preparaciones);
  }, [todosLosPedidos, seleccionado, preparaciones]);

  const aplicarResultado = useCallback((r) => {
    if (!r.ok || !Array.isArray(r.dias)) {
      setError(r.error || 'No se pudo leer el calendario.');
      setCargando(false);
      return null;
    }
    setDias(r.dias);
    setCargando(false);
    return r.dias;
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    return aplicarResultado(await apiGetCalendario());
  }, [aplicarResultado]);

  // Carga inicial (cargando ya arranca en true)
  useEffect(() => {
    let vivo = true;
    apiGetCalendario().then((r) => { if (vivo) aplicarResultado(r); });
    return () => { vivo = false; };
  }, [aplicarResultado]);

  const mapa = useMemo(() => mapaCalendario(dias), [dias]);
  const semanas = useMemo(() => semanasDelMes(anio, mes), [anio, mes]);

  const moverMes = (delta) => {
    let m = mes + delta, a = anio;
    if (m < 1) { m = 12; a -= 1; }
    if (m > 12) { m = 1; a += 1; }
    setMes(m); setAnio(a); setSeleccionado(null); setConfirmando(null); setTurnosAbiertos({});
  };

  const elegirDia = (ymd) => {
    setSeleccionado(ymd);
    setMotivo(mapa[ymd]?.motivo || '');
    setConfirmando(null);
    setAviso(null);
    setTurnosAbiertos({});
  };

  const aplicar = async (accion) => {
    if (!seleccionado || enVuelo.current) return;
    const n = diaTotales?.totalPedidos ?? (diaMetricas?.total ?? (conteo[seleccionado] || 0));
    if (accion === 'cerrar' && n > 0 && confirmando !== 'cerrar') {
      setConfirmando('cerrar');
      return;
    }
    enVuelo.current = true;
    setGuardando(true);
    setAviso(null);
    const estado = accion === 'cerrar' ? 'cerrado' : accion === 'abrir' ? 'abierto' : 'normal';
    const r = await apiSetDiaCalendario(seleccionado, estado, accion === 'normal' ? '' : motivo);
    if (!r.ok) {
      setAviso({ tipo: 'error', texto: r.error || 'No se pudo guardar el cambio.' });
    } else {
      const nuevos = await cargar();
      if (nuevos) {
        setAviso({ tipo: 'ok', texto: `Guardado: ${fmtLargo(seleccionado)}.` });
        if (onCambio) onCambio();
      }
    }
    setConfirmando(null);
    setGuardando(false);
    enVuelo.current = false;
  };

  const sembrar = async () => {
    if (sembrando || enVuelo.current) return;
    enVuelo.current = true;
    setSembrando(true);
    setAviso(null);
    const antes = dias.length;
    const r = await apiSembrarFeriados();
    if (!r.ok) {
      setAviso({ tipo: 'error', texto: r.error || 'No se pudieron cargar los feriados.' });
    } else {
      const nuevos = await cargar();
      if (nuevos) {
        const agregados = Math.max(0, nuevos.length - antes);
        setAviso({ tipo: 'ok', texto: agregados === 0 ? 'Los feriados nacionales ya estaban cargados (0 agregados).' : `Se agregaron ${agregados} feriados nacionales.` });
        if (onCambio) onCambio();
      }
    }
    setSembrando(false);
    enVuelo.current = false;
  };

  const acciones = seleccionado ? accionesDelDia(seleccionado, mapa, hoyYMD) : [];
  const estadoSel = seleccionado ? estadoDelDia(seleccionado, mapa) : null;
  const nSel = diaTotales?.totalPedidos ?? (diaMetricas?.total ?? (seleccionado ? (conteo[seleccionado] || 0) : 0));
  const listaVacia = !cargando && !error && dias.length === 0;

  const mesAnteriorIdx = (mes === 1 ? 12 : mes - 1) - 1;

  return (
    <div id="calendario-entregas" className="space-y-4">
      {/* Barra superior de navegacion de mes */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#111827]/80 border border-white/5 p-3 rounded-2xl">
        <div className="flex items-center gap-2">
          <button id="cal-mes-anterior" type="button" onClick={() => moverMes(-1)} className="p-2 rounded-xl bg-[#1f2937] border border-gray-700 hover:border-gray-500 text-gray-300 cursor-pointer" title="Mes anterior">
            <ChevronLeft size={16} />
          </button>
          <div className="min-w-[150px] text-center text-white font-black text-base flex items-center justify-center gap-2">
            <CalendarDays size={16} className="text-green-400" />
            {MESES[mes - 1]} {anio}
          </div>
          <button id="cal-mes-siguiente" type="button" onClick={() => moverMes(1)} className="p-2 rounded-xl bg-[#1f2937] border border-gray-700 hover:border-gray-500 text-gray-300 cursor-pointer" title="Mes siguiente">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button id="cal-recargar" type="button" onClick={cargar} disabled={cargando} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#1f2937] border border-gray-700 text-gray-300 hover:text-white cursor-pointer disabled:opacity-50">
            <RefreshCw size={13} className={cargando ? 'animate-spin' : ''} /> Recargar
          </button>
          <button
            id="cal-sembrar"
            type="button"
            onClick={sembrar}
            disabled={sembrando || cargando}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black border cursor-pointer disabled:opacity-50 ${listaVacia ? 'bg-green-600 hover:bg-green-500 border-green-400/40 text-white shadow-md animate-pulse' : 'bg-[#1f2937] border-gray-700 text-gray-300 hover:text-white'}`}
            title="Carga los feriados nacionales que falten (no duplica)"
          >
            {sembrando ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            Cargar feriados nacionales
          </button>
        </div>
      </div>

      {/* ═══════ REQUISITO 3: TARJETA DEL MES ═══════ */}
      <div id="cal-tarjeta-mes" className="bg-[#111827]/80 border border-white/5 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-2.5">
          <div className="flex items-center gap-2">
            <CalendarDays size={18} className="text-emerald-400" />
            <h3 className="text-white font-black text-sm tracking-wide">
              Resumen mensual: {MESES[mes - 1]} {anio}
            </h3>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-bold">
            <span className="text-gray-400">vs {MESES[mesAnteriorIdx]}:</span>
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg border text-xs font-bold ${
              mesMetricas.diferenciaMesAnterior > 0
                ? 'bg-green-500/10 text-green-300 border-green-500/30'
                : mesMetricas.diferenciaMesAnterior < 0
                ? 'bg-red-500/10 text-red-300 border-red-500/30'
                : 'bg-gray-700/30 text-gray-400 border-gray-600/40'
            }`}>
              {mesMetricas.diferenciaMesAnterior > 0 && <TrendingUp size={13} />}
              {mesMetricas.diferenciaMesAnterior < 0 && <TrendingDown size={13} />}
              {mesMetricas.diferenciaMesAnterior === 0 && <Minus size={13} />}
              {mesMetricas.diferenciaMesAnterior > 0 ? `+${mesMetricas.diferenciaMesAnterior}` : mesMetricas.diferenciaMesAnterior} ({mesMetricas.totalMesAnterior} ant.)
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* Total pedidos del mes */}
          <div className="bg-[#1f2937]/60 border border-gray-800 rounded-xl p-3 flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold text-gray-400 flex items-center gap-1.5">
              <Package size={13} className="text-blue-400" /> Total Mes
            </span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl font-black text-white">{mesMetricas.total}</span>
              <span className="text-[10px] text-gray-500 font-medium">pedidos</span>
            </div>
          </div>

          {/* Entregados */}
          <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-3 flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold text-green-400/80 flex items-center gap-1.5">
              <CheckCircle size={13} className="text-green-400" /> Entregados
            </span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl font-black text-green-300">{mesMetricas.entregados}</span>
              <span className="text-[10px] text-gray-500 font-medium">completados</span>
            </div>
          </div>

          {/* Pendientes */}
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold text-amber-400/80 flex items-center gap-1.5">
              <Clock size={13} className="text-amber-400" /> Pendientes
            </span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl font-black text-amber-300">{mesMetricas.pendientes}</span>
              <span className="text-[10px] text-gray-500 font-medium">por entregar</span>
            </div>
          </div>

          {/* Cancelados / No entregados */}
          <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold text-red-400/80 flex items-center gap-1.5">
              <X size={13} className="text-red-400" /> Cancel / No Entr.
            </span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl font-black text-red-300">{mesMetricas.canceladosNoEntregados}</span>
              <span className="text-[10px] text-gray-500 font-medium">cancel / fallidos</span>
            </div>
          </div>
        </div>

        {/* Fila de turnos del mes: Mañana, Tarde y Suma */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-1">Turnos del mes:</span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 font-bold">
            <Sun size={13} /> Mañana: {mesMetricas.manana}
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 font-bold">
            <Sunset size={13} /> Tarde: {mesMetricas.tarde}
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-black">
            Suma (M + T): {mesMetricas.sumaMananaTarde}
          </span>
          {mesMetricas.sinTurno > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-gray-700/40 border border-gray-600 text-gray-400 font-medium">
              <Clock size={13} /> Sin turno: {mesMetricas.sinTurno}
            </span>
          )}
        </div>
      </div>

      {listaVacia && (
        <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
          No hay feriados cargados todavia. Tocá "Cargar feriados nacionales" para sembrarlos.
        </div>
      )}

      {aviso && (
        <div className={`text-xs font-bold rounded-xl px-3 py-2 border ${aviso.tipo === 'ok' ? 'bg-green-500/10 border-green-500/30 text-green-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
          {aviso.texto}
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between gap-3 bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl px-3 py-2 text-xs font-bold">
          <span className="flex items-center gap-2"><AlertTriangle size={14} /> {error}</span>
          <button type="button" onClick={cargar} className="underline cursor-pointer">Reintentar</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 items-start">
        {/* Grilla mensual */}
        <div className="bg-[#111827]/60 border border-white/5 rounded-2xl p-2 sm:p-3 relative">
          {cargando && (
            <div className="absolute inset-0 z-10 bg-black/40 rounded-2xl flex items-center justify-center">
              <Loader2 size={24} className="animate-spin text-green-400" />
            </div>
          )}
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1.5">
            {DIAS_CAB.map((d) => (
              <div key={d} className="text-center text-[10px] sm:text-[11px] uppercase font-black tracking-wider text-gray-500">{d}</div>
            ))}
          </div>
          <div className="space-y-1 sm:space-y-1.5">
            {semanas.map((fila, i) => (
              <div key={i} className="grid grid-cols-7 gap-1 sm:gap-1.5">
                {fila.map((ymd, j) => {
                  if (!ymd) return <div key={j} className="min-h-[56px] sm:min-h-[76px]" />;
                  const est = estadoDelDia(ymd, mapa);
                  const n = conteo[ymd] || 0;
                  const esHoy = ymd === hoyYMD;
                  const esPasado = ymd < hoyYMD;
                  const sel = ymd === seleccionado;
                  return (
                    <button
                      key={ymd}
                      id={`cal-dia-${ymd}`}
                      type="button"
                      onClick={() => elegirDia(ymd)}
                      className={`min-h-[56px] sm:min-h-[76px] rounded-xl border p-1 sm:p-1.5 text-left flex flex-col justify-between transition-all cursor-pointer ${ESTILO[est].celda} ${esPasado ? 'opacity-50' : 'hover:scale-[1.03]'} ${sel ? 'ring-2 ring-white/70' : ''} ${esHoy ? 'outline outline-2 outline-green-400' : ''}`}
                      title={`${fmtLargo(ymd)} · ${ESTADOS_DIA[est].etiqueta}${mapa[ymd]?.motivo ? ` · ${mapa[ymd].motivo}` : ''}`}
                    >
                      <div className="flex items-start justify-between">
                        <span className="text-xs sm:text-sm font-black">{Number(ymd.slice(8))}</span>
                        <span className={`w-2 h-2 rounded-full mt-1 ${ESTILO[est].punto}`} />
                      </div>
                      <div className="leading-tight">
                        <span className="hidden sm:block text-[9px] uppercase font-bold opacity-80 truncate">{ESTADOS_DIA[est].etiqueta}</span>
                        {n > 0 && (
                          <span className="inline-block mt-0.5 text-[10px] font-black bg-black/40 border border-white/15 rounded-md px-1">
                            {n} <span className="hidden sm:inline">{n === 1 ? 'pedido' : 'pedidos'}</span>
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Leyenda */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-white/5">
            {Object.values(ESTADOS_DIA).map((e) => (
              <span key={e.clave} className="flex items-center gap-1.5 text-[11px] text-gray-400">
                <span className={`w-2.5 h-2.5 rounded-full ${ESTILO[e.clave].punto}`} /> {e.etiqueta}
              </span>
            ))}
          </div>
        </div>

        {/* ═══════ REQUISITO 2: TARJETA DEL DÍA (al tocar un día) ═══════ */}
        <div id="cal-panel-dia" className="bg-[#111827]/80 border border-white/5 rounded-2xl p-4 space-y-4">
          {!seleccionado ? (
            <div className="text-center py-8 space-y-2">
              <CalendarDays size={28} className="mx-auto text-gray-600" />
              <p className="text-xs text-gray-400 font-medium">Tocá un día del calendario para ver su estado, resumen y pedidos.</p>
            </div>
          ) : (
            <>
              {/* Encabezado del dia */}
              <div className="flex items-start justify-between gap-2 border-b border-white/5 pb-3">
                <div>
                  <p className="text-white font-black text-base">{fmtLargo(seleccionado)}</p>
                  <span className={`inline-block mt-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border ${ESTILO[estadoSel].celda}`}>
                    {ESTADOS_DIA[estadoSel].etiqueta}
                  </span>
                  {mapa[seleccionado]?.motivo && <p className="text-[11px] text-gray-400 mt-1">Motivo: {mapa[seleccionado].motivo}</p>}
                </div>
                <button type="button" onClick={() => setSeleccionado(null)} className="text-gray-500 hover:text-white cursor-pointer p-1">
                  <X size={16} />
                </button>
              </div>

              {/* Resumen de conteos del día con botones interactivos por turno */}
              <div className="bg-[#1f2937]/50 border border-gray-800 rounded-xl p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase font-bold text-gray-400">Total del día:</span>
                  <span className="text-sm font-black text-white">
                    {diaTotales?.totalPedidos ?? nSel} {(diaTotales?.totalPedidos ?? nSel) === 1 ? 'pedido' : 'pedidos'}
                  </span>
                </div>

                {/* Desglose rápido por turnos interactivos (toque para abrir/cerrar) */}
                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => toggleTurno('Mañana')}
                    className={`p-2 rounded-lg text-center border transition-all cursor-pointer ${
                      turnosAbiertos['Mañana']
                        ? 'bg-amber-500/25 border-amber-500/50 ring-1 ring-amber-400/50'
                        : 'bg-amber-500/10 border-amber-500/25 hover:bg-amber-500/15'
                    }`}
                    title="Tocar para ver detalle del turno Mañana"
                  >
                    <span className="text-[10px] font-bold text-amber-300 flex items-center justify-center gap-1">
                      <Sun size={11} /> Mañana
                    </span>
                    <span className="text-sm font-black text-white mt-0.5 block">
                      {diaTotales?.turnos.Mañana.cantidad ?? (diaMetricas?.manana || 0)}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleTurno('Tarde')}
                    className={`p-2 rounded-lg text-center border transition-all cursor-pointer ${
                      turnosAbiertos['Tarde']
                        ? 'bg-indigo-500/25 border-indigo-500/50 ring-1 ring-indigo-400/50'
                        : 'bg-indigo-500/10 border-indigo-500/25 hover:bg-indigo-500/15'
                    }`}
                    title="Tocar para ver detalle del turno Tarde"
                  >
                    <span className="text-[10px] font-bold text-indigo-300 flex items-center justify-center gap-1">
                      <Sunset size={11} /> Tarde
                    </span>
                    <span className="text-sm font-black text-white mt-0.5 block">
                      {diaTotales?.turnos.Tarde.cantidad ?? (diaMetricas?.tarde || 0)}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleTurno('Sin turno')}
                    className={`p-2 rounded-lg text-center border transition-all cursor-pointer ${
                      turnosAbiertos['Sin turno']
                        ? 'bg-gray-700/50 border-gray-500 ring-1 ring-gray-400/50'
                        : 'bg-gray-700/30 border-gray-600/40 hover:bg-gray-700/40'
                    }`}
                    title="Tocar para ver detalle sin turno asignado"
                  >
                    <span className="text-[10px] font-bold text-gray-300 flex items-center justify-center gap-1">
                      <Clock size={11} /> Sin turno
                    </span>
                    <span className="text-sm font-black text-white mt-0.5 block">
                      {diaTotales?.turnos['Sin turno'].cantidad ?? (diaMetricas?.sinTurno || 0)}
                    </span>
                  </button>
                </div>
              </div>

              {/* Renglones expandibles de Turnos con detalle y pie de turno */}
              <div className="space-y-2.5">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                  Turnos de entrega:
                </span>

                {/* ── TURNO MAÑANA ── */}
                <div id="cal-turno-manana-contenedor" className="border border-white/5 rounded-xl overflow-hidden bg-[#1f2937]/30">
                  <button
                    id="cal-turno-manana-btn"
                    type="button"
                    onClick={() => toggleTurno('Mañana')}
                    className="w-full p-2.5 sm:p-3 flex items-center justify-between text-left hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                        <Sun size={13} className="text-amber-400" />
                      </div>
                      <span className="font-bold text-xs sm:text-sm text-white">Mañana</span>
                      <span className="text-[11px] text-amber-300/90 font-medium truncate">
                        ({diaTotales?.turnos.Mañana.cantidad || 0} {diaTotales?.turnos.Mañana.cantidad === 1 ? 'pedido' : 'pedidos'})
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <span className="text-xs font-bold text-amber-300 block">
                          ${(diaTotales?.turnos.Mañana.total || 0).toLocaleString('es-AR')}
                          {diaTotales?.turnos.Mañana.tieneEstimados && (
                            <span className="text-[10px] text-amber-400 font-semibold ml-1">est.</span>
                          )}
                        </span>
                      </div>
                      <ChevronDown
                        size={15}
                        className={`text-gray-400 transition-transform duration-200 ${
                          turnosAbiertos['Mañana'] ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </button>

                  {turnosAbiertos['Mañana'] && (
                    <div id="cal-turno-manana-detalle" className="p-2.5 sm:p-3 pt-0 border-t border-white/5 space-y-2">
                      {(!diaTotales || diaTotales.turnos.Mañana.pedidos.length === 0) ? (
                        <p className="text-xs text-gray-500 italic py-2">Sin pedidos para el turno Mañana.</p>
                      ) : (
                        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-0.5">
                          {diaTotales.turnos.Mañana.pedidos.map((it) => (
                            <div
                              key={it.numero_pedido}
                              className="bg-black/40 border border-white/5 rounded-xl p-2.5 space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-xs font-black text-green-400">
                                  {it.numero_pedido}
                                </span>
                                <div className="text-right">
                                  <span className="font-bold text-xs text-emerald-400">
                                    ${it.monto.toLocaleString('es-AR')}
                                  </span>
                                  {it.esEstimado && (
                                    <span
                                      className="text-[10px] text-amber-400 font-semibold ml-1"
                                      title={it.motivoEstimado || 'Estimado, se ajusta al pesar'}
                                    >
                                      est.
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="text-white font-medium truncate max-w-[60%]">
                                  {it.nombre}
                                </span>
                                <span className="text-gray-400 text-[11px] truncate text-right">
                                  {it.localidad}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${it.estEnt.color}`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${it.estEnt.dot}`} />
                                  <span>{it.estEnt.label}</span>
                                </span>
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${it.estPag.color}`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${it.estPag.dot}`} />
                                  <span>{it.estPag.shortLabel || it.estPag.label}</span>
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Pie del turno Mañana (Requisito 3) */}
                      <div
                        id="cal-turno-manana-pie"
                        className="pt-2 border-t border-gray-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs"
                      >
                        <span className="text-gray-400 font-medium">
                          {diaTotales?.turnos.Mañana.cantidad || 0}{' '}
                          {diaTotales?.turnos.Mañana.cantidad === 1 ? 'pedido' : 'pedidos'}
                        </span>
                        <div className="text-right font-bold text-white">
                          <span>Total Mañana: </span>
                          <span className="text-emerald-300 font-black">
                            ${(diaTotales?.turnos.Mañana.total || 0).toLocaleString('es-AR')}
                          </span>
                          {diaTotales?.turnos.Mañana.tieneEstimados && (
                            <span className="text-[10px] text-amber-400 font-medium block sm:inline sm:ml-1">
                              (incluye {diaTotales.turnos.Mañana.estimadosCount}{' '}
                              {diaTotales.turnos.Mañana.estimadosCount === 1 ? 'estimado' : 'estimados'})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── TURNO TARDE ── */}
                <div id="cal-turno-tarde-contenedor" className="border border-white/5 rounded-xl overflow-hidden bg-[#1f2937]/30">
                  <button
                    id="cal-turno-tarde-btn"
                    type="button"
                    onClick={() => toggleTurno('Tarde')}
                    className="w-full p-2.5 sm:p-3 flex items-center justify-between text-left hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-lg bg-indigo-500/15 flex items-center justify-center shrink-0">
                        <Sunset size={13} className="text-indigo-400" />
                      </div>
                      <span className="font-bold text-xs sm:text-sm text-white">Tarde</span>
                      <span className="text-[11px] text-indigo-300/90 font-medium truncate">
                        ({diaTotales?.turnos.Tarde.cantidad || 0} {diaTotales?.turnos.Tarde.cantidad === 1 ? 'pedido' : 'pedidos'})
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <span className="text-xs font-bold text-indigo-300 block">
                          ${(diaTotales?.turnos.Tarde.total || 0).toLocaleString('es-AR')}
                          {diaTotales?.turnos.Tarde.tieneEstimados && (
                            <span className="text-[10px] text-amber-400 font-semibold ml-1">est.</span>
                          )}
                        </span>
                      </div>
                      <ChevronDown
                        size={15}
                        className={`text-gray-400 transition-transform duration-200 ${
                          turnosAbiertos['Tarde'] ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </button>

                  {turnosAbiertos['Tarde'] && (
                    <div id="cal-turno-tarde-detalle" className="p-2.5 sm:p-3 pt-0 border-t border-white/5 space-y-2">
                      {(!diaTotales || diaTotales.turnos.Tarde.pedidos.length === 0) ? (
                        <p className="text-xs text-gray-500 italic py-2">Sin pedidos para el turno Tarde.</p>
                      ) : (
                        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-0.5">
                          {diaTotales.turnos.Tarde.pedidos.map((it) => (
                            <div
                              key={it.numero_pedido}
                              className="bg-black/40 border border-white/5 rounded-xl p-2.5 space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-xs font-black text-green-400">
                                  {it.numero_pedido}
                                </span>
                                <div className="text-right">
                                  <span className="font-bold text-xs text-emerald-400">
                                    ${it.monto.toLocaleString('es-AR')}
                                  </span>
                                  {it.esEstimado && (
                                    <span
                                      className="text-[10px] text-amber-400 font-semibold ml-1"
                                      title={it.motivoEstimado || 'Estimado, se ajusta al pesar'}
                                    >
                                      est.
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="text-white font-medium truncate max-w-[60%]">
                                  {it.nombre}
                                </span>
                                <span className="text-gray-400 text-[11px] truncate text-right">
                                  {it.localidad}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${it.estEnt.color}`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${it.estEnt.dot}`} />
                                  <span>{it.estEnt.label}</span>
                                </span>
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${it.estPag.color}`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${it.estPag.dot}`} />
                                  <span>{it.estPag.shortLabel || it.estPag.label}</span>
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Pie del turno Tarde (Requisito 3) */}
                      <div
                        id="cal-turno-tarde-pie"
                        className="pt-2 border-t border-gray-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs"
                      >
                        <span className="text-gray-400 font-medium">
                          {diaTotales?.turnos.Tarde.cantidad || 0}{' '}
                          {diaTotales?.turnos.Tarde.cantidad === 1 ? 'pedido' : 'pedidos'}
                        </span>
                        <div className="text-right font-bold text-white">
                          <span>Total Tarde: </span>
                          <span className="text-emerald-300 font-black">
                            ${(diaTotales?.turnos.Tarde.total || 0).toLocaleString('es-AR')}
                          </span>
                          {diaTotales?.turnos.Tarde.tieneEstimados && (
                            <span className="text-[10px] text-amber-400 font-medium block sm:inline sm:ml-1">
                              (incluye {diaTotales.turnos.Tarde.estimadosCount}{' '}
                              {diaTotales.turnos.Tarde.estimadosCount === 1 ? 'estimado' : 'estimados'})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── TURNO SIN TURNO (si hay pedidos o se abre) ── */}
                {((diaTotales?.turnos['Sin turno'].cantidad || 0) > 0 || turnosAbiertos['Sin turno']) && (
                  <div id="cal-turno-sinturno-contenedor" className="border border-white/5 rounded-xl overflow-hidden bg-[#1f2937]/30">
                    <button
                      id="cal-turno-sinturno-btn"
                      type="button"
                      onClick={() => toggleTurno('Sin turno')}
                      className="w-full p-2.5 sm:p-3 flex items-center justify-between text-left hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-lg bg-gray-700/30 flex items-center justify-center shrink-0">
                          <Clock size={13} className="text-gray-400" />
                        </div>
                        <span className="font-bold text-xs sm:text-sm text-white">Sin turno</span>
                        <span className="text-[11px] text-gray-400 font-medium truncate">
                          ({diaTotales?.turnos['Sin turno'].cantidad || 0} {diaTotales?.turnos['Sin turno'].cantidad === 1 ? 'pedido' : 'pedidos'})
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <span className="text-xs font-bold text-gray-300 block">
                            ${(diaTotales?.turnos['Sin turno'].total || 0).toLocaleString('es-AR')}
                            {diaTotales?.turnos['Sin turno'].tieneEstimados && (
                              <span className="text-[10px] text-amber-400 font-semibold ml-1">est.</span>
                            )}
                          </span>
                        </div>
                        <ChevronDown
                          size={15}
                          className={`text-gray-400 transition-transform duration-200 ${
                            turnosAbiertos['Sin turno'] ? 'rotate-180' : ''
                          }`}
                        />
                      </div>
                    </button>

                    {turnosAbiertos['Sin turno'] && (
                      <div id="cal-turno-sinturno-detalle" className="p-2.5 sm:p-3 pt-0 border-t border-white/5 space-y-2">
                        {(!diaTotales || diaTotales.turnos['Sin turno'].pedidos.length === 0) ? (
                          <p className="text-xs text-gray-500 italic py-2">Sin pedidos sin turno asignado.</p>
                        ) : (
                          <div className="space-y-1.5 max-h-60 overflow-y-auto pr-0.5">
                            {diaTotales.turnos['Sin turno'].pedidos.map((it) => (
                              <div
                                key={it.numero_pedido}
                                className="bg-black/40 border border-white/5 rounded-xl p-2.5 space-y-1.5"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-mono text-xs font-black text-green-400">
                                    {it.numero_pedido}
                                  </span>
                                  <div className="text-right">
                                    <span className="font-bold text-xs text-emerald-400">
                                      ${it.monto.toLocaleString('es-AR')}
                                    </span>
                                    {it.esEstimado && (
                                      <span
                                        className="text-[10px] text-amber-400 font-semibold ml-1"
                                        title={it.motivoEstimado || 'Estimado, se ajusta al pesar'}
                                      >
                                        est.
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center justify-between gap-2 text-xs">
                                  <span className="text-white font-medium truncate max-w-[60%]">
                                    {it.nombre}
                                  </span>
                                  <span className="text-gray-400 text-[11px] truncate text-right">
                                    {it.localidad}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${it.estEnt.color}`}
                                  >
                                    <span className={`w-1.5 h-1.5 rounded-full ${it.estEnt.dot}`} />
                                    <span>{it.estEnt.label}</span>
                                  </span>
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${it.estPag.color}`}
                                  >
                                    <span className={`w-1.5 h-1.5 rounded-full ${it.estPag.dot}`} />
                                    <span>{it.estPag.shortLabel || it.estPag.label}</span>
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Pie del turno Sin turno (Requisito 3) */}
                        <div
                          id="cal-turno-sinturno-pie"
                          className="pt-2 border-t border-gray-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs"
                        >
                          <span className="text-gray-400 font-medium">
                            {diaTotales?.turnos['Sin turno'].cantidad || 0}{' '}
                            {diaTotales?.turnos['Sin turno'].cantidad === 1 ? 'pedido' : 'pedidos'}
                          </span>
                          <div className="text-right font-bold text-white">
                            <span>Total Sin turno: </span>
                            <span className="text-emerald-300 font-black">
                              ${(diaTotales?.turnos['Sin turno'].total || 0).toLocaleString('es-AR')}
                            </span>
                            {diaTotales?.turnos['Sin turno'].tieneEstimados && (
                              <span className="text-[10px] text-amber-400 font-medium block sm:inline sm:ml-1">
                                (incluye {diaTotales.turnos['Sin turno'].estimadosCount}{' '}
                                {diaTotales.turnos['Sin turno'].estimadosCount === 1 ? 'estimado' : 'estimados'})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ═══════ REQUISITO 4: PIE DE LA TARJETA DEL DÍA (TOTAL DEL DÍA) ═══════ */}
              <div id="cal-pie-total-dia" className="bg-[#1f2937]/70 border border-emerald-500/25 rounded-2xl p-3.5 space-y-2.5">
                <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-2.5">
                  <div>
                    <span className="text-[11px] uppercase font-black text-gray-300 tracking-wider block">
                      Total del día
                    </span>
                    <span className="text-xs text-gray-400 font-medium">
                      {diaTotales?.totalPedidos || 0} {(diaTotales?.totalPedidos || 0) === 1 ? 'pedido' : 'pedidos'}
                      {(diaTotales?.totalPedidos || 0) > 0 && (
                        <>
                          {' '}({diaTotales?.turnos.Mañana.cantidad || 0} mañ. + {diaTotales?.turnos.Tarde.cantidad || 0} tarde
                          {(diaTotales?.turnos['Sin turno'].cantidad || 0) > 0 ? ` + ${diaTotales.turnos['Sin turno'].cantidad} s/t` : ''})
                        </>
                      )}
                    </span>
                  </div>
                  <div className="text-right">
                    <span id="cal-total-dia-monto" className="text-base sm:text-lg font-black text-emerald-400 block leading-tight">
                      ${(diaTotales?.totalMonto || 0).toLocaleString('es-AR')}
                      {diaTotales?.tieneEstimados && (
                        <span className="text-[10px] text-amber-400 font-semibold ml-1">est.</span>
                      )}
                    </span>
                    {diaTotales?.tieneEstimados && (
                      <span className="text-[10px] text-amber-400 font-medium block">
                        incluye {diaTotales.totalEstimadosCount}{' '}
                        {diaTotales.totalEstimadosCount === 1 ? 'estimado' : 'estimados'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Desglose: Ya cobrado vs Pendiente de cobro */}
                <div className="grid grid-cols-2 gap-2 text-xs pt-0.5">
                  {/* Ya cobrado */}
                  <div id="cal-desglose-cobrado" className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-2.5">
                    <span className="text-[10px] uppercase font-black text-emerald-400 flex items-center gap-1 tracking-wide">
                      <CheckCircle size={11} className="shrink-0" /> Ya cobrado ({diaTotales?.desglose.cobrado.cantidad || 0})
                    </span>
                    <span className="text-sm font-black text-emerald-300 mt-1 block">
                      ${(diaTotales?.desglose.cobrado.monto || 0).toLocaleString('es-AR')}
                      {diaTotales?.desglose.cobrado.tieneEstimados && (
                        <span className="text-[9px] text-amber-400 font-semibold ml-1">est.</span>
                      )}
                    </span>
                    {diaTotales?.desglose.cobrado.tieneEstimados && (
                      <span className="text-[9px] text-amber-400/90 block leading-tight mt-0.5">
                        incluye {diaTotales.desglose.cobrado.estimadosCount} est.
                      </span>
                    )}
                  </div>

                  {/* Pendiente de cobro */}
                  <div id="cal-desglose-pendiente" className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-2.5">
                    <span className="text-[10px] uppercase font-black text-amber-400 flex items-center gap-1 tracking-wide">
                      <Clock size={11} className="shrink-0" /> Pendiente ({diaTotales?.desglose.pendiente.cantidad || 0})
                    </span>
                    <span className="text-sm font-black text-amber-300 mt-1 block">
                      ${(diaTotales?.desglose.pendiente.monto || 0).toLocaleString('es-AR')}
                      {diaTotales?.desglose.pendiente.tieneEstimados && (
                        <span className="text-[9px] text-amber-400 font-semibold ml-1">est.</span>
                      )}
                    </span>
                    {diaTotales?.desglose.pendiente.tieneEstimados && (
                      <span className="text-[9px] text-amber-400/90 block leading-tight mt-0.5">
                        incluye {diaTotales.desglose.pendiente.estimadosCount} est.
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Sublista de cancelados si los hay */}
              {(diaTotales?.pedidosCancelados.length || diaMetricas?.cancelados || 0) > 0 && (
                <div className="pt-2 border-t border-gray-800 space-y-1.5">
                  <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider block">
                    Cancelados ({diaTotales?.pedidosCancelados.length ?? diaMetricas?.cancelados}):
                  </span>
                  <div className="space-y-1 max-h-28 overflow-y-auto pr-1 opacity-75">
                    {(diaTotales?.pedidosCancelados || diaMetricas?.pedidosCancelados || []).map((p) => (
                      <div key={p.numero_pedido || p.id} className="bg-red-500/5 border border-red-500/20 rounded-lg p-2 text-xs flex items-center justify-between text-gray-400">
                        <span className="font-mono font-bold text-red-300">{p.numero_pedido}</span>
                        <span className="truncate max-w-[130px] text-[11px]">{p.nombre}</span>
                        <span className="text-[10px] font-bold uppercase text-red-400">Cancelado</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Controles de cambio de estado del dia */}
              <div className="pt-3 border-t border-white/5 space-y-2">
                {seleccionado < hoyYMD ? (
                  <p className="text-[11px] text-gray-500 italic">Los días pasados no se editan.</p>
                ) : acciones.length === 0 ? (
                  <p className="text-[11px] text-gray-500 italic">Domingo: ya se trata como cerrado, no hay nada para cambiar.</p>
                ) : (
                  <>
                    {(acciones.includes('cerrar') || acciones.includes('abrir')) && (
                      <div>
                        <label htmlFor="cal-motivo" className="block text-[10px] text-gray-400 font-bold uppercase mb-1">Motivo (opcional)</label>
                        <input
                          id="cal-motivo"
                          type="text"
                          value={motivo}
                          maxLength={80}
                          disabled={guardando}
                          onChange={(e) => setMotivo(e.target.value)}
                          placeholder="Ej: puente, obras, feria..."
                          className="w-full bg-black/40 border border-gray-700/60 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
                        />
                      </div>
                    )}

                    {confirmando === 'cerrar' && nSel > 0 && (
                      <div className="text-[11px] text-orange-200 bg-orange-500/10 border border-orange-500/40 rounded-xl px-3 py-2 flex gap-2">
                        <AlertTriangle size={14} className="shrink-0 mt-0.5 text-orange-400" />
                        <span>
                          Hay {nSel} {nSel === 1 ? 'pedido programado' : 'pedidos programados'} ese día; no se mueven solos, quedarán marcados DIA CERRADO - REPROGRAMAR.
                        </span>
                      </div>
                    )}

                    <div className="flex flex-col gap-2">
                      {acciones.includes('cerrar') && (
                        <button id="cal-btn-cerrar" type="button" disabled={guardando} onClick={() => aplicar('cerrar')}
                          className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-black bg-red-600 hover:bg-red-500 text-white border border-red-400/40 cursor-pointer disabled:opacity-50">
                          {guardando && <Loader2 size={13} className="animate-spin" />}
                          {confirmando === 'cerrar' ? 'Cerrar igual' : 'Cerrar este día'}
                        </button>
                      )}
                      {acciones.includes('abrir') && (
                        <button id="cal-btn-abrir" type="button" disabled={guardando} onClick={() => aplicar('abrir')}
                          className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-black bg-sky-600 hover:bg-sky-500 text-white border border-sky-400/40 cursor-pointer disabled:opacity-50">
                          {guardando && <Loader2 size={13} className="animate-spin" />}
                          Abrir este día
                        </button>
                      )}
                      {acciones.includes('normal') && (
                        <button id="cal-btn-normal" type="button" disabled={guardando} onClick={() => aplicar('normal')}
                          className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-[#1f2937] hover:bg-gray-700 text-gray-200 border border-gray-600 cursor-pointer disabled:opacity-50">
                          Volver a normal
                        </button>
                      )}
                      {confirmando === 'cerrar' && (
                        <button type="button" disabled={guardando} onClick={() => setConfirmando(null)} className="text-[11px] text-gray-400 hover:text-white underline cursor-pointer">Cancelar</button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
