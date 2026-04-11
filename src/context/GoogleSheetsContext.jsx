import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { KEYS } from '../config/keys';
import { PEDIDOS as PEDIDOS_MOCK } from '../data/mockData';
import { getTipoByNombre } from '../data/productUtils';

const GoogleSheetsContext = createContext();

const SHEET_ID = import.meta.env.VITE_SHEET_ID;
const API_KEY  = import.meta.env.VITE_GOOGLE_SHEETS_KEY || import.meta.env.VITE_GOOGLE_API_KEY;
const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL;

export function GoogleSheetsProvider({ children }) {
  const [pedidos, setPedidos]         = useState(PEDIDOS_MOCK);
  const [productosCostos, setProductosCostos] = useState([]);
  const [stockData, setStockData]     = useState({});
  const [cargando, setCargando]       = useState(false);
  const [error, setError]             = useState(null);
  const [conectado, setConectado]     = useState(false);
  const [ultimoRefresco, setUltimoRefresco] = useState(new Date());

  const URL_SHEET = `https://docs.google.com/spreadsheets/d/${KEYS.SHEET_ID}/edit`;

  // Carga única al montar — sin polling
  useEffect(() => {
    fetchSheetPedidos();
  }, []);

  // Estabilización de funciones con useCallback
  const fetchSheetPedidos = useCallback(async () => {
    if (!API_KEY || !SHEET_ID) {
      console.warn('[SHEETS] Faltan VITE_SHEET_ID o API_KEY en .env');
      return;
    }

    setCargando(true);
    console.log('[SHEETS] Cargando pedidos...');

    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Pedidos?key=${API_KEY}`;
      const gres = await fetch(url);
      const data = await gres.json();

      if (!gres.ok) throw new Error(data?.error?.message || `HTTP ${gres.status}`);

      const rows = data.values;
      if (!rows || rows.length < 2) {
        console.warn('[SHEETS] Hoja vacía o sin filas de datos.');
        setConectado(false);
        return;
      }

      const headers = rows[0].map(h =>
        h.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ /g, '_')
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
          total:           Number(obj.total || 0),
          estado_pago:     obj.estado_pago || obj.pago || 'pendiente',
          dia_entrega:     obj.dia_entrega || obj.dia || 'Martes',
          horario_entrega: obj.horario_entrega || obj.turno_entrega || obj.turno || '09:00 - 13:00',
          turno_entrega:   obj.turno_entrega || obj.turno || 'mañana',
          estado:          obj.estado || 'pendiente',
          email:           obj.email || '',
        };
      });

      setPedidos(parsedPedidos);
      setConectado(true);
      setUltimoRefresco(new Date());
      setError(null);
      console.log(`[SHEETS] ✅ ${parsedPedidos.length} pedidos cargados.`);

    } catch (e) {
      console.error('[SHEETS] ❌ Error al cargar:', e.message);
      setError(e.message);
      setConectado(false);
    } finally {
      setCargando(false);
    }
  }, []);

  const fetchPanelCostos = useCallback(async () => {
    if (!API_KEY || !SHEET_ID) {
      console.warn('[SHEETS-COSTOS] No se puede cargar: Faltan API_KEY o SHEET_ID');
      return;
    }
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/PanelCostos?key=${API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error?.message || `Error HTTP ${res.status}`);
      }

      const rows = data.values;
      if (!rows || rows.length < 2) return;
      
      const mapped = rows.slice(1).map((row, index) => {
        const nombre = row[0] || 'Sin nombre';
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
          unidad: 'kg'
        };
      });

      setProductosCostos(mapped);
      localStorage.setItem('huerta_data_costos_v1_productos', JSON.stringify(mapped));
    } catch (e) {
      console.error('[SHEETS-COSTOS] Error:', e.message);
    }
  }, []);

  const fetchControlStock = useCallback(async () => {
    if (!API_KEY || !SHEET_ID) return;
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/ControlStock?key=${API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) return;
      const rows = data.values;
      if (!rows || rows.length < 2) return;

      const headers = rows[0].map(h => h.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ /g, '_'));
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
  }, []);

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

  const actualizarEstadoEnSheet = useCallback(async (fila, nuevoEstado) => {
    setPedidos(current =>
      current.map(p => p.sheetRowIndex === fila ? { ...p, estado: nuevoEstado } : p)
    );

    if (!APPS_SCRIPT_URL) return;

    try {
      await fetch(APPS_SCRIPT_URL, {
        method:  'POST',
        mode:    'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body:    JSON.stringify({ fila, estado: nuevoEstado }),
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
      await fetch(APPS_SCRIPT_URL, {
        method:  'POST',
        mode:    'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body:    JSON.stringify({ fila, remito_impreso: impreso }),
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
      await fetch(APPS_SCRIPT_URL, {
        method:  'POST',
        mode:    'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body:    JSON.stringify({ fila, ...payload }),
      });
    } catch (e) {
      console.error(`[SYNC ERROR]`, e.message);
    }
  }, []);

  return (
    <GoogleSheetsContext.Provider value={{
      pedidos, setPedidos,
      productosCostos, stockData, setStockData,
      ultimoRefresco,
      cargando,
      error,
      conectado,
      fetchSheetPedidos,
      cargarTodo,
      actualizarEstadoEnSheet,
      actualizarRemitoEnSheet,
      actualizarDatosCliente,
      urlSheet: URL_SHEET
    }}>
      {children}
    </GoogleSheetsContext.Provider>
  );
}

export function useGoogleSheets() {
  return useContext(GoogleSheetsContext);
}
