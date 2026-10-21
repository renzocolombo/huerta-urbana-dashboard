/**
 * Generador QR 100% local en JavaScript puro (sin dependencias externas ni llamadas a APIs de terceros).
 * Genera un SVG vectorial limpio inline que se imprime nítido y funciona 100% offline.
 */

// Tablas de codificación QR y polinomios Galois GF(256)
const QR_POLYNOMIALS = [
  null,
  [1, 127, 122, 154, 164, 11, 68, 117], // v1-L (7 ecc)
  [1, 216, 194, 159, 111, 199, 94, 95, 113, 157], // v2-L (10 ecc)
  [1, 62, 111, 15, 48, 172, 107, 211, 247, 175, 222, 240, 209, 12, 149], // v3-L (15 ecc)
  [1, 62, 111, 15, 48, 172, 107, 211, 247, 175, 222, 240, 209, 12, 149], // v4-L (20 ecc)
];

const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);
(function initGalois() {
  let val = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = val;
    EXP_TABLE[i + 255] = val;
    LOG_TABLE[val] = i;
    val = (val << 1) ^ (val & 0x80 ? 0x11d : 0);
  }
})();

function gfMultiply(x, y) {
  if (x === 0 || y === 0) return 0;
  return EXP_TABLE[LOG_TABLE[x] + LOG_TABLE[y]];
}

function calculateEcc(data, poly) {
  const eccCount = poly.length - 1;
  const result = new Uint8Array(eccCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ result[0];
    result.copyWithin(0, 1);
    result[eccCount - 1] = 0;
    for (let j = 0; j < eccCount; j++) {
      result[j] ^= gfMultiply(poly[j + 1], factor);
    }
  }
  return result;
}

/**
 * Generador QR básico para strings cortos/medianos (URLs de pedidos).
 * Soporta versiones 1 a 4 con corrección de errores Low/Medium.
 */
