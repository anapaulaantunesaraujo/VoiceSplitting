import { useState, useEffect, useRef, useCallback } from 'react';
import * as Tone from 'tone';

export type VoiceFocusTarget = 'soprano' | 'contralto' | 'tenor' | 'bass' | 'tutti';

export interface MultiStemMixerOptions {
  vocalUrl: string | File;
  accompanimentUrl: string | File;
}

export interface UseMultiStemMixerReturn {
  loadStems: (options: MultiStemMixerOptions) => Promise<void>;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  setPitchSemitones: (semitones: number) => void;
  setFocusVoice: (voice: VoiceFocusTarget) => void;
  pitchSemitones: number;
  focusedVoice: VoiceFocusTarget;
  isPlaying: boolean;
  isLoading: boolean;
  duration: number;
  currentTime: number;
  seek: (seconds: number) => void;
  error: string | null;
}

export const useMultiStemMixer = (): UseMultiStemMixerReturn => {
  const [pitchSemitones, setPitchState] = useState<number>(0);
  const [focusedVoice, setFocusedVoiceState] = useState<VoiceFocusTarget>('soprano');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  // Tone.js Audio Graph References
  const pitchShiftRef = useRef<Tone.PitchShift | null>(null);
  const vocalCompressorRef = useRef<Tone.Compressor | null>(null);
  const vocalGainRef = useRef<Tone.Gain | null>(null);
  const accompanimentGainRef = useRef<Tone.Gain | null>(null);

  const vocalPlayerRef = useRef<Tone.Player | null>(null);
  const accompanimentPlayerRef = useRef<Tone.Player | null>(null);

  const animFrameRef = useRef<number | null>(null);

  // Initialize Tone.js Audio Graph
  useEffect(() => {
    const pitchShift = new Tone.PitchShift({
      pitch: 0,
      windowSize: 0.1,
      delayTime: 0,
      feedback: 0
    }).toDestination();

    const vocalCompressor = new Tone.Compressor({
      threshold: -20,
      ratio: 4,
      attack: 0.005,
      release: 0.1
    }).connect(pitchShift);

    const vocalGain = new Tone.Gain(2.0).connect(vocalCompressor); // Default boosted focus
    const accompanimentGain = new Tone.Gain(0.15).connect(pitchShift); // Attenuated background (-16dB)

    const vocalPlayer = new Tone.Player({ loop: false, autostart: false }).connect(vocalGain);
    const accompanimentPlayer = new Tone.Player({ loop: false, autostart: false }).connect(accompanimentGain);

    pitchShiftRef.current = pitchShift;
    vocalCompressorRef.current = vocalCompressor;
    vocalGainRef.current = vocalGain;
    accompanimentGainRef.current = accompanimentGain;
    vocalPlayerRef.current = vocalPlayer;
    accompanimentPlayerRef.current = accompanimentPlayer;

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      vocalPlayer.dispose();
      accompanimentPlayer.dispose();
      vocalGain.dispose();
      accompanimentGain.dispose();
      vocalCompressor.dispose();
      pitchShift.dispose();
    };
  }, []);

  const setPitchSemitones = useCallback((semitones: number) => {
    setPitchState(semitones);
    if (pitchShiftRef.current) {
      pitchShiftRef.current.pitch = semitones;
    }
  }, []);

  /**
   * Simple Friendly Voice Focus Selector:
   * Replaces technical decibel faders with one-click Focus buttons.
   * Behind the scenes, the hook adjusts GainNode levels & Compressor curves.
   */
  const setFocusVoice = useCallback((voice: VoiceFocusTarget) => {
    setFocusedVoiceState(voice);

    if (vocalGainRef.current && accompanimentGainRef.current && vocalCompressorRef.current) {
      switch (voice) {
        case 'soprano':
          // Highlight Soprano voice with +6dB vocal boost & soft background
          vocalGainRef.current.gain.rampTo(2.2, 0.1);
          accompanimentGainRef.current.gain.rampTo(0.12, 0.1);
          vocalCompressorRef.current.threshold.value = -18;
          vocalCompressorRef.current.ratio.value = 5;
          break;
        case 'contralto':
          // Highlight Contralto voice with warm midrange gain boost
          vocalGainRef.current.gain.rampTo(2.0, 0.1);
          accompanimentGainRef.current.gain.rampTo(0.15, 0.1);
          vocalCompressorRef.current.threshold.value = -20;
          vocalCompressorRef.current.ratio.value = 4.5;
          break;
        case 'tenor':
          vocalGainRef.current.gain.rampTo(1.8, 0.1);
          accompanimentGainRef.current.gain.rampTo(0.18, 0.1);
          vocalCompressorRef.current.threshold.value = -22;
          vocalCompressorRef.current.ratio.value = 4;
          break;
        case 'bass':
          vocalGainRef.current.gain.rampTo(1.7, 0.1);
          accompanimentGainRef.current.gain.rampTo(0.2, 0.1);
          vocalCompressorRef.current.threshold.value = -24;
          vocalCompressorRef.current.ratio.value = 3.5;
          break;
        case 'tutti':
          // Balanced Tutti mode (all voices and accompaniment together)
          vocalGainRef.current.gain.rampTo(1.0, 0.1);
          accompanimentGainRef.current.gain.rampTo(0.8, 0.1);
          vocalCompressorRef.current.threshold.value = -12;
          vocalCompressorRef.current.ratio.value = 2;
          break;
        default:
          break;
      }
    }
  }, []);

  const updateProgress = useCallback(() => {
    if (vocalPlayerRef.current && vocalPlayerRef.current.state === 'started') {
      const time = vocalPlayerRef.current.toSeconds(vocalPlayerRef.current.immediate()) - (vocalPlayerRef.current as any)._startTime;
      const dur = vocalPlayerRef.current.buffer.duration;
      const progress = Math.min(Math.max(time, 0), dur);

      setCurrentTime(progress);

      if (progress >= dur) {
        setIsPlaying(false);
        setCurrentTime(0);
        return;
      }

      animFrameRef.current = requestAnimationFrame(updateProgress);
    }
  }, []);

  const loadStems = useCallback(async (options: MultiStemMixerOptions) => {
    try {
      setIsLoading(true);
      setError(null);

      const { vocalUrl, accompanimentUrl } = options;

      let vUrl: string = typeof vocalUrl === 'string' ? vocalUrl : URL.createObjectURL(vocalUrl);
      let aUrl: string = typeof accompanimentUrl === 'string' ? accompanimentUrl : URL.createObjectURL(accompanimentUrl);

      await Tone.start();

      if (!vocalPlayerRef.current || !accompanimentPlayerRef.current) return;

      await Promise.all([
        vocalPlayerRef.current.load(vUrl),
        accompanimentPlayerRef.current.load(aUrl)
      ]);

      const maxDur = Math.max(
        vocalPlayerRef.current.buffer.duration,
        accompanimentPlayerRef.current.buffer.duration
      );

      setDuration(maxDur);
      setCurrentTime(0);
      setIsPlaying(false);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar as faixas no mixer.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const play = useCallback(async () => {
    if (!vocalPlayerRef.current || !vocalPlayerRef.current.loaded || !accompanimentPlayerRef.current) {
      setError('Stems de áudio não carregados.');
      return;
    }

    await Tone.start();

    const now = Tone.now();
    const offset = currentTime;

    vocalPlayerRef.current.start(now, offset);
    accompanimentPlayerRef.current.start(now, offset);

    setIsPlaying(true);
    animFrameRef.current = requestAnimationFrame(updateProgress);
  }, [currentTime, updateProgress]);

  const pause = useCallback(() => {
    if (vocalPlayerRef.current && accompanimentPlayerRef.current) {
      vocalPlayerRef.current.stop();
      accompanimentPlayerRef.current.stop();
      setIsPlaying(false);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    }
  }, []);

  const stop = useCallback(() => {
    if (vocalPlayerRef.current && accompanimentPlayerRef.current) {
      vocalPlayerRef.current.stop();
      accompanimentPlayerRef.current.stop();
      setIsPlaying(false);
      setCurrentTime(0);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    }
  }, []);

  const seek = useCallback((seconds: number) => {
    const wasPlaying = isPlaying;
    stop();
    setCurrentTime(seconds);
    if (wasPlaying) {
      setTimeout(() => {
        play();
      }, 50);
    }
  }, [isPlaying, play, stop]);

  return {
    loadStems,
    play,
    pause,
    stop,
    setPitchSemitones,
    setFocusVoice,
    pitchSemitones,
    focusedVoice,
    isPlaying,
    isLoading,
    duration,
    currentTime,
    seek,
    error
  };
};
