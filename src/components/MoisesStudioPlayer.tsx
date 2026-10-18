import React, { useState, useEffect, useRef, useMemo } from 'react';
import { StemChannelId } from '../hooks/useMultiStemMixer';
import { PitchInfo } from '../hooks/useVocalTuner';
import { SpeedometerVocalTuner } from './SpeedometerVocalTuner';
import { TrebleClefIcon } from './TrebleClefIcon';
import { getHarmonicField, transposeKey } from '../utils/harmonicField';
import { MetronomeClickEngine } from '../utils/metronome';

interface MoisesStudioPlayerProps {
  songTitle: string;
  artistName?: string;
  detectedKey: string;
  detectedBpm: number;
  pitchSemitones: number;
  onPitchChange: (semitones: number) => void;
  onKeyChange?: (newKey: string) => void;
  isPlaying: boolean;
  onPlayPause: () => void;
  onStop: () => void;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  onBackToRepertoire: () => void;
  // Two main volumes: Instrumental vs AI Voice
  instrumentalVolume: number;
  onInstrumentalVolumeChange: (vol: number) => void;
  aiVoiceVolume: number;
  onAiVoiceVolumeChange: (vol: number) => void;
  // Vocal Focus (Soprano, Contralto, Tenor, Baixo)
  focusedVoice: StemChannelId;
  onSelectFocusedVoice: (voice: StemChannelId) => void;
  // Vocal Octave Shift (-1: 8ª Baixa, 0: Original, +1: 8ª Alta)
  voiceOctaveShifts?: Record<StemChannelId, number>;
  onVoiceOctaveChange?: (voice: StemChannelId, octave: number) => void;
  // Tuner & Mic
  isListening: boolean;
  onToggleTuner: () => void;
  stopTuner?: () => void;
  userPitch?: PitchInfo | null;
  targetPitch?: PitchInfo | null;
  pitchStreak?: number;
  accuracyRate?: number;
  sidetoneVolume?: number;
  onSidetoneVolumeChange?: (vol: number) => void;
  isMonitorMuted?: boolean;
  onToggleMonitorMute?: () => void;
  tunerError?: string | null;
  // Audio Buffers for visual waveform & export
  vocalAudioBuffer?: AudioBuffer | null;
  onExportMix?: (format: 'wav' | 'whatsapp') => Promise<void>;
  onRegenerateVirtualStems?: () => void;
  onSaveSongPreferences?: () => Promise<void> | void;
}

