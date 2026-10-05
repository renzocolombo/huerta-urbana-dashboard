import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { ScanBarcode, ArrowLeft, AlertTriangle, CheckCircle2, Search, RotateCcw, Package, PlusCircle, ArrowRight } from 'lucide-react';
import { esCodigoEan } from '../data/productUtils';
import {
  getIdentificaciones, esProductoAlmacenUnidad, stockOficialUnidades, normNombre,
  registrarEscaneo, deshacerUltimoEscaneo, productoDeCodigo
} from '../utils/identificacionAlmacen';

const limpiar = (raw) =>
  String(raw || '').replace(/[\r\n\x00-\x1F]/g, '').trim().replace(/^\][a-zA-Z0-9]{2,3}/, '').replace(/^\*+|\*+$/g, '').trim();

/**
 * Extrae uno o varios códigos EAN ingresados juntos (separados por espacios, comas, saltos de línea o pegados).
 */
export function extraerCodigos(raw) {
  if (!raw) return [];
  const str = String(raw).trim();
  const piezas = str.split(/[\r\n\t,;\s]+/).map(limpiar).filter(Boolean);
  const resultado = [];

  for (const pieza of piezas) {
    // Si vienen pegados de a 13 dígitos
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
 * Productos a escanear: muestra cuántas unidades del stock oficial (definido en
 * Panel de Costos) ya fueron identificadas con un EAN.
 */
export default function PendientesIdentificar({ stockData }) {
  const [version, setVersion] = useState(0);
  const [abierto, setAbierto] = useState(null); // nombre normalizado
  const [filtro, setFiltro] = useState('pendientes');
  const [busqueda, setBusqueda] = useState('');
  const [feedback, setFeedback] = useState(null); // { tipo: 'ok'|'error', texto }
  const [excedido, setExcedido] = useState(null); // { codigos: [] }
  const [codigoInput, setCodigoInput] = useState('');
  const inputRef = useRef(null);

  const productos = useMemo(() => {
    const ident = getIdentificaciones();
    return Object.values(stockData || {})
      .filter(esProductoAlmacenUnidad)
      .map((p) => {
        const total = stockOficialUnidades(p);
        const scans = ident[normNombre(p.nombre)]?.scans || [];
        return { prod: p, total, identificadas: scans.length, scans, key: normNombre(p.nombre) };
      })
      .sort((a, b) => a.prod.nombre.localeCompare(b.prod.nombre));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockData, version]);

  const visibles = productos.filter((x) => {
    if (busqueda && !normNombre(x.prod.nombre).includes(normNombre(busqueda))) return false;
    if (filtro === 'pendientes') return x.total > 0 && x.identificadas < x.total;
    return true;
  });

  const actual = abierto ? productos.find((x) => x.key === abierto) : null;
  const pendientesCount = productos.filter((x) => x.total > 0 && x.identificadas < x.total).length;

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

  const procesar = (raw, forzar = false) => {
    const codigos = extraerCodigos(raw);
    if (codigos.length === 0 || !actual) return;

    let exitosos = 0;
    let ultimoRes = null;
    const errores = [];
    const excedentesPendientes = [];

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

      const res = registrarEscaneo(actual.prod, code, { forzar });
      if (res.status === 'excedido') {
        excedentesPendientes.push(code);
        continue;
      }

      exitosos++;
      ultimoRes = res;
    }

    if (excedentesPendientes.length > 0) {
      setExcedido({ codigos: excedentesPendientes, code: excedentesPendientes[0] });
    } else {
      setExcedido(null);
    }

    if (exitosos > 0) {
      setVersion((v) => v + 1);
    }

    // Feedback claro según cantidad de códigos
    if (exitosos > 0 && errores.length === 0 && excedentesPendientes.length === 0) {
      if (codigos.length === 1) {
        setFeedback({
          tipo: 'ok',
          texto: ultimoRes?.completo
            ? `✅ ${actual.prod.nombre}: ${ultimoRes.identificadas} de ${ultimoRes.total} — ¡todas las unidades identificadas!`
            : `✅ Código ${codigos[0]} cargado (+1 producto). ${ultimoRes?.identificadas || 0} de ${ultimoRes?.total || 0} identificadas.`
        });
      } else {
        setFeedback({
          tipo: 'ok',
          texto: `✅ Se cargaron ${exitosos} códigos (cada uno contó como 1 producto). ${ultimoRes?.identificadas || 0} de ${ultimoRes?.total || 0} identificadas.`
        });
      }
    } else if (exitosos > 0) {
      setFeedback({
        tipo: 'ok',
        texto: `✅ Se cargaron ${exitosos} producto(s). ${errores.length ? '⚠️ Omitidos: ' + errores.join(', ') : ''} ${excedentesPendientes.length ? `(${excedentesPendientes.length} exceden stock)` : ''}`
      });
    } else if (errores.length > 0) {
      setFeedback({
        tipo: 'error',
        texto: errores.join(' | ')
      });
    }
  };

  const ejecutarCarga = (texto) => {
    const valor = texto !== undefined ? texto : codigoInput;
    if (!valor || !valor.trim()) return;
    setCodigoInput('');
    procesar(valor);
    enfocar();
  };

  const onKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    ejecutarCarga(codigoInput);
  };

  const forzarExcedentes = () => {
    if (!excedido) return;
    const lista = excedido.codigos || [excedido.code];
    procesar(lista.join(' '), true);
    setExcedido(null);
    enfocar();
  };

  const deshacer = () => {
    if (!actual) return;
    deshacerUltimoEscaneo(actual.prod);
    setExcedido(null);
    setFeedback(null);
    setVersion((v) => v + 1);
    enfocar();
  };

  // ── Vista de detalle de un producto ───────────────────────────────────────
  if (actual) {
    const { prod, total, identificadas, scans } = actual;
    const completo = total > 0 && identificadas >= total;
    const pct = total > 0 ? Math.min(100, Math.round((identificadas / total) * 100)) : 0;
    return (
      <div className="bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 border border-white/10 rounded-3xl p-5 space-y-4">
        <button
          type="button"
          onClick={() => { setAbierto(null); setFeedback(null); setExcedido(null); setCodigoInput(''); }}
          className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-white cursor-pointer"
        >
          <ArrowLeft size={14} /> Volver a la lista
        </button>

        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-white font-black text-lg leading-tight">{prod.nombre}</h3>
            <p className="text-[11px] text-gray-500 uppercase tracking-wider font-bold">
              Stock oficial (Panel de Costos): {total} ud
            </p>
          </div>
          <div className={`px-4 py-2 rounded-xl border text-right ${completo ? 'bg-emerald-950/50 border-emerald-500/40' : 'bg-black/40 border-white/10'}`}>
            <div className={`text-3xl font-black font-mono ${identificadas > total ? 'text-amber-400' : completo ? 'text-emerald-400' : 'text-white'}`}>
              {identificadas} <span className="text-gray-500 text-lg">de {total}</span>
            </div>
            <div className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">identificadas</div>
          </div>
        </div>

        <div className="h-2 rounded-full bg-black/50 overflow-hidden">
          <div className={`h-full transition-all duration-300 ${completo ? 'bg-emerald-500' : 'bg-green-600'}`} style={{ width: `${pct}%` }} />
        </div>

        {total === 0 && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            Este producto no tiene stock cargado. Cargalo primero en Panel de Costos.
          </div>
        )}

        {excedido && (
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/40 text-amber-200 text-xs space-y-2.5">
            <div className="flex items-start gap-2 font-semibold">
              <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-400" />
              <span>
                Ya están identificadas las {total} unidades del stock oficial. ¿Registrar {excedido.codigos?.length > 1 ? `los ${excedido.codigos.length} códigos restantes` : `el código ${excedido.code}`} de todos modos como excedente?
              </span>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={forzarExcedentes}
                className="px-3.5 py-1.5 rounded-xl bg-amber-500 text-black font-black text-xs cursor-pointer shadow-md hover:bg-amber-400 transition">
                Registrar igual
              </button>
              <button type="button" onClick={() => { setExcedido(null); enfocar(); }}
                className="px-3.5 py-1.5 rounded-xl bg-white/10 text-gray-200 font-bold text-xs cursor-pointer hover:bg-white/20 transition">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {feedback && (
          <div className={`p-3.5 rounded-2xl border text-xs font-semibold leading-relaxed ${feedback.tipo === 'ok'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
            {feedback.texto}
          </div>
        )}

        {/* ── CAMPO DE ENTRADA CON BOTÓN VISIBLE DE CARGA ────────────────── */}
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
                placeholder={`🔫 Escaneá o ingresá código(s) de "${prod.nombre}"`}
                className="w-full bg-black/40 border border-emerald-500/40 focus:border-emerald-400 text-white text-sm font-mono rounded-2xl pl-12 pr-4 py-3.5 outline-none transition shadow-inner"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <button
              type="button"
              onClick={() => ejecutarCarga()}
              disabled={!codigoInput.trim()}
              className={`px-5 py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all duration-200 cursor-pointer shadow-lg select-none ${
                codigoInput.trim()
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50 scale-[1.02] active:scale-[0.98]'
                  : 'bg-white/5 text-gray-500 border border-white/5 opacity-50 cursor-not-allowed'
              }`}
            >
              <PlusCircle size={16} />
              <span>Cargar</span>
            </button>
          </div>
          <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest px-1">
            Podés escanear con pistola (Enter automático), escribir o pegar varios códigos: cada código suma 1 producto.
          </p>
        </div>

        {scans.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-black text-gray-400 tracking-widest">Códigos escaneados</span>
              <button type="button" onClick={deshacer}
                className="flex items-center gap-1 text-[11px] font-bold text-gray-400 hover:text-red-400 cursor-pointer">
                <RotateCcw size={12} /> Deshacer último
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {[...scans].reverse().map((s, i) => (
                <div key={`${s.ts}-${i}`} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-black/30 text-xs font-mono text-gray-300">
                  <span>#{scans.length - i} · {s.code}</span>
                  {s.excedente && <span className="text-amber-400 font-bold text-[10px]">EXCEDENTE</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {completo && (
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
            <CheckCircle2 size={15} /> Producto reconocible automáticamente en el armado de pedidos.
          </div>
        )}
      </div>
    );
  }

  // ── Lista ─────────────────────────────────────────────────────────────────
  return (
    <div className="bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 border border-white/10 rounded-3xl p-5 space-y-4">
      <div>
        <h3 className="text-white font-black text-sm uppercase tracking-wider">Productos a escanear</h3>
        <p className="text-[11px] text-gray-500 mt-0.5">
          El stock lo define Panel de Costos. Acá identificás cada unidad con su código EAN.
        </p>
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
            <button key={k} type="button" onClick={() => setFiltro(k)}
              className={`px-3 rounded-lg text-[11px] font-black uppercase tracking-wider cursor-pointer ${filtro === k ? 'bg-green-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {visibles.length === 0 ? (
        <div className="py-10 text-center text-gray-500 text-xs font-bold flex flex-col items-center gap-2">
          <Package size={28} className="text-gray-600" />
          {filtro === 'pendientes' ? 'No hay productos pendientes de identificar 🎉' : 'No hay productos de Almacén.'}
        </div>
      ) : (
        <div className="space-y-2">
          {visibles.map(({ prod, total, identificadas, key }) => {
            const completo = total > 0 && identificadas >= total;
            const pct = total > 0 ? Math.min(100, Math.round((identificadas / total) * 100)) : 0;
            return (
              <button key={key} type="button" onClick={() => { setAbierto(key); setFeedback(null); setExcedido(null); }}
                className="w-full text-left p-3.5 rounded-2xl bg-black/30 hover:bg-black/50 border border-white/5 hover:border-green-500/30 transition cursor-pointer">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white text-sm font-bold truncate">{prod.nombre}</span>
                  <span className={`text-xs font-black font-mono shrink-0 ${identificadas > total ? 'text-amber-400' : completo ? 'text-emerald-400' : 'text-gray-300'}`}>
                    {total === 0 ? 'Sin stock' : `${identificadas} de ${total} identificadas`}
                  </span>
                </div>
                <div className="h-1.5 mt-2 rounded-full bg-black/50 overflow-hidden">
                  <div className={`h-full ${completo ? 'bg-emerald-500' : 'bg-green-600'}`} style={{ width: `${pct}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
