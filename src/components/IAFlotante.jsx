import { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Leaf } from 'lucide-react';
import { PEDIDOS, HOY } from '../data/mockData';

// Contexto del negocio para la IA mock
function generarContexto() {
  const hoy = PEDIDOS.filter(p => p.fecha === HOY);
  const facturacionHoy = hoy.reduce((s, p) => s + p.total, 0);
  const pendientes = hoy.filter(p => p.estado === 'pendiente').length;
  return { totalPedidos: PEDIDOS.length, pedidosHoy: hoy.length, facturacionHoy, pendientes };
}

// Respuestas mock inteligentes
function obtenerRespuesta(pregunta) {
  const p = pregunta.toLowerCase();
  const ctx = generarContexto();
  const $$ = (n) => `$${Number(n).toLocaleString('es-AR')}`;

  if (p.includes('pedido') && (p.includes('hoy') || p.includes('día'))) {
    return `Hoy hay **${ctx.pedidosHoy} pedidos** registrados. ${ctx.pendientes > 0 ? `⚠️ ${ctx.pendientes} están pendientes de preparación.` : '✅ Todos en proceso o entregados.'} La facturación del día es de **${$$(ctx.facturacionHoy)}**.`;
  }
  if (p.includes('facturación') || p.includes('ventas') || p.includes('plata')) {
    return `La facturación de hoy es **${$$(ctx.facturacionHoy)}**. En total tenés **${ctx.totalPedidos} pedidos** registrados en el sistema. ¿Querés que analice algún período en particular?`;
  }
  if (p.includes('producto') && p.includes('más') || p.includes('popular')) {
    const conteo = {};
    PEDIDOS.forEach(p => { conteo[p.producto] = (conteo[p.producto] || 0) + p.cantidades; });
    const top = Object.entries(conteo).sort((a,b)=>b[1]-a[1])[0];
    return `El producto más vendido es **${top[0]}** con ${top[1]} unidades vendidas. Le siguen los demás combos. ¿Querés ver el detalle en Control de Stock?`;
  }
  if (p.includes('localidad') || p.includes('zona')) {
    const conteo = {};
    PEDIDOS.forEach(p => { conteo[p.localidad] = (conteo[p.localidad] || 0) + 1; });
    const top = Object.entries(conteo).sort((a,b)=>b[1]-a[1])[0];
    return `La zona con más pedidos es **${top[0]}** con ${top[1]} pedidos. Las localidades más activas son Del Viso, Pilar, Manuel Alberti y Presidente Derqui.`;
  }
  if (p.includes('cliente')) {
    const unicos = new Set(PEDIDOS.map(p => p.email)).size;
    return `Tenés **${unicos} clientes únicos** en la base de datos. El ticket promedio es de $${(PEDIDOS.reduce((s,p)=>s+p.total,0)/PEDIDOS.length).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',')}. ¿Querés saber quiénes son los que más compraron?`;
  }
  if (p.includes('stock') || p.includes('reponer')) {
    return `📦 Te recomendaría revisar el **Panel de Stock** para ver qué productos tuvieron alta rotación esta semana. Los combos más vendidos pueden necesitar reposición próximamente.`;
  }
  if (p.includes('ganancia') || p.includes('margen')) {
    const total = PEDIDOS.reduce((s,p)=>s+p.total,0);
    return `Con un margen del 60%, la ganancia estimada sobre $${$$(total)} de facturación total sería de aproximadamente **${$$(Math.round(total*0.6))}**. ¿Querés analizar la rentabilidad por producto específico?`;
  }
  if (p.includes('gracias') || p.includes('ok') || p.includes('perfecto')) {
    return `¡De nada! 😊 Estoy aquí para ayudarte con cualquier análisis de tu negocio. ¿Hay algo más que quieras saber sobre Huerta Urbana?`;
  }
  if (p.includes('hola') || p.includes('buenas') || p.includes('hey')) {
    return `¡Hola! 👋 Soy tu asistente de Huerta Urbana. Puedo ayudarte a analizar pedidos, clientes, ventas, stock, y más. ¿Qué necesitás saber hoy?`;
  }
  // Respuesta genérica
  return `Entendido. Basándome en los datos de Huerta Urbana: tenés **${ctx.totalPedidos} pedidos** registrados, **${ctx.pedidosHoy} hoy**, y la facturación diaria es de **${$$(ctx.facturacionHoy)}**. Si necesitás un análisis más específico, preguntame sobre pedidos, clientes, productos, localidades o márgenes.`;
}

