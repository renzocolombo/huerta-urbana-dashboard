// ============================================================
// Datos mock para Huerta Urbana Dashboard
// ============================================================

const today = new Date();
const fmt = (d) => d.toISOString().split('T')[0];
const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return fmt(d); };

export const LOCALIDADES = ['Del Viso','Pilar','Manuel Alberti','Presidente Derqui','Villa Rosa','La Lonja','Zelaya','Fátima','Manzanares','Villa Astolfi','Manzone'];
export const PRODUCTOS = ['COMBO FAMILIAR 1kg','COMBO PREMIUM','COMBO BÁSICO','PAPA BLANCA 1kg','CABEZA DE REMOLACHA','COMBO FIT'];
export const PRECIOS = { 'COMBO FAMILIAR 1kg':3500,'COMBO PREMIUM':5200,'COMBO BÁSICO':2800,'PAPA BLANCA 1kg':1200,'CABEZA DE REMOLACHA':900,'COMBO FIT':4100 };

const NOMBRES = ['María González','Carlos Rodríguez','Ana Fernández','Luis Martínez','Sofía López','Diego Pérez','Valentina García','Matías Sánchez','Laura Torres','Facundo Romero','Paula Jiménez','Sebastián Morales','Camila Ruiz','Ezequiel Herrera','Florencia Castro','Nicolás Medina','Romina Aguirre','Javier Suárez'];
const TELEFONOS = ['+54 9 230 412-3456','+54 9 11 2345-6789','+54 9 230 534-7890','+54 9 11 3456-7890','+54 9 230 678-9012','+54 9 11 4567-8901'];
const CALLES = ['Av. Constitución','San Martín','Belgrano','Rivadavia','Lavalle','Mitre','Corrientes','Italia','Sarmiento','Libertad'];
const METODOS = ['mercadopago','efectivo','transferencia'];
const DIAS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const HORARIOS = ['09:00-12:00','12:00-15:00','15:00-18:00','18:00-20:00'];
const ESTADOS = ['pendiente','en_preparacion','listo','entregado'];
const ESTADOS_PAGO = ['pagado','pendiente','sin_pago'];

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

let counter = 1;

function crearPedido(diasOffset = 0, esHoy = false) {
  const nombre = rand(NOMBRES);
  const localidad = rand(LOCALIDADES);
  const producto = rand(PRODUCTOS);
  const cantidades = randInt(1, 4);
  const total = PRECIOS[producto] * cantidades;
  const horasAtras = esHoy ? randInt(0, 5) : null;
  const estadoPedido = esHoy
    ? rand(['pendiente','pendiente','en_preparacion','listo'])
    : rand(ESTADOS);

  return {
    numero_pedido: `HU-${String(counter++).padStart(4,'0')}`,
    fecha: daysAgo(diasOffset),
    nombre,
    telefono: rand(TELEFONOS),
    email: nombre.toLowerCase().replace(/ /g, '.') + '@gmail.com',
    direccion: `${rand(CALLES)} ${randInt(100,2500)}, ${localidad}`,
    localidad,
    dia_entrega: rand(DIAS),
    horario_entrega: rand(HORARIOS),
    metodo_pago: rand(METODOS),
    producto,
    cantidades,
    total,
    estado: estadoPedido,
    observaciones: Math.random() > 0.7 ? rand(['Dejar en puerta','Timbre roto, llamar','Sin PASO']) : '',
    ficha_entrega: Math.random() > 0.5 ? 'Generada' : 'Pendiente',
    link_pago: `https://mpago.la/${Math.random().toString(36).substr(2,8)}`,
    payment_id: `PAY-${randInt(10000,99999)}`,
    estado_pago: rand(ESTADOS_PAGO),
    remito_impreso: Math.random() > 0.5,
    horas_atras: horasAtras,
    acepto_tyc: Math.random() > 0.1 ? 'SI' : 'NO',
    acepto_publicidad: Math.random() > 0.5 ? 'SI' : 'NO',
  };
}

// Generar pedidos: 8 hoy, varios por día de la última semana, y semanas anteriores
export const PEDIDOS = [];
for (let i = 0; i < 8; i++) PEDIDOS.push(crearPedido(0, true));
[5,4,5,6,4,5,4].forEach((cant, dia) => {
  for (let i = 0; i < cant; i++) PEDIDOS.push(crearPedido(dia + 1));
});
for (let d = 8; d <= 35; d++) {
  const cant = randInt(2, 6);
  for (let i = 0; i < cant; i++) PEDIDOS.push(crearPedido(d));
}

// Productos con costos para panel de costos
export const PRODUCTOS_COSTOS = PRODUCTOS.map(nombre => ({
  nombre,
  precio: PRECIOS[nombre],
  costo: Math.round(PRECIOS[nombre] * 0.4),
  precio_jumbo: null,
  activo: true,
}));

export const HOY = fmt(today);