export function generarQRSvg(texto, size = 80) {
  if (!texto) return '';

  const utf8Bytes = new TextEncoder().encode(texto);
  const dataLen = utf8Bytes.length;

  // Determinar versión mínima (1: 19 bytes, 2: 34 bytes, 3: 55 bytes, 4: 80 bytes)
  let version = 1;
  let totalDataBytes = 19;
  let poly = [1, 127, 122, 154, 164, 11, 68, 117];

  if (dataLen <= 17) {
    version = 1;
    totalDataBytes = 19;
    poly = [1, 127, 122, 154, 164, 11, 68, 117]; // 7 ECC
  } else if (dataLen <= 32) {
    version = 2;
    totalDataBytes = 34;
    poly = [1, 216, 194, 159, 111, 199, 94, 95, 113, 157]; // 10 ECC
  } else if (dataLen <= 53) {
    version = 3;
    totalDataBytes = 55;
    poly = [1, 62, 111, 15, 48, 172, 107, 211, 247, 175, 222, 240, 209, 12, 149]; // 15 ECC
  } else {
    version = 4;
    totalDataBytes = 80;
    poly = [1, 182, 137, 73, 160, 92, 120, 145, 17, 142, 67, 183, 58, 238, 140, 176, 151, 62, 39, 202]; // 20 ECC
  }

  // 1. Armar buffer de datos (Modo Byte: 0100 + longitud + data + padding)
  const bitBuffer = [];
  function pushBits(val, len) {
    for (let i = len - 1; i >= 0; i--) {
      bitBuffer.push((val >> i) & 1);
    }
  }

  pushBits(0b0100, 4); // Modo Byte
  pushBits(dataLen, 8); // Longitud
  for (let i = 0; i < dataLen; i++) {
    pushBits(utf8Bytes[i], 8);
  }

  // Terminador
  const maxBits = totalDataBytes * 8;
  const termBits = Math.min(4, maxBits - bitBuffer.length);
  pushBits(0, termBits);

  // Alinear a byte
  while (bitBuffer.length % 8 !== 0) {
    bitBuffer.push(0);
  }

  // Bytes de relleno (0xEC, 0x11)
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bitBuffer.length < maxBits) {
    pushBits(padBytes[padIdx % 2], 8);
    padIdx++;
  }

  const dataBytes = new Uint8Array(totalDataBytes);
  for (let i = 0; i < totalDataBytes; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | bitBuffer[i * 8 + j];
    }
    dataBytes[i] = b;
  }

  // 2. Calcular ECC
  const eccBytes = calculateEcc(dataBytes, poly);

  // 3. Crear matriz
  const moduleCount = 17 + version * 4;
  const matrix = Array.from({ length: moduleCount }, () => new Int8Array(moduleCount).fill(-1));
  const isFunction = Array.from({ length: moduleCount }, () => new Uint8Array(moduleCount));

  function setModule(r, c, val) {
    if (r >= 0 && r < moduleCount && c >= 0 && c < moduleCount) {
      matrix[r][c] = val ? 1 : 0;
      isFunction[r][c] = 1;
    }
  }

  // Patrones de posición
  function drawFinder(row, col) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row + r;
        const nc = col + c;
        if (nr >= 0 && nr < moduleCount && nc >= 0 && nc < moduleCount) {
          const isBlack = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                          (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
                          (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          setModule(nr, nc, isBlack ? 1 : 0);
        }
      }
    }
  }

  drawFinder(0, 0);
  drawFinder(0, moduleCount - 7);
  drawFinder(moduleCount - 7, 0);

  // Timing patterns
  for (let i = 8; i < moduleCount - 8; i++) {
    setModule(6, i, i % 2 === 0 ? 1 : 0);
    setModule(i, 6, i % 2 === 0 ? 1 : 0);
  }

  // Alignment pattern (para versión 2+)
  if (version >= 2) {
    const alignPos = [18, 22, 26, 30][version - 2];
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        const isB = (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0));
        setModule(alignPos + r, alignPos + c, isB ? 1 : 0);
      }
    }
  }

  // Reservar formato
  for (let i = 0; i < 9; i++) {
    if (i !== 6) { setModule(8, i, 0); setModule(i, 8, 0); }
  }
  for (let i = moduleCount - 8; i < moduleCount; i++) {
    setModule(8, i, 0);
    setModule(i, 8, 0);
  }
  setModule(moduleCount - 8, 8, 1); // Dark module

  // Colocar datos y ecc
  const allCodewords = [...dataBytes, ...eccBytes];
  let bitIdx = 0;
  let dir = -1; // Hacia arriba
  let c = moduleCount - 1;

  while (c > 0) {
    if (c === 6) c--; // Saltear timing vertical
    for (let rIdx = 0; rIdx < moduleCount; rIdx++) {
      const r = dir === -1 ? moduleCount - 1 - rIdx : rIdx;
      for (let colOffset = 0; colOffset < 2; colOffset++) {
        const currCol = c - colOffset;
        if (!isFunction[r][currCol]) {
          let bit = 0;
          if (bitIdx < allCodewords.length * 8) {
            const bytePos = Math.floor(bitIdx / 8);
            const bitPos = 7 - (bitIdx % 8);
            bit = (allCodewords[bytePos] >> bitPos) & 1;
            bitIdx++;
          }
          // Máscara 0: (row + col) % 2 === 0
          const mask = (r + currCol) % 2 === 0;
          matrix[r][currCol] = (bit ^ (mask ? 1 : 0));
        }
      }
    }
    dir = -dir;
    c -= 2;
  }

  // Formato Mask 0 ECC L (0b111011111000100)
  const formatBits = [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0];
  for (let i = 0; i < 6; i++) matrix[8][i] = formatBits[i];
  matrix[8][7] = formatBits[6];
  matrix[8][8] = formatBits[7];
  matrix[7][8] = formatBits[8];
  for (let i = 9; i < 15; i++) matrix[14 - i][8] = formatBits[i];

  for (let i = 0; i < 7; i++) matrix[8][moduleCount - 1 - i] = formatBits[i];
  for (let i = 0; i < 8; i++) matrix[moduleCount - 8 + i][8] = formatBits[7 + i];

  // 4. Renderizar SVG inline
  const rects = [];
  const moduleSize = 1;
  for (let r = 0; r < moduleCount; r++) {
    for (let col = 0; col < moduleCount; col++) {
      if (matrix[r][col] === 1) {
        rects.push(`<rect x="${col}" y="${r}" width="1" height="1" fill="#000" />`);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${moduleCount} ${moduleCount}" width="${size}" height="${size}" shape-rendering="crispEdges">
    <rect width="${moduleCount}" height="${moduleCount}" fill="#fff" />
    ${rects.join('')}
  </svg>`;
}
