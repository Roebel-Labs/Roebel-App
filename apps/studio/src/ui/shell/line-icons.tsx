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
export const IconPencil = (p: P) => <I {...p}><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></I>;
export const IconLoop = (p: P) => <I {...p}><path d="M17 3l3 3-3 3M20 6H8a4 4 0 0 0-4 4v1M7 21l-3-3 3-3M4 18h12a4 4 0 0 0 4-4v-1" /></I>;
export const IconLink = (p: P) => <I {...p}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></I>;
export const IconMore = (p: P) => <I {...p}><path d="M6 12h.01M12 12h.01M18 12h.01" strokeWidth={3} /></I>;
export const IconCopy = (p: P) => <I {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></I>;
export const IconUpload = (p: P) => <I {...p}><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></I>;
export const IconRefresh = (p: P) => <I {...p}><path d="M20 11a8 8 0 0 0-14.3-4.3L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.3L20 16M20 20v-4h-4" /></I>;
export const IconTrash = (p: P) => <I {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></I>;
export const IconChat = (p: P) => <I {...p}><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z" /></I>;
export const IconFolder = (p: P) => <I {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></I>;
export const IconClock = (p: P) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></I>;
export const IconPlug = (p: P) => <I {...p}><path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4" /></I>;
export const IconScroll = (p: P) => <I {...p}><path d="M8 4h11v13a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-1h10v1a2 2 0 0 0 2 2M8 4a2 2 0 0 0-2 2v10M11 9h5M11 13h5" /></I>;
export const IconInbox = (p: P) => <I {...p}><path d="M4 13 6.5 5h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 13h4.5a3.5 3.5 0 0 0 7 0H20" /></I>;
export const IconMail = (p: P) => <I {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 8 9 6 9-6" /></I>;
export const IconCalendar = (p: P) => <I {...p}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></I>;
export const IconList = (p: P) => <I {...p}><path d="M10 6h10M10 12h10M10 18h10M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17" /></I>;
export const IconSun = (p: P) => <I {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19" /></I>;
export const IconNews = (p: P) => <I {...p}><path d="M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2h-1M8 9h5M8 13h5M8 16h3" /></I>;
export const IconRadar = (p: P) => <I {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><path d="M12 12 18.5 5.5" /></I>;
export const IconPeople = (p: P) => <I {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></I>;
export const IconChart = (p: P) => <I {...p}><path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3" /></I>;
export const IconHandshake = (p: P) => <I {...p}><path d="m3 11 4-4 4 1 2-1 4 0 4 4M7 15l3 3 2-1 2 2 5-5M3 11l4 4M21 11l-2 3" /></I>;
export const IconImage = (p: P) => <I {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m4 18 5-5 4 4 3-3 4 4" /></I>;
