// ============================================================================
// Utilidad de Generación e Impresión de Remitos (Individual y Lotes)
// Huerta Urbana Dashboard - Formato Comprobante Tipo Remito "X" (A4)
// ============================================================================

/**
 * DATOS FISCALES Y COMERCIALES DEL EMISOR
 * Editá los valores de este objeto según los datos fiscales de Huerta Urbana.
 * Si algún campo queda vacío o nulo, en el remito se visualizará "—".
 */
export const EMISOR = {
  razon: 'Huerta Urbana',                  // EDITAR: Razón Social o Nombre Fantasía
  cuit: '30-71829384-9',                   // EDITAR: C.U.I.T. del emisor
  domicilio: 'Ruta 8 Km 42.5, Tortuguitas, Bs. As.', // EDITAR: Domicilio comercial
  iva: 'Responsable Inscripto',            // EDITAR: Condición frente al IVA (ej: Resp. Inscripto / Monotributo / Exento)
  inicio_actividades: '01/04/2026',        // EDITAR: Fecha de inicio de actividades (DD/MM/AAAA)
};

/**
 * Parsea el texto del campo producto de un pedido cuando no proviene de la preparación en vivo.
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
 * AISLAMIENTO FASE 2:
 * Concentra en una única función la lectura y normalización de las pesadas reales de un pedido.
 * Cuando en la Fase 2 las pesadas reales se lean directamente desde Google Sheets (en lugar
 * del estado de React / localStorage), únicamente se modifica esta función sin alterar la plantilla.
 *
 * @param {Object} pedido - Objeto con datos del pedido (Google Sheets / mockData)
 * @param {Object} preparacion - Objeto de preparación { items: [...], completado: bool }
 * @returns {Array<Object>} Lista de ítems con cantidades reales, unidades y bolsas
 */
