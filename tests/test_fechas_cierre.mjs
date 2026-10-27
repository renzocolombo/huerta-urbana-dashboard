import { 
  obtenerFechaCierreEfectiva, 
  extraerFechaYMD, 
  getHoyYMD, 
  parsearFecha, 
  esFechaInterpretable 
} from '../src/utils/fechasEntrega.js';

let ok = 0, fail = 0;
function t(n, real, esp) {
  const a = JSON.stringify(real), b = JSON.stringify(esp);
  if (a === b) {
    ok++;
  } else {
    fail++;
    console.error(`FALLA ${n}:`, real, "esperado:", esp);
  }
}

console.log("==================================================================");
console.log("PRUEBAS UNITARIAS: MANEJO DE fecha_entrega, CIERRE Y ENTREGADOS HOY");
console.log("==================================================================");

// 1. Cancelado con texto en fecha_entrega y fecha de cierre válida (debe usar la de cierre)
const pCanceladoConTexto = {
  numero_pedido: "HU-001",
  estado: "cancelado",
  fecha_entrega: "Viernes 06/11/2026 Tarde (14 a 17 hs)",
  fecha_cierre: "2026-10-27 12:00",
  fecha_cobro: ""
};
t("1. Cancelado: ignora texto de fecha_entrega y usa fecha_cierre válida",
  obtenerFechaCierreEfectiva(pCanceladoConTexto, "cancelado"),
  "2026-10-27 12:00"
);

// 2. Entregado con timestamp real
const pEntregadoTimestampReal = {
  numero_pedido: "HU-002",
  estado: "entregado",
  fecha_entrega: "2026-10-27 15:30",
  fecha_cierre: "",
  fecha_cobro: ""
};
t("2. Entregado con timestamp real: devuelve fecha_entrega válida",
  obtenerFechaCierreEfectiva(pEntregadoTimestampReal, "entregado"),
  "2026-10-27 15:30"
);

// 3. Entregado con texto (debe aparecer en "Entregados hoy")
// Simulamos la lógica de GoogleSheetsContext al marcar como 'entregado':
// Si fecha_entrega no es una fecha interpretable, se le asigna la hora real de entrega (ahoraStr).
const hoy = new Date();
const y = hoy.getFullYear();
const m = String(hoy.getMonth() + 1).padStart(2, '0');
const d = String(hoy.getDate()).padStart(2, '0');
const hh = String(hoy.getHours()).padStart(2, '0');
const mm = String(hoy.getMinutes()).padStart(2, '0');
const ahoraStr = `${y}-${m}-${d} ${hh}:${mm}`;
const hoyYMD = `${y}-${m}-${d}`;

const pOriginalConTexto = {
  numero_pedido: "HU-003",
  estado: "pendiente",
  fecha_entrega: "Viernes 06/11/2026 Tarde (14 a 17 hs)"
};

// Verificamos que el texto de la web NO es interpretable como fecha
t("3a. Texto de la web no es interpretable como fecha",
  esFechaInterpretable(pOriginalConTexto.fecha_entrega),
  false
);

// Lógica de GoogleSheetsContext:
function simularActualizarEstado(p, nuevoEstado) {
  const norm = (nuevoEstado || '').toLowerCase().trim();
  const updates = { estado: nuevoEstado };
  const tieneFechaEntregaValida = Boolean(p.fecha_entrega && parsearFecha(p.fecha_entrega));
  const tieneFechaCierreValida = Boolean(p.fecha_cierre && parsearFecha(p.fecha_cierre));
  if (norm === 'entregado' && !tieneFechaEntregaValida) {
    updates.fecha_entrega = ahoraStr;
  } else if (norm === 'cancelado' && !tieneFechaCierreValida) {
    updates.fecha_cierre = ahoraStr;
  }
  return { ...p, ...updates };
}

const pEntregadoActualizado = simularActualizarEstado(pOriginalConTexto, "entregado");
t("3b. GoogleSheetsContext asigna ahoraStr al entregar pedido con texto",
  pEntregadoActualizado.fecha_entrega,
  ahoraStr
);

// Filtro de "Entregados hoy" (según AgendaEntregas.jsx):
const fechaCierreEfectiva = obtenerFechaCierreEfectiva(pEntregadoActualizado, "entregado");
const fechaCierreYMD = extraerFechaYMD(fechaCierreEfectiva);
const apareceEnEntregadosHoy = (pEntregadoActualizado.estado === "entregado") && (fechaCierreYMD === hoyYMD);
t("3c. Pedido entregado aparece en Entregados hoy",
  apareceEnEntregadosHoy,
  true
);

// Caso alternativo: entregado con texto en fecha_entrega pero fecha_cierre de hoy
const pEntregadoConCierreHoy = {
  numero_pedido: "HU-003-BIS",
  estado: "entregado",
  fecha_entrega: "Viernes 06/11/2026 Tarde (14 a 17 hs)",
  fecha_cierre: ahoraStr
};
t("3d. Entregado con texto en fecha_entrega y fecha_cierre usa fecha_cierre",
  obtenerFechaCierreEfectiva(pEntregadoConCierreHoy, "entregado"),
  ahoraStr
);
t("3e. Entregado con fecha_cierre de hoy aparece en Entregados hoy",
  extraerFechaYMD(obtenerFechaCierreEfectiva(pEntregadoConCierreHoy, "entregado")) === hoyYMD,
  true
);

// 4. Pedido viejo "Martes (8 a 12 hs)"
const pViejo = {
  numero_pedido: "HU-004",
  estado: "entregado",
  fecha_entrega: "Martes (8 a 12 hs)",
  fecha: "2026-10-20"
};
t("4a. 'Martes (8 a 12 hs)' no es interpretable como fecha",
  esFechaInterpretable(pViejo.fecha_entrega),
  false
);
t("4b. obtenerFechaCierreEfectiva ignora 'Martes (8 a 12 hs)' y retorna vacío",
  obtenerFechaCierreEfectiva(pViejo, "entregado"),
  ""
);

const pViejoActualizado = simularActualizarEstado(pViejo, "entregado");
t("4c. GoogleSheetsContext trata 'Martes (8 a 12 hs)' como vacío y asigna ahoraStr",
  pViejoActualizado.fecha_entrega,
  ahoraStr
);

// 5. Caso de preservación: Si ya tiene timestamp real, NO se sobreescribe
const pConTimestampPrevio = {
  numero_pedido: "HU-005",
  estado: "pendiente",
  fecha_entrega: "2026-10-25 10:00"
};
const pConTimestampActualizado = simularActualizarEstado(pConTimestampPrevio, "entregado");
t("5. Timestamp real previo se preserva y no se sobreescribe",
  pConTimestampActualizado.fecha_entrega,
  "2026-10-25 10:00"
);

console.log(`\nResultado: ${ok} ok, ${fail} fallas`);
process.exit(fail ? 1 : 0);
