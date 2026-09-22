import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerServiceWorker } from './lib/offlineQueue';

if (import.meta.env.PROD) {
  void registerServiceWorker();
} else if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  // Un PWA enregistré en local casse Vite (cache de modules HMR).
  void navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const registration of regs) void registration.unregister();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
