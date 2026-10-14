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

  // Configure OAuth 2.0 flow requesting profile and mandatory Google Drive scopes (drive.file & drive.appdata)
  const login = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata',
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
      // Fallback for local development or unconfigured client ID: allow proceeding
      if (onClickBeforeLogin) onClickBeforeLogin();
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
    try {
      login();
    } catch (e) {
      console.warn('Google login popup error:', e);
      setIsLoggingIn(false);
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

  // Pill Variant styled EXACTLY like the attached image
  if (variant === 'pill') {
    return (
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
    );
  }

  // Header Default Variant
  return (
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
  );
};

export default GoogleLoginButton;