export function obtenerPesosReales(pedido, preparacion) {
  const tienePrep = preparacion && Array.isArray(preparacion.items) && preparacion.items.length > 0;
  const itemsFuente = tienePrep ? preparacion.items : parsearProductosPedido(pedido?.producto, pedido?.cantidades);

  if (!itemsFuente || itemsFuente.length === 0) {
    return [{
      nombre: pedido?.producto || 'Productos Varios',
      unidad: 'un',
      cantidadReal: pedido?.cantidades || 1,
      cantidadFormateada: `${pedido?.cantidades || 1} un`,
      precioUnitario: null,
      descuento: null,
      totalLinea: null,
      bolsasDetalle: []
    }];
  }

  return itemsFuente.map(item => {
    const bolsas = Array.isArray(item.bolsasAsignadas) ? item.bolsasAsignadas : [];
    const nombreLimpio = (item.nombre || '').trim();
    const nombreLower = nombreLimpio.toLowerCase();

    // 1. Determinar tipo de unidad (kg, atado, un)
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

    // 2. Calcular cantidad real entregada
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

    // 3. Formatear cantidad según unidad (cumplir: kg -> 3 decimales con coma; nunca 0,90 un para peso)
    let cantidadFormateada = '';
    if (unidad === 'kg') {
      cantidadFormateada = `${cantidadReal.toFixed(3).replace('.', ',')} kg`;
    } else if (unidad === 'atado') {
      cantidadFormateada = `${Math.round(cantidadReal)} atado${cantidadReal > 1 ? 's' : ''}`;
    } else {
      cantidadFormateada = `${Math.round(cantidadReal)} un`;
    }

    // 4. Precios unitarios y descuentos (actualmente el Sheet guarda el total consolidado, sin desglose por ítem)
    const precioUnitario = null; // No disponible en la planilla actual de pedidos
    const descuento = null;      // No disponible en la planilla actual de pedidos
    const totalLinea = null;     // No disponible por ítem; se muestra al pie el total del pedido

    return {
      nombre: nombreLimpio,
      unidad,
      cantidadReal,
      cantidadFormateada,
      precioUnitario,
      descuento,
      totalLinea,
      bolsasDetalle: bolsas
    };
  });
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

  .header-col-izq h2 {
    margin: 0 0 4px 0;
    font-size: 14pt;
    font-weight: 800;
    letter-spacing: -0.5px;
    text-transform: uppercase;
  }

  .header-col-izq .dato-emisor {
    font-size: 8.5pt;
    color: #111;
    line-height: 1.3;
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
    gap: 10px;
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
  }

  .qr-box img {
    width: 72px;
    height: 72px;
    display: block;
  }

  .qr-box .qr-label {
    font-size: 6pt;
    font-weight: 700;
    text-transform: uppercase;
    text-align: center;
    margin-top: 1px;
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
export function generarHojaRemitoHTML(pedido, preparacion, tipoCopia = "ORIGINAL - CLIENTE") {
  const esCopiaEmpresa = String(tipoCopia).toUpperCase().includes('EMPRESA') || String(tipoCopia).toUpperCase().includes('DUPLICADO');
  const items = obtenerPesosReales(pedido, preparacion);

  // TODO: Reemplazar por correlativo de remito que traerá el Apps Script
  const numeroRemito = pedido?.numero_pedido ? String(pedido.numero_pedido).replace(/^HU-?/i, '') : '00000001';
  const remitoFormateado = `0001-${String(numeroRemito).padStart(8, '0')}`;

  // Fecha de emisión (DD/MM/AAAA)
  const hoy = new Date();
  const fechaEmision = `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`;

  // Datos del Cliente
  const clienteNombre = pedido?.nombre || 'Consumidor Final';
  const clienteDireccion = pedido?.direccion ? `${pedido.direccion}${pedido.localidad ? ', ' + pedido.localidad : ''}` : 'A convenir';
  const clienteTelefono = pedido?.telefono || '—';
  const fechaEntregaStr = pedido?.dia_entrega || pedido?.fecha || '—';
  const turnoEntregaStr = pedido?.horario_entrega || pedido?.turno_entrega || '—';
  const numPedidoStr = pedido?.numero_pedido || '—';

  // Renderizar filas de ítems
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

    const precioUnitStr = item.precioUnitario !== null ? `$${item.precioUnitario.toLocaleString('es-AR')}` : '—';
    const descuentoStr = item.descuento !== null ? `$${item.descuento.toLocaleString('es-AR')}` : '—';
    const totalLineaStr = item.totalLinea !== null ? `$${item.totalLinea.toLocaleString('es-AR')}` : '—';

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

  // Total final del pedido
  const totalCobrarNum = Number(pedido?.total || 0);
  const totalFormateado = totalCobrarNum.toLocaleString('es-AR');

  // URL del QR del pedido
  const qrUrlDestino = `https://www.huertaurbana.com.ar/pedido/${encodeURIComponent(pedido?.numero_pedido || '')}`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=85x85&data=${encodeURIComponent(qrUrlDestino)}`;

  return `
    <div class="hoja-remito">
      <div>
        <!-- ── 1. ENCABEZADO FISCAL (3 BLOQUES) ───────────────────────── -->
        <div class="header-comprobante">
          <!-- Bloque Izquierdo: Emisor -->
          <div class="header-col-izq">
            <h2>${EMISOR.razon || '—'}</h2>
            <div class="dato-emisor">
              <div><strong>Domicilio:</strong> ${EMISOR.domicilio || '—'}</div>
              <div><strong>I.V.A.:</strong> ${EMISOR.iva || '—'}</div>
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

            <!-- Medio de pago con casillas para completar a mano -->
            <div class="pago-linea">
              <span style="font-weight:700;">Medio de Pago:</span>
              <div class="casillas-pago">
                <span class="casilla-item"><span class="casilla-box"></span> QR</span>
                <span class="casilla-item"><span class="casilla-box"></span> Transf.</span>
                <span class="casilla-item"><span class="casilla-box"></span> Débito</span>
                <span class="casilla-item"><span class="casilla-box"></span> Crédito</span>
                <span class="casilla-item"><span class="casilla-box"></span> Efectivo</span>
              </div>
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
              <td style="text-align:right; font-family:monospace;">$${totalFormateado}</td>
            </tr>
            <tr>
              <td>Descuentos:</td>
              <td style="text-align:right; font-family:monospace;">—</td>
            </tr>
            <tr>
              <td>Crédito aplicado:</td>
              <td style="text-align:right; font-family:monospace;">—</td>
            </tr>
            <tr class="row-total-final">
              <td>TOTAL A COBRAR:</td>
              <td style="text-align:right; font-family:monospace;">$${totalFormateado}</td>
            </tr>
          </table>
        </div>

        <!-- ── 5. PIE: QR Y CONFORMIDAD ───────────────────────────────── -->
        <div class="footer-comprobante">
          <!-- QR Code a la orden online -->
          <div class="qr-box">
            <img src="${qrImageUrl}" alt="QR Pedido" />
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
export function imprimirRemitoIndividual(pedido, preparacion, opciones = {}) {
  if (!pedido) return;
  const copias = opciones.copias || ['ORIGINAL - CLIENTE', 'DUPLICADO - EMPRESA'];
  const win = window.open('', '_blank');
  if (!win) {
    alert('El navegador bloqueó la ventana emergente de impresión. Por favor habilitala para este sitio.');
    return;
  }

  const hojasHTML = copias.map(c => generarHojaRemitoHTML(pedido, preparacion, c)).join('');

  win.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Remito #${pedido.numero_pedido || '0000'} - Huerta Urbana</title>
      <style>${ESTILOS_REMITO}</style>
    </head>
    <body>
      <div class="preview-toolbar">
        <h1>🌿 Remito #${pedido.numero_pedido || ''} · ${pedido.nombre || 'Cliente'}</h1>
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
export function imprimirRemitosEnLote(pedidos = [], preparaciones = {}, tituloLote = "Remitos del Día", opciones = {}) {
  if (!pedidos || pedidos.length === 0) {
    alert('No hay pedidos en la selección para imprimir.');
    return;
  }

  // Por defecto, genera ORIGINAL y DUPLICADO consecutivos para cada pedido
  const copiasPorPedido = opciones.soloCliente ? ['ORIGINAL - CLIENTE'] : (opciones.copias || ['ORIGINAL - CLIENTE', 'DUPLICADO - EMPRESA']);

  const win = window.open('', '_blank');
  if (!win) {
    alert('El navegador bloqueó la ventana emergente de impresión. Por favor habilitala para este sitio.');
    return;
  }

  const totalHojas = pedidos.length * copiasPorPedido.length;

  const todasLasHojasHTML = pedidos.map(p => {
    const prep = preparaciones[p.numero_pedido] || null;
    return copiasPorPedido.map(tipo => generarHojaRemitoHTML(p, prep, tipo)).join('');
  }).join('');

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
