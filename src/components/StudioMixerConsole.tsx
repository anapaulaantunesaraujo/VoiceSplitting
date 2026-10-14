import React from 'react';
import { StemChannelId, StemChannelState } from '../hooks/useMultiStemMixer';
import { PitchInfo } from '../hooks/useVocalTuner';

interface StudioMixerConsoleProps {
  channels: Record<StemChannelId, StemChannelState>;
  onVolumeChange: (id: StemChannelId, volume: number) => void;
  onToggleMute: (id: StemChannelId) => void;
  onToggleSolo: (id: StemChannelId) => void;
  masterVolume: number;
  onMasterVolumeChange: (vol: number) => void;
  pitchSemitones: number;
  onPitchChange: (semitones: number) => void;
  isPlaying: boolean;
  onPlayPause: () => void;
  onStop: () => void;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  isListening: boolean;
  onToggleTuner: () => void;
  userPitch: PitchInfo | null;
  targetPitch: PitchInfo | null;
  pitchStreak: number;
  onBackToRepertoire: () => void;
}

export const StudioMixerConsole: React.FC<StudioMixerConsoleProps> = ({
  channels,
  onVolumeChange,
  onToggleMute,
  onToggleSolo,
  masterVolume,
  onMasterVolumeChange,
  pitchSemitones,
  onPitchChange,
  isPlaying,
  onPlayPause,
  onStop,
  currentTime,
  duration,
  onSeek,
  isListening,
  onToggleTuner,
  userPitch,
  targetPitch,
  pitchStreak,
  onBackToRepertoire
}) => {
  const channelList: StemChannelId[] = ['soprano', 'contralto', 'tenor', 'bass', 'accompaniment'];

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  let inTune = false;
  if (userPitch && targetPitch && targetPitch.frequency > 0) {
    const centsDiff = 1200 * (Math.log(userPitch.frequency / targetPitch.frequency) / Math.log(2));
    if (Math.abs(centsDiff) <= 15) inTune = true;
  } else if (userPitch) {
    if (Math.abs(userPitch.cents) <= 15) inTune = true;
  }

  return (
    <div className="studio-mixer-wrapper bg-[#121212] text-white rounded-3xl p-6 border border-[#2e2e2e] shadow-2xl pb-36 space-y-6">
      {/* Top Console Bar */}
      <div className="flex items-center justify-between pb-4 border-b border-[#2e2e2e]">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToRepertoire}
            className="px-3.5 py-2 bg-[#1e1e1e] hover:bg-[#262626] text-white rounded-xl text-xs font-bold transition-all border border-[#2e2e2e] flex items-center gap-2 cursor-pointer"
          >
            ⬅️ Voltar ao Repertório
          </button>
          <div>
            <h2 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
              🎛️ Mesa de Som (Treino Vocal)
            </h2>
            <p className="text-xs text-[#a3a3a3] font-medium">
              Controle de canais isolados, botões Focar / Silenciar e Afinador Integrado
            </p>
          </div>
        </div>
      </div>

      {/* Main Console Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Vertical Channel Strips */}
        <div className="lg:col-span-3 bg-[#0a0a0a] p-4 rounded-2xl border border-[#2e2e2e] grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {channelList.map((id) => {
            const ch = channels[id];
            const isMuted = ch.isMuted;
            const isSolo = ch.isSolo;

            return (
              <div
                key={id}
                className={`channel-strip-card flex flex-col items-center p-3 rounded-xl border transition-all ${
                  isSolo
                    ? 'bg-[#1e1e1e] border-[#2563eb] ring-2 ring-[#2563eb]/40 shadow-lg shadow-blue-900/20'
                    : isMuted
                    ? 'bg-[#121212] border-[#2e2e2e] opacity-40'
                    : 'bg-[#121212] border-[#2e2e2e] hover:border-[#404040]'
                }`}
              >
                <div className="w-full text-center pb-2 mb-2 border-b border-[#2e2e2e]">
                  <span className="text-xs font-extrabold text-white uppercase block truncate" style={{ color: ch.color }}>
                    {ch.label}
                  </span>
                </div>

                <div className="flex flex-col gap-2 w-full mb-4">
                  <button
                    onClick={() => onToggleSolo(id)}
                    className={`w-full py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                      isSolo
                        ? 'bg-[#2563eb] text-white shadow-md shadow-blue-600/30'
                        : 'bg-[#1e1e1e] text-[#a3a3a3] hover:bg-[#262626] hover:text-white border border-[#2e2e2e]'
                    }`}
                  >
                    🎯 Focar
                  </button>

                  <button
                    onClick={() => onToggleMute(id)}
                    className={`w-full py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                      isMuted
                        ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                        : 'bg-[#1e1e1e] text-[#a3a3a3] hover:bg-[#262626] hover:text-white border border-[#2e2e2e]'
                    }`}
                  >
                    🔇 Silenciar
                  </button>
                </div>

                <div className="flex items-center justify-center gap-3 h-44 py-2 relative w-full">
                  <div className="fader-rotated-wrapper flex items-center justify-center h-40 w-10">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={isMuted ? 0 : ch.volume}
                      onChange={(e) => onVolumeChange(id, parseFloat(e.target.value))}
                      className="daw-fader-input"
                      style={{ accentColor: ch.color }}
                    />
                  </div>

                  <div className="vu-meter-bar w-2.5 h-36 bg-[#000000] border border-[#2e2e2e] rounded-full flex flex-col justify-end overflow-hidden p-0.5">
                    <div
                      className="vu-meter-fill w-full rounded-full transition-all duration-75"
                      style={{
                        height: isMuted ? '0%' : `${Math.round(ch.volume * 100)}%`,
                        background: isMuted
                          ? 'transparent'
                          : isSolo
                          ? 'linear-gradient(to top, #10b981 60%, #3b82f6 85%, #ec4899 100%)'
                          : 'linear-gradient(to top, #2563eb 70%, #3b82f6 100%)'
                      }}
                    />
                  </div>
                </div>

                <div className="mt-3 text-center w-full">
                  <span className="text-[10px] font-mono font-bold text-white bg-[#000000] px-2 py-1 rounded border border-[#2e2e2e] block">
                    {isMuted ? 'MUTED' : `${Math.round(ch.volume * 100)}%`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Master & Tuner Section */}
        <div className="lg:col-span-1 bg-[#0a0a0a] p-4 rounded-2xl border border-[#2e2e2e] flex flex-col justify-between">
          <div className="bg-[#121212] border border-[#2e2e2e] rounded-2xl p-4 shadow-inner text-center">
            <h3 className="text-xs font-bold text-[#a3a3a3] uppercase tracking-widest mb-3 flex items-center justify-center gap-1.5">
              <span>🎤</span> Afinador de Voz
            </h3>

            <div className="flex items-center justify-around my-3 py-2 bg-[#000000] rounded-xl border border-[#2e2e2e]">
              <div>
                <span className="text-[9px] uppercase font-bold text-[#737373] block">Referência</span>
                <span className="text-base font-black text-[#2563eb]">
                  {targetPitch ? targetPitch.note : 'Focar Voz'}
                </span>
              </div>
              <div className="h-6 w-px bg-[#2e2e2e]" />
              <div>
                <span className="text-[9px] uppercase font-bold text-[#737373] block">Sua Voz</span>
                <span className={`text-base font-black ${inTune ? 'text-emerald-400 animate-pulse' : 'text-white'}`}>
                  {userPitch ? userPitch.note : '--'}
                </span>
              </div>
            </div>

            {inTune && (
              <div className="my-2 py-1 px-2 bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 text-[11px] font-bold rounded-lg animate-pulse">
                ✨ Afinação Perfeita! (+{pitchStreak})
              </div>
            )}

            <button
              onClick={onToggleTuner}
              className={`w-full py-2.5 mt-2 rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer ${
                isListening
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white animate-pulse'
                  : 'bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-blue-900/40'
              }`}
            >
              {isListening ? '🛑 Desligar Microfone' : '🎙️ Ativar Microfone'}
            </button>
          </div>

          <div className="bg-[#121212] border border-[#2e2e2e] p-4 rounded-2xl flex flex-col items-center">
            <span className="text-xs font-extrabold text-white uppercase tracking-wider mb-2">
              🔊 Volume Geral
            </span>
            <div className="h-28 flex items-center justify-center my-2">
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={masterVolume}
                onChange={(e) => onMasterVolumeChange(parseFloat(e.target.value))}
                className="daw-fader-input"
                style={{ accentColor: '#2563eb' }}
              />
            </div>
            <span className="text-xs font-mono font-bold text-[#3b82f6] mt-1">
              {Math.round(masterVolume * 100)}%
            </span>
          </div>
        </div>
      </div>

      {/* Dock Transport */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#121212]/95 backdrop-blur-md border-t border-[#2e2e2e] p-4 z-40 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 max-w-6xl mx-auto px-6 rounded-t-3xl">
        <div className="flex items-center gap-3">
          <button
            onClick={onPlayPause}
            className="w-12 h-12 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold flex items-center justify-center shadow-lg shadow-blue-600/30 transition-all active:scale-95 text-lg cursor-pointer"
          >
            {isPlaying ? '⏸️' : '▶️'}
          </button>
          <button
            onClick={onStop}
            className="w-10 h-10 rounded-xl bg-[#1e1e1e] hover:bg-[#262626] text-white font-bold flex items-center justify-center border border-[#2e2e2e] transition-all text-sm cursor-pointer"
            title="Parar"
          >
            ⏹️
          </button>
          <div className="text-xs font-mono font-bold text-[#3b82f6] bg-[#000000] px-3 py-2 rounded-lg border border-[#2e2e2e]">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>

        <div className="flex-1 w-full max-w-xl mx-2">
          <input
            type="range"
            min="0"
            max={duration || 100}
            step="0.1"
            value={currentTime}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            className="w-full h-2 bg-[#1e1e1e] rounded-lg appearance-none cursor-pointer accent-[#2563eb]"
          />
        </div>

        <div className="flex items-center gap-3 bg-[#0a0a0a] border border-[#2e2e2e] px-3.5 py-2 rounded-xl">
          <span className="text-xs font-bold text-[#a3a3a3]">Mudar Tom:</span>
          <button
            onClick={() => onPitchChange(Math.max(pitchSemitones - 1, -6))}
            className="w-7 h-7 rounded-lg bg-[#1e1e1e] hover:bg-[#262626] text-white font-black text-xs border border-[#2e2e2e] cursor-pointer"
          >
            -
          </button>
          <span className="text-xs font-mono font-bold text-white min-w-[32px] text-center">
            {pitchSemitones > 0 ? `+${pitchSemitones}` : pitchSemitones} ST
          </span>
          <button
            onClick={() => onPitchChange(Math.min(pitchSemitones + 1, 6))}
            className="w-7 h-7 rounded-lg bg-[#1e1e1e] hover:bg-[#262626] text-white font-black text-xs border border-[#2e2e2e] cursor-pointer"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
};

export default StudioMixerConsole;
