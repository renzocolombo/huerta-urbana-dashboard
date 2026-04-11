import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { X, Send, Leaf } from 'lucide-react';
import { HOY } from '../data/mockData';
import { KEYS } from '../config/keys';

// Contexto optimizado para la IA
function generarContexto(pedidos) {
  const hoy = pedidos.filter(p => p.fecha === HOY);
  const facturacionHoy = hoy.reduce((s, p) => s + p.total, 0);
  
  const ventas = {};
  hoy.forEach(p => {
    ventas[p.producto] = (ventas[p.producto] || 0) + p.cantidades;
  });
  const topProduct = Object.entries(ventas).sort((a, b) => b[1] - a[1])[0];
  
  return { 
    totalPedidos: hoy.length, 
    facturacionHoy, 
    productoEstrella: topProduct ? `${topProduct[0]} (${topProduct[1]} unidades)` : 'N/A' 
  };
}

export default function IAFlotante() {
  const { pedidos: PEDIDOS, stockData } = useGoogleSheets();

  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState([
    { rol: 'ia', texto: '¡Hola! Soy Luma 🌿, la asistente de Huerta Urbana. ¿En qué te puedo ayudar hoy?' }
  ]);
  const [input, setInput] = useState('');
  const [cargando, setCargando] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes]);

  // Escuchar evento desde el Header (mobile)
  useEffect(() => {
    const handleOpen = () => setAbierto(true);
    window.addEventListener('abrir-luma', handleOpen);
    return () => window.removeEventListener('abrir-luma', handleOpen);
  }, []);

  const enviar = async () => {
    if (!input.trim() || cargando) return;
    const pregunta = input.trim();
    setInput('');
    
    const nuevosMensajes = [...mensajes, { rol: 'usuario', texto: pregunta }];
    setMensajes(nuevosMensajes);
    setCargando(true);
    
    const apiKey = KEYS.GROQ;

    if (!apiKey) {
      setMensajes(prev => [...prev, { rol: 'ia', texto: '⚠️ Configurá la variable VITE_GROQ_API_KEY para usar la IA.' }]);
      setCargando(false);
      return;
    }

    try {
      // --- CÁLCULO DE CONTEXTO REAL ---
      const pedidosHoyMap = PEDIDOS.filter(p => p.fecha === HOY);
      const facturacionHoy = pedidosHoyMap.reduce((s, p) => s + p.total, 0);
      const pedidosPendientes = pedidosHoyMap.filter(p => p.estado === 'pendiente');
      
      const stockArray = Array.isArray(stockData) ? stockData : [];
      const stockTexto = stockArray.length > 0 
        ? stockArray.map(p => `${p.producto}: ${p.stock_500g || 0} bandejas 500g y ${p.stock_1kg || 0} bandejas 1kg`).join(', ')
        : "No hay stock cargado aun";

      const contextoBase = `
Sos Luma, la asistente de Huerta Urbana.

DATOS ACTUALES DEL NEGOCIO:
- Pedidos de hoy: ${pedidosHoyMap.length}
- Facturación de hoy: $${facturacionHoy.toLocaleString('es-AR')}

STOCK ACTUAL:
${stockTexto}

PEDIDOS PENDIENTES HOY:
${pedidosPendientes.length > 0 
  ? pedidosPendientes.map(p => `- ${p.nombre} — ${p.producto} — ${p.localidad}`).join('\n')
  : "No hay pedidos pendientes hoy."}

Respondé preguntas sobre el stock, pedidos y negocio usando estos datos reales.
`;

      console.log('[LUMA] Contexto enviado:', contextoBase);

      const historialCorte = nuevosMensajes.slice(-10).map(m => ({
        role: m.rol === 'ia' ? 'assistant' : 'user',
        content: m.texto
      }));

      const response = await fetch(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
              {
                role: 'system',
                content: contextoBase
              },
              ...historialCorte
            ],
            max_tokens: 800,
            temperature: 0.7
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Error API: ${response.status}`);
      }

      const data = await response.json();
      const respuestaTexto = data.choices[0].message.content;
      setMensajes(prev => [...prev, { rol: 'ia', texto: respuestaTexto }]);
    } catch (error) {
      console.error('Error IA:', error);
      setMensajes(prev => [...prev, { rol: 'ia', texto: '⚠️ Error conectando con la IA.' }]);
    } finally {
      setCargando(false);
    }
  };

  const handleKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } };

  const renderTexto = (texto) => {
    const partes = texto.split(/\*\*(.*?)\*\*/g);
    return partes.map((parte, i) =>
      i % 2 === 1 ? <strong key={i} className="font-semibold text-white">{parte}</strong> : parte
    );
  };

  return (
    <>
      {/* Chat panel — visible solo cuando abierto */}
      {abierto && (
        <div
          className="fixed z-[9999] flex flex-col overflow-hidden rounded-2xl border border-gray-700 bg-[#1f2937] shadow-2xl slide-in"
          style={{
            bottom: '20px',
            right: '20px',
            width: 'min(calc(100vw - 40px), 384px)',
            maxHeight: '70vh',
          }}
        >
          {/* Header con único botón X */}
          <div className="flex items-center justify-between border-b border-gray-800 bg-[#111827] px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full overflow-hidden border border-green-500/30">
                <img src="/luma-avatar.png" alt="Luma" className="w-full h-full object-cover" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Luma</p>
                <p className="text-[10px] text-green-400">● En línea · Asistente IA</p>
              </div>
            </div>
            <button
              onClick={() => setAbierto(false)}
              className="text-gray-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-gray-800"
              aria-label="Cerrar chat"
            >
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
          <div className="border-t border-gray-800 bg-[#111827] p-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Preguntame sobre el negocio..."
                className="flex-1 bg-[#1f2937] border border-gray-700 text-white text-sm rounded-xl px-3 py-2 placeholder-gray-600 outline-none focus:border-green-500/50"
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

      {/* Botón flotante Luma — Solo visible en Desktop y cuando el chat está cerrado */}
      {!abierto && (
        <button
          onClick={() => setAbierto(true)}
          aria-label="Abrir asistente Luma"
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '-8px',
            width: '120px',
            height: '120px',
            background: 'transparent',
            border: 'none',
            boxShadow: 'none',
            outline: 'none',
            padding: 0,
            cursor: 'pointer',
            zIndex: 9999,
          }}
          className="hidden md:block transition-transform duration-200 hover:scale-110 active:scale-95"
        >
          <img
            src="/luma-avatar.png"
            alt="Luma"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </button>
      )}
    </>
  );
}
