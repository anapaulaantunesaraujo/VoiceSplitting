import React, { useState } from 'react';
import * as Tone from 'tone';
import { RepertoireCategory, RepertoireSong, OfflineAudioRecord, normalizeSongTitle } from '../hooks/useIndexedDBSync';
import { TrebleClefIcon } from './TrebleClefIcon';
import { formatMusicalKey } from '../utils/harmonicField';

import { UserProfile } from './GoogleLoginButton';

interface MoisesRepertoireViewProps {
  categories: RepertoireCategory[];
  songs: RepertoireSong[];
  offlineAudios: OfflineAudioRecord[];
  onAddCategory: (name: string) => Promise<void>;
  onRenameCategory?: (catId: string, newName: string) => Promise<void>;
  onDeleteCategory?: (catId: string) => Promise<void>;
  onSelectSongToMixer: (songTitle: string, itemRecord?: any) => void;
  onDeleteSong?: (songId: string, songTitle?: string) => Promise<void>;
  onMoveSongCategory?: (songId: string, newCategoryId: string, songTitle?: string) => Promise<void>;
  onUploadFile: (file: File, targetCategory?: string) => void;
  userEmail?: string;
  userProfile?: UserProfile | null;
  onTriggerSync?: () => void;
  onOpenSyncModal?: () => void;
  isSyncing?: boolean;
  syncStatusLog?: string | null;
}

