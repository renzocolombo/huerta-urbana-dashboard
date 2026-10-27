// ============================================================================
// Utilidad de Generación e Impresión de Remitos (Individual y Lotes)
// Huerta Urbana Dashboard - Formato Comprobante Tipo Remito "X" (A4)
// ============================================================================

import { generarQRSvg } from './qrLocal.js';
import { APPS_SCRIPT_URL } from './appsScriptUrl.js';
import { parseDiaEntrega, BLOQUES } from './entregaCalendario.js';

/**
 * DATOS FISCALES Y COMERCIALES DEL EMISOR
 */
export const EMISOR = {
  razon: 'Renzo Alejandro Colombo',
  nombre_comercial: 'Huerta Urbana',
  cuit: '20-30219202-3',
  domicilio: 'Carmen Puch 1000, Pilar, Buenos Aires',
  inicio_actividades: '01/04/2026',
};

const norm = (s) => (s || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * Parsea el texto del campo producto de un pedido cuando no proviene de detalle_json.
 * Mantiene compatibilidad estricta con Finanzas, Faltantes y AgendaEntregas.
 */
export function parsearProductosPedido(textoProducto, cantidadGeneral = 1) {
  if (!textoProducto) return [];
  const partes = String(textoProducto).split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  
  return partes.map(parte => {
    let cantidad = cantidadGeneral;
    let pesoSolicitado = null;
    let texto = parte;
    
    const cantInicio = texto.match(/^(\d+)\s*[xX]?\s+(.+)$/);
    if (cantInicio) { cantidad = parseInt(cantInicio[1], 10); texto = cantInicio[2]; }
    
    const cantFinal = texto.match(/^(.+?)\s+[xX](\d+)$/);
    if (cantFinal) { cantidad = parseInt(cantFinal[2], 10); texto = cantFinal[1]; }
    
    const pesoMatch = texto.match(/(\d+(?:[.,]\d+)?)\s*(kg|kilos?|g|gr?)\b/i);
    if (pesoMatch) {
      let val = parseFloat(pesoMatch[1].replace(',', '.'));
      const unit = pesoMatch[2].toLowerCase();
      if (unit.startsWith('g')) val = val / 1000;
      pesoSolicitado = Math.round(val * 1000) / 1000;
      texto = texto.replace(pesoMatch[0], '').trim();
    }
    
    const nombre = texto.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    return { nombre, cantidad, pesoSolicitado, bolsasAsignadas: [] };
  });
}

/**
 * Consulta al Apps Script el número de remito oficial correlativo asignado a un pedido.
 * Payload: { accion: 'obtenerNumeroRemito', numero_pedido }
 * Respuesta esperada: { ok: true, formateado: "0001-00000001" }
 * Si la llamada falla o no responde, cae al número de pedido actual.
 *
 * @param {string|number} numeroPedido
 * @returns {Promise<string>}
 */
export async function obtenerNumeroRemito(numeroPedido) {
  const fallback = numeroPedido ? String(numeroPedido) : '00000001';
  if (!numeroPedido || !APPS_SCRIPT_URL) return fallback;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        accion: 'obtenerNumeroRemito',
        action: 'obtenerNumeroRemito',
        numero_pedido: numeroPedido,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      if (data && data.ok && data.formateado) {
        return String(data.formateado).trim();
      }
    }
  } catch (e) {
    console.warn(`[REMITO] Falló obtenerNumeroRemito para pedido #${numeroPedido}:`, e.message);
  }

  return fallback;
}

/**
 * AISLAMIENTO FASE 2:
 * Concentra en una única función la lectura y normalización de las pesadas reales de un pedido.
 * Sabor 1: Si existe `pedido.detalle_json` (string JSON o array con [{nombre, unidad, precio_unit, dto_unit, cantidad_pedida}]),
 *          calcula precios unitarios, subtotales, descuentos y total con las pesadas reales.
 * Sabor 2: Si NO existe `detalle_json` (pedidos viejos), preserva el comportamiento previo con '—' y usa pedido.total.
 *
 * @param {Object} pedido - Objeto con datos del pedido (Google Sheets / mockData)
 * @param {Object} preparacion - Objeto de preparación local { items: [...], completado: bool }
 * @returns {Object} { tieneDetalleJson, items, subtotal, descuentos, credito, totalACobrar }
 */
