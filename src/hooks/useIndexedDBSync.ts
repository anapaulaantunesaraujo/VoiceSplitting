import { useState, useEffect, useCallback } from 'react';
import localforage from 'localforage';
import { UserProfile } from '../components/GoogleLoginButton';
import { GoogleDriveService, UserVocalPracticeHistory } from '../services/googleDriveService';

// Configure IndexedDB instances via localforage
const historyStore = localforage.createInstance({
  name: 'VoiceSplittingDB',
  storeName: 'practiceHistory'
});

const offlineAudioStore = localforage.createInstance({
  name: 'VoiceSplittingDB',
  storeName: 'offlineAudioBlobs'
});

export interface OfflineAudioRecord {
  id: string;
  name: string;
  blob: Blob;
  type: 'vocal' | 'accompaniment' | 'original';
  createdAt: string;
  syncedToDrive: boolean;
}

export interface UseIndexedDBSyncReturn {
  practiceHistory: UserVocalPracticeHistory;
  savePracticeSession: (secondsSpent: number, isAccurate: boolean) => Promise<void>;
  saveAudioOffline: (name: string, blob: Blob, type: 'vocal' | 'accompaniment' | 'original') => Promise<void>;
  offlineAudios: OfflineAudioRecord[];
  isSyncing: boolean;
  syncStatusLog: string | null;
  triggerBackgroundSync: (profile: UserProfile) => Promise<void>;
}

const DEFAULT_HISTORY: UserVocalPracticeHistory = {
  lastUpdated: new Date().toISOString(),
  totalPracticeSeconds: 480,
  dailyGoalSeconds: 900,
  pitchAccuracyRate: 85,
  completedDaysStreak: 0,
  totalSessionsCompleted: 0
};

