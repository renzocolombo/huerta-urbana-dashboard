import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Loader2, AlertTriangle, RefreshCw, CalendarDays, X, Download } from 'lucide-react';
import { apiGetCalendario, apiSetDiaCalendario, apiSembrarFeriados } from '../utils/mercaderiaApi';
import {
  mapaCalendario, estadoDelDia, accionesDelDia, semanasDelMes, ESTADOS_DIA,
} from '../utils/agendaCalendario';

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

export default function CalendarioEntregas({ conteo = {}, hoyYMD, onCambio }) {
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
  const enVuelo = useRef(false);

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
    setMes(m); setAnio(a); setSeleccionado(null); setConfirmando(null);
  };

  const elegirDia = (ymd) => {
    setSeleccionado(ymd);
    setMotivo(mapa[ymd]?.motivo || '');
    setConfirmando(null);
    setAviso(null);
  };

  const aplicar = async (accion) => {
    if (!seleccionado || enVuelo.current) return;
    const n = conteo[seleccionado] || 0;
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
  const nSel = seleccionado ? (conteo[seleccionado] || 0) : 0;
  const listaVacia = !cargando && !error && dias.length === 0;

  return (
    <div id="calendario-entregas" className="space-y-4">
      {/* Barra superior */}
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

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
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

        {/* Panel del dia */}
        <div id="cal-panel-dia" className="bg-[#111827]/80 border border-white/5 rounded-2xl p-4 space-y-3">
          {!seleccionado ? (
            <p className="text-xs text-gray-500">Tocá un día del calendario para ver su estado y cambiarlo.</p>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-white font-black text-sm">{fmtLargo(seleccionado)}</p>
                  <span className={`inline-block mt-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border ${ESTILO[estadoSel].celda}`}>
                    {ESTADOS_DIA[estadoSel].etiqueta}
                  </span>
                  {mapa[seleccionado]?.motivo && <p className="text-[11px] text-gray-400 mt-1">Motivo: {mapa[seleccionado].motivo}</p>}
                </div>
                <button type="button" onClick={() => setSeleccionado(null)} className="text-gray-500 hover:text-white cursor-pointer"><X size={15} /></button>
              </div>

              <p className="text-[11px] text-gray-400">
                {nSel > 0 ? `${nSel} ${nSel === 1 ? 'pedido programado' : 'pedidos programados'} este día.` : 'Sin pedidos programados este día.'}
              </p>

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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
