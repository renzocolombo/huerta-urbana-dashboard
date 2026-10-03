// URL oficial y activa del Web App de Google Apps Script.
// Si el entorno de Vercel tiene configurada la URL vieja obsoleta (AKfycbw9DcX3...),
// se descarta automáticamente y se usa la URL activa (AKfycbzWSEDW...).
const ACTIVE_URL = 'https://script.google.com/macros/s/AKfycbzWSEDWrGAkLRPj_ugVL6ZIm9qZBxLu93VemH6eSXv0xx6RNSyakn-4q2T7Ik6TpyX7/exec';

const envUrl = import.meta.env.VITE_APPS_SCRIPT_URL;

export const APPS_SCRIPT_URL = (envUrl && !envUrl.includes('AKfycbw9DcX3'))
  ? envUrl
  : ACTIVE_URL;
