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
  vocalUrl: string | File | Blob;
  accompanimentUrl: string | File | Blob;
  sopranoUrl?: string | File | Blob;
  mezzoSopranoUrl?: string | File | Blob;
  contraltoUrl?: string | File | Blob;
  tenorUrl?: string | File | Blob;
  baritoneUrl?: string | File | Blob;
  bassUrl?: string | File | Blob;
}

export interface UseMultiStemMixerReturn {
  loadStems: (options: MultiStemMixerOptions) => Promise<void>;
  switchVocalStem: (newVocalUrl: string | File | Blob) => Promise<void>;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  setPitchSemitones: (semitones: number) => void;
  setVocalHarmonicShift: (semitones: number) => void;
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
  soprano: { id: 'soprano', label: 'Soprano', harmonicRole: '1ª Tônica (Melodia)', semitoneInterval: 0, volume: 1.0, isMuted: false, isSolo: false, color: '#ec4899' },
  mezzoSoprano: { id: 'mezzoSoprano', label: 'Mezzo-soprano', harmonicRole: 'Harmonia Intermediária', semitoneInterval: 4, volume: 1.0, isMuted: false, isSolo: false, color: '#f43f5e' },
  contralto: { id: 'contralto', label: 'Contralto', harmonicRole: '3ª Terça (Harmonia)', semitoneInterval: 4, volume: 1.0, isMuted: false, isSolo: false, color: '#8b5cf6' },
  tenor: { id: 'tenor', label: 'Tenor', harmonicRole: '5ª Quinta (Harmonia)', semitoneInterval: 7, volume: 1.0, isMuted: false, isSolo: false, color: '#3b82f6' },
  baritone: { id: 'baritone', label: 'Barítono', harmonicRole: 'Harmonia / Base', semitoneInterval: -5, volume: 1.0, isMuted: false, isSolo: false, color: '#06b6d4' },
  bass: { id: 'bass', label: 'Baixo', harmonicRole: 'Fundamental (8ª Baixa)', semitoneInterval: -12, volume: 1.0, isMuted: false, isSolo: false, color: '#10b981' },
  accompaniment: { id: 'accompaniment', label: 'Instrumental', harmonicRole: 'Base Harmônica', semitoneInterval: 0, volume: 0.4, isMuted: false, isSolo: false, color: '#f59e0b' }
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
  const vocalPitchShiftRef = useRef<Tone.PitchShift | null>(null);
  const activeHarmonicShiftRef = useRef<number>(0);
  const masterGainRef = useRef<Tone.Gain | null>(null);

  // Dedicated GainNode & Tone.Player per stem (only 2 active tracks: accompaniment and vocal)
  const channelGainsRef = useRef<Partial<Record<StemChannelId, Tone.Gain>>>({});
  const playersRef = useRef<Partial<Record<StemChannelId, Tone.Player>>>({});

  const animFrameRef = useRef<number | null>(null);

  // Helper to ensure Web Audio Graph is initialized with direct clean routing
  const ensureAudioGraph = useCallback(() => {
    if (masterGainRef.current) return;

    // Master Gain directly connects to destination for zero latency & pure unaltered audio
    const masterGain = new Tone.Gain(1.0).toDestination();
    masterGainRef.current = masterGain;

    // Accompaniment track (Track 1)
    const instGain = new Tone.Gain(DEFAULT_CHANNELS.accompaniment.volume).connect(masterGain);
    const instPlayer = new Tone.Player({ loop: false, autostart: false });
    instPlayer.connect(instGain);
    channelGainsRef.current.accompaniment = instGain;
    playersRef.current.accompaniment = instPlayer;

    // Vocal track (Track 2) with direct clean routing (Zero latency & pure unaltered audio)
    const vocalGain = new Tone.Gain(DEFAULT_CHANNELS.soprano.volume).connect(masterGain);
    const vocalPlayer = new Tone.Player({ loop: false, autostart: false });
    vocalPlayer.connect(vocalGain);
    channelGainsRef.current.soprano = vocalGain;
    playersRef.current.soprano = vocalPlayer;
  }, []);

