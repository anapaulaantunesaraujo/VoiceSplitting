import React, { useState, lazy, Suspense } from 'react';
import * as Tone from 'tone';

// Dynamic Import via React.lazy: Vite bundle chunking ensures Tone.js audio modules & MainApp components
// are NOT loaded/evaluated until the user explicitly interacts with the entrance button.
const MainApp = lazy(() => import('./MainApp'));

export const App: React.FC = () => {
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
      <div className="fixed inset-0 z-50 bg-[#09090c] flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-[#141418] border border-indigo-500/30 p-8 rounded-3xl shadow-2xl flex flex-col items-center">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-4xl shadow-xl shadow-indigo-500/20 mb-6">
            🎙️
          </div>

          <h1 className="text-2xl font-black text-white tracking-tight mb-2">
            Voice<span className="text-indigo-400 font-light">Splitting</span> Studio
          </h1>

          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            Bem-vindo ao seu estúdio de separação vocal e treino de afinação com inteligência artificial.
            Clique abaixo para inicializar o motor de áudio e acessar o aplicativo.
          </p>

          <button
            onClick={iniciarMotorDeAudio}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-2xl shadow-lg shadow-indigo-600/40 transition-all transform active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>🚀 Entrar no Estúdio</span>
          </button>

          <span className="text-[10px] text-slate-500 mt-4 font-mono">
            Web Audio API Guard • Tone.js v15 • Lazy Chunk Isolation
          </span>
        </div>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 bg-[#09090c] text-white flex flex-col items-center justify-center p-6">
          <div className="pulse-loader-ring mb-4" />
          <p className="text-sm font-bold text-indigo-400">Carregando módulos de áudio e estúdio...</p>
        </div>
      }
    >
      <MainApp />
    </Suspense>
  );
};

export default App;
