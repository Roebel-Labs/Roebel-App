import type { TextStyle, ViewStyle } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';

/**
 * Chat-suite tokens. Light values are sampled 1:1 from the reference
 * screenshots (Grok Bot, @3x → pt); dark values are derived counterparts.
 */
export const chatLightTokens = {
  background: '#FDFDFD',
  surface: '#FFFFFF',
  bubbleBot: '#F3F3F3',
  bubbleBotText: '#000000',
  bubbleUser: '#000000',
  bubbleUserText: '#FFFFFF',
  textPrimary: '#000000',
  textSecondary: '#8A8A8E',
  textTertiary: '#B4B4B8',
  chipBackground: '#F3F3F5',
  chipText: '#8A8A8E',
  optionBox: '#FDFDFD',
  optionBorder: '#ECECEE',
  optionLetterBg: '#F3F3F3',
  optionLetterText: '#B0B0B4',
  fileBadgeBg: '#E4E4E4',
  fileBadgeText: '#6E6E73',
  check: '#3FA465',
  paywallCheck: '#1F7A4D',
  online: '#41A367',
  link: '#1A6BE8',
  newDivider: '#3D78D8',
  newDividerLine: '#9DB6DD',
  micBackground: '#EEEDF0',
  micIcon: '#707075',
  placeholder: '#B5B5BA',
  recordingBg: '#FDEBEA',
  recordingRed: '#CC2C34',
  primaryButton: '#000000',
  primaryButtonText: '#FFFFFF',
  disabledButton: '#8E8E8E',
  groupedBackground: '#F3F3F3',
  separator: '#E6E6E8',
  sheetBackground: '#FFFFFF',
  closeCircle: '#F3F3F3',
  initialsBg: '#EDEDF0',
  initialsText: '#6F6F75',
  icon: '#000000',
  backdrop: 'rgba(0,0,0,0.25)',
  computerBackground: '#000000',
  /** The very soft, wide halo under every floating white control. */
  halo: '0px 6px 28px rgba(0,0,0,0.08)',
  haloStrong: '0px 10px 36px rgba(0,0,0,0.12)',
} as const;

export type ChatTokens = { [K in keyof typeof chatLightTokens]: string };

export const chatDarkTokens: ChatTokens = {
  background: '#0B0B0C',
  surface: '#1C1C1E',
  bubbleBot: '#1F1F22',
  bubbleBotText: '#F5F5F7',
  bubbleUser: '#FFFFFF',
  bubbleUserText: '#000000',
  textPrimary: '#F5F5F7',
  textSecondary: '#9A9AA0',
  textTertiary: '#6C6C72',
  chipBackground: '#26262A',
  chipText: '#9A9AA0',
  optionBox: '#161618',
  optionBorder: '#2C2C30',
  optionLetterBg: '#26262A',
  optionLetterText: '#6C6C72',
  fileBadgeBg: '#2E2E32',
  fileBadgeText: '#A0A0A6',
  check: '#4CC07A',
  paywallCheck: '#4CC07A',
  online: '#41A367',
  link: '#5A9BFF',
  newDivider: '#6F9EEB',
  newDividerLine: '#3A5680',
  micBackground: '#2A2A2E',
  micIcon: '#A0A0A6',
  placeholder: '#6C6C72',
  recordingBg: '#3A1C1E',
  recordingRed: '#FF5A60',
  primaryButton: '#FFFFFF',
  primaryButtonText: '#000000',
  disabledButton: '#4A4A4E',
  groupedBackground: '#1F1F22',
  separator: '#2C2C30',
  sheetBackground: '#141416',
  closeCircle: '#26262A',
  initialsBg: '#26262A',
  initialsText: '#A0A0A6',
  icon: '#F5F5F7',
  backdrop: 'rgba(0,0,0,0.55)',
  computerBackground: '#000000',
  halo: '0px 6px 28px rgba(0,0,0,0.5)',
  haloStrong: '0px 10px 36px rgba(0,0,0,0.6)',
};

export function useChatTokens(): ChatTokens {
  const { isDark } = useTheme();
  return isDark ? chatDarkTokens : chatLightTokens;
}

export function haloShadow(t: ChatTokens, strong = false): ViewStyle {
  return { boxShadow: strong ? t.haloStrong : t.halo } as ViewStyle;
}

/** Sizes measured from the references (pt). */
export const chatSize = {
  control: 44,
  controlInset: 18,
  bubbleRadius: 22,
  bubbleMaxWidth: '80%',
  bubblePadH: 14,
  bubblePadV: 11,
  screenPadH: 16,
  listAvatar: 42,
  pillButtonHeight: 44,
} as const;

export const chatFont = {
  regular: fontFamily.regular,
  medium: fontFamily.medium,
  semiBold: fontFamily.semiBold,
  bold: fontFamily.bold,
} as const;

export const chatType = {
  body: { fontFamily: fontFamily.regular, fontSize: 17, lineHeight: 22 } as TextStyle,
  bodyMedium: { fontFamily: fontFamily.medium, fontSize: 17, lineHeight: 22 } as TextStyle,
  secondary: { fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 21 } as TextStyle,
  caption: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 18 } as TextStyle,
  small: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 17 } as TextStyle,
};
