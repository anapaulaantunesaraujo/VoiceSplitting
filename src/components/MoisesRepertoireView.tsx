import React, { useState, useRef, useEffect } from 'react';
import * as Tone from 'tone';
import { RepertoireCategory, RepertoireSong, OfflineAudioRecord } from '../hooks/useIndexedDBSync';

interface MoisesRepertoireViewProps {
  categories: RepertoireCategory[];
  songs: RepertoireSong[];
  offlineAudios: OfflineAudioRecord[];
  onAddCategory: (name: string) => Promise<void>;
  onRenameCategory?: (catId: string, newName: string) => Promise<void>;
  onDeleteCategory?: (catId: string) => Promise<void>;
  onSelectSongToMixer: (songTitle: string, itemRecord?: any) => void;
  onUploadFile: (file: File, targetCategory?: string) => void;
}

export const MoisesRepertoireView: React.FC<MoisesRepertoireViewProps> = ({
  categories,
  songs,
  offlineAudios,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  onSelectSongToMixer,
  onUploadFile
}) => {
  // Windows Explorer Style Navigation State:
  // null = Root Repertoire directory
  // catId = Inside specific folder
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Dynamic Header Height measurement ref & state
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState<number>(0);

  useEffect(() => {
    if (!headerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === headerRef.current) {
          setHeaderHeight(entry.target.clientHeight);
        }
      }
    });
    observer.observe(headerRef.current);
    setHeaderHeight(headerRef.current.clientHeight);
    return () => observer.disconnect();
  }, []);

  // Folder Modal state
  const [showFolderModal, setShowFolderModal] = useState<boolean>(false);
  const [folderNameInput, setFolderNameInput] = useState<string>('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);

  // Helper to parse artist and title from song name ("Artist - Song" or fallback)
  const parseArtistAndTitle = (title: string, defaultSubtitle: string) => {
    if (title.includes(' - ')) {
      const parts = title.split(' - ');
      return { artist: parts[0].trim(), songName: parts.slice(1).join(' - ').trim() };
    }
    return { artist: defaultSubtitle || 'Artista Desconhecido', songName: title };
  };

  // Combine offline audios and song records
  const allItems = [
    ...offlineAudios
      .filter((item) => item.type === 'original')
      .map((item) => {
        const { artist, songName } = parseArtistAndTitle(item.name, 'Áudio Salvo no Dispositivo');
        return {
          id: item.id,
          title: songName,
          artist: artist,
          subtitle: 'Salvo Offline no IndexedDB',
          date: new Date(item.createdAt).toLocaleDateString('pt-BR'),
          category: item.category || 'exercicios',
          synced: item.syncedToDrive,
          originalItem: item
        };
      }),
    ...songs.map((song) => {
      const { artist, songName } = parseArtistAndTitle(song.title, `Categoria: ${song.category}`);
      return {
        id: song.id,
        title: songName,
        artist: artist,
        subtitle: `Categoria: ${song.category}`,
        date: new Date(song.createdAt).toLocaleDateString('pt-BR'),
        category: song.category,
        synced: true,
        originalItem: song
      };
    })
  ];

  // Active folder entity if inside a folder
  const currentFolder = categories.find((c) => c.id === currentFolderId);

  // Filter items according to current folder & search query
  const filteredItems = allItems.filter((item) => {
    const matchesFolder = currentFolderId === null || item.category.toLowerCase() === currentFolderId.toLowerCase();
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.artist.toLowerCase().includes(searchQuery.toLowerCase());
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
      if (Tone.context.state !== 'running') {
        await Tone.start();
      }
    } catch (e) {
      // ignore
    }
    onSelectSongToMixer(item.title, item.originalItem);
  };

  return (
    <div className="explorer-repertoire-wrapper text-white space-y-16 sm:space-y-20 font-sans mt-8 sm:mt-10">
      {/* Empty div ABOVE with the exact same height as the header div and app background color */}
      <div
        className="w-full bg-[#000000] rounded-2xl transition-all"
        style={{ height: headerHeight ? `${headerHeight}px` : 'auto' }}
      />

      {/* 1. SINGLE TITLE HEADER: Home / Repertório (Windows Explorer Dark Address Bar) */}
      <div
        ref={headerRef}
        className="w-full bg-[#121212] border border-[#2e2e2e] rounded-2xl p-8 sm:p-10 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-6"
      >
        {/* Title & Path Breadcrumb Bar - Smaller Elegant Title Font Size */}
        <div className="flex items-center gap-5">
          {currentFolderId !== null && (
            <button
              onClick={() => setCurrentFolderId(null)}
              className="px-6 py-3 bg-[#1e1e1e] hover:bg-[#262626] text-white rounded-xl text-xs sm:text-sm font-extrabold transition-all border border-[#2e2e2e] flex items-center gap-2 cursor-pointer shadow-md min-w-[110px] justify-center"
              title="Voltar para a pasta raiz"
            >
              <span>◀</span> Voltar
            </button>
          )}
          <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <span className="text-base sm:text-lg">🏠</span>
            <span className="hover:text-[#3b82f6] cursor-pointer transition-colors" onClick={() => setCurrentFolderId(null)}>
              Home / Repertório
            </span>
            {currentFolder && (
              <span className="text-[#3b82f6] flex items-center gap-2 font-bold text-base sm:text-lg">
                <span>/</span> 📁 {currentFolder.name}
              </span>
            )}
          </h1>
        </div>

        {/* Windows Explorer Toolbar Actions - Wide Buttons with Generous Proportions */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Pill-shaped Search Input matching reference image */}
          <div className="relative flex items-center">
            <input
              type="text"
              placeholder="Buscar música ou cantor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-72 sm:w-[380px] md:w-[460px] bg-[#262626] border border-[#383838] focus:border-[#3b82f6] rounded-full px-12 py-3.5 text-xs sm:text-sm text-white placeholder-[#a3a3a3] text-center focus:outline-none transition-all shadow-inner font-semibold"
            />
            <div className="absolute right-6 top-1/2 -translate-y-1/2 text-[#a3a3a3] pointer-events-none flex items-center">
              <svg
                className="w-4 h-4 sm:w-5 sm:h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-4.35-4.35m1.35-5.65a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>

          {/* View Mode Switcher (Grid / List) - Generous Padding */}
          <div className="flex items-center bg-[#0a0a0a] border border-[#2e2e2e] rounded-2xl p-2 gap-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-7 py-3 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer flex items-center gap-2 ${
                viewMode === 'grid' ? 'bg-[#2563eb] text-white shadow-md' : 'text-[#a3a3a3] hover:text-white'
              }`}
              title="Visualização em Ícones (Grade)"
            >
              🔲 Grade
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-7 py-3 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer flex items-center gap-2 ${
                viewMode === 'list' ? 'bg-[#2563eb] text-white shadow-md' : 'text-[#a3a3a3] hover:text-white'
              }`}
              title="Visualização em Lista Detalhada"
            >
              ☰ Lista
            </button>
          </div>

          {/* New Folder Button */}
          {currentFolderId === null && (
            <button
              onClick={() => handleOpenFolderModal()}
              className="px-8 py-3.5 bg-[#1e1e1e] hover:bg-[#262626] text-white border border-[#2e2e2e] rounded-2xl text-xs sm:text-sm font-extrabold transition-all flex items-center gap-2.5 cursor-pointer shadow-md whitespace-nowrap min-w-[160px] justify-center"
            >
              <span>📁</span> Nova Pasta
            </button>
          )}

          {/* Upload Button */}
          <label className="px-9 py-3.5 bg-[#2563eb] hover:bg-[#1d4ed8] active:bg-[#1e40af] text-white rounded-2xl text-xs sm:text-sm font-extrabold shadow-lg shadow-blue-600/30 cursor-pointer transition-all flex items-center gap-2.5 shrink-0 whitespace-nowrap min-w-[190px] justify-center">
            <span>➕</span> Importar Áudio
            <input
              type="file"
              accept="audio/*,video/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  onUploadFile(e.target.files[0], currentFolderId || undefined);
                }
              }}
            />
          </label>
        </div>
      </div>

      {/* Empty div BELOW with the exact same height as the header div and app background color */}
      <div
        className="w-full bg-[#000000] rounded-2xl transition-all"
        style={{ height: headerHeight ? `${headerHeight}px` : 'auto' }}
      />

      {/* 2. WINDOWS FILE EXPLORER MAIN CONTAINER (Doubled Vertical Layout Spacing) */}
      <div className="w-full bg-[#0a0a0a] border border-[#2e2e2e] rounded-3xl p-10 sm:p-16 min-h-[640px] shadow-2xl space-y-16 sm:space-y-20">
        {/* GRID VIEW (Windows Explorer Icons) */}
        {viewMode === 'grid' && (
          <div className="space-y-8">
            {/* Folder Icons Grid (Root Level Only) */}
            {currentFolderId === null && categories.length > 0 && (
              <div className="space-y-4">
                <span className="text-xs font-mono font-extrabold text-[#737373] uppercase tracking-wider block">
                  Pastas ({categories.length})
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                  {categories.map((cat) => {
                    const count = allItems.filter(
                      (item) => item.category.toLowerCase() === cat.id.toLowerCase()
                    ).length;

                    return (
                      <div
                        key={cat.id}
                        onClick={() => setCurrentFolderId(cat.id)}
                        className="explorer-folder-item group bg-[#121212] hover:bg-[#1e1e1e] border border-[#2e2e2e] hover:border-[#2563eb] p-4 sm:p-5 rounded-2xl transition-all flex flex-col justify-between items-center text-center cursor-pointer relative shadow-sm h-[215px]"
                      >
                        {/* Quick Action Overlay (Rename / Delete) */}
                        <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-[#0a0a0a]/90 p-1 rounded-lg border border-[#2e2e2e] z-10">
                          {onRenameCategory && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenFolderModal(cat.id, cat.name);
                              }}
                              className="text-xs hover:text-white text-[#a3a3a3] p-1"
                              title="Renomear Pasta"
                            >
                              ✏️
                            </button>
                          )}
                          {onDeleteCategory && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`Deseja excluir a pasta "${cat.name}"?`)) {
                                  onDeleteCategory(cat.id);
                                }
                              }}
                              className="text-xs hover:text-rose-400 text-[#a3a3a3] p-1"
                              title="Excluir Pasta"
                            >
                              🗑️
                            </button>
                          )}
                        </div>

                        {/* Folder Icon */}
                        <div className="w-14 h-14 flex items-center justify-center text-5xl mb-1 group-hover:scale-105 transition-transform">
                          📁
                        </div>

                        {/* Title & Subtitle */}
                        <div className="w-full flex flex-col items-center px-1">
                          <span className="text-sm font-extrabold text-white truncate w-full group-hover:text-[#3b82f6] transition-colors">
                            {cat.name}
                          </span>
                          <span className="text-xs text-[#737373] font-mono mt-0.5">
                            {count} {count === 1 ? 'música' : 'músicas'}
                          </span>
                        </div>

                        {/* Metadata line */}
                        <div className="flex items-center justify-between w-full text-[10px] text-[#737373] font-mono px-1">
                          <span>Repertório</span>
                          <span className="text-[#3b82f6] font-semibold">Diretório</span>
                        </div>

                        {/* Action Pill */}
                        <div className="w-full py-2 bg-[#1a1a1a] group-hover:bg-[#2563eb] text-[#a3a3a3] group-hover:text-white rounded-xl text-xs font-bold text-center border border-[#2e2e2e] group-hover:border-[#2563eb] transition-all flex items-center justify-center gap-1.5">
                          <span>📁</span> Abrir Pasta
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Audio Files Grid */}
            <div className="space-y-4">
              <span className="text-xs font-mono font-extrabold text-[#737373] uppercase tracking-wider block">
                Arquivos de Áudio ({filteredItems.length})
              </span>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                {filteredItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleOpenSong(item)}
                    className="explorer-file-item group bg-[#121212] hover:bg-[#1e1e1e] border border-[#2e2e2e] hover:border-[#2563eb] p-4 sm:p-5 rounded-2xl transition-all flex flex-col justify-between items-center text-center shadow-sm h-[215px] relative cursor-pointer"
                    title={`Clique para abrir "${item.title}" no Mixer`}
                  >
                    {/* Audio Icon */}
                    <div className="w-14 h-14 rounded-2xl bg-[#1e1e1e] border border-[#2e2e2e] flex items-center justify-center text-3xl mb-1 group-hover:scale-105 transition-transform text-[#2563eb]">
                      🎵
                    </div>

                    {/* Title & Artist */}
                    <div className="w-full flex flex-col items-center px-1">
                      <h4 className="text-sm font-extrabold text-white group-hover:text-[#3b82f6] transition-colors truncate w-full" title={item.title}>
                        {item.title}
                      </h4>
                      <p className="text-xs text-[#a3a3a3] truncate w-full mt-0.5 font-medium" title={item.artist}>
                        🎤 {item.artist}
                      </p>
                    </div>

                    {/* Metadata line (Date & Sync Status) */}
                    <div className="flex items-center justify-between w-full text-[10px] text-[#737373] font-mono px-1">
                      <span>{item.date}</span>
                      <span className={item.synced ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                        {item.synced ? '☁️ Salvo' : '⏳ Local'}
                      </span>
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenSong(item);
                      }}
                      className="w-full py-2 bg-[#2563eb] hover:bg-[#1d4ed8] active:bg-[#1e40af] text-white font-extrabold rounded-xl text-xs shadow-md shadow-blue-600/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer transform active:scale-95"
                    >
                      <span>🎛️</span> Abrir no Mixer
                    </button>
                  </div>
                ))}
              </div>

              {filteredItems.length === 0 && (
                <div className="text-center py-16 text-[#737373] text-xs">
                  Nenhum arquivo de áudio encontrado nesta pasta.
                </div>
              )}
            </div>
          </div>
        )}

        {/* LIST VIEW (Windows Explorer Detailed File List Table - Doubled Row Heights) */}
        {viewMode === 'list' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-[#2e2e2e] text-[#a3a3a3] font-mono text-xs uppercase tracking-wider">
                  <th className="py-8 px-8 font-black">Nome do Arquivo</th>
                  <th className="py-8 px-8 font-black">Artista / Categoria</th>
                  <th className="py-8 px-8 font-black">Data</th>
                  <th className="py-8 px-8 font-black">Status</th>
                  <th className="py-8 px-8 font-black text-right w-64">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-[#2e2e2e]/50">
                {/* Folders in List View */}
                {currentFolderId === null &&
                  categories.map((cat) => (
                    <tr
                      key={cat.id}
                      onClick={() => setCurrentFolderId(cat.id)}
                      className="hover:bg-[#121212] transition-colors cursor-pointer group"
                    >
                      <td className="py-10 px-8 flex items-center gap-4 font-black text-white text-base group-hover:text-[#3b82f6]">
                        <span className="text-2xl">📁</span> {cat.name}
                      </td>
                      <td className="py-10 px-8 text-[#a3a3a3] font-medium text-sm">Pasta de Estudo</td>
                      <td className="py-10 px-8 text-[#737373] font-mono text-xs">--</td>
                      <td className="py-10 px-8 text-[#737373] font-bold text-xs">Pasta</td>
                      <td className="py-10 px-8 text-right">
                        <span className="text-xs text-[#3b82f6] font-black uppercase tracking-wider">Abrir ➔</span>
                      </td>
                    </tr>
                  ))}

                {/* Files in List View - Clicking filename or entire row opens the mixer directly */}
                {filteredItems.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => handleOpenSong(item)}
                    className="hover:bg-[#181818] transition-colors group cursor-pointer"
                    title={`Clique para abrir "${item.title}" no Mixer`}
                  >
                    <td className="py-10 px-8 font-black text-white text-base group-hover:text-[#3b82f6]">
                      <div className="flex items-center gap-4">
                        <span className="text-xl text-[#2563eb] group-hover:scale-110 transition-transform">🎵</span>
                        <span className="truncate max-w-sm sm:max-w-md group-hover:underline underline-offset-4 decoration-2 decoration-[#3b82f6]">
                          {item.title}
                        </span>
                      </div>
                    </td>
                    <td className="py-10 px-8 text-[#a3a3a3] font-semibold text-sm">{item.artist}</td>
                    <td className="py-10 px-8 text-[#737373] font-mono text-xs">{item.date}</td>
                    <td className="py-10 px-8">
                      <span className={item.synced ? 'text-emerald-400 font-bold text-xs' : 'text-amber-400 font-bold text-xs'}>
                        {item.synced ? '☁️ Salvo' : '⏳ Local'}
                      </span>
                    </td>
                    <td className="py-10 px-8 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenSong(item);
                        }}
                        className="px-8 py-4 bg-[#2563eb] hover:bg-[#1d4ed8] active:bg-[#1e40af] text-white font-black rounded-xl text-xs sm:text-sm shadow-lg shadow-blue-600/30 transition-all inline-flex items-center justify-center gap-2.5 cursor-pointer whitespace-nowrap min-w-[170px]"
                      >
                        <span>🎛️</span> Abrir no Mixer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredItems.length === 0 && (
              <div className="text-center py-16 text-[#737373] text-xs">
                Nenhum item encontrado nesta pasta.
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. New Folder / Rename Modal */}
      {showFolderModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveFolder}
            className="bg-[#121212] border border-[#2e2e2e] rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#1e1e1e] border border-[#2e2e2e] flex items-center justify-center text-xl text-[#2563eb]">
                📁
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {editingCatId ? 'Renomear Pasta' : 'Criar Nova Pasta'}
                </h3>
                <p className="text-xs text-[#a3a3a3]">Windows File Explorer - Treino Vocal</p>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-[#a3a3a3] uppercase tracking-wider block mb-2">
                Nome da Pasta
              </label>
              <input
                type="text"
                placeholder="Ex: Coral, Ensaios, Soprano, Apresentação..."
                value={folderNameInput}
                onChange={(e) => setFolderNameInput(e.target.value)}
                className="w-full px-4 py-3 bg-[#1e1e1e] border border-[#2e2e2e] rounded-xl text-xs text-white focus:outline-none focus:border-[#2563eb] transition-all"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowFolderModal(false);
                  setEditingCatId(null);
                }}
                className="px-4 py-2.5 bg-[#1e1e1e] hover:bg-[#262626] text-[#a3a3a3] hover:text-white rounded-xl text-xs font-bold transition-all border border-[#2e2e2e] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-xl text-xs font-extrabold shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
              >
                {editingCatId ? 'Salvar Alterações' : 'Criar Pasta'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default MoisesRepertoireView;

