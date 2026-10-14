import { useState, useEffect, useRef, useCallback } from 'react';
import * as Tone from 'tone';

export type StemChannelId = 'soprano' | 'mezzoSoprano' | 'contralto' | 'tenor' | 'baritone' | 'bass' | 'accompaniment';

export interface StemChannelState {
  id: StemChannelId;
  label: string;
  harmonicRole: string;
  semitoneInterval: number;
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
  focusBoostMultiplier: number;
  setFocusBoostMultiplier: (multiplier: number) => void;
  setOnSongEnded: (callback: (() => void) | null) => void;
}

// Initial Channels Configuration:
// Configured according to musical triad harmony rules (Tônica, Terça, Quinta):
// - Soprano: 1ª Tônica / Melodia Principal
// - Contralto: 3ª Terça (em Dó Maior = Mi)
// - Tenor: 5ª Quinta (em Dó Maior = Sol)
// - Baixo: Fundamental em oitava baixa (em Dó Maior = Dó grave)
// Eliminates any misleading abbreviations like 'Grave F' or 'Agudo M'.
const DEFAULT_CHANNELS: Record<StemChannelId, StemChannelState> = {
  soprano: { id: 'soprano', label: 'Soprano', harmonicRole: '1ª Tônica (Melodia)', semitoneInterval: 0, volume: 0.9, isMuted: false, isSolo: false, color: '#ec4899' },
  mezzoSoprano: { id: 'mezzoSoprano', label: 'Mezzo-soprano', harmonicRole: 'Harmonia Intermediária', semitoneInterval: 4, volume: 0.0, isMuted: false, isSolo: false, color: '#f43f5e' },
  contralto: { id: 'contralto', label: 'Contralto', harmonicRole: '3ª Terça (Harmonia)', semitoneInterval: 4, volume: 0.0, isMuted: false, isSolo: false, color: '#8b5cf6' },
  tenor: { id: 'tenor', label: 'Tenor', harmonicRole: '5ª Quinta (Harmonia)', semitoneInterval: 7, volume: 0.0, isMuted: false, isSolo: false, color: '#3b82f6' },
  baritone: { id: 'baritone', label: 'Barítono', harmonicRole: 'Harmonia / Base', semitoneInterval: -5, volume: 0.0, isMuted: false, isSolo: false, color: '#06b6d4' },
  bass: { id: 'bass', label: 'Baixo', harmonicRole: 'Fundamental (8ª Baixa)', semitoneInterval: -12, volume: 0.0, isMuted: false, isSolo: false, color: '#10b981' },
  accompaniment: { id: 'accompaniment', label: 'Instrumental', harmonicRole: 'Base Harmônica', semitoneInterval: 0, volume: 0.8, isMuted: false, isSolo: false, color: '#f59e0b' }
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
  const [focusBoostMultiplier, setFocusBoostMultiplierState] = useState<number>(1.25);
  const focusBoostRef = useRef<number>(1.25);
  const onEndedRef = useRef<(() => void) | null>(null);
  const currentTimeRef = useRef<number>(0);

  const setCurrentTime = useCallback((val: number) => {
    currentTimeRef.current = val;
    setCurrentTimeState(val);
  }, []);

  const setOnSongEnded = useCallback((cb: (() => void) | null) => {
    onEndedRef.current = cb;
  }, []);

  // Tone.js Audio Graph Nodes
  const pitchShiftRef = useRef<Tone.PitchShift | null>(null);
  const masterGainRef = useRef<Tone.Gain | null>(null);
  const vocalLimiterRef = useRef<Tone.Limiter | null>(null);
  const vocalCompressorRef = useRef<Tone.Compressor | null>(null);

  // Dedicated GainNode & Tone.Player per stem
  const channelGainsRef = useRef<Partial<Record<StemChannelId, Tone.Gain>>>({});
  const playersRef = useRef<Partial<Record<StemChannelId, Tone.Player>>>({});

  const animFrameRef = useRef<number | null>(null);

  // Helper to ensure Web Audio Graph is initialized with bypassed PitchShift (wet=0) when semitones === 0
  const ensureAudioGraph = useCallback(() => {
    if (pitchShiftRef.current) return;

    const pitchShift = new Tone.PitchShift({
      pitch: 0,
      windowSize: 0.1,
      delayTime: 0,
      feedback: 0
    }).toDestination();

    // Bypassed by default to ensure ZERO pitch shifting, phase vocoder delay, or pitch artifacts
    pitchShift.wet.value = 0;

    const masterGain = new Tone.Gain(0.9).connect(pitchShift);

    // Brickwall limiter at master input prevents any digital clipping from high vocal gains
    const vocalLimiter = new Tone.Limiter(-0.5).connect(masterGain);

    // Musical, transparent vocal bus compressor (smooth threshold, preserves full dynamic punch)
    const vocalCompressor = new Tone.Compressor({
      threshold: -8,
      ratio: 2,
      attack: 0.005,
      release: 0.05
    }).connect(vocalLimiter);

    pitchShiftRef.current = pitchShift;
    masterGainRef.current = masterGain;
    vocalLimiterRef.current = vocalLimiter;
    vocalCompressorRef.current = vocalCompressor;

    // Create dedicated GainNodes per channel with direct pure signal path
    const channelIds: StemChannelId[] = ['soprano', 'mezzoSoprano', 'contralto', 'tenor', 'baritone', 'bass', 'accompaniment'];
    channelIds.forEach((id) => {
      const dest = id === 'accompaniment' ? masterGain : vocalCompressor;
      const initialGain = DEFAULT_CHANNELS[id].volume;
      const gainNode = new Tone.Gain(initialGain).connect(dest);
      const playerNode = new Tone.Player({ loop: false, autostart: false });

      // Direct, uncolored connection: preserves 100% natural vocal harmonics, frequency body and maximum volume
      playerNode.connect(gainNode);

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
      vocalLimiterRef.current?.dispose();
      masterGainRef.current?.dispose();
      pitchShiftRef.current?.dispose();
      pitchShiftRef.current = null;
      masterGainRef.current = null;
      vocalLimiterRef.current = null;
      vocalCompressorRef.current = null;
    };
  }, []);

  // Apply GainNode values exclusively.
  // "Focar" (Solo): Boosts focused voice channel gain prominently (2.4x - 4x) while ducking accompaniment
  const applyChannelGains = useCallback((chStates: Record<StemChannelId, StemChannelState>) => {
    const soloActive = Object.values(chStates).some((ch) => ch.isSolo);
    const boostMultiplier = focusBoostRef.current || 1.25;

    Object.values(chStates).forEach((ch) => {
      const gainNode = channelGainsRef.current[ch.id];
      if (!gainNode) return;

      let targetGain = 0;
      if (ch.isMuted) {
        targetGain = 0;
      } else if (soloActive) {
        if (ch.isSolo) {
          // Healthy, prominent volume boost: scales with channel fader, base 2.4x boost and user boost multiplier
          const faderVol = ch.volume > 0 ? ch.volume : 0.9;
          targetGain = Math.max(0.2, faderVol * 2.4 * boostMultiplier);
        } else if (ch.id === 'accompaniment' && !ch.isMuted) {
          // Duck accompaniment down to a quiet, soft background guide level (0.07-0.08)
          // so singer has clear tempo and harmonic reference without ANY vocal masking
          targetGain = Math.min(ch.volume * 0.1, 0.08);
        } else {
          // Silence all other non-focused vocal channels so the focused voice stands completely clear
          targetGain = 0;
        }
      } else {
        targetGain = ch.volume;
      }

      // Smooth ramp to avoid pops or volume jumps
      gainNode.gain.rampTo(targetGain, 0.05);
    });
  }, []);

  const setFocusBoostMultiplier = useCallback(
    (mult: number) => {
      const bounded = Math.max(1.0, Math.min(3.0, mult));
      focusBoostRef.current = bounded;
      setFocusBoostMultiplierState(bounded);
      setChannels((prev) => {
        applyChannelGains(prev);
        return prev;
      });
    },
    [applyChannelGains]
  );

  // Set Master Volume (0.0 to 1.0)
  const setMasterVolume = useCallback((val: number) => {
    const boundedVal = Math.max(0, Math.min(1, val));
    setMasterVolumeState(boundedVal);
    if (masterGainRef.current) {
      masterGainRef.current.gain.rampTo(boundedVal, 0.05);
    }
  }, []);

  // Set Channel Volume Fader (GainNode adjustment only)
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

  // Toggle Mute (M) - Mutes GainNode to 0.0
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

  // Toggle Solo (Focar) - Isolates stem GainNode to 1.0/0.9 and silences all other GainNodes to 0.0
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
  // Bypasses Tone.PitchShift completely (wet = 0) when semitones === 0 to preserve 100% original pitch
  const setPitchSemitones = useCallback((semitones: number) => {
    setPitchState(semitones);
    if (pitchShiftRef.current) {
      pitchShiftRef.current.pitch = semitones;
      pitchShiftRef.current.wet.value = semitones === 0 ? 0 : 1;
    }
  }, []);

  // Synchronized playback progress tracker
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
        if (onEndedRef.current) {
          onEndedRef.current();
        }
        return;
      }

      animFrameRef.current = requestAnimationFrame(updateProgress);
    }
  }, []);

  // Load Stems into Players in sample-exact alignment
  const loadStems = useCallback(async (options: MultiStemMixerOptions) => {
    try {
      ensureAudioGraph();
      setIsLoading(true);
      setError(null);

      const {
        vocalUrl,
        accompanimentUrl,
        sopranoUrl,
        mezzoSopranoUrl,
        contraltoUrl,
        tenorUrl,
        baritoneUrl,
        bassUrl
      } = options;

      const vUrl = typeof vocalUrl === 'string' ? vocalUrl : URL.createObjectURL(vocalUrl);
      const aUrl = typeof accompanimentUrl === 'string' ? accompanimentUrl : URL.createObjectURL(accompanimentUrl);

      const loadPromises: Promise<any>[] = [];

      // Determine stem URL per voice channel or fallback to vocalUrl
      const stemUrlMap: Record<StemChannelId, string> = {
        soprano: sopranoUrl ? (typeof sopranoUrl === 'string' ? sopranoUrl : URL.createObjectURL(sopranoUrl)) : vUrl,
        mezzoSoprano: mezzoSopranoUrl ? (typeof mezzoSopranoUrl === 'string' ? mezzoSopranoUrl : URL.createObjectURL(mezzoSopranoUrl)) : vUrl,
        contralto: contraltoUrl ? (typeof contraltoUrl === 'string' ? contraltoUrl : URL.createObjectURL(contraltoUrl)) : vUrl,
        tenor: tenorUrl ? (typeof tenorUrl === 'string' ? tenorUrl : URL.createObjectURL(tenorUrl)) : vUrl,
        baritone: baritoneUrl ? (typeof baritoneUrl === 'string' ? baritoneUrl : URL.createObjectURL(baritoneUrl)) : vUrl,
        bass: bassUrl ? (typeof bassUrl === 'string' ? bassUrl : URL.createObjectURL(bassUrl)) : vUrl,
        accompaniment: aUrl
      };

      (Object.keys(stemUrlMap) as StemChannelId[]).forEach((id) => {
        const player = playersRef.current[id];
        if (player) {
          loadPromises.push(player.load(stemUrlMap[id]));
        }
      });

      await Promise.all(loadPromises);

      const dur = playersRef.current.accompaniment?.buffer.duration || playersRef.current.soprano?.buffer.duration || 0;
      setDuration(dur);
      setCurrentTime(0);
      setIsPlaying(false);

      // Re-apply channel gains so target gains are clean
      applyChannelGains(DEFAULT_CHANNELS);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar as faixas na mesa de som.');
    } finally {
      setIsLoading(false);
    }
  }, [ensureAudioGraph, applyChannelGains]);

  // Synchronized Playback Start
  const play = useCallback(async () => {
    ensureAudioGraph();
    await Tone.start();
    const now = Tone.now();
    const rawOffset = Number(currentTimeRef.current);
    const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

    // Start all loaded players at the exact same audio context time timestamp (sample-exact sync)
    Object.values(playersRef.current).forEach((player) => {
      if (player && player.loaded) {
        try {
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
    error,
    focusBoostMultiplier,
    setFocusBoostMultiplier,
    setOnSongEnded
  };
};

export default useMultiStemMixer;
