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

  let inTune = false;
  if (userPitch && targetPitch && targetPitch.frequency > 0) {
    const centsDiff = 1200 * (Math.log(userPitch.frequency / targetPitch.frequency) / Math.log(2));
    if (Math.abs(centsDiff) <= 15) inTune = true;
  } else if (userPitch) {
    if (Math.abs(userPitch.cents) <= 15) inTune = true;
  }

  return (
    <div className="mixer-console-card border border-[#2e2e2e] rounded-3xl p-6 bg-[#121212] text-white shadow-2xl space-y-6">
      {/* Top Header & Tuner Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 pb-4 border-b border-[#2e2e2e]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#1e1e1e] border border-[#2e2e2e] text-[#2563eb] flex items-center justify-center font-black text-xl">
            🎛️
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-white tracking-tight">Mesa de Som Virtual</h2>
            <p className="text-xs text-[#a3a3a3] font-medium">Controle de ganho, mute e solo por voz</p>
          </div>
        </div>

        {/* Embedded Digital Tuner Display */}
        <div className="w-full md:w-auto flex items-center gap-3 bg-[#0a0a0a] border border-[#2e2e2e] p-3 rounded-2xl">
          <div className="flex flex-col items-center min-w-[100px]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#737373]">Referência</span>
            <span className="text-lg font-black text-[#2563eb]">
              {targetPitch ? targetPitch.note : 'Soprano / Mix'}
            </span>
          </div>

          <div className="h-8 w-px bg-[#2e2e2e]" />

          <div className="flex flex-col items-center min-w-[140px]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#737373]">Sua Voz</span>
            <div className="flex items-center gap-2">
              <span className={`text-xl font-black ${inTune ? 'text-emerald-400 scale-110' : 'text-white'} transition-all`}>
                {userPitch ? userPitch.note : '--'}
              </span>
              {inTune && (
                <span className="text-xs px-2 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold rounded-full animate-pulse">
                  Perfeito ✨ (+{pitchStreak})
                </span>
              )}
            </div>
          </div>

          <div className="h-8 w-px bg-[#2e2e2e]" />

          <button
            onClick={onToggleTuner}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer ${
              isListening
                ? 'bg-emerald-600 text-white animate-pulse'
                : 'bg-[#2563eb] text-white hover:bg-[#1d4ed8]'
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
                  ? 'bg-[#1e1e1e] border-[#2563eb] ring-2 ring-[#2563eb]/30 shadow-md'
                  : ch.isMuted
                  ? 'bg-[#121212] border-[#2e2e2e] opacity-40'
                  : 'bg-[#121212] border-[#2e2e2e] hover:border-[#404040]'
              }`}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ch.color }} />
                <span className="text-sm font-bold text-white tracking-tight">{ch.label}</span>
              </div>

              <div className="flex items-center gap-2 mb-4 w-full justify-center">
                <button
                  onClick={() => onToggleMute(id)}
                  className={`w-9 h-9 rounded-xl text-xs font-black transition-all shadow-sm cursor-pointer ${
                    ch.isMuted
                      ? 'bg-rose-600 text-white'
                      : 'bg-[#1e1e1e] text-[#a3a3a3] hover:bg-[#262626] hover:text-white border border-[#2e2e2e]'
                  }`}
                  title="Mute"
                >
                  M
                </button>
                <button
                  onClick={() => onToggleSolo(id)}
                  className={`w-9 h-9 rounded-xl text-xs font-black transition-all shadow-sm cursor-pointer ${
                    ch.isSolo
                      ? 'bg-[#2563eb] text-white animate-pulse'
                      : 'bg-[#1e1e1e] text-[#a3a3a3] hover:bg-[#262626] hover:text-white border border-[#2e2e2e]'
                  }`}
                  title="Solo"
                >
                  S
                </button>
              </div>

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

              <div className="mt-3 text-center">
                <span className="text-xs font-mono font-bold text-white bg-[#000000] px-2.5 py-1 rounded-lg border border-[#2e2e2e]">
                  {ch.isMuted ? 'Muted' : `${Math.round(ch.volume * 100)}%`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Controls */}
      <div className="bg-[#0a0a0a] border border-[#2e2e2e] rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
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
          <div className="text-xs font-mono font-bold text-[#3b82f6] ml-2">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>

        <div className="flex-1 w-full max-w-md mx-2">
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

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-[#121212] px-3 py-1.5 rounded-xl border border-[#2e2e2e]">
            <span className="text-xs font-bold text-[#a3a3a3]">Tom:</span>
            <button
              onClick={() => onPitchChange(Math.max(pitchSemitones - 1, -6))}
              className="w-6 h-6 rounded bg-[#1e1e1e] text-white font-black text-xs hover:bg-[#262626] cursor-pointer"
            >
              -
            </button>
            <span className="text-xs font-mono font-bold text-[#3b82f6] min-w-[28px] text-center">
              {pitchSemitones > 0 ? `+${pitchSemitones}` : pitchSemitones} ST
            </span>
            <button
              onClick={() => onPitchChange(Math.min(pitchSemitones + 1, 6))}
              className="w-6 h-6 rounded bg-[#1e1e1e] text-white font-black text-xs hover:bg-[#262626] cursor-pointer"
            >
              +
            </button>
          </div>

          <div className="flex items-center gap-2 bg-[#121212] px-3 py-1.5 rounded-xl border border-[#2e2e2e]">
            <span className="text-xs font-bold text-[#a3a3a3]">Master:</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={masterVolume}
              onChange={(e) => onMasterVolumeChange(parseFloat(e.target.value))}
              className="w-16 h-1.5 bg-[#1e1e1e] rounded-lg appearance-none cursor-pointer accent-[#2563eb]"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default VirtualMixerConsole;
