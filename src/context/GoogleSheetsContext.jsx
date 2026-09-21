import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { KEYS } from '../config/keys';
import { PEDIDOS as PEDIDOS_MOCK } from '../data/mockData';
import { 
  getTipoByNombre, 
  getUnidadByNombre, 
  getCategoriaPrincipal, 
  getSubcategoriaAlmacen, 
  ALMACEN_PRESETS 
} from '../data/productUtils';

const GoogleSheetsContext = createContext();

const SHEET_ID = import.meta.env.VITE_SHEET_ID;
const API_KEY  = import.meta.env.VITE_GOOGLE_SHEETS_KEY || import.meta.env.VITE_GOOGLE_API_KEY;
const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL;

export function GoogleSheetsProvider({ children }) {
  const [pedidos, setPedidos]         = useState(PEDIDOS_MOCK);
  const [productosCostos, setProductosCostos] = useState(() => {
    try {
      const s = localStorage.getItem('huerta_data_costos_v1_productos') || localStorage.getItem('huerta_data_costos_v31_productos');
      return s ? JSON.parse(s) : [];
    } catch (e) {
      return [];
    }
  });
  const [stockData, setStockData]     = useState({});
  const [cargando, setCargando]       = useState(false);
  const [error, setError]             = useState(null);
  const [conectado, setConectado]     = useState(false);
  const [ultimoRefresco, setUltimoRefresco] = useState(new Date());

  const URL_SHEET = `https://docs.google.com/spreadsheets/d/${KEYS.SHEET_ID}/edit`;

  // Helper de lectura resiliente con fallback automático
  const fetchRowsFromSheet = useCallback(async (tabName) => {
    // 1. Intentar vía API v4 oficial de Google Sheets
    if (API_KEY && SHEET_ID) {
      try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(tabName)}?key=${API_KEY}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data.values && data.values.length > 0) return data.values;
        } else {
          console.warn(`[SHEETS-API] Endpoint v4 devolvió ${res.status} para ${tabName}. Activando fallback gviz...`);
        }
      } catch (e) {
        console.warn(`[SHEETS-API] Error v4 para ${tabName}:`, e.message);
      }
    }

    // 2. Fallback resiliente: Google Visualization API (gvizz/tq)
    if (SHEET_ID) {
      try {
        const gvizUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(tabName)}`;
        const gvizRes = await fetch(gvizUrl);
        if (gvizRes.ok) {
          const text = await gvizRes.text();
          const start = text.indexOf('{');
          const end = text.lastIndexOf('}');
          if (start !== -1 && end !== -1) {
            const json = JSON.parse(text.substring(start, end + 1));
            if (json.status === 'ok' && json.table) {
              const headers = (json.table.cols || []).map(c => c.label || '');
              const rows = (json.table.rows || []).map(r => 
                (r.c || []).map(cell => (cell ? (cell.v !== null && cell.v !== undefined ? cell.v : cell.f || '') : ''))
              );
              return [headers, ...rows];
            }
          }
        }
      } catch (e) {
        console.warn(`[SHEETS-GVIZ] Fallback error para ${tabName}:`, e.message);
      }
    }

    return null;
  }, []);

  // Estabilización de funciones con useCallback
  const fetchSheetPedidos = useCallback(async () => {
    if (!SHEET_ID) {
      console.warn('[SHEETS] Falta VITE_SHEET_ID en .env');
      return;
    }

    setCargando(true);
    console.log('[SHEETS] Cargando pedidos...');

    try {
      const rows = await fetchRowsFromSheet('Pedidos');
      if (!rows || rows.length < 2) {
        console.warn('[SHEETS] Hoja vacía o sin filas de datos.');
        setConectado(false);
        return;
      }

      const headers = rows[0].map(h =>
        String(h || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ /g, '_')
      );

      const parsedPedidos = rows.slice(1).map((row, index) => {
        const obj = { sheetRowIndex: index + 2 };
        headers.forEach((h, i) => { obj[h] = row[i] || ''; });

        return {
          id:              obj.id || obj.numero_pedido || `REQ-${index}`,
          numero_pedido:   obj.numero_pedido || `#${index + 1000}`,
          sheetRowIndex:   obj.sheetRowIndex,
          fecha:           obj.get_fecha || obj.fecha || new Date().toISOString().split('T')[0],
          nombre:          obj.nombre || obj.cliente || 'Sin Nombre',
          telefono:        obj.telefono || obj.celular || '',
          direccion:       obj.direccion || '',
          localidad:       obj.localidad || obj.zona || '',
          producto:        obj.producto || obj.combo || '',
          cantidades:      Number(obj.cantidades || 1),
          observaciones:   obj.observaciones || obj.notas || '',
          total:           Number((obj.total || '0').toString().replace(/[$.]/g, '').replace(',', '.')) || 0,
          estado_pago:     obj.estado_pago || obj.pago || 'pendiente',
          dia_entrega:     obj.dia_entrega || obj.dia || 'Martes',
          horario_entrega: obj.horario_entrega || obj.turno_entrega || obj.turno || '09:00 - 13:00',
          turno_entrega:   obj.turno_entrega || obj.turno || 'mañana',
          estado:          obj.estado || 'pendiente',
          email:           obj.email || '',
          acepto_tyc:       obj.acepto_tyc || '',
          acepto_publicidad: obj.acepto_publicidad || '',
          motivo_no_entrega: obj.motivo_no_entrega || obj.motivo || obj.motivo_rechazo || '',
        };
      });

      let eliminados = [];
      let motivosLocales = {};
      try {
        eliminados = JSON.parse(localStorage.getItem('huerta_pedidos_eliminados') || '[]');
        motivosLocales = JSON.parse(localStorage.getItem('huerta_motivos_no_entrega_v1') || '{}');
      } catch (e) {}

      const pedidosProcesados = parsedPedidos
        .filter(p => !eliminados.includes(p.numero_pedido))
        .map(p => {
          if (motivosLocales[p.numero_pedido] && !p.motivo_no_entrega) {
            return { ...p, motivo_no_entrega: motivosLocales[p.numero_pedido] };
          }
          return p;
        });

      setPedidos(pedidosProcesados);
      setConectado(true);
      setUltimoRefresco(new Date());
      setError(null);
      console.log(`[SHEETS] ✅ ${pedidosProcesados.length} pedidos cargados (${eliminados.length} excluidos por eliminación local).`);

    } catch (e) {
      console.error('[SHEETS] ❌ Error al cargar:', e.message);
      setError(e.message);
      setConectado(false);
    } finally {
      setCargando(false);
    }
  }, [fetchRowsFromSheet]);

  const fetchPanelCostos = useCallback(async () => {
    if (!SHEET_ID) return;
    try {
      const rows = await fetchRowsFromSheet('PanelCostos');
      if (!rows || rows.length < 2) return;
      
      let mapped = rows.slice(1).map((row, index) => {
        let nombre = row[0] || 'Sin nombre';
        const fixAcentos = (str) => str
            .replace(/\bmorron\b/gi, m => m[0] === m[0].toUpperCase() ? 'Morrón' : 'morrón')
            .replace(/\brucula\b/gi, m => m[0] === m[0].toUpperCase() ? 'Rúcula' : 'rúcula')
            .replace(/\bbrocoli\b/gi, m => m[0] === m[0].toUpperCase() ? 'Brócoli' : 'brócoli')
            .replace(/\blimon\b/gi, m => m[0] === m[0].toUpperCase() ? 'Limón' : 'limón')
            .replace(/\barandanos\b/gi, m => m[0] === m[0].toUpperCase() ? 'Arándanos' : 'arándanos')
            .replace(/\barandano\b/gi, m => m[0] === m[0].toUpperCase() ? 'Arándano' : 'arándano');
        nombre = fixAcentos(nombre);

        return {
          fila: index + 2,
          id: index + 1,
          nombre: nombre,
          precioCajon: Number(row[1]) || 0,
          cantidadCajon: Number(row[2]) || 1,
          margen: Number(row[3]) || 60,
          precioMaxManual: row[4] ? Number(row[4]) : null,
          activo: row[5] === 'TRUE' || row[5] === 'true' || row[5] === '1',
          categoria: getTipoByNombre(nombre),
          categoriaPrincipal: getCategoriaPrincipal(nombre),
          subcategoria: getCategoriaPrincipal(nombre) === 'Almacén' ? getSubcategoriaAlmacen(nombre) : '',
          unidad: getUnidadByNombre(nombre)
        };
      });

      // Eliminar el producto 'Huevos' genérico
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

      setProductosCostos(mapped);
      localStorage.setItem('huerta_data_costos_v1_productos', JSON.stringify(mapped));
    } catch (e) {
      console.error('[SHEETS-COSTOS] Error:', e.message);
    }
  }, [fetchRowsFromSheet]);

  const fetchControlStock = useCallback(async () => {
    if (!SHEET_ID) return;
    try {
      const rows = await fetchRowsFromSheet('ControlStock');
      if (!rows || rows.length < 2) return;

      const headers = rows[0].map(h => String(h || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ /g, '_'));
      const parsedRows = rows.slice(1).map((row, index) => {
        const obj = { fila: index + 2 };
        headers.forEach((h, i) => { obj[h] = row[i] || ''; });
        return obj;
      });
      
      // Nota: Aquí se guarda como Array crudo del Sheet.
      // ControlStock.jsx se encargará de indexarlo como objeto si es necesario.
      setStockData(parsedRows);
    } catch (e) {
      console.error('[SHEETS-STOCK] Error:', e);
    }
  }, [fetchRowsFromSheet]);

  const cargarTodo = useCallback(async () => {
    setCargando(true);
    try {
      await Promise.all([
        fetchSheetPedidos(),
        fetchPanelCostos(),
        fetchControlStock()
      ]);
      setConectado(true);
    } catch (e) {
      console.error('[SHEETS-ALL] Error al cargar todo:', e);
    } finally {
      setCargando(false);
    }
  }, [fetchSheetPedidos, fetchPanelCostos, fetchControlStock]);

  useEffect(() => {
    fetchSheetPedidos();
    fetchPanelCostos();
    fetchControlStock();
  }, [fetchSheetPedidos, fetchPanelCostos, fetchControlStock]);

  const actualizarEstadoEnSheet = useCallback(async (fila, nuevoEstado, motivo = null) => {
    setPedidos(current =>
      current.map(p => {
        if (p.sheetRowIndex === fila) {
          return {
            ...p,
            estado: nuevoEstado,
            ...(motivo !== null ? { motivo_no_entrega: motivo } : {})
          };
        }
        return p;
      })
    );

    if (!APPS_SCRIPT_URL) return;

    try {
      const payload = {
        accion: 'updateEstado',
        action: 'updateEstado',
        fila,
        estado: nuevoEstado
      };
      if (motivo !== null) {
        payload.motivo_no_entrega = motivo;
        payload.motivo = motivo;
      }
      await fetch(APPS_SCRIPT_URL, {
        method:  'POST',
        mode:    'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body:    JSON.stringify(payload),
      });
    } catch (e) {
      console.error(`❌ [SYNC ERROR]`, e.message);
    }
  }, []);

  const actualizarRemitoEnSheet = useCallback(async (fila, impreso) => {
    setPedidos(current =>
      current.map(p => p.sheetRowIndex === fila ? { ...p, remito_impreso: impreso } : p)
    );
    if (!APPS_SCRIPT_URL) return;
    try {
      const payload = {
        accion: 'updateRemito',
        action: 'updateRemito',
        fila,
        remito_impreso: impreso
      };
      await fetch(APPS_SCRIPT_URL, {
        method:  'POST',
        mode:    'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body:    JSON.stringify(payload),
      });
    } catch (e) {
      console.error(`[SYNC ERROR]`, e.message);
    }
  }, []);

  const actualizarDatosCliente = useCallback(async (fila, payload) => {
    setPedidos(current =>
      current.map(p => p.sheetRowIndex === fila ? { ...p, ...payload } : p)
    );
    if (!APPS_SCRIPT_URL) return;
    try {
      const body = {
        accion: 'updateCliente',
        action: 'updateCliente',
        fila,
        ...payload
      };
      await fetch(APPS_SCRIPT_URL, {
        method:  'POST',
        mode:    'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body:    JSON.stringify(body),
      });
    } catch (e) {
      console.error(`[SYNC ERROR]`, e.message);
    }
  }, []);

  const eliminarPedidoOCliente = useCallback(async (numeroPedido, sheetRowIndex, emailOCliente) => {
    // 1. Quitar del estado en memoria
    setPedidos(current => current.filter(p => p.numero_pedido !== numeroPedido));

    // 2. Persistir en localStorage
    try {
      const eliminados = JSON.parse(localStorage.getItem('huerta_pedidos_eliminados') || '[]');
      if (!eliminados.includes(numeroPedido)) {
        eliminados.push(numeroPedido);
        localStorage.setItem('huerta_pedidos_eliminados', JSON.stringify(eliminados));
      }
    } catch (e) {}

    // 3. Notificar al backend de Google Sheets si está disponible
    if (!APPS_SCRIPT_URL) return;
    try {
      await fetch(APPS_SCRIPT_URL, {
        method:  'POST',
        mode:    'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body:    JSON.stringify({ 
          action: 'eliminar_pedido', 
          fila: sheetRowIndex, 
          numero_pedido: numeroPedido,
          email: emailOCliente 
        }),
      });
    } catch (e) {
      console.error(`❌ [DELETE SYNC ERROR]`, e.message);
    }
  }, []);

  return (
    <GoogleSheetsContext.Provider value={{
      pedidos, setPedidos,
      productosCostos, setProductosCostos, stockData, setStockData,
      ultimoRefresco,
      cargando,
      error,
      conectado,
      fetchSheetPedidos,
      fetchControlStock,
      cargarTodo,
      actualizarEstadoEnSheet,
      actualizarRemitoEnSheet,
      actualizarDatosCliente,
      eliminarPedidoOCliente,
      urlSheet: URL_SHEET
    }}>
      {children}
    </GoogleSheetsContext.Provider>
  );
}

export function useGoogleSheets() {
  return useContext(GoogleSheetsContext);
}
