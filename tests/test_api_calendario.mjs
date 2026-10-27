// Prueba contra la API real (Apps Script v12). No imprime la URL. Deja la hoja como estaba.
import { APPS_SCRIPT_URL } from "../src/utils/appsScriptUrl.js";

const FECHA = "2027-03-10"; // fecha lejana de prueba
let ok = 0, fail = 0;
function t(n, cond, extra) { if (cond) { ok++; console.log("OK   ", n); } else { fail++; console.log("FALLA", n, extra ?? ""); } }

async function llamar(accion, params = {}) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ accion, action: accion, ...params }),
  });
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { return { ok: false, error: "respuesta no JSON (" + txt.slice(0, 60).replace(/https?:\S+/g, "<url>") + ")" }; }
}

const marca = (cal) => (cal.dias || []).find((d) => d.fecha === FECHA) || null;

try {
  const f0 = await llamar("getFeriados");
  t("getFeriados devuelve array", Array.isArray(f0.feriados), f0.error);
  t("getFeriados trae 'ahora'", typeof f0.ahora === "string", JSON.stringify(Object.keys(f0)));
  const c0 = await llamar("getCalendario");
  t("getCalendario devuelve array", Array.isArray(c0.dias), c0.error);
  const previo = marca(c0);
  t("fecha de prueba sin marca previa", previo === null, JSON.stringify(previo));
  if (previo !== null || !Array.isArray(f0.feriados)) throw new Error("estado inicial inesperado; no se modifica nada");

  const s1 = await llamar("setDiaCalendario", { fecha: FECHA, estado: "cerrado", motivo: "prueba-automatica" });
  t("setDiaCalendario cerrado ok", s1.ok !== false, s1.error);
  const f1 = await llamar("getFeriados");
  t("getFeriados incluye la fecha cerrada", (f1.feriados || []).includes(FECHA));
  const c1 = await llamar("getCalendario");
  const m1 = marca(c1);
  t("getCalendario la marca como cerrado/manual", m1 && m1.estado === "cerrado" && m1.origen === "manual", JSON.stringify(m1));

  const s2 = await llamar("setDiaCalendario", { fecha: FECHA, estado: "abierto", motivo: "prueba-automatica" });
  t("setDiaCalendario abierto ok", s2.ok !== false, s2.error);
  const f2 = await llamar("getFeriados");
  t("abierto: getFeriados NO la incluye", !(f2.feriados || []).includes(FECHA));
  const m2 = marca(await llamar("getCalendario"));
  t("abierto: getCalendario la marca abierto", m2 && m2.estado === "abierto", JSON.stringify(m2));
} catch (e) {
  fail++;
  console.log("ERROR", String(e.message || e).replace(/https?:\S+/g, "<url>"));
} finally {
  // Limpieza: dejar la hoja como estaba
  const s3 = await llamar("setDiaCalendario", { fecha: FECHA, estado: "normal" });
  t("setDiaCalendario normal ok", s3.ok !== false, s3.error);
  const f3 = await llamar("getFeriados");
  t("normal: getFeriados ya no la incluye", Array.isArray(f3.feriados) && !f3.feriados.includes(FECHA));
  const c3 = await llamar("getCalendario");
  t("normal: sin marca en getCalendario (hoja como estaba)", Array.isArray(c3.dias) && marca(c3) === null);
}
console.log(ok + " ok, " + fail + " fallas");
process.exit(fail ? 1 : 0);
