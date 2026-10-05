import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { ScanBarcode, ArrowLeft, AlertTriangle, CheckCircle2, Search, RotateCcw, Package } from 'lucide-react';
import { esCodigoEan } from '../data/productUtils';
import {
  getIdentificaciones, esProductoAlmacenUnidad, stockOficialUnidades, normNombre,
  registrarEscaneo, deshacerUltimoEscaneo, productoDeCodigo
} from '../utils/identificacionAlmacen';

const limpiar = (raw) =>
  String(raw || '').replace(/[\r\n\x00-\x1F]/g, '').trim().replace(/^\][a-zA-Z0-9]{2,3}/, '').replace(/^\*+|\*+$/g, '').trim();

/**
 * Productos a escanear: muestra cuántas unidades del stock oficial (definido en
 * Panel de Costos) ya fueron identificadas con un EAN. Escanear NO modifica stock.
 */
export default function PendientesIdentificar({ stockData }) {
  const [version, setVersion] = useState(0);
  const [abierto, setAbierto] = useState(null); // nombre normalizado
  const [filtro, setFiltro] = useState('pendientes');
  const [busqueda, setBusqueda] = useState('');
  const [feedback, setFeedback] = useState(null); // { tipo: 'ok'|'error', texto }
  const [excedido, setExcedido] = useState(null); // { code }
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
    const code = limpiar(raw);
    if (!code || !actual) return;
    if (!esCodigoEan(code)) {
      setFeedback({ tipo: 'error', texto: `"${code}" no parece un código EAN de producto (8 a 14 dígitos).` });
      return;
    }
    const otro = productoDeCodigo(code, actual.prod.nombre);
    if (otro) {
      setFeedback({ tipo: 'error', texto: `El código ${code} ya está asociado a "${otro}". No se asoció a este producto.` });
      return;
    }
    const res = registrarEscaneo(actual.prod, code, { forzar });
    if (res.status === 'excedido') {
      setExcedido({ code });
      setFeedback(null);
      return;
    }
    setExcedido(null);
    setVersion((v) => v + 1);
    setFeedback({
      tipo: 'ok',
      texto: res.completo
        ? `✅ ${actual.prod.nombre}: ${res.identificadas} de ${res.total} — todas identificadas`
        : `${code} asociado — ${res.identificadas} de ${res.total}`
    });
  };

  const onKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const v = e.currentTarget.value;
    e.currentTarget.value = '';
    procesar(v);
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
          onClick={() => { setAbierto(null); setFeedback(null); setExcedido(null); }}
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
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-200 text-xs space-y-2">
            <div className="flex items-start gap-2 font-semibold">
              <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-400" />
              <span>
                Ya están identificadas las {total} unidades de stock oficial. Si entró mercadería nueva,
                actualizá primero Panel de Costos. ¿Registrar el código {excedido.code} igual como excedente?
              </span>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => { procesar(excedido.code, true); enfocar(); }}
                className="px-3 py-1.5 rounded-lg bg-amber-500 text-black font-bold cursor-pointer">Registrar igual</button>
              <button type="button" onClick={() => { setExcedido(null); enfocar(); }}
                className="px-3 py-1.5 rounded-lg bg-white/10 text-gray-200 font-bold cursor-pointer">Cancelar</button>
            </div>
          </div>
        )}

        {feedback && (
          <div className={`p-3 rounded-xl border text-xs font-semibold ${feedback.tipo === 'ok'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
            {feedback.texto}
          </div>
        )}

        <div className="relative">
          <ScanBarcode size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-green-400" />
          <input
            ref={inputRef}
            type="text"
            onKeyDown={onKeyDown}
            onBlur={() => setTimeout(enfocar, 150)}
            placeholder={`🔫 Escaneá una unidad de "${prod.nombre}"`}
            className="w-full bg-black/40 border border-green-500/40 focus:border-green-400 text-white text-sm font-mono rounded-2xl pl-11 pr-4 py-3.5 outline-none"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">
          Escanear solo identifica: no suma ni resta stock.
        </p>

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
