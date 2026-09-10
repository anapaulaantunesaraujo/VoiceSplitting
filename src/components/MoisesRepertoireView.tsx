import React, { useState } from 'react';
import { RepertoireCategory, RepertoireSong, OfflineAudioRecord } from '../hooks/useIndexedDBSync';

interface MoisesRepertoireViewProps {
  categories: RepertoireCategory[];
  songs: RepertoireSong[];
  offlineAudios: OfflineAudioRecord[];
  onAddCategory: (name: string) => Promise<void>;
  onSelectSongToMixer: (songTitle: string, audioBlobName?: string) => void;
  onUploadFile: (file: File) => void;
}

export const MoisesRepertoireView: React.FC<MoisesRepertoireViewProps> = ({
  categories,
  songs,
  offlineAudios,
  onSelectSongToMixer,
  onUploadFile
}) => {
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Combine offline audios and song records
  const allItems = [
    ...offlineAudios
      .filter((item) => item.type === 'original')
      .map((item) => ({
        id: item.id,
        title: item.name,
        subtitle: 'Áudio Salvo Offline no IndexedDB',
        date: new Date(item.createdAt).toLocaleDateString('pt-BR'),
        category: 'exercicios',
        synced: item.syncedToDrive,
        originalItem: item
      })),
    ...songs.map((song) => ({
      id: song.id,
      title: song.title,
      subtitle: `Categoria: ${song.category}`,
      date: new Date(song.createdAt).toLocaleDateString('pt-BR'),
      category: song.category,
      synced: true,
      originalItem: song
    }))
  ];

  const filteredItems = allItems.filter((item) => {
    const matchesFilter = activeFilter === 'all' || item.category.toLowerCase() === activeFilter.toLowerCase();
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="moises-repertoire-wrapper text-slate-100 min-h-screen">
      {/* Top Bar Filter Pills & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        {/* Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
              activeFilter === 'all'
                ? 'bg-white text-black shadow-lg shadow-white/10'
                : 'bg-[#222226] text-slate-400 hover:bg-[#2c2c30] hover:text-white border border-slate-800'
            }`}
          >
            Todos os Arquivos
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveFilter(cat.id)}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                activeFilter === cat.id
                  ? 'bg-white text-black shadow-lg shadow-white/10'
                  : 'bg-[#222226] text-slate-400 hover:bg-[#2c2c30] hover:text-white border border-slate-800'
              }`}
            >
              {cat.icon || '📁'} {cat.name}
            </button>
          ))}
        </div>

        {/* Search & Upload Action */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              type="text"
              placeholder="Pesquisar áudio ou treino..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-56 md:w-64 bg-[#1c1c20] border border-slate-800 rounded-full px-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all"
            />
          </div>

          <label className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full text-xs font-bold shadow-lg shadow-indigo-600/30 cursor-pointer transition-all flex items-center gap-2 shrink-0">
            <span>➕</span> Importar Arquivo
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

      {/* Moises.ai Style Song Cards Grid / Table Header */}
      <div className="bg-[#16161a] border border-slate-800/80 rounded-3xl overflow-hidden shadow-2xl">
        <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-slate-800/60 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          <div className="col-span-6 md:col-span-5">Título</div>
          <div className="col-span-3 hidden md:block">Adicionado em</div>
          <div className="col-span-3 hidden md:block">Status</div>
          <div className="col-span-6 md:col-span-1 text-right">Ação</div>
        </div>

        {/* List Items */}
        <div className="divide-y divide-slate-800/40">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-[#1f1f24] transition-all group"
            >
              {/* Title & Cover Avatar */}
              <div className="col-span-6 md:col-span-5 flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-900 to-slate-900 border border-indigo-700/40 text-indigo-400 flex items-center justify-center font-bold text-lg shadow-md shrink-0 group-hover:scale-105 transition-transform">
                  🎵
                </div>
                <div className="truncate">
                  <h3 className="text-sm font-bold text-white group-hover:text-indigo-400 transition-colors truncate">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium truncate">{item.subtitle}</p>
                </div>
              </div>

              {/* Date */}
              <div className="col-span-3 hidden md:block text-xs font-semibold text-slate-400">
                {item.date}
              </div>

              {/* Status Badge */}
              <div className="col-span-3 hidden md:block">
                <span
                  className={`text-[10px] font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1.5 ${
                    item.synced
                      ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/50'
                      : 'bg-amber-950/80 text-amber-400 border border-amber-800/50'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${item.synced ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  {item.synced ? '☁️ Sincronizado' : '⏳ Pendente'}
                </span>
              </div>

              {/* Action Button: Abrir na Mesa de Som */}
              <div className="col-span-6 md:col-span-4 lg:col-span-1 text-right">
                <button
                  onClick={() => onSelectSongToMixer(item.title, item.title)}
                  className="px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/40 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 whitespace-nowrap"
                >
                  🎛️ Studio Mixer
                </button>
              </div>
            </div>
          ))}

          {filteredItems.length === 0 && (
            <div className="text-center py-20">
              <div className="text-4xl mb-3">📂</div>
              <h3 className="text-base font-bold text-slate-300">Nenhum treino no repertório</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                Faça o upload de uma gravação de tela ou MP3 para separar as vozes e salvar offline.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
