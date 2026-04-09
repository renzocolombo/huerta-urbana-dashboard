import { createContext, useContext, useState, useEffect } from 'react';
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

  const fetchSheetPedidos = async () => {
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
  };

  const fetchPanelCostos = async () => {
    if (!API_KEY || !SHEET_ID) {
      console.warn('[SHEETS-COSTOS] No se puede cargar: Faltan API_KEY o SHEET_ID');
      return;
    }
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/PanelCostos?key=${API_KEY}`;
      console.log('[SHEETS-COSTOS] Cargando desde:', url);
      
      const res = await fetch(url);
      const data = await res.json();
      console.log('[SHEETS-COSTOS] Datos recibidos del Sheet:', data);

      if (!res.ok) {
        throw new Error(data?.error?.message || `Error HTTP ${res.status}`);
      }

      const rows = data.values;
      if (!rows || rows.length < 2) {
        console.warn('[SHEETS-COSTOS] La hoja PanelCostos está vacía o solo tiene cabeceras.');
        return;
      }
      
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

      console.log(`[SHEETS-COSTOS] ✅ ${mapped.length} productos procesados.`);
      setProductosCostos(mapped);
      localStorage.setItem('huerta_data_costos_v1_productos', JSON.stringify(mapped));
    } catch (e) {
      console.error('[SHEETS-COSTOS] ❌ Error fatal:', e.message);
    }
  };

  const fetchControlStock = async () => {
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
      setStockData(parsedRows);
    } catch (e) {
      console.error('[SHEETS-STOCK] Error:', e);
    }
  };

  const cargarTodo = async () => {
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
  };

  // Actualización optimista + POST a Webhook de Apps Script (Estado)
  const actualizarEstadoEnSheet = async (fila, nuevoEstado) => {
    // 1. UI reactiva inmediata
    setPedidos(current =>
      current.map(p => p.sheetRowIndex === fila ? { ...p, estado: nuevoEstado } : p)
    );

    if (!APPS_SCRIPT_URL) {
      console.warn('[SYNC] Falta VITE_APPS_SCRIPT_URL. Cambio solo local.');
      return;
    }

    const payload = { fila, estado: nuevoEstado };
    console.log(`[SYNC PREPARANDO] Enviando a Webhook:`, payload);

    // 2. Lógica de Descuento de Stock Automático (Delegada al Apps Script si aplica)
    if (nuevoEstado.toLowerCase() === 'preparado') {
      console.log(`[STOCK] 🔄 El descuento de stock para "${pedidos.find(p => p.sheetRowIndex === fila)?.producto}" debe ser procesado por el Apps Script.`);
    }

    try {
      await fetch(APPS_SCRIPT_URL, {
        method:  'POST',
        mode:    'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body:    JSON.stringify(payload),
      });
      console.log(`✅ [SYNC ENVIADO] Orden a fila ${fila} disparada (Estado: "${nuevoEstado}"). Webhook Opaco.`);
    } catch (e) {
      console.error(`❌ [SYNC ERROR] Excepción de red enviando estado al Webhook:`, e.message);
    }
  };

  // Actualización optimista + POST a Webhook de Apps Script (Remito Impreso)
  const actualizarRemitoEnSheet = async (fila, impreso) => {
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
      console.error(`[SYNC ERROR] Excepción de red al actualizar remito vía Webhook:`, e.message);
    }
  };

  // Actualización optimista + POST a Webhook de Apps Script (Múltiples datos de cliente)
  const actualizarDatosCliente = async (fila, payload) => {
    // UI reactiva
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
      console.log(`✅ [SYNC ENVIADO] Datos de cliente enviados (Fila: ${fila}). Payload:`, payload);
    } catch (e) {
      console.error(`[SYNC ERROR] Excepción de red al actualizar datos del cliente:`, e.message);
    }
  };

  return (
    <GoogleSheetsContext.Provider value={{
      pedidos, setPedidos,
      productosCostos, stockData,
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
