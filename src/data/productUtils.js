export const PRODUCT_DATABASE = {
  'hoja verde': ['espinaca', 'lechuga', 'rucula', 'acelga', 'perejil', 'albahaca', 'ciboulette', 'radicheta'],
  'blando': ['tomate', 'tomate cherry', 'banana', 'durazno', 'frutilla', 'pera', 'morron', 'pepino', 'chaucha', 'berenjena'],
  'duro': [
    'papa', 'cebolla', 'cebolla comun', 'cebolla morada', 'zanahoria', 'zapallito', 'zapallo blanco', 'cabutia', 
    'ajo', 'remolacha', 'hinojo', 'apio', 'brocoli', 'coliflor', 'repollo', 'choclo', 'palta', 'manzana roja', 
    'manzana verde', 'naranja', 'limon', 'pomelo', 'uva', 'arandano', 'boniato'
  ],
  'otros': ['huevos', 'miel', 'miel pura', 'maple']
};

export function getTipoByNombre(nombre) {
  if (!nombre) return 'hoja verde';
  const n = nombre.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (PRODUCT_DATABASE['hoja verde'].some(p => n.includes(p))) return 'hoja verde';
  if (PRODUCT_DATABASE['blando'].some(p => n.includes(p))) return 'blando';
  if (PRODUCT_DATABASE['duro'].some(p => n.includes(p))) return 'duro';
  if (PRODUCT_DATABASE['otros'].some(p => n.includes(p))) return 'otros';
  return 'hoja verde'; // Default
}

export function getUnidadByNombre(nombre) {
  if (!nombre) return 'kg';
  const n = nombre.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  if (n.includes('huevo')) return 'maple x30 uds';
  if (n.includes('palta')) return 'unidad';
  if (n.includes('ajo')) return 'cabeza';
  if (n.includes('choclo')) return 'unidad';
  if (n.includes('lechuga')) return 'unidad';
  if (n.includes('rucula')) return 'atado';
  if (n.includes('remolacha')) return 'unidad';
  if (n.includes('brocoli')) return 'unidad';
  if (n.includes('albahaca')) return 'atado';
  if (n.includes('perejil')) return 'atado';
  
  return 'kg'; // Default
}

/**
 * Pluraliza una palabra o unidad en base a la cantidad.
 * Basado en reglas generales del español y casos específicos del dashboard.
 */
export function pluralizar(cantidad, palabra) {
  if (!palabra || cantidad <= 1) return palabra;
  
  const p = palabra.toLowerCase().trim();
  
  // Casos específicos de unidades
  if (p === 'kg') return 'kilos';
  if (p === 'kilo') return 'kilos';
  if (p === 'unidad') return 'unidades';
  if (p === 'atado') return 'atados';
  if (p === 'maple') return 'maples';
  if (p === 'cabeza') return 'cabezas';
  if (p === 'bandeja') return 'bandejas';
  
  // Reglas para nombres de productos (ej: Limón -> Limones)
  // Quitar acento si termina en 'ón' -> 'ones'
  if (palabra.toLowerCase().endsWith('ón')) {
    return palabra.slice(0, -2) + 'ones';
  }
  
  // Si termina en vocal (a, e, i, o, u o con acento)
  if (/[aeiouáéíóú]$/i.test(palabra)) {
    return palabra + 's';
  }
  
  // Si termina en consonante
  return palabra + 'es';
}
