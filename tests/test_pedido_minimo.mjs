import { 
  validarPedidoMinimo, 
  generarMensajeMinimo, 
  formatearFechaActualizacion,
  MONTO_MINIMO_MAXIMO,
  UMBRAL_DOBLE_CONFIRMACION 
} from "../src/utils/pedidoMinimo.js";

let ok = 0, fail = 0;
function t(n, real, esp) {
  const a = JSON.stringify(real), b = JSON.stringify(esp);
  if (a === b) {
    ok++;
    console.log("OK   ", n);
  } else {
    fail++;
    console.log("FALLA", n, a, "esperado", b);
  }
}

console.log("==================================================================");
console.log("PRUEBAS UNITARIAS: VALIDACIÓN DE PEDIDO MÍNIMO");
console.log("==================================================================");

// 1. Negativo
t("negativo simple (-1)", validarPedidoMinimo(-1).valido, false);
t("negativo grande (-50000)", validarPedidoMinimo(-50000).valido, false);
t("negativo como string ('-100')", validarPedidoMinimo("-100").valido, false);

// 2. Vacío
t("vacío cadena vacía", validarPedidoMinimo("").valido, false);
t("vacío espacios", validarPedidoMinimo("   ").valido, false);
t("vacío null", validarPedidoMinimo(null).valido, false);
t("vacío undefined", validarPedidoMinimo(undefined).valido, false);

// 3. Texto / No numérico
t("texto alfabético ('abc')", validarPedidoMinimo("abc").valido, false);
t("texto con moneda ('$35000')", validarPedidoMinimo("$35000").valido, false);
t("texto alfanumérico ('35000x')", validarPedidoMinimo("35000x").valido, false);
t("texto no numérico ('NaN')", validarPedidoMinimo("NaN").valido, false);

// 4. Mayor al máximo
t("mayor al máximo exacto + 1", validarPedidoMinimo(MONTO_MINIMO_MAXIMO + 1).valido, false);
t("mayor al máximo valor alto", validarPedidoMinimo(2500000).valido, false);
t("máximo exacto permitido (1.000.000)", validarPedidoMinimo(MONTO_MINIMO_MAXIMO).valido, true);

// 5. No enteros / Decimales
t("decimal simple (10.5)", validarPedidoMinimo(10.5).valido, false);
t("decimal string ('35000.50')", validarPedidoMinimo("35000.50").valido, false);

// 6. Menor a 10.000 pide doble confirmación
const res0 = validarPedidoMinimo(0);
t("cero es válido", res0.valido, true);
t("cero pide doble confirmación", res0.pideDobleConfirmacion, true);

const res100 = validarPedidoMinimo(100);
t("100 es válido", res100.valido, true);
t("100 pide doble confirmación (valor de prueba típico)", res100.pideDobleConfirmacion, true);

const res9999 = validarPedidoMinimo(9999);
t("9999 es válido", res9999.valido, true);
t("9999 pide doble confirmación", res9999.pideDobleConfirmacion, true);

// 7. Mayor o igual a 10.000 NO pide doble confirmación
const res10k = validarPedidoMinimo(10000);
t("10.000 es válido", res10k.valido, true);
t("10.000 NO pide doble confirmación", res10k.pideDobleConfirmacion, false);

const res35k = validarPedidoMinimo(35000);
t("35.000 es válido", res35k.valido, true);
t("35.000 NO pide doble confirmación", res35k.pideDobleConfirmacion, false);

const res1M = validarPedidoMinimo(1000000);
t("1.000.000 es válido", res1M.valido, true);
t("1.000.000 NO pide doble confirmación", res1M.pideDobleConfirmacion, false);

// 8. Mensaje autogenerado
console.log("\n==================================================================");
console.log("PRUEBAS UNITARIAS: MENSAJE AUTOGENERADO");
console.log("==================================================================");
t("mensaje autogenerado 35000", generarMensajeMinimo(35000), "El pedido mínimo es de $35.000");
t("mensaje autogenerado 10000", generarMensajeMinimo(10000), "El pedido mínimo es de $10.000");
t("mensaje autogenerado 100", generarMensajeMinimo(100), "El pedido mínimo es de $100");
t("mensaje autogenerado 0", generarMensajeMinimo(0), "El pedido mínimo es de $0");
t("mensaje autogenerado string '50000'", generarMensajeMinimo("50000"), "El pedido mínimo es de $50.000");

// 9. Simulación de edición manual vs autogenerada
console.log("\n==================================================================");
console.log("PRUEBAS UNITARIAS: FLUJO DE EDICIÓN MANUAL VS AUTOMÁTICA");
console.log("==================================================================");
let mensajeActual = generarMensajeMinimo(35000);
let editadoManualmente = false;

// Usuario cambia monto sin tocar mensaje a mano -> se regenera solo
let nuevoMonto = 40000;
if (!editadoManualmente) {
  mensajeActual = generarMensajeMinimo(nuevoMonto);
}
t("cambio de monto sin edición manual actualiza mensaje", mensajeActual, "El pedido mínimo es de $40.000");

// Usuario edita el mensaje a mano
mensajeActual = "Compra mínima especial de $40.000 para envíos sin cargo";
editadoManualmente = true;

// Usuario vuelve a cambiar el monto -> el mensaje editado NO se sobreescribe
nuevoMonto = 45000;
if (!editadoManualmente) {
  mensajeActual = generarMensajeMinimo(nuevoMonto);
}
t("cambio de monto tras edición manual NO sobreescribe mensaje", mensajeActual, "Compra mínima especial de $40.000 para envíos sin cargo");

// 10. Formato de fecha
console.log("\n==================================================================");
console.log("PRUEBAS UNITARIAS: FORMATEO DE FECHA");
console.log("==================================================================");
t("fecha nula o vacía", formatearFechaActualizacion(null), "—");
const fStr = formatearFechaActualizacion("2026-10-21T03:00:00.000Z");
t("fecha ISO válida devuelve string formateado con hs", fStr.includes("hs") && fStr.length > 5, true);

console.log("\nResultado:", ok + " ok, " + fail + " fallas");
process.exit(fail ? 1 : 0);
