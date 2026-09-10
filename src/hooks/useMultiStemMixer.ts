import { useState, useEffect, useRef, useCallback } from 'react';
import * as Tone from 'tone';

export type StemChannelId = 'soprano' | 'mezzoSoprano' | 'contralto' | 'tenor' | 'baritone' | 'bass' | 'accompaniment';

export interface StemChannelState {
  id: StemChannelId;
  label: string;
  volume: number; // 0.0 to 1.0 (linear gain)
  isMuted: boolean;
  isSolo: boolean;
  color: string;
}

export interface MultiStemMixerOptions {
  vocalUrl: string | File;
  accompanimentUrl: string | File;
  sopranoUrl?: string | File;
  mezzoSopranoUrl?: string | File;
  contraltoUrl?: string | File;
  tenorUrl?: string | File;
  baritoneUrl?: string | File;
  bassUrl?: string | File;
}

export interface UseMultiStemMixerReturn {
  loadStems: (options: MultiStemMixerOptions) => Promise<void>;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  setPitchSemitones: (semitones: number) => void;
  setChannelVolume: (id: StemChannelId, volume: number) => void;
  toggleMute: (id: StemChannelId) => void;
  toggleSolo: (id: StemChannelId) => void;
  masterVolume: number;
  setMasterVolume: (val: number) => void;
  channels: Record<StemChannelId, StemChannelState>;
  soloActiveStem: StemChannelId | null;
  pitchSemitones: number;
  isPlaying: boolean;
  isLoading: boolean;
  duration: number;
  currentTime: number;
  seek: (seconds: number) => void;
  error: string | null;
}

const DEFAULT_CHANNELS: Record<StemChannelId, StemChannelState> = {
  soprano: { id: 'soprano', label: 'Soprano (Aguda)', volume: 0.9, isMuted: false, isSolo: false, color: '#ec4899' },
  mezzoSoprano: { id: 'mezzoSoprano', label: 'Mezzo-soprano (Média)', volume: 0.9, isMuted: false, isSolo: false, color: '#f43f5e' },
  contralto: { id: 'contralto', label: 'Contralto (Grave F)', volume: 0.9, isMuted: false, isSolo: false, color: '#8b5cf6' },
  tenor: { id: 'tenor', label: 'Tenor (Agudo M)', volume: 0.9, isMuted: false, isSolo: false, color: '#3b82f6' },
  baritone: { id: 'baritone', label: 'Barítono (Médio M)', volume: 0.9, isMuted: false, isSolo: false, color: '#06b6d4' },
  bass: { id: 'bass', label: 'Baixo (Grave M)', volume: 0.9, isMuted: false, isSolo: false, color: '#10b981' },
  accompaniment: { id: 'accompaniment', label: 'Instrumental', volume: 0.75, isMuted: false, isSolo: false, color: '#f59e0b' }
};

