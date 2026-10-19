import React, { useState, useRef } from 'react';
import { GoogleLoginButton, UserProfile } from './GoogleLoginButton';

export interface GoogleSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile | null;
  onLoginSuccess: (user: UserProfile) => void;
  onLogout: () => void;
  onTriggerSync: () => void;
  isSyncing: boolean;
  syncStatusLog: string | null;
  onExportBackup?: () => void;
  onImportBackup?: (file: File) => Promise<{ success: boolean; count: number; error?: string }>;
}

export const GoogleSyncModal: React.FC<GoogleSyncModalProps> = ({
  isOpen,
  onClose,
  userProfile,
  onLoginSuccess,
  onLogout,
  onTriggerSync,
  isSyncing,
  syncStatusLog,
  onExportBackup,
  onImportBackup
}) => {
  const [showTroubleshooting, setShowTroubleshooting] = useState<boolean>(false);
  const [copiedOrigin, setCopiedOrigin] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  const copyOriginToClipboard = () => {
    if (navigator?.clipboard && currentOrigin) {
      navigator.clipboard.writeText(currentOrigin);
      setCopiedOrigin(true);
      setTimeout(() => setCopiedOrigin(false), 2500);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && onImportBackup) {
      try {
        setIsImporting(true);
        await onImportBackup(e.target.files[0]);
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-[#121318] border border-[#272b38] rounded-3xl max-w-xl w-full p-6 sm:p-8 text-left shadow-2xl relative my-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[#232530] pb-5">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#1c2230] border border-[#2b354f] flex items-center justify-center text-2xl text-[#00c2cb] shadow-sm">
              ☁️
            </div>
            <div>
              <h3 className="text-xl font-black text-white tracking-tight">
                Sincronização em Nuvem
              </h3>
              <p className="text-xs text-[#9ca3af]">
                Google Drive & Backup do Repertório
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-[#181a24] hover:bg-[#202330] border border-[#272b38] text-[#9ca3af] hover:text-white flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
            title="Fechar"
          >
            ✕
          </button>
        </div>

        {/* Section 1: Google Account Status */}
        <div className="space-y-3">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#71717a]">
            Status da Conta Google
          </span>

          {userProfile ? (
            /* Connected state */
            <div className="bg-[#181a24] border border-[#272b38] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 w-full sm:w-auto">
                {userProfile.picture ? (
                  <img
                    src={userProfile.picture}
                    alt={userProfile.name}
                    className="w-11 h-11 rounded-full object-cover border-2 border-[#00c2cb] shadow-sm shrink-0"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-[#00c2cb] text-black font-black text-base flex items-center justify-center shrink-0">
                    {userProfile.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-white truncate block">
                      {userProfile.name}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold shrink-0">
                      ● Conectado
                    </span>
                  </div>
                  <span className="text-xs text-[#9ca3af] truncate block">
                    {userProfile.email || 'Google Drive Ativo'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  onClick={onLogout}
                  className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  title="Desconectar do Google Drive"
                >
                  Desconectar
                </button>
              </div>
            </div>
          ) : (
            /* Disconnected state */
            <div className="bg-[#181a24] border border-[#272b38] rounded-2xl p-5 space-y-4">
              <p className="text-xs text-[#cbd5e1] leading-relaxed">
                Conecte seu Google Drive para que seu repertório, vozes separadas por IA e histórico fiquem salvos na sua própria nuvem, acessíveis em qualquer celular, tablet ou computador.
              </p>
              <div className="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <GoogleLoginButton
                  variant="header"
                  userProfile={userProfile}
                  onLoginSuccess={onLoginSuccess}
                  onLogout={onLogout}
                />
                <button
                  type="button"
                  onClick={() => {
                    const demoProfile: UserProfile = {
                      name: 'Ana Paula (Modo Local/Drive)',
                      email: 'anapaula.vocal@gmail.com',
                      picture: '',
                      accessToken: 'demo_token_local'
                    };
                    onLoginSuccess(demoProfile);
                  }}
                  className="px-4 py-3.5 bg-[#1c2230] hover:bg-[#252d40] text-[#00c2cb] border border-[#00c2cb]/30 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
                  title="Simular sincronização em nuvem sem precisar cadastrar no Google Cloud agora"
                >
                  <span>🧪</span>
                  <span>Modo Teste (Sem Google Cloud)</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Sync Action & Live Status Log */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#71717a]">
              Ação de Sincronização
            </span>
          </div>

          <button
            onClick={onTriggerSync}
            disabled={isSyncing}
            className="w-full py-4 px-6 bg-[#00c2cb] hover:bg-[#00adb5] active:bg-[#00969d] text-black font-black rounded-2xl text-sm flex items-center justify-center gap-3 transition-all shadow-md shadow-cyan-900/30 cursor-pointer disabled:opacity-50"
          >
            <span className={isSyncing ? 'animate-spin text-lg' : 'text-lg'}>🔄</span>
            <span>
              {isSyncing
                ? 'Sincronizando com o Google Drive...'
                : userProfile
                ? 'Sincronizar Agora com o Google Drive'
                : 'Conectar Conta e Sincronizar'}
            </span>
          </button>

          {/* Status feedback box */}
          {syncStatusLog && (
            <div className={`p-4 rounded-2xl border text-xs flex flex-col gap-2.5 shadow-inner ${
              syncStatusLog.includes('⚠️')
                ? 'bg-amber-950/20 border-amber-500/30 text-amber-200'
                : 'bg-[#14161f] border-[#272b38] text-[#cbd5e1]'
            }`}>
              <div className="flex items-center gap-3">
                <span className="text-base shrink-0">{isSyncing ? '🔄' : syncStatusLog.includes('⚠️') ? '⚠️' : '☁️'}</span>
                <span className="font-medium leading-relaxed break-words">{syncStatusLog}</span>
              </div>
              {syncStatusLog.includes('https://') && (
                <div className="pt-1">
                  <a
                    href={syncStatusLog.match(/https:\/\/[^\s]+/)?.[0] || 'https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=1002258145056'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#00c2cb] hover:bg-[#00adb5] text-black font-black text-xs rounded-xl transition-all cursor-pointer shadow-sm"
                  >
                    <span>🔗 Ativar Google Drive API no Console</span>
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section 3: Troubleshooting helper for Google OAuth (origin_mismatch and Drive API) */}
        <div className="border-t border-[#232530] pt-4">
          <button
            type="button"
            onClick={() => setShowTroubleshooting(!showTroubleshooting)}
            className="w-full flex items-center justify-between text-xs text-[#9ca3af] hover:text-[#00c2cb] transition-colors py-1 cursor-pointer font-bold"
          >
            <span className="flex items-center gap-2">
              <span>🔧</span>
              <span>Dificuldades para sincronizar? (Configurações Google Cloud)</span>
            </span>
            <span>{showTroubleshooting ? '▲' : '▼'}</span>
          </button>

          {showTroubleshooting && (
            <div className="mt-3 p-4 bg-[#14161f] border border-[#272b38] rounded-2xl space-y-4 text-xs text-[#a3a3a3]">
              {/* Item A: Google Drive API */}
              <div className="space-y-1.5 pb-2 border-b border-[#232530]">
                <span className="font-bold text-white block">1. Ativar a API do Google Drive (Essencial):</span>
                <p className="leading-relaxed text-[#9ca3af] text-[11px]">
                  Para salvar suas músicas e histórico na nuvem, o projeto no Google Cloud precisa estar com a API do Drive ativada:
                </p>
                <a
                  href="https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=1002258145056"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[#00c2cb] hover:underline font-bold text-[11px] pt-0.5"
                >
                  <span>🔗 Ativar Google Drive API no Projeto 1002258145056</span>
                </a>
              </div>

              {/* Item B: Origin Mismatch */}
              <div className="space-y-1.5">
                <span className="font-bold text-white block">2. Origem do Domínio (origin_mismatch / Erro 400):</span>
                <p className="leading-relaxed text-[11px]">
                  Caso veja a mensagem de <strong className="text-white">"origin_mismatch"</strong>, registre o domínio abaixo nas <em>Origens JavaScript autorizadas</em>:
                </p>

                <div className="bg-[#1c1f2b] p-3 rounded-xl border border-[#272b38] flex items-center justify-between gap-3">
                  <code className="text-[#00c2cb] font-mono select-all truncate text-[11px]">
                    {currentOrigin || window.location.origin}
                  </code>
                  <button
                    type="button"
                    onClick={copyOriginToClipboard}
                    className="px-3 py-1.5 bg-[#00c2cb] hover:bg-[#00adb5] text-black font-black text-xs rounded-lg transition-colors cursor-pointer shrink-0"
                  >
                    {copiedOrigin ? '✓ Copiado!' : 'Copiar URL'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Section 4: Offline Repertoire Backup (.json) Guarantee */}
        <div className="border-t border-[#232530] pt-4 space-y-3">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#71717a]">
            Backup Local (Garantia Offline)
          </span>
          <p className="text-xs text-[#9ca3af] leading-relaxed">
            Você também pode exportar ou restaurar um arquivo com todo o seu repertório diretamente no seu computador sem depender de internet:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {onExportBackup && (
              <button
                onClick={onExportBackup}
                className="py-3 px-4 bg-[#181a24] hover:bg-[#202330] active:bg-[#252838] text-white border border-[#272b38] rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>💾</span>
                <span>Exportar Backup (.json)</span>
              </button>
            )}

            {onImportBackup && (
              <label className="py-3 px-4 bg-[#181a24] hover:bg-[#202330] active:bg-[#252838] text-white border border-[#272b38] rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer text-center">
                <span>📥</span>
                <span>{isImporting ? 'Restaurando...' : 'Restaurar Backup (.json)'}</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={isImporting}
                />
              </label>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-[#202330] hover:bg-[#282c3d] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export default GoogleSyncModal;
