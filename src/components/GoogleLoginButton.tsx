import React, { useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';

export interface UserProfile {
  name: string;
  email: string;
  picture: string;
  accessToken: string;
}

interface GoogleLoginButtonProps {
  onLoginSuccess: (user: UserProfile) => void;
  onLogout?: () => void;
  onClickBeforeLogin?: () => void;
  variant?: 'pill' | 'header';
}

export const GoogleLoginButton: React.FC<GoogleLoginButtonProps> = ({
  onLoginSuccess,
  onLogout,
  onClickBeforeLogin,
  variant = 'header'
}) => {
  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('voicesplit_user_profile');
    return saved ? JSON.parse(saved) : null;
  });
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  const [showHelperModal, setShowHelperModal] = useState<boolean>(false);
  const [copiedOrigin, setCopiedOrigin] = useState<boolean>(false);

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  // Configure OAuth 2.0 flow requesting profile and mandatory Google Drive scopes (drive.file & drive.appdata)
  const login = useGoogleLogin({
    scope:
      'https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata',
    onSuccess: async (tokenResponse) => {
      try {
        setIsLoggingIn(true);
        const accessToken = tokenResponse.access_token;

        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        });
        const profileData = await res.json();

        const profile: UserProfile = {
          name: profileData.name || 'Usuário Google',
          email: profileData.email || '',
          picture: profileData.picture || '',
          accessToken
        };

        setUser(profile);
        localStorage.setItem('voicesplit_user_profile', JSON.stringify(profile));
        setShowHelperModal(false);
        onLoginSuccess(profile);
      } catch (err) {
        console.error('Erro ao buscar perfil do Google:', err);
      } finally {
        setIsLoggingIn(false);
      }
    },
    onError: (error) => {
      console.error('Falha na autenticação do Google:', error);
      setIsLoggingIn(false);
      setShowHelperModal(true);
      if (onClickBeforeLogin) onClickBeforeLogin();
    },
    onNonOAuthError: (error) => {
      console.warn('Google pop-up não retornou autenticação:', error);
      setIsLoggingIn(false);
      if (error?.type === 'popup_closed') {
        setShowHelperModal(true);
      }
    }
  });

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('voicesplit_user_profile');
    if (onLogout) onLogout();
  };

  const handleClick = () => {
    if (onClickBeforeLogin) {
      onClickBeforeLogin();
    }
    setIsLoggingIn(true);

    // Failsafe timeout para liberar o botão caso o popup seja bloqueado pelo navegador
    setTimeout(() => {
      setIsLoggingIn(false);
    }, 12000);

    try {
      login();
    } catch (e) {
      console.warn('Google login popup error:', e);
      setIsLoggingIn(false);
      setShowHelperModal(true);
    }
  };

  const copyOriginToClipboard = () => {
    if (navigator?.clipboard && currentOrigin) {
      navigator.clipboard.writeText(currentOrigin);
      setCopiedOrigin(true);
      setTimeout(() => setCopiedOrigin(false), 2500);
    }
  };

  if (user) {
    return (
      <div className="flex items-center justify-between gap-3 bg-[#121212] border border-[#2e2e2e] px-4 py-2.5 rounded-xl shadow-md">
        <div className="flex items-center gap-3 truncate">
          {user.picture && (
            <img
              src={user.picture}
              alt={user.name}
              className="w-7 h-7 rounded-full object-cover border border-[#2e2e2e] shrink-0"
            />
          )}
          <div className="text-left truncate">
            <p className="text-xs font-bold text-white leading-tight truncate">{user.name}</p>
            <p className="text-[10px] text-[#3b82f6] font-medium truncate">Google Drive Sincronizado</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs text-[#737373] hover:text-rose-400 font-bold transition-colors cursor-pointer shrink-0"
        >
          Sair
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Pill Variant styled for splash screen */}
      {variant === 'pill' ? (
        <div className="w-full flex flex-col items-center gap-2">
          <button
            onClick={handleClick}
            disabled={isLoggingIn}
            className="w-full max-w-sm py-4 px-6 bg-[#fde8f3] hover:bg-[#fbcfe8] active:bg-[#f9a8d4] text-[#1f1f1f] rounded-full text-base font-semibold transition-all shadow-xl flex items-center justify-center gap-4 cursor-pointer border border-[#fbcfe8]/50 disabled:opacity-50"
          >
            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            </div>
            <span className="text-[#1f1f1f] font-semibold text-base">
              {isLoggingIn ? 'Entrando com Google...' : 'Sign in with Google'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setShowHelperModal(true)}
            className="text-[11px] text-[#737373] hover:text-[#3b82f6] underline cursor-pointer transition-colors"
          >
            Erro ao logar? (Erro 400: origin_mismatch)
          </button>
        </div>
      ) : (
        /* Header Default Variant */
        <div className="flex items-center gap-2">
          <button
            onClick={handleClick}
            disabled={isLoggingIn}
            className="px-4 py-3 bg-[#121212] hover:bg-[#1e1e1e] active:bg-[#262626] text-white border border-[#2e2e2e] rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2.5 cursor-pointer disabled:opacity-50"
          >
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>{isLoggingIn ? 'Conectando...' : 'Google Drive Sync'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowHelperModal(true)}
            className="w-8 h-8 rounded-xl bg-[#121212] border border-[#2e2e2e] text-[#737373] hover:text-[#3b82f6] hover:border-[#3b82f6] text-xs font-bold transition-all flex items-center justify-center cursor-pointer"
            title="Como configurar o Google OAuth e corrigir origin_mismatch"
          >
            ?
          </button>
        </div>
      )}

      {/* Modal Didático para resolver Erro 400: origin_mismatch */}
      {showHelperModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141416] border border-[#2e2e2e] rounded-3xl max-w-lg w-full p-6 text-left shadow-2xl relative animate-in fade-in duration-200">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">⚠️</span>
                <div>
                  <h3 className="text-base font-bold text-white">Como resolver: Erro 400 origin_mismatch</h3>
                  <p className="text-xs text-[#a3a3a3]">Autorização do Google Cloud para o seu domínio</p>
                </div>
              </div>
              <button
                onClick={() => setShowHelperModal(false)}
                className="text-[#737373] hover:text-white text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#d4d4d4] leading-relaxed mb-4">
              O Google bloqueia o login se a URL exata em que você está navegando não estiver cadastrada nas{' '}
              <strong className="text-white font-semibold">Origens JavaScript autorizadas</strong> do seu ID de Cliente OAuth 2.0.
            </p>

            {/* Caixa com a URL atual e botão de cópia */}
            <div className="bg-[#1c1c1e] border border-[#2e2e2e] rounded-xl p-3 mb-4">
              <span className="text-[10px] uppercase font-bold text-[#737373] block mb-1">
                Sua URL de Origem Atual:
              </span>
              <div className="flex items-center justify-between gap-2">
                <code className="text-xs font-mono text-[#3b82f6] select-all break-all">
                  {currentOrigin || window.location.origin}
                </code>
                <button
                  type="button"
                  onClick={copyOriginToClipboard}
                  className="px-3 py-1.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-lg text-xs font-bold shrink-0 transition-colors cursor-pointer"
                >
                  {copiedOrigin ? '✓ Copiado!' : 'Copiar URL'}
                </button>
              </div>
            </div>

            {/* Passo a Passo */}
            <ol className="text-xs text-[#a3a3a3] space-y-2 list-decimal list-inside mb-6 leading-relaxed">
              <li>
                Acesse o{' '}
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#3b82f6] underline hover:text-blue-400 font-semibold"
                >
                  Google Cloud Console (Credenciais)
                </a>
              </li>
              <li>
                Em <strong className="text-white">IDs do cliente OAuth 2.0</strong>, clique no seu cliente Web.
              </li>
              <li>
                Na seção <strong className="text-white">Origens JavaScript autorizadas</strong>, clique em{' '}
                <strong className="text-white">+ Adicionar URI</strong> e cole a URL acima (ex:{' '}
                <code className="text-white">{currentOrigin}</code>).
              </li>
              <li>
                Clique em <strong className="text-white">Salvar</strong>. *(O Google pode levar de 2 a 5 minutos para propagar a alteração).*
              </li>
            </ol>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#2e2e2e]">
              <button
                type="button"
                onClick={() => setShowHelperModal(false)}
                className="px-5 py-2.5 bg-[#262626] hover:bg-[#333333] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Entendido / Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default GoogleLoginButton;