export function obtenerPesosReales(pedido, preparacion) {
  // 1. Verificar si existe detalle_json nuevo (en pedido o en preparacion)
  let detalleItems = null;
  const rawDetalle = pedido?.detalle_json || preparacion?.detalle_json;
  if (rawDetalle) {
    try {
      detalleItems = typeof rawDetalle === 'string'
        ? JSON.parse(rawDetalle)
        : (Array.isArray(rawDetalle) ? rawDetalle : null);
    } catch (e) {
      console.warn('[REMITO] Error parseando detalle_json:', e);
      detalleItems = null;
    }
  }

  const tienePrep = preparacion && Array.isArray(preparacion.items) && preparacion.items.length > 0;
  const prepItems = tienePrep ? preparacion.items : [];

  // Helper para vincular bolsas escaneadas en la preparación por nombre normalizado
  const buscarBolsasParaProducto = (nombreProd) => {
    const k = norm(nombreProd);
    const pItem = prepItems.find(pi => {
      const pNorm = norm(pi.nombre || pi.producto);
      return pNorm === k || pNorm.includes(k) || k.includes(pNorm);
    });
    return (pItem && Array.isArray(pItem.bolsasAsignadas)) ? pItem.bolsasAsignadas : [];
  };

  // ── CASO 1: Existe detalle_json con precios unitarios y desglose ────────────
  if (Array.isArray(detalleItems) && detalleItems.length > 0) {
    const itemsProcesados = detalleItems.map(item => {
      const nombre = String(item.producto || item.nombre || '').trim();
      const unidadRaw = (item.unidad || '').toLowerCase().trim();
      const unidad = unidadRaw === 'kg' ? 'kg' : (unidadRaw === 'atado' ? 'atado' : 'un');
      const bolsas = buscarBolsasParaProducto(nombre);

      let cantidadReal = 0;
      if (item.cantidad_real != null && Number(item.cantidad_real) > 0) {
        cantidadReal = Number(item.cantidad_real);
      } else if (item.cantidad != null && Number(item.cantidad) > 0) {
        cantidadReal = Number(item.cantidad);
      } else if (bolsas.length > 0) {
        if (unidad === 'kg') {
          const sumaKg = bolsas.reduce((acc, b) => acc + (Number(b.peso) || 0), 0);
          cantidadReal = Number(sumaKg.toFixed(3));
        } else {
          cantidadReal = bolsas.length;
        }
      } else {
        cantidadReal = Number(item.cantidad_pedida || 1);
      }

      // Formateo estricto: kg -> 3 decimales con coma; nunca 0,90 un para peso
      let cantidadFormateada = '';
      if (unidad === 'kg') {
        cantidadFormateada = `${cantidadReal.toFixed(3).replace('.', ',')} kg`;
      } else if (unidad === 'atado') {
        cantidadFormateada = `${Math.round(cantidadReal)} atado${cantidadReal > 1 ? 's' : ''}`;
      } else {
        cantidadFormateada = `${Math.round(cantidadReal)} un`;
      }

      const precioUnit = Number(item.precio_unitario != null ? item.precio_unitario : (item.precio_unit != null ? item.precio_unit : (item.precio || 0)));
      const dtoUnit = Number(item.dto_unit || item.descuento_unitario || 0);
      const precioNeto = Math.max(0, precioUnit - dtoUnit);
      const totalLinea = item.subtotal != null ? Number(item.subtotal) : Number((cantidadReal * precioNeto).toFixed(2));
      const subtotalLinea = Number((cantidadReal * precioUnit).toFixed(2));
      const descuentoLinea = Number((cantidadReal * dtoUnit).toFixed(2));

      return {
        nombre,
        unidad,
        cantidadReal,
        cantidadFormateada,
        precioUnitario: precioUnit,
        descuentoUnitario: dtoUnit,
        totalLinea,
        subtotalLinea,
        descuentoLinea,
        bolsasDetalle: bolsas
      };
    });

    const subtotal = itemsProcesados.reduce((acc, it) => acc + it.subtotalLinea, 0);
    const descuentos = itemsProcesados.reduce((acc, it) => acc + it.descuentoLinea, 0);
    const totalACobrar = itemsProcesados.reduce((acc, it) => acc + it.totalLinea, 0);

    return {
      tieneDetalleJson: true,
      items: itemsProcesados,
      subtotal,
      descuentos,
      credito: 0,
      totalACobrar
    };
  }

  // ── CASO 2: Pedidos viejos sin detalle_json (mantiene '—' y pedido.total) ──
  const itemsFuente = tienePrep ? prepItems : parsearProductosPedido(pedido?.producto, pedido?.cantidades);
  const itemsFallback = (!itemsFuente || itemsFuente.length === 0)
    ? [{ nombre: pedido?.producto || 'Productos Varios', cantidad: pedido?.cantidades || 1, bolsasAsignadas: [] }]
    : itemsFuente;

  const itemsProcesados = itemsFallback.map(item => {
    const bolsas = Array.isArray(item.bolsasAsignadas) ? item.bolsasAsignadas : [];
    const nombreLimpio = (item.nombre || '').trim();
    const nombreLower = nombreLimpio.toLowerCase();

    const esAtado = /\batado\b/i.test(nombreLower);
    const esPorPeso = !esAtado && (
      Boolean(item.pesoSolicitado) ||
      /\b(kg|kilos?|g|gr?)\b/i.test(nombreLower) ||
      bolsas.some(b => b.peso && b.peso > 0) ||
      !/\b(combo|pack|promo|botella|frasco|unidad|docena)\b/i.test(nombreLower)
    );

    let unidad = 'un';
    if (esAtado) unidad = 'atado';
    else if (esPorPeso) unidad = 'kg';

    let cantidadReal = 0;
    if (bolsas.length > 0) {
      if (unidad === 'kg') {
        const sumaKg = bolsas.reduce((acc, b) => acc + (Number(b.peso) || 0), 0);
        cantidadReal = Number(sumaKg.toFixed(3));
      } else {
        cantidadReal = bolsas.length;
      }
    } else {
      if (unidad === 'kg') {
        cantidadReal = item.pesoSolicitado ? (item.pesoSolicitado * (item.cantidad || 1)) : (item.cantidad || 1);
      } else {
        cantidadReal = item.cantidad || 1;
      }
    }

    let cantidadFormateada = '';
    if (unidad === 'kg') {
      cantidadFormateada = `${cantidadReal.toFixed(3).replace('.', ',')} kg`;
    } else if (unidad === 'atado') {
      cantidadFormateada = `${Math.round(cantidadReal)} atado${cantidadReal > 1 ? 's' : ''}`;
    } else {
      cantidadFormateada = `${Math.round(cantidadReal)} un`;
    }

    return {
      nombre: nombreLimpio,
      unidad,
      cantidadReal,
      cantidadFormateada,
      precioUnitario: null,
      descuentoUnitario: null,
      totalLinea: null,
      subtotalLinea: null,
      descuentoLinea: null,
      bolsasDetalle: bolsas
    };
  });

  const totalViejo = Number(pedido?.total || 0);

  return {
    tieneDetalleJson: false,
    items: itemsProcesados,
    subtotal: totalViejo,
    descuentos: null,
    credito: null,
    totalACobrar: totalViejo
  };
}

