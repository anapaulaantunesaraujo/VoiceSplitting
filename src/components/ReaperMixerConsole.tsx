import React from 'react';
import { StemChannelId, StemChannelState } from '../hooks/useMultiStemMixer';
import { PitchInfo } from '../hooks/useVocalTuner';
import { LiveEvaluationStats } from '../hooks/useVocalEvaluation';
import { VocalTunerCanvas } from './VocalTunerCanvas';

interface ReaperMixerConsoleProps {
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
  userPitch?: PitchInfo | null;
  targetPitch?: PitchInfo | null;
  pitchStreak?: number;
  onBackToRepertoire?: () => void;
  tunerError?: string | null;
  focusedVoiceLabel?: string;
  soloActiveStem?: StemChannelId | null;
  // Focus Boost Props
  focusBoostMultiplier?: number;
  onFocusBoostChange?: (multiplier: number) => void;
  // Evaluation Mode Props
  isEvaluationMode?: boolean;
  onToggleEvaluationMode?: () => void;
  liveStats?: LiveEvaluationStats;
  onFinishEvaluationManual?: () => void;
  // Musical Analysis
  detectedKey?: string;
  detectedBpm?: number;
}

export const ReaperMixerConsole: React.FC<ReaperMixerConsoleProps> = ({
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
  pitchStreak = 0,
  tunerError,
  focusedVoiceLabel = 'Voz Principal',
  soloActiveStem = null,
  focusBoostMultiplier = 1.25,
  onFocusBoostChange,
  isEvaluationMode = false,
  onToggleEvaluationMode,
  liveStats,
  onFinishEvaluationManual,
  detectedKey = 'Dó Maior (C)',
  detectedBpm = 120
}) => {
  const voiceChannelList: StemChannelId[] = ['soprano', 'mezzoSoprano', 'contralto', 'tenor', 'baritone', 'bass'];

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const renderMobileChannelRow = (id: StemChannelId) => {
    const ch = channels[id];
    if (!ch) return null;
    const isMuted = ch.isMuted;
    const isSolo = ch.isSolo;

    return (
      <div
        key={id}
        className={`p-3.5 rounded-xl border transition-all space-y-2.5 ${
          isSolo
            ? 'bg-[#1c1c24] border-[#3b82f6] shadow-md shadow-blue-900/20 ring-1 ring-blue-500/50'
            : isMuted
            ? 'bg-[#121215] border-[#27272a] opacity-50'
            : 'bg-[#18181c] border-[#27272a]'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ch.color }} />
            <span className="text-xs font-black uppercase text-white tracking-wide">
              {ch.label}
            </span>
            {ch.harmonicRole && (
              <span className="text-[10px] text-[#a1a1aa] font-medium">({ch.harmonicRole})</span>
            )}
          </div>
          <span className="text-[11px] font-mono font-bold text-white bg-[#121215] px-2 py-0.5 rounded border border-[#27272a]">
            {isMuted ? 'MUTE' : `${Math.round(ch.volume * 100)}%`}
          </span>
        </div>

        {/* Horizontal Slider */}
        <div className="flex items-center gap-2">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : ch.volume}
            onChange={(e) => onVolumeChange(id, parseFloat(e.target.value))}
            className="w-full h-2 bg-[#27272a] rounded-lg appearance-none cursor-pointer"
            style={{ accentColor: ch.color }}
          />
        </div>

        {/* Solo / Mute 50/50 buttons */}
        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <button
            onClick={() => onToggleSolo(id)}
            className={`py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
              isSolo
                ? 'bg-[#2563eb] text-white shadow-sm'
                : 'bg-[#27272a] text-[#a1a1aa] hover:text-white'
            }`}
          >
            🎯 Focar (Solo)
          </button>
          <button
            onClick={() => onToggleMute(id)}
            className={`py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
              isMuted
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-[#27272a] text-[#a1a1aa] hover:text-white'
            }`}
          >
            🔇 Silenciar
          </button>
        </div>
      </div>
    );
  };

  const renderDesktopChannelCard = (id: StemChannelId) => {
    const ch = channels[id];
    if (!ch) return null;
    const isMuted = ch.isMuted;
    const isSolo = ch.isSolo;

    return (
      <div
        key={id}
        className={`flex flex-col items-center p-3 rounded-2xl border transition-all ${
          isSolo
            ? 'bg-[#1c1c24] border-[#3b82f6] ring-1 ring-blue-500/50 shadow-lg shadow-blue-900/20'
            : isMuted
            ? 'bg-[#121215] border-[#27272a] opacity-40'
            : 'bg-[#18181c] border-[#27272a] hover:border-[#3f3f46]'
        }`}
      >
        <div className="w-full text-center pb-2 mb-2 border-b border-[#27272a]">
          <span className="text-[11px] font-black tracking-wider uppercase block truncate" style={{ color: ch.color }}>
            {ch.label}
          </span>
          {ch.harmonicRole && (
            <span className="text-[9px] font-bold text-[#a1a1aa] block truncate mt-0.5">
              {ch.harmonicRole}
            </span>
          )}
        </div>

        {/* Solo & Mute Buttons */}
        <div className="flex flex-col gap-1.5 w-full mb-3">
          <button
            onClick={() => onToggleSolo(id)}
            className={`w-full py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
              isSolo
                ? 'bg-[#2563eb] text-white shadow-sm'
                : 'bg-[#27272a] text-[#a1a1aa] hover:text-white'
            }`}
          >
            🎯 Focar
          </button>
          <button
            onClick={() => onToggleMute(id)}
            className={`w-full py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
              isMuted
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-[#27272a] text-[#a1a1aa] hover:text-white'
            }`}
          >
            🔇 Silenciar
          </button>
        </div>

        {/* Vertical Fader */}
        <div className="flex items-center justify-center gap-2 h-36 py-1 relative w-full">
          <div className="fader-rotated-wrapper flex items-center justify-center h-32 w-8">
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
          <div className="w-2 h-28 bg-[#0a0a0c] border border-[#27272a] rounded-full overflow-hidden flex flex-col justify-end p-0.5">
            <div
              className="w-full rounded-full transition-all duration-75"
              style={{
                height: isMuted ? '0%' : `${Math.round(ch.volume * 100)}%`,
                background: isSolo ? '#3b82f6' : ch.color
              }}
            />
          </div>
        </div>

        <div className="mt-2 text-center w-full">
          <span className="text-[10px] font-mono font-bold text-white bg-[#121215] px-2 py-0.5 rounded border border-[#27272a] block">
            {isMuted ? 'MUTE' : `${Math.round(ch.volume * 100)}%`}
          </span>
        </div>
      </div>
    );
  };

  const renderMasterCard = () => (
    <div className="flex flex-col items-center p-3 rounded-2xl border border-[#3b82f6]/40 bg-[#141418] ring-1 ring-[#3b82f6]/20 shadow-md">
      <div className="w-full text-center pb-2 mb-2 border-b border-[#27272a]">
        <span className="text-[11px] font-black tracking-wider uppercase block truncate text-[#3b82f6]">
          🔊 MASTER
        </span>
      </div>

      <div className="flex flex-col gap-1.5 w-full mb-3">
        <div className="w-full py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider text-center bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/40">
          GERAL
        </div>
        <div className="w-full py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider text-center bg-[#27272a] text-[#a1a1aa]">
          SAÍDA
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 h-36 py-1 relative w-full">
        <div className="fader-rotated-wrapper flex items-center justify-center h-32 w-8">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={masterVolume}
            onChange={(e) => onMasterVolumeChange(parseFloat(e.target.value))}
            className="daw-fader-input"
            style={{ accentColor: '#3b82f6' }}
          />
        </div>
        <div className="w-2 h-28 bg-[#0a0a0c] border border-[#27272a] rounded-full overflow-hidden flex flex-col justify-end p-0.5">
          <div
            className="w-full rounded-full transition-all duration-75 bg-[#3b82f6]"
            style={{ height: `${Math.round(masterVolume * 100)}%` }}
          />
        </div>
      </div>

      <div className="mt-2 text-center w-full">
        <span className="text-[10px] font-mono font-bold text-[#3b82f6] bg-[#121215] px-2 py-0.5 rounded border border-[#27272a] block">
          {Math.round(masterVolume * 100)}%
        </span>
      </div>
    </div>
  );

  return (
    <div className="w-full space-y-6 pb-28">
      {/* 1. Header: Console Controls & Musical Key Indicator */}
      <div className="bg-[#121215] border border-[#27272a] rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg sm:text-xl font-black text-white tracking-tight flex items-center gap-2">
              <span>🎛️</span> Mesa de Som & Mixagem
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="text-xs font-bold text-[#3b82f6]">Tom: {detectedKey}</span>
              <span className="text-[#52525b]">•</span>
              <span className="text-xs font-bold text-emerald-400">{detectedBpm} BPM</span>
              {soloActiveStem && (
                <>
                  <span className="text-[#52525b]">•</span>
                  <span className="text-xs font-black text-white bg-[#1c1c24] px-2 py-0.5 rounded border border-blue-500/40">
                    🎯 Foco: {channels[soloActiveStem]?.label}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Action Buttons: Avaliação & Microfone */}
          <div className="flex items-center gap-2">
            {onToggleEvaluationMode && (
              <button
                onClick={onToggleEvaluationMode}
                className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer active:scale-95 ${
                  isEvaluationMode
                    ? 'bg-amber-500 text-black shadow-amber-500/30'
                    : 'bg-[#18181c] text-white border border-[#27272a]'
                }`}
              >
                {isEvaluationMode ? '🎯 Avaliando...' : '📊 Modo Avaliação'}
              </button>
            )}

            {isEvaluationMode && onFinishEvaluationManual && (
              <button
                onClick={onFinishEvaluationManual}
                className="px-3.5 py-2 rounded-xl text-xs font-black bg-[#2563eb] text-white shadow-md active:scale-95"
              >
                🏁 Concluir
              </button>
            )}
          </div>
        </div>

        {/* Live Evaluation Banner (if active) */}
        {isEvaluationMode && (
          <div className="bg-[#18181c] border border-amber-500/40 rounded-xl p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
              <span className="text-xs font-bold text-amber-300">
                Avaliando voz ao vivo na faixa ({focusedVoiceLabel})
              </span>
            </div>
            <div className="text-right">
              <span className="text-sm font-black text-amber-400">{liveStats?.liveAccuracy || 0}%</span>
              <span className="text-[10px] text-[#a1a1aa] block">Precisão</span>
            </div>
          </div>
        )}

        {/* Focus Boost Controls Bar (shown when any voice channel is focused / solo) */}
        {soloActiveStem && onFocusBoostChange && (
          <div className="bg-[#18181c] border border-[#3b82f6]/40 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2.5 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-base">🔊</span>
              <div>
                <span className="text-xs font-bold text-white block">
                  Volume Extra da Voz em Foco ({channels[soloActiveStem]?.label})
                </span>
                <span className="text-[10px] text-[#a1a1aa]">
                  Destaque da voz selecionada acima de todo o áudio
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {[
                { label: 'Normal (1.0x)', val: 1.0 },
                { label: 'Alto (+6dB)', val: 1.5 },
                { label: 'Máximo (+12dB)', val: 2.2 }
              ].map((lvl) => (
                <button
                  key={lvl.val}
                  onClick={() => onFocusBoostChange(lvl.val)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    Math.abs(focusBoostMultiplier - lvl.val) < 0.1
                      ? 'bg-[#2563eb] text-white shadow-sm ring-1 ring-blue-300'
                      : 'bg-[#27272a] text-[#a1a1aa] hover:text-white'
                  }`}
                >
                  {lvl.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2. Main Mixing Rack */}
      {/* Mobile Channel Cards (sm:hidden) */}
      <div className="sm:hidden space-y-3">
        <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#a1a1aa] block">
          Faixas Vocais
        </span>
        <div className="space-y-2.5">
          {voiceChannelList.map((id) => renderMobileChannelRow(id))}
        </div>

        <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#a1a1aa] block pt-3">
          Instrumental & Saída Master
        </span>
        <div className="space-y-2.5">
          {renderMobileChannelRow('accompaniment')}
          <div className="p-3.5 rounded-xl border border-[#3b82f6]/40 bg-[#141418] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-[#3b82f6]">🔊 SAÍDA MASTER</span>
              <span className="text-[11px] font-mono font-bold text-[#3b82f6] bg-[#121215] px-2 py-0.5 rounded border border-[#27272a]">
                {Math.round(masterVolume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={masterVolume}
              onChange={(e) => onMasterVolumeChange(parseFloat(e.target.value))}
              className="w-full h-2 bg-[#27272a] rounded-lg appearance-none cursor-pointer accent-[#3b82f6]"
            />
          </div>
        </div>
      </div>

      {/* Desktop Channel Cards (hidden sm:block) */}
      <div className="hidden sm:block bg-[#121215] p-5 rounded-2xl border border-[#27272a] shadow-xl">
        <div className="grid grid-cols-6 gap-3 mb-4">
          {voiceChannelList.map((id) => renderDesktopChannelCard(id))}
        </div>

        <div className="grid grid-cols-6 gap-3">
          {renderDesktopChannelCard('accompaniment')}
          {renderMasterCard()}

          {/* Afinador Canvas (coluna 3 a 6) */}
          <div className="col-span-4 bg-[#18181c] border border-[#27272a] rounded-2xl p-4 flex flex-col justify-between">
            <VocalTunerCanvas
              userPitch={userPitch || null}
              targetPitch={targetPitch || null}
              streakCount={pitchStreak}
              focusedVoiceLabel={focusedVoiceLabel}
              isListening={isListening}
              onToggleTuner={onToggleTuner}
              tunerError={tunerError}
              height={190}
              isEvaluationMode={isEvaluationMode}
              liveAccuracy={liveStats?.liveAccuracy}
              liveDetectedVoiceLabel={liveStats?.currentDetectedVoiceLabel}
              isMatchingFocused={liveStats?.currentDetectedVoice === soloActiveStem}
            />
          </div>
        </div>
      </div>

      {/* Mobile Afinador Canvas Accordion (sm:hidden) */}
      <div className="sm:hidden bg-[#121215] border border-[#27272a] rounded-2xl p-4 shadow-xl">
        <VocalTunerCanvas
          userPitch={userPitch || null}
          targetPitch={targetPitch || null}
          streakCount={pitchStreak}
          focusedVoiceLabel={focusedVoiceLabel}
          isListening={isListening}
          onToggleTuner={onToggleTuner}
          tunerError={tunerError}
          height={170}
          isEvaluationMode={isEvaluationMode}
          liveAccuracy={liveStats?.liveAccuracy}
          liveDetectedVoiceLabel={liveStats?.currentDetectedVoiceLabel}
          isMatchingFocused={liveStats?.currentDetectedVoice === soloActiveStem}
        />
      </div>

      {/* 3. Transport Dock (Bottom Sticky Audio Bar) */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#121215]/95 backdrop-blur-md border-t border-[#27272a] px-4 py-3 z-40 shadow-2xl">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center justify-between w-full sm:w-auto gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={onPlayPause}
                className="w-10 h-10 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold flex items-center justify-center shadow-md active:scale-95 cursor-pointer text-base"
              >
                {isPlaying ? '⏸️' : '▶️'}
              </button>
              <button
                onClick={onStop}
                className="w-9 h-9 rounded-xl bg-[#18181c] hover:bg-[#27272a] text-white flex items-center justify-center border border-[#27272a] text-xs cursor-pointer"
                title="Parar"
              >
                ⏹️
              </button>
            </div>

            <div className="text-xs font-mono font-bold text-[#3b82f6] bg-[#18181c] px-3 py-1.5 rounded-lg border border-[#27272a]">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>

          {/* Timeline Range */}
          <div className="flex-1 w-full mx-2">
            <input
              type="range"
              min="0"
              max={duration || 100}
              step="0.1"
              value={currentTime}
              onChange={(e) => onSeek(parseFloat(e.target.value))}
              className="w-full h-2 bg-[#27272a] rounded-lg appearance-none cursor-pointer accent-[#3b82f6]"
            />
          </div>

          {/* Pitch Shifter Mini Controls */}
          <div className="flex items-center gap-2 bg-[#18181c] border border-[#27272a] px-3 py-1 rounded-xl">
            <span className="text-[10px] font-bold text-[#a1a1aa]">Tom:</span>
            <button
              onClick={() => onPitchChange(Math.max(pitchSemitones - 1, -6))}
              className="w-6 h-6 rounded bg-[#27272a] hover:bg-[#3f3f46] text-white font-bold text-xs flex items-center justify-center"
            >
              -
            </button>
            <span className="text-[11px] font-mono font-black text-white min-w-[28px] text-center">
              {pitchSemitones > 0 ? `+${pitchSemitones}` : pitchSemitones}
            </span>
            <button
              onClick={() => onPitchChange(Math.min(pitchSemitones + 1, 6))}
              className="w-6 h-6 rounded bg-[#27272a] hover:bg-[#3f3f46] text-white font-bold text-xs flex items-center justify-center"
            >
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReaperMixerConsole;
