import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadFonts } from './render/fonts';
import { StoreProvider } from './state/store';
import { App } from './ui/App';

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
});
