import React, { useState } from 'react';
import { VocalEvaluationResult } from '../hooks/useVocalEvaluation';

interface VocalEvaluationModalProps {
  isOpen: boolean;
  result: VocalEvaluationResult | null;
  onClose: () => void;
  onRetry: () => void;
  onSaveToHistory?: (result: VocalEvaluationResult) => void;
}

export const VocalEvaluationModal: React.FC<VocalEvaluationModalProps> = ({
  isOpen,
  result,
  onClose,
  onRetry,
  onSaveToHistory
}) => {
  const [isSaved, setIsSaved] = useState<boolean>(false);

  if (!isOpen || !result) return null;

  const {
    accuracyPercentage,
    focusedVoiceLabel,
    focusedVoiceRole,
    detectedVoiceLabel,
    detectedVoiceRole,
    detectedVoicePercentage,
    voiceBreakdown,
    pedagogicalFeedback,
    pedagogicalTitle,
    pedagogicalType,
    totalSingingSeconds,
    streakMax,
    centsAverageDeviation,
    date,
    songTitle
  } = result;

  const isMatching = result.detectedVoice === result.focusedVoice;

  // Format seconds to mm:ss
  const formatSeconds = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Color scheme based on accuracy score
  const getScoreColor = (pct: number) => {
    if (pct >= 80) return { text: 'text-emerald-400', ring: 'border-emerald-500', glow: 'shadow-emerald-500/30' };
    if (pct >= 60) return { text: 'text-blue-400', ring: 'border-blue-500', glow: 'shadow-blue-500/30' };
    if (pct >= 40) return { text: 'text-amber-400', ring: 'border-amber-500', glow: 'shadow-amber-500/30' };
    return { text: 'text-rose-400', ring: 'border-rose-500', glow: 'shadow-rose-500/30' };
  };

  const scoreColor = getScoreColor(accuracyPercentage);

  const handleSave = () => {
    if (onSaveToHistory) {
      onSaveToHistory(result);
      setIsSaved(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-2xl bg-[#141414] border border-[#2e2e2e] rounded-3xl p-6 sm:p-8 shadow-2xl text-white space-y-6 max-h-[92vh] overflow-y-auto">
        {/* Close X Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-9 h-9 rounded-full bg-[#1e1e1e] hover:bg-[#2e2e2e] text-[#a3a3a3] hover:text-white flex items-center justify-center border border-[#383838] transition-all cursor-pointer text-lg font-bold"
          title="Fechar"
        >
          ✕
        </button>

        {/* Modal Header */}
        <div className="text-center space-y-1.5 pt-2">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#2563eb]/20 border border-[#2563eb]/40 text-[#3b82f6] text-xs font-bold uppercase tracking-wider">
            <span>📊 Relatório de Avaliação Vocal</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Resultado do seu Treino
          </h2>
          <p className="text-xs text-[#a3a3a3]">
            {songTitle || 'Música de Treino'} • {date}
          </p>
        </div>

        {/* Score & Key Comparison Section */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-stretch">
          {/* Circular Score Gauge */}
          <div className="flex flex-col items-center justify-center p-5 bg-[#0a0a0a] border border-[#2e2e2e] rounded-2xl text-center space-y-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#a3a3a3]">
              Acerto na Voz em Foco
            </span>
            <div
              className={`w-24 h-24 rounded-full border-4 ${scoreColor.ring} flex flex-col items-center justify-center shadow-lg ${scoreColor.glow} bg-[#121212]`}
            >
              <span className={`text-3xl font-black ${scoreColor.text} leading-none`}>
                {accuracyPercentage}%
              </span>
              <span className="text-[9px] font-bold text-[#a3a3a3] uppercase mt-1">
                {accuracyPercentage >= 80 ? 'Excelente' : accuracyPercentage >= 60 ? 'Bom' : 'Atenção'}
              </span>
            </div>
          </div>

          {/* Focused Voice Card */}
          <div className="flex flex-col justify-between p-4 bg-[#0a0a0a] border border-[#2e2e2e] rounded-2xl space-y-2">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#3b82f6] block">
                🎯 Voz Marcada para Focar
              </span>
              <span className="text-xl font-black text-white block mt-1">
                {focusedVoiceLabel}
              </span>
              <span className="text-xs text-[#a3a3a3] font-medium block">
                {focusedVoiceRole}
              </span>
            </div>
            <div className="pt-2 border-t border-[#222]">
              <span className="text-[11px] font-bold text-blue-400">
                Alvo do seu treino
              </span>
            </div>
          </div>

          {/* Detected Voice Card */}
          <div
            className={`flex flex-col justify-between p-4 bg-[#0a0a0a] border rounded-2xl space-y-2 ${
              isMatching
                ? 'border-emerald-500/40 shadow-sm shadow-emerald-950/40'
                : 'border-amber-500/40 shadow-sm shadow-amber-950/40'
            }`}
          >
            <div>
              <span
                className={`text-[10px] font-extrabold uppercase tracking-wider block ${
                  isMatching ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                🗣️ Voz que Você Fez
              </span>
              <span className="text-xl font-black text-white block mt-1">
                {detectedVoiceLabel}
              </span>
              <span className="text-xs text-[#a3a3a3] font-medium block">
                {detectedVoiceRole}
              </span>
            </div>
            <div className="pt-2 border-t border-[#222] flex items-center justify-between">
              <span
                className={`text-[11px] font-bold ${
                  isMatching ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {isMatching ? '✅ Sustentou a Voz!' : '⚠️ Puxou outra voz'}
              </span>
              <span className="text-xs font-mono font-bold text-white">
                {detectedVoicePercentage}%
              </span>
            </div>
          </div>
        </div>

        {/* Pedagogical Commentary Banner */}
        <div
          className={`p-4 rounded-2xl border text-sm space-y-1.5 ${
            pedagogicalType === 'success'
              ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
              : pedagogicalType === 'warning'
              ? 'bg-amber-950/30 border-amber-500/30 text-amber-200'
              : 'bg-blue-950/30 border-blue-500/30 text-blue-200'
          }`}
        >
          <div className="font-extrabold text-sm flex items-center gap-2">
            <span>{pedagogicalTitle}</span>
          </div>
          <p className="text-xs sm:text-sm leading-relaxed text-[#d4d4d4]">
            {pedagogicalFeedback}
          </p>
        </div>

        {/* Voice Distribution Progress Bars */}
        <div className="p-4 bg-[#0a0a0a] border border-[#2e2e2e] rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-white">
              Divisão Vocal Cantada (% do Tempo)
            </span>
            <span className="text-[10px] text-[#a3a3a3]">
              Onde sua voz se posicionou
            </span>
          </div>

          <div className="space-y-2">
            {voiceBreakdown.map((item) => (
              <div key={item.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold flex items-center gap-1.5" style={{ color: item.color }}>
                    <span>{item.id === result.focusedVoice ? '🎯 ' : ''}{item.label}</span>
                    <span className="text-[10px] text-[#737373] font-normal">({item.role})</span>
                  </span>
                  <span className="font-mono font-bold text-white text-xs">{item.percentage}%</span>
                </div>
                <div className="w-full bg-[#1e1e1e] h-2 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${item.percentage}%`,
                      backgroundColor: item.color
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Additional Practice Metrics */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-3 bg-[#0a0a0a] border border-[#2e2e2e] rounded-xl">
            <span className="text-[9px] font-extrabold uppercase text-[#737373] block">
              Tempo Cantado
            </span>
            <span className="text-base font-black text-white mt-0.5 block">
              {formatSeconds(totalSingingSeconds)}
            </span>
          </div>

          <div className="p-3 bg-[#0a0a0a] border border-[#2e2e2e] rounded-xl">
            <span className="text-[9px] font-extrabold uppercase text-[#737373] block">
              Maior Streak
            </span>
            <span className="text-base font-black text-emerald-400 mt-0.5 block">
              ✨ {streakMax} notas
            </span>
          </div>

          <div className="p-3 bg-[#0a0a0a] border border-[#2e2e2e] rounded-xl">
            <span className="text-[9px] font-extrabold uppercase text-[#737373] block">
              Desvio Médio
            </span>
            <span className="text-base font-black text-blue-400 mt-0.5 block">
              ±{centsAverageDeviation} cents
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          <button
            onClick={onRetry}
            className="w-full sm:flex-1 py-3.5 px-6 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-extrabold text-sm transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            <span>🔄 Treinar Novamente</span>
          </button>

          {onSaveToHistory && (
            <button
              onClick={handleSave}
              disabled={isSaved}
              className={`w-full sm:w-auto py-3.5 px-6 rounded-xl font-bold text-sm border transition-all flex items-center justify-center gap-2 cursor-pointer ${
                isSaved
                  ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-400 cursor-default'
                  : 'bg-[#1e1e1e] hover:bg-[#262626] border-[#2e2e2e] text-white'
              }`}
            >
              <span>{isSaved ? '✅ Salvo no Histórico' : '💾 Salvar Resultado'}</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="w-full sm:w-auto py-3.5 px-6 rounded-xl bg-[#1e1e1e] hover:bg-[#262626] border border-[#2e2e2e] text-[#a3a3a3] hover:text-white font-bold text-sm transition-all cursor-pointer"
          >
            <span>Fechar</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default VocalEvaluationModal;
