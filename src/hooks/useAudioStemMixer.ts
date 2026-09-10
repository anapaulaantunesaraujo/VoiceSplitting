import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseAudioStemMixerReturn {
  loadStems: (vocalUrl: string | File, accompanimentUrl: string | File) => Promise<void>;
  play: () => void;
  pause: () => void;
  stop: () => void;
  setVocalGain: (gain: number) => void;
  setAccompanimentGain: (gain: number) => void;
  vocalGain: number;
  accompanimentGain: number;
  isPlaying: boolean;
  isLoading: boolean;
  duration: number;
  currentTime: number;
  seek: (seconds: number) => void;
  error: string | null;
}

export const useAudioStemMixer = (): UseAudioStemMixerReturn => {
  const [vocalGain, setVocalGainState] = useState<number>(1.0); // 1.0 = normal, >1.0 = boost (+6dB, +12dB), <1.0 = attenuation
  const [accompanimentGain, setAccompanimentGainState] = useState<number>(0.3); // Default attenuated
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const vocalBufferRef = useRef<AudioBuffer | null>(null);
  const accompanimentBufferRef = useRef<AudioBuffer | null>(null);

  const vocalSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const accompanimentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const vocalGainNodeRef = useRef<GainNode | null>(null);
  const accompanimentGainNodeRef = useRef<GainNode | null>(null);

  const startTimeRef = useRef<number>(0);
  const startOffsetRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);

  // Initialize Web Audio Context and Gain Nodes
  useEffect(() => {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();
    audioCtxRef.current = ctx;

    const vGainNode = ctx.createGain();
    const aGainNode = ctx.createGain();

    vGainNode.gain.value = vocalGain;
    aGainNode.gain.value = accompanimentGain;

    vGainNode.connect(ctx.destination);
    aGainNode.connect(ctx.destination);

    vocalGainNodeRef.current = vGainNode;
    accompanimentGainNodeRef.current = aGainNode;

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      ctx.close();
    };
  }, []);

  // Update Vocal Gain (GainNode control)
  const setVocalGain = useCallback((gain: number) => {
    setVocalGainState(gain);
    if (vocalGainNodeRef.current && audioCtxRef.current) {
      vocalGainNodeRef.current.gain.setTargetAtTime(gain, audioCtxRef.current.currentTime, 0.05);
    }
  }, []);

  // Update Accompaniment Gain (GainNode control)
  const setAccompanimentGain = useCallback((gain: number) => {
    setAccompanimentGainState(gain);
    if (accompanimentGainNodeRef.current && audioCtxRef.current) {
      accompanimentGainNodeRef.current.gain.setTargetAtTime(gain, audioCtxRef.current.currentTime, 0.05);
    }
  }, []);

  // Sync animation frame playback progress
  const updateProgress = useCallback(() => {
    if (audioCtxRef.current && isPlaying) {
      const elapsed = audioCtxRef.current.currentTime - startTimeRef.current + startOffsetRef.current;
      const maxDuration = Math.max(vocalBufferRef.current?.duration || 0, accompanimentBufferRef.current?.duration || 0);

      if (elapsed >= maxDuration) {
        setIsPlaying(false);
        startOffsetRef.current = 0;
        setCurrentTime(0);
        return;
      }

      setCurrentTime(elapsed);
      animFrameRef.current = requestAnimationFrame(updateProgress);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(updateProgress);
    } else if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
  }, [isPlaying, updateProgress]);

  // Decode array buffer into AudioBuffer
  const decodeAudioData = async (ctx: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> => {
    return new Promise((resolve, reject) => {
      ctx.decodeAudioData(data, resolve, reject);
    });
  };

  // Load Vocal and Accompaniment Stems
  const loadStems = useCallback(async (vocalInput: string | File, accompanimentInput: string | File) => {
    try {
      setIsLoading(true);
      setError(null);

      if (!audioCtxRef.current) return;
      const ctx = audioCtxRef.current;

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // Fetch / Read vocal array buffer
      let vBufferData: ArrayBuffer;
      if (typeof vocalInput === 'string') {
        const res = await fetch(vocalInput);
        vBufferData = await res.arrayBuffer();
      } else {
        vBufferData = await vocalInput.arrayBuffer();
      }

      // Fetch / Read accompaniment array buffer
      let aBufferData: ArrayBuffer;
      if (typeof accompanimentInput === 'string') {
        const res = await fetch(accompanimentInput);
        aBufferData = await res.arrayBuffer();
      } else {
        aBufferData = await accompanimentInput.arrayBuffer();
      }

      const vAudioBuffer = await decodeAudioData(ctx, vBufferData);
      const aAudioBuffer = await decodeAudioData(ctx, aBufferData);

      vocalBufferRef.current = vAudioBuffer;
      accompanimentBufferRef.current = aAudioBuffer;

      const calculatedDuration = Math.max(vAudioBuffer.duration, aAudioBuffer.duration);
      setDuration(calculatedDuration);
      setCurrentTime(0);
      startOffsetRef.current = 0;
      setIsPlaying(false);
    } catch (err: any) {
      setError(err?.message || 'Erro ao decodificar stems de áudio.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Stop current AudioBufferSourceNodes
  const stopSources = useCallback(() => {
    if (vocalSourceRef.current) {
      try { vocalSourceRef.current.stop(); } catch (e) {}
      vocalSourceRef.current.disconnect();
      vocalSourceRef.current = null;
    }
    if (accompanimentSourceRef.current) {
      try { accompanimentSourceRef.current.stop(); } catch (e) {}
      accompanimentSourceRef.current.disconnect();
      accompanimentSourceRef.current = null;
    }
  }, []);

  // Play synchronized stems
  const play = useCallback(async () => {
    if (!audioCtxRef.current || !vocalBufferRef.current || !accompanimentBufferRef.current) {
      setError('Stems não carregados.');
      return;
    }

    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    stopSources();

    const vSource = ctx.createBufferSource();
    const aSource = ctx.createBufferSource();

    vSource.buffer = vocalBufferRef.current;
    aSource.buffer = accompanimentBufferRef.current;

    if (vocalGainNodeRef.current) vSource.connect(vocalGainNodeRef.current);
    if (accompanimentGainNodeRef.current) aSource.connect(accompanimentGainNodeRef.current);

    vocalSourceRef.current = vSource;
    accompanimentSourceRef.current = aSource;

    const now = ctx.currentTime;
    startTimeRef.current = now;

    vSource.start(now, startOffsetRef.current);
    aSource.start(now, startOffsetRef.current);

    setIsPlaying(true);
  }, [stopSources]);

  // Pause synchronized stems
  const pause = useCallback(() => {
    if (audioCtxRef.current && isPlaying) {
      startOffsetRef.current += audioCtxRef.current.currentTime - startTimeRef.current;
      stopSources();
      setIsPlaying(false);
    }
  }, [isPlaying, stopSources]);

  // Stop synchronized stems
  const stop = useCallback(() => {
    stopSources();
    startOffsetRef.current = 0;
    setCurrentTime(0);
    setIsPlaying(false);
  }, [stopSources]);

  // Seek position
  const seek = useCallback((seconds: number) => {
    const wasPlaying = isPlaying;
    stopSources();
    startOffsetRef.current = seconds;
    setCurrentTime(seconds);

    if (wasPlaying) {
      play();
    }
  }, [isPlaying, play, stopSources]);

  return {
    loadStems,
    play,
    pause,
    stop,
    setVocalGain,
    setAccompanimentGain,
    vocalGain,
    accompanimentGain,
    isPlaying,
    isLoading,
    duration,
    currentTime,
    seek,
    error
  };
};
