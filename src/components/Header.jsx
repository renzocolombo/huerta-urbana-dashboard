import { useState } from 'react';
import { Leaf, LayoutDashboard, ShoppingCart, Clock, Users, MapPin, Route, DollarSign, Package, FileText, Menu, X, LogOut } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'resumen',   label: 'Resumen',          icon: LayoutDashboard },
  { id: 'graficos',  label: 'Gráficos',          icon: LayoutDashboard },
  { id: 'pedidos',   label: 'Pedidos del día',   icon: ShoppingCart },
  { id: 'historial', label: 'Historial',         icon: Clock },
  { id: 'clientes',  label: 'Clientes',          icon: Users },
  { id: 'agenda',    label: 'Agenda entregas',   icon: MapPin },
  { id: 'ruta',      label: 'Ruta optimizada',   icon: Route },
  { id: 'costos',    label: 'Panel de costos',   icon: DollarSign },
  { id: 'stock',     label: 'Control stock',     icon: Package },
  { id: 'reportes',  label: 'Reportes',          icon: FileText },
];

export default function Header({ seccion, onNav, onLogout }) {
  const [menuAbierto, setMenuAbierto] = useState(false);

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
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
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
          <div className="flex items-center gap-2">
            <button
              onClick={onLogout}
              className="hidden lg:flex items-center gap-1.5 text-xs text-gray-500 hover:text-white transition-colors px-2 py-1.5 rounded-lg hover:bg-gray-800"
            >
              <LogOut size={13} />
              Salir
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
              {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
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
