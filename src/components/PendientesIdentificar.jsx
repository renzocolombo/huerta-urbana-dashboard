import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  ScanBarcode, ArrowLeft, AlertTriangle, CheckCircle2, Search, RotateCcw,
  Package, UploadCloud, Plus, Loader2, ArrowRight, Trash2, Check, Sparkles,
  Layers, ChevronRight
} from 'lucide-react';
import {
  asociarEanAProducto, normalizeSubcategoriaAlmacen, getEanMapping,
  SUBCATEGORIAS_ALMACEN, getSubcategoriaAlmacen
} from '../data/productUtils';
import {
  getIdentificaciones, esProductoAlmacenUnidad, normNombre,
  registrarEscaneo, deshacerUltimoEscaneo, productoDeCodigo
} from '../utils/identificacionAlmacen';
import { APPS_SCRIPT_URL } from '../utils/appsScriptUrl';
import { postAppsScript, leerCacheAlmacen } from '../utils/almacenCache';

const LOTE_STORAGE_KEY = 'huerta_lote_escaneos_pendientes_v1';

const limpiar = (raw) =>
  String(raw || '').replace(/[\r\n\x00-\x1F]/g, '').trim().replace(/^\][a-zA-Z0-9]{2,3}/, '').replace(/^\*+|\*+$/g, '').trim();

/**
 * Emite un beep sonoro inmediato al escanear con la pistola o teclado.
 */
function playScanBeep(success = true) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    if (success) {
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.12);
    } else {
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch (e) {}
}

/**
 * Valida si es un código de barras apto para Almacén (evita solo balanzas pesadas 20/02 de verduras).
 */
export function esCodigoValido(raw) {
  if (!raw) return false;
  const clean = limpiar(raw);
  if (/^(20|02)\d{10,11}$/.test(clean)) return false; // Balanza de pesaje de verduras
  return clean.length >= 4;
}

/**
 * Extrae uno o varios códigos ingresados juntos.
 */
export function extraerCodigos(raw) {
  if (!raw) return [];
  const str = String(raw).trim();
  const piezas = str.split(/[\r\n\t,;\s]+/).map(limpiar).filter(Boolean);
  const resultado = [];

  for (const pieza of piezas) {
    if (pieza.length % 13 === 0 && pieza.length >= 26 && /^\d+$/.test(pieza)) {
      for (let i = 0; i < pieza.length; i += 13) {
        resultado.push(pieza.slice(i, i + 13));
      }
    } else if (pieza.length % 14 === 0 && pieza.length >= 28 && /^\d+$/.test(pieza)) {
      for (let i = 0; i < pieza.length; i += 14) {
        resultado.push(pieza.slice(i, i + 14));
      }
    } else {
      resultado.push(pieza);
    }
  }
  return resultado;
}

/**
 * Pendientes de Almacén:
 * - Filtra y agrupa productos por categoría (Almacén, Bebidas, Limpieza, Lácteos, Golosinas).
 * - Descuenta automáticamente del contador "Restan escanear" con cada disparo de la pistola.
 * - Soporta acumulación en lote multi-producto (escanear varios productos distintos y subir todo junto).
 * - Cuando un producto termina de escanearse y se carga, DESAPARECE automáticamente de la lista de pendientes.
 */
