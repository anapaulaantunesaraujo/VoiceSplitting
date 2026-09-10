import { useState, useEffect, useRef, useCallback } from 'react';

const NOTE_STRINGS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export interface PitchInfo {
  frequency: number;
  note: string;
  octave: number;
  cents: number;
  clarity: number;
}

export interface UseVocalTunerReturn {
  startTuner: () => Promise<void>;
  stopTuner: () => void;
  isListening: boolean;
  userPitch: PitchInfo | null;
  targetPitch: PitchInfo | null;
  setTargetFrequency: (freq: number) => void;
  extractTargetPitchFromBuffer: (buffer: AudioBuffer, timeInSeconds: number) => void;
  error: string | null;
}

export function frequencyToNote(freq: number): { note: string; octave: number; cents: number } {
  const noteNum = 12 * (Math.log(freq / 440) / Math.log(2)) + 69;
  const roundNote = Math.round(noteNum);
  const cents = Math.floor((noteNum - roundNote) * 100);
  
  const noteName = NOTE_STRINGS[roundNote % 12];
  const octave = Math.floor(roundNote / 12) - 1;

  return { note: noteName, octave, cents };
}

/**
 * Enhanced YIN Algorithm for fundamental frequency (F0) estimation
 * with noise gate filtering to ignore background mobile screen recording noise.
 */
export function yinPitchDetector(buffer: Float32Array, sampleRate: number): { frequency: number; clarity: number } {
  const SIZE = buffer.length;

  // 1. Noise Floor Gate: Calculate RMS energy to reject low-level noise / ambient mic hiss
  let sumSquares = 0;
  for (let i = 0; i < SIZE; i++) {
    sumSquares += buffer[i] * buffer[i];
  }
  const rms = Math.sqrt(sumSquares / SIZE);
  if (rms < 0.025) { // Enhanced noise threshold for mobile recordings
    return { frequency: -1, clarity: 0 };
  }

  // 2. Cumulative Mean Normalized Difference Function (YIN Step 1 & 2)
  const halfSize = Math.floor(SIZE / 2);
  const yinBuffer = new Float32Array(halfSize);
  
  yinBuffer[0] = 1;
  let runningSum = 0;

  for (let tau = 1; tau < halfSize; tau++) {
    let deltaSum = 0;
    for (let i = 0; i < halfSize; i++) {
      const delta = buffer[i] - buffer[i + tau];
      deltaSum += delta * delta;
    }
    runningSum += deltaSum;
    yinBuffer[tau] = runningSum > 0 ? (deltaSum * tau) / runningSum : 1;
  }

  // 3. Absolute Thresholding (YIN Step 3)
  const threshold = 0.15; // Strict threshold for human vocal fundamental frequency
  let tauFound = -1;

  for (let tau = 2; tau < halfSize; tau++) {
    if (yinBuffer[tau] < threshold) {
      while (tau + 1 < halfSize && yinBuffer[tau + 1] < yinBuffer[tau]) {
        tau++;
      }
      tauFound = tau;
      break;
    }
  }

  if (tauFound === -1) {
    // Find global minimum if no point fell below strict threshold
    let minVal = 1;
    for (let tau = 2; tau < halfSize; tau++) {
      if (yinBuffer[tau] < minVal) {
        minVal = yinBuffer[tau];
        tauFound = tau;
      }
    }
    if (minVal > 0.45) { // Reject noisy aperiodic signals
      return { frequency: -1, clarity: 0 };
    }
  }

  // 4. Parabolic Interpolation for exact sub-sample frequency accuracy
  let betterTau = tauFound;
  if (tauFound > 0 && tauFound < halfSize - 1) {
    const s0 = yinBuffer[tauFound - 1];
    const s1 = yinBuffer[tauFound];
    const s2 = yinBuffer[tauFound + 1];
    betterTau = tauFound + (s2 - s0) / (2 * (2 * s1 - s2 - s0));
  }

  const frequency = sampleRate / betterTau;
  const clarity = 1 - (yinBuffer[tauFound] || 0);

  // Human vocal range filtering (80Hz to 1100Hz)
  if (frequency < 80 || frequency > 1100) {
    return { frequency: -1, clarity: 0 };
  }

  return { frequency, clarity };
}

export const useVocalTuner = (): UseVocalTunerReturn => {
  const [isListening, setIsListening] = useState<boolean>(false);
  const [userPitch, setUserPitch] = useState<PitchInfo | null>(null);
  const [targetPitch, setTargetPitch] = useState<PitchInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const setTargetFrequency = useCallback((freq: number) => {
    if (freq <= 0) {
      setTargetPitch(null);
      return;
    }
    const info = frequencyToNote(freq);
    setTargetPitch({
      frequency: freq,
      note: info.note,
      octave: info.octave,
      cents: info.cents,
      clarity: 1
    });
  }, []);

  // Extract target pitch from isolated ONNX vocal stem AudioBuffer at time location
  const extractTargetPitchFromBuffer = useCallback((buffer: AudioBuffer, timeInSeconds: number) => {
    const sampleRate = buffer.sampleRate;
    const channelData = buffer.getChannelData(0);

    const startIndex = Math.floor(timeInSeconds * sampleRate);
    const windowSize = 2048;

    if (startIndex + windowSize <= channelData.length) {
      const slice = channelData.slice(startIndex, startIndex + windowSize);
      const { frequency } = yinPitchDetector(slice, sampleRate);
      if (frequency > 80 && frequency < 1100) {
        setTargetFrequency(frequency);
      }
    }
  }, [setTargetFrequency]);

  const processAudio = useCallback(() => {
    if (analyserRef.current && audioCtxRef.current) {
      const buffer = new Float32Array(analyserRef.current.fftSize);
      analyserRef.current.getFloatTimeDomainData(buffer);

      const { frequency, clarity } = yinPitchDetector(buffer, audioCtxRef.current.sampleRate);

      if (frequency > 0 && clarity > 0.5) {
        const info = frequencyToNote(frequency);
        setUserPitch({
          frequency,
          note: info.note,
          octave: info.octave,
          cents: info.cents,
          clarity
        });
      } else {
        setUserPitch(null);
      }

      animFrameRef.current = requestAnimationFrame(processAudio);
    }
  }, []);

  const startTuner = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
      streamRef.current = stream;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);

      // High-pass filter to remove low-frequency mobile handling rumble
      const biquadFilter = ctx.createBiquadFilter();
      biquadFilter.type = 'highpass';
      biquadFilter.frequency.value = 85;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;

      source.connect(biquadFilter);
      biquadFilter.connect(analyser);
      analyserRef.current = analyser;

      setIsListening(true);
      animFrameRef.current = requestAnimationFrame(processAudio);
    } catch (err: any) {
      setError(err?.message || 'Permissão de microfone negada ou indisponível.');
      setIsListening(false);
    }
  }, [processAudio]);

  const stopTuner = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    setIsListening(false);
    setUserPitch(null);
  }, []);

  useEffect(() => {
    return () => {
      stopTuner();
    };
  }, [stopTuner]);

  return {
    startTuner,
    stopTuner,
    isListening,
    userPitch,
    targetPitch,
    setTargetFrequency,
    extractTargetPitchFromBuffer,
    error
  };
};