  // Cleanup Web Audio Graph on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      Object.values(playersRef.current).forEach((p) => p?.dispose());
      Object.values(channelGainsRef.current).forEach((g) => g?.dispose());
      masterGainRef.current?.dispose();
      pitchShiftRef.current?.dispose();
      vocalPitchShiftRef.current?.dispose();
      pitchShiftRef.current = null;
      vocalPitchShiftRef.current = null;
      masterGainRef.current = null;
    };
  }, []);

  // Apply GainNode values proportionally and cleanly (zero is strictly zero silence)
  const applyChannelGains = useCallback((chStates: Record<StemChannelId, StemChannelState>) => {
    const instGainNode = channelGainsRef.current.accompaniment;
    const vocalGainNode = channelGainsRef.current.soprano;

    const instCh = chStates.accompaniment;
    // Find active vocal channel or default to soprano
    const vocalCh = Object.values(chStates).find((c) => c.id !== 'accompaniment' && (c.volume > 0 || c.isSolo)) || chStates.soprano;

    const anySolo = Object.values(chStates).some((c) => c.isSolo);

    if (instGainNode) {
      let instTarget = 0;
      if (instCh.isMuted) {
        instTarget = 0;
      } else if (anySolo) {
        instTarget = instCh.isSolo ? Math.max(0, instCh.volume) : 0;
      } else {
        instTarget = Math.max(0, Math.min(1.0, instCh.volume));
      }

      try {
        instGainNode.gain.cancelScheduledValues(Tone.now());
        instGainNode.gain.rampTo(instTarget, 0.015);
      } catch (e) {
        instGainNode.gain.value = instTarget;
      }
    }

    if (vocalGainNode) {
      let vocalTarget = 0;
      if (vocalCh.isMuted) {
        vocalTarget = 0;
      } else if (anySolo) {
        vocalTarget = vocalCh.isSolo ? Math.max(0, vocalCh.volume) : 0;
      } else {
        // Vocal fader is clean and prominent (linear gain)
        vocalTarget = Math.max(0, Math.min(1.5, vocalCh.volume));
      }

      try {
        vocalGainNode.gain.cancelScheduledValues(Tone.now());
        vocalGainNode.gain.rampTo(vocalTarget, 0.015);
      } catch (e) {
        vocalGainNode.gain.value = vocalTarget;
      }
    }
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
      masterGainRef.current.gain.rampTo(boundedVal, 0.015);
    }
  }, []);

  // Set Channel Volume Fader (Direct proportional volume adjustment)
  const setChannelVolume = useCallback(
    (id: StemChannelId, volume: number) => {
      setChannels((prev) => {
        const next = {
          ...prev,
          [id]: { ...prev[id], volume: Math.max(0, Math.min(1.5, volume)) }
        };
        // Also sync all vocal channels so active voice stays in sync
        if (id !== 'accompaniment') {
          const vocalIds: StemChannelId[] = ['soprano', 'contralto', 'tenor', 'bass', 'mezzoSoprano', 'baritone'];
          vocalIds.forEach((vid) => {
            if (next[vid]) {
              next[vid] = { ...next[vid], volume: Math.max(0, Math.min(1.5, volume)) };
            }
          });
        }
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

  // Toggle Solo (S) - Isolates stem GainNode to its volume and silences other GainNodes
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

  const stop = useCallback(() => {
    Object.values(playersRef.current).forEach((player) => player?.stop());
    setIsPlaying(false);
    setCurrentTime(0);
    currentTimeRef.current = 0;
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
  }, []);

  // Set Pitch Shift Semitones (-6 to +6)
  // Sempre que alterar o tom: pausar a reprodução e recomeçar do início (0:00)
  const setPitchSemitones = useCallback((semitones: number) => {
    stop();
    setPitchState(semitones);
    if (!masterGainRef.current) return;

    if (semitones === 0) {
      // 0 ST: Disconnect pitchShift, pure direct connection to destination with ZERO delay
      try {
        masterGainRef.current.disconnect();
        if (pitchShiftRef.current) {
          pitchShiftRef.current.disconnect();
        }
      } catch (e) {}
      masterGainRef.current.toDestination();
    } else {
      // Transposed: Connect through Tone.PitchShift
      try {
        masterGainRef.current.disconnect();
        if (!pitchShiftRef.current) {
          pitchShiftRef.current = new Tone.PitchShift({
            pitch: semitones,
            windowSize: 0.1
          }).toDestination();
        } else {
          pitchShiftRef.current.pitch = semitones;
          pitchShiftRef.current.toDestination();
        }
        masterGainRef.current.connect(pitchShiftRef.current);
      } catch (e) {
        console.warn('Pitch shift connection error:', e);
      }
    }
  }, []);

  // Set Vocal Harmonic Shift (state tracker for tuner/evaluator with 100% direct zero-delay audio connection)
  const setVocalHarmonicShift = useCallback((semitones: number) => {
    activeHarmonicShiftRef.current = semitones;
    const vocalPlayer = playersRef.current.soprano;
    const vocalGain = channelGainsRef.current.soprano;

    if (!vocalPlayer || !vocalGain) return;

    try {
      vocalPlayer.disconnect();
    } catch (e) {}

    // Direct clean connection: 100% pristine audio, zero delay, zero comb-filtering
    vocalPlayer.connect(vocalGain);
  }, []);

  // Synchronized playback progress tracker
  const updateProgress = useCallback(() => {
    // Accompaniment is always the primary reference master clock
    const masterPlayer = playersRef.current.accompaniment || playersRef.current.soprano;

    if (masterPlayer && masterPlayer.buffer && masterPlayer.state === 'started') {
      const dur = masterPlayer.buffer.duration || 1;
      let rawTime = 0;
      try {
        const startTime = (masterPlayer as any)._startTime || 0;
        rawTime = masterPlayer.toSeconds(masterPlayer.immediate()) - startTime;
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
      // Instantly stop all players before loading new stems to avoid any audio overlap
      Object.values(playersRef.current).forEach((player) => {
        try {
          player?.stop();
        } catch (e) {}
      });
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      setIsPlaying(false);

      setIsLoading(true);
      setError(null);

      const {
        vocalUrl,
        accompanimentUrl
      } = options;

      const vUrl = typeof vocalUrl === 'string' ? vocalUrl : URL.createObjectURL(vocalUrl);
      const aUrl = typeof accompanimentUrl === 'string' ? accompanimentUrl : URL.createObjectURL(accompanimentUrl);

      const loadPromises: Promise<any>[] = [];

      if (playersRef.current.accompaniment) {
        loadPromises.push(playersRef.current.accompaniment.load(aUrl));
      }
      if (playersRef.current.soprano) {
        loadPromises.push(playersRef.current.soprano.load(vUrl));
      }

      await Promise.all(loadPromises);

      const dur = playersRef.current.accompaniment?.buffer.duration || playersRef.current.soprano?.buffer.duration || 0;
      setDuration(dur);
      setCurrentTime(0);

      // Re-apply channel gains so target gains are clean
      applyChannelGains(DEFAULT_CHANNELS);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar as faixas na mesa de som.');
    } finally {
      setIsLoading(false);
    }
  }, [ensureAudioGraph, applyChannelGains]);

  // Voice stem switching: loads the newly selected voice into Track 2 cleanly
  const switchVocalStem = useCallback(
    async (newVocalUrl: string | File | Blob) => {
      try {
        ensureAudioGraph();
        const vocalPlayer = playersRef.current.soprano;
        if (!vocalPlayer) return;

        // 1. Immediately terminate playback of previous voice
        try {
          vocalPlayer.stop();
        } catch (e) {}

        // 2. Load the new voice stem into the vocal player
        const vUrl = typeof newVocalUrl === 'string' ? newVocalUrl : URL.createObjectURL(newVocalUrl);
        await vocalPlayer.load(vUrl);
      } catch (err) {
        console.warn('Erro ao trocar faixa do Cantor Virtual:', err);
      }
    },
    [ensureAudioGraph]
  );

  // Synchronized Playback Start
  const play = useCallback(async () => {
    ensureAudioGraph();
    await Tone.start();
    const rawOffset = Number(currentTimeRef.current);
    const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

    // Lookahead scheduling (40ms) guarantees that Web Audio hardware buffers are primed
    // and both accompaniment and vocal start at the EXACT identical sample quantum!
    const scheduleTime = Tone.now() + 0.04;

    Object.values(playersRef.current).forEach((player) => {
      if (player && player.loaded) {
        try {
          (player as any)._startTime = scheduleTime - offset;
          player.start(scheduleTime, offset);
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
    switchVocalStem,
    play,
    pause,
    stop,
    setPitchSemitones,
    setVocalHarmonicShift,
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
