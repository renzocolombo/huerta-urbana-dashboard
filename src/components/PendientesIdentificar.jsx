import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  ScanBarcode, ArrowLeft, AlertTriangle, CheckCircle2, Search, RotateCcw,
  Package, UploadCloud, Plus, Loader2
} from 'lucide-react';
import { esCodigoEan } from '../data/productUtils';
import {
  getIdentificaciones, esProductoAlmacenUnidad, stockOficialUnidades, normNombre,
  registrarEscaneo, deshacerUltimoEscaneo, productoDeCodigo
} from '../utils/identificacionAlmacen';

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
 * Extrae uno o varios códigos EAN ingresados juntos (separados por espacios, comas, saltos de línea o pegados).
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
 * Pendientes de Almacén: muestra los productos cargados en Panel de Costos
 * y permite escanear consecutivamente cada unidad (descontando del contador en vivo)
 * para luego subir todo el lote de una vez al stock real y a Google Sheets con el botón Cargar.
 */
export default function PendientesIdentificar({ stockData, setStockData, syncWithSheet, cargarStockDesdeSheet }) {
  const [version, setVersion] = useState(0);
  const [abierto, setAbierto] = useState(null); // nombre normalizado del producto seleccionado
  const [filtro, setFiltro] = useState('pendientes');
  const [busqueda, setBusqueda] = useState('');
  const [feedback, setFeedback] = useState(null); // { tipo: 'ok'|'error', texto }
  const [codigoInput, setCodigoInput] = useState('');
  const [colaEscaneos, setColaEscaneos] = useState([]); // Array de códigos escaneados en esta tanda: [{ id, code, ts }]
  const [subiendo, setSubiendo] = useState(false);
  const [refrescando, setRefrescando] = useState(false);
  const inputRef = useRef(null);

  // Limpiar cola al cambiar o cerrar producto
  useEffect(() => {
    setColaEscaneos([]);
    setFeedback(null);
    setCodigoInput('');
  }, [abierto]);

  // Lista unificada: stockData + productos recién cargados en Panel de Costos
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
          const total = stockOficialUnidades(p);
          const scans = (ident[k] && Array.isArray(ident[k]?.scans)) ? ident[k].scans : [];
          map.set(k, {
            prod: p,
            total,
            identificadas: scans.length,
            scans,
            key: k
          });
        });

      // 2. Productos guardados en Panel de Costos (para que aparezcan de inmediato apenas se carguen)
      try {
        const rawGuardados = localStorage.getItem('huerta_data_costos_v31_productos') ||
          localStorage.getItem('huerta_data_costos_v1_productos') ||
          '[]';
        const parsed = JSON.parse(rawGuardados);
        const guardados = Array.isArray(parsed) ? parsed : [];
        guardados.forEach((cp) => {
          if (!cp || !cp.nombre) return;
          const esAlm = cp.categoriaPrincipal === 'Almacén' || cp.esUnidad || (cp.id && String(cp.id).startsWith('alm_'));
          if (!esAlm) return;
          const k = normNombre(cp.nombre);
          if (!k) return;
          const totalCostos = Math.max(0, Math.round(Number(cp.stock_unidades ?? cp.cantidadCajon) || 0));
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
          const totalCostos = Math.max(0, Math.round(Number(cp.stock_unidades ?? cp.cantidadCajon) || 0));
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
  }, [stockData, version]);

  const visibles = (productos || []).filter((x) => {
    if (!x || !x.prod) return false;
    const prodNombre = String(x.prod?.nombre || '');
    if (busqueda && !normNombre(prodNombre).includes(normNombre(busqueda))) return false;
    if (filtro === 'pendientes') return x.total > 0 && x.identificadas < x.total;
    return true;
  });

  const actual = abierto ? (productos || []).find((x) => x.key === abierto) : null;
  const pendientesCount = (productos || []).filter((x) => x.total > 0 && x.identificadas < x.total).length;

  const enfocar = useCallback(() => inputRef.current?.focus(), []);
  useEffect(() => {
    if (!actual) return;
    enfocar();
    const t = setInterval(() => {
      const a = document.activeElement;
      if (!a || a === document.body) enfocar();
    }, 1500);
    return () => clearInterval(t);
  }, [actual?.key, enfocar]);

  // Números en vivo del producto abierto
  const totalObjetivo = actual?.total || 0;
  const yaEnStock = actual?.identificadas || 0;
  const enCola = colaEscaneos.length;
  const totalConCola = yaEnStock + enCola;
  const restanEscanear = Math.max(0, totalObjetivo - totalConCola);
  const completo = totalObjetivo > 0 && totalConCola >= totalObjetivo;
  const pct = totalObjetivo > 0 ? Math.min(100, Math.round((totalConCola / totalObjetivo) * 100)) : 0;

  // ── Agregar códigos escaneados a la cola local (descuenta el contador en vivo) ──
  const agregarALaCola = (rawTexto) => {
    const codigos = extraerCodigos(rawTexto);
    if (codigos.length === 0 || !actual) return;

    const nuevosValidos = [];
    const errores = [];

    for (const code of codigos) {
      if (!esCodigoEan(code)) {
        errores.push(`"${code}" no es un código EAN válido`);
        continue;
      }
      const otro = productoDeCodigo(code, actual.prod.nombre);
      if (otro) {
        errores.push(`Código ${code} ya asociado a "${otro}"`);
        continue;
      }
      nuevosValidos.push({
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        code,
        ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      });
    }

    if (nuevosValidos.length > 0) {
      playScanBeep(true);
      setColaEscaneos((prev) => [...prev, ...nuevosValidos]);
      setCodigoInput('');
      setFeedback(null);
    } else if (errores.length > 0) {
      playScanBeep(false);
      setFeedback({ tipo: 'error', texto: errores.join(' | ') });
    }
    enfocar();
  };

  const quitarDeCola = (index) => {
    setColaEscaneos((prev) => prev.filter((_, i) => i !== index));
    enfocar();
  };

  const vaciarCola = () => {
    setColaEscaneos([]);
    setFeedback(null);
    enfocar();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (codigoInput.trim()) {
        agregarALaCola(codigoInput);
      } else if (colaEscaneos.length > 0) {
        subirTodoAlStock();
      }
    }
  };

  // ── Suma unidades directamente al stock real y sincroniza con Google Sheets ──
  const sumarAlStockReal = (cantidad) => {
    if (!actual || cantidad <= 0) return;
    const k = actual.key;
    const prodRef = actual.prod;

    // 1. Actualizar stockData local y sincronizar con Sheet
    if (setStockData) {
      setStockData((prev) => {
        const next = { ...(prev || {}) };
        let targetId = prodRef.id && next[prodRef.id] ? prodRef.id : null;
        if (!targetId) {
          targetId = Object.keys(next).find((id) => normNombre(next[id]?.nombre) === k);
        }

        if (targetId && next[targetId]) {
          const item = next[targetId];
          const stockActual = Number(item.stock?.unidades ?? item.stock?.['1kg']) || 0;
          const nuevoStock = stockActual + cantidad;
          const updated = {
            ...item,
            stock: {
              ...item.stock,
              '1kg': nuevoStock,
              unidades: nuevoStock
            },
            originalLoad: {
              ...item.originalLoad,
              '1kg': Math.max(Number(item.originalLoad?.unidades ?? item.originalLoad?.['1kg']) || 0, actual.total, nuevoStock),
              unidades: Math.max(Number(item.originalLoad?.unidades ?? item.originalLoad?.['1kg']) || 0, actual.total, nuevoStock)
            }
          };
          next[targetId] = updated;
          if (syncWithSheet) syncWithSheet(updated);
          return next;
        } else {
          const nuevoId = prodRef.id || `alm_${k.replace(/\s+/g, '_')}`;
          const updated = {
            ...prodRef,
            id: nuevoId,
            stock: { '500g': 0, '1kg': cantidad, unidades: cantidad },
            originalLoad: { '500g': 0, '1kg': Math.max(actual.total, cantidad), unidades: Math.max(actual.total, cantidad) },
            esUnidad: true,
            categoriaPrincipal: 'Almacén'
          };
          next[nuevoId] = updated;
          if (syncWithSheet) syncWithSheet(updated);
          return next;
        }
      });
    }

    // 2. Persistir en huerta_stock_units_cache_v1
    try {
      const unitsCache = JSON.parse(localStorage.getItem('huerta_stock_units_cache_v1') || '{}');
      const prevStock = Number(unitsCache[k]?.stock) || 0;
      const nuevoStock = prevStock + cantidad;
      unitsCache[k] = {
        ...(unitsCache[k] || {}),
        stock: nuevoStock,
        originalLoad: Math.max(Number(unitsCache[k]?.originalLoad) || 0, actual.total, nuevoStock),
        subcategoria: prodRef.subcategoria || 'Almacén',
        unidad: prodRef.unidad || 'unidad',
        fecha: new Date().toISOString().split('T')[0]
      };
      localStorage.setItem('huerta_stock_units_cache_v1', JSON.stringify(unitsCache));
    } catch (e) {}
  };

  // ── "CARGAR": Sube todos los códigos acumulados en la cola al stock real y a Google Sheets ──
  const subirTodoAlStock = async () => {
    if (subiendo || !actual) return;

    // Si había algo ingresado en el input sin presionar Enter, incluirlo
    const codigosFinales = [...colaEscaneos.map((x) => x.code)];
    if (codigoInput.trim()) {
      const extraidos = extraerCodigos(codigoInput);
      for (const c of extraidos) {
        if (esCodigoEan(c)) codigosFinales.push(c);
      }
      setCodigoInput('');
    }

    if (codigosFinales.length === 0) return;

    setSubiendo(true);
    try {
      let exitosos = 0;
      for (const code of codigosFinales) {
        const res = registrarEscaneo(actual.prod, code, { forzar: true });
        if (res.status === 'ok' || res.status === 'excedido') {
          exitosos++;
        }
      }

      if (exitosos > 0) {
        sumarAlStockReal(exitosos);
        playScanBeep(true);
        setColaEscaneos([]);
        setVersion((v) => v + 1);
        setFeedback({
          tipo: 'ok',
          texto: `✅ ¡${exitosos} ${exitosos === 1 ? 'producto ingresado' : 'productos ingresados'} con éxito al stock real y sincronizados con Google Sheets!`
        });
      }
    } catch (e) {
      console.error('Error subiendo stock:', e);
      setFeedback({ tipo: 'error', texto: 'Ocurrió un error al subir los productos al stock.' });
    } finally {
      setSubiendo(false);
      enfocar();
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

  // ── Vista de detalle de un producto para escanear y cargar ─────────────────
  if (actual) {
    const { prod, scans } = actual;

    return (
      <div className="bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 border border-white/10 rounded-3xl p-5 space-y-4">
        <button
          type="button"
          onClick={() => { setAbierto(null); setColaEscaneos([]); setFeedback(null); setCodigoInput(''); }}
          className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-white cursor-pointer transition"
        >
          <ArrowLeft size={14} /> Volver a la lista
        </button>

        {/* Encabezado del producto */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-white font-black text-xl leading-tight">{prod.nombre}</h3>
            <p className="text-[11px] text-gray-500 uppercase tracking-wider font-bold mt-0.5">
              Stock oficial comprado en Panel de Costos: <span className="text-gray-300">{totalObjetivo} ud</span>
            </p>
          </div>
          {completo && (
            <span className="px-3 py-1 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center gap-1 shrink-0">
              <CheckCircle2 size={13} /> Completo
            </span>
          )}
        </div>

        {/* ── CONTADORES EN VIVO: Se descuenta automáticamente con cada escaneo ── */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="bg-black/40 border border-white/10 rounded-2xl p-3 text-center">
            <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">A ingresar</div>
            <div className="text-2xl font-black font-mono text-white mt-0.5">
              {totalObjetivo} <span className="text-xs text-gray-500 font-sans">ud</span>
            </div>
            <div className="text-[9px] text-gray-500 mt-0.5 font-semibold">Total Costos</div>
          </div>

          <div className={`border rounded-2xl p-3 text-center transition-all duration-200 ${
            enCola > 0
              ? 'bg-emerald-950/60 border-emerald-500/50 shadow-lg shadow-emerald-950/50'
              : 'bg-black/40 border-white/10'
          }`}>
            <div className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">En cola (listas)</div>
            <div className="text-2xl font-black font-mono text-emerald-400 mt-0.5">
              +{enCola} <span className="text-xs font-sans">ud</span>
            </div>
            <div className="text-[9px] text-emerald-500/80 mt-0.5 font-semibold">Para subir con Cargar</div>
          </div>

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
              {restanEscanear === 0 ? '¡Listo para subir!' : 'Se descuenta al escanear'}
            </div>
          </div>
        </div>

        {/* Barra de progreso */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-gray-400 font-mono">
            <span>Progreso de escaneo</span>
            <span className="font-bold text-white">{totalConCola} de {totalObjetivo} ({pct}%)</span>
          </div>
          <div className="h-2.5 rounded-full bg-black/60 overflow-hidden border border-white/5">
            <div
              className={`h-full transition-all duration-300 ${completo ? 'bg-emerald-500' : 'bg-gradient-to-r from-amber-500 to-emerald-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {totalObjetivo === 0 && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            Este producto no tiene cantidad en Panel de Costos. Podés escanear igual para ingresarlo directamente al stock.
          </div>
        )}

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
                onChange={(e) => setCodigoInput(e.target.value)}
                onKeyDown={onKeyDown}
                onBlur={() => setTimeout(enfocar, 150)}
                placeholder={`🔫 Escaneá aquí cada unidad de "${prod.nombre}"...`}
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
            ⚡ <strong className="text-white">Escaneo ultra rápido:</strong> dispará con la pistola seguidas las veces que necesites (ej: 3 veces para 3 harinas). Cada disparo descuenta del contador y queda listo para subir.
          </p>
        </div>

        {/* ── LISTA DE CÓDIGOS EN COLA DE ESTA SESIÓN ────────────────────── */}
        {enCola > 0 && (
          <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                <CheckCircle2 size={15} className="text-emerald-400" />
                {enCola} {enCola === 1 ? 'producto escaneado' : 'productos escaneados'} en cola para subir
              </span>
              <button
                type="button"
                onClick={vaciarCola}
                className="text-[10px] uppercase font-bold text-gray-400 hover:text-red-400 transition cursor-pointer"
              >
                Limpiar cola
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {colaEscaneos.map((item, idx) => (
                <span
                  key={item.id || idx}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-900/60 border border-emerald-500/40 text-emerald-200 font-mono text-xs shadow-sm"
                >
                  <span className="text-emerald-400 font-bold">#{idx + 1}</span>
                  <span>{item.code}</span>
                  <button
                    type="button"
                    onClick={() => quitarDeCola(idx)}
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

        {/* ── BOTÓN VISIBLE: CARGAR AL STOCK REAL ────────────────────────── */}
        <button
          type="button"
          onClick={() => subirTodoAlStock()}
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
                  ? `Cargar ${enCola} ${enCola === 1 ? 'producto' : 'productos'} al stock real`
                  : codigoInput.trim()
                  ? 'Cargar al stock real'
                  : 'Cargar al stock real'}
              </span>
            </>
          )}
        </button>

        {/* Historial de escaneos previos ya subidos */}
        {scans && scans.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-white/5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-black text-gray-400 tracking-widest">
                Códigos ya ingresados al stock ({scans.length})
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

  // ── Vista de Lista de Productos ───────────────────────────────────────────
  return (
    <div className="bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 border border-white/10 rounded-3xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-white font-black text-sm uppercase tracking-wider">Productos por ingresar al stock</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Escaneá con la pistola cada unidad física comprada en Panel de Costos para que ingrese al stock real.
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

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto..."
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

      {visibles.length === 0 ? (
        <div className="py-10 text-center text-gray-500 text-xs font-bold flex flex-col items-center gap-2">
          <Package size={28} className="text-gray-600" />
          {filtro === 'pendientes' ? 'No hay productos pendientes de ingresar 🎉' : 'No hay productos de Almacén cargados.'}
        </div>
      ) : (
        <div className="space-y-2">
          {visibles.map(({ prod, total, identificadas, key }) => {
            const completo = total > 0 && identificadas >= total;
            const pct = total > 0 ? Math.min(100, Math.round((identificadas / total) * 100)) : 0;
            return (
              <button
                key={key}
                type="button"
                onClick={() => { setAbierto(key); setFeedback(null); setColaEscaneos([]); }}
                className="w-full text-left p-3.5 rounded-2xl bg-black/30 hover:bg-black/50 border border-white/5 hover:border-green-500/30 transition cursor-pointer"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white text-sm font-bold truncate">{prod.nombre}</span>
                  <span className={`text-xs font-black font-mono shrink-0 ${
                    identificadas > total ? 'text-amber-400' : completo ? 'text-emerald-400' : 'text-amber-400'
                  }`}>
                    {total === 0 ? 'Sin cantidad cargada' : `${identificadas} de ${total} ingresadas`}
                  </span>
                </div>
                <div className="h-1.5 mt-2 rounded-full bg-black/50 overflow-hidden">
                  <div className={`h-full ${completo ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
