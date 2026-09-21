import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  AlertTriangle, TrendingUp, Package, Plus, History, 
  Check, Info, Box, Edit2, RotateCcw, X, Save,
  AlertCircle, Loader2, Settings, ChevronDown, ChevronUp,
  ScanBarcode, Trash2, Zap, ClipboardList, Scale, Printer, CheckCircle2, Radio,
  Tag, ShoppingBag, Layers, Search, Sparkles
} from 'lucide-react';
import { 
  CATEGORIAS_PRINCIPALES, 
  SUBCATEGORIAS_ALMACEN, 
  getCategoriaPrincipal, 
  getUnidadByNombre, 
  getTipoByNombre,
  getEanMapping,
  asociarEanAProducto,
  esCodigoEan,
  getSubcategoriaAlmacen,
  ALMACEN_PRESETS
} from '../data/productUtils';

// Configuración de entorno
const SHEET_ID = import.meta.env.VITE_SHEET_ID;
const API_KEY  = import.meta.env.VITE_GOOGLE_SHEETS_KEY || import.meta.env.VITE_GOOGLE_API_KEY;
const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL;

const COSTOS_KEY = 'huerta_data_costos_v1_productos';
const LIQUIDACION_KEY = 'huerta_data_stock_liquidacion_v1';
const PROCESSED_CODES_KEY = 'huerta_codigos_procesados_v1';

const DEFAULTS_BY_TYPE = {
  'hoja verde': { totalDays: 4, alertDays: 2, icon: '🌿', labels: { small: '250g', large: '500g' } },
  'blando': { totalDays: 7, alertDays: 4, icon: '🍑', labels: { small: '500g', large: '1kg' } },
  'duro': { totalDays: 15, alertDays: 11, icon: '🥔', labels: { small: '500g', large: '1kg' } },
  'otros': { totalDays: 30, alertDays: 25, icon: '📦', labels: { small: '1ud', large: '1ud' } }
};

const PRODUCT_DATABASE = {
  'hoja verde': ['espinaca', 'lechuga', 'rucula', 'acelga', 'perejil', 'albahaca', 'ciboulette', 'radicheta'],
  'blando': ['tomate', 'tomate cherry', 'banana', 'durazno', 'frutilla', 'pera', 'morron', 'pepino', 'chaucha', 'berenjena'],
  'duro': [
    'papa', 'cebolla', 'cebolla comun', 'cebolla morada', 'zanahoria', 'zapallito', 'zapallo blanco', 'cabutia', 
    'ajo', 'remolacha', 'hinojo', 'apio', 'brocoli', 'coliflor', 'repollo', 'choclo', 'huevos', 'miel pura',
    'palta', 'manzana roja', 'manzana verde', 'naranja', 'limon', 'pomelo', 'uva', 'arandano', 'boniato'
  ]
};

// ─── Parseo de código de barras ────────────────────────────────────────────
// Formato Brother TD-4410D: NOMBRE-PESO  (ej: PAPA-1.120, ESPINACA-0.250)
// El separador es el ÚLTIMO guión, para soportar nombres compuestos:
//   TOMATE-CHERRY-0.500  →  nombre="tomate cherry", peso=0.500
//   CEBOLLA-MORADA-0.800 →  nombre="cebolla morada", peso=0.800
function parsearCodigoBarras(raw) {
  if (!raw) return null;
  // Limpiar caracteres invisibles, retornos de carro, saltos de línea, asteriscos de Code39 y prefijos AIM
  let code = String(raw).replace(/[\r\n\x00-\x1F]/g, '').trim().replace(/^\][a-zA-Z0-9]{2,3}/, '').trim();
  code = code.replace(/^\*+|\*+$/g, '').trim(); // Quitar asteriscos de Code39 si los tuviera
  if (!code) return null;

  // 0. Código de barras EAN estándar de fábrica (Almacén, 8 a 14 dígitos numéricos)
  if (esCodigoEan(code)) {
    const map = getEanMapping();
    const mapped = map[code.toUpperCase()];
    if (mapped) {
      return {
        nombre: mapped.nombre,
        peso: 1,
        tagId: null,
        uniqueCode: code.toUpperCase(),
        rawCode: code,
        esEan: true,
        eanInfo: mapped,
        esUnidad: true
      };
    }
    return {
      nombre: '',
      peso: 1,
      tagId: null,
      uniqueCode: code.toUpperCase(),
      rawCode: code,
      esEan: true,
      eanNoMapeado: true,
      esUnidad: true
    };
  }

  // 1. Formato Balanza Systel / Kretz / Toledo (EAN-13 estándar de balanza de retail)
  // Normalmente empieza con 20 o 02, seguido de 4-5 dígitos de PLU y 5 dígitos de peso en gramos
  // Ejemplos: 2000123011205 (PLU 123, 1120g = 1.120 kg) o 020001005008 (PLU 10, 500g = 0.500 kg)
  const eanBalanza = code.match(/^(20|02)(\d{4,5})(\d{5})\d$/);
  if (eanBalanza) {
    const plu = eanBalanza[2];
    const gramos = parseInt(eanBalanza[3], 10);
    const pesoKg = Math.round((gramos / 1000) * 1000) / 1000;
    return {
      nombre: `plu ${plu}`,
      plu,
      peso: pesoKg,
      tagId: null,
      uniqueCode: code.toUpperCase(),
      rawCode: code,
      origenBalanza: true
    };
  }

  // 2. Formato con ID único por bolsa: NOMBRE-PESO-TAGID (ej: BANANA-1.000-E49A, PAPA-1.120-7K9F, CEBOLLA-COMUN-1.000-A1B2)
  // Admite comas decimales, sufijos de peso (kg, g), y nombres compuestos
  const parts = code.split('-');
  if (parts.length >= 3) {
    const lastPart = parts[parts.length - 1].trim();
    const secondLastRaw = parts[parts.length - 2].trim().replace(',', '.').replace(/(?:kg|kilos?|g|gr?)$/i, '').trim();
    const pesoNum = parseFloat(secondLastRaw);
    if (!isNaN(pesoNum) && pesoNum > 0 && /^[A-Za-z0-9]{2,10}$/.test(lastPart)) {
      const nombre = parts.slice(0, parts.length - 2).join(' ').toLowerCase().trim();
      const pesoKg = pesoNum >= 100 && !/[.,]/.test(secondLastRaw) ? pesoNum / 1000 : pesoNum;
      return {
        nombre,
        peso: Math.round(pesoKg * 1000) / 1000,
        tagId: lastPart.toUpperCase(),
        uniqueCode: code.toUpperCase(),
        rawCode: code
      };
    }
  }

  // 3. Formato Brother clásico: NOMBRE-PESO (ej: PAPA-1.120, PAPA-1.120KG, TOMATE-CHERRY-0.500)
  const lastDashIdx = code.lastIndexOf('-');
  if (lastDashIdx > 0) {
    const rawPeso = code.slice(lastDashIdx + 1).replace(',', '.').replace(/(?:kg|kilos?|g|gr?)$/i, '').trim();
    const pesoNum = parseFloat(rawPeso);
    if (!isNaN(pesoNum) && pesoNum > 0) {
      const nombre = code.slice(0, lastDashIdx).toLowerCase().replace(/-/g, ' ').trim();
      const pesoKg = pesoNum >= 100 && !/[.,]/.test(rawPeso) ? pesoNum / 1000 : pesoNum;
      return {
        nombre,
        peso: Math.round(pesoKg * 1000) / 1000,
        tagId: null,
        uniqueCode: code.toUpperCase(),
        rawCode: code
      };
    }
  }

  // 4. Formato alternativo con espacios, guión bajo o dos puntos (ej: "PAPA 1.120", "PAPA 1.120 KG", "PAPA: 1.120", "PAPA_0.500")
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

  // 5. Si viene solo el nombre del producto o un código directo (ej: PAPA, 20000101, etc.)
  const nombreSimple = code.toLowerCase().replace(/[-_]/g, ' ').trim();
  return { nombre: nombreSimple, peso: null, tagId: null, uniqueCode: code.toUpperCase(), rawCode: code, esIncompleto: true };
}

