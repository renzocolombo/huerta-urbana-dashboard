import { useState, useMemo, useEffect } from 'react';
import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { 
  Package, Calendar, ChevronLeft, ChevronRight, Printer, 
  Clock, CheckCircle, AlertCircle, RefreshCw, Filter, Sparkles
} from 'lucide-react';
import { getHoyYMD, extraerFechaIngresoYMD } from '../utils/fechasEntrega';
import { sumarDias, dowDeYmd } from '../utils/entregaCalendario';
import { resolverEntrega, esPedidoCancelado } from '../utils/agendaCalendario';
import { imprimirRemitoIndividual, imprimirRemitosEnLote, estaPedidoArmado } from '../utils/remitoPrinter';
import { estadoEntregaPedido } from '../utils/estadosPedido';
import { calcularTotalPedido } from '../utils/totalesPedido';
import TarjetaPedido from './TarjetaPedido';
import ModalArmadoPedido from './ModalArmadoPedido';

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function formatearFechaLegible(ymd) {
  if (!ymd || !ymd.includes('-')) return ymd || '';
  const [, m, d] = ymd.split('-');
  const diaNombre = DIAS_SEMANA[dowDeYmd(ymd)] || '';
  return `${diaNombre} ${d}/${m}`;
}

export default function PedidosDelDia({ _rol, _usuario, _onNav, fechaCompartida, _setFechaCompartida }) {
  const { pedidos: PEDIDOS, actualizarRemitoEnSheet, fetchSheetPedidos } = useGoogleSheets();

  const hoyArgentina = useMemo(() => getHoyYMD(), []);

  // Por defecto siempre abre en HOY (fecha actual de ingreso en Argentina)
  const [fechaSeleccionada, setFechaSeleccionada] = useState(() => fechaCompartida || hoyArgentina);
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [pedidoArmar, setPedidoArmar] = useState(null);

  // Sincronizar si cambia fechaCompartida externamente
  useEffect(() => {
    if (fechaCompartida) {
      setFechaSeleccionada(fechaCompartida);
    }
  }, [fechaCompartida]);

  // Preparaciones locales
  const [preparaciones, setPreparaciones] = useState(() => {
    try {
      const s = localStorage.getItem('huerta_preparaciones_v1');
      return s ? JSON.parse(s) : {};
    } catch (e) {
      return {};
    }
  });

  // Escuchar cambios en preparaciones
  const recargarPreparaciones = () => {
    try {
      const s = localStorage.getItem('huerta_preparaciones_v1');
      setPreparaciones(s ? JSON.parse(s) : {});
    } catch (e) {}
  };

  // 1. Filtrar TODOS los pedidos que ENTRARON ese día (fecha de pedido, sin corrimiento UTC)
  const pedidosIngresados = useMemo(() => {
    return (PEDIDOS || []).filter(p => {
      const fIngreso = extraerFechaIngresoYMD(p.fecha);
      return fIngreso === fechaSeleccionada;
    }).slice().sort((a, b) => {
      // Orden en que entraron: el más nuevo arriba
      const fA = String(a.fecha || '');
      const fB = String(b.fecha || '');
      if (fA !== fB) return fB.localeCompare(fA);
      return (b.sheetRowIndex || 0) - (a.sheetRowIndex || 0);
    });
  }, [PEDIDOS, fechaSeleccionada]);

  // 2. Contadores y totales para el resumen del día (Requisitos B y C)
  const metricasDia = useMemo(() => {
    let cantTotal = pedidosIngresados.length;
    let montoTotal = 0;
    let montoArmado = 0;
    let montoEstimado = 0;

    let pendientes = 0;
    let enPrep = 0;
    let listos = 0;
    let entregados = 0;
    let cancelados = 0;

    pedidosIngresados.forEach(p => {
      const prep = preparaciones[p.numero_pedido];
      const { total, esEstimado } = calcularTotalPedido(p, prep);
      montoTotal += total;
      if (esEstimado) montoEstimado += total;
      else montoArmado += total;

      const est = estadoEntregaPedido(p, prep);
      const clave = est.clave;

      if (clave === 'cancelado' || esPedidoCancelado(p)) {
        cancelados++;
      } else if (clave === 'entregado') {
        entregados++;
      } else if (clave === 'listo' || p.estado === 'preparado' || estaPedidoArmado(p, prep)) {
        listos++;
      } else if (clave === 'en_preparacion' || (prep && !prep.completado)) {
        enPrep++;
      } else {
        pendientes++;
      }
    });

    return {
      cantTotal,
      montoTotal,
      montoArmado,
      montoEstimado,
      pendientes,
      enPrep,
      listos,
      entregados,
      cancelados
    };
  }, [pedidosIngresados, preparaciones]);

  // 3. Filtrar según la pestaña seleccionada
  const pedidosFiltrados = useMemo(() => {
    if (filtroEstado === 'todos') return pedidosIngresados;

    return pedidosIngresados.filter(p => {
      const prep = preparaciones[p.numero_pedido];
      const est = estadoEntregaPedido(p, prep);
      const clave = est.clave;

      if (filtroEstado === 'pendientes') {
        return (clave === 'pendiente' || clave === 'demorado') && !prep && !esPedidoCancelado(p);
      }
      if (filtroEstado === 'en_preparacion') {
        return (clave === 'en_preparacion' || (prep && !prep.completado)) && !esPedidoCancelado(p);
      }
      if (filtroEstado === 'listos') {
        return (clave === 'listo' || p.estado === 'preparado' || estaPedidoArmado(p, prep)) && !esPedidoCancelado(p);
      }
      if (filtroEstado === 'entregados') {
        return clave === 'entregado';
      }
      if (filtroEstado === 'cancelados') {
        return clave === 'cancelado' || esPedidoCancelado(p);
      }
      return true;
    });
  }, [pedidosIngresados, filtroEstado, preparaciones]);

  // 4. Agrupar por día de entrega: "Para hoy", "Para mañana", "Más adelante · [Día] [DD/MM]"
  const gruposEntrega = useMemo(() => {
    const mapa = new Map();

    pedidosFiltrados.forEach(p => {
      const res = resolverEntrega(p);
      const ymdEntrega = res.ymd;

      let grupoClave = 'sin_fecha';
      let grupoTitulo = 'Sin fecha de entrega asignada';
      let orden = 9999;

      if (ymdEntrega) {
        if (ymdEntrega === hoyArgentina) {
          grupoClave = 'hoy';
          grupoTitulo = 'Para hoy';
          orden = 1;
        } else if (ymdEntrega === sumarDias(hoyArgentina, 1)) {
          grupoClave = 'manana';
          grupoTitulo = 'Para mañana';
          orden = 2;
        } else if (ymdEntrega > hoyArgentina) {
          const [y, m, d] = ymdEntrega.split('-');
          const dObj = new Date(Number(y), Number(m) - 1, Number(d));
          const nomDia = DIAS_SEMANA[dObj.getDay()] || '';
          grupoClave = ymdEntrega;
          grupoTitulo = `Más adelante · ${nomDia} ${d}/${m}`;
          orden = 10 + Number(ymdEntrega.replace(/-/g, ''));
        } else {
          grupoClave = 'anterior';
          grupoTitulo = `Entrega anterior · ${formatearFechaLegible(ymdEntrega)}`;
          orden = 900;
        }
      }

      if (!mapa.has(grupoClave)) {
        mapa.set(grupoClave, { clave: grupoClave, titulo: grupoTitulo, orden, pedidos: [] });
      }
      mapa.get(grupoClave).pedidos.push(p);
    });

    return Array.from(mapa.values()).sort((a, b) => a.orden - b.orden);
  }, [pedidosFiltrados, hoyArgentina]);

  // Impresión de remitos
  const imprimirRemitoPedido = (p) => {
    const prep = preparaciones[p.numero_pedido] || null;
    if (!estaPedidoArmado(p, prep)) {
      alert('Primero pesá y armá el pedido');
      return;
    }
    imprimirRemitoIndividual(p, prep);
    if (p.sheetRowIndex && actualizarRemitoEnSheet) {
      actualizarRemitoEnSheet(p.sheetRowIndex, true);
    }
  };

  const imprimirTodosArmados = () => {
    const armados = pedidosIngresados.filter(p => estaPedidoArmado(p, preparaciones[p.numero_pedido]));
    if (armados.length === 0) {
      alert('No hay pedidos armados en esta fecha para imprimir.');
      return;
    }
    imprimirRemitosEnLote(armados, preparaciones, `Remitos · Ingresados ${fechaSeleccionada}`);
  };

  const esHoy = fechaSeleccionada === hoyArgentina;
  const esAyer = fechaSeleccionada === sumarDias(hoyArgentina, -1);
  const esManana = fechaSeleccionada === sumarDias(hoyArgentina, 1);

  return (
    <div className="space-y-6">
      {/* ── Encabezado y Barra de Navegación de Fecha de Ingreso ── */}
      <div className="bg-[#141b26] border border-white/10 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="p-3 rounded-2xl bg-green-500/10 text-green-400 border border-green-500/20 shadow-inner">
              <Package size={22} />
            </span>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-black text-white tracking-tight">Pedidos del Día</h2>
                {esHoy ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-green-500/20 text-green-300 border border-green-500/30 text-[11px] font-black uppercase tracking-wider">
                    Hoy
                  </span>
                ) : esAyer ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[11px] font-black uppercase tracking-wider">
                    Ayer
                  </span>
                ) : esManana ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[11px] font-black uppercase tracking-wider">
                    Mañana
                  </span>
                ) : null}
              </div>
              <p className="text-gray-400 text-xs mt-0.5">
                Todos los pedidos que <span className="text-white font-bold">ingresaron</span> el {formatearFechaLegible(fechaSeleccionada)} (fecha local de ingreso)
              </p>
            </div>
          </div>

          {/* Navegación por fechas de ingreso */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center bg-black/40 border border-white/10 rounded-xl p-1 shadow-inner">
              <button
                type="button"
                onClick={() => setFechaSeleccionada(sumarDias(fechaSeleccionada, -1))}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
                title="Día de ingreso anterior"
              >
                <ChevronLeft size={16} />
              </button>

              <input
                type="date"
                value={fechaSeleccionada}
                onChange={(e) => e.target.value && setFechaSeleccionada(e.target.value)}
                className="bg-transparent text-white font-mono font-bold text-xs px-2 py-1 outline-none cursor-pointer"
                title="Seleccionar fecha de ingreso"
              />

              <button
                type="button"
                onClick={() => setFechaSeleccionada(sumarDias(fechaSeleccionada, 1))}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
                title="Día de ingreso siguiente"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setFechaSeleccionada(hoyArgentina)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                esHoy 
                  ? 'bg-green-600 text-white border-green-500 shadow-md shadow-green-950/40' 
                  : 'bg-white/5 hover:bg-white/10 text-gray-300 border-white/10'
              }`}
            >
              Hoy
            </button>

            {metricasDia.listos > 0 && (
              <button
                type="button"
                onClick={imprimirTodosArmados}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1f2937] hover:bg-gray-700 text-gray-200 text-xs font-bold border border-gray-600 transition-all cursor-pointer shadow-sm"
                title="Imprimir remitos de los pedidos armados de este día"
              >
                <Printer size={14} />
                <span>Imprimir remitos ({metricasDia.listos})</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Barra de Métricas y Resumen del Día (Requisito C) ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-white/5">
          <div className="bg-black/30 border border-white/5 rounded-xl p-3">
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Total Ingresados</span>
            <div className="text-xl font-black text-white mt-0.5">
              {metricasDia.cantTotal} <span className="text-xs font-medium text-gray-500">pedidos</span>
            </div>
          </div>

          <div className="bg-black/30 border border-white/5 rounded-xl p-3">
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Monto del Día</span>
            <div className="text-xl font-black text-emerald-400 mt-0.5">
              ${metricasDia.montoTotal.toLocaleString('es-AR')}
            </div>
          </div>

          <div className="bg-black/30 border border-white/5 rounded-xl p-3">
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Monto Armado</span>
            <div className="text-xl font-black text-cyan-400 mt-0.5">
              ${metricasDia.montoArmado.toLocaleString('es-AR')}
            </div>
          </div>

          <div className="bg-black/30 border border-white/5 rounded-xl p-3">
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Monto Estimado</span>
            <div className="text-xl font-black text-amber-400 mt-0.5">
              ${metricasDia.montoEstimado.toLocaleString('es-AR')}
            </div>
          </div>
        </div>

        {/* ── Filtros Rápidos con Contadores (Requisito C) ── */}
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-white/5">
          {[
            { id: 'todos', label: 'Todos', count: metricasDia.cantTotal },
            { id: 'pendientes', label: 'Pendientes', count: metricasDia.pendientes },
            { id: 'en_preparacion', label: 'En preparación', count: metricasDia.enPrep },
            { id: 'listos', label: 'Listos', count: metricasDia.listos },
            { id: 'entregados', label: 'Entregados', count: metricasDia.entregados },
            { id: 'cancelados', label: 'Cancelados', count: metricasDia.cancelados },
          ].map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltroEstado(f.id)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filtroEstado === f.id
                  ? 'bg-green-600 text-white shadow-md shadow-green-950/40 border border-green-500'
                  : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-white/5'
              }`}
            >
              <span>{f.label}</span>
              <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono ${
                filtroEstado === f.id ? 'bg-black/30 text-white' : 'bg-black/40 text-gray-400'
              }`}>
                {f.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Lista de Pedidos Agrupados por Fecha de Entrega (Requisito A y B) ── */}
      {pedidosFiltrados.length === 0 ? (
        <div className="bg-[#141b26] border border-white/10 rounded-2xl p-12 text-center space-y-3">
          <Package size={40} className="mx-auto text-gray-600 stroke-[1.5]" />
          <h3 className="text-base font-bold text-white">No hay pedidos registrados</h3>
          <p className="text-xs text-gray-400 max-w-sm mx-auto">
            {filtroEstado === 'todos'
              ? `No ingresó ningún pedido el ${formatearFechaLegible(fechaSeleccionada)}.`
              : `No hay pedidos con filtro "${filtroEstado}" ingresados el ${formatearFechaLegible(fechaSeleccionada)}.`}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {gruposEntrega.map(grupo => (
            <div key={grupo.clave} className="space-y-3">
              {/* Encabezado de grupo de entrega ("Para hoy", "Para mañana", "Más adelante · Lunes 02/11") */}
              <div className="flex items-center gap-3 px-2">
                <div className="flex items-center gap-2">
                  <Calendar size={15} className="text-green-400" />
                  <h3 className="text-sm font-black uppercase tracking-wider text-white">
                    {grupo.titulo}
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-gray-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded-lg">
                  {grupo.pedidos.length} {grupo.pedidos.length === 1 ? 'pedido' : 'pedidos'}
                </span>
                <div className="flex-1 h-px bg-white/5" />
              </div>

              {/* Tarjetas de pedidos del grupo */}
              <div className="space-y-3">
                {grupo.pedidos.map(p => (
                  <TarjetaPedido
                    key={p.numero_pedido || p.sheetRowIndex}
                    pedido={p}
                    preparacion={preparaciones[p.numero_pedido]}
                    onArmar={(ped) => setPedidoArmar(ped)}
                    onImprimirRemito={imprimirRemitoPedido}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal de Armado de Pedido (Requisito D: armar desde aquí aunque sea futuro) ── */}
      {pedidoArmar && (
        <ModalArmadoPedido
          pedido={pedidoArmar}
          onClose={() => setPedidoArmar(null)}
          onPedidoArmado={() => {
            recargarPreparaciones();
            if (fetchSheetPedidos) fetchSheetPedidos();
          }}
        />
      )}
    </div>
  );
}
