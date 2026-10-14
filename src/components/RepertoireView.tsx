import React, { useState } from 'react';
import { RepertoireCategory, RepertoireSong, OfflineAudioRecord } from '../hooks/useIndexedDBSync';
import { TrebleClefIcon } from './TrebleClefIcon';

interface RepertoireViewProps {
  categories: RepertoireCategory[];
  songs: RepertoireSong[];
  offlineAudios: OfflineAudioRecord[];
  onAddCategory: (name: string) => Promise<void>;
  onSelectSongToMixer: (songTitle: string, audioBlobName?: string) => void;
  onUploadFile: (file: File) => void;
}

export const RepertoireView: React.FC<RepertoireViewProps> = ({
  categories,
  songs,
  offlineAudios,
  onAddCategory,
  onSelectSongToMixer,
  onUploadFile
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [newCatName, setNewCatName] = useState<string>('');
  const [showCatModal, setShowCatModal] = useState<boolean>(false);

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    await onAddCategory(newCatName.trim());
    setNewCatName('');
    setShowCatModal(false);
  };

  const filteredSongs =
    activeCategory === 'all'
      ? songs
      : songs.filter((s) => s.category.toLowerCase() === activeCategory.toLowerCase());

  return (
    <div className="repertoire-container bg-[#121212] text-white p-6 rounded-3xl border border-[#2e2e2e] shadow-2xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#2e2e2e]">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-3">
            <span>📚</span> Meu Repertório
          </h1>
          <p className="text-xs text-[#a3a3a3] mt-1 font-medium">
            Gerencie suas músicas por categoria e abra diretamente no Mixer do Treino Vocal
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCatModal(true)}
            className="px-4 py-2.5 bg-[#1e1e1e] hover:bg-[#262626] text-white border border-[#2e2e2e] rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer"
          >
            ➕ Nova Pasta
          </button>
          <label className="px-4 py-2.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-blue-600/30 cursor-pointer flex items-center gap-2">
            📤 Importar Áudio / Vídeo
            <input
              type="file"
              accept="audio/*,video/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  onUploadFile(e.target.files[0]);
                }
              }}
            />
          </label>
        </div>
      </div>

      {/* Category Folders Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
        <button
          onClick={() => setActiveCategory('all')}
          className={`p-4 rounded-2xl text-xs font-bold transition-all text-left flex items-center justify-between border cursor-pointer ${
            activeCategory === 'all'
              ? 'bg-[#1e1e1e] border-[#2563eb] text-white ring-2 ring-[#2563eb]/30'
              : 'bg-[#121212] border-[#2e2e2e] text-[#a3a3a3] hover:border-[#404040] hover:text-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">📂</span>
            <span>Todas as Pastas</span>
          </div>
          <span className="text-xs font-mono font-bold px-2 py-0.5 bg-[#1e1e1e] rounded text-[#3b82f6]">
            {songs.length + offlineAudios.length}
          </span>
        </button>

        {categories.map((cat) => {
          const count = songs.filter((s) => s.category.toLowerCase() === cat.id.toLowerCase()).length;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`p-4 rounded-2xl text-xs font-bold transition-all text-left flex items-center justify-between border cursor-pointer ${
                activeCategory === cat.id
                  ? 'bg-[#1e1e1e] border-[#2563eb] text-white ring-2 ring-[#2563eb]/30'
                  : 'bg-[#121212] border-[#2e2e2e] text-[#a3a3a3] hover:border-[#404040] hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{cat.icon || '📁'}</span>
                <span>{cat.name}</span>
              </div>
              <span className="text-xs font-mono font-bold px-2 py-0.5 bg-[#1e1e1e] rounded text-[#a3a3a3]">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Repertoire Song Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Offline Audios */}
        {offlineAudios
          .filter((item) => item.type === 'original')
          .map((item) => (
            <div
              key={item.id}
              className="bg-[#121212] border border-[#2e2e2e] hover:border-[#2563eb] p-5 rounded-2xl transition-all shadow-md flex flex-col justify-between group"
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#1e1e1e] border border-[#2e2e2e] text-[#2563eb] flex items-center justify-center font-bold text-lg">
                    <TrebleClefIcon className="w-6 h-6" color="#2563eb" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white group-hover:text-[#3b82f6] transition-colors line-clamp-1">
                      {item.name}
                    </h3>
                    <span className="text-[10px] font-semibold text-[#a3a3a3] uppercase tracking-wider block mt-0.5">
                      Salvo Offline no IndexedDB
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-[#2e2e2e]">
                <span className="text-[11px] font-medium text-[#737373]">
                  {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                </span>
                <button
                  onClick={() => onSelectSongToMixer(item.name, item.name)}
                  className="px-4 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-600/20 active:scale-95 flex items-center gap-2 cursor-pointer"
                >
                  🎛️ Abrir no Mixer
                </button>
              </div>
            </div>
          ))}

        {/* Custom Songs */}
        {filteredSongs.map((song) => (
          <div
            key={song.id}
            className="bg-[#121212] border border-[#2e2e2e] hover:border-[#2563eb] p-5 rounded-2xl transition-all shadow-md flex flex-col justify-between group"
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#1e1e1e] border border-[#2e2e2e] text-[#2563eb] flex items-center justify-center font-bold text-lg">
                  <TrebleClefIcon className="w-6 h-6" color="#2563eb" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white group-hover:text-[#3b82f6] transition-colors line-clamp-1">
                    {song.title}
                  </h3>
                  <span className="text-[10px] font-semibold text-[#a3a3a3] uppercase tracking-wider block mt-0.5">
                    Categoria: {song.category}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[#2e2e2e]">
              <span className="text-[11px] font-medium text-[#737373]">
                {new Date(song.createdAt).toLocaleDateString('pt-BR')}
              </span>
              <button
                onClick={() => onSelectSongToMixer(song.title, song.fileName)}
                className="px-4 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-600/20 active:scale-95 flex items-center gap-2 cursor-pointer"
              >
                🎛️ Abrir no Mixer
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* New Category Modal */}
      {showCatModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateCategory}
            className="bg-[#121212] border border-[#2e2e2e] rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-5"
          >
            <h3 className="text-lg font-bold text-white mb-2">📁 Criar Nova Pasta no Repertório</h3>
            <p className="text-xs text-[#a3a3a3]">
              Organize seus exercícios de afinação e apresentações no Treino Vocal.
            </p>

            <input
              type="text"
              placeholder="Ex: Exercícios Diários, Apresentação Coral..."
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              className="w-full px-4 py-3 bg-[#1e1e1e] border border-[#2e2e2e] rounded-xl text-sm text-white focus:outline-none focus:border-[#2563eb]"
              autoFocus
            />

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCatModal(false)}
                className="px-4 py-2.5 bg-[#1e1e1e] hover:bg-[#262626] text-[#a3a3a3] hover:text-white rounded-xl text-xs font-bold border border-[#2e2e2e] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/30 cursor-pointer"
              >
                Criar Pasta
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default RepertoireView;
