import React, { useState, useEffect, ChangeEvent, DragEvent, useRef } from 'react';
import { usePitchShift } from './hooks/usePitchShift';
import { useMultiStemMixer, VoiceFocusTarget } from './hooks/useMultiStemMixer';
import { useVocalTuner } from './hooks/useVocalTuner';
import { useIndexedDBSync } from './hooks/useIndexedDBSync';
import { VocalTunerCanvas } from './components/VocalTunerCanvas';
import { GoogleLoginButton, UserProfile } from './components/GoogleLoginButton';
import { GoogleDriveService, GoogleDriveFileItem } from './services/googleDriveService';
import { extractAudioFromVideo } from './utils/ffmpegAudioExtractor';
import { separateStemsWithWorker } from './utils/stemSeparationClient';

export const App: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [swRegistered, setSwRegistered] = useState<boolean>(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  // User Profile state from Google OAuth
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('voicesplit_user_profile');
    return saved ? JSON.parse(saved) : null;
  });

  // IndexedDB Single Source of Truth & Background Sync Hook
  const {
    practiceHistory,
    savePracticeSession,
    saveAudioOffline,
    offlineAudios,
    isSyncing: isDbSyncing,
    syncStatusLog: dbSyncLog,
    triggerBackgroundSync
  } = useIndexedDBSync(userProfile);

  const [savedDriveFiles, setSavedDriveFiles] = useState<GoogleDriveFileItem[]>([]);
  const [isSyncingDrive, setIsSyncingDrive] = useState<boolean>(false);
  const [driveSyncLog, setDriveSyncLog] = useState<string | null>(null);

  // Drag and Drop state
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Positive Validation Continuous Pitch Streak Counter
  const [pitchStreak, setPitchStreak] = useState<number>(0);

  // Processing animations and didactic loading states
  const [processingStage, setProcessingStage] = useState<'idle' | 'extracting' | 'separating' | 'done'>('idle');
  const [didacticMessage, setDidacticMessage] = useState<string>('');

  // Web Worker DSP & ONNX state
  const [isWorkerProcessing, setIsWorkerProcessing] = useState<boolean>(false);
  const [workerProgress, setWorkerProgress] = useState<number>(0);
  const [vocalStemBuffer, setVocalStemBuffer] = useState<AudioBuffer | null>(null);

  // Multi-Stem Tone.js Mixer Hook with Voice Focus Controls
  const {
    loadStems: loadMultiStems,
    play: playMulti,
    pause: pauseMulti,
    stop: stopMulti,
    setPitchSemitones: setMultiPitch,
    setFocusVoice,
    pitchSemitones: multiPitch,
    focusedVoice,
    isPlaying: isMultiPlaying,
    isLoading: isMultiLoading,
    duration: multiDuration,
    currentTime: multiCurrentTime,
    seek: seekMulti,
    error: multiError
  } = useMultiStemMixer();

  // Single Pitch Shift Hook
  const {
    loadAudio,
    play: playPitch,
    pause: pausePitch,
    stop: stopPitch,
    setPitchSemitones,
    pitchSemitones,
    isPlaying: isPitchPlaying,
    isLoading: isPitchLoading,
    duration: pitchDuration,
    currentTime: pitchCurrentTime,
    seek: seekPitch,
    fileName
  } = usePitchShift(0);

  // Vocal Tuner & Microphone Hook with ONNX target pitch extraction
  const {
    startTuner,
    stopTuner,
    isListening,
    userPitch,
    targetPitch,
    extractTargetPitchFromBuffer,
    error: tunerError
  } = useVocalTuner();

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) setSwRegistered(true);
      });
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  // Sync Google Drive files and trigger IndexedDB background sync
  const fetchDriveSavedFiles = async (profile: UserProfile) => {
    try {
      setIsSyncingDrive(true);
      setDriveSyncLog('Buscando pasta "Meu Treino Vocal" no Google Drive...');
      const driveService = new GoogleDriveService(profile.accessToken);

      const folderId = await driveService.getOrCreateTrainingFolder();

      const files = await driveService.listTrainingFiles(folderId);
      setSavedDriveFiles(files);

      // Trigger IndexedDB <-> Drive background sync
      await triggerBackgroundSync(profile);
    } catch (err: any) {
      setDriveSyncLog(`⚠️ Google Drive: ${err?.message || 'Falha ao sincronizar arquivos.'}`);
    } finally {
      setIsSyncingDrive(false);
    }
  };

  useEffect(() => {
    if (userProfile) {
      fetchDriveSavedFiles(userProfile);
    } else {
      setSavedDriveFiles([]);
      setDriveSyncLog(null);
    }
  }, [userProfile]);

  // Monitor continuous pitch streaks and record practice session in IndexedDB
  useEffect(() => {
    if (userPitch) {
      let isAccurate = false;
      if (targetPitch && targetPitch.frequency > 0) {
        const centsDiff = Math.abs(1200 * (Math.log(userPitch.frequency / targetPitch.frequency) / Math.log(2)));
        if (centsDiff <= 15) isAccurate = true;
      } else if (Math.abs(userPitch.cents) <= 15) {
        isAccurate = true;
      }

      if (isAccurate) {
        setPitchStreak((prev) => prev + 1);
      } else {
        setPitchStreak(0);
      }
    }
  }, [userPitch, targetPitch]);

  // Record practice seconds into IndexedDB (Single Source of Truth)
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

  // Synchronize target pitch extraction from ONNX vocal stem during audio playback
  useEffect(() => {
    if (isMultiPlaying && vocalStemBuffer) {
      extractTargetPitchFromBuffer(vocalStemBuffer, multiCurrentTime);
    }
  }, [isMultiPlaying, multiCurrentTime, vocalStemBuffer, extractTargetPitchFromBuffer]);

  // Unified File Processor with IndexedDB offline storage & Drive sync
  const processUploadedFile = async (file: File) => {
    try {
      const isVideo = file.type.startsWith('video/') || file.name.match(/\.(mp4|mov|mkv|avi)$/i);

      let targetAudioFile = file;
      let targetAudioBuffer: AudioBuffer | null = null;

      if (isVideo) {
        setProcessingStage('extracting');
        setDidacticMessage('🎬 Extraindo áudio do vídeo com FFmpeg WebAssembly...');

        const { audioFile, audioBuffer } = await extractAudioFromVideo(file, (prog) => {
          setDidacticMessage(`🎬 Extraindo áudio do vídeo... (${Math.round(prog.ratio * 100)}%)`);
        });

        targetAudioFile = audioFile;
        targetAudioBuffer = audioBuffer;
      } else {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass();
        const arrBuffer = await file.arrayBuffer();
        targetAudioBuffer = await ctx.decodeAudioData(arrBuffer);
        await ctx.close();
      }

      await loadAudio(targetAudioFile);

      // Save original audio file to IndexedDB for offline access
      await saveAudioOffline(targetAudioFile.name, targetAudioFile, 'original');

      if (targetAudioBuffer) {
        setProcessingStage('separating');
        setDidacticMessage('🧠 Separando as vozes e o instrumental via Web Worker e ONNX...');
        setIsWorkerProcessing(true);
        setWorkerProgress(0.1);

        const result = await separateStemsWithWorker({
          audioBuffer: targetAudioBuffer,
          onProgress: (prog, msg) => {
            setWorkerProgress(prog);
            setDidacticMessage(`🧠 Separando as vozes... ${msg}`);
          }
        });

        const vBlob = await (await fetch(result.vocalBlobUrl)).blob();
        const aBlob = await (await fetch(result.accompanimentBlobUrl)).blob();

        await saveAudioOffline(`Vocal_${file.name}`, vBlob, 'vocal');
        await saveAudioOffline(`Instrumental_${file.name}`, aBlob, 'accompaniment');

        setVocalStemBuffer(result.vocalAudioBuffer);
        extractTargetPitchFromBuffer(result.vocalAudioBuffer, 0);

        await loadMultiStems({
          vocalUrl: result.vocalBlobUrl,
          accompanimentUrl: result.accompanimentBlobUrl
        });
      }

      // Trigger background sync if online
      if (userProfile && navigator.onLine) {
        setDidacticMessage('☁️ Sincronizando novos arquivos do IndexedDB para o Google Drive...');
        await triggerBackgroundSync(userProfile);
      }

      setProcessingStage('done');
      setDidacticMessage('🎉 Separação de voz e áudio concluída com sucesso!');
    } catch (err: any) {
      setProcessingStage('idle');
      setDidacticMessage(`⚠️ Erro ao processar o arquivo: ${err?.message || 'Falha ao ler o arquivo.'}`);
    } finally {
      setIsWorkerProcessing(false);
    }
  };

  const handleLoadDriveFile = async (driveFile: GoogleDriveFileItem) => {
    if (!userProfile) return;

    try {
      setProcessingStage('extracting');
      setDidacticMessage(`☁️ Baixando "${driveFile.name}" do Google Drive...`);

      const driveService = new GoogleDriveService(userProfile.accessToken);
      const fileBlob = await driveService.downloadFileAsBlob(driveFile.id);
      const audioFile = new File([fileBlob], driveFile.name, { type: fileBlob.type || 'audio/wav' });

      await processUploadedFile(audioFile);
    } catch (err: any) {
      setDidacticMessage(`⚠️ Erro ao carregar arquivo do Drive: ${err?.message}`);
      setProcessingStage('idle');
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processUploadedFile(files[0]);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
  };

  const handleInstallClick = () => {
    if (installPrompt) {
      installPrompt.prompt();
      installPrompt.userChoice.then((choiceResult: { outcome: string }) => {
        if (choiceResult.outcome === 'accepted') {
          setInstallPrompt(null);
        }
      });
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const formatPracticeMinutes = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins} min ${secs > 0 ? secs + 's' : ''}`;
  };

  const practiceRatio = Math.min(practiceHistory.totalPracticeSeconds / practiceHistory.dailyGoalSeconds, 1);

  const focusVoicesList: { role: VoiceFocusTarget; label: string; subtext: string }[] = [
    { role: 'soprano', label: '🎧 Ouvir Soprano', subtext: 'Voz Aguda Isolada' },
    { role: 'contralto', label: '🎧 Ouvir Contralto', subtext: 'Voz Média Isolada' },
    { role: 'tenor', label: '🎧 Ouvir Tenor', subtext: 'Voz Masculina Aguda' },
    { role: 'bass', label: '🎧 Ouvir Baixo', subtext: 'Voz Grave Isolada' },
    { role: 'tutti', label: '🎼 Ouvir Todos (Tutti)', subtext: 'Vozes + Acompanhamento' }
  ];

  return (
    <main className="glass-card">
      {/* Top Navbar Header with Google Auth */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.5rem' }}>🎙️</span>
          <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-main)' }}>VoiceSplitting PWA</span>
        </div>
        <GoogleLoginButton
          onLoginSuccess={(user) => setUserProfile(user)}
          onLogout={() => setUserProfile(null)}
        />
      </div>

      <header className="header">
        <h1 className="title-gradient">VoiceSplitting PWA</h1>
        <p className="subtitle">Treinamento Vocal Inteligente & Plataforma de Separação de Voz por IA</p>
      </header>

      {/* Featured Drag & Drop Zone */}
      <section
        className={`dropzone-container ${isDragging ? 'active' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,video/*"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {processingStage === 'idle' || processingStage === 'done' ? (
          <div>
            <div className="dropzone-icon">📥</div>
            <h2 className="dropzone-title">Jogue sua música ou gravação de tela aqui</h2>
            <p className="dropzone-subtitle">Suporta arquivos de áudio (MP3, WAV, OGG) e vídeos/gravações de tela (MP4, MOV, MKV)</p>
            <button className="btn-primary" type="button">
              📁 Ou selecione do seu dispositivo
            </button>
          </div>
        ) : (
          <div className="processing-overlay">
            <div className="pulse-loader-ring" />
            <p className="didactic-message">{didacticMessage}</p>
            {isWorkerProcessing && (
              <div style={{ width: '80%', maxWidth: '400px', marginTop: '0.5rem' }}>
                <div className="progress-track-bg">
                  <div className="progress-fill" style={{ width: `${workerProgress * 100}%` }} />
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Offline IndexedDB Audio Cache Section */}
      {offlineAudios.length > 0 && (
        <section style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '20px', marginBottom: '2rem', border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
          <h2 style={{ fontSize: '1.2rem', color: 'var(--accent-teal)', fontWeight: 700, marginBottom: '0.75rem' }}>
            💾 Áudios Salvos Offline no Dispositivo (IndexedDB)
          </h2>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {offlineAudios.slice(0, 4).map((item) => (
              <div key={item.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.5rem 0.85rem', borderRadius: '12px', fontSize: '0.8rem' }}>
                <span>🎵 {item.name}</span>
                <span style={{ marginLeft: '0.4rem', color: item.syncedToDrive ? '#10b981' : '#f59e0b' }}>
                  {item.syncedToDrive ? '☁️ Sincronizado' : '⏳ Pendente Drive'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Saved Google Drive Training Files Library Section */}
      {userProfile && (
        <section style={{ background: '#ffffff', padding: '1.75rem', borderRadius: '24px', marginBottom: '2rem', border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.25rem', color: 'var(--accent-blue)', fontWeight: 700, margin: 0 }}>
              📁 Pasta "Meu Treino Vocal" & appDataFolder (Google Drive)
            </h2>
            <button
              onClick={() => fetchDriveSavedFiles(userProfile)}
              disabled={isSyncingDrive || isDbSyncing}
              style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '9999px', padding: '0.4rem 1rem', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600 }}
            >
              🔄 Sincronizar
            </button>
          </div>

          {(driveSyncLog || dbSyncLog) && (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem', background: '#f8fafc', padding: '0.5rem 0.75rem', borderRadius: '8px' }}>
              {dbSyncLog || driveSyncLog}
            </p>
          )}

          {savedDriveFiles.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
              {savedDriveFiles.map((driveFile) => (
                <div
                  key={driveFile.id}
                  onClick={() => handleLoadDriveFile(driveFile)}
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    padding: '0.85rem 1rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    textAlign: 'left'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent-blue)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#e2e8f0')}
                >
                  <p style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    🎵 {driveFile.name}
                  </p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                    Clique para refazer este treino
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              Nenhum treino antigo salvo ainda. Faça upload de uma gravação para salvar automaticamente no seu Google Drive!
            </p>
          )}
        </section>
      )}

      {/* E-Learning Daily Practice Progress Tracker Bar with IndexedDB Source of Truth */}
      <section className="learning-tracker-card">
        <div className="tracker-header">
          <div className="tracker-title">
            <span>🎯 Progresso Diário (Fonte de Verdade: IndexedDB)</span>
          </div>
          <div className="tracker-stats">
            {formatPracticeMinutes(practiceHistory.totalPracticeSeconds)} | Afinação: {practiceHistory.pitchAccuracyRate}%
          </div>
        </div>

        <div className="progress-track-bg">
          <div className="progress-fill" style={{ width: `${practiceRatio * 100}%` }} />
        </div>

        <div className="tracker-footer">
          <span>{Math.round(practiceRatio * 100)}% da meta diária concluída (IndexedDB ↔ Drive Sync Ativo)</span>
          <span>{practiceRatio >= 1 ? '🎉 Meta atingida hoje!' : `Faltam ${Math.ceil((practiceHistory.dailyGoalSeconds - practiceHistory.totalPracticeSeconds) / 60)} min`}</span>
        </div>
      </section>

      <div className="status-bar">
        <div className="badge">
          <span className={`status-dot ${isOnline ? 'online' : 'offline'}`}></span>
          <span>Status: {isOnline ? 'Online' : 'Offline (Modo PWA Ativo)'}</span>
        </div>

        <div className="badge">
          <span className="status-dot online"></span>
          <span>Service Worker: {swRegistered ? 'Ativo (Workbox)' : 'Registrado'}</span>
        </div>

        <div className="badge" style={{ background: '#ecfdf5', borderColor: '#10b981', color: '#047857' }}>
          <span>💾 IndexedDB: {offlineAudios.length} áudio(s) em cache local</span>
        </div>
      </div>

      {installPrompt && (
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <button className="btn-primary" onClick={handleInstallClick}>
            Instalar Aplicativo no Dispositivo
          </button>
        </div>
      )}

      {/* Module 3: Real-Time Vocal Tuner & Canvas Display with Positive Validation */}
      <section style={{ background: '#ffffff', padding: '1.75rem', borderRadius: '24px', marginBottom: '2rem', border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
        <h2 style={{ fontSize: '1.35rem', marginBottom: '0.75rem', color: 'var(--text-main)', textAlign: 'center', fontWeight: 700 }}>
          🎤 Afinador com Validação Positiva & Guia Amigável
        </h2>

        {tunerError && <p style={{ color: 'var(--warning)', textAlign: 'center', marginBottom: '1rem' }}>⚠️ {tunerError}</p>}

        <VocalTunerCanvas userPitch={userPitch} targetPitch={targetPitch} streakCount={pitchStreak} />

        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1rem' }}>
          {!isListening ? (
            <button className="btn-primary" onClick={startTuner} style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
              🎙️ Ligar Microfone & Iniciar Afinador
            </button>
          ) : (
            <button className="btn-primary" onClick={stopTuner} style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
              🛑 Desligar Microfone
            </button>
          )}
        </div>
      </section>

      {/* Module 5: Friendly Voice Focus Controls */}
      {multiDuration > 0 && (
        <section style={{ background: '#ffffff', padding: '1.75rem', borderRadius: '24px', marginBottom: '2rem', border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
          <h2 style={{ fontSize: '1.35rem', marginBottom: '0.5rem', color: 'var(--accent-blue)', fontWeight: 700 }}>
            🎧 Seleção de Foco da Voz Desejada
          </h2>
          <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            Clique na voz que deseja praticar. O aplicativo ajusta automaticamente os volumes e os filtros de clareza nos bastidores.
          </p>

          {multiError && <p style={{ color: 'var(--warning)', marginBottom: '1rem' }}>⚠️ {multiError}</p>}

          <div className="focus-grid">
            {focusVoicesList.map((item) => (
              <button
                key={item.role}
                onClick={() => setFocusVoice(item.role)}
                className={`btn-focus ${focusedVoice === item.role ? 'active' : ''}`}
                type="button"
              >
                <span>{item.label}</span>
                <span className="btn-focus-subtext">{item.subtext}</span>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600 }}>{formatTime(multiCurrentTime)}</span>
            <input
              type="range"
              min={0}
              max={multiDuration || 100}
              step={0.1}
              value={multiCurrentTime}
              onChange={(e) => seekMulti(parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--accent-blue)' }}
            />
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600 }}>{formatTime(multiDuration)}</span>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            {!isMultiPlaying ? (
              <button className="btn-primary" onClick={playMulti} disabled={isMultiLoading}>
                ▶️ Reproduzir Áudio com Foco
              </button>
            ) : (
              <button className="btn-primary" onClick={pauseMulti} style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                ⏸️ Pausar
              </button>
            )}
            <button className="btn-primary" onClick={stopMulti} style={{ background: '#f1f5f9', color: 'var(--text-main)', border: '1px solid #cbd5e1', boxShadow: 'none' }}>
              ⏹️ Parar
            </button>
          </div>

          <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ fontWeight: 600 }}>Ajuste de Tom (Pitch Shift Sincronizado):</span>
              <span style={{ fontWeight: 700, color: 'var(--accent-blue)' }}>
                {multiPitch > 0 ? `+${multiPitch}` : multiPitch} semitonom(s)
              </span>
            </div>
            <input
              type="range"
              min={-12}
              max={12}
              step={1}
              value={multiPitch}
              onChange={(e) => setMultiPitch(parseInt(e.target.value, 10))}
              style={{ width: '100%', accentColor: 'var(--accent-blue)' }}
            />
          </div>
        </section>
      )}

      {/* Module 1: Single Audio Pitch Shifting */}
      {fileName && (
        <section style={{ background: '#ffffff', padding: '1.75rem', borderRadius: '24px', marginBottom: '2rem', border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
          <h2 style={{ fontSize: '1.35rem', marginBottom: '1rem', color: 'var(--accent-blue)', fontWeight: 700 }}>
            🎛️ Módulo 1: Pitch Shifting sem Alterar BPM (Tone.js)
          </h2>

          <div>
            <p style={{ fontWeight: 700, marginBottom: '0.75rem', color: 'var(--accent-purple)' }}>
              🎵 Arquivo: {fileName}
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600 }}>{formatTime(pitchCurrentTime)}</span>
              <input
                type="range"
                min={0}
                max={pitchDuration || 100}
                step={0.1}
                value={pitchCurrentTime}
                onChange={(e) => seekPitch(parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--accent-blue)' }}
              />
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600 }}>{formatTime(pitchDuration)}</span>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              {!isPitchPlaying ? (
                <button className="btn-primary" onClick={playPitch} disabled={isPitchLoading}>
                  ▶️ Reproduzir
                </button>
              ) : (
                <button className="btn-primary" onClick={pausePitch} style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                  ⏸️ Pausar
                </button>
              )}
              <button className="btn-primary" onClick={stopPitch} style={{ background: '#f1f5f9', color: 'var(--text-main)', border: '1px solid #cbd5e1', boxShadow: 'none' }}>
                ⏹️ Parar
              </button>
            </div>

            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 600 }}>Ajuste de Tom (Pitch Shift):</span>
                <span style={{ fontWeight: 700, color: 'var(--accent-blue)' }}>
                  {pitchSemitones > 0 ? `+${pitchSemitones}` : pitchSemitones} semitonom(s)
                </span>
              </div>
              <input
                type="range"
                min={-12}
                max={12}
                step={1}
                value={pitchSemitones}
                onChange={(e) => setPitchSemitones(parseInt(e.target.value, 10))}
                style={{ width: '100%', accentColor: 'var(--accent-purple)' }}
              />
            </div>
          </div>
        </section>
      )}

      <section className="feature-grid">
        <div className="feature-item">
          <h2 className="feature-title">💾 IndexedDB Fonte de Verdade</h2>
          <p className="feature-desc">Registro offline de acertos de afinação e cache local de áudios com rotina de sincronização em segundo plano.</p>
        </div>

        <div className="feature-item">
          <h2 className="feature-title">🔒 Oculto `appDataFolder`</h2>
          <p className="feature-desc">Salvamento seguro do histórico de prática e pontuação no espaço oculto do Drive.</p>
        </div>

        <div className="feature-item">
          <h2 className="feature-title">📁 Pasta "Meu Treino Vocal"</h2>
          <p className="feature-desc">Salvamento automático no Google Drive dos áudios e stems extraídos e listagem de treinos anteriores.</p>
        </div>

        <div className="feature-item">
          <h2 className="feature-title">✨ Validação Positiva</h2>
          <p className="feature-desc">Fundo verde brilhante, contador de acertos contínuos e indicações amigáveis ("Mais agudo" / "Mais grave").</p>
        </div>
      </section>
    </main>
  );
};

export default App;
