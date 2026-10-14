import { useState, useRef, useCallback } from 'react';
import { StemChannelId } from './useMultiStemMixer';

export interface VocalEvaluationSample {
  timestamp: number;
  userFreq: number;
  melodyFreq: number;
  focusedVoice: StemChannelId;
  targetFreq: number;
  centsDiff: number;
  isAccurate: boolean;
  detectedVoice: StemChannelId | 'offKey';
}

export interface VoiceDistributionItem {
  id: StemChannelId;
  label: string;
  role: string;
  color: string;
  count: number;
  percentage: number;
}

export interface VocalEvaluationResult {
  id: string;
  songTitle?: string;
  focusedVoice: StemChannelId;
  focusedVoiceLabel: string;
  focusedVoiceRole: string;
  accuracyPercentage: number; // 0 to 100
  totalSingingSeconds: number;
  totalVocalSamples: number;
  detectedVoice: StemChannelId | 'offKey';
  detectedVoiceLabel: string;
  detectedVoiceRole: string;
  detectedVoicePercentage: number;
  voiceBreakdown: VoiceDistributionItem[];
  pedagogicalFeedback: string;
  pedagogicalTitle: string;
  pedagogicalType: 'success' | 'warning' | 'info';
  streakMax: number;
  centsAverageDeviation: number;
  date: string;
}

export interface LiveEvaluationStats {
  liveAccuracy: number;
  currentDetectedVoice: StemChannelId | 'offKey' | null;
  currentDetectedVoiceLabel: string;
  currentCentsDiff: number | null;
  totalSingingFrames: number;
  currentStreak: number;
}

export const VOICE_HARMONIC_INFO: Record<
  StemChannelId,
  { label: string; role: string; semitoneInterval: number; color: string }
> = {
  soprano: {
    label: 'Soprano',
    role: '1ª Tônica (Melodia Principal)',
    semitoneInterval: 0,
    color: '#ec4899'
  },
  mezzoSoprano: {
    label: 'Mezzo-soprano',
    role: 'Harmonia Intermediária',
    semitoneInterval: 4,
    color: '#f43f5e'
  },
  contralto: {
    label: 'Contralto',
    role: '3ª Terça (Harmonia)',
    semitoneInterval: 4,
    color: '#8b5cf6'
  },
  tenor: {
    label: 'Tenor',
    role: '5ª Quinta (Harmonia)',
    semitoneInterval: 7,
    color: '#3b82f6'
  },
  baritone: {
    label: 'Barítono',
    role: 'Harmonia / Base',
    semitoneInterval: -5,
    color: '#06b6d4'
  },
  bass: {
    label: 'Baixo',
    role: 'Fundamental (8ª Baixa)',
    semitoneInterval: -12,
    color: '#10b981'
  },
  accompaniment: {
    label: 'Instrumental',
    role: 'Base Harmônica',
    semitoneInterval: 0,
    color: '#f59e0b'
  }
};

const VOCAL_VOICE_IDS: StemChannelId[] = ['soprano', 'contralto', 'tenor', 'baritone', 'bass', 'mezzoSoprano'];

