import React from 'react';
import { UserProfile } from './GoogleLoginButton';
import { TrebleClefIcon } from './TrebleClefIcon';

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
      className={`sidebar-container bg-[#121212] text-[#a3a3a3] border-r border-[#2e2e2e] flex flex-col justify-between transition-all duration-300 z-50 fixed left-0 top-0 bottom-0 shadow-2xl ${
        isOpen
          ? 'w-64 opacity-100 translate-x-0'
          : 'w-0 opacity-0 -translate-x-full pointer-events-none overflow-hidden hidden'
      }`}
    >
      {/* Top Header & Brand Logo */}
      <div>
        <div className="flex items-center justify-between p-4 border-b border-[#2e2e2e]">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-[#1e1e1e] border border-[#2e2e2e] flex items-center justify-center text-[#2563eb] shadow-md shrink-0">
              <TrebleClefIcon className="w-6 h-6" color="#2563eb" />
            </div>
            <span className="font-extrabold text-white text-base tracking-tight leading-none truncate flex items-center">
              Treino&nbsp;<span className="text-[#3b82f6]">Vocal</span>
            </span>
          </div>

          {/* Toggle Sidebar Collapse Button */}
          <button
            onClick={onToggle}
            className="px-2.5 py-1.5 rounded-lg bg-[#1e1e1e] hover:bg-[#262626] text-[#a3a3a3] hover:text-white flex items-center gap-1 transition-all shrink-0 border border-[#2e2e2e] cursor-pointer text-xs font-bold"
            title="Recolher Menu Lateral"
          >
            <span>◀</span>
          </button>
        </div>

        {/* Navigation Sections */}
        <div className="p-4 space-y-6">
          {/* Main Navigation */}
          <div>
            <span className="text-[10px] font-bold text-[#737373] uppercase tracking-widest px-3 mb-2 block">
              Navegação Principal
            </span>
            <nav className="space-y-1.5">
              <button
                onClick={() => onSelectTab('repertoire')}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'repertoire'
                    ? 'bg-[#2563eb] text-white shadow-lg shadow-blue-600/30'
                    : 'hover:bg-[#1e1e1e] text-[#a3a3a3] hover:text-white'
                }`}
              >
                <span className="text-base">📂</span>
                <span>Meu Repertório</span>
              </button>

              <button
                onClick={() => onSelectTab('mixer')}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'mixer'
                    ? 'bg-[#2563eb] text-white shadow-lg shadow-blue-600/30'
                    : 'hover:bg-[#1e1e1e] text-[#a3a3a3] hover:text-white'
                }`}
              >
                <span className="text-base">🎛️</span>
                <span>Mesa de Som (Mixer)</span>
              </button>
            </nav>
          </div>

          {/* Setlists / Folders Section */}
          <div>
            <div className="flex items-center justify-between px-3 mb-2">
              <span className="text-[10px] font-bold text-[#737373] uppercase tracking-widest block">
                Pastas do Repertório
              </span>
              <button
                onClick={onNewCategoryClick}
                className="px-2 py-1 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-[11px] font-bold rounded-md transition-colors cursor-pointer"
                title="Nova Pasta"
              >
                + Criar
              </button>
            </div>

            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              <button
                onClick={() => onSelectCategory('all')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  selectedCategory === 'all'
                    ? 'bg-[#1e1e1e] text-white font-bold border border-[#2e2e2e]'
                    : 'text-[#a3a3a3] hover:bg-[#1e1e1e] hover:text-white'
                }`}
              >
                <span>📂</span>
                <span className="truncate">Todas as Pastas</span>
              </button>

              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => onSelectCategory(cat.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    selectedCategory === cat.id
                      ? 'bg-[#1e1e1e] text-white font-bold border border-[#2e2e2e]'
                      : 'text-[#a3a3a3] hover:bg-[#1e1e1e] hover:text-white'
                  }`}
                >
                  <span>{cat.icon || '📁'}</span>
                  <span className="truncate">{cat.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* User Profile Footer */}
      <div className="p-4 border-t border-[#2e2e2e] bg-[#0a0a0a]">
        {userProfile ? (
          <div className="flex items-center justify-between gap-2 overflow-hidden">
            <div className="flex items-center gap-3">
              <img
                src={userProfile.picture}
                alt={userProfile.name}
                className="w-8 h-8 rounded-full border border-[#2e2e2e] shrink-0 object-cover"
              />
              <div className="flex flex-col truncate">
                <span className="text-xs font-bold text-white truncate">{userProfile.name}</span>
                <span className="text-[10px] text-[#3b82f6] font-semibold truncate">Google Conectado</span>
              </div>
            </div>
            <button
              onClick={onLogoutClick}
              className="text-[#737373] hover:text-rose-400 text-xs p-1 transition-colors cursor-pointer"
              title="Sair"
            >
              🚪
            </button>
          </div>
        ) : (
          <div className="text-center">
            <span className="text-xs text-[#737373] font-medium block py-1">
              Conecte o Google Drive para Backup
            </span>
          </div>
        )}
      </div>
    </aside>
  );
};
