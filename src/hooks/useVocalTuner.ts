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
  extractTargetPitchFromBuffer: (buffer: AudioBuffer, timeInSeconds: number, semitoneShift?: number) => void;
  accuracyRate: number; // 0 to 100%
  resetAccuracy: () => void;
  sidetoneVolume: number; // 0.0 to 1.0 (mic monitor feedback so user hears themselves)
  setSidetoneVolume: (vol: number) => void;
  isMonitorMuted: boolean;
  setIsMonitorMuted: (muted: boolean) => void;
  error: string | null;
}

export function shiftFrequencyBySemitones(freq: number, semitones: number): number {
  if (freq <= 0) return freq;
  return freq * Math.pow(2, semitones / 12);
}

export function frequencyToNote(freq: number): { note: string; octave: number; cents: number } {
  const noteNum = 12 * (Math.log(freq / 440) / Math.log(2)) + 69;
  const roundNote = Math.round(noteNum);
  const cents = Math.floor((noteNum - roundNote) * 100);

  const noteIndex = ((roundNote % 12) + 12) % 12;
  const noteName = NOTE_STRINGS[noteIndex];
  const octave = Math.floor(roundNote / 12) - 1;

  return { note: noteName, octave, cents };
}

/**
 * Enhanced YIN Algorithm for fundamental frequency (F0) estimation
 * with noise gate filtering to ignore background room noise.
 */
