import { useState, useEffect, useRef, useCallback } from 'react';
import * as Tone from 'tone';

export type StemChannelId = 'soprano' | 'contralto' | 'tenor' | 'bass' | 'accompaniment';

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
  contraltoUrl?: string | File;
  tenorUrl?: string | File;
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
  soprano: { id: 'soprano', label: 'Soprano', volume: 0.9, isMuted: false, isSolo: false, color: '#ec4899' },
  contralto: { id: 'contralto', label: 'Contralto', volume: 0.9, isMuted: false, isSolo: false, color: '#8b5cf6' },
  tenor: { id: 'tenor', label: 'Tenor', volume: 0.9, isMuted: false, isSolo: false, color: '#3b82f6' },
  bass: { id: 'bass', label: 'Baixo', volume: 0.9, isMuted: false, isSolo: false, color: '#10b981' },
  accompaniment: { id: 'accompaniment', label: 'Instrumental', volume: 0.75, isMuted: false, isSolo: false, color: '#f59e0b' }
};

export const useMultiStemMixer = (): UseMultiStemMixerReturn => {
  const [pitchSemitones, setPitchState] = useState<number>(0);
  const [masterVolume, setMasterVolumeState] = useState<number>(0.9);
  const [channels, setChannels] = useState<Record<StemChannelId, StemChannelState>>(DEFAULT_CHANNELS);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  // Tone.js Audio Graph Nodes
  const pitchShiftRef = useRef<Tone.PitchShift | null>(null);
  const masterGainRef = useRef<Tone.Gain | null>(null);
  const vocalCompressorRef = useRef<Tone.Compressor | null>(null);

  // Gain nodes per stem
  const channelGainsRef = useRef<Partial<Record<StemChannelId, Tone.Gain>>>({});
  const playersRef = useRef<Partial<Record<StemChannelId, Tone.Player>>>({});

  const animFrameRef = useRef<number | null>(null);

  // Initialize Web Audio Graph with PitchShift, MasterGain, and Channel Gains
  useEffect(() => {
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
    const channelIds: StemChannelId[] = ['soprano', 'contralto', 'tenor', 'bass', 'accompaniment'];
    channelIds.forEach((id) => {
      // Route vocal stems through vocal compressor, accompaniment directly to masterGain
      const dest = id === 'accompaniment' ? masterGain : vocalCompressor;
      const gainNode = new Tone.Gain(DEFAULT_CHANNELS[id].volume).connect(dest);
      const playerNode = new Tone.Player({ loop: false, autostart: false }).connect(gainNode);

      channelGainsRef.current[id] = gainNode;
      playersRef.current[id] = playerNode;
    });

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      Object.values(playersRef.current).forEach((p) => p?.dispose());
      Object.values(channelGainsRef.current).forEach((g) => g?.dispose());
      vocalCompressor.dispose();
      masterGain.dispose();
      pitchShift.dispose();
    };
  }, []);

  // Update gain levels based on Faders, Mute (M) and Solo (S) logic with linear ramp to avoid pops
  const applyChannelGains = useCallback((chStates: Record<StemChannelId, StemChannelState>) => {
    const soloActive = Object.values(chStates).some((ch) => ch.isSolo);

    (Object.keys(chStates) as StemChannelId[]).forEach((id) => {
      const gainNode = channelGainsRef.current[id];
      if (!gainNode) return;

      const ch = chStates[id];
      let targetGain = ch.volume;

      if (ch.isMuted) {
        targetGain = 0;
      } else if (soloActive) {
        if (ch.isSolo) {
          // Boost soloed stem slightly (+20%) for clarity
          targetGain = Math.min(ch.volume * 1.2, 1.5);
        } else {
          // Attenuate non-soloed stems to 15% reference background level (prevents total silence, allows manual fader tuning)
          targetGain = ch.volume * 0.15;
        }
      }

      // Ramp smoothly over 0.05 seconds to avoid dry pops/clicks in headphones
      gainNode.gain.rampTo(targetGain, 0.05);
    });
  }, []);

  // Set Pitch Shift Semitones (-6 to +6)
  const setPitchSemitones = useCallback((semitones: number) => {
    setPitchState(semitones);
    if (pitchShiftRef.current) {
      pitchShiftRef.current.pitch = semitones;
    }
  }, []);

  // Master Gain adjustment
  const setMasterVolume = useCallback((val: number) => {
    setMasterVolumeState(val);
    if (masterGainRef.current) {
      masterGainRef.current.gain.rampTo(val, 0.05);
    }
  }, []);

  // Set individual channel volume fader (0.0 to 1.0)
  const setChannelVolume = useCallback((id: StemChannelId, volume: number) => {
    setChannels((prev) => {
      const updated = {
        ...prev,
        [id]: { ...prev[id], volume }
      };
      applyChannelGains(updated);
      return updated;
    });
  }, [applyChannelGains]);

  // Toggle Mute (M)
  const toggleMute = useCallback((id: StemChannelId) => {
    setChannels((prev) => {
      const updated = {
        ...prev,
        [id]: { ...prev[id], isMuted: !prev[id].isMuted }
      };
      applyChannelGains(updated);
      return updated;
    });
  }, [applyChannelGains]);

  // Toggle Solo (S)
  const toggleSolo = useCallback((id: StemChannelId) => {
    setChannels((prev) => {
      const updated = {
        ...prev,
        [id]: { ...prev[id], isSolo: !prev[id].isSolo }
      };
      applyChannelGains(updated);
      return updated;
    });
  }, [applyChannelGains]);

  // Progress Tracker Loop
  const updateProgress = useCallback(() => {
    const mainPlayer = playersRef.current.soprano || playersRef.current.accompaniment;
    if (mainPlayer && mainPlayer.state === 'started') {
      const time = mainPlayer.toSeconds(mainPlayer.immediate()) - (mainPlayer as any)._startTime;
      const dur = mainPlayer.buffer.duration;
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

  // Load Stems into Players
  const loadStems = useCallback(async (options: MultiStemMixerOptions) => {
    try {
      setIsLoading(true);
      setError(null);

      const { vocalUrl, accompanimentUrl } = options;
      const vUrl = typeof vocalUrl === 'string' ? vocalUrl : URL.createObjectURL(vocalUrl);
      const aUrl = typeof accompanimentUrl === 'string' ? accompanimentUrl : URL.createObjectURL(accompanimentUrl);

      const loadPromises: Promise<any>[] = [];

      // Load Vocal stem into all voice channel players (Soprano, Contralto, Tenor, Bass)
      const vocalChannels: StemChannelId[] = ['soprano', 'contralto', 'tenor', 'bass'];
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
  }, []);

  const play = useCallback(async () => {
    await Tone.start();
    const now = Tone.now();
    const offset = currentTime;

    Object.values(playersRef.current).forEach((player) => {
      if (player && player.loaded) {
        player.start(now, offset);
      }
    });

    setIsPlaying(true);
    animFrameRef.current = requestAnimationFrame(updateProgress);
  }, [currentTime, updateProgress]);

  const pause = useCallback(() => {
    Object.values(playersRef.current).forEach((player) => player?.stop());
    setIsPlaying(false);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
  }, []);

  const stop = useCallback(() => {
    Object.values(playersRef.current).forEach((player) => player?.stop());
    setIsPlaying(false);
    setCurrentTime(0);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
  }, []);

  const seek = useCallback((seconds: number) => {
    const wasPlaying = isPlaying;
    stop();
    setCurrentTime(seconds);
    if (wasPlaying) {
      setTimeout(() => play(), 50);
    }
  }, [isPlaying, play, stop]);

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
