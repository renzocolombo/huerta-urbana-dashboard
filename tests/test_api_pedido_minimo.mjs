// Prueba contra la API real (Apps Script v12). No imprime la URL ni claves.
// Verifica que guardar el mismo monto y mensaje conserva productos, combos y mínimo idénticos.
import { apiGetPreciosWeb, apiPublicarPrecios } from "../src/utils/mercaderiaApi.js";

let ok = 0, fail = 0;
function t(n, cond, extra) {
  if (cond) {
    ok++;
    console.log("OK   ", n);
  } else {
    fail++;
    console.log("FALLA", n, extra ?? "");
  }
}

console.log("==================================================================");
console.log("PRUEBA REAL PRECIOSWEB: CONSERVACIÓN DE CATÁLOGO Y PEDIDO MÍNIMO");
console.log("==================================================================");

try {
  // 1. Leer PreciosWeb antes
  const antes = await apiGetPreciosWeb();
  t("getPreciosWeb responde con éxito", antes && antes.ok === true, antes?.error);
  t("getPreciosWeb contiene monto_minimo numérico", typeof antes.monto_minimo === "number");
  t("getPreciosWeb contiene mensaje_minimo string", typeof antes.mensaje_minimo === "string");
  t("getPreciosWeb contiene array de productos", Array.isArray(antes.productos) && antes.productos.length > 0);
  t("getPreciosWeb contiene array de combos", Array.isArray(antes.combos) && antes.combos.length > 0);

  const montoActual = antes.monto_minimo;
  const mensajeActual = antes.mensaje_minimo;

  // 2. Guardar el MISMO monto y mensaje actuales (idempotente)
  const resGuardar = await apiPublicarPrecios({
    origen: "mercaderia",
    productos: [],
    monto_minimo: montoActual,
    mensaje_minimo: mensajeActual,
  });
  t("apiPublicarPrecios responde con éxito en modo parcial", resGuardar && resGuardar.ok === true, resGuardar?.error);

  // 3. Leer PreciosWeb después
  const despues = await apiGetPreciosWeb();
  t("getPreciosWeb responde tras guardar", despues && despues.ok === true, despues?.error);

  // Comparar JSON completo de productos, combos y mínimo
  const pAntes = JSON.stringify(antes.productos);
  const pDespues = JSON.stringify(despues.productos);
  const cAntes = JSON.stringify(antes.combos);
  const cDespues = JSON.stringify(despues.combos);

  t("productos en PreciosWeb son 100% IDÉNTICOS", pAntes === pDespues);
  t("combos en PreciosWeb son 100% IDÉNTICOS", cAntes === cDespues);
  t("monto_minimo es 100% IDÉNTICO", antes.monto_minimo === despues.monto_minimo);
  t("mensaje_minimo es 100% IDÉNTICO", antes.mensaje_minimo === despues.mensaje_minimo);
} catch (err) {
  fail++;
  console.log("ERROR", String(err.message || err).replace(/https?:\S+/g, "<url>"));
}

console.log("\nResultado:", ok + " ok, " + fail + " fallas");
process.exit(fail ? 1 : 0);
