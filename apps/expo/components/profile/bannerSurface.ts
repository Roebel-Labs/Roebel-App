import type { ViewStyle } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { haloShadow, useChatTokens } from '@/components/chat/tokens';
import { softShadow } from '@/lib/shadow';

/**
 * Card surface for the profile banners (KI Helfer, Abzeichen, Sponsoring): in dim/dark the agent
 * chat's "Für dich" card (chat surface + halo), in light white with a soft shadow and a very light
 * grey hairline.
 */
export function useBannerSurface(): ViewStyle {
  const { variant } = useTheme();
  const t = useChatTokens();
  if (variant === 'light') {
    return { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EEEEEF', ...softShadow(2, false) };
  }
  return { backgroundColor: t.surface, ...haloShadow(t) };
}
