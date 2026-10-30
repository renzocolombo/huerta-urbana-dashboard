import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { useState, useMemo, useEffect, useRef, useCallback, Fragment } from 'react';
import { 
  MapPin, ChevronDown, ChevronUp, MessageCircle, AlertCircle, Package, 
  CheckCircle, Sun, Sunset, Printer, FileText, User, Clock, ScanBarcode, 
  X, Trash2, Check, RotateCcw, Lock, AlertTriangle, Sparkles, Tag, CheckSquare, Square,
  CreditCard, DollarSign, Calendar, ArrowRight
} from 'lucide-react';
import { imprimirRemitoIndividual, imprimirRemitosEnLote, parsearProductosPedido, estaPedidoArmado } from '../utils/remitoPrinter';
import { getEanMapping, esCodigoEan } from '../data/productUtils';
import { syncProductWithSheet } from '../utils/stockSync';
import { 
  apiReservarPedido, 
  apiRegistrarPesadas, 
  apiGuardarPreparacion, 
  apiGetPreparaciones, 
  apiSetDetallePedido, 
  apiGetReservas, 
  apiLiberarPedido,
  apiGetPreciosSugeridos,
  apiCobrarPedido,
  apiEntregarPedido,
  apiRegistrarNoEntrega,
  apiGetNoEntregasCliente,
  apiGetNoEntregasBatch,
  apiLiberarCredito,
  apiGetEstadoCreditoPedidos,
  apiRegistrarReembolso,
  apiGetReembolsosPendientes,
  apiGetReembolsos,
  apiGetFeriados
} from '../utils/mercaderiaApi';
import { calcularTotalPedido, esItemSinStock } from '../utils/totalesPedido';
import { imprimirEtiquetaBolsa } from '../utils/etiquetaPrinter';
import { esPedidoCobrado, estadoEntregaPedido, estadoPagoPedido, calcularResumenDia } from '../utils/estadosPedido';
import ResumenDiaBar from './ResumenDiaBar';
import ReembolsosTab from './ReembolsosTab';
import ModalReembolsoDevuelto from './ModalReembolsoDevuelto';
import CalendarioEntregas from './CalendarioEntregas';
import { 
  parsearFecha, 
  fechaA_YMD, 
  calcularFechaEntregaProgramada, 
  extraerFechaYMD, 
  getHoyYMD, 
  esFechaInterpretable, 
  obtenerFechaCierreEfectiva 
} from '../utils/fechasEntrega';
import {
  BLOQUES, bloquesDisponibles, formatoDiaEntrega, etiquetaBloque, turnoDePedido,
} from '../utils/entregaCalendario';
import {
  enriquecerPedido, agruparPorFecha, etiquetaFecha, claveTabInicial, alertasEntrega, conteoPorFecha,
  CLAVE_ATRASADOS, esPedidoElegibleReparto, esFormaEntregaOLink, METODOS_PAGO_CONTRA_ENTREGA,
} from '../utils/agendaCalendario';

const $$ = (n) => `$${Number(n).toLocaleString('es-AR')}`;
// Horario textual de un bloque (columna horario_entrega al reagendar): "08:00 - 12:00" / "14:00 - 17:00"
const horarioDeBloque = (b) => `${String(BLOQUES[b].desde).padStart(2, '0')}:00 - ${String(BLOQUES[b].hasta).padStart(2, '0')}:00`;

const PAGO_CONFIG = {
  pagado:    { label: 'Pagado',    color: 'text-green-400' },
  approved:  { label: 'Aprobado',  color: 'text-green-400' },
  aprobado:  { label: 'Aprobado',  color: 'text-green-400' },
  pendiente: { label: 'Pendiente', color: 'text-amber-400' },
  pending:   { label: 'Pendiente', color: 'text-amber-400' },
  sin_pago:  { label: 'Sin pago',  color: 'text-gray-500' },
  rejected:  { label: 'Rechazado', color: 'text-red-400' },
  rechazado: { label: 'Rechazado', color: 'text-red-400' },
  cancelled: { label: 'Cancelado', color: 'text-gray-500' },
  cancelado: { label: 'Cancelado', color: 'text-gray-500' },
};

const MEDIOS_LABELS = {
  debito: 'Débito',
  credito: 'Crédito',
  prepaga: 'Prepaga',
  qr: 'QR',
  transferencia: 'Transferencia',
  link_pago: 'Link de Pago',
  link: 'Link de Pago',
  efectivo: 'Pago contra entrega',
  contra_entrega: 'Pago contra entrega',
  al_recibir: 'Pago contra entrega',
  entrega: 'Pago contra entrega',
};

const MEDIOS_REEMBOLSO_LABELS = {
  mercado_pago: 'Mercado Pago',
  transferencia: 'Transferencia',
  otro: 'Otro',
};

const PREPARACIONES_KEY = 'huerta_preparaciones_v1';
const PROCESSED_CODES_KEY = 'huerta_codigos_procesados_v1';
const MOTIVOS_KEY = 'huerta_motivos_no_entrega_v1';
const FECHAS_NO_ENTREGA_KEY = 'huerta_fechas_no_entrega_v1';

const MOTIVOS_PREDEFINIDOS = [
  { label: 'Cliente ausente / No atiende', icon: '🚪' },
  { label: 'Dirección errónea o incompleta', icon: '📍' },
  { label: 'Cliente rechazó el pedido', icon: '🛑' },
  { label: 'Cliente pidió reprogramar entrega', icon: '🗓️' },
  { label: 'Problema de tránsito / acceso / clima', icon: '🌧️' },
  { label: 'Teléfono apagado / Sin respuesta', icon: '📵' },
];

// ── Helper: Formato internacional argentino para WhatsApp Web ────────────────
export function formatearTelefonoWhatsApp(telefono) {
  if (!telefono) return '';
  let digits = String(telefono).replace(/\D/g, '');
  if (!digits) return '';

  // Quitar ceros iniciales (código interurbano nacional ej. 011 -> 11, 02320 -> 2320)
  digits = digits.replace(/^0+/, '');

  // Si ya tiene código de país 54:
  if (digits.startsWith('54')) {
    let sin54 = digits.slice(2).replace(/^0+/, '');
    if (sin54.startsWith('9')) {
      let sin9 = sin54.slice(1).replace(/^0+/, '');
      if (sin9.startsWith('1115')) {
        sin9 = '11' + sin9.slice(4);
      } else if (sin9.startsWith('15')) {
        sin9 = sin9.slice(2);
      }
      return '549' + sin9;
    }
    if (sin54.startsWith('1115')) {
      sin54 = '11' + sin54.slice(4);
    } else if (sin54.startsWith('15')) {
      sin54 = sin54.slice(2);
    }
    return '549' + sin54;
  }

  // Si no tiene prefijo 54:
  if (digits.startsWith('1115')) {
    digits = '11' + digits.slice(4);
  } else if (digits.startsWith('15')) {
    digits = digits.slice(2);
  }

  if (digits.startsWith('9')) {
    return '54' + digits;
  }

  return '549' + digits;
}

export function abrirWhatsAppWeb(telefono, texto) {
  const phone = formatearTelefonoWhatsApp(telefono);
  const url = `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(texto || '')}`;
  window.open(url, '_blank', 'noopener');
}

// ── Helper: Condición única de pedido pendiente de entrega ──────────────────
export function esPedidoPendienteDeEntrega(p, estadoActualOverride) {
  if (!p) return false;
  const est = (estadoActualOverride || p.estado || 'pendiente').toLowerCase().trim();
  // Si está Entregado, Cancelado o No entregado, NO es pendiente de entrega
  if (est === 'entregado' || est === 'delivered' || est === 'cancelado' || est === 'cancelled') return false;
  if (est === 'no_entregado' || est === 'no entregado') return false;
  return true;
}

// ── Helpers de fechas y cierre de pedidos ────────────────────────────────────
// parsearFecha, fechaA_YMD, calcularFechaEntregaProgramada, extraerFechaYMD, getHoyYMD,
// esFechaInterpretable y obtenerFechaCierreEfectiva viven en utils/fechasEntrega.js (se reexportan aca por compatibilidad).
export { 
  parsearFecha, 
  fechaA_YMD, 
  calcularFechaEntregaProgramada, 
  extraerFechaYMD, 
  getHoyYMD, 
  esFechaInterpretable, 
  obtenerFechaCierreEfectiva 
};

// ── Normalizar texto para matcheo fuzzy ────────────────────────────────────
const norm = (s) => (s || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// ── Parsear código de barras ────────────────────────────────────────────────
function parsearCodigoBarras(raw) {
  if (!raw) return null;
  let code = String(raw).replace(/[\r\n\x00-\x1F]/g, '').trim().replace(/^\][a-zA-Z0-9]{2,3}/, '').trim();
  code = code.replace(/^\*+|\*+$/g, '').trim();
  if (!code) return null;

  // 1. Formato Balanza Systel / Kretz / Toledo (EAN-13 estándar de balanza)
  const eanBalanza = code.match(/^(20|02)(\d{4,5})(\d{5})\d$/);
  if (eanBalanza) {
    const plu = eanBalanza[2]; const gramos = parseInt(eanBalanza[3], 10);
    return { nombre: `plu ${plu}`, plu, peso: Math.round((gramos / 1000) * 1000) / 1000, tagId: null, uniqueCode: code.toUpperCase(), rawCode: code, origenBalanza: true };
  }

  // 2. Formato con ID único por bolsa: NOMBRE-PESO-TAGID (ej: BANANA-1.000-E49A, PAPA-1.120-7K9F)
  const parts = code.split('-');
  if (parts.length >= 3) {
    const lastPart = parts[parts.length - 1].trim();
    const secondLastRaw = parts[parts.length - 2].trim().replace(',', '.').replace(/(?:kg|kilos?|g|gr?)$/i, '').trim();
    const pesoNum = parseFloat(secondLastRaw);
    if (!isNaN(pesoNum) && pesoNum > 0 && /^[A-Za-z0-9]{2,10}$/.test(lastPart)) {
      const nombre = parts.slice(0, parts.length - 2).join(' ').toLowerCase().trim();
      const pesoKg = pesoNum >= 100 && !/[.,]/.test(secondLastRaw) ? pesoNum / 1000 : pesoNum;
      return { nombre, peso: Math.round(pesoKg * 1000) / 1000, tagId: lastPart.toUpperCase(), uniqueCode: code.toUpperCase(), rawCode: code };
    }
  }

  // 3. Formato clásico: NOMBRE-PESO (ej: PAPA-1.120, TOMATE-CHERRY-0.500)
  const lastDashIdx = code.lastIndexOf('-');
  if (lastDashIdx > 0) {
    const rawPeso = code.slice(lastDashIdx + 1).replace(',', '.').replace(/(?:kg|kilos?|g|gr?)$/i, '').trim();
    const pesoNum = parseFloat(rawPeso);
    if (!isNaN(pesoNum) && pesoNum > 0) {
      const nombre = code.slice(0, lastDashIdx).toLowerCase().replace(/-/g, ' ').trim();
      const pesoKg = pesoNum >= 100 && !/[.,]/.test(rawPeso) ? pesoNum / 1000 : pesoNum;
      return { nombre, peso: Math.round(pesoKg * 1000) / 1000, tagId: null, uniqueCode: code.toUpperCase(), rawCode: code };
    }
  }

  // 4. Formato alternativo con espacios, guión bajo o dos puntos (ej: "PAPA 1.120", "PAPA 1.120 KG", "PAPA_0.500")
  const altMatch = code.match(/^(.+?)[\s_:–]+([0-9]+(?:[.,][0-9]+)?)\s*(?:kg|kilos?|g|gr?)?$/i);
  if (altMatch) {
    const nombre = altMatch[1].toLowerCase().replace(/[-_]/g, ' ').trim();
    const rawPeso = altMatch[2].replace(',', '.');
    const pesoNum = parseFloat(rawPeso);
    if (!isNaN(pesoNum) && pesoNum > 0) {
      const pesoKg = pesoNum >= 100 && !/[.,]/.test(altMatch[2]) ? pesoNum / 1000 : pesoNum;
      return {
        nombre,
        peso: Math.round(pesoKg * 1000) / 1000,
        tagId: null,
        uniqueCode: code.toUpperCase(),
        rawCode: code
      };
    }
  }

  return { nombre: code.toLowerCase().replace(/[-_]/g, ' ').trim(), peso: null, tagId: null, uniqueCode: code.toUpperCase(), rawCode: code, esIncompleto: true };
}

function determinarSlot(tipo, pesoKg) {
  if (tipo === 'hoja verde') return pesoKg <= 0.35 ? '500g' : '1kg';
  return pesoKg <= 0.75 ? '500g' : '1kg';
}

const PRODUCT_TYPES = {
  'hoja verde': ['espinaca', 'lechuga', 'rucula', 'acelga', 'perejil', 'albahaca', 'ciboulette', 'radicheta'],
  'blando': ['tomate', 'tomate cherry', 'banana', 'durazno', 'frutilla', 'pera', 'morron', 'pepino', 'chaucha', 'berenjena'],
  'duro': ['papa', 'cebolla', 'cebolla comun', 'cebolla morada', 'zanahoria', 'zapallito', 'zapallo blanco', 'cabutia', 'ajo', 'remolacha', 'hinojo', 'apio', 'brocoli', 'coliflor', 'repollo', 'choclo', 'huevos', 'miel pura', 'palta', 'manzana roja', 'manzana verde', 'naranja', 'limon', 'pomelo', 'uva', 'arandano', 'boniato']
};

function getTipoByNombre(nombre) {
  const n = norm(nombre);
  if (PRODUCT_TYPES['hoja verde'].some(p => n.includes(p))) return 'hoja verde';
  if (PRODUCT_TYPES['blando'].some(p => n.includes(p))) return 'blando';
  return 'duro';
}

// ══════════════════════════════════════════════════════════════════════════════