export const MoisesStudioPlayer: React.FC<MoisesStudioPlayerProps> = ({
  songTitle,
  artistName = 'Divisão Vocal',
  detectedKey = 'C',
  detectedBpm = 120,
  pitchSemitones = 0,
  onPitchChange,
  onKeyChange,
  isPlaying,
  onPlayPause,
  onStop,
  currentTime,
  duration,
  onSeek,
  onBackToRepertoire,
  instrumentalVolume,
  onInstrumentalVolumeChange,
  aiVoiceVolume,
  onAiVoiceVolumeChange,
  focusedVoice = 'soprano',
  onSelectFocusedVoice,
  voiceOctaveShifts = { soprano: 0, contralto: 0, tenor: -1, bass: -1, mezzoSoprano: 0, baritone: -1, accompaniment: 0 },
  onVoiceOctaveChange = () => {},
  onSaveSongPreferences,
  isListening,
  onToggleTuner,
  stopTuner,
  userPitch,
  targetPitch,
  accuracyRate = 0,
  sidetoneVolume = 0.75,
  onSidetoneVolumeChange = () => {},
  isMonitorMuted = false,
  onToggleMonitorMute = () => {},
  tunerError = null,
  vocalAudioBuffer = null,
  onExportMix,
  onRegenerateVirtualStems
}) => {
  // Active Modals
  const [showKeyModal, setShowKeyModal] = useState<boolean>(false);
  const [showVoiceModal, setShowVoiceModal] = useState<boolean>(false);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [showTunerDrawer, setShowTunerDrawer] = useState<boolean>(false);

  // Auto cleanup tuner/microphone when player unmounts
  useEffect(() => {
    return () => {
      stopTuner?.();
    };
  }, [stopTuner]);

  // Mute / Solo local states
  const [isInstMuted, setIsInstMuted] = useState<boolean>(false);
  const [isAiVoiceMuted, setIsAiVoiceMuted] = useState<boolean>(false);
  const [isInstSolo, setIsInstSolo] = useState<boolean>(false);
  const [isAiVoiceSolo, setIsAiVoiceSolo] = useState<boolean>(false);

  // Metronome Click State
  const [isMetronomeActive, setIsMetronomeActive] = useState<boolean>(false);
  const [currentBeat, setCurrentBeat] = useState<number>(1);
  const [metronomeVolume, setMetronomeVolume] = useState<number>(0.7);

  // Pan controls (-1 to 1)
  const [instPan, setInstPan] = useState<number>(0);
  const [aiVoicePan, setAiVoicePan] = useState<number>(0);

  // Rehearsal Preferences save state
  const [justSaved, setJustSaved] = useState<boolean>(false);

  const handleSaveClick = async () => {
    if (onSaveSongPreferences) {
      await onSaveSongPreferences();
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
    }
  };

  // Metronome Engine instance
  const metronomeEngineRef = useRef<MetronomeClickEngine | null>(null);

  useEffect(() => {
    metronomeEngineRef.current = new MetronomeClickEngine(detectedBpm, (beat) => {
      setCurrentBeat(beat);
    });
    return () => {
      metronomeEngineRef.current?.stop();
    };
  }, [detectedBpm]);

  // Sync metronome with playback
  useEffect(() => {
    if (!metronomeEngineRef.current) return;
    if (isPlaying && isMetronomeActive) {
      metronomeEngineRef.current.setBpm(detectedBpm);
      metronomeEngineRef.current.setVolume(metronomeVolume);
      metronomeEngineRef.current.start();
    } else {
      metronomeEngineRef.current.stop();
    }
  }, [isPlaying, isMetronomeActive, detectedBpm, metronomeVolume]);

  const toggleMetronome = () => {
    setIsMetronomeActive((prev) => !prev);
  };

  // Compute Current Transposed Key & Harmonic Field
  const transposedKeyName = useMemo(() => {
    return transposeKey(detectedKey, pitchSemitones);
  }, [detectedKey, pitchSemitones]);

  const harmonicField = useMemo(() => {
    const isMinor = transposedKeyName.includes('m') || detectedKey.includes('Menor');
    return getHarmonicField(transposedKeyName, isMinor ? 'Minor' : 'Major');
  }, [transposedKeyName, detectedKey]);

  const voiceOptions: { id: StemChannelId; label: string; role: string; color: string; icon: string }[] = [
    { id: 'soprano', label: 'Soprano', role: 'Voz Aguda Feminina', color: '#00c2cb', icon: '✨' },
    { id: 'contralto', label: 'Contralto', role: 'Voz Média / Quente', color: '#38bdf8', icon: '🌸' },
    { id: 'tenor', label: 'Tenor', role: 'Voz Masculina Melódica', color: '#60a5fa', icon: '🌟' },
    { id: 'bass', label: 'Baixo', role: 'Voz Masculina Grave', color: '#2dd4bf', icon: '⚓' }
  ];

  const currentVoiceObj = voiceOptions.find((v) => v.id === focusedVoice) || voiceOptions[0];
  const currentOctave = voiceOctaveShifts[focusedVoice] || 0;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Waveform canvas rendering
  const instCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const voiceCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const drawWaveform = (canvas: HTMLCanvasElement | null, color: string, intensity: number) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const barWidth = 3;
      const barGap = 1.5;
      const totalBars = Math.floor(width / (barWidth + barGap));
      const mid = height / 2;

      // Seed pseudo-random waveform peaks
      for (let i = 0; i < totalBars; i++) {
        const x = i * (barWidth + barGap);
        const progress = i / totalBars;
        // Shape waveform envelope
        const env = Math.sin(progress * Math.PI) * 0.7 + 0.3;
        const rand = ((Math.sin(i * 99 + intensity * 10) + 1) / 2) * 0.7 + 0.3;
        const barH = Math.max(3, env * rand * (height * 0.75));

        // Highlight played portion
        const isPlayed = duration > 0 ? (currentTime / duration) >= progress : false;

        ctx.fillStyle = isPlayed ? '#00e5ff' : color;
        ctx.beginPath();
        ctx.roundRect(x, mid - barH / 2, barWidth, barH, 1.5);
        ctx.fill();
      }

      // Draw Playhead scrubber line
      if (duration > 0) {
        const playheadX = (currentTime / duration) * width;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, height);
        ctx.stroke();
      }
    };

    drawWaveform(instCanvasRef.current, 'rgba(0, 194, 203, 0.4)', 1);
    drawWaveform(voiceCanvasRef.current, 'rgba(56, 189, 248, 0.45)', vocalAudioBuffer ? 3 : 2);
  }, [currentTime, duration, vocalAudioBuffer]);

  // Handle click on waveform to seek
  const handleWaveformClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(ratio * (duration || 100));
  };

  // WhatsApp Share Trigger
  const handleShareWhatsApp = () => {
    const text = `Ouça o ensaio de "${songTitle}" com a voz ${currentVoiceObj.label} destacada no Divisão Vocal!`;
    const url = window.location.href;
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(`${text}\n${url}`)}`;
    window.open(whatsappUrl, '_blank');
    setShowExportModal(false);
  };

  return (
    <div className="w-full bg-[#0d0e12] text-white min-h-[calc(100vh-60px)] flex flex-col justify-between select-none pb-28">
      {/* =========================================================================
          TOP BAR (Moises Player Header Style) - Spacious & Comfortable
      ========================================================================= */}
      <header className="sticky top-0 z-30 bg-[#121318] border-b border-[#232530] px-4 sm:px-8 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-6 shadow-md">
        {/* Left: Back Arrow + Song Title */}
        <div className="flex items-center gap-3.5 min-w-0 shrink-0">
          <button
            onClick={onBackToRepertoire}
            className="w-11 h-11 rounded-2xl bg-[#181a20] hover:bg-[#232530] text-[#9ca3af] hover:text-white flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-sm"
            title="Voltar ao Repertório"
          >
            ←
          </button>
          <div className="w-11 h-11 rounded-2xl bg-[#1c2230] border border-[#2b354f] flex items-center justify-center shrink-0 shadow-sm shadow-cyan-950/30">
            <TrebleClefIcon className="w-6 h-6" color="#00c2cb" />
          </div>
          <div className="min-w-0 space-y-0.5">
            <h1 className="text-sm sm:text-base font-black text-white truncate max-w-[200px] sm:max-w-xs md:max-w-sm lg:max-w-md leading-snug">
              {songTitle}
            </h1>
            <span className="text-xs text-[#9ca3af] block truncate leading-relaxed">
              {artistName}
            </span>
          </div>
        </div>

        {/* Center / Right: Interactive Controls Pills */}
        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap lg:flex-nowrap justify-start lg:justify-end overflow-visible w-full lg:w-auto shrink-0 py-1">
          {/* 1. SELETOR DE VOZ EM FOCO */}
          <button
            onClick={() => setShowVoiceModal(true)}
            className="px-3 sm:px-3.5 py-2 sm:py-2.5 bg-[#181a20] hover:bg-[#20222a] border border-[#272b38] rounded-xl text-xs sm:text-sm font-bold text-white flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap shadow-sm shrink-0"
            title="Escolher Voz em Foco para a IA"
          >
            <span className="text-sm sm:text-base">{currentVoiceObj.icon}</span>
            <span className="text-[#9ca3af]">Voz:</span>
            <span style={{ color: currentVoiceObj.color }} className="font-black px-0.5">{currentVoiceObj.label}</span>
            <span className="text-[10px] text-[#71717a]">▾</span>
          </button>

          {/* 1.1 SELETOR RÁPIDO DE OITAVA DA VOZ (8ª Baixa / Original / 8ª Alta) */}
          <div
            className="bg-[#181a20] border border-[#272b38] rounded-xl p-1 flex items-center gap-0.5 sm:gap-1 shrink-0 shadow-sm"
            title="Ajustar oitava da voz da IA (evita ficar muito aguda ou muito grave)"
          >
            <button
              type="button"
              onClick={() => onVoiceOctaveChange(focusedVoice, -1)}
              className={`px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                currentOctave === -1
                  ? 'bg-[#00c2cb] text-black font-black shadow-sm'
                  : 'text-[#9ca3af] hover:text-white hover:bg-[#202330]'
              }`}
              title="8ª Baixa (-12 semitons) - Evita que a voz fique muito aguda"
            >
              <span className="text-[9px]">▼</span>
              <span>8ª Baixa</span>
            </button>
            <button
              type="button"
              onClick={() => onVoiceOctaveChange(focusedVoice, 0)}
              className={`px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                currentOctave === 0
                  ? 'bg-[#00c2cb] text-black font-black shadow-sm'
                  : 'text-[#9ca3af] hover:text-white hover:bg-[#202330]'
              }`}
              title="Oitava Original / Padrão da Voz"
            >
              <span>Original</span>
            </button>
            <button
              type="button"
              onClick={() => onVoiceOctaveChange(focusedVoice, 1)}
              className={`px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                currentOctave === 1
                  ? 'bg-[#00c2cb] text-black font-black shadow-sm'
                  : 'text-[#9ca3af] hover:text-white hover:bg-[#202330]'
              }`}
              title="8ª Alta (+12 semitons) - Evita que a voz fique muito grave"
            >
              <span className="text-[9px]">▲</span>
              <span>8ª Alta</span>
            </button>
          </div>

          {/* 1.2 BOTÃO SALVAR AJUSTES DA MÚSICA */}
          {onSaveSongPreferences && (
            <button
              type="button"
              onClick={handleSaveClick}
              className={`px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap shadow-sm shrink-0 border ${
                justSaved
                  ? 'bg-[#00c2cb]/20 text-[#00c2cb] border-[#00c2cb] ring-1 ring-[#00c2cb]/50 shadow-cyan-900/30'
                  : 'bg-[#181a20] hover:bg-[#20222a] text-[#cbd5e1] hover:text-white border-[#272b38]'
              }`}
              title="Salvar a voz ativa e as oitavas para abrir sempre pronta nesta música"
            >
              <span>{justSaved ? '✅' : '💾'}</span>
              <span>{justSaved ? 'Salvo!' : 'Salvar Ajustes'}</span>
            </button>
          )}

          {/* 2. METRÔNOMO / BPM */}
          <button
            onClick={toggleMetronome}
            className={`px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap shadow-sm shrink-0 ${
              isMetronomeActive
                ? 'bg-[#00c2cb]/20 text-[#00c2cb] border border-[#00c2cb]/50 shadow-cyan-900/30 ring-1 ring-[#00c2cb]/40'
                : 'bg-[#181a20] text-[#9ca3af] hover:text-white border border-[#272b38]'
            }`}
            title="Ligar/Desligar Som do Metrônomo (Click)"
          >
            <span className="text-sm sm:text-base">⏱️</span>
            <span className="font-bold">{detectedBpm} BPM</span>
            {isMetronomeActive && (
              <span className="w-2 h-2 rounded-full bg-[#00c2cb] animate-ping ml-0.5" />
            )}
          </button>

          {/* 3. SELETOR DE TOM & CAMPO HARMÔNICO */}
          <button
            onClick={() => setShowKeyModal(true)}
            className="px-3 sm:px-3.5 py-2 sm:py-2.5 bg-[#181a20] hover:bg-[#20222a] border border-[#272b38] rounded-xl text-xs sm:text-sm font-bold text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shadow-sm shrink-0"
            title="Mudar o Tom e Ver Campo Harmônico"
          >
            <span className="text-sm sm:text-base">🎼</span>
            <span className="text-[#9ca3af]">Tom:</span>
            <span className="text-[#38bdf8] font-black">{transposedKeyName}</span>
            <span className="text-[10px] text-[#71717a]">▾</span>
          </button>

          {/* 4. AFINADOR / MICROFONE - Não corta nem passa da margem */}
          <button
            onClick={() => {
              if (isListening || showTunerDrawer) {
                if (isListening) {
                  if (stopTuner) stopTuner();
                  else onToggleTuner();
                }
                setShowTunerDrawer(false);
              } else {
                if (!isListening) onToggleTuner();
                setShowTunerDrawer(true);
              }
            }}
            className={`px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap shadow-sm shrink-0 ${
              isListening
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 ring-1 ring-emerald-500/40 shadow-emerald-950/40'
                : 'bg-[#181a20] text-[#9ca3af] hover:text-white border border-[#272b38]'
            }`}
            title={isListening ? "Desligar Microfone e Fechar Afinador" : "Ligar Microfone e Abrir Afinador"}
          >
            <span className="text-sm sm:text-base">{isListening ? '🎙️' : '🎤'}</span>
            <span className="font-bold">{isListening ? 'Afinador Ligado' : 'Afinador'}</span>
            {isListening && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
            )}
          </button>

          {/* 5. EXPORTAR & WHATSAPP */}
          <button
            onClick={() => setShowExportModal(true)}
            className="px-3.5 sm:px-4 py-2 sm:py-2.5 bg-[#00c2cb] hover:bg-[#00adb5] text-black font-black rounded-xl text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md shadow-cyan-900/30 whitespace-nowrap active:scale-95 shrink-0"
            title="Exportar Áudio e Enviar pelo WhatsApp"
          >
            <span className="text-sm sm:text-base">📥</span>
            <span className="font-black">Exportar</span>
          </button>
        </div>
      </header>

      {/* =========================================================================
          MAIN TRACKS AREA (Moises Horizontal Tracks with Waveforms) - Generous Desktop Space
      ========================================================================= */}
      <main className="flex-1 w-full max-w-[1700px] mx-auto px-4 sm:px-8 lg:px-12 py-8 pb-40 flex flex-col gap-6 sm:gap-8">
        {/* Metronome Beat Indicator Ribbon (When Metronome active) */}
        {isMetronomeActive && (
          <div className="bg-[#14161f] border border-[#00c2cb]/40 rounded-3xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="text-xs sm:text-sm font-black text-[#00c2cb]">METRÔNOMO ATIVO:</span>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4].map((b) => (
                  <span
                    key={b}
                    className={`w-9 h-9 rounded-2xl text-xs sm:text-sm font-black flex items-center justify-center transition-all ${
                      currentBeat === b
                        ? 'bg-[#00c2cb] text-black scale-110 shadow-md shadow-cyan-500/50'
                        : 'bg-[#1c1f2b] text-[#71717a]'
                    }`}
                  >
                    {b}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs sm:text-sm">
              <span className="text-[#9ca3af]">Volume Click:</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={metronomeVolume}
                onChange={(e) => setMetronomeVolume(parseFloat(e.target.value))}
                className="w-24 sm:w-32 h-2 bg-[#232530] rounded-full appearance-none cursor-pointer accent-[#00c2cb]"
              />
            </div>
          </div>
        )}

        {/* TRACK 1: MÚSICA INSTRUMENTAL / GERAL */}
        <div className="bg-[#14161f] border border-[#232530] hover:border-[#2f3242] rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center gap-6 sm:gap-8 shadow-xl transition-all">
          {/* Controls Strip (Left) */}
          <div className="w-full md:w-72 flex flex-col gap-4 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#1c1f2b] flex items-center justify-center text-lg text-[#00c2cb] shadow-sm">
                  🎸
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm sm:text-base font-black text-white tracking-wide leading-snug">
                    Música / Instrumental
                  </h3>
                  <span className="text-xs text-[#9ca3af] block leading-relaxed pt-0.5">
                    Faixa de Acompanhamento
                  </span>
                </div>
              </div>

              {/* Mute / Solo Buttons */}
              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  onClick={() => {
                    const nextMuted = !isInstMuted;
                    setIsInstMuted(nextMuted);
                    onInstrumentalVolumeChange(nextMuted ? 0 : (instrumentalVolume > 0 ? instrumentalVolume : 0.4));
                  }}
                  className={`w-11 h-11 rounded-2xl text-sm font-black uppercase transition-all cursor-pointer shrink-0 flex items-center justify-center ${
                    isInstMuted ? 'bg-rose-600 text-white shadow-sm' : 'bg-[#1c1f2b] text-[#71717a] hover:text-white'
                  }`}
                  title={isInstMuted ? 'Desmutar Música' : 'Mutar Música'}
                >
                  M
                </button>
                <button
                  onClick={() => {
                    const nextSolo = !isInstSolo;
                    setIsInstSolo(nextSolo);
                    if (nextSolo) {
                      setIsAiVoiceSolo(false);
                      onInstrumentalVolumeChange(instrumentalVolume > 0 ? instrumentalVolume : 0.9);
                      onAiVoiceVolumeChange(0);
                    } else {
                      onInstrumentalVolumeChange(0.4);
                      onAiVoiceVolumeChange(1.0);
                    }
                  }}
                  className={`w-11 h-11 rounded-2xl text-sm font-black uppercase transition-all cursor-pointer shrink-0 flex items-center justify-center ${
                    isInstSolo ? 'bg-[#00c2cb] text-black shadow-sm' : 'bg-[#1c1f2b] text-[#71717a] hover:text-white'
                  }`}
                  title="Solo Música Original"
                >
                  S
                </button>
              </div>
            </div>

            {/* Volume Slider & Percentage (0% to 100% Proportional) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-[#9ca3af]">
                <span>Volume Música Original</span>
                <span className="text-[#00c2cb] font-bold">
                  {isInstMuted || instrumentalVolume === 0 ? 'MUDO (0%)' : `${Math.round(Math.max(0, Math.min(1, instrumentalVolume)) * 100)}%`}
                </span>
              </div>
              {(() => {
                const instPct = isInstMuted ? 0 : Math.round(Math.max(0, Math.min(1, instrumentalVolume)) * 100);
                return (
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={instPct}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (isInstMuted) setIsInstMuted(false);
                      onInstrumentalVolumeChange(val / 100);
                    }}
                    style={{
                      background: `linear-gradient(to right, #00c2cb 0%, #00c2cb ${instPct}%, #232530 ${instPct}%, #232530 100%)`
                    }}
                    className="w-full h-2.5 rounded-full appearance-none cursor-pointer accent-[#00c2cb]"
                  />
                );
              })()}
            </div>

            {/* Pan Knob Slider */}
            <div className="flex items-center justify-between text-xs font-mono text-[#71717a] pt-1">
              <span>L</span>
              <input
                type="range"
                min="-1"
                max="1"
                step="0.1"
                value={instPan}
                onChange={(e) => setInstPan(parseFloat(e.target.value))}
                className="w-32 h-1.5 bg-[#232530] rounded-full appearance-none cursor-pointer accent-[#71717a]"
                title="Panorâmica L / R"
              />
              <span>R</span>
            </div>
          </div>

          {/* Waveform Strip (Right Canvas) - Tall & Spacious */}
          <div className="flex-1 w-full h-28 sm:h-32 bg-[#0a0b0e] border border-[#1e2029] rounded-3xl overflow-hidden relative cursor-pointer group shadow-inner">
            <canvas
              ref={instCanvasRef}
              width={1400}
              height={120}
              onClick={handleWaveformClick}
              className="w-full h-full block"
            />
          </div>
        </div>

        {/* TRACK 2: VOZ GERADA POR IA (VOZ EM FOCO) */}
        <div className="bg-[#14161f] border border-[#232530] hover:border-[#2f3242] rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center gap-6 sm:gap-8 shadow-xl transition-all">
          {/* Controls Strip (Left) */}
          <div className="w-full md:w-72 flex flex-col gap-4 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center text-lg shadow-sm"
                  style={{ backgroundColor: `${currentVoiceObj.color}20`, color: currentVoiceObj.color }}
                >
                  {currentVoiceObj.icon}
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm sm:text-base font-black text-white tracking-wide leading-snug">
                    Cantor Virtual IA ({currentVoiceObj.label})
                  </h3>
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className="text-xs text-[#9ca3af] block leading-relaxed">
                      Faixa Isolada 100% IA
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-[#1c1f2b] border border-[#272b38] text-[10px] text-[#00c2cb] font-bold">
                      {currentOctave === -1 ? '8ª Baixa (-12st)' : currentOctave === 1 ? '8ª Alta (+12st)' : 'Oitava Original'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Mute / Solo Buttons */}
              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  onClick={() => {
                    const nextMuted = !isAiVoiceMuted;
                    setIsAiVoiceMuted(nextMuted);
                    onAiVoiceVolumeChange(nextMuted ? 0 : (aiVoiceVolume > 0 ? aiVoiceVolume : 1.0));
                  }}
                  className={`w-11 h-11 rounded-2xl text-sm font-black uppercase transition-all cursor-pointer shrink-0 flex items-center justify-center ${
                    isAiVoiceMuted ? 'bg-rose-600 text-white shadow-sm' : 'bg-[#1c1f2b] text-[#71717a] hover:text-white'
                  }`}
                  title={isAiVoiceMuted ? 'Desmutar Voz IA' : 'Mutar Voz IA'}
                >
                  M
                </button>
                <button
                  onClick={() => {
                    const nextSolo = !isAiVoiceSolo;
                    setIsAiVoiceSolo(nextSolo);
                    if (nextSolo) {
                      setIsInstSolo(false);
                      onAiVoiceVolumeChange(aiVoiceVolume > 0 ? aiVoiceVolume : 1.0);
                      onInstrumentalVolumeChange(0);
                    } else {
                      onInstrumentalVolumeChange(0.4);
                      onAiVoiceVolumeChange(1.0);
                    }
                  }}
                  className={`w-11 h-11 rounded-2xl text-sm font-black uppercase transition-all cursor-pointer shrink-0 flex items-center justify-center ${
                    isAiVoiceSolo ? 'bg-[#38bdf8] text-black shadow-sm' : 'bg-[#1c1f2b] text-[#71717a] hover:text-white'
                  }`}
                  title="Solo Voz IA"
                >
                  S
                </button>
              </div>
            </div>

            {/* Volume Slider (0% to 100% Proportional) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-[#9ca3af]">
                <span>Volume Cantor Virtual IA</span>
                <span className="text-[#38bdf8] font-bold">
                  {isAiVoiceMuted || aiVoiceVolume === 0 ? 'MUDO (0%)' : `${Math.round(Math.max(0, Math.min(1, aiVoiceVolume)) * 100)}%`}
                </span>
              </div>
              {(() => {
                const aiPct = isAiVoiceMuted ? 0 : Math.round(Math.max(0, Math.min(1, aiVoiceVolume)) * 100);
                return (
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={aiPct}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (isAiVoiceMuted) setIsAiVoiceMuted(false);
                      onAiVoiceVolumeChange(val / 100);
                    }}
                    style={{
                      background: `linear-gradient(to right, #38bdf8 0%, #38bdf8 ${aiPct}%, #232530 ${aiPct}%, #232530 100%)`
                    }}
                    className="w-full h-2.5 rounded-full appearance-none cursor-pointer accent-[#38bdf8]"
                  />
                );
              })()}
            </div>

            {/* Pan Knob Slider */}
            <div className="flex items-center justify-between text-xs font-mono text-[#71717a] pt-1">
              <span>L</span>
              <input
                type="range"
                min="-1"
                max="1"
                step="0.1"
                value={aiVoicePan}
                onChange={(e) => setAiVoicePan(parseFloat(e.target.value))}
                className="w-32 h-1.5 bg-[#232530] rounded-full appearance-none cursor-pointer accent-[#71717a]"
                title="Panorâmica L / R"
              />
              <span>R</span>
            </div>
          </div>

          {/* Waveform Strip (Right Canvas) - Tall & Spacious */}
          <div className="flex-1 w-full h-28 sm:h-32 bg-[#0a0b0e] border border-[#1e2029] rounded-3xl overflow-hidden relative cursor-pointer group shadow-inner">
            <canvas
              ref={voiceCanvasRef}
              width={1400}
              height={120}
              onClick={handleWaveformClick}
              className="w-full h-full block"
            />
          </div>
        </div>

        {/* SPEEDOMETER INSTRUMENT TUNER & RETORNO VOCAL (Zero Reuso de Gráficos Antigos) */}
        {showTunerDrawer && (
          <SpeedometerVocalTuner
            userPitch={userPitch || null}
            targetPitch={targetPitch || null}
            focusedVoiceLabel={currentVoiceObj.label}
            isListening={isListening}
            onToggleTuner={onToggleTuner}
            accuracyRate={accuracyRate}
            sidetoneVolume={sidetoneVolume}
            onSidetoneVolumeChange={onSidetoneVolumeChange}
            isMonitorMuted={isMonitorMuted}
            onToggleMonitorMute={onToggleMonitorMute}
            tunerError={tunerError}
            onClose={() => {
              setShowTunerDrawer(false);
              if (isListening) {
                if (stopTuner) stopTuner();
                else onToggleTuner();
              }
            }}
          />
        )}
      </main>

      {/* =========================================================================
          BOTTOM TRANSPORT BAR (Moises Player Floating Bottom Dock) - Roomy & Comfortable
      ========================================================================= */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 bg-[#121318]/95 backdrop-blur-md border-t border-[#232530] px-6 sm:px-10 lg:px-12 py-4 sm:py-5 shadow-2xl">
        <div className="w-full max-w-[1700px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-5">
          {/* Playback Transport Buttons */}
          <div className="flex items-center justify-between w-full sm:w-auto gap-4 shrink-0">
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => onSeek(0)}
                className="w-11 h-11 rounded-2xl bg-[#181a20] hover:bg-[#232530] text-[#9ca3af] hover:text-white flex items-center justify-center text-xs transition-all cursor-pointer shadow-sm shrink-0"
                title="Voltar ao início"
              >
                |◀
              </button>
              <button
                onClick={onPlayPause}
                className="w-14 h-14 rounded-2xl bg-[#00c2cb] hover:bg-[#00adb5] text-black font-black flex items-center justify-center text-xl transition-all shadow-md shadow-cyan-900/40 cursor-pointer active:scale-95 shrink-0"
              >
                {isPlaying ? '⏸' : '▶'}
              </button>
              <button
                onClick={onStop}
                className="w-11 h-11 rounded-2xl bg-[#181a20] hover:bg-[#232530] text-[#9ca3af] hover:text-white flex items-center justify-center text-xs transition-all cursor-pointer shadow-sm shrink-0"
                title="Parar"
              >
                ⏹
              </button>
            </div>

            {/* Time Stamp */}
            <div className="text-xs sm:text-sm font-mono font-bold text-[#00c2cb] bg-[#0a0b0e] px-5 py-3 rounded-2xl border border-[#232530] shrink-0">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>

          {/* Timeline Range Scrub */}
          <div className="flex-1 w-full mx-2 sm:mx-6">
            <input
              type="range"
              min="0"
              max={duration || 100}
              step="0.1"
              value={currentTime}
              onChange={(e) => onSeek(parseFloat(e.target.value))}
              className="w-full h-2.5 bg-[#232530] rounded-full appearance-none cursor-pointer accent-[#00c2cb]"
            />
          </div>


        </div>
      </footer>

      {/* =========================================================================
          MODAL 1: SELETOR DE TOM & CAMPO HARMÔNICO (Spacious & Clean)
      ========================================================================= */}
      {showKeyModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-6">
          <div className="bg-[#14161f] border border-[#232530] rounded-3xl p-8 w-full max-w-lg shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-[#232530] pb-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🎼</span>
                <div className="space-y-0.5">
                  <h3 className="text-base sm:text-lg font-black text-white leading-snug">
                    Seletor de Tom & Campo Harmônico
                  </h3>
                  <span className="text-xs text-[#9ca3af] leading-relaxed">
                    Ajuste a tonalidade e confira os acordes da música
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowKeyModal(false)}
                className="text-[#71717a] hover:text-white text-base p-1"
              >
                ✕
              </button>
            </div>

            {/* Current Key Indicator & Pitch Shift (+ / - Meio Tom) */}
            <div className="bg-[#0a0b0e] border border-[#232530] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#71717a] uppercase tracking-wider">
                    Tom Selecionado
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    harmonicField.mode === 'Minor'
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40'
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  }`}>
                    {harmonicField.mode === 'Minor' ? 'Modo Menor (3ª Menor / +3 ST)' : 'Modo Maior (3ª Maior / +4 ST)'}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-black text-[#00c2cb] block leading-none">
                    {transposedKeyName}
                  </span>
                  <span className="text-sm font-bold text-[#cbd5e1]">
                    {harmonicField.displayKey}
                  </span>
                </div>
                <span className="text-xs text-[#9ca3af] block pt-0.5">
                  As vozes virtuais respeitam a escala e a harmonia modal deste tom.
                </span>
              </div>

              {/* Half-Tone (+/- ST) Controls for practice */}
              <div className="flex items-center gap-2 self-start sm:self-center bg-[#14161f] p-1.5 rounded-2xl border border-[#232530]">
                <button
                  onClick={() => onPitchChange(Math.max(-6, pitchSemitones - 1))}
                  className="w-10 h-10 rounded-xl bg-[#1c1f2b] hover:bg-[#282d3e] text-white font-black text-lg flex items-center justify-center transition-all cursor-pointer active:scale-95 border border-[#232530]"
                  title="Descer meio tom (-1 ST)"
                >
                  -
                </button>
                <div className="text-center min-w-[54px] space-y-0.5 px-1">
                  <span className="text-xs font-mono font-black text-white block">
                    {pitchSemitones > 0 ? `+${pitchSemitones}` : pitchSemitones} ST
                  </span>
                  <span className="text-[9px] text-[#71717a] uppercase block">Transp.</span>
                </div>
                <button
                  onClick={() => onPitchChange(Math.min(6, pitchSemitones + 1))}
                  className="w-10 h-10 rounded-xl bg-[#1c1f2b] hover:bg-[#282d3e] text-white font-black text-lg flex items-center justify-center transition-all cursor-pointer active:scale-95 border border-[#232530]"
                  title="Subir meio tom (+1 ST)"
                >
                  +
                </button>
              </div>
            </div>

            {/* SELEÇÃO DIRETA DO TOM (CORREÇÃO RÁPIDA / ESCOLHA DO TOM) */}
            <div className="space-y-3 bg-[#0f1117] border border-[#232530] rounded-2xl p-4">
              <span className="text-xs font-black text-[#00c2cb] uppercase tracking-wider block">
                Tonalidades Mais Comuns (Clique para aplicar o Tom Real):
              </span>
              
              {/* Menores */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-[#a1a1aa] block">
                  Tons Menores (Músicas em Modo Menor):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { key: 'Bm', label: 'Si Menor (Bm)' },
                    { key: 'Am', label: 'Lá Menor (Am)' },
                    { key: 'Em', label: 'Mi Menor (Em)' },
                    { key: 'F#m', label: 'Fá# Menor (F#m)' },
                    { key: 'C#m', label: 'Dó# Menor (C#m)' },
                    { key: 'Dm', label: 'Ré Menor (Dm)' },
                    { key: 'Gm', label: 'Sol Menor (Gm)' },
                    { key: 'Cm', label: 'Dó Menor (Cm)' }
                  ].map((item) => {
                    const isSelected = transposedKeyName === item.key || (detectedKey === item.key && pitchSemitones === 0);
                    return (
                      <button
                        key={item.key}
                        onClick={() => {
                          if (onKeyChange) onKeyChange(item.key);
                          onPitchChange(0);
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                          isSelected
                            ? 'bg-[#00c2cb] text-black font-black border-[#00c2cb] shadow-sm shadow-cyan-900/40'
                            : 'bg-[#181a24] hover:bg-[#232635] text-[#cbd5e1] hover:text-white border-[#272b3a]'
                        }`}
                        title={`Mudar tom para ${item.label}`}
                      >
                        {item.key}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Maiores */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] font-bold text-[#a1a1aa] block">
                  Tons Maiores (Músicas em Modo Maior):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { key: 'C', label: 'Dó Maior (C)' },
                    { key: 'D', label: 'Ré Maior (D)' },
                    { key: 'E', label: 'Mi Maior (E)' },
                    { key: 'F', label: 'Fá Maior (F)' },
                    { key: 'G', label: 'Sol Maior (G)' },
                    { key: 'A', label: 'Lá Maior (A)' },
                    { key: 'B', label: 'Si Maior (B)' },
                    { key: 'Bb', label: 'Si♭ Maior (Bb)' },
                    { key: 'Eb', label: 'Mi♭ Maior (Eb)' }
                  ].map((item) => {
                    const isSelected = transposedKeyName === item.key || (detectedKey === item.key && pitchSemitones === 0);
                    return (
                      <button
                        key={item.key}
                        onClick={() => {
                          if (onKeyChange) onKeyChange(item.key);
                          onPitchChange(0);
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                          isSelected
                            ? 'bg-[#00c2cb] text-black font-black border-[#00c2cb] shadow-sm shadow-cyan-900/40'
                            : 'bg-[#181a24] hover:bg-[#232635] text-[#cbd5e1] hover:text-white border-[#272b3a]'
                        }`}
                        title={`Mudar tom para ${item.label}`}
                      >
                        {item.key}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* CAMPO HARMÔNICO (Acordes correspondentes ao tom) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-[#9ca3af] uppercase tracking-wider block">
                  Acordes do Campo Harmônico de {transposedKeyName}:
                </span>
                <span className="text-[11px] text-[#71717a]">
                  {harmonicField.mode === 'Minor' ? 'Escala Menor Natural' : 'Escala Maior'}
                </span>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {harmonicField.chords.map((ch, idx) => (
                  <div
                    key={idx}
                    className="bg-[#181a24] border border-[#232530] p-2.5 rounded-xl text-center shadow-sm space-y-0.5"
                  >
                    <span className="text-sm font-black text-[#00c2cb] block leading-tight">{ch.chord}</span>
                    <span className="text-[10px] text-[#71717a] font-mono block leading-tight">{ch.degree}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setShowKeyModal(false)}
                className="w-full py-3.5 px-6 bg-[#00c2cb] hover:bg-[#00adb5] text-black font-black rounded-xl text-xs sm:text-sm transition-all cursor-pointer shadow-md shadow-cyan-900/30 flex items-center justify-center gap-2 shrink-0"
              >
                <span>Aplicar e Fechar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: SELETOR DE VOZ EM FOCO (Soprano / Contralto / Tenor / Baixo)
      ========================================================================= */}
      {showVoiceModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <div className="bg-[#14161f] border border-[#232530] rounded-3xl p-6 sm:p-8 w-full max-w-xl sm:max-w-2xl shadow-2xl space-y-6 my-auto">
            <div className="flex items-center justify-between border-b border-[#232530] pb-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🎯</span>
                <div className="space-y-0.5">
                  <h3 className="text-base sm:text-lg font-black text-white leading-snug">
                    Definir Voz que Deseja Focar
                  </h3>
                  <span className="text-xs text-[#9ca3af] leading-relaxed">
                    A IA gerará a voz destacada conforme sua escolha
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowVoiceModal(false)}
                className="text-[#71717a] hover:text-white text-base p-1"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
              {voiceOptions.map((v) => {
                const isSelected = focusedVoice === v.id;
                const voiceOctave = voiceOctaveShifts?.[v.id] ?? (v.id === 'tenor' || v.id === 'bass' ? -1 : 0);
                return (
                  <div
                    key={v.id}
                    className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                      isSelected
                        ? 'bg-[#1c2230] border-[#00c2cb] shadow-md shadow-cyan-900/30 ring-1 ring-[#00c2cb]/50'
                        : 'bg-[#181a24] border-[#232530] hover:border-[#2f3242]'
                    }`}
                  >
                    <div
                      onClick={() => {
                        onSelectFocusedVoice(v.id);
                        setShowVoiceModal(false);
                      }}
                      className="cursor-pointer flex items-center gap-3"
                    >
                      <span className="text-3xl shrink-0">{v.icon}</span>
                      <div className="space-y-0.5 flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="text-sm font-black truncate" style={{ color: isSelected ? '#00c2cb' : 'white' }}>
                            {v.label}
                          </h4>
                          {isSelected && (
                            <span className="text-[10px] uppercase font-bold text-[#00c2cb] bg-[#00c2cb]/10 px-2 py-0.5 rounded-full border border-[#00c2cb]/30 shrink-0">
                              Ativa
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#71717a] leading-snug truncate">{v.role}</p>
                      </div>
                    </div>

                    {/* Seletor de oitava individual da voz (100% responsivo, sem cortar) */}
                    {onVoiceOctaveChange && (
                      <div className="pt-2.5 border-t border-[#232530]/80 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-[#9ca3af] flex items-center gap-1">
                            <span>🎹</span> Oitava:
                          </span>
                          <span className="text-[10px] font-bold text-[#00c2cb] bg-[#00c2cb]/10 px-1.5 py-0.5 rounded border border-[#00c2cb]/20">
                            {voiceOctave === -1 ? '8ª Baixa (-12st)' : voiceOctave === 1 ? '8ª Alta (+12st)' : 'Original (0st)'}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 bg-[#0d0e15] p-1 rounded-xl border border-[#232530] gap-1 w-full">
                          <button
                            type="button"
                            onClick={() => onVoiceOctaveChange(v.id, -1)}
                            className={`py-1.5 px-1 text-[10px] sm:text-[11px] font-bold rounded-lg transition-all text-center cursor-pointer truncate ${
                              voiceOctave === -1
                                ? 'bg-[#00c2cb] text-[#0d0e15] shadow-sm'
                                : 'text-[#9ca3af] hover:text-white hover:bg-white/5'
                            }`}
                            title="Oitava abaixo (-12 semitons)"
                          >
                            8ª Baixa
                          </button>
                          <button
                            type="button"
                            onClick={() => onVoiceOctaveChange(v.id, 0)}
                            className={`py-1.5 px-1 text-[10px] sm:text-[11px] font-bold rounded-lg transition-all text-center cursor-pointer truncate ${
                              voiceOctave === 0
                                ? 'bg-[#00c2cb] text-[#0d0e15] shadow-sm'
                                : 'text-[#9ca3af] hover:text-white hover:bg-white/5'
                            }`}
                            title="Oitava original"
                          >
                            Original
                          </button>
                          <button
                            type="button"
                            onClick={() => onVoiceOctaveChange(v.id, 1)}
                            className={`py-1.5 px-1 text-[10px] sm:text-[11px] font-bold rounded-lg transition-all text-center cursor-pointer truncate ${
                              voiceOctave === 1
                                ? 'bg-[#00c2cb] text-[#0d0e15] shadow-sm'
                                : 'text-[#9ca3af] hover:text-white hover:bg-white/5'
                            }`}
                            title="Oitava acima (+12 semitons)"
                          >
                            8ª Alta
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Dica Musical explicativa */}
            <div className="bg-[#1c2230]/70 border border-[#00c2cb]/30 rounded-2xl p-3.5 text-xs text-[#9ca3af] flex items-start gap-2.5">
              <span className="text-base leading-none">💡</span>
              <p className="leading-relaxed">
                <strong className="text-white">Padrão Coral & Ajuste:</strong> Por padrão, <span className="text-[#00c2cb] font-semibold">Tenor</span> e <span className="text-[#00c2cb] font-semibold">Baixo</span> iniciam em <strong>8ª Baixa</strong> (adequado à tessitura masculina), e <span className="text-[#00c2cb] font-semibold">Soprano</span> e <span className="text-[#00c2cb] font-semibold">Contralto</span> iniciam na <strong>Oitava Original</strong>. Você pode alterar qualquer oitava e salvar os ajustes para abrir sempre pronta nesta música!
              </p>
            </div>

            {/* Salvar Configurações Desta Música */}
            {onSaveSongPreferences && (
              <div className="bg-[#181a24] border border-[#272b38] rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="space-y-0.5 text-left w-full sm:w-auto">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">💾</span>
                    <h5 className="text-xs font-bold text-white">Salvar Configurações Desta Música</h5>
                  </div>
                  <p className="text-[11px] text-[#71717a]">
                    Salva a voz ativa ({currentVoiceObj.label}) e as oitavas para abrir sempre pronta neste ensaio.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSaveClick}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl bg-[#00c2cb]/15 hover:bg-[#00c2cb]/25 text-xs font-bold text-[#00c2cb] border border-[#00c2cb]/40 flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0"
                >
                  <span>{justSaved ? '✅ Ajustes Salvos!' : 'Salvar Preferências'}</span>
                </button>
              </div>
            )}

            {onRegenerateVirtualStems && (
              <div className="pt-4 border-t border-[#232530] flex flex-col sm:flex-row items-center justify-between gap-3">
                <span className="text-xs text-[#9ca3af]">Motor de Síntese Vocal: Phase Vocoder HD (100% tempo sync)</span>
                <button
                  type="button"
                  onClick={() => {
                    onRegenerateVirtualStems();
                    setShowVoiceModal(false);
                  }}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl bg-[#1c2230] hover:bg-[#252c3e] text-xs font-bold text-[#00c2cb] border border-[#00c2cb]/30 flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm hover:border-[#00c2cb]"
                >
                  ✨ Recalcular Vozes IA (Alta Fidelidade)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: EXPORTAR & WHATSAPP
      ========================================================================= */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-6">
          <div className="bg-[#14161f] border border-[#232530] rounded-3xl p-8 w-full max-w-md shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-[#232530] pb-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📥</span>
                <h3 className="text-base sm:text-lg font-black text-white leading-snug">Exportar Ensaio</h3>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-[#71717a] hover:text-white text-base p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs sm:text-sm text-[#9ca3af] leading-relaxed">
              O áudio será exportado com a música e a voz de <strong>{currentVoiceObj.label}</strong> ajustadas nos volumes que você configurou.
            </p>

            <div className="space-y-3 pt-2">
              <button
                onClick={handleShareWhatsApp}
                className="w-full py-4 px-10 bg-[#25d366] hover:bg-[#20ba5a] text-black font-black rounded-2xl text-xs sm:text-sm flex items-center justify-center gap-3 transition-all cursor-pointer shadow-md shadow-emerald-900/30 shrink-0 min-w-[200px]"
              >
                <span className="text-lg">📱</span>
                <span className="px-2 font-black">Enviar pelo WhatsApp</span>
              </button>

              <button
                onClick={async () => {
                  if (onExportMix) await onExportMix('wav');
                  setShowExportModal(false);
                }}
                className="w-full py-4 px-10 bg-[#181a24] hover:bg-[#232530] text-white border border-[#232530] font-black rounded-2xl text-xs sm:text-sm flex items-center justify-center gap-3 transition-all cursor-pointer shrink-0 min-w-[200px]"
              >
                <span className="text-lg">💾</span>
                <span className="px-2 font-black">Baixar Arquivo de Áudio (WAV)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MoisesStudioPlayer;
