/**
 * Branded account switch: a full-screen overlay (Röbel mark + "Wechsle zu {Name}") covers the
 * switch, holds for at least MIN_VISIBLE_MS, then lands on the new account's Profil.
 * Pure timing/decision logic lives in lib/account-switch-flow.ts.
 */
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { usePathname } from 'expo-router';
import { useAccount } from '@/context/AccountContext';
import { useUser } from '@/context/UserContext';
import { useSnackbar } from '@/context/SnackbarContext';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import RoebelLogo from '@/components/brand/RoebelLogo';
import {
  createSwitchRunner,
  OVERLAY_FADE_IN_MS,
  OVERLAY_FADE_OUT_MS,
} from '@/lib/account-switch-flow';
import { goToTab } from '@/lib/navigation/goToTab';

type FlowValue = { switchTo: (accountId: string) => Promise<void>; isSwitching: boolean };

const AccountSwitchFlowContext = createContext<FlowValue>({ switchTo: async () => {}, isSwitching: false });

export function useAccountSwitchFlow(): FlowValue {
  return useContext(AccountSwitchFlowContext);
}

export function AccountSwitchFlowProvider({ children }: { children: React.ReactNode }) {
  const { switchAccount, ownedAccounts } = useAccount();
  const { user } = useUser();
  const { showSnackbar } = useSnackbar();
  const pathname = usePathname();
  const [target, setTarget] = useState<string | null>(null);

  // The runner is created once; it reads the latest values through refs.
  const latest = useRef({ switchAccount, pathname, showSnackbar });
  latest.current = { switchAccount, pathname, showSnackbar };

  const runner = useMemo(
    () =>
      createSwitchRunner({
        switchAccount: (id) => latest.current.switchAccount(id),
        now: () => Date.now(),
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
        onStart: (id) => setTarget(id),
        onDone: () => {
          // Profil exists in every shell; the bar recomputes from the new account on its own.
          goToTab('profile', latest.current.pathname);
          setTarget(null);
        },
        onError: () => {
          setTarget(null);
          latest.current.showSnackbar({ message: 'Wechsel fehlgeschlagen' });
        },
      }),
    []
  );

  const switchTo = useCallback((id: string) => runner.run(id), [runner]);

  const targetAccount = target ? ownedAccounts.find((a) => a.id === target) : null;
  const targetName =
    targetAccount?.account_type === 'personal'
      ? user?.display_name || user?.username || targetAccount?.name
      : targetAccount?.name;

  const value = useMemo(() => ({ switchTo, isSwitching: target !== null }), [switchTo, target]);

  return (
    <AccountSwitchFlowContext.Provider value={value}>
      {children}
      {target ? <SwitchOverlay name={targetName ?? null} /> : null}
    </AccountSwitchFlowContext.Provider>
  );
}

function SwitchOverlay({ name }: { name: string | null }) {
  const { colors } = useTheme();
  return (
    <Animated.View
      entering={FadeIn.duration(OVERLAY_FADE_IN_MS)}
      exiting={FadeOut.duration(OVERLAY_FADE_OUT_MS)}
      style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.background }]}
      accessibilityViewIsModal
      accessibilityLiveRegion="polite"
    >
      <View style={styles.center}>
        <RoebelLogo size={88} />
        <Text style={[styles.text, { color: colors.textPrimary }]} numberOfLines={2}>
          {name ? `Wechsle zu ${name}` : 'Account wird gewechselt'}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { zIndex: 1000, elevation: 1000, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', paddingHorizontal: 32, marginTop: 120 },
  text: { marginTop: 24, fontFamily: fontFamily.semiBold, fontSize: 22, textAlign: 'center' },
});
