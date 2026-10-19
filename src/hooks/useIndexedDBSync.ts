import { useState, useEffect, useCallback } from 'react';
import localforage from 'localforage';
import { UserProfile } from '../components/GoogleLoginButton';
import { GoogleDriveService, UserVocalPracticeHistory } from '../services/googleDriveService';
import { formatMusicalKey } from '../utils/harmonicField';

// Configure IndexedDB instances via localforage
const historyStore = localforage.createInstance({
  name: 'VoiceSplittingDB',
  storeName: 'practiceHistory'
});

const offlineAudioStore = localforage.createInstance({
  name: 'VoiceSplittingDB',
  storeName: 'offlineAudioBlobs'
});

const repertoireStore = localforage.createInstance({
  name: 'VoiceSplittingDB',
  storeName: 'repertoireFolders'
});

/**
 * Normalizes song names and filenames for reliable matching and deduplication.
 * Removes common extensions (.wav, .mp3, .mp4, etc.) and processing suffixes (_audio, _vocal, etc.)
 */
export const normalizeSongTitle = (raw: string): string => {
  if (!raw) return '';
  return raw
    .trim()
    .replace(/\.(mp3|wav|m4a|aac|ogg|flac|webm|mp4|mov|avi|mkv)$/i, '')
    .replace(/_audio$/i, '')
    .replace(/_original$/i, '')
    .replace(/_vocal$/i, '')
    .replace(/_lead$/i, '')
    .replace(/_accompaniment$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
};

export const DEFAULT_VOICE_OCTAVES: Record<string, number> = {
  soprano: 0,
  contralto: 0,
  tenor: -1,
  bass: -1,
  baritone: -1,
  mezzoSoprano: 0,
  accompaniment: 0
};

export interface RepertoireSong {
  id: string;
  title: string;
  fileName: string;
  category: string;
  createdAt: string;
  key?: string;
  bpm?: number;
  scaleNotes?: string[];
  duration?: number;
  isSeparated?: boolean;
  vocalBlobId?: string;
  accompanimentBlobId?: string;
  aiVoiceBlobId?: string;
  // 4 Dedicated Isolated Virtual Singer Stems
  sopranoBlobId?: string;
  contraltoBlobId?: string;
  tenorBlobId?: string;
  bassBlobId?: string;
  virtualSingerVersion?: number;
  // Remote Drive File IDs for cross-device loading
  driveOriginalId?: string;
  driveAccompanimentId?: string;
  driveSopranoId?: string;
  driveContraltoId?: string;
  driveTenorId?: string;
  driveBassId?: string;
  // Saved Rehearsal Preferences per song
  voiceOctaveShifts?: Record<string, number>;
  focusedVoice?: string;
}

export interface RepertoireCategory {
  id: string;
  name: string;
  icon?: string;
}

export interface OfflineAudioRecord {
  id: string;
  name: string;
  blob: Blob;
  type: 'vocal' | 'accompaniment' | 'original' | 'ai_overlay' | 'soprano' | 'contralto' | 'tenor' | 'bass';
  category?: string;
  createdAt: string;
  syncedToDrive: boolean;
  driveFileId?: string;
  key?: string;
  bpm?: number;
}

export interface UseIndexedDBSyncReturn {
  practiceHistory: UserVocalPracticeHistory;
  savePracticeSession: (secondsSpent: number, isAccurate: boolean) => Promise<void>;
  saveAudioOffline: (
    name: string,
    blob: Blob,
    type: 'vocal' | 'accompaniment' | 'original' | 'ai_overlay' | 'soprano' | 'contralto' | 'tenor' | 'bass',
    category?: string,
    key?: string,
    bpm?: number
  ) => Promise<string>;
  getAudioBlobById: (blobId?: string, driveFileId?: string) => Promise<Blob | null>;
  saveSongPackage: (songData: Partial<RepertoireSong> & { title: string; fileName: string; category: string }) => Promise<RepertoireSong>;
  deleteSong: (songId: string, songTitle?: string) => Promise<void>;
  offlineAudios: OfflineAudioRecord[];
  categories: RepertoireCategory[];
  songs: RepertoireSong[];
  addCategory: (name: string) => Promise<void>;
  renameCategory: (catId: string, newName: string) => Promise<void>;
  deleteCategory: (catId: string) => Promise<void>;
  addSongToCategory: (title: string, fileName: string, category: string, key?: string, bpm?: number) => Promise<void>;
  moveSongCategory: (songId: string, newCategory: string, songTitle?: string) => Promise<void>;
  updateSongPreferences: (
    songTitleOrId: string,
    preferences: {
      voiceOctaveShifts?: Record<string, number>;
      focusedVoice?: string;
    }
  ) => Promise<void>;
  updateSongKeyAndBpm: (songTitleOrId: string, newKey: string, newBpm?: number) => Promise<void>;
  isSyncing: boolean;
  syncStatusLog: string | null;
  triggerBackgroundSync: (profile: UserProfile | null) => Promise<void>;
  exportRepertoireBackup: () => Promise<void>;
  importRepertoireBackup: (file: File) => Promise<{ success: boolean; count: number; error?: string }>;
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

  const [categories, setCategories] = useState<RepertoireCategory[]>([
    { id: 'minhas-musicas', name: 'Minhas Músicas', icon: '🎵' },
    { id: 'ensaios', name: 'Ensaios & Treinos', icon: '🎤' }
  ]);
  const [songs, setSongs] = useState<RepertoireSong[]>([]);

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
        audios.push({
          ...value,
          key: formatMusicalKey(value.key)
        });
      });
      setOfflineAudios(audios);

      const savedCategories = await repertoireStore.getItem<RepertoireCategory[]>('categories');
      if (savedCategories && savedCategories.length > 0) {
        setCategories(savedCategories);
      } else {
        const defaultCats: RepertoireCategory[] = [
          { id: 'minhas-musicas', name: 'Minhas Músicas', icon: '🎵' },
          { id: 'ensaios', name: 'Ensaios & Treinos', icon: '🎤' }
        ];
        await repertoireStore.setItem('categories', defaultCats);
      }

      // Load imported songs, filtering out legacy static mock items and deduplicating
      const savedSongs = (await repertoireStore.getItem<RepertoireSong[]>('songs')) || [];
      const importedSongs = savedSongs.filter((s) => !String(s.id).startsWith('song_demo_'));
      
      const dedupedSongs: RepertoireSong[] = [];
      const seenTitles = new Set<string>();
      for (const s of importedSongs) {
        const norm = normalizeSongTitle(s.title).toLowerCase();
        const formattedSong: RepertoireSong = {
          ...s,
          key: formatMusicalKey(s.key)
        };
        if (!seenTitles.has(norm)) {
          seenTitles.add(norm);
          dedupedSongs.push(formattedSong);
        } else {
          // If we have duplicate packages, keep the one that has stems or higher virtualSingerVersion
          const idx = dedupedSongs.findIndex((d) => normalizeSongTitle(d.title).toLowerCase() === norm);
          if (idx !== -1) {
            const existing = dedupedSongs[idx];
            if ((!existing.sopranoBlobId && s.sopranoBlobId) || (s.virtualSingerVersion || 0) > (existing.virtualSingerVersion || 0)) {
              dedupedSongs[idx] = formattedSong;
            }
          }
        }
      }

      if (dedupedSongs.length !== savedSongs.length) {
        await repertoireStore.setItem('songs', dedupedSongs);
      }
      setSongs(dedupedSongs);
    } catch (err) {
      console.error('Erro ao carregar dados do IndexedDB:', err);
    }
  }, []);

  const addCategory = useCallback(async (name: string) => {
    const newCat: RepertoireCategory = {
      id: name.toLowerCase().replace(/\s+/g, '-'),
      name,
      icon: '📁'
    };
    setCategories((prev) => {
      const updated = [...prev, newCat];
      repertoireStore.setItem('categories', updated);
      return updated;
    });
  }, []);

  const renameCategory = useCallback(async (catId: string, newName: string) => {
    setCategories((prev) => {
      const updated = prev.map((cat) => (cat.id === catId ? { ...cat, name: newName } : cat));
      repertoireStore.setItem('categories', updated);
      return updated;
    });
  }, []);

  const deleteCategory = useCallback(async (catId: string) => {
    setCategories((prev) => {
      const updated = prev.filter((cat) => cat.id !== catId);
      repertoireStore.setItem('categories', updated);
      return updated;
    });
  }, []);

  const addSongToCategory = useCallback(
    async (title: string, fileName: string, category: string, key?: string, bpm?: number) => {
      const newSong: RepertoireSong = {
        id: `song_${Date.now()}`,
        title,
        fileName,
        category,
        key: key || 'Dó Maior (C)',
        bpm: bpm || 120,
        createdAt: new Date().toISOString()
      };
      setSongs((prev) => {
        const updated = [newSong, ...prev];
        repertoireStore.setItem('songs', updated);
        return updated;
      });
    },
    []
  );

  const saveSongPackage = useCallback(
    async (songData: Partial<RepertoireSong> & { title: string; fileName: string; category: string }): Promise<RepertoireSong> => {
      const normTitle = normalizeSongTitle(songData.title).toLowerCase();
      const existing = songs.find(
        (s) =>
          s.fileName === songData.fileName ||
          s.title === songData.title ||
          normalizeSongTitle(s.title).toLowerCase() === normTitle ||
          (s.fileName && normalizeSongTitle(s.fileName).toLowerCase() === normTitle)
      );
      const resolvedKey = formatMusicalKey(songData.key || existing?.key || 'Dó Maior (C)');
      const resolvedBpm = songData.bpm || existing?.bpm || 120;
      const songRecord: RepertoireSong = {
        id: existing?.id || `song_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        title: songData.title,
        fileName: songData.fileName,
        category: songData.category || existing?.category || 'minhas-musicas',
        createdAt: existing?.createdAt || new Date().toISOString(),
        key: resolvedKey,
        bpm: resolvedBpm,
        scaleNotes: songData.scaleNotes || existing?.scaleNotes,
        duration: songData.duration || existing?.duration,
        isSeparated: songData.isSeparated ?? true,
        vocalBlobId: songData.vocalBlobId || existing?.vocalBlobId,
        accompanimentBlobId: songData.accompanimentBlobId || existing?.accompanimentBlobId,
        aiVoiceBlobId: songData.aiVoiceBlobId || existing?.aiVoiceBlobId,
        sopranoBlobId: songData.sopranoBlobId || existing?.sopranoBlobId,
        contraltoBlobId: songData.contraltoBlobId || existing?.contraltoBlobId,
        tenorBlobId: songData.tenorBlobId || existing?.tenorBlobId,
        bassBlobId: songData.bassBlobId || existing?.bassBlobId,
        virtualSingerVersion: songData.virtualSingerVersion || existing?.virtualSingerVersion,
        driveOriginalId: songData.driveOriginalId || existing?.driveOriginalId,
        driveAccompanimentId: songData.driveAccompanimentId || existing?.driveAccompanimentId,
        driveSopranoId: songData.driveSopranoId || existing?.driveSopranoId,
        driveContraltoId: songData.driveContraltoId || existing?.driveContraltoId,
        driveTenorId: songData.driveTenorId || existing?.driveTenorId,
        driveBassId: songData.driveBassId || existing?.driveBassId
      };

      setSongs((prev) => {
        const filtered = prev.filter(
          (s) =>
            s.id !== songRecord.id &&
            normalizeSongTitle(s.title).toLowerCase() !== normTitle
        );
        const updated = [songRecord, ...filtered];
        repertoireStore.setItem('songs', updated);
        return updated;
      });

      // Sincroniza também no offlineAudios e offlineAudioStore para garantir coerência total
      setOfflineAudios((prev) =>
        prev.map((a) => {
          const aNorm = normalizeSongTitle(a.name).toLowerCase();
          if (aNorm === normTitle || (normTitle && aNorm.includes(normTitle)) || (aNorm && normTitle.includes(aNorm))) {
            return { ...a, key: resolvedKey, bpm: resolvedBpm };
          }
          return a;
        })
      );
      offlineAudioStore.iterate<OfflineAudioRecord, void>((val, recordKey) => {
        if (val && val.name) {
          const aNorm = normalizeSongTitle(val.name).toLowerCase();
          if (aNorm === normTitle || (normTitle && aNorm.includes(normTitle)) || (aNorm && normTitle.includes(aNorm))) {
            offlineAudioStore.setItem(recordKey, { ...val, key: resolvedKey, bpm: resolvedBpm }).catch(() => {});
          }
        }
      }).catch(() => {});

      return songRecord;
    },
    [songs]
  );

  const deleteSong = useCallback(
    async (songId: string, songTitle?: string) => {
      const normDeleteTitle = songTitle ? normalizeSongTitle(songTitle).toLowerCase() : '';

      // 1. Identify all matching songs in songs state (by id, or matching normalized title/filename)
      const matchingSongs = songs.filter(
        (s) =>
          s.id === songId ||
          (normDeleteTitle && normalizeSongTitle(s.title).toLowerCase() === normDeleteTitle) ||
          (normDeleteTitle && s.fileName && normalizeSongTitle(s.fileName).toLowerCase() === normDeleteTitle)
      );

      // 2. Identify all matching records in offlineAudios state (by id, or matching title/name)
      const matchingAudios = offlineAudios.filter(
        (a) =>
          a.id === songId ||
          (normDeleteTitle &&
            (normalizeSongTitle(a.name).toLowerCase() === normDeleteTitle ||
              a.name.toLowerCase().includes(normDeleteTitle) ||
              normDeleteTitle.includes(normalizeSongTitle(a.name).toLowerCase())))
      );

      // 3. Collect all blob IDs from matching songs to remove from IndexedDB offlineAudioStore
      const blobIdsToDelete = new Set<string>();
      blobIdsToDelete.add(songId);

      matchingSongs.forEach((s) => {
        blobIdsToDelete.add(s.id);
        if (s.vocalBlobId) blobIdsToDelete.add(s.vocalBlobId);
        if (s.accompanimentBlobId) blobIdsToDelete.add(s.accompanimentBlobId);
        if (s.aiVoiceBlobId) blobIdsToDelete.add(s.aiVoiceBlobId);
        if (s.sopranoBlobId) blobIdsToDelete.add(s.sopranoBlobId);
        if (s.contraltoBlobId) blobIdsToDelete.add(s.contraltoBlobId);
        if (s.tenorBlobId) blobIdsToDelete.add(s.tenorBlobId);
        if (s.bassBlobId) blobIdsToDelete.add(s.bassBlobId);
      });

      matchingAudios.forEach((a) => {
        blobIdsToDelete.add(a.id);
      });

      // 4. Remove all identified blob records from offlineAudioStore
      for (const bId of Array.from(blobIdsToDelete)) {
        try {
          await offlineAudioStore.removeItem(bId);
        } catch (e) {
          console.warn('Erro ao deletar blob do offlineAudioStore:', bId, e);
        }
      }

      // Also iterate through offlineAudioStore to remove any records with matching filename/title
      const namesToPurge = new Set<string>();
      if (songTitle) {
        namesToPurge.add(songTitle.toLowerCase());
        namesToPurge.add(normDeleteTitle);
      }
      matchingSongs.forEach((s) => {
        if (s.title) {
          namesToPurge.add(s.title.toLowerCase());
          namesToPurge.add(normalizeSongTitle(s.title).toLowerCase());
        }
        if (s.fileName) {
          namesToPurge.add(s.fileName.toLowerCase());
          namesToPurge.add(normalizeSongTitle(s.fileName).toLowerCase());
        }
      });
      matchingAudios.forEach((a) => {
        if (a.name) {
          namesToPurge.add(a.name.toLowerCase());
          namesToPurge.add(normalizeSongTitle(a.name).toLowerCase());
        }
      });

      try {
        await offlineAudioStore.iterate<OfflineAudioRecord, void>((val, key) => {
          if (
            val &&
            val.name &&
            Array.from(namesToPurge).some(
              (p) =>
                val.name.toLowerCase().includes(p) ||
                p.includes(val.name.toLowerCase()) ||
                normalizeSongTitle(val.name).toLowerCase() === p
            )
          ) {
            offlineAudioStore.removeItem(key).catch(() => {});
          }
        });
      } catch (e) {
        console.warn('Erro ao iterar offlineAudioStore na exclusão:', e);
      }

      // 5. Update songs state and repertoireStore
      setSongs((prev) => {
        const updated = prev.filter(
          (s) =>
            s.id !== songId &&
            (!normDeleteTitle || normalizeSongTitle(s.title).toLowerCase() !== normDeleteTitle)
        );
        repertoireStore.setItem('songs', updated).catch(console.error);
        return updated;
      });

      // 6. Update offlineAudios state
      setOfflineAudios((prev) => {
        const updated = prev.filter(
          (a) =>
            a.id !== songId &&
            !blobIdsToDelete.has(a.id) &&
            (!normDeleteTitle ||
              !Array.from(namesToPurge).some(
                (p) =>
                  a.name.toLowerCase().includes(p) ||
                  p.includes(a.name.toLowerCase()) ||
                  normalizeSongTitle(a.name).toLowerCase() === p
              ))
        );
        return updated;
      });
    },
    [songs, offlineAudios]
  );

  const moveSongCategory = useCallback(
    async (songId: string, newCategory: string, songTitle?: string) => {
      const normTitle = songTitle ? normalizeSongTitle(songTitle).toLowerCase() : '';
      setSongs((prev) => {
        const updated = prev.map((s) =>
          s.id === songId || (normTitle && normalizeSongTitle(s.title).toLowerCase() === normTitle)
            ? { ...s, category: newCategory }
            : s
        );
        repertoireStore.setItem('songs', updated);
        return updated;
      });
      setOfflineAudios((prev) => {
        const updated = prev.map((a) =>
          a.id === songId || (songTitle && a.name.toLowerCase().includes(songTitle.toLowerCase()))
            ? { ...a, category: newCategory }
            : a
        );
        offlineAudioStore.iterate<OfflineAudioRecord, void>((val, key) => {
          if (
            val.id === songId ||
            (songTitle && val.name.toLowerCase().includes(songTitle.toLowerCase()))
          ) {
            offlineAudioStore.setItem(key, { ...val, category: newCategory });
          }
        });
        return updated;
      });
    },
    []
  );

  const updateSongPreferences = useCallback(
    async (
      songTitleOrId: string,
      preferences: {
        voiceOctaveShifts?: Record<string, number>;
        focusedVoice?: string;
      }
    ) => {
      const norm = normalizeSongTitle(songTitleOrId).toLowerCase();
      setSongs((prev) => {
        const updated = prev.map((s) => {
          if (
            s.id === songTitleOrId ||
            s.title === songTitleOrId ||
            normalizeSongTitle(s.title).toLowerCase() === norm ||
            (s.fileName && normalizeSongTitle(s.fileName).toLowerCase() === norm)
          ) {
            return {
              ...s,
              voiceOctaveShifts: preferences.voiceOctaveShifts
                ? { ...(s.voiceOctaveShifts || {}), ...preferences.voiceOctaveShifts }
                : s.voiceOctaveShifts,
              focusedVoice: preferences.focusedVoice || s.focusedVoice
            };
          }
          return s;
        });
        repertoireStore.setItem('songs', updated).catch(console.error);
        return updated;
      });
    },
    []
  );

  const updateSongKeyAndBpm = useCallback(
    async (songTitleOrId: string, newKey: string, newBpm?: number) => {
      const norm = normalizeSongTitle(songTitleOrId).toLowerCase();
      const formattedKey = formatMusicalKey(newKey);

      // 1. Atualiza songs no estado e no IndexedDB
      setSongs((prev) => {
        let changed = false;
        const updated = prev.map((s) => {
          if (
            s.id === songTitleOrId ||
            s.title === songTitleOrId ||
            normalizeSongTitle(s.title).toLowerCase() === norm ||
            (s.fileName && normalizeSongTitle(s.fileName).toLowerCase() === norm)
          ) {
            changed = true;
            return {
              ...s,
              key: formattedKey,
              ...(newBpm ? { bpm: newBpm } : {})
            };
          }
          return s;
        });
        if (changed) {
          repertoireStore.setItem('songs', updated).catch(console.error);
        }
        return updated;
      });

      // 2. Atualiza offlineAudios no estado e no IndexedDB
      setOfflineAudios((prev) => {
        const updated = prev.map((a) => {
          const aNorm = normalizeSongTitle(a.name).toLowerCase();
          if (
            a.id === songTitleOrId ||
            a.name === songTitleOrId ||
            aNorm === norm ||
            (norm && aNorm.includes(norm)) ||
            (aNorm && norm.includes(aNorm))
          ) {
            return {
              ...a,
              key: formattedKey,
              ...(newBpm ? { bpm: newBpm } : {})
            };
          }
          return a;
        });
        return updated;
      });

      try {
        await offlineAudioStore.iterate<OfflineAudioRecord, void>((val, recordKey) => {
          if (val && val.name) {
            const aNorm = normalizeSongTitle(val.name).toLowerCase();
            if (
              val.id === songTitleOrId ||
              val.name === songTitleOrId ||
              aNorm === norm ||
              (norm && aNorm.includes(norm)) ||
              (aNorm && norm.includes(aNorm))
            ) {
              offlineAudioStore.setItem(recordKey, {
                ...val,
                key: formattedKey,
                ...(newBpm ? { bpm: newBpm } : {})
              }).catch(() => {});
            }
          }
        });
      } catch (err) {
        console.warn('Erro ao atualizar offlineAudioStore com novo tom/bpm:', err);
      }
    },
    []
  );

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

      historyStore.setItem('current_history', updatedHistory).catch(console.error);
      return updatedHistory;
    });
  }, []);

  // 3. Save offline audio blob into IndexedDB with musical key & BPM
  const saveAudioOffline = useCallback(
    async (
      name: string,
      blob: Blob,
      type: 'vocal' | 'accompaniment' | 'original' | 'ai_overlay' | 'soprano' | 'contralto' | 'tenor' | 'bass',
      category?: string,
      key?: string,
      bpm?: number
    ): Promise<string> => {
      const id = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const record: OfflineAudioRecord = {
        id,
        name,
        blob,
        type,
        category,
        createdAt: new Date().toISOString(),
        syncedToDrive: false,
        key,
        bpm
      };

      await offlineAudioStore.setItem(id, record);
      setOfflineAudios((prev) => [record, ...prev]);
      return id;
    },
    []
  );

  // Retrieve an audio blob locally or download from Google Drive on-demand (Cross-Device)
  const getAudioBlobById = useCallback(
    async (blobId?: string, driveFileId?: string): Promise<Blob | null> => {
      if (!blobId && !driveFileId) return null;

      if (blobId) {
        const localRecord = await offlineAudioStore.getItem<OfflineAudioRecord>(blobId);
        if (localRecord && localRecord.blob) {
          return localRecord.blob;
        }
      }

      // If not present in local IndexedDB (e.g., opened on user's phone for the first time)
      if (driveFileId && userProfile?.accessToken) {
        try {
          const driveService = new GoogleDriveService(userProfile.accessToken);
          const downloadedBlob = await driveService.downloadFileAsBlob(driveFileId);
          if (downloadedBlob && blobId) {
            await offlineAudioStore.setItem(blobId, {
              id: blobId,
              name: `Stream_${blobId}`,
              blob: downloadedBlob,
              type: 'original',
              createdAt: new Date().toISOString(),
              syncedToDrive: true,
              driveFileId
            });
          }
          return downloadedBlob;
        } catch (err) {
          console.warn('Erro ao baixar áudio do Google Drive:', err);
        }
      }

      return null;
    },
    [userProfile]
  );

  // 4. Background Sync Routine (IndexedDB <-> Google Drive)
  const triggerBackgroundSync = useCallback(async (profile: UserProfile | null) => {
    if (!profile || !profile.accessToken) {
      setSyncStatusLog('ℹ️ Conecte sua conta do Google Drive para sincronizar suas músicas na nuvem.');
      return;
    }

    // Support Demo / Test Mode for instant verification without needing Google Cloud credentials
    if (profile.accessToken.startsWith('demo_')) {
      setIsSyncing(true);
      setSyncStatusLog('🔄 [Modo Teste] Simulando sincronização da galeria e histórico com o Drive...');
      await new Promise((r) => setTimeout(r, 1200));
      setIsSyncing(false);
      setSyncStatusLog('✅ [Modo Teste] Galeria e histórico sincronizados com sucesso localmente!');
      return;
    }

    if (!navigator.onLine) {
      setSyncStatusLog('⚠️ Sem conexão com a internet para sincronizar com o Google Drive.');
      return;
    }

    try {
      setIsSyncing(true);
      setSyncStatusLog('🔄 Sincronizando galeria e histórico com o Google Drive...');
      const driveService = new GoogleDriveService(profile.accessToken);

      // Step A: Load or Merge Repertoire Catalogue from Google Drive appDataFolder
      // This is crucial: ANY phone or PC logging in gets the complete list of songs!
      const remoteCatalogue = await driveService.loadCatalogueFromAppData();
      const localSongs = (await repertoireStore.getItem<RepertoireSong[]>('songs')) || [];
      const localCats = (await repertoireStore.getItem<RepertoireCategory[]>('categories')) || [];

      let mergedSongs = [...localSongs];
      let mergedCats = [...localCats];

      if (remoteCatalogue && remoteCatalogue.songs) {
        const localSongIds = new Set(localSongs.map((s) => s.id));
        const newFromRemote: RepertoireSong[] = [];

        remoteCatalogue.songs.forEach((rSong: RepertoireSong) => {
          if (!localSongIds.has(rSong.id) && !String(rSong.id).startsWith('song_demo_')) {
            newFromRemote.push(rSong);
          } else {
            // Merge properties if remote has drive file IDs
            mergedSongs = mergedSongs.map((s) => {
              if (s.id === rSong.id) {
                return {
                  ...rSong,
                  ...s,
                  driveOriginalId: s.driveOriginalId || rSong.driveOriginalId,
                  driveAccompanimentId: s.driveAccompanimentId || rSong.driveAccompanimentId,
                  driveSopranoId: s.driveSopranoId || rSong.driveSopranoId,
                  driveContraltoId: s.driveContraltoId || rSong.driveContraltoId,
                  driveTenorId: s.driveTenorId || rSong.driveTenorId,
                  driveBassId: s.driveBassId || rSong.driveBassId
                };
              }
              return s;
            });
          }
        });

        if (newFromRemote.length > 0) {
          mergedSongs = [...newFromRemote, ...mergedSongs];
        }

        // Merge Categories
        if (remoteCatalogue.categories && Array.isArray(remoteCatalogue.categories)) {
          const localCatIds = new Set(localCats.map((c) => c.id));
          remoteCatalogue.categories.forEach((rCat: RepertoireCategory) => {
            if (!localCatIds.has(rCat.id)) {
              mergedCats.push(rCat);
            }
          });
        }

        // Save merged data locally in IndexedDB
        await repertoireStore.setItem('songs', mergedSongs);
        await repertoireStore.setItem('categories', mergedCats);
        setSongs(mergedSongs);
        setCategories(mergedCats);
      }

      // Step B: Save updated catalogue to Google Drive appDataFolder
      await driveService.saveCatalogueToAppData({
        songs: mergedSongs,
        categories: mergedCats,
        lastUpdated: new Date().toISOString()
      });

      // Step C: Practice History sync
      const remoteHistory = await driveService.loadPracticeHistoryFromAppData();
      const localHistory = await historyStore.getItem<UserVocalPracticeHistory>('current_history');
      let finalHistory = localHistory || DEFAULT_HISTORY;

      if (remoteHistory) {
        if (new Date(remoteHistory.lastUpdated).getTime() > new Date(finalHistory.lastUpdated).getTime()) {
          finalHistory = remoteHistory;
          await historyStore.setItem('current_history', remoteHistory);
          setPracticeHistory(remoteHistory);
        }
      }
      await driveService.savePracticeHistoryToAppData(finalHistory);

      // Step D: Upload unsynced offline audio blobs to Google Drive "Meu Treino Vocal" folder
      const folderId = await driveService.getOrCreateTrainingFolder();
      const offlineKeys = await offlineAudioStore.keys();

      for (const key of offlineKeys) {
        const item = await offlineAudioStore.getItem<OfflineAudioRecord>(key);
        if (item && !item.syncedToDrive) {
          setSyncStatusLog(`📤 Enviando "${item.name}" para o Drive...`);
          const uploaded = await driveService.uploadFileToTrainingFolder(item.blob, `[${item.type.toUpperCase()}] ${item.name}`, folderId);

          item.syncedToDrive = true;
          item.driveFileId = uploaded.id;
          await offlineAudioStore.setItem(key, item);
        }
      }

      // Step E: Escanear arquivos de áudio colocados diretamente na pasta "Meu Treino Vocal" no Google Drive
      setSyncStatusLog('📥 Verificando músicas na sua pasta do Google Drive...');
      try {
        const driveFiles = await driveService.listTrainingFiles(folderId);
        let newSongsFound = false;
        const currentSongs = (await repertoireStore.getItem<RepertoireSong[]>('songs')) || mergedSongs;
        let updatedSongs = [...currentSongs];

        for (const file of driveFiles) {
          // Ignora faixas internas do cantor virtual / stems gerados pelo app
          const isStem = /^\[(VOCAL|INSTRUMENTAL|SOPRANO|CONTRALTO|TENOR|BAIXO|AI_OVERLAY)\]/i.test(file.name);
          if (isStem) continue;

          // Ignora backups json e diretórios
          if (file.name.endsWith('.json') || file.mimeType === 'application/json' || file.mimeType === 'application/vnd.google-apps.folder') {
            continue;
          }

          const cleanTitle = normalizeSongTitle(file.name) || file.name;
          const normTitleLower = cleanTitle.toLowerCase();

          // Verifica se já está catalogado por driveOriginalId ou pelo título/arquivo
          const alreadyExists = updatedSongs.some(
            (s) =>
              s.driveOriginalId === file.id ||
              normalizeSongTitle(s.title).toLowerCase() === normTitleLower ||
              normalizeSongTitle(s.fileName || '').toLowerCase() === normTitleLower
          );

          if (!alreadyExists) {
            const newDriveSong: RepertoireSong = {
              id: `drive_${file.id}`,
              title: cleanTitle,
              fileName: file.name,
              category: 'ensaios',
              createdAt: file.createdTime || new Date().toISOString(),
              driveOriginalId: file.id,
              isSeparated: false
            };
            updatedSongs.unshift(newDriveSong);
            newSongsFound = true;
          }
        }

        if (newSongsFound) {
          await repertoireStore.setItem('songs', updatedSongs);
          setSongs(updatedSongs);
          await driveService.saveCatalogueToAppData({
            songs: updatedSongs,
            categories: mergedCats,
            lastUpdated: new Date().toISOString()
          });
        }
      } catch (listErr) {
        console.warn('Erro ao escanear arquivos da pasta do Drive:', listErr);
      }

      // Refresh local audios list
      const audios: OfflineAudioRecord[] = [];
      await offlineAudioStore.iterate<OfflineAudioRecord, void>((val) => audios.push(val));
      setOfflineAudios(audios);

      setSyncStatusLog('✅ Galeria do Google Drive sincronizada com sucesso em todos os seus aparelhos!');
    } catch (err: any) {
      console.warn('Erro na sincronização em segundo plano:', err);
      const errMsg = err?.message || '';
      const isAuthError =
        errMsg.includes('401') ||
        errMsg.includes('Unauthorized') ||
        errMsg.includes('invalid_token') ||
        errMsg.includes('invalid_grant');

      const isDriveApiDisabled =
        errMsg.includes('Google Drive API has not been used') ||
        errMsg.includes('is disabled') ||
        errMsg.includes('API do Google Drive está desativada') ||
        errMsg.includes('SERVICE_DISABLED') ||
        errMsg.includes('accessNotConfigured');

      if (isAuthError) {
        setSyncStatusLog('⚠️ Sessão do Google expirada. Clique no botão de Drive para reconectar sua conta.');
      } else if (isDriveApiDisabled) {
        setSyncStatusLog('⚠️ A API do Google Drive está desativada no seu Google Cloud. Ative em: https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=1002258145056');
      } else {
        const cleanMsg = errMsg.length > 150 ? errMsg.slice(0, 150) + '...' : errMsg;
        setSyncStatusLog(`⚠️ Sincronização Google Drive: ${cleanMsg || 'Falha ao sincronizar com o Drive.'}`);
      }
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // 5. Offline Repertoire Backup (JSON Export / Import)
  const exportRepertoireBackup = useCallback(async () => {
    try {
      const currentSongs = (await repertoireStore.getItem<RepertoireSong[]>('songs')) || [];
      const currentCats = (await repertoireStore.getItem<RepertoireCategory[]>('categories')) || [];
      const backupData = {
        app: 'TreinoVocal',
        version: '1.0',
        exportedAt: new Date().toISOString(),
        categories: currentCats,
        songs: currentSongs
      };
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TreinoVocal_Backup_Repertorio_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setSyncStatusLog('✅ Backup local do repertório exportado com sucesso (.json)!');
    } catch (err: any) {
      console.warn('Erro ao exportar backup local:', err);
      setSyncStatusLog(`⚠️ Erro ao exportar backup: ${err?.message}`);
    }
  }, []);

  const importRepertoireBackup = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed.songs || !Array.isArray(parsed.songs)) {
        throw new Error('Arquivo JSON inválido. Verifique se é um backup do Divisão Vocal.');
      }
      const existingSongs = (await repertoireStore.getItem<RepertoireSong[]>('songs')) || [];
      const existingCats = (await repertoireStore.getItem<RepertoireCategory[]>('categories')) || [];

      // Merge categories
      const catMap = new Map<string, RepertoireCategory>();
      existingCats.forEach((c) => catMap.set(c.id, c));
      (parsed.categories || []).forEach((c: RepertoireCategory) => {
        if (!catMap.has(c.id)) catMap.set(c.id, c);
      });
      const mergedCats = Array.from(catMap.values());

      // Merge songs
      const songMap = new Map<string, RepertoireSong>();
      existingSongs.forEach((s) => songMap.set(s.id, s));
      (parsed.songs || []).forEach((s: RepertoireSong) => {
        if (!songMap.has(s.id)) songMap.set(s.id, s);
      });
      const mergedSongs = Array.from(songMap.values());

      await repertoireStore.setItem('songs', mergedSongs);
      await repertoireStore.setItem('categories', mergedCats);
      setSongs(mergedSongs);
      setCategories(mergedCats);
      setSyncStatusLog(`✅ Backup restaurado: ${parsed.songs.length} músicas carregadas no repertório!`);
      return { success: true, count: parsed.songs.length };
    } catch (err: any) {
      console.warn('Erro ao importar backup:', err);
      setSyncStatusLog(`⚠️ Falha ao importar backup: ${err?.message}`);
      return { success: false, count: 0, error: err?.message };
    }
  }, []);

  // 6. Automatic Online/Offline Event Listener for Background Sync
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

  // 7. Sincronização automática assim que o perfil de usuário estiver autenticado
  useEffect(() => {
    if (userProfile && userProfile.accessToken && navigator.onLine) {
      triggerBackgroundSync(userProfile);
    }
  }, [userProfile?.accessToken, triggerBackgroundSync]);

  return {
    practiceHistory,
    savePracticeSession,
    saveAudioOffline,
    getAudioBlobById,
    saveSongPackage,
    deleteSong,
    offlineAudios,
    categories,
    songs,
    addCategory,
    renameCategory,
    deleteCategory,
    addSongToCategory,
    moveSongCategory,
    updateSongPreferences,
    updateSongKeyAndBpm,
    isSyncing,
    syncStatusLog,
    triggerBackgroundSync,
    exportRepertoireBackup,
    importRepertoireBackup
  };
};
