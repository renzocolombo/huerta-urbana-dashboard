import { useState, useEffect } from 'react';
import { Leaf, LayoutDashboard, ShoppingCart, Clock, Users, MapPin, Route, DollarSign, Package, FileText, Menu, X, LogOut, Database } from 'lucide-react';
import { useGoogleSheets } from '../context/GoogleSheetsContext';

const NAV_ITEMS = [
  { id: 'resumen',   label: 'Resumen',          icon: LayoutDashboard },
  { id: 'graficos',  label: 'Gráficos',          icon: LayoutDashboard },
  { id: 'pedidos',   label: 'Pedidos del día',   icon: ShoppingCart },
  { id: 'historial', label: 'Historial',         icon: Clock },
  { id: 'clientes',  label: 'Clientes',          icon: Users },
  { id: 'agenda',    label: 'Agenda entregas',   icon: MapPin },
  { id: 'costos',    label: 'Panel de costos',   icon: DollarSign },
  { id: 'stock',     label: 'Control stock',     icon: Package },
  { id: 'reportes',  label: 'Reportes',          icon: FileText },
];

export default function Header({ seccion, onNav, onLogout, rol, urlSheet, setSeccionActiva }) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const { conectado, ultimoRefresco } = useGoogleSheets();
  const [segundosTranscurridos, setSegundosTranscurridos] = useState(0);

  // Timer para el indicador de "Hace Xs"
  useEffect(() => {
    const interval = setInterval(() => {
      const diff = Math.floor((new Date() - ultimoRefresco) / 1000);
      setSegundosTranscurridos(diff);
    }, 1000);
    return () => clearInterval(interval);
  }, [ultimoRefresco]);

  const itemsMostrar = rol === 'repartidor' ? NAV_ITEMS.filter(item => item.id === 'agenda') : NAV_ITEMS;

  return (
    <>
      {/* Header top bar */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-[#0f0f0f]/95 backdrop-blur border-b border-gray-800">
        <div className="flex items-center justify-between px-4 h-14">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-green-500 rounded-lg flex items-center justify-center">
              <Leaf size={15} className="text-white" />
            </div>
            <span className="font-bold text-white text-sm">Huerta Urbana</span>
          </div>

          {/* Nav desktop */}
          <nav className="hidden lg:flex items-center gap-1">
            {itemsMostrar.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => onNav(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  seccion === id
                    ? 'bg-green-500/15 text-green-400'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </nav>

          {/* Acciones */}
          <div className="flex items-center gap-2 sm:gap-3">
            {rol === 'repartidor' ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-green-500/10 border border-green-500/20">
                <span className="text-[10px] sm:text-xs font-bold text-green-400">Bienvenido, Repartidor 🌿</span>
              </div>
            ) : (
              <>
                {conectado ? (
                  <div className="flex items-center gap-1.5 sm:gap-2 text-[9px] sm:text-[10px] font-black px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-green-500/10 text-green-500 border border-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.1)]">
                    <span className="animate-pulse shadow-[0_0_10px_#22c55e]">🟢</span> 
                    <span className="hidden xs:inline">Sheet conectado</span>
                    <span className="xs:hidden">Conectado</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 sm:gap-2 text-[9px] sm:text-[10px] font-black px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-gray-800/80 text-gray-500 border border-gray-700">
                    ⚫ 
                    <span className="hidden xs:inline">Sheet desconectado</span>
                    <span className="xs:hidden">Offline</span>
                  </div>
                )}

                {/* Botón Abrir Planilla (Visible en todo tamaño) */}
                <a 
                  href="https://docs.google.com/spreadsheets/d/1Qw2LRgQuIR1CHox1XNJ3DPLipEEPE7k16tJLMYaoyt0" 
                  target="_blank" 
                  rel="noreferrer"
                  className="flex items-center gap-1.5 bg-[#1f2937] hover:bg-gray-800 border border-gray-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-xl transition-all"
                >
                  <Database size={12} className="text-blue-400" />
                  <span className="hidden sm:inline">Abrir planilla</span>
                  <span className="sm:hidden">Planilla</span>
                </a>

                {/* Botón Luma Header (Solo Mobile) */}
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('abrir-luma'))}
                  className="lg:hidden w-[35px] h-[35px] rounded-full overflow-hidden border border-green-500/30 active:scale-95 transition-transform"
                >
                  <img src="/luma-avatar.png" alt="Luma" className="w-full h-full object-cover" />
                </button>
              </>
            )}

            <button
              onClick={onLogout}
              className="hidden lg:flex items-center gap-1.5 text-xs text-gray-500 hover:text-white transition-colors px-2 py-2 rounded-lg hover:bg-gray-800"
            >
              <LogOut size={13} />
              {rol === 'repartidor' ? 'Cerrar sesión' : 'Salir'}
            </button>
            {/* Hamburguesa móvil */}
            <button
              className="lg:hidden p-2 text-gray-400 hover:text-white"
              onClick={() => setMenuAbierto(!menuAbierto)}
            >
              {menuAbierto ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>

      {/* Menú móvil */}
      {menuAbierto && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMenuAbierto(false)} />
          <div className="absolute top-0 right-0 bottom-0 w-64 bg-[#111827] border-l border-gray-800 p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <span className="font-semibold text-white text-sm">Navegación</span>
              <button onClick={() => setMenuAbierto(false)} className="text-gray-400">
                <X size={18} />
              </button>
            </div>
            <nav className="space-y-1">
              {itemsMostrar.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => { onNav(id); setMenuAbierto(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    seccion === id
                      ? 'bg-green-500/15 text-green-400'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </nav>
            {!conectado && (
              <button
                onClick={() => { loginConGoogle(); setMenuAbierto(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 mt-4 transition-all"
              >
                <Database size={16} />
                Conectar Google Sheets
              </button>
            )}
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