// ============================================================================
// CSS LIMPIO PARA IMPRESIÓN (A4 VERTICAL - TIPO COMPROBANTE - AHORRO DE TINTA)
// ============================================================================
const ESTILOS_REMITO = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  
  @page {
    size: A4 portrait;
    margin: 8mm 10mm;
  }

  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    margin: 0;
    padding: 0;
    background: #e5e7eb;
    color: #000;
    font-size: 10pt;
    line-height: 1.25;
  }

  /* Barra de herramientas en pantalla (oculta en impresión) */
  .preview-toolbar {
    position: sticky;
    top: 0;
    z-index: 9999;
    background: #111827;
    color: white;
    padding: 10px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    border-bottom: 2px solid #22c55e;
  }

  .preview-toolbar h1 {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
  }

  .preview-toolbar .btn-group {
    display: flex;
    gap: 8px;
  }

  .preview-toolbar button {
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    font-weight: 700;
    padding: 6px 14px;
    border-radius: 6px;
    border: none;
    transition: all 0.15s;
  }

  .btn-print { background: #22c55e; color: black; }
  .btn-print:hover { background: #16a34a; color: white; }
  .btn-close { background: #374151; color: #e5e7eb; }
  .btn-close:hover { background: #4b5563; }

  .remito-wrapper {
    max-width: 210mm;
    margin: 12px auto;
  }

  /* Hoja de Remito A4 */
  .hoja-remito {
    width: 210mm;
    min-height: 285mm;
    margin: 0 auto 16px auto;
    background: #fff;
    padding: 8mm 10mm;
    box-shadow: 0 4px 16px rgba(0,0,0,0.08);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    page-break-after: always;
    break-after: page;
    border: 1.5px solid #000;
    position: relative;
    box-sizing: border-box;
  }

  /* ── 1. ENCABEZADO FISCAL (3 BLOQUES) ────────────────────────────────── */
  .header-comprobante {
    display: grid;
    grid-template-columns: 42% 16% 42%;
    border: 1.5px solid #000;
    border-radius: 4px;
    position: relative;
    margin-bottom: 8px;
    background: #fff;
  }

  .header-col-izq {
    padding: 8px 10px;
    border-right: 1px solid #000;
  }

  .header-col-izq h2,
  .header-col-izq .nombre-comercial-emisor {
    margin: 0 0 2px 0;
    font-size: 15pt;
    font-weight: 800;
    letter-spacing: -0.3px;
    text-transform: uppercase;
    color: #000;
  }

  .header-col-izq .razon-social-emisor {
    font-size: 9.5pt;
    font-weight: 700;
    color: #222;
    margin-bottom: 4px;
  }

  .header-col-izq .dato-emisor {
    font-size: 8.5pt;
    color: #111;
    line-height: 1.35;
  }

  .header-col-izq .dato-emisor strong {
    font-weight: 700;
  }

  /* Bloque Centro: Letra X */
  .header-col-centro {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 4px 2px;
    background: #fff;
    position: relative;
  }

  .box-letra-x {
    width: 38px;
    height: 38px;
    border: 2px solid #000;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20pt;
    font-weight: 900;
    line-height: 1;
    margin-bottom: 3px;
    background: #fff;
  }

  .leyenda-no-valido {
    font-size: 6.5pt;
    font-weight: 800;
    text-transform: uppercase;
    line-height: 1.05;
    color: #000;
    max-width: 90px;
  }

  /* Bloque Derecho: Remito, N° y Fechas */
  .header-col-der {
    padding: 8px 10px;
    border-left: 1px solid #000;
    text-align: left;
  }

  .titulo-remito-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 4px;
    border-bottom: 1px solid #000;
    padding-bottom: 3px;
  }

  .titulo-remito {
    font-size: 14pt;
    font-weight: 900;
    letter-spacing: 1px;
  }

  .tipo-copia-badge {
    font-size: 8pt;
    font-weight: 800;
    border: 1px solid #000;
    padding: 1px 5px;
    border-radius: 3px;
    text-transform: uppercase;
  }

  .header-col-der .dato-remito {
    font-size: 8.5pt;
    line-height: 1.35;
  }

  .header-col-der .dato-remito strong {
    font-weight: 700;
  }

  /* ── 2. DATOS DEL CLIENTE Y OPERACIÓN ───────────────────────────────── */
  .cliente-box {
    border: 1px solid #000;
    border-radius: 4px;
    padding: 6px 10px;
    margin-bottom: 8px;
    font-size: 8.5pt;
    background: #fff;
  }

  .cliente-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 14px;
  }

  .cliente-linea {
    display: flex;
    gap: 4px;
  }

  .cliente-linea .lbl {
    font-weight: 700;
    min-width: 85px;
    color: #111;
  }

  .cliente-linea .val {
    flex: 1;
    color: #000;
  }

  .pago-linea {
    grid-column: span 2;
    border-top: 1px dashed #666;
    padding-top: 4px;
    margin-top: 3px;
    display: flex;
    align-items: center;
    gap: 14px;
    font-size: 8pt;
  }

  .casillas-pago {
    display: flex;
    gap: 12px;
    font-weight: 600;
  }

  .casilla-item {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .casilla-box {
    display: inline-block;
    width: 10px;
    height: 10px;
    border: 1px solid #000;
  }

  .obs-alerta {
    grid-column: span 2;
    background: #fff;
    border: 1px dashed #000;
    padding: 3px 6px;
    border-radius: 3px;
    font-size: 8pt;
    margin-top: 2px;
  }

  /* ── 3. TABLA DE ÍTEMS ──────────────────────────────────────────────── */
  .tabla-items-container {
    flex-grow: 1;
    margin-bottom: 8px;
  }

  table.items-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 8.5pt;
  }

  table.items-table th {
    border-top: 1.5px solid #000;
    border-bottom: 1.5px solid #000;
    padding: 4px 5px;
    font-weight: 800;
    font-size: 8pt;
    text-transform: uppercase;
    background: #fff;
  }

  table.items-table td {
    padding: 3.5px 5px;
    border-bottom: 1px solid #e0e0e0;
    vertical-align: top;
  }

  table.items-table tr:last-child td {
    border-bottom: 1.5px solid #000;
  }

  .th-cant, .td-cant { width: 95px; text-align: right; font-weight: 700; font-family: monospace; }
  .th-desc, .td-desc { text-align: left; }
  .th-unit, .td-unit { width: 75px; text-align: right; font-family: monospace; }
  .th-dto, .td-dto { width: 55px; text-align: right; font-family: monospace; }
  .th-total, .td-total { width: 85px; text-align: right; font-weight: 700; font-family: monospace; }

  /* Auditoría de pesadas para copia Empresa */
  .bolsas-auditoria {
    margin-top: 2px;
    font-size: 7.5pt;
    color: #444;
    font-family: monospace;
    line-height: 1.2;
  }

  .bolsa-tag {
    display: inline-block;
    border: 0.5px solid #888;
    padding: 0 3px;
    border-radius: 2px;
    margin: 1px 2px 1px 0;
  }

  /* ── 4. TOTALES Y LEYENDA ───────────────────────────────────────────── */
  .totales-wrapper {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 10px;
    gap: 15px;
  }

  .leyenda-calculo {
    font-size: 8pt;
    font-style: italic;
    color: #333;
    max-width: 320px;
    border-left: 2px solid #000;
    padding-left: 6px;
  }

  .tabla-totales {
    border: 1.5px solid #000;
    border-collapse: collapse;
    min-width: 230px;
    font-size: 8.5pt;
  }

  .tabla-totales td {
    padding: 2.5px 8px;
    border-bottom: 1px solid #ccc;
  }

  .tabla-totales .row-total-final td {
    border-top: 1.5px solid #000;
    border-bottom: none;
    font-size: 10.5pt;
    font-weight: 900;
  }

  /* ── 5. PIE: QR Y CONFORMIDAD ───────────────────────────────────────── */
  .footer-comprobante {
    border-top: 1.5px solid #000;
    padding-top: 6px;
    display: grid;
    grid-template-columns: 95px 1fr;
    gap: 12px;
    align-items: center;
  }

  .qr-box {
    width: 85px;
    height: 85px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border: 1px solid #000;
    padding: 2px;
    border-radius: 3px;
    background: #fff;
  }

  .qr-box svg {
    display: block;
  }

  .qr-box .qr-label {
    font-size: 6pt;
    font-weight: 700;
    text-transform: uppercase;
    text-align: center;
    margin-top: 2px;
    color: #000;
  }

  /* Bloque de Conformidad */
  .conformidad-box {
    border: 1px solid #000;
    border-radius: 4px;
    padding: 6px 10px;
    font-size: 8pt;
  }

  .conformidad-empresa {
    border: 1.5px solid #000;
    background: #fff;
  }

  .conformidad-titulo {
    font-weight: 800;
    text-transform: uppercase;
    font-size: 7.5pt;
    margin-bottom: 6px;
    display: flex;
    justify-content: space-between;
  }

  .firmas-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 10px;
    margin-top: 12px;
  }

  .campo-firma {
    border-top: 1px solid #000;
    padding-top: 2px;
    text-align: center;
    font-size: 7pt;
    font-weight: 600;
    text-transform: uppercase;
  }

  /* ── REGLAS DE IMPRESIÓN ────────────────────────────────────────────── */
  @media print {
    body {
      background: white !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    .preview-toolbar {
      display: none !important;
    }

    .remito-wrapper {
      max-width: none !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    .hoja-remito {
      width: 100% !important;
      height: 100vh !important;
      min-height: 0 !important;
      margin: 0 !important;
      box-shadow: none !important;
      border: 1.5px solid #000 !important;
      page-break-after: always !important;
      break-after: page !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      box-sizing: border-box !important;
    }
  }
`;

/**
 * Genera el HTML de una hoja de remito tipo comprobante comercial.
 * 
 * @param {Object} pedido - Datos del pedido
 * @param {Object} preparacion - Datos de escaneo/preparación con pesadas reales
 * @param {string} tipoCopia - "ORIGINAL - CLIENTE" | "DUPLICADO - EMPRESA"
 */
export function generarHojaRemitoHTML(pedido, preparacion, tipoCopia = "ORIGINAL - CLIENTE", opciones = {}) {
  const esCopiaEmpresa = String(tipoCopia).toUpperCase().includes('EMPRESA') || String(tipoCopia).toUpperCase().includes('DUPLICADO');
  const calculo = obtenerPesosReales(pedido, preparacion);
  const items = calculo.items;

  // Número de remito: valor formateado de Apps Script, pedido.numero_remito o fallback al número de pedido
  const remitoFormateado = opciones?.numeroRemito
    || pedido?.numero_remito
    || (pedido?.numero_pedido ? String(pedido.numero_pedido) : '00000001');

  // Fecha de emisión (DD/MM/AAAA)
  const hoy = new Date();
  const fechaEmision = `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`;

  // Datos del Cliente
  const clienteNombre = pedido?.nombre || 'Consumidor Final';
  const clienteDireccion = pedido?.direccion ? `${pedido.direccion}${pedido.localidad ? ', ' + pedido.localidad : ''}` : '—';
  const clienteTelefono = pedido?.telefono || '—';
  const fechaEntregaStr = pedido?.dia_entrega || pedido?.fecha || '—';
  // Si dia_entrega trae fecha y bloque ("Lunes 09/11/2026 Tarde") el turno sale del bloque ("14 a 17 h")
  const _entregaParseada = parseDiaEntrega(pedido?.dia_entrega);
  const turnoEntregaStr = (_entregaParseada && _entregaParseada.bloque)
    ? `${BLOQUES[_entregaParseada.bloque].desde} a ${BLOQUES[_entregaParseada.bloque].hasta} h`
    : (pedido?.horario_entrega || pedido?.turno_entrega || '—');
  const numPedidoStr = pedido?.numero_pedido || '—';

  // Renderizar filas de la tabla de ítems
  const filasHTML = items.map(item => {
    // Auditoría de bolsas escaneadas: SOLO visible en la copia DUPLICADO - EMPRESA
    let detalleBolsasEmpresa = '';
    if (esCopiaEmpresa && item.bolsasDetalle && item.bolsasDetalle.length > 0) {
      detalleBolsasEmpresa = `
        <div class="bolsas-auditoria">
          ${item.bolsasDetalle.map((b, i) => `
            <span class="bolsa-tag">
              B${i + 1}: ${Number(b.peso || 0).toFixed(3).replace('.', ',')} kg
              ${b.uniqueCode ? `(${b.uniqueCode})` : ''}
              ${b.tagId ? `[${b.tagId}]` : ''}
            </span>
          `).join('')}
        </div>
      `;
    }

    const avisoSinPrecios = '<span style="font-size:7.5pt; color:#b45309; font-weight:600; font-style:italic;">pedido sin precios congelados</span>';
    const precioUnitStr = item.precioUnitario !== null ? `$${item.precioUnitario.toLocaleString('es-AR')}` : avisoSinPrecios;
    const descuentoStr = (item.descuentoUnitario !== null && item.descuentoUnitario > 0)
      ? `$${item.descuentoUnitario.toLocaleString('es-AR')}`
      : '—';
    const totalLineaStr = item.totalLinea !== null ? `$${item.totalLinea.toLocaleString('es-AR')}` : avisoSinPrecios;

    return `
      <tr>
        <td class="td-cant">${item.cantidadFormateada}</td>
        <td class="td-desc">
          <strong>${item.nombre}</strong>
          ${detalleBolsasEmpresa}
        </td>
        <td class="td-unit">${precioUnitStr}</td>
        <td class="td-dto">${descuentoStr}</td>
        <td class="td-total">${totalLineaStr}</td>
      </tr>
    `;
  }).join('');

  // Cuadro de Totales: si hay detalle_json se calcula sumando líneas con pesadas reales; si no, usa pedido.total
  const avisoTotalSinPrecios = !calculo.tieneDetalleJson 
    ? '<div style="margin-top:4px; font-size:7.5pt; color:#b45309; font-weight:700; text-align:right;">⚠️ pedido sin precios congelados</div>' 
    : '';

  const subtotalStr = calculo.tieneDetalleJson
    ? `$${calculo.subtotal.toLocaleString('es-AR')}`
    : `$${Number(pedido?.total || 0).toLocaleString('es-AR')}`;

  const descuentosStr = (calculo.tieneDetalleJson && calculo.descuentos > 0)
    ? `-$${calculo.descuentos.toLocaleString('es-AR')}`
    : '—';

  const creditoStr = '—';

  const totalFinalStr = calculo.tieneDetalleJson
    ? `$${calculo.totalACobrar.toLocaleString('es-AR')}`
    : `$${Number(pedido?.total || 0).toLocaleString('es-AR')}${avisoTotalSinPrecios}`;

  const estadoPago = (pedido?.estado_pago || '').toLowerCase().trim();
  const estaCobrado = Boolean(pedido?.cobrado || estadoPago === 'approved' || estadoPago === 'pagado' || pedido?.monto_cobrado);
  const MEDIOS_NOMBRES = {
    debito: 'Débito',
    credito: 'Crédito',
    prepaga: 'Prepaga',
    qr: 'QR',
    transferencia: 'Transferencia',
    link_pago: 'Link de Pago',
    mercadopago: 'Mercado Pago'
  };
  const rawMedio = String(pedido?.medio_pago || pedido?.medio || pedido?.metodo_pago || '').toLowerCase().trim();
  const medioNombre = MEDIOS_NOMBRES[rawMedio] || (rawMedio ? rawMedio.toUpperCase() : '');
  const montoCobradoNum = pedido?.monto_cobrado != null && !isNaN(Number(pedido.monto_cobrado))
    ? Number(pedido.monto_cobrado)
    : (calculo.tieneDetalleJson ? calculo.totalACobrar : Number(pedido?.total || 0));
  const montoCobradoStr = `$${Math.round(montoCobradoNum).toLocaleString('es-AR')}`;

  // Generación local 100% offline del código QR
  const qrUrlDestino = `https://www.huertaurbana.com.ar/pedido/${encodeURIComponent(pedido?.numero_pedido || '')}`;
  const qrSvgHtml = generarQRSvg(qrUrlDestino, 70);

  return `
    <div class="hoja-remito">
      <div>
        <!-- ── 1. ENCABEZADO FISCAL (3 BLOQUES) ───────────────────────── -->
        <div class="header-comprobante">
          <!-- Bloque Izquierdo: Emisor -->
          <div class="header-col-izq">
            <h2 class="nombre-comercial-emisor">${EMISOR.nombre_comercial || 'Huerta Urbana'}</h2>
            <div class="razon-social-emisor">${EMISOR.razon || 'Renzo Alejandro Colombo'}</div>
            <div class="dato-emisor">
              <div><strong>Domicilio:</strong> ${EMISOR.domicilio || '—'}</div>
            </div>
          </div>

          <!-- Bloque Centro: X Comprobante No Válido como Factura -->
          <div class="header-col-centro">
            <div class="box-letra-x">X</div>
            <div class="leyenda-no-valido">Documento no válido como factura</div>
          </div>

          <!-- Bloque Derecho: Remito, N° y Fechas -->
          <div class="header-col-der">
            <div class="titulo-remito-row">
              <span class="titulo-remito">REMITO</span>
              <span class="tipo-copia-badge">${tipoCopia}</span>
            </div>
            <div class="dato-remito">
              <div><strong>N°:</strong> ${remitoFormateado}</div>
              <div><strong>Fecha de Emisión:</strong> ${fechaEmision}</div>
              <div><strong>C.U.I.T.:</strong> ${EMISOR.cuit || '—'}</div>
              <div><strong>Ingresos Brutos:</strong> ${EMISOR.cuit || '—'}</div>
              <div><strong>Inicio de Actividades:</strong> ${EMISOR.inicio_actividades || '—'}</div>
            </div>
          </div>
        </div>

        <!-- ── 2. DATOS DEL CLIENTE Y OPERACIÓN ───────────────────────── -->
        <div class="cliente-box">
          <div class="cliente-grid">
            <div class="cliente-linea">
              <span class="lbl">Razón Social:</span>
              <span class="val">Consumidor Final sin identificar</span>
            </div>
            <div class="cliente-linea">
              <span class="lbl">I.V.A.:</span>
              <span class="val">Consumidor Final</span>
            </div>
            <div class="cliente-linea">
              <span class="lbl">Nombre:</span>
              <span class="val"><strong>${clienteNombre}</strong></span>
            </div>
            <div class="cliente-linea">
              <span class="lbl">Teléfono:</span>
              <span class="val">${clienteTelefono}</span>
            </div>
            <div class="cliente-linea">
              <span class="lbl">Dirección:</span>
              <span class="val">${clienteDireccion}</span>
            </div>
            <div class="cliente-linea">
              <span class="lbl">N° Pedido:</span>
              <span class="val"><strong>#${numPedidoStr}</strong></span>
            </div>
            <div class="cliente-linea">
              <span class="lbl">Entrega:</span>
              <span class="val">${fechaEntregaStr} (${turnoEntregaStr})</span>
            </div>
            <div class="cliente-linea">
              <span class="lbl">Cond. Venta:</span>
              <span class="val">Contado - pago en el lugar</span>
            </div>

            <!-- Medio de pago con casillas o confirmación de cobro -->
            <div class="pago-linea">
              <span style="font-weight:700;">Medio de Pago:</span>
              ${estaCobrado ? `
                <span style="font-weight:800; color:#15803d; text-transform:uppercase;">${medioNombre || 'COBRADO'}</span>
                <span style="margin-left: 14px; font-weight:700;">Monto Cobrado:</span>
                <span style="font-weight:800; color:#15803d;">${montoCobradoStr}</span>
              ` : `
                <div class="casillas-pago">
                  <span class="casilla-item"><span class="casilla-box"></span> QR</span>
                  <span class="casilla-item"><span class="casilla-box"></span> Transf.</span>
                  <span class="casilla-item"><span class="casilla-box"></span> Débito</span>
                  <span class="casilla-item"><span class="casilla-box"></span> Crédito</span>
                </div>
              `}
            </div>

            ${pedido?.observaciones ? `
              <div class="obs-alerta">
                <strong>Observaciones:</strong> "${pedido.observaciones}"
              </div>
            ` : ''}
          </div>
        </div>

        <!-- ── 3. TABLA DE ÍTEMS ──────────────────────────────────────── -->
        <div class="tabla-items-container">
          <table class="items-table">
            <thead>
              <tr>
                <th class="th-cant">Cantidad</th>
                <th class="th-desc">Descripción</th>
                <th class="th-unit">Precio unit.</th>
                <th class="th-dto">Dto.</th>
                <th class="th-total">Total</th>
              </tr>
            </thead>
            <tbody>
              ${filasHTML}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <!-- ── 4. CUADRO DE TOTALES Y LEYENDA ─────────────────────────── -->
        <div class="totales-wrapper">
          <div class="leyenda-calculo">
            Precio final calculado sobre el peso real entregado.
          </div>

          <table class="tabla-totales">
            <tr>
              <td>Subtotal:</td>
              <td style="text-align:right; font-family:monospace;">${subtotalStr}</td>
            </tr>
            <tr>
              <td>Descuentos:</td>
              <td style="text-align:right; font-family:monospace;">${descuentosStr}</td>
            </tr>
            <tr>
              <td>Crédito aplicado:</td>
              <td style="text-align:right; font-family:monospace;">${creditoStr}</td>
            </tr>
            <tr class="row-total-final">
              <td>${estaCobrado ? 'TOTAL COBRADO:' : 'TOTAL A COBRAR:'}</td>
              <td style="text-align:right; font-family:monospace;">${estaCobrado ? montoCobradoStr : totalFinalStr}</td>
            </tr>
          </table>
        </div>

        <!-- ── 5. PIE: QR Y CONFORMIDAD ───────────────────────────────── -->
        <div class="footer-comprobante">
          <!-- QR Code vectorial local sin llamadas a internet -->
          <div class="qr-box">
            ${qrSvgHtml}
            <span class="qr-label">Ver Pedido Online</span>
          </div>

          <!-- Bloque de Conformidad -->
          <div class="conformidad-box ${esCopiaEmpresa ? 'conformidad-empresa' : ''}">
            <div class="conformidad-titulo">
              <span>${esCopiaEmpresa ? 'Constancia de Recepción y Conformidad (Ejemplar para la Empresa)' : 'Conformidad de Entrega'}</span>
              <span>Fecha: ____/____/________  Hora: ____:____ hs</span>
            </div>
            <div class="firmas-grid">
              <div class="campo-firma">Firma del Receptor</div>
              <div class="campo-firma">Aclaración de Firma</div>
              <div class="campo-firma">D.N.I. / Documento</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Imprime un único remito en una ventana emergente.
 * Genera consecutivamente: ORIGINAL - CLIENTE y DUPLICADO - EMPRESA.
 */
export async function imprimirRemitoIndividual(pedido, preparacion, opciones = {}) {
  if (!pedido) return;
  const copias = opciones.copias || ['ORIGINAL - CLIENTE', 'DUPLICADO - EMPRESA'];
  const win = window.open('', '_blank');
  if (!win) {
    alert('El navegador bloqueó la ventana emergente de impresión. Por favor habilitala para este sitio.');
    return;
  }

  win.document.write('<!DOCTYPE html><html><head><title>Cargando remito...</title><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#555;font-size:14px;background:#f9fafb;}</style></head><body><div>🌿 Cargando remito...</div></body></html>');

  let numeroRemito = opciones.numeroRemito || pedido.numero_remito || null;
  if (!numeroRemito) {
    numeroRemito = await obtenerNumeroRemito(pedido.numero_pedido);
  }

  const hojasHTML = copias.map(c => generarHojaRemitoHTML(pedido, preparacion, c, { numeroRemito })).join('');

  win.document.open();
  win.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Remito #${numeroRemito} - Huerta Urbana</title>
      <style>${ESTILOS_REMITO}</style>
    </head>
    <body>
      <div class="preview-toolbar">
        <h1>🌿 Remito #${numeroRemito} · ${pedido.nombre || 'Cliente'}</h1>
        <div class="btn-group">
          <button class="btn-close" onclick="window.close()">Cerrar</button>
          <button class="btn-print" onclick="window.print()">🖨️ Imprimir Remito</button>
        </div>
      </div>
      <div class="remito-wrapper">
        ${hojasHTML}
      </div>
      <script>
        window.addEventListener('DOMContentLoaded', () => {
          setTimeout(() => { window.print(); }, 400);
        });
      </script>
    </body>
    </html>
  `);
  win.document.close();
}

/**
 * Imprime un lote completo de remitos (Turno o Día completo) en UNA ÚNICA VENTANA.
 * Mantiene la tanda consecutiva pedido a pedido:
 * Pedido 1: ORIGINAL + DUPLICADO
 * Pedido 2: ORIGINAL + DUPLICADO
 * ...
 */
export async function imprimirRemitosEnLote(pedidos = [], preparaciones = {}, tituloLote = "Remitos del Día", opciones = {}) {
  if (!pedidos || pedidos.length === 0) {
    alert('No hay pedidos en la selección para imprimir.');
    return;
  }

  const copiasPorPedido = opciones.soloCliente ? ['ORIGINAL - CLIENTE'] : (opciones.copias || ['ORIGINAL - CLIENTE', 'DUPLICADO - EMPRESA']);

  const win = window.open('', '_blank');
  if (!win) {
    alert('El navegador bloqueó la ventana emergente de impresión. Por favor habilitala para este sitio.');
    return;
  }

  win.document.write(`<!DOCTYPE html><html><head><title>Cargando remitos...</title><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#555;font-size:14px;background:#f9fafb;}</style></head><body><div>🌿 Cargando ${pedidos.length} remitos...</div></body></html>`);

  const mapaNumerosRemito = {};
  await Promise.all(
    pedidos.map(async (p) => {
      try {
        const num = p.numero_remito || await obtenerNumeroRemito(p.numero_pedido);
        mapaNumerosRemito[p.numero_pedido] = num;
      } catch (e) {
        mapaNumerosRemito[p.numero_pedido] = p.numero_pedido || '00000001';
      }
    })
  );

  const totalHojas = pedidos.length * copiasPorPedido.length;

  const todasLasHojasHTML = pedidos.map(p => {
    const prep = preparaciones[p.numero_pedido] || null;
    const numeroRemito = mapaNumerosRemito[p.numero_pedido] || p.numero_pedido;
    return copiasPorPedido.map(tipo => generarHojaRemitoHTML(p, prep, tipo, { numeroRemito })).join('');
  }).join('');

  win.document.open();
  win.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>${tituloLote} (${pedidos.length} pedidos) - Huerta Urbana</title>
      <style>${ESTILOS_REMITO}</style>
    </head>
    <body>
      <div class="preview-toolbar">
        <h1>🌿 ${tituloLote} &mdash; ${pedidos.length} pedidos (${totalHojas} páginas)</h1>
        <div class="btn-group">
          <button class="btn-close" onclick="window.close()">Cerrar</button>
          <button class="btn-print" onclick="window.print()">🖨️ Imprimir Todos (${pedidos.length})</button>
        </div>
      </div>
      <div class="remito-wrapper">
        ${todasLasHojasHTML}
      </div>
      <script>
        window.addEventListener('DOMContentLoaded', () => {
          setTimeout(() => { window.print(); }, 600);
        });
      </script>
    </body>
    </html>
  `);
  win.document.close();
}
