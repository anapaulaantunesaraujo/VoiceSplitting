import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import { GoogleOAuthProvider } from '@react-oauth/google';

// Register PWA service worker with auto update strategy
registerSW({ immediate: true });

// Google OAuth Client ID read from environment variable (.env) or fallback to demo ID
const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '1082987163829-demo123456789voicesplittingpwa.apps.googleusercontent.com';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  </React.StrictMode>
);
