// ============================================================================
// Utilidad de Generación e Impresión de Remitos (Individual y Lotes)
// Huerta Urbana Dashboard
// ============================================================================

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

const ESTILOS_REMITO = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  
  @page {
    size: A4 portrait;
    margin: 8mm;
  }

  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    margin: 0;
    padding: 0;
    background: #f3f4f6;
    color: #111827;
    font-size: 11px;
    line-height: 1.35;
  }

  /* Barra de herramientas para vista previa en pantalla */
  .preview-toolbar {
    position: sticky;
    top: 0;
    z-index: 9999;
    background: #111827;
    color: white;
    padding: 12px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    border-bottom: 2px solid #22c55e;
  }

  .preview-toolbar h1 {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .preview-toolbar .btn-group {
    display: flex;
    gap: 10px;
  }

  .preview-toolbar button {
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    font-weight: 700;
    padding: 8px 16px;
    border-radius: 8px;
    border: none;
    transition: all 0.2s;
  }

  .btn-print {
    background: #22c55e;
    color: white;
  }
  .btn-print:hover {
    background: #16a34a;
  }

  .btn-close {
    background: #374151;
    color: #e5e7eb;
  }
  .btn-close:hover {
    background: #4b5563;
  }

  .remito-wrapper {
    max-width: 210mm;
    margin: 15px auto;
  }

  /* Hoja A4 estándar */
  .hoja-remito {
    width: 210mm;
    min-height: 290mm;
    margin: 0 auto 20px auto;
    background: white;
    padding: 10mm 12mm;
    box-shadow: 0 4px 20px rgba(0,0,0,0.08);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    page-break-after: always;
    break-after: page;
    border: 1.5px solid #000;
    position: relative;
  }

  /* Encabezado */
  .header-remito {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #000;
    padding-bottom: 8px;
    margin-bottom: 12px;
  }

  .brand-col h2 {
    margin: 0;
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.5px;
    color: #000;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .brand-col .sub {
    font-size: 10px;
    color: #4b5563;
    margin-top: 2px;
  }

  .remito-meta {
    text-align: right;
  }

  .remito-badge {
    display: inline-block;
    background: #000;
    color: #fff;
    font-size: 11px;
    font-weight: 800;
    padding: 3px 8px;
    border-radius: 4px;
    text-transform: uppercase;
    margin-bottom: 4px;
  }

  .meta-info {
    font-size: 11px;
    font-weight: 700;
    color: #111;
  }

  /* Datos del Cliente y Envío */
  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    background: #f9fafb;
    border: 1px solid #000;
    padding: 10px 12px;
    border-radius: 6px;
    margin-bottom: 14px;
  }

  .info-item {
    font-size: 11px;
    line-height: 1.4;
  }

  .info-item strong {
    font-weight: 700;
    color: #000;
    display: inline-block;
    min-width: 80px;
  }

  .obs-box {
    grid-column: span 2;
    background: #fffbeb;
    border: 1px dashed #d97706;
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 11px;
    color: #92400e;
    margin-top: 2px;
  }

  /* Tabla de Productos */
  .table-section {
    flex-grow: 1;
    margin-bottom: 14px;
  }

  .table-title {
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1.5px solid #000;
    padding-bottom: 4px;
    margin-bottom: 6px;
    display: flex;
    justify-content: space-between;
  }

  table.remito-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
  }

  table.remito-table th {
    background: #f3f4f6;
    border-top: 1.5px solid #000;
    border-bottom: 1.5px solid #000;
    padding: 6px 4px;
    text-align: left;
    font-weight: 800;
    font-size: 10px;
    text-transform: uppercase;
  }

  table.remito-table td {
    padding: 6px 4px;
    border-bottom: 1px solid #e5e7eb;
    vertical-align: top;
  }

  table.remito-table tr:last-child td {
    border-bottom: 1.5px solid #000;
  }

  .col-cant { width: 35px; text-align: center; font-weight: 700; }
  .col-prod { font-weight: 600; }
  .col-sol { width: 75px; text-align: right; }
  .col-real { width: 85px; text-align: right; font-weight: 700; }
  .col-dif { width: 70px; text-align: right; font-weight: 700; }

  .bolsas-detalle {
    margin-top: 3px;
    padding-left: 8px;
    font-size: 9.5px;
    color: #4b5563;
  }

  .bolsa-chip {
    display: inline-block;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 3px;
    padding: 1px 4px;
    margin: 1px 2px;
    font-family: monospace;
    font-size: 9px;
  }

  .diff-pos { color: #15803d; }
  .diff-neg { color: #b91c1c; }
  .diff-zero { color: #6b7280; }

  /* Cuadro de Totales */
  .totales-section {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
    gap: 15px;
  }

  .resumen-pesos-card {
    border: 1px solid #000;
    background: #f9fafb;
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 11px;
    flex-grow: 1;
  }

  .resumen-pesos-card table {
    width: 100%;
    border-collapse: collapse;
  }

  .resumen-pesos-card td {
    padding: 2px 4px;
    border: none;
  }

  .total-pagar-box {
    border: 2px solid #000;
    background: #000;
    color: white;
    padding: 10px 18px;
    border-radius: 6px;
    min-width: 220px;
    text-align: right;
  }

  .total-pagar-box .lbl {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.9;
    font-weight: 700;
  }

  .total-pagar-box .val {
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -0.5px;
  }

  /* Pie de página y conformidad */
  .footer-remito {
    border-top: 1.5px solid #000;
    padding-top: 10px;
  }

  .firmas-row {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 15px;
    margin-bottom: 10px;
    font-size: 10px;
  }

  .linea-firma {
    border-bottom: 1px dashed #000;
    height: 25px;
    margin-top: 5px;
  }

  .thanks-note {
    text-align: center;
    font-size: 10px;
    color: #4b5563;
    font-weight: 600;
  }

  /* ========================================================
     IMPRESIÓN: Reglas limpias para impresora y PDF
     ======================================================== */
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
 * Genera el HTML de una hoja de remito (Cliente o Copia Interna)
 * para un pedido, considerando toda la información cargada/escaneada en tiempo real.
 */
export function generarHojaRemitoHTML(pedido, preparacion, tipoCopia = "CLIENTE") {
  const prep = preparacion || null;
  const tienePrep = prep && prep.items && prep.items.length > 0;
  
  let filasProductosHTML = '';
  let totalPesoSolicitado = 0;
  let totalPesoReal = 0;
  let totalBolsasAsignadas = 0;

  if (tienePrep) {
    filasProductosHTML = prep.items.map(item => {
      const bolsas = item.bolsasAsignadas || [];
      totalBolsasAsignadas += bolsas.length;
      const pesoReal = bolsas.reduce((acc, b) => acc + (b.peso || 0), 0);
      const pesoPedido = item.pesoSolicitado ? item.pesoSolicitado * item.cantidad : pesoReal;
      const diff = Math.round((pesoReal - pesoPedido) * 1000) / 1000;
      
      totalPesoSolicitado += pesoPedido;
      totalPesoReal += pesoReal;
      
      const diffClass = diff > 0 ? 'diff-pos' : diff < 0 ? 'diff-neg' : 'diff-zero';
      const diffStr = diff > 0 ? `+${diff.toFixed(3)} kg` : diff < 0 ? `${diff.toFixed(3)} kg` : '0.000 kg';
      
      let detalleBolsas = '';
      if (bolsas.length > 0) {
        detalleBolsas = `
          <div class="bolsas-detalle">
            ${bolsas.map((b, i) => `
              <span class="bolsa-chip">
                B${i + 1}: ${b.peso ? b.peso.toFixed(3) + 'kg' : '?'} 
                ${b.uniqueCode ? `(${b.uniqueCode})` : ''} 
                ${b.tagId ? `[${b.tagId}]` : ''}
              </span>
            `).join('')}
          </div>
        `;
      } else {
        detalleBolsas = `<div class="bolsas-detalle" style="color:#9ca3af;font-style:italic;">(Sin bolsas escaneadas aún)</div>`;
      }

      return `
        <tr>
          <td class="col-cant">${item.cantidad}</td>
          <td class="col-prod">
            <strong>${item.nombre.toUpperCase()}</strong>
            ${detalleBolsas}
          </td>
          <td class="col-sol">${pesoPedido > 0 ? pesoPedido.toFixed(3) + ' kg' : '—'}</td>
          <td class="col-real">${pesoReal > 0 ? pesoReal.toFixed(3) + ' kg' : '<span style="color:#9ca3af;font-size:10px;">Pendiente</span>'}</td>
          <td class="col-dif ${diffClass}">${pesoReal > 0 ? diffStr : '—'}</td>
        </tr>
      `;
    }).join('');
  } else {
    // Si no ha iniciado preparación formal, desglosamos los ítems del pedido
    const itemsParseados = parsearProductosPedido(pedido.producto, pedido.cantidades);
    if (itemsParseados.length > 0) {
      filasProductosHTML = itemsParseados.map(it => {
        const peso = it.pesoSolicitado ? (it.pesoSolicitado * it.cantidad) : null;
        if (peso) totalPesoSolicitado += peso;
        return `
          <tr>
            <td class="col-cant">${it.cantidad}</td>
            <td class="col-prod"><strong>${it.nombre.toUpperCase()}</strong></td>
            <td class="col-sol">${peso ? peso.toFixed(3) + ' kg' : '—'}</td>
            <td class="col-real" style="color:#9ca3af;font-size:10px;">Sin escanear</td>
            <td class="col-dif">—</td>
          </tr>
        `;
      }).join('');
    } else {
      filasProductosHTML = `
        <tr>
          <td class="col-cant">${pedido.cantidades || 1}</td>
          <td class="col-prod"><strong>${pedido.producto || "Sin especificar"}</strong></td>
          <td class="col-sol">—</td>
          <td class="col-real">—</td>
          <td class="col-dif">—</td>
        </tr>
      `;
    }
  }

  const diffTotal = Math.round((totalPesoReal - totalPesoSolicitado) * 1000) / 1000;
  const diffTotalClass = diffTotal > 0 ? 'diff-pos' : diffTotal < 0 ? 'diff-neg' : 'diff-zero';
  const diffTotalStr = diffTotal > 0 ? `+${diffTotal.toFixed(3)} kg` : `${diffTotal.toFixed(3)} kg`;

  const formattedTotal = Number(pedido.total || 0).toLocaleString('es-AR');
  const fechaStr = pedido.dia_entrega || pedido.fecha || 'Fecha no indicada';
  const turnoStr = pedido.horario_entrega || pedido.turno_entrega || 'Franja habitual';

  return `
    <div class="hoja-remito">
      <div>
        <!-- Cabecera -->
        <div class="header-remito">
          <div class="brand-col">
            <h2>🌿 HUERTA URBANA</h2>
            <div class="sub">Cultivos Agroecológicos · Tortuguitas, Bs. As. · Tel/WhatsApp: 11 6177-1376</div>
            <div class="sub" style="font-weight: 600;">huertaurbana.com.ar</div>
          </div>
          <div class="remito-meta">
            <div class="remito-badge">REMITO · ${tipoCopia}</div>
            <div class="meta-info">PEDIDO: <strong>#${pedido.numero_pedido || '0000'}</strong></div>
            <div class="meta-info">FECHA: ${fechaStr}</div>
            <div class="meta-info">TURNO: ${turnoStr}</div>
          </div>
        </div>

        <!-- Información de Entrega y Cliente -->
        <div class="info-grid">
          <div class="info-item">
            <strong>CLIENTE:</strong> ${pedido.nombre || "Consumidor Final"}<br/>
            <strong>DIRECCIÓN:</strong> ${pedido.direccion || "A convenir"}, ${pedido.localidad || ""}<br/>
            <strong>TELÉFONO:</strong> ${pedido.telefono || "No especificado"}
          </div>
          <div class="info-item">
            <strong>ENTREGA:</strong> ${pedido.dia_entrega || ""} (${pedido.horario_entrega || ""})<br/>
            <strong>ESTADO PAGO:</strong> <span style="font-weight:700; color:${(pedido.estado_pago || '').toLowerCase() === 'approved' ? '#15803d' : '#b45309'}">${(pedido.estado_pago || 'Pendiente').toUpperCase()}</span><br/>
            <strong>ESTADO ARMADO:</strong> <span style="font-weight:700;">${tienePrep ? (prep.completado ? '✅ COMPLETADO' : `⏳ EN PREPARACIÓN (${totalBolsasAsignadas} bolsas)`) : '⏳ PENDIENTE'}</span>
          </div>
          ${pedido.observaciones ? `
            <div class="obs-box">
              <strong>OBSERVACIONES / NOTA:</strong> "${pedido.observaciones}"
            </div>
          ` : ''}
        </div>

        <!-- Tabla de Productos -->
        <div class="table-section">
          <div class="table-title">
            <span>Detalle de Productos & Pesos Reales</span>
            <span style="font-size:9.5px;color:#6b7280;font-weight:normal;">Trazabilidad por código de balanza</span>
          </div>
          <table class="remito-table">
            <thead>
              <tr>
                <th class="col-cant">Cant</th>
                <th class="col-prod">Descripción / Bolsas Asignadas</th>
                <th class="col-sol">Pedido</th>
                <th class="col-real">Peso Real</th>
                <th class="col-dif">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              ${filasProductosHTML}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <!-- Resumen de Pesos y Total -->
        <div class="totales-section">
          <div class="resumen-pesos-card">
            <table>
              <tr>
                <td><strong>Kilos Solicitados:</strong></td>
                <td style="text-align:right; font-weight:700;">${totalPesoSolicitado > 0 ? totalPesoSolicitado.toFixed(3) + ' kg' : '—'}</td>
                <td style="padding-left:15px;"><strong>Kilos Reales Pesados:</strong></td>
                <td style="text-align:right; font-weight:700; color:#15803d;">${totalPesoReal > 0 ? totalPesoReal.toFixed(3) + ' kg' : '—'}</td>
              </tr>
              <tr>
                <td><strong>Diferencia Neta:</strong></td>
                <td style="text-align:right; font-weight:700;" class="${diffTotalClass}">${totalPesoReal > 0 ? diffTotalStr : '—'}</td>
                <td style="padding-left:15px;"><strong>Bolsas Escaneadas:</strong></td>
                <td style="text-align:right; font-weight:700;">${totalBolsasAsignadas}</td>
              </tr>
            </table>
          </div>

          <div class="total-pagar-box">
            <div class="lbl">Total del Pedido</div>
            <div class="val">$${formattedTotal}</div>
          </div>
        </div>

        <!-- Firma y Conformidad -->
        <div class="footer-remito">
          <div class="firmas-row">
            <div>
              Recibí Conforme:
              <div class="linea-firma"></div>
            </div>
            <div>
              Firma del Receptor:
              <div class="linea-firma"></div>
            </div>
            <div>
              Aclaración y DNI:
              <div class="linea-firma"></div>
            </div>
          </div>
          <div class="thanks-note">
            ¡Gracias por elegir una alimentación fresca y agroecológica! · <strong>huertaurbana.com.ar</strong>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Imprime un único remito específico en una ventana emergente.
 * Genera dos hojas: ORIGINAL (Cliente) y DUPLICADO (Copia Interna).
 */
export function imprimirRemitoIndividual(pedido, preparacion, opciones = {}) {
  if (!pedido) return;
  const copias = opciones.copias || ['ORIGINAL - CLIENTE', 'DUPLICADO - COPIA INTERNA'];
  const win = window.open('', '_blank');
  if (!win) {
    alert('El navegador bloqueó la ventana de impresión. Por favor, permití las ventanas emergentes.');
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
        <h1>🌿 Remito #${pedido.numero_pedido} · ${pedido.nombre || 'Cliente'}</h1>
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
 * Imprime un lote completo de remitos (Turno completo o Día completo)
 * en UNA ÚNICA VENTANA y con una sola orden de impresión de navegador.
 * Cada remito se pagina automáticamente con page-break-after para A4.
 */
export function imprimirRemitosEnLote(pedidos = [], preparaciones = {}, tituloLote = "Remitos del Día", opciones = {}) {
  if (!pedidos || pedidos.length === 0) {
    alert('No hay pedidos en la selección para imprimir.');
    return;
  }

  // Por defecto, en lote se puede imprimir 1 copia por pedido (Cliente) o 2 (Cliente + Interna)
  const copiasPorPedido = opciones.soloCliente ? ['CLIENTE'] : (opciones.copias || ['CLIENTE', 'COPIA INTERNA']);

  const win = window.open('', '_blank');
  if (!win) {
    alert('El navegador bloqueó la ventana de impresión. Por favor, permití las ventanas emergentes.');
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
