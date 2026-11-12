// Town-style line icons (24 grid, 1.75 stroke, currentColor). Lucide-shaped paths, drawn here (no dependency).
import type { ReactNode } from 'react';

function I({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

type P = { size?: number };
export const IconSearch = (p: P) => <I {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></I>;
export const IconMic = (p: P) => <I {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></I>;
export const IconWave = (p: P) => <I {...p}><path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4" /></I>;
export const IconPlus = (p: P) => <I {...p}><path d="M12 5v14M5 12h14" /></I>;
export const IconAt = (p: P) => <I {...p}><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" /></I>;
export const IconCapture = (p: P) => <I {...p}><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /></I>;
export const IconSidebar = (p: P) => <I {...p}><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></I>;
export const IconPanelRight = (p: P) => <I {...p}><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M15 4v16" /></I>;
export const IconChevronDown = (p: P) => <I {...p}><path d="m6 9 6 6 6-6" /></I>;
export const IconFilter = (p: P) => <I {...p}><path d="M4 6h16M7 12h10M10 18h4" /></I>;
export const IconBell = (p: P) => <I {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0" /></I>;
export const IconFile = (p: P) => <I {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></I>;
export const IconSend = (p: P) => <I {...p}><path d="M12 19V5M5 12l7-7 7 7" /></I>;
export const IconStop = (p: P) => <I {...p}><rect x="6" y="6" width="12" height="12" rx="2" /></I>;
export const IconLogout = (p: P) => <I {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></I>;
export const IconClose = (p: P) => <I {...p}><path d="M18 6 6 18M6 6l12 12" /></I>;
export const IconHelp = (p: P) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01" /></I>;
export const IconSettings = (p: P) => <I {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></I>;
export const IconCheck = (p: P) => <I {...p}><path d="M20 6 9 17l-5-5" /></I>;
