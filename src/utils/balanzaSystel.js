/**
 * Manejo de Balanza Systel (Clipse / Cuora) vía Web Serial API.
 * Configuración: 115200 baudios, 8 bits, sin paridad, 1 stop bit (8N1).
 */

export const SERIAL_SCALE_CONFIG = {
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
};

/**
 * Extrae el peso en kg como número flotante o null a partir de una trama cruda de Systel.
 */
export function extraerPesoSystel(trama) {
  if (!trama) return null;
  const str = trama.replace(',', '.');

  // 1. Trama delimitada por STX (\x02) y ETX (\x03) típica de Systel
  const stxIdx = str.indexOf('\x02');
  const etxIdx = str.indexOf('\x03');
  if (stxIdx !== -1 && etxIdx !== -1 && etxIdx > stxIdx) {
    const payload = str.slice(stxIdx + 1, etxIdx);
    const m = payload.match(/([-+]?\d{1,4}\.\d{2,3})/);
    if (m) {
      const val = parseFloat(m[1]);
      if (!isNaN(val)) return Number(val.toFixed(3));
    }
  }

  // 2. Patrón decimal estándar con 2 o 3 decimales (ej: "0.444", " 0.444 kg", "+0.444")
  const matchDecimal = str.match(/([-+]?\d{1,4}\.\d{2,3})/);
  if (matchDecimal) {
    const val = parseFloat(matchDecimal[1]);
    if (!isNaN(val)) return Number(val.toFixed(3));
  }

  // 3. Patrón de 4 a 6 dígitos en gramos (ej: "00444" -> 0.444 kg)
  const matchEntero = str.match(/\b(\d{4,6})\b/);
  if (matchEntero) {
    const val = parseInt(matchEntero[1], 10) / 1000;
    if (!isNaN(val) && val >= 0 && val < 100) return Number(val.toFixed(3));
  }

  return null;
}

/**
 * Verifica si el navegador soporta Web Serial API.
 */
export function soportaWebSerial() {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

/**
 * Controlador de sesión de lectura Web Serial con reconexión y streaming de peso.
 */
export class BalanzaSystelSession {
  constructor({ onPeso, onStatusChange, onError }) {
    this.onPeso = onPeso || (() => {});
    this.onStatusChange = onStatusChange || (() => {});
    this.onError = onError || (() => {});
    this.port = null;
    this.reader = null;
    this.isReading = false;
    this.enqInterval = null;
    this.ultimoPeso = null;
  }

  async conectar() {
    if (!soportaWebSerial()) {
      const err = new Error('Tu navegador no soporta Web Serial API (usá Chrome, Edge u Opera en PC).');
      this.onError(err);
      throw err;
    }

    try {
      this.onStatusChange({ conectando: true, conectado: false });
      this.port = await navigator.serial.requestPort();
      await this.port.open(SERIAL_SCALE_CONFIG);

      this.isReading = true;
      this.onStatusChange({ conectando: false, conectado: true, error: null });

      // Iniciar envío de ENQ (0x05) por si la balanza requiere petición por demanda
      this.enqInterval = setInterval(() => {
        this.enviarENQ();
      }, 400);

      this.leerLoop();
      return true;
    } catch (err) {
      this.onStatusChange({ conectando: false, conectado: false, error: err.message });
      this.onError(err);
      return false;
    }
  }

  async enviarENQ() {
    if (!this.port || !this.port.writable) return;
    try {
      const writer = this.port.writable.getWriter();
      await writer.write(new Uint8Array([0x05]));
      writer.releaseLock();
    } catch (e) {
      // silencioso
    }
  }

  async leerLoop() {
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (this.isReading && this.port && this.port.readable) {
        this.reader = this.port.readable.getReader();
        while (this.isReading) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value && value.length > 0) {
            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            // Procesar STX/ETX
            let stxIdx = buffer.indexOf('\x02');
            let etxIdx = buffer.indexOf('\x03');
            while (stxIdx !== -1 && etxIdx !== -1 && etxIdx > stxIdx) {
              const trama = buffer.slice(stxIdx, etxIdx + 1);
              const p = extraerPesoSystel(trama);
              if (p !== null) {
                this.ultimoPeso = p;
                this.onPeso(p);
              }
              buffer = buffer.slice(etxIdx + 1);
              stxIdx = buffer.indexOf('\x02');
              etxIdx = buffer.indexOf('\x03');
            }

            // Procesar saltos de línea
            const lineas = buffer.split(/[\r\n]+/);
            if (lineas.length > 1) {
              for (let i = 0; i < lineas.length - 1; i++) {
                const linea = lineas[i].trim();
                if (linea) {
                  const p = extraerPesoSystel(linea);
                  if (p !== null) {
                    this.ultimoPeso = p;
                    this.onPeso(p);
                  }
                }
              }
              buffer = lineas[lineas.length - 1];
            }

            // Evitar desbordamiento de buffer
            if (buffer.length > 1024) buffer = buffer.slice(-256);
          }
        }
        this.reader.releaseLock();
        this.reader = null;
      }
    } catch (err) {
      if (this.isReading) {
        this.onError(err);
      }
    } finally {
      if (this.reader) {
        try { this.reader.releaseLock(); } catch (e) {}
      }
    }
  }

  async desconectar() {
    this.isReading = false;
    if (this.enqInterval) {
      clearInterval(this.enqInterval);
      this.enqInterval = null;
    }
    if (this.reader) {
      try { await this.reader.cancel(); } catch (e) {}
      try { this.reader.releaseLock(); } catch (e) {}
      this.reader = null;
    }
    if (this.port) {
      try { await this.port.close(); } catch (e) {}
      this.port = null;
    }
    this.onStatusChange({ conectando: false, conectado: false, error: null });
  }
}
