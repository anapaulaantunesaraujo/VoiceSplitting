import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import { GoogleOAuthProvider } from '@react-oauth/google';

// Register PWA service worker with auto update strategy
registerSW({ immediate: true });

// Demo Google OAuth Client ID (Users can provide their own Client ID via env or replace here)
const GOOGLE_CLIENT_ID = '1082987163829-demo123456789voicesplittingpwa.apps.googleusercontent.com';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  </React.StrictMode>
);
