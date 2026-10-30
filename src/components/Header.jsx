import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Leaf, LayoutDashboard, ShoppingCart, Clock, Users, MapPin, 
  Package, FileText, Menu, X, LogOut, Database, Landmark, AlertTriangle, 
  Home, MoreHorizontal, ChevronDown
} from 'lucide-react';
import { useGoogleSheets } from '../context/GoogleSheetsContext';
import { calcularFaltantes } from './Faltantes';
import { apiGetStockKg } from '../utils/mercaderiaApi';

// Catálogo de navegación sin la pestaña de control stock viejo
const NAV_ITEMS = [
  { id: 'finanzas',    label: 'Finanzas',               icon: Landmark,        prioridad: 1 },
  { id: 'pedidos',     label: 'Pedidos del día',        icon: ShoppingCart,    prioridad: 1 },
  { id: 'agenda',      label: 'Agenda entregas',        icon: MapPin,          prioridad: 1 },
  { id: 'productos',   label: 'Productos',              icon: Package,         prioridad: 1 },
  { id: 'hogar',       label: 'Hogar',                  icon: Home,            prioridad: 1 },
  { id: 'faltantes',   label: 'Faltantes',              icon: AlertTriangle,   prioridad: 1 },
  { id: 'clientes',    label: 'Clientes',               icon: Users,           prioridad: 2 },
  { id: 'historial',   label: 'Historial',              icon: Clock,           prioridad: 2 },
  { id: 'graficos',    label: 'Gráficos',               icon: LayoutDashboard, prioridad: 2 },
  { id: 'reportes',    label: 'Reportes',              icon: FileText,        prioridad: 2 },
];

