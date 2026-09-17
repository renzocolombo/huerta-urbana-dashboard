import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { MapPin, ChevronDown, ChevronUp, MessageCircle, AlertCircle, Package, CheckCircle, Sun, Sunset, Printer, FileText, User, Clock, ScanBarcode, X, Trash2, Check, RotateCcw, Lock, AlertTriangle } from 'lucide-react';
import { HOY } from '../data/mockData';
import { imprimirRemitoIndividual, imprimirRemitosEnLote, parsearProductosPedido } from '../utils/remitoPrinter';

const DIAS_SEMANA = ['Martes', 'Jueves'];
const $$ = (n) => `$${Number(n).toLocaleString('es-AR')}`;

const PAGO_CONFIG = {
  pagado:   { label: 'Pagado',    color: 'text-green-400' },
  pendiente: { label: 'Pendiente', color: 'text-red-400' },
  sin_pago:  { label: 'Sin pago',  color: 'text-gray-500' },
};

const PREPARACIONES_KEY = 'huerta_preparaciones_v1';
const PROCESSED_CODES_KEY = 'huerta_codigos_procesados_v1';
const MOTIVOS_KEY = 'huerta_motivos_no_entrega_v1';

const MOTIVOS_PREDEFINIDOS = [
  { label: 'Cliente ausente / No atiende', icon: '🚪' },
  { label: 'Dirección errónea o incompleta', icon: '📍' },
  { label: 'Cliente rechazó el pedido', icon: '🛑' },
  { label: 'Cliente pidió reprogramar entrega', icon: '🗓️' },
  { label: 'Problema de tránsito / acceso / clima', icon: '🌧️' },
  { label: 'Teléfono apagado / Sin respuesta', icon: '📵' },
];

