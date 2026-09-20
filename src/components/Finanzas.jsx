// ============================================================================
// Huerta Urbana Dashboard - Sección Finanzas
// Cálculo de rentabilidad, comisiones, costos de mercadería vigentes y diezmo
// ============================================================================

import { useState, useMemo, useEffect, useRef } from 'react';
import { 
  DollarSign, TrendingUp, Wallet, Sparkles, Receipt, Package, 
  CreditCard, Landmark, Sliders, Calendar, ArrowUpRight, 
  HelpCircle, ChevronDown, ChevronUp, Search, RefreshCw, CheckCircle, Info
} from 'lucide-react';
import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { HOY, PRODUCTOS_COSTOS } from '../data/mockData';
import { parsearProductosPedido } from '../utils/remitoPrinter';
import { COMBOS_INICIALES } from './PanelCostos';

const $$ = (n) => `$${Number(Math.round(n || 0)).toLocaleString('es-AR')}`;
const norm = (s) => (s || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const STORAGE_CONFIG_KEY = 'huerta_finanzas_config_v2';
const STORAGE_COSTOS_KEY = 'huerta_data_costos_v1_productos';
const STORAGE_COMBOS_KEY = 'huerta_data_costos_v31_combos';

const CONFIG_DEFAULT = {
  comisionMP: 8,          // 8%
  costoPackaging: 150,    // $150 por kilo de producto (configurable)
  monotributoMensual: 60000, // $60.000 mensual
  diasMesProrrateo: 30,   // Base 30 días
};

export default function Finanzas() {
  const { pedidos: PEDIDOS = [], productosCostos: contextCostos = [], cargando } = useGoogleSheets();

  // ── 1. Configuración editable con persistencia ───────────────────────────────
  const [config, setConfig] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_CONFIG_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...CONFIG_DEFAULT,
          ...parsed,
          costoPackaging: parsed.costoPackaging !== undefined ? Number(parsed.costoPackaging) : CONFIG_DEFAULT.costoPackaging,
          monotributoMensual: parsed.monotributoMensual !== undefined ? Number(parsed.monotributoMensual) : CONFIG_DEFAULT.monotributoMensual,
          comisionMP: parsed.comisionMP !== undefined ? Number(parsed.comisionMP) : CONFIG_DEFAULT.comisionMP,
        };
      }
      return CONFIG_DEFAULT;
    } catch (e) {
      return CONFIG_DEFAULT;
    }
  });
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [tempConfig, setTempConfig] = useState(config);
  const [configGuardadaMsg, setConfigGuardadaMsg] = useState(false);

  // Auto-persistencia en localStorage ante cualquier cambio de config
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(config));
    } catch (e) {
      console.error('Error guardando config de Finanzas:', e);
    }
  }, [config]);

  // ── 2. Selector de Período ──────────────────────────────────────────────────
  const [periodo, setPeriodo] = useState('mes'); // 'hoy' | 'semana' | 'mes'
  const [busqueda, setBusqueda] = useState('');
  const [pedidoExpandido, setPedidoExpandido] = useState(null);

  // ── 3. Catálogo de Costos vigentes (siempre el último cargado) ──────────────
  const catalogoCostos = useMemo(() => {
    let prods = [];
    if (contextCostos && contextCostos.length > 0) {
      prods = contextCostos;
    } else {
      try {
        const local = localStorage.getItem(STORAGE_COSTOS_KEY) || localStorage.getItem('huerta_data_costos_v31_productos');
        prods = local ? JSON.parse(local) : PRODUCTOS_COSTOS;
      } catch (e) {
        prods = PRODUCTOS_COSTOS;
      }
    }

    // Mapa normalizado: nombre -> costo por kilo/unidad
    const mapa = {};
    (prods || []).forEach(p => {
      const n = norm(p.nombre);
      const precioCajon = Number(p.precioCajon ?? p.costo ?? 0);
      const cantidadCajon = Number(p.cantidadCajon ?? 1);
      const costoKilo = cantidadCajon > 0 ? (precioCajon / cantidadCajon) : (Number(p.costo) || 0);
      mapa[n] = {
        nombreOriginal: p.nombre,
        costoKilo,
        precioCajon,
        cantidadCajon,
        unidad: p.unidad || 'kg'
      };
    });

    return mapa;
  }, [contextCostos]);

  // ── 4. Combos vigentes con sus recetas ─────────────────────────────────────
  const catalogoCombos = useMemo(() => {
    try {
      const saved = localStorage.getItem(STORAGE_COMBOS_KEY);
      return saved ? JSON.parse(saved) : COMBOS_INICIALES;
    } catch (e) {
      return COMBOS_INICIALES;
    }
  }, []);

  // ── 5. Resolver costo unitario de un producto con matching fuzzy ────────────
  const resolverCostoProducto = (nombreItem) => {
    if (!nombreItem) return 0;
    const n = norm(nombreItem);

    // Búsqueda directa
    if (catalogoCostos[n]) return catalogoCostos[n].costoKilo;

    // Búsqueda parcial (contiene o contenido)
    const claves = Object.keys(catalogoCostos);
    const coincidencia = claves.find(k => k === n || k.includes(n) || n.includes(k));
    if (coincidencia) return catalogoCostos[coincidencia].costoKilo;

    // Casos especiales de verdulería
    if (n.includes('papa')) return catalogoCostos['papa']?.costoKilo || 600;
    if (n.includes('cebolla')) return catalogoCostos['cebolla']?.costoKilo || 700;
    if (n.includes('zanahoria')) return catalogoCostos['zanahoria']?.costoKilo || 650;
    if (n.includes('tomate')) return catalogoCostos['tomate']?.costoKilo || 1200;
    if (n.includes('banana')) return catalogoCostos['banana']?.costoKilo || 1100;
    if (n.includes('huevo')) return catalogoCostos['huevos nº1']?.costoKilo || catalogoCostos['huevos']?.costoKilo || 350;
    if (n.includes('lechuga')) return catalogoCostos['lechuga']?.costoKilo || 800;
    if (n.includes('rucula')) return catalogoCostos['rucula']?.costoKilo || 400;
    if (n.includes('naranja')) return catalogoCostos['naranja']?.costoKilo || 750;
    if (n.includes('limon')) return catalogoCostos['limon']?.costoKilo || 900;
    if (n.includes('palta')) return catalogoCostos['palta']?.costoKilo || 1800;
    if (n.includes('zapallo')) return catalogoCostos['zapallo blanco']?.costoKilo || catalogoCostos['cabutia']?.costoKilo || 800;

    return 0;
  };

  // ── 6. Calcular costo y kilos de un pedido individual ──────────────────────
  const analizarPedido = (pedido) => {
    const texto = pedido.producto || '';
    const nTexto = norm(texto);
    const cantPedido = Number(pedido.cantidades || 1);

    // Caso A: Coincidencia directa con un Combo conocido
    const comboMatch = catalogoCombos.find(c => {
      const nCombo = norm(c.nombre);
      return nTexto.includes(nCombo) || nCombo.includes(nTexto);
    });

    if (comboMatch && comboMatch.productos) {
      let costoCombo = 0;
      let kilosCombo = 0;
      comboMatch.productos.forEach(it => {
        const cKilo = resolverCostoProducto(it.nombre);
        const cantItem = Number(it.cantidad) || 1;
        costoCombo += cKilo * cantItem;
        kilosCombo += cantItem;
      });
      return {
        costoMercaderia: Math.round(costoCombo * cantPedido),
        totalKilos: Math.round(kilosCombo * cantPedido * 10) / 10
      };
    }

    // Caso B: Parsear lista de productos sueltos o combos personalizados
    const items = parsearProductosPedido(texto, cantPedido);
    if (items.length > 0) {
      let costoTotalItems = 0;
      let kilosTotalItems = 0;

      items.forEach(it => {
        // Verificar si el item es un sub-combo
        const subCombo = catalogoCombos.find(c => norm(it.nombre).includes(norm(c.nombre)));
        if (subCombo && subCombo.productos) {
          subCombo.productos.forEach(pIng => {
            const cK = resolverCostoProducto(pIng.nombre);
            const cantIng = Number(pIng.cantidad) || 1;
            costoTotalItems += cK * cantIng * (it.cantidad || 1);
            kilosTotalItems += cantIng * (it.cantidad || 1);
          });
          return;
        }

        const cKilo = resolverCostoProducto(it.nombre);
        const peso = it.pesoSolicitado !== null && it.pesoSolicitado > 0 ? it.pesoSolicitado : (it.cantidad || 1);
        costoTotalItems += cKilo * peso;
        kilosTotalItems += peso;
      });

      if (costoTotalItems > 0 || kilosTotalItems > 0) {
        return {
          costoMercaderia: Math.round(costoTotalItems),
          totalKilos: Math.round(kilosTotalItems * 10) / 10
        };
      }
    }

    // Caso C: Fallback para productos sin desglose
    const kilosEstimados = Math.max(1, cantPedido * 5);
    return {
      costoMercaderia: Math.round((pedido.total || 0) * 0.40),
      totalKilos: kilosEstimados
    };
  };

  // ── 7. Filtrado de ventas aprobadas por período ─────────────────────────────
  const ventasAprobadas = useMemo(() => {
    return (PEDIDOS || []).filter(p => {
      const st = (p.estado_pago || '').toLowerCase().trim();
      return st === 'approved' || st === 'pagado';
    });
  }, [PEDIDOS]);

  const pedidosPeriodo = useMemo(() => {
    const ahora = new Date();
    const hoyStr = HOY || ahora.toISOString().split('T')[0];

    // Rango de la semana actual (Lunes a Domingo)
    const diaSem = ahora.getDay(); // 0 = Domingo, 1 = Lunes
    const diasAlLunes = (diaSem + 6) % 7;
    const lunes = new Date(ahora);
    lunes.setDate(ahora.getDate() - diasAlLunes);
    lunes.setHours(0, 0, 0, 0);

    const domingo = new Date(lunes);
    domingo.setDate(lunes.getDate() + 6);
    domingo.setHours(23, 59, 59, 999);

    const mesActual = ahora.getMonth();
    const anioActual = ahora.getFullYear();

    return ventasAprobadas.filter(p => {
      const fechaStr = p.fecha || '';
      
      if (periodo === 'hoy') {
        return fechaStr === hoyStr;
      }

      // Parsear fecha para semana y mes
      let pDate = null;
      if (fechaStr.includes('/')) {
        const parts = fechaStr.split('/');
        if (parts.length === 3) pDate = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
      } else {
        pDate = new Date(fechaStr);
      }

      if (!pDate || isNaN(pDate.getTime())) return false;

      if (periodo === 'semana') {
        return pDate >= lunes && pDate <= domingo;
      }

      if (periodo === 'mes') {
        return pDate.getMonth() === mesActual && pDate.getFullYear() === anioActual;
      }

      return true;
    });
  }, [ventasAprobadas, periodo]);

  // ── 8. Desglose detallado por cada venta ────────────────────────────────────
  const ventasDetalladas = useMemo(() => {
    return pedidosPeriodo.map(p => {
      const precioVenta = Number(p.total || 0);
      const { costoMercaderia, totalKilos } = analizarPedido(p);
      const comisionMP = Math.round(precioVenta * (config.comisionMP / 100));
      // Packaging ES POR KILO: se multiplica por la cantidad de kilos del pedido
      const packaging = Math.round(totalKilos * (Number(config.costoPackaging) || 0));
      const gananciaBruta = precioVenta - costoMercaderia - comisionMP - packaging;
      const margenPct = precioVenta > 0 ? ((gananciaBruta / precioVenta) * 100).toFixed(1) : 0;

      return {
        ...p,
        precioVenta,
        costoMercaderia,
        totalKilos,
        comisionMP,
        packaging,
        gananciaBruta,
        margenPct
      };
    });
  }, [pedidosPeriodo, config, catalogoCostos, catalogoCombos]);

  // ── 9. Totales y Prorrateo del Período ──────────────────────────────────────
  const stats = useMemo(() => {
    const cantPedidos = ventasDetalladas.length;
    const facturacionBruta = ventasDetalladas.reduce((s, v) => s + v.precioVenta, 0);
    const costoMercaderiaTotal = ventasDetalladas.reduce((s, v) => s + v.costoMercaderia, 0);
    const totalKilos = ventasDetalladas.reduce((s, v) => s + v.totalKilos, 0);
    const comisionMPTotal = ventasDetalladas.reduce((s, v) => s + v.comisionMP, 0);
    const packagingTotal = ventasDetalladas.reduce((s, v) => s + v.packaging, 0);
    const gananciaBrutaTotal = facturacionBruta - costoMercaderiaTotal - comisionMPTotal - packagingTotal;

    // Prorrateo de Monotributo según el período
    let factorDias = 1;
    if (periodo === 'hoy') factorDias = 1;
    else if (periodo === 'semana') factorDias = 7;
    else if (periodo === 'mes') factorDias = config.diasMesProrrateo || 30;

    const monotributoProrrateado = Math.round((config.monotributoMensual / (config.diasMesProrrateo || 30)) * factorDias);

    // Resultado final neto
    const gananciaNeta = gananciaBrutaTotal - (cantPedidos > 0 ? monotributoProrrateado : 0);
    
    // 90% "Tu ganancia" y 10% "Diezmo"
    const baseReparto = Math.max(0, gananciaNeta);
    const tuGanancia = Math.round(baseReparto * 0.90);
    const diezmo = Math.round(baseReparto * 0.10);

    const margenNetoPct = facturacionBruta > 0 ? ((gananciaNeta / facturacionBruta) * 100).toFixed(1) : 0;

    return {
      cantPedidos,
      facturacionBruta,
      costoMercaderiaTotal,
      totalKilos,
      comisionMPTotal,
      packagingTotal,
      gananciaBrutaTotal,
      monotributoProrrateado,
      gananciaNeta,
      tuGanancia,
      diezmo,
      margenNetoPct,
      factorDias
    };
  }, [ventasDetalladas, config, periodo]);

  // ── 10. Conteo de pedidos para badges de los tabs ───────────────────────────
  const conteoTabs = useMemo(() => {
    const ahora = new Date();
    const hoyStr = HOY || ahora.toISOString().split('T')[0];

    const diaSem = ahora.getDay();
    const diasAlLunes = (diaSem + 6) % 7;
    const lunes = new Date(ahora);
    lunes.setDate(ahora.getDate() - diasAlLunes);
    lunes.setHours(0, 0, 0, 0);
    const domingo = new Date(lunes);
    domingo.setDate(lunes.getDate() + 6);
    domingo.setHours(23, 59, 59, 999);

    const mesActual = ahora.getMonth();
    const anioActual = ahora.getFullYear();

    let h = 0, s = 0, m = 0;
    ventasAprobadas.forEach(p => {
      const f = p.fecha || '';
      if (f === hoyStr) h++;
      
      let pDate = null;
      if (f.includes('/')) {
        const parts = f.split('/');
        if (parts.length === 3) pDate = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
      } else {
        pDate = new Date(f);
      }
      if (pDate && !isNaN(pDate.getTime())) {
        if (pDate >= lunes && pDate <= domingo) s++;
        if (pDate.getMonth() === mesActual && pDate.getFullYear() === anioActual) m++;
      }
    });

    return { hoy: h, semana: s, mes: m };
  }, [ventasAprobadas]);

  // ── 11. Manejo y Guardado en Vivo de Configuración ─────────────────────────
  const handleConfigFieldChange = (field, val) => {
    const num = val === '' ? '' : Number(val);
    setTempConfig(prev => ({ ...prev, [field]: num }));
    
    // Si es un valor numérico válido, persistir y actualizar cálculos en tiempo real
    if (val !== '' && !isNaN(num) && num >= 0) {
      setConfig(prev => {
        const next = { ...prev, [field]: num };
        try {
          localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(next));
        } catch (e) {}
        return next;
      });
    }
  };

  const guardarConfiguracion = (e) => {
    if (e) e.preventDefault();
    const finalConfig = {
      ...tempConfig,
      costoPackaging: tempConfig.costoPackaging !== '' && !isNaN(Number(tempConfig.costoPackaging)) 
        ? Number(tempConfig.costoPackaging) 
        : config.costoPackaging,
      monotributoMensual: tempConfig.monotributoMensual !== '' && !isNaN(Number(tempConfig.monotributoMensual)) 
        ? Number(tempConfig.monotributoMensual) 
        : config.monotributoMensual,
      comisionMP: tempConfig.comisionMP !== '' && !isNaN(Number(tempConfig.comisionMP)) 
        ? Number(tempConfig.comisionMP) 
        : config.comisionMP,
    };

    setConfig(finalConfig);
    setTempConfig(finalConfig);
    try {
      localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(finalConfig));
    } catch (err) {}
    setConfigGuardadaMsg(true);
    setTimeout(() => {
      setConfigGuardadaMsg(false);
      setShowConfigModal(false);
    }, 600);
  };

  // ── 12. Filtrado para la tabla de pedidos ──────────────────────────────────
  const ventasFiltradas = useMemo(() => {
    if (!busqueda) return ventasDetalladas;
    const q = norm(busqueda);
    return ventasDetalladas.filter(v => 
      norm(v.nombre).includes(q) || 
      norm(v.numero_pedido).includes(q) || 
      norm(v.producto).includes(q)
    );
  }, [ventasDetalladas, busqueda]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      
      {/* ── HEADER DE SECCIÓN ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
              <Landmark size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                Finanzas y Rentabilidad
                <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Panel en vivo
                </span>
              </h1>
              <p className="text-gray-400 text-xs mt-0.5">
                Cálculo con costos vigentes del Panel de Costos, deducciones reales y desglose del Diezmo.
              </p>
            </div>
          </div>
        </div>

        {/* Botones de acción rápida */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setTempConfig(config); setShowConfigModal(true); }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-gray-300 hover:text-white text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
            title="Ajustar Monotributo, costo de packaging y comisión MP"
          >
            <Sliders size={14} className="text-emerald-400" />
            <span>Ajustes Financieros</span>
          </button>
        </div>
      </div>

      {/* ── SELECTOR DE PERÍODO (TABS) ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#111827]/70 border border-white/5 p-2 rounded-2xl backdrop-blur">
        <div className="flex items-center gap-1.5 p-1 bg-black/40 border border-white/5 rounded-xl w-full sm:w-auto">
          {[
            { id: 'hoy', label: 'Hoy', count: conteoTabs.hoy },
            { id: 'semana', label: 'Esta Semana', count: conteoTabs.semana },
            { id: 'mes', label: 'Este Mes', count: conteoTabs.mes }
          ].map(tab => {
            const activo = periodo === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setPeriodo(tab.id)}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activo 
                    ? 'bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-lg shadow-emerald-950/50' 
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-md ${activo ? 'bg-black/30 text-white' : 'bg-white/5 text-gray-400'}`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="text-xs text-gray-400 flex items-center gap-2 px-2">
          <Calendar size={13} className="text-emerald-400" />
          <span>
            {periodo === 'hoy' && `Ventas registradas de hoy (${HOY || 'Fecha actual'})`}
            {periodo === 'semana' && 'Semana corriente (Monotributo prorrateado a 7 días)'}
            {periodo === 'mes' && 'Mes en curso (Monotributo mensual completo deducido)'}
          </span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          HERO CARDS: TU GANANCIA (90%) Y DIEZMO (10%)
          ══════════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* TARJETA 1: "TU GANANCIA" (90%) - GRANDE, DESTACADA, VERDE */}
        <div className="lg:col-span-7 relative overflow-hidden rounded-3xl border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-950/40 via-[#0c1612] to-[#111827] p-6 sm:p-8 shadow-[0_0_50px_rgba(16,185,129,0.15)] flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-black tracking-wider uppercase">
                <Sparkles size={13} className="text-emerald-400" />
                <span>90% DEL RESULTADO</span>
              </div>
              <span className="text-[11px] font-mono text-emerald-400/80 bg-black/40 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                Margen neto: {stats.margenNetoPct}%
              </span>
            </div>

            <h2 className="text-gray-300 text-sm font-semibold tracking-wide uppercase">Tu Ganancia Neta</h2>
            
            <div className="mt-2 flex items-baseline gap-3 flex-wrap">
              <span className="text-4xl sm:text-6xl font-black text-emerald-400 tracking-tight drop-shadow-md">
                {$$(stats.tuGanancia)}
              </span>
              <span className="text-emerald-300/80 text-xs font-medium">
                libre de costos y deducciones
              </span>
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-emerald-500/20 flex items-center justify-between text-xs text-gray-400">
            <span className="flex items-center gap-1.5 text-gray-300">
              <CheckCircle size={14} className="text-emerald-400" /> 
              {stats.cantPedidos} pedidos aprobados en el período
            </span>
            <span className="font-mono text-emerald-400 font-bold">
              Base neta: {$$(stats.gananciaNeta)}
            </span>
          </div>
        </div>

        {/* TARJETA 2: "DIEZMO" (10%) Y RESUMEN NETO */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          
          {/* Diezmo (10%) */}
          <div className="relative overflow-hidden rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-950/30 via-[#16120d] to-[#111827] p-6 shadow-[0_0_35px_rgba(245,158,11,0.08)] flex-1 flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10px] font-black uppercase tracking-wider">
                  <span>10% DEL RESULTADO</span>
                </div>
                <span className="text-xs text-amber-400/70 font-semibold">Apartado Consagrado</span>
              </div>

              <h3 className="text-gray-300 text-xs font-semibold uppercase tracking-wider">Diezmo</h3>

              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-black text-amber-400 tracking-tight">
                  {$$(stats.diezmo)}
                </span>
                <span className="text-amber-300/70 text-xs">para ofrenda / diezmo</span>
              </div>
            </div>

            <p className="mt-4 pt-3 border-t border-amber-500/15 text-[11px] text-gray-400 leading-relaxed">
              Calculado automáticamente como el 10% de la ganancia neta del negocio para el período seleccionado.
            </p>
          </div>

          {/* Ganancia Neta Total (100%) */}
          <div className="rounded-2xl border border-white/10 bg-[#111827]/80 p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Ganancia Neta Total (100%)</p>
              <p className="text-xl font-bold text-white mt-0.5">{$$(stats.gananciaNeta)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Monotributo deducido</p>
              <p className="text-sm font-mono text-red-400 font-bold mt-0.5">- {$$(stats.monotributoProrrateado)}</p>
            </div>
          </div>
        </div>

      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          DESGLOSE COMPLETO: TARJETAS DE COSTOS Y DEDUCCIONES
          ══════════════════════════════════════════════════════════════════════════ */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
            <Receipt size={14} className="text-emerald-400" />
            <span>Desglose Completo del Período</span>
          </h3>
          <span className="text-[11px] text-gray-500">Valores consolidados según fórmula oficial</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          
          {/* Facturación Bruta */}
          <div className="rounded-2xl bg-[#111827] border border-white/5 p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-gray-400 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider">Facturación</span>
              <DollarSign size={14} className="text-green-400" />
            </div>
            <div>
              <p className="text-xl font-black text-white">{$$(stats.facturacionBruta)}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{stats.cantPedidos} pedidos</p>
            </div>
          </div>

          {/* Costo Mercadería (Vigente de Panel de Costos) */}
          <div className="rounded-2xl bg-[#111827] border border-white/5 p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-gray-400 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider">Costo Mercadería</span>
              <Package size={14} className="text-amber-400" />
            </div>
            <div>
              <p className="text-xl font-black text-red-400">- {$$(stats.costoMercaderiaTotal)}</p>
              <p className="text-[10px] text-gray-500 mt-0.5" title="Siempre recalculado con el último costo vigente del Panel de Costos">
                Panel de Costos
              </p>
            </div>
          </div>

          {/* Comisión Mercado Pago (8%) */}
          <div className="rounded-2xl bg-[#111827] border border-white/5 p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-gray-400 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider">Comisión MP</span>
              <CreditCard size={14} className="text-indigo-400" />
            </div>
            <div>
              <p className="text-xl font-black text-red-400">- {$$(stats.comisionMPTotal)}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{config.comisionMP}% sobre ventas</p>
            </div>
          </div>

          {/* Packaging (por kilo) */}
          <div className="rounded-2xl bg-[#111827] border border-white/5 p-4 flex flex-col justify-between group hover:border-orange-500/30 transition-all">
            <div className="flex items-center justify-between text-gray-400 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider">Packaging</span>
              <button
                onClick={() => { setTempConfig(config); setShowConfigModal(true); }}
                className="p-1 -mr-1 rounded-lg text-gray-500 hover:text-orange-400 hover:bg-white/5 transition-colors cursor-pointer"
                title="Editar costo de packaging"
              >
                <Sliders size={13} />
              </button>
            </div>
            <div>
              <p className="text-xl font-black text-red-400">- {$$(stats.packagingTotal)}</p>
              <p className="text-[10px] text-gray-500 mt-0.5" title="Total de kilos vendidos multiplicado por el costo de packaging por kilo">
                {stats.totalKilos.toFixed(1)} kg (${config.costoPackaging}/kg)
              </p>
            </div>
          </div>

          {/* Monotributo Prorrateado */}
          <div className="rounded-2xl bg-[#111827] border border-white/5 p-4 flex flex-col justify-between group hover:border-purple-500/30 transition-all">
            <div className="flex items-center justify-between text-gray-400 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider">Monotributo</span>
              <button
                onClick={() => { setTempConfig(config); setShowConfigModal(true); }}
                className="p-1 -mr-1 rounded-lg text-gray-500 hover:text-purple-400 hover:bg-white/5 transition-colors cursor-pointer"
                title="Editar monotributo mensual"
              >
                <Sliders size={13} />
              </button>
            </div>
            <div>
              <p className="text-xl font-black text-red-400">- {$$(stats.monotributoProrrateado)}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{stats.factorDias} día{stats.factorDias !== 1 ? 's' : ''} prorrateado</p>
            </div>
          </div>

          {/* Ganancia Bruta Operativa */}
          <div className="rounded-2xl bg-[#111827] border border-emerald-500/20 p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-gray-400 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider">Ganancia Bruta</span>
              <TrendingUp size={14} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-xl font-black text-emerald-400">{$$(stats.gananciaBrutaTotal)}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">Pre-Monotributo</p>
            </div>
          </div>

        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          DETALLE DE VENTAS DEL PERÍODO (TABLA TRANSPARENTE)
          ══════════════════════════════════════════════════════════════════════════ */}
      <div className="bg-[#111827] border border-white/5 rounded-3xl overflow-hidden shadow-xl">
        
        {/* Barra superior de la tabla */}
        <div className="px-6 py-4 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>Detalle de Ventas del Período</span>
              <span className="text-xs font-mono text-gray-400 bg-black/40 px-2 py-0.5 rounded-lg border border-white/5">
                {ventasFiltradas.length} pedidos
              </span>
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">Desglose exacto de cada venta con sus costos y comisiones aplicadas.</p>
          </div>

          {/* Buscador de pedidos */}
          <div className="relative max-w-xs w-full">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar cliente, pedido o producto..."
              className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-gray-500 outline-none focus:border-emerald-500/50"
            />
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-black/40 text-gray-400 font-bold uppercase text-[10px] border-b border-white/5">
              <tr>
                <th className="px-5 py-3">Pedido / Cliente</th>
                <th className="px-4 py-3">Productos / Peso</th>
                <th className="px-4 py-3 text-right">Precio Venta</th>
                <th className="px-4 py-3 text-right">Costo Mercadería</th>
                <th className="px-4 py-3 text-right">Comisión MP</th>
                <th className="px-4 py-3 text-right">Packaging (${config.costoPackaging}/kg)</th>
                <th className="px-5 py-3 text-right">Ganancia Bruta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-gray-300">
              {ventasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-gray-500 italic">
                    No se registraron ventas aprobadas para este período o búsqueda.
                  </td>
                </tr>
              ) : (
                ventasFiltradas.map((v, i) => {
                  const isOpen = pedidoExpandido === v.numero_pedido;

                  return (
                    <tr 
                      key={v.numero_pedido || i} 
                      onClick={() => setPedidoExpandido(isOpen ? null : v.numero_pedido)}
                      className="hover:bg-white/[0.02] transition-colors cursor-pointer"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div>
                            <p className="font-bold text-white">{v.nombre}</p>
                            <p className="font-mono text-[10px] text-gray-500">{v.numero_pedido} · {v.fecha}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 max-w-[240px]">
                        <p className="truncate font-medium text-gray-200" title={v.producto}>
                          {v.producto}
                        </p>
                        <p className="text-[10px] text-emerald-400 font-mono font-bold">
                          {v.totalKilos} kg · x{v.cantidades || 1} {v.cantidades === 1 ? 'unidad' : 'unidades'}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-bold text-white">
                        {$$(v.precioVenta)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-red-400">
                        - {$$(v.costoMercaderia)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-red-400">
                        - {$$(v.comisionMP)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-red-400">
                        <span>- {$$(v.packaging)}</span>
                        <p className="text-[10px] text-gray-500 font-mono">{v.totalKilos} kg x ${config.costoPackaging}</p>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="font-mono font-black text-emerald-400">
                          {$$(v.gananciaBruta)}
                        </span>
                        <p className="text-[10px] font-mono text-gray-500">
                          {v.margenPct}% margen
                        </p>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer de la tabla con totales */}
        {ventasFiltradas.length > 0 && (
          <div className="bg-black/30 px-6 py-3 border-t border-white/5 flex items-center justify-between text-xs text-gray-400">
            <span>Mostrando {ventasFiltradas.length} pedidos</span>
            <div className="flex items-center gap-4 font-mono">
              <span>Venta Total: <strong className="text-white">{$$(stats.facturacionBruta)}</strong></span>
              <span>Ganancia Bruta: <strong className="text-emerald-400">{$$(stats.gananciaBrutaTotal)}</strong></span>
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL DE CONFIGURACIÓN FINANCIERA
          ══════════════════════════════════════════════════════════════════════════ */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#111827] border border-white/10 rounded-3xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
            
            {/* Header Modal */}
            <div className="flex items-center justify-between border-b border-white/5 pb-3 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Sliders size={16} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Ajustes Financieros</h3>
                  <p className="text-[10px] text-gray-400">Se guardan y aplican automáticamente</p>
                </div>
              </div>
              <button 
                onClick={() => setShowConfigModal(false)}
                className="text-gray-500 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Formulario con scroll independiente */}
            <form onSubmit={guardarConfiguracion} className="space-y-4 text-xs overflow-y-auto pr-1 my-3 flex-1">
              
              {/* Packaging por kilo */}
              <div className="p-3 rounded-2xl bg-black/30 border border-white/5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-gray-200 font-bold">
                    Costo Packaging ($/kg)
                  </label>
                  <span className="text-[10px] font-mono text-orange-400 font-bold bg-orange-400/10 px-2 py-0.5 rounded-md">
                    ${tempConfig.costoPackaging || 0}/kg
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 leading-tight">
                  Bolsas kraft, bandejas y etiquetas por kilo. Se multiplica por los kilos de cada pedido.
                </p>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={tempConfig.costoPackaging}
                  onChange={(e) => handleConfigFieldChange('costoPackaging', e.target.value)}
                  className="w-full bg-[#161f30] border border-white/10 rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-emerald-500 transition-colors text-sm"
                  placeholder="Ej: 150"
                />
              </div>

              {/* Monotributo Mensual */}
              <div className="p-3 rounded-2xl bg-black/30 border border-white/5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-gray-200 font-bold">
                    Monotributo Mensual ($)
                  </label>
                  <span className="text-[10px] font-mono text-purple-400 font-bold bg-purple-400/10 px-2 py-0.5 rounded-md">
                    {$$(tempConfig.monotributoMensual || 0)}
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 leading-tight">
                  Cuota mensual fija. Se prorratea por día en la vista Hoy, 7 días en Semana y mes completo.
                </p>
                <input
                  type="number"
                  min="0"
                  step="500"
                  value={tempConfig.monotributoMensual}
                  onChange={(e) => handleConfigFieldChange('monotributoMensual', e.target.value)}
                  className="w-full bg-[#161f30] border border-white/10 rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-emerald-500 transition-colors text-sm"
                  placeholder="Ej: 60000"
                />
              </div>

              {/* Comisión Mercado Pago */}
              <div className="p-3 rounded-2xl bg-black/30 border border-white/5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-gray-200 font-bold">
                    Comisión Mercado Pago (%)
                  </label>
                  <span className="text-[10px] font-mono text-indigo-400 font-bold bg-indigo-400/10 px-2 py-0.5 rounded-md">
                    {tempConfig.comisionMP || 0}%
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 leading-tight">
                  Porcentaje deducido automáticamente sobre el precio total de cada venta.
                </p>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={tempConfig.comisionMP}
                  onChange={(e) => handleConfigFieldChange('comisionMP', e.target.value)}
                  className="w-full bg-[#161f30] border border-white/10 rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-emerald-500 transition-colors text-sm"
                  placeholder="Ej: 8"
                />
              </div>

              {/* Mensaje de confirmación */}
              {configGuardadaMsg && (
                <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-center font-bold animate-in fade-in">
                  ✓ Configuración guardada y activa
                </div>
              )}

              {/* Botones de acción fijos */}
              <div className="flex items-center gap-2 pt-2 border-t border-white/5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold cursor-pointer transition-all"
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold cursor-pointer transition-all shadow-lg shadow-emerald-950/40"
                >
                  Confirmar Ajustes
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
