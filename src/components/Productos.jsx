import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Package, ShoppingCart, Plus, Minus, Search, RefreshCw, 
  Settings, Check, X, AlertCircle, AlertTriangle, Scale,
  ChevronDown, ChevronUp, History, CheckCircle2, Lock,
  ArrowRight, FileText, Trash2, Sliders, ExternalLink,
  Barcode
} from 'lucide-react';
import CargaEanTab from './CargaEanTab';
import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { 
  apiGetStockKg, apiGetPreciosSugeridos, apiCrearProducto,
  apiSetMargen, apiPublicarPrecios, apiGetPreciosWeb, apiGetConfig, apiSetConfig,
  apiCrearIngreso, apiIngresoAlmacen, apiActualizarPrecioAlmacen, apiGetAlmacen, apiGetIngresos, apiGetProveedores,
  apiRegistrarSalidas, apiGetMovimientos,
  getAdminPinSession, setAdminPinSession, clearAdminPinSession
} from '../utils/mercaderiaApi';
import { BalanzaSystelSession, useBalanzaSystel } from '../utils/balanzaSystel';
import { getCategoriaPrincipal, getEanMapping } from '../data/productUtils';
import { leerCacheAlmacen } from '../utils/almacenCache';
import { determinarTipoCaptura, analizarTipoCaptura, TIPOS_CAPTURA } from '../utils/tipoCapturaProducto';
import PedidoMinimoCard from './PedidoMinimoCard';

import { norm } from '../utils/productNorm.js';
const $$ = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

