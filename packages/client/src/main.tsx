import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installAudio, setMusic } from './audio/bridge';
import { initPwa } from './pwa';
import './styles.css';

initPwa();
installAudio();
setMusic('audio.music-title');

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
