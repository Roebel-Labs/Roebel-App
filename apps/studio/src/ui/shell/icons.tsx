// Line icons for the rail (24 px grid, 1.75 stroke, currentColor).

const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function HomeIcon() {
  return (
    <svg {...base}>
      <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />
    </svg>
  );
}

export function LiveIcon() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="2" />
      <path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.4 5.4a9.3 9.3 0 0 0 0 13.2M18.6 5.4a9.3 9.3 0 0 1 0 13.2" />
    </svg>
  );
}

export function AppsIcon() {
  return (
    <svg {...base}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <path d="M16.75 13.5v6.5M13.5 16.75H20" />
    </svg>
  );
}

export function ForYouIcon() {
  return (
    <svg {...base}>
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.8 10.6c.6.5.8 1.1.8 1.9h6c0-.8.2-1.4.8-1.9A6 6 0 0 0 12 3z" />
    </svg>
  );
}

export function SkillsIcon() {
  return (
    <svg {...base}>
      <path d="M13 3 5 13.5h6L10 21l8-10.5h-6z" />
    </svg>
  );
}

export function WikiIcon() {
  return (
    <svg {...base}>
      <path d="M12 6.5C10.5 5 8.5 4.5 4 4.5v13c4.5 0 6.5.5 8 2 1.5-1.5 3.5-2 8-2v-13c-4.5 0-6.5.5-8 2zM12 6.5v13" />
    </svg>
  );
}

export function LibraryIcon() {
  return (
    <svg {...base}>
      <path d="M5 4v16M9.5 4v16M5 20h4.5M5 4h4.5M13.5 7.5l4.5 12.2 2-.7-4.5-12.2z" />
    </svg>
  );
}

export const SECTION_ICONS = {
  home: HomeIcon,
  foryou: ForYouIcon,
  skills: SkillsIcon,
  wiki: WikiIcon,
  library: LibraryIcon,
  live: LiveIcon,
  apps: AppsIcon,
} as const;
