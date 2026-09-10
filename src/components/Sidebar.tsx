import React from 'react';
import { UserProfile } from './GoogleLoginButton';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  activeTab: 'home' | 'repertoire' | 'mixer' | 'exercises';
  onSelectTab: (tab: 'home' | 'repertoire' | 'mixer' | 'exercises') => void;
  userProfile: UserProfile | null;
  onLoginClick: () => void;
  onLogoutClick: () => void;
  categories: { id: string; name: string; icon?: string }[];
  selectedCategory: string;
  onSelectCategory: (catId: string) => void;
  onNewCategoryClick: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onToggle,
  activeTab,
  onSelectTab,
  userProfile,
  onLogoutClick,
  categories,
  selectedCategory,
  onSelectCategory,
  onNewCategoryClick
}) => {
  return (
    <aside
      className={`sidebar-container bg-[#0f0f12] text-slate-300 border-r border-slate-800/80 flex flex-col justify-between transition-all duration-300 z-40 ${
        isOpen ? 'w-64' : 'w-20'
      } fixed left-0 top-0 bottom-0 shadow-2xl`}
    >
      {/* Top Header & Brand Logo */}
      <div>
        <div className="flex items-center justify-between p-4 border-b border-slate-800/60">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-indigo-500/20 shrink-0">
              🎙️
            </div>
            {isOpen && (
              <div className="flex flex-col">
                <span className="font-black text-white text-base tracking-tight leading-none">
                  Moises<span className="text-indigo-400 font-light">Vocal</span>
                </span>
                <span className="text-[10px] text-slate-500 font-semibold tracking-wider uppercase mt-1">
                  AI Vocal Studio
                </span>
              </div>
            )}
          </div>

          {/* Toggle Sidebar Collapse Button */}
          <button
            onClick={onToggle}
            className="w-8 h-8 rounded-lg bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all shrink-0"
            title={isOpen ? 'Recolher Menu' : 'Expandir Menu'}
          >
            {isOpen ? '◀' : '▶'}
          </button>
        </div>

        {/* Navigation Sections */}
        <div className="p-3 space-y-6">
          {/* Main Navigation */}
          <div>
            {isOpen && (
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 mb-2 block">
                Produtos
              </span>
            )}
            <nav className="space-y-1">
              <button
                onClick={() => onSelectTab('repertoire')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'repertoire'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                    : 'hover:bg-slate-800/60 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="text-base">🎵</span>
                {isOpen && <span>Meu Repertório</span>}
              </button>

              <button
                onClick={() => onSelectTab('mixer')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'mixer'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                    : 'hover:bg-slate-800/60 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="text-base">🎛️</span>
                {isOpen && (
                  <div className="flex items-center justify-between w-full">
                    <span>Studio Mixer</span>
                    <span className="text-[9px] bg-indigo-950 text-indigo-400 border border-indigo-800/50 px-1.5 py-0.5 rounded font-mono font-bold">
                      DAW
                    </span>
                  </div>
                )}
              </button>
            </nav>
          </div>

          {/* Setlists / Folders Section */}
          {isOpen && (
            <div>
              <div className="flex items-center justify-between px-3 mb-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                  Setlists & Pastas
                </span>
                <button
                  onClick={onNewCategoryClick}
                  className="text-slate-400 hover:text-white text-xs font-bold"
                  title="Nova Pasta"
                >
                  +
                </button>
              </div>

              <div className="space-y-1">
                <button
                  onClick={() => onSelectCategory('all')}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    selectedCategory === 'all'
                      ? 'bg-slate-800 text-slate-100 font-bold'
                      : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-300'
                  }`}
                >
                  <span>📂</span>
                  <span className="truncate">Todas as Pastas</span>
                </button>

                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => onSelectCategory(cat.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                      selectedCategory === cat.id
                        ? 'bg-slate-800 text-slate-100 font-bold'
                        : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-300'
                    }`}
                  >
                    <span>{cat.icon || '📁'}</span>
                    <span className="truncate">{cat.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* User Profile Footer */}
      <div className="p-3 border-t border-slate-800/60 bg-[#0b0b0d]">
        {userProfile ? (
          <div className="flex items-center justify-between gap-2 overflow-hidden">
            <div className="flex items-center gap-3">
              <img
                src={userProfile.picture}
                alt={userProfile.name}
                className="w-8 h-8 rounded-full border border-indigo-500/40 shrink-0 object-cover"
              />
              {isOpen && (
                <div className="flex flex-col truncate">
                  <span className="text-xs font-bold text-white truncate">{userProfile.name}</span>
                  <span className="text-[10px] text-indigo-400 font-semibold truncate">Google Conectado</span>
                </div>
              )}
            </div>
            {isOpen && (
              <button
                onClick={onLogoutClick}
                className="text-slate-500 hover:text-rose-400 text-xs p-1 transition-colors"
                title="Sair"
              >
                🚪
              </button>
            )}
          </div>
        ) : (
          <div className="text-center">
            {isOpen ? (
              <span className="text-xs text-slate-500 font-medium block py-1">
                Conecte seu Google Drive para sincronização
              </span>
            ) : (
              <span className="text-lg">👤</span>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
