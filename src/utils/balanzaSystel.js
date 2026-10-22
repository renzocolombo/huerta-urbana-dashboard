/**
 * Manejo de Balanza Systel (Clipse / Cuora) vía Web Serial API.
 * Configuración: 115200 baudios, 8 bits, sin paridad, 1 stop bit (8N1).
 */

import { useState, useEffect, useCallback } from 'react';

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
 * Extrae el peso y flag de estabilidad de la trama Systel si está disponible.
 */
export function extraerDatosSystel(trama) {
  if (!trama) return null;
  const str = trama.replace(',', '.');

  let hardwareEstable = null;
  const stxIdx = str.indexOf('\x02');
  const etxIdx = str.indexOf('\x03');
  let searchStr = str;
  if (stxIdx !== -1 && etxIdx !== -1 && etxIdx > stxIdx) {
    searchStr = str.slice(stxIdx + 1, etxIdx);
    const firstChar = searchStr.trim()[0];
    if (firstChar === 'S' || firstChar === 's' || firstChar === 'E' || firstChar === 'e') {
      hardwareEstable = true;
    } else if (firstChar === 'U' || firstChar === 'u' || firstChar === 'D' || firstChar === 'd' || firstChar === 'M' || firstChar === 'm') {
      hardwareEstable = false;
    }
  } else {
    if (/\b[UuDdMm]\b/.test(str)) hardwareEstable = false;
    else if (/\b[SsEe]\b/.test(str)) hardwareEstable = true;
  }

  const peso = extraerPesoSystel(str);
  if (peso === null) return null;

  return { peso, hardwareEstable };
}

/**
 * Verifica si el navegador soporta Web Serial API.
 */
