import { useState, useMemo } from 'react';
import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { 
  AlertCircle, Clock, Package, Printer, Calendar, Sun, Sunset, 
  ArrowRight, CheckCircle, RefreshCw 
} from 'lucide-react';
import { getHoyYMD, extraerFechaYMD } from '../utils/fechasEntrega';
import { turnoDePedido, sumarDias, dowDeYmd } from '../utils/entregaCalendario';
import { 
  resolverEntrega, 
  esPedidoElegibleReparto, 
  esPedidoCancelado, 
  etiquetaMedioPagoDisplay,
  METODOS_PAGO_CONTRA_ENTREGA 
} from '../utils/agendaCalendario';
import { imprimirRemitoIndividual, imprimirRemitosEnLote } from '../utils/remitoPrinter';

const $$ = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const ESTADO_CONFIG = {
  pendiente:      { label: 'Pendiente',      color: 'bg-red-500/15 text-red-400 border-red-500/30',    dot: 'bg-red-500' },
  en_preparacion: { label: 'En preparación', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', dot: 'bg-amber-500' },
  preparado:      { label: 'Preparado',      color: 'bg-blue-500/15 text-blue-400 border-blue-500/30',  dot: 'bg-blue-500' },
  listo:          { label: 'Listo',          color: 'bg-blue-500/15 text-blue-400 border-blue-500/30',  dot: 'bg-blue-500' },
  entregado:      { label: 'Entregado',      color: 'bg-green-500/15 text-green-400 border-green-500/30', dot: 'bg-green-500' },
};

function Badge({ config }) {
  if (!config) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${config.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

function formatearFechaLegible(ymd) {
  if (!ymd || !ymd.includes('-')) return ymd || '';
  const [y, m, d] = ymd.split('-');
  const diaNombre = DIAS_SEMANA[dowDeYmd(ymd)] || '';
  return `${diaNombre} ${d}/${m}`;
}

export default function PedidosDelDia() {
  const { pedidos: PEDIDOS, actualizarRemitoEnSheet } = useGoogleSheets();

  const hoyArgentina = useMemo(() => getHoyYMD(), []);
  const [fechaSeleccionada, setFechaSeleccionada] = useState(() => getHoyYMD());
  const [filtroEstado, setFiltroEstado] = useState(null);

  const preparaciones = useMemo(() => {
    try {
      const s = localStorage.getItem('huerta_preparaciones_v1');
      return s ? JSON.parse(s) : {};
    } catch (e) {
      return {};
    }
  }, []);

  // 1. Pedidos elegibles para reparto (mismos filtros que Agenda, excluyendo cancelados)
  const pedidosElegibles = useMemo(() => {
    return (PEDIDOS || []).filter(p => esPedidoElegibleReparto(p) && !esPedidoCancelado(p));
  }, [PEDIDOS]);

  // 2. Pedidos del día seleccionado filtrados por FECHA DE ENTREGA
  const pedidosDelDia = useMemo(() => {
    return pedidosElegibles
      .filter(p => {
        const entrega = resolverEntrega(p);
        return entrega.ymd === fechaSeleccionada;
      })
      .sort((a, b) => (a.estado === 'pendiente' ? -1 : 1));
  }, [pedidosElegibles, fechaSeleccionada]);

  // 3. Conteos del día por turno
  const conteos = useMemo(() => {
    let manana = 0;
    let tarde = 0;
    let sinTurno = 0;

    pedidosDelDia.forEach(p => {
      const t = turnoDePedido(p);
      if (t === 'Mañana') manana++;
      else if (t === 'Tarde') tarde++;
      else sinTurno++;
    });

    return {
      total: pedidosDelDia.length,
      manana,
      tarde,
      sinTurno,
    };
  }, [pedidosDelDia]);

  // 4. Búsqueda de próxima fecha con entregas si el día actual está vacío
  const proximaEntregaConPedidos = useMemo(() => {
    if (pedidosDelDia.length > 0) return null;

    const mapaFechas = new Map();
    pedidosElegibles.forEach(p => {
      const f = resolverEntrega(p).ymd;
      if (f && f > fechaSeleccionada) {
        if (!mapaFechas.has(f)) mapaFechas.set(f, []);
        mapaFechas.get(f).push(p);
      }
    });

    const fechasFuturas = Array.from(mapaFechas.keys()).sort();
    if (!fechasFuturas.length) return null;

    const proxYMD = fechasFuturas[0];
    const lista = mapaFechas.get(proxYMD);
    return {
      ymd: proxYMD,
      cantidad: lista.length,
      label: formatearFechaLegible(proxYMD),
    };
  }, [pedidosDelDia, pedidosElegibles, fechaSeleccionada]);

  // 5. Filtrado por estado rápido y agrupación por turno
  const gruposTurno = useMemo(() => {
    const filtrados = filtroEstado
      ? pedidosDelDia.filter(p => {
          if (filtroEstado === 'listo') return p.estado === 'listo' || p.estado === 'preparado';
          return p.estado === filtroEstado;
        })
      : pedidosDelDia;

    return {
      manana: filtrados.filter(p => turnoDePedido(p) === 'Mañana'),
      tarde: filtrados.filter(p => turnoDePedido(p) === 'Tarde'),
      sinTurno: filtrados.filter(p => turnoDePedido(p) === 'Sin turno'),
    };
  }, [pedidosDelDia, filtroEstado]);

  const imprimirRemitoPedido = (p) => {
    const prep = preparaciones[p.numero_pedido] || null;
    imprimirRemitoIndividual(p, prep);
    if (p.sheetRowIndex && actualizarRemitoEnSheet) {
      actualizarRemitoEnSheet(p.sheetRowIndex, true);
    }
  };

  const imprimirTodosDia = () => {
    if (pedidosDelDia.length === 0) {
      alert('No hay pedidos en la fecha seleccionada para imprimir.');
      return;
    }
    imprimirRemitosEnLote(pedidosDelDia, preparaciones, `Remitos · Entrega ${fechaSeleccionada}`);
    pedidosDelDia.forEach(p => {
      if (p.sheetRowIndex && actualizarRemitoEnSheet) {
        actualizarRemitoEnSheet(p.sheetRowIndex, true);
      }
    });
  };

  const esHoy = fechaSeleccionada === hoyArgentina;
  const esAyer = fechaSeleccionada === sumarDias(hoyArgentina, -1);
  const esManana = fechaSeleccionada === sumarDias(hoyArgentina, 1);

  return (
    <div className="space-y-6">
      {/* ── Encabezado y Navegación de Fecha ── */}
      <div className="bg-[#1f2937] border border-gray-800 rounded-2xl p-5 shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-green-500/10 text-green-400 border border-green-500/20">
                <Package size={18} />
              </span>
              <div>
                <h2 className="text-xl font-bold text-white">Pedidos del Día</h2>
                <p className="text-gray-400 text-xs">
                  Entregas programadas para {formatearFechaLegible(fechaSeleccionada)}
                  {esHoy && <span className="ml-2 text-green-400 font-semibold">(Hoy)</span>}
                  {esManana && <span className="ml-2 text-sky-400 font-semibold">(Mañana)</span>}
                  {esAyer && <span className="ml-2 text-amber-400 font-semibold">(Ayer)</span>}
                </p>
              </div>
            </div>
          </div>

          {/* Selector de fecha y botones rápidos */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-[#111827] border border-gray-700/80 rounded-xl p-1 shadow-inner">
              <button
                type="button"
                onClick={() => setFechaSeleccionada(sumarDias(hoyArgentina, -1))}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  esAyer ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
              >
                Ayer
              </button>
              <button
                type="button"
                onClick={() => setFechaSeleccionada(hoyArgentina)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  esHoy ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
              >
                Hoy
              </button>
              <button
                type="button"
                onClick={() => setFechaSeleccionada(sumarDias(hoyArgentina, 1))}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  esManana ? 'bg-sky-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
              >
                Mañana
              </button>
            </div>

            <div className="flex items-center gap-2 bg-[#111827] border border-gray-700/80 rounded-xl px-3 py-1.5">
              <Calendar size={14} className="text-gray-400" />
              <input
                type="date"
                value={fechaSeleccionada}
                onChange={(e) => setFechaSeleccionada(e.target.value)}
                className="bg-transparent text-xs text-white font-medium focus:outline-none cursor-pointer"
                title="Seleccionar fecha de entrega"
              />
            </div>

            {pedidosDelDia.length > 0 && (
              <button
                type="button"
                onClick={imprimirTodosDia}
                className="flex items-center gap-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 border border-indigo-500/40 rounded-xl px-3.5 py-2 transition-all shadow-md active:scale-95 cursor-pointer ml-auto sm:ml-0"
                title="Imprimir todos los remitos de la fecha seleccionada"
              >
                <Printer size={14} />
                <span>Imprimir remitos ({pedidosDelDia.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Métricas y Conteos por Turno ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <div className="bg-[#111827] rounded-xl p-3 border border-gray-800">
            <div className="flex items-center justify-between text-gray-400 mb-1">
              <span className="text-xs font-medium">Total Entregas</span>
              <Package size={14} className="text-gray-400" />
            </div>
            <p className="text-2xl font-black text-white">{conteos.total}</p>
          </div>

          <div className="bg-[#111827] rounded-xl p-3 border border-gray-800">
            <div className="flex items-center justify-between text-amber-400 mb-1">
              <span className="text-xs font-medium">Mañana (8 a 12h)</span>
              <Sun size={14} />
            </div>
            <p className="text-2xl font-black text-amber-400">{conteos.manana}</p>
          </div>

          <div className="bg-[#111827] rounded-xl p-3 border border-gray-800">
            <div className="flex items-center justify-between text-indigo-400 mb-1">
              <span className="text-xs font-medium">Tarde (14 a 17h)</span>
              <Sunset size={14} />
            </div>
            <p className="text-2xl font-black text-indigo-400">{conteos.tarde}</p>
          </div>

          <div className="bg-[#111827] rounded-xl p-3 border border-gray-800">
            <div className="flex items-center justify-between text-gray-400 mb-1">
              <span className="text-xs font-medium">Sin turno</span>
              <Clock size={14} />
            </div>
            <p className="text-2xl font-black text-gray-400">{conteos.sinTurno}</p>
          </div>
        </div>
      </div>

      {/* ── Aviso cuando el día elegido no tiene pedidos ── */}
      {pedidosDelDia.length === 0 && (
        <div className="bg-[#1f2937]/80 border border-gray-800 rounded-2xl p-8 text-center space-y-4 shadow-md">
          <div className="w-12 h-12 mx-auto rounded-full bg-gray-800/80 flex items-center justify-center text-gray-400">
            <Calendar size={22} />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              No hay pedidos programados para {formatearFechaLegible(fechaSeleccionada)}
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              No se registran entregas activas con fecha confirmada para este día.
            </p>
          </div>

          {proximaEntregaConPedidos && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setFechaSeleccionada(proximaEntregaConPedidos.ymd)}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-950/40 active:scale-95 cursor-pointer"
              >
                <span>Ir a la próxima entrega con pedidos: {proximaEntregaConPedidos.label} ({proximaEntregaConPedidos.cantidad} {proximaEntregaConPedidos.cantidad === 1 ? 'pedido' : 'pedidos'})</span>
                <ArrowRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Filtros por estado (solo si hay pedidos en el día) ── */}
      {pedidosDelDia.length > 0 && (
        <div className="flex items-center justify-between bg-[#1f2937] border border-gray-800 rounded-xl px-4 py-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 font-medium">Filtrar estado:</span>
            {[
              { id: null, label: `Todos (${pedidosDelDia.length})` },
              { id: 'pendiente', label: `Pendientes (${pedidosDelDia.filter(p => p.estado === 'pendiente').length})` },
              { id: 'en_preparacion', label: `En preparación (${pedidosDelDia.filter(p => p.estado === 'en_preparacion').length})` },
              { id: 'listo', label: `Listos (${pedidosDelDia.filter(p => p.estado === 'listo' || p.estado === 'preparado').length})` },
              { id: 'entregado', label: `Entregados (${pedidosDelDia.filter(p => p.estado === 'entregado').length})` },
            ].map(f => (
              <button
                key={f.id || 'todos'}
                type="button"
                onClick={() => setFiltroEstado(f.id)}
                className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  filtroEstado === f.id
                    ? 'bg-gray-700 text-white font-bold'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filtroEstado && (
            <button
              type="button"
              onClick={() => setFiltroEstado(null)}
              className="text-xs text-emerald-400 hover:underline cursor-pointer"
            >
              Quitar filtro
            </button>
          )}
        </div>
      )}

      {/* ── Lista agrupada por turno ── */}
      {pedidosDelDia.length > 0 && (
        <div className="space-y-6">
          {/* SECCIÓN TURNO MAÑANA */}
          {gruposTurno.manana.length > 0 && (
            <TablaTurno
              titulo="Turno Mañana"
              horario="08:00 a 12:00 hs"
              icono={<Sun size={16} className="text-amber-400" />}
              pedidos={gruposTurno.manana}
              imprimirRemitoPedido={imprimirRemitoPedido}
            />
          )}

          {/* SECCIÓN TURNO TARDE */}
          {gruposTurno.tarde.length > 0 && (
            <TablaTurno
              titulo="Turno Tarde"
              horario="14:00 a 17:00 hs"
              icono={<Sunset size={16} className="text-indigo-400" />}
              pedidos={gruposTurno.tarde}
              imprimirRemitoPedido={imprimirRemitoPedido}
            />
          )}

          {/* SECCIÓN SIN TURNO */}
          {gruposTurno.sinTurno.length > 0 && (
            <TablaTurno
              titulo="Sin Turno Asignado"
              horario="Horario a coordinar"
              icono={<Clock size={16} className="text-gray-400" />}
              pedidos={gruposTurno.sinTurno}
              imprimirRemitoPedido={imprimirRemitoPedido}
            />
          )}

          {/* Si aplicó filtro de estado y no quedaron pedidos en ningún turno */}
          {gruposTurno.manana.length === 0 && gruposTurno.tarde.length === 0 && gruposTurno.sinTurno.length === 0 && (
            <div className="bg-[#1f2937] border border-gray-800 rounded-2xl p-8 text-center text-gray-400 text-xs italic">
              No hay pedidos con el estado "{filtroEstado}" en esta fecha.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TablaTurno({ titulo, horario, icono, pedidos, imprimirRemitoPedido }) {
  return (
    <div className="bg-[#1f2937] border border-gray-800 rounded-2xl overflow-hidden shadow-md">
      <div className="px-5 py-3.5 bg-[#111827]/70 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icono}
          <h3 className="text-sm font-bold text-white">{titulo}</h3>
          <span className="text-xs text-gray-400">· {horario}</span>
        </div>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 border border-gray-700">
          {pedidos.length} {pedidos.length === 1 ? 'pedido' : 'pedidos'}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase">
              <th className="text-left px-4 py-3 font-semibold"># Pedido</th>
              <th className="text-left px-4 py-3 font-semibold">Cliente</th>
              <th className="text-left px-4 py-3 font-semibold">Localidad</th>
              <th className="text-left px-4 py-3 font-semibold">Productos</th>
              <th className="text-left px-4 py-3 font-semibold">Total</th>
              <th className="text-left px-4 py-3 font-semibold">Estado</th>
              <th className="text-left px-4 py-3 font-semibold">Pago</th>
              <th className="text-center px-4 py-3 font-semibold">Remito</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/60">
            {pedidos.map(p => {
              const formaPago = (p.forma_pago || '').toLowerCase().trim();
              const metodoPago = (p.metodo_pago || p.medio_pago || '').toLowerCase().trim();
              const estadoPago = (p.estado_pago || '').toLowerCase().trim();

              const esContraEntrega = formaPago === 'entrega' || METODOS_PAGO_CONTRA_ENTREGA.includes(metodoPago) || METODOS_PAGO_CONTRA_ENTREGA.includes(formaPago);
              const esAprobado = estadoPago === 'approved' || estadoPago === 'pagado';

              return (
                <tr key={p.numero_pedido} className="hover:bg-gray-800/40 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono font-semibold text-white">{p.numero_pedido}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-white text-xs block">{p.nombre}</span>
                    {p.telefono && <span className="text-[11px] text-gray-500">{p.telefono}</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{p.localidad || '-'}</td>
                  <td className="px-4 py-3">
                    <span className="text-white text-xs block line-clamp-1">{p.producto || 'Varios'}</span>
                    <span className="text-[11px] text-gray-500">x{p.cantidades || 1}</span>
                  </td>
                  <td className="px-4 py-3 font-bold text-emerald-400 text-xs">
                    {$$(p.total)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge config={ESTADO_CONFIG[p.estado] || ESTADO_CONFIG.pendiente} />
                  </td>
                  <td className="px-4 py-3">
                    {esContraEntrega ? (
                      <div>
                        <span className="text-xs font-semibold text-amber-400 block">Pago contra entrega</span>
                        <span className="text-[10px] text-gray-500 block leading-tight">(QR, transf, débito, crédito)</span>
                      </div>
                    ) : esAprobado ? (
                      <span className="text-xs font-semibold text-emerald-400">Pagado online</span>
                    ) : formaPago === 'link' || metodoPago === 'link' ? (
                      <span className="text-xs font-semibold text-sky-400">Link de pago</span>
                    ) : (
                      <span className="text-xs font-semibold text-gray-400">
                        {etiquetaMedioPagoDisplay(p)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => imprimirRemitoPedido(p)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 hover:text-white rounded-lg text-xs font-semibold transition-all active:scale-95 cursor-pointer"
                      title="Imprimir remito individual"
                    >
                      <Printer size={12} className="text-indigo-400" />
                      <span>Remito</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
