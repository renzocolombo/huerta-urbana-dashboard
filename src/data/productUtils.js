export const CATEGORIAS_PRINCIPALES = ['Verduras', 'Frutas', 'Almacén', 'Extras', 'Carnes'];

export const SUBCATEGORIAS_ALMACEN = ['Bebidas', 'Almacén seco', 'Limpieza', 'Lácteos', 'Golosinas'];

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

export function getCategoriaPrincipal(nombre) {
  if (!nombre) return 'Verduras';
  const n = nombre.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Carnes
  const carnes = ['carne', 'pollo', 'cerdo', 'vaca', 'picada', 'bife', 'asado', 'pechuga', 'muslo', 'milanesa', 'chorizo', 'morcilla', 'costilla'];
  if (carnes.some(c => n.includes(c))) return 'Carnes';

  // Extras
  const extras = ['huevo', 'miel', 'maple', 'panal'];
  if (extras.some(e => n.includes(e))) return 'Extras';

  // Frutas
  const frutas = [
    'banana', 'manzana', 'naranja', 'limon', 'pomelo', 'mandarina', 'uva', 
    'arandano', 'durazno', 'frutilla', 'pera', 'palta', 'melon', 'sandia', 'kiwi', 'ciruela'
  ];
  if (frutas.some(f => n.includes(f))) return 'Frutas';

  // Almacén
  const almacen = [
    'fideo', 'arroz', 'aceite', 'leche', 'queso', 'yogur', 'galletita', 'coca', 'agua', 
    'detergente', 'jabon', 'lavandina', 'alfajor', 'chocolate', 'snack', 'yerba', 'azucar', 
    'sal', 'atun', 'harina', 'pure', 'conserva', 'mayonesa', 'mermelada', 'te ', 'cafe'
  ];
  if (almacen.some(a => n.includes(a))) return 'Almacén';

  // Por defecto es Verduras
  return 'Verduras';
}

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
  if (n.includes('ajo')) return 'unidad';
  if (n.includes('choclo')) return 'unidad';
  if (n.includes('lechuga')) return 'unidad';
  if (n.includes('rucula')) return 'atado';
  if (n.includes('remolacha')) return 'unidad';
  if (n.includes('brocoli')) return 'unidad';
  if (n.includes('albahaca')) return 'atado';
  if (n.includes('perejil')) return 'atado';
  
  // Productos de almacén comunes por unidad
  const cat = getCategoriaPrincipal(nombre);
  if (cat === 'Almacén' && !n.includes('kg') && !n.includes('kilo')) return 'unidad';

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

// ── Manejo de códigos EAN de fábrica y persistencia ────────────────────────
export const EAN_MAP_KEY = 'huerta_ean_mapping_v1';

export function getEanMapping() {
  try {
    const raw = localStorage.getItem(EAN_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error('Error reading EAN mapping:', e);
    return {};
  }
}

export function saveEanMapping(map) {
  try {
    localStorage.setItem(EAN_MAP_KEY, JSON.stringify(map));
  } catch (e) {
    console.error('Error saving EAN mapping:', e);
  }
}

export function asociarEanAProducto(ean, itemData) {
  const map = getEanMapping();
  const cleanEan = String(ean).trim().toUpperCase();
  map[cleanEan] = {
    ean: cleanEan,
    productoId: itemData.productoId || null,
    nombre: itemData.nombre,
    subcategoria: itemData.subcategoria || 'Almacén seco',
    unidad: itemData.unidad || 'unidad',
    actualizadoEl: new Date().toISOString()
  };
  saveEanMapping(map);
  return map[cleanEan];
}

export function esCodigoEan(raw) {
  if (!raw) return false;
  const clean = String(raw).replace(/[\r\n\x00-\x1F]/g, '').trim().replace(/^\][a-zA-Z0-9]{2,3}/, '').replace(/^\*+|\*+$/g, '').trim();
  if (/^\d{8,14}$/.test(clean)) {
    // Si empieza con 20 o 02 y tiene 12-13 dígitos, es balanza con PLU
    if (/^(20|02)\d{10,11}$/.test(clean)) return false;
    return true;
  }
  return false;
}

export function getSubcategoriaAlmacen(nombre) {
  if (!nombre) return 'Almacén seco';
  const n = nombre.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  const bebidas = ['coca', 'agua', 'jugo', 'cerveza', 'vino', 'soda', 'sprite', 'fanta', 'pepsi', 'gaseosa', 'aquarius', 'levite', 'manaos'];
  if (bebidas.some(b => n.includes(b))) return 'Bebidas';

  const lacteos = ['leche', 'queso', 'yogur', 'manteca', 'crema', 'dulce de leche'];
  if (lacteos.some(l => n.includes(l))) return 'Lácteos';

  const limpieza = ['detergente', 'jabon', 'lavandina', 'desodorante', 'limpiador', 'papel higienico', 'rollo', 'suavizante', 'cif'];
  if (limpieza.some(l => n.includes(l))) return 'Limpieza';

  const golosinas = ['alfajor', 'chocolate', 'caramelo', 'chupetin', 'galletita', 'snack', 'turron', 'chicle', 'doritos', 'lays', 'oreo'];
  if (golosinas.some(g => n.includes(g))) return 'Golosinas';

  return 'Almacén seco';
}