export function yinPitchDetector(buffer: Float32Array, sampleRate: number): { frequency: number; clarity: number } {
  const SIZE = buffer.length;

  // 1. Noise Floor Gate: Calculate RMS energy to reject low-level noise
  let sumSquares = 0;
  for (let i = 0; i < SIZE; i++) {
    sumSquares += buffer[i] * buffer[i];
  }
  const rms = Math.sqrt(sumSquares / SIZE);
  if (rms < 0.02) {
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
  const threshold = 0.15;
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
    let minVal = 1;
    for (let tau = 2; tau < halfSize; tau++) {
      if (yinBuffer[tau] < minVal) {
        minVal = yinBuffer[tau];
        tauFound = tau;
      }
    }
    if (minVal > 0.45) {
      return { frequency: -1, clarity: 0 };
    }
  }

  // 4. Parabolic Interpolation for sub-sample accuracy
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
  const [accuracyRate, setAccuracyRate] = useState<number>(0);
  const [sidetoneVolume, setSidetoneVolumeState] = useState<number>(0.75);
  const [isMonitorMuted, setIsMonitorMutedState] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sidetoneGainRef = useRef<GainNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Sliding window buffer for real-time accuracy calculation (last 40 singing frames)
  const accuracyHistoryRef = useRef<boolean[]>([]);

  const resetAccuracy = useCallback(() => {
    accuracyHistoryRef.current = [];
    setAccuracyRate(0);
  }, []);

  const setSidetoneVolume = useCallback((vol: number) => {
    const clamped = Math.max(0, Math.min(1.0, vol));
    setSidetoneVolumeState(clamped);
    if (sidetoneGainRef.current && !isMonitorMuted) {
      if (audioCtxRef.current) {
        try {
          sidetoneGainRef.current.gain.setValueAtTime(clamped, audioCtxRef.current.currentTime);
        } catch {
          sidetoneGainRef.current.gain.value = clamped;
        }
      } else {
        sidetoneGainRef.current.gain.value = clamped;
      }
    }
  }, [isMonitorMuted]);

  const setIsMonitorMuted = useCallback((muted: boolean) => {
    setIsMonitorMutedState(muted);
    if (sidetoneGainRef.current) {
      const targetVal = muted ? 0 : sidetoneVolume;
      if (audioCtxRef.current) {
        try {
          sidetoneGainRef.current.gain.setValueAtTime(targetVal, audioCtxRef.current.currentTime);
        } catch {
          sidetoneGainRef.current.gain.value = targetVal;
        }
      } else {
        sidetoneGainRef.current.gain.value = targetVal;
      }
    }
  }, [sidetoneVolume]);

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

  const extractTargetPitchFromBuffer = useCallback((buffer: AudioBuffer, timeInSeconds: number, semitoneShift: number = 0) => {
    const sampleRate = buffer.sampleRate;
    const channelData = buffer.getChannelData(0);

    const startIndex = Math.floor(timeInSeconds * sampleRate);
    const windowSize = 2048;

    if (startIndex + windowSize <= channelData.length) {
      const slice = channelData.slice(startIndex, startIndex + windowSize);
      const { frequency } = yinPitchDetector(slice, sampleRate);
      if (frequency > 80 && frequency < 1100) {
        const shifted = semitoneShift !== 0 ? shiftFrequencyBySemitones(frequency, semitoneShift) : frequency;
        setTargetFrequency(shifted);
      }
    }
  }, [setTargetFrequency]);

  const lastUpdateRef = useRef<number>(0);
  const dropoutTimerRef = useRef<number | null>(null);
  const smoothedFreqRef = useRef<number | null>(null);

  const processAudio = useCallback(() => {
    if (analyserRef.current && audioCtxRef.current) {
      const buffer = new Float32Array(analyserRef.current.fftSize);
      analyserRef.current.getFloatTimeDomainData(buffer);

      const { frequency, clarity } = yinPitchDetector(buffer, audioCtxRef.current.sampleRate);
      const now = performance.now();

      if (frequency > 0 && clarity > 0.45) {
        if (dropoutTimerRef.current) {
          clearTimeout(dropoutTimerRef.current);
          dropoutTimerRef.current = null;
        }

        // EMA smoothing to reject microphone noise jitter
        let filteredFreq = frequency;
        if (smoothedFreqRef.current !== null) {
          const diff = Math.abs(frequency - smoothedFreqRef.current);
          if (diff < 200) {
            filteredFreq = smoothedFreqRef.current * 0.65 + frequency * 0.35;
          } else {
            filteredFreq = frequency;
          }
        }
        smoothedFreqRef.current = filteredFreq;

        if (now - lastUpdateRef.current >= 60) {
          lastUpdateRef.current = now;
          const info = frequencyToNote(filteredFreq);
          setUserPitch({
            frequency: filteredFreq,
            note: info.note,
            octave: info.octave,
            cents: info.cents,
            clarity
          });

          // Check if in-tune (within ±12 cents of the target note or pitch center)
          let isAccurate = Math.abs(info.cents) <= 12;
          if (targetPitch && targetPitch.frequency > 0) {
            let diffCents = 1200 * (Math.log(filteredFreq / targetPitch.frequency) / Math.log(2));
            while (diffCents > 600) diffCents -= 1200;
            while (diffCents < -600) diffCents += 1200;
            isAccurate = Math.abs(diffCents) <= 15;
          }

          // Update accuracy sliding window
          const history = accuracyHistoryRef.current;
          history.push(isAccurate);
          if (history.length > 50) history.shift();

          const accurateCount = history.filter(Boolean).length;
          const pct = Math.round((accurateCount / history.length) * 100);
          setAccuracyRate(pct);
        }
      } else {
        if (!dropoutTimerRef.current) {
          dropoutTimerRef.current = window.setTimeout(() => {
            setUserPitch(null);
            smoothedFreqRef.current = null;
            dropoutTimerRef.current = null;
          }, 160);
        }
      }

      animFrameRef.current = requestAnimationFrame(processAudio);
    }
  }, [targetPitch]);

  const stopTuner = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (dropoutTimerRef.current) {
      clearTimeout(dropoutTimerRef.current);
      dropoutTimerRef.current = null;
    }
    if (streamRef.current) {
      try {
        const tracks = streamRef.current.getTracks();
        tracks.forEach((track) => {
          track.stop();
          track.enabled = false;
        });
      } catch (e) {
        console.warn('Erro ao desligar tracks do microfone:', e);
      }
      streamRef.current = null;
    }
    if (sidetoneGainRef.current) {
      try {
        sidetoneGainRef.current.disconnect();
      } catch (e) {}
      sidetoneGainRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        if (audioCtxRef.current.state !== 'closed') {
          audioCtxRef.current.close().catch(() => {});
        }
      } catch (e) {}
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    smoothedFreqRef.current = null;
    setIsListening(false);
    setUserPitch(null);
  }, []);

  const startTuner = useCallback(async () => {
    try {
      setError(null);
      // Clean up any existing stream before starting a new one
      stopTuner();

      // Zero-latency raw audio capture: bypass browser WebRTC DSP buffers (echoCancellation, noiseSuppression, AGC)
      // which create 200-300ms delays in headphone return.
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1,
            latency: 0
          } as any,
          video: false
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          },
          video: false
        });
      }
      streamRef.current = stream;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass({ latencyHint: 'interactive' });
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);

      // 1. Microphone Sidetone Monitor with ultra-low latency direct route to destination
      const sidetoneGain = ctx.createGain();
      sidetoneGain.gain.setValueAtTime(isMonitorMuted ? 0 : sidetoneVolume, ctx.currentTime);
      sidetoneGainRef.current = sidetoneGain;

      source.connect(sidetoneGain);
      sidetoneGain.connect(ctx.destination);

      // 2. High-pass filter & Analyser for real-time Pitch Detection
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
      setError(err?.message || 'Permissão de microfone negada ou microfone indisponível.');
      setIsListening(false);
    }
  }, [processAudio, isMonitorMuted, sidetoneVolume, stopTuner]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      stopTuner();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
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
    accuracyRate,
    resetAccuracy,
    sidetoneVolume,
    setSidetoneVolume,
    isMonitorMuted,
    setIsMonitorMuted,
    error
  };
};