export default function Productos() {
  // Contexto de Sheets (Almacén para cruce de stock)
  let sheetsCtx = null;
  try {
    sheetsCtx = useGoogleSheets();
  } catch (_) {}
  const { 
    productosCostos = [], 
    stockData = {}, 
    fetchControlStock, 
    fetchPanelCostos 
  } = sheetsCtx || {};

  // Pestañas internas
  const [subTab, setSubTab] = useState('tabla'); // 'tabla' | 'ingresos' | 'salidas'

  // Datos principales combinados
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [categoriaChip, setCategoriaChip] = useState('Todos'); // 'Todos' | 'Verdura' | 'Fruta' | 'Almacén' | 'Otros' | 'Sin categoría'

  // Configuración global (tara, redondeo, empaques)
  const [config, setConfig] = useState({
    tara_kg: 2.0,
    redondeo: 50,
    empaque_chica: 50,
    empaque_grande: 350,
    admin_pin_configurado: false,
    hogar_pin_configurado: false
  });

  // Modales
  const [modalCompra, setModalCompra] = useState(null); // { open: bool, productoPreseleccionado?: string }
  const [modalSalida, setModalSalida] = useState(false);
  const [modalNuevoProducto, setModalNuevoProducto] = useState(false);
  const [modalPublicar, setModalPublicar] = useState(false);
  const [modalConfig, setModalConfig] = useState(false);
  const [modalAdminPin, setModalAdminPin] = useState(null); // { open: bool, onConfirm: (pin) => void, error: string }

  // Estados de edición de margen inline
  const [margenesEditados, setMargenesEditados] = useState({});
  const [guardandoMargen, setGuardandoMargen] = useState({});

  // Estados de edición de precios de Almacén (Apps Script v22)
  const [edicionAlmacen, setEdicionAlmacen] = useState({}); // { [prodNombre]: { precio: string, margen: string, modificado: boolean } }
  const [guardandoPrecioAlmacen, setGuardandoPrecioAlmacen] = useState({});
  const [avisoPrecioCambiado, setAvisoPrecioCambiado] = useState(null);
  const [errorPrecioAlmacen, setErrorPrecioAlmacen] = useState(null);

  // Cargar datos principales (Stock en kg + Precios sugeridos + PreciosWeb)
  const cargarDatos = async () => {
    setCargando(true);
    setError(null);
    try {
      const [resStock, resPrecios, resConfig, resWeb, resAlmacen] = await Promise.all([
        apiGetStockKg(),
        apiGetPreciosSugeridos(),
        apiGetConfig(),
        apiGetPreciosWeb().catch(() => null),
        apiGetAlmacen().catch(() => null)
      ]);

      if (resConfig && resConfig.ok) {
        setConfig(prev => ({
          ...prev,
          tara_kg: resConfig.tara_kg !== undefined ? Number(resConfig.tara_kg) : prev.tara_kg,
          redondeo: resConfig.redondeo !== undefined ? Number(resConfig.redondeo) : prev.redondeo,
          empaque_chica: resConfig.empaque_chica !== undefined ? Number(resConfig.empaque_chica) : prev.empaque_chica,
          empaque_grande: resConfig.empaque_grande !== undefined ? Number(resConfig.empaque_grande) : prev.empaque_grande,
          admin_pin_configurado: Boolean(resConfig.admin_pin_configurado),
          hogar_pin_configurado: Boolean(resConfig.hogar_pin_configurado)
        }));
      }

      const listaStock = (resStock && resStock.ok && Array.isArray(resStock.productos)) ? resStock.productos : [];
      const listaPrecios = (resPrecios && resPrecios.ok && (Array.isArray(resPrecios.precios) ? resPrecios.precios : (Array.isArray(resPrecios.productos) ? resPrecios.productos : []))) || [];

      // Mapa de productos actualmente en PreciosWeb para recordar disponible tras recargar
      const mapaWeb = new Map();
      if (resWeb && resWeb.ok && Array.isArray(resWeb.productos)) {
        resWeb.productos.forEach(pw => {
          if (pw && (pw.nombre || pw.producto)) {
            mapaWeb.set(norm(pw.nombre || pw.producto), pw);
          }
        });
      }

      // Mapa de Almacén para cruce de stock en unidades
      const mapaAlmacen = new Map();
      if (Array.isArray(productosCostos)) {
        productosCostos.forEach(pc => {
          if (pc && (pc.nombre || pc.producto)) {
            mapaAlmacen.set(norm(pc.nombre || pc.producto), pc);
          }
        });
      }

      // Resolver disponibilidad según reglas:
      // - Almacén: si stock_unidades <= 0, disponible = false automáticamente con aviso, pero editable/forzable
      // - Frutas y verduras: 100% manual (sin inferir por stock en kg)
      // - Retrocompatible: sin flag = true
      const resolveInfoDisp = (prodNombre, cat, dispSugerido) => {
        const k = norm(prodNombre);
        const pw = mapaWeb.get(k);
        const alm = mapaAlmacen.get(k);
        const catNorm = (cat || '').toLowerCase();
        const esAlmacen = catNorm.includes('almacen') || getCategoriaPrincipal(prodNombre) === 'Almacén' || Boolean(alm);

        let stockUds = null;
        if (alm && alm.stock_unidades !== undefined) {
          stockUds = Number(alm.stock_unidades);
        }
        const sinStockAlmacenAuto = esAlmacen && stockUds !== null && stockUds <= 0;

        let disponible = true;
        let esForzado = false;

        if (pw && pw.disponible !== undefined) {
          disponible = pw.disponible !== false;
          if (sinStockAlmacenAuto && disponible) esForzado = true;
        } else if (dispSugerido !== undefined) {
          disponible = dispSugerido !== false;
          if (sinStockAlmacenAuto && disponible) esForzado = true;
        } else if (sinStockAlmacenAuto) {
          disponible = false;
        } else {
          disponible = true;
        }

        return { disponible, sinStockAlmacenAuto, esAlmacen, esForzado, stock_unidades: stockUds };
      };

      // Combinar por nombre normalizado
      const mapa = new Map();

      listaPrecios.forEach(p => {
        if (!p || !p.producto) return;
        const k = norm(p.producto);
        const cat = p.categoria || getCategoriaPrincipal(p.producto);
        const infoDisp = resolveInfoDisp(p.producto, cat, p.disponible);

        mapa.set(k, {
          producto: p.producto,
          categoria: cat,
          unidad: p.unidad || '',
          costo_kg_ultimo: Number(p.costo_kg_ultimo || p.costo || 0),
          costo_unitario: Number(p.costo_kg_ultimo || p.costo || 0),
          margen_pct: Number(p.margen_pct !== undefined ? p.margen_pct : 60),
          precio_sugerido: Number(p.precio_sugerido || 0),
          precio_publicado: Number(p.precio_publicado || 0),
          disponible: infoDisp.disponible,
          sinStockAlmacenAuto: infoDisp.sinStockAlmacenAuto,
          es_almacen: infoDisp.esAlmacen,
          es_forzado: infoDisp.esForzado,
          stock_unidades: infoDisp.stock_unidades,
          en_deposito: 0,
          comprometido: 0,
          vendible: 0,
          ultimo_ingreso: '—'
        });
      });

      listaStock.forEach(s => {
        if (!s || !s.producto) return;
        const k = norm(s.producto);
        const cat = s.categoria || getCategoriaPrincipal(s.producto);
        const existing = mapa.get(k) || {
          producto: s.producto,
          categoria: cat,
          unidad: s.unidad || '',
          costo_kg_ultimo: Number(s.costo_kg_ultimo || 0),
          costo_unitario: Number(s.costo_kg_ultimo || 0),
          margen_pct: 60,
          precio_sugerido: 0,
          precio_publicado: 0,
          ...resolveInfoDisp(s.producto, cat, undefined)
        };

        mapa.set(k, {
          ...existing,
          categoria: s.categoria || existing.categoria || getCategoriaPrincipal(s.producto),
          unidad: s.unidad || existing.unidad || '',
          costo_kg_ultimo: s.costo_kg_ultimo ? Number(s.costo_kg_ultimo) : existing.costo_kg_ultimo,
          costo_unitario: s.costo_kg_ultimo ? Number(s.costo_kg_ultimo) : existing.costo_kg_ultimo,
          en_deposito: Number(s.en_deposito || 0),
          comprometido: Number(s.comprometido || 0),
          vendible: Number(s.vendible !== undefined ? s.vendible : ((Number(s.en_deposito) || 0) - (Number(s.comprometido) || 0))),
          ultimo_ingreso: s.ultimo_ingreso || existing.ultimo_ingreso || '—'
        });
      });

      // ── CARGA Y CRUCE DE PRODUCTOS DE LA HOJA ALMACEN ─────────────────────
      const mapaRawAlmacen = new Map();

      const procesarItemAlmacen = (item) => {
        if (!item) return;
        const nom = String(item.nombre || item.producto || '').trim();
        // Regla: Filas con nombre vacío NO se muestran como productos
        if (!nom) return;
        const marca = String(item.marca || '').trim();
        const k = norm(nom) + '__' + norm(marca);
        const prev = mapaRawAlmacen.get(k) || {};

        const stockUds = Number(
          item.stock_unidades !== undefined ? item.stock_unidades :
          (item.unidades !== undefined ? item.unidades :
          (item.stock !== undefined ? item.stock : prev.stock_unidades || 0))
        ) || 0;

        const costo = Number(
          item.costo_unitario !== undefined ? item.costo_unitario :
          (item.costo !== undefined ? item.costo :
          (item.precioCajon !== undefined ? item.precioCajon : prev.costo_unitario || 0))
        ) || 0;

        const precioVenta = Number(
          item.precio_venta !== undefined ? item.precio_venta :
          (item.precioFinal !== undefined ? item.precioFinal :
          (item.precio !== undefined ? item.precio : prev.precio_venta || 0))
        ) || 0;

        const finalMarca = marca || String(prev.marca || '').trim();
        const cat = String(item.categoria || prev.categoria || 'Almacén').trim();
        const subcat = String(item.subcategoria || prev.subcategoria || 'Almacén').trim();
        const ean = String(item.codigo_ean || item.ean || prev.codigo_ean || '').trim().toUpperCase();
        const margen = item.margen_pct !== undefined
          ? Number(item.margen_pct)
          : (item.margen !== undefined ? Number(item.margen) : prev.margen_pct);

        mapaRawAlmacen.set(k, {
          nombre: nom,
          producto: nom,
          marca: finalMarca,
          categoria: cat,
          subcategoria: subcat,
          codigo_ean: ean,
          costo_unitario: costo,
          precio_venta: precioVenta,
          stock_unidades: stockUds,
          margen_pct: margen,
        });
      };

      // 1. Endpoint getAlmacen del servidor (si responde)
      const listaAlmacenServer = (resAlmacen && resAlmacen.ok)
        ? (Array.isArray(resAlmacen.almacen) ? resAlmacen.almacen : (Array.isArray(resAlmacen.productos) ? resAlmacen.productos : []))
        : [];
      listaAlmacenServer.forEach(procesarItemAlmacen);

      // 2. Filas de Almacen en stockData de Google Sheets
      if (Array.isArray(stockData)) {
        stockData.forEach(s => {
          if (s && (s.categoriaPrincipal === 'Almacén' || s.tipo === 'otros' || norm(s.subcategoria).includes('almacen'))) {
            procesarItemAlmacen(s);
          }
        });
      }

      // 3. Filas de Almacen en productosCostos
      if (Array.isArray(productosCostos)) {
        productosCostos.forEach(pc => {
          if (pc && (pc.categoriaPrincipal === 'Almacén' || norm(pc.subcategoria).includes('almacen') || pc.categoria === 'otros')) {
            procesarItemAlmacen(pc);
          }
        });
      }

      // 4. Cache local huerta_stock_units_cache_v1
      const cacheAlmObj = leerCacheAlmacen();
      Object.keys(cacheAlmObj || {}).forEach(k => {
        const c = cacheAlmObj[k];
        if (c && c.nombre) {
          procesarItemAlmacen({
            nombre: c.nombre,
            marca: c.marca,
            subcategoria: c.subcategoria,
            codigo_ean: c.ean,
            costo_unitario: c.costoUnitario,
            precio_venta: c.precioMaxManual || c.precioFinal,
            stock_unidades: c.stock,
            margen_pct: c.margen
          });
        }
      });

      // 5. Cruzar con mapa de EAN local
      try {
        const eanMap = getEanMapping();
        Object.keys(eanMap || {}).forEach(cEan => {
          const info = eanMap[cEan];
          if (info && info.nombre) {
            procesarItemAlmacen({
              nombre: info.nombre,
              marca: info.marca,
              subcategoria: info.subcategoria,
              codigo_ean: cEan
            });
          }
        });
      } catch (_) {}

      // Incorporar productos de Almacén a la lista principal
      mapaRawAlmacen.forEach((alm, k) => {
        // Regla: Los de stock 0 y los registros vacíos de la hoja NO se muestran como productos
        if (!alm.nombre || !alm.nombre.trim()) return;
        if (Number(alm.stock_unidades || 0) <= 0) return;

        const pw = mapaWeb.get(k) || (alm.marca ? mapaWeb.get(norm(`${alm.nombre} (${alm.marca})`)) : null) || mapaWeb.get(norm(alm.nombre));
        const costo = alm.costo_unitario;
        const precioVenta = alm.precio_venta;
        const margen = alm.margen_pct !== undefined 
          ? alm.margen_pct 
          : (costo > 0 && precioVenta > 0 ? Math.round(((precioVenta - costo) / costo) * 100) : 30);

        const existing = mapa.get(k);
        if (existing) {
          existing.es_almacen = true;
          existing.marca = alm.marca || existing.marca || '';
          existing.codigo_ean = alm.codigo_ean || existing.codigo_ean || '';
          existing.categoria = 'Almacén';
          existing.subcategoria = alm.subcategoria || existing.subcategoria || 'Almacén';
          existing.stock_unidades = alm.stock_unidades;
          existing.en_deposito = alm.stock_unidades;
          existing.costo_unitario = costo;
          existing.costo_kg_ultimo = costo;
          existing.precio_venta = precioVenta;
          existing.precio_sugerido = precioVenta;
          existing.precio_publicado = pw && pw.precio !== undefined ? Number(pw.precio) : (existing.precio_publicado || precioVenta);
          existing.margen_pct = margen;
          existing.disponible = alm.stock_unidades > 0;
          existing.unidad = 'unidad';
        } else {
          mapa.set(k, {
            producto: alm.nombre,
            nombre: alm.nombre,
            marca: alm.marca || '',
            codigo_ean: alm.codigo_ean || '',
            categoria: 'Almacén',
            subcategoria: alm.subcategoria || 'Almacén',
            unidad: 'unidad',
            costo_unitario: costo,
            costo_kg_ultimo: costo,
            precio_venta: precioVenta,
            precio_sugerido: precioVenta,
            precio_publicado: pw && pw.precio !== undefined ? Number(pw.precio) : precioVenta,
            margen_pct: margen,
            disponible: alm.stock_unidades > 0,
            sinStockAlmacenAuto: false,
            es_almacen: true,
            es_forzado: false,
            stock_unidades: alm.stock_unidades,
            en_deposito: alm.stock_unidades,
            comprometido: 0,
            vendible: alm.stock_unidades,
            ultimo_ingreso: '—'
          });
        }
      });

      const combinados = Array.from(mapa.values()).sort((a, b) => a.producto.localeCompare(b.producto, 'es', { sensitivity: 'base' }));
      setProductos(combinados);

    } catch (err) {
      setError(err.message || 'Error cargando datos de productos');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  // Helper de cálculo de precio sugerido
  const calcularPrecioSugerido = (costo, margenPct) => {
    const c = Number(costo) || 0;
    const m = Number(margenPct) || 0;
    const mult = Number(config.redondeo) || 50;
    if (c <= 0) return 0;
    const base = c * (1 + m / 100);
    return Math.round(base / mult) * mult;
  };

  // Guardar margen editado
  const handleGuardarMargen = async (prodNombre, nuevoMargen) => {
    const mNum = parseFloat(nuevoMargen);
    if (isNaN(mNum)) return;

    setGuardandoMargen(prev => ({ ...prev, [prodNombre]: true }));
    try {
      const res = await apiSetMargen(prodNombre, mNum);
      if (res && res.ok) {
        setProductos(prev => prev.map(p => {
          if (p.producto === prodNombre) {
            const sug = calcularPrecioSugerido(p.costo_kg_ultimo, mNum);
            return { ...p, margen_pct: mNum, precio_sugerido: sug };
          }
          return p;
        }));
      } else {
        alert(res?.error || 'No se pudo guardar el margen');
      }
    } catch (e) {
      alert(`Error al guardar margen: ${e.message}`);
    } finally {
      setGuardandoMargen(prev => ({ ...prev, [prodNombre]: false }));
    }
  };

  // Edición interactiva en vivo de Precio de Venta o Margen de Almacén (Apps Script v22)
  const handleCambioPrecioAlmacen = (prod, campo, valor) => {
    const costo = Number(prod.costo_unitario || prod.costo_kg_ultimo || 0);
    const prodKey = prod.producto;
    const actual = edicionAlmacen[prodKey] || {
      precio: String(prod.precio_venta || prod.precio_sugerido || ''),
      margen: String(prod.margen_pct !== undefined ? prod.margen_pct : 30),
      modificado: false
    };

    if (campo === 'precio') {
      const pNum = parseFloat(valor);
      let nuevoMargen = actual.margen;
      if (!isNaN(pNum) && costo > 0) {
        nuevoMargen = String(Math.round(((pNum - costo) / costo) * 100));
      }
      setEdicionAlmacen(prev => ({
        ...prev,
        [prodKey]: {
          precio: valor,
          margen: nuevoMargen,
          modificado: true
        }
      }));
    } else if (campo === 'margen') {
      const mNum = parseFloat(valor);
      let nuevoPrecio = actual.precio;
      if (!isNaN(mNum) && costo > 0) {
        nuevoPrecio = String(Math.round(costo * (1 + mNum / 100)));
      }
      setEdicionAlmacen(prev => ({
        ...prev,
        [prodKey]: {
          precio: nuevoPrecio,
          margen: valor,
          modificado: true
        }
      }));
    }
  };

  // Guardar precio de venta de almacén en el servidor (Apps Script v22)
  const handleGuardarPrecioAlmacen = async (prod) => {
    const prodKey = prod.producto;
    const ed = edicionAlmacen[prodKey];
    if (!ed || !ed.modificado) return;

    const precioNum = parseFloat(ed.precio);
    const margenNum = parseFloat(ed.margen);

    if (isNaN(precioNum) || precioNum <= 0) {
      alert('Ingresá un precio de venta mayor a 0 para el producto de almacén.');
      return;
    }

    setGuardandoPrecioAlmacen(prev => ({ ...prev, [prodKey]: true }));
    setErrorPrecioAlmacen(null);
    try {
      const payload = {
        ean: prod.codigo_ean || undefined,
        nombre: prod.producto,
        marca: prod.marca || undefined,
        precio_venta: Math.round(precioNum),
        margen_pct: !isNaN(margenNum) ? Math.round(margenNum) : undefined
      };
      const res = await apiActualizarPrecioAlmacen(payload);
      if (res && res.ok) {
        setAvisoPrecioCambiado('Precio cambiado: falta Publicar para que se vea en la web');
        setEdicionAlmacen(prev => {
          const next = { ...prev };
          delete next[prodKey];
          return next;
        });
        // Recargar desde el servidor (nunca modificar Almacén localmente)
        await cargarDatos();
      } else {
        const errorMsg = res?.error || 'No se pudo actualizar el precio en el servidor';
        setErrorPrecioAlmacen(errorMsg);
        alert(errorMsg);
      }
    } catch (e) {
      const msg = e.message || 'Error de red al actualizar precio de almacén';
      setErrorPrecioAlmacen(msg);
      alert(msg);
    } finally {
      setGuardandoPrecioAlmacen(prev => ({ ...prev, [prodKey]: false }));
    }
  };

  // Alternar disponibilidad (Disponible / Sin stock) por producto
  const handleToggleDisponible = (prodNombre) => {
    setProductos(prev => prev.map(p => {
      if (p.producto !== prodNombre) return p;
      const nuevoDisp = !(p.disponible !== false);
      const nuevoForzado = Boolean(p.sinStockAlmacenAuto && nuevoDisp);
      return {
        ...p,
        disponible: nuevoDisp,
        es_forzado: nuevoForzado,
        disponible_cambio: true
      };
    }));
  };

  // Helper para solicitar PIN de Admin con memoria de 15 minutos
  const ejecutarConAdminPin = (accionCallback) => {
    const pinMem = getAdminPinSession();
    if (pinMem) {
      accionCallback(pinMem);
      return;
    }
    setModalAdminPin({
      open: true,
      error: null,
      onConfirm: (pinIngresado) => {
        setAdminPinSession(pinIngresado);
        setModalAdminPin(null);
        accionCallback(pinIngresado);
      }
    });
  };

  // Filtrado de productos
  const productosFiltrados = useMemo(() => {
    return productos.filter(p => {
      // Filtro de chip
      const catNorm = norm(p.categoria || '');
      if (categoriaChip === 'Verdura' && !catNorm.includes('verdura')) return false;
      if (categoriaChip === 'Fruta' && !catNorm.includes('fruta')) return false;
      if (categoriaChip === 'Almacén' && !catNorm.includes('almacen')) return false;
      if (categoriaChip === 'Otros' && (catNorm.includes('verdura') || catNorm.includes('fruta') || catNorm.includes('almacen'))) return false;
      if (categoriaChip === 'Sin categoría' && p.categoria && p.categoria.trim() !== '' && p.categoria !== 'Sin categoría') return false;

      // Buscador
      if (busqueda.trim()) {
        const q = norm(busqueda);
        const matchNombre = norm(p.producto).includes(q);
        const matchCat = catNorm.includes(q);
        if (!matchNombre && !matchCat) return false;
      }

      return true;
    });
  }, [productos, categoriaChip, busqueda]);

  // Lista de cambios para el modal de publicación
  const cambiosDePrecio = useMemo(() => {
    return productos.map(p => {
      const esAlm = Boolean(p.es_almacen || p.categoria === 'Almacén' || norm(p.categoria).includes('almacen'));
      const margenActual = margenesEditados[p.producto] !== undefined ? margenesEditados[p.producto] : p.margen_pct;
      
      let sugerido = 0;
      const costoVal = esAlm ? Number(p.costo_unitario || p.costo_kg_ultimo || 0) : Number(p.costo_kg_ultimo || 0);

      if (esAlm) {
        if (margenesEditados[p.producto] !== undefined && costoVal > 0) {
          sugerido = Math.round(costoVal * (1 + Number(margenActual) / 100));
        } else {
          sugerido = Number(p.precio_venta || p.precio_sugerido || 0);
        }
      } else {
        sugerido = calcularPrecioSugerido(costoVal, margenActual);
      }

      const publicado = Number(p.precio_publicado || 0);
      const diferencia = sugerido - publicado;
      const difPct = publicado > 0 ? ((diferencia / publicado) * 100).toFixed(1) : '100';

      return {
        producto: p.producto,
        costo_kg_ultimo: costoVal,
        margen_pct: margenActual,
        precio_sugerido: sugerido,
        precio_publicado: publicado,
        diferencia,
        difPct,
        disponible: p.disponible !== false,
        es_almacen: esAlm,
        sinStockAlmacenAuto: p.sinStockAlmacenAuto,
        es_forzado: p.es_forzado,
        cambia: (sugerido > 0 && sugerido !== publicado) || Boolean(p.disponible_cambio)
      };
    });
  }, [productos, margenesEditados, config.redondeo, calcularPrecioSugerido]);

  const productosQueCambian = useMemo(() => cambiosDePrecio.filter(c => c.cambia), [cambiosDePrecio]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pt-16 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* ── ENCABEZADO SUPERIOR ────────────────────────────────────────── */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-green-500/10 border border-green-500/30 flex items-center justify-center text-green-400">
              <Package size={20} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Productos & Stock
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">
                Tabla unificada de costos, márgenes, stock y compras
              </p>
            </div>
          </div>
        </div>

        {/* Pestañas de vista internas */}
        <div className="flex items-center gap-2">
          <div className="flex bg-black/60 border border-gray-800 p-1 rounded-xl">
            <button
              onClick={() => setSubTab('tabla')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                subTab === 'tabla' ? 'bg-green-500 text-black shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              Productos
            </button>
            <button
              onClick={() => setSubTab('ean')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                subTab === 'ean' ? 'bg-cyan-500 text-black shadow' : 'text-cyan-400 hover:text-cyan-300'
              }`}
            >
              <Barcode size={14} />
              <span>Carga EAN</span>
            </button>
            <button
              onClick={() => setSubTab('ingresos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                subTab === 'ingresos' ? 'bg-green-500 text-black shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              Historial de Ingresos
            </button>
            <button
              onClick={() => setSubTab('salidas')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                subTab === 'salidas' ? 'bg-green-500 text-black shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              Historial de Salidas
            </button>
          </div>

          <button
            onClick={() => setModalConfig(true)}
            title="Configuración de Tara y Redondeo"
            className="p-2.5 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-700 text-gray-400 hover:text-white transition-all cursor-pointer"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* ── SUB-VISTA 1: TABLA PRINCIPAL DE PRODUCTOS ───────────────────── */}
      {subTab === 'tabla' && (
        <div className="space-y-4">
          {/* Tarjeta: Pedido Mínimo de Compra en PreciosWeb */}
          <PedidoMinimoCard />

          {/* Aviso: Precio de almacén cambiado sin publicar */}
          {avisoPrecioCambiado && (
            <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-200 flex items-center justify-between gap-3 animate-in fade-in">
              <div className="flex items-center gap-2 text-xs font-bold">
                <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
                <span>{avisoPrecioCambiado}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setModalPublicar(true)}
                  className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black text-xs transition-all cursor-pointer whitespace-nowrap shadow"
                >
                  Publicar ahora
                </button>
                <button
                  type="button"
                  onClick={() => setAvisoPrecioCambiado(null)}
                  className="text-gray-400 hover:text-white p-1 rounded-lg"
                  title="Cerrar aviso"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Barra de Filtros y Botones de Acción */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-[#121212] border border-gray-800 p-3.5 rounded-2xl">
            {/* Buscador */}
            <div className="relative flex-1 max-w-xs">
              <Search size={15} className="absolute left-3.5 top-2.5 text-gray-500" />
              <input
                type="text"
                placeholder="Buscar producto..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full bg-black/60 border border-gray-700 focus:border-green-500 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-gray-500 outline-none"
              />
            </div>

            {/* Chips de Categorías */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
              {['Todos', 'Verdura', 'Fruta', 'Almacén', 'Otros', 'Sin categoría'].map(chip => (
                <button
                  key={chip}
                  onClick={() => setCategoriaChip(chip)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    categoriaChip === chip
                      ? 'bg-gray-200 text-black'
                      : 'bg-black/40 text-gray-400 hover:text-white hover:bg-gray-800 border border-gray-800'
                  }`}
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Botones de Acción */}
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <button
                onClick={() => setSubTab('ean')}
                className="px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm shadow-cyan-500/10"
              >
                <Barcode size={14} />
                <span>Escanear EAN</span>
              </button>

              <button
                onClick={() => setModalCompra({ open: true })}
                className="px-3 py-1.5 rounded-xl bg-green-500 hover:bg-green-400 text-black text-xs font-black uppercase tracking-wider flex items-center gap-1 shadow-md shadow-green-500/10 cursor-pointer"
              >
                <Plus size={14} />
                <span>+ Compra</span>
              </button>

              <button
                onClick={() => setModalSalida(true)}
                title="Egreso de mercadería por merma o corrección de stock"
                className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <Minus size={14} />
                <span>− Merma</span>
              </button>

              <button
                onClick={() => setModalNuevoProducto(true)}
                className="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-750 text-gray-200 text-xs font-bold flex items-center gap-1 cursor-pointer border border-gray-700"
              >
                <Plus size={14} />
                <span>+ Producto</span>
              </button>

              <button
                onClick={() => setModalPublicar(true)}
                disabled={productos.length === 0}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1 shadow-md shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
              >
                <Check size={14} />
                <span>Publicar ({productosQueCambian.length})</span>
              </button>

              <button
                onClick={cargarDatos}
                disabled={cargando}
                title="Recargar datos"
                className="p-1.5 rounded-xl bg-gray-900 border border-gray-800 text-gray-400 hover:text-white cursor-pointer"
              >
                <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          {/* Tabla de Productos con Estilo PanelCostos */}
          <div className="bg-[#121212] border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-black/60 border-b border-gray-800 text-gray-400 font-bold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-4">Producto</th>
                    <th className="py-3 px-3">Categoría</th>
                    <th className="py-3 px-3 text-center">Disponible</th>
                    <th className="py-3 px-3 text-right">Stock</th>
                    <th className="py-3 px-3 text-right">Costo / Ud</th>
                    <th className="py-3 px-3 text-center">Margen %</th>
                    <th className="py-3 px-3 text-right">Precio Sugerido</th>
                    <th className="py-3 px-3 text-right">Precio Publicado</th>
                    <th className="py-3 px-3 text-right">Diferencia</th>
                    <th className="py-3 px-3 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60 font-medium">
                  {cargando && productos.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-gray-500">
                        <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-green-500" />
                        <span>Cargando catálogo unificado desde Google Sheets...</span>
                      </td>
                    </tr>
                  ) : productosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-gray-500">
                        No se encontraron productos con los filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    productosFiltrados.map((p, idx) => {
                      const ed = edicionAlmacen[p.producto];
                      const margenVal = p.es_almacen
                        ? (ed?.margen !== undefined ? ed.margen : (p.margen_pct !== undefined ? p.margen_pct : 30))
                        : (margenesEditados[p.producto] !== undefined ? margenesEditados[p.producto] : p.margen_pct);

                      let sug = 0;
                      if (p.es_almacen) {
                        sug = ed?.precio !== undefined
                          ? Number(ed.precio)
                          : Number(p.precio_venta || p.precio_sugerido || 0);
                      } else {
                        sug = calcularPrecioSugerido(p.costo_kg_ultimo, margenVal);
                      }
                      const pub = Number(p.precio_publicado || 0);
                      const dif = sug - pub;
                      const esSinStock = p.disponible === false;

                      // Explicación de la cuenta: costo × factor -> redondeado
                      const factor = (1 + (Number(margenVal) || 0) / 100).toFixed(2).replace('.', ',');
                      const textoCuenta = p.costo_kg_ultimo > 0 
                        ? `costo × ${factor} → red. $${config.redondeo}` 
                        : 'sin costo';

                      return (
                        <tr 
                          key={idx} 
                          className={`hover:bg-white/[0.02] transition-colors ${esSinStock ? 'bg-red-950/10' : ''}`}
                        >
                          {/* 1. Producto */}
                          <td className="py-3 px-4 font-bold text-white text-sm">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span>{p.producto}</span>
                              {p.marca && (
                                <span className="text-[10px] text-gray-400 font-semibold px-1.5 py-0.5 rounded bg-gray-800/80 border border-gray-700/50">
                                  {p.marca}
                                </span>
                              )}
                              {p.codigo_ean && (
                                <span className="font-mono text-[9px] text-amber-300 font-bold px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 flex items-center gap-1">
                                  <Barcode size={10} /> {p.codigo_ean}
                                </span>
                              )}
                              {p.disponible === false && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-red-600/20 text-red-400 border border-red-500/40">
                                  Sin stock
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 2. Categoría */}
                          <td className="py-3 px-3">
                            <div className="flex flex-col gap-0.5">
                              <span className="px-2 py-0.5 rounded-md bg-gray-800/80 border border-gray-700/60 text-gray-300 text-[10px] font-semibold w-fit">
                                {p.categoria || 'Sin categoría'}
                              </span>
                              {p.subcategoria && p.subcategoria !== p.categoria && (
                                <span className="text-[9px] text-gray-500 font-medium">
                                  {p.subcategoria}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 2b. Disponible Switch */}
                          <td className="py-3 px-3 text-center">
                            <div className="inline-flex flex-col items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleToggleDisponible(p.producto)}
                                className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors cursor-pointer ${
                                  p.disponible !== false ? 'bg-green-600' : 'bg-gray-700'
                                }`}
                                title={p.disponible !== false ? 'Disponible en la web (clic para marcar Sin stock)' : 'Sin stock (clic para marcar Disponible)'}
                              >
                                <span
                                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                    p.disponible !== false ? 'translate-x-5' : 'translate-x-1'
                                  }`}
                                />
                              </button>
                              <div className="text-[10px] font-bold leading-tight">
                                {p.disponible !== false ? (
                                  p.es_forzado ? (
                                    <span className="text-amber-400 font-semibold text-[9px] bg-amber-500/10 px-1 py-0.5 rounded border border-amber-500/20" title="Almacén en 0 pero forzado a disponible">
                                      Forzado
                                    </span>
                                  ) : (
                                    <span className="text-green-400">Disponible</span>
                                  )
                                ) : (
                                  <span className="text-red-400">
                                    Sin stock
                                    {p.sinStockAlmacenAuto && (
                                      <span className="block text-[8px] text-amber-400 font-normal">Sin stock en almacén</span>
                                    )}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* 3. Stock con unidad */}
                          <td className="py-3 px-3 text-right font-mono font-bold">
                            <span className={esSinStock ? 'text-gray-500' : 'text-white'}>
                              {p.es_almacen
                                ? `${Math.round(Number(p.stock_unidades || p.en_deposito || 0))} un`
                                : (p.unidad === 'kg' 
                                    ? `${Number(p.en_deposito || 0).toFixed(2)} kg` 
                                    : `${Math.round(Number(p.en_deposito || 0))} ${p.unidad}`)}
                            </span>
                          </td>

                          {/* 4. Costo por unidad */}
                          <td className="py-3 px-3 text-right font-mono text-gray-300">
                            {(p.costo_unitario > 0 || p.costo_kg_ultimo > 0) ? (
                              <span>$${(p.costo_unitario || p.costo_kg_ultimo).toFixed(0)} <span className="text-[10px] text-gray-500 font-normal">/{p.unidad}</span></span>
                            ) : (
                              <span className="text-gray-600">—</span>
                            )}
                          </td>

                          {/* 5. Margen % editable */}
                          <td className="py-3 px-3 text-center">
                            {p.es_almacen ? (
                              <div className="inline-flex items-center justify-center gap-0.5 bg-black/60 border border-gray-800 focus-within:border-amber-400 rounded-lg px-1.5 py-0.5">
                                <input
                                  type="number"
                                  className="w-11 bg-transparent text-right font-mono text-xs text-amber-300 outline-none"
                                  value={margenVal !== undefined ? margenVal : ''}
                                  onChange={(e) => handleCambioPrecioAlmacen(p, 'margen', e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleGuardarPrecioAlmacen(p);
                                    }
                                  }}
                                />
                                <span className="text-[10px] text-gray-500">%</span>
                              </div>
                            ) : (
                              <div className="inline-flex items-center justify-center gap-0.5 bg-black/60 border border-gray-800 focus-within:border-green-500 rounded-lg px-1.5 py-0.5">
                                <input
                                  type="number"
                                  className="w-11 bg-transparent text-right font-mono text-xs text-white outline-none"
                                  value={margenVal !== undefined ? margenVal : ''}
                                  onChange={(e) => setMargenesEditados({ ...margenesEditados, [p.producto]: e.target.value })}
                                  onBlur={(e) => handleGuardarMargen(p.producto, e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleGuardarMargen(p.producto, e.target.value);
                                    }
                                  }}
                                />
                                <span className="text-[10px] text-gray-500">%</span>
                                {guardandoMargen[p.producto] && (
                                  <RefreshCw size={10} className="animate-spin text-green-400 ml-0.5" />
                                )}
                              </div>
                            )}
                          </td>

                          {/* 6. Precio sugerido con subtítulo explicativo */}
                          <td className="py-3 px-3 text-right">
                            {p.es_almacen ? (
                              <div className="flex flex-col items-end gap-1">
                                <div className="inline-flex items-center gap-1 bg-black/70 border border-gray-700 focus-within:border-amber-400 rounded-lg px-2 py-0.5">
                                  <span className="text-gray-500 text-xs font-bold">$</span>
                                  <input
                                    type="number"
                                    step="1"
                                    placeholder="0"
                                    value={ed?.precio !== undefined ? ed.precio : (p.precio_venta || sug || '')}
                                    onChange={(e) => handleCambioPrecioAlmacen(p, 'precio', e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleGuardarPrecioAlmacen(p);
                                      }
                                    }}
                                    className="w-16 bg-transparent text-right font-mono text-xs font-bold text-amber-300 outline-none"
                                  />
                                  {guardandoPrecioAlmacen[p.producto] ? (
                                    <RefreshCw size={11} className="animate-spin text-amber-400 ml-0.5" />
                                  ) : ed?.modificado ? (
                                    <button
                                      type="button"
                                      onClick={() => handleGuardarPrecioAlmacen(p)}
                                      title="Guardar precio de venta en Almacén"
                                      className="p-0.5 rounded bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-black transition-all cursor-pointer"
                                    >
                                      <Check size={11} />
                                    </button>
                                  ) : null}
                                </div>
                                <div className="text-[9px] text-gray-500 font-mono">
                                  {ed?.modificado ? (
                                    <span className="text-amber-400 font-semibold">modificado (Enter)</span>
                                  ) : (
                                    'precio hoja Almacén'
                                  )}
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="font-mono font-black text-amber-300 text-sm">
                                  {sug > 0 ? $$(sug) : '—'}
                                </div>
                                <div className="text-[9px] text-gray-500 font-mono">
                                  {textoCuenta}
                                </div>
                              </>
                            )}
                          </td>

                          {/* 7. Precio publicado */}
                          <td className="py-3 px-3 text-right font-mono font-bold text-gray-300">
                            {pub > 0 ? $$(pub) : '—'}
                          </td>

                          {/* 8. Diferencia */}
                          <td className="py-3 px-3 text-right font-mono text-xs">
                            {sug > 0 && pub > 0 ? (
                              <span className={dif === 0 ? 'text-gray-500' : dif > 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                                {dif > 0 ? `+${$$(dif)}` : dif < 0 ? `-${$$(Math.abs(dif))}` : '$0'}
                              </span>
                            ) : (
                              <span className="text-gray-600">—</span>
                            )}
                          </td>

                          {/* 9. Botón + Compra por fila */}
                          <td className="py-3 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => setModalCompra({ open: true, productoPreseleccionado: p.producto })}
                              className="px-2.5 py-1 rounded-lg bg-green-500/10 border border-green-500/30 hover:bg-green-500 hover:text-black text-green-400 text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                            >
                              <Plus size={11} />
                              <span>+ Compra</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── SUB-VISTA 2: HISTORIAL DE INGRESOS ─────────────────────────── */}
      {subTab === 'ingresos' && (
        <HistorialIngresosTab onVolver={() => setSubTab('tabla')} />
      )}

      {/* ── SUB-VISTA 3: HISTORIAL DE SALIDAS ──────────────────────────── */}
      {subTab === 'salidas' && (
        <HistorialSalidasTab onVolver={() => setSubTab('tabla')} />
      )}

      {/* ── SUB-VISTA 4: CARGA POR EAN (ALMACÉN) ───────────────────────── */}
      {subTab === 'ean' && (
        <CargaEanTab onVolver={() => setSubTab('tabla')} onProductoActualizado={cargarDatos} />
      )}

      {/* ── MODAL 1: NUEVA COMPRA (PARTE 2) ────────────────────────────── */}
      {modalCompra && modalCompra.open && (
        <ModalCompra
          productosExistentes={productos}
          productoInicial={modalCompra.productoPreseleccionado || ''}
          taraKg={config.tara_kg}
          onClose={() => setModalCompra(null)}
          onSuccess={() => {
            setModalCompra(null);
            cargarDatos();
          }}
          productosCostos={productosCostos}
          stockData={stockData}
          fetchControlStock={fetchControlStock}
          fetchPanelCostos={fetchPanelCostos}
        />
      )}

      {/* ── MODAL 2: REGISTRAR SALIDA (PARTE 3) ────────────────────────── */}
      {modalSalida && (
        <ModalSalida
          productosExistentes={productos}
          taraKg={config.tara_kg}
          onClose={() => setModalSalida(false)}
          onSuccess={() => {
            setModalSalida(false);
            cargarDatos();
          }}
          ejecutarConAdminPin={ejecutarConAdminPin}
        />
      )}

      {/* ── MODAL 3: NUEVO PRODUCTO ────────────────────────────────────── */}
      {modalNuevoProducto && (
        <ModalNuevoProducto
          onClose={() => setModalNuevoProducto(false)}
          onSuccess={() => {
            setModalNuevoProducto(false);
            cargarDatos();
          }}
        />
      )}

      {/* ── MODAL 4: PUBLICAR PRECIOS (ANTES / DESPUÉS) ────────────────── */}
      {modalPublicar && (
        <ModalPublicar
          productosQueCambian={productosQueCambian}
          preciosList={productos}
          margenesEditados={margenesEditados}
          config={config}
          calcularPrecioSugerido={calcularPrecioSugerido}
          onClose={() => setModalPublicar(false)}
          onSuccess={() => {
            setModalPublicar(false);
            cargarDatos();
          }}
        />
      )}

      {/* ── MODAL 5: CONFIGURACIÓN GLOBAL (PARTE 6) ────────────────────── */}
      {modalConfig && (
        <ModalConfiguracion
          config={config}
          onClose={() => setModalConfig(false)}
          onGuardado={() => {
            cargarDatos();
          }}
        />
      )}

      {/* ── MODAL 6: PEDIR PIN DE ADMINISTRADOR (SOLO MEMORIA) ─────────── */}
      {modalAdminPin && modalAdminPin.open && (
        <ModalPedirAdminPin
          error={modalAdminPin.error}
          onConfirm={modalAdminPin.onConfirm}
          onClose={() => setModalAdminPin(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: MODAL NUEVA COMPRA (PARTE 2)
// ─────────────────────────────────────────────────────────────────────────────
function ModalCompra({ 
  productosExistentes = [], 
  productoInicial = '', 
  taraKg = 2.0, 
  onClose, 
  onSuccess,
  productosCostos = [],
  stockData = {},
  fetchControlStock,
  fetchPanelCostos
}) {
  const [producto, setProducto] = useState(productoInicial || '');
  const [proveedor, setProveedor] = useState('');
  const [proveedorTel, setProveedorTel] = useState('');
  const [proveedoresLista, setProveedoresLista] = useState([]);
  const [costoTotal, setCostoTotal] = useState('');

  // Categoría principal del producto a ingresar
  const [categoria, setCategoria] = useState(() => {
    if (productoInicial) {
      const q = norm(productoInicial);
      const m1 = (productosExistentes || []).find(p => norm(p.producto || p.nombre) === q);
      const m2 = (productosCostos || []).find(p => norm(p.nombre) === q);
      const match = m1 || m2;
      if (match && (match.categoriaPrincipal === 'Almacén' || match.categoria === 'Almacén' || norm(match.subcategoria).includes('almacen'))) {
        return 'Almacén';
      }
      if (match && match.categoria) return match.categoria;
    }
    return 'Verduras';
  });

  const [unidadNueva, setUnidadNueva] = useState('kg');

  // Campos específicos de Almacén (Apps Script v21)
  const [ean, setEan] = useState('');
  const [marca, setMarca] = useState('');
  const [subcategoria, setSubcategoria] = useState('Almacén');
  const [unidades, setUnidades] = useState('');
  const [margenManualModificado, setMargenManualModificado] = useState(false);
  const [margenPct, setMargenPct] = useState(() => {
    if (productoInicial) {
      const q = norm(productoInicial);
      const m1 = (productosExistentes || []).find(p => norm(p.producto || p.nombre) === q);
      const m2 = (productosCostos || []).find(p => norm(p.nombre) === q);
      const match = m1 || m2;
      if (match && (match.categoriaPrincipal === 'Almacén' || match.categoria === 'Almacén' || norm(match.subcategoria).includes('almacen'))) {
        return '30';
      }
    }
    return '70';
  });
  const [precioVenta, setPrecioVenta] = useState('');
  const [precioVentaManualModificado, setPrecioVentaManualModificado] = useState(false);
  const [eanMatch, setEanMatch] = useState(null); // { nombre, marca, subcategoria, stockActual, costoActual, precioVenta }

  // Refs para control de foco, Enter y deduplicación de operación
  const eanInputRef = useRef(null);
  const cantidadInputRef = useRef(null);
  const opIdRef = useRef(null);

  // Modo pesaje / cajones (para Verduras / Frutas)
  const [modoManual, setModoManual] = useState(false);
  const [cajones, setCajones] = useState([]);
  const [pesoManualCajon, setPesoManualCajon] = useState('');
  const [kgNetosManual, setKgNetosManual] = useState('');

  // Balanza Systel (conexión compartida en sesión del navegador)
  const {
    conectado: balanzaConectada,
    conectando: balanzaConectando,
    pesoVivo: balanzaPesoVivo,
    toggle: toggleBalanza
  } = useBalanzaSystel();

  // Estados de envío y feedback
  const [guardando, setGuardando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState(null);
  const [mensajeError, setMensajeError] = useState(null);

  // Verificar si el producto escrito existe en el catálogo tradicional
  const productoMatch = useMemo(() => {
    const q = norm(producto);
    if (!q) return null;
    return (productosExistentes || []).find(p => norm(p.producto || p.nombre) === q) || null;
  }, [producto, productosExistentes]);

  const productoCostosMatch = useMemo(() => {
    const q = norm(producto);
    if (!q) return null;
    return (productosCostos || []).find(p => norm(p.nombre) === q) || null;
  }, [producto, productosCostos]);

  // Determinar si es Almacén: por categoría elegida o por producto existente de almacén
  const esAlmacen = useMemo(() => {
    if (categoria === 'Almacén') return true;
    if (productoMatch && (productoMatch.categoriaPrincipal === 'Almacén' || productoMatch.categoria === 'Almacén' || norm(productoMatch.subcategoria).includes('almacen'))) return true;
    if (productoCostosMatch && (productoCostosMatch.categoriaPrincipal === 'Almacén' || productoCostosMatch.categoria === 'Almacén' || norm(productoCostosMatch.subcategoria).includes('almacen'))) return true;
    return false;
  }, [categoria, productoMatch, productoCostosMatch]);

  const esProductoNuevo = Boolean(producto.trim() && !productoMatch && !productoCostosMatch && !eanMatch);
  const unidadActiva = esAlmacen ? 'unidad' : (productoMatch ? productoMatch.unidad : unidadNueva);

  // Cargar lista de proveedores para autocompletar
  useEffect(() => {
    (async () => {
      try {
        const res = await apiGetProveedores();
        if (res && res.ok && Array.isArray(res.proveedores)) {
          setProveedoresLista(res.proveedores);
        }
      } catch (e) {
        // silencioso
      }
    })();
  }, []);

  // Foco automático en el input de EAN al montar si ya es Almacén
  useEffect(() => {
    if (esAlmacen) {
      setTimeout(() => eanInputRef.current?.focus(), 80);
    }
  }, []);

  // Cambio manual de categoría con foco automático
  const handleCambiarCategoria = (nuevaCat) => {
    setCategoria(nuevaCat);
    if (nuevaCat === 'Almacén') {
      setTimeout(() => eanInputRef.current?.focus(), 80);
    }
  };

  // Autocompletar cuando se tipea o escanea un EAN existente en Almacén
  const handleEanChange = useCallback((val) => {
    setEan(val);
    const clean = String(val || '').trim().toUpperCase();
    if (!clean) {
      setEanMatch(null);
      return;
    }

    // Buscar en los cachés ya cargados
    const mapEan = getEanMapping();
    const eanInfo = mapEan[clean];
    const pCosto = (productosCostos || []).find(p => String(p.ean || '').trim().toUpperCase() === clean);
    const pStock = Object.values(stockData || {}).find(p => String(p.ean || '').trim().toUpperCase() === clean);
    const cacheAlm = leerCacheAlmacen();

    const nombreEncontrado = eanInfo?.nombre || pCosto?.nombre || pStock?.nombre || null;

    if (nombreEncontrado) {
      const k = norm(nombreEncontrado);
      const cData = cacheAlm[k] || {};

      const marcaEncontrada = eanInfo?.marca || pCosto?.marca || pStock?.marca || cData.marca || '';
      const subcatEncontrada = eanInfo?.subcategoria || pCosto?.subcategoria || pStock?.subcategoria || cData.subcategoria || 'Almacén';
      const stockActual = pCosto?.stock_unidades ?? pStock?.stock?.unidades ?? cData.stock ?? 0;
      const costoActual = pCosto?.costo_unitario ?? pCosto?.precioCajon ?? cData.costoUnitario ?? 0;
      const precioVentaActual = pCosto?.precio_venta ?? pCosto?.precioFinal ?? cData.precioMaxManual ?? null;

      setEanMatch({
        nombre: nombreEncontrado,
        marca: marcaEncontrada,
        subcategoria: subcatEncontrada,
        stockActual: Number(stockActual) || 0,
        costoActual: Number(costoActual) || 0,
        precioVenta: precioVentaActual
      });

      setProducto(nombreEncontrado);
      if (marcaEncontrada) setMarca(marcaEncontrada);
      setCategoria('Almacén');
      setSubcategoria(subcatEncontrada);
    } else {
      setEanMatch(null);
    }
  }, [productosCostos, stockData]);

  // Sincronizar margen por defecto (30 en Almacén, 70 en Verduras/pesables) si no fue modificado a mano
  useEffect(() => {
    if (!margenManualModificado) {
      setMargenPct(esAlmacen ? '30' : '70');
    }
  }, [esAlmacen, margenManualModificado]);

  // Cálculos en vivo para Almacén (Apps Script v22)
  const costoTotalNum = parseFloat(costoTotal) || 0;
  const unidadesNum = parseInt(unidades, 10) || 0;
  const costoPorPaquete = (costoTotalNum > 0 && unidadesNum > 0)
    ? Number((costoTotalNum / unidadesNum).toFixed(2))
    : 0;

  const margenDefecto = esAlmacen ? 30 : 70;
  const margenNum = margenPct !== '' && !isNaN(parseFloat(margenPct)) ? Number(margenPct) : margenDefecto;
  const precioVentaSugerido = costoPorPaquete > 0
    ? Math.round(costoPorPaquete * (1 + margenNum / 100))
    : 0;

  useEffect(() => {
    if (esAlmacen && !precioVentaManualModificado) {
      setPrecioVenta(precioVentaSugerido > 0 ? String(precioVentaSugerido) : '');
    }
  }, [esAlmacen, precioVentaSugerido, precioVentaManualModificado]);

  const agregarCajonDesdeBalanza = () => {
    if (!balanzaPesoVivo || balanzaPesoVivo <= 0) {
      alert('La balanza no registró un peso válido.');
      return;
    }
    const tara = Number(taraKg) || 0;
    const neto = Number(Math.max(0, balanzaPesoVivo - tara).toFixed(3));
    if (neto <= 0) {
      alert(`El peso (${balanzaPesoVivo} kg) es menor o igual a la tara (${tara} kg).`);
      return;
    }
    setCajones(prev => [...prev, neto]);
  };

  const agregarCajonManual = () => {
    const val = parseFloat(pesoManualCajon);
    if (isNaN(val) || val <= 0) return;
    setCajones(prev => [...prev, Number(val.toFixed(3))]);
    setPesoManualCajon('');
  };

  // Cálculo de cantidad total neta para pesables / cajones
  const cantidadTotalNeta = useMemo(() => {
    if (esAlmacen) return unidadesNum;
    if (unidadActiva !== 'kg') {
      return parseFloat(kgNetosManual) || 0;
    }
    if (modoManual) {
      return parseFloat(kgNetosManual) || 0;
    }
    const suma = cajones.reduce((acc, c) => acc + (Number(c) || 0), 0);
    return Number(suma.toFixed(3));
  }, [esAlmacen, unidadesNum, unidadActiva, modoManual, kgNetosManual, cajones]);

  // Costo por unidad para no-almacén
  const costoPorUnidad = useMemo(() => {
    if (costoTotalNum <= 0 || cantidadTotalNeta <= 0) return 0;
    return Number((costoTotalNum / cantidadTotalNeta).toFixed(2));
  }, [costoTotalNum, cantidadTotalNeta]);

  // Guardar Compra / Ingreso
  const handleGuardar = async (e) => {
    e.preventDefault();
    setMensajeError(null);
    setMensajeExito(null);

    const prodLimpio = producto.trim();
    if (!prodLimpio) {
      setMensajeError('Ingresá el nombre del producto.');
      return;
    }

    // ── FLUJO ALMACÉN (APPS SCRIPT V21) ──────────────────────────────────────
    if (esAlmacen) {
      const cleanEan = String(ean || '').trim().toUpperCase();
      if (!cleanEan) {
        setMensajeError('Ingresá o escaneá el código de barras (EAN).');
        return;
      }

      const uNum = parseInt(unidades, 10);
      if (isNaN(uNum) || uNum <= 0) {
        setMensajeError('La cantidad comprada debe ser un número entero mayor a 0 (paquetes/unidades).');
        return;
      }

      if (costoTotalNum <= 0) {
        setMensajeError('Ingresá un costo total pagado válido en pesos mayor a 0.');
        return;
      }

      // op_id evita duplicar si se manda dos veces: genera uuid en primer intento y lo reutiliza en reintentos
      if (!opIdRef.current) {
        opIdRef.current = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
          ? crypto.randomUUID()
          : 'op_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
      }
      const currentOpId = opIdRef.current;

      setGuardando(true);
      try {
        const pVentaFinal = precioVenta !== '' && !isNaN(parseFloat(precioVenta))
          ? Number(precioVenta)
          : (precioVentaSugerido > 0 ? precioVentaSugerido : undefined);

        const res = await apiIngresoAlmacen({
          nombre: prodLimpio,
          marca: marca.trim() || undefined,
          categoria: 'Almacén',
          subcategoria: subcategoria.trim() || 'Almacén',
          ean: cleanEan,
          unidades: uNum,
          total_pagado: costoTotalNum,
          proveedor: proveedor.trim() || undefined,
          precio_venta: pVentaFinal,
          margen_pct: margenNum,
          op_id: currentOpId
        });

        if (res && res.ok) {
          // Éxito: limpiar op_id
          opIdRef.current = null;

          const stockNuevo = res.stock !== undefined ? res.stock : 'actualizado';
          const costoUnidad = res.costo_unitario !== undefined ? res.costo_unitario : costoPorPaquete;
          const precioFinal = res.precio_venta !== undefined ? res.precio_venta : (pVentaFinal || '—');

          setMensajeExito(
            `✅ Ingreso registrado: ${res.producto || prodLimpio} | Stock nuevo: ${stockNuevo} u. | Costo unitario: $${costoUnidad} | Precio venta: $${precioFinal}`
          );

          // Recargar el caché de almacén desde el servidor (nunca modificar el stock en pantalla)
          if (typeof fetchControlStock === 'function') fetchControlStock().catch(() => {});
          if (typeof fetchPanelCostos === 'function') fetchPanelCostos().catch(() => {});

          setTimeout(() => {
            onSuccess();
          }, 2000);
        } else {
          // Si error: mostrar el texto legible del servidor y NO limpiar el formulario
          setMensajeError(res?.error || 'No se pudo registrar el ingreso en Almacén.');
        }
      } catch (err) {
        setMensajeError(err.message || 'Error de red al registrar el ingreso.');
      } finally {
        setGuardando(false);
      }
      return;
    }

    // ── FLUJO VERDURAS / FRUTAS (POR KG O UNIDAD MANUAL) ─────────────────────
    if (cantidadTotalNeta <= 0) {
      setMensajeError('La cantidad neta debe ser mayor a 0.');
      return;
    }
    if (costoTotalNum <= 0) {
      setMensajeError('Ingresá un costo total válido en pesos.');
      return;
    }

    setGuardando(true);
    try {
      const res = await apiCrearIngreso({
        producto: prodLimpio,
        proveedor: proveedor.trim() || 'Sin especificar',
        proveedor_tel: proveedorTel.trim() || undefined,
        kg_netos: cantidadTotalNeta,
        costo_total: costoTotalNum,
        cajones: (unidadActiva === 'kg' && cajones.length > 0) ? cajones : undefined,
        categoria: esProductoNuevo ? categoria : undefined,
        unidad: esProductoNuevo ? unidadActiva : undefined,
      });

      if (res && res.ok) {
        const stockActualizado = res.stock_ahora !== undefined ? res.stock_ahora : 'actualizado';
        setMensajeExito(`¡Se sumaron ${cantidadTotalNeta} ${unidadActiva} a ${prodLimpio}! Costo: $${costoPorUnidad} por ${unidadActiva}. Stock ahora: ${stockActualizado}.`);
        setTimeout(() => {
          onSuccess();
        }, 1800);
      } else {
        setMensajeError(res?.error || 'No se pudo guardar la compra en Google Sheets.');
      }
    } catch (err) {
      setMensajeError(err.message || 'Error de red al guardar la compra.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-[#121212] border border-gray-800 rounded-3xl w-full max-w-2xl p-5 sm:p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 my-8">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <h2 className="text-base font-black uppercase tracking-wider text-green-400 flex items-center gap-2">
            <Plus size={18} /> Nueva Compra / Ingreso
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleGuardar} className="space-y-4">
          {/* Selector de Categoría Principal */}
          <div>
            <label className="block text-xs font-bold uppercase text-gray-400 mb-1.5">
              Categoría *
            </label>
            <div className="grid grid-cols-4 gap-2">
              {['Verduras', 'Frutas', 'Almacén', 'Otros'].map((cat) => {
                const seleccionada = categoria === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleCambiarCategoria(cat)}
                    className={`py-2 px-2 sm:px-3 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
                      seleccionada
                        ? 'bg-green-500 text-black shadow-md shadow-green-500/20'
                        : 'bg-black/40 text-gray-400 hover:text-white border border-gray-800'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Producto */}
          <div>
            <label className="block text-xs font-bold uppercase text-gray-400 mb-1 flex items-center justify-between">
              <span>Producto *</span>
              {eanMatch && (
                <span className="text-[10px] text-amber-400 font-bold flex items-center gap-1">
                  <Lock size={11} /> Existente en Almacén (solo lectura)
                </span>
              )}
            </label>
            <input
              type="text"
              placeholder={esAlmacen ? "Ej: Harina 0000 Marolio, Fideos Matarazzo..." : "Ej: Tomate Redondo, Banana, Papa..."}
              value={producto}
              onChange={(e) => setProducto(e.target.value)}
              readOnly={Boolean(eanMatch)}
              className={`w-full bg-black/60 border rounded-xl px-4 py-2.5 text-sm font-bold outline-none transition-colors ${
                eanMatch
                  ? 'border-gray-800 text-gray-300 bg-gray-900/50 cursor-not-allowed'
                  : 'border-gray-700 focus:border-green-500 text-white'
              }`}
              required
            />

            {/* Aviso de stock y costo actual para producto existente escaneado */}
            {eanMatch && (
              <div className="mt-2 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs flex items-center justify-between">
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase font-bold">Stock Actual en Almacén</span>
                  <span className="text-amber-300 font-mono font-bold text-sm">{eanMatch.stockActual} unidades</span>
                </div>
                <div className="text-right">
                  <span className="text-gray-400 block text-[10px] uppercase font-bold">Costo Unitario Actual</span>
                  <span className="text-amber-300 font-mono font-bold text-sm">$ {Number(eanMatch.costoActual || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            )}

            {/* Campos inline para producto nuevo no almacén */}
            {esProductoNuevo && !esAlmacen && (
              <div className="mt-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 space-y-2">
                <p className="text-xs font-bold flex items-center gap-1.5">
                  <AlertTriangle size={14} /> El producto no existe en el catálogo. Se creará automáticamente:
                </p>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Unidad</label>
                  <select
                    value={unidadNueva}
                    onChange={(e) => setUnidadNueva(e.target.value)}
                    className="w-full bg-black border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                  >
                    <option value="kg">kg (peso)</option>
                    <option value="un">un (unidad)</option>
                    <option value="atado">atado</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Marca y Subcategoría (Almacén nuevo) */}
          {esAlmacen && !eanMatch && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase text-gray-400 mb-1">
                  Marca (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Marolio, Arcor, La Serenísima..."
                  value={marca}
                  onChange={(e) => setMarca(e.target.value)}
                  className="w-full bg-black/60 border border-gray-700 focus:border-green-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-gray-400 mb-1">
                  Subcategoría (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Almacén, Conservas, Lácteos..."
                  value={subcategoria}
                  onChange={(e) => setSubcategoria(e.target.value)}
                  className="w-full bg-black/60 border border-gray-700 focus:border-green-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>
            </div>
          )}

          {/* Costo Total Pagado y (si es Almacén) Código de barras EAN */}
          <div className={`grid ${esAlmacen ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'} gap-3`}>
            <div>
              <label className="block text-xs font-bold uppercase text-gray-400 mb-1">
                Costo Total Pagado ($) *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2 text-gray-500 font-bold">$</span>
                <input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={costoTotal}
                  onChange={(e) => setCostoTotal(e.target.value)}
                  className="w-full bg-black/60 border border-gray-700 focus:border-green-500 rounded-xl pl-8 pr-4 py-2 text-sm font-mono font-bold text-white outline-none"
                  required
                />
              </div>
            </div>

            {esAlmacen && (
              <div>
                <label className="block text-xs font-bold uppercase text-gray-400 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-amber-300">
                    <Barcode size={14} /> Código de barras (EAN) *
                  </span>
                  {eanMatch && (
                    <span className="text-[10px] text-green-400 font-semibold truncate max-w-[150px]">
                      ✓ {eanMatch.nombre}
                    </span>
                  )}
                </label>
                <input
                  ref={eanInputRef}
                  type="text"
                  placeholder="Escanear o tipear EAN..."
                  value={ean}
                  onChange={(e) => handleEanChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      cantidadInputRef.current?.focus();
                    }
                  }}
                  className="w-full bg-black/60 border border-amber-500/50 focus:border-amber-400 rounded-xl px-4 py-2 text-sm font-mono font-bold text-white outline-none"
                  required={esAlmacen}
                />
              </div>
            )}
          </div>

          {/* Sección de Cantidad: Almacén (Paquetes enteros) vs Pesables / Cajones */}
          {esAlmacen ? (
            <div className="bg-[#181818] border border-gray-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
                  <Package size={14} className="text-amber-400" /> Cantidad Comprada (Paquetes / Unidades) *
                </span>
                <span className="text-[11px] text-gray-500 font-semibold">Entero &gt; 0</span>
              </div>

              <div>
                <input
                  ref={cantidadInputRef}
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Ej: 6, 12, 24..."
                  value={unidades}
                  onChange={(e) => setUnidades(e.target.value)}
                  className="w-full bg-black border border-gray-700 focus:border-green-500 rounded-xl px-3.5 py-2 text-sm font-mono font-bold text-white outline-none"
                  required={esAlmacen}
                />
              </div>

              {/* Resumen en vivo de costos y márgenes */}
              <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-gray-800 text-center">
                <div className="bg-black/60 p-2.5 rounded-xl border border-gray-800">
                  <span className="text-[10px] text-gray-400 uppercase font-bold block mb-0.5">Costo / Paquete</span>
                  <span className="text-sm font-mono font-black text-amber-300">
                    ${costoPorPaquete.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="bg-black/60 p-2.5 rounded-xl border border-gray-800">
                  <label className="text-[10px] text-gray-400 uppercase font-bold block mb-0.5">Margen %</label>
                  <div className="flex items-center justify-center gap-1">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="500"
                      value={margenPct}
                      onChange={(e) => {
                        setMargenPct(e.target.value);
                        setMargenManualModificado(true);
                        setPrecioVentaManualModificado(false);
                      }}
                      className="w-14 bg-black border border-gray-700 rounded-lg px-1.5 py-0.5 text-xs font-mono font-bold text-white text-center outline-none focus:border-green-500"
                    />
                    <span className="text-[11px] text-gray-400">%</span>
                  </div>
                </div>

                <div className="bg-black/60 p-2.5 rounded-xl border border-gray-800">
                  <span className="text-[10px] text-gray-400 uppercase font-bold block mb-0.5">Precio Sugerido</span>
                  <span className="text-sm font-mono font-black text-green-400">
                    ${precioVentaSugerido.toLocaleString('es-AR')}
                  </span>
                </div>
              </div>

              {/* Campo Precio de Venta editable */}
              <div className="pt-1">
                <label className="block text-xs font-bold uppercase text-gray-400 mb-1 flex items-center justify-between">
                  <span>Precio de Venta ($) *</span>
                  <span className="text-[10px] text-gray-500">Editable antes de guardar</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2 text-gray-500 font-bold">$</span>
                  <input
                    type="number"
                    step="1"
                    placeholder={precioVentaSugerido ? String(precioVentaSugerido) : '0'}
                    value={precioVenta}
                    onChange={(e) => {
                      setPrecioVenta(e.target.value);
                      setPrecioVentaManualModificado(true);
                    }}
                    className="w-full bg-black/60 border border-gray-700 focus:border-green-500 rounded-xl pl-8 pr-4 py-2 text-sm font-mono font-bold text-white outline-none"
                    required={esAlmacen}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-[#181818] border border-gray-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
                  <Scale size={14} className="text-amber-400" /> Cantidad Comprada ({unidadActiva})
                </span>
                {unidadActiva === 'kg' && (
                  <button
                    type="button"
                    onClick={() => setModoManual(!modoManual)}
                    className="text-[11px] text-gray-400 hover:text-white underline font-semibold cursor-pointer"
                  >
                    {modoManual ? '← Pesar por cajón' : 'Escribir total directo'}
                  </button>
                )}
              </div>

              {unidadActiva !== 'kg' || modoManual ? (
                <div>
                  <input
                    type="number"
                    step={unidadActiva === 'kg' ? '0.001' : '1'}
                    placeholder={`Cantidad en ${unidadActiva}...`}
                    value={kgNetosManual}
                    onChange={(e) => setKgNetosManual(e.target.value)}
                    className="w-full bg-black border border-gray-700 focus:border-green-500 rounded-xl px-3.5 py-2 text-sm font-mono font-bold text-white outline-none"
                  />
                </div>
              ) : (
                <>
                  {/* Balanza Systel */}
                  <div className="flex items-center justify-between gap-2 bg-black/40 border border-gray-800 p-2.5 rounded-xl">
                    <button
                      type="button"
                      onClick={toggleBalanza}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        balanzaConectada
                          ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                          : 'bg-green-500/10 text-green-400 border border-green-500/30'
                      }`}
                    >
                      <Scale size={13} />
                      {balanzaConectando ? 'Conectando...' : balanzaConectada ? 'Desconectar Balanza' : 'Conectar Balanza Systel'}
                    </button>

                    {balanzaConectada && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-amber-300">
                          {balanzaPesoVivo !== null ? `${balanzaPesoVivo.toFixed(3)} kg` : '0.000 kg'}
                        </span>
                        <button
                          type="button"
                          onClick={agregarCajonDesdeBalanza}
                          className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-black text-xs font-black rounded-lg cursor-pointer"
                        >
                          Pesar Cajón (-{taraKg}kg tara)
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Input manual de cajón */}
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.001"
                      placeholder="Peso neto de cajón (kg)..."
                      value={pesoManualCajon}
                      onChange={(e) => setPesoManualCajon(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          agregarCajonManual();
                        }
                      }}
                      className="flex-1 bg-black/60 border border-gray-700 focus:border-green-500 rounded-xl px-3 py-1.5 text-xs font-mono text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={agregarCajonManual}
                      className="bg-gray-800 hover:bg-gray-700 text-white font-bold text-xs px-3 py-1.5 rounded-xl cursor-pointer"
                    >
                      + Cajón
                    </button>
                  </div>

                  {/* Lista de cajones */}
                  {cajones.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                      {cajones.map((peso, idx) => (
                        <span key={idx} className="bg-black border border-gray-800 px-2 py-0.5 rounded text-[11px] font-mono text-amber-300 flex items-center gap-1.5">
                          #{idx + 1}: {peso}kg
                          <button type="button" onClick={() => setCajones(cajones.filter((_, i) => i !== idx))} className="text-gray-500 hover:text-red-400">
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Resumen en vivo para pesables */}
          {!esAlmacen && (
            <div className="bg-black/50 border border-gray-800/80 rounded-2xl p-3 flex items-center justify-around text-center">
              <div>
                <span className="text-[10px] text-gray-500 uppercase block">Cantidad Neta</span>
                <span className="text-lg font-mono font-black text-white">
                  {cantidadTotalNeta} <span className="text-xs text-gray-400">{unidadActiva}</span>
                </span>
              </div>
              <div className="h-8 w-px bg-gray-800" />
              <div>
                <span className="text-[10px] text-gray-500 uppercase block">Costo / {unidadActiva}</span>
                <span className="text-lg font-mono font-black text-green-400">
                  ${costoPorUnidad}
                </span>
              </div>
            </div>
          )}

          {/* Proveedor y Teléfono (opcionales) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase text-gray-400 mb-1">
                Proveedor (opcional)
              </label>
              <input
                type="text"
                placeholder="Ej: Distribuidora Central, Don Pedro..."
                value={proveedor}
                onChange={(e) => {
                  setProveedor(e.target.value);
                  const pMatch = proveedoresLista.find(pv => norm(pv.nombre || pv) === norm(e.target.value));
                  if (pMatch && pMatch.telefono) setProveedorTel(pMatch.telefono);
                }}
                className="w-full bg-black/60 border border-gray-700 focus:border-green-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-gray-400 mb-1">
                Teléfono Proveedor (opcional)
              </label>
              <input
                type="text"
                placeholder="Ej: 11 4455-6677"
                value={proveedorTel}
                onChange={(e) => setProveedorTel(e.target.value)}
                className="w-full bg-black/60 border border-gray-700 focus:border-green-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
              />
            </div>
          </div>

          {mensajeError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
              {mensajeError}
            </div>
          )}

          {mensajeExito && (
            <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-300 text-xs">
              {mensajeExito}
            </div>
          )}

          <button
            type="submit"
            disabled={guardando}
            className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-black text-xs uppercase tracking-wider py-3 rounded-xl transition-all shadow-lg shadow-green-500/20 cursor-pointer flex items-center justify-center gap-1.5"
          >
            {guardando ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Guardando en Google Sheets...</span>
              </>
            ) : (
              <>
                <Check size={16} />
                <span>{esAlmacen ? 'Registrar Ingreso en Almacén' : (esProductoNuevo ? 'Guardar compra y crear producto' : 'Registrar Compra')}</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: MODAL SALIDA (MERMA & CORRECCIÓN DE STOCK CON BALANZA SYSTEL)
// ─────────────────────────────────────────────────────────────────────────────
function ModalSalida({ productosExistentes, taraKg, onClose, onSuccess, ejecutarConAdminPin }) {
  const [tipoSalida, setTipoSalida] = useState('MERMA'); // 'MERMA' | 'AJUSTE'
  const balanza = useBalanzaSystel();

  // Producto activo seleccionado para pesar o ingresar
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [eanEscaneado, setEanEscaneado] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [chipCat, setChipCat] = useState('Todos');

  // Modo manual alternativo o productos enteros
  const [modoManual, setModoManual] = useState(false);
  const [cantidadManual, setCantidadManual] = useState('');

  // Tara (descontar tara activada por defecto)
  const [descontarTara, setDescontarTara] = useState(true);
  const taraValor = Number(taraKg) || 0;

  // Lista de items a dar de baja
  const [itemsSalida, setItemsSalida] = useState([]);

  // Motivo para merma
  const [motivoRapido, setMotivoRapido] = useState('Podrido');
  const [notaPersonalizada, setNotaPersonalizada] = useState('');

  // Estados de envío
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState(null);

  // Filtrado de productos disponibles
  const productosFiltrados = useMemo(() => {
    return productosExistentes.filter(p => {
      const catNorm = norm(p.categoria || '');
      if (chipCat === 'Verdura' && !catNorm.includes('verdura')) return false;
      if (chipCat === 'Fruta' && !catNorm.includes('fruta')) return false;
      if (chipCat === 'Almacén' && !catNorm.includes('almacen')) return false;
      if (chipCat === 'Otros' && (catNorm.includes('verdura') || catNorm.includes('fruta') || catNorm.includes('almacen'))) return false;

      if (busqueda.trim()) {
        const q = norm(busqueda);
        const prod = norm(p.producto || p.nombre || '');
        const marca = norm(p.marca || '');
        const ean = String(p.ean || p.codigo_ean || p.barcode || '').trim();
        return prod.includes(q) || marca.includes(q) || ean.includes(q);
      }
      return true;
    });
  }, [productosExistentes, chipCat, busqueda]);

  // Selección de producto para pesar o ingresar
  const handleSeleccionarProducto = (p, eanCode = null) => {
    setProductoSeleccionado(p);
    setEanEscaneado(eanCode || p.ean || p.barcode || null);
    const tipo = determinarTipoCaptura(p, productosExistentes);
    if (tipo === TIPOS_CAPTURA.PESABLE) {
      setModoManual(false);
      setCantidadManual('');
    } else {
      // Para productos por unidad o atado (sin balanza) o Almacén EAN: entrada entera
      setModoManual(true);
      setCantidadManual('1');
    }
  };

  // Tipo de captura del producto seleccionado
  const analisisCaptura = useMemo(() => {
    if (!productoSeleccionado) return null;
    return analizarTipoCaptura(productoSeleccionado, productosExistentes);
  }, [productoSeleccionado, productosExistentes]);

  const tipoCaptura = analisisCaptura?.tipo || null;
  const deducidoPorNombre = Boolean(analisisCaptura?.deducidoPorNombre);

  const esPesable = tipoCaptura === TIPOS_CAPTURA.PESABLE;
  const esUnidadManual = tipoCaptura === TIPOS_CAPTURA.UNIDAD_MANUAL;
  const esAlmacenEan = tipoCaptura === TIPOS_CAPTURA.ALMACEN_EAN;

  // Cálculos de pesaje vivo
  const esUnidadKg = esPesable;
  const pesoBruto = balanza.pesoVivo !== null ? Number(balanza.pesoVivo) : 0;
  const pesoNeto = descontarTara && taraValor > 0
    ? Math.max(0, Number((pesoBruto - taraValor).toFixed(3)))
    : Number(pesoBruto.toFixed(3));

  // Validación OK: habilitado solo con peso estable y mayor a 0 si es balanza
  const pesoValidoBalanza = balanza.conectado && balanza.esEstable && pesoNeto > 0;
  const cantManualNum = modoManual
    ? (esUnidadKg ? parseFloat(cantidadManual) || 0 : parseInt(cantidadManual, 10) || 0)
    : 0;
  const manualValido = modoManual && cantManualNum > 0;

  const okHabilitado = esUnidadKg ? (!modoManual ? pesoValidoBalanza : manualValido) : manualValido;

  // Acción del botón OK
  const handleConfirmarLinea = () => {
    if (!productoSeleccionado || !okHabilitado) return;

    const cantidadTomada = esUnidadKg
      ? (!modoManual ? pesoNeto : cantManualNum)
      : cantManualNum;

    const stockActual = Number(productoSeleccionado.en_deposito || 0);
    const costoUnit = Number(productoSeleccionado.costo_kg_ultimo || 0);

    if (tipoSalida === 'MERMA') {
      const stockResultante = Number(Math.max(0, stockActual - cantidadTomada).toFixed(3));
      const valorCosto = Number((cantidadTomada * costoUnit).toFixed(2));

      setItemsSalida(prev => [
        ...prev.filter(it => it.producto !== productoSeleccionado.producto),
        {
          producto: productoSeleccionado.producto,
          unidad: productoSeleccionado.unidad || (esPesable ? 'kg' : 'un'),
          tipoCaptura: tipoCaptura,
          cantidad: cantidadTomada,
          ...(esAlmacenEan
            ? {
                unidades: Math.round(cantidadTomada),
                ean: eanEscaneado || productoSeleccionado.ean || productoSeleccionado.barcode || null,
              }
            : {
                kg: cantidadTomada,
              }
          ),
          costo_unitario: costoUnit,
          stock_actual: stockActual,
          stock_resultante: stockResultante,
          valor_costo: valorCosto,
          modoPesaje: !modoManual ? 'balanza' : 'manual',
          taraDescontada: !modoManual && descontarTara ? taraValor : 0,
        }
      ]);
    } else {
      // AJUSTE: cantidadTomada es el stock real contado
      const stockReal = cantidadTomada;
      const dif = Number((stockReal - stockActual).toFixed(3));
      const stockResultante = stockReal;
      const valorCosto = Number((Math.abs(dif) * costoUnit).toFixed(2));

      setItemsSalida(prev => [
        ...prev.filter(it => it.producto !== productoSeleccionado.producto),
        {
          producto: productoSeleccionado.producto,
          unidad: productoSeleccionado.unidad || (esPesable ? 'kg' : 'un'),
          tipoCaptura: tipoCaptura,
          cantidad: cantidadTomada,
          kg: cantidadTomada,
          stock_real: stockReal,
          dif: dif,
          costo_unitario: costoUnit,
          stock_actual: stockActual,
          stock_resultante: stockResultante,
          valor_costo: valorCosto,
          modoPesaje: !modoManual ? 'balanza' : 'manual',
          taraDescontada: !modoManual && descontarTara ? taraValor : 0,
        }
      ]);
    }

    // Limpiar para pesar el siguiente producto
    setProductoSeleccionado(null);
    setEanEscaneado(null);
    setCantidadManual('');
    setBusqueda('');
  };

  const eliminarItem = (idx) => {
    setItemsSalida(itemsSalida.filter((_, i) => i !== idx));
  };

  // Valor total al costo
  const valorTotalCosto = useMemo(() => {
    return itemsSalida.reduce((acc, it) => acc + (Number(it.valor_costo) || 0), 0);
  }, [itemsSalida]);

  // Enviar salida con validación de admin_pin
  const handleAplicar = () => {
    if (itemsSalida.length === 0) {
      alert('Agregá al menos un producto a la lista de salida.');
      return;
    }

    ejecutarConAdminPin(async (adminPin) => {
      setEnviando(true);
      setErrorEnvio(null);

      let payloadItems = [];
      let notaFinal = '';

      if (tipoSalida === 'MERMA') {
        // Formato exacto v19 del servidor:
        // - Almacén por unidad (con código de barras): { producto, unidades, ean }
        // - Kilos o verduras por unidad o atado (choclo, perejil, etc.): { producto, kg }
        payloadItems = itemsSalida.map(it => {
          const esAlmacen = it.tipoCaptura === TIPOS_CAPTURA.ALMACEN_EAN || Boolean(it.ean);
          if (esAlmacen) {
            return {
              producto: it.producto,
              unidades: Math.round(Number(it.unidades != null ? it.unidades : it.cantidad) || 0),
              ...(it.ean ? { ean: String(it.ean).trim() } : {})
            };
          } else {
            return {
              producto: it.producto,
              kg: Number(it.kg != null ? it.kg : (it.cantidad != null ? it.cantidad : 0)) || 0
            };
          }
        });
        notaFinal = notaPersonalizada.trim() ? `${motivoRapido} - ${notaPersonalizada.trim()}` : motivoRapido;
      } else {
        // AJUSTE: diferencia calculada (stock_real - stock_actual) en kilos
        payloadItems = itemsSalida.map(it => ({
          producto: it.producto,
          kg: Number(it.dif != null ? it.dif : (Number(it.stock_real || 0) - Number(it.stock_actual || 0)).toFixed(3))
        }));
        notaFinal = 'Conteo';
      }

      try {
        const res = await apiRegistrarSalidas({
          tipo: tipoSalida,
          items: payloadItems,
          nota: notaFinal,
          admin_pin: adminPin
        });

        if (res && res.ok) {
          onSuccess();
        } else {
          if (res?.error && res.error.toLowerCase().includes('pin')) {
            clearAdminPinSession();
          }
          setErrorEnvio(res?.error || 'El servidor rechazó la salida.');
        }
      } catch (err) {
        setErrorEnvio(err.message || 'Error de red al registrar la salida.');
      } finally {
        setEnviando(false);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-[#121212] border border-gray-800 rounded-3xl w-full max-w-2xl p-5 sm:p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 my-8">
        {/* Cabecera del Modal */}
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <div>
            <h2 className="text-base font-black uppercase tracking-wider text-amber-400 flex items-center gap-2">
              {tipoSalida === 'MERMA' ? <Minus size={18} /> : <Scale size={18} className="text-blue-400" />}
              {tipoSalida === 'MERMA' ? 'Registrar Merma de Stock' : 'Corregir Stock (Conteo Físico)'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {tipoSalida === 'MERMA'
                ? 'Pesá los productos deteriorados o merma en la balanza Systel'
                : 'Pesá o verificá el stock real que hay físicamente en inventario'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Selector de Tipo (Merma / Corregir Stock) */}
        <div className="flex items-center justify-between gap-3 bg-black/50 p-1.5 rounded-2xl border border-gray-800">
          <div className="flex gap-2 w-full">
            <button
              type="button"
              onClick={() => {
                setTipoSalida('MERMA');
                setProductoSeleccionado(null);
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                tipoSalida === 'MERMA'
                  ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/40'
              }`}
            >
              <Minus size={14} /> Merma / Desperdicio
            </button>
            <button
              type="button"
              onClick={() => {
                setTipoSalida('AJUSTE');
                setProductoSeleccionado(null);
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                tipoSalida === 'AJUSTE'
                  ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/40'
              }`}
            >
              <Scale size={14} /> Corregir Stock (Conteo)
            </button>
          </div>
        </div>

        {/* Motivo de Merma (solo visible si tipo es MERMA) */}
        {tipoSalida === 'MERMA' && (
          <div className="space-y-2 bg-black/30 p-3 rounded-2xl border border-gray-800/60">
            <label className="block text-[11px] font-bold uppercase text-gray-400">Motivo de Merma</label>
            <div className="flex flex-wrap gap-2">
              {['Podrido', 'Golpeado', 'Regalo', 'Otro'].map(mot => (
                <button
                  type="button"
                  key={mot}
                  onClick={() => setMotivoRapido(mot)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                    motivoRapido === mot
                      ? 'bg-amber-400 text-black shadow-sm'
                      : 'bg-black border border-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {mot}
                </button>
              ))}
            </div>
            {motivoRapido === 'Otro' && (
              <input
                type="text"
                placeholder="Aclaración del motivo de merma..."
                value={notaPersonalizada}
                onChange={(e) => setNotaPersonalizada(e.target.value)}
                className="w-full bg-black border border-gray-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-amber-400 mt-2"
              />
            )}
          </div>
        )}

        {/* ── PASO 1: ELEGIR PRODUCTO ───────────────────────────────────────── */}
        {!productoSeleccionado ? (
          <div className="space-y-2.5 bg-black/40 p-3.5 rounded-2xl border border-gray-800">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-black uppercase tracking-wider text-amber-300">
                1. Elegir Producto a {tipoSalida === 'MERMA' ? 'mermar' : 'contar'}
              </label>
              <span className="text-[10px] text-gray-400">Buscá y hacé clic en el producto</span>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-2.5 text-gray-500" />
                <input
                  type="text"
                  placeholder="Escribí el nombre o escaneá código EAN..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const code = (busqueda || '').trim();
                      if (!code) return;
                      const eanMap = getEanMapping();
                      const eanInfo = eanMap[code.toUpperCase()];
                      let match = null;
                      if (eanInfo && eanInfo.nombre) {
                        match = productosExistentes.find(p => norm(p.producto) === norm(eanInfo.nombre) || norm(p.nombre) === norm(eanInfo.nombre));
                      }
                      if (!match) {
                        match = productosExistentes.find(p => {
                          const eanStr = String(p.ean || p.barcode || p.codigo_ean || '').trim();
                          if (eanStr && eanStr === code) return true;
                          const nom = norm(p.producto || p.nombre || '');
                          const mar = norm(p.marca || '');
                          const cod = norm(code);
                          return nom === cod || nom.includes(cod) || mar.includes(cod);
                        });
                      }

                      if (match) {
                        const tipo = determinarTipoCaptura(match, productosExistentes);
                        if (productoSeleccionado && match.producto === productoSeleccionado.producto && tipo === TIPOS_CAPTURA.ALMACEN_EAN) {
                          setCantidadManual(prev => String((parseInt(prev, 10) || 1) + 1));
                          setEanEscaneado(code);
                          setBusqueda('');
                          return;
                        }
                        handleSeleccionarProducto(match, code);
                        setBusqueda('');
                        return;
                      }
                      if (productosFiltrados.length === 1) {
                        handleSeleccionarProducto(productosFiltrados[0], code);
                        setBusqueda('');
                      }
                    }
                  }}
                  autoFocus
                  className="w-full bg-black border border-gray-700 focus:border-amber-400 rounded-xl pl-9 pr-3 py-2 text-xs text-white outline-none"
                />
              </div>
              <div className="flex gap-1 overflow-x-auto">
                {['Todos', 'Verdura', 'Fruta', 'Almacén'].map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setChipCat(c)}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-bold cursor-pointer transition-all whitespace-nowrap ${
                      chipCat === c ? 'bg-amber-400 text-black' : 'bg-black text-gray-400 border border-gray-800 hover:text-white'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Cuadrícula / lista rápida de resultados */}
            <div className="max-h-44 overflow-y-auto bg-black/80 border border-gray-800/80 rounded-xl p-1.5 divide-y divide-gray-850">
              {productosFiltrados.slice(0, 8).map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSeleccionarProducto(p)}
                  className="w-full px-3 py-2 text-left text-xs text-gray-200 hover:bg-amber-500/15 rounded-lg flex items-center justify-between cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{p.producto}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300">
                      {p.unidad || 'kg'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-gray-400 font-mono">
                      Stock: <strong className="text-gray-200">{p.en_deposito}</strong> {p.unidad}
                    </span>
                    <span className="text-[10px] text-emerald-400 font-mono">
                      $${p.costo_kg_ultimo || 0}/{p.unidad}
                    </span>
                  </div>
                </button>
              ))}
              {productosFiltrados.length === 0 && (
                <div className="py-4 text-center text-xs text-gray-500">
                  No se encontraron productos coincidentes.
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── PASO 2 & 3: BLOQUE GRANDE CON PESO EN VIVO Y CONFIRMACIÓN ────── */
          <div className="space-y-3 bg-black/60 p-4 rounded-2xl border-2 border-amber-500/40 animate-in fade-in">
            {/* Header del producto seleccionado */}
            <div className="flex items-center justify-between border-b border-gray-800 pb-2.5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Producto elegido
                  </span>
                  <h3 className="text-base font-black text-white">{productoSeleccionado.producto}</h3>
                  <span className="text-xs text-gray-400 font-mono">({productoSeleccionado.unidad || 'kg'})</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5 font-mono">
                  Stock actual en sistema: <strong className="text-gray-200">{productoSeleccionado.en_deposito} {productoSeleccionado.unidad}</strong> · Costo: <strong className="text-emerald-400">$${productoSeleccionado.costo_kg_ultimo || 0}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProductoSeleccionado(null)}
                className="text-xs text-gray-400 hover:text-white px-2.5 py-1 rounded-lg border border-gray-700 bg-gray-900 cursor-pointer"
              >
                ✕ Cambiar
              </button>
            </div>

            {/* Aviso si el tipo fue deducido por nombre */}
            {deducidoPorNombre && (
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-center gap-2">
                <span>⚠️</span>
                <span>Tipo deducido por nombre: revisar la unidad en el catálogo</span>
              </div>
            )}

            {/* Para productos por peso (kg) que usan Balanza */}
            {esUnidadKg && !modoManual ? (
              <div className="space-y-3">
                {/* Bloque Balanza Systel */}
                <div className="bg-black border border-gray-800 rounded-2xl p-4 text-center space-y-3">
                  {/* Estado de conexión de balanza */}
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${balanza.conectado ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`} />
                      <span className={`font-bold ${balanza.conectado ? 'text-green-400' : 'text-gray-400'}`}>
                        {balanza.conectando
                          ? 'Conectando balanza...'
                          : balanza.conectado
                          ? 'Balanza Systel Conectada'
                          : 'Balanza Desconectada'}
                      </span>
                    </div>

                    {balanza.conectado && (
                      <div>
                        {balanza.esEstable && pesoNeto > 0 ? (
                          <span className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                            <CheckCircle2 size={12} /> Peso Estable
                          </span>
                        ) : pesoBruto > 0 ? (
                          <span className="bg-amber-500/20 border border-amber-500/40 text-amber-300 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 animate-pulse">
                            <RefreshCw size={11} className="animate-spin" /> Estabilizando...
                          </span>
                        ) : (
                          <span className="bg-gray-800 text-gray-400 px-2.5 py-0.5 rounded-full text-[10px]">
                            En Cero (0.000 kg)
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* PESO EN VIVO GIGANTE */}
                  {!balanza.conectado ? (
                    <div className="py-4 space-y-3">
                      <p className="text-xs text-gray-400">
                        Conectá la balanza Systel vía USB/Serial para tomar el peso en vivo automáticamente:
                      </p>
                      <button
                        type="button"
                        onClick={() => balanza.conectar()}
                        disabled={balanza.conectando}
                        className="bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-emerald-500/20 cursor-pointer flex items-center justify-center gap-2 mx-auto"
                      >
                        <Scale size={16} />
                        <span>{balanza.conectando ? 'Conectando...' : 'Conectar Balanza Systel'}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="py-2">
                      <div className="flex items-baseline justify-center gap-2">
                        <span className={`font-mono font-black text-5xl sm:text-6xl tracking-tight transition-colors ${
                          balanza.esEstable && pesoNeto > 0 ? 'text-emerald-400' : 'text-amber-400'
                        }`}>
                          {pesoNeto.toFixed(3)}
                        </span>
                        <span className="text-xl font-black text-gray-400">kg</span>
                      </div>

                      {/* Info de tara y bruto */}
                      {descontarTara && taraValor > 0 && (
                        <p className="text-[11px] text-gray-400 font-mono mt-1">
                          Bruto: {pesoBruto.toFixed(3)} kg − Tara: {taraValor.toFixed(3)} kg
                        </p>
                      )}
                    </div>
                  )}

                  {/* Casilla de Tara (activada por defecto) */}
                  <div className="flex items-center justify-center gap-2 pt-2 border-t border-gray-800/80">
                    <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={descontarTara}
                        onChange={(e) => setDescontarTara(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-700 bg-gray-900 text-amber-500 focus:ring-amber-400 cursor-pointer"
                      />
                      <span>
                        Descontar tara <strong>({taraValor} kg)</strong>
                      </span>
                    </label>
                  </div>
                </div>

                {/* Preview del stock resultante */}
                <div className="bg-black/40 border border-gray-800 px-3 py-2 rounded-xl text-xs flex items-center justify-between">
                  <span className="text-gray-400">
                    {tipoSalida === 'MERMA' ? 'Stock resultante:' : 'Corrección a aplicar:'}
                  </span>
                  <span className="font-mono font-bold text-gray-200">
                    {tipoSalida === 'MERMA' ? (
                      <>
                        {productoSeleccionado.en_deposito} kg →{' '}
                        <strong className="text-amber-300">
                          {Math.max(0, Number(productoSeleccionado.en_deposito || 0) - pesoNeto).toFixed(3)} kg
                        </strong>
                      </>
                    ) : (
                      <>
                        {productoSeleccionado.en_deposito} kg →{' '}
                        <strong className="text-blue-300">{pesoNeto.toFixed(3)} kg</strong>{' '}
                        <span className="text-[10px] text-gray-400">
                          (Dif: {(pesoNeto - Number(productoSeleccionado.en_deposito || 0)).toFixed(3)} kg)
                        </span>
                      </>
                    )}
                  </span>
                </div>

                {/* BOTÓN GRANDE OK */}
                <button
                  type="button"
                  onClick={handleConfirmarLinea}
                  disabled={!okHabilitado}
                  className={`w-full py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-xl cursor-pointer ${
                    okHabilitado
                      ? tipoSalida === 'MERMA'
                        ? 'bg-amber-400 hover:bg-amber-300 text-black shadow-amber-400/25 scale-[1.01]'
                        : 'bg-blue-500 hover:bg-blue-400 text-white shadow-blue-500/25 scale-[1.01]'
                      : 'bg-gray-800/80 text-gray-500 cursor-not-allowed border border-gray-700/60'
                  }`}
                >
                  <Check size={18} />
                  <span>
                    {balanza.conectado
                      ? okHabilitado
                        ? tipoSalida === 'MERMA'
                          ? `OK — Tomar ${pesoNeto.toFixed(3)} kg como Merma`
                          : `OK — Tomar ${pesoNeto.toFixed(3)} kg como Stock Real`
                        : !balanza.esEstable
                        ? 'Esperando peso estable en balanza...'
                        : 'Colocá el producto en la balanza (> 0 kg)'
                      : 'Conectá la balanza o ingresá a mano'}
                  </span>
                </button>

                {/* Alternativa: escribir a mano */}
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setModoManual(true);
                      setCantidadManual(pesoNeto > 0 ? String(pesoNeto) : '');
                    }}
                    className="text-[11px] text-gray-500 hover:text-gray-300 underline cursor-pointer"
                  >
                    ✏️ Escribir cantidad a mano (sin balanza)
                  </button>
                </div>
              </div>
            ) : (
              /* Entrada Manual (para unidades o alternativa sin balanza) */
              <div className="space-y-3 bg-black/40 p-3.5 rounded-2xl border border-gray-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-300">
                    {esUnidadKg
                      ? tipoSalida === 'MERMA'
                        ? 'Ingresar peso de merma a mano (kg)'
                        : 'Ingresar stock real a mano (kg)'
                      : `Cantidad entera (${productoSeleccionado.unidad || 'unidades'})`}
                  </label>
                  {esUnidadKg && (
                    <button
                      type="button"
                      onClick={() => setModoManual(false)}
                      className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                    >
                      <Scale size={12} /> Volver a Balanza
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {!esUnidadKg && (
                    <button
                      type="button"
                      onClick={() => {
                        const actual = parseInt(cantidadManual, 10) || 1;
                        if (actual > 1) setCantidadManual(String(actual - 1));
                      }}
                      className="w-10 h-10 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-black text-sm flex items-center justify-center cursor-pointer"
                    >
                      −
                    </button>
                  )}

                  <input
                    type="number"
                    step={esUnidadKg ? '0.001' : '1'}
                    min={esUnidadKg ? '0.001' : '1'}
                    placeholder={esUnidadKg ? '0.000 kg' : 'Cantidad entera...'}
                    value={cantidadManual}
                    onChange={(e) => setCantidadManual(e.target.value)}
                    autoFocus
                    className="flex-1 bg-black border border-gray-700 focus:border-amber-400 rounded-xl px-3 py-2.5 text-center font-mono font-bold text-base text-white outline-none"
                  />

                  {!esUnidadKg && (
                    <button
                      type="button"
                      onClick={() => {
                        const actual = parseInt(cantidadManual, 10) || 0;
                        setCantidadManual(String(actual + 1));
                      }}
                      className="w-10 h-10 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-black text-sm flex items-center justify-center cursor-pointer"
                    >
                      +
                    </button>
                  )}
                </div>

                {/* BOTÓN OK MANUAL */}
                <button
                  type="button"
                  onClick={handleConfirmarLinea}
                  disabled={!okHabilitado}
                  className={`w-full py-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    okHabilitado
                      ? 'bg-amber-400 hover:bg-amber-300 text-black shadow-md'
                      : 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700'
                  }`}
                >
                  <Check size={16} />
                  <span>
                    OK — Agregar {cantManualNum > 0 ? `${cantManualNum} ${productoSeleccionado.unidad || 'kg'}` : ''} a la lista
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── PASO 5 & 7: LISTA DE PRODUCTOS ARMADA ─────────────────────────── */}
        <div className="space-y-2 border-t border-gray-800 pt-3">
          <div className="flex items-center justify-between">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Productos en la lista ({itemsSalida.length})
            </label>
            {itemsSalida.length > 0 && (
              <span className="text-[11px] text-gray-500">
                Podés seguir eligiendo productos arriba
              </span>
            )}
          </div>

          {itemsSalida.length === 0 ? (
            <div className="py-5 text-center text-xs text-gray-500 border border-dashed border-gray-800 rounded-2xl">
              Elegí un producto arriba para pesarlo y agregarlo a la lista.
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {itemsSalida.map((it, idx) => (
                <div key={idx} className="bg-black/60 border border-gray-800 rounded-xl p-3 flex items-center justify-between gap-3 text-xs">
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{it.producto}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-gray-800 text-gray-300 font-mono">
                        {it.modoPesaje === 'balanza' ? '⚖️ Balanza' : '✏️ Manual'}
                      </span>
                    </div>

                    {/* Línea de cantidad y costo */}
                    <div className="flex items-center gap-2 text-[11px]">
                      {tipoSalida === 'MERMA' ? (
                        <span className="font-mono font-bold text-amber-300">
                          Baja: {it.kg} {it.unidad}
                        </span>
                      ) : (
                        <span className="font-mono font-bold text-blue-300">
                          Real: {it.stock_real} {it.unidad} ({it.dif > 0 ? `+${it.dif}` : it.dif} {it.unidad})
                        </span>
                      )}
                      <span className="text-gray-500">·</span>
                      <span className="text-emerald-400 font-mono">
                        Costo: $${it.valor_costo || 0}
                      </span>
                    </div>

                    {/* Stock que quedaría (Requisito 7) */}
                    <div className="text-[10px] text-gray-400 font-mono">
                      Stock: <span className="text-gray-300">{it.stock_actual} {it.unidad}</span> → Quedará:{' '}
                      <strong className={tipoSalida === 'MERMA' ? 'text-amber-400' : 'text-blue-400'}>
                        {it.stock_resultante} {it.unidad}
                      </strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => eliminarItem(idx)}
                    title="Quitar producto de la lista"
                    className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Resumen total al costo */}
        {itemsSalida.length > 0 && (
          <div className="bg-black/40 border border-gray-800 p-3 rounded-xl flex items-center justify-between text-xs">
            <span className="text-gray-400">Valor total al costo de lo que sale:</span>
            <span className="font-mono font-black text-amber-300 text-sm">
              {valorTotalCosto > 0 ? $$(valorTotalCosto) : '$0'}
            </span>
          </div>
        )}

        {/* Error en el envío */}
        {errorEnvio && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
            {errorEnvio}
          </div>
        )}

        {/* Botón Aplicar */}
        <button
          type="button"
          onClick={handleAplicar}
          disabled={enviando || itemsSalida.length === 0}
          className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-black text-xs uppercase tracking-wider py-3.5 rounded-xl transition-all shadow-lg shadow-amber-500/20 cursor-pointer flex items-center justify-center gap-1.5"
        >
          {enviando ? (
            <>
              <RefreshCw size={14} className="animate-spin" />
              <span>Aplicando salida...</span>
            </>
          ) : (
            <>
              <Check size={16} />
              <span>
                Aplicar {tipoSalida === 'MERMA' ? 'Merma' : 'Corrección'} ({itemsSalida.length} {itemsSalida.length === 1 ? 'producto' : 'productos'})
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: MODAL NUEVO PRODUCTO
// ─────────────────────────────────────────────────────────────────────────────
function ModalNuevoProducto({ onClose, onSuccess }) {
  const [producto, setProducto] = useState('');
  const [categoria, setCategoria] = useState('Verduras');
  const [unidad, setUnidad] = useState('kg');
  const [margenPct, setMargenPct] = useState('60');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!producto.trim()) return;

    setGuardando(true);
    setError(null);

    try {
      const res = await apiCrearProducto({
        producto: producto.trim(),
        categoria,
        unidad,
        margen_pct: Number(margenPct) || 60
      });

      if (res && res.ok) {
        onSuccess();
      } else {
        setError(res?.error || 'No se pudo crear el producto.');
      }
    } catch (err) {
      setError(err.message || 'Error de red.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#121212] border border-gray-800 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <h2 className="text-sm font-black uppercase text-white flex items-center gap-2">
            <Plus size={16} className="text-green-400" /> Crear Nuevo Producto
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block text-gray-400 uppercase font-bold mb-1">Nombre del Producto *</label>
            <input
              type="text"
              placeholder="Ej: Zapallo Anco, Palta Hass..."
              value={producto}
              onChange={(e) => setProducto(e.target.value)}
              className="w-full bg-black/60 border border-gray-700 rounded-xl px-3 py-2 text-white font-bold outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-400 uppercase font-bold mb-1">Categoría</label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-full bg-black border border-gray-700 rounded-xl px-2.5 py-2 text-white outline-none"
              >
                <option value="Verduras">Verduras</option>
                <option value="Frutas">Frutas</option>
                <option value="Almacén">Almacén</option>
                <option value="Otros">Otros</option>
              </select>
            </div>

            <div>
              <label className="block text-gray-400 uppercase font-bold mb-1">Unidad</label>
              <select
                value={unidad}
                onChange={(e) => setUnidad(e.target.value)}
                className="w-full bg-black border border-gray-700 rounded-xl px-2.5 py-2 text-white outline-none"
              >
                <option value="kg">kg (peso)</option>
                <option value="un">un (unidad)</option>
                <option value="atado">atado</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-gray-400 uppercase font-bold mb-1">Margen % por defecto</label>
            <input
              type="number"
              value={margenPct}
              onChange={(e) => setMargenPct(e.target.value)}
              className="w-full bg-black/60 border border-gray-700 rounded-xl px-3 py-2 text-white font-mono outline-none"
            />
          </div>

          {error && <div className="p-2.5 rounded-xl bg-red-500/10 text-red-300">{error}</div>}

          <button
            type="submit"
            disabled={guardando}
            className="w-full py-2.5 bg-green-500 hover:bg-green-400 text-black font-black uppercase rounded-xl transition-all cursor-pointer disabled:opacity-50 mt-2"
          >
            {guardando ? 'Guardando...' : 'Crear Producto'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: MODAL PUBLICAR PRECIOS (ANTES / DESPUÉS)
// ─────────────────────────────────────────────────────────────────────────────
function ModalPublicar({ productosQueCambian, preciosList, margenesEditados, config: _config, calcularPrecioSugerido, onClose, onSuccess }) {
  const [publicando, setPublicando] = useState(false);
  const [error, setError] = useState(null);

  // Clasificación de productos a publicar y validación de precios/costos
  const { prodsParaPublicar, prodsSinPrecioOCosto, conteoPorCategoria, prodsSinStock, prodsSinUnidad } = useMemo(() => {
    const listValidos = [];
    const listSinPrecio = [];
    const conteo = {};
    const sinStockArr = [];
    const sinUnidadArr = [];

    (preciosList || []).forEach(p => {
      const esAlm = Boolean(p.es_almacen || p.categoria === 'Almacén' || norm(p.categoria).includes('almacen'));
      
      let nombreWeb = p.producto;
      let precioFinal = 0;
      let costoUnit = 0;
      let disponible = true;
      let cat = p.categoria || (esAlm ? 'Almacén' : 'Verduras');
      let subcat = p.subcategoria || (esAlm ? 'Almacén' : '');
      let unidad = esAlm ? 'unidad' : (p.unidad || '');

      if (!esAlm && (!p.unidad || !String(p.unidad).trim())) {
        sinUnidadArr.push({
          producto: p.producto,
          categoria: cat
        });
      }

      if (esAlm) {
        // Nombre con marca si corresponde (igual a como se mostrará en la web)
        if (p.marca && p.marca.trim() && !p.producto.toLowerCase().includes(p.marca.toLowerCase())) {
          nombreWeb = `${p.producto} (${p.marca.trim()})`;
        } else {
          nombreWeb = p.producto;
        }
        costoUnit = Number(p.costo_unitario || p.costo_kg_ultimo || 0);
        precioFinal = Number(p.precio_venta || p.precio_sugerido || p.precio_publicado || 0);
        disponible = Number(p.stock_unidades || 0) > 0;
      } else {
        const margenActual = margenesEditados[p.producto] !== undefined ? margenesEditados[p.producto] : p.margen_pct;
        const sugerido = calcularPrecioSugerido(p.costo_kg_ultimo, margenActual);
        costoUnit = Number(p.costo_kg_ultimo || 0);
        precioFinal = sugerido > 0 ? sugerido : (Number(p.precio_publicado) || 0);
        disponible = p.disponible !== false;
      }

      // Regla: Producto sin precio (0) o sin costo NO se publica y se lista como advertencia visible antes de publicar
      if (precioFinal <= 0 || costoUnit <= 0) {
        listSinPrecio.push({
          producto: p.producto,
          categoria: cat,
          motivo: precioFinal <= 0 ? 'Sin precio ($0)' : 'Sin costo ($0)'
        });
        return;
      }

      if (!disponible) {
        sinStockArr.push({
          producto: nombreWeb,
          categoria: cat,
          esAlmacen: esAlm,
          stock: p.stock_unidades
        });
      }

      // Conteo por categoría
      conteo[cat] = (conteo[cat] || 0) + 1;

      listValidos.push({
        nombre: nombreWeb,
        precio: Math.round(precioFinal),
        disponible,
        categoria: cat,
        ...(subcat ? { subcategoria: subcat } : {}),
        unidad,
        ...(p.marca ? { marca: p.marca } : {})
      });
    });

    return {
      prodsParaPublicar: listValidos,
      prodsSinPrecioOCosto: listSinPrecio,
      conteoPorCategoria: conteo,
      prodsSinStock: sinStockArr,
      prodsSinUnidad: sinUnidadArr
    };
  }, [preciosList, margenesEditados, calcularPrecioSugerido]);

  const totalValidos = prodsParaPublicar.length;
  const cantDisponibles = totalValidos - prodsSinStock.length;

  const handleConfirmar = async () => {
    setPublicando(true);
    setError(null);

    try {
      const res = await apiPublicarPrecios(prodsParaPublicar);
      if (res && res.ok) {
        onSuccess();
      } else {
        setError(res?.error || 'El Apps Script rechazó la publicación.');
      }
    } catch (e) {
      setError(e.message || 'Error de red.');
    } finally {
      setPublicando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#121212] border border-gray-800 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <h2 className="text-sm font-black uppercase text-white flex items-center gap-2">
            <Check size={16} className="text-green-400" /> Publicar Catálogo en Tienda
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-gray-300">
          Se actualizarán precios y disponibilidad en la tienda web y se auditarán en Google Sheets.
        </p>

        {/* Resumen de confirmación: cantidad por categoría, cuántos sin stock, cuántos sin precio */}
        <div className="bg-black/50 border border-gray-800 p-3 rounded-2xl space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400 font-bold uppercase text-[10px] tracking-wider">A Publicar:</span>
            <span className="font-mono font-black text-white text-sm">{totalValidos} productos</span>
          </div>

          {/* Desglose por categoría */}
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(conteoPorCategoria).map(([cat, count]) => (
              <span key={cat} className="px-2 py-0.5 rounded-lg bg-gray-800 text-gray-300 text-[10px] font-bold">
                {cat}: <strong className="text-white">{count}</strong>
              </span>
            ))}
          </div>

          {/* Métrica de Disponibilidad */}
          <div className="flex items-center justify-between text-xs pt-1.5 border-t border-gray-800/80">
            <span className="text-green-400 font-bold">✓ Disponibles en tienda: {cantDisponibles}</span>
            <span className={prodsSinStock.length > 0 ? 'text-red-400 font-bold' : 'text-gray-500'}>
              × Sin stock: {prodsSinStock.length}
            </span>
          </div>
        </div>

        {/* Advertencia visible: N productos sin precio no se publican */}
        {prodsSinPrecioOCosto.length > 0 && (
          <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-1.5">
            <div className="text-amber-400 font-bold flex items-center gap-1.5">
              <AlertTriangle size={14} />
              <span>{prodsSinPrecioOCosto.length} productos sin precio o costo NO se publican:</span>
            </div>
            <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
              {prodsSinPrecioOCosto.map((sp, idx) => (
                <div key={idx} className="flex items-center justify-between text-[11px] text-gray-300 bg-black/40 px-2 py-0.5 rounded">
                  <span>{sp.producto} <span className="text-gray-500">({sp.categoria})</span></span>
                  <span className="text-amber-300/80 font-mono text-[10px]">{sp.motivo}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Advertencia no bloqueante: N productos sin unidad definida */}
        {prodsSinUnidad.length > 0 && (
          <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-1.5">
            <div className="text-amber-400 font-bold flex items-center gap-1.5">
              <AlertTriangle size={14} />
              <span>{prodsSinUnidad.length} productos sin unidad definida:</span>
            </div>
            <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
              {prodsSinUnidad.map((su, idx) => (
                <div key={idx} className="flex items-center justify-between text-[11px] text-gray-300 bg-black/40 px-2 py-0.5 rounded">
                  <span>{su.producto} <span className="text-gray-500">({su.categoria})</span></span>
                  <span className="text-amber-300/80 font-mono text-[10px]">Sin unidad (se publica tal cual)</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cambios de precio */}
        <div className="max-h-48 overflow-y-auto space-y-2 pr-1 divide-y divide-gray-800">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
            Cambios de precio detectados ({productosQueCambian.length}):
          </p>
          {productosQueCambian.length === 0 ? (
            <p className="py-2 text-center text-xs text-gray-500">
              No hay productos con cambios de precio pendientes. Se republicarán los precios actuales con su disponibilidad.
            </p>
          ) : (
            productosQueCambian.map((c, i) => (
              <div key={i} className="pt-2 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">{c.producto}</span>
                  {c.disponible === false ? (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-red-600/30 text-red-300 border border-red-500/40">
                      Sin stock
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold text-green-400 bg-green-500/10 border border-green-500/20">
                      Disp.
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 font-mono">
                  <span className="text-gray-500 line-through">$${c.precio_publicado}</span>
                  <span className="text-gray-400">→</span>
                  <span className="text-green-400 font-bold">$${c.precio_sugerido}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Bloque explícito de productos que se publicarán como Sin Stock */}
        {prodsSinStock.length > 0 && (
          <div className="pt-3 border-t border-gray-800 space-y-1.5">
            <p className="text-[11px] font-black uppercase tracking-wider text-red-400 flex items-center gap-1.5">
              <AlertTriangle size={13} />
              Productos marcados "Sin stock" a publicar ({prodsSinStock.length}):
            </p>
            <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
              {prodsSinStock.map((p, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1 px-2.5 rounded-lg bg-red-500/10 border border-red-500/25">
                  <span className="text-white font-medium">{p.producto}</span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-red-600/40 text-red-200 border border-red-500/50">
                    Sin stock
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <div className="p-3 rounded-xl bg-red-500/10 text-red-300 text-xs">{error}</div>}

        <div className="flex gap-2 pt-2 border-t border-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold rounded-xl text-xs cursor-pointer"
          >
            Volver
          </button>
          <button
            type="button"
            onClick={handleConfirmar}
            disabled={publicando || totalValidos === 0}
            className="flex-[2] py-2.5 bg-green-500 hover:bg-green-400 text-black font-black uppercase tracking-wider rounded-xl text-xs cursor-pointer disabled:opacity-50"
          >
            {publicando ? 'Publicando...' : `Confirmar y Publicar (${totalValidos})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: MODAL CONFIGURACIÓN GLOBAL (PARTE 6)
// ─────────────────────────────────────────────────────────────────────────────
function ModalConfiguracion({ config, onClose, onGuardado }) {
  const [valores, setValores] = useState({
    tara_kg: config.tara_kg || 2.0,
    redondeo: config.redondeo || 50,
    empaque_chica: config.empaque_chica || 50,
    empaque_grande: config.empaque_grande || 350
  });

  const [guardando, setGuardando] = useState(null);
  const [error, setError] = useState(null);

  const guardarCampo = async (clave) => {
    setGuardando(clave);
    setError(null);
    try {
      const res = await apiSetConfig(clave, Number(valores[clave]));
      if (res && res.ok) {
        onGuardado();
      } else {
        setError(res?.error || 'No se pudo guardar la configuración.');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#121212] border border-gray-800 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <h2 className="text-sm font-black uppercase text-white flex items-center gap-2">
            <Settings size={16} className="text-green-400" /> Configuración Global
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          {[
            { clave: 'tara_kg', label: 'Tara global por cajón (kg)', step: '0.1' },
            { clave: 'redondeo', label: 'Múltiplo de redondeo de precios ($)', step: '10' },
            { clave: 'empaque_chica', label: 'Costo bolsa chica ($)', step: '10' },
            { clave: 'empaque_grande', label: 'Costo bolsa grande ($)', step: '10' },
          ].map(({ clave, label, step }) => (
            <div key={clave} className="bg-black/40 border border-gray-800 p-3 rounded-xl flex items-center justify-between gap-3">
              <div className="flex-1">
                <span className="font-bold text-gray-300 block">{label}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step={step}
                  value={valores[clave]}
                  onChange={(e) => setValores({ ...valores, [clave]: e.target.value })}
                  className="w-20 bg-black border border-gray-700 rounded-lg px-2 py-1 text-right font-mono text-xs text-white"
                />
                <button
                  type="button"
                  onClick={() => guardarCampo(clave)}
                  disabled={guardando === clave}
                  className="px-2.5 py-1 bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500 hover:text-black rounded-lg font-bold text-[11px] cursor-pointer"
                >
                  {guardando === clave ? '...' : 'Guardar'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {error && <div className="p-2.5 rounded-xl bg-red-500/10 text-red-300 text-xs">{error}</div>}

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 bg-gray-800 hover:bg-gray-750 text-gray-300 font-bold rounded-xl text-xs cursor-pointer mt-2"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: MODAL PEDIR PIN DE ADMINISTRADOR (SOLO MEMORIA)
// ─────────────────────────────────────────────────────────────────────────────
function ModalPedirAdminPin({ error, onConfirm, onClose }) {
  const [pin, setPin] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!pin.trim()) return;
    onConfirm(pin.trim());
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#121212] border border-gray-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <h2 className="text-sm font-black uppercase text-white flex items-center gap-2">
            <Lock size={16} className="text-amber-400" /> PIN de Administrador
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-gray-400">
          Ingresá tu PIN de administrador para confirmar esta operación. Se mantendrá activo por 15 minutos en memoria.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            autoFocus
            placeholder="PIN de Administrador"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full bg-black border border-gray-700 focus:border-amber-500 rounded-xl px-4 py-2.5 text-center text-lg font-mono tracking-widest text-white outline-none"
            required
          />

          {error && <div className="p-2 rounded-xl bg-red-500/10 text-red-300 text-xs text-center">{error}</div>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-xl text-xs font-bold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-[2] py-2 bg-amber-500 hover:bg-amber-400 text-black rounded-xl text-xs font-black uppercase tracking-wider"
            >
              Confirmar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: HISTORIAL DE INGRESOS (SUB-TAB)
// ─────────────────────────────────────────────────────────────────────────────
function HistorialIngresosTab({ onVolver }) {
  const [ingresos, setIngresos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const cargar = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await apiGetIngresos(null, 100);
      if (res && res.ok && Array.isArray(res.ingresos)) {
        setIngresos(res.ingresos);
      } else {
        setError(res?.error || 'No se pudo cargar el historial.');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-[#121212] border border-gray-800 p-3.5 rounded-2xl">
        <h2 className="text-xs font-black uppercase text-white flex items-center gap-2">
          <History size={15} className="text-green-400" /> Registro de Compras Realizadas
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={cargar} disabled={cargando} className="p-1.5 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white cursor-pointer">
            <RefreshCw size={13} className={cargando ? 'animate-spin' : ''} />
          </button>
          <button onClick={onVolver} className="text-xs text-green-400 hover:underline font-bold cursor-pointer">
            ← Volver a productos
          </button>
        </div>
      </div>

      {error && <div className="p-3 rounded-xl bg-red-500/10 text-red-300 text-xs">{error}</div>}

      <div className="bg-[#121212] border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-black/60 border-b border-gray-800 text-gray-400 font-bold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Fecha</th>
                <th className="py-3 px-3">Producto</th>
                <th className="py-3 px-3">Proveedor & Tel</th>
                <th className="py-3 px-3 text-right">Cantidad</th>
                <th className="py-3 px-3 text-right">Costo Total</th>
                <th className="py-3 px-3 text-right">Costo / Ud</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60 font-medium">
              {cargando && ingresos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">Cargando ingresos...</td>
                </tr>
              ) : ingresos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">No hay compras registradas aún.</td>
                </tr>
              ) : (
                ingresos.map((ing, i) => (
                  <tr key={i} className="hover:bg-white/[0.02]">
                    <td className="py-3 px-4 text-gray-400 font-mono text-[11px]">{ing.fecha || ing.timestamp || '—'}</td>
                    <td className="py-3 px-3 font-bold text-white">{ing.producto}</td>
                    <td className="py-3 px-3 text-gray-300">
                      <div>{ing.proveedor || 'Sin especificar'}</div>
                      {ing.proveedor_tel && <div className="text-[10px] text-gray-500 font-mono">{ing.proveedor_tel}</div>}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-amber-300">
                      {Number(ing.kg_netos || 0).toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-gray-300">{Number(ing.costo_total || 0).toLocaleString('es-AR')}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-green-400">${Number(ing.costo_kg || 0).toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: HISTORIAL DE SALIDAS (SUB-TAB)
// ─────────────────────────────────────────────────────────────────────────────
function HistorialSalidasTab({ onVolver }) {
  const [salidas, setSalidas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const cargar = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await apiGetMovimientos({ limite: 100 });
      if (res && res.ok && Array.isArray(res.movimientos)) {
        // Filtrar solo MERMA y AJUSTE
        const filtrados = res.movimientos.filter(m => m.tipo === 'MERMA' || m.tipo === 'AJUSTE');
        setSalidas(filtrados);
      } else {
        setError(res?.error || 'No se pudo cargar el historial de salidas.');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-[#121212] border border-gray-800 p-3.5 rounded-2xl">
        <h2 className="text-xs font-black uppercase text-white flex items-center gap-2">
          <History size={15} className="text-amber-400" /> Registro de Salidas (Mermas y Ajustes)
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={cargar} disabled={cargando} className="p-1.5 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white cursor-pointer">
            <RefreshCw size={13} className={cargando ? 'animate-spin' : ''} />
          </button>
          <button onClick={onVolver} className="text-xs text-green-400 hover:underline font-bold cursor-pointer">
            ← Volver a productos
          </button>
        </div>
      </div>

      {error && <div className="p-3 rounded-xl bg-red-500/10 text-red-300 text-xs">{error}</div>}

      <div className="bg-[#121212] border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-black/60 border-b border-gray-800 text-gray-400 font-bold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Fecha</th>
                <th className="py-3 px-3">Tipo</th>
                <th className="py-3 px-3">Producto</th>
                <th className="py-3 px-3 text-right">Cantidad</th>
                <th className="py-3 px-3 text-right">Valor al Costo</th>
                <th className="py-3 px-3">Nota / Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60 font-medium">
              {cargando && salidas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">Cargando salidas...</td>
                </tr>
              ) : salidas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">No hay salidas registradas aún.</td>
                </tr>
              ) : (
                salidas.map((s, i) => (
                  <tr key={i} className="hover:bg-white/[0.02]">
                    <td className="py-3 px-4 text-gray-400 font-mono text-[11px]">{s.fecha || '—'}</td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        s.tipo === 'MERMA' ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'
                      }`}>
                        {s.tipo}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-bold text-white">{s.producto}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-gray-200">
                      {Number(s.kg || 0).toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-amber-300">
                      {s.valor_pesos ? $$(s.valor_pesos) : '—'}
                    </td>
                    <td className="py-3 px-3 text-gray-400 text-xs">{s.nota || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
