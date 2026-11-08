import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/cormorant-garamond';
import '@fontsource-variable/manrope';
import '@fontsource-variable/noto-serif-sc';
import '@/styles/global.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