export const useMultiStemMixer = (): UseMultiStemMixerReturn => {
  const [pitchSemitones, setPitchState] = useState<number>(0);
  const [masterVolume, setMasterVolumeState] = useState<number>(0.9);
  const [channels, setChannels] = useState<Record<StemChannelId, StemChannelState>>(DEFAULT_CHANNELS);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTimeState] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const currentTimeRef = useRef<number>(0);

  const setCurrentTime = useCallback((val: number) => {
    currentTimeRef.current = val;
    setCurrentTimeState(val);
  }, []);

  // Tone.js Audio Graph Nodes
  const pitchShiftRef = useRef<Tone.PitchShift | null>(null);
  const masterGainRef = useRef<Tone.Gain | null>(null);
  const vocalCompressorRef = useRef<Tone.Compressor | null>(null);

  // Gain nodes per stem
  const channelGainsRef = useRef<Partial<Record<StemChannelId, Tone.Gain>>>({});
  const playersRef = useRef<Partial<Record<StemChannelId, Tone.Player>>>({});

  const animFrameRef = useRef<number | null>(null);

  // Helper to ensure Tone Audio Graph is initialized on demand (after user gesture)
  const ensureAudioGraph = useCallback(() => {
    if (pitchShiftRef.current) return;

    const pitchShift = new Tone.PitchShift({
      pitch: 0,
      windowSize: 0.1,
      delayTime: 0,
      feedback: 0
    }).toDestination();

    const masterGain = new Tone.Gain(0.9).connect(pitchShift);

    const vocalCompressor = new Tone.Compressor({
      threshold: -18,
      ratio: 4,
      attack: 0.005,
      release: 0.1
    }).connect(masterGain);

    pitchShiftRef.current = pitchShift;
    masterGainRef.current = masterGain;
    vocalCompressorRef.current = vocalCompressor;

    // Create channel gain nodes
    const channelIds: StemChannelId[] = ['soprano', 'mezzoSoprano', 'contralto', 'tenor', 'baritone', 'bass', 'accompaniment'];
    channelIds.forEach((id) => {
      const dest = id === 'accompaniment' ? masterGain : vocalCompressor;
      const gainNode = new Tone.Gain(DEFAULT_CHANNELS[id].volume).connect(dest);
      const playerNode = new Tone.Player({ loop: false, autostart: false }).connect(gainNode);

      channelGainsRef.current[id] = gainNode;
      playersRef.current[id] = playerNode;
    });
  }, []);

  // Cleanup Web Audio Graph on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      Object.values(playersRef.current).forEach((p) => p?.dispose());
      Object.values(channelGainsRef.current).forEach((g) => g?.dispose());
      vocalCompressorRef.current?.dispose();
      masterGainRef.current?.dispose();
      pitchShiftRef.current?.dispose();
      pitchShiftRef.current = null;
      masterGainRef.current = null;
      vocalCompressorRef.current = null;
    };
  }, []);

  // Update gain levels based on Faders, Mute (M) and Solo (S) logic with linear ramp to avoid pops
  const applyChannelGains = useCallback((chStates: Record<StemChannelId, StemChannelState>) => {
    const soloActive = Object.values(chStates).some((ch) => ch.isSolo);

    Object.values(chStates).forEach((ch) => {
      const gainNode = channelGainsRef.current[ch.id];
      if (!gainNode) return;

      let targetGain = 0;
      if (ch.isMuted) {
        targetGain = 0;
      } else if (soloActive) {
        // Completely isolate the soloed stem; silence all non-soloed stems to 0
        targetGain = ch.isSolo ? ch.volume : 0;
      } else {
        targetGain = ch.volume;
      }

      // Smooth linear ramp gain to eliminate audio pops
      gainNode.gain.rampTo(targetGain, 0.05);
    });
  }, []);

  // Set Master Volume (0.0 to 1.0)
  const setMasterVolume = useCallback((val: number) => {
    const boundedVal = Math.max(0, Math.min(1, val));
    setMasterVolumeState(boundedVal);
    if (masterGainRef.current) {
      masterGainRef.current.gain.rampTo(boundedVal, 0.05);
    }
  }, []);

  // Set Channel Volume
  const setChannelVolume = useCallback(
    (id: StemChannelId, volume: number) => {
      setChannels((prev) => {
        const next = {
          ...prev,
          [id]: { ...prev[id], volume: Math.max(0, Math.min(1, volume)) }
        };
        applyChannelGains(next);
        return next;
      });
    },
    [applyChannelGains]
  );

  // Toggle Mute (M)
  const toggleMute = useCallback(
    (id: StemChannelId) => {
      setChannels((prev) => {
        const next = {
          ...prev,
          [id]: { ...prev[id], isMuted: !prev[id].isMuted }
        };
        applyChannelGains(next);
        return next;
      });
    },
    [applyChannelGains]
  );

  // Toggle Solo (S)
  const toggleSolo = useCallback(
    (id: StemChannelId) => {
      setChannels((prev) => {
        const next = {
          ...prev,
          [id]: { ...prev[id], isSolo: !prev[id].isSolo }
        };
        applyChannelGains(next);
        return next;
      });
    },
    [applyChannelGains]
  );

  // Set Pitch Shift Semitones (-6 to +6)
  const setPitchSemitones = useCallback((semitones: number) => {
    setPitchState(semitones);
    if (pitchShiftRef.current) {
      pitchShiftRef.current.pitch = semitones;
    }
  }, []);

  // Update position progress
  const updateProgress = useCallback(() => {
    const activePlayer = Object.values(playersRef.current).find(
      (p) => p && p.state === 'started' && p.buffer && p.buffer.loaded
    );

    if (activePlayer && activePlayer.buffer) {
      const dur = activePlayer.buffer.duration || 1;
      let rawTime = 0;
      try {
        const startTime = (activePlayer as any)._startTime || 0;
        rawTime = activePlayer.toSeconds(activePlayer.immediate()) - startTime;
      } catch (e) {
        rawTime = 0;
      }

      const validTime = Number.isFinite(rawTime) && rawTime >= 0 ? rawTime : 0;
      const progress = Math.min(Math.max(validTime, 0), dur);

      setCurrentTime(progress);

      if (progress >= dur) {
        setIsPlaying(false);
        setCurrentTime(0);
        return;
      }

      animFrameRef.current = requestAnimationFrame(updateProgress);
    }
  }, []);

  // Load Stems into Players
  const loadStems = useCallback(async (options: MultiStemMixerOptions) => {
    try {
      ensureAudioGraph();
      setIsLoading(true);
      setError(null);

      const { vocalUrl, accompanimentUrl } = options;
      const vUrl = typeof vocalUrl === 'string' ? vocalUrl : URL.createObjectURL(vocalUrl);
      const aUrl = typeof accompanimentUrl === 'string' ? accompanimentUrl : URL.createObjectURL(accompanimentUrl);

      const loadPromises: Promise<any>[] = [];

      // Load Vocal stem into all voice channel players (Soprano, Mezzo-soprano, Contralto, Tenor, Barítono, Baixo)
      const vocalChannels: StemChannelId[] = ['soprano', 'mezzoSoprano', 'contralto', 'tenor', 'baritone', 'bass'];
      vocalChannels.forEach((id) => {
        const player = playersRef.current[id];
        if (player) loadPromises.push(player.load(vUrl));
      });

      // Load Accompaniment
      const accPlayer = playersRef.current.accompaniment;
      if (accPlayer) loadPromises.push(accPlayer.load(aUrl));

      await Promise.all(loadPromises);

      const dur = accPlayer?.buffer.duration || playersRef.current.soprano?.buffer.duration || 0;
      setDuration(dur);
      setCurrentTime(0);
      setIsPlaying(false);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar as faixas na mesa de som.');
    } finally {
      setIsLoading(false);
    }
  }, [ensureAudioGraph]);

  const play = useCallback(async () => {
    ensureAudioGraph();
    await Tone.start();
    const now = Tone.now();
    const rawOffset = Number(currentTimeRef.current);
    const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

    Object.values(playersRef.current).forEach((player) => {
      if (player && player.loaded) {
        try {
          // Record start time on Tone.Player for precise progress tracking
          (player as any)._startTime = now - offset;
          player.start(now, offset);
        } catch (err) {
          console.warn('Tone.Player start error:', err);
        }
      }
    });

    setIsPlaying(true);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(updateProgress);
  }, [ensureAudioGraph, updateProgress]);

  const pause = useCallback(() => {
    Object.values(playersRef.current).forEach((player) => player?.stop());
    setIsPlaying(false);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
  }, []);

  const stop = useCallback(() => {
    Object.values(playersRef.current).forEach((player) => player?.stop());
    setIsPlaying(false);
    setCurrentTime(0);
    currentTimeRef.current = 0;
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
  }, []);

  const seek = useCallback(
    (seconds: number) => {
      const wasPlaying = isPlaying;
      stop();
      setCurrentTime(seconds);
      currentTimeRef.current = seconds;
      if (wasPlaying) {
        setTimeout(() => play(), 50);
      }
    },
    [isPlaying, play, stop]
  );

  // Compute currently soloed stem channel (if any) to inform tuner pitch reference
  const soloActiveStem = (Object.keys(channels) as StemChannelId[]).find((id) => channels[id].isSolo) || null;

  return {
    loadStems,
    play,
    pause,
    stop,
    setPitchSemitones,
    setChannelVolume,
    toggleMute,
    toggleSolo,
    masterVolume,
    setMasterVolume,
    channels,
    soloActiveStem,
    pitchSemitones,
    isPlaying,
    isLoading,
    duration,
    currentTime,
    seek,
    error
  };
};