export default function AgendaEntregas({ rol, usuario, onNav, fechaCompartida, setFechaCompartida }) {
  const { 
    pedidos: PEDIDOS, 
    actualizarEstadoEnSheet, 
    actualizarRemitoEnSheet, 
    actualizarDatosCliente,
    eliminarPedidoOCliente, 
    stockData, 
    setStockData, 
    productosCostos,
    fetchSheetPedidos
  } = useGoogleSheets();

  const esRen = (usuario || localStorage.getItem('huerta_auth_usuario') || '').trim().toLowerCase() === 'ren';

  // ── Calendario de entregas: feriados/días cerrados (se cargan una vez al abrir la Agenda) ──
  const [feriados, setFeriados] = useState([]);
  const [avisoFeriados, setAvisoFeriados] = useState(null);
  const [tabSeleccionada, setTabSeleccionada] = useState(() => fechaCompartida || null);
  const hoyYMD = getHoyYMD();

  useEffect(() => {
    if (fechaCompartida) {
      setTabSeleccionada(fechaCompartida);
    }
  }, [fechaCompartida]);

  const cargarFeriados = useCallback(async () => {
    const r = await apiGetFeriados();
    if (r.ok && Array.isArray(r.feriados)) {
      setFeriados(r.feriados);
      setAvisoFeriados(null);
    } else {
      setFeriados([]);
      setAvisoFeriados('No se pudo cargar el calendario de feriados; se muestran las fechas sin avisos de días cerrados.');
    }
  }, []);

  useEffect(() => { cargarFeriados(); }, [cargarFeriados]);

  // ── Precios sugeridos / publicados del Sheet para congelar detalle ────────
  const [preciosSugeridosList, setPreciosSugeridosList] = useState([]);

  // ── Checklist por producto para armado de pedidos (Requisito 6) ───────────
  const [checksPorPedido, setChecksPorPedido] = useState({}); // { [numPedido]: { [itemIdx]: boolean } }

  // ── Selección para impresión en lote de remitos armados (Requisito 7) ─────
  const [seleccionadosRemito, setSeleccionadosRemito] = useState([]);
  const [filtroSoloArmados, setFiltroSoloArmados] = useState(false);

  // ── Estados de proceso y feedback ─────────────────────────────────────────
  const [guardandoPedidoArmado, setGuardandoPedidoArmado] = useState(false);
  const [pedidoRecienArmado, setPedidoRecienArmado] = useState(null); // { pedido, numPedido, prep }
  const [avisoReserva, setAvisoReserva] = useState(null); // { tipo: 'warning' | 'error', mensaje: string }
  const reservasLlamadasRef = useRef(new Set());

  const [estados, setEstados] = useState(() => {
    const map = {};
    (PEDIDOS || []).forEach(p => { map[p.numero_pedido] = p.estado; });
    return map;
  });

  // ── Vistas y filtros de Lista Fresca / Historial (Requisitos 1, 2, 4) ────────
  const [vistaActual, setVistaActual] = useState('agenda'); // 'agenda' | 'historial'
  const [periodoHistorial, setPeriodoHistorial] = useState('7d'); // '7d' | '30d' | 'todos'
  const [busquedaHistorial, setBusquedaHistorial] = useState('');
  const [entregadosHoyAbierto, setEntregadosHoyAbierto] = useState(false);

  // ── Lista principal "Activos" por fecha y bloque ───────────────────────────
  // Todos los pedidos pendientes (no Entregado y no Cancelado). Fecha/bloque salen de dia_entrega
  // ("Lunes 09/11/2026 Tarde"); los pedidos viejos ("Martes"/"Jueves") usan el cálculo anterior y quedan sin bloque.
  // Los de una fecha ya pasada sin entregar van a la pestaña "Atrasados".
  // Siempre se muestran los pedidos con reembolso pendiente (reembolso_estado = pendiente), aunque estén cancelados.
  const pedidosActivosTodos = useMemo(() => {
    const hoy = getHoyYMD();

    const activos = (PEDIDOS || []).filter(p => {
      const estadoActual = estados[p.numero_pedido] || p.estado;
      return esPedidoElegibleReparto(p, estadoActual);
    }).map(p => {
      const tieneReembolsoPendiente = (p.reembolso_estado || '').toLowerCase().trim() === 'pendiente';
      return { ...enriquecerPedido(p, hoy), esReembolsoPendiente: tieneReembolsoPendiente };
    });

    // Reembolsos pendientes primero (el orden por fecha/bloque lo da el agrupamiento)
    return activos.sort((a, b) => {
      if (a.esReembolsoPendiente && !b.esReembolsoPendiente) return -1;
      if (!a.esReembolsoPendiente && b.esReembolsoPendiente) return 1;
      return 0;
    });
  }, [PEDIDOS, estados]);

  const gruposEntrega = useMemo(() => agruparPorFecha(pedidosActivosTodos), [pedidosActivosTodos]);

  // Pestañas dinámicas: "Atrasados" (rojo) + una por fecha con pedidos activos, ordenadas, con contador
  const tabsEntrega = useMemo(() => {
    const arr = [];
    if (gruposEntrega.atrasados.length > 0) {
      arr.push({ clave: CLAVE_ATRASADOS, label: 'Atrasados', count: gruposEntrega.atrasados.length, atrasado: true });
    }
    gruposEntrega.dias.forEach(d => {
      arr.push({ clave: d.clave, label: d.ymd ? etiquetaFecha(d.ymd, hoyYMD) : 'Sin fecha', count: d.pedidos.length, ymd: d.ymd });
    });
    return arr;
  }, [gruposEntrega, hoyYMD]);

  const tabActiva = (tabSeleccionada && tabsEntrega.some(t => t.clave === tabSeleccionada))
    ? tabSeleccionada
    : claveTabInicial(tabsEntrega.map(t => t.clave), hoyYMD);

  // Pedidos de la pestaña elegida
  const pedidosDelDia = useMemo(() => {
    if (tabActiva === CLAVE_ATRASADOS) return gruposEntrega.atrasados;
    return gruposEntrega.dias.find(d => d.clave === tabActiva)?.pedidos || [];
  }, [gruposEntrega, tabActiva]);

  // Texto de la pestaña activa (títulos de impresión)
  const tituloTabActiva = useMemo(() => {
    const t = tabsEntrega.find(x => x.clave === tabActiva);
    return t ? t.label : '';
  }, [tabsEntrega, tabActiva]);

  // Cantidad de pedidos programados por fecha (para el Calendario)
  const conteoCalendario = useMemo(() => conteoPorFecha(pedidosActivosTodos), [pedidosActivosTodos]);

  // Ya no hay toggle de turno: la pestaña elegida muestra Mañana / Tarde / Sin horario en secciones.
  const pedidosDelTurno = pedidosDelDia;

  // ── Bloque "Entregados hoy" (Requisito 2) ──────────────────────────────────
  // Pedidos Entregados o Cancelados cuya fecha de cierre (fecha_entrega, o fecha_cierre si es cancelado) sea de hoy.
  const pedidosEntregadosHoyDelTurno = useMemo(() => {
    const hoyYMD = getHoyYMD();

    return (PEDIDOS || []).filter(p => {
      const estadoActual = (estados[p.numero_pedido] || p.estado || '').toLowerCase().trim();
      const tieneReembolsoPendiente = (p.reembolso_estado || '').toLowerCase().trim() === 'pendiente';
      const esEntregado = estadoActual === 'entregado' || estadoActual === 'delivered';
      const esCancelado = estadoActual === 'cancelado' || estadoActual === 'cancelled' || (estadoActual === 'no_entregado' && (p.motivo_no_entrega || '').toLowerCase().includes('cancel'));
      const esCerrado = (esEntregado || esCancelado) && !tieneReembolsoPendiente;

      if (!esCerrado) return false;

      const fechaCierre = obtenerFechaCierreEfectiva(p, estadoActual);
      const fechaCierreYMD = extraerFechaYMD(fechaCierre);
      if (fechaCierreYMD !== hoyYMD) return false;
      return true;
    });
  }, [PEDIDOS, estados]);

  // ── Vista Historial (Requisito 4) ─────────────────────────────────────────
  // Pedidos cerrados de los últimos 7 días (selector: 7 días, 30 días, todos), ordenados del más reciente al más viejo,
  // con buscador por número de pedido o nombre del cliente. Si no tiene fecha_entrega ni fecha_cierre, usa p.fecha; si tampoco hay, 'sin fecha'.
  const pedidosHistorial = useMemo(() => {
    const hace7 = new Date();
    hace7.setDate(hace7.getDate() - 7);
    const hace7YMD = extraerFechaYMD(hace7);

    const hace30 = new Date();
    hace30.setDate(hace30.getDate() - 30);
    const hace30YMD = extraerFechaYMD(hace30);

    const busqNorm = norm(busquedaHistorial);

    return (PEDIDOS || []).filter(p => {
      const estadoActual = (estados[p.numero_pedido] || p.estado || '').toLowerCase().trim();
      const tieneReembolsoPendiente = (p.reembolso_estado || '').toLowerCase().trim() === 'pendiente';
      const esEntregado = estadoActual === 'entregado' || estadoActual === 'delivered';
      const esCancelado = estadoActual === 'cancelado' || estadoActual === 'cancelled' || (estadoActual === 'no_entregado' && (p.motivo_no_entrega || '').toLowerCase().includes('cancel'));
      const esCerrado = (esEntregado || esCancelado) && !tieneReembolsoPendiente;

      if (!esCerrado) return false;

      // Fecha de entrega o cierre, con respaldo en la fecha del pedido
      const fechaCierreRaw = obtenerFechaCierreEfectiva(p, estadoActual);
      const fechaEfectiva = fechaCierreRaw || p.fecha || '';
      const fechaYMD = extraerFechaYMD(fechaEfectiva);

      // Selector de periodo: 7 días, 30 días, todos
      if (periodoHistorial === '7d') {
        if (fechaYMD && fechaYMD < hace7YMD) return false;
      } else if (periodoHistorial === '30d') {
        if (fechaYMD && fechaYMD < hace30YMD) return false;
      }

      // Buscador por número de pedido o nombre del cliente
      if (busqNorm) {
        const numNorm = norm(p.numero_pedido);
        const nomNorm = norm(p.nombre);
        if (!numNorm.includes(busqNorm) && !nomNorm.includes(busqNorm)) {
          return false;
        }
      }

      return true;
    }).map(p => {
      const estadoActual = (estados[p.numero_pedido] || p.estado || '').toLowerCase().trim();
      const fechaCierreRaw = obtenerFechaCierreEfectiva(p, estadoActual);
      const fechaDisplay = fechaCierreRaw || p.fecha || 'sin fecha';
      const fechaComparable = extraerFechaYMD(fechaCierreRaw || p.fecha || '') || '1970-01-01';

      return {
        ...p,
        _estadoActual: estadoActual,
        _fechaDisplay: fechaDisplay,
        _fechaComparable: fechaComparable
      };
    }).sort((a, b) => {
      if (a._fechaComparable > b._fechaComparable) return -1;
      if (a._fechaComparable < b._fechaComparable) return 1;
      return String(b.numero_pedido).localeCompare(String(a.numero_pedido));
    });
  }, [PEDIDOS, estados, periodoHistorial, busquedaHistorial]);

  const [pedidosAbiertos, setPedidosAbiertos] = useState({});

  // ── No Entregas y Alertas por Cliente (Consulta por Lote / Batch) ───────────
  const [noEntregasMap, setNoEntregasMap] = useState({}); // { [numPedido]: { total, nivel, cliente_clave } }
  const [noEntregasError, setNoEntregasError] = useState(false);
  const [cargandoNoEntregas, setCargandoNoEntregas] = useState(false);
  const consultadosNoEntregasRef = useRef(new Set());

  // Consultar no entregas de todos los pedidos visibles en una ÚNICA llamada por lote
  const cargarNoEntregasBatch = useCallback(async () => {
    if (!pedidosDelDia || pedidosDelDia.length === 0) return;

    const pedidosAConsultar = pedidosDelDia
      .filter(p => p.numero_pedido && !consultadosNoEntregasRef.current.has(p.numero_pedido))
      .map(p => p.numero_pedido);

    if (pedidosAConsultar.length === 0) return;

    pedidosAConsultar.forEach(num => consultadosNoEntregasRef.current.add(num));

    setCargandoNoEntregas(true);
    setNoEntregasError(false);

    try {
      const res = await apiGetNoEntregasBatch({ pedidos: pedidosAConsultar });
      if (res && res.ok && res.resultados) {
        const actualizados = {};
        for (const [numPedido, info] of Object.entries(res.resultados)) {
          if (info && info.total != null) {
            actualizados[numPedido] = {
              total: Number(info.total),
              nivel: info.nivel || 'ok',
              cliente_clave: info.cliente_clave
            };
          }
        }
        if (Object.keys(actualizados).length > 0) {
          setNoEntregasMap(prev => ({ ...prev, ...actualizados }));
        }
      } else {
        setNoEntregasError(true);
      }
    } catch (err) {
      console.warn('[AGENDA] Error consultando no entregas en lote:', err.message);
      setNoEntregasError(true);
    } finally {
      setCargandoNoEntregas(false);
    }
  }, [pedidosDelDia]);

  useEffect(() => {
    cargarNoEntregasBatch();
  }, [cargarNoEntregasBatch]);

  // Consultar estado de crédito de referidos en lote para pedidos con crédito usado
  const [estadosCreditoMap, setEstadosCreditoMap] = useState({});
  const consultadosCreditoRef = useRef(new Set());

  const cargarEstadosCreditoBatch = useCallback(async () => {
    if (!pedidosDelDia || pedidosDelDia.length === 0) return;

    const pedidosAConsultar = pedidosDelDia
      .filter(p => p.numero_pedido && Number(p.credito_usado) > 0 && !consultadosCreditoRef.current.has(p.numero_pedido))
      .map(p => p.numero_pedido);

    if (pedidosAConsultar.length === 0) return;

    pedidosAConsultar.forEach(num => consultadosCreditoRef.current.add(num));

    try {
      const res = await apiGetEstadoCreditoPedidos({ pedidos: pedidosAConsultar });
      if (res && res.ok && res.resultados) {
        setEstadosCreditoMap(prev => ({ ...prev, ...res.resultados }));
      }
    } catch (err) {
      console.warn('[AGENDA] Error consultando estados de credito:', err.message);
    }
  }, [pedidosDelDia]);

  useEffect(() => {
    cargarEstadosCreditoBatch();
  }, [cargarEstadosCreditoBatch]);

  // Modales
  const [modalNoEntrega, setModalNoEntrega] = useState(null); // { pedido, motivoSeleccionado, motivoOtro, accion, nuevoDia, nuevoHorario, guardando, resultado, error }
  const [modalCobrar, setModalCobrar] = useState(null);       // { pedido, totalCobrar, items, medio, nota, guardando, resultado, error }
  const [modalEliminar, setModalEliminar] = useState(null);   // { pedido }
  const [modalReiniciar, setModalReiniciar] = useState(null); // { pedido, numPedido, nombre }

  const abrirModalNoEntrega = (p) => {
    const motivoExistente = p.motivo_no_entrega || '';
    const motivosValidos = ['No estaba', 'No atendió', 'Dirección incorrecta'];
    const esPredefinido = motivosValidos.includes(motivoExistente);
    // Reagendar: primera fecha/bloque disponible (distinta de la actual) según el calendario
    const opcionesReagendar = bloquesDisponibles(new Date(), feriados);
    const primeraOpcion = opcionesReagendar.find(o => formatoDiaEntrega(o.ymd, o.bloque) !== p.dia_entrega) || opcionesReagendar[0];
    setModalNoEntrega({
      pedido: p,
      motivoSeleccionado: esPredefinido ? motivoExistente : (motivoExistente ? 'Otro' : 'No estaba'),
      motivoOtro: esPredefinido ? '' : motivoExistente,
      accion: null,
      nuevoDia: primeraOpcion ? formatoDiaEntrega(primeraOpcion.ymd, primeraOpcion.bloque) : '',
      nuevoHorario: primeraOpcion ? horarioDeBloque(primeraOpcion.bloque) : (p.horario_entrega || '09:00 - 13:00'),
      guardando: false,
      resultado: null,
      error: null,
    });
  };

  // ── Preparación de pedidos ─────────────────────────────────────────────────
  const [preparaciones, setPreparaciones] = useState(() => {
    try { const s = localStorage.getItem(PREPARACIONES_KEY); return s ? JSON.parse(s) : {}; } catch (e) { return {}; }
  });

  // Resumen de estados de entrega y cobro para la pestaña activa
  const resumenDia = useMemo(() => {
    return calcularResumenDia(pedidosDelDia, preparaciones);
  }, [pedidosDelDia, preparaciones]);
  const [preparandoPedido, setPreparandoPedido] = useState(null);
  const [modalPreparacion, setModalPreparacion] = useState(null); // { pedido }
  const [modalItemExtra, setModalItemExtra] = useState(null);     // { nombre, mappedEan, cleanCode, matchedStockId, numPedido, peso, tagId, slot, esUnidad }
  const [scanBuffer, setScanBuffer] = useState('');
  const [scanError, setScanError] = useState(null);
  const [scanSuccess, setScanSuccess] = useState(null);
  const scanInputRef = useRef(null);
  const modalScanInputRef = useRef(null);
  const stockDataRef = useRef(stockData);
  const [syncNotice, setSyncNotice] = useState(null); // { tipo: 'retrying' | 'error' | 'success', mensaje: string }
  const syncTimerRef = useRef(null);
  const [reembolsosPendientesList, setReembolsosPendientesList] = useState([]);
  const [reembolsosData, setReembolsosData] = useState([]);
  const [cargandoReembolsos, setCargandoReembolsos] = useState(false);
  const [errorReembolsos, setErrorReembolsos] = useState(null);
  const [modalReembolso, setModalReembolso] = useState({
    abierto: false,
    pedido: null,
    guardando: false,
    error: null,
  });

  const cargarReembolsos = useCallback(async () => {
    setCargandoReembolsos(true);
    setErrorReembolsos(null);
    try {
      const res = await apiGetReembolsos();
      if (res && res.ok && Array.isArray(res.reembolsos)) {
        setReembolsosData(res.reembolsos);
        const pendientes = res.reembolsos.filter(r => (r.estado || '').toLowerCase().trim() === 'pendiente');
        setReembolsosPendientesList(pendientes);
      } else {
        setErrorReembolsos(res?.error || 'No se pudieron obtener los reembolsos.');
      }
    } catch (e) {
      setErrorReembolsos(e.message || 'Error de conexión al cargar reembolsos.');
    } finally {
      setCargandoReembolsos(false);
    }
  }, []);

  useEffect(() => {
    if (vistaActual === 'reembolsos') {
      cargarReembolsos();
    }
  }, [vistaActual, cargarReembolsos]);

  // 1. Cargar preparaciones del Sheet al montar y combinar (gana lo del Sheet)
  useEffect(() => {
    let isMounted = true;
    apiGetPreparaciones({ dias: 14 })
      .then(res => {
        if (!isMounted) return;
        if (res && res.ok && res.preparaciones) {
          setPreparaciones(prev => {
            const merged = { ...prev, ...res.preparaciones };
            try { localStorage.setItem(PREPARACIONES_KEY, JSON.stringify(merged)); } catch (e) {}
            return merged;
          });
        }
      })
      .catch(e => console.warn('[AGENDA] Error en apiGetPreparaciones:', e.message));

    apiGetPreciosSugeridos()
      .then(res => {
        if (!isMounted) return;
        if (res && res.ok && Array.isArray(res.precios)) {
          setPreciosSugeridosList(res.precios);
        }
      })
      .catch(() => {});

    apiGetReembolsosPendientes()
      .then(res => {
        if (!isMounted) return;
        if (res && res.ok && Array.isArray(res.reembolsos)) {
          setReembolsosPendientesList(res.reembolsos);
        }
      })
      .catch(e => console.warn('[AGENDA] Error en apiGetReembolsosPendientes:', e.message));

    return () => { isMounted = false; };
  }, []);

  const handleSyncStatus = useCallback((info, prodNombre) => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    if (info.status === 'retrying') {
      setSyncNotice({
        tipo: 'retrying',
        mensaje: `No se pudo guardar en el Sheet, reintentando... (${prodNombre})`
      });
    } else if (info.status === 'error') {
      setSyncNotice({
        tipo: 'error',
        mensaje: `No se pudo guardar "${prodNombre}" en el Sheet tras varios intentos. El cambio se mantuvo localmente.`
      });
      syncTimerRef.current = setTimeout(() => setSyncNotice(null), 6000);
    } else if (info.status === 'success') {
      setSyncNotice({
        tipo: 'success',
        mensaje: `✅ "${prodNombre}" guardado en Google Sheet`
      });
      syncTimerRef.current = setTimeout(() => setSyncNotice(null), 3000);
    }
  }, []);

  useEffect(() => { stockDataRef.current = stockData; }, [stockData]);
  useEffect(() => { try { localStorage.setItem(PREPARACIONES_KEY, JSON.stringify(preparaciones)); } catch (e) {} }, [preparaciones]);

  // Helper para persistir pesadas y preparación completa en el Sheet
  const sincronizarPesadasSheet = useCallback((numPed, prepObj) => {
    if (!numPed || !prepObj) return;
    apiGuardarPreparacion({ numero_pedido: numPed, preparacion: prepObj }).then(res => {
      if (res && res.ok === false) {
        setSyncNotice({ tipo: 'error', mensaje: `Error guardando preparación en Sheet: ${res.error}` });
      }
    }).catch(err => {
      setSyncNotice({ tipo: 'error', mensaje: `Error de red al guardar preparación: ${err.message}` });
    });

    const itemsPesadas = (prepObj.items || []).map(it => {
      const bolsas = it.bolsasAsignadas || [];
      let cant = 0;
      if (it.esUnidad || it.slot === 'unidades') cant = bolsas.length;
      else cant = Number(bolsas.reduce((s, b) => s + (Number(b.peso) || 0), 0).toFixed(3));
      return { producto: it.nombre, cantidad_real: cant };
    });

    apiRegistrarPesadas({ numero_pedido: numPed, items: itemsPesadas }).then(res => {
      if (res && res.ok === false) {
        setSyncNotice({ tipo: 'error', mensaje: `Error registrando pesadas en Sheet: ${res.error}` });
      }
    }).catch(err => {
      setSyncNotice({ tipo: 'error', mensaje: `Error de red al registrar pesadas: ${err.message}` });
    });
  }, []);

  // Helper para obtener precio unitario congelado por producto
  const obtenerPrecioCongelado = useCallback((nombreProd) => {
    const k = norm(nombreProd);
    // 1. Buscar en precios sugeridos / publicados de mercaderia
    const pSug = preciosSugeridosList.find(p => {
      const pNorm = norm(p.producto);
      return pNorm === k || k.includes(pNorm) || pNorm.includes(k);
    });
    if (pSug) {
      const pr = Number(pSug.precio_publicado) > 0 ? Number(pSug.precio_publicado) : Number(pSug.precio_sugerido);
      if (pr > 0) return pr;
    }
    // 2. Buscar en productosCostos
    const pCost = (productosCostos || []).find(p => {
      const pNorm = norm(p.nombre);
      return pNorm === k || k.includes(pNorm) || pNorm.includes(k);
    });
    if (pCost) {
      if (pCost.precioMaxManual && Number(pCost.precioMaxManual) > 0) return Number(pCost.precioMaxManual);
      if (pCost.precioCajon && pCost.cantidadCajon) {
        const costoUnit = Number(pCost.precioCajon) / Number(pCost.cantidadCajon);
        const margen = Number(pCost.margen || 60);
        return Math.round(costoUnit * (1 + margen / 100));
      }
    }
    return 0;
  }, [preciosSugeridosList, productosCostos]);

  // ── Helper: calcular total exacto a cobrar (redondeado a $1) ───────────────
  const calcularTotalDetalle = useCallback((p, prep) => {
    return calcularTotalPedido(p, prep, { obtenerPrecioCongelado }).monto;
  }, [obtenerPrecioCongelado]);

  // ── Total a cobrar del turno calculado SOLO sobre pedidos Activos (Requisito 5) ──
  const totalACobrarTurno = useMemo(() => {
    return pedidosDelTurno.reduce((sum, p) => {
      const formaPago = (p.forma_pago || '').toLowerCase().trim();
      const fueCobrado = esPedidoCobrado(p);
      const esPorCobrar = (formaPago === 'entrega' || formaPago === 'link') && !fueCobrado;
      if (!esPorCobrar) return sum;
      const prep = preparaciones[p.numero_pedido];
      const monto = calcularTotalDetalle(p, prep);
      return sum + monto;
    }, 0);
  }, [pedidosDelTurno, preparaciones, calcularTotalDetalle]);

  // ── Helper: obtener items para enviar a cobrarPedido con pesadas reales (sin items sin_stock) ───
  const obtenerItemsParaCobro = useCallback((p, prep) => {
    let detalleItems = null;
    const raw = p.detalle_json || prep?.detalle_json;
    if (raw) {
      try {
        detalleItems = typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : null);
      } catch (e) {}
    }
    if (Array.isArray(detalleItems) && detalleItems.length > 0) {
      return detalleItems
        .filter(it => !esItemSinStock(it))
        .map(it => ({
          producto: it.producto || it.nombre,
          cantidad_real: Number(it.cantidad_real != null ? it.cantidad_real : (it.cantidad || 0))
        }));
    }
    if (prep && Array.isArray(prep.items)) {
      return prep.items
        .filter(it => !esItemSinStock(it))
        .map(it => {
          const bolsas = it.bolsasAsignadas || [];
          const esUnidad = it.esUnidad || it.slot === 'unidades';
          const cantReal = esUnidad ? bolsas.length : Number(bolsas.reduce((s, b) => s + (Number(b.peso) || 0), 0).toFixed(3));
          return {
            producto: it.nombre,
            cantidad_real: cantReal
          };
        });
    }
    return [];
  }, []);

  const abrirModalCobrar = useCallback((p) => {
    const prep = preparaciones[p.numero_pedido];
    const calc = calcularTotalPedido(p, prep, { obtenerPrecioCongelado });
    const itemsCobro = obtenerItemsParaCobro(p, prep);
    setModalCobrar({
      pedido: p,
      totalCalculado: calc.monto,
      totalCobrar: calc.monto,
      esEstimado: calc.esEstimado,
      motivoEstimado: calc.motivoEstimado,
      estaArmado: calc.estaArmado,
      items: itemsCobro,
      medio: 'debito',
      nota: '',
      guardando: false,
      resultado: null,
      error: null,
    });
  }, [preparaciones, obtenerPrecioCongelado, obtenerItemsParaCobro]);

  const handleConfirmarCobro = useCallback(async () => {
    if (!modalCobrar || modalCobrar.guardando) return;

    // Si el pedido no está armado, advertencia y confirmación obligatoria
    if (!modalCobrar.estaArmado) {
      const confirma = window.confirm(
        `⚠️ El pedido ${modalCobrar.pedido.numero_pedido} no está armado (pesadas sin completar).\n\n¿Confirmás registrar el cobro con el monto estimado de $${Number(modalCobrar.totalCobrar).toLocaleString('es-AR')}?`
      );
      if (!confirma) return;
    }

    setModalCobrar(prev => ({ ...prev, guardando: true, error: null }));

    try {
      const pedido = modalCobrar.pedido;
      const res = await apiCobrarPedido({
        numero_pedido: pedido.numero_pedido,
        medio: modalCobrar.medio,
        monto: modalCobrar.totalCobrar,
        items: modalCobrar.items,
        nota: modalCobrar.nota,
      });

      if (!res || res.ok === false) {
        setModalCobrar(prev => ({
          ...prev,
          guardando: false,
          error: res?.error || 'Error al comunicarse con el servidor de cobros.'
        }));
        return;
      }

      if (res.ya_cobrado) {
        setModalCobrar(prev => ({
          ...prev,
          guardando: false,
          resultado: { ya_cobrado: true, avisos: res.avisos }
        }));
        if (fetchSheetPedidos) fetchSheetPedidos();
        return;
      }

      // Éxito: actualizar pedido en memoria
      pedido.cobrado = true;
      pedido.estado_pago = 'approved';
      pedido.medio_cobro = modalCobrar.medio;
      pedido.medio_pago = modalCobrar.medio;
      pedido.monto_cobrado = modalCobrar.totalCobrar;
      pedido.estado = 'Entregado';
      setEstados(prev => ({ ...prev, [pedido.numero_pedido]: 'Entregado' }));

      setModalCobrar(prev => ({
        ...prev,
        guardando: false,
        resultado: {
          cobrado: res.cobrado != null ? res.cobrado : modalCobrar.totalCobrar,
          comision: res.comision != null ? res.comision : 0,
          neto: res.neto != null ? res.neto : (modalCobrar.totalCobrar - (res.comision || 0)),
          avisos: res.avisos || null,
          creditos: res.creditos || null,
          referido: res.referido || null,
        }
      }));

      if (fetchSheetPedidos) fetchSheetPedidos();
      apiGetNoEntregasCliente({ numero_pedido: pedido.numero_pedido }).then(resNE => {
        if (resNE && resNE.ok && resNE.total != null) {
          setNoEntregasMap(prev => ({
            ...prev,
            [pedido.numero_pedido]: {
              total: Number(resNE.total),
              nivel: resNE.nivel,
              eventos: resNE.eventos
            }
          }));
        }
      }).catch(() => {});
    } catch (err) {
      setModalCobrar(prev => ({
        ...prev,
        guardando: false,
        error: err.message || 'Error inesperado al registrar el cobro'
      }));
    }
  }, [modalCobrar, fetchSheetPedidos]);

  const handleConfirmarReagendar = useCallback(async () => {
    if (!modalNoEntrega || modalNoEntrega.guardando) return;
    const p = modalNoEntrega.pedido;
    const motivoFinal = modalNoEntrega.motivoSeleccionado === 'Otro'
      ? (modalNoEntrega.motivoOtro.trim() || 'Otro')
      : modalNoEntrega.motivoSeleccionado;
    const fechaActual = new Date().toISOString().split('T')[0];

    setModalNoEntrega(prev => ({ ...prev, guardando: true, error: null }));
    try {
      // 1. Registrar no entrega en el backend primero
      const resNoEntrega = await apiRegistrarNoEntrega({
        numero_pedido: p.numero_pedido,
        motivo: motivoFinal,
        accion_tomada: 'reagendar',
      });

      if (!resNoEntrega || resNoEntrega.ok === false) {
        setModalNoEntrega(prev => ({
          ...prev,
          guardando: false,
          error: resNoEntrega?.error || 'Error al registrar la no entrega en el servidor.'
        }));
        return; // NO continuar con reagendar si falla
      }

      // 2. Ejecutar reagendado
      if (actualizarDatosCliente && p.sheetRowIndex) {
        await actualizarDatosCliente(p.sheetRowIndex, {
          dia_entrega: modalNoEntrega.nuevoDia,
          horario_entrega: modalNoEntrega.nuevoHorario,
          motivo_no_entrega: motivoFinal,
          fecha_no_entrega: fechaActual,
        });
      }

      p.dia_entrega = modalNoEntrega.nuevoDia;
      p.horario_entrega = modalNoEntrega.nuevoHorario;
      p.motivo_no_entrega = motivoFinal;
      p.fecha_no_entrega = fechaActual;

      // 3. Actualizar mapa de no entregas en memoria
      const nroFinal = resNoEntrega.nro || (Number(noEntregasMap[p.numero_pedido]?.total || 0) + 1);
      const nivelFinal = resNoEntrega.nivel || 'primera';
      setNoEntregasMap(prev => ({
        ...prev,
        [p.numero_pedido]: {
          total: nroFinal,
          nivel: nivelFinal,
        }
      }));

      // 4. Mostrar alerta / aviso según nivel
      setModalNoEntrega(prev => ({
        ...prev,
        guardando: false,
        resultado: {
          nro: nroFinal,
          nivel: nivelFinal,
          cliente: resNoEntrega.cliente || p.nombre || 'Cliente',
          telefono: p.telefono || '',
          accion: 'reagendar',
          nuevoDia: modalNoEntrega.nuevoDia,
          nuevoHorario: modalNoEntrega.nuevoHorario,
        }
      }));

      if (fetchSheetPedidos) fetchSheetPedidos();
    } catch (err) {
      setModalNoEntrega(prev => ({ ...prev, guardando: false, error: err.message || 'Error al reagendar pedido' }));
    }
  }, [modalNoEntrega, actualizarDatosCliente, noEntregasMap, fetchSheetPedidos]);

  const toggleCheckItem = useCallback((numPedido, itemIdx) => {
    setChecksPorPedido(prev => {
      const pedChecks = { ...(prev[numPedido] || {}) };
      pedChecks[itemIdx] = !pedChecks[itemIdx];
      return { ...prev, [numPedido]: pedChecks };
    });
  }, []);

  const getCodigosProcesados = () => {
    try { const s = localStorage.getItem(PROCESSED_CODES_KEY); return s ? JSON.parse(s) : {}; } catch (e) { return {}; }
  };
  const setCodigosProcesados = (updater) => {
    try { const c = getCodigosProcesados(); const n = typeof updater === 'function' ? updater(c) : updater; localStorage.setItem(PROCESSED_CODES_KEY, JSON.stringify(n)); } catch (e) {}
  };

  const toggleAcordeon = (id) => { setPedidosAbiertos(prev => ({ ...prev, [id]: !prev[id] })); };

  const actualizarEstado = (id, estadoAAsignar, motivo = null) => {
    setEstados(prev => ({ ...prev, [id]: estadoAAsignar }));
    const pedido = PEDIDOS.find(p => p.numero_pedido === id);
    if (pedido && pedido.sheetRowIndex) {
      actualizarEstadoEnSheet(pedido.sheetRowIndex, estadoAAsignar, motivo);
    }
  };

  const [entregandoPedido, setEntregandoPedido] = useState(null);

  const handleMarcarEntregado = useCallback(async (p) => {
    const estadoActual = (estados[p.numero_pedido] || p.estado || 'pendiente').toLowerCase();
    const formaPago = (p.forma_pago || '').toLowerCase().trim();
    const estadoPago = (p.estado_pago || '').toLowerCase().trim();
    const estaCobrado = esPedidoCobrado(p);

    // Un pedido que ya no está pendiente de entrega no puede volver a cobrarse ni a entregarse
    if (!esPedidoPendienteDeEntrega(p, estadoActual)) {
      return;
    }

    // 1. Si el pedido es de pago en la entrega o link y no está cobrado:
    // ese botón no debe marcar como entregado. En su lugar abre el modal de cobro (el mismo del botón Cobrar).
    // Entregado se marca solo desde el cobro (cobrarPedido ya marca Entregado y descuenta el stock).
    if ((formaPago === 'entrega' || formaPago === 'link') && !estaCobrado) {
      abrirModalCobrar(p);
      return;
    }

    // 2. Si el pedido es approved (pagó online):
    // al marcar Entregado, primero llamá a la acción entregarPedido del Apps Script { numero_pedido, items:[{producto, cantidad_real}] }
    if (estadoPago === 'approved' || estadoPago === 'pagado') {
      const prep = preparaciones[p.numero_pedido];
      const items = obtenerItemsParaCobro(p, prep);

      setEntregandoPedido(p.numero_pedido);
      try {
        const res = await apiEntregarPedido({
          numero_pedido: p.numero_pedido,
          items,
        });

        if (!res || res.ok === false) {
          setSyncNotice({
            tipo: 'error',
            mensaje: `Error al entregar pedido ${p.numero_pedido}: ${res?.error || 'Error reportado por el servidor'}`
          });
          setEntregandoPedido(null);
          return; // Si falla, no cambiar estado
        }

        // Mostrar avisos de stock negativo que devuelva el servidor
        if (res.avisos && (Array.isArray(res.avisos) ? res.avisos.length > 0 : res.avisos)) {
          const msgAvisos = Array.isArray(res.avisos) ? res.avisos.join('\n') : String(res.avisos);
          setSyncNotice({
            tipo: 'warning',
            mensaje: `Pedido ${p.numero_pedido} entregado. Avisos:\n${msgAvisos}`
          });
        } else {
          setSyncNotice({
            tipo: 'success',
            mensaje: `✅ Pedido ${p.numero_pedido} entregado y stock descontado.`
          });
        }

        // Solo si responde ok, cambiar estado a Entregado en la tarjeta
        actualizarEstado(p.numero_pedido, 'Entregado');
        p.estado = 'Entregado';

        // Refrescar datos de la tarjeta y alertas sin recargar la página
        if (fetchSheetPedidos) await fetchSheetPedidos();
        apiGetNoEntregasCliente({ numero_pedido: p.numero_pedido }).then(resNE => {
          if (resNE && resNE.ok && resNE.total != null) {
            setNoEntregasMap(prev => ({
              ...prev,
              [p.numero_pedido]: {
                total: Number(resNE.total),
                nivel: resNE.nivel,
                eventos: resNE.eventos
              }
            }));
          }
        }).catch(() => {});
      } catch (err) {
        setSyncNotice({
          tipo: 'error',
          mensaje: `Error de red al entregar pedido: ${err.message}`
        });
      } finally {
        setEntregandoPedido(null);
      }
      return;
    }

    // 3. Fallback para otros casos
    actualizarEstado(p.numero_pedido, 'Entregado');
    p.estado = 'Entregado';
    if (fetchSheetPedidos) fetchSheetPedidos();
  }, [estados, preparaciones, obtenerItemsParaCobro, abrirModalCobrar, actualizarEstado, fetchSheetPedidos]);

  const abrirWhatsApp = (telefono, nombre) => {
    const primerNombre = (nombre || '').split(' ')[0] || 'Cliente';
    const texto = `Hola ${primerNombre}! 👋 ¿Cómo estás? Te escribimos desde Huerta Urbana 🥬`;
    abrirWhatsAppWeb(telefono, texto);
  };

  const abrirRutaGoogle = () => {
    if (pedidosDelTurno.length === 0) return;
    const origen = 'Labarden 4252, Tortuguitas, Pilar, Buenos Aires';
    const destinos = pedidosDelTurno.map(p => `${p.direccion || ''}, ${p.localidad || ''}, Partido de Pilar, Buenos Aires`).join('/');
    window.open(`https://www.google.com/maps/dir/${encodeURIComponent(origen)}/${destinos}`, '_blank');
  };

  // ── INICIAR PREPARACIÓN ────────────────────────────────────────────────────
  const iniciarPreparacion = useCallback((pedido) => {
    const numPedido = pedido.numero_pedido;
    let itemsActuales = preparaciones[numPedido]?.items;

    if (!preparaciones[numPedido]) {
      itemsActuales = parsearProductosPedido(pedido.producto, pedido.cantidades);
      const nuevaPrep = { items: itemsActuales, completado: false, fechaInicio: new Date().toISOString() };
      setPreparaciones(prev => ({ ...prev, [numPedido]: nuevaPrep }));
      try {
        const local = JSON.parse(localStorage.getItem(PREPARACIONES_KEY) || '{}');
        localStorage.setItem(PREPARACIONES_KEY, JSON.stringify({ ...local, [numPedido]: nuevaPrep }));
      } catch (e) {}
      apiGuardarPreparacion({ numero_pedido: numPedido, preparacion: nuevaPrep }).catch(() => {});
    }

    // Reservar stock al abrir el pedido (primera vez, idempotente)
    if (!reservasLlamadasRef.current.has(numPedido)) {
      reservasLlamadasRef.current.add(numPedido);
      const itemsParaReserva = (itemsActuales || []).map(it => ({
        producto: it.nombre,
        cantidad: it.pesoSolicitado ? Number((it.pesoSolicitado * it.cantidad).toFixed(3)) : Number(it.cantidad || 1)
      }));

      apiReservarPedido({ numero_pedido: numPedido, items: itemsParaReserva })
        .then(res => {
          if (!res || res.ok === false) {
            setAvisoReserva({
              tipo: 'error',
              mensaje: `⚠️ Error al reservar stock en Sheet: ${res?.error || 'Respuesta no válida'}`
            });
          } else if (res.no_encontrados && res.no_encontrados.length > 0) {
            setAvisoReserva({
              tipo: 'warning',
              mensaje: `⚠️ Aviso: los siguientes productos no existen en el catálogo de Productos: ${res.no_encontrados.join(', ')}`
            });
          } else {
            setAvisoReserva(null);
          }
        })
        .catch(err => {
          setAvisoReserva({
            tipo: 'error',
            mensaje: `⚠️ Error de red al reservar stock: ${err.message}`
          });
        });
    }

    setPreparandoPedido(numPedido);
    setPedidosAbiertos(prev => ({ ...prev, [numPedido]: true }));
    setScanError(null);
    setScanSuccess(null);
    setModalPreparacion({ pedido });
    setTimeout(() => modalScanInputRef.current?.focus(), 150);
  }, [preparaciones]);

  // Revertir el descuento de stock de una bolsa puntual
  const revertirStockBolsa = useCallback((bolsa) => {
    if (!bolsa?.matchedStockId) return;
    const current = stockDataRef.current || {};
    const prod = current[bolsa.matchedStockId];
    if (!prod) return;
    const newData = { ...current };

    if (bolsa.esUnidad || bolsa.slot === 'unidades' || bolsa.slot === 'unidad') {
      const stockActual = Number(prod.stock?.unidades ?? prod.stock?.['1kg']) || 0;
      const nuevoStock = stockActual + 1;
      newData[bolsa.matchedStockId] = {
        ...prod,
        stock: { ...prod.stock, unidades: nuevoStock, '1kg': nuevoStock }
      };
      try {
        const unitsCache = JSON.parse(localStorage.getItem('huerta_stock_units_cache_v1') || '{}');
        const pNorm = norm(prod.nombre);
        if (unitsCache[pNorm]) {
          unitsCache[pNorm].stock = nuevoStock;
        } else {
          unitsCache[pNorm] = { stock: nuevoStock, originalLoad: nuevoStock, subcategoria: prod.subcategoria };
        }
        localStorage.setItem('huerta_stock_units_cache_v1', JSON.stringify(unitsCache));
      } catch (e) {}
    } else if (bolsa.slot) {
      const stockSlot = prod.stock?.[bolsa.slot] || 0;
      newData[bolsa.matchedStockId] = { ...prod, stock: { ...prod.stock, [bolsa.slot]: stockSlot + 1 } };
    }
    setStockData(newData);
  }, [setStockData]);

  // Confirmar y agregar un ítem extra escaneado que no figuraba en el pedido original
  const confirmarAgregarItemExtra = useCallback((itemExtraData) => {
    if (!itemExtraData || !itemExtraData.numPedido) return;
    const { nombre, cleanCode, matchedStockId, numPedido, peso, tagId, slot, esUnidad, mappedEan } = itemExtraData;
    const prepActual = preparaciones[numPedido];
    if (!prepActual) return;

    // Descontar 1 unidad o slot del stock
    const current = stockDataRef.current || {};
    let finalMatchedStockId = matchedStockId;
    if (!finalMatchedStockId && typeof current === 'object' && !Array.isArray(current)) {
      finalMatchedStockId = Object.keys(current).find(id => {
        const pNorm = norm(current[id]?.nombre);
        return pNorm === norm(nombre) || pNorm.includes(norm(nombre)) || norm(nombre).includes(pNorm);
      });
    }

    const matchedProd = finalMatchedStockId ? current[finalMatchedStockId] : null;
    if (matchedProd && finalMatchedStockId) {
      if (esUnidad) {
        const stockActual = Number(matchedProd.stock?.unidades ?? matchedProd.stock?.['1kg']) || 0;
        const nuevoStock = Math.max(0, stockActual - 1);
        const updatedProd = {
          ...matchedProd,
          stock: { ...matchedProd.stock, '1kg': nuevoStock, unidades: nuevoStock }
        };
        const newData = { ...current };
        newData[finalMatchedStockId] = updatedProd;
        setStockData(newData);
        try {
          const unitsCache = JSON.parse(localStorage.getItem('huerta_stock_units_cache_v1') || '{}');
          const pNorm = norm(matchedProd.nombre);
          if (unitsCache[pNorm]) {
            unitsCache[pNorm].stock = nuevoStock;
          } else {
            unitsCache[pNorm] = { stock: nuevoStock, originalLoad: nuevoStock, subcategoria: matchedProd.subcategoria || mappedEan?.subcategoria };
          }
          localStorage.setItem('huerta_stock_units_cache_v1', JSON.stringify(unitsCache));
        } catch (e) {}

        syncProductWithSheet(updatedProd, {
          onStatusChange: (status) => handleSyncStatus(status, matchedProd.nombre),
          currentStockMap: current
        });
      } else if (slot) {
        const stockActual = matchedProd.stock?.[slot] || 0;
        const nuevoStock = Math.max(0, stockActual - 1);
        const updatedProd = { ...matchedProd, stock: { ...matchedProd.stock, [slot]: nuevoStock } };
        const newData = { ...current };
        newData[finalMatchedStockId] = updatedProd;
        setStockData(newData);

        syncProductWithSheet(updatedProd, {
          onStatusChange: (status) => handleSyncStatus(status, matchedProd.nombre),
          currentStockMap: current
        });
      }
    }

    const now = new Date();
    const horaStr = now.toLocaleDateString('es-AR') + ' ' + now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    const uniqueInstanceId = esUnidad ? `${cleanCode}#${Date.now()}` : cleanCode;

    setCodigosProcesados(prev => ({
      ...prev,
      [cleanCode]: {
        uniqueCode: cleanCode,
        nombre,
        matchedId: finalMatchedStockId,
        peso: peso || 1,
        estado: 'SACADO',
        bloqueado: false,
        fechaModificacion: horaStr,
        ultimaAccion: `Agregado como extra a pedido ${numPedido}`,
        ts: Date.now()
      }
    }));

    const nuevaBolsa = {
      uniqueCode: uniqueInstanceId,
      rawCode: cleanCode,
      nombre,
      peso: peso || 1,
      tagId: tagId || null,
      ts: Date.now(),
      matchedStockId: finalMatchedStockId || null,
      slot: esUnidad ? 'unidades' : slot,
      esUnidad: Boolean(esUnidad)
    };

    setPreparaciones(prev => {
      const prep = { ...prev[numPedido] };
      const items = [...(prep.items || [])];
      const nombreNorm = norm(nombre);
      const existingIdx = items.findIndex(it => norm(it.nombre) === nombreNorm);

      if (existingIdx >= 0) {
        const it = items[existingIdx];
        items[existingIdx] = {
          ...it,
          cantidad: (it.cantidad || 0) + 1,
          bolsasAsignadas: [...(it.bolsasAsignadas || []), nuevaBolsa]
        };
      } else {
        items.push({
          nombre,
          cantidad: 1,
          pesoSolicitado: esUnidad ? null : peso,
          esExtra: true,
          bolsasAsignadas: [nuevaBolsa]
        });
      }

      const todosCompletos = items.every(it => (it.bolsasAsignadas?.length || 0) >= it.cantidad);
      const nuevaPrep = { ...prep, items, completado: todosCompletos };
      sincronizarPesadasSheet(numPedido, nuevaPrep);
      return { ...prev, [numPedido]: nuevaPrep };
    });

    setModalItemExtra(null);
    setScanSuccess(`✅ Agregado ítem extra: ${nombre.toUpperCase()} (+1 ${esUnidad ? 'ud' : 'bolsa'})`);
    setTimeout(() => setScanSuccess(null), 2500);
    setTimeout(() => modalScanInputRef.current?.focus(), 80);
  }, [preparaciones, setStockData, sincronizarPesadasSheet]);

  // ── ESCANEAR BOLSA / PRODUCTO EAN ──────────────────────────────────────────
  const procesarEscaneoPedido = useCallback((rawCode) => {
    if (!rawCode || !preparandoPedido) return;
    setScanError(null); setScanSuccess(null);

    const cleanCode = String(rawCode).replace(/[\r\n\x00-\x1F]/g, '').trim().replace(/^\][a-zA-Z0-9]{2,3}/, '').replace(/^\*+|\*+$/g, '').trim().toUpperCase();
    const eanMap = getEanMapping();
    const mappedEan = eanMap[cleanCode] || eanMap[cleanCode.replace(/^0+/, '')] || eanMap['0' + cleanCode];

    // ── 1. Si es un código EAN de fábrica mapeado a Almacén ──────────────────
    if (mappedEan) {
      const prepActual = preparaciones[preparandoPedido];
      if (!prepActual) return;

      const nombreProd = mappedEan.nombre;
      const nombreNorm = norm(nombreProd);

      // Prioridad 1: Coincidencia exacta de nombre
      let matchedItemIdx = -1;
      for (let i = 0; i < prepActual.items.length; i++) {
        if (prepActual.items[i].sin_stock) continue;
        const itemNorm = norm(prepActual.items[i].nombre);
        if (itemNorm === nombreNorm) {
          const asignadas = prepActual.items[i].bolsasAsignadas?.length || 0;
          if (asignadas < prepActual.items[i].cantidad) {
            matchedItemIdx = i;
            break;
          }
        }
      }

      // Prioridad 2: Coincidencia parcial si no hubo exacta
      if (matchedItemIdx === -1) {
        for (let i = 0; i < prepActual.items.length; i++) {
          if (prepActual.items[i].sin_stock) continue;
          const itemNorm = norm(prepActual.items[i].nombre);
          if (itemNorm.includes(nombreNorm) || nombreNorm.includes(itemNorm)) {
            const asignadas = prepActual.items[i].bolsasAsignadas?.length || 0;
            if (asignadas < prepActual.items[i].cantidad) {
              matchedItemIdx = i;
              break;
            }
          }
        }
      }

      // Buscar producto en stock de manera precisa
      const current = stockDataRef.current || {};
      let matchedStockId = mappedEan.productoId && current[mappedEan.productoId] ? mappedEan.productoId : null;
      if (!matchedStockId && typeof current === 'object' && !Array.isArray(current)) {
        matchedStockId = Object.keys(current).find(id => norm(current[id]?.nombre) === nombreNorm);
        if (!matchedStockId) {
          matchedStockId = Object.keys(current).find(id => {
            const pNorm = norm(current[id]?.nombre);
            return pNorm.includes(nombreNorm) || nombreNorm.includes(pNorm);
          });
        }
      }
      const matchedProd = matchedStockId ? current[matchedStockId] : null;

      // Si el ítem no estaba en el pedido o ya se completaron las unidades solicitadas:
      // Permitir agregarlo como ítem extra al pedido
      if (matchedItemIdx === -1) {
        setModalItemExtra({
          nombre: nombreProd,
          mappedEan,
          cleanCode,
          matchedStockId,
          numPedido: preparandoPedido,
          esUnidad: true,
          peso: 1,
          slot: 'unidades'
        });
        return;
      }

      // Descontar 1 unidad del stock y persistir en cache
      if (matchedProd && matchedStockId) {
        const stockActual = Number(matchedProd.stock?.unidades ?? matchedProd.stock?.['1kg']) || 0;
        if (stockActual <= 0) {
          setScanError(`🚫 ¡Sin stock! No hay "${nombreProd}" disponible.`);
          return;
        }
        const nuevoStock = Math.max(0, stockActual - 1);
        const updatedProd = {
          ...matchedProd,
          stock: { ...matchedProd.stock, '1kg': nuevoStock, unidades: nuevoStock },
          ean: cleanCode
        };
        const newData = { ...current };
        newData[matchedStockId] = updatedProd;
        setStockData(newData);

        try {
          const unitsCache = JSON.parse(localStorage.getItem('huerta_stock_units_cache_v1') || '{}');
          const pNorm = norm(matchedProd.nombre);
          if (unitsCache[pNorm]) {
            unitsCache[pNorm].stock = nuevoStock;
          } else {
            unitsCache[pNorm] = { stock: nuevoStock, originalLoad: nuevoStock, subcategoria: matchedProd.subcategoria || mappedEan.subcategoria };
          }
          localStorage.setItem('huerta_stock_units_cache_v1', JSON.stringify(unitsCache));
        } catch (e) {}

        // Sincronizar con Google Sheet (con reintentos y aviso visual)
        syncProductWithSheet(updatedProd, {
          onStatusChange: (status) => handleSyncStatus(status, nombreProd),
          currentStockMap: current
        });
      }

      const now = new Date();
      const horaStr = now.toLocaleDateString('es-AR') + ' ' + now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      const uniqueInstanceId = `${cleanCode}#${Date.now()}`;

      setCodigosProcesados(prev => ({
        ...prev,
        [cleanCode]: {
          uniqueCode: cleanCode,
          nombre: nombreProd,
          matchedId: matchedStockId,
          peso: 1,
          estado: 'SACADO',
          bloqueado: false,
          fechaModificacion: horaStr,
          ultimaAccion: `Asignado a pedido ${preparandoPedido}`,
          ts: Date.now()
        }
      }));

      const nuevaBolsa = {
        uniqueCode: uniqueInstanceId,
        rawCode: cleanCode,
        nombre: nombreProd,
        peso: 1,
        tagId: null,
        ts: Date.now(),
        matchedStockId: matchedStockId || null,
        slot: 'unidades',
        esUnidad: true
      };

      setPreparaciones(prev => {
        const prep = { ...prev[preparandoPedido] };
        const items = [...prep.items];
        items[matchedItemIdx] = {
          ...items[matchedItemIdx],
          bolsasAsignadas: [...(items[matchedItemIdx].bolsasAsignadas || []), nuevaBolsa]
        };
        const todosCompletos = items.every(it => (it.bolsasAsignadas?.length || 0) >= it.cantidad);
        return { ...prev, [preparandoPedido]: { ...prep, items, completado: todosCompletos } };
      });

      setScanSuccess(`✅ ${nombreProd.toUpperCase()} — 1 unidad asignada`);
      setTimeout(() => setScanSuccess(null), 2500);
      setTimeout(() => modalScanInputRef.current?.focus(), 50);
      return;
    }

    // Si es un código EAN no mapeado a ningún producto
    if (esCodigoEan(cleanCode)) {
      setScanError(`⚠️ Código EAN "${cleanCode}" no está asociado a ningún producto de Almacén. Asocialo primero en Control de Stock.`);
      return;
    }
    
    // ── 2. Códigos de balanza (Verduras / Frutas) ─────────────────────────────
    const resultado = parsearCodigoBarras(rawCode);
    if (!resultado || (!resultado.peso && !resultado.esIncompleto)) {
      setScanError('No se pudo leer el código. Intentá de nuevo.');
      return;
    }

    const uniqueCode = resultado.uniqueCode;
    const codigos = getCodigosProcesados();
    const reg = codigos[uniqueCode];
    
    if (reg?.bloqueado) { setScanError(`🚫 Código BLOQUEADO: "${uniqueCode}" fue dado de baja definitiva.`); return; }

    const prepActual = preparaciones[preparandoPedido];
    if (prepActual) {
      const yaAsignado = prepActual.items.some(item => item.bolsasAsignadas?.some(b => b.uniqueCode === uniqueCode));
      if (yaAsignado) { setScanError(`⚠️ Esta bolsa ya fue asignada a este pedido.`); return; }
    }

    const nombreEscaneado = norm(resultado.nombre);
    const current = stockDataRef.current || {};
    
    let matchedStockId = null;
    let matchedProd = null;
    if (typeof current === 'object' && !Array.isArray(current)) {
      matchedStockId = Object.keys(current).find(id => norm(current[id]?.nombre) === nombreEscaneado);
      if (!matchedStockId) {
        matchedStockId = Object.keys(current).find(id => {
          const pNorm = norm(current[id]?.nombre);
          return pNorm.includes(nombreEscaneado) || nombreEscaneado.includes(pNorm);
        });
      }
      matchedProd = matchedStockId ? current[matchedStockId] : null;
    }

    if (!prepActual) return;
    
    // Prioridad 1: Coincidencia exacta
    let matchedItemIdx = -1;
    for (let i = 0; i < prepActual.items.length; i++) {
      if (prepActual.items[i].sin_stock) continue;
      const itemNorm = norm(prepActual.items[i].nombre);
      const prodNorm = matchedProd ? norm(matchedProd.nombre) : nombreEscaneado;
      if (itemNorm === prodNorm || itemNorm === nombreEscaneado) {
        const asignadas = prepActual.items[i].bolsasAsignadas?.length || 0;
        if (asignadas < prepActual.items[i].cantidad) { matchedItemIdx = i; break; }
      }
    }

    // Prioridad 2: Coincidencia parcial si no hubo exacta
    if (matchedItemIdx === -1) {
      for (let i = 0; i < prepActual.items.length; i++) {
        if (prepActual.items[i].sin_stock) continue;
        const itemNorm = norm(prepActual.items[i].nombre);
        const prodNorm = matchedProd ? norm(matchedProd.nombre) : nombreEscaneado;
        if (itemNorm.includes(prodNorm) || prodNorm.includes(itemNorm) ||
            itemNorm.includes(nombreEscaneado) || nombreEscaneado.includes(itemNorm)) {
          const asignadas = prepActual.items[i].bolsasAsignadas?.length || 0;
          if (asignadas < prepActual.items[i].cantidad) { matchedItemIdx = i; break; }
        }
      }
    }
    
    // Si la bolsa de balanza no coincide con ningún producto pendiente:
    if (matchedItemIdx === -1) {
      setModalItemExtra({
        nombre: matchedProd ? matchedProd.nombre : resultado.nombre,
        cleanCode: uniqueCode,
        matchedStockId,
        numPedido: preparandoPedido,
        peso: resultado.peso,
        tagId: resultado.tagId,
        esUnidad: false,
        slot: (matchedProd && matchedStockId) ? determinarSlot(matchedProd.tipo || getTipoByNombre(matchedProd.nombre), resultado.peso || 0.5) : null
      });
      return;
    }
    
    // Descontar del stock
    if (matchedProd && matchedStockId) {
      const tipo = matchedProd.tipo || getTipoByNombre(matchedProd.nombre);
      const slot = determinarSlot(tipo, resultado.peso || 0.5);
      const stockActual = matchedProd.stock?.[slot] || 0;
      if (stockActual <= 0) { setScanError(`🚫 ¡Sin stock! No hay "${matchedProd.nombre}" (${slot}) disponible.`); return; }
      const nuevoStock = Math.max(0, stockActual - 1);
      const updatedProd = {
        ...matchedProd,
        stock: { ...matchedProd.stock, [slot]: nuevoStock }
      };
      const newData = { ...current };
      newData[matchedStockId] = updatedProd;
      setStockData(newData);

      // Sincronizar con Google Sheet (con reintentos y aviso visual)
      syncProductWithSheet(updatedProd, {
        onStatusChange: (status) => handleSyncStatus(status, matchedProd.nombre),
        currentStockMap: current
      });
    }
    
    const now = new Date();
    const horaStr = now.toLocaleDateString('es-AR') + ' ' + now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    setCodigosProcesados(prev => ({ ...prev, [uniqueCode]: { uniqueCode, nombre: resultado.nombre, matchedId: matchedStockId, peso: resultado.peso, estado: 'SACADO', bloqueado: false, fechaModificacion: horaStr, ultimaAccion: `Asignado a pedido ${preparandoPedido}`, ts: Date.now() } }));
    
    const nuevaBolsa = { uniqueCode, nombre: resultado.nombre, peso: resultado.peso, tagId: resultado.tagId, ts: Date.now(), matchedStockId: matchedStockId || null, slot: (matchedProd && matchedStockId) ? determinarSlot(matchedProd.tipo || getTipoByNombre(matchedProd.nombre), resultado.peso || 0.5) : null };
    
    setPreparaciones(prev => {
      const prep = { ...prev[preparandoPedido] };
      const items = [...prep.items];
      items[matchedItemIdx] = { ...items[matchedItemIdx], bolsasAsignadas: [...(items[matchedItemIdx].bolsasAsignadas || []), nuevaBolsa] };
      const todosCompletos = items.every(it => (it.bolsasAsignadas?.length || 0) >= it.cantidad);
      const nuevaPrep = { ...prep, items, completado: todosCompletos };
      sincronizarPesadasSheet(preparandoPedido, nuevaPrep);
      return { ...prev, [preparandoPedido]: nuevaPrep };
    });
    
    setScanSuccess(`✅ ${resultado.nombre.toUpperCase()} — ${resultado.peso?.toFixed(3) || '?'} kg asignado`);
    setTimeout(() => setScanSuccess(null), 2500);
    setTimeout(() => modalScanInputRef.current?.focus(), 50);
  }, [preparandoPedido, preparaciones, setStockData, sincronizarPesadasSheet]);

  // ── 4. BOTÓN "PEDIDO ARMADO": CONGELAR DETALLE Y FINALIZAR ─────────────────
  const handlePedidoArmado = useCallback(async (pedido, numPedido) => {
    const prep = preparaciones[numPedido];
    if (!prep || !prep.items) return;

    setGuardandoPedidoArmado(true);
    try {
      // 1. Armar detalle_json con producto, cantidad_real, precio_unitario congelado y subtotal
      const detalle = prep.items.map(it => {
        const esSinStock = Boolean(it.sin_stock);
        const bolsas = esSinStock ? [] : (it.bolsasAsignadas || []);
        const esUnidad = it.esUnidad || it.slot === 'unidades';
        const cantReal = esSinStock 
          ? 0 
          : (esUnidad 
              ? bolsas.length 
              : Number(bolsas.reduce((acc, b) => acc + (Number(b.peso) || 0), 0).toFixed(3)));
        const precioUnit = obtenerPrecioCongelado(it.nombre);
        const subtotal = esSinStock ? 0 : Math.round(cantReal * precioUnit);
        return {
          producto: it.nombre,
          nombre: it.nombre,
          unidad: esUnidad ? 'un' : 'kg',
          cantidad_real: cantReal,
          cantidad: cantReal,
          precio_unitario: precioUnit,
          precio_unit: precioUnit,
          subtotal,
          sin_stock: esSinStock
        };
      });

      // Si el pedido fue pagado online (estado_pago approved) y el total bajó:
      // mostrar aviso al armador (sin inventar reembolso automático)
      const esPagoOnlineApproved = String(pedido.estado_pago || '').toLowerCase() === 'approved';
      const totalOriginal = Math.round(Number(pedido.total || 0));
      const totalNuevo = Math.round(detalle.reduce((acc, it) => acc + (it.sin_stock ? 0 : (Number(it.subtotal) || 0)), 0));
      if (esPagoOnlineApproved && totalNuevo < totalOriginal) {
        alert(`Aviso al armador:\nEl pedido fue pagado online. El total bajó de $${totalOriginal.toLocaleString('es-AR')} a $${totalNuevo.toLocaleString('es-AR')}.\nQueda un saldo a favor de $${(totalOriginal - totalNuevo).toLocaleString('es-AR')} para el cliente.`);
      }

      // 2. Guardar detalle_json congelado en el Sheet
      const resDetalle = await apiSetDetallePedido({ numero_pedido: numPedido, detalle_json: detalle });
      if (resDetalle && resDetalle.ok === false) {
        alert(`Aviso: el Sheet no pudo congelar el detalle: ${resDetalle.error}`);
      }

      // 3. Guardar preparación completada y pesadas finales en el Sheet
      const prepFinal = { 
        ...prep, 
        completado: true, 
        fechaFin: new Date().toISOString(),
        detalle_json: detalle 
      };
      await apiGuardarPreparacion({ numero_pedido: numPedido, preparacion: prepFinal });

      const itemsPesadas = prep.items.map(it => {
        if (it.sin_stock) return { producto: it.nombre, cantidad_real: 0, sin_stock: true };
        const bolsas = it.bolsasAsignadas || [];
        let cant = 0;
        if (it.esUnidad || it.slot === 'unidades') cant = bolsas.length;
        else cant = Number(bolsas.reduce((s, b) => s + (Number(b.peso) || 0), 0).toFixed(3));
        return { producto: it.nombre, cantidad_real: cant };
      });
      await apiRegistrarPesadas({ numero_pedido: numPedido, items: itemsPesadas });

      // 4. Actualizar estado del pedido a 'Preparado' y actualizar objeto local
      pedido.detalle_json = detalle;
      setPreparaciones(prev => ({ ...prev, [numPedido]: prepFinal }));
      actualizarEstado(numPedido, 'Preparado');
      setPreparandoPedido(null);
      setModalPreparacion(null);
      setScanError(null);
      setScanSuccess(null);
      setPedidoRecienArmado({ pedido, numPedido, prep: prepFinal });
    } catch (err) {
      alert(`Error al guardar pedido armado: ${err.message}`);
    } finally {
      setGuardandoPedidoArmado(false);
    }
  }, [preparaciones, obtenerPrecioCongelado, actualizarEstado]);

  const imprimirRemitoDesdeModal = useCallback(async (pedido, numPedido) => {
    await handlePedidoArmado(pedido, numPedido);
    const prep = preparaciones[numPedido];
    const prepFinal = { ...(prep || {}), completado: true, fechaFin: new Date().toISOString() };
    imprimirRemitoIndividual(pedido, prepFinal);
    if (pedido.sheetRowIndex) actualizarRemitoEnSheet(pedido.sheetRowIndex, true);
  }, [handlePedidoArmado, preparaciones, actualizarRemitoEnSheet]);

  const cancelarRemito = useCallback((numPedido) => {
    // Revertir stock de TODAS las bolsas de este pedido
    const prep = preparaciones[numPedido];
    if (prep?.items) {
      prep.items.forEach(item => {
        (item.bolsasAsignadas || []).forEach(bolsa => revertirStockBolsa(bolsa));
      });
    }
    // Borrar la preparación de este pedido del state y localStorage
    setPreparaciones(prev => { const { [numPedido]: _, ...rest } = prev; return rest; });
    setPreparandoPedido(null);
    setModalPreparacion(null);
    setScanError(null);
    setScanSuccess(null);
    setScanBuffer('');
    // Volver el estado de la tarjeta a Pendiente
    actualizarEstado(numPedido, 'Pendiente');
  }, [preparaciones, revertirStockBolsa, actualizarEstado]);

  // ── 8. CANCELAR PEDIDO Y LIBERAR STOCK EN SHEET (REQUISITO 8) ──────────────
  const handleCancelarPedido = useCallback(async (p) => {
    const numPedido = p.numero_pedido;
    const confirmacion = window.confirm(`¿Estás seguro de cancelar el pedido ${numPedido} de ${p.nombre}?\n\nEsta acción liberará en el Sheet el stock que estaba reservado y marcará el pedido como cancelado.`);
    if (!confirmacion) return;

    try {
      const res = await apiLiberarPedido({ numero_pedido: numPedido, motivo: 'Cancelado' });
      if (res && res.ok === false) {
        alert(`Error al liberar el stock en el Sheet: ${res.error}`);
        return;
      }

      // Liberar crédito de referidos si existía reserva (Requisito 2)
      try {
        await apiLiberarCredito({ numero_pedido: numPedido });
      } catch (eCred) {
        console.warn(`[CREDITO] Error liberando crédito de pedido ${numPedido}:`, eCred.message);
      }

      // Revertir bolsas de preparación si existían en memoria
      const prep = preparaciones[numPedido];
      if (prep?.items) {
        prep.items.forEach(item => {
          (item.bolsasAsignadas || []).forEach(bolsa => revertirStockBolsa(bolsa));
        });
      }

      setPreparaciones(prev => { const { [numPedido]: _, ...rest } = prev; return rest; });
      actualizarEstado(numPedido, 'no_entregado', 'Cancelado');
      alert(`✅ Pedido ${numPedido} cancelado y stock liberado correctamente en el Sheet.`);
    } catch (err) {
      alert(`Error de red al cancelar el pedido: ${err.message}`);
    }
  }, [preparaciones, revertirStockBolsa, actualizarEstado]);

  const handleConfirmarCancelarNoEntrega = useCallback(async () => {
    if (!modalNoEntrega || modalNoEntrega.guardando) return;
    const p = modalNoEntrega.pedido;
    const motivoFinal = modalNoEntrega.motivoSeleccionado === 'Otro'
      ? (modalNoEntrega.motivoOtro.trim() || 'Otro')
      : modalNoEntrega.motivoSeleccionado;
    const motivoCompleto = `No entregado: ${motivoFinal}`;
    const fechaActual = new Date().toISOString().split('T')[0];

    setModalNoEntrega(prev => ({ ...prev, guardando: true, error: null }));
    try {
      // 1. Registrar no entrega en el backend primero
      const resNoEntrega = await apiRegistrarNoEntrega({
        numero_pedido: p.numero_pedido,
        motivo: motivoFinal,
        accion_tomada: 'cancelar',
      });

      if (!resNoEntrega || resNoEntrega.ok === false) {
        setModalNoEntrega(prev => ({
          ...prev,
          guardando: false,
          error: resNoEntrega?.error || 'Error al registrar la no entrega en el servidor.'
        }));
        return; // NO continuar con cancelar si falla
      }

      // 2. Si el pedido pagó online (estado_pago approved/pagado): registrar reembolso pendiente
      const estadoPago = (p.estado_pago || '').toLowerCase().trim();
      const esPagadoOnline = estadoPago === 'approved' || estadoPago === 'pagado';
      const montoPagado = Number(p.total) || 0;

      if (esPagadoOnline) {
        const resReembolso = await apiRegistrarReembolso({
          numero_pedido: p.numero_pedido,
          estado: 'pendiente',
          monto: montoPagado,
          nota: `No entregado: ${motivoFinal}`,
        });

        if (!resReembolso || resReembolso.ok === false) {
          setModalNoEntrega(prev => ({
            ...prev,
            guardando: false,
            error: resReembolso?.error || 'Error al registrar el reembolso pendiente en el servidor.'
          }));
          return; // NO continuar si falla
        }

        p.reembolso_estado = 'pendiente';
        p.reembolso_monto = montoPagado;

        setReembolsosPendientesList(prev => {
          const yaExiste = prev.some(r => String(r.pedido).trim() === String(p.numero_pedido).trim());
          if (yaExiste) return prev;
          return [...prev, { pedido: p.numero_pedido, cliente: p.nombre || '', monto: montoPagado }];
        });
      }

      // 3. Llamar a liberarPedido con motivo "No entregado: <motivo>"
      const res = await apiLiberarPedido({ numero_pedido: p.numero_pedido, motivo: motivoCompleto });
      if (res && res.ok === false) {
        setModalNoEntrega(prev => ({ ...prev, guardando: false, error: res.error || 'Error al liberar el stock en el Sheet.' }));
        return;
      }

      // 4. Revertir bolsas de preparación si existían en memoria
      const prep = preparaciones[p.numero_pedido];
      if (prep?.items) {
        prep.items.forEach(item => {
          (item.bolsasAsignadas || []).forEach(bolsa => revertirStockBolsa(bolsa));
        });
      }

      setPreparaciones(prev => { const { [p.numero_pedido]: _, ...rest } = prev; return rest; });

      // 5. Marcar pedido como cancelado
      actualizarEstado(p.numero_pedido, 'Cancelado', motivoFinal);
      p.motivo_no_entrega = motivoFinal;
      p.fecha_no_entrega = fechaActual;

      // 6. Actualizar mapa de no entregas en memoria
      const nroFinal = resNoEntrega.nro || (Number(noEntregasMap[p.numero_pedido]?.total || 0) + 1);
      const nivelFinal = resNoEntrega.nivel || 'primera';
      setNoEntregasMap(prev => ({
        ...prev,
        [p.numero_pedido]: {
          total: nroFinal,
          nivel: nivelFinal,
        }
      }));

      // 7. Mostrar alerta / aviso según nivel
      setModalNoEntrega(prev => ({
        ...prev,
        guardando: false,
        resultado: {
          nro: nroFinal,
          nivel: nivelFinal,
          cliente: resNoEntrega.cliente || p.nombre || 'Cliente',
          telefono: p.telefono || '',
          accion: 'cancelar',
        }
      }));

      if (fetchSheetPedidos) fetchSheetPedidos();
    } catch (err) {
      setModalNoEntrega(prev => ({ ...prev, guardando: false, error: err.message || 'Error al cancelar pedido' }));
    }
  }, [modalNoEntrega, preparaciones, revertirStockBolsa, actualizarEstado, noEntregasMap, fetchSheetPedidos]);

  const abrirModalReembolsoDevuelto = useCallback((p) => {
    const num = String(p.numero_pedido || p.pedido || '').trim();
    const nombre = p.nombre || p.cliente || 'Cliente';
    const tel = p.telefono || '';
    const monto = p.reembolso_monto != null && p.reembolso_monto !== ''
      ? Number(p.reembolso_monto)
      : (p.monto != null && p.monto !== ''
          ? Number(p.monto)
          : Math.round(Number(p.total) || 0));

    setModalReembolso({
      abierto: true,
      pedido: {
        ...p,
        numero_pedido: num,
        nombre,
        telefono: tel,
        _montoReembolso: monto,
      },
      guardando: false,
      error: null,
    });
  }, []);

  const handleConfirmarReembolsoDevuelto = useCallback(async ({ medio, referencia, nota }) => {
    if (!modalReembolso.pedido || !medio) return;
    const p = modalReembolso.pedido;
    const num = String(p.numero_pedido).trim();
    const monto = p._montoReembolso != null
      ? p._montoReembolso
      : (p.reembolso_monto != null ? Number(p.reembolso_monto) : Math.round(Number(p.total) || 0));

    setModalReembolso(prev => ({ ...prev, guardando: true, error: null }));
    try {
      const res = await apiRegistrarReembolso({
        numero_pedido: num,
        estado: 'devuelto',
        monto,
        medio,
        referencia,
        nota,
      });

      if (!res || res.ok === false) {
        setModalReembolso(prev => ({
          ...prev,
          guardando: false,
          error: res?.error || 'Error al registrar reembolso devuelto en el servidor.',
        }));
        return;
      }

      // Éxito: actualizar estado en memoria de PEDIDOS
      p.reembolso_estado = 'devuelto';
      p.reembolso_medio = medio;
      p.reembolso_ref = referencia;
      p.fecha_reembolso = new Date().toISOString();

      const pedidoEnLista = (PEDIDOS || []).find(item => String(item.numero_pedido).trim() === num);
      if (pedidoEnLista) {
        pedidoEnLista.reembolso_estado = 'devuelto';
        pedidoEnLista.reembolso_medio = medio;
        pedidoEnLista.reembolso_ref = referencia;
        pedidoEnLista.fecha_reembolso = new Date().toISOString();
      }

      // Quitar de la lista de pendientes arriba de la Agenda
      setReembolsosPendientesList(prev => prev.filter(r => String(r.pedido || r.numero_pedido).trim() !== num));

      // Actualizar en lista de reembolsos
      setReembolsosData(prev => prev.map(item => {
        if (String(item.numero_pedido || item.pedido).trim() === num) {
          return {
            ...item,
            estado: 'devuelto',
            reembolso_medio: medio,
            reembolso_ref: referencia,
            fecha_reembolso: new Date().toISOString(),
          };
        }
        return item;
      }));

      // Refrescar en segundo plano desde el backend
      cargarReembolsos();
      if (fetchSheetPedidos) fetchSheetPedidos();

      setModalReembolso({
        abierto: false,
        pedido: null,
        guardando: false,
        error: null,
      });
    } catch (err) {
      setModalReembolso(prev => ({
        ...prev,
        guardando: false,
        error: err.message || 'Error inesperado al conectar con el servidor',
      }));
    }
  }, [modalReembolso, PEDIDOS, cargarReembolsos, fetchSheetPedidos]);

  const handleMarcarReembolsoDevuelto = useCallback((p) => {
    abrirModalReembolsoDevuelto(p);
  }, [abrirModalReembolsoDevuelto]);

  const quitarBolsaAsignada = useCallback((numPedido, itemIdx, bolsaIdx) => {
    setPreparaciones(prev => {
      const prep = { ...prev[numPedido] };
      const items = [...prep.items];
      const bolsaAQuitar = items[itemIdx]?.bolsasAsignadas?.[bolsaIdx];
      // Revertir stock de esta bolsa
      if (bolsaAQuitar) revertirStockBolsa(bolsaAQuitar);
      
      const nuevasBolsas = items[itemIdx].bolsasAsignadas.filter((_, i) => i !== bolsaIdx);
      if (items[itemIdx].esExtra && nuevasBolsas.length === 0) {
        items.splice(itemIdx, 1);
      } else {
        items[itemIdx] = { ...items[itemIdx], bolsasAsignadas: nuevasBolsas };
      }
      const todosCompletos = items.length > 0 && items.every(it => (it.bolsasAsignadas?.length || 0) >= it.cantidad);
      const nuevaPrep = { ...prep, items, completado: todosCompletos };
      sincronizarPesadasSheet(numPedido, nuevaPrep);
      return { ...prev, [numPedido]: nuevaPrep };
    });
  }, [revertirStockBolsa, sincronizarPesadasSheet]);

  // Quitar / Restaurar producto por falta de stock durante el armado
  const marcarItemSinStock = useCallback((numPedido, itemIdx, sinStock = true) => {
    setPreparaciones(prev => {
      const prep = { ...prev[numPedido] };
      if (!prep || !prep.items || !prep.items[itemIdx]) return prev;
      const items = [...prep.items];
      const it = items[itemIdx];

      if (sinStock) {
        // Revertir bolsas y stock asignado previamente a este producto
        (it.bolsasAsignadas || []).forEach(bolsa => revertirStockBolsa(bolsa));
        items[itemIdx] = {
          ...it,
          sin_stock: true,
          bolsasAsignadas: []
        };
      } else {
        // Deshacer (restaurar)
        items[itemIdx] = {
          ...it,
          sin_stock: false
        };
      }

      const itemsActivos = items.filter(i => !i.sin_stock);
      const todosCompletos = itemsActivos.length > 0 && itemsActivos.every(i => (i.bolsasAsignadas?.length || 0) >= i.cantidad);
      const nuevaPrep = { ...prep, items, completado: todosCompletos };
      sincronizarPesadasSheet(numPedido, nuevaPrep);
      return { ...prev, [numPedido]: nuevaPrep };
    });
  }, [revertirStockBolsa, sincronizarPesadasSheet]);

  const ejecutarReinicioPreparacion = useCallback((numPedido) => {
    // Revertir stock de TODAS las bolsas de este pedido
    const prep = preparaciones[numPedido];
    if (prep?.items) {
      prep.items.forEach(item => {
        (item.bolsasAsignadas || []).forEach(bolsa => revertirStockBolsa(bolsa));
      });
    }
    // Borrar la preparación de este pedido del state y localStorage
    setPreparaciones(prev => { const { [numPedido]: _, ...rest } = prev; return rest; });
    setPreparandoPedido(null);
    setScanBuffer('');
    setScanError(null);
    setScanSuccess(null);
    actualizarEstado(numPedido, 'Pendiente');
  }, [preparaciones, revertirStockBolsa, actualizarEstado]);

  // ── IMPRIMIR REMITOS (INDIVIDUAL O LOTE UNIFICADO) ─────────────────────────
  const imprimirRemitoConPesoReal = useCallback((p, opciones = {}) => {
    const prep = preparaciones[p.numero_pedido];
    if (!estaPedidoArmado(p, prep)) {
      alert('Primero pesá y armá el pedido');
      return;
    }
    imprimirRemitoIndividual(p, prep, opciones);
    if (p.sheetRowIndex) actualizarRemitoEnSheet(p.sheetRowIndex, true);
  }, [preparaciones, actualizarRemitoEnSheet]);

  const imprimir = useCallback((alcance, opciones = {}) => {
    if (rol === 'repartidor') return;
    const aImprimir = alcance === 'turno' ? pedidosDelTurno : pedidosDelDia;
    if (aImprimir.length === 0) {
      alert(`No hay pedidos cargados para imprimir en este ${alcance === 'turno' ? 'turno' : 'día'}.`);
      return;
    }
    const titulo = `Remitos · ${tituloTabActiva}`;

    imprimirRemitosEnLote(aImprimir, preparaciones, titulo, opciones);

    // Marcar como impresos en sheet si corresponde
    aImprimir.forEach(p => {
      if (p.sheetRowIndex) actualizarRemitoEnSheet(p.sheetRowIndex, true);
    });
  }, [rol, pedidosDelTurno, pedidosDelDia, tituloTabActiva, preparaciones, actualizarRemitoEnSheet]);

  const toggleSeleccionRemito = useCallback((numPedido) => {
    setSeleccionadosRemito(prev => 
      prev.includes(numPedido) ? prev.filter(x => x !== numPedido) : [...prev, numPedido]
    );
  }, []);

  const pedidosArmadosDelTurno = useMemo(() => {
    return pedidosDelTurno.filter(p => estaPedidoArmado(p, preparaciones[p.numero_pedido]));
  }, [pedidosDelTurno, preparaciones]);

  const pedidosParaMostrar = useMemo(() => {
    const base = filtroSoloArmados ? pedidosArmadosDelTurno : pedidosDelTurno;
    if (tabActiva === CLAVE_ATRASADOS) return base;
    // Orden estable por sección: Mañana, Tarde, Sin horario
    const rank = (p) => (p.entregaBloque === 'M' ? 0 : p.entregaBloque === 'T' ? 1 : 2);
    return [...base].sort((a, b) => rank(a) - rank(b));
  }, [pedidosDelTurno, pedidosArmadosDelTurno, filtroSoloArmados, tabActiva]);

  const seleccionarTodosArmados = useCallback(() => {
    const todosIds = pedidosArmadosDelTurno.map(p => p.numero_pedido);
    const todosEstan = todosIds.length > 0 && todosIds.every(id => seleccionadosRemito.includes(id));
    if (todosEstan) {
      setSeleccionadosRemito(prev => prev.filter(id => !todosIds.includes(id)));
    } else {
      setSeleccionadosRemito(prev => Array.from(new Set([...prev, ...todosIds])));
    }
  }, [pedidosArmadosDelTurno, seleccionadosRemito]);

  const imprimirRemitosArmadosSeleccionados = useCallback(() => {
    const pedidosSeleccionados = (PEDIDOS || []).filter(p => seleccionadosRemito.includes(p.numero_pedido));
    if (pedidosSeleccionados.length === 0) {
      alert('Seleccioná al menos un pedido armado para imprimir.');
      return;
    }
    const armados = pedidosSeleccionados.filter(p => estaPedidoArmado(p, preparaciones[p.numero_pedido]));
    const noArmados = pedidosSeleccionados.filter(p => !estaPedidoArmado(p, preparaciones[p.numero_pedido]));

    if (noArmados.length > 0) {
      const listaOmitidos = noArmados.map(p => `#${p.numero_pedido}`).join(', ');
      alert(`Impresión masiva: Se omitieron ${noArmados.length} pedidos sin armar (${listaOmitidos}). Primero pesá y armá el pedido.`);
    }

    if (armados.length === 0) {
      alert('No hay pedidos armados en la selección para imprimir. Primero pesá y armá el pedido.');
      return;
    }

    imprimirRemitosEnLote(armados, preparaciones, 'Remitos de Pedidos Armados');
  }, [PEDIDOS, seleccionadosRemito, preparaciones]);

  const handleScanKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = (e.target.value || scanBuffer || '').replace(/[\r\n]/g, '').trim();
      e.target.value = '';
      setScanBuffer('');
      if (code) procesarEscaneoPedido(code);
      setTimeout(() => modalScanInputRef.current?.focus(), 50);
    }
  };

  const cerrarModalPreparacion = useCallback(() => {
    setModalPreparacion(null);
    setPreparandoPedido(null);
    setScanError(null);
    setScanSuccess(null);
    setScanBuffer('');
  }, []);

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div>
      {/* Resumen de Reembolsos Pendientes arriba de la Agenda */}
      {reembolsosPendientesList.length > 0 && (
        <div className="mb-5 bg-gradient-to-r from-red-500/20 via-red-500/10 to-transparent border border-red-500/40 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-red-200 shadow-lg shadow-red-950/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400 text-lg">
              💳
            </div>
            <div>
              <p className="font-black text-sm text-white flex items-center gap-2">
                <span>Reembolsos pendientes: {reembolsosPendientesList.length} · ${Math.round(
                  reembolsosPendientesList.reduce((acc, r) => acc + (Number(r.monto) || 0), 0)
                ).toLocaleString('es-AR')}</span>
              </p>
              <p className="text-xs text-red-300/80">
                Pedidos cancelados pagados online pendientes de devolución en Mercado Pago.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setVistaActual('reembolsos')}
            className="text-xs font-black uppercase tracking-wider bg-red-600 hover:bg-red-500 border border-red-400/40 text-white px-3.5 py-1.5 rounded-xl transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-1.5 w-fit"
          >
            <span>Ver Reembolsos</span>
            <ArrowRight size={13} />
          </button>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold text-white">Agenda de Entregas</h2>
            {/* Selector de Vista: Activos vs Historial vs Reembolsos */}
            <div className="flex items-center bg-[#1f2937] p-1 rounded-xl border border-gray-700">
              <button
                type="button"
                onClick={() => setVistaActual('agenda')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  vistaActual === 'agenda'
                    ? 'bg-green-500 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Activos ({pedidosActivosTodos.length})
              </button>
              <button
                type="button"
                onClick={() => setVistaActual('historial')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  vistaActual === 'historial'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Clock size={13} />
                <span>Historial</span>
              </button>
              <button
                type="button"
                onClick={() => setVistaActual('reembolsos')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  vistaActual === 'reembolsos'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <RotateCcw size={13} />
                <span>Reembolsos</span>
                {reembolsosPendientesList.length > 0 && (
                  <span className="bg-red-500/40 text-red-100 text-[10px] px-1.5 py-0.2 rounded-full font-black border border-red-400/40">
                    {reembolsosPendientesList.length}
                  </span>
                )}
              </button>
              <button
                id="btn-vista-calendario"
                type="button"
                onClick={() => setVistaActual('calendario')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  vistaActual === 'calendario'
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Calendar size={13} />
                <span>Calendario</span>
              </button>
            </div>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            {vistaActual === 'agenda'
              ? 'Pedidos activos por fecha y bloque de entrega, preparación con escaneo y remitos con peso real.'
              : vistaActual === 'historial'
              ? 'Pedidos cerrados (entregados y cancelados) con búsqueda y reimpresión de remitos.'
              : vistaActual === 'calendario'
              ? 'Días de entrega: feriados, días cerrados y pedidos programados por día.'
              : 'Registro y seguimiento de devoluciones y reembolsos con medio y comprobantes.'}
          </p>
        </div>
        {rol !== 'repartidor' && vistaActual === 'agenda' && (
          <div className="flex flex-col sm:flex-row gap-2">
            <button 
              onClick={() => imprimir('dia')} 
              className="flex items-center justify-center gap-2 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 font-medium px-4 py-2 rounded-xl text-sm transition-all shadow-sm cursor-pointer"
              title="Imprime todos los remitos de esta pestaña en una sola ventana consolidada"
            >
              <FileText size={15} className="text-green-400" />
              <span>Imprimir {tituloTabActiva || 'pestaña'} ({pedidosDelDia.length})</span>
            </button>
          </div>
        )}
      </div>
      {avisoFeriados && vistaActual === 'agenda' && (
        <div className="mb-3 text-[11px] text-gray-400 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 flex items-center justify-between gap-2">
          <span>⚠️ {avisoFeriados}</span>
          <button type="button" onClick={cargarFeriados} className="underline hover:text-white cursor-pointer shrink-0">Reintentar</button>
        </div>
      )}

      {vistaActual === 'historial' ? (
        /* ═══════ VISTA HISTORIAL: PEDIDOS CERRADOS (REQUISITOS 4 Y 6) ═══════ */
        <div className="space-y-4">
          {/* Barra de filtros del Historial */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#111827]/80 border border-white/5 p-4 rounded-2xl">
            {/* Selector de periodo: 7 días, 30 días, todos */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-400 font-semibold mr-1">Periodo:</span>
              <div className="flex gap-1.5 bg-black/40 p-1 rounded-xl border border-gray-800">
                <button
                  type="button"
                  onClick={() => setPeriodoHistorial('7d')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    periodoHistorial === '7d'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  7 días
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodoHistorial('30d')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    periodoHistorial === '30d'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  30 días
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodoHistorial('todos')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    periodoHistorial === 'todos'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Todos
                </button>
              </div>
            </div>

            {/* Buscador por número de pedido o nombre del cliente */}
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div className="relative w-full">
                <input
                  type="text"
                  placeholder="Buscar por nro pedido o cliente..."
                  value={busquedaHistorial}
                  onChange={(e) => setBusquedaHistorial(e.target.value)}
                  className="w-full bg-black/40 border border-gray-700/60 rounded-xl px-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-all"
                />
                {busquedaHistorial && (
                  <button
                    type="button"
                    onClick={() => setBusquedaHistorial('')}
                    className="absolute right-3 top-2.5 text-gray-400 hover:text-white cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Contador de cerrados encontrados */}
            <div className="shrink-0 text-xs font-bold text-gray-400 bg-white/5 border border-white/10 px-3 py-2 rounded-xl">
              {pedidosHistorial.length} {pedidosHistorial.length === 1 ? 'pedido cerrado' : 'pedidos cerrados'}
            </div>
          </div>

          {/* Tabla / Lista de pedidos del Historial */}
          {pedidosHistorial.length === 0 ? (
            <div className="bg-[#1f2937] border border-gray-800 rounded-2xl p-12 text-center">
              <Clock size={32} className="text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">No se encontraron pedidos cerrados para este filtro.</p>
              <p className="text-gray-500 text-xs mt-1">Probá cambiando el selector de días o el término de búsqueda.</p>
            </div>
          ) : (
            <div className="bg-[#111827]/60 border border-white/5 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-gray-300">
                  <thead className="bg-black/30 border-b border-white/5 text-[11px] uppercase tracking-wider text-gray-400 font-bold">
                    <tr>
                      <th className="px-4 py-3.5">Fecha Cierre / Entrega</th>
                      <th className="px-4 py-3.5">Pedido / Cliente</th>
                      <th className="px-4 py-3.5">Estado</th>
                      <th className="px-4 py-3.5">Medio de Pago</th>
                      <th className="px-4 py-3.5">Monto Cobrado</th>
                      <th className="px-4 py-3.5 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {pedidosHistorial.map(p => {
                      const esEntregado = p._estadoActual === 'entregado' || p._estadoActual === 'delivered';
                      const medioPagoStr = MEDIOS_LABELS[p.medio_pago] || p.medio_pago || p.forma_pago || '-';
                      const montoCobradoDisplay = p.monto_cobrado != null && p.monto_cobrado !== '' 
                        ? $$ (p.monto_cobrado) 
                        : (p.total ? $$ (p.total) : '-');

                      return (
                        <tr key={p.numero_pedido} className="hover:bg-white/[0.02] transition-colors">
                          {/* Fecha de entrega o cierre (o respaldo fecha del pedido, o 'sin fecha') */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 font-mono text-gray-300">
                              <Calendar size={13} className="text-gray-500" />
                              <span>{p._fechaDisplay}</span>
                            </div>
                          </td>

                          {/* Pedido y Cliente */}
                          <td className="px-4 py-3.5">
                            <div className="font-bold text-white">{p.nombre}</div>
                            <div className="font-mono text-[11px] text-gray-500">{p.numero_pedido}</div>
                          </td>

                          {/* Estado */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase border ${
                              esEntregado
                                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                : 'bg-red-500/10 text-red-400 border-red-500/20'
                            }`}>
                              {p._estadoActual}
                            </span>
                          </td>

                          {/* Medio de Pago */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className="font-medium text-gray-300 uppercase text-[11px]">
                              {medioPagoStr}
                            </span>
                          </td>

                          {/* Monto Cobrado */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className="font-bold text-emerald-400 font-mono">
                              {montoCobradoDisplay}
                            </span>
                          </td>

                          {/* Botón Reimprimir Remito */}
                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            {(() => {
                              const prep = preparaciones[p.numero_pedido];
                              const estaArmado = estaPedidoArmado(p, prep);
                              return (
                                <button
                                  type="button"
                                  onClick={() => estaArmado ? imprimirRemitoConPesoReal(p) : null}
                                  disabled={!estaArmado}
                                  className={`inline-flex items-center gap-1.5 border text-xs font-semibold px-3 py-1.5 rounded-xl transition-all shadow-sm ${
                                    estaArmado
                                      ? 'bg-gray-800 hover:bg-gray-700 border-gray-700 hover:border-gray-500 text-white cursor-pointer active:scale-95'
                                      : 'bg-gray-900 border-gray-800 text-gray-500 cursor-not-allowed opacity-60'
                                  }`}
                                  title={estaArmado ? 'Reimprimir remito de este pedido' : 'Primero pesá y armá el pedido'}
                                >
                                  <Printer size={13} className={estaArmado ? 'text-amber-400' : 'text-gray-600'} />
                                  <span>{estaArmado ? 'Reimprimir remito' : 'Primero pesá y armá el pedido'}</span>
                                </button>
                              );
                            })()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : vistaActual === 'calendario' ? (
        /* ═══════ VISTA CALENDARIO: DÍAS DE ENTREGA ═══════ */
        <CalendarioEntregas
          conteo={conteoCalendario}
          pedidos={PEDIDOS}
          hoyYMD={hoyYMD}
          onCambio={cargarFeriados}
          preparaciones={preparaciones}
        />
      ) : vistaActual === 'reembolsos' ? (
        /* ═══════ VISTA REEMBOLSOS: DEVOLUCIONES Y REEMBOLSOS ═══════ */
        <ReembolsosTab
          reembolsos={reembolsosData}
          cargando={cargandoReembolsos}
          error={errorReembolsos}
          onRecargar={cargarReembolsos}
          onMarcarDevuelto={abrirModalReembolsoDevuelto}
        />
      ) : (
        <>
          {/* Pestañas dinámicas por fecha de entrega */}
          <div id="tabs-fechas-entrega" className="flex gap-2 mb-4 overflow-x-auto pb-2">
            {tabsEntrega.length === 0 && (
              <span className="text-xs text-gray-500 px-1 py-2">No hay pedidos activos para entregar.</span>
            )}
            {tabsEntrega.map(tab => {
              const activa = tabActiva === tab.clave;
              const estilo = tab.atrasado
                ? (activa ? 'bg-red-600 text-white shadow-[0_4px_15px_rgba(239,68,68,0.35)]' : 'bg-red-500/10 border border-red-500/40 text-red-300 hover:bg-red-500/20')
                : (activa ? 'bg-green-500 text-white shadow-[0_4px_15px_rgba(34,197,94,0.3)]' : 'bg-[#1f2937] border border-gray-800 text-gray-400 hover:text-white hover:border-gray-600');
              return (
                <button
                  key={tab.clave}
                  id={`tab-entrega-${tab.clave}`}
                  type="button"
                  onClick={() => { setTabSeleccionada(tab.clave); setPedidosAbiertos({}); setPreparandoPedido(null); }}
                  className={`whitespace-nowrap flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${estilo}`}
                >
                  {tab.atrasado && <span>🚨</span>}
                  <span>{tab.label}</span>
                  <span className={`text-[11px] font-black px-1.5 py-0.5 rounded-full ${activa ? 'bg-black/25' : 'bg-black/30 text-gray-300'}`}>{tab.count}</span>
                </button>
              );
            })}
          </div>

          {/* Resumen por bloque de la fecha elegida */}
          {tabActiva && tabActiva !== CLAVE_ATRASADOS && (() => {
            const dia = gruposEntrega.dias.find(d => d.clave === tabActiva);
            if (!dia) return null;
            const pb = dia.porBloque;
            return (
              <div className="flex gap-2 mb-5 flex-wrap">
                <span className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-amber-500/10 border border-amber-500/30 text-amber-300">
                  <Sun size={14} /> {etiquetaBloque('M')}: {pb.M.length}
                </span>
                <span className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-500/10 border border-indigo-500/30 text-indigo-300">
                  <Sunset size={14} /> {etiquetaBloque('T')}: {pb.T.length}
                </span>
                {pb.sin.length > 0 && (
                  <span className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-gray-500/10 border border-gray-500/30 text-gray-300">
                    <Clock size={14} /> Sin horario: {pb.sin.length}
                  </span>
                )}
              </div>
            );
          })()}

          {/* Resumen de estados de entrega, pago y monto pendiente */}
          {tabActiva && (
            <ResumenDiaBar
              resumen={resumenDia}
              fechaLabel={tituloTabActiva}
              onVerPedidosDelDia={tabActiva !== CLAVE_ATRASADOS && onNav ? () => onNav('pedidos', tabActiva) : undefined}
              origen="agenda"
            />
          )}

          {/* Aviso discreto si falla la carga en lote de no-entregas */}
          {noEntregasError && (
            <div className="flex items-center justify-between px-3.5 py-2 mb-3 text-xs bg-amber-500/10 border border-amber-500/25 rounded-xl text-amber-300 shadow-sm">
              <span className="flex items-center gap-1.5">
                <AlertCircle size={14} className="text-amber-400 shrink-0" />
                <span>No se pudieron consultar los historiales de no-entrega. La agenda sigue funcionando normalmente.</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  consultadosNoEntregasRef.current.clear();
                  cargarNoEntregasBatch();
                }}
                disabled={cargandoNoEntregas}
                className="ml-3 underline hover:text-white font-medium cursor-pointer shrink-0"
              >
                {cargandoNoEntregas ? 'Reintentando...' : 'Reintentar'}
              </button>
            </div>
          )}

          {/* Barra de control: Contador, filtros y botones de remitos armados en lote */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4 bg-[#111827]/60 border border-white/5 p-3 rounded-2xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-white bg-gray-800 px-3 py-1.5 rounded-xl border border-gray-700">
                {pedidosDelTurno.length} pedidos
              </span>
              {totalACobrarTurno > 0 && (
                <span className="text-xs font-bold text-amber-300 bg-amber-500/15 px-3 py-1.5 rounded-xl border border-amber-500/30 flex items-center gap-1 shadow-sm">
                  <DollarSign size={13} className="text-amber-400" />
                  <span>A cobrar: {$$ (totalACobrarTurno)}</span>
                </span>
              )}
              <button
            type="button"
            onClick={() => setFiltroSoloArmados(prev => !prev)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
              filtroSoloArmados
                ? 'bg-green-500/20 border-green-500/50 text-green-300'
                : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
            }`}
          >
            {filtroSoloArmados ? '✓ Mostrando solo armados' : `Solo armados (${pedidosArmadosDelTurno.length})`}
          </button>

          {pedidosArmadosDelTurno.length > 0 && (
            <button
              type="button"
              onClick={seleccionarTodosArmados}
              className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded-lg hover:bg-white/5 font-semibold transition-all cursor-pointer"
            >
              {pedidosArmadosDelTurno.every(p => seleccionadosRemito.includes(p.numero_pedido))
                ? 'Desmarcar todos'
                : 'Seleccionar todos los armados'}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {rol !== 'repartidor' && (
            <button
              type="button"
              onClick={imprimirRemitosArmadosSeleccionados}
              disabled={seleccionadosRemito.length === 0}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
                seleccionadosRemito.length > 0
                  ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white shadow-lg shadow-indigo-900/30 cursor-pointer active:scale-95'
                  : 'bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed opacity-60'
              }`}
              title="Abre una sola ventana con todos los remitos seleccionados (con sus dos copias), separados por salto de página"
            >
              <Printer size={14} />
              <span>Imprimir remitos ({seleccionadosRemito.length})</span>
            </button>
          )}

          {pedidosDelTurno.length > 0 && (
            <button onClick={abrirRutaGoogle} className="flex items-center gap-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 font-bold px-3 py-1.5 rounded-xl text-xs transition-all hover:scale-[1.02] shadow-[0_0_15px_rgba(99,102,241,0.1)] shrink-0 cursor-pointer">
              🗺️ Abrir ruta
            </button>
          )}
        </div>
      </div>

      {/* Banner de sincronización de stock con el Sheet */}
      {syncNotice && !modalPreparacion && (
        <div className={`mb-4 px-4 py-3 rounded-2xl border flex items-center gap-2.5 text-xs font-bold animate-in slide-in-from-top-2 duration-200 ${
          syncNotice.tipo === 'retrying'
            ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
            : syncNotice.tipo === 'error'
            ? 'bg-red-500/15 border-red-500/40 text-red-300'
            : 'bg-green-500/15 border-green-500/30 text-green-300'
        }`}>
          <AlertTriangle size={15} className={syncNotice.tipo === 'retrying' ? 'animate-pulse text-amber-400 shrink-0' : 'text-current shrink-0'} />
          <span>{syncNotice.mensaje}</span>
        </div>
      )}

      {pedidosParaMostrar.length === 0 ? (
        <div className="bg-[#1f2937] border border-gray-800 rounded-2xl p-12 text-center">
          <MapPin size={32} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500">
            {filtroSoloArmados ? 'No hay pedidos armados en esta pestaña.' : 'No hay entregas asignadas a esta fecha.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pedidosParaMostrar.map((p, idxP) => {
            const isOpen = !!pedidosAbiertos[p.numero_pedido];
            const estadoActual = (estados[p.numero_pedido] || p.estado || 'pendiente').toLowerCase();
            const prep = preparaciones[p.numero_pedido];
            const estaPreparando = preparandoPedido === p.numero_pedido;
            const todosCompletos = prep?.completado || false;
            const tieneBolsas = prep?.items?.some(it => it.bolsasAsignadas?.length > 0);
            const esArmado = todosCompletos || estadoActual === 'preparado' || estadoActual === 'listo';

            // Estados de cobro y entrega (Requisitos 1, 2, 3)
            const formaPago = (p.forma_pago || '').toLowerCase().trim();
            const estadoPago = (p.estado_pago || '').toLowerCase().trim();
            const esEntregado = estadoActual === 'entregado';
            const esCancelado = estadoActual === 'cancelado';
            const esEntregadoOCancelado = esEntregado || esCancelado;

            // Condición unificada: pedido pendiente de entrega
            const esPendiente = esPedidoPendienteDeEntrega(p, estadoActual);
            const noEsPendiente = !esPendiente;

            const infoCalculoPedido = calcularTotalPedido(p, prep, { obtenerPrecioCongelado });
            const totalExactoPedido = infoCalculoPedido.monto;

            // Identificar si el pedido fue efectivamente cobrado (o registrado con cobrarPedido)
            const estaCobrado = esPedidoCobrado(p);
            const fueCobradoPorBoton = estaCobrado;
            const esPorCobrar = (formaPago === 'entrega' || formaPago === 'link') && !estaCobrado;

            const infoEntrega = estadoEntregaPedido(p, prep, estadoActual);
            const infoPago = estadoPagoPedido(p);

            // 1. Cartel de pago visible (exactamente uno por tarjeta, reemplazan a los anteriores si se pisan)
            let cartelPago = null;
            const tieneReembolsoPendiente = (p.reembolso_estado || '').toLowerCase().trim() === 'pendiente';
            const tieneReembolsoDevuelto = (p.reembolso_estado || '').toLowerCase().trim() === 'devuelto';
            const montoReembolso = p.reembolso_monto != null ? Number(p.reembolso_monto) : Math.round(Number(p.total) || 0);

            if (tieneReembolsoPendiente) {
              cartelPago = {
                tipo: 'rojo',
                texto: `A REEMBOLSAR $${montoReembolso.toLocaleString('es-AR')}`,
                className: 'bg-red-500/20 text-red-300 border-red-500/40 shadow-sm animate-pulse'
              };
            } else if (tieneReembolsoDevuelto) {
              const rawMedio = p.reembolso_medio || '';
              const medioLabel = MEDIOS_REEMBOLSO_LABELS[rawMedio.toLowerCase().trim()] || rawMedio;
              cartelPago = {
                tipo: 'gris',
                texto: `REEMBOLSADO $${montoReembolso.toLocaleString('es-AR')}${medioLabel ? ` · ${medioLabel}` : ''}`,
                className: 'bg-gray-500/20 text-gray-300 border-gray-500/40 shadow-sm'
              };
            } else if (estaCobrado) {
              const rawMedio = p.medio_cobro || p.medio_pago || p.medio || '';
              const medioLabel = rawMedio ? ` · ${(MEDIOS_LABELS[rawMedio] || rawMedio).toUpperCase()}` : '';
              const montoVal = p.monto_cobrado != null ? Number(p.monto_cobrado) : totalExactoPedido;
              cartelPago = {
                tipo: 'verde',
                texto: esEntregado ? `COBRADO Y ENTREGADO${medioLabel} · $${Math.round(montoVal).toLocaleString('es-AR')}` : `COBRADO${medioLabel} · $${Math.round(montoVal).toLocaleString('es-AR')}`,
                className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
              };
            } else if (estadoPago === 'approved' || estadoPago === 'pagado') {
              cartelPago = {
                tipo: 'azul',
                texto: esEntregado ? 'PAGADO ONLINE Y ENTREGADO' : 'PAGADO ONLINE',
                className: 'bg-blue-500/20 text-blue-300 border-blue-500/40 shadow-sm'
              };
            } else if (formaPago === 'entrega' || formaPago === 'link') {
              const montoACobrar = totalExactoPedido;
              const sufijo = infoCalculoPedido.esEstimado ? ' (estimado)' : '';
              cartelPago = {
                tipo: 'naranja',
                texto: `A COBRAR $${montoACobrar.toLocaleString('es-AR')}${sufijo}`,
                className: 'bg-orange-500/20 text-orange-300 border-orange-500/40 shadow-sm'
              };
            } else {
              cartelPago = {
                tipo: 'amarillo',
                texto: infoPago.label.toUpperCase(),
                className: `${infoPago.color} shadow-sm`
              };
            }

            // 2. Alerta de no entregas (Problema 1)
            const totalNoEntregas = Number(noEntregasMap[p.numero_pedido]?.total || 0);

            const configEstado = {
              'pendiente':    { icon: '⏳', label: 'PENDIENTE',    color: 'text-amber-400', bg: 'bg-amber-500/5',  border: 'border-amber-500/10' },
              'preparado':    { icon: '✅', label: 'PREPARADO',    color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
              'listo':        { icon: '✅', label: 'PREPARADO',    color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
              'entregado':    { icon: '🚚', label: 'ENTREGADO',    color: 'text-blue-400',  bg: 'bg-blue-500/10',  border: 'border-blue-500/20' },
              'no_entregado': { icon: '❌', label: 'NO ENTREGADO', color: 'text-red-400',   bg: 'bg-red-500/10',   border: 'border-red-500/20' },
              'no entregado': { icon: '❌', label: 'NO ENTREGADO', color: 'text-red-400',   bg: 'bg-red-500/10',   border: 'border-red-500/20' },
              'cancelado':    { icon: '🛑', label: 'CANCELADO',    color: 'text-red-400',   bg: 'bg-red-500/10',   border: 'border-red-500/20' },
            };
            const estadoClave = tieneReembolsoPendiente 
              ? (estadoActual === 'cancelado' ? 'cancelado' : 'pendiente')
              : estadoActual;
            const conf = configEstado[estadoClave] || configEstado.pendiente;

            // Sección de la fecha: Mañana / Tarde / Sin horario (en "Atrasados" la lista va plana)
            const seccionDe = (x) => (x.entregaBloque === 'M' ? 'M' : x.entregaBloque === 'T' ? 'T' : 'sin');
            const seccionP = seccionDe(p);
            const mostrarSeccion = tabActiva !== CLAVE_ATRASADOS && (idxP === 0 || seccionDe(pedidosParaMostrar[idxP - 1]) !== seccionP);
            const cantSeccion = mostrarSeccion ? pedidosParaMostrar.filter(x => seccionDe(x) === seccionP).length : 0;
            const tituloSeccion = seccionP === 'M' ? etiquetaBloque('M') : seccionP === 'T' ? etiquetaBloque('T') : 'Sin horario';

            // Carteles de calendario (no bloquean nada)
            const alertasEnt = alertasEntrega(p, feriados, hoyYMD, esPendiente);

            return (
              <Fragment key={p.numero_pedido}>
              {mostrarSeccion && (
                <div className={`flex items-center gap-2 pt-2 text-xs font-black uppercase tracking-wider ${seccionP === 'M' ? 'text-amber-300' : seccionP === 'T' ? 'text-indigo-300' : 'text-gray-400'}`}>
                  {seccionP === 'M' ? <Sun size={14} /> : seccionP === 'T' ? <Sunset size={14} /> : <Clock size={14} />}
                  <span>{tituloSeccion}</span>
                  <span className="bg-black/30 border border-white/10 rounded-full px-2 py-0.5 text-[10px]">{cantSeccion}</span>
                </div>
              )}
              <div className={`transition-all duration-300 rounded-2xl overflow-hidden border ${conf.bg} ${estaPreparando ? 'ring-2 ring-green-500/60 shadow-[0_0_30px_rgba(34,197,94,0.15)]' : isOpen ? 'ring-1 ring-white/10' : conf.border}`}>
                
                {/* Cabecera */}
                <div className="px-4 pr-5 py-4 flex items-center justify-between cursor-pointer hover:bg-white/5" onClick={() => toggleAcordeon(p.numero_pedido)}>
                  <div className="flex items-center gap-3">
                    {/* Checkbox para lote si está preparado */}
                    {esArmado && (
                      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={seleccionadosRemito.includes(p.numero_pedido)}
                          onChange={() => toggleSeleccionRemito(p.numero_pedido)}
                          className="w-4 h-4 rounded text-green-500 bg-black/40 border-gray-600 focus:ring-green-500 cursor-pointer accent-green-500"
                          title="Seleccionar para imprimir remito en lote"
                        />
                      </div>
                    )}
                    <div className="w-10 h-10 bg-black/40 rounded-xl flex items-center justify-center border border-white/10 text-lg">{conf.icon}</div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-sm text-white">{p.nombre}</p>
                        {p.esAtrasado && (
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border bg-red-500/20 text-red-300 border-red-500/40 shadow-sm flex items-center gap-1 animate-pulse">
                            🚨 ATRASADO
                          </span>
                        )}
                        {alertasEnt.diaCerrado && (
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border bg-orange-500/20 text-orange-300 border-orange-500/40 shadow-sm flex items-center gap-1" title="El día o bloque programado figura cerrado o no existe. Reprogramar la entrega.">
                            🚫 DIA CERRADO - REPROGRAMAR
                          </span>
                        )}
                        {alertasEnt.revisarFecha && (
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border bg-yellow-500/20 text-yellow-300 border-yellow-500/40 shadow-sm flex items-center gap-1" title="La entrega elegida es anterior a la primera entrega posible según la fecha del pedido.">
                            ⚠️ REVISAR FECHA
                          </span>
                        )}
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border ${infoEntrega.color}`}>{infoEntrega.label}</span>
                        {prep && tieneBolsas && !todosCompletos && !tieneReembolsoPendiente && (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">EN PREPARACIÓN</span>
                        )}
                        {/* Cartel único de Estado de Pago (Problema 2 & Reembolsos) */}
                        {cartelPago && (
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border shadow-sm flex items-center gap-1 ${cartelPago.className}`}>
                            {cartelPago.texto}
                          </span>
                        )}
                        {/* Estado del crédito de referidos si credito_usado > 0 (Requisito 3) */}
                        {Number(p.credito_usado) > 0 && (() => {
                          const infoCred = estadosCreditoMap[p.numero_pedido];
                          const estadoCred = (infoCred?.estado || '').toLowerCase().trim();
                          const montoCred = Number(p.credito_usado);

                          if (estadoCred === 'sin_reserva') {
                            return (
                              <span
                                className="text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-sm flex items-center gap-1 animate-pulse"
                                title="Crédito sin reserva: revisar. No tocar saldos."
                              >
                                ⚠️ Crédito sin reserva: revisar
                              </span>
                            );
                          }
                          if (estadoCred === 'reservado') {
                            return (
                              <span
                                className="text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border bg-amber-500/15 text-amber-300 border-amber-500/30 flex items-center gap-1"
                                title={`Crédito reservado: $${montoCred.toLocaleString('es-AR')}`}
                              >
                                🟡 Crédito: Reservado
                              </span>
                            );
                          }
                          if (estadoCred === 'consumido') {
                            return (
                              <span
                                className="text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border bg-emerald-500/15 text-emerald-300 border-emerald-500/30 flex items-center gap-1"
                                title={`Crédito consumido: $${montoCred.toLocaleString('es-AR')}`}
                              >
                                🟢 Crédito: Consumido
                              </span>
                            );
                          }
                          if (estadoCred === 'liberado') {
                            return (
                              <span
                                className="text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border bg-gray-500/20 text-gray-300 border-gray-500/40 flex items-center gap-1"
                                title={`Crédito liberado: $${montoCred.toLocaleString('es-AR')}`}
                              >
                                ⚪ Crédito: Liberado
                              </span>
                            );
                          }
                          return (
                            <span
                              className="text-[10px] font-bold px-2 py-0.5 rounded-lg border bg-gray-500/10 text-gray-400 border-gray-500/20 flex items-center gap-1"
                              title={`Crédito usado: $${montoCred.toLocaleString('es-AR')}`}
                            >
                              Crédito: ${montoCred.toLocaleString('es-AR')}
                            </span>
                          );
                        })()}
                        {/* Alerta de No Entregas: solo visible si el pedido está pendiente (no entregado, no cancelado y no cobrado) */}
                        {totalNoEntregas > 0 && esPedidoPendienteDeEntrega(p, estadoActual) && (
                          <span
                            className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border shadow-sm flex items-center gap-1 ${
                              totalNoEntregas >= 3
                                ? 'bg-red-500/20 text-red-300 border-red-500/40'
                                : totalNoEntregas === 2
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : 'bg-orange-500/15 text-orange-300 border-orange-500/30'
                            }`}
                            title={`${totalNoEntregas} no entrega(s) registrada(s)`}
                          >
                            ⚠️ {totalNoEntregas} {totalNoEntregas === 1 ? 'no entrega' : 'no entregas'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[11px] text-gray-500 flex items-center gap-0.5"><MapPin size={10} /> {p.localidad}</span>
                        <span className="text-[11px] text-gray-500 flex items-center gap-1">
                          <Clock size={10} />
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-black bg-gray-800 text-gray-300 border border-gray-700">{turnoDePedido(p)}</span>
                          <span>{p.entregaConFecha ? p.dia_entrega : (p.horario_entrega || 'Sin horario')}</span>
                        </span>
                        <span className="text-[11px] text-gray-500 font-mono truncate max-w-[200px]">{p.producto}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Botón Marcar reembolso devuelto si tiene reembolso pendiente */}
                    {tieneReembolsoPendiente && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarcarReembolsoDevuelto(p);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider bg-red-600 hover:bg-red-500 text-white transition-all shadow-md active:scale-95 cursor-pointer border border-red-400/40"
                        title="Confirmar devolución efectuada en Mercado Pago"
                      >
                        <span>💸</span>
                        <span>Marcar reembolso devuelto</span>
                      </button>
                    )}

                    {/* Botón Cobrar en cabecera de pedido por cobrar (Requisito 2 y 3) */}
                    {esPorCobrar && esPedidoPendienteDeEntrega(p, estadoActual) && !tieneReembolsoPendiente && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          abrirModalCobrar(p);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-95 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white cursor-pointer shadow-emerald-950/40 border border-emerald-400/30"
                        title={esArmado ? `Cobrar ${$$ (totalExactoPedido)}` : `Cobrar estimado ${$$ (totalExactoPedido)}`}
                      >
                        <CreditCard size={13} />
                        <span>Cobrar</span>
                      </button>
                    )}

                    {esPedidoPendienteDeEntrega(p, estadoActual) && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); abrirModalNoEntrega(p); }}
                        className="hidden sm:flex items-center gap-1 text-gray-400 hover:text-red-400 hover:bg-red-500/10 px-2.5 py-1.5 rounded-xl border border-transparent hover:border-red-500/20 transition-all text-xs font-bold cursor-pointer"
                        title="Registrar pedido no entregado"
                      >
                        <X size={14} />
                        <span>No entregado</span>
                      </button>
                    )}
                    {esRen && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setModalEliminar({ pedido: p }); }}
                        className="text-gray-500 hover:text-red-400 hover:bg-red-500/10 p-1.5 rounded-lg border border-transparent hover:border-red-500/20 transition-all cursor-pointer"
                        title="Eliminar cliente (Autorizado para Ren)"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                    <button className="text-gray-500 bg-black/40 p-1.5 rounded-lg border border-white/10 shrink-0">
                      {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>

                {/* Acordeón expandido */}
                {isOpen && (
                  <div className="px-5 pb-5 pt-2 border-t border-white/5 bg-black/20 slide-in space-y-4">
                    
                    {/* Alerta / Historial de no entregas (Problema 1) */}
                    {totalNoEntregas > 0 && (
                      !esPedidoPendienteDeEntrega(p, estadoActual) ? (
                        <div className="text-[11px] text-gray-400 font-medium py-1">
                          Historial: {totalNoEntregas} {totalNoEntregas === 1 ? 'no entrega anterior' : 'no entregas anteriores'}
                        </div>
                      ) : (
                        <div className="mt-2">
                          {totalNoEntregas === 1 ? (
                            <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl flex items-center gap-2 text-amber-300 text-xs font-medium">
                              <span>ℹ️ Primera no entrega registrada para {p.nombre}.</span>
                            </div>
                          ) : totalNoEntregas === 2 ? (
                            <div className="bg-amber-500/15 border border-amber-500/40 p-3.5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-200 text-xs">
                              <div className="flex items-center gap-2 font-bold text-amber-300">
                                <span>⚠️ 2ª no entrega de {p.nombre}. Avisale por WhatsApp que a la próxima queda dado de baja.</span>
                              </div>
                              {p.telefono && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const primerNombre = (p.nombre || 'Cliente').trim().split(' ')[0] || 'Cliente';
                                    const msgWa = `Hola ${primerNombre}, soy de Huerta Urbana. No pudimos entregarte tu pedido. Es la segunda vez. Si vuelve a pasar, no vamos a poder seguir entregándote. ¿Reagendamos?`;
                                    abrirWhatsAppWeb(p.telefono, msgWa);
                                  }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-xs shadow-md shadow-green-900/30 transition-all shrink-0 w-fit cursor-pointer"
                                >
                                  <MessageCircle size={14} />
                                  <span>Abrir WhatsApp</span>
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="bg-red-500/15 border border-red-500/40 p-3.5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-red-200 text-xs">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 font-black text-red-300">
                                  <AlertCircle size={16} className="text-red-400 shrink-0" />
                                  <span>{p.nombre} llegó a 3 no entregas. Corresponde darlo de baja.</span>
                                </div>
                                {tieneReembolsoPendiente && (
                                  <div className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5 ml-6">
                                    <span>⚠️</span>
                                    <span>Hay un reembolso pendiente: resolvelo antes de dar de baja.</span>
                                  </div>
                                )}
                              </div>
                              {p.telefono && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const primerNombre = (p.nombre || 'Cliente').trim().split(' ')[0] || 'Cliente';
                                    const msgWa = `Hola ${primerNombre}, soy de Huerta Urbana. Es la tercera vez que no podemos entregarte, así que damos de baja tu cuenta de pedidos. Si querés retomar, escribinos.`;
                                    abrirWhatsAppWeb(p.telefono, msgWa);
                                  }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-xs shadow-md shadow-green-900/30 transition-all shrink-0 w-fit cursor-pointer"
                                >
                                  <MessageCircle size={14} />
                                  <span>Abrir WhatsApp</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    )}

                    {/* Info del pedido */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                      <div className="space-y-4">
                        <div className="bg-black/40 border border-white/5 p-3 rounded-xl flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <Package size={14} className="text-indigo-400" />
                            <span className="font-semibold text-white text-sm">{p.producto}</span>
                          </div>
                          <span className="bg-gray-800 text-gray-300 font-bold px-2.5 py-1 rounded-md text-xs border border-gray-700">x{p.cantidades}</span>
                        </div>
                        {p.observaciones && (
                          <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl">
                            <p className="text-[10px] uppercase font-bold text-amber-500 tracking-wider mb-1">Observaciones</p>
                            <p className="text-sm text-amber-100 font-medium italic">"{p.observaciones}"</p>
                          </div>
                        )}
                        {(estadoActual === 'no_entregado' || estadoActual === 'no entregado') && (
                          <div className="bg-red-500/10 border border-red-500/30 p-3.5 rounded-xl flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[10px] uppercase font-black text-red-400 tracking-wider flex items-center gap-1.5">
                                <AlertCircle size={14} /> Motivo de No Entrega
                              </p>
                              <p className="text-sm text-red-200 mt-1 font-medium italic">
                                "{p.motivo_no_entrega || 'Sin motivo especificado'}"
                              </p>
                              {p.fecha_no_entrega && (
                                <p className="text-[10px] text-gray-500 mt-0.5 font-mono">
                                  Fecha registrada: {p.fecha_no_entrega}
                                </p>
                              )}
                            </div>
                            <button 
                              type="button"
                              onClick={(e) => { e.stopPropagation(); abrirModalNoEntrega(p); }}
                              className="text-xs text-red-400 hover:text-white underline shrink-0 font-bold px-2 py-1 bg-red-500/20 rounded-lg hover:bg-red-500/30 transition-all cursor-pointer"
                            >
                              ✏️ Cambiar motivo
                            </button>
                          </div>
                        )}
                        <div className="bg-black/40 border border-white/5 p-3 rounded-xl">
                          <p className="text-gray-400 text-xs mb-1">Dirección completa</p>
                          <p className="text-white text-sm font-medium">{p.direccion}, {p.localidad}</p>
                        </div>
                      </div>
                      <div className="space-y-4 flex flex-col justify-between">
                        <div className="flex flex-col sm:flex-row gap-2">
                          <button onClick={() => abrirWhatsApp(p.telefono, p.nombre)} className="flex-1 flex items-center justify-center gap-2 bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/30 text-[#25D366] text-sm font-bold px-4 py-3 rounded-xl transition-all">
                            <MessageCircle size={18} /> WhatsApp: {p.telefono}
                          </button>
                          {rol !== 'repartidor' && (() => {
                            const estaArmado = estaPedidoArmado(p, prep);
                            return (
                              <button 
                                type="button"
                                onClick={() => estaArmado ? imprimirRemitoConPesoReal(p) : null} 
                                disabled={!estaArmado}
                                className={`flex-1 flex items-center justify-center gap-2 text-sm font-bold px-4 py-3 rounded-xl transition-all shadow-md ${
                                  estaArmado
                                    ? 'bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white shadow-indigo-900/30 cursor-pointer'
                                    : 'bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed opacity-60'
                                }`}
                                title={estaArmado ? 'Imprimir remito con el peso real y detalle congelado' : 'Primero pesá y armá el pedido'}
                              >
                                <Printer size={18} />
                                <span>{estaArmado ? '🖨️ Imprimir Remito' : 'Primero pesá y armá el pedido'}</span>
                              </button>
                            );
                          })()}
                        </div>
                        <div className="bg-black/40 border border-white/5 flex flex-col justify-center p-4 rounded-xl flex-1">
                          {rol !== 'repartidor' ? (
                            <>
                              <div className="flex justify-between items-end mb-2">
                                <span className="text-gray-400 text-xs">Total del pedido</span>
                                <span className="text-xl font-bold text-white">${p.total}</span>
                              </div>
                              <div className="flex justify-between items-center border-t border-white/5 pt-2 mt-1 text-sm">
                                <span className="text-gray-500">Estado de pago</span>
                                {cartelPago ? (
                                  <span className={`font-black text-xs px-2 py-0.5 rounded-md border ${cartelPago.className}`}>
                                    {cartelPago.texto}
                                  </span>
                                ) : (
                                  <span className="text-gray-500 text-xs">Sin información</span>
                                )}
                              </div>
                              {tieneReembolsoPendiente && (
                                <button
                                  type="button"
                                  onClick={() => handleMarcarReembolsoDevuelto(p)}
                                  className="w-full mt-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 bg-red-600 hover:bg-red-500 text-white cursor-pointer shadow-red-950/40 border border-red-400/30"
                                >
                                  <span>💸</span>
                                  <span>Marcar reembolso devuelto</span>
                                </button>
                              )}
                              {esPorCobrar && !estaCobrado && !esEntregado && (
                                <button
                                  type="button"
                                  onClick={() => abrirModalCobrar(p)}
                                  className="w-full mt-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 bg-gradient-to-r from-emerald-600 via-green-600 to-emerald-500 hover:from-emerald-500 hover:to-green-400 text-white cursor-pointer shadow-emerald-950/40 border border-emerald-400/30"
                                  title={esArmado ? 'Abrir pantalla de cobro con pesadas reales' : 'Cobrar monto estimado'}
                                >
                                  <CreditCard size={15} />
                                  <span>{`Cobrar Pedido · ${$$ (totalExactoPedido)}${infoCalculoPedido.esEstimado ? ' (Estimado)' : ''}`}</span>
                                </button>
                              )}
                            </>
                          ) : (
                            <div className="flex items-center justify-center h-full text-gray-500 italic text-xs">Datos de facturación ocultos</div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ═══════ PANEL DE PREPARACIÓN ═══════ */}
                    {rol !== 'repartidor' && (
                      <div className="bg-black/60 border border-white/10 rounded-2xl p-5 shadow-inner mt-4">
                        <div className="flex items-center justify-between mb-4">
                          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                            {estaPreparando ? '📦 PREPARANDO PEDIDO' : todosCompletos ? '✅ PEDIDO PREPARADO' : 'Preparación del Pedido'}
                          </p>
                          {prep && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setModalReiniciar({ pedido: p, numPedido: p.numero_pedido, nombre: p.nombre });
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 hover:border-rose-500/50 text-rose-300 hover:text-white text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
                              title="Reiniciar y volver a preparar este pedido"
                            >
                              <RotateCcw size={13} className="text-rose-400" />
                              <span>Reiniciar preparación</span>
                            </button>
                          )}
                        </div>

                        {/* Botón PREPARAR (inicio) */}
                        {!prep && !estaPreparando && (estadoActual === 'pendiente' || estadoActual === 'preparado' || estadoActual === 'listo') && (
                          <button onClick={() => iniciarPreparacion(p)} className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-black text-sm uppercase tracking-widest transition-all active:scale-[0.98] cursor-pointer shadow-lg shadow-green-900/30 border-b-2 border-green-800">
                            <ScanBarcode size={20} /> 📦 PREPARAR PEDIDO
                          </button>
                        )}

                        {/* Items del pedido con escaneo */}
                        {(prep || estaPreparando) && (
                          <div className="space-y-3">
                            {estaPreparando && !todosCompletos && (
                              <div className="relative">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                                  <ScanBarcode size={16} className="text-green-400" />
                                  <div className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_2px_rgba(74,222,128,0.6)] animate-pulse" />
                                </div>
                                <input ref={scanInputRef} type="text" value={scanBuffer} onChange={(e) => setScanBuffer(e.target.value)} onKeyDown={handleScanKeyDown}
                                  placeholder="Escaneá la bolsa con la pistola..."
                                  className="w-full bg-black/50 border border-green-500/30 focus:border-green-500/60 text-white text-sm font-mono rounded-xl pl-14 pr-4 py-3 outline-none transition-all placeholder:text-gray-600 focus:bg-black/70 focus:shadow-[0_0_20px_rgba(74,222,128,0.08)]"
                                  autoComplete="off" spellCheck={false} />
                              </div>
                            )}

                            {scanError && estaPreparando && (
                              <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl">
                                <AlertCircle size={14} className="text-red-400 shrink-0" />
                                <p className="text-red-400 text-xs font-bold">{scanError}</p>
                              </div>
                            )}
                            {scanSuccess && estaPreparando && (
                              <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-xl animate-in slide-in-from-top-1 duration-200">
                                <Check size={14} className="text-green-400 shrink-0" />
                                <p className="text-green-400 text-xs font-bold">{scanSuccess}</p>
                              </div>
                            )}

                            {/* Items del pedido */}
                            <div className="space-y-2">
                              {(prep?.items || []).map((item, idx) => {
                                const bolsas = item.bolsasAsignadas || [];
                                const completo = bolsas.length >= item.cantidad;
                                const pesoReal = bolsas.reduce((s, b) => s + (b.peso || 0), 0);
                                const pesoPedido = item.pesoSolicitado ? item.pesoSolicitado * item.cantidad : null;
                                const diff = pesoPedido ? Math.round((pesoReal - pesoPedido) * 1000) / 1000 : null;

                                return (
                                  <div key={idx} className={`rounded-xl border p-3 transition-all ${completo ? 'bg-green-500/5 border-green-500/20' : 'bg-black/30 border-white/5'}`}>
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2.5">
                                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black ${completo ? 'bg-green-500 text-white' : 'bg-gray-800 text-gray-400 border border-gray-700'}`}>
                                          {completo ? <Check size={14} /> : `${bolsas.length}/${item.cantidad}`}
                                        </div>
                                        <div>
                                          <p className={`text-xs font-bold uppercase tracking-wide ${completo ? 'text-green-300' : 'text-white'}`}>{item.nombre}</p>
                                          <p className="text-[10px] text-gray-500 font-mono">
                                            {item.cantidad} {item.cantidad === 1 ? 'bolsa' : 'bolsas'}
                                            {pesoPedido ? ` · Pedido: ${pesoPedido.toFixed(3)} kg` : ''}
                                          </p>
                                        </div>
                                      </div>
                                      {bolsas.length > 0 && (
                                        <div className="text-right">
                                          <p className="text-green-400 font-mono text-xs font-bold">{pesoReal.toFixed(3)} kg</p>
                                          {diff !== null && diff !== 0 && (
                                            <p className={`text-[10px] font-bold font-mono ${diff > 0 ? 'text-amber-400' : 'text-red-400'}`}>{diff > 0 ? '+' : ''}{diff.toFixed(3)} kg</p>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    {bolsas.length > 0 && (
                                      <div className="mt-2 space-y-1 pl-8">
                                        {bolsas.map((bolsa, bIdx) => (
                                          <div key={bIdx} className="flex items-center justify-between text-[10px] bg-black/30 rounded-lg px-2.5 py-1.5 group">
                                            <div className="flex items-center gap-2">
                                              <span className="text-green-400">✓</span>
                                              <span className="text-gray-300 font-mono">{bolsa.uniqueCode}</span>
                                              <span className="text-gray-500">—</span>
                                              <span className="text-green-400 font-bold font-mono">{bolsa.peso?.toFixed(3)} kg</span>
                                              {bolsa.tagId && <span className="text-gray-600 font-mono">[{bolsa.tagId}]</span>}
                                            </div>
                                            {estaPreparando && (
                                              <button onClick={() => quitarBolsaAsignada(p.numero_pedido, idx, bIdx)} className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 cursor-pointer transition-all p-0.5" title="Quitar bolsa">
                                                <X size={12} />
                                              </button>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Botón MARCAR PREPARADO */}
                            {estaPreparando && todosCompletos && (
                              <button onClick={() => marcarPreparado(p.numero_pedido)} className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 text-white font-black text-sm uppercase tracking-widest transition-all active:scale-[0.98] cursor-pointer shadow-lg shadow-green-900/40 border-b-2 border-green-700 animate-pulse">
                                <CheckCircle size={20} /> ✅ MARCAR COMO PREPARADO
                              </button>
                            )}

                            {/* Continuar preparando */}
                            {!estaPreparando && !todosCompletos && tieneBolsas && (
                              <button onClick={() => { setPreparandoPedido(p.numero_pedido); setTimeout(() => scanInputRef.current?.focus(), 100); }} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer">
                                <ScanBarcode size={16} /> Continuar preparando
                              </button>
                            )}

                            {/* Botonera de estado */}
                            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/5">
                              <button
                                disabled={noEsPendiente}
                                onClick={() => !noEsPendiente && actualizarEstado(p.numero_pedido, 'Pendiente')}
                                className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-[10px] font-bold transition-all ${noEsPendiente ? 'opacity-40 cursor-not-allowed bg-white/5 border-white/5 text-gray-600' : 'cursor-pointer ' + (estadoActual === 'pendiente' ? 'bg-amber-500/20 border-amber-500/30 text-amber-400' : 'bg-white/5 border-white/5 text-gray-500 hover:text-amber-400')}`}
                              >
                                <span>⏳</span> Pendiente
                              </button>
                              <button
                                disabled={noEsPendiente || entregandoPedido === p.numero_pedido}
                                onClick={() => handleMarcarEntregado(p)}
                                className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-[10px] font-bold transition-all ${noEsPendiente ? 'opacity-50 cursor-not-allowed bg-blue-500/20 border-blue-500/30 text-blue-400' : 'cursor-pointer ' + (estadoActual === 'entregado' ? 'bg-blue-500/20 border-blue-500/30 text-blue-400' : 'bg-white/5 border-white/5 text-gray-500 hover:text-blue-400')}`}
                              >
                                <span>🚚</span> {entregandoPedido === p.numero_pedido ? 'Entregando...' : 'Entregado'}
                              </button>
                              <button
                                disabled={noEsPendiente}
                                onClick={() => !noEsPendiente && abrirModalNoEntrega(p)}
                                className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-[10px] font-bold transition-all ${noEsPendiente ? 'opacity-40 cursor-not-allowed bg-white/5 border-white/5 text-gray-600' : 'cursor-pointer ' + ((estadoActual === 'no_entregado' || estadoActual === 'no entregado') ? 'bg-red-500/20 border-red-500/30 text-red-400' : 'bg-white/5 border-white/5 text-gray-500 hover:text-red-400')}`}
                              >
                                <span>❌</span> No entregado
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Botonera legado (sin preparación en memoria) */}
                        {!prep && !estaPreparando && estadoActual !== 'pendiente' && (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <button
                              disabled={noEsPendiente}
                              onClick={() => (rol !== 'repartidor' && !noEsPendiente) ? actualizarEstado(p.numero_pedido, 'Pendiente') : null}
                              className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-4 rounded-2xl border font-black text-[11px] transition-all ${noEsPendiente ? 'opacity-40 cursor-not-allowed bg-amber-500/5 border-amber-500/10 text-gray-600' : 'active:scale-95 ' + (estadoActual === 'pendiente' ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'bg-amber-500/5 border-amber-500/10 text-amber-400 hover:bg-amber-500/10') + (rol === 'repartidor' ? ' opacity-50 cursor-default' : ' cursor-pointer hover:scale-[1.02]')}`}
                            >
                              <span className="text-xl">⏳</span> PENDIENTE
                            </button>
                            <button
                              disabled={noEsPendiente}
                              onClick={() => (rol !== 'repartidor' && !noEsPendiente) ? actualizarEstado(p.numero_pedido, 'Preparado') : null}
                              className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-4 rounded-2xl border font-black text-[11px] transition-all ${noEsPendiente ? 'opacity-40 cursor-not-allowed bg-green-500/5 border-green-500/10 text-gray-600' : 'active:scale-95 ' + ((estadoActual === 'preparado' || estadoActual === 'listo') ? 'bg-green-500/20 border-green-500/40 text-green-400' : 'bg-green-500/5 border-green-500/10 text-green-500 hover:bg-green-500/10') + (rol === 'repartidor' ? ' opacity-50 cursor-default' : ' cursor-pointer hover:scale-[1.02]')}`}
                            >
                              <span className="text-xl">✅</span> PREPARADO
                            </button>
                            <button
                              disabled={noEsPendiente || entregandoPedido === p.numero_pedido}
                              onClick={() => handleMarcarEntregado(p)}
                              className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-4 rounded-2xl border font-black text-[11px] transition-all ${noEsPendiente ? 'opacity-50 cursor-not-allowed bg-blue-500/20 border-blue-500/40 text-blue-400' : 'active:scale-95 cursor-pointer hover:scale-[1.02] ' + (estadoActual === 'entregado' ? 'bg-blue-500/20 border-blue-500/40 text-blue-400' : 'bg-blue-500/5 border-blue-500/10 text-blue-500 hover:bg-blue-500/10')}`}
                            >
                              <span className="text-xl">🚚</span> {entregandoPedido === p.numero_pedido ? 'ENTREGANDO...' : 'ENTREGADO'}
                            </button>
                            <button
                              disabled={noEsPendiente}
                              onClick={() => !noEsPendiente && abrirModalNoEntrega(p)}
                              className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-4 rounded-2xl border font-black text-[11px] transition-all ${noEsPendiente ? 'opacity-40 cursor-not-allowed bg-red-500/5 border-red-500/10 text-gray-600' : 'active:scale-95 cursor-pointer hover:scale-[1.02] ' + ((estadoActual === 'no_entregado' || estadoActual === 'no entregado') ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'bg-red-500/5 border-red-500/10 text-red-500 hover:bg-red-500/10')}`}
                            >
                              <span className="text-xl">❌</span> NO ENTREGADO
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Repartidor: botonera simplificada */}
                    {rol === 'repartidor' && (
                      <div className="bg-black/60 border border-white/10 rounded-2xl p-5 shadow-inner mt-4">
                        <p className="text-center text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-4">Actualizar Entrega</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <button className="flex-1 flex flex-col items-center justify-center gap-1.5 py-4 rounded-2xl border font-black text-[11px] bg-amber-500/5 border-amber-500/10 text-amber-400 opacity-50 cursor-default"><span className="text-xl">⏳</span> PENDIENTE</button>
                          <button className="flex-1 flex flex-col items-center justify-center gap-1.5 py-4 rounded-2xl border font-black text-[11px] bg-green-500/5 border-green-500/10 text-green-500 opacity-50 cursor-default"><span className="text-xl">✅</span> PREPARADO</button>
                          <button
                            disabled={noEsPendiente || entregandoPedido === p.numero_pedido}
                            onClick={() => handleMarcarEntregado(p)}
                            className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-4 rounded-2xl border font-black text-[11px] transition-all ${noEsPendiente ? 'opacity-50 cursor-not-allowed bg-blue-500/20 border-blue-500/40 text-blue-400' : 'active:scale-95 cursor-pointer hover:scale-[1.02] ' + (estadoActual === 'entregado' ? 'bg-blue-500/20 border-blue-500/40 text-blue-400' : 'bg-blue-500/5 border-blue-500/10 text-blue-500 hover:bg-blue-500/10')}`}
                          >
                            <span className="text-xl">🚚</span> {entregandoPedido === p.numero_pedido ? 'ENTREGANDO...' : 'ENTREGADO'}
                          </button>
                          <button
                            disabled={noEsPendiente}
                            onClick={() => !noEsPendiente && abrirModalNoEntrega(p)}
                            className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-4 rounded-2xl border font-black text-[11px] transition-all ${noEsPendiente ? 'opacity-40 cursor-not-allowed bg-red-500/5 border-red-500/10 text-gray-600' : 'active:scale-95 cursor-pointer hover:scale-[1.02] ' + ((estadoActual === 'no_entregado' || estadoActual === 'no entregado') ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'bg-red-500/5 border-red-500/10 text-red-500 hover:bg-red-500/10')}`}
                          >
                            <span className="text-xl">❌</span> NO ENTREGADO
                          </button>
                        </div>
                        <p className="text-center text-[9px] text-gray-600 mt-4 leading-relaxed italic">Los estados "Pendiente" y "Preparado" son solo de lectura para el repartidor.</p>
                      </div>
                    )}

                    {/* Barra inferior de la tarjeta: Información de Cliente y Acción Eliminar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-white/5 mt-4">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <User size={13} className="text-gray-400 shrink-0" />
                        <span className="truncate">Cliente: <strong className="text-gray-200">{p.nombre}</strong></span>
                        <span className="text-gray-600">·</span>
                        <span className="font-mono text-[11px] text-gray-500">{p.numero_pedido}</span>
                      </div>

                      {esRen ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setModalEliminar({ pedido: p }); }}
                          className="flex items-center justify-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 hover:border-red-500/50 text-red-400 hover:text-red-300 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer active:scale-95 w-fit shrink-0"
                          title="Eliminar este cliente y su entrega del sistema (Acceso exclusivo de Ren)"
                        >
                          <Trash2 size={13} />
                          <span>Eliminar cliente</span>
                        </button>
                      ) : (
                        <div 
                          className="flex items-center gap-1.5 text-gray-600 bg-white/[0.02] border border-white/5 px-2.5 py-1 rounded-lg text-xs font-medium cursor-not-allowed select-none w-fit shrink-0"
                          title="Solo el usuario Ren tiene autorización para eliminar clientes"
                        >
                          <Lock size={12} className="text-gray-600" />
                          <span>Eliminar cliente (Solo Ren)</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              </Fragment>
            );
          })}
        </div>
      )}

      {/* ── Bloque plegado "Entregados hoy (N)" al final de la lista (Requisito 2) ── */}
      <div className="mt-6 border border-gray-800 bg-[#111827]/40 rounded-2xl overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => setEntregadosHoyAbierto(prev => !prev)}
          className="w-full px-5 py-4 flex items-center justify-between bg-white/[0.02] hover:bg-white/[0.05] transition-all cursor-pointer text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CheckCircle size={16} />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-200">
                Entregados hoy ({pedidosEntregadosHoyDelTurno.length})
              </p>
              <p className="text-[11px] text-gray-500">
                Pedidos entregados o cancelados cuya fecha de cierre sea de hoy
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-gray-400">
            <span className="text-xs text-gray-500 font-medium">
              {entregadosHoyAbierto ? 'Plegar' : 'Desplegar'}
            </span>
            {entregadosHoyAbierto ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </button>
        {entregadosHoyAbierto && (
          <div className="p-4 border-t border-white/5 bg-black/20 space-y-3">
            {pedidosEntregadosHoyDelTurno.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-4">No hay pedidos entregados o cancelados hoy en este turno.</p>
            ) : (
              pedidosEntregadosHoyDelTurno.map(p => {
                const estadoActual = (estados[p.numero_pedido] || p.estado || '').toLowerCase().trim();
                const esEntregado = estadoActual === 'entregado' || estadoActual === 'delivered';
                const fechaCierreRaw = obtenerFechaCierreEfectiva(p, estadoActual);
                const fechaDisplay = fechaCierreRaw || p.fecha || 'hoy';
                const medioPagoStr = MEDIOS_LABELS[p.medio_pago] || p.medio_pago || p.forma_pago || '-';
                const montoDisplay = p.monto_cobrado != null && p.monto_cobrado !== '' ? $$ (p.monto_cobrado) : (p.total ? $$ (p.total) : '-');

                return (
                  <div key={p.numero_pedido} className="p-3.5 bg-black/40 border border-white/10 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-white/20 transition-all">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white text-sm">{p.nombre}</span>
                        <span className="font-mono text-[11px] text-gray-400">{p.numero_pedido}</span>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${
                          esEntregado
                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                            : 'bg-red-500/20 text-red-300 border-red-500/40'
                        }`}>
                          {estadoActual}
                        </span>
                        {p.cobrado && (
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            PAGADO
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-1 flex items-center gap-2 flex-wrap">
                        <span className="flex items-center gap-1"><Calendar size={12} className="text-gray-500" /> Cierre: {fechaDisplay}</span>
                        <span>·</span>
                        <span>Medio: <strong className="text-gray-300">{medioPagoStr}</strong></span>
                        <span>·</span>
                        <span>Monto: <strong className="text-emerald-400">{montoDisplay}</strong></span>
                        {p.direccion && (
                          <>
                            <span>·</span>
                            <span className="text-gray-500 truncate max-w-[200px]">{p.direccion}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {(() => {
                        const prep = preparaciones[p.numero_pedido];
                        const estaArmado = estaPedidoArmado(p, prep);
                        return (
                          <button
                            type="button"
                            onClick={() => estaArmado ? imprimirRemitoConPesoReal(p) : null}
                            disabled={!estaArmado}
                            className={`flex items-center gap-1.5 border text-xs font-semibold px-3 py-1.5 rounded-xl transition-all shadow-sm ${
                              estaArmado
                                ? 'bg-gray-800 hover:bg-gray-700 border-gray-600 hover:border-gray-500 text-white cursor-pointer active:scale-95'
                                : 'bg-gray-900 border-gray-800 text-gray-500 cursor-not-allowed opacity-60'
                            }`}
                            title={estaArmado ? 'Reimprimir remito' : 'Primero pesá y armá el pedido'}
                          >
                            <Printer size={13} className={estaArmado ? 'text-amber-400' : 'text-gray-600'} />
                            <span>{estaArmado ? 'Reimprimir remito' : 'Primero pesá y armá el pedido'}</span>
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </>
  )}

      {/* ═══════ MODAL CUADRO DE DIÁLOGO: PEDIDO NO ENTREGADO (REQUISITOS 4 Y 5) ═══════ */}
      {modalNoEntrega && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#181d24] border border-red-500/30 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 text-lg font-bold">
                  ❌
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Pedido No Entregado</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {modalNoEntrega.pedido.nombre} · Pedido {modalNoEntrega.pedido.numero_pedido}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => !modalNoEntrega.guardando && setModalNoEntrega(null)} 
                disabled={modalNoEntrega.guardando}
                className="text-gray-500 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-30"
              >
                <X size={18} />
              </button>
            </div>

            {modalNoEntrega.resultado ? (
              <div className="space-y-4 animate-in fade-in">
                {/* Nivel: primera */}
                {modalNoEntrega.resultado.nivel === 'primera' && (
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 text-blue-200 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-sm text-blue-300">
                      <CheckCircle size={18} className="text-blue-400 shrink-0" />
                      <span>Primera no entrega registrada para {modalNoEntrega.resultado.cliente}</span>
                    </div>
                    <p className="text-xs text-blue-200/80">
                      {modalNoEntrega.resultado.accion === 'reagendar'
                        ? `El pedido quedó reagendado para el ${modalNoEntrega.resultado.nuevoDia} (${modalNoEntrega.resultado.nuevoHorario}). El stock permanece reservado.`
                        : 'El pedido fue cancelado y el stock reservado ha sido liberado en el depósito.'}
                    </p>
                  </div>
                )}

                {/* Nivel: alerta (2ª vez) */}
                {modalNoEntrega.resultado.nivel === 'alerta' && (
                  <div className="bg-amber-500/15 border border-amber-500/40 rounded-xl p-4 text-amber-200 space-y-3">
                    <div className="flex items-center gap-2 font-black text-sm text-amber-300">
                      <AlertTriangle size={18} className="text-amber-400 shrink-0" />
                      <span>2ª no entrega de {modalNoEntrega.resultado.cliente}. Avisale por WhatsApp que a la próxima queda dado de baja</span>
                    </div>
                    <p className="text-xs text-amber-200/90 leading-relaxed">
                      {modalNoEntrega.resultado.accion === 'reagendar'
                        ? `El pedido quedó reagendado para el ${modalNoEntrega.resultado.nuevoDia} (${modalNoEntrega.resultado.nuevoHorario}).`
                        : 'El pedido fue cancelado y el stock liberado.'}
                    </p>
                    {modalNoEntrega.resultado.telefono && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            const nombreCliente = (modalNoEntrega.resultado.cliente || modalNoEntrega.pedido.nombre || 'Cliente').trim();
                            const primerNombre = nombreCliente.split(' ')[0] || 'Cliente';
                            const msgWa = `Hola ${primerNombre}, soy de Huerta Urbana. No pudimos entregarte tu pedido. Es la segunda vez. Si vuelve a pasar, no vamos a poder seguir entregándote. ¿Reagendamos?`;
                            abrirWhatsAppWeb(modalNoEntrega.resultado.telefono, msgWa);
                          }}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-xs shadow-lg shadow-green-900/30 transition-all cursor-pointer"
                        >
                          <MessageCircle size={16} />
                          <span>Abrir WhatsApp</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Nivel: baja (3ª vez o más) */}
                {modalNoEntrega.resultado.nivel === 'baja' && (
                  <div className="bg-red-500/15 border border-red-500/40 rounded-xl p-4 text-red-200 space-y-3">
                    <div className="flex items-center gap-2 font-black text-sm text-red-300">
                      <AlertCircle size={18} className="text-red-400 shrink-0" />
                      <span>{modalNoEntrega.resultado.cliente} llegó a 3 no entregas. Corresponde darlo de baja</span>
                    </div>
                    <p className="text-xs text-red-200/90 leading-relaxed">
                      {modalNoEntrega.resultado.accion === 'reagendar'
                        ? `El pedido quedó reagendado para el ${modalNoEntrega.resultado.nuevoDia} (${modalNoEntrega.resultado.nuevoHorario}).`
                        : 'El pedido fue cancelado y el stock liberado.'}
                    </p>
                    {modalNoEntrega.resultado.telefono && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            const nombreCliente = (modalNoEntrega.resultado.cliente || modalNoEntrega.pedido.nombre || 'Cliente').trim();
                            const primerNombre = nombreCliente.split(' ')[0] || 'Cliente';
                            const msgWa = `Hola ${primerNombre}, soy de Huerta Urbana. Es la tercera vez que no podemos entregarte, así que damos de baja tu cuenta de pedidos. Si querés retomar, escribinos.`;
                            abrirWhatsAppWeb(modalNoEntrega.resultado.telefono, msgWa);
                          }}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-xs shadow-lg shadow-green-900/30 transition-all cursor-pointer"
                        >
                          <MessageCircle size={16} />
                          <span>Abrir WhatsApp</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setModalNoEntrega(null)}
                  className="w-full py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-bold text-xs transition-all cursor-pointer"
                >
                  Entendido / Cerrar
                </button>
              </div>
            ) : (
              <>
                {/* Motivos requeridos: No estaba, No atendió, Dirección incorrecta, Otro */}
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-gray-400 mb-2">
                    Motivo de la no entrega:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'No estaba', label: 'No estaba', icon: '🚪' },
                      { id: 'No atendió', label: 'No atendió', icon: '📵' },
                      { id: 'Dirección incorrecta', label: 'Dirección incorrecta', icon: '📍' },
                      { id: 'Otro', label: 'Otro', icon: '✏️' },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        disabled={modalNoEntrega.guardando}
                        onClick={() => setModalNoEntrega(prev => ({ ...prev, motivoSeleccionado: item.id }))}
                        className={`text-left text-xs p-2.5 rounded-xl border transition-all flex items-center gap-2 cursor-pointer ${
                          modalNoEntrega.motivoSeleccionado === item.id
                            ? 'bg-red-500/20 border-red-500/40 text-red-200 font-bold shadow-sm'
                            : 'bg-black/30 border-white/5 text-gray-400 hover:text-white hover:border-white/20'
                        }`}
                      >
                        <span className="text-base">{item.icon}</span>
                        <span className="truncate">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {modalNoEntrega.motivoSeleccionado === 'Otro' && (
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-gray-400 mb-1.5">
                      Detalle del motivo:
                    </label>
                    <input
                      type="text"
                      disabled={modalNoEntrega.guardando}
                      value={modalNoEntrega.motivoOtro}
                      onChange={(e) => setModalNoEntrega(prev => ({ ...prev, motivoOtro: e.target.value }))}
                      placeholder="Escribí aquí el motivo..."
                      className="w-full bg-black/50 border border-white/10 focus:border-red-500/50 rounded-xl p-3 text-white text-xs placeholder:text-gray-600 outline-none transition-colors font-medium"
                    />
                  </div>
                )}

                {/* Dos opciones: Reagendar y Cancelar pedido */}
                {!modalNoEntrega.accion ? (
                  <div className="space-y-2 pt-1">
                    <label className="block text-[11px] font-black uppercase tracking-wider text-gray-400">
                      Seleccioná la acción:
                    </label>
                    {(() => {
                      const estPago = (modalNoEntrega.pedido?.estado_pago || '').toLowerCase().trim();
                      const esOnline = estPago === 'approved' || estPago === 'pagado';
                      const montoTotalModal = Number(modalNoEntrega.pedido?.total) || 0;

                      return (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setModalNoEntrega(prev => ({ ...prev, accion: 'reagendar' }))}
                            className={`p-4 rounded-xl text-left transition-all cursor-pointer space-y-1 group ${
                              esOnline
                                ? 'bg-blue-600/20 hover:bg-blue-600/30 border-2 border-blue-500 text-blue-100 shadow-md shadow-blue-950/40 ring-1 ring-blue-500/30'
                                : 'bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 hover:border-blue-500/50 text-blue-200'
                            }`}
                          >
                            <div className="flex items-center gap-2 text-sm font-black text-blue-400 group-hover:text-blue-300">
                              <span>🗓️</span> Reagendar
                              {esOnline && (
                                <span className="text-[9px] bg-blue-500 text-white font-black px-1.5 py-0.5 rounded uppercase ml-auto">
                                  Recomendado
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-gray-400 font-normal">
                              Elegí día y horario nuevo. El stock sigue reservado.
                            </p>
                          </button>

                          <button
                            type="button"
                            onClick={() => setModalNoEntrega(prev => ({ ...prev, accion: 'cancelar', confirmandoCancelar: true }))}
                            className="p-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 hover:border-red-500/50 text-red-200 font-bold text-left transition-all cursor-pointer space-y-1 group"
                          >
                            <div className="flex items-center gap-2 text-sm font-black text-red-400 group-hover:text-red-300">
                              <span>🛑</span> Cancelar pedido
                            </div>
                            <p className="text-[11px] text-gray-400 font-normal">
                              {esOnline
                                ? `Registra reembolso pendiente de $${montoTotalModal.toLocaleString('es-AR')} y libera el stock.`
                                : 'Libera el stock con liberarPedido y cancela el pedido.'}
                            </p>
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                ) : modalNoEntrega.accion === 'reagendar' ? (
                  <div className="space-y-3 bg-black/30 border border-blue-500/20 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                        <span>🗓️</span> Reagendar Entrega
                      </h4>
                      <button
                        type="button"
                        disabled={modalNoEntrega.guardando}
                        onClick={() => setModalNoEntrega(prev => ({ ...prev, accion: null }))}
                        className="text-[11px] text-gray-400 hover:text-white underline cursor-pointer"
                      >
                        Cambiar opción
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1">Nueva fecha y bloque:</label>
                        <select
                          disabled={modalNoEntrega.guardando}
                          value={modalNoEntrega.nuevoDia}
                          onChange={(e) => {
                            const txt = e.target.value;
                            const m = txt.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(Mañana|Tarde)/);
                            const cod = m ? (m[4] === 'Tarde' ? 'T' : 'M') : null;
                            setModalNoEntrega(prev => ({ ...prev, nuevoDia: txt, ...(cod ? { nuevoHorario: horarioDeBloque(cod) } : {}) }));
                          }}
                          className="w-full bg-[#12161c] border border-white/10 rounded-xl p-2.5 text-xs text-white outline-none focus:border-blue-500"
                        >
                          {bloquesDisponibles(new Date(), feriados).map(o => {
                            const txt = formatoDiaEntrega(o.ymd, o.bloque);
                            return <option key={txt} value={txt}>{txt}</option>;
                          })}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1">Nuevo Horario:</label>
                        <input
                          type="text"
                          disabled={modalNoEntrega.guardando}
                          value={modalNoEntrega.nuevoHorario}
                          onChange={(e) => setModalNoEntrega(prev => ({ ...prev, nuevoHorario: e.target.value }))}
                          placeholder="09:00 - 13:00"
                          className="w-full bg-[#12161c] border border-white/10 rounded-xl p-2.5 text-xs text-white outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-400 italic">
                      ℹ️ El stock permanece reservado para este pedido en la nueva fecha.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black uppercase tracking-wider text-red-400 flex items-center gap-1.5">
                        <span>⚠️</span> Confirmar Cancelación
                      </h4>
                      <button
                        type="button"
                        disabled={modalNoEntrega.guardando}
                        onClick={() => setModalNoEntrega(prev => ({ ...prev, accion: null }))}
                        className="text-[11px] text-gray-400 hover:text-white underline cursor-pointer"
                      >
                        Volver
                      </button>
                    </div>
                    <p className="text-xs text-gray-300">
                      ¿Estás seguro de cancelar el pedido <strong>{modalNoEntrega.pedido.numero_pedido}</strong>?
                    </p>
                    {(() => {
                      const estPago = (modalNoEntrega.pedido?.estado_pago || '').toLowerCase().trim();
                      const esOnline = estPago === 'approved' || estPago === 'pagado';
                      const montoTotalModal = Number(modalNoEntrega.pedido?.total) || 0;

                      return esOnline ? (
                        <div className="bg-black/40 p-3 rounded-lg text-[11px] text-red-200 border border-red-500/30 space-y-1.5">
                          <p className="font-bold text-red-300 flex items-center gap-1.5">
                            <span>💳</span> Pedido Pagado Online (${montoTotalModal.toLocaleString('es-AR')})
                          </p>
                          <p>
                            Al confirmar, se registrará el reembolso pendiente por <strong>${montoTotalModal.toLocaleString('es-AR')}</strong> (100% de lo pagado) para devolver desde Mercado Pago y luego se liberará el stock reservado.
                          </p>
                        </div>
                      ) : (
                        <div className="bg-black/40 p-2.5 rounded-lg text-[11px] text-red-200 border border-red-500/20">
                          Se llamará a <code>liberarPedido</code> con motivo: <strong className="text-white">"No entregado: {modalNoEntrega.motivoSeleccionado === 'Otro' ? (modalNoEntrega.motivoOtro || 'Otro') : modalNoEntrega.motivoSeleccionado}"</strong> y el stock reservado volverá a estar disponible en el depósito.
                        </div>
                      );
                    })()}
                  </div>
                )}

                {modalNoEntrega.error && (
                  <div className="bg-red-500/15 border border-red-500/30 rounded-xl p-3 text-red-300 text-xs font-medium flex items-center gap-2">
                    <AlertCircle size={16} className="text-red-400 shrink-0" />
                    <span>{modalNoEntrega.error}</span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    disabled={modalNoEntrega.guardando}
                    onClick={() => setModalNoEntrega(null)}
                    className="flex-1 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold transition-all cursor-pointer disabled:opacity-40"
                  >
                    Cerrar
                  </button>

                  {modalNoEntrega.accion === 'reagendar' && (
                    <button
                      type="button"
                      disabled={modalNoEntrega.guardando}
                      onClick={handleConfirmarReagendar}
                      className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-bold transition-all cursor-pointer shadow-lg shadow-blue-900/30 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {modalNoEntrega.guardando ? 'Guardando...' : 'Confirmar Reagendado'}
                    </button>
                  )}

                  {modalNoEntrega.accion === 'cancelar' && (
                    <button
                      type="button"
                      disabled={modalNoEntrega.guardando}
                      onClick={handleConfirmarCancelarNoEntrega}
                      className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 active:scale-95 text-white text-xs font-bold transition-all cursor-pointer shadow-lg shadow-red-900/30 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {modalNoEntrega.guardando ? 'Cancelando...' : 'Confirmar Cancelación'}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══════ MODAL CUADRO DE DIÁLOGO: COBRAR PEDIDO (REQUISITOS 2 Y 3) ═══════ */}
      {modalCobrar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#181d24] border border-emerald-500/30 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Cabecera */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-lg font-bold">
                  💳
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Cobrar Pedido</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {modalCobrar.pedido.nombre} · Pedido {modalCobrar.pedido.numero_pedido}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => !modalCobrar.guardando && setModalCobrar(null)} 
                disabled={modalCobrar.guardando}
                className="text-gray-500 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-30"
              >
                <X size={18} />
              </button>
            </div>

            {/* Resultado o formulario */}
            {modalCobrar.resultado ? (
              <div className="space-y-4 animate-in fade-in">
                {modalCobrar.resultado.ya_cobrado ? (
                  <div className="bg-amber-500/15 border border-amber-500/30 rounded-xl p-4 text-amber-300 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-sm">
                      <AlertCircle size={18} className="text-amber-400" />
                      <span>Este pedido ya estaba cobrado</span>
                    </div>
                    <p className="text-xs text-amber-200/80">
                      El servidor reportó que el cobro ya fue registrado previamente. Los datos han sido actualizados.
                    </p>
                  </div>
                ) : (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-emerald-200 space-y-3">
                    <div className="flex items-center gap-2 font-bold text-sm text-emerald-300">
                      <CheckCircle size={18} className="text-emerald-400" />
                      <span>¡Cobro registrado exitosamente!</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-emerald-500/20 text-center">
                      <div className="bg-black/30 p-2 rounded-lg">
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Cobrado</p>
                        <p className="text-sm font-black text-white">${Number(modalCobrar.resultado.cobrado || modalCobrar.totalCobrar).toLocaleString('es-AR')}</p>
                      </div>
                      <div className="bg-black/30 p-2 rounded-lg">
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Comisión</p>
                        <p className="text-sm font-black text-rose-400">${Number(modalCobrar.resultado.comision || 0).toLocaleString('es-AR')}</p>
                      </div>
                      <div className="bg-black/30 p-2 rounded-lg">
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Neto</p>
                        <p className="text-sm font-black text-emerald-400">${Number(modalCobrar.resultado.neto || 0).toLocaleString('es-AR')}</p>
                      </div>
                    </div>

                    {/* Mensajes del servidor sobre crédito y referido (Requisito 4) */}
                    {modalCobrar.resultado.creditos && String(modalCobrar.resultado.creditos).toLowerCase().includes('consumido') && (
                      <div className="bg-emerald-500/15 border border-emerald-500/30 rounded-xl p-3 text-emerald-300 text-xs font-bold flex items-center gap-2">
                        <CheckCircle size={15} className="text-emerald-400 shrink-0" />
                        <span>Crédito consumido</span>
                      </div>
                    )}
                    {modalCobrar.resultado.referido && String(modalCobrar.resultado.referido).startsWith('acreditado') && (
                      <div className="bg-purple-500/15 border border-purple-500/30 rounded-xl p-3 text-purple-300 text-xs font-bold flex items-center gap-2">
                        <span>🎁</span>
                        <span>Crédito de referido acreditado al dueño del código</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Avisos del servidor (e.g. Stock negativo de ...) */}
                {modalCobrar.resultado.avisos && (
                  <div className="bg-amber-500/15 border border-amber-500/30 rounded-xl p-3.5 text-amber-300 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-bold">
                      <AlertTriangle size={15} className="text-amber-400 shrink-0" />
                      <span>Avisos del servidor:</span>
                    </div>
                    <p className="text-amber-200 whitespace-pre-wrap pl-5 font-mono text-[11px]">
                      {Array.isArray(modalCobrar.resultado.avisos)
                        ? modalCobrar.resultado.avisos.join('\n')
                        : String(modalCobrar.resultado.avisos)}
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setModalCobrar(null)}
                  className="w-full py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-bold text-xs transition-all cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Monto precargado y editable con total calculado (Requisito 8) */}
                <div className="bg-black/40 border border-white/5 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs text-gray-400 font-medium">Monto a Cobrar</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        {modalCobrar.estaArmado
                          ? (modalCobrar.esEstimado ? modalCobrar.motivoEstimado : 'Suma de subtotales pesados menos descuentos')
                          : 'Estimado, se ajusta al pesar'}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1.5 justify-end">
                        <span className="text-lg font-bold text-gray-400">$</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          disabled={modalCobrar.guardando}
                          value={modalCobrar.totalCobrar}
                          onChange={(e) => {
                            const val = e.target.value === '' ? '' : Math.max(0, Math.round(Number(e.target.value)));
                            setModalCobrar(prev => ({ ...prev, totalCobrar: val }));
                          }}
                          className="w-36 bg-black/60 border border-emerald-500/40 focus:border-emerald-400 rounded-lg px-2.5 py-1 text-right text-xl font-black text-emerald-400 outline-none"
                        />
                      </div>
                      <p className="text-[10px] text-gray-500 mt-0.5">Total calculado: ${Number(modalCobrar.totalCalculado || 0).toLocaleString('es-AR')}</p>
                    </div>
                  </div>

                  {/* Aviso si el monto ingresado difiere del total calculado */}
                  {Number(modalCobrar.totalCobrar) !== Number(modalCobrar.totalCalculado) && (
                    <div className="bg-amber-500/15 border border-amber-500/30 rounded-lg p-2.5 text-xs text-amber-300 flex items-center gap-2">
                      <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                      <span>El monto ingresado (${Number(modalCobrar.totalCobrar || 0).toLocaleString('es-AR')}) difiere del total calculado (${Number(modalCobrar.totalCalculado || 0).toLocaleString('es-AR')}).</span>
                    </div>
                  )}

                  {/* Aviso si el pedido no está armado */}
                  {!modalCobrar.estaArmado && (
                    <div className="bg-blue-500/15 border border-blue-500/30 rounded-lg p-2.5 text-xs text-blue-300 flex items-center gap-2">
                      <AlertCircle size={14} className="text-blue-400 shrink-0" />
                      <span>Pedido sin armar: el monto es estimado (${Number(modalCobrar.totalCalculado || 0).toLocaleString('es-AR')}) y se basa en el pedido original. Se solicitará confirmación al cobrar.</span>
                    </div>
                  )}
                </div>

                {/* Selector de medio de pago (QR, transferencia, débito, crédito; sin efectivo) */}
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-gray-400 mb-2">
                    Medio de Pago:
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'qr', label: 'QR', icon: '📱' },
                      { id: 'transferencia', label: 'Transferencia', icon: '🏦' },
                      { id: 'debito', label: 'Débito', icon: '💳' },
                      { id: 'credito', label: 'Crédito', icon: '💳' },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        disabled={modalCobrar.guardando}
                        onClick={() => setModalCobrar(prev => ({ ...prev, medio: m.id }))}
                        className={`p-2.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                          modalCobrar.medio === m.id
                            ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-sm'
                            : 'bg-black/30 border-white/5 text-gray-400 hover:text-white hover:border-white/20'
                        }`}
                      >
                        <span>{m.icon}</span>
                        <span className="truncate">{m.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Campo opcional de nota */}
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-gray-400 mb-1.5">
                    Nota / Observación (opcional):
                  </label>
                  <input
                    type="text"
                    disabled={modalCobrar.guardando}
                    value={modalCobrar.nota}
                    onChange={(e) => setModalCobrar(prev => ({ ...prev, nota: e.target.value }))}
                    placeholder="Ej: Pago con tarjeta VISA terminado en 1234"
                    className="w-full bg-black/50 border border-white/10 focus:border-emerald-500/50 rounded-xl p-3 text-white text-xs placeholder:text-gray-600 outline-none transition-colors font-medium"
                  />
                </div>

                {/* Error si falló */}
                {modalCobrar.error && (
                  <div className="bg-red-500/15 border border-red-500/30 rounded-xl p-3 text-red-300 text-xs font-medium flex items-center gap-2">
                    <AlertCircle size={16} className="text-red-400 shrink-0" />
                    <span>{modalCobrar.error}</span>
                  </div>
                )}

                {/* Botón único "Pagado y entregado" (Requisito 8) */}
                <div className="flex items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    disabled={modalCobrar.guardando}
                    onClick={() => setModalCobrar(null)}
                    className="flex-1 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold transition-all cursor-pointer disabled:opacity-40"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={modalCobrar.guardando || modalCobrar.totalCobrar === '' || Number(modalCobrar.totalCobrar) < 0}
                    onClick={handleConfirmarCobro}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 active:scale-95 text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {modalCobrar.guardando ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Registrando cobro...</span>
                      </>
                    ) : (
                      <span>Pagado y entregado</span>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════ MODAL CUADRO DE DIÁLOGO: ELIMINAR CLIENTE (SOLO REN) ═══════ */}
      {modalEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#181d24] border border-red-500/30 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 shrink-0">
                <Trash2 size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Eliminar Cliente</h3>
                <p className="text-xs text-red-400/80 font-medium">Acción autorizada exclusivamente para el usuario Ren</p>
              </div>
            </div>

            <div className="bg-black/40 border border-white/5 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">Cliente:</span>
                <span className="font-bold text-white text-sm">{modalEliminar.pedido.nombre}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Pedido N°:</span>
                <span className="font-mono text-gray-200">{modalEliminar.pedido.numero_pedido}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Dirección:</span>
                <span className="text-gray-300 text-right truncate max-w-[220px]">
                  {modalEliminar.pedido.direccion}, {modalEliminar.pedido.localidad}
                </span>
              </div>
              {modalEliminar.pedido.telefono && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Teléfono:</span>
                  <span className="text-gray-300">{modalEliminar.pedido.telefono}</span>
                </div>
              )}
            </div>

            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-300 flex items-start gap-2">
              <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
              <p>¿Estás seguro de que querés eliminar a este cliente? Se quitará de la agenda de entregas y de los pedidos activos del sistema.</p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalEliminar(null)}
                className="flex-1 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!esRen) {
                    alert('Acceso denegado: Solo el usuario Ren puede realizar esta acción.');
                    setModalEliminar(null);
                    return;
                  }
                  const p = modalEliminar.pedido;
                  if (eliminarPedidoOCliente) {
                    eliminarPedidoOCliente(p.numero_pedido, p.sheetRowIndex, p.email || p.nombre);
                  }
                  setModalEliminar(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 active:scale-95 text-white text-xs font-bold transition-all cursor-pointer shadow-lg shadow-red-900/30 flex items-center justify-center gap-1.5"
              >
                <Trash2 size={14} />
                <span>Sí, Eliminar Cliente</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ MODAL CONFIRMACIÓN: REINICIAR PREPARACIÓN ═══════ */}
      {modalReiniciar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#111827] border border-rose-500/30 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <RotateCcw size={20} />
              </div>
              <div>
                <h3 className="text-white font-bold text-base">¿Reiniciar preparación?</h3>
                <p className="text-gray-400 text-xs font-mono">{modalReiniciar.numPedido} · {modalReiniciar.nombre}</p>
              </div>
            </div>

            <div className="bg-black/40 border border-white/5 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">Cliente:</span>
                <span className="font-bold text-white text-sm">{modalReiniciar.nombre}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Pedido N°:</span>
                <span className="font-mono text-gray-200">{modalReiniciar.numPedido}</span>
              </div>
            </div>

            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3.5 text-xs text-rose-300 flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-rose-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Se deshará la preparación de este pedido, las bolsas escaneadas volverán a sumarse al stock disponible y la tarjeta quedará en estado <span className="font-bold text-amber-300">Pendiente</span> para poder volver a prepararse.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalReiniciar(null)}
                className="flex-1 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  ejecutarReinicioPreparacion(modalReiniciar.numPedido);
                  setModalReiniciar(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 active:scale-95 text-white text-xs font-bold transition-all cursor-pointer shadow-lg shadow-rose-900/30 flex items-center justify-center gap-1.5"
              >
                <RotateCcw size={14} />
                <span>Sí, Reiniciar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ MODAL FULLSCREEN: ARMAR PEDIDO (2 COLUMNAS) ═══════ */}
      {modalPreparacion && (() => {
        const mp = modalPreparacion.pedido;
        const numPedido = mp.numero_pedido;
        const prep = preparaciones[numPedido];
        const items = prep?.items || [];
        const itemsActivos = items.filter(it => !it.sin_stock);
        const todosCompletos = itemsActivos.length > 0 && itemsActivos.every(it => (it.bolsasAsignadas?.length || 0) >= it.cantidad);
        const todosChequeados = items.length > 0 && items.every((it, idx) => it.sin_stock || !!checksPorPedido[numPedido]?.[idx]);
        const cantChequeados = items.filter((it, idx) => !it.sin_stock && !!checksPorPedido[numPedido]?.[idx]).length;

        // Aviso si el pedido fue pagado online y el total bajó por productos quitados
        const esPagoOnlineApproved = String(mp.estado_pago || '').toLowerCase() === 'approved';
        const totalOriginal = Math.round(Number(mp.total || 0));
        const totalActual = calcularTotalDetalle(mp, prep);
        const bajóTotal = totalActual < totalOriginal;
        const saldoAFavor = Math.max(0, totalOriginal - totalActual);

        // Feed de bolsas escaneadas en orden cronológico (todas las bolsas de todos los items)
        const feedBolsas = items
          .flatMap((item, itemIdx) =>
            (item.bolsasAsignadas || []).map((b, bIdx) => ({ ...b, itemNombre: item.nombre, itemIdx, bIdx }))
          )
          .sort((a, b) => (a.ts || 0) - (b.ts || 0));

        return (
          <div
            className="fixed inset-0 z-[60] flex flex-col bg-[#0a0f16]/98 backdrop-blur-xl animate-in fade-in duration-200"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            {/* ── HEADER ── */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#111827]/80 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                  <Package size={20} className="text-green-400" />
                </div>
                <div>
                  <h2 className="text-white font-black text-base tracking-tight">📦 Armando pedido de <span className="text-green-400">{mp.nombre}</span></h2>
                  <p className="text-gray-500 text-xs font-mono mt-0.5">{numPedido} · {mp.localidad} · {mp.horario_entrega}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {/* Progreso */}
                <div className="hidden sm:flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3 py-1.5">
                  <div className="flex gap-1">
                    {itemsActivos.map((item, i) => (
                      <div
                        key={i}
                        className={`w-2 h-2 rounded-full transition-all duration-300 ${
                          (item.bolsasAsignadas?.length || 0) >= item.cantidad
                            ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]'
                            : 'bg-gray-700'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-gray-400 text-xs font-mono">
                    {itemsActivos.filter(it => (it.bolsasAsignadas?.length || 0) >= it.cantidad).length}/{itemsActivos.length}
                  </span>
                </div>
                <button
                  onClick={cerrarModalPreparacion}
                  className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 flex items-center justify-center text-gray-400 hover:text-white transition-all cursor-pointer"
                  title="Cerrar sin guardar"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Aviso para el armador si el pedido fue pagado online y el total bajó */}
            {esPagoOnlineApproved && bajóTotal && (
              <div className="mx-6 mt-3 px-4 py-2.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs flex items-center justify-between shrink-0 animate-in slide-in-from-top-1">
                <span className="font-bold flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-400 shrink-0" />
                  El total bajó de ${totalOriginal.toLocaleString('es-AR')} a ${totalActual.toLocaleString('es-AR')}: queda saldo a favor de ${saldoAFavor.toLocaleString('es-AR')} para el cliente.
                </span>
                <span className="text-[10px] text-amber-300/80 bg-amber-500/20 px-2 py-0.5 rounded-lg border border-amber-500/30 font-mono">
                  Pago online aprobado
                </span>
              </div>
            )}

            {/* ── INPUT DE ESCANEO Y AVISOS ── */}
            <div className="px-6 py-3 bg-[#0d1117] border-b border-white/5 shrink-0">
              {/* Aviso de reserva si hubo productos no encontrados o error */}
              {avisoReserva && (
                <div className={`flex items-center gap-2 max-w-2xl mx-auto mb-2 px-3 py-2 rounded-xl border animate-in slide-in-from-top-1 duration-200 ${
                  avisoReserva.tipo === 'warning'
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    : 'bg-red-500/15 border-red-500/40 text-red-300'
                }`}>
                  <AlertTriangle size={14} className="shrink-0" />
                  <p className="text-xs font-bold leading-tight">{avisoReserva.mensaje}</p>
                </div>
              )}

              <div className="relative max-w-2xl mx-auto">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  <ScanBarcode size={18} className="text-green-400" />
                  {!todosCompletos && (
                    <div className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_2px_rgba(74,222,128,0.6)] animate-pulse" />
                  )}
                </div>
                <input
                  ref={modalScanInputRef}
                  type="text"
                  value={scanBuffer}
                  onChange={(e) => setScanBuffer(e.target.value)}
                  onKeyDown={handleScanKeyDown}
                  placeholder={todosCompletos ? '✅ Pedido completo — revisá el control y finalizá' : 'Escaneá la bolsa con la pistola...'}
                  disabled={todosCompletos}
                  className="w-full bg-black/60 border border-green-500/30 focus:border-green-500/60 text-white text-sm font-mono rounded-2xl pl-14 pr-4 py-3.5 outline-none transition-all placeholder:text-gray-600 focus:bg-black/80 focus:shadow-[0_0_30px_rgba(74,222,128,0.08)] disabled:opacity-50 disabled:cursor-not-allowed"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              {/* Error / Success feedback */}
              {scanError && (
                <div className="flex items-center gap-2 max-w-2xl mx-auto mt-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <AlertCircle size={13} className="text-red-400 shrink-0" />
                  <p className="text-red-400 text-xs font-bold">{scanError}</p>
                </div>
              )}
              {scanSuccess && !scanError && (
                <div className="flex items-center gap-2 max-w-2xl mx-auto mt-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-xl animate-in slide-in-from-top-1 duration-200">
                  <Check size={13} className="text-green-400 shrink-0" />
                  <p className="text-green-400 text-xs font-bold">{scanSuccess}</p>
                </div>
              )}
              {syncNotice && (
                <div className="flex items-center gap-2 max-w-2xl mx-auto mt-2 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl animate-in slide-in-from-top-1 duration-200">
                  <Clock size={13} className="text-blue-400 shrink-0" />
                  <p className="text-blue-400 text-xs font-mono">{syncNotice}</p>
                </div>
              )}
            </div>

            {/* ── CONTENIDO PRINCIPAL: DOS COLUMNAS O LISTA ── */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 overflow-hidden min-h-0">
              {/* COLUMNA 1: LISTA DE PRODUCTOS Y CHECKS */}
              <div className="flex flex-col border-r border-white/5 overflow-hidden">
                <div className="px-5 py-3 border-b border-white/5 bg-[#111827]/50 shrink-0 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">📋 Lista de Control del Pedido</p>
                    <p className="text-[10px] text-gray-500">Tildá cada producto para habilitar el cierre</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const allChecked = items.every((it, i) => it.sin_stock || !!checksPorPedido[numPedido]?.[i]);
                      setChecksPorPedido(prev => {
                        const pedChecks = {};
                        items.forEach((it, i) => { if (!it.sin_stock) pedChecks[i] = !allChecked; });
                        return { ...prev, [numPedido]: pedChecks };
                      });
                    }}
                    className="text-[11px] font-bold text-green-400 hover:text-green-300 transition-colors cursor-pointer"
                  >
                    {todosChequeados ? 'Desmarcar todos' : 'Marcar todos'}
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                  {items.length === 0 && (
                    <div className="text-center text-gray-600 text-xs italic py-8">Sin productos en el pedido</div>
                  )}
                  {items.map((item, idx) => {
                    const esSinStock = Boolean(item.sin_stock);
                    const bolsas = item.bolsasAsignadas || [];
                    const completo = !esSinStock && bolsas.length >= item.cantidad;
                    const parcial = !esSinStock && bolsas.length > 0 && !completo;
                    const esUnidad = item.esUnidad || item.slot === 'unidades';
                    const pesoReal = bolsas.reduce((s, b) => s + (Number(b.peso) || 0), 0);
                    const pesoPedido = item.pesoSolicitado ? item.pesoSolicitado * item.cantidad : null;
                    const diff = (!esUnidad && pesoPedido && pesoReal > 0) ? Math.round((pesoReal - pesoPedido) * 1000) / 1000 : null;
                    const isChecked = esSinStock ? true : !!checksPorPedido[numPedido]?.[idx];

                    return (
                      <div
                        key={idx}
                        className={`rounded-2xl border p-4 transition-all duration-300 ${
                          esSinStock
                            ? 'bg-red-950/20 border-red-900/30 opacity-75'
                            : isChecked
                            ? 'bg-green-500/10 border-green-500/40 shadow-[0_0_20px_rgba(34,197,94,0.08)]'
                            : completo
                            ? 'bg-green-500/5 border-green-500/20'
                            : parcial
                            ? 'bg-amber-500/5 border-amber-500/20'
                            : 'bg-white/[0.02] border-white/5'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            {/* Checkbox de control individual */}
                            {!esSinStock ? (
                              <button
                                type="button"
                                onClick={() => toggleCheckItem(numPedido, idx)}
                                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition-all cursor-pointer ${
                                  isChecked
                                    ? 'bg-green-500 text-white border-green-400 shadow-[0_0_12px_rgba(34,197,94,0.5)]'
                                    : 'bg-white/5 border-white/10 text-gray-500 hover:text-gray-300 hover:border-gray-500'
                                }`}
                                title={isChecked ? 'Controlado (clic para desmarcar)' : 'Marcar como controlado'}
                              >
                                {isChecked ? <Check size={18} /> : <Square size={16} />}
                              </button>
                            ) : (
                              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-red-500/10 border border-red-500/30 text-red-400" title="Producto quitado por falta de stock">
                                <X size={18} />
                              </div>
                            )}

                            <div>
                              <div className="flex items-center gap-2">
                                <p className={`text-sm font-bold uppercase tracking-wide transition-colors ${
                                  esSinStock ? 'text-red-400 line-through' : isChecked ? 'text-green-300' : completo ? 'text-white' : 'text-gray-400'
                                }`}>
                                  {item.nombre}
                                </p>
                                {esSinStock && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-red-600/30 text-red-300 border border-red-500/40">
                                    Sin stock
                                  </span>
                                )}
                                {item.esExtra && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                                    <Sparkles size={9} /> Extra
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-gray-400 font-mono mt-0.5">
                                {esSinStock ? (
                                  <span className="text-red-400/90 font-medium font-sans">
                                    🚫 Quitado por falta de stock (no se entrega ni se cobra)
                                  </span>
                                ) : (
                                  <>
                                    Solicitado: <span className="text-gray-300 font-bold">{item.cantidad} {esUnidad ? (item.cantidad === 1 ? 'unidad' : 'unidades') : (item.cantidad === 1 ? 'bolsa' : 'bolsas')}</span>
                                    {(!esUnidad && pesoPedido) ? ` · ${pesoPedido.toFixed(3)} kg` : ''}
                                    {obtenerPrecioCongelado(item.nombre) <= 0 && (
                                      <span className="ml-2 text-amber-400 font-sans font-semibold text-[10px] bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                                        ⚠️ Sin precio en catálogo
                                      </span>
                                    )}
                                  </>
                                )}
                              </p>
                              {/* Botón Quitar por Sin Stock */}
                              {!esSinStock && (
                                <button
                                  type="button"
                                  onClick={() => marcarItemSinStock(numPedido, idx, true)}
                                  className="mt-1 px-2 py-0.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-400 hover:text-red-300 text-[10px] font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                                  title="Quitar producto del pedido por falta de stock"
                                >
                                  <X size={11} />
                                  <span>Quitar (sin stock)</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Peso o cantidad armada + botón Deshacer si es sin_stock */}
                          <div className="text-right shrink-0">
                            {esSinStock ? (
                              <button
                                type="button"
                                onClick={() => marcarItemSinStock(numPedido, idx, false)}
                                className="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-bold border border-gray-700 hover:border-gray-600 transition-all cursor-pointer flex items-center gap-1"
                                title="Restaurar producto al pedido"
                              >
                                <RotateCcw size={12} />
                                <span>Deshacer</span>
                              </button>
                            ) : (esUnidad ? bolsas.length > 0 : pesoReal > 0) ? (
                              <>
                                <p className="text-green-400 font-mono text-sm font-bold">
                                  {esUnidad ? `${bolsas.length} ud${bolsas.length !== 1 ? 's' : ''}` : `${pesoReal.toFixed(3)} kg`}
                                </p>
                                {diff !== null && diff !== 0 && (
                                  <p className={`text-[11px] font-bold font-mono ${
                                    diff > 0 ? 'text-emerald-400' : 'text-red-400'
                                  }`}>
                                    {diff > 0 ? '+' : ''}{diff.toFixed(3)} kg
                                    {diff > 0 && <span className="ml-1 text-[9px] font-black text-emerald-500 uppercase tracking-wider">regalo</span>}
                                  </p>
                                )}
                              </>
                            ) : (
                              <span className="text-xs text-gray-600 italic">Sin pesar</span>
                            )}
                          </div>
                        </div>

                        {/* Sub-bolsas / unidades asignadas con botón de Etiqueta Térmica */}
                        {bolsas.length > 0 && (
                          <div className="mt-3 space-y-1.5 pl-12 border-t border-white/5 pt-2">
                            {bolsas.map((bolsa, bIdx) => (
                              <div key={bIdx} className="flex items-center justify-between text-[11px] bg-black/40 border border-white/5 rounded-xl px-3 py-1.5 group">
                                <div className="flex items-center gap-2">
                                  <span className="text-green-400 font-bold">✓</span>
                                  <span className="text-gray-300 font-mono">{bolsa.rawCode || bolsa.uniqueCode}</span>
                                  <span className="text-gray-500">—</span>
                                  <span className="text-green-400 font-bold font-mono">
                                    {bolsa.esUnidad ? '1 ud' : `${Number(bolsa.peso || 0).toFixed(3)} kg`}
                                  </span>
                                  {bolsa.tagId && <span className="text-gray-500 font-mono text-[10px]">[{bolsa.tagId}]</span>}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {/* Botón Imprimir Etiqueta de Bolsa (Requisito 5) */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const precioUnit = obtenerPrecioCongelado(item.nombre);
                                      imprimirEtiquetaBolsa({
                                        producto: item.nombre,
                                        pesoReal: bolsa.peso,
                                        precioUnitario: precioUnit,
                                        unidad: bolsa.esUnidad ? 'un' : 'kg',
                                        tagId: bolsa.tagId,
                                        uniqueCode: bolsa.uniqueCode,
                                        esUnidad: bolsa.esUnidad
                                      });
                                    }}
                                    className="text-gray-400 hover:text-green-400 hover:bg-green-500/10 p-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 text-[10px] font-bold"
                                    title="🏷️ Imprimir etiqueta térmica de bolsa"
                                  >
                                    <Tag size={12} />
                                    <span>Etiqueta</span>
                                  </button>

                                  <button
                                    onClick={() => quitarBolsaAsignada(numPedido, idx, bIdx)}
                                    className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 hover:bg-red-500/10 p-1 rounded-lg cursor-pointer transition-all"
                                    title="Quitar esta bolsa"
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── COL DERECHA: Feed de bolsas escaneadas en tiempo real ── */}
              <div className="flex flex-col overflow-hidden">
                <div className="px-5 py-3 border-b border-white/5 bg-[#111827]/50 shrink-0 flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">📡 Escaneado en tiempo real</p>
                  <span className="text-[10px] font-mono text-gray-400 bg-black/30 px-2 py-0.5 rounded-lg border border-white/5">
                    {feedBolsas.length} {feedBolsas.length === 1 ? 'ítem' : 'ítems'}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {feedBolsas.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-12">
                      <div className="w-16 h-16 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-center">
                        <ScanBarcode size={28} className="text-gray-700" />
                      </div>
                      <div>
                        <p className="text-gray-500 text-sm font-medium">Esperando escaneo...</p>
                        <p className="text-gray-600 text-xs mt-1">Apuntá la pistola al código de barras o balanza</p>
                      </div>
                    </div>
                  )}
                  {[...feedBolsas].reverse().map((bolsa, i) => (
                    <div
                      key={bolsa.uniqueCode || `${bolsa.itemNombre}_${i}`}
                      className={`rounded-2xl border p-3.5 transition-all group ${
                        i === 0
                          ? 'bg-green-500/10 border-green-500/30 shadow-[0_0_20px_rgba(34,197,94,0.08)] animate-in slide-in-from-top-2 duration-300'
                          : 'bg-white/[0.02] border-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            i === 0 ? 'bg-green-500/20 text-green-400' : 'bg-gray-800 text-gray-500'
                          }`}>
                            <Check size={14} />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className={`text-xs font-bold uppercase tracking-wide ${
                                i === 0 ? 'text-green-300' : 'text-gray-300'
                              }`}>
                                {bolsa.itemNombre}
                              </p>
                              {bolsa.esUnidad && (
                                <span className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                  Almacén
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-gray-500 font-mono">{bolsa.rawCode || bolsa.uniqueCode}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <p className={`font-mono text-sm font-bold ${
                              i === 0 ? 'text-green-400' : 'text-gray-300'
                            }`}>
                              {bolsa.esUnidad ? '1 ud' : `${Number(bolsa.peso || 0).toFixed(3)} kg`}
                            </p>
                            <p className="text-[9px] text-gray-600 font-mono">
                              #{feedBolsas.length - i}
                            </p>
                          </div>

                          {/* Botón Etiqueta Bolsa desde el feed */}
                          <button
                            type="button"
                            onClick={() => {
                              const precioUnit = obtenerPrecioCongelado(bolsa.itemNombre);
                              imprimirEtiquetaBolsa({
                                producto: bolsa.itemNombre,
                                pesoReal: bolsa.peso,
                                precioUnitario: precioUnit,
                                unidad: bolsa.esUnidad ? 'un' : 'kg',
                                tagId: bolsa.tagId,
                                uniqueCode: bolsa.uniqueCode,
                                esUnidad: bolsa.esUnidad
                              });
                            }}
                            className="w-7 h-7 rounded-lg bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 text-green-400 flex items-center justify-center transition-all cursor-pointer shrink-0"
                            title={`Imprimir etiqueta térmica para ${bolsa.itemNombre}`}
                          >
                            <Tag size={12} />
                          </button>

                          {/* Botón Deshacer bolsa individual */}
                          <button
                            onClick={() => quitarBolsaAsignada(numPedido, bolsa.itemIdx, bolsa.bIdx)}
                            className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-transparent hover:border-red-500/30 text-gray-500 hover:text-red-400 flex items-center justify-center transition-all cursor-pointer shrink-0"
                            title={`Deshacer: quitar ${bolsa.itemNombre} y devolver al stock`}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── FOOTER: Control de cierre y botones de acción (Requisito 4 y 6) ── */}
            <div className="px-6 py-4 border-t border-white/10 bg-[#111827]/90 shrink-0 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
                <button
                  onClick={() => cancelarRemito(numPedido)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 hover:text-red-300 text-xs font-bold transition-all cursor-pointer"
                >
                  <RotateCcw size={14} />
                  <span>Cancelar y salir</span>
                </button>

                <div className="text-xs">
                  {todosChequeados ? (
                    <span className="text-green-400 font-bold flex items-center gap-1.5">
                      <CheckCircle size={15} /> Lista de control completa ({itemsActivos.length}/{itemsActivos.length})
                    </span>
                  ) : (
                    <span className="text-amber-400 font-semibold flex items-center gap-1.5">
                      <AlertCircle size={15} /> Tildá la lista de control para habilitar ({cantChequeados}/{itemsActivos.length})
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                {/* Botón PEDIDO ARMADO (Requisito 4 y 6) */}
                <button
                  onClick={() => handlePedidoArmado(mp, numPedido)}
                  disabled={!todosChequeados || guardandoPedidoArmado}
                  className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 py-3 px-6 rounded-2xl font-black text-sm uppercase tracking-wide transition-all shadow-lg ${
                    todosChequeados && !guardandoPedidoArmado
                      ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white shadow-green-900/30 cursor-pointer active:scale-95'
                      : 'bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed opacity-60'
                  }`}
                  title={todosChequeados ? 'Congelar detalle, guardar pesadas y marcar como preparado' : 'Tildá todos los productos en la lista de control'}
                >
                  <CheckCircle size={18} />
                  <span>{guardandoPedidoArmado ? 'Guardando en Sheet...' : 'Pedido armado'}</span>
                </button>

                {/* Botón Imprimir remito */}
                <button
                  onClick={() => imprimirRemitoDesdeModal(mp, numPedido)}
                  disabled={!todosChequeados || guardandoPedidoArmado}
                  className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 py-3 px-5 rounded-2xl font-bold text-sm transition-all shadow-md ${
                    todosChequeados && !guardandoPedidoArmado
                      ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white cursor-pointer active:scale-95'
                      : 'bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed opacity-60'
                  }`}
                  title={todosChequeados ? 'Guarda el pedido armado e imprime el remito fiscal' : 'Tildá todos los productos en la lista de control'}
                >
                  <Printer size={16} />
                  <span>Imprimir remito</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══════ MODAL CONFIRMACIÓN: AGREGAR ÍTEM EXTRA AL PEDIDO ═══════ */}
      {modalItemExtra && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              confirmarAgregarItemExtra(modalItemExtra);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setModalItemExtra(null);
              setTimeout(() => modalScanInputRef.current?.focus(), 80);
            }
          }}
          tabIndex={-1}
        >
          <div className="bg-[#111827] border border-purple-500/40 rounded-3xl max-w-md w-full p-6 shadow-[0_0_50px_rgba(168,85,247,0.25)] space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center shrink-0">
                <Sparkles size={24} className="text-purple-400 animate-pulse" />
              </div>
              <div className="flex-1">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30 inline-block mb-1">
                  Ítem no figuraba en el pedido
                </span>
                <h3 className="text-lg font-black text-white tracking-tight">
                  ¿Agregar ítem extra?
                </h3>
                <p className="text-gray-400 text-xs mt-1">
                  Se escaneó un producto que no está en la lista pendiente del cliente. Podés sumarlo al pedido y se descontará del stock.
                </p>
              </div>
            </div>

            <div className="bg-black/40 border border-white/10 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 uppercase font-mono">Producto</span>
                <span className="text-sm font-bold text-white uppercase">{modalItemExtra.nombre}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 uppercase font-mono">Código</span>
                <span className="text-xs font-mono text-gray-400">{modalItemExtra.cleanCode}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 uppercase font-mono">Cantidad / Medida</span>
                <span className="text-sm font-bold font-mono text-purple-400">
                  {modalItemExtra.esUnidad ? '+1 unidad' : `+${modalItemExtra.peso?.toFixed(3) || 1} kg`}
                </span>
              </div>
              {modalItemExtra.esUnidad && (
                <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-gray-400">
                  <span>Descuento de stock:</span>
                  <span className="text-green-400 font-bold">-1 unidad</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setModalItemExtra(null);
                  setTimeout(() => modalScanInputRef.current?.focus(), 80);
                }}
                className="flex-1 py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white text-xs font-bold transition-all cursor-pointer"
              >
                Ignorar (Esc)
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => confirmarAgregarItemExtra(modalItemExtra)}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 border border-purple-500/50 text-white text-xs font-bold shadow-[0_0_20px_rgba(168,85,247,0.3)] transition-all active:scale-[0.98] cursor-pointer"
              >
                ✅ Sumar al pedido (Enter)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ MODAL POST-ARMADO: SACAR REMITO EN EL MOMENTO (REQUISITO 4) ═══════ */}
      {pedidoRecienArmado && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-[#1e232d] border border-green-500/40 rounded-3xl p-6 max-w-md w-full shadow-[0_0_50px_rgba(34,197,94,0.25)] text-center space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-green-500/20 text-green-400 rounded-2xl flex items-center justify-center mx-auto border border-green-500/30">
              <CheckCircle size={36} />
            </div>
            <div>
              <h3 className="text-lg font-black text-white">¡Pedido Armado con Éxito!</h3>
              <p className="text-gray-300 text-xs mt-1">
                Pedido <strong className="text-white">#{pedidoRecienArmado.numPedido}</strong> &middot; {pedidoRecienArmado.pedido.nombre || 'Cliente'}<br />
                Pesadas reales y precios congelados guardados correctamente.
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                autoFocus
                onClick={() => {
                  const { pedido, prep } = pedidoRecienArmado;
                  imprimirRemitoIndividual(pedido, prep);
                  if (pedido.sheetRowIndex) actualizarRemitoEnSheet(pedido.sheetRowIndex, true);
                  setPedidoRecienArmado(null);
                }}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold py-3.5 px-5 rounded-2xl transition-all shadow-lg shadow-indigo-900/40 active:scale-95 cursor-pointer text-sm"
              >
                <Printer size={18} />
                <span>Imprimir remito</span>
              </button>
              <button
                type="button"
                onClick={() => setPedidoRecienArmado(null)}
                className="w-full py-2.5 px-4 bg-gray-800/80 hover:bg-gray-700/80 text-gray-400 hover:text-white font-semibold rounded-xl text-xs transition-all border border-gray-700 cursor-pointer"
              >
                Continuar sin imprimir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ MODAL REGISTRAR REEMBOLSO DEVUELTO ═══════ */}
      <ModalReembolsoDevuelto
        abierto={modalReembolso.abierto}
        pedido={modalReembolso.pedido}
        onCerrar={() => setModalReembolso(prev => ({ ...prev, abierto: false, pedido: null, error: null }))}
        onConfirmar={handleConfirmarReembolsoDevuelto}
        guardando={modalReembolso.guardando}
        error={modalReembolso.error}
      />
    </div>
  );
}