// Normaliza un string para comparación fuzzy
const norm = (s) => (s || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Dado el tipo de producto y el peso escaneado, devuelve el slot de stock correcto
// hoja verde: small='500g' (250g físico), large='1kg' (500g físico) — umbral 0.35 kg
// blando/duro: small='500g', large='1kg' — umbral 0.75 kg
function determinarSlot(tipo, pesoKg) {
  if (tipo === 'hoja verde') return pesoKg <= 0.35 ? '500g' : '1kg';
  return pesoKg <= 0.75 ? '500g' : '1kg';
}

export default function ControlStock() {
  const { stockData, setStockData, productosCostos: contextMaster, setProductosCostos, stockData: contextStock } = useGoogleSheets();
  const [productosMaster, setProductosMaster] = useState([]);
  const [showFormId, setShowFormId] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [expandedCategory, setExpandedCategory] = useState(null);
  const isCargando = useRef(false);

  // ── Filtros por categoría principal y subcategoría de Almacén ─────────────
  const [categoriaFiltro, setCategoriaFiltro] = useState('Todas');
  const [subcategoriaAlmacen, setSubcategoriaAlmacen] = useState('Bebidas');

  // ── Modales de carga por unidad y asociación EAN ────────────────────────
  const [modalCargaUnidad, setModalCargaUnidad] = useState(null); // { open, productoId, nombre, unidad }
  const [modalEanAsociar, setModalEanAsociar] = useState(null);   // { open, ean, defaultNombre }

  // ── Sub-pestaña interna del bloque de escaneo ────────────────────────────
  const [stockSubTab, setStockSubTab] = useState('escanear'); // 'escanear' | 'pesar'

  // ── Scanner state ──────────────────────────────────────────────────────────
  const [scanMode, setScanMode] = useState('carga');    // 'carga' | 'gestion'
  const scanModeRef = useRef(scanMode);
  useEffect(() => { scanModeRef.current = scanMode; }, [scanMode]);

  const [scanBuffer, setScanBuffer] = useState('');
  const [lastScan, setLastScan] = useState(null);        // { productoNombre, peso, slot, ok, accion? }
  const [scanLog, setScanLog] = useState([]);             // array de últimos escaneos (max 8)
  const [scanError, setScanError] = useState(null);
  const [gestionPending, setGestionPending] = useState(null); // popup modo gestión
  const [cargaPendiente, setCargaPendiente] = useState([]);
  const scanInputRef = useRef(null);
  const stockDataRef = useRef(stockData);
  useEffect(() => { stockDataRef.current = stockData; }, [stockData]);
  const lastProcessedTimeRef = useRef(0);

  // ── Códigos únicos procesados (persistente en localStorage) ──────────────
  const [codigosProcesados, setCodigosProcesados] = useState(() => {
    try {
      const saved = localStorage.getItem(PROCESSED_CODES_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });
  const codigosProcesadosRef = useRef(codigosProcesados);
  useEffect(() => {
    codigosProcesadosRef.current = codigosProcesados;
    try {
      localStorage.setItem(PROCESSED_CODES_KEY, JSON.stringify(codigosProcesados));
    } catch (e) {}
  }, [codigosProcesados]);

  // ── Modal de carga manual / asignación de código ─────────────────────────
  const [manualModal, setManualModal] = useState(null); // { open, code, productoId, peso, modo }
  const [liquidacionItems, setLiquidacionItems] = useState(() => {
    try {
      const saved = localStorage.getItem(LIQUIDACION_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(LIQUIDACION_KEY, JSON.stringify(liquidacionItems));
    } catch (e) {}
  }, [liquidacionItems]);

  const eliminarItemLiquidacion = useCallback((id) => {
    setLiquidacionItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const vaciarLiquidacion = useCallback(() => {
    setLiquidacionItems([]);
  }, []);

  useEffect(() => {
    // Si ya tenemos datos procesados en stockData (que es un Objeto), no inicializar de nuevo
    const hasData = stockData && typeof stockData === 'object' && !Array.isArray(stockData) && Object.keys(stockData).length > 0;
    
    if (hasData) {
      setCargando(false);
      return;
    }

    // Si los datos están en el contexto pero no procesados localmente todavía
    if (contextMaster?.length > 0 && contextStock?.length > 0) {
      setProductosMaster(contextMaster);
      
      const isStockArray = Array.isArray(contextStock);
      if (isStockArray) {
        console.log('[CONTROL-STOCK] Inicializando stock local desde contexto...');
        const initial = inicializarStockLocal(contextMaster, contextStock);
        setStockData(initial);
      }
      setCargando(false);
    } else {
      // Si no hay datos en el contexto, forzar carga desde la Sheet
      cargarStockDesdeSheet();
    }
  }, []); // Solo al montar

  // ── Scanner: mantener foco ─────────────────────────────────────────────────
  const refocusScanner = useCallback(() => {
    const active = document.activeElement;
    const isOtherInput = active && active !== scanInputRef.current &&
      (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT') &&
      !active.readOnly;
    if (!isOtherInput && scanInputRef.current) {
      scanInputRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (stockSubTab !== 'escanear') return;
    refocusScanner();
    const interval = setInterval(refocusScanner, 1500);
    return () => clearInterval(interval);
  }, [refocusScanner, stockSubTab]);

  // ── Scanner: procesar código escaneado ───────────────────────────────────
  const procesarEscaneo = useCallback((rawCode) => {
    if (!rawCode) return;
    setScanError(null);

    const rawCodeClean = String(rawCode).replace(/[\r\n\x00-\x1F]/g, '').trim().replace(/^\][a-zA-Z0-9]{2,3}/, '').replace(/^\*+|\*+$/g, '').trim();
    if (!rawCodeClean) return;

    const resultado = parsearCodigoBarras(rawCodeClean);
    const activeScanMode = scanModeRef.current;
    const current = stockDataRef.current || {};
    const uniqueCode = (resultado?.uniqueCode || rawCodeClean).toUpperCase();

    // ── 0. CÓDIGO EAN DE FÁBRICA (Almacén) ─────────────────────────────────
    if (resultado?.esEan) {
      if (resultado.eanNoMapeado) {
        setModalEanAsociar({ open: true, ean: uniqueCode });
        return;
      }
      const eanInfo = resultado.eanInfo;
      const matchedId = (eanInfo?.productoId && current[eanInfo.productoId])
        ? eanInfo.productoId
        : Object.keys(current).find(id => norm(current[id]?.nombre) === norm(eanInfo?.nombre));
      
      const prod = matchedId ? current[matchedId] : null;
      if (!prod) {
        setModalEanAsociar({ open: true, ean: uniqueCode, defaultNombre: eanInfo?.nombre });
        return;
      }

      if (activeScanMode === 'carga') {
        setCargaPendiente(prev => [
          ...prev,
          {
            id: Date.now().toString() + Math.random().toString(),
            matchedId,
            nombre: prod.nombre,
            prod,
            slot: 'unidad',
            peso: 1,
            uniqueCode,
            esUnidad: true
          }
        ]);
        setLastScan({ ok: true, productoNombre: prod.nombre, peso: 1, slot: '1 unidad', ts: Date.now(), accion: 'Pendiente' });
        setTimeout(() => setLastScan(null), 1500);
        return;
      } else {
        // Modo gestión para unidad
        const stockDisponible = Number(prod.stock?.unidades ?? prod.stock?.['1kg']) || 0;
        setGestionPending({
          matchedId,
          prod,
          slot: 'unidad',
          peso: 1,
          feedbackSlotLabel: '1 unidad',
          rawCode: rawCodeClean,
          uniqueCode,
          nombre: prod.nombre,
          stockDisponible,
          sinStock: stockDisponible <= 0,
          yaProcesado: false,
          regExistente: null,
          esUnidad: true
        });
        setLastScan(null);
        return;
      }
    }

    const reg = codigosProcesadosRef.current ? codigosProcesadosRef.current[uniqueCode] : null;

    const nombreBuscado = (reg ? reg.nombre : (resultado?.nombre || rawCodeClean)).toLowerCase();
    const pesoBuscado = (reg && reg.peso > 0) ? reg.peso : resultado?.peso;

    // Buscar producto en el inventario por coincidencia fuzzy exacta o parcial
    const matchedId = (reg && reg.matchedId && current[reg.matchedId])
      ? reg.matchedId
      : Object.keys(current).find(id => {
          const pNorm = norm(current[id].nombre);
          const sNorm = norm(nombreBuscado);
          return pNorm === sNorm || pNorm.includes(sNorm) || sNorm.includes(pNorm);
        });

    const prod = matchedId ? current[matchedId] : null;

    // ── 1. CÓDIGO BLOQUEADO (Dado de baja definitiva / Eliminado) ─────────────
    if (reg?.bloqueado || reg?.estado === 'BAJA_DEFINITIVA') {
      if (activeScanMode === 'carga') {
        setScanError(`🚫 CÓDIGO BLOQUEADO: La bolsa "${uniqueCode}" fue dada de baja definitiva. No se puede volver a utilizar.`);
        setLastScan({ ok: false, raw: uniqueCode, ts: Date.now() });
        setTimeout(() => setLastScan(null), 4500);
        return;
      } else {
        setGestionPending({
          matchedId: matchedId || null,
          prod,
          slot: reg?.slot || '500g',
          peso: reg?.peso || 0,
          feedbackSlotLabel: reg?.slot || '—',
          rawCode: rawCodeClean,
          uniqueCode,
          nombre: reg?.nombre || nombreBuscado,
          bloqueado: true,
          motivoBloqueo: reg?.motivoBloqueo || 'Bolsa eliminada / dada de baja definitiva',
          fechaModificacion: reg?.fechaModificacion || '',
        });
        setLastScan(null);
        return;
      }
    }

    // ── 2. CÓDIGO PREVIAMENTE SACADO / VENDIDO (Devolución / No vendido) ──────
    if (reg && reg.estado && reg.estado !== 'EN_STOCK' && !reg.bloqueado) {
      const slot = reg.slot || (prod ? determinarSlot(prod.tipo, reg.peso || 0.5) : '500g');
      const feedbackSlotLabel = DEFAULTS_BY_TYPE[prod?.tipo || 'hoja verde']?.labels[slot === '500g' ? 'small' : 'large'] || slot;

      if (activeScanMode === 'carga') {
        // En Modo Carga: reingresar al stock directamente acumulándolo en cargaPendiente
        setCargaPendiente(prev => [
          ...prev,
          {
            id: Date.now().toString() + Math.random().toString(),
            matchedId: matchedId || reg.matchedId,
            nombre: reg.nombre || prod?.nombre || 'Producto',
            prod: prod || { nombre: reg.nombre, stock: { '500g': 0, '1kg': 0 } },
            slot,
            peso: reg.peso || 0,
            uniqueCode,
            esReingreso: true,
          }
        ]);

        setLastScan({
          ok: true,
          productoNombre: reg.nombre,
          peso: reg.peso || 0,
          slot: feedbackSlotLabel,
          ts: Date.now(),
          accion: 'Reingreso'
        });
        setTimeout(() => setLastScan(null), 2500);
        return;
      } else {
        // En Modo Gestión: popup con opción de Reingresar o Dar de baja definitiva
        setGestionPending({
          matchedId: matchedId || reg.matchedId,
          prod,
          slot,
          peso: reg.peso || 0,
          feedbackSlotLabel,
          rawCode: rawCodeClean,
          uniqueCode,
          nombre: reg.nombre,
          esReingreso: true,
          regExistente: reg,
        });
        setLastScan(null);
        return;
      }
    }

    // ── 3. CÓDIGO YA EN STOCK (Evitar duplicar) ───────────────────────────────
    if (reg && reg.estado === 'EN_STOCK') {
      if (activeScanMode === 'carga') {
        setScanError(`⚠️ Ya está en stock: La bolsa "${uniqueCode}" (${reg.nombre}) ya fue ingresada. No se puede volver a cargar.`);
        setLastScan({ ok: false, raw: uniqueCode, ts: Date.now() });
        setTimeout(() => setLastScan(null), 4500);
        return;
      }
      // En modo gestión sigue adelante
    }

    // ── 4. CÓDIGO INCOMPLETO O NO RECONOCIDO AUTOMÁTICAMENTE ───────────────────
    if (!pesoBuscado || pesoBuscado <= 0 || !matchedId || !prod || resultado?.esIncompleto) {
      // Abrir modal de asignación manual para que el usuario no quede bloqueado
      setManualModal({
        open: true,
        code: uniqueCode,
        productoId: matchedId || Object.keys(current)[0] || '',
        peso: (pesoBuscado && pesoBuscado > 0) ? String(pesoBuscado) : '1.000',
        modo: activeScanMode
      });
      return;
    }

    // ── 5. FLUJO NORMAL: Producto y peso identificados ─────────────────────────
    const pesoFinal = pesoBuscado;
    let slot = determinarSlot(prod.tipo, pesoFinal);
    const feedbackSlotLabel = DEFAULTS_BY_TYPE[prod.tipo]?.labels[slot === '500g' ? 'small' : 'large'] || slot;

    if (activeScanMode === 'gestion') {
      const stockDisponible = prod.stock[slot] || 0;
      const sinStock = stockDisponible <= 0;

      setGestionPending({
        matchedId,
        prod,
        slot,
        peso: pesoFinal,
        feedbackSlotLabel,
        rawCode: rawCodeClean,
        uniqueCode,
        nombre: prod.nombre,
        stockDisponible,
        sinStock,
        yaProcesado: false,
        regExistente: reg,
      });
      setLastScan(null);
      return;
    }

    // Modo Carga regular
    setCargaPendiente(prev => [
      ...prev,
      {
        id: Date.now().toString() + Math.random().toString(),
        matchedId,
        nombre: prod.nombre,
        prod,
        slot,
        peso: pesoFinal,
        uniqueCode,
      }
    ]);

    setLastScan({ ok: true, productoNombre: prod.nombre, peso: pesoFinal, slot: feedbackSlotLabel, ts: Date.now(), accion: 'Pendiente' });
    setTimeout(() => setLastScan(null), 1500);
  }, []);

  // ── Listener global para capturar escaneo de pistola en cualquier parte ────
  useEffect(() => {
    if (stockSubTab !== 'escanear') return;

    let globalBuffer = '';
    let lastKeyTime = Date.now();

    const handleGlobalKeyDown = (e) => {
      // Escape cierra el modal de gestión si está abierto
      if (e.key === 'Escape') {
        setGestionPending(null);
        setTimeout(refocusScanner, 50);
        return;
      }

      const active = document.activeElement;
      const isOtherInput = active && active !== scanInputRef.current &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT') &&
        !active.readOnly;
      if (isOtherInput) return;

      // Si el foco ya está en el input del escáner, lo maneja su propio onKeyDown
      if (active === scanInputRef.current) return;

      const now = Date.now();
      // Si pasaron más de 200ms entre teclas, resetear buffer (indica tipeo humano lento o nuevo escaneo)
      if (now - lastKeyTime > 200) {
        globalBuffer = '';
      }
      lastKeyTime = now;

      if (e.key === 'Enter') {
        const code = globalBuffer.trim();
        globalBuffer = '';
        if (code) {
          e.preventDefault();
          e.stopPropagation();
          const scanTime = Date.now();
          if (scanTime - lastProcessedTimeRef.current > 250) {
            lastProcessedTimeRef.current = scanTime;
            procesarEscaneo(code);
          }
        }
        return;
      }

      if (e.key.length === 1) {
        globalBuffer += e.key;
        if (scanInputRef.current) {
          scanInputRef.current.focus();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [stockSubTab, procesarEscaneo, refocusScanner]);

  // ── Sincronizar con Google Sheet ──────────────────────────────────────────
  const syncWithSheet = async (updatedProduct) => {
    if (!APPS_SCRIPT_URL || !updatedProduct.fila) return;
    const payload = {
      accion: 'updateStock',
      action: 'updateStock',
      sheetName: 'ControlStock',
      fila: updatedProduct.fila,
      nombre: updatedProduct.nombre,
      stock_500g: updatedProduct.stock['500g'],
      stock_1kg: updatedProduct.stock['1kg'],
      original_load_500g: updatedProduct.originalLoad['500g'],
      original_load_1kg: updatedProduct.originalLoad['1kg'],
      tipo: updatedProduct.tipo,
      total_days: updatedProduct.totalDays,
      urgent_days: updatedProduct.urgentDays,
      ultimo_bandejeado: updatedProduct.ultimo_bandejeado
    };
    try {
      await fetch(APPS_SCRIPT_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(payload) });
    } catch (e) { console.error(e); }
  };

  // ── Confirmar toda la carga pendiente al stock ───────────────────────────
  const confirmarCarga = useCallback(() => {
    if (cargaPendiente.length === 0) return;
    const current = stockDataRef.current;
    const newData = { ...current };
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const horaStr = now.toLocaleDateString('es-AR') + ' ' + now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    const logEntries = [];
    const nuevosCodigos = {};

    // Agrupar los pendientes por matchedId para hacer un solo update por producto
    const grouped = cargaPendiente.reduce((acc, item) => {
      if (!acc[item.matchedId]) {
        acc[item.matchedId] = {
          nombre: item.nombre,
          slots: { '500g': { bolsas: 0, pesoTotal: 0 }, '1kg': { bolsas: 0, pesoTotal: 0 }, 'unidad': { bolsas: 0, pesoTotal: 0 } },
          esUnidad: item.esUnidad || item.slot === 'unidad'
        };
      }
      const slotKey = item.slot === 'unidad' ? 'unidad' : item.slot;
      if (!acc[item.matchedId].slots[slotKey]) {
        acc[item.matchedId].slots[slotKey] = { bolsas: 0, pesoTotal: 0 };
      }
      acc[item.matchedId].slots[slotKey].bolsas += 1;
      acc[item.matchedId].slots[slotKey].pesoTotal += item.peso;
      return acc;
    }, {});

    // Registrar códigos únicos como EN_STOCK
    cargaPendiente.forEach(item => {
      const codeKey = item.uniqueCode || `${item.nombre}-${item.peso}-${Date.now()}`;
      nuevosCodigos[codeKey] = {
        uniqueCode: codeKey,
        nombre: item.nombre,
        matchedId: item.matchedId,
        slot: item.slot,
        peso: item.peso,
        estado: 'EN_STOCK',
        bloqueado: false,
        fechaModificacion: horaStr,
        ultimaAccion: item.esReingreso ? 'Reingreso al stock' : 'Carga de stock',
        ts: Date.now()
      };
    });

    Object.entries(grouped).forEach(([id, item]) => {
      if (!newData[id]) return;
      const prod = newData[id];
      const isItemUnidad = item.esUnidad || prod.esUnidad || prod.unidad === 'unidad';
      const unidadBolsas = item.slots['unidad']?.bolsas || 0;
      const stock1k = (prod.stock['1kg'] || 0) + item.slots['1kg'].bolsas + (isItemUnidad ? unidadBolsas : 0);
      const stock500 = isItemUnidad ? 0 : (prod.stock['500g'] || 0) + item.slots['500g'].bolsas;

      const newStock = {
        '500g': stock500,
        '1kg':  stock1k,
        unidades: isItemUnidad ? stock1k : (prod.stock.unidades || stock1k)
      };
      const newOriginalLoad = {
        '500g': Math.max(prod.originalLoad['500g'] || 0, newStock['500g']),
        '1kg':  Math.max(prod.originalLoad['1kg']  || 0, newStock['1kg']),
        unidades: Math.max(Number(prod.originalLoad?.unidades ?? prod.originalLoad?.['1kg']) || 0, newStock.unidades)
      };
      newData[id] = { ...prod, stock: newStock, originalLoad: newOriginalLoad, ultimoBandejeado: today };
      syncWithSheet(newData[id]);

      if (isItemUnidad) {
        const totalUds = unidadBolsas + item.slots['1kg'].bolsas;
        logEntries.push({ ok: true, productoNombre: item.nombre, peso: totalUds, slot: `${totalUds} ud${totalUds !== 1 ? 's' : ''}`, ts: Date.now(), accion: 'Carga' });
      } else {
        const totalBolsas = item.slots['500g'].bolsas + item.slots['1kg'].bolsas;
        const pesoTotal = Math.round((item.slots['500g'].pesoTotal + item.slots['1kg'].pesoTotal) * 1000) / 1000;
        logEntries.push({ ok: true, productoNombre: item.nombre, peso: pesoTotal, slot: `${totalBolsas} bolsa${totalBolsas !== 1 ? 's' : ''}`, ts: Date.now(), accion: 'Carga' });
      }
    });

    setCodigosProcesados(prev => ({
      ...prev,
      ...nuevosCodigos
    }));
    setStockData(newData);
    setScanLog(prev => [...logEntries, ...prev].slice(0, 8));
    setCargaPendiente([]);
    setLastScan(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargaPendiente, setStockData, syncWithSheet]);

  const cancelarCarga = () => {
    setCargaPendiente([]);
    setLastScan(null);
    setScanError(null);
  };

  // ── Aplicar acción de Gestión ─────────────────────────────────────────────
  const applyGestionAccion = useCallback((accion) => {
    if (!gestionPending) return;
    const { matchedId, prod, slot, peso, feedbackSlotLabel, rawCode, uniqueCode, nombre, yaProcesado, esReingreso, bloqueado } = gestionPending;
    const current = stockDataRef.current;

    // Validación: Si el código está bloqueado definitivamente, impedir cualquier acción
    if (bloqueado) {
      setScanError(`Código bloqueado: Esta bolsa fue dada de baja definitiva.`);
      setGestionPending(null);
      setTimeout(refocusScanner, 50);
      return;
    }

    if (!matchedId || !prod || !slot) {
      setScanError(`No se puede operar: Producto "${nombre}" no identificado en el inventario.`);
      setGestionPending(null);
      setTimeout(refocusScanner, 50);
      return;
    }

    const prodActual = current[matchedId];
    const isUnidadGestion = gestionPending?.esUnidad || prodActual.unidad === 'unidad' || slot === 'unidad';
    const stockActual = isUnidadGestion 
      ? (Number(prodActual?.stock?.unidades ?? prodActual?.stock?.['1kg']) || 0)
      : (prodActual?.stock?.[slot] || 0);
    const now = new Date();
    const horaStr = now.toLocaleDateString('es-AR') + ' ' + now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    const regCode = uniqueCode || rawCode?.toUpperCase() || `${prod.nombre}-${Date.now()}`;

    let nuevoStockSlot = stockActual;
    let estadoFinal = 'EN_STOCK';
    let esBloqueadoFinal = false;
    let motivoBloqueoFinal = null;

    if (accion === 'Reingresar al stock') {
      // Reingreso: suma 1 al stock
      nuevoStockSlot = stockActual + 1;
      estadoFinal = 'EN_STOCK';
    } else if (accion === 'Dar de baja definitiva') {
      // Baja definitiva: descuenta 1 si estaba en stock y BLOQUEA el código permanentemente
      nuevoStockSlot = Math.max(0, stockActual - 1);
      estadoFinal = 'BAJA_DEFINITIVA';
      esBloqueadoFinal = true;
      motivoBloqueoFinal = 'Bolsa eliminada / dada de baja definitiva';
    } else {
      // Salida: Sacar del stock, Consumo propio o Liquidación
      if (stockActual <= 0) {
        setScanError(`¡Sin stock! No podés sacar "${prod.nombre}" (${feedbackSlotLabel}) porque el stock disponible es 0.`);
        setGestionPending(null);
        setTimeout(refocusScanner, 50);
        return;
      }
      nuevoStockSlot = Math.max(0, stockActual - 1);
      estadoFinal = accion === 'Consumo propio' ? 'CONSUMO' : (accion === 'Liquidación' ? 'LIQUIDACION' : 'SACADO');
    }

    // Actualizar stock en memoria y en Sheet
    const newStock = {
      ...prodActual.stock,
      [slot]: nuevoStockSlot,
      ...(isUnidadGestion ? { '1kg': nuevoStockSlot, unidades: nuevoStockSlot } : {})
    };
    const newData = { ...current };
    newData[matchedId] = { ...prodActual, stock: newStock };
    setStockData(newData);
    syncWithSheet(newData[matchedId]);

    // Registrar código único en base de datos persistente
    setCodigosProcesados(prev => ({
      ...prev,
      [regCode]: {
        uniqueCode: regCode,
        nombre: prod.nombre,
        matchedId,
        slot,
        peso: peso || 0,
        estado: estadoFinal,
        bloqueado: esBloqueadoFinal,
        motivoBloqueo: motivoBloqueoFinal,
        fechaModificacion: horaStr,
        ultimaAccion: accion,
        ts: Date.now()
      }
    }));

    const displayNombre = prod.nombre;
    const displayPeso = peso || 0;
    const displaySlot = feedbackSlotLabel || '—';

    const entry = {
      ok: true,
      productoNombre: displayNombre,
      peso: displayPeso,
      slot: displaySlot,
      ts: Date.now(),
      accion,
      stockRestante: nuevoStockSlot
    };
    setLastScan(entry);
    setScanLog(prev => [entry, ...prev].slice(0, 8));

    // Si la acción fue Liquidación, agregar a lista de Liquidación
    if (accion === 'Liquidación') {
      const itemLiq = {
        id: Date.now().toString() + Math.random().toString(),
        matchedId,
        nombre: displayNombre,
        slot: displaySlot,
        peso: displayPeso,
        ts: Date.now(),
        fecha: horaStr,
        uniqueCode: regCode,
      };
      setLiquidacionItems(prev => [itemLiq, ...prev]);
    }

    setGestionPending(null);
    setTimeout(() => setLastScan(null), 4000);
    setTimeout(() => scanInputRef.current?.focus(), 150);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gestionPending, setStockData, refocusScanner, syncWithSheet]);

  // ── Handler de Carga / Asignación Manual ──────────────────────────────────
  const handleManualSubmit = (e) => {
    e?.preventDefault?.();
    if (!manualModal) return;
    const { code, productoId, peso, modo } = manualModal;
    const cleanCode = (code || '').trim().toUpperCase();
    if (!cleanCode) {
      alert('Por favor ingresá un código de barras.');
      return;
    }
    const current = stockDataRef.current || {};
    const prod = current[productoId] || Object.values(current).find(p => p.id === productoId);
    if (!prod) {
      alert('Por favor seleccioná un producto válido de la lista.');
      return;
    }
    const pesoNum = parseFloat(String(peso).replace(',', '.'));
    if (isNaN(pesoNum) || pesoNum <= 0) {
      alert('Por favor ingresá un peso numérico válido en kg (ej: 1.000).');
      return;
    }

    const reg = codigosProcesadosRef.current ? codigosProcesadosRef.current[cleanCode] : null;
    if (reg?.bloqueado) {
      alert(`🚫 Este código está bloqueado permanentemente porque fue dado de baja definitiva (${reg.fechaModificacion}).`);
      return;
    }

    const slot = determinarSlot(prod.tipo, pesoNum);
    const feedbackSlotLabel = DEFAULTS_BY_TYPE[prod.tipo]?.labels[slot === '500g' ? 'small' : 'large'] || slot;

    if (modo === 'gestion') {
      setManualModal(null);
      const stockDisponible = prod.stock[slot] || 0;
      setGestionPending({
        matchedId: prod.id || productoId,
        prod,
        slot,
        peso: pesoNum,
        feedbackSlotLabel,
        rawCode: cleanCode,
        uniqueCode: cleanCode,
        nombre: prod.nombre,
        stockDisponible,
        sinStock: stockDisponible <= 0,
        esReingreso: reg && reg.estado !== 'EN_STOCK',
        regExistente: reg,
      });
    } else {
      // Modo Carga: agregar a carga pendiente
      if (reg && reg.estado === 'EN_STOCK') {
        alert(`⚠️ La bolsa "${cleanCode}" ya se encuentra registrada en el stock actual.`);
        return;
      }

      setCargaPendiente(prev => [
        ...prev,
        {
          id: Date.now().toString() + Math.random().toString(),
          matchedId: prod.id || productoId,
          nombre: prod.nombre,
          prod,
          slot,
          peso: pesoNum,
          uniqueCode: cleanCode,
          esReingreso: reg && reg.estado !== 'EN_STOCK'
        }
      ]);
      setManualModal(null);
      setLastScan({
        ok: true,
        productoNombre: prod.nombre,
        peso: pesoNum,
        slot: feedbackSlotLabel,
        ts: Date.now(),
        accion: 'Pendiente'
      });
      setTimeout(() => setLastScan(null), 2000);
      setTimeout(() => scanInputRef.current?.focus(), 100);
    }
  };

  const handleScanInput = (e) => {
    setScanBuffer(e.target.value);
  };

  const handleScanKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();

      const rawVal = e.target.value || scanBuffer || '';
      const code = rawVal.replace(/[\r\n]/g, '').trim();

      e.target.value = '';
      setScanBuffer('');

      const now = Date.now();
      if (now - lastProcessedTimeRef.current < 250) {
        return;
      }

      if (code) {
        lastProcessedTimeRef.current = now;
        procesarEscaneo(code);
      }
    }
  };

  const cargarStockDesdeSheet = async () => {
    if (isCargando.current) return;
    isCargando.current = true;
    
    setCargando(true);
    setError(null);
    
    const prodsSaved = localStorage.getItem(COSTOS_KEY);
    const master = prodsSaved ? JSON.parse(prodsSaved) : [];
    setProductosMaster(master);

    if (!API_KEY || !SHEET_ID) {
      console.error('[CONTROL-STOCK] Error: No hay API_KEY o SHEET_ID');
      setError('Faltan claves de configuración (SHEET_ID / API_KEY) en .env');
      setCargando(false);
      isCargando.current = false;
      return;
    }

    try {
      let rows = null;
      if (API_KEY && SHEET_ID) {
        try {
          const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/ControlStock?key=${API_KEY}`;
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            if (data.values && data.values.length > 0) rows = data.values;
          }
        } catch (e) {
          console.warn('[CONTROL-STOCK] Error v4, activando fallback gviz...', e);
        }
      }

      // Fallback gviz (Google Visualization API)
      if (!rows && SHEET_ID) {
        try {
          const gvizUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=ControlStock`;
          const gvizRes = await fetch(gvizUrl);
          if (gvizRes.ok) {
            const text = await gvizRes.text();
            const start = text.indexOf('{');
            const end = text.lastIndexOf('}');
            if (start !== -1 && end !== -1) {
              const json = JSON.parse(text.substring(start, end + 1));
              if (json.status === 'ok' && json.table) {
                const headers = (json.table.cols || []).map(c => c.label || '');
                const rRows = (json.table.rows || []).map(r => 
                  (r.c || []).map(cell => (cell ? (cell.v !== null && cell.v !== undefined ? cell.v : cell.f || '') : ''))
                );
                rows = [headers, ...rRows];
              }
            }
          }
        } catch (e) {
          console.warn('[CONTROL-STOCK] Error gviz:', e);
        }
      }

      const parsedRows = (rows && rows.length > 1)
        ? (() => {
            const headers = rows[0].map(h => String(h || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ /g, '_'));
            return rows.slice(1).map((row, index) => {
              const obj = { fila: index + 2 };
              headers.forEach((h, i) => { obj[h] = row[i] || ''; });
              return obj;
            });
          })()
        : [];

      const initial = inicializarStockLocal(master, parsedRows);
      setStockData(initial);
    } catch (err) {
      console.error('[CONTROL-STOCK] Error al leer stock:', err);
      // Fallback seguro: no bloquear la app
      const initial = inicializarStockLocal(master, []);
      setStockData(initial);
    } finally {
      setCargando(false);
      isCargando.current = false;
    }
  };

  const inicializarStockLocal = (master, remoteData) => {
    const newStockData = {};
    
    // Si master está vacío (ej: usuario Produccion), usar nombres de remoteData
    const catalog = (master && master.length > 0) ? [...master] : remoteData.map((r, idx) => ({ id: 1000 + idx, nombre: r.producto || r.nombre }));

    // Cargar productos personalizados de almacén guardados en localStorage
    let customProds = [];
    try {
      const saved = localStorage.getItem('huerta_custom_almacen_prods_v1');
      if (saved) customProds = JSON.parse(saved);
    } catch(e) {}
    customProds.forEach(cp => {
      if (!catalog.some(p => norm(p.nombre) === norm(cp.nombre))) {
        catalog.push(cp);
      }
    });

    // Cargar presets de almacén para que todas las subcategorías tengan sus productos disponibles
    ALMACEN_PRESETS.forEach(pre => {
      if (!catalog.some(p => norm(p.nombre) === norm(pre.nombre))) {
        catalog.push(pre);
      }
    });

    // Leer cache local de unidades cargadas para persistir entre sesiones
    let unitsCache = {};
    try {
      unitsCache = JSON.parse(localStorage.getItem('huerta_stock_units_cache_v1') || '{}');
    } catch(e) {}

    catalog.forEach(p => {
      if (!p.nombre) return;
      const remoteInfo = remoteData.find(r => (r.producto || r.nombre)?.toLowerCase().trim() === p.nombre?.toLowerCase().trim());
      
      // Clasificación automática
      const autoTipo = getTipoByNombre(p.nombre);
      const autoCat = getCategoriaPrincipal(p.nombre);
      const autoUnidad = getUnidadByNombre(p.nombre);
      const unidad = p.unidad || autoUnidad;
      const esUnidad = unidad === 'unidad';
      const catPrincipal = p.categoriaPrincipal || p.categoria || remoteInfo?.categoria || autoCat;
      const subCat = p.subcategoria || remoteInfo?.subcategoria || (catPrincipal === 'Almacén' ? getSubcategoriaAlmacen(p.nombre) : '');

      const cachedUnits = unitsCache[norm(p.nombre)];

      if (remoteInfo) {
        const stock_500 = Number(remoteInfo.stock_500g || remoteInfo[3] || 0);
        const stock_1k = Number(remoteInfo.stock_1kg || remoteInfo[4] || 0);
        const orig_500 = Number(remoteInfo.original_load_500g || remoteInfo.stock_500g || remoteInfo[3] || 0);
        const orig_1k = Number(remoteInfo.original_load_1kg || remoteInfo.stock_1kg || remoteInfo[4] || 0);
        let stock_unidades = remoteInfo.stock_unidades !== undefined ? Number(remoteInfo.stock_unidades) : stock_1k;
        let orig_unidades = orig_1k;

        if (cachedUnits && esUnidad) {
          stock_unidades = cachedUnits.stock;
          orig_unidades = cachedUnits.originalLoad || stock_unidades;
        }

        newStockData[p.id] = {
          nombre: p.nombre,
          fila: remoteInfo.fila || remoteInfo.fila_index,
          stock: { '500g': stock_500, '1kg': esUnidad ? stock_unidades : stock_1k, unidades: esUnidad ? stock_unidades : stock_1k },
          originalLoad: { '500g': orig_500, '1kg': esUnidad ? orig_unidades : orig_1k, unidades: esUnidad ? orig_unidades : orig_1k },
          ultimoBandejeado: (cachedUnits && cachedUnits.fecha) || remoteInfo.ultimo_bandejeado || remoteInfo[5] || null,
          tipo: remoteInfo.tipo || remoteInfo[1] || autoTipo,
          categoriaPrincipal: catPrincipal,
          subcategoria: subCat,
          unidad,
          esUnidad,
          totalDays: Number(remoteInfo.total_days || remoteInfo.dias_alerta || remoteInfo[2] || (DEFAULTS_BY_TYPE[remoteInfo.tipo || autoTipo] || DEFAULTS_BY_TYPE['duro']).totalDays),
          urgentDays: Number(remoteInfo.urgent_days || (remoteInfo.dias_alerta ? 2 : null) || (DEFAULTS_BY_TYPE[remoteInfo.tipo || autoTipo] || DEFAULTS_BY_TYPE['duro']).alertDays)
        };
      } else if (p.fila) {
         const def = DEFAULTS_BY_TYPE[autoTipo] || DEFAULTS_BY_TYPE['duro'];
         const savedStock = (cachedUnits && esUnidad) ? cachedUnits.stock : 0;
         newStockData[p.id] = {
           nombre: p.nombre, fila: p.fila, 
           stock: { '500g': 0, '1kg': savedStock, unidades: savedStock }, 
           originalLoad: { '500g': 0, '1kg': savedStock, unidades: savedStock },
           ultimoBandejeado: (cachedUnits && cachedUnits.fecha) || null, 
           tipo: autoTipo, categoriaPrincipal: catPrincipal, subcategoria: subCat, unidad, esUnidad, totalDays: def.totalDays, urgentDays: def.alertDays
         };
      } else {
        const def = DEFAULTS_BY_TYPE[autoTipo] || DEFAULTS_BY_TYPE['duro'];
        const savedStock = (cachedUnits && esUnidad) ? cachedUnits.stock : 0;
        newStockData[p.id] = {
          nombre: p.nombre, fila: null, 
          stock: { '500g': 0, '1kg': savedStock, unidades: savedStock }, 
          originalLoad: { '500g': 0, '1kg': savedStock, unidades: savedStock },
          ultimoBandejeado: (cachedUnits && cachedUnits.fecha) || null, 
          tipo: autoTipo, categoriaPrincipal: catPrincipal, subcategoria: subCat, unidad, esUnidad, totalDays: def.totalDays, urgentDays: def.alertDays
        };
      }
    });
    return newStockData;
  };

  const processedData = useMemo(() => {
    if (!stockData || typeof stockData !== 'object' || Array.isArray(stockData)) {
      console.log('[CONTROL-STOCK] processedData: stockData no es objeto válido', typeof stockData);
      return [];
    }

    const res = Object.keys(stockData).map(id => {
      const item = stockData[id];
      if (!item) return null;

      const catPrincipal = item.categoriaPrincipal || getCategoriaPrincipal(item.nombre);
      const subCat = item.subcategoria || (catPrincipal === 'Almacén' ? getSubcategoriaAlmacen(item.nombre) : '');
      const unidad = item.unidad || getUnidadByNombre(item.nombre);
      const esUnidad = item.esUnidad || unidad === 'unidad';

      const totalStock = esUnidad
        ? (Number(item.stock?.unidades ?? item.stock?.['1kg']) || 0)
        : Object.values(item.stock || {}).reduce((s, c) => s + c, 0);
      const totalOriginal = esUnidad
        ? (Number(item.originalLoad?.unidades ?? item.originalLoad?.['1kg']) || 0)
        : Object.values(item.originalLoad || {}).reduce((s, c) => s + c, 0);
      
      let diasTranscurridos = null;
      let diasRestantes = null;
      if (item.ultimoBandejeado) {
        const diff = new Date() - new Date(item.ultimoBandejeado);
        diasTranscurridos = Math.floor(diff / (1000 * 60 * 60 * 24));
        diasRestantes = Math.max(0, item.totalDays - diasTranscurridos);
      }

      const isFaltante = totalStock === 0;
      
      // Lógica solicitada: Urgente Vender si días restantes <= 2
      const isUrgente = !isFaltante && diasRestantes !== null && (diasRestantes <= 2);
      const isStockBajo = !isFaltante && !isUrgente && totalOriginal > 0 && totalStock <= (totalOriginal / 2);

      let category = 'ok';
      if (isFaltante) category = 'faltante';
      else if (isUrgente) category = 'urgente';
      else if (isStockBajo) category = 'bajo';

      // Semáforo: Verde (> mitad), Amarillo (<= mitad), Rojo (<= 2), Gris (faltante)
      let statusColor = 'green';
      if (isFaltante) statusColor = 'gray';
      else if (diasRestantes !== null) {
        if (diasRestantes <= 2) statusColor = 'red';
        else if (diasRestantes <= (item.totalDays / 2)) statusColor = 'yellow';
      }

      return {
        id: item.id || id,
        ...item,
        categoriaPrincipal: catPrincipal,
        subcategoria: subCat,
        unidad,
        esUnidad,
        totalStock,
        totalOriginal,
        diasTranscurridos,
        diasRestantes,
        category,
        statusColor
      };
    }).filter(Boolean);

    return res;
  }, [stockData]);

  // ── Handler de Carga Simplificada por Unidad (Ajo, Choclo, Almacén) ─────────
  const handleConfirmCargaUnidad = ({ productoId, nombre, subcategoria, costoTotal, cantidad, costoUnitario, fecha }) => {
    const current = stockDataRef.current || {};
    let targetId = productoId;
    let prod = targetId ? current[targetId] : null;

    if (!prod && nombre) {
      targetId = Object.keys(current).find(id => norm(current[id]?.nombre) === norm(nombre));
      if (targetId) prod = current[targetId];
    }

    const catPrincipal = prod?.categoriaPrincipal || getCategoriaPrincipal(nombre);
    const subCat = subcategoria || prod?.subcategoria || (catPrincipal === 'Almacén' ? getSubcategoriaAlmacen(nombre) : '');

    if (!prod) {
      // Producto nuevo creado al vuelo (ej: Harina leudante Favorita)
      targetId = 'alm_custom_' + Date.now();
      prod = {
        id: targetId,
        nombre: nombre.trim(),
        fila: null,
        stock: { '500g': 0, '1kg': 0, unidades: 0 },
        originalLoad: { '500g': 0, '1kg': 0, unidades: 0 },
        ultimoBandejeado: fecha,
        tipo: 'otros',
        categoriaPrincipal: catPrincipal,
        subcategoria: subCat,
        unidad: 'unidad',
        esUnidad: true,
        totalDays: 30,
        urgentDays: 25
      };
    }

    const stockActual = Number(prod.stock?.unidades ?? prod.stock?.['1kg']) || 0;
    const nuevoStock = stockActual + cantidad;
    const origActual = Number(prod.originalLoad?.unidades ?? prod.originalLoad?.['1kg']) || 0;
    const nuevoOrig = Math.max(origActual, nuevoStock);

    const updatedProd = {
      ...prod,
      categoriaPrincipal: catPrincipal,
      subcategoria: subCat,
      stock: {
        '500g': 0,
        '1kg': nuevoStock,
        unidades: nuevoStock
      },
      originalLoad: {
        '500g': 0,
        '1kg': nuevoOrig,
        unidades: nuevoOrig
      },
      ultimoBandejeado: fecha
    };

    const newData = { ...current, [targetId]: updatedProd };
    setStockData(newData);
    syncWithSheet(updatedProd);

    // Guardar en cache local para persistencia inmediata
    try {
      const unitsCache = JSON.parse(localStorage.getItem('huerta_stock_units_cache_v1') || '{}');
      unitsCache[norm(updatedProd.nombre)] = {
        stock: nuevoStock,
        originalLoad: nuevoOrig,
        fecha,
        subcategoria: subCat,
        costoUnitario,
        costoTotal,
        cantidad
      };
      localStorage.setItem('huerta_stock_units_cache_v1', JSON.stringify(unitsCache));

      // Guardar lista de productos personalizados de almacén
      const customSaved = JSON.parse(localStorage.getItem('huerta_custom_almacen_prods_v1') || '[]');
      if (!customSaved.some(cp => norm(cp.nombre) === norm(updatedProd.nombre))) {
        customSaved.push({
          id: targetId,
          nombre: updatedProd.nombre,
          subcategoria: subCat,
          categoriaPrincipal: catPrincipal,
          unidad: 'unidad',
          tipo: 'otros'
        });
        localStorage.setItem('huerta_custom_almacen_prods_v1', JSON.stringify(customSaved));
      }
    } catch (e) {}

    // Actualizar catálogo de costos en contexto y localStorage
    if (typeof setProductosCostos === 'function') {
      setProductosCostos(prev => {
        const list = prev || [];
        const exists = list.some(item => item.id === targetId || norm(item.nombre) === norm(updatedProd.nombre));
        if (exists) {
          const next = list.map(item => {
            if (item.id === targetId || norm(item.nombre) === norm(updatedProd.nombre)) {
              return {
                ...item,
                costo_kilo: costoUnitario > 0 ? costoUnitario : item.costo_kilo,
                costo_cajon: costoTotal > 0 ? costoTotal : item.costo_cajon,
                kilos_cajon: cantidad > 0 ? cantidad : item.kilos_cajon,
                costoUnitario: costoUnitario > 0 ? costoUnitario : item.costoUnitario,
                precioCajon: costoTotal > 0 ? costoTotal : item.precioCajon,
                cantidadCajon: cantidad > 0 ? cantidad : item.cantidadCajon,
                subcategoria: subCat || item.subcategoria,
                categoriaPrincipal: catPrincipal,
                unidad: 'unidad'
              };
            }
            return item;
          });
          try { localStorage.setItem(COSTOS_KEY, JSON.stringify(next)); } catch(e){}
          return next;
        } else {
          const nuevoCosto = {
            id: targetId,
            nombre: updatedProd.nombre,
            costo_kilo: costoUnitario,
            costo_cajon: costoTotal,
            kilos_cajon: cantidad,
            costoUnitario: costoUnitario,
            precioCajon: costoTotal,
            cantidadCajon: cantidad,
            margen: 60,
            precioMaxManual: null,
            activo: true,
            categoria: 'otros',
            categoriaPrincipal: catPrincipal,
            subcategoria: subCat,
            unidad: 'unidad'
          };
          const nextList = [...list, nuevoCosto];
          try { localStorage.setItem(COSTOS_KEY, JSON.stringify(nextList)); } catch(e){}
          return nextList;
        }
      });
    }

    setLastScan({
      ok: true,
      productoNombre: updatedProd.nombre,
      peso: cantidad,
      slot: `${cantidad} uds (Total: ${nuevoStock})`,
      stockRestante: nuevoStock,
      ts: Date.now(),
      accion: 'Carga'
    });
    setScanLog(prev => [{
      ok: true,
      productoNombre: updatedProd.nombre,
      peso: cantidad,
      slot: `${cantidad} uds (Total: ${nuevoStock})`,
      ts: Date.now(),
      accion: 'Carga',
      stockRestante: nuevoStock
    }, ...prev].slice(0, 8));
  };

  // ── Handler de Asociación de Código EAN ─────────────────────────────────────
  const handleConfirmAsociarEan = ({ ean, productoId, nombre, subcategoria, unidad }) => {
    asociarEanAProducto(ean, { productoId, nombre, subcategoria, unidad });

    const current = stockDataRef.current || {};
    let matchedId = productoId && current[productoId] ? productoId : null;
    if (!matchedId) {
      matchedId = Object.keys(current).find(id => norm(current[id]?.nombre) === norm(nombre));
    }

    if (matchedId && current[matchedId]) {
      const prod = current[matchedId];
      const stockActual = Number(prod.stock?.unidades ?? prod.stock?.['1kg']) || 0;
      const nuevoStock = stockActual + 1;
      const updatedProd = {
        ...prod,
        subcategoria: subcategoria || prod.subcategoria,
        stock: {
          ...prod.stock,
          '1kg': nuevoStock,
          unidades: nuevoStock
        },
        originalLoad: {
          ...prod.originalLoad,
          '1kg': Math.max(Number(prod.originalLoad?.unidades ?? prod.originalLoad?.['1kg']) || 0, nuevoStock),
          unidades: Math.max(Number(prod.originalLoad?.unidades ?? prod.originalLoad?.['1kg']) || 0, nuevoStock)
        }
      };
      const newData = { ...current, [matchedId]: updatedProd };
      setStockData(newData);
      syncWithSheet(updatedProd);

      setLastScan({
        ok: true,
        productoNombre: prod.nombre,
        peso: 1,
        slot: '1 unidad',
        ts: Date.now(),
        accion: 'Carga',
        stockRestante: nuevoStock
      });
      setScanLog(prev => [{
        ok: true,
        productoNombre: prod.nombre,
        peso: 1,
        slot: '1 unidad',
        ts: Date.now(),
        accion: 'Carga',
        stockRestante: nuevoStock
      }, ...prev].slice(0, 8));
    }
  };


  const updateProductData = (pid, patch) => {
    const newData = { ...stockData };
    newData[pid] = { ...newData[pid], ...patch };
    setStockData(newData);
    syncWithSheet(newData[pid]);
  };

  const guardarCarga = (pid, formData) => {
    const { stock_1kg, stock_500g, fecha } = formData;
    const newData = { ...stockData };
    const prod = newData[pid];
    
    // Asignación automática de días según tipo al cargar
    const typeDef = DEFAULTS_BY_TYPE[prod.tipo] || DEFAULTS_BY_TYPE['hoja verde'];
    prod.totalDays = typeDef.totalDays;
    prod.urgentDays = typeDef.alertDays;

    prod.stock['1kg'] = Math.max(0, Number(stock_1kg) || 0);
    prod.stock['500g'] = Math.max(0, Number(stock_500g) || 0);
    prod.originalLoad = { ...prod.stock }; 
    prod.ultimoBandejeado = fecha;
    
    setStockData(newData);
    syncWithSheet(prod);
    setShowFormId(null);
  };

  if (cargando) return <div className="flex flex-col items-center justify-center min-h-[400px] text-gray-500 gap-4"><Loader2 className="animate-spin text-green-500" size={40} /><p className="animate-pulse font-bold text-xs uppercase tracking-widest text-center">Cargando Stock...</p></div>;
  if (error) return <div className="bg-red-500/10 border border-red-500/20 rounded-[2rem] p-10 text-center space-y-4"><AlertCircle className="mx-auto text-red-500" size={48} /><h3 className="text-white font-bold text-lg">Error</h3><p className="text-red-400 text-sm max-w-md mx-auto">{error}</p><button onClick={cargarStockDesdeSheet} className="bg-red-500 text-white px-6 py-2 rounded-xl text-xs font-bold uppercase">Reintentar</button></div>;

  const toggleCategory = (cat) => {
    setExpandedCategory(expandedCategory === cat ? null : cat);
  };

  return (
    <div className="space-y-6 pb-20">

      {/* ═══════════════════════════════════════════════════════════════════
           ZONA DE ESCANEO + PESAR Y ETIQUETAR — sub-pestañas internas
      ════════════════════════════════════════════════════════════════════ */}
      {/* Sub-pestañas internas */}
      <div className="flex bg-black/40 border border-white/5 rounded-2xl p-1 gap-1">
        <button
          onClick={() => setStockSubTab('escanear')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-200 ${
            stockSubTab === 'escanear'
              ? 'bg-green-600 text-white shadow-lg shadow-green-900/40'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          <ScanBarcode size={13} />
          Escanear
        </button>
        <button
          onClick={() => setStockSubTab('pesar')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-200 ${
            stockSubTab === 'pesar'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          <Scale size={13} />
          Pesar y Etiquetar
        </button>
      </div>

      {/* ── SUB-PESTAÑA: PESAR Y ETIQUETAR ──────────────────────────────── */}
      {stockSubTab === 'pesar' && (
        <PesarYEtiquetar stockData={stockData} setStockData={setStockData} syncWithSheet={syncWithSheet} />
      )}

      {/* ── SUB-PESTAÑA: ESCANEAR ────────────────────────────────────────── */}
      {stockSubTab === 'escanear' && (
      <div className={`border rounded-3xl p-5 shadow-2xl transition-all duration-300 ${
        scanMode === 'carga'
          ? 'bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 border-white/10'
          : 'bg-gradient-to-br from-gray-900 via-[#0d1a14] to-gray-900 border-orange-500/20'
      }`}>
        {/* Toggle CARGA / GESTIÓN */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex bg-black/40 border border-white/5 rounded-2xl p-1 gap-1 flex-1">
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                setScanMode('carga');
                setGestionPending(null);
                setScanError(null);
                setTimeout(() => scanInputRef.current?.focus(), 50);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-200 cursor-pointer ${
                scanMode === 'carga'
                  ? 'bg-green-600 text-white shadow-lg shadow-green-900/40'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <Zap size={13} />
              Carga
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                setScanMode('gestion');
                setGestionPending(null);
                setCargaPendiente([]);
                setScanError(null);
                setTimeout(() => scanInputRef.current?.focus(), 50);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-200 cursor-pointer ${
                scanMode === 'gestion'
                  ? 'bg-orange-500 text-white shadow-lg shadow-orange-900/40'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <ClipboardList size={13} />
              Gestión
            </button>
          </div>
          {scanLog.length > 0 && (
            <button
              onClick={() => setScanLog([])}
              className="p-2.5 rounded-xl bg-white/5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0 cursor-pointer"
              title="Limpiar historial"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>

        {/* Descripción del modo activo */}
        <div className="flex items-center gap-2.5 mb-4 px-1">
          <ScanBarcode size={14} className={scanMode === 'carga' ? 'text-green-400' : 'text-orange-400'} />
          <p className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">
            {scanMode === 'carga'
              ? 'Escaneo → acumula en lista — confirmá para subir al stock'
              : 'Escaneo → se abre popup en pantalla para elegir qué hacer con la bolsa'}
          </p>
        </div>

        {/* Campo de escaneo con botón de Carga Manual */}
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <div className={`w-2 h-2 rounded-full transition-all ${
                document.activeElement === scanInputRef.current
                  ? 'bg-green-400 shadow-[0_0_8px_2px_rgba(74,222,128,0.6)] animate-pulse'
                  : 'bg-gray-600'
              }`} />
            </div>
            <input
              ref={scanInputRef}
              type="text"
              value={scanBuffer}
              onChange={handleScanInput}
              onKeyDown={handleScanKeyDown}
              onBlur={() => setTimeout(refocusScanner, 100)}
              placeholder="Apuntá la pistola y escaneá — PAPA-1.120"
              className="w-full bg-black/40 border border-white/10 focus:border-green-500/60 text-white text-sm font-mono rounded-2xl pl-10 pr-4 py-3.5 outline-none transition-all placeholder:text-gray-600 focus:bg-black/60 focus:shadow-[0_0_20px_rgba(74,222,128,0.08)]"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <button
            type="button"
            onClick={() => setManualModal({
              open: true,
              code: '',
              productoId: Object.keys(stockData || {})[0] || '',
              peso: '1.000',
              modo: scanMode
            })}
            className="flex items-center gap-1.5 px-4 py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 text-xs font-bold transition-all cursor-pointer shrink-0 shadow-sm active:scale-95"
            title="Cargar o asignar bolsa manualmente con código"
          >
            <Plus size={15} className="text-green-400" />
            <span className="hidden sm:inline">Carga manual</span>
            <span className="sm:hidden">Manual</span>
          </button>
        </div>

        {/* Modal de Carga Manual / Asignación de Código */}
        {manualModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-150"
            onClick={(e) => {
              if (e.target === e.currentTarget) setManualModal(null);
            }}
          >
            <form
              onSubmit={handleManualSubmit}
              className="bg-gradient-to-b from-gray-900 via-[#131714] to-gray-900 border border-green-500/40 rounded-3xl p-6 max-w-md w-full shadow-[0_0_50px_rgba(34,197,94,0.25)] animate-in zoom-in-95 duration-150 space-y-4"
            >
              <div className="flex items-start justify-between border-b border-green-500/20 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400">
                    <ScanBarcode size={18} />
                  </div>
                  <div>
                    <span className="text-green-400 text-[10px] font-black uppercase tracking-widest block">
                      Carga Manual de Bolsa
                    </span>
                    <span className="text-gray-400 text-[11px] font-mono">
                      Ingresá o confirmá el código y producto
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setManualModal(null)}
                  className="p-1.5 text-gray-500 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3.5">
                {/* Código de barras */}
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                    Código de barras de la bolsa
                  </label>
                  <input
                    type="text"
                    required
                    value={manualModal.code || ''}
                    onChange={(e) => setManualModal(prev => ({ ...prev, code: e.target.value }))}
                    placeholder="Ej: BANANA-1.000-E49A o 200001011205"
                    className="w-full bg-black/50 border border-white/15 focus:border-green-500/70 rounded-xl px-3.5 py-2.5 text-white font-mono text-xs uppercase outline-none"
                  />
                </div>

                {/* Selector de Producto */}
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                    Producto
                  </label>
                  <select
                    value={manualModal.productoId || ''}
                    onChange={(e) => setManualModal(prev => ({ ...prev, productoId: e.target.value }))}
                    className="w-full bg-black/60 border border-white/15 focus:border-green-500/70 rounded-xl px-3.5 py-2.5 text-white text-xs uppercase outline-none font-bold"
                  >
                    {Object.keys(stockData || {}).map(id => (
                      <option key={id} value={id} className="bg-gray-900 text-white">
                        {stockData[id]?.nombre?.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Peso */}
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                    Peso en Kilogramos (kg)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.05"
                    required
                    value={manualModal.peso || ''}
                    onChange={(e) => setManualModal(prev => ({ ...prev, peso: e.target.value }))}
                    placeholder="1.000"
                    className="w-full bg-black/50 border border-white/15 focus:border-green-500/70 rounded-xl px-3.5 py-2.5 text-white font-mono text-sm font-bold outline-none"
                  />
                  {/* Presets rápidos */}
                  <div className="flex gap-2 mt-2">
                    {['0.250', '0.500', '1.000', '1.500', '2.000'].map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setManualModal(prev => ({ ...prev, peso: p }))}
                        className={`flex-1 py-1 rounded-lg text-[10px] font-mono font-bold transition-all border cursor-pointer ${
                          manualModal.peso === p
                            ? 'bg-green-500/20 border-green-500 text-green-300'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        {p} kg
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setManualModal(null)}
                  className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs font-bold uppercase transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-[2] py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-xs font-black uppercase tracking-wider transition-all shadow-lg border-b-2 border-green-800 active:border-b-0 active:translate-y-px cursor-pointer"
                >
                  {manualModal.modo === 'gestion' ? 'Abrir Gestión' : 'Agregar a Carga'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Modal Popup de Gestión */}
        {gestionPending && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setGestionPending(null);
                setTimeout(refocusScanner, 50);
              }
            }}
          >
            <div className="bg-gradient-to-b from-gray-900 via-[#15110d] to-gray-900 border border-orange-500/40 rounded-3xl p-6 max-w-md w-full shadow-[0_0_50px_rgba(249,115,22,0.25)] animate-in zoom-in-95 duration-150 space-y-4">
              <div className="flex items-start justify-between border-b border-orange-500/20 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400">
                    <ClipboardList size={18} />
                  </div>
                  <div>
                    <span className="text-orange-400 text-[10px] font-black uppercase tracking-widest block">
                      Gestión de Bolsa Escaneada
                    </span>
                    <span className="text-gray-400 text-[11px] font-mono">
                      ¿Qué querés hacer con este producto?
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setGestionPending(null); setTimeout(refocusScanner, 50); }}
                  className="p-1.5 text-gray-500 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                  title="Cerrar (Esc)"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Información del Producto */}
              <div className="bg-black/50 border border-white/5 rounded-2xl p-4 space-y-2 text-center">
                {gestionPending.prod ? (
                  <>
                    <h3 className="text-white font-black text-lg uppercase tracking-tight">
                      {gestionPending.prod.nombre}
                    </h3>
                    
                    {/* Selector interactivo de slots y stock disponible en tiempo real */}
                    <div className="flex items-center justify-center gap-2 pt-1">
                      {['500g', '1kg'].map(s => {
                        const sLabel = DEFAULTS_BY_TYPE[gestionPending.prod?.tipo || 'hoja verde']?.labels[s === '500g' ? 'small' : 'large'] || s;
                        const sStock = gestionPending.prod?.stock?.[s] || 0;
                        const isCurrent = gestionPending.slot === s;
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => {
                              const newStockDisp = gestionPending.prod?.stock?.[s] || 0;
                              setGestionPending(prev => ({
                                ...prev,
                                slot: s,
                                feedbackSlotLabel: sLabel,
                                stockDisponible: newStockDisp,
                                sinStock: newStockDisp <= 0
                              }));
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                              isCurrent
                                ? 'bg-orange-500/20 border-orange-500 text-orange-300 shadow-sm'
                                : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
                            }`}
                          >
                            {sLabel}: <span className={sStock > 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>{sStock} disp.</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-center gap-2 text-xs font-mono text-gray-400 pt-1">
                      {gestionPending.peso > 0 && (
                        <span>Peso: <strong className="text-white font-bold">{gestionPending.peso.toFixed(3)} kg</strong></span>
                      )}
                      {gestionPending.uniqueCode && (
                        <span className="text-[10px] text-gray-500 font-mono">[{gestionPending.uniqueCode}]</span>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="text-amber-400 font-black text-base uppercase">
                      {gestionPending.nombre || 'Producto no identificado'}
                    </h3>
                    <p className="text-gray-500 text-xs font-mono break-all">
                      Código leído: {gestionPending.rawCode}
                    </p>
                    <p className="text-amber-500/70 text-[10px] mt-1">
                      No se encontró coincidencia en el inventario.
                    </p>
                  </>
                )}
              </div>

              {/* 1. Alerta de CÓDIGO BLOQUEADO (Dado de baja definitiva) */}
              {gestionPending.bloqueado && (
                <div className="bg-red-500/20 border-2 border-red-500/80 rounded-2xl p-4 text-center space-y-2 animate-in zoom-in-95 duration-200 shadow-[0_0_20px_rgba(239,68,68,0.2)]">
                  <div className="flex items-center justify-center gap-2 text-red-400 font-black text-sm uppercase tracking-wider">
                    <AlertCircle size={22} className="shrink-0 animate-bounce" />
                    <span>¡CÓDIGO BLOQUEADO (DADO DE BAJA)!</span>
                  </div>
                  <p className="text-red-200 text-xs font-medium leading-relaxed">
                    Esta bolsa fue eliminada / dada de baja definitiva del sistema {gestionPending.fechaModificacion ? `el ${gestionPending.fechaModificacion}` : ''}.
                  </p>
                  <p className="text-red-400 text-[10px] font-black uppercase tracking-wider">
                    🚫 El código de barra quedó bloqueado permanentemente y no puede volver a utilizarse.
                  </p>
                </div>
              )}

              {/* 2. Alerta de BOLSA PREVIAMENTE VENDIDA / SACADA (Devolución / No vendido) */}
              {!gestionPending.bloqueado && gestionPending.esReingreso && (
                <div className="bg-blue-500/15 border-2 border-blue-500/60 rounded-2xl p-4 text-center space-y-2 animate-in zoom-in-95 duration-200 shadow-[0_0_20px_rgba(59,130,246,0.15)]">
                  <div className="flex items-center justify-center gap-2 text-blue-400 font-black text-sm uppercase tracking-wider">
                    <RotateCcw size={20} className="shrink-0" />
                    <span>Bolsa previamente vendida / sacada</span>
                  </div>
                  <p className="text-blue-200 text-xs font-medium">
                    Esta bolsa salió del stock anteriormente ({gestionPending.regExistente?.ultimaAccion || 'Salida'}). Si no fue vendida o el cliente la devolvió, podés reingresarla al stock.
                  </p>
                </div>
              )}

              {/* 3. Alerta de SIN STOCK DISPONIBLE (solo en bolsas en stock normal cuando stock <= 0) */}
              {!gestionPending.bloqueado && !gestionPending.esReingreso && gestionPending.sinStock && (
                <div className="bg-red-500/15 border-2 border-red-500/60 rounded-2xl p-4 text-center space-y-2 animate-in zoom-in-95 duration-200 shadow-[0_0_20px_rgba(239,68,68,0.15)]">
                  <div className="flex items-center justify-center gap-2 text-red-400 font-black text-sm uppercase tracking-wider">
                    <AlertCircle size={20} className="shrink-0" />
                    <span>¡SIN STOCK DISPONIBLE!</span>
                  </div>
                  <p className="text-red-200/90 text-xs font-medium leading-relaxed">
                    Actualmente hay <strong className="text-white underline font-bold">0 bandejas</strong> en stock para {gestionPending.feedbackSlotLabel}.
                  </p>
                  <p className="text-red-400 text-[10px] font-black uppercase tracking-wider">
                    🚫 No podés sacar un producto sin stock
                  </p>
                </div>
              )}

              {/* 4. Indicador de STOCK DISPONIBLE */}
              {!gestionPending.bloqueado && !gestionPending.esReingreso && !gestionPending.sinStock && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-green-500/20 text-green-400">
                      <Package size={20} />
                    </div>
                    <div>
                      <span className="text-green-400 font-bold block">Stock disponible:</span>
                      <span className="text-gray-300 text-[11px]">
                        Si sacás 1 te quedarán <strong className="text-white font-bold">{Math.max(0, gestionPending.stockDisponible - 1)}</strong>
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black text-green-300 font-mono leading-none block">
                      {gestionPending.stockDisponible}
                    </span>
                    <span className="text-[10px] text-gray-400 font-bold uppercase">
                      {gestionPending.stockDisponible === 1 ? 'bandeja' : 'bandejas'}
                    </span>
                  </div>
                </div>
              )}

              {/* Botones de Acción */}
              <div className="space-y-2 pt-1">
                {/* Si es reingreso, ofrecer Reingresar al stock o Dar de baja definitiva */}
                {gestionPending.esReingreso && !gestionPending.bloqueado ? (
                  <>
                    <button
                      type="button"
                      onClick={() => applyGestionAccion('Reingresar al stock')}
                      className="bg-green-500/20 border border-green-500 hover:bg-green-500/30 rounded-2xl px-4 py-3 text-left transition-all active:scale-[0.98] cursor-pointer flex items-center gap-3.5 w-full shadow-lg group"
                    >
                      <span className="text-2xl shrink-0 group-hover:scale-110 transition-transform">
                        📥
                      </span>
                      <div className="min-w-0">
                        <span className="text-xs font-black uppercase tracking-wider block text-green-300">
                          Reingresar al stock (+1)
                        </span>
                        <span className="text-[10px] font-medium text-green-400/80 block mt-0.5 leading-tight">
                          No fue vendido o devuelto — suma 1 bolsa al inventario y queda disponible
                        </span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyGestionAccion('Dar de baja definitiva')}
                      className="bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 rounded-2xl px-4 py-3 text-left transition-all active:scale-[0.98] cursor-pointer flex items-center gap-3.5 w-full group"
                    >
                      <span className="text-2xl shrink-0 group-hover:scale-110 transition-transform">
                        🗑️
                      </span>
                      <div className="min-w-0">
                        <span className="text-xs font-black uppercase tracking-wider block text-red-300">
                          Dar de baja definitiva (Eliminar)
                        </span>
                        <span className="text-[10px] font-medium text-red-400/70 block mt-0.5 leading-tight">
                          Producto en mal estado — bloquea el código para que no se use nunca más
                        </span>
                      </div>
                    </button>
                  </>
                ) : (
                  [
                    {
                      accion: 'Sacar del stock',
                      emoji: '📤',
                      desc: 'Venta regular o bolsa retirada — descuenta 1 bolsa del stock',
                      color: 'bg-red-500/10 border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50',
                      textColor: 'text-red-300',
                      descColor: 'text-red-400/70',
                    },
                    {
                      accion: 'Consumo propio',
                      emoji: '🍴',
                      desc: 'Sale del stock y registra el costo interno',
                      color: 'bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20 hover:border-blue-500/50',
                      textColor: 'text-blue-300',
                      descColor: 'text-blue-400/70',
                    },
                    {
                      accion: 'Liquidación',
                      emoji: '🏷️',
                      desc: 'Sale del stock y se envía a lista de liquidación',
                      color: 'bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20 hover:border-amber-500/50',
                      textColor: 'text-amber-300',
                      descColor: 'text-amber-400/70',
                    },
                    {
                      accion: 'Dar de baja definitiva',
                      emoji: '🗑️',
                      desc: 'Bolsa rota o podrida — descuenta y BLOQUEA el código permanentemente',
                      color: 'bg-rose-500/15 border-rose-500/40 hover:bg-rose-500/25 hover:border-rose-500/60',
                      textColor: 'text-rose-300',
                      descColor: 'text-rose-400/80',
                    },
                  ].map(({ accion, emoji, desc, color, textColor, descColor }) => {
                    const isDisabled = gestionPending.bloqueado || (gestionPending.sinStock && accion !== 'Dar de baja definitiva') || !gestionPending.prod;
                    return (
                      <button
                        key={accion}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => !isDisabled && applyGestionAccion(accion)}
                        className={`${color} border rounded-2xl px-4 py-3 text-left transition-all ${
                          isDisabled
                            ? 'opacity-35 cursor-not-allowed grayscale'
                            : 'active:scale-[0.98] cursor-pointer group'
                        } flex items-center gap-3.5 w-full`}
                      >
                        <span className={`text-2xl shrink-0 ${!isDisabled ? 'group-hover:scale-110 transition-transform' : ''}`}>
                          {emoji}
                        </span>
                        <div className="min-w-0">
                          <span className={`text-xs font-black uppercase tracking-wider block ${textColor}`}>
                            {accion}
                          </span>
                          <span className={`text-[10px] font-medium ${descColor} block mt-0.5 leading-tight`}>
                            {desc}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Mensaje de bloqueo si corresponde */}
              {(gestionPending.bloqueado || (!gestionPending.esReingreso && gestionPending.sinStock)) && (
                <p className="text-[10px] text-center font-bold text-gray-500 uppercase tracking-wider pt-1">
                  Acciones deshabilitadas para proteger la exactitud del stock.
                </p>
              )}

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => { setGestionPending(null); setTimeout(refocusScanner, 50); }}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors uppercase font-bold tracking-wider cursor-pointer"
                >
                  Cerrar (Esc)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Lista de carga pendiente (solo en modo CARGA) */}
        {scanMode === 'carga' && cargaPendiente.length > 0 && (
          <div className="mt-4 border border-green-500/20 bg-green-500/5 rounded-2xl overflow-hidden animate-in slide-in-from-top-1 duration-200">
            <div className="px-4 py-3 border-b border-green-500/10 flex items-center justify-between">
              <p className="text-green-400 text-[9px] font-black uppercase tracking-[0.25em]">Pendiente de confirmar</p>
              <p className="text-green-400/80 text-[10px] font-mono font-bold">{cargaPendiente.length} {cargaPendiente.length === 1 ? 'bolsa' : 'bolsas'} en total</p>
            </div>
            <div className="divide-y divide-white/5 max-h-[300px] overflow-y-auto custom-scrollbar">
              {(() => {
                const productCounts = {};
                const productTotals = {};
                let totalPeso = 0;
                
                const elements = cargaPendiente.map(item => {
                  productCounts[item.matchedId] = (productCounts[item.matchedId] || 0) + 1;
                  totalPeso += item.peso;
                  
                  if (!productTotals[item.matchedId]) {
                    productTotals[item.matchedId] = { nombre: item.nombre, bolsas: 0, peso: 0 };
                  }
                  productTotals[item.matchedId].bolsas += 1;
                  productTotals[item.matchedId].peso += item.peso;
                  
                  return (
                    <div key={item.id} className="flex items-center justify-between px-4 py-2.5 gap-3 group hover:bg-white/5 transition-colors">
                      <div className="min-w-0 flex items-center gap-2">
                        <p className="text-white text-xs font-bold uppercase tracking-tight truncate">{item.nombre}</p>
                        {item.esReingreso && (
                          <span className="text-[9px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded font-bold uppercase shrink-0">
                            Reingreso
                          </span>
                        )}
                        <span className="text-gray-500 text-[10px]">&mdash;</span>
                        <p className="text-gray-400 text-[10px] font-mono">bolsa {productCounts[item.matchedId]}</p>
                        {item.uniqueCode && (
                          <span className="text-[9px] text-gray-500 font-mono hidden sm:inline">[{item.uniqueCode}]</span>
                        )}
                      </div>
                      <div className="text-right shrink-0 flex items-center gap-3">
                        <span className="text-gray-500 text-[9px] font-mono">{item.slot}</span>
                        <p className="text-green-400 font-mono text-xs font-bold">{item.peso.toFixed(3)} kg</p>
                        <button
                          type="button"
                          onClick={() => setCargaPendiente(prev => prev.filter(p => p.id !== item.id))}
                          className="p-1 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-all cursor-pointer"
                          title="Eliminar esta bolsa de la lista"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                });

                return (
                  <>
                    {elements}
                    <div className="bg-green-500/10 px-4 py-3 border-t border-green-500/20">
                      <p className="text-green-400 text-[9px] font-black uppercase tracking-widest mb-2">Resumen por producto</p>
                      <div className="space-y-1 mb-3">
                        {Object.values(productTotals).map(pt => (
                          <div key={pt.nombre} className="flex justify-between items-center text-[10px]">
                            <span className="text-green-400/80 font-bold uppercase">{pt.nombre}</span>
                            <div className="flex gap-3 text-right">
                              <span className="text-green-400 font-black">{pt.bolsas} bolsas</span>
                              <span className="text-green-400/60 font-mono">{pt.peso.toFixed(3)} kg</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between items-center border-t border-green-500/10 pt-2">
                        <p className="text-green-400 text-[10px] font-black uppercase tracking-widest">Total General</p>
                        <div className="text-right flex gap-3 items-end">
                          <p className="text-green-400 font-black text-sm leading-none">{cargaPendiente.length} bolsas</p>
                          <p className="text-green-400/70 text-[10px] font-mono leading-none">{totalPeso.toFixed(3)} kg</p>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
            <div className="flex gap-2 p-3 border-t border-green-500/10">
              <button
                onClick={cancelarCarga}
                className="flex-1 py-2.5 rounded-xl bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 text-[11px] font-black uppercase tracking-widest transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarCarga}
                className="flex-[2] py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-[11px] font-black uppercase tracking-widest transition-all border-b-2 border-green-800 active:border-b-0 active:translate-y-px shadow-lg"
              >
                Confirmar todo al stock
              </button>
            </div>
          </div>
        )}

        {/* Feedback del último escaneo */}
        {!gestionPending && lastScan && lastScan.ok && lastScan.accion !== 'Pendiente' && (
          <div className="mt-3 flex items-center gap-2 px-1 animate-in slide-in-from-top-1 duration-200">
            <span className="text-green-400 font-bold text-base">✓</span>
            <p className="text-green-400 text-xs font-bold uppercase tracking-wide">
              {lastScan.productoNombre}
              <span className="text-green-300/70 font-normal ml-2">
                {lastScan.accion === 'Carga' ? '+1 bolsa' : `−1 bolsa · ${lastScan.accion}`} · {lastScan.slot} · {lastScan.peso} kg
              </span>
              {lastScan.stockRestante !== undefined && (
                <span className="ml-2.5 bg-green-500/20 text-green-300 px-2 py-0.5 rounded-md font-mono text-[11px] font-bold border border-green-500/30">
                  Stock actual: {lastScan.stockRestante} {lastScan.stockRestante === 1 ? 'bandeja' : 'bandejas'}
                </span>
              )}
            </p>
          </div>
        )}
        {/* Flash breve al escanear en modo carga */}
        {!gestionPending && lastScan && lastScan.ok && lastScan.accion === 'Pendiente' && (
          <div className="mt-3 flex items-center gap-2 px-1 animate-in slide-in-from-top-1 duration-200">
            <span className="text-green-400">✓</span>
            <p className="text-green-400 text-xs font-bold uppercase tracking-wide">
              {lastScan.productoNombre}
              <span className="text-green-300/60 font-normal ml-2">agregado a la lista · {lastScan.slot} · {lastScan.peso} kg</span>
            </p>
          </div>
        )}
        {!gestionPending && lastScan && !lastScan.ok && (
          <div className="mt-3 flex items-center gap-2 px-1">
            <span className="text-red-400">⚠</span>
            <p className="text-red-400 text-xs font-bold">{scanError}</p>
          </div>
        )}
        {!gestionPending && !lastScan && scanError && (
          <div className="mt-3 flex items-center gap-2 px-1">
            <span className="text-red-400">⚠</span>
            <p className="text-red-400 text-xs font-bold">{scanError}</p>
          </div>
        )}

        {/* Log de escaneos recientes */}
        {scanLog.length > 0 && (
          <div className="mt-4 border-t border-white/5 pt-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.25em]">
                  Últimos escaneos
                </p>
                <span className="bg-white/10 text-gray-300 text-[9px] font-mono px-2 py-0.5 rounded-full font-bold">
                  {scanLog.length}
                </span>
                {Object.keys(codigosProcesados).length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('¿Deseás reiniciar el registro de códigos únicos procesados?')) {
                        setCodigosProcesados({});
                        try { localStorage.removeItem(PROCESSED_CODES_KEY); } catch(e){}
                      }
                    }}
                    className="text-[9px] font-mono text-gray-500 hover:text-amber-400 transition-colors ml-1 cursor-pointer underline"
                    title="Reiniciar historial de códigos procesados para permitir volver a escanearlos"
                  >
                    ({Object.keys(codigosProcesados).length} códigos únicos)
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setScanLog([])}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-300 border border-white/5 hover:border-red-500/30 text-[10px] font-bold transition-all cursor-pointer"
                title="Eliminar toda la lista de escaneos"
              >
                <Trash2 size={12} />
                <span>Limpiar lista</span>
              </button>
            </div>

            <div className="space-y-1 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
              {scanLog.map((entry, i) => {
                const isAdd = entry.accion === 'Carga';
                return (
                  <div key={entry.ts || i} className={`group flex items-center justify-between gap-2 px-3 py-2 rounded-xl transition-all ${
                    i === 0
                      ? isAdd ? 'bg-green-500/10 border border-green-500/20' : 'bg-orange-500/10 border border-orange-500/20'
                      : 'bg-black/20 border border-white/5 hover:bg-white/5'
                  }`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-[10px] shrink-0 font-mono font-bold ${ isAdd ? 'text-green-400' : 'text-orange-400' }`}>
                        {isAdd ? '+1' : '−1'}
                      </span>
                      <p className="text-white text-xs font-bold uppercase truncate">{entry.productoNombre}</p>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      {!isAdd && <span className="text-orange-400/80 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-orange-500/10 border border-orange-500/20">{entry.accion}</span>}
                      <span className="text-gray-500 text-[9px] font-mono">{entry.slot}</span>
                      <span className={`text-[9px] font-mono font-bold ${ isAdd ? 'text-green-400' : 'text-orange-400' }`}>{entry.peso} kg</span>
                      {entry.stockRestante !== undefined && (
                        <span className="text-gray-300 bg-white/10 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded">
                          Stock: {entry.stockRestante}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setScanLog(prev => prev.filter((_, idx) => idx !== i))}
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-red-400 rounded transition-all cursor-pointer"
                        title="Eliminar este escaneo"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      )}{/* fin sub-pestaña escanear */}
      {/* ════════════════════════════════════════════════════════════════════ */}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Control de Stock</h2>
          <p className="text-gray-500 text-[10px] uppercase font-bold tracking-widest mt-1">Sincronizado vía Cloud API</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setModalCargaUnidad({ open: true, productoId: null, nombre: '', unidad: 'unidad' })}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-900/40 border-b-2 border-emerald-800 transition-all cursor-pointer"
          >
            <Plus size={14} />
            <span>Cargar Unidades (Almacén / Ajo / Choclo)</span>
          </button>
          <button onClick={cargarStockDesdeSheet} className="text-gray-500 hover:text-white transition-colors p-2.5 rounded-xl bg-white/5 cursor-pointer" title="Refrescar"><RotateCcw size={16} /></button>
        </div>
      </div>

      {/* ── BARRA DE CATEGORÍAS PRINCIPALES ────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-black/40 border border-white/10 rounded-2xl">
        {[
          { id: 'Todas', label: 'Todas', icon: '📦' },
          { id: 'Verduras', label: 'Verduras', icon: '🥬' },
          { id: 'Frutas', label: 'Frutas', icon: '🍎' },
          { id: 'Almacén', label: 'Almacén', icon: '🥫' },
          { id: 'Extras', label: 'Extras', icon: '🥚' },
          { id: 'Carnes', label: 'Carnes', icon: '🥩' }
        ].map(tab => {
          const count = tab.id === 'Todas' 
            ? processedData.length 
            : processedData.filter(p => p.categoriaPrincipal === tab.id).length;
          const isActive = categoriaFiltro === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCategoriaFiltro(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                isActive
                  ? 'bg-emerald-600 text-white font-black shadow-lg shadow-emerald-900/40 border border-emerald-400/30'
                  : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${isActive ? 'bg-black/30 text-white font-bold' : 'bg-white/5 text-gray-500'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── SELECTOR PERSISTENTE DE SUBCATEGORÍAS DE ALMACÉN ────────────── */}
      {categoriaFiltro === 'Almacén' && (
        <div className="p-4 bg-gradient-to-r from-purple-950/30 via-black/40 to-blue-950/30 border border-purple-500/20 rounded-2xl space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">🥫</span>
              <div>
                <h4 className="text-xs font-black text-white uppercase tracking-widest">Subcategorías de Almacén</h4>
                <p className="text-[10px] text-gray-400">Selector fijo para cargar productos sucesivos sin desplazamiento</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setModalCargaUnidad({
                  open: true,
                  productoId: null,
                  nombre: '',
                  unidad: 'unidad',
                  subcategoria: subcategoriaAlmacen !== 'Todas' ? subcategoriaAlmacen : 'Almacén seco'
                })}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md cursor-pointer border border-emerald-400/40"
              >
                <Plus size={14} />
                <span>+ Cargar Producto</span>
              </button>
              <span className="text-[10px] font-mono font-bold text-purple-300 bg-purple-500/20 border border-purple-500/30 px-2.5 py-1 rounded-lg">
                Activa: {subcategoriaAlmacen}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'Bebidas', label: 'Bebidas', icon: '🥤' },
              { id: 'Almacén seco', label: 'Almacén seco', icon: '🍝' },
              { id: 'Limpieza', label: 'Limpieza', icon: '🧼' },
              { id: 'Lácteos', label: 'Lácteos', icon: '🧀' },
              { id: 'Golosinas', label: 'Golosinas', icon: '🍫' },
              { id: 'Todas', label: 'Ver Todas', icon: '📋' }
            ].map(sub => {
              const isSelected = subcategoriaAlmacen === sub.id;
              const subCount = sub.id === 'Todas'
                ? processedData.filter(p => p.categoriaPrincipal === 'Almacén').length
                : processedData.filter(p => p.categoriaPrincipal === 'Almacén' && p.subcategoria === sub.id).length;
              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setSubcategoriaAlmacen(sub.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-purple-600 text-white font-black shadow-lg shadow-purple-900/50 border border-purple-400/40'
                      : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-white/5'
                  }`}
                >
                  <span>{sub.icon}</span>
                  <span>{sub.label}</span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-black/40 text-purple-200">
                    {subCount}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <StatusAccordion title="URGENTE VENDER" icon="🔴" items={processedData.filter(d => d.category === 'urgente')} isOpen={expandedCategory === 'urgente'} onToggle={() => toggleCategory('urgente')} color="red" type="urgente" />
        <StatusAccordion title="STOCK BAJO" icon="🟡" items={processedData.filter(d => d.category === 'bajo')} isOpen={expandedCategory === 'bajo'} onToggle={() => toggleCategory('bajo')} color="amber" type="bajo" />
        <StatusAccordion title="FALTANTE" icon="⚫" items={processedData.filter(d => d.category === 'faltante')} isOpen={expandedCategory === 'faltante'} onToggle={() => toggleCategory('faltante')} color="gray" type="faltante" />
        <LiquidacionAccordion 
          items={liquidacionItems} 
          isOpen={expandedCategory === 'liquidacion'} 
          onToggle={() => toggleCategory('liquidacion')} 
          onDeleteItem={eliminarItemLiquidacion}
          onClearAll={vaciarLiquidacion}
        />
      </div>

      {/* ── LISTADO DE PRODUCTOS SEGÚN CATEGORÍA SELECCIONADA ───────────── */}
      <div className="space-y-10 pt-10 border-t border-white/5">
        {(() => {
          let itemsToDisplay = processedData;
          if (categoriaFiltro !== 'Todas') {
            itemsToDisplay = itemsToDisplay.filter(p => p.categoriaPrincipal === categoriaFiltro);
            if (categoriaFiltro === 'Almacén' && subcategoriaAlmacen !== 'Todas') {
              itemsToDisplay = itemsToDisplay.filter(p => p.subcategoria === subcategoriaAlmacen);
            }
          }

          if (itemsToDisplay.length === 0) {
            return (
              <div className="py-12 text-center bg-black/20 border border-white/5 rounded-3xl p-6 space-y-3">
                <span className="text-3xl">📦</span>
                <h4 className="text-white font-bold text-sm uppercase tracking-wider">
                  No hay productos en {categoriaFiltro === 'Almacén' ? `Almacén (${subcategoriaAlmacen})` : categoriaFiltro}
                </h4>
                <p className="text-gray-400 text-xs max-w-sm mx-auto">
                  Podés incorporar productos a esta categoría con el botón de Carga Rápida o desde el Panel de Costos.
                </p>
                <button
                  type="button"
                  onClick={() => setModalCargaUnidad({ open: true, productoId: null, nombre: '', unidad: 'unidad' })}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider px-4 py-2.5 rounded-xl transition-all inline-flex items-center gap-2 cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Cargar Producto Nuevo</span>
                </button>
              </div>
            );
          }

          if (categoriaFiltro === 'Todas') {
            const catConfig = [
              { id: 'Verduras', label: '🥬 VERDURAS', color: 'text-green-500' },
              { id: 'Frutas', label: '🍎 FRUTAS', color: 'text-red-500' },
              { id: 'Almacén', label: '🥫 ALMACÉN', color: 'text-purple-400' },
              { id: 'Extras', label: '🥚 EXTRAS', color: 'text-amber-500' },
              { id: 'Carnes', label: '🥩 CARNES', color: 'text-rose-500' },
            ];

            return catConfig.map(cat => {
              const catItems = itemsToDisplay.filter(p => p.categoriaPrincipal === cat.id);
              if (catItems.length === 0) return null;

              return (
                <div key={cat.id} className="space-y-4">
                  <h3 className={`text-[11px] font-black ${cat.color} uppercase tracking-[0.3em] font-mono flex items-center gap-2`}>
                    {cat.label}
                    <span className="text-[10px] font-normal text-gray-500 font-sans">({catItems.length})</span>
                    <span className="h-[1px] flex-1 bg-white/5"></span>
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-[12px]">
                    {catItems.map(p => (
                      <ProductCard 
                        key={p.id} 
                        product={p} 
                        onUpdate={(patch) => updateProductData(p.id, patch)}
                        isAdding={showFormId === p.id}
                        onToggleAdd={() => setShowFormId(showFormId === p.id ? null : p.id)}
                        onSaveAdd={(data) => guardarCarga(p.id, data)}
                        onOpenCargaUnidades={(prod) => setModalCargaUnidad({ open: true, productoId: prod.id, nombre: prod.nombre, unidad: prod.unidad })}
                      />
                    ))}
                  </div>
                </div>
              );
            });
          }

          if (categoriaFiltro === 'Verduras') {
            return [
              { id: 'hoja verde', label: '🌿 HOJA VERDE', color: 'text-green-500' },
              { id: 'blando', label: '🍅 BLANDO', color: 'text-red-500' },
              { id: 'duro', label: '🥔 DURO', color: 'text-amber-500' }
            ].map(cat => {
              const catItems = itemsToDisplay.filter(p => p.tipo === cat.id);
              if (catItems.length === 0) return null;

              return (
                <div key={cat.id} className="space-y-4">
                  <h3 className={`text-[11px] font-black ${cat.color} uppercase tracking-[0.3em] font-mono flex items-center gap-2`}>
                    {cat.label}
                    <span className="text-[10px] font-normal text-gray-500 font-sans">({catItems.length})</span>
                    <span className="h-[1px] flex-1 bg-white/5"></span>
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-[12px]">
                    {catItems.map(p => (
                      <ProductCard 
                        key={p.id} 
                        product={p} 
                        onUpdate={(patch) => updateProductData(p.id, patch)}
                        isAdding={showFormId === p.id}
                        onToggleAdd={() => setShowFormId(showFormId === p.id ? null : p.id)}
                        onSaveAdd={(data) => guardarCarga(p.id, data)}
                        onOpenCargaUnidades={(prod) => setModalCargaUnidad({ open: true, productoId: prod.id, nombre: prod.nombre, unidad: prod.unidad })}
                      />
                    ))}
                  </div>
                </div>
              );
            });
          }

          return (
            <div className="space-y-4">
              <h3 className="text-[11px] font-black text-white uppercase tracking-[0.3em] font-mono flex items-center gap-2">
                {categoriaFiltro === 'Almacén' ? `🥫 ALMACÉN — ${subcategoriaAlmacen.toUpperCase()}` : categoriaFiltro.toUpperCase()}
                <span className="text-[10px] font-normal text-gray-500 font-sans">({itemsToDisplay.length})</span>
                <span className="h-[1px] flex-1 bg-white/5"></span>
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-[12px]">
                {itemsToDisplay.map(p => (
                  <ProductCard 
                    key={p.id} 
                    product={p} 
                    onUpdate={(patch) => updateProductData(p.id, patch)}
                    isAdding={showFormId === p.id}
                    onToggleAdd={() => setShowFormId(showFormId === p.id ? null : p.id)}
                    onSaveAdd={(data) => guardarCarga(p.id, data)}
                    onOpenCargaUnidades={(prod) => setModalCargaUnidad({ open: true, productoId: prod.id, nombre: prod.nombre, unidad: prod.unidad })}
                  />
                ))}
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── MODAL: CARGA RÁPIDA POR UNIDAD (Choclo, Ajo, Almacén) ──────── */}
      {modalCargaUnidad?.open && (
        <ModalCargaUnidad
          isOpen={modalCargaUnidad.open}
          onClose={() => setModalCargaUnidad(null)}
          initialProduct={modalCargaUnidad.productoId ? stockData[modalCargaUnidad.productoId] : null}
          stockData={stockData}
          onConfirmCarga={handleConfirmCargaUnidad}
        />
      )}

      {/* ── MODAL: ASOCIAR CÓDIGO EAN A PRODUCTO DE ALMACÉN ─────────────── */}
      {modalEanAsociar?.open && (
        <ModalEanAsociar
          isOpen={modalEanAsociar.open}
          onClose={() => setModalEanAsociar(null)}
          ean={modalEanAsociar.ean}
          stockData={stockData}
          onConfirmAsociar={handleConfirmAsociarEan}
        />
      )}
    </div>
  );
}

function StatusAccordion({ title, icon, items, isOpen, onToggle, color, type }) {
  const colorMap = { 
    red: 'bg-red-500/5 border-red-500/20 text-red-500 hover:bg-red-500/10', 
    amber: 'bg-amber-500/5 border-amber-500/20 text-amber-500 hover:bg-amber-500/10', 
    gray: 'bg-gray-800/10 border-gray-700/50 text-gray-400 hover:bg-gray-800/20' 
  };

  return (
    <div className={`${colorMap[color]} border rounded-2xl overflow-hidden transition-all duration-300`}>
      <button onClick={onToggle} className="w-full flex items-center justify-between p-4 lg:p-5">
        <div className="flex items-center gap-3">
          <span className="text-sm">{icon}</span>
          <h3 className="font-black text-[13px] uppercase tracking-widest">{title}</h3>
          <span className="bg-white/5 px-3 py-0.5 rounded-full text-[10px] font-mono">{items.length} {items.length === 1 ? 'producto' : 'productos'}</span>
        </div>
        {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {isOpen && (
        <div className="p-4 pt-0 lg:p-6 lg:pt-0 border-t border-white/5 animate-in slide-in-from-top-2 duration-200">
          {items.length === 0 ? (
            <div className="py-8 text-center bg-black/20 rounded-xl">
              <span className="text-xl">✅</span>
              <p className="text-[10px] font-black uppercase text-gray-500 mt-2 tracking-widest">Todo bien</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-[12px] pt-4">
              {items.map(p => {
                const labels = DEFAULTS_BY_TYPE[p.tipo]?.labels || { small: '500g', large: '1kg' };
                const esUnidad = p.esUnidad || p.unidad === 'unidad';
                return (
                  <div key={p.id} className="bg-black/30 border border-white/5 rounded-2xl p-4 flex flex-col justify-between hover:bg-black/40 transition-all">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-white font-bold text-xs truncate pr-2">{p.nombre}</span>
                    </div>
                    {esUnidad ? (
                      <div className="flex gap-1 mb-2">
                        <div className="flex-1 bg-white/5 rounded-lg py-1.5 text-center">
                          <span className="text-[10px] font-black text-emerald-400 font-mono">
                            {p.totalStock} <span className="text-[7px] text-gray-400 uppercase">UDS</span>
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-1 mb-2">
                        <div className="flex-1 bg-white/5 rounded-lg py-1 text-center">
                           <span className="text-[9px] font-black text-white">{p.stock['1kg']} <span className="text-[7px] opacity-40 uppercase">{labels.large.replace('g','')}</span></span>
                        </div>
                        <div className="flex-1 bg-white/5 rounded-lg py-1 text-center">
                           <span className="text-[9px] font-black text-white">{p.stock['500g']} <span className="text-[7px] opacity-40 uppercase">{labels.small.replace('g','')}</span></span>
                        </div>
                      </div>
                    )}
                    <span className="text-[9px] font-mono opacity-50 text-right">
                      {type === 'urgente' ? `${p.diasTranscurridos}d` : `${p.totalStock}u`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LiquidacionAccordion({ items, isOpen, onToggle, onDeleteItem, onClearAll }) {
  const totalKg = items.reduce((acc, it) => acc + (Number(it.peso) || 0), 0);

  return (
    <div className="bg-gradient-to-r from-orange-500/10 via-[#1a120b] to-orange-500/5 border border-orange-500/30 rounded-2xl overflow-hidden transition-all duration-300 shadow-sm">
      <button 
        type="button"
        onClick={onToggle} 
        className="w-full flex items-center justify-between p-4 lg:p-5 cursor-pointer hover:bg-orange-500/10 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-base">🏷️</span>
          <h3 className="font-black text-[13px] uppercase tracking-widest text-orange-400">
            LIQUIDACIÓN
          </h3>
          <span className="bg-orange-500/20 text-orange-300 border border-orange-500/30 px-3 py-0.5 rounded-full text-[10px] font-mono font-bold">
            {items.length} {items.length === 1 ? 'bolsa' : 'bolsas'}
            {items.length > 0 && ` · ${totalKg.toFixed(3)} kg`}
          </span>
        </div>
        <div className="flex items-center gap-2 text-orange-400/70">
          {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>

      {isOpen && (
        <div className="p-4 pt-0 lg:p-6 lg:pt-0 border-t border-orange-500/10 animate-in slide-in-from-top-2 duration-200">
          {items.length === 0 ? (
            <div className="py-8 text-center bg-black/30 rounded-2xl border border-white/5 my-3">
              <span className="text-2xl opacity-60">🏷️</span>
              <p className="text-[11px] font-black uppercase text-gray-500 mt-2 tracking-widest">
                No hay productos en liquidación actualmente
              </p>
              <p className="text-gray-600 text-[10px] mt-1">
                Cuando escaneás una bolsa en Gestión y elegís "Liquidación", aparecerá aquí
              </p>
            </div>
          ) : (
            <div className="space-y-4 pt-4">
              {/* Barra de resumen y vaciado */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-black/40 border border-orange-500/20 rounded-xl px-4 py-2.5">
                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="text-orange-400/80 font-bold uppercase text-[10px] tracking-wider">
                    Total en Liquidación:
                  </span>
                  <span className="text-white font-black">{items.length} bolsas</span>
                  <span className="text-orange-400 font-bold">{totalKg.toFixed(3)} kg</span>
                </div>
                <button
                  type="button"
                  onClick={onClearAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 text-red-300 text-[10px] font-bold uppercase tracking-wider transition-all self-start sm:self-auto cursor-pointer"
                  title="Vaciar toda la lista de liquidación"
                >
                  <Trash2 size={12} />
                  <span>Vaciar liquidación</span>
                </button>
              </div>

              {/* Grid de bolsas en liquidación */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                {items.map((it, idx) => (
                  <div 
                    key={it.id || idx} 
                    className="bg-black/50 border border-orange-500/20 hover:border-orange-500/40 rounded-2xl p-3.5 flex flex-col justify-between transition-all group shadow-sm"
                  >
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <div className="min-w-0">
                        <span className="text-white font-black text-xs uppercase tracking-tight block truncate">
                          {it.nombre}
                        </span>
                        <span className="text-gray-500 text-[9px] font-mono block mt-0.5">
                          {it.fecha}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteItem(it.id)}
                        className="opacity-60 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all cursor-pointer shrink-0"
                        title="Eliminar esta bolsa de liquidación"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs font-mono">
                      <span className="bg-orange-500/10 text-orange-300 border border-orange-500/20 px-2 py-0.5 rounded-lg text-[10px] font-bold">
                        {it.slot || 'Bolsa'}
                      </span>
                      <span className="text-orange-400 font-black text-sm">
                        {Number(it.peso || 0).toFixed(3)} kg
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProductCard({ product, onUpdate, isAdding, onToggleAdd, onSaveAdd, onOpenCargaUnidades }) {
  const [editing, setEditing] = useState(false);
  // Estado local para edición de ajustes antes de guardar
  const [localSettings, setLocalSettings] = useState({ tipo: product.tipo, totalDays: product.totalDays, urgentDays: product.urgentDays });

  useEffect(() => {
    if (editing) setLocalSettings({ tipo: product.tipo, totalDays: product.totalDays, urgentDays: product.urgentDays });
  }, [editing, product]);

  const handleSaveSettings = () => {
    onUpdate(localSettings);
    setEditing(false);
  };

  const esUnidad = product.esUnidad || product.unidad === 'unidad';
  const catIcons = {
    'Verduras': '🥬',
    'Frutas': '🍎',
    'Almacén': '🥫',
    'Extras': '🥚',
    'Carnes': '🥩'
  };
  const typeConfig = DEFAULTS_BY_TYPE[product.tipo] || DEFAULTS_BY_TYPE['hoja verde'];
  const icon = product.categoriaPrincipal && catIcons[product.categoriaPrincipal] 
    ? catIcons[product.categoriaPrincipal] 
    : typeConfig.icon;
  const labels = typeConfig.labels;
  
  const cardStyles = { 
    red: 'bg-red-500/10 border-red-500/30 text-red-200', 
    yellow: 'bg-amber-500/10 border-amber-500/30 text-amber-100', 
    green: 'bg-green-500/10 border-green-500/20 text-green-100', 
    gray: 'bg-gray-800/20 border-gray-800 text-gray-500' 
  };

  const statusDot = { 
    red: 'bg-red-500 shadow-red-500', 
    yellow: 'bg-amber-500 shadow-amber-500', 
    green: 'bg-green-500 shadow-green-500', 
    gray: 'bg-gray-500' 
  };

  return (
    <div className={`${cardStyles[product.statusColor]} border rounded-3xl p-5 flex flex-col justify-between hover:scale-[1.02] transition-all relative group shadow-lg min-h-[230px]`}>
      <div className={`absolute top-4 right-4 w-2 h-2 rounded-full ${statusDot[product.statusColor]} shadow-[0_0_10px]`} />
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">{icon}</span>
          <h4 className="font-black text-white text-[14px] uppercase tracking-wide truncate leading-tight flex-1" title={product.nombre}>{product.nombre}</h4>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
             <span className="text-base">📦</span>
             {esUnidad ? (
               <p className="text-[12px] font-bold text-white flex items-center gap-1.5 flex-wrap">
                 <span className="text-emerald-400 font-mono font-black text-sm">{product.totalStock}</span>
                 <span>{product.totalStock === 1 ? 'unidad en stock' : 'unidades en stock'}</span>
                 {product.subcategoria && (
                   <span className="text-[9px] font-mono font-bold text-purple-300 bg-purple-500/20 border border-purple-500/30 px-2 py-0.5 rounded-full">
                     {product.subcategoria}
                   </span>
                 )}
               </p>
             ) : (
               <p className="text-[12px] font-bold">
                 {product.totalStock} {product.totalStock === 1 ? 'bandeja' : 'bandejas'} 
                 <span className="opacity-60 ml-1 font-medium">
                   ({product.stock['500g']}x{labels.small} | {product.stock['1kg']}x{labels.large})
                 </span>
               </p>
             )}
          </div>
          
          <div className="flex items-center gap-2 opacity-80">
             <span className="text-base">📅</span>
             <p className={`text-[12px] font-bold uppercase tracking-tight ${!product.ultimoBandejeado ? 'text-gray-600' : ''}`}>
               {!product.ultimoBandejeado ? 'Sin stock cargado aún' : 
                product.diasTranscurridos === 0 ? 'Cargado hoy' : 
                product.diasTranscurridos === 1 ? 'Cargado hace 1 día' : 
                `Cargado hace ${product.diasTranscurridos} días`}
             </p>
          </div>
        </div>
      </div>

      <div className="mt-auto pt-4 space-y-3">
        <div className="bg-black/30 p-3 rounded-2xl border border-white/5">
           {product.diasRestantes <= 0 ? (
             <p className="text-[13px] font-black text-red-500 flex items-center gap-2 animate-pulse">
               🔴 VENDER HOY
             </p>
           ) : (
             <div className="space-y-1">
               <p className="text-[12px] font-bold flex items-center gap-2">
                 <span className="text-blue-400">⏳</span> {product.diasRestantes} días restantes
               </p>
               {product.diasRestantes > 2 && (
                 <p className="text-[10px] font-black uppercase opacity-40 flex items-center gap-1">
                   ⚠️ Urgente en: {product.diasRestantes - 2} días
                 </p>
               )}
               {product.diasRestantes <= 2 && product.diasRestantes > 0 && (
                 <p className="text-[11px] font-black uppercase text-red-400 flex items-center gap-1">
                   ⚠️ Urgente: vender ahora
                 </p>
               )}
             </div>
           )}
        </div>

        {!isAdding ? (
          <div className="flex justify-between items-center gap-3">
            <button 
              onClick={() => {
                if (esUnidad && onOpenCargaUnidades) {
                  onOpenCargaUnidades(product);
                } else {
                  onToggleAdd();
                }
              }} 
              className={`flex-1 ${esUnidad ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-800' : 'bg-green-600 hover:bg-green-500 border-green-800'} text-white font-black text-[11px] py-3.5 rounded-xl shadow-lg border-b-4 active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-2 uppercase tracking-[0.1em] cursor-pointer`}
            >
              <Plus size={16} /> {esUnidad ? 'Cargar Uds' : 'Cargar'}
            </button>
            <button onClick={() => setEditing(true)} className="p-3.5 bg-white/5 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer">
              <Settings size={18}/>
            </button>
          </div>
        ) : (
          <div className="bg-gray-900 absolute inset-0 z-20 p-5 rounded-3xl animate-in fade-in zoom-in-95 flex flex-col justify-center">
            <AddStockInline nombre={product.nombre} labels={labels} currentStock={product.stock} onCancel={onToggleAdd} onSave={onSaveAdd} />
          </div>
        )}
      </div>
      {editing && (
        <div className="absolute inset-0 bg-gray-900/95 z-30 p-4 rounded-3xl flex flex-col justify-center gap-3 animate-in slide-in-from-bottom-2">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Ajustes</span>
            <button onClick={() => setEditing(false)}><X size={14} className="text-gray-500 hover:text-white"/></button>
          </div>
          <div className="space-y-1">
             <p className="text-[9px] text-gray-600 uppercase font-black">Categoría</p>
             <div className="grid grid-cols-3 gap-1">
                {Object.keys(DEFAULTS_BY_TYPE).map(t => (
                  <button 
                    key={t} 
                    onClick={() => {
                       const def = DEFAULTS_BY_TYPE[t];
                       setLocalSettings({ ...localSettings, tipo: t, totalDays: def.totalDays, urgentDays: def.alertDays });
                    }} 
                    className={`p-1.5 rounded text-[8px] font-black uppercase tracking-tighter ${localSettings.tipo === t ? 'bg-green-600 text-white' : 'bg-white/5 text-gray-500'}`}
                  >
                    {t.split(' ')[0]}
                  </button>
                ))}
             </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
                <p className="text-[8px] text-gray-600 uppercase font-black">Vida Útil</p>
                <input type="number" className="w-full bg-black text-[12px] font-bold text-white px-2 py-1.5 rounded border border-gray-800 outline-none" value={localSettings.totalDays} onChange={(e) => setLocalSettings({...localSettings, totalDays: Number(e.target.value)})} />
            </div>
            <div className="space-y-1">
               <p className="text-[8px] text-gray-600 uppercase font-black">Urgente</p>
               <input type="number" className="w-full bg-black text-[12px] font-bold text-white px-2 py-1.5 rounded border border-gray-800 outline-none" value={localSettings.urgentDays} onChange={(e) => setLocalSettings({...localSettings, urgentDays: Number(e.target.value)})} />
            </div>
          </div>
          <div className="pt-2 space-y-2">
            <button onClick={handleSaveSettings} className="w-full bg-green-600 hover:bg-green-500 text-white text-[10px] font-black uppercase py-2.5 rounded-xl shadow-lg border-b-2 border-green-800 active:border-0 active:translate-y-0.5">Guardar Cambios</button>
            <button onClick={() => { if(confirm("¿Resetear stock y fechas?")) onUpdate({ stock: { '500g': 0, '1kg': 0 }, ultimoBandejeado: null }); setEditing(false); }} className="w-full text-red-500/60 hover:text-red-500 text-[8px] font-bold uppercase py-1">Reset Stock</button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddStockInline({ nombre, labels, currentStock, onCancel, onSave }) {
  const [data, setData] = useState({ stock_1kg: currentStock['1kg'], stock_500g: currentStock['500g'], fecha: new Date().toISOString().split('T')[0] });
  return (
    <div className="flex flex-col h-full justify-between py-1">
      <div className="text-center border-b border-white/10 pb-1">
        <p className="text-[12px] font-black truncate uppercase tracking-widest text-green-400">{nombre}</p>
      </div>
      <div className="space-y-2 mt-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-gray-400 font-bold uppercase tracking-tighter">{labels.large}:</span>
          <input 
            type="number" 
            autoFocus
            className="w-16 h-8 bg-black text-sm font-black text-white px-2 rounded-lg border border-gray-700 focus:border-green-500 outline-none text-center"
            value={data.stock_1kg} 
            onChange={(e) => setData({...data, stock_1kg: e.target.value})} 
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-gray-400 font-bold uppercase tracking-tighter">{labels.small}:</span>
          <input 
            type="number" 
            className="w-16 h-8 bg-black text-sm font-black text-white px-2 rounded-lg border border-gray-700 focus:border-green-500 outline-none text-center"
            value={data.stock_500g} 
            onChange={(e) => setData({...data, stock_500g: e.target.value})} 
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[8px] font-black text-gray-600 uppercase tracking-widest ml-1">Fecha</label>
          <input 
            type="date" 
            className="w-full h-8 bg-black text-[12px] font-bold text-white px-2 rounded-lg border border-gray-700 focus:border-green-500 outline-none"
            value={data.fecha} 
            onChange={(e) => setData({...data, fecha: e.target.value})} 
          />
        </div>
      </div>
      <div className="flex gap-1.5 mt-3">
        <button onClick={onCancel} className="flex-1 h-9 bg-gray-800 text-gray-400 font-black text-[10px] uppercase tracking-tighter rounded-xl">Salir</button>
        <button onClick={() => onSave(data)} className="flex-[2] h-9 bg-green-600 text-white font-black text-[10px] uppercase tracking-widest rounded-xl border-b-2 border-green-800 shadow-md">Guardar</button>
      </div>
    </div>
  );
}

function ModalCargaUnidad({ isOpen, onClose, initialProduct, stockData, onConfirmCarga }) {
  const [modoCrear, setModoCrear] = useState(!initialProduct?.id);
  const [selectedId, setSelectedId] = useState(initialProduct?.id || '');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [subcategoria, setSubcategoria] = useState(initialProduct?.subcategoria || 'Almacén seco');
  const [costoTotal, setCostoTotal] = useState('');
  const [cantidad, setCantidad] = useState('6');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (initialProduct?.id) {
      setSelectedId(initialProduct.id);
      setModoCrear(false);
      if (initialProduct.subcategoria) setSubcategoria(initialProduct.subcategoria);
    } else if (initialProduct?.subcategoria) {
      setSubcategoria(initialProduct.subcategoria);
      setModoCrear(true);
    } else if (!selectedId && stockData) {
      const prodsList = Object.values(stockData);
      const firstUnit = prodsList.find(p => p.categoriaPrincipal === 'Almacén') || prodsList.find(p => p.esUnidad);
      if (firstUnit) {
        setSelectedId(firstUnit.id);
        if (firstUnit.subcategoria) setSubcategoria(firstUnit.subcategoria);
      }
    }
  }, [initialProduct, stockData]);

  if (!isOpen) return null;

  const prod = !modoCrear ? stockData?.[selectedId] : null;
  const nombreFinal = modoCrear ? nuevoNombre.trim() : (prod?.nombre || '');
  
  // Buscar si el producto nuevo ya existía en stockData por nombre
  const existingByName = modoCrear && nombreFinal
    ? Object.values(stockData || {}).find(p => norm(p.nombre) === norm(nombreFinal))
    : null;

  const activeItem = prod || existingByName;
  const stockActual = activeItem ? (Number(activeItem.stock?.unidades ?? activeItem.stock?.['1kg']) || 0) : 0;
  const cantNum = Math.max(0, parseInt(cantidad, 10) || 0);
  const costoNum = Math.max(0, parseFloat(costoTotal) || 0);
  const costoUnitario = cantNum > 0 && costoNum > 0 ? Math.round(costoNum / cantNum) : 0;
  const stockFinal = stockActual + cantNum;

  const handleNombreChange = (val) => {
    setNuevoNombre(val);
    const guessed = getSubcategoriaAlmacen(val);
    if (guessed) setSubcategoria(guessed);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!nombreFinal || cantNum <= 0) return;
    onConfirmCarga({
      productoId: activeItem?.id || (modoCrear ? null : selectedId),
      nombre: nombreFinal,
      subcategoria,
      costoTotal: costoNum,
      cantidad: cantNum,
      costoUnitario,
      fecha
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-gray-900 border border-emerald-500/40 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 animate-in zoom-in-95">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Zap size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider">Carga Rápida de Stock (Unidades)</h3>
              <p className="text-[10px] text-gray-400">Sumar al inventario y actualizar costo sin merma</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-white rounded-xl bg-white/5 transition-colors cursor-pointer">
            <X size={16} />
          </button>
        </div>

        {/* Selector de modo: Existente vs Nuevo */}
        <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 gap-1">
          <button
            type="button"
            onClick={() => setModoCrear(false)}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              !modoCrear ? 'bg-emerald-600 text-white font-black shadow-md' : 'text-gray-400 hover:text-white'
            }`}
          >
            Producto de la lista
          </button>
          <button
            type="button"
            onClick={() => setModoCrear(true)}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              modoCrear ? 'bg-emerald-600 text-white font-black shadow-md' : 'text-gray-400 hover:text-white'
            }`}
          >
            + Escribir nuevo
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!modoCrear ? (
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Seleccionar Producto</label>
              <select
                value={selectedId}
                onChange={(e) => {
                  setSelectedId(e.target.value);
                  const p = stockData?.[e.target.value];
                  if (p?.subcategoria) setSubcategoria(p.subcategoria);
                }}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2.5 text-white text-xs font-bold outline-none focus:border-emerald-500"
              >
                {Object.values(stockData || {})
                  .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
                  .map(p => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} ({p.categoriaPrincipal || 'Almacén'} {p.subcategoria ? `· ${p.subcategoria}` : ''})
                    </option>
                  ))}
              </select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Nombre del Producto</label>
              <input
                type="text"
                required
                placeholder="Ej: Latas de choclo, Harina leudante Favorita..."
                value={nuevoNombre}
                onChange={(e) => handleNombreChange(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2.5 text-white text-xs font-bold outline-none focus:border-emerald-500"
              />
            </div>
          )}

          {/* Subcategoría de Almacén */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Subcategoría de Almacén</label>
            <div className="grid grid-cols-3 gap-1.5">
              {['Bebidas', 'Almacén seco', 'Limpieza', 'Lácteos', 'Golosinas'].map(sub => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => setSubcategoria(sub)}
                  className={`py-2 px-1 text-[10px] font-bold rounded-xl border text-center transition-all cursor-pointer ${
                    subcategoria === sub
                      ? 'bg-purple-600/40 border-purple-500 text-purple-200 font-black shadow-sm'
                      : 'bg-black/30 border-white/5 text-gray-400 hover:text-white'
                  }`}
                >
                  {sub}
                </button>
              ))}
            </div>
          </div>

          {/* Cantidad y Costo Total */}
          <div className="grid grid-cols-2 gap-3">
            {/* Cantidad de unidades con botones rápidos */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Cantidad (Uds)</label>
                <div className="flex gap-1">
                  {[6, 12, 24].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setCantidad(String(n))}
                      className="text-[9px] font-mono font-bold bg-white/5 hover:bg-emerald-500/20 text-gray-400 hover:text-emerald-300 px-1.5 py-0.5 rounded cursor-pointer"
                    >
                      +{n}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="number"
                min="1"
                step="1"
                required
                placeholder="Ej: 6"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm font-mono font-bold outline-none focus:border-emerald-500"
              />
            </div>

            {/* Costo total */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Costo Total ($)</label>
              <input
                type="number"
                min="0"
                step="any"
                placeholder="Ej: 9000 (Opcional)"
                value={costoTotal}
                onChange={(e) => setCostoTotal(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm font-mono font-bold outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Fecha de ingreso */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Fecha de Ingreso</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-mono outline-none focus:border-emerald-500"
            />
          </div>

          {/* Resumen dinámico en vivo */}
          <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl space-y-1.5">
            {costoUnitario > 0 ? (
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-300 font-medium">Costo unitario nuevo:</span>
                <span className="text-emerald-400 font-mono font-black text-sm">
                  ${costoUnitario.toLocaleString('es-AR')} / unidad
                </span>
              </div>
            ) : (
              <p className="text-[10px] text-gray-400">
                💡 Podés ingresar el costo pagado ahora o cargarlo después en el Panel de Costos.
              </p>
            )}
            <div className="flex justify-between items-center text-xs pt-1.5 border-t border-emerald-500/20">
              <span className="text-gray-300 font-medium">Stock resultante:</span>
              <span className="text-white font-mono font-bold">
                {stockActual} + <span className="text-emerald-400">{cantNum}</span> = {stockFinal} unidades
              </span>
            </div>
          </div>

          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={cantNum <= 0 || !nombreFinal}
              className="flex-[2] py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-lg border-b-2 border-emerald-800 transition-all cursor-pointer"
            >
              Confirmar y Cargar (+{cantNum} Uds)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Modal de Asociación de Código EAN de Fábrica (Almacén) ────────────────────
function ModalEanAsociar({ isOpen, onClose, ean, stockData, onConfirmAsociar }) {
  const [selectedProdId, setSelectedProdId] = useState('');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [subcategoria, setSubcategoria] = useState('Almacén seco');
  const [modoCrear, setModoCrear] = useState(false);

  useEffect(() => {
    if (isOpen && stockData) {
      const almacenProds = Object.values(stockData).filter(p => p.categoriaPrincipal === 'Almacén');
      if (almacenProds.length > 0) {
        setSelectedProdId(almacenProds[0].id);
        setSubcategoria(almacenProds[0].subcategoria || 'Almacén seco');
      } else {
        const first = Object.values(stockData)[0];
        if (first) setSelectedProdId(first.id);
      }
    }
  }, [isOpen, stockData]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    let prodNombre = '';
    let prodId = selectedProdId;

    if (modoCrear) {
      if (!nuevoNombre.trim()) return;
      prodNombre = nuevoNombre.trim();
      prodId = null;
    } else {
      const prod = stockData?.[selectedProdId];
      if (!prod) return;
      prodNombre = prod.nombre;
    }

    onConfirmAsociar({
      ean,
      productoId: prodId,
      nombre: prodNombre,
      subcategoria,
      unidad: 'unidad'
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-gray-900 border border-purple-500/30 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 animate-in zoom-in-95">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <ScanBarcode size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider">Código EAN de Fábrica</h3>
              <p className="text-[10px] text-gray-400">Asociar código escaneado a un producto de Almacén</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-white rounded-xl bg-white/5 transition-colors cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="p-3 bg-black/40 border border-white/5 rounded-2xl flex items-center justify-between">
          <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Código detectado:</span>
          <span className="text-purple-300 font-mono font-black text-sm bg-purple-500/10 border border-purple-500/20 px-2.5 py-1 rounded-lg">
            {ean}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex bg-black/30 p-1 rounded-xl border border-white/5 gap-1">
            <button
              type="button"
              onClick={() => setModoCrear(false)}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                !modoCrear ? 'bg-purple-600 text-white font-black' : 'text-gray-400 hover:text-white'
              }`}
            >
              Producto existente
            </button>
            <button
              type="button"
              onClick={() => setModoCrear(true)}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                modoCrear ? 'bg-purple-600 text-white font-black' : 'text-gray-400 hover:text-white'
              }`}
            >
              Nuevo producto
            </button>
          </div>

          {!modoCrear ? (
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Seleccionar Producto</label>
              <select
                value={selectedProdId}
                onChange={(e) => {
                  setSelectedProdId(e.target.value);
                  const p = stockData?.[e.target.value];
                  if (p?.subcategoria) setSubcategoria(p.subcategoria);
                }}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2.5 text-white text-xs font-bold outline-none focus:border-purple-500"
              >
                {Object.values(stockData || {})
                  .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
                  .map(p => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} ({p.categoriaPrincipal || 'Almacén'} {p.subcategoria ? `· ${p.subcategoria}` : ''})
                    </option>
                  ))}
              </select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Nombre del Producto</label>
              <input
                type="text"
                required
                placeholder="Ej: Fideos Matarazzo 500g"
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2.5 text-white text-xs font-bold outline-none focus:border-purple-500"
              />
            </div>
          )}

          {/* Subcategoría de Almacén */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Subcategoría</label>
            <div className="grid grid-cols-3 gap-1.5">
              {['Bebidas', 'Almacén seco', 'Limpieza', 'Lácteos', 'Golosinas'].map(sub => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => setSubcategoria(sub)}
                  className={`py-2 px-2 text-[10px] font-bold rounded-xl border text-center transition-all cursor-pointer ${
                    subcategoria === sub
                      ? 'bg-purple-600/30 border-purple-500 text-purple-200 font-black'
                      : 'bg-black/30 border-white/5 text-gray-400 hover:text-white'
                  }`}
                >
                  {sub}
                </button>
              ))}
            </div>
          </div>

          <p className="text-[10px] text-gray-400 bg-white/5 p-3 rounded-xl">
            💡 En escaneos futuros, este código EAN sumará o descontará automáticamente 1 unidad del producto seleccionado.
          </p>

          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-[2] py-3 bg-purple-600 hover:bg-purple-500 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-lg border-b-2 border-purple-800 transition-all cursor-pointer"
            >
              Vincular Código y Sumar 1 Ud
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Web Serial API - Balanza Systel Clipse ──────────────────────────────────
// Configuración: 115200 baudios por defecto (según balanza), 8 bits, sin paridad, 1 stop bit (8N1)
const SERIAL_SCALE_CONFIG = {
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
};

function extraerPesoSystel(trama) {
  if (!trama) return null;
  const str = trama.replace(',', '.');

  // 1. Trama delimitada por STX (\x02) y ETX (\x03) típica de Systel
  const stxIdx = str.indexOf('\x02');
  const etxIdx = str.indexOf('\x03');
  if (stxIdx !== -1 && etxIdx !== -1 && etxIdx > stxIdx) {
    const payload = str.slice(stxIdx + 1, etxIdx);
    const m = payload.match(/([-+]?\d{1,4}\.\d{2,3})/);
    if (m) {
      const val = parseFloat(m[1]);
      if (!isNaN(val)) return val.toFixed(3);
    }
  }

  // 2. Patrón decimal estándar con 2 o 3 decimales (ej: "0.444", " 0.444 kg", "+0.444")
  const matchDecimal = str.match(/([-+]?\d{1,4}\.\d{2,3})/);
  if (matchDecimal) {
    const val = parseFloat(matchDecimal[1]);
    if (!isNaN(val)) return val.toFixed(3);
  }

  // 3. Patrón de 4 a 6 dígitos en gramos (ej: "00444" -> 0.444 kg)
  const matchEntero = str.match(/\b(\d{4,6})\b/);
  if (matchEntero) {
    const val = parseInt(matchEntero[1], 10) / 1000;
    if (!isNaN(val) && val >= 0 && val < 100) return val.toFixed(3);
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: Pesar y Etiquetar
// ─────────────────────────────────────────────────────────────────────────────
function PesarYEtiquetar({ stockData, setStockData, syncWithSheet }) {
  const productList = useMemo(() => {
    if (!stockData || typeof stockData !== 'object') return [];
    return Object.entries(stockData)
      .map(([id, p]) => ({ id, nombre: p.nombre }))
      .filter(p => p.nombre)
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [stockData]);

  const [selectedId, setSelectedId] = useState('');
  // ── Estado de peso dual-mode ─────────────────────────────────────────────
  // modoLiteral=false → modo calculadora: el usuario escribe solo dígitos,
  //   el punto decimal se inserta automáticamente antes de los últimos 3.
  // modoLiteral=true  → modo balanza: llegó un punto/coma programático;
  //   se muestra el valor tal cual lo mandó la balanza (con decimal).
  const [digitos, setDigitos] = useState('');       // modo calculadora
  const [rawLiteral, setRawLiteral] = useState(''); // modo balanza
  const [modoLiteral, setModoLiteral] = useState(false);
  const [sesion, setSesion] = useState([]);
  const [confirmando, setConfirmando] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const pesoRef = useRef(null);

  // ── Conexión Web Serial (Balanza Systel Clipse - 115200 baud) ────────────
  const [scaleConnected, setScaleConnected] = useState(false);
  const [scaleConnecting, setScaleConnecting] = useState(false);
  const [scaleError, setScaleError] = useState(null);
  const portRef = useRef(null);
  const readerRef = useRef(null);
  const isReadingRef = useRef(false);

  // Comando ENQ (0x05) silencioso en segundo plano por si la balanza opera por demanda
  const enviarENQSilencioso = useCallback(async () => {
    if (!portRef.current || !portRef.current.writable) return;
    try {
      const writer = portRef.current.writable.getWriter();
      await writer.write(new Uint8Array([0x05]));
      writer.releaseLock();
    } catch (err) {
      // silencioso
    }
  }, []);

  useEffect(() => {
    if (!scaleConnected) return;
    const interval = setInterval(() => {
      enviarENQSilencioso();
    }, 400);
    return () => clearInterval(interval);
  }, [scaleConnected, enviarENQSilencioso]);

  const aplicarPesoBalanza = useCallback((pesoStr) => {
    setModoLiteral(true);
    setRawLiteral(pesoStr);
    setDigitos('');
  }, []);

  const leerDatosBalanza = async (port) => {
    const decoder = new TextDecoder();
    let buffer = '';
    isReadingRef.current = true;

    try {
      const reader = port.readable.getReader();
      readerRef.current = reader;

      while (isReadingRef.current && port.readable) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value && value.length > 0) {
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          // 1. Procesar tramas delimitadas por STX (\x02) y ETX (\x03)
          let stxIdx = buffer.indexOf('\x02');
          let etxIdx = buffer.indexOf('\x03');

          while (stxIdx !== -1 && etxIdx !== -1 && etxIdx > stxIdx) {
            const tramaCompleta = buffer.slice(stxIdx, etxIdx + 1);
            const peso = extraerPesoSystel(tramaCompleta);
            if (peso !== null) {
              aplicarPesoBalanza(peso);
            }
            buffer = buffer.slice(etxIdx + 1);
            stxIdx = buffer.indexOf('\x02');
            etxIdx = buffer.indexOf('\x03');
          }

          // 2. Procesar por saltos de línea (\r o \n)
          const lineas = buffer.split(/[\r\n]+/);
          if (lineas.length > 1) {
            for (let i = 0; i < lineas.length - 1; i++) {
              const linea = lineas[i].trim();
              if (linea) {
                const peso = extraerPesoSystel(linea);
                if (peso !== null) {
                  aplicarPesoBalanza(peso);
                }
              }
            }
            buffer = lineas[lineas.length - 1];
          }

          if (buffer.length > 300) {
            buffer = buffer.slice(-60);
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('Lectura de balanza detenida:', err);
      }
    } finally {
      if (readerRef.current) {
        try {
          readerRef.current.releaseLock();
        } catch (e) {}
        readerRef.current = null;
      }
      setScaleConnected(false);
      isReadingRef.current = false;
    }
  };

  const conectarBalanza = async () => {
    if (!('serial' in navigator)) {
      setScaleError('Web Serial API no soportada. Usá Google Chrome o Microsoft Edge.');
      return;
    }

    try {
      setScaleConnecting(true);
      setScaleError(null);

      let port;
      const grantedPorts = await navigator.serial.getPorts();
      if (grantedPorts.length === 1 && !portRef.current) {
        port = grantedPorts[0];
      } else {
        port = await navigator.serial.requestPort();
      }

      await port.open({
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
      });
      portRef.current = port;
      setScaleConnected(true);
      setScaleConnecting(false);

      leerDatosBalanza(port);
    } catch (err) {
      console.error('Error al conectar balanza:', err);
      setScaleConnecting(false);
      setScaleConnected(false);
      if (err.name !== 'NotFoundError') {
        setScaleError(err.message || 'No se pudo conectar al puerto de la balanza');
      }
    }
  };

  const desconectarBalanza = async () => {
    isReadingRef.current = false;
    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
      }
      if (portRef.current) {
        setTimeout(async () => {
          try {
            await portRef.current?.close();
            portRef.current = null;
          } catch (e) {}
        }, 100);
      }
    } catch (err) {
      console.error('Error al desconectar balanza:', err);
    } finally {
      setScaleConnected(false);
      setScaleConnecting(false);
    }
  };

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      isReadingRef.current = false;
      if (readerRef.current) {
        readerRef.current.cancel().catch(() => {});
      }
      if (portRef.current) {
        portRef.current.close().catch(() => {});
      }
    };
  }, []);

  // Escuchar desconexión física del cable
  useEffect(() => {
    if (!('serial' in navigator)) return;
    const handleDisconnect = (e) => {
      if (e.target === portRef.current) {
        desconectarBalanza();
      }
    };
    navigator.serial.addEventListener('disconnect', handleDisconnect);
    return () => {
      navigator.serial.removeEventListener('disconnect', handleDisconnect);
    };
  }, []);

  // ── Helpers derivados ────────────────────────────────────────────────────
  const pesoKgActual = (() => {
    if (modoLiteral) {
      const v = parseFloat(rawLiteral.replace(',', '.'));
      return isNaN(v) ? 0 : v;
    }
    if (!digitos) return 0;
    return parseInt(digitos, 10) / 1000;
  })();

  const pesoDisplay = (() => {
    if (modoLiteral) return rawLiteral;
    if (!digitos) return '';
    return (parseInt(digitos, 10) / 1000).toFixed(3);
  })();

  const resetPeso = () => {
    setDigitos('');
    setRawLiteral('');
    setModoLiteral(false);
  };

  useEffect(() => {
    if (pesoRef.current) pesoRef.current.focus();
  }, []);

  useEffect(() => {
    if (!selectedId && productList.length > 0) {
      setSelectedId(productList[0].id);
    }
  }, [productList, selectedId]);

  const confirmarBolsa = useCallback(() => {
    if (!selectedId || pesoKgActual <= 0) return;

    const producto = productList.find(p => p.id === selectedId);
    if (!producto) return;

    // Generar identificador único alfanumérico por bolsa física (ej: E49A)
    const tagId = Math.random().toString(36).substring(2, 6).toUpperCase();

    const nuevaBolsa = {
      id: Date.now().toString() + Math.random(),
      productId: selectedId,
      nombre: producto.nombre,
      peso: Math.round(pesoKgActual * 1000) / 1000,
      tagId,
    };

    setSesion(prev => [...prev, nuevaBolsa]);
    imprimirEtiqueta(producto.nombre, nuevaBolsa.peso, tagId);

    resetPeso();
    setTimeout(() => pesoRef.current?.focus(), 50);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, pesoKgActual, productList]);

  // ── Teclado: dual-mode y Enter para confirmar ─────────────────────────────
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmarBolsa();
      return;
    }

    if (e.key === 'Backspace') {
      e.preventDefault();
      if (modoLiteral) {
        setRawLiteral(prev => {
          const next = prev.slice(0, -1);
          if (!next.includes('.') && !next.includes(',')) {
            setModoLiteral(false);
            setDigitos(next.replace(/\D/g, ''));
            return '';
          }
          return next;
        });
      } else {
        setDigitos(prev => prev.slice(0, -1));
      }
      return;
    }

    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      if (modoLiteral) {
        setRawLiteral(prev => prev + e.key);
      } else {
        setDigitos(prev => {
          if (prev.length >= 7) return prev;
          const next = prev + e.key;
          return next.replace(/^0+/, '') || '0';
        });
      }
      return;
    }

    if (e.key === '.' || e.key === ',') {
      e.preventDefault();
      if (!modoLiteral) {
        setRawLiteral(digitos + '.');
        setDigitos('');
        setModoLiteral(true);
      }
      return;
    }

    if (['+', '-', 'e', 'E'].includes(e.key)) {
      e.preventDefault();
    }
  };

  const confirmarTodoAlStock = async () => {
    if (sesion.length === 0) return;
    setConfirmando(true);

    const current = { ...stockData };
    const grouped = sesion.reduce((acc, item) => {
      if (!acc[item.productId]) acc[item.productId] = { nombre: item.nombre, bolsas: 0, pesoTotal: 0, items: [] };
      acc[item.productId].bolsas += 1;
      acc[item.productId].pesoTotal += item.peso;
      const prod = current[item.productId];
      const tipo = prod?.tipo || 'duro';
      const slot = determinarSlot(tipo, item.peso);
      acc[item.productId].items.push({ slot, peso: item.peso });
      return acc;
    }, {});

    const newData = { ...current };
    const today = new Date().toISOString().split('T')[0];

    for (const [id, group] of Object.entries(grouped)) {
      if (!newData[id]) continue;
      const prod = newData[id];
      const slots500 = group.items.filter(i => i.slot === '500g').length;
      const slots1kg = group.items.filter(i => i.slot === '1kg').length;
      const newStock = {
        '500g': prod.stock['500g'] + slots500,
        '1kg': prod.stock['1kg'] + slots1kg,
      };
      const newOriginalLoad = {
        '500g': Math.max(prod.originalLoad['500g'] || 0, newStock['500g']),
        '1kg': Math.max(prod.originalLoad['1kg'] || 0, newStock['1kg']),
      };
      newData[id] = { ...prod, stock: newStock, originalLoad: newOriginalLoad, ultimoBandejeado: today };
      syncWithSheet(newData[id]);
    }

    setStockData(newData);
    setConfirmando(false);
    setConfirmado(true);
    setSesion([]);
    setTimeout(() => setConfirmado(false), 3000);
  };

  const eliminarBolsa = (id) => {
    setSesion(prev => prev.filter(b => b.id !== id));
  };

  return (
    <div className="border border-purple-500/20 rounded-3xl p-5 sm:p-6 shadow-2xl bg-gradient-to-br from-gray-900 via-[#100d1a] to-gray-900 space-y-5 animate-in slide-in-from-top-2 duration-300">
      {/* Cabecera con estado de balanza */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-purple-500/10">
        <div className="flex items-center gap-2.5">
          <Scale size={18} className="text-purple-400 shrink-0" />
          <div>
            <h3 className="text-white text-xs font-black uppercase tracking-wider">
              Pesar y Etiquetar
            </h3>
            <p className="text-gray-500 text-[10px] font-bold tracking-wider">
              Balanza Systel Clipse (115200 baud)
            </p>
          </div>
        </div>

        {/* Botón de conexión / Indicador de estado */}
        <div>
          {scaleConnected ? (
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl px-3 py-1.5 shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-emerald-400 text-[10px] font-black uppercase tracking-widest leading-none">
                Balanza Conectada
              </span>
              <button
                onClick={desconectarBalanza}
                title="Desconectar balanza"
                className="ml-1 text-gray-500 hover:text-red-400 transition-colors p-0.5"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={conectarBalanza}
              disabled={scaleConnecting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-[10px] font-black uppercase tracking-wider bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 hover:text-white transition-all shadow-sm active:scale-95 disabled:opacity-50"
            >
              {scaleConnecting ? (
                <>
                  <Loader2 size={12} className="animate-spin text-purple-400" />
                  <span>Conectando...</span>
                </>
              ) : (
                <>
                  <Radio size={12} className="text-purple-400" />
                  <span>Conectar balanza</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {scaleError && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs animate-in slide-in-from-top-1">
          <AlertCircle size={14} className="shrink-0" />
          <span className="font-mono text-[11px] flex-1">{scaleError}</span>
          <button onClick={() => setScaleError(null)} className="text-red-400/60 hover:text-red-300">
            <X size={12} />
          </button>
        </div>
      )}

      {/* 1. Selector de producto arriba */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
          Producto
        </label>
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          className="w-full bg-black/50 border border-white/10 focus:border-purple-500/60 text-white text-sm font-bold rounded-2xl px-4 py-3 outline-none transition-all appearance-none cursor-pointer hover:border-purple-500/30"
        >
          {productList.map(p => (
            <option key={p.id} value={p.id} className="bg-gray-900">
              {p.nombre.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      {/* 2. Campo de peso que recibe automáticamente el dato de la balanza + Botón OK */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
            Peso (kg)
          </label>
          {scaleConnected && (
            <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Lectura automática en vivo
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <input
            ref={pesoRef}
            type="text"
            inputMode="numeric"
            value={pesoDisplay}
            onChange={() => {}} // controlado por balanza o teclado
            onKeyDown={handleKeyDown}
            placeholder="0.000"
            className="flex-1 bg-black/50 border border-white/10 focus:border-purple-500/60 text-white text-2xl font-black font-mono rounded-2xl px-4 py-3 outline-none transition-all placeholder:text-gray-700 focus:bg-black/70 focus:shadow-[0_0_20px_rgba(168,85,247,0.15)] text-center"
          />
          <button
            onClick={confirmarBolsa}
            disabled={!selectedId || pesoKgActual <= 0}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-black text-sm rounded-2xl border-b-2 border-purple-800 active:border-b-0 active:translate-y-px shadow-lg transition-all uppercase tracking-widest flex items-center gap-2"
          >
            <Printer size={16} />
            <span>OK</span>
          </button>
        </div>
      </div>

      {/* 3. Lista de bolsas confirmadas */}
      {sesion.length > 0 ? (
        <div className="border border-purple-500/20 bg-purple-500/5 rounded-2xl overflow-hidden animate-in slide-in-from-top-1 duration-200">
          <div className="px-4 py-3 border-b border-purple-500/10 flex items-center justify-between">
            <p className="text-purple-400 text-[10px] font-black uppercase tracking-[0.2em]">
              Bolsas confirmadas
            </p>
            <p className="text-purple-400/80 text-[10px] font-mono font-bold">
              {sesion.length} {sesion.length === 1 ? 'bolsa' : 'bolsas'}
            </p>
          </div>
          <div className="divide-y divide-white/5 max-h-[260px] overflow-y-auto custom-scrollbar">
            {sesion.map((bolsa, i) => (
              <div
                key={bolsa.id}
                className="flex items-center justify-between px-4 py-2.5 gap-3 group hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-purple-400/60 text-[11px] font-mono font-bold w-6 text-right shrink-0">
                    #{i + 1}
                  </span>
                  <p className="text-white text-xs font-bold uppercase tracking-tight truncate">
                    {bolsa.nombre}
                  </p>
                  {bolsa.tagId && (
                    <span className="text-[9px] font-mono bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-bold border border-purple-500/30 shrink-0">
                      #{bolsa.tagId}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <p className="text-purple-400 font-mono text-xs font-black">
                    {bolsa.peso.toFixed(3)} kg
                  </p>
                  <button
                    onClick={() => eliminarBolsa(bolsa.id)}
                    title="Eliminar bolsa de la sesión"
                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-red-400 transition-all"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* 4. Resumen y botón Confirmar todo al stock */}
          <div className="p-3.5 border-t border-purple-500/10 bg-black/20">
            <div className="flex items-center justify-between text-xs font-mono mb-3 px-1">
              <span className="text-purple-400/70 font-bold uppercase tracking-wider text-[10px]">
                Total sesión:
              </span>
              <span className="text-purple-300 font-black text-sm">
                {sesion.reduce((s, b) => s + b.peso, 0).toFixed(3)} kg
              </span>
            </div>
            {confirmado ? (
              <div className="flex items-center justify-center gap-2 py-3 rounded-xl bg-green-500/10 border border-green-500/30">
                <CheckCircle2 size={16} className="text-green-400" />
                <span className="text-green-400 text-xs font-black uppercase tracking-widest">
                  ¡Stock actualizado con éxito!
                </span>
              </div>
            ) : (
              <button
                onClick={confirmarTodoAlStock}
                disabled={confirmando}
                className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest transition-all border-b-2 border-purple-800 active:border-b-0 active:translate-y-px shadow-lg flex items-center justify-center gap-2"
              >
                {confirmando ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Guardando en el Sheet...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} />
                    <span>Confirmar todo al stock</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-700">
          <Scale size={32} className="mx-auto mb-2 opacity-25 text-purple-400" />
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">
            Aún no confirmaste ninguna bolsa
          </p>
        </div>
      )}
    </div>
  );
}

// ── Función global de impresión de etiquetas ──────────────────────────────────
function imprimirEtiqueta(nombreProducto, pesoKg, tagId = null) {
  const nombreCode = nombreProducto.toUpperCase().replace(/\s+/g, '-').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const pesoStr = pesoKg.toFixed(3);
  const finalTag = tagId ? String(tagId).toUpperCase() : Math.random().toString(36).substring(2, 6).toUpperCase();
  const barcodeValue = `${nombreCode}-${pesoStr}-${finalTag}`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title></title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.5/JsBarcode.all.min.js"><\/script>
<script>
  window.onload = function() {
    JsBarcode('#barcode', '${barcodeValue}', {
      format: 'CODE128',
      width: 1.5,
      height: 24,
      displayValue: true,
      fontSize: 8,
      margin: 0,
      background: 'transparent',
    });
    setTimeout(function() { window.print(); window.close(); }, 400);
  };
<\/script>
<style>
  /* Reset total */
  *, *::before, *::after {
    margin: 0 !important;
    padding: 0 !important;
    box-sizing: border-box !important;
  }

  /* Tamaño exacto estándar 80mm ancho x 50mm alto sin márgenes */
  @page {
    size: 80mm 50mm;
    margin: 0 !important;
  }

  html, body {
    width: 80mm !important;
    height: 50mm !important;
    max-width: 80mm !important;
    max-height: 50mm !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    background: #ffffff !important;
    print-color-adjust: exact !important;
    -webkit-print-color-adjust: exact !important;
  }

  /* Etiqueta con margen de seguridad (78x48mm) para evitar desbordes */
  .etiqueta {
    width: 78mm !important;
    height: 48mm !important;
    margin: 1mm auto !important;
    box-sizing: border-box !important;
    overflow: hidden !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: space-between !important;
    font-family: Arial, Helvetica, sans-serif !important;
    background: #ffffff !important;
    padding: 1.5mm 2mm 1mm 2mm !important;
    text-align: center !important;
    page-break-before: avoid !important;
    page-break-after: avoid !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }

  .top {
    width: 100% !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    gap: 0.3mm !important;
  }

  .brand {
    width: 100% !important;
    font-size: 12pt !important;
    font-weight: 900 !important;
    color: #000000 !important;
    letter-spacing: 0.05em !important;
    text-transform: uppercase !important;
    text-align: center !important;
    line-height: 1.1 !important;
    white-space: nowrap !important;
  }

  .url {
    width: 100% !important;
    font-size: 6.5pt !important;
    font-weight: 700 !important;
    color: #000000 !important;
    letter-spacing: 0.03em !important;
    text-align: center !important;
    white-space: nowrap !important;
  }

  .divider {
    width: 90% !important;
    height: 0.4mm !important;
    background: #000000 !important;
    flex-shrink: 0 !important;
    margin: 0.3mm auto !important;
  }

  .product-name {
    width: 100% !important;
    font-size: 14pt !important;
    font-weight: 900 !important;
    color: #000000 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.03em !important;
    text-align: center !important;
    line-height: 1.1 !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
  }

  .weight {
    width: 100% !important;
    font-size: 12pt !important;
    font-weight: 900 !important;
    color: #000000 !important;
    text-align: center !important;
    line-height: 1.1 !important;
  }

  svg#barcode {
    display: block !important;
    width: 70mm !important;
    max-width: 70mm !important;
    max-height: 15mm !important;
    height: auto !important;
    flex-shrink: 0 !important;
    margin: 0 auto !important;
  }

  @media print {
    @page {
      size: 80mm 50mm;
      margin: 0 !important;
    }
    html, body {
      width: 80mm !important;
      height: 50mm !important;
      max-width: 80mm !important;
      max-height: 50mm !important;
      overflow: hidden !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    .etiqueta {
      width: 78mm !important;
      height: 48mm !important;
      margin: 1mm auto !important;
      page-break-before: avoid !important;
      page-break-after: avoid !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
  }
</style>
</head>
<body>
  <div class="etiqueta">
    <div class="top">
      <div class="brand">HUERTA URBANA</div>
      <div class="url">huertaurbana.com.ar</div>
    </div>
    <div class="divider"></div>
    <div class="product-name">${nombreProducto.toUpperCase()}</div>
    <div class="weight">${pesoStr} kg &nbsp;<span style="font-size: 8pt; font-family: monospace; font-weight: 700; color: #444;">[#${finalTag}]</span></div>
    <svg id="barcode"></svg>
  </div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=340,height=220');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}