// ── Normalizar texto para matcheo fuzzy ────────────────────────────────────
const norm = (s) => (s || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// ── Parsear código de barras ────────────────────────────────────────────────
function parsearCodigoBarras(raw) {
  if (!raw) return null;
  let code = String(raw).replace(/[\r\n\x00-\x1F]/g, '').trim().replace(/^\][a-zA-Z0-9]{2,3}/, '').trim();
  code = code.replace(/^\*+|\*+$/g, '').trim();
  if (!code) return null;

  const eanBalanza = code.match(/^(20|02)(\d{4,5})(\d{5})\d$/);
  if (eanBalanza) {
    const plu = eanBalanza[2]; const gramos = parseInt(eanBalanza[3], 10);
    return { nombre: `plu ${plu}`, plu, peso: Math.round((gramos / 1000) * 1000) / 1000, tagId: null, uniqueCode: code.toUpperCase(), rawCode: code, origenBalanza: true };
  }

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

export default function AgendaEntregas({ rol, usuario }) {
  const { pedidos: PEDIDOS, actualizarEstadoEnSheet, actualizarRemitoEnSheet, eliminarPedidoOCliente, stockData, setStockData } = useGoogleSheets();

  const esRen = (usuario || localStorage.getItem('huerta_auth_usuario') || '').trim().toLowerCase() === 'ren';

  const [diaSeleccionado, setDiaSeleccionado] = useState(DIAS_SEMANA[0]);
  const [turnoSeleccionado, setTurnoSeleccionado] = useState('Manana');

  // ── Filtrado ───────────────────────────────────────────────────────────────
  const pedidosDelDia = useMemo(() => {
    return (PEDIDOS || []).filter(p => p.dia_entrega === diaSeleccionado && (p.estado_pago || '').toLowerCase() === 'approved');
  }, [PEDIDOS, diaSeleccionado]);

  const pedidosDelTurno = useMemo(() => {
    return pedidosDelDia.filter(p => {
      const horaInicio = parseInt((p.horario_entrega || '09:00').split(':')[0], 10);
      const isManana = isNaN(horaInicio) || horaInicio < 13;
      return (turnoSeleccionado === 'Manana' && isManana) || (turnoSeleccionado === 'Tarde' && !isManana);
    });
  }, [pedidosDelDia, turnoSeleccionado]);

  const [estados, setEstados] = useState(() => {
    const map = {};
    (PEDIDOS || []).forEach(p => { map[p.numero_pedido] = p.estado; });
    return map;
  });
  const [pedidosAbiertos, setPedidosAbiertos] = useState({});

  // ── Motivos de No Entrega ──────────────────────────────────────────────────
  const [motivosNoEntrega, setMotivosNoEntrega] = useState(() => {
    try {
      const s = localStorage.getItem(MOTIVOS_KEY);
      return s ? JSON.parse(s) : {};
    } catch (e) {
      return {};
    }
  });

  const guardarMotivo = (numPedido, motivo) => {
    setMotivosNoEntrega(prev => {
      const updated = { ...prev, [numPedido]: motivo };
      try { localStorage.setItem(MOTIVOS_KEY, JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  };

  // Modales
  const [modalNoEntrega, setModalNoEntrega] = useState(null); // { pedido, motivoTexto }
  const [modalEliminar, setModalEliminar] = useState(null);   // { pedido }

  const abrirModalNoEntrega = (p) => {
    const motivoExistente = motivosNoEntrega[p.numero_pedido] || p.motivo_no_entrega || '';
    setModalNoEntrega({
      pedido: p,
      motivoTexto: motivoExistente,
    });
  };

  // ── Preparación de pedidos ─────────────────────────────────────────────────
  const [preparaciones, setPreparaciones] = useState(() => {
    try { const s = localStorage.getItem(PREPARACIONES_KEY); return s ? JSON.parse(s) : {}; } catch (e) { return {}; }
  });
  const [preparandoPedido, setPreparandoPedido] = useState(null);
  const [modalPreparacion, setModalPreparacion] = useState(null); // { pedido }
  const [scanBuffer, setScanBuffer] = useState('');
  const [scanError, setScanError] = useState(null);
  const [scanSuccess, setScanSuccess] = useState(null);
  const scanInputRef = useRef(null);
  const modalScanInputRef = useRef(null);
  const stockDataRef = useRef(stockData);

  useEffect(() => { stockDataRef.current = stockData; }, [stockData]);
  useEffect(() => { try { localStorage.setItem(PREPARACIONES_KEY, JSON.stringify(preparaciones)); } catch (e) {} }, [preparaciones]);

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

  const abrirWhatsApp = (telefono, nombre) => {
    const primerNombre = (nombre || '').split(' ')[0] || 'Cliente';
    const texto = `Hola ${primerNombre}! %F0%9F%91%8B ¿Cómo estás? Te escribimos desde Huerta Urbana %F0%9F%A5%A6`;
    const url = `https://web.whatsapp.com/send?phone=${(telefono || '').replace(/\D/g, '')}&text=${texto}`;
    window.open(url, '_blank');
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
    if (!preparaciones[numPedido]) {
      const items = parsearProductosPedido(pedido.producto, pedido.cantidades);
      setPreparaciones(prev => ({ ...prev, [numPedido]: { items, completado: false, fechaInicio: new Date().toISOString() } }));
    }
    setPreparandoPedido(numPedido);
    setPedidosAbiertos(prev => ({ ...prev, [numPedido]: true }));
    setScanError(null);
    setScanSuccess(null);
    setModalPreparacion({ pedido });
    setTimeout(() => modalScanInputRef.current?.focus(), 150);
  }, [preparaciones]);

  // ── ESCANEAR BOLSA ─────────────────────────────────────────────────────────
  const procesarEscaneoPedido = useCallback((rawCode) => {
    if (!rawCode || !preparandoPedido) return;
    setScanError(null); setScanSuccess(null);
    
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
      matchedStockId = Object.keys(current).find(id => {
        const pNorm = norm(current[id]?.nombre);
        return pNorm === nombreEscaneado || pNorm.includes(nombreEscaneado) || nombreEscaneado.includes(pNorm);
      });
      matchedProd = matchedStockId ? current[matchedStockId] : null;
    }

    if (!prepActual) return;
    
    let matchedItemIdx = -1;
    for (let i = 0; i < prepActual.items.length; i++) {
      const itemNorm = norm(prepActual.items[i].nombre);
      const prodNorm = matchedProd ? norm(matchedProd.nombre) : nombreEscaneado;
      if (itemNorm === prodNorm || itemNorm.includes(prodNorm) || prodNorm.includes(itemNorm) ||
          itemNorm === nombreEscaneado || itemNorm.includes(nombreEscaneado) || nombreEscaneado.includes(itemNorm)) {
        const asignadas = prepActual.items[i].bolsasAsignadas?.length || 0;
        if (asignadas < prepActual.items[i].cantidad) { matchedItemIdx = i; break; }
      }
    }
    
    if (matchedItemIdx === -1) {
      setScanError(`⚠️ "${resultado.nombre}" no coincide con ningún producto pendiente del pedido.`);
      return;
    }
    
    // Descontar del stock
    if (matchedProd && matchedStockId) {
      const tipo = matchedProd.tipo || getTipoByNombre(matchedProd.nombre);
      const slot = determinarSlot(tipo, resultado.peso || 0.5);
      const stockActual = matchedProd.stock?.[slot] || 0;
      if (stockActual <= 0) { setScanError(`🚫 ¡Sin stock! No hay "${matchedProd.nombre}" (${slot}) disponible.`); return; }
      const newData = { ...current };
      newData[matchedStockId] = { ...matchedProd, stock: { ...matchedProd.stock, [slot]: stockActual - 1 } };
      setStockData(newData);
    }
    
    const now = new Date();
    const horaStr = now.toLocaleDateString('es-AR') + ' ' + now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    setCodigosProcesados(prev => ({ ...prev, [uniqueCode]: { uniqueCode, nombre: resultado.nombre, matchedId: matchedStockId, peso: resultado.peso, estado: 'SACADO', bloqueado: false, fechaModificacion: horaStr, ultimaAccion: `Asignado a pedido ${preparandoPedido}`, ts: Date.now() } }));
    
    const nuevaBolsa = { uniqueCode, nombre: resultado.nombre, peso: resultado.peso, tagId: resultado.tagId, ts: Date.now() };
    
    setPreparaciones(prev => {
      const prep = { ...prev[preparandoPedido] };
      const items = [...prep.items];
      items[matchedItemIdx] = { ...items[matchedItemIdx], bolsasAsignadas: [...(items[matchedItemIdx].bolsasAsignadas || []), nuevaBolsa] };
      const todosCompletos = items.every(it => (it.bolsasAsignadas?.length || 0) >= it.cantidad);
      return { ...prev, [preparandoPedido]: { ...prep, items, completado: todosCompletos } };
    });
    
    setScanSuccess(`✅ ${resultado.nombre.toUpperCase()} — ${resultado.peso?.toFixed(3) || '?'} kg asignado`);
    setTimeout(() => setScanSuccess(null), 2500);
    setTimeout(() => scanInputRef.current?.focus(), 50);
  }, [preparandoPedido, preparaciones, setStockData]);

  const marcarPreparado = useCallback((numPedido) => {
    actualizarEstado(numPedido, 'Preparado');
    setPreparaciones(prev => ({ ...prev, [numPedido]: { ...prev[numPedido], completado: true, fechaFin: new Date().toISOString() } }));
    setPreparandoPedido(null);
  }, []);

  const cargarRemito = useCallback((numPedido) => {
    marcarPreparado(numPedido);
    setModalPreparacion(null);
    setScanError(null);
    setScanSuccess(null);
  }, [marcarPreparado]);

  const quitarBolsaAsignada = useCallback((numPedido, itemIdx, bolsaIdx) => {
    setPreparaciones(prev => {
      const prep = { ...prev[numPedido] };
      const items = [...prep.items];
      items[itemIdx] = { ...items[itemIdx], bolsasAsignadas: items[itemIdx].bolsasAsignadas.filter((_, i) => i !== bolsaIdx) };
      const todosCompletos = items.every(it => (it.bolsasAsignadas?.length || 0) >= it.cantidad);
      return { ...prev, [numPedido]: { ...prep, items, completado: todosCompletos } };
    });
  }, []);

  const resetearPreparacion = useCallback((numPedido) => {
    if (!window.confirm('¿Deshacer toda la preparación de este pedido?')) return;
    setPreparaciones(prev => { const { [numPedido]: _, ...rest } = prev; return rest; });
    setPreparandoPedido(null);
    actualizarEstado(numPedido, 'Pendiente');
  }, []);

  // ── IMPRIMIR REMITOS (INDIVIDUAL O LOTE UNIFICADO) ─────────────────────────
  const imprimirRemitoConPesoReal = useCallback((p, opciones = {}) => {
    const prep = preparaciones[p.numero_pedido];
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
    const titulo = alcance === 'turno'
      ? `Remitos Turno ${turnoSeleccionado === 'Manana' ? 'Mañana' : 'Tarde'} · ${diaSeleccionado}`
      : `Remitos Día Completo · ${diaSeleccionado}`;

    imprimirRemitosEnLote(aImprimir, preparaciones, titulo, opciones);

    // Marcar como impresos en sheet si corresponde
    aImprimir.forEach(p => {
      if (p.sheetRowIndex) actualizarRemitoEnSheet(p.sheetRowIndex, true);
    });
  }, [rol, pedidosDelTurno, pedidosDelDia, turnoSeleccionado, diaSeleccionado, preparaciones, actualizarRemitoEnSheet]);

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
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Agenda de Entregas</h2>
          <p className="text-gray-500 text-sm mt-1">Preparación con escaneo, remitos con peso real y estados.</p>
        </div>
        {rol !== 'repartidor' && (
          <div className="flex flex-col sm:flex-row gap-2">
            <button 
              onClick={() => imprimir('turno')} 
              className="flex items-center justify-center gap-2 bg-[#1f2937] hover:bg-gray-800 border border-gray-700 hover:border-gray-500 text-white text-sm font-medium px-4 py-2 rounded-xl transition-all shadow-sm"
              title="Imprime todos los remitos del turno en una sola ventana consolidada"
            >
              <Printer size={15} className="text-amber-400" />
              <span>Imprimir este turno ({pedidosDelTurno.length})</span>
            </button>
            <button 
              onClick={() => imprimir('dia')} 
              className="flex items-center justify-center gap-2 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 font-medium px-4 py-2 rounded-xl text-sm transition-all shadow-sm"
              title="Imprime todos los remitos del día completo en una sola ventana consolidada"
            >
              <FileText size={15} className="text-green-400" />
              <span>Imprimir todo el día ({pedidosDelDia.length})</span>
            </button>
          </div>
        )}
      </div>

      {/* Tabs Días */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {DIAS_SEMANA.map(dia => (
          <button key={dia} onClick={() => { setDiaSeleccionado(dia); setPedidosAbiertos({}); setPreparandoPedido(null); }}
            className={`whitespace-nowrap px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${diaSeleccionado === dia ? 'bg-green-500 text-white shadow-[0_4px_15px_rgba(34,197,94,0.3)]' : 'bg-[#1f2937] border border-gray-800 text-gray-400 hover:text-white hover:border-gray-600'}`}>
            {dia}
          </button>
        ))}
      </div>

      {/* Tabs Turnos */}
      <div className="flex gap-2 mb-6 bg-[#1f2937]/50 p-1.5 rounded-2xl w-fit">
        <button onClick={() => setTurnoSeleccionado('Manana')} className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all ${turnoSeleccionado === 'Manana' ? 'bg-[#111827] text-amber-400 border border-gray-700 shadow-md' : 'text-gray-500 hover:text-gray-300'}`}>
          <Sun size={16} /> Turno Mañana (8-12 hs)
        </button>
        <button onClick={() => setTurnoSeleccionado('Tarde')} className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all ${turnoSeleccionado === 'Tarde' ? 'bg-[#111827] text-indigo-400 border border-gray-700 shadow-md' : 'text-gray-500 hover:text-gray-300'}`}>
          <Sunset size={16} /> Turno Tarde (14-18 hs)
        </button>
      </div>

      {/* Contador y ruta */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <span className="text-sm font-medium text-white bg-gray-800 px-3 py-1 rounded-lg border border-gray-700 w-fit">{pedidosDelTurno.length} pedidos</span>
        {pedidosDelTurno.length > 0 && (
          <button onClick={abrirRutaGoogle} className="flex items-center gap-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 font-bold px-4 py-2 rounded-xl text-sm transition-all hover:scale-[1.02] shadow-[0_0_15px_rgba(99,102,241,0.1)] shrink-0">
            🗺️ Abrir ruta del turno
          </button>
        )}
      </div>

      {pedidosDelTurno.length === 0 ? (
        <div className="bg-[#1f2937] border border-gray-800 rounded-2xl p-12 text-center">
          <MapPin size={32} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500">No hay entregas asignadas a este turno.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pedidosDelTurno.map(p => {
            const isOpen = !!pedidosAbiertos[p.numero_pedido];
            const estadoActual = (estados[p.numero_pedido] || p.estado || 'pendiente').toLowerCase();
            const prep = preparaciones[p.numero_pedido];
            const estaPreparando = preparandoPedido === p.numero_pedido;
            const todosCompletos = prep?.completado || false;
            const tieneBolsas = prep?.items?.some(it => it.bolsasAsignadas?.length > 0);

            const configEstado = {
              'pendiente':    { icon: '⏳', label: 'PENDIENTE',    color: 'text-amber-400', bg: 'bg-amber-500/5',  border: 'border-amber-500/10' },
              'preparado':    { icon: '✅', label: 'PREPARADO',    color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
              'listo':        { icon: '✅', label: 'PREPARADO',    color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
              'entregado':    { icon: '🚚', label: 'ENTREGADO',    color: 'text-blue-400',  bg: 'bg-blue-500/10',  border: 'border-blue-500/20' },
              'no_entregado': { icon: '❌', label: 'NO ENTREGADO', color: 'text-red-400',   bg: 'bg-red-500/10',   border: 'border-red-500/20' },
              'no entregado': { icon: '❌', label: 'NO ENTREGADO', color: 'text-red-400',   bg: 'bg-red-500/10',   border: 'border-red-500/20' },
            };
            const conf = configEstado[estadoActual] || configEstado.pendiente;

            return (
              <div key={p.numero_pedido} className={`transition-all duration-300 rounded-2xl overflow-hidden border ${conf.bg} ${estaPreparando ? 'ring-2 ring-green-500/60 shadow-[0_0_30px_rgba(34,197,94,0.15)]' : isOpen ? 'ring-1 ring-white/10' : conf.border}`}>
                
                {/* Cabecera */}
                <div className="px-4 pr-5 py-4 flex items-center justify-between cursor-pointer hover:bg-white/5" onClick={() => toggleAcordeon(p.numero_pedido)}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-black/40 rounded-xl flex items-center justify-center border border-white/10 text-lg">{conf.icon}</div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-sm text-white">{p.nombre}</p>
                        <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded border ${conf.color} ${conf.border} bg-black/20`}>{conf.label}</span>
                        {prep && tieneBolsas && !todosCompletos && (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">EN PREPARACIÓN</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[11px] text-gray-500 flex items-center gap-0.5"><MapPin size={10} /> {p.localidad}</span>
                        <span className="text-[11px] text-gray-500 flex items-center gap-0.5"><Clock size={10} /> {p.horario_entrega}</span>
                        <span className="text-[11px] text-gray-500 font-mono truncate max-w-[200px]">{p.producto}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
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
                  <div className="px-5 pb-5 pt-2 border-t border-white/5 bg-black/20 slide-in space-y-5">
                    
                    {/* Info del pedido */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
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
                                "{motivosNoEntrega[p.numero_pedido] || p.motivo_no_entrega || 'Sin motivo especificado'}"
                              </p>
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
                          {rol !== 'repartidor' && (
                            <button 
                              type="button"
                              onClick={() => imprimirRemitoConPesoReal(p)} 
                              className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-sm font-bold px-4 py-3 rounded-xl transition-all shadow-md shadow-indigo-900/30 cursor-pointer"
                              title="Imprimir remito con toda la información actual del pedido"
                            >
                              <Printer size={18} /> 🖨️ Imprimir Remito
                            </button>
                          )}
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
                                <span className={`font-bold ${PAGO_CONFIG[p.estado_pago]?.color}`}>{(PAGO_CONFIG[p.estado_pago]?.label || '').toUpperCase()}</span>
                              </div>
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
                            <button onClick={() => resetearPreparacion(p.numero_pedido)} className="text-[10px] text-gray-500 hover:text-red-400 flex items-center gap-1 cursor-pointer transition-colors">
                              <RotateCcw size={11} /> Reiniciar
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
                              <button onClick={() => actualizarEstado(p.numero_pedido, 'Pendiente')} className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-[10px] font-bold transition-all cursor-pointer ${estadoActual === 'pendiente' ? 'bg-amber-500/20 border-amber-500/30 text-amber-400' : 'bg-white/5 border-white/5 text-gray-500 hover:text-amber-400'}`}>
                                <span>⏳</span> Pendiente
                              </button>
                              <button onClick={() => actualizarEstado(p.numero_pedido, estadoActual === 'entregado' ? 'Preparado' : 'Entregado')} className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-[10px] font-bold transition-all cursor-pointer ${estadoActual === 'entregado' ? 'bg-blue-500/20 border-blue-500/30 text-blue-400' : 'bg-white/5 border-white/5 text-gray-500 hover:text-blue-400'}`}>
                                <span>🚚</span> Entregado
                              </button>
                              <button onClick={() => abrirModalNoEntrega(p)} className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-[10px] font-bold transition-all cursor-pointer ${(estadoActual === 'no_entregado' || estadoActual === 'no entregado') ? 'bg-red-500/20 border-red-500/30 text-red-400' : 'bg-white/5 border-white/5 text-gray-500 hover:text-red-400'}`}>
                                <span>❌</span> No entregado
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Botonera legado (sin preparación en memoria) */}
                        {!prep && !estaPreparando && estadoActual !== 'pendiente' && (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <button onClick={() => rol !== 'repartidor' ? actualizarEstado(p.numero_pedido, 'Pendiente') : null} className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-4 rounded-2xl border font-black text-[11px] transition-all active:scale-95 ${estadoActual === 'pendiente' ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'bg-amber-500/5 border-amber-500/10 text-amber-400 hover:bg-amber-500/10'} ${rol === 'repartidor' ? 'opacity-50 cursor-default' : 'cursor-pointer hover:scale-[1.02]'}`}>
                              <span className="text-xl">⏳</span> PENDIENTE
                            </button>
                            <button onClick={() => rol !== 'repartidor' ? actualizarEstado(p.numero_pedido, 'Preparado') : null} className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-4 rounded-2xl border font-black text-[11px] transition-all active:scale-95 ${(estadoActual === 'preparado' || estadoActual === 'listo') ? 'bg-green-500/20 border-green-500/40 text-green-400' : 'bg-green-500/5 border-green-500/10 text-green-500 hover:bg-green-500/10'} ${rol === 'repartidor' ? 'opacity-50 cursor-default' : 'cursor-pointer hover:scale-[1.02]'}`}>
                              <span className="text-xl">✅</span> PREPARADO
                            </button>
                            <button onClick={() => actualizarEstado(p.numero_pedido, estadoActual === 'entregado' ? 'Preparado' : 'Entregado')} className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-4 rounded-2xl border font-black text-[11px] transition-all active:scale-95 cursor-pointer hover:scale-[1.02] ${estadoActual === 'entregado' ? 'bg-blue-500/20 border-blue-500/40 text-blue-400' : 'bg-blue-500/5 border-blue-500/10 text-blue-500 hover:bg-blue-500/10'}`}>
                              <span className="text-xl">🚚</span> ENTREGADO
                            </button>
                            <button onClick={() => abrirModalNoEntrega(p)} className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-4 rounded-2xl border font-black text-[11px] transition-all active:scale-95 cursor-pointer hover:scale-[1.02] ${(estadoActual === 'no_entregado' || estadoActual === 'no entregado') ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'bg-red-500/5 border-red-500/10 text-red-500 hover:bg-red-500/10'}`}>
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
                          <button onClick={() => actualizarEstado(p.numero_pedido, estadoActual === 'entregado' ? 'Preparado' : 'Entregado')} className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-4 rounded-2xl border font-black text-[11px] transition-all active:scale-95 cursor-pointer hover:scale-[1.02] ${estadoActual === 'entregado' ? 'bg-blue-500/20 border-blue-500/40 text-blue-400' : 'bg-blue-500/5 border-blue-500/10 text-blue-500 hover:bg-blue-500/10'}`}><span className="text-xl">🚚</span> ENTREGADO</button>
                          <button onClick={() => abrirModalNoEntrega(p)} className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-4 rounded-2xl border font-black text-[11px] transition-all active:scale-95 cursor-pointer hover:scale-[1.02] ${(estadoActual === 'no_entregado' || estadoActual === 'no entregado') ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'bg-red-500/5 border-red-500/10 text-red-500 hover:bg-red-500/10'}`}><span className="text-xl">❌</span> NO ENTREGADO</button>
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
            );
          })}
        </div>
      )}

      {/* ═══════ MODAL CUADRO DE DIÁLOGO: PEDIDO NO ENTREGADO ═══════ */}
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
                onClick={() => setModalNoEntrega(null)} 
                className="text-gray-500 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-gray-400 mb-2">
                Seleccioná un motivo rápido:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {MOTIVOS_PREDEFINIDOS.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setModalNoEntrega(prev => ({ ...prev, motivoTexto: item.label }))}
                    className={`text-left text-xs p-2.5 rounded-xl border transition-all flex items-center gap-2 cursor-pointer ${
                      modalNoEntrega.motivoTexto === item.label
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

            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-gray-400 mb-1.5">
                Detalle / Aclaración del motivo:
              </label>
              <textarea
                rows={3}
                value={modalNoEntrega.motivoTexto}
                onChange={(e) => setModalNoEntrega(prev => ({ ...prev, motivoTexto: e.target.value }))}
                placeholder="Escribí aquí por qué no se entregó el pedido..."
                className="w-full bg-black/50 border border-white/10 focus:border-red-500/50 rounded-xl p-3 text-white text-xs placeholder:text-gray-600 outline-none resize-none transition-colors font-medium"
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModalNoEntrega(null)}
                className="flex-1 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const motivoFinal = (modalNoEntrega.motivoTexto || '').trim() || 'Sin motivo especificado';
                  guardarMotivo(modalNoEntrega.pedido.numero_pedido, motivoFinal);
                  actualizarEstado(modalNoEntrega.pedido.numero_pedido, 'No entregado', motivoFinal);
                  setModalNoEntrega(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 active:scale-95 text-white text-xs font-bold transition-all cursor-pointer shadow-lg shadow-red-900/30 flex items-center justify-center gap-1.5"
              >
                <span>Guardar y Marcar No Entregado</span>
              </button>
            </div>
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

      {/* ═══════ MODAL FULLSCREEN: ARMAR PEDIDO (2 COLUMNAS) ═══════ */}
      {modalPreparacion && (() => {
        const mp = modalPreparacion.pedido;
        const numPedido = mp.numero_pedido;
        const prep = preparaciones[numPedido];
        const todosCompletos = prep?.completado || false;
        const items = prep?.items || [];

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
                    {items.map((item, i) => (
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
                    {items.filter(it => (it.bolsasAsignadas?.length || 0) >= it.cantidad).length}/{items.length}
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

            {/* ── INPUT DE ESCANEO ── */}
            <div className="px-6 py-3 bg-[#0d1117] border-b border-white/5 shrink-0">
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
                  placeholder={todosCompletos ? '✅ Pedido completo — presioná "Cargar remito"' : 'Escaneá la bolsa con la pistola...'}
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
            </div>

            {/* ── CUERPO 2 COLUMNAS ── */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-0 overflow-hidden">

              {/* ── COL IZQUIERDA: Lista del Pedido ── */}
              <div className="flex flex-col border-r border-white/5 overflow-hidden">
                <div className="px-5 py-3 border-b border-white/5 bg-[#111827]/50 shrink-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">📋 Lista del Pedido</p>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {items.length === 0 && (
                    <div className="text-center text-gray-600 text-xs italic py-8">Sin productos en el pedido</div>
                  )}
                  {items.map((item, idx) => {
                    const bolsas = item.bolsasAsignadas || [];
                    const completo = bolsas.length >= item.cantidad;
                    const parcial = bolsas.length > 0 && !completo;
                    const pesoReal = bolsas.reduce((s, b) => s + (b.peso || 0), 0);
                    const pesoPedido = item.pesoSolicitado ? item.pesoSolicitado * item.cantidad : null;
                    const diff = (pesoPedido && pesoReal > 0) ? Math.round((pesoReal - pesoPedido) * 1000) / 1000 : null;

                    return (
                      <div
                        key={idx}
                        className={`rounded-2xl border p-4 transition-all duration-500 ${
                          completo
                            ? 'bg-green-500/8 border-green-500/25 shadow-[0_0_20px_rgba(34,197,94,0.06)]'
                            : parcial
                            ? 'bg-amber-500/5 border-amber-500/20'
                            : 'bg-white/[0.02] border-white/5'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {/* Indicador visual */}
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shrink-0 transition-all duration-300 ${
                              completo
                                ? 'bg-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.4)]'
                                : parcial
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : 'bg-gray-800 text-gray-500 border border-gray-700'
                            }`}>
                              {completo ? <Check size={16} /> : `${bolsas.length}/${item.cantidad}`}
                            </div>
                            <div>
                              <p className={`text-sm font-bold uppercase tracking-wide transition-colors duration-300 ${
                                completo ? 'text-green-300' : parcial ? 'text-amber-300' : 'text-gray-400'
                              }`}>
                                {item.nombre}
                              </p>
                              <p className="text-[11px] text-gray-600 font-mono mt-0.5">
                                {item.cantidad} {item.cantidad === 1 ? 'bolsa' : 'bolsas'}
                                {pesoPedido ? ` · Pedido: ${pesoPedido.toFixed(3)} kg` : ''}
                              </p>
                            </div>
                          </div>
                          {/* Peso real + diferencia */}
                          {pesoReal > 0 && (
                            <div className="text-right shrink-0">
                              <p className="text-green-400 font-mono text-sm font-bold">{pesoReal.toFixed(3)} kg</p>
                              {diff !== null && diff !== 0 && (
                                <p className={`text-[11px] font-bold font-mono ${
                                  diff > 0 ? 'text-emerald-400' : 'text-red-400'
                                }`}>
                                  {diff > 0 ? '+' : ''}{diff.toFixed(3)} kg
                                  {diff > 0 && <span className="ml-1 text-[9px] font-black text-emerald-500 uppercase tracking-wider">regalo</span>}
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Sub-bolsas asignadas */}
                        {bolsas.length > 0 && (
                          <div className="mt-3 space-y-1 pl-11">
                            {bolsas.map((bolsa, bIdx) => (
                              <div key={bIdx} className="flex items-center justify-between text-[10px] bg-black/30 rounded-lg px-2.5 py-1.5 group">
                                <div className="flex items-center gap-2">
                                  <span className="text-green-400">✓</span>
                                  <span className="text-gray-400 font-mono">{bolsa.uniqueCode}</span>
                                  <span className="text-green-400 font-bold font-mono">{bolsa.peso?.toFixed(3)} kg</span>
                                </div>
                                <button
                                  onClick={() => quitarBolsaAsignada(numPedido, idx, bIdx)}
                                  className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 cursor-pointer transition-all p-0.5"
                                  title="Quitar bolsa"
                                >
                                  <X size={11} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── COL DERECHA: Feed de bolsas escaneadas ── */}
              <div className="flex flex-col overflow-hidden">
                <div className="px-5 py-3 border-b border-white/5 bg-[#111827]/50 shrink-0 flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">📡 Escaneado en tiempo real</p>
                  <span className="text-[10px] font-mono text-gray-600 bg-black/30 px-2 py-0.5 rounded-lg border border-white/5">
                    {feedBolsas.length} bolsa{feedBolsas.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {feedBolsas.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-12">
                      <div className="w-16 h-16 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-center">
                        <ScanBarcode size={28} className="text-gray-700" />
                      </div>
                      <div>
                        <p className="text-gray-600 text-sm font-medium">Esperando escaneo...</p>
                        <p className="text-gray-700 text-xs mt-1">Apuntá la pistola al código de barras de la bolsa</p>
                      </div>
                    </div>
                  )}
                  {[...feedBolsas].reverse().map((bolsa, i) => (
                    <div
                      key={bolsa.uniqueCode}
                      className={`rounded-2xl border p-3.5 transition-all ${
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
                            <p className={`text-xs font-bold uppercase tracking-wide ${
                              i === 0 ? 'text-green-300' : 'text-gray-400'
                            }`}>
                              {bolsa.itemNombre}
                            </p>
                            <p className="text-[10px] text-gray-600 font-mono">{bolsa.uniqueCode}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`font-mono text-sm font-bold ${
                            i === 0 ? 'text-green-400' : 'text-gray-400'
                          }`}>
                            {bolsa.peso?.toFixed(3)} kg
                          </p>
                          <p className="text-[9px] text-gray-700 font-mono">
                            #{feedBolsas.length - i}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── FOOTER: Botón Cargar Remito ── */}
            <div className="px-6 py-4 border-t border-white/10 bg-[#111827]/80 shrink-0">
              {todosCompletos ? (
                <button
                  onClick={() => cargarRemito(numPedido)}
                  className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 text-white font-black text-base uppercase tracking-widest transition-all active:scale-[0.98] cursor-pointer shadow-[0_8px_30px_rgba(34,197,94,0.35)] border-b-2 border-green-700 animate-in zoom-in-95 duration-300"
                >
                  <CheckCircle size={22} />
                  ✅ Cargar Remito — Marcar como Preparado
                </button>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-gray-600 text-xs">
                    <AlertCircle size={13} className="text-gray-600" />
                    <span>Completá todos los productos para habilitar el cierre</span>
                  </div>
                  <button
                    onClick={cerrarModalPreparacion}
                    className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all cursor-pointer"
                  >
                    <X size={14} /> Cerrar sin guardar
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
