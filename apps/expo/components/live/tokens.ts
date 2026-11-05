// The live room is always dark (video app), whatever the app theme: one fixed palette.
import { fontFamily } from '@/constants/theme';

export const LIVE = {
  bg: '#18191B',
  surface: '#202226',
  surfaceRaised: '#2A2C31',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',
  text: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.66)',
  textTertiary: 'rgba(255,255,255,0.42)',
  navy: '#00498B',
  navyBright: '#1E6BB8',
  accent: '#7ABBF2',
  red: '#E5484D',
  gold: '#F2C14E',
  goldSoft: 'rgba(242,193,78,0.14)',
  scrim: 'rgba(0,0,0,0.55)',
} as const;

export const F = fontFamily;
