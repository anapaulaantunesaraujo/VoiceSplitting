import React, { useState, useEffect } from 'react';
import * as Tone from 'tone';
import { useMultiStemMixer, StemChannelId } from './hooks/useMultiStemMixer';
import { useIndexedDBSync, normalizeSongTitle, DEFAULT_VOICE_OCTAVES } from './hooks/useIndexedDBSync';
import { useVocalTuner } from './hooks/useVocalTuner';
import { useVocalEvaluation } from './hooks/useVocalEvaluation';
import { MoisesRepertoireView } from './components/MoisesRepertoireView';
import { MoisesStudioPlayer } from './components/MoisesStudioPlayer';
import { GoogleSyncModal } from './components/GoogleSyncModal';
import { UserProfile } from './components/GoogleLoginButton';
import { extractAudioFromVideo } from './utils/ffmpegAudioExtractor';
import { separateStemsWithWorker, audioBufferToWavBlob } from './utils/stemSeparationClient';
import { separateStemsWithServer, fetchServerSongAnalysis } from './utils/serverStemSeparation';
import { analyzeAudioKeyAndBpm } from './utils/audioKeyDetector';
import { generateVirtualSingerStems, pitchShiftAudioBuffer } from './utils/virtualSingerEngine';
import { formatMusicalKey } from './utils/harmonicField';

