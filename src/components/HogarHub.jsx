import { useState } from 'react';
import { Home, ShieldCheck, Lock, Key, X, ArrowLeft, AlertCircle, RefreshCw } from 'lucide-react';
import Hogar from './Hogar';
import HogarAdmin from './HogarAdmin';
import { 
  getAdminPinSession, setAdminPinSession, 
  getHogarPinSession, setHogarPinSession,
  apiVerificarAdminPin, apiVerificarHogarPin 
} from '../utils/mercaderiaApi';

export default function HogarHub({ standalone = false }) {
  // modo: null (elección) | 'consumo' (pantalla Hogar) | 'admin' (HogarAdmin)
  const [modo, setModo] = useState(null);

  // Estados de modales para pedir PIN
  const [modalPinAdmin, setModalPinAdmin] = useState(false);
  const [modalPinHogar, setModalPinHogar] = useState(false);

  const [pinInput, setPinInput] = useState('');
  const [verificando, setVerificando] = useState(false);
  const [errorPin, setErrorPin] = useState(null);

  // Manejar clic en "Administrador"
  const handleElegirAdmin = () => {
    setErrorPin(null);
    setPinInput('');
    if (getAdminPinSession()) {
      setModo('admin');
      return;
    }
    setModalPinAdmin(true);
  };

  // Manejar clic en "Hogar" (Consumo)
  const handleElegirHogar = () => {
    setErrorPin(null);
    setPinInput('');
    if (getHogarPinSession()) {
      setModo('consumo');
      return;
    }
    setModalPinHogar(true);
  };

  // Verificar PIN Admin (15 min)
  const handleSubmitPinAdmin = async (e) => {
    e.preventDefault();
    if (!pinInput.trim()) return;

    setVerificando(true);
    setErrorPin(null);

    try {
      const res = await apiVerificarAdminPin(pinInput.trim());
      if (res && res.ok) {
        setAdminPinSession(pinInput.trim());
        setModalPinAdmin(false);
        setPinInput('');
        setModo('admin');
      } else {
        setErrorPin(res?.error || 'PIN de administrador incorrecto.');
      }
    } catch (err) {
      setErrorPin(err.message || 'Error de conexión.');
    } finally {
      setVerificando(false);
    }
  };

  // Verificar PIN Hogar (5 min)
  const handleSubmitPinHogar = async (e) => {
    e.preventDefault();
    if (!pinInput.trim()) return;

    setVerificando(true);
    setErrorPin(null);

    try {
      const res = await apiVerificarHogarPin(pinInput.trim());
      if (res && res.ok) {
        setHogarPinSession(pinInput.trim());
        setModalPinHogar(false);
        setPinInput('');
        setModo('consumo');
      } else {
        setErrorPin(res?.error || 'PIN del hogar incorrecto.');
      }
    } catch (err) {
      setErrorPin(err.message || 'Error de conexión.');
    } finally {
      setVerificando(false);
    }
  };

  // Renderizar vistas hijas si se eligió un modo
  if (modo === 'admin') {
    return <HogarAdmin onVolverEleccion={() => setModo(null)} />;
  }

  if (modo === 'consumo') {
    return <Hogar standalone={standalone} onVolverEleccion={() => setModo(null)} />;
  }

  // Pantalla de Elección: dos botones grandes
  return (
    <div className={`min-h-screen bg-[#0a0a0a] text-white flex flex-col justify-center items-center ${standalone ? 'p-4 sm:p-6' : 'pt-16 pb-20 px-4 sm:px-6 lg:px-8'}`}>
      <div className="w-full max-w-2xl space-y-8 animate-in fade-in duration-300">
        {/* Cabecera */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-3xl bg-green-500/10 border border-green-500/30 flex items-center justify-center text-green-400 mx-auto shadow-lg shadow-green-500/5">
            <Home size={32} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Hogar Huerta Urbana
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 max-w-md mx-auto">
            Elegí cómo querés ingresar al módulo del hogar
          </p>
        </div>

        {/* Dos Botones Grandes de Elección */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Tarjeta / Botón HOGAR (Consumo familiar) */}
          <button
            type="button"
            onClick={handleElegirHogar}
            className="group relative bg-[#121212] hover:bg-[#181818] border border-gray-800 hover:border-green-500/60 rounded-3xl p-6 sm:p-8 text-left transition-all duration-200 cursor-pointer shadow-xl hover:shadow-2xl hover:shadow-green-500/10 flex flex-col justify-between space-y-6"
          >
            <div className="space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-green-500/10 border border-green-500/30 flex items-center justify-center text-green-400 group-hover:scale-110 transition-transform">
                <Home size={28} />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-green-400 block mb-1">
                  Acceso Familiar
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Hogar
                </h2>
                <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                  Consumo familiar al costo. Pesá tus productos en la balanza o escaneá almacén y confirmá tu consumo.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-800/80 flex items-center justify-between text-xs font-bold text-green-400">
              <span>Ingresar al Hogar</span>
              <span className="text-gray-500 group-hover:translate-x-1 transition-transform">→</span>
            </div>
          </button>

          {/* Tarjeta / Botón ADMINISTRADOR */}
          <button
            type="button"
            onClick={handleElegirAdmin}
            className="group relative bg-[#121212] hover:bg-[#181818] border border-gray-800 hover:border-amber-500/60 rounded-3xl p-6 sm:p-8 text-left transition-all duration-200 cursor-pointer shadow-xl hover:shadow-2xl hover:shadow-amber-500/10 flex flex-col justify-between space-y-6"
          >
            <div className="space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                <ShieldCheck size={28} />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 block mb-1">
                  Control y Saldo
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Administrador
                </h2>
                <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                  Gestión y recarga de saldo familiar, auditoría de consumos y configuración de claves de seguridad.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-800/80 flex items-center justify-between text-xs font-bold text-amber-400">
              <span>Administrar Hogar</span>
              <span className="text-gray-500 group-hover:translate-x-1 transition-transform">→</span>
            </div>
          </button>
        </div>

        {/* Nota al pie */}
        <p className="text-center text-[11px] text-gray-600">
          La sesión de Administrador dura 15 minutos y la de Hogar dura 5 minutos sin uso.
        </p>
      </div>

      {/* Modal: Pedir PIN Administrador */}
      {modalPinAdmin && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-gray-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h2 className="text-sm font-black uppercase text-white flex items-center gap-2">
                <ShieldCheck size={16} className="text-amber-400" /> PIN de Administrador
              </h2>
              <button 
                onClick={() => { setModalPinAdmin(false); setErrorPin(null); }} 
                className="text-gray-400 hover:text-white cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitPinAdmin} className="space-y-4">
              <div>
                <label className="block text-gray-400 text-xs font-bold uppercase mb-2">
                  Ingresá el PIN de Administrador
                </label>
                <input
                  type="password"
                  autoFocus
                  placeholder="PIN Admin"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  className="w-full bg-black border border-gray-700 focus:border-amber-400 rounded-2xl px-4 py-3 text-center text-2xl font-mono tracking-widest text-white outline-none"
                  required
                />
              </div>

              {errorPin && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs text-center font-bold">
                  {errorPin}
                </div>
              )}

              <button
                type="submit"
                disabled={verificando || !pinInput.trim()}
                className="w-full py-3 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-black font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-lg shadow-amber-500/20 text-xs"
              >
                {verificando ? 'Verificando...' : 'Entrar como Administrador'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Pedir PIN Hogar */}
      {modalPinHogar && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-gray-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h2 className="text-sm font-black uppercase text-white flex items-center gap-2">
                <Home size={16} className="text-green-400" /> PIN del Hogar
              </h2>
              <button 
                onClick={() => { setModalPinHogar(false); setErrorPin(null); }} 
                className="text-gray-400 hover:text-white cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitPinHogar} className="space-y-4">
              <div>
                <label className="block text-gray-400 text-xs font-bold uppercase mb-2">
                  Ingresá el PIN del Hogar
                </label>
                <input
                  type="password"
                  autoFocus
                  placeholder="PIN Hogar"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  className="w-full bg-black border border-gray-700 focus:border-green-500 rounded-2xl px-4 py-3 text-center text-2xl font-mono tracking-widest text-white outline-none"
                  required
                />
              </div>

              {errorPin && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs text-center font-bold">
                  {errorPin}
                </div>
              )}

              <button
                type="submit"
                disabled={verificando || !pinInput.trim()}
                className="w-full py-3 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-lg shadow-green-500/20 text-xs"
              >
                {verificando ? 'Verificando...' : 'Entrar al Hogar'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
