import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { 
  Plus, Edit2, Check, Trash2, Package, ShoppingCart, 
  Settings, TrendingUp, AlertTriangle, Save, Globe, Lock, X, Loader2
} from 'lucide-react';

const STORAGE_KEY = 'huerta_data_costos_v31';
const SHEET_ID = import.meta.env.VITE_SHEET_ID;
const API_KEY  = import.meta.env.VITE_GOOGLE_SHEETS_KEY;
const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL;

const $$ = (n) => `$${Number(n).toLocaleString('es-AR')}`;

import { 
  getTipoByNombre, getUnidadByNombre, pluralizar, 
  getCategoriaPrincipal, CATEGORIAS_PRINCIPALES, SUBCATEGORIAS_ALMACEN,
  ALMACEN_PRESETS, getSubcategoriaAlmacen
} from '../data/productUtils';

const PRODUCTOS_INICIALES = [
  { id: 1, nombre: 'Papa', categoria: 'duro', cantidadCajon: 20, unidad: 'kg', precioCajon: 12000, margen: 60, activo: true },
];

export const COMBOS_INICIALES = [
  { 
    id: 101, 
    nombre: 'COMBO 1 — Básico', 
    precioManual: 39575, 
    descripcion: 'Papa 4kg, Cebolla 3kg, Zanahoria 2kg, Zapallo 2kg, Tomate 2kg, Banana 2kg, Huevos 1 maple, Lechuga 1/2 kilo, Rúcula 1/2 atado, Naranja 1kg', 
    productos: [
      { nombre: 'Papa', cantidad: 4 },
      { nombre: 'Cebolla', cantidad: 3 },
      { nombre: 'Zanahoria', cantidad: 2 },
      { nombre: 'Zapallo blanco', cantidad: 2 },
      { nombre: 'Tomate', cantidad: 2 },
      { nombre: 'Banana', cantidad: 2 },
      { nombre: 'Huevos Nº1', cantidad: 1 },
      { nombre: 'Lechuga', cantidad: 0.5 },
      { nombre: 'Rúcula', cantidad: 0.5 },
      { nombre: 'Naranja', cantidad: 1 }
    ], 
    descuento: 0, 
    activo: true 
  },
  {
    id: 102,
    nombre: 'COMBO 2 — Semanal',
    precioManual: 51525,
    descripcion: 'Papa 4kg, Cebolla 2kg, Zanahoria 2kg, Tomate 2kg, Zapallito 2kg, Banana 2kg, Naranja 2kg, Lechuga 1/2 kilo, Remolacha 2, Huevos 1 maple',
    productos: [
      { nombre: 'Papa', cantidad: 4 },
      { nombre: 'Cebolla', cantidad: 2 },
      { nombre: 'Zanahoria', cantidad: 2 },
      { nombre: 'Tomate', cantidad: 2 },
      { nombre: 'Zapallito', cantidad: 2 },
      { nombre: 'Banana', cantidad: 2 },
      { nombre: 'Naranja', cantidad: 2 },
      { nombre: 'Lechuga', cantidad: 0.5 },
      { nombre: 'Remolacha', cantidad: 2 },
      { nombre: 'Huevos Nº1', cantidad: 1 }
    ],
    descuento: 0,
    activo: true
  },
  {
    id: 103,
    nombre: 'COMBO 3 — Para Dos',
    precioManual: 38625,
    descripcion: 'Papa 2kg, Cebolla 1kg, Zanahoria 1kg, Tomate 1kg, Lechuga 1/2 kilo, Rúcula 1/2 atado, Banana 1kg, Manzana roja 1kg, Limón 1kg, Huevos 1 maple, Remolacha 1, Choclo 4',
    productos: [
      { nombre: 'Papa', cantidad: 2 },
      { nombre: 'Cebolla', cantidad: 1 },
      { nombre: 'Zanahoria', cantidad: 1 },
      { nombre: 'Tomate', cantidad: 1 },
      { nombre: 'Lechuga', cantidad: 0.5 },
      { nombre: 'Rúcula', cantidad: 0.5 },
      { nombre: 'Banana', cantidad: 1 },
      { nombre: 'Manzana roja', cantidad: 1 },
      { nombre: 'Limón', cantidad: 1 },
      { nombre: 'Huevos Nº1', cantidad: 1 },
      { nombre: 'Remolacha', cantidad: 1 },
      { nombre: 'Choclo', cantidad: 4 }
    ],
    descuento: 0,
    activo: true
  },
  {
    id: 104,
    nombre: 'COMBO 4 — Fit',
    precioManual: 54975,
    descripcion: 'Lechuga 1/2 kilo, Rúcula 1/2 atado, Espinaca 1kg, Tomate 2kg, Pepino 1kg, Palta 3, Manzana roja 2kg, Limón 1kg, Banana 2kg, Arándanos 1 bandeja, Remolacha 2',
    productos: [
      { nombre: 'Lechuga', cantidad: 0.5 },
      { nombre: 'Rúcula', cantidad: 0.5 },
      { nombre: 'Espinaca', cantidad: 1 },
      { nombre: 'Tomate', cantidad: 2 },
      { nombre: 'Pepino', cantidad: 1 },
      { nombre: 'Palta', cantidad: 3 },
      { nombre: 'Manzana roja', cantidad: 2 },
      { nombre: 'Limón', cantidad: 1 },
      { nombre: 'Banana', cantidad: 2 },
      { nombre: 'Arándano', cantidad: 1 },
      { nombre: 'Remolacha', cantidad: 2 }
    ],
    descuento: 0,
    activo: true
  },
  {
    id: 105,
    nombre: 'COMBO 5 — Vegetariano',
    precioManual: 66875,
    descripcion: 'Berenjena 2kg, Zapallito 2kg, Tomate 2kg, Zanahoria 2kg, Pepino 1kg, Brócoli 2, Espinaca 1kg, Lechuga 1/2 kilo, Rúcula 1/2 atado, Palta 3, Banana 2kg, Manzana roja 2kg, Limón 1kg, Remolacha 2',
    productos: [
      { nombre: 'Berenjena', cantidad: 2 },
      { nombre: 'Zapallito', cantidad: 2 },
      { nombre: 'Tomate', cantidad: 2 },
      { nombre: 'Zanahoria', cantidad: 2 },
      { nombre: 'Pepino', cantidad: 1 },
      { nombre: 'Brócoli', cantidad: 2 },
      { nombre: 'Espinaca', cantidad: 1 },
      { nombre: 'Lechuga', cantidad: 0.5 },
      { nombre: 'Rúcula', cantidad: 0.5 },
      { nombre: 'Palta', cantidad: 3 },
      { nombre: 'Banana', cantidad: 2 },
      { nombre: 'Manzana roja', cantidad: 2 },
      { nombre: 'Limón', cantidad: 1 },
      { nombre: 'Remolacha', cantidad: 2 }
    ],
    descuento: 0,
    activo: true
  },
  {
    id: 106,
    nombre: 'COMBO 6 — Familiar',
    precioManual: 75725,
    descripcion: 'Papa 5kg, Cebolla 3kg, Zanahoria 2kg, Tomate 2kg, Zapallito 2kg, Banana 3kg, Naranja 2kg, Manzana roja 2kg, Lechuga 1/2 kilo, Remolacha 2, Choclo 6, Huevos 1 maple',
    productos: [
      { nombre: 'Papa', cantidad: 5 },
      { nombre: 'Cebolla', cantidad: 3 },
      { nombre: 'Zanahoria', cantidad: 2 },
      { nombre: 'Tomate', cantidad: 2 },
      { nombre: 'Zapallito', cantidad: 2 },
      { nombre: 'Banana', cantidad: 3 },
      { nombre: 'Naranja', cantidad: 2 },
      { nombre: 'Manzana roja', cantidad: 2 },
      { nombre: 'Lechuga', cantidad: 0.5 },
      { nombre: 'Remolacha', cantidad: 2 },
      { nombre: 'Choclo', cantidad: 6 },
      { nombre: 'Huevos Nº1', cantidad: 1 }
    ],
    descuento: 0,
    activo: true
  },
  {
    id: 107,
    nombre: 'COMBO 7 — Premium',
    precioManual: 78750,
    descripcion: 'Papa 3kg, Tomate 2kg, Morrón rojo 1kg, Banana 2kg, Manzana roja 2kg, Uva 1kg, Palta 3, Arándanos 1 bandeja, Huevos 2 maples, Miel 1kg, Espinaca 1kg',
    productos: [
      { nombre: 'Papa', cantidad: 3 },
      { nombre: 'Tomate', cantidad: 2 },
      { nombre: 'Morrón rojo', cantidad: 1 },
      { nombre: 'Banana', cantidad: 2 },
      { nombre: 'Manzana roja', cantidad: 2 },
      { nombre: 'Uva', cantidad: 1 },
      { nombre: 'Palta', cantidad: 3 },
      { nombre: 'Arándano', cantidad: 1 },
      { nombre: 'Huevos Nº1', cantidad: 2 },
      { nombre: 'Miel pura', cantidad: 1 },
      { nombre: 'Espinaca', cantidad: 1 }
    ],
    descuento: 0,
    activo: true
  }
];

