import React, { useEffect, useRef, useState } from 'react';
import { PitchInfo } from '../hooks/useVocalTuner';

interface VocalTunerCanvasProps {
  userPitch: PitchInfo | null;
  targetPitch: PitchInfo | null;
  streakCount?: number;
  focusedVoiceLabel?: string;
  isListening?: boolean;
  onToggleTuner?: () => void;
  tunerError?: string | null;
  width?: number;
  height?: number;
  isEvaluationMode?: boolean;
  liveAccuracy?: number;
  liveDetectedVoiceLabel?: string;
  isMatchingFocused?: boolean;
}

interface PitchHistoryPoint {
  centsDiff: number | null;
  inTune: boolean;
  timestamp: number;
}

export const VocalTunerCanvas: React.FC<VocalTunerCanvasProps> = ({
  userPitch,
  targetPitch,
  streakCount = 0,
  focusedVoiceLabel = 'Voz Principal',
  isListening = false,
  onToggleTuner,
  tunerError,
  width = 800,
  height = 230,
  isEvaluationMode = false,
  liveAccuracy = 0,
  liveDetectedVoiceLabel = '--',
  isMatchingFocused = false
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const historyRef = useRef<PitchHistoryPoint[]>([]);
  const animFrameRef = useRef<number | null>(null);
  const currentYRef = useRef<number | null>(null);
  const smoothedCentsRef = useRef<number | null>(null);

  const [canvasWidth, setCanvasWidth] = useState<number>(width);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setCanvasWidth(Math.floor(entry.contentRect.width));
        }
      }
    });
    observer.observe(containerRef.current);
    if (containerRef.current.clientWidth > 0) {
      setCanvasWidth(containerRef.current.clientWidth);
    }
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // 1. Calculate current cents offset relative to target pitch or 0
    let centsOffset: number | null = null;
    let isInTune = false;

    if (userPitch) {
      if (targetPitch && targetPitch.frequency > 0) {
        let centsDiff = 1200 * (Math.log(userPitch.frequency / targetPitch.frequency) / Math.log(2));
        // Normalize across octaves so singers in different vocal ranges (e.g. Contralto vs Tenor) singing the same note are in tune
        while (centsDiff > 600) centsDiff -= 1200;
        while (centsDiff < -600) centsDiff += 1200;
        centsOffset = Math.max(-60, Math.min(60, centsDiff));
      } else {
        centsOffset = Math.max(-60, Math.min(60, userPitch.cents));
      }

      // Smooth cents offset with Exponential Moving Average (EMA) to prevent spiky graph undulations
      if (smoothedCentsRef.current !== null) {
        centsOffset = smoothedCentsRef.current * 0.6 + centsOffset * 0.4;
      }
      smoothedCentsRef.current = centsOffset;

      isInTune = Math.abs(centsOffset) <= 15;
    } else {
      smoothedCentsRef.current = null;
    }

    // 2. Append new pitch point to history array
    const history = historyRef.current;
    history.push({
      centsDiff: centsOffset,
      inTune: isInTune,
      timestamp: performance.now()
    });

    // Keep history capped at 120 points (~6 seconds of pitch curve trail)
    if (history.length > 120) {
      history.shift();
    }
  }, [userPitch, targetPitch]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderGraph = () => {
      const w = canvas.width;
      const h = canvas.height;
      const centerY = h / 2 + 10;
      const history = historyRef.current;

      ctx.clearRect(0, 0, w, h);

      // 1. Dark Mode Background Container
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, w, h);

      // 2. Tolerance Zone (-15 to +15 cents band across graph)
      const centsScale = (h - 70) / 120; // pixels per cent
      const toleranceTop = centerY - 15 * centsScale;
      const toleranceHeight = 30 * centsScale;

      ctx.fillStyle = 'rgba(16, 185, 129, 0.09)';
      ctx.fillRect(0, toleranceTop, w, toleranceHeight);

      // Tolerance band border lines
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, toleranceTop);
      ctx.lineTo(w, toleranceTop);
      ctx.moveTo(0, toleranceTop + toleranceHeight);
      ctx.lineTo(w, toleranceTop + toleranceHeight);
      ctx.stroke();
      ctx.setLineDash([]); // Reset dash

      // 3. Grid Lines & Pitch Scale Labels
      const gridLevels = [
        { cents: +50, label: '+50c (Agudo)', color: '#ef4444' },
        { cents: 0, label: 'NOTA ALVO DA MÚSICA (0c)', color: '#2563eb' },
        { cents: -50, label: '-50c (Grave)', color: '#ef4444' }
      ];

      gridLevels.forEach((grid) => {
        const y = centerY - grid.cents * centsScale;
        ctx.strokeStyle = grid.cents === 0 ? 'rgba(37, 99, 235, 0.5)' : 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = grid.cents === 0 ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(40, y);
        ctx.lineTo(w - 40, y);
        ctx.stroke();

        ctx.fillStyle = grid.color;
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(grid.label, 36, y + 3);
      });

      // 4. Target Pitch Axis Line & Glowing Target Point (Where voice must stay)
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(40, centerY);
      ctx.lineTo(w - 40, centerY);
      ctx.stroke();

      // Glowing Target Dot on right edge of line
      const targetDotX = w - 60;
      ctx.save();
      ctx.beginPath();
      ctx.arc(targetDotX, centerY, 8, 0, 2 * Math.PI);
      ctx.fillStyle = '#2563eb';
      ctx.shadowColor = '#3b82f6';
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.restore();

      // 5. Draw Smooth Bezier Scrolling User Pitch Curve (Eliminates Spiky Undulations)
      if (history.length > 1) {
        const stepX = (w - 100) / 120;
        const startX = 40;

        ctx.save();
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Filter valid points to compute smooth curve segments
        const points: { x: number; y: number; inTune: boolean }[] = [];
        for (let i = 0; i < history.length; i++) {
          const pt = history[i];
          if (pt.centsDiff !== null) {
            const x = startX + i * stepX;
            const y = centerY - pt.centsDiff * centsScale;
            points.push({ x, y, inTune: pt.inTune });
          }
        }

        if (points.length > 1) {
          const lastPoint = points[points.length - 1];
          ctx.strokeStyle = lastPoint.inTune ? '#10b981' : '#ef4444';
          ctx.shadowColor = lastPoint.inTune ? '#10b981' : '#ef4444';
          ctx.shadowBlur = lastPoint.inTune ? 12 : 0;

          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);

          for (let i = 1; i < points.length - 1; i++) {
            const xc = (points[i].x + points[i + 1].x) / 2;
            const yc = (points[i].y + points[i + 1].y) / 2;
            ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
          }

          if (points.length > 2) {
            ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
          }

          ctx.stroke();
        }
        ctx.restore();

        // 6. Draw Current Pitch Lead Head Dot
        const lastPt = history[history.length - 1];
        if (lastPt && lastPt.centsDiff !== null) {
          const headX = startX + (history.length - 1) * stepX;
          const targetY = centerY - lastPt.centsDiff * centsScale;

          if (currentYRef.current === null) {
            currentYRef.current = targetY;
          } else {
            currentYRef.current += (targetY - currentYRef.current) * 0.25;
          }

          const headY = currentYRef.current;
          const inTune = lastPt.inTune;

          ctx.save();
          ctx.beginPath();
          ctx.arc(headX, headY, 7, 0, 2 * Math.PI);
          ctx.fillStyle = inTune ? '#10b981' : '#ef4444';
          ctx.shadowColor = inTune ? '#10b981' : '#ef4444';
          ctx.shadowBlur = 16;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
          ctx.restore();
        }
      }

      // 7. Top Header Banner Overlay (Focused Voice & Exact Target Note at Current Moment)
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px Outfit, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`🎯 Voz em Foco: ${focusedVoiceLabel}`, 40, 24);

      if (targetPitch && targetPitch.frequency > 0) {
        ctx.fillStyle = '#3b82f6';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`Nota Alvo do Instante: ${targetPitch.note}${targetPitch.octave} (${Math.round(targetPitch.frequency)} Hz)`, w - 40, 24);
      }

      animFrameRef.current = requestAnimationFrame(renderGraph);
    };

    renderGraph();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [userPitch, targetPitch, streakCount, focusedVoiceLabel, canvasWidth, height]);

  // Pitch accuracy check for visual color feedback on Sua Voz badge
  let isInTune = false;
  if (userPitch && targetPitch && targetPitch.frequency > 0) {
    let centsDiff = 1200 * (Math.log(userPitch.frequency / targetPitch.frequency) / Math.log(2));
    while (centsDiff > 600) centsDiff -= 1200;
    while (centsDiff < -600) centsDiff += 1200;
    if (Math.abs(centsDiff) <= 15) isInTune = true;
  } else if (userPitch) {
    if (Math.abs(userPitch.cents) <= 15) isInTune = true;
  }

  return (
    <div className="w-full h-full flex flex-col justify-between space-y-3">
      {/* Top Header Banner & Streak Badge */}
      <div className="w-full flex items-center justify-between pb-2 border-b border-[#2e2e2e]">
        <span className="text-[11px] font-extrabold tracking-wider uppercase text-[#3b82f6] flex items-center gap-1.5 truncate">
          🎤 VISUALIZADOR DO AFINADOR & VALIDAÇÃO POSITIVA
        </span>
        <div className="flex items-center gap-2">
          {isEvaluationMode && (
            <span className="text-[10px] font-bold text-amber-300 bg-amber-950/80 px-2.5 py-0.5 rounded-full border border-amber-500/40 animate-pulse whitespace-nowrap">
              📊 Avaliação: {liveAccuracy}% de acerto
            </span>
          )}
          {isInTune && (
            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/80 px-2.5 py-0.5 rounded-full border border-emerald-500/40 animate-pulse whitespace-nowrap ml-2">
              ✨ {streakCount > 0 ? `+${streakCount}` : ''} Afinado!
            </span>
          )}
        </div>
      </div>

      {tunerError && (
        <div className="bg-amber-950/50 border border-amber-500/30 text-amber-400 text-xs px-3 py-1.5 rounded-xl text-center">
          ⚠️ {tunerError}
        </div>
      )}

      {/* Monitor Bar: Mic Button on Left + Referência & Sua Voz on Right */}
      <div className="w-full bg-[#0a0a0a] border border-[#2e2e2e] rounded-xl p-2.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 shadow-inner">
        {/* Realtime Microphone Control Button */}
        {onToggleTuner && (
          <button
            onClick={onToggleTuner}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all shadow-md flex items-center gap-2 cursor-pointer whitespace-nowrap active:scale-95 ${
              isListening
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/30 shadow-lg shadow-emerald-950/60'
                : 'bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-blue-900/40'
            }`}
          >
            {isListening ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-white shadow-sm animate-pulse" />
                <span>🛑 Desligar Microfone</span>
              </>
            ) : (
              <>
                <span>🎙️ Ativar Microfone</span>
              </>
            )}
          </button>
        )}

        {/* Monitors: Referência, Sua Voz & Voz Detectada */}
        <div className="flex items-center gap-3 sm:gap-5 ml-auto">
          <div className="text-right sm:text-center">
            <span className="text-[9px] uppercase font-extrabold text-[#737373] tracking-wider block">
              Referência (Nota Alvo)
            </span>
            <span className="text-sm sm:text-base font-black text-[#3b82f6] leading-tight block">
              {targetPitch ? `${targetPitch.note}${targetPitch.octave}` : 'Focar Voz'}
            </span>
          </div>

          <div className="h-6 w-px bg-[#2e2e2e]" />

          <div className="text-right sm:text-center">
            <span className="text-[9px] uppercase font-extrabold text-[#737373] tracking-wider block">
              Sua Voz (Captação)
            </span>
            <span className={`text-sm sm:text-base font-black leading-tight block ${isInTune ? 'text-emerald-400' : 'text-white'}`}>
              {userPitch ? `${userPitch.note}${userPitch.octave}` : '--'}
            </span>
          </div>

          {isEvaluationMode && liveDetectedVoiceLabel && liveDetectedVoiceLabel !== '--' && (
            <>
              <div className="h-6 w-px bg-[#2e2e2e]" />
              <div className="text-right sm:text-center">
                <span className="text-[9px] uppercase font-extrabold text-[#737373] tracking-wider block">
                  Voz Cantada
                </span>
                <span
                  className={`text-sm sm:text-base font-black leading-tight block ${
                    isMatchingFocused ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {liveDetectedVoiceLabel}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Realtime Pitch Line Canvas */}
      <div ref={containerRef} className="w-full flex-1 min-h-[200px]">
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={height}
          className="w-full h-full rounded-xl bg-[#0a0a0a] border border-[#2e2e2e] shadow-2xl block"
        />
      </div>
    </div>
  );
};

export default VocalTunerCanvas;
