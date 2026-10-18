/**
 * Client-Side Musical Key & BPM Detection Utility
 * Uses Web Audio API / FFT and Krumhansl-Schmuckler Harmonic Profiles.
 * Also synchronizes with FastAPI /api/analyze-audio when backend is available.
 */

export interface MusicalAnalysisResult {
  key: string;
  rootNote: string;
  mode: 'Major' | 'Minor';
  bpm: number;
  duration: number;
  scaleNotes: string[];
  confidence: number;
}

const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const NOTE_NAMES_PT: Record<string, string> = {
  'C': 'Dó', 'C#': 'Dó#', 'D': 'Ré', 'D#': 'Ré#', 'E': 'Mi', 'F': 'Fá',
  'F#': 'Fá#', 'G': 'Sol', 'G#': 'Sol#', 'A': 'Lá', 'A#': 'Lá#', 'B': 'Si'
};

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/**
 * Calculates Pearson correlation coefficient between two equal-length arrays.
 */
function correlate(profile: number[], chroma: number[]): number {
  const n = profile.length;
  let meanP = 0;
  let meanC = 0;
  for (let i = 0; i < n; i++) {
    meanP += profile[i];
    meanC += chroma[i];
  }
  meanP /= n;
  meanC /= n;

  let num = 0;
  let denP = 0;
  let denC = 0;
  for (let i = 0; i < n; i++) {
    const pDiff = profile[i] - meanP;
    const cDiff = chroma[i] - meanC;
    num += pDiff * cDiff;
    denP += pDiff * pDiff;
    denC += cDiff * cDiff;
  }
  const denom = Math.sqrt(denP * denC);
  return denom === 0 ? 0 : num / denom;
}

/**
 * Analyzes an AudioBuffer directly in the browser to extract musical key and estimated BPM.
 */
