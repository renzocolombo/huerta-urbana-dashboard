import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MessageCircle, ShoppingBag, DollarSign, Calendar, ShoppingCart, AlertTriangle, Check, X, Printer } from 'lucide-react';
import { db } from '../config/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { imprimirRemitoIndividual, estaPedidoArmado } from '../utils/remitoPrinter';
import { estadoEntregaPedido, estadoPagoPedido, esVentaCerrada } from '../utils/estadosPedido';
import { esFormaPagoContraEntrega } from '../utils/agendaCalendario';
import {
  obtenerCodigoPropioCliente,
  validarEnvioCodigoReferido,
  prepararPayloadReferido,
  MENSAJE_SIN_CODIGO
} from '../utils/referidosClientes';

const $$ = (n) => {
  const num = Number(n);
  return isNaN(num) ? '$0' : `$${num.toLocaleString('es-AR')}`;
};

export default function Clientes() {
  const { pedidos: PEDIDOS, clientesSheet = [], actualizarDatosCliente } = useGoogleSheets();

  const [cuponActivo, setCuponActivo] = useState(true);

  // Clientes reales: pedidos con pago aprobado online o pedidos contra entrega / link
  const clientes = useMemo(() => {
    if (!PEDIDOS || !Array.isArray(PEDIDOS)) return [];
    const mapa = {};
    PEDIDOS.forEach(p => {
      const formaPago = (p.forma_pago || '').toLowerCase().trim();
      const metodoPago = (p.metodo_pago || p.metodo_pago_elegido || '').toLowerCase().trim();
      const esContraEntrega = formaPago === 'entrega' || esFormaPagoContraEntrega(formaPago, metodoPago);
      const estadoPago = (p.estado_pago || '').toLowerCase().trim();
      const esAprobado = estadoPago === 'approved' || estadoPago === 'pagado';

      // Pertenece a la base de clientes si compró online aprobado O si encargó contra entrega / link
      if (!esAprobado && !esContraEntrega) return;

      const cKey = String(p.email || p.telefono || p.nombre || '').trim();
      if (!cKey) return;

      if (!mapa[cKey]) {
        mapa[cKey] = {
          uid: p.uid || '',
          nombre: p.nombre,
          telefono: p.telefono,
          email: p.email,
          localidad: p.localidad,
          pedidos: 0,
          totalGastado: 0,
          pedidosPendientes: 0,
          ultimoPedido: '',
          ultimoPedidoObj: null,
          sheetRowIndex: p.sheetRowIndex,
          cupon: (p.cupon || '').trim().toUpperCase(),
          cupon_bienvenida_estado: p.cupon_bienvenida_estado || '',
          codigo_referido_usado: p.codigo_referido || '', // Código USADO por el comprador al comprar
          codigo_referido: '', // El código PROPIO se resuelve exclusivamente desde Clientes (NUNCA de Pedidos)
          referido_estado: p.referido_estado || '',
          referidos_count: parseInt(p.referidos_count) || 0,
          credito_acumulado: parseInt(p.credito_acumulado) || 0,
          acepto_tyc: p.acepto_tyc || '',
          acepto_publicidad: p.acepto_publicidad || ''
        };
      }

      if (p.uid && !mapa[cKey].uid) {
        mapa[cKey].uid = p.uid;
      }

      // Solo contar como venta cerrada si fue entregado y cobrado
      if (esVentaCerrada(p)) {
        mapa[cKey].pedidos += 1;
        mapa[cKey].totalGastado += Number(p.total || 0);
      } else {
        mapa[cKey].pedidosPendientes += 1;
      }

      if (!mapa[cKey].ultimoPedido || p.fecha >= mapa[cKey].ultimoPedido) {
        mapa[cKey].ultimoPedido = p.fecha;
        mapa[cKey].ultimoPedidoObj = p;
        mapa[cKey].sheetRowIndex = p.sheetRowIndex;
        if (p.acepto_tyc) mapa[cKey].acepto_tyc = p.acepto_tyc;
        if (p.acepto_publicidad) mapa[cKey].acepto_publicidad = p.acepto_publicidad;
      }
      
      // Merge states: si alguna vez compró con el cupón o tiene un progreso guardado, rescatarlo
      if ((p.cupon || '').toUpperCase() === 'BIENVENIDO10') mapa[cKey].cupon = 'BIENVENIDO10';
      if (p.cupon_bienvenida_estado) mapa[cKey].cupon_bienvenida_estado = p.cupon_bienvenida_estado;
      if (p.codigo_referido) mapa[cKey].codigo_referido_usado = p.codigo_referido;
      if (p.referido_estado) mapa[cKey].referido_estado = p.referido_estado;
      if (p.referidos_count) mapa[cKey].referidos_count = parseInt(p.referidos_count);
      if (p.credito_acumulado) mapa[cKey].credito_acumulado = parseInt(p.credito_acumulado);
    });

    // Cruzar código propio con la hoja Clientes (NUNCA de la columna codigo_referido de Pedidos)
    Object.values(mapa).forEach(c => {
      const codigoPropio = obtenerCodigoPropioCliente(c, clientesSheet);
      c.codigo_referido = codigoPropio;

      // Si clientesSheet tiene crédito acumulado o datos adicionales, enriquecer
      const csObj = (clientesSheet || []).find(cs =>
        (cs.uid && c.uid && cs.uid === c.uid) ||
        (cs.email && c.email && cs.email.toLowerCase().trim() === c.email.toLowerCase().trim())
      );
      if (csObj) {
        if (csObj.codigo_referido && !c.codigo_referido) c.codigo_referido = csObj.codigo_referido;
        if (csObj.credito_acumulado && !c.credito_acumulado) c.credito_acumulado = csObj.credito_acumulado;
      }
    });

    return Object.values(mapa).sort((a, b) => {
      if (b.totalGastado !== a.totalGastado) return b.totalGastado - a.totalGastado;
      return (b.ultimoPedido || '').localeCompare(a.ultimoPedido || '');
    });
  }, [PEDIDOS, clientesSheet]);

  // Carritos abandonados: SOLO pedidos de pago online (mercadopago) sin pagar.
  // Un pedido contra entrega NUNCA es carrito abandonado ni "No pagó".
  const carritosAbandonados = useMemo(() => {
    if (!PEDIDOS || !Array.isArray(PEDIDOS)) return [];
    return PEDIDOS.filter(p => {
      const formaPago = (p.forma_pago || '').toLowerCase().trim();
      const metodoPago = (p.metodo_pago || p.metodo_pago_elegido || '').toLowerCase().trim();
      const esContraEntrega = formaPago === 'entrega' || esFormaPagoContraEntrega(formaPago, metodoPago);
      if (esContraEntrega) return false;

      const estadoPago = (p.estado_pago || '').toLowerCase().trim();
      const esAprobado = estadoPago === 'approved' || estadoPago === 'pagado';
      const tieneDatos = !!(p.nombre || p.telefono || p.email);
      return !esAprobado && tieneDatos;
    }).sort((a, b) => (b.fecha > a.fecha ? 1 : -1));
  }, [PEDIDOS]);

  const abrirWhatsApp = (tel, nombre) => {
    const texto = `Hola ${nombre.split(' ')[0]}! %F0%9F%91%8B ¿Cómo estás? Te escribimos desde Huerta Urbana %F0%9F%A5%A6`;
    const url = `https://web.whatsapp.com/send?phone=${(tel || '').replace(/\D/g, '')}&text=${texto}`;
    window.open(url, '_blank');
  };

  const abrirRecuperacion = (tel, nombre, producto) => {
    const primerNombre = (nombre || '').split(' ')[0] || 'ahí';
    const telLimpio = (tel || '').replace(/\D/g, '');
    const paramRec = btoa(telLimpio);
    const linkCarrito = `https://huertaurbana.com.ar?rec=${paramRec}`;
    const mensaje = `¡Hola ${primerNombre}! 👋 Te escribimos desde Huerta Urbana.\nVimos que te quedaste con las ganas... 🥦🍅\nPara que no te pierdas nada, te regalamos un 10% de descuento en tu pedido.\nUsá el cupón: COSECHA10\n¿Arrancamos? 👉 ${linkCarrito}`;
    const texto = encodeURIComponent(mensaje);
    const url = `https://web.whatsapp.com/send?phone=${telLimpio}&text=${texto}`;
    window.open(url, '_blank');
  };

  const enviarCuponBienvenida = (c) => {
    if (actualizarDatosCliente) actualizarDatosCliente(c.sheetRowIndex, { cupon_bienvenida_estado: 'Enviado' });
    const primerNombre = (c.nombre || '').split(' ')[0] || 'Cliente';
    const texto = encodeURIComponent(`Hola ${primerNombre}! `) + "%F0%9F%8E%89" + 
                  encodeURIComponent(`\nTe regalamos un cupón de bienvenida:\n`) + "%F0%9F%8E%81" + 
                  encodeURIComponent(` BIENVENIDO10 — 10% off en tu próxima compra\nUso único — sin vencimiento\n\nQue tengas un excelente día!\n`) + 
                  "%F0%9F%8C%BF" + encodeURIComponent(` Huerta Urbana — 11 6177-1376`);
    const url = `https://web.whatsapp.com/send?phone=${(c.telefono || '').replace(/\D/g, '')}&text=${texto}`;
    window.open(url, '_blank');
  };

  const imprimirRemitoCliente = (c) => {
    const pedidosCliente = PEDIDOS.filter(p => (c.email && p.email === c.email) || (c.telefono && p.telefono === c.telefono));
    if (!pedidosCliente || pedidosCliente.length === 0) {
      alert('No se encontraron pedidos registrados para este cliente.');
      return;
    }
    const ultimoPedido = [...pedidosCliente].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))[0];

    let prep = null;
    try {
      const s = localStorage.getItem('huerta_preparaciones_v1');
      if (s) {
        const parsed = JSON.parse(s);
        prep = parsed[ultimoPedido.numero_pedido] || null;
      }
    } catch (e) {}

    if (!estaPedidoArmado(ultimoPedido, prep)) {
      alert('Primero pesá y armá el pedido');
      return;
    }

    imprimirRemitoIndividual(ultimoPedido, prep);
  };

  const enviarCodigoReferido = async (c) => {
    let codigo = c.codigo_referido || obtenerCodigoPropioCliente(c, clientesSheet);
    let nombreFirestore = '';

    // 1. Si no está en clientesSheet y tiene email, intentar leer de Firestore (solo lectura, sin inventar)
    if (!codigo && c.email) {
      try {
        const q = query(collection(db, "clientes"), where("email", "==", c.email));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const docData = querySnapshot.docs[0].data();
          if (docData.codigo_referido) codigo = docData.codigo_referido;
          if (docData.nombre) nombreFirestore = docData.nombre;
        }
      } catch (err) {
        console.error("Error al consultar Firestore:", err);
      }
    }

    // 2. Si no tiene código propio en Clientes, NO generar uno al azar
    if (!codigo) {
      alert(MENSAJE_SIN_CODIGO);
      return;
    }

    // 3. Actualizar ÚNICAMENTE referido_estado en Pedidos (NUNCA escribir codigo_referido en Pedidos!)
    if (actualizarDatosCliente) {
      actualizarDatosCliente(c.sheetRowIndex, prepararPayloadReferido());
    }
    
    // 4. Preparar mensaje y abrir WhatsApp
    const nombreFinal = nombreFirestore || c.nombre || 'Cliente';
    const primerNombre = nombreFinal.split(' ')[0];
    
    const mensaje = `Hola ${primerNombre}! 🌿\n` +
      `Gracias por tu compra en Huerta Urbana. Es un placer tenerte como cliente.\n` +
      `Te compartimos tu código de referido personal: ${codigo}\n` +
      `Cada vez que un amigo o familiar haga su primera compra usando tu código, vos acumulás $5.000 de crédito en tu cuenta. Y ellos reciben un 10% de descuento en su pedido. Todos ganan 🎉\n` +
      `Podés ver tu crédito acumulado iniciando sesión en huertaurbana.com.ar\n` +
      `Que tengas un hermoso día! ☀️\n` +
      `El equipo de Huerta Urbana`;

    const texto = encodeURIComponent(mensaje);
    const url = `https://web.whatsapp.com/send?phone=${(c.telefono || '').replace(/\D/g, '')}&text=${texto}`;
    window.open(url, '_blank');
  };

  const renderWidgetBienvenida = (c) => {
    if (!cuponActivo) {
      return (
        <div className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border border-gray-800 bg-[#111827] opacity-60 h-24">
          <span className="text-xl">⚫</span>
          <span className="text-[10px] font-bold text-gray-500 uppercase text-center leading-none">Inactivo</span>
        </div>
      );
    }
    if (c.cupon === 'BIENVENIDO10') {
      return (
        <div className="flex flex-col items-center justify-center gap-1 p-2 rounded-2xl border border-green-500/30 bg-green-500/10 h-24">
          <span className="text-[9px] font-black text-green-500/60 uppercase tracking-tighter">BIENVENIDA</span>
          <span className="text-xl">🟢</span>
          <span className="text-[10px] font-bold text-green-400 uppercase text-center leading-tight">Canjeado<br/><span className="text-white opacity-80 mt-1 block">BIENVENIDO10</span></span>
        </div>
      );
    }
    if (c.cupon_bienvenida_estado === 'Enviado') {
      return (
        <div className="flex flex-col items-center justify-center gap-1 p-2 rounded-2xl border border-blue-500/30 bg-blue-500/10 h-24 relative group">
          <span className="text-[9px] font-black text-blue-500/60 uppercase tracking-tighter">BIENVENIDA</span>
          <span className="text-xl">🔵</span>
          <span className="text-[10px] font-bold text-blue-400 uppercase text-center leading-tight">Enviado<br/><span className="text-white opacity-80 mt-1 block">— Pendiente —</span></span>
          <button 
            onClick={() => actualizarDatosCliente(c.sheetRowIndex, { cupon_bienvenida_estado: '' })}
            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800/80 hover:bg-gray-700 text-[8px] text-gray-400 px-1.5 py-0.5 rounded border border-gray-700"
          >
            Resetear
          </button>
        </div>
      );
    }
    return (
      <button 
        onClick={() => enviarCuponBienvenida(c)}
        className="flex flex-col items-center justify-center gap-1 p-2 rounded-2xl border border-gray-700 bg-gray-800/50 hover:bg-gray-800 active:scale-95 transition-all text-left h-24 w-full"
      >
        <span className="text-[9px] font-black text-gray-500 uppercase tracking-tighter">BIENVENIDA</span>
        <span className="text-xl">🔘</span>
        <span className="text-[10px] font-bold text-gray-400 uppercase text-center leading-tight">Sin cupón</span>
        <span className="text-[10px] mt-1 text-green-400 font-bold bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded flex items-center justify-center gap-1 w-full"><GiftIcon/> Enviar</span>
      </button>
    );
  };

  const renderWidgetReferido = (c) => {
    if (c.referidos_count > 0) {
      return (
        <div className="flex flex-col items-center justify-center gap-1 p-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 h-24 relative overflow-hidden">
          <span className="text-[9px] font-black text-amber-500/60 uppercase tracking-tighter relative z-10">REFERIDO</span>
          <span className="text-xl relative z-10">⭐</span>
          <span className="text-[10px] font-bold text-amber-400 uppercase text-center leading-tight relative z-10">{c.referidos_count} Activos<br/><span className="text-white text-base mt-0.5 block">{c.credito_acumulado ? $$(c.credito_acumulado) : "$0"}</span></span>
        </div>
      );
    }
    if (c.referido_estado === 'Enviado') {
      return (
        <div className="flex flex-col items-center justify-center gap-1 p-2 rounded-2xl border border-blue-500/30 bg-blue-500/10 h-24 relative group">
          <span className="text-[9px] font-black text-blue-500/60 uppercase tracking-tighter">REFERIDO</span>
          <span className="text-xl">🔵</span>
          <span className="text-[10px] font-bold text-blue-400 uppercase text-center leading-tight">Enviado<br/><span className="text-blue-300 opacity-90 mt-1 block text-[11px] bg-blue-500/20 px-2 py-0.5 rounded border border-blue-500/20">{c.codigo_referido || 'Enviado'}</span></span>
          <button 
            type="button"
            onClick={() => actualizarDatosCliente(c.sheetRowIndex, { referido_estado: '' })}
            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800/80 hover:bg-gray-700 text-[8px] text-gray-400 px-1.5 py-0.5 rounded border border-gray-700 cursor-pointer"
            title="Resetear estado a No enviado"
          >
            Resetear
          </button>
        </div>
      );
    }

    // Si el cliente no tiene código propio en Clientes: mostrar aviso y botón deshabilitado
    if (!c.codigo_referido) {
      return (
        <div 
          className="flex flex-col items-center justify-center gap-1 p-2 rounded-2xl border border-gray-800 bg-gray-900/60 text-center h-24 w-full opacity-60 cursor-not-allowed select-none"
          title={MENSAJE_SIN_CODIGO}
        >
          <span className="text-[9px] font-black text-gray-500 uppercase tracking-tighter">REFERIDO</span>
          <span className="text-base">🔒</span>
          <span className="text-[9px] font-bold text-amber-400/90 leading-tight px-1">
            Sin código web
          </span>
          <span className="text-[8px] text-gray-500 leading-tight px-1 line-clamp-2">
            {MENSAJE_SIN_CODIGO}
          </span>
        </div>
      );
    }

    // Cliente con código propio listo para enviar
    return (
      <button 
        type="button"
        onClick={() => enviarCodigoReferido(c)}
        className="flex flex-col items-center justify-center gap-1 p-2 rounded-2xl border border-gray-700 bg-gray-800/50 hover:bg-gray-800 active:scale-95 transition-all text-left h-24 w-full cursor-pointer"
        title={`Enviar código personal ${c.codigo_referido} por WhatsApp`}
      >
        <span className="text-[9px] font-black text-gray-500 uppercase tracking-tighter">REFERIDO</span>
        <span className="text-xl">🔘</span>
        <span className="text-[10px] font-bold text-gray-400 uppercase text-center leading-tight">No enviado</span>
        <span className="text-[10px] mt-1 text-blue-400 font-bold bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded flex items-center justify-center gap-1 w-full truncate">
          <UsersIcon/> Enviar ({c.codigo_referido})
        </span>
      </button>
    );
  };

  const GiftIcon = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"></polyline><rect x="2" y="7" width="20" height="5"></rect><line x1="12" y1="22" x2="12" y2="7"></line><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path></svg>;
  const UsersIcon = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;

  return (
    <div className="space-y-10">

      {/* ── CLIENTES REALES ─────────────────────────────── */}
      <div>
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white">Clientes</h2>
            <p className="text-gray-500 text-sm mt-1">
              {clientes.length} clientes registrados
            </p>
          </div>
          
          {/* Toggle Cupón Global */}
          <div className="flex items-center gap-3 bg-[#1f2937] border border-gray-800 px-4 py-2.5 rounded-xl shrink-0 shadow-lg">
            <span className="text-xs font-bold text-white uppercase">BIENVENIDO10</span>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-black uppercase tracking-wider ${cuponActivo ? 'text-green-400' : 'text-gray-500'}`}>
                {cuponActivo ? '🟢 Activo' : '⚫ Inactivo'}
              </span>
              <button 
                onClick={() => setCuponActivo(!cuponActivo)}
                className={`w-11 h-6 rounded-full relative transition-colors ${cuponActivo ? 'bg-green-500' : 'bg-gray-700'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${cuponActivo ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
          </div>
        </div>

        {clientes.length === 0 ? (
          <div className="bg-[#1f2937] border border-gray-800 rounded-2xl p-10 text-center">
            <ShoppingBag size={32} className="text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500">Aún no hay clientes registrados.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {clientes.map(c => {
              const pedidosCliente = (PEDIDOS || []).filter(p => (c.email && p.email === c.email) || (c.telefono && p.telefono === c.telefono));
              const ultimoPedido = pedidosCliente && pedidosCliente.length > 0
                ? [...pedidosCliente].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))[0]
                : c.ultimoPedidoObj || null;
              let prep = null;
              if (ultimoPedido) {
                try {
                  const s = localStorage.getItem('huerta_preparaciones_v1');
                  if (s) {
                    const parsed = JSON.parse(s);
                    prep = parsed[ultimoPedido.numero_pedido] || null;
                  }
                } catch (_) {}
              }
              const estaArmado = ultimoPedido ? estaPedidoArmado(ultimoPedido, prep) : false;

              return (
              <div key={c.email || c.telefono || c.nombre} className="bg-[#1f2937] border border-gray-800 rounded-2xl p-5 hover:border-gray-700 transition-all fade-in">
                {/* Avatar + nombre */}
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-400 font-bold text-sm shrink-0">
                    {(c.nombre || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-white text-sm truncate">{c.nombre}</p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {(() => {
                          const val = c.acepto_tyc || '';
                          const isSi = val.toUpperCase().startsWith('SI');
                          const isNo = val.toUpperCase() === 'NO';
                          const colorClass = isSi ? 'bg-[#dcfce7] text-[#16a34a] border-[#16a34a]' : isNo ? 'bg-[#fee2e2] text-[#dc2626] border-[#dc2626]' : 'bg-gray-800/50 text-gray-400 border-gray-700';
                          return (
                            <div title={`TyC: ${val || 'Sin datos'}`} className={`px-2 py-0.5 rounded-[6px] border text-[11px] font-semibold flex items-center gap-1 ${colorClass}`}>
                              T&C {isSi ? '✓' : isNo ? '✗' : '-'}
                            </div>
                          );
                        })()}
                        {(() => {
                          const val = c.acepto_publicidad || '';
                          const isSi = val.toUpperCase() === 'SI';
                          const isNo = val.toUpperCase() === 'NO';
                          const colorClass = isSi ? 'bg-[#dcfce7] text-[#16a34a] border-[#16a34a]' : isNo ? 'bg-[#fee2e2] text-[#dc2626] border-[#dc2626]' : 'bg-gray-800/50 text-gray-400 border-gray-700';
                          return (
                            <div title={`Publicidad: ${val || 'Sin datos'}`} className={`px-2 py-0.5 rounded-[6px] border text-[11px] font-semibold flex items-center gap-1 ${colorClass}`}>
                              Pub {isSi ? '✓' : isNo ? '✗' : '-'}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{c.localidad}</p>
                  </div>
                </div>

                {/* Stats: solo ventas cerradas */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="bg-[#111827] rounded-xl p-2 text-center">
                    <ShoppingBag size={12} className="text-gray-500 mx-auto mb-1" />
                    <p className="text-base font-bold text-white">{c.pedidos}</p>
                    <p className="text-[10px] text-gray-500">Ventas cerradas</p>
                  </div>
                  <div className="bg-[#111827] rounded-xl p-2 text-center">
                    <DollarSign size={12} className="text-gray-500 mx-auto mb-1" />
                    <p className="text-xs font-bold text-green-400">{$$(c.totalGastado)}</p>
                    <p className="text-[10px] text-gray-500">Total cobrado</p>
                  </div>
                  <div className="bg-[#111827] rounded-xl p-2 text-center">
                    <Calendar size={12} className="text-gray-500 mx-auto mb-1" />
                    <p className="text-[10px] font-bold text-white">
                      {c.ultimoPedido ? c.ultimoPedido.split('-').reverse().join('/') : '-'}
                    </p>
                    <p className="text-[10px] text-gray-500">Último</p>
                  </div>
                </div>

                {/* Último pedido con insignias de Entrega y Pago */}
                {ultimoPedido && (() => {
                  const estEnt = estadoEntregaPedido(ultimoPedido, prep);
                  const estPag = estadoPagoPedido(ultimoPedido);
                  return (
                    <div className="bg-[#111827] rounded-xl p-3 mb-4 border border-gray-800">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-mono text-gray-400 font-bold">{ultimoPedido.numero_pedido}</span>
                        <span className="text-emerald-400 font-bold">{$$(ultimoPedido.total)}</span>
                      </div>
                      <p className="text-[11px] text-gray-400 truncate mb-2">{ultimoPedido.producto || 'Varios'}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${estEnt.color}`}>
                          <span className={`w-1 h-1 rounded-full ${estEnt.dot}`} />
                          {estEnt.label}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${estPag.color}`}>
                          <span className={`w-1 h-1 rounded-full ${estPag.dot}`} />
                          {estPag.label}
                        </span>
                        {ultimoPedido.codigo_referido && (
                          <span 
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border border-purple-500/30 bg-purple-500/10 text-purple-300"
                            title={`El comprador usó el código de referido ${ultimoPedido.codigo_referido} al realizar esta compra`}
                          >
                            Código usado: {ultimoPedido.codigo_referido}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* FIDELIZACIÓN (Cupones y referidos) */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {renderWidgetBienvenida(c)}
                  {renderWidgetReferido(c)}
                </div>

                {/* Botón WhatsApp */}
                <button
                  onClick={() => abrirWhatsApp(c.telefono, c.nombre)}
                  className="w-full flex items-center justify-center gap-2 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 text-xs font-medium py-2.5 rounded-xl transition-all"
                >
                  <MessageCircle size={13} />
                  Contactar por WhatsApp
                </button>

                {/* Botón Imprimir Remito */}
                <button
                  type="button"
                  onClick={() => estaArmado ? imprimirRemitoCliente(c) : null}
                  disabled={!estaArmado}
                  className={`w-full flex items-center justify-center gap-2 mt-2 border text-xs font-semibold py-2.5 rounded-xl transition-all shadow-sm ${
                    estaArmado
                      ? 'bg-indigo-500/15 hover:bg-indigo-500/25 border-indigo-500/30 text-indigo-300 cursor-pointer active:scale-98'
                      : 'bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed opacity-60'
                  }`}
                  title={estaArmado ? 'Imprimir remito del último pedido de este cliente' : 'Primero pesá y armá el pedido'}
                >
                  <Printer size={13} className={estaArmado ? 'text-indigo-400' : 'text-gray-500'} />
                  <span>{estaArmado ? 'Imprimir Remito del Cliente' : 'Primero pesá y armá el pedido'}</span>
                </button>
              </div>
            );
          })}
        </div>
        )}
      </div>

      {/* ── PAGOS ONLINE SIN COMPLETAR ─────────────────────────── */}
      <div>
        <div className="mb-6 flex items-start gap-3">
          <div className="w-9 h-9 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center shrink-0">
            <ShoppingCart size={18} className="text-amber-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Pagos online sin completar</h2>
            <p className="text-gray-500 text-sm mt-0.5">
              {carritosAbandonados.length} {carritosAbandonados.length === 1 ? 'pago online pendiente o sin completar' : 'pagos online pendientes o sin completar'}
            </p>
          </div>
        </div>

        {carritosAbandonados.length === 0 ? (
          <div className="bg-[#1f2937] border border-gray-800 rounded-2xl p-10 text-center">
            <AlertTriangle size={32} className="text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500">No hay pagos online sin completar registrados.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {carritosAbandonados.map(c => (
              <div key={c.email} className="bg-[#1f2937] border border-amber-500/20 rounded-2xl p-5 hover:border-amber-500/40 transition-all fade-in">
                {/* Badge */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-sm shrink-0">
                      {(c.nombre || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-white text-sm truncate">{c.nombre}</p>
                      </div>
                      <p className="text-xs text-gray-500 truncate">{c.localidad}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-lg shrink-0">
                    Sin completar
                  </span>
                </div>

                {/* Info del pago online */}
                <div className="bg-[#111827] border border-gray-800 rounded-xl p-3 mb-4 space-y-1.5">
                  <div className="flex justify-between items-start">
                    <span className="text-[11px] text-gray-500 mt-0.5">Producto</span>
                    <span 
                      className="text-xs font-medium text-white text-right max-w-[70%] cursor-help"
                      title={c.producto}
                    >
                      {c.producto || '-'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center border-t border-gray-800 pt-1.5">
                    <span className="text-[11px] text-gray-500">Monto</span>
                    <span className="text-xs font-bold text-amber-400">{$$(c.total)}</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-gray-800 pt-1.5">
                    <span className="text-[11px] text-gray-500">Fecha</span>
                    <span className="text-xs text-gray-400">
                      {c.fecha ? c.fecha.split('-').reverse().join('/') : '-'}
                    </span>
                  </div>
                </div>

                {/* Botón de recuperación */}
                <button
                  onClick={() => abrirRecuperacion(c.telefono, c.nombre, c.producto)}
                  className="w-full flex items-center justify-center gap-2 bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/30 text-[#25D366] text-xs font-bold py-2.5 rounded-xl transition-all"
                >
                  <MessageCircle size={13} />
                  Recuperar por WhatsApp
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