export default function PanelCostos() {
  const { productosCostos: contextProds, setProductosCostos } = useGoogleSheets();
  const [productos, setProductos] = useState([]);
  const [combos, setCombos] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY + '_combos');
    return saved ? JSON.parse(saved) : COMBOS_INICIALES;
  });
  const [montoMinimo, setMontoMinimo] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY + '_minimo');
    return saved ? JSON.parse(saved) : 35000;
  });
  const [mensajeMinimo, setMensajeMinimo] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY + '_msg');
    return saved ? JSON.parse(saved) : "El pedido mínimo es de $35.000";
  });

  // Filtros de categoría principal y subcategoría para Almacén
  const [categoriaFiltro, setCategoriaFiltro] = useState('Todas');
  const [subcategoriaAlmacen, setSubcategoriaAlmacen] = useState('Todas');

  const [cargando, setCargando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [sincronizadoExito, setSincronizadoExito] = useState(false);
  const [ultimaSync, setUltimaSync] = useState(null);
  const [publicando, setPublicando] = useState(false);
  const [error, setError] = useState(null);

  // Carga inicial: Si contextProds ya tiene datos, usarlos.
  useEffect(() => {
    if (contextProds && contextProds.length > 0) {
      setProductos(contextProds);
      setCargando(false);
    } else {
      cargarDatosDesdeSheet();
    }
  }, [contextProds]);

  const cargarDatosDesdeSheet = async () => {
    setSincronizando(true);
    setError(null);

    try {
      let rows = null;

      // 1. Intentar vía API v4 oficial de Google Sheets
      if (API_KEY && SHEET_ID) {
        try {
          const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/PanelCostos?key=${API_KEY}`;
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            if (data.values && data.values.length > 0) rows = data.values;
          } else {
            console.warn(`[COSTOS-API] v4 devolvió estado ${res.status}. Usando fallback GViz...`);
          }
        } catch (e) {
          console.warn('[COSTOS-API] Fallback a GViz:', e.message);
        }
      }

      // 2. Fallback resiliente: Google Visualization API (GViz)
      if (!rows && SHEET_ID) {
        try {
          const gvizUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=PanelCostos`;
          const gvizRes = await fetch(gvizUrl);
          if (gvizRes.ok) {
            const text = await gvizRes.text();
            const start = text.indexOf('{');
            const end = text.lastIndexOf('}');
            if (start !== -1 && end !== -1) {
              const json = JSON.parse(text.substring(start, end + 1));
              if (json.status === 'ok' && json.table) {
                const headers = (json.table.cols || []).map(c => c.label || '');
                const bodyRows = (json.table.rows || []).map(r =>
                  (r.c || []).map(cell => (cell ? (cell.v !== null && cell.v !== undefined ? cell.v : cell.f || '') : ''))
                );
                rows = [headers, ...bodyRows];
              }
            }
          }
        } catch (e) {
          console.warn('[COSTOS-GVIZ] Error en fallback GViz:', e.message);
        }
      }

      if (!rows || rows.length < 1) {
        throw new Error('No se pudieron obtener datos del Google Sheet');
      }

      let mapped = rows.slice(1).map((row, index) => {
        let nombre = String(row[0] || 'Sin nombre').trim();
        const fixAcentos = (str) => str
            .replace(/\bcebolla comun\b/gi, 'Cebolla')
            .replace(/\bCebolla común\b/gi, 'Cebolla')
            .replace(/\bmorr[óo]n\b/gi, 'Morrón rojo')
            .replace(/\brucula\b/gi, m => m[0] === m[0].toUpperCase() ? 'Rúcula' : 'rúcula')
            .replace(/\bbrocoli\b/gi, m => m[0] === m[0].toUpperCase() ? 'Brócoli' : 'brócoli')
            .replace(/\blimon\b/gi, m => m[0] === m[0].toUpperCase() ? 'Limón' : 'limón')
            .replace(/\barandanos\b/gi, m => m[0] === m[0].toUpperCase() ? 'Arándanos' : 'arándanos')
            .replace(/\barandano\b/gi, m => m[0] === m[0].toUpperCase() ? 'Arándano' : 'arándano');
        nombre = fixAcentos(nombre);

        const tipo = getTipoByNombre(nombre);
        return {
          fila: index + 2,
          id: index + 1, 
          nombre: nombre,
          precioCajon: Number(row[1]) || 0,
          cantidadCajon: Number(row[2]) || 1,
          margen: Number(row[3]) || 60,
          precioMaxManual: row[4] ? Number(row[4]) : null,
          activo: row[5] === true || row[5] === 'TRUE' || row[5] === 'true' || row[5] === '1' || row[5] === 1,
          ultimaActualizacion: row[6] || '',
          categoria: tipo, 
          categoriaPrincipal: getCategoriaPrincipal(nombre),
          subcategoria: getCategoriaPrincipal(nombre) === 'Almacén' ? getSubcategoriaAlmacen(nombre) : '',
          unidad: getUnidadByNombre(nombre)
        };
      });

      // Eliminar producto "Huevos" genérico anticuado
      mapped = mapped.filter(p => typeof p.nombre === 'string' && p.nombre.toLowerCase().trim() !== 'huevos');

      const huevosNuevos = [
        { id: 9001, nombre: 'Huevos Nº1', categoria: 'otros', categoriaPrincipal: 'Extras', cantidadCajon: 12, unidad: 'maple x30 uds', precioCajon: 54000, margen: 70, precioMaxManual: 6500, activo: true, fila: null },
        { id: 9002, nombre: 'Huevos Nº2', categoria: 'otros', categoriaPrincipal: 'Extras', cantidadCajon: 12, unidad: 'maple x30 uds', precioCajon: 0, margen: 70, precioMaxManual: 0, activo: false, fila: null },
        { id: 9003, nombre: 'Huevos Súper', categoria: 'otros', categoriaPrincipal: 'Extras', cantidadCajon: 12, unidad: 'maple x30 uds', precioCajon: 0, margen: 70, precioMaxManual: 0, activo: false, fila: null }
      ];

      huevosNuevos.forEach(nuevo => {
        if (!mapped.some(p => p.nombre === nuevo.nombre)) {
          mapped.push(nuevo);
        }
      });

      // Cargar productos de almacén (custom y presets)
      let customSaved = [];
      try {
        const cs = localStorage.getItem('huerta_custom_almacen_prods_v1');
        if (cs) customSaved = JSON.parse(cs);
      } catch(e) {}

      const allAlmacen = [...customSaved, ...ALMACEN_PRESETS];
      allAlmacen.forEach(alm => {
        if (!mapped.some(p => p.nombre?.toLowerCase().trim() === alm.nombre?.toLowerCase().trim())) {
          mapped.push({
            id: alm.id || Date.now() + Math.random(),
            nombre: alm.nombre,
            categoria: 'otros',
            categoriaPrincipal: 'Almacén',
            subcategoria: alm.subcategoria || getSubcategoriaAlmacen(alm.nombre),
            cantidadCajon: 1,
            unidad: 'unidad',
            precioCajon: alm.precioCajon || 0,
            margen: 60,
            precioMaxManual: null,
            activo: true,
            fila: null
          });
        }
      });

      setProductos(mapped);
      if (setProductosCostos) setProductosCostos(mapped);
      localStorage.setItem('huerta_data_costos_v1_productos', JSON.stringify(mapped));

      const now = new Date();
      const horaStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      setUltimaSync(horaStr);
      setSincronizadoExito(true);
      setError(null);
      setTimeout(() => setSincronizadoExito(false), 3500);
    } catch (err) {
      console.error('[COSTOS] Error sincronizando:', err);
      setError('No se pudo sincronizar el Panel de Costos con Google Sheets. Usando datos locales.');
    } finally {
      setCargando(false);
      setSincronizando(false);
    }
  };

  const syncWithSheet = async (p) => {
    if (!APPS_SCRIPT_URL || !p.fila) return;
    
    const payload = {
      accion: 'updatePanelCostos',
      fila: p.fila,
      costo_cajon: p.precioCajon,
      margen: p.margen,
      activo: p.activo,
      precio_maximo: p.precioMaxManual,
      ultima_actualizacion: new Date().toLocaleDateString('es-AR')
    };

    try {
      // POST no-cors para evitar problemas preflight
      await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.error('Error síncronizando con Google Sheets:', e);
    }
  };

  // Persistencia local para Combos, Config y Sincronización con Control de Stock
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY + '_productos', JSON.stringify(productos));
    localStorage.setItem(STORAGE_KEY + '_combos', JSON.stringify(combos));
    localStorage.setItem(STORAGE_KEY + '_minimo', JSON.stringify(montoMinimo));
    localStorage.setItem(STORAGE_KEY + '_msg', JSON.stringify(mensajeMinimo));
  }, [productos, combos, montoMinimo, mensajeMinimo]);

  // Estados para el Modal de Producto
  const [showModalProd, setShowModalProd] = useState(false);
  const [tempProd, setTempProd] = useState({
    nombre: '', categoria: 'Verdura', cantidadCajon: 1, unidad: 'kg', 
    precioCajon: 0, margen: 60, precioMaxManual: ''
  });

  // Estados para el Modal de Combos
  const [showModalCombo, setShowModalCombo] = useState(false);
  const [comboEditando, setComboEditando] = useState(null);
  const [tempCombo, setTempCombo] = useState({
    nombre: '', descripcion: '', productos: [], descuento: 0, precioManual: '', activo: true
  });

  // Lógica de cálculo de precios con merma de 1kg para productos pesados
  const productosCalculados = useMemo(() => {
    return productos.map(p => {
      const unidadNorm = (p.unidad || getUnidadByNombre(p.nombre)).toLowerCase();
      const esPesado = unidadNorm === 'kg';
      
      // Regla de merma: Para productos pesados (Verduras, Frutas, Carnes por kg):
      // Restar automáticamente 1kg de merma antes de calcular el costo por kg.
      // Para productos por unidad: costo total dividido cantidad de unidades (sin merma).
      const cantidadEfectiva = esPesado 
        ? Math.max(0.1, Number(p.cantidadCajon || 1) - 1) 
        : Math.max(1, Number(p.cantidadCajon || 1));
      
      const costoUnitario = Number(p.precioCajon || 0) / cantidadEfectiva;
      const precioConMargen = costoUnitario * (1 + (Number(p.margen) || 0) / 100);
      
      let precioFinal = precioConMargen;
      let alcanzadoTope = false;

      // El cálculo en el dashboard sigue usando topes para visualización de "Margen Real"
      if (p.precioJumbo && precioFinal > p.precioJumbo) {
        precioFinal = p.precioJumbo;
        alcanzadoTope = true;
      }
      if (p.precioMaxManual && precioFinal > p.precioMaxManual) {
        precioFinal = p.precioMaxManual;
        alcanzadoTope = true;
      }

      const margenReal = precioFinal > 0 ? ((precioFinal - costoUnitario) / precioFinal) * 100 : 0;
      const gananciaUnidad = precioFinal - costoUnitario;
      const categoriaPrincipal = p.categoriaPrincipal || getCategoriaPrincipal(p.nombre);

      return { 
        ...p, 
        unidad: unidadNorm,
        esPesado,
        cantidadEfectiva,
        categoriaPrincipal,
        costoUnitario, 
        precioConMargen, 
        precioFinal, 
        margenReal, 
        gananciaUnidad, 
        alcanzadoTope 
      };
    });
  }, [productos]);

  // Lógica de cálculo de combos
  const combosCalculados = useMemo(() => {
    return combos.map(c => {
      let subtotal = 0;
      let alertaProdOff = false;

      c.productos.forEach(item => {
        const prod = productosCalculados.find(p => p.id === item.id || p.nombre === item.nombre);
        if (prod) {
          subtotal += prod.precioFinal * item.cantidad;
          if (!prod.activo) alertaProdOff = true;
        }
      });

      const precioFinal = c.precioManual ? Number(c.precioManual) : subtotal * (1 - c.descuento / 100);
      return { ...c, subtotal, precioFinal, alertaProdOff };
    });
  }, [combos, productosCalculados]);

  // Resumen financiero corregido
  const resumen = useMemo(() => {
    const prodsActivos = productosCalculados.filter(p => p.activo);
    
    // Inversión Total: Suma de lo pagado por todos los cajones actuales
    const totalInvertido = prodsActivos.reduce((sum, p) => sum + p.precioCajon, 0);
    
    // Facturación Estimada: (Kilos por cajón * 0.90 de merma) * Precio de Venta Final
    const facturacionEstimada = prodsActivos.reduce((sum, p) => {
      const kilosUtiles = p.cantidadCajon * 0.90;
      return sum + (kilosUtiles * p.precioFinal);
    }, 0);
    
    // Ganancia Estimada: Facturación Total - Inversión Total
    const gananciaEstimada = facturacionEstimada - totalInvertido;
    
    // Margen Promedio: (Ganancia Total / Facturación Total) * 100
    const margenPromedio = facturacionEstimada > 0 ? (gananciaEstimada / facturacionEstimada) * 100 : 0;

    return {
      totalInvertido, facturacionEstimada, gananciaEstimada, margenPromedio,
      prodsActivos: prodsActivos.length,
      prodsInactivos: productosCalculados.length - prodsActivos.length,
      combosActivos: combosCalculados.filter(c => c.activo).length,
      combosInactivos: combosCalculados.length - combosCalculados.filter(c => c.activo).length
    };
  }, [productosCalculados, combosCalculados]);

  const actualizarProducto = (id, campo, valor) => {
    const nuevosProductos = productos.map(p => {
      if (p.id === id) {
        const updated = { ...p, [campo]: valor };
        syncWithSheet(updated);
        return updated;
      }
      return p;
    });
    setProductos(nuevosProductos);
  };

  const agregarProducto = () => {
    setTempProd({ 
      nombre: '', 
      categoria: 'hoja verde', 
      cantidadCajon: 1, 
      unidad: 'kg', 
      precioCajon: 0, 
      margen: 70, 
      precioMaxManual: '' 
    });
    setShowModalProd(true);
  };

  const guardarNuevoProd = async () => {
    if (!tempProd.nombre) return alert("El nombre es obligatorio");
    
    // 1. Crear el objeto para el estado local
    const nuevo = { 
      ...tempProd,
      id: Date.now(), 
      precioMaxManual: tempProd.precioMaxManual !== '' ? Number(tempProd.precioMaxManual) : null,
      activo: true,
      fila: null // Aún no tiene fila asignada por el Sheet
    };

    // 2. Actualizar estado local (y localStorage vía useEffect)
    setProductos(prev => [...prev, nuevo]);
    setShowModalProd(false);

    // 3. Sincronizar con Google Sheet vía Apps Script
    if (APPS_SCRIPT_URL) {
      const payload = { 
        accion: 'updatePanelCostos',
        producto: nuevo.nombre,
        costo_cajon: nuevo.precioCajon,
        kilos_cajon: nuevo.cantidadCajon,
        margen: nuevo.margen,
        precio_maximo: nuevo.precioMaxManual,
        activo: true
      };

      try {
        await fetch(APPS_SCRIPT_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain' },
        });
      } catch (e) {
        console.error('Error enviando nuevo producto:', e);
      }
    }
  };

  const eliminarProducto = (id) => {
    if (window.confirm("¿Eliminar este producto? Los cambios remotos deben hacerse directamente en el Sheet.")) {
      setProductos(prev => prev.filter(p => p.id !== id));
    }
  };

  const abrirModalNuevo = () => {
    setComboEditando(null);
    setTempCombo({ nombre: '', descripcion: '', productos: [], descuento: 0, precioManual: '', activo: true });
    setShowModalCombo(true);
  };

  const abrirModalEditar = (combo) => {
    setComboEditando(combo.id);
    setTempCombo({ ...combo });
    setShowModalCombo(true);
  };

  const guardarCombo = () => {
    if (!tempCombo.nombre) return alert("El nombre es obligatorio");
    if (comboEditando) {
      setCombos(prev => prev.map(c => c.id === comboEditando ? { ...tempCombo, id: c.id } : c));
    } else {
      setCombos([...combos, { ...tempCombo, id: Date.now() }]);
    }
    setShowModalCombo(false);
  };

  const eliminarCombo = (id) => {
    if (window.confirm("¿Segur@ que querés eliminar este combo?")) {
      setCombos(prev => prev.filter(c => c.id !== id));
    }
  };

  const toggleProdEnCombo = (prodId) => {
    const existe = tempCombo.productos.find(p => p.id === prodId);
    if (existe) {
      setTempCombo({ ...tempCombo, productos: tempCombo.productos.filter(p => p.id !== prodId) });
    } else {
      setTempCombo({ ...tempCombo, productos: [...tempCombo.productos, { id: prodId, cantidad: 1 }] });
    }
  };

  const updateCantProdEnCombo = (prodId, cant) => {
    setTempCombo({
      ...tempCombo,
      productos: tempCombo.productos.map(p => p.id === prodId ? { ...p, cantidad: Number(cant) } : p)
    });
  };

  const publicar = async () => {
    console.log('[PUBLICAR] Botón apretado - iniciando publicación...');
    setPublicando(true);
    setError(null);

    const dataPayload = {
      accion: 'publicarPrecios',
      monto_minimo: montoMinimo,
      mensaje_minimo: `El pedido mínimo es de $${montoMinimo.toLocaleString('es-AR')}`,
      productos: productosCalculados.filter(p => p.activo).map(p => ({
        nombre: p.nombre,
        precio: p.precioFinal,
        unidad: (p.unidad || '').toLowerCase().replace(/\bunidad\b/gi, '').trim(),
        activo: true
      })),
      combos: combosCalculados.filter(c => c.activo).map(c => ({
        nombre: c.nombre,
        precio: c.precioFinal || 0,
        descripcion: (c.descripcion || '').replace(/\b0\.5\s*(unidad)?\b/gi, '1/2 kilo').replace(/\bunidad\b/gi, '').replace(/\s+/g, ' ').trim(),
        items: c.productos.map(cp => {
          const p = productos.find(prod => prod.id === cp.id || prod.nombre === cp.nombre);
          const nombre = p ? p.nombre : (cp.nombre || `ID:${cp.id}`);
          const cantidad = cp.cantidad;
          const unidad = (p ? p.unidad : '').toLowerCase();
          const displayCantidad = cantidad === 0.5 ? '1/2' : cantidad;

          // Reglas de formato del usuario con pluralización:
          // 1. Maple: "1 maple Nº1 x30" o "2 maples Nº1 x30"
          if (unidad.includes('maple')) {
            const namePart = nombre.replace(/huevos/gi, '').trim();
            const uPlural = pluralizar(cantidad, 'maple');
            return `${displayCantidad} ${uPlural} ${namePart}${namePart.includes('x30') ? '' : ' x30'}`.replace(/\s+/g, ' ').trim();
          }
          // 2. Por kilo: "1 kilo Papa" o "2 kilos Papa"
          if (unidad.includes('kg')) {
            const uKilo = cantidad <= 1 ? 'kilo' : 'kilos';
            return `${displayCantidad} ${uKilo} ${nombre}`;
          }
          // 3. Por atado: "1 atado Rúcula" o "2 atados Rúcula"
          if (unidad.includes('atado')) {
            const uPlural = pluralizar(cantidad, 'atado');
            return `${displayCantidad} ${uPlural} ${nombre}`;
          }
          // 4. Por unidad: "1 Palta" o "3 Paltas" (si es 0.5 es "1/2 kilo")
          if (cantidad === 0.5) return `1/2 kilo ${nombre}`;
          const nombrePlural = pluralizar(cantidad, nombre);
          return `${displayCantidad} ${nombrePlural}`.replace(/\bunidad\b/gi, '').replace(/\s+/g, ' ').trim();
        }),
        activo: true
      }))
    };

    try {
      // 1. PUBLICAR EN GOOGLE SHEETS (Vía Apps Script)
      if (APPS_SCRIPT_URL) {
        const appsRes = await fetch(APPS_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify(dataPayload)
        });

        if (!appsRes.ok) {
          throw new Error(`Google Sheets HTTP Error ${appsRes.status}: ${appsRes.statusText}`);
        }

        try {
          const appsJson = await appsRes.json();
          if (appsJson && appsJson.success === false) {
            throw new Error(`Google Sheets Apps Script: ${appsJson.error || 'Error desconocido'}`);
          }
        } catch (jsonErr) {
          if (jsonErr.message && jsonErr.message.includes('Google Sheets Apps Script')) {
            throw jsonErr;
          }
        }
      }

      // 2. PUBLICAR EN GITHUB PAGES (Vía Vercel Serverless Function)
      const githubRes = await fetch('/api/publicar-precios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contenido: dataPayload })
      });
      
      const ghData = await githubRes.json().catch(() => ({}));
      console.log('[PUBLICAR] Respuesta de la API GitHub:', ghData);

      if (!githubRes.ok || ghData.success === false) {
        throw new Error(`GitHub: ${ghData.error || ('HTTP ' + githubRes.status)}`);
      }

      const ahora = new Date().toLocaleString('es-AR', { 
        day: '2-digit', month: '2-digit', year: 'numeric', 
        hour: '2-digit', minute: '2-digit' 
      });
      alert(`✅ Precios publicados correctamente en Google Sheets y GitHub\nFecha: ${ahora}`);
    } catch (err) {
      console.error('Error publicando precios:', err);
      setError("Error al publicar: " + err.message);
      alert(`❌ Error al publicar precios:\n${err.message}`);
    } finally {
      setPublicando(false);
    }
  };

  if (cargando) return <div className="flex flex-col items-center justify-center min-h-[400px] text-gray-500 gap-4"><Loader2 className="animate-spin text-green-500" size={40} /><p className="animate-pulse font-bold text-xs uppercase tracking-widest text-center">Cargando Costos...</p></div>;

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Panel de Costos v3.1</h2>
          <div className="flex items-center gap-2 mt-1">
            {error ? (
              <span className="flex items-center gap-1.5 text-xs text-amber-400 font-medium">
                <AlertTriangle size={13} /> {error}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-green-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)] animate-pulse" />
                Sincronizado con Google Sheets {ultimaSync ? `(${ultimaSync} hs)` : ''} · {productos.length} productos cargados
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-3">
          {/* Botones movidos abajo para evitar obstrucciones */}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <ResumenCard titulo="Inversión total" valor={$$(resumen.totalInvertido)} sub="Suma de costo de cajones" icon={ShoppingCart} color="blue" />
        <ResumenCard titulo="Facturación Est." valor={$$(resumen.facturacionEstimada)} sub="Venta total (con 10% merma)" icon={TrendingUp} color="green" />
        <ResumenCard titulo="Ganancia Est." valor={$$(resumen.gananciaEstimada)} sub="Diferencia (Fact. - Inv.)" icon={Check} color="amber" />
        <ResumenCard titulo="Margen Promedio" valor={`${resumen.margenPromedio.toFixed(1)}%`} sub="Eficiencia sobre venta" icon={TrendingUp} color="purple" />
      </div>

      <div className="bg-[#1f2937] border border-gray-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Package size={20} className="text-green-500" /> PRODUCTOS INDIVIDUALES
            </h3>
            <p className="text-gray-400 text-xs mt-0.5">
              Costos vigentes calculados con merma automática de 1kg para pesados, y costo directo para unidades.
            </p>
          </div>
          <button onClick={agregarProducto} className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-green-950/40 cursor-pointer">
            <Plus size={16} /> Agregar nuevo
          </button>
        </div>

        {/* Pestañas de Filtro por Categoría Principal */}
        <div className="flex flex-wrap gap-2 px-6 pt-4 pb-3 bg-gray-900/40 border-b border-gray-800">
          {['Todas', ...CATEGORIAS_PRINCIPALES].map(cat => {
            const activo = categoriaFiltro === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => { setCategoriaFiltro(cat); setSubcategoriaAlmacen('Todas'); }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activo 
                    ? 'bg-green-600 text-white shadow-lg shadow-green-900/40' 
                    : 'bg-black/30 text-gray-400 hover:text-white hover:bg-white/5 border border-white/5'
                }`}
              >
                {cat === 'Verduras' && '🥬 '}
                {cat === 'Frutas' && '🍎 '}
                {cat === 'Almacén' && '🥫 '}
                {cat === 'Extras' && '🥚 '}
                {cat === 'Carnes' && '🥩 '}
                {cat}
              </button>
            );
          })}
        </div>

        {/* Subcategorías si Almacén está seleccionado */}
        {categoriaFiltro === 'Almacén' && (
          <div className="flex flex-wrap items-center gap-1.5 px-6 py-2.5 bg-amber-950/20 border-b border-amber-500/20 text-xs">
            <span className="text-[10px] uppercase tracking-wider font-bold text-amber-400 mr-2">Subcategoría:</span>
            {['Todas', ...SUBCATEGORIAS_ALMACEN].map(sub => {
              const activo = subcategoriaAlmacen === sub;
              return (
                <button
                  key={sub}
                  type="button"
                  onClick={() => setSubcategoriaAlmacen(sub)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                    activo 
                      ? 'bg-amber-500 text-black font-bold' 
                      : 'bg-black/40 text-gray-400 hover:text-white border border-white/5'
                  }`}
                >
                  {sub}
                </button>
              );
            })}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#111827] text-gray-500 uppercase tracking-widest font-bold">
              <tr>
                <th className="px-6 py-4">Producto</th>
                <th className="px-6 py-4">Cajón / Kilos / Uds</th>
                <th className="px-6 py-4">Costo U.</th>
                <th className="px-6 py-4">Margen %</th>
                <th className="px-6 py-4">Precio (+M)</th>
                <th className="px-6 py-4">Tope Manual</th>
                <th className="px-6 py-4">Precio Final</th>
                <th className="px-6 py-4">M. Real</th>
                <th className="px-6 py-4">Ganancia</th>
                <th className="px-6 py-4">Sincronización</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {[
                { id: 'Verduras', label: '🥬 VERDURAS', color: 'text-green-400' },
                { id: 'Frutas', label: '🍎 FRUTAS', color: 'text-red-400' },
                { id: 'Almacén', label: '🥫 ALMACÉN', color: 'text-amber-400' },
                { id: 'Extras', label: '🥚 EXTRAS', color: 'text-purple-400' },
                { id: 'Carnes', label: '🥩 CARNES', color: 'text-rose-400' }
              ]
              .filter(g => categoriaFiltro === 'Todas' || g.id === categoriaFiltro)
              .map(cat => {
                const catItems = productosCalculados.filter(p => {
                  const pCat = p.categoriaPrincipal || getCategoriaPrincipal(p.nombre);
                  if (pCat !== cat.id) return false;
                  if (categoriaFiltro === 'Almacén' && subcategoriaAlmacen !== 'Todas' && p.subcategoria !== subcategoriaAlmacen) {
                    return false;
                  }
                  return true;
                });
                if (catItems.length === 0) return null;
                
                return (
                  <Fragment key={cat.id}>
                    <tr className="bg-gray-900/80">
                      <td colSpan="10" className="px-6 py-2.5 border-y border-gray-800">
                        <div className="flex items-center justify-between">
                          <span className={`text-[11px] font-black uppercase tracking-[0.2em] ${cat.color}`}>{cat.label}</span>
                          <span className="text-[10px] text-gray-500 font-mono">{catItems.length} {catItems.length === 1 ? 'producto' : 'productos'}</span>
                        </div>
                      </td>
                    </tr>
                    {catItems.map(p => (
                      <tr key={p.id} className={`hover:bg-gray-800/40 transition-colors ${!p.activo ? 'opacity-40' : ''}`}>
                        <td className="px-6 py-4">
                          <p className="font-bold text-white text-sm">{p.nombre}</p>
                          <p className="text-[10px] text-gray-500 font-medium">
                            {p.subcategoria ? `${p.subcategoria} · ` : ''}Fila: {p.fila || '-'}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-gray-400">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-gray-500 font-mono text-[10px]">$</span>
                            <input 
                              type="number" 
                              className="bg-gray-900 border border-gray-800 rounded-lg w-20 px-2 py-1 focus:border-green-500 outline-none text-white block font-mono font-bold"
                              value={p.precioCajon}
                              onChange={(e) => actualizarProducto(p.id, 'precioCajon', Number(e.target.value))}
                              title="Costo total pagado por el cajón o lote"
                            />
                          </div>
                          <div className="flex items-center gap-1 mt-1">
                            <input 
                              type="number" 
                              min="0.1"
                              step="any"
                              className="bg-gray-900 border border-gray-800 rounded-lg w-14 px-1.5 py-0.5 text-white font-mono text-xs focus:border-green-500 outline-none"
                              value={p.cantidadCajon}
                              onChange={(e) => actualizarProducto(p.id, 'cantidadCajon', Number(e.target.value) || 1)}
                              title={p.esPesado ? "Kilos brutos comprados (se resta 1kg de merma automáticamente)" : "Cantidad de unidades compradas"}
                            />
                            <span className="text-[10px] text-gray-500 uppercase font-mono">{p.unidad}</span>
                            {p.esPesado && (
                              <span 
                                className="text-[9px] text-amber-400 font-mono px-1 py-0.2 rounded bg-amber-400/10 border border-amber-400/20" 
                                title={`Costo calculado sobre ${(Math.max(0.1, p.cantidadCajon - 1)).toFixed(1)} kg netos (1kg de merma descontado)`}
                              >
                                -1kg merma
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono text-gray-300 font-bold">
                          {$$(p.costoUnitario.toFixed(0))}
                          <span className="text-[9px] text-gray-500 block font-normal">/{p.unidad}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1">
                            <input 
                              type="number" 
                              className="bg-gray-900 border border-gray-800 rounded-lg w-12 px-1 py-1 focus:border-green-500 outline-none text-white text-right font-mono"
                              value={p.margen}
                              onChange={(e) => actualizarProducto(p.id, 'margen', Number(e.target.value))}
                            />
                            <span className="text-gray-500">%</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono text-blue-400 font-bold">{$$(p.precioConMargen.toFixed(0))}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1">
                            <Lock size={10} className="text-gray-600" />
                            <input 
                              type="number" 
                              className="bg-gray-900 border border-gray-800 rounded w-16 px-1.5 py-1 focus:border-amber-500 outline-none font-mono text-xs"
                              placeholder="Auto"
                              value={p.precioMaxManual || ''}
                              onChange={(e) => actualizarProducto(p.id, 'precioMaxManual', e.target.value ? Number(e.target.value) : null)}
                            />
                          </div>
                        </td>
                        <td className="px-6 py-4 relative">
                          <span className="text-sm font-black text-green-400 font-mono">{$$(p.precioFinal.toFixed(0))}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`font-bold px-2 py-0.5 rounded-full ${p.margenReal > 50 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-500'}`}>
                            {p.margenReal.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono text-gray-500">+$ {p.gananciaUnidad.toFixed(0)}</td>
                        <td className="px-6 py-4 flex items-center gap-3">
                          <button 
                            onClick={() => actualizarProducto(p.id, 'activo', !p.activo)}
                            className={`w-10 h-5 rounded-full relative ${p.activo ? 'bg-green-600' : 'bg-gray-700'}`}
                          >
                            <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${p.activo ? 'right-1' : 'left-1'}`} />
                          </button>
                          <button onClick={() => eliminarProducto(p.id)} className="p-1.5 text-gray-500 hover:text-red-400"><Trash2 size={16} /></button>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-gray-900/40 p-6 rounded-3xl border border-gray-800">
        <div>
          <h3 className="text-lg font-bold text-white">Acciones de Publicación</h3>
          <p className="text-xs text-gray-500">Sincronizá con Google Sheets y publicá los precios actualizados</p>
        </div>
        <div className="flex gap-3 relative z-10">
          <button 
            onClick={cargarDatosDesdeSheet} 
            disabled={sincronizando}
            className={`flex items-center gap-2.5 px-6 py-4 rounded-2xl transition-all border font-bold text-xs cursor-pointer shadow-lg active:scale-95 ${
              sincronizadoExito
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.35)]'
                : sincronizando
                ? 'bg-gray-800 text-gray-400 border-gray-700 cursor-wait'
                : 'bg-gray-800 hover:bg-gray-700 text-white border-gray-700 hover:border-gray-600'
            }`}
          >
            {sincronizando ? (
              <Loader2 size={18} className="animate-spin text-green-400" />
            ) : sincronizadoExito ? (
              <Check size={18} className="text-white" />
            ) : (
              <Globe size={18} className="text-green-400" />
            )}
            <span>
              {sincronizando 
                ? 'Sincronizando...' 
                : sincronizadoExito 
                ? '¡Sincronizado con Sheet!' 
                : 'Sincronizar Sheet'}
            </span>
          </button>
          <button
            onClick={publicar}
            disabled={publicando}
            className="flex items-center gap-2 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white font-bold px-8 py-4 rounded-2xl transition-all shadow-lg hover:shadow-green-500/20 active:scale-95 pointer-events-auto"
          >
            {publicando ? <Settings className="animate-spin" size={20} /> : <Globe size={20} />}
            {publicando ? 'Publicando...' : 'Publicar precios'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-[#1f2937] border border-gray-800 rounded-3xl overflow-hidden shadow-xl">
          <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <ShoppingCart size={20} className="text-amber-500" /> COMBOS (Local)
            </h3>
            <button onClick={abrirModalNuevo} className="bg-gray-800 hover:bg-gray-700 text-white text-xs px-4 py-2 rounded-xl transition-all"><Plus size={16} /> Crear combo</button>
          </div>
          <div className="p-6 space-y-4">
            {combosCalculados.map(c => (
              <div key={c.id} className={`bg-[#111827] border border-gray-800 rounded-2xl p-4 relative ${!c.activo ? 'opacity-50' : ''}`}>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="font-bold text-white text-md">{c.nombre}</h4>
                    <p className="text-[10px] text-gray-500 italic mt-0.5">{c.descripcion || 'Sin descripción'}</p>
                    {c.alertaProdOff && <p className="text-[10px] text-amber-500 font-bold mt-1 tracking-tighter uppercase flex items-center gap-1"><AlertTriangle size={10} /> Productos inactivos detectados</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => abrirModalEditar(c)} className="p-1.5 text-gray-500 hover:text-blue-400"><Edit2 size={14} /></button>
                    <button onClick={() => eliminarCombo(c.id)} className="p-1.5 text-gray-500 hover:text-red-400"><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-2 border-t border-gray-800 pt-3">
                  <div><p className="text-[10px] text-gray-500 uppercase">Subtotal</p><p className="font-mono text-sm text-gray-400">{$$(c.subtotal.toFixed(0))}</p></div>
                  <div className="text-right"><p className="text-[10px] text-gray-500 uppercase">Final</p><p className="font-mono text-lg font-black text-amber-400">{$$(c.precioFinal.toFixed(0))}</p></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#1f2937] border border-gray-800 rounded-3xl overflow-hidden shadow-xl">
          <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Settings size={20} className="text-blue-500" /> CONFIGURACIÓN GLOBAL (Local)
            </h3>
          </div>
          <div className="p-8 space-y-6">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-3">Pedido mínimo</label>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-black text-white">$</span>
                <input type="number" value={montoMinimo} onChange={(e) => setMontoMinimo(Number(e.target.value))} className="bg-[#111827] border border-gray-800 text-3xl font-black text-green-500 rounded-2xl w-full px-4 py-3" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-3">Mensaje</label>
              <textarea value={mensajeMinimo} onChange={(e) => setMensajeMinimo(e.target.value)} className="bg-[#111827] border border-gray-800 text-sm text-gray-400 rounded-2xl w-full px-4 py-3 h-32 resize-none" />
            </div>
          </div>
        </div>
      </div>

      {showModalProd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm shadow-2xl">
          <div className="bg-[#1f2937] border border-gray-800 rounded-3xl w-full max-w-lg overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus size={20} className="text-green-500" /> AGREGAR PRODUCTO
              </h3>
              <button onClick={() => setShowModalProd(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            
            <div className="p-8 space-y-5 overflow-y-auto max-h-[70vh]">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Nombre del Producto</label>
                <input 
                  type="text" 
                  autoFocus
                  className="w-full bg-gray-900 border border-gray-800 rounded-2xl px-4 py-3 text-white focus:border-green-500 outline-none transition-all"
                  placeholder="Ej: Banana Ecuador"
                  value={tempProd.nombre}
                  onChange={(e) => setTempProd({...tempProd, nombre: e.target.value})}
                />
              </div>

              {/* Categoría Principal */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Categoría Principal</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {CATEGORIAS_PRINCIPALES.map(cat => (
                    <button 
                      key={cat}
                      type="button"
                      onClick={() => {
                        const esUnidadDefault = cat === 'Almacén' || cat === 'Extras';
                        setTempProd({
                          ...tempProd, 
                          categoriaPrincipal: cat,
                          subcategoria: cat === 'Almacén' ? (tempProd.subcategoria || 'Almacén') : '',
                          unidad: esUnidadDefault ? 'unidad' : 'kg'
                        });
                      }}
                      className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all border cursor-pointer ${
                        tempProd.categoriaPrincipal === cat 
                          ? 'bg-green-600 border-green-500 text-white shadow-md' 
                          : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subcategoría de Almacén */}
              {tempProd.categoriaPrincipal === 'Almacén' && (
                <div className="space-y-2 p-3 rounded-2xl bg-amber-950/20 border border-amber-500/20 animate-in fade-in">
                  <label className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Subcategoría de Almacén</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {SUBCATEGORIAS_ALMACEN.map(sub => (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => setTempProd({ ...tempProd, subcategoria: sub })}
                        className={`py-2 px-1 rounded-xl text-[10px] font-bold transition-all border cursor-pointer ${
                          tempProd.subcategoria === sub
                            ? 'bg-amber-500 border-amber-400 text-black font-black'
                            : 'bg-black/40 border-white/5 text-gray-400 hover:text-white'
                        }`}
                      >
                        {sub}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Unidad de Medida */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Unidad de Venta / Stock</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'kg', label: 'Por Kilo (kg) — Flujo Pesado con 1kg merma' },
                    { id: 'unidad', label: 'Por Unidad (unidad) — Carga directa sin merma' }
                  ].map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setTempProd({ ...tempProd, unidad: u.id })}
                      className={`p-2.5 rounded-xl text-left text-[11px] font-bold border transition-all cursor-pointer ${
                        tempProd.unidad === u.id
                          ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                          : 'bg-gray-900 border-gray-800 text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {u.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Kilos / Cantidad y Costo Total */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                    {tempProd.unidad === 'kg' ? 'Kilos Brutos Cajón' : 'Cantidad de Unidades'}
                  </label>
                  <input 
                    type="number" 
                    min="0.1"
                    step="any"
                    className="w-full bg-gray-900 border border-gray-800 rounded-2xl px-4 py-3 text-white focus:border-green-500 outline-none transition-all font-mono"
                    value={tempProd.cantidadCajon}
                    onChange={(e) => setTempProd({...tempProd, cantidadCajon: Number(e.target.value) || 1})}
                  />
                  {tempProd.unidad === 'kg' ? (
                    <p className="text-[10px] text-amber-400">Se resta 1kg de merma para calcular el costo ({Math.max(0.1, (tempProd.cantidadCajon || 1) - 1).toFixed(1)} kg netos).</p>
                  ) : (
                    <p className="text-[10px] text-gray-500">Costo directo = total ÷ cantidad.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                    {tempProd.unidad === 'kg' ? 'Precio Cajón / Lote ($)' : 'Costo Total Pagado ($)'}
                  </label>
                  <input 
                    type="number" 
                    min="0"
                    className="w-full bg-gray-900 border border-gray-800 rounded-2xl px-4 py-3 text-white focus:border-green-500 outline-none transition-all font-mono font-bold"
                    value={tempProd.precioCajon}
                    onChange={(e) => setTempProd({...tempProd, precioCajon: Number(e.target.value) || 0})}
                  />
                  <p className="text-[10px] text-emerald-400 font-mono">
                    Costo U.: ${tempProd.precioCajon && tempProd.cantidadCajon 
                      ? Math.round(tempProd.precioCajon / (tempProd.unidad === 'kg' ? Math.max(0.1, tempProd.cantidadCajon - 1) : Math.max(1, tempProd.cantidadCajon)))
                      : 0} / {tempProd.unidad}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Margen (%)</label>
                  <input 
                    type="number" 
                    className="w-full bg-gray-900 border border-gray-800 rounded-2xl px-4 py-3 text-white focus:border-green-500 outline-none transition-all font-bold text-green-500 font-mono"
                    value={tempProd.margen}
                    onChange={(e) => setTempProd({...tempProd, margen: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Tope Máximo (Opcional)</label>
                  <input 
                    type="number" 
                    className="w-full bg-gray-900 border border-gray-800 rounded-2xl px-4 py-3 text-white focus:border-amber-500 outline-none transition-all font-mono"
                    placeholder="Desactivado"
                    value={tempProd.precioMaxManual}
                    onChange={(e) => setTempProd({...tempProd, precioMaxManual: e.target.value === '' ? '' : Number(e.target.value)})}
                  />
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-800 bg-gray-900/30 flex gap-3">
              <button 
                onClick={() => setShowModalProd(false)} 
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-bold py-4 rounded-2xl transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={guardarNuevoProd} 
                className="flex-[2] bg-green-500 hover:bg-green-400 text-white font-black py-4 rounded-2xl shadow-lg shadow-green-500/20 transition-all border-b-4 border-green-700 active:border-b-0 active:translate-y-1"
              >
                GUARDAR PRODUCTO
              </button>
            </div>
          </div>
        </div>
      )}

      {showModalCombo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1f2937] border border-gray-800 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
              <h3 className="text-lg font-bold text-white">{comboEditando ? 'EDITAR COMBO' : 'CREAR COMBO'}</h3>
              <button onClick={() => setShowModalCombo(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div><label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Nombre</label><input type="text" value={tempCombo.nombre} onChange={(e) => setTempCombo({...tempCombo, nombre: e.target.value})} className="w-full bg-[#111827] border border-gray-800 text-white rounded-xl px-4 py-3" /></div>
                <div><label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Precio Manual ($)</label><input type="number" placeholder="Calculado si vacío" value={tempCombo.precioManual} onChange={(e) => setTempCombo({...tempCombo, precioManual: e.target.value})} className="w-full bg-[#111827] border border-gray-800 text-white rounded-xl px-4 py-3" /></div>
                <div><label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Descuento %</label><input type="number" value={tempCombo.descuento} onChange={(e) => setTempCombo({...tempCombo, descuento: Number(e.target.value)})} className="w-full bg-[#111827] border border-gray-800 text-white rounded-xl px-4 py-3" /></div>
              </div>
              <div><label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Productos</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                  {productosCalculados.map(p => {
                    const seleccionado = tempCombo.productos.find(item => item.id === p.id || item.nombre === p.nombre);
                    return (
                      <div key={p.id} className={`flex items-center justify-between p-3 rounded-xl border ${seleccionado ? 'bg-green-500/10 border-green-500/30' : 'bg-[#111827] border-gray-800'}`}>
                        <div className="flex items-center gap-3">
                          <input type="checkbox" checked={!!seleccionado} onChange={() => toggleProdEnCombo(p.id)} className="accent-green-500" />
                          <div><p className="text-xs font-bold text-white">{p.nombre}</p><p className="text-[10px] text-gray-600">{$$(p.precioFinal)}/kg</p></div>
                        </div>
                        {seleccionado && <input type="number" value={seleccionado.cantidad} onChange={(e) => updateCantProdEnCombo(p.id, e.target.value)} className="w-12 bg-gray-900 border border-gray-700 text-white text-xs rounded text-center" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-800 flex gap-3">
              <button onClick={() => setShowModalCombo(false)} className="flex-1 bg-gray-800 text-white font-bold py-3 rounded-2xl">Cancelar</button>
              <button onClick={guardarCombo} className="flex-[2] bg-green-500 text-white font-bold py-3 rounded-2xl shadow-lg">Guardar Combo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResumenCard({ titulo, valor, sub, icon: Icon, color }) {
  const colors = { green: 'bg-green-500/10 text-green-500 border-green-500/20', blue: 'bg-blue-500/10 text-blue-500 border-blue-500/20', amber: 'bg-amber-500/10 text-amber-500 border-amber-500/20', purple: 'bg-purple-500/10 text-purple-500 border-purple-500/20' };
  return (
    <div className="bg-[#1f2937] border border-gray-800 rounded-2xl p-5 hover:border-gray-700 transition-all">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 border ${colors[color]}`}><Icon size={18} /></div>
      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{titulo}</p>
      <p className="text-xl font-black text-white mt-1">{valor}</p>
      <p className="text-[10px] text-gray-600 font-medium mt-1">{sub}</p>
    </div>
  );
}
