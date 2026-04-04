import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Leaf, Lock, User, AlertCircle, Eye, EyeOff } from 'lucide-react';

// Credenciales de acceso
const USUARIOS_VALIDOS = ['Ren', 'Nati'];
const CLAVE_VALIDA = 'huerta2026';

export default function Login({ onLogin }) {
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [mostrarClave, setMostrarClave] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    // Simular delay de autenticación
    setTimeout(() => {
      const isRepartidor = usuario.toLowerCase() === 'repartidor';
      if (isRepartidor) {
        onLogin('repartidor');
      } else if (USUARIOS_VALIDOS.includes(usuario) && clave === CLAVE_VALIDA) {
        onLogin('admin');
      } else {
        setError('Usuario o contraseña incorrectos');
        setCargando(false);
      }
    }, 800);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0f0f] px-4">
      {/* Fondo con gradiente sutil */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-green-500/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center">
              <Leaf size={22} className="text-white" />
            </div>
            <span className="text-2xl font-bold text-white">Huerta Urbana</span>
          </div>
          <p className="text-gray-500 text-sm">Panel de administración</p>
        </div>

        {/* Card de login */}
        <div className="bg-[#1f2937] border border-gray-800 rounded-2xl p-8 shadow-2xl">
          <h1 className="text-lg font-semibold text-white mb-6">Iniciar sesión</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Usuario */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Usuario</label>
              <div className="relative">
                <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={usuario}
                  onChange={e => setUsuario(e.target.value)}
                  placeholder="Usuario"
                  className="w-full bg-[#111827] border border-gray-700 text-white rounded-lg pl-9 pr-4 py-2.5 text-sm transition-all focus:border-green-500"
                  autoFocus
                />
              </div>
            </div>

            {/* Contraseña */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Contraseña</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type={mostrarClave ? "text" : "password"}
                  value={clave}
                  onChange={e => setClave(e.target.value)}
                  placeholder="Contraseña"
                  className="w-full bg-[#111827] border border-gray-700 text-white rounded-lg pl-9 pr-10 py-2.5 text-sm transition-all focus:border-green-500"
                />
                <button
                  type="button"
                  onClick={() => setMostrarClave(!mostrarClave)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {mostrarClave ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-[10px] text-gray-500 mt-1.5 ml-1">
                La contraseña distingue mayúsculas y minúsculas
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            {/* Botón */}
            <button
              type="submit"
              disabled={cargando}
              className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-60 text-white font-semibold rounded-lg py-2.5 text-sm transition-all duration-200 mt-2"
            >
              {cargando ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>

          {/* Hint */}
          <p className="text-center text-xs text-gray-600 mt-4">
            Ren | Nati
          </p>
        </div>

        <p className="text-center text-xs text-gray-700 mt-6">
          Huerta Urbana · Pilar, Buenos Aires
        </p>
      </div>
    </div>
  );
}
