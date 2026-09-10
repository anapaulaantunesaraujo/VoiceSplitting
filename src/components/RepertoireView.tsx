import React, { useState } from 'react';
import { RepertoireCategory, RepertoireSong, OfflineAudioRecord } from '../hooks/useIndexedDBSync';

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
    <div className="repertoire-container bg-[#1a1a1a] text-slate-100 p-6 rounded-3xl border border-slate-800 shadow-2xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <span>📚</span> Meu Repertório
          </h1>
          <p className="text-xs text-slate-400 mt-1 font-medium">
            Gerencie suas músicas por categoria e abra diretamente na Mesa de Som (Mixer DAW)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCatModal(true)}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2"
          >
            ➕ Nova Pasta
          </button>
          <label className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center gap-2">
            📤 Importar Música / Vídeo
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

      {/* Category Folders Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-6 scrollbar-none">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
            activeCategory === 'all'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'bg-slate-800/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-700/50'
          }`}
        >
          <span>📂</span> Todos os Treinos ({songs.length + offlineAudios.length})
        </button>

        {categories.map((cat) => {
          const count = songs.filter((s) => s.category.toLowerCase() === cat.id.toLowerCase()).length;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
                activeCategory === cat.id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'bg-slate-800/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-700/50'
              }`}
            >
              <span>{cat.icon || '📁'}</span> {cat.name} ({count})
            </button>
          );
        })}
      </div>

      {/* Repertoire Song Cards List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Render Offline Audios saved in IndexedDB */}
        {offlineAudios
          .filter((item) => item.type === 'original')
          .map((item) => (
            <div
              key={item.id}
              className="bg-slate-900/90 border border-slate-800 hover:border-indigo-500/50 p-5 rounded-2xl transition-all shadow-md flex flex-col justify-between group"
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-950/60 border border-indigo-800/50 text-indigo-400 flex items-center justify-center font-bold text-lg">
                    🎵
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 group-hover:text-indigo-400 transition-colors line-clamp-1">
                      {item.name}
                    </h3>
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                      Salvo Offline no IndexedDB
                    </span>
                  </div>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    item.syncedToDrive
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50'
                      : 'bg-amber-950 text-amber-400 border border-amber-800/50'
                  }`}
                >
                  {item.syncedToDrive ? '☁️ Sincronizado' : '⏳ Pendente'}
                </span>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-800/60">
                <span className="text-[11px] font-medium text-slate-500">
                  {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                </span>
                <button
                  onClick={() => onSelectSongToMixer(item.name, item.name)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/20 active:scale-95 flex items-center gap-2"
                >
                  🎛️ Abrir na Mesa de Som
                </button>
              </div>
            </div>
          ))}

        {/* Custom Created Songs */}
        {filteredSongs.map((song) => (
          <div
            key={song.id}
            className="bg-slate-900/90 border border-slate-800 hover:border-indigo-500/50 p-5 rounded-2xl transition-all shadow-md flex flex-col justify-between group"
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-950/60 border border-purple-800/50 text-purple-400 flex items-center justify-center font-bold text-lg">
                  🎶
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100 group-hover:text-purple-400 transition-colors line-clamp-1">
                    {song.title}
                  </h3>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    Categoria: {song.category}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800/60">
              <span className="text-[11px] font-medium text-slate-500">
                {new Date(song.createdAt).toLocaleDateString('pt-BR')}
              </span>
              <button
                onClick={() => onSelectSongToMixer(song.title, song.fileName)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/20 active:scale-95 flex items-center gap-2"
              >
                🎛️ Abrir na Mesa de Som
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {songs.length === 0 && offlineAudios.length === 0 && (
        <div className="text-center py-16 bg-slate-900/40 rounded-2xl border border-slate-800/60 my-4">
          <div className="text-4xl mb-3">📁</div>
          <h3 className="text-base font-bold text-slate-300">Nenhuma música no repertório ainda</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-6">
            Faça upload de um arquivo MP3 ou vídeo de treino para ter os áudios e vozes salvos localmente.
          </p>
        </div>
      )}

      {/* New Category Modal */}
      {showCatModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateCategory}
            className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-md shadow-2xl"
          >
            <h3 className="text-lg font-bold text-white mb-2">📁 Criar Nova Pasta no Repertório</h3>
            <p className="text-xs text-slate-400 mb-6">
              Organize seus exercícios de afinação e apresentações em categorias customizadas.
            </p>

            <input
              type="text"
              placeholder="Ex: Exercícios Diários, Apresentação Coral..."
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500 mb-6"
              autoFocus
            />

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCatModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold"
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
