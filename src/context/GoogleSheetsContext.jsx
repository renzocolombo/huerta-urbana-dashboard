import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { KEYS } from '../config/keys';
import { PEDIDOS as PEDIDOS_MOCK } from '../data/mockData';

const GoogleSheetsContext = createContext();

export function GoogleSheetsProvider({ children }) {
  const [pedidos, setPedidos] = useState(PEDIDOS_MOCK);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [conectado, setConectado] = useState(false);
  const [ultimoRefresco, setUltimoRefresco] = useState(new Date());

  const URL_SHEET = `https://docs.google.com/spreadsheets/d/${KEYS.SHEET_ID}/edit`;

  // 1. Carga inicial y Polling (Cada 30s)
  useEffect(() => {
    fetchSheetPedidos(); // Carga inicial

    const interval = setInterval(() => {
      console.log("[POLLING] Refrescando datos de Google Sheets (30s)...");
      fetchSheetPedidos();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const fetchSheetPedidos = async () => {
    const API_KEY = import.meta.env.VITE_GOOGLE_SHEETS_KEY;
    const SHEET_ID = import.meta.env.VITE_SHEET_ID;

    if (!API_KEY || !SHEET_ID) return;

    setCargando(true);
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Pedidos?key=${API_KEY}`;
      const gres = await fetch(url);
      const data = await gres.json();
      
      if(!gres.ok) throw new Error(`Error de API: ${gres.status}`);
      
      const rows = data.values;
      if (!rows || rows.length < 2) {
         setConectado(false);
         return;
      }
      
      const headers = rows[0].map(h => 
        h.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ /g, '_')
      );
      
      const parsedPedidos = rows.slice(1).map((row, index) => {
        let obj = { sheetRowIndex: index + 2 };
        headers.forEach((h, i) => { obj[h] = row[i] || ''; });
        
        return {
          id: obj.id || obj.numero_pedido || `REQ-${index}`,
          numero_pedido: obj.numero_pedido || `#${index+1000}`,
          fecha: obj.get_fecha || obj.fecha || new Date().toISOString().split('T')[0],
          nombre: obj.nombre || obj.cliente || 'Sin Nombre',
          telefono: obj.telefono || obj.celular || '',
          direccion: obj.direccion || '',
          localidad: obj.localidad || obj.zona || '',
          producto: obj.producto || obj.combo || '',
          cantidades: Number(obj.cantidades || 1),
          observaciones: obj.observaciones || obj.notas || '',
          total: Number(obj.total || 0),
          estado_pago: obj.estado_pago || obj.pago || 'pendiente',
          dia_entrega: obj.dia_entrega || obj.dia || 'Martes',
          horario_entrega: obj.horario_entrega || obj.turno_entrega || obj.turno || '09:00 - 13:00',
          turno_entrega: obj.turno_entrega || obj.turno || 'mañana',
          estado: obj.estado || 'pendiente',
          email: obj.email || ''
        };
      });

      setPedidos(parsedPedidos);
      setConectado(true);
      setUltimoRefresco(new Date()); // Reset timestamp
      setError(null);
    } catch (e) {
      setError(e.message);
      setConectado(false);
    } finally {
      setCargando(false);
    }
  };

  // ACTUALIZACIÓN OPTIMISTA: Refleja el cambio localmente al instante
  const actualizarEstadoEnSheet = async (fila, nuevoEstado) => {
    console.log(`[OPTIMISTIC SYNC] Pedido en fila ${fila} -> ${nuevoEstado}`);
    
    // 1. Actualizar estado local inmediatamente para evitar lag
    setPedidos(current => 
      current.map(p => {
        if (p.sheetRowIndex === fila) {
          return { ...p, estado: nuevoEstado };
        }
        return p;
      })
    );

    // 2. Aquí iría el POST a un backend o Apps Script si existiera.
    // Con API Key pública no podemos escribir, pero el Dashboard se mantiene síncrono localmente.
    console.log(`[SYNC INTENT] Sincronizando con Sheet Celda M${fila}...`);
  };
  
  const actualizarRemitoEnSheet = async (fila, impreso) => {
    setPedidos(current => 
      current.map(p => p.sheetRowIndex === fila ? { ...p, remito_impreso: impreso } : p)
    );
  };

  return (
    <GoogleSheetsContext.Provider value={{
      pedidos, setPedidos,
      ultimoRefresco,
      fetchSheetPedidos, // Para refresco manual si se necesita fuera
      conectado,
      cargando,
      error,
      urlSheet: URL_SHEET,
      actualizarEstadoEnSheet,
      actualizarRemitoEnSheet
    }}>
      {children}
    </GoogleSheetsContext.Provider>
  );
}

export function useGoogleSheets() {
  return useContext(GoogleSheetsContext);
}
