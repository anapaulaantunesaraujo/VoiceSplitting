import React from 'react';
import { StemChannelId, StemChannelState } from '../hooks/useMultiStemMixer';
import { PitchInfo } from '../hooks/useVocalTuner';

interface VirtualMixerConsoleProps {
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
  // Tuner & VU Meter Props
  isListening: boolean;
  onToggleTuner: () => void;
  userPitch: PitchInfo | null;
  targetPitch: PitchInfo | null;
  pitchStreak: number;
}

export const VirtualMixerConsole: React.FC<VirtualMixerConsoleProps> = ({
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
  pitchStreak
}) => {
  const channelList: StemChannelId[] = ['soprano', 'contralto', 'tenor', 'bass', 'accompaniment'];

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Cents diff calculation for embedded VU / pitch bar
  let inTune = false;
  if (userPitch && targetPitch && targetPitch.frequency > 0) {
    const centsDiff = 1200 * (Math.log(userPitch.frequency / targetPitch.frequency) / Math.log(2));
    if (Math.abs(centsDiff) <= 15) inTune = true;
  } else if (userPitch) {
    if (Math.abs(userPitch.cents) <= 15) inTune = true;
  }

  return (
    <div className="mixer-console-card shadow-xl border border-slate-200/80 rounded-3xl p-6 bg-white/90 backdrop-blur-md transition-all">
      {/* Top Header & Integrated Master VU / Tuner Display */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 pb-6 mb-6 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-black text-xl">
            🎛️
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">Mesa de Som Virtual</h2>
            <p className="text-xs text-slate-500 font-medium">Controle milimétrico de ganho, mute e solo por voz</p>
          </div>
        </div>

        {/* Embedded Digital Tuner & VU Meter Display */}
        <div className="w-full md:w-auto flex items-center gap-3 bg-slate-50 border border-slate-200/70 p-3 rounded-2xl">
          <div className="flex flex-col items-center min-w-[100px]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tom de Referência</span>
            <span className="text-lg font-black text-indigo-600">
              {targetPitch ? targetPitch.note : 'Soprano / Mix'}
            </span>
          </div>

          <div className="h-8 w-px bg-slate-200" />

          {/* VU Meter & User Pitch Display */}
          <div className="flex flex-col items-center min-w-[140px]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Voz do Aluno</span>
            <div className="flex items-center gap-2">
              <span className={`text-xl font-black ${inTune ? 'text-emerald-500 scale-110' : 'text-slate-700'} transition-all`}>
                {userPitch ? userPitch.note : '--'}
              </span>
              {inTune && (
                <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 font-bold rounded-full animate-pulse">
                  Perfeito ✨ (+{pitchStreak})
                </span>
              )}
            </div>
          </div>

          <div className="h-8 w-px bg-slate-200" />

          {/* Master Tuner Activation Button */}
          <button
            onClick={onToggleTuner}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 ${
              isListening
                ? 'bg-emerald-500 text-white shadow-emerald-200 animate-pulse'
                : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100'
            }`}
          >
            {isListening ? '🎤 Afinador Ativo' : '🎙️ Ligar Afinador'}
          </button>
        </div>
      </div>

      {/* Main Channel Strips Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {channelList.map((id) => {
          const ch = channels[id];
          return (
            <div
              key={id}
              className={`channel-strip flex flex-col items-center p-4 rounded-2xl border transition-all ${
                ch.isSolo
                  ? 'bg-indigo-50/50 border-indigo-300 shadow-md ring-2 ring-indigo-400/30'
                  : ch.isMuted
                  ? 'bg-slate-50/70 border-slate-200 opacity-60'
                  : 'bg-white border-slate-200/80 hover:border-indigo-200 hover:shadow-sm'
              }`}
            >
              {/* Channel Label & Accent Bar */}
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ch.color }} />
                <span className="text-sm font-bold text-slate-800 tracking-tight">{ch.label}</span>
              </div>

              {/* Mute (M) & Solo (S) Control Buttons */}
              <div className="flex items-center gap-2 mb-4 w-full justify-center">
                <button
                  onClick={() => onToggleMute(id)}
                  className={`w-9 h-9 rounded-xl text-xs font-black transition-all shadow-sm ${
                    ch.isMuted
                      ? 'bg-rose-500 text-white shadow-rose-200 scale-105'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                  title="Mute (Silenciar canal)"
                >
                  M
                </button>
                <button
                  onClick={() => onToggleSolo(id)}
                  className={`w-9 h-9 rounded-xl text-xs font-black transition-all shadow-sm ${
                    ch.isSolo
                      ? 'bg-amber-500 text-white shadow-amber-200 scale-105 animate-pulse'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                  title="Solo (Isolar com 15% de fundo nos outros)"
                >
                  S
                </button>
              </div>

              {/* Custom CSS Vertical Fader Slider */}
              <div className="fader-container py-4 flex flex-col items-center justify-center h-44 w-full">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={ch.isMuted ? 0 : ch.volume}
                  onChange={(e) => onVolumeChange(id, parseFloat(e.target.value))}
                  className="vertical-fader-input"
                  style={{ accentColor: ch.color }}
                />
              </div>

              {/* Volume Percentage Value Indicator */}
              <div className="mt-3 text-center">
                <span className="text-xs font-black text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
                  {ch.isMuted ? 'Muted' : `${Math.round(ch.volume * 100)}%`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Console Master Controls Section */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Play / Pause / Stop Transport */}
        <div className="flex items-center gap-3">
          <button
            onClick={onPlayPause}
            className="w-12 h-12 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center justify-center shadow-lg shadow-indigo-200 transition-all active:scale-95 text-lg"
          >
            {isPlaying ? '⏸️' : '▶️'}
          </button>
          <button
            onClick={onStop}
            className="w-10 h-10 rounded-2xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold flex items-center justify-center transition-all text-sm"
            title="Parar"
          >
            ⏹️
          </button>
          <div className="text-xs font-bold text-slate-600 ml-2">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>

        {/* Track Scrub Bar */}
        <div className="flex-1 w-full max-w-md mx-2">
          <input
            type="range"
            min="0"
            max={duration || 100}
            step="0.1"
            value={currentTime}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
        </div>

        {/* Master Pitch Shift & Master Gain Controls */}
        <div className="flex items-center gap-4">
          {/* Pitch Shifter (-6 to +6) */}
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
            <span className="text-xs font-bold text-slate-500">Tom:</span>
            <button
              onClick={() => onPitchChange(Math.max(pitchSemitones - 1, -6))}
              className="w-6 h-6 rounded bg-slate-100 text-slate-700 font-black text-xs hover:bg-slate-200"
            >
              -
            </button>
            <span className="text-xs font-black text-indigo-600 min-w-[28px] text-center">
              {pitchSemitones > 0 ? `+${pitchSemitones}` : pitchSemitones} ST
            </span>
            <button
              onClick={() => onPitchChange(Math.min(pitchSemitones + 1, 6))}
              className="w-6 h-6 rounded bg-slate-100 text-slate-700 font-black text-xs hover:bg-slate-200"
            >
              +
            </button>
          </div>

          {/* Master Volume */}
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
            <span className="text-xs font-bold text-slate-500">Master:</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={masterVolume}
              onChange={(e) => onMasterVolumeChange(parseFloat(e.target.value))}
              className="w-16 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
