import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Package, ScanBarcode, X, RotateCcw, Check, Square, 
  AlertTriangle, AlertCircle, Trash2, Clock, CheckCircle
} from 'lucide-react';
import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { useBalanzaSystel } from '../utils/balanzaSystel';
import { 
  determinarTipoCaptura, 
  TIPOS_CAPTURA, 
  etiquetaUnidad 
} from '../utils/tipoCapturaProducto';
import { parsearProductosPedido } from '../utils/remitoPrinter';
import { getEanMapping } from '../data/productUtils';
import { 
  apiReservarPedido, 
  apiSalidaAlmacenPedido, 
  apiSetDetallePedido, 
  apiGuardarPreparacion, 
  apiRegistrarPesadas 
} from '../utils/mercaderiaApi';

const PREPARACIONES_KEY = 'huerta_preparaciones_v1';

const norm = (s) =>
  (s || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export default function ModalArmadoPedido({ pedido, onClose, onPedidoArmado }) {
  const { 
    stockData, 
    productosCostos, 
    actualizarEstadoEnSheet, 
    fetchControlStock 
  } = useGoogleSheets();

  const stockDataRef = useRef(stockData);
  useEffect(() => { stockDataRef.current = stockData; }, [stockData]);

  const balanza = useBalanzaSystel();
  const numPedido = pedido?.numero_pedido || (pedido?.sheetRowIndex ? `#${pedido.sheetRowIndex}` : '');

  // Preparación cargada desde localStorage o inicializada
  const [prep, setPrep] = useState(() => {
    try {
      const local = JSON.parse(localStorage.getItem(PREPARACIONES_KEY) || '{}');
      if (local[numPedido]) return local[numPedido];
    } catch (_) {
      // ignore
    }

    const parsed = parsearProductosPedido(pedido.producto, pedido.cantidades);
    const items = parsed.map(it => {
      const tipo = determinarTipoCaptura(it, stockData);
      return {
        ...it,
        tipoCaptura: tipo,
        cantidadEditada: it.cantidad,
        cantidadConfirmada: null,
        pesoCongelado: null,
        confirmado: false,
        scans: 0,
        bolsasAsignadas: []
      };
    });
    return { items, completado: false, fechaInicio: new Date().toISOString() };
  });

  const [scanBuffer, setScanBuffer] = useState('');
  const [scanError, setScanError] = useState(null);
  const [scanSuccess, setScanSuccess] = useState(null);
  const [pesoManual, setPesoManual] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [avisoReserva, setAvisoReserva] = useState(null);
  const [modalReiniciar, setModalReiniciar] = useState(false);

  const scanInputRef = useRef(null);
  const reservaLlamadaRef = useRef(false);

  // Guardar en localStorage cada cambio de prep
  useEffect(() => {
    if (!numPedido || !prep) return;
    try {
      const local = JSON.parse(localStorage.getItem(PREPARACIONES_KEY) || '{}');
      local[numPedido] = prep;
      localStorage.setItem(PREPARACIONES_KEY, JSON.stringify(local));
    } catch (_) {
      // ignore
    }
  }, [prep, numPedido]);

  // Reservar stock al montar si no se hizo aún
  useEffect(() => {
    if (!numPedido || reservaLlamadaRef.current) return;
    reservaLlamadaRef.current = true;

    const itemsParaReserva = (prep?.items || []).map(it => ({
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
        }
      })
      .catch(err => {
        setAvisoReserva({ tipo: 'error', mensaje: `⚠️ Error de red al reservar stock: ${err.message}` });
      });

    setTimeout(() => scanInputRef.current?.focus(), 150);
  }, [numPedido, prep?.items]);

  // Helper de precio congelado
  const obtenerPrecioCongelado = useCallback((nombreProd) => {
    const pNorm = norm(nombreProd);
    const encontrado = (productosCostos || []).find(c => norm(c.nombre) === pNorm || norm(c.producto) === pNorm);
    return Number(encontrado?.precio_venta || encontrado?.precio || 0);
  }, [productosCostos]);

  // Cálculos de completitud
  const items = prep?.items || [];
  const itemsActivos = items.filter(it => !it.sin_stock);

  const todosCompletos = itemsActivos.length > 0 && itemsActivos.every(it => {
    const t = it.tipoCaptura || determinarTipoCaptura(it, stockDataRef.current);
    if (t === TIPOS_CAPTURA.PESABLE) return Boolean(it.confirmado && it.pesoCongelado != null) || (it.bolsasAsignadas?.length || 0) >= (it.cantidad || 1);
    if (t === TIPOS_CAPTURA.UNIDAD_MANUAL) return Boolean(it.confirmado && it.cantidadConfirmada != null) || (it.bolsasAsignadas?.length || 0) >= (it.cantidad || 1);
    return (it.scans || (it.bolsasAsignadas?.length || 0)) >= (it.cantidad || 1);
  });

  const todosChequeados = items.length > 0 && items.every((it) => {
    if (it.sin_stock) return true;
    const t = it.tipoCaptura || determinarTipoCaptura(it, stockDataRef.current);
    const listo = t === TIPOS_CAPTURA.PESABLE 
      ? Boolean(it.confirmado && it.pesoCongelado != null) || (it.bolsasAsignadas?.length || 0) >= (it.cantidad || 1)
      : t === TIPOS_CAPTURA.UNIDAD_MANUAL
      ? Boolean(it.confirmado && it.cantidadConfirmada != null) || (it.bolsasAsignadas?.length || 0) >= (it.cantidad || 1)
      : (it.scans || (it.bolsasAsignadas?.length || 0)) >= (it.cantidad || 1);
    return listo;
  });

  // Métodos de confirmación
  const confirmarPesoPesable = (itemIdx, pesoManualVal = null) => {
    const it = items[itemIdx];
    if (!it) return;

    let pesoFinal = 0;
    if (pesoManualVal !== null && Number(pesoManualVal) > 0) {
      pesoFinal = Number(Number(pesoManualVal).toFixed(3));
    } else if (balanza.conectado && balanza.pesoVivo !== null && Number(balanza.pesoVivo) > 0) {
      pesoFinal = Number(Number(balanza.pesoVivo).toFixed(3));
    } else if (pesoManual[itemIdx] && Number(pesoManual[itemIdx]) > 0) {
      pesoFinal = Number(Number(pesoManual[itemIdx]).toFixed(3));
    }

    if (pesoFinal <= 0) {
      setScanError('⚖️ Colocá el producto en la balanza para capturar el peso en vivo.');
      setTimeout(() => setScanError(null), 3000);
      return;
    }

    const nuevosItems = [...items];
    nuevosItems[itemIdx] = {
      ...it,
      pesoCongelado: pesoFinal,
      cantidad_real: pesoFinal,
      confirmado: true,
      esPesado: true,
      bolsasAsignadas: [{
        uniqueCode: `PESO_${Date.now()}`,
        peso: pesoFinal,
        rawCode: `PESO_${pesoFinal}kg`,
        nombre: it.nombre,
        ts: Date.now()
      }]
    };

    setPrep(prev => ({ ...prev, items: nuevosItems }));
    setScanSuccess(`⚖️ ${it.nombre}: pesado ${pesoFinal.toFixed(3)} kg`);
    setTimeout(() => setScanSuccess(null), 2500);
  };

  const reabrirItemPesable = (itemIdx) => {
    const nuevosItems = [...items];
    nuevosItems[itemIdx] = {
      ...nuevosItems[itemIdx],
      confirmado: false,
      pesoCongelado: null,
      cantidad_real: 0,
      bolsasAsignadas: []
    };
    setPrep(prev => ({ ...prev, items: nuevosItems, completado: false }));
  };

  const ajustarCantidadManual = (itemIdx, delta) => {
    const it = items[itemIdx];
    if (!it) return;
    const actual = it.cantidadEditada != null ? it.cantidadEditada : it.cantidad;
    const nueva = Math.max(0, actual + delta);
    const nuevosItems = [...items];
    nuevosItems[itemIdx] = { ...it, cantidadEditada: nueva };
    setPrep(prev => ({ ...prev, items: nuevosItems }));
  };

  const confirmarCantidadManual = (itemIdx) => {
    const it = items[itemIdx];
    if (!it) return;
    const cantFinal = it.cantidadEditada != null ? it.cantidadEditada : it.cantidad;
    const nuevosItems = [...items];
    nuevosItems[itemIdx] = {
      ...it,
      cantidadConfirmada: cantFinal,
      cantidad_real: cantFinal,
      confirmado: true,
      esUnidad: true,
      bolsasAsignadas: [{
        uniqueCode: `UNID_${Date.now()}`,
        peso: 1,
        esUnidad: true,
        nombre: it.nombre,
        ts: Date.now()
      }]
    };
    setPrep(prev => ({ ...prev, items: nuevosItems }));
    setScanSuccess(`✅ ${it.nombre}: confirmado ${cantFinal} ${etiquetaUnidad(it.unidad, cantFinal)}`);
    setTimeout(() => setScanSuccess(null), 2500);
  };

  const reabrirItemManual = (itemIdx) => {
    const nuevosItems = [...items];
    nuevosItems[itemIdx] = {
      ...nuevosItems[itemIdx],
      confirmado: false,
      cantidadConfirmada: null,
      bolsasAsignadas: []
    };
    setPrep(prev => ({ ...prev, items: nuevosItems, completado: false }));
  };

  const toggleSinStock = (itemIdx) => {
    const it = items[itemIdx];
    if (!it) return;
    const esSin = !it.sin_stock;
    const nuevosItems = [...items];
    nuevosItems[itemIdx] = {
      ...it,
      sin_stock: esSin,
      confirmado: esSin,
      pesoCongelado: esSin ? 0 : it.pesoCongelado,
      cantidadConfirmada: esSin ? 0 : it.cantidadConfirmada,
      cantidad_real: esSin ? 0 : it.cantidad_real,
      bolsasAsignadas: esSin ? [] : it.bolsasAsignadas
    };
    setPrep(prev => ({ ...prev, items: nuevosItems }));
  };

  const desarmarScanEan = (itemIdx) => {
    const it = items[itemIdx];
    if (!it) return;
    const nuevosItems = [...items];
    const scans = Math.max(0, (it.scans || (it.bolsasAsignadas?.length || 0)) - 1);
    nuevosItems[itemIdx] = {
      ...it,
      scans,
      bolsasAsignadas: (it.bolsasAsignadas || []).slice(0, -1),
      confirmado: scans >= it.cantidad
    };
    setPrep(prev => ({ ...prev, items: nuevosItems, completado: false }));
  };

  // Escaneo de código de barras
  const procesarCodigoEscaneado = (rawCode) => {
    const code = String(rawCode || '').trim();
    if (!code) return;

    // 1. Verificar si coincide con un producto pesable, almacén o EAN
    const eanMap = getEanMapping();
    const nombrePorEan = eanMap[code] || null;

    // Buscar en los items del pedido
    let matchIdx = -1;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.sin_stock) continue;
      const itNorm = norm(it.nombre);

      // Match directo por EAN asociado al item
      if (it.ean && String(it.ean).trim() === code) {
        matchIdx = i;
        break;
      }
      // Match si el EAN apunta a este nombre
      if (nombrePorEan && norm(nombrePorEan) === itNorm) {
        matchIdx = i;
        break;
      }
      // Match si el código coincide con el nombre o código
      if (norm(code) === itNorm || itNorm.includes(norm(code))) {
        matchIdx = i;
        break;
      }
    }

    if (matchIdx >= 0) {
      const it = items[matchIdx];
      const tipo = it.tipoCaptura || determinarTipoCaptura(it, stockDataRef.current);

      if (tipo === TIPOS_CAPTURA.PESABLE) {
        confirmarPesoPesable(matchIdx);
      } else if (tipo === TIPOS_CAPTURA.UNIDAD_MANUAL) {
        confirmarCantidadManual(matchIdx);
      } else {
        // Almacén EAN: sumar escaneo
        const scans = (it.scans || (it.bolsasAsignadas?.length || 0)) + 1;
        const nuevosItems = [...items];
        nuevosItems[matchIdx] = {
          ...it,
          scans,
          confirmado: scans >= it.cantidad,
          bolsasAsignadas: [
            ...(it.bolsasAsignadas || []),
            {
              uniqueCode: `EAN_${code}_${Date.now()}`,
              peso: 1,
              rawCode: code,
              nombre: it.nombre,
              ts: Date.now()
            }
          ]
        };
        setPrep(prev => ({ ...prev, items: nuevosItems }));
        setScanSuccess(`🏷️ ${it.nombre}: unidad ${scans}/${it.cantidad} escaneada`);
        setTimeout(() => setScanSuccess(null), 2500);
      }
    } else {
      setScanError(`Código ${code} no coincide con ningún producto pendiente de este pedido.`);
      setTimeout(() => setScanError(null), 3000);
    }
  };

  const handleScanKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      procesarCodigoEscaneado(scanBuffer);
      setScanBuffer('');
    }
  };

  // Botón "PEDIDO ARMADO"
  const handleFinalizarArmado = async () => {
    if (!prep || !prep.items) return;
    setGuardando(true);

    try {
      const detalle = prep.items.map(it => {
        const esSinStock = Boolean(it.sin_stock);
        const bolsas = esSinStock ? [] : (it.bolsasAsignadas || []);
        const tipo = it.tipoCaptura || determinarTipoCaptura(it, stockDataRef.current);
        let cantReal = 0;
        let unidad = 'un';

        if (esSinStock) {
          cantReal = 0;
        } else if (tipo === TIPOS_CAPTURA.PESABLE) {
          unidad = 'kg';
          cantReal = it.pesoCongelado != null
            ? Number(it.pesoCongelado)
            : (it.cantidad_real != null && Number(it.cantidad_real) > 0
                ? Number(it.cantidad_real)
                : Number(bolsas.reduce((acc, b) => acc + (Number(b.peso) || 0), 0).toFixed(3)));
        } else if (tipo === TIPOS_CAPTURA.UNIDAD_MANUAL) {
          unidad = it.unidad || (/\batado\b/i.test(it.nombre) ? 'atado' : 'un');
          cantReal = it.cantidadConfirmada != null
            ? Number(it.cantidadConfirmada)
            : (it.cantidad_real != null && Number(it.cantidad_real) > 0
                ? Number(it.cantidad_real)
                : Number(it.cantidad || 1));
        } else {
          unidad = 'un';
          cantReal = it.scans != null ? Number(it.scans) : (bolsas.length > 0 ? bolsas.length : Number(it.cantidad || 1));
        }

        const precioUnit = obtenerPrecioCongelado(it.nombre);
        const subtotal = esSinStock ? 0 : Math.round(cantReal * precioUnit);
        return {
          producto: it.nombre,
          nombre: it.nombre,
          unidad,
          tipoCaptura: tipo,
          cantidad_real: cantReal,
          cantidad: cantReal,
          pesoCongelado: tipo === TIPOS_CAPTURA.PESABLE ? cantReal : null,
          cantidadConfirmada: tipo !== TIPOS_CAPTURA.PESABLE ? cantReal : null,
          precio_unitario: precioUnit,
          subtotal,
          sin_stock: esSinStock
        };
      });

      // 1. Salida de Almacén si corresponde
      const itemsAlmacen = (prep.items || [])
        .filter(it => {
          const tipo = it.tipoCaptura || determinarTipoCaptura(it, stockDataRef.current);
          return tipo === TIPOS_CAPTURA.ALMACEN_EAN || Boolean(it.ean);
        })
        .map(it => {
          const esSinStock = Boolean(it.sin_stock);
          const bolsas = esSinStock ? [] : (it.bolsasAsignadas || []);
          const cantTotal = esSinStock ? 0 : (it.scans != null ? Number(it.scans) : (bolsas.length > 0 ? bolsas.length : Number(it.cantidad || 0)));
          return {
            producto: String(it.nombre || it.producto).trim(),
            unidades: Math.round(cantTotal),
            ...(it.ean ? { ean: String(it.ean).trim() } : {})
          };
        });

      if (itemsAlmacen.length > 0) {
        const resAlm = await apiSalidaAlmacenPedido({ numero_pedido: numPedido, items: itemsAlmacen });
        if (resAlm && resAlm.ok === false) {
          alert(resAlm?.error || 'Error al fijar la salida de almacén en el servidor.');
          setGuardando(false);
          return;
        }
      }

      // 2. Congelar detalle en el Sheet
      await apiSetDetallePedido({ numero_pedido: numPedido, detalle_json: detalle });

      // 3. Guardar preparación completada y pesadas
      const prepFinal = {
        ...prep,
        completado: true,
        fechaFin: new Date().toISOString(),
        detalle_json: detalle
      };
      await apiGuardarPreparacion({ numero_pedido: numPedido, preparacion: prepFinal });

      const itemsPesadas = prep.items.map(it => ({
        producto: it.nombre,
        cantidad_real: it.sin_stock ? 0 : (it.cantidad_real || (it.bolsasAsignadas?.length || 1)),
        sin_stock: Boolean(it.sin_stock)
      }));
      await apiRegistrarPesadas({ numero_pedido: numPedido, items: itemsPesadas });

      // 4. Actualizar estado local y en Sheet a 'Preparado'
      if (pedido.sheetRowIndex && actualizarEstadoEnSheet) {
        actualizarEstadoEnSheet(pedido.sheetRowIndex, 'Preparado');
      }
      pedido.estado = 'Preparado';
      pedido.detalle_json = detalle;

      if (itemsAlmacen.length > 0 && typeof fetchControlStock === 'function') {
        fetchControlStock().catch(() => {});
      }

      if (onPedidoArmado) {
        onPedidoArmado(pedido, numPedido, prepFinal);
      }
      onClose();
    } catch (err) {
      alert(`Error al guardar pedido armado: ${err.message}`);
    } finally {
      setGuardando(false);
    }
  };

  const handleReiniciarPreparacion = () => {
    try {
      const local = JSON.parse(localStorage.getItem(PREPARACIONES_KEY) || '{}');
      delete local[numPedido];
      localStorage.setItem(PREPARACIONES_KEY, JSON.stringify(local));
    } catch (_) {
      // ignore
    }

    const parsed = parsearProductosPedido(pedido.producto, pedido.cantidades);
    const nuevosItems = parsed.map(it => ({
      ...it,
      tipoCaptura: determinarTipoCaptura(it, stockData),
      cantidadEditada: it.cantidad,
      cantidadConfirmada: null,
      pesoCongelado: null,
      confirmado: false,
      scans: 0,
      bolsasAsignadas: []
    }));

    setPrep({ items: nuevosItems, completado: false, fechaInicio: new Date().toISOString() });
    setModalReiniciar(false);
    if (pedido.sheetRowIndex && actualizarEstadoEnSheet) {
      actualizarEstadoEnSheet(pedido.sheetRowIndex, 'Pendiente');
    }
    pedido.estado = 'Pendiente';
  };

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
            <h2 className="text-white font-black text-base tracking-tight">
              📦 Armando pedido de <span className="text-green-400">{pedido.nombre || 'Cliente'}</span>
            </h2>
            <p className="text-gray-500 text-xs font-mono mt-0.5">
              {numPedido} · {pedido.localidad || 'Sin localidad'} · {pedido.dia_entrega || pedido.horario_entrega || 'Sin entrega asignada'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Progreso */}
          <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3 py-1.5">
            <div className="flex gap-1">
              {itemsActivos.map((item, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    item.confirmado || (item.scans || 0) >= item.cantidad || (item.bolsasAsignadas?.length || 0) >= item.cantidad
                      ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]'
                      : 'bg-gray-700'
                  }`}
                />
              ))}
            </div>
            <span className="text-gray-400 text-xs font-mono">
              {itemsActivos.filter(it => it.confirmado || (it.scans || 0) >= it.cantidad || (it.bolsasAsignadas?.length || 0) >= it.cantidad).length}/{itemsActivos.length}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setModalReiniciar(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-bold transition-all cursor-pointer"
            title="Reiniciar preparación"
          >
            <RotateCcw size={14} />
            <span className="hidden sm:inline">Reiniciar</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all cursor-pointer"
            title="Cerrar sin guardar"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* ── BARRA DE SCANNER / BALANZA ── */}
      <div className="px-6 py-3 bg-[#0d1117] border-b border-white/5 shrink-0">
        {avisoReserva && (
          <div className="flex items-center gap-2 max-w-2xl mx-auto mb-2 px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-bold">
            <AlertTriangle size={14} className="shrink-0" />
            <span>{avisoReserva.mensaje}</span>
          </div>
        )}

        <div className="relative max-w-2xl mx-auto flex items-center gap-3">
          <div className="relative flex-1">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <ScanBarcode size={18} className="text-green-400" />
              {!todosCompletos && (
                <div className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_2px_rgba(74,222,128,0.6)] animate-pulse" />
              )}
            </div>
            <input
              ref={scanInputRef}
              type="text"
              value={scanBuffer}
              onChange={(e) => setScanBuffer(e.target.value)}
              onKeyDown={handleScanKeyDown}
              placeholder={todosCompletos ? '✅ Pedido completo — revisá y finalizá' : 'Escaneá el código de barras (EAN)...'}
              className="w-full bg-black/60 border border-green-500/30 focus:border-green-500/60 text-white text-sm font-mono rounded-2xl pl-14 pr-4 py-3 outline-none transition-all placeholder:text-gray-600 focus:bg-black/80"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {/* Status Balanza Systel */}
          <div className="flex items-center gap-2 bg-[#1f2937]/70 border border-gray-700 rounded-xl px-3 py-2 text-xs font-mono">
            <span className={`w-2.5 h-2.5 rounded-full ${balanza.conectado ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]' : 'bg-gray-600'}`} />
            <span className="text-gray-300 font-bold hidden sm:inline">Systel:</span>
            <span className="text-white font-black">
              {balanza.conectado ? (balanza.pesoVivo !== null ? `${balanza.pesoVivo.toFixed(3)} kg` : '0.000 kg') : 'Desconectada'}
            </span>
            {!balanza.conectado && balanza.disponible && (
              <button
                type="button"
                onClick={balanza.conectar}
                className="ml-1 px-2 py-0.5 rounded bg-green-600 hover:bg-green-500 text-white text-[10px] font-bold cursor-pointer"
              >
                Conectar
              </button>
            )}
          </div>
        </div>

        {scanError && (
          <div className="flex items-center gap-2 max-w-2xl mx-auto mt-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-bold">
            <AlertCircle size={14} className="shrink-0" />
            <span>{scanError}</span>
          </div>
        )}
        {scanSuccess && !scanError && (
          <div className="flex items-center gap-2 max-w-2xl mx-auto mt-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-xs font-bold animate-in slide-in-from-top-1">
            <Check size={14} className="shrink-0" />
            <span>{scanSuccess}</span>
          </div>
        )}
      </div>

      {/* ── LISTA DE ITEMS ── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3 min-h-0 max-w-4xl mx-auto w-full">
        {items.map((item, idx) => {
          const esSinStock = Boolean(item.sin_stock);
          const bolsas = item.bolsasAsignadas || [];
          const tipoCaptura = item.tipoCaptura || determinarTipoCaptura(item, stockDataRef.current);
          const scans = item.scans || bolsas.length;

          const completo = !esSinStock && (
            tipoCaptura === TIPOS_CAPTURA.PESABLE
              ? Boolean(item.confirmado && item.pesoCongelado != null) || bolsas.length >= item.cantidad
              : tipoCaptura === TIPOS_CAPTURA.UNIDAD_MANUAL
              ? Boolean(item.confirmado && item.cantidadConfirmada != null) || bolsas.length >= item.cantidad
              : scans >= item.cantidad
          );

          const pesoReal = item.pesoCongelado != null ? Number(item.pesoCongelado) : bolsas.reduce((s, b) => s + (Number(b.peso) || 0), 0);

          return (
            <div
              key={idx}
              className={`rounded-2xl border p-4 transition-all duration-200 ${
                esSinStock
                  ? 'bg-red-950/20 border-red-900/30 opacity-75'
                  : completo
                  ? 'bg-green-500/10 border-green-500/40 shadow-[0_0_20px_rgba(34,197,94,0.08)]'
                  : 'bg-[#141b26] border-white/10'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${
                    esSinStock ? 'bg-red-500/20 text-red-400' : completo ? 'bg-green-500 text-white' : 'bg-gray-800 text-gray-400'
                  }`}>
                    {esSinStock ? <X size={16} /> : completo ? <Check size={16} /> : idx + 1}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`text-sm font-bold uppercase tracking-wide ${esSinStock ? 'text-red-400 line-through' : completo ? 'text-green-300' : 'text-white'}`}>
                        {item.nombre}
                      </p>
                      {tipoCaptura === TIPOS_CAPTURA.PESABLE && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          ⚖️ Pesable
                        </span>
                      )}
                      {tipoCaptura === TIPOS_CAPTURA.UNIDAD_MANUAL && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          🥬 {etiquetaUnidad(item.unidad, item.cantidad)}
                        </span>
                      )}
                      {tipoCaptura === TIPOS_CAPTURA.ALMACEN_EAN && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          🏷️ Almacén EAN
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-gray-400 font-mono mt-1">
                      Pedido: <span className="text-gray-200 font-bold">{item.cantidad} {tipoCaptura === TIPOS_CAPTURA.PESABLE ? 'kg' : etiquetaUnidad(item.unidad, item.cantidad)}</span>
                      {completo && !esSinStock && (
                        <span className="ml-2 text-green-400 font-bold">
                          · Real: {tipoCaptura === TIPOS_CAPTURA.PESABLE ? `${pesoReal.toFixed(3)} kg` : `${item.cantidadConfirmada || scans} un`}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Acciones de captura por tipo */}
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {!esSinStock && tipoCaptura === TIPOS_CAPTURA.PESABLE && (
                    <>
                      {!completo ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.005"
                            placeholder="kg manual"
                            value={pesoManual[idx] || ''}
                            onChange={(e) => setPesoManual(prev => ({ ...prev, [idx]: e.target.value }))}
                            className="w-24 bg-black/50 border border-gray-700 rounded-xl px-2.5 py-1.5 text-xs text-white font-mono text-center outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => confirmarPesoPesable(idx)}
                            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all shadow cursor-pointer"
                          >
                            Capturar peso
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => reabrirItemPesable(idx)}
                          className="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold transition-all border border-gray-700 cursor-pointer"
                        >
                          Repesar
                        </button>
                      )}
                    </>
                  )}

                  {!esSinStock && tipoCaptura === TIPOS_CAPTURA.UNIDAD_MANUAL && (
                    <>
                      {!completo ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => ajustarCantidadManual(idx, -1)}
                            className="w-8 h-8 rounded-lg bg-gray-800 text-white font-black text-sm flex items-center justify-center hover:bg-gray-700 cursor-pointer"
                          >
                            -
                          </button>
                          <span className="w-10 text-center font-mono font-black text-white text-sm">
                            {item.cantidadEditada != null ? item.cantidadEditada : item.cantidad}
                          </span>
                          <button
                            type="button"
                            onClick={() => ajustarCantidadManual(idx, 1)}
                            className="w-8 h-8 rounded-lg bg-gray-800 text-white font-black text-sm flex items-center justify-center hover:bg-gray-700 cursor-pointer"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            onClick={() => confirmarCantidadManual(idx)}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all cursor-pointer ml-1"
                          >
                            Confirmar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => reabrirItemManual(idx)}
                          className="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold transition-all border border-gray-700 cursor-pointer"
                        >
                          Modificar
                        </button>
                      )}
                    </>
                  )}

                  {!esSinStock && tipoCaptura === TIPOS_CAPTURA.ALMACEN_EAN && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-300 bg-black/40 px-3 py-1.5 rounded-xl border border-white/5">
                        {scans}/{item.cantidad} escaneados
                      </span>
                      {scans > 0 && (
                        <button
                          type="button"
                          onClick={() => desarmarScanEan(idx)}
                          className="px-2 py-1 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 text-xs font-bold transition-all cursor-pointer"
                          title="Restar un escaneo"
                        >
                          -1
                        </button>
                      )}
                    </div>
                  )}

                  {/* Botón Sin Stock */}
                  <button
                    type="button"
                    onClick={() => toggleSinStock(idx)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                      esSinStock
                        ? 'bg-emerald-600/20 border-emerald-500/30 text-emerald-300 hover:bg-emerald-600/30'
                        : 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'
                    }`}
                  >
                    {esSinStock ? 'Restaurar' : 'Sin stock'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── FOOTER CON BOTÓN FINALIZAR ── */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-[#111827]/80 shrink-0">
        <div>
          <p className="text-xs text-gray-400">
            {todosCompletos ? '✅ Todos los items completos y validados' : '⚠️ Faltan productos por pesar o escanear'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold transition-all cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleFinalizarArmado}
            disabled={guardando || (!todosCompletos && !todosChequeados)}
            className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-sm uppercase tracking-wider transition-all shadow-lg shadow-emerald-950/50 cursor-pointer"
          >
            <CheckCircle size={18} />
            <span>{guardando ? 'Guardando...' : 'Finalizar Pedido Armado'}</span>
          </button>
        </div>
      </div>

      {/* Modal confirmar reiniciar */}
      {modalReiniciar && (
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141b26] border border-rose-500/30 rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-white font-black text-lg">¿Reiniciar preparación?</h3>
            <p className="text-gray-300 text-sm">
              Se restablecerán las pesadas y escaneos de este pedido, volviendo a su estado original Pendiente.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModalReiniciar(false)}
                className="px-4 py-2 rounded-xl bg-gray-800 text-gray-300 text-xs font-bold cursor-pointer"
              >
                No, cancelar
              </button>
              <button
                type="button"
                onClick={handleReiniciarPreparacion}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black cursor-pointer"
              >
                Sí, reiniciar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
