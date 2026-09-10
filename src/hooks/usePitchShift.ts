import { useState, useEffect, useRef, useCallback } from 'react';
import * as Tone from 'tone';

export interface UsePitchShiftReturn {
  loadAudio: (fileOrUrl: File | Blob | string) => Promise<void>;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  setPitchSemitones: (semitones: number) => void;
  pitchSemitones: number;
  isPlaying: boolean;
  isLoading: boolean;
  duration: number;
  currentTime: number;
  seek: (seconds: number) => void;
  fileName: string | null;
  error: string | null;
}

export const usePitchShift = (initialPitchSemitones: number = 0): UsePitchShiftReturn => {
  const [pitchSemitones, setPitchState] = useState<number>(initialPitchSemitones);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const playerRef = useRef<Tone.Player | null>(null);
  const pitchShiftRef = useRef<Tone.PitchShift | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Initialize Tone.js audio nodes
  useEffect(() => {
    const pitchShift = new Tone.PitchShift({
      pitch: initialPitchSemitones,
      windowSize: 0.1,
      delayTime: 0,
      feedback: 0
    }).toDestination();

    const player = new Tone.Player({
      loop: false,
      autostart: false,
      onstop: () => {
        setIsPlaying(false);
      }
    }).connect(pitchShift);

    playerRef.current = player;
    pitchShiftRef.current = pitchShift;

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      player.dispose();
      pitchShift.dispose();
    };
  }, []);

  // Sync pitch semitones dynamically
  const setPitchSemitones = useCallback((semitones: number) => {
    setPitchState(semitones);
    if (pitchShiftRef.current) {
      pitchShiftRef.current.pitch = semitones;
    }
  }, []);

  // Update current time progress
  const updateProgress = useCallback(() => {
    if (playerRef.current && playerRef.current.state === 'started') {
      const time = playerRef.current.toSeconds(playerRef.current.immediate()) - (playerRef.current as any)._startTime;
      const bufferDuration = playerRef.current.buffer.duration;
      const progress = Math.min(Math.max(time, 0), bufferDuration);
      setCurrentTime(progress);
      animFrameRef.current = requestAnimationFrame(updateProgress);
    }
  }, []);

  // Load audio file or URL
  const loadAudio = useCallback(async (fileOrUrl: File | Blob | string) => {
    try {
      setIsLoading(true);
      setError(null);

      let url: string;
      if (typeof fileOrUrl === 'string') {
        url = fileOrUrl;
        setFileName(fileOrUrl.split('/').pop() || 'Audio stream');
      } else {
        url = URL.createObjectURL(fileOrUrl);
        setFileName(fileOrUrl instanceof File ? fileOrUrl.name : 'Arquivo de Áudio');
      }

      if (!playerRef.current) return;

      await playerRef.current.load(url);
      setDuration(playerRef.current.buffer.duration);
      setCurrentTime(0);
      setIsPlaying(false);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar e decodificar o arquivo de áudio.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Play audio
  const play = useCallback(async () => {
    if (!playerRef.current || !playerRef.current.loaded) {
      setError('Nenhum áudio carregado.');
      return;
    }

    await Tone.start();
    if (playerRef.current.state !== 'started') {
      playerRef.current.start(undefined, currentTime);
      setIsPlaying(true);
      animFrameRef.current = requestAnimationFrame(updateProgress);
    }
  }, [currentTime, updateProgress]);

  // Pause audio
  const pause = useCallback(() => {
    if (playerRef.current && playerRef.current.state === 'started') {
      playerRef.current.stop();
      setIsPlaying(false);
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    }
  }, []);

  // Stop audio
  const stop = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.stop();
      setIsPlaying(false);
      setCurrentTime(0);
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    }
  }, []);

  // Seek audio to specific time in seconds
  const seek = useCallback((seconds: number) => {
    if (playerRef.current) {
      const wasPlaying = playerRef.current.state === 'started';
      if (wasPlaying) {
        playerRef.current.stop();
      }
      setCurrentTime(seconds);
      if (wasPlaying) {
        playerRef.current.start(undefined, seconds);
      }
    }
  }, []);

  return {
    loadAudio,
    play,
    pause,
    stop,
    setPitchSemitones,
    pitchSemitones,
    isPlaying,
    isLoading,
    duration,
    currentTime,
    seek,
    fileName,
    error
  };
};
