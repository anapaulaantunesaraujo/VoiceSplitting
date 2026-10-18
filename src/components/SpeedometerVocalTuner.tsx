import React, { useMemo } from 'react';
import { PitchInfo } from '../hooks/useVocalTuner';

interface SpeedometerVocalTunerProps {
  userPitch: PitchInfo | null;
  targetPitch: PitchInfo | null;
  focusedVoiceLabel?: string;
  isListening: boolean;
  onToggleTuner: () => void;
  accuracyRate: number; // 0 to 100%
  sidetoneVolume: number;
  onSidetoneVolumeChange: (vol: number) => void;
  isMonitorMuted: boolean;
  onToggleMonitorMute: () => void;
  tunerError?: string | null;
  onClose?: () => void;
}

export const SpeedometerVocalTuner: React.FC<SpeedometerVocalTunerProps> = ({
  userPitch,
  targetPitch,
  focusedVoiceLabel = 'Contralto',
  isListening,
  onToggleTuner,
  accuracyRate,
  sidetoneVolume,
  onSidetoneVolumeChange,
  isMonitorMuted,
  onToggleMonitorMute,
  tunerError,
  onClose
}) => {
  // Calculate relative pitch deviation in cents (-50 to +50)
  const { centsDiff, isVoiceActive, isInTune, currentNoteLabel, targetNoteLabel } = useMemo(() => {
    if (!userPitch || userPitch.frequency <= 0) {
      return {
        centsDiff: 0,
        isVoiceActive: false,
        isInTune: false,
        currentNoteLabel: '—',
        targetNoteLabel: targetPitch?.note ? `${targetPitch.note}${targetPitch.octave}` : '—'
      };
    }

    let diff = userPitch.cents;
    if (targetPitch && targetPitch.frequency > 0) {
      let calc = 1200 * (Math.log(userPitch.frequency / targetPitch.frequency) / Math.log(2));
      while (calc > 600) calc -= 1200;
      while (calc < -600) calc += 1200;
      diff = calc;
    }

    const clampedDiff = Math.max(-50, Math.min(50, diff));
    const inTune = Math.abs(clampedDiff) <= 10;

    return {
      centsDiff: clampedDiff,
      isVoiceActive: true,
      isInTune: inTune,
      currentNoteLabel: `${userPitch.note}${userPitch.octave}`,
      targetNoteLabel: targetPitch?.note ? `${targetPitch.note}${targetPitch.octave}` : '—'
    };
  }, [userPitch, targetPitch]);

  // Convert cents (-50 to +50) to needle rotation angle (-70 deg to +70 deg)
  const needleAngle = useMemo(() => {
    if (!isVoiceActive) return 0;
    return (centsDiff / 50) * 70;
  }, [centsDiff, isVoiceActive]);

  // Needle and status glow color: emerald green when in-tune, ruby red when out-of-tune
  const statusColor = !isVoiceActive ? '#71717a' : isInTune ? '#10b981' : '#ef4444';
  const statusText = !isVoiceActive
    ? 'Aguardando sua voz no microfone...'
    : isInTune
    ? `🎯 Excelente! Você está cravado na nota da voz ${focusedVoiceLabel}!`
    : centsDiff < 0
    ? `⬇️ Tom Baixo (♭ Bemol): suba um pouco a voz para afinar em ${focusedVoiceLabel}`
    : `⬆️ Tom Alto (♯ Sustenido): desça um pouco a voz para afinar em ${focusedVoiceLabel}`;

  return (
    <div className="w-full bg-[#12141c] border border-[#232530] rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden transition-all">
      {/* Top Header with title and controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#232530] pb-5">
        <div className="flex items-center gap-3.5">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl shadow-md transition-colors"
            style={{ backgroundColor: `${statusColor}20`, color: statusColor }}
          >
            🎙️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-black text-white tracking-tight">
                Afinador em Velocímetro & Retorno Vocal
              </h3>
              <span
                className="text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full border shadow-sm"
                style={{
                  backgroundColor: `${statusColor}15`,
                  borderColor: `${statusColor}40`,
                  color: statusColor
                }}
              >
                Voz: {focusedVoiceLabel}
              </span>
            </div>
            <p className="text-xs text-[#9ca3af] leading-relaxed pt-0.5">
              Microfone ativo com retorno sonoro nos fones e avaliação da voz selecionada em tempo real
            </p>
          </div>
        </div>

        {/* Microphone Sidetone & Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Sidetone / Mic Monitor Volume Slider */}
          <div className="flex items-center gap-2.5 bg-[#181a24] border border-[#272b38] px-3.5 py-2 rounded-2xl shadow-sm">
            <button
              onClick={onToggleMonitorMute}
              className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-xl transition-all cursor-pointer ${
                isMonitorMuted
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
                  : 'bg-[#00c2cb]/20 text-[#00c2cb] border border-[#00c2cb]/50 hover:bg-[#00c2cb]/30 shadow-sm'
              }`}
              title={isMonitorMuted ? 'Retorno no Fone Desligado (clique para ouvir sua voz)' : 'Retorno no Fone Ativo sem delay (clique para mutar som no fone)'}
            >
              <span>{isMonitorMuted ? '🔇' : '🎧'}</span>
              <span className="hidden md:inline">{isMonitorMuted ? 'Retorno: Desligado' : 'Retorno: Fone'}</span>
            </button>
            <div className="flex flex-col">
              <span className="text-[10px] text-[#71717a] font-bold leading-none">Vol. Fone</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                disabled={isMonitorMuted}
                value={isMonitorMuted ? 0 : sidetoneVolume}
                onChange={(e) => onSidetoneVolumeChange(parseFloat(e.target.value))}
                className="w-16 sm:w-20 h-1.5 bg-[#232530] rounded-full appearance-none cursor-pointer accent-[#00c2cb] disabled:opacity-40"
              />
            </div>
          </div>

          <button
            onClick={onToggleTuner}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black transition-all cursor-pointer border flex items-center gap-2 whitespace-nowrap shadow-sm ${
              isListening
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 hover:bg-rose-500/30 ring-1 ring-rose-500/30'
                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/30 ring-1 ring-emerald-500/30'
            }`}
            title={isListening ? 'Desligar microfone' : 'Ligar microfone'}
          >
            <span>{isListening ? '⏹️ Desligar Mic' : '🎙️ Ligar Mic'}</span>
            {isListening && (
              <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping" />
            )}
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-2xl bg-[#1c1f2b] hover:bg-[#252a3a] text-[#71717a] hover:text-white flex items-center justify-center font-bold text-sm transition-colors cursor-pointer border border-[#272b38] shrink-0"
              title="Fechar e Desligar Microfone"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {tunerError && (
        <div className="my-4 p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-xs text-rose-300 flex items-center gap-3">
          <span>⚠️</span>
          <span>{tunerError}</span>
        </div>
      )}

      {/* Main Speedometer Gauge Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center pt-6">
        {/* LEFT COLUMN: Instrument Speedometer Dial (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col items-center justify-center relative">
          <div className="w-full max-w-md relative flex flex-col items-center">
            {/* SVG Speedometer Gauge Arc */}
            <svg
              viewBox="0 0 320 200"
              className="w-full max-h-56 select-none overflow-visible"
              aria-label="Afinador Velocímetro de Instrumento"
            >
              <defs>
                {/* Glow Filter for Needle and In-Tune Center */}
                <filter id="speedoGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <linearGradient id="arcTrackGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity="0.8" />
                  <stop offset="35%" stopColor="#f59e0b" stopOpacity="0.8" />
                  <stop offset="48%" stopColor="#10b981" />
                  <stop offset="52%" stopColor="#10b981" />
                  <stop offset="65%" stopColor="#f59e0b" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity="0.8" />
                </linearGradient>
              </defs>

              {/* Outer Background Arc Track */}
              <path
                d="M 30 170 A 130 130 0 0 1 290 170"
                fill="none"
                stroke="#1c1f2b"
                strokeWidth="20"
                strokeLinecap="round"
              />

              {/* Colored Speedometer Gradient Arc */}
              <path
                d="M 30 170 A 130 130 0 0 1 290 170"
                fill="none"
                stroke="url(#arcTrackGrad)"
                strokeWidth="12"
                strokeLinecap="round"
                opacity="0.85"
              />

              {/* In-Tune Sweetspot Center Zone Pill (-10 to +10 cents) */}
              <path
                d="M 136 42 A 130 130 0 0 1 184 42"
                fill="none"
                stroke="#10b981"
                strokeWidth="16"
                filter="url(#speedoGlow)"
              />

              {/* Dial Tick Marks & Labels */}
              {/* -50 cents (flat) */}
              <line x1="32" y1="170" x2="48" y2="164" stroke="#ef4444" strokeWidth="2.5" />
              <text x="24" y="190" fill="#ef4444" fontSize="10" fontWeight="bold" textAnchor="middle">
                -50
              </text>

              {/* -25 cents */}
              <line x1="68" y1="96" x2="80" y2="104" stroke="#f59e0b" strokeWidth="2" />
              <text x="56" y="92" fill="#9ca3af" fontSize="9" fontWeight="bold">
                -25
              </text>

              {/* 0 CENTS: IDEAL TUNED CENTER */}
              <line x1="160" y1="36" x2="160" y2="52" stroke="#10b981" strokeWidth="3.5" filter="url(#speedoGlow)" />
              <text x="160" y="24" fill="#10b981" fontSize="13" fontWeight="900" textAnchor="middle" filter="url(#speedoGlow)">
                0 (AFINADO)
              </text>

              {/* +25 cents */}
              <line x1="252" y1="96" x2="240" y2="104" stroke="#f59e0b" strokeWidth="2" />
              <text x="264" y="92" fill="#9ca3af" fontSize="9" fontWeight="bold">
                +25
              </text>

              {/* +50 cents (sharp) */}
              <line x1="288" y1="170" x2="272" y2="164" stroke="#ef4444" strokeWidth="2.5" />
              <text x="296" y="190" fill="#ef4444" fontSize="10" fontWeight="bold" textAnchor="middle">
                +50
              </text>

              {/* Sub-labels: Bemol vs Sustenido */}
              <text x="65" y="150" fill="#ef4444" fontSize="9" fontWeight="bold" opacity="0.8">
                ♭ BEMOL
              </text>
              <text x="220" y="150" fill="#ef4444" fontSize="9" fontWeight="bold" opacity="0.8">
                ♯ SUSTENIDO
              </text>

              {/* PHYSICAL NEEDLE (Pivoting Pointer from Bottom Center 160, 170) */}
              <g
                style={{
                  transformOrigin: '160px 170px',
                  transform: `rotate(${needleAngle}deg)`,
                  transition: 'transform 90ms cubic-bezier(0.1, 0.9, 0.2, 1)'
                }}
              >
                {/* Needle Shadow */}
                <polygon
                  points="158,170 162,170 160.5,48 159.5,48"
                  fill="rgba(0,0,0,0.5)"
                  transform="translate(2, 3)"
                />
                {/* Vibrant Pointer Arrow */}
                <polygon
                  points="156,170 164,170 161,42 159,42"
                  fill={statusColor}
                  filter="url(#speedoGlow)"
                />
                {/* Arrowhead point */}
                <polygon
                  points="154,52 166,52 160,34"
                  fill={statusColor}
                  filter="url(#speedoGlow)"
                />
              </g>

              {/* Needle Hub Pivot Cap */}
              <circle cx="160" cy="170" r="16" fill="#14161f" stroke="#2b354f" strokeWidth="4" />
              <circle cx="160" cy="170" r="8" fill={statusColor} filter="url(#speedoGlow)" />
            </svg>

            {/* Live Sung Note & Cents Readout Badge below Needle Pivot */}
            <div className="flex flex-col items-center mt-1">
              <div
                className="px-6 py-2 rounded-2xl border flex items-center gap-3 shadow-lg transition-all"
                style={{
                  backgroundColor: `${statusColor}15`,
                  borderColor: `${statusColor}50`
                }}
              >
                <div className="text-center">
                  <span className="text-[10px] text-[#9ca3af] uppercase font-bold tracking-wider block">
                    Nota Cantada
                  </span>
                  <span
                    className="text-2xl font-black tracking-tight"
                    style={{ color: statusColor }}
                  >
                    {currentNoteLabel}
                  </span>
                </div>

                <div className="h-8 w-px bg-[#272b38]" />

                <div className="text-center">
                  <span className="text-[10px] text-[#9ca3af] uppercase font-bold tracking-wider block">
                    Desvio
                  </span>
                  <span
                    className="text-sm font-mono font-black"
                    style={{ color: statusColor }}
                  >
                    {isVoiceActive ? `${centsDiff > 0 ? '+' : ''}${Math.round(centsDiff)} cents` : '0 cents'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Accuracy % Score & Pedagogical Feedback (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-5 bg-[#161822] border border-[#272b38] rounded-3xl p-6 shadow-inner">
          {/* Big Vocal Accuracy Rate Gauge */}
          <div className="flex items-center justify-between border-b border-[#272b38] pb-4">
            <div>
              <span className="text-xs uppercase tracking-wider font-black text-[#9ca3af] block">
                Percentual de Acerto
              </span>
              <p className="text-[11px] text-[#71717a] leading-tight pt-0.5">
                Precisão contínua na voz selecionada
              </p>
            </div>

            {/* Glowing Accuracy Pill */}
            <div className="flex items-baseline gap-1 bg-[#10121a] border border-[#2b354f] px-4 py-2 rounded-2xl shadow-md">
              <span
                className={`text-3xl font-black tracking-tight ${
                  accuracyRate >= 80
                    ? 'text-emerald-400'
                    : accuracyRate >= 50
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`}
              >
                {accuracyRate}%
              </span>
              <span className="text-xs font-bold text-[#71717a]">precisão</span>
            </div>
          </div>

          {/* Target Choral Note Reference */}
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="bg-[#12141c] border border-[#232530] p-3 rounded-2xl">
              <span className="text-[10px] text-[#71717a] uppercase font-bold block">Voz Escolhida</span>
              <span className="text-sm font-black text-white">{focusedVoiceLabel}</span>
            </div>
            <div className="bg-[#12141c] border border-[#232530] p-3 rounded-2xl">
              <span className="text-[10px] text-[#71717a] uppercase font-bold block">Nota Guia Alvo</span>
              <span className="text-sm font-black text-[#00c2cb]">{targetNoteLabel}</span>
            </div>
          </div>

          {/* Dynamic Coach Guidance Card */}
          <div
            className="p-4 rounded-2xl border text-xs leading-relaxed font-medium transition-all shadow-sm"
            style={{
              backgroundColor: `${statusColor}10`,
              borderColor: `${statusColor}35`,
              color: statusColor === '#71717a' ? '#cbd5e1' : statusColor
            }}
          >
            {statusText}
          </div>

          {/* Quick tips for choral rehearsal */}
          <div className="text-[11px] text-[#9ca3af] space-y-1.5 pt-1">
            <div className="flex items-start gap-2">
              <span className="text-emerald-400 font-bold">✓</span>
              <span>
                <strong>Centro Verde:</strong> Sua voz está afinada com a partitura da voz {focusedVoiceLabel}.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-rose-400 font-bold">✗</span>
              <span>
                <strong>Ponteiro Vermelho:</strong> Você está desafinado; ajuste a altura do canto até a seta firmar no centro.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