export default function IAFlotante() {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState([
    { rol: 'ia', texto: '¡Hola! 🌱 Soy tu asistente de Huerta Urbana. Tengo acceso a todos los datos del negocio. ¿En qué te ayudo hoy?' }
  ]);
  const [input, setInput] = useState('');
  const [cargando, setCargando] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes]);

  const enviar = () => {
    if (!input.trim() || cargando) return;
    const pregunta = input.trim();
    setInput('');
    setMensajes(prev => [...prev, { rol: 'usuario', texto: pregunta }]);
    setCargando(true);
    setTimeout(() => {
      setMensajes(prev => [...prev, { rol: 'ia', texto: obtenerRespuesta(pregunta) }]);
      setCargando(false);
    }, 700 + Math.random() * 600);
  };

  const handleKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } };

  // Render texto con **bold**
  const renderTexto = (texto) => {
    const partes = texto.split(/\*\*(.*?)\*\*/g);
    return partes.map((parte, i) =>
      i % 2 === 1 ? <strong key={i} className="font-semibold text-white">{parte}</strong> : parte
    );
  };

  return (
    <>
      {/* Chat panel */}
      {abierto && (
        <div className="fixed bottom-20 right-4 w-80 sm:w-96 bg-[#1f2937] border border-gray-700 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden slide-in" style={{ maxHeight: '70vh' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-[#111827]">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-green-500 rounded-lg flex items-center justify-center">
                <Bot size={15} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Asistente IA</p>
                <p className="text-[10px] text-green-400">● En línea · Huerta Urbana</p>
              </div>
            </div>
            <button onClick={() => setAbierto(false)} className="text-gray-500 hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {mensajes.map((m, i) => (
              <div key={i} className={`flex ${m.rol === 'usuario' ? 'justify-end' : 'justify-start'}`}>
                {m.rol === 'ia' && (
                  <div className="w-6 h-6 bg-green-500/20 border border-green-500/30 rounded-lg flex items-center justify-center mr-2 mt-0.5 shrink-0">
                    <Leaf size={11} className="text-green-400" />
                  </div>
                )}
                <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                  m.rol === 'usuario'
                    ? 'bg-green-500 text-white rounded-br-sm'
                    : 'bg-[#111827] text-gray-300 rounded-bl-sm border border-gray-800'
                }`}>
                  {m.rol === 'ia' ? renderTexto(m.texto) : m.texto}
                </div>
              </div>
            ))}
            {cargando && (
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-green-500/20 border border-green-500/30 rounded-lg flex items-center justify-center shrink-0">
                  <Leaf size={11} className="text-green-400" />
                </div>
                <div className="bg-[#111827] border border-gray-800 rounded-xl px-3 py-2 text-sm text-gray-500">
                  <span className="animate-pulse">Analizando datos...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-gray-800 bg-[#111827]">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Preguntame sobre el negocio..."
                className="flex-1 bg-[#1f2937] border border-gray-700 text-white text-sm rounded-xl px-3 py-2 placeholder-gray-600"
              />
              <button
                onClick={enviar}
                disabled={!input.trim() || cargando}
                className="w-9 h-9 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white rounded-xl flex items-center justify-center transition-all shrink-0"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setAbierto(!abierto)}
        className="fixed bottom-4 right-4 w-14 h-14 bg-green-500 hover:bg-green-400 text-white rounded-2xl shadow-lg flex items-center justify-center z-50 transition-all duration-200 pulse-green"
        title="Asistente IA"
      >
        {abierto ? <X size={22} /> : <Bot size={22} />}
      </button>
    </>
  );
}
