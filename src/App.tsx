import React, { useState, lazy, Suspense } from 'react';
import * as Tone from 'tone';
import { TrebleClefIcon } from './components/TrebleClefIcon';
import { GoogleLoginButton, UserProfile } from './components/GoogleLoginButton';

const MainApp = lazy(() => import('./MainApp'));

export const App: React.FC = () => {
  const [, setUserProfile] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('voicesplit_user_profile');
    return saved ? JSON.parse(saved) : null;
  });

  const [audioPronto, setAudioPronto] = useState<boolean>(() => {
    return typeof window !== 'undefined' && Tone.context && Tone.context.state === 'running';
  });

  const iniciarMotorDeAudio = async () => {
    try {
      if (Tone.context && Tone.context.state !== 'running') {
        await Tone.start();
      }
    } catch (e) {
      console.warn('AudioContext aguardando gesto do usuário:', e);
    } finally {
      setAudioPronto(true);
    }
  };

  if (!audioPronto) {
    return (
      <div className="fixed inset-0 z-50 bg-[#0d0e12] flex items-center justify-center p-6 sm:p-10 md:p-12 overflow-y-auto">
        {/* Container matching Moises Login Split Layout (Screenshot 1) with generous breathing room */}
        <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 bg-[#121318] border border-[#232530] rounded-[32px] md:rounded-[40px] overflow-hidden shadow-2xl min-h-[640px]">
          {/* LEFT COLUMN (Desktop Showcase Card with Studio/Musician atmosphere) */}
          <div className="hidden md:flex flex-col justify-between p-10 lg:p-14 bg-gradient-to-b from-[#181a24] to-[#0a0b0e] border-r border-[#232530] relative overflow-hidden">
            {/* Visual ambient glows */}
            <div className="absolute -top-20 -left-20 w-72 h-72 bg-[#00c2cb]/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -right-20 w-72 h-72 bg-[#2563eb]/10 rounded-full blur-3xl pointer-events-none" />

            {/* Top brand */}
            <div className="flex items-center gap-3.5 z-10 pb-4">
              <div className="w-11 h-11 rounded-2xl bg-[#1c2230] border border-[#2b354f] flex items-center justify-center text-[#00c2cb] shadow-sm">
                <TrebleClefIcon className="w-6 h-6" color="#00c2cb" />
              </div>
              <span className="font-black text-white text-lg tracking-tight">
                Treino <span className="text-[#00c2cb]">Vocal</span>
              </span>
            </div>

            {/* Middle decorative graphic */}
            <div className="my-auto py-8 z-10 text-center space-y-5">
              <div className="w-36 h-36 mx-auto rounded-3xl bg-[#1c1f2b] border border-[#272b38] flex items-center justify-center text-6xl text-[#00c2cb] shadow-xl shadow-cyan-950/20 mb-4">
                🎙️
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight leading-snug">
                Ensaie com precisão de estúdio
              </h2>
              <p className="text-sm text-[#9ca3af] max-w-sm mx-auto leading-relaxed">
                Isole vozes, mude o tom sem perder qualidade e treine afinação em tempo real com IA.
              </p>
            </div>

            {/* Bottom Testimonial Box (matching Screenshot 1) */}
            <div className="bg-[#14161f]/90 backdrop-blur-sm border border-[#232530] rounded-3xl p-6 lg:p-7 z-10 text-left space-y-4 mt-4">
              <p className="text-xs sm:text-sm text-[#cbd5e1] leading-relaxed italic">
                "Descobri o Divisão Vocal e foi um divisor de águas para mim. Ele me ajudou a economizar muito tempo nos ensaios e no aprendizado das vozes do coral."
              </p>
              <div className="flex items-center gap-3 pt-2">
                <div className="w-8 h-8 rounded-full bg-[#00c2cb] text-black font-black text-xs flex items-center justify-center shadow-sm">
                  M
                </div>
                <div>
                  <span className="text-xs font-bold text-white block leading-snug">Músico de Ensaio</span>
                  <span className="text-[11px] text-[#71717a] leading-snug">Vocal & Harmonia</span>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN (Login Action Panel matching Screenshot 1) */}
          <div className="flex flex-col justify-center p-8 sm:p-14 lg:p-16 space-y-10 text-center">
            {/* Moises style brand logo on right */}
            <div className="flex flex-col items-center space-y-4">
              <div className="w-20 h-20 rounded-3xl bg-[#1c2230] border border-[#2b354f] flex items-center justify-center text-[#00c2cb] shadow-xl shadow-cyan-950/30">
                <TrebleClefIcon className="w-11 h-11" color="#00c2cb" />
              </div>
              <span className="font-black text-white text-3xl tracking-tight">
                Divisão <span className="text-[#00c2cb]">Vocal</span>
              </span>
            </div>

            {/* Heading */}
            <div className="space-y-3">
              <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-snug">
                Que bom ter você de volta
              </h3>
              <p className="text-sm sm:text-base text-[#71717a] leading-relaxed max-w-sm mx-auto">
                Acesse seu repertório e ferramentas de ensaio
              </p>
            </div>

            {/* Social Login Buttons (Google + Options) */}
            <div className="w-full flex flex-col items-center gap-5 pt-2">
              <GoogleLoginButton
                variant="pill"
                onLoginSuccess={(user) => {
                  setUserProfile(user);
                  iniciarMotorDeAudio();
                }}
                onLogout={() => setUserProfile(null)}
              />

              {/* Separador Visual */}
              <div className="w-full flex items-center gap-4 my-2">
                <div className="flex-1 h-px bg-[#232530]" />
                <span className="text-xs uppercase tracking-wider text-[#71717a] font-bold">ou</span>
                <div className="flex-1 h-px bg-[#232530]" />
              </div>

              {/* Modo Local (Continuar sem login) */}
              <button
                onClick={iniciarMotorDeAudio}
                className="w-full py-4 px-6 bg-[#181a20] hover:bg-[#20222a] active:bg-[#262933] text-white border border-[#272b38] rounded-2xl text-xs sm:text-sm font-black transition-all shadow-md flex items-center justify-center gap-3 cursor-pointer min-h-[52px]"
              >
                <span className="text-lg">🎧</span>
                <span>Continuar no Modo Local (Offline)</span>
              </button>

              <p className="text-xs text-[#71717a] leading-relaxed pt-3 max-w-xs mx-auto">
                Suas músicas são salvas no navegador (IndexedDB) e sincronizadas com seu Google Drive quando conectado.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 bg-[#0d0e12] text-white flex flex-col items-center justify-center p-6">
          <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-[#00c2cb] rounded-full animate-spin mb-4" />
          <p className="text-xs font-bold text-[#9ca3af]">Carregando o Divisão Vocal...</p>
        </div>
      }
    >
      <MainApp />
    </Suspense>
  );
};

export default App;
