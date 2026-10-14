import React, { useState, useRef, useEffect } from 'react';
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
  pitchStreak,
  tunerError,
  focusedVoiceLabel = 'Voz Principal',
  soloActiveStem = null,
  focusBoostMultiplier = 1.25,
  onFocusBoostChange,
  isEvaluationMode = false,
  onToggleEvaluationMode,
  liveStats,
  onFinishEvaluationManual
}) => {
  // Top Row: 6 Vocal Stems
  const voiceChannelList: StemChannelId[] = ['soprano', 'mezzoSoprano', 'contralto', 'tenor', 'baritone', 'bass'];

  // Dynamic Header Height measurement ref & state
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState<number>(0);

  useEffect(() => {
    if (!headerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === headerRef.current) {
          setHeaderHeight(entry.target.clientHeight);
        }
      }
    });
    observer.observe(headerRef.current);
    setHeaderHeight(headerRef.current.clientHeight);
    return () => observer.disconnect();
  }, []);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 100);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}:${ms < 10 ? '0' : ''}${ms}`;
  };

  const renderChannelCard = (id: StemChannelId) => {
    const ch = channels[id];
    if (!ch) return null;
    const isMuted = ch.isMuted;
    const isSolo = ch.isSolo;

    return (
      <div
        key={id}
        className={`reaper-channel-card flex flex-col items-center p-3.5 rounded-2xl border transition-all ${
          isSolo
            ? 'bg-[#1e1e1e] border-[#2563eb] ring-2 ring-[#2563eb]/50 shadow-lg shadow-blue-900/20'
            : isMuted
            ? 'bg-[#121212] border-[#2e2e2e] opacity-40'
            : 'bg-[#121212] border-[#2e2e2e] hover:border-[#404040]'
        }`}
      >
        {/* Voice Name Header Label */}
        <div className="w-full text-center pb-2 mb-3 border-b border-[#2e2e2e]">
          <span className="text-[12px] font-black tracking-wider uppercase block truncate" style={{ color: ch.color }}>
            {ch.label}
          </span>
          {ch.harmonicRole && (
            <span className="text-[9px] font-extrabold text-[#a3a3a3] block truncate mt-0.5 tracking-tight">
              {ch.harmonicRole}
            </span>
          )}
        </div>

        {/* Didactic Action Buttons: "Focar" (Solo) & "Silenciar" (Mute) */}
        <div className="flex flex-col gap-2 w-full mb-4">
          <button
            onClick={() => onToggleSolo(id)}
            className={`w-full py-2.5 rounded-xl text-[11px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
              isSolo
                ? 'bg-[#2563eb] text-white shadow-md shadow-blue-600/40 ring-1 ring-blue-400/50'
                : 'bg-[#1e1e1e] text-[#a3a3a3] hover:bg-[#262626] hover:text-white border border-[#2e2e2e]'
            }`}
            title="Focar nesta voz (Solo)"
          >
            🎯 Focar
          </button>

          <button
            onClick={() => onToggleMute(id)}
            className={`w-full py-2.5 rounded-xl text-[11px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
              isMuted
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/40'
                : 'bg-[#1e1e1e] text-[#a3a3a3] hover:bg-[#262626] hover:text-white border border-[#2e2e2e]'
            }`}
            title="Silenciar esta voz (Mute)"
          >
            🔇 Silenciar
          </button>
        </div>

        {/* Vertical Fader & Segmented VU Meter */}
        <div className="flex items-center justify-center gap-2 h-44 py-2 relative w-full">
          {/* Rotated Range Input */}
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

          {/* VU Meter LED Level Bar */}
          <div className="reaper-vu-bar w-2.5 h-36 bg-[#000000] border border-[#2e2e2e] rounded-full flex flex-col justify-end overflow-hidden p-0.5">
            <div
              className="reaper-vu-fill w-full rounded-full transition-all duration-75"
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

        {/* Percentage Volume Indicator */}
        <div className="mt-3 text-center w-full">
          <span className="text-[10px] font-mono font-bold text-white bg-[#000000] px-2 py-1 rounded-md border border-[#2e2e2e] block">
            {isMuted ? 'MUTED' : `${Math.round(ch.volume * 100)}%`}
          </span>
        </div>
      </div>
    );
  };

  const renderMasterCard = () => (
    <div className="reaper-channel-card flex flex-col items-center p-3.5 rounded-2xl border border-[#2563eb]/40 bg-[#121212] hover:border-[#2563eb] transition-all ring-1 ring-[#2563eb]/20 shadow-md">
      {/* Master Header Label */}
      <div className="w-full text-center pb-2 mb-3 border-b border-[#2e2e2e]">
        <span className="text-[11px] font-extrabold tracking-wider uppercase block truncate text-[#3b82f6]">
          🔊 MASTER
        </span>
      </div>

      {/* Master Indicator Badges */}
      <div className="flex flex-col gap-2 w-full mb-4">
        <div className="w-full py-2.5 rounded-xl text-[11px] font-extrabold uppercase tracking-wider text-center bg-[#2563eb]/20 text-[#3b82f6] border border-[#2563eb]/40 shadow-sm">
          GERAL
        </div>
        <div className="w-full py-2.5 rounded-xl text-[11px] font-extrabold uppercase tracking-wider text-center bg-[#1e1e1e] text-[#a3a3a3] border border-[#2e2e2e]">
          SAÍDA
        </div>
      </div>

      {/* Master Vertical Fader & VU Level Meter */}
      <div className="flex items-center justify-center gap-2 h-44 py-2 relative w-full">
        <div className="fader-rotated-wrapper flex items-center justify-center h-40 w-10">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={masterVolume}
            onChange={(e) => onMasterVolumeChange(parseFloat(e.target.value))}
            className="daw-fader-input"
            style={{ accentColor: '#2563eb' }}
          />
        </div>

        <div className="reaper-vu-bar w-2.5 h-36 bg-[#000000] border border-[#2e2e2e] rounded-full flex flex-col justify-end overflow-hidden p-0.5">
          <div
            className="reaper-vu-fill w-full rounded-full transition-all duration-75"
            style={{
              height: `${Math.round(masterVolume * 100)}%`,
              background: 'linear-gradient(to top, #2563eb 70%, #3b82f6 100%)'
            }}
          />
        </div>
      </div>

      {/* Master Volume Percentage */}
      <div className="mt-3 text-center w-full">
        <span className="text-[10px] font-mono font-bold text-[#3b82f6] bg-[#000000] px-2 py-1 rounded-md border border-[#2e2e2e] block">
          {Math.round(masterVolume * 100)}%
        </span>
      </div>
    </div>
  );

  return (
    <div className="reaper-mixer-wrapper bg-[#121212] text-white rounded-3xl p-6 sm:p-8 border border-[#2e2e2e] shadow-2xl pb-36 space-y-8">
      {/* Empty div ABOVE with exact same height as header div and app background color */}
      <div
        className="w-full bg-[#000000] rounded-2xl transition-all"
        style={{ height: headerHeight ? `${headerHeight}px` : 'auto' }}
      />

      {/* Top Console Navigation Bar */}
      <div
        ref={headerRef}
        className="flex flex-col gap-4 pb-6 border-b border-[#2e2e2e]"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
              🎛️ Mesa de Som
            </h2>
            {soloActiveStem && (
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <span className="text-xs font-bold text-[#3b82f6]">🎯 Voz em Foco:</span>
                <span className="text-xs font-black text-white bg-[#1e1e1e] px-2.5 py-0.5 rounded-lg border border-[#2563eb]/50 shadow-sm">
                  {channels[soloActiveStem]?.label} ({channels[soloActiveStem]?.harmonicRole})
                </span>
                <span className="text-[10px] font-extrabold text-emerald-400 bg-emerald-950/70 px-2 py-0.5 rounded-lg border border-emerald-500/40 animate-pulse">
                  ⚡ +Volume Alto Ativo
                </span>
              </div>
            )}
          </div>

          {/* Quick Actions: Modo Avaliação & Microfone */}
          <div className="flex flex-wrap items-center gap-3">
            {onToggleEvaluationMode && (
              <button
                onClick={onToggleEvaluationMode}
                className={`px-5 py-2.5 rounded-xl text-xs font-extrabold transition-all shadow-md flex items-center gap-2 cursor-pointer active:scale-95 ${
                  isEvaluationMode
                    ? 'bg-amber-500 hover:bg-amber-400 text-black border border-amber-300 shadow-amber-500/30 ring-2 ring-amber-400/50'
                    : 'bg-[#1e1e1e] hover:bg-[#262626] text-white border border-[#383838]'
                }`}
                title="Ativar monitoramento com pontuação e relatório de voz ao vivo"
              >
                <span>{isEvaluationMode ? '🎯 Avaliação: ATIVADA' : '📊 Ativar Modo Avaliação'}</span>
              </button>
            )}

            {isEvaluationMode && onFinishEvaluationManual && (
              <button
                onClick={onFinishEvaluationManual}
                className="px-4 py-2.5 rounded-xl text-xs font-extrabold bg-[#2563eb] hover:bg-[#1d4ed8] text-white transition-all shadow-md shadow-blue-600/30 flex items-center gap-2 cursor-pointer animate-pulse"
                title="Concluir e ver relatório de acerto da avaliação"
              >
                <span>🏁 Concluir Avaliação</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Evaluation HUD Banner (shown when evaluation mode is on) */}
        {isEvaluationMode && (
          <div className="bg-[#0a0a0a] border border-amber-500/40 rounded-2xl p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-amber-400 animate-ping" />
              <div>
                <span className="text-xs font-black text-amber-300 uppercase tracking-wider block">
                  🔴 Avaliando sua voz ao vivo...
                </span>
                <span className="text-[11px] text-[#a3a3a3]">
                  Cante a voz em foco ({focusedVoiceLabel}). Ao terminar, exibiremos a voz que você fez e a porcentagem de acerto.
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4 ml-auto">
              <div className="text-right sm:text-center">
                <span className="text-[9px] uppercase font-extrabold text-[#737373] tracking-wider block">
                  Acerto na Voz em Foco
                </span>
                <span className="text-base sm:text-lg font-black text-amber-400">
                  {liveStats?.liveAccuracy || 0}%
                </span>
              </div>

              <div className="h-6 w-px bg-[#2e2e2e]" />

              <div className="text-right sm:text-center">
                <span className="text-[9px] uppercase font-extrabold text-[#737373] tracking-wider block">
                  Voz que Você Está Cantando
                </span>
                <span
                  className={`text-base sm:text-lg font-black ${
                    liveStats?.currentDetectedVoice === soloActiveStem ? 'text-emerald-400' : 'text-amber-300'
                  }`}
                >
                  {liveStats?.currentDetectedVoiceLabel || '--'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Focus Boost Controls Bar (shown when any voice channel is focused / solo) */}
        {soloActiveStem && onFocusBoostChange && (
          <div className="bg-[#18181b] border border-[#2563eb]/40 rounded-2xl p-3 sm:p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-2.5">
              <span className="text-lg">🔊</span>
              <div>
                <span className="text-xs font-extrabold text-white block">
                  Volume Extra da Voz em Foco ({channels[soloActiveStem]?.label})
                </span>
                <span className="text-[10px] text-[#a3a3a3]">
                  Aumente o volume da voz em foco para destacar acima de todo o áudio
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {[
                { label: 'Normal (1.0x)', val: 1.0 },
                { label: 'Alto (+6dB)', val: 1.5 },
                { label: 'Máximo (+12dB)', val: 2.2 }
              ].map((lvl) => (
                <button
                  key={lvl.val}
                  onClick={() => onFocusBoostChange(lvl.val)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                    Math.abs(focusBoostMultiplier - lvl.val) < 0.1
                      ? 'bg-[#2563eb] text-white shadow-md shadow-blue-600/40 ring-1 ring-blue-300'
                      : 'bg-[#27272a] text-[#a3a3a3] hover:text-white border border-[#3f3f46]'
                  }`}
                >
                  {lvl.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Empty div BELOW with exact same height as header div and app background color */}
      <div
        className="w-full bg-[#000000] rounded-2xl transition-all"
        style={{ height: headerHeight ? `${headerHeight}px` : 'auto' }}
      />

      {/* Main Console Area Rack (Unified 6-Column Grid) */}
      <div className="bg-[#0a0a0a] p-5 rounded-3xl border border-[#2e2e2e]">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 items-stretch">
          {/* TOP ROW: 6 Vocal Stems (Soprano, Mezzo-soprano, Contralto, Tenor, Barítono, Baixo) */}
          {voiceChannelList.map((id) => renderChannelCard(id))}

          {/* BOTTOM ROW: Instrumental, Master, and Pitch Line Graph */}
          {/* 1. Instrumental (Column 1) */}
          {renderChannelCard('accompaniment')}

          {/* 2. Master Output (Column 2) */}
          {renderMasterCard()}

          {/* 3. Pitch Line Graph Card (Columns 3 to 6 - Starts below Contralto and ends exactly at the right border of Baixo above) */}
          <div className="col-span-1 sm:col-span-2 md:col-span-3 lg:col-span-4 bg-[#121212] border border-[#2e2e2e] hover:border-[#404040] rounded-2xl p-4 flex flex-col justify-between shadow-xl transition-all">
            <VocalTunerCanvas
              userPitch={userPitch || null}
              targetPitch={targetPitch || null}
              streakCount={pitchStreak}
              focusedVoiceLabel={focusedVoiceLabel}
              isListening={isListening}
              onToggleTuner={onToggleTuner}
              tunerError={tunerError}
              height={230}
              isEvaluationMode={isEvaluationMode}
              liveAccuracy={liveStats?.liveAccuracy}
              liveDetectedVoiceLabel={liveStats?.currentDetectedVoiceLabel}
              isMatchingFocused={liveStats?.currentDetectedVoice === soloActiveStem}
            />
          </div>
        </div>
      </div>

      {/* Fixed Horizontal Transport Dock (Bottom Bar) */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#121212]/95 backdrop-blur-md border-t border-[#2e2e2e] p-4 z-40 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 max-w-6xl mx-auto px-6 rounded-t-3xl">
        {/* Playback Controls & Counter */}
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
          <div className="text-xs font-mono font-bold text-[#3b82f6] bg-[#000000] px-3.5 py-2 rounded-lg border border-[#2e2e2e]">
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
            className="w-full h-2 bg-[#1e1e1e] rounded-lg appearance-none cursor-pointer accent-[#2563eb]"
          />
        </div>

        {/* Pitch Shift Controls ("Mudar o Tom") */}
        <div className="flex items-center gap-3 bg-[#0a0a0a] border border-[#2e2e2e] px-4 py-2 rounded-xl">
          <span className="text-xs font-bold text-[#a3a3a3]">Mudar Tom:</span>
          <button
            onClick={() => onPitchChange(Math.max(pitchSemitones - 1, -6))}
            className="w-7 h-7 rounded-lg bg-[#1e1e1e] hover:bg-[#262626] text-white font-black text-xs border border-[#2e2e2e] cursor-pointer flex items-center justify-center"
          >
            -
          </button>
          <span className="text-xs font-mono font-bold text-white min-w-[32px] text-center">
            {pitchSemitones > 0 ? `+${pitchSemitones}` : pitchSemitones} ST
          </span>
          <button
            onClick={() => onPitchChange(Math.min(pitchSemitones + 1, 6))}
            className="w-7 h-7 rounded-lg bg-[#1e1e1e] hover:bg-[#262626] text-white font-black text-xs border border-[#2e2e2e] cursor-pointer flex items-center justify-center"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReaperMixerConsole;
