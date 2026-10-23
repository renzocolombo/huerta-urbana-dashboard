// ============================================================================
// Impresión de Etiquetas para Bolsas Pesadas - Huerta Urbana
// Formato Térmico Estándar 80mm x 50mm
// Muestra: Producto, Peso Real, Precio por Kg/Unidad y Precio Final (redondeado a $1)
// ============================================================================

export function imprimirEtiquetaBolsa({
  producto,
  pesoReal = 0,
  precioUnitario = 0,
  unidad = 'kg',
  tagId = null,
  uniqueCode = null,
  esUnidad = false,
}) {
  const nombreLimpio = String(producto || 'PRODUCTO').trim().toUpperCase();
  const nombreCode = nombreLimpio.replace(/\s+/g, '-').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const pesoNum = Number(pesoReal || 0);
  const precioUnitNum = Number(precioUnitario || 0);
  const esUn = esUnidad || unidad === 'un' || unidad === 'unidad';

  // Formato de peso / cantidad
  const pesoStr = esUn ? `${Math.round(pesoNum || 1)} un` : `${pesoNum.toFixed(3).replace('.', ',')} kg`;
  const barcodePeso = esUn ? (pesoNum || 1).toFixed(3) : pesoNum.toFixed(3);
  const finalTag = tagId ? String(tagId).toUpperCase() : Math.random().toString(36).substring(2, 6).toUpperCase();
  const barcodeValue = uniqueCode || `${nombreCode}-${barcodePeso}-${finalTag}`;

  // Precio final redondeado a $1
  const precioFinal = Math.round(pesoNum * precioUnitNum);
  const precioUnitStr = `$${precioUnitNum.toLocaleString('es-AR')}`;
  const precioFinalStr = `$${precioFinal.toLocaleString('es-AR')}`;
  const labelUnidad = esUn ? 'un' : 'kg';

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Etiqueta - ${nombreLimpio}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.5/JsBarcode.all.min.js"></script>
<script>
  window.onload = function() {
    try {
      JsBarcode('#barcode', '${barcodeValue}', {
        format: 'CODE128',
        width: 1.4,
        height: 20,
        displayValue: true,
        fontSize: 8,
        margin: 0,
        background: 'transparent',
      });
    } catch(e) {}
    setTimeout(function() { window.print(); window.close(); }, 350);
  };
</script>
<style>
  *, *::before, *::after {
    margin: 0 !important;
    padding: 0 !important;
    box-sizing: border-box !important;
  }
  @page {
    size: 80mm 50mm;
    margin: 0 !important;
  }
  html, body {
    width: 80mm !important;
    height: 50mm !important;
    max-width: 80mm !important;
    max-height: 50mm !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    background: #ffffff !important;
    font-family: Arial, Helvetica, sans-serif !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .etiqueta {
    width: 78mm !important;
    height: 48mm !important;
    margin: 1mm auto !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: space-between !important;
    padding: 1.5mm 2mm 1mm 2mm !important;
    text-align: center !important;
  }
  .top {
    width: 100% !important;
    display: flex !important;
    justify-content: space-between !important;
    align-items: center !important;
    border-bottom: 0.4mm solid #000000 !important;
    padding-bottom: 0.5mm !important;
  }
  .brand {
    font-size: 10pt !important;
    font-weight: 900 !important;
    letter-spacing: 0.05em !important;
  }
  .url {
    font-size: 6.5pt !important;
    font-weight: 700 !important;
    color: #444444 !important;
  }
  .product-name {
    width: 100% !important;
    font-size: 13pt !important;
    font-weight: 900 !important;
    color: #000000 !important;
    text-transform: uppercase !important;
    line-height: 1.15 !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    margin: 0.5mm 0 !important;
  }
  .datos-pesaje {
    width: 100% !important;
    display: flex !important;
    justify-content: space-between !important;
    align-items: baseline !important;
    background: #f4f4f4 !important;
    padding: 1mm 2mm !important;
    border-radius: 1mm !important;
    border: 0.3mm solid #cccccc !important;
  }
  .peso-box {
    text-align: left !important;
  }
  .peso-label {
    font-size: 6pt !important;
    font-weight: 700 !important;
    color: #666666 !important;
    text-transform: uppercase !important;
  }
  .peso-val {
    font-size: 13pt !important;
    font-weight: 900 !important;
    color: #000000 !important;
  }
  .precios-box {
    text-align: right !important;
  }
  .precio-unit {
    font-size: 7.5pt !important;
    font-weight: 700 !important;
    color: #444444 !important;
  }
  .precio-total {
    font-size: 13pt !important;
    font-weight: 900 !important;
    color: #000000 !important;
  }
  svg#barcode {
    display: block !important;
    width: 68mm !important;
    max-width: 68mm !important;
    max-height: 13mm !important;
    height: auto !important;
    margin: 0 auto !important;
  }
  @media print {
    .etiqueta {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
  }
</style>
</head>
<body>
  <div class="etiqueta">
    <div class="top">
      <span class="brand">🌿 HUERTA URBANA</span>
      <span class="url">huertaurbana.com.ar &middot; #${finalTag}</span>
    </div>
    
    <div class="product-name">${nombreLimpio}</div>
    
    <div class="datos-pesaje">
      <div class="peso-box">
        <div class="peso-label">Peso Real</div>
        <div class="peso-val">${pesoStr}</div>
      </div>
      <div class="precios-box">
        <div class="precio-unit">x ${labelUnidad}: ${precioUnitStr}</div>
        <div class="precio-total">Total: ${precioFinalStr}</div>
      </div>
    </div>
    
    <svg id="barcode"></svg>
  </div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=340,height=240');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}