export const useIndexedDBSync = (userProfile: UserProfile | null): UseIndexedDBSyncReturn => {
  const [practiceHistory, setPracticeHistory] = useState<UserVocalPracticeHistory>(DEFAULT_HISTORY);
  const [offlineAudios, setOfflineAudios] = useState<OfflineAudioRecord[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatusLog, setSyncStatusLog] = useState<string | null>(null);

  // 1. Initialize & load local IndexedDB data as Single Source of Truth
  const loadIndexedDBData = useCallback(async () => {
    try {
      const savedHistory = await historyStore.getItem<UserVocalPracticeHistory>('current_history');
      if (savedHistory) {
        setPracticeHistory(savedHistory);
      } else {
        await historyStore.setItem('current_history', DEFAULT_HISTORY);
      }

      const audios: OfflineAudioRecord[] = [];
      await offlineAudioStore.iterate<OfflineAudioRecord, void>((value) => {
        audios.push(value);
      });
      setOfflineAudios(audios);
    } catch (err) {
      console.error('Erro ao carregar dados do IndexedDB:', err);
    }
  }, []);

  useEffect(() => {
    loadIndexedDBData();
  }, [loadIndexedDBData]);

  // 2. Save practice session tuner accuracy & time into IndexedDB (Source of Truth)
  const savePracticeSession = useCallback(async (secondsSpent: number, isAccurate: boolean) => {
    setPracticeHistory((prev) => {
      const newTotalSeconds = prev.totalPracticeSeconds + secondsSpent;
      const totalFrames = (prev as any)._totalFrames ? (prev as any)._totalFrames + 1 : 10;
      const accurateFrames = (prev as any)._accurateFrames ? (prev as any)._accurateFrames + (isAccurate ? 1 : 0) : 8;

      const newAccuracyRate = Math.round((accurateFrames / totalFrames) * 100);

      const updatedHistory: UserVocalPracticeHistory = {
        ...prev,
        lastUpdated: new Date().toISOString(),
        totalPracticeSeconds: newTotalSeconds,
        pitchAccuracyRate: newAccuracyRate,
        completedDaysStreak: newTotalSeconds >= prev.dailyGoalSeconds ? Math.max(prev.completedDaysStreak, 1) : prev.completedDaysStreak,
        totalSessionsCompleted: prev.totalSessionsCompleted + 1
      };
      (updatedHistory as any)._totalFrames = totalFrames;
      (updatedHistory as any)._accurateFrames = accurateFrames;

      // Update IndexedDB as Single Source of Truth
      historyStore.setItem('current_history', updatedHistory).catch(console.error);
      return updatedHistory;
    });
  }, []);

  // 3. Save offline audio blob into IndexedDB
  const saveAudioOffline = useCallback(async (name: string, blob: Blob, type: 'vocal' | 'accompaniment' | 'original') => {
    const id = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const record: OfflineAudioRecord = {
      id,
      name,
      blob,
      type,
      createdAt: new Date().toISOString(),
      syncedToDrive: false
    };

    await offlineAudioStore.setItem(id, record);
    setOfflineAudios((prev) => [record, ...prev]);
  }, []);

  // 4. Background Sync Routine (IndexedDB <-> Google Drive)
  const triggerBackgroundSync = useCallback(async (profile: UserProfile) => {
    if (!navigator.onLine || !profile || !profile.accessToken) return;

    try {
      setIsSyncing(true);
      setSyncStatusLog('🔄 Sincronização em segundo plano: IndexedDB ↔ Google Drive...');
      const driveService = new GoogleDriveService(profile.accessToken);

      // Step A: Download latest updates from Google Drive (if user trained on another device)
      const remoteHistory = await driveService.loadPracticeHistoryFromAppData();
      const localHistory = await historyStore.getItem<UserVocalPracticeHistory>('current_history');

      let finalHistory = localHistory || DEFAULT_HISTORY;

      if (remoteHistory) {
        // Conflict resolution: pick the history with the latest timestamp or higher practice time
        if (new Date(remoteHistory.lastUpdated).getTime() > new Date(finalHistory.lastUpdated).getTime()) {
          finalHistory = remoteHistory;
          await historyStore.setItem('current_history', remoteHistory);
          setPracticeHistory(remoteHistory);
          setSyncStatusLog('📥 Atualizações de treino baixadas do Google Drive!');
        }
      }

      // Step B: Upload local IndexedDB history to Google Drive appDataFolder
      await driveService.savePracticeHistoryToAppData(finalHistory);

      // Step C: Upload unsynced offline audio blobs from IndexedDB to Google Drive "Meu Treino Vocal" folder
      const folderId = await driveService.getOrCreateTrainingFolder();
      const offlineKeys = await offlineAudioStore.keys();

      for (const key of offlineKeys) {
        const item = await offlineAudioStore.getItem<OfflineAudioRecord>(key);
        if (item && !item.syncedToDrive) {
          setSyncStatusLog(`📤 Enviando "${item.name}" do IndexedDB para o Drive...`);
          await driveService.uploadFileToTrainingFolder(item.blob, `[${item.type.toUpperCase()}] ${item.name}`, folderId);

          // Mark as synced in IndexedDB
          item.syncedToDrive = true;
          await offlineAudioStore.setItem(key, item);
        }
      }

      // Refresh list
      const audios: OfflineAudioRecord[] = [];
      await offlineAudioStore.iterate<OfflineAudioRecord, void>((val) => audios.push(val));
      setOfflineAudios(audios);

      setSyncStatusLog('✅ Sincronização em segundo plano concluída com sucesso!');
    } catch (err: any) {
      setSyncStatusLog(`⚠️ Erro na sincronização em segundo plano: ${err?.message || 'Falha ao sincronizar.'}`);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // 5. Automatic Online/Offline Event Listener for Background Sync
  useEffect(() => {
    const handleOnlineEvent = () => {
      if (userProfile) {
        triggerBackgroundSync(userProfile);
      }
    };

    window.addEventListener('online', handleOnlineEvent);
    return () => {
      window.removeEventListener('online', handleOnlineEvent);
    };
  }, [userProfile, triggerBackgroundSync]);

  return {
    practiceHistory,
    savePracticeSession,
    saveAudioOffline,
    offlineAudios,
    isSyncing,
    syncStatusLog,
    triggerBackgroundSync
  };
};
