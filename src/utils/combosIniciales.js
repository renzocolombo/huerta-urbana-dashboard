// ============================================================
// Catálogo inicial de combos predefinidos para Huerta Urbana
// ============================================================

export const COMBOS_INICIALES = [
  { 
    id: 101, 
    nombre: 'COMBO 1 — Básico', 
    precioManual: 39575, 
    descripcion: 'Papa 4kg, Cebolla 3kg, Zanahoria 2kg, Zapallo 2kg, Tomate 2kg, Banana 2kg, Huevos 1 maple, Lechuga 1/2 kilo, Rúcula 1/2 atado, Naranja 1kg', 
    productos: [
      { nombre: 'Papa', cantidad: 4 },
      { nombre: 'Cebolla', cantidad: 3 },
      { nombre: 'Zanahoria', cantidad: 2 },
      { nombre: 'Zapallo blanco', cantidad: 2 },
      { nombre: 'Tomate', cantidad: 2 },
      { nombre: 'Banana', cantidad: 2 },
      { nombre: 'Huevos Nº1', cantidad: 1 },
      { nombre: 'Lechuga', cantidad: 0.5 },
      { nombre: 'Rúcula', cantidad: 0.5 },
      { nombre: 'Naranja', cantidad: 1 }
    ], 
    descuento: 0, 
    activo: true 
  },
  {
    id: 102,
    nombre: 'COMBO 2 — Semanal',
    precioManual: 51525,
    descripcion: 'Papa 4kg, Cebolla 2kg, Zanahoria 2kg, Tomate 2kg, Zapallito 2kg, Banana 2kg, Naranja 2kg, Lechuga 1/2 kilo, Remolacha 2, Huevos 1 maple',
    productos: [
      { nombre: 'Papa', cantidad: 4 },
      { nombre: 'Cebolla', cantidad: 2 },
      { nombre: 'Zanahoria', cantidad: 2 },
      { nombre: 'Tomate', cantidad: 2 },
      { nombre: 'Zapallito', cantidad: 2 },
      { nombre: 'Banana', cantidad: 2 },
      { nombre: 'Naranja', cantidad: 2 },
      { nombre: 'Lechuga', cantidad: 0.5 },
      { nombre: 'Remolacha', cantidad: 2 },
      { nombre: 'Huevos Nº1', cantidad: 1 }
    ],
    descuento: 0,
    activo: true
  },
  {
    id: 103,
    nombre: 'COMBO 3 — Para Dos',
    precioManual: 38625,
    descripcion: 'Papa 2kg, Cebolla 1kg, Zanahoria 1kg, Tomate 1kg, Lechuga 1/2 kilo, Rúcula 1/2 atado, Banana 1kg, Manzana roja 1kg, Limón 1kg, Huevos 1 maple, Remolacha 1, Choclo 4',
    productos: [
      { nombre: 'Papa', cantidad: 2 },
      { nombre: 'Cebolla', cantidad: 1 },
      { nombre: 'Zanahoria', cantidad: 1 },
      { nombre: 'Tomate', cantidad: 1 },
      { nombre: 'Lechuga', cantidad: 0.5 },
      { nombre: 'Rúcula', cantidad: 0.5 },
      { nombre: 'Banana', cantidad: 1 },
      { nombre: 'Manzana roja', cantidad: 1 },
      { nombre: 'Limón', cantidad: 1 },
      { nombre: 'Huevos Nº1', cantidad: 1 },
      { nombre: 'Remolacha', cantidad: 1 },
      { nombre: 'Choclo', cantidad: 4 }
    ],
    descuento: 0,
    activo: true
  },
  {
    id: 104,
    nombre: 'COMBO 4 — Fit',
    precioManual: 54975,
    descripcion: 'Lechuga 1/2 kilo, Rúcula 1/2 atado, Espinaca 1kg, Tomate 2kg, Pepino 1kg, Palta 3, Manzana roja 2kg, Limón 1kg, Banana 2kg, Arándanos 1 bandeja, Remolacha 2',
    productos: [
      { nombre: 'Lechuga', cantidad: 0.5 },
      { nombre: 'Rúcula', cantidad: 0.5 },
      { nombre: 'Espinaca', cantidad: 1 },
      { nombre: 'Tomate', cantidad: 2 },
      { nombre: 'Pepino', cantidad: 1 },
      { nombre: 'Palta', cantidad: 3 },
      { nombre: 'Manzana roja', cantidad: 2 },
      { nombre: 'Limón', cantidad: 1 },
      { nombre: 'Banana', cantidad: 2 },
      { nombre: 'Arándano', cantidad: 1 },
      { nombre: 'Remolacha', cantidad: 2 }
    ],
    descuento: 0,
    activo: true
  },
  {
    id: 105,
    nombre: 'COMBO 5 — Vegetariano',
    precioManual: 66875,
    descripcion: 'Berenjena 2kg, Zapallito 2kg, Tomate 2kg, Zanahoria 2kg, Pepino 1kg, Brócoli 2, Espinaca 1kg, Lechuga 1/2 kilo, Rúcula 1/2 atado, Palta 3, Banana 2kg, Manzana roja 2kg, Limón 1kg, Remolacha 2',
    productos: [
      { nombre: 'Berenjena', cantidad: 2 },
      { nombre: 'Zapallito', cantidad: 2 },
      { nombre: 'Tomate', cantidad: 2 },
      { nombre: 'Zanahoria', cantidad: 2 },
      { nombre: 'Pepino', cantidad: 1 },
      { nombre: 'Brócoli', cantidad: 2 },
      { nombre: 'Espinaca', cantidad: 1 },
      { nombre: 'Lechuga', cantidad: 0.5 },
      { nombre: 'Rúcula', cantidad: 0.5 },
      { nombre: 'Palta', cantidad: 3 },
      { nombre: 'Banana', cantidad: 2 },
      { nombre: 'Manzana roja', cantidad: 2 },
      { nombre: 'Limón', cantidad: 1 },
      { nombre: 'Remolacha', cantidad: 2 }
    ],
    descuento: 0,
    activo: true
  },
  {
    id: 106,
    nombre: 'COMBO 6 — Familiar',
    precioManual: 75725,
    descripcion: 'Papa 5kg, Cebolla 3kg, Zanahoria 2kg, Tomate 2kg, Zapallito 2kg, Banana 3kg, Naranja 2kg, Manzana roja 2kg, Lechuga 1/2 kilo, Remolacha 2, Choclo 6, Huevos 1 maple',
    productos: [
      { nombre: 'Papa', cantidad: 5 },
      { nombre: 'Cebolla', cantidad: 3 },
      { nombre: 'Zanahoria', cantidad: 2 },
      { nombre: 'Tomate', cantidad: 2 },
      { nombre: 'Zapallito', cantidad: 2 },
      { nombre: 'Banana', cantidad: 3 },
      { nombre: 'Naranja', cantidad: 2 },
      { nombre: 'Manzana roja', cantidad: 2 },
      { nombre: 'Lechuga', cantidad: 0.5 },
      { nombre: 'Remolacha', cantidad: 2 },
      { nombre: 'Choclo', cantidad: 6 },
      { nombre: 'Huevos Nº1', cantidad: 1 }
    ],
    descuento: 0,
    activo: true
  },
  {
    id: 107,
    nombre: 'COMBO 7 — Premium',
    precioManual: 78750,
    descripcion: 'Papa 3kg, Tomate 2kg, Morrón rojo 1kg, Banana 2kg, Manzana roja 2kg, Uva 1kg, Palta 3, Arándanos 1 bandeja, Huevos 2 maples, Miel 1kg, Espinaca 1kg',
    productos: [
      { nombre: 'Papa', cantidad: 3 },
      { nombre: 'Tomate', cantidad: 2 },
      { nombre: 'Morrón rojo', cantidad: 1 },
      { nombre: 'Banana', cantidad: 2 },
      { nombre: 'Manzana roja', cantidad: 2 },
      { nombre: 'Uva', cantidad: 1 },
      { nombre: 'Palta', cantidad: 3 },
      { nombre: 'Arándano', cantidad: 1 },
      { nombre: 'Huevos Nº1', cantidad: 2 },
      { nombre: 'Miel pura', cantidad: 1 },
      { nombre: 'Espinaca', cantidad: 1 }
    ],
    descuento: 0,
    activo: true
  }
];
