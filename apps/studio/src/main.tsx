import { installWebShim } from './web-shim';
// Must run before anything touches window.studio (engine, OnAir).
installWebShim();
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadFonts } from './render/fonts';
import { StoreProvider } from './state/store';
import { App } from './ui/App';
import { applyAccent, loadAccent } from './ui/shell/accent';
import { initTheme } from './ui/shell/theme';

// A file dropped anywhere on the window must never navigate the page (the renderer would
// unload and the MediaRecorder with it: dead stream). Drop zones that accept files call
// preventDefault themselves; everything else shows "not allowed" and swallows the drop.
document.addEventListener('dragover', (e) => {
  if (!e.defaultPrevented && e.dataTransfer) e.dataTransfer.dropEffect = 'none';
  e.preventDefault();
});
document.addEventListener('drop', (e) => e.preventDefault());

// Window chrome from the shell (installer ≥ 0.2.0): macOS glass + inset traffic lights.
{
  const ui = (window.studio as { ui?: { platform?: string; glass?: boolean } } | undefined)?.ui;
  if (ui?.glass) document.documentElement.classList.add('glass');
  if (ui?.platform === 'darwin') document.documentElement.classList.add('mac-inset');
}

// The user's appearance and primary colour before the first paint.
initTheme();
applyAccent(loadAccent());

// Fonts first: canvas text never triggers font loading, so the first program
// frame would otherwise air in the fallback face.
void loadFonts().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <StoreProvider>
        <App />
      </StoreProvider>
    </StrictMode>,
  );
  // Tells main this interface started (an over-the-air bundle that never gets here is rolled back).
  setTimeout(() => window.studio?.ota?.ready(), 1500);
});
