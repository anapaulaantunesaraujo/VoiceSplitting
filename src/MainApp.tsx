import React, { useState, useEffect, useCallback } from 'react';
import * as Tone from 'tone';
import { usePitchShift } from './hooks/usePitchShift';
import { useMultiStemMixer } from './hooks/useMultiStemMixer';
import { useVocalTuner } from './hooks/useVocalTuner';
import { useIndexedDBSync } from './hooks/useIndexedDBSync';
import { useVocalEvaluation, VocalEvaluationResult } from './hooks/useVocalEvaluation';
import { MoisesRepertoireView } from './components/MoisesRepertoireView';
import { ReaperMixerConsole } from './components/ReaperMixerConsole';
import { VocalEvaluationModal } from './components/VocalEvaluationModal';
import { GoogleLoginButton, UserProfile } from './components/GoogleLoginButton';
import { TrebleClefIcon } from './components/TrebleClefIcon';
import { extractAudioFromVideo } from './utils/ffmpegAudioExtractor';
import { separateStemsWithWorker } from './utils/stemSeparationClient';

export const MainApp: React.FC = () => {
  // User Profile state from Google OAuth
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('voicesplit_user_profile');
    return saved ? JSON.parse(saved) : null;
  });

  // Track active song title for evaluation reporting
  const [currentSongTitle, setCurrentSongTitle] = useState<string>('Minha Música de Treino');

  // IndexedDB Single Source of Truth & Background Sync Hook
  const {
    savePracticeSession,
    saveAudioOffline,
    offlineAudios,
    categories,
    songs,
    addCategory,
    renameCategory,
    deleteCategory,
    triggerBackgroundSync
  } = useIndexedDBSync(userProfile);

  // Active View Tab State ('repertoire' | 'mixer')
  const [activeTab, setActiveTab] = useState<'repertoire' | 'mixer'>('repertoire');

  // Positive Validation Continuous Pitch Streak Counter
  const [pitchStreak, setPitchStreak] = useState<number>(0);

  // Processing animations and didactic loading states
  const [processingStage, setProcessingStage] = useState<'idle' | 'extracting' | 'separating' | 'done'>('idle');
  const [didacticMessage, setDidacticMessage] = useState<string>('');

  // Web Worker DSP & ONNX state
  const [isWorkerProcessing, setIsWorkerProcessing] = useState<boolean>(false);
  const [workerProgress, setWorkerProgress] = useState<number>(0);
  const [vocalStemBuffer, setVocalStemBuffer] = useState<AudioBuffer | null>(null);

  // Multi-Stem Tone.js Mixer Hook with Virtual Mixing Console & Channel Strips
  const {
    loadStems: loadMultiStems,
    play: playMulti,
    pause: pauseMulti,
    stop: stopMulti,
    setPitchSemitones: setMultiPitch,
    setChannelVolume,
    toggleMute,
    toggleSolo,
    masterVolume,
    setMasterVolume,
    channels,
    soloActiveStem,
    pitchSemitones: multiPitch,
    isPlaying: isMultiPlaying,
    duration: multiDuration,
    currentTime: multiCurrentTime,
    seek: seekMulti,
    focusBoostMultiplier,
    setFocusBoostMultiplier,
    setOnSongEnded
  } = useMultiStemMixer();

  // Single Pitch Shift Hook
  const { loadAudio } = usePitchShift(0);

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

  // Vocal Division Evaluation Hook
  const {
    isEvaluationMode,
    setIsEvaluationMode,
    isModalOpen: isEvalModalOpen,
    setIsModalOpen: setIsEvalModalOpen,
    evaluationResult,
    liveStats,
    recordSample,
    finishEvaluation,
    resetEvaluation
  } = useVocalEvaluation();

  useEffect(() => {
    if (userProfile && navigator.onLine) {
      triggerBackgroundSync(userProfile);
    }
  }, [userProfile, triggerBackgroundSync]);

  // Monitor continuous pitch streaks and record practice session in IndexedDB
  useEffect(() => {
    if (userPitch) {
      let isAccurate = false;
      if (targetPitch && targetPitch.frequency > 0) {
        let centsDiff = 1200 * (Math.log(userPitch.frequency / targetPitch.frequency) / Math.log(2));
        while (centsDiff > 600) centsDiff -= 1200;
        while (centsDiff < -600) centsDiff += 1200;
        if (Math.abs(centsDiff) <= 15) isAccurate = true;
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

  // Auto-record gamification practice session time in IndexedDB
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
  // Shift target pitch by harmonic interval according to the focused voice (e.g. +4 ST for Contralto 3ª, +7 ST for Tenor 5ª)
  useEffect(() => {
    if (isMultiPlaying && vocalStemBuffer) {
      const activeHarmonicShift = soloActiveStem ? (channels[soloActiveStem]?.semitoneInterval || 0) : 0;
      extractTargetPitchFromBuffer(vocalStemBuffer, multiCurrentTime, activeHarmonicShift);
    }
  }, [isMultiPlaying, multiCurrentTime, vocalStemBuffer, extractTargetPitchFromBuffer, soloActiveStem, channels]);

  // Live sample recording for vocal evaluation mode
  useEffect(() => {
    if (isEvaluationMode && isMultiPlaying && userPitch && targetPitch && targetPitch.frequency > 0) {
      const activeShift = soloActiveStem ? (channels[soloActiveStem]?.semitoneInterval || 0) : 0;
      const melodyFreq = targetPitch.frequency / Math.pow(2, activeShift / 12);
      recordSample(userPitch.frequency, melodyFreq, soloActiveStem || 'soprano');
    }
  }, [isEvaluationMode, isMultiPlaying, userPitch, targetPitch, soloActiveStem, channels, recordSample]);

  // Song completion auto-finish for evaluation report
  useEffect(() => {
    setOnSongEnded(() => {
      if (isEvaluationMode) {
        finishEvaluation(soloActiveStem || 'soprano', currentSongTitle);
      }
    });
  }, [setOnSongEnded, isEvaluationMode, finishEvaluation, soloActiveStem, currentSongTitle]);

  const handleToggleEvaluationMode = useCallback(() => {
    setIsEvaluationMode((prev) => {
      const next = !prev;
      if (next && !isListening) {
        startTuner();
      }
      return next;
    });
  }, [isListening, startTuner, setIsEvaluationMode]);

  const handleFinishEvaluationManual = useCallback(() => {
    finishEvaluation(soloActiveStem || 'soprano', currentSongTitle);
  }, [finishEvaluation, soloActiveStem, currentSongTitle]);

  const handleRetryEvaluation = useCallback(() => {
    setIsEvalModalOpen(false);
    resetEvaluation();
    seekMulti(0);
    setTimeout(() => {
      playMulti();
    }, 100);
  }, [setIsEvalModalOpen, resetEvaluation, seekMulti, playMulti]);

  const handleSaveEvaluation = useCallback(
    async (result: VocalEvaluationResult) => {
      await savePracticeSession(result.totalSingingSeconds, result.accuracyPercentage >= 60);
    },
    [savePracticeSession]
  );

  // Unified File Processor with IndexedDB offline storage & Drive sync
  const processUploadedFile = async (file: File, targetCategory?: string) => {
    try {
      setCurrentSongTitle(file.name.replace(/\.[^/.]+$/, ''));
      if (Tone.context.state !== 'running') {
        await Tone.start();
      }

      const isVideo = file.type.startsWith('video/') || file.name.match(/\.(mp4|mov|mkv|avi)$/i);

      let targetAudioFile = file;
      let targetAudioBuffer: AudioBuffer | null = null;

      if (isVideo) {
        setProcessingStage('extracting');
        setDidacticMessage('🎬 Extraindo áudio do vídeo...');

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
      await saveAudioOffline(targetAudioFile.name, targetAudioFile, 'original', targetCategory);

      if (targetAudioBuffer) {
        setProcessingStage('separating');
        setDidacticMessage('🧠 Separando as vozes e o instrumental via Web Worker...');
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

        await saveAudioOffline(`Vocal_${file.name}`, vBlob, 'vocal', targetCategory);
        await saveAudioOffline(`Instrumental_${file.name}`, aBlob, 'accompaniment', targetCategory);

        setVocalStemBuffer(result.vocalAudioBuffer);
        extractTargetPitchFromBuffer(result.vocalAudioBuffer, 0);

        await loadMultiStems({
          vocalUrl: result.vocalBlobUrl,
          accompanimentUrl: result.accompanimentBlobUrl
        });
      }

      // Trigger background sync if online
      if (userProfile && navigator.onLine) {
        setDidacticMessage('☁️ Sincronizando novos arquivos com o Google Drive...');
        await triggerBackgroundSync(userProfile);
      }

      setProcessingStage('done');
      setDidacticMessage('🎉 Separação de vozes e áudio concluída!');
    } catch (err: any) {
      setProcessingStage('idle');
      setDidacticMessage(`⚠️ Erro ao processar o arquivo: ${err?.message || 'Falha ao ler o arquivo.'}`);
    } finally {
      setIsWorkerProcessing(false);
    }
  };

  return (
    <div className="app-layout bg-[#000000] text-white min-h-screen flex flex-col relative overflow-x-hidden">
      {/* Sticky Top Header Navigation Bar with centered inner container */}
      <header className="sticky top-0 z-40 bg-[#121212]/95 backdrop-blur-md border-b border-[#2e2e2e] shadow-2xl w-full py-1">
        <div className="w-full max-w-[1600px] mx-auto px-6 sm:px-10 lg:px-14 py-4 sm:py-5 flex items-center justify-between">
          <div className="flex items-center gap-10">
            {/* Logo & App Name - Vertically Centered */}
            <div
              onClick={() => setActiveTab('repertoire')}
              className="flex items-center gap-3.5 cursor-pointer group"
            >
              <div className="w-12 h-12 rounded-2xl bg-[#1e1e1e] border border-[#2e2e2e] flex items-center justify-center text-[#2563eb] shadow-md group-hover:scale-105 transition-transform">
                <TrebleClefIcon className="w-7 h-7" color="#2563eb" />
              </div>
              <span className="font-black text-white text-2xl tracking-tight leading-none group-hover:text-[#3b82f6] transition-colors flex items-center">
                Treino&nbsp;<span className="text-[#3b82f6]">Vocal</span>
              </span>
            </div>

            {/* Navigation Bar Actions - Only displayed when inside the Mixer screen */}
            {activeTab === 'mixer' && (
              <nav className="flex items-center gap-5 pl-8 border-l border-[#2e2e2e]">
                <button
                  onClick={() => setActiveTab('repertoire')}
                  className="px-12 py-3.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-blue-600/30 ring-2 ring-blue-500/40 rounded-xl text-base font-extrabold transition-all flex items-center gap-4 cursor-pointer shadow-lg whitespace-nowrap"
                  title="Voltar à tela geral do Repertório (Todas as Pastas e Músicas)"
                >
                  <span className="text-xl leading-none">🏠</span>
                  <span>Home / Repertório</span>
                </button>
              </nav>
            )}
          </div>

          {/* User Google Drive Account Action */}
          <div className="flex items-center gap-4">
            <GoogleLoginButton
              onLoginSuccess={(user) => setUserProfile(user)}
              onLogout={() => setUserProfile(null)}
            />
          </div>
        </div>
      </header>

      {/* Main Content Area - Doubled Top & Vertical Spacing for maximum breathing room */}
      <main className="flex-1 w-full max-w-[1600px] mx-auto px-6 sm:px-10 lg:px-14 pt-20 sm:pt-24 pb-32 space-y-16 sm:space-y-20">
        {/* VIEW 1: REPERTÓRIO (macOS Finder Style File Manager) */}
        {activeTab === 'repertoire' && (
          <div className="space-y-10">
            <MoisesRepertoireView
              categories={categories}
              songs={songs}
              offlineAudios={offlineAudios}
              onAddCategory={addCategory}
              onRenameCategory={renameCategory}
              onDeleteCategory={deleteCategory}
              onSelectSongToMixer={async (title, originalRecord) => {
                if (Tone.context.state !== 'running') {
                  await Tone.start();
                }

                setCurrentSongTitle(title || originalRecord?.name || 'Música de Treino');

                if (originalRecord && originalRecord.blob) {
                  const baseName = originalRecord.name;
                  const vocalRecord = offlineAudios.find(
                    (r) => r.type === 'vocal' && (r.name.includes(baseName) || baseName.includes(r.name.replace('Vocal_', '')))
                  );
                  const accRecord = offlineAudios.find(
                    (r) => r.type === 'accompaniment' && (r.name.includes(baseName) || baseName.includes(r.name.replace('Instrumental_', '')))
                  );

                  const vocalFile = vocalRecord?.blob || originalRecord.blob;
                  const accFile = accRecord?.blob || originalRecord.blob;

                  // Decode vocal stem buffer for target pitch extraction & vocal evaluation
                  try {
                    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                    const ctx = new AudioContextClass();
                    const arrBuf = await vocalFile.arrayBuffer();
                    const decoded = await ctx.decodeAudioData(arrBuf);
                    await ctx.close();
                    setVocalStemBuffer(decoded);
                    extractTargetPitchFromBuffer(decoded, 0);
                  } catch (e) {
                    console.warn('Could not decode vocal stem buffer for offline audio:', e);
                  }

                  await loadMultiStems({
                    vocalUrl: vocalFile,
                    accompanimentUrl: accFile
                  });
                }
                setActiveTab('mixer');
              }}
              onUploadFile={processUploadedFile}
            />

            {/* Processing / Separation Progress Banner */}
            {processingStage !== 'idle' && processingStage !== 'done' && (
              <div className="bg-[#121212] border border-[#2563eb] rounded-2xl p-6 text-center space-y-3 shadow-xl">
                <div className="pulse-loader-ring mx-auto" />
                <p className="text-sm font-bold text-[#3b82f6]">{didacticMessage}</p>
                {isWorkerProcessing && (
                  <div className="w-full max-w-xs mx-auto bg-[#1e1e1e] border border-[#2e2e2e] h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-[#2563eb] h-full transition-all duration-300"
                      style={{ width: `${workerProgress * 100}%` }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: STUDIO MIXER CONSOLE */}
        {activeTab === 'mixer' && (
          <div>
            <ReaperMixerConsole
              channels={channels}
              onVolumeChange={setChannelVolume}
              onToggleMute={toggleMute}
              onToggleSolo={toggleSolo}
              masterVolume={masterVolume}
              onMasterVolumeChange={setMasterVolume}
              pitchSemitones={multiPitch}
              onPitchChange={setMultiPitch}
              isPlaying={isMultiPlaying}
              onPlayPause={isMultiPlaying ? pauseMulti : playMulti}
              onStop={() => {
                stopMulti();
                if (isEvaluationMode && liveStats.totalSingingFrames >= 15) {
                  finishEvaluation(soloActiveStem || 'soprano', currentSongTitle);
                }
              }}
              currentTime={multiCurrentTime}
              duration={multiDuration}
              onSeek={seekMulti}
              isListening={isListening}
              onToggleTuner={isListening ? stopTuner : startTuner}
              userPitch={userPitch}
              targetPitch={targetPitch}
              pitchStreak={pitchStreak}
              onBackToRepertoire={() => setActiveTab('repertoire')}
              tunerError={tunerError}
              focusedVoiceLabel={soloActiveStem ? `${channels[soloActiveStem].label} (${channels[soloActiveStem].harmonicRole})` : 'Voz Principal (1ª Tônica)'}
              soloActiveStem={soloActiveStem}
              focusBoostMultiplier={focusBoostMultiplier}
              onFocusBoostChange={setFocusBoostMultiplier}
              isEvaluationMode={isEvaluationMode}
              onToggleEvaluationMode={handleToggleEvaluationMode}
              liveStats={liveStats}
              onFinishEvaluationManual={handleFinishEvaluationManual}
            />
          </div>
        )}
      </main>

      {/* Vocal Evaluation Results Modal */}
      <VocalEvaluationModal
        isOpen={isEvalModalOpen}
        result={evaluationResult}
        onClose={() => setIsEvalModalOpen(false)}
        onRetry={handleRetryEvaluation}
        onSaveToHistory={handleSaveEvaluation}
      />
    </div>
  );
};

export default MainApp;
