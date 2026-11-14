import { LIQUID_GLASS_SUPPORTED } from '@/lib/liquidGlass';
import { NATIVE_TABS } from '@/lib/navigation/tabBar';

/**
 * The "now playing" bar sits in the system tab bar's accessory slot (the
 * place Apple Music uses) where iOS has one: iOS 26+. Everywhere else it
 * keeps floating above the bar inside Erkunden.
 */
export const TAB_BAR_ACCESSORY = NATIVE_TABS && LIQUID_GLASS_SUPPORTED;