export const useVocalEvaluation = () => {
  const [isEvaluationMode, setIsEvaluationMode] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [evaluationResult, setEvaluationResult] = useState<VocalEvaluationResult | null>(null);

  const [liveStats, setLiveStats] = useState<LiveEvaluationStats>({
    liveAccuracy: 0,
    currentDetectedVoice: null,
    currentDetectedVoiceLabel: '--',
    currentCentsDiff: null,
    totalSingingFrames: 0,
    currentStreak: 0
  });

  const samplesRef = useRef<VocalEvaluationSample[]>([]);
  const currentStreakRef = useRef<number>(0);
  const maxStreakRef = useRef<number>(0);
  const lastSampleTimeRef = useRef<number>(0);

  // Reset all evaluation data
  const resetEvaluation = useCallback(() => {
    samplesRef.current = [];
    currentStreakRef.current = 0;
    maxStreakRef.current = 0;
    lastSampleTimeRef.current = 0;
    setLiveStats({
      liveAccuracy: 0,
      currentDetectedVoice: null,
      currentDetectedVoiceLabel: '--',
      currentCentsDiff: null,
      totalSingingFrames: 0,
      currentStreak: 0
    });
  }, []);

  /**
   * Records a realtime pitch sample while user is singing and audio is playing.
   * Compares the user frequency against the focused voice and all vocal harmony roles.
   */
  const recordSample = useCallback(
    (userFreq: number, melodyFreq: number, focusedVoiceId: StemChannelId = 'soprano') => {
      if (!isEvaluationMode || userFreq <= 80 || userFreq > 1100 || melodyFreq <= 80) {
        return;
      }

      const now = performance.now();
      // Throttle samples to ~15 per second (every 65ms) to avoid over-sampling transient noise
      if (now - lastSampleTimeRef.current < 65) {
        return;
      }
      lastSampleTimeRef.current = now;

      // 1. Calculate target frequency for the focused voice
      const focusedInfo = VOICE_HARMONIC_INFO[focusedVoiceId] || VOICE_HARMONIC_INFO.soprano;
      const targetFreq = melodyFreq * Math.pow(2, focusedInfo.semitoneInterval / 12);

      // Cents difference with octave normalization (respects comfortable vocal octaves)
      let targetDiff = 1200 * Math.log2(userFreq / targetFreq);
      while (targetDiff > 600) targetDiff -= 1200;
      while (targetDiff < -600) targetDiff += 1200;
      const absTargetDiff = Math.abs(targetDiff);

      // Musical accuracy threshold for vocal harmony: 35 cents (a third of a semitone)
      const isAccurate = absTargetDiff <= 35;

      // Update streaks
      if (isAccurate) {
        currentStreakRef.current += 1;
        if (currentStreakRef.current > maxStreakRef.current) {
          maxStreakRef.current = currentStreakRef.current;
        }
      } else {
        currentStreakRef.current = 0;
      }

      // 2. Identify which voice part the user actually sang
      let closestVoice: StemChannelId | 'offKey' = 'offKey';
      let minDiff = Infinity;

      VOCAL_VOICE_IDS.forEach((voiceId) => {
        const info = VOICE_HARMONIC_INFO[voiceId];
        const voiceTarget = melodyFreq * Math.pow(2, info.semitoneInterval / 12);
        let diff = 1200 * Math.log2(userFreq / voiceTarget);
        while (diff > 600) diff -= 1200;
        while (diff < -600) diff += 1200;
        const absDiff = Math.abs(diff);

        if (absDiff < minDiff) {
          minDiff = absDiff;
          closestVoice = voiceId;
        }
      });

      // If user was more than 55 cents away from ANY known harmony, consider off-key/transient
      if (minDiff > 55) {
        closestVoice = 'offKey';
      }

      const sample: VocalEvaluationSample = {
        timestamp: now,
        userFreq,
        melodyFreq,
        focusedVoice: focusedVoiceId,
        targetFreq,
        centsDiff: targetDiff,
        isAccurate,
        detectedVoice: closestVoice
      };

      samplesRef.current.push(sample);

      // 3. Update live HUD statistics
      const total = samplesRef.current.length;
      const accurateCount = samplesRef.current.filter((s) => s.isAccurate).length;
      const liveAcc = Math.round((accurateCount / total) * 100);

      const detectedLabel =
        closestVoice === 'offKey'
          ? 'Desafinado / Transição'
          : VOICE_HARMONIC_INFO[closestVoice as StemChannelId]?.label || 'Desconhecido';

      setLiveStats({
        liveAccuracy: liveAcc,
        currentDetectedVoice: closestVoice,
        currentDetectedVoiceLabel: detectedLabel,
        currentCentsDiff: Math.round(targetDiff),
        totalSingingFrames: total,
        currentStreak: currentStreakRef.current
      });
    },
    [isEvaluationMode]
  );

  /**
   * Compiles the full evaluation report when the song finishes or user ends session.
   */
  const finishEvaluation = useCallback(
    (focusedVoiceId: StemChannelId = 'soprano', songTitle?: string): VocalEvaluationResult | null => {
      const samples = samplesRef.current;
      if (samples.length === 0) {
        // No singing data collected
        return null;
      }

      const totalVocalSamples = samples.length;
      const accurateSamples = samples.filter((s) => s.isAccurate).length;
      const accuracyPercentage = Math.round((accurateSamples / totalVocalSamples) * 100);

      // Estimate total singing seconds (each sample ~ 65ms)
      const totalSingingSeconds = Math.round((totalVocalSamples * 65) / 1000);

      // Average absolute deviation in cents
      const sumDeviation = samples.reduce((acc, s) => acc + Math.abs(s.centsDiff), 0);
      const centsAverageDeviation = Math.round(sumDeviation / totalVocalSamples);

      // Count distribution of sung voices
      const voiceCounts: Record<StemChannelId, number> = {
        soprano: 0,
        contralto: 0,
        tenor: 0,
        baritone: 0,
        bass: 0,
        mezzoSoprano: 0,
        accompaniment: 0
      };

      let offKeyCount = 0;

      samples.forEach((s) => {
        if (s.detectedVoice === 'offKey') {
          offKeyCount++;
        } else if (voiceCounts[s.detectedVoice] !== undefined) {
          voiceCounts[s.detectedVoice]++;
        }
      });

      // Find the dominant voice that the user actually sang
      let maxVoiceCount = -1;
      let dominantVoice: StemChannelId | 'offKey' = 'offKey';

      for (const voiceId of VOCAL_VOICE_IDS) {
        if (voiceCounts[voiceId] > maxVoiceCount) {
          maxVoiceCount = voiceCounts[voiceId];
          dominantVoice = voiceId;
        }
      }

      // If offKey exceeded all individual voices
      if (offKeyCount > maxVoiceCount && offKeyCount > totalVocalSamples * 0.45) {
        dominantVoice = 'offKey';
      }

      const dominantPercentage =
        dominantVoice === 'offKey'
          ? Math.round((offKeyCount / totalVocalSamples) * 100)
          : Math.round((voiceCounts[dominantVoice as StemChannelId] / totalVocalSamples) * 100);

      const focusedInfo = VOICE_HARMONIC_INFO[focusedVoiceId] || VOICE_HARMONIC_INFO.soprano;
      const dominantInfo = dominantVoice !== 'offKey' ? VOICE_HARMONIC_INFO[dominantVoice as StemChannelId] : null;

      // Construct breakdown array for UI
      const voiceBreakdown: VoiceDistributionItem[] = VOCAL_VOICE_IDS.map((id) => {
        const info = VOICE_HARMONIC_INFO[id];
        const count = voiceCounts[id];
        const percentage = Math.round((count / totalVocalSamples) * 100);
        return {
          id,
          label: info.label,
          role: info.role,
          color: info.color,
          count,
          percentage
        };
      }).sort((a, b) => b.percentage - a.percentage);

      // Pedagogical Feedback Logic
      let pedagogicalTitle = '';
      let pedagogicalFeedback = '';
      let pedagogicalType: 'success' | 'warning' | 'info' = 'info';

      const isSameAsFocused = dominantVoice === focusedVoiceId;
      const sopranoPct = Math.round((voiceCounts.soprano / totalVocalSamples) * 100);

      if (accuracyPercentage >= 80) {
        pedagogicalType = 'success';
        pedagogicalTitle = '🌟 Excelente Divisão Vocal!';
        pedagogicalFeedback = `Parabéns! Você sustentou a voz ${focusedInfo.label} (${focusedInfo.role}) com incrível precisão de ${accuracyPercentage}%. Manteve a linha harmônica firme e independente do início ao fim sem ser puxado(a) pelas outras vozes!`;
      } else if (accuracyPercentage >= 60) {
        pedagogicalType = 'info';
        pedagogicalTitle = '👏 Muito Bom Desempenho!';
        pedagogicalFeedback = `Você acertou ${accuracyPercentage}% da voz ${focusedInfo.label}. Conseguiu manter a harmonia na maior parte do treino, com pequenos desvios em passagens mais rápidas. Continue praticando para lapidar a estabilidade!`;
      } else if (focusedVoiceId !== 'soprano' && sopranoPct >= 40) {
        pedagogicalType = 'warning';
        pedagogicalTitle = '🎯 Voz Puxada para a Melodia Principal';
        pedagogicalFeedback = `Atenção: Você marcou para focar em ${focusedInfo.label}, mas a sua voz foi atraída pela melodia do Soprano durante ${sopranoPct}% da música! Isso é muito comum no início do treino de divisão vocal. Dica de ouro: Use o botão de "Super Foco" para deixar o ${focusedInfo.label} bem mais alto e habituar seu ouvido à harmonia.`;
      } else if (!isSameAsFocused && dominantVoice !== 'offKey' && dominantInfo) {
        pedagogicalType = 'warning';
        pedagogicalTitle = `🎶 Voz Cantada Diferente da Marcada`;
        pedagogicalFeedback = `Você marcou a voz ${focusedInfo.label}, mas cantou predominantemente a linha de ${dominantInfo.label} (${dominantPercentage}% do tempo). Pratique ouvindo a voz isolada antes de cantar junto.`;
      } else {
        pedagogicalType = 'info';
        pedagogicalTitle = '💡 Treino de Afinação e Sustentação';
        pedagogicalFeedback = `Você atingiu ${accuracyPercentage}% de acerto na voz ${focusedInfo.label}. Pratique trecho por trecho com o andamento mais confortável e observe a linha guia no visualizador de afinação.`;
      }

      const result: VocalEvaluationResult = {
        id: `eval_${Date.now()}`,
        songTitle: songTitle || 'Música de Treino',
        focusedVoice: focusedVoiceId,
        focusedVoiceLabel: focusedInfo.label,
        focusedVoiceRole: focusedInfo.role,
        accuracyPercentage,
        totalSingingSeconds,
        totalVocalSamples,
        detectedVoice: dominantVoice,
        detectedVoiceLabel: dominantInfo ? dominantInfo.label : 'Oscilou / Indefinido',
        detectedVoiceRole: dominantInfo ? dominantInfo.role : 'Transição / Fora de harmonia',
        detectedVoicePercentage: dominantPercentage,
        voiceBreakdown,
        pedagogicalFeedback,
        pedagogicalTitle,
        pedagogicalType,
        streakMax: maxStreakRef.current,
        centsAverageDeviation,
        date: new Date().toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      };

      setEvaluationResult(result);
      setIsModalOpen(true);
      return result;
    },
    []
  );

  return {
    isEvaluationMode,
    setIsEvaluationMode,
    isModalOpen,
    setIsModalOpen,
    evaluationResult,
    setEvaluationResult,
    liveStats,
    recordSample,
    finishEvaluation,
    resetEvaluation
  };
};

export default useVocalEvaluation;
