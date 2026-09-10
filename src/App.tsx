import React, { useState, useEffect, ChangeEvent, DragEvent, useRef } from 'react';
import * as Tone from 'tone';
import { usePitchShift } from './hooks/usePitchShift';
import { useMultiStemMixer } from './hooks/useMultiStemMixer';
import { useVocalTuner } from './hooks/useVocalTuner';
import { useIndexedDBSync } from './hooks/useIndexedDBSync';
import { Sidebar } from './components/Sidebar';
import { MoisesRepertoireView } from './components/MoisesRepertoireView';
import { ReaperMixerConsole } from './components/ReaperMixerConsole';
import { VocalTunerCanvas } from './components/VocalTunerCanvas';
import { GoogleLoginButton, UserProfile } from './components/GoogleLoginButton';
import { extractAudioFromVideo } from './utils/ffmpegAudioExtractor';
import { separateStemsWithWorker } from './utils/stemSeparationClient';

export const App: React.FC = () => {
  // User Profile state from Google OAuth
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('voicesplit_user_profile');
    return saved ? JSON.parse(saved) : null;
  });

  // IndexedDB Single Source of Truth & Background Sync Hook
  const {
    savePracticeSession,
    saveAudioOffline,
    offlineAudios,
    categories,
    songs,
    addCategory,
    triggerBackgroundSync
  } = useIndexedDBSync(userProfile);

  // Sidebar state
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Active View Tab State ('home' | 'repertoire' | 'mixer' | 'exercises')
  const [activeTab, setActiveTab] = useState<'home' | 'repertoire' | 'mixer' | 'exercises'>('repertoire');

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
    pitchSemitones: multiPitch,
    isPlaying: isMultiPlaying,
    duration: multiDuration,
    currentTime: multiCurrentTime,
    seek: seekMulti
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



  useEffect(() => {
    if (userProfile && navigator.onLine) {
      triggerBackgroundSync(userProfile);
    }
  }, [userProfile, triggerBackgroundSync]);

  // Global user gesture handler to resume/start Web Audio Context smoothly without warnings
  useEffect(() => {
    const handleFirstGesture = async () => {
      try {
        if (Tone.context.state !== 'running') {
          await Tone.start();
        }
      } catch (e) {
        // Ignore
      }
      window.removeEventListener('click', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
      window.removeEventListener('touchstart', handleFirstGesture);
    };

    window.addEventListener('click', handleFirstGesture);
    window.addEventListener('keydown', handleFirstGesture);
    window.addEventListener('touchstart', handleFirstGesture);

    return () => {
      window.removeEventListener('click', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
      window.removeEventListener('touchstart', handleFirstGesture);
    };
  }, []);

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

  return (
    <div className="app-layout bg-[#0b0b0d] text-slate-100 min-h-screen flex">
      {/* Collapsible Moises.ai Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        userProfile={userProfile}
        onLoginClick={() => {}}
        onLogoutClick={() => setUserProfile(null)}
        categories={categories}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        onNewCategoryClick={() => {
          const name = prompt('Nome da nova pasta:');
          if (name) addCategory(name);
        }}
      />

      {/* Main Content View Area */}
      <div
        className={`main-content flex-1 transition-all duration-300 ${
          isSidebarOpen ? 'ml-64' : 'ml-20'
        } p-6 overflow-x-hidden`}
      >
        {/* Top Navbar */}
        <header className="flex items-center justify-between pb-6 mb-6 border-b border-slate-800/60">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-black text-white tracking-tight">
              {activeTab === 'repertoire' ? 'Meu Repertório' : 'Studio Mixer (REAPER DAW)'}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <GoogleLoginButton
              onLoginSuccess={(user) => setUserProfile(user)}
              onLogout={() => setUserProfile(null)}
            />
          </div>
        </header>

        {/* TAB 1: MEU REPERTÓRIO (Moises.ai Style File Manager) */}
        {(activeTab === 'repertoire' || activeTab === 'home') && (
          <div>
            <MoisesRepertoireView
              categories={categories}
              songs={songs}
              offlineAudios={offlineAudios}
              onAddCategory={addCategory}
              onSelectSongToMixer={() => setActiveTab('mixer')}
              onUploadFile={processUploadedFile}
            />

            {/* Featured Drag & Drop Dropzone */}
            <section
              className={`dropzone-container mt-8 p-8 rounded-3xl bg-[#141417] border-2 border-dashed ${
                isDragging ? 'border-indigo-500 bg-indigo-950/20' : 'border-slate-800'
              } text-center cursor-pointer transition-all hover:border-indigo-500/50`}
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
                className="hidden"
              />

              {processingStage === 'idle' || processingStage === 'done' ? (
                <div>
                  <div className="text-4xl mb-3">📥</div>
                  <h2 className="text-base font-bold text-white mb-1">
                    Jogue sua música ou gravação de tela aqui
                  </h2>
                  <p className="text-xs text-slate-400 mb-4">
                    Suporta arquivos de áudio (MP3, WAV, OGG) e vídeos (MP4, MOV, MKV)
                  </p>
                  <button className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all">
                    📁 Selecionar do Dispositivo
                  </button>
                </div>
              ) : (
                <div className="py-4">
                  <div className="pulse-loader-ring mx-auto mb-3" />
                  <p className="text-sm font-bold text-indigo-400 mb-2">{didacticMessage}</p>
                  {isWorkerProcessing && (
                    <div className="w-full max-w-xs mx-auto bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-indigo-500 h-full transition-all duration-300"
                        style={{ width: `${workerProgress * 100}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        )}

        {/* TAB 2: STUDIO MIXER (REAPER DAW Style Console) */}
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
              onStop={stopMulti}
              currentTime={multiCurrentTime}
              duration={multiDuration}
              onSeek={seekMulti}
              isListening={isListening}
              onToggleTuner={isListening ? stopTuner : startTuner}
              userPitch={userPitch}
              targetPitch={targetPitch}
              pitchStreak={pitchStreak}
              onBackToRepertoire={() => setActiveTab('repertoire')}
            />

            {/* Positive Pitch Visualizer Canvas */}
            <section className="bg-[#141417] p-6 rounded-3xl border border-slate-800 mt-6 shadow-2xl">
              <h3 className="text-sm font-bold text-slate-300 mb-3 text-center uppercase tracking-wider">
                🎤 Visualizador do Afinador & Validação Positiva
              </h3>
              {tunerError && <p className="text-amber-400 text-center text-xs mb-3">⚠️ {tunerError}</p>}
              <VocalTunerCanvas userPitch={userPitch} targetPitch={targetPitch} streakCount={pitchStreak} />
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
