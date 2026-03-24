// =============================================================
// Huerta Urbana Dashboard - App principal
// React + Vite + Tailwind + Recharts + Lucide
// =============================================================

import { useState } from 'react';
import Login from './components/Login';
import Header from './components/Header';
import Resumen from './components/Resumen';
import Graficos from './components/Graficos';
import PedidosDelDia from './components/PedidosDelDia';
import Historial from './components/Historial';
import Clientes from './components/Clientes';
import AgendaEntregas from './components/AgendaEntregas';
import RutaOptimizada from './components/RutaOptimizada';
import PanelCostos from './components/PanelCostos';
import ControlStock from './components/ControlStock';
import Reportes from './components/Reportes';
import IAFlotante from './components/IAFlotante';

// Mapa de secciones del dashboard
const SECCIONES = {
  resumen:   { label: 'Resumen',           componente: Resumen },
  graficos:  { label: 'Gráficos',          componente: Graficos },
  pedidos:   { label: 'Pedidos del día',   componente: PedidosDelDia },
  historial: { label: 'Historial',         componente: Historial },
  clientes:  { label: 'Clientes',         componente: Clientes },
  agenda:    { label: 'Agenda entregas',   componente: AgendaEntregas },
  ruta:      { label: 'Ruta optimizada',  componente: RutaOptimizada },
  costos:    { label: 'Panel de costos',  componente: PanelCostos },
  stock:     { label: 'Control stock',    componente: ControlStock },
  reportes:  { label: 'Reportes',         componente: Reportes },
};

export default function App() {
  const [logueado, setLogueado] = useState(false);
  const [seccion, setSeccion] = useState('resumen');

  // Si no está logueado, mostrar pantalla de login
  if (!logueado) {
    return <Login onLogin={() => setLogueado(true)} />;
  }

  const ComponenteActual = SECCIONES[seccion]?.componente || Resumen;

  return (
    <div className="min-h-screen bg-[#0f0f0f]">
      {/* Header de navegación */}
      <Header
        seccion={seccion}
        onNav={(id) => setSeccion(id)}
        onLogout={() => setLogueado(false)}
      />

      {/* Contenido principal */}
      <main className="pt-14">
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* Key fuerza remount al cambiar sección para animar entrada */}
          <div key={seccion} className="fade-in">
            <ComponenteActual />
          </div>
        </div>
      </main>

      {/* Botón de IA flotante */}
      <IAFlotante />
    </div>
  );
}