export default function Header({ seccion, onNav, onLogout, rol, usuario }) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [menuMasAbierto, setMenuMasAbierto] = useState(false);
  const menuMasRef = useRef(null);
  let sheetsCtx = null;
  try {
    sheetsCtx = useGoogleSheets();
  } catch (_) {}
  const { conectado = false, ultimoRefresco, stockData = {}, productosCostos = [], pedidos = [] } = sheetsCtx || {};
  const [stockKgList, setStockKgList] = useState(null);

  useEffect(() => {
    let cancel = false;
    apiGetStockKg()
      .then((res) => {
        if (!cancel && res && res.ok && Array.isArray(res.productos)) {
          setStockKgList(res.productos);
        }
      })
      .catch(() => {});
    return () => { cancel = true; };
  }, [ultimoRefresco]);

  // Cerrar menú Más al hacer clic afuera
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuMasRef.current && !menuMasRef.current.contains(e.target)) {
        setMenuMasAbierto(false);
      }
    };
    if (menuMasAbierto) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuMasAbierto]);

  const faltantesCount = useMemo(() => {
    try {
      const res = calcularFaltantes(stockData, productosCostos, pedidos, stockKgList);
      return res?.faltantes?.length || 0;
    } catch (e) {
      return 0;
    }
  }, [stockData, productosCostos, pedidos, stockKgList]);

  const getEstilosSaludo = (u) => {
    const user = (u || '').toLowerCase();
    const emoji = (user === 'ren' || user === 'nati' || user === 'produccion') ? '🌿' : '🚴';
    return { bg: 'bg-[#f59e0b26]', border: 'border-[#f59e0b1a]', text: 'text-[#fbbf24]', emoji };
  };

  const estilos = getEstilosSaludo(usuario);

  const esAdminRem = rol === 'admin' && (
    (usuario || '').toLowerCase() === 'ren' || 
    (usuario || '').toLowerCase() === 'rem' ||
    (usuario || '').toLowerCase() === 'admin'
  );

  const itemsMostrar = rol === 'admin' 
    ? NAV_ITEMS.filter(item => {
        if (item.adminOnly) return esAdminRem;
        return true;
      })
    : (rol === 'repartidor' ? NAV_ITEMS.filter(item => item.id === 'agenda') : []);

  // Items prioritarios para tablet y secundarios agrupables en "Más"
  const itemsPrincipales = itemsMostrar.filter(i => i.prioridad === 1);
  const itemsSecundarios = itemsMostrar.filter(i => i.prioridad === 2);
  const seccionEnSecundarios = itemsSecundarios.some(i => i.id === seccion);

  return (
    <>
      {/* Header top bar */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-[#0f0f0f]/95 backdrop-blur border-b border-gray-800">
        <div className="flex items-center justify-between px-3 sm:px-4 h-14 relative w-full">
          {/* Logo (Izquierda) */}
          <div className="flex-shrink-0 flex items-center gap-2">
            <div className="w-7 h-7 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <Leaf size={15} className="text-white" />
            </div>
            <span className="font-bold text-white text-xs sm:text-sm tracking-tight whitespace-nowrap">
              Huerta Urbana
            </span>

            {/* Saludo personalizado compacto */}
            {usuario && (
              <div className="hidden 2xl:flex items-center gap-1.5 ml-2 px-2.5 py-0.5 rounded-xl bg-[#f59e0b26] border border-[#f59e0b1a] text-[#fbbf24] text-[11px] font-bold">
                <span>{estilos.emoji}</span>
                <span>¡Hola, {usuario}!</span>
              </div>
            )}
          </div>

          {/* Centro: Navegación Adaptable (Notebook completa / Tablet con menú Más) */}
          <div className="flex-1 flex justify-center px-1 sm:px-2">
            {/* Nav Tablet & Desktop */}
            <nav className="hidden md:flex items-center gap-1 xl:gap-1.5">
              {/* En pantallas grandes (>= 1280px / 1366px): todos los 10 ítems visibles */}
              <div className="hidden xl:flex items-center gap-1 xl:gap-1.5">
                {itemsMostrar.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => onNav(id)}
                    className={`relative flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-lg text-xs font-medium transition-all min-w-[60px] xl:min-w-[68px] ${
                      seccion === id
                        ? 'bg-green-500/15 text-green-400'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800'
                    }`}
                  >
                    <div className="relative flex items-center justify-center">
                      <Icon size={14} />
                      {id === 'faltantes' && faltantesCount > 0 && (
                        <span className="absolute -top-1.5 -right-3 bg-red-600 text-white text-[9px] font-black px-1 rounded-full min-w-[14px] h-[14px] flex items-center justify-center leading-none border border-black shadow">
                          {faltantesCount > 99 ? '99+' : faltantesCount}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] leading-tight text-center truncate max-w-[66px]">
                      {label}
                    </span>
                  </button>
                ))}
              </div>

              {/* En pantallas intermedias / tablet (md a xl): Principales + menú 'Más' */}
              <div className="flex xl:hidden items-center gap-1">
                {itemsPrincipales.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => onNav(id)}
                    className={`relative flex flex-col items-center justify-center gap-0.5 px-1.5 py-1 rounded-lg text-xs font-medium transition-all min-w-[54px] sm:min-w-[58px] ${
                      seccion === id
                        ? 'bg-green-500/15 text-green-400'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800'
                    }`}
                  >
                    <div className="relative flex items-center justify-center">
                      <Icon size={13} />
                      {id === 'faltantes' && faltantesCount > 0 && (
                        <span className="absolute -top-1.5 -right-2.5 bg-red-600 text-white text-[8px] font-black px-1 rounded-full min-w-[13px] h-[13px] flex items-center justify-center leading-none border border-black shadow">
                          {faltantesCount > 99 ? '99+' : faltantesCount}
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] leading-tight text-center truncate max-w-[56px]">
                      {label}
                    </span>
                  </button>
                ))}

                {/* Dropdown Más para no ocultar ninguno en tablet */}
                {itemsSecundarios.length > 0 && (
                  <div className="relative" ref={menuMasRef}>
                    <button
                      type="button"
                      onClick={() => setMenuMasAbierto(!menuMasAbierto)}
                      className={`relative flex flex-col items-center justify-center gap-0.5 px-1.5 py-1 rounded-lg text-xs font-medium transition-all min-w-[50px] ${
                        seccionEnSecundarios
                          ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                          : 'text-gray-400 hover:text-white hover:bg-gray-800'
                      }`}
                    >
                      <div className="flex items-center gap-0.5">
                        <MoreHorizontal size={14} />
                        <ChevronDown size={10} className={`transition-transform ${menuMasAbierto ? 'rotate-180' : ''}`} />
                      </div>
                      <span className="text-[9px] leading-tight font-bold">
                        {seccionEnSecundarios ? (itemsSecundarios.find(i => i.id === seccion)?.label || 'Más') : 'Más'}
                      </span>
                    </button>

                    {menuMasAbierto && (
                      <div className="absolute top-full right-0 mt-1.5 w-44 bg-[#141414] border border-gray-800 rounded-xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                        {itemsSecundarios.map(({ id, label, icon: Icon }) => (
                          <button
                            key={id}
                            onClick={() => {
                              onNav(id);
                              setMenuMasAbierto(false);
                            }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                              seccion === id
                                ? 'bg-green-500/15 text-green-400'
                                : 'text-gray-300 hover:text-white hover:bg-gray-800'
                            }`}
                          >
                            <Icon size={14} />
                            <span>{label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </nav>
          </div>

          {/* Derecha: Acciones e Ícono del Sheet */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0">
            {rol === 'admin' && (
              <>
                {conectado ? (
                  <div className="flex items-center gap-1 sm:gap-1.5 text-[9px] font-black px-2 py-1.5 rounded-xl bg-green-500/10 text-green-500 border border-green-500/30">
                    <span className="animate-pulse">🟢</span> 
                    <span className="hidden 2xl:inline">Sheet conectado</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-[9px] font-black px-2 py-1.5 rounded-xl bg-gray-800/80 text-gray-500 border border-gray-700">
                    <span>⚫</span> 
                    <span className="hidden 2xl:inline">Offline</span>
                  </div>
                )}

                {/* Botón Abrir Planilla - SIEMPRE visible en una sola fila */}
                <a 
                  href="https://docs.google.com/spreadsheets/d/1Qw2LRgQuIR1CHox1XNJ3DPLipEEPE7k16tJLMYaoyt0" 
                  target="_blank" 
                  rel="noreferrer"
                  title="Abrir planilla Google Sheets"
                  className="flex items-center gap-1 sm:gap-1.5 bg-[#1f2937] hover:bg-gray-800 border border-gray-700 text-white text-[10px] font-bold px-2.5 py-1.5 rounded-xl transition-all"
                >
                  <Database size={13} className="text-blue-400" />
                  <span className="hidden sm:inline">Planilla</span>
                </a>

                {/* Botón Luma Header (Solo Mobile) */}
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('abrir-luma'))}
                  className="md:hidden w-7 h-7 rounded-full overflow-hidden border border-green-500/30 active:scale-95 transition-transform"
                >
                  <img src="/luma-avatar.png" alt="Luma" className="w-full h-full object-cover" />
                </button>
              </>
            )}

            <button
              onClick={onLogout}
              title={rol === 'admin' ? 'Salir' : 'Cerrar sesión'}
              className="hidden md:flex items-center gap-1 text-xs text-gray-500 hover:text-white transition-colors px-2 py-1.5 rounded-lg hover:bg-gray-800"
            >
              <LogOut size={13} />
              <span className="hidden lg:inline">{rol === 'admin' ? 'Salir' : 'Cerrar sesión'}</span>
            </button>

            {/* Hamburguesa móvil (solo < 768px) */}
            <button
              className="md:hidden p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800"
              onClick={() => setMenuAbierto(!menuAbierto)}
            >
              {menuAbierto ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>

      {/* Menú móvil (< 768px) */}
      {menuAbierto && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMenuAbierto(false)} />
          <div className="absolute top-0 right-0 bottom-0 w-64 bg-[#111827] border-l border-gray-800 p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <span className="font-semibold text-white text-sm">Navegación</span>
              <button onClick={() => setMenuAbierto(false)} className="text-gray-400 p-1">
                <X size={18} />
              </button>
            </div>
            <nav className="space-y-1">
              {itemsMostrar.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => { onNav(id); setMenuAbierto(false); }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    seccion === id
                      ? 'bg-green-500/15 text-green-400'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon size={16} />
                    <span>{label}</span>
                  </div>
                  {id === 'faltantes' && faltantesCount > 0 && (
                    <span className="bg-red-600 text-white text-[11px] font-black px-2 py-0.5 rounded-full min-w-[20px] text-center shadow">
                      {faltantesCount}
                    </span>
                  )}
                </button>
              ))}
            </nav>
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:text-white hover:bg-gray-800 mt-4 transition-all"
            >
              <LogOut size={16} />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </>
  );
}