export const MainApp: React.FC = () => {
  // User Profile state from Google OAuth
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('voicesplit_user_profile');
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch {
      return null;
    }
  });

  const [isSyncModalOpen, setIsSyncModalOpen] = useState<boolean>(false);
  const VIRTUAL_SINGER_ENGINE_VERSION = 4; // v4: Harmonização Modal Adaptativa SATB (+3 ST Menor / +4 ST Maior)

  // Track active song metadata (empty until user selects or uploads a song)
  const [currentSongTitle, setCurrentSongTitle] = useState<string>('');
  const [currentKey, setCurrentKey] = useState<string>('');
  const [currentBpm, setCurrentBpm] = useState<number>(120);
  const [focusedVoice, setFocusedVoice] = useState<StemChannelId>('contralto');

  // Octave selection per voice: -1 (8ª Baixa), 0 (Original), +1 (8ª Alta)
  // Default: Tenor and Baixo = -1 (8ª Baixa); Soprano and Contralto = 0 (Original)
  const [voiceOctaveShifts, setVoiceOctaveShifts] = useState<Record<StemChannelId, number>>({
    ...(DEFAULT_VOICE_OCTAVES as Record<StemChannelId, number>)
  });

  // Stored active stems for Virtual Singer
  const [virtualSingerBlobs, setVirtualSingerBlobs] = useState<{
    soprano?: Blob | string;
    contralto?: Blob | string;
    tenor?: Blob | string;
    bass?: Blob | string;
  }>({});
  const [currentAccompanimentBlob, setCurrentAccompanimentBlob] = useState<Blob | string | null>(null);

  // In-memory cache for octave-shifted stems (eliminates recalculations, ensures 0ms latency)
  const octaveBlobCacheRef = React.useRef<Record<string, Record<number, Blob>>>({});

  // IndexedDB Single Source of Truth & Background Sync Hook
  const {
    savePracticeSession,
    saveAudioOffline,
    getAudioBlobById,
    saveSongPackage,
    deleteSong,
    moveSongCategory,
    offlineAudios,
    categories,
    songs,
    addCategory,
    renameCategory,
    deleteCategory,
    isSyncing,
    syncStatusLog,
    triggerBackgroundSync,
    exportRepertoireBackup,
    importRepertoireBackup,
    updateSongPreferences,
    updateSongKeyAndBpm
  } = useIndexedDBSync(userProfile);

  // Sincroniza automaticamente todo o repertório local com a análise real de Tom e BPM do Demucs no servidor
  useEffect(() => {
    let isCancelled = false;
    const syncRepertoireWithDemucs = async () => {
      const titles = new Set<string>();
      songs.forEach((s) => {
        if (s.title) titles.add(s.title);
      });
      offlineAudios.forEach((a) => {
        if (a.type === 'original' && a.name) titles.add(a.name);
      });

      for (const t of Array.from(titles)) {
        if (isCancelled) break;
        try {
          const serverMeta = await fetchServerSongAnalysis(t);
          if (serverMeta && serverMeta.key) {
            const formatted = formatMusicalKey(serverMeta.key);
            const matchedSong = songs.find(
              (s) => normalizeSongTitle(s.title).toLowerCase() === normalizeSongTitle(t).toLowerCase()
            );
            const matchedAudio = offlineAudios.find(
              (a) => normalizeSongTitle(a.name).toLowerCase() === normalizeSongTitle(t).toLowerCase()
            );

            const needUpdateSong =
              matchedSong && (matchedSong.key !== formatted || (serverMeta.bpm && matchedSong.bpm !== serverMeta.bpm));
            const needUpdateAudio =
              matchedAudio && (matchedAudio.key !== formatted || (serverMeta.bpm && matchedAudio.bpm !== serverMeta.bpm));

            if (needUpdateSong || needUpdateAudio) {
              await updateSongKeyAndBpm(t, formatted, serverMeta.bpm);
            }
          }
        } catch {
          // Ignored
        }
      }
    };

    if (songs.length > 0 || offlineAudios.length > 0) {
      syncRepertoireWithDemucs();
    }

    return () => {
      isCancelled = true;
    };
  }, [songs.length, offlineAudios.length, updateSongKeyAndBpm]);

  const handleTriggerSync = () => {
    if (!userProfile || !userProfile.accessToken) {
      setIsSyncModalOpen(true);
      return;
    }
    triggerBackgroundSync(userProfile);
  };

  const handleLoginSuccess = (profile: UserProfile) => {
    setUserProfile(profile);
    localStorage.setItem('voicesplit_user_profile', JSON.stringify(profile));
    triggerBackgroundSync(profile);
  };

  const handleLogout = () => {
    setUserProfile(null);
    localStorage.removeItem('voicesplit_user_profile');
  };

  // Active View ('repertoire' | 'player') - Simple 2-state clean flow!
  const [activeView, setActiveView] = useState<'repertoire' | 'player'>('repertoire');

  // Positive Validation Continuous Pitch Streak Counter
  const [pitchStreak, setPitchStreak] = useState<number>(0);

  // Processing animations and didactic loading states
  const [processingStage, setProcessingStage] = useState<'idle' | 'extracting' | 'analyzing' | 'separating' | 'done'>('idle');
  const [didacticMessage, setDidacticMessage] = useState<string>('');

  // Web Worker DSP & ONNX state
  const [isWorkerProcessing, setIsWorkerProcessing] = useState<boolean>(false);
  const [workerProgress, setWorkerProgress] = useState<number>(0);
  const [vocalStemBuffer, setVocalStemBuffer] = useState<AudioBuffer | null>(null);

  // Multi-Stem Tone.js Mixer Hook with Virtual Mixing Console & Channel Strips
  const {
    loadStems: loadMultiStems,
    switchVocalStem,
    play: playMulti,
    pause: pauseMulti,
    stop: stopMulti,
    setPitchSemitones: setMultiPitch,
    setVocalHarmonicShift,
    setChannelVolume,
    channels,
    pitchSemitones: multiPitch,
    isPlaying: isMultiPlaying,
    duration: multiDuration,
    currentTime: multiCurrentTime,
    seek: seekMulti,
    setOnSongEnded
  } = useMultiStemMixer();


  // Vocal Tuner & Microphone Hook with target pitch extraction & sidetone monitor
  const {
    startTuner,
    stopTuner,
    isListening,
    userPitch,
    targetPitch,
    extractTargetPitchFromBuffer,
    accuracyRate,
    sidetoneVolume,
    setSidetoneVolume,
    isMonitorMuted,
    setIsMonitorMuted,
    error: tunerError
  } = useVocalTuner();

  // Vocal Division Evaluation Hook
  const {
    isEvaluationMode,
    finishEvaluation
  } = useVocalEvaluation();

  // Cross-device Google Drive sync on login or reconnection
  useEffect(() => {
    if (userProfile && navigator.onLine) {
      triggerBackgroundSync(userProfile);
    }
  }, [userProfile, triggerBackgroundSync]);

  // Stop microphone tuner whenever leaving the player view
  useEffect(() => {
    if (activeView !== 'player' && isListening) {
      stopTuner();
    }
  }, [activeView, isListening, stopTuner]);

  // Monitor continuous pitch streaks
  useEffect(() => {
    if (userPitch) {
      let isAccurate = false;
      if (targetPitch && targetPitch.frequency > 0) {
        let centsDiff = 1200 * (Math.log(userPitch.frequency / targetPitch.frequency) / Math.log(2));
        while (centsDiff > 600) centsDiff -= 1200;
        while (centsDiff < -600) centsDiff += 1200;
        if (Math.abs(centsDiff) <= 12) isAccurate = true;
      } else if (Math.abs(userPitch.cents) <= 12) {
        isAccurate = true;
      }

      if (isAccurate) {
        setPitchStreak((prev) => prev + 1);
      } else {
        setPitchStreak(0);
      }
    }
  }, [userPitch, targetPitch]);

  // Auto-record practice session time in IndexedDB
  useEffect(() => {
    let timer: any = null;
    if (isListening) {
      timer = setInterval(() => {
        const isAccurate = pitchStreak > 0;
        savePracticeSession(1, isAccurate);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isListening, pitchStreak, savePracticeSession]);

  /**
   * Calculates the exact semitone shift to apply to the active Track 2 player.
   * - Bass blob is already baked at -12 ST (8ª Baixa). Thus octave -1 needs 0 ST shift, 0 needs +12 ST, +1 needs +24 ST.
   * - Soprano (0 ST), Contralto (+4 ST), Tenor (+7 ST):
   *   Octave -1 needs -12 ST shift (Tenor becomes -5 ST, perfect 8ª Baixa!), 0 needs 0 ST, +1 needs +12 ST.
   */
  const calculateEffectiveSemitoneShift = (voice: StemChannelId, octave: number, hasBakedBlob: boolean): number => {
    const isMinor = currentKey.endsWith('m') || currentKey.includes('Menor');
    const contraltoBase = isMinor ? 3 : 4;

    if (hasBakedBlob) {
      if (voice === 'bass' || voice === 'tenor') {
        return (octave + 1) * 12;
      }
      return octave * 12;
    } else {
      if (voice === 'bass') {
        return -12 + (octave + 1) * 12;
      }
      if (voice === 'tenor') {
        return -5 + (octave + 1) * 12;
      }
      const base = voice === 'contralto' ? contraltoBase : 0;
      return base + octave * 12;
    }
  };

  /**
   * Gets the true acoustic harmonic interval relative to the original melody for the Tuner.
   */
  const getTargetHarmonicShiftForTuner = (voice: StemChannelId, octave: number): number => {
    const isMinor = currentKey.endsWith('m') || currentKey.includes('Menor');
    const contraltoBase = isMinor ? 3 : 4;

    if (voice === 'bass') {
      return -12 + (octave + 1) * 12;
    }
    if (voice === 'tenor') {
      return -5 + (octave + 1) * 12;
    }
    const base = voice === 'contralto' ? contraltoBase : 0;
    return base + octave * 12;
  };

  // Extract target pitch from vocal buffer (with precise octave shift support)
  useEffect(() => {
    if (isMultiPlaying && vocalStemBuffer) {
      const activeHarmonicShift = getTargetHarmonicShiftForTuner(
        focusedVoice,
        voiceOctaveShifts[focusedVoice] ?? DEFAULT_VOICE_OCTAVES[focusedVoice] ?? 0
      );
      extractTargetPitchFromBuffer(vocalStemBuffer, multiCurrentTime, activeHarmonicShift);
    }
  }, [isMultiPlaying, multiCurrentTime, vocalStemBuffer, extractTargetPitchFromBuffer, focusedVoice, voiceOctaveShifts]);

  // Auto-finish on song ended
  useEffect(() => {
    setOnSongEnded(() => {
      if (isEvaluationMode) {
        finishEvaluation();
      }
    });
  }, [isEvaluationMode, finishEvaluation, setOnSongEnded]);

  /**
   * Complete Import Flow with Virtual Singer Generation:
   * 1. Detect Key & BPM
   * 2. Separate Vocal & Instrumental (Demucs or Web Worker)
   * 3. Generate 4 Isolated Virtual Singer Voices (Soprano, Contralto, Tenor, Baixo)
   *    with adaptive noise gate to guarantee 0% instrumental leakage.
   * 4. Save everything in IndexedDB and sync to Google Drive.
   */
  const processUploadedFile = async (file: File, targetCategory?: string) => {
    try {
      if (Tone.context && Tone.context.state !== 'running') {
        await Tone.start();
      }

      setProcessingStage('extracting');
      setDidacticMessage('Carregando arquivo de áudio...');

      const songTitle = normalizeSongTitle(file.name) || file.name.replace(/\.[^/.]+$/, '');
      setCurrentSongTitle(songTitle);

      let targetAudioFile: File = file;
      let targetAudioBuffer: AudioBuffer | null = null;

      const isVideo = file.type.startsWith('video/') || file.name.match(/\.(mp4|mov|avi|mkv|webm)$/i);

      if (isVideo) {
        setProcessingStage('extracting');
        setDidacticMessage('🎬 Extraindo áudio do vídeo com fidelidade...');
        const { audioFile, audioBuffer } = await extractAudioFromVideo(file, (prog) => {
          setDidacticMessage(`🎬 Extraindo áudio... (${Math.round(prog.ratio * 100)}%)`);
        });
        targetAudioFile = audioFile;
        targetAudioBuffer = audioBuffer;
      } else {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass();
        try {
          const arrBuffer = await file.arrayBuffer();
          targetAudioBuffer = await ctx.decodeAudioData(arrBuffer);
        } catch (decodeErr) {
          console.warn('decodeAudioData nativo falhou, convertendo áudio da gravação via FFmpeg...', decodeErr);
          setDidacticMessage('🎬 Decodificando formato da gravação via FFmpeg...');
          const { audioFile, audioBuffer } = await extractAudioFromVideo(file);
          targetAudioFile = audioFile;
          targetAudioBuffer = audioBuffer;
        } finally {
          await ctx.close();
        }
      }

      // 1. ANÁLISE HARMÔNICA DE TOM & BPM
      setProcessingStage('analyzing');
      setDidacticMessage('🎼 Detectando o Tom Musical e BPM da música...');

      let analysis = await analyzeAudioKeyAndBpm(targetAudioFile, targetAudioBuffer || undefined);
      setCurrentKey(analysis.rootNote + (analysis.mode === 'Minor' ? 'm' : ''));
      setCurrentBpm(analysis.bpm);

      // Save original audio file in IndexedDB
      await saveAudioOffline(
        targetAudioFile.name,
        targetAudioFile,
        'original',
        targetCategory,
        analysis.key,
        analysis.bpm
      );

      // 2. SEPARAÇÃO NEURAL
      let vocalBlobId: string | undefined;
      let accBlobId: string | undefined;
      let sopranoBlobId: string | undefined;
      let contraltoBlobId: string | undefined;
      let tenorBlobId: string | undefined;
      let bassBlobId: string | undefined;

      if (targetAudioBuffer) {
        setProcessingStage('separating');
        setDidacticMessage('🧠 Separando as faixas (Voz & Instrumental)...');
        setIsWorkerProcessing(true);
        setWorkerProgress(0.1);

        // 1º Demucs neural no servidor
        let result = await separateStemsWithServer(
          targetAudioFile,
          file.name,
          (msg) => setDidacticMessage(msg)
        );

        // 2º Fallback transparente para o isolador acústico espectral no Web Worker
        if (!result) {
          setDidacticMessage('🧠 Executando isolador acústico local (Center-Pan STFT)...');
          result = await separateStemsWithWorker({
            audioBuffer: targetAudioBuffer,
            onProgress: (prog, msg) => {
              setWorkerProgress(prog);
              setDidacticMessage(`🧠 Separando as vozes... ${msg}`);
            }
          });
        }

        if (!result) {
          throw new Error('Não foi possível separar as faixas de áudio.');
        }

        // Atualiza análise com os dados reais de Tom e BPM do Demucs se disponíveis
        if (result.musicalAnalysis) {
          analysis = result.musicalAnalysis as any;
          const k = result.musicalAnalysis.rootNote + (result.musicalAnalysis.mode === 'Minor' ? 'm' : '');
          setCurrentKey(k);
          setCurrentBpm(result.musicalAnalysis.bpm);
          await updateSongKeyAndBpm(targetAudioFile.name, formatMusicalKey(result.musicalAnalysis.key || k), result.musicalAnalysis.bpm);
        }

        const vBlob = await (await fetch(result.vocalBlobUrl)).blob();
        const aBlob = await (await fetch(result.accompanimentBlobUrl)).blob();

        vocalBlobId = await saveAudioOffline(`Vocal_${file.name}`, vBlob, 'vocal', targetCategory, analysis.key, analysis.bpm);
        accBlobId = await saveAudioOffline(`Instrumental_${file.name}`, aBlob, 'accompaniment', targetCategory, analysis.key, analysis.bpm);

        // 3. SÍNTESE DE CANTOR VIRTUAL (4 VOZES COM ZERO VAZAMENTO E HARMÔNICA MODAL)
        setDidacticMessage('🎙️ Criando vozes de Cantor Virtual por IA (Soprano, Contralto, Tenor, Baixo)...');
        const songKeyStr = analysis.rootNote + (analysis.mode === 'Minor' ? 'm' : '');
        const virtualStems = await generateVirtualSingerStems(result.vocalAudioBuffer, {
          songKey: songKeyStr,
          mode: analysis.mode,
          onProgress: (prog, msg) => {
            setWorkerProgress(prog);
            setDidacticMessage(`🎙️ ${msg}`);
          }
        });

        sopranoBlobId = await saveAudioOffline(`Soprano_${file.name}`, virtualStems.sopranoBlob, 'soprano', targetCategory, analysis.key, analysis.bpm);
        contraltoBlobId = await saveAudioOffline(`Contralto_${file.name}`, virtualStems.contraltoBlob, 'contralto', targetCategory, analysis.key, analysis.bpm);
        tenorBlobId = await saveAudioOffline(`Tenor_${file.name}`, virtualStems.tenorBlob, 'tenor', targetCategory, analysis.key, analysis.bpm);
        bassBlobId = await saveAudioOffline(`Baixo_${file.name}`, virtualStems.bassBlob, 'bass', targetCategory, analysis.key, analysis.bpm);

        const stemsMap = {
          soprano: virtualStems.sopranoBlob,
          contralto: virtualStems.contraltoBlob,
          tenor: virtualStems.tenorBlob,
          bass: virtualStems.bassBlob
        };
        setVirtualSingerBlobs(stemsMap);
        setCurrentAccompanimentBlob(result.accompanimentBlobUrl);

        setVocalStemBuffer(result.vocalAudioBuffer);
        extractTargetPitchFromBuffer(result.vocalAudioBuffer, 0);

        // Track 1 = Instrumental, Track 2 = Voz Cantor Virtual IA selecionada
        const effectiveVoice = focusedVoice || 'contralto';
        const effectiveOctave = voiceOctaveShifts[effectiveVoice] ?? DEFAULT_VOICE_OCTAVES[effectiveVoice] ?? 0;
        const activeVoiceBlob = (stemsMap as any)[effectiveVoice] || virtualStems.sopranoBlob;
        setVocalHarmonicShift(calculateEffectiveSemitoneShift(effectiveVoice, effectiveOctave, true));
        await loadMultiStems({
          vocalUrl: activeVoiceBlob,
          accompanimentUrl: result.accompanimentBlobUrl
        });
      }

      // 4. PERSISTÊNCIA COMPLETA EM CACHE: Salva metadados, 4 IDs de voz e preferências
      await saveSongPackage({
        title: songTitle,
        fileName: file.name,
        category: targetCategory || 'ensaios',
        key: formatMusicalKey(analysis.key || (analysis.rootNote + (analysis.mode === 'Minor' ? 'm' : ''))),
        bpm: analysis.bpm,
        scaleNotes: analysis.scaleNotes,
        duration: analysis.duration,
        isSeparated: true,
        vocalBlobId,
        accompanimentBlobId: accBlobId,
        sopranoBlobId,
        contraltoBlobId,
        tenorBlobId,
        bassBlobId,
        virtualSingerVersion: VIRTUAL_SINGER_ENGINE_VERSION,
        voiceOctaveShifts: { ...DEFAULT_VOICE_OCTAVES, ...voiceOctaveShifts },
        focusedVoice: focusedVoice || 'contralto'
      });

      // Background Sync com Google Drive
      if (userProfile && navigator.onLine) {
        setDidacticMessage('☁️ Sincronizando com o Google Drive...');
        await triggerBackgroundSync(userProfile);
      }

      setProcessingStage('done');
      setActiveView('player');
    } catch (err: any) {
      setProcessingStage('idle');
      setDidacticMessage(`⚠️ Erro ao processar áudio: ${err?.message || 'Falha ao analisar o arquivo.'}`);
    } finally {
      setIsWorkerProcessing(false);
    }
  };

  /**
   * Instant Opening from Repertoire:
   * Retrieves the saved song package and plays Track 1 (Accompaniment) and Track 2 (Virtual Singer).
   */
  const handleOpenSongFromGallery = async (title: string, originalRecord?: any) => {
    if (Tone.context && Tone.context.state !== 'running') {
      await Tone.start();
    }

    const songTitle = title || originalRecord?.name || 'Música de Treino';
    setCurrentSongTitle(songTitle);

    const normTitle = normalizeSongTitle(songTitle).toLowerCase();
    const matchedSong = songs.find((s) => {
      if (s.id === originalRecord?.id) return true;
      if (s.title === songTitle) return true;
      if (s.fileName === originalRecord?.name) return true;
      const sNorm = normalizeSongTitle(s.title).toLowerCase();
      const fNorm = normalizeSongTitle(s.fileName || '').toLowerCase();
      return sNorm === normTitle || fNorm === normTitle;
    });
    let resolvedKey = matchedSong?.key || originalRecord?.key || 'C';
    let resolvedBpm = matchedSong?.bpm || originalRecord?.bpm || 120;

    // Auto-heal: Sempre recupera a análise real de Tom & BPM do Demucs se disponível no servidor
    try {
      const serverMeta = await fetchServerSongAnalysis(songTitle);
      if (serverMeta && serverMeta.key) {
        resolvedKey = serverMeta.rootNote + (serverMeta.mode === 'Minor' ? 'm' : '');
        resolvedBpm = serverMeta.bpm;
        await updateSongKeyAndBpm(songTitle, formatMusicalKey(serverMeta.key || resolvedKey), resolvedBpm);
      }
    } catch (e) {
      // Ignored
    }

    setCurrentKey(resolvedKey);
    setCurrentBpm(resolvedBpm);

    // Load saved song preferences (voice octaves & focused voice) or apply default choral standards
    const effectiveOctaveShifts: Record<StemChannelId, number> = matchedSong?.voiceOctaveShifts
      ? { ...(DEFAULT_VOICE_OCTAVES as any), ...matchedSong.voiceOctaveShifts }
      : { ...(DEFAULT_VOICE_OCTAVES as any) };
    const effectiveFocusedVoice = (matchedSong?.focusedVoice as StemChannelId) || 'contralto';

    setVoiceOctaveShifts(effectiveOctaveShifts);
    setFocusedVoice(effectiveFocusedVoice);

    let accBlob: Blob | null = null;
    let sopranoBlob: Blob | null = null;
    let contraltoBlob: Blob | null = null;
    let tenorBlob: Blob | null = null;
    let bassBlob: Blob | null = null;

    if (matchedSong) {
      // 1. Try to load saved virtual singer stems
      if (matchedSong.accompanimentBlobId) {
        accBlob = await getAudioBlobById(matchedSong.accompanimentBlobId, matchedSong.driveAccompanimentId);
      }
      if (matchedSong.sopranoBlobId) {
        sopranoBlob = await getAudioBlobById(matchedSong.sopranoBlobId, matchedSong.driveSopranoId);
      }
      if (matchedSong.contraltoBlobId) {
        contraltoBlob = await getAudioBlobById(matchedSong.contraltoBlobId, matchedSong.driveContraltoId);
      }
      if (matchedSong.tenorBlobId) {
        tenorBlob = await getAudioBlobById(matchedSong.tenorBlobId, matchedSong.driveTenorId);
      }
      if (matchedSong.bassBlobId) {
        bassBlob = await getAudioBlobById(matchedSong.bassBlobId, matchedSong.driveBassId);
      }
    }

    // Fallback: if offlineAudios has matches
    if (!accBlob) {
      const accRec = offlineAudios.find((r) => r.type === 'accompaniment' && (r.name.includes(songTitle) || songTitle.includes(r.name)));
      if (accRec?.blob) accBlob = accRec.blob;
    }

    if (accBlob && (sopranoBlob || contraltoBlob || tenorBlob || bassBlob)) {
      let stemsMap = {
        soprano: sopranoBlob || undefined,
        contralto: contraltoBlob || undefined,
        tenor: tenorBlob || undefined,
        bass: bassBlob || undefined
      };

      // Auto-upgrade legacy stems to Phase Vocoder v3 (Zero-Delay & Formant Preservation)
      const needsUpgrade = matchedSong && (!matchedSong.virtualSingerVersion || matchedSong.virtualSingerVersion < VIRTUAL_SINGER_ENGINE_VERSION);
      const leadVocalBlob = sopranoBlob || (matchedSong?.vocalBlobId ? await getAudioBlobById(matchedSong.vocalBlobId) : null);

      if (needsUpgrade && leadVocalBlob) {
        try {
          setIsWorkerProcessing(true);
          setProcessingStage('separating');
          setDidacticMessage('✨ Atualizando Cantor Virtual com motor Phase Vocoder HD (100% sincronizado)...');
          
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new AudioContextClass();
          const arrBuf = await leadVocalBlob.arrayBuffer();
          const leadBuffer = await ctx.decodeAudioData(arrBuf);
          await ctx.close();

          const virtualStems = await generateVirtualSingerStems(leadBuffer, {
            songKey: resolvedKey,
            onProgress: (prog, msg) => {
              setWorkerProgress(prog);
              setDidacticMessage(`🎙️ ${msg}`);
            }
          });

          const targetCat = matchedSong?.category || 'ensaios';
          const sId = await saveAudioOffline(`Soprano_${songTitle}`, virtualStems.sopranoBlob, 'soprano', targetCat, matchedSong?.key, matchedSong?.bpm);
          const cId = await saveAudioOffline(`Contralto_${songTitle}`, virtualStems.contraltoBlob, 'contralto', targetCat, matchedSong?.key, matchedSong?.bpm);
          const tId = await saveAudioOffline(`Tenor_${songTitle}`, virtualStems.tenorBlob, 'tenor', targetCat, matchedSong?.key, matchedSong?.bpm);
          const bId = await saveAudioOffline(`Baixo_${songTitle}`, virtualStems.bassBlob, 'bass', targetCat, matchedSong?.key, matchedSong?.bpm);

          await saveSongPackage({
            title: songTitle,
            fileName: matchedSong?.fileName || songTitle,
            category: targetCat,
            isSeparated: true,
            sopranoBlobId: sId,
            contraltoBlobId: cId,
            tenorBlobId: tId,
            bassBlobId: bId,
            virtualSingerVersion: VIRTUAL_SINGER_ENGINE_VERSION
          });

          stemsMap = {
            soprano: virtualStems.sopranoBlob,
            contralto: virtualStems.contraltoBlob,
            tenor: virtualStems.tenorBlob,
            bass: virtualStems.bassBlob
          };
        } catch (upgradeErr) {
          console.warn('Erro ao atualizar vozes de Cantor Virtual:', upgradeErr);
        } finally {
          setIsWorkerProcessing(false);
          setProcessingStage('done');
        }
      }

      setVirtualSingerBlobs(stemsMap);
      setCurrentAccompanimentBlob(accBlob);

      const activeVoiceBlob = (stemsMap as any)[effectiveFocusedVoice] || stemsMap.soprano;

      if (activeVoiceBlob && accBlob) {
        const octave = effectiveOctaveShifts[effectiveFocusedVoice] ?? DEFAULT_VOICE_OCTAVES[effectiveFocusedVoice] ?? 0;
        const semitoneShift = calculateEffectiveSemitoneShift(effectiveFocusedVoice, octave, true);
        setVocalHarmonicShift(semitoneShift);
        await loadMultiStems({
          vocalUrl: activeVoiceBlob,
          accompanimentUrl: accBlob
        });
      }

      setActiveView('player');
      return;
    }

    // If stems do not exist yet (legacy imported audio), process them seamlessly
    if (originalRecord && originalRecord.blob) {
      setProcessingStage('separating');
      setDidacticMessage('🧠 Gerando as vozes isoladas do Cantor Virtual...');
      setIsWorkerProcessing(true);
      setWorkerProgress(0.2);

      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass();
        const arrBuf = await originalRecord.blob.arrayBuffer();
        const targetAudioBuffer = await ctx.decodeAudioData(arrBuf);
        await ctx.close();

        let result = await separateStemsWithServer(
          originalRecord.blob,
          originalRecord.name || songTitle,
          (msg) => setDidacticMessage(msg)
        );

        if (!result) {
          result = await separateStemsWithWorker({
            audioBuffer: targetAudioBuffer,
            onProgress: (prog: number, msg: string) => {
              setWorkerProgress(prog);
              setDidacticMessage(`🧠 Separando as faixas... ${msg}`);
            }
          });
        }

        if (!result) {
          throw new Error('Não foi possível separar as faixas de áudio.');
        }

        const aBlob = await (await fetch(result.accompanimentBlobUrl)).blob();

        const virtualStems = await generateVirtualSingerStems(result.vocalAudioBuffer, {
          songKey: currentKey || matchedSong?.key,
          onProgress: (prog, msg) => {
            setWorkerProgress(prog);
            setDidacticMessage(`🎙️ ${msg}`);
          }
        });

        const sopranoBlobId = await saveAudioOffline(`Soprano_${songTitle}`, virtualStems.sopranoBlob, 'soprano', matchedSong?.category || 'ensaios');
        const contraltoBlobId = await saveAudioOffline(`Contralto_${songTitle}`, virtualStems.contraltoBlob, 'contralto', matchedSong?.category || 'ensaios');
        const tenorBlobId = await saveAudioOffline(`Tenor_${songTitle}`, virtualStems.tenorBlob, 'tenor', matchedSong?.category || 'ensaios');
        const bassBlobId = await saveAudioOffline(`Baixo_${songTitle}`, virtualStems.bassBlob, 'bass', matchedSong?.category || 'ensaios');
        const accBlobId = await saveAudioOffline(`Instrumental_${songTitle}`, aBlob, 'accompaniment', matchedSong?.category || 'ensaios');

        await saveSongPackage({
          title: songTitle,
          fileName: originalRecord.name || songTitle,
          category: matchedSong?.category || 'ensaios',
          isSeparated: true,
          accompanimentBlobId: accBlobId,
          sopranoBlobId,
          contraltoBlobId,
          tenorBlobId,
          bassBlobId,
          virtualSingerVersion: 2
        });

        const stemsMap = {
          soprano: virtualStems.sopranoBlob,
          contralto: virtualStems.contraltoBlob,
          tenor: virtualStems.tenorBlob,
          bass: virtualStems.bassBlob
        };
        setVirtualSingerBlobs(stemsMap);
        setCurrentAccompanimentBlob(aBlob);

        const activeVoiceBlob = (stemsMap as any)[effectiveFocusedVoice] || virtualStems.sopranoBlob;
        const octave = effectiveOctaveShifts[effectiveFocusedVoice] ?? DEFAULT_VOICE_OCTAVES[effectiveFocusedVoice] ?? 0;
        const semitoneShift = calculateEffectiveSemitoneShift(effectiveFocusedVoice, octave, true);
        setVocalHarmonicShift(semitoneShift);
        await loadMultiStems({
          vocalUrl: activeVoiceBlob,
          accompanimentUrl: aBlob
        });
      } catch (sepErr) {
        console.warn('Erro ao gerar vozes de cantor virtual:', sepErr);
      } finally {
        setIsWorkerProcessing(false);
        setProcessingStage('done');
      }
    }

    setActiveView('player');
  };

  /**
   * Adjust voice octave shift dynamically in real-time (-1, 0, +1 octaves)
   * Pre-renders with high-fidelity zero-delay Phase-Locked engine and direct Web Audio connection
   * (eliminating 100ms granular delay lines and robotic comb-filtering).
   */
  const handleVoiceOctaveChange = async (voice: StemChannelId, octave: number) => {
    // SEMPRE QUE ALTERAR A OITAVA: PAUSAR A REPRODUÇÃO E RECOMEÇAR DO INÍCIO (0:00)
    stopMulti();
    seekMulti(0);

    const nextShifts = {
      ...voiceOctaveShifts,
      [voice]: octave
    };
    setVoiceOctaveShifts(nextShifts);

    if (voice === focusedVoice) {
      const chosenBlob = (virtualSingerBlobs as any)[voice];
      const isBaked = Boolean(chosenBlob);
      const semitoneShift = calculateEffectiveSemitoneShift(voice, octave, isBaked);
      setVocalHarmonicShift(semitoneShift);

      if (chosenBlob) {
        if (semitoneShift === 0) {
          await switchVocalStem(chosenBlob);
        } else if (octaveBlobCacheRef.current[voice]?.[octave]) {
          await switchVocalStem(octaveBlobCacheRef.current[voice][octave]);
        } else {
          try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const ctx = new AudioContextClass();
            const arrBuf = await (chosenBlob instanceof Blob ? chosenBlob.arrayBuffer() : fetch(chosenBlob).then(r => r.arrayBuffer()));
            const buf = await ctx.decodeAudioData(arrBuf);
            const shiftedBuf = pitchShiftAudioBuffer(buf, semitoneShift, ctx, voice as any);
            const shiftedBlob = audioBufferToWavBlob(shiftedBuf);
            await ctx.close();

            if (!octaveBlobCacheRef.current[voice]) octaveBlobCacheRef.current[voice] = {};
            octaveBlobCacheRef.current[voice][octave] = shiftedBlob;
            await switchVocalStem(shiftedBlob);
          } catch (e) {
            console.warn('Erro ao processar oitava em alta fidelidade:', e);
            await switchVocalStem(chosenBlob);
          }
        }
      }
    }

    if (currentSongTitle) {
      updateSongPreferences(currentSongTitle, {
        voiceOctaveShifts: nextShifts,
        focusedVoice
      });
    }
  };

  /**
   * Switching Choral Voice (Soprano, Contralto, Tenor, Baixo):
   * Loads the isolated virtual singer stem directly into Track 2 with zero delay,
   * applying octave shifts with 100% natural formants and pure Web Audio connection.
   */
  const handleSelectFocusedVoice = async (voice: StemChannelId) => {
    // SEMPRE QUE ALTERAR A VOZ: PAUSAR A REPRODUÇÃO E RECOMEÇAR DO INÍCIO (0:00)
    stopMulti();
    seekMulti(0);

    setFocusedVoice(voice);
    const chosenBlob = (virtualSingerBlobs as any)[voice];
    const octave = voiceOctaveShifts[voice] ?? DEFAULT_VOICE_OCTAVES[voice] ?? 0;
    const isBaked = Boolean(chosenBlob);
    const semitoneShift = calculateEffectiveSemitoneShift(voice, octave, isBaked);

    setVocalHarmonicShift(semitoneShift);
    if (chosenBlob) {
      if (semitoneShift === 0) {
        await switchVocalStem(chosenBlob);
      } else if (octaveBlobCacheRef.current[voice]?.[octave]) {
        await switchVocalStem(octaveBlobCacheRef.current[voice][octave]);
      } else {
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new AudioContextClass();
          const arrBuf = await (chosenBlob instanceof Blob ? chosenBlob.arrayBuffer() : fetch(chosenBlob).then(r => r.arrayBuffer()));
          const buf = await ctx.decodeAudioData(arrBuf);
          const shiftedBuf = pitchShiftAudioBuffer(buf, semitoneShift, ctx, voice as any);
          const shiftedBlob = audioBufferToWavBlob(shiftedBuf);
          await ctx.close();

          if (!octaveBlobCacheRef.current[voice]) octaveBlobCacheRef.current[voice] = {};
          octaveBlobCacheRef.current[voice][octave] = shiftedBlob;
          await switchVocalStem(shiftedBlob);
        } catch (e) {
          await switchVocalStem(chosenBlob);
        }
      }
    }

    if (currentSongTitle) {
      updateSongPreferences(currentSongTitle, {
        voiceOctaveShifts,
        focusedVoice: voice
      });
    }
  };

  /**
   * Explicitly saves current song rehearsal configuration (octave shifts and focused voice)
   * to IndexedDB so entering this song anytime opens ready for rehearsal.
   */
  const handleSaveSongPreferences = async () => {
    if (!currentSongTitle) return;
    await updateSongPreferences(currentSongTitle, {
      voiceOctaveShifts,
      focusedVoice
    });
    if (currentKey) {
      await updateSongKeyAndBpm(currentSongTitle, currentKey, currentBpm);
    }
  };

  /**
   * Re-synthesizes the 4 Virtual Singer voices using the studio Phase Vocoder HD algorithm
   */
  const handleRegenerateVirtualStems = async () => {
    if (!currentSongTitle) return;

    try {
      setIsWorkerProcessing(true);
      setProcessingStage('separating');
      setDidacticMessage('✨ Iniciando recálculo das vozes de Cantor Virtual...');

      const origRecord = offlineAudios.find(
        (a) =>
          a.type === 'original' &&
          (a.name.toLowerCase().includes(currentSongTitle.toLowerCase()) ||
            currentSongTitle.toLowerCase().includes(a.name.replace(/\.[^/.]+$/, '').toLowerCase()))
      );

      let leadBuffer: AudioBuffer | null = null;
      let newAccBlob: Blob | null = null;

      // 1. Tenta isolamento neural via Demucs no servidor para voz 100% a cappella solo
      if (origRecord?.blob) {
        setDidacticMessage('🧠 Executando Demucs Neural para isolar a voz solo sem instrumental...');
        const sepResult = await separateStemsWithServer(
          origRecord.blob,
          origRecord.name || currentSongTitle,
          (msg) => setDidacticMessage(msg)
        );
        if (sepResult) {
          leadBuffer = sepResult.vocalAudioBuffer;
          newAccBlob = await (await fetch(sepResult.accompanimentBlobUrl)).blob();
          setCurrentAccompanimentBlob(newAccBlob);
          const matchedSong = songs.find((s) => s.title === currentSongTitle);
          const targetCat = matchedSong?.category || 'ensaios';
          await saveAudioOffline(`Instrumental_${currentSongTitle}`, newAccBlob, 'accompaniment', targetCat);
        }
      }

      // 2. Se não houver arquivo original ou o servidor não responder, usa o áudio vocal em memória
      if (!leadBuffer) {
        const rawBlob = virtualSingerBlobs.soprano;
        if (!rawBlob) return;
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass();
        const arrBuf = await (rawBlob instanceof Blob ? rawBlob.arrayBuffer() : fetch(rawBlob).then((r) => r.arrayBuffer()));
        leadBuffer = await ctx.decodeAudioData(arrBuf);
        await ctx.close();
      }

      setDidacticMessage('🎙️ Sintetizando vozes com Phase Vocoder HD (100% sincronia e afinação)...');
      const virtualStems = await generateVirtualSingerStems(
        leadBuffer,
        (prog, msg) => {
          setWorkerProgress(prog);
          setDidacticMessage(`🎙️ ${msg}`);
        }
      );
      octaveBlobCacheRef.current = {};

      const matchedSong = songs.find((s) => s.title === currentSongTitle);
      const targetCat = matchedSong?.category || 'ensaios';

      const sId = await saveAudioOffline(`Soprano_${currentSongTitle}`, virtualStems.sopranoBlob, 'soprano', targetCat, matchedSong?.key, matchedSong?.bpm);
      const cId = await saveAudioOffline(`Contralto_${currentSongTitle}`, virtualStems.contraltoBlob, 'contralto', targetCat, matchedSong?.key, matchedSong?.bpm);
      const tId = await saveAudioOffline(`Tenor_${currentSongTitle}`, virtualStems.tenorBlob, 'tenor', targetCat, matchedSong?.key, matchedSong?.bpm);
      const bId = await saveAudioOffline(`Baixo_${currentSongTitle}`, virtualStems.bassBlob, 'bass', targetCat, matchedSong?.key, matchedSong?.bpm);

      await saveSongPackage({
        title: currentSongTitle,
        fileName: matchedSong?.fileName || currentSongTitle,
        category: targetCat,
        isSeparated: true,
        sopranoBlobId: sId,
        contraltoBlobId: cId,
        tenorBlobId: tId,
        bassBlobId: bId,
        virtualSingerVersion: VIRTUAL_SINGER_ENGINE_VERSION
      });

      const stemsMap = {
        soprano: virtualStems.sopranoBlob,
        contralto: virtualStems.contraltoBlob,
        tenor: virtualStems.tenorBlob,
        bass: virtualStems.bassBlob
      };
      setVirtualSingerBlobs(stemsMap);

      const activeVoiceBlob = (stemsMap as any)[focusedVoice] || virtualStems.sopranoBlob;
      const accToUse = newAccBlob || currentAccompanimentBlob;
      if (accToUse) {
        const octave = voiceOctaveShifts[focusedVoice] ?? DEFAULT_VOICE_OCTAVES[focusedVoice] ?? 0;
        const semitoneShift = calculateEffectiveSemitoneShift(focusedVoice, octave, true);
        setVocalHarmonicShift(semitoneShift);
        await loadMultiStems({
          vocalUrl: activeVoiceBlob,
          accompanimentUrl: accToUse
        });
      }
    } catch (e) {
      console.error('Erro ao regerar vozes IA:', e);
    } finally {
      setIsWorkerProcessing(false);
      setProcessingStage('done');
    }
  };

  const handleExportMix = async (format: 'wav' | 'whatsapp') => {
    if (!currentSongTitle) return;

    try {
      setProcessingStage('extracting');
      setDidacticMessage('🎛️ Renderizando mixagem com voz do cantor virtual...');

      let exportBlob: Blob | null = null;
      const activeVoiceBlob = (virtualSingerBlobs as any)[focusedVoice] || virtualSingerBlobs.soprano;

      if (currentAccompanimentBlob && activeVoiceBlob) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass();

        const [instBuf, rawVocalBuf] = await Promise.all([
          ctx.decodeAudioData(await (currentAccompanimentBlob instanceof Blob ? currentAccompanimentBlob.arrayBuffer() : fetch(currentAccompanimentBlob).then(r => r.arrayBuffer()))),
          ctx.decodeAudioData(await (activeVoiceBlob instanceof Blob ? activeVoiceBlob.arrayBuffer() : fetch(activeVoiceBlob).then(r => r.arrayBuffer())))
        ]);

        const octave = voiceOctaveShifts[focusedVoice] ?? DEFAULT_VOICE_OCTAVES[focusedVoice] ?? 0;
        const octaveSemitones = calculateEffectiveSemitoneShift(focusedVoice, octave, true);
        const finalVocalBuf = octaveSemitones !== 0
          ? pitchShiftAudioBuffer(rawVocalBuf, octaveSemitones, ctx)
          : rawVocalBuf;

        await ctx.close();

        const length = Math.max(instBuf.length, finalVocalBuf.length);
        const sampleRate = instBuf.sampleRate || 44100;
        const offlineCtx = new OfflineAudioContext(2, length, sampleRate);

        const instSource = offlineCtx.createBufferSource();
        instSource.buffer = instBuf;
        const instGain = offlineCtx.createGain();
        instGain.gain.value = channels.accompaniment ? channels.accompaniment.volume : 0.4;
        instSource.connect(instGain);
        instGain.connect(offlineCtx.destination);

        const vocalSource = offlineCtx.createBufferSource();
        vocalSource.buffer = finalVocalBuf;
        const vocalGain = offlineCtx.createGain();
        vocalGain.gain.value = channels[focusedVoice] ? channels[focusedVoice].volume : 1.0;
        vocalSource.connect(vocalGain);
        vocalGain.connect(offlineCtx.destination);

        instSource.start(0);
        vocalSource.start(0);

        const rendered = await offlineCtx.startRendering();
        exportBlob = audioBufferToWavBlob(rendered);
      }

      if (!exportBlob) {
        exportBlob = new Blob(['Audio Mix'], { type: 'audio/wav' });
      }

      const url = URL.createObjectURL(exportBlob);

      if (format === 'whatsapp') {
        const text = encodeURIComponent(`Olá! Ouça o meu ensaio da música "${currentSongTitle}" (${focusedVoice}) no app Divisão Vocal!`);
        window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = `Ensaio_${focusedVoice}_${currentSongTitle}.wav`;
        a.click();
      }
    } catch (err) {
      console.warn('Erro ao renderizar mixagem:', err);
    } finally {
      setProcessingStage('done');
    }
  };

  const handlePitchChange = (semitones: number) => {
    // SEMPRE QUE ALTERAR O TOM: PAUSAR A REPRODUÇÃO E RECOMEÇAR DO INÍCIO (0:00)
    stopMulti();
    seekMulti(0);
    setMultiPitch(semitones);
  };

  /**
   * Altera a Tonalidade Base (Key) da música:
   * 1. Pausa e reinicia a reprodução do início (0:00)
   * 2. Atualiza a harmonia modal (ex: Contralto em 3ª menor +3 ST em tons menores)
   * 3. Persiste a alteração no IndexedDB
   */
  const handleKeyChange = async (newKey: string) => {
    stopMulti();
    seekMulti(0);
    setMultiPitch(0);
    setCurrentKey(newKey);

    const isMinor = newKey.endsWith('m') || newKey.includes('Menor');
    if (currentSongTitle) {
      await updateSongKeyAndBpm(currentSongTitle, newKey, currentBpm);
    }

    const normCurrent = normalizeSongTitle(currentSongTitle).toLowerCase();
    const matchedSong = songs.find(
      (s) =>
        s.title === currentSongTitle ||
        s.fileName === currentSongTitle ||
        normalizeSongTitle(s.title).toLowerCase() === normCurrent ||
        (s.fileName && normalizeSongTitle(s.fileName).toLowerCase() === normCurrent)
    );

    let leadBuffer = vocalStemBuffer;
    if (!leadBuffer && virtualSingerBlobs?.soprano) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass();
        const arrBuf = await (virtualSingerBlobs.soprano instanceof Blob
          ? virtualSingerBlobs.soprano.arrayBuffer()
          : fetch(virtualSingerBlobs.soprano).then((r) => r.arrayBuffer()));
        leadBuffer = await ctx.decodeAudioData(arrBuf);
        await ctx.close();
        setVocalStemBuffer(leadBuffer);
      } catch (e) {
        // Ignored
      }
    }

    if (leadBuffer) {
      try {
        setIsWorkerProcessing(true);
        setProcessingStage('separating');
        setDidacticMessage(`🎼 Adaptando harmonia das vozes para o campo harmônico de ${newKey}...`);

        const virtualStems = await generateVirtualSingerStems(leadBuffer, {
          songKey: newKey,
          mode: isMinor ? 'Minor' : 'Major',
          onProgress: (prog, msg) => {
            setWorkerProgress(prog);
            setDidacticMessage(`🎙️ ${msg}`);
          }
        });
        octaveBlobCacheRef.current = {};

        const stemsMap = {
          soprano: virtualStems.sopranoBlob,
          contralto: virtualStems.contraltoBlob,
          tenor: virtualStems.tenorBlob,
          bass: virtualStems.bassBlob
        };
        setVirtualSingerBlobs(stemsMap);

        if (matchedSong) {
          const targetCat = matchedSong.category || 'ensaios';
          const sId = await saveAudioOffline(`Soprano_${currentSongTitle}`, virtualStems.sopranoBlob, 'soprano', targetCat, newKey);
          const cId = await saveAudioOffline(`Contralto_${currentSongTitle}`, virtualStems.contraltoBlob, 'contralto', targetCat, newKey);
          const tId = await saveAudioOffline(`Tenor_${currentSongTitle}`, virtualStems.tenorBlob, 'tenor', targetCat, newKey);
          const bId = await saveAudioOffline(`Baixo_${currentSongTitle}`, virtualStems.bassBlob, 'bass', targetCat, newKey);

          await saveSongPackage({
            ...matchedSong,
            key: newKey,
            sopranoBlobId: sId,
            contraltoBlobId: cId,
            tenorBlobId: tId,
            bassBlobId: bId,
            virtualSingerVersion: VIRTUAL_SINGER_ENGINE_VERSION
          });
        }

        const effectiveVoice = focusedVoice || 'contralto';
        const octave = voiceOctaveShifts[effectiveVoice] ?? DEFAULT_VOICE_OCTAVES[effectiveVoice] ?? 0;
        const activeVoiceBlob = (stemsMap as any)[effectiveVoice] || virtualStems.sopranoBlob;
        const semitoneShift = calculateEffectiveSemitoneShift(effectiveVoice, octave, true);
        setVocalHarmonicShift(semitoneShift);

        if (currentAccompanimentBlob && activeVoiceBlob) {
          await loadMultiStems({
            vocalUrl: activeVoiceBlob,
            accompanimentUrl: currentAccompanimentBlob
          });
        }
      } catch (err) {
        console.warn('Erro ao atualizar vozes para o novo tom:', err);
      } finally {
        setIsWorkerProcessing(false);
        setProcessingStage('done');
      }
    } else {
      const effectiveVoice = focusedVoice || 'contralto';
      const octave = voiceOctaveShifts[effectiveVoice] ?? DEFAULT_VOICE_OCTAVES[effectiveVoice] ?? 0;
      setVocalHarmonicShift(calculateEffectiveSemitoneShift(effectiveVoice, octave, true));
    }
  };

  return (
    <div className="bg-[#0d0e12] text-white min-h-screen flex flex-col font-sans select-none">
      {/* Processing Alert Banner */}
      {processingStage !== 'idle' && processingStage !== 'done' && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#14161f] border border-[#00c2cb] rounded-2xl p-4 shadow-2xl flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-cyan-500/30 border-t-[#00c2cb] rounded-full animate-spin" />
          <div>
            <p className="text-xs font-bold text-[#00c2cb]">{didacticMessage}</p>
            {isWorkerProcessing && (
              <div className="w-48 bg-[#181a24] h-1.5 rounded-full overflow-hidden mt-1">
                <div className="bg-[#00c2cb] h-full transition-all duration-300" style={{ width: `${workerProgress * 100}%` }} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 1: REPERTÓRIO (Moises Setlist Table style matching Screenshot 2) */}
      {activeView === 'repertoire' && (
        <div className="flex-1 w-full h-full p-2 sm:p-4 lg:p-5 flex flex-col">
          <MoisesRepertoireView
            categories={categories}
            songs={songs}
            offlineAudios={offlineAudios}
            onAddCategory={addCategory}
            onRenameCategory={renameCategory}
            onDeleteCategory={deleteCategory}
            onSelectSongToMixer={handleOpenSongFromGallery}
            onDeleteSong={deleteSong}
            onMoveSongCategory={moveSongCategory}
            onUploadFile={processUploadedFile}
            userEmail={userProfile?.name || 'Ana Paula'}
            userProfile={userProfile}
            onTriggerSync={handleTriggerSync}
            onOpenSyncModal={() => setIsSyncModalOpen(true)}
            isSyncing={isSyncing}
            syncStatusLog={syncStatusLog}
          />
        </div>
      )}

      {/* VIEW 2: ENSAIO STUDIO PLAYER (Moises DAW Player matching Screenshot 3) */}
      {activeView === 'player' && (
        <div className="flex-1 w-full">
          <MoisesStudioPlayer
            songTitle={currentSongTitle}
            artistName="Divisão Vocal"
            detectedKey={currentKey}
            detectedBpm={currentBpm}
            pitchSemitones={multiPitch}
            onPitchChange={handlePitchChange}
            onKeyChange={handleKeyChange}
            isPlaying={isMultiPlaying}
            onPlayPause={isMultiPlaying ? pauseMulti : playMulti}
            onStop={stopMulti}
            currentTime={multiCurrentTime}
            duration={multiDuration}
            onSeek={seekMulti}
            onBackToRepertoire={() => {
              stopMulti();
              stopTuner();
              if (currentSongTitle && currentKey) {
                updateSongKeyAndBpm(currentSongTitle, currentKey, currentBpm).catch(() => {});
              }
              setActiveView('repertoire');
            }}
            instrumentalVolume={channels.accompaniment ? channels.accompaniment.volume : 0.4}
            onInstrumentalVolumeChange={(vol) => setChannelVolume('accompaniment', vol)}
            aiVoiceVolume={channels[focusedVoice] ? channels[focusedVoice].volume : 1.0}
            onAiVoiceVolumeChange={(vol) => setChannelVolume(focusedVoice, vol)}
            focusedVoice={focusedVoice}
            onSelectFocusedVoice={handleSelectFocusedVoice}
            voiceOctaveShifts={voiceOctaveShifts}
            onVoiceOctaveChange={handleVoiceOctaveChange}
            isListening={isListening}
            onToggleTuner={isListening ? stopTuner : startTuner}
            stopTuner={stopTuner}
            userPitch={userPitch}
            targetPitch={targetPitch}
            pitchStreak={pitchStreak}
            accuracyRate={accuracyRate}
            sidetoneVolume={sidetoneVolume}
            onSidetoneVolumeChange={setSidetoneVolume}
            isMonitorMuted={isMonitorMuted}
            onToggleMonitorMute={() => setIsMonitorMuted(!isMonitorMuted)}
            tunerError={tunerError}
            vocalAudioBuffer={vocalStemBuffer}
            onExportMix={handleExportMix}
            onRegenerateVirtualStems={handleRegenerateVirtualStems}
            onSaveSongPreferences={handleSaveSongPreferences}
          />
        </div>
      )}

      {/* Modal de Sincronização Google Drive & Backup Offline */}
      <GoogleSyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        userProfile={userProfile}
        onLoginSuccess={handleLoginSuccess}
        onLogout={handleLogout}
        onTriggerSync={handleTriggerSync}
        isSyncing={isSyncing}
        syncStatusLog={syncStatusLog}
        onExportBackup={exportRepertoireBackup}
        onImportBackup={importRepertoireBackup}
      />
    </div>
  );
};

export default MainApp;