export function soportaWebSerial() {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

/**
 * Gestor Singleton de conexión Web Serial a la balanza Systel.
 * Mantiene la conexión abierta durante toda la sesión del navegador para
 * que múltiples componentes (Compras, Merma, Ajuste) compartan la misma balanza
 * sin pedir reconectar constantemente.
 */
class BalanzaManager {
  constructor() {
    this.port = null;
    this.reader = null;
    this.isReading = false;
    this.enqInterval = null;
    this.conectado = false;
    this.conectando = false;
    this.error = null;
    this.ultimoPeso = null;
    this.esEstable = false;
    this.subscribers = new Set();
    this.recentReadings = []; // [{ peso, time, hardwareEstable }]
    this.connectPromise = null;

    if (typeof navigator !== 'undefined' && navigator.serial) {
      navigator.serial.addEventListener('disconnect', (event) => {
        if (this.port && event.target === this.port) {
          this.desconectar();
          this.error = 'Balanza desconectada físicamente del puerto USB/Serie.';
          this.notificar();
        }
      });
    }
  }

  isConectado() {
    return this.conectado && Boolean(this.port);
  }

  isConectando() {
    return this.conectando;
  }

  getUltimoPeso() {
    return this.ultimoPeso;
  }

  getEsEstable() {
    return this.esEstable;
  }

  getError() {
    return this.error;
  }

  notificar() {
    const estado = {
      conectado: this.isConectado(),
      conectando: this.conectando,
      pesoVivo: this.ultimoPeso,
      esEstable: this.esEstable,
      error: this.error,
    };
    for (const sub of this.subscribers) {
      try {
        sub(estado);
      } catch (e) {
        // silencioso
      }
    }
  }

  suscribir(callback) {
    this.subscribers.add(callback);
    // Notificar inmediatamente el estado actual
    callback({
      conectado: this.isConectado(),
      conectando: this.conectando,
      pesoVivo: this.ultimoPeso,
      esEstable: this.esEstable,
      error: this.error,
    });
    return () => {
      this.subscribers.delete(callback);
    };
  }

  registrarLectura(peso, hardwareEstable) {
    const now = Date.now();
    this.ultimoPeso = peso;

    // Guardar en historial de estabilidad (últimos 800ms)
    this.recentReadings.push({ peso, time: now, hardwareEstable });
    this.recentReadings = this.recentReadings.filter(r => now - r.time <= 800);

    let nuevoEstable = false;

    if (hardwareEstable === true) {
      nuevoEstable = true;
    } else if (hardwareEstable === false) {
      nuevoEstable = false;
    } else {
      // Estabilidad por software:
      // Verificamos si en una ventana de ~450ms los pesos varían <= 3 gramos
      const ventana = this.recentReadings.filter(r => now - r.time <= 450);
      if (ventana.length >= 2) {
        const pesos = ventana.map(r => r.peso);
        const min = Math.min(...pesos);
        const max = Math.max(...pesos);
        nuevoEstable = (max - min) <= 0.003;
      } else {
        // Si no hay variación respecto al último peso y pasaron más de 300ms
        nuevoEstable = true;
      }
    }

    this.esEstable = nuevoEstable;
    this.notificar();
  }

  async conectar() {
    if (this.isConectado()) {
      return true;
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    if (!soportaWebSerial()) {
      const err = new Error('Tu navegador no soporta Web Serial API (usá Chrome, Edge u Opera en PC).');
      this.error = err.message;
      this.notificar();
      throw err;
    }

    this.conectando = true;
    this.error = null;
    this.notificar();

    this.connectPromise = (async () => {
      try {
        this.port = await navigator.serial.requestPort();
        await this.port.open(SERIAL_SCALE_CONFIG);

        this.isReading = true;
        this.conectado = true;
        this.conectando = false;
        this.error = null;

        // Iniciar envío de ENQ (0x05) por si la balanza requiere petición por demanda
        if (this.enqInterval) clearInterval(this.enqInterval);
        this.enqInterval = setInterval(() => {
          this.enviarENQ();
        }, 400);

        this.leerLoop();
        this.notificar();
        return true;
      } catch (err) {
        this.conectado = false;
        this.conectando = false;
        this.error = err.message || 'No se pudo conectar a la balanza';
        this.port = null;
        this.notificar();
        return false;
      } finally {
        this.connectPromise = null;
      }
    })();

    return this.connectPromise;
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
              const datos = extraerDatosSystel(trama);
              if (datos !== null) {
                this.registrarLectura(datos.peso, datos.hardwareEstable);
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
                  const datos = extraerDatosSystel(linea);
                  if (datos !== null) {
                    this.registrarLectura(datos.peso, datos.hardwareEstable);
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
        this.error = err.message || 'Error en flujo de lectura de balanza';
        this.notificar();
      }
    } finally {
      if (this.reader) {
        try { this.reader.releaseLock(); } catch (e) {}
        this.reader = null;
      }
    }
  }

  async desconectar() {
    this.isReading = false;
    this.conectado = false;
    this.conectando = false;
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
    this.ultimoPeso = null;
    this.esEstable = false;
    this.recentReadings = [];
    this.notificar();
  }

  async toggle() {
    if (this.isConectado()) {
      await this.desconectar();
      return false;
    } else {
      return await this.conectar();
    }
  }
}

// Instancia singleton compartida en memoria durante la sesión del navegador
export const balanzaManager = new BalanzaManager();

/**
 * Hook de React para usar la balanza Systel en cualquier componente/modal.
 */
export function useBalanzaSystel() {
  const [estado, setEstado] = useState(() => ({
    conectado: balanzaManager.isConectado(),
    conectando: balanzaManager.isConectando(),
    pesoVivo: balanzaManager.getUltimoPeso(),
    esEstable: balanzaManager.getEsEstable(),
    error: balanzaManager.getError(),
  }));

  useEffect(() => {
    const unsub = balanzaManager.suscribir((nuevoEstado) => {
      setEstado({ ...nuevoEstado });
    });
    return unsub;
  }, []);

  const conectar = useCallback(() => balanzaManager.conectar(), []);
  const desconectar = useCallback(() => balanzaManager.desconectar(), []);
  const toggle = useCallback(() => balanzaManager.toggle(), []);

  return {
    ...estado,
    conectar,
    desconectar,
    toggle,
    soportaWebSerial: soportaWebSerial(),
  };
}

/**
 * Wrapper de compatibilidad hacia atrás para código que usa new BalanzaSystelSession().
 */
export class BalanzaSystelSession {
  constructor({ onPeso, onStatusChange, onError }) {
    this.onPeso = onPeso || (() => {});
    this.onStatusChange = onStatusChange || (() => {});
    this.onError = onError || (() => {});
    this.unsub = null;
  }

  async conectar() {
    if (this.unsub) {
      this.unsub();
    }
    this.unsub = balanzaManager.suscribir(({ pesoVivo, esEstable, conectado, conectando, error }) => {
      this.onStatusChange({ conectando, conectado, error });
      if (pesoVivo !== null) {
        this.onPeso(pesoVivo, esEstable);
      }
      if (error) {
        this.onError(new Error(error));
      }
    });

    return await balanzaManager.conectar();
  }

  async desconectar(force = false) {
    if (this.unsub) {
      this.unsub();
      this.unsub = null;
    }
    if (force) {
      await balanzaManager.desconectar();
    }
    this.onStatusChange({ conectando: false, conectado: balanzaManager.isConectado(), error: null });
  }
}
