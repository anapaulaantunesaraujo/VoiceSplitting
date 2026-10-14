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
      if (Tone.context.state !== 'running') {
        await Tone.start();
      }
      setAudioPronto(true);
    } catch (e) {
      console.error(e);
      setAudioPronto(true);
    }
  };

  if (!audioPronto) {
    return (
      <div className="fixed inset-0 z-50 bg-[#000000] flex flex-col items-center justify-center p-6 text-center overflow-hidden">
        {/* Minimalist Pure Login Screen: Logo + App Name + Google Login Pill Button */}
        <div className="flex flex-col items-center max-w-sm w-full space-y-10 my-auto">
          {/* Logo do App */}
          <div className="w-24 h-24 rounded-3xl bg-[#1e1e1e] border border-[#2e2e2e] flex items-center justify-center text-[#2563eb] shadow-2xl shadow-blue-900/20 transition-transform hover:scale-105 duration-300">
            <TrebleClefIcon className="w-14 h-14" color="#2563eb" />
          </div>

          {/* Nome do App */}
          <h1 className="text-4xl font-black text-white tracking-tight">
            Treino <span className="text-[#3b82f6]">Vocal</span>
          </h1>

          {/* Botão de Logar com o Google (Pill Variant matching user's image) */}
          <div className="w-full flex justify-center pt-4">
            <GoogleLoginButton
              variant="pill"
              onClickBeforeLogin={iniciarMotorDeAudio}
              onLoginSuccess={(user) => {
                setUserProfile(user);
                iniciarMotorDeAudio();
              }}
              onLogout={() => setUserProfile(null)}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 bg-[#000000] text-white flex flex-col items-center justify-center p-6">
          <div className="pulse-loader-ring mb-4" />
          <p className="text-sm font-semibold text-[#a3a3a3]">Inicializando o Treino Vocal...</p>
        </div>
      }
    >
      <MainApp />
    </Suspense>
  );
};

export default App;
