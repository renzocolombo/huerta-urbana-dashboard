import { createContext, useContext, useState, useEffect } from 'react';
import { KEYS } from '../config/keys';
import { PEDIDOS as PEDIDOS_MOCK } from '../data/mockData';

const GoogleSheetsContext = createContext();

const SHEET_ID = import.meta.env.VITE_SHEET_ID;
const API_KEY  = import.meta.env.VITE_GOOGLE_SHEETS_KEY || import.meta.env.VITE_GOOGLE_API_KEY;

export function GoogleSheetsProvider({ children }) {
  const [pedidos, setPedidos]         = useState(PEDIDOS_MOCK);
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

  // Actualización optimista + PUT a Sheets API v4 → Columna N (Estado)
  const actualizarEstadoEnSheet = async (fila, nuevoEstado) => {
    // 1. UI reactiva inmediata
    setPedidos(current =>
      current.map(p => p.sheetRowIndex === fila ? { ...p, estado: nuevoEstado } : p)
    );

    if (!API_KEY || !SHEET_ID) return;

    // 2. PUT directo a Sheets API v4
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Pedidos!N${fila}?valueInputOption=RAW&key=${API_KEY}`;
    try {
      const res = await fetch(url, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ values: [[nuevoEstado]] }),
      });
      if (res.ok) {
        console.log(`✅ [SYNC OK] Pedido en fila N${fila} actualizado a "${nuevoEstado}" exitosamente.`);
      } else {
        const err = await res.text();
        console.error(`❌ [SYNC ERROR] Falló actualización en N${fila}. Código ${res.status}. Detalle:`, err);
      }
    } catch (e) {
      console.error(`❌ [SYNC ERROR] Excepción general al actualizar N${fila}:`, e.message);
    }
  };

  // Actualización optimista + PUT a Sheets API v4 → Columna T (Remito Impreso)
  const actualizarRemitoEnSheet = async (fila, impreso) => {
    setPedidos(current =>
      current.map(p => p.sheetRowIndex === fila ? { ...p, remito_impreso: impreso } : p)
    );

    if (!API_KEY || !SHEET_ID) return;

    // Convertimos booleano en texto para Google Sheets
    const valorMarcador = impreso ? 'TRUE' : 'FALSE';

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Pedidos!T${fila}?valueInputOption=RAW&key=${API_KEY}`;
    try {
      const res = await fetch(url, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ values: [[valorMarcador]] }),
      });
      if (!res.ok) console.error(`[SYNC ERROR] HTTP ${res.status} en T${fila}`);
    } catch (e) {
      console.error(`[SYNC ERROR] Excepción en T${fila}:`, e.message);
    }
  };

  return (
    <GoogleSheetsContext.Provider value={{
      pedidos, setPedidos,
      ultimoRefresco,
      fetchSheetPedidos,
      conectado,
      cargando,
      error,
      urlSheet: URL_SHEET,
      actualizarEstadoEnSheet,
      actualizarRemitoEnSheet,
    }}>
      {children}
    </GoogleSheetsContext.Provider>
  );
}

export function useGoogleSheets() {
  return useContext(GoogleSheetsContext);
}