export default function PendientesIdentificar({ stockData, setStockData, syncWithSheet, cargarStockDesdeSheet }) {
  const [version, setVersion] = useState(0);
  const [abierto, setAbierto] = useState(null); // key normalizada del producto seleccionado
  const [filtro, setFiltro] = useState('pendientes'); // 'pendientes' | 'todos'
  const [subcategoriaFiltro, setSubcategoriaFiltro] = useState('Todas');
  const [busqueda, setBusqueda] = useState('');
  const [feedback, setFeedback] = useState(null); // { tipo: 'ok'|'error', texto }
  const [codigoInput, setCodigoInput] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [refrescando, setRefrescando] = useState(false);
  const [loteObjetivoCustom, setLoteObjetivoCustom] = useState({});
  const inputRef = useRef(null);
  const autoScanTimerRef = useRef(null);
  const windowScanTimerRef = useRef(null);

  // ── Lote multi-producto acumulado: { [prodKey]: [ { id, code, ts }, ... ] } ──
  const [lotePendiente, setLotePendiente] = useState(() => {
    try {
      const saved = localStorage.getItem(LOTE_STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  // Persistir el lote entre recargas
  useEffect(() => {
    try {
      localStorage.setItem(LOTE_STORAGE_KEY, JSON.stringify(lotePendiente));
    } catch (e) {}
  }, [lotePendiente]);

  // Totales acumulados en todo el lote
  const totalCodigosEnLote = useMemo(() => {
    return Object.values(lotePendiente).reduce((acc, arr) => acc + (arr?.length || 0), 0);
  }, [lotePendiente]);

  const totalProductosEnLote = useMemo(() => {
    return Object.keys(lotePendiente).filter((k) => lotePendiente[k]?.length > 0).length;
  }, [lotePendiente]);

  // Lista unificada de productos: Costos + Almacén
  const productos = useMemo(() => {
    try {
      const ident = getIdentificaciones() || {};
      const map = new Map();

      // 1. Productos en stockData
      Object.values(stockData || {})
        .filter((p) => p && p.nombre && esProductoAlmacenUnidad(p))
        .forEach((p) => {
          const k = normNombre(p.nombre);
          if (!k) return;
          const totalEsperado = Math.max(
            0,
            Math.round(Number(p?.originalLoad?.unidades ?? p?.originalLoad?.['1kg'] ?? p?.stock?.unidades ?? p?.stock?.['1kg']) || 0)
          );
          const scans = (ident[k] && Array.isArray(ident[k]?.scans)) ? ident[k].scans : [];
          map.set(k, {
            prod: p,
            total: totalEsperado,
            identificadas: scans.length,
            scans,
            key: k
          });
        });

      // 2. Productos guardados en Panel de Costos
      try {
        const rawGuardados = localStorage.getItem('huerta_data_costos_v31_productos') ||
          localStorage.getItem('huerta_data_costos_v1_productos') ||
          '[]';
        const parsed = JSON.parse(rawGuardados);
        const guardados = Array.isArray(parsed) ? parsed : [];
        guardados.forEach((cp) => {
          if (!cp || !cp.nombre) return;
          const catP = cp.categoriaPrincipal || getCategoriaPrincipal(cp.nombre);
          const esAlm = catP !== 'Verduras' && catP !== 'Frutas' && (catP === 'Almacén' || (cp.id && String(cp.id).startsWith('alm_')));
          if (!esAlm) return;
          const k = normNombre(cp.nombre);
          if (!k) return;
          const totalCostos = Math.max(0, Math.round(Number(cp.cantidadCajon ?? cp.stock_unidades) || 0));
          const scans = (ident[k] && Array.isArray(ident[k]?.scans)) ? ident[k].scans : [];

          if (map.has(k)) {
            const entry = map.get(k);
            if (totalCostos > entry.total) {
              entry.total = totalCostos;
            }
          } else if (totalCostos > 0 || scans.length > 0) {
            map.set(k, {
              prod: {
                ...cp,
                stock: { '500g': 0, '1kg': scans.length, unidades: scans.length },
                originalLoad: { '500g': 0, '1kg': totalCostos, unidades: totalCostos }
              },
              total: totalCostos,
              identificadas: scans.length,
              scans,
              key: k
            });
          }
        });
      } catch (e) {
        console.warn('Error leyendo costos:', e);
      }

      // 3. Productos custom de almacén
      try {
        const parsedCustom = JSON.parse(localStorage.getItem('huerta_custom_almacen_prods_v1') || '[]');
        const customSaved = Array.isArray(parsedCustom) ? parsedCustom : [];
        customSaved.forEach((cp) => {
          if (!cp || !cp.nombre) return;
          const k = normNombre(cp.nombre);
          if (!k) return;
          const totalCostos = Math.max(0, Math.round(Number(cp.cantidadCajon ?? cp.stock_unidades) || 0));
          const scans = (ident[k] && Array.isArray(ident[k]?.scans)) ? ident[k].scans : [];
          if (map.has(k)) {
            const entry = map.get(k);
            if (totalCostos > entry.total) entry.total = totalCostos;
          } else if (totalCostos > 0 || scans.length > 0) {
            map.set(k, {
              prod: {
                ...cp,
                stock: { '500g': 0, '1kg': scans.length, unidades: scans.length },
                originalLoad: { '500g': 0, '1kg': totalCostos, unidades: totalCostos }
              },
              total: totalCostos,
              identificadas: scans.length,
              scans,
              key: k
            });
          }
        });
      } catch (e) {
        console.warn('Error leyendo custom:', e);
      }

      return Array.from(map.values()).sort((a, b) => {
        const nameA = String(a?.prod?.nombre || '');
        const nameB = String(b?.prod?.nombre || '');
        return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
      });
    } catch (err) {
      console.error('Error calculando productos en PendientesIdentificar:', err);
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockData, version, lotePendiente]);

  // ── FILTRADO: Los productos completados desaparecen de Pendientes ──────────
  const visibles = useMemo(() => {
    return (productos || []).filter((x) => {
      if (!x || !x.prod) return false;
      const prodNombre = String(x.prod?.nombre || '');
      if (busqueda && !normNombre(prodNombre).includes(normNombre(busqueda))) return false;

      // Filtro por subcategoría de Almacén
      if (subcategoriaFiltro !== 'Todas') {
        const subCat = normalizeSubcategoriaAlmacen(x.prod.subcategoria || getSubcategoriaAlmacen(prodNombre));
        if (subCat !== subcategoriaFiltro) return false;
      }

      if (filtro === 'pendientes') {
        const enLoteProd = lotePendiente[x.key]?.length || 0;
        // Solo mostrar si falta escanear (total > identificadas) o si tiene códigos acumulados en la cola
        const tienePendiente = x.total > 0 && x.identificadas < x.total;
        return tienePendiente || enLoteProd > 0;
      }
      return true;
    });
  }, [productos, busqueda, subcategoriaFiltro, filtro, lotePendiente]);

  // Agrupación por categoría para mostrar Almacén, Bebidas, Limpieza, etc. juntos
  const productosPorCategoria = useMemo(() => {
    const grupos = {};
    for (const item of visibles) {
      const cat = normalizeSubcategoriaAlmacen(item.prod?.subcategoria || getSubcategoriaAlmacen(item.prod?.nombre));
      if (!grupos[cat]) grupos[cat] = [];
      grupos[cat].push(item);
    }
    return grupos;
  }, [visibles]);

  const actual = abierto ? (productos || []).find((x) => x.key === abierto) : null;
  const pendientesCount = useMemo(() => {
    return (productos || []).filter((x) => x.total > 0 && x.identificadas < x.total).length;
  }, [productos]);

  const enfocar = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (!actual) return;
    enfocar();
    const t = setInterval(enfocar, 1500);
    return () => clearInterval(t);
  }, [actual?.key, enfocar]);

  // Números en vivo del producto abierto
  const scansEnCola = (actual ? lotePendiente[actual.key] : []) || [];
  const enCola = scansEnCola.length;
  const totalBase = actual ? Number(actual.total) : 0;
  const totalObjetivo = actual
    ? (loteObjetivoCustom[actual.key] !== undefined ? loteObjetivoCustom[actual.key] : (totalBase > 0 ? totalBase : Math.max(1, enCola)))
    : 1;

  // ── RESTAN ESCANEAR: Descuenta automáticamente por cada disparo de la pistola ──
  const restanEscanear = Math.max(0, totalObjetivo - enCola);
  const completo = totalObjetivo > 0 && enCola >= totalObjetivo;
  const pct = totalObjetivo > 0 ? Math.min(100, Math.round((enCola / totalObjetivo) * 100)) : 0;

  // ── Agregar códigos escaneados a la cola del producto actual ───────────────
  const agregarALaCola = useCallback((rawTexto) => {
    if (!rawTexto || !actual) return;
    if (autoScanTimerRef.current) {
      clearTimeout(autoScanTimerRef.current);
      autoScanTimerRef.current = null;
    }
    const codigos = extraerCodigos(rawTexto);
    if (codigos.length === 0) return;

    const nuevosValidos = [];
    const avisos = [];

    for (const code of codigos) {
      if (!esCodigoValido(code)) {
        avisos.push(`"${code}" no parece un código válido`);
        continue;
      }

      const otro = productoDeCodigo(code, actual.prod.nombre);
      if (otro && normNombre(otro) !== normNombre(actual.prod.nombre)) {
        avisos.push(`Código ${code} reasignado desde "${otro}"`);
      }

      nuevosValidos.push({
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        code,
        ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      });
    }

    if (nuevosValidos.length > 0) {
      playScanBeep(true);
      setLotePendiente((prev) => {
        const k = actual.key;
        const prevList = prev[k] || [];
        return {
          ...prev,
          [k]: [...prevList, ...nuevosValidos]
        };
      });
      setCodigoInput('');
      if (inputRef.current) inputRef.current.value = '';
      if (avisos.length > 0) {
        setFeedback({ tipo: 'ok', texto: avisos.join(' | ') });
      } else {
        setFeedback(null);
      }
    } else if (avisos.length > 0) {
      playScanBeep(false);
      setFeedback({ tipo: 'error', texto: avisos.join(' | ') });
    }
    enfocar();
  }, [actual, enfocar]);

  // ── DETECTOR GLOBAL PARA PISTOLA LECTORA DE CÓDIGOS DE BARRA ──────────────
  // Atrapa el escaneo de la pistola incluso si el foco no está en el input
  useEffect(() => {
    let scanBuffer = '';
    let lastKeyTime = Date.now();

    const procesarCodigoDetectado = (code) => {
      const clean = limpiar(code);
      if (!clean || !esCodigoValido(clean)) return;

      if (actual) {
        agregarALaCola(clean);
      } else {
        // Si está en la lista general, asociar automáticamente al producto escaneado
        const map = getEanMapping();
        const mapped = map[clean];
        const dataIdent = getIdentificaciones();

        let matchedKey = null;
        if (mapped?.nombre) matchedKey = normNombre(mapped.nombre);
        if (!matchedKey) {
          for (const [k, v] of Object.entries(dataIdent)) {
            if ((v.scans || []).some((s) => s.code === clean)) {
              matchedKey = k;
              break;
            }
          }
        }

        if (matchedKey) {
          setAbierto(matchedKey);
          setLotePendiente((prev) => {
            const prevList = prev[matchedKey] || [];
            return {
              ...prev,
              [matchedKey]: [...prevList, {
                id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                code: clean,
                ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              }]
            };
          });
          playScanBeep(true);
        }
      }
    };

    const handleWindowKeyDown = (e) => {
      // Ignorar teclas modificadoras salvo Enter y Tab
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;

      const active = document.activeElement;
      const isSearchInput = active && active.getAttribute('data-is-search') === 'true';
      if (isSearchInput) return; // Si el usuario escribe manualmente en el buscador, no interferir

      const now = Date.now();
      // Si pasaron más de 120ms entre teclas, resetear buffer
      if (now - lastKeyTime > 120) {
        scanBuffer = '';
      }
      lastKeyTime = now;

      if (e.key === 'Enter' || e.keyCode === 13 || e.key === 'Tab') {
        if (windowScanTimerRef.current) clearTimeout(windowScanTimerRef.current);
        const codeCapturado = (scanBuffer || (active === inputRef.current ? (inputRef.current?.value || codigoInput) : '')).trim();
        scanBuffer = '';

        if (codeCapturado && esCodigoValido(codeCapturado)) {
          e.preventDefault();
          e.stopPropagation();
          procesarCodigoDetectado(codeCapturado);
        }
      } else if (e.key.length === 1) {
        scanBuffer += e.key;

        // Si la pistola no manda Enter y dispara rápido:
        if (windowScanTimerRef.current) clearTimeout(windowScanTimerRef.current);
        const bufferClean = limpiar(scanBuffer);
        if (/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(bufferClean)) {
          windowScanTimerRef.current = setTimeout(() => {
            if (esCodigoValido(bufferClean)) {
              scanBuffer = '';
              procesarCodigoDetectado(bufferClean);
            }
          }, 40);
        } else if (bufferClean.length >= 4) {
          windowScanTimerRef.current = setTimeout(() => {
            if (esCodigoValido(bufferClean)) {
              scanBuffer = '';
              procesarCodigoDetectado(bufferClean);
            }
          }, 140);
        }
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown, true);
      if (windowScanTimerRef.current) clearTimeout(windowScanTimerRef.current);
    };
  }, [actual, agregarALaCola, codigoInput]);

  // ── MANEJO DEL INPUT CON DETECCIÓN AUTOMÁTICA EN TIEMPO REAL ──────────────
  // Detecta el disparo de la pistola al instante, aun sin Enter o con Enter
  const handleInputChange = (e) => {
    const val = e.target.value;

    // 1. Si la pistola lectora o pegado envió saltos de línea (CR o LF) o tabulador
    if (/[\r\n\t]/.test(val)) {
      if (autoScanTimerRef.current) clearTimeout(autoScanTimerRef.current);
      agregarALaCola(val);
      return;
    }

    setCodigoInput(val);

    const clean = limpiar(val);

    // 2. Detección instantánea de códigos estándar (EAN-13, EAN-8, UPC-12, ITF-14)
    // Ejemplo: "7794940000857" (13 dígitos) se descuenta y agrega automáticamente sin apretar nada más
    if (/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(clean)) {
      if (autoScanTimerRef.current) clearTimeout(autoScanTimerRef.current);
      autoScanTimerRef.current = setTimeout(() => {
        agregarALaCola(clean);
      }, 35);
      return;
    }

    // 3. Temporizador de ráfaga rápida de pistola para cualquier otro código (>= 4 caracteres)
    if (autoScanTimerRef.current) clearTimeout(autoScanTimerRef.current);
    if (clean.length >= 4 && esCodigoValido(clean)) {
      autoScanTimerRef.current = setTimeout(() => {
        const cur = inputRef.current ? inputRef.current.value : val;
        const curClean = limpiar(cur);
        if (curClean.length >= 4 && esCodigoValido(curClean)) {
          agregarALaCola(curClean);
        }
      }, 140);
    }
  };

  const quitarDeCola = (prodKey, index) => {
    setLotePendiente((prev) => {
      const prevList = prev[prodKey] || [];
      const updated = prevList.filter((_, i) => i !== index);
      const next = { ...prev };
      if (updated.length > 0) next[prodKey] = updated;
      else delete next[prodKey];
      return next;
    });
    enfocar();
  };

  const vaciarColaProducto = (prodKey) => {
    setLotePendiente((prev) => {
      const next = { ...prev };
      delete next[prodKey];
      return next;
    });
    setFeedback(null);
    enfocar();
  };

  const vaciarLoteCompleto = () => {
    setLotePendiente({});
    localStorage.removeItem(LOTE_STORAGE_KEY);
    setFeedback(null);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.keyCode === 13 || e.key === 'Tab') {
      e.preventDefault();
      if (autoScanTimerRef.current) clearTimeout(autoScanTimerRef.current);
      const val = (e.currentTarget?.value || codigoInput || '').trim();
      if (val && esCodigoValido(val)) {
        agregarALaCola(val);
      } else if (enCola > 0 && e.key === 'Enter') {
        subirProductoActualAlStock();
      }
    }
  };

  // ── Sincroniza productos cargados con el Stock Real y Google Sheets ─────────
  const procesarSubidaItems = async (itemsAProcesar) => {
    let exitososTotal = 0;
    let productosActualizados = 0;
    const nextStock = { ...(stockData || {}) };
    const unitsCache = leerCacheAlmacen();

    for (const { key, prod, scansList } of itemsAProcesar) {
      if (!scansList || scansList.length === 0 || !prod) continue;

      let exitososProd = 0;
      let lastCode = '';
      for (const scanItem of scansList) {
        const res = registrarEscaneo(prod, scanItem.code, { forzar: true });
        if (res.status === 'ok' || res.status === 'excedido') {
          exitososProd++;
          lastCode = scanItem.code;
        }
      }

      if (exitososProd > 0) {
        exitososTotal += exitososProd;
        productosActualizados++;

        // 1. Actualizar stockData local
        let targetId = prod.id && nextStock[prod.id] ? prod.id : null;
        if (!targetId) targetId = Object.keys(nextStock).find((id) => normNombre(nextStock[id]?.nombre) === key);

        let nuevoStock = exitososProd;
        if (targetId && nextStock[targetId]) {
          const item = nextStock[targetId];
          const stockActual = Number(item.stock?.unidades ?? item.stock?.['1kg']) || 0;
          nuevoStock = stockActual + exitososProd;
          const updated = {
            ...item,
            stock: { ...item.stock, '1kg': nuevoStock, unidades: nuevoStock },
            originalLoad: {
              ...item.originalLoad,
              '1kg': Math.max(Number(item.originalLoad?.unidades ?? item.originalLoad?.['1kg']) || 0, nuevoStock),
              unidades: Math.max(Number(item.originalLoad?.unidades ?? item.originalLoad?.['1kg']) || 0, nuevoStock)
            }
          };
          nextStock[targetId] = updated;
          if (syncWithSheet) syncWithSheet(updated);
        } else {
          const nuevoId = prod.id || `alm_${key.replace(/\s+/g, '_')}`;
          const updated = {
            ...prod,
            id: nuevoId,
            stock: { '500g': 0, '1kg': exitososProd, unidades: exitososProd },
            originalLoad: { '500g': 0, '1kg': exitososProd, unidades: exitososProd },
            esUnidad: true,
            categoriaPrincipal: 'Almacén'
          };
          nextStock[nuevoId] = updated;
          if (syncWithSheet) syncWithSheet(updated);
        }

        // 2. Persistir en huerta_stock_units_cache_v1
        const prevStock = Number(unitsCache[key]?.stock) || 0;
        const totalCacheStock = prevStock + exitososProd;
        unitsCache[key] = {
          ...(unitsCache[key] || {}),
          stock: totalCacheStock,
          originalLoad: Math.max(Number(unitsCache[key]?.originalLoad) || 0, totalCacheStock),
          subcategoria: prod.subcategoria || 'Almacén',
          unidad: prod.unidad || 'unidad',
          fecha: new Date().toISOString().split('T')[0]
        };

        // 3. Guardar el código EAN en el mapa global para que Agenda de Entregas lo reconozca
        if (lastCode) {
          asociarEanAProducto(lastCode, {
            productoId: prod.id || null,
            nombre: prod.nombre,
            subcategoria: prod.subcategoria || 'Almacén',
            unidad: prod.unidad || 'unidad'
          });

          // 4. Actualizar pestaña "Almacen" en Google Sheets con el código EAN y el nuevo stock
          if (prod.fila && APPS_SCRIPT_URL) {
            postAppsScript(APPS_SCRIPT_URL, {
              accion: 'updateAlmacen',
              sheet: 'Almacen',
              fila: prod.fila,
              nombre: prod.nombre,
              codigo_ean: lastCode,
              stock_unidades: totalCacheStock
            }).catch((err) => console.warn('Error actualizando EAN en Google Sheet:', err));
          }
        }
      }
    }

    if (setStockData) setStockData(nextStock);
    localStorage.setItem('huerta_stock_units_cache_v1', JSON.stringify(unitsCache));
    return { exitososTotal, productosActualizados };
  };

  // ── SUBIR SOLO EL PRODUCTO ACTUAL AL STOCK REAL ───────────────────────────
  const subirProductoActualAlStock = async () => {
    if (subiendo || !actual) return;

    let scansList = [...scansEnCola];
    const valInput = (inputRef.current?.value || codigoInput || '').trim();
    if (valInput) {
      const extraidos = extraerCodigos(valInput);
      for (const c of extraidos) {
        if (esCodigoValido(c)) {
          scansList.push({ id: `tmp-${Date.now()}`, code: c, ts: '' });
        }
      }
      setCodigoInput('');
      if (inputRef.current) inputRef.current.value = '';
    }

    if (scansList.length === 0) return;

    setSubiendo(true);
    try {
      const { exitososTotal } = await procesarSubidaItems([{
        key: actual.key,
        prod: actual.prod,
        scansList
      }]);

      if (exitososTotal > 0) {
        playScanBeep(true);
        // Quitar este producto de la cola pendiente
        setLotePendiente((prev) => {
          const next = { ...prev };
          delete next[actual.key];
          return next;
        });
        // Volver a la lista para ver cómo desapareció el producto completado
        setAbierto(null);
        setVersion((v) => v + 1);
        setFeedback({
          tipo: 'ok',
          texto: `✅ ¡${exitososTotal} ${exitososTotal === 1 ? 'producto ingresado' : 'productos ingresados'} con éxito al stock real! El producto ya fue completado.`
        });
      }
    } catch (e) {
      console.error('Error subiendo producto:', e);
      setFeedback({ tipo: 'error', texto: 'Ocurrió un error al subir el producto al stock.' });
    } finally {
      setSubiendo(false);
    }
  };

  // ── SUBIR TODO EL LOTE AL STOCK REAL (MULTI-PRODUCTO) ──────────────────────
  const subirLoteCompletoAlStock = async () => {
    if (subiendo || totalCodigosEnLote === 0) return;

    setSubiendo(true);
    try {
      const prodsMap = new Map((productos || []).map((p) => [p.key, p]));
      const items = [];

      for (const [key, scansList] of Object.entries(lotePendiente)) {
        if (!scansList || scansList.length === 0) continue;
        const entry = prodsMap.get(key);
        if (entry && entry.prod) {
          items.push({ key, prod: entry.prod, scansList });
        }
      }

      const { exitososTotal, productosActualizados } = await procesarSubidaItems(items);

      if (exitososTotal > 0) {
        playScanBeep(true);
        setLotePendiente({});
        localStorage.removeItem(LOTE_STORAGE_KEY);
        setAbierto(null);
        setVersion((v) => v + 1);
        setFeedback({
          tipo: 'ok',
          texto: `🎉 ¡Lote subido con éxito! Se ingresaron ${exitososTotal} unidades de ${productosActualizados} producto(s) al stock real y quedaron completados.`
        });
      }
    } catch (e) {
      console.error('Error subiendo lote:', e);
      setFeedback({ tipo: 'error', texto: 'Ocurrió un error al subir el lote al stock.' });
    } finally {
      setSubiendo(false);
    }
  };

  const deshacer = () => {
    if (!actual) return;
    deshacerUltimoEscaneo(actual.prod);
    setFeedback(null);
    if (setStockData) {
      setStockData((prev) => {
        const next = { ...(prev || {}) };
        const k = actual.key;
        const prodRef = actual.prod;
        let targetId = prodRef.id && next[prodRef.id] ? prodRef.id : null;
        if (!targetId) targetId = Object.keys(next).find((id) => normNombre(next[id]?.nombre) === k);
        if (targetId && next[targetId]) {
          const item = next[targetId];
          const stockActual = Number(item.stock?.unidades ?? item.stock?.['1kg']) || 0;
          const nuevoStock = Math.max(0, stockActual - 1);
          const updated = {
            ...item,
            stock: { ...item.stock, '1kg': nuevoStock, unidades: nuevoStock }
          };
          next[targetId] = updated;
          if (syncWithSheet) syncWithSheet(updated);
          return next;
        }
        return prev;
      });
    }
    setVersion((v) => v + 1);
    enfocar();
  };

  const refrescarManual = async () => {
    setRefrescando(true);
    try {
      if (typeof cargarStockDesdeSheet === 'function') {
        await cargarStockDesdeSheet();
      }
    } catch (e) {
      console.warn('Error al refrescar:', e);
    } finally {
      setVersion((v) => v + 1);
      setTimeout(() => setRefrescando(false), 400);
    }
  };

  // ═════════════════════════════════════════════════════════════════════════════
  // VISTA 1: DETALLE DE ESCANEO DE UN PRODUCTO ESPECÍFICO
  // ═════════════════════════════════════════════════════════════════════════════
  if (actual) {
    const { prod, scans } = actual;

    return (
      <div className="bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 border border-white/10 rounded-3xl p-5 space-y-4">
        {/* Navegación superior */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => { setAbierto(null); setFeedback(null); setCodigoInput(''); }}
            className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-white cursor-pointer transition py-1.5 px-3 rounded-xl bg-white/5 hover:bg-white/10"
          >
            <ArrowLeft size={14} /> Volver a la lista de pendientes
          </button>

          {totalCodigosEnLote > enCola && (
            <span className="text-[11px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2.5 py-1 rounded-full">
              📦 Hay {totalCodigosEnLote - enCola} códigos en cola de otros productos
            </span>
          )}
        </div>

        {/* Encabezado del producto */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-white/10 text-emerald-400 border border-white/5">
                {prod.subcategoria || 'Almacén'}
              </span>
            </div>
            <h3 className="text-white font-black text-2xl leading-tight mt-1">{prod.nombre}</h3>
            <p className="text-[11px] text-gray-500 uppercase tracking-wider font-bold mt-0.5">
              Stock oficial en Costos: <span className="text-gray-300 font-mono">{totalBase} ud</span>
            </p>
          </div>
          {completo && (
            <span className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center gap-1 shrink-0 shadow-lg">
              <CheckCircle2 size={14} /> {restanEscanear === 0 ? 'Lote Completo' : 'Excedente'}
            </span>
          )}
        </div>

        {/* ── CONTADORES EN VIVO: Se descuenta automáticamente por disparo de pistola ── */}
        <div className="grid grid-cols-3 gap-2.5">
          {/* Tarjeta 1: A ingresar */}
          <div className="bg-black/40 border border-white/10 rounded-2xl p-3 text-center">
            <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">A ingresar</div>
            <div className="flex items-center justify-center gap-1.5 mt-0.5">
              <button
                type="button"
                onClick={() => setLoteObjetivoCustom((prev) => ({ ...prev, [actual.key]: Math.max(1, totalObjetivo - 1) }))}
                className="w-5 h-5 rounded bg-white/10 hover:bg-white/20 text-gray-300 font-bold flex items-center justify-center text-xs cursor-pointer select-none"
                title="Restar 1 al objetivo"
              >
                -
              </button>
              <div className="text-2xl font-black font-mono text-white">
                {totalObjetivo} <span className="text-xs text-gray-500 font-sans">ud</span>
              </div>
              <button
                type="button"
                onClick={() => setLoteObjetivoCustom((prev) => ({ ...prev, [actual.key]: totalObjetivo + 1 }))}
                className="w-5 h-5 rounded bg-white/10 hover:bg-white/20 text-gray-300 font-bold flex items-center justify-center text-xs cursor-pointer select-none"
                title="Sumar 1 al objetivo"
              >
                +
              </button>
            </div>
            <div className="text-[9px] text-gray-500 mt-1 font-semibold">Total a escanear</div>
          </div>

          {/* Tarjeta 2: En cola */}
          <div className={`border rounded-2xl p-3 text-center transition-all duration-200 ${
            enCola > 0
              ? 'bg-emerald-950/60 border-emerald-500/50 shadow-lg shadow-emerald-950/50'
              : 'bg-black/40 border-white/10'
          }`}>
            <div className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Escaneadas (en cola)</div>
            <div className="text-2xl font-black font-mono text-emerald-400 mt-0.5">
              +{enCola} <span className="text-xs font-sans">ud</span>
            </div>
            <div className="text-[9px] text-emerald-500/80 mt-0.5 font-semibold">Listas para subir</div>
          </div>

          {/* Tarjeta 3: Restan escanear */}
          <div className={`border rounded-2xl p-3 text-center transition-all duration-200 ${
            restanEscanear === 0
              ? 'bg-emerald-950/40 border-emerald-500/40'
              : 'bg-amber-950/30 border-amber-500/40'
          }`}>
            <div className="text-[10px] uppercase font-bold tracking-wider text-gray-300">Restan escanear</div>
            <div className={`text-2xl font-black font-mono mt-0.5 ${restanEscanear === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {restanEscanear} <span className="text-xs text-gray-500 font-sans">ud</span>
            </div>
            <div className={`text-[9px] mt-0.5 font-bold ${restanEscanear === 0 ? 'text-emerald-400' : 'text-amber-500'}`}>
              {restanEscanear === 0 ? '¡Listo para subir!' : 'Descuenta con cada disparo'}
            </div>
          </div>
        </div>

        {/* Barra de progreso */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-gray-400 font-mono">
            <span>Progreso de escaneo</span>
            <span className="font-bold text-white">{enCola} de {totalObjetivo} ({pct}%)</span>
          </div>
          <div className="h-2.5 rounded-full bg-black/60 overflow-hidden border border-white/5">
            <div
              className={`h-full transition-all duration-300 ${completo ? 'bg-emerald-500' : 'bg-gradient-to-r from-amber-500 to-emerald-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {feedback && (
          <div className={`p-3.5 rounded-2xl border text-xs font-semibold leading-relaxed ${
            feedback.tipo === 'ok'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}>
            {feedback.texto}
          </div>
        )}

        {/* ── CAMPO DE ENTRADA CON LA PISTOLA (ESCANEO RÁPIDO CONTINUO) ────── */}
        <div className="space-y-1.5">
          <div className="flex gap-2 items-stretch">
            <div className="relative flex-1">
              <ScanBarcode size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-400" />
              <input
                ref={inputRef}
                type="text"
                value={codigoInput}
                onChange={handleInputChange}
                onKeyDown={onKeyDown}
                onPaste={(e) => {
                  const pasteText = (e.clipboardData?.getData('text') || '').trim();
                  if (pasteText && esCodigoValido(pasteText)) {
                    e.preventDefault();
                    if (autoScanTimerRef.current) clearTimeout(autoScanTimerRef.current);
                    agregarALaCola(pasteText);
                  }
                }}
                onBlur={() => setTimeout(enfocar, 150)}
                placeholder={`🔫 Apuntá la pistola y dispará al código de "${prod.nombre}"...`}
                className="w-full bg-black/50 border border-emerald-500/40 focus:border-emerald-400 text-white text-sm font-mono rounded-2xl pl-12 pr-4 py-3.5 outline-none transition shadow-inner"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                if (codigoInput.trim()) agregarALaCola(codigoInput);
              }}
              disabled={!codigoInput.trim()}
              className={`px-4 py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer select-none ${
                codigoInput.trim()
                  ? 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
                  : 'bg-white/5 text-gray-500 border border-white/5 opacity-40 cursor-not-allowed'
              }`}
              title="Sumar código a la cola"
            >
              <Plus size={16} />
              <span>Sumar</span>
            </button>
          </div>
          <p className="text-[11px] text-gray-400 px-1 font-medium">
            ⚡ <strong className="text-white">Escaneo automático:</strong> cada disparo de la pistola al código descuenta directamente de "Restan escanear" y suena un beep. Podés subir solo este producto o seguir escaneando otros.
          </p>
        </div>

        {/* ── LISTA DE CÓDIGOS EN COLA DE ESTE PRODUCTO ───────────────────── */}
        {enCola > 0 && (
          <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                <CheckCircle2 size={15} className="text-emerald-400" />
                {enCola} {enCola === 1 ? 'código listo' : 'códigos listos'} para {prod.nombre}
              </span>
              <button
                type="button"
                onClick={() => vaciarColaProducto(actual.key)}
                className="text-[10px] uppercase font-bold text-gray-400 hover:text-red-400 transition cursor-pointer"
              >
                Limpiar de este producto
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {scansEnCola.map((item, idx) => (
                <span
                  key={item.id || idx}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-900/60 border border-emerald-500/40 text-emerald-200 font-mono text-xs shadow-sm"
                >
                  <span className="text-emerald-400 font-bold">#{idx + 1}</span>
                  <span>{item.code}</span>
                  <button
                    type="button"
                    onClick={() => quitarDeCola(actual.key, idx)}
                    className="text-emerald-400 hover:text-red-400 font-bold ml-1 transition cursor-pointer text-sm leading-none"
                    title="Quitar este escaneo"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── BOTONES DE ACCIÓN: CARGAR O SEGUIR CON OTROS PRODUCTOS ──────── */}
        <div className="space-y-2 pt-1">
          {/* Botón 1: Cargar este producto al stock */}
          <button
            type="button"
            onClick={subirProductoActualAlStock}
            disabled={subiendo || (enCola === 0 && !codigoInput.trim())}
            className={`w-full py-4 px-6 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-3 transition-all duration-200 cursor-pointer shadow-xl select-none ${
              (enCola > 0 || codigoInput.trim())
                ? 'bg-gradient-to-r from-emerald-600 via-emerald-500 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white shadow-emerald-950/70 scale-[1.01] active:scale-[0.99]'
                : 'bg-white/5 text-gray-500 border border-white/5 opacity-50 cursor-not-allowed'
            }`}
          >
            {subiendo ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                <span>Subiendo al stock y Google Sheets...</span>
              </>
            ) : (
              <>
                <UploadCloud size={20} />
                <span>
                  {enCola > 0
                    ? `Cargar ${enCola} ${enCola === 1 ? 'producto' : 'productos'} de "${prod.nombre}" al stock real`
                    : codigoInput.trim()
                    ? 'Cargar al stock real'
                    : 'Cargar este producto al stock real'}
                </span>
              </>
            )}
          </button>

          {/* Botón 2: Guardar y seguir con otro producto */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setAbierto(null); setFeedback(null); setCodigoInput(''); }}
              className="flex-1 py-3 px-4 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <span>{enCola > 0 ? 'Guardar en cola y escanear otro producto' : 'Volver a la lista'}</span>
              <ArrowRight size={14} />
            </button>

            {totalCodigosEnLote > enCola && (
              <button
                type="button"
                onClick={subirLoteCompletoAlStock}
                disabled={subiendo}
                className="py-3 px-4 rounded-xl bg-green-700 hover:bg-green-600 text-white font-black text-xs uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer shadow-lg"
                title="Sube todos los productos acumulados en el lote"
              >
                <Check size={14} />
                <span>Subir todo el lote ({totalCodigosEnLote})</span>
              </button>
            )}
          </div>
        </div>

        {/* Historial de escaneos previos ya subidos */}
        {scans && scans.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-white/5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-black text-gray-400 tracking-widest">
                Códigos ya ingresados al stock real ({scans.length})
              </span>
              <button
                type="button"
                onClick={deshacer}
                className="flex items-center gap-1 text-[11px] font-bold text-gray-400 hover:text-red-400 transition cursor-pointer"
              >
                <RotateCcw size={12} /> Deshacer último
              </button>
            </div>
            <div className="max-h-36 overflow-y-auto space-y-1">
              {[...scans].reverse().map((s, i) => (
                <div key={`${s.ts}-${i}`} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-black/30 text-xs font-mono text-gray-300">
                  <span>#{scans.length - i} · {s.code}</span>
                  {s.excedente && <span className="text-amber-400 font-bold text-[10px]">EXCEDENTE</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // VISTA 2: LISTA DE PRODUCTOS PENDIENTES CON AGRUPACIÓN POR CATEGORÍA
  // ═════════════════════════════════════════════════════════════════════════════
  return (
    <div className="bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 border border-white/10 rounded-3xl p-5 space-y-4">
      {/* ── BANNER DESTACADO: LOTE MULTI-PRODUCTO LISTO PARA SUBIR ───────── */}
      {totalCodigosEnLote > 0 && (
        <div className="bg-gradient-to-r from-emerald-950 via-gray-900 to-emerald-950 border-2 border-emerald-500/50 rounded-2xl p-4 shadow-xl shadow-emerald-950/60 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                <Package size={20} />
              </div>
              <div>
                <h4 className="text-white font-black text-sm uppercase tracking-wider">
                  Lote listo para subir: {totalCodigosEnLote} {totalCodigosEnLote === 1 ? 'unidad' : 'unidades'} de {totalProductosEnLote} {totalProductosEnLote === 1 ? 'producto' : 'productos'}
                </h4>
                <p className="text-[11px] text-emerald-300/80">
                  Podés seguir escaneando otros productos o subir todo el lote junto al stock real.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={vaciarLoteCompleto}
              className="text-[11px] font-bold text-gray-400 hover:text-red-400 transition cursor-pointer p-1.5"
              title="Descartar lote escaneado"
            >
              <Trash2 size={16} />
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {Object.entries(lotePendiente).map(([k, arr]) => {
              if (!arr || arr.length === 0) return null;
              const prodEntry = (productos || []).find((p) => p.key === k);
              const nom = prodEntry?.prod?.nombre || k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setAbierto(k)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-900/40 border border-emerald-500/30 text-emerald-200 text-xs font-semibold hover:bg-emerald-900/70 transition cursor-pointer"
                >
                  <span className="truncate max-w-[160px]">{nom}</span>
                  <span className="font-mono bg-emerald-500 text-black px-1.5 py-0.2 rounded-md text-[10px] font-black">
                    +{arr.length}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={subirLoteCompletoAlStock}
            disabled={subiendo}
            className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-400 hover:to-green-400 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-emerald-950/60"
          >
            {subiendo ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Subiendo lote a Google Sheets y Stock Real...</span>
              </>
            ) : (
              <>
                <UploadCloud size={18} />
                <span>Cargar todo el lote al stock real ({totalCodigosEnLote} unidades)</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Encabezado */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-white font-black text-sm uppercase tracking-wider">Productos por ingresar al stock</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Escaneá con la pistola cada unidad física. Al cargar, el producto completado desaparece de pendientes.
          </p>
        </div>
        <button
          type="button"
          onClick={refrescarManual}
          disabled={refrescando}
          className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition cursor-pointer"
          title="Refrescar datos del Sheet y Costos"
        >
          <RotateCcw size={14} className={refrescando ? 'animate-spin text-green-400' : ''} />
        </button>
      </div>

      {feedback && (
        <div className={`p-3.5 rounded-2xl border text-xs font-semibold leading-relaxed ${
          feedback.tipo === 'ok'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-red-500/10 border-red-500/30 text-red-300'
        }`}>
          {feedback.texto}
        </div>
      )}

      {/* ── SELECTOR DE SUBCATEGORÍAS DE ALMACÉN (Almacén, Bebidas, Limpieza, Lácteos, Golosinas) ── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Layers size={13} className="text-gray-400" />
          <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Categorías de Almacén:</span>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {['Todas', ...SUBCATEGORIAS_ALMACEN].map((cat) => {
            const isActiva = subcategoriaFiltro === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSubcategoriaFiltro(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  isActiva
                    ? 'bg-emerald-500 text-black shadow-md shadow-emerald-900/40'
                    : 'bg-white/5 hover:bg-white/10 text-gray-300 border border-white/5'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Búsqueda y Filtros de Estado */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            data-is-search="true"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto a identificar..."
            className="w-full bg-black/40 border border-white/10 focus:border-green-500/60 text-white text-xs rounded-xl pl-9 pr-3 py-2.5 outline-none"
          />
        </div>
        <div className="flex bg-black/40 border border-white/5 rounded-xl p-1 gap-1">
          {[['pendientes', `Pendientes (${pendientesCount})`], ['todos', 'Todos']].map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFiltro(k)}
              className={`px-3 rounded-lg text-[11px] font-black uppercase tracking-wider cursor-pointer transition ${
                filtro === k ? 'bg-green-600 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── LISTA DE PRODUCTOS AGRUPADA POR CATEGORÍA ─────────────────────── */}
      {visibles.length === 0 ? (
        <div className="py-12 text-center text-gray-500 text-xs font-bold flex flex-col items-center gap-2">
          <CheckCircle2 size={36} className="text-emerald-500/70" />
          <p className="text-gray-300 text-sm font-bold">
            {filtro === 'pendientes' ? '¡Excelente! Todos los productos están cargados al stock real 🎉' : 'No hay productos en esta categoría.'}
          </p>
          <p className="text-[11px] text-gray-500">
            {filtro === 'pendientes' ? 'Podés cambiar a la pestaña "Todos" para ver el inventario completo.' : ''}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(productosPorCategoria).map(([categoria, items]) => (
            <div key={categoria} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  {categoria} ({items.length})
                </span>
              </div>

              <div className="space-y-1.5">
                {items.map(({ prod, total, identificadas, key }) => {
                  const enLoteProd = lotePendiente[key]?.length || 0;
                  const restan = Math.max(0, total - (identificadas + enLoteProd));
                  const completo = total > 0 && (identificadas + enLoteProd) >= total;
                  const pct = total > 0 ? Math.min(100, Math.round(((identificadas + enLoteProd) / total) * 100)) : 0;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => { setAbierto(key); setFeedback(null); }}
                      className={`w-full text-left p-3.5 rounded-2xl border transition cursor-pointer select-none ${
                        enLoteProd > 0
                          ? 'bg-emerald-950/30 border-emerald-500/40 hover:bg-emerald-950/50'
                          : 'bg-black/30 hover:bg-black/50 border-white/5 hover:border-green-500/30'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 truncate">
                          <span className="text-white text-sm font-bold truncate">{prod.nombre}</span>
                          {enLoteProd > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500 text-black text-[10px] font-black shrink-0">
                              +{enLoteProd} en cola
                            </span>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`text-xs font-black font-mono ${
                            completo ? 'text-emerald-400' : 'text-amber-400'
                          }`}>
                            {total === 0 ? `${enLoteProd} escaneadas` : `${identificadas + enLoteProd} de ${total} ud`}
                          </span>
                          {total > 0 && restan > 0 && (
                            <div className="text-[10px] text-gray-500 font-semibold">
                              Faltan {restan} ud
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="h-1.5 mt-2 rounded-full bg-black/50 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${completo ? 'bg-emerald-500' : 'bg-gradient-to-r from-amber-500 to-emerald-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
