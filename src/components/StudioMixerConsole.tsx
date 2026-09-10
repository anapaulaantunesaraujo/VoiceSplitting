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
  // Tuner Props
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

  // Positive Pitch Validation Check
  let inTune = false;
  if (userPitch && targetPitch && targetPitch.frequency > 0) {
    const centsDiff = 1200 * (Math.log(userPitch.frequency / targetPitch.frequency) / Math.log(2));
    if (Math.abs(centsDiff) <= 15) inTune = true;
  } else if (userPitch) {
    if (Math.abs(userPitch.cents) <= 15) inTune = true;
  }

  return (
    <div className="studio-mixer-wrapper bg-[#121212] text-slate-200 rounded-3xl p-6 border border-slate-800 shadow-2xl pb-32">
      {/* Top Console Navigation Bar */}
      <div className="flex items-center justify-between pb-6 mb-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToRepertoire}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all border border-slate-700 flex items-center gap-2"
          >
            ⬅️ Voltar ao Repertório
          </button>
          <div>
            <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
              🎛️ Mesa de Som (Mixer DAW REAPER)
            </h2>
            <p className="text-xs text-slate-400 font-medium">
              Controle de canais isolados, botões Focar / Silenciar e Afinador Integrado
            </p>
          </div>
        </div>
      </div>

      {/* Console Main Body Grid (ChannelStrips + Master & Digital Tuner Panel) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Section: 5 Vertical Channel Strips (Span 3 cols) */}
        <div className="lg:col-span-3 bg-[#1a1a1a] p-5 rounded-2xl border border-slate-800 shadow-inner grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {channelList.map((id) => {
            const ch = channels[id];
            const isMuted = ch.isMuted;
            const isSolo = ch.isSolo;

            return (
              <div
                key={id}
                className={`channel-strip-card flex flex-col items-center p-3 rounded-xl border transition-all ${
                  isSolo
                    ? 'bg-[#262010] border-amber-500/60 shadow-lg shadow-amber-500/10'
                    : isMuted
                    ? 'bg-[#181818] border-slate-800 opacity-50'
                    : 'bg-[#222222] border-slate-700/60 hover:border-slate-600'
                }`}
              >
                {/* 1. Voice Title Header */}
                <div className="w-full text-center pb-2 mb-2 border-b border-slate-800">
                  <span className="text-xs font-black text-slate-200 block truncate" style={{ color: ch.color }}>
                    {ch.label}
                  </span>
                </div>

                {/* 2. Didactic Action Buttons: "Focar" (Solo) & "Silenciar" (Mute) */}
                <div className="flex flex-col gap-2 w-full mb-4">
                  <button
                    onClick={() => onToggleSolo(id)}
                    className={`w-full py-1.5 rounded-lg text-[11px] font-black tracking-wider uppercase transition-all shadow-sm ${
                      isSolo
                        ? 'bg-amber-500 text-black font-extrabold shadow-amber-500/30 animate-pulse'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 border border-slate-700'
                    }`}
                    title="Focar nesta voz (Solo)"
                  >
                    🎯 Focar
                  </button>

                  <button
                    onClick={() => onToggleMute(id)}
                    className={`w-full py-1.5 rounded-lg text-[11px] font-black tracking-wider uppercase transition-all shadow-sm ${
                      isMuted
                        ? 'bg-rose-600 text-white font-extrabold shadow-rose-600/30'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 border border-slate-700'
                    }`}
                    title="Silenciar esta voz (Mute)"
                  >
                    🔇 Silenciar
                  </button>
                </div>

                {/* 3. Studio Vertical Fader & VU Meter Bar */}
                <div className="flex items-center justify-center gap-3 h-48 py-2 relative w-full">
                  {/* Rotated HTML5 Fader Range Input */}
                  <div className="fader-rotated-wrapper flex items-center justify-center h-44 w-12">
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

                  {/* VU Meter LED Level Bar */}
                  <div className="vu-meter-bar w-2.5 h-40 bg-slate-900 border border-slate-800 rounded-full flex flex-col justify-end overflow-hidden p-0.5">
                    <div
                      className="vu-meter-fill w-full rounded-full transition-all duration-75"
                      style={{
                        height: isMuted ? '0%' : `${Math.round(ch.volume * 100)}%`,
                        background: isMuted
                          ? 'transparent'
                          : isSolo
                          ? 'linear-gradient(to top, #22c55e 60%, #eab308 85%, #ef4444 100%)'
                          : 'linear-gradient(to top, #3b82f6 70%, #60a5fa 100%)'
                      }}
                    />
                  </div>
                </div>

                {/* 4. Volume Percentage Indicator */}
                <div className="mt-3 text-center w-full">
                  <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-900 px-2 py-1 rounded border border-slate-800 block">
                    {isMuted ? 'MUTED' : `${Math.round(ch.volume * 100)}%`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Section: Digital Tuner Panel & Master Section */}
        <div className="lg:col-span-1 bg-[#1a1a1a] p-5 rounded-2xl border border-slate-800 flex flex-col justify-between">
          {/* Black Digital Vocal Tuner Panel */}
          <div className="bg-black border border-slate-800 rounded-2xl p-4 mb-4 shadow-inner text-center">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center justify-center gap-1.5">
              <span>🎤</span> Afinador de Voz
            </h3>

            {/* Target & User Note Display */}
            <div className="flex items-center justify-around my-3 py-2 bg-slate-950 rounded-xl border border-slate-900">
              <div>
                <span className="text-[9px] uppercase font-bold text-slate-500 block">Referência</span>
                <span className="text-base font-black text-amber-400">
                  {targetPitch ? targetPitch.note : 'Focar Voz'}
                </span>
              </div>
              <div className="h-6 w-px bg-slate-800" />
              <div>
                <span className="text-[9px] uppercase font-bold text-slate-500 block">Sua Voz</span>
                <span className={`text-base font-black ${inTune ? 'text-emerald-400 animate-pulse' : 'text-slate-200'}`}>
                  {userPitch ? userPitch.note : '--'}
                </span>
              </div>
            </div>

            {/* Positive Validation Feedback */}
            {inTune && (
              <div className="my-2 py-1 px-2 bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 text-[11px] font-bold rounded-lg animate-pulse">
                ✨ Afinação Perfeita! (+{pitchStreak})
              </div>
            )}

            {/* Activate Microphone Button */}
            <button
              onClick={onToggleTuner}
              className={`w-full py-2.5 mt-2 rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 ${
                isListening
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white animate-pulse shadow-emerald-900/50'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/40'
              }`}
            >
              {isListening ? '🛑 Desligar Microfone' : '🎙️ Ativar Microfone'}
            </button>
          </div>

          {/* Volume Geral (Master) Fader */}
          <div className="bg-[#222222] border border-slate-800 p-4 rounded-2xl flex flex-col items-center">
            <span className="text-xs font-black text-slate-300 uppercase tracking-wider mb-2">
              🔊 Volume Geral
            </span>
            <div className="h-32 flex items-center justify-center my-2">
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={masterVolume}
                onChange={(e) => onMasterVolumeChange(parseFloat(e.target.value))}
                className="daw-fader-input"
                style={{ accentColor: '#6366f1' }}
              />
            </div>
            <span className="text-xs font-mono font-bold text-indigo-400 mt-1">
              {Math.round(masterVolume * 100)}%
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Horizontal Transport Dock (Fixed) */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#161616]/95 backdrop-blur-md border-t border-slate-800 p-4 z-40 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 max-w-6xl mx-auto px-6 rounded-t-3xl">
        {/* Playback Transport Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={onPlayPause}
            className="w-12 h-12 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center justify-center shadow-lg shadow-indigo-600/30 transition-all active:scale-95 text-lg"
          >
            {isPlaying ? '⏸️' : '▶️'}
          </button>
          <button
            onClick={onStop}
            className="w-10 h-10 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold flex items-center justify-center border border-slate-700 transition-all text-sm"
            title="Parar"
          >
            ⏹️
          </button>
          <div className="text-xs font-mono font-bold text-slate-300 ml-1">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>

        {/* Scrubbing Timeline */}
        <div className="flex-1 w-full max-w-xl mx-2">
          <input
            type="range"
            min="0"
            max={duration || 100}
            step="0.1"
            value={currentTime}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
        </div>

        {/* Pitch Shift ("Mudar o Tom") Controls */}
        <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
          <span className="text-xs font-bold text-slate-400">Mudar o Tom:</span>
          <button
            onClick={() => onPitchChange(Math.max(pitchSemitones - 1, -6))}
            className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-black text-xs border border-slate-700"
          >
            -
          </button>
          <span className="text-xs font-mono font-bold text-amber-400 min-w-[32px] text-center">
            {pitchSemitones > 0 ? `+${pitchSemitones}` : pitchSemitones} ST
          </span>
          <button
            onClick={() => onPitchChange(Math.min(pitchSemitones + 1, 6))}
            className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-black text-xs border border-slate-700"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
};