export async function detectKeyAndBpmInBrowser(buffer: AudioBuffer): Promise<MusicalAnalysisResult> {
  const sampleRate = buffer.sampleRate;
  const channelData = buffer.getChannelData(0);
  const duration = buffer.duration;

  // 1. Compute Pitch Chromagram across samples (12 pitch classes: C, C#, D, ... B)
  const chroma = new Array(12).fill(0);
  const durationToAnalyze = Math.min(duration, 45); // up to 45s
  const stepSeconds = 0.5; // sample every 500ms
  const windowLen = Math.min(2048, Math.floor(sampleRate * 0.05)); // ~45ms window

  // Calculate Goertzel energy for notes from MIDI 40 (E2 ~82Hz) to MIDI 79 (G5 ~784Hz)
  for (let t = 1.0; t < durationToAnalyze - 0.2; t += stepSeconds) {
    const startSample = Math.floor(t * sampleRate);
    if (startSample + windowLen > channelData.length) break;

    for (let midi = 40; midi <= 79; midi++) {
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      const pitchClass = (midi - 12) % 12; // 0=C, 1=C#, ..., 11=B

      // Goertzel algorithm for single frequency
      const k = (windowLen * freq) / sampleRate;
      const omega = (2 * Math.PI * k) / windowLen;
      const coeff = 2 * Math.cos(omega);
      let q0 = 0, q1 = 0, q2 = 0;

      for (let i = 0; i < windowLen; i++) {
        // Apply Hann window
        const win = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (windowLen - 1)));
        const sample = channelData[startSample + i] * win;
        q0 = coeff * q1 - q2 + sample;
        q2 = q1;
        q1 = q0;
      }
      const power = q1 * q1 + q2 * q2 - q1 * q2 * coeff;
      if (power > 0) {
        chroma[pitchClass] += Math.sqrt(power);
      }
    }
  }

  // 2. Krumhansl-Schmuckler correlation
  let bestScore = -999;
  let bestKey = 'C';
  let bestMode: 'Major' | 'Minor' = 'Major';

  for (let i = 0; i < 12; i++) {
    const rotatedChroma = new Array(12);
    for (let j = 0; j < 12; j++) {
      rotatedChroma[j] = chroma[(j + i) % 12];
    }

    const majorCorr = correlate(MAJOR_PROFILE, rotatedChroma);
    const minorCorr = correlate(MINOR_PROFILE, rotatedChroma);

    if (majorCorr > bestScore) {
      bestScore = majorCorr;
      bestKey = PITCH_CLASSES[i];
      bestMode = 'Major';
    }
    if (minorCorr > bestScore) {
      bestScore = minorCorr;
      bestKey = PITCH_CLASSES[i];
      bestMode = 'Minor';
    }
  }

  // 3. BPM estimation via energy peak distance
  let bpm = 120;
  try {
    const maxSamples = Math.min(channelData.length, Math.floor(sampleRate * 60));
    const energyEnvelope: number[] = [];
    const windowSize = Math.floor(sampleRate * 0.05); // 50ms window
    for (let i = 0; i < maxSamples; i += windowSize) {
      let sum = 0;
      for (let j = 0; j < windowSize && i + j < maxSamples; j++) {
        sum += Math.abs(channelData[i + j]);
      }
      energyEnvelope.push(sum);
    }

    // Find peaks
    const peaks: number[] = [];
    for (let i = 1; i < energyEnvelope.length - 1; i++) {
      if (energyEnvelope[i] > energyEnvelope[i - 1] && energyEnvelope[i] > energyEnvelope[i + 1] && energyEnvelope[i] > 10) {
        peaks.push(i);
      }
    }

    if (peaks.length > 5) {
      let diffSum = 0;
      for (let i = 1; i < peaks.length; i++) {
        diffSum += (peaks[i] - peaks[i - 1]);
      }
      const avgIntervalWindows = diffSum / (peaks.length - 1);
      const secondsPerBeat = avgIntervalWindows * 0.05;
      if (secondsPerBeat > 0.25 && secondsPerBeat < 1.5) {
        bpm = Math.round(60 / secondsPerBeat);
      }
    }
  } catch (e) {
    bpm = 120;
  }

  const ptNote = NOTE_NAMES_PT[bestKey] || bestKey;
  const ptMode = bestMode === 'Major' ? 'Maior' : 'Menor';
  const formattedKey = `${ptNote} ${ptMode} (${bestKey}${bestMode === 'Minor' ? 'm' : ''})`;

  const intervals = bestMode === 'Major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  const rootIdx = PITCH_CLASSES.indexOf(bestKey);
  const scaleNotes = intervals.map((iv) => PITCH_CLASSES[(rootIdx + iv) % 12]);

  return {
    key: formattedKey,
    rootNote: bestKey,
    mode: bestMode,
    bpm: Math.max(60, Math.min(220, bpm)),
    duration: Math.round(duration * 10) / 10,
    scaleNotes,
    confidence: Math.max(0.7, Math.min(0.99, Number(bestScore.toFixed(2))))
  };
}

/**
 * Tenta analisar via FastAPI no backend (se disponível na porta 8000/8050)
 * Caso contrário, executa no navegador via Web Audio API.
 */
export async function analyzeAudioKeyAndBpm(
  file: File,
  audioBuffer?: AudioBuffer
): Promise<MusicalAnalysisResult> {
  const rawBase = ((import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');
  const analyzeEndpoint = rawBase.endsWith('/api') ? `${rawBase}/analyze-audio` : `${rawBase}/api/analyze-audio`;

  try {
    const formData = new FormData();
    formData.append('file', file);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(analyzeEndpoint, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      return {
        key: data.key,
        rootNote: data.root_note,
        mode: data.mode,
        bpm: data.bpm,
        duration: data.duration,
        scaleNotes: data.scale_notes || ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
        confidence: data.confidence || 0.95
      };
    }
  } catch (err) {
    // Backend offline ou inacessível no momento, segue para o analisador em Web Audio no navegador
  }

  // Fallback no navegador
  if (audioBuffer) {
    return detectKeyAndBpmInBrowser(audioBuffer);
  }

  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioContextClass();
  const arrBuf = await file.arrayBuffer();
  const decoded = await ctx.decodeAudioData(arrBuf);
  await ctx.close();
  return detectKeyAndBpmInBrowser(decoded);
}