export const MoisesRepertoireView: React.FC<MoisesRepertoireViewProps> = ({
  categories,
  songs,
  offlineAudios,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  onSelectSongToMixer,
  onDeleteSong,
  onMoveSongCategory,
  onUploadFile,
  userEmail = 'Usuário',
  userProfile = null,
  onTriggerSync,
  onOpenSyncModal,
  isSyncing = false,
  syncStatusLog = null
}) => {
  // Current active setlist / folder ID (default to first category or null for all)
  const [selectedFolderId, setSelectedFolderId] = useState<string>('ensaios');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals state
  const [showFolderModal, setShowFolderModal] = useState<boolean>(false);
  const [folderNameInput, setFolderNameInput] = useState<string>('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);

  // Moving song state
  const [movingSong, setMovingSong] = useState<any | null>(null);

  // Deleting song state
  const [deletingSong, setDeletingSong] = useState<{ id: string; title: string } | null>(null);

  // Helper to format duration in mm:ss or '-'
  const formatDuration = (seconds?: number) => {
    if (!seconds || isNaN(seconds) || seconds <= 0) return '—';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Helper to parse artist and title
  const parseArtistAndTitle = (title: string, defaultSubtitle: string) => {
    if (title.includes(' - ')) {
      const parts = title.split(' - ');
      return { artist: parts[0].trim(), songName: parts.slice(1).join(' - ').trim() };
    }
    return { artist: defaultSubtitle || 'Artista', songName: title };
  };

  // Combine items - only real items actually imported by the user (no hardcoded demos)
  // 1. Process structured songs
  const validSongs = songs.filter((song) => !String(song.id).startsWith('song_demo_'));

  // Build a set of registered song keys (normalized titles, filenames, and IDs)
  const registeredSongKeys = new Set<string>();
  validSongs.forEach((song) => {
    const normTitle = normalizeSongTitle(song.title).toLowerCase();
    if (normTitle) registeredSongKeys.add(normTitle);
    if (song.fileName) {
      const normFileName = normalizeSongTitle(song.fileName).toLowerCase();
      if (normFileName) registeredSongKeys.add(normFileName);
    }
    registeredSongKeys.add(String(song.id));
  });

  // 2. Only include offline audio records if there is NO matching structured song
  const orphanOfflineAudios = offlineAudios.filter((item) => {
    if (item.type !== 'original' || String(item.id).startsWith('song_demo_')) {
      return false;
    }
    const normAudioName = normalizeSongTitle(item.name).toLowerCase();
    if (!normAudioName) return false;

    // Direct check
    if (registeredSongKeys.has(normAudioName) || registeredSongKeys.has(String(item.id))) {
      return false;
    }

    // Fuzzy check (contained in or contains any registered title)
    for (const key of Array.from(registeredSongKeys)) {
      if (key && (key === normAudioName || normAudioName.includes(key) || key.includes(normAudioName))) {
        return false;
      }
    }
    return true;
  });

  const allItems = [
    ...validSongs.map((song) => {
      const cleanTitle = normalizeSongTitle(song.title);
      const { artist, songName } = parseArtistAndTitle(cleanTitle || song.title, `Pasta: ${song.category}`);
      return {
        id: song.id,
        title: songName,
        artist: artist,
        genre: 'Coral',
        key: formatMusicalKey(song.key),
        bpm: song.bpm ? song.bpm : '—',
        duration: formatDuration(song.duration),
        date: new Date(song.createdAt).toLocaleDateString('pt-BR', { month: 'short', day: '2-digit', year: 'numeric' }),
        category: song.category,
        synced: true,
        originalItem: song
      };
    }),
    ...orphanOfflineAudios.map((item) => {
      const cleanName = normalizeSongTitle(item.name);
      const { artist, songName } = parseArtistAndTitle(cleanName || item.name, 'Áudio Local');
      return {
        id: item.id,
        title: songName,
        artist: artist,
        genre: 'Ensaio',
        key: formatMusicalKey(item.key),
        bpm: item.bpm ? item.bpm : '—',
        duration: '—',
        date: new Date(item.createdAt).toLocaleDateString('pt-BR', { month: 'short', day: '2-digit', year: 'numeric' }),
        category: item.category || 'ensaios',
        synced: item.syncedToDrive,
        originalItem: item
      };
    })
  ];

  // Deduplicate items strictly by normalized title
  const uniqueItemsMap = new Map<string, typeof allItems[0]>();
  for (const item of allItems) {
    const normKey = normalizeSongTitle(item.title).toLowerCase();
    if (!uniqueItemsMap.has(normKey)) {
      uniqueItemsMap.set(normKey, item);
    } else {
      const existing = uniqueItemsMap.get(normKey)!;
      // Prefer real detected key/bpm over placeholder 'Dó Maior (C)' or '—' / 120
      const isPlaceholder = (k?: string) => !k || k === '—' || k === 'Dó Maior (C)';
      const isDefaultBpm = (b?: any) => !b || b === '—' || b === 120;

      const bestKey = !isPlaceholder(item.key) ? item.key : (!isPlaceholder(existing.key) ? existing.key : item.key);
      const bestBpm = !isDefaultBpm(item.bpm) ? item.bpm : (!isDefaultBpm(existing.bpm) ? existing.bpm : item.bpm);

      // If a duplicate exists, keep the full 'Coral' song with duration / stems over raw 'Ensaio'
      if (existing.genre === 'Ensaio' && item.genre === 'Coral') {
        uniqueItemsMap.set(normKey, {
          ...item,
          key: bestKey,
          bpm: bestBpm
        });
      } else if (existing.genre === 'Coral' && item.genre === 'Ensaio') {
        existing.key = bestKey;
        existing.bpm = bestBpm;
      } else if (existing.duration === '—' && item.duration !== '—') {
        uniqueItemsMap.set(normKey, {
          ...item,
          key: bestKey,
          bpm: bestBpm
        });
      } else {
        existing.key = bestKey;
        existing.bpm = bestBpm;
      }
    }
  }
  const uniqueItems = Array.from(uniqueItemsMap.values());

  const currentFolder = categories.find((c) => c.id === selectedFolderId) || categories[0] || {
    id: 'ensaios',
    name: 'Ensaiar'
  };

  // Filter items by folder and search
  const filteredItems = uniqueItems.filter((item) => {
    const matchesFolder = selectedFolderId === 'all' || item.category.toLowerCase() === selectedFolderId.toLowerCase();
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.key.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFolder && matchesSearch;
  });

  const handleOpenFolderModal = (catId?: string, currentName?: string) => {
    if (catId && currentName) {
      setEditingCatId(catId);
      setFolderNameInput(currentName);
    } else {
      setEditingCatId(null);
      setFolderNameInput('');
    }
    setShowFolderModal(true);
  };

  const handleSaveFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderNameInput.trim()) return;

    if (editingCatId && onRenameCategory) {
      await onRenameCategory(editingCatId, folderNameInput.trim());
    } else {
      await onAddCategory(folderNameInput.trim());
    }

    setFolderNameInput('');
    setEditingCatId(null);
    setShowFolderModal(false);
  };

  const handleOpenSong = async (item: { title: string; originalItem: any }) => {
    try {
      if (Tone.context && Tone.context.state !== 'running') {
        await Tone.start();
      }
    } catch (e) {
      // AudioContext will start on gesture
    }
    // Directly opens the studio player without any bouncing!
    onSelectSongToMixer(item.title, item.originalItem);
  };

  return (
    <div className="w-full flex-1 flex flex-col md:flex-row bg-[#0a0b0e] border border-[#232530] rounded-[28px] md:rounded-[36px] overflow-hidden shadow-2xl min-h-[calc(100vh-2.5rem)]">
      {/* =========================================================================
          LEFT SIDEBAR (Matching Moises Screenshot 2) - Spacious & Relaxed
      ========================================================================= */}
      <aside className="w-full md:w-72 bg-[#121318] border-b md:border-b-0 md:border-r border-[#232530] p-6 lg:p-7 flex flex-col justify-between shrink-0">
        <div className="space-y-8">
          {/* Brand Logo */}
          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-2xl bg-[#1c2230] border border-[#2b354f] flex items-center justify-center text-[#00c2cb] shadow-sm">
              <TrebleClefIcon className="w-6 h-6" color="#00c2cb" />
            </div>
            <span className="font-black text-white text-lg tracking-tight">
              Divisão <span className="text-[#00c2cb]">Vocal</span>
            </span>
          </div>

          {/* Nav Section: Início */}
          <div className="space-y-2">
            <button
              onClick={() => setSelectedFolderId('all')}
              className={`w-full px-4 py-3 rounded-2xl text-xs sm:text-sm font-bold transition-all flex items-center gap-3 cursor-pointer text-left ${
                selectedFolderId === 'all'
                  ? 'bg-[#1c2230] text-[#00c2cb] font-black shadow-sm'
                  : 'text-[#9ca3af] hover:bg-[#181a20] hover:text-white'
              }`}
            >
              <span className="text-base">🏠</span>
              <span>Todas as Músicas</span>
            </button>
          </div>

          {/* Section: SETLISTS / PASTAS */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between px-2">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#71717a]">
                Setlists & Pastas
              </span>
              <button
                onClick={() => handleOpenFolderModal()}
                className="px-4 py-1.5 rounded-xl bg-[#00c2cb]/15 hover:bg-[#00c2cb]/25 text-[#00c2cb] font-black text-xs transition-all border border-[#00c2cb]/30 cursor-pointer shrink-0 min-w-fit flex items-center gap-1.5 shadow-sm"
                title="Criar Nova Setlist"
              >
                <span>+</span>
                <span className="px-1">Nova</span>
              </button>
            </div>

            <div className="space-y-2">
              {categories.map((cat) => {
                const isSelected = selectedFolderId === cat.id;
                const count = uniqueItems.filter((i) => i.category.toLowerCase() === cat.id.toLowerCase()).length;
                return (
                  <div
                    key={cat.id}
                    onClick={() => setSelectedFolderId(cat.id)}
                    className={`group px-4 py-3 rounded-2xl text-xs sm:text-sm font-bold transition-all flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-[#1c2230] text-white border border-[#00c2cb]/40 shadow-sm'
                        : 'text-[#9ca3af] hover:bg-[#181a20] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-base">{isSelected ? '📁' : '📂'}</span>
                      <span className="truncate">{cat.name}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-mono text-[#71717a]">{count}</span>
                      {onDeleteCategory && cat.id !== 'ensaios' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Excluir a pasta "${cat.name}"?`)) onDeleteCategory(cat.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-xs text-[#71717a] hover:text-rose-400 p-1 rounded-lg"
                          title="Excluir"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* User Account / Google Drive Sync at bottom */}
        <div
          onClick={onOpenSyncModal || onTriggerSync}
          className="pt-6 border-t border-[#232530] flex items-center justify-between gap-3 px-2 mt-6 cursor-pointer hover:opacity-90 transition-opacity group"
          title="Gerenciar Sincronização e Conta Google"
        >
          <div className="flex items-center gap-3 min-w-0">
            {userProfile?.picture ? (
              <img
                src={userProfile.picture}
                alt={userProfile.name}
                className="w-9 h-9 rounded-full object-cover border border-[#00c2cb] shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-[#1c2230] border border-[#2b354f] text-[#00c2cb] font-black text-sm flex items-center justify-center shrink-0 shadow-sm">
                {userProfile ? userProfile.name.charAt(0).toUpperCase() : '☁️'}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <span className="text-xs sm:text-sm font-bold text-white block truncate leading-snug">
                {userProfile ? userProfile.name : userEmail}
              </span>
              <span className="text-[11px] text-[#00c2cb] font-bold leading-snug block group-hover:underline">
                {userProfile ? '● Google Conectado' : 'Conectar Google Drive'}
              </span>
            </div>
          </div>
          <span className="text-xs text-[#71717a] group-hover:text-white transition-colors">
            ⚙️
          </span>
        </div>
      </aside>

      {/* =========================================================================
          RIGHT MAIN AREA (Table / Setlist View matching Screenshot 2) - Ample Space
      ========================================================================= */}
      <section className="flex-1 p-6 sm:p-9 md:p-10 flex flex-col gap-6 sm:gap-8 overflow-y-auto">
        {/* Setlist Header Box (Artwork + Title + Add Button) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-[#121318] border border-[#232530] rounded-3xl p-6 sm:p-8 shadow-md">
          <div className="flex items-center gap-5 sm:gap-6">
            {/* Folder Artwork Square (Clave de Sol em #00c2cb) */}
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-[#1c2230] border border-[#2b354f] flex items-center justify-center shadow-inner shadow-cyan-950/40 shrink-0">
              <TrebleClefIcon className="w-10 h-10 sm:w-12 sm:h-12" color="#00c2cb" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-snug">
                {currentFolder.name}
              </h2>
              <p className="text-sm text-[#9ca3af] leading-relaxed pt-0.5">
                Por você • {filteredItems.length} {filteredItems.length === 1 ? 'música' : 'músicas'}
              </p>
            </div>
          </div>

          {/* Action Buttons: Sync Drive + "+ Adicionar Música" */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {onTriggerSync && (
              <button
                onClick={onTriggerSync}
                disabled={isSyncing}
                className={`px-5 py-3.5 sm:px-6 sm:py-4 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2.5 transition-all border shadow-sm cursor-pointer disabled:opacity-50 ${
                  userProfile
                    ? 'bg-[#181a24] hover:bg-[#202330] text-[#cbd5e1] hover:text-white border-[#272b38]'
                    : 'bg-[#141d2e] hover:bg-[#1a263c] text-[#00c2cb] hover:text-white border-[#00c2cb]/40 shadow-cyan-950/20'
                }`}
                title={userProfile ? `Sincronizar com ${userProfile.email || userProfile.name}` : "Conectar com o Google Drive"}
              >
                <span className={isSyncing ? "animate-spin text-base" : "text-base"}>
                  {userProfile ? '🔄' : '☁️'}
                </span>
                <span>
                  {isSyncing
                    ? "Sincronizando..."
                    : userProfile
                    ? "Sincronizar Drive"
                    : "Conectar Google Drive"}
                </span>
                {userProfile && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-0.5" title="Google Conectado" />
                )}
              </button>
            )}

            <label className="px-10 py-4 bg-[#00c2cb] hover:bg-[#00adb5] text-black font-black rounded-2xl text-xs sm:text-sm flex items-center justify-center gap-3 cursor-pointer transition-all shadow-md shadow-cyan-900/30 active:scale-95 whitespace-nowrap shrink-0 min-w-[200px]">
              <span className="text-lg font-black">+</span>
              <span className="px-2 font-black">Adicionar Música</span>
              <input
                type="file"
                accept="audio/*,video/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.webm,.mp4,.caf,.wma,.m4v,.mov"
                className="hidden"
                onClick={(e) => {
                  (e.target as HTMLInputElement).value = '';
                }}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    onUploadFile(e.target.files[0], currentFolder.id !== 'all' ? currentFolder.id : undefined);
                  }
                }}
              />
            </label>
          </div>
        </div>

        {/* Sync Status Banner (Clickable to open modal) */}
        {syncStatusLog && (
          <div
            onClick={onOpenSyncModal}
            className="px-5 py-3 rounded-2xl bg-[#14161f] border border-[#272b38] hover:border-[#00c2cb]/40 transition-colors text-xs text-[#9ca3af] flex items-center justify-between gap-3 shadow-inner cursor-pointer"
            title="Clique para ver detalhes da sincronização"
          >
            <div className="flex items-center gap-2.5">
              <span>{isSyncing ? '🔄' : '☁️'}</span>
              <span className="font-medium text-white">{syncStatusLog}</span>
            </div>
            {userProfile && (
              <span className="text-[11px] text-[#00c2cb] font-bold">
                Conta: {userProfile.email || userProfile.name}
              </span>
            )}
          </div>
        )}

        {/* Search bar inside setlist */}
        <div className="relative w-full">
          <input
            type="text"
            placeholder="Buscar por título, artista ou tom..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#121318] border border-[#232530] focus:border-[#00c2cb] rounded-2xl pl-12 pr-6 py-4 text-xs sm:text-sm text-white placeholder-[#71717a] focus:outline-none transition-all font-medium shadow-inner"
          />
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#71717a] pointer-events-none text-base">
            🔍
          </div>
        </div>

        {/* TABLE OF SONGS (Exact columns from Screenshot 2) - Comfortable Row Spacing & Fills Height */}
        <div className="flex-1 min-h-[380px] flex flex-col justify-between rounded-3xl border border-[#232530] bg-[#121318]/60 shadow-lg overflow-hidden">
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[700px] text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-[#232530] bg-[#121318] text-[#9ca3af] font-mono uppercase tracking-wider text-[11px]">
                <th className="py-5 px-6 font-bold w-14"></th>
                <th className="py-5 px-6 font-bold">TÍTULO</th>
                <th className="py-5 px-6 font-bold hidden md:table-cell">DATA</th>
                <th className="py-5 px-6 font-bold hidden lg:table-cell">GÊNERO</th>
                <th className="py-5 px-6 font-bold">BPM</th>
                <th className="py-5 px-6 font-bold">TOM</th>
                <th className="py-5 px-6 font-bold hidden sm:table-cell">DURAÇÃO</th>
                <th className="py-5 px-6 font-bold text-right">AÇÕES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2029]">
              {filteredItems.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => handleOpenSong(item)}
                  className="hover:bg-[#181a24] transition-colors cursor-pointer group"
                  title="Clique para abrir no Ensaio Studio"
                >
                  {/* Waveform / Play Icon */}
                  <td className="py-6 px-6">
                    <div className="w-10 h-10 rounded-2xl bg-[#181a22] group-hover:bg-[#00c2cb] group-hover:text-black text-[#00c2cb] flex items-center justify-center text-sm transition-all shadow-sm">
                      ▶
                    </div>
                  </td>

                  {/* Title & Artist with generous line height and separation */}
                  <td className="py-6 px-6">
                    <div className="min-w-0 max-w-sm space-y-1.5">
                      <h4 className="font-black text-sm sm:text-base text-white group-hover:text-[#00c2cb] transition-colors truncate leading-snug">
                        {item.title}
                      </h4>
                      <p className="text-xs text-[#9ca3af] truncate leading-relaxed block pt-0.5">
                        {item.artist}
                      </p>
                    </div>
                  </td>

                  {/* Date */}
                  <td className="py-6 px-6 text-[#9ca3af] font-mono hidden md:table-cell">
                    {item.date}
                  </td>

                  {/* Genre / Category */}
                  <td className="py-6 px-6 text-[#cbd5e1] hidden lg:table-cell font-medium">
                    {item.genre}
                  </td>

                  {/* BPM */}
                  <td className="py-6 px-6 font-mono font-bold text-white text-sm">
                    {item.bpm}
                  </td>

                  {/* Key (Tom) */}
                  <td className="py-6 px-6 font-black text-sm text-[#00c2cb]">
                    {item.key}
                  </td>

                  {/* Duration */}
                  <td className="py-6 px-6 text-[#9ca3af] font-mono hidden sm:table-cell">
                    {item.duration}
                  </td>

                  {/* Actions (Move, Delete) */}
                  <td className="py-6 px-6 text-right">
                    <div className="flex items-center justify-end gap-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setMovingSong(item)}
                        className="px-8 py-3 bg-[#181a20] hover:bg-[#232530] text-[#cbd5e1] hover:text-white rounded-2xl text-xs sm:text-sm font-bold transition-all border border-[#272b38] shrink-0 min-w-[115px] flex items-center justify-center gap-2.5 cursor-pointer shadow-sm"
                        title="Mover para outra pasta"
                      >
                        <span>📂</span>
                        <span className="px-1.5 font-bold">Mover</span>
                      </button>
                      {onDeleteSong && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingSong({ id: item.id, title: item.title });
                          }}
                          className="w-10 h-10 flex items-center justify-center text-[#71717a] hover:text-rose-400 hover:bg-rose-500/10 rounded-2xl text-sm transition-all shrink-0 cursor-pointer"
                          title="Excluir Música"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {filteredItems.length === 0 ? (
            <div className="text-center py-20 text-[#71717a] text-sm leading-relaxed p-6 flex-1 flex flex-col items-center justify-center">
              <div className="w-14 h-14 rounded-2xl bg-[#1c2230] border border-[#2b354f] flex items-center justify-center mx-auto mb-3 shadow-inner shadow-cyan-950/30">
                <TrebleClefIcon className="w-8 h-8" color="#00c2cb" />
              </div>
              <p>Nenhuma música nesta setlist.</p>
              <p className="text-xs text-[#52525b] mt-1">Clique em "+ Adicionar Música" acima para importar seu áudio.</p>
            </div>
          ) : (
            /* Table Footer with stats and rounded bottom */
            <div className="px-8 py-5 border-t border-[#232530] bg-[#121318] flex flex-wrap items-center justify-between gap-4 text-xs text-[#71717a] rounded-b-3xl mt-auto">
              <span>Exibindo {filteredItems.length} {filteredItems.length === 1 ? 'música' : 'músicas'} no repertório</span>
              <span className="flex items-center gap-2.5 pr-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#00c2cb] animate-pulse"></span>
                <span>Divisão Vocal • Sincronizado</span>
              </span>
            </div>
          )}
        </div>
      </section>

      {/* =========================================================================
          MODAL 1: Nova Pasta / Setlist (Spacious & Clean)
      ========================================================================= */}
      {showFolderModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-6">
          <form
            onSubmit={handleSaveFolder}
            className="bg-[#14161f] border border-[#232530] rounded-3xl p-8 w-full max-w-md shadow-2xl space-y-6"
          >
            <div className="flex items-center gap-4">
              <span className="text-3xl">📁</span>
              <div className="space-y-1">
                <h3 className="text-base font-black text-white">Nova Setlist</h3>
                <p className="text-xs sm:text-sm text-[#9ca3af] leading-relaxed">Crie uma pasta para organizar seus ensaios</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#71717a] uppercase tracking-wider block">
                Nome da Setlist
              </label>
              <input
                type="text"
                placeholder="Ex: Ensaio de Domingo, Coral, Louvor..."
                value={folderNameInput}
                onChange={(e) => setFolderNameInput(e.target.value)}
                className="w-full px-4 py-3 bg-[#181a24] border border-[#232530] rounded-2xl text-xs sm:text-sm text-white focus:outline-none focus:border-[#00c2cb] transition-all"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setShowFolderModal(false)}
                className="px-8 py-3.5 bg-[#181a24] text-[#9ca3af] hover:text-white rounded-2xl text-xs sm:text-sm font-bold transition-all shrink-0 min-w-[125px] flex items-center justify-center cursor-pointer"
              >
                <span>Cancelar</span>
              </button>
              <button
                type="submit"
                className="px-9 py-3.5 bg-[#00c2cb] hover:bg-[#00adb5] text-black font-black rounded-2xl text-xs sm:text-sm shadow-md shadow-cyan-900/30 transition-all cursor-pointer shrink-0 min-w-[125px] flex items-center justify-center"
              >
                <span>Criar</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: Mover Música para Outra Pasta (Spacious & Clean)
      ========================================================================= */}
      {movingSong && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-6">
          <div className="bg-[#14161f] border border-[#232530] rounded-3xl p-8 w-full max-w-md shadow-2xl space-y-6">
            <div className="space-y-1">
              <h3 className="text-base font-black text-white">
                Mover "{movingSong.title}"
              </h3>
              <p className="text-xs sm:text-sm text-[#9ca3af] leading-relaxed">Escolha a setlist de destino:</p>
            </div>

            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={async () => {
                    if (onMoveSongCategory && movingSong.id) {
                      await onMoveSongCategory(movingSong.id, c.id, movingSong.title);
                    }
                    if (movingSong.originalItem) {
                      movingSong.originalItem.category = c.id;
                    }
                    setMovingSong(null);
                  }}
                  className="w-full p-4 rounded-2xl bg-[#181a24] hover:bg-[#1c2230] text-xs sm:text-sm font-bold text-white flex items-center justify-between text-left transition-all border border-[#232530] cursor-pointer"
                >
                  <span>📁 {c.name}</span>
                  <span className="text-xs text-[#00c2cb] font-bold">Selecionar</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => setMovingSong(null)}
              className="w-full py-4 px-8 bg-[#181a24] text-[#9ca3af] hover:text-white rounded-2xl text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center justify-center"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: Confirmação de Exclusão de Música (Sem window.confirm travando a tela)
      ========================================================================= */}
      {deletingSong && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-[#14161f] border border-[#232530] rounded-3xl p-8 w-full max-w-md shadow-2xl space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-2xl text-rose-400 shrink-0">
                🗑️
              </div>
              <div>
                <h3 className="text-base font-black text-white">Excluir Música</h3>
                <p className="text-xs text-[#9ca3af]">Esta ação removerá o áudio e as vozes geradas.</p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-[#cbd5e1] leading-relaxed">
              Deseja realmente remover <strong className="text-white">"{deletingSong.title}"</strong> do repertório?
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingSong(null)}
                className="px-6 py-3.5 bg-[#181a24] hover:bg-[#20222a] text-[#9ca3af] hover:text-white rounded-2xl text-xs sm:text-sm font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = deletingSong;
                  setDeletingSong(null);
                  if (onDeleteSong && target) {
                    await onDeleteSong(target.id, target.title);
                  }
                }}
                className="px-6 py-3.5 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-2xl text-xs sm:text-sm shadow-md shadow-rose-900/30 transition-all cursor-pointer"
              >
                Excluir Definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MoisesRepertoireView;
