// =============================================================
// Huerta Urbana Dashboard - App principal
// React + Vite + Tailwind + Recharts + Lucide
// =============================================================

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Login from './components/Login';
import Header from './components/Header';
import Graficos from './components/Graficos';
import PedidosDelDia from './components/PedidosDelDia';
import Historial from './components/Historial';
import Clientes from './components/Clientes';
import AgendaEntregas from './components/AgendaEntregas';
import PanelCostos from './components/PanelCostos';
import Finanzas from './components/Finanzas';
import ControlStock from './components/ControlStock';
import Reportes from './components/Reportes';
import IAFlotante from './components/IAFlotante';
import { useGoogleSheets } from './context/GoogleSheetsContext';

// Mapa de secciones del dashboard
const SECCIONES = {
  pedidos:   { label: 'Pedidos del día',   componente: PedidosDelDia },
  agenda:    { label: 'Agenda entregas',   componente: AgendaEntregas },
  finanzas:  { label: 'Finanzas',         componente: Finanzas },
  costos:    { label: 'Panel de costos',  componente: PanelCostos },
  stock:     { label: 'Control stock',    componente: ControlStock },
  clientes:  { label: 'Clientes',         componente: Clientes },
  historial: { label: 'Historial',         componente: Historial },
  graficos:  { label: 'Gráficos',          componente: Graficos },
  reportes:  { label: 'Reportes',         componente: Reportes },
};

export default function App() {
  const { cargarTodo } = useGoogleSheets();
  const [logueado, setLogueado] = useState(() => {
    return localStorage.getItem('huerta_auth_logueado') === 'true';
  });
  const [rol, setRol] = useState(() => {
    return localStorage.getItem('huerta_auth_rol') || 'admin';
  });
  const [usuario, setUsuario] = useState(() => {
    return localStorage.getItem('huerta_auth_usuario') || '';
  });
  const [seccion, setSeccion] = useState('finanzas');

  // Si no está logueado, mostrar pantalla de login
  if (!logueado) {
    return <Login onLogin={(r, u) => { 
      setLogueado(true); 
      setRol(r || 'admin');
      setUsuario(u || '');
      try {
        localStorage.setItem('huerta_auth_logueado', 'true');
        localStorage.setItem('huerta_auth_rol', r || 'admin');
        localStorage.setItem('huerta_auth_usuario', u || '');
      } catch (e) {}
      if (r === 'repartidor') setSeccion('agenda');
      else if (r === 'produccion') setSeccion('stock');
      else setSeccion('finanzas');
      cargarTodo(); // Carga en paralelo: Pedidos, Costos y Stock
    }} />;
  }

  const ComponenteActual = SECCIONES[seccion]?.componente || Finanzas;

  return (
    <div className="min-h-screen bg-[#0f0f0f]">
      {/* Header de navegación */}
      <Header
        seccion={seccion}
        onNav={(id) => setSeccion(id)}
        onLogout={() => { 
          setLogueado(false); 
          setSeccion('finanzas'); 
          setUsuario(''); 
          try {
            localStorage.removeItem('huerta_auth_logueado');
            localStorage.removeItem('huerta_auth_rol');
            localStorage.removeItem('huerta_auth_usuario');
          } catch (e) {}
        }}
        rol={rol}
        usuario={usuario}
      />

      {/* Contenido principal */}
      <main className="pt-14">
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* Key fuerza remount al cambiar sección para animar entrada */}
          <div key={seccion} className="fade-in">
            <ComponenteActual rol={rol} usuario={usuario} />
          </div>
        </div>
      </main>

      {/* Botón de IA flotante (Oculto para repartidores) */}
      {rol === 'admin' && <IAFlotante />}
    </div>
  );
}
